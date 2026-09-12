import 'react-native-get-random-values';

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';
import * as nip04 from 'nostr-tools/nip04';
import { SimplePool } from 'nostr-tools/pool';
import { secureDeleteItem, secureGetItem, secureSetItem } from '@/utils/platformSecureStorage';

const NWC_STORAGE_KEY = 'leepool_nwc_uri';
const NWC_REQUEST_KIND = 23194;
const NWC_RESPONSE_KIND = 23195;
const NWC_INFO_KIND = 13194;

export type NwcConnection = {
  walletPubkey: string;
  relays: string[];
  secret: Uint8Array;
  lud16?: string;
};

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('NWC secret must be 32-byte hex.');
  return Uint8Array.from(hex.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
}

export function parseNwcUri(raw: string): NwcConnection {
  const value = raw.trim();
  if (!value.toLowerCase().startsWith('nostr+walletconnect://')) {
    throw new Error('Invalid NWC URI. It must start with nostr+walletconnect://');
  }
  const uri = new URL(value);
  const walletPubkey = uri.hostname || uri.pathname.replace(/^\//, '');
  const relays = uri.searchParams.getAll('relay').filter((relay) => /^wss?:\/\//i.test(relay));
  const secretRaw = uri.searchParams.get('secret') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(walletPubkey) || relays.length === 0 || !secretRaw) {
    throw new Error('NWC URI is missing wallet pubkey, relay or secret.');
  }
  return {
    walletPubkey: walletPubkey.toLowerCase(),
    relays,
    secret: hexToBytes(secretRaw),
    lud16: uri.searchParams.get('lud16') ?? undefined,
  };
}

export async function saveNwcUri(uri: string): Promise<NwcConnection> {
  const connection = parseNwcUri(uri);
  await secureSetItem(NWC_STORAGE_KEY, uri.trim());
  return connection;
}

export async function loadNwcConnection(): Promise<NwcConnection | null> {
  const uri = await secureGetItem(NWC_STORAGE_KEY);
  if (!uri) return null;
  try {
    return parseNwcUri(uri);
  } catch {
    return null;
  }
}

export async function deleteNwcConnection(): Promise<void> {
  await secureDeleteItem(NWC_STORAGE_KEY);
}

function getEncryption(connection: NwcConnection, info: { tags: string[][] } | undefined): 'nip44_v2' | 'nip04' {
  const supported = info?.tags.find((tag) => tag[0] === 'encryption')?.[1] ?? '';
  return supported.split(/\s+/).includes('nip44_v2') ? 'nip44_v2' : 'nip04';
}

async function getWalletInfo(pool: SimplePool, connection: NwcConnection) {
  const events = await pool.querySync(
    connection.relays,
    { kinds: [NWC_INFO_KIND], authors: [connection.walletPubkey], limit: 1 },
    { maxWait: 8_000 }
  );
  return events.sort((a, b) => b.created_at - a.created_at)[0];
}

export async function payInvoiceWithNwc(
  invoice: string,
  amountSats: number,
  comment = ''
): Promise<{ preimage?: string; paymentHash?: string }> {
  if (!Number.isSafeInteger(amountSats) || amountSats < 1) throw new Error('Invalid Lightning amount.');
  const connection = await loadNwcConnection();
  if (!connection) throw new Error('No Nostr Wallet Connect is configured.');

  const clientSecret = connection.secret;
  const clientPubkey = getPublicKey(clientSecret);
  const pool = new SimplePool();
  let responseCloser: { close: () => void } | null = null;
  const closeResponse = () => {
    const closer = responseCloser as { close: () => void } | null;
    closer?.close();
  };
  try {
    const info = await getWalletInfo(pool, connection);
    const encryption = getEncryption(connection, info);
    const conversationKey = encryption === 'nip44_v2'
      ? nip44.v2.utils.getConversationKey(clientSecret, connection.walletPubkey)
      : null;
    const request = JSON.stringify({ method: 'pay_invoice', params: { invoice, ...(comment ? { comment } : {}) } });
    const encrypted = encryption === 'nip44_v2'
      ? nip44.v2.encrypt(request, conversationKey!)
      : await nip04.encrypt(clientSecret, connection.walletPubkey, request);
    const event = finalizeEvent(
      {
        kind: NWC_REQUEST_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', connection.walletPubkey], ['encryption', encryption]],
        content: encrypted,
      },
      clientSecret
    );

    const response = new Promise<{ preimage?: string; paymentHash?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        closeResponse();
        reject(new Error('The wallet did not respond in time.'));
      }, 30_000);
      responseCloser = pool.subscribe(connection.relays, {
        kinds: [NWC_RESPONSE_KIND],
        '#p': [clientPubkey],
        since: event.created_at,
      }, {
        onevent: async (received) => {
          try {
            const plaintext = encryption === 'nip44_v2'
              ? nip44.v2.decrypt(received.content, conversationKey!)
              : await nip04.decrypt(clientSecret, connection.walletPubkey, received.content);
            const payload = JSON.parse(plaintext) as { result_type?: string; result?: { preimage?: string; payment_hash?: string }; error?: { message?: string } };
            if (payload.error) throw new Error(payload.error.message || 'Wallet payment failed.');
            if (payload.result_type !== 'pay_invoice' || !payload.result) throw new Error('Wallet returned an invalid payment response.');
            clearTimeout(timer);
            closeResponse();
            resolve({ preimage: payload.result.preimage, paymentHash: payload.result.payment_hash });
          } catch (error) {
            clearTimeout(timer);
            closeResponse();
            reject(error);
          }
        },
      });
    });
    await Promise.all(pool.publish(connection.relays, event));
    return await response;
  } finally {
    closeResponse();
    pool.destroy();
  }
}

/** Returns the connected wallet balance in satoshis (NWC reports millisatoshis). */
export async function getWalletBalanceWithNwc(): Promise<number> {
  const connection = await loadNwcConnection();
  if (!connection) throw new Error('No Nostr Wallet Connect is configured.');

  const clientSecret = connection.secret;
  const clientPubkey = getPublicKey(clientSecret);
  const pool = new SimplePool();
  let responseCloser: { close: () => void } | null = null;
  const closeResponse = () => responseCloser?.close();

  try {
    const info = await getWalletInfo(pool, connection);
    const encryption = getEncryption(connection, info);
    const conversationKey = encryption === 'nip44_v2'
      ? nip44.v2.utils.getConversationKey(clientSecret, connection.walletPubkey)
      : null;
    const request = JSON.stringify({ method: 'get_balance', params: {} });
    const encrypted = encryption === 'nip44_v2'
      ? nip44.v2.encrypt(request, conversationKey!)
      : await nip04.encrypt(clientSecret, connection.walletPubkey, request);
    const event = finalizeEvent(
      {
        kind: NWC_REQUEST_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', connection.walletPubkey], ['encryption', encryption]],
        content: encrypted,
      },
      clientSecret
    );

    const response = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        closeResponse();
        reject(new Error('The wallet did not respond in time.'));
      }, 15_000);
      responseCloser = pool.subscribe(connection.relays, {
        kinds: [NWC_RESPONSE_KIND],
        '#p': [clientPubkey],
        since: event.created_at,
      }, {
        onevent: async (received) => {
          try {
            const plaintext = encryption === 'nip44_v2'
              ? nip44.v2.decrypt(received.content, conversationKey!)
              : await nip04.decrypt(clientSecret, connection.walletPubkey, received.content);
            const payload = JSON.parse(plaintext) as { result_type?: string; result?: { balance?: number }; error?: { message?: string } };
            if (payload.error) throw new Error(payload.error.message || 'Wallet balance request failed.');
            if (payload.result_type !== 'get_balance' || typeof payload.result?.balance !== 'number') {
              throw new Error('Wallet returned an invalid balance response.');
            }
            clearTimeout(timer);
            closeResponse();
            resolve(Math.max(0, Math.round(payload.result.balance / 1000)));
          } catch (error) {
            clearTimeout(timer);
            closeResponse();
            reject(error);
          }
        },
      });
    });
    await Promise.all(pool.publish(connection.relays, event));
    return await response;
  } finally {
    closeResponse();
    pool.destroy();
  }
}
