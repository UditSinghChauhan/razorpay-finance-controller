/**
 * The close attempt — `RECONCILIATION_SPEC.md §10.2`, `§10.3` and `§10.4`.
 *
 * *"The loop ends in a close attempt, which is a deterministic procedure with
 * three possible outcomes. **A finance period that cannot be closed honestly
 * must not be closed.**"*
 *
 * ```
 *   all gates pass  AND  unresolved_value_paise <= close_threshold_paise -> CLOSED
 *   all gates pass  AND  unresolved_value_paise >  close_threshold_paise -> OPEN
 *   any gate fails                                                       -> BLOCKED
 * ```
 *
 * **`BLOCKED` emits nothing.** `§10.2` gives it *"NO close report"*, and
 * `DECISION_BRIEF.md §L.1` rule 7 states the same invariant from the other end:
 * *"The period ends `CLOSED`, `OPEN` or `BLOCKED`. A close report is emitted for
 * the first two and **never** for `BLOCKED`."* `DATA_MODEL.md §20` says why the
 * absence carries meaning: *"Its existence is a positive assertion that all five
 * gates passed"*. {@link CloseAttempt.report} is therefore `null` on `BLOCKED`
 * and non-`null` otherwise, and the same is true of
 * {@link CloseAttempt.close_event} — `§10.4` reaches step 7, which emits the
 * report and appends the `CLOSE` event, only after steps 1-5 have asserted every
 * gate.
 *
 * **`OPEN` is a business state; `BLOCKED` is a defect.** `§10.2`: *"Conflating
 * them would be a design error in either direction: treating `OPEN` as failure
 * punishes the system for being honest about genuine ambiguity, and treating
 * `BLOCKED` as `OPEN` would publish a report over books that do not balance."*
 * A period ending `OPEN` is *"the normal, expected outcome when the input
 * contains real ambiguity"*, and its report carries the unresolved value, its
 * split across abstentions and exceptions, and the item-level detail an analyst
 * works from.
 *
 * **This module persists nothing.** `§10.4` step 7 appends a `CLOSE` event;
 * appending is a mutation, and `DECISION_BRIEF.md §L.1` rule 4 gives this
 * package *"exactly one write path"* which is not here. So the `CLOSE` event is
 * **constructed and returned** as a {@link LedgerEventDraft}, sealed by
 * `sealDraft` and therefore valid, for the caller to append through that single
 * boundary. Everything below is a pure function of its arguments: no clock, no
 * randomness, no I/O. `evt_id` and `ts` are caller-supplied for exactly that
 * reason — `DATA_MODEL.md §16` excludes both from the hashed `body` because they
 * *"vary between two executions over identical inputs, which metric 23
 * (`determinism_check`) requires to produce identical root hashes"*.
 *
 * **The threshold is fixed and may not respond to a result.** `§10.3` and
 * `PREREGISTRATION.md §7` freeze `max_unresolved_ratio_bps = 50`, and
 * `DECISION_BRIEF.md §F` F9 is explicit that whether both `CLOSED` and `OPEN`
 * occur across the DEV seeds is a **falsification check with a pre-declared
 * response**: *"The threshold may NOT be adjusted in response to what the check
 * shows ... Any further change to `max_unresolved_ratio_bps` requires a formally
 * opened governance/amendment cycle, a new benchmark version, and a written
 * statement of what was observed before the change was proposed."* There is
 * accordingly **no adaptive, data-dependent or configurable threshold anywhere
 * in this module**: {@link closeThresholdPaise} is a function of
 * `batch_value_paise` and the frozen constant alone, and no code path can widen
 * it. `§C` row T0-6 makes the same point about the outcomes themselves — whether
 * both occur is *"reported as a finding, and **never** grounds for adjusting the
 * close policy"*.
 */

import {
  canonicalJson,
  type CanonicalValue,
  type Sha256,
  type UnixSeconds,
} from "@assay/domain";
import { roundHalfUp, type Paise } from "@assay/money";

import {
  closeGate,
  type CloseGateInput,
  type CloseGateResult,
  type SuspenseItem,
} from "./close-gate.js";
import {
  sealDraft,
  type EventActor,
  type EventId,
  type LedgerEventDraft,
  type RunId,
} from "./events.js";
import { hashCanonical } from "./hash-chain.js";
import {
  ProjectionInputError,
  type AccountBalances,
  type DecisionState,
} from "./projection.js";

// ---------------------------------------------------------------------------
// The pre-registered close policy
// ---------------------------------------------------------------------------

/**
 * `max_unresolved_ratio_bps = 50` — 0.005, 0.5% of batch value.
 *
 * Frozen by `PREREGISTRATION.md §7` and listed in `DECISION_BRIEF.md §L.1`
 * rule 12 among the constants *"frozen at seal time and immutable thereafter"*.
 * `§10.3` states the rule in one sentence: *"the threshold is a fixed proportion
 * of period value at every batch size."*
 *
 * `max_unresolved_abs` — the benchmark v1.0.0 absolute arm — is **deleted** from
 * the policy (`§7`: *"`max_unresolved_abs` no longer exists"*). It survives only
 * as {@link LEGACY_MAX_UNRESOLVED_ABS_PAISE}, for the `EXPLORATORY` column.
 */
export const MAX_UNRESOLVED_RATIO_BPS = 50;

/**
 * 5,000,000 paise (₹50,000) — the superseded benchmark v1.0.0 absolute arm.
 *
 * **History, not policy.** `EVALUATION_SPEC.md §4.9` requires
 * `period_status_legacy_policy` — *"the same run's outcome under the benchmark
 * v1.0.0 policy `min(0.005 × batch, ₹50,000)`. Reported for every seeded run.
 * Never a gate."* `§10.3` records that the absolute arm *"never bound on any
 * conforming run"* and that removing it is what makes strictness
 * scale-invariant. `PREREGISTRATION.md §7` deletes it from the policy, not from
 * the history the report is required to print.
 */
export const LEGACY_MAX_UNRESOLVED_ABS_PAISE = 5_000_000;

/**
 * `close_threshold_paise = round_half_up(batch_value_paise * 5 / 1000)`.
 *
 * `RECONCILIATION_SPEC.md §10.3` and `PREREGISTRATION.md §7`, character for
 * character. Written as `* 50 / 10_000` so that
 * {@link MAX_UNRESOLVED_RATIO_BPS} is the single source of the rate;
 * `50/10_000` and `5/1_000` are the same rational, so the rounded result is
 * identical for every input.
 *
 * Half-up because `§10.3` names it and `DATA_MODEL.md §0` rule 1 admits no other
 * rounding. Integer throughout — `@assay/money`'s `roundHalfUp` takes an integer
 * numerator and denominator, so no floating-point value exists at any point,
 * which `DECISION_BRIEF.md §L.1` rule 1 requires *"including intermediates"*.
 *
 * The function is total in the frozen constant and its argument and in nothing
 * else. It reads no configuration and no run result: see the module header on
 * `§F` F9.
 *
 * @throws RangeError if `batchValuePaise` is negative or if the product leaves
 *   the safe-integer range, in which case no exact threshold exists.
 */
export function closeThresholdPaise(batchValuePaise: Paise): Paise {
  return roundHalfUp(batchValuePaise * MAX_UNRESOLVED_RATIO_BPS, 10_000);
}

/**
 * The benchmark v1.0.0 threshold, `min(0.005 * batch, ₹50,000)`.
 *
 * `EXPLORATORY` (`PREREGISTRATION.md §8`). It gates nothing: it exists so
 * `period_status_legacy_policy` can be printed *"in an adjacent column so the
 * benchmark v1.0.0 and v1.0.1 close policies are shown side by side"*
 * (`EVALUATION_SPEC.md §5.4`).
 */
export function legacyCloseThresholdPaise(batchValuePaise: Paise): Paise {
  const ratio = closeThresholdPaise(batchValuePaise);
  return (
    ratio < LEGACY_MAX_UNRESOLVED_ABS_PAISE ? ratio : LEGACY_MAX_UNRESOLVED_ABS_PAISE
  ) as Paise;
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/** `RECONCILIATION_SPEC.md §10.2`, `DATA_MODEL.md §20`. */
export type PeriodStatus = "CLOSED" | "OPEN" | "BLOCKED";

/**
 * The three outcomes, from the gates and the policy — and from nothing else.
 *
 * The gate test comes **first and unconditionally**, which is `§10.2`'s
 * structure and `§L.1` rule 7's guarantee: no threshold, no operator and no
 * argument to this function can turn a failing gate into a close. The
 * comparison is `<=`, per `§10.3`'s *"period may auto-close iff
 * `unresolved_value_paise <= close_threshold_paise`"*.
 */
export function periodStatusFrom(
  allGatesPassed: boolean,
  unresolvedValuePaise: Paise,
  thresholdPaise: Paise,
): PeriodStatus {
  if (!allGatesPassed) return "BLOCKED";
  return unresolvedValuePaise <= thresholdPaise ? "CLOSED" : "OPEN";
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** `DATA_MODEL.md §20`'s `CloseReport.period`. */
export interface ClosePeriod {
  readonly from: UnixSeconds;
  readonly to: UnixSeconds;
}

/**
 * `DATA_MODEL.md §20`'s `closed_by`.
 *
 * `§10.3`: *"An operator may always close manually, which records a `human`
 * actor on the `CLOSE` event — the override is permitted, but never silent."*
 */
export interface ClosedBy {
  readonly actor: "system" | "human";
  readonly id: string | null;
}

/**
 * The three fields of the `CLOSE` event that this module cannot derive.
 *
 * `evt_id` and `ts` are caller-supplied because deriving them would need a clock
 * or a counter, and this module is pure; `DATA_MODEL.md §16` excludes both from
 * the hashed `body` precisely because they vary per execution. `actor` carries
 * `engine_commit`, which is a property of the binary and not of the close.
 */
export interface CloseEventIdentity {
  readonly evt_id: EventId;
  readonly ts: UnixSeconds;
  readonly actor: EventActor;
}

/** Everything the close attempt reads. */
export interface CloseAttemptInput {
  readonly run_id: RunId;
  readonly period: ClosePeriod;
  /** The books, the queue, the observation set — see {@link CloseGateInput}. */
  readonly gate: CloseGateInput;
  /** `Σ recon_line.amount` (`EVALUATION_SPEC.md §4.1`) — the close denominator. */
  readonly batch_value_paise: Paise;
  /**
   * The superseded benchmark v1.0.2 universe: `value(observation)` over **every**
   * reconcilable observation in `ABSTAINED` or `EXCEPTION`.
   *
   * Supplied rather than computed, because it is a **queue-side** quantity over
   * a universe this package does not hold — `DATA_MODEL.md §14.1` puts
   * `value(observation)` on the `Decision` / `Exception` record, and the
   * multi-view universe spans observations that open no Suspense item and
   * therefore appear nowhere in the event log.
   *
   * `EXPLORATORY`, and it is checked against nothing: `§10.1` and
   * `DATA_MODEL.md §20` require it to be *"retained, not replaced"* and
   * *"reported every run"*, and are equally explicit that it is *"never a gate
   * and never a close-policy input"*. It appears in the report and in no
   * comparison.
   */
  readonly unresolved_value_paise_multiview: Paise;
  readonly closed_by: ClosedBy;
  readonly close_event: CloseEventIdentity;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * The close-gate half of `DATA_MODEL.md §20`'s `CloseReport`.
 *
 * Every field `§20` places downstream of the gate is here; the fields it places
 * downstream of the *run* — `llm_calls`, `wall_clock_ms`,
 * `throughput_records_per_sec`, `abstention_telemetry`, `exceptions_by_class`,
 * the four coverage ratios, `value_reconciled_paise` — are not, because this
 * package holds none of them and a close gate that accepted them as arguments
 * would be a report builder wearing a gate's name. The run harness composes the
 * full `§20` record around this one.
 *
 * The field names are `§20`'s, so this projects onto a scorer's close outcome
 * without a rename.
 */
export interface CloseReport {
  readonly run_id: RunId;
  readonly period: ClosePeriod;

  // --- the close gate ---
  /** `CLOSED` or `OPEN`. Never `BLOCKED`: a report over a failed gate does not exist. */
  readonly period_status: Exclude<PeriodStatus, "BLOCKED">;
  /** `EXPLORATORY` — the same run under the benchmark v1.0.0 policy. Never a gate. */
  readonly period_status_legacy_policy: PeriodStatus;
  readonly gate: CloseGateResult;
  readonly close_policy: { readonly max_unresolved_ratio_bps: number };
  readonly closed_by: ClosedBy;

  // --- the policy, recomputable from this artifact alone ---
  readonly batch_value_paise: Paise;
  /**
   * `round_half_up(batch_value_paise * 5 / 1000)`.
   *
   * `DATA_MODEL.md §20`: `batch_value_paise` is recorded *"so that
   * `period_status` is **independently recomputable from the close report
   * alone** ... A reviewer holding only this artifact can verify the gate
   * outcome without the database, the engine or the observation file."* The
   * threshold is carried beside it so the recomputation needs no constant table
   * either.
   */
  readonly close_threshold_paise: Paise;

  // --- what was not resolved ---
  /** `G3`'s right side, from the `Decision` / `Exception` records. */
  readonly unresolved_value_paise: Paise;
  readonly value_abstained_paise: Paise;
  readonly value_exceptions_paise: Paise;
  /** `EXPLORATORY` — the benchmark v1.0.2 multi-view universe, retained per `§20`. */
  readonly unresolved_value_paise_multiview: Paise;
  /** `G3`'s left side, the gross sum of `|item_net_paise|`, from the journal lines. */
  readonly suspense_gross_item_paise: Paise;
  /**
   * The **net** projected Suspense balance — `§20`'s `value_suspense_paise`.
   *
   * *"NOT the G3 quantity"*: `§20` is explicit that the two are equal *"only
   * when every open Suspense item lies on the same side, which a run containing
   * both `E03` and `E04` does not satisfy"*. Both are reported so a reader can
   * see the difference rather than infer it.
   */
  readonly value_suspense_paise: Paise;
  /** The open items behind `suspense_gross_item_paise`, keyed and valued. */
  readonly suspense_items: readonly SuspenseItem[];

  // --- the books ---
  readonly trial_balance_ok: boolean;
  readonly account_balances: AccountBalances;

  // --- what was decided ---
  readonly observations_total: number;
  readonly observations_reference: number;
  readonly decisions: Readonly<Record<DecisionState, number>>;

  /**
   * The chain root the gates were run against — the value `G4` recomputed from
   * genesis and matched against the stored root.
   *
   * `§10.4` step 7 appends a `CLOSE` event *"whose hash becomes the run root
   * hash"*, and that hash does not exist until the caller appends the draft
   * returned alongside this report: it commits to the event's `seq` and
   * `prev_hash`, which the chain assigns. This field is therefore the root as of
   * the close **assertion**, which is the value `G4` actually verified; the
   * run's final root is the appended `CLOSE` event's hash, which `appendEvent`
   * returns.
   */
  readonly ledger_root_hash: Sha256;
}

/** What a close attempt produced. */
export interface CloseAttempt {
  readonly period_status: PeriodStatus;
  /** All five gates, always — `§10.2` requires the failing gate to be named. */
  readonly gate: CloseGateResult;
  /** `null` exactly when `period_status === "BLOCKED"` (`§10.2`, `§L.1` rule 7). */
  readonly report: CloseReport | null;
  /**
   * The `CLOSE` event of `§10.4` step 7, sealed and ready to append. `null`
   * exactly when `period_status === "BLOCKED"`: step 7 is never reached.
   */
  readonly close_event: LedgerEventDraft | null;
  readonly close_threshold_paise: Paise;
  /** `EXPLORATORY`. The benchmark v1.0.0 threshold, for the adjacent column. */
  readonly legacy_close_threshold_paise: Paise;
}

// ---------------------------------------------------------------------------
// The attempt
// ---------------------------------------------------------------------------

/**
 * Run `RECONCILIATION_SPEC.md §10.4` end to end.
 *
 * ```
 *   1. Assert G1.                       2. Re-project balances from the log.
 *   3. Assert G2 and G3.                4. Recompute the chain; assert G4.
 *   5. Assert G5.                       6. Evaluate close policy.
 *   7. Emit CloseReport; append a CLOSE event.
 * ```
 *
 * Steps 1-5 are {@link closeGate}. Step 6 is {@link periodStatusFrom} over the
 * frozen policy. Step 7 builds the report and the `CLOSE` draft — and is reached
 * only when every gate passed, which is the whole of `§L.1` rule 7.
 *
 * **A manual close does not change `period_status`.** `§10.3` permits an
 * operator to close manually and requires the override to be recorded rather
 * than silent — which it is, on {@link CloseReport.closed_by}, in the `CLOSE`
 * event's `actor`, and inside that event's `inputs_hash`. It does **not** move
 * the reported outcome, because `§10.3` states in terms that *"a manual close is
 * not an autonomous gate outcome and does not by itself satisfy success
 * criterion S12"*, and `period_status` is the input to metric 11
 * (`EVALUATION_SPEC.md §4.9`). Reporting a hand-closed period as `CLOSED` would
 * put a human's decision into a distribution that measures the gate's.
 *
 * Deterministic in its arguments: identical inputs give an identical attempt,
 * including the `CLOSE` draft's `inputs_hash`.
 *
 * @throws ProjectionInputError if an argument is malformed — see
 *   {@link closeGate}, plus this function's own checks on the period, the batch
 *   value, the multi-view figure and the actor / `closed_by` agreement.
 */
export function attemptClose(input: CloseAttemptInput): CloseAttempt {
  const period = readPeriod(input.period);
  const batchValue = readNonNegativePaise(input.batch_value_paise, "batch_value_paise");
  const multiview = readNonNegativePaise(
    input.unresolved_value_paise_multiview,
    "unresolved_value_paise_multiview",
  );
  const closedBy = readClosedBy(input.closed_by, input.close_event.actor);

  const threshold = closeThresholdPaise(batchValue);
  const legacyThreshold = legacyCloseThresholdPaise(batchValue);

  // Steps 1-5.
  const gate = closeGate(input.gate);

  // Step 6.
  const status = periodStatusFrom(
    gate.all_passed,
    gate.unresolved_value_paise,
    threshold,
  );

  if (status === "BLOCKED") {
    // Step 7 is not reached. `§10.2`: "NO close report. Run marked `invalid`.
    // The failing gate is named." The naming is `gate.failed_gates`; marking the
    // run is the caller's, because it is a mutation and this module performs
    // none.
    return Object.freeze({
      period_status: status,
      gate,
      report: null,
      close_event: null,
      close_threshold_paise: threshold,
      legacy_close_threshold_paise: legacyThreshold,
    });
  }

  // Every gate passed, so `G2` passed, so the projection exists. The check is
  // kept rather than asserted away: it is the one place where "the report's
  // existence is a positive assertion that all five gates passed" is enforced
  // against the code rather than against a comment.
  const projection = gate.projection;
  if (projection === null) {
    throw new ProjectionInputError(
      `close reached step 7 with no projection while every gate passed; ` +
        `g2_trial_balance cannot be true without one (RECONCILIATION_SPEC.md §10.4)`,
    );
  }

  const report: CloseReport = Object.freeze({
    run_id: input.run_id,
    period,
    period_status: status,
    period_status_legacy_policy: periodStatusFrom(
      gate.all_passed,
      gate.unresolved_value_paise,
      legacyThreshold,
    ),
    gate,
    close_policy: Object.freeze({ max_unresolved_ratio_bps: MAX_UNRESOLVED_RATIO_BPS }),
    closed_by: closedBy,
    batch_value_paise: batchValue,
    close_threshold_paise: threshold,
    unresolved_value_paise: gate.unresolved_value_paise,
    value_abstained_paise: gate.value_abstained_paise,
    value_exceptions_paise: gate.value_exceptions_paise,
    unresolved_value_paise_multiview: multiview,
    suspense_gross_item_paise: gate.suspense_gross_item_paise,
    value_suspense_paise: projection.valueSuspensePaise,
    suspense_items: gate.suspense_items,
    trial_balance_ok: projection.trialBalanceOk,
    account_balances: projection.balances,
    observations_total: gate.observations_total,
    observations_reference: gate.observations_reference,
    decisions: gate.decisions,
    ledger_root_hash: gate.recomputed_root_hash,
  });

  return Object.freeze({
    period_status: status,
    gate,
    report,
    close_event: buildCloseEvent(input, report),
    close_threshold_paise: threshold,
    legacy_close_threshold_paise: legacyThreshold,
  });
}

// ---------------------------------------------------------------------------
// Step 7's CLOSE event
// ---------------------------------------------------------------------------

/**
 * The `CLOSE` event of `§10.4` step 7, as a validated draft.
 *
 * `journal_lines` is empty: a period close moves no money, and `DATA_MODEL.md
 * §17.1` / `§17.1.1` fire no rule among `P1`-`P8` at close. `§16` admits that
 * directly — *"may be empty for non-posting events"*. `decision_id` and
 * `certificate` are `null` for the same reason: a close is not a decision about
 * an observation. `subject_ids` and `evidence_ids` are empty because a close has
 * no observation subject; the run it closes is `run_id`, which `§16` carries as
 * its own field and deliberately outside the hashed `body`.
 *
 * The draft is returned rather than appended. `DECISION_BRIEF.md §L.1` rule 4
 * gives this package exactly one mutating write path and it is not this module;
 * `sealDraft` is applied so what comes back is known-valid and deep-frozen, and
 * a caller that appends it cannot be handed a malformed record.
 */
function buildCloseEvent(
  input: CloseAttemptInput,
  report: CloseReport,
): LedgerEventDraft {
  return sealDraft({
    evt_id: input.close_event.evt_id,
    run_id: input.run_id,
    ts: input.close_event.ts,
    actor: input.close_event.actor,
    kind: "CLOSE",
    subject_ids: [],
    evidence_ids: [],
    decision_id: null,
    inputs_hash: closeInputsHash(input, report),
    journal_lines: [],
    certificate: null,
  });
}

/**
 * `inputs_hash` — `DATA_MODEL.md §16`'s *"hash of everything the step read"*.
 *
 * Computed over a canonical projection of the close's own inputs, through the
 * same `hashCanonical` the chain uses, *"so that a caller computing
 * `inputs_hash` uses the same encoding the chain does"* (`hash-chain.ts`).
 *
 * Three rules shape what goes in.
 *
 * - **Nothing that varies per execution.** `inputs_hash` enters the hashed
 *   `body`, and `§16` excludes `evt_id`, `run_id` and `ts` from `body` because
 *   they *"vary between two executions over identical inputs, which metric 23
 *   (`determinism_check`) requires to produce identical root hashes"*. They are
 *   excluded here for the same reason; including one through this field would
 *   reintroduce by the back door exactly what `§16` removed.
 * - **The event log by its root, not line by line.** The recomputed root commits
 *   to every event in the chain, so hashing them again would add length and no
 *   information.
 * - **Set-valued inputs are sorted.** The observation set, the state
 *   assignments, the queue and the posted decisions are sets, not sequences.
 *   `§16` requires an identifier reaching `body` to be *"derived from a
 *   canonical traversal of the input in a fixed order, never from ... iteration
 *   order over an unordered collection"*; sorting is that canonical traversal,
 *   and it makes the digest independent of the order a caller happened to
 *   assemble its arrays in. Sorting is by code unit, never by locale.
 *
 * `closed_by` **is** included. `§10.3` permits a manual close and requires that
 * *"the override is permitted, but never silent"*; putting it inside the digest
 * is what makes a hand-closed period impossible to relabel afterwards without
 * breaking the chain.
 */
function closeInputsHash(input: CloseAttemptInput, report: CloseReport): Sha256 {
  const gate = input.gate;

  const observations = gate.observations
    .map((record) => ({ kind: record.kind, obs_id: record.obs_id }))
    .sort((a, b) => compare(`${a.obs_id} ${a.kind}`, `${b.obs_id} ${b.kind}`));

  const terminalStates = gate.terminal_states
    .map((record) => ({ obs_id: record.obs_id, state: record.state }))
    .sort((a, b) => compare(`${a.obs_id} ${a.state}`, `${b.obs_id} ${b.state}`));

  const unresolvedItems = gate.unresolved_items
    .map((record) => ({
      origin: record.origin,
      source_entity_id: record.source_entity_id,
      value_paise: record.value_paise as number,
    }))
    .sort((a, b) =>
      compare(
        `${a.source_entity_id} ${a.origin} ${String(a.value_paise)}`,
        `${b.source_entity_id} ${b.origin} ${String(b.value_paise)}`,
      ),
    );

  const postedDecisions = gate.posted_decisions
    .map((record) => ({
      decision_id: record.decision_id,
      invariants_failed: [...record.invariants_failed].sort(compare),
    }))
    .sort((a, b) =>
      compare(
        `${a.decision_id} ${a.invariants_failed.join(",")}`,
        `${b.decision_id} ${b.invariants_failed.join(",")}`,
      ),
    );

  const body: CanonicalValue = {
    batch_value_paise: report.batch_value_paise as number,
    close_policy: { max_unresolved_ratio_bps: MAX_UNRESOLVED_RATIO_BPS },
    close_threshold_paise: report.close_threshold_paise as number,
    closed_by: { actor: report.closed_by.actor, id: report.closed_by.id },
    event_count: gate.events.length,
    genesis_hash: gate.genesis_hash as string,
    ledger_root_hash: report.ledger_root_hash as string,
    observations,
    period: { from: report.period.from as number, to: report.period.to as number },
    posted_decisions: postedDecisions,
    stored_root_hash: gate.stored_root_hash as string,
    terminal_states: terminalStates,
    unresolved_items: unresolvedItems,
    unresolved_value_paise_multiview: report.unresolved_value_paise_multiview as number,
  };

  // `hashCanonical` calls `canonicalJson` itself; the explicit call is the guard
  // that a value the encoder refuses is caught here, where the message can name
  // the close, rather than surfacing as an opaque digest failure.
  canonicalJson(body);
  return hashCanonical(body);
}

// ---------------------------------------------------------------------------
// Argument checks
// ---------------------------------------------------------------------------

function readPeriod(period: ClosePeriod): ClosePeriod {
  const from = readUnixSeconds(period?.from, "period.from");
  const to = readUnixSeconds(period?.to, "period.to");
  if (to < from) {
    throw new ProjectionInputError(
      `period.to (${String(to)}) precedes period.from (${String(from)}); a close ` +
        `report names the period it closes (DATA_MODEL.md §20)`,
    );
  }
  return Object.freeze({ from, to });
}

function readUnixSeconds(value: unknown, field: string): UnixSeconds {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ProjectionInputError(
      `${field} must be a positive integer number of Unix seconds; received ` +
        `${String(value)}`,
    );
  }
  return value as UnixSeconds;
}

function readNonNegativePaise(value: unknown, field: string): Paise {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ProjectionInputError(
      `${field} must be a non-negative integer number of paise ` +
        `(DECISION_BRIEF.md §L.1 rule 1); received ${String(value)}`,
    );
  }
  return value as Paise;
}

/**
 * Read `closed_by`, and hold it to the `CLOSE` event's actor.
 *
 * `§10.3` ties the two together: a manual close *"records a `human` actor on the
 * `CLOSE` event"*. The biconditional is enforced in both directions, because
 * either half alone leaves the override silent — a `human` `closed_by` under a
 * `deterministic` actor hides the operator from the chain, and a `human` actor
 * under a `system` `closed_by` hides it from the report.
 */
function readClosedBy(closedBy: ClosedBy, actor: EventActor): ClosedBy {
  const who = closedBy?.actor;
  if (who !== "system" && who !== "human") {
    throw new ProjectionInputError(
      `closed_by.actor must be "system" or "human" (DATA_MODEL.md §20); received ` +
        `${JSON.stringify(who)}`,
    );
  }
  const id: unknown = closedBy.id;
  if (id !== null && (typeof id !== "string" || id.length === 0)) {
    throw new ProjectionInputError(
      `closed_by.id must be a non-empty string or null (DATA_MODEL.md §20); ` +
        `received ${String(id)}`,
    );
  }
  if ((who === "human") !== (actor?.type === "human")) {
    throw new ProjectionInputError(
      `closed_by.actor is ${JSON.stringify(who)} while the CLOSE event's ` +
        `actor.type is ${JSON.stringify(actor?.type)}; RECONCILIATION_SPEC.md ` +
        `§10.3 makes a manual close one that "records a human actor on the CLOSE ` +
        `event" — the override is permitted, but never silent`,
    );
  }
  return Object.freeze({ actor: who, id });
}

/** Code-unit comparison. Never `localeCompare`, which is locale-dependent. */
function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
