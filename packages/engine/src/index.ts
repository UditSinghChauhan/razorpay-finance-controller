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

/**
 * The `S1` → `S2` seam.
 *
 * `S2`'s `Target` and `EvaluationContext` are constructed here from `S1`'s
 * `AnchorResult` and the observation set it was computed over — the one piece
 * `apps/cli`'s `run` command recorded as missing: *"`packages/engine` exports
 * `anchor()`, `generateCandidates()`, `decompose()`, `solve()` and
 * `validate()`, and NO constructor for `S2`'s `Target` or `EvaluationContext`
 * from `S1`'s `AnchorResult` … deriving them there would put `S1`/`S2`
 * semantics in `apps/cli`, which `ARCHITECTURE.md §3` forbids."* It belongs on
 * this barrel for that reason: the alternative to exporting it is every caller
 * re-deriving `§3`'s anchor semantics outside the package that owns them.
 */
export {
  buildSeam,
  IncoherentAnchorStateError,
  type AnchorResolution,
  type AnchorResolvedTarget,
  type AnchorStateIncoherence,
  type Seam,
  type SeamInput,
} from "./s1-s2-seam.js";

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
  type InvariantSelection,
  type ValidationInput,
  type ValidationResult,
} from "./s5-validate.js";
