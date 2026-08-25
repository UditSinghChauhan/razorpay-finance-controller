import { describe, expect, it } from "vitest";

import {
  MAX_PAISE,
  MIN_PAISE,
  ZERO_PAISE,
  abs,
  add,
  allocate,
  paise,
  split,
  sub,
  sum,
  type Paise,
} from "@assay/money";

const p = paise;

describe("add / sub", () => {
  it("computes ordinary sums and differences", () => {
    expect(add(p(100), p(250))).toBe(350);
    expect(sub(p(250), p(100))).toBe(150);
    expect(sub(p(100), p(250))).toBe(-150);
    expect(add(p(-100), p(100))).toBe(0);
  });

  it("throws rather than overflowing silently at the boundary", () => {
    expect(() => add(MAX_PAISE, p(1))).toThrow(RangeError);
    expect(() => sub(MIN_PAISE, p(1))).toThrow(RangeError);
    expect(add(MAX_PAISE, ZERO_PAISE)).toBe(MAX_PAISE);
  });

  it("rejects operands smuggled in past the brand by a cast", () => {
    const smuggled = 12.5 as Paise;
    expect(() => add(smuggled, p(1))).toThrow(RangeError);
    expect(() => sub(p(1), smuggled)).toThrow(RangeError);
    // Two fractions that sum to an integer must still be refused.
    expect(() => add(0.5 as Paise, 0.5 as Paise)).toThrow(RangeError);
  });
});

describe("abs", () => {
  it("returns the magnitude, as gate G3's gross sum requires", () => {
    expect(abs(p(-4_52_310))).toBe(4_52_310);
    expect(abs(p(4_52_310))).toBe(4_52_310);
    expect(abs(ZERO_PAISE)).toBe(0);
    expect(abs(MIN_PAISE)).toBe(MAX_PAISE);
  });
});

describe("sum", () => {
  it("totals a list and treats the empty list as zero", () => {
    expect(sum([])).toBe(0);
    expect(sum([p(1), p(2), p(3)])).toBe(6);
    expect(sum([p(100), p(-40), p(-60)])).toBe(0);
  });

  it("detects an overflow in a partial sum, not only in the result", () => {
    // Returns to the safe range at the end; the running check must still fire.
    expect(() => sum([MAX_PAISE, MAX_PAISE, MIN_PAISE])).toThrow(RangeError);
  });

  it("rejects an invalid element", () => {
    expect(() => sum([p(1), 0.5 as Paise])).toThrow(RangeError);
  });
});

describe("split", () => {
  it("divides evenly when it can", () => {
    expect(split(p(1000), 4)).toEqual([250, 250, 250, 250]);
  });

  it("gives the leftover paise to the lowest indices", () => {
    expect(split(p(10), 3)).toEqual([4, 3, 3]);
    expect(split(p(1), 3)).toEqual([1, 0, 0]);
    expect(split(p(5), 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("conserves exactly for negative totals, by symmetry", () => {
    expect(split(p(-10), 3)).toEqual([-4, -3, -3]);
    expect(sum(split(p(-10), 3))).toBe(-10);
  });

  it("emits no negative zero when a negative total splits unevenly", () => {
    // sign * 0 is -0. Without normalization in paise(), split(-1, 3) returned
    // [-1, -0, -0]: conserving, but carrying a second representation of zero.
    const parts = split(p(-1), 3);
    expect(parts).toEqual([-1, 0, 0]);
    expect(parts.some((x) => Object.is(x, -0))).toBe(false);
  });

  it("handles zero and single-part splits", () => {
    expect(split(ZERO_PAISE, 3)).toEqual([0, 0, 0]);
    expect(split(p(7), 1)).toEqual([7]);
  });

  it("rejects a non-positive or fractional part count", () => {
    expect(() => split(p(10), 0)).toThrow(RangeError);
    expect(() => split(p(10), -1)).toThrow(RangeError);
    expect(() => split(p(10), 2.5)).toThrow(RangeError);
  });
});

describe("allocate", () => {
  it("allocates in proportion when the division is exact", () => {
    expect(allocate(p(1000), [1, 1])).toEqual([500, 500]);
    expect(allocate(p(1000), [3, 1])).toEqual([750, 250]);
  });

  it("hands leftover paise to the largest remainder first", () => {
    // 10 across [1,1,2]: bases 2,2,5 -> allocated 9, leftover 1.
    // remainders 2,2,0 -> largest remainder is index 0 (tie broken by index).
    expect(allocate(p(10), [1, 1, 2])).toEqual([3, 2, 5]);
  });

  it("breaks equal remainders by ascending index", () => {
    expect(allocate(p(10), [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(p(1), [1, 1, 1])).toEqual([1, 0, 0]);
  });

  it("agrees with split when every weight is equal", () => {
    for (const total of [0, 1, 7, 10, 999, -10]) {
      expect(allocate(p(total), [1, 1, 1])).toEqual(split(p(total), 3));
    }
  });

  it("gives a zero-weight entry nothing", () => {
    expect(allocate(p(100), [1, 0, 1])).toEqual([50, 0, 50]);
    expect(allocate(p(7), [0, 1])).toEqual([0, 7]);
  });

  it("conserves for negative totals", () => {
    expect(sum(allocate(p(-1000), [1, 1, 1]))).toBe(-1000);
    expect(allocate(p(-10), [1, 1, 2])).toEqual([-3, -2, -5]);
  });

  it("emits no negative zero for a zero-weight entry on a negative total", () => {
    const parts = allocate(p(-100), [1, 0, 1]);
    expect(parts).toEqual([-50, 0, -50]);
    expect(parts.some((x) => Object.is(x, -0))).toBe(false);
  });

  it("rejects invalid weight lists", () => {
    expect(() => allocate(p(10), [])).toThrow(RangeError);
    expect(() => allocate(p(10), [0, 0])).toThrow(RangeError);
    expect(() => allocate(p(10), [1, -1])).toThrow(RangeError);
    expect(() => allocate(p(10), [1, 1.5])).toThrow(RangeError);
  });

  it("throws rather than overflowing on an intermediate product", () => {
    expect(() => allocate(MAX_PAISE, [1_000_000, 1])).toThrow(RangeError);
  });
});

describe("public API surface", () => {
  it("exports exactly the admitted surface and no internal helpers", async () => {
    const money = await import("@assay/money");
    // `Paise` is a type and has no runtime key. assertPaise and floorDivMod are
    // internal to the package and must not appear here.
    expect(Object.keys(money).sort()).toEqual([
      "MAX_PAISE",
      "MIN_PAISE",
      "ZERO_PAISE",
      "abs",
      "add",
      "allocate",
      "isPaise",
      "paise",
      "roundHalfUp",
      "split",
      "sub",
      "sum",
    ]);
  });
});
