import type { Observation } from "@assay/domain";
import {
  METRIC_17_BASELINE_SEEDS,
  METRIC_17_BASELINE_SPLIT,
  SCORED_LLM_MODES,
  abstentionRateByValue,
  metric17BaselineStatistic,
  tier0Agents,
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
 * The one Tier-0 agent `§9` step 0 cannot run — `DECISION_BRIEF.md §F` **F2**.
 *
 * `§C` **T0-10**: *"`B2-LLM-DIRECT` **conditional on F2** — it needs a live
 * credential to populate its replay cache"*, and F2 is `Unresolved` with a
 * pre-declared response that *"`B2-LLM-DIRECT` was not built (deferred to
 * H2)"*. `agents/b2.ts` raises `AgentUnavailableError` accordingly and **is not
 * changed here**: the deferral is F2's and is applied, not reopened.
 */
export const BASELINE_DEFERRED_AGENT: AgentId = "B2-LLM-DIRECT";

/**
 * The agents `PREREGISTRATION.md §9` **step 0** actually runs — F2's semantics
 * applied to `§9`'s *"it runs every agent"*.
 *
 * **Derived, not hand-listed.** `EVALUATION_SPEC.md §2`'s protocol loop is
 * `tier0Agents()` — which is where `B1-GREEDY`'s exclusion already lives as data
 * (`inTier0: false`) — and this list removes the one further agent `§9` step 0's
 * own commentary names as deferred:
 *
 * > *"Where `DECISION_BRIEF.md §F` F2 is unresolved the `replay` rows are
 * > deferred exactly as F2 already defers `B2-LLM-DIRECT` and metric 3's replay
 * > column, and metric 17 reads UNAVAILABLE for the absent rows; F2's semantics
 * > are APPLIED, not reopened."*
 *
 * So the five are `ASSAY`, `B0-IDONLY`, `A1-NOVALIDATE`, `A2-NOABSTAIN` and
 * `A3-NOLLM`, in `AGENT_IDS` order. **This is not a narrowing of `§9`**: it is
 * `§9`'s own sentence, evaluated. Nothing here decides that `B2` is deferred —
 * `§C` T0-10 and `§F` F2 decided it, `b2.ts` records it, and `§9` step 0 cites it.
 *
 * **Why the step-0 pass names them rather than taking `--agents all`.**
 * `selectAgents("all")` is `tier0Agents()` and therefore includes
 * `B2-LLM-DIRECT`, whose `run` raises. Step 0 must produce `§7`'s table or
 * nothing: a pass that raised partway would leave the operator holding rows for
 * some agents and an exception for another, and `§7` has no state for a
 * half-measured table. The selection is therefore checked **before the first
 * agent runs**, and `all` is refused with these five named.
 */
export const BASELINE_AGENT_IDS: readonly AgentId[] = Object.freeze(
  tier0Agents()
    .map((declaration) => declaration.id)
    .filter((id) => id !== BASELINE_DEFERRED_AGENT),
);

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
  "a BenchmarkManifest field. TRANSCRIBE THE ABSENCES TOO, INTO §7 ALONE: the keys listed " +
  "above as carrying no pair are recorded in §7's human-readable table with their reason, and " +
  "are NOT written into METRIC_17_BASELINE, which transcribes PAIRS and has no field for a " +
  "reason. An absent key reads metric17BaselineFor(...) === null, which is §7's UNAVAILABLE — " +
  "never a pair of zeros and never a spike_flag of false. §7 is therefore COMPLETE about what " +
  "it does not hold, and the constant stays an exact transcription of what it does.";

/**
 * Why `§7` records no pair for one `(agent_id, llm_mode)` key.
 *
 * `§9` step 0's own commentary supplies both standing reasons and requires that
 * they be **applied** rather than reopened, and `§7`'s table has exactly one
 * state for a key it holds no pair for — *"metric 17 reads UNAVAILABLE for the
 * absent rows"*. What these constants add is that the absence is **written
 * down**: a `§7` table that is silently short of rows and one whose missing rows
 * are named with their reason are the same table to a machine and different
 * records to a reader, and `EVALUATION_SPEC.md §5.4` item 5 requires the
 * difference to be legible.
 */
export const BASELINE_DEFERRED_BY_F2_AGENT =
  "DEFERRED — DECISION_BRIEF.md §C T0-10 / §F F2: this baseline is conditional on a metered " +
  "credential to populate its replay cache, F2 records that credential as Unresolved, and F2's " +
  "pre-declared response defers the agent to tier H2 rather than weakening it. PREREGISTRATION.md " +
  "§9 step 0 applies that disposition and does not reopen it.";

/** `§9` step 0's replay column, absent for the reason F2 already states. */
export const BASELINE_DEFERRED_BY_F2_REPLAY =
  "DEFERRED — DECISION_BRIEF.md §F F2: no recorded replay cache exists at this checkpoint " +
  "(EVALUATION_SPEC.md §2 populates it from one recorded --llm=<live provider> --record pass, " +
  "which F2 leaves untaken), so §9 step 0's replay rows are deferred exactly as F2 already " +
  "defers B2-LLM-DIRECT and metric 3's --llm=replay column. NOTHING is fabricated in their " +
  "place: no cache is invented, no row is guessed, and metric 17 reads UNAVAILABLE for the key.";

/** A key this invocation simply did not cover — one pass covers one `llm_mode`. */
export const BASELINE_NOT_TAKEN_THIS_INVOCATION =
  "NOT TAKEN BY THIS INVOCATION — spec 1.4.36 (M58): §9 step 0's \"under each llm_mode\" " +
  "constrains the COMPLETENESS of §7's table and NOT the number of process invocations, so the " +
  "operator takes step 0 once per llm_mode. This key is recordable and is not yet recorded; it " +
  "is NOT deferred, and §7 stays incomplete until the remaining invocation is taken.";

/** One `(agent_id, llm_mode)` key `§7` carries no pair for, and why. */
export interface BaselineDeferral {
  readonly agent_id: AgentId;
  readonly llm_mode: ScoredLlmMode;
  /** One of the three constants above — a frozen sentence, never a computed one. */
  readonly reason: string;
}

/**
 * The `(agent_id, llm_mode)` keys this pass produced **no pair** for, each with
 * its reason — `§7`'s table completed in the only way an unmeasured key can be.
 *
 * **The key space is `§7`'s own**: `EVALUATION_SPEC.md §2`'s Tier-0 agents
 * (`B1-GREEDY` already excluded as data) crossed with `SCORED_LLM_MODES`, which
 * is exactly the set `§7` says a complete table has *"a row per `(agent_id,
 * llm_mode)`"* over. Subtracting the rows this pass measured leaves the keys a
 * reader would otherwise have to notice were missing.
 *
 * **Three reasons, and they are different facts.** `B2-LLM-DIRECT` is deferred
 * by `§C` T0-10 and `§F` F2 under **every** mode; the `replay` column is
 * deferred by F2 for as long as no recorded cache exists; and a key that is
 * merely on the other side of this invocation's `llm_mode` is **not deferred at
 * all** — M58 lets the operator take step 0 once per mode, and `§7` is simply
 * incomplete until the second pass is taken. Collapsing the three into one
 * *"missing"* would report a procedural gap as a governance deferral.
 *
 * **Nothing here is a measurement and nothing here is transcribed into
 * `METRIC_17_BASELINE`.** That constant is `§7`'s executable transcription of
 * its **pairs**; a deferral carries no pair, has no field to carry one in
 * ({@link Metric17BaselineRow} is the two integers and the key), and reaches the
 * scorer as `metric17BaselineFor(...) === null`, which is `§7`'s UNAVAILABLE. The
 * deferral block belongs to `§7`'s **human-readable** half alone.
 *
 * @param replayRecorded whether a recorded replay cache exists — the operational
 *   form of F2's condition. `false` at this checkpoint; the parameter exists so
 *   that resolving F2 changes the reason rather than this function.
 */
export function baselineDeferrals(
  rows: readonly BaselineRow[],
  replayRecorded: boolean,
): readonly BaselineDeferral[] {
  const measured = new Set(rows.map((row) => `${row.agent_id}\u0000${row.llm_mode}`));
  const deferrals: BaselineDeferral[] = [];
  for (const declaration of tier0Agents()) {
    for (const llmMode of SCORED_LLM_MODES) {
      if (measured.has(`${declaration.id}\u0000${llmMode}`)) continue;
      deferrals.push(
        Object.freeze({
          agent_id: declaration.id,
          llm_mode: llmMode,
          reason:
            declaration.id === BASELINE_DEFERRED_AGENT
              ? BASELINE_DEFERRED_BY_F2_AGENT
              : llmMode === "replay" && !replayRecorded
                ? BASELINE_DEFERRED_BY_F2_REPLAY
                : BASELINE_NOT_TAKEN_THIS_INVOCATION,
        }),
      );
    }
  }
  return Object.freeze(deferrals);
}

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
 * The one deterministic column layout `§7`'s rows are rendered in — the field
 * order `DATA_MODEL.md §22.2` **M58** states, and fixed widths so that two
 * passes render the same bytes.
 *
 * **The field order is the frozen text's, not a choice made here.** `§7`'s table
 * row reads *"`(agent_id, llm_mode) -> (mean_bps, stddev_bps)`"* and M58's
 * transcription row reads *"the exact `(agent_id, llm_mode, mean_bps,
 * stddev_bps)` rows are transcribed into THIS table and into that constant"*.
 * What was never stated is the **rendering** — a mapping arrow is not a column
 * layout — and a transcription whose layout is decided per invocation is one a
 * reviewer cannot diff against `§7`. So the layout is fixed here, once, and
 * pinned by a test.
 *
 * **The widths are constants and not derived from the data.** A width computed
 * from the longest value in the batch would make one agent's figure change
 * another agent's line, so a re-render after a corrected row would rewrite rows
 * that did not move. `A1-NOVALIDATE` and `B2-LLM-DIRECT` are the longest ids at
 * 13 characters, `offline` the longest mode at 7, and `10_000` bps the largest
 * figure `metric17BaselineFor`'s range check admits at 5 — every column is wider
 * than its widest possible value plus the space that separates it from its
 * neighbour, so nothing is ever truncated, abutted or pushed out of alignment.
 */
const AGENT_COL = 15;
const MODE_COL = 9;
const MEAN_COL = 10;
const STDDEV_COL = 12;

/** One rendered row, in M58's field order and nothing else's. */
function layoutRow(
  agentId: string,
  llmMode: string,
  meanBps: string,
  stddevBps: string,
): string {
  return (
    agentId.padEnd(AGENT_COL) +
    llmMode.padEnd(MODE_COL) +
    meanBps.padStart(MEAN_COL) +
    stddevBps.padStart(STDDEV_COL)
  );
}

/** The header naming M58's four fields, aligned over the columns they name. */
export const BASELINE_TABLE_HEADER = layoutRow(
  "agent_id",
  "llm_mode",
  "mean_bps",
  "stddev_bps",
);

/**
 * `§7`'s table, rendered for transcription into the document.
 *
 * The five per-seed samples are printed beside the pair because `§7` records the
 * statistic while `§9` step 0 records the sample — *"`abstention_rate_by_value`
 * per `(agent_id, llm_mode, seed)`"* — and a mean whose sample is invisible
 * cannot be checked by the third party `EVALUATION_SPEC.md §7` requires to be
 * able to reproduce it. They are rendered **below** the table rather than
 * interleaved between its rows, so that the block a reviewer diffs against `§7`
 * is contiguous and holds nothing but `§7`'s rows.
 *
 * **Each sample is rendered as its two integer paise fields and NOT as a second
 * spelling of the baseline** (M58). `DATA_MODEL.md §20` makes the integers
 * authoritative and the ratio derived, so `numerator / denominator` is the
 * reproducible form; printing the per-seed ratio, or the mean and σ before
 * rounding, would put an unrounded baseline into a transcript that `§7` would
 * then not match, and *"no second, unrounded baseline exists anywhere in the
 * system"*. The only baseline figures this function emits are the two integers
 * `§7` records.
 *
 * **The keys carrying no pair are rendered too**, from
 * {@link baselineDeferrals}, because a `§7` table that is short of rows and one
 * whose absences are named are the same table to `metric17BaselineFor` — which
 * answers `null` either way — and different records to the reader `§7` exists
 * for. No figure is invented for them and none is transcribed into
 * `METRIC_17_BASELINE`, which carries pairs alone.
 */
export function baselineTableLines(
  rows: readonly BaselineRow[],
  deferrals: readonly BaselineDeferral[] = [],
): readonly string[] {
  const lines: string[] = [
    "PREREGISTRATION.md §7 — metric 17 abstention baseline",
    "table  (agent_id, llm_mode) -> (mean_bps, stddev_bps)",
    "",
    BASELINE_TABLE_HEADER,
  ];
  for (const row of rows) {
    lines.push(
      layoutRow(row.agent_id, row.llm_mode, String(row.mean_bps), String(row.stddev_bps)),
    );
  }

  if (deferrals.length > 0) {
    lines.push("");
    lines.push(
      "keys carrying NO pair — §7 records none and metric 17 reads UNAVAILABLE for each:",
    );
    // Grouped by reason, in a fixed reason order, so the block stays readable
    // as the key count grows and so two passes with the same coverage render
    // the same bytes. A reason is printed once; the keys under it are in the
    // same (agent, mode) order the table itself uses.
    for (const reason of [
      BASELINE_DEFERRED_BY_F2_AGENT,
      BASELINE_DEFERRED_BY_F2_REPLAY,
      BASELINE_NOT_TAKEN_THIS_INVOCATION,
    ]) {
      const under = deferrals.filter((deferral) => deferral.reason === reason);
      if (under.length === 0) continue;
      lines.push("");
      lines.push(`  ${reason}`);
      for (const deferral of under) {
        lines.push(`    ${deferral.agent_id.padEnd(AGENT_COL)}${deferral.llm_mode}`);
      }
    }
  }

  lines.push("");
  lines.push("samples — abstention_rate_by_value per (agent_id, llm_mode, seed), as §20's");
  lines.push("integer paise fields; the ratio is derived and is never a second baseline:");
  for (const row of rows) {
    for (const sample of row.samples) {
      lines.push(
        `${row.agent_id.padEnd(AGENT_COL)}${row.llm_mode.padEnd(MODE_COL)}` +
          `seed ${String(sample.seed)}  ` +
          `${String(sample.numerator_paise)} / ${String(sample.denominator_paise)} paise`,
      );
    }
  }
  return Object.freeze(lines);
}
