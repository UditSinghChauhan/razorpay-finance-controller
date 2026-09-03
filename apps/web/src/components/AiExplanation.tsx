import { useRun } from "../context/RunContext.js";
import {
  useExplainDecision,
  type ExplanationResponse,
  type GroundingCheckOutcome,
} from "../hooks/useAssayApi.js";

/**
 * "Explain with AI" - the grounded explanation panel.
 *
 * **Subordinate by construction, not by convention.** The deterministic verdict
 * is the page's hero; this panel is a bordered section beneath it, in the
 * secondary indigo rather than the abstention amber, with no display-metric
 * type and no rupee figure of its own. Every quantity on screen is still read
 * from the certificate above it. The one line here that names the outcome names
 * it from `grounding.deterministic_state`, which apps/api reads off the sealed
 * DecisionEvidence -- so even the AI panel's own header states ASSAY's verdict
 * rather than the model's.
 *
 * **What it will not do.** It shows only the four explanation fields. It never
 * renders a prompt (it is never sent one), never presents model prose as
 * system evidence, and on every failure path it says what failed and leaves the
 * certificate exactly where it was.
 */

/** One line of the grounding indicator. */
function GroundingLine({
  ok, label, detail,
}: { ok: boolean; label: string; detail?: string }): React.ReactElement {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 6, listStyle: "none" }}>
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{
          fontSize: 14, lineHeight: "18px", flexShrink: 0,
          color: ok ? "var(--color-reconciled)" : "var(--color-exception)",
        }}
      >
        {ok ? "check_circle" : "cancel"}
      </span>
      <span className="font-body-sm" style={{ fontSize: 11, lineHeight: "18px" }}>
        {label}
        {detail !== undefined && (
          <span className="text-muted" style={{ fontSize: 11 }}> &mdash; {detail}</span>
        )}
      </span>
    </li>
  );
}

function checkLabel(outcome: GroundingCheckOutcome): string {
  return outcome === "pass" ? "passed" : outcome === "fail" ? "failed" : "not reached";
}

/** The design system's badge for one of §L.1 rule 5's terminal states. */
function stateBadge(state: string): string {
  if (state === "RECONCILED") return "badge badge-reconciled";
  if (state === "EXCEPTION") return "badge badge-exception";
  if (state === "ABSTAINED") return "badge badge-abstained";
  return "badge badge-open";
}

/** The panel's shell: the label, the subtitle, and whatever body it is given. */
function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <section aria-labelledby="ai-explanation-heading">
      <h2
        id="ai-explanation-heading"
        className="font-headline-sm"
        style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: "var(--space-sm)" }}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: "var(--color-secondary)" }}>
          auto_awesome
        </span>
        AI explanation
      </h2>
      <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)", fontSize: 12 }}>
        Grounded in ASSAY evidence
      </p>
      <div
        style={{
          border: "1px solid var(--color-outline-variant)",
          borderLeft: "3px solid var(--color-secondary)",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface-container-lowest)",
          padding: "var(--space-lg)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

/** The idle state: one button, and a sentence about what it will and will not do. */
export function AiExplanationPrompt({
  onExplain, disabled,
}: { onExplain: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <Shell>
      <p className="font-body-sm text-muted" style={{ marginBottom: "var(--space-md)", maxWidth: 620 }}>
        ASSAY has already made this decision. An AI explanation reads the verified evidence
        on this page and puts it in plain language. It has no authority over the outcome and
        cannot change the certificate, the ledger or any amount.
      </p>
      <button
        className="btn btn-secondary"
        onClick={onExplain}
        disabled={disabled ?? false}
        style={{ borderColor: "var(--color-secondary)", color: "var(--color-secondary)" }}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>auto_awesome</span>
        Explain with AI
      </button>
    </Shell>
  );
}

/** The loading state. */
export function AiExplanationLoading(): React.ReactElement {
  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        <div className="loading-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
        <div>
          <p className="font-body-md" style={{ fontWeight: 500 }}>Reading the verified evidence&hellip;</p>
          <p className="font-body-sm text-muted" style={{ fontSize: 11 }}>
            The decision is already final. This step only writes it up.
          </p>
        </div>
      </div>
      {/* Skeleton lines, so the panel keeps its height and the page does not jump. */}
      <div style={{ marginTop: "var(--space-lg)", display: "flex", flexDirection: "column", gap: 8 }}>
        {[92, 78, 85].map((width) => (
          <div
            key={width}
            aria-hidden="true"
            style={{
              height: 10, width: `${String(width)}%`, borderRadius: 999,
              background: "var(--color-surface-container)",
            }}
          />
        ))}
      </div>
    </Shell>
  );
}

/**
 * The result state - success, refusal or unavailability, from one response.
 *
 * Exported so every branch is directly assertable without a live API or a
 * provider.
 */
export function AiExplanationResult({
  response, onRetry,
}: { response: ExplanationResponse; onRetry?: () => void }): React.ReactElement {
  const { grounding, explanation, provider, failure, status } = response;

  return (
    <Shell>
      {/* ASSAY's verdict, restated at the top of the AI panel from the
          deterministic field -- so the panel can never read as the model's
          own conclusion, whatever the prose below says. */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-sm)",
          paddingBottom: "var(--space-md)", marginBottom: "var(--space-md)",
          borderBottom: "1px solid var(--color-outline-variant)",
        }}
      >
        <span className="font-label-caps text-muted" style={{ fontSize: 10 }}>
          Explaining ASSAY&apos;s decision
        </span>
        <span className={stateBadge(grounding.deterministic_state)} style={{ fontSize: 11, fontWeight: 700 }}>
          {grounding.deterministic_state}
        </span>
        <span className="font-body-sm text-muted" style={{ fontSize: 11 }}>
          decided deterministically &mdash; not by the model
        </span>
      </div>

      {status === "ok" && explanation !== null ? (
        <div>
          <p className="font-body-md" style={{ marginBottom: "var(--space-md)", lineHeight: 1.6 }}>
            {explanation.summary}
          </p>

          <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>Why</p>
          <ul style={{ margin: 0, marginBottom: "var(--space-lg)", paddingLeft: 18 }}>
            {explanation.why.map((point) => (
              <li key={point} className="font-body-sm" style={{ marginBottom: 6, lineHeight: 1.6 }}>
                {point}
              </li>
            ))}
          </ul>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Risk while unresolved</p>
              <p className="font-body-sm" style={{ lineHeight: 1.6 }}>{explanation.risk}</p>
            </div>
            <div>
              <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Suggested next step</p>
              <p className="font-body-sm" style={{ lineHeight: 1.6 }}>{explanation.next_step}</p>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex", gap: "var(--space-sm)", alignItems: "flex-start",
            padding: "var(--space-md)",
            background: status === "rejected" ? "var(--color-verified-bg)" : "var(--color-open-bg)",
            border: `1px solid ${status === "rejected" ? "var(--color-verified)" : "var(--color-outline-variant)"}`,
            borderRadius: "var(--radius-md)",
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{
              fontSize: 18, marginTop: 2, flexShrink: 0,
              color: status === "rejected" ? "var(--color-verified)" : "var(--color-open)",
            }}
          >
            {status === "rejected" ? "shield" : "cloud_off"}
          </span>
          <div>
            <p className="font-body-md" style={{ fontWeight: 600, marginBottom: 4 }}>
              {status === "rejected"
                ? "The draft explanation was discarded"
                : "No AI explanation is available"}
            </p>
            <p className="font-body-sm" style={{ lineHeight: 1.6 }}>
              {failure?.message ?? "The explanation service did not answer."}
            </p>
            <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontSize: 11 }}>
              ASSAY&apos;s decision, its certificate and the ledger are unchanged. Everything
              shown on this page is the deterministic engine&apos;s evidence and is unaffected.
            </p>
            {onRetry !== undefined && (
              <button
                className="btn btn-ghost"
                onClick={onRetry}
                style={{ marginTop: "var(--space-sm)", padding: 0, fontSize: 12 }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>refresh</span>
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grounding indicator. Always shown, in every branch: it is the record of
          what was checked, and a check that only appears when it passes is not
          a control anyone can see working. */}
      <div
        style={{
          marginTop: "var(--space-lg)", paddingTop: "var(--space-md)",
          borderTop: "1px solid var(--color-outline-variant)",
        }}
      >
        <ul style={{ margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}>
          <GroundingLine ok={grounding.decision_evidence_verified} label="Decision evidence verified" />
          <GroundingLine
            ok={grounding.certificate_used}
            label={grounding.certificate_used ? "Certificate used" : "No certificate on this decision"}
          />
          <GroundingLine ok label="No decision authority" />
        </ul>
        <p className="font-body-sm text-muted" style={{ marginTop: "var(--space-sm)", fontSize: 10, lineHeight: 1.7 }}>
          Checks &mdash; schema {checkLabel(grounding.checks.schema)}, identifiers{" "}
          {checkLabel(grounding.checks.allowlist)}, figures {checkLabel(grounding.checks.numerals)}.
          {grounding.rejected_numerals.length > 0 && (
            <> Discarded ungrounded figures: {grounding.rejected_numerals.join(", ")}.</>
          )}
          {grounding.rejected_entity_ids.length > 0 && (
            <> Discarded unknown identifiers: {grounding.rejected_entity_ids.join(", ")}.</>
          )}
          {provider !== null && (
            <>
              {" "}Model {provider.model_id} via {provider.provider}, grounded against{" "}
              {String(grounding.evidence_item_count)} verified evidence items.
            </>
          )}
          {grounding.system_prompt_id !== null && (
            <> Prompt {grounding.system_prompt_id} ({grounding.system_prompt_hash.slice(0, 12)}).</>
          )}
        </p>
      </div>
    </Shell>
  );
}

/**
 * The panel, wired to the run in context.
 *
 * `deterministicState` and `certificateUsed` are passed in from the page, which
 * read them off the DecisionEvidence apps/api served. They are here for the one
 * branch where the API itself is unreachable and there is no response to read
 * them from -- and a component that filled that gap with a hardcoded
 * "ABSTAINED" would be the frontend inventing a decision, which is the exact
 * failure the whole feature exists to prevent.
 */
export function AiExplanation({
  decisionId, deterministicState, certificateUsed,
}: {
  decisionId: string;
  deterministicState: string;
  certificateUsed: boolean;
}): React.ReactElement {
  const { run } = useRun();
  const { explain, reset, state } = useExplainDecision();

  if (state.loading) return <AiExplanationLoading />;

  if (state.error !== null) {
    return (
      <AiExplanationResult
        response={{
          run_id: run?.run_id ?? "",
          decision_id: decisionId,
          audience: "analyst",
          status: "unavailable",
          explanation: null,
          provider: null,
          grounding: {
            decision_evidence_verified: true,
            certificate_used: certificateUsed,
            decision_authority: "none",
            deterministic_state: deterministicState,
            checks: { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" },
            rejected_entity_ids: [],
            rejected_numerals: [],
            system_prompt_id: null,
            system_prompt_hash: "",
            input_hash: "",
            cache_key: "",
            evidence_item_count: 0,
          },
          failure: {
            code: "API_UNREACHABLE",
            message: `The ASSAY API did not answer this request (${state.error}).`,
          },
        }}
        onRetry={reset}
      />
    );
  }

  if (state.data !== null) return <AiExplanationResult response={state.data} onRetry={reset} />;

  return (
    <AiExplanationPrompt
      disabled={run === null}
      onExplain={() => {
        if (run !== null) void explain(run.run_id, decisionId);
      }}
    />
  );
}
