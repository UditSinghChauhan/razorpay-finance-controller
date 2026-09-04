import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ControllerTraceView } from "../src/components/ControllerPanel.js";
import type { ControllerTrace } from "../src/hooks/useAssayApi.js";
import {
  API_UNAVAILABLE_BODY,
  isApiUnreachable,
  probeEscalationClause,
  probeSectionHeading,
  RUN_NOT_FOUND_BODY,
  stepBudgetBasis,
  stepBudgetCounterBasis,
  stepBudgetLabel,
} from "../src/lib/copy.js";

/**
 * The presentation fixes taken from the independent panel audit.
 *
 * Every assertion here is about **wording or weight**, never about a figure:
 * the controller's policy, the ledger's posting rules, the sealed benchmark and
 * the trace's own arithmetic are untouched by all of it. Where a number appears
 * below it is the trace's, rendered — `65` is still `65`.
 */

// ---------------------------------------------------------------------------
// F-16 — the step budget, which reads `65 / 64` if it is rendered raw
// ---------------------------------------------------------------------------

describe("F-16: a bound that was reached does not render as a bound that broke", () => {
  it("shows the work against the bound it was measured on", () => {
    // `packages/controller/src/policy.ts` emits one final SEQ_BUDGET
    // transition once `stepsTaken >= budget`, and that transition is itself a
    // recorded step — so a run that spent its whole budget holds 65 records.
    expect(stepBudgetLabel(65, 64)).toBe("64 / 64 — bound reached");
  });

  it("leaves a run that finished early exactly as it was", () => {
    expect(stepBudgetLabel(10, 64)).toBe("10 / 64");
    expect(stepBudgetBasis(10, 64)).toContain("finished before");
  });

  it("accounts for the extra record rather than hiding it", () => {
    const basis = stepBudgetBasis(65, 64);
    // The 65th step is named, so nothing is concealed by the label above.
    expect(basis).toContain("65 records");
    expect(basis).toContain("terminal SEQ_BUDGET record");
    expect(basis).toContain("reached, not exceeded");
  });

  it("names the raw step count inside the telemetry block too", () => {
    // The telemetry block states that every figure in it is recomputable from
    // the trace, and its `steps` counter is `stepBudgetLabel`'s reading rather
    // than the trace's raw `steps`. So the raw value has to be on screen in
    // that block: `stepBudgetBasis`'s paragraph is in the outcome banner,
    // several sections up, and a reader checking the counters against
    // `trace.steps.length` should not have to scroll to learn why they differ.
    const basis = stepBudgetCounterBasis(65, 64);
    expect(basis).not.toBeNull();
    expect(basis).toContain("64 work steps");
    expect(basis).toContain("64-step budget");
    expect(basis).toContain("65 records");
    expect(basis).toContain("terminal SEQ_BUDGET record");
  });

  it("has nothing to reconcile on a run that finished inside its bound", () => {
    // The counter IS the raw value there, so a line explaining a difference
    // that does not exist would be noise.
    expect(stepBudgetCounterBasis(10, 64)).toBeNull();
    expect(stepBudgetCounterBasis(64, 64)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F-05 — the zero-probe case is "none required", not "none succeeded"
// ---------------------------------------------------------------------------

describe("F-05: an absent probe is not a failed probe", () => {
  it("says no probe was required, and never that one was tried", () => {
    const clause = probeEscalationClause(0);
    expect(clause).toContain("no probe was required or available");
    expect(clause).toContain("evidence stayed tied");
    expect(clause).not.toContain("could break");
  });

  it("reports a real attempt as an attempt", () => {
    expect(probeEscalationClause(3)).toBe("3 probe(s) were run and none broke the tie");
  });

  it("does not head an empty section as attempted", () => {
    expect(probeSectionHeading(0)).toBe("Probes — none required");
    expect(probeSectionHeading(2)).toBe("Probes attempted (2)");
  });
});

// ---------------------------------------------------------------------------
// F-09 — the API being absent is an operator state with an operator's fix
// ---------------------------------------------------------------------------

describe("F-09: an unreachable API is told apart from a refused run", () => {
  it("recognises the shapes a rejected fetch takes across browsers", () => {
    for (const m of [
      "TypeError: Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "fetch failed",
    ]) {
      expect(isApiUnreachable(m), m).toBe(true);
    }
  });

  it("leaves a server that answered to state its own reason", () => {
    expect(isApiUnreachable('400: {"error":"unknown_dataset"}')).toBe(false);
  });

  it("names the address and the command, and rules the credential out", () => {
    expect(API_UNAVAILABLE_BODY).toContain("127.0.0.1:8787");
    expect(API_UNAVAILABLE_BODY).toContain("pnpm run dev:api");
    expect(API_UNAVAILABLE_BODY).toContain("No API key is needed");
  });
});

// ---------------------------------------------------------------------------
// F-11 — a dropped run says what was lost, which is nothing financial
// ---------------------------------------------------------------------------

describe("F-11: an expired run id is a state, not an error", () => {
  it("says why the run is gone and that no figure was cached", () => {
    expect(RUN_NOT_FOUND_BODY).toContain("memory for the life of the server");
    expect(RUN_NOT_FOUND_BODY).toContain("Nothing financial was cached");
    expect(RUN_NOT_FOUND_BODY).toContain("only the run id and the period name");
  });
});

// ---------------------------------------------------------------------------
// F-10 — the safety claim, at a weight a projector survives
// ---------------------------------------------------------------------------

const BUDGET_TRACE: ControllerTrace = {
  trace_id: "f".repeat(64),
  run_id: "run_budget",
  phase: "observe-only",
  terminal: "COMPLETE",
  stop_reason: "BUDGET_EXHAUSTED",
  halt_reason: null,
  steps: [],
  escalations: [],
  plan: null,
  residual_trajectory: [],
  writes_attempted: 0,
  writes_applied: 0,
  financial_write_performed: false,
  awaiting_human_review: false,
  telemetry: {
    scope: "EXPLORATORY",
    trace_id: "f".repeat(64),
    run_id: "run_budget",
    terminal: "COMPLETE",
    stop_reason: "BUDGET_EXHAUSTED",
    halt_reason: null,
    checks: [],
    checks_passed: 0,
    checks_total: 0,
    all_passed: true,
    counters: {
      steps: 65,
      step_budget: 64,
      tool_calls: 30,
      tool_calls_by_name: {},
      writes_attempted: 0,
      writes_applied: 0,
      caused_events: 0,
      model_calls: 0,
      escalations: 21,
      plan_size: 24,
      eligible_items: 24,
      ineligible_items: 0,
    },
  },
};

const budgetHtml = renderToStaticMarkup(
  <MemoryRouter>
    <ControllerTraceView
      trace={BUDGET_TRACE}
      onReviewClick={() => undefined}
      onTryAnother={() => undefined}
      onVerifyLedger={() => undefined}
    />
  </MemoryRouter>,
);

describe("F-10: `writes applied` is not one counter among eight", () => {
  it("renders as its own claim, with the reading beside it", () => {
    expect(budgetHtml).toContain("safety-claim-value");
    expect(budgetHtml).toContain("Writes applied");
    expect(budgetHtml).toContain("no ledger write on any path");
  });

  it("marks the claim clean only because the trace says zero", () => {
    expect(budgetHtml).toContain('data-clean="true"');
  });
});

describe("F-16, on a real budget-exhausted trace", () => {
  it("explains the extra record where the ratio is shown", () => {
    expect(budgetHtml).toContain("64 / 64 — bound reached");
    expect(budgetHtml).toContain("terminal SEQ_BUDGET record");
  });

  it("still reports the trace's own step count, unchanged", () => {
    // The presentation changed; the trace did not. 65 is still stated.
    expect(budgetHtml).toContain("65 records");
  });
});
