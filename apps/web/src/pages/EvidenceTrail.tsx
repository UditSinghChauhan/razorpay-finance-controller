import { useNavigate } from "react-router-dom";
import { AiExplanation } from "../components/AiExplanation.js";
import { CopyId } from "../components/CopyId.js";
import { ApiErrorNotice, useRunGate } from "../components/RunGate.js";
import { useRun } from "../context/RunContext.js";
import {
  useDecisionDetail,
  type AmbiguityCertificate,
  type DecisionEvidence,
  type EventActor,
} from "../hooks/useAssayApi.js";
import { LEDGER_EVENT_BASIS, LEDGER_EVENT_HEADING, probeSummary, UNRESOLVED_MEANING } from "../lib/copy.js";
import { formatActor, formatPaise, formatTimestamp } from "../lib/format.js";

/**
 * Evidence Trail - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen 407721922edf4f709afa670c7ffa7050
 * Design system v2: Indigo secondary, display-metric, w-72 nav.
 *
 * Shows the full audit trail for a selected decision:
 * - Header with entity, amount, status, and the case it belongs to
 * - {@link DecisionVerdict}: the causal chain, before any field table
 * - Journal lines
 * - The sealed ledger event (hash chain)
 * - Constraint satisfaction from certificate (if present)
 * - The grounded AI explanation (components/AiExplanation.tsx), over the same
 *   DecisionEvidence this page renders
 *
 * Data from GET /runs/:id/decisions/:decision_id + GET /runs/:id/close.
 *
 * **The two columns are `.split`, not a fixed `1.2fr 1fr`.** Below 1100px the
 * layout becomes one column in the reading order — decision, then its
 * accounting consequence, then the period, then the explanation — because at
 * that width the right-hand column was being cut off by the viewport rather
 * than reflowed, and a reviewer had no way to know the ledger event existed.
 */

/**
 * DATA_MODEL.md §16's actor, as the ledger event panel shows it.
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
      fontWeight: 600, color, background: bg, whiteSpace: "nowrap",
    }}>
      {verdict}
    </span>
  );
}

/** One line of the causal chain: a fact, and where it came from. */
function ReasonLine({ text, value }: { text: string; value?: string | undefined }): React.ReactElement {
  return (
    <li style={{ display: "flex", gap: "var(--space-sm)", alignItems: "baseline", listStyle: "none", padding: "3px 0" }}>
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{ fontSize: 14, lineHeight: "20px", flexShrink: 0, color: "var(--color-on-surface-variant)" }}
      >
        chevron_right
      </span>
      <span className="font-body-md" style={{ lineHeight: 1.6 }}>{text}</span>
      {value !== undefined && (
        <span className="font-numeric-mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{value}</span>
      )}
    </li>
  );
}

/**
 * Why ASSAY reached this state, as a chain, above every field table on the
 * page.
 *
 * **The page had all of this and none of it read as an argument.** The
 * certificate's reason was a value inside "Ambiguity Metrics", the gap and ε
 * were two tiles beside each other, and a reviewer had to know what ε *is*
 * before the pair meant anything. Read top to bottom, this is the same four
 * fields as the sentence they already were: there are two admissible
 * candidates, both clear every shared constraint, the evidence separating them
 * is smaller than the tolerance, therefore the engine declined to choose.
 *
 * **No financial logic is computed here.** Every line renders one field of the
 * sealed record — `decision.state`, `certificate.reason`,
 * `shared_hard_constraints.length`, `evidence_score_gap_bps`, `epsilon_bps` —
 * and the count of candidates is the certificate's own shape: §13 carries
 * exactly `solution_a` and `solution_b`. The concluding line restates
 * `decision.state`; it does not derive it, and it is never shown for a state
 * the record does not carry.
 *
 * Exported so each branch is assertable from a decision value alone.
 */
export function DecisionVerdict({
  decision, cert,
}: {
  decision: DecisionEvidence;
  cert: AmbiguityCertificate | null;
}): React.ReactElement {
  const abstained = decision.state === "ABSTAINED";
  const accent = abstained
    ? "var(--color-abstained)"
    : decision.state === "EXCEPTION"
      ? "var(--color-exception)"
      : "var(--color-reconciled)";

  const heading = abstained
    ? "Why ASSAY abstained"
    : decision.state === "EXCEPTION"
      ? "Why this is an exception"
      : "Why ASSAY reconciled this";

  return (
    <section
      className="card"
      style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)", borderLeft: `4px solid ${accent}` }}
      aria-labelledby="decision-verdict-heading"
    >
      <h2 id="decision-verdict-heading" className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
        {heading}
      </h2>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
        <span className="font-headline-sm" style={{ color: accent }}>{decision.state}</span>
        {cert !== null && <span className="cell-id" style={{ fontSize: 11 }}>{cert.reason}</span>}
        {cert === null && decision.exception_class !== null && (
          <span className="cell-id" style={{ fontSize: 11 }}>{decision.exception_class}</span>
        )}
      </div>

      <ul style={{ margin: 0, padding: 0 }}>
        {cert !== null ? (
          <>
            <ReasonLine text="Two admissible allocation candidates — A and B" />
            <ReasonLine
              text={`Both satisfy all ${String(cert.shared_hard_constraints.length)} shared hard constraints`}
            />
            <ReasonLine text="Evidence gap" value={`${String(cert.evidence_score_gap_bps)} bps`} />
            <ReasonLine text="Tolerance ε" value={`${String(cert.epsilon_bps)} bps`} />
            <ReasonLine text="Amount at stake" value={formatPaise(cert.materiality_paise)} />
            <ReasonLine text="Materiality floor τ" value={formatPaise(cert.tau_paise)} />
          </>
        ) : abstained ? (
          <ReasonLine text="No certificate is attached to this decision, so no candidate comparison is on record." />
        ) : decision.state === "EXCEPTION" ? (
          <>
            <ReasonLine
              text={`Exception class ${decision.exception_class ?? "not recorded"} — no allocation was admissible`}
            />
            <ReasonLine
              text={
                decision.suspense_key !== null
                  ? "A Suspense item was opened, so the value is inside the close arithmetic."
                  : "No Suspense item was opened, so this record is outside the close arithmetic."
              }
            />
          </>
        ) : (
          <ReasonLine text="An allocation satisfied every hard constraint and the evidence selected it." />
        )}
      </ul>

      <p className="font-body-md" style={{ fontWeight: 600, marginTop: "var(--space-md)", lineHeight: 1.6 }}>
        {abstained
          ? "Therefore ASSAY abstained — it declined to choose rather than guess."
          : decision.state === "EXCEPTION"
            ? "Therefore ASSAY recorded an exception rather than post a settlement it could not justify."
            : "Therefore ASSAY posted the allocation."}
      </p>
      {decision.suspense_key !== null && (
        <p className="font-body-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6, maxWidth: 720 }}>
          {UNRESOLVED_MEANING}
        </p>
      )}
    </section>
  );
}

export function EvidenceTrail(): React.ReactElement {
  const navigate = useNavigate();
  const { run, close, selectedDecisionId } = useRun();
  const gate = useRunGate();
  const detail = useDecisionDetail(run?.run_id ?? null, selectedDecisionId);

  // Restoring / not-found / API-unreachable, before "select a decision": on a
  // reload the pointer is still outstanding, and this page's own empty state
  // would render over a run that is about to be restored.
  if (gate !== null) return gate;

  // No decision selected
  if (!selectedDecisionId || !run) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
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
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (detail.error !== null || !detail.data) {
    // Classified rather than printed. `useDecisionDetail` has no refetch, so
    // there is no Retry to offer here that would mean anything — the way back
    // is the queue, and it is the one control shown.
    return (
      <ApiErrorNotice
        error={detail.error ?? "Decision not found"}
        title="This decision's evidence could not be loaded"
      >
        <button className="btn btn-secondary" onClick={() => void navigate("/investigation-queue")}>
          Back to Queue
        </button>
      </ApiErrorNotice>
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
    <div className="page">
      {/* Back nav */}
      <button
        className="btn btn-ghost"
        style={{ marginBottom: "var(--space-md)", padding: 0, fontSize: 13 }}
        onClick={() => void navigate("/investigation-queue")}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Investigation Queue
      </button>

      {/* Header. The entity, the amount and the state — plus the case this
          page belongs to, which it never used to say: a reviewer arriving here
          from a queue row saw a decision id and no indication of which run,
          which period, or which investigation it was part of. */}
      <div className="page-header" style={{ padding: 0, marginBottom: "var(--space-lg)" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ marginBottom: "var(--space-xs)" }}>Evidence Trail</h1>
          <p className="cell-id" style={{ fontSize: 13 }}>{decision.entity_id}</p>
          <p className="font-body-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
            One observation from the Investigation Queue, in period{" "}
            <span className="cell-id" style={{ fontSize: 11 }}>{run.dataset}</span> &mdash; the
            evidence ASSAY decided on, and the ledger event that sealed it.
          </p>
        </div>
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

      {/* The causal story, before any field table. */}
      <DecisionVerdict decision={decision} cert={cert} />

      <div className="split">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)", minWidth: 0 }}>

          {/* Decision summary */}
          <section>
            <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>info</span>
              Decision Summary
            </h2>
            <div className="card" style={{ padding: "var(--space-lg)" }}>
              <div className="grid grid-2">
                <CopyId label="Decision ID" value={decision.decision_id} head={14} tail={8} />
                <CopyId label="Observation" value={decision.obs_id} />
                <div>
                  <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Kind</p>
                  <p className="font-body-sm">{decision.kind}</p>
                </div>
                {decision.comp_id !== null ? (
                  <CopyId label="Component" value={decision.comp_id} head={12} tail={6} />
                ) : (
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Component</p>
                    <p className="font-body-sm">--</p>
                  </div>
                )}
                {decision.exception_class && (
                  <div>
                    <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Exception Class</p>
                    <p className="font-body-sm" style={{ color: "var(--color-exception)" }}>{decision.exception_class}</p>
                  </div>
                )}
                {decision.suspense_key && (
                  <CopyId label="Suspense Key" value={decision.suspense_key} />
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
              <div className="scroll-x">
                <table className="data-table" style={{ minWidth: 520 }}>
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
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {jl.dr_paise > 0 ? formatPaise(jl.dr_paise) : "--"}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {jl.cr_paise > 0 ? formatPaise(jl.cr_paise) : "--"}
                        </td>
                        <td className="cell-id">{jl.source_entity_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Constraint evaluation (if certificate present). The verdict is the
              headline; the eight rows are one disclosure below it, exactly as
              on the certificate page — a reviewer needs "8 of 8, both
              solutions" at a glance, and the individual ids when they are
              checking rather than reading. */}
          {cert && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>rule</span>
                Shared Hard Constraints
              </h2>
              <div className="card" style={{ padding: "var(--space-md)" }}>
                <p className="font-body-md" style={{ fontWeight: 600, marginBottom: "var(--space-sm)" }}>
                  {cert.shared_hard_constraints.length} / {cert.shared_hard_constraints.length} hard
                  constraints satisfied &mdash; by both Solution A and Solution B.
                </p>
                <details>
                  <summary className="font-body-sm text-muted" style={{ cursor: "pointer", marginBottom: "var(--space-sm)" }}>
                    Show each constraint
                  </summary>
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
                </details>
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
                <div className="grid grid-2">
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
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)", minWidth: 0 }}>

          {/* The accounting consequence. "Ledger Event" read as an application
              log line; it is the posting the deterministic decision caused,
              sealed into the chain. The order inside the card is decision →
              consequence → verification metadata: what was posted first, the
              hashes that make it checkable last. */}
          {event && (
            <section>
              <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-xs)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>history_edu</span>
                {LEDGER_EVENT_HEADING}
              </h2>
              <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)", lineHeight: 1.6 }}>
                {LEDGER_EVENT_BASIS}
              </p>
              <div className="card" style={{ padding: "var(--space-lg)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                    <span className="font-label-caps text-muted">Posted as</span>
                    <span className="font-headline-sm">{event.kind}</span>
                    <span className="font-body-sm text-muted">sequence #{event.seq}</span>
                  </div>
                  <CopyId label="Event ID" value={event.evt_id} head={16} tail={8} />
                  <div className="grid grid-2">
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
                    <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
                      Verification metadata
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                      <CopyId label="Event Hash" value={event.hash} head={20} tail={8} fontSize={10} />
                      <CopyId label="Previous Hash" value={event.prev_hash} head={20} tail={8} fontSize={10} />
                      <CopyId label="Inputs Hash" value={event.inputs_hash} head={20} tail={8} fontSize={10} />
                    </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
                  <span className="font-body-sm">Period</span>
                  <span className="font-headline-sm" style={{
                    color: close.period_status === "CLOSED" ? "var(--color-reconciled)" :
                           close.period_status === "BLOCKED" ? "var(--color-exception)" :
                           "var(--color-abstained)",
                  }}>{close.period_status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
                  <span className="font-body-sm text-muted">Unresolved</span>
                  <span className="font-numeric-mono">{formatPaise(close.unresolved_value_paise)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", marginBottom: "var(--space-sm)" }}>
                  <span className="font-body-sm text-muted">Suspense</span>
                  <span className="font-numeric-mono">{formatPaise(close.suspense_balance_paise)}</span>
                </div>
                <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-outline-variant)" }}>
                  <CopyId label="Ledger Root" value={close.ledger_root_hash} head={20} tail={8} fontSize={10} />
                </div>
              </div>
            </section>
          )}

          {/* AI explanation — the real interaction, over the same verified
              DecisionEvidence this page is already rendering. */}
          <AiExplanation
            decisionId={decision.decision_id}
            deterministicState={decision.state}
            certificateUsed={decision.certificate !== null}
          />

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
                Reason: {cert.reason.replace(/_/g, " ").toLowerCase()}. The certificate is the
                formal record of this same decision.
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
