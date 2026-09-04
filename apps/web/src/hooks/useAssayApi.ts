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


/**
 * POST /api/runs/:id/decisions/:decision_id/explain
 *
 * The AI explanation surface. Every field below is produced by apps/api: the
 * page sends presentation preferences and receives an explanation that already
 * passed ARCHITECTURE.md §4 boundary 2's three checks, or a stated reason why
 * there is none. The browser holds no credential, builds no prompt and sees no
 * prompt -- `system_prompt_hash` travels, prompt text never does (§T11).
 */
export interface AiExplanationText {
  summary: string;
  why: string[];
  risk: string;
  next_step: string;
}

/** Which of §4 boundary 2's three checks ran, and how it went. */
export type GroundingCheckOutcome = "pass" | "fail" | "not_reached";

export interface ExplanationGrounding {
  decision_evidence_verified: boolean;
  certificate_used: boolean;
  /** Always "none". The model explains; ASSAY decides. */
  decision_authority: string;
  /**
   * The terminal state ASSAY decided, read by the server off the sealed
   * DecisionEvidence on every branch -- success, refusal and failure alike.
   * It is never anything the model returned.
   */
  deterministic_state: string;
  checks: {
    schema: GroundingCheckOutcome;
    allowlist: GroundingCheckOutcome;
    numerals: GroundingCheckOutcome;
  };
  rejected_entity_ids: string[];
  rejected_numerals: string[];
  system_prompt_id: string | null;
  system_prompt_hash: string;
  input_hash: string;
  cache_key: string;
  evidence_item_count: number;
}

export interface ExplanationProvider {
  provider: string;
  model_id: string;
  requires_network: boolean;
  attempts: number;
  latency_ms: number;
}

export interface ExplanationFailure {
  code: string;
  message: string;
}

/**
 * ASSAY's own summary of the same evidence, served on `unavailable`.
 *
 * A SEPARATE field from `explanation`, and the separation is the guarantee: the
 * page renders `explanation` as the model's prose under an "AI explanation"
 * heading, and this can therefore never be shown in that position. It is
 * deterministic text the server composed out of the sealed evidence, and it
 * carries its own label saying so.
 */
export interface EvidenceSummary {
  /** Always "Evidence summary — AI unavailable". Rendered, never paraphrased. */
  label: string;
  /** Always "assay-deterministic". Never a provider id. */
  generated_by: string;
  summary: string;
  points: string[];
  risk: string;
  next_step: string;
}

export interface ExplanationResponse {
  run_id: string;
  decision_id: string;
  audience: string;
  /**
   * ok        the model answered and every check passed
   * rejected  the model answered and ASSAY discarded the answer
   * unavailable  no answer was obtained (no credential, or the provider failed)
   */
  status: "ok" | "rejected" | "unavailable";
  explanation: AiExplanationText | null;
  /** Present on `unavailable` only. Never model output. */
  fallback: EvidenceSummary | null;
  provider: ExplanationProvider | null;
  grounding: ExplanationGrounding;
  failure: ExplanationFailure | null;
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

/**
 * POST /api/runs - start a demo run over one allowlisted period.
 *
 * `dataset` is a parameter rather than a constant because the Command Center
 * can now start any of `demo/`'s periods. It is still **the server** that
 * decides which names are runnable: `apps/api/src/datasets.ts` resolves a name
 * to a path under `demo/` and answers `400` with the ids it supports for
 * anything else, so an unknown id here is refused rather than resolved.
 */
export function useCreateRun(): {
  create: (dataset: string) => Promise<RunSummary>;
  state: ApiState<RunSummary>;
} {
  const [state, setState] = useState<ApiState<RunSummary>>({
    data: null, loading: false, error: null,
  });

  const create = useCallback(async (dataset: string) => {
    setState({ data: null, loading: true, error: null });
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset, llm_provider: "offline" }),
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

/**
 * What a rehydration attempt **concluded** about a persisted run id.
 *
 * Four outcomes, because a completed fetch has exactly four answers. The
 * *pending* and *never-attempted* states are not here: they are states of the
 * caller, not conclusions of this call, and they live on `RunContext`'s
 * `RehydrateState` where a page can render them.
 *
 * `api_mismatch` is a member rather than a shade of `unreachable` because the
 * two are opposite facts about the server: `unreachable` is a process that did
 * not answer, `api_mismatch` is a process that answered and does not have the
 * route. Folding the second into the first would put *"the API is not
 * answering"* on screen underneath an API that just did.
 */
export type RehydrateOutcome =
  | { readonly kind: "found"; readonly run: RunSummary }
  | { readonly kind: "not_found" }
  | { readonly kind: "api_mismatch" }
  | { readonly kind: "unreachable"; readonly message: string };

/**
 * Re-read a run the browser only knows the **id** of.
 *
 * `GET /runs/:id` returns the same summary `POST /runs` did, for a run the API
 * process still holds. This exists so a reload or a deep link can recover
 * authoritative state from the server: the browser persists an id and a period
 * name, never a figure, so every rupee value on screen after a rehydration came
 * from this call and not from storage.
 *
 * The outcomes are kept apart because they need different words on screen. A
 * rejected `fetch` is the API being absent, which is an operator problem with
 * an operator's fix. Anything else is reported as it came.
 *
 * **A `404` is read from the body, not from the status.** `apps/api` answers
 * `404` for two unrelated reasons and only one of them is about this run:
 * `apps/api/src/routes/runs.ts` answers `{"error": "unknown_run"}` for a run
 * the process no longer holds — its registry is an in-process `Map` and a
 * restart empties it, which is a normal state rather than an error — while
 * `apps/api/src/app.ts`'s fallback answers `{"error": "not_found"}` for a
 * request that matched no route at all. The second one happens when the
 * frontend has been rebuilt against an API that predates `GET /runs/:id`, and
 * telling that reviewer *"the run is gone"* would be a fabricated history for
 * a run the server was never asked about. So the code decides, and a `404`
 * whose body cannot be read or names neither code is reported as it came
 * rather than assigned to either.
 */
export async function fetchRun(runId: string): Promise<RehydrateOutcome> {
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const code = typeof body?.error === "string" ? body.error : null;
      if (code === "unknown_run") return { kind: "not_found" };
      if (code === "not_found") return { kind: "api_mismatch" };
      return { kind: "unreachable", message: `404: ${code ?? "no error code in body"}` };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { kind: "unreachable", message: `${String(res.status)}: ${body}` };
    }
    return { kind: "found", run: (await res.json()) as RunSummary };
  } catch (e) {
    return { kind: "unreachable", message: e instanceof Error ? e.message : String(e) };
  }
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

/**
 * POST /api/runs/:id/decisions/:decision_id/explain - ask for an explanation.
 *
 * Imperative rather than an effect: §5's interaction is a button, and an
 * explanation that fetched itself on mount would spend a metered call on every
 * page view of a certificate nobody asked about.
 *
 * A non-2xx response is NOT thrown away. apps/api answers 503 with a full body
 * naming the reason, and that body is the thing the panel has to render -- an
 * error path that discarded it would replace a stated reason with a generic
 * one. Only a genuinely unreadable response becomes an `error`.
 */
export function useExplainDecision(): {
  explain: (runId: string, decisionId: string) => Promise<void>;
  reset: () => void;
  state: ApiState<ExplanationResponse>;
} {
  const [state, setState] = useState<ApiState<ExplanationResponse>>({
    data: null, loading: false, error: null,
  });

  const explain = useCallback(async (runId: string, decisionId: string) => {
    setState({ data: null, loading: true, error: null });
    try {
      const res = await fetch(
        `/api/runs/${runId}/decisions/${decisionId}/explain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience: "analyst" }),
        },
      );
      const parsed = (await res.json()) as ExplanationResponse | { error?: string; message?: string };
      if (!("status" in parsed)) {
        throw new Error(parsed.message ?? `${String(res.status)}`);
      }
      setState({ data: parsed, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ data: null, loading: false, error: msg });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { explain, reset, state };
}

// ---------------------------------------------------------------------------
// The close controller — @assay/controller's trace, over apps/api's two new
// routes. Additive: nothing above this line is touched.
//
// This phase's terminal state is escalation, never a financial write —
// packages/controller/src/index.ts states the guarantee this surface reads
// off `financial_write_performed`, which is always false while these
// endpoints answer from the observe-only phase.
// ---------------------------------------------------------------------------

/** One item the controller routed to a person. A passthrough of `EscalationRecord`. */
export interface ControllerEscalation {
  decision_id: string;
  entity_id: string;
  obs_id: string;
  kind: string;
  reason: "AMBIGUOUS_CERTIFICATE" | "NO_DETERMINISTIC_WARRANT";
  value_paise: number;
  suspense_key: string;
  comp_id: string | null;
  certificate_reason: string | null;
  probes_attempted: string[];
  evidence_score_gap_bps: number | null;
  epsilon_bps: number | null;
  materiality_paise: number | null;
  tau_paise: number | null;
  closes_alone: boolean;
}

/** One point on the residual trajectory — one per close-gate reading. */
export interface ControllerResidualPoint {
  step_no: number;
  unresolved_value_paise: number;
  close_threshold_paise: number;
  period_status: string;
}

/** One controller step — the unit `rule_fired` makes an audit record of. */
export interface ControllerStep {
  step_no: number;
  state: string;
  rule_fired: string;
  tool: string | null;
  tool_input_hash: string | null;
  observation_digest: string | null;
  observation_summary: string;
  next_state: string;
  caused_events: string[];
  llm: { role: string; provider: string; status: string } | null;
}

/** The plan `PLAN` computed, last. */
export interface ControllerPlan {
  ids: string[];
  eligible: ExceptionItem[];
  ineligible_count: number;
  covers_residual: boolean;
  already_under_threshold: boolean;
}

/** The five questions the controller's runtime checks answer. */
export type TelemetryGroup =
  | "terminal"
  | "policy"
  | "containment"
  | "grounding"
  | "escalation";

/** One runtime check the controller's telemetry layer derived from the trace. */
export interface TelemetryCheck {
  id: string;
  group: TelemetryGroup;
  passed: boolean;
  detail: string;
}

/** Counters over one execution. Not rates, not scores — counts. */
export interface TelemetryCounters {
  steps: number;
  step_budget: number;
  tool_calls: number;
  tool_calls_by_name: Record<string, number>;
  writes_attempted: number;
  writes_applied: number;
  caused_events: number;
  model_calls: number;
  escalations: number;
  plan_size: number;
  eligible_items: number;
  ineligible_items: number;
}

/**
 * `EXPLORATORY` runtime telemetry, derived from the trace by the API.
 *
 * Not a benchmark metric and never comparable to one: nothing here is on
 * `PREREGISTRATION.md §8`'s list, and `scope` carries the label the
 * specification requires so a surface cannot render it unlabelled.
 */
export interface ControllerTelemetry {
  scope: "EXPLORATORY";
  trace_id: string;
  run_id: string;
  terminal: string;
  stop_reason: string | null;
  halt_reason: string | null;
  checks: TelemetryCheck[];
  checks_passed: number;
  checks_total: number;
  all_passed: boolean;
  counters: TelemetryCounters;
}

/** `GET /api/runs/:id/controller` and `POST .../controller/start`'s body. */
export interface ControllerTrace {
  trace_id: string;
  run_id: string;
  phase: "observe-only";
  terminal: "COMPLETE" | "HALT";
  stop_reason: string | null;
  halt_reason: string | null;
  steps: ControllerStep[];
  escalations: ControllerEscalation[];
  plan: ControllerPlan | null;
  residual_trajectory: ControllerResidualPoint[];
  writes_attempted: number;
  writes_applied: number;
  financial_write_performed: boolean;
  awaiting_human_review: boolean;
  telemetry: ControllerTelemetry;
}

/**
 * Drives the close controller over one run and reads its trace back.
 *
 * `start` is imperative, the same reason `useExplainDecision`'s `explain` is:
 * this is a button ("Run Finance Controller"), not a fetch on mount. `refresh` reruns
 * the SAME `GET`, which `apps/api`'s `routes/controller.ts` answers by
 * re-driving the controller over the still-sealed run rather than a cache —
 * so a second read is requirement 9's determinism, exercised from the browser.
 */
export function useController(): {
  start: (runId: string) => Promise<void>;
  refresh: (runId: string) => Promise<void>;
  state: ApiState<ControllerTrace>;
} {
  const [state, setState] = useState<ApiState<ControllerTrace>>({
    data: null, loading: false, error: null,
  });

  const run = useCallback(async (method: "GET" | "POST", path: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(path, method === "POST" ? { method } : undefined);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${String(res.status)}: ${body}`);
      }
      const result = (await res.json()) as ControllerTrace;
      setState({ data: result, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ data: null, loading: false, error: msg });
    }
  }, []);

  const start = useCallback(
    (runId: string) => run("POST", `/api/runs/${runId}/controller/start`),
    [run],
  );
  const refresh = useCallback(
    (runId: string) => run("GET", `/api/runs/${runId}/controller`),
    [run],
  );

  return { start, refresh, state };
}

// ---------------------------------------------------------------------------
// Chain verification — GET /runs/:id/ledger/verify, ARCHITECTURE.md §9's
// "Recomputes the hash chain from genesis, re-projects balances, re-checks the
// Suspense identity. Returns pass/fail per check."
//
// Additive: nothing above this line is touched.
// ---------------------------------------------------------------------------

/** One named pass/fail check. The names are the route's own, not the UI's. */
export interface LedgerCheck {
  name: string;
  passed: boolean;
}

/**
 * `GET /api/runs/:id/ledger/verify`'s body, exactly as
 * `apps/api/src/routes/ledger-verify.ts` builds it.
 *
 * **Three of these fields are recomputed and one is not, and the difference is
 * load-bearing.** `chain_ok`, `root_matches` and `trial_balance_ok` come from a
 * fresh `verifyChain` call over the run's own `chain.events` and
 * `chain.genesis_hash` — the chain is re-hashed from genesis on every request.
 * The `suspense_identity` check reports the run's sealed
 * `close.gate.g3_suspense_identity`, because computing `G3` a second time in
 * `apps/api` would put reconciliation logic in a layer that states it holds
 * none. Any surface rendering this must say which is which.
 */
export interface LedgerVerification {
  run_id: string;
  chain_ok: boolean;
  recomputed_root_hash: string;
  stored_root_hash: string;
  root_matches: boolean;
  trial_balance_ok: boolean;
  total_dr_paise: number;
  total_cr_paise: number;
  event_count: number;
  checks: LedgerCheck[];
}

/**
 * Recomputes one run's hash chain from genesis and reads the result back.
 *
 * Imperative rather than an effect, for the reason `useController`'s `start`
 * and `useExplainDecision`'s `explain` are: `§9` says the route exists "so a
 * reviewer can check tamper-evidence live rather than be told about it", and a
 * verification that ran itself on mount would put a verdict on screen that
 * nobody asked for — indistinguishable, at a glance, from the cached flag this
 * endpoint exists to not be.
 *
 * A non-2xx body is read for its `message` before falling back to the status
 * code. `apps/api` answers an unknown run with a sentence explaining that runs
 * live in memory for the life of the server; discarding it would replace a
 * stated reason with "404".
 */
export function useLedgerVerify(): {
  verify: (runId: string) => Promise<void>;
  state: ApiState<LedgerVerification>;
} {
  const [state, setState] = useState<ApiState<LedgerVerification>>({
    data: null, loading: false, error: null,
  });

  const verify = useCallback(async (runId: string) => {
    setState({ data: null, loading: true, error: null });
    try {
      const res = await fetch(`/api/runs/${runId}/ledger/verify`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `${String(res.status)}`);
      }
      const result = (await res.json()) as LedgerVerification;
      setState({ data: result, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ data: null, loading: false, error: msg });
    }
  }, []);

  return { verify, state };
}
