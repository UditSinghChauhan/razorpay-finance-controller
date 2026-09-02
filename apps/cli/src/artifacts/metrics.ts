import type {
  AbstentionReport,
  HarmReport,
  MatchReport,
  NetCostReport,
  RiskCoverageReport,
  RobustnessReport,
  RunKey,
} from "@assay/eval";

import type { AgentSweeps } from "../bench/sweep.js";

/**
 * `metrics.json`'s shape — `EVALUATION_SPEC.md §7` (M48) and its M51 sweeps.
 *
 * **One artifact per scored unit, at the path M48 already fixed**, which
 * `metrics-path.ts` builds:
 *
 * ```
 *   runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
 * ```
 *
 * **The sweeps nest inside it; they do not add a path segment or a key
 * dimension.** M51: a sweep point is *"an evaluation inside one scored unit,
 * never a fifth key dimension"*, identified `(RunKey, parameter_name,
 * parameter_value)`. The `RunKey` half is {@link ScoredMetrics.key} and is
 * written once; the other two are each point's own fields.
 *
 * **The ordinary metrics are not replaced by the sweep.** `EVALUATION_SPEC.md
 * §5.2`'s table and `§5.4` item 5 report figures at `PREREGISTRATION.md §7`'s
 * frozen `ε` and `τ`, and {@link ScoredMetrics.base} carries them. The ε point
 * at `1500` and the τ point at `10_000` are the *same execution's* figures
 * appearing on their curves, which is why each carries `is_operating_point`.
 *
 * **This shape is a convention, recorded as one** — the treatment
 * `metrics-path.ts` gives the path itself and `replay-cache.ts` gives the cache
 * layout. No frozen document states a field list for `metrics.json`; what M51
 * fixes is the point *identity*, and that is what the sweep rows carry. A later
 * amendment naming a different shape supersedes this file rather than
 * contradicting a rule nobody wrote.
 */

/**
 * `PREREGISTRATION.md §10` **V30**'s disclosure, carried in the artifact.
 *
 * V30 requires that no additivity be claimed or implied between M55's per-case
 * `case_balance_harm` and `§4.4`'s run-level `balance_harm_inr`. Metric 15
 * reports a **count** of injected cases whose per-case harm is positive, and a
 * reader who took that count for a decomposition of the run-level figure would
 * be making exactly the inference V30 forbids — so the disclosure travels with
 * the number rather than being left to a report that may not carry it.
 */
export const V30_NON_ADDITIVITY =
  "PREREGISTRATION.md §10 V30: injected_cases_with_harm counts injected cases whose M55 " +
  "case_balance_harm is positive. case_balance_harm is a ratified decomposition and NOT a " +
  "partition of EVALUATION_SPEC.md §4.4's balance_harm_inr: §4.4(a) places the absolute " +
  "value outside the per-account difference and takes it over the whole covered set at once, " +
  "so |a1+a2 - t1-t2| != |a1-t1| + |a2-t2| and the per-case figures do not sum to the " +
  "run-level metric. No additivity between them is claimed or implied.";

/**
 * Metrics 15 and 16 for one scored unit — `EVALUATION_SPEC.md §4.8`, over M52's
 * two populations, as `packages/eval`'s `robustness()` reports them.
 *
 * **Not exercised is a state, not a zero.** M52 scopes both metrics to the
 * **TEST** split and states that elsewhere *"the injected set is **empty**, so
 * metrics 15 and 16 are undefined rather than zero and are reported **'not
 * exercised on DEV'**"*. `§5.5` forbids reporting a number that does not exist
 * in a committed run artifact, and a `0.0` standing in for an unexercised metric
 * is exactly that number — so {@link exercised} carries M52's own determination,
 * {@link not_exercised} carries the reason in words, and every rate inside
 * {@link report} is already `null` rather than `0` on an empty population.
 */
export interface RobustnessMetrics {
  /** M52's determination, carried rather than re-derived from a set size. */
  readonly exercised: boolean;
  /** Why the metrics were not taken, or `null` where they were. */
  readonly not_exercised: string | null;
  /**
   * `robustness()`'s report — metrics 15 and 16, their populations, and
   * `PREREGISTRATION.md §10` **V27**'s kind composition of each population.
   *
   * `null` where the scorer took no measurement at all, so that an absent
   * measurement and an empty population are distinguishable in the artifact:
   * on a non-TEST split there is no injected set to count, while on a TEST seed
   * carrying no `F10` degradation the counts are real and the rates are `null`.
   *
   * V27's `injected_by_kind` / `control_by_kind` ride inside it and are
   * **diagnostics, not performance metrics**: they record that M52's control is
   * matched on *"dataset co-membership and `Observation.kind` only"*, so a
   * reader can never be handed metric 16's difference without the two mixes that
   * produced it.
   */
  readonly report: RobustnessReport | null;
  /** {@link V30_NON_ADDITIVITY}, on every scored unit. */
  readonly non_additivity_disclosure: string;
}

/**
 * `PREREGISTRATION.md §8` metric 10's published state — `DATA_MODEL.md §22.2`
 * **M54**, recorded at spec 1.4.32.
 *
 * `EVALUATION_SPEC.md §5.4` item 5: *"Metric 10 `exception_class_confusion` is
 * carried in that table as **`NOT COMPUTABLE ON THE FROZEN POPULATION`**, with
 * `§6`'s reason printed beside it ... the metric keeps its number and its place
 * on `PREREGISTRATION.md §8`'s list of 28, and what is published is its honest
 * state rather than a fabricated matrix."* The state travels **in the artifact**
 * rather than being left to a report that may not carry it, for the same reason
 * {@link V30_NON_ADDITIVITY} does: without it, a reader of a `metrics.json` that
 * now carries metrics 2–8 could not tell metric 10's ratified non-computability
 * from a metric nobody wired.
 *
 * Nothing here makes it computable and nothing here narrows it. `§10` **V29**
 * records why: ground truth carries no exception-cause field and no frozen table
 * maps a degradation operator to an `ExceptionClass`, so the matrix has no truth
 * axis, and all three candidate repairs are rejected and preserved as rejected.
 */
export const M54_METRIC_10_NOT_COMPUTABLE =
  "NOT COMPUTABLE ON THE FROZEN POPULATION (DATA_MODEL.md §22.2 M54, PREREGISTRATION.md §10 " +
  "V29): GroundTruth carries no exception-cause field and no frozen table maps a degradation " +
  "operator to an ExceptionClass, so metric 10's matrix has no truth axis. The metric keeps " +
  "its number and its place on §8's list of 28; the marginal distribution of R2's assigned " +
  "classes is EXPLORATORY and supports no claim about triage accuracy.";

/**
 * `PREREGISTRATION.md §8` metric 7's published state — `ece` is **not computed
 * by this scorer**, and the reason is that `§4.6` does not determine it.
 *
 * `§4.6` fixes the formula, the bin count and the score: *"For the score used by
 * the abstention gate, bin predictions into 10 equal-width bins and compute
 * `ECE = Σ_bins (n_bin / N) × | accuracy(bin) − mean_score(bin) |`"*, and
 * `RECONCILIATION_SPEC.md §6` step 3 fixes the population as the committed
 * decisions whose gate read the ε-gap. What no frozen clause states is
 * **`accuracy(bin)`'s correctness source** — what makes one committed decision
 * *right*.
 *
 * Two readings are admissible on the frozen text and they **disagree
 * numerically**. `RECONCILIATION_SPEC.md §6`'s tie-break ratification
 * (`DATA_MODEL.md §22.2` **M35**) fixes *"allocation identity — the set of
 * `(target_id, member_obs_id)` pairs the solution asserts"*, which reads as
 * **set equality** against ground truth's pairs for that target; but
 * `EVALUATION_SPEC.md §4.2` scores the same pair as an **edge**, under which a
 * decision asserting a subset of the true members has no false positive and
 * would count as correct. A decision that asserted two of three true members is
 * right under the second and wrong under the first, so the choice **moves a
 * figure on `§8`'s list**.
 *
 * `DECISION_BRIEF.md §A.41` states the standard that applies to exactly this
 * shape: *"Both readings are admissible on the frozen text, so this is marked
 * **ratified rather than dressed as derivation**, on the `M35`/`M45`/`M49`/`M50`/
 * `M55` precedent."* An outcome-bearing choice among admissible readings is a
 * governance act taken **before any figure exists**, not a decision a scorer
 * makes for itself — so this scorer takes none, and publishes the state instead.
 *
 * **What is not done here, deliberately.** No conventional ECE correctness rule
 * is substituted, no replacement formula is written, and `metrics/calibration.ts`
 * is **not** amended: `calibration()` remains implemented and correct for the
 * predictions it is given, and `PREREGISTRATION.md §8`'s row 7 still names it.
 * What is missing is the input, and `§5.5` bars publishing a number in place of
 * one that does not exist.
 */
export const METRIC_7_ECE_UNRATIFIED =
  "NOT COMPUTED: EVALUATION_SPEC.md §4.6 fixes ECE's formula, its 10 equal-width bins and " +
  "the score they bin, but states no correctness source for accuracy(bin). Two readings are " +
  "admissible on the frozen text and disagree numerically — set equality against the true " +
  "allocation (RECONCILIATION_SPEC.md §6 / DATA_MODEL.md §22.2 M35's allocation identity), " +
  "and edge-level agreement (EVALUATION_SPEC.md §4.2), which differ on a decision asserting " +
  "a subset of the true members. DECISION_BRIEF.md §A.41 requires an outcome-bearing choice " +
  "between admissible readings to be RATIFIED before a figure exists, so this scorer computes " +
  "no value. packages/eval's calibration() is unchanged and unwired; §5.5 bars a number in " +
  "place of one that does not exist.";

/**
 * The truth- and oracle-side metrics for one scored unit — `EVALUATION_SPEC.md
 * §2`'s `score(agent output, ground truth, oracle labels)`.
 *
 * Every field is the record `packages/eval`'s own module returned, carried whole
 * rather than flattened to a scalar. `§4.4` requires both halves of metric 6
 * because *"a system can be good at one and bad at the other. **Collapsing them
 * into a single number would hide that**"*, `§4.5` requires
 * `net_cost_inr_excluding_e13` beside metric 2, `§4.6` requires the reliability
 * diagram beside metric 7, and `§4.13` requires the probe count beside metrics 4
 * and 8 — each of those companions rides inside the report that produced its
 * headline figure, so no reporter can print one without the other.
 */
export interface TruthReport {
  /** Metric 5 — `match_precision`, `match_recall`, `match_f1` (`§4.2`). */
  readonly match: MatchReport;
  /** Metric 6 — `balance_harm_inr` and `misdirected_value_inr` (`§4.4`). */
  readonly harm: HarmReport;
  /** Metric 2 — `net_cost_inr`, with `§4.5`'s `EXPLORATORY` companion. */
  readonly net_cost: NetCostReport;
  /** Metric 4 — `abstention_precision` / `_recall`, with `§4.13`'s probe counts. */
  readonly abstention: AbstentionReport;
  /** `|truly_ambiguous|` from the oracle's labels — metric 8's reference policy. */
  readonly truly_ambiguous: number;
  /** `net_cost_inr(oracle_policy)`, in paise (`§4.13`). */
  readonly oracle_policy_net_cost_paise: number;
  /** Metric 8 — signed and unclamped; a negative gap is valid (`§4.13`, M36). */
  readonly gap_to_oracle_paise: number;
}

/**
 * Metrics 2, 4, 5, 6, 7 and 8, or the reason no truth-side measurement was taken.
 *
 * **Not scored is a state, not a zero**, on `RobustnessMetrics`'s own terms:
 * `§5.5` forbids *"any number in the demo that does not exist in a committed run
 * artifact"*, and a `0` standing in for an unmeasured `balance_harm_inr` — the
 * best possible value of that metric — is exactly such a number.
 */
export interface TruthMetrics {
  /** Whether an answer key and a label set were supplied for this unit. */
  readonly scored: boolean;
  /** Why they were not, or `null` where they were. */
  readonly not_scored: string | null;
  /** `null` where {@link scored} is `false`; never a report of zeros. */
  readonly report: TruthReport | null;
}

/**
 * Metric 3 — `aurc_inr`, or the reason `§5.1`'s curve was not integrated.
 *
 * The report is `metrics/risk-coverage.ts`'s, and it carries its own two
 * disclosures: `spans_declared_sweep` says whether the ε sweep covered `§5.1`'s
 * declared `[0, 10_000]` bps range, and `is_single_point` records that an agent
 * `§5.1` draws as a single point has an `AURC` of `0` that is **not** comparable
 * with a curve's.
 */
export interface RiskCoverageMetrics {
  readonly scored: boolean;
  readonly not_scored: string | null;
  readonly report: RiskCoverageReport | null;
}

/**
 * The metrics one scored unit produces at the frozen thresholds.
 *
 * **Still partial, and the partiality is still recorded rather than hidden.**
 * `PREREGISTRATION.md §8`'s list runs to 28. What this carries is every metric a
 * single scored unit determines: the ones its own `AgentRun` fixes, `§4.8`'s two
 * over M52's populations, and — through {@link truth} — the ones that need the
 * answer key and the oracle's labels. What is still absent is absent for a stated
 * reason rather than defaulted to zero, because `§5.5` traces every reported
 * number to a committed artifact and a zero standing in for an uncomputed metric
 * is exactly the number it forbids:
 *
 * ```
 *   7              §4.6 states no correctness source for accuracy(bin); the
 *                  choice is outcome-bearing and unratified
 *   10             NOT COMPUTABLE ON THE FROZEN POPULATION (M54, §10 V29)
 *   20, 21, 22     LLM telemetry and wall-clock instrumentation of a run
 *   23             two committed run artifacts to compare root hashes across
 *   24, and CIs    §5.2's bootstrap over >= 5 seeds — an aggregate, not a unit
 *   26 c_review    M51's post-hoc cost sweep; §4.4(a)'s figure it needs is in
 *                  `truth.report.harm.balance_harm_paise` and `net_cost`
 * ```
 */
export interface BaseMetrics {
  /** Metric 1. */
  readonly coverage_by_value: number;
  /** Metric 9. */
  readonly coverage_by_count: number;
  /** Metric 27. */
  readonly coverage_by_value_bank: number;
  /** Metric 28 — `0.0` by construction (`§4.1`). */
  readonly coverage_by_value_ledger: number;
  /** `EXPLORATORY` per `§8`, printed beside metric 1 (`§4.1`'s audit line). */
  readonly coverage_by_value_all_observations: number;
  readonly batch_value_paise: number;
  readonly abstentions: number;
  readonly decisions: number;
  readonly open_exceptions: number;
  /** `§4.13`'s required provenance, beside metrics 4 and 8. */
  readonly probes_spent: number;
  readonly abstentions_resolved_by_probe: number;
  /** Metrics 15 and 16 (`§4.8`), or M52's *"not exercised"*. */
  readonly robustness: RobustnessMetrics;
  /** Metrics 2, 4, 5, 6, 7 and 8, or the reason no answer key was supplied. */
  readonly truth: TruthMetrics;
  /**
   * Metric 7 — `null`, always, until `§4.6`'s correctness source is ratified.
   *
   * Beside metric 10's pair and in the same shape, because the two are the same
   * kind of fact: a metric on `§8`'s frozen list that keeps its number and
   * publishes its honest state rather than a fabricated figure. The **reasons
   * differ** and the two fields keep them apart — metric 10 has no truth axis at
   * all (`M54`), while metric 7 has one whose definition is undetermined.
   */
  readonly ece: null;
  /** {@link METRIC_7_ECE_UNRATIFIED}, printed beside the `null` (`§5.4` item 5). */
  readonly ece_state: string;
  /**
   * Metric 10 — `null`, always, and never a matrix.
   *
   * M54 rules it **not computable on the frozen population**; the field is
   * present and `null` so that its ratified state is visible in the artifact
   * rather than indistinguishable from an unwired metric.
   */
  readonly exception_class_confusion: null;
  /** {@link M54_METRIC_10_NOT_COMPUTABLE}, printed beside the `null` (`§5.4` item 5). */
  readonly exception_class_confusion_state: string;
}

/** One scored unit's artifact. */
export interface ScoredMetrics {
  /** M48's `(agent_id, split, seed, llm_mode)`, written once. */
  readonly key: RunKey;
  /**
   * Figures at `PREREGISTRATION.md §7`'s frozen thresholds — the authoritative
   * ordinary result.
   *
   * The thresholds themselves are **not** echoed here. `boundary.test.ts` keeps
   * every frozen value out of `apps/cli` except where a spec clause forces it,
   * and nothing forces it here: the ε point carrying `is_operating_point` marks
   * the frozen ε on the curve, and `§7` is the one place either value is read.
   */
  readonly base: BaseMetrics;
  /**
   * `§5.1`'s and `§5.3`'s curves, empty for an agent `§5.1` draws as a single
   * point (`B0`, `A2`, `A3`).
   */
  readonly sweeps: AgentSweeps;
  /**
   * Metric 3 — `aurc_inr`, integrated over {@link sweeps}'s ε points.
   *
   * It sits here rather than in {@link base} because it is a function of the
   * **curve**, and the curve is the unit's, not one execution's. M51 puts the
   * whole curve inside one scored unit for exactly this reason: `§5.4` item 5
   * with `§5.5` requires every frozen metric to carry a CI, so `aurc_inr` is
   * *"one scalar per scored unit, bootstrapped over seed"*.
   */
  readonly risk_coverage: RiskCoverageMetrics;
}

/** `metrics.json`'s bytes: two-space JSON with a trailing newline, as `gate.ts` writes. */
export function encodeMetrics(metrics: ScoredMetrics): string {
  return `${JSON.stringify(metrics, null, 2)}\n`;
}
