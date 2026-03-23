import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type BookCardMetaProps = {
  /** Google / DB metadata; yoksa `totalPages` kullanılır */
  page_count?: number | null;
  total_pages?: number | null;
  average_rating?: number | null;
};

function safePositiveInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function resolvePageDisplay(props: BookCardMetaProps): number | null {
  const fromMeta = safePositiveInt(props.page_count);
  if (fromMeta != null) return fromMeta;
  return safePositiveInt(props.total_pages);
}

/**
 * Liste kartlarında kapak veya başlık köşesi için kompakt sayfa + puan satırı.
 */
export function BookCardMetaChips({
  page_count,
  total_pages,
  average_rating,
  variant = 'row',
}: BookCardMetaProps & { variant?: 'row' | 'column' }) {
  const pages = resolvePageDisplay({ page_count, total_pages });
  const ratingRaw =
    average_rating == null ? NaN : Number(average_rating);
  const rating =
    Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : null;

  if (pages == null && rating == null) return null;

  return (
    <View
      className={variant === 'column' ? 'items-end gap-1' : 'flex-row items-center gap-2 flex-wrap'}
      style={variant === 'row' ? { marginTop: 4 } : undefined}>
      {pages != null ? (
        <View
          className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
            borderWidth: 1,
            borderColor: 'rgba(0, 229, 255, 0.25)',
          }}>
          <Ionicons name="document-text-outline" size={11} color="#00E5FF" />
          <Text
            className="text-[#8892B0] text-[9px]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            numberOfLines={1}>
            {pages.toLocaleString()}
          </Text>
        </View>
      ) : null}
      {rating != null ? (
        <View
          className="flex-row items-center gap-0.5 px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(250, 204, 21, 0.1)',
            borderWidth: 1,
            borderColor: 'rgba(250, 204, 21, 0.35)',
          }}>
          <Text style={{ fontSize: 9 }}>⭐️</Text>
          <Text
            className="text-[#FACC15] text-[9px]"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            {rating.toFixed(1)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
