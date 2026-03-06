const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Generates a short multilingual book synopsis using Google Gemini API.
 * Returns JSON: {"tr": "...", "en": "...", "es": "..."}
 * @param title - Book title
 * @param author - Book author
 * @returns The generated JSON string (with backticks stripped), or null on error
 */
export async function generateBookSynopsis(
  title: string,
  author: string
): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    return null;
  }

  const prompt = `Sen profesyonel bir kitap özetleyicisin. Bana ${title} - ${author} kitabı hakkında maksimum 2 cümlelik kısa ve çarpıcı bir özet ver. Rol yapma, yorum ekleme. Yanıtı SADECE şu JSON formatında ver, markdown veya backtick kullanma: {"tr": "Türkçe özet", "en": "English summary", "es": "Resumen en español"}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    let text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    if (text) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    return text;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

export type BookCoverAnalysis = { title: string; author: string };

/**
 * Analyzes a book cover image using Gemini Vision and extracts title/author.
 * @param base64Image - Raw base64 string (without data:image/... prefix)
 * @returns { title, author } or null on error
 */
export async function analyzeBookCover(
  base64Image: string
): Promise<BookCoverAnalysis | null> {
  if (!GEMINI_API_KEY) {
    console.warn('EXPO_PUBLIC_GEMINI_API_KEY is not set');
    return null;
  }

  const prompt =
    'Analyze this book cover. Extract the title and author. Return ONLY a valid JSON object with keys "title" and "author". If you cannot find them, return empty strings. Do not use markdown formatting or backticks.';

  try {
    const response = await fetch(GEMINI_URL, {
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
                  data: base64Image.includes(',')
                    ? base64Image.split(',')[1] ?? base64Image
                    : base64Image,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    let text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    if (!text) return null;

    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(text) as { title?: string; author?: string };
    return {
      title: String(parsed?.title ?? '').trim(),
      author: String(parsed?.author ?? '').trim(),
    };
  } catch (error) {
    console.error('Gemini analyzeBookCover error:', error);
    return null;
  }
}
