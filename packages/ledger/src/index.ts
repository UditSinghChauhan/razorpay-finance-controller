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
 * `close-gate.ts` and `close.ts` are **present**, completing `§C`'s T0-6 —
 * *"Layer A hash chain + Layer B double-entry projection + **close gate
 * G1-G5**"*. `close-gate.ts` runs `RECONCILIATION_SPEC.md §10.1`'s five gates
 * over a re-projection of the event log; `close.ts` evaluates `§10.2`'s three
 * outcomes over them and builds `§10.4` step 7's `CLOSE` event. Neither
 * persists: the `CLOSE` event comes back as a `LedgerEventDraft` for the single
 * write path below to append, because appending is a mutation and `§L.1` rule 4
 * admits exactly one of those in this package.
 *
 * **The close policy's constants and threshold arithmetic are deliberately not
 * re-exported.** `closeThresholdPaise`, `legacyCloseThresholdPaise`,
 * `periodStatusFrom` and the two `§7` constants exist in `close.ts` because
 * `attemptClose` needs them, and `packages/eval` holds its own copies for the
 * `§4.9` metrics. Publishing a second copy on a package boundary would make the
 * duplication a supported surface. Everything a caller needs is already on the
 * result: `CloseAttempt` carries both thresholds and `CloseReport` carries
 * `batch_value_paise` and `close_threshold_paise`, which is what `DATA_MODEL.md
 * §20` means by *"period_status is independently recomputable from the close
 * report alone"*.
 *
 * `ValidatedDecision` is **declared** here at specification 1.4.9, in
 * `validated-decision.ts`, and the **mutating write path it exists to guard is
 * now present** — `postValidatedDecision`, and nothing else. `ARCHITECTURE.md
 * §4` boundary 3: *"`packages/ledger` exposes exactly one mutating function,
 * and it accepts only a `ValidatedDecision` — a type that can only be
 * constructed by S5. There is no other write path."* The count of mutating
 * functions on this surface is one, and `tests/projection.test.ts` asserts both
 * the count and the name. The type is exported; **no constructor is**, and the
 * brand that makes "only S5 may construct" a property rather than a convention
 * is a non-exported unique symbol. Persistence arrives through the injected
 * `LedgerStore` port: this package opens no file and no database, because
 * `ARCHITECTURE.md §3` gives `apps/cli` all filesystem I/O.
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

/**
 * The persistence port. A **type only** — this package holds no adapter.
 *
 * `ARCHITECTURE.md §8` names the physical store *"SQLite, single file, WAL
 * mode, via `better-sqlite3`"*, and `better-sqlite3` is in no manifest in this
 * workspace. `§3` gives `apps/cli` all filesystem I/O, so the adapter is the
 * composition root's and arrives as an argument.
 */
export type { LedgerCommit, LedgerStore } from "./store.js";

/**
 * The single mutating write path — `DECISION_BRIEF.md §L.1` rule 4.
 *
 * One function, accepting only a `ValidatedDecision`. `openWriteState` is not a
 * second one: it builds the value `postValidatedDecision` threads, and mutates
 * nothing.
 */
export {
  DuplicatePostError,
  LedgerWriteError,
  RejectedDecisionError,
  openWriteState,
  postValidatedDecision,
  type EventStamp,
  type LedgerWriteResult,
  type LedgerWriteState,
} from "./write.js";

/** `RECONCILIATION_SPEC.md §10.1`'s five close gates (`§C` T0-6). */
export {
  CLOSE_GATE_FINDING_CODES,
  CLOSE_GATE_IDS,
  closeGate,
  type CloseGateFinding,
  type CloseGateFindingCode,
  type CloseGateId,
  type CloseGateInput,
  type CloseGateResult,
  type CloseObservationRecord,
  type PostedDecisionRecord,
  type SuspenseItem,
  type TerminalStateRecord,
  type UnresolvedItemOrigin,
  type UnresolvedItemRecord,
} from "./close-gate.js";

/** `RECONCILIATION_SPEC.md §10.2`-`§10.4`'s close attempt over those gates. */
export {
  attemptClose,
  type CloseAttempt,
  type CloseAttemptInput,
  type CloseEventIdentity,
  type ClosePeriod,
  type CloseReport,
  type ClosedBy,
  type PeriodStatus,
} from "./close.js";

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
