/**
 * `@assay/controller` — the ASSAY close controller.
 *
 * A bounded orchestrator over capabilities ASSAY already froze. It observes a
 * completed run, computes the shortest path to a closed period, inspects the
 * items on that path, and routes what it may not decide to a person.
 *
 * **Three things it is not.**
 *
 * - **Not a benchmark agent.** `Agent`/`AgentId` in `packages/eval` mean an
 *   arm of `EVALUATION_SPEC.md §3`'s ablation design. Nothing here is scored,
 *   appears in a sweep, or changes a metric, and no identifier in this package
 *   contains the token `agent`.
 * - **Not a decision-maker.** `packages/engine` decides; this package chooses
 *   which frozen capability runs next. It computes no monetary amount that
 *   leaves it, constructs no `ValidatedDecision`, and holds no threshold.
 * - **Not a model client.** Its policy is deterministic code, because
 *   `DECISION_BRIEF.md §L.4` prohibits an LLM call outside roles `R1`–`R4` and
 *   a planner would be a fifth. This package imports no provider and makes no
 *   model call at all.
 *
 * **This phase performs no financial write.** Its terminal state is human
 * review. `DATA_MODEL.md §17.1`'s `P7` and `§16`'s `RESOLVE` are both frozen
 * and already implemented in `packages/ledger`; becoming their caller is a
 * later phase, and nothing here is a step toward doing it accidentally — the
 * tool registry declares four reads, and `ControllerMemory` has no field a
 * human authorisation could arrive in.
 */

export {
  ALLOWED_TRANSITIONS,
  CONTROLLER_STATES,
  DEFAULT_STEP_BUDGET,
  ESCALATION_REASONS,
  HALT_REASONS,
  POLICY_RULES,
  STOP_REASONS,
  TERMINAL_STATES,
  WRITE_PHASE_STATES,
  isTerminal,
  type ControllerState,
  type EscalationReason,
  type HaltReason,
  type PolicyRule,
  type StopReason,
  type TerminalState,
  type WritePhaseState,
} from "./state.js";

export {
  CertificateReasonSchema,
  CertificateSchema,
  CloseReportInputSchema,
  CloseReportOutputSchema,
  DecisionEvidenceInputSchema,
  DecisionEvidenceOutputSchema,
  DecisionStateSchema,
  ExceptionQueueInputSchema,
  ExceptionQueueOutputSchema,
  LedgerVerifyInputSchema,
  LedgerVerifyOutputSchema,
  PeriodStatusSchema,
  QueueItemSchema,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  type Certificate,
  type CloseReportInput,
  type CloseReportOutput,
  type DecisionEvidenceInput,
  type DecisionEvidenceOutput,
  type ExceptionQueueInput,
  type ExceptionQueueOutput,
  type LedgerVerifyInput,
  type LedgerVerifyOutput,
  type QueueItem,
  type ToolCall,
  type ToolName,
  type ToolRegistry,
  type ToolResult,
} from "./tools.js";

export {
  closingSet,
  decide,
  escalationFor,
  escalationReasonFor,
  initialMemory,
  isEligible,
  observe,
  type ClosingPlan,
  type ControllerMemory,
  type EscalationRecord,
  type Transition,
} from "./policy.js";

export {
  digest,
  traceId,
  type ControllerStep,
  type ControllerTrace,
  type ResidualPoint,
} from "./trace.js";

export {
  IllegalTransitionError,
  runController,
  type RunControllerOptions,
} from "./machine.js";
