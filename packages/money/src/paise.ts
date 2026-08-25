/**
 * The `Paise` type and its only admitting constructor.
 *
 * `DATA_MODEL.md §0` rule 1 is normative and is reproduced here verbatim:
 *
 *   All money is integer paise. Type
 *   `Paise = number & { readonly __paise: unique symbol }`.
 *   Floats are forbidden everywhere, including intermediate values, JSON,
 *   SQLite columns (INTEGER) and the UI (formatted at render only).
 */

/**
 * An amount of Indian paise, as an exact integer.
 *
 * The intersection with a branded property is what makes a bare `number`
 * unassignable to `Paise`, so `const p: Paise = 12.5` and `add(1, 2)` are
 * compile errors rather than review comments (`ARCHITECTURE.md §3`). The brand
 * exists only in the type system: at runtime a `Paise` is an ordinary integer
 * `number`, which is why it serializes to JSON as an integer with no
 * conversion step.
 */
export type Paise = number & { readonly __paise: unique symbol };

/**
 * Largest representable amount: `Number.MAX_SAFE_INTEGER` paise.
 *
 * Invariant `I7` (`RECONCILIATION_SPEC.md §7`) forbids any `Paise` outside the
 * safe-integer range, because beyond it addition silently stops being exact and
 * the tie-out invariants the whole system rests on would fail without raising.
 */
export const MAX_PAISE = Number.MAX_SAFE_INTEGER as Paise;

/** Smallest representable amount. Equal to `-MAX_PAISE`. */
export const MIN_PAISE = -Number.MAX_SAFE_INTEGER as Paise;

/** Zero paise. */
export const ZERO_PAISE = 0 as Paise;

/**
 * Whether `value` is a valid amount: an exact integer inside the safe range.
 *
 * Negative values are valid. Balances are computed debit-positive as
 * `Σ dr − Σ cr` (`DATA_MODEL.md §17.1`), so liability, revenue and other
 * credit-balance accounts carry negative balances, and that is correct rather
 * than an error to be corrected at render.
 */
export function isPaise(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * The only admitting constructor for `Paise`.
 *
 * Throws `RangeError` on a non-integer, on a value outside the safe-integer
 * range, and on `NaN` or `±Infinity` — all of which `Number.isSafeInteger`
 * rejects. Nothing is coerced, truncated, rounded or clamped: a caller holding
 * a fractional rupee amount has already lost information, and silently
 * absorbing it here is how a ₹0.01 error enters a ledger that must tie out
 * exactly.
 */
export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `paise: expected an integer within +/-${MAX_PAISE}, received ${String(value)}`,
    );
  }
  // Collapse negative zero. `Number.isSafeInteger(-0)` is true, so -0 would
  // otherwise be admitted as a second representation of zero: it survives
  // `sign * 0` inside split() and allocate(), and although it compares equal
  // under `===` and serializes to "0", it is a DIFFERENT value under
  // `Object.is`, so it separates Map and Set keys and any identity comparison.
  // There is no negative zero amount of money, and two computations that
  // should agree must not differ in the sign of a zero.
  return (value === 0 ? 0 : value) as Paise;
}

/**
 * Internal guard for values that are already typed as `Paise`.
 *
 * A cast such as `12.5 as Paise` defeats the type system, so every public
 * operation re-checks its operands rather than trusting the brand. This is the
 * runtime half of the guarantee; the brand is the compile-time half.
 */
export function assertPaise(value: Paise, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${label}: not a valid Paise value: ${String(value)}`,
    );
  }
}
