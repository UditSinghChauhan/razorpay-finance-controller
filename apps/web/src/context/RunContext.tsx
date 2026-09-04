import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useCreateRun, useCloseReport, useExceptions, fetchRun, type RunSummary, type CloseReport, type ExceptionsResponse } from "../hooks/useAssayApi.js";
import { DEFAULT_SCENARIO_ID, scenarioFor } from "../lib/scenarios.js";

/**
 * What survives a reload, and the reason it is only ever two strings.
 *
 * A reviewer who reloads, or who opens a bookmarked deep link, should not be
 * dropped back to the start screen — but a browser is the wrong place to keep a
 * financial figure. Anything cached here would be a **second copy** of a number
 * whose only authority is the API, it would go stale the moment the API
 * restarted, and a stale rupee value rendered as current is precisely the class
 * of error this product exists to refuse.
 *
 * So the pointer is a run id and a period id, both opaque, neither monetary.
 * On load they are handed straight back to `GET /runs/:id`, and every figure on
 * screen afterwards is that response's. If the API no longer holds the run, the
 * pointer is dropped and {@link RunContextValue.notFound} says so.
 *
 * `sessionStorage`, not `localStorage`: a run belongs to the life of an API
 * process, and a pointer that outlives the browser tab would mostly resolve to
 * a `404` on a machine that has since restarted the server.
 */
const RUN_POINTER_KEY = "assay.run_pointer.v1";

interface RunPointer {
  readonly run_id: string;
  readonly dataset: string;
}

/** Read the pointer, tolerating every way storage can be absent or malformed. */
function readPointer(): RunPointer | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(RUN_POINTER_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const { run_id, dataset } = parsed as Record<string, unknown>;
    // The period is validated against the allowlist rather than trusted: it
    // selects which fixture the NEXT run uses, and a value from storage must
    // not be able to name something the server would refuse.
    if (typeof run_id !== "string" || run_id === "") return null;
    if (typeof dataset !== "string" || scenarioFor(dataset) === undefined) return null;
    return { run_id, dataset };
  } catch {
    return null;
  }
}

function writePointer(pointer: RunPointer | null): void {
  try {
    if (pointer === null) globalThis.sessionStorage?.removeItem(RUN_POINTER_KEY);
    else globalThis.sessionStorage?.setItem(RUN_POINTER_KEY, JSON.stringify(pointer));
  } catch {
    // Storage being unavailable (private mode, blocked site data) costs a
    // reload's continuity and nothing else. It is never an error path.
  }
}

// ---------------------------------------------------------------------------
// The rehydration state machine
// ---------------------------------------------------------------------------

/**
 * Where the attempt to recover a persisted run has got to.
 *
 * **One value, five states, no silent branch.** The first version of this
 * carried two booleans — `rehydrating` and `notFound` — and a third outcome
 * that neither of them could express: an API that never answered. That third
 * outcome was computed by {@link fetchRun}, dropped on the floor, and rendered
 * as the ordinary start screen, so a reviewer whose server was down was shown a
 * page that looked like a first visit. A union makes that unrepresentable: every
 * kind below is rendered by {@link ../components/RunGate.js useRunGate}, and a
 * kind with no branch is a type error rather than a blank screen.
 *
 * - `idle`        no pointer was stored; this is a genuine first visit
 * - `restoring`   a pointer was stored and `GET /runs/:id` is outstanding
 * - `restored`    the API returned the run, and every figure on screen is its
 * - `not_found`   the API answered `404`; the pointer is dropped
 * - `unreachable` the API did not answer at all; the pointer is KEPT, because
 *                 the run may well still be there once the server is started
 */
export type RehydrateState =
  | { readonly kind: "idle" }
  | { readonly kind: "restoring" }
  | { readonly kind: "restored" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unreachable"; readonly message: string };

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface RunContextValue {
  /** The current run, null before POST /runs. */
  run: RunSummary | null;
  /** Close report for the current run. */
  close: CloseReport | null;
  /** Exception queue for the current run. */
  exceptions: ExceptionsResponse | null;
  /** Currently selected decision_id for drill-down. */
  selectedDecisionId: string | null;
  /**
   * The demo period the next run will use, and the one the last run used.
   *
   * Held here rather than in the page so that a scenario survives a navigation
   * to the queue and back. It is a *request*: the server's allowlist decides
   * whether it can be run, and `run.dataset` is what actually ran.
   */
  dataset: string;
  /** Whether any data is loading. */
  loading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Start a run over one demo period. Defaults to the currently selected one. */
  startDemo: (dataset?: string) => Promise<void>;
  /** Choose the period the next run will use, without starting one. */
  selectDataset: (id: string) => void;
  /** Select a decision for drill-down. */
  selectDecision: (id: string | null) => void;
  /**
   * How far the attempt to recover a persisted run has got.
   *
   * Every run-dependent page reads this through
   * {@link ../components/RunGate.js useRunGate} rather than deciding for
   * itself, so no page can show "run the demo first" over a run that is about
   * to be restored.
   */
  rehydrate: RehydrateState;
  /**
   * Try the persisted pointer again.
   *
   * Only meaningful in the `unreachable` state — that is the one branch where
   * the pointer is still on disk and a retry can succeed without re-running
   * anything. A no-op when no pointer is stored.
   */
  retryRehydrate: () => void;
}

/**
 * Exported so a test can render a page against a fixed context value without a
 * live API — the pages read every figure they show from here, so supplying the
 * value is enough to assert on what they render.
 */
export const RunContext = createContext<RunContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RunProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  // Lazy initialisers: the pointer is read once, on mount, rather than on every
  // render of the provider. A `JSON.parse` in a render body is wasted work and
  // a storage read in one is a side effect where React promises none.
  const [dataset, setDataset] = useState<string>(() => readPointer()?.dataset ?? DEFAULT_SCENARIO_ID);
  const [rehydrate, setRehydrate] = useState<RehydrateState>(
    () => (readPointer() === null ? { kind: "idle" } : { kind: "restoring" }),
  );
  // Bumped by `retryRehydrate` to re-run the effect below. A counter rather
  // than a direct call so the fetch has exactly one call site and the
  // cancellation on unmount covers the retry too.
  const [rehydrateAttempt, setRehydrateAttempt] = useState(0);
  const { create, state: createState } = useCreateRun();

  /**
   * Recover the run named by the pointer from the API.
   *
   * Nothing financial is read from storage: the pointer carries a run id, the
   * id is handed to `GET /runs/:id`, and the summary that comes back is the
   * same object `POST /runs` would have returned.
   *
   * **All three outcomes are recorded; none is swallowed.** `found` installs
   * the run; `not_found` drops the pointer, because the process that held that
   * run is gone and an id that will 404 forever is worse than no id;
   * `unreachable` KEEPS the pointer and reports the message, because the run
   * may well still be there once the server is started and
   * {@link RunContextValue.retryRehydrate} should be able to find it.
   */
  useEffect(() => {
    const saved = readPointer();
    if (saved === null) {
      setRehydrate({ kind: "idle" });
      return;
    }
    let cancelled = false;
    void (async () => {
      const outcome = await fetchRun(saved.run_id);
      if (cancelled) return;
      switch (outcome.kind) {
        case "found":
          setRun(outcome.run);
          setDataset(outcome.run.dataset);
          setRehydrate({ kind: "restored" });
          break;
        case "not_found":
          writePointer(null);
          setRehydrate({ kind: "not_found" });
          break;
        case "unreachable":
          setRehydrate({ kind: "unreachable", message: outcome.message });
          break;
      }
    })();
    return () => { cancelled = true; };
  }, [rehydrateAttempt]);

  const retryRehydrate = useCallback(() => {
    if (readPointer() === null) return;
    setRehydrate({ kind: "restoring" });
    setRehydrateAttempt((n) => n + 1);
  }, []);

  const runId = run?.run_id ?? null;
  const closeState = useCloseReport(runId);
  const exceptionsState = useExceptions(runId);

  // The drill-down is cleared first: a decision_id belongs to the run that
  // minted it, and carrying one across a period change would point the Evidence
  // Trail at a decision the new run does not hold.
  const startDemo = useCallback(
    async (next?: string) => {
      const id = next ?? dataset;
      setSelectedDecisionId(null);
      setDataset(id);
      // Starting a run answers whatever the pointer could not: whichever of
      // `not_found` / `unreachable` / `restoring` was on screen is no longer
      // the thing being reported, and this run's own `loading`/`error` take
      // over from here.
      setRehydrate({ kind: "idle" });
      const result = await create(id);
      setRun(result);
      // The pointer is written only after the server has answered, so a failed
      // run never leaves an id behind that would 404 on the next reload.
      writePointer({ run_id: result.run_id, dataset: result.dataset });
    },
    [create, dataset],
  );

  const selectDataset = useCallback((id: string) => {
    setDataset(id);
  }, []);

  const loading = createState.loading || closeState.loading || exceptionsState.loading;
  const error = createState.error ?? closeState.error ?? exceptionsState.error;

  return (
    <RunContext.Provider
      value={{
        run,
        close: closeState.data,
        exceptions: exceptionsState.data,
        selectedDecisionId,
        dataset,
        loading,
        error,
        startDemo,
        selectDataset,
        selectDecision: setSelectedDecisionId,
        rehydrate,
        retryRehydrate,
      }}
    >
      {children}
    </RunContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within <RunProvider>");
  return ctx;
}
