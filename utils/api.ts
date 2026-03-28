import { analyzeBookCoverForSearch } from './gemini';

export type GoogleBookResult = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  page_count: number | null;
  average_rating: number | null;
  ratings_count: number | null;
  price_amount: number | null;
  price_currency: string | null;
};

type GoogleVolumeItem = {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    pageCount?: number;
    averageRating?: number;
    ratingsCount?: number;
  };
  saleInfo?: {
    listPrice?: { amount?: number; currencyCode?: string };
    retailPrice?: { amount?: number; currencyCode?: string };
  };
};

/** Bazı mobil ortamlarda Google boş dönebiliyor; istekleri tarayıcıya yakın göndermek için */
const BOOKS_FETCH_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

function mapGoogleVolumeItems(items: GoogleVolumeItem[]): GoogleBookResult[] {
  return items.map((item) => {
    const vi = item.volumeInfo ?? {};
    const authors = vi.authors ?? [];
    const img = vi.imageLinks?.thumbnail ?? vi.imageLinks?.smallThumbnail;
    let cover = img ?? null;
    if (cover && cover.startsWith('http:')) {
      cover = cover.replace('http:', 'https:');
    }
    const price = item.saleInfo?.retailPrice ?? item.saleInfo?.listPrice;
    const amount = price?.amount;
    const currency = price?.currencyCode ?? null;

    return {
      id: item.id,
      title: vi.title ?? '—',
      author: authors.join(', ') || '—',
      cover_url: cover,
      page_count: vi.pageCount ?? null,
      average_rating: vi.averageRating ?? null,
      ratings_count: vi.ratingsCount ?? null,
      price_amount: amount != null && amount > 0 ? amount : null,
      price_currency: currency,
    };
  });
}

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  isbn?: string[];
};

function mapOpenLibraryDocsToResults(docs: OpenLibraryDoc[]): GoogleBookResult[] {
  return docs.map((d, i) => ({
    id: String(d.key ?? d.isbn?.[0] ?? `ol_${i}`).replace(/\//g, '_'),
    title: (d.title ?? '—').trim(),
    author: Array.isArray(d.author_name) ? d.author_name.join(', ') : '—',
    cover_url:
      d.cover_i != null
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : null,
    page_count: d.number_of_pages_median ?? null,
    average_rating: null,
    ratings_count: null,
    price_amount: null,
    price_currency: null,
  }));
}

async function fetchOpenLibrarySearch(q: string): Promise<GoogleBookResult[]> {
  const trimmed = q.replace(/^isbn:\s*/i, '').trim();
  if (!trimmed) return [];
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&limit=25`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { docs?: OpenLibraryDoc[] };
    const docs = json.docs ?? [];
    return mapOpenLibraryDocsToResults(docs);
  } catch {
    return [];
  }
}

/**
 * Google Books + yedek Open Library. Başlık, yazar, ISBN (veya isbn:…) ile arar.
 */
export async function searchBooksOmni(query: string): Promise<GoogleBookResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const isbnPayload = lower.startsWith('isbn:')
    ? trimmed.replace(/^isbn:\s*/i, '').replace(/\D/g, '')
    : null;
  const digitsOnly = trimmed.replace(/\D/g, '');
  const looksLikeIsbn =
    isbnPayload != null && isbnPayload.length >= 10
      ? isbnPayload
      : digitsOnly.length >= 10 &&
          digitsOnly.length <= 13 &&
          /^[\d\s\-xXiI]+$/.test(trimmed)
        ? digitsOnly
        : null;

  const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${
    looksLikeIsbn
      ? encodeURIComponent(`isbn:${looksLikeIsbn}`)
      : encodeURIComponent(trimmed)
  }&maxResults=20`;

  let googleResults: GoogleBookResult[] = [];
  try {
    const res = await fetch(googleUrl, { headers: BOOKS_FETCH_HEADERS });
    if (res.ok) {
      const json = (await res.json()) as { items?: GoogleVolumeItem[] };
      if (json.items?.length) {
        googleResults = mapGoogleVolumeItems(json.items);
      }
    }
  } catch {
    /* Open Library’a düş */
  }

  if (googleResults.length > 0) return googleResults;

  const olQuery = looksLikeIsbn ?? trimmed.replace(/^isbn:\s*/i, '').trim();
  return fetchOpenLibrarySearch(olQuery);
}

/** @deprecated Önce searchBooksOmni kullanın; aynı davranış */
export async function searchGoogleBooks(query: string): Promise<GoogleBookResult[]> {
  return searchBooksOmni(query);
}

/**
 * Analyzes a book cover image using Gemini Vision API.
 * Returns "Kitap Adı - Yazar Adı" format string.
 * @deprecated Use analyzeBookCoverForSearch from utils/gemini instead.
 */
export async function analyzeBookCover(base64Image: string): Promise<string | null> {
  return analyzeBookCoverForSearch(base64Image);
}
