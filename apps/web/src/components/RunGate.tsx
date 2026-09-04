import { ScenarioPicker } from "./ScenarioPicker.js";
import { useRun } from "../context/RunContext.js";
import {
  API_MISMATCH_BODY,
  API_MISMATCH_HEADLINE,
  API_UNAVAILABLE_BODY,
  API_UNAVAILABLE_DETAIL_LABEL,
  API_UNAVAILABLE_HEADLINE,
  isApiUnreachable,
  RUN_NOT_FOUND_BODY,
  RUN_NOT_FOUND_HEADLINE,
} from "../lib/copy.js";

/**
 * The states a run-dependent page can be in before it has a run, in one place.
 *
 * **Why this is shared rather than per page.** Five screens depend on
 * `RunContext.run`, and each of them used to answer "there is no run" its own
 * way: the Command Center had a start screen, the queue said *"Run the demo
 * first"*, Verify Ledger said *"No active run"*, and the two decision pages
 * said *"select a decision"*. All four were correct on a genuine first visit
 * and all four were **wrong during a reload**, because a persisted pointer is
 * resolved asynchronously and every one of those screens rendered while
 * `GET /runs/:id` was still outstanding. A reviewer who reloaded a deep link
 * was told to start over, and then watched the page they asked for appear
 * underneath the instruction.
 *
 * {@link useRunGate} is the one answer. It reads
 * {@link ../context/RunContext.js RehydrateState}, returns the element that
 * state requires, and returns `null` when the page may render normally. Every
 * page calls it before its own empty state, so the empty state means what it
 * says: there is no run and none is coming.
 *
 * **Nothing here reads a figure.** The gate renders a spinner, a sentence and
 * a control. `run_id` and the period name are the only values it touches, and
 * both come from the context, not from storage.
 */

/** The shell every gate state renders into — centred, page-padded, one column. */
function GateShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="page"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: "var(--space-md)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A persisted pointer is being resolved against the API.
 *
 * It says what is happening and, in the same breath, that nothing financial
 * came out of the browser — which is the fact a reviewer watching a finance
 * tool restore itself from storage would otherwise have to take on trust.
 */
export function RestoringRun(): React.ReactElement {
  return (
    <GateShell>
      <div className="loading-spinner" />
      <p className="font-body-md text-muted">Restoring run&hellip;</p>
      <p className="font-body-sm text-muted" style={{ maxWidth: 560, textAlign: "center", lineHeight: 1.6 }}>
        Re-reading this run from the API. Every figure is re-fetched from the server; nothing
        financial is restored from this browser.
      </p>
    </GateShell>
  );
}

/**
 * A persisted run id the API no longer holds.
 *
 * Reported as a state rather than an error: nothing failed, the process that
 * held the run simply restarted. The scenario picker and the start button are
 * here because the only way forward is a new run, and making the reviewer
 * navigate somewhere else to press it would be a dead end.
 */
export function RunNotFound(): React.ReactElement {
  const { dataset, loading, selectDataset, startDemo } = useRun();
  return (
    <GateShell>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 44, color: "var(--color-abstained)" }}>
        history_toggle_off
      </span>
      <p className="font-body-md" style={{ fontWeight: 600 }}>{RUN_NOT_FOUND_HEADLINE}</p>
      <p className="font-body-sm text-muted" style={{ maxWidth: 560, textAlign: "center", lineHeight: 1.6 }}>
        {RUN_NOT_FOUND_BODY}
      </p>
      <ScenarioPicker selected={dataset} disabled={loading} onSelect={selectDataset} />
      <button className="btn btn-primary" onClick={() => void startDemo()}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>play_arrow</span>
        Run this period
      </button>
    </GateShell>
  );
}

/**
 * The API answered, and does not have the route this frontend needs.
 *
 * **Kept apart from {@link RunNotFound} on purpose, and the separation is made
 * on the response body rather than the status code.** Both arrive as `404`:
 * `{"error": "unknown_run"}` is the registry saying it does not hold this run,
 * and `{"error": "not_found"}` is the router saying nothing matched the
 * request. Rendering the second as the first would tell a reviewer that their
 * run is gone on the evidence of a server that never looked it up.
 *
 * It is not {@link ApiUnavailable} either: that screen says the API is not
 * answering, and here it answered. What is stale is the process, which is a
 * state this setup can genuinely reach because `apps/api` does not hot-reload.
 *
 * The pointer is kept and the retry stays, because a restarted API of the
 * right build may still hold the run. No figure is shown, and none exists to
 * show: nothing about the run was reported.
 */
export function ApiVersionMismatch({
  onRetry, children,
}: {
  onRetry?: (() => void) | undefined;
  /** A page's own way out, beside the retry. */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <GateShell>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 44, color: "var(--color-abstained)" }}>
        sync_problem
      </span>
      <p className="font-body-md" style={{ fontWeight: 600 }}>{API_MISMATCH_HEADLINE}</p>
      <p className="font-body-sm" style={{ maxWidth: 600, textAlign: "center", lineHeight: 1.7 }}>
        {API_MISMATCH_BODY}
      </p>
      <div className="actions" style={{ justifyContent: "center" }}>
        {onRetry !== undefined && (
          <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
        )}
        {children}
      </div>
    </GateShell>
  );
}

/**
 * The engine API is not answering.
 *
 * **The raw message is kept, and moved.** `TypeError: Failed to fetch` names no
 * cause a reviewer can act on — not which process is missing, not where it
 * should be, not how to start it. The three facts that do are the headline and
 * body; the original string stays below them, labelled, for whoever is
 * debugging rather than reviewing. Nothing is weakened: what the server said is
 * still on the page.
 */
export function ApiUnavailable({
  message, onRetry, children,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
  /** A page's own way out, beside the retry — "Back to Queue", say. */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <GateShell>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 44, color: "var(--color-exception)" }}>
        cloud_off
      </span>
      <p className="font-body-md" style={{ fontWeight: 600, color: "var(--color-exception)" }}>
        {API_UNAVAILABLE_HEADLINE}
      </p>
      <p className="font-body-sm" style={{ maxWidth: 600, textAlign: "center", lineHeight: 1.7 }}>
        {API_UNAVAILABLE_BODY}
      </p>
      <p className="font-body-sm text-muted" style={{ maxWidth: 600, textAlign: "center" }}>
        {API_UNAVAILABLE_DETAIL_LABEL}: <code style={{ fontSize: 12 }}>{message}</code>
      </p>
      <div className="actions" style={{ justifyContent: "center" }}>
        {onRetry !== undefined && (
          <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
        )}
        {children}
      </div>
    </GateShell>
  );
}

/**
 * A server that answered, and refused.
 *
 * Kept apart from {@link ApiUnavailable} on purpose. A `4xx`/`5xx` carries the
 * API's own reason in its body, and replacing that with *"start the server"*
 * would destroy the only information the response contained — the opposite of
 * the problem the unreachable branch exists to fix. So the server's sentence is
 * the body here, unedited.
 */
export function ServerError({
  title, message, onRetry, children,
}: {
  title: string;
  message: string;
  onRetry?: (() => void) | undefined;
  /** A page's own way out, beside the retry. */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <GateShell>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 44, color: "var(--color-exception)" }}>
        error
      </span>
      <p className="font-body-md" style={{ fontWeight: 600, color: "var(--color-exception)" }}>{title}</p>
      <p className="font-body-sm" style={{ maxWidth: 600, textAlign: "center", lineHeight: 1.7 }}>{message}</p>
      <div className="actions" style={{ justifyContent: "center" }}>
        {onRetry !== undefined && (
          <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
        )}
        {children}
      </div>
    </GateShell>
  );
}

/**
 * One failure string, classified and rendered.
 *
 * This is what every page's own `error` branch renders instead of printing the
 * raw string. {@link isApiUnreachable} decides which of the two it is; both
 * keep the underlying message on screen.
 */
export function ApiErrorNotice({
  error, title, onRetry, children,
}: {
  error: string;
  /** What failed, for the branch where the server answered. */
  title: string;
  onRetry?: (() => void) | undefined;
  /** A page's own way out, beside the retry. */
  children?: React.ReactNode;
}): React.ReactElement {
  return isApiUnreachable(error)
    ? <ApiUnavailable message={error} onRetry={onRetry}>{children}</ApiUnavailable>
    : <ServerError title={title} message={error} onRetry={onRetry}>{children}</ServerError>;
}

/**
 * The blocking state this page must render instead of its own content, or
 * `null` if there is none.
 *
 * Exhaustive over {@link ../context/RunContext.js RehydrateState}: `idle` and
 * `restored` are the two kinds that let a page through, and both do so because
 * the pointer has stopped being the thing that decides what is on screen — on
 * `idle` there was never one, on `restored` the run it named is installed.
 *
 * The three blocking kinds render three different sentences, because they are
 * three different facts about the server: `not_found` is a run the API says it
 * does not hold, `api_mismatch` is an API without the route to ask, and
 * `unreachable` is an API that did not answer.
 */
export function useRunGate(): React.ReactElement | null {
  const { rehydrate, retryRehydrate } = useRun();
  switch (rehydrate.kind) {
    case "restoring":
      return <RestoringRun />;
    case "not_found":
      return <RunNotFound />;
    case "api_mismatch":
      return <ApiVersionMismatch onRetry={retryRehydrate} />;
    case "unreachable":
      return <ApiUnavailable message={rehydrate.message} onRetry={retryRehydrate} />;
    case "idle":
    case "restored":
      return null;
  }
}
