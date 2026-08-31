/**
 * `RunKey` — what identifies one scored run, and what the bootstrap holds fixed.
 *
 * **Ratified at spec 1.4.29, register row `DATA_MODEL.md §22.2` M48.** Two
 * documents named this tuple and each named a subset:
 *
 * ```
 *   ARCHITECTURE.md §10          metrics.json per (agent x seed x split)
 *   DECISION_BRIEF.md §C T0-9    metrics.json per (agent x seed x llm-mode)
 * ```
 *
 * They are overlapping subsets rather than rival claims, and the union is
 * **forced** rather than chosen. {@link RunConfig} already carries `{llm_mode,
 * strict_replay, split, seed}`; `DECISION_BRIEF.md §L.1` rule 11 fixes
 * `strict_replay` true on every scored run, so it cannot vary within the scored
 * set and cannot be a key dimension; and `EVALUATION_SPEC.md §5.4` item 6
 * requires *"Two columns for every primary metric: `--llm=replay` and
 * `--llm=offline`"*, which makes `llm_mode` a reported dimension. What is left
 * is exactly four fields.
 *
 * **The aggregation dimension is `seed`, and only `seed`.** `EVALUATION_SPEC.md
 * §2`: *"Every configuration runs on >= 5 seeds. Single-run numbers are banned
 * from the report; a figure without a confidence interval is not a result."* A
 * *configuration* is therefore the key with `seed` removed — {@link
 * AggregationGroup} — and `bootstrap.ts`'s percentile interval resamples across
 * the seeds of one group. Pooling across agents, splits or llm-modes would
 * average away the comparison the report exists to make.
 *
 * **This module holds no path.** `ARCHITECTURE.md §3` gives `apps/cli` all
 * filesystem I/O and this package *"performs no I/O"*; where a `metrics.json`
 * sits on disk is a layout decision, and `apps/cli/src/artifacts/metrics-path.ts`
 * records it as one. What is here is the **identity** a metric is filed under,
 * which is a measurement concept and belongs to the measurement layer.
 */

import type { AgentId, RunConfig, ScoredLlmMode } from "./agent.js";

/** `PREREGISTRATION.md §6.1`'s split, as `RunConfig` spells it. */
export type RunSplit = RunConfig["split"];

/**
 * `M48`'s canonical key: `(agent_id, split, seed, llm_mode)`.
 *
 * Field order is the order M48 states it in, and the order `apps/cli`'s path
 * convention nests it in. `strict_replay` is deliberately absent — see the
 * module header.
 */
export interface RunKey {
  readonly agent_id: AgentId;
  readonly split: RunSplit;
  readonly seed: number;
  readonly llm_mode: ScoredLlmMode;
}

/**
 * The key with `seed` removed — one *configuration* in `EVALUATION_SPEC.md §2`'s
 * sense, and the unit a bootstrap interval is computed for.
 */
export interface AggregationGroup {
  readonly agent_id: AgentId;
  readonly split: RunSplit;
  readonly llm_mode: ScoredLlmMode;
}

/** Build a {@link RunKey} from an agent id and the config it was run under. */
export function runKey(agent_id: AgentId, config: RunConfig): RunKey {
  return Object.freeze({
    agent_id,
    split: config.split,
    seed: config.seed,
    llm_mode: config.llm_mode,
  });
}

/** The configuration a key belongs to. `seed` is what the bootstrap resamples. */
export function aggregationGroup(key: RunKey): AggregationGroup {
  return Object.freeze({
    agent_id: key.agent_id,
    split: key.split,
    llm_mode: key.llm_mode,
  });
}

/**
 * A stable string for grouping and for ordering a report's rows.
 *
 * A space is the separator rather than `/` or `-`, because `AgentId` contains
 * `-` (`B0-IDONLY`) and `apps/cli` nests these same fields as path segments: a
 * separator that can occur inside a field is a separator that makes two
 * different configurations collide. No `AgentId`, split or llm-mode contains a
 * space, all three being closed unions.
 */
export function groupId(group: AggregationGroup): string {
  return [group.agent_id, group.split, group.llm_mode].join(" ");
}

/** Whether two keys belong to the same configuration — same group, any seed. */
export function sameGroup(a: RunKey, b: RunKey): boolean {
  return groupId(aggregationGroup(a)) === groupId(aggregationGroup(b));
}

/**
 * Partition keys into `EVALUATION_SPEC.md §2`'s configurations.
 *
 * Insertion-ordered by first appearance, and each group's keys keep the order
 * they were given: `§5.5` bans a number without a CI, and `PREREGISTRATION.md
 * §8` metric 23 requires an interval to be a function of `(sample, seed)` alone,
 * so a partition that reordered a sample would silently change one.
 */
export function byConfiguration(keys: readonly RunKey[]): ReadonlyMap<string, readonly RunKey[]> {
  const out = new Map<string, RunKey[]>();
  for (const key of keys) {
    const id = groupId(aggregationGroup(key));
    const bucket = out.get(id);
    if (bucket === undefined) out.set(id, [key]);
    else bucket.push(key);
  }
  return out;
}
