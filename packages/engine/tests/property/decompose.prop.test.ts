import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SEARCH_BOUND,
  decompose,
  observationValue,
  type Candidate,
  type DecomposeInput,
  type Member,
  type Target,
} from "@assay/engine";

import { obsId, reconLine } from "../fixtures.js";

/**
 * `S3` properties.
 *
 * The load-bearing one compares the engine's union-find against a **transitive
 * closure computed independently** in this file. A partition is exactly the kind
 * of thing where an implementation can be self-consistently wrong, so the
 * reference is written by a different method rather than by calling `decompose`.
 */

const T0 = 1_782_900_000;
const DAY = 86_400;

const arbNode = fc.integer({ min: 1, max: 10 });

const arbInput = fc
  .record({
    targetNs: fc.uniqueArray(fc.integer({ min: 100, max: 105 }), { maxLength: 4 }),
    memberNs: fc.uniqueArray(arbNode, { maxLength: 8 }),
    edges: fc.array(
      fc.record({
        t: fc.integer({ min: 100, max: 105 }),
        ms: fc.uniqueArray(arbNode, { maxLength: 4 }),
        // Ids outside the pool stand in for ANCHORED members, which §11 puts in
        // Candidate.member_obs_ids but §5 does not make nodes.
        anchored: fc.uniqueArray(fc.integer({ min: 50, max: 55 }), { maxLength: 2 }),
      }),
      { maxLength: 6 },
    ),
  })
  .map(({ targetNs, memberNs, edges }): DecomposeInput => {
    const targets: Target[] = targetNs.map((n) => ({
      obs_id: obsId(n),
      kind: "settlement" as const,
      amount: 0,
      bank_value_date: null,
      anchored_members: [],
    }));
    const pool: Member[] = memberNs.map((n) =>
      reconLine(n, { amount: n * 1_000, settledAt: T0 + 2 * DAY }),
    );
    const candidates = edges.map((e) => ({
      target_id: obsId(e.t) as string,
      candidate: {
        member_obs_ids: [...e.ms, ...e.anchored].map(obsId),
      } as Candidate,
    }));
    return { targets, pool, candidates };
  });

/** Transitive closure, computed without union-find. */
function referencePartition(input: DecomposeInput): Map<string, string> {
  const poolIds = new Set(input.pool.map((m) => m.obs_id as string));
  const targetIds = new Set(input.targets.map((t) => t.obs_id as string));
  const nodes = [...poolIds, ...targetIds].sort();

  const adj = new Map<string, Set<string>>(nodes.map((n) => [n, new Set([n])]));
  for (const { target_id, candidate } of input.candidates) {
    const clique: string[] = [];
    if (targetIds.has(target_id)) clique.push(target_id);
    for (const id of candidate.member_obs_ids) if (poolIds.has(id)) clique.push(id);
    for (const a of clique) for (const b of clique) adj.get(a)?.add(b);
  }

  // Flood fill from each node; label each component by its smallest member.
  const label = new Map<string, string>();
  for (const start of nodes) {
    if (label.has(start)) continue;
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) continue;
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    const smallest = [...seen].sort()[0] ?? start;
    for (const n of seen) label.set(n, smallest);
  }
  return label;
}

describe("S3 properties", () => {
  it("matches an independently computed transitive closure", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const reference = referencePartition(input);
        const engineLabel = new Map<string, string>();
        for (const c of decompose(input).components) {
          const all = [...c.target_ids, ...c.member_obs_ids].sort();
          const smallest = all[0];
          if (smallest === undefined) continue;
          for (const id of all) engineLabel.set(id, smallest);
        }
        expect([...engineLabel.entries()].sort()).toEqual(
          [...reference.entries()].sort(),
        );
      }),
      { numRuns: 2_000 },
    );
  });

  it("partitions every node exactly once", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const comps = decompose(input).components;
        const seen = comps.flatMap((c) => [...c.target_ids, ...c.member_obs_ids]);
        expect(new Set(seen).size).toBe(seen.length);
        const expected = new Set([
          ...input.pool.map((m) => m.obs_id as string),
          ...input.targets.map((t) => t.obs_id as string),
        ]);
        expect(new Set(seen)).toEqual(expected);
      }),
      { numRuns: 2_000 },
    );
  });

  it("never admits an anchored id as a component member", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const poolIds = new Set(input.pool.map((m) => m.obs_id as string));
        for (const c of decompose(input).components) {
          for (const id of c.member_obs_ids) expect(poolIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("keeps size === member_obs_ids.length and total_value over members only", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const valueOf = new Map(
          input.pool.map((m) => [m.obs_id as string, observationValue(m)]),
        );
        for (const c of decompose(input).components) {
          expect(c.size).toBe(c.member_obs_ids.length);
          let sum = 0;
          for (const id of c.member_obs_ids) sum += valueOf.get(id) ?? 0;
          expect(c.total_value_paise).toBe(sum);
          expect(c.exceeds_k_max).toBe(c.size > SEARCH_BOUND.k_max);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("is independent of candidate, pool and target ordering", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const forward = decompose(input);
        expect(
          decompose({
            targets: [...input.targets].reverse(),
            pool: [...input.pool].reverse(),
            candidates: [...input.candidates].reverse(),
          }),
        ).toEqual(forward);
      }),
      { numRuns: 2_000 },
    );
  });

  it("puts two targets sharing an admissible member in one component", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const poolIds = new Set(input.pool.map((m) => m.obs_id as string));
        const compOf = new Map<string, number>();
        decompose(input).components.forEach((c, i) => {
          for (const id of [...c.target_ids, ...c.member_obs_ids]) compOf.set(id, i);
        });
        // For each pair of candidates that share an in-pool member, their
        // targets must have landed in the same component.
        for (const a of input.candidates) {
          for (const b of input.candidates) {
            const shared = a.candidate.member_obs_ids.some(
              (id) => poolIds.has(id) && b.candidate.member_obs_ids.includes(id),
            );
            if (!shared) continue;
            const ca = compOf.get(a.target_id);
            const cb = compOf.get(b.target_id);
            if (ca === undefined || cb === undefined) continue;
            expect(ca).toBe(cb);
          }
        }
      }),
      { numRuns: 2_000 },
    );
  });
});
