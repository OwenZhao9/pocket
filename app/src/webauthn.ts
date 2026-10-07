import type { WebAuthnClient } from "@category-labs/mera";

/// On the web, mera uses the browser's navigator.credentials directly.
export const webAuthnClient: WebAuthnClient | undefined = undefined;

export function rpId(): string {
  return globalThis.location?.hostname ?? "localhost";
}
