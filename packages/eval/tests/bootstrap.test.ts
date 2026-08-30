import { describe, expect, it } from "vitest";

import {
  BOOTSTRAP_RESAMPLES,
  CONFIDENCE_LEVEL_BPS,
  SEEDS_PER_CONFIGURATION,
  bootstrapMean,
  intervalsOverlap,
  offlineParity,
} from "../src/index.js";

/**
 * `PREREGISTRATION.md §7`'s bootstrap, and `§5.2`'s overlap rule.
 *
 * The resamples are reduced in most cases below because 10,000 x 5 draws per
 * assertion is a machine-speed test wearing a correctness test's clothes; the
 * frozen count is asserted once, on its own, and exercised once end to end.
 */

const SEED = 0x5eed_1234n;

describe("determinism — metric 23 and §5.5's committed-artifact rule", () => {
  it("gives the same interval for the same sample and seed, every time", () => {
    const sample = [10, 12, 9, 15, 11];
    const a = bootstrapMean(sample, SEED, 500);
    const b = bootstrapMean(sample, SEED, 500);
    expect(a).toEqual(b);
  });

  it("gives a different interval for a different seed, so the seed is real", () => {
    // A wider sample than §7's five seeds, deliberately: on five points the
    // resampled distribution is coarse enough that two streams can land on the
    // same 2.5% and 97.5% values, which would make this assertion flaky rather
    // than false. The property under test is that the stream drives the
    // interval, and it is visible where the distribution has resolution.
    const sample = Array.from({ length: 25 }, (_, i) => i * i);
    const a = bootstrapMean(sample, 1n, 2_000);
    const b = bootstrapMean(sample, 2n, 2_000);
    expect(a.mean).toBe(b.mean);
    expect([a.ci_low, a.ci_high]).not.toEqual([b.ci_low, b.ci_high]);
  });

  it("widens the interval as the sample spreads", () => {
    const tight = bootstrapMean([10, 10, 11, 10, 10], SEED, 1_000);
    const wide = bootstrapMean([0, 20, 5, 15, 10], SEED, 1_000);
    expect(wide.ci_high - wide.ci_low).toBeGreaterThan(tight.ci_high - tight.ci_low);
  });
});

describe("the interval itself", () => {
  it("brackets the sample mean", () => {
    const sample = [10, 12, 9, 15, 11];
    const estimate = bootstrapMean(sample, SEED, 1_000);
    expect(estimate.mean).toBe(11.4);
    expect(estimate.ci_low).toBeLessThanOrEqual(estimate.mean);
    expect(estimate.ci_high).toBeGreaterThanOrEqual(estimate.mean);
  });

  it("collapses to a point on a constant sample", () => {
    const estimate = bootstrapMean([7, 7, 7, 7, 7], SEED, 200);
    expect(estimate.ci_low).toBe(7);
    expect(estimate.ci_high).toBe(7);
  });

  it("carries §7's frozen parameters by default", () => {
    const estimate = bootstrapMean([1, 2, 3, 4, 5], SEED);
    expect(estimate.resamples).toBe(BOOTSTRAP_RESAMPLES);
    expect(estimate.resamples).toBe(10_000);
    expect(estimate.confidence_level_bps).toBe(CONFIDENCE_LEVEL_BPS);
    expect(estimate.confidence_level_bps).toBe(9_500);
  });

  it("flags a sample below §7's five-seed floor without refusing to compute", () => {
    // §2 bans a single-run number from the report. Refusing to compute would
    // leave a caller with nothing to show a reviewer; the flag lets a reporter
    // enforce the ban rather than rediscover it.
    expect(bootstrapMean([1, 2, 3], SEED, 100).meets_seed_floor).toBe(false);
    expect(bootstrapMean([1, 2, 3, 4, 5], SEED, 100).meets_seed_floor).toBe(true);
    expect(SEEDS_PER_CONFIGURATION).toBe(5);
  });

  it("refuses an empty sample rather than reporting a fabricated zero", () => {
    expect(() => bootstrapMean([], SEED, 10)).toThrow(/not a result/);
  });
});

describe("§5.2's overlap rule", () => {
  it("calls touching intervals overlapping — a shared endpoint is not separation", () => {
    const a = estimate(1, 0, 5);
    const b = estimate(9, 5, 10);
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("separates disjoint intervals", () => {
    expect(intervalsOverlap(estimate(1, 0, 4), estimate(9, 5, 10))).toBe(false);
  });

  it("is symmetric", () => {
    const a = estimate(1, 0, 6);
    const b = estimate(9, 5, 10);
    expect(intervalsOverlap(a, b)).toBe(intervalsOverlap(b, a));
  });
});

describe("metric 24 — offline_parity (§4.11)", () => {
  it("reports the delta and writes §4.11's conclusion when the CIs overlap", () => {
    // "If the deltas are within overlapping confidence intervals, the correct
    // conclusion -- and the one that must be written -- is that the LLM did not
    // measurably contribute to those metrics on this benchmark."
    const parity = offlineParity("coverage_by_value", estimate(0.9, 0.85, 0.95), estimate(0.88, 0.83, 0.93));
    expect(parity.delta).toBeCloseTo(0.02, 10);
    expect(parity.ci_overlap).toBe(true);
    expect(parity.not_measurably_different).toBe(true);
  });

  it("reports a measurable difference when the intervals are disjoint", () => {
    const parity = offlineParity("net_cost_inr", estimate(100, 90, 110), estimate(300, 280, 320));
    expect(parity.delta).toBe(-200);
    expect(parity.not_measurably_different).toBe(false);
  });
});

function estimate(mean: number, low: number, high: number) {
  return {
    mean,
    ci_low: low,
    ci_high: high,
    n: 5,
    resamples: BOOTSTRAP_RESAMPLES,
    confidence_level_bps: CONFIDENCE_LEVEL_BPS,
    meets_seed_floor: true,
  };
}
