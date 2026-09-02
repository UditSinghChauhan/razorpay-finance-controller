import type { RobustnessReport, RunKey } from "@assay/eval";

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
 * `PREREGISTRATION.md §10` **V30**'s disclosure, carried in the artifact.
 *
 * V30 requires that no additivity be claimed or implied between M55's per-case
 * `case_balance_harm` and `§4.4`'s run-level `balance_harm_inr`. Metric 15
 * reports a **count** of injected cases whose per-case harm is positive, and a
 * reader who took that count for a decomposition of the run-level figure would
 * be making exactly the inference V30 forbids — so the disclosure travels with
 * the number rather than being left to a report that may not carry it.
 */
export const V30_NON_ADDITIVITY =
  "PREREGISTRATION.md §10 V30: injected_cases_with_harm counts injected cases whose M55 " +
  "case_balance_harm is positive. case_balance_harm is a ratified decomposition and NOT a " +
  "partition of EVALUATION_SPEC.md §4.4's balance_harm_inr: §4.4(a) places the absolute " +
  "value outside the per-account difference and takes it over the whole covered set at once, " +
  "so |a1+a2 - t1-t2| != |a1-t1| + |a2-t2| and the per-case figures do not sum to the " +
  "run-level metric. No additivity between them is claimed or implied.";

/**
 * Metrics 15 and 16 for one scored unit — `EVALUATION_SPEC.md §4.8`, over M52's
 * two populations, as `packages/eval`'s `robustness()` reports them.
 *
 * **Not exercised is a state, not a zero.** M52 scopes both metrics to the
 * **TEST** split and states that elsewhere *"the injected set is **empty**, so
 * metrics 15 and 16 are undefined rather than zero and are reported **'not
 * exercised on DEV'**"*. `§5.5` forbids reporting a number that does not exist
 * in a committed run artifact, and a `0.0` standing in for an unexercised metric
 * is exactly that number — so {@link exercised} carries M52's own determination,
 * {@link not_exercised} carries the reason in words, and every rate inside
 * {@link report} is already `null` rather than `0` on an empty population.
 */
export interface RobustnessMetrics {
  /** M52's determination, carried rather than re-derived from a set size. */
  readonly exercised: boolean;
  /** Why the metrics were not taken, or `null` where they were. */
  readonly not_exercised: string | null;
  /**
   * `robustness()`'s report — metrics 15 and 16, their populations, and
   * `PREREGISTRATION.md §10` **V27**'s kind composition of each population.
   *
   * `null` where the scorer took no measurement at all, so that an absent
   * measurement and an empty population are distinguishable in the artifact:
   * on a non-TEST split there is no injected set to count, while on a TEST seed
   * carrying no `F10` degradation the counts are real and the rates are `null`.
   *
   * V27's `injected_by_kind` / `control_by_kind` ride inside it and are
   * **diagnostics, not performance metrics**: they record that M52's control is
   * matched on *"dataset co-membership and `Observation.kind` only"*, so a
   * reader can never be handed metric 16's difference without the two mixes that
   * produced it.
   */
  readonly report: RobustnessReport | null;
  /** {@link V30_NON_ADDITIVITY}, on every scored unit. */
  readonly non_additivity_disclosure: string;
}

/**
 * The metrics one scored unit produces at the frozen thresholds.
 *
 * **Still partial, and the partiality is still recorded rather than hidden.**
 * `PREREGISTRATION.md §8`'s list runs to 28. Most of what this carries is what a
 * scored unit's own `AgentRun` determines; {@link robustness} is the first
 * truth-side entry, wired at spec 1.4.33's M52 + M55 semantics. The remaining
 * truth-side metrics — `§4.4`'s harm and through it metrics 2, 3 and 8 — need
 * the rest of `scoringTruth` and `§5.2`'s aggregator, and a field that would
 * need them is **absent** rather than present and zero, because `§5.5` traces
 * every reported number to a committed artifact and a zero standing in for an
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
  /** Metrics 15 and 16 (`§4.8`), or M52's *"not exercised"*. */
  readonly robustness: RobustnessMetrics;
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
