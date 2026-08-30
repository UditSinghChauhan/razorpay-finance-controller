/**
 * `@assay/oracle` — the Ambiguity Oracle.
 *
 * `ARCHITECTURE.md §3`: "Exhaustive enumeration of evidence-admissible
 * allocations from **observations only**. Deliberately a second, slow, naive
 * implementation. Its whole value is being *not* the engine and *not* the
 * generator."
 *
 * **This package performs no I/O.** It takes an observation set as data and
 * returns labels as data. `PREREGISTRATION.md §6.2` `AL2` requires a runtime
 * guard against reading any `ground_truth*.jsonl` path; there is nothing here for such
 * a guard to intercept, which is a stronger property than passing one. The
 * completeness gate takes ground truth as an argument for the same reason —
 * `apps/cli` performs the read.
 *
 * **What this package deliberately does not contain.** The consistency gate:
 * `DECISION_BRIEF.md §L.1` rule 3 places it in
 * `packages/eval/src/gates/consistency-gate.ts`, "the single file permitted to
 * import both engine and oracle". `checkAll` and its verdict types are exported
 * for it to call.
 */

export {
  SETTLEMENT_WINDOW_DAYS,
  SETTLEMENT_WINDOW_SECONDS,
  SECONDS_PER_DAY,
  K_ORACLE,
  C_ORACLE,
  TAU_FLOOR_PAISE,
  TAU_RATE_BPS,
  BPS_DENOMINATOR,
  SPEC_VERSION,
} from "./frozen.js";

export {
  type Convention,
  CONVENTIONS,
  UNRATIFIED,
  UNRATIFIED_COUNT,
} from "./conventions.js";

export {
  type MemberEligibleKind,
  type TargetKind,
  type MemberRowType,
  type MemberContribution,
  type TargetContribution,
  MEMBER_ELIGIBLE_KINDS,
  TARGET_KINDS,
  DECLARED_TARGET_CURRENCY,
  isMemberEligibleKind,
  isTargetKind,
  memberContribution,
  targetContribution,
} from "./universe.js";

export {
  type Verdict,
  type ConstraintVerdicts,
  type CandidateContext,
  type Candidate,
  emptyContext,
  oracleContext,
  checkC1,
  checkC2,
  checkC3,
  checkC3Ordering,
  checkC3BankArrival,
  checkC4,
  checkC5,
  checkC6,
  checkC7,
  checkC8,
  checkAll,
  isAdmissible,
} from "./predicates.js";

export {
  type BankAnchor,
  normalizeUtr,
  anchorBankLines,
  anchoredEntities,
  anchoredNetBySettlement,
} from "./anchors.js";

export {
  type EnumerationStatus,
  type OracleSolution,
  type OracleTargetResult,
  settledAtClasses,
  unanchoredMembers,
  enumerateAll,
} from "./enumerate.js";

export {
  type OracleComponent,
  type Decomposition,
  observationValue,
  decompose,
} from "./components.js";

export {
  type AccountBalances,
  type AmbiguityLabel,
  type OracleLabel,
  type MaterialityPaise,
  type OracleRun,
  projectAllocation,
  materiality,
  tauFor,
  classify,
  labelAll,
} from "./classify.js";

export {
  type TrueAllocation,
  type CompletenessOutcome,
  type CompletenessFinding,
  type CompletenessFamilyCounts,
  type CompletenessResult,
  UNDECLARED_FAMILY,
  completenessGate,
} from "./completeness-gate.js";
