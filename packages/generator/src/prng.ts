/**
 * The vendored PRNG, and the named sub-streams every family draws from.
 *
 * `ARCHITECTURE.md §11`: "Own xorshift128+ PRNG — Reproducibility must survive
 * dependency upgrades. A vendored 20-line generator cannot drift." The rejected
 * alternative is named too: "`seedrandom` — fine, but an external dependency
 * inside the definition of the benchmark."
 *
 * **Everything here is exact integer arithmetic on `bigint`.** No float is
 * produced at any point, not even as an intermediate: `Math.random`-shaped APIs
 * that return a value in `[0, 1)` are deliberately absent, because a caller
 * holding a float has already lost the ability to be reproduced exactly. The
 * only outputs are 64-bit words and bounded integers.
 *
 * **Sub-streams are derived by name, not by draw order** (`conventions.ts`
 * `U-SUBSTREAMS`). `PREREGISTRATION.md §4.2` and `§4.3` refer to "the family
 * PRNG sub-stream" at a dozen sites; if they all shared one stream, inserting a
 * draw in the capture phase would shift every amount, every UTR and every
 * degradation target downstream of it, and a refactor would silently produce a
 * different benchmark. Named derivation makes each phase independent.
 */

import { canonicalJson } from "@assay/domain";
import { hashCanonical } from "@assay/ledger";

const MASK64 = (1n << 64n) - 1n;

/** SplitMix64, the canonical seeding companion for xorshift-family generators. */
function splitMix64(state: bigint): { value: bigint; next: bigint } {
  const next = (state + 0x9e3779b97f4a7c15n) & MASK64;
  let z = next;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return { value: z ^ (z >> 31n), next };
}

/**
 * xorshift128+.
 *
 * Deliberately mutable and deliberately not shared: one `Prng` is one
 * sub-stream, held by one phase. Two phases that need independent values ask
 * `substream` for two names rather than passing one instance around.
 */
export class Prng {
  #s0: bigint;
  #s1: bigint;
  #draws = 0;

  private constructor(s0: bigint, s1: bigint) {
    this.#s0 = s0;
    this.#s1 = s1;
  }

  /**
   * Expand a 64-bit seed into a 128-bit state through SplitMix64.
   *
   * xorshift128+ has one forbidden state — all zeroes, which is a fixed point.
   * SplitMix64 makes it astronomically unlikely; the guard makes it impossible.
   */
  static fromSeed(seed: bigint): Prng {
    let state = seed & MASK64;
    const a = splitMix64(state);
    state = a.next;
    const b = splitMix64(state);
    const s0 = a.value === 0n && b.value === 0n ? 0x1n : a.value;
    return new Prng(s0, b.value === 0n ? 0x9e3779b97f4a7c15n : b.value);
  }

  /** How many 64-bit words this stream has produced. For test assertions only. */
  get draws(): number {
    return this.#draws;
  }

  /** The next 64-bit word. */
  next(): bigint {
    let x = this.#s0;
    const y = this.#s1;
    this.#s0 = y;
    x = (x ^ (x << 23n)) & MASK64;
    x = x ^ y ^ (x >> 17n) ^ (y >> 26n);
    this.#s1 = x & MASK64;
    this.#draws += 1;
    return (this.#s1 + y) & MASK64;
  }

  /**
   * A uniform integer in `[0, bound)`.
   *
   * Computed as `(word * bound) >> 64` — Lemire's multiply-shift **without**
   * its rejection step. The residual bias is at most `bound / 2^64`, which for
   * every bound this generator uses (the largest is the 2,048-atom amount
   * table) is below 2^-52 and cannot change a realized count: every count in
   * this package is computed by `roundHalfUp` from a frozen rate, never by
   * sampling. Rejection is avoided so that the number of words consumed per
   * draw is fixed at one and a stream's position never depends on the values
   * it produced.
   */
  below(bound: number): number {
    if (!Number.isSafeInteger(bound) || bound <= 0) {
      throw new RangeError(`Prng.below: bound must be a positive integer, received ${String(bound)}`);
    }
    return Number((this.next() * BigInt(bound)) >> 64n);
  }

  /** A uniform integer in `[low, high]`, both inclusive. */
  between(low: number, high: number): number {
    if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || high < low) {
      throw new RangeError(
        `Prng.between: expected low <= high as integers, received ${String(low)}..${String(high)}`,
      );
    }
    return low + this.below(high - low + 1);
  }

  /** A uniform member of a non-empty list. */
  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Prng.pick: empty list");
    const chosen = values[this.below(values.length)];
    /* c8 ignore next */
    if (chosen === undefined) throw new RangeError("Prng.pick: index out of range");
    return chosen;
  }

  /** `true` with probability `num / den`, computed in integers. */
  chance(num: number, den: number): boolean {
    if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0 || num < 0) {
      throw new RangeError(`Prng.chance: expected 0 <= num, 0 < den, received ${String(num)}/${String(den)}`);
    }
    return this.below(den) < num;
  }

  /**
   * A uniformly random permutation of `0..count-1` (Fisher-Yates, descending).
   *
   * Selection everywhere in this package is "take the first `k` of a shuffled
   * index list", never "draw until `k` distinct indices appear". The first form
   * consumes a fixed number of words and cannot loop; the second is rejection
   * sampling and its cost depends on the values drawn.
   */
  permutation(count: number): number[] {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Prng.permutation: expected a non-negative integer, received ${String(count)}`);
    }
    const out = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i -= 1) {
      const j = this.below(i + 1);
      const a = out[i];
      const b = out[j];
      /* c8 ignore next */
      if (a === undefined || b === undefined) throw new RangeError("Prng.permutation: index out of range");
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /**
   * `k` distinct indices from `0..count-1`, in ascending order.
   *
   * Ascending rather than draw order so that a selection is a *set*, and two
   * implementations that select the same records produce the same list.
   */
  sample(count: number, k: number): number[] {
    if (!Number.isSafeInteger(k) || k < 0 || k > count) {
      throw new RangeError(`Prng.sample: expected 0 <= k <= count, received k=${String(k)} count=${String(count)}`);
    }
    return this.permutation(count).slice(0, k).sort((a, b) => a - b);
  }
}

/** The name of one sub-stream. Free-form, but every use site is a constant. */
export type StreamName = string;

/**
 * Derive the sub-stream `(seed, family, stream)`.
 *
 * The digest is taken over canonical JSON so that the derivation is the same
 * function the rest of the system already hashes with (`DATA_MODEL.md §0`
 * rule 5), and so that a reviewer can recompute any stream's seed by hand.
 */
export function substream(seed: number, family: string, stream: StreamName): Prng {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError(`substream: seed must be a non-negative integer, received ${String(seed)}`);
  }
  const digest = hashCanonical({ seed, family, stream });
  return Prng.fromSeed(BigInt(`0x${digest.slice(0, 16)}`));
}

/**
 * The canonical JSON a sub-stream is derived from, for tests and diagnostics.
 *
 * Exported so a test can assert that two streams differ *because their names
 * differ*, rather than asserting on values and hoping.
 */
export function substreamKey(seed: number, family: string, stream: StreamName): string {
  return canonicalJson({ seed, family, stream });
}

/** The stream names this package uses. One constant per phase; no string literals at call sites. */
export const STREAMS = Object.freeze({
  ID: "id",
  ID_OBS: "id-observation",
  AMOUNT: "amount",
  METHOD: "method",
  CARD: "card",
  CAPTURE: "capture",
  DAY_CLOCK: "day-clock",
  REFUND: "refund",
  DISPUTE: "dispute",
  CYCLE: "cycle",
  BANK: "bank",
  MERCHANT: "merchant",
  F05: "f05",
  F06: "f06",
  F07: "f07",
  OP_DROP_SETTLEMENT_ID: "op:DROP_SETTLEMENT_ID",
  OP_MANGLE_UTR: "op:MANGLE_UTR",
  OP_TRUNCATE_NARRATION: "op:TRUNCATE_NARRATION",
  OP_DUPLICATE_ROW: "op:DUPLICATE_ROW",
  OP_INJECT_NOTES: "op:INJECT_NOTES",
  OP_CONFLICT_REFERENCE: "op:CONFLICT_REFERENCE",
} as const);
