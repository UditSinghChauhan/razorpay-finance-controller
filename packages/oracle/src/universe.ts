/**
 * The candidate universe — `DATA_MODEL.md §11.1`, implemented.
 *
 * `§11.1` supplies the mapping from an `Observation` to the quantities
 * `C1`–`C8` read off "members" and "the target", and derives member eligibility
 * from `RECONCILIATION_SPEC.md §4.1`'s spec-1.4.2 ratification rather than
 * declaring it. This module is that mapping and nothing else: it decides what a
 * candidate may be built from, and `predicates.ts` decides whether a built
 * candidate is admissible.
 *
 * **Eligibility is read, not re-decided.** `§11.1`: "Of the nine kinds in §10,
 * only `recon_line` and `adjustment` carry `settled_at` — both as a `ReconLine`
 * payload (§10's table). The member-eligible kinds are therefore `recon_line`
 * and `adjustment`, and every other kind is excluded by frozen text." The
 * predicate below is a kind test for exactly that reason; it is not an
 * independent judgement about which kinds *ought* to be members.
 */

import type { Observation, ObservationId } from "@assay/domain";
import type { Paise } from "@assay/money";

/** The two member-eligible kinds (`DATA_MODEL.md §11.1`). */
export const MEMBER_ELIGIBLE_KINDS = Object.freeze(["recon_line", "adjustment"] as const);

/** The two target kinds (`DATA_MODEL.md §17.1.1`: "this table does not widen it"). */
export const TARGET_KINDS = Object.freeze(["settlement", "bank_line"] as const);

export type MemberEligibleKind = (typeof MEMBER_ELIGIBLE_KINDS)[number];
export type TargetKind = (typeof TARGET_KINDS)[number];

/**
 * The row type a member carries, from `DATA_MODEL.md §6`'s narrowed union.
 *
 * `§10`'s table splits the recon report by row type: `payment` and `refund`
 * arrive as kind `recon_line`, `adjustment` as kind `adjustment`.
 */
export type MemberRowType = "payment" | "refund" | "adjustment";

/**
 * A member's contribution to `C1`–`C8`, as `§11.1` enumerates it.
 *
 * Every field is read from the observation's own payload and from no other
 * source. `entity_id` and `obs_id` are carried for identity and reporting, not
 * because a constraint reads them.
 */
export interface MemberContribution {
  readonly obs_id: ObservationId;
  readonly entity_id: string;
  readonly kind: MemberEligibleKind;
  readonly row_type: MemberRowType;
  // --- the six quantities §11.1 names ---
  readonly currency: string;
  readonly created_at: number;
  readonly settled_at: number | null;
  readonly credit: Paise;
  readonly debit: Paise;
  readonly on_hold: boolean;
  // --- terms C2 and C5 read, already kind-typed in their own text ---
  readonly amount: Paise;
  readonly fee: Paise;
  readonly tax: Paise;
  readonly order_id: string | null;
  readonly payment_id: string | null;
  readonly settlement_id: string | null;
  readonly settlement_utr: string | null;
}

/**
 * A target's contribution, as `§11.1` enumerates it.
 *
 * `currency` is `§11.1`'s declaration, registered at `§22.2` M19 — neither
 * target entity carries the field, and `C1` names the target explicitly rather
 * than being silent about it, so without a declared value `C1` would admit
 * nothing at all.
 *
 * `value_date` is `null` when no bank line is in scope for the target. That is
 * the case `C3`'s bank-arrival half is declared `binding-when-in-scope` for.
 */
export interface TargetContribution {
  readonly obs_id: ObservationId;
  readonly id: string;
  readonly kind: TargetKind;
  readonly amount: Paise;
  readonly currency: string;
  readonly value_date: number | null;
  /** The bank line supplying `value_date`, for reporting. `null` when none. */
  readonly bank_line_id: string | null;
}

/** `§11.1`'s declared target currency. `[ASSAY-MODEL]`, register row M19. */
export const DECLARED_TARGET_CURRENCY = "INR";

/** Whether a kind may supply a member contribution (`§11.1`). */
export function isMemberEligibleKind(kind: string): kind is MemberEligibleKind {
  return (MEMBER_ELIGIBLE_KINDS as readonly string[]).includes(kind);
}

/** Whether a kind is a target kind (`DATA_MODEL.md §17.1.1`). */
export function isTargetKind(kind: string): kind is TargetKind {
  return (TARGET_KINDS as readonly string[]).includes(kind);
}

/**
 * Project an observation into a member contribution, or `null` if its kind is
 * not member-eligible.
 *
 * Returning `null` rather than throwing is deliberate: an ineligible kind is not
 * an error in the dataset, it is simply not a member. The observation set
 * legitimately contains eight other kinds, and `DATA_MODEL.md §10.1` keeps every
 * one of them "available to stages S1–S4 as evidence".
 */
export function memberContribution(observation: Observation): MemberContribution | null {
  // Narrowed on the discriminant directly rather than through
  // `isMemberEligibleKind`: a type guard over a property cannot narrow the
  // discriminated union, and the two kinds here are exactly the ones that
  // predicate names. A test asserts the two stay in step.
  if (observation.kind !== "recon_line" && observation.kind !== "adjustment") return null;
  const p = observation.payload;
  return Object.freeze({
    obs_id: observation.obs_id,
    entity_id: p.entity_id,
    kind: observation.kind,
    row_type: p.type,
    currency: p.currency,
    created_at: p.created_at,
    settled_at: p.settled_at,
    credit: p.credit,
    debit: p.debit,
    on_hold: p.on_hold,
    amount: p.amount,
    fee: p.fee,
    tax: p.tax,
    order_id: p.order_id,
    payment_id: p.payment_id,
    settlement_id: p.settlement_id,
    settlement_utr: p.settlement_utr,
  });
}

/**
 * Project an observation into a target contribution, or `null` if its kind is
 * not a target kind.
 *
 * `value_date` is supplied by the caller because it depends on the bank line the
 * target is matched to, which is `anchors.ts`'s determination and not a property
 * of the observation alone. For a `bank_line` target it is the target's own
 * field — `§4.1`'s bank-arrival half names "the bank line that receives the
 * target's money", which for a bank-line target is the target.
 */
export function targetContribution(
  observation: Observation,
  bank: { readonly value_date: number; readonly bank_line_id: string } | null,
): TargetContribution | null {
  if (observation.kind === "settlement") {
    return Object.freeze({
      obs_id: observation.obs_id,
      id: observation.payload.id,
      kind: "settlement" as const,
      amount: observation.payload.amount,
      currency: DECLARED_TARGET_CURRENCY,
      value_date: bank === null ? null : bank.value_date,
      bank_line_id: bank === null ? null : bank.bank_line_id,
    });
  }
  if (observation.kind === "bank_line") {
    return Object.freeze({
      obs_id: observation.obs_id,
      id: observation.payload.bank_line_id,
      kind: "bank_line" as const,
      amount: observation.payload.amount,
      currency: DECLARED_TARGET_CURRENCY,
      value_date: observation.payload.value_date,
      bank_line_id: observation.payload.bank_line_id,
    });
  }
  return null;
}
