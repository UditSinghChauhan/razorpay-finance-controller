import { describe, expect, it } from "vitest";

import { AMOUNT_QUANTILES } from "../src/amount-table.js";
import { discreteQuantile, drawAmount, feeBreakdown, quantileErrorBps, rateBpsFor } from "../src/amount.js";
import { AMOUNT_DISTRIBUTION, FEE_RATE_BPS, F03_CARD_RATE_BPS_AFTER } from "../src/frozen.js";
import { Prng } from "../src/prng.js";

describe("§4.2 the payment amount distribution", () => {
  it("realizes the frozen median and p99 to within 15 bps", () => {
    expect(quantileErrorBps(0.5, AMOUNT_DISTRIBUTION.median_paise)).toBeLessThanOrEqual(15);
    expect(quantileErrorBps(0.99, AMOUNT_DISTRIBUTION.p99_paise)).toBeLessThanOrEqual(15);
    expect(discreteQuantile(0.5)).toBeGreaterThan(180_000);
    expect(discreteQuantile(0.99)).toBeGreaterThan(23_000_000);
  });

  it("is a strictly increasing table of 2,048 positive integer paise", () => {
    expect(AMOUNT_QUANTILES).toHaveLength(2048);
    for (const [i, value] of AMOUNT_QUANTILES.entries()) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      if (i > 0) expect(value).toBeGreaterThan(AMOUNT_QUANTILES[i - 1] ?? 0);
    }
  });

  it("draws integer paise inside the table's support, one word per draw", () => {
    const prng = Prng.fromSeed(3n);
    const min = AMOUNT_QUANTILES[0] ?? 0;
    const max = AMOUNT_QUANTILES.at(-1) ?? 0;
    for (let i = 0; i < 5000; i += 1) {
      const amount = drawAmount(prng);
      expect(Number.isSafeInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(min);
      expect(amount).toBeLessThanOrEqual(max);
    }
    expect(prng.draws).toBe(5000);
  });
});

/** `DATA_MODEL.md §6`'s fee model, checked against the documented sample. */
describe("§6 the fee model", () => {
  it("reproduces the documented Payment sample: amount 2100 -> fee 50, tax 8", () => {
    const f = feeBreakdown(2100 as never, 200);
    expect(f.fee_ex_gst).toBe(42);
    expect(f.tax).toBe(8);
    expect(f.fee).toBe(50);
    expect(f.credit).toBe(2050);
  });

  it("keeps fee GST-inclusive: credit = amount - fee, and fee_ex_gst = fee - tax", () => {
    const prng = Prng.fromSeed(5n);
    for (let i = 0; i < 3000; i += 1) {
      const amount = drawAmount(prng);
      for (const rate of Object.values(FEE_RATE_BPS)) {
        const f = feeBreakdown(amount, rate);
        expect(f.credit).toBe(amount - f.fee);
        expect(f.fee - f.tax).toBe(f.fee_ex_gst);
        expect(f.fee).toBeGreaterThanOrEqual(0);
        expect(f.tax).toBeGreaterThanOrEqual(0);
        expect(f.credit).toBeLessThanOrEqual(amount);
      }
    }
  });

  it("applies F03's repricing to card alone", () => {
    expect(rateBpsFor("card", F03_CARD_RATE_BPS_AFTER)).toBe(195);
    for (const method of ["upi", "netbanking", "wallet"] as const) {
      expect(rateBpsFor(method, F03_CARD_RATE_BPS_AFTER)).toBe(200);
    }
    expect(rateBpsFor("emi", F03_CARD_RATE_BPS_AFTER)).toBe(300);
  });

  it("rejects a negative rate", () => {
    expect(() => feeBreakdown(1000 as never, -1)).toThrow(RangeError);
  });
});
