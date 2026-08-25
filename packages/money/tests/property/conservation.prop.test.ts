import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  abs,
  add,
  allocate,
  paise,
  split,
  sub,
  sum,
  type Paise,
} from "@assay/money";

/**
 * T0-1's acceptance test (`DECISION_BRIEF.md §C`) is: "Property test:
 * conservation under split/allocate over 10k random cases; float usage is a
 * compile error." The 10,000-case properties below are that test; the compile
 * error is asserted in tests/types/float-is-compile-error.test-d.ts.
 *
 * The seed is fixed so the suite is byte-deterministic run to run, matching the
 * reproducibility guarantee EVALUATION_SPEC.md §7 makes for the project as a
 * whole. Money is the one package where a flaky test would be indistinguishable
 * from a real conservation failure.
 */
const SEED = 20260825;
const RUNS = 10_000;

/** Bounded so that |total| * max(weight) cannot leave the safe range. */
const anyPaise = fc.integer({ min: -(10 ** 12), max: 10 ** 12 }).map((n) => paise(n));
const partCount = fc.integer({ min: 1, max: 12 });
const weightList = fc.array(fc.integer({ min: 0, max: 1000 }), {
  minLength: 1,
  maxLength: 8,
});
/** allocate() requires at least one positive weight. */
const usableWeights = weightList.filter((w) => w.some((x) => x > 0));

describe("arithmetic conservation", () => {
  it("sub undoes add for every pair", () => {
    fc.assert(
      fc.property(anyPaise, anyPaise, (a, b) => sub(add(a, b), b) === a),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("sum equals repeated add", () => {
    fc.assert(
      fc.property(fc.array(anyPaise, { maxLength: 20 }), (values) => {
        let acc = paise(0);
        for (const v of values) acc = add(acc, v);
        return sum(values) === acc;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("add is commutative and zero is its identity", () => {
    fc.assert(
      fc.property(
        anyPaise,
        anyPaise,
        (a, b) => add(a, b) === add(b, a) && add(a, paise(0)) === a,
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("abs is idempotent and never negative", () => {
    fc.assert(
      fc.property(anyPaise, (a) => {
        const once = abs(a);
        return once >= 0 && abs(once) === once;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe("split conservation", () => {
  it("parts sum to exactly the total: no paisa lost, none created", () => {
    fc.assert(
      fc.property(anyPaise, partCount, (total, parts) => {
        const pieces = split(total, parts);
        return sum(pieces) === total && pieces.length === parts;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("parts differ from one another by at most one paisa", () => {
    fc.assert(
      fc.property(anyPaise, partCount, (total, parts) => {
        const magnitudes = split(total, parts).map((x) => Math.abs(x));
        const lo = Math.min(...magnitudes);
        const hi = Math.max(...magnitudes);
        return hi - lo <= 1;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("every part carries the sign of the total", () => {
    fc.assert(
      fc.property(anyPaise, partCount, (total, parts) =>
        split(total, parts).every((x) => (total < 0 ? x <= 0 : x >= 0)),
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe("allocate conservation", () => {
  it("allocations sum to exactly the total", () => {
    fc.assert(
      fc.property(anyPaise, usableWeights, (total, weights) => {
        const parts = allocate(total, weights);
        return sum(parts) === total && parts.length === weights.length;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("no entry receives more than one paisa above its floor share", () => {
    fc.assert(
      fc.property(anyPaise, usableWeights, (total, weights) => {
        const magnitude = Math.abs(total);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const parts = allocate(total, weights).map((x) => Math.abs(x));
        return parts.every((got, i) => {
          const weight = weights[i] ?? 0;
          const floorShare = Math.floor((magnitude * weight) / totalWeight);
          return got === floorShare || got === floorShare + 1;
        });
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("a zero weight always receives zero", () => {
    fc.assert(
      fc.property(anyPaise, usableWeights, (total, weights) =>
        allocate(total, weights).every((got, i) => (weights[i] === 0 ? got === 0 : true)),
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("equal weights reduce to split", () => {
    fc.assert(
      fc.property(anyPaise, partCount, (total, parts) => {
        const ones = Array.from({ length: parts }, () => 1);
        return allocate(total, ones).every((x, i) => x === split(total, parts)[i]);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe("determinism", () => {
  it("allocate returns identical output for identical input", () => {
    fc.assert(
      fc.property(anyPaise, usableWeights, (total, weights) => {
        const a = allocate(total, weights);
        const b = allocate(total, weights);
        return a.length === b.length && a.every((x, i) => x === b[i]);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("split returns identical output for identical input", () => {
    fc.assert(
      fc.property(anyPaise, partCount, (total, parts) => {
        const a = split(total, parts);
        const b = split(total, parts);
        return a.every((x, i) => x === b[i]);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("allocation does not depend on a mutable copy of the weights", () => {
    fc.assert(
      fc.property(anyPaise, usableWeights, (total, weights) => {
        const before = [...weights];
        allocate(total, weights);
        return weights.every((w, i) => w === before[i]);
      }),
      { numRuns: 2_000, seed: SEED },
    );
  });
});

describe("no accidental floating-point representation", () => {
  it("every value every operation returns is an exact safe integer", () => {
    fc.assert(
      fc.property(anyPaise, anyPaise, partCount, usableWeights, (a, b, parts, weights) => {
        const produced: Paise[] = [
          add(a, b),
          sub(a, b),
          abs(a),
          sum([a, b]),
          ...split(a, parts),
          ...allocate(a, weights),
        ];
        return produced.every((x) => Number.isSafeInteger(x));
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe("zero has exactly one representation", () => {
  it("no operation ever returns negative zero", () => {
    fc.assert(
      fc.property(anyPaise, anyPaise, partCount, usableWeights, (a, b, parts, weights) => {
        const produced: Paise[] = [
          add(a, b),
          sub(a, b),
          abs(a),
          sum([a, b]),
          ...split(a, parts),
          ...allocate(a, weights),
        ];
        return produced.every((x) => !Object.is(x, -0));
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe("safe-integer boundaries", () => {
  it("rejects any operation whose result would leave the safe range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        (delta) => {
          const near = paise(Number.MAX_SAFE_INTEGER - delta + 1);
          expect(() => add(near, paise(delta))).toThrow(RangeError);
          return true;
        },
      ),
      { numRuns: 1_000, seed: SEED },
    );
  });

  it("rejects fractional inputs cast past the brand", () => {
    fc.assert(
      fc.property(
        fc.double({ noDefaultInfinity: true, noNaN: true, min: -1e9, max: 1e9 })
          .filter((d) => !Number.isInteger(d)),
        (bad) => {
          expect(() => add(bad as Paise, paise(1))).toThrow(RangeError);
          expect(() => split(bad as Paise, 2)).toThrow(RangeError);
          expect(() => allocate(bad as Paise, [1])).toThrow(RangeError);
          return true;
        },
      ),
      { numRuns: 2_000, seed: SEED },
    );
  });
});
