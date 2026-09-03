import {
  ALLOWED_TRANSITIONS,
  DEFAULT_STEP_BUDGET,
  POLICY_RULES,
  TERMINAL_STATES,
  WRITE_PHASE_STATES,
} from "./state.js";
import { TOOL_NAMES, type ToolName } from "./tools.js";
import { digest, traceId, type ControllerTrace } from "./trace.js";

/**
 * Runtime telemetry over one controller trace — **`EXPLORATORY`, and that
 * label is load-bearing.**
 *
 * `DECISION_BRIEF.md §L.4` prohibits *"reporting a metric not in
 * `PREREGISTRATION.md §8` without labelling it `EXPLORATORY`"*. Nothing here
 * is on `§8`'s list of 28, nothing here is compared against `§7`'s frozen
 * baseline, and nothing here enters `packages/eval` — which is the
 * **measurement** layer for `EVALUATION_SPEC.md §3`'s benchmark arms and is
 * scoped to a different question entirely. {@link ControllerTelemetry.scope}
 * carries the label as data so a surface cannot render these figures without
 * it.
 *
 * ## What this measures, and what it refuses to
 *
 * Every entry below is a **property of one execution, verifiable from the
 * trace alone** — did the machine stay inside its declared transition table,
 * did it write, was each escalation backed by an inspection step that actually
 * happened. None of it is a *quality* judgement: there is no accuracy here, no
 * coverage, no rate, no comparison between runs or agents, and no claim about
 * whether escalating was the *right* call. Those are questions for the
 * deterministic engine (which decides) and for `packages/eval` (which scores
 * benchmark arms on sealed corpora), and conflating them with orchestration
 * telemetry is exactly the confusion this module is written to avoid.
 *
 * ## Derived, never asserted
 *
 * `evaluateController` is a pure function of the trace. It adds no fact the
 * trace did not already carry: a reader handed the trace can recompute every
 * check and every counter here and must get the same answer. That is the point
 * — a self-reported "all checks passed" that could not be independently
 * recomputed would be worth nothing.
 */

/** The checks, as a closed set. Each is `true`/`false` for one trace. */
export const TELEMETRY_CHECK_IDS = Object.freeze([
  // Terminal correctness
  "terminal_reached",
  "terminal_reason_coherent",
  // Policy compliance
  "transitions_declared",
  "rules_declared",
  "budget_not_exhausted",
  // Containment — the phase's central claim
  "no_write_phase_state",
  "no_writes_attempted",
  "no_writes_applied",
  "no_caused_events",
  "no_model_call",
  "reads_only",
  // Evidence grounding / reproducibility
  "observations_hashed",
  "escalations_inspected",
  "trace_id_recomputes",
  // Escalation correctness
  "escalations_eligible",
  "escalations_planned",
  "escalation_reason_consistent",
] as const);

export type TelemetryCheckId = (typeof TELEMETRY_CHECK_IDS)[number];

/** The five questions the checks answer, for a surface that groups them. */
export const TELEMETRY_GROUPS = Object.freeze([
  "terminal",
  "policy",
  "containment",
  "grounding",
  "escalation",
] as const);

export type TelemetryGroup = (typeof TELEMETRY_GROUPS)[number];

export interface TelemetryCheck {
  readonly id: TelemetryCheckId;
  readonly group: TelemetryGroup;
  readonly passed: boolean;
  /** What was checked, and — when it fails — what was found instead. */
  readonly detail: string;
}

export interface TelemetryCounters {
  readonly steps: number;
  readonly step_budget: number;
  readonly tool_calls: number;
  readonly tool_calls_by_name: Readonly<Record<ToolName, number>>;
  readonly writes_attempted: number;
  readonly writes_applied: number;
  /** `§16` events this run caused. Zero in an observe-only phase. */
  readonly caused_events: number;
  /** `R1`–`R4` calls. Zero: the controller consults no model. */
  readonly model_calls: number;
  readonly escalations: number;
  readonly plan_size: number;
  readonly eligible_items: number;
  readonly ineligible_items: number;
}

export interface ControllerTelemetry {
  /**
   * `EXPLORATORY`, always, and structurally: the type admits no other value.
   *
   * `§L.4`'s labelling requirement is met by the artifact rather than by the
   * caller remembering to say so.
   */
  readonly scope: "EXPLORATORY";
  readonly trace_id: string;
  readonly run_id: string;
  readonly terminal: string;
  readonly stop_reason: string | null;
  readonly halt_reason: string | null;
  readonly checks: readonly TelemetryCheck[];
  readonly checks_passed: number;
  readonly checks_total: number;
  readonly all_passed: boolean;
  readonly counters: TelemetryCounters;
}

const SHA256 = /^[0-9a-f]{64}$/;

function check(
  id: TelemetryCheckId,
  group: TelemetryGroup,
  passed: boolean,
  detail: string,
): TelemetryCheck {
  return Object.freeze({ id, group, passed, detail });
}

/**
 * Evaluate one trace.
 *
 * `budget` is the bound the run was driven under; it is a parameter because
 * the trace does not carry it, and it defaults to the same constant
 * `runController` defaults to. It affects one counter and no check —
 * `budget_not_exhausted` reads `stop_reason`, which is the trace's own record
 * of whether the bound actually bit.
 */
export function evaluateController(
  trace: ControllerTrace,
  budget: number = DEFAULT_STEP_BUDGET,
): ControllerTelemetry {
  const steps = trace.steps;
  const checks: TelemetryCheck[] = [];

  // --- terminal correctness ------------------------------------------------
  const terminalReached = (TERMINAL_STATES as readonly string[]).includes(trace.terminal);
  checks.push(
    check(
      "terminal_reached",
      "terminal",
      terminalReached,
      terminalReached
        ? `the loop ended in ${trace.terminal}`
        : `the loop ended in ${trace.terminal}, which is not a terminal state`,
    ),
  );

  const coherent =
    trace.terminal === "COMPLETE"
      ? trace.stop_reason !== null && trace.halt_reason === null
      : trace.halt_reason !== null && trace.stop_reason === null;
  checks.push(
    check(
      "terminal_reason_coherent",
      "terminal",
      coherent,
      coherent
        ? trace.terminal === "COMPLETE"
          ? `COMPLETE carries stop_reason ${String(trace.stop_reason)} and no halt reason`
          : `HALT carries halt_reason ${String(trace.halt_reason)} and no stop reason`
        : `terminal ${trace.terminal} with stop_reason ${String(trace.stop_reason)} ` +
          `and halt_reason ${String(trace.halt_reason)}`,
    ),
  );

  // --- policy compliance ---------------------------------------------------
  const illegal = steps.filter((s) => {
    const allowed = ALLOWED_TRANSITIONS[s.state] as readonly string[] | undefined;
    return allowed === undefined || !allowed.includes(s.next_state);
  });
  checks.push(
    check(
      "transitions_declared",
      "policy",
      illegal.length === 0,
      illegal.length === 0
        ? `all ${String(steps.length)} transitions appear in the declared table`
        : `${String(illegal.length)} transition(s) outside the table, first at step ` +
          `${String(illegal[0]?.step_no ?? 0)}`,
    ),
  );

  const undeclaredRules = steps.filter(
    (s) => !(POLICY_RULES as readonly string[]).includes(s.rule_fired),
  );
  checks.push(
    check(
      "rules_declared",
      "policy",
      undeclaredRules.length === 0,
      undeclaredRules.length === 0
        ? `every step names one of the ${String(POLICY_RULES.length)} declared rules`
        : `${String(undeclaredRules.length)} step(s) name an undeclared rule`,
    ),
  );

  const budgetOk = trace.stop_reason !== "BUDGET_EXHAUSTED";
  checks.push(
    check(
      "budget_not_exhausted",
      "policy",
      budgetOk,
      budgetOk
        ? `${String(steps.length)} step(s) against a bound of ${String(budget)}`
        : `the ${String(budget)}-step bound was reached; the result is partial`,
    ),
  );

  // --- containment ---------------------------------------------------------
  const writeStates = steps.filter(
    (s) =>
      (WRITE_PHASE_STATES as readonly string[]).includes(s.state) ||
      (WRITE_PHASE_STATES as readonly string[]).includes(s.next_state),
  );
  checks.push(
    check(
      "no_write_phase_state",
      "containment",
      writeStates.length === 0,
      writeStates.length === 0
        ? `no step entered or targeted ${WRITE_PHASE_STATES.join(" or ")}`
        : `${String(writeStates.length)} step(s) reached a write-phase state`,
    ),
  );

  checks.push(
    check(
      "no_writes_attempted",
      "containment",
      trace.writes_attempted === 0,
      `writes_attempted = ${String(trace.writes_attempted)}`,
    ),
  );
  checks.push(
    check(
      "no_writes_applied",
      "containment",
      trace.writes_applied === 0,
      `writes_applied = ${String(trace.writes_applied)}`,
    ),
  );

  const causedEvents = steps.reduce((n, s) => n + s.caused_events.length, 0);
  checks.push(
    check(
      "no_caused_events",
      "containment",
      causedEvents === 0,
      causedEvents === 0
        ? "no step appended a §16 ledger event"
        : `${String(causedEvents)} ledger event(s) were caused by this run`,
    ),
  );

  const modelCalls = steps.filter((s) => s.llm !== null).length;
  checks.push(
    check(
      "no_model_call",
      "containment",
      modelCalls === 0,
      modelCalls === 0
        ? "the controller consulted no model; its policy is deterministic code"
        : `${String(modelCalls)} model call(s) were made`,
    ),
  );

  const used = steps.map((s) => s.tool).filter((t): t is ToolName => t !== null);
  const unknownTools = used.filter((t) => !(TOOL_NAMES as readonly string[]).includes(t));
  checks.push(
    check(
      "reads_only",
      "containment",
      unknownTools.length === 0,
      unknownTools.length === 0
        ? `every call used one of the ${String(TOOL_NAMES.length)} declared read tools`
        : `${String(unknownTools.length)} call(s) used an undeclared tool`,
    ),
  );

  // --- evidence grounding / reproducibility --------------------------------
  const unhashed = steps.filter(
    (s) =>
      s.tool !== null &&
      !(SHA256.test(s.tool_input_hash ?? "") && SHA256.test(s.observation_digest ?? "")),
  );
  checks.push(
    check(
      "observations_hashed",
      "grounding",
      unhashed.length === 0,
      unhashed.length === 0
        ? "every tool call carries a sha256 input hash and observation digest"
        : `${String(unhashed.length)} tool call(s) lack a well-formed digest`,
    ),
  );

  /**
   * The strong grounding check: an escalation must be backed by an inspection
   * that actually happened. The input hash of a `decision_evidence` step is
   * recomputed here from the escalation's own ids — so a record naming a
   * decision the loop never read cannot pass.
   */
  const uninspected = trace.escalations.filter((e) => {
    const expected = digest({ run_id: trace.run_id, decision_id: e.decision_id });
    return !steps.some((s) => s.tool === "decision_evidence" && s.tool_input_hash === expected);
  });
  checks.push(
    check(
      "escalations_inspected",
      "grounding",
      uninspected.length === 0,
      uninspected.length === 0
        ? `all ${String(trace.escalations.length)} escalation(s) trace to a decision_evidence ` +
          `call whose recomputed input hash matches`
        : `${String(uninspected.length)} escalation(s) name a decision that was never inspected`,
    ),
  );

  const recomputed = traceId(trace.run_id, steps);
  const idOk = recomputed === trace.trace_id;
  checks.push(
    check(
      "trace_id_recomputes",
      "grounding",
      idOk,
      idOk
        ? "trace_id recomputes from (run_id, steps) — the run is reproducible by construction"
        : `trace_id ${trace.trace_id.slice(0, 12)} does not match recomputed ${recomputed.slice(0, 12)}`,
    ),
  );

  // --- escalation correctness ---------------------------------------------
  const ineligible = trace.escalations.filter((e) => e.suspense_key.trim() === "");
  checks.push(
    check(
      "escalations_eligible",
      "escalation",
      ineligible.length === 0,
      ineligible.length === 0
        ? "every escalated item opens a Suspense item, so clearing it could move the residual"
        : `${String(ineligible.length)} escalation(s) carry no Suspense key`,
    ),
  );

  const planned = trace.plan?.ids ?? [];
  const unplanned = trace.escalations.filter((e) => !planned.includes(e.decision_id));
  checks.push(
    check(
      "escalations_planned",
      "escalation",
      unplanned.length === 0,
      unplanned.length === 0
        ? `every escalation was on the closing set of ${String(planned.length)}`
        : `${String(unplanned.length)} escalation(s) were not on the plan`,
    ),
  );

  const inconsistent = trace.escalations.filter(
    (e) => (e.reason === "AMBIGUOUS_CERTIFICATE") !== (e.certificate_reason !== null),
  );
  checks.push(
    check(
      "escalation_reason_consistent",
      "escalation",
      inconsistent.length === 0,
      inconsistent.length === 0
        ? "AMBIGUOUS_CERTIFICATE is claimed exactly where a §13 certificate exists"
        : `${String(inconsistent.length)} escalation(s) claim a reason their certificate does not support`,
    ),
  );

  // --- counters ------------------------------------------------------------
  const byName = {} as Record<ToolName, number>;
  for (const name of TOOL_NAMES) byName[name] = 0;
  for (const t of used) if (t in byName) byName[t] += 1;

  const counters: TelemetryCounters = Object.freeze({
    steps: steps.length,
    step_budget: budget,
    tool_calls: used.length,
    tool_calls_by_name: Object.freeze(byName),
    writes_attempted: trace.writes_attempted,
    writes_applied: trace.writes_applied,
    caused_events: causedEvents,
    model_calls: modelCalls,
    escalations: trace.escalations.length,
    plan_size: planned.length,
    eligible_items: trace.plan?.eligible.length ?? 0,
    ineligible_items: trace.plan?.ineligible_count ?? 0,
  });

  const frozen = Object.freeze(checks);
  const passed = frozen.filter((c) => c.passed).length;

  return Object.freeze({
    scope: "EXPLORATORY",
    trace_id: trace.trace_id,
    run_id: trace.run_id,
    terminal: trace.terminal,
    stop_reason: trace.stop_reason,
    halt_reason: trace.halt_reason,
    checks: frozen,
    checks_passed: passed,
    checks_total: frozen.length,
    all_passed: passed === frozen.length,
    counters,
  });
}
