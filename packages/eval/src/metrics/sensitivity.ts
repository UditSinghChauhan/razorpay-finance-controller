/**
 * The mandatory sensitivity sweeps — `EVALUATION_SPEC.md §5.3`. Metric 26.
 *
 * | Sweep | Range | Why (`§5.3`'s own column) |
 * |---|---|---|
 * | `τ` | ₹10 / ₹100 / ₹1,000 / ₹10,000 | *"Prevents τ from being tuned to inflate coverage; shows the `AMBIGUOUS` → `IMMATERIALLY_AMBIGUOUS` shift"* |
 * | `ε` | 0 → 10_000 bps | *"Generates the risk–coverage curve"* — metric 3, in `metrics/risk-coverage.ts` |
 * | `C_review` **and `C_exception`, moved together** | ₹100 / ₹250 / ₹1,000 | *"Any conclusion that flips must be flagged as unstable"* |
 * | Batch size | 1k / 10k / 100k | Throughput only; *"produces no close-loop metric"* |
 *
 * **Sweeping is not tuning, and the distinction is `PREREGISTRATION.md §7`'s.**
 * `C_review` and `C_exception` *"are assumptions, not measurements"*, which is
 * why `§5.3` makes the sweep mandatory rather than optional. What
 * `DECISION_BRIEF.md §L.4` forbids is *"Changing any frozen threshold or
 * decision parameter listed in `PREREGISTRATION.md §7` on the basis of an
 * observed result"* — reporting the metric at three declared points is the
 * opposite of that, and the frozen value stays in `frozen.ts` as the one every
 * unswept call uses.
 *
 * **The instability flag is `§5.3`'s conclusion rule, not a threshold.** *"Any
 * conclusion that flips within that range must be reported as unstable."* A
 * conclusion here is an ordering between two agents, so {@link orderingIsStable}
 * takes the two agents' figures at each sweep point and reports whether the sign
 * of their difference held. It computes no significance: `§5.2`'s CI-overlap
 * rule is `bootstrap.ts`'s and is the only significance judgement this package
 * makes.
 *
 * **The `τ` sweep moves a floor, not a rate.** `PREREGISTRATION.md §7` freezes
 * `τ = max(₹100, 10 bps of component value)`. `§5.3`'s four rupee figures are
 * points for the **floor**; the 10 bps half is not swept, and nothing here
 * changes it.
 *
 * **`C_review` and `C_exception` move TOGETHER over one shared point set, from
 * spec 1.4.32 (register row `DATA_MODEL.md §22.2` **M51**).** Through spec 1.4.35
 * {@link cReviewSweep} held `C_exception` at its frozen ₹500 while only `C_review`
 * moved, which `DECISION_BRIEF.md §A.39` item (3) names as the defect this module
 * carries. M51 resolves the contradiction the frozen corpus contained — `§5.3`'s
 * row header and `§8`'s metric **name** say `C_review` alone, while `§4.5`
 * (*"`C_review` **and** `C_exception` are assumptions … A sensitivity sweep …
 * is mandatory"*, *"the two move together"*), `PREREGISTRATION.md §8` twice
 * (*"metric 26's cost sweep **scales that term**"*, which a fixed additive
 * constant cannot do) and `DECISION_BRIEF.md §E` item 2 (*"both frozen, **both
 * swept at ₹100 / ₹250 / ₹1,000**"*) say both — and it adopts **both**, as the
 * only reading leaving no clause vacuous. `PREREGISTRATION.md §7` states the point
 * set in those terms: *"`C_review` `{10_000, 25_000, 100_000}` paise …
 * `C_exception` THE SAME THREE POINTS, moved together with `C_review`"*.
 *
 * **No scale factor is introduced and none may be.** M51 rejects *"a scale factor
 * applied to the frozen values, which no clause states and which would be
 * invention"*: both parameters take the **same** three values, which is why
 * {@link sweptCosts} is one function of one number rather than a pair of grids.
 *
 * **`C_exception`'s frozen ₹500 is deliberately OFF the grid**, so **no** point of
 * this sweep is the reported operating point — `§5.3`'s cost row delivers a
 * stability verdict, *"any conclusion that flips"*, and not a curve that must
 * locate the reported run. Only the ε grid carries that obligation and `§5.1`
 * discharges it. {@link CostSensitivityPoint.is_operating_point} therefore derives
 * that fact rather than asserting it, and reads `false` at all three points
 * including `C_review = ₹250`.
 *
 * **The cost sweep re-executes NOTHING.** `§5.3`'s procedure table gives its owner
 * as the `packages/eval` scorer and its re-runs as *"**nothing** — post-hoc over
 * one unit's artifacts"*, against ε and τ which re-execute the agent inside stage
 * `S4`. {@link costSensitivity} takes an `AgentRun` and `§4.4(a)`'s already-measured
 * harm and calls {@link netCost}; it holds no agent, reads no oracle label and
 * recomputes no population.
 */

import {
  C_EXCEPTION_PAISE,
  C_REVIEW_PAISE,
  C_REVIEW_SWEEP_PAISE,
  TAU_SWEEP_FLOOR_PAISE,
} from "../frozen.js";
import type { AgentRun } from "../run.js";
import { netCost, type CostParameters } from "./cost.js";

/** One point of a swept metric. */
export interface SweepPoint<P> {
  readonly parameter: P;
  readonly value: number;
}

/** A swept metric, with the parameter that was varied named. */
export interface Sweep<P> {
  readonly parameter_name: string;
  readonly points: readonly SweepPoint<P>[];
  /** `true` where the points cover exactly the range `§5.3` declares. */
  readonly covers_declared_range: boolean;
}

/**
 * M51's `parameter_name` for `§5.3`'s cost row.
 *
 * **It names both parameters because both move**, which is the fact M51 spends a
 * paragraph establishing and the one a reader of a sweep row most needs: a row
 * labelled `C_review` alone would be read as holding `C_exception` at ₹500, which
 * is the very reading M51 rejects. `PREREGISTRATION.md §8`'s **metric** name
 * `c_review_sensitivity` is frozen and is **not** renamed by this — `§8` records
 * that its rows 5, 6, 21, 22, 25 and 26 each name two or more quantities on one
 * line, so an under-inclusive label there is that section's own form. This is the
 * *parameter*'s name inside one scored unit's artifact, the sibling of
 * `epsilon_bps` and `tau_floor_paise`, and no frozen clause fixes it.
 */
export const COST_SWEEP_PARAMETER_NAME = "c_review_and_c_exception_paise";

/**
 * One point of `§5.3`'s cost row, as **both** parameters at once (M51).
 *
 * **This is the single place "moved together" is decided**, and everything that
 * walks the cost grid goes through it, so the rule cannot hold in one caller and
 * lapse in another. It is a function of **one** number because
 * `PREREGISTRATION.md §7` gives the two parameters *"THE SAME THREE POINTS"* —
 * a second grid, or any factor between them, is the scale factor M51 rejects.
 */
export function sweptCosts(paise: number): CostParameters {
  return Object.freeze({ c_review_paise: paise, c_exception_paise: paise });
}

/**
 * `§5.3`'s cost point set, as the pairs it actually sweeps — `PREREGISTRATION.md
 * §7`, `{₹100, ₹250, ₹1,000}`, in the declared order.
 *
 * Derived from {@link C_REVIEW_SWEEP_PAISE} through {@link sweptCosts} rather
 * than typed out again: `frozen.ts` is where a `§7` figure is transcribed, and a
 * second list here would be the second spelling that file exists to prevent.
 */
export const COST_SWEEP_POINTS: readonly CostParameters[] = Object.freeze(
  C_REVIEW_SWEEP_PAISE.map(sweptCosts),
);

/**
 * `c_review_sensitivity` as a generic sweep — the input {@link orderingIsStable}
 * takes for `§5.3`'s *"any conclusion that flips"* verdict across two agents.
 *
 * **Both parameters move (M51).** Through spec 1.4.35 this passed the frozen
 * `C_exception` at every point, which the module header records as the defect
 * `DECISION_BRIEF.md §A.39` item (3) left; it now passes {@link sweptCosts}, so a
 * `compute` reading `c_exception_paise` sees `§5.3`'s point rather than ₹500.
 *
 * The **artifact** form of the same sweep is {@link costSensitivity}, which
 * reports `§5.3`'s own output — `net_cost_inr` per point — through `netCost`.
 * This one stays open to any metric of the cost pair because the stability
 * verdict is an ordering between two *agents* and is not scoped to metric 2.
 *
 * @param compute a metric as a function of the cost parameters. `netCost` and
 *   `abstentionMetrics` both take them, so a caller sweeps by supplying a
 *   closure rather than by mutating a constant.
 */
export function cReviewSweep(
  compute: (costs: CostParameters) => number,
  points: readonly number[] = C_REVIEW_SWEEP_PAISE,
): Sweep<number> {
  return Object.freeze({
    parameter_name: COST_SWEEP_PARAMETER_NAME,
    points: Object.freeze(
      points.map((c) => Object.freeze({ parameter: c, value: compute(sweptCosts(c)) })),
    ),
    covers_declared_range: sameSet(points, C_REVIEW_SWEEP_PAISE),
  });
}

/**
 * `tau_sensitivity` — metric 26's second half.
 *
 * @param compute a metric as a function of `τ`'s floor in paise. The 10 bps
 *   rate is not a parameter: `§5.3` sweeps the rupee figure and
 *   `PREREGISTRATION.md §7` freezes the rate.
 */
export function tauSweep(
  compute: (tauFloorPaise: number) => number,
  points: readonly number[] = TAU_SWEEP_FLOOR_PAISE,
): Sweep<number> {
  return Object.freeze({
    parameter_name: "tau_floor_paise",
    points: Object.freeze(
      points.map((tau) => Object.freeze({ parameter: tau, value: compute(tau) })),
    ),
    covers_declared_range: sameSet(points, TAU_SWEEP_FLOOR_PAISE),
  });
}

/**
 * `§5.3`'s stability rule: did the conclusion hold across the sweep?
 *
 * *"Any conclusion that flips within that range must be reported as unstable."*
 * The conclusion is the ordering of two agents on one metric, so this reports
 * whether the sign of `a − b` was the same at every swept point. A point where
 * the two are exactly equal is **not** a flip: it is a tie, and calling it one
 * would report instability that no ordering change produced.
 */
export function orderingIsStable<P>(a: Sweep<P>, b: Sweep<P>): boolean {
  const signs = new Set<number>();
  for (let i = 0; i < Math.min(a.points.length, b.points.length); i += 1) {
    const left = a.points[i];
    const right = b.points[i];
    if (left === undefined || right === undefined) continue;
    const difference = left.value - right.value;
    if (difference !== 0) signs.add(Math.sign(difference));
  }
  return signs.size <= 1;
}

/**
 * One evaluated point of `§5.3`'s cost row, in the shape M51 gives a sweep point.
 *
 * The identity is M51's `(RunKey, parameter_name, parameter_value)`; the `RunKey`
 * half is the enclosing `metrics.json`'s and is not repeated on every row — the
 * same treatment `apps/cli`'s ε and τ rows already get.
 *
 * **Both parameters are carried explicitly rather than left to be inferred from
 * one value.** They are equal at every point by {@link sweptCosts}, and a reader
 * who has to know that to interpret the row is a reader who can misread it.
 */
export interface CostSensitivityPoint {
  /** {@link COST_SWEEP_PARAMETER_NAME} — both parameters, moved together. */
  readonly parameter_name: string;
  /** The shared point, in paise: `10_000`, `25_000` or `100_000`. */
  readonly parameter_value: number;
  /** `C_review` at this point, in paise. */
  readonly c_review_paise: number;
  /** `C_exception` at this point, in paise — the same figure, never scaled. */
  readonly c_exception_paise: number;
  /**
   * `false` at every frozen point, and **derived rather than asserted**.
   *
   * `PREREGISTRATION.md §7` puts `C_exception`'s frozen ₹500 deliberately off the
   * grid, so the `C_review = ₹250` point pairs it with ₹250 and is **not** the
   * reported run. M51: *"the cost row delivers `§5.3`'s stability verdict, not a
   * curve locating a run"*. Deriving it keeps the field honest if a caller sweeps
   * a point set of its own.
   */
  readonly is_operating_point: boolean;
  /** `§5.3`'s output for this row: metric 2 `net_cost_inr`, in paise. */
  readonly net_cost_paise: number;
  /**
   * `§4.5`'s `EXPLORATORY` companion at this point, in paise.
   *
   * `§4.5` requires it *"beside the authoritative figure"* on every report and
   * says of **this** sweep that *"metric 26's cost sweep scales this term with
   * `C_exception`, so the two move together and the sweep is read accordingly"* —
   * so the term a reader is told to discount moves from row to row, and carrying
   * it here is what lets the sweep be read as `§4.5` directs. It is `netCost`'s
   * own figure at this point, never a second subtraction.
   */
  readonly net_cost_paise_excluding_e13: number;
}

/** `c_review_sensitivity` for one scored unit — metric 26's cost half. */
export interface CostSensitivity {
  /** `§5.3`'s three points, in `PREREGISTRATION.md §7`'s declared order. */
  readonly points: readonly CostSensitivityPoint[];
  /** `true` where the points are exactly the frozen `{₹100, ₹250, ₹1,000}`. */
  readonly covers_declared_range: boolean;
}

/**
 * `c_review_sensitivity` — metric 26's cost half, post-hoc over one scored unit.
 *
 * **Nothing is re-executed and nothing is re-derived.** `§5.3`'s procedure table
 * gives this sweep's owner as the `packages/eval` scorer and its re-runs as
 * *"**nothing** — post-hoc over one unit's artifacts"*. The two inputs are the
 * unit's own: the `AgentRun` metric 2 already scored, and `§4.4(a)`'s
 * `balance_harm_paise` as `harm()` measured it. No agent runs, no oracle label is
 * read, no covered set is rebuilt.
 *
 * **`netCost` is called and `§4.5` is not re-implemented.** Each point is one
 * `netCost(run, balanceHarmPaise, sweptCosts(c))` call, so the three swept figures
 * and the operating-point figure come from the same formula in the same module —
 * `metrics/cost.ts`, which `PREREGISTRATION.md §8` names for metric 2. Deriving a
 * swept cost from metric 2's counts arithmetically would be a second definition of
 * `§4.5`, and there is exactly one.
 *
 * **Order is the frozen grid's**, walked directly, so two runs over the same
 * inputs produce byte-identical rows.
 *
 * @param run the scored unit's own run — read for `|abstained|`,
 *   `|open_exceptions|` and the `E13` count, all by `netCost`.
 * @param balanceHarmPaise `§4.4(a)`'s figure for this unit, **passed in** for the
 *   reason `netCost` states of it: *"so that the two metrics cannot disagree about
 *   which set they scored"*. It does not move with the cost parameters.
 * @param points `§5.3`'s point set. Defaulted to the frozen one; an override
 *   exists so a caller can be shown to be off the declared range rather than
 *   silently at it.
 */
export function costSensitivity(
  run: AgentRun,
  balanceHarmPaise: number,
  points: readonly number[] = C_REVIEW_SWEEP_PAISE,
): CostSensitivity {
  return Object.freeze({
    points: Object.freeze(
      points.map((c) => {
        const costs = sweptCosts(c);
        const report = netCost(run, balanceHarmPaise, costs);
        return Object.freeze({
          parameter_name: COST_SWEEP_PARAMETER_NAME,
          parameter_value: c,
          c_review_paise: costs.c_review_paise,
          c_exception_paise: costs.c_exception_paise,
          is_operating_point:
            costs.c_review_paise === C_REVIEW_PAISE &&
            costs.c_exception_paise === C_EXCEPTION_PAISE,
          net_cost_paise: report.net_cost_paise,
          net_cost_paise_excluding_e13: report.net_cost_paise_excluding_e13,
        });
      }),
    ),
    covers_declared_range: sameSet(points, C_REVIEW_SWEEP_PAISE),
  });
}

const sameSet = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
