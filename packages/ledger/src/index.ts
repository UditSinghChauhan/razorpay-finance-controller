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
 * Layer B is `journal.ts` and `projection.ts`, and **both are present**.
 * `journal.ts` is the posting rules `P1`-`P8` (`DATA_MODEL.md §17.1`, `§17.1.1`,
 * `§17.2`), selecting which accounts an occasion posts to; `projection.ts`
 * replays the resulting lines into balances. `journal.ts` is a **pure function
 * over a proposed allocation** and deliberately does not take a
 * `ValidatedDecision` — `ARCHITECTURE.md §4` boundary 3 draws the line there so
 * that S5 -> `I1` -> mint -> write stays acyclic.
 *
 * `close-gate.ts` and `close.ts` follow, and are deliberately absent rather
 * than stubbed.
 *
 * `ValidatedDecision` is **declared** here at specification 1.4.9, in
 * `validated-decision.ts`, and the **mutating write path it exists to guard is
 * not**. Through spec 1.4.8 this header tied the two together and said the type
 * arrived with persistence; `ARCHITECTURE.md §4` licenses the split in terms —
 * "This paragraph and `§L.1` rule 4 constrain the mutating write path and
 * nothing else" — and `§L.2` sequences `ledger Layer B -> engine S4-S5`, which
 * needs the type to exist so S5 can name its own return. The type is exported;
 * **no constructor is**, and the brand that makes "only S5 may construct" a
 * property rather than a convention is a non-exported unique symbol.
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
  JournalError,
  EXCEPTION_CLASSES,
  NON_POSTING_GROUNDS,
  OBSERVATION_STATES,
  POSTING_OCCASIONS,
  POSTING_REFS,
  journalFor,
  type AbstentionRole,
  type BankEvidencePostingRequest,
  type BankSideEvidence,
  type ExceptionClass,
  type IngestPostingRequest,
  type JournalDecision,
  type NonPosting,
  type NonPostingGround,
  type ObservationState,
  type Posting,
  type PostingOccasion,
  type PostingRef,
  type PostingRequest,
  type ResolutionPostingRequest,
  type TerminalStatePostingRequest,
} from "./journal.js";

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

export type { ValidatedDecision } from "./validated-decision.js";

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
