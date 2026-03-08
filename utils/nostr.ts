import * as SecureStore from 'expo-secure-store';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04';
import { SimplePool } from 'nostr-tools/pool';

const KEY_PRIVATE = 'nostr_prv_key';
const KEY_PUBLIC = 'nostr_pub_key';

export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'] as const;

export type NostrKeys = {
  privateKey: Uint8Array;
  publicKey: string;
  npub: string;
  nsec: string;
};

/**
 * Generates a new Nostr keypair, derives npub, and saves both to SecureStore.
 */
export async function generateAndSaveKeys(): Promise<NostrKeys> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);
  const nsec = nip19.nsecEncode(sk);

  await SecureStore.setItemAsync(KEY_PRIVATE, nsec);
  await SecureStore.setItemAsync(KEY_PUBLIC, npub);

  return { privateKey: sk, publicKey: pk, npub, nsec };
}

/**
 * Loads stored Nostr keys from SecureStore.
 * Returns { privateKey, publicKey, npub } or null if not found.
 */
export async function loadKeys(): Promise<NostrKeys | null> {
  const nsec = await SecureStore.getItemAsync(KEY_PRIVATE);
  const npub = await SecureStore.getItemAsync(KEY_PUBLIC);

  if (!nsec || !npub) return null;

  try {
    const decodedNsec = nip19.decode(nsec);
    if (decodedNsec.type !== 'nsec') return null;

    const decodedNpub = nip19.decode(npub);
    if (decodedNpub.type !== 'npub') return null;

    const privateKey = decodedNsec.data;
    const publicKey = decodedNpub.data;

    return { privateKey, publicKey, npub, nsec };
  } catch {
    return null;
  }
}

/**
 * Imports an nsec private key, derives the public key (npub), and saves both to SecureStore.
 * @param nsecRaw - Raw nsec1... string
 */
export async function importNsecKey(nsecRaw: string): Promise<NostrKeys> {
  const trimmed = nsecRaw.trim();
  const decoded = nip19.decode(trimmed);
  if (decoded.type !== 'nsec') throw new Error('Geçersiz nsec anahtarı.');

  const sk = decoded.data as Uint8Array;
  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);
  const nsec = nip19.nsecEncode(sk);

  await SecureStore.setItemAsync(KEY_PRIVATE, nsec);
  await SecureStore.setItemAsync(KEY_PUBLIC, npub);

  return { privateKey: sk, publicKey: pk, npub, nsec };
}

/**
 * Sends an encrypted NIP-04 direct message to the receiver.
 * @param receiverNpub - Receiver's npub (bech32)
 * @param message - Plain text message
 */
export async function sendEncryptedMessage(
  receiverNpub: string,
  message: string
): Promise<void> {
  const keys = await loadKeys();
  if (!keys) throw new Error('Nostr kimliği bulunamadı.');

  const decoded = nip19.decode(receiverNpub);
  if (decoded.type !== 'npub') throw new Error('Geçersiz npub.');
  const receiverHex = decoded.data as string;

  const ciphertext = nip04.encrypt(keys.privateKey, receiverHex, message);

  const eventTemplate = {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', receiverHex]],
    content: ciphertext,
  };

  const signedEvent = finalizeEvent(eventTemplate, keys.privateKey);
  const pool = new SimplePool();
  const pubs = pool.publish(RELAYS, signedEvent);
  await Promise.all(pubs);
  pool.destroy();
}

/**
 * Deletes stored Nostr keys from the device.
 */
export async function deleteKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PRIVATE);
  await SecureStore.deleteItemAsync(KEY_PUBLIC);
}
