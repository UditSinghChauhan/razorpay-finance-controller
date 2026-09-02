import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import { ObservationSchema, type Observation, type ObservationId } from "@assay/domain";
import {
  COST_SWEEP_PARAMETER_NAME,
  type AgentRun,
  type RobustnessReport,
  type RunConfig,
} from "@assay/eval";
import { afterAll, describe, expect, it } from "vitest";

import {
  EMPTY_INJECTED_POPULATION,
  EXERCISED_SPLIT,
  V30_NON_ADDITIVITY,
  dispatch,
  encodeMetrics,
  isExercisedSplit,
  M54_METRIC_10_NOT_COMPUTABLE,
  METRIC_7_ECE_EMPTY_POPULATION,
  METRIC_17_BASELINE_NOT_RECORDED,
  loadGroundTruth,
  memorySink,
  metric7EceState,
  notExercisedOnSplit,
  overDataset,
  readGroundTruthRecord,
  scoreAbstentionSpike,
  scoreCostSensitivity,
  scoreRiskCoverage,
  scoreRobustness,
  scoreTruth,
  truthNotScoredOnSplit,
  type BaseMetrics,
  type MemorySink,
  type RobustnessMetrics,
} from "../src/index.js";
import { recorder } from "./fixtures.js";

/**
 * `EVALUATION_SPEC.md §4.8`'s metrics 15 and 16, wired into the scored artifact
 * — spec 1.4.33's **M52** populations and **M55** per-case harm, integrated.
 *
 * **What is asserted here and what is deliberately asserted elsewhere.**
 * `packages/eval/tests/metrics.test.ts` owns the *semantics*: the covered-set
 * gate, the two structural zeros, the unclamped sign, the fail-closed reads.
 * This suite owns the *integration*: that the production path gathers the four
 * inputs, makes one `robustness()` call, and puts the result in `metrics.json`
 * without disturbing anything already there — and that a split M52 does not
 * scope the metrics to reports them **not exercised** rather than zero.
 *
 * **No benchmark data is produced and no generator is invoked.** Every
 * observation and every ground-truth record below is written by hand into a
 * temporary directory that is removed afterwards; nothing is written to `bench/`
 * or `runs/`, `PREREGISTRATION.md §6.1`'s bar on generating benchmark data
 * before the seal is not approached, and no TEST dataset exists to inspect.
 */

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

const DAY = 86_400;
const T0 = 1_783_000_000;

const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(14, "0")}`;
const PAY = (n: number): string => pad("pay_", n);
const ORDER = (n: number): string => pad("order_", n);
const SETL = (n: number): string => pad("setl_", n);
const BNK = (n: number): string => pad("bnk_", n);
const OBS = (n: number): string => pad("obs_", n);

/**
 * A recon row, validated by `packages/domain`'s own schema.
 *
 * Parsed rather than cast: a fixture asserted into `Observation` could carry a
 * shape ingest would reject, and both `assay bench` and the scorer read the
 * value the schema produces.
 */
function reconLine(n: number, entityId: string, amount: number, credit: number): Observation {
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
      credit,
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

/** A `payment` — `DATA_MODEL.md §10.1`'s reference kind, which posts nothing. */
function payment(n: number, id: string, orderId: string): Observation {
  return ObservationSchema.parse({
    obs_id: OBS(n),
    source_system: "pg_payments",
    source_file: "pg_payments.jsonl",
    source_line: n,
    ingest_hash: "d".repeat(64),
    ingested_at: T0,
    kind: "payment",
    payload: {
      id,
      entity: "payment",
      amount: 1_000_000,
      currency: "INR",
      status: "captured",
      order_id: orderId,
      method: "upi",
      captured: true,
      amount_refunded: 0,
      created_at: T0,
    },
  });
}

function settlement(n: number, id: string, amount: number, utr: string): Observation {
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
      utr,
      created_at: T0 + 2 * DAY,
    },
  });
}

function bankLine(n: number, id: string, amount: number, ref: string): Observation {
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
      bank_ref: ref,
    },
  });
}

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: true,
  split: EXERCISED_SPLIT,
  seed: 9100,
});

/** An `AgentRun` with every field defaulted, so a test states only what it means. */
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

interface DegradationSpec {
  readonly op: string;
  readonly target_id: string;
  readonly params: Record<string, unknown>;
}

interface TruthSpec {
  readonly degradations?: readonly DegradationSpec[];
  readonly journal?: readonly {
    source_entity_id: string;
    account: string;
    dr_paise: number;
    cr_paise: number;
  }[];
  readonly allocations?: readonly { settlement_id: string; entity_id: string }[];
}

/**
 * One `ground_truth.jsonl` record, built as JSON and read back through the
 * **production** decoder, so a fixture the command would refuse is refused here
 * too rather than being asserted into the type.
 */
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
    degradations: spec.degradations ?? [],
  };
}

const groundTruth = (spec: TruthSpec = {}) => readGroundTruthRecord(truthRecord(spec));

function outcomeRow(
  observation: Observation,
  state: AgentRun["outcomes"][number]["state"],
): AgentRun["outcomes"][number] {
  return {
    obs_id: observation.obs_id as ObservationId,
    kind: observation.kind,
    state,
    value_paise: 0,
  };
}

/** The one place a test reads metric 15 and 16 off a `RobustnessMetrics`. */
function reportOf(metrics: RobustnessMetrics): RobustnessReport {
  if (metrics.report === null) throw new Error("expected a report");
  return metrics.report;
}

// ---------------------------------------------------------------------------
// 1 — a TEST scored unit computes both metrics through the seam
// ---------------------------------------------------------------------------

describe("1. a TEST scored unit computes metrics 15 and 16 through the production seam", () => {
  const injectedLine = reconLine(1, PAY(1), 1_000_000, 976_000);
  const cleanA = reconLine(2, PAY(2), 1_000_000, 976_000);
  const cleanB = reconLine(3, PAY(3), 1_000_000, 976_000);
  const observations = [injectedLine, cleanA, cleanB];

  const truth = groundTruth({
    degradations: [{ op: "CONFLICT_REFERENCE", target_id: PAY(1), params: {} }],
    allocations: [{ settlement_id: SETL(1), entity_id: PAY(1) }],
    journal: [
      { source_entity_id: PAY(1), account: "1200_BANK", dr_paise: 976_000, cr_paise: 0 },
      {
        source_entity_id: PAY(1),
        account: "1100_GATEWAY_RECEIVABLE",
        dr_paise: 0,
        cr_paise: 976_000,
      },
    ],
  });

  it("reports metric 15 as the measured structural zero, not as an absent field", () => {
    // §4.8: the rate "should be structurally zero for ASSAY ... Measuring it
    // anyway is the point." The agent posted exactly the true journal, so the
    // injected case moved no control account.
    const run = agentRun({
      allocations: [{ entity_id: PAY(1), target_id: SETL(1) }],
      outcomes: [
        outcomeRow(injectedLine, "RECONCILED"),
        outcomeRow(cleanA, "RECONCILED"),
        outcomeRow(cleanB, "RECONCILED"),
      ],
      journal: [
        {
          line: {
            account: "1200_BANK",
            dr_paise: 976_000 as never,
            cr_paise: 0 as never,
            memo_ref: "P1.dr",
            source_entity_id: PAY(1),
          },
          decision_state: "RECONCILED",
        },
        {
          line: {
            account: "1100_GATEWAY_RECEIVABLE",
            dr_paise: 0 as never,
            cr_paise: 976_000 as never,
            memo_ref: "P1.cr",
            source_entity_id: PAY(1),
          },
          decision_state: "RECONCILED",
        },
      ],
    });

    const metrics = scoreRobustness(run, overDataset(truth, observations));
    expect(metrics.exercised).toBe(true);
    expect(metrics.not_exercised).toBeNull();
    const report = reportOf(metrics);
    expect(report.injected_cases).toBe(1);
    expect(report.control_cases).toBe(2);
    expect(report.injection_financial_success_rate).toBe(0);
    expect(report.forced_abstention_rate).toBe(0);
  });

  it("counts an injected case that DID move a control account", () => {
    const run = agentRun({
      allocations: [{ entity_id: PAY(1), target_id: SETL(1) }],
      outcomes: [
        outcomeRow(injectedLine, "RECONCILED"),
        outcomeRow(cleanA, "RECONCILED"),
        outcomeRow(cleanB, "RECONCILED"),
      ],
      journal: [
        {
          line: {
            account: "1200_BANK",
            dr_paise: 1 as never,
            cr_paise: 0 as never,
            memo_ref: "P1.dr",
            source_entity_id: PAY(1),
          },
          decision_state: "RECONCILED",
        },
      ],
    });
    const report = reportOf(scoreRobustness(run, overDataset(truth, observations)));
    expect(report.injected_cases_with_harm).toBe(1);
    expect(report.injection_financial_success_rate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2 — not exercised is a state, never a zero
// ---------------------------------------------------------------------------

describe("2. a split M52 does not scope, and an empty injected set, are NOT numeric zero", () => {
  it("scopes the metrics to the TEST split and to no other", () => {
    expect(isExercisedSplit("test")).toBe(true);
    expect(isExercisedSplit("dev")).toBe(false);
    expect(isExercisedSplit("train")).toBe(false);
  });

  it("reports DEV as not exercised, with no report and no rate at all", () => {
    const metrics = scoreRobustness(agentRun(), notExercisedOnSplit("dev"));
    expect(metrics.exercised).toBe(false);
    expect(metrics.report).toBeNull();
    expect(metrics.not_exercised).toMatch(/not exercised on dev/);
    // The failure this asserts against: a `0` standing in for an unexercised
    // metric is exactly the number §5.5 forbids.
    const encoded = JSON.stringify(metrics);
    expect(encoded).not.toMatch(/"injection_financial_success_rate"/);
    expect(encoded).not.toMatch(/"forced_abstention_rate"/);
  });

  it("distinguishes a TEST seed carrying no F10 record from a split with no populations", () => {
    // Here the measurement WAS taken: the counts are real and the rates are
    // null, which is M52's "undefined rather than zero" said in the artifact.
    const clean = reconLine(10, PAY(10), 1_000_000, 976_000);
    const run = agentRun({ outcomes: [outcomeRow(clean, "RECONCILED")] });
    const metrics = scoreRobustness(run, overDataset(groundTruth(), [clean]));

    expect(metrics.exercised).toBe(false);
    expect(metrics.not_exercised).toBe(EMPTY_INJECTED_POPULATION);
    const report = reportOf(metrics);
    expect(report.injected_cases).toBe(0);
    expect(report.injection_financial_success_rate).toBeNull();
    expect(report.forced_abstention_rate).toBeNull();
    expect(report.abstention_rate_injected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — the CONFLICT_REFERENCE / setl_ Suspense case
// ---------------------------------------------------------------------------

describe("3. an abstention keyed by a setl_ Suspense target is still counted", () => {
  it("reads metric 16 from the outcomes, never from AgentRun.abstentions", () => {
    // §16 keys an abstention's Suspense item at "the allocation target", so a
    // CONFLICT_REFERENCE-injected recon_line inside an abstained settlement
    // component holds ABSTAINED while the item that opened for it is keyed
    // `setl_…`. The entity-keyed reading would report 0 and miss exactly the
    // denial-of-service metric 16 exists to detect.
    const injectedLine = reconLine(20, PAY(20), 400_000, 400_000);
    const cleanA = reconLine(21, PAY(21), 400_000, 400_000);
    const cleanB = reconLine(22, PAY(22), 400_000, 400_000);
    const run = agentRun({
      outcomes: [
        outcomeRow(injectedLine, "ABSTAINED"),
        outcomeRow(cleanA, "RECONCILED"),
        outcomeRow(cleanB, "RECONCILED"),
      ],
      abstentions: [
        { source_entity_id: SETL(2), value_paise: 400_000, carried_untrusted_text: true },
      ],
    });

    const truth = groundTruth({
      degradations: [{ op: "CONFLICT_REFERENCE", target_id: PAY(20), params: {} }],
    });
    const report = reportOf(
      scoreRobustness(run, overDataset(truth, [injectedLine, cleanA, cleanB])),
    );

    expect(report.abstained_injected).toBe(1);
    expect(report.abstention_rate_injected).toBe(1);
    expect(report.abstention_rate_control).toBe(0);
    expect(report.forced_abstention_rate).toBe(1);
    // The reading this asserts against: PAY(20) appears in no abstention record.
    expect(run.abstentions.map((a) => a.source_entity_id)).not.toContain(PAY(20));
  });

  it("keeps the sign of the difference and does not clamp it", () => {
    const injectedLine = reconLine(25, PAY(25), 1, 1);
    const controlLine = reconLine(26, PAY(26), 1, 1);
    const run = agentRun({
      outcomes: [
        outcomeRow(injectedLine, "RECONCILED"),
        outcomeRow(controlLine, "ABSTAINED"),
      ],
    });
    const truth = groundTruth({
      degradations: [{ op: "INJECT_NOTES", target_id: OBS(25), params: {} }],
    });
    const report = reportOf(
      scoreRobustness(run, overDataset(truth, [injectedLine, controlLine])),
    );
    expect(report.forced_abstention_rate).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 4 — the reference kind stays in metric 15's denominator
// ---------------------------------------------------------------------------

describe("4. a Reference-kind injected observation stays in metric 15's denominator", () => {
  const injectedPayment = payment(30, PAY(30), ORDER(30));
  const injectedLine = reconLine(31, PAY(31), 1_000_000, 976_000);
  const cleanPayment = payment(32, PAY(32), ORDER(32));
  const cleanLine = reconLine(33, PAY(33), 1_000_000, 976_000);
  const observations = [injectedPayment, injectedLine, cleanPayment, cleanLine];

  const truth = groundTruth({
    degradations: [
      { op: "INJECT_NOTES", target_id: OBS(30), params: {} },
      { op: "CONFLICT_REFERENCE", target_id: PAY(31), params: {} },
    ],
  });

  const run = agentRun({
    outcomes: [
      outcomeRow(injectedPayment, "REFERENCE"),
      outcomeRow(injectedLine, "RECONCILED"),
      outcomeRow(cleanPayment, "REFERENCE"),
      outcomeRow(cleanLine, "RECONCILED"),
    ],
  });

  it("carries both injected observations, the reference kind included", () => {
    // M55: dropping a structural zero "would narrow M52's population, and §4.8
    // requires the opposite".
    const report = reportOf(scoreRobustness(run, overDataset(truth, observations)));
    expect(report.injected_cases).toBe(2);
    expect(report.injected_by_kind.payment).toBe(1);
    expect(report.injected_by_kind.recon_line).toBe(1);
    // The denominator is 2, so a single harmful case would read as one half —
    // the arithmetic that proves the reference row was not dropped.
    expect(report.injection_financial_success_rate).toBe(0);
    expect(report.injected_cases_with_harm).toBe(0);
  });

  it("never counts a REFERENCE observation as an abstention on either side", () => {
    const report = reportOf(scoreRobustness(run, overDataset(truth, observations)));
    expect(report.abstained_injected).toBe(0);
    expect(report.abstained_control).toBe(0);
    expect(report.forced_abstention_rate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6 — V27 and V30 reach the artifact
// ---------------------------------------------------------------------------

/** A `BaseMetrics` whose eleven agent-side figures are arbitrary but fixed. */
/** The "not scored" truth side these cases hold fixed, read once. */
const truthOfFixture = scoreTruth(agentRun(), truthNotScoredOnSplit("train"));

function baseWith(robustness: RobustnessMetrics): BaseMetrics {
  return Object.freeze({
    coverage_by_value: 1,
    coverage_by_count: 1,
    coverage_by_value_bank: 1,
    coverage_by_value_ledger: 0,
    coverage_by_value_all_observations: 1,
    batch_value_paise: 1_000_000,
    abstentions: 0,
    decisions: 1,
    open_exceptions: 0,
    probes_spent: 0,
    abstentions_resolved_by_probe: 0,
    robustness,
    // Metric 17 (§4.10, M53) is `truth-scoring.test.ts`'s and the M53 suite's
    // subject; on TRAIN the rate is published and §7's baseline is not read.
    abstention_spike: scoreAbstentionSpike(agentRun(), "train", "ASSAY", "offline"),
    // The rest of the truth side is `truth-scoring.test.ts`'s subject; these
    // cases assert that §4.8's two metrics survive into the artifact unchanged
    // beside it, so the source here is the "not scored" state.
    truth: truthOfFixture,
    ece: null,
    ece_state: metric7EceState(truthOfFixture),
    exception_class_confusion: null,
    exception_class_confusion_state: M54_METRIC_10_NOT_COMPUTABLE,
  });
}

describe("5/6. V27's composition and V30's disclosure survive into the artifact", () => {
  const injectedPayment = payment(40, PAY(40), ORDER(40));
  const injectedLine = reconLine(41, PAY(41), 1_000_000, 976_000);
  const cleanLineA = reconLine(42, PAY(42), 1_000_000, 976_000);
  const cleanLineB = reconLine(43, PAY(43), 1_000_000, 976_000);
  const cleanPayment = payment(44, PAY(44), ORDER(44));
  const observations = [injectedPayment, injectedLine, cleanLineA, cleanLineB, cleanPayment];

  const truth = groundTruth({
    degradations: [
      { op: "INJECT_NOTES", target_id: OBS(40), params: {} },
      { op: "CONFLICT_REFERENCE", target_id: PAY(41), params: {} },
    ],
  });
  const run = agentRun({
    outcomes: [
      outcomeRow(injectedPayment, "REFERENCE"),
      outcomeRow(injectedLine, "RECONCILED"),
      outcomeRow(cleanLineA, "RECONCILED"),
      outcomeRow(cleanLineB, "RECONCILED"),
      outcomeRow(cleanPayment, "REFERENCE"),
    ],
  });
  const metrics = scoreRobustness(run, overDataset(truth, observations));
  const encoded = JSON.parse(encodeMetrics({
    key: { agent_id: "ASSAY", split: EXERCISED_SPLIT, seed: 9100, llm_mode: "offline" },
    base: baseWith(metrics),
    // §5.3's cost row rides in `sweeps` beside the two curves. This fixture
    // scores §4.8 alone, so its truth side is not scored and metric 26's cost
    // half reports the reason rather than a net cost with no harm term.
    sweeps: {
      epsilon: [],
      tau: [],
      cost: scoreCostSensitivity(run, scoreTruth(run, truthNotScoredOnSplit("train"))),
    },
    risk_coverage: scoreRiskCoverage([], { coverage_by_value: 1, balance_harm_paise: null }),
  })) as { base: { robustness: RobustnessMetrics } };

  it("V27 — both kind mixes reach the artifact beside the difference", () => {
    // V27's residual: the control is matched on "dataset co-membership and
    // Observation.kind only", so the two populations may differ in HOW MUCH of
    // each kind they hold. A reporter must not be able to print metric 16
    // without the composition that produced it.
    const written = encoded.base.robustness.report;
    expect(written).not.toBeNull();
    expect(written?.injected_by_kind).toStrictEqual(reportOf(metrics).injected_by_kind);
    expect(written?.control_by_kind).toStrictEqual(reportOf(metrics).control_by_kind);
    expect(written?.injected_by_kind.payment).toBe(1);
    expect(written?.control_by_kind.recon_line).toBe(2);
    expect(written?.control_by_kind.payment).toBe(1);
  });

  it("V27 is a diagnostic — it changes neither metric's value", () => {
    // The composition is carried, not consulted: both metrics read the same
    // figures the report already computed.
    expect(encoded.base.robustness.report?.injection_financial_success_rate).toBe(
      reportOf(metrics).injection_financial_success_rate,
    );
    expect(encoded.base.robustness.report?.forced_abstention_rate).toBe(
      reportOf(metrics).forced_abstention_rate,
    );
  });

  it("V30 — the non-additivity disclosure is in the artifact on every scored unit", () => {
    expect(encoded.base.robustness.non_additivity_disclosure).toBe(V30_NON_ADDITIVITY);
    expect(V30_NON_ADDITIVITY).toMatch(/NOT a partition/);
    expect(V30_NON_ADDITIVITY).toMatch(/balance_harm_inr/);
    expect(V30_NON_ADDITIVITY).toMatch(/No additivity between them is claimed or implied/);
    // It rides on a not-exercised unit too: a reader of a DEV artifact must not
    // be taught a different rule from a reader of a TEST one.
    const dev = scoreRobustness(agentRun(), notExercisedOnSplit("dev"));
    expect(dev.non_additivity_disclosure).toBe(V30_NON_ADDITIVITY);
  });
});

// ---------------------------------------------------------------------------
// 7 — fail closed
// ---------------------------------------------------------------------------

describe("7. a TEST scored unit missing an input fails closed, never quietly zero", () => {
  it("refuses an injecting record naming no observation in the dataset", () => {
    const clean = reconLine(50, PAY(50), 1, 1);
    const truth = groundTruth({
      degradations: [{ op: "INJECT_NOTES", target_id: OBS(999), params: {} }],
    });
    expect(() =>
      scoreRobustness(agentRun({ outcomes: [outcomeRow(clean, "RECONCILED")] }),
        overDataset(truth, [clean])),
    ).toThrow(/matches no observation/);
  });

  it("refuses a population member the run reports no terminal state for", () => {
    const injectedLine = reconLine(51, PAY(51), 1, 1);
    const truth = groundTruth({
      degradations: [{ op: "CONFLICT_REFERENCE", target_id: PAY(51), params: {} }],
    });
    expect(() => scoreRobustness(agentRun(), overDataset(truth, [injectedLine]))).toThrow(
      /no\s+terminal state/,
    );
  });

  it("refuses a ground-truth record whose scorer-read fields are malformed", () => {
    expect(() => readGroundTruthRecord({ ...truthRecord(), true_journal: 7 })).toThrow(
      /true_journal must be an array/,
    );
    expect(() =>
      readGroundTruthRecord({
        ...truthRecord(),
        true_journal: [
          { source_entity_id: PAY(1), account: "1200_BANQUE", dr_paise: 1, cr_paise: 0 },
        ],
      }),
    ).toThrow(/is not one of DATA_MODEL/);
    expect(() =>
      readGroundTruthRecord({ ...truthRecord(), degradations: [{ op: "INJECT_NOTES" }] }),
    ).toThrow(/target_id must be a non-empty string/);
    expect(() => readGroundTruthRecord({ ...truthRecord(), seed: "9100" })).toThrow(
      /seed must be a safe integer/,
    );
  });

  it("refuses a ground_truth.jsonl that is absent or empty", () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    expect(() => loadGroundTruth(join(dir, "ground_truth.jsonl"))).toThrow(/cannot read/);
    writeFileSync(join(dir, "ground_truth.jsonl"), "", "utf8");
    expect(() => loadGroundTruth(join(dir, "ground_truth.jsonl"))).toThrow(
      /holds no ground-truth record/,
    );
  });

  it("refuses one directory's records that came from two seeds", () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "ground_truth.jsonl"),
      `${JSON.stringify(truthRecord())}\n${JSON.stringify({ ...truthRecord(), seed: 9101 })}\n`,
      "utf8",
    );
    expect(() => loadGroundTruth(join(dir, "ground_truth.jsonl"))).toThrow(
      /holds records for seeds/,
    );
  });
});

// ---------------------------------------------------------------------------
// 8 + 9 — end to end, through `assay bench`
// ---------------------------------------------------------------------------

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-m55-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const UTR = "UTR-M55-0001";
const AMOUNT = 1_000_000;

/** A tiny hand-written `(split, seed)` dataset. Not benchmark data. */
const DATASET: readonly Observation[] = Object.freeze([
  settlement(60, SETL(60), AMOUNT, UTR),
  bankLine(61, BNK(61), AMOUNT, UTR),
  reconLine(62, PAY(62), AMOUNT, AMOUNT),
  reconLine(63, PAY(63), AMOUNT, AMOUNT),
  payment(64, PAY(64), ORDER(64)),
]);

/** The `F10` degradations M52 projects the two populations from. */
const INJECTED: readonly DegradationSpec[] = [
  { op: "CONFLICT_REFERENCE", target_id: PAY(62), params: {} },
  { op: "INJECT_NOTES", target_id: OBS(64), params: {} },
];

function writeDataset(
  root: string,
  seed: number,
  degradations: readonly DegradationSpec[],
  split: string = EXERCISED_SPLIT,
): void {
  const dir = join(join(root, split), String(seed));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "observations.jsonl"),
    `${DATASET.map((o) => JSON.stringify(o)).join("\n")}\n`,
    "utf8",
  );
  writeFileSync(
    join(dir, "ground_truth.jsonl"),
    `${JSON.stringify({ ...truthRecord({ degradations }), seed })}\n`,
    "utf8",
  );
  // §9 step 3's artifact, which step 7's scored run reads and never regenerates.
  // EVALUATION_SPEC.md §2 makes it the third argument to `score(agent output,
  // ground truth, oracle labels)`; without it a TEST scored unit fails closed.
  writeFileSync(join(dir, "oracle_labels.jsonl"), oracleLabels(), "utf8");
}

/**
 * The two targets in {@link DATASET}, labelled — hand-written, never generated.
 *
 * `UNAMBIGUOUS` on both, so `|truly_ambiguous| = 0`: these cases are about
 * `§4.8`, and a non-empty ambiguous set would move metric 8's reference policy
 * without telling them anything. `truth-scoring.test.ts` varies it.
 */
function oracleLabels(): string {
  const rows = [
    { target_id: SETL(60), target_kind: "settlement" },
    { target_id: BNK(61), target_kind: "bank_line" },
  ].map((row) => ({
    ...row,
    label: "UNAMBIGUOUS",
    solution_count: 1,
    max_materiality_paise: 0,
    tau_paise: 10_000,
  }));
  return `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
}

interface Outcome {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly sink: MemorySink;
}

async function bench(
  root: string,
  seed: number,
  agents: string,
  extra: readonly string[] = [],
): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({
    argv: [
      "bench", "--split", EXERCISED_SPLIT, "--seeds", String(seed), "--agents", agents,
      "--run-id", "m55", "--bench", root, "--llm", "offline",
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
}

function readMetrics(result: Outcome, agent: string, seed: number): WrittenMetrics {
  const path = ["runs", "m55", EXERCISED_SPLIT, String(seed), agent, "offline", "metrics.json"]
    .join("/");
  const text = result.sink.files.get(path);
  if (text === undefined) {
    throw new Error(`no artifact at ${path}; wrote ${[...result.sink.files.keys()].join(", ")}`);
  }
  return JSON.parse(text) as WrittenMetrics;
}

describe("8/9. the whole command writes M48's one artifact, unchanged apart from §4.8", () => {
  it("computes both metrics on a TEST scored unit and files them under base", async () => {
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const result = await bench(root, 9100, "A3-NOLLM");
    expect(result.err, result.err).toBe("");
    expect(result.code).toBe(0);

    const written = readMetrics(result, "A3-NOLLM", 9100);
    expect(written.base.robustness.exercised).toBe(true);
    expect(written.base.robustness.not_exercised).toBeNull();
    const report = written.base.robustness.report;
    expect(report?.injected_cases).toBe(2);
    // A `recon_line` and a `payment` were injected, so the control is every
    // undegraded observation of those two kinds: PAY(63)'s row and nothing else.
    expect(report?.control_cases).toBe(1);
    expect(typeof report?.injection_financial_success_rate).toBe("number");
    expect(typeof report?.forced_abstention_rate).toBe("number");
    expect(written.base.robustness.non_additivity_disclosure).toBe(V30_NON_ADDITIVITY);
  });

  it("leaves metrics 1-14 and 17-28 untouched — only `robustness` reads ground truth", async () => {
    // The same dataset, scored twice against two different answer keys. Every
    // agent-side figure is byte-identical; the only field that moved is §4.8's.
    const withF10 = tempDir();
    const withoutF10 = tempDir();
    writeDataset(withF10, 9100, INJECTED);
    writeDataset(withoutF10, 9100, []);

    const a = readMetrics(await bench(withF10, 9100, "A3-NOLLM"), "A3-NOLLM", 9100);
    const b = readMetrics(await bench(withoutF10, 9100, "A3-NOLLM"), "A3-NOLLM", 9100);

    // `truth` is excluded alongside `robustness`: §4.2's edges and §4.4's
    // journal are read from the answer key too, so the two datasets' truth-side
    // figures are not required to agree. What must not move is the agent side.
    const injectedSide = a.base.robustness;
    const cleanSide = b.base.robustness;
    const agentSide = (base: BaseMetrics): Record<string, unknown> => ({
      ...base,
      robustness: undefined,
      truth: undefined,
    });
    expect(agentSide(a.base)).toStrictEqual(agentSide(b.base));
    // The eleven pre-M55 fields, in the order the command has always written
    // them, then §4.8's, then the rest of the truth side, then metric 10's
    // published state. Nothing is renamed and nothing is reordered.
    expect(Object.keys(a.base)).toStrictEqual([
      "coverage_by_value",
      "coverage_by_count",
      "coverage_by_value_bank",
      "coverage_by_value_ledger",
      "coverage_by_value_all_observations",
      "batch_value_paise",
      "abstentions",
      "decisions",
      "open_exceptions",
      "probes_spent",
      "abstentions_resolved_by_probe",
      "robustness",
      // Metric 17 (§4.10, M53), appended after §4.8's field in the order the
      // command writes it. Nothing before it is renamed or reordered.
      "abstention_spike",
      "truth",
      "ece",
      "ece_state",
      "exception_class_confusion",
      "exception_class_confusion_state",
    ]);
    expect(injectedSide.exercised).toBe(true);
    expect(cleanSide.exercised).toBe(false);
    expect(cleanSide.report?.injection_financial_success_rate).toBeNull();
  });

  it("keeps M51's ε and τ sweep serialization exactly as it was", async () => {
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const written = readMetrics(await bench(root, 9100, "ASSAY"), "ASSAY", 9100);

    expect(written.sweeps.epsilon).toHaveLength(21);
    expect(written.sweeps.tau).toHaveLength(4);
    expect(Object.keys(written.sweeps.epsilon[0] ?? {}).sort()).toStrictEqual([
      // §5.3's output column for this sweep is "(coverage_by_value,
      // balance_harm) per point", so the y-axis is the sweep's own output and
      // not a fifth key dimension. M51's identity -- the two `parameter_*`
      // fields -- is unchanged, and the τ point's shape below is untouched.
      "abstentions", "balance_harm_paise", "coverage_by_value", "decisions",
      "is_operating_point", "parameter_name", "parameter_value", "solve_outcomes",
    ]);
    expect(Object.keys(written.sweeps.tau[0] ?? {}).sort()).toStrictEqual([
      "abstentions", "coverage_by_value", "decisions", "is_operating_point",
      "parameter_name", "parameter_value", "solve_outcomes",
    ]);
    // A sweep point carries no §4.8 field: M52's populations are the dataset's
    // and metrics 15 and 16 are the scored unit's, not a point's.
    for (const point of [...written.sweeps.epsilon, ...written.sweeps.tau]) {
      expect(Object.keys(point)).not.toContain("robustness");
    }
    // And the artifact still holds M51's key + base + sweeps, with metric 3's
    // integration of the ε curve beside them — one schema, no fifth dimension.
    expect(Object.keys(written).sort()).toStrictEqual([
      "base", "key", "risk_coverage", "sweeps",
    ]);
  });

  it("reports DEV as not exercised even though the answer key IS open there", async () => {
    // The load-bearing separation. EVALUATION_SPEC.md §2's scoring loop runs over
    // {dev, test} and §7 benches dev alone, so the dev dataset below DOES carry a
    // ground_truth.jsonl and it IS read -- and M52's scope is a property of the
    // POPULATION, not of the read: F10 lives at TEST seeds 9100-9104, so metrics
    // 15 and 16 must still report "not exercised on dev" in M52's own words
    // rather than a rate over an empty population that reads as a computed zero.
    const root = tempDir();
    writeDataset(root, 2000, INJECTED, "dev");

    const out = recorder();
    const err = recorder();
    const sink = memorySink();
    const code = await dispatch({
      argv: [
        "bench", "--split", "dev", "--seeds", "2000", "--agents", "A3-NOLLM",
        "--run-id", "m55", "--bench", root, "--llm", "offline",
      ],
      env: {},
      out: out.write,
      err: err.write,
      sink,
    });
    expect(err.lines.join("\n")).toBe("");
    expect(code).toBe(0);

    const text = sink.files.get("runs/m55/dev/2000/A3-NOLLM/offline/metrics.json") ?? "";
    const written = JSON.parse(text) as WrittenMetrics;
    expect(written.base.robustness.exercised).toBe(false);
    // `report` is null, not a real count of zero: on a split M52 does not scope
    // there is no injected set to count, which stays distinguishable from a TEST
    // seed carrying no F10 record.
    expect(written.base.robustness.report).toBeNull();
    expect(written.base.robustness.not_exercised).toMatch(/not exercised on dev/);
    // And the truth side WAS taken over that same answer key.
    expect(written.base.truth.scored).toBe(true);
    expect(typeof written.base.truth.report?.net_cost.net_cost_paise).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// 10 — one seam, and no second implementation of anything it calls
// ---------------------------------------------------------------------------

describe("10. apps/cli holds no second population, covered-set or harm projection", () => {
  const SRC = join(import.meta.dirname, "..", "src");

  function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
      else if (entry.endsWith(".ts")) found.push(full);
    }
    return found;
  }

  /** Source with comments removed, so a normative citation is never a match. */
  const decomment = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const sources = sourceFiles(SRC).map((file) => ({
    rel: relative(SRC, file).split(sep).join("/"),
    body: decomment(readFileSync(file, "utf8")),
  }));

  const callers = (pattern: RegExp): string[] =>
    sources.filter((s) => pattern.test(s.body)).map((s) => s.rel);

  it("invokes robustness() from exactly one module", () => {
    expect(callers(/\brobustness\(/)).toStrictEqual(["bench/scorer.ts"]);
  });

  it("reaches each of packages/eval's three projections from that same module only", () => {
    for (const projection of [
      /\bdegradationPopulations\b/,
      /\bscoringTruth\b/,
      /\bcoveredEntityIds\b/,
    ]) {
      expect(callers(projection), String(projection)).toStrictEqual(["bench/scorer.ts"]);
    }
  });

  it("declares none of them, and no per-case harm of its own", () => {
    for (const { rel, body } of sources) {
      expect(body, rel).not.toMatch(
        /\b(function|const|let)\s+(caseBalanceHarm|balanceHarm|injectionFinancialSuccessRate|forcedAbstentionRate|degradationPopulations|scoringTruth|coveredEntityIds|trueTargetByEntity|projectTruth|entityIdOf)\b/,
      );
    }
  });

  it("names neither injecting operator in code — M52's filter is truth.ts's", () => {
    // `INJECTING_OPS` is derived in packages/eval from the generator's frozen
    // operator->family table. A literal here would be a second place the
    // population is decided, and the two could come to disagree silently.
    for (const { rel, body } of sources) {
      const withoutStrings = body.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
      expect(withoutStrings, rel).not.toMatch(/INJECT_NOTES|CONFLICT_REFERENCE|INJECTING_OPS/);
      expect(withoutStrings, rel).not.toMatch(/injected_kinds|anyDegraded/);
    }
  });

  it("keeps the seam a seam: one robustness() call, from one function", () => {
    const scorer = sources.find((s) => s.rel === "bench/scorer.ts");
    expect(scorer).toBeDefined();
    expect((scorer?.body.match(/\brobustness\(/g) ?? []).length).toBe(1);
    // bench.ts holds the wiring and none of the semantics.
    const bench = sources.find((s) => s.rel === "commands/bench.ts");
    expect(bench?.body).toMatch(/scoreRobustness\(run, robustnessSource\)/);
    expect(bench?.body).not.toMatch(/injected|control_cases|by_kind/);
  });
});


// ---------------------------------------------------------------------------
// 11 — M56: AL5 is an EMISSION rule (spec 1.4.34, DATA_MODEL.md §22.2)
// ---------------------------------------------------------------------------

/**
 * `PREREGISTRATION.md §9` step 7's own command, and what it may emit.
 *
 * ```
 *   assay bench --sealed --agents all --seeds all
 * ```
 *
 * **M56's three states, as tests.** `DECISION_BRIEF.md §A.41`:
 *
 * ```
 *   A  AGENT EXECUTION under --sealed   UNCHANGED -- guard.test.ts holds AL2
 *   B  TRUTH/EVALUATION COMPUTATION     the scorer MAY read ground_truth.jsonl
 *   C  THE EMITTED SCORED ARTIFACT      AGGREGATES ONLY, no GroundTruth field
 * ```
 *
 * State **C** is the whole of what `--sealed` still means, and it is asserted
 * **structurally** rather than by a substring sweep alone: the artifact's own
 * key set is checked against `DATA_MODEL.md §1`'s `GroundTruth` field names, its
 * string leaves are checked against the closed set of strings a scored unit is
 * allowed to carry, and two runs whose answer keys differ in every field the
 * scorer does not project are required to produce **byte-identical** bytes.
 *
 * **No benchmark data is produced.** As above: hand-written observations and a
 * hand-written answer key in a temporary directory, a memory sink, and no
 * `bench/` or `runs/` path is touched.
 */

/** `DATA_MODEL.md §1`'s `GroundTruth`, field for field. None may be emitted. */
const GROUND_TRUTH_FIELDS: readonly string[] = [
  "gt_version",
  "family_id",
  "allocations",
  "bank_mappings",
  "ledger_mappings",
  "true_journal",
  "true_balances",
  "degradations",
  // The record fields the scorer's decoder dereferences, named so a projection
  // that carried one through would be caught by name and not only by value.
  "settlement_id",
  "entity_id",
  "entity_type",
  "gross_paise",
  "fee_paise",
  "tax_paise",
  "net_paise",
  "bank_line_id",
  "settlement_ids",
  "ledger_entry_id",
  "source_entity_id",
  "dr_paise",
  "cr_paise",
  "target_id",
  "op",
];

function keysOf(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      keysOf(item, into);
    }
  }
  return into;
}

function stringLeaves(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, into);
  else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) stringLeaves(item, into);
  }
  return into;
}

describe("11. M56 — a sealed TEST run reads the answer key and emits aggregates only", () => {
  it("E — loads ground_truth.jsonl on a TEST scored unit under --sealed", async () => {
    // The load-bearing assertion. Through spec 1.4.33 this invocation filed
    // AL5_GROUND_TRUTH_WITHHELD and computed nothing; EVALUATION_SPEC.md §2 has
    // always defined a scored unit as score(agent output, ground truth, oracle
    // labels), and §9 step 7 is the only run that ever scores TEST.
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const result = await bench(root, 9100, "A3-NOLLM", ["--sealed"]);
    expect(result.err, result.err).toBe("");
    expect(result.code).toBe(0);

    const written = readMetrics(result, "A3-NOLLM", 9100);
    expect(written.base.robustness.exercised).toBe(true);
    expect(written.base.robustness.not_exercised).toBeNull();
    expect(written.base.robustness.report?.injected_cases).toBe(2);
    expect(written.base.robustness.report?.control_cases).toBe(1);
  });

  it("produces the SAME artifact sealed and unsealed — the flag is not a metric input", async () => {
    // M56 rejects a second scoring pass and an unsealed step 7b: there is one
    // path through the scorer, so the flag can change nothing it computes.
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const sealed = await bench(root, 9100, "ASSAY", ["--sealed"]);
    const open = await bench(root, 9100, "ASSAY");
    const path = ["runs", "m55", EXERCISED_SPLIT, "9100", "ASSAY", "offline", "metrics.json"]
      .join("/");
    expect(sealed.sink.files.get(path)).toBe(open.sink.files.get(path));
  });

  it("G — emits no GroundTruth field name anywhere in the artifact", async () => {
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const result = await bench(root, 9100, "A3-NOLLM", ["--sealed"]);
    const written = readMetrics(result, "A3-NOLLM", 9100);

    const emitted = keysOf(written);
    for (const field of GROUND_TRUTH_FIELDS) {
      expect(emitted.has(field), `metrics.json carries a GroundTruth field: ${field}`).toBe(false);
    }
    // ...and the top level is still M51's key + base + sweeps, with metric 3's
    // integration of the ε curve beside them. No fifth key dimension, no second
    // schema, no ground-truth container.
    expect(Object.keys(written).sort()).toStrictEqual([
      "base", "key", "risk_coverage", "sweeps",
    ]);
  });

  it("G — every string the artifact carries is one a scored unit is allowed to carry", async () => {
    // The complement of the key check: a truth value could reach the artifact
    // under an innocuous key. A scored unit's strings are a CLOSED set -- M48's
    // RunKey components, M51's parameter names, and the two fixed dispositions --
    // so anything else is a leak whatever it is called.
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const result = await bench(root, 9100, "ASSAY", ["--sealed"]);
    const written = readMetrics(result, "ASSAY", 9100);

    const allowed = new Set<string>([
      "ASSAY", EXERCISED_SPLIT, "offline",
      // M51's three parameter names: the two `apps/cli` executes and §5.3's
      // cost row, which the scorer re-scores post-hoc.
      "epsilon_bps", "tau_floor_paise", COST_SWEEP_PARAMETER_NAME,
      V30_NON_ADDITIVITY, EMPTY_INJECTED_POPULATION,
      // M54's ratified state for metric 10, and M57's empty-population state
      // for metric 7 — both published rather than fabricated.
      M54_METRIC_10_NOT_COMPUTABLE,
      METRIC_7_ECE_EMPTY_POPULATION,
      // M53's state for metric 17, where PREREGISTRATION.md §7's baseline table
      // records no row for this (agent_id, llm_mode). It names §7, §9 step 0 and
      // §4.10 and carries no figure from this run or from the answer key.
      METRIC_17_BASELINE_NOT_RECORDED,
    ]);
    for (const leaf of stringLeaves(written)) {
      expect(allowed.has(leaf), `metrics.json carries an unexpected string: ${leaf}`).toBe(true);
    }
  });

  it("G — the artifact does not move when the answer key's unprojected fields do", async () => {
    // Two datasets whose observations, degradations and true journal agree and
    // whose every OTHER GroundTruth field differs. A byte-identical artifact is
    // proof that gt_version, family_id and true_balances reach nothing emitted.
    const a = tempDir();
    const b = tempDir();
    writeDataset(a, 9100, INJECTED);
    mkdirSync(join(join(b, EXERCISED_SPLIT), "9100"), { recursive: true });
    writeFileSync(
      join(join(join(b, EXERCISED_SPLIT), "9100"), "observations.jsonl"),
      `${DATASET.map((o) => JSON.stringify(o)).join("\n")}\n`,
      "utf8",
    );
    writeFileSync(
      join(join(join(b, EXERCISED_SPLIT), "9100"), "ground_truth.jsonl"),
      `${JSON.stringify({
        ...truthRecord({ degradations: INJECTED }),
        seed: 9100,
        gt_version: "9.9.9-SENTINEL",
        family_id: "F01",
        true_balances: { "1200_BANK": 123_456 },
      })}\n`,
      "utf8",
    );
    writeFileSync(
      join(join(join(b, EXERCISED_SPLIT), "9100"), "oracle_labels.jsonl"),
      oracleLabels(),
      "utf8",
    );

    const path = ["runs", "m55", EXERCISED_SPLIT, "9100", "A3-NOLLM", "offline", "metrics.json"]
      .join("/");
    const fromA = await bench(a, 9100, "A3-NOLLM", ["--sealed"]);
    const fromB = await bench(b, 9100, "A3-NOLLM", ["--sealed"]);
    expect(fromB.err, fromB.err).toBe("");
    expect(fromA.sink.files.get(path)).toBe(fromB.sink.files.get(path));
    expect(fromB.sink.files.get(path) ?? "").not.toContain("SENTINEL");
  });

  it("G — logs no GroundTruth row, field or path to stdout or stderr", async () => {
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    // Every agent §9 step 7 can run offline; B2-LLM-DIRECT is F2-deferred and
    // reports its blocker on stderr, which is a fact about the baseline and not
    // about emission.
    const result = await bench(root, 9100, "ASSAY,B0-IDONLY,A1-NOVALIDATE,A2-NOABSTAIN,A3-NOLLM", [
      "--sealed",
    ]);
    expect(result.err, result.err).toBe("");

    const printed = `${result.out}\n${result.err}`;
    for (const token of [
      "ground_truth", "gt_version", "true_journal", "true_balances", "degradations",
      "F10", "1.1.0", "1200_BANK", "1100_GATEWAY_RECEIVABLE",
      ...INJECTED.map((d) => d.op),
      ...INJECTED.map((d) => d.target_id),
    ]) {
      expect(printed, `stdout/stderr mentions ${token}`).not.toContain(token);
    }
  });

  it("H — metrics 15 and 16 stay TEST-only at the reporting layer, sealed included", async () => {
    // M52's scope is a property of the POPULATION, not of the flag and not of
    // the read: a sealed DEV run opens the answer key -- §2's loop runs over
    // {dev, test} -- and metrics 15 and 16 are still "not exercised on dev",
    // because F10 exists at TEST seeds 9100-9104 and nowhere else.
    const root = tempDir();
    writeDataset(root, 2000, INJECTED, "dev");

    const out = recorder();
    const err = recorder();
    const sink = memorySink();
    const code = await dispatch({
      argv: [
        "bench", "--split", "dev", "--seeds", "2000", "--agents", "A3-NOLLM",
        "--run-id", "m55", "--bench", root, "--llm", "offline", "--sealed",
      ],
      env: {},
      out: out.write,
      err: err.write,
      sink,
    });
    expect(err.lines.join("\n")).toBe("");
    expect(code).toBe(0);

    const written = JSON.parse(
      sink.files.get("runs/m55/dev/2000/A3-NOLLM/offline/metrics.json") ?? "",
    ) as WrittenMetrics;
    expect(written.base.robustness.exercised).toBe(false);
    expect(written.base.robustness.report).toBeNull();
    expect(written.base.robustness.not_exercised).toMatch(/not exercised on dev/);
    expect(isExercisedSplit("dev")).toBe(false);
  });

  it("I — an empty injected population stays distinct from the withheld state", async () => {
    // Through spec 1.4.33 a sealed TEST unit and a TEST seed with no F10 record
    // were both "not exercised", for reasons a reader had to tell apart from
    // prose. M56 removed the first; the second is a MEASUREMENT and still reads
    // as one -- real counts, a non-null report, and null rather than zero rates.
    const root = tempDir();
    writeDataset(root, 9100, []);
    const result = await bench(root, 9100, "A3-NOLLM", ["--sealed"]);
    const written = readMetrics(result, "A3-NOLLM", 9100);

    expect(written.base.robustness.exercised).toBe(false);
    expect(written.base.robustness.not_exercised).toBe(EMPTY_INJECTED_POPULATION);
    // The distinguishing fact: a report EXISTS, because the populations were read.
    expect(written.base.robustness.report).not.toBeNull();
    expect(written.base.robustness.report?.injected_cases).toBe(0);
    expect(written.base.robustness.report?.injection_financial_success_rate).toBeNull();
    // ...where a split M52 does not scope carries no report at all.
    expect(scoreRobustness(
      { agent_id: "A3-NOLLM", decisions: [], abstentions: [], outcomes: [], journal: [],
        open_exceptions: [], probes_spent: 0, abstentions_resolved_by_probe: 0 } as never,
      notExercisedOnSplit("dev"),
    ).report).toBeNull();
  });

  it("J — leaves M51's sweep serialization untouched under --sealed", async () => {
    const root = tempDir();
    writeDataset(root, 9100, INJECTED);
    const written = readMetrics(await bench(root, 9100, "ASSAY", ["--sealed"]), "ASSAY", 9100);

    expect(written.sweeps.epsilon).toHaveLength(21);
    expect(written.sweeps.tau).toHaveLength(4);
    expect(Object.keys(written.sweeps.epsilon[0] ?? {}).sort()).toStrictEqual([
      "abstentions", "balance_harm_paise", "coverage_by_value", "decisions",
      "is_operating_point", "parameter_name", "parameter_value", "solve_outcomes",
    ]);
    expect(Object.keys(written.sweeps.tau[0] ?? {}).sort()).toStrictEqual([
      "abstentions", "coverage_by_value", "decisions", "is_operating_point",
      "parameter_name", "parameter_value", "solve_outcomes",
    ]);
    for (const point of [...written.sweeps.epsilon, ...written.sweeps.tau]) {
      expect(Object.keys(point)).not.toContain("robustness");
    }
  });

  it("L — one scoring path: the sealed branch is gone, not made conditional", () => {
    const src = join(import.meta.dirname, "..", "src");
    const decomment = (text: string): string =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const bench = decomment(readFileSync(join(src, "commands", "bench.ts"), "utf8"));
    const scorer = decomment(readFileSync(join(src, "bench", "scorer.ts"), "utf8"));

    // The scored unit's source is decided from the split alone.
    expect(bench).not.toMatch(/sealed/);
    expect(scorer).not.toMatch(/sealed/);
    expect((bench.match(/scoreRobustness\(/g) ?? []).length).toBe(1);
    expect((bench.match(/loadGroundTruth\(/g) ?? []).length).toBe(1);
    // And the withheld constant is gone from the package's surface entirely.
    const index = readFileSync(join(src, "index.ts"), "utf8");
    expect(index).not.toContain("AL5_GROUND_TRUTH_WITHHELD");
    expect(scorer).not.toContain("AL5_GROUND_TRUTH_WITHHELD");
  });
});
