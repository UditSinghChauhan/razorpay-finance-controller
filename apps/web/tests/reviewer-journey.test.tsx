import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ControllerTraceView } from "../src/components/ControllerPanel.js";
import { RunContext } from "../src/context/RunContext.js";
import type { ControllerTrace, LedgerVerification } from "../src/hooks/useAssayApi.js";
import { CertificateStory } from "../src/pages/AmbiguityCertificate.js";
import { VerificationResult } from "../src/pages/AuditLogs.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { DecisionVerdict } from "../src/pages/EvidenceTrail.js";
import { InvestigationQueue } from "../src/pages/InvestigationQueue.js";
import {
  AUTHORITY_ONE_LINE,
  CERTIFICATE_BENCHMARK_BOUNDARY,
  LEDGER_EVENT_HEADING,
  NO_MODEL_WRITES,
  PRODUCT_AGENTIC,
  PRODUCT_WHAT,
} from "../src/lib/copy.js";
import { CLOSE_500, DECISION_DETAIL, EXCEPTIONS, RUN, runContext } from "./fixtures.js";

/**
 * The reviewer journey, as a reviewer meets it: what this is, what the engine
 * decided, what the controller did next, why it stopped, what remains, and how
 * to check it.
 *
 * Each page is rendered through `renderToStaticMarkup` and asserted on the
 * markup it produces, the technique the rest of `apps/web/tests` uses. The
 * question every case here asks is the same one: *can this be answered without
 * scrolling past the fold or knowing the field names?*
 */

function page(node: React.ReactElement, ctx = runContext()): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={ctx}>{node}</RunContext.Provider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// 1. The first minute — what this is, before any figure
// ---------------------------------------------------------------------------

describe("the Command Center answers 'what is this' before it shows a number", () => {
  const html = page(<CommandCenter />, runContext({ close: CLOSE_500 }));

  it("says what the product is, and what is agentic about it", () => {
    expect(html).toContain(PRODUCT_WHAT);
    expect(html).toContain(PRODUCT_AGENTIC);
  });

  it("states the authority ordering in one line", () => {
    expect(html).toContain(AUTHORITY_ONE_LINE);
  });

  it("says no model can change the books, and why", () => {
    // Asserted in halves: the constant carries an apostrophe, and
    // `renderToStaticMarkup` escapes it to `&#x27;`.
    expect(NO_MODEL_WRITES).toContain("No model can change the books.");
    expect(html).toContain("No model can change the books.");
    expect(html).toContain("tool surface is four reads");
    expect(html).toContain("the explanation layer is removable");
  });

  it("puts the brief above the first rupee figure", () => {
    const briefAt = html.indexOf(PRODUCT_WHAT);
    const metricAt = html.indexOf("Total Processed");
    expect(briefAt).toBeGreaterThan(-1);
    expect(metricAt).toBeGreaterThan(briefAt);
  });

  it("says the same thing on the start screen, where there is no run to describe", () => {
    const start = page(<CommandCenter />, runContext({ run: null, close: null, loading: false }));
    expect(start).toContain(PRODUCT_WHAT);
    expect(start).toContain(AUTHORITY_ONE_LINE);
  });
});

// ---------------------------------------------------------------------------
// 2. The status ribbon — financial state and controller state, together
// ---------------------------------------------------------------------------

describe("the status ribbon carries the whole outcome above the fold", () => {
  const html = page(<CommandCenter />, runContext({ close: CLOSE_500 }));

  it("names the period under review, by its scenario label and its id", () => {
    expect(html).toContain("Period under review");
    expect(html).toContain("Ambiguity");
    expect(html).toContain("demo-500");
  });

  it("puts the unresolved value against the threshold it is measured on", () => {
    expect(html).toContain("Unresolved vs. close threshold");
    // Both from the close report, formatted and not recomputed.
    expect(html).toContain("₹1,00,000");
    expect(html).toContain("₹6,747.19");
  });

  it("says the residual is held in Suspense while the period cannot close", () => {
    expect(html).toContain("Held in Suspense");
  });

  it("reports the controller as available, and claims no outcome for it", () => {
    // Nothing has run. Availability is a fact; an outcome would be a
    // prediction, and the panel below is the only thing entitled to state one.
    expect(html).toContain("Finance Controller");
    expect(html).toContain("Not yet run");
    expect(html).not.toContain("Escalated to human review");
  });

  it("offers the two next actions from where the claim is made", () => {
    expect(html).toContain("Verify Ledger");
    expect(html).toContain("Work the unresolved items");
  });

  it("offers no work-the-items action on a period with nothing unresolved", () => {
    const closed = page(
      <CommandCenter />,
      runContext({
        run: { ...RUN, summary: { ...RUN.summary, unresolved_value_paise: 0, abstentions: 0, period_status: "CLOSED" } },
        close: { ...CLOSE_500, unresolved_value_paise: 0, period_status: "CLOSED" },
      }),
    );
    expect(closed).not.toContain("Work the unresolved items");
    expect(closed).toContain("Nothing is held in Suspense against this period.");
  });
});

// ---------------------------------------------------------------------------
// 3. The controller panel — outcome, why, trace, narrative, checks, handoff
// ---------------------------------------------------------------------------

/**
 * A deliberately synthetic trace: no demo identifier, no demo amount, no demo
 * count. Everything the panel says about it therefore has to have been read
 * off the trace.
 */
const TRACE: ControllerTrace = {
  trace_id: "e".repeat(64),
  run_id: "run_synthetic",
  phase: "observe-only",
  terminal: "COMPLETE",
  stop_reason: "ESCALATED",
  halt_reason: null,
  steps: [
    { step_no: 1, state: "INIT", rule_fired: "SEQ_VERIFY", tool: "ledger_verify", tool_input_hash: null, observation_digest: null, observation_summary: "verify", next_state: "OBSERVE_CLOSE", caused_events: [], llm: null },
    { step_no: 2, state: "OBSERVE_CLOSE", rule_fired: "SEQ_OBSERVE", tool: "close_report", tool_input_hash: null, observation_digest: null, observation_summary: "observe", next_state: "TRIAGE", caused_events: [], llm: null },
    { step_no: 3, state: "TRIAGE", rule_fired: "SEQ_TRIAGE", tool: "exception_queue", tool_input_hash: null, observation_digest: null, observation_summary: "triage", next_state: "PLAN", caused_events: [], llm: null },
    { step_no: 4, state: "PLAN", rule_fired: "SEQ_PLAN", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "plan", next_state: "ACT", caused_events: [], llm: null },
    { step_no: 5, state: "ACT", rule_fired: "SEQ_INSPECT", tool: "decision_evidence", tool_input_hash: null, observation_digest: null, observation_summary: "inspect", next_state: "ESCALATE", caused_events: [], llm: null },
    { step_no: 6, state: "ESCALATE", rule_fired: "P3_ESCALATE", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "escalate", next_state: "AWAIT_HUMAN", caused_events: [], llm: null },
    { step_no: 7, state: "AWAIT_HUMAN", rule_fired: "SEQ_HANDOFF", tool: null, tool_input_hash: null, observation_digest: null, observation_summary: "handoff", next_state: "COMPLETE", caused_events: [], llm: null },
  ],
  escalations: [
    {
      decision_id: "dec_synthetic",
      entity_id: "ent_synthetic",
      obs_id: "ob_synthetic",
      kind: "settlement",
      reason: "AMBIGUOUS_CERTIFICATE",
      value_paise: 777,
      suspense_key: "ent_synthetic",
      comp_id: null,
      certificate_reason: "EVIDENCE_TIE",
      probes_attempted: [],
      evidence_score_gap_bps: 3,
      epsilon_bps: 11,
      materiality_paise: 41,
      tau_paise: 13,
      closes_alone: false,
    },
  ],
  plan: { ids: ["dec_synthetic"], eligible: [], ineligible_count: 2, covers_residual: false, already_under_threshold: false },
  residual_trajectory: [
    { step_no: 2, unresolved_value_paise: 777, close_threshold_paise: 55, period_status: "OPEN" },
  ],
  writes_attempted: 0,
  writes_applied: 0,
  financial_write_performed: false,
  awaiting_human_review: true,
  telemetry: {
    scope: "EXPLORATORY",
    trace_id: "e".repeat(64),
    run_id: "run_synthetic",
    terminal: "COMPLETE",
    stop_reason: "ESCALATED",
    halt_reason: null,
    checks: [
      { id: "terminal_reached", group: "terminal", passed: true, detail: "reached COMPLETE" },
      { id: "transitions_declared", group: "policy", passed: true, detail: "declared" },
      { id: "no_writes_attempted", group: "containment", passed: true, detail: "writes_attempted = 0" },
      { id: "trace_id_recomputes", group: "grounding", passed: true, detail: "recomputes" },
      { id: "escalations_eligible", group: "escalation", passed: true, detail: "eligible" },
    ],
    checks_passed: 5,
    checks_total: 5,
    all_passed: true,
    counters: {
      steps: 7,
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
      ineligible_items: 2,
    },
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

describe("the controller panel is ordered outcome → why → trace → narrative → checks → handoff → evidence", () => {
  const html = view(TRACE);

  it("reads top to bottom in that order", () => {
    const positions = [
      html.indexOf("Controller outcome"),
      html.indexOf("Why it stopped"),
      html.indexOf("Workflow trace"),
      html.indexOf("What this run did"),
      html.indexOf("Runtime policy assertions"),
      html.indexOf("Awaiting human review"),
      html.indexOf("Supporting evidence"),
    ];
    for (const [i, p] of positions.entries()) expect(p, `position ${String(i)}`).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("leads with the outcome word and a one-clause why, not a field dump", () => {
    expect(html).toContain(">Escalated<");
    expect(html).toContain("It reached items it may not decide, and handed them to human review.");
  });

  it("keeps the compact six-question read of the runtime checks", () => {
    for (const label of [
      "Goal reached", "Policy compliant", "Evidence grounded",
      "No financial writes", "Escalation correct", "Reproducible trace",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("keeps the detailed checks on the page, behind the disclosure", () => {
    expect(html).toContain("<details>");
    for (const check of TRACE.telemetry.checks) expect(html, check.id).toContain(check.id);
  });
});

describe("the workflow chain is the reviewer-facing proof that the loop ran", () => {
  it("names every stage of the escalation chain", () => {
    const html = view(TRACE);
    for (const node of [
      "Observed close gate",
      "Triaged queue",
      "Planned candidate work",
      "Inspected evidence",
      "Could not safely decide",
      "Escalated to human review",
    ]) {
      expect(html, node).toContain(node);
    }
  });

  it("marks each stage reached from the trace's own steps", () => {
    const html = view(TRACE);
    expect(html).not.toContain('data-reached="false"');
  });

  it("marks the stages a stopped loop never entered", () => {
    const stopped: ControllerTrace = {
      ...TRACE,
      stop_reason: "NO_ELIGIBLE_ITEM",
      steps: TRACE.steps.slice(0, 3),
      escalations: [],
      awaiting_human_review: false,
      plan: null,
    };
    const html = view(stopped);
    // The chain still lists all six — a reviewer must see what did not happen.
    expect(html).toContain("Escalated to human review");
    expect(html).toContain('data-reached="false"');
  });
});

/**
 * F-10 — the state strip and the two badges beside the safety workflow.
 *
 * The panel's smallest inline text was `9px`, which is legible on a laptop at
 * arm's length and not on a projector at the back of a room. Four values were
 * involved — the state-machine strip's node labels, the bounded-result badge in
 * the outcome banner, the telemetry group headings and the counter labels —
 * and each is a label a reviewer has to read to follow what the controller did.
 *
 * They are raised to `11px`, which is already this file's floor for its other
 * small text. This is a typographic minimum and nothing else: no figure, label
 * or layout rule moves with it, and the strip keeps scrolling horizontally at
 * narrow widths rather than reflowing.
 */
describe("F-10: the panel's smallest labels are legible at a distance", () => {
  const html = view(TRACE);

  it("renders no 9px text anywhere on the panel", () => {
    expect(html).not.toContain("font-size:9px");
  });

  it("raises every node label in the state strip, including the terminal one", () => {
    // Each strip node renders `<p class="font-label-caps" style="color:…;
    // font-size:…;margin-bottom:0">Label</p>`, so the label and its size are
    // asserted together rather than the size being asserted anywhere on
    // the page.
    const labels = [...html.matchAll(
      /class="font-label-caps" style="color:[^"]*?;font-size:(\d+)px;margin-bottom:0">([^<]+)</g,
    )];
    expect(labels.length).toBeGreaterThan(0);
    for (const [, size, label] of labels) expect(size, label).toBe("11");
    // The strip runs from the first reachable state to the terminal one.
    expect(labels.map(([, , label]) => label)).toContain("Init");
    expect(labels.map(([, , label]) => label)).toContain("Escalated");
  });

  it("raises the bounded-result badge and the telemetry labels too", () => {
    const exhausted: ControllerTrace = {
      ...TRACE,
      stop_reason: "BUDGET_EXHAUSTED",
      telemetry: { ...TRACE.telemetry, stop_reason: "BUDGET_EXHAUSTED" },
    };
    const partial = view(exhausted);
    expect(partial).toContain("Bounded partial result");
    expect(partial).not.toContain("font-size:9px");
    // The telemetry group headings and the counter labels, both behind the
    // disclosure and both previously 9px.
    expect(partial).toContain('style="margin-bottom:6px;font-size:11px"');
    expect(partial).toContain('style="font-size:11px;margin-bottom:2px"');
  });

  it("keeps the strip scrolling rather than reflowing at narrow widths", () => {
    // `.scroll-x` is the overflow container and `min-width:620px` is the
    // strip's own floor; raising the label size must not have removed either.
    expect(html).toContain('class="scroll-x"');
    expect(html).toContain("min-width:620px");
  });

  it("leaves the 10px identifier chips as they were", () => {
    // F-10 is four values, not a typography rewrite: the monospace id chips
    // are a different class of text and keep their size.
    expect(html).toContain("font-size:10px");
  });
});

describe("a budget-exhausted run is reported as partial, never as a completed handoff", () => {
  const exhausted: ControllerTrace = {
    ...TRACE,
    stop_reason: "BUDGET_EXHAUSTED",
    // The loop recorded a real escalation and then stopped on its own bound
    // without ever entering AWAIT_HUMAN.
    steps: TRACE.steps.slice(0, 6),
    awaiting_human_review: false,
    plan: { ids: ["dec_synthetic", "dec_other"], eligible: [], ineligible_count: 2, covers_residual: false, already_under_threshold: false },
  };
  const html = view(exhausted);

  it("names the bound as a bounded partial result", () => {
    expect(html).toContain("Bounded partial result");
    expect(html).toContain("The step bound was reached before the closing set was finished");
  });

  it("does not head the escalations as awaiting human review", () => {
    expect(html).not.toContain("Awaiting human review");
    expect(html).toContain("Escalated — the loop stopped before the handoff");
  });

  it("does not light the human-review stage of the chain", () => {
    const chain = html.slice(html.indexOf("Workflow trace"), html.indexOf("What this run did"));
    const humanNode = chain.slice(chain.lastIndexOf("<span class=\"chain-node\"", chain.indexOf("Escalated to human review")));
    expect(humanNode).toContain('data-reached="false"');
  });
});

// ---------------------------------------------------------------------------
// 4. The queue — three populations, one of them derived from another
// ---------------------------------------------------------------------------

describe("the queue distinguishes the decision from the rows it produced", () => {
  const html = page(<InvestigationQueue />, runContext({ exceptions: EXCEPTIONS }));

  it("states the cause, the consequence and the record, in that order", () => {
    const positions = [
      html.indexOf("abstention decision"),
      html.indexOf("affected observations, listed below"),
      html.indexOf("Ambiguity Certificate"),
    ];
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("names the exception rows as their own, independent population", () => {
    expect(html).toContain("independent exception observations");
    expect(html).toContain("each is its own decision");
    expect(html).toContain("none carries a certificate");
  });

  it("uses the run's own counts, not counts derived on this page", () => {
    // The decision and certificate counts are `POST /runs`'s; the two
    // observation counts are the queue's own rows. Read from the fixture
    // rather than written out, so a fixture change cannot leave this
    // asserting a number the page is no longer given.
    const abstained = EXCEPTIONS.items.filter((i) => i.state === "ABSTAINED").length;
    const exceptions = EXCEPTIONS.items.filter((i) => i.state === "EXCEPTION").length;
    expect(RUN.summary.abstentions).toBe(1);
    expect(RUN.summary.certificates).toBe(1);
    expect(abstained).toBeGreaterThan(RUN.summary.abstentions);

    const strip = html.slice(html.indexOf("What is on this queue"), html.indexOf("Queued Observations"));
    expect(strip).toContain(`>${String(abstained)}<`);
    expect(strip).toContain(`>${String(exceptions)}<`);
    // The decision count and the row count are both on screen and are
    // different numbers — which is the whole point of the strip.
    expect(strip).toContain(`>${String(RUN.summary.abstentions)}<`);
  });
});

// ---------------------------------------------------------------------------
// 5. Evidence Trail — the causal chain, and the accounting consequence
// ---------------------------------------------------------------------------

describe("the Evidence Trail leads with why ASSAY abstained", () => {
  const cert = DECISION_DETAIL.decision.certificate;
  const html = renderToStaticMarkup(
    <DecisionVerdict decision={DECISION_DETAIL.decision} cert={cert} />,
  );

  it("has a certificate to reason from", () => {
    expect(cert).not.toBeNull();
  });

  it("states the verdict and the terminal reason as the record gives them", () => {
    expect(html).toContain("Why ASSAY abstained");
    expect(html).toContain("ABSTAINED");
    expect(html).toContain(cert?.reason ?? "");
  });

  it("walks the chain: two candidates, shared constraints, gap against tolerance", () => {
    expect(html).toContain("Two admissible allocation candidates");
    expect(html).toContain(`Both satisfy all ${String(cert?.shared_hard_constraints.length ?? 0)} shared hard constraints`);
    expect(html).toContain("Evidence gap");
    expect(html).toContain(`${String(cert?.evidence_score_gap_bps ?? -1)} bps`);
    expect(html).toContain("Tolerance ε");
    expect(html).toContain(`${String(cert?.epsilon_bps ?? -1)} bps`);
  });

  it("ends on the conclusion, in words", () => {
    expect(html).toContain("Therefore ASSAY abstained");
  });

  it("says what happens to the money while it is unresolved", () => {
    expect(html).toContain("Unresolved value stays in Suspense");
  });

  it("uses the other wording for an exception, and never claims an abstention", () => {
    const exception = renderToStaticMarkup(
      <DecisionVerdict
        decision={{ ...DECISION_DETAIL.decision, state: "EXCEPTION", certificate: null, exception_class: "E03_BANK_ONLY" }}
        cert={null}
      />,
    );
    expect(exception).toContain("Why this is an exception");
    expect(exception).toContain("E03_BANK_ONLY");
    expect(exception).not.toContain("Therefore ASSAY abstained");
  });
});

describe("the ledger section is named as the accounting consequence, not a log line", () => {
  it("heads it that way", () => {
    expect(LEDGER_EVENT_HEADING).toContain("Accounting consequence");
    expect(LEDGER_EVENT_HEADING).not.toContain("Log");
  });
});

// ---------------------------------------------------------------------------
// 6. The certificate — four questions, answered from the record
// ---------------------------------------------------------------------------

describe("the certificate answers the four questions a reviewer arrives with", () => {
  const html = renderToStaticMarkup(
    <CertificateStory
      reason="EVIDENCE_TIE"
      candidateCount={2}
      constraintCount={8}
      gapBps={0}
      epsilonBps={1500}
      valuePaise={10_000_000}
      periodStatus="OPEN"
      trialBalanceOk
      suspenseBalancePaise={10_000_000}
    />,
  );

  it("says what happened", () => {
    expect(html).toContain("What happened?");
    expect(html).toContain("2 valid allocation hypotheses remain");
  });

  it("says why ASSAY stopped, with the terminal reason", () => {
    expect(html).toContain("Why did ASSAY stop?");
    expect(html).toContain("the evidence does not distinguish them sufficiently");
    expect(html).toContain("EVIDENCE_TIE");
  });

  it("says what evidence proves it", () => {
    expect(html).toContain("What evidence proves that?");
    expect(html).toContain("all 8 shared hard constraints");
    expect(html).toContain("0 bps against a tolerance ε of 1500 bps");
  });

  it("says what happens financially, in the ledger's own terms", () => {
    expect(html).toContain("What happens financially?");
    expect(html).toContain("₹1,00,000 remains unresolved and is held in Suspense");
    expect(html).toContain("The ledger remains balanced.");
    expect(html).toContain("The period remains OPEN.");
    expect(html).toContain("No value is written off, suppressed or guessed.");
  });

  it("reports an unbalanced ledger as a finding rather than reassurance", () => {
    const broken = renderToStaticMarkup(
      <CertificateStory
        reason="EVIDENCE_TIE" candidateCount={2} constraintCount={8} gapBps={0} epsilonBps={1500}
        valuePaise={1} periodStatus="BLOCKED" trialBalanceOk={false} suspenseBalancePaise={1}
      />,
    );
    expect(broken).toContain("reports the ledger NOT balanced");
    expect(broken).not.toContain("The ledger remains balanced.");
    expect(broken).toContain("The period remains BLOCKED.");
  });

  it("claims nothing about a close report it was not given", () => {
    const partial = renderToStaticMarkup(
      <CertificateStory
        reason="EVIDENCE_TIE" candidateCount={2} constraintCount={8} gapBps={0} epsilonBps={1500}
        valuePaise={1} periodStatus={null} trialBalanceOk={null} suspenseBalancePaise={null}
      />,
    );
    expect(partial).toContain("is not loaded on this page");
    expect(partial).not.toContain("The ledger remains balanced.");
  });

  // F-03 — what the certificate beside it is, and is not, evidence of.
  it("bounds what the benchmark measured, beside the abstention it shows", () => {
    // V35: `truly_ambiguous`, `abstentions` and `probes_spent` are 0 on all 50
    // scored units, so the sealed corpus posed the question this certificate
    // answers exactly zero times. The record on screen is a demonstration of
    // the mechanism and the benchmark reports no abstention rate at all.
    expect(html).toContain("Benchmark boundary");
    expect(html).toContain("zero truly ambiguous targets");
    expect(html).toContain("demonstrated here rather than quantitatively measured");
  });

  it("states that boundary once, and does not turn into a disclaimer", () => {
    expect(CERTIFICATE_BENCHMARK_BOUNDARY.length).toBeLessThan(260);
    expect(html.split("Benchmark boundary").length - 1).toBe(1);
  });

  it("leaves the certificate's own financial and evidence answers untouched", () => {
    // The boundary is about the benchmark's coverage of abstention, never
    // about this record: every field the four answers render is still stated.
    expect(html).toContain("2 valid allocation hypotheses remain");
    expect(html).toContain("all 8 shared hard constraints");
    expect(html).toContain("₹1,00,000 remains unresolved and is held in Suspense");
    expect(html).toContain("No value is written off, suppressed or guessed.");
  });
});

// ---------------------------------------------------------------------------
// 7. Audit Logs — the verdict, and a failure nobody can miss
// ---------------------------------------------------------------------------

const VERIFIED: LedgerVerification = {
  run_id: "run_synthetic",
  chain_ok: true,
  recomputed_root_hash: "1".repeat(64),
  stored_root_hash: "1".repeat(64),
  root_matches: true,
  trial_balance_ok: true,
  total_dr_paise: 500,
  total_cr_paise: 500,
  event_count: 9,
  checks: [
    { name: "genesis_to_root", passed: true },
    { name: "trial_balance", passed: true },
    { name: "suspense_identity", passed: true },
  ],
};

describe("Audit Logs makes the verdict the first thing on the page", () => {
  it("states a pass at display weight, not as a caption", () => {
    const html = renderToStaticMarkup(
      <VerificationResult verification={VERIFIED} onEvidenceClick={() => undefined} />,
    );
    expect(html).toContain("Chain verified");
    expect(html).toMatch(/class="font-display-metric"[^>]*>Chain verified</);
  });

  it("names the failing check inside the verdict, so it cannot be scrolled past", () => {
    const broken: LedgerVerification = {
      ...VERIFIED,
      chain_ok: false,
      recomputed_root_hash: "2".repeat(64),
      root_matches: false,
      checks: [
        { name: "genesis_to_root", passed: false },
        { name: "trial_balance", passed: true },
        { name: "suspense_identity", passed: true },
      ],
    };
    const html = renderToStaticMarkup(
      <VerificationResult verification={broken} onEvidenceClick={() => undefined} />,
    );
    const verdict = html.slice(0, html.indexOf("Chain integrity"));
    expect(verdict).toContain("Verification failed");
    expect(verdict).toContain("genesis_to_root");
    expect(verdict).toContain("failed");
    // The check that passed is not named in the verdict — only failures are.
    expect(verdict).not.toContain("suspense_identity");
  });
});

// ---------------------------------------------------------------------------
// 8. No authority leaks in either direction
// ---------------------------------------------------------------------------

describe("no surface lets the controller or the model read as the decider", () => {
  const command = page(<CommandCenter />, runContext({ close: CLOSE_500 }));
  const controller = view(TRACE);

  it("keeps the controller's own copy free of any claim to decide", () => {
    expect(controller).toContain("The controller may not decide them");
    expect(controller).toContain("No — by construction");
    expect(controller).not.toContain("the controller decided");
  });

  it("never presents an escalation as a financial write", () => {
    expect(controller).toContain("No financial write was performed.");
    expect(controller).not.toContain(">Yes<");
  });

  it("keeps ASSAY named as the only financial authority on the Command Center", () => {
    expect(command).toContain("ASSAY — deterministic financial authority");
    expect(command).toContain("Controller — bounded orchestration");
    expect(command).toContain("Explanation model — explanation only");
  });
});
