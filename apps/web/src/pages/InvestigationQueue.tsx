import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CopyId } from "../components/CopyId.js";
import { ApiErrorNotice, useRunGate } from "../components/RunGate.js";
import { useRun } from "../context/RunContext.js";
import {
  abstentionGranularityNote,
  affectedObservationsLabel,
  openExceptionRecordsLabel,
  SUSPENSE_ABSTAINED_BASIS,
  SUSPENSE_ABSTAINED_LABEL,
  SUSPENSE_EXCEPTIONS_BASIS,
  SUSPENSE_EXCEPTIONS_LABEL,
} from "../lib/copy.js";
import { formatPaise, formatCount } from "../lib/format.js";
import type { ExceptionItem } from "../hooks/useAssayApi.js";

/**
 * Investigation Queue - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen 4a8912729c14499da36b4110e88de1e2
 * Design system v2: Indigo secondary, display-metric, w-72 nav.
 *
 * Dense exception queue with filter chips, status badges, and
 * investigation panel. Data from GET /runs/:id/exceptions.
 *
 * This queue is OBSERVATION-level, and the labelling says so. One abstention
 * decision can put several rows here: DATA_MODEL.md §17.1.1 keys the posting to
 * the component's target, while every member of that component still reaches an
 * ABSTAINED terminal state and still carries real money, so §9's rupee-ranked
 * queue must show each one. The rows are therefore the consequences of the
 * Command Center's decision count, not a second, larger count of abstentions.
 * Neither number is adjusted here and the rows are never collapsed.
 */

type StatusFilter = "all" | "ABSTAINED" | "EXCEPTION";

function StatusBadge({ state }: { state: string }): React.ReactElement {
  const color = state === "ABSTAINED" ? "var(--color-abstained)" :
                state === "EXCEPTION" ? "var(--color-exception)" :
                state === "RECONCILED" ? "var(--color-reconciled)" :
                "var(--color-outline)";
  const bg = state === "ABSTAINED" ? "var(--color-abstained-bg)" :
             state === "EXCEPTION" ? "var(--color-exception-bg)" :
             state === "RECONCILED" ? "var(--color-reconciled-bg)" :
             "var(--color-surface-container)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 3, fontSize: 11,
      fontWeight: 600, letterSpacing: "0.05em",
      color, background: bg, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {state}
    </span>
  );
}

/**
 * The three populations on this page, and how the first two are related.
 *
 * **The misreading this exists to prevent.** A reviewer landing on twenty-six
 * rows, six of them amber, reads *six abstentions*. There is one. §17.1.1 keys
 * the Suspense posting to the abstained component's target while every member
 * still reaches an `ABSTAINED` terminal state, so one decision puts six rows
 * on a queue that ARCHITECTURE.md §9 ranks by rupee value. The rows are the
 * consequence; the decision is the cause; and until this strip existed the
 * page showed the consequence and left the cause on another screen.
 *
 * **The exception population is independent and is stated as independent.**
 * Those rows are not members of anything — each is its own decision, none
 * carries a certificate, and folding them into the abstention story would be
 * the mirror-image error. The strip separates them with a rule and names them
 * as their own population.
 *
 * Every figure is read: `summary.abstentions` and `summary.certificates` are
 * `POST /runs`'s, the row counts are the queue's own, and nothing is derived
 * beyond counting rows by their `state`.
 */
function PopulationStrip({
  abstentionDecisions, affected, exceptions, certificates,
}: {
  abstentionDecisions: number;
  affected: number;
  exceptions: number;
  certificates: number;
}): React.ReactElement {
  const step = (value: string, label: string, accent: string): React.ReactElement => (
    <div style={{ minWidth: 0 }}>
      <p className="font-display-metric" style={{ color: accent, fontSize: 26, lineHeight: "32px" }}>{value}</p>
      <p className="font-body-sm" style={{ fontWeight: 600, lineHeight: 1.4 }}>{label}</p>
    </div>
  );
  const arrow = (
    <span className="material-symbols-outlined chain-arrow" aria-hidden="true" style={{ fontSize: 20 }}>
      arrow_forward
    </span>
  );

  return (
    <div
      className="card"
      style={{ padding: "var(--space-md)", marginBottom: "var(--space-md)", borderLeft: "3px solid var(--color-abstained)" }}
    >
      <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-sm)" }}>
        What is on this queue
      </p>

      {/* Cause → consequence → record. Read left to right, this is the whole
          relationship the page needs a reviewer to hold. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)" }}>
        {step(
          formatCount(abstentionDecisions),
          abstentionDecisions === 1 ? "abstention decision" : "abstention decisions",
          "var(--color-abstained)",
        )}
        {arrow}
        {step(formatCount(affected), "affected observations, listed below", "var(--color-abstained)")}
        {arrow}
        {step(
          formatCount(certificates),
          certificates === 1 ? "Ambiguity Certificate" : "Ambiguity Certificates",
          "var(--color-abstained)",
        )}
      </div>

      <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", lineHeight: 1.6, maxWidth: 820 }}>
        {abstentionGranularityNote(abstentionDecisions, affected)}
      </p>

      <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-outline-variant)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)" }}>
          {step(formatCount(exceptions), "independent exception observations", "var(--color-exception)")}
        </div>
        <p className="font-body-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6, maxWidth: 820 }}>
          A separate population: each is its own decision, none belongs to an abstained component,
          and none carries a certificate.
        </p>
      </div>
    </div>
  );
}

function InvestigationPanel({
  item, onClose,
}: {
  item: ExceptionItem; onClose: () => void;
}): React.ReactElement {
  const navigate = useNavigate();
  const { selectDecision } = useRun();

  const goEvidence = (): void => {
    selectDecision(item.decision_id);
    void navigate("/evidence-trail");
  };
  const goCert = (): void => {
    selectDecision(item.decision_id);
    void navigate("/ambiguity-certificate");
  };

  return (
    // `.detail-panel` is 400px beside the table on a desktop and the full
    // viewport width once 400px would cover the rows it is describing. The
    // actions live in a footer that never scrolls out of reach.
    <aside className="detail-panel" aria-label="Investigation detail">
      {/* Panel header */}
      <div style={{ padding: "var(--space-md) var(--space-lg)", borderBottom: "1px solid var(--color-outline-variant)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
        <span className="font-label-caps font-label-section">Investigation Detail</span>
        <button className="btn-ghost" onClick={onClose} aria-label="Close panel" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-lg)" }}>
        {/* Entity info */}
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <CopyId label="Entity ID" value={item.entity_id} fontSize={13} />
        </div>

        <div className="grid grid-2" style={{ marginBottom: "var(--space-lg)" }}>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>State</p>
            <StatusBadge state={item.state} />
          </div>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Value</p>
            <p className="font-numeric-mono" style={{ fontWeight: 600 }}>{formatPaise(item.value_paise)}</p>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: "var(--space-lg)" }}>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Kind</p>
            <p className="font-body-sm">{item.kind}</p>
          </div>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Exception Class</p>
            <p className="font-body-sm">{item.exception_class ?? "--"}</p>
          </div>
        </div>

        {item.suspense_key && (
          <div style={{ marginBottom: "var(--space-lg)" }}>
            <CopyId label="Suspense Key" value={item.suspense_key} fontSize={12} />
          </div>
        )}

        {item.has_certificate && (
          <div style={{
            background: "var(--color-abstained-bg)",
            border: "1px solid var(--color-abstained)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-md)",
            marginBottom: "var(--space-lg)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
              <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 18 }}>workspace_premium</span>
              <span className="font-label-caps" style={{ color: "var(--color-abstained)" }}>Ambiguity Certificate Issued</span>
            </div>
            <p className="font-body-sm text-muted">
              Multiple hypotheses satisfy all hard constraints.
              ASSAY abstained as a safety decision.
            </p>
          </div>
        )}

        {/* The two identifiers that carry this row into the next two steps of
            the journey. Middle-truncated with the whole value one click away:
            the two ends are what a reviewer compares, and a 71-character id at
            full width was the panel's own worst overflow. */}
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <CopyId label="Decision ID" value={item.decision_id} head={14} tail={8} />
        </div>

        <div style={{ marginBottom: "var(--space-lg)" }}>
          <CopyId label="Event ID" value={item.evt_id} head={14} tail={8} />
        </div>
      </div>

      {/* Panel actions */}
      <div style={{ padding: "var(--space-lg)", borderTop: "1px solid var(--color-outline-variant)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={goEvidence}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>receipt_long</span>
          Investigate
        </button>
        {item.has_certificate && (
          <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={goCert}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>workspace_premium</span>
            View Certificate
          </button>
        )}
      </div>
    </aside>
  );
}

export function InvestigationQueue(): React.ReactElement {
  const navigate = useNavigate();
  const { run, exceptions, loading, error, selectDecision, startDemo } = useRun();
  const gate = useRunGate();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const items = exceptions?.items ?? [];
  const filtered = filter === "all" ? items : items.filter(i => i.state === filter);
  const selected = selectedIdx !== null ? filtered[selectedIdx] ?? null : null;

  // Restoring / not-found / API-unreachable, before this page's own empty
  // state: a reload resolves the persisted pointer asynchronously, and "run
  // the demo first" over a run that is about to arrive is a false instruction.
  if (gate !== null) return gate;

  // No run yet, and none coming.
  if (!run && !loading) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-outline)" }}>search_check</span>
        <h1 className="page-title">Investigation Queue</h1>
        <p className="page-subtitle">Run the demo first to populate the exception queue.</p>
        <button className="btn btn-primary" onClick={() => void startDemo()}>Run Demo</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error) {
    // Classified rather than printed. A rejected fetch is the API process not
    // being there and has an operator's fix; a status the server answered
    // carries its own reason and keeps it. Retrying re-runs the period, which
    // is what actually repopulates this queue.
    return (
      <ApiErrorNotice
        error={error}
        title="The exception queue could not be loaded"
        onRetry={() => void startDemo()}
      />
    );
  }

  // Row counts — observations, not decisions.
  const absCount = items.filter(i => i.state === "ABSTAINED").length;
  const excCount = items.filter(i => i.state === "EXCEPTION").length;
  // The decision and certificate counts are the Command Center's, read from the
  // same POST /runs summary rather than re-derived, so the two pages cannot
  // disagree.
  const abstentionDecisions = run?.summary.abstentions ?? 0;
  const certificates = run?.summary.certificates ?? 0;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ padding: 0, marginBottom: "var(--space-lg)" }}>
        <div>
          <h1 className="page-title">Investigation Queue</h1>
          <p className="page-subtitle">
            Affected observations from exceptions and abstentions, ranked by rupee value
          </p>
        </div>
        <div className="actions">
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "var(--space-xs) var(--space-md)" }}
            onClick={() => void navigate("/command-center")}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>arrow_back</span>
            Command Center
          </button>
        </div>
      </div>

      {/* Granularity: why six rows is not six abstentions, and what the twenty
          exception rows are instead. */}
      {absCount > 0 && (
        <PopulationStrip
          abstentionDecisions={abstentionDecisions}
          affected={absCount}
          exceptions={excCount}
          certificates={certificates}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-3" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Queued Observations</p>
          <p className="font-display-metric">{formatCount(exceptions?.total ?? 0)}</p>
          <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {affectedObservationsLabel(absCount)} abstained &middot; {openExceptionRecordsLabel(excCount)}
          </p>
        </div>
        <div className="card" style={{ padding: "var(--space-md)", borderLeft: "3px solid var(--color-abstained)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>{SUSPENSE_ABSTAINED_LABEL}</p>
          <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--color-abstained)" }}>{formatPaise(exceptions?.value_abstained_paise ?? 0)}</p>
          <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 2 }}>{SUSPENSE_ABSTAINED_BASIS}</p>
        </div>
        <div className="card" style={{ padding: "var(--space-md)", borderLeft: "3px solid var(--color-exception)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>{SUSPENSE_EXCEPTIONS_LABEL}</p>
          <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--color-exception)" }}>{formatPaise(exceptions?.value_exceptions_paise ?? 0)}</p>
          <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 2 }}>{SUSPENSE_EXCEPTIONS_BASIS}</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="actions" style={{ marginBottom: "var(--space-md)" }}>
        {(["all", "ABSTAINED", "EXCEPTION"] as StatusFilter[]).map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "var(--space-xs) var(--space-md)", fontSize: 12 }}
            aria-pressed={filter === f}
            onClick={() => { setFilter(f); setSelectedIdx(null); }}
          >
            {f === "all" ? `All observations (${String(items.length)})` :
             f === "ABSTAINED" ? `Abstained observations (${String(absCount)})` :
             `Exception observations (${String(excCount)})`}
          </button>
        ))}
      </div>

      {/* Data table. Seven columns of identifiers and money do not reflow into
          a phone, so the table scrolls inside its own card rather than pushing
          the page sideways. */}
      <div className="card" style={{ padding: 0 }}>
        <div className="scroll-x">
          <table className="data-table" style={{ minWidth: 720 }}>
            <caption
              className="font-body-sm text-muted"
              style={{ captionSide: "top", textAlign: "left", padding: "var(--space-sm) var(--space-md)" }}
            >
              One row per affected observation. An abstained component contributes its target and
              each of its members, so several rows can belong to a single abstention decision.
            </caption>
            <thead>
              <tr>
                <th>Entity ID</th>
                <th>State</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th>Kind</th>
                <th>Exception Class</th>
                <th>Certificate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr
                  key={item.decision_id}
                  onClick={() => setSelectedIdx(idx)}
                  style={selectedIdx === idx ? { background: "var(--color-surface-container-low)" } : {}}
                >
                  <td className="cell-id">{item.entity_id}</td>
                  <td><StatusBadge state={item.state} /></td>
                  <td style={{ textAlign: "right", fontFamily: "Inter", fontWeight: 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatPaise(item.value_paise)}</td>
                  <td className="font-body-sm">{item.kind}</td>
                  <td className="font-body-sm">{item.exception_class ?? "--"}</td>
                  <td>
                    {item.has_certificate && (
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--color-abstained)" }} title="Certificate issued">workspace_premium</span>
                    )}
                  </td>
                  {/* The row's own action, quietly. Twenty-six identical
                      filled buttons down the right-hand edge gave every row the
                      same visual weight as the amount it carries, on a queue
                      that is ranked by that amount — the page read as a generic
                      dashboard rather than as a worklist. This is the same
                      control with the same handler and the same words: still a
                      real <button>, so it keeps its place in the tab order and
                      its keyboard activation, and still stopping propagation so
                      it never fires the row's own drawer. */}
                  <td>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "2px 4px", fontSize: 11, gap: 2, whiteSpace: "nowrap", color: "var(--color-primary)" }}
                      aria-label={`Investigate ${item.entity_id}`}
                      onClick={(e) => { e.stopPropagation(); selectDecision(item.decision_id); void navigate("/evidence-trail"); }}
                    >
                      Investigate
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>
                        chevron_right
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "var(--space-xl)", color: "var(--color-on-surface-variant)" }}>
                    No items match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <InvestigationPanel
          item={selected}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </div>
  );
}
