import { marketAbi, marketPositionsAbi, publisherAbi } from "./abi";
import { addresses, executorClient, publicClient, type Env } from "./chain";

export interface KeeperRun {
  at: number;
  scanned: number;
  executed: { id: string; tx: string }[];
  failed: { id: string; error: string }[];
  published?: { id: string; tx: string }[];
}

const MAX_PUBLISH_PER_RUN = 10;

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

  const run: KeeperRun = { at: Date.now(), scanned: Number(nextId), executed: [], failed: [], published: [] };
  const toPublish = await unpublishedClosed(env, nextId);
  if (due.length === 0 && toPublish.length === 0) return run;

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

  // Positions the keeper closed this run are picked up for publishing on the next run.
  for (const id of toPublish) {
    try {
      const tx = await writer.writeContract({
        address: addresses.receiptPublisher!,
        abi: publisherAbi,
        functionName: "publish",
        args: [id],
        nonce: nonce++,
      });
      run.published!.push({ id: id.toString(), tx });
    } catch (e) {
      run.failed.push({ id: id.toString(), error: `publish: ${(e as Error).message.slice(0, 180)}` });
    }
  }
  return run;
}

/// Closed positions whose result has not yet been sent to the Pocket L1 over ICM.
async function unpublishedClosed(env: Env, nextId: bigint): Promise<bigint[]> {
  if (!addresses.receiptPublisher || nextId === 0n) return [];
  const reader = publicClient(env);
  const ids = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
  const [positions, published] = await Promise.all([
    reader.multicall({
      contracts: ids.map((id) => ({
        address: addresses.market,
        abi: marketPositionsAbi,
        functionName: "positions" as const,
        args: [id] as const,
      })),
    }),
    reader.multicall({
      contracts: ids.map((id) => ({
        address: addresses.receiptPublisher!,
        abi: publisherAbi,
        functionName: "messageIdOf" as const,
        args: [id] as const,
      })),
    }),
  ]);
  const zero = `0x${"0".repeat(64)}`;
  return ids
    .filter((_, i) => {
      const p = positions[i];
      const m = published[i];
      return p.status === "success" && !p.result[2] && p.result[10] > 0n && m.status === "success" && m.result === zero;
    })
    .slice(0, MAX_PUBLISH_PER_RUN);
}
