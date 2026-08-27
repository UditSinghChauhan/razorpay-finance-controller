import { describe, expect, it } from "vitest";

import { RECEIPT_FORMAT } from "../src/frozen.js";
import { assertOrderRefsInjective, buildReceipt, receiptToOrderRef } from "../src/receipt.js";

/**
 * `PREREGISTRATION.md §4.2`, "The `receipt` / `order_ref` contract ... (ledger
 * row D23)" and "The concrete transform, supplied at spec 1.4.1".
 */
describe("D23 — the receipt format", () => {
  it("is exactly 16 ASCII characters, INV- YYYY MM - NNNNN", () => {
    const receipt = buildReceipt("2026", "07", 42);
    expect(receipt).toBe("INV-202607-00042");
    expect(receipt).toHaveLength(RECEIPT_FORMAT.total_length);
    expect(receipt.length).toBeLessThanOrEqual(RECEIPT_FORMAT.max_length); // D31
    expect(/^[\x20-\x7e]+$/.test(receipt)).toBe(true);
  });

  it("zero-pads the sequence to five digits from 00001", () => {
    expect(buildReceipt("2026", "07", 1)).toBe("INV-202607-00001");
    expect(buildReceipt("2026", "07", 99_999)).toBe("INV-202607-99999");
  });

  it("fails the build past 99999 rather than wrapping or widening", () => {
    expect(() => buildReceipt("2026", "07", 100_000)).toThrow(/GENERATOR DEFECT/);
    expect(() => buildReceipt("2026", "07", 0)).toThrow(RangeError);
    expect(() => buildReceipt("26", "07", 1)).toThrow(RangeError);
  });
});

describe("D23 — the receipt -> order_ref transform", () => {
  it("reproduces §4.2's worked example", () => {
    expect(receiptToOrderRef("INV-202607-00042")).toBe("2607/42");
  });

  it("honours both declared boundaries", () => {
    expect(receiptToOrderRef("INV-202607-00001")).toBe("2607/1");
    expect(receiptToOrderRef("INV-202607-99999")).toBe("2607/99999");
  });

  it("copies MM unchanged and takes the last two characters of YYYY", () => {
    expect(receiptToOrderRef("INV-209912-00123")).toBe("9912/123");
    expect(receiptToOrderRef("INV-200001-00001")).toBe("0001/1");
  });

  it("computes no numeric value on the year or month and never rounds", () => {
    // A numeric round-trip would turn "0001" into "11"; the transform is textual.
    expect(receiptToOrderRef("INV-200001-00010")).toBe("0001/10");
  });

  it("is total over the declared format and refuses everything else", () => {
    for (const bad of [
      "", "INV-202607-0042", "INV-202607-000042", "inv-202607-00042",
      "INV-20267-00042", "INV-202607_00042", "2607/42", " INV-202607-00042",
      "INV-202607-00042 ", "INV-2026O7-00042",
    ]) {
      expect(() => receiptToOrderRef(bad)).toThrow(/does not match/);
    }
  });

  it("is a pure string function: same input, same output, no state", () => {
    const once = receiptToOrderRef("INV-202607-01234");
    for (let i = 0; i < 100; i += 1) expect(receiptToOrderRef("INV-202607-01234")).toBe(once);
  });

  it("is injective over a whole period's sequences", () => {
    const receipts = Array.from({ length: 3000 }, (_, i) => buildReceipt("2026", "07", i + 1));
    expect(() => { assertOrderRefsInjective(receipts); }).not.toThrow();
    expect(new Set(receipts.map(receiptToOrderRef)).size).toBe(receipts.length);
  });

  it("reports a collision rather than emitting one", () => {
    expect(() => {
      assertOrderRefsInjective(["INV-202607-00001", "INV-202607-00001"]);
    }).toThrow(/injective/);
  });

  it("retains the sequence, so SE2 scores above chance and below identity", () => {
    // §4.2 freezes the retention band as the contract: enough token overlap for
    // Jaro-Winkler to score above chance, and never an identity — AN5 is retired
    // and "no rule anywhere compares the two fields for equality".
    const receipt = "INV-202607-00042";
    const ref = receiptToOrderRef(receipt);
    expect(ref).not.toBe(receipt);
    expect(receipt).toContain("2607");
    expect(ref).toContain("2607");
    expect(receipt.endsWith("42")).toBe(true);
    expect(ref.endsWith("42")).toBe(true);
  });
});
