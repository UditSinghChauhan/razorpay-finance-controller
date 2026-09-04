import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  ControllerPanel,
  ControllerTraceView,
  TELEMETRY_SUMMARY_ROWS,
} from "../src/components/ControllerPanel.js";
import type { ControllerTrace } from "../src/hooks/useAssayApi.js";

/**
 * The close controller panel, rendered through
 * `renderToStaticMarkup` &mdash; the same technique `ai-explanation.test.tsx`
 * uses, so what is asserted is the markup the component actually produces.
 *
 * The trace fixture below carries the SAME shape this session's live
 * `POST /runs/:id/controller/start` produced against the real `demo-500` run:
 * one escalation, `EVIDENCE_TIE`, gap `0` bps against `ε` `1500` bps,
 * materiality ₹590, `τ` ₹204.13, `closes_alone: true`, ten steps, zero writes.
 */

const ESCALATED_TRACE: ControllerTrace = {
  trace_id: "a83f9b288bfd2dc2f90f9ba3063d3484517e08b55bee44e0a5b7ee33c2d22257",
  run_id: "run_fixture",
  phase: "observe-only",
  terminal: "COMPLETE",
  stop_reason: "ESCALATED",
  halt_reason: null,
  steps: [
    { step_no: 1, state: "INIT", rule_fired: "SEQ_VERIFY", tool: "ledger_verify", tool_input_hash: "a".repeat(64), observation_digest: "b".repeat(64), observation_summary: "recompute the chain from genesis before acting on anything", next_state: "OBSERVE_CLOSE", caused_events: [], llm: null },
    { step_no: 2, state: "OBSERVE_CLOSE", rule_fired: "SEQ_OBSERVE", tool: "close_report", tool_input_hash: "c".repeat(64), observation_digest: "d".repeat(64), observation_summary: "read the close gate and the quantified residual", next_state: "OBSERVE_CLOSE", caused_events: [], llm: null },
    { step_no: 3, state: "OBSERVE_CLOSE", rule_fired: "SEQ_OBSERVE", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "period OPEN on 10000000 paise unresolved against a threshold of 674719", next_state: "TRIAGE", caused_events: [], llm: null },
    { step_no: 4, state: "TRIAGE", rule_fired: "SEQ_TRIAGE", tool: "exception_queue", tool_input_hash: "e".repeat(64), observation_digest: "f".repeat(64), observation_summary: "read both populations, value-ranked", next_state: "TRIAGE", caused_events: [], llm: null },
    { step_no: 5, state: "TRIAGE", rule_fired: "SEQ_TRIAGE", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "26 queue items: 6 abstained, 20 exceptions", next_state: "PLAN", caused_events: [], llm: null },
    { step_no: 6, state: "PLAN", rule_fired: "SEQ_PLAN", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "closing set of 1 from 1 eligible (25 open no Suspense item)", next_state: "ACT", caused_events: [], llm: null },
    { step_no: 7, state: "ACT", rule_fired: "SEQ_INSPECT", tool: "decision_evidence", tool_input_hash: "1".repeat(64), observation_digest: "2".repeat(64), observation_summary: "inspect dec_23df9049", next_state: "ACT", caused_events: [], llm: null },
    { step_no: 8, state: "ACT", rule_fired: "P3_ESCALATE", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "dec_23df9049 carries a EVIDENCE_TIE certificate, gap 0 bps against ε 1500 bps", next_state: "ESCALATE", caused_events: [], llm: null },
    { step_no: 9, state: "ESCALATE", rule_fired: "P4_ADVANCE_CURSOR", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "all 1 escalations recorded", next_state: "AWAIT_HUMAN", caused_events: [], llm: null },
    { step_no: 10, state: "AWAIT_HUMAN", rule_fired: "SEQ_HANDOFF", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "1 item(s) awaiting human review; no financial write is available in this phase", next_state: "COMPLETE", caused_events: [], llm: null },
  ],
  escalations: [
    {
      decision_id: "dec_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
      entity_id: "setl_AMBIG000000000",
      obs_id: "obs_settlement00001",
      kind: "settlement",
      reason: "AMBIGUOUS_CERTIFICATE",
      value_paise: 10_000_000,
      suspense_key: "setl_AMBIG000000000",
      comp_id: "comp_58b9b393e020198ac22f26c0c6d9d4c57bb9867ae7d86b39cb9b28c10803fcbb",
      certificate_reason: "EVIDENCE_TIE",
      probes_attempted: [],
      evidence_score_gap_bps: 0,
      epsilon_bps: 1500,
      materiality_paise: 59_000,
      tau_paise: 20_413,
      closes_alone: true,
    },
  ],
  plan: {
    ids: ["dec_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875"],
    eligible: [],
    ineligible_count: 25,
    covers_residual: true,
    already_under_threshold: false,
  },
  residual_trajectory: [
    { step_no: 2, unresolved_value_paise: 10_000_000, close_threshold_paise: 674_719, period_status: "OPEN" },
  ],
  writes_attempted: 0,
  writes_applied: 0,
  financial_write_performed: false,
  awaiting_human_review: true,
  // The shape apps/api derives via evaluateController. Abbreviated to the
  // rows these tests assert on; packages/controller/tests/telemetry.test.ts
  // covers the full 17 against the real captured run.
  telemetry: {
    scope: "EXPLORATORY",
    trace_id: "a83f9b288bfd2dc2f90f9ba3063d3484517e08b55bee44e0a5b7ee33c2d22257",
    run_id: "run_fixture",
    terminal: "COMPLETE",
    stop_reason: "ESCALATED",
    halt_reason: null,
    checks: [
      { id: "terminal_reached", group: "terminal", passed: true, detail: "the loop ended in COMPLETE" },
      { id: "transitions_declared", group: "policy", passed: true, detail: "all 10 transitions appear in the declared table" },
      { id: "no_writes_attempted", group: "containment", passed: true, detail: "writes_attempted = 0" },
      { id: "no_model_call", group: "containment", passed: true, detail: "the controller consulted no model; its policy is deterministic code" },
      { id: "trace_id_recomputes", group: "grounding", passed: true, detail: "trace_id recomputes from (run_id, steps) — the run is reproducible by construction" },
      { id: "escalations_inspected", group: "grounding", passed: true, detail: "all 1 escalation(s) trace to a decision_evidence call whose recomputed input hash matches" },
      { id: "escalations_eligible", group: "escalation", passed: true, detail: "every escalated item opens a Suspense item, so clearing it could move the residual" },
    ],
    checks_passed: 7,
    checks_total: 7,
    all_passed: true,
    counters: {
      steps: 10,
      step_budget: 64,
      tool_calls: 4,
      tool_calls_by_name: { close_report: 1, exception_queue: 1, decision_evidence: 1, ledger_verify: 1 },
      writes_attempted: 0,
      writes_applied: 0,
      caused_events: 0,
      model_calls: 0,
      escalations: 1,
      plan_size: 1,
      eligible_items: 1,
      ineligible_items: 25,
    },
  },
};

const HALT_TRACE: ControllerTrace = {
  ...ESCALATED_TRACE,
  terminal: "HALT",
  stop_reason: null,
  halt_reason: "CHAIN_BROKEN",
  escalations: [],
  plan: null,
  residual_trajectory: [],
  awaiting_human_review: false,
};

/**
 * A period the gate actually closed: `stop_reason: "CLOSED"`, no escalation.
 *
 * Exists solely to prove the terminal label and the period-status card track
 * `trace.stop_reason` / `trace.residual_trajectory[0].period_status` rather
 * than a hardcoded string — the same component, given a genuinely different
 * trace, must render genuinely different words.
 */
const CLOSED_TRACE: ControllerTrace = {
  ...ESCALATED_TRACE,
  stop_reason: "CLOSED",
  escalations: [],
  plan: { ids: [], eligible: [], ineligible_count: 0, covers_residual: true, already_under_threshold: true },
  residual_trajectory: [
    { step_no: 2, unresolved_value_paise: 0, close_threshold_paise: 674_719, period_status: "CLOSED" },
  ],
  awaiting_human_review: false,
};

describe("ControllerTraceView — the escalated outcome", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("shows exactly one item escalated for review", () => {
    expect(html).toContain("Escalated for review");
    expect(html).toContain(">1<");
  });

  it("states no financial write was performed, and why it could not be", () => {
    expect(html).toContain("No — by construction");
    expect(html).toContain("Its tool surface is four reads. There is no write for it to attempt.");
    expect(html).not.toContain(">Yes<");
  });

  it("names the certificate reason and the evidence gap on the escalation card", () => {
    expect(html).toContain("EVIDENCE_TIE");
    expect(html).toContain("gap 0 bps against ε 1500 bps");
    expect(html).toContain("setl_AMBIG000000000");
  });

  it("notes when the item alone would close the residual", () => {
    expect(html).toContain("would bring the residual under the close threshold");
  });

  it("offers a review link into the Investigation Queue", () => {
    expect(html).toContain("Review in Investigation Queue");
  });

  it("does not render a halt notice on a successful escalation", () => {
    expect(html).not.toContain("Halted:");
  });
});

/**
 * The clarity fix itself: `terminal: "COMPLETE"` must not read as "the close
 * completed" when `stop_reason` says otherwise. Each assertion below matches
 * the terminal node's OWN `<p>` precisely (`>Escalated<`, `>Closed<`,
 * `>Halted<` — bare content, immediately closed, not a substring of
 * neighbouring prose like "Escalated for review") so a pass here is a pass on
 * the strip's terminal node specifically, not on the word appearing anywhere
 * on the page.
 */
describe("the terminal node names the stop reason, not just 'Complete'", () => {
  it("COMPLETE + stop_reason ESCALATED renders 'Escalated' on the terminal node", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">Escalated<");
    // The old, ambiguous label must be gone from the terminal node. It may
    // still legitimately appear as a STATE the strip passed through earlier
    // (none of REACHABLE_STATES is "Complete", so this is unconditional here).
    expect(html).not.toContain(">Complete<");
  });

  it("COMPLETE + stop_reason CLOSED renders 'Closed', not 'Escalated' — proves it is not hardcoded", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={CLOSED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">Closed<");
    expect(html).not.toContain(">Escalated<");
    expect(html).not.toContain(">Complete<");
  });

  it("HALT still renders 'Halted' on the terminal node", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">Halted<");
  });
});

describe("the financial period is displayed explicitly, from the trace", () => {
  it("shows 'Financial period' labelled with the real OPEN value on an escalated trace", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain("Financial period");
    expect(html).toContain(">OPEN<");
  });

  it("shows CLOSED on a trace whose own residual reading says CLOSED — not inferred from stop_reason", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={CLOSED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">CLOSED<");
    expect(html).not.toContain(">OPEN<");
  });

  it("falls back to '—' rather than inventing a status when no close reading exists", () => {
    // HALT_TRACE halts at P0 before OBSERVE_CLOSE ever lands — its
    // residual_trajectory is genuinely empty. Showing "—" here rather than a
    // guessed status is the same discipline `formatPaise`'s fallback already
    // uses on the "Unresolved vs. threshold" card beside it.
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain("Financial period");
    expect(html).not.toContain(">OPEN<");
    expect(html).not.toContain(">CLOSED<");
  });

  it("still states no financial write was performed, unchanged", () => {
    // Requirement 3: this line must survive the fix. It is asserted on the
    // CARD rather than on one phrasing of it — the label and the negative
    // verdict are the guarantee; how the verdict is worded is presentation.
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain("Financial write performed");
    expect(html).toContain("No — by construction");
    expect(html).not.toContain(">Yes<");
  });
});

describe("ControllerTraceView — the halt outcome", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("states the halt reason and that nothing further was done", () => {
    expect(html).toContain("Halted: CHAIN_BROKEN");
    expect(html).toContain("deterministic decision");
    expect(html).toContain("ledger are unaffected");
  });

  it("shows zero escalations and no review link", () => {
    expect(html).not.toContain("Review in Investigation Queue");
  });
});

describe("ControllerPanel — the idle state, with no run started", () => {
  it("renders without calling the API — no trace yet, button present", () => {
    // ControllerPanel calls useNavigate (for the escalation review link),
    // which requires a Router context even when never invoked.
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ControllerPanel runId="run_fixture" />
      </MemoryRouter>,
    );
    expect(html).toContain("Finance Controller — bounded orchestration");
    expect(html).toContain("Run Finance Controller");
    expect(html).toContain("Not yet run");
    // Nothing from a trace this component never fetched.
    expect(html).not.toContain("Escalated for review");
  });
});

/**
 * A behavioural proof that the fix reads `stop_reason` / `period_status`
 * rather than special-casing the real `demo-500` identifiers it happened to
 * be built against. `apps/web/tests/` has no filesystem access (its
 * `tsconfig.json` carries no Node types — the same boundary
 * `tests/product-surface-boundaries.test.ts` enforces on the SHIPPED bundle
 * applies here for a different reason), so this is proved by construction
 * instead: a trace built from wholly synthetic, non-demo ids still produces
 * the correct labels, which could only happen if the logic depends on the
 * two enum-shaped fields and nothing else.
 */
describe("the fix introduces no hardcoded demo figure or identifier", () => {
  const SYNTHETIC_ESCALATED: ControllerTrace = {
    ...ESCALATED_TRACE,
    run_id: "run_synthetic_0000000000000000000000000000000000000000000000000000",
    trace_id: "0".repeat(64),
    escalations: [
      {
        ...ESCALATED_TRACE.escalations[0]!,
        decision_id: "dec_synthetic_test_only",
        entity_id: "ent_synthetic_test_only",
        comp_id: "comp_synthetic_test_only",
        suspense_key: "sus_synthetic_test_only",
        value_paise: 1,
        materiality_paise: 1,
        tau_paise: 1,
      },
    ],
    residual_trajectory: [
      { step_no: 2, unresolved_value_paise: 1, close_threshold_paise: 0, period_status: "OPEN" },
    ],
  };

  it("still renders 'Escalated' and 'OPEN' from a trace carrying none of the real demo-500 ids or amounts", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={SYNTHETIC_ESCALATED} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">Escalated<");
    expect(html).toContain(">OPEN<");
    // And the synthetic identifiers this test invented DO appear, read back
    // from the trace — proving the escalation card itself is a passthrough,
    // not a template keyed on knowing the real run.
    expect(html).toContain("ent_synthetic_test_only");
  });

  it("renders 'Closed' for the same synthetic trace with only stop_reason and period_status flipped", () => {
    const synthetic_closed: ControllerTrace = {
      ...SYNTHETIC_ESCALATED,
      stop_reason: "CLOSED",
      escalations: [],
      residual_trajectory: [
        { step_no: 2, unresolved_value_paise: 0, close_threshold_paise: 0, period_status: "CLOSED" },
      ],
    };
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={synthetic_closed} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(html).toContain(">Closed<");
    expect(html).toContain(">CLOSED<");
    expect(html).not.toContain(">Escalated<");
  });
});

/**
 * A run that stopped at triage: the tool the loop needed next refused, so
 * `PLAN`, `ACT`, `ESCALATE` and `AWAIT_HUMAN` were never entered.
 *
 * Built by truncating the escalated trace's own steps rather than by inventing
 * a new one, so the only difference between it and the run above is how far the
 * loop got — which is exactly what the narrative is supposed to make visible.
 */
const STOPPED_AT_TRIAGE: ControllerTrace = {
  ...ESCALATED_TRACE,
  terminal: "HALT",
  stop_reason: null,
  halt_reason: "TOOL_REFUSED",
  steps: ESCALATED_TRACE.steps.slice(0, 5),
  escalations: [],
  plan: null,
  awaiting_human_review: false,
  telemetry: {
    ...ESCALATED_TRACE.telemetry,
    terminal: "HALT",
    stop_reason: null,
    halt_reason: "TOOL_REFUSED",
    counters: {
      ...ESCALATED_TRACE.telemetry.counters,
      steps: 5,
      tool_calls: 2,
      tool_calls_by_name: { close_report: 1, exception_queue: 1, decision_evidence: 0, ledger_verify: 0 },
      escalations: 0,
      plan_size: 0,
      eligible_items: 0,
      ineligible_items: 0,
    },
  },
};

/**
 * The reviewer-facing reading of the trace: observed → triaged → planned →
 * inspected → escalated → human review, in that order and in words.
 *
 * Each assertion pins the sentence to the structured field it is derived from,
 * so a detail line that stopped tracking the trace would fail here rather than
 * quietly render a plausible story. The label separator (`" — "`) is part of
 * the asserted string because the label and its dash are one text node — the
 * narrative deliberately emits no bare `>Escalated<` that the terminal-node
 * assertions above would collide with.
 */
describe("the run narrative — the six stages, in words", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("names all six stages, in the order the loop ran them", () => {
    const labels = [
      "Observed the close gate — ",
      "Triaged the queue — ",
      "Planned the closing set — ",
      "Inspected the evidence — ",
      "Escalated what it may not decide — ",
      "Handed to human review — ",
    ];
    const positions = labels.map((l) => html.indexOf(l));
    for (const [i, p] of positions.entries()) expect(p, labels[i]).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain("What this run did");
  });

  it("reads the observed stage off residual_trajectory, not off a summary string", () => {
    expect(html).toContain(
      "the close gate reports the period OPEN on ₹1,00,000 unresolved against a close threshold of ₹6,747.19.",
    );
  });

  it("reads the triaged stage off the telemetry counters", () => {
    expect(html).toContain("1 item(s) whose clearing could move the residual");
    expect(html).toContain("25 open with no Suspense item");
  });

  it("reads the planned stage off plan.ids and plan.covers_residual", () => {
    expect(html).toContain("a closing set of 1 was chosen");
    expect(html).toContain("clearing it would bring the residual under the close threshold.");
  });

  it("reads the inspected stage off the decision_evidence call count", () => {
    expect(html).toContain("1 decision(s) were read in full");
  });

  it("says why the escalated item reached a person rather than being decided", () => {
    expect(html).toContain("1 item(s) were routed to a person");
    expect(html).toContain("the controller has no authority to choose between the allocations");
  });

  it("keeps the no-financial-write boundary on the handoff stage itself", () => {
    expect(html).toContain("No financial write is available in this phase");
    expect(html).toContain("terminal state is a human, not a posting");
  });
});

describe("the narrative shows how far a stopped run actually got", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={STOPPED_AT_TRIAGE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("marks the stages the loop never entered rather than hiding them", () => {
    // All six stages are still listed — a reviewer must see what did not
    // happen, not infer it from an absence.
    expect(html).toContain("Observed the close gate — ");
    expect(html).toContain("Planned the closing set — ");
    expect(html).toContain("Handed to human review — ");
    expect(html).toContain("radio_button_unchecked");
  });

  it("says no plan was formed and no evidence was opened", () => {
    expect(html).toContain("no plan was formed.");
    expect(html).toContain("no decision");
    expect(html).toContain("evidence was opened.");
  });

  it("does not report a zero triage split the run never actually computed", () => {
    // The queue WAS read (one exception_queue call) but PLAN never ran, so the
    // eligible/ineligible counters are legitimately zero. Rendering them as
    // "0 item(s) whose clearing could move the residual" would state a finding
    // this run never made.
    expect(html).toContain("the exception queue was read, but the loop stopped before the plan");
    expect(html).not.toContain("0 item(s) whose clearing could move the residual");
  });

  it("still states the write boundary on the path where nothing was handed over", () => {
    expect(html).toContain("no handoff was made");
    expect(html).toContain("this phase performs no financial write on any path");
  });

  it("does not claim an escalation the trace does not carry", () => {
    expect(html).not.toContain("1 item(s) were routed to a person");
    expect(html).toContain("nothing was escalated.");
  });
});

/**
 * The runtime telemetry block.
 *
 * What is asserted is that the panel renders the checks the API derived —
 * grouped, labelled `EXPLORATORY`, and with the failing ones visibly failing.
 * The figures themselves are `@assay/controller`'s;
 * `packages/controller/tests/telemetry.test.ts` proves them against the real
 * captured `demo-500` evidence, and nothing is recomputed here.
 */
describe("the telemetry block — runtime checks, on screen", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("labels the block EXPLORATORY, as §L.4 requires of any metric outside §8", () => {
    // F-15: named for what they are — assertions the controller derives from
    // its own trace — so the tally cannot read as an independent attestation.
    expect(html).toContain("Runtime policy assertions");
    expect(html).toContain("EXPLORATORY");
    expect(html).toContain("not an independent audit");
  });

  it("reports the passed/total tally the API computed", () => {
    expect(html).toContain("7 / 7 passed");
  });

  it("groups the checks under the five questions they answer", () => {
    expect(html).toContain("Terminal correctness");
    expect(html).toContain("Policy compliance");
    expect(html).toContain("Containment");
    expect(html).toContain("Evidence grounding");
    expect(html).toContain("Escalation correctness");
  });

  it("shows each check by id with the detail that makes it recomputable", () => {
    expect(html).toContain("no_writes_attempted");
    expect(html).toContain("writes_attempted = 0");
    expect(html).toContain("trace_id_recomputes");
    expect(html).toContain("escalations_inspected");
  });

  it("shows the counters a reviewer needs, including the four write-boundary zeroes", () => {
    for (const label of [
      "writes attempted", "writes applied", "ledger events caused", "model calls",
      "escalations", "tool calls", "steps",
    ]) {
      expect(html, label).toContain(label);
    }
    // Under budget, so the ratio is shown plainly with no "bound reached".
    expect(html).toContain("10 / 64");
    expect(html).not.toContain("bound reached");
  });

  it("names the read tools the run actually called", () => {
    expect(html).toContain("close_report");
    expect(html).toContain("exception_queue");
    expect(html).toContain("decision_evidence");
    expect(html).toContain("ledger_verify");
  });

  it("renders a failed check as failed, with the API's own explanation", () => {
    const failing: ControllerTrace = {
      ...ESCALATED_TRACE,
      telemetry: {
        ...ESCALATED_TRACE.telemetry,
        checks: ESCALATED_TRACE.telemetry.checks.map((c) =>
          c.id === "no_writes_attempted"
            ? { ...c, passed: false, detail: "writes_attempted = 3" }
            : c,
        ),
        checks_passed: 6,
        all_passed: false,
      },
    };
    const failedHtml = renderToStaticMarkup(
      <ControllerTraceView trace={failing} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(failedHtml).toContain("6 / 7 passed");
    expect(failedHtml).toContain("writes_attempted = 3");
    // The failure icon, which the all-passing render does not produce.
    expect(failedHtml).toContain("cancel");
    expect(html).not.toContain("cancel");
  });
});

/**
 * The escalation card's plain-language chain.
 *
 * A reviewer should not need to know what `AMBIGUOUS_CERTIFICATE` means, nor
 * hold ε and τ in their head, to follow why one item reached a person. Every
 * quantity in the sentence is the certificate's own, formatted.
 */
describe("the escalation explains itself in words, from its own fields", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
  );

  it("says what ASSAY decided and why the evidence did not separate the candidates", () => {
    expect(html).toContain("ASSAY abstained (EVIDENCE_TIE)");
    expect(html).toContain("two allocations satisfy every hard constraint");
    expect(html).toContain("they differ by 0 bps, inside the ε tolerance of 1500 bps");
  });

  it("places the amount at stake against the materiality floor, both from the record", () => {
    expect(html).toContain("the amount at stake (₹590)");
    expect(html).toContain("above the materiality floor τ of ₹204.13");
  });

  it("reports the probe attempts rather than implying a search happened", () => {
    // F-05: with `probes_attempted: []` no probe ran, so the sentence must not
    // assert that one was tried and failed. What happened is that the frozen
    // probe policy offered nothing to run and the tie stood.
    expect(html).toContain(
      "no probe was required or available under the frozen probe policy, so the evidence stayed tied",
    );
    expect(html).not.toContain("no admissible probe could break the tie");
  });

  it("ends on the authority boundary — the controller may not choose", () => {
    expect(html).toContain("The controller may not choose between them, so it escalated.");
  });

  it("uses the other wording when there is no certificate to abstain on", () => {
    const noWarrant: ControllerTrace = {
      ...ESCALATED_TRACE,
      escalations: [
        {
          ...ESCALATED_TRACE.escalations[0]!,
          reason: "NO_DETERMINISTIC_WARRANT",
          certificate_reason: null,
        },
      ],
    };
    const other = renderToStaticMarkup(
      <ControllerTraceView trace={noWarrant} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />,
    );
    expect(other).toContain("no deterministic rule can clear it");
    expect(other).toContain("the correct posting is the thing that is not known");
    expect(other).not.toContain("ASSAY abstained (EVIDENCE_TIE)");
  });
});

/**
 * The narrative follows the escalation reasons the trace actually carries.
 *
 * `demo-500` escalates exactly one item and it carries a `§13` certificate, so
 * for a long time "ASSAY abstained" was true of every escalation the panel had
 * ever rendered. It is not true of a period whose residual is mostly
 * unattributed bank credits: those reach `E03`, open a Suspense item under
 * `P5`, and carry no certificate — ASSAY did not abstain on them and left no
 * allocations open, because `S2` found no admissible allocation at all.
 *
 * The traces below are the escalated trace with its escalation list varied.
 * Nothing else changes, so what is being asserted is that the sentence follows
 * the records rather than the shape of the run.
 */
const WARRANT_ESCALATION: ControllerTrace["escalations"][number] = {
  decision_id: "dec_unattributed_bank_credit",
  entity_id: "bnk_UNATTRIB000001",
  obs_id: "obs_bankline90001",
  kind: "bank_line",
  reason: "NO_DETERMINISTIC_WARRANT",
  value_paise: 4_500_000,
  suspense_key: "bnk_UNATTRIB000001",
  comp_id: null,
  certificate_reason: null,
  probes_attempted: [],
  evidence_score_gap_bps: null,
  epsilon_bps: null,
  materiality_paise: null,
  tau_paise: null,
  closes_alone: false,
};

const narrativeOf = (trace: ControllerTrace): string =>
  renderToStaticMarkup(<ControllerTraceView trace={trace} onReviewClick={() => undefined} onTryAnother={() => undefined} onVerifyLedger={() => undefined} />);

describe("the escalated stage names the reasons the trace carries", () => {
  it("claims abstention only where every escalation carries a certificate", () => {
    const html = narrativeOf(ESCALATED_TRACE);
    expect(html).toContain("1 item(s) were routed to a person: ASSAY abstained");
    expect(html).not.toContain("no deterministic rule can clear, and the correct");
  });

  it("claims no abstention where no escalation carries a certificate", () => {
    const html = narrativeOf({
      ...ESCALATED_TRACE,
      escalations: [WARRANT_ESCALATION],
    });
    expect(html).toContain(
      "1 item(s) were routed to a person: a Suspense item was opened that no deterministic " +
        "rule can clear",
    );
    // The abstention claim must be absent, not merely outnumbered.
    expect(html).not.toContain("routed to a person: ASSAY abstained");
  });

  it("splits the count when the closing set holds both kinds", () => {
    const html = narrativeOf({
      ...ESCALATED_TRACE,
      escalations: [...ESCALATED_TRACE.escalations, WARRANT_ESCALATION],
    });
    expect(html).toContain("2 item(s) were routed to a person — 1 where ASSAY abstained");
    expect(html).toContain("and 1 where a Suspense item was opened that no deterministic rule");
  });

  it("does not attribute a certificate to every inspected decision", () => {
    const html = narrativeOf({
      ...ESCALATED_TRACE,
      escalations: [WARRANT_ESCALATION],
    });
    expect(html).toContain("1 decision(s) were read in full");
    expect(html).not.toContain("were read in full — the Ambiguity Certificate");
  });
});

/**
 * A run that stopped on its own step bound.
 *
 * The escalations are real and the handoff is not: `AWAIT_HUMAN` was never
 * entered, and part of the closing set was never worked. Reporting it as
 * "waiting on a person" alone would present a partial pass as a completed one.
 */
describe("the review stage reports a budget-exhausted run as partial", () => {
  const html = narrativeOf({
    ...ESCALATED_TRACE,
    stop_reason: "BUDGET_EXHAUSTED",
    plan: {
      ...(ESCALATED_TRACE.plan ?? { eligible: [], ineligible_count: 0, covers_residual: true, already_under_threshold: false }),
      ids: ["a", "b", "c"],
    },
  });

  it("names how much of the closing set was worked and how much was not", () => {
    expect(html).toContain("the step budget ran out before the closing set was finished");
    expect(html).toContain("1 of 3 planned item(s) reached a person and 2 were not worked");
    expect(html).toContain("The result is partial and is reported as partial");
  });

  it("claims no handoff, because the loop never reached one", () => {
    expect(html).not.toContain("item(s) are waiting on a person");
  });

  it("still states the no-financial-write boundary", () => {
    expect(html).toContain("Nothing was written on any path");
  });
});

/**
 * The full seventeen, as `@assay/controller`'s telemetry layer emits them.
 *
 * The abbreviated fixture above carries seven, which is enough for the
 * detailed grid but not for the question the summary raises: does every check
 * the controller can emit have a home in the six-row read? This list mirrors
 * `packages/controller/src/telemetry.ts`'s `TELEMETRY_CHECK_IDS` and its group
 * assignment. It is transcribed rather than imported because `apps/web/tests/`
 * deliberately depends on nothing outside `apps/web/src` — the same boundary
 * the shipped bundle is held to — and a drift between this list and the
 * controller's own is caught by the partition assertion below plus
 * `packages/controller/tests/telemetry.test.ts`, which asserts the real set.
 */
const ALL_CHECKS: ControllerTrace["telemetry"]["checks"] = [
  { id: "terminal_reached", group: "terminal", passed: true, detail: "the loop ended in COMPLETE" },
  { id: "terminal_reason_coherent", group: "terminal", passed: true, detail: "COMPLETE carries stop_reason ESCALATED and no halt reason" },
  { id: "transitions_declared", group: "policy", passed: true, detail: "all 10 transitions appear in the declared table" },
  { id: "rules_declared", group: "policy", passed: true, detail: "every step names one of the declared rules" },
  { id: "budget_not_exhausted", group: "policy", passed: true, detail: "10 step(s) against a bound of 64" },
  { id: "no_write_phase_state", group: "containment", passed: true, detail: "no step entered or targeted a write-phase state" },
  { id: "no_writes_attempted", group: "containment", passed: true, detail: "writes_attempted = 0" },
  { id: "no_writes_applied", group: "containment", passed: true, detail: "writes_applied = 0" },
  { id: "no_caused_events", group: "containment", passed: true, detail: "no step caused a ledger event" },
  { id: "no_model_call", group: "containment", passed: true, detail: "the controller consulted no model" },
  { id: "reads_only", group: "containment", passed: true, detail: "every tool call was a read" },
  { id: "observations_hashed", group: "grounding", passed: true, detail: "every tool call carries a sha256 input hash and observation digest" },
  { id: "escalations_inspected", group: "grounding", passed: true, detail: "all 1 escalation(s) trace to a decision_evidence call" },
  { id: "trace_id_recomputes", group: "grounding", passed: true, detail: "trace_id recomputes from (run_id, steps)" },
  { id: "escalations_eligible", group: "escalation", passed: true, detail: "every escalated item opens a Suspense item" },
  { id: "escalations_planned", group: "escalation", passed: true, detail: "every escalation was on the closing set of 1" },
  { id: "escalation_reason_consistent", group: "escalation", passed: true, detail: "AMBIGUOUS_CERTIFICATE is claimed exactly where a §13 certificate exists" },
];

const FULL_TELEMETRY_TRACE: ControllerTrace = {
  ...ESCALATED_TRACE,
  telemetry: {
    ...ESCALATED_TRACE.telemetry,
    checks: ALL_CHECKS,
    checks_passed: ALL_CHECKS.length,
    checks_total: ALL_CHECKS.length,
    all_passed: true,
  },
};

/** A run that stopped on its own step bound, with a plan larger than what it worked. */
const BUDGET_EXHAUSTED_TRACE: ControllerTrace = {
  ...ESCALATED_TRACE,
  stop_reason: "BUDGET_EXHAUSTED",
  awaiting_human_review: false,
  plan: {
    ids: ["dec_a", "dec_b", "dec_c"],
    eligible: [],
    ineligible_count: 0,
    covers_residual: false,
    already_under_threshold: false,
  },
  telemetry: {
    ...ESCALATED_TRACE.telemetry,
    stop_reason: "BUDGET_EXHAUSTED",
    checks: [
      ...ESCALATED_TRACE.telemetry.checks,
      {
        id: "budget_not_exhausted",
        group: "policy",
        passed: false,
        detail: "the 64-step bound was reached; the result is partial",
      },
    ],
    checks_passed: 7,
    checks_total: 8,
    all_passed: false,
  },
};

const view = (trace: ControllerTrace): string =>
  renderToStaticMarkup(
    <ControllerTraceView
      trace={trace}
      onReviewClick={() => undefined}
      onTryAnother={() => undefined}
      onVerifyLedger={() => undefined}
    />,
  );

/**
 * The outcome banner — the reviewer-facing answer to "so what happened?",
 * above the state strip that used to be the first thing on the panel.
 *
 * Every assertion below pins a sentence to the trace field it is derived from.
 * The three outcomes are asserted against three genuinely different traces
 * rather than three phrasings of one, because the claim being tested is that
 * the banner tracks `stop_reason` and `terminal` and not the shape of the run
 * it was written against.
 */
describe("the outcome banner reads the result off the trace", () => {
  it("leads with the terminal outcome and the trace's own reason code", () => {
    const html = view(ESCALATED_TRACE);
    expect(html).toContain("Controller outcome");
    expect(html).toContain(">Escalated<");
    expect(html).toContain("reason ESCALATED");
  });

  it("explains an escalated run in plain language, without claiming a write", () => {
    const html = view(ESCALATED_TRACE);
    expect(html).toContain("1 item(s) reached a person");
    expect(html).toContain("terminal state is a human rather than a posting");
    expect(html).toContain("No financial write was performed.");
  });

  it("shows the four counts that bound what the run was allowed to do", () => {
    const html = view(ESCALATED_TRACE);
    for (const label of ["Steps", "Tool calls", "Escalations", "Writes applied"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("10 / 64");
  });

  it("reads a CLOSED period as closed, and claims no escalation", () => {
    const html = view(CLOSED_TRACE);
    expect(html).toContain("reason CLOSED");
    expect(html).toContain("The period is inside its close threshold");
    expect(html).toContain("it escalated nothing and changed nothing");
    expect(html).not.toContain("reached a person. The controller may not decide them");
  });

  it("reads a HALT as a guard, naming the halt reason rather than a stop reason", () => {
    const html = view(HALT_TRACE);
    expect(html).toContain("reason CHAIN_BROKEN");
    expect(html).toContain("A guard stopped the loop: CHAIN_BROKEN");
    expect(html).toContain("the deterministic decision and the ledger are unaffected");
  });

  it("reads BUDGET_EXHAUSTED as a bounded partial result — neither a close nor a failure", () => {
    const html = view(BUDGET_EXHAUSTED_TRACE);
    expect(html).toContain("Bounded partial result");
    expect(html).toContain("The step bound was reached before the closing set was finished");
    expect(html).toContain("neither a close nor a failure");
    expect(html).toContain("1 of 3 planned item(s) reached a person");
    // It is not reported as a close, and not reported as a completed handoff.
    expect(html).not.toContain("The period is inside its close threshold");
  });

  it("does not head a budget-exhausted run's escalations as a completed handoff", () => {
    const html = view(BUDGET_EXHAUSTED_TRACE);
    expect(html).toContain("Escalated — the loop stopped before the handoff");
    expect(html).not.toContain(">Awaiting human review<");
    // …while the run that DID reach the handoff still says so.
    expect(view(ESCALATED_TRACE)).toContain("Awaiting human review");
  });
});

/**
 * The financial period is glossed, not just named.
 *
 * `OPEN` is an enum value, and on its own it reads as a neutral status rather
 * than as the statement that value is still sitting in Suspense. The gloss is
 * keyed on the status the trace's own close reading carries.
 */
describe("the financial period card explains what its status means", () => {
  it("says OPEN means unresolved value, not merely 'not closed'", () => {
    const html = view(ESCALATED_TRACE);
    expect(html).toContain(">OPEN<");
    expect(html).toContain("value is still in Suspense, so the period cannot close");
  });

  it("says CLOSED means every gate passed and the residual is inside the threshold", () => {
    const html = view(CLOSED_TRACE);
    expect(html).toContain(">CLOSED<");
    expect(html).toContain("every gate passed and the residual is inside the close threshold");
  });

  it("glosses nothing when there is no close reading to gloss", () => {
    const html = view(HALT_TRACE);
    expect(html).not.toContain("value is still in Suspense");
    expect(html).not.toContain("every gate passed and the residual is inside");
  });
});

/**
 * The compact telemetry summary — six answers over the seventeen checks.
 *
 * The partition assertion is the load-bearing one: it proves the six rows
 * between them cover every check id the controller emits, exactly once. A
 * check that fell outside them would silently vanish from the summary while
 * still counting in the tally beside it, which is precisely the kind of
 * quiet disagreement a summary must not be able to introduce.
 */
describe("the telemetry summary answers six questions over the seventeen checks", () => {
  const html = view(FULL_TELEMETRY_TRACE);

  it("names the six questions a reviewer reads first", () => {
    for (const label of [
      "Goal reached",
      "Policy compliant",
      "Evidence grounded",
      "No financial writes",
      "Escalation correct",
      "Reproducible trace",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("partitions every one of the seventeen checks into exactly one row", () => {
    expect(ALL_CHECKS).toHaveLength(17);
    for (const check of ALL_CHECKS) {
      const homes = TELEMETRY_SUMMARY_ROWS.filter((row) => row.covers(check));
      expect(homes.map((h) => h.key), check.id).toHaveLength(1);
    }
  });

  it("reports each row as a conjunction of the checks it matched, not as a verdict", () => {
    // 6 containment checks, 3 policy, 2 terminal, 2 grounding-minus-repro,
    // 3 escalation, 1 reproducibility — the counts are visible, so a reviewer
    // can see how much evidence is behind each line.
    expect(html).toContain("6 / 6 checks");
    expect(html).toContain("3 / 3 checks");
    expect(html).toContain("2 / 2 checks");
    expect(html).toContain("1 / 1 checks");
  });

  it("keeps the detailed seventeen on the page, behind a disclosure", () => {
    expect(html).toContain("Show all 17 checks");
    expect(html).toContain("<details>");
    // Every id is still rendered — the disclosure hides them visually, it does
    // not remove them, so nothing that could fail is off the page.
    for (const check of ALL_CHECKS) expect(html, check.id).toContain(check.id);
  });

  it("names the failing check inside the row that summarises it", () => {
    const html2 = view(BUDGET_EXHAUSTED_TRACE);
    expect(html2).toContain("Policy compliant");
    expect(html2).toContain("budget_not_exhausted");
    expect(html2).toContain("the 64-step bound was reached; the result is partial");
    expect(html2).toContain("cancel");
  });

  it("says 'not reported' rather than passing a row no check backs", () => {
    // A telemetry payload that checked nothing must not read as a clean bill
    // of health: an empty conjunction is true, and rendering it as a tick
    // would report "nothing was checked" as "everything passed".
    const empty: ControllerTrace = {
      ...ESCALATED_TRACE,
      telemetry: { ...ESCALATED_TRACE.telemetry, checks: [], checks_passed: 0, checks_total: 0, all_passed: true },
    };
    const html2 = view(empty);
    expect([...html2.matchAll(/not reported/g)]).toHaveLength(TELEMETRY_SUMMARY_ROWS.length);
    expect(html2).not.toContain("0 / 0 checks");
  });
});

/**
 * Where a reviewer goes next, named on the panel rather than left to be found
 * in the sidebar.
 */
describe("the panel names the two next steps after a run", () => {
  const html = view(ESCALATED_TRACE);

  it("offers the independent check of the chain", () => {
    expect(html).toContain("Verify ledger integrity");
    expect(html).toContain("recomputes this run&#x27;s hash chain from genesis");
  });

  it("offers another period, and says why that is worth doing", () => {
    expect(html).toContain("Try another scenario");
    expect(html).toContain("runs the same controller over different evidence");
  });
});

/**
 * The reviewer pass introduces no scenario-specific result.
 *
 * The same proof by construction the terminal-label suite above uses: a trace
 * built from wholly synthetic identifiers, amounts and counts still produces
 * the right words, which could only happen if every sentence reads the trace's
 * own fields.
 */
describe("the outcome banner and summary hardcode no scenario's result", () => {
  const SYNTHETIC: ControllerTrace = {
    ...FULL_TELEMETRY_TRACE,
    run_id: "run_not_a_demo_period_at_all",
    trace_id: "f".repeat(64),
    stop_reason: "NO_ELIGIBLE_ITEM",
    escalations: [],
    awaiting_human_review: false,
    plan: { ids: [], eligible: [], ineligible_count: 7, covers_residual: false, already_under_threshold: false },
    residual_trajectory: [
      { step_no: 2, unresolved_value_paise: 77, close_threshold_paise: 3, period_status: "BLOCKED" },
    ],
  };

  it("renders the fourth stop reason it was never built against", () => {
    const html = view(SYNTHETIC);
    expect(html).toContain(">No eligible item<");
    expect(html).toContain("reason NO_ELIGIBLE_ITEM");
    expect(html).toContain("Nothing on the exception queue opens a Suspense item");
    expect(html).not.toContain("reached a person. The controller may not decide them");
  });

  it("glosses a BLOCKED period as blocked, a status no demo fixture in this file carries", () => {
    const html = view(SYNTHETIC);
    expect(html).toContain(">BLOCKED<");
    expect(html).toContain("a close gate failed");
  });
});
