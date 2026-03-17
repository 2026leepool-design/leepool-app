import { supabase } from '@/utils/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Alıcının kayıtlı cihaz token'larına Expo Push ile bildirim gönderir (istemci tarafı).
 * Token yoksa veya hata olursa sessizce döner.
 */
export async function sendPushNotification(
  targetNpub: string | null | undefined,
  title: string,
  body: string
): Promise<void> {
  const npub = targetNpub?.trim();
  if (!npub || !title?.trim()) return;

  try {
    const { data: rows, error } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('npub', npub);

    if (error || !rows?.length) {
      console.log('Alıcının bildirim tokenı bulunamadı, sessiz kalınıyor.');
      return;
    }

    const tokens = [...new Set(rows.map((r) => r.token).filter(Boolean))] as string[];
    if (!tokens.length) return;

    const messages = tokens.map((to) => ({
      to,
      sound: 'default' as const,
      title,
      body,
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Expo push HTTP hatası:', res.status, text);
      return;
    }

    console.log('ŞİMŞEK ÇAKTI: Bildirim başarıyla fırlatıldı!');
  } catch (err) {
    console.error('Bildirim gönderilirken hata:', err);
  }
}
