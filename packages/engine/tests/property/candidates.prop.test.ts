import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SETTLEMENT_WINDOW,
  evaluate,
  generateCandidates,
  parentOrderIdResolver,
  type EvaluationContext,
  type Member,
} from "@assay/engine";

import { obsId, reconLine } from "../fixtures.js";

/**
 * `S2` properties. `DECISION_BRIEF.md §L.3` makes property tests on every
 * invariant a package owns a completeness condition.
 *
 * The pair that matters most is **soundness and completeness of generation
 * against evaluation**: every candidate `generateCandidates` returns must be
 * one `evaluate` admits, and every member subset `evaluate` admits must be one
 * `generateCandidates` returned. Written as two directions of one relation, a
 * bug that drops or invents a candidate cannot hide in either.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;

const arbMember = fc
  .record({
    n: fc.integer({ min: 1, max: 12 }),
    amount: fc.integer({ min: 1, max: 6 }),
    fee: fc.integer({ min: 0, max: 2 }),
    lagDays: fc.integer({ min: 0, max: 9 }),
    onHold: fc.boolean(),
    settled: fc.boolean(),
    type: fc.constantFrom("payment" as const, "refund" as const),
  })
  .map(({ n, amount, fee, lagDays, onHold, settled, type }) =>
    reconLine(n, {
      amount: amount * 1_000,
      fee: fee * 100,
      type,
      createdAt: T0,
      settledAt: settled ? T0 + lagDays * DAY : null,
      onHold,
    }),
  );

const arbPool = fc.array(arbMember, { maxLength: 8 }).map((ms) => {
  const seen = new Set<string>();
  return ms.filter((m) => (seen.has(m.obs_id) ? false : (seen.add(m.obs_id), true)));
});

function ctx(amount: number, anchored: readonly Member[] = []): EvaluationContext {
  return {
    target: {
      obs_id: obsId(999),
      kind: "settlement",
      amount,
      bank_value_date: null,
      anchored_members: anchored,
    },
    parentOrderId: parentOrderIdResolver([]),
    allocated: new Set(),
  };
}

/** Every non-empty subset, in a fixed order. */
function subsets(pool: readonly Member[]): Member[][] {
  const out: Member[][] = [];
  const sorted = [...pool].sort((a, b) => (a.obs_id < b.obs_id ? -1 : 1));
  for (let mask = 1; mask < 1 << sorted.length; mask += 1) {
    const s: Member[] = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const m = sorted[i];
      if (m !== undefined && (mask & (1 << i)) !== 0) s.push(m);
    }
    out.push(s);
  }
  return out;
}

const key = (ids: readonly string[]) => [...ids].sort().join(",");

describe("S2 properties", () => {
  it("evaluate is independent of member order", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        if (pool.length < 2) return;
        const c = ctx(amount);
        const a = evaluate(pool, c);
        const b = evaluate([...pool].reverse(), c);
        expect(b.admissible).toBe(a.admissible);
        expect(b.failed).toEqual(a.failed);
        expect(b.coSettlementCoherent).toBe(a.coSettlementCoherent);
      }),
      { numRuns: 2_000 },
    );
  });

  it("admissible implies no clause FAILED and coherence holds", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const a = evaluate(pool, ctx(amount));
        if (!a.admissible) return;
        expect(a.failed).toEqual([]);
        expect(a.coSettlementCoherent).toBe(true);
        for (const c of a.clauses) expect(c.verdict).not.toBe("FAIL");
      }),
      { numRuns: 2_000 },
    );
  });

  it("admissible implies C6 ties out EXACTLY — zero tolerance", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const a = evaluate(pool, ctx(amount));
        if (!a.admissible || pool.length === 0) return;
        let credit = 0;
        let debit = 0;
        for (const m of pool) {
          credit += m.payload.credit;
          debit += m.payload.debit;
        }
        expect(credit - debit).toBe(amount);
      }),
      { numRuns: 2_000 },
    );
  });

  it("admissible implies every member's lag is inside C4's closed window", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const a = evaluate(pool, ctx(amount));
        if (!a.admissible || pool.length === 0) return;
        for (const m of pool) {
          const s = m.payload.settled_at;
          expect(s).not.toBeNull();
          if (s === null) return;
          const elapsed = s - m.payload.created_at;
          expect(elapsed).toBeGreaterThanOrEqual(SETTLEMENT_WINDOW.t_min_seconds);
          expect(elapsed).toBeLessThanOrEqual(SETTLEMENT_WINDOW.t_max_seconds);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("generation is SOUND: every candidate it returns, evaluate admits", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const c = ctx(amount);
        const g = generateCandidates(pool, c);
        if (g.status !== "COMPLETE") return;
        const byIdMap = new Map(pool.map((m) => [m.obs_id as string, m]));
        for (const cand of g.candidates) {
          const members: Member[] = [];
          for (const id of cand.member_obs_ids) {
            const m = byIdMap.get(id as string);
            if (m !== undefined) members.push(m);
          }
          expect(evaluate(members, c).admissible).toBe(true);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("generation is COMPLETE: every admissible subset appears in its output", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const c = ctx(amount);
        const g = generateCandidates(pool, c);
        if (g.status !== "COMPLETE") return;
        const produced = new Set(g.candidates.map((x) => key(x.member_obs_ids)));
        for (const s of subsets(pool)) {
          if (!evaluate(s, c).admissible) continue;
          expect(produced.has(key(s.map((m) => m.obs_id)))).toBe(true);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("generation is order-independent and repeatable", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const c = ctx(amount);
        const forward = generateCandidates(pool, c);
        expect(generateCandidates([...pool].reverse(), c)).toEqual(forward);
        expect(generateCandidates(pool, c)).toEqual(forward);
      }),
      { numRuns: 2_000 },
    );
  });

  it("every generated candidate is co-settlement coherent", () => {
    fc.assert(
      fc.property(arbPool, fc.integer({ min: 0, max: 20_000 }), (pool, amount) => {
        const g = generateCandidates(pool, ctx(amount));
        const byIdMap = new Map(pool.map((m) => [m.obs_id as string, m]));
        for (const cand of g.candidates) {
          const stamps = new Set(
            cand.member_obs_ids.map(
              (id) => byIdMap.get(id as string)?.payload.settled_at,
            ),
          );
          expect(stamps.size).toBeLessThanOrEqual(1);
          expect(stamps.has(null)).toBe(false);
        }
      }),
      { numRuns: 2_000 },
    );
  });
});
