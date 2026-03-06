import * as SecureStore from 'expo-secure-store';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

const KEY_PRIVATE = 'nostr_prv_key';
const KEY_PUBLIC = 'nostr_pub_key';

export type NostrKeys = {
  privateKey: Uint8Array;
  publicKey: string;
  npub: string;
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

  return { privateKey: sk, publicKey: pk, npub };
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

    return { privateKey, publicKey, npub };
  } catch {
    return null;
  }
}

/**
 * Deletes stored Nostr keys from the device.
 */
export async function deleteKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PRIVATE);
  await SecureStore.deleteItemAsync(KEY_PUBLIC);
}
