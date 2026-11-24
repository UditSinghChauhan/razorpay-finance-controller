import { describe, expect, it } from "vitest";

import { EPSILON_BPS as ENGINE_EPSILON_BPS, SEARCH_BOUND as ENGINE_SEARCH_BOUND, SE_WEIGHTS_BPS as ENGINE_SE_WEIGHTS_BPS } from "@assay/engine";
import {
  benchV2ByFamily,
  DENOMINATOR_EMPTY,
  documentedCounts,
  documentedRows,
  EPSILON_BPS,
  SEARCH_BOUND,
  SE_WEIGHTS_BPS,
  type AgentInput,
  type BenchV2Unit,
  type DocumentedTargetRow,
  type RunConfig,
} from "@assay/eval";
import { buildReconReport, DECLARED_SEEDS, generateFamily, type FamilyId } from "@assay/generator";
import { labelAll, oracleContext, structuralCounts, type OracleRun } from "@assay/oracle";

import { runAssayComposedFull, type AssayRunResult } from "../src/index.js";

/**
 * bench-v2's documented model over GENERATED families, through the real
 * oracle and — for the metric join only — the real engine
 * (`docs/BENCH_V2_PREREGISTRATION.md §3–§4`; `PREREGISTRATION.md §10` V40).
 *
 * **This measures nothing and is not benchmark evidence.** Every family is a
 * STRESS family at test seed 7001 in no `§6.1` block; no corpus is generated
 * and nothing is sealed. What is pinned is that the documented model says of
 * each family what the design derived it would say — and, on `AMB-4`, the one
 * thing the frozen engine cannot see: that the `k = 0` batch's two allocations
 * are 2000 bps apart under the specified `SE5`.
 *
 * `packages/eval` may not import `packages/engine`, so its transcriptions of
 * the frozen weights and bound are asserted equal to the engine's HERE, where
 * both may be imported.
 */

const SEED = 7001;
if (DECLARED_SEEDS.includes(SEED)) throw new Error(`bench-v2-documented-model: ${String(SEED)} is a declared §6.1 seed.`);

const config = (seed: number): RunConfig => Object.freeze({ llm_mode: "offline", strict_replay: false, split: "train", seed });

interface Instance {
  readonly family: ReturnType<typeof generateFamily>;
  readonly oracle: OracleRun;
  readonly rows: readonly DocumentedTargetRow[];
}

const cache = new Map<string, Instance>();
function instance(family: FamilyId, seed = SEED): Instance {
  const key = `${family}:${String(seed)}`;
  let hit = cache.get(key);
  if (hit === undefined) {
    const generated = generateFamily(family, seed);
    const oracle = labelAll(generated.observations, oracleContext(generated.observations));
    const rows = documentedRows(generated.observations, oracle, buildReconReport(generated.true_state), SEARCH_BOUND);
    hit = { family: generated, oracle, rows };
    cache.set(key, hit);
  }
  return hit;
}

/** The settlements the family's construction touched, by id. */
function touched(i: Instance): { s1: string[]; s2: string[]; targets: Set<string> } {
  const state = i.family.true_state;
  const s1 = state.split_batches.map((s) => state.settlements[s.settlement_a_index]?.id ?? "");
  const s2 = state.split_batches.map((s) => state.settlements[s.settlement_b_index]?.id ?? "");
  const byMember = new Map<string, string>();
  for (const s of state.settlements) {
    for (const m of s.members) {
      const id = m.kind === "payment" ? state.payments[m.index]?.id : m.kind === "refund" ? state.refunds[m.index]?.id : state.adjustments[m.index]?.id;
      if (id !== undefined) byMember.set(id, s.id);
    }
  }
  const targets = new Set(i.family.ground_truth.degradations.map((d) => byMember.get(d.target_id) ?? ""));
  return { s1, s2, targets };
}

const rowOf = (i: Instance) => new Map(i.rows.map((r) => [r.target_id, r]));

describe("the transcriptions match the engine's frozen constants", () => {
  it("SE weights, epsilon and the search bound are byte-identical across packages", () => {
    expect(SE_WEIGHTS_BPS).toStrictEqual(ENGINE_SE_WEIGHTS_BPS);
    expect(EPSILON_BPS).toBe(ENGINE_EPSILON_BPS);
    expect(SEARCH_BOUND).toStrictEqual(ENGINE_SEARCH_BOUND);
  });
});

describe("A04 — the documented model discriminates the k = 0 batch and not the k >= 1 batch", () => {
  it("S2 (k = 0): gap exactly 2000 bps > epsilon, DISCRIMINABLE; S1 (k >= 1): gap 4000 / (k + 2) < epsilon, TRULY_AMBIGUOUS", () => {
    const i = instance("A04");
    const rows = rowOf(i);
    const { s1, s2 } = touched(i);
    expect(s2).toHaveLength(3);
    for (const id of s2) {
      const r = rows.get(id);
      expect(r?.structural.label).toBe("EXCHANGEABLE");
      expect(r?.anchored_count).toBe(0);
      expect(r?.gap_bps).toBe(2000);
      expect(r?.documented).toBe("DISCRIMINABLE");
    }
    for (const id of s1) {
      const r = rows.get(id);
      expect(r?.structural.label).toBe("EXCHANGEABLE");
      const k = r?.anchored_count ?? 0;
      expect(k).toBeGreaterThanOrEqual(1);
      // Each score is rounded once, so the difference is within a paisa of the closed form.
      expect(Math.abs((r?.gap_bps ?? 0) - 4000 / (k + 2))).toBeLessThanOrEqual(1);
      expect(r?.gap_bps ?? Infinity).toBeLessThan(EPSILON_BPS);
      expect(r?.documented).toBe("TRULY_AMBIGUOUS");
    }
    const counts = documentedCounts(i.rows);
    expect(counts.DISCRIMINABLE).toBe(3);
    expect(counts.TRULY_AMBIGUOUS).toBe(3);
  });
});

describe("the other families, as the design derived them (V40)", () => {
  it("A01 and A02: every touched target is TRULY_AMBIGUOUS with a sub-epsilon gap; DISCRIMINABLE is empty", () => {
    for (const family of ["A01", "A02"] as const) {
      const i = instance(family);
      const rows = rowOf(i);
      for (const id of touched(i).targets) {
        const r = rows.get(id);
        expect(r?.documented, `${family} ${id}`).toBe("TRULY_AMBIGUOUS");
        expect(r?.anchored_count ?? 0).toBeGreaterThanOrEqual(1);
        expect(r?.gap_bps ?? Infinity).toBeLessThan(EPSILON_BPS);
      }
      expect(documentedCounts(i.rows).DISCRIMINABLE).toBe(0);
      expect(documentedCounts(i.rows).TRULY_AMBIGUOUS).toBe(6);
    }
  });

  it("A03: every touched target is IMMATERIAL — exchangeable, sub-epsilon, below tau", () => {
    const i = instance("A03");
    const rows = rowOf(i);
    for (const id of touched(i).targets) expect(rows.get(id)?.documented).toBe("IMMATERIAL");
    expect(documentedCounts(i.rows).IMMATERIAL).toBe(6);
    expect(documentedCounts(i.rows).TRULY_AMBIGUOUS).toBe(0);
  });

  it("A05: the three bound targets are SEARCH_BOUND_ORACLE under the engine's bound, though the oracle enumerated them", () => {
    const i = instance("A05");
    const rows = rowOf(i);
    for (const id of touched(i).targets) {
      const r = rows.get(id);
      expect(r?.documented).toBe("SEARCH_BOUND_ORACLE");
      expect(r?.structural.engine_subsets).toBe(2 ** 15 - 1);
      expect(r?.gap_bps).toBeNull();
    }
    expect(i.oracle.labels.filter((l) => l.label === "UNAMBIGUOUS" && touched(i).targets.has(l.target_id))).toHaveLength(3);
    expect(structuralCounts(i.rows.map((r) => r.structural)).SEARCH_BOUND_ORACLE).toBe(3);
  });

  it("B01: the twelve touched targets are SINGLE — M-G's population", () => {
    const i = instance("B01");
    const rows = rowOf(i);
    const targets = touched(i).targets;
    expect(targets.size).toBe(12);
    for (const id of targets) expect(rows.get(id)?.documented).toBe("SINGLE");
    expect(documentedCounts(i.rows).SINGLE).toBe(12);
  });

  it("every settlement the family did not touch is ANCHOR_RESOLVED; every bank line is NO_MEMBER_KIND", () => {
    for (const family of ["A01", "A04", "B01"] as const) {
      const i = instance(family);
      const targets = touched(i).targets;
      for (const r of i.rows) {
        if (r.structural.target_kind === "bank_line") expect(r.documented).toBe("NO_MEMBER_KIND");
        else if (!targets.has(r.target_id)) expect(r.documented, `${family} ${r.target_id}`).toBe("ANCHOR_RESOLVED");
      }
    }
  });
});

describe("properties", () => {
  const key = (rows: readonly DocumentedTargetRow[]): string =>
    JSON.stringify([...rows].sort((a, b) => (a.target_id < b.target_id ? -1 : 1)).map((r) => [r.target_id, r.documented, r.gap_bps, r.anchored_count]));

  it("TA and DISCRIMINABLE are disjoint, and neither holds with fewer than two admissible allocations", () => {
    for (const family of ["A01", "A04", "A05", "B01"] as const) {
      for (const r of instance(family).rows) {
        expect([r.documented === "TRULY_AMBIGUOUS", r.documented === "DISCRIMINABLE"]).not.toStrictEqual([true, true]);
        if (r.structural.solution_count < 2) {
          expect(["TRULY_AMBIGUOUS", "DISCRIMINABLE", "IMMATERIAL"]).not.toContain(r.documented);
          expect(r.gap_bps).toBeNull();
        }
      }
    }
  });

  it("is a function of the seed: two computations agree, and a second seed is a different corpus with the same shape", () => {
    const a = instance("A04");
    const again = generateFamily("A04", SEED);
    const recomputed = documentedRows(again.observations, labelAll(again.observations, oracleContext(again.observations)), buildReconReport(again.true_state), SEARCH_BOUND);
    expect(key(recomputed)).toBe(key(a.rows));
    const other = instance("A04", 7002);
    expect(key(other.rows)).not.toBe(key(a.rows));
    expect(documentedCounts(other.rows).DISCRIMINABLE).toBe(3);
  });

  it("does not depend on the order the observations arrive in", () => {
    const a = instance("A04");
    const reversed = [...a.family.observations].reverse();
    const rows = documentedRows(reversed, labelAll(reversed, oracleContext(reversed)), buildReconReport(a.family.true_state), SEARCH_BOUND);
    expect(key(rows)).toBe(key(a.rows));
  });
});

describe("the metric join, through the real engine at a test seed — machinery, not evidence", () => {
  async function unitFor(family: FamilyId): Promise<BenchV2Unit> {
    const i = instance(family);
    const input = Object.freeze({ observations: i.family.observations, config: config(SEED) }) satisfies AgentInput;
    const assay: AssayRunResult = await runAssayComposedFull(input, { agentId: "ASSAY" });
    const reasons = new Map<string, string>();
    for (const d of assay.evidence.decisions) {
      if (d.certificate !== null && d.state === "ABSTAINED") reasons.set(d.entity_id, d.certificate.reason);
    }
    return {
      family,
      run: assay.run,
      rows: i.rows,
      true_target_of_entity: new Map(i.family.ground_truth.allocations.map((a) => [a.entity_id, a.settlement_id])),
      certificate_reason_of_target: reasons,
    };
  }

  it("emits seven metrics per family and overall, each with numerator, denominator and excluded, and never reads the close", async () => {
    const units = await Promise.all((["A04", "B01"] as const).map(unitFor));
    const reports = benchV2ByFamily(units);
    expect(reports.map((r) => r.population)).toStrictEqual(["A04", "B01", "OVERALL"]);
    const a04 = new Map(reports[0]?.metrics.map((m) => [m.id, m]));
    // The frozen engine abstains on all six A04 targets: recall 3/3 on the TA
    // half, false abstention 3/3 on the D half, precision 3/6, no A2 commit.
    expect(a04.get("M-A")).toMatchObject({ numerator: 3, denominator: 3, excluded: 0, value: 1 });
    expect(a04.get("M-B")).toMatchObject({ numerator: 3, denominator: 3, excluded: 0, value: 1 });
    expect(a04.get("M-C")).toMatchObject({ numerator: 3, denominator: 6, value: 0.5 });
    expect(a04.get("M-D")).toMatchObject({ denominator: 0, value: DENOMINATOR_EMPTY });
    expect(a04.get("M-F")).toMatchObject({ numerator: 6, denominator: 6 });
    expect(reports[0]?.reason_mix).toStrictEqual([{ reason: "EVIDENCE_TIE", count: 6 }]);
    const b01 = new Map(reports[1]?.metrics.map((m) => [m.id, m]));
    expect(b01.get("M-G")).toMatchObject({ numerator: 0, denominator: 12, value: 0 });
    expect(b01.get("M-A")).toMatchObject({ value: DENOMINATOR_EMPTY });
    const overall = new Map(reports[2]?.metrics.map((m) => [m.id, m]));
    expect(overall.get("M-G")).toMatchObject({ numerator: 0, denominator: 12 });
    expect(overall.get("M-A")).toMatchObject({ numerator: 3, denominator: 3 });
    for (const report of reports) {
      expect(report.metrics.map((m) => m.id)).toStrictEqual(["M-A", "M-B", "M-C", "M-D", "M-E", "M-F", "M-G"]);
      for (const m of report.metrics) expect(JSON.stringify(m)).not.toContain("unresolved_value");
    }
  });
});
