import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { NATIVE_RP_ID } from "./config";

export const webAuthnClient = reactNativeWebAuthnClient;

export function rpId(): string {
  return NATIVE_RP_ID;
}
