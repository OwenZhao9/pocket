import { createPublicClient, createWalletClient, http, publicActions, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import deployment from "../../config/fuji.json";

export interface Env {
  FUJI_RPC: string;
  IOS_APP_ID: string;
  EXECUTOR_PRIVATE_KEY: Hex;
  KV: KVNamespace;
  ASSETS: Fetcher;
}

export const addresses = {
  market: deployment.market as Address,
  pocketUSD: deployment.pocketUSD as Address,
  priceSource: deployment.priceSource as Address,
  priceFeed: deployment.priceFeed as Address,
  faucet: deployment.faucet as Address,
  usdc: deployment.usdc as Address,
  /// Present once the Pocket L1 and its ICM receipt contracts are deployed.
  receiptPublisher: (deployment as { receiptPublisher?: string }).receiptPublisher as Address | undefined,
};

/// The treasury receives x402 payments. It is the deployer, whose key never leaves the
/// developer's machine; the server only holds the executor key.
export const TREASURY: Address = "0x41E824Ec6A39a91E125a7D9cf760d4B384fa3a1E";

export const chain = avalancheFuji;
export const NETWORK = `eip155:${avalancheFuji.id}` as const;
export const EXPLORER = "https://testnet.snowtrace.io";

export function publicClient(env: Env) {
  return createPublicClient({ chain, transport: http(env.FUJI_RPC) });
}

export function executorClient(env: Env) {
  const account = privateKeyToAccount(env.EXECUTOR_PRIVATE_KEY);
  return createWalletClient({ account, chain, transport: http(env.FUJI_RPC) }).extend(publicActions);
}
