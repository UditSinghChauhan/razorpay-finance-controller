import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { P_MAX } from "@assay/engine";
import type { AgentInput, RunConfig } from "@assay/eval";
import { generateFamily, type FamilyId, type TrueState } from "@assay/generator";
import { verifyChain } from "@assay/ledger";
import { validate, type ValidatedProbeCall } from "@assay/probe";

import { ALL_AGENTS, agentById, bindProbeExecutor } from "../src/agents/index.js";
import { identifierRelation } from "../src/agents/assay.js";
import { encodeJsonl } from "../src/artifacts/jsonl.js";
import { PathGuardError } from "../src/fs/guard.js";
import { runAssayComposedFull, type AssayRunResult } from "../src/index.js";
import {
  ProbeSourceUnavailableError,
  dispatchProbe,
  reconReportExecutor,
  type ProbeExecutor,
} from "../src/probe/surface.js";

/**
 * Work Order 3c, Phase C — the probe executor and the `ASSAY-PROBE` arm
 * (register rows `DATA_MODEL.md §22.2` M63, M66; `PREREGISTRATION.md §10` V41,
 * V43, V44).
 *
 * **This measures nothing and is not benchmark evidence.** Test seeds 7001–7003
 * are in no `§6.1` block and no bench-v2 corpus block; the assertions are the
 * SHAPE of the arm's behaviour that `docs/BENCH_V2_PREREGISTRATION.md` predicts,
 * checked on the generator's own families before any corpus exists.
 */

const SEED = 7001;
const config = (seed: number): RunConfig =>
  Object.freeze({ llm_mode: "offline", strict_replay: false, split: "train", seed });

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "assay-probe-arm-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Instance {
  readonly state: TrueState;
  readonly input: AgentInput;
  readonly executor: ProbeExecutor;
  readonly a3: AssayRunResult;
  readonly probe: AssayRunResult;
}

const cache = new Map<string, Promise<Instance>>();
function instance(family: FamilyId, seed = SEED): Promise<Instance> {
  const key = `${family}@${String(seed)}`;
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = (async (): Promise<Instance> => {
      const generated = generateFamily(family, seed);
      const path = join(dir, `recon_report_${key.replace("@", "_")}.jsonl`);
      writeFileSync(path, encodeJsonl(generated.recon_report), "utf8");
      const input = Object.freeze({ observations: generated.observations, config: config(seed) });
      const executor = reconReportExecutor(path);
      return {
        state: generated.true_state,
        input,
        executor,
        a3: await runAssayComposedFull(input, { agentId: "A3-NOLLM", llmModeOverride: "offline" }),
        probe: await runAssayComposedFull(input, {
          agentId: "ASSAY-PROBE",
          llmModeOverride: "offline",
          probeExecutor: executor,
        }),
      };
    })();
    cache.set(key, hit);
  }
  return hit;
}

/** Each settlement's true constituent entity ids. */
function truth(state: TrueState): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of state.settlements) {
    const ids = new Set<string>();
    for (const m of s.members) {
      const id =
        m.kind === "payment"
          ? state.payments[m.index]?.id
          : m.kind === "refund"
            ? state.refunds[m.index]?.id
            : state.adjustments[m.index]?.id;
      if (id !== undefined) ids.add(id);
    }
    out.set(s.id, ids);
  }
  return out;
}

function allocated(run: AssayRunResult): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const edge of run.run.allocations) {
    const set = out.get(edge.target_id) ?? new Set<string>();
    set.add(edge.entity_id);
    out.set(edge.target_id, set);
  }
  return out;
}

const abstainedTargets = (run: AssayRunResult): string[] =>
  run.evidence.decisions.filter((d) => d.kind === "settlement" && d.state === "ABSTAINED").map((d) => d.entity_id);

const probeEvents = (run: AssayRunResult) => run.evidence.chain.events.filter((e) => e.kind === "PROBE");

function call(probe: Parameters<typeof validate>[0]): ValidatedProbeCall {
  const checked = validate(probe, { hasEntityId: () => true }, 0, P_MAX);
  if (!checked.ok) throw new Error("fixture: invalid probe call");
  return checked.call;
}

// ---------------------------------------------------------------------------
// The executor (M63)
// ---------------------------------------------------------------------------

describe("the probe executor — PROBE_DISPATCH-zoned, read once, answers only a validated call", () => {
  const SETL = "setl_aaaaaaaaaaaaaa";
  const rows = [
    { settlement_id: SETL, entity_id: "pay_00000000000001", settled_at: 1 },
    { settlement_id: "setl_bbbbbbbbbbbbbb", entity_id: "pay_00000000000009", settled_at: null },
    { settlement_id: SETL, entity_id: "pay_00000000000002", settled_at: 1 },
    { settlement_id: null, entity_id: "pay_00000000000008", settled_at: null },
  ];

  it("reads nothing until asked, then exactly once for its lifetime", () => {
    const path = join(dir, "recon_report_memo.jsonl");
    writeFileSync(path, encodeJsonl(rows), "utf8");
    const executor = reconReportExecutor(path);
    expect(executor.reads()).toBe(0);

    const first = executor.execute(call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "d" }));
    expect(first.constituent_entity_ids).toStrictEqual(["pay_00000000000001", "pay_00000000000002"]);
    expect(executor.reads()).toBe(1);

    // The file is gone; a memoised executor still answers, and never re-reads.
    rmSync(path);
    for (let n = 0; n < 5; n += 1) {
      executor.execute(call({ probe: "fetch_settlement_recon", settlement_id: "setl_bbbbbbbbbbbbbb", date: "d" }));
    }
    expect(executor.reads()).toBe(1);
  });

  it("answers exactly as the per-call dispatch does", () => {
    const path = join(dir, "recon_report_parity.jsonl");
    writeFileSync(path, encodeJsonl(rows), "utf8");
    const executor = reconReportExecutor(path);
    for (const id of [SETL, "setl_bbbbbbbbbbbbbb", "setl_cccccccccccccc"]) {
      const c = call({ probe: "fetch_settlement_recon", settlement_id: id, date: "d" });
      expect(executor.execute(c)).toStrictEqual(dispatchProbe(c, { reconReportPath: path }));
    }
  });

  it("reads under PROBE_DISPATCH, so it cannot be bound to any other artifact", () => {
    const path = join(dir, "ground_truth.jsonl");
    writeFileSync(path, encodeJsonl(rows), "utf8");
    const executor = reconReportExecutor(path);
    expect(() =>
      executor.execute(call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "d" })),
    ).toThrow(PathGuardError);
  });

  it("refuses a probe with no committed source before touching the file", () => {
    const executor = reconReportExecutor(join(dir, "recon_report_absent.jsonl"));
    expect(() => executor.execute(call({ probe: "fetch_payment", payment_id: "pay_00000000000001" }))).toThrow(
      ProbeSourceUnavailableError,
    );
    expect(executor.reads()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SE5's identifier relation (M66)
// ---------------------------------------------------------------------------

describe("SE5's identifier relation is DATA_MODEL.md §12's — the recon_line (M66)", () => {
  it("maps every recon_line's entity_id to that recon_line, never to a payment or refund row", async () => {
    const { input } = await instance("A04");
    const relation = identifierRelation(input.observations);
    let lines = 0;
    for (const o of input.observations) {
      if (o.kind !== "recon_line") continue;
      lines += 1;
      expect(relation(o.payload.entity_id)).toBe(o.obs_id);
    }
    expect(lines).toBeGreaterThan(100);
    // The defect M66 closes: the same `pay_…` id is also a payment row's id.
    const shadowed = input.observations.filter(
      (o) => o.kind === "payment" && relation(o.payload.id) !== undefined && relation(o.payload.id) !== o.obs_id,
    );
    expect(shadowed.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The arm, through the real engine
// ---------------------------------------------------------------------------

describe("A04 — S₂ resolves with exactly one probe naming it, and commits the TRUE twin", () => {
  it("every S₂ A3-NOLLM abstained on is RECONCILED to its true single member", async () => {
    const i = await instance("A04");
    const truths = truth(i.state);
    const singles = abstainedTargets(i.a3).filter((id) => truths.get(id)?.size === 1);
    expect(singles).toHaveLength(3);

    const decisions = new Map(i.probe.evidence.decisions.map((d) => [d.entity_id, d]));
    const alloc = allocated(i.probe);
    for (const s2 of singles) {
      expect(decisions.get(s2)?.state, s2).toBe("RECONCILED");
      expect(alloc.get(s2), s2).toStrictEqual(truths.get(s2));
      // Exactly one dispatched probe names S₂.
      expect(probeEvents(i.probe).filter((e) => e.subject_ids.includes(s2)), s2).toHaveLength(1);
    }
    expect(i.probe.solve_outcomes.DISCRIMINATED).toBe(3);
  });

  it("S₁ still abstains, NO_USEFUL_PROBE_AVAILABLE — not resolved by elimination (V43)", async () => {
    const i = await instance("A04");
    const truths = truth(i.state);
    const s1s = abstainedTargets(i.a3).filter((id) => (truths.get(id)?.size ?? 0) > 1);
    expect(s1s).toHaveLength(3);
    const decisions = new Map(i.probe.evidence.decisions.map((d) => [d.entity_id, d]));
    for (const s1 of s1s) {
      const d = decisions.get(s1);
      expect(d?.state, s1).toBe("ABSTAINED");
      expect(d?.certificate?.reason, s1).toBe("NO_USEFUL_PROBE_AVAILABLE");
      expect(d?.certificate?.probes_attempted, s1).toHaveLength(2);
    }
  });

  it("commits nothing wrong: every target ASSAY-PROBE reconciles that A3-NOLLM did not is its truth", async () => {
    for (const seed of [7001, 7002, 7003]) {
      const i = await instance("A04", seed);
      const truths = truth(i.state);
      const before = new Map(i.a3.evidence.decisions.map((d) => [d.entity_id, d.state]));
      const alloc = allocated(i.probe);
      const flipped = i.probe.evidence.decisions.filter(
        (d) => d.kind === "settlement" && d.state === "RECONCILED" && before.get(d.entity_id) !== "RECONCILED",
      );
      expect(flipped, String(seed)).toHaveLength(3);
      for (const d of flipped) expect(alloc.get(d.entity_id), `${String(seed)} ${d.entity_id}`).toStrictEqual(truths.get(d.entity_id));
    }
  });
});

describe("AMB-1 and AMB-2 still abstain — V40's bound, measured", () => {
  for (const family of ["A01", "A02"] as const) {
    it(`${family}: every A3-NOLLM abstention stands, NO_USEFUL_PROBE_AVAILABLE in ≤ 2 probes`, async () => {
      const i = await instance(family);
      const before = abstainedTargets(i.a3).sort();
      expect(before).toHaveLength(6);
      expect(abstainedTargets(i.probe).sort()).toStrictEqual(before);
      const decisions = new Map(i.probe.evidence.decisions.map((d) => [d.entity_id, d]));
      for (const id of before) {
        const c = decisions.get(id)?.certificate;
        expect(c?.reason, id).toBe("NO_USEFUL_PROBE_AVAILABLE");
        expect(c?.probes_attempted.length ?? 99, id).toBeLessThanOrEqual(2);
        // The gap the probe opened is real and below ε: V40, not a dead signal.
        expect(c?.evidence_score_gap_bps ?? 0, id).toBeGreaterThan(0);
        expect(c?.evidence_score_gap_bps ?? 9999, id).toBeLessThan(c?.epsilon_bps ?? 0);
      }
      expect(i.probe.solve_outcomes.DISCRIMINATED).toBe(0);
    });
  }

  it("A03 never probes: its twins are IMMATERIALLY_AMBIGUOUS, which the loop does not enter", async () => {
    const i = await instance("A03");
    expect(i.probe.solve_outcomes.AMBIGUOUS).toBe(0);
    expect(probeEvents(i.probe)).toHaveLength(0);
    expect(i.executor.reads()).toBe(0);
  });
});

describe("the chain carries every dispatched probe, ahead of the decisions, and verifies", () => {
  for (const family of ["A01", "A04"] as const) {
    it(`${family}: one PROBE event per probe spent, before every decision event`, async () => {
      const i = await instance(family);
      const events = i.probe.evidence.chain.events;
      const probes = probeEvents(i.probe);
      expect(probes).toHaveLength(i.probe.run.probes_spent);
      expect(probes.length).toBeGreaterThan(0);
      const firstDecision = events.findIndex((e) => e.kind !== "PROBE");
      expect(events.slice(0, firstDecision).every((e) => e.kind === "PROBE")).toBe(true);
      expect(firstDecision).toBe(probes.length);
      for (const p of probes) {
        expect(p.journal_lines).toStrictEqual([]);
        expect(p.certificate).toBeNull();
        expect(p.decision_id).toBeNull();
        expect(p.subject_ids).toHaveLength(1);
        expect(p.actor.type).toBe("llm");
        expect(p.actor.llm_provider).toBe("offline");
        expect(p.actor.model_id).toBe("rules-v1");
        expect(p.actor.llm_call_id).not.toBeNull();
      }
    });

    it(`${family}: the ledger verifies end to end and every close gate holds`, async () => {
      const { evidence } = (await instance(family)).probe;
      const chain = evidence.chain;
      expect(verifyChain(chain.genesis_hash, chain.events, chain.root_hash).ok).toBe(true);
      expect(evidence.close.gate.failed_gates).toStrictEqual([]);
      expect(evidence.projection.trialBalanceOk).toBe(true);
    });
  }

  it("every R3 call is recorded: one per consultation, dispatched or declined", async () => {
    const i = await instance("A01");
    // 3 components x (2 proposals + 1 decline in the first target + 1 decline in the second).
    expect(i.probe.evidence.llm_calls).toHaveLength(12);
    expect(i.probe.evidence.llm_calls.every((c) => c.role === "R3_propose_probe")).toBe(true);
  });
});

describe("no component exceeds P_MAX", () => {
  for (const family of ["A01", "A02", "A04"] as const) {
    it(`${family}: per-component probes ≤ P_MAX, and they sum to the PROBE events`, async () => {
      const i = await instance(family);
      const perComponent = new Map<string, number>();
      for (const d of i.probe.evidence.decisions) {
        if (d.comp_id === null || d.certificate === null) continue;
        perComponent.set(d.comp_id, Math.max(perComponent.get(d.comp_id) ?? 0, d.certificate.probes_attempted.length));
      }
      for (const [comp, n] of perComponent) expect(n, comp).toBeLessThanOrEqual(P_MAX);
      expect([...perComponent.values()].reduce((a, b) => a + b, 0)).toBe(probeEvents(i.probe).length);
    });
  }
});

describe("ASSAY-PROBE differs from A3-NOLLM in exactly one respect", () => {
  it("where nothing is AMBIGUOUS the executor is never read and the chain is A3-NOLLM's", async () => {
    for (const family of ["B01", "A05", "A03"] as const) {
      const i = await instance(family);
      expect(i.executor.reads(), family).toBe(0);
      expect(i.probe.evidence.chain.root_hash, family).toBe(i.a3.evidence.chain.root_hash);
      expect(i.probe.evidence.decisions, family).toStrictEqual(i.a3.evidence.decisions);
    }
  });

  it("the unbound arm refuses to run; the composition root binds it, lazily", async () => {
    await expect(agentById("ASSAY-PROBE").run((await instance("B01")).input)).rejects.toThrow(/ASSAY-PROBE/);
    let built = 0;
    const executorFor = (): ProbeExecutor => {
      built += 1;
      return reconReportExecutor(join(dir, "recon_report_never_read.jsonl"));
    };
    const withoutArm = bindProbeExecutor(ALL_AGENTS.filter((a) => a.id !== "ASSAY-PROBE"), executorFor);
    expect(built).toBe(0);
    expect(withoutArm.map((a) => a.id)).not.toContain("ASSAY-PROBE");
    const withArm = bindProbeExecutor(ALL_AGENTS, executorFor);
    expect(built).toBe(1);
    expect(withArm.map((a) => a.id)).toStrictEqual(ALL_AGENTS.map((a) => a.id));
  });
});
