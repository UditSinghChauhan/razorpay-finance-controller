/**
 * Ingest invariants — the assertions `DATA_MODEL.md §2`–`§6` name explicitly.
 *
 * These are deliberately separate from the zod schemas, because the
 * specification treats the two failures differently.
 * `RECONCILIATION_SPEC.md §2` step 2: "Assert per-entity ingest invariants
 * (`DATA_MODEL.md §2–§9`). A record failing an ingest invariant becomes
 * `E05`/`E06`/`E07` immediately and never enters the candidate space — it
 * cannot corrupt a match."
 *
 * A structurally malformed record fails to parse. An arithmetically incoherent
 * record parses and then becomes a named, owned exception. Folding the second
 * into the first would leave `E06_FEE_MISMATCH` and `E07_GST_MISMATCH` with
 * nothing to classify, so these return violations rather than throwing.
 *
 * Only intra-record invariants are implemented here. `§4`'s
 * `amount <= payment.amount`, `Σ refunds(payment) <= payment.amount` and
 * `refund.created_at >= payment.created_at` each need a second record and
 * therefore belong to the ingest stage that holds the observation set, not to a
 * per-record check.
 *
 * Mapping a violation onto an exception class is likewise not done here:
 * `ExceptionClass` is not part of this package (`DECISION_BRIEF.md §K`), and
 * the caller that raises exceptions owns that mapping.
 */

import { roundHalfUp, sub, type Paise } from "@assay/money";

import type { Order, Payment, ReconLine, Refund } from "./entities.js";

/** GST on the gateway fee, in basis points (`PREREGISTRATION.md §4.2`). */
const GST_RATE_BPS = 1800;
const BPS_DENOMINATOR = 10_000;

/** A named ingest invariant that did not hold. */
export interface InvariantViolation {
  /** The entity the rule belongs to, e.g. `"Payment"`. */
  readonly entity: string;
  /** The rule as the specification states it. */
  readonly rule: string;
  /** What was actually observed. */
  readonly detail: string;
}

const violation = (
  entity: string,
  rule: string,
  detail: string,
): InvariantViolation => ({ entity, rule, detail });

/**
 * `§2` — "Invariants asserted at ingest `[ASSAY-MODEL]`: `amount_refunded <=
 * amount`; `captured === true` iff `status ∈ {captured, refunded}`;
 * `amount > 0`."
 */
export function checkPaymentInvariants(payment: Payment): InvariantViolation[] {
  const out: InvariantViolation[] = [];

  if (payment.amount_refunded > payment.amount) {
    out.push(
      violation(
        "Payment",
        "amount_refunded <= amount",
        `amount_refunded ${String(payment.amount_refunded)} exceeds amount ${String(payment.amount)}`,
      ),
    );
  }

  const shouldBeCaptured =
    payment.status === "captured" || payment.status === "refunded";
  if (payment.captured !== shouldBeCaptured) {
    out.push(
      violation(
        "Payment",
        "captured === true iff status in {captured, refunded}",
        `captured=${String(payment.captured)} with status=${payment.status}`,
      ),
    );
  }

  if (payment.amount <= 0) {
    out.push(
      violation("Payment", "amount > 0", `amount is ${String(payment.amount)}`),
    );
  }

  return out;
}

/**
 * `§3` — "Invariants `[ASSAY-MODEL]`: `amount_paid + amount_due === amount`;
 * `status === "paid"` iff `amount_due === 0`."
 *
 * Both "follow from the documented field descriptions ... but Razorpay does not
 * state them as invariants, so ASSAY asserts them as its own".
 */
export function checkOrderInvariants(order: Order): InvariantViolation[] {
  const out: InvariantViolation[] = [];

  if (order.amount_paid + order.amount_due !== order.amount) {
    out.push(
      violation(
        "Order",
        "amount_paid + amount_due === amount",
        `${String(order.amount_paid)} + ${String(order.amount_due)} !== ${String(order.amount)}`,
      ),
    );
  }

  const shouldBePaid = order.amount_due === 0;
  if ((order.status === "paid") !== shouldBePaid) {
    out.push(
      violation(
        "Order",
        'status === "paid" iff amount_due === 0',
        `status=${order.status} with amount_due=${String(order.amount_due)}`,
      ),
    );
  }

  return out;
}

/**
 * `§4` — the one intra-record invariant: `amount > 0`.
 *
 * The remaining three named in `§4` are cross-record and are not checked here.
 */
export function checkRefundInvariants(refund: Refund): InvariantViolation[] {
  if (refund.amount <= 0) {
    return [violation("Refund", "amount > 0", `amount is ${String(refund.amount)}`)];
  }
  return [];
}

/**
 * `§6` — "The arithmetic identity that anchors everything (invariant I3)":
 *
 * ```
 *   type === "payment"    ->  credit = amount - fee    and  debit = 0
 *   type === "refund"     ->  debit  = amount          and  credit = 0  (fee = tax = 0)
 *   type === "adjustment" ->  exactly one of debit/credit is non-zero
 * ```
 *
 * `fee` is GST-inclusive and `tax` is the component inside it, so `fee` is
 * subtracted once and never together with `tax` — doing both "double-counts
 * GST", which is the error spec 1.1.1 corrected.
 *
 * `amount` is deliberately unconstrained on an adjustment row: `§17.2` states
 * that "no rule in this specification reads `amount` on an adjustment row" and
 * that "**no `amount = debit + credit` identity is asserted**".
 */
export function checkReconLineInvariants(line: ReconLine): InvariantViolation[] {
  const out: InvariantViolation[] = [];

  switch (line.type) {
    case "payment": {
      const expectedCredit = sub(line.amount, line.fee);
      if (line.credit !== expectedCredit) {
        out.push(
          violation(
            "ReconLine",
            "credit = amount - fee (payment; fee is GST-inclusive)",
            `credit ${String(line.credit)} !== amount ${String(line.amount)} - fee ${String(line.fee)}`,
          ),
        );
      }
      if (line.debit !== 0) {
        out.push(
          violation(
            "ReconLine",
            "debit = 0 (payment)",
            `debit is ${String(line.debit)}`,
          ),
        );
      }
      break;
    }

    case "refund": {
      if (line.debit !== line.amount) {
        out.push(
          violation(
            "ReconLine",
            "debit = amount (refund)",
            `debit ${String(line.debit)} !== amount ${String(line.amount)}`,
          ),
        );
      }
      if (line.credit !== 0) {
        out.push(
          violation(
            "ReconLine",
            "credit = 0 (refund)",
            `credit is ${String(line.credit)}`,
          ),
        );
      }
      if (line.fee !== 0 || line.tax !== 0) {
        out.push(
          violation(
            "ReconLine",
            "fee = tax = 0 (refund)",
            `fee=${String(line.fee)} tax=${String(line.tax)}`,
          ),
        );
      }
      break;
    }

    case "adjustment": {
      const debitNonZero = line.debit !== 0;
      const creditNonZero = line.credit !== 0;
      if (debitNonZero === creditNonZero) {
        out.push(
          violation(
            "ReconLine",
            "exactly one of debit/credit is non-zero (adjustment)",
            `debit=${String(line.debit)} credit=${String(line.credit)}`,
          ),
        );
      }
      break;
    }
  }

  return out;
}

/**
 * The GST identity behind `E07_GST_MISMATCH`.
 *
 * `§6`: `tax = round_half_up(fee_ex_gst * 1800 / 10_000)` where
 * `fee_ex_gst = fee - tax`. Checked exactly.
 *
 * NOTE: `DATA_MODEL.md §15` phrases `E07` as "`tax ≠ round_half_up(0.18 ×
 * (fee − tax))` **within rounding tolerance**", and the specification nowhere
 * quantifies that tolerance. This function implements the identity exactly and
 * takes no tolerance; a caller that needs one has to obtain the magnitude from
 * a spec amendment rather than from here. Reported rather than invented,
 * following the same rule that governs `C6` (`RECONCILIATION_SPEC.md §4.1`),
 * where an unspecified tolerance is refused outright.
 */
export function gstIdentityHolds(fee: Paise, tax: Paise): boolean {
  const feeExGst = sub(fee, tax);
  if (feeExGst < 0) return false;
  return tax === roundHalfUp(feeExGst * GST_RATE_BPS, BPS_DENOMINATOR);
}
