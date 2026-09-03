import { DEFAULT_STEP_BUDGET } from "@assay/controller";
import { beforeAll, describe, expect, it } from "vitest";

import { RunRegistry, createApp } from "../src/index.js";
import { DEMO_DATASET_IDS, type DemoDatasetId } from "../src/datasets.js";

/**
 * The four demo periods, driven end to end through the real API.
 *
 * **Every figure asserted below was read off a live run before it was written
 * here.** The fixtures were not designed by assuming an outcome and then
 * asserting it: they were authored as observations, run through the frozen
 * engine, and the observed close state, queue and controller trace are what
 * these assertions were written against. Where a scenario's design intent and
 * the engine's actual answer diverge, the divergence is asserted — see
 * `covers_residual` under `demo-backlog`.
 *
 * **Nothing here is a measurement.** All four periods are `demo/` fixtures;
 * `demo/README.md` states the five boundaries in full — outside `bench/`, no
 * seed, no ground truth, never scored, never benchmark evidence. No assertion
 * below is a rate, an accuracy, a comparison between agents, or a claim about
 * ASSAY's coverage or harm. In particular `demo-close` reaching `CLOSED` is
 * **not** evidence for `PROJECT_SPEC.md §7`'s `S12`, which reads against the
 * sealed corpus alone.
 *
 * **What is under test is that the controller's behaviour follows the
 * evidence.** One engine, one close gate, one policy, four periods; nothing is
 * configured differently between them. So a difference in the trace is a
 * difference the evidence produced, which is the property that makes the
 * controller a policy rather than a script.
 */

interface RunCreated {
  readonly run_id: string;
  readonly dataset: string;
  readonly observation_count: number;
  readonly summary: {
    readonly period_status: string;
    readonly unresolved_value_paise: number;
    readonly batch_value_paise: number | null;
  };
}

interface CloseBody {
  readonly period_status: string;
  readonly unresolved_value_paise: number;
  readonly close_threshold_paise: number;
  readonly trial_balance_ok: boolean;
  readonly gate: { readonly failed_gates: readonly string[] };
}

interface QueueRow {
  readonly decision_id: string;
  readonly entity_id: string;
  readonly state: string;
  readonly value_paise: number;
  readonly exception_class: string | null;
  readonly suspense_key: string | null;
}

interface QueueBody {
  readonly total: number;
  readonly items: readonly QueueRow[];
}

interface Escalation {
  readonly decision_id: string;
  readonly entity_id: string;
  readonly reason: string;
  readonly certificate_reason: string | null;
  readonly value_paise: number;
  readonly closes_alone: boolean;
}

interface TraceBody {
  readonly trace_id: string;
  readonly terminal: string;
  readonly stop_reason: string | null;
  readonly halt_reason: string | null;
  readonly writes_attempted: number;
  readonly writes_applied: number;
  readonly financial_write_performed: boolean;
  readonly steps: readonly {
    readonly step_no: number;
    readonly state: string;
    readonly rule_fired: string;
    readonly tool: string | null;
  }[];
  readonly escalations: readonly Escalation[];
  readonly plan: {
    readonly ids: readonly string[];
    readonly eligible: readonly QueueRow[];
    readonly ineligible_count: number;
    readonly covers_residual: boolean;
    readonly already_under_threshold: boolean;
  } | null;
  readonly telemetry: {
    readonly scope: string;
    readonly all_passed: boolean;
    readonly checks: readonly { readonly id: string; readonly passed: boolean }[];
    readonly counters: {
      readonly steps: number;
      readonly tool_calls: number;
      readonly escalations: number;
      readonly plan_size: number;
      readonly eligible_items: number;
      readonly ineligible_items: number;
      readonly model_calls: number;
      readonly caused_events: number;
    };
  };
}

/** One period, executed once and read four ways. */
interface Observed {
  readonly created: RunCreated;
  readonly close: CloseBody;
  readonly queue: QueueBody;
  readonly trace: TraceBody;
}

// One registry for the whole file: a POST /runs is a full reconciliation, and
// four of them is the price of this suite. Nothing is memoised beyond that —
// the controller re-runs on every request by design.
const app = createApp({ registry: new RunRegistry() });
const observed = new Map<DemoDatasetId, Observed>();

async function drive(dataset: DemoDatasetId): Promise<Observed> {
  const createdResponse = await app.request("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset }),
  });
  expect(createdResponse.status, dataset).toBe(201);
  const created = (await createdResponse.json()) as RunCreated;

  const read = async <T>(path: string): Promise<T> => {
    const response = await app.request(path);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };

  return {
    created,
    close: await read<CloseBody>(`/runs/${created.run_id}/close`),
    queue: await read<QueueBody>(`/runs/${created.run_id}/exceptions`),
    trace: await (async () => {
      const response = await app.request(`/runs/${created.run_id}/controller/start`, {
        method: "POST",
      });
      expect(response.status, dataset).toBe(200);
      return (await response.json()) as TraceBody;
    })(),
  };
}

const of = (dataset: DemoDatasetId): Observed => {
  const value = observed.get(dataset);
  if (value === undefined) throw new Error(`${dataset} was not driven`);
  return value;
};

/** Rows whose clearance could move the residual: `suspense_key !== null`. */
const eligibleRows = (queue: QueueBody): readonly QueueRow[] =>
  queue.items.filter((i) => i.suspense_key !== null);

const rulesFired = (trace: TraceBody): ReadonlySet<string> =>
  new Set(trace.steps.map((s) => s.rule_fired));

beforeAll(async () => {
  for (const dataset of DEMO_DATASET_IDS) {
    observed.set(dataset, await drive(dataset));
  }
}, 240_000);

// ---------------------------------------------------------------------------
// Properties every period holds — the containment claim, on all four
// ---------------------------------------------------------------------------

describe.each([...DEMO_DATASET_IDS])("%s — properties every period holds", (dataset) => {
  it("runs the dataset it was asked for, over real observations", () => {
    const { created } = of(dataset);
    expect(created.dataset).toBe(dataset);
    expect(created.observation_count).toBeGreaterThan(0);
  });

  it("reaches a sound ledger: no failed gate, trial balance exact", () => {
    const { close } = of(dataset);
    expect(close.gate.failed_gates).toEqual([]);
    expect(close.trial_balance_ok).toBe(true);
    // §10.2's BLOCKED is a defect. None of these periods is one.
    expect(["CLOSED", "OPEN"]).toContain(close.period_status);
  });

  it("performs no financial write and consults no model", () => {
    const { trace } = of(dataset);
    expect(trace.writes_attempted).toBe(0);
    expect(trace.writes_applied).toBe(0);
    expect(trace.financial_write_performed).toBe(false);
    expect(trace.telemetry.counters.model_calls).toBe(0);
    expect(trace.telemetry.counters.caused_events).toBe(0);
    expect(trace.steps.every((s) => s.state !== "APPLY_RESOLUTION")).toBe(true);
    expect(trace.steps.every((s) => s.state !== "RECHECK")).toBe(true);
  });

  /**
   * Requirement 5, stated as a property rather than as a number: every counter
   * the telemetry reports is recomputed here from the trace served beside it.
   * A telemetry block that drifted from its own trace fails on all four.
   */
  it("reports telemetry recomputable from the trace it travels with", () => {
    const { trace } = of(dataset);
    const c = trace.telemetry.counters;
    expect(trace.telemetry.scope).toBe("EXPLORATORY");
    expect(c.steps).toBe(trace.steps.length);
    expect(c.tool_calls).toBe(trace.steps.filter((s) => s.tool !== null).length);
    expect(c.escalations).toBe(trace.escalations.length);
    expect(c.plan_size).toBe(trace.plan?.ids.length ?? 0);
    expect(c.eligible_items).toBe(trace.plan?.eligible.length ?? 0);
    expect(c.ineligible_items).toBe(trace.plan?.ineligible_count ?? 0);
    // The one check that is allowed to fail, and exactly when the bound bit.
    const budgetCheck = trace.telemetry.checks.find((k) => k.id === "budget_not_exhausted");
    expect(budgetCheck?.passed).toBe(trace.stop_reason !== "BUDGET_EXHAUSTED");
  });

  /**
   * The close-gate identity that makes `covers_residual: false` unreachable.
   *
   * `unresolved_value_paise` is summed over exactly the decisions whose
   * `suspense_key` is non-null, which is exactly the set `closingSet` calls
   * eligible. Asserted on every period because it is the reason `demo-backlog`
   * cannot produce the state it was designed to produce.
   */
  it("sums its eligible queue rows to exactly the gate's residual", () => {
    const { close, queue } = of(dataset);
    const sum = eligibleRows(queue).reduce((n, row) => n + row.value_paise, 0);
    expect(sum).toBe(close.unresolved_value_paise);
  });

  it("is deterministic: a second controller run reproduces the trace id", async () => {
    const { created, trace } = of(dataset);
    const response = await app.request(`/runs/${created.run_id}/controller`);
    expect(response.status).toBe(200);
    const again = (await response.json()) as TraceBody;
    expect(again.trace_id).toBe(trace.trace_id);
    expect(again.steps.length).toBe(trace.steps.length);
  });
});

// ---------------------------------------------------------------------------
// demo-close — the residual is already inside the threshold
// ---------------------------------------------------------------------------

describe("demo-close", () => {
  it("closes the period: residual zero, inside the close threshold", () => {
    const { close } = of("demo-close");
    expect(close.period_status).toBe("CLOSED");
    expect(close.unresolved_value_paise).toBe(0);
    expect(close.unresolved_value_paise).toBeLessThanOrEqual(close.close_threshold_paise);
  });

  /**
   * The point of keeping the merchant-ledger rows: the queue is NOT empty. The
   * period closes with open exceptions on it, because `DATA_MODEL.md §17.1.1`
   * gives a `ledger_entry` no posting in any state, so none of them opens a
   * Suspense item or contributes a paisa to `G3`'s residual.
   */
  it("closes with a non-empty queue, because no row on it opens a Suspense item", () => {
    const { queue } = of("demo-close");
    expect(queue.total).toBeGreaterThan(0);
    expect(eligibleRows(queue)).toHaveLength(0);
    expect(queue.items.every((i) => i.state === "EXCEPTION")).toBe(true);
    expect(queue.items.every((i) => i.exception_class === "E13_LEDGER_ONLY")).toBe(true);
  });

  it("takes the P1_ALREADY_CLOSED branch and stops before triage", () => {
    const { trace } = of("demo-close");
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("CLOSED");
    expect(trace.halt_reason).toBeNull();
    expect(rulesFired(trace)).toContain("P1_ALREADY_CLOSED");
    // The gate answered before the queue was ever read, so no plan exists.
    expect(trace.plan).toBeNull();
    expect(trace.escalations).toHaveLength(0);
    expect(trace.steps.some((s) => s.tool === "exception_queue")).toBe(false);
    expect(trace.telemetry.all_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// demo-multi — a closing set with several members, and the value/eligibility split
// ---------------------------------------------------------------------------

describe("demo-multi", () => {
  it("leaves the period OPEN on a residual above the threshold", () => {
    const { close } = of("demo-multi");
    expect(close.period_status).toBe("OPEN");
    expect(close.unresolved_value_paise).toBeGreaterThan(close.close_threshold_paise);
  });

  /**
   * The discrimination, made visible where a reviewer looks first: the queue's
   * single largest row by rupee value opens NO Suspense item, so clearing it
   * could not move the residual by one paisa. A planner ranking on value alone
   * would open it first.
   */
  it("ranks an ineligible row above every eligible one", () => {
    const { queue } = of("demo-multi");
    const [top] = queue.items;
    expect(top).toBeDefined();
    expect(top?.suspense_key).toBeNull();
    const eligible = eligibleRows(queue);
    expect(eligible.length).toBeGreaterThanOrEqual(4);
    for (const row of eligible) {
      expect(row.value_paise, row.entity_id).toBeLessThan(top?.value_paise ?? 0);
    }
  });

  it("plans several items, and every planned id is eligible", () => {
    const { queue, trace } = of("demo-multi");
    expect(trace.plan).not.toBeNull();
    expect(trace.plan?.ids.length).toBeGreaterThan(1);
    const eligibleIds = new Set(eligibleRows(queue).map((r) => r.decision_id));
    for (const id of trace.plan?.ids ?? []) expect(eligibleIds.has(id)).toBe(true);
    // The large ledger row is on the queue and NOT on the plan.
    expect(trace.plan?.ineligible_count).toBeGreaterThan(0);
  });

  it("iterates the cursor: one inspection and one escalation per planned item", () => {
    const { trace } = of("demo-multi");
    const planned = trace.plan?.ids ?? [];
    const inspections = trace.steps.filter((s) => s.tool === "decision_evidence").length;
    const escalateSteps = trace.steps.filter((s) => s.rule_fired === "P3_ESCALATE").length;
    const advances = trace.steps.filter((s) => s.rule_fired === "P4_ADVANCE_CURSOR").length;
    expect(inspections).toBe(planned.length);
    expect(escalateSteps).toBe(planned.length);
    // Exactly one advance per escalation: `ESCALATE` fires `P4_ADVANCE_CURSOR`
    // whether the next branch is another item or the handover to `AWAIT_HUMAN`,
    // so the last item's advance IS the handover step rather than a step before
    // it. The whole loop is therefore 3 steps per item over a 6-step preamble
    // and a 1-step handoff.
    expect(advances).toBe(planned.length);
    expect(trace.steps.length).toBe(6 + 3 * planned.length + 1);
    expect(trace.escalations.map((e) => e.decision_id)).toEqual([...planned]);
    expect(trace.stop_reason).toBe("ESCALATED");
  });

  /**
   * Both escalation reasons in one trace: the abstained settlement carries a
   * `§13` certificate, the unattributed bank credits carry none, and
   * `escalationReasonFor` separates them.
   */
  it("escalates under both reasons, and no single item closes the period alone", () => {
    const { trace } = of("demo-multi");
    const reasons = new Set(trace.escalations.map((e) => e.reason));
    expect(reasons).toContain("AMBIGUOUS_CERTIFICATE");
    expect(reasons).toContain("NO_DETERMINISTIC_WARRANT");
    for (const e of trace.escalations) {
      expect(e.reason === "AMBIGUOUS_CERTIFICATE").toBe(e.certificate_reason !== null);
      expect(e.closes_alone, e.entity_id).toBe(false);
    }
    expect(trace.telemetry.all_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// demo-backlog — more work than one bounded pass can do
// ---------------------------------------------------------------------------

describe("demo-backlog", () => {
  it("spreads the residual across many eligible items, none decisive alone", () => {
    const { close, queue } = of("demo-backlog");
    expect(close.period_status).toBe("OPEN");
    const eligible = eligibleRows(queue);
    expect(eligible.length).toBeGreaterThan(20);
    for (const row of eligible) {
      expect(close.unresolved_value_paise - row.value_paise, row.entity_id)
        .toBeGreaterThan(close.close_threshold_paise);
    }
  });

  it("stops on its own bound and reports the result as partial", () => {
    const { trace } = of("demo-backlog");
    expect(trace.terminal).toBe("COMPLETE");
    expect(trace.stop_reason).toBe("BUDGET_EXHAUSTED");
    expect(trace.halt_reason).toBeNull();
    expect(rulesFired(trace)).toContain("SEQ_BUDGET");
    expect(trace.steps.length).toBeGreaterThan(DEFAULT_STEP_BUDGET);
    // Partial, and visibly so: fewer items escalated than the plan holds.
    expect(trace.escalations.length).toBeLessThan(trace.plan?.ids.length ?? 0);
    expect(trace.escalations.length).toBeGreaterThan(0);
  });

  it("fails exactly one runtime check, and it is the budget one", () => {
    const { trace } = of("demo-backlog");
    const failed = trace.telemetry.checks.filter((k) => !k.passed).map((k) => k.id);
    expect(failed).toEqual(["budget_not_exhausted"]);
    expect(trace.telemetry.all_passed).toBe(false);
  });

  /**
   * The design intent this fixture does NOT produce, asserted as what actually
   * happens.
   *
   * `demo-backlog` was built to drive `covers_residual: false` — an eligible
   * set too small to clear the residual. The identity asserted for every period
   * above makes that unreachable: `Σ eligible value === unresolved`, so taking
   * the whole eligible set always covers `unresolved − close_threshold_paise`.
   * `covers_residual` is a defensive branch against a queue and a gate that
   * disagree, which is a `G3` failure and a `BLOCKED` period, not a business
   * state. Asserted here so the finding is checked rather than remembered.
   */
  it("cannot reach covers_residual: false, and reports true instead", () => {
    const { close, queue, trace } = of("demo-backlog");
    expect(trace.plan?.covers_residual).toBe(true);
    expect(trace.plan?.already_under_threshold).toBe(false);
    const sum = eligibleRows(queue).reduce((n, row) => n + row.value_paise, 0);
    expect(sum).toBeGreaterThanOrEqual(
      close.unresolved_value_paise - close.close_threshold_paise,
    );
  });
});

// ---------------------------------------------------------------------------
// The comparison — one policy, four periods, four different traces
// ---------------------------------------------------------------------------

describe("the four periods drive the controller differently", () => {
  it("reaches three different stop reasons across the four", () => {
    const stops = [...DEMO_DATASET_IDS].map((d) => of(d).trace.stop_reason);
    expect(stops).toEqual(["ESCALATED", "CLOSED", "ESCALATED", "BUDGET_EXHAUSTED"]);
    expect(new Set(stops).size).toBe(3);
  });

  it("gives every period a distinct trace id and a distinct step count", () => {
    const traces = [...DEMO_DATASET_IDS].map((d) => of(d).trace);
    expect(new Set(traces.map((t) => t.trace_id)).size).toBe(traces.length);
    expect(new Set(traces.map((t) => t.steps.length)).size).toBe(traces.length);
  });

  /**
   * The claim `demo-500` alone cannot support: the plan is computed, not
   * scripted. One member on `demo-500`, none at all on `demo-close`, and more
   * than one on both of the others — from one `closingSet` over four different
   * observation sets.
   */
  it("computes a different closing set on each, from the same policy", () => {
    expect(of("demo-500").trace.plan?.ids.length).toBe(1);
    expect(of("demo-close").trace.plan).toBeNull();
    expect(of("demo-multi").trace.plan?.ids.length).toBeGreaterThan(1);
    expect(of("demo-backlog").trace.plan?.ids.length).toBeGreaterThan(
      of("demo-multi").trace.plan?.ids.length ?? 0,
    );
  });

  it("fires policy rules on the others that demo-500 never reaches", () => {
    const baseline = rulesFired(of("demo-500").trace);
    expect(baseline.has("P1_ALREADY_CLOSED")).toBe(false);
    expect(baseline.has("SEQ_BUDGET")).toBe(false);
    expect(rulesFired(of("demo-close").trace)).toContain("P1_ALREADY_CLOSED");
    expect(rulesFired(of("demo-backlog").trace)).toContain("SEQ_BUDGET");
  });
});
