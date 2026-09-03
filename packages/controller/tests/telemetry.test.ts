import { describe, expect, it } from "vitest";

import { runController } from "../src/machine.js";
import { TELEMETRY_CHECK_IDS, evaluateController } from "../src/telemetry.js";
import { digest } from "../src/trace.js";
import {
  CLOSE_REPORT,
  EXCEPTION_QUEUE,
  RUN_ID,
  fixtureRegistry,
} from "./support/fixture-registry.js";

/**
 * The runtime telemetry, over a trace produced from the **real captured
 * `demo-500` evidence** — no server, no network, no model.
 *
 * Every assertion here is about a property of one execution: did the machine
 * stay inside its declared table, did it write, was each escalation backed by
 * an inspection that actually happened. None is a quality judgement, a rate, or
 * a comparison — see `telemetry.ts` on why that boundary is kept.
 */

async function telemetryFor(overrides = {}) {
  const trace = await runController({ runId: RUN_ID, tools: fixtureRegistry(overrides) });
  return { trace, telemetry: evaluateController(trace) };
}

describe("the real demo-500 run passes every runtime check", () => {
  it("all 17 checks pass, and the set is closed", async () => {
    const { telemetry } = await telemetryFor();
    expect(telemetry.checks_total).toBe(TELEMETRY_CHECK_IDS.length);
    expect(telemetry.checks_total).toBe(17);
    expect(telemetry.checks_passed).toBe(telemetry.checks_total);
    expect(telemetry.all_passed).toBe(true);
    // Every declared id is present exactly once, and nothing else is.
    expect(telemetry.checks.map((c) => c.id).sort()).toEqual([...TELEMETRY_CHECK_IDS].sort());
  });

  it("is labelled EXPLORATORY — §L.4's requirement, carried as data", async () => {
    const { telemetry } = await telemetryFor();
    expect(telemetry.scope).toBe("EXPLORATORY");
  });

  it("reports counters that match the trace it was derived from", async () => {
    const { trace, telemetry } = await telemetryFor();
    const c = telemetry.counters;
    expect(c.steps).toBe(trace.steps.length);
    expect(c.escalations).toBe(trace.escalations.length);
    expect(c.plan_size).toBe(trace.plan?.ids.length ?? 0);
    expect(c.writes_attempted).toBe(0);
    expect(c.writes_applied).toBe(0);
    expect(c.caused_events).toBe(0);
    expect(c.model_calls).toBe(0);
    // The real run: four reads, one of each tool.
    expect(c.tool_calls).toBe(4);
    expect(c.tool_calls_by_name).toEqual({
      close_report: 1,
      exception_queue: 1,
      decision_evidence: 1,
      ledger_verify: 1,
    });
    expect(c.eligible_items).toBe(1);
    expect(c.ineligible_items).toBe(25);
  });
});

describe("containment — the phase's central claim, checkable", () => {
  it("no write, no ledger event, no model call, reads only", async () => {
    const { telemetry } = await telemetryFor();
    const byId = new Map(telemetry.checks.map((c) => [c.id, c]));
    for (const id of [
      "no_write_phase_state", "no_writes_attempted", "no_writes_applied",
      "no_caused_events", "no_model_call", "reads_only",
    ] as const) {
      expect(byId.get(id)?.passed, id).toBe(true);
    }
  });
});

describe("evidence grounding is recomputed, not taken on trust", () => {
  it("escalations_inspected recomputes the decision_evidence input hash", async () => {
    const { trace, telemetry } = await telemetryFor();
    const byId = new Map(telemetry.checks.map((c) => [c.id, c]));
    expect(byId.get("escalations_inspected")?.passed).toBe(true);

    // The check's own arithmetic, done independently here: the escalated
    // decision's id must hash to an input hash that a step actually carries.
    const esc = trace.escalations[0];
    expect(esc).toBeDefined();
    const expected = digest({ run_id: trace.run_id, decision_id: esc!.decision_id });
    expect(trace.steps.some((s) => s.tool === "decision_evidence" && s.tool_input_hash === expected)).toBe(true);
  });

  it("fails when an escalation names a decision that was never inspected", async () => {
    const { trace } = await telemetryFor();
    const forged = {
      ...trace,
      escalations: [{ ...trace.escalations[0]!, decision_id: "dec_never_inspected" }],
      plan: { ...trace.plan!, ids: ["dec_never_inspected"] },
    };
    const telemetry = evaluateController(forged);
    const byId = new Map(telemetry.checks.map((c) => [c.id, c]));
    expect(byId.get("escalations_inspected")?.passed).toBe(false);
    expect(telemetry.all_passed).toBe(false);
  });

  it("trace_id_recomputes fails on a tampered trace id", async () => {
    const { trace } = await telemetryFor();
    const telemetry = evaluateController({ ...trace, trace_id: "0".repeat(64) });
    const byId = new Map(telemetry.checks.map((c) => [c.id, c]));
    expect(byId.get("trace_id_recomputes")?.passed).toBe(false);
  });
});

describe("the checks actually discriminate — each fails when it should", () => {
  it("no_writes_attempted fails on a trace claiming a write", async () => {
    const { trace } = await telemetryFor();
    const t = evaluateController({ ...trace, writes_attempted: 1 });
    expect(t.checks.find((c) => c.id === "no_writes_attempted")?.passed).toBe(false);
    expect(t.all_passed).toBe(false);
  });

  it("no_caused_events fails when a step claims a ledger event", async () => {
    const { trace } = await telemetryFor();
    const steps = trace.steps.map((s, i) => (i === 0 ? { ...s, caused_events: ["evt_x"] } : s));
    const t = evaluateController({ ...trace, steps });
    expect(t.checks.find((c) => c.id === "no_caused_events")?.passed).toBe(false);
  });

  it("no_model_call fails when a step records an R4 call", async () => {
    const { trace } = await telemetryFor();
    const steps = trace.steps.map((s, i) =>
      i === 0 ? { ...s, llm: { role: "R4" as const, provider: "gemini", status: "ok" } } : s,
    );
    const t = evaluateController({ ...trace, steps });
    expect(t.checks.find((c) => c.id === "no_model_call")?.passed).toBe(false);
  });

  it("transitions_declared fails on a transition outside the table", async () => {
    const { trace } = await telemetryFor();
    const steps = trace.steps.map((s, i) =>
      i === 0 ? { ...s, next_state: "APPLY_RESOLUTION" as const } : s,
    );
    const t = evaluateController({ ...trace, steps });
    expect(t.checks.find((c) => c.id === "transitions_declared")?.passed).toBe(false);
    // And the write-phase guard catches the same forgery independently.
    expect(t.checks.find((c) => c.id === "no_write_phase_state")?.passed).toBe(false);
  });

  it("terminal_reason_coherent fails when COMPLETE carries a halt reason", async () => {
    const { trace } = await telemetryFor();
    const t = evaluateController({ ...trace, halt_reason: "CHAIN_BROKEN" });
    expect(t.checks.find((c) => c.id === "terminal_reason_coherent")?.passed).toBe(false);
  });

  it("escalations_planned fails when an escalation was not on the plan", async () => {
    const { trace } = await telemetryFor();
    const t = evaluateController({ ...trace, plan: { ...trace.plan!, ids: [] } });
    expect(t.checks.find((c) => c.id === "escalations_planned")?.passed).toBe(false);
  });

  it("escalation_reason_consistent fails when the reason and certificate disagree", async () => {
    const { trace } = await telemetryFor();
    const t = evaluateController({
      ...trace,
      escalations: [{ ...trace.escalations[0]!, certificate_reason: null }],
    });
    expect(t.checks.find((c) => c.id === "escalation_reason_consistent")?.passed).toBe(false);
  });
});

describe("telemetry over the other real terminal paths", () => {
  it("a HALT trace is coherent and still passes containment", async () => {
    const { telemetry } = await telemetryFor({
      close_report: async () => {
        throw new Error("simulated outage");
      },
    });
    expect(telemetry.terminal).toBe("HALT");
    expect(telemetry.halt_reason).toBe("TOOL_REFUSED");
    expect(telemetry.checks.find((c) => c.id === "terminal_reason_coherent")?.passed).toBe(true);
    expect(telemetry.checks.find((c) => c.id === "no_writes_attempted")?.passed).toBe(true);
    expect(telemetry.counters.escalations).toBe(0);
    expect(telemetry.all_passed).toBe(true);
  });

  it("an already-CLOSED period passes every check with no escalation", async () => {
    const { telemetry } = await telemetryFor({
      close_report: async () => ({ ...CLOSE_REPORT, period_status: "CLOSED" as const }),
    });
    expect(telemetry.stop_reason).toBe("CLOSED");
    expect(telemetry.all_passed).toBe(true);
    expect(telemetry.counters.escalations).toBe(0);
  });

  it("a queue with nothing eligible passes every check and escalates nothing", async () => {
    const { telemetry } = await telemetryFor({
      exception_queue: async () => ({
        ...EXCEPTION_QUEUE,
        items: EXCEPTION_QUEUE.items.map((i) => ({ ...i, suspense_key: null })),
      }),
    });
    expect(telemetry.stop_reason).toBe("NO_ELIGIBLE_ITEM");
    expect(telemetry.all_passed).toBe(true);
    expect(telemetry.counters.escalations).toBe(0);
  });
});

describe("evaluateController is derived, not asserted", () => {
  it("is a pure function: the same trace evaluates identically twice", async () => {
    const { trace } = await telemetryFor();
    expect(evaluateController(trace)).toEqual(evaluateController(trace));
  });

  it("two independent runs of the same batch produce identical telemetry", async () => {
    const a = await telemetryFor();
    const b = await telemetryFor();
    expect(b.telemetry).toEqual(a.telemetry);
  });
});
