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
} from '@/utils/nostr';

type ProfileRow = {
  npub: string | null;
  encrypted_nsec: string | null;
};

/**
 * E-posta/şifre ile giriş veya kayıt sonrası: Supabase profili kaynak kabul edilir.
 * - Sunucuda sealed nsec varsa → çöz, SecureStore'a yaz.
 * - Yoksa → yerelde anahtar varsa buluta yükle; yoksa yeni çift üret ve buluta yaz.
 */
export async function syncNostrProfileAfterAuth(password: string): Promise<void> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) return;

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
      user.id
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
      user.id
    );
    const { error: upErr } = await supabase.from('profiles').upsert(
      {
        id: user.id,
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
  const encrypted = await encryptNsecForProfile(keys.nsec, password, saltHex, user.id);
  const { error: upErr } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      npub: keys.npub,
      encrypted_nsec: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (upErr) throw upErr;
}

/** Yereldeki anahtarı (import/generate sonrası) profile şifreleyerek yazar. */
export async function pushNostrProfileFromLocalKeys(password: string): Promise<void> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) throw new Error('no user');

  const local = await loadKeys();
  if (!local) throw new Error('no local keys');

  const saltHex = generateNostrKeySalt();
  const encrypted = await encryptNsecForProfile(
    local.nsec,
    password,
    saltHex,
    user.id
  );

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      npub: local.npub,
      encrypted_nsec: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

/** SecureStore boş ama bulutta yedek var — şifre ile geri yükle. */
export async function restoreNostrFromCloud(password: string): Promise<void> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.id) throw new Error('no user');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('encrypted_nsec')
    .eq('id', user.id)
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
    user.id
  );
  if (!nsec) throw new Error('NOSTR_DECRYPT_FAILED');
  await importNsecKey(nsec);
}

/** Kimlik silindiğinde uzak profildeki Nostr alanlarını temizle. */
export async function clearNostrProfileRemote(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;

  await supabase
    .from('profiles')
    .update({
      npub: null,
      encrypted_nsec: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
}
