import { describe, expect, it } from "vitest";

import {
  ID_PREFIXES,
  hasAssayPrefix,
  hasRazorpayPrefix,
  isAdjustmentId,
  isBankLineId,
  isDisputeId,
  isLedgerEntryId,
  isObservationId,
  isOrderId,
  isPaymentId,
  isRefundId,
  isSettlementId,
} from "@assay/domain";

/** Exactly 14 alphanumerics, the suffix DATA_MODEL.md §0 rule 3 declares. */
const S14 = "AbCdEf1234567z";

describe("Razorpay identifier grammars (§0 rule 3)", () => {
  const cases = [
    ["pay_", isPaymentId],
    ["order_", isOrderId],
    ["rfnd_", isRefundId],
    ["setl_", isSettlementId],
    ["adj_", isAdjustmentId],
    ["disp_", isDisputeId],
  ] as const;

  it("accepts a well-formed id for each documented prefix", () => {
    for (const [prefix, guard] of cases) {
      expect(guard(`${prefix}${S14}`)).toBe(true);
    }
  });

  it("rejects a suffix that is not exactly 14 characters", () => {
    for (const [prefix, guard] of cases) {
      expect(guard(`${prefix}${S14.slice(0, 13)}`)).toBe(false);
      expect(guard(`${prefix}${S14}X`)).toBe(false);
      expect(guard(prefix)).toBe(false);
    }
  });

  it("rejects non-alphanumeric characters in the suffix", () => {
    for (const [prefix, guard] of cases) {
      expect(guard(`${prefix}AbCdEf123456-z`)).toBe(false);
      expect(guard(`${prefix}AbCdEf123456 z`)).toBe(false);
      expect(guard(`${prefix}AbCdEf12345_6z`)).toBe(false);
    }
  });

  it("rejects a leading or trailing newline, which anchors alone would admit", () => {
    // A regex anchored with $ but not \n-aware would accept "pay_<14>\n".
    for (const [prefix, guard] of cases) {
      expect(guard(`${prefix}${S14}\n`)).toBe(false);
      expect(guard(`\n${prefix}${S14}`)).toBe(false);
    }
  });

  it("does not confuse one prefix for another", () => {
    expect(isPaymentId(`order_${S14}`)).toBe(false);
    expect(isOrderId(`pay_${S14}`)).toBe(false);
    // "adj_" is not a prefix of "disp_" but both end in the same suffix shape.
    expect(isAdjustmentId(`disp_${S14}`)).toBe(false);
    expect(isDisputeId(`adj_${S14}`)).toBe(false);
  });
});

describe("ASSAY-owned identifier grammars", () => {
  it("accepts a known prefix with a non-empty alphanumeric suffix", () => {
    expect(isObservationId("obs_1")).toBe(true);
    expect(isObservationId(`obs_${S14}`)).toBe(true);
    expect(isBankLineId("bnk_00000000000001")).toBe(true);
    expect(isLedgerEntryId("mle_abc")).toBe(true);
  });

  it("rejects an empty suffix", () => {
    expect(isObservationId("obs_")).toBe(false);
    expect(isBankLineId("bnk_")).toBe(false);
    expect(isLedgerEntryId("mle_")).toBe(false);
  });

  it("rejects characters that would put encoding-dependent bytes in a hashed field", () => {
    // ASSAY ids reach LedgerEvent.body via subject_ids (DATA_MODEL.md §16).
    for (const bad of ["obs_a b", "obs_a\nb", "obs_a-b", "obs_a_b", "obs_café"]) {
      expect(isObservationId(bad)).toBe(false);
    }
  });

  it("does not accept a Razorpay id as an ASSAY id", () => {
    expect(isObservationId(`pay_${S14}`)).toBe(false);
    expect(isBankLineId(`setl_${S14}`)).toBe(false);
  });
});

describe("prefix registry", () => {
  it("lists every prefix §0 rule 3 names, plus the two entity prefixes from §7 and §8", () => {
    expect(ID_PREFIXES.razorpay).toEqual([
      "pay_",
      "order_",
      "rfnd_",
      "setl_",
      "adj_",
      "disp_",
    ]);
    expect(ID_PREFIXES.assay).toEqual([
      "obs_",
      "cand_",
      "comp_",
      "dec_",
      "evt_",
      "exc_",
      "bnk_",
      "mle_",
    ]);
  });

  it("keeps the two namespaces disjoint, which is rule 3's stated purpose", () => {
    // "so a Razorpay ID can never be confused with an ASSAY ID"
    for (const rzp of ID_PREFIXES.razorpay) {
      for (const assay of ID_PREFIXES.assay) {
        expect(rzp.startsWith(assay)).toBe(false);
        expect(assay.startsWith(rzp)).toBe(false);
      }
    }
  });

  it("classifies ids by owner without asserting the suffix is well formed", () => {
    expect(hasRazorpayPrefix(`pay_${S14}`)).toBe(true);
    expect(hasRazorpayPrefix("pay_")).toBe(true);
    expect(hasRazorpayPrefix("obs_1")).toBe(false);
    expect(hasAssayPrefix("obs_1")).toBe(true);
    expect(hasAssayPrefix(`pay_${S14}`)).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ID_PREFIXES)).toBe(true);
    expect(Object.isFrozen(ID_PREFIXES.razorpay)).toBe(true);
    expect(Object.isFrozen(ID_PREFIXES.assay)).toBe(true);
  });
});
