import { useNavigate } from "react-router-dom";
import { AiExplanation } from "../components/AiExplanation.js";
import { CopyButton, CopyId } from "../components/CopyId.js";
import { ApiErrorNotice, useRunGate } from "../components/RunGate.js";
import { useRun } from "../context/RunContext.js";
import {
  useDecisionDetail,
  type AllocationMember,
  type AllocationSolution,
  type CertificateSolution,
} from "../hooks/useAssayApi.js";
import {
  CERTIFICATE_RELATIONSHIP,
  CERTIFICATE_VERIFY_HOW,
  CERTIFICATE_VERIFY_IDS,
  probeSectionHeading,
  probeSummary,
  VERIFY_LEDGER_TITLE,
} from "../lib/copy.js";
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
 * **{@link CertificateStory} answers the four questions the page used to make
 * a reviewer assemble themselves.** What happened, why ASSAY stopped, what
 * evidence proves it, and what happens to the money were spread across six
 * sections; the story states each in one line from the same fields those
 * sections render, and the sections below remain as the working. Nothing in it
 * is computed: it is the certificate's own reason, constraint count, gap,
 * epsilon and the close gate's period status and Suspense balance.
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
      <p className="cell-id text-muted" style={{ fontSize: 10, lineHeight: 1.5 }}>
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
      minWidth: 0,
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
          <span className="font-body-sm text-muted" style={{ marginLeft: "auto", fontSize: 11 }}>
            {rows.length} member{rows.length === 1 ? "" : "s"}
          </span>
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
                : "—"}
            </span>
          </div>
        ))}

        <div style={{
          marginTop: "var(--space-md)", paddingTop: "var(--space-sm)",
          borderTop: "2px solid var(--color-outline-variant)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-sm)" }}>
            <span className="font-body-sm" style={{ fontWeight: 600 }}>Total allocated</span>
            <span className="font-numeric-mono" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              {total !== null ? formatPaise(total) : "—"}
            </span>
          </div>
          {targetPaise !== null && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-sm)", marginTop: 2 }}>
              <span className="font-body-sm text-muted">Target</span>
              <span className="font-numeric-mono text-muted" style={{ whiteSpace: "nowrap" }}>{formatPaise(targetPaise)}</span>
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

/** One question a reviewer arrives with, and its answer from the record. */
function QA({ question, children }: { question: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="qa">
      <p className="qa-q">{question}</p>
      <div className="qa-a">{children}</div>
    </div>
  );
}

/**
 * The certificate in four questions, above the six sections that evidence it.
 *
 * **Every clause is a field.** The candidate count is §13's own shape (a
 * certificate carries exactly `solution_a` and `solution_b`); the constraint
 * count is `shared_hard_constraints.length`; the gap and ε are the
 * certificate's; the amount is `decision.value_paise`; the period status and
 * the balance verdict are the close gate's. Nothing is compared, summed or
 * concluded here that is not already stated by one of those.
 *
 * Exported so each answer is assertable without a live API.
 */
export function CertificateStory({
  reason, candidateCount, constraintCount, gapBps, epsilonBps,
  valuePaise, periodStatus, trialBalanceOk, suspenseBalancePaise,
}: {
  reason: string;
  candidateCount: number;
  constraintCount: number;
  gapBps: number;
  epsilonBps: number;
  valuePaise: number;
  periodStatus: string | null;
  trialBalanceOk: boolean | null;
  suspenseBalancePaise: number | null;
}): React.ReactElement {
  return (
    <section
      className="card"
      style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)", borderLeft: "4px solid var(--color-abstained)" }}
      aria-labelledby="certificate-story-heading"
    >
      <h2 id="certificate-story-heading" className="font-label-caps text-muted" style={{ marginBottom: "var(--space-md)" }}>
        What this certificate says
      </h2>

      <QA question="What happened?">
        {candidateCount} valid allocation hypotheses remain, and ASSAY declined to choose between them.
      </QA>

      <QA question="Why did ASSAY stop?">
        Because the evidence does not distinguish them sufficiently &mdash; terminal reason{" "}
        <code style={{ fontSize: 12 }}>{reason}</code>.
      </QA>

      <QA question="What evidence proves that?">
        Both candidates satisfy all {constraintCount} shared hard constraints, and the evidence
        gap between them is {gapBps} bps against a tolerance ε of {epsilonBps} bps. The candidate
        comparison, the constraints and the scores are all below.
      </QA>

      <QA question="What happens financially?">
        {formatPaise(valuePaise)} remains unresolved and is held in Suspense
        {suspenseBalancePaise !== null && (
          <> &mdash; the account carries {formatPaise(suspenseBalancePaise)} for this period</>
        )}
        . {trialBalanceOk === null
          ? "The close report's balance verdict is not loaded on this page."
          : trialBalanceOk
            ? "The ledger remains balanced."
            : "The close report reports the ledger NOT balanced, which is a finding in its own right."}{" "}
        {periodStatus === null
          ? "The period status is not loaded on this page."
          : `The period remains ${periodStatus}.`}{" "}
        No value is written off, suppressed or guessed.
      </QA>
    </section>
  );
}

export function AmbiguityCertificate(): React.ReactElement {
  const navigate = useNavigate();
  const { run, close, selectedDecisionId } = useRun();
  const gate = useRunGate();
  const detail = useDecisionDetail(run?.run_id ?? null, selectedDecisionId);

  // Restoring / not-found / API-unreachable, before "select a decision", for
  // the same reason as the Evidence Trail: a reload must not answer with an
  // empty state over a run the API is about to hand back.
  if (gate !== null) return gate;

  // No decision selected
  if (!selectedDecisionId || !run) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
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
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (detail.error !== null || !detail.data) {
    return (
      <ApiErrorNotice
        error={detail.error ?? "Decision not found"}
        title="This certificate could not be loaded"
      >
        <button className="btn btn-secondary" onClick={() => void navigate("/investigation-queue")}>
          Back to Queue
        </button>
      </ApiErrorNotice>
    );
  }

  const { decision, event, certificate_allocation: allocation } = detail.data;
  const cert = decision.certificate;
  // The figure both allocations tie out against, from the run's own abstained
  // target row. Absent rather than guessed when the read model has no target.
  const targetPaise = allocation?.target?.value_paise ?? null;

  if (!cert) {
    return (
      <div className="page" style={{ textAlign: "center" }}>
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
    <div className="page" style={{ maxWidth: 1200 }}>

      {/* Back nav */}
      <button
        className="btn btn-ghost"
        style={{ marginBottom: "var(--space-md)", padding: 0, fontSize: 13 }}
        onClick={() => void navigate("/evidence-trail")}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Evidence Trail
      </button>

      {/* Hero header. Flat rather than a gradient: this is a formal record, and
          the amber left rule carries the state without the decoration. */}
      <div style={{
        background: "var(--color-surface-container-lowest)",
        border: "1px solid var(--color-outline-variant)",
        borderLeft: "4px solid var(--color-abstained)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-xl)",
        marginBottom: "var(--space-lg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}>
          <span className="material-symbols-outlined" style={{ color: "var(--color-abstained)", fontSize: 24 }}>workspace_premium</span>
          <span className="font-label-caps" style={{ color: "var(--color-abstained)", fontSize: 13 }}>AMBIGUITY CERTIFICATE</span>
        </div>
        {/* What this page IS, relative to the one before it. A reviewer
            arriving from a queue row had no way to know these two screens are
            one decision seen twice. */}
        <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-lg)", lineHeight: 1.6, maxWidth: 720 }}>
          {CERTIFICATE_RELATIONSHIP}
        </p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-display-metric" style={{ fontSize: 36, marginBottom: "var(--space-xs)" }}>{formatPaise(decision.value_paise)}</p>
            <p className="font-body-md" style={{ color: "var(--color-on-surface-variant)", overflowWrap: "anywhere" }}>{decision.entity_id}</p>
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

      {/* The four questions, before the six sections that evidence them. */}
      <CertificateStory
        reason={cert.reason}
        candidateCount={2}
        constraintCount={cert.shared_hard_constraints.length}
        gapBps={cert.evidence_score_gap_bps}
        epsilonBps={cert.epsilon_bps}
        valuePaise={decision.value_paise}
        periodStatus={close?.period_status ?? null}
        trialBalanceOk={close?.trial_balance_ok ?? null}
        suspenseBalancePaise={close?.suspense_balance_paise ?? null}
      />

      {/* Hypothesis comparison */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>compare</span>
          Hypothesis Comparison - All Constraints Satisfied
        </h2>
        {/* Side by side while there is room to compare them, stacked once
            there is not — two 160px columns are not a comparison. */}
        <div className="grid grid-2">
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

      {/* Shared constraints. The verdict is the headline and the eight rows are
          one disclosure below it: "8 / 8 satisfied, by both" is the fact, and
          C1–C8 are what a reviewer opens when they are checking it rather than
          reading it. None of the rows is removed. */}
      <section style={{ marginBottom: "var(--space-xl)" }}>
        <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>rule</span>
          Shared Hard Constraints ({cert.shared_hard_constraints.length})
        </h2>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: "var(--color-reconciled)" }}>check_circle</span>
            <span className="font-headline-sm">
              {cert.shared_hard_constraints.length} / {cert.shared_hard_constraints.length} hard constraints satisfied
            </span>
            <span className="font-body-sm text-muted">&mdash; by both Solution A and Solution B</span>
          </div>
          <details style={{ marginTop: "var(--space-sm)" }}>
            <summary className="font-body-sm text-muted" style={{ cursor: "pointer" }}>
              Show each constraint
            </summary>
            <div style={{ marginTop: "var(--space-sm)" }}>
              {cert.shared_hard_constraints.map((c, i) => (
                <div
                  key={c}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--space-md)",
                    padding: "var(--space-sm) 0",
                    borderBottom: i < cert.shared_hard_constraints.length - 1 ? "1px solid var(--color-outline-variant)" : "none",
                  }}
                >
                  <span className="constraint-id">{c}</span>
                  <span className="font-body-sm" style={{ flex: 1 }}>{c}</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: "var(--color-reconciled)", background: "var(--color-reconciled-bg)",
                  }}>Both satisfy</span>
                </div>
              ))}
            </div>
          </details>
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
                fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
              }}>
                Gap: {cert.evidence_score_gap_bps} bps
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-4">
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
          {probeSectionHeading(cert.probes_attempted.length)}
        </h2>
        <div className="card" style={{ padding: "var(--space-lg)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            {cert.probes_attempted.map((probeId, i) => (
              <div
                key={probeId}
                style={{
                  display: "flex", gap: "var(--space-md)", alignItems: "center",
                  padding: "var(--space-md)", flexWrap: "wrap",
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700 }}>Probe {i + 1}</span>
                  <p className="cell-id" style={{ fontSize: 11, marginTop: 2 }}>{probeId}</p>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
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
          <div className="grid grid-2" style={{ marginBottom: "var(--space-lg)" }}>
            <CopyId label="Run ID" value={run.run_id} head={20} tail={8} fontSize={12} />
            <CopyId label="Ledger Root Hash" value={close?.ledger_root_hash ?? "--"} head={20} tail={8} fontSize={12} />
            <CopyId label="Component ID" value={cert.comp_id} head={20} tail={8} fontSize={12} />
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Engine model use</p>
              <p className="cell-id" style={{ fontSize: 12 }}>{run.llm_provider}</p>
            </div>
          </div>
          {event && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)", marginBottom: 4 }}>
                <p className="font-label-caps text-muted">Event Hash</p>
                <CopyButton value={event.hash} label="event hash" />
              </div>
              <div className="certificate-seal">{event.hash}</div>
            </div>
          )}
          <div style={{ marginTop: "var(--space-md)" }}>
            <p className="font-body-sm">{CERTIFICATE_VERIFY_HOW}</p>
            <p className="font-body-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
              {CERTIFICATE_VERIFY_IDS}
            </p>
            <button
              className="btn btn-secondary"
              style={{ marginTop: "var(--space-sm)" }}
              onClick={() => void navigate("/audit-logs")}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>verified_user</span>
              {VERIFY_LEDGER_TITLE}
            </button>
          </div>
        </div>
      </section>

      {/* Where a reviewer goes next. The financial consequence is answered in
          the story above; this is the navigation, not a second telling of it.
          Verify Ledger is deliberately NOT repeated here: it lives one section
          up, directly under the sentence that names it as the way to check
          these identifiers, and a second identical control would make the page
          look like it offered two different verifications. */}
      <div className="actions">
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
  );
}
