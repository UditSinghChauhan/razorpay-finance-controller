import { useNavigate } from "react-router-dom";
import { AiExplanation } from "../components/AiExplanation.js";
import { useRun } from "../context/RunContext.js";
import {
  useDecisionDetail,
  type AllocationMember,
  type AllocationSolution,
  type CertificateSolution,
} from "../hooks/useAssayApi.js";
import { probeSummary } from "../lib/copy.js";
import { formatPaise } from "../lib/format.js";

/**
 * Ambiguity Certificate - ASSAY Reconciliation Intelligence.
 *
 * Visual source of truth: Stitch screen ae0661c3d7c84e51ae8263e7b3681dc0
 * Design system v2: Indigo secondary, display-metric, w-72 nav.
 *
 * THIS IS THE PRIMARY HERO SCREEN.
 *
 * Renders the REAL certificate from GET /runs/:id/decisions/:decision_id.
 * All values come from the certificate object: solution_a, solution_b,
 * shared_hard_constraints, evidence_score_gap_bps, epsilon_bps,
 * materiality_paise, tau_paise, probes_attempted, reason.
 *
 * Member amounts come from that same response's `certificate_allocation`, the
 * product read model apps/api derives from the run's own observations. The
 * certificate itself prices no member and §17.1.1's journal lines are
 * settlement-level, so there is no member amount anywhere on the sealed record;
 * where the read model has none either, the member is shown WITHOUT an amount
 * rather than with an invented one.
 *
 * materiality_paise and tau_paise are integer paise (packages/ledger types both
 * `Paise`), so both go through formatPaise unscaled like every other _paise
 * field here. On the demo certificate that is ₹590.00 against ₹204.13.
 *
 * Visually communicates that abstention is a deliberate safety decision.
 *
 * The AI explanation sits BELOW the hypothesis comparison, the shared
 * constraints, the evidence scores and the probes -- after every piece of
 * deterministic evidence, not in place of any of it. Nothing it renders is read
 * from the model: the amounts, the constraints, the gap, epsilon, materiality
 * and tau above it all come from the certificate, and the state inside the
 * panel comes from the DecisionEvidence apps/api served. See
 * components/AiExplanation.tsx.
 */

/** A technical identifier, rendered subordinate to the content it labels. */
function TechnicalId({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ marginBottom: "var(--space-md)" }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: 2, fontSize: 10 }}>{label}</p>
      <p className="cell-id text-muted" style={{ fontSize: 10, wordBreak: "break-all", lineHeight: 1.5 }}>
        {value}
      </p>
    </div>
  );
}

/**
 * One of DATA_MODEL.md §13's two allocations.
 *
 * `solution` is the sealed record — `candidate_id` and `member_obs_ids`, the
 * field the certificate actually carries. `allocation` is apps/api's read model
 * for the same solution; when it is absent, or when a member has no
 * `allocation_paise`, the row renders the member id alone. The total is the sum
 * of the rows this card DISPLAYS, and it is shown only when every one of them
 * is priced — a partial total beside a target would read as a failed tie-out.
 *
 * Exported so its rendering is directly assertable without a live API.
 */
export function SolutionCard({
  label, solution, allocation, targetPaise, color,
}: {
  label: string;
  solution: CertificateSolution;
  allocation: AllocationSolution | null;
  targetPaise: number | null;
  color: string;
}): React.ReactElement {
  const priced = new Map<string, AllocationMember>(
    (allocation?.members ?? []).map((m) => [m.obs_id, m]),
  );
  const rows = solution.member_obs_ids.map((id) => ({
    obs_id: id,
    member: priced.get(id) ?? null,
  }));
  const allPriced =
    rows.length > 0 && rows.every((r) => r.member !== null && r.member.allocation_paise !== null);
  const total = allPriced
    ? rows.reduce((sum, r) => sum + (r.member?.allocation_paise ?? 0), 0)
    : null;
  const tiesOut = total !== null && targetPaise !== null && total === targetPaise;

  return (
    <div style={{
      flex: 1,
      border: `1px solid var(--color-outline-variant)`,
      borderTop: `3px solid ${color}`,
      borderRadius: "var(--radius-lg)",
      background: "var(--color-surface-container-lowest)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "var(--space-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: color, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 700,
          }}>
            {label.slice(-1)}
          </div>
          <span className="font-headline-sm">{label}</span>
        </div>

        <TechnicalId label="Candidate ID" value={solution.candidate_id} />

        <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
          Member Allocation
        </p>
        {rows.length === 0 && (
          <p className="font-body-sm text-muted">This solution names no members.</p>
        )}
        {rows.map((row, i) => (
          <div
            key={row.obs_id}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              gap: "var(--space-md)", padding: "var(--space-xs) 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--color-outline-variant)" : "none",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span className="cell-id" style={{ fontSize: 11 }}>{row.obs_id}</span>
              {row.member?.value_paise != null &&
                row.member.allocation_paise != null &&
                row.member.value_paise !== row.member.allocation_paise && (
                  <p className="font-body-sm text-muted" style={{ fontSize: 10, marginTop: 2 }}>
                    gross {formatPaise(row.member.value_paise)}
                  </p>
                )}
            </div>
            <span className="font-numeric-mono" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
              {row.member?.allocation_paise != null
                ? formatPaise(row.member.allocation_paise)
                : "\u2014"}
            </span>
          </div>
        ))}

        <div style={{
          marginTop: "var(--space-md)", paddingTop: "var(--space-sm)",
          borderTop: "2px solid var(--color-outline-variant)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="font-body-sm" style={{ fontWeight: 600 }}>Total allocated</span>
            <span className="font-numeric-mono" style={{ fontWeight: 700 }}>
              {total !== null ? formatPaise(total) : "\u2014"}
            </span>
          </div>
          {targetPaise !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
              <span className="font-body-sm text-muted">Target</span>
              <span className="font-numeric-mono text-muted">{formatPaise(targetPaise)}</span>
            </div>
          )}
          {tiesOut && (
            <p
              className="font-body-sm"
              style={{ marginTop: "var(--space-xs)", color: "var(--color-reconciled)", fontWeight: 600 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }}>check_circle</span>
              Reconciles to target
            </p>
          )}
          {total === null && (
            <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-xs)", fontSize: 11 }}>
              Member amounts are not available for this run.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AmbiguityCertificate(): React.ReactElement {
  const navigate = useNavigate();
  const { run, close, selectedDecisionId } = useRun();
  const detail = useDecisionDetail(run?.run_id ?? null, selectedDecisionId);

  // No decision selected
  if (!selectedDecisionId || !run) {
    return (
      <div style={{ padding: "var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-abstained)" }}>workspace_premium</span>
        <h1 className="page-title">Ambiguity Certificate</h1>
        <p className="page-subtitle">Select an abstained decision from the Investigation Queue to view its certificate.</p>
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
      </div>
    );
  }

  const { decision, event, certificate_allocation: allocation } = detail.data;
  const cert = decision.certificate;
  // The figure both allocations tie out against, from the run's own abstained
  // target row. Absent rather than guessed when the read model has no target.
  const targetPaise = allocation?.target?.value_paise ?? null;

  if (!cert) {
    return (
      <div style={{ padding: "var(--space-xl)", textAlign: "center" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--color-outline)" }}>workspace_premium</span>
        <h1 className="page-title" style={{ marginTop: "var(--space-md)" }}>No Certificate</h1>
        <p className="page-subtitle">This decision does not have an ambiguity certificate.</p>
        <button className="btn btn-secondary" style={{ marginTop: "var(--space-lg)" }} onClick={() => void navigate("/evidence-trail")}>
          View Evidence Trail
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-lg)", maxWidth: 1200, margin: "0 auto" }}>

      {/* Back nav */}
      <button
        className="btn btn-ghost"
        style={{ marginBottom: "var(--space-md)", padding: 0, fontSize: 13 }}
        onClick={() => void navigate("/evidence-trail")}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Evidence Trail
      </button>

      {/* Hero header */}
      <div style={{
        background: "linear-gradient(135deg, var(--color-surface-container-lowest) 0%, var(--color-abstained-bg) 100%)",
        border: "1px solid var(--color-abstained)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-xl)",
        marginBottom: "var(--space-xl)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -20, right: -20,
          opacity: 0.06, pointerEvents: "none",
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 200, color: "var(--color-abstained)" }}>workspace_premium</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 24 }}>workspace_premium</span>
          <span className="font-label-caps" style={{ color: "var(--color-abstained)", fontSize: 13 }}>AMBIGUITY CERTIFICATE</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <p className="font-display-metric" style={{ fontSize: 36, marginBottom: "var(--space-xs)" }}>{formatPaise(decision.value_paise)}</p>
            <p className="font-body-md" style={{ color: "var(--color-on-surface-variant)" }}>{decision.entity_id}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 16px", borderRadius: 4,
              background: "var(--color-abstained-bg)",
              border: "1px solid var(--color-abstained)",
              fontWeight: 700, fontSize: 13, letterSpacing: "0.05em",
              color: "var(--color-abstained)",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>pause_circle</span>
              ASSAY ABSTAINED
            </div>
            <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-xs)" }}>
              Reason: {cert.reason.replace(/_/g, " ")}
            </p>
          </div>
        </div>
      </div>

      {/* Hypothesis comparison */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>compare</span>
          Hypothesis Comparison - All Constraints Satisfied
        </h2>
        <div style={{ display: "flex", gap: "var(--space-md)" }}>
          <SolutionCard
            label="Solution A"
            solution={cert.solution_a}
            allocation={allocation?.solution_a ?? null}
            targetPaise={targetPaise}
            color="var(--color-secondary)"
          />
          <SolutionCard
            label="Solution B"
            solution={cert.solution_b}
            allocation={allocation?.solution_b ?? null}
            targetPaise={targetPaise}
            color="var(--color-abstained)"
          />
        </div>
        <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)" }}>
          Member amounts are each line&apos;s allocation term &mdash; credit less debit, the
          quantity constraint C6 ties out against the target. The queue ranks the same
          rows by <code style={{ fontSize: 11 }}>value(observation)</code>, which is gross of
          fee and tax; that figure is shown beneath a member id where the two differ.
        </p>
      </section>

      {/* Shared constraints */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>rule</span>
          Shared Hard Constraints ({cert.shared_hard_constraints.length})
        </h2>
        <div className="card" style={{ padding: 0 }}>
          {cert.shared_hard_constraints.map((c, i) => (
            <div
              key={c}
              style={{
                display: "flex", alignItems: "center", gap: "var(--space-md)",
                padding: "var(--space-sm) var(--space-md)",
                borderBottom: i < cert.shared_hard_constraints.length - 1 ? "1px solid var(--color-outline-variant)" : "none",
              }}
            >
              <span className="constraint-id">{c}</span>
              <span className="font-body-sm" style={{ flex: 1 }}>{c}</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                color: "var(--color-reconciled)", background: "var(--color-reconciled-bg)",
              }}>Both satisfy</span>
            </div>
          ))}
        </div>
      </section>

      {/* Evidence comparison */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>analytics</span>
          Evidence Score Comparison
        </h2>
        <div className="card" style={{ padding: "var(--space-lg)" }}>
          {/* Score bar visualization */}
          <div style={{ marginBottom: "var(--space-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
              <span className="font-label-caps text-muted">Solution A</span>
              <span className="font-label-caps text-muted">Solution B</span>
            </div>
            <div style={{ position: "relative", height: 40, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                <div style={{ flex: 1, background: "var(--color-secondary)", opacity: 0.2 }} />
                <div style={{ flex: 1, background: "var(--color-abstained)", opacity: 0.2 }} />
              </div>
              <div style={{
                position: "absolute", left: "50%", top: 0, bottom: 0, width: 2,
                background: "var(--color-on-surface)", transform: "translateX(-1px)",
              }} />
              <div style={{
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
                background: "var(--color-surface-container-lowest)", padding: "4px 12px",
                borderRadius: 4, border: "1px solid var(--color-outline-variant)",
                fontWeight: 700, fontSize: 13,
              }}>
                Gap: {cert.evidence_score_gap_bps} bps
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "var(--space-lg)" }}>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Evidence Gap</p>
              <p className="font-numeric-mono" style={{ fontSize: 20, fontWeight: 600 }}>{cert.evidence_score_gap_bps} bps</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Epsilon (e)</p>
              <p className="font-numeric-mono" style={{ fontSize: 20, fontWeight: 600 }}>{cert.epsilon_bps} bps</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Materiality</p>
              <p className="font-numeric-mono" style={{ fontSize: 20, fontWeight: 600 }}>{formatPaise(cert.materiality_paise)}</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Tau (t)</p>
              <p className="font-numeric-mono" style={{ fontSize: 20, fontWeight: 600 }}>{formatPaise(cert.tau_paise)}</p>
            </div>
          </div>

          {/* Gap interpretation */}
          {cert.evidence_score_gap_bps <= cert.epsilon_bps && (
            <div style={{
              marginTop: "var(--space-lg)", padding: "var(--space-md)",
              background: "var(--color-abstained-bg)", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-abstained)",
              display: "flex", gap: "var(--space-sm)", alignItems: "flex-start",
            }}>
              <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 18, marginTop: 2, flexShrink: 0 }}>info</span>
              <p className="font-body-sm">
                <strong>Evidence gap ({cert.evidence_score_gap_bps} bps) is within epsilon ({cert.epsilon_bps} bps).</strong>{" "}
                No hypothesis has a decisive advantage. Abstention is the correct safety response.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Probes attempted */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>search</span>
          Probes Attempted ({cert.probes_attempted.length})
        </h2>
        <div className="card" style={{ padding: "var(--space-lg)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            {cert.probes_attempted.map((probeId, i) => (
              <div
                key={probeId}
                style={{
                  display: "flex", gap: "var(--space-md)", alignItems: "center",
                  padding: "var(--space-md)",
                  background: "var(--color-surface-container-low)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-outline-variant)",
                }}
              >
                <div style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: "50%",
                  background: "var(--color-exception-bg)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--color-exception)" }}>close</span>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700 }}>Probe {i + 1}</span>
                  <p className="cell-id" style={{ fontSize: 11, marginTop: 2 }}>{probeId}</p>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 600,
                  color: "var(--color-exception)", background: "var(--color-exception-bg)",
                  padding: "2px 8px", borderRadius: 999,
                }}>NO DISCRIMINATOR</span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: cert.probes_attempted.length > 0 ? "var(--space-lg)" : 0,
            padding: "var(--space-md)",
            background: "var(--color-abstained-bg)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-abstained)",
            display: "flex", gap: "var(--space-sm)", alignItems: "flex-start",
          }}>
            <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 18, marginTop: 2, flexShrink: 0 }}>info</span>
            <p className="font-body-sm">
              <strong>{probeSummary(cert.probes_attempted.length, cert.reason)}</strong>{" "}
              Terminal reason: <code style={{ fontSize: 11 }}>{cert.reason}</code>.
            </p>
          </div>
        </div>
      </section>

      {/* AI explanation — subordinate to every deterministic section above it,
          and to the ASSAY ABSTAINED verdict in the hero. */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <AiExplanation
          decisionId={decision.decision_id}
          deterministicState={decision.state}
          certificateUsed={decision.certificate !== null}
        />
      </section>

      {/* Cryptographic attestation */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>verified</span>
          Cryptographic Attestation
        </h2>
        <div className="certificate-block">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", marginBottom: "var(--space-lg)" }}>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Run ID</p>
              <p className="cell-id" style={{ fontSize: 12, wordBreak: "break-all" }}>{run.run_id}</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Ledger Root Hash</p>
              <p className="cell-id" style={{ fontSize: 12, wordBreak: "break-all" }}>{close?.ledger_root_hash ?? "--"}</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Component ID</p>
              <p className="cell-id" style={{ fontSize: 12 }}>{cert.comp_id}</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>LLM Mode</p>
              <p className="cell-id" style={{ fontSize: 12 }}>{run.llm_provider}</p>
            </div>
          </div>
          {event && (
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Event Hash</p>
              <div className="certificate-seal">{event.hash}</div>
            </div>
          )}
          <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-md)" }}>
            Verify with: <code style={{ fontSize: 12 }}>assay verify --run {run.run_id.substring(0, 16)}</code>
          </p>
        </div>
      </section>

      {/* Suspense disposition */}
      <section>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>account_balance</span>
          Suspense Disposition
        </h2>
        <div style={{
          background: "var(--color-surface-container-lowest)",
          border: "1px solid var(--color-outline-variant)",
          borderLeft: "4px solid var(--color-abstained)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-lg)",
        }}>
          <p className="font-body-md" style={{ marginBottom: "var(--space-sm)" }}>
            This record is posted to <strong>Suspense</strong> with the full value of <strong>{formatPaise(decision.value_paise)}</strong>.
            The period will end <code style={{ fontSize: 13 }}>{close?.period_status ?? "--"}</code> if no resolution is reached before the close gate (G3).
          </p>
          <p className="font-body-sm text-muted">
            Unresolved value is quantified in the close report. The Suspense balance is published and the
            trial balance = 0 invariant is maintained. No value is suppressed.
          </p>
          <div style={{ marginTop: "var(--space-lg)", display: "flex", gap: "var(--space-md)" }}>
            <button className="btn btn-secondary" onClick={() => void navigate("/evidence-trail")}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>receipt_long</span>
              Evidence Trail
            </button>
            <button className="btn btn-secondary" onClick={() => void navigate("/investigation-queue")}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>queue</span>
              Back to Queue
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
