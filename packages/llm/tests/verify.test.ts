import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  NumericSchemaError,
  assertNoNumericField,
  checkSchema,
} from "../src/verify/schema.js";
import { checkAllowlist, collectEntityIds, isEntityIdShaped } from "../src/verify/allowlist.js";
import { groundInSource, groundNumerals, numeralsIn } from "../src/verify/grounding.js";

/**
 * Trust boundary 2's three checks (`ARCHITECTURE.md §4`).
 *
 * `DECISION_BRIEF.md §L.1` rule 2 is an invariant that *"may never be
 * violated"*, and `§L.3` requires property tests on every invariant a package
 * owns. This suite is the example-based half; `tests/property/` is the other.
 */

describe("check 1 — schema · §L.1 rule 2 (no number-typed field)", () => {
  it("accepts the two role schemas this phase ships", () => {
    expect(() => {
      assertNoNumericField(z.strictObject({ a: z.string(), b: z.enum(["x", "y"]) }));
    }).not.toThrow();
  });

  it.each([
    ["a bare number", z.strictObject({ n: z.number() })],
    ["an int", z.strictObject({ n: z.int() })],
    ["a bigint", z.strictObject({ n: z.bigint() })],
    ["a date", z.strictObject({ n: z.date() })],
    ["a nan", z.strictObject({ n: z.nan() })],
  ])("rejects %s", (_label, schema) => {
    expect(() => {
      assertNoNumericField(schema);
    }).toThrow(NumericSchemaError);
  });

  it("finds a number nested inside arrays, unions, records and wrappers", () => {
    const cases = [
      z.strictObject({ a: z.array(z.number()) }),
      z.strictObject({ a: z.array(z.array(z.number())) }),
      z.strictObject({ a: z.union([z.string(), z.number()]) }),
      z.strictObject({ a: z.record(z.string(), z.number()) }),
      z.strictObject({ a: z.number().optional() }),
      z.strictObject({ a: z.number().nullable() }),
      z.strictObject({ a: z.array(z.number()).readonly() }),
      z.strictObject({ a: z.tuple([z.string(), z.number()]) }),
      z.strictObject({ a: z.strictObject({ b: z.strictObject({ c: z.number() }) }) }),
      z.discriminatedUnion("k", [
        z.object({ k: z.literal("a"), v: z.string() }),
        z.object({ k: z.literal("b"), v: z.number() }),
      ]),
    ];
    for (const schema of cases) {
      expect(() => {
        assertNoNumericField(schema);
      }).toThrow(NumericSchemaError);
    }
  });

  it("rejects a numeric literal and a numeric enum, which are not `number` nodes", () => {
    expect(() => {
      assertNoNumericField(z.strictObject({ a: z.literal(3) }));
    }).toThrow(/literal\(3\)/);
    expect(() => {
      assertNoNumericField(z.strictObject({ a: z.enum({ ONE: 1 }) }));
    }).toThrow(/enum\(1\)/);
  });

  it("names the path of the offending field", () => {
    try {
      assertNoNumericField(z.strictObject({ outer: z.array(z.strictObject({ n: z.number() })) }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NumericSchemaError);
      expect((error as NumericSchemaError).path).toBe("$.outer<element>.n");
    }
  });

  it("terminates on a recursive schema rather than looping", () => {
    const Node: z.ZodType<unknown> = z.lazy(() =>
      z.strictObject({ id: z.string(), children: z.array(Node) }),
    );
    expect(() => {
      assertNoNumericField(Node);
    }).not.toThrow();
  });

  it("checkSchema rejects without coercing or repairing (§12)", () => {
    const schema = z.strictObject({ a: z.string() });
    const result = checkSchema(schema, { a: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("LLM_SCHEMA_REJECT");
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("checkSchema refuses a numeric schema before it ever parses", () => {
    expect(() => checkSchema(z.strictObject({ n: z.number() }), { n: 1 })).toThrow(
      NumericSchemaError,
    );
  });

  it("strict mode rejects an unknown key (§4 boundary 1.1's posture, applied here)", () => {
    const result = checkSchema(z.strictObject({ a: z.string() }), { a: "x", extra: "y" });
    expect(result.ok).toBe(false);
  });
});

describe("check 2 — allowlist · §4 boundary 2 / THREAT_MODEL §T3", () => {
  it("recognises entity ids by the frozen grammar, not by a local list", () => {
    expect(isEntityIdShaped("pay_aaaaaaaaaaaaaa")).toBe(true);
    expect(isEntityIdShaped("setl_aaaaaaaaaaaaaa")).toBe(true);
    expect(isEntityIdShaped("obs_aaaaaaaaaaaaaa")).toBe(true);
    expect(isEntityIdShaped("RAZORPAY SOFTWARE")).toBe(false);
    expect(isEntityIdShaped("1568176960vxp0rj")).toBe(false);
  });

  it("passes prose and narration fragments through untouched", () => {
    const value = { analyst_question: "Confirm which settlement funded this credit." };
    expect(checkAllowlist(value, []).ok).toBe(true);
  });

  it("rejects a hallucinated id and names it", () => {
    const value = { evidence_obs_ids: ["obs_aaaaaaaaaaaaaa", "pay_XXXXXXXXXXXXXX"] };
    const result = checkAllowlist(value, ["obs_aaaaaaaaaaaaaa"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.map((v) => v.id)).toEqual(["pay_XXXXXXXXXXXXXX"]);
      expect(result.violations[0]?.path).toBe("$.evidence_obs_ids[1]");
    }
  });

  it("an empty allowlist does not mean 'everything allowed'", () => {
    expect(checkAllowlist({ id: "pay_aaaaaaaaaaaaaa" }, []).ok).toBe(false);
  });

  it("walks the whole value, so a new field cannot escape the check", () => {
    const found = collectEntityIds({ a: { b: [{ c: "rfnd_aaaaaaaaaaaaaa" }] } });
    expect(found).toEqual([{ id: "rfnd_aaaaaaaaaaaaaa", path: "$.a.b[0].c" }]);
  });
});

describe("check 3 — grounding · §4 boundary 2", () => {
  it("accepts only literal substrings", () => {
    const source = "NEFT CR RZPX0001 RAZORPAY";
    expect(groundInSource([{ value: "RZPX0001", path: "$.a" }], source).ok).toBe(true);
    expect(groundInSource([{ value: "RZPX0002", path: "$.a" }], source).ok).toBe(false);
  });

  it("does not normalize either side before comparing", () => {
    const result = groundInSource([{ value: "rzpx0001", path: "$.a" }], "NEFT RZPX0001");
    expect(result.ok).toBe(false);
  });

  it("treats the empty string as ungrounded, not as a universal substring", () => {
    expect(groundInSource([{ value: "", path: "$.a" }], "anything").ok).toBe(false);
  });

  it("extracts maximal digit runs", () => {
    expect(numeralsIn("DR 1,00,000 / CR 45231000")).toEqual(["1", "00", "000", "45231000"]);
  });

  it("grounds R4-shaped numerals against an evidence set (no caller at this phase)", () => {
    expect(groundNumerals("the 45231000 paise credit", ["amount_paise=45231000"]).ok).toBe(true);
    const bad = groundNumerals("the 45231001 paise credit", ["amount_paise=45231000"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.violations[0]?.value).toBe("45231001");
  });
});
