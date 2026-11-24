import { describe, expect, it } from "vitest";

import {
  labelAll,
  oracleContext,
  STRUCTURAL_LABELS,
  structuralCounts,
  structuralLabels,
  structurallyExchangeable,
  type SearchBounds,
  type StructuralRow,
} from "../src/index.js";
import { bankLine, DAY, PAY, reconLine, SETL, settlement, T0, type ReconLineSpec } from "./fixtures.js";

/**
 * bench-v2's structural label (`docs/BENCH_V2_PREREGISTRATION.md §3`), from
 * hand-built observations. `§6.1`: no split seed and no generator here; the
 * seed-stability and reordering properties over generated families are in
 * `apps/cli/tests/bench-v2-documented-model.test.ts`, which may invoke both.
 */

/** `PREREGISTRATION.md §7`'s engine bound, as a test literal. */
const ENGINE: SearchBounds = { k_max: 22, c_max: 5_000 };

const line = (n: number, amount: number, extra: Partial<ReconLineSpec> = {}) =>
  reconLine({ entity: PAY(n), type: "payment", amount, ...extra });

function rowsOf(observations: Parameters<typeof labelAll>[0], bounds: SearchBounds = ENGINE): readonly StructuralRow[] {
  return structuralLabels(observations, labelAll(observations, oracleContext(observations)), bounds);
}

const byTarget = (rows: readonly StructuralRow[]) => new Map(rows.map((r) => [r.target_id, r]));

describe("structural labels — one per target, from the oracle's own enumeration", () => {
  it("labels two equal-credit unanchored lines against one settlement EXCHANGEABLE, with the anchored count", () => {
    // S1 = 1000 needs one of two unanchored 500s; a third line is AN1-anchored
    // to it and supplies the other 500 (k = 1).
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500),
      line(3, 500),
    ];
    const rows = byTarget(rowsOf(obs));
    const s1 = rows.get(SETL(1));
    expect(s1?.label).toBe("EXCHANGEABLE");
    expect(s1?.solution_count).toBe(2);
    expect(s1?.anchored_count).toBe(1);
    expect(s1?.class_sizes).toStrictEqual([2]);
    expect(s1?.engine_subsets).toBe(3);
    expect(structurallyExchangeable(s1 as StructuralRow)).toBe(true);
  });

  it("labels a settlement with exactly one admissible allocation SINGLE, and one with none NONE", () => {
    const obs = [
      settlement(SETL(1), 700, "UTR1"),
      settlement(SETL(2), 999, "UTR2"),
      line(1, 700),
      line(2, 300),
    ];
    const rows = byTarget(rowsOf(obs));
    expect(rows.get(SETL(1))?.label).toBe("SINGLE");
    expect(rows.get(SETL(1))?.solution_count).toBe(1);
    expect(rows.get(SETL(2))?.label).toBe("NONE");
    expect(rows.get(SETL(2))?.solution_count).toBe(0);
    for (const row of rows.values()) expect(structurallyExchangeable(row)).toBe(false);
  });

  it("labels a fully anchored settlement ANCHOR_RESOLVED and a bank line NO_MEMBER_KIND — neither is in a population", () => {
    const obs = [
      settlement(SETL(1), 500, "UTR1"),
      line(1, 500, { settlement_id: SETL(1) }),
      bankLine("bnk_1", 500, "UTR1"),
    ];
    const rows = byTarget(rowsOf(obs));
    expect(rows.get(SETL(1))?.label).toBe("ANCHOR_RESOLVED");
    expect(rows.get("bnk_1")?.label).toBe("NO_MEMBER_KIND");
  });

  it("labels a target SEARCH_BOUND_ORACLE under the engine's bound even where the oracle enumerated it", () => {
    // Nine unanchored lines in one class: 2^9 - 1 = 511 subsets, inside the
    // oracle's C_ORACLE and inside c_max = 5000 -- but a bound of c_max = 100
    // would stop S2. The label follows the bound the caller supplies.
    const obs = [settlement(SETL(1), 900, "UTR1"), ...Array.from({ length: 9 }, (_, i) => line(i + 1, 100))];
    const wide = byTarget(rowsOf(obs));
    expect(wide.get(SETL(1))?.label).not.toBe("SEARCH_BOUND_ORACLE");
    expect(wide.get(SETL(1))?.engine_subsets).toBe(511);
    const tight = byTarget(rowsOf(obs, { k_max: 22, c_max: 100 }));
    expect(tight.get(SETL(1))?.label).toBe("SEARCH_BOUND_ORACLE");
    expect(tight.get(SETL(1))?.solution_count).toBe(0);
    const tightK = byTarget(rowsOf(obs, { k_max: 8, c_max: 5_000 }));
    expect(tightK.get(SETL(1))?.label).toBe("SEARCH_BOUND_ORACLE");
  });

  it("uses the anchored instant's class only when the target has anchored members", () => {
    // Two classes at two instants. With an anchored member at T0+2d only that
    // class is a candidate class; without, both are.
    const later = T0 + 3 * DAY;
    const anchoredObs = [
      settlement(SETL(1), 1000, "UTR1"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500),
      line(3, 500, { settled_at: later }),
    ];
    expect(byTarget(rowsOf(anchoredObs)).get(SETL(1))?.class_sizes).toStrictEqual([1]);
    const openObs = [settlement(SETL(1), 500, "UTR1"), line(2, 500), line(3, 500, { settled_at: later })];
    const open = byTarget(rowsOf(openObs)).get(SETL(1));
    expect(open?.class_sizes).toStrictEqual([1, 1]);
    expect(open?.label).toBe("EXCHANGEABLE");
  });
});

describe("properties", () => {
  it("gives every target exactly one label, and the counts cover every label", () => {
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500),
      line(3, 500),
      bankLine("bnk_1", 1000, null),
    ];
    const rows = rowsOf(obs);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(STRUCTURAL_LABELS).toContain(row.label);
    const counts = structuralCounts(rows);
    expect(Object.keys(counts).sort()).toStrictEqual([...STRUCTURAL_LABELS].sort());
    expect(Object.values(counts).reduce((t, n) => t + n, 0)).toBe(rows.length);
  });

  it("is EXCHANGEABLE only with at least two admissible allocations", () => {
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      settlement(SETL(2), 400, "UTR2"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500),
      line(3, 500),
      line(4, 400),
    ];
    for (const row of rowsOf(obs)) {
      expect(structurallyExchangeable(row)).toBe(row.solution_count >= 2);
    }
  });

  it("does not depend on the order the observations arrive in", () => {
    const obs = [
      settlement(SETL(2), 400, "UTR2"),
      line(3, 500),
      settlement(SETL(1), 1000, "UTR1"),
      line(4, 400),
      line(1, 500, { settlement_id: SETL(1) }),
      bankLine("bnk_1", 1000, "UTR1"),
      line(2, 500),
    ];
    const key = (rows: readonly StructuralRow[]): string =>
      JSON.stringify([...rows].sort((a, b) => (a.target_id < b.target_id ? -1 : 1)));
    expect(key(rowsOf([...obs].reverse()))).toBe(key(rowsOf(obs)));
  });
});
