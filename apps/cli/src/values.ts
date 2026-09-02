import { entityIdOf, type Observation } from "@assay/domain";
import { isMember, observationValue } from "@assay/engine";

/**
 * `value(observation)` — `DATA_MODEL.md §14.1`'s table, in one place.
 *
 * **This is a read of `§14.1`, not a metric.** `EVALUATION_SPEC.md §4.4(b)` sums
 * *"`entity.amount`"* over misdirected covered entities and `§4.3` sums
 * *"`value(truly_ambiguous \ abstained)`"*; neither states a field selection,
 * because `§14.1` already tabulates one per kind. The formulas stay in
 * `packages/eval`; what lives here is the table they read through.
 *
 * **It is one definition because it was three.** `assay.ts` and `b0.ts` each
 * carried a byte-identical copy, and `bench/scorer.ts` needs the same table to
 * build the two value maps `metrics/harm.ts` and `metrics/abstention.ts` take as
 * parameters — a third copy would be a third place `§14.1` could drift. The move
 * follows the precedent `@assay/domain`'s `entityIdOf` set at spec 1.4.33
 * (`DATA_MODEL.md §22.2` **M55**), which consolidated `§16`'s business
 * identifier for exactly this reason: *"three copies of one `§16` rule is three
 * places for the two journals to come to disagree about what keys them."*
 *
 * **The two member-eligible rows are still not restated.** `observationValue` is
 * `packages/engine`'s, and `§14.1`'s adjustment row — *"`M`, the non-zero one of
 * `debit`/`credit`; **not** `amount`"* — is the row a second reading would get
 * wrong.
 */
export function valueOf(o: Observation): number {
  if (isMember(o)) return observationValue(o);
  switch (o.kind) {
    case "bank_line":
      return o.payload.amount;
    case "settlement":
      return o.payload.amount;
    case "ledger_entry":
      return o.payload.gross_paise;
    case "refund":
      return o.payload.amount;
    case "dispute":
      return o.payload.amount;
    default:
      // payment, order — §10.1's reference kinds, which "have no value under
      // this definition" and carry 0.
      return 0;
  }
}

/**
 * `entityIdOf(o) -> value(o)` over one dataset — the map two metric modules take
 * as a parameter.
 *
 * `metrics/harm.ts` asks for *"`entity.amount` per entity, from the observation
 * set"* and `metrics/abstention.ts` for *"the rupee value of a target"*; both key
 * on a **business identifier**, and both say the join is the dataset's rather
 * than the metric's. One map serves both because it is the same join: `§4.4(b)`'s
 * entities and `§4.3`'s targets are alike named by `DATA_MODEL.md §16`'s *"the
 * observation's own"* identifier, which is `@assay/domain`'s `entityIdOf` and is
 * **not** re-derived here.
 *
 * First writer wins on a repeated key, for the reason `truth.ts`'s
 * `trueTargetByEntity` gives: `§12` (M28) makes the identifier one-to-one on a
 * conforming dataset, so a second observation carrying one is a defect in the
 * dataset rather than an update to it, and taking the last would make a metric
 * depend on file order.
 */
export function valueByEntityId(
  observations: readonly Observation[],
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const observation of observations) {
    const key = entityIdOf(observation);
    if (!out.has(key)) out.set(key, valueOf(observation));
  }
  return out;
}
