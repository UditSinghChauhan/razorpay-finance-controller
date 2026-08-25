/**
 * Rounding, and the exact integer division every other operation is built on.
 *
 * The normative rounding mode is stated in `DATA_MODEL.md §6` and frozen in
 * `PREREGISTRATION.md §4.2`: "half-up to nearest paisa, applied once per line,
 * never re-derived downstream". It is an ASSAY modelling assumption (`§22.2`
 * M1) because Razorpay documents no rounding mode of its own.
 */

import { MAX_PAISE, paise, type Paise } from "./paise.js";

/**
 * `floor(n / d)` and `n mod d` for non-negative integers, computed exactly.
 *
 * JavaScript has no integer division, and `Math.floor(n / d)` alone is not
 * trustworthy at the top of the safe-integer range: `n / d` is a float64
 * division that may round up to exactly an integer when the true quotient is
 * marginally below it, yielding a quotient one too large. The remainder is
 * therefore recomputed with exact arithmetic — `q * d` and `n - q * d` are both
 * exact while the operands stay within the safe range — and the quotient is
 * corrected if the remainder falls outside `[0, d)`. The correction can move
 * the quotient by at most one, so the branches below are not a loop.
 *
 * `DECISION_BRIEF.md §L.1` rule 1 forbids floating point "including
 * intermediates". This function is the reason the rest of the package can obey
 * that: no caller ever holds a fractional value, only an exact
 * (quotient, remainder) pair.
 */
export function floorDivMod(n: number, d: number): { q: number; r: number } {
  let q = Math.floor(n / d);
  let r = n - q * d;
  if (r < 0) {
    q -= 1;
    r += d;
  } else if (r >= d) {
    q += 1;
    r -= d;
  }
  return { q, r };
}

/**
 * Round the exact rational `numerator / denominator` half-up to whole paise.
 *
 * The rational is passed as its two integer terms rather than as a pre-divided
 * value, because a caller who has already computed `numerator / denominator`
 * is holding a float and the information needed to round it correctly is gone.
 * The specification's formulae map directly onto this signature:
 *
 *   fee_ex_gst            = roundHalfUp(amount * rate_bps, 10_000)
 *   tax                   = roundHalfUp(fee_ex_gst * 1800, 10_000)
 *   close_threshold_paise = roundHalfUp(batch_value_paise * 5, 1000)
 *
 * Half-up means a remainder of exactly one half rounds away from zero, so
 * `0.5 -> 1` and `2.5 -> 3`. This is deliberately not `Math.round`, which
 * rounds halves toward positive infinity and would disagree on negatives, and
 * deliberately not banker's rounding, which the specification does not use.
 *
 * The domain is restricted to a non-negative numerator and a positive
 * denominator. Every rounding site in v1.3.0 is non-negative — fees, tax, the
 * close threshold and the soft-evidence score are all non-negative quantities —
 * and "half-up" is ambiguous for negatives in a way the specification never
 * resolves. Rejecting them is the only option that cannot silently pick a
 * direction the specification did not choose.
 *
 * @throws RangeError if either term is not a safe integer, if the denominator
 *   is not positive, or if the numerator is negative.
 */
export function roundHalfUp(numerator: number, denominator: number): Paise {
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError(
      `roundHalfUp: numerator must be a safe integer, received ${String(numerator)}`,
    );
  }
  if (!Number.isSafeInteger(denominator)) {
    throw new RangeError(
      `roundHalfUp: denominator must be a safe integer, received ${String(denominator)}`,
    );
  }
  if (denominator <= 0) {
    throw new RangeError(
      `roundHalfUp: denominator must be positive, received ${String(denominator)}`,
    );
  }
  if (numerator < 0) {
    throw new RangeError(
      `roundHalfUp: negative numerators are out of domain (no rounding site in ` +
        `spec v1.3.0 is negative, and half-up is undefined for them there); ` +
        `received ${String(numerator)}`,
    );
  }

  const { q, r } = floorDivMod(numerator, denominator);

  // Round up when r/d >= 1/2. Written as `r >= d - r` rather than `2r >= d`
  // so that no intermediate can leave the safe-integer range.
  const rounded = r >= denominator - r ? q + 1 : q;

  if (rounded > MAX_PAISE) {
    throw new RangeError(
      `roundHalfUp: result ${String(rounded)} exceeds MAX_PAISE`,
    );
  }
  return paise(rounded);
}
