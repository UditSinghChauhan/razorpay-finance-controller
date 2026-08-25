/**
 * The seven control accounts.
 *
 * `DATA_MODEL.md §17` is normative and the union below is transcribed from it.
 * The set is closed: `§17.2` states plainly that "no eighth `AccountCode` is
 * added", and `EVALUATION_SPEC.md §4.4` sums `balance_harm_inr` over exactly
 * this universe, so adding a member would silently change a frozen metric.
 */

/** A control account. The set is frozen by `DATA_MODEL.md §17`. */
export type AccountCode =
  | "1100_GATEWAY_RECEIVABLE"
  | "1200_BANK"
  | "1300_GST_INPUT_CREDIT"
  | "2200_REFUND_LIABILITY"
  | "4000_REVENUE"
  | "5100_PG_FEE_EXPENSE"
  | "9000_SUSPENSE_UNRECONCILED";

/**
 * All seven accounts, in the order `DATA_MODEL.md §17` declares them.
 *
 * The order is fixed so that anything iterating the accounts — a balance
 * vector, a trial balance, a report row — traverses them identically on every
 * run. `EVALUATION_SPEC.md §4.12` requires two runs over identical input to
 * produce the same ledger root hash, and an unstable traversal is one of the
 * ways that quietly stops being true.
 */
export const ACCOUNT_CODES = Object.freeze([
  "1100_GATEWAY_RECEIVABLE",
  "1200_BANK",
  "1300_GST_INPUT_CREDIT",
  "2200_REFUND_LIABILITY",
  "4000_REVENUE",
  "5100_PG_FEE_EXPENSE",
  "9000_SUSPENSE_UNRECONCILED",
] as const satisfies readonly AccountCode[]);

/**
 * The account every abstention and every open exception posts to.
 *
 * Named rather than spelled out at each call site because `DATA_MODEL.md §17`
 * calls it "the honesty account" and gate `G3` tests its gross per-item sum;
 * `EVALUATION_SPEC.md §4.4` excludes it from harm. Three separate rules single
 * this account out, so it is worth being unable to mistype.
 */
export const SUSPENSE_ACCOUNT = "9000_SUSPENSE_UNRECONCILED" as const;

/** Whether `value` is one of the seven control accounts. */
export function isAccountCode(value: string): value is AccountCode {
  return (ACCOUNT_CODES as readonly string[]).includes(value);
}
