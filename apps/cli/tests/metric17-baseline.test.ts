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
  runKey,
  type Agent,
  type AgentInput,
  type AgentRun,
  type Metric17BaselineRow,
} from "@assay/eval";
import { afterAll, describe, expect, it } from "vitest";

import {
  BASELINE_CONSUMING_SPLIT,
  BASELINE_NOT_SCORED,
  BASELINE_SEEDS,
  BASELINE_SPLIT,
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
  it("holds no row, which is §7's own state today", () => {
    expect(METRIC_17_BASELINE).toEqual([]);
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
  it("publishes metric 17 UNAVAILABLE on TEST rather than a flag of false", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_spike_flag).toBeNull();
    expect(metrics.abstention_spike_flag).not.toBe(false);
    expect(metrics.state).toBe(METRIC_17_BASELINE_NOT_RECORDED);
    expect(metrics.state).toMatch(/§9 step 0/);
    expect(metrics.baseline_mean_bps).toBeNull();
    expect(metrics.baseline_stddev_bps).toBeNull();
  });

  it("still publishes the rate — §4.10's input is a property of the run alone", () => {
    const metrics = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    expect(metrics.abstention_rate_by_value).toBe(0.4);
  });

  it("does not mutate §7's table while scoring", () => {
    const before = JSON.stringify(METRIC_17_BASELINE);
    scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    scoreAbstentionSpike(spikeRun(), "test", "B0-IDONLY", "replay");
    expect(JSON.stringify(METRIC_17_BASELINE)).toBe(before);
    expect(METRIC_17_BASELINE).toEqual([]);
  });

  it("derives no baseline from the run it judges — the scorer has no such seam", () => {
    // Two runs whose rates differ by an order of magnitude reach the SAME state,
    // because nothing about the run can produce a baseline.
    const quiet = scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline");
    const loud = scoreAbstentionSpike(
      { ...spikeRun(), outcomes: spikeRun().outcomes.map((o) => ({ ...o, state: "ABSTAINED" as const })) },
      "test",
      "ASSAY",
      "offline",
    );
    expect(loud.abstention_rate_by_value).toBe(1);
    expect(quiet.state).toBe(loud.state);
    expect(loud.abstention_spike_flag).toBeNull();
  });

  it("carries no V28 disclosure where there is no flag to qualify", () => {
    expect(scoreAbstentionSpike(spikeRun(), "test", "ASSAY", "offline").v28_disclosure).toBeNull();
    expect(V28_BASELINE_COMPOSITION).toMatch(/V28/);
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

  it("leaves METRIC_17_BASELINE empty — nothing is guessed or prefilled by the pass", async () => {
    await run(baselineArgv());
    expect(METRIC_17_BASELINE).toEqual([]);
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

  it("reads the transcription for a TEST unit and finds §7's frozen empty table", () => {
    // The transcription is empty at this pre-step-0 checkpoint, so the honest
    // answer is UNAVAILABLE with its reason — never a recomputed pair.
    const metrics = scoreAbstentionSpike(spikeRun(), BASELINE_CONSUMING_SPLIT, "ASSAY", "offline");
    expect(METRIC_17_BASELINE).toEqual([]);
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
