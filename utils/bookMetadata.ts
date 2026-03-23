/**
 * JSONB veya text[] Supabase cevaplarını güvenle string[] yapar.
 */
export function parseStringArrayField(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
      }
    } catch {
      // plain string — treat as single tag
      return [t];
    }
  }
  return [];
}

export function commaSeparatedToArray(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function arrayToCommaSeparated(arr: string[] | null | undefined): string {
  if (!arr?.length) return '';
  return arr.join(', ');
}

export function formatLanguageCode(lang: string | null | undefined): string {
  if (!lang?.trim()) return '—';
  return lang.trim().split(/[-_]/)[0].toUpperCase();
}
