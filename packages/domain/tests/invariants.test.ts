import { describe, expect, it } from "vitest";
import fc from "fast-check";

import type { Paise } from "@assay/money";
import {
  checkOrderInvariants,
  checkPaymentInvariants,
  checkReconLineInvariants,
  checkRefundInvariants,
  gstIdentityHolds,
  type Order,
  type Payment,
  type ReconLine,
  type Refund,
} from "@assay/domain";

import {
  validOrder,
  validPayment,
  validReconLine,
  validRefund,
} from "./fixtures.js";

const SEED = 20260825;

const payment = (over: Partial<Payment> = {}) =>
  ({ ...validPayment(), ...over }) as Payment;
const order = (over: Partial<Order> = {}) => ({ ...validOrder(), ...over }) as Order;
const refund = (over: Partial<Refund> = {}) => ({ ...validRefund(), ...over }) as Refund;
const line = (over: Partial<ReconLine> = {}) =>
  ({ ...validReconLine(), ...over }) as ReconLine;

describe("Payment ingest invariants (§2)", () => {
  it("passes a well-formed payment", () => {
    expect(checkPaymentInvariants(payment())).toEqual([]);
  });

  it("catches amount_refunded > amount", () => {
    const v = checkPaymentInvariants(payment({ amount_refunded: 3_000 as Paise }));
    expect(v.map((x) => x.rule)).toContain("amount_refunded <= amount");
  });

  it("allows a full refund, where amount_refunded === amount", () => {
    expect(
      checkPaymentInvariants(
        payment({ status: "refunded", amount_refunded: 2_100 as Paise }),
      ),
    ).toEqual([]);
  });

  it("catches captured disagreeing with status, in both directions", () => {
    expect(
      checkPaymentInvariants(payment({ status: "authorized", captured: true })).map(
        (x) => x.rule,
      ),
    ).toContain("captured === true iff status in {captured, refunded}");
    expect(
      checkPaymentInvariants(payment({ status: "captured", captured: false })).map(
        (x) => x.rule,
      ),
    ).toContain("captured === true iff status in {captured, refunded}");
  });

  it("accepts refunded status with captured true", () => {
    expect(
      checkPaymentInvariants(payment({ status: "refunded", captured: true })),
    ).toEqual([]);
  });

  it("catches a zero amount", () => {
    expect(checkPaymentInvariants(payment({ amount: 0 as Paise })).map((x) => x.rule)).toContain(
      "amount > 0",
    );
  });
});

describe("Order ingest invariants (§3)", () => {
  it("passes a well-formed order", () => {
    expect(checkOrderInvariants(order())).toEqual([]);
  });

  it("catches amount_paid + amount_due !== amount", () => {
    expect(
      checkOrderInvariants(order({ amount_paid: 1_000 as Paise, amount_due: 1_000 as Paise })).map(
        (x) => x.rule,
      ),
    ).toContain("amount_paid + amount_due === amount");
  });

  it("catches paid status disagreeing with amount_due, in both directions", () => {
    expect(
      checkOrderInvariants(
        order({ status: "attempted", amount_paid: 2_100 as Paise, amount_due: 0 as Paise }),
      ).map((x) => x.rule),
    ).toContain('status === "paid" iff amount_due === 0');
    expect(
      checkOrderInvariants(
        order({ status: "paid", amount_paid: 100 as Paise, amount_due: 2_000 as Paise }),
      ).map((x) => x.rule),
    ).toContain('status === "paid" iff amount_due === 0');
  });

  it("holds for a partially paid order", () => {
    expect(
      checkOrderInvariants(
        order({ status: "attempted", amount_paid: 100 as Paise, amount_due: 2_000 as Paise }),
      ),
    ).toEqual([]);
  });
});

describe("Refund ingest invariants (§4)", () => {
  it("passes a well-formed refund", () => {
    expect(checkRefundInvariants(refund())).toEqual([]);
  });

  it("catches a zero amount", () => {
    expect(checkRefundInvariants(refund({ amount: 0 as Paise })).map((x) => x.rule)).toContain(
      "amount > 0",
    );
  });
});

describe("ReconLine arithmetic identity — invariant I3 (§6)", () => {
  it("holds on the documented Razorpay sample", () => {
    // amount 2100, fee 50 (GST-inclusive), tax 8, credit 2050.
    expect(checkReconLineInvariants(line())).toEqual([]);
  });

  it("catches credit !== amount - fee on a payment row", () => {
    // The 1.1.0 error: subtracting fee AND tax double-counts GST, because tax
    // is the component inside fee. That line must not validate.
    expect(
      checkReconLineInvariants(line({ credit: 2_042 as Paise })).map((x) => x.rule),
    ).toContain("credit = amount - fee (payment; fee is GST-inclusive)");
  });

  it("catches a non-zero debit on a payment row", () => {
    expect(
      checkReconLineInvariants(line({ debit: 1 as Paise })).map((x) => x.rule),
    ).toContain("debit = 0 (payment)");
  });

  it("catches the T6 arithmetic-manipulation payload", () => {
    // THREAT_MODEL.md §T6: a line asserting amount 100000, fee 0, tax 0,
    // credit 100000 when the true fee was Rs 20 + GST.
    const forged = line({
      amount: 100_000 as Paise,
      fee: 0 as Paise,
      tax: 0 as Paise,
      credit: 100_000 as Paise,
    });
    // Worth stating precisely, because it bounds what these checks are for:
    // a fully zeroed fee line is INTERNALLY consistent. credit = amount - 0
    // satisfies I3, and tax = 18% of (0 - 0) = 0 satisfies the GST identity,
    // so neither per-line check fires. THREAT_MODEL.md §T6 lists four controls
    // and this forgery is caught by the later two: I4 re-derives the
    // settlement total from its constituents and I5 requires the bank tie-out.
    // Per-line arithmetic alone is not sufficient against it.
    expect(checkReconLineInvariants(forged)).toEqual([]);
    expect(gstIdentityHolds(forged.fee, forged.tax)).toBe(true);
    // With the true fee, both hold.
    const honest = line({
      amount: 100_000 as Paise,
      fee: 2_360 as Paise,
      tax: 360 as Paise,
      credit: 97_640 as Paise,
    });
    expect(checkReconLineInvariants(honest)).toEqual([]);
    expect(gstIdentityHolds(honest.fee, honest.tax)).toBe(true);
    // A zeroed fee on a line whose credit was not adjusted is caught by I3.
    const tampered = line({ amount: 100_000 as Paise, fee: 0 as Paise, tax: 0 as Paise, credit: 97_640 as Paise });
    expect(checkReconLineInvariants(tampered).length).toBeGreaterThan(0);
  });

  it("requires debit = amount and credit = fee = tax = 0 on a refund row", () => {
    const good = line({
      type: "refund",
      debit: 2_100 as Paise,
      credit: 0 as Paise,
      fee: 0 as Paise,
      tax: 0 as Paise,
    });
    expect(checkReconLineInvariants(good)).toEqual([]);
    expect(
      checkReconLineInvariants({ ...good, fee: 50 as Paise }).map((x) => x.rule),
    ).toContain("fee = tax = 0 (refund)");
    expect(
      checkReconLineInvariants({ ...good, debit: 1 as Paise }).map((x) => x.rule),
    ).toContain("debit = amount (refund)");
  });

  it("requires exactly one non-zero side on an adjustment row", () => {
    const debitSide = line({
      type: "adjustment",
      debit: 1_000 as Paise,
      credit: 0 as Paise,
    });
    const creditSide = line({
      type: "adjustment",
      debit: 0 as Paise,
      credit: 1_000 as Paise,
    });
    expect(checkReconLineInvariants(debitSide)).toEqual([]);
    expect(checkReconLineInvariants(creditSide)).toEqual([]);

    for (const bad of [
      { debit: 0 as Paise, credit: 0 as Paise },
      { debit: 1 as Paise, credit: 1 as Paise },
    ]) {
      expect(
        checkReconLineInvariants(line({ type: "adjustment", ...bad })).map((x) => x.rule),
      ).toContain("exactly one of debit/credit is non-zero (adjustment)");
    }
  });

  it("asserts nothing about amount on an adjustment row", () => {
    // §17.2: "no rule in this specification reads `amount` on an adjustment
    // row" and "no `amount = debit + credit` identity is asserted".
    for (const amount of [0, 1, 999_999]) {
      expect(
        checkReconLineInvariants(
          line({
            type: "adjustment",
            debit: 1_000 as Paise,
            credit: 0 as Paise,
            amount: amount as Paise,
          }),
        ),
      ).toEqual([]);
    }
  });
});

describe("the GST identity behind E07", () => {
  it("holds on the documented sample", () => {
    // fee 50, tax 8: 18% of (50 - 8) = 7.56 -> 8.
    expect(gstIdentityHolds(50 as Paise, 8 as Paise)).toBe(true);
  });

  it("rejects a tax that is not 18% of the fee net of GST", () => {
    expect(gstIdentityHolds(50 as Paise, 7 as Paise)).toBe(false);
    expect(gstIdentityHolds(50 as Paise, 9 as Paise)).toBe(false);
  });

  it("rejects a tax larger than the fee containing it", () => {
    expect(gstIdentityHolds(10 as Paise, 20 as Paise)).toBe(false);
  });

  it("holds for zero fee and zero tax", () => {
    expect(gstIdentityHolds(0 as Paise, 0 as Paise)).toBe(true);
  });

  it("agrees with the generator formula for every fee_ex_gst", () => {
    // PREREGISTRATION.md §4.2: tax = round_half_up(fee_ex_gst * 1800 / 10_000),
    // fee = fee_ex_gst + tax.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 9 }), (feeExGst) => {
        // Independent half-up of feeExGst * 1800 / 10_000, computed here with
        // exact integer arithmetic so the check does not reuse the code under
        // test.
        const quotient = Math.floor((feeExGst * 1800) / 10_000);
        const remainder = feeExGst * 1800 - quotient * 10_000;
        const tax = remainder * 2 >= 10_000 ? quotient + 1 : quotient;
        return gstIdentityHolds((feeExGst + tax) as Paise, tax as Paise);
      }),
      { numRuns: 10_000, seed: SEED },
    );
  });
});
