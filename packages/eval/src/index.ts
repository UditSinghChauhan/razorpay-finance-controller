/**
 * `@assay/eval` — the measurement layer.
 *
 * `ARCHITECTURE.md §3`: *"Metrics, bootstrap CIs, baselines, ablations, report
 * generation. Must run against any agent behind one interface, so ablations are
 * configuration, not forked code."*
 *
 * **What this package holds no part of, and why each absence is structural:**
 *
 * - **No agent.** `agent.ts` is the interface `ARCHITECTURE.md §10` names —
 *   *"Observations -> Decisions + Ledger"* — and nothing implements it here.
 *   An agent inside the scorer would make the ablations forked code, which is
 *   exactly what `EVALUATION_SPEC.md §3.2` says would invalidate them.
 * - **No engine orchestration and no LLM policy.** `eslint.config.js` refuses
 *   an `@assay/engine` or `@assay/llm` import anywhere under `packages/eval/`
 *   except the one file `DECISION_BRIEF.md §L.1` rule 3 allowlists.
 * - **No close gate.** `RECONCILIATION_SPEC.md §10.1`'s `G1`-`G5` belong to
 *   `packages/ledger` Layer B (`ARCHITECTURE.md §8`, `§L.2`), whose
 *   `close-gate.ts` and `close.ts` are not written. `run.ts`'s `CloseOutcome` is
 *   the typed boundary; `metrics/close-loop.ts` consumes it and computes no gate.
 * - **No I/O.** `ARCHITECTURE.md §3` gives `apps/cli` all filesystem I/O.
 *   `PREREGISTRATION.md §6.2` `AL2`/`AL8` guard reads of `ground_truth*.jsonl`
 *   and `recon_report*.jsonl`; there is no read here for a guard to intercept.
 * - **No sampling.** `§5.3`'s `R = 20,000` differential pairs and `§6.1`'s split
 *   seeds are the caller's to draw. A scorer that sampled would be a second
 *   place the split is interpreted.
 *
 * **Where ground truth may go, and where it may not.** `AL1`/`AL2` bind the
 * engine and the oracle, not the scorer — a scorer that could not see the answer
 * key could not mark the paper. `truth.ts` is the single module that imports
 * `@assay/generator`'s `GroundTruth`, `agent.ts` does not import it, and
 * `AgentInput` has no field that could carry it. `tests/discipline.test.ts`
 * asserts all three.
 */

export {
  BPS_DENOMINATOR,
  BOOTSTRAP_RESAMPLES,
  C_EXCEPTION_PAISE,
  C_REVIEW_PAISE,
  C_REVIEW_SWEEP_PAISE,
  CALIBRATION_BINS,
  CONFIDENCE_LEVEL_BPS,
  CONSISTENCY_DRAW_SEED,
  CONSISTENCY_MEMBER_SET_MAX,
  CONSISTENCY_SAMPLE_SIZE,
  EPSILON_BPS,
  EPSILON_SWEEP_BPS,
  K_SIGMA,
  LEGACY_MAX_UNRESOLVED_ABS_PAISE,
  MAX_UNRESOLVED_RATIO_BPS,
  QUEUE_TOP_N,
  SEEDS_PER_CONFIGURATION,
  SPEC_VERSION,
  TAU_SWEEP_FLOOR_PAISE,
} from "./frozen.js";

export {
  type FrozenMetric,
  type MetricGroup,
  FROZEN_METRICS,
  REQUIRED_EXPLORATORY,
  blockedMetrics,
  computedMetrics,
  isFrozenMetric,
} from "./metric-list.js";

export {
  type Agent,
  type AgentDeclaration,
  type AgentId,
  type AgentInput,
  type AgentRole,
  type RunConfig,
  type ScoredLlmMode,
  AGENT_IDS,
  AGENTS,
  SCORED_LLM_MODES,
  agentDeclaration,
  tier0Agents,
} from "./agent.js";

export {
  type AbstentionRecord,
  type AgentRun,
  type AllocationEdge,
  type CloseGateOutcome,
  type CloseOutcome,
  type CommittedDecision,
  type ComponentOutcome,
  type ObservationOutcome,
  type OpenExceptionRecord,
  type PeriodStatus,
  type PostedLine,
} from "./run.js";

export {
  type ScoringTruth,
  type TrueEdge,
  type TrueJournalRow,
  projectTruth,
  scoringTruth,
  trueTargetByEntity,
} from "./truth.js";

export {
  type ClauseComparison,
  type ClauseKey,
  type ClauseTally,
  type ConsistencyResult,
  type DifferentialPair,
  type Divergence,
  type ExclusionReason,
  type PairComparison,
  DECLARED_SAMPLE_SIZE,
  comparePair,
  consistencyGate,
} from "./gates/consistency-gate.js";

/**
 * The `§5.3` differential draw (spec 1.4.27, `DATA_MODEL.md §22.2` M43).
 *
 * Separate from `consistency-gate.ts` because `DECISION_BRIEF.md §L.1` rule 3
 * lets that file hold *"no logic other than the differential test"*. The draw's
 * seed is **not frozen** — `PREREGISTRATION.md §10` V24 — so the caller supplies
 * one and this package chooses none.
 */
export {
  type BankReferent, type DrawOptions, drawPairs,
} from "./gates/sample.js";

export {
  type CoverageRatio,
  type CoverageReport,
  batchValuePaise,
  coverage,
  coverageByCount,
  coverageByValue,
  coverageByValueAllObservations,
  coverageByValueBank,
  coverageByValueLedger,
} from "./metrics/coverage.js";

export {
  type MatchReport,
  coveredEntityIds,
  matchMetrics,
  trueEdgeKeys,
  unresolvedEntityIds,
} from "./metrics/match.js";

export {
  type AbstentionReport,
  abstentionMetrics,
  abstentionSpikeFlag,
  attributableToUntrustedTextRate,
  largestExceptionInTopN,
  trulyAmbiguousTargets,
} from "./metrics/abstention.js";

export {
  type HarmReport,
  balanceHarm,
  harm,
  misdirectedValue,
  projectAgent,
} from "./metrics/harm.js";

export {
  type CostParameters,
  type NetCostReport,
  FROZEN_COSTS,
  gapToOracle,
  netCost,
  oraclePolicyNetCost,
} from "./metrics/cost.js";

export {
  type RobustnessReport,
  forcedAbstentionRate,
  injectionFinancialSuccessRate,
  robustness,
} from "./metrics/robustness.js";

export {
  type ComponentReport,
  componentMetrics,
  componentMetricsOver,
} from "./metrics/components.js";

export {
  type Sweep,
  type SweepPoint,
  cReviewSweep,
  orderingIsStable,
  tauSweep,
} from "./metrics/sensitivity.js";

export {
  type CalibrationReport,
  type ReliabilityBin,
  type ScoredPrediction,
  calibration,
} from "./metrics/calibration.js";

export {
  type RiskCoveragePoint,
  type RiskCoverageReport,
  riskCoverage,
} from "./metrics/risk-coverage.js";

export {
  type CloseGateId,
  type CloseLoopReport,
  type PeriodStatusDistribution,
  CLOSE_GATES,
  closeGateFailures,
  closeLoop,
  closeThresholdPaise,
  failedGates,
  legacyCloseThresholdPaise,
  periodStatusDistribution,
  periodStatusFrom,
} from "./metrics/close-loop.js";

export {
  type Estimate,
  type OfflineParity,
  bootstrapMean,
  intervalsOverlap,
  offlineParity,
} from "./bootstrap.js";
