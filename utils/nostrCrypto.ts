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

const Z = new Uint8Array([0]);

/** Birden fazla Uint8Array'i tek buffer'da birleştir (KDF malzemesi — Hermes/V8 uyumu). */
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 16 byte random salt as hex (stored in profiles.nostr_key_salt). */
export function generateNostrKeySalt(): string {
  const bytes = nacl.randomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 32-byte key for nacl.secretbox.
 * Parola ve sabit metinler tweetnacl-util decodeUTF8 ile UTF-8 baytlarına çevrilir;
 * SHA256, expo-crypto digest(Uint8Array) ile hesaplanır (digestStringAsync’ten farklı
 * platform davranışlarından kaçınmak için).
 */
export async function deriveNostrEncryptionKey(
  password: string,
  saltHex: string,
  userId: string
): Promise<Uint8Array> {
  const passwordBytes = naclUtil.decodeUTF8(password);
  const saltBytes = naclUtil.decodeUTF8(saltHex.trim());
  const userIdBytes = naclUtil.decodeUTF8(userId);
  const markerBytes = naclUtil.decodeUTF8('leepool-nostr-seal-v1');
  const material = concatBytes(
    passwordBytes,
    Z,
    saltBytes,
    Z,
    userIdBytes,
    Z,
    markerBytes
  );
  /** BufferSource tip uyumu (TS 5.x / Hermes Uint8Array) */
  const toDigest = new Uint8Array(material);
  const digestBuf = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    toDigest
  );
  return new Uint8Array(digestBuf);
}

export async function encryptNsecForProfile(
  nsec: string,
  password: string,
  saltHex: string,
  userId: string
): Promise<string> {
  const key = await deriveNostrEncryptionKey(password, saltHex, userId);
  const nonce = nacl.randomBytes(24);
  /** Düz metin: yalnızca tweetnacl-util UTF-8 (TextEncoder/btoa kullanılmaz). */
  const msg = naclUtil.decodeUTF8(nsec);
  const boxed = nacl.secretbox(msg, nonce, key);
  const payload = {
    v: 1,
    s: saltHex,
    /** nonce/ciphertext: yalnızca tweetnacl-util encodeBase64 (Buffer/btoa yok). */
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
  } catch (e) {
    console.warn('[NOSTR_DECRYPT] JSON.parse failed', e);
    return null;
  }
  if (parsed.v !== 1 || typeof parsed.n !== 'string' || typeof parsed.c !== 'string') {
    console.warn('[NOSTR_DECRYPT] Invalid payload shape', {
      v: parsed.v,
      hasN: typeof parsed.n,
      hasC: typeof parsed.c,
    });
    return null;
  }
  const salt = (typeof parsed.s === 'string' && parsed.s.trim() ? parsed.s.trim() : saltHex) ?? '';
  if (!salt) {
    console.warn('[NOSTR_DECRYPT] Missing salt (payload.s and fallback both empty)');
    return null;
  }
  const key = await deriveNostrEncryptionKey(password, salt, userId);
  let nonce: Uint8Array;
  let boxed: Uint8Array;
  try {
    /** atob/Buffer yok — sadece tweetnacl-util decodeBase64 */
    nonce = naclUtil.decodeBase64(parsed.n);
    boxed = naclUtil.decodeBase64(parsed.c);
  } catch (e) {
    console.warn(
      '[NOSTR_DECRYPT] decodeBase64 failed (nonce/ciphertext) — not a secretbox.open failure',
      e
    );
    return null;
  }
  const opened = nacl.secretbox.open(boxed, nonce, key);
  if (!opened) {
    console.warn(
      '[NOSTR_DECRYPT] nacl.secretbox.open returned null (wrong password, key derivation mismatch, or corrupt ciphertext)'
    );
    return null;
  }
  /** Çıktı: tweetnacl-util encodeUTF8 (TextDecoder yerine tutarlı UTF-8) */
  return naclUtil.encodeUTF8(opened);
}
