import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useCreateRun, useCloseReport, useExceptions, type RunSummary, type CloseReport, type ExceptionsResponse } from "../hooks/useAssayApi.js";

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
  /** Whether any data is loading. */
  loading: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Start the demo run. */
  startDemo: () => Promise<void>;
  /** Select a decision for drill-down. */
  selectDecision: (id: string | null) => void;
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
  const { create, state: createState } = useCreateRun();

  const runId = run?.run_id ?? null;
  const closeState = useCloseReport(runId);
  const exceptionsState = useExceptions(runId);

  const startDemo = useCallback(async () => {
    setSelectedDecisionId(null);
    const result = await create();
    setRun(result);
  }, [create]);

  const loading = createState.loading || closeState.loading || exceptionsState.loading;
  const error = createState.error ?? closeState.error ?? exceptionsState.error;

  return (
    <RunContext.Provider
      value={{
        run,
        close: closeState.data,
        exceptions: exceptionsState.data,
        selectedDecisionId,
        loading,
        error,
        startDemo,
        selectDecision: setSelectedDecisionId,
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
