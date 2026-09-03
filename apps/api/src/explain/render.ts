/**
 * Rendering integer paise for the **evidence set** an explanation is grounded
 * in.
 *
 * `DATA_MODEL.md §0` rule 1 keeps money stored as integer paise and formatted
 * *"at render time"*, and `ARCHITECTURE.md §4` boundary 2 states `R4`'s
 * grounding rule as *"every numeral in the prose must appear in the attached
 * evidence set"*. Those two sentences together decide this module's existence:
 * a figure the model is permitted to quote has to reach it already rendered, in
 * the form it may quote, or the check rejects the very quotation it was asked
 * for.
 *
 * **The grouping is `Intl`'s, not a second copy of the frontend's.**
 * `apps/web/src/lib/format.ts` hand-rolls the `XX,XX,XXX` grouping for its own
 * reasons; re-implementing that algorithm here would put two spellings of one
 * convention in the repository, and the first divergence would be a number the
 * model was told it may cite and the page never shows. Delegating to
 * `Intl.NumberFormat("en-IN")` is the standard library doing the same job once.
 *
 * **Three renderings of one figure, deliberately.** A model asked for prose
 * about ₹1,00,000 may reasonably write it grouped, ungrouped, or in paise, and
 * `groundNumerals` compares **digit runs** — `₹1,00,000.00` yields
 * `1 / 00 / 000 / 00` and `10000000` yields one run that matches none of them.
 * Attaching all three is not a weakening of the check: each is the same
 * quantity, read off the same field of the same sealed record.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** One figure, as the evidence set carries it: `₹1,00,000.00 (10000000 paise)`. */
export function renderPaise(paise: number): string {
  return `${INR.format(paise / 100)} (${String(paise)} paise)`;
}

/** Every spelling of one figure a grounded explanation may quote. */
export function paiseSpellings(paise: number): readonly string[] {
  return [INR.format(paise / 100), PLAIN.format(Math.trunc(paise / 100)), String(paise)];
}

/** A basis-point score, rendered. Never an amount (`§4.2` scores are unitless). */
export function renderBps(bps: number): string {
  return `${String(bps)} bps`;
}
