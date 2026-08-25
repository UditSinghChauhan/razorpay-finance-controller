/**
 * Identifier grammars.
 *
 * `DATA_MODEL.md §0` rule 3 is normative. It fixes two things and deliberately
 * leaves a third open:
 *
 *   - Six Razorpay identifiers have a full grammar: a documented prefix plus a
 *     14-character alphanumeric suffix. The prefixes are `[RZP-DOC]`; the
 *     suffix length is `[ASSAY-MODEL]` — "an observed regularity it has chosen
 *     to reproduce, not a documented rule".
 *   - ASSAY-internal identifiers use distinct prefixes "so a Razorpay ID can
 *     never be confused with an ASSAY ID".
 *   - No suffix grammar is stated for the ASSAY-internal identifiers, and none
 *     is invented here. They are validated on their prefix and a non-empty
 *     suffix only.
 *
 * This module does not *generate* identifiers. `DATA_MODEL.md §16` requires
 * ASSAY-internal ids to be "derived from a canonical traversal of the input in
 * a fixed order", which is a property of the stage that assigns them, not of a
 * shared grammar module. Nothing here reaches for randomness or a counter.
 */

// ---------------------------------------------------------------------------
// Branded identifier types
// ---------------------------------------------------------------------------

/** A Razorpay payment id, `pay_` + 14 alphanumerics. */
export type PaymentId = string & { readonly __paymentId: unique symbol };
/** A Razorpay order id, `order_` + 14 alphanumerics. */
export type OrderId = string & { readonly __orderId: unique symbol };
/** A Razorpay refund id, `rfnd_` + 14 alphanumerics. */
export type RefundId = string & { readonly __refundId: unique symbol };
/** A Razorpay settlement id, `setl_` + 14 alphanumerics. */
export type SettlementId = string & { readonly __settlementId: unique symbol };
/** A Razorpay adjustment id, `adj_` + 14 alphanumerics. */
export type AdjustmentId = string & { readonly __adjustmentId: unique symbol };
/** A Razorpay dispute id, `disp_` + 14 alphanumerics. */
export type DisputeId = string & { readonly __disputeId: unique symbol };

/** A bank statement line id (`DATA_MODEL.md §7`), `bnk_` + suffix. */
export type BankLineId = string & { readonly __bankLineId: unique symbol };
/** A merchant ledger entry id (`DATA_MODEL.md §8`), `mle_` + suffix. */
export type LedgerEntryId = string & { readonly __ledgerEntryId: unique symbol };
/** An observation id (`DATA_MODEL.md §10`), `obs_` + suffix. */
export type ObservationId = string & { readonly __observationId: unique symbol };

// ---------------------------------------------------------------------------
// Prefix registry
// ---------------------------------------------------------------------------

/**
 * Every identifier prefix the specification names, and who owns it.
 *
 * `§0` rule 3's stated purpose for the ASSAY-internal prefixes is that "a
 * Razorpay ID can never be confused with an ASSAY ID". That is only checkable
 * against a single registry, which is what this is. `cand_`, `comp_`, `dec_`,
 * `evt_` and `exc_` are listed because rule 3 lists them, even though the
 * entities carrying them belong to later phases.
 *
 * `bnk_` and `mle_` appear in `§7` and `§8` but in neither of rule 3's two
 * lists. They are recorded here as ASSAY-owned, which is what they are: both
 * entities are `[ASSAY-MODEL]` in their entirety.
 */
export const ID_PREFIXES = Object.freeze({
  razorpay: Object.freeze(["pay_", "order_", "rfnd_", "setl_", "adj_", "disp_"] as const),
  assay: Object.freeze([
    "obs_",
    "cand_",
    "comp_",
    "dec_",
    "evt_",
    "exc_",
    "bnk_",
    "mle_",
  ] as const),
});

// ---------------------------------------------------------------------------
// Grammars
// ---------------------------------------------------------------------------

/**
 * The Razorpay suffix: exactly 14 characters from `[A-Za-z0-9]`.
 *
 * `§0` rule 3 also notes that synthetic ids "are drawn from the same alphabet
 * so the engine cannot distinguish synthetic from real by shape" — the grammar
 * is therefore identical for both and this module has no notion of either.
 */
const RAZORPAY_SUFFIX = "[A-Za-z0-9]{14}";

const RAZORPAY_PATTERNS = Object.freeze({
  pay_: new RegExp(`^pay_${RAZORPAY_SUFFIX}$`),
  order_: new RegExp(`^order_${RAZORPAY_SUFFIX}$`),
  rfnd_: new RegExp(`^rfnd_${RAZORPAY_SUFFIX}$`),
  setl_: new RegExp(`^setl_${RAZORPAY_SUFFIX}$`),
  adj_: new RegExp(`^adj_${RAZORPAY_SUFFIX}$`),
  disp_: new RegExp(`^disp_${RAZORPAY_SUFFIX}$`),
});

/**
 * ASSAY-owned identifiers: a known prefix and a non-empty suffix.
 *
 * The suffix character class is restricted to `[A-Za-z0-9]` rather than left
 * open, because an identifier reaches `LedgerEvent.body` through `subject_ids`
 * (`DATA_MODEL.md §16`) and is canonically serialized there; permitting
 * whitespace, control characters or non-ASCII would put encoding-dependent
 * bytes into a hashed field. The *length* is not constrained, because the
 * specification states none and inventing one would be a rule nobody wrote.
 */
const ASSAY_SUFFIX = /^[A-Za-z0-9]+$/;

function matchesAssayGrammar(value: string, prefix: string): boolean {
  if (!value.startsWith(prefix)) return false;
  return ASSAY_SUFFIX.test(value.slice(prefix.length));
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/** Whether `value` matches the `pay_` grammar. */
export function isPaymentId(value: string): value is PaymentId {
  return RAZORPAY_PATTERNS.pay_.test(value);
}
/** Whether `value` matches the `order_` grammar. */
export function isOrderId(value: string): value is OrderId {
  return RAZORPAY_PATTERNS.order_.test(value);
}
/** Whether `value` matches the `rfnd_` grammar. */
export function isRefundId(value: string): value is RefundId {
  return RAZORPAY_PATTERNS.rfnd_.test(value);
}
/** Whether `value` matches the `setl_` grammar. */
export function isSettlementId(value: string): value is SettlementId {
  return RAZORPAY_PATTERNS.setl_.test(value);
}
/** Whether `value` matches the `adj_` grammar. */
export function isAdjustmentId(value: string): value is AdjustmentId {
  return RAZORPAY_PATTERNS.adj_.test(value);
}
/** Whether `value` matches the `disp_` grammar. */
export function isDisputeId(value: string): value is DisputeId {
  return RAZORPAY_PATTERNS.disp_.test(value);
}

/** Whether `value` matches the `bnk_` grammar (`DATA_MODEL.md §7`). */
export function isBankLineId(value: string): value is BankLineId {
  return matchesAssayGrammar(value, "bnk_");
}
/** Whether `value` matches the `mle_` grammar (`DATA_MODEL.md §8`). */
export function isLedgerEntryId(value: string): value is LedgerEntryId {
  return matchesAssayGrammar(value, "mle_");
}
/** Whether `value` matches the `obs_` grammar (`DATA_MODEL.md §10`). */
export function isObservationId(value: string): value is ObservationId {
  return matchesAssayGrammar(value, "obs_");
}

/**
 * Whether `value` carries a documented Razorpay prefix.
 *
 * Prefix only: this answers "does this claim to be a Razorpay identifier",
 * which is the question `§0` rule 3's separation exists to make answerable. It
 * does not assert the suffix is well formed.
 */
export function hasRazorpayPrefix(value: string): boolean {
  return ID_PREFIXES.razorpay.some((prefix) => value.startsWith(prefix));
}

/** Whether `value` carries an ASSAY-owned prefix. */
export function hasAssayPrefix(value: string): boolean {
  return ID_PREFIXES.assay.some((prefix) => value.startsWith(prefix));
}
