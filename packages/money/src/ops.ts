/**
 * Arithmetic over `Paise`.
 *
 * `ARCHITECTURE.md §3` fixes this package's responsibility as the "`Paise`
 * branded integer type; add/sub/split/allocate; no float ever". `abs` and `sum`
 * are here because the specification's own formulae require them: gate `G3`
 * tests the gross `Σ |item_net_paise|` (`RECONCILIATION_SPEC.md §10.1`) and
 * every balance in `DATA_MODEL.md §17.1` is a `Σ`. Nothing else is exported —
 * ordering and equality need no helper, because a `Paise` is a `number` at
 * runtime and `a < b` already means what it should.
 *
 * Every function re-validates its operands. The brand stops a bare `number`
 * from being passed, but it cannot stop `12.5 as Paise`, and this package is
 * the one place where "a bug here invalidates the entire security argument"
 * (`THREAT_MODEL.md §4`).
 */

import { assertPaise, MAX_PAISE, paise, type Paise } from "./paise.js";
import { floorDivMod } from "./round.js";

/** Sum of two amounts. @throws RangeError on invalid operands or overflow. */
export function add(a: Paise, b: Paise): Paise {
  assertPaise(a, "add");
  assertPaise(b, "add");
  return paise(a + b);
}

/** Difference of two amounts. @throws RangeError on invalid operands or overflow. */
export function sub(a: Paise, b: Paise): Paise {
  assertPaise(a, "sub");
  assertPaise(b, "sub");
  return paise(a - b);
}

/**
 * Magnitude of an amount, as required by gate `G3`'s gross Suspense identity.
 *
 * @throws RangeError on an invalid operand.
 */
export function abs(a: Paise): Paise {
  assertPaise(a, "abs");
  return paise(a < 0 ? -a : a);
}

/**
 * Total of a list of amounts. The empty list sums to zero.
 *
 * The running total is checked at every step rather than only at the end, so a
 * sequence that overflows and returns to the safe range cannot pass unnoticed.
 *
 * @throws RangeError on an invalid element or if any partial sum leaves the
 *   safe-integer range.
 */
export function sum(values: readonly Paise[]): Paise {
  let acc = 0;
  let index = 0;
  for (const value of values) {
    assertPaise(value, `sum[${String(index)}]`);
    acc += value;
    if (!Number.isSafeInteger(acc)) {
      throw new RangeError(
        `sum: partial sum left the safe-integer range at index ${String(index)}`,
      );
    }
    index += 1;
  }
  return paise(acc);
}

/**
 * Divide `total` into `parts` amounts that sum back to exactly `total`.
 *
 * The base share is `floor(|total| / parts)`; the first `|total| mod parts`
 * entries each receive one additional paisa. The extra paise therefore go to
 * the lowest indices, which is the same rule `allocate` applies when every
 * weight is equal, and the two agree by construction.
 *
 * Negative totals are supported and are handled by symmetry: the split is
 * computed on the magnitude and each part carries the sign of `total`.
 * Conservation is exact for either sign.
 *
 * @throws RangeError if `parts` is not a positive safe integer, or on an
 *   invalid total.
 */
export function split(total: Paise, parts: number): Paise[] {
  assertPaise(total, "split");
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new RangeError(
      `split: parts must be a positive integer, received ${String(parts)}`,
    );
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = total < 0 ? -total : total;
  const { q, r } = floorDivMod(magnitude, parts);

  const out: Paise[] = [];
  for (let i = 0; i < parts; i += 1) {
    out.push(paise(sign * (i < r ? q + 1 : q)));
  }
  return out;
}

/**
 * Divide `total` across `weights` in proportion, conserving every paisa.
 *
 * Each entry receives `floor(|total| * wᵢ / Σw)`, and the paise left over are
 * handed out one each by descending exact remainder, ties broken by ascending
 * index. This is the largest-remainder rule. It is deterministic: the same
 * inputs always produce the same output, there is no randomisation, and the
 * ordering depends on nothing but the caller's own argument order.
 *
 * Because the leftover count is strictly less than the number of weights, no
 * entry ever receives more than one extra paisa.
 *
 * Weights are non-negative integers rather than fractions, because
 * `DECISION_BRIEF.md §L.1` rule 1 forbids floating point including
 * intermediates; a proportion is expressed as an integer ratio (basis points,
 * for instance). A zero weight receives zero, and at least one weight must be
 * positive. Negative totals are supported by the same symmetry as `split`.
 *
 * NOTE: spec v1.3.0 requires `allocate` to exist and to conserve
 * (`DECISION_BRIEF.md §C` T0-1, `ARCHITECTURE.md §3`) but does not state how
 * the leftover paise are distributed. The largest-remainder rule and the
 * ascending-index tie-break are documented here as this package's contract.
 *
 * @throws RangeError on an invalid total, an empty weight list, a weight that
 *   is not a non-negative safe integer, an all-zero weight list, or if an
 *   intermediate product would leave the safe-integer range.
 */
export function allocate(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total, "allocate");
  if (weights.length === 0) {
    throw new RangeError("allocate: weights must not be empty");
  }

  let totalWeight = 0;
  let index = 0;
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(
        `allocate: weight[${String(index)}] must be a non-negative integer, ` +
          `received ${String(weight)}`,
      );
    }
    totalWeight += weight;
    if (!Number.isSafeInteger(totalWeight)) {
      throw new RangeError(
        "allocate: total weight left the safe-integer range",
      );
    }
    index += 1;
  }
  if (totalWeight === 0) {
    throw new RangeError("allocate: at least one weight must be positive");
  }

  const sign = total < 0 ? -1 : 1;
  const magnitude = total < 0 ? -total : total;

  const entries: { base: number; remainder: number; index: number }[] = [];
  let allocated = 0;
  let i = 0;
  for (const weight of weights) {
    if (weight !== 0 && magnitude > MAX_PAISE / weight) {
      throw new RangeError(
        `allocate: |total| * weight[${String(i)}] would leave the safe-integer range`,
      );
    }
    const { q, r } = floorDivMod(magnitude * weight, totalWeight);
    entries.push({ base: q, remainder: r, index: i });
    allocated += q;
    i += 1;
  }

  // Strictly less than entries.length, since each floor discards under one unit.
  const leftover = magnitude - allocated;

  const byRemainder = [...entries].sort(
    (x, y) => y.remainder - x.remainder || x.index - y.index,
  );
  let given = 0;
  for (const entry of byRemainder) {
    if (given >= leftover) break;
    entry.base += 1;
    given += 1;
  }

  return entries.map((entry) => paise(sign * entry.base));
}
