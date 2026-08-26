/**
 * Observation builders for the `journal.ts` suite.
 *
 * Everything here is deterministic and hand-computable: no clock, no
 * randomness, and every rupee figure is either stated in the specification or
 * derivable from `PREREGISTRATION.md §4.2`'s frozen parameters by arithmetic a
 * reader can check in their head.
 *
 * **No builder selects a posting.** Each returns an `Observation` exactly as
 * ingest would produce it; which rule fires is `journal.ts`'s decision and is
 * what the suite is testing. A fixture that encoded the expected rule would be
 * a second implementation of `DATA_MODEL.md §17.1.1` grading the first.
 */

import type {
  BankStatementLine,
  MerchantLedgerEntry,
  Observation,
  ReconLine,
  Settlement,
  Sha256,
  UnixSeconds,
} from "@assay/domain";
import type { Paise } from "@assay/money";

import { entityId } from "./fixtures.js";

const HASH = "a".repeat(64) as Sha256;
const T0 = 1_787_000_000 as UnixSeconds;

const p = (n: number): Paise => n as Paise;

/** Provenance every observation carries (`ARCHITECTURE.md §4`). */
function provenance(n: number) {
  return {
    obs_id: `obs_${String(n).padStart(6, "0")}A`,
    source_file: "recon-2026-08.json",
    source_line: n,
    ingest_hash: HASH,
    ingested_at: T0,
  } as const;
}

/**
 * The frozen worked example of `DECISION_BRIEF.md §A.7` G-F and
 * `PREREGISTRATION.md §4.2`: a well-formed card payment line.
 *
 *   amount 100_000 · fee 2_360 (GST-inclusive) · tax 360 · credit 97_640
 *
 * `I3` holds: `credit = amount − fee = 100_000 − 2_360 = 97_640`.
 * `fee_ex_gst = fee − tax = 2_000`, and 18% of 2_000 is 360.
 */
export const CARD_LINE = Object.freeze({
  amount: 100_000,
  fee: 2_360,
  tax: 360,
  credit: 97_640,
  feeExGst: 2_000,
});

export const PAY_ID = entityId("pay_", 1);
export const RFND_ID = entityId("rfnd_", 1);
export const ADJ_ID = entityId("adj_", 1);
export const SETL_ID = entityId("setl_", 1);
export const BNK_ID = entityId("bnk_", 1);
export const MLE_ID = `mle_${"1".repeat(14)}`;
export const DISP_ID = entityId("disp_", 1);
export const ORDER_ID = entityId("order_", 1);

/** A `ReconLine` with every field at a well-formed default. */
export function reconLine(overrides: Partial<ReconLine> = {}): ReconLine {
  return {
    entity_id: PAY_ID,
    type: "payment",
    debit: p(0),
    credit: p(CARD_LINE.credit),
    amount: p(CARD_LINE.amount),
    currency: "INR",
    fee: p(CARD_LINE.fee),
    tax: p(CARD_LINE.tax),
    on_hold: false,
    settled: true,
    created_at: T0,
    settled_at: (T0 + 172_800) as UnixSeconds,
    settlement_id: SETL_ID,
    posted_at: (T0 + 172_800) as UnixSeconds,
    credit_type: "default",
    payment_id: null,
    settlement_utr: "RZPX0001",
    order_id: ORDER_ID,
    method: "card",
    card_network: "Visa",
    card_issuer: "HDFC",
    card_type: "credit",
    dispute_id: null,
    ...overrides,
  } as ReconLine;
}

/** `§10`'s row: `recon_line` / `pg_recon` / `ReconLine` with type payment or refund. */
export function paymentObservation(
  overrides: Partial<ReconLine> = {},
  n = 1,
): Observation {
  return {
    ...provenance(n),
    kind: "recon_line",
    source_system: "pg_recon",
    payload: reconLine(overrides),
  } as Observation;
}

/** `I3` on a refund row: `debit = amount`, `credit = 0`, `fee = tax = 0`. */
export function refundObservation(
  overrides: Partial<ReconLine> = {},
  n = 2,
): Observation {
  return {
    ...provenance(n),
    kind: "recon_line",
    source_system: "pg_recon",
    payload: reconLine({
      entity_id: RFND_ID,
      type: "refund",
      debit: p(50_000),
      credit: p(0),
      amount: p(50_000),
      fee: p(0),
      tax: p(0),
      payment_id: PAY_ID as ReconLine["payment_id"],
      ...overrides,
    }),
  } as Observation;
}

/** `§10`'s row: `adjustment` / `pg_recon` / `ReconLine` with type adjustment. */
export function adjustmentObservation(
  overrides: Partial<ReconLine> = {},
  n = 3,
): Observation {
  return {
    ...provenance(n),
    kind: "adjustment",
    source_system: "pg_recon",
    payload: reconLine({
      entity_id: ADJ_ID,
      type: "adjustment",
      debit: p(25_000),
      credit: p(0),
      // §17.2: `amount` is "deliberately left unconstrained on adjustment
      // rows"; a figure that is neither debit nor credit is set here on purpose,
      // so a P8 that posted `amount` would be visible immediately.
      amount: p(999_999),
      fee: p(0),
      tax: p(0),
      settlement_id: null,
      order_id: null,
      method: null,
      card_network: null,
      card_issuer: null,
      card_type: null,
      settlement_utr: null,
      ...overrides,
    }),
  } as Observation;
}

export function settlementObservation(
  overrides: Partial<Settlement> = {},
  n = 4,
): Observation {
  return {
    ...provenance(n),
    kind: "settlement",
    source_system: "pg_settlements",
    payload: {
      id: SETL_ID,
      entity: "settlement",
      amount: p(10_000_000),
      status: "processed",
      fees: p(0),
      tax: p(0),
      utr: "RZPX0001",
      created_at: T0,
      ...overrides,
    },
  } as Observation;
}

export function bankLineObservation(
  overrides: Partial<BankStatementLine> = {},
  n = 5,
): Observation {
  return {
    ...provenance(n),
    kind: "bank_line",
    source_system: "bank_statement",
    payload: {
      bank_line_id: BNK_ID,
      value_date: (T0 + 259_200) as UnixSeconds,
      amount: p(45_231_000),
      direction: "credit",
      running_balance: null,
      bank_ref: "NEFT-RZPX0001",
      ...overrides,
    },
  } as Observation;
}

export function ledgerEntryObservation(
  overrides: Partial<MerchantLedgerEntry> = {},
  n = 6,
): Observation {
  return {
    ...provenance(n),
    kind: "ledger_entry",
    source_system: "merchant_ledger",
    payload: {
      ledger_entry_id: MLE_ID,
      booked_at: T0,
      order_ref: "INV-2026-0001",
      invoice_no: null,
      gross_paise: p(100_000),
      expected_net_paise: null,
      gl_account: "4000_REVENUE",
      ...overrides,
    },
  } as Observation;
}

export function disputeObservation(n = 7): Observation {
  return {
    ...provenance(n),
    kind: "dispute",
    source_system: "pg_disputes",
    payload: {
      id: DISP_ID,
      payment_id: PAY_ID,
      amount: p(100_000),
      status: "open",
      created_at: T0,
    },
  } as Observation;
}

export function paymentEntityObservation(n = 8): Observation {
  return {
    ...provenance(n),
    kind: "payment",
    source_system: "pg_payments",
    payload: {
      id: PAY_ID,
      entity: "payment",
      amount: p(CARD_LINE.amount),
      currency: "INR",
      status: "captured",
      order_id: ORDER_ID,
      method: "card",
      captured: true,
      amount_refunded: p(0),
      created_at: T0,
    },
  } as Observation;
}

export function orderObservation(n = 9): Observation {
  return {
    ...provenance(n),
    kind: "order",
    source_system: "pg_orders",
    payload: {
      id: ORDER_ID,
      entity: "order",
      amount: p(CARD_LINE.amount),
      amount_paid: p(CARD_LINE.amount),
      amount_due: p(0),
      currency: "INR",
      status: "paid",
      attempts: 1,
      created_at: T0,
    },
  } as Observation;
}

export function refundEntityObservation(n = 10): Observation {
  return {
    ...provenance(n),
    kind: "refund",
    source_system: "pg_refunds",
    payload: {
      id: RFND_ID,
      entity: "refund",
      amount: p(50_000),
      currency: "INR",
      payment_id: PAY_ID,
      status: "processed",
      speed_requested: "normal",
      speed_processed: "normal",
      created_at: T0,
    },
  } as Observation;
}

/**
 * The bank-side attestation `P2`/`P4` require (`DATA_MODEL.md §17.1.1`).
 *
 * There is deliberately no builder for "evidence that is not evidence": the
 * fields are typed `true`, so a caller with no `AN2` match omits the occasion.
 */
export const BANK_EVIDENCE = Object.freeze({
  settlement_id: SETL_ID,
  bank_line_id: BNK_ID,
  an2_satisfied: true,
  i5_satisfied: true,
} as const);
