import { marketAbi } from "./abi";
import { addresses, executorClient, publicClient, type Env } from "./chain";

export interface KeeperRun {
  at: number;
  scanned: number;
  executed: { id: string; tx: string }[];
  failed: { id: string; error: string }[];
}

const CHUNK = 200;

/// Finds positions whose take-profit or stop-loss the oracle has crossed and executes them.
/// The contract re-checks the condition and pays the position owner, so this key only spends gas.
export async function runKeeper(env: Env): Promise<KeeperRun> {
  const reader = publicClient(env);
  const nextId = await reader.readContract({ address: addresses.market, abi: marketAbi, functionName: "nextId" });

  const due: bigint[] = [];
  for (let start = 0n; start < nextId; start += BigInt(CHUNK)) {
    const ids: bigint[] = [];
    for (let id = start; id < nextId && id < start + BigInt(CHUNK); id++) ids.push(id);
    const results = await reader.multicall({
      contracts: ids.map((id) => ({
        address: addresses.market,
        abi: marketAbi,
        functionName: "triggerReached" as const,
        args: [id] as const,
      })),
    });
    results.forEach((r, i) => {
      if (r.status === "success" && r.result) due.push(ids[i]);
    });
  }

  const run: KeeperRun = { at: Date.now(), scanned: Number(nextId), executed: [], failed: [] };
  if (due.length === 0) return run;

  const writer = executorClient(env);
  let nonce = await writer.getTransactionCount({ address: writer.account.address, blockTag: "pending" });
  for (const id of due) {
    try {
      const tx = await writer.writeContract({
        address: addresses.market,
        abi: marketAbi,
        functionName: "executeTrigger",
        args: [id],
        nonce: nonce++,
      });
      run.executed.push({ id: id.toString(), tx });
    } catch (e) {
      run.failed.push({ id: id.toString(), error: (e as Error).message.slice(0, 200) });
    }
  }
  return run;
}
