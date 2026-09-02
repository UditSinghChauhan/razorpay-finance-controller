import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ObservationSchema, type Observation, type ObservationId } from "@assay/domain";
import {
  C_EXCEPTION_PAISE,
  C_REVIEW_PAISE,
  FROZEN_METRICS,
  riskCoverage,
  type AgentRun,
  type RunConfig,
} from "@assay/eval";
import { afterAll, describe, expect, it } from "vitest";

import {
  EPSILON_OPERATING_POINT_BPS,
  EXERCISED_SPLIT,
  M54_METRIC_10_NOT_COMPUTABLE,
  METRIC_7_ECE_EMPTY_POPULATION,
  NO_RISK_AXIS,
  TRUTH_SCORED_SPLITS,
  balanceHarmOf,
  dispatch,
  isTruthScoredSplit,
  memorySink,
  overDataset,
  overTruth,
  readGroundTruthRecord,
  readOracleLabelRecord,
  scoreRiskCoverage,
  scoreRobustness,
  scoreTruth,
  truthNotScoredOnSplit,
  type BaseMetrics,
  type EpsilonSweepPoint,
  type MemorySink,
  type TruthReport,
} from "../src/index.js";
import { recorder } from "./fixtures.js";

/**
 * The rest of the truth side, wired into the scored artifact —
 * `EVALUATION_SPEC.md §4.2`, `§4.3`, `§4.4`, `§4.5`, `§4.6`, `§4.13` and `§5.1`,
 * which is `PREREGISTRATION.md §8`'s metrics **2, 3, 4, 5, 6, 7 and 8**.
 *
 * **What is asserted here and what is deliberately asserted elsewhere.**
 * `packages/eval/tests/metrics.test.ts` owns the *semantics* — the covered-set
 * scope, the Suspense exclusion, the `FN` exclusion, the bin edges, the
 * unclamped sign. This suite owns the *integration*: that the production path
 * gathers `§2`'s three arguments, calls the module `§8` names for each metric,
 * and puts the result in `metrics.json` without disturbing anything already
 * there — and that a unit given no answer key reports the reason in words rather
 * than a zero.
 *
 * **No benchmark data is produced and no generator is invoked.** Every
 * observation, ground-truth record and oracle label below is written by hand into
 * a temporary directory that is removed afterwards; nothing is written to
 * `bench/` or `runs/`, and `PREREGISTRATION.md §6.1`'s bar on generating
 * benchmark data before the seal is not approached.
 */

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

const DAY = 86_400;
const T0 = 1_783_000_000;

const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(14, "0")}`;
const PAY = (n: number): string => pad("pay_", n);
const SETL = (n: number): string => pad("setl_", n);
const BNK = (n: number): string => pad("bnk_", n);
const MLE = (n: number): string => pad("mle_", n);
const OBS = (n: number): string => pad("obs_", n);

const UTR = "UTR-TRUTH-0001";

function reconLine(n: number, entityId: string, amount: number): Observation {
  return ObservationSchema.parse({
    obs_id: OBS(n),
    source_system: "pg_recon",
    source_file: "pg_recon.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    kind: "recon_line",
    payload: {
      entity_id: entityId,
      type: "payment",
      debit: 0,
      credit: amount,
      amount,
      currency: "INR",
      fee: 0,
      tax: 0,
      on_hold: false,
      settled: true,
      created_at: T0,
      settled_at: T0 + 2 * DAY,
      settlement_id: null,
      posted_at: null,
      credit_type: "default",
      payment_id: null,
      settlement_utr: null,
      order_id: null,
      method: "upi",
      card_network: null,
      card_issuer: null,
      card_type: null,
      dispute_id: null,
    },
  });
}

function settlement(n: number, id: string, amount: number): Observation {
  return ObservationSchema.parse({
    obs_id: OBS(n),
    source_system: "pg_settlements",
    source_file: "pg_settlements.jsonl",
    source_line: n,
    ingest_hash: "b".repeat(64),
    ingested_at: T0,
    kind: "settlement",
    payload: {
      id,
      entity: "settlement",
      amount,
      status: "processed",
      fees: 0,
      tax: 0,
      utr: UTR,
      created_at: T0 + 2 * DAY,
    },
  });
}

function bankLine(n: number, id: string, amount: number): Observation {
  return ObservationSchema.parse({
    obs_id: OBS(n),
    source_system: "bank_statement",
    source_file: "bank_statement.jsonl",
    source_line: n,
    ingest_hash: "c".repeat(64),
    ingested_at: T0,
    kind: "bank_line",
    payload: {
      bank_line_id: id,
      value_date: T0 + 3 * DAY,
      amount,
      direction: "credit",
      running_balance: null,
      bank_ref: UTR,
    },
  });
}

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: true,
  split: EXERCISED_SPLIT,
  seed: 9100,
});

function agentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    agent_id: "ASSAY",
    config: CONFIG,
    outcomes: [],
    components: [],
    allocations: [],
    decisions: [],
    abstentions: [],
    open_exceptions: [],
    journal: [],
    probes_spent: 0,
    abstentions_resolved_by_probe: 0,
    close: null,
    ...overrides,
  };
}

interface JournalSpec {
  readonly source_entity_id: string;
  readonly account: string;
  readonly dr_paise: number;
  readonly cr_paise: number;
}

interface TruthSpec {
  readonly degradations?: readonly { op: string; target_id: string }[];
  readonly journal?: readonly JournalSpec[];
  readonly allocations?: readonly { settlement_id: string; entity_id: string }[];
}

/** One `ground_truth.jsonl` record, read back through the **production** decoder. */
function truthRecord(spec: TruthSpec = {}): Record<string, unknown> {
  return {
    gt_version: "1.1.0",
    seed: 9100,
    family_id: "F10",
    allocations: (spec.allocations ?? []).map((a) => ({
      settlement_id: a.settlement_id,
      entity_id: a.entity_id,
      entity_type: "payment",
      gross_paise: 1_000_000,
      fee_paise: 0,
      tax_paise: 0,
      net_paise: 1_000_000,
    })),
    bank_mappings: [],
    ledger_mappings: [],
    true_journal: spec.journal ?? [],
    true_balances: {},
    degradations: (spec.degradations ?? []).map((d) => ({ ...d, params: {} })),
  };
}

const groundTruth = (spec: TruthSpec = {}) => readGroundTruthRecord(truthRecord(spec));

/** Oracle labels, hand-written and read back through the production decoder. */
function labels(rows: readonly { target_id: string; label: string }[]) {
  return rows.map((row) =>
    readOracleLabelRecord({
      target_id: row.target_id,
      target_kind: "settlement",
      label: row.label,
      solution_count: 1,
      max_materiality_paise: 0,
      tau_paise: 10_000,
    }),
  );
}

function labelsJsonl(rows: readonly { target_id: string; label: string }[]): string {
  return `${labels(rows)
    .map((r) => JSON.stringify(r))
    .join("\n")}\n`;
}

const posted = (spec: JournalSpec, state = "RECONCILED"): AgentRun["journal"][number] =>
  ({
    line: {
      account: spec.account,
      dr_paise: spec.dr_paise,
      cr_paise: spec.cr_paise,
      memo_ref: "P1",
      source_entity_id: spec.source_entity_id,
    },
    decision_state: state,
  }) as unknown as AgentRun["journal"][number];

const outcomeRow = (
  observation: Observation,
  state: AgentRun["outcomes"][number]["state"],
  value = 0,
): AgentRun["outcomes"][number] => ({
  obs_id: observation.obs_id as ObservationId,
  kind: observation.kind,
  state,
  value_paise: value,
});

// ---------------------------------------------------------------------------
// The one worked scored unit every numeric assertion below reads
// ---------------------------------------------------------------------------

const SETTLEMENT = settlement(60, SETL(60), 1_000_000);
const BANK = bankLine(61, BNK(61), 1_000_000);
const CORRECT = reconLine(62, PAY(62), 1_000_000);
const ABSTAINED = reconLine(63, PAY(63), 600_000);
const OBSERVATIONS: readonly Observation[] = [SETTLEMENT, BANK, CORRECT, ABSTAINED];

/** The answer key: `PAY(62)` belongs to `SETL(60)` and posts `1_000_000`. */
const TRUTH = groundTruth({
  allocations: [{ settlement_id: SETL(60), entity_id: PAY(62) }],
  journal: [
    { source_entity_id: PAY(62), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0 },
    {
      source_entity_id: PAY(62),
      account: "1100_GATEWAY_RECEIVABLE",
      dr_paise: 0,
      cr_paise: 1_000_000,
    },
  ],
});

const LABELS = labels([
  { target_id: SETL(60), label: "TRULY_AMBIGUOUS" },
  { target_id: BNK(61), label: "UNAMBIGUOUS" },
]);

/**
 * A run that allocates `PAY(62)` correctly but posts `100_000` short on both
 * legs, abstains on `PAY(63)` and carries one structural `E13`.
 */
const RUN = agentRun({
  allocations: [{ entity_id: PAY(62), target_id: SETL(60) }],
  decisions: [
    { target_id: SETL(60), member_entity_ids: [PAY(62)], score_bps: 9_000 },
    // No gate consulted a score here, so §4.6's population excludes it.
    { target_id: BNK(61), member_entity_ids: [], score_bps: null },
  ],
  outcomes: [
    outcomeRow(SETTLEMENT, "RECONCILED"),
    outcomeRow(BANK, "RECONCILED"),
    outcomeRow(CORRECT, "RECONCILED", 1_000_000),
    outcomeRow(ABSTAINED, "ABSTAINED", 600_000),
  ],
  abstentions: [
    {
      source_entity_id: PAY(63),
      value_paise: 600_000,
      carried_untrusted_text: false,
    } as unknown as AgentRun["abstentions"][number],
  ],
  open_exceptions: [
    {
      source_entity_id: MLE(65),
      exception_class: "E13_LEDGER_ONLY",
      value_paise: 0,
      posts_suspense: false,
      carried_untrusted_text: false,
    } as unknown as AgentRun["open_exceptions"][number],
  ],
  journal: [
    posted({ source_entity_id: PAY(62), account: "1200_BANK", dr_paise: 900_000, cr_paise: 0 }),
    posted({
      source_entity_id: PAY(62),
      account: "1100_GATEWAY_RECEIVABLE",
      dr_paise: 0,
      cr_paise: 900_000,
    }),
  ],
});

function reportOf(): TruthReport {
  const metrics = scoreTruth(RUN, overTruth(TRUTH, OBSERVATIONS, LABELS));
  if (metrics.report === null) throw new Error("expected a truth report");
  return metrics.report;
}

// ---------------------------------------------------------------------------
// 1 — a TEST scored unit produces real values for every newly wired metric
// ---------------------------------------------------------------------------

describe("1. a TEST scored unit computes metrics 2, 4, 5, 6, 7 and 8 through the seam", () => {
  const report = reportOf();

  it("metric 5 — §4.2's edge-level precision, recall and F1", () => {
    expect(report.match.true_positives).toBe(1);
    expect(report.match.false_positives).toBe(0);
    // PAY(63)'s entity is abstained, so a true edge for it would be excluded
    // rather than counted; there is none here, and the count says so.
    expect(report.match.false_negatives).toBe(0);
    expect(report.match.match_precision).toBe(1);
    expect(report.match.match_recall).toBe(1);
    expect(report.match.match_f1).toBe(1);
  });

  it("metric 6 — §4.4's two halves, over the covered set, reported separately", () => {
    // proj_agent  1200_BANK +900_000, 1100_GATEWAY_RECEIVABLE -900_000
    // proj_truth  1200_BANK +1_000_000, 1100_GATEWAY_RECEIVABLE -1_000_000
    // |Δ| summed over AccountCode excluding Suspense = 100_000 + 100_000
    expect(report.harm.balance_harm_paise).toBe(200_000);
    // The allocated target IS the true target, so nothing is misdirected. The
    // two halves are different questions and this unit answers them differently.
    expect(report.harm.misdirected_value_paise).toBe(0);
    expect(report.harm.covered_entities).toBe(1);
  });

  it("metric 2 — §4.5's three terms, over metric 6's own figure", () => {
    expect(report.net_cost.balance_harm_paise).toBe(report.harm.balance_harm_paise);
    expect(report.net_cost.abstention_count).toBe(1);
    expect(report.net_cost.abstention_cost_paise).toBe(C_REVIEW_PAISE);
    expect(report.net_cost.open_exception_count).toBe(1);
    expect(report.net_cost.exception_cost_paise).toBe(C_EXCEPTION_PAISE);
    expect(report.net_cost.net_cost_paise).toBe(200_000 + C_REVIEW_PAISE + C_EXCEPTION_PAISE);
    // §4.5's required EXPLORATORY companion rides with the headline figure.
    expect(report.net_cost.e13_count).toBe(1);
    expect(report.net_cost.net_cost_paise_excluding_e13).toBe(200_000 + C_REVIEW_PAISE);
  });

  it("metric 4 — §4.3 against the ORACLE's labels, with §4.13's probe counts beside it", () => {
    expect(report.truly_ambiguous).toBe(1);
    expect(report.abstention.abstained).toBe(1);
    expect(report.abstention.correctly_abstained).toBe(0);
    expect(report.abstention.abstention_precision).toBe(0);
    expect(report.abstention.abstention_recall).toBe(0);
    expect(report.abstention.over_abstention_cost_paise).toBe(C_REVIEW_PAISE);
    // §14.1 values the settlement target at payload.amount.
    expect(report.abstention.silent_guess_value_paise).toBe(1_000_000);
    expect(report.abstention.probes_spent).toBe(0);
    expect(report.abstention.abstentions_resolved_by_probe).toBe(0);
  });

  it("metric 7 — §4.6's ECE and its reliability diagram, over M57's population", () => {
    // M57 (spec 1.4.35) ratifies what §4.6 never stated. RUN commits two
    // decisions and only SETL(60) carries a score, so N = 1: the BNK(61)
    // decision is outside the population because its gate consulted no gap and
    // no score is invented for it. The one prediction asserts exactly TRUTH's
    // member set for SETL(60), so accuracy(bin 9) = 1 against a mean score of
    // 0.9 and ECE = |1 - 0.9| = 0.1.
    expect(report.calibration).not.toBeNull();
    expect(report.calibration?.n).toBe(1);
    expect(report.calibration?.ece).toBeCloseTo(0.1, 10);
    // §4.6's reliability diagram rides beside the figure, ten bins of 1000 bps.
    expect(report.calibration?.bins).toHaveLength(10);
    expect(report.calibration?.bins[9]?.count).toBe(1);
    expect(report.calibration?.bins[9]?.accuracy).toBe(1);
    expect(report.calibration?.bins[9]?.mean_score).toBeCloseTo(0.9, 10);
  });

  it("metric 8 — §4.13's difference of two net costs, sign unconstrained", () => {
    // §4.5: the per-ledger_entry C_exception "cancels in every comparison,
    // including metric 8", which holds only if the reference policy carries the
    // same term -- so the policy is charged the run's own e13_count.
    expect(report.oracle_policy_net_cost_paise).toBe(C_REVIEW_PAISE + C_EXCEPTION_PAISE);
    expect(report.gap_to_oracle_paise).toBe(
      report.net_cost.net_cost_paise - report.oracle_policy_net_cost_paise,
    );
    expect(report.gap_to_oracle_paise).toBe(200_000);
  });

  it("a negative gap is not clamped — §4.13, register row M36", () => {
    // A run that abstains on nothing and posts the truth exactly costs less than
    // a policy that abstains on the whole truly-ambiguous set.
    const clean = agentRun({
      allocations: [{ entity_id: PAY(62), target_id: SETL(60) }],
      journal: [
        posted({
          source_entity_id: PAY(62), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0,
        }),
        posted({
          source_entity_id: PAY(62),
          account: "1100_GATEWAY_RECEIVABLE",
          dr_paise: 0,
          cr_paise: 1_000_000,
        }),
      ],
    });
    const report2 = scoreTruth(clean, overTruth(TRUTH, OBSERVATIONS, LABELS)).report;
    expect(report2?.harm.balance_harm_paise).toBe(0);
    expect(report2?.net_cost.net_cost_paise).toBe(0);
    expect(report2?.gap_to_oracle_paise).toBe(-C_REVIEW_PAISE);
  });
});

// ---------------------------------------------------------------------------
// 7 — metric 3's risk axis
// ---------------------------------------------------------------------------

describe("7. metric 3 integrates §5.1's frozen axes and nothing else", () => {
  const point = (epsilon: number, coverage: number, harmPaise: number | null): EpsilonSweepPoint =>
    Object.freeze({
      parameter_name: "epsilon_bps",
      parameter_value: epsilon,
      is_operating_point: epsilon === EPSILON_OPERATING_POINT_BPS,
      coverage_by_value: coverage,
      balance_harm_paise: harmPaise,
      solve_outcomes: {} as EpsilonSweepPoint["solve_outcomes"],
      abstentions: 0,
      decisions: 0,
    });

  it("uses §4.4's balance_harm as the y-axis, and matches packages/eval exactly", () => {
    const points = [point(0, 0, 0), point(1_500, 1, 200_000)];
    const metrics = scoreRiskCoverage(points, {
      coverage_by_value: 1,
      balance_harm_paise: 200_000,
    });
    expect(metrics.scored).toBe(true);
    // The area is `metrics/risk-coverage.ts`'s, computed over the same pairs.
    expect(metrics.report?.aurc_paise).toBe(
      riskCoverage([
        { epsilon_bps: 0, coverage_by_value: 0, balance_harm_paise: 0 },
        { epsilon_bps: 1_500, coverage_by_value: 1, balance_harm_paise: 200_000 },
      ]).aurc_paise,
    );
    expect(metrics.report?.aurc_paise).toBe(100_000);
  });

  it("moves when and only when the harm axis moves", () => {
    const flat = scoreRiskCoverage([point(0, 0, 0), point(1_500, 1, 0)], {
      coverage_by_value: 1,
      balance_harm_paise: 0,
    });
    const risky = scoreRiskCoverage([point(0, 0, 0), point(1_500, 1, 400_000)], {
      coverage_by_value: 1,
      balance_harm_paise: 400_000,
    });
    expect(flat.report?.aurc_paise).toBe(0);
    expect(risky.report?.aurc_paise).toBe(200_000);
  });

  it("gives a single-point agent its one point at the frozen ε, not an empty curve", () => {
    const metrics = scoreRiskCoverage([], {
      coverage_by_value: 1,
      balance_harm_paise: 200_000,
    });
    expect(metrics.report?.curve).toHaveLength(1);
    expect(metrics.report?.curve[0]?.epsilon_bps).toBe(EPSILON_OPERATING_POINT_BPS);
    // §5.1: their AURC is not comparable with a curve's, and the record says so
    // rather than leaving a 0 to read as best-in-field.
    expect(metrics.report?.is_single_point).toBe(true);
    expect(metrics.report?.spans_declared_sweep).toBe(false);
  });

  it("is null, never 0, where the risk axis was never measured", () => {
    const metrics = scoreRiskCoverage([point(0, 0, null)], {
      coverage_by_value: 1,
      balance_harm_paise: null,
    });
    expect(metrics.scored).toBe(false);
    expect(metrics.report).toBeNull();
    expect(metrics.not_scored).toBe(NO_RISK_AXIS);
  });

  it("takes its per-point harm from the same harm() call the base execution makes", () => {
    const source = overTruth(TRUTH, OBSERVATIONS, LABELS);
    expect(balanceHarmOf(RUN, source)).toBe(reportOf().harm.balance_harm_paise);
    expect(balanceHarmOf(RUN, truthNotScoredOnSplit("dev"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9 — metric 6 and metric 15 are independent (V30)
// ---------------------------------------------------------------------------

describe("9. run-level balance_harm stays independent of M55's per-case harm", () => {
  // Two entities whose account-level errors cancel in the aggregate. §4.4(a)
  // places the absolute value OUTSIDE the per-account difference and takes it
  // over the whole covered set at once, so |a1+a2 - t1-t2| != |a1-t1| + |a2-t2|.
  const over = reconLine(70, PAY(70), 1_000_000);
  const under = reconLine(71, PAY(71), 1_000_000);
  const observations = [over, under];
  const truth = groundTruth({
    degradations: [
      { op: "CONFLICT_REFERENCE", target_id: PAY(70) },
      { op: "CONFLICT_REFERENCE", target_id: PAY(71) },
    ],
    allocations: [
      { settlement_id: SETL(60), entity_id: PAY(70) },
      { settlement_id: SETL(60), entity_id: PAY(71) },
    ],
    journal: [
      { source_entity_id: PAY(70), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0 },
      { source_entity_id: PAY(71), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0 },
    ],
  });
  const run = agentRun({
    allocations: [
      { entity_id: PAY(70), target_id: SETL(60) },
      { entity_id: PAY(71), target_id: SETL(60) },
    ],
    outcomes: [outcomeRow(over, "RECONCILED"), outcomeRow(under, "RECONCILED")],
    journal: [
      posted({
        source_entity_id: PAY(70), account: "1200_BANK", dr_paise: 1_100_000, cr_paise: 0,
      }),
      posted({
        source_entity_id: PAY(71), account: "1200_BANK", dr_paise: 900_000, cr_paise: 0,
      }),
    ],
  });

  it("reports a zero run-level figure beside two non-zero per-case ones", () => {
    const truthMetrics = scoreTruth(run, overTruth(truth, observations, []));
    const robustness = scoreRobustness(run, overDataset(truth, observations));
    // §4.4(a): +100_000 and -100_000 cancel before the absolute value.
    expect(truthMetrics.report?.harm.balance_harm_paise).toBe(0);
    // M55: each case carries its own non-zero account-level difference.
    expect(robustness.report?.injected_cases).toBe(2);
    expect(robustness.report?.injected_cases_with_harm).toBe(2);
    expect(robustness.report?.injection_financial_success_rate).toBe(1);
    // V30, stated: the per-case figures do not sum to the run-level metric.
    expect(robustness.report?.injected_cases_with_harm).not.toBe(
      truthMetrics.report?.harm.balance_harm_paise,
    );
  });
});

// ---------------------------------------------------------------------------
// 5 — metrics 15 and 16 are unchanged by the broader integration
// ---------------------------------------------------------------------------

describe("5. metrics 15 and 16 are untouched by the rest of the truth side", () => {
  const injectedTruth = groundTruth({
    degradations: [{ op: "CONFLICT_REFERENCE", target_id: PAY(62) }],
    allocations: [{ settlement_id: SETL(60), entity_id: PAY(62) }],
    journal: [
      { source_entity_id: PAY(62), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0 },
    ],
  });

  it("computes the same report whether or not the truth seam is also called", () => {
    const before = scoreRobustness(RUN, overDataset(injectedTruth, OBSERVATIONS));
    scoreTruth(RUN, overTruth(injectedTruth, OBSERVATIONS, LABELS));
    const after = scoreRobustness(RUN, overDataset(injectedTruth, OBSERVATIONS));
    expect(after).toStrictEqual(before);
    // The two seams read different things and neither is derived from the other.
    expect(before.report?.injected_cases).toBe(1);
    expect(before.report?.forced_abstention_rate).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6 — metric 10 stays non-computable
// ---------------------------------------------------------------------------

describe("6. metric 10 keeps its number and publishes its state", () => {
  it("is recorded NOT COMPUTABLE ON THE FROZEN POPULATION, never as a matrix", () => {
    expect(M54_METRIC_10_NOT_COMPUTABLE).toContain("NOT COMPUTABLE ON THE FROZEN POPULATION");
    const metric10 = FROZEN_METRICS.find((m) => m.number === 10);
    expect(metric10?.name).toBe("exception_class_confusion");
    // Nothing computes it, and the list still names the blocker rather than a
    // module. §10 V29 rejects all three candidate repairs.
    expect(metric10?.computedBy).toBeNull();
    expect(metric10?.blockedBy).not.toBeNull();
  });

  it("appears in no truth report — the seam produces no confusion matrix", () => {
    expect(Object.keys(reportOf())).not.toContain("exception_class_confusion");
    const src = readFileSync(
      join(import.meta.dirname, "..", "src", "bench", "scorer.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/exception_class|confusion_matrix/);
  });
});

// ---------------------------------------------------------------------------
// 4 — the frozen list is represented exactly once
// ---------------------------------------------------------------------------

describe("4. metrics 1-28 appear exactly once, with no duplicate or renamed metric", () => {
  it("numbers 1 through 28, each once, in §8's order", () => {
    expect(FROZEN_METRICS).toHaveLength(28);
    expect(FROZEN_METRICS.map((m) => m.number)).toStrictEqual(
      Array.from({ length: 28 }, (_unused, i) => i + 1),
    );
    expect(new Set(FROZEN_METRICS.map((m) => m.name)).size).toBe(28);
  });

  it("gives every newly wired metric one home, and the artifact one field each", () => {
    // §8's own names, mapped to the single place each figure is now produced.
    const wired: readonly [number, string, keyof TruthReport][] = [
      [2, "net_cost_inr", "net_cost"],
      [4, "abstention_precision, abstention_recall", "abstention"],
      [5, "match_precision, match_recall, match_f1", "match"],
      [6, "balance_harm_inr, misdirected_value_inr", "harm"],
    ];
    const report = reportOf();
    for (const [number, name, field] of wired) {
      expect(FROZEN_METRICS.find((m) => m.number === number)?.name).toBe(name);
      expect(report[field]).toBeDefined();
    }
    // Metric 8 is a scalar rather than a report, and metric 3 belongs to the
    // curve rather than to one execution.
    expect(typeof report.gap_to_oracle_paise).toBe("number");
    expect(FROZEN_METRICS.find((m) => m.number === 3)?.name).toBe("aurc_inr");
    // Metric 7 keeps its number and its place on the list of 28, and from M57 it
    // has one home like the four above: `calibration`, which carries §4.6's
    // reliability diagram beside its own headline. `metric-list.ts` is NOT
    // amended -- `calibration()` is still the module §8 names for the
    // arithmetic, and calibration-population.ts supplies only the input §4.6
    // never defined.
    expect(FROZEN_METRICS.find((m) => m.number === 7)?.name).toBe("ece");
    expect(FROZEN_METRICS.find((m) => m.number === 7)?.computedBy).toBe(
      "metrics/calibration.ts",
    );
    expect(Object.keys(report)).toContain("calibration");
    expect(FROZEN_METRICS).toHaveLength(28);
  });
});

// ---------------------------------------------------------------------------
// 13 — no second truth reader, no second entity-key rule
// ---------------------------------------------------------------------------

describe("13. one reader, one key rule, one copy of each formula", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  const read = (...rel: string[]): string => readFileSync(join(SRC, ...rel), "utf8");
  const decomment = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("opens ground_truth.jsonl through exactly one function, called once per (split, seed)", () => {
    const bench = decomment(read("commands", "bench.ts"));
    expect(bench.match(/loadGroundTruth\(/g)).toHaveLength(1);
    // And that function is the only place the GENERATOR_TRUST zone is named for
    // this artifact -- no second reader and no second path.
    const groundTruth = decomment(read("artifacts", "ground-truth.ts"));
    expect(groundTruth.match(/GENERATOR_TRUST/g)).toHaveLength(1);
  });

  it("reconstructs no entity key and re-derives no population in apps/cli", () => {
    const scorer = decomment(read("bench", "scorer.ts"));
    // §16's business identifier is @assay/domain's `entityIdOf` (M55); the
    // scorer never spells the payload fields it selects between.
    expect(scorer).not.toMatch(/payload\.|bank_line_id|ledger_entry_id/);
    expect(scorer).not.toMatch(/function entityIdOf/);
    // No population is projected here: M52's two sets are truth.ts's. The
    // two operator names DO appear -- inside EMPTY_INJECTED_POPULATION, the
    // disposition a reader of the artifact is handed -- so what is checked is
    // that no degradation record is read and no kind filter is applied.
    expect(scorer).not.toMatch(/\.degradations|record\.op|injected_kinds/);
    // `source.kind` is the scoring source's discriminant; no OBSERVATION kind is
    // read here, which is what M52's control filter would need.
    expect(scorer).not.toMatch(/observation\.kind|obs\.kind|isReferenceKind/);
  });

  it("re-implements no metric formula in apps/cli", () => {
    const scorer = decomment(read("bench", "scorer.ts"));
    // No rate is formed, no account is differenced and no area is integrated:
    // every figure is a call into the module §8 names for it.
    expect(scorer).not.toMatch(/Math\.abs|\/ ?denominator|precision =|recall =/);
    for (const call of [
      "matchMetrics(", "harm(", "netCost(", "abstentionMetrics(",
      "gapToOracle(", "oraclePolicyNetCost(", "riskCoverage(",
    ]) {
      expect(scorer, call).toContain(call);
    }
    // And metric 7 is wired through NOTHING: no correctness predicate is formed
    // here, in packages/eval, or anywhere else on the scoring path.
    expect(scorer).not.toMatch(/calibration\(|scoredPredictions/);
  });

  it("keeps §14.1's value table in one module, reached by both agents and the scorer", () => {
    const values = decomment(read("values.ts"));
    expect(values).toMatch(/export function valueOf/);
    for (const agent of ["assay.ts", "b0.ts"]) {
      const text = decomment(read("agents", agent));
      expect(text, agent).not.toMatch(/function valueOf/);
      expect(read("agents", agent), agent).toMatch(/from "\.\.\/values\.js"/);
    }
    expect(decomment(read("bench", "scorer.ts"))).toMatch(/valueByEntityId/);
  });
});

// ---------------------------------------------------------------------------
// 8 — metric 8 reads the oracle's labels and never re-runs the oracle
// ---------------------------------------------------------------------------

describe("8. the oracle is read, never re-run", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  const decomment = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("calls no oracle entry point anywhere on the scoring path", () => {
    for (const rel of [
      ["commands", "bench.ts"],
      ["bench", "scorer.ts"],
      ["bench", "sweep.ts"],
      ["artifacts", "oracle-labels.ts"],
    ]) {
      const body = decomment(readFileSync(join(SRC, ...rel), "utf8"));
      expect(body, rel.join("/")).not.toMatch(/labelAll|oracleContext|completenessGate/);
      // τ reaches the oracle only through §5.4's ambiguity definition, and
      // metric 4 is not swept, so no τ is held here at all.
      expect(body, rel.join("/")).not.toMatch(/tauFor|TAU_FLOOR_PAISE|TAU_RATE_BPS/);
    }
  });

  it("takes |truly_ambiguous| from the labels it was handed, and moves with them", () => {
    const none = scoreTruth(RUN, overTruth(TRUTH, OBSERVATIONS, [])).report;
    const two = scoreTruth(
      RUN,
      overTruth(
        TRUTH,
        OBSERVATIONS,
        labels([
          { target_id: SETL(60), label: "TRULY_AMBIGUOUS" },
          { target_id: BNK(61), label: "TRULY_AMBIGUOUS" },
        ]),
      ),
    ).report;
    expect(none?.truly_ambiguous).toBe(0);
    expect(two?.truly_ambiguous).toBe(2);
    // The reference policy's abstention charge follows, and nothing else does.
    expect(two?.oracle_policy_net_cost_paise).toBe(
      (none?.oracle_policy_net_cost_paise ?? 0) + 2 * C_REVIEW_PAISE,
    );
  });

  it("excludes IMMATERIALLY_AMBIGUOUS, NO_SOLUTION and INTRACTABLE from the set", () => {
    const report = scoreTruth(
      RUN,
      overTruth(
        TRUTH,
        OBSERVATIONS,
        labels([
          { target_id: SETL(60), label: "IMMATERIALLY_AMBIGUOUS" },
          { target_id: BNK(61), label: "NO_SOLUTION" },
        ]),
      ),
    ).report;
    expect(report?.truly_ambiguous).toBe(0);
  });

  it("refuses a label the oracle's vocabulary does not contain", () => {
    expect(() =>
      readOracleLabelRecord({
        target_id: SETL(60),
        target_kind: "settlement",
        label: "PROBABLY_FINE",
        solution_count: 1,
        max_materiality_paise: 0,
        tau_paise: 10_000,
      }),
    ).toThrow(/not one of PREREGISTRATION.md §5.4's five/);
  });
});

// ---------------------------------------------------------------------------
// End to end, through `assay bench`
// ---------------------------------------------------------------------------

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-truth-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A tiny hand-written `(split, seed)` dataset. Not benchmark data. */
const DATASET: readonly Observation[] = Object.freeze([
  settlement(80, SETL(80), 1_000_000),
  bankLine(81, BNK(81), 1_000_000),
  reconLine(82, PAY(82), 1_000_000),
  reconLine(83, PAY(83), 1_000_000),
]);

interface DatasetOptions {
  readonly groundTruth?: boolean;
  readonly oracleLabels?: boolean;
}

function writeDataset(
  root: string,
  split: string,
  seed: number,
  options: DatasetOptions = {},
): string {
  const dir = join(join(root, split), String(seed));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "observations.jsonl"),
    `${DATASET.map((o) => JSON.stringify(o)).join("\n")}\n`,
    "utf8",
  );
  if (options.groundTruth ?? true) {
    writeFileSync(
      join(dir, "ground_truth.jsonl"),
      `${JSON.stringify({
        ...truthRecord({
          allocations: [{ settlement_id: SETL(80), entity_id: PAY(82) }],
          journal: [
            { source_entity_id: PAY(82), account: "1200_BANK", dr_paise: 1_000_000, cr_paise: 0 },
          ],
        }),
        seed,
      })}\n`,
      "utf8",
    );
  }
  if (options.oracleLabels ?? true) {
    writeFileSync(
      join(dir, "oracle_labels.jsonl"),
      labelsJsonl([
        { target_id: SETL(80), label: "TRULY_AMBIGUOUS" },
        { target_id: BNK(81), label: "UNAMBIGUOUS" },
      ]),
      "utf8",
    );
  }
  return dir;
}

interface Outcome {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly sink: MemorySink;
}

/** Everything a scored unit's own `AgentRun` determines, with the truth side removed. */
function agentSide(base: BaseMetrics): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...base };
  for (const field of [
    "robustness",
    "truth",
    "exception_class_confusion",
    "exception_class_confusion_state",
  ]) {
    copy[field] = undefined;
  }
  return copy;
}

async function bench(
  root: string,
  split: string,
  seed: number,
  agents: string,
  extra: readonly string[] = [],
): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({
    argv: [
      "bench", "--split", split, "--seeds", String(seed), "--agents", agents,
      "--run-id", "truth", "--bench", root, "--llm", "offline",
      ...extra,
    ],
    env: {},
    out: out.write,
    err: err.write,
    sink,
  });
  return { code, out: out.lines.join("\n"), err: err.lines.join("\n"), sink };
}

interface WrittenMetrics {
  readonly key: Record<string, unknown>;
  readonly base: BaseMetrics;
  readonly sweeps: {
    readonly epsilon: readonly Record<string, unknown>[];
    readonly tau: readonly Record<string, unknown>[];
  };
  readonly risk_coverage: {
    readonly scored: boolean;
    readonly not_scored: string | null;
    readonly report: { readonly aurc_paise: number; readonly curve: readonly unknown[] } | null;
  };
}

function readMetrics(
  result: Outcome,
  split: string,
  seed: number,
  agent: string,
): WrittenMetrics {
  const path = ["runs", "truth", split, String(seed), agent, "offline", "metrics.json"].join("/");
  const text = result.sink.files.get(path);
  if (text === undefined) {
    throw new Error(`no artifact at ${path}; wrote ${[...result.sink.files.keys()].join(", ")}`);
  }
  return JSON.parse(text) as WrittenMetrics;
}

describe("the whole command files the truth side into M48's one artifact", () => {
  it("1/10/11 — a TEST unit carries real truth figures, 21 ε points and 4 τ points", async () => {
    const root = tempDir();
    writeDataset(root, EXERCISED_SPLIT, 9100);
    const result = await bench(root, EXERCISED_SPLIT, 9100, "ASSAY");
    expect(result.err, result.err).toBe("");
    expect(result.code).toBe(0);

    const written = readMetrics(result, EXERCISED_SPLIT, 9100, "ASSAY");
    expect(written.base.truth.scored).toBe(true);
    expect(written.base.truth.not_scored).toBeNull();
    const report = written.base.truth.report;
    expect(report).not.toBeNull();
    for (const value of [
      report?.net_cost.net_cost_paise,
      report?.harm.balance_harm_paise,
      report?.harm.misdirected_value_paise,
      report?.match.match_f1,
      report?.gap_to_oracle_paise,
      report?.truly_ambiguous,
    ]) {
      expect(typeof value).toBe("number");
    }

    // M51's grids, unmoved: 21 nested ε points and 4 τ points inside ONE unit.
    expect(written.sweeps.epsilon).toHaveLength(21);
    expect(written.sweeps.tau).toHaveLength(4);
    expect(written.sweeps.epsilon.filter((p) => p.is_operating_point === true)).toHaveLength(1);
    expect(written.sweeps.epsilon.map((p) => p.parameter_name)).toStrictEqual(
      Array.from({ length: 21 }, () => "epsilon_bps"),
    );
    // Every ε point carries the y-axis; no τ point does.
    for (const p of written.sweeps.epsilon) expect(typeof p.balance_harm_paise).toBe("number");
    for (const p of written.sweeps.tau) expect(Object.keys(p)).not.toContain("balance_harm_paise");

    // Metric 3, integrated over that curve.
    expect(written.risk_coverage.scored).toBe(true);
    expect(typeof written.risk_coverage.report?.aurc_paise).toBe("number");
    expect(written.risk_coverage.report?.curve).toHaveLength(21);
  });

  it("M57 — metric 7 is produced through the production path on DEV and TEST", async () => {
    // §2's scoring loop runs over {dev, test} and metric 7 rides the same seam
    // as metrics 2, 4, 5, 6 and 8: one truth read, one ScoringTruth, no second
    // reader. Whether a figure exists is M57's population's business, so this
    // asserts the WIRING on both splits rather than a number the fixture would
    // have to manufacture.
    for (const [split, seed, agent] of [
      ["dev", 2000, "A3-NOLLM"],
      [EXERCISED_SPLIT, 9100, "ASSAY"],
    ] as const) {
      const root = tempDir();
      writeDataset(root, split, seed);
      const written = readMetrics(await bench(root, split, seed, agent), split, seed, agent);

      // The report carries §4.6's field on both splits, and its value is either
      // a CalibrationReport with ten bins or M57's N = 0.
      expect(written.base.truth.scored).toBe(true);
      expect(Object.keys(written.base.truth.report ?? {})).toContain("calibration");
      const calibrationReport = written.base.truth.report?.calibration ?? null;
      if (calibrationReport !== null) {
        expect(calibrationReport.bins).toHaveLength(10);
        expect(calibrationReport.n).toBeGreaterThan(0);
      }

      // The headline is READ OFF that report, never computed a second time, so
      // the scalar and the diagram beside it can never disagree.
      expect(written.base.ece).toBe(calibrationReport?.ece ?? null);

      // ece and ece_state are exclusive: a reader never sees a figure and a
      // refusal together, and never sees neither.
      expect(written.base.ece === null).toBe(written.base.ece_state !== null);
      // And an unavailable metric is NEVER the 0.0 §5.5 forbids (M57, M56).
      if (written.base.ece === null) expect(written.base.ece).not.toBe(0);
    }
  });

  it("M57 — an unscored unit says metric 7 needs the truth side, and reports no 0.0", async () => {
    // TRAIN is outside §2's loop, so no answer key is opened and metric 7 has no
    // population to be empty OR full. The two reasons stay distinguishable.
    const root = tempDir();
    writeDataset(root, "train", 1000);
    const written = readMetrics(await bench(root, "train", 1000, "A3-NOLLM"), "train", 1000, "A3-NOLLM");
    expect(written.base.truth.scored).toBe(false);
    expect(written.base.ece).toBeNull();
    expect(written.base.ece).not.toBe(0);
    expect(written.base.ece_state).toContain("needs EVALUATION_SPEC.md §4.6's truth side");
    expect(written.base.ece_state).not.toBe(METRIC_7_ECE_EMPTY_POPULATION);
  });

  it("DEV-1/2 — metrics 2, 4, 5, 6 and 8 compute from the DEV answer key and labels", async () => {
    // EVALUATION_SPEC.md §2 loops `for split in {dev, test}` around the score()
    // line, and §7's reproduction recipe -- "a third party ... must be able to
    // reproduce EVERY number" -- generates, labels and benches DEV alone. A DEV
    // unit therefore carries real truth-side figures, not nulls.
    const root = tempDir();
    writeDataset(root, "dev", 2000);
    const result = await bench(root, "dev", 2000, "A3-NOLLM");
    expect(result.err, result.err).toBe("");
    expect(result.code).toBe(0);

    const written = readMetrics(result, "dev", 2000, "A3-NOLLM");
    expect(written.base.truth.scored).toBe(true);
    expect(written.base.truth.not_scored).toBeNull();
    const report = written.base.truth.report;
    for (const value of [
      report?.net_cost.net_cost_paise,          // metric 2
      report?.harm.balance_harm_paise,          // metric 6(a)
      report?.harm.misdirected_value_paise,     // metric 6(b)
      report?.match.match_f1,                   // metric 5
      report?.abstention.abstention_precision,  // metric 4 -- reads the labels
      report?.truly_ambiguous,                  // metric 4/8's oracle input
      report?.gap_to_oracle_paise,              // metric 8
    ]) {
      expect(typeof value).toBe("number");
    }
    // Metric 3 too. A3-NOLLM is a §5.1 single point, so its curve is the one
    // point at the frozen ε -- and that point now has a risk axis on DEV.
    expect(written.risk_coverage.scored).toBe(true);
    expect(written.risk_coverage.not_scored).toBeNull();
    expect(written.risk_coverage.report?.curve).toHaveLength(1);
    expect(typeof written.risk_coverage.report?.aurc_paise).toBe("number");
  });

  it("DEV-2 — the oracle labels are the DEV metric-4 input, and they move it", async () => {
    const ambiguous = tempDir();
    const clean = tempDir();
    writeDataset(ambiguous, "dev", 2000);
    const dir = writeDataset(clean, "dev", 2000, { oracleLabels: false });
    writeFileSync(
      join(dir, "oracle_labels.jsonl"),
      labelsJsonl([
        { target_id: SETL(80), label: "UNAMBIGUOUS" },
        { target_id: BNK(81), label: "UNAMBIGUOUS" },
      ]),
      "utf8",
    );

    const a = readMetrics(await bench(ambiguous, "dev", 2000, "A3-NOLLM"), "dev", 2000, "A3-NOLLM");
    const b = readMetrics(await bench(clean, "dev", 2000, "A3-NOLLM"), "dev", 2000, "A3-NOLLM");
    expect(a.base.truth.report?.truly_ambiguous).toBe(1);
    expect(b.base.truth.report?.truly_ambiguous).toBe(0);
    // Metric 8's reference policy follows the label set and nothing else does.
    expect(a.base.truth.report?.oracle_policy_net_cost_paise).toBe(
      (b.base.truth.report?.oracle_policy_net_cost_paise ?? 0) + C_REVIEW_PAISE,
    );
    expect(a.base.truth.report?.harm).toStrictEqual(b.base.truth.report?.harm);
  });

  it("DEV-3 — metrics 15 and 16 stay not-exercised on DEV, with the key open", async () => {
    const root = tempDir();
    writeDataset(root, "dev", 2000);
    const written = readMetrics(
      await bench(root, "dev", 2000, "A3-NOLLM"), "dev", 2000, "A3-NOLLM",
    );
    // The answer key WAS read for §4.4 on this very unit...
    expect(written.base.truth.scored).toBe(true);
    // ...and M52's disposition is untouched: F10 lives at TEST seeds 9100-9104,
    // so the injected set is empty on DEV and the metrics are undefined rather
    // than zero. `report` stays null -- never a real count of 0, never a rate.
    expect(written.base.robustness.exercised).toBe(false);
    expect(written.base.robustness.report).toBeNull();
    expect(written.base.robustness.not_exercised).toContain("not exercised on dev");
  });

  it("DEV-4/5 — a DEV unit fails closed when either truth artifact is missing", async () => {
    const noTruth = tempDir();
    writeDataset(noTruth, "dev", 2000, { groundTruth: false });
    const a = await bench(noTruth, "dev", 2000, "A3-NOLLM");
    expect(a.code).not.toBe(0);
    expect(a.err).toMatch(/ground_truth\.jsonl/);
    expect(a.sink.files.size).toBe(0);

    const noLabels = tempDir();
    writeDataset(noLabels, "dev", 2000, { oracleLabels: false });
    const b = await bench(noLabels, "dev", 2000, "A3-NOLLM");
    expect(b.code).not.toBe(0);
    expect(b.err).toMatch(/oracle_labels\.jsonl/);
    expect(b.sink.files.size).toBe(0);
  });

  it("6 — TRAIN is outside §2's loop and opens neither artifact", async () => {
    const root = tempDir();
    // The train dataset carries NEITHER artifact. §2 loops over {dev, test}, so
    // the command must still run and take no truth-side measurement.
    writeDataset(root, "train", 1000, { groundTruth: false, oracleLabels: false });
    const result = await bench(root, "train", 1000, "A3-NOLLM");
    expect(result.err, result.err).toBe("");
    expect(result.code).toBe(0);

    const written = readMetrics(result, "train", 1000, "A3-NOLLM");
    expect(written.base.truth.scored).toBe(false);
    expect(written.base.truth.report).toBeNull();
    expect(written.base.truth.not_scored).toContain("not scored on train");
    expect(written.base.truth.not_scored).toContain("{dev, test}");
    expect(written.base.robustness.exercised).toBe(false);
    expect(written.base.robustness.report).toBeNull();
    expect(written.risk_coverage.scored).toBe(false);
    expect(written.risk_coverage.report).toBeNull();
    expect(written.risk_coverage.not_scored).toBe(NO_RISK_AXIS);
    // Metric 1 is agent-side and is still a real number on TRAIN.
    expect(typeof written.base.coverage_by_value).toBe("number");
    expect(isTruthScoredSplit("train")).toBe(false);
    expect(TRUTH_SCORED_SPLITS).toStrictEqual(["dev", "test"]);
  });

  it("3/7 — a TEST unit fails closed when either truth artifact is missing", async () => {
    const noTruth = tempDir();
    writeDataset(noTruth, EXERCISED_SPLIT, 9100, { groundTruth: false });
    const a = await bench(noTruth, EXERCISED_SPLIT, 9100, "A3-NOLLM");
    expect(a.code).not.toBe(0);
    expect(a.err).toMatch(/ground_truth\.jsonl/);
    expect(a.sink.files.size).toBe(0);

    const noLabels = tempDir();
    writeDataset(noLabels, EXERCISED_SPLIT, 9100, { oracleLabels: false });
    const b = await bench(noLabels, EXERCISED_SPLIT, 9100, "A3-NOLLM");
    expect(b.code).not.toBe(0);
    expect(b.err).toMatch(/oracle_labels\.jsonl/);
    expect(b.sink.files.size).toBe(0);
  });

  it("8 — metric 7 reports N = 0 as a state, never as a 0.0 (M57)", async () => {
    const root = tempDir();
    writeDataset(root, EXERCISED_SPLIT, 9100);
    const written = readMetrics(
      await bench(root, EXERCISED_SPLIT, 9100, "A3-NOLLM"), EXERCISED_SPLIT, 9100, "A3-NOLLM",
    );
    // This fixture's targets solve UNIQUE, so §6 step 3's DISCRIMINATED branch
    // commits nothing and M57's population is empty. The metric is UNAVAILABLE
    // with its reason -- the state metric 10 uses, reused rather than reinvented.
    expect(written.base.truth.report).not.toBeNull();
    expect(written.base.truth.report?.calibration).toBeNull();
    expect(written.base.ece).toBeNull();
    expect(written.base.ece).not.toBe(0);
    expect(written.base.ece_state).toBe(METRIC_7_ECE_EMPTY_POPULATION);
    expect(written.base.ece_state).toContain("N = 0");
  });

  it("12 — the agent-side metrics do not move when the answer key does", async () => {
    const a = tempDir();
    const b = tempDir();
    writeDataset(a, EXERCISED_SPLIT, 9100);
    const dir = writeDataset(b, EXERCISED_SPLIT, 9100, { groundTruth: false });
    // A different answer key over the same observations: a journal twice the size.
    writeFileSync(
      join(dir, "ground_truth.jsonl"),
      `${JSON.stringify({
        ...truthRecord({
          allocations: [{ settlement_id: SETL(80), entity_id: PAY(83) }],
          journal: [
            { source_entity_id: PAY(83), account: "1200_BANK", dr_paise: 2_000_000, cr_paise: 0 },
          ],
        }),
        seed: 9100,
      })}\n`,
      "utf8",
    );

    const fromA = readMetrics(
      await bench(a, EXERCISED_SPLIT, 9100, "A3-NOLLM"), EXERCISED_SPLIT, 9100, "A3-NOLLM",
    );
    const fromB = readMetrics(
      await bench(b, EXERCISED_SPLIT, 9100, "A3-NOLLM"), EXERCISED_SPLIT, 9100, "A3-NOLLM",
    );
    expect(agentSide(fromA.base)).toStrictEqual(agentSide(fromB.base));
  });

  it("6 — metric 10's state reaches the artifact, and it is not a matrix", async () => {
    const root = tempDir();
    writeDataset(root, EXERCISED_SPLIT, 9100);
    const written = readMetrics(
      await bench(root, EXERCISED_SPLIT, 9100, "A3-NOLLM"), EXERCISED_SPLIT, 9100, "A3-NOLLM",
    );
    expect(written.base.exception_class_confusion).toBeNull();
    expect(written.base.exception_class_confusion_state).toBe(M54_METRIC_10_NOT_COMPUTABLE);
  });

  it("14 — a sealed TEST run scores the same and still emits aggregates only", async () => {
    const root = tempDir();
    writeDataset(root, EXERCISED_SPLIT, 9100);
    const sealed = await bench(root, EXERCISED_SPLIT, 9100, "ASSAY", ["--sealed"]);
    const open = await bench(root, EXERCISED_SPLIT, 9100, "ASSAY");
    expect(sealed.err, sealed.err).toBe("");

    const path = ["runs", "truth", EXERCISED_SPLIT, "9100", "ASSAY", "offline", "metrics.json"]
      .join("/");
    // M56: one path through the scorer, so the flag changes nothing it computes.
    expect(sealed.sink.files.get(path)).toBe(open.sink.files.get(path));

    // AL5 is an emission rule: no ground-truth or label row, field or path may
    // appear in the artifact or on stdout.
    const artifact = sealed.sink.files.get(path) ?? "";
    for (const token of [
      "gt_version", "family_id", "true_journal", "true_balances", "degradations",
      "allocations", "source_entity_id", "dr_paise", "cr_paise",
      "TRULY_AMBIGUOUS", "target_id", SETL(80), PAY(82), BNK(81),
      "1.1.0", "F10", "ground_truth.jsonl", "oracle_labels.jsonl",
    ]) {
      expect(artifact, `artifact carries ${token}`).not.toContain(token);
      expect(`${sealed.out}\n${sealed.err}`, `stdout carries ${token}`).not.toContain(token);
    }
    // Exactly one artifact per scored unit; no label file is rewritten.
    expect([...sealed.sink.files.keys()]).toStrictEqual([path]);
  });
});
