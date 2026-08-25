import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  MAX_PAISE,
  MIN_PAISE,
  ZERO_PAISE,
  isPaise,
  paise,
  type Paise,
} from "@assay/money";

/** Fixed so that `pnpm test` is byte-deterministic (EVALUATION_SPEC.md §7). */
const SEED = 20260825;

describe("paise() — the only admitting constructor", () => {
  it("accepts zero and ordinary positive amounts", () => {
    expect(paise(0)).toBe(0);
    expect(paise(1)).toBe(1);
    expect(paise(185_000)).toBe(185_000);
  });

  it("accepts negative amounts, because credit balances are negative", () => {
    // DATA_MODEL.md §17.1: balance = Σdr − Σcr, so liability and revenue
    // accounts carry negative balances and that is correct, not an error.
    expect(paise(-1)).toBe(-1);
    expect(paise(-10_000_000)).toBe(-10_000_000);
  });

  it("accepts the exact range boundaries", () => {
    expect(paise(MAX_PAISE)).toBe(MAX_PAISE);
    expect(paise(MIN_PAISE)).toBe(MIN_PAISE);
    expect(MAX_PAISE).toBe(Number.MAX_SAFE_INTEGER);
    expect(MIN_PAISE).toBe(-Number.MAX_SAFE_INTEGER);
    expect(ZERO_PAISE).toBe(0);
  });

  it("rejects values one step outside the safe-integer range", () => {
    expect(() => paise(MAX_PAISE + 1)).toThrow(RangeError);
    expect(() => paise(MIN_PAISE - 1)).toThrow(RangeError);
  });

  it("rejects fractional amounts rather than rounding them", () => {
    for (const bad of [0.5, -0.5, 1.5, 0.1, 1e-7, 100.000_000_1]) {
      expect(() => paise(bad)).toThrow(RangeError);
    }
  });

  it("rejects NaN and the infinities", () => {
    expect(() => paise(Number.NaN)).toThrow(RangeError);
    expect(() => paise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => paise(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it("normalizes negative zero to the one canonical zero", () => {
    // -0 passes Number.isSafeInteger, so without normalization it would be a
    // second representation of zero: equal under ===, distinct under Object.is,
    // and therefore a distinct Map/Set key. There is no negative zero amount of
    // money. Asserted with Object.is, which is the only comparison that can
    // tell the two apart.
    expect(Object.is(paise(-0), 0)).toBe(true);
    expect(Object.is(paise(-0), -0)).toBe(false);
  });
});

describe("isPaise()", () => {
  it("agrees with paise() on every input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.double({ noDefaultInfinity: false, noNaN: false }),
          fc.constantFrom(
            MAX_PAISE,
            MIN_PAISE,
            MAX_PAISE + 1,
            MIN_PAISE - 1,
            0,
            -0,
          ),
        ),
        (value) => {
          const guardSaysValid = isPaise(value);
          let constructorAccepted = true;
          try {
            paise(value);
          } catch {
            constructorAccepted = false;
          }
          return guardSaysValid === constructorAccepted;
        },
      ),
      { numRuns: 10_000, seed: SEED },
    );
  });

  it("rejects every non-integer double", () => {
    fc.assert(
      fc.property(
        fc.double({ noDefaultInfinity: true, noNaN: true }).filter((d) => !Number.isInteger(d)),
        (value) => isPaise(value) === false,
      ),
      { numRuns: 2_000, seed: SEED },
    );
  });
});

describe("invalid input rejection is deterministic", () => {
  it("throws the same error type and message for the same bad input", () => {
    const attempt = (): Paise => paise(1.25);
    const first = ((): string => {
      try {
        attempt();
        return "no-throw";
      } catch (error) {
        return (error as RangeError).message;
      }
    })();
    const second = ((): string => {
      try {
        attempt();
        return "no-throw";
      } catch (error) {
        return (error as RangeError).message;
      }
    })();
    expect(first).toBe(second);
    expect(first).not.toBe("no-throw");
  });
});
