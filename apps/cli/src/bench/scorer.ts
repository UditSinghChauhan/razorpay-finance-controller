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
