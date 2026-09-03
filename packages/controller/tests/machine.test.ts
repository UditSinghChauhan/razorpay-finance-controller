import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_DECISION,
  CLOSE_REPORT,
  EXCEPTION_QUEUE,
  RUN_ID,
  fixtureRegistry,
} from "./support/fixture-registry.js";
import { runController } from "../src/machine.js";

/**
 * The controller, driven end to end against **real, captured `demo-500`
 * evidence** — no server, no socket, no model, `DECISION_BRIEF.md §L.1` rule
 * 10 and `§L.4`'s bar on a live-model test held by construction.
 *
 * These nine `it` blocks are this phase's acceptance requirement, one each:
 * the controller observes the run, identifies the one ambiguous component and
 * the twenty exceptions, inspects the ambiguous decision, inspects its
 * certificate, recognises `EVIDENCE_TIE`, attempts no financial mutation,
 * produces an explicit escalation, records an auditable trace, and is
 * reproducible.
 */

describe("1. the controller observes the demo run", () => {
  it("reads chain integrity and the close gate before acting", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const tools = trace.steps.map((s) => s.tool).filter((t) => t !== null);
    expect(tools[0]).toBe("ledger_verify");
    expect(tools).toContain("close_report");
    expect(trace.residual_trajectory).toHaveLength(1);
    expect(trace.residual_trajectory[0]?.unresolved_value_paise).toBe(
      CLOSE_REPORT.unresolved_value_paise,
    );
    expect(trace.residual_trajectory[0]?.period_status).toBe("OPEN");
  });
});

describe("2. it identifies the 1 ambiguous component and 20 exceptions", () => {
  it("the real fixture queue holds exactly this population", () => {
    // Asserted on the fixture directly, so the claim is checkable independent
    // of the controller: this is what the engine actually produced.
    const abstained = EXCEPTION_QUEUE.items.filter((i) => i.state === "ABSTAINED");
    const exceptions = EXCEPTION_QUEUE.items.filter((i) => i.state === "EXCEPTION");
    const abstainedComponents = new Set(abstained.map((i) => i.comp_id));
    expect(abstainedComponents.size).toBe(1);
    expect(exceptions).toHaveLength(20);
    // Every exception is E13_LEDGER_ONLY on a ledger_entry with no Suspense
    // key — §17.1.1's total posting table gives that kind no posting in any
    // state, so none of the 20 can move the residual.
    expect(exceptions.every((i) => i.exception_class === "E13_LEDGER_ONLY")).toBe(true);
    expect(exceptions.every((i) => i.suspense_key === null)).toBe(true);
  });

  it("the controller's queue read carries the same population", async () => {
    // Two steps touch exception_queue: the call itself (tool set, note "read
    // both populations, value-ranked") and the following decision, made once
    // the result has landed (tool null, note carrying the counts). The
    // population summary is on the second.
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const summary = trace.steps.find((s) => s.observation_summary.includes("queue items"));
    expect(summary?.observation_summary).toContain("26 queue items");
    expect(summary?.observation_summary).toContain("6 abstained");
    expect(summary?.observation_summary).toContain("20 exceptions");
  });

  it("the plan's eligible set is exactly the one component's target", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.plan).not.toBeNull();
    // 25 of 26 rows carry no Suspense key and cannot move the residual — the
    // five recon_line MEMBERS of the ambiguous component, whose posting
    // happens at the settlement target, and all twenty E13_LEDGER_ONLY rows.
    expect(trace.plan?.ineligible_count).toBe(25);
    expect(trace.plan?.eligible).toHaveLength(1);
    expect(trace.plan?.eligible[0]?.decision_id).toBe(AMBIGUOUS_DECISION.decision_id);
    expect(trace.plan?.ids).toEqual([AMBIGUOUS_DECISION.decision_id]);
  });
});

describe("3. it inspects the ambiguous decision", () => {
  it("calls decision_evidence for the settlement the plan selected", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const inspect = trace.steps.find(
      (s) => s.tool === "decision_evidence" && s.observation_summary.includes(AMBIGUOUS_DECISION.decision_id),
    );
    expect(inspect).toBeDefined();
    expect(inspect?.state).toBe("ACT");
  });
});

describe("4. it inspects its certificate", () => {
  it("the escalation record carries the certificate's own fields", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.escalations).toHaveLength(1);
    const record = trace.escalations[0];
    expect(record?.decision_id).toBe(AMBIGUOUS_DECISION.decision_id);
    expect(record?.evidence_score_gap_bps).toBe(0);
    expect(record?.epsilon_bps).toBe(1500);
    expect(record?.materiality_paise).toBe(59_000);
    expect(record?.tau_paise).toBe(20_413);
    expect(record?.probes_attempted).toEqual([]);
    // §10 step 2's own demo figure: a ₹1,00,000 settlement.
    expect(record?.value_paise).toBe(10_000_000);
    expect(record?.suspense_key).toBe("setl_AMBIG000000000");
  });
});

describe("5. it recognises EVIDENCE_TIE", () => {
  it("the escalation reason and the certificate reason both say so", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const record = trace.escalations[0];
    expect(record?.certificate_reason).toBe("EVIDENCE_TIE");
    expect(record?.reason).toBe("AMBIGUOUS_CERTIFICATE");
    // The step note is where a human reading the trace sees the same fact.
    const act = trace.steps.find((s) => s.rule_fired === "P3_ESCALATE");
    expect(act?.observation_summary).toContain("EVIDENCE_TIE");
    expect(act?.observation_summary).toContain("0 bps");
  });
});

describe("6. it attempts no unsafe financial mutation", () => {
  it("the trace's own write counters are zero", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.writes_attempted).toBe(0);
    expect(trace.writes_applied).toBe(0);
    expect(trace.phase).toBe("observe-only");
  });

  it("no step names a write tool, because none exists in the registry", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const toolsUsed = new Set(trace.steps.map((s) => s.tool).filter((t): t is NonNullable<typeof t> => t !== null));
    for (const tool of toolsUsed) {
      expect(["close_report", "exception_queue", "decision_evidence", "ledger_verify"]).toContain(tool);
    }
    // apply_resolution is not a member of ToolName at all — this asserts the
    // absence structurally rather than by searching strings.
    expect("apply_resolution" in fixtureRegistry()).toBe(false);
  });

  it("even a registry that WOULD answer a write call is never asked to", async () => {
    // A poisoned registry: if the controller ever called anything named
    // "apply_resolution" it would show up as an unknown property access at
    // the type level, so this test instead proves the runtime path never
    // reaches AWAIT_HUMAN → APPLY_RESOLUTION by construction: the trace
    // terminates at COMPLETE with stop_reason ESCALATED, never at a state
    // that could precede a write.
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("ESCALATED");
    const states = new Set(trace.steps.map((s) => s.state));
    expect(states.has("APPLY_RESOLUTION")).toBe(false);
    expect(states.has("RECHECK")).toBe(false);
  });
});

describe("7. it produces an explicit escalation / human-review outcome", () => {
  it("terminates COMPLETE with stop_reason ESCALATED and one record", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("ESCALATED");
    expect(trace.halt_reason).toBeNull();
    expect(trace.escalations).toHaveLength(1);
    const last = trace.steps.at(-1);
    expect(last?.rule_fired).toBe("SEQ_HANDOFF");
    expect(last?.next_state).toBe("COMPLETE");
  });
});

describe("8. it records an auditable controller trace", () => {
  it("every step names the rule that fired, and reads are hashed not copied", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(trace.steps.length).toBeGreaterThan(0);
    for (const step of trace.steps) {
      expect(step.rule_fired).toMatch(/^(P[0-5]|SEQ)_/);
      expect(step.caused_events).toEqual([]); // no write in this phase
      expect(step.llm).toBeNull(); // no model call in this phase
      if (step.tool !== null) {
        expect(step.tool_input_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(step.observation_digest).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    // trace_id is content-addressed, not random — sha256 hex.
    expect(trace.trace_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the escalation is joinable back to the real decision and certificate", async () => {
    const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const record = trace.escalations[0];
    expect(record?.comp_id).toBe(AMBIGUOUS_DECISION.comp_id);
    expect(record?.decision_id).toBe(AMBIGUOUS_DECISION.decision_id);
  });
});

describe("9. repeated execution on the same demo produces the same outcome", () => {
  it("two independent runs against the fixture produce identical traces", async () => {
    const first = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    const second = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
    expect(second.trace_id).toBe(first.trace_id);
    expect(second.terminal).toBe(first.terminal);
    expect(second.stop_reason).toBe(first.stop_reason);
    expect(second.escalations).toEqual(first.escalations);
    expect(second.plan).toEqual(first.plan);
    expect(second.steps.map((s) => [s.state, s.rule_fired, s.next_state])).toEqual(
      first.steps.map((s) => [s.state, s.rule_fired, s.next_state]),
    );
  });

  it("ten runs agree, including a fresh registry closure each time", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      // A NEW registry object each iteration, so nothing is memoised across
      // calls — determinism has to come from the policy, not from reuse.
      const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry() });
      ids.add(trace.trace_id);
    }
    expect(ids.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Supporting behaviour: the two halt paths and the transition guard, so the
// nine requirements above are read against a machine whose OTHER paths are
// also under test rather than merely asserted in a docstring.
// ---------------------------------------------------------------------------

describe("integrity outranks the plan", () => {
  it("halts on a chain that does not recompute, before the queue is ever read", async () => {
    const tools = fixtureRegistry({
      ledger_verify: async () => ({
        run_id: RUN_ID,
        chain_ok: false,
        recomputed_root_hash: "0".repeat(64),
        stored_root_hash: "1".repeat(64),
        root_matches: false,
        trial_balance_ok: true,
        total_dr_paise: 0,
        total_cr_paise: 0,
        event_count: 0,
        checks: [{ name: "genesis_to_root", passed: false }],
      }),
    });
    const trace = await runController({ runId: RUN_ID, tools });
    expect(trace.terminal).toBe("HALT");
    expect(trace.halt_reason).toBe("CHAIN_BROKEN");
    expect(trace.steps.some((s) => s.tool === "exception_queue")).toBe(false);
    expect(trace.escalations).toEqual([]);
  });

  it("halts on a period the gate reports BLOCKED", async () => {
    const tools = fixtureRegistry({
      close_report: async () => ({
        ...CLOSE_REPORT,
        period_status: "BLOCKED",
        gate: { ...CLOSE_REPORT.gate, g5_no_failed_invariant_posted: false, failed_gates: ["g5"] },
      }),
    });
    const trace = await runController({ runId: RUN_ID, tools });
    expect(trace.terminal).toBe("HALT");
    expect(trace.halt_reason).toBe("PERIOD_BLOCKED");
  });

  it("a tool refusal is an observation the loop halts on, not a thrown error", async () => {
    const tools = fixtureRegistry({
      close_report: async () => {
        throw new Error("simulated outage");
      },
    });
    const trace = await runController({ runId: RUN_ID, tools });
    expect(trace.terminal).toBe("HALT");
    expect(trace.halt_reason).toBe("TOOL_REFUSED");
    const failing = trace.steps.find((s) => s.tool === "close_report");
    expect(failing?.observation_digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the closed period path", () => {
  it("stops COMPLETE / CLOSED without ever reading the queue", async () => {
    const tools = fixtureRegistry({
      close_report: async () => ({ ...CLOSE_REPORT, period_status: "CLOSED" }),
    });
    const trace = await runController({ runId: RUN_ID, tools });
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("CLOSED");
    expect(trace.steps.some((s) => s.tool === "exception_queue")).toBe(false);
  });
});

describe("the empty-eligibility path", () => {
  it("stops NO_ELIGIBLE_ITEM when nothing in the queue carries a Suspense key", async () => {
    const tools = fixtureRegistry({
      exception_queue: async () => ({
        ...EXCEPTION_QUEUE,
        items: EXCEPTION_QUEUE.items.map((i) => ({ ...i, suspense_key: null })),
      }),
    });
    const trace = await runController({ runId: RUN_ID, tools });
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("NO_ELIGIBLE_ITEM");
    expect(trace.escalations).toEqual([]);
  });
});

