import { describe, expect, it } from "vitest";

import {
  COMPOSITION, FAMILY_DELTA, TARGET_RECORD_COUNT, compositionAt, datasetRecordCount,
  driverIsFeasible, evenSplit, feasibleDriverRange, realize,
} from "../src/composition.js";
import {
  DRIVER_PAYMENTS_PER_FAMILY, K_MAX, PUBLISHED_TARGET_RECORD_COUNTS,
  RECORD_COUNT_BAND, SPLIT_TABLE, type FamilyId,
} from "../src/frozen.js";

/**
 * `PREREGISTRATION.md §4.1`'s driver block, recomputed rather than quoted.
 * Every number below is read off the frozen text; none is copied from the code.
 */
describe("§4.1 the driver", () => {
  it("derives A, N, R, D, S, B and Adj at P = 659", () => {
    expect(DRIVER_PAYMENTS_PER_FAMILY).toBe(659);
    expect(COMPOSITION).toMatchObject({ P: 659, A: 66, N: 593, R: 27, D: 1, S: 31, B: 31, Adj: 0 });
  });

  it("derives base(P) = 2P + 2N + 2R + D + S + B + Adj = 2621", () => {
    const { P, N, R, D, S, B, Adj } = COMPOSITION;
    expect(COMPOSITION.base).toBe(2 * P + 2 * N + 2 * R + D + S + B + Adj);
    expect(COMPOSITION.base).toBe(2621);
  });

  it("reproduces §4.1's published target_record_count for all twelve families", () => {
    expect(TARGET_RECORD_COUNT).toStrictEqual(PUBLISHED_TARGET_RECORD_COUNTS);
  });

  it("derives each family's delta from its own mechanism", () => {
    // "DUPLICATE_ROW emits round_half_up(0.10 x B) = 3 extra bank_line rows"
    expect(FAMILY_DELTA.F04).toBe(+3);
    // "one recon_line withheld per selected settlement, round_half_up(0.10 x S) = 3"
    expect(FAMILY_DELTA.F05).toBe(-3);
    // "2D chargeback rows - a deduction and a later reversal, per dispute"
    expect(FAMILY_DELTA.F07).toBe(+2 * COMPOSITION.D);
    for (const family of ["F01", "F02", "F03", "F06", "F08", "F09", "F10"] as const) {
      expect(FAMILY_DELTA[family]).toBe(0);
    }
  });

  it("keeps both §6.1 seed ranges inside PROJECT_SPEC.md §9's 10,000-20,000 band", () => {
    const totals = SPLIT_TABLE.map((row) => datasetRecordCount(row.families as readonly FamilyId[]));
    expect(totals).toStrictEqual([15_726, 15_726, 15_726, 10_486]);
    for (const total of totals) {
      expect(total).toBeGreaterThanOrEqual(RECORD_COUNT_BAND.min);
      expect(total).toBeLessThanOrEqual(RECORD_COUNT_BAND.max);
    }
  });
});

/**
 * `§4.1` justifies `P = 659` as "the midpoint - the only choice equidistant from
 * both binding constraints". The justification is executable here, so a reader
 * does not have to take the number on trust.
 */
describe("§4.1 why P = 659", () => {
  it("finds exactly sixty-one feasible drivers, 629 through 689", () => {
    expect(feasibleDriverRange()).toStrictEqual({ low: 629, high: 689, count: 61 });
  });

  it("puts 659 exactly at the midpoint", () => {
    const { low, high } = feasibleDriverRange();
    expect((low + high) / 2).toBe(DRIVER_PAYMENTS_PER_FAMILY);
    expect(DRIVER_PAYMENTS_PER_FAMILY - low).toBe(high - DRIVER_PAYMENTS_PER_FAMILY);
  });

  it("binds below at the 10,000 floor on the F07-F10 range", () => {
    expect(driverIsFeasible(629)).toBe(true);
    expect(driverIsFeasible(628)).toBe(false);
    const c = compositionAt(628);
    expect(4 * c.base + 2 * c.D).toBeLessThan(RECORD_COUNT_BAND.min);
  });

  it("binds above at K_max = 22, where the settlement batch reaches 20.0 per day", () => {
    expect(driverIsFeasible(689)).toBe(true);
    expect(driverIsFeasible(690)).toBe(false);
    // A component is the settlement, its constituents and the bank line: K_max - 2.
    expect(compositionAt(689).N / compositionAt(689).S).toBe(20);
    expect(Math.ceil(compositionAt(690).N / compositionAt(690).S)).toBeGreaterThan(K_MAX - 2);
  });

  it("records that 2,600 is unreachable, bracketed at 2,597 and 2,603", () => {
    expect(compositionAt(653).base).toBe(2597);
    expect(compositionAt(654).base).toBe(2603);
    const image = new Set(Array.from({ length: 2000 }, (_, P) => compositionAt(P + 1).base));
    expect(image.has(2600)).toBe(false);
  });
});

describe("§4.1 rate realization is exact and seed-free", () => {
  it("rounds half-up against the stated denominator", () => {
    expect(realize({ num: 10, den: 100 }, 659)).toBe(66); // 65.9 -> 66
    expect(realize({ num: 45, den: 1000 }, 593)).toBe(27); // 26.685 -> 27
    expect(realize({ num: 15, den: 10_000 }, 593)).toBe(1); // 0.8895 -> 1
    expect(realize({ num: 8, den: 1000 }, 31)).toBe(0); // 0.248 -> 0, §10 V14
    expect(realize({ num: 10, den: 100 }, 31)).toBe(3); // 3.1 -> 3
  });

  it("rounds exactly .5 away from zero", () => {
    expect(realize({ num: 50, den: 100 }, 1)).toBe(1);
    expect(realize({ num: 50, den: 100 }, 3)).toBe(2);
  });
});

describe("evenSplit", () => {
  it("hands the remainder to the lowest indices", () => {
    expect(evenSplit(593, 31)).toStrictEqual([
      ...Array.from({ length: 4 }, () => 20),
      ...Array.from({ length: 27 }, () => 19),
    ]);
  });

  it("conserves the total and never differs by more than one", () => {
    for (const [total, parts] of [[0, 3], [1, 5], [66, 31], [593, 31], [100, 7]] as const) {
      const parts_ = evenSplit(total, parts);
      expect(parts_.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...parts_) - Math.min(...parts_)).toBeLessThanOrEqual(1);
    }
  });

  it("rejects a non-positive part count", () => {
    expect(() => evenSplit(10, 0)).toThrow(RangeError);
  });
});
