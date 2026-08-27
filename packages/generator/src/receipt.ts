/**
 * The `order.receipt` format and its `MerchantLedgerEntry.order_ref` transform.
 *
 * Both are frozen at `PREREGISTRATION.md §4.2` and are transcribed here without
 * interpretation. The transform is the **single parameter** that section
 * freezes for this contract, because `RECONCILIATION_SPEC.md §4.2` gives `SE2`
 * 2,000 of the 10,000 basis points of `evidence_score_bps`, so its shape moves
 * metric 4 and metric 8.
 *
 * `receipt` is **quarantined** (`DATA_MODEL.md §0` rule 4). It exists in this
 * package's true state and reaches the dataset only as an `UntrustedText` row
 * with `field: "order_receipt"`. `OrderSchema` carries no `receipt` field and
 * strict mode rejects one, so the quarantine is structural rather than a
 * convention this module must remember.
 *
 * `AN5` is retired (`RECONCILIATION_SPEC.md §3`), so nothing anywhere compares
 * `order_ref` with `receipt` for equality. `§4.2`: "exact-match: NOT a parameter."
 */

import { RECEIPT_FORMAT } from "./frozen.js";

/** `§4.2`: `"INV-" YYYY MM "-" NNNNN`, exactly 16 ASCII characters. */
const RECEIPT_PATTERN = /^INV-(\d{4})(\d{2})-(\d{5})$/;

/**
 * Build a receipt for `sequence` (1-based) in the period `year`/`month`.
 *
 * `§4.2`: "a sequence that would exceed 99999 is a GENERATOR DEFECT: the
 * generator asserts and fails the build. It never wraps, never widens the field
 * and never reuses a sequence."
 */
export function buildReceipt(year: string, month: string, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(`buildReceipt: sequence must be a positive integer, received ${String(sequence)}`);
  }
  if (sequence > RECEIPT_FORMAT.max_sequence) {
    throw new Error(
      `buildReceipt: sequence ${String(sequence)} exceeds ${String(RECEIPT_FORMAT.max_sequence)}. ` +
        `PREREGISTRATION.md §4.2 calls this a GENERATOR DEFECT: the field is never widened, ` +
        `never wrapped and never reused.`,
    );
  }
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    throw new RangeError(`buildReceipt: expected YYYY and MM, received ${year}/${month}`);
  }
  const receipt = `${RECEIPT_FORMAT.prefix}${year}${month}-${String(sequence).padStart(RECEIPT_FORMAT.sequence_digits, "0")}`;
  /* c8 ignore next 3 */
  if (receipt.length !== RECEIPT_FORMAT.total_length) {
    throw new Error(`buildReceipt: produced ${String(receipt.length)} characters, §4.2 fixes ${String(RECEIPT_FORMAT.total_length)}.`);
  }
  return receipt;
}

/**
 * `receipt -> order_ref`: `YY MM "/" N`, leading zeros of the sequence removed.
 *
 * `"INV-202607-00042" -> "2607/42"`. `§4.2`: "units: characters. No numeric
 * value is computed and no rounding occurs anywhere in the transform." It is
 * total over the declared format and applied to nothing else — "A receipt not
 * matching the format is a generator defect that fails the build; the transform
 * performs no recovery, no normalisation and no fallback." It is a pure string
 * function: it draws no PRNG value, reads no clock, and depends on no iteration
 * order.
 */
export function receiptToOrderRef(receipt: string): string {
  const match = RECEIPT_PATTERN.exec(receipt);
  if (match === null) {
    throw new Error(
      `receiptToOrderRef: "${receipt}" does not match PREREGISTRATION.md §4.2's declared receipt ` +
        `format. The transform is TOTAL over that format and performs no recovery, no ` +
        `normalisation and no fallback; a receipt outside it is a generator defect.`,
    );
  }
  const [, year, month, sequence] = match;
  /* c8 ignore next */
  if (year === undefined || month === undefined || sequence === undefined) throw new Error("receiptToOrderRef: unreachable");
  // §4.2 boundary: "00001" -> "1", "99999" -> "99999". Never widened, never padded.
  return `${year.slice(2)}${month}/${String(Number(sequence))}`;
}

/**
 * Assert the transform is injective over `receipts` (`§4.2`: "ties: none are
 * possible ... The generator asserts this").
 */
export function assertOrderRefsInjective(receipts: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const receipt of receipts) {
    const ref = receiptToOrderRef(receipt);
    const previous = seen.get(ref);
    if (previous !== undefined) {
      throw new Error(
        `receiptToOrderRef: "${previous}" and "${receipt}" both map to "${ref}". §4.2 requires the ` +
          `transform to be injective because receipt is unique (D31); this is a generator defect.`,
      );
    }
    seen.set(ref, receipt);
  }
}
