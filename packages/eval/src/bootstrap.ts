/**
 * Bootstrap confidence intervals — `PREREGISTRATION.md §7`,
 * `EVALUATION_SPEC.md §2` and `§5.2`.
 *
 * `§7` freezes the parameters: *"Seeds per configuration = 5. Bootstrap
 * resamples = 10_000. Confidence level = 95%."* `§2` makes the interval a
 * condition of reporting at all: *"**Every configuration runs on ≥ 5 seeds.**
 * Single-run numbers are banned from the report; **a figure without a confidence
 * interval is not a result.**"* `§5.5` lists *"Reporting a single-seed number
 * without a CI"* first among the forbidden practices.
 *
 * **The resampling is seed-deterministic, and that is not a convenience.**
 * `PREREGISTRATION.md §8` metric 23 requires two runs over identical inputs to
 * agree, and `EVALUATION_SPEC.md §5.5` forbids *"any number in the demo that
 * does not exist in a committed run artifact"*. A bootstrap driven by
 * `Math.random` would put a different interval in the report on every render of
 * the same data. The generator's vendored xorshift128+ is reused rather than
 * re-implemented: `ARCHITECTURE.md §11` fixes it as the project's PRNG,
 * `PREREGISTRATION.md §6.2` places no bar on `packages/eval` importing
 * `packages/generator` — `AL1` binds the engine and the oracle — and a second
 * PRNG would be a second thing to keep deterministic.
 *
 * **This module reports an interval; it does not decide significance.** `§5.2`
 * asks for one judgement — *"Cells whose confidence intervals overlap are
 * explicitly marked as not significantly different — no bolding of a 2% lead
 * over a 15% interval"* — and {@link intervalsOverlap} is that predicate and
 * nothing more. No p-value is computed anywhere in this package, because no
 * section asks for one.
 */

import { Prng } from "@assay/generator";

import { BOOTSTRAP_RESAMPLES, CONFIDENCE_LEVEL_BPS, SEEDS_PER_CONFIGURATION } from "./frozen.js";

/** A point estimate with its interval, as `§5.2` prints every cell. */
export interface Estimate {
  /** The mean over the observed sample. `§5.2`: every cell is `mean ± 95% CI`. */
  readonly mean: number;
  readonly ci_low: number;
  readonly ci_high: number;
  /** Observations the estimate was taken over — the seeds, per `§7`. */
  readonly n: number;
  readonly resamples: number;
  readonly confidence_level_bps: number;
  /**
   * `false` where fewer than `§7`'s five seeds were supplied.
   *
   * `§2` bans a single-run number from the report. The interval is still
   * computed — refusing to compute it would leave a caller with nothing to show
   * a reviewer — but the flag travels with it so a reporter can enforce the ban
   * rather than rediscover it.
   */
  readonly meets_seed_floor: boolean;
}

/**
 * The percentile bootstrap over a sample of per-seed figures.
 *
 * `§7` names the method's two parameters and the quantity — a confidence
 * interval on a mean over seeds — and fixes no variant beyond that. The
 * percentile interval is taken because it is the reading that requires no
 * further assumption: it reports the resampled distribution's own quantiles
 * rather than a normal approximation to them, and `§4` gives several metrics
 * (`suspense_identity_exact`, `largest_exception_in_top_n`) distributions no
 * normal approximation would fit.
 *
 * @param sample the per-seed figures. One entry per seed, `§7` expecting five.
 * @param seed   the resampling seed. Explicit so the interval is reproducible;
 *   `§7` fixes the split seeds and this is not one of them, so it is the
 *   caller's to record in the run manifest.
 * @throws RangeError on an empty sample. A mean over nothing is not zero, and
 *   returning zero would put a fabricated point estimate in the comparison
 *   table.
 */
export function bootstrapMean(
  sample: readonly number[],
  seed: bigint,
  resamples: number = BOOTSTRAP_RESAMPLES,
  confidenceLevelBps: number = CONFIDENCE_LEVEL_BPS,
): Estimate {
  if (sample.length === 0) {
    throw new RangeError(
      "eval: bootstrapMean over an empty sample. EVALUATION_SPEC.md §2 requires >= 5 seeds; " +
        "a mean over zero seeds is not a result.",
    );
  }

  const prng = Prng.fromSeed(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r += 1) {
    let total = 0;
    for (let i = 0; i < sample.length; i += 1) {
      // Draw with replacement, one PRNG word per draw. `Prng.below` consumes a
      // fixed one word per call, so the stream position never depends on the
      // values it produced and a re-run walks the same path.
      total += sample[prng.below(sample.length)] ?? 0;
    }
    means.push(total / sample.length);
  }
  means.sort((a, b) => a - b);

  const alphaBps = (10_000 - confidenceLevelBps) / 2;
  return Object.freeze({
    mean: sample.reduce((a, b) => a + b, 0) / sample.length,
    ci_low: percentile(means, alphaBps),
    ci_high: percentile(means, 10_000 - alphaBps),
    n: sample.length,
    resamples,
    confidence_level_bps: confidenceLevelBps,
    meets_seed_floor: sample.length >= SEEDS_PER_CONFIGURATION,
  });
}

/**
 * The value at `quantileBps` of an ascending array, by nearest-rank.
 *
 * Nearest-rank rather than an interpolating quantile: the resampled values are
 * themselves means of observed figures, and interpolating between two of them
 * would report an interval endpoint that no resample produced. The rank is
 * computed in integer basis points, so the same array yields the same endpoint
 * on every execution (`DATA_MODEL.md §0` rule 5).
 */
function percentile(ascending: readonly number[], quantileBps: number): number {
  const rank = Math.ceil((quantileBps * ascending.length) / 10_000);
  const index = Math.min(Math.max(rank - 1, 0), ascending.length - 1);
  return ascending[index] ?? 0;
}

/**
 * `§5.2`'s overlap test.
 *
 * *"Cells whose confidence intervals overlap are explicitly marked as **not
 * significantly different** — no bolding of a 2% lead over a 15% interval."*
 * Touching intervals overlap: a shared endpoint is not separation.
 */
export function intervalsOverlap(a: Estimate, b: Estimate): boolean {
  return a.ci_low <= b.ci_high && b.ci_low <= a.ci_high;
}

/**
 * Metric 24 — `offline_parity` for one metric (`EVALUATION_SPEC.md §4.11`).
 *
 * *"for each primary metric M: `{ M(--llm=offline), M(--llm=replay), delta, CI
 * overlap }`"*, and `§4.11`'s conclusion rule: *"If the deltas are within
 * overlapping confidence intervals, the correct conclusion — and the one that
 * must be written — is that **the LLM did not measurably contribute** to those
 * metrics on this benchmark."* The field is named for that sentence so a
 * reporter cannot print the delta without the finding.
 */
export interface OfflineParity {
  readonly metric: string;
  readonly replay: Estimate;
  readonly offline: Estimate;
  readonly delta: number;
  readonly ci_overlap: boolean;
  /** `true` when `§4.11`'s conclusion applies: the model did not measurably contribute. */
  readonly not_measurably_different: boolean;
}

/** Compare one metric across the two scored provider modes (`§2`, `§4.11`). */
export function offlineParity(
  metric: string,
  replay: Estimate,
  offline: Estimate,
): OfflineParity {
  const overlap = intervalsOverlap(replay, offline);
  return Object.freeze({
    metric,
    replay,
    offline,
    delta: replay.mean - offline.mean,
    ci_overlap: overlap,
    not_measurably_different: overlap,
  });
}
