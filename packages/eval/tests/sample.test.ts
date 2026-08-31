import type { Observation } from "@assay/domain";
import { describe, expect, it } from "vitest";

import {
  CONSISTENCY_DRAW_SEED,
  CONSISTENCY_MEMBER_SET_MAX,
  CONSISTENCY_SAMPLE_SIZE,
  DECLARED_SAMPLE_SIZE,
  drawPairs,
} from "../src/index.js";
import { PAY, RFND, SETL, BNK, bankLine, reconLine, settlement } from "./fixtures.js";

/**
 * The `PREREGISTRATION.md §5.3` draw, frozen at spec 1.4.28 (`DATA_MODEL.md
 * §22.2` M44).
 *
 * **What these tests are for.** `§7` now carries the sampler and the seed
 * together, and `AL3` binds them. The value of a frozen parameter is entirely in
 * its being unchangeable, so this suite pins it the way
 * `packages/engine/tests/s2-candidates.test.ts` pins `constraint_set_hash`: a
 * literal, against the specification, so a drift fails a test rather than a
 * review.
 *
 * **The sampler is pinned alongside the seed, deliberately.** A seed selects a
 * path through a PRNG stream and selects **pairs** only with the procedure that
 * consumes it, so a suite that pinned `417203` and left the member-set bound,
 * the draw order or the words-per-pair untested would be pinning nothing.
 *
 * No benchmark data is generated: every dataset below is a hand-built fixture.
 */

const UTR = "1568176960vxp0rj";

/**
 * A hand-built dataset: eight member-eligible rows and three targets.
 *
 * Deliberately small and hand-written. `PREREGISTRATION.md §6.1` bars generating
 * benchmark data before the seal, and the draw's properties — determinism, the
 * member-set bound, the one-word-per-index rule — are properties of the sampler
 * rather than of any particular population.
 */
function dataset(): readonly Observation[] {
  const members: Observation[] = [];
  for (let i = 1; i <= 6; i += 1) {
    members.push(reconLine({ entity: PAY(i), type: "payment", amount: 100_000 * i, fee: 2_400 * i }));
  }
  members.push(reconLine({ entity: RFND(1), type: "refund", amount: 50_000 }));
  members.push(reconLine({ entity: RFND(2), type: "refund", amount: 75_000 }));
  return Object.freeze([
    ...members,
    settlement(SETL(1), 976_000, UTR),
    settlement(SETL(2), 488_000, UTR),
    bankLine(BNK(1), 976_000, UTR),
  ]);
}

const DATASET: readonly Observation[] = dataset();

describe("§7's frozen draw parameters — spec 1.4.28, M44", () => {
  it("pins CONSISTENCY_DRAW_SEED to exactly 417203", () => {
    // AL3 binds it; §L.4 forbids changing it on the basis of an observed result.
    // The literal is the point: a constant compared against itself pins nothing.
    expect(CONSISTENCY_DRAW_SEED).toBe(417_203);
  });

  it("keeps R at 20,000 and ties the declared size to it", () => {
    // §7: "R = 20,000 pairs, UNCHANGED". M44 moved it into §7 and changed no
    // value. DECLARED_SAMPLE_SIZE is defined FROM the frozen constant so the
    // reported "meets the declared sample size" and the draw cannot drift.
    expect(CONSISTENCY_SAMPLE_SIZE).toBe(20_000);
    expect(DECLARED_SAMPLE_SIZE).toBe(CONSISTENCY_SAMPLE_SIZE);
  });

  it("pins the member-set bound to 4", () => {
    expect(CONSISTENCY_MEMBER_SET_MAX).toBe(4);
  });

  it("is not any §6.1 dataset seed, nor derived from one", () => {
    // M44's central rejection: the draw seed is NOT in the generator's seed
    // space. §6.1's declared seeds are 1000-1004, 2000-2004, 9000-9004,
    // 9100-9104; 417203 is none of them and is no arithmetic neighbour of one.
    const declared = [
      ...[0, 1, 2, 3, 4].map((i) => 1000 + i),
      ...[0, 1, 2, 3, 4].map((i) => 2000 + i),
      ...[0, 1, 2, 3, 4].map((i) => 9000 + i),
      ...[0, 1, 2, 3, 4].map((i) => 9100 + i),
    ];
    expect(declared).not.toContain(CONSISTENCY_DRAW_SEED);
    for (const seed of declared) {
      expect(CONSISTENCY_DRAW_SEED).not.toBe(seed);
      expect(CONSISTENCY_DRAW_SEED).not.toBe(seed + 1);
    }
  });
});

describe("the draw defaults to §7's frozen seed", () => {
  it("draws the same pairs with no seed as with the frozen seed", () => {
    const implicit = drawPairs(DATASET, undefined, { size: 64 });
    const explicit = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 64 });
    expect(JSON.stringify(implicit)).toBe(JSON.stringify(explicit));
  });

  it("defaults the sample size to §7's R", () => {
    // The pool is small, so the draw is bounded by R rather than by the data:
    // 20,000 pairs is what §7 asks for and what an unparameterised call makes.
    expect(drawPairs(DATASET)).toHaveLength(CONSISTENCY_SAMPLE_SIZE);
  });
});

describe("the draw is deterministic and independent of the values drawn", () => {
  it("is byte-identical across two calls on the same dataset and seed", () => {
    const a = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 200 });
    const b = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 200 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("consumes one PRNG word per index draw, so a prefix is stable", () => {
    // §7: "exactly ONE word per index draw, so the stream position never depends
    // on the values it produced". If the position depended on a drawn value, a
    // longer draw would not begin with the shorter one -- the property that lets
    // a re-run walk the same path.
    const short = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 50 });
    const long = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 400 });
    expect(JSON.stringify(long.slice(0, 50))).toBe(JSON.stringify(short));
  });

  it("gives a different seed a different sample", () => {
    const frozen = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 200 });
    const other = drawPairs(DATASET, CONSISTENCY_DRAW_SEED + 1, { size: 200 });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(frozen));
  });

  it("uses the same frozen seed whatever dataset it is handed", () => {
    // One seed for every dev dataset (§7). The samples differ because the POOLS
    // differ, never because the seed did -- which is what makes "the same draw
    // on every dataset" checkable rather than asserted.
    const half = DATASET.slice(0, Math.floor(DATASET.length / 2));
    const onFull = drawPairs(DATASET, undefined, { size: 64 });
    const onHalf = drawPairs(half, undefined, { size: 64 });
    expect(JSON.stringify(onHalf)).not.toBe(JSON.stringify(onFull));
    // ...and re-drawing each is still stable.
    expect(JSON.stringify(drawPairs(half, undefined, { size: 64 }))).toBe(JSON.stringify(onHalf));
  });
});

describe("§7's sampler shape", () => {
  it("draws member sets of 1..CONSISTENCY_MEMBER_SET_MAX", () => {
    const pairs = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 500 });
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair.members.length).toBeGreaterThanOrEqual(1);
      expect(pair.members.length).toBeLessThanOrEqual(CONSISTENCY_MEMBER_SET_MAX);
    }
    // The bound is exercised rather than merely respected: a draw that never
    // reached it would leave the constant untested.
    const sizes = new Set(pairs.map((p) => p.members.length));
    expect(sizes.has(CONSISTENCY_MEMBER_SET_MAX)).toBe(true);
  });

  it("leaves anchored and allocated empty — a pair is not a component", () => {
    for (const pair of drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 100 })) {
      expect(pair.anchored).toEqual([]);
      expect(pair.allocated).toEqual([]);
    }
  });

  it("draws members from the whole eligible pool, so inadmissible pairs occur", () => {
    // §5.3: "deliberately including inadmissible ones". A sampler that drew only
    // plausible sets would test the two implementations on the easy half of
    // their domain, so this asserts the pool is not the target's own allocation.
    const pairs = drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 300 });
    const distinctTargets = new Set(pairs.map((p) => p.target.obs_id));
    const distinctMembers = new Set(pairs.flatMap((p) => p.members.map((m) => m.obs_id)));
    expect(distinctTargets.size).toBeGreaterThan(0);
    expect(distinctMembers.size).toBeGreaterThan(1);
  });

  it("never repeats a member inside one pair", () => {
    for (const pair of drawPairs(DATASET, CONSISTENCY_DRAW_SEED, { size: 300 })) {
      const ids = pair.members.map((m) => m.obs_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
