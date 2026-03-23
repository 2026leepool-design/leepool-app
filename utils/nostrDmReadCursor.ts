import { SimplePool } from 'nostr-tools/pool';
import { RELAYS } from '@/utils/nostr';
import type { NostrKeys } from '@/utils/nostr';
import { secureGetItem, secureSetItem } from '@/utils/platformSecureStorage';

function cursorKey(myPubHex: string, peerPubHex: string): string {
  return `leepool_dm_read_${myPubHex}_${peerPubHex}`;
}

/** `null` = user has not opened this thread yet (treat recent batch as unread). */
export async function getDmReadCursor(
  myPubHex: string,
  peerPubHex: string
): Promise<number | null> {
  const v = await secureGetItem(cursorKey(myPubHex, peerPubHex));
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function setDmReadCursor(
  myPubHex: string,
  peerPubHex: string,
  lastSeenCreatedAt: number
): Promise<void> {
  const cur = await getDmReadCursor(myPubHex, peerPubHex);
  const next = Math.max(cur ?? 0, Math.floor(lastSeenCreatedAt));
  await secureSetItem(cursorKey(myPubHex, peerPubHex), String(next));
}

/**
 * Incoming kind-4 from peer after read cursor.
 * If cursor unset, cap display so old inboxes do not show triple-digit badges.
 */
export async function countUnreadIncomingFromPeer(
  keys: NostrKeys,
  peerPubHex: string
): Promise<number> {
  const cursor = await getDmReadCursor(keys.publicKey, peerPubHex);
  const pool = new SimplePool();
  try {
    const events = await pool.querySync([...RELAYS], {
      kinds: [4],
      authors: [peerPubHex],
      '#p': [keys.publicKey],
      limit: 100,
    });
    if (cursor === null) {
      return Math.min(9, events.length);
    }
    let n = 0;
    for (const ev of events) {
      if (ev.created_at > cursor) n += 1;
    }
    return n;
  } finally {
    pool.destroy();
  }
}
