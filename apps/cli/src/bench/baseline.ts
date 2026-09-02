import type { Observation } from "@assay/domain";
import {
  METRIC_17_BASELINE_SEEDS,
  METRIC_17_BASELINE_SPLIT,
  abstentionRateByValue,
  metric17BaselineStatistic,
  type Agent,
  type AgentId,
  type AgentInput,
  type Metric17BaselineSample,
  type ScoredLlmMode,
} from "@assay/eval";

import { CliError, EXIT } from "../errors.js";

/**
 * `PREREGISTRATION.md §9` **step 0** — the non-scored pre-seal DEV baseline pass
 * (spec 1.4.32, register row `DATA_MODEL.md §22.2` **M53**; the pair's encoding
 * and its transcription path ratified at spec 1.4.36, **M58**).
 *
 * ```
 *   0. Baseline:     assay generate --split dev --seeds 2000-2004
 *                    assay oracle   --split dev --seeds 2000-2004
 *                    <non-scored DEV baseline pass>   # spec 1.4.32, M53
 * ```
 *
 * `§9`'s own commentary is the whole specification of this module:
 *
 * > *"It runs every agent over the five DEV seeds under each `llm_mode`, records
 * > `abstention_rate_by_value` per `(agent_id, llm_mode, seed)`, and writes the
 * > mean and SAMPLE stddev into `§7`'s metric-17 baseline table. It **EMITS NO
 * > `metrics.json`**, is **NOT a scored run**, and reports **NO scored number of
 * > its own** — so no run contributes to the baseline it is later judged
 * > against, and `§5.5`'s "committed run artifact" rule is not engaged by it."*
 *
 * **This is not a second benchmark procedure.** It runs the same agents through
 * the same `Agent.run` seam `commands/bench.ts` uses, over the same
 * `observations.jsonl` a dev dataset already carries. What it does **not** do is
 * everything that makes a run *scored*: it forms no `RunKey`, opens no
 * `ground_truth.jsonl` and no `oracle_labels.jsonl`, computes no metric on
 * `PREREGISTRATION.md §8`'s list, runs no ε, τ or cost sweep, and writes
 * **nothing** — no `runs/` artifact, no `metrics.json`, no manifest, no tag.
 * `abstention_rate_by_value` is `§4.10`'s **input** to metric 17 and not metric
 * 17 itself; the flag it feeds is computed on TEST, against the value this pass
 * produced, and never against the run that produced it.
 *
 * **It is DEV-only and the split is not a parameter.** `§7`'s producer row is
 * *"`§9` step 0's NON-SCORED pre-seal DEV baseline pass"* and its population is
 * *"the five DEV seeds `2000`–`2004`"*. `§6.1`'s forbidden list bars
 * `--split test` before the seal in any case, and `§9`'s note records that *"DEV
 * generation is permitted before the seal"* — which is why this step can be
 * taken at all. `METRIC_17_BASELINE_SPLIT` and `METRIC_17_BASELINE_SEEDS` are
 * `packages/eval`'s transcription of `§7`; this module holds no literal of its
 * own.
 *
 * **One invocation covers one `llm_mode`, and `§7`'s table accumulates across
 * them.** `llm_mode` is a field of `RunConfig` resolved from `--llm`, and `§7`
 * keys the baseline per `(agent_id, llm_mode)` precisely because *"`R3` probes
 * resolve abstentions, so the two modes carry genuinely different rates"*.
 * Looping both modes inside one pass would also force a `replay` execution
 * wherever the operator asked for `offline`, which `DECISION_BRIEF.md §F` **F2**
 * leaves without a recorded cache. The operator therefore takes step 0 once per
 * mode, exactly as `EVALUATION_SPEC.md §2`'s parity comparison already requires
 * of every configuration.
 *
 * **What this module does with the result: nothing.** `PREREGISTRATION.md §7` is
 * the record — *"table `(agent_id, llm_mode) -> (mean_bps, stddev_bps)`, recorded
 * here once step 0 has run and EMPTY until then. It is **NOT** a
 * `BenchmarkManifest` field: `DATA_MODEL.md §18`'s shape stays closed"* — so the
 * pass **emits** the table for the operator to record against `§7`, and
 * `packages/eval/src/frozen.ts` transcribes `§7` the way it transcribes every
 * other `§7` parameter. Writing a machine-readable baseline file here would be a
 * second, uncommitted evidence path for a figure `§7` alone is authoritative
 * for — the shape `DECISION_BRIEF.md §A.31` and `M56` both refuse — and `M53`
 * lists a manifest field under **Rejected**.
 *
 * **The record authority and the transcription path are RATIFIED at spec 1.4.36,
 * register row `DATA_MODEL.md §22.2` M58**, which `M53` left open:
 * `PREREGISTRATION.md §7`'s table is the **AUTHORITATIVE human-readable** record
 * and `METRIC_17_BASELINE` is its **EXECUTABLE TRANSCRIPTION** — not a second,
 * independently measured baseline. Both are written by the operator from **this
 * pass's output**, after step 0 and **before `§9` step 1's tag**, so the tag
 * covers the source carrying the measured pair and step 8's *"no code changes
 * between 6 and 8"* holds over it. Any divergence between the two is a **seal /
 * reproducibility failure**, which the integer encoding below is what makes
 * exactly checkable. Nothing may be guessed or prefilled, so the constant stays
 * `[]` until this pass has actually produced rows.
 *
 * **The pair this pass emits is `§7`'s final encoding** (M58): integer basis
 * points, `round_half_up` with ties away from zero, applied exactly once to each
 * of the mean and the sample standard deviation, **independently**, over five
 * per-seed rates carried at **full precision**. The arithmetic is
 * `metric17BaselineStatistic`'s and lives in `packages/eval`; this module holds
 * no rounding rule and emits **no unrounded baseline** beside the rounded one.
 */

/** `§7`'s baseline split, re-exported so the command names it from the frozen text. */
export const BASELINE_SPLIT = METRIC_17_BASELINE_SPLIT;

/** `§7`'s baseline population: the five DEV seeds, `n = 5`. */
export const BASELINE_SEEDS = METRIC_17_BASELINE_SEEDS;

/**
 * What `§9` step 0 is, stated in the artifact-free terms `§5.5` requires.
 *
 * Printed by the pass so that a transcript of it can never be mistaken for a
 * scored run's output: `§9` says the step *"reports NO scored number of its
 * own"*, and a reader who finds a rate in a log needs to see, in the same place,
 * that it is `§4.10`'s input rather than a metric.
 */
export const BASELINE_NOT_SCORED =
  "NON-SCORED: PREREGISTRATION.md §9 step 0's pre-seal DEV baseline pass (DATA_MODEL.md §22.2 " +
  "M53, encoding and transcription ratified by M58). It emits no metrics.json, forms no " +
  "RunKey, opens no ground truth and no oracle labels, writes no runs/ artifact and cuts no " +
  "tag. abstention_rate_by_value is metric 17's INPUT and not a scored number; §5.5's " +
  "committed-run-artifact rule is not engaged by it. The mean_bps / stddev_bps pair below is " +
  "recorded into PREREGISTRATION.md §7's metric-17 baseline table, which is the only place it " +
  "is authoritative.";

/**
 * What the operator does with the emitted table — `§9` step 0's closing act, and
 * the transcription path M58 ratifies.
 *
 * Printed beneath the table because the two writes are **ordered** and the order
 * is what the seal rests on: `§7` first as the authoritative record, then
 * `METRIC_17_BASELINE` as its executable transcription, **both before `§9` step
 * 1's tag**. Nothing here writes either — this pass has no filesystem seam at
 * all — and nothing may be guessed: the constant stays `[]` until these exact
 * rows exist.
 */
export const BASELINE_TRANSCRIPTION =
  "TRANSCRIBE (DATA_MODEL.md §22.2 M58): record each (agent_id, llm_mode, mean_bps, " +
  "stddev_bps) row above into PREREGISTRATION.md §7's metric-17 baseline table, which is the " +
  "AUTHORITATIVE human-readable record, and then into METRIC_17_BASELINE in " +
  "packages/eval/src/frozen.ts, which is its EXECUTABLE TRANSCRIPTION and not a second " +
  "measurement. Both writes happen after this step and BEFORE §9 step 1's tag, so the tag " +
  "covers the source that carries the measured baseline. The two must agree exactly: any " +
  "divergence is a seal/reproducibility failure. Nothing is guessed or prefilled, no " +
  "generated JSON or data file is introduced as a second evidence path, and the pair is not " +
  "a BenchmarkManifest field.";

/** One `(agent_id, llm_mode, seed)` measurement — `§9` step 0's per-seed record. */
export interface BaselineSample extends Metric17BaselineSample {
  /** `Σ recon_line.amount` where the component reached `ABSTAINED`, in paise. */
  readonly numerator_paise: number;
  /** `batch_value_paise` — `§4.1`'s denominator, in paise. */
  readonly denominator_paise: number;
}

/** One row of `PREREGISTRATION.md §7`'s table, with the sample behind it. */
export interface BaselineRow {
  readonly agent_id: AgentId;
  readonly llm_mode: ScoredLlmMode;
  readonly mean_bps: number;
  readonly stddev_bps: number;
  /** The five rates the statistic was taken over, in `§7`'s seed order. */
  readonly samples: readonly BaselineSample[];
}

/** What the pass needs, all injected — this module opens no file and holds no path. */
export interface BaselinePassInput {
  readonly agents: readonly Agent[];
  readonly llmMode: ScoredLlmMode;
  readonly strictReplay: boolean;
  /** The seed's `observations.jsonl`, already loaded by the caller. */
  readonly observationsForSeed: (seed: number) => readonly Observation[];
}

/**
 * Run `§9` step 0 and return `§7`'s rows.
 *
 * Deterministic in its inputs: the agents are executed in the order given, over
 * `§7`'s seeds in `§7`'s order, and the statistic is a total function of the five
 * rates. Two passes over one dev dataset therefore produce identical rows, which
 * is what makes a value recorded into a frozen document reproducible by a third
 * party — `EVALUATION_SPEC.md §7`'s own requirement.
 *
 * **The population is `§7`'s and is not taken from the command line.** The
 * caller supplies observations *for a seed*; which seeds are asked for is fixed
 * here by {@link BASELINE_SEEDS}. `metric17BaselineStatistic` refuses any other
 * population a second time, in `packages/eval`, where the frozen text lives.
 */
export async function runBaselinePass(input: BaselinePassInput): Promise<readonly BaselineRow[]> {
  const rows: BaselineRow[] = [];
  for (const agent of input.agents) {
    const samples: BaselineSample[] = [];
    for (const seed of BASELINE_SEEDS) {
      const agentInput: AgentInput = Object.freeze({
        observations: input.observationsForSeed(seed),
        config: Object.freeze({
          llm_mode: input.llmMode,
          strict_replay: input.strictReplay,
          split: BASELINE_SPLIT,
          seed,
        }),
      });
      const run = await agent.run(agentInput);
      if (run.agent_id !== agent.id) {
        throw new CliError(
          `baseline: ${agent.id} returned a run labelled ${run.agent_id}. §7 keys metric 17's ` +
            `baseline per (agent_id, llm_mode); a rate that cannot be attributed to an agent ` +
            `is refused rather than averaged into another agent's row.`,
          EXIT.FAILURE,
        );
      }
      const rate = abstentionRateByValue(run);
      samples.push(
        Object.freeze({
          seed,
          rate: rate.ratio,
          numerator_paise: rate.numerator,
          denominator_paise: rate.denominator,
        }),
      );
    }
    const statistic = metric17BaselineStatistic(samples);
    rows.push(
      Object.freeze({
        agent_id: agent.id,
        llm_mode: input.llmMode,
        mean_bps: statistic.mean_bps,
        stddev_bps: statistic.stddev_bps,
        samples: Object.freeze(samples),
      }),
    );
  }
  return Object.freeze(rows);
}

/**
 * `§7`'s table, rendered for transcription into the document.
 *
 * The five per-seed samples are printed beside the pair because `§7` records the
 * statistic while `§9` step 0 records the sample — *"`abstention_rate_by_value`
 * per `(agent_id, llm_mode, seed)`"* — and a mean whose sample is invisible
 * cannot be checked by the third party `EVALUATION_SPEC.md §7` requires to be
 * able to reproduce it.
 *
 * **Each sample is rendered as its two integer paise fields and NOT as a second
 * spelling of the baseline** (M58). `DATA_MODEL.md §20` makes the integers
 * authoritative and the ratio derived, so `numerator / denominator` is the
 * reproducible form; printing the per-seed ratio, or the mean and σ before
 * rounding, would put an unrounded baseline into a transcript that `§7` would
 * then not match, and *"no second, unrounded baseline exists anywhere in the
 * system"*. The only baseline figures this function emits are the two integers
 * `§7` records.
 */
export function baselineTableLines(rows: readonly BaselineRow[]): readonly string[] {
  const lines: string[] = [
    "PREREGISTRATION.md §7 — metric 17 abstention baseline",
    "(agent_id, llm_mode) -> (mean_bps, stddev_bps)",
    "",
  ];
  for (const row of rows) {
    lines.push(
      `${row.agent_id.padEnd(14)} ${row.llm_mode.padEnd(8)} ` +
        `mean_bps ${String(row.mean_bps).padStart(6)}  ` +
        `stddev_bps ${String(row.stddev_bps).padStart(6)}`,
    );
    for (const sample of row.samples) {
      lines.push(
        `  seed ${String(sample.seed)}  ` +
          `${String(sample.numerator_paise)} / ${String(sample.denominator_paise)} paise`,
      );
    }
  }
  return Object.freeze(lines);
}
