/**
 * `PREREGISTRATION.md §8`'s frozen metric list, as data.
 *
 * `§8`: "Metrics not on this list may be computed and reported, but must be
 * labelled **`EXPLORATORY`**. Only the metrics below may be used to support a
 * claim about ASSAY's performance." `DECISION_BRIEF.md §L.4` makes the same
 * rule a prohibition — "Reporting a metric not in `PREREGISTRATION.md §8`
 * without labelling it `EXPLORATORY`" — and `EVALUATION_SPEC.md §5.4` item 5
 * requires the report to carry "every metric in the frozen list — **including
 * the ones where ASSAY does poorly**".
 *
 * Three obligations follow, and a prose list satisfies none of them:
 *
 *   1. A report must be checkable for **completeness** against the list.
 *   2. A quantity must be checkable for **membership**, so that anything else
 *      carries the `EXPLORATORY` label rather than a claim.
 *   3. The numbering is load-bearing. `§8`: "Metrics 27 and 28 are
 *      **appended, never renumbered**. Every metric number 1–26 keeps the
 *      meaning it had in benchmark v1.0.0, so every cross-reference elsewhere
 *      in this specification remains valid."
 *
 * This module is therefore the list itself, not a summary of it. It states no
 * formula: the definitions are `EVALUATION_SPEC.md §4`'s and the computations
 * are `metrics/`'s.
 *
 * **The `EXPLORATORY` companions are here too**, in their own table, because
 * every one of them is *required* to be printed beside a frozen figure
 * (`§4.1`'s audit line, `§4.5`'s `net_cost_inr_excluding_e13`, `§4.9`'s
 * `unresolved_value_inr_multiview` and `period_status_legacy_policy`). A
 * required companion that no module names is a companion that gets dropped.
 */

/** `§8`'s four groupings, plus the coverage views appended at benchmark v1.0.1. */
export type MetricGroup =
  | "PRIMARY"
  | "SECONDARY"
  | "CLOSE_LOOP"
  | "ROBUSTNESS"
  | "OPERATIONAL"
  | "COVERAGE_VIEWS";

/** One row of `§8`'s list. */
export interface FrozenMetric {
  /** `§8`'s own number. Stable: 1–26 keep their v1.0.0 meaning, 27–28 are appended. */
  readonly number: number;
  /** The name `§8` gives it, verbatim. */
  readonly name: string;
  readonly group: MetricGroup;
  /** The `EVALUATION_SPEC.md §4` subsection that defines it. */
  readonly definedIn: string;
  /**
   * Whether this package computes the metric today, and what blocks it if not.
   *
   * `null` means computed here. A string names the dependency that does not
   * exist yet — `DECISION_BRIEF.md §L.2` places `api`, `web` and the sealed run
   * after `eval`, and `ledger` Layer B's close gate is unwritten. Recording the
   * blocker as data keeps `README.md` and the code from drifting apart, and
   * stops a missing number from being mistaken for a zero.
   */
  readonly blockedBy: string | null;
  /**
   * The module in `src/` that computes it, or `null` where `blockedBy` says why
   * nothing does.
   *
   * A path rather than a prose claim, so `tests/discipline.test.ts` can check
   * that every metric declared computable names a module that exists. A list
   * that says "computed" and points at nothing is how a report comes to carry a
   * metric no code produces.
   */
  readonly computedBy: string | null;
}

/**
 * The list, in `§8`'s order.
 *
 * `§8` numbers 5, 6, 21, 22, 25 and 26 each name **two or more** quantities on
 * one line. They are one row here, exactly as `§8` writes them, because the
 * numbering is what other documents cross-reference.
 */
export const FROZEN_METRICS: readonly FrozenMetric[] = Object.freeze([
  {
    number: 1,
    name: "coverage_by_value",
    group: "PRIMARY",
    definedIn: "§4.1",
    blockedBy: null,
    computedBy: "metrics/coverage.ts",
  },
  {
    number: 2,
    name: "net_cost_inr",
    group: "PRIMARY",
    definedIn: "§4.5",
    blockedBy: null,
    computedBy: "metrics/cost.ts",
  },
  {
    number: 3,
    name: "aurc_inr",
    group: "PRIMARY",
    definedIn: "§5.1",
    blockedBy: null,
    computedBy: "metrics/risk-coverage.ts",
  },
  {
    number: 4,
    name: "abstention_precision, abstention_recall",
    group: "PRIMARY",
    definedIn: "§4.3",
    blockedBy: null,
    computedBy: "metrics/abstention.ts",
  },
  {
    number: 5,
    name: "match_precision, match_recall, match_f1",
    group: "SECONDARY",
    definedIn: "§4.2",
    blockedBy: null,
    computedBy: "metrics/match.ts",
  },
  {
    number: 6,
    name: "balance_harm_inr, misdirected_value_inr",
    group: "SECONDARY",
    definedIn: "§4.4",
    blockedBy: null,
    computedBy: "metrics/harm.ts",
  },
  {
    number: 7,
    name: "ece",
    group: "SECONDARY",
    definedIn: "§4.6",
    blockedBy: null,
    computedBy: "metrics/calibration.ts",
  },
  {
    number: 8,
    name: "gap_to_oracle",
    group: "SECONDARY",
    definedIn: "§4.13",
    blockedBy: null,
    computedBy: "metrics/cost.ts",
  },
  {
    number: 9,
    name: "coverage_by_count",
    group: "SECONDARY",
    definedIn: "§4.1",
    blockedBy: null,
    computedBy: "metrics/coverage.ts",
  },
  {
    number: 10,
    name: "exception_class_confusion",
    group: "SECONDARY",
    definedIn: "§4",
    blockedBy: "R2 triage output on a run; no run artifact exists",
    computedBy: null,
  },
  {
    number: 11,
    name: "period_status_distribution",
    group: "CLOSE_LOOP",
    definedIn: "§4.9",
    blockedBy: null,
    computedBy: "metrics/close-loop.ts",
  },
  {
    number: 12,
    name: "unresolved_value_inr",
    group: "CLOSE_LOOP",
    definedIn: "§4.9",
    blockedBy: null,
    computedBy: "metrics/close-loop.ts",
  },
  {
    number: 13,
    name: "suspense_identity_exact",
    group: "CLOSE_LOOP",
    definedIn: "§4.9",
    blockedBy: null,
    computedBy: "metrics/close-loop.ts",
  },
  {
    number: 14,
    name: "close_gate_failures",
    group: "CLOSE_LOOP",
    definedIn: "§4.9",
    blockedBy: null,
    computedBy: "metrics/close-loop.ts",
  },
  {
    number: 15,
    name: "injection_financial_success_rate",
    group: "ROBUSTNESS",
    definedIn: "§4.8",
    blockedBy: null,
    computedBy: "metrics/robustness.ts",
  },
  {
    number: 16,
    name: "forced_abstention_rate",
    group: "ROBUSTNESS",
    definedIn: "§4.8",
    blockedBy: null,
    computedBy: "metrics/robustness.ts",
  },
  {
    number: 17,
    name: "abstention_spike_flag",
    group: "ROBUSTNESS",
    definedIn: "§4.10",
    blockedBy: null,
    computedBy: "metrics/abstention.ts",
  },
  {
    number: 18,
    name: "attributable_to_untrusted_text_rate",
    group: "ROBUSTNESS",
    definedIn: "§4.10",
    blockedBy: null,
    computedBy: "metrics/abstention.ts",
  },
  {
    number: 19,
    name: "largest_exception_in_top_n",
    group: "ROBUSTNESS",
    definedIn: "§4.10",
    blockedBy: null,
    computedBy: "metrics/abstention.ts",
  },
  {
    number: 20,
    name: "hallucinated_id_rate, id_rejection_rate",
    group: "ROBUSTNESS",
    definedIn: "§4.8",
    blockedBy: "LLM call telemetry on a run; no run artifact exists",
    computedBy: null,
  },
  {
    number: 21,
    name: "throughput_rps_deterministic, throughput_rps_llm, pct_records_needing_llm",
    group: "OPERATIONAL",
    definedIn: "§4.7",
    blockedBy: "wall-clock instrumentation of a run; apps/cli owns the harness",
    computedBy: null,
  },
  {
    number: 22,
    name: "p50_latency_ms, p95_latency_ms, cost_inr_per_1000_records",
    group: "OPERATIONAL",
    definedIn: "§4.7",
    blockedBy: "wall-clock instrumentation of a run; apps/cli owns the harness",
    computedBy: null,
  },
  {
    number: 23,
    name: "determinism_check",
    group: "OPERATIONAL",
    definedIn: "§4.12",
    blockedBy: "two committed run artifacts to compare root hashes across",
    computedBy: null,
  },
  {
    number: 24,
    name: "offline_parity",
    group: "OPERATIONAL",
    definedIn: "§4.11",
    blockedBy: null,
    computedBy: "bootstrap.ts",
  },
  {
    number: 25,
    name: "component_size_distribution, intractable_rate",
    group: "OPERATIONAL",
    definedIn: "§4",
    blockedBy: null,
    computedBy: "metrics/components.ts",
  },
  {
    number: 26,
    name: "tau_sensitivity, c_review_sensitivity",
    group: "OPERATIONAL",
    definedIn: "§5.3",
    blockedBy: null,
    computedBy: "metrics/sensitivity.ts",
  },
  {
    number: 27,
    name: "coverage_by_value_bank",
    group: "COVERAGE_VIEWS",
    definedIn: "§4.1",
    blockedBy: null,
    computedBy: "metrics/coverage.ts",
  },
  {
    number: 28,
    name: "coverage_by_value_ledger",
    group: "COVERAGE_VIEWS",
    definedIn: "§4.1",
    blockedBy: null,
    computedBy: "metrics/coverage.ts",
  },
]);

/**
 * The `EXPLORATORY` companions the specification **requires** beside a frozen
 * figure.
 *
 * Each is on this list because a section says it is printed on every run and
 * supports no claim. They are not candidates for promotion: `§8` closes the
 * frozen list, and `DECISION_BRIEF.md §L.4` makes promoting one an amendment.
 */
export const REQUIRED_EXPLORATORY: readonly {
  readonly name: string;
  readonly printedBeside: string;
  readonly required_by: string;
}[] = Object.freeze([
  {
    name: "coverage_by_value_all_observations",
    printedBeside: "coverage_by_value (metric 1)",
    required_by: "EVALUATION_SPEC.md §4.1 audit line",
  },
  {
    name: "net_cost_inr_excluding_e13",
    printedBeside: "net_cost_inr (metric 2)",
    required_by: "EVALUATION_SPEC.md §4.5",
  },
  {
    name: "unresolved_value_inr_multiview",
    printedBeside: "unresolved_value_inr (metric 12)",
    required_by: "EVALUATION_SPEC.md §4.9, DATA_MODEL.md §20",
  },
  {
    name: "period_status_legacy_policy",
    printedBeside: "period_status_distribution (metric 11)",
    required_by: "EVALUATION_SPEC.md §4.9, §5.4 item 8",
  },
]);

/** Whether a quantity may support a claim, or must carry the `EXPLORATORY` label. */
export function isFrozenMetric(name: string): boolean {
  return FROZEN_METRICS.some((m) => m.name.split(", ").includes(name));
}

/** The metrics this package cannot yet compute, with the reason. */
export function blockedMetrics(): readonly FrozenMetric[] {
  return FROZEN_METRICS.filter((m) => m.blockedBy !== null);
}

/** The metrics this package computes, each naming the module that does. */
export function computedMetrics(): readonly FrozenMetric[] {
  return FROZEN_METRICS.filter((m) => m.computedBy !== null);
}
