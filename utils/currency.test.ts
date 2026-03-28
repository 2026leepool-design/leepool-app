import { describe, it, expect } from 'bun:test';
import { satsToUsd, satsToEur, type BtcRates } from './currency';

describe('satsToUsd', () => {
  it('should return null when rates are null', () => {
    expect(satsToUsd(100, null)).toBeNull();
  });

  it('should correctly convert 1 BTC (100,000,000 sats) to USD', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToUsd(100_000_000, rates)).toBe(60000);
  });

  it('should correctly convert smaller amounts to USD', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToUsd(50_000_000, rates)).toBe(30000);
    expect(satsToUsd(1_000_000, rates)).toBe(600);
  });

  it('should return 0 when converting 0 sats', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToUsd(0, rates)).toBe(0);
  });
});

describe('satsToEur', () => {
  it('should return null when rates are null', () => {
    expect(satsToEur(100, null)).toBeNull();
  });

  it('should correctly convert 1 BTC (100,000,000 sats) to EUR', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToEur(100_000_000, rates)).toBe(50000);
  });

  it('should correctly convert smaller amounts to EUR', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToEur(50_000_000, rates)).toBe(25000);
    expect(satsToEur(1_000_000, rates)).toBe(500);
  });

  it('should return 0 when converting 0 sats', () => {
    const rates: BtcRates = { usd: 60000, eur: 50000 };
    expect(satsToEur(0, rates)).toBe(0);
  });
});
