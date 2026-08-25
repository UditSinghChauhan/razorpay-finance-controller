import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { MAX_PAISE, roundHalfUp } from "@assay/money";

const SEED = 20260825;

describe("roundHalfUp() — the normative rounding rule", () => {
  it("rounds an exact half away from zero, never to even", () => {
    // PREREGISTRATION.md §4.2: "half-up to nearest paisa, applied once per line".
    expect(roundHalfUp(5, 10)).toBe(1); // 0.5 -> 1
    expect(roundHalfUp(15, 10)).toBe(2); // 1.5 -> 2
    expect(roundHalfUp(25, 10)).toBe(3); // 2.5 -> 3, not 2 (banker's would give 2)
    expect(roundHalfUp(35, 10)).toBe(4); // 3.5 -> 4
    expect(roundHalfUp(1, 2)).toBe(1);
    expect(roundHalfUp(3, 2)).toBe(2);
  });

  it("rounds just below a half down and just above a half up", () => {
    expect(roundHalfUp(49_999, 100_000)).toBe(0); // 0.49999
    expect(roundHalfUp(50_000, 100_000)).toBe(1); // 0.50000
    expect(roundHalfUp(50_001, 100_000)).toBe(1); // 0.50001
    expect(roundHalfUp(149_999, 100_000)).toBe(1);
    expect(roundHalfUp(150_000, 100_000)).toBe(2);
  });

  it("is exact at zero and on exact multiples", () => {
    expect(roundHalfUp(0, 10_000)).toBe(0);
    expect(roundHalfUp(10_000, 10_000)).toBe(1);
    expect(roundHalfUp(20_000, 10_000)).toBe(2);
    expect(roundHalfUp(7, 1)).toBe(7);
  });

  it("reproduces the documented Razorpay fee sample", () => {
    // DATA_MODEL.md §6: amount 2100 paise at 200 bps gives fee_ex_gst 42,
    // 18% GST on 42 is 7.56 -> tax 8, and fee = 50.
    const amount = 2_100;
    const feeExGst = roundHalfUp(amount * 200, 10_000);
    const tax = roundHalfUp(feeExGst * 1800, 10_000);
    expect(feeExGst).toBe(42);
    expect(tax).toBe(8);
    expect(feeExGst + tax).toBe(50);
    expect(amount - (feeExGst + tax)).toBe(2_050); // credit = amount - fee
  });

  it("computes the frozen close threshold formula", () => {
    // RECONCILIATION_SPEC.md §10.3: round_half_up(batch_value_paise * 5 / 1000).
    expect(roundHalfUp(27_000_000 * 5, 1000)).toBe(135_000);
    expect(roundHalfUp(1 * 5, 1000)).toBe(0); // 0.005 -> 0
    expect(roundHalfUp(100 * 5, 1000)).toBe(1); // 0.5 -> 1
  });

  it("handles the maximum safe numerator", () => {
    expect(roundHalfUp(MAX_PAISE, 1)).toBe(MAX_PAISE);
  });

  it("rejects a negative numerator instead of guessing a direction", () => {
    // No rounding site in spec v1.3.0 is negative, and half-up is ambiguous
    // for negatives, so the domain is closed rather than silently chosen.
    expect(() => roundHalfUp(-1, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(-5, 10)).toThrow(RangeError);
  });

  it("rejects a zero, negative or fractional denominator", () => {
    expect(() => roundHalfUp(10, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(10, -10)).toThrow(RangeError);
    expect(() => roundHalfUp(10, 2.5)).toThrow(RangeError);
  });

  it("rejects fractional, NaN and infinite terms", () => {
    expect(() => roundHalfUp(1.5, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.NaN, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(10, Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(MAX_PAISE + 1, 10)).toThrow(RangeError);
  });
});

describe("roundHalfUp() invariants", () => {
  const nd = fc
    .tuple(
      fc.integer({ min: 0, max: 2 ** 45 }),
      fc.integer({ min: 1, max: 10 ** 7 }),
    );

  it("always returns an exact integer", () => {
    fc.assert(
      fc.property(nd, ([n, d]) => Number.isSafeInteger(roundHalfUp(n, d))),
      { numRuns: 10_000, seed: SEED },
    );
  });

  it("never differs from the true quotient by half a unit or more", () => {
    fc.assert(
      fc.property(nd, ([n, d]) => {
        const result = roundHalfUp(n, d);
        // |result*d - n| <= d/2, expressed without division so the check
        // itself introduces no float. Doubling is safe: n <= 2^45, d <= 10^7.
        const deviation = Math.abs(result * d - n);
        return deviation * 2 <= d;
      }),
      { numRuns: 10_000, seed: SEED },
    );
  });

  it("is monotonic in the numerator", () => {
    fc.assert(
      fc.property(nd, ([n, d]) => roundHalfUp(n, d) <= roundHalfUp(n + d, d)),
      { numRuns: 5_000, seed: SEED },
    );
  });

  it("is idempotent when the denominator is one", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_PAISE }), (n) => roundHalfUp(n, 1) === n),
      { numRuns: 5_000, seed: SEED },
    );
  });

  it("agrees with exact rational arithmetic on the half boundary", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 ** 9 }),
        fc.integer({ min: 1, max: 10 ** 6 }),
        (q, d) => {
          const evenD = d * 2;
          // Exactly q + 1/2 -> must round to q + 1.
          return roundHalfUp(q * evenD + d, evenD) === q + 1;
        },
      ),
      { numRuns: 10_000, seed: SEED },
    );
  });

  it("is deterministic across repeated evaluation", () => {
    fc.assert(
      fc.property(nd, ([n, d]) => roundHalfUp(n, d) === roundHalfUp(n, d)),
      { numRuns: 5_000, seed: SEED },
    );
  });
});
