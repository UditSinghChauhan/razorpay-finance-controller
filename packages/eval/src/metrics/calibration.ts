/**
 * Calibration — `EVALUATION_SPEC.md §4.6`. Metric 7.
 *
 * > *"For the score used by the abstention gate, bin predictions into 10
 * > equal-width bins and compute expected calibration error:*
 * >
 * > `ECE = Σ_bins (n_bin / N) × | accuracy(bin) − mean_score(bin) |`
 * >
 * > *Plus a reliability diagram in the report."*
 *
 * **What is being calibrated, stated exactly.** `§4.6`: *"ASSAY's *primary*
 * abstention path is evidential (the second-best certificate), not score-based;
 * calibration is reported for the **ε-gap component**, which is the one place a
 * soft score influences the gate."* So the population is the committed decisions
 * whose gate consulted a score, and a decision whose `score_bps` is `null` is
 * outside it — `B0-IDONLY` joins on an identifier and `A2-NOABSTAIN` has no
 * gate, so a required score would have to be invented for both.
 *
 * **The score is integer basis points, and the bins are too.**
 * `DATA_MODEL.md §11` makes `evidence_score_bps` *"an integer in basis points
 * rather than a float because the ε-margin test is a comparison whose outcome
 * must be identical across two executions"*, and `§0` rule 5 admits integers
 * only where a rate reaches a hashed or reported artifact. Binning on the
 * integer keeps a boundary case on the same side of a bin edge in every run,
 * which `PREREGISTRATION.md §8` metric 23 requires of anything a report prints.
 */

import { BPS_DENOMINATOR, CALIBRATION_BINS } from "../frozen.js";

/** One prediction: the gate's score, and whether the decision it admitted was right. */
export interface ScoredPrediction {
  /** The ε-gap score in integer basis points, `0..10_000`. */
  readonly score_bps: number;
  /** Whether the committed allocation matched ground truth. */
  readonly correct: boolean;
}

/** One bin of the reliability diagram (`§4.6`). */
export interface ReliabilityBin {
  /** Inclusive lower edge, in basis points. */
  readonly lower_bps: number;
  /** Exclusive upper edge, except on the last bin, which is inclusive. */
  readonly upper_bps: number;
  readonly count: number;
  /** `accuracy(bin)`, as a rate in `0..1`. */
  readonly accuracy: number;
  /** `mean_score(bin)`, as a rate in `0..1`. */
  readonly mean_score: number;
}

/** Metric 7, with the diagram `§4.6` requires beside it. */
export interface CalibrationReport {
  readonly ece: number;
  readonly bins: readonly ReliabilityBin[];
  /** Predictions scored. `0` where no gate consulted a score. */
  readonly n: number;
}

/**
 * Compute `ECE` and the reliability diagram.
 *
 * Ten equal-width bins over the full `0..10_000` bps score range, not over the
 * observed range: `§4.6` says *"10 equal-width bins"* of a score whose range
 * `DATA_MODEL.md §11` fixes, and binning over the observed spread would make the
 * bin edges depend on the run and the metric incomparable across agents —
 * which `EVALUATION_SPEC.md §2` forbids by requiring *"same input, same
 * scorer"*.
 *
 * The top edge is inclusive on the last bin only, so a perfect `10_000` bps
 * score lands in the tenth bin rather than in an eleventh that does not exist.
 *
 * **Decision enabled** (`§4.6`): *"Does a score of 0.9 mean 90%? An
 * uncalibrated score cannot justify a threshold, and a threshold that cannot be
 * justified is a magic number."*
 */
export function calibration(
  predictions: readonly ScoredPrediction[],
  binCount: number = CALIBRATION_BINS,
): CalibrationReport {
  const width = BPS_DENOMINATOR / binCount;
  const buckets: { count: number; correct: number; scoreSum: number }[] = [];
  for (let i = 0; i < binCount; i += 1) buckets.push({ count: 0, correct: 0, scoreSum: 0 });

  for (const prediction of predictions) {
    const raw = Math.floor(prediction.score_bps / width);
    const index = Math.min(Math.max(raw, 0), binCount - 1);
    const bucket = buckets[index];
    // Unreachable after the clamp above; a missing bucket would otherwise drop
    // a prediction from N while leaving it out of every bin, which understates
    // ECE rather than reporting a fault.
    if (bucket === undefined) continue;
    bucket.count += 1;
    bucket.scoreSum += prediction.score_bps;
    if (prediction.correct) bucket.correct += 1;
  }

  const n = predictions.length;
  let ece = 0;
  const bins: ReliabilityBin[] = buckets.map((bucket, index) => {
    const accuracy = bucket.count === 0 ? 0 : bucket.correct / bucket.count;
    const meanScore =
      bucket.count === 0 ? 0 : bucket.scoreSum / bucket.count / BPS_DENOMINATOR;
    if (bucket.count > 0) ece += (bucket.count / n) * Math.abs(accuracy - meanScore);
    return Object.freeze({
      lower_bps: index * width,
      upper_bps: (index + 1) * width,
      count: bucket.count,
      accuracy,
      mean_score: meanScore,
    });
  });

  return Object.freeze({ ece, bins: Object.freeze(bins), n });
}
