import { expect, test, describe } from "bun:test";
import { formatSatsWithUsd, BtcRates } from "./currency";

const mockRates: BtcRates = {
  usd: 50000,
  eur: 45000,
};

describe("formatSatsWithUsd", () => {
  test("returns em-dash when sats is null", () => {
    expect(formatSatsWithUsd(null, mockRates)).toBe("—");
  });

  test("returns em-dash when sats is 0", () => {
    expect(formatSatsWithUsd(0, mockRates)).toBe("—");
  });

  test("returns only sats string when rates is null", () => {
    expect(formatSatsWithUsd(100000000, null)).toBe("100,000,000 sats");
  });

  test("returns formatted sats and USD for 1 BTC", () => {
    expect(formatSatsWithUsd(100000000, mockRates)).toBe("100,000,000 sats (~$50,000)");
  });

  test("returns formatted sats and USD for typical amount", () => {
    // 150,000 / 100,000,000 * 50,000 = 0.0015 * 50,000 = 75
    expect(formatSatsWithUsd(150000, mockRates)).toBe("150,000 sats (~$75)");
  });

  test("handles large values correctly with comma separators", () => {
    expect(formatSatsWithUsd(1000000000, mockRates)).toBe("1,000,000,000 sats (~$500,000)");
  });

  test("handles fractional USD values by formatting with locale (defaulting to 0 decimal places for large enough amounts)", () => {
    const lowRates: BtcRates = { usd: 10000, eur: 9000 };
    // 1000 sats at $10,000 BTC is $0.1
    // toLocaleString() for 0.1 might be "0.1" or "0" depending on environment,
    // but the current implementation uses satsToUsd which returns a number,
    // then usdVal.toLocaleString() is called.
    expect(formatSatsWithUsd(1000, lowRates)).toBe("1,000 sats (~$0.1)");
  });

  test("returns formatted sats even if usd calculation results in 0", () => {
    const veryLowRates: BtcRates = { usd: 1, eur: 1 };
    // 1 sat at $1 BTC is very small
    expect(formatSatsWithUsd(1, veryLowRates)).toBe("1 sats (~$0)");
  });
});
