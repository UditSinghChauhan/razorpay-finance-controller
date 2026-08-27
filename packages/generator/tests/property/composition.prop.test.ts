import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { paise, split } from "@assay/money";

import {
  compositionAt, datasetRecordCount, driverIsFeasible, evenSplit, realize,
} from "../../src/composition.js";
import { RECORD_COUNT_BAND, K_MAX, type FamilyId } from "../../src/frozen.js";
import { SEED_BLOCKS } from "../../src/seeds.js";

/**
 * `evenSplit` restates `@assay/money`'s `split()` for counts rather than money.
 * The restatement is checked against the original rather than assumed.
 */
describe("evenSplit agrees with @assay/money's split()", () => {
  it("matches element for element over the whole domain it is used on", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 1, max: 64 }), (total, parts) => {
        expect(evenSplit(total, parts)).toStrictEqual([...split(paise(total), parts)]);
      }),
      { numRuns: 2000 },
    );
  });

  it("conserves the total and spreads within one", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 1, max: 200 }), (total, parts) => {
        const buckets = evenSplit(total, parts);
        expect(buckets).toHaveLength(parts);
        expect(buckets.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...buckets) - Math.min(...buckets)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("rate realization is exact, monotone and seed-free", () => {
  it("never differs from the exact product by as much as one whole record", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (population, num, den) => {
          const realized = realize({ num, den }, population);
          expect(Math.abs(realized * den - num * population)).toBeLessThanOrEqual(den / 2);
          expect(Number.isSafeInteger(realized)).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("is monotone in the population", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 1, max: 999 }), (population, num) => {
        expect(realize({ num, den: 1000 }, population + 1)).toBeGreaterThanOrEqual(
          realize({ num, den: 1000 }, population),
        );
      }),
      { numRuns: 2000 },
    );
  });
});

describe("the driver's feasibility band", () => {
  it("holds both frozen bounds at every feasible P and breaks one at every other", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1500 }), (P) => {
        const c = compositionAt(P);
        const heldOut = 4 * c.base + 2 * c.D;
        const largestBatch = Math.ceil(c.N / c.S);
        const feasible = driverIsFeasible(P);
        expect(feasible).toBe(
          heldOut >= RECORD_COUNT_BAND.min && heldOut <= RECORD_COUNT_BAND.max && largestBatch <= K_MAX - 2,
        );
        if (feasible) {
          expect(P).toBeGreaterThanOrEqual(629);
          expect(P).toBeLessThanOrEqual(689);
        }
      }),
      { numRuns: 1500 },
    );
  });

  it("keeps base(P) strictly increasing, so the record count is a function of the driver alone", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1500 }), (P) => {
        expect(compositionAt(P + 1).base).toBeGreaterThan(compositionAt(P).base);
      }),
      { numRuns: 1500 },
    );
  });
});

describe("every §6.1 dataset stays inside PROJECT_SPEC.md §9's band", () => {
  it("holds for every subset of a declared block's families", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: SEED_BLOCKS.length - 1 }), (index) => {
        const block = SEED_BLOCKS[index];
        if (block === undefined) return;
        const total = datasetRecordCount(block.families as readonly FamilyId[]);
        expect(total).toBeGreaterThanOrEqual(RECORD_COUNT_BAND.min);
        expect(total).toBeLessThanOrEqual(RECORD_COUNT_BAND.max);
      }),
      { numRuns: 200 },
    );
  });
});
