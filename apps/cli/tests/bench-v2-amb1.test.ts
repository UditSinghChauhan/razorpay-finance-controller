import { describe, expect, it } from "vitest";

import { EPSILON_BPS, TAU, anchor } from "@assay/engine";
import type { AgentInput, RunConfig } from "@assay/eval";
import { DECLARED_SEEDS, generateFamily } from "@assay/generator";
import { labelAll, oracleContext } from "@assay/oracle";

import { runAssayComposedFull, type AssayRunResult } from "../src/index.js";

/**
 * bench-v2 `A01` (`AMB-1`) through the real engine — the increment's
 * acceptance criterion (`docs/BENCH_V2_DESIGN.md §B`).
 *
 * **This measures nothing and is not benchmark evidence.** `A01` is a STRESS
 * family whose prevalence is a declared parameter (`§A`); the seed below is in
 * no `§6.1` block; no corpus is generated and nothing is sealed. What is
 * asserted is the *shape* of the engine's verdict on one generated instance:
 * that a settlement with two admissible, both-measurable, materially different
 * allocations reaches `AMBIGUOUS` with certificate reason **`EVIDENCE_TIE`** —
 * and not `MATERIALITY_UNDETERMINED`, which is spec 1.4.39's path for a target
 * without a bank comparand and would exercise the M61 fix, not the thesis.
 *
 * Composed exactly as `agentById("ASSAY").run(...)` composes it; the only
 * difference is that the evidence is returned instead of discarded.
 */

const SEED = 7001;
if (DECLARED_SEEDS.includes(SEED)) {
  throw new Error(`bench-v2-amb1: ${String(SEED)} is a declared §6.1 split seed.`);
}

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: false,
  split: "train",
  seed: SEED,
});

const family = generateFamily("A01", SEED);

let cached: Promise<AssayRunResult> | null = null;
function reconcile(): Promise<AssayRunResult> {
  cached ??= runAssayComposedFull(
    Object.freeze({ observations: family.observations, config: CONFIG }) satisfies AgentInput,
    { agentId: "ASSAY" },
  );
  return cached;
}

/** The six twin-hosting settlements, keyed by entity id, with their twin's recon-line obs_id. */
function twinTargets(): Map<string, { twin: string; other: string }> {
  const state = family.true_state;
  const lineObsId = new Map<string, string>();
  for (const o of family.observations) {
    if (o.kind === "recon_line") lineObsId.set(o.payload.entity_id, o.obs_id);
  }
  const out = new Map<string, { twin: string; other: string }>();
  for (const split of state.split_batches) {
    const a = state.payments[split.twin_a];
    const b = state.payments[split.twin_b];
    const sa = state.settlements[split.settlement_a_index];
    const sb = state.settlements[split.settlement_b_index];
    if (a === undefined || b === undefined || sa === undefined || sb === undefined) throw new Error("twin missing");
    const oa = lineObsId.get(a.id);
    const ob = lineObsId.get(b.id);
    if (oa === undefined || ob === undefined) throw new Error("twin line missing");
    out.set(sa.id, { twin: oa, other: ob });
    out.set(sb.id, { twin: ob, other: oa });
  }
  return out;
}

describe("bench-v2 AMB-1 — the engine abstains with EVIDENCE_TIE, not MATERIALITY_UNDETERMINED", () => {
  it("reaches AMBIGUOUS on every twin-hosting settlement and on nothing else", async () => {
    const result = await reconcile();
    const targets = twinTargets();
    expect(targets.size).toBe(6);
    expect(result.solve_outcomes.AMBIGUOUS).toBe(6);
    expect(result.solve_outcomes.INTRACTABLE).toBe(0);
    expect(result.solve_outcomes.DISCRIMINATED).toBe(0);
    const abstained = new Set(result.run.abstentions.map((a) => a.source_entity_id));
    for (const id of targets.keys()) expect(abstained.has(id), id).toBe(true);
    expect(abstained.size).toBe(6);
  });

  it("certifies EVIDENCE_TIE with a DEFINED materiality above tau and a sub-epsilon gap", async () => {
    const { evidence } = await reconcile();
    const targets = twinTargets();
    const certificateOf = new Map(
      evidence.decisions
        .filter((d) => d.state === "ABSTAINED" && d.kind === "settlement")
        .map((d) => [d.entity_id, d.certificate] as const),
    );
    for (const [target, { twin, other }] of targets) {
      const certificate = certificateOf.get(target);
      expect(certificate, target).toBeDefined();
      if (certificate === undefined || certificate === null) continue;
      expect(certificate.reason).toBe("EVIDENCE_TIE");
      expect(certificate.reason).not.toBe("MATERIALITY_UNDETERMINED");
      expect(certificate.probes_attempted).toStrictEqual([]);
      // Both live signals silent: the twins share settled_at AND created_at.
      expect(certificate.evidence_score_gap_bps).toBe(0);
      expect(certificate.epsilon_bps).toBe(EPSILON_BPS);
      // Materiality is a NUMBER — the bank comparand existed — and clears tau.
      expect(certificate.materiality_paise).toBeGreaterThan(certificate.tau_paise);
      expect(certificate.tau_paise).toBeGreaterThanOrEqual(TAU.floor_paise);
      // The two solutions are the two twins, one each, both admissible.
      const members = [certificate.solution_a.member_obs_ids, certificate.solution_b.member_obs_ids];
      for (const m of members) expect(m.filter((id) => id === twin || id === other)).toHaveLength(1);
      expect(new Set(members.flatMap((m) => m.filter((id) => id === twin || id === other)))).toStrictEqual(
        new Set([twin, other]),
      );
      expect(certificate.shared_hard_constraints.length).toBeGreaterThan(0);
    }
  });

  it("gives every twin-hosting settlement an AN2 bank line — the comparand materiality needs", () => {
    const anchors = anchor([...family.observations].sort((a, b) => (a.obs_id < b.obs_id ? -1 : 1)));
    const settlementObs = new Map(
      family.observations.filter((o) => o.kind === "settlement").map((o) => [o.kind === "settlement" ? o.payload.id : "", o.obs_id]),
    );
    for (const target of twinTargets().keys()) {
      const obsId = settlementObs.get(target);
      const an2 = anchors.links.filter((l) => l.anchor === "AN2" && (l.source_obs_id === obsId || l.target_obs_id === obsId));
      expect(an2, target).toHaveLength(1);
    }
  });

  it("agrees with the oracle: TRULY_AMBIGUOUS with exactly two solutions on each", () => {
    const run = labelAll(family.observations, oracleContext(family.observations));
    const targets = twinTargets();
    const truly = run.labels.filter((l) => l.label === "TRULY_AMBIGUOUS");
    expect(truly.map((l) => l.target_id).sort()).toStrictEqual([...targets.keys()].sort());
    for (const label of truly) {
      expect(label.solution_count).toBe(2);
      expect(label.max_materiality_paise).toBeGreaterThan(label.tau_paise);
    }
  });
});
