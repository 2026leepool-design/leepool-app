const BOOKS_FETCH_HEADERS: HeadersInit = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

export type BookApiResult = {
  title: string;
  author: string;
  totalPages: number;
  cover_url: string | null;
  isbn: string | null;
  page_count?: number | null;
  categories?: string[] | null;
  average_rating?: number | null;
  ratings_count?: number | null;
  maturity_rating?: string | null;
  language?: string | null;
  first_publish_year?: number | null;
  subjects?: string[] | null;
};

/**
 * Fetches book details by ISBN. Tries Google Books first, then OpenLibrary.
 */
export async function fetchBookByISBN(
  isbn: string
): Promise<BookApiResult | null> {
  const cleanIsbn = String(isbn).replace(/\D/g, '');

  if (!cleanIsbn) return null;

  // Stage 1: Google Books
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    const data = (await res.json()) as {
      items?: Array<{ volumeInfo?: GoogleVolumeInfo }>;
    };

    if (data.items && data.items.length > 0) {
      const v = data.items[0].volumeInfo ?? {};
      const meta = richMetaFromGoogleVolume(v, cleanIsbn);
      let cover = v.imageLinks?.thumbnail ?? null;
      if (cover && cover.startsWith('http:')) {
        cover = 'https:' + cover.slice(5);
      }
      return {
        title: v.title ?? '',
        author: (v.authors?.[0] ?? '').trim(),
        totalPages: v.pageCount ?? 0,
        cover_url: cover,
        isbn: (meta.isbn ?? cleanIsbn) || null,
        ...meta,
      };
    }
  } catch {
    // continue to fallback
  }

  // Stage 2: OpenLibrary
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    const data = (await res.json()) as Record<
      string,
      {
        title?: string;
        authors?: Array<{ name?: string }>;
        number_of_pages?: number;
        cover?: { medium?: string; large?: string };
        works?: Array<{ key?: string }>;
      }
    >;

    const key = `ISBN:${cleanIsbn}`;
    const book = data[key];

    if (book) {
      const cover =
        book.cover?.medium ?? book.cover?.large ?? null;
      const b = book as typeof book & { subjects?: Array<{ name?: string }> };
      const subjectNames =
        Array.isArray(b.subjects) && b.subjects.length
          ? b.subjects.map((s) => s?.name).filter((x): x is string => !!x?.trim())
          : null;
      return {
        title: book.title ?? '',
        author: (book.authors?.[0]?.name ?? '').trim(),
        totalPages: book.number_of_pages ?? 0,
        cover_url: cover,
        isbn: cleanIsbn || null,
        page_count: book.number_of_pages ?? null,
        subjects: subjectNames?.length ? subjectNames : null,
        first_publish_year: parseYearFromDate(
          (book as { publish_date?: string }).publish_date
        ),
      };
    }
  } catch {
    // both failed
  }

  return null;
}

/** Google Books volumeInfo (kullanılan alanlar) */
export type GoogleVolumeInfo = {
  title?: string;
  authors?: string[];
  pageCount?: number;
  categories?: string[];
  averageRating?: number;
  ratingsCount?: number;
  maturityRating?: string;
  language?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  publishedDate?: string;
};

export type SmartBookData = {
  title: string;
  author: string;
  cover_url: string | null;
  totalPages: number;
  isbn: string | null;
  first_publish_year: number | null;
  translator: string | null;
  original_title: string | null;
  page_count?: number | null;
  categories?: string[] | null;
  average_rating?: number | null;
  ratings_count?: number | null;
  maturity_rating?: string | null;
  language?: string | null;
  subjects?: string[] | null;
};

/**
 * Formdaki yazar alanı doluysa, eşleşen yazarlı sonuçları listenin üstüne alır.
 */
export function sortSearchResultsByScreenAuthor<T extends { author?: string | null }>(
  results: T[],
  screenAuthor: string
): T[] {
  const h = screenAuthor.trim().toLowerCase();
  if (!h || !results.length) return results;

  const score = (author: string | null | undefined): number => {
    const a = (author ?? '').trim().toLowerCase();
    if (!a) return 0;
    if (a === h) return 4;
    if (a.includes(h) || h.includes(a)) return 3;
    const parts = a.split(/[,&;/]/).map((x) => x.trim()).filter(Boolean);
    for (const p of parts) {
      if (p === h || p.includes(h) || h.includes(p)) return 2;
    }
    return 0;
  };

  return [...results].sort((x, y) => score(y.author) - score(x.author));
}

export function pickIsbnFromIndustryIdentifiers(
  ids: Array<{ type?: string; identifier?: string }> | undefined,
  fallback?: string | null
): string | null {
  if (!ids?.length) return fallback ?? null;
  const i13 = ids.find((x) => x.type === 'ISBN_13')?.identifier;
  const i10 = ids.find((x) => x.type === 'ISBN_10')?.identifier;
  const raw = i13 ?? i10 ?? null;
  return raw ? String(raw).replace(/\s/g, '') : fallback ?? null;
}

/** volumeInfo → zengin meta (totalPages alanını çağıran doldurur). */
export function richMetaFromGoogleVolume(
  v: GoogleVolumeInfo | undefined,
  fallbackIsbn?: string | null
): Partial<SmartBookData> {
  if (!v) return {};
  const isbn = pickIsbnFromIndustryIdentifiers(v.industryIdentifiers, fallbackIsbn);
  const pc = v.pageCount != null && v.pageCount > 0 ? v.pageCount : null;
  return {
    page_count: pc,
    categories: v.categories?.filter(Boolean).length ? [...v.categories!] : null,
    average_rating: v.averageRating != null ? Number(v.averageRating) : null,
    ratings_count: v.ratingsCount != null ? Math.round(Number(v.ratingsCount)) : null,
    maturity_rating: v.maturityRating?.trim() || null,
    language: v.language?.trim() || null,
    isbn,
    first_publish_year: parseYearFromDate(v.publishedDate),
  };
}

function parseYearFromDate(s: string | undefined): number | null {
  if (!s?.trim()) return null;
  const y = parseInt(s.slice(0, 4), 10);
  return !isNaN(y) ? y : null;
}

async function fetchOpenLibraryWorkOriginalTitle(workKey: string): Promise<string | null> {
  try {
    const id = workKey.replace(/^\//, '').replace(/\.json$/, '');
    const url = `https://openlibrary.org/${id}.json`;
    const res = await fetch(url);
    const work = (await res.json()) as { original_title?: string; title?: string };
    return work?.original_title?.trim() ?? null;
  } catch {
    return null;
  }
}

export type AuthorBookItem = {
  id: string;
  title: string;
  cover_url: string | null;
  totalPages: number | null;
  isbn: string | null;
  first_publish_year: number | null;
  original_title: string | null;
  page_count?: number | null;
  categories?: string[] | null;
  average_rating?: number | null;
  ratings_count?: number | null;
  maturity_rating?: string | null;
  language?: string | null;
  subjects?: string[] | null;
};

/**
 * Fetches up to 10 books by author from Google Books.
 */
export async function fetchBooksByAuthor(author: string): Promise<AuthorBookItem[]> {
  const cleanAuthor = author.trim();
  if (!cleanAuthor) return [];

  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=inauthor:${encodeURIComponent(cleanAuthor)}&maxResults=10`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        volumeInfo?: GoogleVolumeInfo;
      }>;
    };

    if (!data.items?.length) return [];

    return data.items
      .filter((item) => item.volumeInfo?.title)
      .map((item) => {
        const v = item.volumeInfo ?? {};
        const meta = richMetaFromGoogleVolume(v);
        let cover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
        if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
        return {
          id: item.id ?? Math.random().toString(),
          title: (v.title ?? '').trim(),
          cover_url: cover,
          totalPages: v.pageCount ?? null,
          isbn: meta.isbn ?? null,
          first_publish_year: meta.first_publish_year ?? parseYearFromDate(v.publishedDate),
          original_title: null,
          ...meta,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Enhanced search that returns multiple potential book matches.
 */
export async function searchBooksMulti(
  isbn: string,
  title: string,
  author: string
): Promise<SmartBookData[]> {
  const cleanIsbn = String(isbn).trim().replace(/\D/g, '');
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  
  const results: SmartBookData[] = [];
  const seenIsbns = new Set<string>();

  // Helper to add unique results
  const addResult = (item: SmartBookData) => {
    const key = `${item.title}-${item.author}`.toLowerCase();
    if (!seenIsbns.has(key)) {
      results.push(item);
      seenIsbns.add(key);
    }
  };

  // 1. Try ISBN if provided
  if (cleanIsbn) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const data = (await res.json()) as { items?: Array<{ volumeInfo?: GoogleVolumeInfo }> };
      if (data.items) {
        for (const item of data.items) {
          const v = item.volumeInfo ?? {};
          const meta = richMetaFromGoogleVolume(v, cleanIsbn);
          let cover = v.imageLinks?.thumbnail || null;
          if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
          addResult({
            title: v.title || '',
            author: (v.authors?.[0] || '').trim(),
            cover_url: cover,
            totalPages: v.pageCount || 0,
            isbn: (meta.isbn ?? cleanIsbn) || null,
            first_publish_year: meta.first_publish_year ?? parseYearFromDate(v.publishedDate),
            translator: null,
            original_title: null,
            ...meta,
          });
        }
      }
    } catch {}
  }

  // 2. Try Title + Author
  const query = `${cleanTitle} ${cleanAuthor}`.trim();
  if (query) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const data = (await res.json()) as { items?: Array<{ volumeInfo?: GoogleVolumeInfo }> };
      if (data.items) {
        for (const item of data.items) {
          const v = item.volumeInfo ?? {};
          const meta = richMetaFromGoogleVolume(v);
          let cover = v.imageLinks?.thumbnail || null;
          if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
          addResult({
            title: v.title || '',
            author: (v.authors?.[0] || '').trim(),
            cover_url: cover,
            totalPages: v.pageCount || 0,
            isbn: meta.isbn ?? null,
            first_publish_year: meta.first_publish_year ?? parseYearFromDate(v.publishedDate),
            translator: null,
            original_title: null,
            ...meta,
          });
        }
      }
    } catch {}

    // OpenLibrary multi search
    try {
      const olRes = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&limit=8`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const olData = (await olRes.json()) as {
        docs?: Array<{
          title?: string;
          author_name?: string[];
          cover_i?: number;
          number_of_pages_median?: number;
          isbn?: string[];
          first_publish_year?: number;
          subject?: string[];
        }>;
      };
      if (olData.docs) {
        for (const d of olData.docs) {
          const subs = Array.isArray(d.subject) ? d.subject.filter((s) => typeof s === 'string' && s.trim()) : [];
          addResult({
            title: d.title || '',
            author: d.author_name?.[0] || cleanAuthor,
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
            totalPages: d.number_of_pages_median || 0,
            isbn: d.isbn?.[0] || null,
            first_publish_year: d.first_publish_year || null,
            translator: null,
            original_title: null,
            page_count: d.number_of_pages_median || null,
            subjects: subs.length ? subs.slice(0, 40) : null,
          });
        }
      }
    } catch {}
  }

  // Yedek: Google boş kaldıysa Open Library genel arama (yazar soyadı, tek başlık vb.)
  const fallbackQ = cleanIsbn || `${cleanTitle} ${cleanAuthor}`.trim();
  if (results.length === 0 && fallbackQ) {
    try {
      const olRes = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(fallbackQ)}&limit=20`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const olData = (await olRes.json()) as {
        docs?: Array<{
          title?: string;
          author_name?: string[];
          cover_i?: number;
          number_of_pages_median?: number;
          isbn?: string[];
          first_publish_year?: number;
          subject?: string[];
        }>;
      };
      if (olData.docs) {
        for (const d of olData.docs) {
          const subs = Array.isArray(d.subject) ? d.subject.filter((s) => typeof s === 'string' && s.trim()) : [];
          addResult({
            title: d.title || '',
            author: d.author_name?.[0] || cleanAuthor || cleanTitle || '',
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
            totalPages: d.number_of_pages_median || 0,
            isbn: d.isbn?.[0] || null,
            first_publish_year: d.first_publish_year || null,
            translator: null,
            original_title: null,
            page_count: d.number_of_pages_median || null,
            subjects: subs.length ? subs.slice(0, 40) : null,
          });
        }
      }
    } catch {}
  }

  return results;
}

/**
 * Fetches book data with ISBN-first logic, then title+author fallback.
 * Also tries to extract original_title from OpenLibrary work.
 */
export async function fetchSmartBookData(
  isbn: string,
  title: string,
  author: string
): Promise<SmartBookData | null> {
  const cleanIsbn = String(isbn).trim().replace(/\D/g, '');
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();

  let result: Partial<SmartBookData> = {
    title: cleanTitle,
    author: cleanAuthor,
    cover_url: null,
    totalPages: 0,
    isbn: null,
    first_publish_year: null,
    translator: null,
    original_title: null,
  };

  // Step 1: ISBN priority
  if (cleanIsbn) {
    // Google Books by ISBN
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const data = (await res.json()) as {
        items?: Array<{ volumeInfo?: GoogleVolumeInfo }>;
      };

      if (data.items?.length) {
        const v = data.items[0].volumeInfo ?? {};
        const meta = richMetaFromGoogleVolume(v, cleanIsbn);
        let cover = v.imageLinks?.thumbnail ?? null;
        if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
        return {
          title: (v.title ?? cleanTitle).trim(),
          author: (v.authors?.[0] ?? cleanAuthor).trim(),
          cover_url: cover,
          totalPages: v.pageCount ?? 0,
          isbn: (meta.isbn ?? cleanIsbn) || null,
          first_publish_year: meta.first_publish_year ?? parseYearFromDate(v.publishedDate),
          translator: null,
          original_title: null,
          ...meta,
        };
      }
    } catch {}

    // OpenLibrary by ISBN
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(cleanIsbn)}&jscmd=data&format=json`,
        { headers: BOOKS_FETCH_HEADERS }
      );
      const data = (await res.json()) as Record<string, unknown>;
      const key = `ISBN:${cleanIsbn}`;
      const book = data[key] as {
        title?: string;
        authors?: Array<{ name?: string }>;
        number_of_pages?: number;
        cover?: { medium?: string; large?: string };
        works?: Array<{ key?: string }>;
        subjects?: Array<{ name?: string }>;
        publish_date?: string;
      } | undefined;

      if (book) {
        const cover = book.cover?.medium ?? book.cover?.large ?? null;
        const workKey = book.works?.[0]?.key;
        let original_title: string | null = null;
        if (workKey) {
          original_title = await fetchOpenLibraryWorkOriginalTitle(workKey);
        }
        const subjectNames =
          Array.isArray(book.subjects) && book.subjects.length
            ? book.subjects.map((s) => s?.name).filter((x): x is string => !!x?.trim())
            : null;
        const np = book.number_of_pages ?? 0;
        return {
          title: (book.title ?? cleanTitle).trim(),
          author: (book.authors?.[0]?.name ?? cleanAuthor).trim(),
          cover_url: cover,
          totalPages: np,
          isbn: cleanIsbn,
          first_publish_year: parseYearFromDate(book.publish_date),
          translator: null,
          original_title,
          page_count: np > 0 ? np : null,
          subjects: subjectNames?.length ? subjectNames : null,
        };
      }
    } catch {}
  }

  // Step 2: Title + Author fallback
  const query = `${cleanTitle} ${cleanAuthor}`.trim();
  if (!query) return null;

  const encodedQuery = encodeURIComponent(query);

  // Google Books
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    const data = (await res.json()) as {
      items?: Array<{ volumeInfo?: GoogleVolumeInfo }>;
    };

    if (data.items?.length) {
      const v = data.items[0].volumeInfo ?? {};
      const meta = richMetaFromGoogleVolume(v);
      let cover = v.imageLinks?.thumbnail ?? null;
      if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
      return {
        title: (v.title ?? cleanTitle).trim(),
        author: (v.authors?.[0] ?? cleanAuthor).trim(),
        cover_url: cover,
        totalPages: v.pageCount ?? 0,
        isbn: meta.isbn ?? null,
        first_publish_year: meta.first_publish_year ?? parseYearFromDate(v.publishedDate),
        translator: null,
        original_title: null,
        ...meta,
      };
    }
  } catch {}

  // OpenLibrary search
  try {
    const encodedTitle = encodeURIComponent(cleanTitle);
    const encodedAuthor = encodeURIComponent(cleanAuthor);
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodedTitle}&author=${encodedAuthor}`,
      { headers: BOOKS_FETCH_HEADERS }
    );
    const data = (await res.json()) as {
      docs?: Array<{
        key?: string;
        title?: string;
        cover_i?: number;
        number_of_pages_median?: number;
        isbn?: string[];
        first_publish_year?: number;
        subject?: string[];
      }>;
    };

    if (data.docs?.length) {
      const d = data.docs[0];
      let cover_url: string | null = null;
      if (d.cover_i) {
        cover_url = `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
      }
      let original_title: string | null = null;
      if (d.key) {
        original_title = await fetchOpenLibraryWorkOriginalTitle(d.key);
      }
      const docTitle = d.title ?? cleanTitle;
      const subs = Array.isArray(d.subject)
        ? d.subject.filter((s) => typeof s === 'string' && s.trim())
        : [];
      const tpm = d.number_of_pages_median ?? 0;
      return {
        title: docTitle.trim(),
        author: cleanAuthor,
        cover_url,
        totalPages: tpm,
        isbn: d.isbn?.[0] ?? null,
        first_publish_year: d.first_publish_year ?? null,
        translator: null,
        original_title,
        page_count: tpm > 0 ? tpm : null,
        subjects: subs.length ? subs.slice(0, 40) : null,
      };
    }
  } catch {}

  return null;
}
