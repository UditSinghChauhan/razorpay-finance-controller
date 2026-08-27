/**
 * The forward business simulation — the true state, and nothing else.
 *
 * `PREREGISTRATION.md §3`: "The generator **simulates the business process
 * forward** and records what actually happened. Ground truth is a byproduct of
 * construction." Three rules govern it and violating any one invalidates the
 * benchmark: no LLM is involved; ground truth is never authored as an
 * annotation; and the degradation layer, which lives in `degrade.ts`, "only
 * removes or corrupts information".
 *
 * **Nothing in this module degrades anything.** `§4.3` confines every operator
 * to "observations only, never to the true state". `F05`'s withheld row is an
 * *emission* decision (`emit.ts`) and `F06`'s collision is genuine true state,
 * exactly as `§4.2` says of each.
 *
 * **No count here is drawn.** Every population size comes from `composition.ts`,
 * which derives it from the frozen rates by `round_half_up`. The seed decides
 * *which* entities and *what* they carry, never *how many* — `§4.1`'s rate
 * realization rule, which is what makes `target_record_count` seed-invariant.
 */

import {
  add, paise, sub, sum, type Paise,
} from "@assay/money";
import type {
  AdjustmentId, DisputeId, OrderId, PaymentId, RefundId, SettlementId,
  BankLineId, LedgerEntryId, AccountCode,
} from "@assay/domain";

import { drawAmount, feeBreakdown, rateBpsFor, type FeeBreakdown, type Method } from "./amount.js";
import {
  COMPOSITION, F05_SELECTED_SETTLEMENTS, F06_PAIR_COUNT, PARTIAL_REFUND_COUNT,
  T_PLUS_1_BATCHES, T_PLUS_3_BATCHES, evenSplit, realize,
} from "./composition.js";
import { CARD_ISSUER_SET } from "./conventions.js";
import { FAMILY_MECHANICS } from "./families.js";
import {
  ADJUSTMENT_REASON_MIX, BANK_CLOCK_MAX_OFFSET_SECONDS, BANK_REF_CLEAN_RATE,
  CARD_NETWORK_MIX, CARD_TYPE_MIX, DISPUTE_STATUS_MIX, F03_CARD_RATE_BPS_AFTER,
  F09_LATE_WINDOW_DAYS, FEE_RATE_BPS, MERCHANT_CLOCK_OFFSET_RATE, METHOD_MIX,
  SETTLEMENT_CYCLE, type FamilyId,
} from "./frozen.js";
import { Minter, mintUtr } from "./mint.js";
import {
  DAY_COUNT, DAY_EVENT_WINDOW_SECONDS, F03_RATE_CHANGE_AT, PERIOD_FROM,
  SECONDS_PER_DAY, dayInstant, istYearMonth, settlementInstant,
} from "./period.js";
import { STREAMS, substream, type Prng } from "./prng.js";
import { assertOrderRefsInjective, buildReceipt, receiptToOrderRef } from "./receipt.js";

// ---------------------------------------------------------------------------
// True-state records
// ---------------------------------------------------------------------------

/** Card attributes. `[RZP-DOC]` they are recon-report columns, not Payment fields (`§2`). */
export interface SimCard {
  readonly network: string;
  readonly type: string;
  readonly issuer: string;
}

export interface SimPayment {
  readonly index: number;
  readonly id: PaymentId;
  readonly order_index: number;
  readonly amount: Paise;
  readonly method: Method;
  readonly captured: boolean;
  readonly day: number;
  readonly created_at: number;
  readonly card: SimCard | null;
  /** The rate in force for this line. Differs from the method rate only under `F03`. */
  readonly rate_bps: number;
  /** `null` for an authorised-not-captured payment: no recon line exists to carry a fee. */
  readonly fee: FeeBreakdown | null;
  readonly refunded_paise: Paise;
  readonly dispute_index: number | null;
  /** `false` only for the unsettled member of an `F06` collision pair. */
  readonly settles: boolean;
}

export interface SimOrder {
  readonly index: number;
  readonly id: OrderId;
  readonly amount: Paise;
  readonly amount_paid: Paise;
  readonly amount_due: Paise;
  readonly status: "attempted" | "paid";
  readonly created_at: number;
  /** QUARANTINED (`DATA_MODEL.md §0` rule 4). Reaches the dataset only as `UntrustedText`. */
  readonly receipt: string;
}

export interface SimRefund {
  readonly index: number;
  readonly id: RefundId;
  readonly payment_index: number;
  readonly amount: Paise;
  readonly partial: boolean;
  readonly day: number;
  readonly created_at: number;
  /** The capture day whose batch carries this refund's recon row; `null` if none does. */
  readonly settlement_day: number | null;
}

export interface SimDispute {
  readonly index: number;
  readonly id: DisputeId;
  readonly payment_index: number;
  readonly amount: Paise;
  readonly status: string;
  readonly created_at: number;
}

export interface SimAdjustment {
  readonly index: number;
  readonly id: AdjustmentId;
  readonly amount: Paise;
  readonly direction: "debit" | "credit";
  readonly reason: string;
  readonly created_at: number;
  readonly related_entity_id: string | null;
  readonly dispute_index: number | null;
  readonly settlement_day: number | null;
}

/** One allocated constituent of a settlement. */
export type SimMember =
  | { readonly kind: "payment"; readonly index: number }
  | { readonly kind: "refund"; readonly index: number }
  | { readonly kind: "adjustment"; readonly index: number };

export interface SimSettlement {
  readonly index: number;
  readonly id: SettlementId;
  readonly day: number;
  readonly cycle_days: number;
  readonly settled_at: number;
  readonly utr: string;
  readonly amount: Paise;
  readonly members: readonly SimMember[];
}

export interface SimBankLine {
  readonly index: number;
  readonly id: BankLineId;
  readonly settlement_index: number;
  readonly value_date: number;
  readonly amount: Paise;
  readonly bank_ref: string | null;
  readonly narration: string;
}

export interface SimLedgerEntry {
  readonly index: number;
  readonly id: LedgerEntryId;
  readonly payment_index: number;
  readonly booked_at: number;
  readonly order_ref: string;
  readonly invoice_no: string;
  readonly gross_paise: Paise;
  readonly expected_net_paise: Paise;
  readonly gl_account: AccountCode;
  readonly memo: string;
}

/** Everything the simulation knows. Never visible to the engine (`AL1`, `AL2`). */
export interface TrueState {
  readonly family_id: FamilyId;
  readonly seed: number;
  readonly orders: readonly SimOrder[];
  readonly payments: readonly SimPayment[];
  readonly refunds: readonly SimRefund[];
  readonly disputes: readonly SimDispute[];
  readonly adjustments: readonly SimAdjustment[];
  readonly settlements: readonly SimSettlement[];
  readonly bank_lines: readonly SimBankLine[];
  readonly ledger_entries: readonly SimLedgerEntry[];
}

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------

/** `conventions.ts` `U-LEDGER-FIELDS`: the merchant's guess is a flat card-rate estimate. */
const MERCHANT_EXPECTED_RATE_BPS = FEE_RATE_BPS.card;

/**
 * `PREREGISTRATION.md §4.2`, "Batch composition when a member cannot be carried,
 * added at spec 1.4.2 `[ASSAY-MODEL]`" — transcribed below and applied
 * unconditionally.
 *
 * Four frozen rules are jointly unsatisfiable on some capture-days:
 * `Settlement.amount` is a non-negative `paiseField` (`ARCHITECTURE.md §4`);
 * `I4` fixes `settlement.amount = Sigma credit - Sigma debit` over the allocated
 * lines; `I3` enters a refund into that sum as a **debit**; and `§4.1`'s
 * one-batch-per-capture-day meets `§4.2`'s 4.5% refund rate and its heavy-tailed
 * amount distribution. Spec 1.4.2 ratified the resolution:
 *
 *     rule         a member the batch cannot carry is NOT allocated to it, and
 *                  is NOT moved to another batch. It is emitted UNSETTLED.
 *
 *     selection    debit-side members are admitted to their own batch in
 *                  ascending amount, ties broken by the member's own index,
 *                  while the running net stays non-negative. The order is
 *                  total, is computed from the batch alone, and reads no metric
 *                  and no outcome.
 *
 *     scope        only the batch §4.1 and §4.2 already allocated the member to.
 *                  No member is moved to another capture-day, so no settled_at
 *                  is manufactured and C4 is neither stretched nor consulted.
 *
 *     composition  UNCHANGED. No row is added and none removed.
 *
 * **There is no policy parameter, and that is deliberate.** Before ratification
 * this module carried a `REFUSE` / `DEFER_TO_UNSETTLED` switch, because choosing
 * a resolution was a specification decision it had no standing to make. The
 * specification has now made it, and the rule is unconditional: a knob whose
 * other position produces a dataset the frozen specification does not describe
 * is a way to generate a non-conforming benchmark by passing an argument.
 *
 * `emit.ts` carries `§4.2`'s emitted-as list — `settlement_id`, `settled`,
 * `settled_at` and `settlement_utr` all `null`/`false`, `created_at` and
 * `amount` unchanged — because it reads them off the absence of a settlement
 * rather than from a second code path.
 */
export function simulate(family: FamilyId, seed: number): TrueState {
  const mechanics = FAMILY_MECHANICS[family];
  const s = (name: string): Prng => substream(seed, family, name);

  const minter = new Minter(s(STREAMS.ID));
  const amountP = s(STREAMS.AMOUNT);
  const methodP = s(STREAMS.METHOD);
  const cardP = s(STREAMS.CARD);
  const captureP = s(STREAMS.CAPTURE);
  const clockP = s(STREAMS.DAY_CLOCK);
  const refundP = s(STREAMS.REFUND);
  const disputeP = s(STREAMS.DISPUTE);
  const cycleP = s(STREAMS.CYCLE);
  const bankP = s(STREAMS.BANK);
  const merchantP = s(STREAMS.MERCHANT);
  const f06P = s(STREAMS.F06);
  const f07P = s(STREAMS.F07);

  const { P, A, N, R, D } = COMPOSITION;

  // --- amounts, methods and card attributes, one draw each, in index order ---
  const amounts: Paise[] = [];
  const methods: Method[] = [];
  const cards: (SimCard | null)[] = [];
  for (let i = 0; i < P; i += 1) {
    amounts.push(drawAmount(amountP));
    const method = methodP.pick(METHOD_MIX);
    methods.push(method);
    cards.push(
      method === "card"
        ? {
            network: cardP.pick(CARD_NETWORK_MIX),
            type: cardP.pick(CARD_TYPE_MIX),
            issuer: cardP.pick(CARD_ISSUER_SET),
          }
        : null,
    );
  }

  // --- which payments are captured (exactly N), and on which day ------------
  const capturedIndices = captureP.sample(P, N);
  const capturedSet = new Set(capturedIndices);
  const uncapturedIndices = Array.from({ length: P }, (_, i) => i).filter((i) => !capturedSet.has(i));

  const dayOfPayment = new Array<number>(P).fill(0);
  deal(capturedIndices, evenSplit(N, DAY_COUNT), captureP, dayOfPayment);
  deal(uncapturedIndices, evenSplit(A, DAY_COUNT), captureP, dayOfPayment);

  // Offsets are drawn in payment-index order so a stream position never depends
  // on the day assignment above.
  const offsets = Array.from({ length: P }, () => clockP.below(DAY_EVENT_WINDOW_SECONDS));

  // --- F06: equal amount, equal method, same day (§4.2, true state) ---------
  const f06Unsettled = new Set<number>();
  if (mechanics.f06_collisions) {
    const byDay = new Map<number, number[]>();
    for (const i of capturedIndices) {
      const day = requireIndex(dayOfPayment, i, "dayOfPayment");
      const bucket = byDay.get(day) ?? [];
      bucket.push(i);
      byDay.set(day, bucket);
    }
    const eligibleDays = [...byDay.entries()].filter(([, m]) => m.length >= 2).map(([d]) => d).sort((a, b) => a - b);
    if (eligibleDays.length < F06_PAIR_COUNT) {
      /* c8 ignore next 4 */
      throw new Error(
        `simulate: F06 needs ${String(F06_PAIR_COUNT)} days holding two captures; only ` +
          `${String(eligibleDays.length)} qualify. The balanced capture-day allocation should make this impossible.`,
      );
    }
    for (const dayIndex of f06P.sample(eligibleDays.length, F06_PAIR_COUNT)) {
      const day = requireIndex(eligibleDays, dayIndex, "eligibleDays");
      const members = byDay.get(day) ?? [];
      const chosen = f06P.sample(members.length, 2).map((k) => requireIndex(members, k, "members"));
      const sharedAmount = drawAmount(f06P);
      const sharedMethod = f06P.pick(METHOD_MIX);
      const sharedCard =
        sharedMethod === "card"
          ? { network: f06P.pick(CARD_NETWORK_MIX), type: f06P.pick(CARD_TYPE_MIX), issuer: f06P.pick(CARD_ISSUER_SET) }
          : null;
      for (const i of chosen) {
        amounts[i] = sharedAmount;
        methods[i] = sharedMethod;
        cards[i] = sharedCard;
      }
      // §4.1 F06: "only one settles". Which member is drawn from the sub-stream.
      f06Unsettled.add(requireIndex(chosen, f06P.below(chosen.length), "chosen"));
    }
  }

  // --- orders, then payments ------------------------------------------------
  const { year, month } = istYearMonth(dayInstant(1, 0));
  const orders: SimOrder[] = [];
  const payments: SimPayment[] = [];
  for (let i = 0; i < P; i += 1) {
    const captured = capturedSet.has(i);
    const day = requireIndex(dayOfPayment, i, "dayOfPayment");
    const createdAt = dayInstant(day, requireIndex(offsets, i, "offsets"));
    const amount = requireIndex(amounts, i, "amounts");
    const method = requireIndex(methods, i, "methods");
    const cardRate = mechanics.f03_repricing && createdAt >= F03_RATE_CHANGE_AT
      ? F03_CARD_RATE_BPS_AFTER
      : FEE_RATE_BPS.card;

    orders.push({
      index: i,
      id: minter.order(),
      amount,
      amount_paid: captured ? amount : paise(0),
      amount_due: captured ? paise(0) : amount,
      status: captured ? "paid" : "attempted",
      created_at: createdAt,
      receipt: buildReceipt(year, month, i + 1),
    });
    payments.push({
      index: i,
      id: minter.payment(),
      order_index: i,
      amount,
      method,
      captured,
      day,
      created_at: createdAt,
      card: cards[i] ?? null,
      rate_bps: rateBpsFor(method, cardRate),
      fee: captured ? feeBreakdown(amount, rateBpsFor(method, cardRate)) : null,
      refunded_paise: paise(0),
      dispute_index: null,
      settles: captured && !f06Unsettled.has(i),
    });
  }
  assertOrderRefsInjective(orders.map((o) => o.receipt));

  // --- refunds (exactly R, exactly PARTIAL_REFUND_COUNT partial) ------------
  const refundOf = refundP.sample(N, R).map((k) => requireIndex(capturedIndices, k, "capturedIndices"));
  const partialPositions = new Set(refundP.sample(R, PARTIAL_REFUND_COUNT));
  const refunds: SimRefund[] = [];
  for (let r = 0; r < refundOf.length; r += 1) {
    const paymentIndex = requireIndex(refundOf, r, "refundOf");
    const payment = requireIndex(payments, paymentIndex, "payments");
    const partial = partialPositions.has(r) && payment.amount > 1;
    const amount = partial ? paise(refundP.between(1, payment.amount - 1)) : payment.amount;
    const day = Math.min(payment.day + refundP.below(3), DAY_COUNT);
    const lowerBound = day === payment.day ? payment.created_at - dayInstant(day, 0) : 0;
    const createdAt = dayInstant(day, refundP.between(lowerBound, DAY_EVENT_WINDOW_SECONDS - 1));
    const shifted = mechanics.f02_refund_boundary ? day + 2 : day;
    refunds.push({
      index: r,
      id: minter.refund(),
      payment_index: paymentIndex,
      amount,
      partial,
      day,
      created_at: createdAt,
      settlement_day: shifted <= DAY_COUNT ? shifted : null,
    });
  }
  for (const refund of refunds) {
    const payment = requireIndex(payments, refund.payment_index, "payments");
    payments[refund.payment_index] = {
      ...payment,
      refunded_paise: add(payment.refunded_paise, refund.amount),
    };
  }

  // --- disputes (exactly D) -------------------------------------------------
  const disputes: SimDispute[] = [];
  for (const [d, position] of disputeP.sample(N, D).entries()) {
    const paymentIndex = requireIndex(capturedIndices, position, "capturedIndices");
    const payment = requireIndex(payments, paymentIndex, "payments");
    const day = Math.min(payment.day + disputeP.below(3), DAY_COUNT);
    const lowerBound = day === payment.day ? payment.created_at - dayInstant(day, 0) : 0;
    disputes.push({
      index: d,
      id: minter.dispute(),
      payment_index: paymentIndex,
      amount: payment.amount,
      status: disputeP.pick(DISPUTE_STATUS_MIX),
      created_at: dayInstant(day, disputeP.between(lowerBound, DAY_EVENT_WINDOW_SECONDS - 1)),
    });
    payments[paymentIndex] = { ...payment, dispute_index: d };
  }

  // --- settlement cycle per capture day (§4.2, exactly realized) ------------
  const cycleDays = assignCycles(cycleP, mechanics.f09_forced_late);

  // --- adjustments ----------------------------------------------------------
  const adjustments: SimAdjustment[] = [];
  const genericAdjustments = COMPOSITION.Adj;
  if (genericAdjustments !== 0) {
    /* c8 ignore next 5 */
    throw new Error(
      `simulate: PREREGISTRATION.md §10 V14 records that round_half_up(0.008 x 31) = 0, so no ` +
        `family instance generates a generic adjustment. The composition derived ` +
        `${String(genericAdjustments)}; the rate or the settlement count has moved.`,
    );
  }
  if (mechanics.f07_chargebacks) {
    for (const dispute of disputes) {
      // The deduction is raised on its own clock, on or after the dispute's day,
      // and lands in that day's batch — exactly as a capture does. It must NOT
      // be stamped at the settlement instant it lands in: `C4` bounds
      // `settled_at - created_at` at `T_min = 1` calendar day over EVERY member
      // of an allocation, and an adjustment created at its own batch's instant
      // has a gap of zero. That allocation is the TRUE one, so the completeness
      // gate would reject it and, per `§5.3`, "the benchmark is invalid and no
      // results may be reported from it".
      const disputeDay = dayOfInstantWithin(dispute.created_at);
      const deductionDay = Math.min(disputeDay, DAY_COUNT);
      const deductionFloor = dispute.created_at - dayInstant(deductionDay, 0);
      const deductionAt = dayInstant(
        deductionDay,
        f07P.between(Math.max(deductionFloor, 0), DAY_EVENT_WINDOW_SECONDS - 1),
      );
      // §4.1 F07: "a debit adjustment line in one settlement and a subsequent
      // win as a credit adjustment line in a later cycle". Both rows are emitted
      // unconditionally, "even where the reversal's created_at falls after
      // period.to" — which is what keeps the count seed-invariant.
      const deductionSettledAt = settlementInstant(
        deductionDay + requireIndex(cycleDays, deductionDay - 1, "cycleDays"),
      );
      // "a subsequent win ... in a later cycle": the first capture-day batch
      // after the deduction's whose settlement instant is STRICTLY later. Batch
      // d+1 is a later cycle but need not be a later instant — a T+2 batch on
      // day d and a T+1 batch on day d+1 settle at the same moment.
      let reversalDay = deductionDay + 1;
      while (
        reversalDay <= DAY_COUNT &&
        settlementInstant(reversalDay + requireIndex(cycleDays, reversalDay - 1, "cycleDays")) <= deductionSettledAt
      ) {
        reversalDay += 1;
      }
      const reversalOffset = f07P.below(DAY_EVENT_WINDOW_SECONDS);
      adjustments.push({
        index: adjustments.length,
        id: minter.adjustment(),
        amount: dispute.amount,
        direction: "debit",
        reason: ADJUSTMENT_REASON_MIX[0],
        created_at: deductionAt,
        related_entity_id: dispute.id,
        dispute_index: dispute.index,
        settlement_day: deductionDay,
      });
      adjustments.push({
        index: adjustments.length,
        id: minter.adjustment(),
        amount: dispute.amount,
        direction: "credit",
        reason: ADJUSTMENT_REASON_MIX[1],
        // Past day 31 the day grid is EXTENDED rather than clamped, so the row
        // carries an out-of-period clock of its own rather than a fabricated
        // in-period one. §4.2's membership rule then places it outside the
        // period on its own clock, which is what F09's late rows also do.
        created_at:
          reversalDay <= DAY_COUNT
            ? dayInstant(reversalDay, reversalOffset)
            : PERIOD_FROM + (reversalDay - 1) * SECONDS_PER_DAY + reversalOffset,
        related_entity_id: dispute.id,
        dispute_index: dispute.index,
        settlement_day: reversalDay <= DAY_COUNT ? reversalDay : null,
      });
    }
  }

  // --- settlements: one batch per capture day (§4.1, S = 31) ----------------
  const settlements: SimSettlement[] = [];
  for (let day = 1; day <= DAY_COUNT; day += 1) {
    const members: SimMember[] = [];
    for (const payment of payments) {
      if (payment.captured && payment.settles && payment.day === day) {
        members.push({ kind: "payment", index: payment.index });
      }
    }
    for (const refund of refunds) {
      if (refund.settlement_day === day) members.push({ kind: "refund", index: refund.index });
    }
    for (const adjustment of adjustments) {
      if (adjustment.settlement_day === day) members.push({ kind: "adjustment", index: adjustment.index });
    }

    const credits: Paise[] = [];
    const debitMembers: { member: SimMember; amount: Paise }[] = [];
    for (const member of members) {
      if (member.kind === "payment") {
        const fee = requireIndex(payments, member.index, "payments").fee;
        /* c8 ignore next */
        if (fee === null) throw new Error("simulate: a settled payment carries no fee breakdown");
        credits.push(fee.credit);
      } else if (member.kind === "refund") {
        debitMembers.push({ member, amount: requireIndex(refunds, member.index, "refunds").amount });
      } else {
        const adjustment = requireIndex(adjustments, member.index, "adjustments");
        if (adjustment.direction === "credit") credits.push(adjustment.amount);
        else debitMembers.push({ member, amount: adjustment.amount });
      }
    }

    // I4: settlement.amount = Sigma credit - Sigma debit over its ALLOCATED lines.
    const gross = sum(credits);
    const admitted: SimMember[] = members.filter((m) => m.kind === "payment");
    for (const adjustment of adjustments) {
      if (adjustment.settlement_day === day && adjustment.direction === "credit") {
        admitted.push({ kind: "adjustment", index: adjustment.index });
      }
    }
    // §4.2's selection rule. Ascending amount, admitting while the running net
    // stays non-negative; ties break on the member's own index so the order is
    // total, and `Array.prototype.sort` is stable, so a tie between two kinds
    // that share an index resolves on `members` order rather than on anything
    // the platform is free to change. Nothing here reads a metric or an outcome.
    let net = gross;
    const ordered = [...debitMembers].sort((a, b) => a.amount - b.amount || a.member.index - b.member.index);
    for (const { member, amount } of ordered) {
      // Ascending order makes this equivalent to stopping, and it is written as
      // a skip so the loop states the rule ("while the running net stays
      // non-negative") rather than an inference about the ordering.
      if (net - amount < 0) continue;
      net = sub(net, amount);
      admitted.push(member);
    }
    // `ARCHITECTURE.md §4` types `Settlement.amount` non-negative, and the
    // admission above cannot produce a negative net. Asserted rather than
    // assumed: this is the invariant the whole rule exists to protect, and a
    // future edit to the selection order would otherwise fail silently into a
    // schema the generator never validates the true state against.
    /* c8 ignore next */
    if (net < 0) throw new NegativeSettlementError(family, seed, day, net);

    const deferred = new Set(
      debitMembers.filter(({ member }) => !admitted.includes(member)).map(({ member }) => `${member.kind}:${String(member.index)}`),
    );
    for (const refund of refunds) {
      if (refund.settlement_day === day && deferred.has(`refund:${String(refund.index)}`)) {
        refunds[refund.index] = { ...refund, settlement_day: null };
      }
    }
    for (const adjustment of adjustments) {
      if (adjustment.settlement_day === day && deferred.has(`adjustment:${String(adjustment.index)}`)) {
        adjustments[adjustment.index] = { ...adjustment, settlement_day: null };
      }
    }

    const cycle = requireIndex(cycleDays, day - 1, "cycleDays");
    settlements.push({
      index: settlements.length,
      id: minter.settlement(),
      day,
      cycle_days: cycle,
      settled_at: settlementInstant(day + cycle),
      utr: mintUtr(bankP),
      amount: net,
      members: admitted.sort((a, b) => a.kind.localeCompare(b.kind) || a.index - b.index),
    });
  }

  // --- bank lines: 1:1 with settlements (I5) --------------------------------
  const cleanRefPositions = new Set(bankP.sample(settlements.length, realize(BANK_REF_CLEAN_RATE, settlements.length)));
  const bankLines: SimBankLine[] = settlements.map((settlement, i) => ({
    index: i,
    id: minter.bankLine(),
    settlement_index: settlement.index,
    value_date: settlement.settled_at + bankP.below(BANK_CLOCK_MAX_OFFSET_SECONDS),
    amount: settlement.amount,
    bank_ref: cleanRefPositions.has(i) ? settlement.utr : null,
    narration: narrationFor(settlement.utr, settlement.settled_at),
  }));

  // --- merchant ledger: one entry per capture (§4.2, ERP booking rate 100%) --
  const offsetPositions = new Set(merchantP.sample(N, realize(MERCHANT_CLOCK_OFFSET_RATE, N)));
  const ledgerEntries: SimLedgerEntry[] = capturedIndices.map((paymentIndex, position) => {
    const payment = requireIndex(payments, paymentIndex, "payments");
    const order = requireIndex(orders, payment.order_index, "orders");
    const drift = offsetPositions.has(position) ? (merchantP.chance(1, 2) ? 86_400 : -86_400) : 0;
    const guess = feeBreakdown(payment.amount, MERCHANT_EXPECTED_RATE_BPS);
    return {
      index: position,
      id: minter.ledgerEntry(),
      payment_index: paymentIndex,
      booked_at: payment.created_at + drift,
      order_ref: receiptToOrderRef(order.receipt),
      invoice_no: order.receipt,
      gross_paise: payment.amount,
      expected_net_paise: guess.credit,
      gl_account: "1100_GATEWAY_RECEIVABLE",
      memo: memoFor(payment),
    };
  });

  return Object.freeze({
    family_id: family,
    seed,
    orders,
    payments,
    refunds,
    disputes,
    adjustments,
    settlements,
    bank_lines: bankLines,
    ledger_entries: ledgerEntries,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A batch that closes at a negative net — a **generator defect**, not a state.
 *
 * `PREREGISTRATION.md §4.2`'s ratified admission rule makes this unreachable:
 * a debit is admitted only while the running net stays non-negative, so the net
 * is non-negative by construction. The guard exists because
 * `ARCHITECTURE.md §4` types `Settlement.amount` non-negative and this package
 * never parses its own true state against that schema, so an edit to the
 * selection order would otherwise produce an unrepresentable settlement that
 * nothing rejects until emission — or, on a field the schema does not cover, not
 * at all.
 *
 * **Superseded reading, recorded rather than deleted.** Through spec 1.4.1 this
 * error was the *default behaviour*: the specification stated no resolution, so
 * `simulate()` refused. Spec 1.4.2 supplied the rule, and refusing is no longer
 * a reading of the specification — it is now only a defect report.
 */
export class NegativeSettlementError extends Error {
  constructor(
    readonly family: FamilyId,
    readonly seed: number,
    readonly day: number,
    readonly net: number,
  ) {
    super(
      `simulate: ${family} seed ${String(seed)} day ${String(day)} nets ${String(net)} paise after ` +
        `PREREGISTRATION.md §4.2's admission rule, which admits a debit only while the running ` +
        `net stays non-negative and can therefore not produce one. Settlement.amount is ` +
        `non-negative in the frozen schema (ARCHITECTURE.md §4); this is a generator defect in ` +
        `the selection order, not a value to clamp.`,
    );
    this.name = "NegativeSettlementError";
  }
}

/** Deal `indices` into day buckets of the given sizes, in a shuffled order. */
function deal(indices: readonly number[], perDay: readonly number[], prng: Prng, out: number[]): void {
  const order = prng.permutation(indices.length);
  let cursor = 0;
  for (let day = 1; day <= perDay.length; day += 1) {
    const take = requireIndex(perDay, day - 1, "perDay");
    for (let k = 0; k < take; k += 1) {
      const position = requireIndex(order, cursor, "order");
      out[requireIndex(indices, position, "indices")] = day;
      cursor += 1;
    }
  }
}

/**
 * The `T+n` cycle for each capture day, realized exactly (`§4.2`).
 *
 * `forceLate` is `F09`'s mechanism: the settlements of the final three capture
 * days take `T+3`, so their rows carry clocks past `period.to`. The realized
 * mix is unchanged — those three come out of the same frozen `T+3` quota, and
 * the remainder is drawn as usual. Registered as `conventions.ts` `U-F09-FORCED`
 * because `§4.2` states both "whose settlement **draws** T+3" and "the smallest
 * window that **makes the family reachable**", which do not agree.
 */
function assignCycles(prng: Prng, forceLate: boolean): number[] {
  const cycles = new Array<number>(DAY_COUNT).fill(SETTLEMENT_CYCLE.default_days);
  const forced = forceLate
    ? Array.from({ length: F09_LATE_WINDOW_DAYS }, (_, k) => DAY_COUNT - F09_LATE_WINDOW_DAYS + k)
    : [];
  for (const day of forced) cycles[day] = SETTLEMENT_CYCLE.t_plus_3.days;

  const pool = Array.from({ length: DAY_COUNT }, (_, i) => i).filter((i) => !forced.includes(i));
  const shuffled = prng.permutation(pool.length).map((k) => requireIndex(pool, k, "pool"));
  const remainingT3 = T_PLUS_3_BATCHES - forced.length;
  if (remainingT3 < 0) {
    /* c8 ignore next 4 */
    throw new Error(
      `simulate: F09 forces ${String(forced.length)} T+3 batches but §4.2's 15% rate realizes to ` +
        `only ${String(T_PLUS_3_BATCHES)}. Forcing more would change a frozen rate.`,
    );
  }
  let cursor = 0;
  for (let k = 0; k < remainingT3; k += 1, cursor += 1) {
    cycles[requireIndex(shuffled, cursor, "shuffled")] = SETTLEMENT_CYCLE.t_plus_3.days;
  }
  for (let k = 0; k < T_PLUS_1_BATCHES; k += 1, cursor += 1) {
    cycles[requireIndex(shuffled, cursor, "shuffled")] = SETTLEMENT_CYCLE.t_plus_1.days;
  }
  return cycles;
}

/** `conventions.ts` `U-NARRATION`. Quarantined text; never a structural field. */
function narrationFor(utr: string, settledAt: number): string {
  const date = new Date((settledAt + 19_800) * 1000).toISOString().slice(0, 10);
  return `NEFT CR ${utr.toUpperCase()} RAZORPAY SOFTWARE PVT LTD SETTLEMENT ${date}`;
}

/** `conventions.ts` `U-MEMO`. Carries the `SE4` signal; quarantined text. */
function memoFor(payment: SimPayment): string {
  return `${payment.method.toUpperCase()} ${payment.card?.network ?? "-"} settlement expected`;
}

function dayOfInstantWithin(instant: number): number {
  const day = Math.floor((instant - dayInstant(1, 0)) / 86_400) + 1;
  return Math.min(Math.max(day, 1), DAY_COUNT);
}

/** Array access under `noUncheckedIndexedAccess`, with a message naming the array. */
function requireIndex<T>(values: readonly T[], index: number, what: string): T {
  const value = values[index];
  /* c8 ignore next */
  if (value === undefined) throw new RangeError(`simulate: ${what}[${String(index)}] is out of range`);
  return value;
}

/** Re-exported for `F05` selection, which reads settlements "in canonical (ascending seq) order". */
export const F05_SELECTED_SETTLEMENT_COUNT = F05_SELECTED_SETTLEMENTS;
