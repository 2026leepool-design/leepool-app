/* tweetnacl, global.crypto.getRandomValues ister — _layout’tan önce bu modül yüklenebilir */
import 'react-native-get-random-values';

import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import * as naclUtilStar from 'tweetnacl-util';

/** tweetnacl-util CJS (`export = util`) — Metro/Expo bazen `default` içinde sarar */
type NaclUtilModule = {
  decodeUTF8(s: string): Uint8Array;
  encodeUTF8(arr: Uint8Array): string;
  encodeBase64(arr: Uint8Array): string;
  decodeBase64(s: string): Uint8Array;
};

function getTweetnaclUtil(): NaclUtilModule {
  const m = naclUtilStar as NaclUtilModule & { default?: NaclUtilModule };
  if (typeof m.encodeBase64 === 'function' && typeof m.decodeBase64 === 'function') {
    return m;
  }
  if (m.default && typeof m.default.encodeBase64 === 'function') {
    return m.default;
  }
  throw new Error('tweetnacl-util: encodeBase64/decodeBase64 yüklenemedi');
}

const naclUtil = getTweetnaclUtil();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** 16 byte random salt as hex (stored in profiles.nostr_key_salt). */
export function generateNostrKeySalt(): string {
  const bytes = nacl.randomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

/** 32-byte key for nacl.secretbox (derived from account password + salt + user id). */
export async function deriveNostrEncryptionKey(
  password: string,
  saltHex: string,
  userId: string
): Promise<Uint8Array> {
  const material = `${password}\x00${saltHex}\x00${userId}\x00leepool-nostr-seal-v1`;
  const hex = await sha256Hex(material);
  return hexToBytes(hex);
}

export async function encryptNsecForProfile(
  nsec: string,
  password: string,
  saltHex: string,
  userId: string
): Promise<string> {
  const key = await deriveNostrEncryptionKey(password, saltHex, userId);
  const nonce = nacl.randomBytes(24);
  const msg = new TextEncoder().encode(nsec);
  const boxed = nacl.secretbox(msg, nonce, key);
  const payload = {
    v: 1,
    s: saltHex,
    n: naclUtil.encodeBase64(nonce),
    c: naclUtil.encodeBase64(boxed),
  };
  return JSON.stringify(payload);
}

export async function decryptNsecFromProfile(
  encryptedJson: string,
  password: string,
  saltHex: string | null,
  userId: string
): Promise<string | null> {
  let parsed: { v: number; s?: string; n: string; c: string };
  try {
    parsed = JSON.parse(encryptedJson) as { v: number; s?: string; n: string; c: string };
  } catch {
    return null;
  }
  if (parsed.v !== 1 || typeof parsed.n !== 'string' || typeof parsed.c !== 'string') {
    return null;
  }
  const salt = (typeof parsed.s === 'string' && parsed.s.trim() ? parsed.s.trim() : saltHex) ?? '';
  if (!salt) return null;
  const key = await deriveNostrEncryptionKey(password, salt, userId);
  let nonce: Uint8Array;
  let boxed: Uint8Array;
  try {
    nonce = naclUtil.decodeBase64(parsed.n);
    boxed = naclUtil.decodeBase64(parsed.c);
  } catch {
    return null;
  }
  const opened = nacl.secretbox.open(boxed, nonce, key);
  if (!opened) return null;
  return new TextDecoder().decode(opened);
}
