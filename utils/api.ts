const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

export async function searchGoogleBooks(query: string): Promise<GoogleBookResult[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];

  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=20`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const items: GoogleVolumeItem[] = json?.items ?? [];

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
  } catch {
    return [];
  }
}

/**
 * Analyzes a book cover image using Gemini Vision API.
 * Returns "Kitap Adı - Yazar Adı" format string.
 */
export async function analyzeBookCover(base64Image: string): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    return null;
  }

  const prompt =
    'Bu resimdeki kitabın adını ve yazarını bul. Sadece "Kitap Adı - Yazar Adı" formatında yanıt ver. Başka bir şey yazma.';

  const rawBase64 = base64Image.includes(',')
    ? base64Image.split(',')[1] ?? base64Image
    : base64Image;

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: rawBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error('analyzeBookCover error:', err);
    return null;
  }
}
