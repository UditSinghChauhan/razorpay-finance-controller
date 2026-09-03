import {
  DEFAULT_STEP_BUDGET,
  type ControllerState,
  type EscalationReason,
  type HaltReason,
  type PolicyRule,
  type StopReason,
} from "./state.js";
import type {
  CloseReportOutput,
  DecisionEvidenceOutput,
  ExceptionQueueOutput,
  LedgerVerifyOutput,
  QueueItem,
  ToolCall,
  ToolName,
  ToolResult,
} from "./tools.js";

/**
 * The deterministic policy — the whole of the controller's judgement.
 *
 * **No model is consulted here and none can be.** `DECISION_BRIEF.md §L.4`
 * prohibits *"adding an LLM call outside roles R1–R4"* without a spec
 * amendment, and a planner asked *"what should I do next?"* is a fifth role.
 * This module imports nothing that could reach a provider; what makes the loop
 * adaptive is not who chooses but that the choice is **re-derived from a fresh
 * observation after every action** — see {@link closingSet}, which is
 * recomputed rather than remembered.
 *
 * **It computes no monetary amount that leaves this module.** The greedy
 * accumulation in {@link closingSet} compares and sums figures it read from
 * sealed artifacts in order to select a **set of identifiers**; the plan it
 * returns is that set. No paise value derived here reaches a journal line, a
 * response field or the trace — every amount those carry is a passthrough of
 * something `packages/ledger` computed.
 */

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/** One item routed to a person, with everything a reviewer needs to act. */
export interface EscalationRecord {
  readonly decision_id: string;
  readonly entity_id: string;
  readonly obs_id: string;
  readonly kind: string;
  readonly reason: EscalationReason;
  /** `DATA_MODEL.md §14.1`'s `value(observation)`. A passthrough. */
  readonly value_paise: number;
  /** Non-null by construction: an item with no Suspense key is never eligible. */
  readonly suspense_key: string;
  readonly comp_id: string | null;
  /** `§13`'s reason, where the decision carries a certificate. */
  readonly certificate_reason: string | null;
  /** `§6.2`: what the probe loop tried before giving up. Read, never re-run. */
  readonly probes_attempted: readonly string[];
  /** `Δs` in bps, where a certificate exists. `0` is an exact tie. */
  readonly evidence_score_gap_bps: number | null;
  readonly epsilon_bps: number | null;
  readonly materiality_paise: number | null;
  readonly tau_paise: number | null;
  /**
   * Whether clearing this one item alone would bring the residual under the
   * close threshold.
   *
   * Decision-relevant to a reviewer deciding what to look at first, and
   * computed from figures the gate reported rather than asserted.
   */
  readonly closes_alone: boolean;
}

/**
 * Everything the controller knows. Immutable; every fold returns a new value.
 *
 * **There is no field a human authorisation could arrive in.** That is the
 * structural reason `APPLY_RESOLUTION` is unreachable in this phase: the state
 * requires a precondition that nothing in this type can express, so no rule
 * below can produce it. A later phase adds the field and a guard; this one
 * cannot be talked into a write.
 */
export interface ControllerMemory {
  readonly run_id: string;
  readonly integrity: LedgerVerifyOutput | null;
  readonly close: CloseReportOutput | null;
  readonly queue: ExceptionQueueOutput | null;
  /** The plan: decision ids, in the order they should be worked. */
  readonly closing_set: readonly string[];
  /** Index of the item currently being worked. */
  readonly cursor: number;
  readonly inspected: ReadonlyMap<string, DecisionEvidenceOutput>;
  readonly escalated: readonly EscalationRecord[];
  /** A tool that refused. Recorded as an observation, acted on by `P0`. */
  readonly refusal: { readonly tool: ToolName; readonly refusal: string } | null;
}

export function initialMemory(runId: string): ControllerMemory {
  return Object.freeze({
    run_id: runId,
    integrity: null,
    close: null,
    queue: null,
    closing_set: Object.freeze([]),
    cursor: 0,
    inspected: new Map<string, DecisionEvidenceOutput>(),
    escalated: Object.freeze([]),
    refusal: null,
  });
}

/** Fold one tool result into memory. Pure; the only way memory grows. */
export function observe(memory: ControllerMemory, result: ToolResult): ControllerMemory {
  if (!result.ok) {
    return Object.freeze({
      ...memory,
      refusal: Object.freeze({ tool: result.tool, refusal: result.refusal }),
    });
  }
  switch (result.tool) {
    case "ledger_verify":
      return Object.freeze({ ...memory, integrity: result.value });
    case "close_report":
      return Object.freeze({ ...memory, close: result.value });
    case "exception_queue":
      return Object.freeze({ ...memory, queue: result.value });
    case "decision_evidence": {
      const inspected = new Map(memory.inspected);
      inspected.set(result.value.decision_id, result.value);
      return Object.freeze({ ...memory, inspected });
    }
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Whether clearing this item could move `unresolved_value_paise` at all.
 *
 * **`suspense_key !== null` is the whole test, and it is not a proxy for
 * value.** `DATA_MODEL.md §17.1.1` is total over `Observation.kind` × terminal
 * state × `ExceptionClass`, and its `ledger_entry` row reads **"none"** in
 * *"any state, including `ABSTAINED` and `EXCEPTION`"* — because
 * `true_journal.source_entity_id` admits no `mle_…`, so *"truth posts no line
 * attributable to either kind"*. An exception on one therefore opens no
 * Suspense item, contributes nothing to `G3`'s residual, and cannot be part of
 * any set that closes the period — **however large its `value_paise` is**.
 *
 * This matters concretely rather than theoretically. A planner ranking the
 * queue on `value_paise` alone would work the largest rows first and could
 * spend an entire pass on items whose clearance moves the residual by zero,
 * while the one item actually blocking the close waited. `suspense_key` is the
 * field that distinguishes them, and it is already on every queue row.
 */
export function isEligible(item: QueueItem): boolean {
  return item.suspense_key !== null;
}

/** The plan, and the arithmetic that justifies it. */
export interface ClosingPlan {
  /** Decision ids to work, in order. */
  readonly ids: readonly string[];
  /** Queue rows that could move the residual at all. */
  readonly eligible: readonly QueueItem[];
  /** Rows that cannot, and the count is worth reporting rather than hiding. */
  readonly ineligible_count: number;
  /**
   * Whether the selected set is sufficient.
   *
   * `false` with a non-empty `ids` means even clearing everything eligible
   * leaves the period `OPEN` — a real finding about the batch, not an error.
   */
  readonly covers_residual: boolean;
  /** `true` when the residual is already under the threshold. */
  readonly already_under_threshold: boolean;
}

/**
 * The smallest set of Suspense items whose clearance would bring the residual
 * under the close threshold.
 *
 * Greedy, value-descending, `decision_id`-ascending on ties — so the plan is
 * total, reproducible, and identical across two runs of the same batch, which
 * is what makes the whole loop's outcome deterministic.
 *
 * **Recomputed, never remembered.** This is called from `PLAN` on every pass,
 * against whatever the gate and the queue said *that* pass. It is the reason
 * the loop is goal-directed rather than a script: it works the shortest path to
 * a closed period, and it re-derives that path after every observation.
 */
export function closingSet(
  close: CloseReportOutput,
  queue: ExceptionQueueOutput,
): ClosingPlan {
  const eligible = queue.items
    .filter(isEligible)
    .slice()
    .sort((a, b) =>
      b.value_paise !== a.value_paise
        ? b.value_paise - a.value_paise
        : a.decision_id < b.decision_id
          ? -1
          : a.decision_id > b.decision_id
            ? 1
            : 0,
    );
  const ineligible_count = queue.items.length - eligible.length;

  // The gap between what is unresolved and what the gate will tolerate. Both
  // figures are `packages/ledger`'s; the subtraction selects ids and produces
  // nothing that leaves this function.
  const need = close.unresolved_value_paise - close.close_threshold_paise;
  if (need <= 0) {
    return Object.freeze({
      ids: Object.freeze([]),
      eligible: Object.freeze(eligible),
      ineligible_count,
      covers_residual: true,
      already_under_threshold: true,
    });
  }

  const ids: string[] = [];
  let covered = 0;
  for (const item of eligible) {
    if (covered >= need) break;
    ids.push(item.decision_id);
    covered += item.value_paise;
  }

  return Object.freeze({
    ids: Object.freeze(ids),
    eligible: Object.freeze(eligible),
    ineligible_count,
    covers_residual: covered >= need,
    already_under_threshold: false,
  });
}

/** Whether one item alone would bring the residual under the threshold. */
function closesAlone(close: CloseReportOutput, item: QueueItem): boolean {
  return close.unresolved_value_paise - item.value_paise <= close.close_threshold_paise;
}

/**
 * Why this item goes to a person.
 *
 * A certificate is the first and unconditional answer. `§13` makes it non-null
 * exactly on an `ABSTAINED` decision, which is exactly the case ASSAY could not
 * decide — so the controller has strictly less to go on than the engine did.
 */
export function escalationReasonFor(evidence: DecisionEvidenceOutput): EscalationReason {
  return evidence.certificate !== null ? "AMBIGUOUS_CERTIFICATE" : "NO_DETERMINISTIC_WARRANT";
}

/** Build the record a reviewer receives. Every figure is a passthrough. */
export function escalationFor(
  close: CloseReportOutput,
  item: QueueItem,
  evidence: DecisionEvidenceOutput,
): EscalationRecord {
  const cert = evidence.certificate;
  return Object.freeze({
    decision_id: evidence.decision_id,
    entity_id: evidence.entity_id,
    obs_id: item.obs_id,
    kind: evidence.kind,
    reason: escalationReasonFor(evidence),
    value_paise: evidence.value_paise,
    // Non-null by construction: `isEligible` gates every path that reaches here.
    suspense_key: evidence.suspense_key ?? item.suspense_key ?? "",
    comp_id: evidence.comp_id,
    certificate_reason: cert?.reason ?? null,
    probes_attempted: cert?.probes_attempted ?? Object.freeze([]),
    evidence_score_gap_bps: cert?.evidence_score_gap_bps ?? null,
    epsilon_bps: cert?.epsilon_bps ?? null,
    materiality_paise: cert?.materiality_paise ?? null,
    tau_paise: cert?.tau_paise ?? null,
    closes_alone: closesAlone(close, item),
  });
}

// ---------------------------------------------------------------------------
// The transition
// ---------------------------------------------------------------------------

/** One decision the policy took, and everything it implies for the driver. */
export interface Transition {
  readonly rule: PolicyRule;
  readonly next: ControllerState;
  /** A read to perform before the next decision, or `null`. */
  readonly call: ToolCall | null;
  /** An item to record as escalated, or `null`. */
  readonly escalate: EscalationRecord | null;
  /** The plan, on the pass that computed it. */
  readonly plan: ClosingPlan | null;
  readonly stop: StopReason | null;
  readonly halt: HaltReason | null;
  /** One line for the trace. Names the fact the rule turned on. */
  readonly note: string;
}

function transition(t: Partial<Transition> & Pick<Transition, "rule" | "next" | "note">): Transition {
  return Object.freeze({
    call: null,
    escalate: null,
    plan: null,
    stop: null,
    halt: null,
    ...t,
  });
}

/** `P0` — the four ways the controller stops trusting what it is looking at. */
function integrityHalt(memory: ControllerMemory): { reason: HaltReason; note: string } | null {
  if (memory.refusal !== null) {
    return {
      reason: "TOOL_REFUSED",
      note: `${memory.refusal.tool} refused: ${memory.refusal.refusal}`,
    };
  }
  const v = memory.integrity;
  if (v !== null && (!v.chain_ok || !v.root_matches)) {
    return {
      reason: "CHAIN_BROKEN",
      note: "the hash chain does not recompute from genesis to the stored root",
    };
  }
  if (v !== null && !v.trial_balance_ok) {
    return { reason: "TRIAL_BALANCE_FAILED", note: "Σ dr ≠ Σ cr on the projected log" };
  }
  const c = memory.close;
  if (c !== null && c.period_status === "BLOCKED") {
    return {
      reason: "PERIOD_BLOCKED",
      note: `the close gate reported BLOCKED; failed gates ${c.gate.failed_gates.join(", ")}`,
    };
  }
  if (c !== null && !c.gate.g2_trial_balance) {
    return { reason: "TRIAL_BALANCE_FAILED", note: "gate G2 failed" };
  }
  if (c !== null && !c.gate.g4_hash_chain) {
    return { reason: "CHAIN_BROKEN", note: "gate G4 failed" };
  }
  return null;
}

/**
 * Choose the next action from the current state and the freshest observation.
 *
 * Rule order is `P0` first, unconditionally: a defective ledger outranks every
 * goal the controller has. The budget is checked second, so a run that is out
 * of steps still reports an integrity finding rather than swallowing it.
 */
export function decide(
  state: ControllerState,
  memory: ControllerMemory,
  stepsTaken: number,
  budget: number = DEFAULT_STEP_BUDGET,
): Transition {
  const halt = integrityHalt(memory);
  if (halt !== null) {
    return transition({
      rule: "P0_INTEGRITY",
      next: "HALT",
      halt: halt.reason,
      note: halt.note,
    });
  }

  if (stepsTaken >= budget) {
    return transition({
      rule: "SEQ_BUDGET",
      next: "COMPLETE",
      stop: "BUDGET_EXHAUSTED",
      note: `step budget of ${String(budget)} exhausted; result is partial`,
    });
  }

  switch (state) {
    case "INIT":
      return transition({
        rule: "SEQ_VERIFY",
        next: "OBSERVE_CLOSE",
        call: { tool: "ledger_verify", input: { run_id: memory.run_id } },
        note: "recompute the chain from genesis before acting on anything",
      });

    case "OBSERVE_CLOSE": {
      if (memory.close === null) {
        return transition({
          rule: "SEQ_OBSERVE",
          next: "OBSERVE_CLOSE",
          call: { tool: "close_report", input: { run_id: memory.run_id } },
          note: "read the close gate and the quantified residual",
        });
      }
      if (memory.close.period_status === "CLOSED") {
        return transition({
          rule: "P1_ALREADY_CLOSED",
          next: "COMPLETE",
          stop: "CLOSED",
          note: "the period is CLOSED; there is no residual to work",
        });
      }
      return transition({
        rule: "SEQ_OBSERVE",
        next: "TRIAGE",
        note:
          `period ${memory.close.period_status} on ` +
          `${String(memory.close.unresolved_value_paise)} paise unresolved against a ` +
          `threshold of ${String(memory.close.close_threshold_paise)}`,
      });
    }

    case "TRIAGE": {
      if (memory.queue === null) {
        return transition({
          rule: "SEQ_TRIAGE",
          next: "TRIAGE",
          call: { tool: "exception_queue", input: { run_id: memory.run_id } },
          note: "read both populations, value-ranked",
        });
      }
      const abstained = memory.queue.items.filter((i) => i.state === "ABSTAINED").length;
      const exceptions = memory.queue.items.filter((i) => i.state === "EXCEPTION").length;
      return transition({
        rule: "SEQ_TRIAGE",
        next: "PLAN",
        note:
          `${String(memory.queue.total)} queue items: ${String(abstained)} abstained, ` +
          `${String(exceptions)} exceptions`,
      });
    }

    case "PLAN": {
      // Unreachable with either absent: `OBSERVE_CLOSE` and `TRIAGE` each hold
      // their state until their read has landed.
      if (memory.close === null || memory.queue === null) {
        return transition({
          rule: "P5_NO_PROGRESS",
          next: "COMPLETE",
          stop: "NO_PROGRESS",
          note: "reached PLAN without both observations",
        });
      }
      const plan = closingSet(memory.close, memory.queue);
      if (plan.ids.length === 0) {
        return transition({
          rule: "P2_NO_CLOSING_SET",
          next: "COMPLETE",
          stop: plan.already_under_threshold ? "CLOSED" : "NO_ELIGIBLE_ITEM",
          plan,
          note: plan.already_under_threshold
            ? "the residual is already under the close threshold"
            : `no queue item opens a Suspense item; ${String(plan.ineligible_count)} of ` +
              `${String(memory.queue.items.length)} cannot move the residual`,
        });
      }
      return transition({
        rule: "SEQ_PLAN",
        next: "ACT",
        plan,
        note:
          `closing set of ${String(plan.ids.length)} from ${String(plan.eligible.length)} ` +
          `eligible (${String(plan.ineligible_count)} open no Suspense item)` +
          (plan.covers_residual ? "" : "; even all of it leaves the period OPEN"),
      });
    }

    case "ACT": {
      const id = memory.closing_set[memory.cursor];
      if (id === undefined) {
        return transition({
          rule: "P4_ADVANCE_CURSOR",
          next: "ESCALATE",
          note: "closing set worked through",
        });
      }
      if (!memory.inspected.has(id)) {
        return transition({
          rule: "SEQ_INSPECT",
          next: "ACT",
          call: { tool: "decision_evidence", input: { run_id: memory.run_id, decision_id: id } },
          note: `inspect ${id}`,
        });
      }
      const evidence = memory.inspected.get(id);
      const item = memory.queue?.items.find((i) => i.decision_id === id);
      if (evidence === undefined || item === undefined || memory.close === null) {
        return transition({
          rule: "P5_NO_PROGRESS",
          next: "COMPLETE",
          stop: "NO_PROGRESS",
          note: `evidence for ${id} did not arrive`,
        });
      }
      const record = escalationFor(memory.close, item, evidence);
      return transition({
        rule: "P3_ESCALATE",
        next: "ESCALATE",
        escalate: record,
        note:
          record.certificate_reason === null
            ? `${id} has no certificate and no deterministic warrant`
            : `${id} carries a ${record.certificate_reason} certificate, gap ` +
              `${String(record.evidence_score_gap_bps ?? 0)} bps against ε ` +
              `${String(record.epsilon_bps ?? 0)} bps`,
      });
    }

    case "ESCALATE": {
      if (memory.cursor < memory.closing_set.length) {
        return transition({
          rule: "P4_ADVANCE_CURSOR",
          next: "ACT",
          note:
            `item ${String(memory.cursor)} of ${String(memory.closing_set.length)} escalated; ` +
            `next`,
        });
      }
      return transition({
        rule: "P4_ADVANCE_CURSOR",
        next: "AWAIT_HUMAN",
        note: `all ${String(memory.escalated.length)} escalations recorded`,
      });
    }

    case "AWAIT_HUMAN":
      // The designed handoff. This phase has no authorisation channel — no
      // field of `ControllerMemory` can carry one — so the loop completes here
      // rather than waiting on something that cannot arrive. `ESCALATED` is a
      // successful completion: the contract was to close the period or name
      // the residual, and a named residual in front of a reviewer is the
      // second of those.
      return transition({
        rule: "SEQ_HANDOFF",
        next: "COMPLETE",
        stop: "ESCALATED",
        note:
          `${String(memory.escalated.length)} item(s) awaiting human review; no financial ` +
          `write is available in this phase`,
      });

    case "APPLY_RESOLUTION":
    case "RECHECK":
      // Unreachable: no tool writes and no memory field can carry an
      // authorisation, so nothing can produce either state's precondition.
      // `tests/state.test.ts` proves it over four scenarios. Answered rather
      // than thrown so the machine is total.
      return transition({
        rule: "P0_INTEGRITY",
        next: "HALT",
        halt: "TOOL_REFUSED",
        note: `${state} is not reachable in an observe-only phase`,
      });

    case "COMPLETE":
    case "HALT":
      return transition({
        rule: "P5_NO_PROGRESS",
        next: state,
        stop: "NO_PROGRESS",
        note: "already terminal",
      });
  }
}
