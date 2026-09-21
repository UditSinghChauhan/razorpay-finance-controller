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
  add, paise, roundHalfUp, sub, sum, type Paise,
} from "@assay/money";
import type {
  AdjustmentId, DisputeId, OrderId, PaymentId, RefundId, SettlementId,
  BankLineId, LedgerEntryId, AccountCode,
} from "@assay/domain";

import {
  amountForCredit, drawAmount, drawAmountWhere, feeBreakdown, rateBpsFor,
  type FeeBreakdown, type Method,
} from "./amount.js";
import {
  AMB1_PAIR_COUNT, AMB2_PAIR_COUNT, AMB3_PAIR_COUNT, AMB5_DAY_COUNT,
  BEN1_DAY_COUNT, BEN2_DAY_COUNT, BEN3_DAY_COUNT,
  COMPOSITION, F05_SELECTED_SETTLEMENTS, F06_PAIR_COUNT,
  PARTIAL_REFUND_COUNT, T_PLUS_1_BATCHES, T_PLUS_3_BATCHES, evenSplit, realize,
} from "./composition.js";
import { CARD_ISSUER_SET } from "./conventions.js";
import { FAMILY_MECHANICS } from "./families.js";
import {
  ADJUSTMENT_REASON_MIX, AMB1_BASE_METHODS, AMB1_MIN_CREDIT_PAISE, AMB1_TWIN_METHOD,
  AMB2_MIN_REFUND_PAISE, AMB2_REFUND_BPS, AMB3_DELTA_RANGE_PAISE, AMB5_DROP_COUNT,
  BEN1_DROP_COUNT, BEN2_DROP_COUNT, BEN3_MIN_CREDIT_GAP_PAISE,
  BANK_CLOCK_MAX_OFFSET_SECONDS, BANK_REF_CLEAN_RATE,
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

/**
 * bench-v2: one capture day settled in two batches at one instant, each
 * carrying one twin (`docs/BENCH_V2_DESIGN.md §B.2`, §C).
 *
 * True state, never persisted: `GroundTruth` gains no field from it (`§9.5`),
 * and `emit.ts` reads it only through {@link TrueState.identity_drops}. Which
 * twin sits in which batch is a coin from the family sub-stream, drawn
 * independently of every other field (`§8` R3). Four constructions host a
 * split: `A01` (material twins), `A02` (refund-netting twins, where the half
 * holding `P2` also carries `P2`'s refund), `A03` (sub-`tau` twins) and
 * `B01`'s `BEN-3` (two ordinary lines with differing credits — the control).
 */
export interface SimSplitBatch {
  readonly construction: "A01" | "A02" | "A03" | "BEN3";
  readonly day: number;
  /** The day's own batch, keeping its id, cycle and instant. */
  readonly settlement_a_index: number;
  /** The second batch at the same `settled_at`, with its own id and UTR. */
  readonly settlement_b_index: number;
  /** The twin carried by `settlement_a` (payment index). */
  readonly twin_a: number;
  /** The twin carried by `settlement_b` (payment index). */
  readonly twin_b: number;
  /**
   * `A02` only: the construction's refund (index into `refunds`), carried by
   * whichever half holds its parent capture — `twin_a`'s or `twin_b`'s, as the
   * stay coin fell. `null` for every other construction.
   */
  readonly refund: number | null;
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
  /** bench-v2's split days; empty for every `§4.1` family and for `A05`. */
  readonly split_batches: readonly SimSplitBatch[];
  /**
   * bench-v2: the members whose `recon_line` loses its batch identity under
   * `DROP_BATCH_IDENTITY` — selected here, BY CONSTRUCTION, never at a rate
   * (`docs/BENCH_V2_DESIGN.md §3.0`). `emit.ts` maps them to entity ids and
   * `degrade.ts` nulls exactly those lines. Empty for every `§4.1` family.
   */
  readonly identity_drops: readonly SimMember[];
}

/** `SimSettlement.members`, inverted: which settlement carried each member. */
export interface SettlementIndex {
  readonly payment: ReadonlyMap<number, SimSettlement>;
  readonly refund: ReadonlyMap<number, SimSettlement>;
  readonly adjustment: ReadonlyMap<number, SimSettlement>;
}

/**
 * Invert `SimSettlement.members` once, for every consumer that needs it.
 *
 * This is a **projection of the true state and not a new fact**: `members`
 * already names every allocated constituent, and the inversion only reads it.
 * It is extracted here — beside the type it inverts — because two modules need
 * the same relation and `emit.ts`'s `settled_at` / `settlement_id` must agree
 * line-for-line with `recon-report.ts`'s (`RECONCILIATION_SPEC.md §6.2`). Two
 * constructions of one relation are two things that can disagree.
 *
 * **A member absent from every map is `PREREGISTRATION.md §4.2`'s UNSETTLED
 * member** — the one "a member the batch cannot carry ... is NOT moved to
 * another batch" rule leaves with `settlement_id: null`, `settled: false` and
 * `settled_at: null`. Absence is the representation; no sentinel is invented.
 */
export function settlementsByMember(state: TrueState): SettlementIndex {
  const payment = new Map<number, SimSettlement>();
  const refund = new Map<number, SimSettlement>();
  const adjustment = new Map<number, SimSettlement>();
  for (const settlement of state.settlements) {
    for (const member of settlement.members) {
      const table =
        member.kind === "payment" ? payment
        : member.kind === "refund" ? refund
        : adjustment;
      table.set(member.index, settlement);
    }
  }
  return Object.freeze({ payment, refund, adjustment });
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
  const amb1P = s(STREAMS.AMB1);
  const amb2P = s(STREAMS.AMB2);
  const amb3P = s(STREAMS.AMB3);
  const amb5P = s(STREAMS.AMB5);
  const benignP = s(STREAMS.BENIGN);

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

  // --- bench-v2, part 1: the twins (docs/BENCH_V2_DESIGN.md §B.2, §C) --------
  // Two captures of one day, neither refunded nor disputed, are rewritten so
  // that they net to ONE credit: `A01` and `A03` on two fee rates (twin A on a
  // 200-bps non-card method, twin B on EMI), `A02` on one rate with twin B
  // carrying a partial refund of its own. The credit is drawn once (the F06
  // discipline) via A's gross; B's gross is solved from it. `created_at` is
  // shared too, so the twins tie on `SE3` exactly. `BEN-3` selects two captures
  // of one day the same way and rewrites NOTHING: it is the split alone. This
  // runs BEFORE the batches are built so every batch closes on the final
  // amounts, and AFTER refunds and disputes so neither can name a twin — a
  // refund on one twin would be a field that distinguishes them (`A02`'s refund
  // is the deliberate difference and is constructed here, not drawn there).
  const twinPairs: SplitPlan[] = [];
  const eligibleByDay = twinEligibleByDay(payments, refunds, disputes);
  if (mechanics.amb1_material_twins) {
    for (const day of drawTwinDays(amb1P, eligibleByDay, AMB1_PAIR_COUNT, "AMB-1")) {
      const [first, second] = drawTwinPair(amb1P, eligibleByDay.get(day) ?? [], "AMB-1");
      // Which of the two becomes A (200 bps) is itself a coin, so that neither
      // payment index nor id order correlates with rate or batch (§8 R3).
      const [a, b] = amb1P.chance(1, 2) ? [first, second] : [second, first];
      const methodA: Method = amb1P.pick(AMB1_BASE_METHODS);
      const rateA = FEE_RATE_BPS[methodA];
      const amountA = drawAmountWhere(amb1P, (gross) => feeBreakdown(gross, rateA).credit >= AMB1_MIN_CREDIT_PAISE);
      rewriteRateTwins(payments, orders, a, b, methodA, amountA);
      twinPairs.push({ construction: "A01", day, a, b, forced: [] });
    }
  }
  if (mechanics.amb3_subtau_twins) {
    for (const day of drawTwinDays(amb3P, eligibleByDay, AMB3_PAIR_COUNT, "AMB-3")) {
      const [first, second] = drawTwinPair(amb3P, eligibleByDay.get(day) ?? [], "AMB-3");
      const [a, b] = amb3P.chance(1, 2) ? [first, second] : [second, first];
      const methodA: Method = amb3P.pick(AMB1_BASE_METHODS);
      const rateA = FEE_RATE_BPS[methodA];
      // The window is on the DELTA between the two grosses (§3.3): the atoms of
      // the committed table whose EMI twin sits Rs 51 to Rs 80 away, uniformly.
      const amountA = drawAmountWhere(amb3P, (gross) => {
        const delta = Math.abs(amountForCredit(feeBreakdown(gross, rateA).credit, FEE_RATE_BPS[AMB1_TWIN_METHOD]) - gross);
        return delta >= AMB3_DELTA_RANGE_PAISE.min && delta <= AMB3_DELTA_RANGE_PAISE.max;
      });
      rewriteRateTwins(payments, orders, a, b, methodA, amountA);
      twinPairs.push({ construction: "A03", day, a, b, forced: [] });
    }
  }
  if (mechanics.amb2_refund_netting) {
    // The refund is an EXISTING refund rewritten onto P2 — the composition's
    // refund count is frozen (`R = round_half_up(4.5 % x N)`) and adding one
    // would move `target_record_count`. Distinct refunds, one per pair, drawn
    // once; their original payments cannot be twins, because a twin is
    // unrefunded by eligibility.
    const days = drawTwinDays(amb2P, eligibleByDay, AMB2_PAIR_COUNT, "AMB-2");
    const rewrittenRefunds = amb2P.sample(refunds.length, AMB2_PAIR_COUNT);
    for (const [k, day] of days.entries()) {
      const [first, second] = drawTwinPair(amb2P, eligibleByDay.get(day) ?? [], "AMB-2");
      const [p, p2] = amb2P.chance(1, 2) ? [first, second] : [second, first];
      const method: Method = amb2P.pick(AMB1_BASE_METHODS);
      const rate = FEE_RATE_BPS[method];
      const amountP = drawAmount(amb2P);
      const feeP = feeBreakdown(amountP, rate);
      const refundAmount = paise(Math.max(AMB2_MIN_REFUND_PAISE, roundHalfUp(feeP.credit * AMB2_REFUND_BPS, 10_000)));
      const amountP2 = amountForCredit(add(feeP.credit, refundAmount), rate);
      const feeP2 = feeBreakdown(amountP2, rate);
      /* c8 ignore next */
      if (sub(feeP2.credit, refundAmount) !== feeP.credit) throw new Error("simulate: AMB-2 twins do not net to one credit");
      const sharedCreatedAt = requireIndex(payments, p, "payments").created_at;
      for (const [index, amount, fee] of [[p, amountP, feeP], [p2, amountP2, feeP2]] as const) {
        const payment = requireIndex(payments, index, "payments");
        const order = requireIndex(orders, index, "orders");
        payments[index] = { ...payment, amount, method, card: null, rate_bps: rate, fee, created_at: sharedCreatedAt };
        orders[index] = { ...order, amount, amount_paid: amount, created_at: sharedCreatedAt };
      }
      // The rewrite: the refund now belongs to P2, is partial, is raised on the
      // capture day after the capture, and settles in the day's batch — the
      // same clocks §4.2 gives a same-day refund. Its former payment loses it.
      const refundIndex = requireIndex(rewrittenRefunds, k, "rewrittenRefunds");
      const old = requireIndex(refunds, refundIndex, "refunds");
      const former = requireIndex(payments, old.payment_index, "payments");
      payments[old.payment_index] = { ...former, refunded_paise: sub(former.refunded_paise, old.amount) };
      const lowerBound = sharedCreatedAt - dayInstant(day, 0);
      refunds[refundIndex] = {
        ...old,
        payment_index: p2,
        amount: refundAmount,
        partial: true,
        day,
        created_at: dayInstant(day, amb2P.between(lowerBound, DAY_EVENT_WINDOW_SECONDS - 1)),
        settlement_day: day,
      };
      const twinB = requireIndex(payments, p2, "payments");
      payments[p2] = { ...twinB, refunded_paise: add(twinB.refunded_paise, refundAmount) };
      twinPairs.push({ construction: "A02", day, a: p, b: p2, forced: [{ kind: "refund", index: refundIndex }] });
    }
  }
  const benignSplitDays = new Set<number>();
  if (mechanics.benign_controls) {
    // BEN-3: AMB-1's host with nothing rewritten. Among the day's eligible
    // captures, a pair whose credits differ by at least the declared gap,
    // uniformly over such pairs; if none exists the day is not eligible.
    const ben3Eligible = new Map<number, number[]>();
    for (const [day, members] of eligibleByDay) {
      if (creditGapPairs(payments, members).length > 0) ben3Eligible.set(day, members);
    }
    for (const day of drawTwinDays(benignP, ben3Eligible, BEN3_DAY_COUNT, "BEN-3")) {
      const pairs = creditGapPairs(payments, ben3Eligible.get(day) ?? []);
      const [first, second] = requireIndex(pairs, benignP.below(pairs.length), "pairs");
      const [a, b] = benignP.chance(1, 2) ? [first, second] : [second, first];
      twinPairs.push({ construction: "BEN3", day, a, b, forced: [] });
      benignSplitDays.add(day);
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

  // --- bench-v2, part 2: the split (docs/BENCH_V2_DESIGN.md §B.2, §C) --------
  // The day's batch is dealt into S1 (keeps the day's id, cycle and instant)
  // and S2 (new id, new UTR, the SAME settled_at). Which twin stays is a coin;
  // every other member is dealt by its own coin, independently of created_at
  // (§8 R3). Debits are admitted per half by §4.2's ascending-amount rule; one
  // its half cannot carry goes to the other half, and one neither can carry is
  // emitted UNSETTLED, exactly as a day batch already does. A02's refund is
  // FORCED into twin B's half, before any other debit, because it is the
  // construction and not a dealt member.
  const splitBatches: SimSplitBatch[] = [];
  const identityDrops: SimMember[] = [];
  const streamOf = { A01: amb1P, A02: amb2P, A03: amb3P, BEN3: benignP } as const;
  for (const pair of twinPairs) {
    const prng = streamOf[pair.construction];
    const split = splitBatch(settlements, payments, refunds, adjustments, minter, prng, pair);
    splitBatches.push(split);
    identityDrops.push({ kind: "payment", index: split.twin_a }, { kind: "payment", index: split.twin_b });
    if (split.refund !== null) identityDrops.push({ kind: "refund", index: split.refund });
  }

  // --- bench-v2 AMB-5: the search bound (§3.5) ---------------------------------
  // `AMB5_DROP_COUNT` payment lines of one batch lose their identity, on days
  // whose settlement instants are pairwise distinct so that two classes never
  // pool. No split: the batch is the day's own.
  if (mechanics.amb5_search_bound) {
    const candidates = settlements
      .filter((st) => st.members.filter((m) => m.kind === "payment").length >= AMB5_DROP_COUNT)
      .map((st) => st.index);
    const taken: SimSettlement[] = [];
    for (const k of amb5P.permutation(candidates.length)) {
      if (taken.length === AMB5_DAY_COUNT) break;
      const st = requireIndex(settlements, requireIndex(candidates, k, "candidates"), "settlements");
      if (taken.some((t) => t.settled_at === st.settled_at)) continue;
      taken.push(st);
    }
    if (taken.length < AMB5_DAY_COUNT) {
      /* c8 ignore next 4 */
      throw new Error(
        `simulate: AMB-5 needs ${String(AMB5_DAY_COUNT)} batches of ${String(AMB5_DROP_COUNT)}+ payment lines at ` +
          `distinct instants; only ${String(taken.length)} qualify.`,
      );
    }
    for (const st of taken.sort((x, y) => x.index - y.index)) {
      const lines = st.members.filter((m) => m.kind === "payment");
      for (const k of amb5P.sample(lines.length, AMB5_DROP_COUNT)) identityDrops.push(requireIndex(lines, k, "lines"));
    }
  }

  // --- bench-v2 BENIGN, BEN-1 and BEN-2 (§3.6) ---------------------------------
  // One (BEN-1) or two (BEN-2) payment lines of an ordinary batch, on days
  // disjoint from BEN-3's and at instants disjoint from BEN-3's, so the control
  // classes never pool with the split classes (§8 R5).
  if (mechanics.benign_controls) {
    const splitInstants = new Set(splitBatches.map((sb) => requireIndex(settlements, sb.settlement_a_index, "settlements").settled_at));
    const ordinary = settlements
      .filter((st) => st.members.filter((m) => m.kind === "payment").length >= BEN2_DROP_COUNT)
      .filter((st) => !benignSplitDays.has(st.day) && !splitInstants.has(st.settled_at))
      .map((st) => st.index);
    const need = BEN1_DAY_COUNT + BEN2_DAY_COUNT;
    if (ordinary.length < need) {
      /* c8 ignore next 4 */
      throw new Error(
        `simulate: BENIGN needs ${String(need)} ordinary batches away from BEN-3's instants; only ` +
          `${String(ordinary.length)} qualify.`,
      );
    }
    const order = benignP.permutation(ordinary.length).map((k) => requireIndex(ordinary, k, "ordinary"));
    const ben1 = order.slice(0, BEN1_DAY_COUNT).sort((x, y) => x - y);
    const ben2 = order.slice(BEN1_DAY_COUNT, need).sort((x, y) => x - y);
    for (const [block, count] of [[ben1, BEN1_DROP_COUNT], [ben2, BEN2_DROP_COUNT]] as const) {
      for (const index of block) {
        const lines = requireIndex(settlements, index, "settlements").members.filter((m) => m.kind === "payment");
        for (const k of benignP.sample(lines.length, count)) identityDrops.push(requireIndex(lines, k, "lines"));
      }
    }
  }

  // --- bank lines: 1:1 with settlements (I5) --------------------------------
  const cleanRefPositions = new Set(bankP.sample(settlements.length, realize(BANK_REF_CLEAN_RATE, settlements.length)));
  // bench-v2 (§B.2, T5): both halves of every split day carry a clean
  // `bank_ref` by declaration, in addition to the frozen 30 % draw, so that
  // `AN2` links them and §17.1.1's P2 projection exists on both candidates —
  // for A03 that is what makes its verdict rest on MATERIALITY rather than on
  // an absent comparand. A05's and BEN-1/2's settlements take the frozen draw.
  for (const split of splitBatches) {
    cleanRefPositions.add(split.settlement_a_index);
    cleanRefPositions.add(split.settlement_b_index);
  }
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
    split_batches: splitBatches,
    identity_drops: identityDrops,
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


// ---------------------------------------------------------------------------
// bench-v2 helpers (docs/BENCH_V2_DESIGN.md §B.2, §C)
// ---------------------------------------------------------------------------

/** A split day before it is split: the two lines, and any debit forced into B's half. */
interface SplitPlan {
  readonly construction: SimSplitBatch["construction"];
  readonly day: number;
  /** The line that becomes twin A or twin B is decided by the split's coin. */
  readonly a: number;
  readonly b: number;
  /** Debit members that MUST land in `b`'s half, admitted before any dealt debit. */
  readonly forced: readonly SimMember[];
}

/** Captures that settle, carry no refund and no dispute, by capture day. */
function twinEligibleByDay(
  payments: readonly SimPayment[],
  refunds: readonly SimRefund[],
  disputes: readonly SimDispute[],
): Map<number, number[]> {
  const refunded = new Set(refunds.map((r) => r.payment_index));
  const disputed = new Set(disputes.map((d) => d.payment_index));
  const out = new Map<number, number[]>();
  for (const payment of payments) {
    if (!payment.captured || !payment.settles) continue;
    if (refunded.has(payment.index) || disputed.has(payment.index)) continue;
    out.set(payment.day, [...(out.get(payment.day) ?? []), payment.index]);
  }
  return out;
}

/**
 * Draw `count` distinct days holding two eligible captures — one `sample`.
 *
 * The PAIR on each day is drawn by the caller, per day, so that a
 * construction's own draws (coin, method, amount) interleave with the pair
 * draw exactly as `A01`'s did before this helper existed: a stream's position
 * is part of the frozen output and is not re-ordered by a refactor.
 */
function drawTwinDays(
  prng: Prng,
  eligibleByDay: ReadonlyMap<number, readonly number[]>,
  count: number,
  label: string,
): number[] {
  const eligibleDays = [...eligibleByDay.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([day]) => day)
    .sort((x, y) => x - y);
  if (eligibleDays.length < count) {
    /* c8 ignore next 4 */
    throw new Error(
      `simulate: ${label} needs ${String(count)} days holding two unrefunded, undisputed ` +
        `captures; only ${String(eligibleDays.length)} qualify.`,
    );
  }
  return prng.sample(eligibleDays.length, count).map((k) => requireIndex(eligibleDays, k, "eligibleDays"));
}

/** Two distinct eligible captures of one day — one `sample` of two. */
function drawTwinPair(prng: Prng, members: readonly number[], label: string): [number, number] {
  const [first, second] = prng.sample(members.length, 2).map((k) => requireIndex(members, k, "members"));
  /* c8 ignore next */
  if (first === undefined || second === undefined) throw new Error(`simulate: ${label} pair draw failed`);
  return [first, second];
}

/**
 * `A01` / `A03`: twin A takes `methodA` and `amountA`; twin B takes EMI and the
 * gross that nets to A's credit exactly; both take A's clock. Cards are nulled
 * on both (`AMB1_BASE_METHODS` excludes card).
 */
function rewriteRateTwins(
  payments: SimPayment[],
  orders: SimOrder[],
  a: number,
  b: number,
  methodA: Method,
  amountA: Paise,
): void {
  const rateA = FEE_RATE_BPS[methodA];
  const rateB = FEE_RATE_BPS[AMB1_TWIN_METHOD];
  const feeA = feeBreakdown(amountA, rateA);
  const amountB = amountForCredit(feeA.credit, rateB);
  const feeB = feeBreakdown(amountB, rateB);
  /* c8 ignore next */
  if (feeB.credit !== feeA.credit) throw new Error("simulate: rate twins do not net to one credit");
  const sharedCreatedAt = requireIndex(payments, a, "payments").created_at;
  for (const [index, amount, method, fee, rate] of [
    [a, amountA, methodA, feeA, rateA],
    [b, amountB, AMB1_TWIN_METHOD, feeB, rateB],
  ] as const) {
    const payment = requireIndex(payments, index, "payments");
    const order = requireIndex(orders, index, "orders");
    payments[index] = {
      ...payment, amount, method, card: null, rate_bps: rate, fee, created_at: sharedCreatedAt,
    };
    orders[index] = { ...order, amount, amount_paid: amount, created_at: sharedCreatedAt };
  }
}

/** `BEN-3`: the pairs of a day's eligible captures whose credits differ by the declared gap, in index order. */
function creditGapPairs(payments: readonly SimPayment[], members: readonly number[]): [number, number][] {
  const credit = (i: number): number => requireIndex(payments, i, "payments").fee?.credit ?? 0;
  const out: [number, number][] = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const x = requireIndex(members, i, "members");
      const y = requireIndex(members, j, "members");
      if (Math.abs(credit(x) - credit(y)) >= BEN3_MIN_CREDIT_GAP_PAISE) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Deal one day's batch into two at one instant (part 2 above). Mutates
 * `settlements` in place — the day's entry becomes S1 and S2 is appended — and
 * marks a debit neither half can carry UNSETTLED on `refunds` / `adjustments`.
 * Draw order on `prng`: the stay coin, one coin per dealt member in batch order,
 * one coin per dealt debit, then the new UTR — `A01`'s order, unchanged.
 */
function splitBatch(
  settlements: SimSettlement[],
  payments: readonly SimPayment[],
  refunds: SimRefund[],
  adjustments: SimAdjustment[],
  minter: Minter,
  prng: Prng,
  pair: SplitPlan,
): SimSplitBatch {
  const original = requireIndex(settlements, pair.day - 1, "settlements");
  const aStays = prng.chance(1, 2);
  const [stay, move] = aStays ? [pair.a, pair.b] : [pair.b, pair.a];
  const forcedKeys = new Set(pair.forced.map((m) => `${m.kind}:${String(m.index)}`));
  const halves: [SimMember[], SimMember[]] = [[], []];
  const nets: [number, number] = [0, 0];
  const debits: { member: SimMember; amount: Paise; preferred: 0 | 1 }[] = [];
  for (const member of original.members) {
    if (member.kind === "payment") {
      const fee = requireIndex(payments, member.index, "payments").fee;
      /* c8 ignore next */
      if (fee === null) throw new Error("simulate: a settled payment carries no fee breakdown");
      const half: 0 | 1 = member.index === stay ? 0 : member.index === move ? 1 : prng.chance(1, 2) ? 0 : 1;
      halves[half].push(member);
      nets[half] = add(paise(nets[half]), fee.credit);
      continue;
    }
    const amount =
      member.kind === "refund"
        ? requireIndex(refunds, member.index, "refunds").amount
        : requireIndex(adjustments, member.index, "adjustments").amount;
    if (member.kind === "adjustment" && requireIndex(adjustments, member.index, "adjustments").direction === "credit") {
      const half: 0 | 1 = prng.chance(1, 2) ? 0 : 1;
      halves[half].push(member);
      nets[half] = add(paise(nets[half]), amount);
      continue;
    }
    if (forcedKeys.has(`${member.kind}:${String(member.index)}`)) {
      // The construction's own debit: it rides with `b`, whichever half `b`
      // was dealt to, and is admitted first. `b`'s credit exceeds it by
      // construction, so the half can always carry it.
      const half: 0 | 1 = move === pair.b ? 1 : 0;
      /* c8 ignore next */
      if (nets[half] - amount < 0) throw new Error("simulate: a forced debit exceeds its half's credit");
      halves[half].push(member);
      nets[half] = sub(paise(nets[half]), amount);
      continue;
    }
    debits.push({ member, amount, preferred: prng.chance(1, 2) ? 0 : 1 });
  }
  const ordered = [...debits].sort((x, y) => x.amount - y.amount || x.member.index - y.member.index);
  for (const { member, amount, preferred } of ordered) {
    const other: 0 | 1 = preferred === 0 ? 1 : 0;
    const half: 0 | 1 | null =
      nets[preferred] - amount >= 0 ? preferred : nets[other] - amount >= 0 ? other : null;
    if (half === null) {
      if (member.kind === "refund") {
        refunds[member.index] = { ...requireIndex(refunds, member.index, "refunds"), settlement_day: null };
      } else {
        adjustments[member.index] = {
          ...requireIndex(adjustments, member.index, "adjustments"), settlement_day: null,
        };
      }
      continue;
    }
    halves[half].push(member);
    nets[half] = sub(paise(nets[half]), amount);
  }
  const byKind = (x: SimMember, y: SimMember): number => x.kind.localeCompare(y.kind) || x.index - y.index;
  settlements[pair.day - 1] = { ...original, amount: paise(nets[0]), members: halves[0].sort(byKind) };
  const second: SimSettlement = {
    index: settlements.length,
    id: minter.settlement(),
    day: pair.day,
    cycle_days: original.cycle_days,
    settled_at: original.settled_at,
    utr: mintUtr(prng),
    amount: paise(nets[1]),
    members: halves[1].sort(byKind),
  };
  settlements.push(second);
  const forcedRefund = pair.forced.find((m) => m.kind === "refund");
  return {
    construction: pair.construction,
    day: pair.day,
    settlement_a_index: original.index,
    settlement_b_index: second.index,
    twin_a: stay,
    twin_b: move,
    refund: forcedRefund === undefined ? null : forcedRefund.index,
  };
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
