import {
  EPSILON_BPS,
  EPSILON_SWEEP_BPS,
  TAU_SWEEP_FLOOR_PAISE,
  coverage,
  type AgentId,
  type AgentInput,
  type AgentRun,
} from "@assay/eval";

import type { SweepParameters, SweptRunner } from "../agents/sweep-runner.js";
import type { SolveOutcomeTally } from "../agents/assay.js";
import { CliError, EXIT } from "../errors.js";

/**
 * `EVALUATION_SPEC.md §5.1`'s ε sweep and `§5.3`'s τ sweep — spec 1.4.32,
 * register row `DATA_MODEL.md §22.2` **M51**, implementation item (2).
 *
 * **What this module is, and what it deliberately is not.** It holds the two
 * frozen grids, the order they are walked in, and the loop that executes one
 * scored unit at each point. It holds **no threshold logic**: `packages/engine`
 * decides `Δs >= ε` and `materiality <= τ` and resolves an omitted parameter to
 * `PREREGISTRATION.md §7`'s frozen value (M51 item (1)), so a sweep point here
 * is an *argument*, never a second implementation of `§6`'s table.
 *
 * **A sweep point is not a run.** M51: a point is *"an evaluation inside one
 * scored unit, never a fifth key dimension"*. Every point below carries the same
 * `RunKey` as its base execution, and the points land inside that unit's
 * own `metrics.json` under `(parameter_name, parameter_value)`. `RunConfig`,
 * `RunKey` and `AgentInput` gain nothing.
 */

// ---------------------------------------------------------------------------
// The two frozen grids
// ---------------------------------------------------------------------------

/**
 * `§5.1`'s ε grid step, in basis points — `PREREGISTRATION.md §7` (M51).
 *
 * `§7` derives it rather than choosing it: a uniform step must divide `10_000`
 * to reach `§5.1`'s declared endpoint and must divide `1500` so the frozen
 * operating point lies on the curve, so it divides `gcd(10_000, 1500) = 500`,
 * and `500` is the coarsest such step.
 */
export const EPSILON_SWEEP_STEP_BPS = 500;

/**
 * `§5.1`'s 21-point ε grid: `{0, 500, 1000, …, 10_000}` bps.
 *
 * **Constructed from the frozen endpoints and the frozen step**, never typed out
 * as a literal list: `EPSILON_SWEEP_BPS` is `packages/eval`'s transcription of
 * *"vary ε from 0 to 10_000 bps"*, and a hand-written list would be a second
 * place the grid is decided. Ascending by construction, which is the order
 * `§5.1`'s curve is drawn in and the order {@link runEpsilonSweep} walks.
 */
export const EPSILON_GRID_BPS: readonly number[] = Object.freeze(
  Array.from(
    { length: (EPSILON_SWEEP_BPS.max - EPSILON_SWEEP_BPS.min) / EPSILON_SWEEP_STEP_BPS + 1 },
    (_unused, i) => EPSILON_SWEEP_BPS.min + i * EPSILON_SWEEP_STEP_BPS,
  ),
);

/**
 * `§5.3`'s four τ **floors**, in `§5.3`'s own order — ₹10 / ₹100 / ₹1,000 / ₹10,000.
 *
 * Re-exported from `packages/eval`'s frozen transcription rather than restated.
 * Only the floor is swept; `τ`'s 10 bps rate is `packages/engine`'s and does not
 * move (spec 1.4.6).
 */
export const TAU_FLOOR_GRID_PAISE: readonly number[] = TAU_SWEEP_FLOOR_PAISE;

/**
 * The frozen operating point every ordinary execution runs at.
 *
 * On the grid by construction — `§7`'s derivation exists to put it there — and
 * {@link assertGridIsFrozen} refuses to run a sweep that lost it.
 */
export const EPSILON_OPERATING_POINT_BPS = EPSILON_BPS;

/**
 * Refuse a grid that does not match `§7`, before any execution is spent.
 *
 * Fail-closed rather than best-effort: a sweep silently missing its operating
 * point would publish a curve on which the reported run cannot be located, which
 * is the defect `§7`'s derivation exists to prevent.
 */
export function assertGridIsFrozen(): void {
  const expected = (EPSILON_SWEEP_BPS.max - EPSILON_SWEEP_BPS.min) / EPSILON_SWEEP_STEP_BPS + 1;
  if (EPSILON_GRID_BPS.length !== expected) {
    throw new CliError(
      `bench: the ε grid holds ${String(EPSILON_GRID_BPS.length)} points, not ` +
        `${String(expected)}. PREREGISTRATION.md §7 freezes it at 21.`,
      EXIT.FAILURE,
    );
  }
  if (!EPSILON_GRID_BPS.includes(EPSILON_OPERATING_POINT_BPS)) {
    throw new CliError(
      `bench: the ε grid does not contain the frozen operating point ` +
        `${String(EPSILON_OPERATING_POINT_BPS)} bps. EVALUATION_SPEC.md §5.2 and §5.4 item 5 ` +
        `report the curve's own two axes at that ε, so a grid without it publishes a primary ` +
        `figure the reported run cannot be located on.`,
      EXIT.FAILURE,
    );
  }
}

// ---------------------------------------------------------------------------
// Point records — M51's (parameter_name, parameter_value) identity
// ---------------------------------------------------------------------------

/** The two parameters M51 sweeps inside a scored unit. */
export type SweptParameterName = "epsilon_bps" | "tau_floor_paise";

/**
 * One evaluated sweep point.
 *
 * The identity is M51's `(RunKey, parameter_name, parameter_value)`; the
 * `RunKey` half is the enclosing artifact's and is not repeated on every row.
 */
export interface SweepPoint {
  readonly parameter_name: SweptParameterName;
  readonly parameter_value: number;
  /** `true` for the point at `PREREGISTRATION.md §7`'s frozen value. */
  readonly is_operating_point: boolean;
  /** Metric 1 at this point — `§5.1`'s x-axis. */
  readonly coverage_by_value: number;
  /** `§5.3`'s two counts, and the rest of `§6`'s table beside them. */
  readonly solve_outcomes: SolveOutcomeTally;
  readonly abstentions: number;
  readonly decisions: number;
}

/**
 * One ε point — a {@link SweepPoint} plus `§5.1`'s **y-axis**.
 *
 * `§5.3`'s procedure table gives this sweep's output as *"`(coverage_by_value,
 * balance_harm)` per point → metric 3 `aurc_inr`"*, and `§5.1` names the same two
 * as the figure's axes. The x has always been here; {@link balance_harm_paise} is
 * the y, and it is the **only** truth-dependent quantity either sweep reports.
 *
 * **It is not added to the τ points, and that is `§5.3`'s own scoping.** The τ
 * row's output column reads *"`coverage_by_value`, `count(AMBIGUOUS)`,
 * `count(IMMATERIALLY_AMBIGUOUS)` per point → metric 26 `tau_sensitivity`"* —
 * three quantities, *"that statement, and only that statement"*, and all three
 * engine-side. A harm figure on a τ point would be a fourth output of a frozen
 * sweep. {@link SweepPoint} therefore keeps exactly the fields it had, and the ε
 * curve extends it.
 */
export interface EpsilonSweepPoint extends SweepPoint {
  /**
   * Metric 6(a) at this ε, in paise — `§5.1`'s risk axis.
   *
   * `null` where the scored unit was given no answer key, so `§4.4`'s harm has no
   * value at any point on the curve. Never `0` in that case: `metrics/harm.ts`'s
   * zero is the *best* score, and `EVALUATION_SPEC.md §5.5` bars a number that
   * does not exist in a committed run artifact.
   */
  readonly balance_harm_paise: number | null;
}

/** One agent's swept curves inside one scored unit. */
export interface AgentSweeps {
  readonly epsilon: readonly EpsilonSweepPoint[];
  readonly tau: readonly SweepPoint[];
}

/** An agent that `§5.1` draws as a single point contributes no curve. */
export const NO_SWEEPS: AgentSweeps = Object.freeze({
  epsilon: Object.freeze([] as readonly EpsilonSweepPoint[]),
  tau: Object.freeze([] as readonly SweepPoint[]),
});

/**
 * `§5.1`'s risk axis, as this module receives it.
 *
 * A callback rather than a `GroundTruth`: `§4.4`'s harm is `packages/eval`'s and
 * the read is `artifacts/ground-truth.ts`'s, so this module — which holds the
 * grids and the walk — never sees an answer key, never opens a path and never
 * decides what harm means. `commands/bench.ts` closes over `bench/scorer.ts`'s
 * {@link balanceHarmOf} and passes the result of one `harm()` call per point.
 */
export type RiskAxis = (run: AgentRun) => number | null;

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute one point and project it onto {@link SweepPoint}.
 *
 * Every failure is surfaced: a point that threw is **not** skipped, because a
 * curve silently missing a point is a curve whose area is wrong and whose
 * `AURC` is not comparable with any other.
 */
async function evaluatePoint(
  runner: SweptRunner,
  input: AgentInput,
  agentId: AgentId,
  parameter_name: SweptParameterName,
  parameter_value: number,
  sweep: SweepParameters,
  operating: number,
  riskAxis: RiskAxis,
): Promise<EpsilonSweepPoint> {
  let composed;
  try {
    composed = await runner(input, sweep);
  } catch (cause) {
    throw new CliError(
      `bench: ${agentId} failed at ${parameter_name}=${String(parameter_value)}. A sweep point ` +
        `is not dropped on failure -- EVALUATION_SPEC.md §5.1 integrates the curve it is given, ` +
        `so a missing point silently changes metric 3. Cause: ${String(cause)}`,
      EXIT.FAILURE,
    );
  }
  const { run } = composed;
  if (run.agent_id !== agentId) {
    throw new CliError(
      `bench: a sweep point for ${agentId} came back labelled ${run.agent_id}. A point that ` +
        `cannot be associated with its RunKey is refused rather than filed (M51).`,
      EXIT.FAILURE,
    );
  }
  return Object.freeze({
    parameter_name,
    parameter_value,
    is_operating_point: parameter_value === operating,
    coverage_by_value: coverage(run).coverage_by_value.ratio,
    // §5.1's y. One `harm()` call per point, through the caller's closure; this
    // module reads no journal and differences no account.
    balance_harm_paise: riskAxis(run),
    solve_outcomes: composed.solve_outcomes,
    abstentions: run.abstentions.length,
    decisions: run.decisions.length,
  });
}

/**
 * `§5.1`'s ε sweep: 21 points, ascending, for one curve agent.
 *
 * **Ascending is the frozen order and is not derived from iteration over an
 * unordered collection** — `DATA_MODEL.md §16` forbids that, and `§5.1` draws
 * the curve in coverage order after the fact. Each point re-executes the agent,
 * which is what M51 requires: `RECONCILIATION_SPEC.md §6` step 3 reads ε inside
 * stage `S4`, so no re-scoring can substitute for it.
 */
export async function runEpsilonSweep(
  runner: SweptRunner,
  input: AgentInput,
  agentId: AgentId,
  riskAxis: RiskAxis,
): Promise<readonly EpsilonSweepPoint[]> {
  assertGridIsFrozen();
  const points: EpsilonSweepPoint[] = [];
  for (const epsilonBps of EPSILON_GRID_BPS) {
    points.push(
      await evaluatePoint(
        runner, input, agentId, "epsilon_bps", epsilonBps,
        { epsilonBps }, EPSILON_OPERATING_POINT_BPS, riskAxis,
      ),
    );
  }
  assertComplete(points, EPSILON_GRID_BPS, "epsilon_bps", agentId);
  return Object.freeze(points);
}

/**
 * `§5.3`'s τ sweep: the four declared floors, in `§5.3`'s order.
 *
 * **The Ambiguity Oracle is not consulted and `oracle_labels.jsonl` is never
 * regenerated** (M51). `§5.3` fixes what this sweep reports —
 * `coverage_by_value`, `count(AMBIGUOUS)`, `count(IMMATERIALLY_AMBIGUOUS)` — and
 * all three are engine-side, read off the agent's decisions and `S4`'s outcome.
 * τ reaches the oracle only through `PREREGISTRATION.md §5.4`'s ambiguity
 * definition, which feeds metric 4, and metric 4 is not swept. This module
 * imports no oracle and has nothing to call.
 */
export async function runTauSweep(
  runner: SweptRunner,
  input: AgentInput,
  agentId: AgentId,
): Promise<readonly SweepPoint[]> {
  const points: SweepPoint[] = [];
  for (const tauFloorPaise of TAU_FLOOR_GRID_PAISE) {
    points.push(
      // No risk axis: §5.3 fixes this sweep's three outputs and harm is not one
      // of them. The `null` never reaches an artifact -- `stripRiskAxis` returns
      // the τ point to exactly the fields SweepPoint declares.
      stripRiskAxis(
        await evaluatePoint(
          runner, input, agentId, "tau_floor_paise", tauFloorPaise,
          { tauFloorPaise }, -1, () => null,
        ),
      ),
    );
  }
  assertComplete(points, TAU_FLOOR_GRID_PAISE, "tau_floor_paise", agentId);
  return Object.freeze(points);
}

/** A τ point, with `§5.1`'s y-axis removed rather than carried as a `null`. */
function stripRiskAxis(point: EpsilonSweepPoint): SweepPoint {
  return Object.freeze({
    parameter_name: point.parameter_name,
    parameter_value: point.parameter_value,
    is_operating_point: point.is_operating_point,
    coverage_by_value: point.coverage_by_value,
    solve_outcomes: point.solve_outcomes,
    abstentions: point.abstentions,
    decisions: point.decisions,
  });
}

/** Both curves for one `§5.1` curve agent. */
export async function runSweeps(
  runner: SweptRunner,
  input: AgentInput,
  agentId: AgentId,
  riskAxis: RiskAxis,
): Promise<AgentSweeps> {
  return Object.freeze({
    epsilon: await runEpsilonSweep(runner, input, agentId, riskAxis),
    tau: await runTauSweep(runner, input, agentId),
  });
}

/**
 * Refuse a curve that lost a declared point, in the declared order.
 *
 * The order is asserted rather than sorted: a sweep that produced its points out
 * of order produced them from something other than the frozen grid, and
 * re-sorting would hide that.
 */
function assertComplete(
  points: readonly SweepPoint[],
  grid: readonly number[],
  parameter_name: SweptParameterName,
  agentId: AgentId,
): void {
  const got = points.map((p) => p.parameter_value);
  const same = got.length === grid.length && got.every((v, i) => v === grid[i]);
  if (!same) {
    throw new CliError(
      `bench: ${agentId}'s ${parameter_name} sweep produced [${got.join(", ")}], not the frozen ` +
        `[${grid.join(", ")}]. A sweep is refused rather than published incomplete or reordered.`,
      EXIT.FAILURE,
    );
  }
}
