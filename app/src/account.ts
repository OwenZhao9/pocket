import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
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
const DEMO_SEED_KEY = "pocket.demo-seed";

export interface Unlocked {
  account: LocalAccount;
  journalKey: Uint8Array;
  /// Absent for a demo account.
  credential?: PasskeyCredentialMetadata;
  kind: "passkey" | "demo";
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

function fromSeed(seed: Uint8Array, kind: Unlocked["kind"], credential?: PasskeyCredentialMetadata): Unlocked {
  const accountKey = deriveAccountKey(seed);
  const session = createSecp256k1SigningSession({ privateKey: accountKey });
  accountKey.fill(0);
  return {
    account: toViemAccount(session),
    journalKey: derive(seed, "pocket/journal/v1"),
    credential,
    kind,
    lock: () => session.end(),
  };
}

const fromPrf = (prf: Uint8Array, credential: PasskeyCredentialMetadata) => fromSeed(prf, "passkey", credential);

/// Fallback for browsers whose passkeys cannot evaluate PRF, so a judge on any browser can
/// still try the product. A random seed stands in for the PRF output and is kept in this
/// browser's storage; everything downstream (key derivation, journal encryption) is identical.
export async function storedDemoSeed(): Promise<boolean> {
  return (await getItem(DEMO_SEED_KEY)) !== null;
}

export async function openDemoAccount(): Promise<Unlocked> {
  let hex = await getItem(DEMO_SEED_KEY);
  if (!hex) {
    hex = bytesToHex(randomBytes(32));
    await setItem(DEMO_SEED_KEY, hex);
  }
  return fromSeed(hexToBytes(hex), "demo");
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
