/**
 * Canonical JSON, the serialization every `*_hash` field is computed over.
 *
 * `DATA_MODEL.md §0` rule 5 is normative and states exactly four requirements:
 * "keys sorted lexicographically, no whitespace, UTF-8, integers only (no
 * exponent notation)".
 *
 * The whole point is that two runs over identical inputs produce identical
 * bytes — metric 23 (`determinism_check`) and invariant `I9` both require the
 * ledger root hash to be reproducible, and `ARCHITECTURE.md §8` binds the
 * genesis hash to the dataset through this encoding. Anything that can vary
 * between two executions must therefore be refused rather than serialized:
 * a float that prints differently, a key order that follows insertion, a
 * `Date` that reads a clock.
 *
 * `JSON.stringify` is deliberately not used to canonicalize structures: its
 * object key order follows insertion order for string keys, which is a
 * property of how a value was built rather than of what it means. It *is* used
 * for one narrow purpose — escaping a string leaf — because ECMA-262 specifies
 * that escaping exactly (`QuoteJSONString`), it is deterministic, and
 * reimplementing it would add a second, less-tested escaper for no benefit.
 */

/** A value that canonical JSON accepts. */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * Serialize `value` to its canonical JSON form.
 *
 * Rejects, rather than coerces:
 *
 *   - any non-integer number, `NaN` and `±Infinity` — rule 5 admits integers
 *     only, and a float has no single decimal spelling to hash;
 *   - any integer outside the safe range, whose decimal form is not reliable
 *     and which invariant `I7` forbids anyway;
 *   - `undefined` — `JSON.stringify` silently drops object properties holding
 *     it, so accepting it would let a field vanish from a hashed body without
 *     anything raising;
 *   - functions, symbols, bigints, and any object that is not a plain object
 *     or array — `Date`, `Map` and class instances all serialize lossily or
 *     unstably;
 *   - cycles.
 *
 * @throws TypeError on an unsupported value, with the JSON path to it.
 */
export function canonicalJson(value: unknown): string {
  return write(value, "$", new Set<object>());
}

function write(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number":
      return writeNumber(value, path);

    case "string":
      // ECMA-262 QuoteJSONString: fully specified and deterministic.
      return JSON.stringify(value);

    case "object":
      return writeObject(value as object, path, seen);

    case "undefined":
      throw new TypeError(
        `canonicalJson: undefined is not serializable at ${path}. A property ` +
          `that may be absent must be modelled as null, or omitted entirely.`,
      );

    default:
      throw new TypeError(
        `canonicalJson: ${typeof value} is not serializable at ${path}`,
      );
  }
}

function writeNumber(value: number, path: string): string {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `canonicalJson: only safe integers are serializable (DATA_MODEL.md §0 ` +
        `rule 5), received ${String(value)} at ${path}`,
    );
  }
  // String() of a safe integer is always plain decimal, never exponent
  // notation, and normalizes -0 to "0".
  return String(value === 0 ? 0 : value);
}

function writeObject(value: object, path: string, seen: Set<object>): string {
  if (seen.has(value)) {
    throw new TypeError(`canonicalJson: circular reference at ${path}`);
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const parts = value.map((item, index) =>
      write(item, `${path}[${String(index)}]`, seen),
    );
    seen.delete(value);
    return `[${parts.join(",")}]`;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError(
      `canonicalJson: only plain objects and arrays are serializable, ` +
        `received ${value.constructor.name} at ${path}`,
    );
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  // Own enumerable string keys only, sorted lexicographically by code unit.
  // Symbol keys are ignored by JSON and are ignored here for the same reason.
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => {
    const encoded = write(record[key], `${path}.${key}`, seen);
    return `${JSON.stringify(key)}:${encoded}`;
  });
  seen.delete(value);
  return `{${parts.join(",")}}`;
}
