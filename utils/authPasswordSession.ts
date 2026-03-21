/**
 * Oturum boyunca (bellekte) hesap şifresi — yalnızca aynı oturumda buluta Nostr push için.
 * Çıkışta temizlenir; kalıcı olarak saklanmaz.
 */
let cachedAccountPassword: string | null = null;

export function setCachedAccountPassword(password: string | null): void {
  cachedAccountPassword = password?.length ? password : null;
}

export function getCachedAccountPassword(): string | null {
  return cachedAccountPassword;
}
