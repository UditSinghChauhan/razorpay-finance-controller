/**
 * Metric 7's population and correctness predicate — `DATA_MODEL.md §22.2`
 * **M57**, ratified at spec 1.4.35.
 *
 * `EVALUATION_SPEC.md §4.6` froze metric 7's formula, its ten equal-width bins,
 * its reliability diagram and its ε-gap scope, and named `accuracy(bin)`
 * **without ever stating what makes one committed decision right**. `M57`
 * supplies the three things that were missing, and this module is all three:
 *
 * ```
 *   POPULATION    the run's COMMITTED decisions carrying a non-null score --
 *                 RECONCILIATION_SPEC.md §6 step 3's DISCRIMINATED branch, the
 *                 one accept in which the ε-gap decided the gate.
 *   PREDICTION    ONE COMMITTED DECISION = ONE PREDICTION. N counts gate events.
 *   CORRECTNESS   assert(d) = { (d.target_id, e) : e a member entity of d }
 *                 truth(d)  = { (target_id, entity_id) : a TRUE allocation edge
 *                               whose target_id = d.target_id }
 *                 correct(d) iff assert(d) = truth(d)        SET EQUALITY
 * ```
 *
 * **This module owns the input; `calibration.ts` owns the arithmetic, and it is
 * not touched.** `calibration()` already takes `ScoredPrediction { score_bps,
 * correct }` and already owns `CALIBRATION_BINS`, the full `0..10_000` bin
 * edges, the last bin's inclusive top and the empty-bin rule — every one of
 * which `M57` confirms unchanged. What `§4.6` never supplied is the `correct`
 * flag, so that is the only thing built here.
 *
 * **Why the unit is the decision and not the edge.** `DATA_MODEL.md §11` makes
 * `evidence_score_bps` a property of a `Candidate` — *"It orders candidates and
 * feeds the ε-margin ambiguity test"* — and a `Candidate` is a whole allocation,
 * `(target_id, member_obs_ids)`. **No frozen field carries a per-edge score**, and
 * `RECONCILIATION_SPEC.md §6`'s gate fires once per decision. Binning an edge
 * would replicate one gate event into as many predictions as the allocation has
 * members and weight `n_bin / N` by allocation size, which is the unit confusion
 * `EVALUATION_SPEC.md §4.2` warns against running in the other direction: `§4.2`
 * chose the **edge** for a set-membership metric, and metric 7's unit is fixed by
 * what carries the score.
 *
 * **`§4.2` is read and not substituted.** `metrics/match.ts` keeps `§4.2`'s edge
 * unit, its `FP`/`FN` clauses and its *"(excluding abstained/excepted)"*
 * parenthesis, and metric **5** remains the metric that reports partial credit.
 * That parenthesis is deliberately **not imported** here: its rationale is cost
 * double-counting — *"`§4.5` already prices that decision at `C_review` or
 * `C_exception`"* — and metric 7 prices nothing, while importing it would make
 * one decision's correctness a function of the agent's **other** decisions, so two
 * agents asserting an identical allocation against identical truth could be
 * scored differently.
 *
 * **This module reads ground truth**, through `truth.ts`'s {@link ScoringTruth}
 * projection and no other route. `PREREGISTRATION.md §6.2` `AL1`/`AL2` bind the
 * engine and the oracle; a scorer that could not see the answer key could not
 * mark the paper.
 */

import type { AgentRun, CommittedDecision } from "../run.js";
import type { ScoringTruth } from "../truth.js";
import { calibration, type CalibrationReport, type ScoredPrediction } from "./calibration.js";

/**
 * `truth(d)`, indexed once per run rather than rebuilt per decision.
 *
 * The value is the set of **entity ids** the truth allocates to that target.
 * `M57` writes both sides as `(target_id, entity_id)` pairs; every pair on one
 * side of the comparison carries the same `target_id`, so equality of the pair
 * sets is equality of the entity sets under that key, and indexing by target is
 * the same comparison with the constant factored out.
 *
 * A target absent from the map has `truth(d) = ∅`, which is `M57`'s own
 * treatment: *"a target the truth carries no edge for gives `truth(d) = ∅`, so
 * any non-empty assertion against it is INCORRECT"*.
 */
function trueMembersByTarget(truth: ScoringTruth): ReadonlyMap<string, ReadonlySet<string>> {
  const byTarget = new Map<string, Set<string>>();
  for (const edge of truth.edges) {
    const members = byTarget.get(edge.target_id);
    if (members === undefined) byTarget.set(edge.target_id, new Set([edge.entity_id]));
    else members.add(edge.entity_id);
  }
  return byTarget;
}

/**
 * `M57`'s correctness predicate for one committed decision — **set equality**.
 *
 * This is `DATA_MODEL.md §22.2` **M35**'s *"allocation identity — the set of
 * `(target_id, member_obs_id)` pairs the solution asserts"*, applied as a
 * **comparison** rather than as the sort key `M35` used it for. Nothing new is
 * introduced: `target_id` and the member entities are `§11` fields and the truth
 * side is `§1`'s `allocations` and `bank_mappings` as `truth.ts` already projects
 * them.
 *
 * The four cases `M57` settles exhaustively all fall out of the one comparison:
 * a **strict subset** of the true member set is incorrect, a **superset** is
 * incorrect, an assertion against a target the truth carries no edge for is
 * incorrect unless it is **empty**, and an **empty** assertion is correct only
 * against a true empty allocation.
 *
 * `member_entity_ids` is compared as a **set**, so a repeated member collapses
 * rather than making an otherwise-exact allocation unequal by multiplicity:
 * `assert(d)` is a set in `M57`'s own notation.
 */
export function allocationIdentityCorrect(
  decision: CommittedDecision,
  trueMembers: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const asserted = new Set(decision.member_entity_ids);
  const actual = trueMembers.get(decision.target_id) ?? EMPTY_MEMBERS;
  if (asserted.size !== actual.size) return false;
  for (const entityId of asserted) if (!actual.has(entityId)) return false;
  return true;
}

const EMPTY_MEMBERS: ReadonlySet<string> = Object.freeze(new Set<string>());

/**
 * `M57`'s population, as the predictions `calibration()` takes.
 *
 * **One prediction per committed decision whose `score_bps` is non-null.** That
 * field's nullity **is** the population test: `run.ts` requires an agent to carry
 * a score on `§6` step 3's `DISCRIMINATED` branch and `null` everywhere else, so
 * a `UNIQUE` decision (no second solution, therefore no gap), an
 * `IMMATERIALLY_AMBIGUOUS` one (settled by the materiality clause before the gap
 * was consulted) and a decision from an agent with no solve at all are each
 * excluded **by carrying no score** rather than by a second rule stated here. An
 * `AMBIGUOUS` decision abstains and never reaches `AgentRun.decisions`;
 * `INTRACTABLE` commits nothing.
 *
 * **No score is invented for a decision that carries none.** `EVALUATION_SPEC.md
 * §5.5` bars *"any number that does not exist in a committed run artifact"*, and
 * `M57` rejects supplying one for a `UNIQUE` decision by name.
 *
 * The binned value is that decision's own `score_bps` — `Δs`,
 * `|evidence_score_bps(best) − evidence_score_bps(second)|` in integer basis
 * points, which `DATA_MODEL.md §13` carries as `evidence_score_gap_bps`. It is
 * **not** `evidence_score_bps` itself: `ε` is compared against the gap and
 * against nothing else, so calibrating the score would justify no threshold, and
 * `M57` rejects that reading by name.
 */
export function calibrationPredictions(
  run: AgentRun,
  truth: ScoringTruth,
): readonly ScoredPrediction[] {
  const trueMembers = trueMembersByTarget(truth);
  const predictions: ScoredPrediction[] = [];
  for (const decision of run.decisions) {
    if (decision.score_bps === null) continue;
    predictions.push(
      Object.freeze({
        score_bps: decision.score_bps,
        correct: allocationIdentityCorrect(decision, trueMembers),
      }),
    );
  }
  return Object.freeze(predictions);
}

/**
 * Metric 7 for one scored unit, or `null` where `M57`'s population is empty.
 *
 * **`N = 0` is a state, not a zero, and that is why this returns `null`.**
 * `calibration([])` answers `0` — the best possible `ECE` — which is exactly the
 * number `EVALUATION_SPEC.md §5.5` forbids standing in for a figure no artifact
 * holds, and which `M56` refused for the same reason when it rejected emitting
 * `0.0` for an unavailable metric. `calibration.ts` is correct to answer over the
 * predictions it is given; deciding that *no* prediction is not a measurement is
 * this module's, and the reason a reader sees is the caller's to attach.
 *
 * Where the population is non-empty the report is `calibration()`'s own, whole:
 * `ece`, `n`, and the ten `bins` that are `§4.6`'s **reliability diagram**. The
 * diagram travels with its headline figure rather than being recomputed by a
 * reporter, which is what `§4.6` requires by putting the two in one sentence.
 */
export function metric7Calibration(
  run: AgentRun,
  truth: ScoringTruth,
): CalibrationReport | null {
  const predictions = calibrationPredictions(run, truth);
  if (predictions.length === 0) return null;
  return calibration(predictions);
}
