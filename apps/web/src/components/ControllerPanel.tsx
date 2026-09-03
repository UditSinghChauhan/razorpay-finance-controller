import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatCount, formatPaise } from "../lib/format.js";
import {
  useController,
  type ControllerStep,
  type ControllerTelemetry,
  type ControllerTrace,
  type TelemetryGroup,
} from "../hooks/useAssayApi.js";

/**
 * The close controller panel &mdash; `@assay/controller`'s trace, on the
 * Command Center.
 *
 * **Subordinate to the reconciliation pipeline above it, the same way the AI
 * explanation panel is subordinate to the certificate.** This is orchestration
 * over a run the engine already sealed: it reads the close gate, the
 * exception queue and one decision's evidence, and in this phase performs
 * **no financial write** &mdash; its own trace says so
 * (`financial_write_performed`, restated on screen rather than left for a
 * reader to compute), and its terminal state is a person, not a posting.
 *
 * **Every figure here is a passthrough of `GET /api/runs/:id/controller`.**
 * Nothing is computed in this component beyond formatting; the plan, the
 * escalation and every rupee amount are `@assay/controller`'s own output.
 *
 * **{@link ControllerTraceView} is exported separately, for the reason
 * `AiExplanation.tsx`'s branches are:** *"exported so every branch is
 * directly assertable without a live API"*. It takes a `ControllerTrace` as a
 * prop and calls no hook that fetches, so a test drives every visual state
 * &mdash; escalated, halted, empty &mdash; from a trace value alone.
 * {@link ControllerPanel} is the thin stateful wrapper that owns
 * `useController` and the button.
 */

const REACHABLE_STATES = [
  "INIT",
  "OBSERVE_CLOSE",
  "TRIAGE",
  "PLAN",
  "ACT",
  "ESCALATE",
  "AWAIT_HUMAN",
] as const;

const STATE_LABEL: Record<string, string> = {
  INIT: "Init",
  OBSERVE_CLOSE: "Observe close",
  TRIAGE: "Triage",
  PLAN: "Plan",
  ACT: "Act",
  ESCALATE: "Escalate",
  AWAIT_HUMAN: "Await human",
  COMPLETE: "Complete",
  HALT: "Halt",
};

/**
 * `trace.stop_reason`, in words &mdash; the label the terminal node on the
 * state strip actually shows.
 *
 * **Why this exists.** `trace.terminal` is `"COMPLETE" | "HALT"` and says
 * only that the controller's OWN loop finished; it is not the financial
 * period's status and it does not distinguish *why* the loop stopped.
 * Rendering `STATE_LABEL.COMPLETE` ("Complete") for every non-halt outcome
 * made a period the controller escalated &mdash; still `OPEN`, nothing
 * written &mdash; look identical, at the single most prominent glance, to one
 * that closed. `stop_reason` is the field that already carries the real
 * answer (`packages/controller/src/state.ts`'s `StopReason` union); this
 * reads it rather than adding a new one.
 */
const STOP_REASON_LABEL: Record<string, string> = {
  CLOSED: "Closed",
  ESCALATED: "Escalated",
  NO_ELIGIBLE_ITEM: "No eligible item",
  NO_PROGRESS: "No progress",
  BUDGET_EXHAUSTED: "Budget exhausted",
};

/** The terminal node's label: the stop reason when `COMPLETE`, "Halted" when `HALT`. */
function terminalLabel(trace: ControllerTrace): string {
  if (trace.terminal === "HALT") return "Halted";
  const known = trace.stop_reason === null ? undefined : STOP_REASON_LABEL[trace.stop_reason];
  return known ?? trace.stop_reason ?? trace.terminal;
}

function StateNode({
  label, visited, isTerminal, terminalKind,
}: { label: string; visited: boolean; isTerminal?: boolean; terminalKind?: "ok" | "halt" }): React.ReactElement {
  const color = isTerminal
    ? terminalKind === "halt" ? "var(--color-exception)" : "var(--color-abstained)"
    : visited ? "var(--color-secondary)" : "var(--color-outline)";
  return (
    <div style={{ textAlign: "center", minWidth: 76 }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%", margin: "0 auto 6px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: visited || isTerminal === true ? color : "transparent",
        border: `2px solid ${color}`,
      }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{
          fontSize: 15, color: visited || isTerminal === true ? "#fff" : color,
        }}>
          {isTerminal === true ? (terminalKind === "halt" ? "block" : "flag") : visited ? "check" : "circle"}
        </span>
      </div>
      <p className="font-label-caps" style={{ color, fontSize: 9, marginBottom: 0 }}>{label}</p>
    </div>
  );
}

/** One row of the step log &mdash; the audit record's own unit. */
function StepRow({ step }: { step: ControllerStep }): React.ReactElement {
  return (
    <tr>
      <td className="cell-id">{step.step_no}</td>
      <td className="font-body-sm">{STATE_LABEL[step.state] ?? step.state}</td>
      <td className="cell-id">{step.rule_fired}</td>
      <td className="cell-id">{step.tool ?? "—"}</td>
      <td className="font-body-sm" style={{ maxWidth: 420 }}>{step.observation_summary}</td>
    </tr>
  );
}

/** The result summary &mdash; four stats, none computed here. */
function ResultSummary({ trace }: { trace: ControllerTrace }): React.ReactElement {
  const point = trace.residual_trajectory.at(0) ?? null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Escalated for review</p>
        <p className="font-display-metric" style={{ color: trace.escalations.length > 0 ? "var(--color-abstained)" : "var(--color-reconciled)" }}>
          {formatCount(trace.escalations.length)}
        </p>
      </div>
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Unresolved vs. threshold</p>
        <p className="font-numeric-mono">
          {point ? `${formatPaise(point.unresolved_value_paise)} / ${formatPaise(point.close_threshold_paise)}` : "—"}
        </p>
      </div>
      {/* The engine's own period status, read verbatim off the trace's last
          close-gate reading — never inferred from the controller's terminal
          state or the escalation count, which say something related but not
          this. See terminalLabel()'s docstring for why the two must not be
          conflated. */}
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Financial period</p>
        <p className="font-headline-sm">
          {point ? point.period_status : "—"}
        </p>
      </div>
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Financial write performed</p>
        <p className="font-headline-sm" style={{ color: trace.financial_write_performed ? "var(--color-exception)" : "var(--color-reconciled)" }}>
          {trace.financial_write_performed ? "Yes" : "No — observe-only phase"}
        </p>
      </div>
    </div>
  );
}

/**
 * The run, as six sentences &mdash; what a reviewer reads before anything else
 * on this panel.
 *
 * The strip above is the state machine's own vocabulary (`OBSERVE_CLOSE`,
 * `TRIAGE`, `ACT`) and a reviewer who has not read
 * `packages/controller/src/state.ts` cannot tell from it what the run actually
 * did. This is the same chain in plain language: what it looked at, what it
 * found, what it planned, what it read in full, what it refused to decide, and
 * who is holding the outcome now.
 *
 * **Reachedness is the strip's own, not a second derivation.** A stage is
 * marked reached exactly when the trace contains a step in the corresponding
 * state &mdash; the identical `visitedStates` set the nodes above are drawn
 * from &mdash; so the narrative and the strip cannot disagree about what
 * happened. The detail lines read structured fields only (`plan`,
 * `residual_trajectory`, the telemetry counters); no `observation_summary`
 * string is parsed and no figure is computed, summed or inferred here.
 */
interface NarrativeStage {
  readonly key: string;
  readonly state: string;
  readonly label: string;
  readonly detail: string;
}

function narrativeStages(trace: ControllerTrace): NarrativeStage[] {
  const point = trace.residual_trajectory.at(0) ?? null;
  const plan = trace.plan;
  const c = trace.telemetry.counters;
  const inspections = c.tool_calls_by_name["decision_evidence"] ?? 0;

  const observed = point
    ? `the close gate reports the period ${point.period_status} on ` +
      `${formatPaise(point.unresolved_value_paise)} unresolved against a close threshold of ` +
      `${formatPaise(point.close_threshold_paise)}.`
    : "the close gate was never read; the loop stopped before it could observe anything.";

  // Whether the queue was read is a tool-call fact; the two counts beside it
  // are the PLAN's split of it. When the loop read the queue but stopped
  // before planning, both counters are legitimately zero — reporting them as
  // "0 eligible" there would state a finding the run never made.
  const queueReads = c.tool_calls_by_name["exception_queue"] ?? 0;
  let triaged: string;
  if (queueReads === 0) {
    triaged = "the exception queue was never read.";
  } else if (plan === null) {
    triaged = "the exception queue was read, but the loop stopped before the plan that ranks it was formed.";
  } else {
    triaged =
      `the exception queue was read and value-ranked: ${formatCount(c.eligible_items)} item(s) ` +
      `whose clearing could move the residual, ${formatCount(c.ineligible_items)} open with no ` +
      `Suspense item and so outside the close arithmetic.`;
  }

  let planned: string;
  if (plan === null) {
    planned = "no plan was formed.";
  } else if (plan.already_under_threshold) {
    planned = "the residual was already under the close threshold; no closing set was needed.";
  } else if (plan.ids.length === 0) {
    planned = "nothing on the queue was eligible, so no closing set exists to work.";
  } else {
    planned =
      `a closing set of ${formatCount(plan.ids.length)} was chosen \u2014 ` +
      (plan.covers_residual
        ? "clearing it would bring the residual under the close threshold."
        : "clearing every item on it would still leave the residual above the threshold.");
  }

  const inspected =
    inspections === 0
      ? "no decision's evidence was opened."
      : `${formatCount(inspections)} decision(s) were read in full \u2014 the Ambiguity ` +
        `Certificate, the candidates it left open, and the ledger event behind them.`;

  let escalated: string;
  if (trace.escalations.length > 0) {
    escalated =
      `${formatCount(trace.escalations.length)} item(s) were routed to a person: ASSAY abstained ` +
      `and the controller has no authority to choose between the allocations it left open.`;
  } else if (trace.stop_reason === "CLOSED") {
    escalated = "nothing needed escalating \u2014 the period was already within its close threshold.";
  } else if (trace.stop_reason === "NO_ELIGIBLE_ITEM") {
    escalated = "nothing was eligible to escalate.";
  } else {
    escalated = "nothing was escalated.";
  }

  const review = trace.awaiting_human_review
    ? `${formatCount(trace.escalations.length)} item(s) are waiting on a person. No financial ` +
      `write is available in this phase: the controller's terminal state is a human, not a posting.`
    : "no handoff was made. Nothing was written either way \u2014 this phase performs no " +
      "financial write on any path.";

  return [
    { key: "observed", state: "OBSERVE_CLOSE", label: "Observed the close gate", detail: observed },
    { key: "triaged", state: "TRIAGE", label: "Triaged the queue", detail: triaged },
    { key: "planned", state: "PLAN", label: "Planned the closing set", detail: planned },
    { key: "inspected", state: "ACT", label: "Inspected the evidence", detail: inspected },
    { key: "escalated", state: "ESCALATE", label: "Escalated what it may not decide", detail: escalated },
    { key: "review", state: "AWAIT_HUMAN", label: "Handed to human review", detail: review },
  ];
}

/**
 * Renders {@link narrativeStages}.
 *
 * A stage the run did not reach is shown greyed and struck through rather than
 * hidden: a reviewer needs to see that the loop stopped at triage, not be left
 * to infer it from an absence. The label and its separator are one string so
 * the markup carries no element boundary a substring assertion could catch by
 * accident.
 */
function RunNarrative({ trace }: { trace: ControllerTrace }): React.ReactElement {
  const visited = new Set(trace.steps.map((s) => s.state));
  const stages = narrativeStages(trace);
  return (
    <div className="card" style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
        What this run did
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {stages.map((stage, i) => {
          const reached = visited.has(stage.state);
          return (
            <li
              key={stage.key}
              style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: i === stages.length - 1 ? 0 : 6 }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  fontSize: 14, lineHeight: "18px", flexShrink: 0,
                  color: reached ? "var(--color-secondary)" : "var(--color-outline)",
                }}
              >
                {reached ? "check_circle" : "radio_button_unchecked"}
              </span>
              <p
                className="font-body-sm"
                style={{ marginBottom: 0, lineHeight: 1.6, opacity: reached ? 1 : 0.55 }}
              >
                <span className="font-label-caps" style={{ color: reached ? "var(--color-secondary)" : "var(--color-outline)" }}>
                  {`${stage.label} — `}
                </span>
                <span className="text-muted">{stage.detail}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The five questions the runtime checks answer, in the order they are shown. */
const TELEMETRY_GROUP_LABEL: Record<string, string> = {
  terminal: "Terminal correctness",
  policy: "Policy compliance",
  containment: "Containment — no financial write",
  grounding: "Evidence grounding & reproducibility",
  escalation: "Escalation correctness",
};

const TELEMETRY_GROUP_ORDER = [
  "terminal",
  "policy",
  "containment",
  "grounding",
  "escalation",
] as const;

/**
 * The runtime telemetry block &mdash; what makes "it ran a bounded agentic
 * workflow" checkable rather than asserted.
 *
 * Every row is a property `@assay/controller` derived from the trace in the
 * same response, so a reviewer who distrusts the summary can expand the step
 * log beside it and recompute. The `EXPLORATORY` label is rendered, not
 * implied: `DECISION_BRIEF.md §L.4` requires it of any metric outside
 * `PREREGISTRATION.md §8`, and none of these is on that list &mdash; they are
 * properties of one execution, not scores, and they are not comparable to a
 * benchmark figure.
 */
function TelemetryBlock({ telemetry }: { telemetry: ControllerTelemetry }): React.ReactElement {
  const c = telemetry.counters;
  const ok = telemetry.all_passed;
  return (
    <div style={{ marginBottom: "var(--space-lg)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", flexWrap: "wrap" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 0 }}>Runtime checks</p>
        <span className="badge badge-open" style={{ fontSize: 9 }}>{telemetry.scope}</span>
        <span
          className="font-body-sm"
          style={{ color: ok ? "var(--color-reconciled)" : "var(--color-exception)", fontWeight: 600 }}
        >
          {formatCount(telemetry.checks_passed)} / {formatCount(telemetry.checks_total)} passed
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-md)" }}>
        {TELEMETRY_GROUP_ORDER.map((group) => {
          const rows = telemetry.checks.filter((k) => k.group === (group as TelemetryGroup));
          if (rows.length === 0) return null;
          return (
            <div key={group} className="card" style={{ padding: "var(--space-md)" }}>
              <p className="font-label-caps text-muted" style={{ marginBottom: 6, fontSize: 9 }}>
                {TELEMETRY_GROUP_LABEL[group] ?? group}
              </p>
              {rows.map((k) => (
                <div key={k.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 4 }}>
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{
                      fontSize: 13, lineHeight: "16px", flexShrink: 0,
                      color: k.passed ? "var(--color-reconciled)" : "var(--color-exception)",
                    }}
                  >
                    {k.passed ? "check_circle" : "cancel"}
                  </span>
                  <span className="font-body-sm" style={{ fontSize: 11, lineHeight: "16px" }}>
                    <span className="cell-id" style={{ fontSize: 10 }}>{k.id}</span>
                    <span className="text-muted"> &mdash; {k.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Counters. Counts of what happened in this one execution — not rates,
          not scores, and not comparable across runs or against a benchmark. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", marginTop: "var(--space-md)" }}>
        {[
          ["steps", `${formatCount(c.steps)} / ${formatCount(c.step_budget)} budget`],
          ["tool calls", formatCount(c.tool_calls)],
          ["writes attempted", formatCount(c.writes_attempted)],
          ["writes applied", formatCount(c.writes_applied)],
          ["ledger events caused", formatCount(c.caused_events)],
          ["model calls", formatCount(c.model_calls)],
          ["escalations", formatCount(c.escalations)],
          ["eligible / ineligible", `${formatCount(c.eligible_items)} / ${formatCount(c.ineligible_items)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="font-label-caps text-muted" style={{ fontSize: 9, marginBottom: 2 }}>{label}</p>
            <p className="font-numeric-mono" style={{ fontSize: 12 }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", marginTop: "var(--space-sm)" }}>
        {Object.entries(c.tool_calls_by_name).map(([name, n]) => (
          <span key={name} className="cell-id" style={{ fontSize: 10 }}>
            {name} &times;{formatCount(n)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Why one item reached a person, composed from the escalation record's own
 * fields.
 *
 * A reviewer should not have to know what `AMBIGUOUS_CERTIFICATE` means, nor
 * hold `\u03b5` and `\u03c4` in their head, to see the reasoning: ASSAY found two
 * allocations it could not separate on the evidence, the gap between them sat
 * inside the tolerance, the amount at stake was above the materiality floor,
 * and the controller has no authority to pick one. Every quantity below is the
 * certificate's, formatted; none is computed here.
 */
function escalationWhy(e: ControllerTrace["escalations"][number]): string {
  if (e.reason !== "AMBIGUOUS_CERTIFICATE") {
    return (
      "ASSAY opened a Suspense item here and no deterministic rule can clear it: " +
      "the correct posting is the thing that is not known. A person decides."
    );
  }
  const gap = e.evidence_score_gap_bps;
  const eps = e.epsilon_bps;
  const parts: string[] = [];
  parts.push(
    `ASSAY abstained (${e.certificate_reason ?? "certificate"}): two allocations satisfy every ` +
      `hard constraint and the evidence does not separate them`,
  );
  if (gap !== null && eps !== null) {
    parts.push(`they differ by ${String(gap)} bps, inside the \u03b5 tolerance of ${String(eps)} bps`);
  }
  if (e.materiality_paise !== null && e.tau_paise !== null) {
    parts.push(
      `the amount at stake (${formatPaise(e.materiality_paise)}) is above the materiality floor ` +
        `\u03c4 of ${formatPaise(e.tau_paise)}, so it is not too small to matter`,
    );
  }
  parts.push(
    e.probes_attempted.length === 0
      ? "no admissible probe could break the tie"
      : `${String(e.probes_attempted.length)} probe(s) were tried and none broke the tie`,
  );
  return `${parts.join("; ")}. The controller may not choose between them, so it escalated.`;
}

/**
 * Renders one `ControllerTrace` in full: state strip, result summary,
 * escalation cards, halt notice and the (collapsible) step log.
 *
 * Pure and hook-light &mdash; `useState` for the step-log toggle only, no
 * data fetch. `onReviewClick` is injected rather than calling `useNavigate`
 * directly, so this component has no router dependency either and a test can
 * render it with `renderToStaticMarkup` exactly as `AiExplanationResult` is.
 */
export function ControllerTraceView({
  trace, onReviewClick,
}: { trace: ControllerTrace; onReviewClick: () => void }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const visitedStates = new Set(trace.steps.map((s) => s.state));

  return (
    <>
      {/* State strip */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: "var(--space-lg)", overflowX: "auto" }}>
        {REACHABLE_STATES.map((s, i) => (
          <Fragment key={s}>
            <StateNode label={STATE_LABEL[s] ?? s} visited={visitedStates.has(s)} />
            {i < REACHABLE_STATES.length - 1 && (
              <div style={{ height: 2, width: 24, background: "var(--color-outline-variant)", marginTop: 15 }} />
            )}
          </Fragment>
        ))}
        <div style={{ height: 2, width: 24, background: "var(--color-outline-variant)", marginTop: 15 }} />
        <StateNode
          label={terminalLabel(trace)}
          visited={false}
          isTerminal
          terminalKind={trace.terminal === "HALT" ? "halt" : "ok"}
        />
      </div>

      <RunNarrative trace={trace} />

      <ResultSummary trace={trace} />

      <TelemetryBlock telemetry={trace.telemetry} />

      {/* Escalations */}
      {trace.escalations.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
            Awaiting human review
          </p>
          {trace.escalations.map((e) => (
            <div
              key={e.decision_id}
              className="card"
              style={{
                padding: "var(--space-md)", marginBottom: "var(--space-sm)",
                borderLeft: "3px solid var(--color-abstained)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-sm)" }}>
                <div>
                  <span className="cell-id">{e.entity_id}</span>
                  <span className="font-body-sm text-muted" style={{ marginLeft: 8 }}>
                    {e.reason === "AMBIGUOUS_CERTIFICATE"
                      ? `${e.certificate_reason ?? "certificate"} — gap ${String(e.evidence_score_gap_bps ?? 0)} bps against ε ${String(e.epsilon_bps ?? 0)} bps`
                      : "no deterministic warrant"}
                  </span>
                </div>
                <span className="font-numeric-mono">{formatPaise(e.value_paise)}</span>
              </div>
              {/* Why this reached a person, as a chain rather than a code:
                  what ASSAY decided, on what evidence, and why the controller
                  is not permitted to resolve it. Every figure is the
                  certificate's own. */}
              <p className="font-body-sm text-muted" style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6 }}>
                {escalationWhy(e)}
              </p>
              {e.closes_alone && (
                <p className="font-body-sm text-muted" style={{ marginTop: 4, fontSize: 11 }}>
                  Clearing this item alone would bring the residual under the close threshold.
                </p>
              )}
              <button
                className="btn btn-ghost"
                style={{ marginTop: "var(--space-sm)", padding: 0, fontSize: 12 }}
                onClick={onReviewClick}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>open_in_new</span>
                Review in Investigation Queue
              </button>
            </div>
          ))}
        </div>
      )}

      {trace.terminal === "HALT" && (
        <p className="font-body-sm" style={{ color: "var(--color-exception)", marginBottom: "var(--space-lg)" }}>
          Halted: {trace.halt_reason}. No further step was taken; the deterministic decision
          and ledger are unaffected.
        </p>
      )}

      {/* Step log */}
      <button
        className="btn btn-ghost"
        style={{ padding: 0, marginBottom: "var(--space-sm)", fontSize: 12 }}
        onClick={() => { setExpanded((v) => !v); }}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
          {expanded ? "expand_less" : "expand_more"}
        </span>
        {expanded ? "Hide" : "Show"} step log ({formatCount(trace.steps.length)} steps)
      </button>

      {expanded && (
        <div style={{ overflowX: "auto", marginBottom: "var(--space-sm)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>State</th>
                <th>Rule</th>
                <th>Tool</th>
                <th>Observation</th>
              </tr>
            </thead>
            <tbody>
              {trace.steps.map((step) => (
                <StepRow key={step.step_no} step={step} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontSize: 11 }}>
        trace {trace.trace_id.slice(0, 12)}&hellip; &middot; re-running produces the same
        trace over an unchanged run
      </p>
    </>
  );
}

/** The panel, wired to one run: owns the hook, the button, and the idle/loading/error states. */
export function ControllerPanel({ runId }: { runId: string }): React.ReactElement {
  const { start, state } = useController();
  const navigate = useNavigate();
  const trace = state.data;

  return (
    <div className="card" style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-md)" }}>
        <div>
          <p className="font-label-caps text-muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, color: "var(--color-secondary)" }}>route</span>
            Close controller
          </p>
          <p className="font-body-sm text-muted" style={{ marginTop: 2 }}>
            Bounded orchestration over the sealed run &mdash; observes, plans, escalates. No
            authority over the deterministic decision above.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => void start(runId)}
          disabled={state.loading}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
            {state.loading ? "hourglass_top" : "play_circle"}
          </span>
          {state.loading ? "Running…" : trace ? "Run again" : "Run close loop"}
        </button>
      </div>

      {state.error !== null && (
        <p className="font-body-sm" style={{ color: "var(--color-exception)", marginBottom: "var(--space-md)" }}>
          {state.error}
        </p>
      )}

      {trace === null && !state.loading && state.error === null && (
        <p className="font-body-sm text-muted">
          Not yet run. The controller reads the close gate, the exception queue and one
          decision&apos;s evidence; it writes nothing in this phase.
        </p>
      )}

      {trace !== null && (
        <ControllerTraceView trace={trace} onReviewClick={() => void navigate("/investigation-queue")} />
      )}
    </div>
  );
}
