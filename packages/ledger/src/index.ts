/**
 * `@assay/ledger` — the shadow ledger. **Layer A, plus Layer B's projection.**
 *
 * `ARCHITECTURE.md §8` splits this package in two because the layers "fail
 * differently and so must be checked differently. Layer A detects *tampering* —
 * someone changed the record of what happened. Layer B detects *incoherence* —
 * the record is intact but the books do not balance."
 *
 * Layer A is the append-only hash-chained audit event (`DATA_MODEL.md §16`),
 * scoped by `DECISION_BRIEF.md §K` to `events.ts` and `hash-chain.ts`. It is
 * **implemented**, at specification 1.4.0 — which added
 * `JournalLine.source_entity_id`, the Suspense item key, to the record this
 * package seals and hashes.
 *
 * Layer B is `journal.ts` and `projection.ts`. **Only `projection.ts` is
 * present.** `journal.ts` — deciding which accounts an event posts to — is the
 * next milestone rather than a blocked one: spec 1.4.0 closed the three
 * questions that held it (`DECISION_BRIEF.md §A.7` G-F narrowed `P8` to
 * adjustment observations, G-G added `§17.1.1`'s trigger table, and C-1 defined
 * `ValidatedDecision`). `close-gate.ts` and `close.ts` follow it. All three are
 * deliberately absent rather than stubbed.
 */

export {
  LedgerEventError,
  ACTOR_TYPES,
  CERTIFICATE_REASONS,
  EVENT_KINDS,
  LLM_PROVIDER_IDS,
  SOURCE_ENTITY_PREFIXES,
  journalTotals,
  sealDraft,
  sealStoredEvent,
  type ActorType,
  type AmbiguityCertificate,
  type CandidateId,
  type CertificateReason,
  type CertificateSolution,
  type ComponentId,
  type DecisionId,
  type EventActor,
  type EventId,
  type EventKind,
  type EvidenceId,
  type JournalLine,
  type LedgerEvent,
  type LedgerEventContent,
  type LedgerEventDraft,
  type LlmCallId,
  type LlmProviderId,
  type ProbeId,
  type RunId,
} from "./events.js";

export {
  ProjectionInputError,
  assertTrialBalance,
  projectByDecisionState,
  projectChain,
  projectLedger,
  type AccountBalances,
  type DecisionState,
  type DecisionStates,
  type LedgerProjection,
} from "./projection.js";

export {
  ChainMismatchError,
  TrialBalanceError,
  appendEvent,
  canonicalEventBody,
  computeEventHash,
  computeGenesisHash,
  createChain,
  hashCanonical,
  verifyChain,
  type ChainCheck,
  type ChainFailure,
  type ChainVerification,
  type GenesisInputs,
  type LedgerChain,
} from "./hash-chain.js";
