/**
 * The nine authoritative entities, transcribed from `DATA_MODEL.md §2`–`§9`.
 *
 * Every schema is strict: unknown keys are rejected rather than stripped, per
 * `ARCHITECTURE.md §4`'s "Zod schema, strict mode, `additionalProperties`
 * rejected". Stripping would let a field ASSAY does not model travel silently
 * alongside one it does.
 *
 * Free text is absent by construction. `DATA_MODEL.md §0` rule 4: "Untrusted
 * text is never a field on a structural record." `description`, `notes`,
 * `narration`, `memo` and `order_receipt` appear in no schema here; a record
 * carrying one is rejected by strict mode, which is what makes the quarantine
 * a structural property rather than a convention.
 */

import { z } from "zod";

import {
  adjustmentIdField,
  bankLineIdField,
  countField,
  currencyField,
  disputeIdField,
  ledgerEntryIdField,
  orderIdField,
  paiseField,
  paymentIdField,
  refundIdField,
  settlementIdField,
  unixSecondsField,
} from "./primitives.js";
import { ACCOUNT_CODES } from "../accounts.js";

// ---------------------------------------------------------------------------
// §2 Payment — a declared subset of the documented Payment entity
// ---------------------------------------------------------------------------

/**
 * `[ASSAY-MODEL]` that the method set is five values. `§2`: "The documented
 * method set additionally includes `paylater`. ASSAY v1.0.0 simulates the five
 * methods above and does not simulate `paylater`; that is a scope decision, not
 * a claim that the value does not exist."
 */
export const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "emi"] as const;

export const PaymentSchema = z.strictObject({
  id: paymentIdField,
  entity: z.literal("payment"),
  amount: paiseField,
  currency: currencyField,
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  order_id: orderIdField.nullable(),
  method: z.enum(PAYMENT_METHODS),
  captured: z.boolean(),
  amount_refunded: paiseField,
  created_at: unixSecondsField,
});
export type Payment = z.infer<typeof PaymentSchema>;

// ---------------------------------------------------------------------------
// §3 Order
// ---------------------------------------------------------------------------

export const OrderSchema = z.strictObject({
  id: orderIdField,
  entity: z.literal("order"),
  amount: paiseField,
  amount_paid: paiseField,
  amount_due: paiseField,
  currency: currencyField,
  status: z.enum(["created", "attempted", "paid"]),
  attempts: countField,
  created_at: unixSecondsField,
});
export type Order = z.infer<typeof OrderSchema>;

// ---------------------------------------------------------------------------
// §4 Refund
// ---------------------------------------------------------------------------

/**
 * `[RZP-DOC]` the two speed fields have DIFFERENT value sets and are not
 * interchangeable. `§4`: "`optimum` is documented as a value of
 * **`speed_requested`** ... never of `speed_processed`, whose documented values
 * are exactly `instant` and `normal`."
 */
export const RefundSchema = z.strictObject({
  id: refundIdField,
  entity: z.literal("refund"),
  amount: paiseField,
  currency: currencyField,
  payment_id: paymentIdField,
  status: z.enum(["pending", "processed", "failed"]),
  speed_requested: z.enum(["normal", "optimum"]).nullable(),
  speed_processed: z.enum(["instant", "normal"]).nullable(),
  created_at: unixSecondsField,
});
export type Refund = z.infer<typeof RefundSchema>;

// ---------------------------------------------------------------------------
// §5 Settlement
// ---------------------------------------------------------------------------

/**
 * `[RZP-DOC]` The documented Settlement entity has exactly eight parameters,
 * all of which appear here. There is no `currency` and no `settled_at`.
 *
 * `fees` and `tax` are documented as **0** for a normal settlement — they carry
 * the instant-settlement service charge, not aggregated constituent fees, which
 * are already netted inside each recon line's `credit`. That is not asserted as
 * an ingest invariant here: `§5` states no such invariant, and instant
 * settlements are out of Tier-0 rather than impossible.
 */
export const SettlementSchema = z.strictObject({
  id: settlementIdField,
  entity: z.literal("settlement"),
  amount: paiseField,
  status: z.enum(["created", "processed", "failed"]),
  fees: paiseField,
  tax: paiseField,
  utr: z.string().min(1),
  created_at: unixSecondsField,
});
export type Settlement = z.infer<typeof SettlementSchema>;

// ---------------------------------------------------------------------------
// §6 ReconLine — the primary PG-side observation
// ---------------------------------------------------------------------------

/**
 * `[RZP-DOC]` documented value set, minus `transfer`.
 *
 * `§6`: "'transfer' is a Razorpay Route concept and Route is OUT OF TIER-0
 * SCOPE ... The ingest schema rejects transfer rows rather than modelling them
 * partially." Razorpay's own sample shows a transfer row obeying a third
 * arithmetic form (`debit = amount + fee`) that neither documented identity
 * covers, so this is a deliberate refusal to model something partially.
 */
export const RECON_LINE_TYPES = ["payment", "refund", "adjustment"] as const;

/**
 * `[RZP-DOC]` documented `card_network` value set. `§6`: spec 1.1.0 used
 * `"Amex"`, which is not a Razorpay value. All seven documented values are
 * accepted at ingest even though the generator emits only three.
 */
export const CARD_NETWORKS = [
  "American Express",
  "Diners Club",
  "Maestro",
  "MasterCard",
  "RuPay",
  "Visa",
  "unknown",
] as const;

export const ReconLineSchema = z.strictObject({
  entity_id: z.string().min(1),
  type: z.enum(RECON_LINE_TYPES),
  debit: paiseField,
  credit: paiseField,
  amount: paiseField,
  currency: currencyField,
  fee: paiseField,
  tax: paiseField,
  on_hold: z.boolean(),
  settled: z.boolean(),
  created_at: unixSecondsField,
  settled_at: unixSecondsField.nullable(),
  settlement_id: settlementIdField.nullable(),
  posted_at: unixSecondsField.nullable(),
  credit_type: z.literal("default"),
  payment_id: paymentIdField.nullable(),
  settlement_utr: z.string().min(1).nullable(),
  order_id: orderIdField.nullable(),
  method: z.string().min(1).nullable(),
  card_network: z.enum(CARD_NETWORKS).nullable(),
  card_issuer: z.string().min(1).nullable(),
  card_type: z.string().min(1).nullable(),
  dispute_id: disputeIdField.nullable(),
});
export type ReconLine = z.infer<typeof ReconLineSchema>;

// ---------------------------------------------------------------------------
// §7 BankStatementLine — [ASSAY-MODEL] in its entirety
// ---------------------------------------------------------------------------

/**
 * Not a Razorpay entity and not derived from any Razorpay documentation. `§7`:
 * "Its realism is the weakest link in the data model and no external validity
 * is claimed for it."
 */
export const BankStatementLineSchema = z.strictObject({
  bank_line_id: bankLineIdField,
  value_date: unixSecondsField,
  amount: paiseField,
  direction: z.enum(["credit", "debit"]),
  running_balance: paiseField.nullable(),
  bank_ref: z.string().min(1).nullable(),
});
export type BankStatementLine = z.infer<typeof BankStatementLineSchema>;

// ---------------------------------------------------------------------------
// §8 MerchantLedgerEntry — [ASSAY-MODEL] in its entirety
// ---------------------------------------------------------------------------

/**
 * `order_ref` is deliberately *not* `order_id`: "merchants use their own scheme
 * and the mapping is lossy. Recovering it is a genuine matching problem" (`§8`).
 * It is a merchant-controlled reference, not an identifier ASSAY trusts.
 */
export const MerchantLedgerEntrySchema = z.strictObject({
  ledger_entry_id: ledgerEntryIdField,
  booked_at: unixSecondsField,
  order_ref: z.string().min(1),
  invoice_no: z.string().min(1).nullable(),
  gross_paise: paiseField,
  expected_net_paise: paiseField.nullable(),
  gl_account: z.enum(ACCOUNT_CODES),
});
export type MerchantLedgerEntry = z.infer<typeof MerchantLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// §9 Adjustment — true state only, never an observation
// ---------------------------------------------------------------------------

/**
 * `[ASSAY-MODEL]` in full. `§9`: "Razorpay publishes NO Adjustments API entity.
 * Only the `adj_…` row type in the recon report and the 'Adjustment' line of
 * the settlement break-up are documented." `direction`, `reason` and
 * `related_entity_id` are all ASSAY constructs.
 *
 * **This entity is never an `Observation`.** `§10` excludes it from the payload
 * union deliberately: ASSAY sees an adjustment only as a `ReconLine` with
 * `type === "adjustment"`, which carries no `reason`, no `direction` field and
 * no `related_entity_id`. That information boundary is what `§17.2` and
 * `RECONCILIATION_SPEC.md §4.1` `C2` both rest on. The schema exists because
 * the generator needs it to construct true state, not because the engine may
 * read it.
 */
export const ADJUSTMENT_REASONS = [
  "chargeback_debit",
  "chargeback_reversal",
  "fee_correction",
  "gst_correction",
  "manual",
] as const;

export const AdjustmentSchema = z.strictObject({
  id: adjustmentIdField,
  amount: paiseField,
  direction: z.enum(["debit", "credit"]),
  reason: z.enum(ADJUSTMENT_REASONS),
  created_at: unixSecondsField,
  related_entity_id: z.string().min(1).nullable(),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

// ---------------------------------------------------------------------------
// §9 Dispute
// ---------------------------------------------------------------------------

/**
 * `[RZP-DOC]` documented status set. `under_review` was missing in spec 1.1.0
 * and was added in 1.1.1.
 */
export const DisputeSchema = z.strictObject({
  id: disputeIdField,
  payment_id: paymentIdField,
  amount: paiseField,
  status: z.enum(["open", "under_review", "won", "lost", "closed"]),
  created_at: unixSecondsField,
});
export type Dispute = z.infer<typeof DisputeSchema>;
