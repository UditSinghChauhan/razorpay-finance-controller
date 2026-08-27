/**
 * `GroundTruth.true_journal` and its projection, `true_balances`.
 *
 * `DATA_MODEL.md §1`: "Produced by applying `DATA_MODEL §17.1`-`§17.2` (truth
 * side) to the simulated events at the moment each occurs." Truth posts from
 * omniscience: it knows `Adjustment.reason` and `Adjustment.direction`, which no
 * observation carries, so it takes `§17.2`'s **five-way branch** where the agent
 * takes `P8` for every adjustment.
 *
 * **`@assay/ledger`'s `journalFor()` is deliberately not called.** That function
 * is the agent side — `§17.1.1`'s trigger table over `Observation.kind` x
 * terminal state x `ExceptionClass`. Truth has no terminal states, no exception
 * classes and no evidence conditions; it books what happened. Calling it here
 * would post `P8` for a `fee_correction` that truth books to
 * `5100_PG_FEE_EXPENSE`, and would put `proj_agent != proj_truth` on a correct
 * decision — the confound `EVALUATION_SPEC.md §4.4` exists to remove.
 * `POSTING_REFS` **is** imported, so the two journals name the same eight rules
 * with the same tokens and a reviewer can join them by eye.
 *
 * **What this is not** (`§1`): not a `LedgerEvent` stream. No `run_id`, no
 * `evt_id`, no `ts`, no `prev_hash`, no `hash`, no `actor`, no `certificate`.
 * It is not hash-chained and enters no `ledger_root_hash` — "the ledger chain
 * belongs to the agent's run, and truth has no run".
 */

import { ACCOUNT_CODES, type AccountCode } from "@assay/domain";
import { POSTING_REFS } from "@assay/ledger";
import { paise, type Paise } from "@assay/money";

import type { SimAdjustment, TrueState } from "./simulate.js";

/** One line of `GroundTruth.true_journal` (`DATA_MODEL.md §1`). */
export interface TrueJournalLine {
  readonly seq: number;
  /** The JOIN KEY for covered-set projection: `pay_… | rfnd_… | adj_…`. */
  readonly source_entity_id: string;
  readonly posting_ref: (typeof POSTING_REFS)[number];
  readonly account: AccountCode;
  readonly dr_paise: Paise;
  readonly cr_paise: Paise;
}

interface Pending {
  readonly at: number;
  readonly source_entity_id: string;
  readonly posting_ref: (typeof POSTING_REFS)[number];
  readonly account: AccountCode;
  readonly dr_paise: Paise;
  readonly cr_paise: Paise;
}

const ZERO = paise(0);

/**
 * Build `true_journal` from a completed simulation.
 *
 * **Determinism** (`§1`): "`seq` is assigned by a canonical traversal in
 * simulated-time order, ties broken by `source_entity_id` ascending, then by
 * `account` ascending. It is never ordered by wall-clock time, process ID or
 * iteration over an unordered collection."
 */
export function buildTrueJournal(state: TrueState): TrueJournalLine[] {
  const pending: Pending[] = [];
  const settlementOf = new Map<number, { settled_at: number }>();
  for (const settlement of state.settlements) {
    settlementOf.set(settlement.day, { settled_at: settlement.settled_at });
  }

  // Which settlement, if any, actually carried each member. Truth posts the
  // bank leg only for what moved: an unallocated line reached no bank credit,
  // so posting `1200_BANK` for it would assert money that never arrived.
  const settledPayment = new Map<number, number>();
  const settledRefund = new Map<number, number>();
  const settledAdjustment = new Map<number, number>();
  for (const settlement of state.settlements) {
    for (const member of settlement.members) {
      const table =
        member.kind === "payment" ? settledPayment
        : member.kind === "refund" ? settledRefund
        : settledAdjustment;
      table.set(member.index, settlement.settled_at);
    }
  }

  // --- P1 / P2 -------------------------------------------------------------
  for (const payment of state.payments) {
    if (!payment.captured || payment.fee === null) continue;
    const key = payment.id;
    // P1 "Payment captured at the gateway": DR 1100 amount / CR 4000 amount.
    pending.push(
      { at: payment.created_at, source_entity_id: key, posting_ref: "P1", account: "1100_GATEWAY_RECEIVABLE", dr_paise: payment.amount, cr_paise: ZERO },
      { at: payment.created_at, source_entity_id: key, posting_ref: "P1", account: "4000_REVENUE", dr_paise: ZERO, cr_paise: payment.amount },
    );
    const settledAt = settledPayment.get(payment.index);
    if (settledAt === undefined) continue;
    // P2 "Settlement reconciled to a bank credit". Balances by construction:
    // credit + (fee - tax) + tax = amount - fee + fee = amount.
    pending.push(
      { at: settledAt, source_entity_id: key, posting_ref: "P2", account: "1200_BANK", dr_paise: payment.fee.credit, cr_paise: ZERO },
      { at: settledAt, source_entity_id: key, posting_ref: "P2", account: "5100_PG_FEE_EXPENSE", dr_paise: payment.fee.fee_ex_gst, cr_paise: ZERO },
      { at: settledAt, source_entity_id: key, posting_ref: "P2", account: "1300_GST_INPUT_CREDIT", dr_paise: payment.fee.tax, cr_paise: ZERO },
      { at: settledAt, source_entity_id: key, posting_ref: "P2", account: "1100_GATEWAY_RECEIVABLE", dr_paise: ZERO, cr_paise: payment.amount },
    );
  }

  // --- P3 / P4 -------------------------------------------------------------
  for (const refund of state.refunds) {
    const key = refund.id;
    // P3 "Refund initiated": DR 4000 / CR 2200.
    pending.push(
      { at: refund.created_at, source_entity_id: key, posting_ref: "P3", account: "4000_REVENUE", dr_paise: refund.amount, cr_paise: ZERO },
      { at: refund.created_at, source_entity_id: key, posting_ref: "P3", account: "2200_REFUND_LIABILITY", dr_paise: ZERO, cr_paise: refund.amount },
    );
    const settledAt = settledRefund.get(refund.index);
    if (settledAt === undefined) continue;
    // P4 "Refund settled out of the bank": DR 2200 / CR 1200.
    pending.push(
      { at: settledAt, source_entity_id: key, posting_ref: "P4", account: "2200_REFUND_LIABILITY", dr_paise: refund.amount, cr_paise: ZERO },
      { at: settledAt, source_entity_id: key, posting_ref: "P4", account: "1200_BANK", dr_paise: ZERO, cr_paise: refund.amount },
    );
  }

  // --- adjustments: §17.2's truth-side five-way branch ----------------------
  for (const adjustment of state.adjustments) {
    const settledAt = settledAdjustment.get(adjustment.index);
    if (settledAt === undefined) continue;
    for (const line of truthAdjustmentLegs(adjustment, settledAt)) pending.push(line);
  }

  pending.sort(
    (a, b) =>
      a.at - b.at ||
      compare(a.source_entity_id, b.source_entity_id) ||
      ACCOUNT_CODES.indexOf(a.account) - ACCOUNT_CODES.indexOf(b.account),
  );

  return pending.map((line, seq) => ({
    seq,
    source_entity_id: line.source_entity_id,
    posting_ref: line.posting_ref,
    account: line.account,
    dr_paise: line.dr_paise,
    cr_paise: line.cr_paise,
  }));
}

/**
 * `DATA_MODEL.md §17.2`'s truth-side table, in full.
 *
 * | `reason`              | Truth posting                                       |
 * | `fee_correction`      | debit: DR 5100 / CR 1200; credit: the reverse       |
 * | `gst_correction`      | debit: DR 1300 / CR 1200; credit: the reverse       |
 * | `chargeback_debit`    | P8 shape — no account corresponds to a deduction    |
 * | `chargeback_reversal` | P8 shape — as above                                 |
 * | `manual`              | P8 shape — undetermined by construction             |
 */
function truthAdjustmentLegs(adjustment: SimAdjustment, at: number): Pending[] {
  const key = adjustment.id;
  const M = adjustment.amount;
  if (adjustment.reason === "fee_correction" || adjustment.reason === "gst_correction") {
    // §17.2's truth table gives these two their own accounts (DR 5100 / CR 1200
    // and DR 1300 / CR 1200) but assigns them no rule among `P1`-`P8`, and
    // `GroundTruth.true_journal.posting_ref` (§1) admits only those eight. There
    // is no honest label to write, so nothing is written: both reasons are
    // UNREACHABLE at the frozen parameters, because §4.2's 0.8% adjustment rate
    // realizes to zero at `S = 31` (§10 V14) and `F07` emits only the chargeback
    // pair. If a future amendment makes them reachable it must also supply the
    // posting reference, which is a specification decision, not a default.
    throw new Error(
      `truth-journal: DATA_MODEL.md §17.2's truth side books a ${adjustment.reason} to named ` +
        `accounts but assigns it no posting_ref among P1-P8. §10 V14 records that no family ` +
        `instance generates one at the frozen rates; reaching this line means a rate moved.`,
    );
  }
  // `chargeback_debit`, `chargeback_reversal` and `manual` all take the "P8
  // shape — no account among the seven corresponds to a dispute deduction".
  const counterparty: AccountCode = "9000_SUSPENSE_UNRECONCILED";
  const ref: (typeof POSTING_REFS)[number] = "P8";
  // A debit adjustment takes value out of the bank; a credit puts it back.
  const [drAccount, crAccount]: [AccountCode, AccountCode] =
    adjustment.direction === "debit" ? [counterparty, "1200_BANK"] : ["1200_BANK", counterparty];
  return [
    { at, source_entity_id: key, posting_ref: ref, account: drAccount, dr_paise: M, cr_paise: ZERO },
    { at, source_entity_id: key, posting_ref: ref, account: crAccount, dr_paise: ZERO, cr_paise: M },
  ];
}

/**
 * `true_balances` — "For every account: `Sigma dr_paise - Sigma cr_paise` over
 * `true_journal`" (`DATA_MODEL.md §1`).
 *
 * Retained as a redundant checksum: "A mismatch between the two is a **generator
 * defect and a seal failure**" (`PREREGISTRATION.md §9` step 5).
 */
export function projectTrueBalances(journal: readonly TrueJournalLine[]): Record<AccountCode, Paise> {
  const balances = Object.fromEntries(ACCOUNT_CODES.map((a) => [a, 0])) as Record<AccountCode, number>;
  for (const line of journal) {
    balances[line.account] += line.dr_paise - line.cr_paise;
  }
  return Object.fromEntries(
    ACCOUNT_CODES.map((a) => [a, paise(balances[a])]),
  ) as Record<AccountCode, Paise>;
}

/** `I1`: `Sigma dr = Sigma cr` across every posted line. */
export function trialBalance(journal: readonly TrueJournalLine[]): { dr: number; cr: number } {
  let dr = 0;
  let cr = 0;
  for (const line of journal) {
    dr += line.dr_paise;
    cr += line.cr_paise;
  }
  return { dr, cr };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
