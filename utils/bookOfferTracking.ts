import { secureGetItem, secureSetItem } from '@/utils/platformSecureStorage';

const STORAGE_KEY = 'leepool_book_offers_sent_v1';

type OfferSentMap = Record<string, boolean>;

async function readMap(): Promise<OfferSentMap> {
  const raw = await secureGetItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === 'object' ? (o as OfferSentMap) : {};
  } catch {
    return {};
  }
}

export async function hasSentOfferForBook(bookId: string): Promise<boolean> {
  if (!bookId?.trim()) return false;
  const map = await readMap();
  return !!map[bookId];
}

export async function markOfferSentForBook(bookId: string): Promise<void> {
  if (!bookId?.trim()) return;
  const map = await readMap();
  map[bookId] = true;
  await secureSetItem(STORAGE_KEY, JSON.stringify(map));
}
