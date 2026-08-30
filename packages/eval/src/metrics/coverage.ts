/**
 * Coverage — `EVALUATION_SPEC.md §4.1`. Metrics 1, 9, 27, 28 and the audit line.
 *
 * `§4.1`'s first sentence is the one that governs every function here:
 * *"Coverage is measured over the **reconcilable** observation universe only
 * (`DATA_MODEL.md §10.1`). Reference-kind observations reach the `REFERENCE`
 * terminal state, are never matched, never post to the ledger, and appear in no
 * coverage numerator or denominator."*
 *
 * **Why the universes must match**, in `§4.1`'s own words: *"A single ₹1,000
 * payment surfaces as up to six observations ... one economic rupee is counted
 * several times on both sides at inconsistent weights, and the ratio is not
 * bounded by 1.0. A quantity that can exceed unity is not a coverage rate."*
 * Every ratio below therefore draws its numerator and denominator from one
 * `kind`, and the one metric that does not — metric 9, which spans the
 * reconcilable kinds — restricts **both** sides to them.
 *
 * **Ratios are computed here and are not authoritative.** `DATA_MODEL.md §20`:
 * *"The four coverage ratios are derived display values computed at render from
 * the integer paise fields; the integers are authoritative and no gate compares
 * a ratio."* Each result therefore carries its numerator and denominator in
 * paise beside the ratio, so a reader can recompute it and a gate can avoid it.
 */

import { isReconcilableKind } from "@assay/domain";

import type { AgentRun, ObservationOutcome } from "../run.js";

/**
 * A rate with the two integers it was computed from.
 *
 * `denominator_paise` is a count for metric 9 and a rupee figure elsewhere; the
 * field name follows the majority and the doc on each function says which.
 */
export interface CoverageRatio {
  readonly numerator: number;
  readonly denominator: number;
  /** `0` when the denominator is `0`, which is a scope statement rather than a score. */
  readonly ratio: number;
}

const ratio = (numerator: number, denominator: number): CoverageRatio =>
  Object.freeze({
    numerator,
    denominator,
    // A zero denominator is not an error and must not be `NaN`: metric 28 has
    // one by construction whenever a dataset carries no ledger entry, and
    // §4.1 requires the figure to be "published unchanged".
    ratio: denominator === 0 ? 0 : numerator / denominator,
  });

const sumWhere = (
  outcomes: readonly ObservationOutcome[],
  predicate: (o: ObservationOutcome) => boolean,
): number => outcomes.reduce((total, o) => (predicate(o) ? total + o.value_paise : total), 0);

/**
 * Metric 1 — `coverage_by_value`, the **primary** headline figure.
 *
 * ```
 *   batch_value_paise = Σ over all recon_line observations of payload.amount
 *   coverage_by_value = Σ recon_line.amount where state = RECONCILED
 *                       ──────────────────────────────────────────────
 *                                    batch_value_paise
 * ```
 *
 * `§4.1` derives the denominator rather than choosing it: `Σ recon_line.amount`
 * is the only candidate that is computable from observations alone, is
 * agent-independent, carries each economic event once, and is
 * rupee-denominated. `Σ bank_line.amount` fails the third — `I5` makes bank
 * lines aggregates — and a ground-truth denominator fails the first.
 *
 * **Decision enabled:** *"How much of my close is automated?"* It is primary
 * over metric 9 because *"abstaining on the three largest settlements while
 * reconciling 9,997 small ones is a bad outcome that the count metric would
 * hide"*.
 */
export function coverageByValue(run: AgentRun): CoverageRatio {
  return ratio(
    sumWhere(run.outcomes, (o) => o.kind === "recon_line" && o.state === "RECONCILED"),
    sumWhere(run.outcomes, (o) => o.kind === "recon_line"),
  );
}

/**
 * `batch_value_paise` — `Σ recon_line.amount`.
 *
 * The coverage denominator and the close-policy denominator, which
 * `RECONCILIATION_SPEC.md §10.3` and `EVALUATION_SPEC.md §4.9` both read.
 * Exported on its own because `DATA_MODEL.md §20` records it on the close report
 * so that *"`period_status` is independently recomputable from the close report
 * alone"*.
 */
export function batchValuePaise(run: AgentRun): number {
  return sumWhere(run.outcomes, (o) => o.kind === "recon_line");
}

/**
 * Metric 9 — `coverage_by_count`, over reconcilable kinds on **both** sides.
 *
 * `§4.1`: *"reference-kind observations reach `REFERENCE` and can never reach
 * `RECONCILED`, so leaving them in the denominator would cap the metric
 * permanently below 1.0 and make a perfect run indistinguishable from an
 * imperfect one."*
 *
 * **Depressed by a cause `§4.1` names and refuses to correct.** `ledger_entry`
 * is a reconcilable kind, so it sits in this denominator and *"can never leave
 * it"* — `AN5` is retired, so no ledger entry reaches `RECONCILED`. `§4.1`:
 * *"reclassifying `ledger_entry` as a reference kind would delete
 * `E13_LEDGER_ONLY` and with it `THREAT_MODEL.md §T5`'s detection, which is a
 * worse trade than a depressed rate. Reported with this note attached."*
 */
export function coverageByCount(run: AgentRun): CoverageRatio {
  const reconcilable = run.outcomes.filter((o) => isReconcilableKind(o.kind));
  return ratio(
    reconcilable.filter((o) => o.state === "RECONCILED").length,
    reconcilable.length,
  );
}

/**
 * Metric 27 — `coverage_by_value_bank`. Mandatory (`§4.1`, `§5.2`).
 *
 * *"Reconciliation is three-sided, and a run can show 99% recon-view coverage
 * while the bank statement is largely untied. The bank view does not solve that
 * — it **exposes** it."* `PREREGISTRATION.md §10` V18 records that this figure
 * is bounded by `AN2` alone, and that its definition is **not** amended to
 * compensate.
 */
export function coverageByValueBank(run: AgentRun): CoverageRatio {
  return ratio(
    sumWhere(run.outcomes, (o) => o.kind === "bank_line" && o.state === "RECONCILED"),
    sumWhere(run.outcomes, (o) => o.kind === "bank_line"),
  );
}

/**
 * Metric 28 — `coverage_by_value_ledger`. Mandatory, and `0.0` by construction.
 *
 * `§4.1`: *"Metric 28 reads `0.0` by construction at spec 1.4.1, and this is a
 * scope statement rather than a performance figure."* `AN5` is retired
 * (`RECONCILIATION_SPEC.md §3`), a `ledger_entry` is never a target and cannot
 * be a candidate member, so *"the numerator is structurally empty on every run,
 * for every agent, on every seed. **The figure is published unchanged and this
 * paragraph is published with it.**"*
 *
 * The denominator is `payload.gross_paise`, corrected in `§4.1`:
 * `MerchantLedgerEntry` *"declares no `amount` field; the formula named one that
 * does not exist"*. `DATA_MODEL.md §14.1` values the kind at the same field, so
 * `ObservationOutcome.value_paise` already carries it.
 *
 * The numerator is **computed rather than hard-coded to zero.** A function that
 * returned `0` unconditionally would keep reading `0.0` if `AN5` were ever
 * reinstated, and the report would state a scope fact that had stopped being
 * true.
 */
export function coverageByValueLedger(run: AgentRun): CoverageRatio {
  return ratio(
    sumWhere(run.outcomes, (o) => o.kind === "ledger_entry" && o.state === "RECONCILED"),
    sumWhere(run.outcomes, (o) => o.kind === "ledger_entry"),
  );
}

/**
 * The `EXPLORATORY` audit line — `§4.1`, `PREREGISTRATION.md §8`.
 *
 * ```
 *   coverage_by_value_all_observations = Σ value(RECONCILED over all observations)
 *                                        ────────────────────────────────────────
 *                                        Σ value(all observations)
 * ```
 *
 * *"computed under the spec 1.1.1 definition of this metric and labelled
 * `EXPLORATORY` ... **It supports no claim.** It exists so that a reviewer can
 * see both definitions and the transition between them without re-running
 * anything."* It is not bounded by 1.0 and is not a coverage rate; that is the
 * point of publishing it beside metric 1 rather than instead of it.
 */
export function coverageByValueAllObservations(run: AgentRun): CoverageRatio {
  return ratio(
    sumWhere(run.outcomes, (o) => o.state === "RECONCILED"),
    sumWhere(run.outcomes, () => true),
  );
}

/** Every `§4.1` figure, computed together because `§5.2` publishes them together. */
export interface CoverageReport {
  readonly coverage_by_value: CoverageRatio;
  readonly coverage_by_count: CoverageRatio;
  readonly coverage_by_value_bank: CoverageRatio;
  readonly coverage_by_value_ledger: CoverageRatio;
  /** `EXPLORATORY`. Supports no claim. */
  readonly coverage_by_value_all_observations: CoverageRatio;
  readonly batch_value_paise: number;
}

/**
 * All four views plus the audit line.
 *
 * `§4.1`: *"all three are published side by side and none is collapsed into the
 * others"*, and `§5.2`: *"The three coverage columns are always shown
 * together; publishing the recon view alone would present one side of a
 * three-sided reconciliation as if it were the whole."* Returning one record is
 * how a caller is kept from computing the headline alone.
 */
export function coverage(run: AgentRun): CoverageReport {
  return Object.freeze({
    coverage_by_value: coverageByValue(run),
    coverage_by_count: coverageByCount(run),
    coverage_by_value_bank: coverageByValueBank(run),
    coverage_by_value_ledger: coverageByValueLedger(run),
    coverage_by_value_all_observations: coverageByValueAllObservations(run),
    batch_value_paise: batchValuePaise(run),
  });
}
