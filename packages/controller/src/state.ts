/**
 * The close controller's states, terminal reasons and policy rule identifiers.
 *
 * **What this package is.** An orchestrator over capabilities ASSAY already
 * froze. It chooses *which* existing capability runs next; it evaluates no
 * constraint, ranks no candidate, decides no terminal state and computes no
 * monetary amount. `ARCHITECTURE.md §3` gives `packages/engine` the
 * deterministic core and `packages/ledger` the books, and this package reaches
 * neither: it consumes their *outputs* as values.
 *
 * **What it is not, and the name says so.** `Agent` and `AgentId` in
 * `packages/eval` mean a **benchmark arm** — `EVALUATION_SPEC.md §3`'s seven,
 * `ASSAY` / `B0`–`B2` / `A1`–`A3` — and that vocabulary is load-bearing for the
 * ablation design. Nothing here is named `agent`, and this package is not one:
 * it is scored by nothing, it appears in no sweep, and it changes no metric.
 *
 * **The planner is code, and that is forced rather than preferred.**
 * `DECISION_BRIEF.md §L.4` prohibits *"adding an LLM call outside roles R1–R4,
 * or outside the `LlmProvider` interface"* without a spec amendment. A model
 * asked *"what should I do next?"* would be a fifth role. So the policy in
 * `policy.ts` is a deterministic rule table over the last observation, and the
 * model keeps exactly the job `R4` already gives it — explaining a decision
 * that was already made, which this phase does not even invoke.
 *
 * **This phase performs no financial write.** Two of the nine states below are
 * declared and **unreachable**, by construction rather than by convention: no
 * tool in `tools.ts` writes, and `ControllerMemory` carries no field a human
 * authorisation could arrive in, so no rule in `policy.ts` can produce the
 * precondition either state requires. `tests/reachability.test.ts` proves the
 * reachable set excludes them by exhausting the transition relation from
 * `INIT`. They are present so that the machine's shape is the designed shape
 * and a later phase widens a guard rather than reshaping a union.
 */

/**
 * The nine states, in the order a run traverses them.
 *
 * ```
 *   INIT ─▶ OBSERVE_CLOSE ─▶ TRIAGE ─▶ PLAN ─▶ ACT ─▶ ESCALATE ─▶ AWAIT_HUMAN
 *             ▲                                                        │
 *             └──────────── RECHECK ◀── APPLY_RESOLUTION ◀─────────────┘
 *                              (both unreachable in this phase)
 *   any ─▶ HALT          on a ledger integrity finding
 *   any ─▶ COMPLETE      on a stop condition
 * ```
 */
export const CONTROLLER_STATES = Object.freeze([
  "INIT",
  "OBSERVE_CLOSE",
  "TRIAGE",
  "PLAN",
  "ACT",
  "ESCALATE",
  "AWAIT_HUMAN",
  "APPLY_RESOLUTION",
  "RECHECK",
  "COMPLETE",
  "HALT",
] as const);

export type ControllerState = (typeof CONTROLLER_STATES)[number];

/**
 * The two states this phase cannot enter, named so the guarantee is data.
 *
 * `APPLY_RESOLUTION` would call `DATA_MODEL.md §17.1`'s `P7` and append a
 * `§16` `RESOLVE` event; `RECHECK` exists only to re-read the gate *after* such
 * a write. Neither has a caller here, and the reachability test asserts it
 * against this list rather than against a copy of it.
 */
export const WRITE_PHASE_STATES = Object.freeze([
  "APPLY_RESOLUTION",
  "RECHECK",
] as const);

export type WritePhaseState = (typeof WRITE_PHASE_STATES)[number];

/** States from which no transition leaves. */
export const TERMINAL_STATES = Object.freeze(["COMPLETE", "HALT"] as const);

export type TerminalState = (typeof TERMINAL_STATES)[number];

export function isTerminal(state: ControllerState): state is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/**
 * Why the loop stopped, on the `COMPLETE` path.
 *
 * `CLOSED` and `ESCALATED` are both successful completions and they are
 * different facts about the batch: the first means the gate closed the period,
 * the second means the residual is real, named, and now in front of a person.
 * `RECONCILIATION_SPEC.md §10.2`'s `OPEN` outcome is *"quantified"* rather than
 * a failure, and this union keeps that distinction rather than collapsing it
 * into a boolean.
 */
export const STOP_REASONS = Object.freeze([
  /** The close gate returned `CLOSED`. Nothing was left to do. */
  "CLOSED",
  /**
   * Every item that blocks the close has been escalated for human review.
   *
   * The terminal reason for this phase. It is not a partial result: the
   * contract was to drive the batch to a terminal status or name the residual,
   * and a named residual in front of a reviewer is the second of those.
   */
  "ESCALATED",
  /** Nothing in the queue can move the residual. The period stays `OPEN`. */
  "NO_ELIGIBLE_ITEM",
  /** A full pass changed no state. Guards a loop with an empty tool surface. */
  "NO_PROGRESS",
  /** The step budget ran out. Reported as partial, never dressed as complete. */
  "BUDGET_EXHAUSTED",
] as const);

export type StopReason = (typeof STOP_REASONS)[number];

/**
 * Why the loop halted, on the `HALT` path.
 *
 * A halt is not a stop. It means the ledger told the controller something was
 * wrong, and the controller stopped rather than continuing to act on it.
 * `RECONCILIATION_SPEC.md §10.2` gives `BLOCKED` to a *defect*, and
 * `ARCHITECTURE.md §12` requires degradation to be visible rather than hidden;
 * a controller that kept planning against a broken chain would be hiding it.
 */
export const HALT_REASONS = Object.freeze([
  /** `G4` failed, or an independent recompute disagreed with the stored root. */
  "CHAIN_BROKEN",
  /** `G2` failed — `Σ dr ≠ Σ cr` on the projected log. */
  "TRIAL_BALANCE_FAILED",
  /** The close gate reported `BLOCKED`: `§10.2` emits no report at all. */
  "PERIOD_BLOCKED",
  /** A tool refused, and the policy has no rule for the refusal. */
  "TOOL_REFUSED",
] as const);

export type HaltReason = (typeof HALT_REASONS)[number];

/**
 * Why one item was routed to a human rather than acted on.
 *
 * Escalation is the **normal** path on this surface, not the failure path.
 * `DECISION_BRIEF.md §L.5` sentence 2: ASSAY abstains *"because a plausible
 * wrong answer costs more than an honest refusal"*. A controller that resolved
 * an abstention would be re-supplying the answer the certificate exists to
 * withhold, so `AMBIGUOUS_CERTIFICATE` is unconditional and is first.
 */
export const ESCALATION_REASONS = Object.freeze([
  /**
   * The decision carries a `DATA_MODEL.md §13` certificate.
   *
   * The evidence admits two materially different allocations and ASSAY
   * declined to choose between them. `DECISION_BRIEF.md §L.5` sentence 2 gives
   * the reason — *"a plausible wrong answer costs more than an honest
   * refusal"* — and nothing in this package is better placed to choose than
   * the engine that refused. The certificate's own `reason`, `probes_attempted`
   * and thresholds travel on the escalation record beside this, so *what was
   * tried* is reported without being re-attempted.
   */
  "AMBIGUOUS_CERTIFICATE",
  /**
   * It carries no certificate, and no deterministic warrant exists either.
   *
   * The reason a Suspense-opening `EXCEPTION` is escalated. `§17.1`'s `P7`
   * requires *"the correct posting"* to follow the reversal, and the correct
   * posting is the thing that is not known — so there is no rule this phase
   * could apply even if it were permitted to write.
   */
  "NO_DETERMINISTIC_WARRANT",
] as const);

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

/**
 * The policy rules of `policy.ts`, in evaluation order.
 *
 * Recorded on every trace step as `rule_fired`, which is what makes the trace
 * an audit record rather than a log: each action names the rule that produced
 * it, so a reviewer can check the loop's reasoning without re-running it.
 */
export const POLICY_RULES = Object.freeze([
  /**
   * Integrity outranks every goal. Evaluated first, always.
   *
   * Fires on a chain that does not recompute, a trial balance that does not
   * balance, a period the gate reported `BLOCKED`, or a tool that refused —
   * the four ways the controller can stop being able to trust what it is
   * looking at. `ARCHITECTURE.md §12` requires degradation to be visible
   * rather than hidden, and a loop that kept planning against a broken chain
   * would be hiding it.
   */
  "P0_INTEGRITY",
  /** The gate already returned `CLOSED`. Nothing to do. */
  "P1_ALREADY_CLOSED",
  /** No queue item can move the residual. The period stays `OPEN`, quantified. */
  "P2_NO_CLOSING_SET",
  /** The head of the closing set needs a person. This phase's terminal decision. */
  "P3_ESCALATE",
  /** One item escalated; move to the next, or hand the set over. */
  "P4_ADVANCE_CURSOR",
  /** A step changed nothing observable. The loop guard. */
  "P5_NO_PROGRESS",

  // The mechanical steps. Not policy decisions — recorded with the same
  // fidelity so that the trace accounts for every step, not only the
  // interesting ones.
  /** Opening integrity read. */
  "SEQ_VERIFY",
  /** Read the gate. */
  "SEQ_OBSERVE",
  /** Read the queue. */
  "SEQ_TRIAGE",
  /** Read one decision's evidence and certificate. */
  "SEQ_INSPECT",
  /** The closing set is computed. */
  "SEQ_PLAN",
  /** Every escalation is recorded; the set is now a person's. */
  "SEQ_HANDOFF",
  /** The step budget ran out. */
  "SEQ_BUDGET",
] as const);

export type PolicyRule = (typeof POLICY_RULES)[number];

/**
 * The transition relation, as data.
 *
 * Declared rather than left implicit in `policy.ts`'s control flow so that
 * reachability is a property a test can compute. `policy.ts` is the only
 * producer of transitions, and `tests/reachability.test.ts` asserts both
 * directions: every transition the policy can produce appears here, and the
 * states reachable from `INIT` exclude {@link WRITE_PHASE_STATES}. So this
 * table cannot drift into describing a machine the code does not implement.
 *
 * **The self-edges are gathering steps.** `OBSERVE_CLOSE`, `TRIAGE` and `ACT`
 * each issue a read and remain where they are until the observation has been
 * folded into memory; the state advances when it has something to decide with.
 * That is the loop's honest shape: an action, then an observation, then a
 * decision taken on the observation rather than on an assumption.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ControllerState, readonly ControllerState[]>> =
  Object.freeze({
    INIT: Object.freeze(["OBSERVE_CLOSE"] as const),
    OBSERVE_CLOSE: Object.freeze(["OBSERVE_CLOSE", "TRIAGE", "COMPLETE", "HALT"] as const),
    TRIAGE: Object.freeze(["TRIAGE", "PLAN", "COMPLETE", "HALT"] as const),
    PLAN: Object.freeze(["ACT", "COMPLETE", "HALT"] as const),
    ACT: Object.freeze(["ACT", "ESCALATE", "COMPLETE", "HALT"] as const),
    ESCALATE: Object.freeze(["ACT", "AWAIT_HUMAN", "COMPLETE", "HALT"] as const),
    AWAIT_HUMAN: Object.freeze(["APPLY_RESOLUTION", "COMPLETE"] as const),
    APPLY_RESOLUTION: Object.freeze(["RECHECK", "HALT"] as const),
    RECHECK: Object.freeze(["OBSERVE_CLOSE", "HALT"] as const),
    COMPLETE: Object.freeze([] as const),
    HALT: Object.freeze([] as const),
  });

/** The default step bound. A bound, not a goal — hitting it is reported. */
export const DEFAULT_STEP_BUDGET = 64;
