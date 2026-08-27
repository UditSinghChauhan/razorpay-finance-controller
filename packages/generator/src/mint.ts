/**
 * Identifier minting.
 *
 * `DATA_MODEL.md §0` rule 3 fixes the grammars — a documented prefix plus a
 * 14-character `[A-Za-z0-9]` suffix — and states why the suffix is drawn rather
 * than counted: "Synthetic IDs are drawn from the same alphabet so the engine
 * cannot distinguish synthetic from real by shape." A sequential or
 * time-derived suffix would hand the engine a signal no real dataset carries,
 * and `§22.3` exists to refuse exactly that kind of unearned structure.
 *
 * Uniqueness is **asserted, never repaired**. A redraw on collision would make
 * the number of words a stream consumes depend on the values it produced, so a
 * collision throws: at 62^14 addresses against a few hundred draws it cannot
 * happen by chance, and if it does the cause is a defect worth finding rather
 * than a duplicate worth hiding.
 */

import {
  isAdjustmentId, isBankLineId, isDisputeId, isLedgerEntryId, isObservationId,
  isOrderId, isPaymentId, isRefundId, isSettlementId,
  type AdjustmentId, type BankLineId, type DisputeId, type LedgerEntryId,
  type ObservationId, type OrderId, type PaymentId, type RefundId, type SettlementId,
} from "@assay/domain";

import type { Prng } from "./prng.js";

/** `[A-Za-z0-9]`, in the order the grammar's character class enumerates it. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** `§0` rule 3: 14 characters. `[ASSAY-MODEL]` M7 — an observed regularity, not a contract. */
const SUFFIX_LENGTH = 14;

/** `conventions.ts` `U-ASSAY-ID-FORM`: the ASSAY-owned prefixes take the same shape. */
const PREFIXES = Object.freeze({
  payment: "pay_", order: "order_", refund: "rfnd_", settlement: "setl_",
  adjustment: "adj_", dispute: "disp_", bank_line: "bnk_", ledger_entry: "mle_",
  observation: "obs_",
} as const);

type Kind = keyof typeof PREFIXES;

const GUARDS: Readonly<Record<Kind, (value: string) => boolean>> = Object.freeze({
  payment: isPaymentId, order: isOrderId, refund: isRefundId, settlement: isSettlementId,
  adjustment: isAdjustmentId, dispute: isDisputeId, bank_line: isBankLineId,
  ledger_entry: isLedgerEntryId, observation: isObservationId,
});

/**
 * A per-dataset identifier mint.
 *
 * One instance holds one dataset's used-set, so uniqueness is a property of the
 * dataset rather than of a global the next run inherits.
 */
export class Minter {
  readonly #prng: Prng;
  readonly #used = new Set<string>();

  constructor(prng: Prng) {
    this.#prng = prng;
  }

  #mint(kind: Kind): string {
    let suffix = "";
    for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
      suffix += ALPHABET.charAt(this.#prng.below(ALPHABET.length));
    }
    const id = PREFIXES[kind] + suffix;
    if (this.#used.has(id)) {
      throw new Error(
        `Minter: ${id} was minted twice. DATA_MODEL.md §0 rule 3's identifiers must be unique ` +
          `within a dataset; a repeat at this address count is a generator defect, not chance.`,
      );
    }
    if (!GUARDS[kind](id)) {
      /* c8 ignore next 3 */
      throw new Error(`Minter: ${id} does not satisfy the ${kind} grammar (DATA_MODEL.md §0 rule 3).`);
    }
    this.#used.add(id);
    return id;
  }

  payment(): PaymentId { return this.#mint("payment") as PaymentId; }
  order(): OrderId { return this.#mint("order") as OrderId; }
  refund(): RefundId { return this.#mint("refund") as RefundId; }
  settlement(): SettlementId { return this.#mint("settlement") as SettlementId; }
  adjustment(): AdjustmentId { return this.#mint("adjustment") as AdjustmentId; }
  dispute(): DisputeId { return this.#mint("dispute") as DisputeId; }
  bankLine(): BankLineId { return this.#mint("bank_line") as BankLineId; }
  ledgerEntry(): LedgerEntryId { return this.#mint("ledger_entry") as LedgerEntryId; }
  observation(): ObservationId { return this.#mint("observation") as ObservationId; }

  /** How many identifiers this mint has issued. */
  get size(): number { return this.#used.size; }
}

/**
 * A UTR of the documented sample's shape: ten digits then six lower-case
 * alphanumerics (`conventions.ts` `U-UTR-SHAPE`).
 *
 * Shape only. `DATA_MODEL.md §22.2` M8 records that Razorpay "asserts no
 * uniqueness, and official samples show at least three different UTR shapes",
 * and `§22.3` refuses any claim that the leading run is sequential, time-derived
 * or issuer-prefixed — so every character here is drawn.
 */
export function mintUtr(prng: Prng): string {
  const digits = "0123456789";
  const tail = "abcdefghijklmnopqrstuvwxyz0123456789";
  let utr = "";
  for (let i = 0; i < 10; i += 1) utr += digits.charAt(prng.below(digits.length));
  for (let i = 0; i < 6; i += 1) utr += tail.charAt(tail.length === 0 ? 0 : prng.below(tail.length));
  return utr;
}

/** The alphabet a `MANGLE_UTR` substitution draws its replacement from. */
export const UTR_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
