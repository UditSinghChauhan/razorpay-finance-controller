/**
 * The frozen contract, transcribed for the measurement layer.
 *
 * `PREREGISTRATION.md §7` is **FROZEN on commit**, and `DECISION_BRIEF.md §L.4`
 * makes changing any parameter in it a spec amendment rather than a judgement
 * call. `§L.1` rule 12 lists the same figures among "the invariants that may
 * never be violated". This module is the single place those parameters enter
 * this package: nothing else here may carry a rate, a magnitude, a threshold or
 * a count as a literal, so a reviewer checks this file against the
 * specification once rather than auditing every metric for a stray number.
 *
 * **Why a transcription rather than an import.** The same reason
 * `packages/oracle/src/frozen.ts` and `packages/generator/src/frozen.ts` give:
 * two independent transcriptions of one written specification are what a
 * differential test compares, and `C_review` / `C_exception` / the bootstrap
 * parameters exist in **no** package today — this is their first home, not a
 * second copy of one. `BENCHMARK_VERSION` and `GT_VERSION` are deliberately
 * **not** restated here; they live in `packages/generator/src/frozen.ts` and a
 * report quotes them from the benchmark manifest.
 *
 * Every constant below cites the clause it is transcribed from.
 */

import type { AgentId, ScoredLlmMode } from "./agent.js";

/**
 * `C_review` — the analyst cost of one abstention, in paise.
 *
 * `PREREGISTRATION.md §7`: "`C_review` (analyst cost per abstention) =
 * 25_000 paise (₹250)". `§7` states the justification and its limit in the same
 * breath — "approximately 15 minutes of a finance analyst's time at a
 * fully-loaded rate of ~₹1,000/hour. **This is an assumption, not a
 * measurement.**" — which is why {@link C_REVIEW_SWEEP_PAISE} exists.
 */
export const C_REVIEW_PAISE = 25_000;

/**
 * `C_exception` — the analyst cost of one open exception, in paise.
 *
 * `PREREGISTRATION.md §7`: "`C_exception` (analyst cost per open exception) =
 * 50_000 paise (₹500)".
 */
export const C_EXCEPTION_PAISE = 50_000;

/**
 * `EVALUATION_SPEC.md §5.3`'s mandatory `C_review` sensitivity sweep.
 *
 * "₹100 / ₹250 / ₹1,000 … Any conclusion that flips must be flagged as
 * unstable." `§4.5` repeats it and `PREREGISTRATION.md §8` metric 26 carries it
 * as `c_review_sensitivity`. The middle point is {@link C_REVIEW_PAISE} itself,
 * so a sweep that dropped the frozen value would be visible here.
 */
export const C_REVIEW_SWEEP_PAISE = Object.freeze([10_000, 25_000, 100_000] as const);

/**
 * `EVALUATION_SPEC.md §5.3`'s mandatory `τ` sensitivity sweep, in paise.
 *
 * "τ (materiality) | ₹10 / ₹100 / ₹1,000 / ₹10,000 | Prevents τ from being
 * tuned to inflate coverage; shows the `AMBIGUOUS` → `IMMATERIALLY_AMBIGUOUS`
 * shift". These are sweep points for the **floor** of
 * `τ = max(₹100, 10 bps of component value)`; the 10 bps rate does not move.
 */
export const TAU_SWEEP_FLOOR_PAISE = Object.freeze([1_000, 10_000, 100_000, 1_000_000] as const);

/**
 * `ε`, the evidence margin, in integer basis points.
 *
 * `PREREGISTRATION.md §7`: "`epsilon` (evidence margin) = 1500 bps (== 0.15;
 * integer per `DATA_MODEL §0` rule 5 — the VALUE is unchanged, only its
 * encoding)". Restated here because `EVALUATION_SPEC.md §5.1` sweeps it to
 * generate the risk–coverage curve, which is metric 3's own definition.
 */
export const EPSILON_BPS = 1_500;

/**
 * `§5.1`'s risk–coverage sweep bounds, in basis points.
 *
 * "Sweep the abstention aggressiveness (vary ε from 0 to 10_000 bps with τ
 * fixed)." The upper bound is `EVIDENCE_SCORE_MAX_BPS`: a margin at the top of
 * the score range admits nothing.
 */
export const EPSILON_SWEEP_BPS = Object.freeze({ min: 0, max: 10_000 } as const);

/** `EVALUATION_SPEC.md §4.6`: "bin predictions into 10 equal-width bins". */
export const CALIBRATION_BINS = 10;

/** `PREREGISTRATION.md §7`: "Seeds per configuration = 5". */
export const SEEDS_PER_CONFIGURATION = 5;

/** `PREREGISTRATION.md §7`: "Bootstrap resamples = 10_000". */
export const BOOTSTRAP_RESAMPLES = 10_000;

/**
 * `PREREGISTRATION.md §7`: "Confidence level = 95%", as integer basis points.
 *
 * `DATA_MODEL.md §0` rule 5 admits integers only where a rate reaches a hashed
 * or reported artifact, and `EVALUATION_SPEC.md §5.2` puts this figure in every
 * cell of the comparison table.
 */
export const CONFIDENCE_LEVEL_BPS = 9_500;

/** Basis-point denominator. One bp is 1e-4 (`DATA_MODEL.md §0` rule 5). */
export const BPS_DENOMINATOR = 10_000;

// ---------------------------------------------------------------------------
// §5.3's consistency draw — RATIFIED at spec 1.4.28, register row M44
// ---------------------------------------------------------------------------

/**
 * `R` — the `PREREGISTRATION.md §5.3` differential sample size.
 *
 * `§7`: *"`R = 20,000` pairs, UNCHANGED, per (dev, seed) dataset"*. The figure
 * itself predates spec 1.4.28 and is **not** changed by M44; what M44 adds is
 * that `§7` now carries it as a frozen constant rather than only `§5.3` prose,
 * and that `AL3` binds it.
 *
 * `gates/consistency-gate.ts` exports the same figure as `DECLARED_SAMPLE_SIZE`,
 * the name `§5.3`'s *"meets the declared sample size"* reporting uses; that
 * constant is defined from this one so the two cannot drift.
 */
export const CONSISTENCY_SAMPLE_SIZE = 20_000;

/**
 * `CONSISTENCY_DRAW_SEED` — the `§5.3` draw's seed (`§7`, M44).
 *
 * **This value is a RATIFICATION and it is not derivable.** No frozen rule
 * determined it. At least four derivations from a `§6.1` dataset seed were
 * available — `fromSeed(s)`, `fromSeed(s + 1)`, `substream(s, family, stream)`,
 * `fromSeed(sha256(s))` — and **no document selects among them**, so any of them
 * would have been a choice wearing a derivation's clothes. Two further grounds
 * closed that route: `substream(seed, family, stream)` is the **generator's phase
 * namespace** and a gate is not a generation phase, and a `§6.1` seed is fixed by
 * `§7` for **generation**.
 *
 * **What makes it legitimate is when it was fixed, not how it was computed.** It
 * was frozen at a governance gate **before any dev consistency-gate result
 * existed** — `bench/` absent, no dev dataset generated, the gate never run — so
 * nothing observed could have informed it. `AL3` binds it and
 * `DECISION_BRIEF.md §L.4` makes a later change on the basis of an observed
 * result a spec violation rather than a judgement call.
 *
 * **It is one seed for every dev dataset.** The five dev datasets carry different
 * observation pools, so one seed still yields five different samples; what it
 * fixes is the index sequence, which is the most auditable form available.
 *
 * `PREREGISTRATION.md §10` **V25** discloses the cost: a frozen sample is a fixed
 * slice, so *"the gate passed"* means *"passed on this sample"*.
 */
export const CONSISTENCY_DRAW_SEED = 417_203;

/**
 * The `§5.3` draw's member-set bound (`§7`, M44).
 *
 * `§7`: *"member-set size uniformly `1..4`, drawn BEFORE the member indices"*.
 * Frozen **with** the seed rather than after it, because a seed selects a path
 * through a PRNG stream and selects **pairs** only in combination with the
 * procedure consuming it — change this bound and the same seed draws a different
 * sample. That is why `ARCHITECTURE.md §7.3` names *"the sampler and seed"* as
 * one object.
 *
 * Not confusable with a `§7` component bound: `K_max = 22` bounds a
 * **component**, this bounds a **drawn pair**.
 */
export const CONSISTENCY_MEMBER_SET_MAX = 4;

/**
 * `k_sigma` for the abstention spike detector (`PREREGISTRATION.md §7`,
 * `THREAT_MODEL.md §T9` M2).
 *
 * `§7`: *"`k_sigma` = 3"*, against the baseline `§7`'s metric-17 entry records —
 * *"the mean and the SAMPLE standard deviation"* of `abstention_rate_by_value`
 * over the five DEV seeds `2000`-`2004`, *"computed before the seal by `§9` step
 * 0"*. Metric 17.
 *
 * **The word *"rolling"* stood in `§7` through spec 1.4.31 and is RETIRED**
 * (`DATA_MODEL.md §22.2` **M53**): it *"named a window this benchmark has no
 * axis for"*, and **`k_sigma` itself is unchanged at 3**. See
 * {@link METRIC_17_BASELINE}.
 *
 * **`k_sigma` is unchanged again at spec 1.4.36 (`DATA_MODEL.md §22.2` M58),
 * and what M58 fixes is the ENCODING of the two operands beside it**: the
 * baseline pair is integer basis points rounded `round_half_up` once at the end
 * of `§9` step 0, and the comparison
 * `rate > mean_bps / 10_000 + K_SIGMA * stddev_bps / 10_000` puts the run's
 * **full-precision** rate against that **rounded** bar. `EVALUATION_SPEC.md
 * §4.10`'s formula is preserved verbatim. See {@link Metric17BaselineRow} for
 * the rule and `PREREGISTRATION.md §10` **V33** for its residual.
 */
export const K_SIGMA = 3;

// ---------------------------------------------------------------------------
// Metric 17's abstention baseline — RATIFIED at spec 1.4.32, register row M53
// ---------------------------------------------------------------------------

/**
 * The five DEV seeds metric 17's baseline is taken over
 * (`PREREGISTRATION.md §7`, `§6.1`).
 *
 * `§7`'s metric-17 entry: *"population — the five DEV seeds `2000`-`2004`, ONE
 * RATE EACH; `n = 5`"*. **Ratified, not derived** (M53): *"rolling"* named a
 * window this benchmark has no axis for — *"a `(split, seed)` dataset is one
 * period and seeds are not ordered in time"* — and the five declared DEV seeds
 * are *"the only computable reading of `over the DEV split`"*.
 *
 * **Transcribed here rather than imported.** `packages/generator/src/frozen.ts`
 * carries `§6.1`'s split table and `truth.ts` is this package's single
 * `@assay/generator` import site (`tests/discipline.test.ts` counts it), so the
 * seeds enter the measurement layer the way every other `§7` parameter does —
 * as a second transcription of one written specification, which is what a
 * differential test compares. `tests/metrics.test.ts` runs that comparison.
 *
 * `n = 5` is {@link SEEDS_PER_CONFIGURATION} and this list's length; the two
 * agree because `§7` states both, and a baseline taken over any other number of
 * seeds is refused rather than scaled.
 */
export const METRIC_17_BASELINE_SEEDS = Object.freeze([2_000, 2_001, 2_002, 2_003, 2_004] as const);

/**
 * `PREREGISTRATION.md §6.1`'s split for the baseline population.
 *
 * `§7`'s producer row is *"`§9` step 0's NON-SCORED pre-seal DEV baseline
 * pass"*, and `§9` step 0 runs `--split dev`. Held as a constant so the
 * producer names the split from the frozen text rather than from a literal.
 */
export const METRIC_17_BASELINE_SPLIT = "dev" as const;

/**
 * One row of `PREREGISTRATION.md §7`'s metric-17 baseline table.
 *
 * `§7`: *"table — `(agent_id, llm_mode) -> (mean_bps, stddev_bps)`"*. The key is
 * the pair and **not** a `RunKey`: `§7` keys the baseline per `(agent_id,
 * llm_mode)` and M53 gives the reason in both directions — *"`A2-NOABSTAIN`
 * never abstains while `ASSAY` does, so a pooled σ makes the flag structurally
 * non-firing"*, and *"a shared baseline would make one agent's flag depend on
 * another's behaviour"*. `llm_mode` is separated on the same ground, *"`R3`
 * probes resolving abstentions"*. Seed is **not** a key: the five seeds are the
 * sample the statistic is taken over.
 *
 * **Both figures are integer basis points, and the rule is RATIFIED at spec
 * 1.4.36, register row `DATA_MODEL.md §22.2` M58.** `§7` named these two fields
 * and stated **no rounding rule**; two readings were admissible and they
 * disagree numerically, therefore on `abstention_spike_flag`. What M58 freezes:
 *
 * - the pair is **integer basis points** — `DATA_MODEL.md §0` rule 5 binds
 *   *"every dimensionless ratio that … a gate or invariant compares"*, and this
 *   pair **is** the right-hand side of `EVALUATION_SPEC.md §4.10`'s detector;
 *   rule 5's `§20` carve-out is enumerated, closed, and conditioned on values
 *   *"computed at render from the authoritative integer paise fields"*, which a
 *   statistic over five prior runs is not;
 * - the five per-seed rates enter the mean and the sample standard deviation at
 *   **full precision** and are **not** rounded first;
 * - each statistic is converted to bps and rounded **exactly once**, at the end
 *   of `PREREGISTRATION.md §9` step 0's arithmetic;
 * - the mode is **`round_half_up`, ties away from zero**;
 * - `mean_bps` and `stddev_bps` are rounded **independently**, each from its own
 *   full-precision result; `stddev_bps` is never re-derived from `mean_bps` nor
 *   from rounded inputs;
 * - the **detector reads the rounded pair**, against the run's own
 *   **full-precision** rate, with `K_SIGMA` unchanged at 3. **No second,
 *   unrounded baseline exists anywhere in the system.**
 *
 * **This is metric 17's rule and is NOT a claim that half-up is this corpus's
 * only rounding or quantization mode.** `M27` ratified a **floor** for
 * `mode_days`, `EVALUATION_SPEC.md §4.6`'s bin selection **floors**, and
 * remainder distribution **floors**; all are unchanged. What M58 takes from
 * `M27` is its **structure** — `M27` quantized the recorded, compared term while
 * leaving `lag_days` *"the unfloored real quotient"*, and M58 quantizes the
 * recorded baseline pair while leaving the run's rate at full precision.
 *
 * `PREREGISTRATION.md §10` **V33** discloses the cost: a full-precision rate
 * against a quantized bar moves the comparison by up to 2 bps, and a genuinely
 * non-zero σ below 0.5 bps records as 0.
 */
export interface Metric17BaselineRow {
  readonly agent_id: AgentId;
  readonly llm_mode: ScoredLlmMode;
  /**
   * The mean of the five DEV rates, in integer basis points — `round_half_up`,
   * ties away from zero, applied **once** at the end of `§9` step 0 to the
   * full-precision mean (M58).
   */
  readonly mean_bps: number;
  /**
   * Their **sample** standard deviation (`n - 1`), in integer basis points —
   * rounded **independently** of {@link Metric17BaselineRow.mean_bps} and by the
   * same rule, from its own full-precision value (M58).
   */
  readonly stddev_bps: number;
}

/**
 * `PREREGISTRATION.md §7`'s metric-17 baseline table, transcribed — **and it is
 * EMPTY, which is the frozen state and not an omission.**
 *
 * `§7`: *"recorded here once step 0 has run and **EMPTY until then**"*. `§9`
 * step 0 — the non-scored pre-seal DEV pass — has not been taken: `bench/` is
 * absent, no dataset has been generated and no agent has been run, so `§7`
 * carries no row and neither does this transcription. Filling it is a
 * **governance** act taken against `§7` first, exactly as
 * {@link CONSISTENCY_DRAW_SEED} was: the document is the record, and this array
 * is the second transcription of it.
 *
 * **The authority relationship is RATIFIED at spec 1.4.36, register row
 * `DATA_MODEL.md §22.2` M58**, which `M53` chartered for `§7` alone and left
 * open for this constant:
 *
 * - `PREREGISTRATION.md §7`'s metric-17 table is the **AUTHORITATIVE
 *   human-readable baseline record**;
 * - this constant is its **EXECUTABLE TRANSCRIPTION** — not a second,
 *   independently measured baseline, and not an alternative authority;
 * - **before `§9` step 0 it is intentionally empty (`[]`)**, which is the frozen
 *   pre-measurement state and not an omission;
 * - **after** step 0 measures the five DEV rates, the exact
 *   `(agent_id, llm_mode, mean_bps, stddev_bps)` rows are transcribed into `§7`
 *   **and** into this constant;
 * - both writes happen **after step 0 and BEFORE `§9` step 1's tag**, so the tag
 *   covers the source that carries the measured baseline and step 8's *"no code
 *   changes between 6 and 8"* holds over it;
 * - **no runtime scoring may recompute the baseline** — `§7`'s consumer row:
 *   *"No baseline is computed at scoring time on any split"*;
 * - **any divergence between `§7` and this constant is a SEAL /
 *   REPRODUCIBILITY FAILURE**, on the same footing as `§9` step 5's other seal
 *   failures. The integer encoding M58 ratifies is what makes that check exact
 *   and therefore performable;
 * - **nothing may be guessed, prefilled or populated before step 0**, and **no
 *   generated JSON or data file** may be introduced as another evidence path —
 *   a second path to a figure `§7` alone is authoritative for is what `AL8`,
 *   `DECISION_BRIEF.md §A.31` and `M56` all refuse.
 *
 * `frozen.ts` is the home for the same reason this module's header gives: it is
 * *"the single place those parameters enter this package"*, and
 * {@link CONSISTENCY_DRAW_SEED} is the standing precedent for a `§7` value that
 * no frozen rule derives, fixed at a governance gate before any result existed.
 *
 * **It is deliberately NOT a `BenchmarkManifest` field.** `§7`: *"It is NOT a
 * BenchmarkManifest field: `DATA_MODEL.md §18`'s shape stays closed."* M53
 * lists that reading under **Rejected**, so no manifest carries it and no
 * digest covers it.
 *
 * **Nothing computes a row at scoring time.** `§7`'s consumer row: *"TEST
 * scoring READS this table. No baseline is computed at scoring time on any
 * split, and no run contributes to the baseline it is judged against."* An
 * absent row is therefore metric 17 UNAVAILABLE with its reason, never a
 * `spike_flag` of `false` — a detector that reports *"clean"* because it has no
 * baseline is the broken detector `EVALUATION_SPEC.md §4.10` names.
 */
export const METRIC_17_BASELINE: readonly Metric17BaselineRow[] = Object.freeze([]);

/**
 * `queue_top_n` (`PREREGISTRATION.md §7`).
 *
 * "20 (value-ranked; M1 requires the largest exception to always appear within
 * it)". Metric 19 `largest_exception_in_top_n` "must be `true` on **every** run
 * including the adversarial split" (`EVALUATION_SPEC.md §4.10`).
 */
export const QUEUE_TOP_N = 20;

/**
 * The close policy's frozen ratio, in basis points
 * (`RECONCILIATION_SPEC.md §10.3`, `PREREGISTRATION.md §7`).
 *
 * "`max_unresolved_ratio_bps` = 50 // 0.005 == 0.5% of batch value". Restated
 * here because `EVALUATION_SPEC.md §4.9` requires `close_threshold_paise` to be
 * **recomputable from the close report alone**, which means the scorer must
 * hold the rule and not merely echo the producer's answer.
 *
 * `max_unresolved_abs` is **deleted** (`§7`) and has no constant here.
 */
export const MAX_UNRESOLVED_RATIO_BPS = 50;

/**
 * The superseded benchmark v1.0.0 close policy's absolute arm, in paise.
 *
 * `EVALUATION_SPEC.md §4.9` requires `period_status_legacy_policy` —
 * "the same run's outcome under the benchmark v1.0.0 policy
 * `min(0.005 × batch, ₹50,000)`" — "Reported for every seeded run. Never a
 * gate. Labelled `EXPLORATORY`". Computing it needs the deleted bound, so the
 * bound is retained **here, named as legacy**, and nothing else may read it.
 * `PREREGISTRATION.md §7` deletes it from the *policy*, not from the history the
 * report is required to print.
 */
export const LEGACY_MAX_UNRESOLVED_ABS_PAISE = 5_000_000;

/**
 * The specification version this package is written against.
 *
 * Bumped with the documents, exactly as `packages/generator/src/frozen.ts` and
 * `packages/oracle/src/frozen.ts` do.
 *
 * **1.4.23 -> 1.4.26, and what was re-checked to say so.** The constant read
 * 1.4.23 while the documents read 1.4.26. Each intervening version, and what it
 * required here:
 *
 *   - **1.4.24 (M38)** — three properties of the PG-side recon report. `AL8`
 *     keeps that artifact on the probe channel, which is the **agent's**;
 *     `EVALUATION_SPEC.md §4.13` has this package read back the probe **count**
 *     as a value on `AgentRun`, which it already does. Nothing here moves.
 *   - **1.4.25 (M39, M40)** — `PREREGISTRATION.md §7` gains the frozen
 *     `A3-NOLLM` probe priority policy; `DATA_MODEL.md §13` gains a fourth
 *     certificate reason. **Neither reaches this file's scope.** The policy is
 *     an ordering and a selection rule rather than "a rate, a magnitude, a
 *     threshold or a count", it is implemented in `packages/llm`, and this
 *     package may import neither `packages/llm` nor `packages/probe`. No metric
 *     on `PREREGISTRATION.md §8`'s list of 28 reads a certificate reason. Every
 *     **numeric** `§7` parameter transcribed below is unchanged by that
 *     amendment.
 *   - **1.4.26 (M41)** — a threats-to-validity **disclosure**
 *     (`PREREGISTRATION.md §10` V23): `§H` tier H1's affirmative claim is
 *     withdrawn because `R3`'s choice set is a singleton on the conforming
 *     v1.0.0 population. **No metric definition changes, none is added and none
 *     is removed** — `metric-list.ts` stays at 28 and keeps its numbering,
 *     `metric 24` `offline_parity` keeps its stated purpose, and
 *     `abstentions resolved per probe spent` is **not** added and remains
 *     `EXPLORATORY` (`EVALUATION_SPEC.md §4.13`).
 *
 * **Nothing below moves with it**, and neither does `metric-list.ts`.
 * `BENCHMARK_VERSION` and `GT_VERSION` are deliberately not restated here, as
 * this module's header says; they live in `packages/generator/src/frozen.ts`.
 *
 *   - **1.4.27 (M42, M43)** — M43 names `apps/cli` the executor of
 *     `PREREGISTRATION.md §5.3`'s gates and keeps `gates/consistency-gate.ts`
 *     **here**, unchanged and still holding *"no logic other than the differential
 *     test"* (`DECISION_BRIEF.md §L.1` rule 3). What is new is a **caller**, not a
 *     capability: `apps/cli` now supplies the pairs that module has always required,
 *     and `gates/sample.ts` draws them. **The gate never receives ground truth** and
 *     gains no parameter for it. M42 is an artifact-layout ratification and reaches
 *     no metric. **No metric definition changes, none is added and none is removed**
 *     — `metric-list.ts` stays at 28 and keeps its numbering, and
 *     `oracle_gate.json` is a build product rather than a metric.
 *   - **1.4.28 (M44)** — the `PREREGISTRATION.md §5.3` consistency draw is
 *     **frozen into `§7`** and bound by `AL3`: `R = 20,000` unchanged and now
 *     per `(dev, seed)`, `CONSISTENCY_DRAW_SEED = 417203`, the `1..4` member-set
 *     bound, the two pools, the empty `anchored`/`allocated`, the draw order and
 *     one PRNG word per index draw. **This one DOES reach this file's scope**,
 *     and is the first `§7` parameter added here since the module was written:
 *     the three constants above are its transcription, and `gates/sample.ts`
 *     carries no literal of its own. **No metric definition changes, none is
 *     added and none is removed** — `metric-list.ts` stays at 28, and the gate is
 *     not a metric.
 *
 *   - **1.4.29 (M45-M48)** — three contract defects closed before any DEV scored
 *     result existed. **None of them is a `§7` parameter and none reaches this
 *     file.** M47 moves the seven agent implementations from
 *     `DECISION_BRIEF.md §K`'s `packages/eval/src/agents/` to
 *     `apps/cli/src/agents/`, where they are constructed and **injected** — this
 *     package gains no import, `agent.ts` is unchanged, `AgentInput` keeps its
 *     two fields and `report/` does not move. M48 adds `run-key.ts`, which
 *     records `(agent_id, split, seed, llm_mode)` as the scored unit and holds no
 *     path and no threshold. M45 and M46 are `PREREGISTRATION.md §9`'s and reach
 *     `apps/cli` alone. **No metric definition changes, none is added and none is
 *     removed** — `metric-list.ts` stays at 28 — and `BENCHMARK_VERSION` does NOT
 *     move, staying 1.0.7.
 *
 *   - **1.4.30 (M49)** — `DATA_MODEL.md §17.1.1`'s *"the settlement it is
 *     allocated to"* is fixed as the settlement of the **allocation under
 *     evaluation**. **It is not a `§7` parameter and reaches no constant in this
 *     file.** Its consequence for this package is entirely on the **values**
 *     metrics take, never on their definitions: it makes
 *     `RECONCILIATION_SPEC.md §6`'s `AMBIGUOUS` reachable, so abstention-bearing
 *     metrics stop reading a structurally empty population, and it restores the
 *     `P2` bank leg on solved allocations, which `metric 13` and `§4.4`'s
 *     `balance_harm_inr` project. **No metric definition changes, none is added
 *     and none is removed** — `metric-list.ts` stays at 28 and keeps its
 *     numbering — `§5.4`'s thirteen obligations and `§5.5`'s forbidden practices
 *     are untouched, and no figure exists to move: `bench/` is absent and no
 *     scored run has been produced. **`BENCHMARK_VERSION` moves 1.0.7 -> 1.0.8**,
 *     that constant being `packages/generator`'s.
 *
 *   - **1.4.31 (M50)** — `EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` row is
 *     amended: it removes stage `S5`'s **evaluation** of the allocation-scoped
 *     invariants `I1`-`I8` (never "evaluate and ignore the failures"), and the
 *     expectations *"trial balance breaks"* and *"runs end `BLOCKED`"* are
 *     **withdrawn**. **It is not a `§7` parameter and reaches no constant in this
 *     file.** Nothing here is scoped to an agent: `agent.ts`'s `AGENTS` table,
 *     `AGENT_IDS`, `tier0Agents()` and `run-key.ts`'s `(agent_id, split, seed,
 *     llm_mode)` identity are unchanged, `A1-NOVALIDATE` keeps its row and its
 *     Tier-0 membership, and `metrics/close-loop.ts` keeps computing
 *     `period_status` the same way for every agent -- the amendment removes the
 *     expectation that one agent would end `BLOCKED`, and adds **no exclusion
 *     rule** for the scorer or the aggregator to implement. **No metric
 *     definition changes, none is added and none is removed** -- `metric-list.ts`
 *     stays at 28 and keeps its numbering, metric 11's distribution and metric
 *     14's *"`BLOCKED` must be 0"* included -- `§5.4`'s thirteen obligations and
 *     `§5.5`'s forbidden practices are untouched, and no figure exists to move.
 *     **`BENCHMARK_VERSION` does NOT move, staying 1.0.8**: no conforming agent's
 *     postings change, the only arm the row settles having never produced one.
 *
 *   - **1.4.32 (M51-M54)** -- the four evaluation-procedure gaps closed before
 *     generation. **This is the first amendment since 1.4.28 that reaches this
 *     package's scope, and it reaches it in three places without moving a constant
 *     below.** M51 fixes the sweep contract: the `EVALUATION_SPEC.md §5.1` epsilon
 *     grid is `{0, 500, ..., 10_000}` bps -- 21 uniform points with **1500 among
 *     them** -- so `EPSILON_SWEEP_BPS`'s two endpoints are joined by a frozen
 *     discretization in `PREREGISTRATION.md §7`; a sweep point is an evaluation
 *     **inside one scored unit**, keyed `(RunKey, parameter_name, parameter_value)`,
 *     so **`run-key.ts` is unchanged and `RunKey` stays `(agent_id, split, seed,
 *     llm_mode)`**; the epsilon and tau sweeps are `apps/cli`'s, this package
 *     integrating points it is handed exactly as `metrics/risk-coverage.ts` already
 *     says of itself; and `C_review` and `C_exception` are swept **together** over
 *     `C_REVIEW_SWEEP_PAISE`'s three points, which `metrics/sensitivity.ts`'s
 *     `cReviewSweep` does not yet do. M52 defines metrics 15 and 16's two
 *     populations, which `metrics/robustness.ts` already takes as caller-supplied
 *     sets and `truth.ts` will project from `GroundTruth.degradations`. M53 defines
 *     `abstention_rate_by_value` on `EVALUATION_SPEC.md §4.1`'s denominator and
 *     freezes metric 17's baseline into `§7`, which `metrics/abstention.ts` already
 *     takes as an argument rather than deriving. M54 records metric **10** as **not
 *     computable on the frozen population**. **No metric definition changes in the
 *     sense that matters here and none is added or removed** -- `metric-list.ts`
 *     stays at 28 and keeps its numbering; what metrics 15, 16 and 17 gain is the
 *     **universe** their unchanged formulas quantify over, the benchmark-v1.0.3
 *     treatment of metric 13. `TAU_SWEEP_FLOOR_PAISE`, `C_REVIEW_SWEEP_PAISE`,
 *     `EPSILON_SWEEP_BPS`, `EPSILON_BPS`, `C_REVIEW_PAISE`, `C_EXCEPTION_PAISE`,
 *     `K_SIGMA` and every other constant below are **unchanged**, the amendment
 *     adding declarations to `§7` and revising none. **`BENCHMARK_VERSION` moves
 *     1.0.8 -> 1.0.9**, that constant being `packages/generator`'s, and `GT_VERSION`
 *     stays 1.1.0. **The implementation this row authorises is deliberately not in
 *     this commit** (`DECISION_BRIEF.md §A.39`, `§I`).
 *
 *   - **1.4.33 (M55)** -- metric 15's per-case `balance_harm`, and the gap M52 left
 *     behind it. M52 supplied metrics 15 and 16's two **populations** and closed by
 *     saying that `EVALUATION_SPEC.md §4.8`'s formulas are unchanged and "what is
 *     supplied is the universe"; metric 15's **numerator** is "injected cases with
 *     `balance_harm > 0`", which names a **per-case** harm, while `§4.4(a)` defines
 *     `balance_harm_inr` as a **run-level aggregate** whose absolute value sits
 *     OUTSIDE the per-account difference and which therefore does not decompose --
 *     `|a1+a2 - t1-t2| != |a1-t1| + |a2-t2|`. **M55 ratifies one decomposition**: for
 *     injected observation `o`, `§4.4(a)`'s account-level absolute-difference sum with
 *     BOTH projections restricted to the journal lines whose `source_entity_id` equals
 *     `o`'s own business identifier (`DATA_MODEL.md §16`, through `§12`/M28's
 *     one-to-one relation), Suspense excluded and the covered-set scope unchanged. The
 *     **agent-side** restriction is part of that ratification, `§4.4(a)` keying
 *     `proj_agent` by decision state alone. A reference-kind case (`§10.1`) or one
 *     whose key falls outside `§16`'s `source_entity_id` grammar (an `order_...`)
 *     contributes **0 and stays in the denominator**. The leave-one-out marginal and
 *     substituting `§4.4(b)`'s `misdirected_value_inr` are **rejected and preserved as
 *     rejected**. The per-case figures do **not** sum to `balance_harm_inr`, which
 *     `PREREGISTRATION.md §10` **V30** declares. **`metrics/robustness.ts` is NOT
 *     touched by this amendment and metric 15 stays unwired**; `truth.ts`'s M52
 *     projection is unchanged; `metric-list.ts` stays at 28 and keeps its numbering;
 *     **metric 16 is untouched**, formula and both populations; `run-key.ts` is
 *     unchanged and `RunKey` stays `(agent_id, split, seed, llm_mode)`; `EPSILON_BPS`,
 *     `C_REVIEW_PAISE`, `C_EXCEPTION_PAISE`, `K_SIGMA`, `TAU_SWEEP_FLOOR_PAISE`,
 *     `C_REVIEW_SWEEP_PAISE`, `EPSILON_SWEEP_BPS` and every other constant below are
 *     **unchanged**, the amendment adding one declaration to `§7` and revising none.
 *     **`BENCHMARK_VERSION` moves 1.0.9 -> 1.0.10**, that constant being
 *     `packages/generator`'s, and `GT_VERSION` stays 1.1.0. **The implementation this
 *     row authorises is deliberately not in this commit** (`DECISION_BRIEF.md §A.40`,
 *     `§I`).
 *
 *   - **1.4.34 (M56)** -- `PREREGISTRATION.md §6.2` `AL5` is an EMISSION rule, and the
 *     SCORER reads ground truth under `--sealed`. `AL5` refuses to "print, log or
 *     write any ground-truth field; only aggregate metrics are emitted", and reading
 *     is none of those three -- so `§9` step 7's `assay bench --sealed` reads
 *     `ground_truth.jsonl` and emits aggregates, which is what `EVALUATION_SPEC.md §2`
 *     has always required of a scored unit on BOTH splits. `§5.3`'s access
 *     restatement is narrowed to the two readers it was written against, the `§5.3`
 *     completeness gate and the `§9` seal, neither of which `§9` runs sealed; their
 *     withdrawal is re-grounded on a FLAG REFUSAL rather than a read refusal. **This
 *     package is the constrained party's opposite and always was:** `AL1` and `AL2`
 *     bind `packages/engine` and `packages/oracle` BY NAME, and `truth.ts` has
 *     recorded since it landed that "neither rule binds the scorer, and neither
 *     could". No permission is created; one already granted is stated. **`truth.ts`
 *     is NOT touched by this amendment**, nor is `metrics/robustness.ts`, nor any
 *     metric module: `ScoringTruth`, `DegradationPopulations`, `projectTruth`,
 *     `trueTargetByEntity` and `INJECTING_OPS` are unchanged, `metric-list.ts` stays
 *     at 28 and keeps its numbering, `run-key.ts` is unchanged and `RunKey` stays
 *     `(agent_id, split, seed, llm_mode)`, and `EPSILON_BPS`, `C_REVIEW_PAISE`,
 *     `C_EXCEPTION_PAISE`, `K_SIGMA`, `TAU_SWEEP_FLOOR_PAISE`, `C_REVIEW_SWEEP_PAISE`,
 *     `EPSILON_SWEEP_BPS` and every other constant below are unchanged -- the
 *     amendment adds NO `§7` entry and revises none. What it restores is the
 *     PRODUCIBILITY on the sealed path of metrics 2, 3, 5, 6, 7, 8, 15, 16 and 26's
 *     cost half. Four alternatives are rejected and preserved as rejected: a fifth
 *     `ReadZone`, a second scoring pass or step 7b, copying or re-keying the truth
 *     artifact, and emitting `0.0` for an unavailable metric. **`BENCHMARK_VERSION`
 *     moves 1.0.10 -> 1.0.11**, that constant being `packages/generator`'s, and
 *     `GT_VERSION` stays 1.1.0. The residual is `PREREGISTRATION.md §10` **V31**.
 *     **The implementation this row authorises is deliberately not in this commit**
 *     (`DECISION_BRIEF.md §A.41`, `§I`).
 *
 *   - **1.4.35 (M57)** -- metric 7 `ece` gains the correctness semantics
 *     `EVALUATION_SPEC.md §4.6` never stated. `§4.6` froze the formula, the ten
 *     equal-width bins, the reliability diagram and the ε-gap scope, and named
 *     `accuracy(bin)` WITHOUT DEFINING what makes a committed decision right; two
 *     readings were admissible and they disagree on a decision asserting a SUBSET of
 *     the true members, so the choice is RATIFIED on the M35/M49/M50/M55/M56
 *     precedent. **Population:** the scored unit's committed decisions carrying a
 *     non-null score -- `RECONCILIATION_SPEC.md §6` step 3's DISCRIMINATED branch,
 *     the one accept in which the ε-gap decided the gate. **Prediction:** one
 *     committed decision = one prediction, so `N` counts gate events. **Binned
 *     value:** `Δs`, `DATA_MODEL.md §13`'s `evidence_score_gap_bps`. **Correctness:**
 *     SET EQUALITY of the decision's asserted `(target_id, entity_id)` edges against
 *     the true allocation's edges for that same target -- M35's "allocation identity"
 *     applied as a comparison rather than as a sort key. A strict subset is
 *     incorrect, a superset is incorrect, and `N = 0` publishes the metric
 *     UNAVAILABLE with its reason, never `0.0`. **`metrics/calibration.ts` is NOT
 *     touched and never was the gap:** it takes `ScoredPrediction { score_bps,
 *     correct }` and owns `CALIBRATION_BINS`, `BPS_DENOMINATOR`, the bin edges and
 *     the empty-bin rule, all of which this row confirms unchanged -- what was
 *     missing is the INPUT. `truth.ts`'s `ScoringTruth`/`TrueEdge`, `run.ts`'s
 *     `CommittedDecision`, `metrics/match.ts` and `EVALUATION_SPEC.md §4.2` entire
 *     are likewise unchanged, metric 5 remaining the partial-credit metric;
 *     `metric-list.ts` stays at 28 and keeps its numbering, `run-key.ts` is unchanged
 *     and `RunKey` stays `(agent_id, split, seed, llm_mode)`, and `EPSILON_BPS`,
 *     `CALIBRATION_BINS`, `C_REVIEW_PAISE`, `C_EXCEPTION_PAISE`, `K_SIGMA`,
 *     `TAU_SWEEP_FLOOR_PAISE`, `C_REVIEW_SWEEP_PAISE`, `EPSILON_SWEEP_BPS` and every
 *     other constant below are unchanged. Six alternatives are rejected and preserved
 *     as rejected: calibrating `evidence_score_bps` itself, including UNIQUE
 *     decisions with an invented score, including IMMATERIALLY_AMBIGUOUS decisions,
 *     edge-level / partial-credit correctness, the edge as the prediction unit, and
 *     leaving the metric unresolved. **`BENCHMARK_VERSION` moves 1.0.11 -> 1.0.12**,
 *     that constant being `packages/generator`'s, and `GT_VERSION` stays 1.1.0. The
 *     residual is `PREREGISTRATION.md §10` **V32**. **The implementation this row
 *     authorises is deliberately not in this commit** (`DECISION_BRIEF.md §A.42`,
 *     `§I`).
 *
 *   - **1.4.36 (M58)** -- metric 17's baseline gains the ENCODING and the RECORD
 *     RELATIONSHIP `PREREGISTRATION.md §7` left open at M53. `§7` named the fields
 *     `mean_bps`/`stddev_bps` and stated NO ROUNDING RULE; two readings were
 *     admissible and they disagree numerically, therefore on
 *     `abstention_spike_flag`, so the choice is RATIFIED on the
 *     M27/M35/M45/M49/M50/M55/M56/M57 precedent. **Encoding:** integer basis
 *     points; the five per-seed rates enter the mean and SAMPLE stddev at FULL
 *     PRECISION; each statistic is converted to bps and rounded EXACTLY ONCE at the
 *     end of `§9` step 0 by `round_half_up`, ties away from zero; the two figures
 *     round INDEPENDENTLY; and the detector reads the ROUNDED pair against the run's
 *     FULL-PRECISION rate. **No second, unrounded baseline exists.** **Record:**
 *     `§7` is AUTHORITATIVE and {@link METRIC_17_BASELINE} is its EXECUTABLE
 *     TRANSCRIPTION -- empty before step 0, written into both after step 0 and
 *     BEFORE step 1's tag, never recomputed at scoring time, never a
 *     `BenchmarkManifest` field, and any divergence a SEAL FAILURE. **This is
 *     metric 17's rule and NOT a claim that half-up is this corpus's only rounding
 *     mode:** M27's `mode_days` floors, `metrics/calibration.ts`'s bin selection
 *     floors, and both stand unchanged. **`K_SIGMA` is unchanged at 3 and
 *     `EVALUATION_SPEC.md §4.10`'s formula is preserved verbatim**, as are M53's
 *     rate, population, statistic, scope, producer and consumer;
 *     {@link METRIC_17_BASELINE_SEEDS}, {@link METRIC_17_BASELINE_SPLIT},
 *     {@link SEEDS_PER_CONFIGURATION}, {@link BPS_DENOMINATOR} and every other
 *     constant below are unchanged; `metric-list.ts` stays at 28 and keeps its
 *     numbering; `run-key.ts` is unchanged. Five alternatives are rejected and
 *     preserved as rejected: full-precision internals with `_bps` as display, a
 *     generated baseline file, a runtime JSON file read by the scorer, a
 *     `BenchmarkManifest` field, and a `false` flag or zero baseline where `§7`
 *     records no row. **`BENCHMARK_VERSION` moves 1.0.12 -> 1.0.13**, that constant
 *     being `packages/generator`'s, and `GT_VERSION` stays 1.1.0. The residual is
 *     `PREREGISTRATION.md §10` **V33**. **The implementation this row authorises is
 *     deliberately not in this commit** (`DECISION_BRIEF.md §A.43`, `§I`), and that
 *     follow-up MUST replace `metrics/abstention.ts`'s FALSE claim that half-up is
 *     the corpus's only rounding mode with wording grounded in this row.
 *
 * **Nothing below moves with it**, and neither does `metric-list.ts`.
 */
export const SPEC_VERSION = "1.4.36";
