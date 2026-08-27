import { describe, expect, it } from "vitest";

import { Prng, STREAMS, substream, substreamKey } from "../src/prng.js";

const draws = (prng: Prng, n: number): bigint[] => Array.from({ length: n }, () => prng.next());

describe("the vendored xorshift128+", () => {
  it("is a pure function of its seed", () => {
    expect(draws(Prng.fromSeed(1n), 8)).toStrictEqual(draws(Prng.fromSeed(1n), 8));
  });

  it("separates adjacent seeds", () => {
    expect(draws(Prng.fromSeed(1n), 8)).not.toStrictEqual(draws(Prng.fromSeed(2n), 8));
  });

  it("never leaves the 64-bit word range and never produces a float", () => {
    const prng = Prng.fromSeed(0x5eedn);
    for (const word of draws(prng, 2000)) {
      expect(typeof word).toBe("bigint");
      expect(word).toBeGreaterThanOrEqual(0n);
      expect(word).toBeLessThan(1n << 64n);
    }
  });

  it("escapes the all-zero fixed point", () => {
    const prng = Prng.fromSeed(0n);
    expect(new Set(draws(prng, 16).map(String)).size).toBeGreaterThan(1);
  });

  it("consumes exactly one word per bounded draw, whatever the value", () => {
    const prng = Prng.fromSeed(7n);
    for (let i = 0; i < 100; i += 1) prng.below(3);
    expect(prng.draws).toBe(100);
  });

  it("keeps below() inside its bound and rejects a non-positive one", () => {
    const prng = Prng.fromSeed(11n);
    for (let i = 0; i < 5000; i += 1) {
      const value = prng.below(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(() => prng.below(0)).toThrow(RangeError);
    expect(() => prng.below(1.5)).toThrow(RangeError);
  });

  it("permutes without loss and samples in ascending order", () => {
    const prng = Prng.fromSeed(13n);
    const permutation = prng.permutation(50);
    expect([...permutation].sort((a, b) => a - b)).toStrictEqual(Array.from({ length: 50 }, (_, i) => i));
    const sample = prng.sample(50, 7);
    expect(sample).toHaveLength(7);
    expect(sample).toStrictEqual([...sample].sort((a, b) => a - b));
    expect(new Set(sample).size).toBe(7);
    expect(() => prng.sample(5, 6)).toThrow(RangeError);
  });

  it("keeps below() approximately uniform, so no realized count leans on the bias", () => {
    const prng = Prng.fromSeed(17n);
    const counts = new Map<number, number>();
    for (let i = 0; i < 200_000; i += 1) {
      const bucket = prng.below(10);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    expect(counts.size).toBe(10);
    for (const count of counts.values()) expect(Math.abs(count - 20_000)).toBeLessThan(1200);
  });
});

/**
 * Sub-streams are derived by NAME, so inserting a draw in one phase cannot shift
 * another phase's values. Without that, a refactor silently produces a different
 * benchmark (`conventions.ts` `U-SUBSTREAMS`).
 */
describe("named sub-streams", () => {
  it("derives from (seed, family, stream) and nothing else", () => {
    expect(substreamKey(2000, "F01", "amount")).toBe('{"family":"F01","seed":2000,"stream":"amount"}');
    expect(draws(substream(7001, "F01", "amount"), 4)).toStrictEqual(draws(substream(7001, "F01", "amount"), 4));
  });

  it("separates streams, families and seeds pairwise", () => {
    const a = draws(substream(7001, "F01", STREAMS.AMOUNT), 6);
    expect(draws(substream(7001, "F01", STREAMS.METHOD), 6)).not.toStrictEqual(a);
    expect(draws(substream(7001, "F02", STREAMS.AMOUNT), 6)).not.toStrictEqual(a);
    expect(draws(substream(7002, "F01", STREAMS.AMOUNT), 6)).not.toStrictEqual(a);
  });

  it("gives every declared stream a distinct name", () => {
    const names = Object.values(STREAMS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("rejects a negative seed", () => {
    expect(() => substream(-1, "F01", "amount")).toThrow(RangeError);
  });
});
