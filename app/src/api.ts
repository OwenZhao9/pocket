import { ExactEvmScheme } from "@x402/evm";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import type { Address, LocalAccount } from "viem";
import { addresses, API_BASE, chain } from "./config";

export interface DripResult {
  claimed: boolean;
  tx?: string;
}

export async function drip(address: Address): Promise<DripResult> {
  const res = await fetch(`${API_BASE}/api/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) throw new Error(`drip failed: ${res.status}`);
  return res.json();
}

export interface KeeperStatus {
  last: { at: number; scanned: number; executed: { id: string; tx: string }[] } | null;
  lastExecution: { at: number; executed: { id: string; tx: string }[] } | null;
}

export async function keeperStatus(): Promise<KeeperStatus> {
  const res = await fetch(`${API_BASE}/api/keeper`);
  return res.json();
}

export interface Insight {
  last: number;
  high: number;
  low: number;
  changePct: number;
  typicalMovePct: number;
  nextUpdateEta: number;
  summary: string;
  points: { price: number; at: number }[];
}

export interface PaidInsight {
  insight: Insight;
  settlementTx?: string;
}

/// Pays 0.01 USDC per call with x402. Fuji USDC is not one of x402's built-in assets,
/// so it is allowed explicitly and capped at 0.10 per payment.
export async function buyInsight(account: LocalAccount): Promise<PaidInsight> {
  const network = `eip155:${chain.id}` as const;
  const pay = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network, client: new ExactEvmScheme(account) }],
    spendControls: { allowedAssets: [{ network, asset: addresses.usdc, maxAmountPerPayment: "100000" }] },
  });
  const res = await pay(`${API_BASE}/api/insight`);
  if (!res.ok) throw new Error(`insight failed: ${res.status}`);
  const header = res.headers.get("PAYMENT-RESPONSE");
  const settlement = header ? decodePaymentResponseHeader(header) : undefined;
  return { insight: await res.json(), settlementTx: settlement?.transaction };
}
