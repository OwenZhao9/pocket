import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { paymentMiddleware } from "@x402/hono";
import type { MiddlewareHandler } from "hono";
import { addresses, executorClient, NETWORK, TREASURY, type Env } from "./chain";

export const INSIGHT_PRICE_USDC = "10000"; // 0.01 USDC (6 decimals)

let cached: MiddlewareHandler | undefined;

/// x402 with an in-process facilitator: the server verifies the buyer's EIP-3009 signature
/// and submits the USDC transfer itself, paying gas from the executor key.
/// No third-party facilitator is involved.
export function x402(env: Env): MiddlewareHandler {
  if (cached) return cached;

  const client = executorClient(env);
  const signer = toFacilitatorEvmSigner({
    ...client,
    address: client.account.address,
  } as unknown as Parameters<typeof toFacilitatorEvmSigner>[0]);

  const facilitator = new x402Facilitator();
  registerExactEvmScheme(facilitator, { signer, networks: NETWORK });

  const local: FacilitatorClient = {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
    getSupported: async () => facilitator.getSupported(),
  } as FacilitatorClient;

  const server = new x402ResourceServer(local).register(NETWORK, new ExactEvmScheme());

  cached = paymentMiddleware(
    {
      "GET /api/insight": {
        accepts: {
          scheme: "exact",
          network: NETWORK,
          payTo: TREASURY,
          price: {
            asset: addresses.usdc,
            amount: INSIGHT_PRICE_USDC,
            extra: { name: "USD Coin", version: "2" },
          },
          maxTimeoutSeconds: 120,
        },
        description: "Two-hour AVAX/USD read from the oracle the market settles on",
        mimeType: "application/json",
      },
    },
    server,
  );
  return cached;
}
