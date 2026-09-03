import { useNavigate } from "react-router-dom";
import { AuthorityLegend } from "../components/AuthorityLegend.js";
import { ControllerPanel, SCENARIO_LAB_ANCHOR_ID } from "../components/ControllerPanel.js";
import { ScenarioPicker } from "../components/ScenarioPicker.js";
import { useRun } from "../context/RunContext.js";
import {
  ABSTAINED_VALUE_BASIS,
  ABSTAINED_VALUE_LABEL,
  abstentionDecisionLabel,
  affectedObservationsLabel,
  ENGINE_MODEL_USE,
  periodStatusMeaning,
  RECONCILIATION_BASIS,
  RECONCILIATION_LABEL,
} from "../lib/copy.js";
import { formatPaise, formatCount } from "../lib/format.js";

/**
 * Command Center - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen a6f740ffe62c4bb090d97bb76233faad
 * Design system v2: Indigo secondary, display-metric typography.
 *
 * All data sourced from POST /runs summary and GET /runs/:id/close.
 * No mock financial values - every number comes from the API.
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="font-label-caps text-muted">{label}</span>
        <span
          className="material-symbols-outlined"
          style={{ color: accentColor ?? "var(--color-on-surface-variant)", fontSize: 22 }}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div>
        <div className="font-display-metric">{value}</div>
        {trend && (
          <div
            className="font-numeric-mono font-body-sm"
            style={{
              display: "flex", alignItems: "center", gap: 2, marginTop: 4,
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
 * The period's own outcome, at the top of the page and in words.
 *
 * **Why it is here at all.** `period_status` was on the page twice — as a word
 * under the pipeline's Close node and as a value inside the Close Gates card —
 * and both are below the fold on a laptop. The single most important fact
 * about a run was therefore something a reviewer scrolled to. Worse, the enum
 * alone does not carry its own meaning: `OPEN` looks like a neutral status
 * rather than the statement that value is still sitting in Suspense and the
 * period cannot close.
 *
 * **It reads `period_status` and adds nothing.** The status is the close
 * gate's; the sentence beside it is {@link periodStatusMeaning}'s gloss on
 * that same value, keyed on it and on nothing else. No state is inferred, no
 * figure is computed, and a status the gloss does not know renders as the bare
 * enum rather than as a guess.
 *
 * The verification control belongs here rather than in a nav item because this
 * is the claim it checks: the page says the period closed, and Audit Logs is
 * where that stops being this page's word for it.
 */
function PeriodOutcome({
  status, onVerify,
}: { status: "CLOSED" | "OPEN" | "BLOCKED"; onVerify: () => void }): React.ReactElement {
  const color =
    status === "CLOSED" ? "var(--color-reconciled)"
      : status === "BLOCKED" ? "var(--color-exception)"
        : "var(--color-abstained)";
  const icon =
    status === "CLOSED" ? "task_alt" : status === "BLOCKED" ? "block" : "pending_actions";
  return (
    <div
      className="card"
      style={{
        padding: "var(--space-md)", marginBottom: "var(--space-lg)",
        borderLeft: `4px solid ${color}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: "var(--space-md)", flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color }}>
            {icon}
          </span>
          <span className="font-label-caps text-muted">Period status</span>
          <span className="font-headline-sm" style={{ color }}>{status}</span>
        </div>
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6, maxWidth: 620, marginBottom: 0 }}>
          {periodStatusMeaning(status)}
        </p>
      </div>
      <button
        className="btn btn-secondary"
        style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
        onClick={onVerify}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>verified_user</span>
        Verify ledger integrity
      </button>
    </div>
  );
}

export function CommandCenter(): React.ReactElement {
  const navigate = useNavigate();
  const { run, close, loading, error, startDemo, dataset, selectDataset } = useRun();

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

  // If no run yet, show the start screen
  if (!run && !loading) {
    return (
      <div style={{ padding: "var(--space-lg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: "var(--space-xl)" }}>
        <div style={{ textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 72, color: "var(--color-primary)", marginBottom: "var(--space-md)", display: "block" }}>monitoring</span>
          <h1 className="page-title">ASSAY Command Center</h1>
          <p className="page-subtitle" style={{ marginTop: "var(--space-sm)", maxWidth: 480 }}>
            Settlement reconciliation intelligence for Razorpay-shaped payment data.
            Start a demo run to process one period through the ASSAY engine.
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
      <div style={{ padding: "var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <div className="loading-spinner" />
        <p className="font-body-md text-muted">Running ASSAY engine over {dataset}...</p>
        <p className="font-body-sm text-muted">Processing observations through S0-S5 pipeline</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-exception)" }}>error</span>
        <p className="font-body-md text-error">Failed to start run</p>
        <p className="font-body-sm text-muted" style={{ maxWidth: 400, textAlign: "center" }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => void startDemo()}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-lg)" }}>

      {/* Page header */}
      <div className="page-header" style={{ padding: 0, marginBottom: "var(--space-lg)" }}>
        <div>
          <h1 className="page-title">Command Center</h1>
          <p className="page-subtitle">System Health &amp; Reconciliation Overview</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-md)" }}>
          <button className="btn btn-primary" onClick={() => void startDemo()} aria-label="Run batch job">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
            {dataset === run?.dataset ? "Re-Run Demo" : "Run this period"}
          </button>
        </div>
      </div>

      {/* The period this run read, and the three others the same engine can be
          pointed at. Selecting one changes the evidence; nothing else about the
          pipeline changes, which is why the controller panel below can behave
          differently without anything having been configured. */}
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

      {/* The outcome, before the figures that led to it. */}
      {periodStatus !== null && (
        <PeriodOutcome status={periodStatus} onVerify={() => void navigate("/audit-logs")} />
      )}

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
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

      <p className="font-body-sm text-muted" style={{ marginTop: "calc(-1 * var(--space-md))", marginBottom: "var(--space-xl)" }}>
        {RECONCILIATION_BASIS}
      </p>

      {/* Critical Focus Alert - the high-value abstention */}
      {abstentionDecisions > 0 && (
        <div className="alert-critical" style={{ marginBottom: "var(--space-xl)", position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, right: 0, padding: "var(--space-lg)",
            opacity: 0.08, pointerEvents: "none",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 120, color: "var(--color-abstained)" }}>workspace_premium</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 20 }}>pause_circle</span>
            <span className="font-label-caps" style={{ color: "var(--color-abstained)" }}>Ambiguity Detected</span>
          </div>
          <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-xs)" }}>
            High-Value Abstention &mdash; Ambiguity Certificate Issued
          </h2>
          <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)" }}>
            ASSAY recorded {abstentionDecisionLabel(abstentionDecisions)}, with{" "}
            {affectedObservationsLabel(abstainedObservations)}, where multiple hypotheses satisfy
            all hard constraints. The system abstained as a deliberate safety decision. The
            Investigation Queue lists the affected observations one row each.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", marginBottom: "var(--space-md)" }}>
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

      {/* Pipeline status */}
      <div className="card" style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)" }}>
        <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-lg)" }}>Reconciliation Pipeline</p>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
          <PipelineStage label="Ingest" status="done" count={obsCount} />
          <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
          <PipelineStage label="Anchor S1" status="done" count={obsCount} />
          <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
          <PipelineStage label="Candidates S2" status="done" count={decisions} />
          <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
          <PipelineStage label="Solve S4" status="done" count={decisions} />
          <div style={{ height: 2, flex: 1, background: "var(--color-reconciled)", marginTop: 18 }} />
          <PipelineStage label="Validate S5" status="done" count={decisions + exceptions} />
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

      {/* Close gate results */}
      {close && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
          <div className="card" style={{ padding: "var(--space-lg)" }}>
            <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-md)" }}>Close Gates</p>
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
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
              <span className="font-body-sm text-muted">Unresolved vs. threshold</span>
              <span className="font-numeric-mono">
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
            <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-md)" }}>Ledger Summary</p>
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
                <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Ledger Root Hash</p>
                <p className="cell-id" style={{ fontSize: 11, wordBreak: "break-all" }}>{close.ledger_root_hash}</p>
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
      {run && <ControllerPanel key={run.run_id} runId={run.run_id} />}

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
