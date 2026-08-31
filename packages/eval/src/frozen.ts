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

/**
 * `k_sigma` for the abstention spike detector (`PREREGISTRATION.md §7`,
 * `THREAT_MODEL.md §T9` M2).
 *
 * "`k_sigma` = 3", against a "rolling mean/stddev of abstention-rate-by-value
 * over the DEV split, computed before the seal". Metric 17.
 */
export const K_SIGMA = 3;

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
 *
 * **Nothing below moves with it**, and neither does `metric-list.ts`.
 */
export const SPEC_VERSION = "1.4.27";
