import { P_MAX, type ReconReport, type SolveResult } from "@assay/engine";
import type { CertificateReasonResult } from "@assay/engine";
import type { ProbeId } from "@assay/ledger";
import type { FetchSettlementReconResult, ProbeResultDetail } from "@assay/domain";

import {
  argumentEntityId,
  isNoUsefulProbe,
  validate,
  type ObservationUniverse,
  type ProbeCallProposal,
  type ProbeProposal,
  type ProposalCheck,
  type ValidatedProbeCall,
} from "./call.js";

/**
 * The `RECONCILIATION_SPEC.md §6.2` probe loop, as a pure state machine.
 *
 * *"Before emitting an abstention, up to `P_max = 3` probes may be attempted. The
 * LLM (`R3`) proposes one probe from a closed enum; **deterministic code executes
 * it and re-runs the solve**."*
 *
 * **This module is the deterministic half, and it performs no I/O.** It does not
 * call `R3`, does not read the probe surface and does not append to the ledger: it
 * consumes an `R3` proposal as a value, emits a validated call its caller
 * dispatches, and accepts the validated result back. `DECISION_BRIEF.md §L.2`
 * places this package **before** `llm` for exactly that reason — a loop that
 * called `R3` would have to build after it, and no scope-compatible slot exists
 * there.
 *
 * The pattern is `§L.1` rule 4's, which keeps `journal.ts` *"a pure posting
 * function over a **proposed** allocation"* and the mutating write path separate.
 */

/** Accumulated loop state for one component. Immutable; every step returns a new one. */
export interface ProbeLoopState {
  readonly comp_id: string;
  /** Probes spent. Feeds `SolveInput.probe_attempts`. */
  readonly attempts: number;
  /** Accumulated `fetch_settlement_recon` results, in acceptance order. */
  readonly reports: readonly ReconReport[];
  /** `DATA_MODEL.md §13`: *"what we tried before giving up"*. */
  readonly probes_attempted: readonly ProbeId[];
}

/** A component with no probe spent yet. */
export function initialState(comp_id: string): ProbeLoopState {
  return Object.freeze({
    comp_id,
    attempts: 0,
    reports: Object.freeze([]),
    probes_attempted: Object.freeze([]),
  });
}

/**
 * What the caller should do next.
 *
 * `STOP` carries `packages/engine`'s **own** `certificate_reason` rather than a
 * reason this module chose. `§6` defines three — `EVIDENCE_TIE` at zero attempts,
 * `PROBE_BUDGET_EXHAUSTED` at `P_max`, and the **undecided**
 * `A2_MIDDLE_CASE_UNSPECIFIED` seam in between — and spec 1.4.23 **surfaces that
 * seam rather than replacing it**. No new terminal reason is invented for a loop
 * that stopped on `NO_USEFUL_PROBE` with budget remaining; that gap is `§6`'s and
 * stays open.
 */
export type LoopDecision =
  /** `solve` reached a determined outcome; no abstention is forced. */
  | { readonly action: "ACCEPT" }
  /** `§6.2`: budget remains and the case is still ambiguous. Ask `R3`. */
  | { readonly action: "PROBE"; readonly attempts_remaining: number }
  /** Emit the abstention with the engine's reason, whatever it says. */
  | { readonly action: "STOP"; readonly certificate_reason: CertificateReasonResult };

/**
 * The loop's transition, given the latest `S4` result.
 *
 * Probing is gated on `AMBIGUOUS` alone. `§4.3`'s `INTRACTABLE` is a search-bound
 * failure whose reason `S4` already fixes as `SEARCH_BOUND_EXCEEDED`, and no probe
 * enlarges a bound — so the loop stops rather than spending budget that cannot
 * help.
 */
export function decide(
  state: ProbeLoopState,
  solve: SolveResult,
  pMax: number = P_MAX,
): LoopDecision {
  if (solve.certificate_reason === null) return { action: "ACCEPT" };
  if (solve.outcome === "AMBIGUOUS" && state.attempts < pMax) {
    return { action: "PROBE", attempts_remaining: pMax - state.attempts };
  }
  return { action: "STOP", certificate_reason: solve.certificate_reason };
}

/**
 * Validate an `R3` proposal, or convert a decline into a stop.
 *
 * A `NO_USEFUL_PROBE` proposal ends the loop with the engine's reason for the
 * attempts actually spent — which, in the middle case, is the undecided seam.
 */
export type ProposalOutcome =
  | { readonly kind: "CALL"; readonly check: ProposalCheck }
  | { readonly kind: "STOP"; readonly certificate_reason: CertificateReasonResult };

export function offerProposal(
  state: ProbeLoopState,
  proposal: ProbeProposal,
  universe: ObservationUniverse,
  solve: SolveResult,
  pMax: number = P_MAX,
): ProposalOutcome {
  if (isNoUsefulProbe(proposal)) {
    /* c8 ignore next */
    if (solve.certificate_reason === null) return { kind: "STOP", certificate_reason: { determined: true, reason: "EVIDENCE_TIE" } };
    return { kind: "STOP", certificate_reason: solve.certificate_reason };
  }
  const call: ProbeCallProposal = proposal;
  return { kind: "CALL", check: validate(call, universe, state.attempts, pMax) };
}

/**
 * Accept a validated probe result and advance the state.
 *
 * **A spent probe increments `attempts` whatever it returned.** `DATA_MODEL.md
 * §12`: *"`null` on a result field means the probe **ran** and the referent
 * yielded nothing, not that the probe was skipped"*, and `§6.2`'s metric is
 * *"abstentions resolved per probe **spent**"* — a probe that returned nothing
 * still cost budget.
 *
 * **Results are accumulated, never de-duplicated.** `RECONCILIATION_SPEC.md §4.2`
 * (spec 1.4.17) makes `SE5`'s `R` the **union** over every result carrying the
 * settlement id, *"irrespective of each probe's `date` argument and of the order
 * the probes ran. Repeating a probe adds nothing; a result that returns nothing
 * removes nothing."* De-duplicating here would move that rule out of the engine,
 * where it is defined and tested.
 */
export function acceptResult(
  state: ProbeLoopState,
  call: ValidatedProbeCall,
  detail: ProbeResultDetail,
  probeId: ProbeId,
): ProbeLoopState {
  bindResultToCall(call, detail);

  const reports =
    detail.probe === "fetch_settlement_recon"
      ? [...state.reports, reconReportOf(detail)]
      : state.reports;

  return Object.freeze({
    comp_id: state.comp_id,
    attempts: state.attempts + 1,
    reports: Object.freeze(reports),
    probes_attempted: Object.freeze([...state.probes_attempted, probeId]),
    // `call` is not stored: §13's certificate carries `probes_attempted` as ids,
    // and the call itself reaches the audit trail through the PROBE event.
  }) satisfies ProbeLoopState;
}

/**
 * A result that does not answer the call it is fed back against.
 *
 * A caller contract violation, not a data condition — `§12`'s `null` fields
 * already cover *"the probe ran and the referent yielded nothing"*, so a
 * mismatched variant or argument can only mean the caller dispatched one call and
 * returned another's answer. Thrown rather than returned for the same reason
 * `packages/ledger` throws `JournalError`: there is no correct way to continue.
 */
export class ProbeResultMismatchError extends Error {
  readonly expected: string;
  readonly received: string;

  constructor(expected: string, received: string) {
    super(
      `probe result does not answer the call it was issued for: expected ` +
        `${expected}, received ${received}. RECONCILIATION_SPEC.md §6.2 spends one ` +
        `of P_max on the call that was made, so the evidence fed back must be that ` +
        `call's own result.`,
    );
    this.name = "ProbeResultMismatchError";
    this.expected = expected;
    this.received = received;
  }
}

/**
 * Bind an accepted result to the call that was issued.
 *
 * Without this the loop would count a probe against `P_max` and accumulate
 * evidence for a call nobody validated — which is the bypass the sole-constructor
 * brand exists to prevent, reappearing one step later. The probe kind must match,
 * and where both carry an entity id, so must the id.
 */
function bindResultToCall(call: ValidatedProbeCall, detail: ProbeResultDetail): void {
  if (detail.probe !== call.probe) {
    throw new ProbeResultMismatchError(call.probe, detail.probe);
  }
  const expected = argumentEntityId(call);
  const received = resultEntityId(detail);
  if (expected !== null && received !== null && expected !== received) {
    throw new ProbeResultMismatchError(expected, received);
  }
}

/** The entity id a result echoes back, or `null` where the variant carries none. */
function resultEntityId(detail: ProbeResultDetail): string | null {
  switch (detail.probe) {
    case "fetch_order":
      return detail.order_id;
    case "fetch_payment":
      return detail.payment_id;
    case "fetch_refund":
      return detail.refund_id;
    case "fetch_settlement_recon":
      return detail.settlement_id;
    case "widen_temporal_window":
      return null;
  }
}

/**
 * `DATA_MODEL.md §12`'s result variant, as `S4` consumes it.
 *
 * `ReconReport` is `packages/engine`'s shape and carries no `date`, matching
 * `§12`'s deliberate omission; nothing is added or dropped in the conversion.
 */
function reconReportOf(detail: FetchSettlementReconResult): ReconReport {
  return {
    settlement_id: detail.settlement_id,
    constituent_entity_ids: detail.constituent_entity_ids,
  };
}

/** Whether the budget is spent. */
export function budgetExhausted(state: ProbeLoopState, pMax: number = P_MAX): boolean {
  return state.attempts >= pMax;
}
