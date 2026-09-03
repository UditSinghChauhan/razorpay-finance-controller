import { useNavigate } from "react-router-dom";
import { useRun } from "../context/RunContext.js";
import { useDecisionDetail, type EventActor } from "../hooks/useAssayApi.js";
import { probeSummary } from "../lib/copy.js";
import { formatActor, formatPaise, formatTimestamp } from "../lib/format.js";

/**
 * Evidence Trail - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen 407721922edf4f709afa670c7ffa7050
 * Design system v2: Indigo secondary, display-metric, w-72 nav.
 *
 * Shows the full audit trail for a selected decision:
 * - Header with entity, amount, status
 * - Journal lines
 * - Ledger event (hash chain)
 * - Constraint satisfaction from certificate (if present)
 * - AI explanation placeholder slot
 *
 * Data from GET /runs/:id/decisions/:decision_id + GET /runs/:id/close.
 */

/**
 * DATA_MODEL.md §16's actor, as the Ledger Event panel shows it.
 *
 * The block carries `type` and `component`; it carries no `id`. On the demo
 * abstention this reads `deterministic / engine.s5_validate` — which is exactly
 * the question §16 says the block exists to answer.
 *
 * Exported so its rendering is directly assertable without a live API.
 */
export function ActorLine({ actor }: { actor: EventActor }): React.ReactElement {
  return <p className="font-body-sm">{formatActor(actor)}</p>;
}

function VerdictChip({ verdict }: { verdict: string }): React.ReactElement {
  const color = verdict === "SATISFIES" ? "var(--color-reconciled)" :
                verdict === "VIOLATES" ? "var(--color-exception)" :
                "var(--color-outline)";
  const bg = verdict === "SATISFIES" ? "var(--color-reconciled-bg)" :
             verdict === "VIOLATES" ? "var(--color-exception-bg)" :
             "var(--color-surface-container)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 3, fontSize: 11,
      fontWeight: 600, color, background: bg,
    }}>
      {verdict}
    </span>
  );
}

export function EvidenceTrail(): React.ReactElement {
  const navigate = useNavigate();
  const { run, close, selectedDecisionId } = useRun();
  const detail = useDecisionDetail(run?.run_id ?? null, selectedDecisionId);

  // No decision selected
  if (!selectedDecisionId || !run) {
    return (
      <div style={{ padding: "var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-outline)" }}>receipt_long</span>
        <h1 className="page-title">Evidence Trail</h1>
        <p className="page-subtitle">Select a decision from the Investigation Queue to view its audit trail.</p>
        <button className="btn btn-secondary" onClick={() => void navigate("/investigation-queue")}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Investigation Queue
        </button>
      </div>
    );
  }

  if (detail.loading) {
    return (
      <div style={{ padding: "var(--space-xl)", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div style={{ padding: "var(--space-xl)", textAlign: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-exception)" }}>error</span>
        <p className="font-body-md text-error" style={{ marginTop: "var(--space-md)" }}>{detail.error ?? "Decision not found"}</p>
        <button className="btn btn-secondary" style={{ marginTop: "var(--space-md)" }} onClick={() => void navigate("/investigation-queue")}>
          Back to Queue
        </button>
      </div>
    );
  }

  const { decision, event } = detail.data;
  const cert = decision.certificate;
  const stateColor = decision.state === "ABSTAINED" ? "var(--color-abstained)" :
                     decision.state === "EXCEPTION" ? "var(--color-exception)" :
                     "var(--color-reconciled)";
  const stateBg = decision.state === "ABSTAINED" ? "var(--color-abstained-bg)" :
                  decision.state === "EXCEPTION" ? "var(--color-exception-bg)" :
                  "var(--color-reconciled-bg)";

  return (
    <div style={{ padding: "var(--space-lg)" }}>
      {/* Back nav */}
      <button
        className="btn btn-ghost"
        style={{ marginBottom: "var(--space-md)", padding: 0, fontSize: 13 }}
        onClick={() => void navigate("/investigation-queue")}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Investigation Queue
      </button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-xl)" }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: "var(--space-xs)" }}>Evidence Trail</h1>
          <p className="cell-id" style={{ fontSize: 13 }}>{decision.entity_id}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <p className="font-display-metric">{formatPaise(decision.value_paise)}</p>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 12px", borderRadius: 4, marginTop: 4,
              fontWeight: 600, fontSize: 12, letterSpacing: "0.05em",
              color: stateColor, background: stateBg,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor }} />
              {decision.state}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "var(--space-xl)" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>

          {/* Decision summary */}
          <section>
            <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>info</span>
              Decision Summary
            </h2>
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                <div>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Decision ID</p>
                  <p className="cell-id" style={{ fontSize: 11, wordBreak: "break-all" }}>{decision.decision_id}</p>
                </div>
                <div>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Observation</p>
                  <p className="cell-id" style={{ fontSize: 11 }}>{decision.obs_id}</p>
                </div>
                <div>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Kind</p>
                  <p className="font-body-sm">{decision.kind}</p>
                </div>
                <div>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Component</p>
                  <p className="cell-id" style={{ fontSize: 11 }}>{decision.comp_id ?? "--"}</p>
                </div>
                {decision.exception_class && (
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Exception Class</p>
                    <p className="font-body-sm" style={{ color: "var(--color-exception)" }}>{decision.exception_class}</p>
                  </div>
                )}
                {decision.suspense_key && (
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Suspense Key</p>
                    <p className="cell-id" style={{ fontSize: 11 }}>{decision.suspense_key}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Journal lines */}
          <section>
            <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>receipt</span>
              Journal Lines ({decision.journal_lines.length})
            </h2>
            <div className="card" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th style={{ textAlign: "right" }}>Debit</th>
                    <th style={{ textAlign: "right" }}>Credit</th>
                    <th>Source Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {decision.journal_lines.map((jl, i) => (
                    <tr key={i}>
                      <td className="font-body-sm" style={{ fontWeight: 500 }}>{jl.account}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {jl.dr_paise > 0 ? formatPaise(jl.dr_paise) : "--"}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {jl.cr_paise > 0 ? formatPaise(jl.cr_paise) : "--"}
                      </td>
                      <td className="cell-id">{jl.source_entity_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Constraint evaluation (if certificate present) */}
          {cert && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>rule</span>
                Shared Hard Constraints
              </h2>
              <div className="card" style={{ padding: "var(--space-md)" }}>
                {cert.shared_hard_constraints.map((c, i) => (
                  <div
                    key={c}
                    className="constraint-row"
                    style={{ padding: "var(--space-sm) 0", borderBottom: i < cert.shared_hard_constraints.length - 1 ? "1px solid var(--color-outline-variant)" : "none" }}
                  >
                    <span className="constraint-id">{c}</span>
                    <span className="font-body-sm" style={{ flex: 1, fontWeight: 500 }}>{c}</span>
                    <VerdictChip verdict="SATISFIES" />
                  </div>
                ))}
                <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontStyle: "italic" }}>
                  Both Solution A and Solution B satisfy all {cert.shared_hard_constraints.length} shared constraints.
                </p>
              </div>
            </section>
          )}

          {/* Certificate metrics */}
          {cert && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>analytics</span>
                Ambiguity Metrics
              </h2>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Evidence Gap</p>
                    <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>{cert.evidence_score_gap_bps} bps</p>
                  </div>
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Epsilon</p>
                    <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>{cert.epsilon_bps} bps</p>
                  </div>
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Materiality</p>
                    <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>{formatPaise(cert.materiality_paise)}</p>
                  </div>
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Tau</p>
                    <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>{formatPaise(cert.tau_paise)}</p>
                  </div>
                </div>
                <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-outline-variant)" }}>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Reason</p>
                  <p className="font-body-sm" style={{ fontWeight: 600, color: "var(--color-abstained)" }}>{cert.reason}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>

          {/* Ledger event */}
          {event && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>history_edu</span>
                Ledger Event
              </h2>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Event ID</p>
                    <p className="cell-id" style={{ fontSize: 11, wordBreak: "break-all" }}>{event.evt_id}</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                    <div>
                      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Sequence</p>
                      <p className="font-numeric-mono" style={{ fontWeight: 600 }}>#{event.seq}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Kind</p>
                      <p className="font-body-sm" style={{ fontWeight: 500 }}>{event.kind}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Actor</p>
                      <ActorLine actor={event.actor} />
                    </div>
                    <div>
                      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Timestamp</p>
                      <p className="font-body-sm">{formatTimestamp(event.ts)}</p>
                    </div>
                  </div>
                  <div style={{ background: "var(--color-surface-container-low)", borderRadius: "var(--radius-md)", padding: "var(--space-md)" }}>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Event Hash</p>
                    <p className="cell-id" style={{ fontSize: 10, wordBreak: "break-all", lineHeight: 1.6 }}>{event.hash}</p>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4, marginTop: "var(--space-sm)" }}>Previous Hash</p>
                    <p className="cell-id" style={{ fontSize: 10, wordBreak: "break-all", lineHeight: 1.6 }}>{event.prev_hash}</p>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4, marginTop: "var(--space-sm)" }}>Inputs Hash</p>
                    <p className="cell-id" style={{ fontSize: 10, wordBreak: "break-all", lineHeight: 1.6 }}>{event.inputs_hash}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Period / close info */}
          {close && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>lock</span>
                Period Status
              </h2>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                  <span className="font-body-sm">Period</span>
                  <span className="font-headline-sm" style={{
                    color: close.period_status === "CLOSED" ? "var(--color-reconciled)" :
                           close.period_status === "BLOCKED" ? "var(--color-exception)" :
                           "var(--color-abstained)",
                  }}>{close.period_status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
                  <span className="font-body-sm text-muted">Unresolved</span>
                  <span className="font-numeric-mono">{formatPaise(close.unresolved_value_paise)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
                  <span className="font-body-sm text-muted">Suspense</span>
                  <span className="font-numeric-mono">{formatPaise(close.suspense_balance_paise)}</span>
                </div>
                <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-outline-variant)" }}>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Ledger Root</p>
                  <p className="cell-id" style={{ fontSize: 10, wordBreak: "break-all" }}>{close.ledger_root_hash}</p>
                </div>
              </div>
            </section>
          )}

          {/* AI Explanation Slot */}
          <section>
            <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>smart_toy</span>
              AI Explanation
            </h2>
            <div style={{
              border: "1px dashed var(--color-outline-variant)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-lg)",
              background: "var(--color-surface-container-lowest)",
              textAlign: "center",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--color-secondary)", marginBottom: "var(--space-sm)", display: "block" }}>auto_awesome</span>
              <p className="font-body-md" style={{ fontWeight: 500, marginBottom: "var(--space-sm)" }}>Explain with AI</p>
              <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)", maxWidth: 260, margin: "0 auto var(--space-md)" }}>
                AI explanation will be grounded in the verified ASSAY evidence shown on this page.
                The AI reads the evidence; it does not make decisions.
              </p>
              <button className="btn btn-secondary" style={{ margin: "0 auto" }} onClick={() => { /* placeholder */ }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
                Explain This Decision
              </button>
              <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontSize: 11, fontStyle: "italic" }}>Coming soon</p>
            </div>
          </section>

          {/* Certificate link */}
          {cert && (
            <div style={{
              background: "var(--color-abstained-bg)",
              border: "1px solid var(--color-abstained)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-md)",
            }}>
              <p className="font-label-caps" style={{ color: "var(--color-abstained)", marginBottom: "var(--space-xs)" }}>Ambiguity Certificate Issued</p>
              <p className="font-body-sm" style={{ marginBottom: "var(--space-md)" }}>
                {probeSummary(cert.probes_attempted.length, cert.reason)}{" "}
                Reason: {cert.reason.replace(/_/g, " ").toLowerCase()}.
              </p>
              <button
                className="btn btn-secondary"
                style={{ width: "100%", justifyContent: "center", borderColor: "var(--color-abstained)", color: "var(--color-abstained)" }}
                onClick={() => void navigate("/ambiguity-certificate")}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>workspace_premium</span>
                View Certificate
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
