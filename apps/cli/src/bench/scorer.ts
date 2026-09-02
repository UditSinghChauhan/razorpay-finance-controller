import type { Observation } from "@assay/domain";
import {
  coveredEntityIds,
  degradationPopulations,
  robustness,
  scoringTruth,
  type AgentRun,
} from "@assay/eval";
import type { GroundTruth, Split } from "@assay/generator";

import { V30_NON_ADDITIVITY, type RobustnessMetrics } from "../artifacts/metrics.js";

/**
 * The scoring seam for `EVALUATION_SPEC.md §4.8` — metrics 15 and 16.
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
 */

/** The one `PREREGISTRATION.md §6.1` split M52 scopes metrics 15 and 16 to. */
export const EXERCISED_SPLIT: Split = "test";

/** Whether M52's populations exist on this split at all. */
export function isExercisedSplit(split: Split): boolean {
  return split === EXERCISED_SPLIT;
}

/**
 * `AL5`'s standing refusal, as the artifact records it.
 *
 * `PREREGISTRATION.md §9` step 7 runs the scored sweep `assay bench --sealed`,
 * and `AL5` withdraws `GENERATOR_TRUST`'s ground-truth unlock under that flag —
 * *"a field that was never read cannot be printed"*. The two together mean a
 * **sealed** run reads no answer key, so metrics 15 and 16 have no populations
 * to be taken over. That is recorded in the artifact in words rather than
 * resolved here: reading ground truth under `--sealed` would be a change to
 * `fs/guard.ts`'s own table, and reporting a `0.0` would be the number `§5.5`
 * forbids.
 */
export const AL5_GROUND_TRUTH_WITHHELD =
  "not exercised: PREREGISTRATION.md §6.2 AL5 withdraws the GENERATOR_TRUST unlock for " +
  "ground_truth*.jsonl under --sealed, so M52's injected and control populations were never " +
  "read. Metrics 15 and 16 are undefined here rather than zero.";

/** M52's own disposition where the injected set came back empty. */
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
