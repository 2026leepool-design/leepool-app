import { expect, test, describe, mock, afterEach } from "bun:test";
import { fetchBitcoinRates, satsToUsd, satsToEur, formatSatsWithUsd } from "./currency";

describe("fetchBitcoinRates", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("returns rates on success", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 65000, eur: 60000 } })
    } as any));

    const rates = await fetchBitcoinRates();
    expect(rates).toEqual({ usd: 65000, eur: 60000 });
  });

  test("returns null if response is not ok", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: false
    } as any));

    const rates = await fetchBitcoinRates();
    expect(rates).toBeNull();
  });

  test("returns null if fetch throws", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Network error")));

    const rates = await fetchBitcoinRates();
    expect(rates).toBeNull();
  });

  test("returns null if rates are missing in response", async () => {
    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 65000 } }) // Missing eur
    } as any));

    const rates = await fetchBitcoinRates();
    expect(rates).toBeNull();
  });
});

describe("satsToUsd", () => {
  test("converts correctly", () => {
    expect(satsToUsd(100_000_000, { usd: 65000, eur: 60000 })).toBe(65000);
    expect(satsToUsd(50_000_000, { usd: 65000, eur: 60000 })).toBe(32500);
  });

  test("returns null if rates are null", () => {
    expect(satsToUsd(100_000_000, null)).toBeNull();
  });
});

describe("satsToEur", () => {
  test("converts correctly", () => {
    expect(satsToEur(100_000_000, { usd: 65000, eur: 60000 })).toBe(60000);
    expect(satsToEur(50_000_000, { usd: 65000, eur: 60000 })).toBe(30000);
  });

  test("returns null if rates are null", () => {
    expect(satsToEur(100_000_000, null)).toBeNull();
  });
});

describe("formatSatsWithUsd", () => {
  test("formats correctly with rates", () => {
    expect(formatSatsWithUsd(100_000_000, { usd: 65000, eur: 60000 })).toBe("100,000,000 sats (~$65,000)");
  });

  test("formats correctly without rates", () => {
    expect(formatSatsWithUsd(100_000_000, null)).toBe("100,000,000 sats");
  });

  test("returns em-dash for null sats", () => {
    expect(formatSatsWithUsd(null, { usd: 65000, eur: 60000 })).toBe("—");
  });
});
