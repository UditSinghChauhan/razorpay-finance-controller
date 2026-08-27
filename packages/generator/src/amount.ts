/**
 * Drawing a payment amount, and the fee arithmetic every line carries.
 *
 * The distribution is `PREREGISTRATION.md §4.2`'s frozen log-normal, realized
 * through the committed quantile table in `amount-table.ts`. The fee model is
 * `DATA_MODEL.md §6`, transcribed exactly:
 *
 *     fee_ex_gst = round_half_up(amount * rate_bps / 10_000)
 *     tax        = round_half_up(fee_ex_gst * 1800 / 10_000)
 *     fee        = fee_ex_gst + tax        // GST-INCLUSIVE
 *     credit     = amount - fee
 *
 * `fee` is what the recon line carries and `tax` is the component **inside** it.
 * `[RZP-DOC]` D1/D2/D3; spec 1.1.0's `credit = amount - fee - tax` was withdrawn
 * as a false provenance claim.
 */

import { MAX_PAISE, paise, roundHalfUp, sub, type Paise } from "@assay/money";

import { AMOUNT_QUANTILES } from "./amount-table.js";
import { AMOUNT_DISTRIBUTION, FEE_RATE_BPS, GST_RATE_BPS } from "./frozen.js";
import type { Prng } from "./prng.js";

/** A method with a frozen rate (`§4.2`). `DATA_MODEL.md §2` `Payment.method`. */
export type Method = keyof typeof FEE_RATE_BPS;

/** The four figures a settled payment line carries. All integer paise. */
export interface FeeBreakdown {
  readonly amount: Paise;
  /** `fee - tax`. Posts to `5100_PG_FEE_EXPENSE` (`DATA_MODEL.md §17.1` P2). */
  readonly fee_ex_gst: Paise;
  /** The GST component inside `fee`. Posts to `1300_GST_INPUT_CREDIT`. */
  readonly tax: Paise;
  /** GST-inclusive. This is what `ReconLine.fee` carries. */
  readonly fee: Paise;
  /** `amount - fee`. This is what `ReconLine.credit` carries. */
  readonly credit: Paise;
}

/**
 * Draw one amount from the frozen distribution.
 *
 * Exactly one 64-bit word is consumed per draw, whatever the value, so a
 * stream's position never depends on what it produced.
 */
export function drawAmount(prng: Prng): Paise {
  const drawn = AMOUNT_QUANTILES[prng.below(AMOUNT_QUANTILES.length)];
  /* c8 ignore next */
  if (drawn === undefined) throw new RangeError("drawAmount: quantile index out of range");
  // §4.2: "a draw outside I7's safe-integer range is rejected and redrawn from
  // the same sub-stream". The table's support is bounded well inside the safe
  // range, so this branch is unreachable under the committed table. It is kept
  // because the clause is frozen and a future table must not silently violate
  // I7; it is stated here rather than implemented as a loop, because a loop
  // that can never run is a loop nobody can test.
  if (drawn <= 0 || drawn > MAX_PAISE) {
    throw new RangeError(
      `drawAmount: the committed quantile table produced ${String(drawn)}, outside invariant I7's ` +
        `range. §4.2 requires such a draw to be redrawn; a table that can produce one is a defect.`,
    );
  }
  return paise(drawn);
}

/** `DATA_MODEL.md §6`'s fee model, at a given rate. `rate_bps` is EX-GST. */
export function feeBreakdown(amount: Paise, rateBps: number): FeeBreakdown {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new RangeError(`feeBreakdown: rate_bps must be a non-negative integer, received ${String(rateBps)}`);
  }
  const fee_ex_gst = roundHalfUp(amount * rateBps, 10_000);
  const tax = roundHalfUp(fee_ex_gst * GST_RATE_BPS, 10_000);
  const fee = paise(fee_ex_gst + tax);
  return { amount, fee_ex_gst, tax, fee, credit: sub(amount, fee) };
}

/** The rate in force for `method`, honouring `F03`'s mid-period card change. */
export function rateBpsFor(method: Method, cardRateBps: number): number {
  return method === "card" ? cardRateBps : FEE_RATE_BPS[method];
}

// ---------------------------------------------------------------------------
// Load-time checks on the committed table
// ---------------------------------------------------------------------------

if (AMOUNT_QUANTILES.length !== 2048) {
  throw new Error("amount: the committed quantile table is not 2,048 atoms.");
}
for (let i = 1; i < AMOUNT_QUANTILES.length; i += 1) {
  const previous = AMOUNT_QUANTILES[i - 1];
  const current = AMOUNT_QUANTILES[i];
  /* c8 ignore next */
  if (previous === undefined || current === undefined) throw new Error("amount: table hole");
  if (current <= previous) {
    throw new Error(`amount: the quantile table is not strictly increasing at index ${String(i)}.`);
  }
}

/** The `p`-quantile of the realized 2,048-atom distribution. */
export function discreteQuantile(p: number): number {
  const index = Math.ceil(p * AMOUNT_QUANTILES.length) - 1;
  const value = AMOUNT_QUANTILES[index];
  /* c8 ignore next */
  if (value === undefined) throw new RangeError(`discreteQuantile: p out of range: ${String(p)}`);
  return value;
}

/** Relative error of the realized distribution against a frozen parameter, in basis points. */
export function quantileErrorBps(p: number, declared: number): number {
  return Math.round((Math.abs(discreteQuantile(p) - declared) * 10_000) / declared);
}

// The table is data, so it is checked against the two parameters it claims to
// realize rather than trusted. 100 bps == 1%; both land under 15 bps.
for (const [p, declared, label] of [
  [0.5, AMOUNT_DISTRIBUTION.median_paise, "median"],
  [0.99, AMOUNT_DISTRIBUTION.p99_paise, "p99"],
] as const) {
  const error = quantileErrorBps(p, declared);
  if (error > 100) {
    throw new Error(
      `amount: the realized ${label} misses §4.2's frozen parameter by ${String(error)} bps ` +
        `(${String(discreteQuantile(p))} against ${String(declared)}).`,
    );
  }
}
