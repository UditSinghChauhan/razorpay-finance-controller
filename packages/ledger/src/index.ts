/**
 * `@assay/ledger` — the shadow ledger. **Layer A only.**
 *
 * `ARCHITECTURE.md §8` splits this package in two because the layers "fail
 * differently and so must be checked differently. Layer A detects *tampering* —
 * someone changed the record of what happened. Layer B detects *incoherence* —
 * the record is intact but the books do not balance."
 *
 * This milestone is Layer A: the append-only hash-chained audit event
 * (`DATA_MODEL.md §16`). `DECISION_BRIEF.md §K` scopes it to `events.ts` and
 * `hash-chain.ts`; `journal.ts`, `projection.ts`, `close-gate.ts` and `close.ts`
 * are later milestones and are deliberately absent rather than stubbed.
 */

export {
  LedgerEventError,
  ACTOR_TYPES,
  CERTIFICATE_REASONS,
  EVENT_KINDS,
  LLM_PROVIDER_IDS,
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
