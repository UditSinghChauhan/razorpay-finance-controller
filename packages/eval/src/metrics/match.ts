/**
 * Match precision / recall — `EVALUATION_SPEC.md §4.2`. Metric 5.
 *
 * > *"The unit is an **edge**: a `(entity_id, target_id)` allocation pair.
 * > Records are the wrong unit because a settlement with 40 constituents is one
 * > record and forty independent claims."*
 *
 * ```
 *   TP = edges present in both agent output and ground truth
 *   FP = edges asserted by the agent, absent from ground truth
 *   FN = edges in ground truth, not asserted (excluding abstained/excepted)
 *
 *   match_precision = TP / (TP + FP)
 *   match_recall    = TP / (TP + FN)
 * ```
 *
 * **The parenthesis in `FN` is load-bearing and is implemented, not assumed.**
 * A true edge whose entity the agent abstained on or raised an exception on is
 * **not** a false negative: `§4.5` already prices that decision at `C_review` or
 * `C_exception`, and `§4.4` already restricts harm to the covered set. Counting
 * it here as well would charge one abstention twice — the defect `§4.4` records
 * itself correcting at benchmark v1.0.2, in a metric that had summed over the
 * whole run.
 *
 * **This module reads ground truth**, through `truth.ts`'s {@link ScoringTruth}
 * projection. `PREREGISTRATION.md §6.2` `AL1`/`AL2` bind the engine and the
 * oracle; a scorer that could not see the answer key could not mark the paper.
 */

import type { AgentRun } from "../run.js";
import type { ScoringTruth, TrueEdge } from "../truth.js";

/** Metric 5's three quantities, with the counts they came from. */
export interface MatchReport {
  readonly true_positives: number;
  readonly false_positives: number;
  readonly false_negatives: number;
  readonly match_precision: number;
  readonly match_recall: number;
  readonly match_f1: number;
  /**
   * True edges neither asserted nor counted against recall, because their entity
   * reached `ABSTAINED` or `EXCEPTION`.
   *
   * Reported rather than silently dropped: it is the size of the exclusion the
   * `FN` definition carries, and a reader who cannot see it cannot tell a
   * high recall from a narrow denominator.
   */
  readonly excluded_unresolved: number;
}

/**
 * A canonical key for one edge.
 *
 * `|` as the separator, following `DATA_MODEL.md §22.2` M35's canonical
 * allocation key, which serialises the same pair as `target_id | member_obs_id`.
 * Every id matches `^prefix_[A-Za-z0-9]{14}$`, so the separator cannot occur
 * inside one and the encoding is injective.
 */
const edgeKey = (edge: { entity_id: string; target_id: string }): string =>
  `${edge.entity_id}|${edge.target_id}`;

/**
 * Score one run's allocation edges against ground truth.
 *
 * @param run      the agent's product.
 * @param truth    the projected ground truth (`truth.ts`).
 * @param unresolved the entities whose observation reached `ABSTAINED` or
 *   `EXCEPTION`. Supplied rather than derived because
 *   {@link AgentRun.outcomes} keys on `obs_id` while an edge keys on
 *   `entity_id`, and the join between them is the dataset's, not this
 *   function's. {@link unresolvedEntityIds} builds it from the records that
 *   already carry `source_entity_id`.
 */
export function matchMetrics(
  run: AgentRun,
  truth: ScoringTruth,
  unresolved: ReadonlySet<string>,
): MatchReport {
  const asserted = new Set(run.allocations.map(edgeKey));
  const trueKeys = new Set(truth.edges.map(edgeKey));

  let truePositives = 0;
  let falsePositives = 0;
  for (const key of asserted) {
    if (trueKeys.has(key)) truePositives += 1;
    else falsePositives += 1;
  }

  let falseNegatives = 0;
  let excluded = 0;
  for (const edge of truth.edges) {
    if (asserted.has(edgeKey(edge))) continue;
    if (unresolved.has(edge.entity_id)) excluded += 1;
    else falseNegatives += 1;
  }

  const precision = rate(truePositives, truePositives + falsePositives);
  const recall = rate(truePositives, truePositives + falseNegatives);
  return Object.freeze({
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    match_precision: precision,
    match_recall: recall,
    // The harmonic mean, `0` where both are `0`. `§8` metric 5 names `match_f1`
    // without writing its formula; the harmonic mean of precision and recall is
    // what F1 denotes, so nothing is chosen here.
    match_f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    excluded_unresolved: excluded,
  });
}

/**
 * The entities `§4.2`'s `FN` clause excludes: abstained or excepted.
 *
 * Both record types already key on `source_entity_id` — `DATA_MODEL.md §20`
 * makes it the open-Suspense-item key and `§1` calls it *"the JOIN KEY for
 * covered-set projection"* — so this is a read of two fields rather than a join
 * this module invents.
 */
export function unresolvedEntityIds(run: AgentRun): ReadonlySet<string> {
  const out = new Set<string>();
  for (const abstention of run.abstentions) out.add(abstention.source_entity_id);
  for (const exception of run.open_exceptions) out.add(exception.source_entity_id);
  return out;
}

/** The entities the agent committed on — `§4.4`'s covered set, keyed for projection. */
export function coveredEntityIds(run: AgentRun): ReadonlySet<string> {
  return new Set(run.allocations.map((edge) => edge.entity_id));
}

/** The true target of each entity, for `§4.4`(b). Re-exported for one import site. */
export function trueEdgeKeys(edges: readonly TrueEdge[]): ReadonlySet<string> {
  return new Set(edges.map(edgeKey));
}

const rate = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;
