import type { User } from '@supabase/supabase-js';

/** Profile → user_metadata.default_lightning_address (LUD-16 / LN address). */
export function getDefaultLightningWalletFromMetadata(
  user: User | null | undefined
): string | null {
  const raw = user?.user_metadata?.default_lightning_address;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
