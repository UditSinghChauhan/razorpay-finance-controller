import { describe, expectTypeOf, it } from "vitest";

import {
  MAX_PAISE,
  ZERO_PAISE,
  add,
  allocate,
  paise,
  roundHalfUp,
  split,
  sum,
  type Paise,
} from "@assay/money";

/**
 * T0-1 (`DECISION_BRIEF.md §C`) requires that "float usage is a compile error",
 * and `ARCHITECTURE.md §3` explains why this package exists at all: isolating
 * money "makes float arithmetic a *type error*, not a review comment".
 *
 * Each `@ts-expect-error` below is an assertion that the line beneath it MUST
 * fail to compile. If the public API is ever widened so that one of them starts
 * compiling, TypeScript reports the directive as unused and this file fails.
 * That is the opposite of suppressing an error: the directive only passes while
 * the error it names still exists.
 */
describe("a bare number cannot be used as Paise", () => {
  it("rejects an integer literal in a Paise position", () => {
    // @ts-expect-error — an unbranded number is not a Paise
    const wrong: Paise = 100;
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("rejects a float literal in a Paise position", () => {
    // @ts-expect-error — a float is not a Paise
    const wrong: Paise = 12.5;
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("rejects bare numbers as arithmetic operands", () => {
    // @ts-expect-error — add() takes Paise, not number
    const wrong = add(100, 250);
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("rejects a float as an arithmetic operand", () => {
    // @ts-expect-error — add() takes Paise, not number
    const wrong = add(1.5, ZERO_PAISE);
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("rejects bare numbers in a Paise array", () => {
    // @ts-expect-error — sum() takes readonly Paise[]
    const wrong = sum([1, 2, 3]);
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });
});

describe("raw arithmetic loses the brand, so results cannot re-enter as Paise", () => {
  it("refuses to accept a raw sum as Paise", () => {
    const a = paise(100);
    const b = paise(250);
    // @ts-expect-error — `a + b` is a number, not a Paise; use add()
    const wrong: Paise = a + b;
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("refuses to accept a raw division as Paise", () => {
    const a = paise(100);
    // @ts-expect-error — division produces a number, and may not be integral
    const wrong: Paise = a / 3;
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });

  it("refuses to accept a raw product as Paise", () => {
    const a = paise(100);
    // @ts-expect-error — multiplication produces a number
    const wrong: Paise = a * 200;
    expectTypeOf(wrong).toEqualTypeOf<Paise>();
  });
});

describe("the admitted surface has the types it claims", () => {
  it("paise() is the constructor and returns Paise", () => {
    expectTypeOf(paise).parameters.toEqualTypeOf<[number]>();
    expectTypeOf(paise).returns.toEqualTypeOf<Paise>();
  });

  it("arithmetic returns Paise", () => {
    expectTypeOf(add(ZERO_PAISE, MAX_PAISE)).toEqualTypeOf<Paise>();
    expectTypeOf(split(ZERO_PAISE, 2)).toEqualTypeOf<Paise[]>();
    expectTypeOf(allocate(ZERO_PAISE, [1])).toEqualTypeOf<Paise[]>();
  });

  it("roundHalfUp takes the rational's two integer terms, not a quotient", () => {
    expectTypeOf(roundHalfUp).parameters.toEqualTypeOf<[number, number]>();
    expectTypeOf(roundHalfUp).returns.toEqualTypeOf<Paise>();
  });

  it("Paise remains assignable to number, so comparison and JSON need no unwrap", () => {
    const value: number = paise(100);
    expectTypeOf(value).toEqualTypeOf<number>();
  });
});
