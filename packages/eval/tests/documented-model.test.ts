import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { labelAll, memberContribution, oracleContext, type MemberContribution } from "@assay/oracle";

import {
  benchV2ByFamily,
  benchV2Metrics,
  DENOMINATOR_EMPTY,
  DOCUMENTED_CLASSES,
  documentedCounts,
  documentedDiscriminable,
  documentedModeDays,
  documentedRows,
  documentedSe3,
  documentedSe5,
  documentedSingle,
  documentedTrulyAmbiguous,
  detachedEntityIds,
  entityAmountsPaise,
  EPSILON_BPS,
  exchangeableClassOf,
  settlementValuePaise,
  formatBenchV2Metric,
  formatForcedChoiceHarm,
  SE_DISPOSITIONS,
  SE_IN_GAP,
  SE_UNDETERMINABLE,
  SE_WEIGHTS_BPS,
  SEARCH_BOUND,
  type BenchV2Unit,
  type DocumentedTargetRow,
  type ReconReportRowLike,
} from "../src/index.js";
import { abstention, agentRun, DAY, edge, PAY, reconLine, SETL, settlement, T0, type ReconLineSpec } from "./fixtures.js";

/**
 * bench-v2's documented model and metrics (`docs/BENCH_V2_PREREGISTRATION.md
 * §3–§4`) over hand-built observations — `§6.1`: no split seed and no
 * generator here. The generated-family properties (seed stability, reordering,
 * the `AMB-4` gap) are in `apps/cli/tests/bench-v2-documented-model.test.ts`.
 */

const line = (n: number, amount: number, extra: Partial<ReconLineSpec> = {}) =>
  reconLine({ entity: PAY(n), type: "payment", amount, ...extra });

function rows(obs: Parameters<typeof labelAll>[0], report: readonly ReconReportRowLike[]): readonly DocumentedTargetRow[] {
  return documentedRows(obs, labelAll(obs, oracleContext(obs)), report, SEARCH_BOUND);
}
const byTarget = (r: readonly DocumentedTargetRow[]) => new Map(r.map((x) => [x.target_id, x]));

describe("the SE dispositions — what §4.2 determines and what it leaves open", () => {
  it("computes SE3 and SE5, carries SE1 as target-constant, and excludes SE2 and SE4 as UNDETERMINABLE", () => {
    expect(SE_DISPOSITIONS.map((d) => `${d.id}:${d.status}`)).toStrictEqual([
      "SE1:TARGET_CONSTANT", "SE2:UNDETERMINABLE", "SE3:COMPUTED", "SE4:UNDETERMINABLE", "SE5:COMPUTED",
    ]);
    expect(SE_IN_GAP).toStrictEqual(["SE3", "SE5"]);
    expect(SE_UNDETERMINABLE).toStrictEqual(["SE2", "SE4"]);
    for (const d of SE_DISPOSITIONS) expect(d.weight_bps).toBe(SE_WEIGHTS_BPS[d.id]);
    // The weights are the frozen five; nothing renormalised.
    expect(Object.values(SE_WEIGHTS_BPS).reduce((t, n) => t + n, 0)).toBe(10_000);
  });

  it("SE3: the modal-lag kernel over T_max - T_min = 6 days, mean over members", () => {
    const obs = [
      line(1, 100, { created_at: T0, settled_at: T0 + 2 * DAY }),
      line(2, 100, { created_at: T0, settled_at: T0 + 2 * DAY }),
      line(3, 100, { created_at: T0, settled_at: T0 + 3.5 * DAY }),
    ];
    const members = obs.map((o) => memberContribution(o)).filter((m): m is MemberContribution => m !== null);
    const [m0, , m2] = members;
    if (m0 === undefined || m2 === undefined) throw new Error("fixture");
    // mode of floor(lag) over {2, 2, 3} is 2
    const modeDays = documentedModeDays(members);
    expect(modeDays).toBe(2);
    expect(documentedSe3([m0], modeDays)).toBe(1);
    expect(documentedSe3([m2], modeDays)).toBeCloseTo(1 - 1.5 / 6, 10);
    expect(documentedSe3([m0, m2], modeDays)).toBeCloseTo((1 + 0.75) / 2, 10);
    expect(documentedSe3([], modeDays)).toBe(0);
  });

  it("SE5: Jaccard of R* and M, zero on an empty union", () => {
    expect(documentedSe5(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(documentedSe5(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(documentedSe5(new Set(["a", "b", "c"]), new Set(["a", "b"]))).toBeCloseTo(2 / 3, 10);
    expect(documentedSe5(new Set(), new Set())).toBe(0);
  });
});

describe("documented rows — the composed predicates", () => {
  // S1 = 1000: one anchored 500 (k = 1) plus one of two unanchored 500s.
  // The two allocations are a one-for-one swap with u = w = 1.
  const twoWay = () => [
    settlement(SETL(1), 1000, "UTR1"),
    line(1, 500, { settlement_id: SETL(1) }),
    line(2, 500),
    line(3, 500),
  ];
  const reportFor = (settlementId: string, ...entities: string[]): ReconReportRowLike[] =>
    entities.map((entity_id) => ({ settlement_id: settlementId, entity_id }));

  it("k = 1, twin swap: SE5 gap 2000 x 2 / 3 = 1333 < epsilon, so the target is TRULY_AMBIGUOUS or IMMATERIAL, never DISCRIMINABLE", () => {
    const obs = twoWay();
    const r = byTarget(rows(obs, reportFor(SETL(1), PAY(1), PAY(2)))).get(SETL(1));
    expect(r?.structural.label).toBe("EXCHANGEABLE");
    expect(r?.anchored_count).toBe(1);
    expect(r?.gap_bps).toBe(1333);
    expect(r?.documented).not.toBe("DISCRIMINABLE");
    // Equal credits, equal fees: the two projections coincide, so materiality
    // is 0 and the documented class is IMMATERIAL here.
    expect(r?.documented).toBe("IMMATERIAL");
    expect(r?.signals_undeterminable).toStrictEqual(["SE2", "SE4"]);
  });

  it("k = 0, twin swap: SE5 gap 2000 > epsilon, DISCRIMINABLE", () => {
    const obs = [settlement(SETL(1), 500, "UTR1"), line(2, 500), line(3, 500)];
    const r = byTarget(rows(obs, reportFor(SETL(1), PAY(2)))).get(SETL(1));
    expect(r?.anchored_count).toBe(0);
    expect(r?.gap_bps).toBe(2000);
    expect(r?.documented).toBe("DISCRIMINABLE");
    expect(documentedDiscriminable(r as DocumentedTargetRow)).toBe(true);
    expect(2000).toBeGreaterThan(EPSILON_BPS);
  });

  it("with no report row for the target SE5 is 0 on every allocation and the gap is SE3's alone", () => {
    const obs = twoWay();
    const r = byTarget(rows(obs, [])).get(SETL(1));
    expect(r?.gap_bps).toBe(0);
    expect(r?.scores.every((s) => s.se5_unit === 0)).toBe(true);
  });

  it("a reported id with no observation is excluded from R* entirely (F05 treatment)", () => {
    const obs = [settlement(SETL(1), 500, "UTR1"), line(2, 500), line(3, 500)];
    // PAY(9) has no observation: R* = {obs(PAY 2)} exactly, so the gap is still 2000.
    const r = byTarget(rows(obs, reportFor(SETL(1), PAY(2), PAY(9)))).get(SETL(1));
    expect(r?.gap_bps).toBe(2000);
  });

  it("materiality above tau with a sub-epsilon gap is TRULY_AMBIGUOUS", () => {
    // Two allocations with equal credit but different fee/amount: the P2 legs
    // differ on 1100 and 5100 by 20,000 paise > tau's Rs 100 floor.
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500_000, { fee: 499_500 }),
      line(3, 520_000, { fee: 519_500 }),
    ];
    const r = byTarget(rows(obs, reportFor(SETL(1), PAY(1), PAY(2)))).get(SETL(1));
    expect(r?.structural.label).toBe("EXCHANGEABLE");
    expect(r?.max_materiality_paise).toBeGreaterThan(r?.tau_paise ?? Infinity);
    expect(r?.gap_bps).toBe(1333);
    expect(r?.documented).toBe("TRULY_AMBIGUOUS");
    expect(documentedTrulyAmbiguous(r as DocumentedTargetRow)).toBe(true);
  });

  it("gives every target exactly one class; TA and D are disjoint; neither holds below two allocations", () => {
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      settlement(SETL(2), 700, "UTR2"),
      settlement(SETL(3), 999, "UTR3"),
      line(1, 500, { settlement_id: SETL(1) }),
      line(2, 500),
      line(3, 500),
      line(4, 700),
    ];
    const all = rows(obs, reportFor(SETL(1), PAY(1), PAY(2)));
    for (const r of all) {
      expect(DOCUMENTED_CLASSES).toContain(r.documented);
      expect(documentedTrulyAmbiguous(r) && documentedDiscriminable(r)).toBe(false);
      if (r.structural.solution_count < 2) {
        expect(documentedTrulyAmbiguous(r)).toBe(false);
        expect(documentedDiscriminable(r)).toBe(false);
        expect(r.gap_bps).toBeNull();
      }
    }
    const counts = documentedCounts(all);
    expect(Object.values(counts).reduce((t, n) => t + n, 0)).toBe(all.length);
    expect(byTarget(all).get(SETL(2))?.documented).toBe("SINGLE");
    expect(documentedSingle(byTarget(all).get(SETL(2)) as DocumentedTargetRow)).toBe(true);
    expect(byTarget(all).get(SETL(3))?.documented).toBe("NONE");
  });
});

describe("the seven metrics — numerator, denominator, excluded, DENOMINATOR_EMPTY", () => {
  function unit(family: string, abstained: string[], edges: [string, string][], truth: [string, string][], rowsIn: readonly DocumentedTargetRow[], reasons: [string, string][] = []): BenchV2Unit {
    return {
      family,
      run: agentRun({
        abstentions: abstained.map((t) => abstention(t, 1)),
        allocations: edges.map(([e, t]) => edge(e, t)),
      }),
      rows: rowsIn,
      true_target_of_entity: new Map(truth),
      certificate_reason_of_target: new Map(reasons),
    };
  }
  const obs = [
    settlement(SETL(1), 1000, "UTR1"),
    line(1, 500, { settlement_id: SETL(1) }),
    line(2, 500_000, { fee: 499_500 }),
    line(3, 520_000, { fee: 519_500 }),
    settlement(SETL(2), 500, "UTR2"),
    line(4, 500),
    line(5, 500),
    settlement(SETL(3), 700, "UTR3"),
    line(6, 700),
  ];
  const report: ReconReportRowLike[] = [
    { settlement_id: SETL(1), entity_id: PAY(1) },
    { settlement_id: SETL(1), entity_id: PAY(2) },
    { settlement_id: SETL(2), entity_id: PAY(4) },
    { settlement_id: SETL(3), entity_id: PAY(6) },
  ];
  const classed = rows(obs, report);

  it("classes the fixture as one TA, one D and one SINGLE", () => {
    const c = documentedCounts(classed);
    expect(c.TRULY_AMBIGUOUS).toBe(1);
    expect(c.DISCRIMINABLE).toBe(1);
    expect(c.SINGLE).toBe(1);
  });

  it("scores an agent that abstains on TA only: M-A 1, M-B 0, M-C 1, M-G 0, M-D EMPTY", () => {
    const u = unit("X", [SETL(1)], [[PAY(4), SETL(2)], [PAY(6), SETL(3)]], [[PAY(4), SETL(2)], [PAY(6), SETL(3)]], classed, [[SETL(1), "EVIDENCE_TIE"]]);
    const report = benchV2Metrics([u], "X");
    const m = new Map(report.metrics.map((x) => [x.id, x]));
    expect(m.get("M-A")).toMatchObject({ numerator: 1, denominator: 1, excluded: 0, value: 1 });
    expect(m.get("M-B")).toMatchObject({ numerator: 0, denominator: 1, value: 0 });
    expect(m.get("M-C")).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    expect(m.get("M-D")).toMatchObject({ numerator: 0, denominator: 0, value: DENOMINATOR_EMPTY });
    expect(m.get("M-E")).toMatchObject({ numerator: 1333, denominator: 1, value: 1333 });
    expect(m.get("M-F")).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    expect(m.get("M-G")).toMatchObject({ numerator: 0, denominator: 1, value: 0 });
    expect(report.reason_mix).toStrictEqual([{ reason: "EVIDENCE_TIE", count: 1 }]);
    for (const x of report.metrics) {
      expect(x.excluded).toBe(Object.values(x.excluded_by).reduce((t, n) => t + n, 0));
    }
  });

  it("scores A2-NOABSTAIN: M-D counts wrong committed TA targets and reports the excepted ones separately", () => {
    // Commits the wrong twin on S1; commits nothing on S2 (excepted); right on S3.
    const u = unit("X", [], [[PAY(3), SETL(1)], [PAY(6), SETL(3)]], [[PAY(2), SETL(1)], [PAY(4), SETL(2)], [PAY(6), SETL(3)]], classed);
    const m = new Map(benchV2Metrics([u], "X").metrics.map((x) => [x.id, x]));
    expect(m.get("M-D")).toMatchObject({ numerator: 1, denominator: 1, value: 1, excluded: 0 });
    expect(m.get("M-A")).toMatchObject({ numerator: 0, denominator: 1, value: 0 });
    expect(m.get("M-E")).toMatchObject({ value: DENOMINATOR_EMPTY });
    expect(m.get("M-F")).toMatchObject({ value: DENOMINATOR_EMPTY });
    // Now except the TA target instead: nothing committed on S1.
    const excepted = unit("X", [], [[PAY(6), SETL(3)]], [[PAY(2), SETL(1)]], classed);
    const d = new Map(benchV2Metrics([excepted], "X").metrics.map((x) => [x.id, x])).get("M-D");
    expect(d).toMatchObject({ numerator: 0, denominator: 0, value: DENOMINATOR_EMPTY, excluded: 1, excluded_by: { EXCEPTED_NO_ALLOCATION: 1 } });
  });

  it("names SEARCH_BOUND_ORACLE inline as an exclusion on every population rate", () => {
    const bound: DocumentedTargetRow = { ...(classed[0] as DocumentedTargetRow), target_id: "setl_bound", documented: "SEARCH_BOUND_ORACLE", gap_bps: null, scores: [] };
    const u = unit("X", ["setl_bound"], [], [], [...classed, bound]);
    const m = new Map(benchV2Metrics([u], "X").metrics.map((x) => [x.id, x]));
    for (const id of ["M-A", "M-B", "M-G"] as const) expect(m.get(id)?.excluded_by).toStrictEqual({ SEARCH_BOUND_ORACLE: 1 });
    // The TA target is neither abstained nor committed here, so M-D also names it.
    expect(m.get("M-D")?.excluded_by).toStrictEqual({ SEARCH_BOUND_ORACLE: 1, EXCEPTED_NO_ALLOCATION: 1 });
    expect(m.get("M-C")).toMatchObject({ numerator: 0, denominator: 0, value: DENOMINATOR_EMPTY, excluded_by: { SEARCH_BOUND_ORACLE: 1 } });
    expect(m.get("M-E")).toMatchObject({ value: DENOMINATOR_EMPTY, excluded_by: { GAP_UNDEFINED: 1 } });
    const line = formatBenchV2Metric(m.get("M-A") as never);
    expect(line).toBe("M-A abstention_recall = 0.0000 (0 / 1; 1 excluded (SEARCH_BOUND_ORACLE 1))");
    expect(formatBenchV2Metric(m.get("M-C") as never)).toContain(DENOMINATOR_EMPTY);
  });

  it("reports per family and OVERALL from the same units", () => {
    const a = unit("A", [SETL(1)], [], [], classed);
    const b = unit("B", [], [], [], classed);
    const reports = benchV2ByFamily([a, b]);
    expect(reports.map((r) => r.population)).toStrictEqual(["A", "B", "OVERALL"]);
    const overallA = reports[2]?.metrics.find((x) => x.id === "M-A");
    expect(overallA).toMatchObject({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it("names an arm's own abstentions on TA targets as an M-D exclusion rather than hiding them", () => {
    const u = unit("X", [SETL(1)], [], [], classed);
    const d = benchV2Metrics([u], "X").metrics.find((x) => x.id === "M-D");
    expect(d).toMatchObject({ denominator: 0, value: DENOMINATOR_EMPTY, excluded_by: { ABSTAINED_BY_THIS_ARM: 1 } });
  });
});

describe("M-D's value — the rupees A2 books to the wrong allocation where ASSAY holds a certificate", () => {
  // S1 (TA) is anchored on PAY 1 and truly takes PAY 2 (500,000); PAY 3 (520,000) is the wrong twin.
  const obs = [
    settlement(SETL(1), 1000, "UTR1"),
    line(1, 500, { settlement_id: SETL(1) }),
    line(2, 500_000, { fee: 499_500 }),
    line(3, 520_000, { fee: 519_500 }),
  ];
  const classed = rows(obs, [
    { settlement_id: SETL(1), entity_id: PAY(1) },
    { settlement_id: SETL(1), entity_id: PAY(2) },
  ]);
  const truth = new Map([[PAY(1), SETL(1)], [PAY(2), SETL(1)]]);
  const a2 = (edges: [string, string][], reference: string[] | undefined): BenchV2Unit => ({
    family: "X",
    run: agentRun({ abstentions: [], allocations: edges.map(([e, t]) => edge(e, t)) }),
    rows: classed,
    true_target_of_entity: truth,
    certificate_reason_of_target: new Map(),
    ...(reference === undefined ? {} : { reference_abstentions: new Set(reference), entity_amount_paise: entityAmountsPaise(obs) }),
  });

  it("charges the wrongly allocated entity at its observed amount, and not the correctly placed anchored member", () => {
    const report = benchV2Metrics([a2([[PAY(1), SETL(1)], [PAY(3), SETL(1)]], [SETL(1)])], "X");
    expect(report.forced_choice_harm).toStrictEqual({
      contested_paise: null,
      share: null,
      corpus_settlement_value_paise: null,
      value_paise: 520_000,
      wrong_targets: 1,
      wrong_entities: 1,
      held_targets: 1,
      held_committed: 1,
      excluded_by: {},
    });
    const rate = report.metrics.find((m) => m.id === "M-D");
    expect(rate).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
    expect(formatForcedChoiceHarm(report.forced_choice_harm)).toBe(
      "M-D share NOT_COMPUTED (no detached set); corpus settlement value unknown; Rs 5200.00 (520000 paise, 1 entities) booked to the wrong allocation on 1 of 1 committed targets the reference arm held (1 held; 0 excluded)",
    );
  });

  describe("the share of ambiguous value misbooked — M-D's reported figure (Work Order 3b, Part 2a)", () => {
    const withShare = (edges: [string, string][]): BenchV2Unit => ({
      ...a2(edges, [SETL(1)]),
      detached_entity_ids: detachedEntityIds(obs),
      settlement_value_paise: settlementValuePaise(obs),
    });

    it("detaches exactly the lines with no observed settlement_id", () => {
      expect([...detachedEntityIds(obs)].sort()).toStrictEqual([PAY(2), PAY(3)].sort());
      expect(settlementValuePaise(obs)).toBe(1000);
    });

    it("is 1 when the arm committed the wrong twin, 0 when it committed the true one", () => {
      const wrong = benchV2Metrics([withShare([[PAY(1), SETL(1)], [PAY(3), SETL(1)]])], "X").forced_choice_harm;
      expect(wrong).toMatchObject({ contested_paise: 520_000, share: 1, corpus_settlement_value_paise: 1000 });
      const right = benchV2Metrics([withShare([[PAY(1), SETL(1)], [PAY(2), SETL(1)]])], "X").forced_choice_harm;
      expect(right).toMatchObject({ contested_paise: 500_000, share: 0 });
    });

    it("is the value-weighted wrong share across units, and never charges the anchored member", () => {
      const h = benchV2Metrics(
        [withShare([[PAY(1), SETL(1)], [PAY(3), SETL(1)]]), withShare([[PAY(1), SETL(1)], [PAY(2), SETL(1)]])],
        "X",
      ).forced_choice_harm;
      expect(h.contested_paise).toBe(1_020_000);
      expect(h.share).toBeCloseTo(520_000 / 1_020_000, 12);
      expect(h.corpus_settlement_value_paise).toBe(2000);
      expect(formatForcedChoiceHarm(h)).toContain("≈0.5 by construction; measured to confirm the arm behaves as modelled");
      expect(formatForcedChoiceHarm(h)).toContain("corpus settlement value 2000 paise");
    });

    it("prints DENOMINATOR_EMPTY, not 0, when nothing contested was committed", () => {
      const h = benchV2Metrics([withShare([[PAY(1), SETL(1)]])], "X").forced_choice_harm;
      expect(h).toMatchObject({ contested_paise: 0, share: DENOMINATOR_EMPTY });
    });
  });

  it("charges an entity once even if two edges name it", () => {
    const h = benchV2Metrics([a2([[PAY(3), SETL(1)], [PAY(3), SETL(1)]], [SETL(1)])], "X").forced_choice_harm;
    expect(h).toMatchObject({ value_paise: 520_000, wrong_entities: 1 });
  });

  it("is zero, not empty, when A2 picked the true twin on a held target", () => {
    const h = benchV2Metrics([a2([[PAY(1), SETL(1)], [PAY(2), SETL(1)]], [SETL(1)])], "X").forced_choice_harm;
    expect(h).toMatchObject({ value_paise: 0, wrong_targets: 0, held_committed: 1 });
  });

  it("counts a held target A2 could not commit as EXCEPTED_NO_ALLOCATION, never as harm", () => {
    const h = benchV2Metrics([a2([], [SETL(1)])], "X").forced_choice_harm;
    expect(h).toMatchObject({ value_paise: 0, held_targets: 1, held_committed: 0, excluded_by: { EXCEPTED_NO_ALLOCATION: 1 } });
  });

  it("excludes a TA target the reference arm committed, and reports NO_REFERENCE_ARM without one", () => {
    const notHeld = benchV2Metrics([a2([[PAY(3), SETL(1)]], [])], "X").forced_choice_harm;
    expect(notHeld).toMatchObject({ value_paise: 0, held_targets: 0, excluded_by: { NOT_HELD_BY_REFERENCE: 1 } });
    const none = benchV2Metrics([a2([[PAY(3), SETL(1)]], undefined)], "X").forced_choice_harm;
    expect(none).toMatchObject({ value_paise: null, excluded_by: { NO_REFERENCE_ARM: 1 } });
    expect(formatForcedChoiceHarm(none)).toBe("M-D forced_choice_harm = NO_REFERENCE_ARM (1 excluded (NO_REFERENCE_ARM 1))");
  });

  it("never reads unresolved_value_paise or the close", () => {
    const report = benchV2Metrics([a2([[PAY(3), SETL(1)]], [SETL(1)])], "X");
    expect(JSON.stringify(report)).not.toContain("unresolved_value");
  });
});

describe("properties of the documented predicates (fast-check)", () => {
  // A small universe: three settlements, five payment lines, one or two of which
  // may be anchored. fast-check picks which lines exist, which are anchored, the
  // report rows, and the order the observations arrive in.
  const RUNS = 60;
  const universe = fc.record({
    present: fc.subarray([1, 2, 3, 4, 5], { minLength: 1 }),
    anchored: fc.subarray([1, 2], { minLength: 0 }),
    reported: fc.subarray([1, 2, 3, 4, 5], { minLength: 0 }),
    seed: fc.integer(),
  });
  function build(u: { present: number[]; anchored: number[]; reported: number[] }) {
    const obs = [
      settlement(SETL(1), 1000, "UTR1"),
      settlement(SETL(2), 500, "UTR2"),
      settlement(SETL(3), 700, "UTR3"),
      ...u.present.map((n) =>
        line(n, n === 5 ? 700 : n === 4 ? 520_000 : 500, {
          ...(n === 4 ? { fee: 519_500 } : {}),
          ...(u.anchored.includes(n) ? { settlement_id: SETL(1) } : {}),
        }),
      ),
    ];
    // PAY 3 is reported against SETL 2 (k = 0, the only place DISCRIMINABLE can arise), PAY 5 against SETL 3.
    const report = u.reported.map((n) => ({ settlement_id: SETL(n === 5 ? 3 : n === 3 ? 2 : 1), entity_id: PAY(n) }));
    return { obs, report };
  }
  const key = (r: readonly DocumentedTargetRow[]): string =>
    JSON.stringify([...r].sort((a, b) => (a.target_id < b.target_id ? -1 : 1)).map((x) => [x.target_id, x.documented, x.gap_bps, x.anchored_count]));
  /** A deterministic permutation keyed by `salt`. */
  function shuffled<T>(xs: readonly T[], salt: number): T[] {
    return xs
      .map((x, i) => ({ x, k: Math.imul(i + 1 + salt, 2654435761) >>> 0 }))
      .sort((a, b) => a.k - b.k)
      .map((p) => p.x);
  }

  it("TA and DISCRIMINABLE are disjoint, every target has one class, and neither holds below two allocations", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(universe, (u) => {
        const { obs, report } = build(u);
        for (const r of rows(obs, report)) {
          seen.add(r.documented);
          expect(DOCUMENTED_CLASSES).toContain(r.documented);
          expect(documentedTrulyAmbiguous(r) && documentedDiscriminable(r)).toBe(false);
          if (r.structural.solution_count < 2) {
            expect(documentedTrulyAmbiguous(r) || documentedDiscriminable(r)).toBe(false);
            expect(r.gap_bps).toBeNull();
          }
          if (r.gap_bps !== null) expect(documentedDiscriminable(r)).toBe(r.gap_bps >= EPSILON_BPS);
        }
      }),
      { numRuns: RUNS },
    );
    // The generator must reach both populations, or the property is vacuous.
    expect(seen.has("TRULY_AMBIGUOUS") || seen.has("IMMATERIAL")).toBe(true);
    expect(seen.has("DISCRIMINABLE")).toBe(true);
    expect(seen.has("SINGLE")).toBe(true);
  });

  it("puts the boundary where RECONCILIATION_SPEC.md §6 does: Δs ≥ ε discriminates, Δs < ε does not", () => {
    // §6 step 3 (line 1045) and the engine's `deltaS >= epsilonBps`. Aligned at
    // Work Order 3c; this module read `> ε` before.
    expect(exchangeableClassOf(EPSILON_BPS, true)).toBe("DISCRIMINABLE");
    expect(exchangeableClassOf(EPSILON_BPS, false)).toBe("DISCRIMINABLE");
    expect(exchangeableClassOf(EPSILON_BPS - 1, true)).toBe("TRULY_AMBIGUOUS");
    expect(exchangeableClassOf(EPSILON_BPS - 1, false)).toBe("IMMATERIAL");
    expect(exchangeableClassOf(EPSILON_BPS + 1, true)).toBe("DISCRIMINABLE");
    expect(exchangeableClassOf(0, true)).toBe("TRULY_AMBIGUOUS");
  });

  it("is invariant under any reordering of the observations and of the report rows", () => {
    fc.assert(
      fc.property(universe, (u) => {
        const { obs, report } = build(u);
        expect(key(rows(shuffled(obs, u.seed), shuffled(report, u.seed ^ 0x5bd1)))).toBe(key(rows(obs, report)));
      }),
      { numRuns: RUNS },
    );
  });
});
