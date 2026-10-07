import {
  createPublicClient,
  createWalletClient,
  http,
  parseSignature,
  type Address,
  type Hash,
  type LocalAccount,
} from "viem";
import { erc20Abi, marketAbi, priceSourceAbi, publisherAbi } from "./abi";
import { addresses, chain, RPC_URL } from "./config";

export const reader = createPublicClient({ chain, transport: http(RPC_URL) });

function writer(account: LocalAccount) {
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

export interface Price {
  price: bigint; // 8 decimals
  updatedAt: number; // ms
}

export interface Balances {
  usd: bigint; // pUSD, 6 decimals
  usdc: bigint; // 6 decimals
  gas: bigint; // wei
}

export interface Position {
  id: bigint;
  isLong: boolean;
  open: boolean;
  openedAt: number;
  margin: bigint;
  entryPrice: bigint;
  takeProfit: bigint;
  stopLoss: bigint;
  exitPrice: bigint;
  payout: bigint;
  closedAt: number;
  closedByTrigger: boolean;
  value?: bigint; // what it would pay now, for open positions
  receiptMessageId?: string; // set once the result was sent to the Pocket L1 over ICM
}

export async function getPrice(): Promise<Price> {
  const [price, updatedAt] = await reader.readContract({
    address: addresses.priceSource,
    abi: priceSourceAbi,
    functionName: "latest",
  });
  return { price, updatedAt: Number(updatedAt) * 1000 };
}

export async function getBalances(owner: Address): Promise<Balances> {
  const [usd, usdc, gas] = await Promise.all([
    reader.readContract({ address: addresses.pocketUSD, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    reader.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    reader.getBalance({ address: owner }),
  ]);
  return { usd, usdc, gas };
}

export async function getPositions(owner: Address): Promise<Position[]> {
  const ids = await reader.readContract({
    address: addresses.market,
    abi: marketAbi,
    functionName: "positionsOf",
    args: [owner],
  });
  if (ids.length === 0) return [];

  const rows = await reader.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({
      address: addresses.market,
      abi: marketAbi,
      functionName: "positions" as const,
      args: [id] as const,
    })),
  });

  const positions: Position[] = rows.map((r, i) => ({
    id: ids[i],
    isLong: r[1],
    open: r[2],
    openedAt: Number(r[3]) * 1000,
    margin: r[4],
    entryPrice: r[5],
    takeProfit: r[6],
    stopLoss: r[7],
    exitPrice: r[8],
    payout: r[9],
    closedAt: Number(r[10]) * 1000,
    closedByTrigger: r[11],
  }));

  const open = positions.filter((p) => p.open);
  if (open.length > 0) {
    const quotes = await reader.multicall({
      contracts: open.map((p) => ({
        address: addresses.market,
        abi: marketAbi,
        functionName: "quote" as const,
        args: [p.id] as const,
      })),
    });
    quotes.forEach((q, i) => {
      if (q.status === "success") open[i].value = q.result[0];
    });
  }
  const closed = positions.filter((p) => !p.open);
  const publisher = addresses.receiptPublisher;
  if (publisher && closed.length > 0) {
    const ids = await reader.multicall({
      contracts: closed.map((p) => ({
        address: publisher,
        abi: publisherAbi,
        functionName: "messageIdOf" as const,
        args: [p.id] as const,
      })),
    });
    ids.forEach((r, i) => {
      if (r.status === "success" && BigInt(r.result) !== 0n) closed[i].receiptMessageId = r.result;
    });
  }
  return positions.sort((a, b) => Number(b.id - a.id));
}

/// Take-profit and stop-loss as a symmetric percentage move of the asset price.
export function ruleLevels(isLong: boolean, price: bigint, pct: number): { tp: bigint; sl: bigint } {
  if (pct <= 0) return { tp: 0n, sl: 0n };
  const bps = BigInt(Math.round(pct * 100));
  const up = (price * (10_000n + bps)) / 10_000n;
  const down = (price * (10_000n - bps)) / 10_000n;
  return isLong ? { tp: up, sl: down } : { tp: down, sl: up };
}

/// One transaction: the permit signature rides along with the open, so a new user
/// never sends a separate approval.
export async function openPosition(
  account: LocalAccount,
  isLong: boolean,
  margin: bigint,
  tp: bigint,
  sl: bigint,
): Promise<{ hash: Hash; id?: bigint }> {
  const nonce = await reader.readContract({
    address: addresses.pocketUSD,
    abi: erc20Abi,
    functionName: "nonces",
    args: [account.address],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const signature = await account.signTypedData({
    domain: { name: "Pocket USD", version: "1", chainId: chain.id, verifyingContract: addresses.pocketUSD },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner: account.address, spender: addresses.market, value: margin, nonce, deadline },
  });
  const { v, r, s, yParity } = parseSignature(signature);

  const hash = await writer(account).writeContract({
    address: addresses.market,
    abi: marketAbi,
    functionName: "openWithPermit",
    args: [isLong, margin, tp, sl, deadline, Number(v ?? BigInt(yParity + 27)), r, s],
  });
  await reader.waitForTransactionReceipt({ hash });
  return { hash };
}

export async function closePosition(account: LocalAccount, id: bigint): Promise<Hash> {
  const hash = await writer(account).writeContract({
    address: addresses.market,
    abi: marketAbi,
    functionName: "close",
    args: [id],
  });
  await reader.waitForTransactionReceipt({ hash });
  return hash;
}

export async function setRule(account: LocalAccount, id: bigint, tp: bigint, sl: bigint): Promise<Hash> {
  const hash = await writer(account).writeContract({
    address: addresses.market,
    abi: marketAbi,
    functionName: "setTriggers",
    args: [id, tp, sl],
  });
  await reader.waitForTransactionReceipt({ hash });
  return hash;
}
