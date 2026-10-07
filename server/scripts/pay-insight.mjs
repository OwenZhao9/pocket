// End-to-end x402 check: pay 0.01 USDC on Fuji for one market read.
// Usage: DEMO_PRIVATE_KEY=0x... node scripts/pay-insight.mjs [baseUrl]
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const base = process.argv[2] ?? "https://pocket.photogif.workers.dev";
const account = privateKeyToAccount(process.env.DEMO_PRIVATE_KEY);
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:43113", client: new ExactEvmScheme(account) }],
  // Fuji USDC is not one of x402's built-in default assets, so opt in explicitly with a 0.10 cap.
  spendControls: {
    allowedAssets: [
      { network: "eip155:43113", asset: "0x5425890298aed601595a70AB815c96711a31Bc65", maxAmountPerPayment: "100000" },
    ],
  },
});

const res = await pay(`${base}/api/insight`);
console.log("status", res.status);
const header = res.headers.get("PAYMENT-RESPONSE");
if (header) console.log("settlement", decodePaymentResponseHeader(header));
const body = await res.json();
console.log("summary", body.summary ?? body);
