import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { LocalAccount } from "viem";
import { getItem, removeItem, setItem } from "./storage";
import { rpId, webAuthnClient } from "./webauthn";

/// One passkey PRF evaluation per unlock. Every key the app needs is derived from that single
/// output with HKDF under its own label, so one Face ID covers trading and the journal, and the
/// keys are cryptographically independent of each other.
const PRF_SALT = sha256(utf8ToBytes("pocket.prf.v1"));
const HKDF_SALT = utf8ToBytes("pocket");
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const CREDENTIAL_KEY = "pocket.credential";

export interface Unlocked {
  account: LocalAccount;
  journalKey: Uint8Array;
  credential: PasskeyCredentialMetadata;
  lock(): void;
}

function derive(prf: Uint8Array, label: string): Uint8Array {
  return hkdf(sha256, prf, HKDF_SALT, utf8ToBytes(label), 32);
}

/// HKDF output is uniform, so it is a valid secp256k1 scalar with overwhelming probability;
/// the counter only exists to make the derivation total.
function deriveAccountKey(prf: Uint8Array): Uint8Array {
  for (let i = 0; ; i++) {
    const key = derive(prf, `pocket/evm/v1/${i}`);
    const n = BigInt(`0x${bytesToHex(key)}`);
    if (n > 0n && n < SECP256K1_N) return key;
  }
}

function fromPrf(prf: Uint8Array, credential: PasskeyCredentialMetadata): Unlocked {
  const accountKey = deriveAccountKey(prf);
  const session = createSecp256k1SigningSession({ privateKey: accountKey });
  accountKey.fill(0);
  return {
    account: toViemAccount(session),
    journalKey: derive(prf, "pocket/journal/v1"),
    credential,
    lock: () => session.end(),
  };
}

export async function storedCredential(): Promise<PasskeyCredentialMetadata | null> {
  const raw = await getItem(CREDENTIAL_KEY);
  return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : null;
}

export async function forgetCredential(): Promise<void> {
  await removeItem(CREDENTIAL_KEY);
}

export async function createAccount(): Promise<Unlocked> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Pocket" },
    user: { name: "Pocket", displayName: "Pocket 账户" },
    prfSalt: PRF_SALT,
    webAuthnClient,
  });
  const credential: PasskeyCredentialMetadata = {
    credentialId: created.credentialId,
    transports: created.transports,
  };
  await setItem(CREDENTIAL_KEY, JSON.stringify(credential));
  return fromPrf(created.prfOutput, credential);
}

/// With no stored credential the platform offers every Pocket passkey it knows, which is how
/// the same account opens on a second device or in the browser.
export async function unlock(credential?: PasskeyCredentialMetadata | null): Promise<Unlocked> {
  const result = await getPasskeyPrfOutput({
    rpId: rpId(),
    credential: credential ?? undefined,
    prfSalt: PRF_SALT,
    webAuthnClient,
  });
  const used: PasskeyCredentialMetadata = credential ?? { credentialId: result.credentialId };
  await setItem(CREDENTIAL_KEY, JSON.stringify(used));
  return fromPrf(result.prfOutput, used);
}
