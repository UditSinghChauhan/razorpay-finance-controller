import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthorityLegend } from "../components/AuthorityLegend.js";
import {
  controllerOutcome,
  ControllerPanel,
  SCENARIO_LAB_ANCHOR_ID,
} from "../components/ControllerPanel.js";
import { CopyId } from "../components/CopyId.js";
import { ApiErrorNotice, useRunGate } from "../components/RunGate.js";
import { ScenarioPicker } from "../components/ScenarioPicker.js";
import { useRun } from "../context/RunContext.js";
import type { ControllerTrace } from "../hooks/useAssayApi.js";
import {
  ABSTAINED_VALUE_BASIS,
  ABSTAINED_VALUE_LABEL,
  abstentionDecisionLabel,
  affectedObservationsLabel,
  AUTHORITY_ONE_LINE,
  CONTROLLER_NOT_RUN,
  ENGINE_MODEL_USE,
  NO_MODEL_WRITES,
  periodStatusMeaning,
  PRODUCT_AGENTIC,
  PRODUCT_WHAT,
  RECONCILIATION_BASIS,
  RECONCILIATION_LABEL,
  RECONCILIATION_SCOPE,
  S5_COUNT_BASIS,
  VERIFY_LEDGER_TITLE,
} from "../lib/copy.js";
import { formatPaise, formatCount } from "../lib/format.js";
import { scenarioLabel } from "../lib/scenarios.js";

/**
 * Command Center - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen a6f740ffe62c4bb090d97bb76233faad
 * Design system v2: Indigo secondary, display-metric typography.
 *
 * All data sourced from POST /runs summary and GET /runs/:id/close.
 * No mock financial values - every number comes from the API.
 *
 * **The page tells one story, in one order:** financial state, then the
 * controller's outcome over it, then why it stopped, then the evidence, then
 * the next action. {@link RunStatusRibbon} is that story compressed into the
 * first screenful; everything below it is the working.
 *
 * Two counts on this page are deliberately different and both are the API's:
 * `summary.abstentions` is how many abstention DECISIONS the run made, and
 * `summary.observation_states.ABSTAINED` is how many OBSERVATIONS those
 * decisions covered. The Investigation Queue lists the second; this page leads
 * with the first and names both, so neither reads as a contradiction of the
 * other. Neither count is adjusted here.
 */

interface MetricCardProps {
  label: string;
  value: string;
  icon: string;
  trend?: string;
  trendDir?: "up" | "down" | "neutral";
  accentColor?: string;
  isAlert?: boolean;
}

function MetricCard({ label, value, icon, trend, trendDir = "neutral", accentColor, isAlert }: MetricCardProps): React.ReactElement {
  return (
    <div
      className="card card-metric"
      style={isAlert ? { borderLeft: `4px solid ${accentColor ?? "var(--color-exception)"}` } : {}}
    >
      {/* Three slots, not two. The value used to live inside a block the tile
          pushed to its bottom edge, so its top was whatever the label above and
          the trend below left it — and the four labels in this row do not wrap
          the same way. `card-metric-label` fixes the slot the label sits in and
          `card-metric-trend` keeps the trend on the floor of the tile, so every
          value in the row starts at the same offset. `design-system.css` states
          the geometry; nothing here changes a figure, a size or a colour. */}
      <div className="card-metric-label">
        <span className="font-label-caps text-muted">{label}</span>
        <span
          className="material-symbols-outlined"
          style={{ color: accentColor ?? "var(--color-on-surface-variant)", fontSize: 22 }}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div className="font-display-metric">{value}</div>
      {trend && (
        <div
          className="font-numeric-mono font-body-sm card-metric-trend"
          style={{
            display: "flex", alignItems: "center", gap: 2, paddingTop: 4,
            color: trendDir === "up" ? "var(--color-reconciled)" :
                   trendDir === "down" ? "var(--color-exception)" :
                   "var(--color-on-surface-variant)",
          }}
        >
          {trendDir === "up" && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_up</span>}
          {trendDir === "down" && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_down</span>}
          {trend}
        </div>
      )}
    </div>
  );
}

interface PipelineStageProps {
  label: string;
  status: "done" | "pending" | "error";
  count?: number;
  /** A word under the node where a count would go — the close gate's outcome. */
  note?: string | undefined;
}

function PipelineStage({ label, status, count, note }: PipelineStageProps): React.ReactElement {
  const color = status === "done" ? "var(--color-reconciled)" :
                status === "error" ? "var(--color-exception)" :
                "var(--color-outline)";
  return (
    <div style={{ textAlign: "center", minWidth: 80 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", margin: "0 auto 8px",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: status === "done" ? color : "transparent",
        border: `2px solid ${color}`,
      }}>
        <span className="material-symbols-outlined" style={{
          fontSize: 18, color: status === "done" ? "#fff" : color,
        }}>
          {status === "done" ? "check" : status === "error" ? "close" : "schedule"}
        </span>
      </div>
      <p className="font-label-caps" style={{ color, marginBottom: 2 }}>{label}</p>
      {count !== undefined && <p className="font-body-sm text-muted">{formatCount(count)}</p>}
      {note !== undefined && (
        <p className="font-label-caps" style={{ color, fontSize: 9 }}>{note}</p>
      )}
    </div>
  );
}

function GateStatusRow({ label, passed }: { label: string; passed: boolean }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", padding: "var(--space-xs) 0" }}>
      <span className="material-symbols-outlined" style={{
        fontSize: 16,
        color: passed ? "var(--color-reconciled)" : "var(--color-exception)",
      }}>
        {passed ? "check_circle" : "cancel"}
      </span>
      <span className="font-body-sm">{label}</span>
    </div>
  );
}

/**
 * What this product is, beneath the figures it produced.
 *
 * A reviewer who has never seen ASSAY meets three actors on this page — ASSAY,
 * the Controller and the explanation model — and needs to know which of the
 * three produced the rupee figures above. Four sentences, all constants from
 * {@link ../lib/copy.js}, none of them reading a run: what this is, what is
 * agentic about it, who decides, and why no model can move money.
 *
 * **It used to be the first thing on the page, and that was the wrong trade.**
 * An operator opening a close does not need the product explained before the
 * period reports its state; they need `OPEN`, the residual and the two next
 * actions, and *then* the account of who is entitled to act on them. Nothing
 * here was cut to move it — every sentence and every disclosure is the same.
 *
 * The three-card legend further down says the same thing at more length and is
 * where the bounds are argued. The start screen, where there is no run to
 * report, still leads with these same four sentences.
 */
function ReviewerBrief(): React.ReactElement {
  return (
    <div className="card" style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
      <p className="font-label-caps font-label-section" style={{ marginBottom: 4 }}>What this is</p>
      <p className="font-body-md" style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.5 }}>
        {PRODUCT_WHAT}
      </p>
      <p className="font-body-sm text-muted" style={{ lineHeight: 1.6, marginBottom: 6, maxWidth: 780 }}>
        {PRODUCT_AGENTIC}
      </p>
      <p className="font-body-sm" style={{ lineHeight: 1.6, fontWeight: 600, marginBottom: 2 }}>
        {AUTHORITY_ONE_LINE}
      </p>
      <p className="font-body-sm text-muted" style={{ lineHeight: 1.6, fontSize: 11 }}>
        {NO_MODEL_WRITES}
      </p>
    </div>
  );
}

/** One labelled fact in the status ribbon. */
function RibbonCell({
  label, value, accent, code, detail,
}: {
  label: string;
  value: string;
  accent?: string | undefined;
  /** The record's own reason code, beside the word it was rendered from. */
  code?: string | null | undefined;
  detail?: string | undefined;
}): React.ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: 2 }}>{label}</p>
      <p className="font-headline-sm" style={accent !== undefined ? { color: accent } : {}}>
        {value}
        {code !== undefined && code !== null && (
          <span className="cell-id" style={{ fontSize: 10, marginLeft: 6 }}>{code}</span>
        )}
      </p>
      {detail !== undefined && (
        <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>
          {detail}
        </p>
      )}
    </div>
  );
}

/**
 * The run's whole outcome, in one strip, above everything that explains it.
 *
 * **Why it is here at all.** `period_status` was on the page twice — as a word
 * under the pipeline's Close node and as a value inside the Close Gates card —
 * and both are below the fold on a laptop. The single most important fact
 * about a run was therefore something a reviewer scrolled to. Worse, the enum
 * alone does not carry its own meaning: `OPEN` looks like a neutral status
 * rather than the statement that value is still sitting in Suspense and the
 * period cannot close.
 *
 * **It reads fields and adds nothing.** The period and the residual are the
 * close gate's; the sentence beside the status is {@link periodStatusMeaning}'s
 * gloss on that same value, keyed on it and on nothing else; the controller
 * column is {@link controllerOutcome}'s reading of the trace the panel below
 * actually ran, and says *"not yet run"* rather than anything about an outcome
 * until one exists. No state is inferred, no figure is computed, and a status
 * the gloss does not know renders as the bare enum rather than as a guess.
 *
 * The two controls are the two next actions: the verification that stops this
 * page being its own witness, and the queue where the unresolved rows are
 * worked. Both are also reachable from the panels they belong to; they are
 * here because this is where a reviewer decides which one they want.
 */
function RunStatusRibbon({
  status, dataset, unresolvedPaise, thresholdPaise, trace, onVerify, onInvestigate,
}: {
  status: "CLOSED" | "OPEN" | "BLOCKED";
  dataset: string;
  unresolvedPaise: number;
  thresholdPaise: number | null;
  trace: ControllerTrace | null;
  onVerify: () => void;
  onInvestigate: () => void;
}): React.ReactElement {
  const color =
    status === "CLOSED" ? "var(--color-reconciled)"
      : status === "BLOCKED" ? "var(--color-exception)"
        : "var(--color-abstained)";
  const icon =
    status === "CLOSED" ? "task_alt" : status === "BLOCKED" ? "block" : "pending_actions";
  const outcome = trace === null ? null : controllerOutcome(trace);

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-md)", marginBottom: "var(--space-lg)",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color }}>
          {icon}
        </span>
        <span className="font-label-caps text-muted">Period status</span>
        <span className="font-headline-sm" style={{ color }}>{status}</span>
      </div>
      <p className="font-body-sm text-muted" style={{ lineHeight: 1.6, marginBottom: "var(--space-md)", maxWidth: 780 }}>
        {periodStatusMeaning(status)}
      </p>

      <div className="grid grid-3" style={{ marginBottom: "var(--space-md)" }}>
        <RibbonCell
          label="Period under review"
          value={scenarioLabel(dataset)}
          detail={`Demo period ${dataset} — a product fixture, never benchmark evidence.`}
        />
        <RibbonCell
          label="Unresolved vs. close threshold"
          value={
            thresholdPaise === null
              ? formatPaise(unresolvedPaise)
              : `${formatPaise(unresolvedPaise)} / ${formatPaise(thresholdPaise)}`
          }
          detail={
            unresolvedPaise > 0
              ? "Held in Suspense. The ledger stays balanced; the period cannot close while it is there."
              : "Nothing is held in Suspense against this period."
          }
        />
        {/* The agentic half. Availability before a run, the trace's own
            outcome after one — never a prediction, and never a claim about a
            handoff the loop did not reach. */}
        {outcome === null ? (
          <RibbonCell
            label="Finance Controller"
            value="Available"
            detail={CONTROLLER_NOT_RUN}
          />
        ) : (
          <RibbonCell
            label="Finance Controller"
            value={outcome.label}
            accent={outcome.color}
            code={outcome.reason}
            detail={outcome.headline}
          />
        )}
      </div>

      <div className="actions">
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
          onClick={onVerify}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>verified_user</span>
          {VERIFY_LEDGER_TITLE}
        </button>
        {unresolvedPaise > 0 && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
            onClick={onInvestigate}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>search_check</span>
            Work the unresolved items
          </button>
        )}
      </div>
    </div>
  );
}

export function CommandCenter(): React.ReactElement {
  const navigate = useNavigate();
  const {
    run, close, loading, error, startDemo, dataset, selectDataset,
  } = useRun();

  // Restoring / not-found / API-unreachable, decided once for every
  // run-dependent page. It must come before the start screen below: a reload
  // resolves a persisted pointer asynchronously, and "Run Demo" rendered over
  // a run that is about to arrive is an instruction to redo finished work.
  const gate = useRunGate();

  /**
   * The controller's trace, lifted so the ribbon at the top can report the
   * outcome the panel at the bottom produced.
   *
   * The panel still owns the fetch and the button; this is a read of what it
   * got, reported upward through {@link ControllerPanel}'s `onTrace`. The
   * panel is keyed on `run_id`, so a change of period remounts it and its
   * first effect reports `null` — which is what keeps a previous period's
   * outcome from surviving into the new period's ribbon.
   */
  const [trace, setTrace] = useState<ControllerTrace | null>(null);
  const onTrace = useCallback((t: ControllerTrace | null) => { setTrace(t); }, []);

  const s = run?.summary;
  const bvp = s?.batch_value_paise ?? 0;
  const decisions = s?.decisions ?? 0;
  const exceptions = s?.open_exceptions ?? 0;
  // §17.1.1's two granularities, both straight off POST /runs.
  const abstentionDecisions = s?.abstentions ?? 0;
  const abstainedObservations = s?.observation_states["ABSTAINED"] ?? 0;
  const periodStatus = s?.period_status ?? null;
  const unresolvedPaise = s?.unresolved_value_paise ?? 0;
  const obsCount = run?.observation_count ?? 0;

  // VALUE-weighted, not count-weighted: rupees reconciled over rupees in the
  // batch, both from the close report. The label says so, because the
  // count-weighted figure over the same run is a different number.
  const reconciledPct = bvp > 0 ? ((bvp - unresolvedPaise) / bvp) : 0;

  if (gate !== null) return gate;

  // If no run yet, show the start screen. The gate above has already held this
  // back while a persisted run id was being re-read, so reaching here means
  // there is no run and none is coming.
  if (!run && !loading) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: "var(--space-xl)" }}>
        <div style={{ textAlign: "center", maxWidth: 620 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 72, color: "var(--color-primary)", marginBottom: "var(--space-md)", display: "block" }}>monitoring</span>
          <h1 className="page-title">ASSAY Command Center</h1>
          <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
            {PRODUCT_WHAT}
          </p>
          <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", lineHeight: 1.6 }}>
            {PRODUCT_AGENTIC}
          </p>
          <p className="font-body-sm" style={{ marginTop: "var(--space-sm)", lineHeight: 1.6, fontWeight: 600 }}>
            {AUTHORITY_ONE_LINE}
          </p>
          {/* The safety claim belongs on the first screen too. It was on the
              reviewer brief, which only renders once a run exists — so the one
              screen a reviewer sees before deciding whether to press anything
              was the one screen that did not carry it. */}
          <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", lineHeight: 1.6 }}>
            {NO_MODEL_WRITES}
          </p>
        </div>
        <ScenarioPicker selected={dataset} disabled={loading} onSelect={selectDataset} />
        <button className="btn btn-primary" onClick={() => void startDemo()} style={{ padding: "var(--space-md) var(--space-xl)", fontSize: 16 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>play_arrow</span>
          Run Demo
        </button>
        {/* "llm: offline" read as a degraded system. What the field records is
            that the RECONCILIATION ENGINE consults no model on any path, which
            is a guarantee rather than a state — see {@link ENGINE_MODEL_USE}.
            The explanation provider is a separate, later, optional call and is
            named by the panel that makes it. */}
        <p className="font-body-sm text-muted" style={{ textAlign: "center", maxWidth: 520, lineHeight: 1.6 }}>
          dataset: {dataset} &middot; {ENGINE_MODEL_USE} No credentials required to run this.
        </p>
      </div>
    );
  }

  if (loading && !run) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <div className="loading-spinner" />
        <p className="font-body-md text-muted">Running ASSAY engine over {dataset}...</p>
        <p className="font-body-sm text-muted">
          Processing observations through the S0&ndash;S5 pipeline, then the close gate
        </p>
      </div>
    );
  }

  if (error) {
    // Two different failures with two different fixes, classified once in
    // `ApiErrorNotice`: a rejected fetch means the API process is not there,
    // which a reviewer can act on; anything the server itself answered already
    // carries its own reason, and replacing that with "start the server" would
    // be worse than the raw string. Both keep the underlying message on screen.
    return (
      <ApiErrorNotice
        error={error}
        title="The run could not be started"
        onRetry={() => void startDemo()}
      />
    );
  }

  return (
    <div className="page">

      {/* Page header */}
      <div className="page-header" style={{ padding: 0, marginBottom: "var(--space-lg)" }}>
        <div>
          <h1 className="page-title">Command Center</h1>
          <p className="page-subtitle">Settlement reconciliation &mdash; one period, end to end</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => void startDemo()} aria-label="Run batch job">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
            {dataset === run?.dataset ? "Re-Run Demo" : "Run this period"}
          </button>
        </div>
      </div>

      {/* The state of the period, first — above the product's account of
          itself and above the lab that chooses which period is loaded.

          The order used to be brief → scenario lab → status, which put the
          single fact an operator opens this page for below two blocks that
          explain what the page is. `Period status` measured around y=644 on a
          laptop and roughly three screens down at 390px: the product described
          itself before it reported anything. The narrative is not cut — it
          moves below the figures it contextualises, which is where a reviewer
          who has just read `OPEN` actually wants it. */}
      {periodStatus !== null && run !== null && (
        <RunStatusRibbon
          status={periodStatus}
          dataset={run.dataset}
          unresolvedPaise={unresolvedPaise}
          thresholdPaise={close?.close_threshold_paise ?? null}
          trace={trace}
          onVerify={() => void navigate("/audit-logs")}
          onInvestigate={() => void navigate("/investigation-queue")}
        />
      )}

      {/* Metric cards */}
      <div className="grid grid-4" style={{ marginBottom: "var(--space-md)" }}>
        <MetricCard
          label="Total Processed"
          value={formatPaise(bvp, true)}
          icon="monitoring"
          trend={`${formatCount(obsCount)} observations`}
          trendDir="up"
        />
        <MetricCard
          label={RECONCILIATION_LABEL}
          value={`${(reconciledPct * 100).toFixed(1)}%`}
          icon="check_circle"
          accentColor="var(--color-reconciled)"
          trend={`${formatPaise(unresolvedPaise)} unresolved`}
          trendDir="up"
        />
        <MetricCard
          label="Exceptions"
          value={formatCount(exceptions)}
          icon="warning"
          accentColor="var(--color-exception)"
          trend={exceptions > 0 ? "requires investigation" : "none"}
          trendDir={exceptions > 0 ? "down" : "neutral"}
          isAlert={exceptions > 0}
        />
        <MetricCard
          label="Abstention Decisions"
          value={formatCount(abstentionDecisions)}
          icon="pause_circle"
          accentColor="var(--color-abstained)"
          trend={
            abstentionDecisions > 0
              ? affectedObservationsLabel(abstainedObservations)
              : "none"
          }
          trendDir="neutral"
          isAlert={abstentionDecisions > 0}
        />
      </div>

      <div style={{ marginBottom: "var(--space-xl)" }}>
        <p className="font-body-sm text-muted">{RECONCILIATION_BASIS}</p>
        <p className="font-body-sm text-muted" style={{ marginTop: 2, lineHeight: 1.6, maxWidth: 820 }}>
          {RECONCILIATION_SCOPE}
        </p>
      </div>

      {/* Critical Focus Alert - the high-value abstention */}
      {abstentionDecisions > 0 && (
        <div className="alert-critical" style={{ marginBottom: "var(--space-xl)", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 20 }}>pause_circle</span>
            <span className="font-label-caps" style={{ color: "var(--color-abstained)" }}>Ambiguity Detected</span>
          </div>
          <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-xs)" }}>
            High-Value Abstention &mdash; Ambiguity Certificate Issued
          </h2>
          <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)", maxWidth: 780 }}>
            ASSAY recorded {abstentionDecisionLabel(abstentionDecisions)}, with{" "}
            {affectedObservationsLabel(abstainedObservations)}, where multiple hypotheses satisfy
            all hard constraints. The system abstained as a deliberate safety decision. The
            Investigation Queue lists the affected observations one row each.
          </p>
          <div className="grid grid-2" style={{ marginBottom: "var(--space-md)" }}>
            {/* The ABSTENTION half of §20's split, not the residual. This panel
                is headed "Ambiguity Detected", and the residual on a period
                that also carries unattributed bank credits includes money no
                certificate covers — so showing it here would attribute the
                exception half to an ambiguity. Read straight off the close
                gate; nothing is summed or derived. */}
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: "var(--radius-md)", padding: "var(--space-md)" }}>
              <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-xs)" }}>{ABSTAINED_VALUE_LABEL}</p>
              <p className="font-display-metric text-warning">
                {close ? formatPaise(close.value_abstained_paise) : "—"}
              </p>
              <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                {ABSTAINED_VALUE_BASIS}
              </p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: "var(--radius-md)", padding: "var(--space-md)" }}>
              <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-xs)" }}>Period Status</p>
              <p className="font-headline-sm">{periodStatus ?? "--"}</p>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => void navigate("/investigation-queue")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
            Investigate
          </button>
        </div>
      )}

      {/* What this is, after what it says. A reviewer who has read the period
          status and the four figures above now has the question this answers:
          who produced those numbers, and who is allowed to act on them. The
          block is unchanged — the same four constants, the same disclosures. */}
      <ReviewerBrief />

      {/* The period this run read, and the three others the same engine can be
          pointed at. Selecting one changes the evidence; nothing else about the
          pipeline changes, which is why the controller panel below can behave
          differently without anything having been configured.

          It sits beside the brief rather than above the status because it is a
          lab control, not a reading: the figures above belong to the period
          that ran, and this is where a reviewer comes to run a different one.
          The anchor is unchanged, so "Try another scenario" still lands here. */}
      <div
        id={SCENARIO_LAB_ANCHOR_ID}
        className="card"
        style={{ padding: "var(--space-md)", marginBottom: "var(--space-lg)" }}
      >
        {/* `ranDataset` is what the figures below belong to, not what is
            selected. Passing it is what lets the picker say, while a reviewer
            is mid-switch, that the page has not changed yet and that running
            the new period produces a new trace rather than updating this one. */}
        <ScenarioPicker
          selected={dataset}
          disabled={loading}
          onSelect={selectDataset}
          ranDataset={run?.dataset}
        />
      </div>

      {/* Pipeline status. The strip has a floor width and scrolls inside its
          own container below it — six nodes squashed to 40px each are six
          nodes nobody can read. */}
      <div className="card" style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)" }}>
        <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-lg)" }}>Reconciliation Pipeline</p>
        <div className="scroll-x">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 620 }}>
            <PipelineStage label="Ingest" status="done" count={obsCount} />
            <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
            <PipelineStage label="Anchor S1" status="done" count={obsCount} />
            <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
            <PipelineStage label="Candidates S2" status="done" count={decisions} />
            <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
            <PipelineStage label="Solve S4" status="done" count={decisions} />
            <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
            <PipelineStage
              label="Validate S5"
              status="done"
              count={decisions + exceptions}
              note="decisions + exceptions"
            />
            <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
            {/* The three outcomes are three different states and the node shows
                which one. `done` for CLOSED only: an OPEN period passed all five
                gates and is a legitimate business state, but it is not a closed
                one, and rendering it with the same green tick made a period that
                closed and a period that did not look identical at a glance.
                §10.2's BLOCKED stays the error state. */}
            <PipelineStage
              label="Close"
              status={
                periodStatus === "BLOCKED" ? "error" : periodStatus === "CLOSED" ? "done" : "pending"
              }
              note={periodStatus ?? undefined}
            />
          </div>
        </div>
        <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-md)", lineHeight: 1.6, maxWidth: 820 }}>
          {S5_COUNT_BASIS}
        </p>
      </div>

      {/* Close gate results */}
      {close && (
        <div className="grid grid-2" style={{ marginBottom: "var(--space-xl)" }}>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-md)" }}>Close Gates</p>
            {/* The outcome, stated where the gates are — unconditionally.
                It previously appeared only inside the abstention alert, so a
                period with no abstention on it (every gate passing, residual
                inside the threshold, CLOSED) said so nowhere on this page. */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              paddingBottom: "var(--space-sm)", marginBottom: "var(--space-sm)",
              borderBottom: "1px solid var(--color-outline-variant)",
            }}>
              <span className="font-body-sm text-muted">Period</span>
              <span className="font-headline-sm" style={{
                color: close.period_status === "CLOSED" ? "var(--color-reconciled)"
                  : close.period_status === "BLOCKED" ? "var(--color-exception)"
                    : "var(--color-abstained)",
              }}>{close.period_status}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
              <span className="font-body-sm text-muted">Unresolved vs. threshold</span>
              <span className="font-numeric-mono" style={{ textAlign: "right" }}>
                {formatPaise(close.unresolved_value_paise)} / {formatPaise(close.close_threshold_paise)}
              </span>
            </div>
            <GateStatusRow label="G1 All Terminal" passed={close.gate.g1_all_terminal} />
            <GateStatusRow label="G2 Trial Balance" passed={close.gate.g2_trial_balance} />
            <GateStatusRow label="G3 Suspense Identity" passed={close.gate.g3_suspense_identity} />
            <GateStatusRow label="G4 Hash Chain" passed={close.gate.g4_hash_chain} />
            <GateStatusRow label="G5 No Failed Invariant Posted" passed={close.gate.g5_no_failed_invariant_posted} />
          </div>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-md)" }}>Ledger Summary</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="font-body-sm text-muted">Trial Balance</span>
                <span className="font-numeric-mono" style={{ color: close.trial_balance_ok ? "var(--color-reconciled)" : "var(--color-exception)" }}>
                  {close.trial_balance_ok ? "BALANCED" : "IMBALANCED"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="font-body-sm text-muted">Events</span>
                <span className="font-numeric-mono">{formatCount(close.event_count)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="font-body-sm text-muted">Journal Lines</span>
                <span className="font-numeric-mono">{formatCount(close.journal_line_count)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="font-body-sm text-muted">Suspense Balance</span>
                <span className="font-numeric-mono">{formatPaise(close.suspense_balance_paise)}</span>
              </div>
              <div style={{ marginTop: "var(--space-sm)", paddingTop: "var(--space-sm)", borderTop: "1px solid var(--color-outline-variant)" }}>
                <CopyId label="Ledger Root Hash" value={close.ledger_root_hash} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Who decides what — read before the controller panel below, because
          the panel is the one place on this page where three different kinds
          of authority sit next to each other. Displays no figure. */}
      {run && <AuthorityLegend />}

      {/* Close controller — packages/controller's trace over this sealed run.
          A second strip beneath the reconciliation pipeline above: the engine
          ran first and decided everything; this orchestrates the residual and
          writes nothing.

          `key` is the run id, and it is load-bearing rather than a list-key
          habit. The panel holds its trace in `useController`'s own state, and
          without a key React reuses the component across a change of run —
          leaving the PREVIOUS period's trace on screen beside the new period's
          figures until someone presses the button again. A trace is about
          exactly one run, so the panel's identity is that run. */}
      {run && (
        <ControllerPanel key={run.run_id} runId={run.run_id} onTrace={onTrace} autoStart />
      )}

      {/* Live data indicator.

          It used to end `{agent_id}/{llm_provider}`, which rendered as
          "ASSAY/offline" and read as *"ASSAY is offline"* — a degraded system,
          or a failed provider. Neither is what the field says.
          `apps/api/src/registry.ts` fixes `llm_mode: "offline"` for every run
          because the reconciliation engine consults no model on any path; it
          is a guarantee, and {@link ENGINE_MODEL_USE} states it as one. The
          explanation provider is a separate, optional, later call and is named
          by the panel that actually makes it, never here. */}
      {run && (
        <p className="font-body-sm text-muted" style={{ textAlign: "right", lineHeight: 1.6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", color: "var(--color-reconciled)" }}>circle</span>
          {" "}Live &mdash; run {run.run_id.substring(0, 12)}... &middot; period {run.dataset}{" "}
          &middot; engine {run.agent_id}
          <br />
          {ENGINE_MODEL_USE}
        </p>
      )}
    </div>
  );
}
