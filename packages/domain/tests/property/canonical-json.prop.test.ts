import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { canonicalJson } from "@assay/domain";

/**
 * Canonical JSON is the encoding every `*_hash` field is computed over, so its
 * one non-negotiable property is that the bytes depend on the VALUE and on
 * nothing else — not on how the object happened to be built. Metric 23
 * (`determinism_check`) and invariant `I9` both reduce to this, and
 * `ARCHITECTURE.md §8` binds the genesis hash to the dataset through it.
 */
const SEED = 20260825;
const RUNS = 10_000;

/** The values canonicalJson admits. */
const leaf = fc.oneof(
  fc.integer({ min: -(2 ** 40), max: 2 ** 40 }),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
);

const jsonValue = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    leaf,
    fc.array(tie("value"), { maxLength: 5 }),
    fc.dictionary(fc.string(), tie("value"), { maxKeys: 5 }),
  ),
})).value;

/** Rebuild an object graph inserting its keys in a different order. */
function reinsert(value: unknown, reverse: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => reinsert(v, reverse));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const ordered = reverse ? [...keys].reverse() : keys;
    const out: Record<string, unknown> = {};
    for (const key of ordered) out[key] = reinsert(record[key], reverse);
    return out;
  }
  return value;
}

describe("canonical JSON is a function of the value alone", () => {
  it("is invariant to key insertion order", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const forward = canonicalJson(reinsert(value, false));
        const reversed = canonicalJson(reinsert(value, true));
        return forward === reversed;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("is stable across repeated evaluation", () => {
    fc.assert(
      fc.property(
        jsonValue,
        (value) => canonicalJson(value) === canonicalJson(value),
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("round-trips through JSON.parse to an equal value", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        expect(JSON.parse(canonicalJson(value))).toEqual(value);
        return true;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("emits output whose re-canonicalization is a fixed point", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const once = canonicalJson(value);
        const twice = canonicalJson(JSON.parse(once));
        return once === twice;
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("never emits exponent notation outside a string literal", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({
            min: -Number.MAX_SAFE_INTEGER,
            max: Number.MAX_SAFE_INTEGER,
          }),
          fc.array(
            fc.integer({
              min: -Number.MAX_SAFE_INTEGER,
              max: Number.MAX_SAFE_INTEGER,
            }),
            { maxLength: 8 },
          ),
        ),
        (value) => !/e/i.test(canonicalJson(value).replace(/"[^"]*"/g, '""')),
      ),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("gives equal bytes only to values that parse back equal", () => {
    fc.assert(
      fc.property(jsonValue, jsonValue, (a, b) => {
        if (canonicalJson(a) !== canonicalJson(b)) return true;
        expect(JSON.parse(canonicalJson(a))).toEqual(JSON.parse(canonicalJson(b)));
        return true;
      }),
      { numRuns: 5_000, seed: SEED },
    );
  });

  it("rejects every non-integer number it is given", () => {
    fc.assert(
      fc.property(
        fc
          .double({ noDefaultInfinity: true, noNaN: true })
          .filter((d) => !Number.isInteger(d)),
        (bad) => {
          expect(() => canonicalJson(bad)).toThrow(TypeError);
          expect(() => canonicalJson({ field: bad })).toThrow(TypeError);
          expect(() => canonicalJson([bad])).toThrow(TypeError);
          return true;
        },
      ),
      { numRuns: 2_000, seed: SEED },
    );
  });
});
