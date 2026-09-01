import {
  SCORED_LLM_MODES,
  coverage,
  runKey,
  type Agent,
  type AgentInput,
  type RunConfig,
  type ScoredLlmMode,
} from "@assay/eval";
import { SEED_BLOCKS, blockOf, type Split } from "@assay/generator";

import { requireFlag, requireSeeds, stringFlag } from "../args.js";
import { loadObservations } from "../artifacts/observations.js";
import { encodeMetrics, type BaseMetrics, type ScoredMetrics } from "../artifacts/metrics.js";
import { metricsPath } from "../artifacts/metrics-path.js";
import { selectAgents, sweptRunnerFor } from "../agents/index.js";
import { NO_SWEEPS, runSweeps, type AgentSweeps } from "../bench/sweep.js";
import { CliError, EXIT, UsageError } from "../errors.js";
import { join } from "../fs/io.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay bench` — the scored benchmark sweep.
 *
 * `ARCHITECTURE.md §10`: `agent runner ── ASSAY · B0 · B1 · B2 · A1 · A2 · A3`,
 * then `scorer ──▶ metrics.json per (agent × seed × split)`. Register row **M47**
 * puts the agent implementations in `apps/cli/src/agents/` and injects them, and
 * **M48** fixes the scored unit at `(agent_id, split, seed, llm_mode)` and the
 * artifact at `runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json`.
 *
 * **The ε and τ sweeps are this command's, ratified at spec 1.4.32 (register row
 * `DATA_MODEL.md §22.2` M51).** `RECONCILIATION_SPEC.md §6` step 3 reads both
 * thresholds inside stage `S4`, so a sweep point is a **re-execution of the
 * agent** and no re-scoring can substitute for it; `packages/eval` holds no
 * agent (`ARCHITECTURE.md §10`, M37), so the loop belongs to the composition
 * root. `bench/sweep.ts` holds the grids and the walk; this file reads the
 * dataset, selects the agents and writes the artifact.
 *
 * **What one invocation does, per `(agent, split, seed, llm_mode)`:**
 *
 * ```
 *   base      one execution at PREREGISTRATION.md §7's frozen ε and τ
 *             -> ScoredMetrics.base, the authoritative ordinary figures
 *   ε sweep   ASSAY and A1 only (§5.1: "B0, B1, B2 and A2 are single points")
 *             21 ascending points, --llm=offline
 *   τ sweep   the same two agents, §5.3's four floors in §5.3's order
 *             the Ambiguity Oracle is NOT consulted and its labels are NOT
 *             regenerated -- all three reported quantities are engine-side
 * ```
 *
 * **`--llm=replay` is deferred to `DECISION_BRIEF.md §F` F2 and this command
 * says so rather than pretending otherwise.** `§5.1` runs the curve under
 * `--llm=offline`: varying ε changes which probes fire and so the cache keys,
 * `§2` populates the cache from *"one recorded `--llm=<live provider> --record`
 * pass"*, and F2 leaves no live pass to record the other 20 points. Offline
 * reaches no cache, and `§2` requires every configuration to be run offline in
 * any case (metric 24). A `--llm=replay` invocation therefore runs the **base**
 * execution and no curve, which is F2's standing disposition applied rather than
 * a new branch.
 *
 * **What this command does not yet do.** `ScoredMetrics.base` carries the
 * metrics a scored unit's own `AgentRun` determines. The truth-side half —
 * `§4.4`'s harm and, through it, metrics 2, 3 and 8 — needs `scoringTruth` over
 * `ground_truth.jsonl` and the bootstrap over ≥ 5 seeds needs `§5.2`'s
 * aggregator; both are successor tasks. Nothing is stubbed or defaulted to a
 * zero: an uncomputed metric is **absent** from the artifact, because `§5.5`
 * bars *"any number that does not exist in a committed run artifact"* and a zero
 * standing in for an uncomputed figure is precisely such a number.
 */
async function run(context: CommandContext): Promise<void> {
  const split = readSplit(requireFlag(context.args, "split"));
  // `--seeds all` (§9 step 7's spelling) expands over §6.1's declared seeds for
  // this split, read from the frozen table's one reader -- oracle.ts's own line.
  const declared = SEED_BLOCKS.filter((b) => b.split === split).flatMap((b) => [...b.seeds]);
  const seeds = requireSeeds(context.args, declared);
  const agents = selectAgents(stringFlag(context.args, "agents") ?? "all");
  const runId = requireFlag(context.args, "run-id");
  const benchRoot = stringFlag(context.args, "bench") ?? "bench";
  const llmMode = readLlmMode(context.config.llmProvider);

  for (const seed of seeds) checkSeed(seed, split);

  const config = (): RunConfig =>
    Object.freeze({
      llm_mode: llmMode,
      strict_replay: context.config.strictReplay,
      split,
      seed: 0,
    });

  let written = 0;
  for (const seed of seeds) {
    const seedDir = join(join(benchRoot, split), String(seed));
    const observations = loadObservations(join(seedDir, "observations.jsonl"));
    for (const agent of agents) {
      const input: AgentInput = Object.freeze({
        observations,
        config: Object.freeze({ ...config(), seed }),
      });

      // The base execution: no sweep parameter, so `packages/engine` resolves
      // §7's frozen ε and τ and this is byte-identical to a pre-M51 run.
      const base = await execute(agent, input);
      const key = runKey(agent.id, input.config);

      // §5.1's two curve agents, and only under offline (F2, above).
      const runner = sweptRunnerFor(agent.id);
      const sweeps: AgentSweeps =
        runner === undefined || llmMode !== "offline"
          ? NO_SWEEPS
          : await runSweeps(runner, input, agent.id);

      const metrics: ScoredMetrics = Object.freeze({ key, base, sweeps });
      context.sink.write(metricsPath(runId, key), encodeMetrics(metrics));
      context.out(
        `${agent.id.padEnd(14)} seed ${String(seed)}  ` +
          `ε-points ${String(sweeps.epsilon.length)}  τ-points ${String(sweeps.tau.length)}`,
      );
      written += 1;
    }
  }

  context.out(`scored units        ${String(written)}`);
  context.out(`llm_mode            ${llmMode}`);
  context.out(`artifacts           ${join("runs", runId)}`);
}

/** One agent's base execution, projected onto the metrics it determines. */
async function execute(agent: Agent, input: AgentInput): Promise<BaseMetrics> {
  const run = await agent.run(input);
  if (run.agent_id !== agent.id) {
    throw new CliError(
      `bench: ${agent.id} returned a run labelled ${run.agent_id}. A result that cannot be ` +
        `associated with its RunKey is refused rather than filed (M48).`,
      EXIT.FAILURE,
    );
  }
  const c = coverage(run);
  return Object.freeze({
    coverage_by_value: c.coverage_by_value.ratio,
    coverage_by_count: c.coverage_by_count.ratio,
    coverage_by_value_bank: c.coverage_by_value_bank.ratio,
    coverage_by_value_ledger: c.coverage_by_value_ledger.ratio,
    coverage_by_value_all_observations: c.coverage_by_value_all_observations.ratio,
    batch_value_paise: c.batch_value_paise,
    abstentions: run.abstentions.length,
    decisions: run.decisions.length,
    open_exceptions: run.open_exceptions.length,
    probes_spent: run.probes_spent,
    abstentions_resolved_by_probe: run.abstentions_resolved_by_probe,
  });
}

/** `PREREGISTRATION.md §6.1`'s splits, read rather than assumed. */
function readSplit(raw: string): Split {
  if (raw === "train" || raw === "dev" || raw === "test") return raw;
  throw new UsageError(
    `--split: ${JSON.stringify(raw)} is not one of PREREGISTRATION.md §6.1's splits ` +
      `(train, dev, test).`,
  );
}

/** A seed outside `§6.1`'s block for its split is refused, never renamed. */
function checkSeed(seed: number, split: Split): void {
  const block = blockOf(seed);
  if (block === null) {
    throw new UsageError(
      `seed ${String(seed)} appears in no row of PREREGISTRATION.md §6.1's split table.`,
    );
  }
  if (block.split !== split) {
    throw new UsageError(
      `PREREGISTRATION.md §6.1 assigns seed ${String(seed)} to the ${block.split} split, not ` +
        `${split}. The split table is frozen and is not overridden from the command line.`,
    );
  }
}

/** `EVALUATION_SPEC.md §2`: only `replay` and `offline` produce a scored run. */
function readLlmMode(raw: string): ScoredLlmMode {
  if ((SCORED_LLM_MODES as readonly string[]).includes(raw)) return raw as ScoredLlmMode;
  throw new UsageError(
    `--llm ${JSON.stringify(raw)} produces no scored run. EVALUATION_SPEC.md §2 scores ` +
      `${SCORED_LLM_MODES.join(" and ")} only; a metered provider is refused outright.`,
  );
}

export const benchCommand: Command = {
  name: "bench",
  summary: "Score every agent over every seed and aggregate with bootstrap CIs.",
  flags: {
    agents: { kind: "string", describe: "Comma-separated agent ids (ASSAY, B0, A1, A2, A3)." },
    seeds: { kind: "string", describe: "Comma-separated declared seeds." },
    seed: { kind: "string", describe: "One declared seed." },
    split: { kind: "string", describe: "PREREGISTRATION.md §6.1 split: train, dev or test." },
    "run-id": { kind: "string", describe: "Run identifier; names runs/<run_id>/." },
    bench: { kind: "string", describe: "Dataset root. Default: bench." },
  },
  run,
};
