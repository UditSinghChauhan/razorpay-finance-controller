import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import { ObservationSchema, type Observation, type ObservationId } from "@assay/domain";
import type { AgentRun, RobustnessReport, RunConfig } from "@assay/eval";
import { afterAll, describe, expect, it } from "vitest";

import {
  EMPTY_INJECTED_POPULATION,
  EXERCISED_SPLIT,
  V30_NON_ADDITIVITY,
  dispatch,
  encodeMetrics,
  isExercisedSplit,
  loadGroundTruth,
  memorySink,
  notExercisedOnSplit,
  overDataset,
  readGroundTruthRecord,
  scoreRobustness,
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
    sweeps: { epsilon: [], tau: [] },
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
): void {
  const dir = join(join(root, EXERCISED_SPLIT), String(seed));
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
}

interface Outcome {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly sink: MemorySink;
}

async function bench(root: string, seed: number, agents: string): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({
    argv: [
      "bench", "--split", EXERCISED_SPLIT, "--seeds", String(seed), "--agents", agents,
      "--run-id", "m55", "--bench", root, "--llm", "offline",
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

    const { robustness: injectedSide, ...agentSideA } = a.base;
    const { robustness: cleanSide, ...agentSideB } = b.base;
    expect(agentSideA).toStrictEqual(agentSideB);
    // The eleven pre-M55 fields, in the order the command has always written
    // them, plus exactly one more.
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
      "abstentions", "coverage_by_value", "decisions", "is_operating_point",
      "parameter_name", "parameter_value", "solve_outcomes",
    ]);
    // A sweep point carries no §4.8 field: M52's populations are the dataset's
    // and metrics 15 and 16 are the scored unit's, not a point's.
    for (const point of [...written.sweeps.epsilon, ...written.sweeps.tau]) {
      expect(Object.keys(point)).not.toContain("robustness");
    }
    // And the artifact still holds exactly M51's three top-level keys.
    expect(Object.keys(written).sort()).toStrictEqual(["base", "key", "sweeps"]);
  });

  it("reports a non-TEST split as not exercised and opens no answer key", async () => {
    // The dev dataset below carries NO ground_truth.jsonl at all. The command
    // must still succeed: on a split M52 does not scope, nothing is read.
    const root = tempDir();
    const dir = join(join(root, "dev"), "2000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "observations.jsonl"),
      `${DATASET.map((o) => JSON.stringify(o)).join("\n")}\n`,
      "utf8",
    );

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
    expect(written.base.robustness.report).toBeNull();
    expect(written.base.robustness.not_exercised).toMatch(/not exercised on dev/);
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
