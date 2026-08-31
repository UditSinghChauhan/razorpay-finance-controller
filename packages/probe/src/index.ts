/**
 * `@assay/probe` — the `RECONCILIATION_SPEC.md §6.2` probe loop.
 *
 * A **pure state machine**, ratified at spec 1.4.23 (`DATA_MODEL.md §22.2` M37,
 * `DECISION_BRIEF.md §A.30`). It owns `P_max` accounting, the pre-call `I6`
 * existence check, the **sole constructor** of the closed five-probe call, and
 * the `PROBE` `LedgerEvent` body.
 *
 * It performs **no I/O of any kind** and does not call `R3`. The caller supplies
 * the proposal, performs the dispatch, validates the result through
 * `packages/domain` and re-solves through `packages/engine` `S4`.
 */

export {
  NO_USEFUL_PROBE,
  R3_PROBE_KINDS,
  argumentEntityId,
  isNoUsefulProbe,
  isR3ProposableKind,
  kindOf,
  validate,
  type ObservationUniverse,
  type ProbeCallProposal,
  type ProbeProposal,
  type ProposalCheck,
  type R3ProbeKind,
  type R3Proposal,
  type RejectionReason,
  type ValidatedProbeCall,
} from "./call.js";

export {
  ProbeResultMismatchError,
  acceptResult,
  budgetExhausted,
  decide,
  initialState,
  offerProposal,
  offerR3Proposal,
  type LoopDecision,
  type ProbeLoopState,
  type ProposalOutcome,
} from "./loop.js";

export {
  probeEventBody,
  type ProbeEventBody,
  type ProbeEventInput,
} from "./event.js";
