import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types - mirrors the shapes apps/api returns.
// ---------------------------------------------------------------------------

export interface RunSummary {
  run_id: string;
  dataset: string;
  agent_id: string;
  llm_provider: string;
  observation_count: number;
  summary: {
    observation_states: Record<string, number>;
    decisions: number;
    abstentions: number;
    open_exceptions: number;
    certificates: number;
    probes_spent: number;
    period_status: "CLOSED" | "OPEN" | "BLOCKED";
    unresolved_value_paise: number;
    batch_value_paise: number | null;
    ledger_root_hash: string;
    event_count: number;
  };
}

export interface CloseReport {
  run_id: string;
  period_status: "CLOSED" | "OPEN" | "BLOCKED";
  gate: {
    g1_all_terminal: boolean;
    g2_trial_balance: boolean;
    g3_suspense_identity: boolean;
    g4_hash_chain: boolean;
    g5_no_failed_invariant_posted: boolean;
    failed_gates: string[];
  };
  batch_value_paise: number | null;
  unresolved_value_paise: number;
  value_abstained_paise: number;
  value_exceptions_paise: number;
  suspense_gross_item_paise: number;
  suspense_balance_paise: number;
  trial_balance_ok: boolean;
  total_dr_paise: number;
  total_cr_paise: number;
  account_balances: Record<string, number>;
  genesis_hash: string;
  ledger_root_hash: string;
  event_count: number;
  journal_line_count: number;
  close_threshold_paise: number;
  report: unknown | null;
}

export interface ExceptionItem {
  decision_id: string;
  obs_id: string;
  entity_id: string;
  kind: string;
  state: "ABSTAINED" | "EXCEPTION";
  value_paise: number;
  exception_class: string | null;
  suspense_key: string | null;
  comp_id: string | null;
  evt_id: string;
  has_certificate: boolean;
}

export interface ExceptionsResponse {
  run_id: string;
  total: number;
  value_abstained_paise: number;
  value_exceptions_paise: number;
  items: ExceptionItem[];
}

export interface JournalLine {
  account: string;
  dr_paise: number;
  cr_paise: number;
  source_entity_id: string;
  [key: string]: unknown;
}

/**
 * DATA_MODEL.md §13's CertificateSolution, as packages/ledger declares it and
 * apps/api passes it through unedited.
 *
 * The members are `member_obs_ids`. There is no `obs_ids` field anywhere on the
 * record and no alias is defined for one: a rename here would hide the fact
 * that the sealed certificate speaks a different name than the UI once assumed.
 */
export interface CertificateSolution {
  candidate_id: string;
  member_obs_ids: readonly string[];
}

/**
 * DATA_MODEL.md §13's Ambiguity Certificate, exactly as the hash chain sealed it.
 *
 * `materiality_paise` and `tau_paise` are typed `Paise` by packages/ledger --
 * integer paise, like every other `_paise` field in this app -- so both are
 * rendered through formatPaise and neither is scaled. On the demo certificate
 * they are 59_000 and 20_413, i.e. ₹590.00 and ₹204.13, which is the pair
 * RECONCILIATION_SPEC.md §6's ladder compared to reach AMBIGUOUS.
 */
export interface AmbiguityCertificate {
  comp_id: string;
  solution_a: CertificateSolution;
  solution_b: CertificateSolution;
  shared_hard_constraints: string[];
  evidence_score_gap_bps: number;
  materiality_paise: number;
  epsilon_bps: number;
  tau_paise: number;
  probes_attempted: string[];
  reason: string;
}

/**
 * One member of a candidate allocation, priced by the product read model.
 *
 * apps/api derives this from the run's own observations; it is NOT part of the
 * sealed certificate. `allocation_paise` is C6's per-member term
 * (credit − debit) -- the figure that ties an allocation out against its target
 * -- while `value_paise` is §14.1's value(observation), which for a recon line
 * is gross of fee and tax and is what the Investigation Queue ranks by. They are
 * different quantities and the UI never substitutes one for the other. Either is
 * null where the run holds no such observation.
 */
export interface AllocationMember {
  obs_id: string;
  allocation_paise: number | null;
  value_paise: number | null;
}

export interface AllocationSolution {
  candidate_id: string;
  members: AllocationMember[];
}

/** The certificate's target and both solutions, priced from real run data. */
export interface CertificateAllocation {
  comp_id: string;
  target: { obs_id: string; entity_id: string; value_paise: number } | null;
  solution_a: AllocationSolution;
  solution_b: AllocationSolution;
}

export interface DecisionEvidence {
  decision_id: string;
  obs_id: string;
  entity_id: string;
  kind: string;
  state: "RECONCILED" | "ABSTAINED" | "EXCEPTION";
  exception_class: string | null;
  suspense_key: string | null;
  value_paise: number;
  journal_lines: JournalLine[];
  comp_id: string | null;
  certificate: AmbiguityCertificate | null;
  evt_id: string;
}

/**
 * DATA_MODEL.md §16's actor block: "what lets a reviewer answer 'was a model
 * involved in this decision, and which one?'".
 *
 * There is no `actor.id`. The block identifies the actor by `type` (one of
 * deterministic | llm | human) and `component` (the code that took the step),
 * with the four LLM fields null on a deterministic actor.
 */
export interface EventActor {
  type: string;
  component: string;
  engine_commit: string;
  llm_provider: string | null;
  model_id: string | null;
  prompt_hash: string | null;
  llm_call_id: string | null;
}

export interface LedgerEvent {
  evt_id: string;
  run_id: string;
  ts: number;
  actor: EventActor;
  kind: string;
  subject_ids: string[];
  evidence_ids: string[];
  decision_id: string | null;
  inputs_hash: string;
  journal_lines: JournalLine[];
  certificate: AmbiguityCertificate | null;
  seq: number;
  prev_hash: string;
  hash: string;
}

export interface DecisionDetail {
  run_id: string;
  decision: DecisionEvidence;
  event: LedgerEvent | null;
  /** apps/api's read model; null exactly when the decision has no certificate. */
  certificate_allocation: CertificateAllocation | null;
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** POST /api/runs - start a demo run. */
export function useCreateRun(): {
  create: () => Promise<RunSummary>;
  state: ApiState<RunSummary>;
} {
  const [state, setState] = useState<ApiState<RunSummary>>({
    data: null, loading: false, error: null,
  });

  const create = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: "demo-500", llm_provider: "offline" }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${String(res.status)}: ${body}`);
      }
      const result = (await res.json()) as RunSummary;
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ data: null, loading: false, error: msg });
      throw e;
    }
  }, []);

  return { create, state };
}

/** GET /api/runs/:id/close */
export function useCloseReport(runId: string | null): ApiState<CloseReport> {
  const [state, setState] = useState<ApiState<CloseReport>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(`/api/runs/${runId}/close`)
      .then((r) => { if (!r.ok) throw new Error(`${String(r.status)}`); return r.json() as Promise<CloseReport>; })
      .then((d) => { if (!cancelled) setState({ data: d, loading: false, error: null }); })
      .catch((e: unknown) => { if (!cancelled) setState({ data: null, loading: false, error: String(e) }); });
    return () => { cancelled = true; };
  }, [runId]);

  return state;
}

/** GET /api/runs/:id/exceptions */
export function useExceptions(runId: string | null): ApiState<ExceptionsResponse> {
  const [state, setState] = useState<ApiState<ExceptionsResponse>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(`/api/runs/${runId}/exceptions`)
      .then((r) => { if (!r.ok) throw new Error(`${String(r.status)}`); return r.json() as Promise<ExceptionsResponse>; })
      .then((d) => { if (!cancelled) setState({ data: d, loading: false, error: null }); })
      .catch((e: unknown) => { if (!cancelled) setState({ data: null, loading: false, error: String(e) }); });
    return () => { cancelled = true; };
  }, [runId]);

  return state;
}

/** GET /api/runs/:id/decisions/:decision_id */
export function useDecisionDetail(
  runId: string | null,
  decisionId: string | null,
): ApiState<DecisionDetail> {
  const [state, setState] = useState<ApiState<DecisionDetail>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!runId || !decisionId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(`/api/runs/${runId}/decisions/${decisionId}`)
      .then((r) => { if (!r.ok) throw new Error(`${String(r.status)}`); return r.json() as Promise<DecisionDetail>; })
      .then((d) => { if (!cancelled) setState({ data: d, loading: false, error: null }); })
      .catch((e: unknown) => { if (!cancelled) setState({ data: null, loading: false, error: String(e) }); });
    return () => { cancelled = true; };
  }, [runId, decisionId]);

  return state;
}
