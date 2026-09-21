import { describe, expect, it } from "vitest";

import { anchor, buildSeam, EPSILON_BPS, TAU } from "@assay/engine";
import { abstentionMetrics, type AgentInput, type RunConfig } from "@assay/eval";
import { DECLARED_SEEDS, generateFamily, type FamilyId, type TrueState } from "@assay/generator";
import { completenessGate, labelAll, oracleContext, type OracleRun } from "@assay/oracle";

import { trueAllocations } from "../src/artifacts/gate.js";
import { runAssayComposedFull, type AssayRunResult } from "../src/index.js";

/**
 * bench-v2, increment 2, through the real engine (`docs/BENCH_V2_DESIGN.md §C`).
 *
 * **This measures nothing and is not benchmark evidence.** Every family here
 * is a STRESS family at a test seed in no `§6.1` block (`§A`); no corpus is
 * generated and nothing is sealed. What is asserted is the SHAPE of the
 * engine's verdict on each family, against the expectation the design
 * recorded before the run — and, where the two differ, the difference is
 * pinned as a FINDING rather than hidden or redefined:
 *
 * - `A02` (AMB-2): `AMBIGUOUS` / `EVIDENCE_TIE`, oracle `TRULY_AMBIGUOUS`.
 * - `A03` (AMB-3): `IMMATERIALLY_AMBIGUOUS` at the frozen `tau`; `AMBIGUOUS` at
 *   the Rs 50 and Rs 10 sweep floors. FINDING: on a coupled pair the immaterial
 *   accept commits ONE target and the other fails `I2` into `E05`.
 * - `A05` (AMB-5): `ABSTAINED` / `SEARCH_BOUND_EXCEEDED`, oracle `UNAMBIGUOUS`,
 *   so frozen metric 4 scores it a FALSE abstention. FINDING: the bound is
 *   `S2`'s and `solve_outcomes.INTRACTABLE` does not count it.
 * - `B01` (BENIGN): every touched target reaches `S2` and none abstains.
 *
 * The three Part A investigations of `§C` are pinned in the last block:
 * the oracle/engine population identity (A1), the tie-break rate through
 * the engine over twenty seeds (A3), and the abstention cascade (A4).
 */

const SEED = 7001;
if (DECLARED_SEEDS.includes(SEED)) throw new Error(`bench-v2-families: ${String(SEED)} is a declared §6.1 seed.`);

const config = (seed: number): RunConfig => Object.freeze({ llm_mode: "offline", strict_replay: false, split: "train", seed });

interface Instance {
  readonly family: ReturnType<typeof generateFamily>;
  readonly state: TrueState;
  readonly oracle: OracleRun;
  readonly assay: AssayRunResult;
}

const cache = new Map<string, Promise<Instance>>();
function instance(family: FamilyId, seed = SEED): Promise<Instance> {
  const key = `${family}:${String(seed)}`;
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = (async (): Promise<Instance> => {
      const generated = generateFamily(family, seed);
      const input = Object.freeze({ observations: generated.observations, config: config(seed) }) satisfies AgentInput;
      return {
        family: generated,
        state: generated.true_state,
        oracle: labelAll(generated.observations, oracleContext(generated.observations)),
        assay: await runAssayComposedFull(input, { agentId: "ASSAY" }),
      };
    })();
    cache.set(key, hit);
  }
  return hit;
}

/** Settlement id of every member, from the true state. */
function settlementOfMember(state: TrueState): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of state.settlements) {
    for (const m of s.members) {
      const id = m.kind === "payment" ? state.payments[m.index]?.id : m.kind === "refund" ? state.refunds[m.index]?.id : state.adjustments[m.index]?.id;
      if (id !== undefined) out.set(id, s.id);
    }
  }
  return out;
}

/** The settlements whose lines the family detached. */
function touchedTargets(i: Instance): string[] {
  const by = settlementOfMember(i.state);
  return [...new Set(i.family.ground_truth.degradations.map((d) => by.get(d.target_id) ?? ""))].sort();
}

const decisionsOf = (i: Instance) => new Map(i.assay.evidence.decisions.map((d) => [d.entity_id, d]));
const labelsOf = (i: Instance) => new Map(i.oracle.labels.map((l) => [l.target_id, l]));
const valueOfTargets = (i: Instance) => new Map(i.state.settlements.map((s) => [s.id, s.amount]));

describe("A02 — refund-netting twins abstain with EVIDENCE_TIE; the oracle agrees", () => {
  it("reaches AMBIGUOUS on all six twin-hosting settlements, with a sub-epsilon non-zero gap", async () => {
    const i = await instance("A02");
    expect(i.assay.solve_outcomes.AMBIGUOUS).toBe(6);
    expect(i.assay.solve_outcomes.INTRACTABLE).toBe(0);
    expect(i.assay.solve_outcomes.DISCRIMINATED).toBe(0);
    expect(i.assay.solve_outcomes.IMMATERIALLY_AMBIGUOUS).toBe(0);
    const decisions = decisionsOf(i);
    const targets = touchedTargets(i);
    expect(targets).toHaveLength(6);
    for (const target of targets) {
      const d = decisions.get(target);
      expect(d?.state, target).toBe("ABSTAINED");
      const c = d?.certificate;
      if (c === undefined || c === null) throw new Error("no certificate");
      expect(c.reason).toBe("EVIDENCE_TIE");
      expect(c.probes_attempted).toStrictEqual([]);
      // The refund is raised after the capture, so its lag differs: SE3 no
      // longer ties exactly, but the gap is far below epsilon.
      expect(c.evidence_score_gap_bps).toBeGreaterThan(0);
      expect(c.evidence_score_gap_bps).toBeLessThan(EPSILON_BPS / 10);
      expect(c.materiality_paise).toBeGreaterThan(c.tau_paise);
      expect(c.tau_paise).toBeGreaterThanOrEqual(TAU.floor_paise);
    }
    expect(new Set(i.assay.run.abstentions.map((a) => a.source_entity_id))).toStrictEqual(new Set(targets));
  });

  it("names {P} and {P2, R1} as the two solutions — one payment against a payment and its refund", async () => {
    const i = await instance("A02");
    const decisions = decisionsOf(i);
    const entityOf = new Map<string, string>(i.family.observations.filter((o) => o.kind === "recon_line").map((o) => [o.obs_id, o.kind === "recon_line" ? o.payload.entity_id : ""]));
    const dropped = new Set(i.family.ground_truth.degradations.map((d) => d.target_id));
    for (const target of touchedTargets(i)) {
      const c = decisions.get(target)?.certificate;
      if (c === undefined || c === null) throw new Error("no certificate");
      const detached = (ids: readonly string[]): string[] =>
        ids.map((id) => entityOf.get(id) ?? "").filter((e) => dropped.has(e)).map((e) => e.slice(0, 4)).sort();
      const shapes = [detached(c.solution_a.member_obs_ids), detached(c.solution_b.member_obs_ids)].map((s) => s.join("+"));
      expect(shapes.sort()).toStrictEqual(["pay_", "pay_+rfnd"]);
    }
  });

  it("agrees with the oracle: TRULY_AMBIGUOUS, two solutions, and the truth passes the completeness gate", async () => {
    const i = await instance("A02");
    const labels = labelsOf(i);
    for (const target of touchedTargets(i)) {
      expect(labels.get(target)?.label).toBe("TRULY_AMBIGUOUS");
      expect(labels.get(target)?.solution_count).toBe(2);
    }
    expect(i.oracle.labels.filter((l) => l.label === "TRULY_AMBIGUOUS")).toHaveLength(6);
    const gate = completenessGate(i.oracle.results, trueAllocations([i.family.ground_truth], i.family.observations));
    expect(gate.passed).toBe(true);
  });

  it("FINDING: the engine's best is the refund-carrying allocation on BOTH targets of a pair — right on one, wrong on the other", async () => {
    // SE3 is a mean over members; the refund's lag is shorter than its
    // parent's, so {P2, R1} scores above {P} by construction and `best` is the
    // same allocation for S1 and S2. A2's commit is therefore right on exactly
    // one target of every pair: the ratio is one half by SYMMETRY, not by the
    // coin that gives AMB-1 its half. Recorded so the two halves are not read
    // as one kind of evidence.
    const i = await instance("A02");
    const decisions = decisionsOf(i);
    const entityOf = new Map(i.family.observations.filter((o) => o.kind === "recon_line").map((o) => [o.obs_id, o.kind === "recon_line" ? o.payload.entity_id : ""]));
    const refundIds = new Set<string>(i.state.refunds.map((r) => r.id));
    for (const target of touchedTargets(i)) {
      const c = decisions.get(target)?.certificate;
      if (c === undefined || c === null) throw new Error("no certificate");
      expect(c.solution_a.member_obs_ids.some((id) => refundIds.has(entityOf.get(id) ?? ""))).toBe(true);
    }
  });
});

describe("A03 — sub-tau twins are IMMATERIALLY_AMBIGUOUS at the frozen tau, AMBIGUOUS under the sweep", () => {
  it("reaches IMMATERIALLY_AMBIGUOUS on all six and abstains on none; the oracle says the same", async () => {
    const i = await instance("A03");
    expect(i.assay.solve_outcomes.IMMATERIALLY_AMBIGUOUS).toBe(6);
    expect(i.assay.solve_outcomes.AMBIGUOUS).toBe(0);
    expect(i.assay.run.abstentions).toHaveLength(0);
    const labels = labelsOf(i);
    for (const target of touchedTargets(i)) {
      expect(labels.get(target)?.label).toBe("IMMATERIALLY_AMBIGUOUS");
      expect(labels.get(target)?.solution_count).toBe(2);
      expect(labels.get(target)?.tau_paise).toBe(TAU.floor_paise);
    }
  });

  it("makes the tau sweep non-flat: AMBIGUOUS on all six at the Rs 50 and Rs 10 floors", async () => {
    const i = await instance("A03");
    const input = Object.freeze({ observations: i.family.observations, config: config(SEED) }) satisfies AgentInput;
    for (const tauFloorPaise of [5_000, 1_000]) {
      const swept = await runAssayComposedFull(input, { agentId: "ASSAY", tauFloorPaise });
      expect(swept.solve_outcomes.AMBIGUOUS, `floor ${String(tauFloorPaise)}`).toBe(6);
      expect(swept.solve_outcomes.IMMATERIALLY_AMBIGUOUS).toBe(0);
      expect(swept.run.abstentions).toHaveLength(6);
    }
  });

  it("FINDING: on a coupled pair the immaterial accept commits one target and the other fails I2 into E05", async () => {
    // Both targets' best is the same twin (exact SE3 tie, smallest canonical
    // key), so the second target to post finds it allocated. Expected
    // behaviour of the frozen pipeline; the exception CLASS is a misnomer for
    // an I2 refusal, and the uncommitted twin lands in E02. Pinned as observed.
    const i = await instance("A03");
    const decisions = decisionsOf(i);
    const states = touchedTargets(i).map((t) => `${decisions.get(t)?.state ?? "?"}${decisions.get(t)?.exception_class === null ? "" : "/" + String(decisions.get(t)?.exception_class)}`).sort();
    expect(states).toStrictEqual([
      "EXCEPTION/E05_AMOUNT_MISMATCH", "EXCEPTION/E05_AMOUNT_MISMATCH", "EXCEPTION/E05_AMOUNT_MISMATCH",
      "RECONCILED", "RECONCILED", "RECONCILED",
    ]);
    const twins = i.family.ground_truth.degradations.map((d) => decisions.get(d.target_id));
    expect(twins.filter((d) => d?.state === "RECONCILED")).toHaveLength(3);
    expect(twins.filter((d) => d?.exception_class === "E02_MISSING_SETTLEMENT")).toHaveLength(3);
  });
});

describe("A05 — the search bound abstains with SEARCH_BOUND_EXCEEDED; metric 4 calls it false", () => {
  it("abstains on the three bound batches; the oracle enumerates 2^15 and labels them UNAMBIGUOUS", async () => {
    const i = await instance("A05");
    const decisions = decisionsOf(i);
    const labels = labelsOf(i);
    const results = new Map(i.oracle.results.map((r) => [r.target_id, r]));
    const targets = touchedTargets(i);
    expect(targets).toHaveLength(3);
    for (const target of targets) {
      const d = decisions.get(target);
      expect(d?.state).toBe("ABSTAINED");
      expect(d?.certificate?.reason).toBe("SEARCH_BOUND_EXCEEDED");
      expect(labels.get(target)?.label).toBe("UNAMBIGUOUS");
      expect(labels.get(target)?.solution_count).toBe(1);
      expect(results.get(target)?.pool_size).toBe(15);
      expect(results.get(target)?.candidates_enumerated).toBe(2 ** 15);
    }
    expect(i.assay.run.abstentions).toHaveLength(3);
  });

  it("scores ZERO abstention precision under frozen metric 4 — reported, not redefined", async () => {
    const i = await instance("A05");
    const report = abstentionMetrics(i.assay.run, i.oracle.labels, valueOfTargets(i));
    expect(report.abstained).toBe(3);
    expect(report.truly_ambiguous).toBe(0);
    expect(report.correctly_abstained).toBe(0);
    expect(report.abstention_precision).toBe(0);
  });

  it("FINDING: the bound is S2's — solve_outcomes.INTRACTABLE stays 0 and the certificate names two EMPTY solutions", async () => {
    // `solve` sees no candidate (the tie-out subset is the last mask, beyond
    // C_max) and returns UNIQUE with `best === null`; `classifyTarget` reads
    // the S2 generation status and abstains. The §6 tally therefore counts
    // these under UNIQUE, and `certificateFor` fills solution_a/solution_b
    // with empty allocations. Both are the frozen code as written.
    const i = await instance("A05");
    expect(i.assay.solve_outcomes.INTRACTABLE).toBe(0);
    const decisions = decisionsOf(i);
    for (const target of touchedTargets(i)) {
      const c = decisions.get(target)?.certificate;
      expect(c?.solution_a.member_obs_ids).toStrictEqual([]);
      expect(c?.solution_b.member_obs_ids).toStrictEqual([]);
      expect(c?.materiality_paise).toBe(0);
    }
    // And the cascade (A4) reaches the 45 detached lines too: E02, each.
    const detached = i.family.ground_truth.degradations.map((d) => decisions.get(d.target_id)?.exception_class);
    expect(detached).toHaveLength(45);
    expect(new Set(detached)).toStrictEqual(new Set(["E02_MISSING_SETTLEMENT"]));
  });
});

describe("B01 — BENIGN targets reach S2 and none abstains", () => {
  it("reconciles all twelve touched settlements; the oracle labels each UNAMBIGUOUS with one solution", async () => {
    const i = await instance("B01");
    const decisions = decisionsOf(i);
    const labels = labelsOf(i);
    const results = new Map(i.oracle.results.map((r) => [r.target_id, r]));
    const targets = touchedTargets(i);
    expect(targets).toHaveLength(12);
    for (const target of targets) {
      expect(decisions.get(target)?.state, target).toBe("RECONCILED");
      expect(labels.get(target)?.label).toBe("UNAMBIGUOUS");
      expect(labels.get(target)?.solution_count).toBe(1);
      // Reached S2: a non-empty pool was enumerated. BEN-1 pools one line;
      // BEN-2 and BEN-3 pool two, and enumerate four subsets for one admissible.
      expect(results.get(target)?.pool_size).toBeGreaterThanOrEqual(1);
    }
    expect(i.assay.run.abstentions).toHaveLength(0);
    expect(i.assay.solve_outcomes.AMBIGUOUS + i.assay.solve_outcomes.IMMATERIALLY_AMBIGUOUS).toBe(0);
    // Every detached line was committed to its own settlement.
    for (const d of i.family.ground_truth.degradations) expect(decisions.get(d.target_id)?.state).toBe("RECONCILED");
    const truth = new Map(i.family.ground_truth.allocations.map((a) => [a.entity_id, a.settlement_id]));
    for (const edge of i.assay.run.allocations) {
      if (truth.has(edge.entity_id)) expect(truth.get(edge.entity_id)).toBe(edge.target_id);
    }
  });

  it("gives a false-abstention denominator of twelve on this instance, with a numerator of zero", async () => {
    const i = await instance("B01");
    const determinable = i.oracle.labels.filter((l) => l.target_kind === "settlement" && l.label === "UNAMBIGUOUS" && (i.oracle.results.find((r) => r.target_id === l.target_id)?.pool_size ?? 0) > 0);
    expect(determinable).toHaveLength(12);
    const abstained = new Set(i.assay.run.abstentions.map((a) => a.source_entity_id));
    expect(determinable.filter((l) => abstained.has(l.target_id))).toHaveLength(0);
  });
});

describe("§C Part A, pinned", () => {
  it("A1: the oracle's 28 UNAMBIGUOUS on A01 are the 28 AN1-anchor-resolved settlements, none of which reaches S2", async () => {
    // Two populations, not one. The oracle labels every settlement, anchored
    // or not; the engine's `solve_outcomes` tallies only `seam.targets`. The
    // 28 UNAMBIGUOUS are fully-anchored settlements resolved at S1; the 21
    // UNIQUE are the 21 bank lines AN2 did not match, each with zero
    // candidates and `best === null`, sent to E03. The two sets are disjoint;
    // "28 - 21 = 7 missing targets" is a coincidence of unrelated counts.
    const i = await instance("A01");
    const sorted = [...i.family.observations].sort((a, b) => (a.obs_id < b.obs_id ? -1 : 1));
    const seam = buildSeam({ observations: sorted, anchors: anchor(sorted) });
    const entityOfObs = new Map(sorted.map((o) => [o.obs_id, o.kind === "settlement" ? o.payload.id : o.kind === "bank_line" ? o.payload.bank_line_id : ""]));
    const anchorResolvedSettlements = new Set(seam.anchor_resolved.filter((r) => r.kind === "settlement").map((r) => entityOfObs.get(r.obs_id)));
    const unambiguous = new Set(i.oracle.labels.filter((l) => l.label === "UNAMBIGUOUS").map((l) => l.target_id));
    expect(unambiguous.size).toBe(28);
    expect(anchorResolvedSettlements).toStrictEqual(unambiguous);
    const unmatchedBankLines = seam.targets.filter((t) => t.kind === "bank_line").length;
    expect(unmatchedBankLines).toBe(21);
    expect(i.assay.solve_outcomes.UNIQUE).toBe(unmatchedBankLines);
    const decisions = decisionsOf(i);
    for (const target of unambiguous) expect(decisions.get(target)?.state).toBe("RECONCILED");
    // Nothing the oracle calls determinable reached S2 on this family: the
    // false-abstention denominator on AMB-1 alone is EMPTY, which is why B01 exists.
    expect(seam.targets.filter((t) => t.kind === "settlement")).toHaveLength(6);
  });

  it("A2: the engine's floor-tau and the oracle's round-half-up-tau differ by at most one paisa, and never straddle a materiality", async () => {
    for (const family of ["A01", "A02"] as const) {
      const i = await instance(family);
      const decisions = decisionsOf(i);
      const labels = labelsOf(i);
      for (const target of touchedTargets(i)) {
        const c = decisions.get(target)?.certificate;
        const l = labels.get(target);
        if (c === undefined || c === null || l === undefined) throw new Error("certificate or label missing");
        expect(Math.abs(c.tau_paise - l.tau_paise)).toBeLessThanOrEqual(1);
        const lo = Math.min(c.tau_paise, l.tau_paise);
        const hi = Math.max(c.tau_paise, l.tau_paise);
        const m = c.materiality_paise ?? -1;
        expect(m > lo && m <= hi, `${family} ${target}: materiality inside the disagreement window`).toBe(false);
        expect(m - hi).toBeGreaterThanOrEqual(100);
      }
    }
  });

  // A3 through the engine: `best` (what A2-NOABSTAIN commits) is the truth
  // twin on one half of the abstained targets — R3's leak detector (§4.4),
  // measured rather than argued. Twenty seeds, chunked to stay inside the
  // per-test budget; the band is the fair-coin band at n = 120.
  const chunks = [[7001, 7002, 7003, 7004], [7005, 7006, 7007, 7008], [7009, 7010, 7011, 7012], [7013, 7014, 7015, 7016], [7017, 7018, 7019, 7020]] as const;
  const tally = { targets: 0, bestIsTruth: 0 };
  it.each(chunks)("A3: best-is-truth counted on seeds %d..", async (...seeds) => {
    for (const seed of seeds) {
      const i = await instance("A01", seed);
      const truth = new Map(i.family.ground_truth.allocations.map((a) => [a.entity_id, a.settlement_id]));
      const entityOf = new Map(i.family.observations.filter((o) => o.kind === "recon_line").map((o) => [o.obs_id, o.kind === "recon_line" ? o.payload.entity_id : ""]));
      const twins = new Set(i.family.ground_truth.degradations.map((d) => d.target_id));
      for (const d of i.assay.evidence.decisions) {
        if (d.state !== "ABSTAINED" || d.kind !== "settlement" || d.certificate === null) continue;
        tally.targets += 1;
        const twin = d.certificate.solution_a.member_obs_ids.map((id) => entityOf.get(id)).find((e) => e !== undefined && twins.has(e));
        if (twin !== undefined && truth.get(twin) === d.entity_id) tally.bestIsTruth += 1;
      }
    }
  });
  it("A3: over twenty seeds the tie-broken twin is the truth twin on about one half of the abstained targets", () => {
    expect(tally.targets).toBe(120);
    expect(tally.bestIsTruth / tally.targets).toBeGreaterThanOrEqual(0.38);
    expect(tally.bestIsTruth / tally.targets).toBeLessThanOrEqual(0.62);
  });

  it("A4: an abstained settlement's anchored constituents cascade to E02/E11 and post their own Suspense items", async () => {
    // `classifyMember` gives ABSTAINED/MEMBER only to POOL members of an
    // abstained component; an abstained target commits no allocation, so its
    // AN1-anchored lines have no `targetOfMember` entry and fall through to
    // E02 (payments) / E11 (refunds). E02 posts P6, so each such line opens a
    // Suspense item of its own beside the target's — the settlement's amount
    // and its constituents' amounts are both in `unresolved_value_paise`.
    // Observed on A01 at 7001; pinned as the frozen code's behaviour, not as
    // its specification.
    const i = await instance("A01");
    const decisions = decisionsOf(i);
    const by = settlementOfMember(i.state);
    const twins = new Set(i.family.ground_truth.degradations.map((d) => d.target_id));
    const abstained = new Set(i.assay.run.abstentions.map((a) => a.source_entity_id));
    expect(abstained.size).toBe(6);
    const constituents = [...by].filter(([id, s]) => abstained.has(s) && !twins.has(id)).map(([id]) => id);
    expect(constituents).toHaveLength(54);
    const states = constituents.map((id) => `${decisions.get(id)?.state ?? "?"}/${String(decisions.get(id)?.exception_class)}`);
    expect(states.filter((s) => s === "EXCEPTION/E02_MISSING_SETTLEMENT")).toHaveLength(51);
    expect(states.filter((s) => s === "EXCEPTION/E11_TIMING_BOUNDARY")).toHaveLength(3);
    const ownSuspense = constituents.filter((id) => decisions.get(id)?.suspense_key !== null);
    expect(ownSuspense).toHaveLength(51);
    const constituentSuspenseValue = ownSuspense.reduce((t, id) => t + (decisions.get(id)?.value_paise ?? 0), 0);
    expect(constituentSuspenseValue).toBe(38_599_217);
    expect(i.assay.run.close?.value_abstained_paise).toBe(51_685_195);
    // The twins themselves are ABSTAINED/MEMBER and post nothing: §17.1.1's
    // third abstention row, working as written.
    for (const twin of twins) {
      expect(decisions.get(twin)?.state).toBe("ABSTAINED");
      expect(decisions.get(twin)?.suspense_key).toBeNull();
    }
  });

  it("A4: A2-NOABSTAIN commits on three of the six and fails I2 on the other three; the fallout cascades the same way", async () => {
    const i = await instance("A01");
    const input = Object.freeze({ observations: i.family.observations, config: config(SEED) }) satisfies AgentInput;
    const a2 = await runAssayComposedFull(input, { agentId: "A2-NOABSTAIN", commitOnAbstain: true });
    const decisions = new Map(a2.evidence.decisions.map((d) => [d.entity_id, d]));
    const abstainedByAssay = new Set(i.assay.run.abstentions.map((a) => a.source_entity_id));
    const states = [...abstainedByAssay].map((t) => `${decisions.get(t)?.state ?? "?"}${decisions.get(t)?.exception_class === null ? "" : "/" + String(decisions.get(t)?.exception_class)}`).sort();
    expect(states).toStrictEqual([
      "EXCEPTION/E05_AMOUNT_MISMATCH", "EXCEPTION/E05_AMOUNT_MISMATCH", "EXCEPTION/E05_AMOUNT_MISMATCH",
      "RECONCILED", "RECONCILED", "RECONCILED",
    ]);
    expect(a2.run.abstentions).toHaveLength(0);
    // Rupees committed where ASSAY abstained: the three targets' constituents
    // and the three tie-broken twins. The wrong-in-fact share is one of three
    // twins on this seed — the twenty-seed rate is the A3 block above.
    const amountOf = new Map(i.family.observations.filter((o) => o.kind === "recon_line").map((o) => [o.kind === "recon_line" ? o.payload.entity_id : "", o.kind === "recon_line" ? o.payload.amount : 0]));
    const committed = a2.run.allocations.filter((e) => abstainedByAssay.has(e.target_id));
    expect(committed).toHaveLength(33);
    expect(committed.reduce((t, e) => t + (amountOf.get(e.entity_id) ?? 0), 0)).toBe(30_657_500);
    const truth = new Map(i.family.ground_truth.allocations.map((a) => [a.entity_id, a.settlement_id]));
    const wrong = committed.filter((e) => truth.get(e.entity_id) !== e.target_id);
    expect(wrong).toHaveLength(2);
    expect(wrong.reduce((t, e) => t + (amountOf.get(e.entity_id) ?? 0), 0)).toBe(2_235_390);
    expect((i.assay.run.close?.unresolved_value_paise ?? 0) - (a2.run.close?.unresolved_value_paise ?? 0)).toBe(66_081_485);
  });
});
