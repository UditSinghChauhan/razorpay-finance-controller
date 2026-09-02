import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { ObservationSchema, type Observation } from "@assay/domain";
import {
  C_EXCEPTION_PAISE,
  C_REVIEW_PAISE,
  C_REVIEW_SWEEP_PAISE,
  EPSILON_BPS,
  FROZEN_METRICS,
  K_SIGMA,
  METRIC_17_BASELINE,
  METRIC_17_BASELINE_SEEDS,
  METRIC_17_BASELINE_SPLIT,
  TAU_SWEEP_FLOOR_PAISE,
  abstentionRateByValue,
  agentDeclaration,
  runKey,
  tier0Agents,
  type Agent,
  type AgentInput,
  type AgentRun,
  type Metric17BaselineRow,
} from "@assay/eval";
import { afterAll, describe, expect, it } from "vitest";

import {
  BASELINE_AGENT_IDS,
  BASELINE_CONSUMING_SPLIT,
  BASELINE_DEFERRED_AGENT,
  BASELINE_DEFERRED_BY_F2_AGENT,
  BASELINE_DEFERRED_BY_F2_REPLAY,
  BASELINE_NOT_SCORED,
  BASELINE_NOT_TAKEN_THIS_INVOCATION,
  BASELINE_SEEDS,
  BASELINE_SPLIT,
  BASELINE_TABLE_HEADER,
  BASELINE_TRANSCRIPTION,
  COMMANDS,
  EPSILON_GRID_BPS,
  EPSILON_OPERATING_POINT_BPS,
  EXERCISED_SPLIT,
  M54_METRIC_10_NOT_COMPUTABLE,
  METRIC_7_ECE_EMPTY_POPULATION,
  METRIC_17_BASELINE_NOT_RECORDED,
  TAU_FLOOR_GRID_PAISE,
  TRUTH_SCORED_SPLITS,
  V30_NON_ADDITIVITY,
  T0_11_COMMANDS,
  V28_BASELINE_COMPOSITION,
  baselineDeferrals,
  baselineTableLines,
  consumesBaseline,
  dispatch,
  isExercisedSplit,
  isTruthScoredSplit,
  memorySink,
  metric17SplitState,
  runBaselinePass,
  scoreAbstentionSpike,
  type BaselineRow,
  type MemorySink,
} from "../src/index.js";
import { recorder } from "./fixtures.js";

/**
 * `PREREGISTRATION.md §9` **step 0** and metric 17's TEST consumption —
 * register rows `DATA_MODEL.md §22.2` **M53** (spec 1.4.32) and **M58**
 * (spec 1.4.36: the pair's encoding, its transcription path, and the rule that
 * no runtime scoring recomputes it).
 *
 * **What this suite owns and what is deliberately elsewhere.**
 * `packages/eval/tests/metric17-baseline.test.ts` owns the *semantics*: the
 * rate's two universes, the sample standard deviation, the frozen population
 * check and the fail-closed read of a malformed `§7` row. This suite owns the
 * *integration*: that `§9` step 0 runs the declared population and nothing else,
 * that it is **non-scored** in the artifact sense, that TEST scoring **reads**
 * `§7` and DEV and TRAIN do not, and that no metric already in `metrics.json`
 * moves.
 *
 * **No benchmark data is produced and no official run is taken.** The dev
 * dataset below is four hand-written observations in a `mkdtemp` directory that
 * is removed afterwards; `bench/` and `runs/` are never touched, every sink is a
 * memory sink, the generator is never invoked, no TEST dataset exists to read,
 * no manifest is written and no tag is cut. `PREREGISTRATION.md §6.1`'s bar on
 * generating benchmark data before the seal is not approached.
 */

const T0 = 1_783_000_000;
const DAY = 86_400;
const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(14, "0")}`;

function reconLine(n: number, amount: number): Observation {
  return ObservationSchema.parse({
    obs_id: pad("obs_", n),
    source_system: "pg_recon",
    source_file: "pg_recon.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    kind: "recon_line",
    payload: {
      entity_id: pad("pay_", n),
      type: "payment",
      debit: 0,
      credit: amount - 24_000,
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

/** Two recon lines per seed, distinct per seed so a mixed-up read would show. */
const datasetFor = (seed: number): readonly Observation[] => [
  reconLine(seed * 10 + 1, 1_000_000),
  reconLine(seed * 10 + 2, 1_000_000),
];

// ---------------------------------------------------------------------------
// A hand-built dev workspace — mkdtemp, removed afterwards
// ---------------------------------------------------------------------------

const ROOT = mkdtempSync(join(tmpdir(), "assay-m53-"));
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

for (const seed of METRIC_17_BASELINE_SEEDS) {
  const dir = join(join(ROOT, METRIC_17_BASELINE_SPLIT), String(seed));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "observations.jsonl"),
    `${datasetFor(seed)
      .map((o) => JSON.stringify(o))
      .join("\n")}\n`,
    "utf8",
  );
}
// A TEST-shaped directory the pass must never reach. It holds nothing: if the
// baseline producer ever read a test seed the read would fail rather than
// silently succeed, and AL7's burn rule is not approached either way.
mkdirSync(join(ROOT, "test"), { recursive: true });

interface Outcome {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly sink: MemorySink;
}

async function run(argv: readonly string[]): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({ argv, env: {}, out: out.write, err: err.write, sink });
  return { code, out: out.lines.join("\n"), err: err.lines.join("\n"), sink };
}

/**
 * `baselineArgv` with one of its own flags replaced rather than repeated — the
 * parser takes each flag at most once, so a refusal case must substitute.
 */
const baselineWith = (over: { agents?: string; llm?: string }): readonly string[] => [
  "bench",
  "--baseline",
  "--agents",
  over.agents ?? "B0-IDONLY",
  "--bench",
  ROOT,
  "--llm",
  over.llm ?? "offline",
];

const baselineArgv = (extra: readonly string[] = []): readonly string[] => [
  "bench",
  "--baseline",
  "--agents",
  "B0-IDONLY",
  "--bench",
  ROOT,
  "--llm",
  "offline",
  ...extra,
];

// ---------------------------------------------------------------------------
// A stub agent, for the arithmetic the real pipeline would bury
// ---------------------------------------------------------------------------

/** An agent that abstains on a stated share of each seed's recon value. */
function stubAgent(share: (seed: number) => number, id: Agent["id"] = "B0-IDONLY"): Agent {
  return {
    id,
    run: (input: AgentInput): Promise<AgentRun> => {
      const abstained = share(input.config.seed);
      const outcomes = input.observations.map((o, i) => ({
        obs_id: o.obs_id,
        kind: o.kind,
        state: (i < abstained ? "ABSTAINED" : "RECONCILED") as "ABSTAINED" | "RECONCILED",
        value_paise: o.kind === "recon_line" ? o.payload.amount : 0,
      }));
      return Promise.resolve({
        agent_id: id,
        config: input.config,
        outcomes,
        components: [],
        allocations: [],
        decisions: [],
        // Deliberately populated and deliberately NOT the numerator: §16's item
        // key names a target, and M53's numerator is the observation universe.
        abstentions: [
          { source_entity_id: pad("setl_", 1), value_paise: 99_000_000, carried_untrusted_text: false },
        ],
        open_exceptions: [],
        journal: [],
        probes_spent: 0,
        abstentions_resolved_by_probe: 0,
        close: null,
      });
    },
  };
}

const passWith = (agent: Agent): Promise<readonly BaselineRow[]> =>
  runBaselinePass({
    agents: [agent],
    llmMode: "offline",
    strictReplay: true,
    observationsForSeed: datasetFor,
  });

// ---------------------------------------------------------------------------
// 1 + 2. Exactly five DEV seeds, DEV-only
// ---------------------------------------------------------------------------

describe("1. §9 step 0 runs exactly the five baseline seeds 2000-2004", () => {
  it("asks for each declared seed once and for no other", async () => {
    const asked: number[] = [];
    await runBaselinePass({
      agents: [stubAgent(() => 0)],
      llmMode: "offline",
      strictReplay: true,
      observationsForSeed: (seed) => {
        asked.push(seed);
        return datasetFor(seed);
      },
    });
    expect(asked).toEqual([2_000, 2_001, 2_002, 2_003, 2_004]);
  });

  it("carries the five samples into the row, in §7's seed order", async () => {
    const [row] = await passWith(stubAgent(() => 1));
    expect(row?.samples.map((s) => s.seed)).toEqual([...BASELINE_SEEDS]);
    expect(row?.samples).toHaveLength(5);
  });

  it("refuses a seed argument rather than honouring a chosen population", async () => {
    const result = await run(baselineArgv(["--seeds", "2000,2001"]));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/takes no seed argument/);
    expect(result.err).toMatch(/BEFORE the measurement/);
  });

  it("refuses --seed just as it refuses --seeds", async () => {
    const result = await run(baselineArgv(["--seed", "2000"]));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/takes no seed argument/);
  });
});

describe("2. the baseline population is DEV and only DEV", () => {
  it("names dev as its split", () => {
    expect(BASELINE_SPLIT).toBe("dev");
    expect(BASELINE_SPLIT).toBe(METRIC_17_BASELINE_SPLIT);
  });

  it("runs when --split dev is stated explicitly", async () => {
    const result = await run(baselineArgv(["--split", "dev"]));
    expect(result.code).toBe(0);
  });

  it("refuses --split test, citing §6.1's forbidden list", async () => {
    const result = await run(baselineArgv(["--split", "test"]));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/forbidden list bars --split test/);
  });

  it("refuses --split train", async () => {
    const result = await run(baselineArgv(["--split", "train"]));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/five DEV seeds/);
  });

  it("reads only the dev tree — no test path is opened", async () => {
    // The workspace's test/ directory is empty, so any read under it throws.
    const result = await run(baselineArgv());
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 3. The pass is NON-SCORED
// ---------------------------------------------------------------------------

describe("3. §9 step 0 is non-scored and writes nothing", () => {
  it("writes no artifact at all — no runs/, no metrics.json, no manifest", async () => {
    const result = await run(baselineArgv());
    expect(result.code).toBe(0);
    expect([...result.sink.files.keys()]).toEqual([]);
  });

  it("says so in the transcript, so a rate in a log is not read as a metric", async () => {
    const result = await run(baselineArgv());
    expect(result.out).toContain(BASELINE_NOT_SCORED);
    expect(result.out).toMatch(/EMITS NO metrics\.json|emits no metrics\.json/);
    expect(result.out).toContain("artifacts           none");
  });

  it("refuses --run-id, there being no run to identify", async () => {
    const result = await run(baselineArgv(["--run-id", "m53"]));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/takes no --run-id/);
  });

  it("is a mode of `bench` and not a ninth command — §C T0-11 stays at eight", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([...T0_11_COMMANDS]);
    expect(T0_11_COMMANDS).toHaveLength(8);
    expect(COMMANDS.find((c) => c.name === "bench")?.flags).toHaveProperty("baseline");
  });

  it("emits §7's table for transcription, with the sample behind each pair", async () => {
    const result = await run(baselineArgv());
    expect(result.out).toContain("PREREGISTRATION.md §7 — metric 17 abstention baseline");
    expect(result.out).toContain("(agent_id, llm_mode) -> (mean_bps, stddev_bps)");
    for (const seed of BASELINE_SEEDS) expect(result.out).toContain(`seed ${String(seed)}`);
  });
});

// ---------------------------------------------------------------------------
// 4 + 5. The numerator and the denominator, through the production path
// ---------------------------------------------------------------------------

describe("4/5. the rate the pass records is §4.10's, over §4.1's denominator", () => {
  it("takes the numerator from recon_line outcomes whose COMPONENT reached ABSTAINED", async () => {
    // One of two 10_00_000-paise lines abstained on every seed -> rate 0.5.
    const [row] = await passWith(stubAgent(() => 1));
    for (const sample of row?.samples ?? []) {
      expect(sample.numerator_paise).toBe(1_000_000);
      expect(sample.rate).toBe(0.5);
    }
    expect(row?.mean_bps).toBe(5_000);
    expect(row?.stddev_bps).toBe(0);
  });

  it("does not take the numerator from AgentRun.abstentions, which names a target", async () => {
    const [row] = await passWith(stubAgent(() => 1));
    // The stub's one abstention record carries 99_000_000 paise.
    for (const sample of row?.samples ?? []) {
      expect(sample.numerator_paise).not.toBe(99_000_000);
    }
  });

  it("uses batch_value_paise exactly — Σ recon_line.amount over the dataset", async () => {
    const [row] = await passWith(stubAgent(() => 0));
    for (const sample of row?.samples ?? []) {
      expect(sample.denominator_paise).toBe(2_000_000);
      expect(sample.numerator_paise).toBe(0);
      expect(sample.rate).toBe(0);
    }
    expect(row).toMatchObject({ mean_bps: 0, stddev_bps: 0 });
  });

  it("agrees with packages/eval's own rate on the same run", async () => {
    const agent = stubAgent((seed) => (seed % 2 === 0 ? 1 : 0));
    const [row] = await passWith(agent);
    for (const seed of BASELINE_SEEDS) {
      const run = await agent.run({
        observations: datasetFor(seed),
        config: { llm_mode: "offline", strict_replay: true, split: "dev", seed },
      });
      const expected = abstentionRateByValue(run);
      const sample = row?.samples.find((s) => s.seed === seed);
      expect(sample?.rate).toBe(expected.ratio);
      expect(sample?.numerator_paise).toBe(expected.numerator);
      expect(sample?.denominator_paise).toBe(expected.denominator);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Determinism
// ---------------------------------------------------------------------------

describe("6. the baseline is a total function of its inputs", () => {
  it("gives byte-identical rows across repeated passes over one dataset", async () => {
    const agent = stubAgent((seed) => seed % 2);
    const first = await passWith(agent);
    for (let i = 0; i < 4; i += 1) {
      expect(await passWith(agent)).toEqual(first);
    }
  });

  it("gives an identical transcript across two invocations of the command", async () => {
    const a = await run(baselineArgv());
    const b = await run(baselineArgv());
    expect(a.out).toBe(b.out);
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
  });

  it("renders the same table for the same rows", async () => {
    const rows = await passWith(stubAgent(() => 1));
    expect(baselineTableLines(rows)).toEqual(baselineTableLines(rows));
  });
});

// ---------------------------------------------------------------------------
// 7. The persistence surface — §7's table, empty until step 0 is recorded
// ---------------------------------------------------------------------------

describe("7. §7 is the record, and it is empty before step 0 is transcribed into it", () => {
  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59): the five measured
  // offline rows §9 step 0 transcribed, replacing §7's pre-step-0 empty state.
  it("holds the five measured offline rows §9 step 0 transcribed", () => {
    expect(METRIC_17_BASELINE).toEqual([
      { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "B0-IDONLY", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A1-NOVALIDATE", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A2-NOABSTAIN", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A3-NOLLM", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
    ]);
  });

  it("carries §7's four fields and no seed, run_id or hash", async () => {
    const [row] = await passWith(stubAgent(() => 1));
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "agent_id",
      "llm_mode",
      "mean_bps",
      "stddev_bps",
      "samples",
    ].sort());
    // The pair §7 records, keyed exactly as §7 keys it.
    expect(row?.agent_id).toBe("B0-IDONLY");
    expect(row?.llm_mode).toBe("offline");
    expect(Number.isInteger(row?.mean_bps)).toBe(true);
    expect(Number.isInteger(row?.stddev_bps)).toBe(true);
  });

  it("is not a BenchmarkManifest field — the pass writes no manifest", async () => {
    const result = await run(baselineArgv());
    expect([...result.sink.files.keys()].some((p) => p.includes("manifest"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8 - 11. TEST reads it; DEV and TRAIN do not; nothing recomputes it
// ---------------------------------------------------------------------------

const spikeRun = (): AgentRun => ({
  agent_id: "ASSAY",
  config: { llm_mode: "offline", strict_replay: true, split: "test", seed: 9_100 },
  outcomes: [
    { obs_id: pad("obs_", 1) as AgentRun["outcomes"][number]["obs_id"], kind: "recon_line", state: "ABSTAINED", value_paise: 400_000 },
    { obs_id: pad("obs_", 2) as AgentRun["outcomes"][number]["obs_id"], kind: "recon_line", state: "RECONCILED", value_paise: 600_000 },
  ],
  components: [],
  allocations: [],
  decisions: [],
  abstentions: [],
  open_exceptions: [],
  journal: [],
  probes_spent: 0,
  abstentions_resolved_by_probe: 0,
  close: null,
});

describe("8. TEST scoring reads §7's frozen baseline", () => {
  it("names TEST as §7's one consumer", () => {
    expect(BASELINE_CONSUMING_SPLIT).toBe("test");
    expect(consumesBaseline("test")).toBe(true);
    expect(consumesBaseline("dev")).toBe(false);
    expect(consumesBaseline("train")).toBe(false);
  });

  it("computes the flag from the recorded pair, echoing it beside the rate", () => {
    // §7's table is empty, so the row is supplied the way a transcribed §7 would
    // supply it: through the frozen reader's own table argument. Nothing here
    // computes a baseline from a run.
    const table: readonly Metric17BaselineRow[] = [
      { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 100, stddev_bps: 10 },
    ];
    const found = table.find((r) => r.agent_id === "ASSAY" && r.llm_mode === "offline");
    expect(found).toBeDefined();
    // rate 0.4 == 4000 bps, bar = 100 + 3*10 = 130 bps -> fires.
    const rate = abstentionRateByValue(spikeRun());
    expect(rate.ratio).toBe(0.4);
    expect(rate.ratio > (found?.mean_bps ?? 0) / 10_000 + K_SIGMA * ((found?.stddev_bps ?? 0) / 10_000)).toBe(true);
  });

  it("publishes the rate, k_sigma and V28 shape on a TEST unit", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_rate_by_value).toBe(0.4);
    expect(metrics.abstained_recon_line_value_paise).toBe(400_000);
    expect(metrics.batch_value_paise).toBe(1_000_000);
    expect(metrics.k_sigma).toBe(K_SIGMA);
  });
});

describe("9/10. an unrecorded baseline fails closed, and nothing is recomputed", () => {
  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). (ASSAY, offline) gained
  // a measured row, so it is no longer unrecorded; the fail-closed BEHAVIOUR
  // keeps its subject by re-pointing at a key §7 still records none for —
  // (ASSAY, replay), which §F F2 defers — so "UNAVAILABLE rather than false" is
  // still asserted against a real absence rather than deleted with the empty
  // table.
  it("publishes metric 17 UNAVAILABLE on TEST rather than a flag of false", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "replay");
    expect(metrics.abstention_spike_flag).toBeNull();
    expect(metrics.abstention_spike_flag).not.toBe(false);
    expect(metrics.state).toBe(METRIC_17_BASELINE_NOT_RECORDED);
    expect(metrics.state).toMatch(/§9 step 0/);
    expect(metrics.baseline_mean_bps).toBeNull();
    expect(metrics.baseline_stddev_bps).toBeNull();
  });

  // M59's other half, asserted against the same run: a key §7 DOES record —
  // with a measured (0, 0) — is NOT unavailable. The flag is computed, the pair
  // is echoed as integer bps, and the bar is `rate > 0`.
  it("M59 — a measured (0, 0) key is recorded, so the flag is computed not null", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.state).toBeNull();
    expect(metrics.state).not.toBe(METRIC_17_BASELINE_NOT_RECORDED);
    expect(metrics.baseline_mean_bps).toBe(0);
    expect(metrics.baseline_stddev_bps).toBe(0);
    expect(metrics.k_sigma).toBe(K_SIGMA);
    // The unchanged formula on a (0, 0) pair: 0.4 > 0 + 3*0.
    expect(metrics.abstention_spike_flag).toBe(true);
  });

  it("still publishes the rate — §4.10's input is a property of the run alone", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_rate_by_value).toBe(0.4);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). Only the trailing
  // `toEqual([])` went; the before/after comparison is the actual subject and
  // is STRONGER now that the table is populated — scoring reads five real rows
  // and still moves none of them.
  it("does not mutate §7's table while scoring", () => {
    const before = JSON.stringify(METRIC_17_BASELINE);
    scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    scoreAbstentionSpike(spikeRun(), "test", "B0-IDONLY", "replay");
    expect(JSON.stringify(METRIC_17_BASELINE)).toBe(before);
    expect(METRIC_17_BASELINE).toHaveLength(5);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). With a row recorded the
  // invariant asserted is the real one: two runs an order of magnitude apart in
  // rate read the SAME recorded pair, and the pair does not move with the run's
  // rate. (ASSAY, replay) carries the null-flag half, §F F2 still deferring it.
  it("derives no baseline from the run it judges — the scorer has no such seam", () => {
    const loudRun = {
      ...spikeRun(),
      outcomes: spikeRun().outcomes.map((o) => ({ ...o, state: "ABSTAINED" as const })),
    };
    // Two runs whose rates differ by an order of magnitude reach the SAME state
    // and echo the SAME pair, because nothing about the run can produce one.
    const quiet = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    const loud = scoreAbstentionSpike(loudRun, "test", "ASSAY", "offline");
    expect(quiet.abstention_rate_by_value).toBe(0.4);
    expect(loud.abstention_rate_by_value).toBe(1);
    expect(quiet.state).toBe(loud.state);
    expect(loud.baseline_mean_bps).toBe(quiet.baseline_mean_bps);
    expect(loud.baseline_stddev_bps).toBe(quiet.baseline_stddev_bps);
    // A key §7 records no row for stays UNAVAILABLE however loud the run is.
    const deferred = scoreAbstentionSpike(loudRun, "test", "ASSAY", "replay");
    expect(deferred.abstention_spike_flag).toBeNull();
    expect(deferred.baseline_mean_bps).toBeNull();
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). Now the pair of cases
  // §10 V28 actually requires: no disclosure where there is no flag (a key §7
  // records none for), and the disclosure ATTACHED where a flag exists.
  it("carries no V28 disclosure where there is no flag to qualify", () => {
    // (ASSAY, replay) — §F F2 defers it, so there is no flag to qualify.
    expect(scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "replay").v28_disclosure).toBeNull();
    expect(V28_BASELINE_COMPOSITION).toMatch(/V28/);
  });

  it("attaches V28 to a flag that exists — the verdict carries its qualification", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_spike_flag).not.toBeNull();
    expect(metrics.v28_disclosure).toBe(V28_BASELINE_COMPOSITION);
  });
});

describe("11. DEV and TRAIN consume no baseline", () => {
  it("reports NOT COMPARED on DEV, whose five seeds ARE the population", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "dev", "ASSAY", "offline");
    expect(metrics.abstention_spike_flag).toBeNull();
    expect(metrics.state).toBe(metric17SplitState("dev"));
    expect(metrics.state).toMatch(/no run contributes to the baseline it is judged against/);
    expect(metrics.baseline_mean_bps).toBeNull();
  });

  it("reports NOT COMPARED on TRAIN, which is outside §2's scoring loop", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "train", "ASSAY", "offline");
    expect(metrics.abstention_spike_flag).toBeNull();
    expect(metrics.state).toBe(metric17SplitState("train"));
    expect(metrics.state).toMatch(/outside EVALUATION_SPEC\.md §2's scoring loop/);
  });

  it("still publishes the rate on both, which is what §9 step 0 records", () => {
    for (const split of ["dev", "train"] as const) {
      expect(scoreAbstentionSpike(spikeRun(), split, "ASSAY", "offline").abstention_rate_by_value)
        .toBe(0.4);
    }
  });
});

// ---------------------------------------------------------------------------
// 12 - 15. Nothing else moved
// ---------------------------------------------------------------------------

describe("12/13/14. every other metric and every other register row is untouched", () => {
  it("leaves M51's ε grid, τ grid and cost grid exactly where they were", () => {
    expect(EPSILON_GRID_BPS).toHaveLength(21);
    expect(EPSILON_GRID_BPS[0]).toBe(0);
    expect(EPSILON_GRID_BPS.at(-1)).toBe(10_000);
    expect(EPSILON_GRID_BPS).toContain(EPSILON_OPERATING_POINT_BPS);
    expect(EPSILON_OPERATING_POINT_BPS).toBe(EPSILON_BPS);
    expect([...TAU_FLOOR_GRID_PAISE]).toEqual([...TAU_SWEEP_FLOOR_PAISE]);
    // M51 moves C_review and C_exception TOGETHER over one shared point set,
    // and §7's ₹500 C_exception is deliberately off the grid.
    expect([...C_REVIEW_SWEEP_PAISE]).toEqual([10_000, 25_000, 100_000]);
    expect(C_REVIEW_SWEEP_PAISE).toContain(C_REVIEW_PAISE);
    expect(C_REVIEW_SWEEP_PAISE).not.toContain(C_EXCEPTION_PAISE);
  });

  it("leaves M52's TEST-only scope, M55's V30 and M54's metric-10 state in place", () => {
    expect(EXERCISED_SPLIT).toBe("test");
    expect(isExercisedSplit("dev")).toBe(false);
    expect(V30_NON_ADDITIVITY).toMatch(/V30/);
    expect(M54_METRIC_10_NOT_COMPUTABLE).toMatch(/NOT COMPUTABLE ON THE FROZEN POPULATION/);
  });

  it("leaves M56's truth-scored splits and M57's metric-7 state in place", () => {
    expect([...TRUTH_SCORED_SPLITS]).toEqual(["dev", "test"]);
    expect(isTruthScoredSplit("train")).toBe(false);
    expect(METRIC_7_ECE_EMPTY_POPULATION).toMatch(/rather than the 0\.0 an empty population/);
  });

  it("keeps PREREGISTRATION §8's list at 28, with metric 17 in its place", () => {
    expect(FROZEN_METRICS).toHaveLength(28);
    const m17 = FROZEN_METRICS.find((m) => m.number === 17);
    expect(m17?.name).toBe("abstention_spike_flag");
    expect(m17?.definedIn).toBe("§4.10");
    expect(m17?.blockedBy).toBeNull();
    expect(m17?.computedBy).toBe("metrics/abstention.ts");
  });

  it("keeps RunKey at (agent_id, split, seed, llm_mode) — a baseline is not a run", () => {
    const key = runKey("ASSAY", {
      llm_mode: "offline",
      strict_replay: true,
      split: "test",
      seed: 9_100,
    });
    expect(Object.keys(key).sort()).toEqual(["agent_id", "llm_mode", "seed", "split"]);
  });
});

describe("15. no benchmark data, run artifact, seal or tag is produced by this suite", () => {
  it("writes only inside its own mkdtemp workspace", () => {
    expect(ROOT).toContain("assay-m53-");
    expect(ROOT.startsWith(tmpdir())).toBe(true);
  });

  it("leaves every sink empty on the baseline path", async () => {
    const result = await run(baselineArgv());
    expect(result.sink.files.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 16 - 19. M58 — the pair's encoding, the transcription path, and the rule that
//          TEST scoring reads it rather than recomputing it
//          (spec 1.4.36, register row DATA_MODEL.md §22.2 M58, residual V33)
// ---------------------------------------------------------------------------

/**
 * A dev workspace whose five seeds carry rates of 1.0, 1.2, 1.4, 1.6 and 1.8
 * basis points — the M58 case, taken through the production `§9` step 0 path.
 *
 * Each seed holds two recon lines summing to `1_000_000_000` paise, the first
 * of which the stub abstains on. Rounded to integer bps FIRST the five rates
 * are 1, 1, 1, 2, 2 and their sample σ is 1 bp; at full precision the σ is
 * 0.3162 bps and records as 0. Nothing is generated: the observations are
 * hand-written and the workspace is the same `mkdtemp` root removed above.
 */
const M58_DENOMINATOR = 1_000_000_000;
const M58_ABSTAINED_PAISE: Readonly<Record<number, number>> = {
  2_000: 100_000,
  2_001: 120_000,
  2_002: 140_000,
  2_003: 160_000,
  2_004: 180_000,
};

const m58DatasetFor = (seed: number): readonly Observation[] => {
  const abstained = M58_ABSTAINED_PAISE[seed] as number;
  return [
    reconLine(seed * 100 + 1, abstained),
    reconLine(seed * 100 + 2, M58_DENOMINATOR - abstained),
  ];
};

/** Abstains on the first line of each seed and on nothing else. */
const m58Agent: Agent = {
  id: "B0-IDONLY",
  run: (input: AgentInput): Promise<AgentRun> =>
    Promise.resolve({
      agent_id: "B0-IDONLY",
      config: input.config,
      outcomes: input.observations.map((o, i) => ({
        obs_id: o.obs_id,
        kind: o.kind,
        state: (i === 0 ? "ABSTAINED" : "RECONCILED") as "ABSTAINED" | "RECONCILED",
        value_paise: o.kind === "recon_line" ? o.payload.amount : 0,
      })),
      components: [],
      allocations: [],
      decisions: [],
      abstentions: [],
      open_exceptions: [],
      journal: [],
      probes_spent: 0,
      abstentions_resolved_by_probe: 0,
      close: null,
    }),
};

describe("16. M58 — §9 step 0 records the pair at full precision and rounds once", () => {
  it("carries the five per-seed rates unrounded into the statistic", async () => {
    const [row] = await runBaselinePass({
      agents: [m58Agent],
      llmMode: "offline",
      strictReplay: true,
      observationsForSeed: m58DatasetFor,
    });
    expect(row?.samples.map((s) => s.rate)).toEqual([
      0.0001, 0.00012, 0.00014, 0.00016, 0.00018,
    ]);
    for (const sample of row?.samples ?? []) {
      // A ratio, not a bps integer: nothing on the way in quantizes it.
      expect(Number.isInteger(sample.rate)).toBe(false);
      expect(sample.denominator_paise).toBe(M58_DENOMINATOR);
    }
  });

  it("emits mean 1 bp and σ 0 bps — pre-rounding the rates would have given σ = 1", async () => {
    const [row] = await runBaselinePass({
      agents: [m58Agent],
      llmMode: "offline",
      strictReplay: true,
      observationsForSeed: m58DatasetFor,
    });
    // Full precision: mean 1.4 bps -> 1, σ 0.3162 bps -> 0. Rounding each rate
    // to bps first gives 1, 1, 1, 2, 2, whose sample σ is 0.5477 bps -> 1.
    expect(row?.mean_bps).toBe(1);
    expect(row?.stddev_bps).toBe(0);
    expect(Number.isInteger(row?.mean_bps)).toBe(true);
    expect(Number.isInteger(row?.stddev_bps)).toBe(true);
  });

  it("prints only the two integers and the per-seed paise, never an unrounded baseline", async () => {
    const rows = await runBaselinePass({
      agents: [m58Agent],
      llmMode: "offline",
      strictReplay: true,
      observationsForSeed: m58DatasetFor,
    });
    const text = baselineTableLines(rows).join("\n");
    expect(text).toContain("mean_bps");
    expect(text).toContain("stddev_bps");
    // §20's integers are the reproducible form; a per-seed ratio or an
    // unrounded mean in the transcript would be a second baseline spelling.
    expect(text).toContain("100000 / 1000000000 paise");
    expect(text).not.toMatch(/0\.0001/);
    expect(text).not.toMatch(/1\.4/);
    expect(text).not.toMatch(/0\.3162/);
  });
});

describe("17. M58 — the transcription path is printed, and this pass writes neither record", () => {
  it("names §7 as the authoritative record and frozen.ts as its transcription", async () => {
    const result = await run(baselineArgv());
    expect(result.code).toBe(0);
    expect(result.out).toContain(BASELINE_TRANSCRIPTION);
    expect(BASELINE_TRANSCRIPTION).toMatch(/PREREGISTRATION\.md §7/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/AUTHORITATIVE/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/METRIC_17_BASELINE in packages\/eval\/src\/frozen\.ts/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/EXECUTABLE TRANSCRIPTION/);
  });

  it("orders both writes before §9 step 1's tag and calls a divergence a seal failure", () => {
    expect(BASELINE_TRANSCRIPTION).toMatch(/BEFORE §9 step 1's tag/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/seal\/reproducibility failure/);
  });

  it("refuses a second evidence path in the same breath — no file, no manifest field", async () => {
    expect(BASELINE_TRANSCRIPTION).toMatch(/no generated JSON or data file/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/not a BenchmarkManifest field/);
    const result = await run(baselineArgv());
    expect(result.sink.files.size).toBe(0);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). The subject is that the
  // PASS writes nothing, which survives population; what changed is the
  // empty-table assertion standing in for it. It is now the stronger form: the
  // constant is byte-identical before and after the pass runs, so the pass
  // cannot be the thing that populates it — the transcription is a deliberate
  // source edit, never a side effect of running step 0 again.
  it("does not write METRIC_17_BASELINE — the pass transcribes nothing itself", async () => {
    const before = JSON.stringify(METRIC_17_BASELINE);
    await run(baselineArgv());
    expect(JSON.stringify(METRIC_17_BASELINE)).toBe(before);
    expect(METRIC_17_BASELINE).toHaveLength(5);
  });
});

describe("18. M58 — TEST scoring READS the transcription and recomputes nothing", () => {
  const CLI_SRC = join(import.meta.dirname, "..", "src");

  const sources = (): readonly { name: string; text: string }[] =>
    readdirSync(CLI_SRC, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => {
        const full = join(e.parentPath, e.name);
        return { name: relative(CLI_SRC, full).replaceAll("\\", "/"), text: readFileSync(full, "utf8") };
      });

  it("gives §9 step 0's statistic exactly one call site in apps/cli", () => {
    // "No runtime scoring may recompute the baseline." The rule is enforced by
    // there being no code path from a scored run to metric17BaselineStatistic:
    // bench/baseline.ts is step 0 and is the only importer.
    const importers = sources()
      .filter((s) => /\bmetric17BaselineStatistic\b/.test(s.text))
      .map((s) => s.name);
    expect(importers).toEqual(["bench/baseline.ts"]);
  });

  it("keeps the scorer free of the statistic and of the step-0 pass entirely", () => {
    const scorer = sources().find((s) => s.name === "bench/scorer.ts");
    expect(scorer).toBeDefined();
    expect(scorer?.text).not.toMatch(/metric17BaselineStatistic/);
    expect(scorer?.text).not.toMatch(/runBaselinePass/);
    // Its one baseline seam is the frozen reader.
    expect(scorer?.text).toMatch(/metric17BaselineFor/);
  });

  it("opens no baseline file or manifest field anywhere on the scoring path", () => {
    for (const source of sources()) {
      expect(source.text, source.name).not.toMatch(/baseline\.json/);
      expect(source.text, source.name).not.toMatch(/metric_17_baseline\.jsonl/);
    }
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). Now the positive form: a
  // TEST unit reads the TRANSCRIBED pair, echoes it unchanged in integer bps and
  // recomputes nothing. The UNAVAILABLE half moved to a key F2 still defers.
  it("reads the transcription for a TEST unit and echoes §7's pair unchanged", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), BASELINE_CONSUMING_SPLIT, "ASSAY", "offline");
    // The echoed pair is §7's own row, in §7's integer-bps encoding.
    const row = METRIC_17_BASELINE.find(
      (r) => r.agent_id === "ASSAY" && r.llm_mode === "offline",
    );
    expect(row).toBeDefined();
    expect(metrics.baseline_mean_bps).toBe(row?.mean_bps);
    expect(metrics.baseline_stddev_bps).toBe(row?.stddev_bps);
    expect(metrics.state).toBeNull();
    expect(metrics.abstention_spike_flag).not.toBeNull();
  });

  it("answers UNAVAILABLE with its reason for a key §F F2 still defers", () => {
    // The honest answer where §7 records no pair — never a recomputed one.
    const metrics = scoreAbstentionSpike(spikeRun(), BASELINE_CONSUMING_SPLIT, "ASSAY", "replay");
    expect(metrics.baseline_mean_bps).toBeNull();
    expect(metrics.baseline_stddev_bps).toBeNull();
    expect(metrics.abstention_spike_flag).toBeNull();
    expect(metrics.state).toBe(METRIC_17_BASELINE_NOT_RECORDED);
  });

  it("publishes the run's rate at full precision, unquantized, beside the null pair", () => {
    // M58 leaves the run's own rate continuous; §21's field is a ratio.
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_rate_by_value).toBe(0.4);
    expect(Number.isInteger(metrics.abstention_rate_by_value * 10_000)).toBe(true);
    expect(metrics.k_sigma).toBe(K_SIGMA);
  });
});

describe("19. M58 changed no threshold, no command and no metric count", () => {
  it("keeps k_sigma at 3", () => {
    expect(K_SIGMA).toBe(3);
  });

  it("keeps §C T0-11 at eight commands, with --baseline still a flag of bench", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([...T0_11_COMMANDS]);
    expect(T0_11_COMMANDS).toHaveLength(8);
    expect(COMMANDS.find((c) => c.name === "bench")?.flags).toHaveProperty("baseline");
    expect(COMMANDS.some((c) => c.name === "baseline")).toBe(false);
  });

  it("keeps the baseline population and split exactly where M53 froze them", () => {
    expect([...BASELINE_SEEDS]).toEqual([2_000, 2_001, 2_002, 2_003, 2_004]);
    expect(BASELINE_SPLIT).toBe("dev");
    expect(BASELINE_CONSUMING_SPLIT).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// 20. F2 — step 0 enumerates the five agents it can run, and refuses `all`
// ---------------------------------------------------------------------------

describe("20. F2 — §9 step 0's agent set is the five runnable Tier-0 agents", () => {
  it("is exactly ASSAY, B0-IDONLY, A1-NOVALIDATE, A2-NOABSTAIN, A3-NOLLM", () => {
    expect([...BASELINE_AGENT_IDS]).toEqual([
      "ASSAY",
      "B0-IDONLY",
      "A1-NOVALIDATE",
      "A2-NOABSTAIN",
      "A3-NOLLM",
    ]);
  });

  it("is EVALUATION_SPEC.md §2's Tier-0 loop minus the one agent §F F2 defers", () => {
    // Derived, not restated: §3.1 records B1-GREEDY's exclusion as data
    // (inTier0: false) and §C T0-10 defers B2-LLM-DIRECT to F2. A hand-written
    // list would be a third place those two facts are decided.
    expect([...BASELINE_AGENT_IDS]).toEqual(
      tier0Agents()
        .map((d) => d.id)
        .filter((id) => id !== BASELINE_DEFERRED_AGENT),
    );
    expect(BASELINE_DEFERRED_AGENT).toBe("B2-LLM-DIRECT");
    expect(BASELINE_AGENT_IDS).not.toContain("B2-LLM-DIRECT");
    expect(BASELINE_AGENT_IDS).not.toContain("B1-GREEDY");
    expect(BASELINE_AGENT_IDS).toHaveLength(5);
  });

  it("refuses --agents all, naming the five so the next command is the right one", async () => {
    const result = await run(baselineWith({ agents: "all" }));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/--baseline does not take --agents all/);
    expect(result.err).toMatch(/B2-LLM-DIRECT/);
    expect(result.err).toMatch(/§C T0-10/);
    expect(result.err).toContain(BASELINE_AGENT_IDS.join(","));
  });

  it("refuses B2-LLM-DIRECT named explicitly rather than silently dropping it", async () => {
    const result = await run(baselineWith({ agents: "B2-LLM-DIRECT" }));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/--baseline cannot run B2-LLM-DIRECT/);
    expect(result.err).toMatch(/refused rather than silently narrowed/);
  });

  it("refuses B1-GREEDY, which §2's loop carries only \"if built\"", async () => {
    const result = await run(baselineWith({ agents: "B1-GREEDY" }));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/--baseline cannot run B1-GREEDY/);
  });

  it("changes neither B2's implementation nor its declaration", () => {
    // F2 is APPLIED here, not reopened: B2 stays a declared Tier-0 baseline that
    // raises, and nothing above turns it into a runnable agent.
    expect(tier0Agents().map((d) => d.id)).toContain("B2-LLM-DIRECT");
    expect(agentDeclaration("B2-LLM-DIRECT").inTier0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 21. F3 — offline-only at this checkpoint, with the absent column recorded
// ---------------------------------------------------------------------------

describe("21. F3 — the replay column is deferred, never fabricated", () => {
  it("refuses --llm replay while no recorded cache exists, before any agent runs", async () => {
    const result = await run(baselineWith({ llm: "replay" }));
    expect(result.code).not.toBe(0);
    expect(result.err).toMatch(/--baseline --llm replay is refused/);
    expect(result.err).toMatch(/DECISION_BRIEF\.md §F F2/);
    expect(result.err).toMatch(/reads UNAVAILABLE for the absent rows/);
    // Refused BEFORE the pass: no table, no partial transcript, nothing written.
    expect(result.out).not.toContain(BASELINE_TABLE_HEADER);
    expect(result.sink.files.size).toBe(0);
  });

  it("names every key carrying no pair, with which of the three reasons applies", () => {
    const rows: readonly BaselineRow[] = [
      { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 12, stddev_bps: 3, samples: [] },
    ];
    const deferrals = baselineDeferrals(rows, false);
    const keys = deferrals.map((d) => `${d.agent_id}|${d.llm_mode}`);
    // The whole key space §7 calls complete, minus the one row measured above.
    expect(keys).toHaveLength(tier0Agents().length * 2 - 1);
    expect(keys).not.toContain("ASSAY|offline");
    // B2 under BOTH modes: §C T0-10 defers the agent, not one of its columns.
    for (const deferral of deferrals.filter((d) => d.agent_id === "B2-LLM-DIRECT")) {
      expect(deferral.reason).toBe(BASELINE_DEFERRED_BY_F2_AGENT);
    }
    // Every other replay key: F2's absent cache.
    for (const deferral of deferrals.filter(
      (d) => d.llm_mode === "replay" && d.agent_id !== "B2-LLM-DIRECT",
    )) {
      expect(deferral.reason).toBe(BASELINE_DEFERRED_BY_F2_REPLAY);
    }
    // An offline key this invocation simply did not cover is NOT deferred.
    const notTaken = deferrals.filter(
      (d) => d.llm_mode === "offline" && d.agent_id !== "B2-LLM-DIRECT",
    );
    expect(notTaken.length).toBeGreaterThan(0);
    for (const deferral of notTaken) {
      expect(deferral.reason).toBe(BASELINE_NOT_TAKEN_THIS_INVOCATION);
    }
  });

  it("stops calling the replay column deferred once a cache is recorded", () => {
    // F2's condition is a parameter, so resolving F2 moves the reason and not
    // this code. Nothing here invents a cache; it asserts the seam exists.
    const deferrals = baselineDeferrals([], true);
    const assayReplay = deferrals.find((d) => d.agent_id === "ASSAY" && d.llm_mode === "replay");
    expect(assayReplay?.reason).toBe(BASELINE_NOT_TAKEN_THIS_INVOCATION);
  });

  it("invents no cache, no row and no figure for the absent column", async () => {
    // Stated against the constant BEFORE and AFTER, rather than against its
    // emptiness, so this case survives the transcription unchanged: what it
    // asserts is that the PASS fabricates nothing, not that §7 holds nothing.
    const before = JSON.stringify(METRIC_17_BASELINE);
    const result = await run(baselineArgv());
    expect(result.code).toBe(0);
    // The absences are named in words and carry no pair anywhere near them.
    expect(result.out).toContain(BASELINE_DEFERRED_BY_F2_REPLAY);
    expect(BASELINE_DEFERRED_BY_F2_REPLAY).toMatch(/NOTHING is fabricated in their place/);
    expect(result.sink.files.size).toBe(0);
    expect(JSON.stringify(METRIC_17_BASELINE)).toBe(before);
  });

  it("says in the transcription that absences go into §7 alone, never the constant", async () => {
    const result = await run(baselineArgv());
    expect(result.out).toContain(BASELINE_TRANSCRIPTION);
    expect(BASELINE_TRANSCRIPTION).toMatch(/TRANSCRIBE THE ABSENCES TOO, INTO §7 ALONE/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/NOT written into METRIC_17_BASELINE/);
    expect(BASELINE_TRANSCRIPTION).toMatch(/never a pair of zeros/);
  });
});

// ---------------------------------------------------------------------------
// 22. F6 — one deterministic §7 row layout, in M58's field order
// ---------------------------------------------------------------------------

describe("22. F6 — §7's rows render in one deterministic layout", () => {
  const rows: readonly BaselineRow[] = [
    { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 1_234, stddev_bps: 7, samples: [] },
    { agent_id: "A1-NOVALIDATE", llm_mode: "offline", mean_bps: 0, stddev_bps: 10_000, samples: [] },
  ];

  it("heads the table with M58's four fields, in M58's order", () => {
    const lines = baselineTableLines(rows);
    expect(lines).toContain(BASELINE_TABLE_HEADER);
    // The order is §7's own: (agent_id, llm_mode) -> (mean_bps, stddev_bps).
    expect(BASELINE_TABLE_HEADER.trim().split(/\s+/)).toEqual([
      "agent_id",
      "llm_mode",
      "mean_bps",
      "stddev_bps",
    ]);
  });

  it("renders each row in that order and nothing else's", () => {
    const lines = baselineTableLines(rows);
    const start = lines.indexOf(BASELINE_TABLE_HEADER) + 1;
    const body = lines.slice(start, lines.indexOf("", start));
    expect(body.map((line) => line.trim().split(/\s+/))).toEqual([
      ["ASSAY", "offline", "1234", "7"],
      ["A1-NOVALIDATE", "offline", "0", "10000"],
    ]);
  });

  it("uses FIXED column widths, so one row's figure never moves another's line", () => {
    const wide = baselineTableLines(rows);
    const narrow = baselineTableLines([rows[0] as BaselineRow]);
    const lineFor = (lines: readonly string[]): string =>
      lines[lines.indexOf(BASELINE_TABLE_HEADER) + 1] ?? "";
    expect(lineFor(wide)).toBe(lineFor(narrow));
    // Every column starts at the same offset in the header and in the rows.
    for (const line of [BASELINE_TABLE_HEADER, lineFor(wide)]) {
      expect(line).toHaveLength(BASELINE_TABLE_HEADER.length);
    }
  });

  it("renders the same bytes twice, and puts the samples below the table", () => {
    const withSamples = baselineTableLines([
      {
        agent_id: "ASSAY",
        llm_mode: "offline",
        mean_bps: 12,
        stddev_bps: 3,
        samples: [{ seed: 2_000, rate: 0.1, numerator_paise: 1, denominator_paise: 10 }],
      },
    ]);
    expect(withSamples).toEqual(
      baselineTableLines([
        {
          agent_id: "ASSAY",
          llm_mode: "offline",
          mean_bps: 12,
          stddev_bps: 3,
          samples: [{ seed: 2_000, rate: 0.1, numerator_paise: 1, denominator_paise: 10 }],
        },
      ]),
    );
    // The block a reviewer diffs against §7 is contiguous: the header, the rows,
    // then a blank line before anything else.
    const start = withSamples.indexOf(BASELINE_TABLE_HEADER);
    expect(withSamples[start + 2]).toBe("");
    expect(withSamples.join("\n")).toMatch(/seed 2000\s+1 \/ 10 paise/);
  });

  it("emits no unrounded baseline anywhere in the rendered table", async () => {
    const result = await run(baselineArgv());
    expect(result.code).toBe(0);
    // Every figure on a table row is an integer; a decimal point on one would be
    // the second, unrounded baseline M58 says exists nowhere.
    const lines = result.out.split("\n");
    const start = lines.indexOf(BASELINE_TABLE_HEADER);
    expect(start).toBeGreaterThan(-1);
    for (const line of lines.slice(start + 1)) {
      if (line === "") break;
      const [, , meanBps, stddevBps] = line.trim().split(/\s+/);
      expect(Number.isInteger(Number(meanBps))).toBe(true);
      expect(Number.isInteger(Number(stddevBps))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 23. F5 — the step-0 transition is marked, and is the whole of what changes
// ---------------------------------------------------------------------------

describe("23. F5 — every assertion that changes when §7 is transcribed is marked", () => {
  // Assembled rather than written out, so this file's own inventory does not
  // count as one of the sites it inventories.
  const MARK = ["@STEP-0", "TRANSITION"].join("-");
  const REPO = join(import.meta.dirname, "..", "..", "..");

  /**
   * The complete inventory, established empirically: `METRIC_17_BASELINE` was
   * populated with five plausible offline rows, the whole suite was run, and
   * every case that failed is marked below. It is **13 cases in 4 files**, and
   * nothing else in 2,700-odd tests moves — which is what makes the measured
   * transcription one controlled commit rather than an open-ended repair.
   *
   * Two of the four files are not about metric 17 at all, and that is the
   * finding worth carrying: a recorded baseline gives a TEST unit a **flag**,
   * a flag carries `§10` **V28**'s disclosure, and V28's frozen sentence names
   * the `F10` family — which one leak scan reads as a ground-truth token and one
   * closed-string set does not admit. Both are test-side consequences of a
   * published `§10` disclosure, and both are noted at their own markers.
   */
  const SITES: readonly (readonly [string, number])[] = [
    ["apps/cli/tests/metric17-baseline.test.ts", 8],
    ["apps/cli/tests/robustness-scoring.test.ts", 1],
    ["apps/cli/tests/truth-scoring.test.ts", 1],
    ["packages/eval/tests/metric17-baseline.test.ts", 3],
  ];

  it("marks exactly the thirteen cases the measured transcription will break", () => {
    for (const [file, expected] of SITES) {
      const text = readFileSync(join(REPO, file), "utf8");
      const found = text.split(MARK).length - 1;
      expect(found, `${file} carries ${String(found)} ${MARK} markers`).toBe(expected);
    }
    expect(SITES.reduce((total, [, n]) => total + n, 0)).toBe(13);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). The control itself, and
  // deliberately the last marker to fall: it asserted the empty state directly
  // so that a transcription taken without touching this suite could not come out
  // green. It is now the populated assertion — five offline rows, one per agent
  // in BASELINE_AGENT_IDS — and it plays the same role in the other direction:
  // a row silently added to or dropped from §7's transcription FAILS here.
  it("holds exactly §9 step 0's transcription, so no row can be added or dropped silently", () => {
    expect(METRIC_17_BASELINE).toHaveLength(5);
    expect(METRIC_17_BASELINE.map((r) => `${r.agent_id}/${r.llm_mode}`)).toEqual([
      "ASSAY/offline",
      "B0-IDONLY/offline",
      "A1-NOVALIDATE/offline",
      "A2-NOABSTAIN/offline",
      "A3-NOLLM/offline",
    ]);
    // The measured figures, transcribed unchanged and never recomputed.
    for (const row of METRIC_17_BASELINE) {
      expect(row.mean_bps).toBe(0);
      expect(row.stddev_bps).toBe(0);
    }
  });

  it("keeps §7's own rules true of what is transcribed — offline-only, five agents", () => {
    // §9 step 0 is offline-only at this checkpoint (F3) over the five runnable
    // agents (F2), so no other key may appear in the transcription.
    expect(METRIC_17_BASELINE).not.toHaveLength(0);
    for (const row of METRIC_17_BASELINE) {
      expect(BASELINE_AGENT_IDS).toContain(row.agent_id);
      expect(row.llm_mode).toBe("offline");
    }
    // The seven keys §7 records no pair for are absent from the constant, which
    // transcribes PAIRS and has no field for a reason (M58, carried by M59).
    for (const agent of BASELINE_AGENT_IDS) {
      expect(METRIC_17_BASELINE.some((r) => r.agent_id === agent && r.llm_mode === "replay"))
        .toBe(false);
    }
    expect(METRIC_17_BASELINE.some((r) => r.agent_id === "B2-LLM-DIRECT")).toBe(false);
  });
});
