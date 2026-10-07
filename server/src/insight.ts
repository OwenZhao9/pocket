import { aggregatorAbi } from "./abi";
import { addresses, publicClient, type Env } from "./chain";

const ROUNDS = 13; // ~2 hours at the feed's 10-minute cadence

/// A plain-language read of the last two hours of the same oracle the market settles on.
export async function marketInsight(env: Env) {
  const client = publicClient(env);
  const [latestId] = await client.readContract({
    address: addresses.priceFeed,
    abi: aggregatorAbi,
    functionName: "latestRoundData",
  });

  const rounds = await client.multicall({
    contracts: Array.from({ length: ROUNDS }, (_, i) => ({
      address: addresses.priceFeed,
      abi: aggregatorAbi,
      functionName: "getRoundData" as const,
      args: [latestId - BigInt(i)] as const,
    })),
  });

  const points = rounds
    .filter((r) => r.status === "success")
    .map((r) => {
      const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
      return { price: Number(answer) / 1e8, at: Number(updatedAt) * 1000 };
    })
    .reverse();

  const prices = points.map((p) => p.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const changePct = ((last - first) / first) * 100;

  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdev = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length);
  const typicalMovePct = stdev * 100;

  const direction = changePct >= 0 ? "up" : "down";
  const summary =
    `AVAX moved between $${low.toFixed(3)} and $${high.toFixed(3)} over the last ` +
    `${Math.round((points[points.length - 1].at - points[0].at) / 60000)} minutes, ` +
    `${direction} ${Math.abs(changePct).toFixed(2)}% overall. ` +
    `A typical 10-minute move is about ${typicalMovePct.toFixed(2)}%, so a stop-loss tighter than that ` +
    `is likely to trigger on noise.`;

  return {
    asset: "AVAX/USD",
    source: "Chainlink (the same feed the market settles on)",
    last,
    high,
    low,
    changePct,
    typicalMovePct,
    nextUpdateEta: points[points.length - 1].at + 10 * 60 * 1000,
    summary,
    points,
  };
}
