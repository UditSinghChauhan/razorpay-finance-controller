import type { Observation } from "@assay/domain";
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

import { boolFlag, requireFlag, requireSeeds, stringFlag } from "../args.js";
import { loadGroundTruth } from "../artifacts/ground-truth.js";
import { loadObservations } from "../artifacts/observations.js";
import { loadOracleLabels } from "../artifacts/oracle-labels.js";
import {
  M54_METRIC_10_NOT_COMPUTABLE,
  encodeMetrics,
  metric7EceState,
  type BaseMetrics,
  type CostSensitivityMetrics,
  type ScoredMetrics,
  type ScoredSweeps,
} from "../artifacts/metrics.js";
import { metricsPath } from "../artifacts/metrics-path.js";
import { selectAgents, sweptRunnerFor } from "../agents/index.js";
import {
  BASELINE_NOT_SCORED,
  BASELINE_SEEDS,
  BASELINE_SPLIT,
  BASELINE_TRANSCRIPTION,
  baselineTableLines,
  runBaselinePass,
} from "../bench/baseline.js";
import {
  balanceHarmOf,
  isExercisedSplit,
  isTruthScoredSplit,
  notExercisedOnSplit,
  overDataset,
  overTruth,
  scoreCostSensitivity,
  scoreAbstentionSpike,
  scoreRiskCoverage,
  scoreRobustness,
  scoreTruth,
  truthNotScoredOnSplit,
  type RobustnessSource,
  type TruthSource,
} from "../bench/scorer.js";
import { NO_SWEEPS, runSweeps, type AgentSweeps } from "../bench/sweep.js";
import { CliError, EXIT, UsageError } from "../errors.js";
import { join } from "../fs/io.js";
import type { Command, CommandContext } from "./types.js";

/** `DATA_MODEL.md §22.2` M42's two per-`(split, seed)` dataset artifacts. */
const OBSERVATIONS = "observations.jsonl";
const GROUND_TRUTH = "ground_truth.jsonl";
/** `§9` step 3's per-seed artifact, read and never regenerated (`§5.3`, M51). */
const ORACLE_LABELS = "oracle_labels.jsonl";

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
 *   cost      EVERY agent, §5.3's three points with C_review and C_exception
 *             moved together. Post-hoc: nothing is re-executed, the same
 *             AgentRun and the same §4.4(a) harm are re-scored (M51)
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
 * **The truth side is here, and `EVALUATION_SPEC.md §2`'s three arguments are
 * complete.** `§2` defines a scored unit as `score(agent output, ground truth,
 * oracle labels)`. The first is the agent's product; the second is the seed's
 * `ground_truth.jsonl`, read in zone `GENERATOR_TRUST` — `AL2`'s one route, which
 * binds the engine and the oracle rather than the scorer; the third is `§9` step
 * 3's `oracle_labels.jsonl`, **read and never regenerated** (`§5.3`, M51). Both
 * are opened **once** per `(split, seed)`, because `§4.8`'s populations and
 * `§4.4`'s true journal are the dataset's and not the agent's.
 *
 * `bench/scorer.ts` holds the two seams that gather them; **no metric formula is
 * in this file.** `§4.8`'s metrics 15 and 16 go through `robustness()`, and
 * `§4.2`, `§4.3`, `§4.4`, `§4.5` and `§4.13` through `matchMetrics`,
 * `abstentionMetrics`, `harm`, `netCost` and `gapToOracle` — every one of them
 * the module `PREREGISTRATION.md §8` names for its metric. Metric 3 is
 * `riskCoverage()` over the ε curve, whose y-axis is one `harm()` call per point.
 *
 * **Both reads happen on both of `§2`'s splits, and `train` takes neither.** `§2`
 * loops `for split in {dev, test}` around the `score(...)` line — spec 1.4.34's
 * header calls that line *"read and not amended"* and `DECISION_BRIEF.md §A.41`
 * rests `M56` on it — and `§7`'s reproduction recipe generates, labels and benches
 * **dev** alone, requiring *"a third party … be able to reproduce every number"*.
 * So metrics 2, 3, 4, 5, 6 and 8 are computed on `dev` as well as `test`;
 * `PREREGISTRATION.md §6.2` `AL4` permits inspecting DEV *"without limit"* and
 * `AL2` binds the engine and the oracle, neither of which is the scorer. TRAIN is
 * outside `§2`'s loop and opens nothing.
 *
 * **`§4.8`'s scope is narrower and is applied separately.** M52 makes metrics 15
 * and 16 TEST-only because `F10` lives at TEST seeds `9100`–`9104` and *"on DEV
 * the injected set is EMPTY"* — a fact about the **population**, not about the
 * read. A dev unit therefore opens the answer key for `§4.4` and still reports
 * metrics 15 and 16 as *"not exercised on dev"* in M52's own words, rather than a
 * rate over an empty population that a reader would take for a computed zero.
 *
 * **Metric 7 is not computed, and the artifact says why.** `§4.6` fixes ECE's
 * formula, bins and score but states no correctness source for `accuracy(bin)`;
 * two admissible readings of the frozen text disagree numerically, and
 * `DECISION_BRIEF.md §A.41` requires such a choice to be **ratified** rather than
 * made by an implementation. `packages/eval`'s `calibration()` is unchanged and
 * unwired, and the unit publishes `null` beside the reason.
 *
 * **`--sealed` reads the answer key, from spec 1.4.34 (`DATA_MODEL.md §22.2`
 * M56).** Through spec 1.4.33 this command carried a third branch: under the flag
 * it opened no ground truth and filed *"not exercised"* even on TEST, because
 * `fs/guard.ts` withdrew `AL2`'s unlock. `M56` rules `AL5` an **emission** rule —
 * *"reading is none of print, log or write"* — and `EVALUATION_SPEC.md §2` has
 * always defined a scored unit as `score(agent output, ground truth, oracle
 * labels)`, so `§9` step 7's `assay bench --sealed --agents all --seeds all` was
 * the one run that could satisfy none of it. The branch is gone; the read is the
 * same read, through the same `artifacts/ground-truth.ts` and the same
 * `GENERATOR_TRUST` zone, and **no fifth `ReadZone`, second scoring pass or copy
 * of the artifact was created** — `DECISION_BRIEF.md §A.41` rejects all three and
 * preserves them as rejected. What `--sealed` still governs is **emission**: this
 * command prints per-agent counts and writes `ScoredMetrics`, a closed record of
 * scalars, and no `GroundTruth` field, path or row appears in either
 * (`PREREGISTRATION.md §10` **V31**).
 *
 * **`§5.3`'s cost row is here too, and it is the one sweep that re-executes
 * nothing.** M51's procedure table gives its owner as the `packages/eval` scorer
 * and its re-runs as *"**nothing** — post-hoc over one unit's artifacts"*, against
 * ε and τ which read their thresholds inside stage `S4` and so re-execute the
 * agent. `bench/scorer.ts`'s `scoreCostSensitivity` re-scores the **same**
 * `AgentRun` at `C_review` **and `C_exception`** = ₹100 / ₹250 / ₹1,000 — moved
 * together, `§7`'s ₹500 deliberately off the grid — over the `§4.4(a)` harm metric
 * 2 already used. Every agent gets it, including the ones `§5.1` draws as a single
 * point: what those agents lack is a **curve**, not a `net_cost_inr`. No `RunKey`
 * is formed, no oracle label is read and no second scored unit is written.
 *
 * **What this command still does not do.** `§5.2`'s aggregation over ≥ 5 seeds —
 * the bootstrap that turns these per-unit figures into `mean ± 95% CI` — is a
 * successor step and reads these artifacts. Nothing is stubbed or defaulted to a
 * zero: an uncomputed metric is
 * **absent or `null` with its reason**, because `§5.5` bars *"any number that
 * does not exist in a committed run artifact"* and a zero standing in for an
 * uncomputed figure is precisely such a number.
 */
async function run(context: CommandContext): Promise<void> {
  // §9 step 0 is taken BEFORE anything a scored run needs: no --run-id, no
  // artifact path, no RunKey. The branch is first so none of them is required.
  if (boolFlag(context.args, "baseline")) return baselinePass(context);

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
    const observations = loadObservations(join(seedDir, OBSERVATIONS));
    // Once per (split, seed), and ONE read of each artifact: §4.8's populations
    // and §4.4's true journal are the dataset's and not the agent's, so every
    // agent scored on this seed is measured against the same answer key and the
    // same labels. `sourcesFor` opens `ground_truth.jsonl` exactly once and
    // builds both scoring sources from that record.
    const { robustness: robustnessSource, truth: truthSource } = sourcesFor(
      split,
      seedDir,
      observations,
    );
    for (const agent of agents) {
      const input: AgentInput = Object.freeze({
        observations,
        config: Object.freeze({ ...config(), seed }),
      });

      // The base execution: no sweep parameter, so `packages/engine` resolves
      // §7's frozen ε and τ and this is byte-identical to a pre-M51 run. It also
      // carries §5.3's cost row, which re-executes nothing and is post-hoc over
      // exactly this run and this unit's already-measured §4.4(a) harm.
      const { base, cost } = await execute(agent, input, robustnessSource, truthSource);
      const key = runKey(agent.id, input.config);

      // §5.1's two curve agents, and only under offline (F2, above).
      const runner = sweptRunnerFor(agent.id);
      const executed: AgentSweeps =
        runner === undefined || llmMode !== "offline"
          ? NO_SWEEPS
          : await runSweeps(runner, input, agent.id, (run) => balanceHarmOf(run, truthSource));

      // M51's three point sets in one place, in a fixed order. The cost row is
      // NOT gated on `runner`: ε and τ re-execute the agent and so are §5.1's
      // two curve agents' alone, while the cost row re-executes nothing and
      // every agent has a net_cost_inr to re-score.
      const sweeps: ScoredSweeps = Object.freeze({ ...executed, cost });

      // Metric 3, over §5.1's curve. A single-point agent -- and a curve agent
      // under --llm=replay, where F2 leaves no curve to run -- contributes its
      // one point at the frozen ε, which is §5.1's own treatment of them.
      const riskCoverage = scoreRiskCoverage(sweeps.epsilon, {
        coverage_by_value: base.coverage_by_value,
        balance_harm_paise: base.truth.report?.harm.balance_harm_paise ?? null,
      });

      const metrics: ScoredMetrics = Object.freeze({
        key,
        base,
        sweeps,
        risk_coverage: riskCoverage,
      });
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

/**
 * `PREREGISTRATION.md §9` **step 0** — the non-scored pre-seal DEV baseline pass
 * (spec 1.4.32, register row `DATA_MODEL.md §22.2` **M53**; **M58** at spec
 * 1.4.36 clarifies this placement rather than amending it).
 *
 * **It is a mode of this command and not a ninth command, and M58 says so in
 * terms.** `DECISION_BRIEF.md §C` T0-11 enumerates the CLI's commands and
 * `tests/commands.test.ts` pins the registry against that literal list; a ninth
 * entry would amend a governance document to add an implementation seam. `§9`
 * writes step 0 as *"`<non-scored DEV baseline pass>`"* and names no command, so
 * the placement is an implementation choice and this is the narrowest one
 * available: the step *"runs every agent over the five DEV seeds"*, which is this
 * command's own agent loop with everything that makes a run **scored** removed.
 * M58: `--baseline` is *"the IMPLEMENTATION SPELLING of step 0"*, T0-11's list of
 * **eight** stays *"unchanged and unedited"*, and **no step is added or
 * renumbered**. **No second benchmark procedure is created** — the solver is not
 * duplicated, the agents are the same objects `selectAgents` returns, and
 * `Agent.run` is the same seam.
 *
 * **One invocation per `llm_mode`, which M58 also clarifies rather than
 * changes.** `§9` step 0's *"under each `llm_mode`"* constrains *"the
 * COMPLETENESS of `§7`'s table"* — a row per `(agent_id, llm_mode)` — *"and NOT
 * the number of process invocations"*, so the operator may take step 0 once per
 * mode. Where `DECISION_BRIEF.md §F` **F2** is unresolved the `replay` rows are
 * deferred exactly as F2 already defers `B2-LLM-DIRECT` and metric 3's
 * `--llm=replay` column: **F2's semantics are applied here, not reopened.**
 *
 * **What it does not do, checked rather than merely omitted:** it forms no
 * `RunKey`, opens no `ground_truth.jsonl` and no `oracle_labels.jsonl`, computes
 * no metric on `PREREGISTRATION.md §8`'s list, runs no ε, τ or cost sweep, calls
 * `context.sink` **not at all** — so no `runs/` artifact, no `metrics.json` and
 * no `benchmark_manifest.json` — and cuts no tag. `§9`: *"It EMITS NO
 * `metrics.json`, is NOT a scored run, and reports NO scored number of its own."*
 *
 * **DEV-only, and the split is refused rather than defaulted.** `§7`'s producer
 * row and `§9` step 0's own two command lines are `--split dev`; `§6.1`'s
 * forbidden list bars `--split test` before the seal in any case. The seeds are
 * `§7`'s five and are **not** taken from `--seeds`: the population is frozen
 * before the measurement, which is the property that keeps
 * `DECISION_BRIEF.md §L.4` out of this entry (M53). An explicit `--seeds` naming
 * anything else is a usage error rather than a silently-honoured override.
 *
 * **The result is emitted, not written.** `§7` is the record — *"recorded here
 * once step 0 has run and EMPTY until then. It is NOT a `BenchmarkManifest`
 * field"* — so the pass prints `§7`'s table for transcription into the document,
 * and `packages/eval/src/frozen.ts` transcribes `§7` as it does every other `§7`
 * parameter. A machine-readable baseline file would be a second, uncommitted
 * evidence path for a figure `§7` alone is authoritative for.
 */
async function baselinePass(context: CommandContext): Promise<void> {
  const requested = stringFlag(context.args, "split");
  if (requested !== null && requested !== BASELINE_SPLIT) {
    throw new UsageError(
      `--baseline runs PREREGISTRATION.md §9 step 0, whose population is §7's five DEV seeds ` +
        `${BASELINE_SEEDS.join(", ")}. --split ${JSON.stringify(requested)} is refused: §7's ` +
        `producer row is "§9 step 0's NON-SCORED pre-seal DEV baseline pass", and §6.1's ` +
        `forbidden list bars --split test before the seal.`,
    );
  }
  if (stringFlag(context.args, "seeds") !== null || stringFlag(context.args, "seed") !== null) {
    throw new UsageError(
      `--baseline takes no seed argument. PREREGISTRATION.md §7 fixes metric 17's baseline ` +
        `population as the five DEV seeds ${BASELINE_SEEDS.join(", ")} — ONE RATE EACH, ` +
        `n = 5 — BEFORE the measurement, which is why DECISION_BRIEF.md §L.4 is not engaged ` +
        `by it (M53). A population chosen on the command line would give that argument away.`,
    );
  }
  if (stringFlag(context.args, "run-id") !== null) {
    throw new UsageError(
      `--baseline takes no --run-id. PREREGISTRATION.md §9 step 0 "EMITS NO metrics.json" and ` +
        `writes no runs/ artifact, so there is no run to identify; its result is recorded into ` +
        `§7's metric-17 baseline table, which is not a run artifact.`,
    );
  }

  const agents = selectAgents(stringFlag(context.args, "agents") ?? "all");
  const llmMode = readLlmMode(context.config.llmProvider);
  const benchRoot = stringFlag(context.args, "bench") ?? "bench";

  const rows = await runBaselinePass({
    agents,
    llmMode,
    strictReplay: context.config.strictReplay,
    // One read per seed, of the ONE artifact this pass needs. §9 step 0 runs
    // after `assay generate --split dev`, and the answer key is not opened:
    // abstention_rate_by_value is computed from the agent's own outcomes.
    observationsForSeed: (seed) =>
      loadObservations(join(join(join(benchRoot, BASELINE_SPLIT), String(seed)), OBSERVATIONS)),
  });

  context.out(BASELINE_NOT_SCORED);
  context.out("");
  for (const line of baselineTableLines(rows)) context.out(line);
  context.out("");
  // M58's transcription path, printed where the rows are: §7 first as the
  // authoritative record, then frozen.ts as its executable transcription, both
  // before §9 step 1's tag. This command writes neither.
  context.out(BASELINE_TRANSCRIPTION);
  context.out("");
  context.out(`agents              ${String(rows.length)}`);
  context.out(`seeds               ${BASELINE_SEEDS.join(", ")}  (n = ${String(BASELINE_SEEDS.length)})`);
  context.out(`llm_mode            ${llmMode}`);
  context.out(`artifacts           none — §9 step 0 writes nothing`);
}

/**
 * Where one scored unit's truth-side metrics come from — `bench/scorer.ts`'s two
 * unions, decided from the split and nothing else.
 *
 * **One read, two sources.** `ground_truth.jsonl` is opened **once** per
 * `(split, seed)` and the same `GroundTruth` value is handed to both: `§4.8`'s
 * seam, which also needs the dataset's observations, and the rest of the truth
 * side, which also needs `§9` step 3's labels. A second `loadGroundTruth` call
 * would be a second place the answer key enters the process, which is exactly
 * what `PREREGISTRATION.md §10` **V31**'s emission boundary is counted against.
 *
 * **The reads happen only on the split `§9` step 7 scores**, so `train` and `dev`
 * open neither artifact, and each source carries its own reason in words: M52's
 * *"not exercised on DEV"* for metrics 15 and 16, and
 * `truthNotScoredOnSplit`'s statement about the read for the rest. The two
 * reasons are different facts and are not collapsed into one.
 *
 * **`--sealed` is not a term in this decision** from spec 1.4.34 (`M56`): `AL5`
 * governs what leaves the process, not what enters it, and a sealed TEST unit
 * reads the same files an unsealed one does.
 *
 * Neither read is guarded by a `try`: a `ground_truth.jsonl` the scorer cannot
 * reconcile, and an `oracle_labels.jsonl` `§9` step 3 never wrote, are stop
 * conditions for a TEST scored unit — not metrics taken over a smaller truth or a
 * smaller ambiguity set.
 */
function sourcesFor(
  split: Split,
  seedDir: string,
  observations: readonly Observation[],
): { readonly robustness: RobustnessSource; readonly truth: TruthSource } {
  // `train` is outside §2's loop: nothing is opened and both sources say so.
  if (!isTruthScoredSplit(split)) {
    return {
      robustness: notExercisedOnSplit(split),
      truth: truthNotScoredOnSplit(split),
    };
  }

  // ONE read of each artifact, on both of §2's splits.
  const groundTruth = loadGroundTruth(join(seedDir, GROUND_TRUTH));
  const labels = loadOracleLabels(join(seedDir, ORACLE_LABELS));
  return {
    // §4.8's own scope is narrower and is applied to THIS source alone. On dev
    // the answer key is open, and M52 still reports "not exercised on dev" --
    // from the split, so the disposition is M52's words and not a rate taken
    // over an empty population that would read as a computed zero.
    robustness: isExercisedSplit(split)
      ? overDataset(groundTruth, observations)
      : notExercisedOnSplit(split),
    truth: overTruth(groundTruth, observations, labels),
  };
}

/**
 * One agent's base execution, projected onto the metrics it determines — and
 * `§5.3`'s cost row over that same execution.
 *
 * **The cost sweep travels with the base execution because it is a re-scoring of
 * it.** M51 gives it *"nothing"* to re-run and this is the one place that holds
 * both the `AgentRun` and the `TruthMetrics` it re-scores, so a second call site
 * would either re-run the agent or re-read the answer key to obtain what is
 * already here. It is returned beside `base` rather than filed inside it because
 * it is a **sweep**, not a figure at the frozen thresholds.
 */
async function execute(
  agent: Agent,
  input: AgentInput,
  robustnessSource: RobustnessSource,
  truthSource: TruthSource,
): Promise<{ readonly base: BaseMetrics; readonly cost: CostSensitivityMetrics }> {
  const run = await agent.run(input);
  if (run.agent_id !== agent.id) {
    throw new CliError(
      `bench: ${agent.id} returned a run labelled ${run.agent_id}. A result that cannot be ` +
        `associated with its RunKey is refused rather than filed (M48).`,
      EXIT.FAILURE,
    );
  }
  const c = coverage(run);
  // §4.2, §4.3, §4.4, §4.5, §4.6 and §4.13, through one seam and one truth read.
  // Metric 7's headline is READ OFF the report that carries §4.6's reliability
  // diagram rather than computed a second time here (M57).
  const truth = scoreTruth(run, truthSource);
  // §5.3's cost row, post-hoc over the run just scored and the harm figure
  // metric 2 already used. No agent is re-executed and no oracle label is read.
  const cost = scoreCostSensitivity(run, truth);
  const base: BaseMetrics = Object.freeze({
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
    // §4.8, through the one seam. No population, covered set or per-case harm
    // is derived in this file.
    robustness: scoreRobustness(run, robustnessSource),
    // Metric 17 (§4.10, M53). The rate is this run's; the baseline is READ from
    // PREREGISTRATION.md §7 and only on TEST, per §7's consumer row. Nothing
    // here derives a baseline from the unit being scored.
    abstention_spike: scoreAbstentionSpike(run, input.config.split, agent.id, input.config.llm_mode),
    // §4.2, §4.3, §4.4, §4.5, §4.6 and §4.13, through the other. Every formula
    // is `packages/eval`'s; this file supplies the two artifacts and the run.
    truth,
    // Metric 7 (§4.6, M57) — the figure its own report produced, or null with
    // the reason there is none. Never a 0.0 (§5.5, M57).
    ece: truth.report?.calibration?.ece ?? null,
    ece_state: metric7EceState(truth),
    // A metric on §8's list that keeps its number and publishes its state
    // rather than a fabricated figure (§5.4 item 5, §5.5).
    exception_class_confusion: null,
    exception_class_confusion_state: M54_METRIC_10_NOT_COMPUTABLE,
  });
  return Object.freeze({ base, cost });
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
    baseline: {
      kind: "boolean",
      describe: "PREREGISTRATION.md §9 step 0: the non-scored pre-seal DEV baseline pass (M53).",
    },
  },
  run,
};
