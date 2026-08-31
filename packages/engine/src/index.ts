/**
 * `@assay/engine` — ASSAY's deterministic core, stages `S1`-`S5`.
 *
 * `ARCHITECTURE.md §3`: *"Stages S1-S5. Pure functions, no I/O, no network."*
 * Stage `S0` is **not** here — `packages/domain` owns its orchestration from
 * spec 1.4.18 (`§22.2` M32) and `apps/cli` performs the filesystem read, so
 * this package receives an already-parsed `Observation[]` and nothing else.
 *
 * Three imports are forbidden and ESLint enforces all three in CI
 * (`DECISION_BRIEF.md §L.1` rule 3, `PREREGISTRATION.md §6.2` AL1):
 * `packages/generator` (it holds `GroundTruth`), `packages/oracle` (its
 * independence is what makes the consistency gate meaningful), and
 * `@assay/domain/untrusted-text` (the structural prompt-injection defence).
 */

export {
  ANCHOR_IDS,
  anchor,
  normalizeUtr,
  type AnchorExceptionClass,
  type AnchorId,
  type AnchorLink,
  type AnchorRejection,
  type AnchorResult,
} from "./s1-anchor.js";

export {
  MEMBER_ELIGIBLE_KINDS,
  SEARCH_BOUND,
  SECONDS_PER_DAY,
  SETTLEMENT_WINDOW,
  TARGET_CURRENCY,
  TARGET_KINDS,
  EPSILON_BPS,
  EVIDENCE_SCORE_MAX_BPS,
  P_MAX,
  SE_WEIGHTS_BPS,
  TAU,
} from "./frozen.js";

export {
  evaluate,
  generateCandidates,
  isMember,
  parentOrderIdResolver,
  type Admissibility,
  type Candidate,
  type CandidateSet,
  type ClauseResult,
  type ClauseVerdict,
  type EvaluationContext,
  type GenerationStatus,
  type Member,
  type Target,
} from "./s2-candidates.js";

export {
  decompose,
  observationValue,
  type DecomposeInput,
  type Decomposition,
  type DecomposedComponent,
  type NodeKind,
} from "./s3-decompose.js";

export {
  canonicalAllocationKey,
  certificateReason,
  modalLagDays,
  solve,
  tauFor,
  type ReconReport,
  type ScoredSolution,
  type SignalContributions,
  type SolveInput,
  type SolveOutcome,
  type SolveResult,
} from "./s4-solve.js";

export {
  ALLOCATION_SCOPED_INVARIANTS,
  checkIdempotency,
  validate,
  type InvariantOutcome,
  type ValidationInput,
  type ValidationResult,
} from "./s5-validate.js";
