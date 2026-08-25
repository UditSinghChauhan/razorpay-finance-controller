/**
 * Shared field types for the ingest schemas.
 *
 * `ARCHITECTURE.md §4` fixes what crossing trust boundary 1 requires:
 * "Zod schema, strict mode, `additionalProperties` rejected. Amounts must be
 * non-negative safe integers. IDs must match their grammar. Timestamps must be
 * plausible Unix seconds within the dataset window."
 *
 * Everything except the dataset window is expressible as a field type and lives
 * here. The window itself is a property of the dataset being ingested, not of
 * the schema, so it is applied by the ingest stage that knows the window.
 */

import { type Paise } from "@assay/money";
import { z } from "zod";

import {
  isAdjustmentId,
  isBankLineId,
  isDisputeId,
  isLedgerEntryId,
  isObservationId,
  isOrderId,
  isPaymentId,
  isRefundId,
  isSettlementId,
  type AdjustmentId,
  type BankLineId,
  type DisputeId,
  type LedgerEntryId,
  type ObservationId,
  type OrderId,
  type PaymentId,
  type RefundId,
  type SettlementId,
} from "../ids.js";

/**
 * A Unix epoch timestamp in whole seconds, UTC.
 *
 * `DATA_MODEL.md §0` rule 2: "All timestamps are Unix epoch seconds (integer,
 * UTC). Matches Razorpay. Display converts to IST at render only."
 */
export type UnixSeconds = number & { readonly __unixSeconds: unique symbol };

/**
 * A SHA-256 digest as lowercase hexadecimal.
 *
 * The specification names the type but not its spelling. One spelling has to be
 * chosen, because a digest reaches `LedgerEvent.body` and is serialized into a
 * hashed field (`DATA_MODEL.md §16`), where two representations of the same
 * digest would produce two different hashes. Lowercase hex is this package's
 * contract, not a quotation from the specification.
 */
export type Sha256 = string & { readonly __sha256: unique symbol };

const isSafeNonNegativeInteger = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * A monetary amount on an ingested record.
 *
 * Non-negative by `ARCHITECTURE.md §4`. `Paise` itself admits negatives —
 * balances are debit-positive and credit-balance accounts are negative
 * (`DATA_MODEL.md §17.1`) — but no *observed* amount is, so the ingest field is
 * the narrower of the two.
 */
export const paiseField = z.custom<Paise>(isSafeNonNegativeInteger, {
  message:
    "expected a non-negative safe integer of paise (DATA_MODEL.md §0 rule 1, " +
    "ARCHITECTURE.md §4)",
});

/** A Unix-seconds timestamp. Strictly positive: epoch zero is not a plausible capture. */
export const unixSecondsField = z.custom<UnixSeconds>(
  (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0,
  { message: "expected a positive integer of Unix epoch seconds (DATA_MODEL.md §0 rule 2)" },
);

/** A lowercase hexadecimal SHA-256 digest. */
export const sha256Field = z.custom<Sha256>(
  (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value),
  { message: "expected 64 lowercase hexadecimal characters" },
);

/**
 * `INR`, and only `INR`.
 *
 * Constraint `C1`'s justification is that "Tier-0 is INR-only by construction,
 * so a non-INR line in an INR dataset is a source or scope error, not a netting
 * event" (`RECONCILIATION_SPEC.md §4.1`). A multi-currency merchant needs the
 * `F11` conversion truth model, which is specified and deliberately not
 * implemented.
 */
export const currencyField = z.literal("INR");

/** A non-negative count. */
export const countField = z.number().int().nonnegative();

const idField = <T extends string>(
  guard: (value: string) => boolean,
  grammar: string,
): z.ZodType<T> =>
  z.custom<T>((value) => typeof value === "string" && guard(value), {
    message: `expected an identifier matching ${grammar} (DATA_MODEL.md §0 rule 3)`,
  });

export const paymentIdField = idField<PaymentId>(isPaymentId, "pay_[A-Za-z0-9]{14}");
export const orderIdField = idField<OrderId>(isOrderId, "order_[A-Za-z0-9]{14}");
export const refundIdField = idField<RefundId>(isRefundId, "rfnd_[A-Za-z0-9]{14}");
export const settlementIdField = idField<SettlementId>(
  isSettlementId,
  "setl_[A-Za-z0-9]{14}",
);
export const adjustmentIdField = idField<AdjustmentId>(
  isAdjustmentId,
  "adj_[A-Za-z0-9]{14}",
);
export const disputeIdField = idField<DisputeId>(isDisputeId, "disp_[A-Za-z0-9]{14}");
export const bankLineIdField = idField<BankLineId>(isBankLineId, "bnk_ + suffix");
export const ledgerEntryIdField = idField<LedgerEntryId>(
  isLedgerEntryId,
  "mle_ + suffix",
);
export const observationIdField = idField<ObservationId>(
  isObservationId,
  "obs_ + suffix",
);
