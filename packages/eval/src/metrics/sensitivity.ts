/**
 * The mandatory sensitivity sweeps — `EVALUATION_SPEC.md §5.3`. Metric 26.
 *
 * | Sweep | Range | Why (`§5.3`'s own column) |
 * |---|---|---|
 * | `τ` | ₹10 / ₹100 / ₹1,000 / ₹10,000 | *"Prevents τ from being tuned to inflate coverage; shows the `AMBIGUOUS` → `IMMATERIALLY_AMBIGUOUS` shift"* |
 * | `ε` | 0 → 10_000 bps | *"Generates the risk–coverage curve"* — metric 3, in `metrics/risk-coverage.ts` |
 * | `C_review` | ₹100 / ₹250 / ₹1,000 | *"Any conclusion that flips must be flagged as unstable"* |
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
 */

import { C_EXCEPTION_PAISE, C_REVIEW_SWEEP_PAISE, TAU_SWEEP_FLOOR_PAISE } from "../frozen.js";
import type { CostParameters } from "./cost.js";

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
 * `c_review_sensitivity` — metric 26's first half.
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
    parameter_name: "C_review",
    points: Object.freeze(
      points.map((c) =>
        Object.freeze({
          parameter: c,
          value: compute({ c_review_paise: c, c_exception_paise: C_EXCEPTION_PAISE }),
        }),
      ),
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

const sameSet = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
