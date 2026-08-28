import { ObservationSchema, type Observation } from "@assay/domain";
import { paise } from "@assay/money";

/**
 * Narrowed observation aliases.
 *
 * `ObservationSchema.parse` returns the full discriminated union, so a test that
 * reads `.payload.id` off a settlement fixture would not compile. Each helper
 * narrows at its own boundary with a runtime check rather than a cast, so a
 * fixture that somehow produced the wrong kind fails loudly instead of being
 * asserted away.
 */
export type SettlementObs = Extract<Observation, { kind: "settlement" }>;
export type BankLineObs = Extract<Observation, { kind: "bank_line" }>;
export type ReconObs = Extract<Observation, { kind: "recon_line" | "adjustment" }>;

/**
 * Hand-built observations for the oracle's tests.
 *
 * `PREREGISTRATION.md §6.1` forbids this package's tests from touching a split
 * seed or invoking the generator, and `§6.2` `AL1` forbids importing it at all.
 * Every fixture here is therefore constructed by hand and validated against the
 * frozen `ObservationSchema`, so a fixture that drifts from the schema fails to
 * build rather than testing a shape the system would reject at ingest.
 */

const DAY = 86_400;
/** An arbitrary in-period instant. No split seed and no generator is involved. */
export const T0 = 1_783_000_000;

let counter = 0;
const obsId = (): string => `obs_${String(counter++).padStart(14, "0")}`;
const pad = (prefix: string, n: number): string =>
  `${prefix}${String(n).padStart(14, "0")}`;

export interface ReconLineSpec {
  readonly entity: string;
  readonly type: "payment" | "refund" | "adjustment";
  readonly amount: number;
  readonly fee?: number;
  readonly tax?: number;
  readonly created_at?: number;
  readonly settled_at?: number | null;
  readonly settlement_id?: string | null;
  readonly settlement_utr?: string | null;
  readonly order_id?: string | null;
  readonly payment_id?: string | null;
  readonly on_hold?: boolean;
  /**
   * Override the posted movement, for adjustment rows only.
   *
   * `DATA_MODEL.md §14.1` values an adjustment at `M` — the non-zero one of
   * `debit`/`credit` — and says in terms that this is **not** `amount`, because
   * `I3` declares no `amount` identity for adjustment rows and `§17.2` leaves
   * the field unconstrained on them. Without these overrides every fixture
   * adjustment would satisfy `debit === amount` by construction, and a test of
   * that rule would pass without distinguishing the two fields.
   */
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
  // `settled` tracks `settled_at`: a caller passing null models §4.2's
  // unsettled member, whose row carries `settled: false`.
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
      settlement_utr: spec.settlement_utr ?? null,
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

export function settlement(id: string, amount: number, utr: string, createdAt = T0 + 2 * DAY): SettlementObs {
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
      created_at: createdAt,
    },
  });
  if (parsed.kind !== "settlement") throw new Error("fixture: not a settlement");
  return parsed;
}

export function bankLine(
  id: string,
  amount: number,
  bankRef: string | null,
  valueDate = T0 + 2 * DAY + 3600,
): BankLineObs {
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
      value_date: valueDate,
      amount: paise(amount),
      direction: "credit",
      running_balance: null,
      bank_ref: bankRef,
    },
  });
  if (parsed.kind !== "bank_line") throw new Error("fixture: not a bank line");
  return parsed;
}

/** A reference-kind observation, to prove it is never a candidate member. */
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

export const PAY = (n: number): string => pad("pay_", n);
export const RFND = (n: number): string => pad("rfnd_", n);
export const ADJ = (n: number): string => pad("adj_", n);
export const SETL = (n: number): string => pad("setl_", n);
export const ORDER = (n: number): string => pad("order_", n);
export const BNK = (n: number): string => pad("bnk_", n);
export { DAY };
