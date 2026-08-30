import type { ZodType } from "zod";

/**
 * Boundary 2, check 1 — the schema check (`ARCHITECTURE.md §4`).
 *
 * *"The `LlmProvider` contract requires a strict zod schema containing **no
 * number-typed field**; a CI lint fails the build if one appears."*
 *
 * **Two enforcements, deliberately, because they fail differently.**
 * `eslint.config.js` bans the numeric zod constructors by syntax inside
 * `packages/llm/src`, which catches the schema someone writes here. The walker
 * below catches the schema someone **passes in** from anywhere — a lint over
 * this package cannot see a caller's schema, and `§6.5` types `invoke`'s
 * `schema` as an arbitrary `ZodType`. `DECISION_BRIEF.md §L.1` rule 2 is listed
 * among *"invariants that may never be violated"*, and an invariant guarded only
 * where its violation happens to be spelled is a convention.
 *
 * The walker is the reason this is a **property** rather than a review comment:
 * a numeric field cannot reach a provider at all, whoever wrote the schema.
 */

/** Raised when a response schema contains a number-typed field. */
export class NumericSchemaError extends Error {
  readonly path: string;
  readonly nodeType: string;

  constructor(path: string, nodeType: string) {
    super(
      `DECISION_BRIEF.md §L.1 rule 2: no LLM output schema may contain a ` +
        `number-typed field. Found "${nodeType}" at ${path}. Where a quantity is ` +
        `needed the model returns an identifier and deterministic code looks up ` +
        `the value (ARCHITECTURE.md §4 boundary 2).`,
    );
    this.name = "NumericSchemaError";
    this.path = path;
    this.nodeType = nodeType;
  }
}

/**
 * Zod node types that are numeric, or that carry a number to the parsed value.
 *
 * `bigint`, `nan` and `date` are here with `number` because `§L.1` rule 2's
 * purpose is that *"no numeral emitted by a model is ever persisted to the
 * ledger"* (`ARCHITECTURE.md §1`) — a `bigint` or a `Date` is a quantity the
 * model chose just as much as a `number` is, and `DATA_MODEL.md §0` rule 2 keeps
 * every ASSAY timestamp an integer supplied by deterministic code.
 */
const NUMERIC_NODE_TYPES: ReadonlySet<string> = new Set([
  "number",
  "bigint",
  "nan",
  "date",
]);

/** A zod v4 internal node, reached through the documented `_zod.def` surface. */
interface ZodNode {
  readonly _zod?: { readonly def?: Record<string, unknown> };
}

function defOf(schema: unknown): Record<string, unknown> | null {
  const node = schema as ZodNode | null;
  const def = node?._zod?.def;
  return def === undefined ? null : def;
}

/**
 * Assert that no number-typed field is reachable anywhere in `schema`.
 *
 * Walks every child position zod v4 exposes — object shapes, arrays, tuples,
 * unions (plain and discriminated), records, and every single-child wrapper
 * (`optional`, `nullable`, `readonly`, `default`, `catch`, `pipe`, `lazy`,
 * `promise`, `nonoptional`, `success`). An **unrecognised** node type with no
 * children is accepted, an unrecognised node type is never assumed numeric, and
 * every numeric leaf throws.
 *
 * @throws NumericSchemaError on the first numeric node, naming its path.
 */
export function assertNoNumericField(schema: ZodType<unknown>, path = "$"): void {
  walk(schema, path, new Set<object>());
}

function walk(schema: unknown, path: string, seen: Set<object>): void {
  if (schema === null || typeof schema !== "object") return;
  // A recursive schema (`z.lazy`) would otherwise not terminate.
  if (seen.has(schema)) return;
  seen.add(schema);

  const def = defOf(schema);
  if (def === null) return;

  const type = typeof def["type"] === "string" ? (def["type"] as string) : "unknown";
  if (NUMERIC_NODE_TYPES.has(type)) throw new NumericSchemaError(path, type);

  // `z.literal(3)` is a number-valued field whose node type is "literal".
  if (type === "literal") {
    const values = def["values"];
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v === "number" || typeof v === "bigint") {
          throw new NumericSchemaError(path, `literal(${String(v)})`);
        }
      }
    }
    return;
  }

  // `z.enum({A: 1})` — a numeric enum reaches the parsed value as a number.
  if (type === "enum") {
    const entries = def["entries"];
    if (entries !== null && typeof entries === "object") {
      for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof v === "number" || typeof v === "bigint") {
          throw new NumericSchemaError(`${path}.${k}`, `enum(${String(v)})`);
        }
      }
    }
    return;
  }

  const shape = def["shape"];
  if (shape !== null && typeof shape === "object") {
    for (const [key, child] of Object.entries(shape as Record<string, unknown>)) {
      walk(child, `${path}.${key}`, seen);
    }
  }

  for (const key of ["element", "valueType", "keyType", "in", "out"] as const) {
    if (key in def) walk(def[key], `${path}<${key}>`, seen);
  }

  // Every single-child wrapper zod v4 spells `innerType`.
  if ("innerType" in def) walk(def["innerType"], path, seen);
  if ("getter" in def && typeof def["getter"] === "function") {
    walk((def["getter"] as () => unknown)(), path, seen);
  }

  for (const key of ["items", "options"] as const) {
    const children = def[key];
    if (Array.isArray(children)) {
      children.forEach((child, i) => {
        walk(child, `${path}[${String(i)}]`, seen);
      });
    }
  }

  const rest = def["rest"];
  if (rest !== null && rest !== undefined) walk(rest, `${path}[...]`, seen);
}

/** The outcome of parsing a raw provider response against its role schema. */
export type SchemaCheck<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "LLM_SCHEMA_REJECT"; readonly issues: readonly string[] };

/**
 * Parse a raw response, strictly.
 *
 * `ARCHITECTURE.md §12`: *"LLM returns invalid schema -> Discard, one retry,
 * then `offline` fallback for that call. Counted."* and *"Never coerce or repair
 * a malformed financial-adjacent response."* Nothing here repairs: the parse
 * either produces the declared type or reports why it could not.
 */
export function checkSchema<T>(schema: ZodType<T>, raw: unknown): SchemaCheck<T> {
  assertNoNumericField(schema);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    reason: "LLM_SCHEMA_REJECT",
    issues: parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`),
  };
}
