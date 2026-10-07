import type { Address } from "viem";
import { avalancheFuji } from "viem/chains";
import deployment from "../../config/fuji.json";

export const chain = avalancheFuji;
export const RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
export const EXPLORER = "https://testnet.snowtrace.io";
export const API_BASE = "https://pocket.photogif.workers.dev";

/// The passkey relying party. iOS shares passkeys with this domain through Associated Domains.
export const NATIVE_RP_ID = "pocket.photogif.workers.dev";

export const addresses = {
  market: deployment.market as Address,
  pocketUSD: deployment.pocketUSD as Address,
  priceSource: deployment.priceSource as Address,
  faucet: deployment.faucet as Address,
  usdc: deployment.usdc as Address,
};

export const USD_DECIMALS = 6;
export const PRICE_DECIMALS = 8;
