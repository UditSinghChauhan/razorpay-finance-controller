import type { RunKey } from "@assay/eval";

import type { AgentSweeps } from "../bench/sweep.js";

/**
 * `metrics.json`'s shape — `EVALUATION_SPEC.md §7` (M48) and its M51 sweeps.
 *
 * **One artifact per scored unit, at the path M48 already fixed**, which
 * `metrics-path.ts` builds:
 *
 * ```
 *   runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
 * ```
 *
 * **The sweeps nest inside it; they do not add a path segment or a key
 * dimension.** M51: a sweep point is *"an evaluation inside one scored unit,
 * never a fifth key dimension"*, identified `(RunKey, parameter_name,
 * parameter_value)`. The `RunKey` half is {@link ScoredMetrics.key} and is
 * written once; the other two are each point's own fields.
 *
 * **The ordinary metrics are not replaced by the sweep.** `EVALUATION_SPEC.md
 * §5.2`'s table and `§5.4` item 5 report figures at `PREREGISTRATION.md §7`'s
 * frozen `ε` and `τ`, and {@link ScoredMetrics.base} carries them. The ε point
 * at `1500` and the τ point at `10_000` are the *same execution's* figures
 * appearing on their curves, which is why each carries `is_operating_point`.
 *
 * **This shape is a convention, recorded as one** — the treatment
 * `metrics-path.ts` gives the path itself and `replay-cache.ts` gives the cache
 * layout. No frozen document states a field list for `metrics.json`; what M51
 * fixes is the point *identity*, and that is what the sweep rows carry. A later
 * amendment naming a different shape supersedes this file rather than
 * contradicting a rule nobody wrote.
 */

/**
 * The metrics one scored unit produces at the frozen thresholds.
 *
 * **Deliberately partial, and the partiality is recorded rather than hidden.**
 * `PREREGISTRATION.md §8`'s list runs to 28 and this carries the ones a scored
 * unit's own `AgentRun` determines without ground truth. The truth-side metrics
 * — `§4.4`'s harm and through it metrics 2, 3 and 8 — need `scoringTruth`, which
 * is M51 item (2)'s successor work and not this task's; a field that would need
 * them is **absent** rather than present and zero, because `§5.5` traces every
 * reported number to a committed artifact and a zero standing in for an
 * uncomputed metric is exactly the number it forbids.
 */
export interface BaseMetrics {
  /** Metric 1. */
  readonly coverage_by_value: number;
  /** Metric 9. */
  readonly coverage_by_count: number;
  /** Metric 27. */
  readonly coverage_by_value_bank: number;
  /** Metric 28 — `0.0` by construction (`§4.1`). */
  readonly coverage_by_value_ledger: number;
  /** `EXPLORATORY` per `§8`, printed beside metric 1 (`§4.1`'s audit line). */
  readonly coverage_by_value_all_observations: number;
  readonly batch_value_paise: number;
  readonly abstentions: number;
  readonly decisions: number;
  readonly open_exceptions: number;
  /** `§4.13`'s required provenance, beside metrics 4 and 8. */
  readonly probes_spent: number;
  readonly abstentions_resolved_by_probe: number;
}

/** One scored unit's artifact. */
export interface ScoredMetrics {
  /** M48's `(agent_id, split, seed, llm_mode)`, written once. */
  readonly key: RunKey;
  /**
   * Figures at `PREREGISTRATION.md §7`'s frozen thresholds — the authoritative
   * ordinary result.
   *
   * The thresholds themselves are **not** echoed here. `boundary.test.ts` keeps
   * every frozen value out of `apps/cli` except where a spec clause forces it,
   * and nothing forces it here: the ε point carrying `is_operating_point` marks
   * the frozen ε on the curve, and `§7` is the one place either value is read.
   */
  readonly base: BaseMetrics;
  /**
   * `§5.1`'s and `§5.3`'s curves, empty for an agent `§5.1` draws as a single
   * point (`B0`, `A2`, `A3`).
   */
  readonly sweeps: AgentSweeps;
}

/** `metrics.json`'s bytes: two-space JSON with a trailing newline, as `gate.ts` writes. */
export function encodeMetrics(metrics: ScoredMetrics): string {
  return `${JSON.stringify(metrics, null, 2)}\n`;
}
