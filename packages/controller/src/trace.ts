import { hashCanonical } from "@assay/ledger";
import type { CanonicalValue } from "@assay/domain";

import type { ClosingPlan, EscalationRecord } from "./policy.js";
import type {
  ControllerState,
  HaltReason,
  PolicyRule,
  StopReason,
  TerminalState,
} from "./state.js";
import type { ToolName } from "./tools.js";

/**
 * The controller's execution trace — a **product-layer** record.
 *
 * ## Why this is not a ledger event
 *
 * `DATA_MODEL.md §16`'s `EventKind` is a closed nine-member union. Adding a
 * tenth for orchestration telemetry would be a spec amendment for a record
 * that carries **no financial consequence** — and the consequence that does
 * exist already has a member in that union, `RESOLVE`, which a later phase
 * uses and this one does not. So the trace lives beside the chain rather than
 * in it, and points at it.
 *
 * That pointer is `caused_events`. It is empty on every step of this phase,
 * because no step writes. It is the field that keeps the trace honest: the
 * trace asserts no financial fact of its own, it names the events that carry
 * them.
 *
 * ## Why `rule_fired` is the important field
 *
 * It is what makes this an audit record rather than a log. Every step names
 * the policy rule that produced it, so a reviewer can check the loop's
 * reasoning against `state.ts`'s rule table without re-running anything — and
 * a rule that fired where it should not have is visible as a rule, not
 * inferred from behaviour.
 *
 * ## Hashes rather than bodies
 *
 * `tool_input_hash` and `observation_digest` are
 * `sha256(canonical_json(value))` via `packages/ledger`'s own
 * {@link hashCanonical}, which is the encoding `DATA_MODEL.md §0` rule 5 fixes
 * for every `*_hash` field in the specification. Digests rather than bodies
 * because the bodies are already served by the endpoints the tools call, and a
 * trace that copied them would be a second, divergeable copy of financial
 * figures. `observation_summary` carries the small typed facts the policy
 * actually turned on, so the trace is readable without a join.
 */

/** One step: what the controller did, why, and what it saw. */
export interface ControllerStep {
  readonly step_no: number;
  readonly state: ControllerState;
  /** Why this action and not another. `state.ts`'s rule table. */
  readonly rule_fired: PolicyRule;
  readonly tool: ToolName | null;
  /** `sha256(canonical_json(input))`, or `null` where no tool was called. */
  readonly tool_input_hash: string | null;
  /** `sha256(canonical_json(output))`, or `null`. */
  readonly observation_digest: string | null;
  /** The facts the rule turned on, small and typed. Never free model text. */
  readonly observation_summary: string;
  readonly next_state: ControllerState;
  /**
   * `§16` event ids this step caused.
   *
   * Empty on every step of this phase. The field exists because the trace's
   * only claim to financial relevance is this join, and a join that appears
   * later is a schema change; a join that is always present and always empty
   * is a guarantee.
   */
  readonly caused_events: readonly string[];
  /**
   * The `R4` call this step made, or `null`.
   *
   * `null` on every step of this phase: the controller makes no model call at
   * all. The field is declared so that a phase which adds an explanatory brief
   * records it where a reviewer already looks.
   */
  readonly llm: { readonly role: "R4"; readonly provider: string; readonly status: string } | null;
}

/** One point on the residual trajectory, one per gate reading. */
export interface ResidualPoint {
  readonly step_no: number;
  readonly unresolved_value_paise: number;
  readonly close_threshold_paise: number;
  readonly period_status: string;
}

/** One complete controller execution. */
export interface ControllerTrace {
  readonly trace_id: string;
  readonly run_id: string;
  /** `"observe-only"` for this phase. Names what the trace could possibly do. */
  readonly phase: "observe-only";
  readonly terminal: TerminalState;
  readonly stop_reason: StopReason | null;
  readonly halt_reason: HaltReason | null;
  readonly steps: readonly ControllerStep[];
  readonly escalations: readonly EscalationRecord[];
  /** The plan, as last computed. `null` if `PLAN` was never reached. */
  readonly plan: ClosingPlan | null;
  readonly residual_trajectory: readonly ResidualPoint[];
  /**
   * Writes attempted, and writes applied. Both `0`, and asserted to be.
   *
   * Carried rather than omitted because *"it performed no write"* is the
   * central claim of this phase, and a claim a reader can check on the record
   * is stronger than one they have to take from a docstring.
   */
  readonly writes_attempted: number;
  readonly writes_applied: number;
}

/**
 * `sha256(canonical_json(value))`, the specification's hash shape.
 *
 * Values reaching here are tool inputs and outputs — JSON already, by
 * construction, since they crossed a schema in `tools.ts`.
 */
export function digest(value: unknown): string {
  return hashCanonical(value as CanonicalValue);
}

/**
 * The trace id: content-addressed over the run and the steps.
 *
 * Deliberately **not** random. Two executions of the same batch produce the
 * same steps and therefore the same id, which is the loop's determinism
 * visible on the artifact rather than asserted about it — the same property
 * `StoredRun.run_id` has, and for the same reason.
 */
export function traceId(runId: string, steps: readonly ControllerStep[]): string {
  return digest({
    run_id: runId,
    steps: steps.map((s) => [s.step_no, s.state, s.rule_fired, s.next_state] as const),
  });
}
