import { supabase } from '@/utils/supabase';
import {
  decryptNsecFromProfile,
  encryptNsecForProfile,
  generateNostrKeySalt,
} from '@/utils/nostrCrypto';
import {
  generateAndSaveKeys,
  importNsecKey,
  loadKeys,
  parseNsecKeyMaterial,
  type NostrKeys,
} from '@/utils/nostr';

type ProfileRow = {
  npub: string | null;
  encrypted_nsec: string | null;
};

/**
 * E-posta/şifre ile giriş veya kayıt sonrası: Supabase profili kaynak kabul edilir.
 * - Sunucuda sealed nsec varsa → çöz, yerel depoya yaz (web: localStorage, native: SecureStore).
 * - Yoksa → yerelde anahtar varsa buluta yükle; yoksa yeni çift üret ve buluta yaz.
 */
export async function syncNostrProfileAfterAuth(password: string, userId?: string): Promise<void> {
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) return;
    finalUserId = user.id;
  }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('npub, encrypted_nsec')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr) throw profErr;

  const row = profile as ProfileRow | null;

  if (row?.encrypted_nsec?.trim()) {
    const nsec = await decryptNsecFromProfile(
      row.encrypted_nsec,
      password,
      null,
      finalUserId
    );
    if (!nsec) {
      throw new Error('NOSTR_DECRYPT_FAILED');
    }
    await importNsecKey(nsec);
    return;
  }

  const local = await loadKeys();
  if (local) {
    const saltHex = generateNostrKeySalt();
    const encrypted = await encryptNsecForProfile(
      local.nsec,
      password,
      saltHex,
      finalUserId
    );
    const { error: upErr } = await supabase.from('profiles').upsert(
      {
        id: finalUserId,
        npub: local.npub,
        encrypted_nsec: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (upErr) throw upErr;
    return;
  }

  const keys = await generateAndSaveKeys();
  const saltHex = generateNostrKeySalt();
  const encrypted = await encryptNsecForProfile(keys.nsec, password, saltHex, finalUserId);
  const { error: upErr } = await supabase.from('profiles').upsert(
    {
      id: finalUserId,
      npub: keys.npub,
      encrypted_nsec: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (upErr) throw upErr;
}

/**
 * Dışarıdan nsec içe aktarır: doğrula → LeePool şifresiyle şifrele → Supabase profiles güncelle → yerel depoyu yeni anahtarla yazar.
 * Önce buluta yazılır; başarısız olursa mevcut yerel anahtar korunur.
 */
export async function importNostrKeyAndSealToProfile(
  nsecRaw: string,
  accountPassword: string,
  userId?: string
): Promise<NostrKeys> {
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) throw new Error('no user');
    finalUserId = user.id;
  }

  const keys = parseNsecKeyMaterial(nsecRaw);

  const saltHex = generateNostrKeySalt();
  const encrypted = await encryptNsecForProfile(
    keys.nsec,
    accountPassword,
    saltHex,
    finalUserId
  );

  const { error: upErr } = await supabase.from('profiles').upsert(
    {
      id: finalUserId,
      npub: keys.npub,
      encrypted_nsec: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (upErr) throw upErr;

  await importNsecKey(nsecRaw.trim());
  return keys;
}

/** Yereldeki anahtarı (import/generate sonrası) profile şifreleyerek yazar. */
export async function pushNostrProfileFromLocalKeys(password: string, userId?: string): Promise<void> {
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) throw new Error('no user');
    finalUserId = user.id;
  }

  const local = await loadKeys();
  if (!local) throw new Error('no local keys');

  const saltHex = generateNostrKeySalt();
  const encrypted = await encryptNsecForProfile(
    local.nsec,
    password,
    saltHex,
    finalUserId
  );

  const { error } = await supabase.from('profiles').upsert(
    {
      id: finalUserId,
      npub: local.npub,
      encrypted_nsec: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

/** Yerel anahtar yok ama bulutta yedek var — şifre ile geri yükle. */
export async function restoreNostrFromCloud(password: string, userId?: string): Promise<void> {
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) throw new Error('no user');
    finalUserId = user.id;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('encrypted_nsec')
    .eq('id', finalUserId)
    .maybeSingle();

  if (error) throw error;
  const row = profile as ProfileRow | null;
  if (!row?.encrypted_nsec?.trim()) {
    throw new Error('no cloud backup');
  }

  const nsec = await decryptNsecFromProfile(
    row.encrypted_nsec,
    password,
    null,
    finalUserId
  );
  if (!nsec) throw new Error('NOSTR_DECRYPT_FAILED');
  await importNsecKey(nsec);
}

/** Kimlik silindiğinde uzak profildeki Nostr alanlarını temizle. */
export async function clearNostrProfileRemote(userId?: string): Promise<void> {
  let finalUserId = userId;
  if (!finalUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    finalUserId = user.id;
  }

  await supabase
    .from('profiles')
    .update({
      npub: null,
      encrypted_nsec: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', finalUserId);
}
