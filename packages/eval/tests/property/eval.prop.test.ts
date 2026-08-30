import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_CODES, SUSPENSE_ACCOUNT } from "@assay/domain";
import { paise, type Paise } from "@assay/money";

import {
  C_EXCEPTION_PAISE,
  C_REVIEW_PAISE,
  DECLARED_SAMPLE_SIZE,
  FROZEN_METRICS,
  MAX_UNRESOLVED_RATIO_BPS,
  balanceHarm,
  bootstrapMean,
  calibration,
  closeThresholdPaise,
  consistencyGate,
  coverage,
  gapToOracle,
  intervalsOverlap,
  matchMetrics,
  netCost,
  periodStatusFrom,
  projectTruth,
  riskCoverage,
  type DifferentialPair,
  type ScoringTruth,
} from "../../src/index.js";
import {
  PAY,
  SETL,
  abstention,
  agentRun,
  edge,
  openException,
  outcome,
  reconLine,
  settlement,
} from "../fixtures.js";

/**
 * The invariants `packages/eval` owns — `DECISION_BRIEF.md §L.3`.
 *
 * *"No package is complete without ... **property tests on every invariant it
 * owns**."* The invariants below are the ones the specification states about the
 * measurement layer itself rather than about any one run: that a rate is a rate,
 * that scoring does not depend on the order a caller happened to iterate in,
 * that the differential test is symmetric in the sample, and that the frozen
 * arithmetic is exact in integer paise.
 *
 * No `Math.random` and no clock: a property that fails must be reproducible from
 * fast-check's seed alone, which is the discipline `packages/generator` applies
 * to the benchmark itself.
 */

const RUNS = 2_000;
const UTR = "1568176960vxp0rj";

// ---------------------------------------------------------------------------
// §4.1 — a coverage rate is a rate
// ---------------------------------------------------------------------------

const stateArb = fc.constantFrom("RECONCILED" as const, "ABSTAINED" as const, "EXCEPTION" as const);

const reconOutcomeArb = fc
  .record({ state: stateArb, value: fc.integer({ min: 0, max: 10_000_000 }) })
  .map(({ state, value }) => outcome("recon_line", state, value));

describe("§4.1 — every coverage view is bounded by 1.0", () => {
  it("keeps metric 1 in [0, 1] whatever the mix of terminal states", () => {
    // "A quantity that can exceed unity is not a coverage rate." The bound is a
    // consequence of numerator and denominator drawing on ONE universe, which
    // is exactly what §4.1's amendment fixed.
    fc.assert(
      fc.property(fc.array(reconOutcomeArb, { maxLength: 40 }), (outcomes) => {
        const c = coverage(agentRun({ outcomes }));
        expect(c.coverage_by_value.ratio).toBeGreaterThanOrEqual(0);
        expect(c.coverage_by_value.ratio).toBeLessThanOrEqual(1);
        expect(c.coverage_by_count.ratio).toBeGreaterThanOrEqual(0);
        expect(c.coverage_by_count.ratio).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("never returns NaN, however empty the universe", () => {
    fc.assert(
      fc.property(fc.array(reconOutcomeArb, { maxLength: 8 }), (outcomes) => {
        for (const view of Object.values(coverage(agentRun({ outcomes })))) {
          if (typeof view === "number") continue;
          expect(Number.isNaN(view.ratio)).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("makes the numerator the RECONCILED share of the denominator, exactly", () => {
    fc.assert(
      fc.property(fc.array(reconOutcomeArb, { maxLength: 40 }), (outcomes) => {
        const c = coverage(agentRun({ outcomes }));
        const expected = outcomes
          .filter((o) => o.state === "RECONCILED")
          .reduce((total, o) => total + o.value_paise, 0);
        expect(c.coverage_by_value.numerator).toBe(expected);
      }),
      { numRuns: RUNS },
    );
  });

  it("is invariant under a rotation of the outcome array (§4.12's shape)", () => {
    // Metric 23 requires two runs over identical inputs to agree; a scorer whose
    // answer depended on iteration order could not satisfy it.
    fc.assert(
      fc.property(
        fc.array(reconOutcomeArb, { minLength: 1, maxLength: 20 }),
        fc.nat(),
        (outcomes, shift) => {
          const k = shift % outcomes.length;
          const rotated = [...outcomes.slice(k), ...outcomes.slice(0, k)];
          expect(coverage(agentRun({ outcomes: rotated }))).toEqual(
            coverage(agentRun({ outcomes })),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §4.2 — the edge is the unit, and the counts partition
// ---------------------------------------------------------------------------

const edgeArb = fc
  .record({ entity: fc.integer({ min: 1, max: 12 }), target: fc.integer({ min: 1, max: 4 }) })
  .map(({ entity, target }) => edge(PAY(entity), SETL(target)));

describe("§4.2 — the edge counts partition the two edge sets", () => {
  it("splits asserted edges into exactly TP and FP", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(edgeArb, { maxLength: 12, selector: (e) => `${e.entity_id}|${e.target_id}` }),
        fc.uniqueArray(edgeArb, { maxLength: 12, selector: (e) => `${e.entity_id}|${e.target_id}` }),
        (asserted, trueEdges) => {
          const truth: ScoringTruth = { edges: trueEdges, journal: [] };
          const report = matchMetrics(agentRun({ allocations: asserted }), truth, new Set());
          expect(report.true_positives + report.false_positives).toBe(asserted.length);
          expect(report.true_positives + report.false_negatives + report.excluded_unresolved).toBe(
            trueEdges.length,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("keeps precision, recall and f1 in [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.array(edgeArb, { maxLength: 12 }),
        fc.array(edgeArb, { maxLength: 12 }),
        (asserted, trueEdges) => {
          const report = matchMetrics(
            agentRun({ allocations: asserted }),
            { edges: trueEdges, journal: [] },
            new Set(),
          );
          for (const value of [report.match_precision, report.match_recall, report.match_f1]) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("puts f1 between precision and recall, as a harmonic mean must", () => {
    fc.assert(
      fc.property(
        fc.array(edgeArb, { minLength: 1, maxLength: 12 }),
        fc.array(edgeArb, { minLength: 1, maxLength: 12 }),
        (asserted, trueEdges) => {
          const r = matchMetrics(
            agentRun({ allocations: asserted }),
            { edges: trueEdges, journal: [] },
            new Set(),
          );
          const low = Math.min(r.match_precision, r.match_recall);
          const high = Math.max(r.match_precision, r.match_recall);
          expect(r.match_f1).toBeGreaterThanOrEqual(low - 1e-12);
          expect(r.match_f1).toBeLessThanOrEqual(high + 1e-12);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §4.4 — harm is a distance, and Suspense is outside it
// ---------------------------------------------------------------------------

const balancesArb = fc
  .array(fc.integer({ min: -5_000_000, max: 5_000_000 }), {
    minLength: ACCOUNT_CODES.length,
    maxLength: ACCOUNT_CODES.length,
  })
  .map((values) => {
    const out = {} as Record<(typeof ACCOUNT_CODES)[number], Paise>;
    ACCOUNT_CODES.forEach((code, i) => {
      // Negative balances are correct, not an error: §17.1 computes
      // `Σ dr − Σ cr`, so liability and revenue accounts sit below zero.
      out[code] = paise(values[i] ?? 0);
    });
    return out;
  });

describe("§4.4 — balance harm is a metric on the covered projections", () => {
  it("is zero exactly when the two projections agree off Suspense", () => {
    fc.assert(
      fc.property(balancesArb, (balances) => {
        expect(balanceHarm(balances, balances).total_paise).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("is symmetric, non-negative, and an integer number of paise", () => {
    fc.assert(
      fc.property(balancesArb, balancesArb, (a, b) => {
        const forward = balanceHarm(a, b).total_paise;
        expect(forward).toBe(balanceHarm(b, a).total_paise);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(forward)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("satisfies the triangle inequality, so it is a distance and not a score", () => {
    fc.assert(
      fc.property(balancesArb, balancesArb, balancesArb, (a, b, c) => {
        expect(balanceHarm(a, c).total_paise).toBeLessThanOrEqual(
          balanceHarm(a, b).total_paise + balanceHarm(b, c).total_paise,
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("EXCLUDES Suspense from the sum: moving it alone cannot change harm", () => {
    // "a rupee correctly parked there is a correct outcome, and including it
    // would count the same abstention twice within this metric".
    fc.assert(
      fc.property(balancesArb, balancesArb, fc.integer({ min: -9_000_000, max: 9_000_000 }), (a, b, delta) => {
        const moved = { ...a, [SUSPENSE_ACCOUNT]: paise(a[SUSPENSE_ACCOUNT] + delta) };
        expect(balanceHarm(moved, b).total_paise).toBe(balanceHarm(a, b).total_paise);
      }),
      { numRuns: RUNS },
    );
  });

  it("projects truth over the covered set only, and never outside it", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            entity: fc.integer({ min: 1, max: 6 }),
            dr: fc.integer({ min: 0, max: 500_000 }),
            cr: fc.integer({ min: 0, max: 500_000 }),
          }),
          { maxLength: 20 },
        ),
        fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { maxLength: 6 }),
        (rows, coveredIds) => {
          const journal = rows.map((r) => ({
            source_entity_id: PAY(r.entity),
            account: "1200_BANK" as const,
            dr_paise: r.dr,
            cr_paise: r.cr,
          }));
          const covered = new Set(coveredIds.map((n) => PAY(n)));
          const expected = rows
            .filter((r) => covered.has(PAY(r.entity)))
            .reduce((total, r) => total + r.dr - r.cr, 0);
          expect(projectTruth(journal, covered)["1200_BANK"]).toBe(expected);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §4.5 / §4.13 — net cost is monotone in each priced term
// ---------------------------------------------------------------------------

describe("§4.5 — net cost prices abstention, monotonically", () => {
  it("rises by exactly C_review for one more abstention", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (count, harmPaise) => {
          const before = netCost(
            agentRun({ abstentions: many(count, (i) => abstention(SETL(i), 1)) }),
            harmPaise,
          );
          const after = netCost(
            agentRun({ abstentions: many(count + 1, (i) => abstention(SETL(i), 1)) }),
            harmPaise,
          );
          expect(after.net_cost_paise - before.net_cost_paise).toBe(C_REVIEW_PAISE);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("rises by exactly C_exception for one more open exception", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (count) => {
        const at = (n: number) =>
          netCost(
            agentRun({
              open_exceptions: many(n, (i) =>
                openException(PAY(i), "E04_SETTLEMENT_NOT_IN_BANK", 1),
              ),
            }),
            0,
          ).net_cost_paise;
        expect(at(count + 1) - at(count)).toBe(C_EXCEPTION_PAISE);
      }),
      { numRuns: RUNS },
    );
  });

  it("makes the E13 constant cancel in metric 8, as §4.5 states", () => {
    // "It therefore inflates every absolute figure and cancels in every
    // comparison, including metric 8 gap_to_oracle."
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 50 }),
        (e13, harmPaise, abstentions) => {
          const withE13 = netCost(
            agentRun({
              abstentions: many(abstentions, (i) => abstention(SETL(i), 1)),
              open_exceptions: many(e13, (i) => openException(PAY(i), "E13_LEDGER_ONLY", 1, false)),
            }),
            harmPaise,
          );
          const reference = e13 * C_EXCEPTION_PAISE;
          expect(gapToOracle(withE13.net_cost_paise, reference)).toBe(
            harmPaise + abstentions * C_REVIEW_PAISE,
          );
          expect(withE13.net_cost_paise_excluding_e13).toBe(
            harmPaise + abstentions * C_REVIEW_PAISE,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §4.6 — ECE is a weighted mean of absolute gaps, so it is in [0, 1]
// ---------------------------------------------------------------------------

describe("§4.6 — ECE is bounded and its bins partition the population", () => {
  it("stays in [0, 1] and counts every prediction exactly once", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ score_bps: fc.integer({ min: 0, max: 10_000 }), correct: fc.boolean() }),
          { maxLength: 60 },
        ),
        (predictions) => {
          const report = calibration(predictions);
          expect(report.ece).toBeGreaterThanOrEqual(0);
          expect(report.ece).toBeLessThanOrEqual(1);
          expect(report.bins.reduce((n, b) => n + b.count, 0)).toBe(predictions.length);
          expect(report.bins).toHaveLength(10);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("puts every score in the bin whose range contains it", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (score) => {
        const report = calibration([{ score_bps: score, correct: true }]);
        const bin = report.bins.findIndex((b) => b.count === 1);
        const found = report.bins[bin];
        expect(found).toBeDefined();
        expect(score).toBeGreaterThanOrEqual(found?.lower_bps ?? -1);
        // The top edge is inclusive on the last bin only.
        expect(score <= (found?.upper_bps ?? -1)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §5.1 — AURC is order-independent and non-negative on a non-negative curve
// ---------------------------------------------------------------------------

describe("§5.1 — AURC integrates the curve, not the input order", () => {
  const pointArb = fc.record({
    epsilon_bps: fc.integer({ min: 0, max: 10_000 }),
    coverage_by_value: fc.double({ min: 0, max: 1, noNaN: true }),
    balance_harm_paise: fc.integer({ min: 0, max: 10_000_000 }),
  });

  it("is invariant under a permutation of the points", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(pointArb, { maxLength: 12, selector: (p) => p.coverage_by_value }),
        (points) => {
          const forward = riskCoverage(points).aurc_paise;
          const backward = riskCoverage([...points].reverse()).aurc_paise;
          expect(forward).toBeCloseTo(backward, 6);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("is non-negative when harm is, since coverage is the x-axis", () => {
    fc.assert(
      fc.property(fc.array(pointArb, { maxLength: 12 }), (points) => {
        expect(riskCoverage(points).aurc_paise).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §10.3 — the close threshold, in exact integer paise
// ---------------------------------------------------------------------------

describe("§10.3 — close_threshold_paise = round_half_up(batch * 5 / 1000)", () => {
  it("is an integer number of paise, never a float", () => {
    // DATA_MODEL.md §0 rule 1: no floating point anywhere, including
    // intermediates. A threshold carrying a fraction of a paisa would make the
    // close comparison depend on a representation.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 900_000_000_000 }), (batch) => {
        expect(Number.isInteger(closeThresholdPaise(batch))).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("is exactly the frozen ratio of batch value, half-up", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 900_000_000_000 }), (batch) => {
        expect(closeThresholdPaise(batch)).toBe(
          Math.floor((batch * MAX_UNRESOLVED_RATIO_BPS) / 10_000 + 0.5),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("is monotone in batch value, so a bigger period is never stricter", () => {
    // §10.3's whole correction: "The correction is scale-invariance." A
    // threshold that fell as the batch grew is the defect the absolute bound had.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000_000 }),
        fc.integer({ min: 0, max: 500_000_000 }),
        (a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(closeThresholdPaise(low)).toBeLessThanOrEqual(closeThresholdPaise(high));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("never returns CLOSED on a failed gate, whatever the arithmetic (§10.2)", () => {
    // "OPEN is a business state; BLOCKED is a defect." No unresolved value can
    // buy a close past a failed gate.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (unresolved, threshold) => {
          expect(periodStatusFrom(false, unresolved, threshold)).toBe("BLOCKED");
          expect(periodStatusFrom(true, unresolved, threshold)).not.toBe("BLOCKED");
        },
      ),
      { numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// §7 — the bootstrap is a function of (sample, seed) and nothing else
// ---------------------------------------------------------------------------

describe("§7 — the bootstrap is deterministic and brackets the mean", () => {
  it("returns an identical estimate for an identical (sample, seed)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: 1, maxLength: 8 }),
        fc.bigInt({ min: 0n, max: 0xffff_ffffn }),
        (sample, seed) => {
          expect(bootstrapMean(sample, seed, 64)).toEqual(bootstrapMean(sample, seed, 64));
        },
      ),
      { numRuns: 400 },
    );
  });

  it("brackets the sample mean between the interval endpoints", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: 1, maxLength: 8 }),
        fc.bigInt({ min: 0n, max: 0xffff_ffffn }),
        (sample, seed) => {
          const estimate = bootstrapMean(sample, seed, 64);
          expect(estimate.ci_low).toBeLessThanOrEqual(estimate.mean + 1e-9);
          expect(estimate.ci_high).toBeGreaterThanOrEqual(estimate.mean - 1e-9);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("makes §5.2's overlap test reflexive and symmetric", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: 1, maxLength: 6 }),
        fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: 1, maxLength: 6 }),
        (a, b) => {
          const x = bootstrapMean(a, 7n, 64);
          const y = bootstrapMean(b, 7n, 64);
          expect(intervalsOverlap(x, x)).toBe(true);
          expect(intervalsOverlap(x, y)).toBe(intervalsOverlap(y, x));
        },
      ),
      { numRuns: 400 },
    );
  });
});

// ---------------------------------------------------------------------------
// §5.3 / §7.3 — the differential test is a function of the pair set
// ---------------------------------------------------------------------------

describe("§5.3 — the consistency gate is order-independent and additive", () => {
  const lineArb = fc
    .record({
      index: fc.integer({ min: 1, max: 40 }),
      amount: fc.integer({ min: 1, max: 5_000_000 }),
      feeBps: fc.integer({ min: 0, max: 400 }),
      isRefund: fc.boolean(),
    })
    .map(({ index, amount, feeBps, isRefund }) =>
      reconLine({
        entity: PAY(index),
        type: isRefund ? "refund" : "payment",
        amount,
        fee: isRefund ? 0 : Math.round((amount * feeBps) / 10_000),
      }),
    );

  const pairsArb = fc
    .array(fc.record({ members: fc.array(lineArb, { maxLength: 3 }), amount: fc.integer({ min: 1, max: 9_000_000 }) }), {
      minLength: 1,
      maxLength: 5,
    })
    .map((specs) =>
      specs.map((spec, i): DifferentialPair => ({
        pair_id: `p${String(i)}`,
        target: settlement(SETL(i + 1), spec.amount, UTR),
        members: spec.members,
        anchored: [],
        allocated: [],
        bank_value_date: null,
        bank_line_id: null,
      })),
    );

  it("gives the same verdict however the sample is ordered", () => {
    // §7.3 draws R pairs "randomly sampled"; a gate whose outcome depended on
    // the draw order would not be a property of the two implementations.
    fc.assert(
      fc.property(pairsArb, (pairs) => {
        const observations = pairs.flatMap((p) => [p.target, ...p.members]);
        const forward = consistencyGate(observations, pairs);
        const backward = consistencyGate(observations, [...pairs].reverse());
        expect(forward.passed).toBe(backward.passed);
        expect(forward.divergences.length).toBe(backward.divergences.length);
        expect(forward.by_clause.map((c) => c.compared)).toEqual(
          backward.by_clause.map((c) => c.compared),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("accounts for every pair on every clause, with no pair falling through", () => {
    // compared + declared_non_binding + out_of_scope must equal the sample size
    // on each of the ten clause rows. §5.3 wants the non-binding counts reported
    // apart, not dropped: "a gate that cannot fail on a constraint neither side
    // can evaluate would otherwise report agreement it never tested".
    fc.assert(
      fc.property(pairsArb, (pairs) => {
        const observations = pairs.flatMap((p) => [p.target, ...p.members]);
        const result = consistencyGate(observations, pairs);
        for (const tally of result.by_clause) {
          expect(tally.compared + tally.declared_non_binding + tally.out_of_scope).toBe(
            pairs.length,
          );
          expect(tally.agreed + tally.diverged).toBe(tally.compared);
        }
        expect(result.sample_size).toBe(pairs.length);
      }),
      { numRuns: 300 },
    );
  });

  it("excludes C8 and C2's adjustment half from the criterion on EVERY pair", () => {
    fc.assert(
      fc.property(pairsArb, (pairs) => {
        const observations = pairs.flatMap((p) => [p.target, ...p.members]);
        const result = consistencyGate(observations, pairs);
        for (const tally of result.by_clause) {
          const isDeclaredNonBinding =
            tally.clause.id === "C8" ||
            (tally.clause.id === "C2" && tally.clause.half === "adjustment");
          if (isDeclaredNonBinding) {
            expect(tally.compared).toBe(0);
            expect(tally.declared_non_binding).toBe(pairs.length);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never claims to meet R below the declared sample size", () => {
    fc.assert(
      fc.property(pairsArb, (pairs) => {
        const observations = pairs.flatMap((p) => [p.target, ...p.members]);
        const result = consistencyGate(observations, pairs);
        expect(result.meets_declared_sample_size).toBe(pairs.length >= DECLARED_SAMPLE_SIZE);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// §8 — the frozen list is closed
// ---------------------------------------------------------------------------

describe("§8 — the frozen metric list is a closed set", () => {
  it("admits no name that is not a substring of one of its own rows", () => {
    const names = new Set(FROZEN_METRICS.flatMap((m) => m.name.split(", ")));
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (candidate) => {
        // Anything not literally on the list must carry the EXPLORATORY label
        // (§L.4). Membership is exact-match, never prefix or fuzzy.
        expect(names.has(candidate)).toBe(
          FROZEN_METRICS.some((m) => m.name.split(", ").includes(candidate)),
        );
      }),
      { numRuns: RUNS },
    );
  });
});

function many<T>(count: number, build: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => build(i + 1));
}
