import { describe, expect, it } from "vitest";

import {
  decompose,
  observationValue,
  type Candidate,
  type DecomposeInput,
  type Member,
  type Target,
} from "@assay/engine";

import { adjustment, obsId, reconLine } from "./fixtures.js";

/**
 * Stage `S3` (`RECONCILIATION_SPEC.md §5`).
 *
 * **The expected partition is computed independently**, by `expectedPartition`
 * below — a plain transitive closure over the candidate cliques, written
 * without union-find and without reading the implementation. Asserting the
 * engine's union-find against its own union-find would test nothing.
 */

const T0 = 1_782_900_000;
const DAY = 86_400;

const target = (n: number, kind: "settlement" | "bank_line" = "settlement"): Target => ({
  obs_id: obsId(n),
  kind,
  amount: 0,
  bank_value_date: null,
  anchored_members: [],
});

const cand = (targetN: number, memberNs: readonly number[]) => ({
  target_id: obsId(targetN) as string,
  candidate: { member_obs_ids: memberNs.map(obsId) } as Candidate,
});

const member = (n: number, opts: Parameters<typeof reconLine>[1] = {}): Member =>
  reconLine(n, { settledAt: T0 + 2 * DAY, ...opts });

/**
 * An INDEPENDENT partition, computed by repeated closure rather than union-find.
 *
 * Start with one group per node, then repeatedly merge any two groups that share
 * a node with the same candidate clique, until nothing changes. Quadratic and
 * obviously correct — the point is that it shares no code path with `decompose`.
 */
function expectedPartition(input: DecomposeInput): string[][] {
  const poolIds = new Set(input.pool.map((m) => m.obs_id as string));
  const targetIds = new Set(input.targets.map((t) => t.obs_id as string));
  let groups: string[][] = [...poolIds, ...targetIds].sort().map((id) => [id]);

  const cliques = input.candidates.map(({ target_id, candidate }) => {
    const nodes: string[] = [];
    if (targetIds.has(target_id)) nodes.push(target_id);
    for (const id of candidate.member_obs_ids) if (poolIds.has(id)) nodes.push(id);
    return nodes;
  });

  let changed = true;
  while (changed) {
    changed = false;
    for (const clique of cliques) {
      const touching = groups.filter((g) => g.some((id) => clique.includes(id)));
      if (touching.length <= 1) continue;
      const merged = [...new Set(touching.flat())].sort();
      groups = groups.filter((g) => !touching.includes(g));
      groups.push(merged);
      changed = true;
    }
  }
  return groups.map((g) => [...g].sort()).sort((a, b) => (a[0] ?? "") < (b[0] ?? "") ? -1 : 1);
}

/** The engine's partition, flattened to the same shape for comparison. */
const enginePartition = (input: DecomposeInput): string[][] =>
  decompose(input)
    .components.map((c) => [...c.target_ids, ...c.member_obs_ids].sort())
    .sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1));

describe("§14.1 — value(observation)", () => {
  it("takes amount for a recon_line, payment or refund", () => {
    expect(observationValue(member(1, { amount: 70_000 }))).toBe(70_000);
    expect(
      observationValue(member(2, { type: "refund", amount: 9_000, debit: 9_000, credit: 0 })),
    ).toBe(9_000);
  });

  it("takes the NON-ZERO of debit/credit for an adjustment, never amount", () => {
    // §14.1: "Not `amount`. I3 declares no amount identity for adjustment rows."
    const credited = adjustment(1, { settledAt: T0 + 2 * DAY });
    const withCredit = {
      ...credited,
      payload: { ...credited.payload, amount: 999_999, debit: 0, credit: 4_200 },
    } as unknown as Member;
    expect(observationValue(withCredit)).toBe(4_200);

    const withDebit = {
      ...credited,
      payload: { ...credited.payload, amount: 999_999, debit: 3_100, credit: 0 },
    } as unknown as Member;
    expect(observationValue(withDebit)).toBe(3_100);
  });
});

describe("the §5 graph — nodes are unanchored observations and targets", () => {
  it("agrees with an independently computed partition on a shared-member merge", () => {
    // Two targets, one member each, but they SHARE a member => one component.
    const input: DecomposeInput = {
      targets: [target(100), target(101)],
      pool: [member(1), member(2), member(3)],
      candidates: [cand(100, [1, 2]), cand(101, [2, 3])],
    };
    expect(enginePartition(input)).toEqual(expectedPartition(input));
    const c = decompose(input).components;
    expect(c).toHaveLength(1);
    expect(c[0]?.target_ids).toEqual([obsId(100), obsId(101)]);
    expect(c[0]?.member_obs_ids).toEqual([obsId(1), obsId(2), obsId(3)]);
  });

  it("does NOT merge disconnected groups", () => {
    const input: DecomposeInput = {
      targets: [target(100), target(101)],
      pool: [member(1), member(2)],
      candidates: [cand(100, [1]), cand(101, [2])],
    };
    expect(enginePartition(input)).toEqual(expectedPartition(input));
    const c = decompose(input).components;
    expect(c).toHaveLength(2);
    // Each component holds exactly one target and its one member — the pairing
    // matters, not merely the counts.
    expect(c.map((x) => [x.target_ids, x.member_obs_ids])).toEqual([
      [[obsId(100)], [obsId(1)]],
      [[obsId(101)], [obsId(2)]],
    ]);
  });

  it("gives a degree-zero unanchored observation its own component", () => {
    // §5: the nodes ARE the unanchored observations, not the ones with an edge.
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1), member(9)],
      candidates: [cand(100, [1])],
    };
    expect(enginePartition(input)).toEqual(expectedPartition(input));
    const lone = decompose(input).components.find((c) =>
      c.member_obs_ids.includes(obsId(9)),
    );
    expect(lone?.target_ids).toEqual([]);
    expect(lone?.size).toBe(1);
  });

  it("gives a target with no admissible candidate its own component", () => {
    const input: DecomposeInput = {
      targets: [target(100), target(101)],
      pool: [member(1)],
      candidates: [cand(100, [1])],
    };
    const lonely = decompose(input).components.find((c) =>
      c.target_ids.includes(obsId(101)),
    );
    expect(lonely?.member_obs_ids).toEqual([]);
    expect(lonely?.size).toBe(0);
    expect(lonely?.total_value_paise).toBe(0);
  });

  it("handles a member-only input with no targets at all", () => {
    const input: DecomposeInput = {
      targets: [],
      pool: [member(1), member(2)],
      candidates: [],
    };
    expect(enginePartition(input)).toEqual(expectedPartition(input));
    expect(decompose(input).components).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(decompose({ targets: [], pool: [], candidates: [] }).components).toEqual([]);
  });
});

describe("anchored observations are never component members", () => {
  it("filters an anchored id out of the candidate clique", () => {
    // §11: Candidate.member_obs_ids is the WHOLE allocation, anchored included.
    // obs 9 is anchored: it is NOT in the pool, so it is not a §5 node.
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1)],
      candidates: [cand(100, [1, 9])],
    };
    const c = decompose(input).components;
    expect(c).toHaveLength(1);
    expect(c[0]?.member_obs_ids).toEqual([obsId(1)]);
    expect(c[0]?.member_obs_ids).not.toContain(obsId(9));
    expect(c[0]?.size).toBe(1);
  });

  it("never lets an anchored member merge two otherwise-separate components", () => {
    // If anchored ids were treated as nodes, obs 9 would bridge 100 and 101.
    const input: DecomposeInput = {
      targets: [target(100), target(101)],
      pool: [member(1), member(2)],
      candidates: [cand(100, [1, 9]), cand(101, [2, 9])],
    };
    expect(enginePartition(input)).toEqual(expectedPartition(input));
    expect(decompose(input).components).toHaveLength(2);
  });

  it("excludes anchored value from total_value_paise", () => {
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1, { amount: 60_000 })],
      candidates: [cand(100, [1, 9])],
    };
    // Only the unanchored node contributes; §11 scopes the sum to member_obs_ids.
    expect(decompose(input).components[0]?.total_value_paise).toBe(60_000);
  });
});

describe("Component.member_obs_ids is NOT Candidate.member_obs_ids", () => {
  it("is a strict subset whenever any member is anchored", () => {
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1)],
      candidates: [cand(100, [1, 9])],
    };
    const candidateMembers = input.candidates[0]?.candidate.member_obs_ids ?? [];
    const componentMembers = decompose(input).components[0]?.member_obs_ids ?? [];
    expect(candidateMembers).toEqual([obsId(1), obsId(9)]);
    expect(componentMembers).toEqual([obsId(1)]);
    expect(componentMembers.length).toBeLessThan(candidateMembers.length);
  });
});

describe("total_value_paise and size", () => {
  it("sums §14.1 values over member_obs_ids only, excluding targets", () => {
    const adj = adjustment(3, { settledAt: T0 + 2 * DAY });
    const withCredit = {
      ...adj,
      payload: { ...adj.payload, amount: 999_999, debit: 0, credit: 5_000 },
    } as unknown as Member;
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1, { amount: 70_000 }), member(2, { amount: 30_000 }), withCredit],
      candidates: [cand(100, [1, 2, 3])],
    };
    const c = decompose(input).components[0];
    // 70_000 + 30_000 + 5_000 (the adjustment's credit, NOT its 999_999 amount)
    expect(c?.total_value_paise).toBe(105_000);
    expect(c?.size).toBe(3);
    expect(c?.size).toBe(c?.member_obs_ids.length);
  });

  it("keeps size === member_obs_ids.length on every component", () => {
    const input: DecomposeInput = {
      targets: [target(100), target(101)],
      pool: [member(1), member(2), member(3), member(7)],
      candidates: [cand(100, [1, 2]), cand(101, [3])],
    };
    for (const c of decompose(input).components) {
      expect(c.size).toBe(c.member_obs_ids.length);
    }
  });
});

describe("K_max — §4.3", () => {
  it("flags a component past K_max = 22 without truncating it", () => {
    const pool = Array.from({ length: 23 }, (_, i) => member(i + 1));
    const input: DecomposeInput = {
      targets: [target(100)],
      pool,
      candidates: [cand(100, pool.map((_, i) => i + 1))],
    };
    const c = decompose(input).components[0];
    expect(c?.size).toBe(23);
    expect(c?.exceeds_k_max).toBe(true);
    expect(c?.member_obs_ids).toHaveLength(23);
  });

  it("does not flag a component exactly at K_max", () => {
    const pool = Array.from({ length: 22 }, (_, i) => member(i + 1));
    const input: DecomposeInput = {
      targets: [target(100)],
      pool,
      candidates: [cand(100, pool.map((_, i) => i + 1))],
    };
    expect(decompose(input).components[0]?.exceeds_k_max).toBe(false);
  });
});

describe("bank_line targets", () => {
  it("appear as nodes but attract no members — §11.1 spec 1.4.4", () => {
    const input: DecomposeInput = {
      targets: [target(100, "bank_line")],
      pool: [member(1)],
      candidates: [], // S2 returns the empty candidate set for a bank_line target
    };
    const c = decompose(input).components;
    expect(c).toHaveLength(2);
    const bank = c.find((x) => x.target_ids.includes(obsId(100)));
    expect(bank?.member_obs_ids).toEqual([]);
    expect(bank?.size).toBe(0);
  });
});

describe("F05 / dangling-id shapes reach S3 as ordinary nodes", () => {
  it("keeps an F08 line whose settlement_id was dropped in the pool", () => {
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1, { settlementId: null })],
      candidates: [],
    };
    const lone = decompose(input).components.find((c) => c.size === 1);
    expect(lone?.member_obs_ids).toEqual([obsId(1)]);
    expect(lone?.target_ids).toEqual([]);
  });

  it("does not invent a node for a member F05 withheld", () => {
    // The withheld constituent has no observation, so it is no node at all.
    const input: DecomposeInput = {
      targets: [target(100)],
      pool: [member(1)],
      candidates: [cand(100, [1])],
    };
    const all = decompose(input).components.flatMap((c) => c.member_obs_ids);
    expect(all).toEqual([obsId(1)]);
  });
});

describe("determinism", () => {
  const input = (): DecomposeInput => ({
    targets: [target(100), target(101)],
    pool: [member(1), member(2), member(3), member(8)],
    candidates: [cand(100, [1, 2]), cand(101, [2, 3])],
  });

  it("is independent of candidate array order", () => {
    const forward = decompose(input());
    const reversed = decompose({ ...input(), candidates: [...input().candidates].reverse() });
    expect(reversed).toEqual(forward);
  });

  it("is independent of pool and target order", () => {
    const forward = decompose(input());
    const shuffled = decompose({
      targets: [...input().targets].reverse(),
      pool: [...input().pool].reverse(),
      candidates: input().candidates,
    });
    expect(shuffled).toEqual(forward);
  });

  it("is repeatable", () => {
    expect(decompose(input())).toEqual(decompose(input()));
  });

  it("returns frozen arrays", () => {
    const c = decompose(input()).components;
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c[0]?.member_obs_ids)).toBe(true);
    expect(Object.isFrozen(c[0]?.target_ids)).toBe(true);
  });
});
