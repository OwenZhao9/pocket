import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, randomBytes, utf8ToBytes } from "@noble/ciphers/utils.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Address } from "viem";
import { getItem, setItem } from "./storage";

/// The journal is AES-256-GCM encrypted with a key derived from the same passkey PRF output as
/// the trading account, under its own HKDF label. Only ciphertext is ever stored.

export interface JournalEntry {
  at: number;
  kind: "open" | "close" | "rule" | "note";
  text: string;
  tx?: string;
}

const storageKey = (owner: Address) => `pocket.journal.${owner.toLowerCase()}`;

export async function readCiphertext(owner: Address): Promise<string | null> {
  return getItem(storageKey(owner));
}

export async function loadJournal(owner: Address, key: Uint8Array): Promise<JournalEntry[]> {
  const stored = await readCiphertext(owner);
  if (!stored) return [];
  const [nonceHex, dataHex] = stored.split(":");
  const plain = gcm(key, hexToBytes(nonceHex)).decrypt(hexToBytes(dataHex));
  return JSON.parse(bytesToUtf8(plain)) as JournalEntry[];
}

export async function saveJournal(owner: Address, key: Uint8Array, entries: JournalEntry[]): Promise<void> {
  const nonce = randomBytes(12);
  const data = gcm(key, nonce).encrypt(utf8ToBytes(JSON.stringify(entries)));
  await setItem(storageKey(owner), `${bytesToHex(nonce)}:${bytesToHex(data)}`);
}

export async function appendJournal(owner: Address, key: Uint8Array, entry: JournalEntry): Promise<JournalEntry[]> {
  const entries = await loadJournal(owner, key).catch(() => [] as JournalEntry[]);
  const next = [entry, ...entries].slice(0, 500);
  await saveJournal(owner, key, next);
  return next;
}
