export type BtcRates = {
  usd: number;
  eur: number;
  try?: number;
};

export type DisplayCurrency = 'USD' | 'EUR' | 'TRY' | 'BTC' | 'SATS';

export async function fetchBitcoinRates(): Promise<BtcRates | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,try',
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { bitcoin?: { usd?: number; eur?: number; try?: number } };
    const usd = json?.bitcoin?.usd;
    const eur = json?.bitcoin?.eur;
    const tryRate = json?.bitcoin?.try;
    if (!usd || !eur || !tryRate) return null;
    return { usd, eur, try: tryRate };
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

export function satsToTry(sats: number, rates: BtcRates | null): number | null {
  if (!rates) return null;
  return (sats / 100_000_000) * (rates.try ?? 0);
}

export function formatSatsValue(sats: number, currency: DisplayCurrency, rates: BtcRates | null): string {
  if (currency === 'SATS') return `${Math.round(sats).toLocaleString()} sats`;
  if (currency === 'BTC') return `${(sats / 100_000_000).toFixed(8)} BTC`;
  const rate = currency === 'USD' ? rates?.usd : currency === 'EUR' ? rates?.eur : rates?.try;
  if (!rate) return '—';
  return ((sats / 100_000_000) * rate).toLocaleString(undefined, { style: 'currency', currency });
}

/** Format sats value with optional USD equivalent: "⚡ 150,000 sats (~$97)" */
export function formatSatsWithUsd(sats: number | null, rates: BtcRates | null): string {
  if (!sats) return '—';
  const usdVal = satsToUsd(sats, rates);
  const satsStr = `${sats.toLocaleString()} sats`;
  if (usdVal === null) return satsStr;
  return `${satsStr} (~$${usdVal.toLocaleString()})`;
}
