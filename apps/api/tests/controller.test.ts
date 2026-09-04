import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_STEP_BUDGET } from "@assay/controller";

import { RunRegistry, controllerRoutes, createApp } from "../src/index.js";

/**
 * `POST /runs/:id/controller/start` and `GET /runs/:id/controller` — the
 * close controller, wired to a real `demo-500` run through the actual API.
 *
 * `packages/controller/tests/machine.test.ts` proves the nine acceptance
 * requirements against fixture-captured evidence with no server; this file
 * proves the SAME outcome is what the live API — the thing `apps/web` will
 * actually call — produces, wired through `controllerToolsFor` and the real
 * `StoredRun` this process holds. No number here is asserted twice for its
 * own sake: what is being checked is the WIRING, not the policy again.
 */

/**
 * The registry is injected rather than left internal so the budget regression
 * below can mount a SECOND set of controller routes over the SAME executed
 * run — a `POST /runs` costs a full 500-observation reconciliation, and the
 * bound being proved has nothing to do with which run it is driven over.
 */
const registry = new RunRegistry();
const app = createApp({ registry });

/**
 * `POST /runs` names its period.
 *
 * The dataset is a required field, not a default: `apps/api/src/routes/runs.ts`
 * answers `400 missing_dataset` to a request that names none, so a body whose
 * `dataset` went missing can no longer come back as a real run over a period
 * nobody asked for. Every creation below therefore says which period it wants.
 */
const START_DEMO_500 = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ dataset: "demo-500" }),
} as const;


interface RunCreated {
  readonly run_id: string;
}

interface TraceBody {
  readonly trace_id: string;
  readonly run_id: string;
  readonly phase: string;
  readonly terminal: string;
  readonly stop_reason: string | null;
  readonly halt_reason: string | null;
  readonly writes_attempted: number;
  readonly writes_applied: number;
  readonly financial_write_performed: boolean;
  readonly awaiting_human_review: boolean;
  readonly escalations: readonly {
    readonly decision_id: string;
    readonly reason: string;
    readonly certificate_reason: string | null;
    readonly evidence_score_gap_bps: number | null;
  }[];
  readonly plan: { readonly ids: readonly string[] } | null;
  readonly steps: readonly { readonly rule_fired: string; readonly state: string }[];
  readonly telemetry: {
    readonly scope: string;
    readonly checks: readonly {
      readonly id: string;
      readonly group: string;
      readonly passed: boolean;
      readonly detail: string;
    }[];
    readonly checks_passed: number;
    readonly checks_total: number;
    readonly all_passed: boolean;
    readonly counters: Record<string, unknown>;
  };
}

let runId: string;

beforeAll(async () => {
  const response = await app.request("/runs", START_DEMO_500);
  expect(response.status).toBe(201);
  ({ run_id: runId } = (await response.json()) as RunCreated);
}, 60_000);

describe("POST /runs/:id/controller/start", () => {
  it("drives the real demo run to an explicit escalation, over the wire", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    expect(response.status).toBe(200);
    const trace = (await response.json()) as TraceBody;

    expect(trace.run_id).toBe(runId);
    expect(trace.phase).toBe("observe-only");
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("ESCALATED");
    expect(trace.halt_reason).toBeNull();
  });

  it("performs no financial write — the counters and the derived flag both say so", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    expect(trace.writes_attempted).toBe(0);
    expect(trace.writes_applied).toBe(0);
    expect(trace.financial_write_performed).toBe(false);
  });

  it("escalates exactly the one certificate-bearing settlement, EVIDENCE_TIE", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    expect(trace.awaiting_human_review).toBe(true);
    expect(trace.escalations).toHaveLength(1);
    expect(trace.escalations[0]?.reason).toBe("AMBIGUOUS_CERTIFICATE");
    expect(trace.escalations[0]?.certificate_reason).toBe("EVIDENCE_TIE");
    expect(trace.escalations[0]?.evidence_score_gap_bps).toBe(0);
    expect(trace.plan?.ids).toEqual([trace.escalations[0]?.decision_id]);
  });

  it("404s an unknown run", async () => {
    const response = await app.request("/runs/run_does_not_exist/controller/start", {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });
});

describe("the response carries derived runtime telemetry", () => {
  it("labels it EXPLORATORY and passes every check on the real run", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    expect(trace.telemetry.scope).toBe("EXPLORATORY");
    expect(trace.telemetry.checks_total).toBe(17);
    expect(trace.telemetry.checks_passed).toBe(17);
    expect(trace.telemetry.all_passed).toBe(true);
  });

  it("the containment checks are the ones a reviewer needs, and they pass", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    const byId = new Map(trace.telemetry.checks.map((c) => [c.id, c.passed]));
    for (const id of [
      "no_write_phase_state", "no_writes_attempted", "no_writes_applied",
      "no_caused_events", "no_model_call", "reads_only",
    ]) {
      expect(byId.get(id), id).toBe(true);
    }
  });

  it("counters report the four read tools and zero writes over the wire", async () => {
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    const c = trace.telemetry.counters;
    expect(c["writes_attempted"]).toBe(0);
    expect(c["writes_applied"]).toBe(0);
    expect(c["model_calls"]).toBe(0);
    expect(c["caused_events"]).toBe(0);
    expect(c["tool_calls"]).toBe(4);
  });

  it("telemetry is derived — it does not disturb the trace it describes", async () => {
    // The pre-telemetry contract still holds exactly: adding a derived field
    // changed no figure the earlier assertions read.
    const response = await app.request(`/runs/${runId}/controller/start`, { method: "POST" });
    const trace = (await response.json()) as TraceBody;
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("ESCALATED");
    expect(trace.writes_attempted).toBe(0);
    expect(trace.telemetry.counters["steps"]).toBe(trace.steps.length);
  });
});

/**
 * The step budget is ONE value, and the telemetry reports the bound the run was
 * actually driven under.
 *
 * `runController`'s `budget` and `evaluateController`'s second parameter both
 * default to `DEFAULT_STEP_BUDGET` independently, and the trace does not carry
 * the bound it ran under — so a route that bounded the machine and let the
 * telemetry default would answer `step_budget: 64` beside a run that stopped at
 * 3, with `budget_not_exhausted` failing against a number the reader was never
 * shown. `controllerRoutes` resolves the value once and hands the same `const`
 * to both; what follows drives a genuinely non-default bound through the real
 * route and checks that no default survives anywhere in the response.
 */
describe("the step budget reaches the machine and its telemetry as one value", () => {
  const BOUND = 3;

  it("reports the non-default bound, not a stale DEFAULT_STEP_BUDGET", async () => {
    const bounded = controllerRoutes(registry, { stepBudget: BOUND });
    const trace = (await (
      await bounded.request(`/runs/${runId}/controller/start`, { method: "POST" })
    ).json()) as TraceBody;

    expect(trace.telemetry.counters["step_budget"]).toBe(BOUND);
    expect(trace.telemetry.counters["step_budget"]).not.toBe(DEFAULT_STEP_BUDGET);
  });

  it("the bound actually bit — the machine ran under it too, not just the label", async () => {
    // The proof that ONE value reached both: the run really stops early
    // (`BUDGET_EXHAUSTED` at 3 steps plus the step that reports it), and the
    // telemetry describes that same short run. A budget that reached only the
    // telemetry would leave a ten-step ESCALATED trace beside `step_budget: 3`.
    const bounded = controllerRoutes(registry, { stepBudget: BOUND });
    const trace = (await (
      await bounded.request(`/runs/${runId}/controller/start`, { method: "POST" })
    ).json()) as TraceBody;

    expect(trace.stop_reason).toBe("BUDGET_EXHAUSTED");
    expect(trace.steps.length).toBeLessThanOrEqual(BOUND + 1);
    expect(trace.telemetry.counters["steps"]).toBe(trace.steps.length);
    expect(trace.telemetry.counters["steps"]).toBeGreaterThan(0);
  });

  it("the budget check names the bound that was actually applied", async () => {
    const bounded = controllerRoutes(registry, { stepBudget: BOUND });
    const trace = (await (
      await bounded.request(`/runs/${runId}/controller/start`, { method: "POST" })
    ).json()) as TraceBody;

    const check = trace.telemetry.checks.find((c) => c.id === "budget_not_exhausted");
    expect(check?.passed).toBe(false);
    // The detail is where a stale default would be visible to a reader, so it
    // is asserted verbatim rather than by the counter alone.
    expect(check?.detail).toContain(`the ${String(BOUND)}-step bound was reached`);
    expect(check?.detail).not.toContain(String(DEFAULT_STEP_BUDGET));
    expect(trace.telemetry.all_passed).toBe(false);
  });

  it("GET is bounded identically to POST — the value is the route's, not the verb's", async () => {
    const bounded = controllerRoutes(registry, { stepBudget: BOUND });
    const got = (await (
      await bounded.request(`/runs/${runId}/controller`)
    ).json()) as TraceBody;

    expect(got.telemetry.counters["step_budget"]).toBe(BOUND);
    expect(got.stop_reason).toBe("BUDGET_EXHAUSTED");
  });

  it("the default mount is unchanged: DEFAULT_STEP_BUDGET, and the run still escalates", async () => {
    // The behaviour-preservation half. `app` mounts the routes exactly as
    // `app.ts` does in production — no options — and must answer precisely as
    // it did before the budget was threaded through.
    const trace = (await (
      await app.request(`/runs/${runId}/controller/start`, { method: "POST" })
    ).json()) as TraceBody;

    expect(trace.telemetry.counters["step_budget"]).toBe(DEFAULT_STEP_BUDGET);
    expect(trace.stop_reason).toBe("ESCALATED");
    expect(trace.telemetry.all_passed).toBe(true);
    expect(
      trace.telemetry.checks.find((c) => c.id === "budget_not_exhausted")?.passed,
    ).toBe(true);
  });
});

describe("GET /runs/:id/controller", () => {
  it("reproduces the same trace_id as POST, over the real run", async () => {
    const posted = (await (
      await app.request(`/runs/${runId}/controller/start`, { method: "POST" })
    ).json()) as TraceBody;
    const got = (await (await app.request(`/runs/${runId}/controller`)).json()) as TraceBody;
    expect(got.trace_id).toBe(posted.trace_id);
    expect(got.escalations).toEqual(posted.escalations);
  });

  it("404s an unknown run", async () => {
    const response = await app.request("/runs/run_does_not_exist/controller");
    expect(response.status).toBe(404);
  });
});

describe("repeated execution over the real API — requirement 9, on the wire", () => {
  it("five independent POSTs against the live run agree on trace_id", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const trace = (await (
        await app.request(`/runs/${runId}/controller/start`, { method: "POST" })
      ).json()) as TraceBody;
      ids.add(trace.trace_id);
    }
    expect(ids.size).toBe(1);
  });
});
