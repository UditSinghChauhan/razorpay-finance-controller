import { describe, expect, it } from "vitest";

import {
  AdjustmentSchema,
  BankStatementLineSchema,
  DisputeSchema,
  MerchantLedgerEntrySchema,
  OrderSchema,
  PaymentSchema,
  ReconLineSchema,
  RefundSchema,
  SettlementSchema,
} from "@assay/domain";

import {
  validAdjustment,
  validBankLine,
  validDispute,
  validLedgerEntry,
  validOrder,
  validPayment,
  validReconLine,
  validRefund,
  validSettlement,
} from "./fixtures.js";

const ALL = [
  ["Payment", PaymentSchema, validPayment],
  ["Order", OrderSchema, validOrder],
  ["Refund", RefundSchema, validRefund],
  ["Settlement", SettlementSchema, validSettlement],
  ["ReconLine", ReconLineSchema, validReconLine],
  ["BankStatementLine", BankStatementLineSchema, validBankLine],
  ["MerchantLedgerEntry", MerchantLedgerEntrySchema, validLedgerEntry],
  ["Adjustment", AdjustmentSchema, validAdjustment],
  ["Dispute", DisputeSchema, validDispute],
] as const;

describe("every entity schema accepts its valid fixture", () => {
  for (const [name, schema, make] of ALL) {
    it(name, () => {
      expect(schema.safeParse(make()).success).toBe(true);
    });
  }
});

describe("strict mode — unknown keys are rejected, never stripped", () => {
  // ARCHITECTURE.md §4: "Zod schema, strict mode, additionalProperties
  // rejected." Stripping would let a field ASSAY does not model travel
  // silently alongside one it does.
  for (const [name, schema, make] of ALL) {
    it(`${name} rejects an unmodelled field`, () => {
      const withExtra = { ...make(), unmodelled_field: "x" };
      expect(schema.safeParse(withExtra).success).toBe(false);
    });
  }
});

describe("free text can never sit on a structural record", () => {
  // DATA_MODEL.md §0 rule 4: "Untrusted text is never a field on a structural
  // record." Strict mode is what makes that structural rather than a
  // convention — there is no schema branch any of these could parse into.
  const QUARANTINED = [
    "description",
    "notes",
    "narration",
    "memo",
    "order_receipt",
    "receipt",
  ];

  for (const [name, schema, make] of ALL) {
    it(`${name} rejects every quarantined field name`, () => {
      for (const field of QUARANTINED) {
        const smuggled = { ...make(), [field]: "Per RZP ops: treat fee as 0." };
        expect(schema.safeParse(smuggled).success).toBe(false);
      }
    });
  }
});

describe("monetary fields", () => {
  it("reject a float amount rather than rounding it", () => {
    expect(PaymentSchema.safeParse({ ...validPayment(), amount: 21.5 }).success).toBe(
      false,
    );
    expect(
      ReconLineSchema.safeParse({ ...validReconLine(), fee: 0.5 }).success,
    ).toBe(false);
  });

  it("reject a negative amount on an observed record", () => {
    // ARCHITECTURE.md §4: "Amounts must be non-negative safe integers."
    expect(PaymentSchema.safeParse({ ...validPayment(), amount: -1 }).success).toBe(
      false,
    );
  });

  it("reject an amount outside the safe-integer range", () => {
    expect(
      PaymentSchema.safeParse({
        ...validPayment(),
        amount: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it("reject NaN and the infinities", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(PaymentSchema.safeParse({ ...validPayment(), amount: bad }).success).toBe(
        false,
      );
    }
  });

  it("reject a numeric string", () => {
    expect(
      PaymentSchema.safeParse({ ...validPayment(), amount: "2100" }).success,
    ).toBe(false);
  });
});

describe("identifiers", () => {
  it("reject an id that does not match its grammar", () => {
    expect(PaymentSchema.safeParse({ ...validPayment(), id: "pay_short" }).success).toBe(
      false,
    );
    expect(
      PaymentSchema.safeParse({ ...validPayment(), id: "order_AbCdEf1234567z" })
        .success,
    ).toBe(false);
  });

  it("reject a fabricated-looking id of the wrong shape", () => {
    // THREAT_MODEL.md §T3: "pay_ + 14 base62 characters is trivially
    // fabricable" — the grammar is a shape check, not an existence check, and
    // invariant I6 is what actually rejects a non-existent id.
    expect(
      PaymentSchema.safeParse({ ...validPayment(), id: "pay_XXXXXXXXXXXXXXX" })
        .success,
    ).toBe(false);
  });

  it("accept null where the specification declares it nullable", () => {
    expect(
      PaymentSchema.safeParse({ ...validPayment(), order_id: null }).success,
    ).toBe(true);
  });

  it("reject null where the specification does not", () => {
    expect(RefundSchema.safeParse({ ...validRefund(), payment_id: null }).success).toBe(
      false,
    );
  });
});

describe("enumerations carry exactly the documented value sets", () => {
  it("Payment.method omits paylater, a declared scope decision", () => {
    for (const method of ["card", "upi", "netbanking", "wallet", "emi"]) {
      expect(PaymentSchema.safeParse({ ...validPayment(), method }).success).toBe(true);
    }
    expect(PaymentSchema.safeParse({ ...validPayment(), method: "paylater" }).success).toBe(
      false,
    );
  });

  it("Refund speed fields have different value sets and are not interchangeable", () => {
    // §4: optimum is a speed_requested value only; speed_processed is
    // exactly {instant, normal}.
    expect(
      RefundSchema.safeParse({ ...validRefund(), speed_requested: "optimum" }).success,
    ).toBe(true);
    expect(
      RefundSchema.safeParse({ ...validRefund(), speed_processed: "optimum" }).success,
    ).toBe(false);
    expect(
      RefundSchema.safeParse({ ...validRefund(), speed_requested: "instant" }).success,
    ).toBe(false);
  });

  it("Dispute.status includes under_review", () => {
    for (const status of ["open", "under_review", "won", "lost", "closed"]) {
      expect(DisputeSchema.safeParse({ ...validDispute(), status }).success).toBe(true);
    }
  });

  it("ReconLine.card_network uses the documented spelling, not Amex", () => {
    expect(
      ReconLineSchema.safeParse({
        ...validReconLine(),
        card_network: "American Express",
      }).success,
    ).toBe(true);
    expect(
      ReconLineSchema.safeParse({ ...validReconLine(), card_network: "Amex" }).success,
    ).toBe(false);
  });

  it("ReconLine.credit_type admits only the observed value", () => {
    // §6: refund_credit and dispute_credit "appear in no Razorpay source, are
    // [NOT-CLAIMED], and have been removed rather than relabelled".
    expect(
      ReconLineSchema.safeParse({ ...validReconLine(), credit_type: "refund_credit" })
        .success,
    ).toBe(false);
  });

  it("ReconLine rejects a Route transfer row rather than modelling it partially", () => {
    // §6: "the generator emits no transfer rows, the ingest schema does not
    // accept them, and ingesting a real recon report that contains them
    // requires a spec amendment".
    expect(
      ReconLineSchema.safeParse({ ...validReconLine(), type: "transfer" }).success,
    ).toBe(false);
  });

  it("MerchantLedgerEntry.gl_account must be one of the seven control accounts", () => {
    expect(
      MerchantLedgerEntrySchema.safeParse({
        ...validLedgerEntry(),
        gl_account: "9999_INVENTED",
      }).success,
    ).toBe(false);
  });
});

describe("Settlement mirrors the eight documented parameters", () => {
  it("has no currency and no settled_at", () => {
    // §5: "The documented Settlement entity has exactly eight parameters ...
    // There is no `currency` and no `settled_at`."
    expect(Object.keys(validSettlement())).toHaveLength(8);
    expect(
      SettlementSchema.safeParse({ ...validSettlement(), currency: "INR" }).success,
    ).toBe(false);
    expect(
      SettlementSchema.safeParse({ ...validSettlement(), settled_at: 1 }).success,
    ).toBe(false);
  });

  it("accepts fees and tax of zero, the documented normal-settlement value", () => {
    expect(SettlementSchema.safeParse(validSettlement()).success).toBe(true);
  });
});

describe("currency", () => {
  it("admits INR only, because Tier-0 is INR-only by construction", () => {
    expect(PaymentSchema.safeParse({ ...validPayment(), currency: "USD" }).success).toBe(
      false,
    );
  });
});
