import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CERTIFICATE_REASONS, verifyChain } from "@assay/ledger";
import type { AgentInput, RunConfig } from "@assay/eval";

import {
  loadObservations,
  runAssayComposedFull,
  type AssayRunResult,
  type DecisionEvidence,
} from "../src/index.js";

/**
 * The product surface over `demo/demo-500` — `ARCHITECTURE.md §9`'s
 * `apps/api` reads exactly what this test reads.
 *
 * **This measures nothing.** It asserts that the evidence a run already built
 * is now reachable from `@assay/cli`'s published surface, which is a statement
 * about a type and a return value. `demo/demo-500` is a product fixture: outside
 * `bench/`, never scored, not benchmark evidence, and barred from supporting any
 * benchmark claim — `demo/README.md` states the five boundaries in full. No
 * rate, accuracy, aggregate or agent comparison appears below.
 *
 * The path under test is a **projection**, not a second reconciliation. Every
 * value asserted is produced by the same `S1`–`S5` + ledger composition
 * `agentById("ASSAY").run(...)` drives; the only change is that it is returned
 * instead of discarded at the boundary.
 */

const FIXTURE = resolve(import.meta.dirname, "../../../demo/demo-500/observations.jsonl");

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: false,
  split: "train",
  seed: 0,
});

async function reconcile(): Promise<AssayRunResult> {
  const observations = loadObservations(FIXTURE);
  const input: AgentInput = Object.freeze({ observations, config: CONFIG });
  return runAssayComposedFull(input, { agentId: "ASSAY" });
}

describe("run evidence, surfaced for the product (ARCHITECTURE.md §9)", () => {
  it("returns the AgentRun unchanged beside the evidence", async () => {
    const result = await reconcile();

    // The measurement surface is untouched: the same run the Agent interface
    // returns, with §4's fields and no new one.
    expect(result.run.agent_id).toBe("ASSAY");
    expect(result.run.abstentions.length).toBeGreaterThanOrEqual(1);
    expect(result.solve_outcomes.AMBIGUOUS).toBeGreaterThanOrEqual(1);
  });

  it("carries at least one ABSTAINED decision with its ambiguity certificate", async () => {
    const { evidence } = await reconcile();

    const abstained = evidence.decisions.filter((d) => d.state === "ABSTAINED");
    expect(abstained.length).toBeGreaterThanOrEqual(1);

    // §6's certificate is on every abstained decision — target and member alike,
    // because the member's abstention IS the component's.
    for (const decision of abstained) {
      expect(decision.certificate).not.toBeNull();
    }

    // And on no other state: a certificate on a committed decision would be a
    // record of an abstention that never happened.
    for (const decision of evidence.decisions) {
      if (decision.state !== "ABSTAINED") expect(decision.certificate).toBeNull();
    }
  });

  it("reaches the certificate's reason, both solutions and its ₹ figures", async () => {
    const { evidence } = await reconcile();

    // One certificate per abstained component, de-duplicated across the
    // decisions that share it.
    expect(evidence.certificates.length).toBeGreaterThanOrEqual(1);
    const certificate = evidence.certificates[0];
    expect(certificate).toBeDefined();
    if (certificate === undefined) return;

    // DATA_MODEL.md §13's reason, from the frozen four.
    expect(CERTIFICATE_REASONS).toContain(certificate.reason);
    expect(certificate.reason).toBe("EVIDENCE_TIE");

    // PROJECT_SPEC.md §10 step 2: "explained equally well by {A,B,C} and by
    // {D,E}" — two named solutions, each with its members.
    expect(certificate.solution_a.member_obs_ids.length).toBeGreaterThan(0);
    expect(certificate.solution_b.member_obs_ids.length).toBeGreaterThan(0);
    expect(certificate.solution_a.candidate_id).not.toBe(certificate.solution_b.candidate_id);
    expect([...certificate.solution_a.member_obs_ids]).not.toEqual([
      ...certificate.solution_b.member_obs_ids,
    ]);

    // "They differ by ₹X in Merchant Payable" — the materiality figure, above τ.
    expect(certificate.materiality_paise).toBeGreaterThan(certificate.tau_paise);

    // "No admissible evidence discriminates them" — the gap, below ε.
    expect(certificate.evidence_score_gap_bps).toBeLessThan(certificate.epsilon_bps);

    // "Both satisfy all N hard constraints" — the shared set the UI renders.
    expect(Array.isArray(certificate.shared_hard_constraints)).toBe(true);
  });

  it("links each decision to its own event in the hash chain", async () => {
    const { evidence } = await reconcile();

    const byEvtId = new Map(evidence.chain.events.map((e) => [e.evt_id, e]));

    const abstained = evidence.decisions.find(
      (d): d is DecisionEvidence => d.state === "ABSTAINED" && d.suspense_key !== null,
    );
    expect(abstained).toBeDefined();
    if (abstained === undefined) return;

    // §9's "hash-chain segment": the decision names an event that is actually
    // on the chain, and that event carries the same certificate and decision.
    const event = byEvtId.get(abstained.evt_id);
    expect(event).toBeDefined();
    if (event === undefined) return;
    expect(event.decision_id).toBe(abstained.decision_id);
    expect(event.certificate).toEqual(abstained.certificate);

    // Every decision resolves to an event, so the drill-down never dead-ends.
    for (const decision of evidence.decisions) {
      expect(byEvtId.has(decision.evt_id), decision.decision_id).toBe(true);
    }

    // The chain the product serves is the one G4 was run against, and it
    // verifies from genesis against the stored root — which is G4 in full, and
    // exactly what `GET /runs/:id/ledger/verify` re-runs live.
    const verification = verifyChain(
      evidence.chain.genesis_hash,
      evidence.chain.events,
      evidence.chain.root_hash,
    );
    expect(verification.failures).toEqual([]);
    expect(verification.ok).toBe(true);
    expect(verification.root_hash).toBe(evidence.chain.root_hash);
    expect(evidence.chain.root_hash).toBe(evidence.close.gate.recomputed_root_hash);
  });

  it("carries the close report, its gates and the Layer B projection", async () => {
    const { evidence, run } = await reconcile();

    expect(evidence.close.period_status).toBe("OPEN");
    // §10.2 / §L.1 rule 7: a report exists for every outcome but BLOCKED.
    expect(evidence.close.report).not.toBeNull();

    // All five gates, always — §10.2 requires the failing gate to be named.
    expect(evidence.close.gate.failed_gates).toEqual([]);
    expect(evidence.close.gate.g1_all_terminal).toBe(true);
    expect(evidence.close.gate.g2_trial_balance).toBe(true);
    expect(evidence.close.gate.g3_suspense_identity).toBe(true);
    expect(evidence.close.gate.g4_hash_chain).toBe(true);
    expect(evidence.close.gate.g5_no_failed_invariant_posted).toBe(true);

    // An abstained target holds the period open on unresolved value.
    expect(evidence.close.gate.unresolved_value_paise).toBeGreaterThan(0);

    // Layer B, recomputed from the log rather than cached.
    expect(evidence.projection.trialBalanceOk).toBe(true);
    expect(evidence.projection.totalDrPaise).toBe(evidence.projection.totalCrPaise);
    expect(evidence.projection.journalLineCount).toBeGreaterThan(0);

    // The evidence and the scored run describe one execution, not two.
    expect(run.close?.unresolved_value_paise).toBe(evidence.close.gate.unresolved_value_paise);
    expect(run.close?.ledger_root_hash).toBe(evidence.chain.root_hash);
  });

  it("carries the exception queue with the rupee value §9 ranks it by", async () => {
    const { evidence, run } = await reconcile();

    const exceptions = evidence.decisions.filter((d) => d.state === "EXCEPTION");
    expect(exceptions.length).toBeGreaterThanOrEqual(1);

    for (const decision of exceptions) {
      // §14: every exception carries a class. The queue can rank and filter on
      // exactly the two fields §9's endpoint names.
      expect(decision.exception_class).not.toBeNull();
      expect(decision.value_paise).toBeGreaterThanOrEqual(0);
      expect(decision.entity_id.length).toBeGreaterThan(0);
    }

    // The same population the scoring projection reports, reached the other way.
    expect(exceptions).toHaveLength(run.open_exceptions.length);

    // §13: a REFERENCE observation "produces no Decision at all", so it holds a
    // terminal state for G1 and reaches the chain never. `DecisionState` cannot
    // spell REFERENCE, so the type already forbids one here; what needs checking
    // is that those observations are absent rather than silently restated under
    // another state.
    const posted = new Set(evidence.decisions.map((d) => d.obs_id));
    const reference = run.outcomes.filter((o) => o.state === "REFERENCE");
    expect(reference.length).toBeGreaterThan(0);
    for (const outcome of reference) expect(posted.has(outcome.obs_id)).toBe(false);

    // Every other observation does reach the chain — §L.1 rule 5's "exactly one
    // terminal state ... no fifth state, no drop path", read off the evidence.
    expect(posted.size).toBe(run.outcomes.length - reference.length);
  });
});
