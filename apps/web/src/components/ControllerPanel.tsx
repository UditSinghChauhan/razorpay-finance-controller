import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatCount, formatPaise } from "../lib/format.js";
import {
  useController,
  type ControllerStep,
  type ControllerTrace,
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

      <ResultSummary trace={trace} />

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
