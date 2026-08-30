/**
 * The PG-side recon report — `RECONCILIATION_SPEC.md §6.2`'s probe surface.
 *
 * `ARCHITECTURE.md §3` assigns this package *"the PG-side recon report `§6.2`'s
 * probe reads (spec 1.4.22)"*. `§6.2` describes it in one sentence and this
 * module is that sentence: *"`bench/<split>/recon_report.jsonl`, one row per
 * `ReconLine` the simulation produced, carrying `settlement_id`, `entity_id` and
 * `settled_at` and **nothing else**. It does **not** query the observation
 * set."*
 *
 * **It is built from the true state, and that is the whole point.** Two
 * asymmetries between this artifact and `observations.jsonl` are load-bearing,
 * and both follow from reading `TrueState` rather than an `Observation[]`:
 *
 *   1. **Pre-`F05`.** `emit.ts` drops one constituent `recon_line`
 *      **observation** per selected settlement (`PREREGISTRATION.md §4.2`), so
 *      *"the report may return an `entity_id` for which no observation exists"*
 *      (`§6.2`). `DATA_MODEL.md §12`'s treatment of such an id — excluded from
 *      `R*` entirely, neither numerator nor denominator — *"is unchanged and is
 *      now reachable rather than hypothetical"*. The withholding is not applied
 *      here; a report that applied it could not satisfy that derivation.
 *   2. **Pre-operator.** `§4.3`'s `DROP_SETTLEMENT_ID` models *"**Merchant-side**
 *      recon copies that lack the PG's batch identifier"*, so *"a line whose
 *      `settlement_id` was nulled ... still carries it in the report"* and
 *      *"the key therefore never fails on a conforming dataset"*. This is
 *      structural rather than remembered: `degrade()` takes an `Emission` and
 *      cannot reach a `TrueState`, so nothing an operator did is visible from
 *      here.
 *
 * **Nothing is re-simulated and nothing is re-derived.** Every value below is
 * read off `TrueState` exactly as `emit.ts` reads it, through the one settlement
 * inversion `simulate.ts` owns.
 *
 * **This module writes no file**, as no module in this package does. `apps/cli`
 * serializes and `PREREGISTRATION.md §9` step 4 hashes; the row order fixed
 * below is what makes those bytes, and therefore `recon_report_sha256`, stable.
 */

import { settlementsByMember, type SimSettlement, type TrueState } from "./simulate.js";

/**
 * One row of `bench/<split>/recon_report.jsonl` (`§6.2`; `DATA_MODEL.md §22.2`
 * M36, M38).
 *
 * **Three fields and nothing else.** `§6.2` states the column set as a closure —
 * *"carrying `settlement_id`, `entity_id` and `settled_at` and **nothing
 * else**"* — and `DECISION_BRIEF.md §A.17` (M24) records that `settlement_utr`
 * *"is read by no normative rule anywhere"*, so no fallback key is added here.
 * The declaration order is `§6.2`'s own, and it is the serialized key order:
 * `JSON.stringify` emits an object literal's keys in insertion order.
 *
 * `settlement_id` and `settled_at` are `null` together or not at all — they are
 * two readings of the same absent settlement (`DATA_MODEL.md §6`: `settled_at`
 * is *"`null` exactly when no settlement carried the line"*). `entity_id` is
 * total: every row names the `pay_…`, `rfnd_…` or `adj_…` whose line it is.
 */
export interface ReconReportRow {
  /** The batch that carried the line; `null` for `§4.2`'s UNSETTLED member. */
  readonly settlement_id: string | null;
  /** `§6.2`: the report's only non-key column, and its total order. */
  readonly entity_id: string;
  /** Unix seconds. Settlement-scoped (`DATA_MODEL.md §6`, M18), never line-scoped. */
  readonly settled_at: number | null;
}

/**
 * `§6.2`'s report for one family instance, ordered by `entity_id` ascending.
 *
 * **Membership — one row per `ReconLine` the simulation produced.** That is
 * captured payments, every refund and every adjustment, which is exactly the set
 * `emit.ts` turns into `recon_line` and `adjustment` observations:
 *
 *   - An **uncaptured** payment contributes no row. `emit.ts` skips it because
 *     it *"produces no `ReconLine` at all, so there is no row to include or
 *     omit"* (`§6.2`) — a settled amount with no capture row is `F05`'s other
 *     half and is a fact about the simulation, not a withholding.
 *   - An `F05`-**withheld** payment DOES contribute a row. That skip is applied
 *     at emission, to the observation, and is not applied here (see the module
 *     comment).
 *   - A row whose `settlement_id` and `settled_at` are both `null` is emitted
 *     like any other, derived at spec 1.4.24 (M38). Such a line *"**is** a
 *     `ReconLine` the simulation produced, and the membership rule ... admits
 *     it"*; that `settlement_id` is the only query key makes the row
 *     **unreachable**, which `§6.2` states as an independent fact that does not
 *     qualify membership.
 *
 * **Order — `entity_id` ascending, ratified at spec 1.4.24 (M38).** No frozen
 * rule determined one: `PREREGISTRATION.md §7` constrains **determinism** and
 * not the **choice**, and `DATA_MODEL.md §0`'s canonical traversal is scoped to
 * `true_journal` and keys on `seq` and `account`, which this artifact does not
 * carry. `entity_id` was chosen because it is *"total and never null"* here, so
 * **no null-ordering rule is introduced** — which ordering by `settled_at` or
 * `settlement_id` would need, both being nullable in this artifact. The order
 * *"carries no meaning: the query selects on `settlement_id` and `SE5` is a set
 * measure, so no rule reads a row's position"*. It is fixed only so the bytes,
 * and therefore `recon_report_sha256`, are stable.
 */
export function buildReconReport(state: TrueState): readonly ReconReportRow[] {
  const carriedBy = settlementsByMember(state);
  const rows: ReconReportRow[] = [];

  for (const payment of state.payments) {
    // `emit.ts`'s own condition, verbatim: an authorised-not-captured payment
    // has no fee breakdown and no recon line exists to carry one. This is NOT
    // F05 — F05 removes an observation for a line that does exist.
    if (!payment.captured || payment.fee === null) continue;
    rows.push(row(payment.id, carriedBy.payment.get(payment.index)));
  }

  // Every refund and every adjustment carries a line; neither is ever withheld
  // and neither has an uncaptured analogue.
  for (const refund of state.refunds) {
    rows.push(row(refund.id, carriedBy.refund.get(refund.index)));
  }
  for (const adjustment of state.adjustments) {
    rows.push(row(adjustment.id, carriedBy.adjustment.get(adjustment.index)));
  }

  assertDistinct(rows);
  // Code-unit order, not `localeCompare`: `DATA_MODEL.md §0` rule 3 confines an
  // identifier to `[A-Za-z0-9]` after its prefix, so code-unit order is byte
  // order, and it is the same on every host. A locale-aware comparison would
  // make the sealed bytes depend on the machine that produced them.
  rows.sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));
  return Object.freeze(rows);
}

/** One line's row. `undefined` is `§4.2`'s UNSETTLED member, not a lookup miss. */
function row(entityId: string, settlement: SimSettlement | undefined): ReconReportRow {
  return Object.freeze({
    // Read exactly as `emit.ts` reads them onto the observation, so the report
    // and a surviving observation of the same line can never disagree.
    settlement_id: settlement?.id ?? null,
    entity_id: entityId,
    settled_at: settlement?.settled_at ?? null,
  });
}

/**
 * `entity_id` is a **total order** over this artifact (`§6.2`, M38), which it is
 * only while the ids are distinct. `mint.ts` guarantees that within a dataset
 * and *"asserts, never repairs"* it; this restates the guarantee at the one
 * place a duplicate would silently cost the order its totality and leave the
 * sealed bytes resting on a sort's stability.
 */
function assertDistinct(rows: readonly ReconReportRow[]): void {
  const seen = new Set<string>();
  for (const line of rows) {
    if (seen.has(line.entity_id)) {
      /* c8 ignore next 5 */
      throw new Error(
        `buildReconReport: ${line.entity_id} appears twice. RECONCILIATION_SPEC.md §6.2 orders ` +
          `this artifact by entity_id ascending and DATA_MODEL.md §22.2 M38 calls that order ` +
          `total; a duplicate id is a generator defect, not an ordering question.`,
      );
    }
    seen.add(line.entity_id);
  }
}
