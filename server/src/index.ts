import { Hono } from "hono";
import { cors } from "hono/cors";
import { encodeFunctionData, isAddress, type Address } from "viem";
import { faucetAbi } from "./abi";
import { addresses, chain, executorClient, EXPLORER, NETWORK, publicClient, TREASURY, type Env } from "./chain";
import { marketInsight } from "./insight";
import { runKeeper, type KeeperRun } from "./keeper";
import { INSIGHT_PRICE_USDC, x402 } from "./x402";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE"],
    exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/config", (c) =>
  c.json({
    chainId: chain.id,
    network: NETWORK,
    rpc: c.env.FUJI_RPC,
    explorer: EXPLORER,
    treasury: TREASURY,
    insightPriceUsdc: INSIGHT_PRICE_USDC,
    ...addresses,
  }),
);

/// One-time starter kit for a new address: trading dollars, gas, and a little USDC.
/// The faucet contract enforces once-per-address on-chain.
const DRIPS_PER_IP_PER_HOUR = 10;

/// The executor key is shared with the keeper cron, so two transactions can race for a nonce.
/// Those failures are transient: resend with a fresh nonce.
async function sendWithNonceRetry<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (attempt >= 3 || !/nonce|replacement|underpriced|already known/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

app.post("/api/drip", async (c) => {
  const body = await c.req.json<{ address?: string }>().catch(() => ({}) as { address?: string });
  const address = body.address;
  if (!address || !isAddress(address)) return c.json({ error: "invalid address" }, 400);

  // Each address can claim once on-chain, but new addresses are free to mint, so also cap per IP.
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const bucket = `drip:ip:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const used = Number((await c.env.KV.get(bucket)) ?? "0");
  if (used >= DRIPS_PER_IP_PER_HOUR) return c.json({ error: "rate limited" }, 429);

  const reader = publicClient(c.env);
  const claimed = await reader.readContract({
    address: addresses.faucet,
    abi: faucetAbi,
    functionName: "claimed",
    args: [address as Address],
  });
  if (claimed) return c.json({ claimed: true });

  // Fixed gas (drip uses ~168k) and fee caps skip estimation round trips; Fuji's base fee is
  // a few hundred wei, so 1 gwei is only a ceiling.
  const account = executorClient(c.env).account;
  const data = encodeFunctionData({ abi: faucetAbi, functionName: "drip", args: [address as Address] });
  const started = Date.now();
  const tx = await sendWithNonceRetry(async () => {
    const nonce = await reader.getTransactionCount({ address: account.address, blockTag: "pending" });
    const serializedTransaction = await account.signTransaction({
      chainId: chain.id,
      type: "eip1559",
      to: addresses.faucet,
      data,
      gas: 220_000n,
      nonce,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000n,
    });
    return reader.sendRawTransaction({ serializedTransaction });
  });
  await c.env.KV.put(bucket, String(used + 1), { expirationTtl: 3_700 });
  const receipt = await reader.waitForTransactionReceipt({ hash: tx, timeout: 20_000 });
  return c.json({
    claimed: true,
    tx,
    status: receipt.status,
    /// Server-side time from signing to a confirmed receipt, as a plain measure of Fuji latency.
    confirmedInMs: Date.now() - started,
    explorer: `${EXPLORER}/tx/${tx}`,
  });
});

/// When the rule engine last ran and what it did.
app.get("/api/keeper", async (c) => {
  const last = await c.env.KV.get<KeeperRun>("keeper:last", "json");
  const lastExecution = await c.env.KV.get<KeeperRun>("keeper:lastExecution", "json");
  return c.json({ last, lastExecution, executor: executorClient(c.env).account.address });
});

/// Pay-per-call market read, 0.01 USDC via x402.
app.use("/api/insight", (c, next) => x402(c.env)(c, next));
app.get("/api/insight", async (c) => c.json(await marketInsight(c.env)));

/// Lets the iOS app share passkeys with this domain.
app.get("/.well-known/apple-app-site-association", (c) =>
  c.json({ webcredentials: { apps: [c.env.IOS_APP_ID] } }),
);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const run = await runKeeper(env);
        await env.KV.put("keeper:last", JSON.stringify(run));
        if (run.executed.length > 0) await env.KV.put("keeper:lastExecution", JSON.stringify(run));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
