/**
 * Component shape — `PREREGISTRATION.md §8` metric 25.
 *
 * `component_size_distribution` and `intractable_rate`, over
 * `RECONCILIATION_SPEC.md §5`'s components as `DATA_MODEL.md §11` records them:
 * `size` is *"`|members|`; compared against `K_max`"*, and `solve_status` is
 * `SOLVED | INTRACTABLE | EMPTY`. `§5` names the budget tail as *"the reported
 * `INTRACTABLE` rate"*, which is this metric's second half.
 *
 * **The population is every component, with no terminal-state filter.**
 * `PREREGISTRATION.md §8` lists metric 25 among the quantities *"Explicitly
 * unaffected"* by the benchmark v1.0.1 coverage amendment, and gives the reason:
 * *"reference observations remain available to stages S1–S4 as evidence
 * (`DATA_MODEL.md §10.1`), so the anchor stages and the `K_max` bound are
 * untouched."* Filtering the population by anything would reintroduce the
 * dependency that sentence rules out.
 *
 * **`§4` supplies no distribution shape**, so none is invented: the report
 * carries the counts by size, which is the distribution itself, plus the
 * summary statistics `EVALUATION_SPEC.md §5.3`'s batch-size sweep is read
 * against. No histogram bucketing is applied, because a bucket width would be a
 * choice this specification does not make and `K_max = 22` bounds the support
 * at 22 anyway.
 */

import type { AgentRun, ComponentOutcome } from "../run.js";

/** Metric 25's two halves. */
export interface ComponentReport {
  readonly components: number;
  /** `size` → count. Ascending by size, so the artifact is byte-reproducible. */
  readonly size_distribution: readonly { readonly size: number; readonly count: number }[];
  readonly max_size: number;
  /** The median size, by nearest-rank. `0` over an empty population. */
  readonly median_size: number;
  readonly intractable: number;
  /** `§5`'s *"reported INTRACTABLE rate"*. */
  readonly intractable_rate: number;
  readonly empty: number;
  readonly solved: number;
}

/** Metric 25 over one run's components. */
export function componentMetrics(run: AgentRun): ComponentReport {
  return componentMetricsOver(run.components);
}

/** Metric 25 over a component list, for a caller aggregating across seeds. */
export function componentMetricsOver(
  components: readonly ComponentOutcome[],
): ComponentReport {
  const counts = new Map<number, number>();
  let intractable = 0;
  let empty = 0;
  let solved = 0;
  let maxSize = 0;

  for (const component of components) {
    counts.set(component.size, (counts.get(component.size) ?? 0) + 1);
    if (component.size > maxSize) maxSize = component.size;
    if (component.solve_status === "INTRACTABLE") intractable += 1;
    else if (component.solve_status === "EMPTY") empty += 1;
    else solved += 1;
  }

  const sizes = components.map((c) => c.size).sort((a, b) => a - b);
  // Nearest-rank rather than an averaging median: `size` is a count of members
  // and half a member is not a component. §0 rule 5 admits integers where a
  // figure reaches a report.
  const median = sizes.length === 0 ? 0 : (sizes[Math.floor((sizes.length - 1) / 2)] ?? 0);

  return Object.freeze({
    components: components.length,
    size_distribution: Object.freeze(
      [...counts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([size, count]) => Object.freeze({ size, count })),
    ),
    max_size: maxSize,
    median_size: median,
    intractable,
    intractable_rate: components.length === 0 ? 0 : intractable / components.length,
    empty,
    solved,
  });
}
