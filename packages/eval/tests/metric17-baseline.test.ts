import { SEED_BLOCKS } from "@assay/generator";
import { describe, expect, it } from "vitest";

import {
  AGENT_IDS,
  BPS_DENOMINATOR,
  K_SIGMA,
  METRIC_17_BASELINE,
  METRIC_17_BASELINE_SEEDS,
  METRIC_17_BASELINE_SPLIT,
  SCORED_LLM_MODES,
  SEEDS_PER_CONFIGURATION,
  abstentionRateByValue,
  abstentionSpikeFlag,
  batchValuePaise,
  coverageByValue,
  metric17,
  metric17BaselineFor,
  metric17BaselineStatistic,
  type Metric17BaselineRow,
  type Metric17BaselineSample,
} from "../src/index.js";
import { abstention, agentRun, closeOutcome, outcome } from "./fixtures.js";

/**
 * Metric 17's rate and its frozen DEV baseline — `EVALUATION_SPEC.md §4.10`,
 * `PREREGISTRATION.md §7` and `§9` **step 0**, register rows `DATA_MODEL.md
 * §22.2` **M53** (spec 1.4.32) and **M58** (spec 1.4.36).
 *
 * **What this suite owns:** the *semantics* — the rate's two universes, the
 * statistic, the population check, the frozen table's shape, the fail-closed
 * read, and **M58's encoding rule**: full-precision inputs, one independent
 * `round_half_up` per figure with ties away from zero, and a detector that
 * reads the rounded pair against an unrounded rate.
 * `apps/cli/tests/metric17-baseline.test.ts` owns the *integration*: the
 * `§9` step 0 pass, its transcription path, the split scoping of the read, and
 * what reaches `metrics.json`.
 *
 * **No benchmark data is produced and no generator is invoked.** Every run below
 * is assembled by hand from `tests/fixtures.ts`; `SEED_BLOCKS` is imported for
 * the differential comparison of two transcriptions of `§6.1` and nothing is
 * generated from it. Nothing is written to `bench/` or `runs/`.
 */

const RECON = "recon_line";

/** A run whose recon lines carry the given `(state, value)` pairs. */
function runWith(
  rows: readonly (readonly [ReturnType<typeof outcome>["state"], number])[],
  extra: readonly ReturnType<typeof outcome>[] = [],
) {
  return agentRun({
    outcomes: [...rows.map(([state, value]) => outcome(RECON, state, value)), ...extra],
  });
}

// ---------------------------------------------------------------------------
// 1. The rate — §4.10's numerator and §4.1's denominator
// ---------------------------------------------------------------------------

describe("1. abstention_rate_by_value sits on §4.1's recon_line universe", () => {
  it("sums recon_line value where the component reached ABSTAINED, over batch_value_paise", () => {
    const run = runWith([
      ["ABSTAINED", 300_000],
      ["ABSTAINED", 200_000],
      ["RECONCILED", 400_000],
      ["EXCEPTION", 100_000],
    ]);
    const rate = abstentionRateByValue(run);
    expect(rate.numerator).toBe(500_000);
    expect(rate.denominator).toBe(1_000_000);
    expect(rate.ratio).toBe(0.5);
  });

  it("takes its denominator from batchValuePaise — metric 1's own function", () => {
    const run = runWith([
      ["ABSTAINED", 250_000],
      ["RECONCILED", 750_000],
    ]);
    expect(abstentionRateByValue(run).denominator).toBe(batchValuePaise(run));
    // The two §4.1 ratios differ in the state only, which is what makes them
    // commensurable: "a quantity that can exceed unity is not a coverage rate".
    expect(coverageByValue(run).denominator).toBe(abstentionRateByValue(run).denominator);
  });

  it("counts no non-recon_line observation on either side, ABSTAINED or not", () => {
    const run = runWith(
      [["RECONCILED", 1_000_000]],
      [
        outcome("bank_line", "ABSTAINED", 900_000),
        outcome("settlement", "ABSTAINED", 800_000),
        outcome("ledger_entry", "ABSTAINED", 700_000),
        outcome("order", "REFERENCE", 0),
      ],
    );
    const rate = abstentionRateByValue(run);
    expect(rate.numerator).toBe(0);
    expect(rate.denominator).toBe(1_000_000);
    expect(rate.ratio).toBe(0);
  });

  it("is bounded by 1.0 — every ABSTAINED recon line is already in the denominator", () => {
    const run = runWith([
      ["ABSTAINED", 400_000],
      ["ABSTAINED", 600_000],
    ]);
    expect(abstentionRateByValue(run).ratio).toBe(1);
  });

  it("reads AgentRun.outcomes and NOT AgentRun.abstentions, whose key is §16's item key", () => {
    // M53's numerator is "recon_line observations whose COMPONENT reached
    // ABSTAINED". The Suspense item that opens for such a line is keyed setl_...
    // and carries the TARGET's value, so summing abstention records would put a
    // settlement figure over a recon_line denominator.
    const run = agentRun({
      outcomes: [outcome(RECON, "ABSTAINED", 300_000), outcome(RECON, "RECONCILED", 700_000)],
      abstentions: [abstention("setl_00000000000001", 9_000_000)],
    });
    const rate = abstentionRateByValue(run);
    expect(rate.numerator).toBe(300_000);
    expect(rate.numerator).not.toBe(9_000_000);
    expect(rate.ratio).toBe(0.3);
  });

  it("does not read AgentRun.close.batch_value_paise — §4.1 wants an agent-independent one", () => {
    const run = agentRun({
      outcomes: [outcome(RECON, "ABSTAINED", 500_000), outcome(RECON, "RECONCILED", 500_000)],
      // A producer's claim that disagrees with the observation universe.
      close: closeOutcome({ batch_value_paise: 4_000_000 }),
    });
    expect(abstentionRateByValue(run).denominator).toBe(1_000_000);
  });

  it("publishes 0 rather than NaN on a dataset carrying no recon_line", () => {
    const run = runWith([], [outcome("order", "REFERENCE", 0)]);
    const rate = abstentionRateByValue(run);
    expect(rate.denominator).toBe(0);
    expect(rate.ratio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The population — §7's five DEV seeds, n = 5
// ---------------------------------------------------------------------------

const samplesFor = (rates: readonly number[]): readonly Metric17BaselineSample[] =>
  METRIC_17_BASELINE_SEEDS.map((seed, i) => ({ seed, rate: rates[i] as number }));

describe("2. §7's baseline population is exactly the five DEV seeds 2000-2004", () => {
  it("transcribes §6.1's dev block, and the two transcriptions agree", () => {
    const dev = SEED_BLOCKS.find((b) => b.split === METRIC_17_BASELINE_SPLIT);
    expect(dev).toBeDefined();
    expect([...METRIC_17_BASELINE_SEEDS]).toEqual([...(dev?.seeds ?? [])]);
    expect([...METRIC_17_BASELINE_SEEDS]).toEqual([2_000, 2_001, 2_002, 2_003, 2_004]);
  });

  it("carries n = 5, which is §7's own seeds-per-configuration", () => {
    expect(METRIC_17_BASELINE_SEEDS).toHaveLength(5);
    expect(METRIC_17_BASELINE_SEEDS).toHaveLength(SEEDS_PER_CONFIGURATION);
  });

  it("names DEV as the producer's split", () => {
    expect(METRIC_17_BASELINE_SPLIT).toBe("dev");
  });

  it("refuses a population of four seeds rather than scaling the statistic", () => {
    expect(() =>
      metric17BaselineStatistic([
        { seed: 2_000, rate: 0.1 },
        { seed: 2_001, rate: 0.1 },
        { seed: 2_002, rate: 0.1 },
        { seed: 2_003, rate: 0.1 },
      ]),
    ).toThrow(/five DEV seeds/);
  });

  it("refuses a repeated seed, which would weight one dataset twice", () => {
    expect(() =>
      metric17BaselineStatistic([
        { seed: 2_000, rate: 0.1 },
        { seed: 2_000, rate: 0.2 },
        { seed: 2_002, rate: 0.1 },
        { seed: 2_003, rate: 0.1 },
        { seed: 2_004, rate: 0.1 },
      ]),
    ).toThrow(/ONE RATE EACH/);
  });

  it("refuses a TEST seed, which §6.1 assigns to another split", () => {
    expect(() =>
      metric17BaselineStatistic([
        { seed: 2_000, rate: 0.1 },
        { seed: 2_001, rate: 0.1 },
        { seed: 2_002, rate: 0.1 },
        { seed: 2_003, rate: 0.1 },
        { seed: 9_100, rate: 0.9 },
      ]),
    ).toThrow(/five DEV seeds/);
  });

  it("accepts the five seeds in any order — a (split, seed) dataset is one period", () => {
    const ordered = metric17BaselineStatistic(samplesFor([0.1, 0.2, 0.3, 0.4, 0.5]));
    const shuffled = metric17BaselineStatistic([
      { seed: 2_004, rate: 0.5 },
      { seed: 2_001, rate: 0.2 },
      { seed: 2_003, rate: 0.4 },
      { seed: 2_000, rate: 0.1 },
      { seed: 2_002, rate: 0.3 },
    ]);
    expect(shuffled).toEqual(ordered);
  });
});

// ---------------------------------------------------------------------------
// 3. The statistic — the mean and the SAMPLE standard deviation, in bps
// ---------------------------------------------------------------------------

describe("3. §7's statistic is the mean and the SAMPLE stddev, recorded in integer bps", () => {
  it("computes the mean in basis points", () => {
    // rates 0.10 .. 0.50, mean 0.30 == 3000 bps.
    expect(metric17BaselineStatistic(samplesFor([0.1, 0.2, 0.3, 0.4, 0.5])).mean_bps).toBe(3_000);
  });

  it("uses the n-1 divisor, not n", () => {
    // Deviations 0.2, 0.1, 0, 0.1, 0.2 -> Σd² = 0.1.
    //   sample   sqrt(0.1 / 4) = 0.158113883 -> 1581 bps
    //   population sqrt(0.1 / 5) = 0.141421356 -> 1414 bps
    const stat = metric17BaselineStatistic(samplesFor([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(stat.stddev_bps).toBe(1_581);
    expect(stat.stddev_bps).not.toBe(1_414);
  });

  it("gives a zero stddev where the five rates agree", () => {
    const stat = metric17BaselineStatistic(samplesFor([0.25, 0.25, 0.25, 0.25, 0.25]));
    expect(stat).toEqual({ mean_bps: 2_500, stddev_bps: 0 });
  });

  it("rounds half up, once, at the end", () => {
    // Mean 0.00005 == 0.5 bps -> 1 bp half-up, not 0.
    const stat = metric17BaselineStatistic(samplesFor([0.00005, 0.00005, 0.00005, 0.00005, 0.00005]));
    expect(stat.mean_bps).toBe(1);
    expect(Number.isInteger(stat.mean_bps)).toBe(true);
    expect(Number.isInteger(stat.stddev_bps)).toBe(true);
  });

  it("is deterministic: the same five rates give the same pair, every time", () => {
    const rates = [0.0131, 0.0177, 0.0093, 0.0208, 0.0142];
    const first = metric17BaselineStatistic(samplesFor(rates));
    for (let i = 0; i < 8; i += 1) {
      expect(metric17BaselineStatistic(samplesFor(rates))).toEqual(first);
    }
  });

  it("is deterministic across two independent runs of the same hand-built dataset", () => {
    const build = (): readonly Metric17BaselineSample[] =>
      METRIC_17_BASELINE_SEEDS.map((seed, i) => {
        const run = runWith([
          ["ABSTAINED", 100_000 * (i + 1)],
          ["RECONCILED", 1_000_000 - 100_000 * (i + 1)],
        ]);
        return { seed, rate: abstentionRateByValue(run).ratio };
      });
    expect(metric17BaselineStatistic(build())).toEqual(metric17BaselineStatistic(build()));
  });
});

// ---------------------------------------------------------------------------
// 4. The frozen table — §7's persistence surface, and the fail-closed read
// ---------------------------------------------------------------------------

describe("4. §7's baseline table is read, never computed", () => {
  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). §9 step 0 has been
  // taken, so this case asserts the five measured offline rows in the pass's
  // own emitted order rather than §7's pre-step-0 empty state.
  it("carries §9 step 0's five measured rows, in the pass's emitted order", () => {
    expect(METRIC_17_BASELINE).toEqual([
      { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "B0-IDONLY", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A1-NOVALIDATE", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A2-NOABSTAIN", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
      { agent_id: "A3-NOLLM", llm_mode: "offline", mean_bps: 0, stddev_bps: 0 },
    ]);
    expect(Object.isFrozen(METRIC_17_BASELINE)).toBe(true);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). The two `offline` keys
  // are now measured rows and must NOT read as absent; the two `replay` keys
  // STAY null while §F F2 stands, which is the frozen semantics for the absent
  // column and not a state to be repaired.
  it("answers the measured row for a recorded key and null only for an absent one", () => {
    // M59: a measured (0, 0) pair IS a baseline. §5.5's unavailable-with-reason
    // governs a key §7 records NO PAIR for, never a key whose pair is zero.
    expect(metric17BaselineFor("ASSAY", "offline")).toEqual({
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 0,
      stddev_bps: 0,
    });
    expect(metric17BaselineFor("A2-NOABSTAIN", "offline")).not.toBeNull();
    expect(metric17BaselineFor("A2-NOABSTAIN", "offline")?.mean_bps).toBe(0);
    // §F F2's deferred column is genuinely absent and still reads UNAVAILABLE.
    expect(metric17BaselineFor("ASSAY", "replay")).toBeNull();
    expect(metric17BaselineFor("B0-IDONLY", "replay")).toBeNull();
    expect(metric17BaselineFor("B2-LLM-DIRECT", "offline")).toBeNull();
    expect(metric17BaselineFor("B2-LLM-DIRECT", "replay")).toBeNull();
  });

  it("keys per (agent_id, llm_mode) — never pooled, and never keyed by seed", () => {
    // §7's shape, asserted as a type-level and value-level fact: a row carries
    // exactly the four fields, and `seed` is not among them.
    const row = { agent_id: "ASSAY", llm_mode: "offline", mean_bps: 120, stddev_bps: 15 } as const;
    expect(Object.keys(row).sort()).toEqual([
      "agent_id",
      "llm_mode",
      "mean_bps",
      "stddev_bps",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4b. What §7's table must satisfy in EVERY state — before and after step 0
// ---------------------------------------------------------------------------

/**
 * The invariants that hold whether or not `§9` step 0 has been taken.
 *
 * The three marked cases above assert the table's **current** contents and must
 * be rewritten when the measured rows are transcribed. These
 * assert its **shape**, hold vacuously while it is empty, and are the ones that
 * will check the transcription itself — so the transcription commit adds no new
 * structural test and this suite never has an unguarded moment.
 */
describe("4b. §7's table is well-formed in every state, empty or populated", () => {
  it("is frozen, and every row carries §7's four fields and no fifth", () => {
    expect(Object.isFrozen(METRIC_17_BASELINE)).toBe(true);
    for (const row of METRIC_17_BASELINE) {
      expect(Object.keys(row).sort()).toEqual(["agent_id", "llm_mode", "mean_bps", "stddev_bps"]);
    }
  });

  it("names only §3 agents and only EVALUATION_SPEC.md §2's scored llm_modes", () => {
    for (const row of METRIC_17_BASELINE) {
      expect(AGENT_IDS).toContain(row.agent_id);
      expect(SCORED_LLM_MODES).toContain(row.llm_mode);
    }
  });

  it("carries integer basis points in 0..10_000 on both figures (M58)", () => {
    for (const row of METRIC_17_BASELINE) {
      for (const figure of [row.mean_bps, row.stddev_bps]) {
        expect(Number.isInteger(figure)).toBe(true);
        expect(figure).toBeGreaterThanOrEqual(0);
        expect(figure).toBeLessThanOrEqual(BPS_DENOMINATOR);
      }
    }
  });

  it("holds at most one row per (agent_id, llm_mode) — §7's key is the pair", () => {
    const keys = METRIC_17_BASELINE.map((row) => `${row.agent_id}|${row.llm_mode}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The reader agrees: a duplicated key throws rather than choosing a row.
    for (const row of METRIC_17_BASELINE) {
      expect(metric17BaselineFor(row.agent_id, row.llm_mode)).toEqual(row);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The flag — §4.10's formula, unchanged
// ---------------------------------------------------------------------------

describe("5. abstention_spike_flag is rate > baseline + k·σ with k_sigma = 3", () => {
  it("carries §7's frozen k_sigma", () => {
    expect(K_SIGMA).toBe(3);
  });

  it("fires strictly above the bar and not at it", () => {
    const mean = 100 / BPS_DENOMINATOR;
    const sigma = 10 / BPS_DENOMINATOR;
    const bar = mean + K_SIGMA * sigma; // 130 bps
    expect(abstentionSpikeFlag(bar, mean, sigma, K_SIGMA)).toBe(false);
    expect(abstentionSpikeFlag(bar + 1e-9, mean, sigma, K_SIGMA)).toBe(true);
    expect(abstentionSpikeFlag(bar - 1e-9, mean, sigma, K_SIGMA)).toBe(false);
  });

  it("never derives its baseline from the run it judges — both are parameters", () => {
    // The signature is the guarantee: nothing but the two supplied numbers and
    // k can move the bar, so no AgentRun can inform it.
    expect(abstentionSpikeFlag.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 6. The fail-closed read — a malformed §7 row is refused, not read past
// ---------------------------------------------------------------------------

describe("6. a malformed §7 row is a hard error", () => {
  const row = (over: Partial<Metric17BaselineRow> = {}): Metric17BaselineRow =>
    Object.freeze({
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 120,
      stddev_bps: 15,
      ...over,
    }) as Metric17BaselineRow;

  it("reads a well-formed row back unchanged", () => {
    expect(metric17BaselineFor("ASSAY", "offline", [row()])).toEqual(row());
  });

  it("still answers null for a key the supplied table has no row for", () => {
    expect(metric17BaselineFor("A2-NOABSTAIN", "offline", [row()])).toBeNull();
    expect(metric17BaselineFor("ASSAY", "replay", [row()])).toBeNull();
  });

  it("refuses a non-integer figure — §7 records integer basis points", () => {
    expect(() => metric17BaselineFor("ASSAY", "offline", [row({ mean_bps: 120.5 })])).toThrow(
      /integer basis points/,
    );
  });

  it("refuses a negative σ", () => {
    expect(() => metric17BaselineFor("ASSAY", "offline", [row({ stddev_bps: -1 })])).toThrow(
      /malformed row is refused/,
    );
  });

  it("refuses a figure above 10_000 bps, which no dimensionless ratio reaches", () => {
    expect(() => metric17BaselineFor("ASSAY", "offline", [row({ mean_bps: 10_001 })])).toThrow(
      /rule 5 bounds/,
    );
  });

  it("refuses a duplicated (agent_id, llm_mode) rather than choosing a row", () => {
    expect(() =>
      metric17BaselineFor("ASSAY", "offline", [row({ mean_bps: 100 }), row({ mean_bps: 200 })]),
    ).toThrow(/corrupt transcription/);
  });
});

// ---------------------------------------------------------------------------
// 7. metric17() — §4.10's arithmetic, and where it lives
// ---------------------------------------------------------------------------

describe("7. metric17 combines the run's rate with §7's recorded pair", () => {
  const run = runWith([
    ["ABSTAINED", 400_000],
    ["RECONCILED", 600_000],
  ]);

  it("publishes the rate and k_sigma with no baseline at all", () => {
    const report = metric17(run, null);
    expect(report.abstention_rate_by_value).toBe(0.4);
    expect(report.abstained_recon_line_value_paise).toBe(400_000);
    expect(report.batch_value_paise).toBe(1_000_000);
    expect(report.k_sigma).toBe(K_SIGMA);
  });

  it("answers a null flag rather than false where §7 records no pair", () => {
    const report = metric17(run, null);
    expect(report.abstention_spike_flag).toBeNull();
    expect(report.abstention_spike_flag).not.toBe(false);
    expect(report.baseline_mean_bps).toBeNull();
    expect(report.baseline_stddev_bps).toBeNull();
  });

  it("fires where the rate clears baseline + 3σ, converting §7's bps once", () => {
    // 100 + 3*10 = 130 bps; the run's rate is 4000 bps.
    const report = metric17(run, {
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 100,
      stddev_bps: 10,
    });
    expect(report.abstention_spike_flag).toBe(true);
    expect(report.baseline_mean_bps).toBe(100);
    expect(report.baseline_stddev_bps).toBe(10);
  });

  it("does not fire where the rate sits under the bar", () => {
    // 4000 + 3*100 = 4300 bps; the run's rate is 4000 bps.
    const report = metric17(run, {
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 4_000,
      stddev_bps: 100,
    });
    expect(report.abstention_spike_flag).toBe(false);
  });

  it("echoes §7's pair unchanged — the baseline is never recomputed from the run", () => {
    const row: Metric17BaselineRow = {
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 4_321,
      stddev_bps: 77,
    };
    // Two runs whose rates differ by an order of magnitude echo the SAME pair.
    const quiet = metric17(runWith([["RECONCILED", 1_000_000]]), row);
    const loud = metric17(runWith([["ABSTAINED", 1_000_000]]), row);
    expect(quiet.baseline_mean_bps).toBe(4_321);
    expect(loud.baseline_mean_bps).toBe(4_321);
    expect(quiet.baseline_stddev_bps).toBe(loud.baseline_stddev_bps);
    expect(quiet.abstention_rate_by_value).toBe(0);
    expect(loud.abstention_rate_by_value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. M58 — the recorded pair's encoding, its rounding, and its single spelling
//    (spec 1.4.36, register row DATA_MODEL.md §22.2 M58, residual §10 V33)
// ---------------------------------------------------------------------------

/** The same five rates, given in bps rather than as ratios. */
const bpsSamples = (bps: readonly number[]): readonly Metric17BaselineSample[] =>
  samplesFor(bps.map((b) => b / BPS_DENOMINATOR));

describe("8. M58 — the five rates enter the statistic at FULL PRECISION", () => {
  it("takes σ over unrounded rates: pre-rounding each rate would give 1 bp, not 0", () => {
    // Five rates of 1.0, 1.2, 1.4, 1.6 and 1.8 bps. Rounded to integer bps
    // FIRST they are 1, 1, 1, 2, 2 and their sample σ is 0.5477 bps -> 1. Taken
    // at full precision the σ is 0.3162 bps -> 0. M58 freezes the second
    // reading: the rates "enter the mean and the SAMPLE standard deviation at
    // FULL PRECISION and are NOT rounded first".
    const full = metric17BaselineStatistic(bpsSamples([1.0, 1.2, 1.4, 1.6, 1.8]));
    const preRounded = metric17BaselineStatistic(bpsSamples([1, 1, 1, 2, 2]));
    expect(full.stddev_bps).toBe(0);
    expect(preRounded.stddev_bps).toBe(1);
    expect(full.stddev_bps).not.toBe(preRounded.stddev_bps);
  });

  it("takes the mean over unrounded rates: pre-rounding would give 3 bps, not 2", () => {
    // Four rates of exactly 2.5 bps and one of 2.4. Rounded first they are
    // 3, 3, 3, 3, 2 -> mean 2.8 -> 3. At full precision the mean is 2.48 -> 2.
    const full = metric17BaselineStatistic(bpsSamples([2.5, 2.5, 2.5, 2.5, 2.4]));
    const preRounded = metric17BaselineStatistic(bpsSamples([3, 3, 3, 3, 2]));
    expect(full.mean_bps).toBe(2);
    expect(preRounded.mean_bps).toBe(3);
  });

  it("carries the per-seed rate as a ratio, so there is nowhere to round it first", () => {
    // The seam itself is the guarantee: Metric17BaselineSample.rate is
    // abstentionRateByValue's ratio, and the only conversion to bps in this
    // package is the one at the end of the statistic.
    const rate = abstentionRateByValue(
      runWith([
        ["ABSTAINED", 1],
        ["RECONCILED", 999_999],
      ]),
    ).ratio;
    expect(rate).toBe(1 / 1_000_000);
    expect(Number.isInteger(rate * BPS_DENOMINATOR)).toBe(false);
    expect(metric17BaselineStatistic(samplesFor([rate, rate, rate, rate, rate]))).toEqual({
      mean_bps: 0,
      stddev_bps: 0,
    });
  });
});

describe("8. M58 — mean_bps and stddev_bps are rounded ONCE and INDEPENDENTLY", () => {
  it("rounds each figure from its own value, and they can go opposite ways", () => {
    // Full precision: mean 100.5 bps, σ 20.4000306 bps. The mean rounds UP on
    // the tie and the σ rounds DOWN, from its own value, in the same call.
    const stat = metric17BaselineStatistic(samplesFor([0.007165, 0.01005, 0.01005, 0.01005, 0.012935]));
    expect(stat.mean_bps).toBe(101);
    expect(stat.stddev_bps).toBe(20);
  });

  it("gives two different σ for one mean — σ is not a function of mean_bps", () => {
    const spread = metric17BaselineStatistic(samplesFor([0.1, 0.2, 0.3, 0.4, 0.5]));
    const flat = metric17BaselineStatistic(samplesFor([0.3, 0.3, 0.3, 0.3, 0.3]));
    expect(spread.mean_bps).toBe(3_000);
    expect(flat.mean_bps).toBe(3_000);
    expect(spread.stddev_bps).toBe(1_581);
    expect(flat.stddev_bps).toBe(0);
  });

  it("gives one σ for two different means — σ is never re-derived from mean_bps", () => {
    const low = metric17BaselineStatistic(samplesFor([0.1, 0.2, 0.3, 0.4, 0.5]));
    const high = metric17BaselineStatistic(samplesFor([0.5, 0.6, 0.7, 0.8, 0.9]));
    expect(low.mean_bps).toBe(3_000);
    expect(high.mean_bps).toBe(7_000);
    expect(low.stddev_bps).toBe(high.stddev_bps);
    expect(low.stddev_bps).toBe(1_581);
  });

  it("rounds exactly once — the pair is not a rounding of an already-rounded figure", () => {
    // 1581.1388 bps rounds to 1581 in one step. Rounding to a coarser unit and
    // back, or rounding the variance before the square root, would not land
    // here: sqrt of a rounded variance gives 1581.1387... in bps too, but
    // rounding each deviation to bps first gives 1581 only by luck, so the
    // assertion that pins "once" is that the σ equals round(sqrt(var)*10_000)
    // computed from the untouched ratios.
    const rates = [0.1, 0.2, 0.3, 0.4, 0.5];
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / (rates.length - 1);
    expect(metric17BaselineStatistic(samplesFor(rates))).toEqual({
      mean_bps: Math.round(mean * BPS_DENOMINATOR),
      stddev_bps: Math.round(Math.sqrt(variance) * BPS_DENOMINATOR),
    });
  });
});

describe("8. M58 — round_half_up, ties AWAY FROM ZERO", () => {
  it("breaks a tie upward and not to even", () => {
    // 2.5 -> 3 and 4.5 -> 5. Banker's rounding would give 2 and 4.
    expect(metric17BaselineStatistic(bpsSamples([2.5, 2.5, 2.5, 2.5, 2.5])).mean_bps).toBe(3);
    expect(metric17BaselineStatistic(bpsSamples([4.5, 4.5, 4.5, 4.5, 4.5])).mean_bps).toBe(5);
    // 0.5 -> 1, which is also §10 V33's boundary: below it a σ records as 0.
    expect(metric17BaselineStatistic(bpsSamples([0.5, 0.5, 0.5, 0.5, 0.5])).mean_bps).toBe(1);
  });

  it("breaks a NEGATIVE tie away from zero, where Math.round would go toward +∞", () => {
    // Unreachable through §9 step 0 — a rate is a non-negative ratio and both
    // of §7's figures are non-negative. Asserted anyway because M58 states the
    // mode as ties AWAY FROM ZERO, and a rule that held only because its inputs
    // happen to be positive would be the platform's rule and not the corpus's.
    expect(Math.round(-2.5)).toBe(-2);
    expect(metric17BaselineStatistic(bpsSamples([-2.5, -2.5, -2.5, -2.5, -2.5])).mean_bps).toBe(-3);
    expect(metric17BaselineStatistic(bpsSamples([-0.5, -0.5, -0.5, -0.5, -0.5])).mean_bps).toBe(-1);
  });

  it("rounds down below the tie and up above it, on both figures", () => {
    expect(metric17BaselineStatistic(bpsSamples([2.4, 2.4, 2.4, 2.4, 2.4])).mean_bps).toBe(2);
    expect(metric17BaselineStatistic(bpsSamples([2.6, 2.6, 2.6, 2.6, 2.6])).mean_bps).toBe(3);
  });
});

describe("8. M58 — the rounded pair is the ONLY baseline representation", () => {
  it("returns exactly mean_bps and stddev_bps, and no unrounded companion", () => {
    const stat = metric17BaselineStatistic(samplesFor([0.0131, 0.0177, 0.0093, 0.0208, 0.0142]));
    expect(Object.keys(stat).sort()).toEqual(["mean_bps", "stddev_bps"]);
    expect(Number.isInteger(stat.mean_bps)).toBe(true);
    expect(Number.isInteger(stat.stddev_bps)).toBe(true);
    expect(Object.isFrozen(stat)).toBe(true);
  });

  it("gives §7's row the same two fields and no third", () => {
    const row: Metric17BaselineRow = {
      agent_id: "ASSAY",
      llm_mode: "offline",
      mean_bps: 120,
      stddev_bps: 15,
    };
    expect(Object.keys(row).sort()).toEqual(["agent_id", "llm_mode", "mean_bps", "stddev_bps"]);
  });

  // @STEP-0-TRANSITION — APPLIED at spec 1.4.37 (M59). The whole case was the
  // pre-step-0 state and is now the populated-transcription assertion: five
  // rows, offline only, every figure an integer bps, and the replay keys still
  // null.
  it("holds §9 step 0's transcription — five offline rows, integer bps, replay absent", () => {
    // M58: "intentionally empty ([]) before step 0"; M59: step 0 has been taken
    // and the exact measured rows are transcribed, nothing guessed or prefilled.
    expect(METRIC_17_BASELINE).toHaveLength(5);
    expect(Object.isFrozen(METRIC_17_BASELINE)).toBe(true);
    for (const row of METRIC_17_BASELINE) {
      expect(row.llm_mode).toBe("offline");
      expect(Number.isInteger(row.mean_bps)).toBe(true);
      expect(Number.isInteger(row.stddev_bps)).toBe(true);
      expect(Object.keys(row).sort()).toEqual([
        "agent_id",
        "llm_mode",
        "mean_bps",
        "stddev_bps",
      ]);
    }
    // Exactly the five §9 step 0 runs, each once — no replay row, no B2 row.
    expect(METRIC_17_BASELINE.map((r) => r.agent_id)).toEqual([
      "ASSAY",
      "B0-IDONLY",
      "A1-NOVALIDATE",
      "A2-NOABSTAIN",
      "A3-NOLLM",
    ]);
    for (const agent of ["ASSAY", "A1-NOVALIDATE", "A2-NOABSTAIN", "B0-IDONLY"] as const) {
      expect(metric17BaselineFor(agent, "offline")).not.toBeNull();
      expect(metric17BaselineFor(agent, "replay")).toBeNull();
    }
  });

  // The other half of M59's ratification: a measured (0, 0) row drives the
  // UNCHANGED detector, and the bar it makes is `rate > 0`.
  it("M59 — a measured (0, 0) row is a baseline and makes the bar rate > 0", () => {
    const row = metric17BaselineFor("ASSAY", "offline");
    expect(row).not.toBeNull();
    const bar =
      (row?.mean_bps ?? NaN) / BPS_DENOMINATOR +
      K_SIGMA * ((row?.stddev_bps ?? NaN) / BPS_DENOMINATOR);
    expect(bar).toBe(0);
    // The flag is COMPUTED, never null — §5.5's UNAVAILABLE is not engaged.
    const quiet = metric17(runWith([["RECONCILED", 1_000_000]]), row);
    expect(quiet.abstention_spike_flag).toBe(false);
    expect(quiet.baseline_mean_bps).toBe(0);
    expect(quiet.baseline_stddev_bps).toBe(0);
    expect(quiet.k_sigma).toBe(3);
    // Any positive abstained recon_line value fires; the comparison is strict.
    const oneP = metric17(runWith([["ABSTAINED", 1], ["RECONCILED", 999_999]]), row);
    expect(oneP.abstention_spike_flag).toBe(true);
    // An ABSENT key still reads UNAVAILABLE rather than false.
    expect(metric17(runWith([["ABSTAINED", 1]]), null).abstention_spike_flag).toBeNull();
  });
});

describe("8. M58 — the detector reads the ROUNDED pair against a FULL-PRECISION rate", () => {
  const row: Metric17BaselineRow = {
    agent_id: "ASSAY",
    llm_mode: "offline",
    mean_bps: 100,
    stddev_bps: 10,
  };

  it("builds the bar from the two integers, exactly as §4.10 spells it", () => {
    const bar = row.mean_bps / BPS_DENOMINATOR + K_SIGMA * (row.stddev_bps / BPS_DENOMINATOR);
    // rate == bar is NOT a spike: §4.10's ">" is strict and M58 preserved it.
    expect(metric17(runWith([["ABSTAINED", 130], ["RECONCILED", 9_870]]), row).abstention_spike_flag)
      .toBe(false);
    expect(abstentionSpikeFlag(0.013, row.mean_bps / BPS_DENOMINATOR, row.stddev_bps / BPS_DENOMINATOR, K_SIGMA))
      .toBe(false);
    expect(bar).toBeGreaterThan(0.0129);
  });

  it("does NOT quantize the run's rate: a rate 0.0001 bps over the bar still fires", () => {
    // 130.0001 bps. Rounded to integer bps it would be 130 and the flag would
    // read false; M58 leaves the run's own rate continuous, so it fires.
    const run = runWith([
      ["ABSTAINED", 1_300_001],
      ["RECONCILED", 98_699_999],
    ]);
    const report = metric17(run, row);
    expect(report.abstention_rate_by_value).toBe(0.01300001);
    expect(Math.round(report.abstention_rate_by_value * BPS_DENOMINATOR)).toBe(130);
    expect(report.abstention_spike_flag).toBe(true);
  });

  it("echoes the pair in §7's integer bps and never as a re-derived ratio", () => {
    const report = metric17(runWith([["RECONCILED", 1_000_000]]), row);
    expect(report.baseline_mean_bps).toBe(100);
    expect(report.baseline_stddev_bps).toBe(10);
    expect(Number.isInteger(report.baseline_mean_bps ?? NaN)).toBe(true);
    expect(Number.isInteger(report.baseline_stddev_bps ?? NaN)).toBe(true);
    expect(report.k_sigma).toBe(3);
  });

  it("collapses the bar to mean_bps where §10 V33's σ band applies", () => {
    // Five rates spanning 0.8 bps: a genuinely non-zero σ of 0.3162 bps records
    // as 0, and the bar becomes mean_bps alone. Declared, not repaired.
    const stat = metric17BaselineStatistic(bpsSamples([1.0, 1.2, 1.4, 1.6, 1.8]));
    expect(stat.stddev_bps).toBe(0);
    const collapsed: Metric17BaselineRow = {
      agent_id: "ASSAY",
      llm_mode: "offline",
      ...stat,
    };
    // The bar is 1 bp, so a rate of 2 bps fires and a rate of 1 bp does not.
    expect(metric17(runWith([["ABSTAINED", 2], ["RECONCILED", 9_998]]), collapsed).abstention_spike_flag)
      .toBe(true);
    expect(metric17(runWith([["ABSTAINED", 1], ["RECONCILED", 9_999]]), collapsed).abstention_spike_flag)
      .toBe(false);
  });
});
