import { describe, expect, it } from "vitest";

import {
  CALIBRATION_BINS,
  EPSILON_BPS,
  allocationIdentityCorrect,
  calibration,
  calibrationPredictions,
  matchMetrics,
  metric7Calibration,
  unresolvedEntityIds,
  type CommittedDecision,
  type ScoringTruth,
} from "../src/index.js";
import { BNK, PAY, RFND, SETL, abstention, agentRun, edge, openException } from "./fixtures.js";

/**
 * Metric 7's population, prediction and correctness predicate —
 * `DATA_MODEL.md §22.2` **M57**, ratified at spec 1.4.35.
 *
 * `EVALUATION_SPEC.md §4.6` froze the formula, the ten equal-width bins, the
 * reliability diagram and the ε-gap scope, and named `accuracy(bin)` without
 * stating what makes a committed decision right. This suite owns the part `M57`
 * supplied; `metrics.test.ts`'s `§4.6 calibration` block still owns
 * `calibration()`'s own arithmetic, which `M57` confirms rather than moves.
 *
 * **No benchmark data, no dataset and no agent.** Every `AgentRun` and
 * `ScoringTruth` below is a literal; nothing is written to `bench/` or `runs/`.
 */

/** `truth(d)` for one target, in the shape `ScoringTruth` carries. */
const truthOf = (edges: readonly { entity_id: string; target_id: string }[]): ScoringTruth =>
  ({ edges, journal: [] });

const decision = (
  targetId: string,
  members: readonly string[],
  scoreBps: number | null,
): CommittedDecision => ({
  target_id: targetId,
  member_entity_ids: members,
  score_bps: scoreBps,
});

/** `SETL(1)` truly holds two members; `SETL(2)` holds one. */
const TRUTH = truthOf([
  { entity_id: PAY(1), target_id: SETL(1) },
  { entity_id: PAY(2), target_id: SETL(1) },
  { entity_id: PAY(3), target_id: SETL(2) },
]);

describe("M57 — metric 7's population is §6 step 3's DISCRIMINATED branch", () => {
  it("includes a committed decision that carries a score, and only that", () => {
    // `run.ts` makes score_bps non-null EXACTLY on DISCRIMINATED, so the field's
    // nullity IS the population test. Each row below is one §6 step 3 outcome.
    const run = agentRun({
      decisions: [
        // DISCRIMINATED — the gap decided the accept. IN.
        decision(SETL(1), [PAY(1), PAY(2)], 9_000),
        // UNIQUE — no second solution, so no gap exists at all. OUT.
        decision(SETL(2), [PAY(3)], null),
        // IMMATERIALLY_AMBIGUOUS — §6 tests materiality FIRST and never consults
        // the gap, so the agent carries null even though a gap was computed. OUT.
        decision(BNK(4), [SETL(2)], null),
        // An agent with no solve at all (B0-IDONLY joins on an identifier). OUT.
        decision(SETL(5), [PAY(5)], null),
      ],
    });
    const predictions = calibrationPredictions(run, TRUTH);
    expect(predictions).toHaveLength(1);
    expect(predictions[0]?.score_bps).toBe(9_000);
  });

  it("excludes AMBIGUOUS and INTRACTABLE, which commit no decision at all", () => {
    // An AMBIGUOUS target abstains and reaches `abstentions`; INTRACTABLE commits
    // nothing. Neither is in `decisions`, so neither can reach the population —
    // and metric 4, not metric 7, is where the abstain side is scored.
    const run = agentRun({
      decisions: [],
      abstentions: [abstention(PAY(1), 1_000_000)],
      open_exceptions: [openException(PAY(2), "E04_SETTLEMENT_NOT_IN_BANK", 500_000)],
    });
    expect(calibrationPredictions(run, TRUTH)).toHaveLength(0);
    expect(metric7Calibration(run, TRUTH)).toBeNull();
  });

  it("invents no score for a decision that carries none (§5.5)", () => {
    // M57 rejects "including UNIQUE decisions with an invented score" by name: a
    // substituted 10_000, or a 0, is the fabricated number §5.5 forbids.
    const run = agentRun({ decisions: [decision(SETL(1), [PAY(1), PAY(2)], null)] });
    expect(calibrationPredictions(run, TRUTH)).toHaveLength(0);
    expect(metric7Calibration(run, TRUTH)).toBeNull();
  });
});

describe("M57 — the binned value is Δs, and one decision is one prediction", () => {
  it("bins the decision's own score_bps, which is Δs and not evidence_score_bps", () => {
    // §6 compares ε against the GAP and against nothing else, so calibrating the
    // score itself would justify no threshold. The value binned is whatever the
    // gate recorded as its gap; nothing here reads a candidate's own score.
    const gap = EPSILON_BPS + 500;
    const run = agentRun({ decisions: [decision(SETL(1), [PAY(1), PAY(2)], gap)] });
    const predictions = calibrationPredictions(run, TRUTH);
    expect(predictions[0]?.score_bps).toBe(gap);
    // A gap at ε is admissible and ordinary; a DISCRIMINATED gap is >= ε.
    expect(predictions[0]?.score_bps).toBeGreaterThanOrEqual(EPSILON_BPS);
  });

  it("counts a 40-member allocation ONCE, not once per member", () => {
    // §11 makes the score a property of a Candidate — a whole allocation — and
    // the gate fires once per decision, so N counts gate events. An edge unit
    // would weight n_bin/N by allocation size, which M57 rejects by name.
    const members = Array.from({ length: 40 }, (_, i) => PAY(100 + i));
    const wide = truthOf(members.map((m) => ({ entity_id: m, target_id: SETL(9) })));
    const run = agentRun({ decisions: [decision(SETL(9), members, 5_000)] });
    const predictions = calibrationPredictions(run, wide);
    expect(predictions).toHaveLength(1);
    expect(metric7Calibration(run, wide)?.n).toBe(1);
  });
});

describe("M57 — correctness is SET EQUALITY on the allocation", () => {
  const correctnessOf = (members: readonly string[], target = SETL(1)): boolean => {
    const run = agentRun({ decisions: [decision(target, members, 5_000)] });
    return calibrationPredictions(run, TRUTH)[0]?.correct ?? false;
  };

  it("an exact match is correct", () => {
    expect(correctnessOf([PAY(1), PAY(2)])).toBe(true);
  });

  it("a STRICT SUBSET of the true member set is INCORRECT", () => {
    // The case the two admissible readings disagreed on. Under edge-level
    // agreement this decision has no false positive and would count as right;
    // M57 ratifies set equality, so it is wrong.
    expect(correctnessOf([PAY(1)])).toBe(false);
  });

  it("a SUPERSET of the true member set is INCORRECT", () => {
    expect(correctnessOf([PAY(1), PAY(2), PAY(3)])).toBe(false);
  });

  it("a non-empty assertion against a target absent from truth is INCORRECT", () => {
    // "a target the truth carries no edge for gives truth(d) = the empty set".
    expect(correctnessOf([PAY(1)], SETL(77))).toBe(false);
  });

  it("an EMPTY assertion is correct only against a true empty allocation", () => {
    expect(correctnessOf([], SETL(77))).toBe(true);
    expect(correctnessOf([], SETL(1))).toBe(false);
  });

  it("compares member_entity_ids as a SET, so a repeated member is not a miss", () => {
    expect(correctnessOf([PAY(1), PAY(2), PAY(1)])).toBe(true);
  });

  it("scopes truth(d) to the decision's OWN target", () => {
    // PAY(3) is a true member of SETL(2), never of SETL(1). Asserting it against
    // SETL(1) is wrong even though the edge exists somewhere in the truth.
    const trueMembers = new Map([[SETL(1), new Set([PAY(1), PAY(2)])]]);
    expect(allocationIdentityCorrect(decision(SETL(1), [PAY(3)], 1), trueMembers)).toBe(false);
  });
});

describe("M57 — what §4.2 keeps, metric 7 does not take", () => {
  it("does NOT use edge-level partial credit", () => {
    // Two of three true members asserted. §4.2 scores 2 TP and 0 FP — a
    // match_precision of 1.0 — while M57 scores the DECISION wrong. Metric 5
    // remains the metric that reports partial credit, and its numbers are
    // untouched here.
    const truth = truthOf([
      { entity_id: PAY(1), target_id: SETL(1) },
      { entity_id: PAY(2), target_id: SETL(1) },
      { entity_id: PAY(3), target_id: SETL(1) },
    ]);
    const run = agentRun({
      allocations: [edge(PAY(1), SETL(1)), edge(PAY(2), SETL(1))],
      decisions: [decision(SETL(1), [PAY(1), PAY(2)], 9_000)],
    });
    const match = matchMetrics(run, truth, unresolvedEntityIds(run));
    expect(match.true_positives).toBe(2);
    expect(match.false_positives).toBe(0);
    expect(match.match_precision).toBe(1);
    // Same run, same truth: metric 7 calls the decision wrong.
    expect(calibrationPredictions(run, truth)[0]?.correct).toBe(false);
  });

  it("does NOT import §4.2's abstained/excepted FN exclusion", () => {
    // §4.2 excuses a true edge whose entity abstained, because §4.5 already
    // prices that abstention. Metric 7 prices nothing, and importing the
    // exclusion would make one decision's correctness depend on the agent's
    // OTHER decisions — so the decision below stays wrong however PAY(2) ended.
    const truth = truthOf([
      { entity_id: PAY(1), target_id: SETL(1) },
      { entity_id: PAY(2), target_id: SETL(1) },
    ]);
    const run = agentRun({
      allocations: [edge(PAY(1), SETL(1))],
      decisions: [decision(SETL(1), [PAY(1)], 9_000)],
      abstentions: [abstention(PAY(2), 1_000_000)],
    });
    // §4.2's parenthesis fires: recall is 1.0 and the missed edge is excluded.
    const match = matchMetrics(run, truth, unresolvedEntityIds(run));
    expect(match.false_negatives).toBe(0);
    expect(match.excluded_unresolved).toBe(1);
    expect(match.match_recall).toBe(1);
    // Metric 7 does not follow it.
    expect(calibrationPredictions(run, truth)[0]?.correct).toBe(false);
  });

  it("scores two agents asserting the identical allocation identically", () => {
    // The comparability argument, made executable: importing §4.2's exclusion
    // would let these two disagree because their OTHER decisions differ.
    const truth = truthOf([
      { entity_id: PAY(1), target_id: SETL(1) },
      { entity_id: PAY(2), target_id: SETL(1) },
    ]);
    const asserted = decision(SETL(1), [PAY(1)], 9_000);
    const abstains = agentRun({ decisions: [asserted], abstentions: [abstention(PAY(2), 1)] });
    const excepts = agentRun({
      decisions: [asserted],
      open_exceptions: [openException(PAY(2), "E04_SETTLEMENT_NOT_IN_BANK", 1)],
    });
    expect(calibrationPredictions(abstains, truth)[0]?.correct)
      .toBe(calibrationPredictions(excepts, truth)[0]?.correct);
  });
});

describe("M57 — the bins are §4.6's, confirmed and not moved", () => {
  const at = (scoreBps: number): number | undefined => {
    const run = agentRun({ decisions: [decision(SETL(1), [PAY(1), PAY(2)], scoreBps)] });
    return metric7Calibration(run, TRUTH)?.bins.findIndex((b) => b.count === 1);
  };

  it("puts each boundary score in §4.6's ten fixed bins over the full range", () => {
    // Lower edge inclusive, upper exclusive, EXCEPT the tenth which includes
    // 10_000. Ten bins of 1000 bps over 0..10_000, never the observed spread.
    expect(at(0)).toBe(0);
    expect(at(999)).toBe(0);
    expect(at(1_000)).toBe(1);
    expect(at(9_999)).toBe(9);
    expect(at(10_000)).toBe(9);
  });

  it("reports ten bins whatever the population, so the diagram is comparable", () => {
    const run = agentRun({ decisions: [decision(SETL(1), [PAY(1), PAY(2)], 100)] });
    const report = metric7Calibration(run, TRUTH);
    expect(report?.bins).toHaveLength(CALIBRATION_BINS);
    expect(report?.bins[0]?.lower_bps).toBe(0);
    expect(report?.bins[9]?.upper_bps).toBe(10_000);
  });

  it("lets an empty bin contribute no term to the sum", () => {
    // One correct prediction at 9_000 bps: |1 - 0.9| weighted by 1/1. The nine
    // empty bins contribute nothing rather than an |0 - 0| term with weight 0.
    const run = agentRun({ decisions: [decision(SETL(1), [PAY(1), PAY(2)], 9_000)] });
    const report = metric7Calibration(run, TRUTH);
    expect(report?.ece).toBeCloseTo(0.1, 10);
    expect(report?.bins.filter((b) => b.count > 0)).toHaveLength(1);
  });
});

describe("M57 — N = 0 is a state, never a 0.0", () => {
  it("returns null over an empty population rather than calibration()'s 0", () => {
    // calibration([]) answers 0 — the BEST possible ECE — which is exactly the
    // number §5.5 forbids standing in for a figure no artifact holds. The
    // arithmetic is right for the input; refusing to form the input is M57's.
    expect(calibration([]).ece).toBe(0);
    expect(metric7Calibration(agentRun(), TRUTH)).toBeNull();
  });

  it("distinguishes an empty population from a population that is all wrong", () => {
    const wrong = agentRun({ decisions: [decision(SETL(1), [RFND(9)], 10_000)] });
    const report = metric7Calibration(wrong, TRUTH);
    expect(report).not.toBeNull();
    expect(report?.n).toBe(1);
    expect(report?.ece).toBeCloseTo(1, 10);
  });
});

describe("M57 — set equality moves the figure, which is why it was ratified", () => {
  it("gives a different ECE from the rejected edge-level reading", () => {
    // Ten decisions at 10_000 bps, each asserting a strict SUBSET of its
    // target's two true members. Under M57 every one is wrong, so accuracy = 0
    // and ECE = |0 - 1| = 1. Under the rejected edge-level reading every
    // asserted edge is true, so accuracy would be 1 and ECE 0. The two readings
    // disagree by the whole range of the metric on exactly the case §A.42 names.
    const targets = Array.from({ length: 10 }, (_, i) => SETL(200 + i));
    const truth = truthOf(
      targets.flatMap((t, i) => [
        { entity_id: PAY(200 + i), target_id: t },
        { entity_id: PAY(300 + i), target_id: t },
      ]),
    );
    const run = agentRun({
      decisions: targets.map((t, i) => decision(t, [PAY(200 + i)], 10_000)),
    });
    const predictions = calibrationPredictions(run, truth);
    expect(predictions).toHaveLength(10);
    expect(predictions.every((p) => !p.correct)).toBe(true);
    expect(metric7Calibration(run, truth)?.ece).toBeCloseTo(1, 10);
    // The edge-level reading, computed here only to show it differs.
    expect(calibration(predictions.map((p) => ({ ...p, correct: true }))).ece)
      .toBeCloseTo(0, 10);
  });
});
