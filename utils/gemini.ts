import { supabase } from '@/utils/supabase';

/**
 * Generates a short multilingual book synopsis using Google Gemini API via Supabase Edge Function.
 * Returns JSON: {"tr": "...", "en": "...", "es": "..."}
 * @param title - Book title
 * @param author - Book author
 * @returns The generated JSON string (with backticks stripped), or null on error
 */
export async function generateBookSynopsis(
  title: string,
  author: string
): Promise<string | null> {
  try {
    const { data: responseData, error: invokeError } = await supabase.functions.invoke(
      'gemini-api',
      {
        body: {
          action: 'generateSynopsis',
          payload: { title, author },
        },
      }
    );

    if (invokeError) throw invokeError;
    if (responseData?.error) throw new Error(responseData.error);

    const data = responseData as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    if (text) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0].trim();
    }
    return text;
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

export type BookCoverAnalysis = { title: string; author: string };

/**
 * Analyzes a book cover image using Gemini Vision via Supabase Edge Function and extracts title/author.
 * @param base64Image - Raw base64 string (without data:image/... prefix)
 * @returns { title, author } or null on error
 */
export async function analyzeBookCover(
  base64Image: string
): Promise<BookCoverAnalysis | null> {
  try {
    const { data: responseData, error: invokeError } = await supabase.functions.invoke(
      'gemini-api',
      {
        body: {
          action: 'analyzeBookCover',
          payload: { base64Image },
        },
      }
    );

    if (invokeError) throw invokeError;
    if (responseData?.error) throw new Error(responseData.error);

    const data = responseData as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
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

/**
 * Analyzes a book cover image and returns "Book Title - Author Name" for search via Supabase Edge Function.
 * Used by dashboard omni-search camera flow.
 */
export async function analyzeBookCoverForSearch(
  base64Image: string
): Promise<string | null> {
  try {
    const { data: responseData, error: invokeError } = await supabase.functions.invoke(
      'gemini-api',
      {
        body: {
          action: 'analyzeBookCoverForSearch',
          payload: { base64Image },
        },
      }
    );

    if (invokeError) throw invokeError;
    if (responseData?.error) throw new Error(responseData.error);

    const data = responseData as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    return text;
  } catch (error) {
    console.error('Gemini analyzeBookCoverForSearch error:', error);
    return null;
  }
}
