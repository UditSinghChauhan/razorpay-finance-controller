/**
 * Close-loop outcome — `EVALUATION_SPEC.md §4.9`. Metrics 11, 12, 13 and 14.
 *
 * **`packages/eval` consumes a close outcome. It does not compute one, and it
 * must not.** `RECONCILIATION_SPEC.md §10.1` fixes gates `G1`-`G5`, `§10.4`
 * fixes the procedure, and `ARCHITECTURE.md §8` places both in
 * `packages/ledger` **Layer B** — *"the double-entry projection and the posting
 * rules (`journal.ts`, `projection.ts`, `close-gate.ts`, `close.ts`)"*.
 * `DECISION_BRIEF.md §L.2` schedules *"Ledger Layer B + close gate G1–G5"*
 * there. Re-deriving the gates here would make the gate and its own check one
 * implementation — the defect `ARCHITECTURE.md §7.2` exists to prevent for the
 * constraints, and the reason the consistency gate is a *differential* test
 * rather than a self-check.
 *
 * What this module does instead is **read the producer's outcome and recompute
 * the one thing `DATA_MODEL.md §20` says a third party must be able to
 * recompute**: the close threshold, and therefore `period_status`. *"`batch_value_paise`
 * is recorded so that `period_status` is **independently recomputable from the
 * close report alone** ... A reviewer holding only this artifact can verify the
 * gate outcome without the database, the engine or the observation file."* That
 * recomputation is a check on the producer, not a substitute for it, and
 * {@link closeLoop} reports both figures rather than replacing one with the
 * other.
 *
 * **`close-gate.ts` and `close.ts` do not exist yet.** `packages/ledger`'s own
 * header records it: *"`close-gate.ts` and `close.ts` follow, and are
 * deliberately absent rather than stubbed."* `run.ts`'s `CloseOutcome` is the
 * typed boundary that absence leaves; nothing here fabricates the missing side.
 */

import { LEGACY_MAX_UNRESOLVED_ABS_PAISE, MAX_UNRESOLVED_RATIO_BPS } from "../frozen.js";
import type { AgentRun, CloseOutcome, PeriodStatus } from "../run.js";

/** The five gates, named as `DATA_MODEL.md §20`'s `CloseGateResult` names them. */
export const CLOSE_GATES = Object.freeze([
  "g1_all_terminal",
  "g2_trial_balance",
  "g3_suspense_identity",
  "g4_hash_chain",
  "g5_no_failed_invariant_posted",
] as const);

export type CloseGateId = (typeof CLOSE_GATES)[number];

/**
 * `close_threshold_paise = round_half_up(batch_value_paise * 5 / 1000)`.
 *
 * `RECONCILIATION_SPEC.md §10.3` and `PREREGISTRATION.md §7`. Written from
 * `MAX_UNRESOLVED_RATIO_BPS` rather than from the literal `5 / 1000` so that
 * the frozen constant is the only source of the rate, and half-up rounding
 * because `DATA_MODEL.md §0` rule 1 admits no other and `§10.3` names it.
 *
 * `max_unresolved_abs` is **deleted** (`§7`) and takes no part here.
 */
export function closeThresholdPaise(batchValuePaise: number): number {
  const numerator = batchValuePaise * MAX_UNRESOLVED_RATIO_BPS;
  return Math.floor(numerator / 10_000 + 0.5);
}

/**
 * The benchmark v1.0.0 close threshold, retained for the `EXPLORATORY` column.
 *
 * `§10.3`: *"Benchmark v1.0.0 specified `min(0.005 × batch, ₹50,000)`"*, and
 * `EVALUATION_SPEC.md §5.4` item 8 requires `period_status_legacy_policy` *"in
 * an adjacent column so the benchmark v1.0.0 and v1.0.1 close policies are shown
 * side by side"*. **This is history, not policy**: `§10.3` records that the
 * absolute arm *"never bound on any conforming run"* and that its removal is
 * what makes strictness scale-invariant.
 */
export function legacyCloseThresholdPaise(batchValuePaise: number): number {
  return Math.min(closeThresholdPaise(batchValuePaise), LEGACY_MAX_UNRESOLVED_ABS_PAISE);
}

/**
 * `RECONCILIATION_SPEC.md §10.2`'s three outcomes, from a gate result and the
 * policy.
 *
 * ```
 *   all gates pass AND unresolved <= threshold  → CLOSED
 *   all gates pass AND unresolved >  threshold  → OPEN
 *   any gate fails                              → BLOCKED
 * ```
 *
 * *"**`OPEN` is a business state; `BLOCKED` is a defect.** Conflating them would
 * be a design error in either direction: treating `OPEN` as failure punishes the
 * system for being honest about genuine ambiguity, and treating `BLOCKED` as
 * `OPEN` would publish a report over books that do not balance."*
 */
export function periodStatusFrom(
  allGatesPassed: boolean,
  unresolvedValuePaise: number,
  thresholdPaise: number,
): PeriodStatus {
  if (!allGatesPassed) return "BLOCKED";
  return unresolvedValuePaise <= thresholdPaise ? "CLOSED" : "OPEN";
}

/** Metrics 11-14 for one run, plus the independent recomputation `§20` requires. */
export interface CloseLoopReport {
  /** Metric 11's contribution from this run. */
  readonly period_status: PeriodStatus;
  /** `EXPLORATORY` (`§4.9`). Never a gate. */
  readonly period_status_legacy_policy: PeriodStatus;
  /** Metric 12, in paise, over open Suspense items (benchmark v1.0.3). */
  readonly unresolved_value_paise: number;
  readonly value_abstained_paise: number;
  readonly value_exceptions_paise: number;
  /** `EXPLORATORY` (`§4.9`). The benchmark v1.0.2 universe. */
  readonly unresolved_value_paise_multiview: number;
  /**
   * Metric 13 — `suspense_identity_exact`, gate `G3` in gross per-item form.
   *
   * `§4.9`: it *"must be `true` on every run"*. This field is the producer's own
   * `g3_suspense_identity`, **and** {@link CloseLoopReport.g3_recomputed} is this
   * module's arithmetic over the two figures the outcome carries. `§10.1`: the
   * two sides *"are drawn from two independently maintained stores over one
   * universe"*, so restating the comparison from the reported totals is a
   * cross-check on the report, not a second implementation of the gate.
   */
  readonly suspense_identity_exact: boolean;
  readonly g3_recomputed: boolean;
  /** Metric 14's contribution: the gates this run failed, named. */
  readonly failed_gates: readonly string[];
  /** `§4.9`: `BLOCKED` *"must be **0 across every run**"*. */
  readonly blocked: boolean;
  readonly batch_value_paise: number;
  readonly close_threshold_paise: number;
  /**
   * `true` where the producer's `period_status` matches the status recomputed
   * from `batch_value_paise` and `unresolved_value_paise` alone.
   *
   * `DATA_MODEL.md §20` requires that recomputation to be possible; checking it
   * is how the requirement stops being decorative. A mismatch is a defect in the
   * producer and is reported rather than silently preferred either way.
   */
  readonly status_recomputes: boolean;
}

/**
 * Read one run's close outcome.
 *
 * @throws Error when `run.close` is `null`. `EVALUATION_SPEC.md §2` requires
 *   *"Every run attempts a period close"*, and recording an absent producer as
 *   `BLOCKED` would manufacture the defect `§4.9` requires to be zero.
 */
export function closeLoop(run: AgentRun): CloseLoopReport {
  const close = run.close;
  if (close === null) {
    throw new Error(
      `eval: agent ${run.agent_id} produced no close outcome. EVALUATION_SPEC.md §2 ` +
        `requires every scored run to attempt a period close; an absent producer is a ` +
        `missing input, not a BLOCKED period.`,
    );
  }

  const threshold = closeThresholdPaise(close.batch_value_paise);
  const allPassed = failedGates(close).length === 0;
  return Object.freeze({
    period_status: close.period_status,
    period_status_legacy_policy: close.period_status_legacy_policy,
    unresolved_value_paise: close.unresolved_value_paise,
    value_abstained_paise: close.value_abstained_paise,
    value_exceptions_paise: close.value_exceptions_paise,
    unresolved_value_paise_multiview: close.unresolved_value_paise_multiview,
    suspense_identity_exact: close.gate.g3_suspense_identity,
    g3_recomputed: close.suspense_gross_item_paise === close.unresolved_value_paise,
    failed_gates: failedGates(close),
    blocked: close.period_status === "BLOCKED",
    batch_value_paise: close.batch_value_paise,
    close_threshold_paise: threshold,
    status_recomputes:
      close.period_status ===
      periodStatusFrom(allPassed, close.unresolved_value_paise, threshold),
  });
}

/** The gates a close outcome reports as failed, in `§10.1`'s order. */
export function failedGates(close: CloseOutcome): readonly string[] {
  return Object.freeze(CLOSE_GATES.filter((id) => !close.gate[id]));
}

/** Metric 11 — `period_status_distribution` over a set of seeded runs. */
export interface PeriodStatusDistribution {
  readonly CLOSED: number;
  readonly OPEN: number;
  readonly BLOCKED: number;
  readonly runs: number;
}

/**
 * Metric 11 across seeds.
 *
 * `§4.9`: *"`BLOCKED` must be **0 across every run** — it indicates a defect in
 * ASSAY, not a property of the data. `OPEN` occurring on adversarial or
 * high-ambiguity seeds is the *expected and desired* behaviour, and at least one
 * legitimate `OPEN` is required by success criterion S12: **a close gate that
 * has never refused to close is an untested close gate.**"*
 */
export function periodStatusDistribution(
  statuses: readonly PeriodStatus[],
): PeriodStatusDistribution {
  return Object.freeze({
    CLOSED: statuses.filter((s) => s === "CLOSED").length,
    OPEN: statuses.filter((s) => s === "OPEN").length,
    BLOCKED: statuses.filter((s) => s === "BLOCKED").length,
    runs: statuses.length,
  });
}

/** Metric 14 — `close_gate_failures`, per gate, across runs. */
export function closeGateFailures(
  closes: readonly CloseOutcome[],
): Readonly<Record<CloseGateId, number>> {
  const counts = {} as Record<CloseGateId, number>;
  for (const gate of CLOSE_GATES) counts[gate] = 0;
  for (const close of closes) {
    for (const gate of CLOSE_GATES) if (!close.gate[gate]) counts[gate] += 1;
  }
  return Object.freeze(counts);
}
