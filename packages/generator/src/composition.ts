/**
 * The driver, and the record counts derived from it.
 *
 * `PREREGISTRATION.md §4.1`: "**The driver is declared; the record counts are
 * derived.** Uniformity is applied to the simulated merchant volume, not to the
 * row count, so that no family's economic content is distorted to hit a row
 * target." Everything below is that derivation. The published
 * `target_record_count` table is **checked against** it at module load, never
 * read as the answer — if the derivation and the table ever disagree, the module
 * refuses to load rather than silently generating a dataset that fails the seal
 * (`§9` step 5).
 *
 * **Rate realization.** `§4.1`: "Every rate in `§4.2` is a proportion of its
 * stated denominator and is realized **exactly**, rounded half-up, per family
 * instance. The seed governs **which** entities carry a refund, a dispute or an
 * adjustment, and their amounts, methods and timing — never **how many**."
 * Every count in this module is therefore a pure function of the frozen
 * parameters. No seed reaches it.
 *
 * `roundHalfUp` is imported from `@assay/money` rather than reimplemented: the
 * *rule* being reused is `DATA_MODEL.md §6`'s "half-up to nearest paisa",
 * which `§4.1` invokes by name for these counts too, and a second half-up
 * implementation is a second chance to round a boundary the other way.
 */

import { roundHalfUp } from "@assay/money";

import {
  ADJUSTMENT_RATE,
  AUTHORISED_NOT_CAPTURED_RATE,
  DISPUTE_RATE,
  DRIVER_PAYMENTS_PER_FAMILY,
  DUPLICATE_ROW_RATE,
  F05_SELECTION_RATE,
  F05_WITHHELD_PER_SETTLEMENT,
  F06_PAIR_RATE,
  IMPLEMENTED_FAMILIES,
  K_MAX,
  PUBLISHED_TARGET_RECORD_COUNTS,
  RECORD_COUNT_BAND,
  REFUND_PARTIAL_SHARE,
  REFUND_RATE,
  SETTLEMENTS_PER_FAMILY,
  SETTLEMENT_CYCLE,
  SPLIT_TABLE,
  UNIMPLEMENTED_FAMILIES,
  type FamilyId,
} from "./frozen.js";

/** A rate as its two integer terms. `DATA_MODEL.md §0` rule 1 forbids the quotient. */
interface Rate {
  readonly num: number;
  readonly den: number;
}

/**
 * `roundHalfUp(rate x population)`, in counts.
 *
 * The unit is records rather than paise; the rounding *mode* is the one
 * `§4.1` names. `roundHalfUp` returns a `Paise`, which is a `number` at
 * runtime and structurally assignable to one, so no cast is needed and none is
 * performed.
 */
export function realize(rate: Rate, population: number): number {
  if (!Number.isSafeInteger(population) || population < 0) {
    throw new RangeError(`realize: population must be a non-negative integer, received ${String(population)}`);
  }
  return roundHalfUp(rate.num * population, rate.den);
}

/** The seven quantities `§4.1`'s driver block derives, at one value of `P`. */
export interface Composition {
  /** `P` — payments per family instance. */
  readonly P: number;
  /** `A = round_half_up(0.10 x P)` — authorised-not-captured. */
  readonly A: number;
  /** `N = P - A` — captures. */
  readonly N: number;
  /** `R = round_half_up(0.045 x N)` — refunds. */
  readonly R: number;
  /** `D = round_half_up(0.0015 x N)` — disputes. */
  readonly D: number;
  /** `S = 31` — settlements, one batch per capture-day. */
  readonly S: number;
  /** `B = S` — bank lines, 1:1 with settlements. */
  readonly B: number;
  /** `Adj = round_half_up(0.008 x S)` — adjustments. `0` at `S = 31` (§10 V14). */
  readonly Adj: number;
  /** `base(P) = 2P + 2N + 2R + D + S + B + Adj`. */
  readonly base: number;
}

/** Derive `§4.1`'s driver block at an arbitrary `P`. Used to re-check its bounds. */
export function compositionAt(P: number): Composition {
  const A = realize(AUTHORISED_NOT_CAPTURED_RATE, P);
  const N = P - A;
  const R = realize(REFUND_RATE, N);
  const D = realize(DISPUTE_RATE, N);
  const S = SETTLEMENTS_PER_FAMILY;
  const B = S;
  const Adj = realize(ADJUSTMENT_RATE, S);
  const base = 2 * P + 2 * N + 2 * R + D + S + B + Adj;
  return { P, A, N, R, D, S, B, Adj, base };
}

/** The composition at the frozen driver `P = 659`. */
export const COMPOSITION: Composition = Object.freeze(
  compositionAt(DRIVER_PAYMENTS_PER_FAMILY),
);

// ---------------------------------------------------------------------------
// Derived per-family counts
// ---------------------------------------------------------------------------

/** `§4.1`: `DUPLICATE_ROW` emits `round_half_up(0.10 x B)` extra `bank_line` rows. */
export const F04_DUPLICATE_COUNT = realize(DUPLICATE_ROW_RATE, COMPOSITION.B);

/** `§4.2` F05: `round_half_up(0.10 x S)` settlements, one `recon_line` withheld from each. */
export const F05_SELECTED_SETTLEMENTS = realize(F05_SELECTION_RATE, COMPOSITION.S);

/** `§4.2` F06: `round_half_up(0.10 x 31)` collision pairs. */
export const F06_PAIR_COUNT = realize(F06_PAIR_RATE, COMPOSITION.S);

/** `§4.2`: 40% of refunds are partial. */
export const PARTIAL_REFUND_COUNT = realize(REFUND_PARTIAL_SHARE, COMPOSITION.R);

/** `§4.2`: T+1 for 10% of batches. */
export const T_PLUS_1_BATCHES = realize(
  { num: SETTLEMENT_CYCLE.t_plus_1.rate_num, den: SETTLEMENT_CYCLE.t_plus_1.rate_den },
  COMPOSITION.S,
);

/** `§4.2`: T+3 for 15% of batches. */
export const T_PLUS_3_BATCHES = realize(
  { num: SETTLEMENT_CYCLE.t_plus_3.rate_num, den: SETTLEMENT_CYCLE.t_plus_3.rate_den },
  COMPOSITION.S,
);

/**
 * `§4.1`'s per-family delta from `base`, with the mechanism that produces it.
 *
 * Every entry is derived. `F07`'s `+2D` is "a deduction and a later reversal,
 * per dispute", and `§4.1` requires both to be emitted unconditionally: "This is
 * required for the count to be seed-invariant and it is **not** conditional
 * truncation."
 */
export const FAMILY_DELTA: Readonly<Record<FamilyId, number>> = Object.freeze({
  F01: 0,
  F02: 0,
  F03: 0,
  F04: +F04_DUPLICATE_COUNT,
  F05: -(F05_SELECTED_SETTLEMENTS * F05_WITHHELD_PER_SETTLEMENT),
  F06: 0,
  F07: +2 * COMPOSITION.D,
  F08: 0,
  F09: 0,
  F10: 0,
  F11: 0,
  F12: 0,
});

/** The derived `target_record_count` for every family. `F11`/`F12` are not implemented. */
export const TARGET_RECORD_COUNT: Readonly<Record<FamilyId, number>> = Object.freeze(
  Object.fromEntries([
    ...IMPLEMENTED_FAMILIES.map((f) => [f, COMPOSITION.base + FAMILY_DELTA[f]] as const),
    ...UNIMPLEMENTED_FAMILIES.map((f) => [f, 0] as const),
  ]) as Record<FamilyId, number>,
);

// ---------------------------------------------------------------------------
// §4.1's own justification, made executable
// ---------------------------------------------------------------------------

/**
 * Whether `P` satisfies both bounds `§4.1` names.
 *
 * - The 10,000 floor applies to the `F07`-`F10` seed range, whose total is
 *   `4 x base(P) + 2D`.
 * - `K_max = 22` bounds the settlement batch: a component is the settlement,
 *   its constituent recon lines and the bank line carrying it, so the largest
 *   capture-day may hold at most `K_max - 2` captures. Under the balanced
 *   capture-day allocation (`conventions.ts` `C-CAPTURE-DAYS`) that is
 *   `ceil(N / S) <= K_max - 2`.
 */
export function driverIsFeasible(P: number): boolean {
  const c = compositionAt(P);
  const heldOutTotal = 4 * c.base + 2 * c.D;
  const largestBatch = Math.ceil(c.N / c.S);
  return (
    heldOutTotal >= RECORD_COUNT_BAND.min &&
    heldOutTotal <= RECORD_COUNT_BAND.max &&
    largestBatch <= K_MAX - 2
  );
}

/** The inclusive feasible band for the driver, recomputed rather than quoted. */
export function feasibleDriverRange(searchFrom = 1, searchTo = 2000): { low: number; high: number; count: number } {
  let low = -1;
  let high = -1;
  let count = 0;
  for (let P = searchFrom; P <= searchTo; P += 1) {
    if (!driverIsFeasible(P)) continue;
    if (low === -1) low = P;
    high = P;
    count += 1;
  }
  return { low, high, count };
}

/** The observation total for one `(split, seed)` dataset over `families`. */
export function datasetRecordCount(families: readonly FamilyId[]): number {
  return families.reduce((total, f) => total + TARGET_RECORD_COUNT[f], 0);
}

// ---------------------------------------------------------------------------
// Load-time checks against the published table
// ---------------------------------------------------------------------------

function requireEqual(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new Error(
      `composition: ${what} derives to ${String(actual)} but PREREGISTRATION.md §4.1 ` +
        `publishes ${String(expected)}. The derivation and the frozen table disagree; ` +
        `this is a seal failure (§9 step 5), not something to reconcile in code.`,
    );
  }
}

for (const family of [...IMPLEMENTED_FAMILIES, ...UNIMPLEMENTED_FAMILIES]) {
  requireEqual(
    TARGET_RECORD_COUNT[family],
    PUBLISHED_TARGET_RECORD_COUNTS[family],
    `target_record_count[${family}]`,
  );
}

for (const row of SPLIT_TABLE) {
  const total = datasetRecordCount(row.families as readonly FamilyId[]);
  if (total < RECORD_COUNT_BAND.min || total > RECORD_COUNT_BAND.max) {
    throw new Error(
      `composition: the ${row.split} range ${row.families.join(",")} totals ` +
        `${String(total)} observations, outside PROJECT_SPEC.md §9's ` +
        `${String(RECORD_COUNT_BAND.min)}-${String(RECORD_COUNT_BAND.max)} band. ` +
        `PREREGISTRATION.md §9 step 5 calls this a SEAL FAILURE.`,
    );
  }
}

/**
 * Deal `total` items across `parts` buckets as evenly as possible.
 *
 * `floor(total / parts)` each, with the remainder handed to the lowest indices —
 * the same first-k rule `@assay/money`'s `split()` applies to money, restated
 * for counts because `split()` is typed in `Paise` and a count is not money.
 * `tests/property/composition.prop.test.ts` asserts the two agree element for
 * element, so the restatement is checked rather than assumed.
 */
export function evenSplit(total: number, parts: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError(`evenSplit: total must be a non-negative integer, received ${String(total)}`);
  }
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new RangeError(`evenSplit: parts must be a positive integer, received ${String(parts)}`);
  }
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}
