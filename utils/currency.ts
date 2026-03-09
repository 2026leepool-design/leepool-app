export type BtcRates = {
  usd: number;
  eur: number;
};

export async function fetchBitcoinRates(): Promise<BtcRates | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur',
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { bitcoin?: { usd?: number; eur?: number } };
    const usd = json?.bitcoin?.usd;
    const eur = json?.bitcoin?.eur;
    if (!usd || !eur) return null;
    return { usd, eur };
  } catch {
    return null;
  }
}

/** Convert satoshis to USD. Returns null if rates unavailable. */
export function satsToUsd(sats: number, rates: BtcRates | null): number | null {
  if (!rates) return null;
  return (sats / 100_000_000) * rates.usd;
}

/** Convert satoshis to EUR. Returns null if rates unavailable. */
export function satsToEur(sats: number, rates: BtcRates | null): number | null {
  if (!rates) return null;
  return (sats / 100_000_000) * rates.eur;
}

/** Format sats value with optional USD equivalent: "⚡ 150,000 sats (~$97)" */
export function formatSatsWithUsd(sats: number | null, rates: BtcRates | null): string {
  if (!sats) return '—';
  const usdVal = satsToUsd(sats, rates);
  const satsStr = `${sats.toLocaleString()} sats`;
  if (usdVal === null) return satsStr;
  return `${satsStr} (~$${usdVal.toLocaleString()})`;
}
