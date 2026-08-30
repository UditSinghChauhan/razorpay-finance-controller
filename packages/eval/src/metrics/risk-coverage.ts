/**
 * The risk–coverage curve and `AURC` — `EVALUATION_SPEC.md §5.1`. Metric 3.
 *
 * > *"Sweep the abstention aggressiveness (vary ε from 0 to 10_000 bps with τ
 * > fixed). At each point plot **coverage by value** on x and **balance harm in
 * > ₹** on y. One line per agent. `B0`, `B1`, `B2` and `A2` are single points
 * > (they do not abstain, or abstain trivially); ASSAY and `A1` are curves."*
 * >
 * > *"**AURC** (area under the risk–coverage curve, ₹-denominated) is the scalar
 * > summary. Lower is better."*
 *
 * **Why the curve slopes the way it does, and why that had to be fixed
 * elsewhere.** `§4.4` records that benchmark v1.0.0 and v1.0.1 summed harm over
 * the whole run, under which *"harm **rose** with abstention, the curve sloped
 * upward, `aurc_inr` measured the inverse of its stated meaning"*. This module
 * integrates whatever it is given; the correction lives in `metrics/harm.ts`,
 * which computes harm over the covered set. A note here rather than a guard,
 * because a guard would reject a legitimately non-monotonic curve.
 *
 * **This module runs no sweep.** Each point is one scored run at one ε, and a
 * run is an agent's product. `packages/eval` holds no agent
 * (`ARCHITECTURE.md §10`), so it integrates points the caller produced.
 */

import { EPSILON_SWEEP_BPS } from "../frozen.js";

/** One point of the curve: one scored run at one ε. */
export interface RiskCoveragePoint {
  /** The ε in force, in integer basis points (`PREREGISTRATION.md §7`). */
  readonly epsilon_bps: number;
  /** x — metric 1, `coverage_by_value`, in `0..1`. */
  readonly coverage_by_value: number;
  /** y — metric 6(a), `balance_harm`, in paise. */
  readonly balance_harm_paise: number;
}

/** Metric 3, with the curve it integrates. */
export interface RiskCoverageReport {
  /** `AURC`, in paise. Lower is better. */
  readonly aurc_paise: number;
  /** The points, ascending by coverage — the order the figure is drawn in. */
  readonly curve: readonly RiskCoveragePoint[];
  /**
   * `true` where the sweep spans `§5.1`'s declared range.
   *
   * *"vary ε from 0 to 10_000 bps"*. Reported rather than enforced: a partial
   * sweep is a legitimate diagnostic, but `AURC` computed over one is not
   * comparable with one computed over the full range, and a reader is entitled
   * to know which they are holding.
   */
  readonly spans_declared_sweep: boolean;
  /** `true` for an agent that produced a single point (`B0`, `B1`, `B2`, `A2`). */
  readonly is_single_point: boolean;
}

/**
 * Integrate the risk–coverage curve.
 *
 * The trapezoid rule over points sorted by coverage. `§5.1` names the axes and
 * calls `AURC` *"the area under the risk–coverage curve"* without fixing a
 * quadrature; the trapezoid rule is the reading that makes the area a function
 * of the points alone, adds no smoothing the data does not support, and is exact
 * on the piecewise-linear curve the figure actually draws.
 *
 * **A single point has zero area, and that is not a zero score.** `§5.1` says
 * `B0`, `B1`, `B2` and `A2` *"are single points"*, so their `AURC` is not
 * comparable with a curve's; {@link RiskCoverageReport.is_single_point} says so
 * on the record rather than leaving a `0` to be read as best-in-field.
 *
 * Points sharing a coverage value contribute no width, so a sweep that saturates
 * adds nothing — which is the correct reading of a gate that stopped moving.
 */
export function riskCoverage(points: readonly RiskCoveragePoint[]): RiskCoverageReport {
  const curve = [...points].sort((a, b) =>
    a.coverage_by_value === b.coverage_by_value
      ? a.epsilon_bps - b.epsilon_bps
      : a.coverage_by_value - b.coverage_by_value,
  );

  let area = 0;
  for (let i = 1; i < curve.length; i += 1) {
    const left = curve[i - 1];
    const right = curve[i];
    if (left === undefined || right === undefined) continue;
    const width = right.coverage_by_value - left.coverage_by_value;
    area += (width * (left.balance_harm_paise + right.balance_harm_paise)) / 2;
  }

  const epsilons = curve.map((p) => p.epsilon_bps);
  return Object.freeze({
    aurc_paise: area,
    curve: Object.freeze(curve),
    spans_declared_sweep:
      epsilons.includes(EPSILON_SWEEP_BPS.min) && epsilons.includes(EPSILON_SWEEP_BPS.max),
    is_single_point: curve.length <= 1,
  });
}
