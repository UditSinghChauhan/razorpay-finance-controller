import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Observation, ObservationId } from "@assay/domain";
import {
  EPSILON_BPS,
  TAU_SWEEP_FLOOR_PAISE,
  runKey,
  type AgentId,
  type AgentInput,
  type AgentRun,
  type RunConfig,
} from "@assay/eval";
import { describe, expect, it } from "vitest";

import { ZERO_SOLVE_OUTCOMES } from "../src/agents/assay.js";
import { SWEPT_AGENT_IDS, SWEPT_RUNNERS, isSweptAgent, sweptRunnerFor } from "../src/agents/index.js";
import {
  EPSILON_GRID_BPS,
  EPSILON_OPERATING_POINT_BPS,
  EPSILON_SWEEP_STEP_BPS,
  TAU_FLOOR_GRID_PAISE,
  runEpsilonSweep,
  runSweeps,
  runTauSweep,
  type SweepPoint,
  type RiskAxis,
} from "../src/bench/sweep.js";
import type { SweepParameters, SweptRunner } from "../src/agents/sweep-runner.js";
import { CliError } from "../src/errors.js";

/**
 * `EVALUATION_SPEC.md §5.1`'s ε sweep and `§5.3`'s τ sweep, as `apps/cli`
 * executes them — spec 1.4.32, register row `DATA_MODEL.md §22.2` **M51**,
 * implementation item (2).
 *
 * **Two kinds of test, and the split is deliberate.** The loop's mechanics — the
 * grid, the order, the completeness check, the point identity — are exercised
 * against an **in-memory runner**, because M51 requires 21 ε points and running
 * the real pipeline 21 times per assertion would make the suite a benchmark. The
 * *semantics* — that a swept threshold actually reaches stage `S4` — are
 * exercised once, end to end, at a handful of values on a small fixture.
 *
 * **No benchmark data is produced here.** Every observation below is built in
 * this file, nothing is written to `bench/`, and `PREREGISTRATION.md §6.1`'s bar
 * on generating benchmark data before the seal is not approached.
 */

// ---------------------------------------------------------------------------
// An in-memory swept runner
// ---------------------------------------------------------------------------

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: true,
  split: "dev",
  seed: 2000,
});

const EMPTY_INPUT: AgentInput = Object.freeze({ observations: [], config: CONFIG });

/**
 * `§5.1`'s risk axis, absent.
 *
 * These cases exercise the **walk** — the grids, the order, the point identity
 * and the refusals — none of which reads ground truth. `null` is what
 * `bench/scorer.ts` returns for a scored unit that was given no answer key, so
 * the sweep is driven here exactly as it is on a `dev` unit. The axis's own
 * wiring is `truth-scoring.test.ts`'s.
 */
const NO_HARM: RiskAxis = () => null;

function stubRun(agentId: AgentId): AgentRun {
  return {
    agent_id: agentId,
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
  };
}

/** Records every `SweepParameters` it was handed, in call order. */
function recorder(agentId: AgentId = "ASSAY"): {
  runner: SweptRunner;
  calls: SweepParameters[];
} {
  const calls: SweepParameters[] = [];
  const runner: SweptRunner = (_input, sweep) => {
    calls.push(sweep);
    return Promise.resolve({ run: stubRun(agentId), solve_outcomes: ZERO_SOLVE_OUTCOMES });
  };
  return { runner, calls };
}

// ---------------------------------------------------------------------------
// A + B — the frozen ε grid
// ---------------------------------------------------------------------------

describe("A/B. the ε grid is §7's 21 points and contains the operating point", () => {
  it("is exactly {0, 500, ..., 10_000}", () => {
    expect(EPSILON_GRID_BPS).toHaveLength(21);
    expect(EPSILON_GRID_BPS[0]).toBe(0);
    expect(EPSILON_GRID_BPS.at(-1)).toBe(10_000);
    expect(EPSILON_GRID_BPS).toStrictEqual(
      Array.from({ length: 21 }, (_u, i) => i * EPSILON_SWEEP_STEP_BPS),
    );
  });

  it("contains 1500, the frozen operating point", () => {
    // Asserted against the frozen constant, not a literal, so moving §7's value
    // moves this test rather than leaving it stale.
    expect(EPSILON_GRID_BPS).toContain(EPSILON_BPS);
    expect(EPSILON_OPERATING_POINT_BPS).toBe(EPSILON_BPS);
    expect(EPSILON_GRID_BPS).toContain(1_500);
  });

  it("is strictly ascending and free of duplicates", () => {
    for (let i = 1; i < EPSILON_GRID_BPS.length; i += 1) {
      expect(EPSILON_GRID_BPS[i]).toBeGreaterThan(EPSILON_GRID_BPS[i - 1] ?? Infinity);
    }
  });

  it("uses §5.3's four τ floors in §5.3's declared order", () => {
    expect(TAU_FLOOR_GRID_PAISE).toStrictEqual(TAU_SWEEP_FLOOR_PAISE);
    expect(TAU_FLOOR_GRID_PAISE).toStrictEqual([1_000, 10_000, 100_000, 1_000_000]);
  });
});

// ---------------------------------------------------------------------------
// C + D — execution order
// ---------------------------------------------------------------------------

describe("C/D. points execute in the frozen declared order", () => {
  it("walks ε ascending, one execution per point", async () => {
    const { runner, calls } = recorder();
    const points = await runEpsilonSweep(runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    expect(calls.map((c) => c.epsilonBps)).toStrictEqual([...EPSILON_GRID_BPS]);
    expect(points.map((p) => p.parameter_value)).toStrictEqual([...EPSILON_GRID_BPS]);
    expect(calls).toHaveLength(21);
  });

  it("walks τ in §5.3's order, one execution per point", async () => {
    const { runner, calls } = recorder();
    const points = await runTauSweep(runner, EMPTY_INPUT, "ASSAY");
    expect(calls.map((c) => c.tauFloorPaise)).toStrictEqual([...TAU_FLOOR_GRID_PAISE]);
    expect(points.map((p) => p.parameter_value)).toStrictEqual([...TAU_FLOOR_GRID_PAISE]);
  });

  it("varies one parameter at a time — the other is omitted, never defaulted here", () => {
    // An explicit value would be a second spelling of §7's frozen threshold.
    // Omitted, `packages/engine` resolves it, which is M51 item (1)'s contract.
    return Promise.all([
      (async () => {
        const { runner, calls } = recorder();
        await runEpsilonSweep(runner, EMPTY_INPUT, "ASSAY", NO_HARM);
        for (const c of calls) expect(c.tauFloorPaise).toBeUndefined();
      })(),
      (async () => {
        const { runner, calls } = recorder();
        await runTauSweep(runner, EMPTY_INPUT, "ASSAY");
        for (const c of calls) expect(c.epsilonBps).toBeUndefined();
      })(),
    ]);
  });

  it("marks the operating point on the ε curve and nowhere else", async () => {
    const { runner } = recorder();
    const points = await runEpsilonSweep(runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    const flagged = points.filter((p) => p.is_operating_point);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.parameter_value).toBe(EPSILON_BPS);
  });
});

// ---------------------------------------------------------------------------
// E — the agent matrix
// ---------------------------------------------------------------------------

describe("E. only §5.1's two curve agents are swept", () => {
  it("registers ASSAY and A1-NOVALIDATE, and nothing else", () => {
    expect([...SWEPT_RUNNERS.keys()].sort()).toStrictEqual(["A1-NOVALIDATE", "ASSAY"]);
    expect([...SWEPT_AGENT_IDS].sort()).toStrictEqual(["A1-NOVALIDATE", "ASSAY"]);
  });

  it("leaves B0, A2 and A3 as single points — §5.1's own words", () => {
    for (const id of ["B0-IDONLY", "A2-NOABSTAIN", "A3-NOLLM"] as const) {
      expect(isSweptAgent(id)).toBe(false);
      expect(sweptRunnerFor(id)).toBeUndefined();
    }
  });

  it("excludes B1 and B2, which are outside Tier-0 entirely", () => {
    for (const id of ["B1-GREEDY", "B2-LLM-DIRECT"] as const) {
      expect(isSweptAgent(id)).toBe(false);
      expect(sweptRunnerFor(id)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// F + N — the run identity is untouched
// ---------------------------------------------------------------------------

describe("F/N. RunKey is the same across every sweep point and gains no field", () => {
  it("keys every point of a sweep under one unchanged RunKey", async () => {
    const key = runKey("ASSAY", CONFIG);
    const { runner } = recorder();
    const sweeps = await runSweeps(runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    // The key is the enclosing artifact's and is written once; no point carries
    // one of its own, and none of the four fields is a sweep parameter.
    expect(Object.keys(key).sort()).toStrictEqual(["agent_id", "llm_mode", "seed", "split"]);
    for (const p of [...sweeps.epsilon, ...sweeps.tau]) {
      expect(Object.keys(p)).not.toContain("key");
      expect(Object.keys(p)).not.toContain("run_key");
    }
  });

  it("keeps RunConfig, RunKey and AgentInput free of either threshold", () => {
    // Read as text: `packages/eval` may not import `apps/cli` and this is the
    // mirror of that edge. `discipline.test.ts` reads sources the same way.
    const EVAL_SRC = join(import.meta.dirname, "..", "..", "..", "packages", "eval", "src");
    const read = (f: string): string => readFileSync(join(EVAL_SRC, f), "utf8");
    for (const f of ["agent.ts", "run-key.ts", "run.ts"]) {
      expect(read(f)).not.toMatch(/readonly (epsilon_bps|tau_floor_paise|epsilonBps)\s*[?]?\s*:/);
    }
    const fields = (src: string, name: string): string[] =>
      [
        ...(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(src)?.[1] ?? "")
          .matchAll(/^ {2}readonly (\w+)[?]?:/gm),
      ].map((m) => m[1] ?? "");
    expect(fields(read("agent.ts"), "RunConfig")).toStrictEqual([
      "llm_mode", "strict_replay", "split", "seed",
    ]);
    expect(fields(read("run-key.ts"), "RunKey")).toStrictEqual([
      "agent_id", "split", "seed", "llm_mode",
    ]);
  });
});

// ---------------------------------------------------------------------------
// G + H — one artifact, base metrics preserved
// ---------------------------------------------------------------------------

describe("G/H. the sweeps nest inside one metrics.json beside the base metrics", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  const bench = readFileSync(join(SRC, "commands", "bench.ts"), "utf8");
  const pathModule = readFileSync(join(SRC, "artifacts", "metrics-path.ts"), "utf8");

  it("writes to M48's path and introduces no fifth segment", () => {
    expect(pathModule).toMatch(/runRoot\(runId\)/);
    expect(pathModule).not.toMatch(/epsilon|tau_floor/i);
    // One write per scored unit, through the one path builder.
    expect(bench).toMatch(/context\.sink\.write\(metricsPath\(runId, key\), encodeMetrics/);
    expect(bench.match(/context\.sink\.write\(/g)).toHaveLength(1);
  });

  it("carries base and sweeps side by side — the base is not replaced", () => {
    const metrics = readFileSync(join(SRC, "artifacts", "metrics.ts"), "utf8");
    expect(metrics).toMatch(/readonly base: BaseMetrics;/);
    expect(metrics).toMatch(/readonly sweeps: AgentSweeps;/);
    // One `ScoredMetrics` literal, carrying the base and the sweeps side by
    // side. `risk_coverage` joined them when metric 3 was wired: §5.1's AURC is
    // a function of the CURVE and so of the unit rather than of one execution,
    // which is why M51 puts the whole curve inside one scored unit. It is a
    // sibling of `sweeps`, not a replacement for `base`.
    expect(bench).toMatch(
      /Object\.freeze\(\{\s*key,\s*base,\s*sweeps,\s*risk_coverage: \w+,\s*\}\)/,
    );
  });

  it("gives a single-point agent an empty pair of curves, not a missing field", async () => {
    // B0/A2/A3 still produce an artifact; what they do not produce is a curve.
    const { NO_SWEEPS } = await import("../src/bench/sweep.js");
    expect(NO_SWEEPS.epsilon).toStrictEqual([]);
    expect(NO_SWEEPS.tau).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// L — fail closed
// ---------------------------------------------------------------------------

describe("L. a failed or missing point is refused, never dropped", () => {
  /** A runner that throws on its `failAt`-th call. Fresh per assertion. */
  const throwingAt = (failAt: number): SweptRunner => {
    let n = 0;
    return () => {
      n += 1;
      if (n === failAt) return Promise.reject(new Error("boom"));
      return Promise.resolve({ run: stubRun("ASSAY"), solve_outcomes: ZERO_SOLVE_OUTCOMES });
    };
  };

  it("refuses a curve when one execution throws", async () => {
    await expect(runEpsilonSweep(throwingAt(4), EMPTY_INPUT, "ASSAY", NO_HARM)).rejects.toThrow(CliError);
    // The refusal names the point, so a reader knows which one was lost.
    await expect(runEpsilonSweep(throwingAt(4), EMPTY_INPUT, "ASSAY", NO_HARM)).rejects.toThrow(
      /epsilon_bps=1500/,
    );
    // The last point is as fatal as the first: no partial curve is published.
    await expect(runEpsilonSweep(throwingAt(21), EMPTY_INPUT, "ASSAY", NO_HARM)).rejects.toThrow(CliError);
    await expect(runTauSweep(throwingAt(4), EMPTY_INPUT, "ASSAY")).rejects.toThrow(
      /tau_floor_paise=1000000/,
    );
  });

  it("refuses a point that came back labelled as another agent", async () => {
    const runner: SweptRunner = () =>
      Promise.resolve({ run: stubRun("B0-IDONLY"), solve_outcomes: ZERO_SOLVE_OUTCOMES });
    await expect(runTauSweep(runner, EMPTY_INPUT, "ASSAY")).rejects.toThrow(
      /cannot be associated with its RunKey/,
    );
  });
});

// ---------------------------------------------------------------------------
// M — determinism
// ---------------------------------------------------------------------------

describe("M. identical inputs give identical sweeps", () => {
  it("produces byte-identical point sequences across two executions", async () => {
    const a = await runSweeps(recorder().runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    const b = await runSweeps(recorder().runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    expect(a).toStrictEqual(b);
  });

  it("orders points by the frozen grid, not by iteration over a map or object", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "src", "bench", "sweep.ts"), "utf8");
    expect(src).toMatch(/for \(const epsilonBps of EPSILON_GRID_BPS\)/);
    expect(src).toMatch(/for \(const tauFloorPaise of TAU_FLOOR_GRID_PAISE\)/);
    expect(src).not.toMatch(/Object\.keys|Object\.entries|\.sort\(/);
  });
});

// ---------------------------------------------------------------------------
// K — the oracle is never reached
// ---------------------------------------------------------------------------

describe("K. the τ sweep never consults the Ambiguity Oracle", () => {
  it("runs no oracle anywhere on the sweep path", () => {
    const SRC = join(import.meta.dirname, "..", "src");
    for (const rel of [
      ["bench", "sweep.ts"],
      ["commands", "bench.ts"],
      ["agents", "sweep-runner.ts"],
    ]) {
      const text = readFileSync(join(SRC, ...rel), "utf8");
      // Comments are stripped first: these modules *document* that the oracle is
      // not re-run, and the documentation must not be mistaken for a call. The
      // import specifier is checked against the raw text, where it lives.
      const body = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(text, rel.join("/")).not.toMatch(/from "@assay\/oracle"/);
      // M51's rule is that the oracle is not RE-RUN and its labels are not
      // regenerated -- "all three reported quantities are engine-side". None of
      // these files may enumerate, decompose or classify a target, and none may
      // hold a τ to do it with. What `bench.ts` does with the labels §9 step 3
      // already wrote is a different question, answered by the case below.
      expect(body, rel.join("/")).not.toMatch(/labelAll|completenessGate|oracleContext/);
      expect(body, rel.join("/")).not.toMatch(/tauFor|classify\(/);
    }
    // The sweep modules themselves never name the artifact in code. They
    // DOCUMENT that it is not regenerated, which is the claim, so comments are
    // stripped before the check for the same reason as above.
    for (const rel of [["bench", "sweep.ts"], ["agents", "sweep-runner.ts"]]) {
      const text = readFileSync(join(SRC, ...rel), "utf8");
      const body = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(body, rel.join("/")).not.toMatch(/oracle_labels/);
    }
  });

  it("reads oracle_labels.jsonl and writes exactly one artifact, so no label file is touched", () => {
    const bench = readFileSync(
      join(import.meta.dirname, "..", "src", "commands", "bench.ts"),
      "utf8",
    );
    // One write per scored unit, and it is the metrics artifact. §5.3 (M51):
    // `oracle_labels.jsonl` "is never regenerated, shadowed or overwritten", so
    // the file appears on the READ side only -- EVALUATION_SPEC.md §2's third
    // argument to `score(agent output, ground truth, oracle labels)`, which
    // metric 4 and metric 8's reference policy both need.
    expect(bench.match(/sink\.write\(/g)).toHaveLength(1);
    expect(bench).toMatch(/context\.sink\.write\(metricsPath\(runId, key\), encodeMetrics/);
    expect(bench).toMatch(/loadOracleLabels\(join\(seedDir, ORACLE_LABELS\)\)/);
    // Nothing writes it, shadows it or names a second copy of it.
    expect(bench).not.toMatch(/write\([^)]*ORACLE_LABELS/);
    expect(bench).not.toMatch(/encodeJsonl/);
  });
});

// ---------------------------------------------------------------------------
// I + J — the swept threshold really reaches stage S4
// ---------------------------------------------------------------------------

const DAY = 86_400;
const T0 = 1_782_900_000;
const obsId = (n: number): ObservationId =>
  `obs_${String(n).padStart(14, "0")}` as ObservationId;

function reconLine(
  n: number,
  credit: number,
  refund?: { readonly debit: number },
): Observation {
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: `${refund === undefined ? "pay_" : "rfnd_"}${String(n).padStart(14, "0")}`,
      type: refund === undefined ? "payment" : "refund",
      debit: refund?.debit ?? 0,
      credit,
      amount: refund === undefined ? credit + 2_000 : refund.debit,
      currency: "INR",
      fee: 2_000,
      tax: 305,
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
      method: "card",
      card_network: "Visa",
      card_issuer: null,
      card_type: "credit",
      dispute_id: null,
    },
  } as unknown as Observation;
}

const UTR = "UTR-SWEEP-0001";
const AMOUNT = 100_000;

/** A component `§6` solves to `AMBIGUOUS` at the frozen thresholds. */
const FIXTURE: readonly Observation[] = Object.freeze([
  {
    obs_id: obsId(900), source_file: "fixture.jsonl", source_line: 900,
    ingest_hash: "a".repeat(64), ingested_at: T0, source_system: "pg_settlements",
    kind: "settlement",
    payload: {
      id: `setl_${String(900).padStart(14, "0")}`, entity: "settlement", amount: AMOUNT,
      status: "processed", fees: 0, tax: 0, utr: UTR, created_at: T0,
    },
  } as unknown as Observation,
  {
    obs_id: obsId(901), source_file: "fixture.jsonl", source_line: 901,
    ingest_hash: "a".repeat(64), ingested_at: T0, source_system: "bank_statement",
    kind: "bank_line",
    payload: {
      bank_line_id: `bnk_${String(901).padStart(14, "0")}`, value_date: T0 + 3 * DAY,
      amount: AMOUNT, direction: "credit", running_balance: null, bank_ref: UTR,
    },
  } as unknown as Observation,
  // Two allocations tie out identically under `C6`
  // (`Σ credit − Σ debit = target.amount`): {1,2} nets 100_000 and {3,4} nets
  // 150_000 − 50_000 = 100_000. That is what makes `§6` see a second feasible
  // solution and reach its ambiguity branches at all.
  reconLine(1, 50_000),
  reconLine(2, 50_000),
  reconLine(3, 150_000),
  reconLine(4, 0, { debit: 50_000 }),
]);

describe("I/J. a swept threshold reaches stage S4 and moves §6's outcome", () => {
  const input: AgentInput = Object.freeze({ observations: FIXTURE, config: CONFIG });
  const assay = sweptRunnerFor("ASSAY");

  it("is registered — the end-to-end path exists", () => {
    expect(assay).toBeDefined();
  });

  /** The fixture's one target, at the frozen thresholds: `§6`'s AMBIGUOUS. */
  const AT_FROZEN = { UNIQUE: 0, IMMATERIALLY_AMBIGUOUS: 0, DISCRIMINATED: 0, AMBIGUOUS: 1, INTRACTABLE: 0 };

  it("the fixture is discriminating — it abstains at the frozen thresholds", async () => {
    // Stated first and exactly, because every assertion below is a *change*
    // from this baseline. A fixture that solved to UNIQUE would make the two
    // sweep tests pass vacuously, which is the failure mode they exist to avoid.
    if (assay === undefined) throw new Error("ASSAY is not registered");
    expect((await assay(input, {})).solve_outcomes).toStrictEqual(AT_FROZEN);
  });

  it("J — raising τ's floor moves AMBIGUOUS into IMMATERIALLY_AMBIGUOUS", async () => {
    if (assay === undefined) throw new Error("ASSAY is not registered");
    // §5.3's four declared floors against this target's materiality. Exact
    // tallies, not inequalities: the shift is the thing `§5.3` says the sweep
    // exists to show, so it is asserted rather than bounded.
    const tally = async (floor: number) =>
      (await assay(input, { tauFloorPaise: floor })).solve_outcomes;
    expect(await tally(TAU_FLOOR_GRID_PAISE[0] ?? 0)).toStrictEqual(AT_FROZEN);
    expect(await tally(TAU_FLOOR_GRID_PAISE[1] ?? 0)).toStrictEqual(AT_FROZEN);
    const shifted = { ...AT_FROZEN, AMBIGUOUS: 0, IMMATERIALLY_AMBIGUOUS: 1 };
    expect(await tally(TAU_FLOOR_GRID_PAISE[2] ?? 0)).toStrictEqual(shifted);
    expect(await tally(TAU_FLOOR_GRID_PAISE[3] ?? 0)).toStrictEqual(shifted);
  });

  it("I — lowering ε moves AMBIGUOUS into DISCRIMINATED, and τ's branch holds", async () => {
    if (assay === undefined) throw new Error("ASSAY is not registered");
    const tally = async (eps: number) => (await assay(input, { epsilonBps: eps })).solve_outcomes;
    // ε = 0 admits every gap, so `Δs >= ε` holds and §6 discriminates.
    expect(await tally(EPSILON_GRID_BPS[0] ?? 0)).toStrictEqual({
      ...AT_FROZEN, AMBIGUOUS: 0, DISCRIMINATED: 1,
    });
    // At the frozen ε and at the grid's top the gap is too small: abstain.
    expect(await tally(EPSILON_BPS)).toStrictEqual(AT_FROZEN);
    expect(await tally(EPSILON_GRID_BPS[20] ?? 0)).toStrictEqual(AT_FROZEN);
    // §6's table is ordered — τ is evaluated first — so no ε moves a target into
    // or out of IMMATERIALLY_AMBIGUOUS. The independence M51(1) proved at the
    // engine level, asserted here through the agent.
    for (const eps of [0, EPSILON_BPS, 10_000]) {
      expect((await tally(eps)).IMMATERIALLY_AMBIGUOUS).toBe(0);
      expect((await tally(eps)).UNIQUE).toBe(0);
    }
  });

  it("omitting both parameters is the ordinary frozen execution", async () => {
    if (assay === undefined) throw new Error("ASSAY is not registered");
    const bare = await assay(input, {});
    const explicit = await assay(input, { epsilonBps: EPSILON_BPS });
    expect(bare.solve_outcomes).toStrictEqual(explicit.solve_outcomes);
    expect(bare.solve_outcomes).toStrictEqual(AT_FROZEN);
  });
});

/** A point's shape is M51's `(parameter_name, parameter_value)` and nothing more. */
describe("the point identity is M51's", () => {
  it("carries the parameter name and value, and no run key", async () => {
    const { runner } = recorder();
    const [point] = await runEpsilonSweep(runner, EMPTY_INPUT, "ASSAY", NO_HARM);
    const shape: SweepPoint | undefined = point;
    expect(shape?.parameter_name).toBe("epsilon_bps");
    expect(shape?.parameter_value).toBe(0);
    expect(Object.keys(shape ?? {}).sort()).toStrictEqual([
      // `balance_harm_paise` is §5.1's y-axis and §5.3's own output column for
      // this sweep — "(coverage_by_value, balance_harm) per point" — not a fifth
      // key dimension. M51's identity is the two `parameter_*` fields, and they
      // are unchanged.
      "abstentions", "balance_harm_paise", "coverage_by_value", "decisions",
      "is_operating_point", "parameter_name", "parameter_value", "solve_outcomes",
    ]);
  });
});
