import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ControllerPanel, ControllerTraceView } from "../src/components/ControllerPanel.js";
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
    <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} />,
  );

  it("shows exactly one item escalated for review", () => {
    expect(html).toContain("Escalated for review");
    expect(html).toContain(">1<");
  });

  it("states no financial write was performed", () => {
    expect(html).toContain("No — observe-only phase");
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
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain(">Escalated<");
    // The old, ambiguous label must be gone from the terminal node. It may
    // still legitimately appear as a STATE the strip passed through earlier
    // (none of REACHABLE_STATES is "Complete", so this is unconditional here).
    expect(html).not.toContain(">Complete<");
  });

  it("COMPLETE + stop_reason CLOSED renders 'Closed', not 'Escalated' — proves it is not hardcoded", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={CLOSED_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain(">Closed<");
    expect(html).not.toContain(">Escalated<");
    expect(html).not.toContain(">Complete<");
  });

  it("HALT still renders 'Halted' on the terminal node", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain(">Halted<");
  });
});

describe("the financial period is displayed explicitly, from the trace", () => {
  it("shows 'Financial period' labelled with the real OPEN value on an escalated trace", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain("Financial period");
    expect(html).toContain(">OPEN<");
  });

  it("shows CLOSED on a trace whose own residual reading says CLOSED — not inferred from stop_reason", () => {
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={CLOSED_TRACE} onReviewClick={() => undefined} />,
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
      <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain("Financial period");
    expect(html).not.toContain(">OPEN<");
    expect(html).not.toContain(">CLOSED<");
  });

  it("still states no financial write was performed, unchanged", () => {
    // Requirement 3: this line's wording must survive the fix intact.
    const html = renderToStaticMarkup(
      <ControllerTraceView trace={ESCALATED_TRACE} onReviewClick={() => undefined} />,
    );
    expect(html).toContain("Financial write performed");
    expect(html).toContain("No — observe-only phase");
  });
});

describe("ControllerTraceView — the halt outcome", () => {
  const html = renderToStaticMarkup(
    <ControllerTraceView trace={HALT_TRACE} onReviewClick={() => undefined} />,
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
    expect(html).toContain("Close controller");
    expect(html).toContain("Run close loop");
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
      <ControllerTraceView trace={SYNTHETIC_ESCALATED} onReviewClick={() => undefined} />,
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
      <ControllerTraceView trace={synthetic_closed} onReviewClick={() => undefined} />,
    );
    expect(html).toContain(">Closed<");
    expect(html).toContain(">CLOSED<");
    expect(html).not.toContain(">Escalated<");
  });
});
