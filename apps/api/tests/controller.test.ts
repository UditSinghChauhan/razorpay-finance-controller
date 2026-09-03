import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/index.js";

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

const app = createApp();

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
}

let runId: string;

beforeAll(async () => {
  const response = await app.request("/runs", { method: "POST" });
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
