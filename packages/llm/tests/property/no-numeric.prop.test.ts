import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z, type ZodType } from "zod";

import { NumericSchemaError, assertNoNumericField } from "../../src/verify/schema.js";

/**
 * `DECISION_BRIEF.md §L.1` rule 2, as a property.
 *
 * `§L.3` requires *"property tests on every invariant it owns"*, and rule 2 —
 * *"No LLM output schema may contain a numeric field"* — is the invariant this
 * package owns. Example-based tests cover the shapes someone thought of; this
 * covers the ones nobody did, which is the whole point of a structural defence.
 */

interface Built {
  readonly schema: ZodType<unknown>;
  /** Whether a numeric node was placed anywhere in this tree. */
  readonly numeric: boolean;
}

const LEAF_SAFE: readonly (() => ZodType<unknown>)[] = [
  () => z.string(),
  () => z.boolean(),
  () => z.literal("a"),
  () => z.enum(["a", "b"]),
  () => z.null(),
];

const LEAF_NUMERIC: readonly (() => ZodType<unknown>)[] = [
  () => z.number(),
  () => z.int(),
  () => z.bigint(),
  () => z.nan(),
  () => z.date(),
  () => z.literal(3),
  () => z.enum({ ONE: 1 }),
];

/** A random schema tree, with a flag saying whether it hides a numeric node. */
function schemaArb(depth: number): fc.Arbitrary<Built> {
  const leaf = fc.oneof(
    fc.constantFrom(...LEAF_SAFE).map((f) => ({ schema: f(), numeric: false })),
    fc.constantFrom(...LEAF_NUMERIC).map((f) => ({ schema: f(), numeric: true })),
  );
  if (depth <= 0) return leaf;

  const child = schemaArb(depth - 1);
  return fc.oneof(
    { weight: 2, arbitrary: leaf },
    {
      weight: 1,
      arbitrary: fc
        .tuple(fc.constantFrom("array", "optional", "nullable", "readonly", "record"), child)
        .map(([kind, inner]): Built => {
          switch (kind) {
            case "array":
              return { schema: z.array(inner.schema), numeric: inner.numeric };
            case "optional":
              return { schema: inner.schema.optional(), numeric: inner.numeric };
            case "nullable":
              return { schema: inner.schema.nullable(), numeric: inner.numeric };
            case "readonly":
              return { schema: z.array(inner.schema).readonly(), numeric: inner.numeric };
            default:
              return {
                schema: z.record(z.string(), inner.schema),
                numeric: inner.numeric,
              };
          }
        }),
    },
    {
      weight: 1,
      arbitrary: fc.array(child, { minLength: 1, maxLength: 3 }).map((parts): Built => {
        const shape: Record<string, ZodType<unknown>> = {};
        parts.forEach((p, i) => {
          shape[`f${String(i)}`] = p.schema;
        });
        return {
          schema: z.strictObject(shape),
          numeric: parts.some((p) => p.numeric),
        };
      }),
    },
    {
      weight: 1,
      arbitrary: fc.array(child, { minLength: 2, maxLength: 3 }).map((parts): Built => ({
        schema: z.union(parts.map((p) => p.schema) as [ZodType, ZodType, ...ZodType[]]),
        numeric: parts.some((p) => p.numeric),
      })),
    },
    {
      weight: 1,
      arbitrary: fc.array(child, { minLength: 1, maxLength: 3 }).map((parts): Built => ({
        schema: z.tuple(parts.map((p) => p.schema) as [ZodType, ...ZodType[]]),
        numeric: parts.some((p) => p.numeric),
      })),
    },
  );
}

describe("§L.1 rule 2 holds for every schema shape, not only the ones we wrote", () => {
  it("throws if and only if a numeric node is reachable", () => {
    fc.assert(
      fc.property(schemaArb(4), ({ schema, numeric }) => {
        let threw = false;
        try {
          assertNoNumericField(schema);
        } catch (error) {
          expect(error).toBeInstanceOf(NumericSchemaError);
          threw = true;
        }
        expect(threw).toBe(numeric);
      }),
      { numRuns: 2000 },
    );
  });

  it("always terminates, however deeply nested", () => {
    fc.assert(
      fc.property(schemaArb(6), ({ schema }) => {
        try {
          assertNoNumericField(schema);
        } catch {
          // A throw is a termination too; the property under test is that the
          // walker returns at all rather than recursing forever.
        }
        return true;
      }),
      { numRuns: 500 },
    );
  });
});
