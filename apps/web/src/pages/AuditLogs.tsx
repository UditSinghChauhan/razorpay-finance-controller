import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CopyButton } from "../components/CopyId.js";
import { ApiErrorNotice, useRunGate } from "../components/RunGate.js";
import { useRun } from "../context/RunContext.js";
import {
  useLedgerVerify,
  type ApiState,
  type LedgerVerification,
} from "../hooks/useAssayApi.js";
import { AUDIT_SCOPE, VERIFY_LEDGER_TITLE } from "../lib/copy.js";
import { formatCount, formatPaise } from "../lib/format.js";

/**
 * Verify Ledger &mdash; `ARCHITECTURE.md §9`'s `GET /runs/:id/ledger/verify`, in
 * front of a reviewer.
 *
 * > *"Recomputes the hash chain from genesis, re-projects balances, re-checks
 * > the Suspense identity. Returns pass/fail per check."*
 *
 * > *"`/ledger/verify` exists so a reviewer can check tamper-evidence **live**
 * > rather than be told about it."*
 *
 * **What this page is, and what it deliberately is not.** It is the
 * verification of one run's chain, run on demand. It is **not** an event log,
 * and it does not pretend to be one: the endpoint returns how many events the
 * recomputation covered and nothing about any individual event, so this page
 * shows a count and points at the Evidence Trail, where one decision's own
 * event &mdash; its actor, its timestamp, its `prev_hash` &mdash; is rendered
 * from the record that actually carries them. Nothing here invents a
 * timestamp, an actor, an audit entry or a history. There is not even a "last
 * verified at" line, because the only clock available in the browser is the
 * viewer's own and a time this app read off it would sit beside ledger figures
 * looking like one of them.
 *
 * **Every figure is a passthrough of one response.** The only thing computed in
 * this file is the overall verdict, which is the conjunction of the `passed`
 * booleans the response already carries &mdash; see {@link allPassed}. No
 * rupee amount, hash, count or verdict is derived, compared or reformatted into
 * a second answer; in particular the balanced verdict is the API's
 * `trial_balance_ok`, never a comparison of the two totals performed here,
 * because a disagreement between those is a finding and this page must not be
 * a second place that finding could be decided.
 *
 * **{@link ChainVerification} is exported separately**, for the reason
 * `ControllerPanel.tsx`'s `ControllerTraceView` and `AiExplanation.tsx`'s
 * branches are: it takes the whole `ApiState` as a prop and calls no fetching
 * hook, so idle, loading, error, verified and failed are each renderable from
 * a value alone and therefore each directly assertable without a live API.
 * {@link AuditLogs} is the thin page that owns the run, the hook and the
 * button.
 */

/** How much of a 64-hex hash is shown before it is expanded. */
const HASH_PREFIX = 16;

/**
 * The overall verdict.
 *
 * The response reports each check separately and never states an aggregate, so
 * one is formed here rather than read &mdash; and it is formed the only way
 * that cannot disagree with the rows beneath it: every named check must pass.
 * An empty `checks` array is not a pass; a response that named no check has
 * verified nothing.
 */
function allPassed(verification: LedgerVerification): boolean {
  return verification.checks.length > 0 && verification.checks.every((c) => c.passed);
}

/**
 * What each named check actually did &mdash; and, for one of them, what it did
 * not do.
 *
 * The names are the route's own (`genesis_to_root`, `trial_balance`,
 * `suspense_identity`) and are rendered as well as labelled, so a reviewer
 * reading the API alongside this page sees the same three words.
 *
 * The third row is the one that matters. `apps/api/src/routes/ledger-verify.ts`
 * recomputes the first two through `verifyChain` on every request, but reports
 * the Suspense identity from the `close.gate.g3_suspense_identity` this run
 * already sealed &mdash; deliberately, because recomputing `G3` would put
 * reconciliation logic in a layer whose own header says it *"holds no
 * reconciliation logic of any kind"*. Presenting all three as equally fresh
 * would be the exact claim this page exists to make checkable.
 */
interface CheckPresentation {
  readonly label: string;
  readonly provenance: string;
  readonly detail: string;
}

const CHECK_PRESENTATION: Record<string, CheckPresentation> = {
  genesis_to_root: {
    label: "Genesis to root",
    provenance: "Recomputed by this request",
    detail:
      "Every event was re-hashed in sequence from the run's genesis hash forward, and the " +
      "root that fell out was compared with the root stored on the run.",
  },
  trial_balance: {
    label: "Trial balance",
    provenance: "Recomputed by this request",
    detail:
      "Balances were re-projected from the event log and both totals re-added, rather than " +
      "read off the close report.",
  },
  suspense_identity: {
    label: "Suspense identity",
    provenance: "Read from the sealed close gate",
    detail:
      "This one is not recomputed here. It is gate G3 as this run's own close attempt sealed " +
      "it: the reconciliation logic that decides it lives in the engine, and the API layer " +
      "holds none of it.",
  },
};

function CheckIcon({ passed }: { passed: boolean }): React.ReactElement {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontSize: 16, lineHeight: "20px", flexShrink: 0,
        color: passed ? "var(--color-reconciled)" : "var(--color-exception)",
      }}
    >
      {passed ? "check_circle" : "cancel"}
    </span>
  );
}

/** One labelled hash, abbreviated or in full. */
function HashLine({
  label, value, expanded,
}: { label: string; value: string; expanded: boolean }): React.ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>{label}</p>
      <div className="id-line">
        <p className="cell-id" style={{ fontSize: 11, lineHeight: 1.6 }}>
          {expanded ? value : `${value.slice(0, HASH_PREFIX)}…`}
        </p>
        {/* The copy control carries the WHOLE hash even while the display is
            abbreviated, and carries it in a click handler rather than in an
            attribute — so an abbreviated hash costs the reviewer nothing and
            the document still contains only what is on screen. */}
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

/**
 * The recomputed root beside the stored one.
 *
 * **A mismatch is never abbreviated.** Two different 64-hex hashes can share a
 * 16-character prefix, so collapsing them would render a broken chain as an
 * intact one &mdash; the single worst thing this page could do. The disclosure
 * toggle therefore exists only on the branch where the two hashes are reported
 * equal; where they are not, both are shown in full and the toggle is not
 * offered, because there is nothing left to disclose.
 */
function RootComparison({ verification }: { verification: LedgerVerification }): React.ReactElement {
  const [showFull, setShowFull] = useState(false);
  const matches = verification.root_matches;
  const expanded = showFull || !matches;

  return (
    <section style={{ marginBottom: "var(--space-xl)" }}>
      <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>tag</span>
        Recomputed root vs. stored root
      </h2>
      <div className="card" style={{ padding: "var(--space-lg)" }}>
        <div className="grid grid-2" style={{ gap: "var(--space-lg)" }}>
          <HashLine label="Recomputed from genesis" value={verification.recomputed_root_hash} expanded={expanded} />
          <HashLine label="Stored on the run" value={verification.stored_root_hash} expanded={expanded} />
        </div>
        <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-outline-variant)", display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <CheckIcon passed={matches} />
          <span
            className="font-body-sm"
            style={{ fontWeight: 600, color: matches ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {matches ? "Roots match" : "Roots differ"}
          </span>
          <span className="font-body-sm text-muted" style={{ fontSize: 11 }}>
            {matches
              ? "The chain rebuilt from the genesis hash lands on the root this run recorded."
              : "The chain rebuilt from the genesis hash does not land on the root this run recorded. Both hashes are shown in full, because a shared prefix would hide the difference."}
          </span>
          {matches && (
            <button
              className="btn btn-ghost"
              style={{ padding: 0, fontSize: 12, marginLeft: "auto" }}
              onClick={() => { setShowFull((v) => !v); }}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
                {showFull ? "unfold_less" : "unfold_more"}
              </span>
              {showFull ? "Abbreviate hashes" : "Show full hashes"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** The trial balance: both totals, and the API's own balanced verdict beside them. */
function TrialBalance({ verification }: { verification: LedgerVerification }): React.ReactElement {
  const ok = verification.trial_balance_ok;
  return (
    <section style={{ marginBottom: "var(--space-xl)" }}>
      <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>balance</span>
        Trial balance, re-projected from the event log
      </h2>
      <div className="card" style={{ padding: "var(--space-lg)" }}>
        <div className="grid grid-3" style={{ gap: "var(--space-lg)", alignItems: "start" }}>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Total debit</p>
            <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>
              {formatPaise(verification.total_dr_paise)}
            </p>
          </div>
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Total credit</p>
            <p className="font-numeric-mono" style={{ fontSize: 18, fontWeight: 600 }}>
              {formatPaise(verification.total_cr_paise)}
            </p>
          </div>
          {/* The verdict is `trial_balance_ok` off the response, not a
              comparison of the two figures beside it. Recomputing it here
              would make this page a second place the answer is decided. */}
          <div>
            <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Verdict</p>
            <p
              className="font-headline-sm"
              style={{ color: ok ? "var(--color-reconciled)" : "var(--color-exception)" }}
            >
              {ok ? "Balanced" : "Not balanced"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The three named checks, each with what it did and where its answer came from. */
function NamedChecks({ verification }: { verification: LedgerVerification }): React.ReactElement {
  return (
    <section style={{ marginBottom: "var(--space-xl)" }}>
      <h2 className="font-headline-sm" style={{ marginBottom: "var(--space-md)" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, verticalAlign: "middle", marginRight: "var(--space-sm)" }}>rule</span>
        Checks ({formatCount(verification.checks.length)})
      </h2>
      <div className="card" style={{ padding: "var(--space-md)" }}>
        {verification.checks.map((check, i) => {
          // An unknown name is rendered as itself rather than dropped: if the
          // route ever reports a fourth check, a reviewer should see it here
          // rather than have this page silently omit a failing one.
          const presentation = CHECK_PRESENTATION[check.name];
          return (
            <div
              key={check.name}
              style={{
                display: "flex", gap: "var(--space-sm)", alignItems: "flex-start",
                padding: "var(--space-sm) 0",
                borderBottom: i < verification.checks.length - 1 ? "1px solid var(--color-outline-variant)" : "none",
              }}
            >
              <CheckIcon passed={check.passed} />
              <div style={{ flex: 1 }}>
                <p className="font-body-sm" style={{ fontWeight: 600, marginBottom: 2 }}>
                  {presentation?.label ?? check.name}
                  <span className="cell-id text-muted" style={{ fontSize: 10, marginLeft: 8 }}>{check.name}</span>
                </p>
                {presentation && (
                  <>
                    <p className="font-label-caps text-muted" style={{ fontSize: 9, marginBottom: 2 }}>
                      {presentation.provenance}
                    </p>
                    <p className="font-body-sm text-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                      {presentation.detail}
                    </p>
                  </>
                )}
              </div>
              <span
                className="font-label-caps"
                style={{ color: check.passed ? "var(--color-reconciled)" : "var(--color-exception)" }}
              >
                {check.passed ? "PASS" : "FAIL"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * One verification result, in full.
 *
 * Exported so a test can render a verified chain and a broken one from two
 * response values, without a server and without stubbing `fetch`.
 */
export function VerificationResult({
  verification, onEvidenceClick,
}: { verification: LedgerVerification; onEvidenceClick: () => void }): React.ReactElement {
  const passed = allPassed(verification);
  // Named here rather than left for a reviewer to find by scanning three rows:
  // a failed check is the most important thing this page can say, and it must
  // be readable without scrolling. Read off the response's own `passed` flags.
  const failing = verification.checks.filter((c) => !c.passed);
  return (
    <>
      <div
        className="card"
        style={{
          padding: "var(--space-lg)", marginBottom: "var(--space-xl)",
          borderLeft: `6px solid ${passed ? "var(--color-reconciled)" : "var(--color-exception)"}`,
          background: passed ? "var(--color-surface-container-lowest)" : "var(--color-exception-bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap" }}>
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: 28, color: passed ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {passed ? "verified" : "gpp_bad"}
          </span>
          <p
            className="font-display-metric"
            style={{ fontSize: 24, lineHeight: "30px", color: passed ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {passed ? "Chain verified" : "Verification failed"}
          </p>
        </div>
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6 }}>
          {passed
            ? "Every named check below passed on this recomputation."
            : "At least one named check below failed. The engine's sealed decisions and the stored event log are unchanged by this check — verification reads the chain, it does not repair it."}
        </p>
        {failing.length > 0 && (
          <ul style={{ margin: "var(--space-sm) 0 0", padding: 0 }}>
            {failing.map((c) => (
              <li
                key={c.name}
                className="font-body-md"
                style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--color-exception)" }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>cancel</span>
                <span className="cell-id" style={{ fontSize: 12, color: "inherit" }}>{c.name}</span>
                <span>failed</span>
              </li>
            ))}
          </ul>
        )}
        {/* The run the RESPONSE names, kept beside the run this page was
            pointed at rather than assumed to be the same one. They should
            always agree; if they ever did not, a reviewer would be reading a
            verdict about a different chain. */}
        <p className="cell-id text-muted" style={{ fontSize: 10, wordBreak: "break-all", marginTop: "var(--space-sm)" }}>
          response run_id {verification.run_id}
        </p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: "var(--space-xl)" }}>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Chain integrity</p>
          <p
            className="font-headline-sm"
            style={{ color: verification.chain_ok ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {verification.chain_ok ? "Intact" : "Broken"}
          </p>
          <p className="font-body-sm text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
            Structural: each event links to the one before it. Reported apart from the root
            comparison and the trial balance, which are different findings.
          </p>
        </div>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Root matches</p>
          <p
            className="font-headline-sm"
            style={{ color: verification.root_matches ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {verification.root_matches ? "Yes" : "No"}
          </p>
        </div>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Trial balance</p>
          <p
            className="font-headline-sm"
            style={{ color: verification.trial_balance_ok ? "var(--color-reconciled)" : "var(--color-exception)" }}
          >
            {verification.trial_balance_ok ? "Balanced" : "Not balanced"}
          </p>
        </div>
        <div className="card" style={{ padding: "var(--space-md)" }}>
          <p className="font-label-caps text-muted" style={{ marginBottom: 4 }}>Events re-hashed</p>
          <p className="font-display-metric">{formatCount(verification.event_count)}</p>
        </div>
      </div>

      <RootComparison verification={verification} />
      <TrialBalance verification={verification} />
      <NamedChecks verification={verification} />

      {/* What this page does not hold, said plainly rather than left as an
          absence a reviewer has to notice. The endpoint returns a COUNT of
          events; the events themselves — actor, timestamp, prev_hash — are on
          the Evidence Trail, reached through the decision that caused them. */}
      <div className="card" style={{ padding: "var(--space-md)" }}>
        <p className="font-label-caps font-label-section" style={{ marginBottom: "var(--space-xs)" }}>
          Where the individual events are
        </p>
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6 }}>
          This verification covers {formatCount(verification.event_count)} events and reports
          them as a count; it returns nothing about any one of them. Each event&apos;s own
          record — its actor, its timestamp, its hash and the hash before it — is on the
          Evidence Trail for the decision that caused it.
        </p>
        <button
          className="btn btn-ghost"
          style={{ padding: 0, marginTop: "var(--space-sm)", fontSize: 12 }}
          onClick={onEvidenceClick}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>open_in_new</span>
          Open the Investigation Queue
        </button>
      </div>
    </>
  );
}

/**
 * The verification surface: the action, and whichever of idle / loading /
 * error / result the state says.
 *
 * Driven wholly by props so each of those four is renderable from a value.
 */
export function ChainVerification({
  runId, state, onVerify, onEvidenceClick,
}: {
  runId: string;
  state: ApiState<LedgerVerification>;
  onVerify: () => void;
  onEvidenceClick: () => void;
}): React.ReactElement {
  const verification = state.data;

  return (
    <>
      <div className="card" style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 640 }}>
            <p className="font-label-caps font-label-section" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, color: "var(--color-secondary)" }}>verified_user</span>
              Tamper-evidence, checked live
            </p>
            {/* The sentence the whole page turns on. The cached G4 flag on the
                close report is a value this run recorded when it ran; what
                this button does is rebuild the chain and see where it lands. */}
            <p className="font-body-sm text-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
              This does not read a stored verdict. Each press re-hashes every event in sequence
              from the run&apos;s genesis hash forward, re-projects the balances from the event
              log, and reports where that recomputation lands — the run&apos;s own recorded
              hash-chain flag is not consulted. The one exception is the Suspense identity,
              which is reported from the sealed close gate and is labelled as such below.
            </p>
            <p className="cell-id text-muted" style={{ fontSize: 10, wordBreak: "break-all", marginTop: "var(--space-sm)" }}>
              run {runId}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={onVerify}
            disabled={state.loading}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
              {state.loading ? "hourglass_top" : "shield"}
            </span>
            {state.loading
              ? "Verifying…"
              : verification
                ? "Verify again"
                : "Verify chain from genesis"}
          </button>
        </div>
      </div>

      {state.loading && (
        <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-md)" }}>
          <div className="loading-spinner" />
          <p className="font-body-md text-muted">Recomputing the chain from genesis&hellip;</p>
        </div>
      )}

      {state.error !== null && !state.loading && (
        <div>
          {/* Classified, not printed: a rejected fetch is the API process not
              being there and gets the operator's fix; a status the server
              answered keeps its own sentence, because that sentence is the
              only information the response carried. Retry re-runs THIS check
              and nothing else — no run is started and no decision is remade. */}
          <ApiErrorNotice
            error={state.error}
            title="Verification could not be run"
            onRetry={onVerify}
          />
          {/* Said once, under whichever of the two branches rendered: a request
              that never completed has established nothing about the chain, and
              must not be mistaken for a failed check. */}
          <p className="font-body-sm text-muted" style={{ textAlign: "center", lineHeight: 1.6 }}>
            No check ran, so nothing is known either way about this chain.
          </p>
        </div>
      )}

      {verification === null && !state.loading && state.error === null && (
        <p className="font-body-sm text-muted" style={{ lineHeight: 1.6 }}>
          Not yet verified. Nothing on this page is shown until the recomputation has actually
          been run against this run&apos;s chain.
        </p>
      )}

      {verification !== null && !state.loading && (
        <VerificationResult verification={verification} onEvidenceClick={onEvidenceClick} />
      )}
    </>
  );
}

/**
 * The page. Owns the current run, the hook and the button; delegates every
 * rendered figure to {@link ChainVerification}.
 *
 * The run is `RunContext`'s — the same one the Command Center, the queue and
 * the Evidence Trail are showing. There is no run id in this file.
 */
export function AuditLogs(): React.ReactElement {
  const navigate = useNavigate();
  const { run, startDemo } = useRun();
  const { verify, state } = useLedgerVerify();
  const gate = useRunGate();

  // Restoring / not-found / API-unreachable, before "No active run": on a
  // reload the pointer is still being resolved, and telling a reviewer there
  // is nothing to verify over a run that is about to arrive is false.
  if (gate !== null) return gate;

  if (!run) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 48, color: "var(--color-outline)" }}>history_edu</span>
        <h1 className="page-title">{VERIFY_LEDGER_TITLE}</h1>
        <p className="page-subtitle" style={{ textAlign: "center", maxWidth: 460 }}>
          No active run. A chain is verified against the run that produced it, so there is
          nothing to recompute until one has been started.
        </p>
        <button className="btn btn-primary" onClick={() => void startDemo()}>Run Demo</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{ padding: 0, marginBottom: "var(--space-lg)" }}>
        <div>
          <h1 className="page-title">{VERIFY_LEDGER_TITLE}</h1>
          <p className="page-subtitle" style={{ maxWidth: 780, lineHeight: 1.6 }}>{AUDIT_SCOPE}</p>
        </div>
      </div>

      <ChainVerification
        runId={run.run_id}
        state={state}
        onVerify={() => void verify(run.run_id)}
        onEvidenceClick={() => void navigate("/investigation-queue")}
      />
    </div>
  );
}
