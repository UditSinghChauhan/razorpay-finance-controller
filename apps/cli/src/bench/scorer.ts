import type { Observation } from "@assay/domain";
import {
  abstentionMetrics,
  coveredEntityIds,
  degradationPopulations,
  gapToOracle,
  harm,
  matchMetrics,
  metric7Calibration,
  netCost,
  oraclePolicyNetCost,
  riskCoverage,
  robustness,
  scoringTruth,
  trulyAmbiguousTargets,
  unresolvedEntityIds,
  type AgentRun,
  type RiskCoveragePoint,
} from "@assay/eval";
import type { GroundTruth, Split } from "@assay/generator";
import type { OracleLabel } from "@assay/oracle";

import {
  V30_NON_ADDITIVITY,
  type RiskCoverageMetrics,
  type RobustnessMetrics,
  type TruthMetrics,
} from "../artifacts/metrics.js";
import { valueByEntityId } from "../values.js";
import { EPSILON_OPERATING_POINT_BPS, type EpsilonSweepPoint } from "./sweep.js";

/**
 * The scoring seam — `EVALUATION_SPEC.md §2`'s `score(agent output, ground
 * truth, oracle labels)`, for every metric that needs the second or third
 * argument.
 *
 * **Two sources, two seams, one read.** `§4.8`'s metrics 15 and 16 came first and
 * are below unchanged; the rest of the truth side — `§4.2`'s edges, `§4.3`'s
 * abstention set, `§4.4`'s harm, `§4.5`'s net cost, `§4.13`'s gap and `§5.1`'s
 * curve — is at the foot of this file, behind its own {@link TruthSource}.
 *
 * **The two unions are separate because their scopes are different facts, and
 * collapsing them breaks one of two frozen clauses.** M52 scopes `§4.8` to the
 * **TEST** split because `F10` lives at seeds `9100`–`9104` and *"on DEV the
 * injected set is EMPTY"* — a statement about the **population**. `§2`'s scoring
 * loop runs over `{dev, test}` and `§7`'s reproduction recipe benches **dev**
 * alone, so `§4.4`'s harm and everything downstream of it are computed there — a
 * statement about the **protocol**. One shared gate would either withhold metrics
 * 2–6 and 8 from the only split a third party can run, or turn M52's *"not
 * exercised on DEV"* into a computed zero. `commands/bench.ts` opens
 * `ground_truth.jsonl` **once** per `(split, seed)` and builds both sources from
 * that one record, so two scopes cost one read.
 *
 * The first half of this header describes the `§4.8` seam.
 *
 * **One place gathers the four inputs and makes the one call.** `§4.8`'s two
 * metrics are the first that need the truth side, and every piece of their
 * semantics already exists in `packages/eval`:
 *
 * ```
 *   scoringTruth(gt)                 §4.4's true journal, projected  (truth.ts)
 *   degradationPopulations(gt, obs)  M52's injected + control        (truth.ts)
 *   coveredEntityIds(run)            §4.4(a)'s covered set        (metrics/match.ts)
 *   robustness(...)                  metrics 15 and 16      (metrics/robustness.ts)
 * ```
 *
 * This module calls all four and implements none of them. No population is
 * reconstructed here, no `entity_id` is projected off an observation, no
 * per-case harm is summed and no rate is formed: M55 puts the reference-kind and
 * out-of-grammar structural zeros, the covered-set gate, the per-case
 * `source_entity_id` filter and the Suspense exclusion inside `caseBalanceHarm`,
 * and a second reading of any of them here would be a second implementation of a
 * ratified formula. `robustness()` is invoked exactly once per scored unit.
 *
 * **The populations are passed whole.** M52: *"reading POPULATION, not
 * bijection"* — nothing below pairs an injected observation with a control,
 * narrows either set, or drops a reference kind from metric 15's denominator.
 * `DegradationPopulations` goes from `truth.ts` into `robustness()` untouched.
 *
 * **The TEST-only gate is applied here, at the scorer, and it is a state rather
 * than a zero.** M52 scopes both metrics to the TEST split and reports them
 * *"not exercised on DEV"* elsewhere. {@link scoreRobustness} therefore takes a
 * {@link RobustnessSource} that either carries a dataset or names the reason
 * there is none, and never computes a rate from an absent one.
 *
 * **`--sealed` is not one of those reasons, from spec 1.4.34 (`DATA_MODEL.md
 * §22.2` M56).** Through spec 1.4.33 this module also exported
 * `AL5_GROUND_TRUTH_WITHHELD`, the state a sealed run filed because `fs/guard.ts`
 * withdrew `AL2`'s ground-truth unlock under the flag. `M56` rules `AL5` an
 * **emission** rule — *"reading is none of print, log or write"* — so the scorer
 * reads the answer key on `§9` step 7's sealed sweep, which
 * `EVALUATION_SPEC.md §2` has always defined as `score(agent output, ground
 * truth, oracle labels)`. The reason and its branch are **gone**, not made
 * conditional: `DECISION_BRIEF.md §A.41` rejects a second scoring pass and
 * rejects a `0.0` standing in for an unread population, so there is exactly one
 * path through this function and {@link EMPTY_INJECTED_POPULATION} stays what it
 * always was — a statement about the **dataset**, distinct from the withheld
 * state it now outlives.
 *
 * **What this module still never does is emit.** `AL5`'s guarantee is now an
 * emission boundary (`PREREGISTRATION.md §10` **V31**), and this is the last
 * place a `GroundTruth` exists: it enters {@link scoreRobustness} inside a
 * {@link RobustnessSource}, is converted by `packages/eval`'s projections before
 * any metric module sees it, and what leaves is `RobustnessMetrics` — booleans,
 * counts, rates and two fixed strings. Nothing here prints, logs or writes.
 */

/** The one `PREREGISTRATION.md §6.1` split M52 scopes metrics 15 and 16 to. */
export const EXERCISED_SPLIT: Split = "test";

/** Whether M52's populations exist on this split at all. */
export function isExercisedSplit(split: Split): boolean {
  return split === EXERCISED_SPLIT;
}

/**
 * M52's own disposition where the injected set came back empty.
 *
 * **The one remaining reason a TEST unit reports no rate, and it is a
 * measurement.** Through spec 1.4.33 there was a second — `AL5_GROUND_TRUTH_WITHHELD`,
 * a standing refusal filed whenever `§9` step 7's `--sealed` was present, so a
 * sealed TEST unit and a TEST seed carrying no `F10` record were both *"not
 * exercised"* for reasons a reader had to tell apart from prose. `M56` removed
 * the first (see the note above): the populations are now read on every TEST
 * unit, and this constant states the only thing that can still empty them —
 * that **this dataset** holds no injecting degradation. The counts behind it are
 * real, `report` is non-`null`, and the rates are `null` rather than `0`.
 */
export const EMPTY_INJECTED_POPULATION =
  "not exercised: M52's injected population is empty on this (split, seed) dataset — no " +
  "INJECT_NOTES or CONFLICT_REFERENCE degradation record names an observation in it. " +
  "EVALUATION_SPEC.md §4.8's two metrics are undefined rather than zero.";

/** One `(split, seed)` dataset, as metrics 15 and 16 read it. */
export interface RobustnessDataset {
  /** The dataset's ground truth — `artifacts/ground-truth.ts`'s one record. */
  readonly ground_truth: GroundTruth;
  /** The **same** dataset's observations, post-degradation. */
  readonly observations: readonly Observation[];
}

/**
 * What a scored unit's metrics 15 and 16 are taken over — or why they are not.
 *
 * A closed union rather than a nullable dataset, so the *reason* an absent
 * measurement is absent is carried into the artifact instead of being inferred
 * from a missing field.
 */
export type RobustnessSource =
  | { readonly kind: "dataset"; readonly dataset: RobustnessDataset }
  | { readonly kind: "not_exercised"; readonly reason: string };

/** A scored unit whose metrics 15 and 16 were not taken, and why. */
export function notExercised(reason: string): RobustnessSource {
  return Object.freeze({ kind: "not_exercised", reason });
}

/** M52's scope, stated for a split that is not `EXERCISED_SPLIT`. */
export function notExercisedOnSplit(split: Split): RobustnessSource {
  return notExercised(
    `not exercised on ${split}: DATA_MODEL.md §22.2 M52 scopes EVALUATION_SPEC.md §4.8's ` +
      `injected and matched-clean-control populations to the ${EXERCISED_SPLIT} split, where ` +
      `PREREGISTRATION.md §4.1's F10 places the two injecting operators. Elsewhere the ` +
      `injected set is empty and metrics 15 and 16 are undefined rather than zero.`,
  );
}

/** A scored unit measured against its own `(split, seed)` dataset. */
export function overDataset(
  groundTruth: GroundTruth,
  observations: readonly Observation[],
): RobustnessSource {
  return Object.freeze({
    kind: "dataset",
    dataset: Object.freeze({ ground_truth: groundTruth, observations }),
  });
}

/**
 * Metrics 15 and 16 for one scored unit.
 *
 * **Fail-closed throughout, and none of the closing is done here.** An injected
 * `obs_id` the dataset does not hold, a population member the run reports no
 * terminal state for, and an `F10` degradation record naming no observation are
 * each a refusal raised by `packages/eval` — by `robustness()` and by
 * `degradationPopulations()` respectively — and this function catches none of
 * them. A missing input is a stop condition, never a zero.
 */
export function scoreRobustness(run: AgentRun, source: RobustnessSource): RobustnessMetrics {
  if (source.kind === "not_exercised") {
    return Object.freeze({
      exercised: false,
      not_exercised: source.reason,
      // No measurement was taken, which is a different fact from a measurement
      // over an empty population — and the two must stay distinguishable in the
      // artifact.
      report: null,
      non_additivity_disclosure: V30_NON_ADDITIVITY,
    });
  }

  const { ground_truth, observations } = source.dataset;
  const report = robustness(
    run,
    scoringTruth(ground_truth),
    // Taken whole. Nothing here narrows M52's populations or pairs their members.
    degradationPopulations(ground_truth, observations),
    observations,
    coveredEntityIds(run),
  );
  return Object.freeze({
    exercised: report.exercised,
    not_exercised: report.exercised ? null : EMPTY_INJECTED_POPULATION,
    report,
    non_additivity_disclosure: V30_NON_ADDITIVITY,
  });
}

// ---------------------------------------------------------------------------
// The rest of the truth side — §4.2, §4.3, §4.4, §4.5, §4.6, §4.13 and §5.1
// ---------------------------------------------------------------------------

/**
 * One `(split, seed)` dataset as the **remaining** truth-side metrics read it.
 *
 * `EVALUATION_SPEC.md §2` defines a scored unit as `score(agent output, ground
 * truth, oracle labels)`, and this is the second and third argument together:
 * metrics 5 and 6 read the answer key, metric 4 and metric 8's reference policy
 * read the oracle's labels, and metric 2 and metric 3 are functions of what those
 * produce. It is a **separate record from {@link RobustnessDataset}** because
 * `§4.8`'s two metrics are scoped to one split by M52 and these are not scoped by
 * anything, and because metrics 15 and 16 read no oracle label at all — folding
 * the two would let one metric's absence be read as the other's.
 *
 * Both records are built from **one** `loadGroundTruth` call per `(split, seed)`;
 * `commands/bench.ts` opens the artifact once and hands the same value to both.
 */
export interface TruthDataset {
  /** The dataset's ground truth — `artifacts/ground-truth.ts`'s one record. */
  readonly ground_truth: GroundTruth;
  /** The **same** dataset's observations, post-degradation. */
  readonly observations: readonly Observation[];
  /**
   * The **same** dataset's `oracle_labels.jsonl`, as `§9` step 3 wrote it.
   *
   * Read, never recomputed: `§5.3` (M51) states that the artifact *"is NOT
   * regenerated"*, and `§4.3` insists the truly-ambiguous set is the oracle's
   * *"not from the generator and not from a label"*. No `τ` reaches this module
   * and no oracle is imported by it.
   */
  readonly oracle_labels: readonly OracleLabel[];
}

/**
 * What a scored unit's remaining truth-side metrics are taken over — or why they
 * are not.
 *
 * The same closed-union treatment {@link RobustnessSource} gets, for the same
 * reason: an absent measurement must carry the reason it is absent rather than
 * leave a reader to infer one from a missing field, and `§5.5` bars a `0`
 * standing in for a figure no artifact holds.
 */
export type TruthSource =
  | { readonly kind: "dataset"; readonly dataset: TruthDataset }
  | { readonly kind: "not_scored"; readonly reason: string };

/** A scored unit whose truth-side metrics were not taken, and why. */
export function truthNotScored(reason: string): TruthSource {
  return Object.freeze({ kind: "not_scored", reason });
}

/**
 * The splits `EVALUATION_SPEC.md §2`'s scoring loop runs over.
 *
 * `§2`: `for split in {dev, test}: … score(agent output, ground truth, oracle
 * labels) -> metrics.json`. The truth read follows that loop **exactly** and is
 * scoped by nothing else — spec 1.4.34's own header calls this line *"read and
 * not amended"*, and `DECISION_BRIEF.md §A.41` rests `M56` on it.
 *
 * Kept apart from {@link EXERCISED_SPLIT}, which is `§4.8`'s **population**
 * scope, not a read scope: M52 makes metrics 15 and 16 TEST-only because `F10`
 * lives at seeds `9100`–`9104` and *"on DEV the injected set is EMPTY"*, which is
 * a statement about what there is to measure rather than about what may be
 * opened. Collapsing the two would either withhold `§4.4`'s harm from `§7`'s
 * DEV-only reproduction recipe, or turn M52's *"not exercised on DEV"* into a
 * computed zero. Both are refused, and the two scopes stay separate constants.
 */
export const TRUTH_SCORED_SPLITS: readonly Split[] = Object.freeze(["dev", "test"]);

/** Whether `§2`'s scoring loop reaches this split at all. */
export function isTruthScoredSplit(split: Split): boolean {
  return TRUTH_SCORED_SPLITS.includes(split);
}

/**
 * The reason a split outside `§2`'s loop takes no truth-side measurement.
 *
 * **`train` alone, and this is a statement about the protocol rather than about
 * the metrics.** `§2` loops over `{dev, test}`; `§7`'s reproduction recipe —
 * *"a third party … must be able to reproduce **every number**"* — generates,
 * labels and benches **dev**, so `§4.2`, `§4.4`, `§4.5` and `§4.13` are computed
 * there and this reason never reaches a `dev` unit. `PREREGISTRATION.md §6.1`
 * assigns TRAIN its own seeds and `§6.2` `AL4` lets a developer inspect it
 * without limit; what TRAIN has no place in is the **scored** protocol, so no
 * answer key is opened for it and every truth-side figure is `null` **with this
 * sentence attached** rather than `0`.
 */
export function truthNotScoredOnSplit(split: Split): TruthSource {
  return truthNotScored(
    `not scored on ${split}: EVALUATION_SPEC.md §2's scoring loop runs over ` +
      `{${TRUTH_SCORED_SPLITS.join(", ")}} — "score(agent output, ground truth, oracle ` +
      `labels) -> metrics.json" — and ${split} is outside it, so no ground truth and no ` +
      `oracle label is read for this unit. §4.2, §4.3, §4.4, §4.5 and §4.13 are defined ` +
      `wherever an answer key exists; what is absent here is the scored protocol, not the ` +
      `definition, and §5.5 bars a 0 standing in for a figure no artifact holds.`,
  );
}

/** A scored unit measured against its own `(split, seed)` dataset and labels. */
export function overTruth(
  groundTruth: GroundTruth,
  observations: readonly Observation[],
  oracleLabels: readonly OracleLabel[],
): TruthSource {
  return Object.freeze({
    kind: "dataset",
    dataset: Object.freeze({
      ground_truth: groundTruth,
      observations,
      oracle_labels: oracleLabels,
    }),
  });
}

/**
 * Metric 6(a) for one execution — the **y-axis** `§5.1` plots the curve on.
 *
 * `§5.3`'s procedure table gives the ε sweep's owner as `apps/cli` `bench` and
 * its output as *"`(coverage_by_value, balance_harm)` per point → metric 3
 * `aurc_inr`"*. `bench/sweep.ts` already produces the x; this is the y, and it is
 * `metrics/harm.ts`'s figure rather than a second one — the same `harm()` call the
 * base execution makes, over the same covered set, at whatever ε that execution
 * ran under.
 *
 * `null` where no dataset was supplied. A curve is then not integrated at all
 * (see {@link scoreRiskCoverage}); it is never integrated against a zero harm,
 * which would publish an `aurc_inr` of `0` — the best possible score — for a unit
 * that measured nothing.
 */
export function balanceHarmOf(run: AgentRun, source: TruthSource): number | null {
  if (source.kind === "not_scored") return null;
  const { ground_truth, observations } = source.dataset;
  return harm(
    run,
    scoringTruth(ground_truth),
    coveredEntityIds(run),
    valueByEntityId(observations),
  ).balance_harm_paise;
}

/**
 * Metrics 2, 4, 5, 6, 7 and 8 for one scored unit.
 *
 * **Six `packages/eval` calls and no seventh formula.** Every quantity below is
 * computed by the module `PREREGISTRATION.md §8` names for it, and this function
 * supplies inputs:
 *
 * ```
 *   matchMetrics(run, truth, unresolvedEntityIds(run))   metric 5   metrics/match.ts
 *   harm(run, truth, covered, valueByEntityId(obs))      metric 6   metrics/harm.ts
 *   netCost(run, balance_harm_paise)                     metric 2   metrics/cost.ts
 *   abstentionMetrics(run, labels, valueByEntityId(obs)) metric 4   metrics/abstention.ts
 *   gapToOracle(net_cost, oraclePolicyNetCost(...))      metric 8   metrics/cost.ts
 *   metric7Calibration(run, truth)      metric 7   metrics/calibration-population.ts
 * ```
 *
 * **Metric 7 joined that list at spec 1.4.35, and this function still implements
 * none of it.** Through spec 1.4.34 `§4.6` stated no correctness source for
 * `accuracy(bin)`, the choice between two admissible readings moved the figure,
 * and `DECISION_BRIEF.md §A.41` required such a choice to be **ratified rather
 * than made by an implementation** — so the artifact published a standing refusal
 * beside a `null`. `DATA_MODEL.md §22.2` **M57** takes that ratification, and
 * `metrics/calibration-population.ts` holds every part of it: the `DISCRIMINATED`
 * population, the `Δs` prediction, the one-decision-one-prediction unit and the
 * set-equality predicate. **No population is filtered here, no truth edge is
 * re-keyed and no allocation is compared** — this module passes the run and the
 * same `ScoringTruth` the other five metrics already read, and receives a
 * `CalibrationReport` or `null`.
 *
 * **`null` is `M57`'s `N = 0` and is never a zero.** `calibration([])` answers
 * `0`, the best possible `ECE`; `§5.5` bars that number and `M57` requires the
 * metric be published **unavailable with its reason**. The decision to withhold
 * lives in `calibration-population.ts`; the reason a reader sees is
 * `artifacts/metrics.ts`'s. `metrics/calibration.ts` itself is **unchanged** —
 * `M57` confirms its bins, its edges and its empty-bin rule rather than moving
 * them, and what it was always missing was the input.
 *
 * **Metric 6 is computed once and metric 2 is handed the result.** `netCost`'s own
 * signature asks for it that way — *"passed in rather than recomputed so that the
 * two metrics cannot disagree about which set they scored"* — so `§4.5`'s first
 * term is `§4.4(a)`'s figure and not a second reading of it. `§4.4(b)`'s
 * `misdirected_value_inr` is likewise the one `harm()` returned; nothing here sums
 * a value or differences an account.
 *
 * **Metric 8's reference policy is read off `§4.5`, not chosen.** `§4.13` puts the
 * oracle policy at *"abstains on exactly the truly-ambiguous set and is correct
 * elsewhere"* — so its harm is `0` and its abstention charge is
 * `|truly_ambiguous| × C_review`. Its **exception** term is fixed by `§4.5`, which
 * states that the per-`ledger_entry` `C_exception` constant *"cancels in every
 * comparison, **including metric 8 `gap_to_oracle`, which is a difference of two
 * `net_cost_inr` values**"* — a sentence that is true only if the reference policy
 * carries the same term. `E13_LEDGER_ONLY` is that term and `§4.5` calls its count
 * *"identical for ASSAY, `B0`, `B2`, `A1`, `A2` and `A3`"*, so `netCost`'s own
 * `e13_count` is what the policy is charged. `oraclePolicyNetCost` refuses to
 * default it for exactly this reason.
 *
 * **The oracle is not re-run and its labels are not re-derived.** The
 * truly-ambiguous set comes from `trulyAmbiguousTargets`, over the labels
 * `§9` step 3 wrote; this module imports no oracle, holds no `τ` and calls
 * `labelAll` nowhere.
 *
 * **Fail-closed throughout, and none of the closing is done here.** A malformed
 * `ground_truth.jsonl`, an absent one, and a malformed `oracle_labels.jsonl` are
 * each a refusal raised at the read; a truth field a metric module cannot
 * reconcile is that module's refusal. A missing input is a stop condition, never
 * a zero.
 */
export function scoreTruth(run: AgentRun, source: TruthSource): TruthMetrics {
  if (source.kind === "not_scored") {
    return Object.freeze({ scored: false, not_scored: source.reason, report: null });
  }

  const { ground_truth, observations, oracle_labels } = source.dataset;
  const truth = scoringTruth(ground_truth);
  const covered = coveredEntityIds(run);
  const valueOfEntity = valueByEntityId(observations);

  const harmReport = harm(run, truth, covered, valueOfEntity);
  const netCostReport = netCost(run, harmReport.balance_harm_paise);
  const trulyAmbiguous = trulyAmbiguousTargets(oracle_labels).size;
  const oraclePolicy = oraclePolicyNetCost(trulyAmbiguous, netCostReport.e13_count);

  return Object.freeze({
    scored: true,
    not_scored: null,
    report: Object.freeze({
      match: matchMetrics(run, truth, unresolvedEntityIds(run)),
      harm: harmReport,
      net_cost: netCostReport,
      abstention: abstentionMetrics(run, oracle_labels, valueOfEntity),
      truly_ambiguous: trulyAmbiguous,
      oracle_policy_net_cost_paise: oraclePolicy,
      gap_to_oracle_paise: gapToOracle(netCostReport.net_cost_paise, oraclePolicy),
      // Metric 7 (M57), over the SAME `truth` projection every metric above
      // reads. `null` where §6 step 3's DISCRIMINATED branch committed nothing.
      calibration: metric7Calibration(run, truth),
    }),
  });
}

/**
 * Metric 3 — `aurc_inr`, integrated over `§5.1`'s ε curve.
 *
 * **The curve is the sweep's, and the integration is `metrics/risk-coverage.ts`'s.**
 * `§5.1` plots *"**coverage by value** on x and **balance harm in ₹** on y"* at
 * each ε; `bench/sweep.ts` produces both per point and this function hands the
 * pairs to `riskCoverage()`, which owns the quadrature, the ordering, the
 * tie handling and the `spans_declared_sweep` / `is_single_point` disclosures. No
 * interpolation, sort key or area is decided here.
 *
 * **A single-point agent contributes its one point, which is `§5.1`'s own
 * treatment.** *"`B0`, `B1`, `B2` and `A2` are single points (they do not abstain,
 * or abstain trivially)"* — they *"contribute one point at the frozen ε and no
 * curve"*, so the base execution's `(coverage_by_value, balance_harm)` at the
 * operating point **is** their curve. `riskCoverage` gives it zero area and sets
 * `is_single_point`, which is what records that the figure is not comparable with
 * a curve's rather than best-in-field.
 *
 * The same path carries `ASSAY` and `A1` under `--llm=replay`, where
 * `DECISION_BRIEF.md §F` F2 leaves no curve to run: the unit reports its one
 * operating point with `spans_declared_sweep` false, rather than an `aurc_inr`
 * over a curve that was never executed.
 *
 * `null` where any point's harm is `null` — a curve missing its y-axis is not
 * integrated against zeros.
 */
export function scoreRiskCoverage(
  epsilonPoints: readonly EpsilonSweepPoint[],
  operating: { readonly coverage_by_value: number; readonly balance_harm_paise: number | null },
): RiskCoverageMetrics {
  const points: RiskCoveragePoint[] =
    epsilonPoints.length > 0
      ? epsilonPoints.map((point) => ({
          epsilon_bps: point.parameter_value,
          coverage_by_value: point.coverage_by_value,
          balance_harm_paise: point.balance_harm_paise ?? Number.NaN,
        }))
      : [
          {
            epsilon_bps: EPSILON_OPERATING_POINT_BPS,
            coverage_by_value: operating.coverage_by_value,
            balance_harm_paise: operating.balance_harm_paise ?? Number.NaN,
          },
        ];

  if (points.some((point) => Number.isNaN(point.balance_harm_paise))) {
    return Object.freeze({ scored: false, not_scored: NO_RISK_AXIS, report: null });
  }
  return Object.freeze({ scored: true, not_scored: null, report: riskCoverage(points) });
}

/**
 * Why metric 3 is `null` where `§5.1`'s y-axis was never measured.
 *
 * `§4.4` is the risk axis — *"balance harm in ₹ on y"* — and `§5.1` calls `AURC`
 * *"the area under the risk–coverage curve"*. With no answer key there is no harm
 * at any ε, and an area taken over a zero risk axis is `0`: the **best possible**
 * `aurc_inr`, published for a unit that measured nothing. `§5.5` bars precisely
 * that number.
 */
export const NO_RISK_AXIS =
  "not scored: EVALUATION_SPEC.md §5.1 plots balance_harm_inr on the risk axis and §4.4 " +
  "computes it against ground truth, which this scored unit was not given. aurc_inr is " +
  "undefined rather than 0 — an area over a zero risk axis is the best possible score, and " +
  "§5.5 bars a number that does not exist in a committed run artifact.";
