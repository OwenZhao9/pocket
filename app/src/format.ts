import { formatUnits } from "viem";
import { PRICE_DECIMALS, USD_DECIMALS } from "./config";

export const usd = (v: bigint, digits = 2) =>
  Number(formatUnits(v, USD_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const price = (v: bigint, digits = 4) => `$${Number(formatUnits(v, PRICE_DECIMALS)).toFixed(digits)}`;

export const pct = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
