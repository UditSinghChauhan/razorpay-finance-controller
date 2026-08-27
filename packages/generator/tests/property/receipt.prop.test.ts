import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RECEIPT_FORMAT } from "../../src/frozen.js";
import { buildReceipt, receiptToOrderRef } from "../../src/receipt.js";

const sequenceArb = fc.integer({ min: 1, max: RECEIPT_FORMAT.max_sequence });
const yearArb = fc.integer({ min: 0, max: 9999 }).map((y) => String(y).padStart(4, "0"));
const monthArb = fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, "0"));

/** `PREREGISTRATION.md §4.2`, the frozen `receipt` / `order_ref` contract. */
describe("the D23 transform", () => {
  it("is total over the declared receipt format", () => {
    fc.assert(
      fc.property(yearArb, monthArb, sequenceArb, (year, month, sequence) => {
        expect(() => receiptToOrderRef(buildReceipt(year, month, sequence))).not.toThrow();
      }),
      { numRuns: 3000 },
    );
  });

  it("is injective: distinct receipts never share an order_ref", () => {
    fc.assert(
      fc.property(yearArb, monthArb, sequenceArb, sequenceArb, (year, month, a, b) => {
        fc.pre(a !== b);
        expect(receiptToOrderRef(buildReceipt(year, month, a)))
          .not.toBe(receiptToOrderRef(buildReceipt(year, month, b)));
      }),
      { numRuns: 3000 },
    );
  });

  it("copies MM unchanged, takes YYYY's last two characters, and strips only leading zeros", () => {
    fc.assert(
      fc.property(yearArb, monthArb, sequenceArb, (year, month, sequence) => {
        const ref = receiptToOrderRef(buildReceipt(year, month, sequence));
        expect(ref).toBe(`${year.slice(2)}${month}/${String(sequence)}`);
        expect(ref.split("/")[1]?.startsWith("0")).toBe(false);
      }),
      { numRuns: 3000 },
    );
  });

  it("computes no numeric value and never rounds — the output is a pure re-encoding", () => {
    fc.assert(
      fc.property(yearArb, monthArb, sequenceArb, (year, month, sequence) => {
        const ref = receiptToOrderRef(buildReceipt(year, month, sequence));
        const [stamp, tail] = ref.split("/");
        expect(stamp).toBe(`${year.slice(2)}${month}`);
        expect(Number(tail)).toBe(sequence);
      }),
      { numRuns: 3000 },
    );
  });

  it("retains shape without ever producing an identity", () => {
    fc.assert(
      fc.property(yearArb, monthArb, sequenceArb, (year, month, sequence) => {
        const receipt = buildReceipt(year, month, sequence);
        const ref = receiptToOrderRef(receipt);
        expect(ref).not.toBe(receipt);
        expect(ref.length).toBeLessThan(receipt.length);
        expect(receipt).toContain(ref.split("/")[0] ?? "");
      }),
      { numRuns: 3000 },
    );
  });

  it("refuses anything outside the declared format, with no recovery path", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (candidate) => {
        fc.pre(!/^INV-\d{4}\d{2}-\d{5}$/.test(candidate));
        expect(() => receiptToOrderRef(candidate)).toThrow();
      }),
      { numRuns: 3000 },
    );
  });
});
