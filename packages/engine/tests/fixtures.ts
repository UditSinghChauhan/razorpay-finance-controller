import type { Observation, ObservationId } from "@assay/domain";

/**
 * Hand-built observations for the `S1` suite.
 *
 * Deliberately **not** shared with `packages/oracle`'s fixtures: `ARCHITECTURE.md
 * §7.2` makes the oracle's value its independence from the engine, and a shared
 * builder would let one bug satisfy both sides of the consistency gate.
 *
 * Each builder returns the **narrowed** observation type so a test can read
 * `.payload.id` without re-narrowing the `DATA_MODEL.md §10` union by hand.
 */

/** `Observation` narrowed to one `kind`. */
type Obs<K extends Observation["kind"]> = Extract<Observation, { kind: K }>;

const pad = (prefix: string, n: number): string =>
  `${prefix}${String(n).padStart(14, "0")}`;

export const obsId = (n: number): ObservationId =>
  `obs_${String(n).padStart(14, "0")}` as ObservationId;

const base = (n: number) => ({
  obs_id: obsId(n),
  source_file: "fixture.jsonl",
  source_line: n,
  ingest_hash: "a".repeat(64),
  ingested_at: 1_783_000_000,
});

export function settlement(
  n: number,
  opts: { id?: string; amount?: number; utr?: string } = {},
): Obs<"settlement"> {
  return {
    ...base(n),
    source_system: "pg_settlements",
    kind: "settlement",
    payload: {
      id: opts.id ?? pad("setl_", n),
      entity: "settlement",
      amount: opts.amount ?? 100_000,
      status: "processed",
      fees: 0,
      tax: 0,
      utr: opts.utr ?? `UTR${String(n).padStart(6, "0")}`,
      created_at: 1_782_900_000,
    },
  } as Obs<"settlement">;
}

export function reconLine(
  n: number,
  opts: {
    settlementId?: string | null;
    amount?: number;
    credit?: number;
    debit?: number;
    fee?: number;
    type?: "payment" | "refund";
    createdAt?: number;
    settledAt?: number | null;
    onHold?: boolean;
    orderId?: string | null;
    paymentId?: string | null;
    entityId?: string;
  } = {},
): Obs<"recon_line"> {
  const amount = opts.amount ?? 100_000;
  const fee = opts.fee ?? 2_000;
  const type = opts.type ?? "payment";
  return {
    ...base(n),
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: opts.entityId ?? pad(type === "refund" ? "rfnd_" : "pay_", n),
      type,
      debit: opts.debit ?? (type === "refund" ? amount : 0),
      credit: opts.credit ?? (type === "refund" ? 0 : amount - fee),
      amount,
      currency: "INR",
      fee,
      tax: 305,
      on_hold: opts.onHold ?? false,
      settled: true,
      created_at: opts.createdAt ?? 1_782_900_000,
      settled_at: opts.settledAt === undefined ? 1_783_000_000 : opts.settledAt,
      settlement_id:
        opts.settlementId === undefined ? pad("setl_", n) : opts.settlementId,
      posted_at: null,
      credit_type: "default",
      payment_id: opts.paymentId ?? null,
      settlement_utr: null,
      order_id: opts.orderId === undefined ? pad("order_", n) : opts.orderId,
      method: "card",
      card_network: "Visa",
      card_issuer: null,
      card_type: "credit",
      dispute_id: null,
    },
  } as Obs<"recon_line">;
}

/** A `pg_payments` observation — `C2`'s fallback parent source (M22). */
export function payment(
  n: number,
  opts: { id?: string; orderId?: string | null } = {},
): Obs<"payment"> {
  return {
    ...base(n),
    source_system: "pg_payments",
    kind: "payment",
    payload: {
      id: opts.id ?? pad("pay_", n),
      entity: "payment",
      amount: 100_000,
      currency: "INR",
      status: "captured",
      order_id: opts.orderId === undefined ? pad("order_", n) : opts.orderId,
      method: "card",
      captured: true,
      amount_refunded: 0,
      created_at: 1_782_900_000,
    },
  } as Obs<"payment">;
}

export function adjustment(
  n: number,
  opts: { settlementId?: string | null; amount?: number; settledAt?: number | null } = {},
): Obs<"adjustment"> {
  const line = reconLine(n, opts);
  return {
    ...line,
    kind: "adjustment",
    payload: {
      ...line.payload,
      entity_id: pad("adj_", n),
      type: "adjustment",
    },
  } as unknown as Obs<"adjustment">;
}

export function bankLine(
  n: number,
  opts: { amount?: number; bankRef?: string | null; valueDate?: number } = {},
): Obs<"bank_line"> {
  return {
    ...base(n),
    source_system: "bank_statement",
    kind: "bank_line",
    payload: {
      bank_line_id: pad("bnk_", n),
      value_date: opts.valueDate ?? 1_783_100_000,
      amount: opts.amount ?? 100_000,
      direction: "credit",
      running_balance: null,
      bank_ref:
        opts.bankRef === undefined ? `UTR${String(n).padStart(6, "0")}` : opts.bankRef,
    },
  } as Obs<"bank_line">;
}
