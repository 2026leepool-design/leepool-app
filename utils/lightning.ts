import { Linking, Alert } from 'react-native';

/**
 * LUD-16: Pay a Lightning invoice via Lightning Address.
 * Resolves the address, fetches the invoice (pr), and opens the user's wallet.
 * @param lightningAddress - e.g. "user@domain.com"
 * @param amountSats - Amount in satoshis
 * @param comment - Optional comment for the payment
 * @param errorTitle - Translated "Error" string (pass t('error'))
 */
export async function payLightningInvoice(
  lightningAddress: string,
  amountSats: number,
  comment: string = '',
  errorTitle: string = 'Error'
): Promise<void> {
  try {
    const trimmed = lightningAddress.trim().toLowerCase();
    const atIndex = trimmed.indexOf('@');
    if (atIndex < 1 || atIndex === trimmed.length - 1) {
      throw new Error('Invalid Lightning address. Example: user@getalby.com');
    }

    const username = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

    const res1 = await fetch(lnurlpUrl);
    if (!res1.ok) {
      throw new Error(`Lightning address could not be resolved (${res1.status})`);
    }

    const json1 = (await res1.json()) as { callback?: string; status?: string; reason?: string };
    const callback = json1.callback;
    if (!callback || typeof callback !== 'string') {
      throw new Error('Lightning server returned an invalid response.');
    }

    const millisats = amountSats * 1000;
    const params = new URLSearchParams({ amount: String(millisats) });
    if (comment.trim()) {
      params.set('comment', comment.trim());
    }
    const callbackUrl = `${callback}${callback.includes('?') ? '&' : '?'}${params.toString()}`;

    const res2 = await fetch(callbackUrl);
    if (!res2.ok) {
      throw new Error(`Could not fetch invoice (${res2.status})`);
    }

    const json2 = (await res2.json()) as { pr?: string; status?: string; reason?: string };
    if (json2.status === 'ERROR' && json2.reason) {
      throw new Error(json2.reason);
    }

    const pr = json2.pr;
    if (!pr || typeof pr !== 'string') {
      throw new Error('Payment invoice could not be obtained.');
    }

    const lightningUri = `lightning:${pr}`;
    const canOpen = await Linking.canOpenURL(lightningUri);
    if (!canOpen) {
      throw new Error('No Lightning wallet found. Please install a Lightning wallet app.');
    }

    await Linking.openURL(lightningUri);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment could not be initiated.';
    Alert.alert(errorTitle, message);
    throw err;
  }
}
