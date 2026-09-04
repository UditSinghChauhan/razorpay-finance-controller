import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatCount, formatPaise } from "../lib/format.js";
import {
  periodStatusMeaning,
  probeEscalationClause,
  RUNTIME_ASSERTIONS_BASIS,
  RUNTIME_ASSERTIONS_LABEL,
  stepBudgetBasis,
  stepBudgetCounterBasis,
  stepBudgetLabel,
} from "../lib/copy.js";
import {
  useController,
  type ControllerStep,
  type ControllerTelemetry,
  type ControllerTrace,
  type TelemetryCheck,
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

/**
 * How the outcome should read at a glance: a period that closed, a period
 * still carrying unresolved value, or a guard that stopped the loop.
 *
 * Three tones rather than two, because `terminal` alone collapses the first
 * two into "COMPLETE" and the whole point of the banner is that a reviewer
 * should not have to read a field name to tell them apart. The tone is a
 * function of `stop_reason` and `terminal` only — the two fields the trace
 * itself carries — and never of the escalation count or the period status,
 * which say related but different things.
 */
function outcomeTone(trace: ControllerTrace): "closed" | "open" | "halt" {
  if (trace.terminal === "HALT") return "halt";
  return trace.stop_reason === "CLOSED" ? "closed" : "open";
}

const OUTCOME_COLOR: Record<string, string> = {
  closed: "var(--color-reconciled)",
  open: "var(--color-abstained)",
  halt: "var(--color-exception)",
};

const OUTCOME_ICON: Record<string, string> = {
  closed: "task_alt",
  open: "pending_actions",
  halt: "block",
};

/**
 * Why the loop stopped, in one clause &mdash; the headline over
 * {@link outcomeSummary}'s paragraph, and the line the Command Center's status
 * ribbon shows beside the outcome word.
 *
 * Keyed on `stop_reason` and `terminal` only, like every other reading of the
 * outcome on this panel, so the ribbon at the top of the page and the banner
 * at the top of the panel cannot disagree about what happened. It states no
 * figure: the counts are the banner's, one line below.
 */
function stopHeadline(trace: ControllerTrace): string {
  if (trace.terminal === "HALT") return "A guard stopped the loop before it could continue.";
  switch (trace.stop_reason) {
    case "CLOSED":
      return "The period was already inside its close threshold, so there was nothing to work.";
    case "ESCALATED":
      return "It reached items it may not decide, and handed them to human review.";
    case "BUDGET_EXHAUSTED":
      return "The step bound was reached before the closing set was finished — a bounded partial result.";
    case "NO_ELIGIBLE_ITEM":
      return "Nothing on the queue opens a Suspense item, so no closing set exists to work.";
    case "NO_PROGRESS":
      return "No remaining step could move the residual any further.";
    default:
      return "The loop reached a terminal state.";
  }
}

/**
 * The outcome as the rest of the app needs to read it.
 *
 * Exported so `CommandCenter`'s status ribbon can report the controller's
 * result at the top of the page without deriving a second opinion of it: the
 * word, the reason code, the tone colour and the one-clause why are all the
 * same functions the banner below uses. A page that computed its own summary
 * of a trace would be a second place the outcome could be decided.
 */
export function controllerOutcome(trace: ControllerTrace): {
  label: string;
  reason: string | null;
  color: string;
  headline: string;
} {
  const tone = outcomeTone(trace);
  return {
    label: terminalLabel(trace),
    reason: trace.terminal === "HALT" ? trace.halt_reason : trace.stop_reason,
    color: OUTCOME_COLOR[tone] ?? "var(--color-outline)",
    headline: stopHeadline(trace),
  };
}

/**
 * The outcome in one paragraph — the first thing a reviewer reads, and the
 * only place on the panel that answers "so what happened?" without requiring
 * the state strip, the narrative or the telemetry to be read first.
 *
 * **Every branch is keyed on `stop_reason` or `terminal`, and the write clause
 * is read off `financial_write_performed` rather than asserted.** The phase
 * performs no financial write on any path, but a sentence that said so from a
 * constant would keep saying so if that ever stopped being true; reading the
 * field means the screen cannot outlive the guarantee.
 *
 * `BUDGET_EXHAUSTED` gets its own branch and its own words. It is neither a
 * close nor a failure: the bound bit, and what the loop finished before it bit
 * is a real, partial result. Folding it into either of the other two readings
 * is the specific misreading this branch exists to prevent.
 */
function outcomeSummary(trace: ControllerTrace): string {
  const wrote = trace.financial_write_performed
    ? "A financial write is recorded on this trace."
    : "No financial write was performed.";

  if (trace.terminal === "HALT") {
    return (
      `A guard stopped the loop: ${trace.halt_reason ?? "no reason recorded"}. No further ` +
      `step was taken, and the deterministic decision and the ledger are unaffected. ${wrote}`
    );
  }

  const escalated = formatCount(trace.escalations.length);
  const planned = formatCount(trace.plan?.ids.length ?? 0);

  switch (trace.stop_reason) {
    case "CLOSED":
      return (
        `The period is inside its close threshold, so there was nothing for the controller ` +
        `to work: it escalated nothing and changed nothing. ${wrote}`
      );
    case "ESCALATED":
      return (
        `${escalated} item(s) reached a person. The controller may not decide them, and this ` +
        `phase's terminal state is a human rather than a posting, so it handed them over ` +
        `instead of resolving them. ${wrote}`
      );
    case "BUDGET_EXHAUSTED":
      return (
        `The step bound was reached before the closing set was finished. This is a bounded ` +
        `partial result \u2014 neither a close nor a failure: ${escalated} of ${planned} planned ` +
        `item(s) reached a person and the rest were left unworked. ${wrote}`
      );
    case "NO_ELIGIBLE_ITEM":
      return (
        `Nothing on the exception queue opens a Suspense item, so no closing set exists to ` +
        `work and the residual is unchanged. ${wrote}`
      );
    case "NO_PROGRESS":
      return (
        `The loop stopped because no remaining step could move the residual any further. ` +
        `${wrote}`
      );
    default:
      return (
        `The loop ended in ${trace.terminal}` +
        `${trace.stop_reason === null ? "" : ` (${trace.stop_reason})`}. ${wrote}`
      );
  }
}

/**
 * The result, above everything else on the panel.
 *
 * Decision first: the terminal outcome as a word, the trace's own reason code
 * beside it, one paragraph of plain language, and the four counts that bound
 * what the run was allowed to do. Nothing here is computed — the counts are
 * `telemetry.counters`, the reason is `stop_reason`/`halt_reason`, and the
 * outcome word is the same {@link terminalLabel} the state strip's terminal
 * node uses, so the two cannot disagree.
 */
function OutcomeBanner({ trace }: { trace: ControllerTrace }): React.ReactElement {
  const tone = outcomeTone(trace);
  const color = OUTCOME_COLOR[tone] ?? "var(--color-outline)";
  const c = trace.telemetry.counters;
  const reason = trace.terminal === "HALT" ? trace.halt_reason : trace.stop_reason;

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-md)", marginBottom: "var(--space-lg)",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color }}>
          {OUTCOME_ICON[tone] ?? "help"}
        </span>
        <span className="font-label-caps text-muted">Controller outcome</span>
        <span className="font-headline-sm" style={{ color }}>{terminalLabel(trace)}</span>
        {reason !== null && (
          <span className="cell-id" style={{ fontSize: 10 }}>reason {reason}</span>
        )}
        {trace.stop_reason === "BUDGET_EXHAUSTED" && (
          <span className="badge badge-abstained" style={{ fontSize: 11 }}>
            Bounded partial result
          </span>
        )}
      </div>
      <p className="font-body-md" style={{ fontWeight: 600, lineHeight: 1.6, marginBottom: "var(--space-sm)", maxWidth: 780 }}>
        {stopHeadline(trace)}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-lg)", alignItems: "flex-start" }}>
        {[
          ["Steps", stepBudgetLabel(c.steps, c.step_budget)],
          ["Tool calls", formatCount(c.tool_calls)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="counter-label" style={{ marginBottom: 2 }}>{label}</p>
            <p className="font-numeric-mono counter-value">{value}</p>
          </div>
        ))}
        {/* Two claims, not two counters, and the human one comes first.
            `escalations` is what a person has to work and `writes_applied` is
            what the product refused to do; both are read straight off
            `telemetry.counters` and neither is derived here. The order is the
            order of the questions a reviewer asks. */}
        <EscalationClaim count={c.escalations} awaiting={trace.awaiting_human_review} />
        {/* The safety claim is not a counter like the two beside it. It is
            the one figure on this panel that a reviewer watching a projected
            screen has to be able to read, and the one whose value being
            anything other than zero would change what this product is. It gets
            its own weight for that reason and no other — the number is
            `writes_applied` exactly as the trace reported it. */}
        <WritesAppliedClaim applied={c.writes_applied} attempted={c.writes_attempted} />
      </div>
      {/* Why `65 / 64` is a bound reached rather than a bound broken. Rendered
          only when the two differ, because on a run that finished early there
          is nothing to explain. */}
      {c.steps > c.step_budget && (
        <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", lineHeight: 1.6, maxWidth: 780 }}>
          {stepBudgetBasis(c.steps, c.step_budget)}
        </p>
      )}
    </div>
  );
}

/**
 * `writes applied — 0`, at a size that survives a projector.
 *
 * This is the product's central safety statement and it was previously a 12px
 * figure in an eight-item row, indistinguishable from `eligible / ineligible`.
 * The number is the trace's `writes_applied` and nothing here derives, clamps
 * or defaults it: if the controller ever applied a write, this renders that
 * count in the exception colour and says so, because a safety claim that cannot
 * report its own violation is decoration.
 *
 * `writes_attempted` travels beside it, because "applied 0 of 0 attempted" and
 * "applied 0 of 3 attempted" are different facts and only the second one shows
 * a refusal doing work.
 */
function WritesAppliedClaim({
  applied, attempted,
}: { applied: number; attempted: number }): React.ReactElement {
  const clean = applied === 0;
  return (
    <div className="safety-claim" data-clean={clean ? "true" : "false"}>
      <p className="safety-claim-label">Writes applied</p>
      <p className="safety-claim-value">{formatCount(applied)}</p>
      <p className="safety-claim-note">
        {clean
          ? `no ledger write on any path — ${formatCount(attempted)} attempted`
          : `${formatCount(applied)} applied of ${formatCount(attempted)} attempted`}
      </p>
    </div>
  );
}

/**
 * `escalations — 1`, at the same weight as the safety claim beside it.
 *
 * **The hierarchy this fixes.** The panel's loudest figure was `WRITES APPLIED
 * 0` — 30px, in its own bordered tile — while the number of items a PERSON now
 * has to decide sat at 15px in the counter row, indistinguishable from `tool
 * calls`. The panel therefore led with *"nothing was written"* and made the
 * only actionable fact on the screen the quiet one. Both are claims about the
 * run's outcome and both are now rendered as claims.
 *
 * **The tone is a function of the count, and the note is a function of the
 * trace.** Amber (`--color-abstained`, this app's abstention/attention tone)
 * only when something actually reached a person; a run that escalated nothing
 * renders the same tile neutral rather than warning about a zero.
 * `awaiting_human_review` is the trace's own field and it is what separates
 * *"waiting on a person"* from a budget-exhausted run whose escalations are
 * real but whose handoff never happened — the same distinction
 * {@link narrativeStages}'s review stage and the escalation heading draw.
 * Nothing here is computed: the number is `telemetry.counters.escalations`.
 */
function EscalationClaim({
  count, awaiting,
}: { count: number; awaiting: boolean }): React.ReactElement {
  const needsAction = count > 0;
  return (
    <div className="safety-claim" data-tone={needsAction ? "attention" : "none"}>
      <p className="safety-claim-label">Escalations</p>
      <p className="safety-claim-value">{formatCount(count)}</p>
      <p className="safety-claim-note">
        {!needsAction
          ? "nothing reached a person"
          : awaiting
            ? "with a person now — the controller may not decide them"
            : "recorded before the loop stopped on its own bound"}
      </p>
    </div>
  );
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
      <p className="font-label-caps" style={{ color, fontSize: 11, marginBottom: 0 }}>{label}</p>
    </div>
  );
}

/**
 * Why the loop stopped, at length &mdash; the second thing on the panel, after
 * the outcome and before the trace that produced it.
 *
 * It is {@link outcomeSummary}'s paragraph, promoted out of the banner into a
 * section of its own. The banner answers *what happened*; a reviewer's next
 * question is *why*, and burying the answer as a caption under the result made
 * it the thing people skipped.
 *
 * `BUDGET_EXHAUSTED` is the branch this section exists for. It is neither a
 * close nor a failure, and neither of the other two readings may be applied to
 * it: what the bound produced is a real, partial result, and the paragraph
 * says how much of the closing set was actually worked.
 */
function WhyItStopped({ trace }: { trace: ControllerTrace }): React.ReactElement {
  return (
    <div className="card" style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>
        Why it stopped
      </p>
      <p className="font-body-sm text-muted" style={{ lineHeight: 1.6, maxWidth: 780 }}>
        {outcomeSummary(trace)}
      </p>
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

/**
 * The two standing facts about the run that are stated nowhere else on the
 * panel.
 *
 * **It used to be four tiles and two of them were already on the screen.**
 * *"Escalated for review"* repeated the escalation count the outcome banner now
 * renders as a claim at four times the size, and *"Unresolved vs. threshold"*
 * repeated the residual the run narrative states in full a section above
 * (`the close gate reports the period OPEN on ₹… unresolved against a close
 * threshold of ₹…`) and the Command Center's status ribbon carries at the top
 * of the same page. Both are gone from here and neither figure left the screen.
 *
 * What remains is what only this block says: the engine's own period status
 * with its gloss, and the containment claim. Both are read verbatim off the
 * trace — the status off the last close-gate reading, never inferred from the
 * controller's terminal state or the escalation count (see
 * {@link terminalLabel}'s docstring for why those must not be conflated), and
 * the write verdict off `financial_write_performed`.
 */
function ResultSummary({ trace }: { trace: ControllerTrace }): React.ReactElement {
  const point = trace.residual_trajectory.at(0) ?? null;
  return (
    <div className="grid grid-2" style={{ marginBottom: "var(--space-lg)" }}>
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Financial period</p>
        <p className="font-headline-sm">
          {point ? point.period_status : "—"}
        </p>
        {/* The enum, and what it means. `OPEN` in particular read as a neutral
            status rather than as an unresolved one — the gloss is
            {@link periodStatusMeaning}'s, keyed on the status the trace
            actually carries, and it is never shown for a reading that does not
            exist. */}
        {point !== null && (
          <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
            {periodStatusMeaning(point.period_status)}
          </p>
        )}
      </div>
      {/* Containment, stated as the guarantee it is rather than as a stage the
          product has not finished. This read "No — observe-only phase", which
          invites "so it is not done yet"; the fact is stronger than that. The
          controller's tool surface is four reads (`packages/controller`'s
          `ToolRegistry`), `ControllerMemory` carries no field an authorisation
          could arrive in, and `writes_attempted`/`writes_applied` on this very
          trace are the checkable record. It is not that no write happened to
          occur — there is no write for it to attempt. */}
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Financial write performed</p>
        <p className="font-headline-sm" style={{ color: trace.financial_write_performed ? "var(--color-exception)" : "var(--color-reconciled)" }}>
          {trace.financial_write_performed ? "Yes" : "No — by construction"}
        </p>
        <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          Its tool surface is four reads. There is no write for it to attempt.
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

  // The two escalation reasons are different findings and the narrative must
  // not collapse them. `AMBIGUOUS_CERTIFICATE` means ASSAY reached two
  // allocations it could not separate and declined to choose;
  // `NO_DETERMINISTIC_WARRANT` means there was no admissible allocation to
  // choose between at all, and no rule that could clear the Suspense item it
  // opened. Counted from the records rather than assumed, because a period
  // whose residual is mostly unattributed bank credits carries almost none of
  // the first kind.
  const abstained = trace.escalations.filter((e) => e.certificate_reason !== null).length;
  const unwarranted = trace.escalations.length - abstained;

  const inspected =
    inspections === 0
      ? "no decision's evidence was opened."
      : `${formatCount(inspections)} decision(s) were read in full \u2014 the evidence behind ` +
        `each one, and the ledger event that sealed it.`;

  let escalated: string;
  if (trace.escalations.length > 0) {
    const routed = `${formatCount(trace.escalations.length)} item(s) were routed to a person`;
    const ambiguity =
      "ASSAY abstained and the controller has no authority to choose between the " +
      "allocations it left open";
    const warrant =
      "a Suspense item was opened that no deterministic rule can clear, and the correct " +
      "posting is the thing that is not known";
    if (unwarranted === 0) {
      escalated = `${routed}: ${ambiguity}.`;
    } else if (abstained === 0) {
      escalated = `${routed}: ${warrant}.`;
    } else {
      escalated =
        `${routed} \u2014 ${formatCount(abstained)} where ${ambiguity}, and ` +
        `${formatCount(unwarranted)} where ${warrant}.`;
    }
  } else if (trace.stop_reason === "CLOSED") {
    escalated = "nothing needed escalating \u2014 the period was already within its close threshold.";
  } else if (trace.stop_reason === "NO_ELIGIBLE_ITEM") {
    escalated = "nothing was eligible to escalate.";
  } else {
    escalated = "nothing was escalated.";
  }

  // The handoff is only claimed where the loop actually reached it. On a run
  // that stopped on its own step bound the escalations are real but the
  // closing set was not finished, and saying "waiting on a person" alone would
  // report a partial pass as a completed one.
  const unworked = (plan?.ids.length ?? 0) - trace.escalations.length;
  let review: string;
  if (trace.stop_reason === "BUDGET_EXHAUSTED") {
    review =
      `the step budget ran out before the closing set was finished: ` +
      `${formatCount(trace.escalations.length)} of ${formatCount(plan?.ids.length ?? 0)} planned ` +
      `item(s) reached a person and ${formatCount(Math.max(unworked, 0))} were not worked. The ` +
      `result is partial and is reported as partial. Nothing was written on any path.`;
  } else if (trace.awaiting_human_review) {
    review =
      `${formatCount(trace.escalations.length)} item(s) are waiting on a person. No financial ` +
      `write is available in this phase: the controller's terminal state is a human, not a posting.`;
  } else {
    review =
      "no handoff was made. Nothing was written either way \u2014 this phase performs no " +
      "financial write on any path.";
  }

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
      <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-sm)" }}>
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

/**
 * The six questions a reviewer asks first, each the conjunction of the
 * detailed checks that answer it.
 *
 * **Seventeen booleans is the right amount of evidence and the wrong amount of
 * first impression.** A reviewer with three minutes needs to know whether the
 * run did what it set out to do, stayed inside its policy, grounded what it
 * claimed, wrote nothing, escalated correctly, and can be reproduced. Those
 * six answers are already in the seventeen; this states them, and the
 * seventeen stay one disclosure away, unchanged and un-summarised.
 *
 * **Nothing is asserted here and no row is a new fact.** Each row is a filter
 * over `telemetry.checks` and its verdict is the conjunction of what it
 * matched — so a row cannot claim a pass the detailed checks do not support,
 * and a row that matched nothing says *"not reported"* rather than passing by
 * default. That last case is the one that matters: a summary whose empty
 * conjunction reads as a tick would report a telemetry payload that had
 * checked nothing as a clean bill of health.
 *
 * The six filters partition all seventeen ids exactly — five groups, with
 * `grounding` split because reproducibility is a distinct question from
 * whether an escalation was backed by an inspection that actually happened.
 * `apps/web/tests/controller-panel.test.tsx` asserts the partition against the
 * full id list, so a check added to `@assay/controller` without a home here
 * fails rather than disappearing from the summary.
 */
interface TelemetrySummaryRow {
  readonly key: string;
  readonly label: string;
  readonly covers: (check: TelemetryCheck) => boolean;
}

export const TELEMETRY_SUMMARY_ROWS: readonly TelemetrySummaryRow[] = Object.freeze([
  { key: "goal", label: "Goal reached", covers: (k) => k.group === "terminal" },
  { key: "policy", label: "Policy compliant", covers: (k) => k.group === "policy" },
  {
    key: "grounded",
    label: "Evidence grounded",
    covers: (k) => k.group === "grounding" && k.id !== "trace_id_recomputes",
  },
  { key: "containment", label: "No financial writes", covers: (k) => k.group === "containment" },
  { key: "escalation", label: "Escalation correct", covers: (k) => k.group === "escalation" },
  { key: "reproducible", label: "Reproducible trace", covers: (k) => k.id === "trace_id_recomputes" },
]);

function TelemetrySummary({ checks }: { checks: readonly TelemetryCheck[] }): React.ReactElement {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
        gap: "var(--space-sm)", marginBottom: "var(--space-md)",
      }}
    >
      {TELEMETRY_SUMMARY_ROWS.map((row) => {
        const matched = checks.filter((k) => row.covers(k));
        const failed = matched.filter((k) => !k.passed);
        const state = matched.length === 0 ? "absent" : failed.length === 0 ? "pass" : "fail";
        const color =
          state === "pass" ? "var(--color-reconciled)"
            : state === "fail" ? "var(--color-exception)"
              : "var(--color-outline)";
        return (
          <div key={row.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: 16, lineHeight: "18px", flexShrink: 0, color }}
            >
              {state === "pass" ? "check_circle" : state === "fail" ? "cancel" : "remove"}
            </span>
            <span>
              <span className="font-body-sm" style={{ fontWeight: 600, display: "block", lineHeight: "18px" }}>
                {row.label}
              </span>
              <span className="font-body-sm text-muted" style={{ fontSize: 10, display: "block" }}>
                {state === "absent"
                  ? "not reported"
                  : `${formatCount(matched.length - failed.length)} / ${formatCount(matched.length)} checks`}
              </span>
              {/* A failing row names the check that failed and repeats the
                  API's own explanation, so the summary never hides the thing
                  it is summarising. */}
              {failed.map((k) => (
                <span
                  key={k.id}
                  className="font-body-sm"
                  style={{ display: "block", fontSize: 10, lineHeight: 1.5, color: "var(--color-exception)" }}
                >
                  {k.id} &mdash; {k.detail}
                </span>
              ))}
            </span>
          </div>
        );
      })}
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
        <p className="font-label-caps font-label-section" style={{ marginBottom: 0 }}>{RUNTIME_ASSERTIONS_LABEL}</p>
        <span className="badge badge-open" style={{ fontSize: 10 }}>{telemetry.scope}</span>
        <span
          className="font-body-sm"
          style={{ color: ok ? "var(--color-reconciled)" : "var(--color-exception)", fontWeight: 600 }}
        >
          {formatCount(telemetry.checks_passed)} / {formatCount(telemetry.checks_total)} passed
        </span>
      </div>

      {/* What these are, before the count is read as an attestation. */}
      <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-sm)", lineHeight: 1.6, maxWidth: 780 }}>
        {RUNTIME_ASSERTIONS_BASIS}
      </p>

      {/* The six-line read, first. */}
      <TelemetrySummary checks={telemetry.checks} />

      {/* …and the whole evidence behind it, one disclosure away.

          A native <details> rather than a `useState` toggle, deliberately: the
          rows stay in the document whether or not it is open, so the summary
          above is never the only copy of a check on the page, the disclosure
          works with JavaScript disabled, and a reader searching the page finds
          a failing check without having to know to expand anything first. */}
      <details>
        <summary
          className="font-body-sm"
          style={{ cursor: "pointer", color: "var(--color-on-surface-variant)", marginBottom: "var(--space-sm)" }}
        >
          Show all {formatCount(telemetry.checks_total)} checks and the counters they were derived from
        </summary>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "var(--space-md)" }}>
        {TELEMETRY_GROUP_ORDER.map((group) => {
          const rows = telemetry.checks.filter((k) => k.group === (group as TelemetryGroup));
          if (rows.length === 0) return null;
          return (
            <div key={group} className="card" style={{ padding: "var(--space-md)" }}>
              <p className="font-label-caps text-muted" style={{ marginBottom: 6, fontSize: 11 }}>
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
          ["steps", stepBudgetLabel(c.steps, c.step_budget)],
          ["tool calls", formatCount(c.tool_calls)],
          ["writes attempted", formatCount(c.writes_attempted)],
          ["writes applied", formatCount(c.writes_applied)],
          ["ledger events caused", formatCount(c.caused_events)],
          ["model calls", formatCount(c.model_calls)],
          ["escalations", formatCount(c.escalations)],
          ["eligible / ineligible", `${formatCount(c.eligible_items)} / ${formatCount(c.ineligible_items)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="font-label-caps text-muted" style={{ fontSize: 11, marginBottom: 2 }}>{label}</p>
            <p className="font-numeric-mono" style={{ fontSize: 12 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* The `steps` counter above is `stepBudgetLabel`'s reading, not the
          trace's raw `steps` — so the raw value is named here, in the block
          that claims every figure in it is recomputable from the trace. */}
      {stepBudgetCounterBasis(c.steps, c.step_budget) !== null && (
        <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-xs)", lineHeight: 1.6, maxWidth: 780 }}>
          {stepBudgetCounterBasis(c.steps, c.step_budget)}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", marginTop: "var(--space-sm)" }}>
        {Object.entries(c.tool_calls_by_name).map(([name, n]) => (
          <span key={name} className="cell-id" style={{ fontSize: 10 }}>
            {name} &times;{formatCount(n)}
          </span>
        ))}
      </div>
      </details>
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
  parts.push(probeEscalationClause(e.probes_attempted.length));
  return `${parts.join("; ")}. The controller may not choose between them, so it escalated.`;
}

/**
 * Renders one `ControllerTrace` in full.
 *
 * **The order is the reading order and it is deliberate:**
 *
 *   1. the outcome, as a word, two counters and two claims &mdash; {@link OutcomeBanner}
 *   2. why it stopped, in a paragraph &mdash; {@link WhyItStopped}
 *   3. the workflow trace: the state machine's own strip
 *   4. the run narrative, six stages in plain language &mdash; {@link RunNarrative}
 *   5. the runtime checks, six summary lines over seventeen &mdash; {@link TelemetryBlock}
 *   6. the human-review item(s), each with the reasoning that sent it there
 *   7. the supporting evidence: the standing facts, the step log, the next steps
 *
 * A reviewer who stops after the first block still has the answer; a reviewer
 * who reads on gets progressively more of the working, and the last third is
 * what they check the first third against.
 *
 * Pure and hook-light &mdash; `useState` for the step-log toggle only, no
 * data fetch. The three callbacks are injected rather than calling
 * `useNavigate` directly, so this component has no router dependency and a
 * test can render it with `renderToStaticMarkup` exactly as
 * `AiExplanationResult` is. They are required rather than optional so a
 * next-step control cannot silently vanish from the real panel while a test
 * that supplies its own handler keeps passing.
 */
export function ControllerTraceView({
  trace, onReviewClick, onTryAnother, onVerifyLedger,
}: {
  trace: ControllerTrace;
  onReviewClick: () => void;
  /** Back to the scenario lab, to run the same controller over other evidence. */
  onTryAnother: () => void;
  /** On to `GET /runs/:id/ledger/verify` — the independent check of the chain. */
  onVerifyLedger: () => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const visitedStates = new Set(trace.steps.map((s) => s.state));

  return (
    <>
      <OutcomeBanner trace={trace} />

      <WhyItStopped trace={trace} />

      {/* Workflow trace: the state machine's own strip, and only it. The
          plain-language reading of the same sequence is the narrative directly
          below, which draws from the identical `visitedStates` set and adds the
          figures each stage produced — so this is the sequence and that is what
          happened in it, rather than the sequence three times over. */}
      <div className="card" style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
        <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-sm)" }}>
          Workflow trace
        </p>
        <div className="scroll-x" style={{ marginTop: "var(--space-sm)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 620 }}>
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
        </div>
      </div>

      <RunNarrative trace={trace} />

      <TelemetryBlock telemetry={trace.telemetry} />

      {/* Escalations */}
      {trace.escalations.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          {/* Only the run that actually reached `AWAIT_HUMAN` is waiting on a
              person. A budget-exhausted run recorded real escalations and then
              stopped on its bound, and heading those records "Awaiting human
              review" would report a partial pass as a completed handoff — the
              same distinction {@link narrativeStages}'s review stage draws.
              `awaiting_human_review` is the trace's own field for it. */}
          {/* The handoff, in the tone the palette already reserves for
              anything waiting on a person. It was a muted grey caption over a
              30px green "writes applied 0", so the panel's strongest signal
              was the thing that did NOT happen. Amber is `--color-abstained`,
              already this app's attention tone; the two headings and the
              condition that chooses between them are unchanged. */}
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-sm)",
            flexWrap: "wrap", marginBottom: "var(--space-sm)",
          }}>
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: 20, color: "var(--color-abstained)" }}
            >
              pending_actions
            </span>
            <span className="font-label-caps" style={{ color: "var(--color-abstained)" }}>
              {trace.awaiting_human_review
                ? "Awaiting human review"
                : "Escalated — the loop stopped before the handoff"}
            </span>
            <span className="badge badge-abstained" style={{ fontSize: 11 }}>
              {formatCount(trace.escalations.length)} item
              {trace.escalations.length === 1 ? "" : "s"}
            </span>
          </div>
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
                <div style={{ minWidth: 0 }}>
                  <span className="cell-id">{e.entity_id}</span>
                  <span className="font-body-sm text-muted" style={{ marginLeft: 8 }}>
                    {e.reason === "AMBIGUOUS_CERTIFICATE"
                      ? `${e.certificate_reason ?? "certificate"} — gap ${String(e.evidence_score_gap_bps ?? 0)} bps against ε ${String(e.epsilon_bps ?? 0)} bps`
                      : "no deterministic warrant"}
                  </span>
                </div>
                {/* The amount a person is being asked to decide, at the scale
                    of the figures it has to be compared against. It was 14px
                    beside a 30px "writes applied 0" — the wrong way round
                    for the only line on the panel that asks for an action. The
                    value is `value_paise`, formatted and nothing else. */}
                <span
                  className="font-numeric-mono"
                  style={{
                    fontSize: 20, lineHeight: "26px", fontWeight: 700,
                    color: "var(--color-abstained)", whiteSpace: "nowrap",
                  }}
                >
                  {formatPaise(e.value_paise)}
                </span>
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

      {/* Supporting evidence — the four standing facts about the run, and the
          step-by-step record beneath them. Below the human-review section
          rather than above it: these are what a reviewer checks the story
          against, not the story. */}
      <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-sm)" }}>
        Supporting evidence
      </p>

      <ResultSummary trace={trace} />

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
        <div className="scroll-x" style={{ marginBottom: "var(--space-sm)" }}>
          <table className="data-table" style={{ minWidth: 680 }}>
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

      {/* Where a reviewer goes next, named rather than left to be found.

          Two steps, and they are the two that make the panel checkable rather
          than merely readable. Verifying the ledger is the independent one:
          `GET /runs/:id/ledger/verify` recomputes this run's chain from
          genesis, so the trust does not rest on the panel agreeing with
          itself. Running another period is the discriminating one: the same
          controller over different evidence is what shows the behaviour above
          was a consequence of the evidence and not of a script. */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", alignItems: "center",
          marginTop: "var(--space-md)", paddingTop: "var(--space-md)",
          borderTop: "1px solid var(--color-outline-variant)",
        }}
      >
        <span className="font-label-caps text-muted">Next</span>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
          onClick={onVerifyLedger}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>verified_user</span>
          Verify ledger integrity
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
          onClick={onTryAnother}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>swap_horiz</span>
          Try another scenario
        </button>
        <span className="font-body-sm text-muted" style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 460 }}>
          Verify Ledger recomputes this run&apos;s hash chain from genesis. Another period runs the
          same controller over different evidence and produces its own trace.
        </span>
      </div>

      <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontSize: 11 }}>
        trace {trace.trace_id.slice(0, 12)}&hellip; &middot; re-running produces the same
        trace over an unchanged run
      </p>
    </>
  );
}

/**
 * The id the "Try another scenario" control scrolls back to.
 *
 * Exported so the Command Center stamps the same string on the scenario lab
 * that this file looks for — a literal typed twice is a control that silently
 * does nothing the first time one of them is renamed.
 */
export const SCENARIO_LAB_ANCHOR_ID = "scenario-lab";

/**
 * The panel, wired to one run: owns the hook, the button, and the
 * idle/loading/error states.
 *
 * `onTrace` reports what the hook got back, so the Command Center's status
 * ribbon can lead with the controller's outcome instead of leaving a reviewer
 * to scroll for it. It is a report, not a handover: the fetch, the button and
 * every rendered figure stay here, and the ribbon renders
 * {@link controllerOutcome}'s reading of the same trace rather than a summary
 * of its own. The effect fires on mount with `null`, which is what clears a
 * previous period's outcome when `CommandCenter` remounts this panel on a new
 * `run_id`.
 */
export function ControllerPanel({
  runId, onTrace, autoStart = false,
}: {
  runId: string;
  onTrace?: ((trace: ControllerTrace | null) => void) | undefined;
  /**
   * Drive the controller once, as soon as the run exists.
   *
   * The controller is the agentic half of this product and it was behind a
   * second button most of a page below the first one, so a reviewer who ran the
   * demo saw the deterministic half and stopped. Running it automatically
   * removes that barrier and changes nothing about what runs:
   * `POST /controller/start` is the same call the button makes, over the same
   * sealed run, through the same four read-only tools.
   *
   * **Exactly one trace per run.** `CommandCenter` keys this component on
   * `run_id`, so a new period remounts it and the ref below is fresh; within one
   * mount the ref makes the effect fire once, which also absorbs React's
   * development double-invoke. The button stays, because re-running the same
   * controller over the same run and getting the same trace is how a reviewer
   * checks that it is deterministic.
   */
  autoStart?: boolean;
}): React.ReactElement {
  const { start, state } = useController();
  const navigate = useNavigate();
  const trace = state.data;
  const autoStarted = useRef(false);

  useEffect(() => { onTrace?.(trace); }, [trace, onTrace]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void start(runId);
  }, [autoStart, runId, start]);

  return (
    <div className="card" style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--space-md)", flexWrap: "wrap", marginBottom: "var(--space-md)",
      }}>
        <div style={{ minWidth: 0 }}>
          {/* "Close controller" named the loop; a reviewer read it as the
              control that closes the period. It does not close anything and
              has no authority to: it reads, plans and escalates, and the
              subtitle now says so in the same breath as the name. */}
          <p className="font-label-caps font-label-section" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, color: "var(--color-secondary)" }}>route</span>
            Finance Controller &mdash; bounded orchestration
          </p>
          <p className="font-body-sm text-muted" style={{ marginTop: 2, maxWidth: 620, lineHeight: 1.6 }}>
            Drives the close loop over the sealed run &mdash; observes, triages, plans, escalates.
            Running it does not close or post the period and writes nothing to the ledger: the
            deterministic decision above is already final, and this has no authority over it.
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
          {state.loading ? "Running…" : trace ? "Run again — same run, same trace" : "Run Finance Controller"}
        </button>
      </div>

      {state.error !== null && (
        <p className="font-body-sm" style={{ color: "var(--color-exception)", marginBottom: "var(--space-md)" }}>
          {state.error}
        </p>
      )}

      {trace === null && !state.loading && state.error === null && (
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6 }}>
          Not yet run. The controller reads the close gate, the exception queue and one
          decision&apos;s evidence, then escalates what it may not decide. Its tool surface
          is four reads, so it writes nothing on any path.
        </p>
      )}

      {state.loading && trace === null && (
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6 }}>
          Running the Finance Controller over this period — observing the close gate, triaging
          the queue, planning a bounded inspection.
        </p>
      )}

      {trace !== null && (
        <ControllerTraceView
          trace={trace}
          onReviewClick={() => void navigate("/investigation-queue")}
          onVerifyLedger={() => void navigate("/audit-logs")}
          onTryAnother={() => {
            document.getElementById(SCENARIO_LAB_ANCHOR_ID)?.scrollIntoView();
          }}
        />
      )}
    </div>
  );
}
