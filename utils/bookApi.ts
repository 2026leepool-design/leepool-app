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
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          pageCount?: number;
          imageLinks?: { thumbnail?: string };
        };
      }>;
    };

    if (data.items && data.items.length > 0) {
      const v = data.items[0].volumeInfo ?? {};
      let cover = v.imageLinks?.thumbnail ?? null;
      if (cover && cover.startsWith('http:')) {
        cover = 'https:' + cover.slice(5);
      }
      return {
        title: v.title ?? '',
        author: (v.authors?.[0] ?? '').trim(),
        totalPages: v.pageCount ?? 0,
        cover_url: cover,
        isbn: cleanIsbn || null,
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
      return {
        title: book.title ?? '',
        author: (book.authors?.[0]?.name ?? '').trim(),
        totalPages: book.number_of_pages ?? 0,
        cover_url: cover,
        isbn: cleanIsbn || null,
      };
    }
  } catch {
    // both failed
  }

  return null;
}

export type SmartBookData = {
  title: string;
  author: string;
  cover_url: string | null;
  totalPages: number;
  isbn: string | null;
  first_publish_year: number | null;
  translator: string | null;
  original_title: string | null;
};

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
        volumeInfo?: {
          title?: string;
          pageCount?: number;
          imageLinks?: { thumbnail?: string; smallThumbnail?: string };
          industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
          publishedDate?: string;
        };
      }>;
    };

    if (!data.items?.length) return [];

    return data.items
      .filter((item) => item.volumeInfo?.title)
      .map((item) => {
        const v = item.volumeInfo ?? {};
        let cover = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null;
        if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
        const ids = v.industryIdentifiers ?? [];
        const id13 = ids.find((x) => x.type === 'ISBN_13') ?? ids.find((x) => x.type === 'ISBN_10');
        return {
          id: item.id ?? Math.random().toString(),
          title: (v.title ?? '').trim(),
          cover_url: cover,
          totalPages: v.pageCount ?? null,
          isbn: id13?.identifier ?? null,
          first_publish_year: parseYearFromDate(v.publishedDate),
          original_title: null,
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
      const data = await res.json();
      if (data.items) {
        for (const item of data.items) {
          const v = item.volumeInfo || {};
          let cover = v.imageLinks?.thumbnail || null;
          if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
          const ids = v.industryIdentifiers || [];
          const id13 = ids.find((x: any) => x.type === 'ISBN_13')?.identifier || ids.find((x: any) => x.type === 'ISBN_10')?.identifier || cleanIsbn;
          addResult({
            title: v.title || '',
            author: (v.authors?.[0] || '').trim(),
            cover_url: cover,
            totalPages: v.pageCount || 0,
            isbn: id13,
            first_publish_year: parseYearFromDate(v.publishedDate),
            translator: null,
            original_title: null,
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
      const data = await res.json();
      if (data.items) {
        for (const item of data.items) {
          const v = item.volumeInfo || {};
          let cover = v.imageLinks?.thumbnail || null;
          if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
          const ids = v.industryIdentifiers || [];
          const id13 = ids.find((x: any) => x.type === 'ISBN_13')?.identifier || ids.find((x: any) => x.type === 'ISBN_10')?.identifier || null;
          addResult({
            title: v.title || '',
            author: (v.authors?.[0] || '').trim(),
            cover_url: cover,
            totalPages: v.pageCount || 0,
            isbn: id13,
            first_publish_year: parseYearFromDate(v.publishedDate),
            translator: null,
            original_title: null,
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
      const olData = await olRes.json();
      if (olData.docs) {
        for (const d of olData.docs) {
          addResult({
            title: d.title || '',
            author: d.author_name?.[0] || cleanAuthor,
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
            totalPages: d.number_of_pages_median || 0,
            isbn: d.isbn?.[0] || null,
            first_publish_year: d.first_publish_year || null,
            translator: null,
            original_title: null,
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
        }>;
      };
      if (olData.docs) {
        for (const d of olData.docs) {
          addResult({
            title: d.title || '',
            author: d.author_name?.[0] || cleanAuthor || cleanTitle || '',
            cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
            totalPages: d.number_of_pages_median || 0,
            isbn: d.isbn?.[0] || null,
            first_publish_year: d.first_publish_year || null,
            translator: null,
            original_title: null,
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
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}`
      );
      const data = (await res.json()) as {
        items?: Array<{
          volumeInfo?: {
            title?: string;
            authors?: string[];
            pageCount?: number;
            imageLinks?: { thumbnail?: string };
            industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
            publishedDate?: string;
          };
        }>;
      };

      if (data.items?.length) {
        const v = data.items[0].volumeInfo ?? {};
        let cover = v.imageLinks?.thumbnail ?? null;
        if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
        const ids = v.industryIdentifiers ?? [];
        const id13 = ids.find((x) => x.type === 'ISBN_13') ?? ids.find((x) => x.type === 'ISBN_10');
        return {
          title: (v.title ?? cleanTitle).trim(),
          author: (v.authors?.[0] ?? cleanAuthor).trim(),
          cover_url: cover,
          totalPages: v.pageCount ?? 0,
          isbn: id13?.identifier ?? cleanIsbn,
          first_publish_year: parseYearFromDate(v.publishedDate),
          translator: null,
          original_title: null,
        };
      }
    } catch {}

    // OpenLibrary by ISBN
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(cleanIsbn)}&jscmd=data&format=json`
      );
      const data = (await res.json()) as Record<string, unknown>;
      const key = `ISBN:${cleanIsbn}`;
      const book = data[key] as {
        title?: string;
        authors?: Array<{ name?: string }>;
        number_of_pages?: number;
        cover?: { medium?: string; large?: string };
        works?: Array<{ key?: string }>;
      } | undefined;

      if (book) {
        const cover = book.cover?.medium ?? book.cover?.large ?? null;
        const workKey = book.works?.[0]?.key;
        let original_title: string | null = null;
        if (workKey) {
          original_title = await fetchOpenLibraryWorkOriginalTitle(workKey);
        }
        return {
          title: (book.title ?? cleanTitle).trim(),
          author: (book.authors?.[0]?.name ?? cleanAuthor).trim(),
          cover_url: cover,
          totalPages: book.number_of_pages ?? 0,
          isbn: cleanIsbn,
          first_publish_year: null,
          translator: null,
          original_title,
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
      `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}`
    );
    const data = (await res.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          pageCount?: number;
          imageLinks?: { thumbnail?: string };
          industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
          publishedDate?: string;
        };
      }>;
    };

    if (data.items?.length) {
      const v = data.items[0].volumeInfo ?? {};
      let cover = v.imageLinks?.thumbnail ?? null;
      if (cover?.startsWith('http:')) cover = 'https:' + cover.slice(5);
      const ids = v.industryIdentifiers ?? [];
      const id13 = ids.find((x) => x.type === 'ISBN_13') ?? ids.find((x) => x.type === 'ISBN_10');
      return {
        title: (v.title ?? cleanTitle).trim(),
        author: (v.authors?.[0] ?? cleanAuthor).trim(),
        cover_url: cover,
        totalPages: v.pageCount ?? 0,
        isbn: id13?.identifier ?? null,
        first_publish_year: parseYearFromDate(v.publishedDate),
        translator: null,
        original_title: null,
      };
    }
  } catch {}

  // OpenLibrary search
  try {
    const encodedTitle = encodeURIComponent(cleanTitle);
    const encodedAuthor = encodeURIComponent(cleanAuthor);
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodedTitle}&author=${encodedAuthor}`
    );
    const data = (await res.json()) as {
      docs?: Array<{
        key?: string;
        title?: string;
        cover_i?: number;
        number_of_pages_median?: number;
        isbn?: string[];
        first_publish_year?: number;
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
      return {
        title: docTitle.trim(),
        author: cleanAuthor,
        cover_url,
        totalPages: d.number_of_pages_median ?? 0,
        isbn: d.isbn?.[0] ?? null,
        first_publish_year: d.first_publish_year ?? null,
        translator: null,
        original_title,
      };
    }
  } catch {}

  return null;
}
