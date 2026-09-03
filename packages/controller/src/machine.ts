import {
  closingSet,
  decide,
  initialMemory,
  observe,
  type ClosingPlan,
  type ControllerMemory,
  type EscalationRecord,
} from "./policy.js";
import {
  ALLOWED_TRANSITIONS,
  DEFAULT_STEP_BUDGET,
  isTerminal,
  type ControllerState,
  type HaltReason,
  type StopReason,
  type TerminalState,
} from "./state.js";
import {
  TOOL_SCHEMAS,
  type ToolCall,
  type ToolRegistry,
  type ToolResult,
} from "./tools.js";
import {
  digest,
  traceId,
  type ControllerStep,
  type ControllerTrace,
  type ResidualPoint,
} from "./trace.js";

/**
 * The driver — the one place the loop turns.
 *
 * **It performs no I/O itself.** Every capability arrives as a
 * {@link ToolRegistry} function, so this module can be driven against the real
 * `demo-500` run with no server, no socket and no model. That is what makes
 * `DECISION_BRIEF.md §L.1` rule 10 — *"the full pipeline must pass every
 * acceptance test under `--llm=offline`"* — and `§L.4`'s bar on a test that
 * depends on a live model hold here by construction rather than by discipline.
 *
 * **It cannot write.** `ToolRegistry` declares four functions and all four are
 * reads. There is no branch below that could append an event, move a balance,
 * or reach `packages/ledger`'s write path, and {@link ControllerTrace} records
 * `writes_attempted: 0` as a checkable claim rather than a promise.
 *
 * ## Three guards
 *
 * 1. **Transition legality.** Every transition the policy produces is checked
 *    against `state.ts`'s declared relation and a violation throws. An illegal
 *    transition is a defect in `policy.ts`, not a runtime condition, so it
 *    fails loudly in a test rather than quietly in a trace.
 * 2. **Output validation.** Every tool result is parsed by its
 *    `strictObject` schema before it reaches memory. A capability that grew a
 *    field, or lost one, is a refusal the policy can act on — not a shape the
 *    controller silently reasons against.
 * 3. **No progress.** A step that leaves the machine in the same state with
 *    identical memory ends the run. This is the guard that matters most for a
 *    loop whose tool surface can legitimately return nothing.
 */

/** A defect in the policy, surfaced where a test can see it. */
export class IllegalTransitionError extends Error {
  readonly from: ControllerState;
  readonly to: ControllerState;

  constructor(from: ControllerState, to: ControllerState, rule: string) {
    super(
      `${rule} produced ${from} -> ${to}, which state.ts's ALLOWED_TRANSITIONS ` +
        `does not permit. Either the policy or the table is wrong.`,
    );
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

export interface RunControllerOptions {
  readonly runId: string;
  readonly tools: ToolRegistry;
  readonly budget?: number | undefined;
}

/**
 * Invoke one tool, validate what it answered, and never throw for it.
 *
 * `ARCHITECTURE.md §12` requires degradation to be *"visible in the report ...
 * not hidden"*. A capability that fails is therefore an **observation** the
 * policy acts on through `P0`, not an exception that ends the run without a
 * record of why.
 */
async function invoke(registry: ToolRegistry, call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case "close_report": {
        const raw = await registry.close_report(call.input);
        return { tool: "close_report", ok: true, value: TOOL_SCHEMAS.close_report.output.parse(raw) };
      }
      case "exception_queue": {
        const raw = await registry.exception_queue(call.input);
        return {
          tool: "exception_queue",
          ok: true,
          value: TOOL_SCHEMAS.exception_queue.output.parse(raw),
        };
      }
      case "decision_evidence": {
        const raw = await registry.decision_evidence(call.input);
        return {
          tool: "decision_evidence",
          ok: true,
          value: TOOL_SCHEMAS.decision_evidence.output.parse(raw),
        };
      }
      case "ledger_verify": {
        const raw = await registry.ledger_verify(call.input);
        return {
          tool: "ledger_verify",
          ok: true,
          value: TOOL_SCHEMAS.ledger_verify.output.parse(raw),
        };
      }
    }
  } catch (error) {
    return {
      tool: call.tool,
      ok: false,
      refusal: error instanceof Error ? error.message : "the capability failed",
    };
  }
}

/** What the no-progress guard compares. Cheap, total, and order-independent. */
function marker(state: ControllerState, memory: ControllerMemory): string {
  return [
    state,
    String(memory.cursor),
    String(memory.closing_set.length),
    String(memory.inspected.size),
    String(memory.escalated.length),
    memory.close === null ? "-" : "close",
    memory.queue === null ? "-" : "queue",
    memory.integrity === null ? "-" : "verified",
    memory.refusal === null ? "-" : "refused",
  ].join("|");
}

/**
 * Drive one batch to a terminal state and return the trace.
 *
 * Deterministic in full: the policy is a pure function of the observations, the
 * plan's ordering is total, and nothing here reads a clock, a random source or
 * an environment variable. Two executions over the same run produce
 * byte-identical traces, including {@link ControllerTrace.trace_id}, which is
 * content-addressed over the steps for exactly that reason.
 */
export async function runController(options: RunControllerOptions): Promise<ControllerTrace> {
  const budget = options.budget ?? DEFAULT_STEP_BUDGET;
  const steps: ControllerStep[] = [];
  const trajectory: ResidualPoint[] = [];
  const escalations: EscalationRecord[] = [];

  let state: ControllerState = "INIT";
  let memory = initialMemory(options.runId);
  let plan: ClosingPlan | null = null;
  let stop: StopReason | null = null;
  let halt: HaltReason | null = null;

  while (!isTerminal(state)) {
    const before = marker(state, memory);
    const t = decide(state, memory, steps.length, budget);

    if (!(ALLOWED_TRANSITIONS[state] as readonly string[]).includes(t.next)) {
      throw new IllegalTransitionError(state, t.next, t.rule);
    }

    let inputHash: string | null = null;
    let observationDigest: string | null = null;

    if (t.call !== null) {
      inputHash = digest(t.call.input);
      const result = await invoke(options.tools, t.call);
      observationDigest = digest(result.ok ? result.value : { refusal: result.refusal });
      memory = observe(memory, result);
      if (result.ok && result.tool === "close_report") {
        trajectory.push(
          Object.freeze({
            step_no: steps.length + 1,
            unresolved_value_paise: result.value.unresolved_value_paise,
            close_threshold_paise: result.value.close_threshold_paise,
            period_status: result.value.period_status,
          }),
        );
      }
    }

    if (t.plan !== null) {
      plan = t.plan;
      memory = Object.freeze({ ...memory, closing_set: t.plan.ids, cursor: 0 });
    }

    if (t.escalate !== null) {
      escalations.push(t.escalate);
      memory = Object.freeze({
        ...memory,
        escalated: Object.freeze([...memory.escalated, t.escalate]),
        cursor: memory.cursor + 1,
      });
    }

    steps.push(
      Object.freeze({
        step_no: steps.length + 1,
        state,
        rule_fired: t.rule,
        tool: t.call?.tool ?? null,
        tool_input_hash: inputHash,
        observation_digest: observationDigest,
        observation_summary: t.note,
        next_state: t.next,
        // Always empty in this phase: no step writes. See trace.ts.
        caused_events: Object.freeze([]),
        // Always null in this phase: the controller makes no model call.
        llm: null,
      }),
    );

    stop = t.stop;
    halt = t.halt;
    state = t.next;

    // The guard. A step that advanced nothing and stayed put would otherwise
    // spin — which is the real hazard for a loop whose tool surface can
    // legitimately answer with nothing at all.
    if (!isTerminal(state) && state === t.next && marker(state, memory) === before) {
      steps.push(
        Object.freeze({
          step_no: steps.length + 1,
          state,
          rule_fired: "P5_NO_PROGRESS",
          tool: null,
          tool_input_hash: null,
          observation_digest: null,
          observation_summary: "a full step changed nothing observable",
          next_state: "COMPLETE",
          caused_events: Object.freeze([]),
          llm: null,
        }),
      );
      stop = "NO_PROGRESS";
      halt = null;
      state = "COMPLETE";
    }
  }

  const frozenSteps = Object.freeze(steps);
  return Object.freeze({
    trace_id: traceId(options.runId, frozenSteps),
    run_id: options.runId,
    phase: "observe-only",
    terminal: state as TerminalState,
    stop_reason: state === "COMPLETE" ? stop : null,
    halt_reason: state === "HALT" ? halt : null,
    steps: frozenSteps,
    escalations: Object.freeze(escalations),
    plan,
    residual_trajectory: Object.freeze(trajectory),
    writes_attempted: 0,
    writes_applied: 0,
  });
}

/** Re-exported so a caller can compute a plan without driving the loop. */
export { closingSet };
