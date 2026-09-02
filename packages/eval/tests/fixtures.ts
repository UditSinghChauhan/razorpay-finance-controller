import {
  ObservationSchema,
  isObservationId,
  type Observation,
  type ObservationId,
  type ObservationKind,
} from "@assay/domain";
import type { AccountCode } from "@assay/domain";
import { paise } from "@assay/money";

import type {
  AbstentionRecord,
  AgentRun,
  AllocationEdge,
  CloseOutcome,
  ObservationOutcome,
  OpenExceptionRecord,
  PostedLine,
} from "../src/index.js";

/**
 * Hand-built fixtures for the measurement layer's tests.
 *
 * `PREREGISTRATION.md §6.1` forbids a test from touching a split seed or
 * invoking the generator, and `AL7` burns a seed on any breach. Every
 * observation here is constructed by hand and validated against the frozen
 * `ObservationSchema`, so a fixture that drifts from the schema fails to build
 * rather than testing a shape ingest would reject — the discipline
 * `packages/oracle/tests/fixtures.ts` already applies for the same reason.
 *
 * The `AgentRun` builders below construct **no** agent. They assemble the value
 * an agent would return, which is what `EVALUATION_SPEC.md §4`'s metrics read.
 */

const DAY = 86_400;
/** An arbitrary in-period instant. No split seed and no generator is involved. */
export const T0 = 1_783_000_000;

let counter = 0;
const obsId = (): string => `obs_${String(counter++).padStart(14, "0")}`;
const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(14, "0")}`;

export const PAY = (n: number): string => pad("pay_", n);
export const RFND = (n: number): string => pad("rfnd_", n);
export const ADJ = (n: number): string => pad("adj_", n);
export const SETL = (n: number): string => pad("setl_", n);
export const ORDER = (n: number): string => pad("order_", n);
export const BNK = (n: number): string => pad("bnk_", n);
export const LEDG = (n: number): string => pad("ldgr_", n);
/** `DATA_MODEL.md §8`'s grammar, which `LEDG` above deliberately is not. */
export const MLE = (n: number): string => pad("mle_", n);
export { DAY };

export type ReconObs = Extract<Observation, { kind: "recon_line" | "adjustment" }>;
export type SettlementObs = Extract<Observation, { kind: "settlement" }>;
export type BankLineObs = Extract<Observation, { kind: "bank_line" }>;

export interface ReconLineSpec {
  readonly entity: string;
  readonly type: "payment" | "refund" | "adjustment";
  readonly amount: number;
  readonly fee?: number;
  readonly tax?: number;
  readonly created_at?: number;
  readonly settled_at?: number | null;
  readonly settlement_id?: string | null;
  readonly order_id?: string | null;
  readonly payment_id?: string | null;
  readonly on_hold?: boolean;
  readonly debit?: number;
  readonly credit?: number;
}

/** A recon line honouring `C5`'s identity unless a caller deliberately breaks it. */
export function reconLine(spec: ReconLineSpec): ReconObs {
  const fee = spec.fee ?? 0;
  const tax = spec.tax ?? 0;
  const isRefund = spec.type === "refund";
  const isAdjustment = spec.type === "adjustment";
  const credit = spec.credit ?? (isRefund || isAdjustment ? 0 : spec.amount - fee);
  const settledAt = spec.settled_at === undefined ? T0 + 2 * DAY : spec.settled_at;
  const debit = spec.debit ?? (isRefund || isAdjustment ? spec.amount : 0);
  const parsed = ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "pg_recon",
    source_file: "pg_recon.jsonl",
    source_line: counter,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    kind: isAdjustment ? "adjustment" : "recon_line",
    payload: {
      entity_id: spec.entity,
      type: spec.type,
      debit: paise(debit),
      credit: paise(credit),
      amount: paise(spec.amount),
      currency: "INR",
      fee: paise(fee),
      tax: paise(tax),
      on_hold: spec.on_hold ?? false,
      settled: settledAt !== null,
      created_at: spec.created_at ?? T0,
      settled_at: settledAt,
      settlement_id: spec.settlement_id ?? null,
      posted_at: null,
      credit_type: "default",
      payment_id: spec.payment_id ?? null,
      settlement_utr: null,
      order_id: spec.order_id ?? null,
      method: "upi",
      card_network: null,
      card_issuer: null,
      card_type: null,
      dispute_id: null,
    },
  });
  if (parsed.kind !== "recon_line" && parsed.kind !== "adjustment") {
    throw new Error("fixture: reconLine did not produce a member-eligible kind");
  }
  return parsed;
}

export function settlement(id: string, amount: number, utr: string): SettlementObs {
  const parsed = ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "pg_settlements",
    source_file: "pg_settlements.jsonl",
    source_line: counter,
    ingest_hash: "b".repeat(64),
    ingested_at: T0,
    kind: "settlement",
    payload: {
      id,
      entity: "settlement",
      amount: paise(amount),
      status: "processed",
      fees: paise(0),
      tax: paise(0),
      utr,
      created_at: T0 + 2 * DAY,
    },
  });
  if (parsed.kind !== "settlement") throw new Error("fixture: not a settlement");
  return parsed;
}

export function bankLine(id: string, amount: number, bankRef: string | null): BankLineObs {
  const parsed = ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "bank_statement",
    source_file: "bank_statement.jsonl",
    source_line: counter,
    ingest_hash: "c".repeat(64),
    ingested_at: T0,
    kind: "bank_line",
    payload: {
      bank_line_id: id,
      value_date: T0 + 2 * DAY + 3600,
      amount: paise(amount),
      direction: "credit",
      running_balance: null,
      bank_ref: bankRef,
    },
  });
  if (parsed.kind !== "bank_line") throw new Error("fixture: not a bank line");
  return parsed;
}

/**
 * An `order` observation — `§10.1`'s other reference kind.
 *
 * Its identifier is an `order_…`, which `§16`'s `source_entity_id` grammar
 * (`pay_… | rfnd_… | adj_… | setl_… | bnk_…`) does not admit. M55's metric 15
 * gives it a structural zero on **both** grounds.
 */
export function order(id: string, amount: number): Observation {
  return ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "pg_orders",
    source_file: "pg_orders.jsonl",
    source_line: counter,
    ingest_hash: "f".repeat(64),
    ingested_at: T0,
    kind: "order",
    payload: {
      id,
      entity: "order",
      amount: paise(amount),
      amount_paid: paise(amount),
      amount_due: paise(0),
      currency: "INR",
      status: "paid",
      attempts: 1,
      created_at: T0,
    },
  });
}

/**
 * A `refund` observation — the PG-side entity, not the recon row.
 *
 * `emit.ts` writes **both** for one refund, and both carry the same `rfnd_…`.
 * M52's population is of observations, so if both are injected both are members;
 * they are not deduplicated by identifier.
 */
export function refundEntity(id: string, amount: number, paymentId: string): Observation {
  return ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "pg_refunds",
    source_file: "pg_refunds.jsonl",
    source_line: counter,
    ingest_hash: "9".repeat(64),
    ingested_at: T0,
    kind: "refund",
    payload: {
      id,
      entity: "refund",
      amount: paise(amount),
      currency: "INR",
      payment_id: paymentId,
      status: "processed",
      speed_requested: null,
      speed_processed: null,
      created_at: T0,
    },
  });
}

/**
 * A `ledger_entry` observation — **reconcilable** under `§10.1`, and yet keyed
 * `mle_…`, which `§16`'s grammar does not admit.
 *
 * It is the case that separates M55's two structural zeros: the reference-kind
 * test does not fire on it, and the grammar test does. `§17.1.1` reaches the same
 * conclusion from the same grammar — *"truth posts no line attributable to either
 * kind"*.
 */
export function ledgerEntry(id: string, grossPaise: number): Observation {
  return ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "merchant_ledger",
    source_file: "merchant_ledger.jsonl",
    source_line: counter,
    ingest_hash: "8".repeat(64),
    ingested_at: T0,
    kind: "ledger_entry",
    payload: {
      ledger_entry_id: id,
      booked_at: T0,
      order_ref: "INV-202608-00001",
      invoice_no: null,
      gross_paise: paise(grossPaise),
      expected_net_paise: null,
      gl_account: "1100_GATEWAY_RECEIVABLE",
    },
  });
}

export function payment(id: string, amount: number, orderId: string): Observation {
  return ObservationSchema.parse({
    obs_id: obsId(),
    source_system: "pg_payments",
    source_file: "pg_payments.jsonl",
    source_line: counter,
    ingest_hash: "d".repeat(64),
    ingested_at: T0,
    kind: "payment",
    payload: {
      id,
      entity: "payment",
      amount: paise(amount),
      currency: "INR",
      status: "captured",
      order_id: orderId,
      method: "upi",
      captured: true,
      amount_refunded: paise(0),
      created_at: T0,
    },
  });
}

// ---------------------------------------------------------------------------
// AgentRun assembly. No agent is constructed; this is the value one returns.
// ---------------------------------------------------------------------------

/**
 * Narrow a fixture id to `ObservationId`, with a runtime check rather than a cast.
 *
 * `DATA_MODEL.md §0` rule 3 gives ASSAY ids their own grammar and the brand is
 * what enforces it. A fixture that produced a malformed id would otherwise be
 * asserted into the type and test a shape ingest would reject.
 */
function observationId(value: string): ObservationId {
  if (!isObservationId(value)) throw new Error(`fixture: ${value} is not an ObservationId`);
  return value;
}

/** One terminal-state row (`DECISION_BRIEF.md §L.1` rule 5's four states). */
export function outcome(
  kind: ObservationKind,
  state: ObservationOutcome["state"],
  valuePaise: number,
  id = obsId(),
): ObservationOutcome {
  return { obs_id: observationId(id), kind, state, value_paise: valuePaise };
}

export function edge(entityId: string, targetId: string): AllocationEdge {
  return { entity_id: entityId, target_id: targetId };
}

export function abstention(
  sourceEntityId: string,
  valuePaise: number,
  carriedUntrustedText = false,
): AbstentionRecord {
  return {
    source_entity_id: sourceEntityId,
    value_paise: valuePaise,
    carried_untrusted_text: carriedUntrustedText,
  };
}

export function openException(
  sourceEntityId: string,
  exceptionClass: OpenExceptionRecord["exception_class"],
  valuePaise: number,
  postsSuspense = true,
): OpenExceptionRecord {
  return {
    source_entity_id: sourceEntityId,
    exception_class: exceptionClass,
    value_paise: valuePaise,
    posts_suspense: postsSuspense,
    carried_untrusted_text: false,
  };
}

export function posted(
  account: AccountCode,
  drPaise: number,
  crPaise: number,
  sourceEntityId: string,
  decisionState: PostedLine["decision_state"] = "RECONCILED",
): PostedLine {
  return {
    line: {
      account,
      dr_paise: paise(drPaise),
      cr_paise: paise(crPaise),
      memo_ref: "fixture",
      source_entity_id: sourceEntityId,
    },
    decision_state: decisionState,
  };
}

/** A close outcome whose five gates all pass and whose `G3` identity holds. */
export function closeOutcome(overrides: Partial<CloseOutcome> = {}): CloseOutcome {
  const base: CloseOutcome = {
    period_status: "CLOSED",
    period_status_legacy_policy: "CLOSED",
    gate: {
      g1_all_terminal: true,
      g2_trial_balance: true,
      g3_suspense_identity: true,
      g4_hash_chain: true,
      g5_no_failed_invariant_posted: true,
      failed_gates: [],
    },
    batch_value_paise: 100_000_000,
    unresolved_value_paise: 0,
    value_abstained_paise: 0,
    value_exceptions_paise: 0,
    unresolved_value_paise_multiview: 0,
    suspense_gross_item_paise: 0,
    trial_balance_ok: true,
    account_balances: {} as CloseOutcome["account_balances"],
    ledger_root_hash: "e".repeat(64),
  };
  return { ...base, ...overrides };
}

/** An `AgentRun` with every field defaulted, so a test states only what it means. */
export function agentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  const base: AgentRun = {
    agent_id: "ASSAY",
    config: { llm_mode: "replay", strict_replay: true, split: "dev", seed: 2000 },
    outcomes: [],
    components: [],
    allocations: [],
    decisions: [],
    abstentions: [],
    open_exceptions: [],
    journal: [],
    probes_spent: 0,
    abstentions_resolved_by_probe: 0,
    close: null,
  };
  return { ...base, ...overrides };
}
