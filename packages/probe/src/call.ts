import { PROBE_KINDS, type ProbeKind } from "@assay/domain";

/**
 * The closed five-probe call, and the only way to build one.
 *
 * `RECONCILIATION_SPEC.md §6.2` declares five probes and `THREAT_MODEL.md §T7`
 * calls them *"a **closed enum** of five read-only operations"* whose *"arguments
 * must come from the call's allowlist"*. Spec 1.4.23 makes this module the sole
 * constructor, so those two controls cannot be satisfied by one caller and
 * skipped by another.
 *
 * **There is no URL, host, path or endpoint type anywhere in this file.** That is
 * the whole of `§T7`'s SSRF control on spec 1.4.22's filesystem-backed surface:
 * there is no request to redirect, so the attack has no reachable target rather
 * than a check that could be bypassed.
 */

/** `ARCHITECTURE.md §6`: `R3` returns a call *"or `NO_USEFUL_PROBE`"*. */
export const NO_USEFUL_PROBE = "NO_USEFUL_PROBE" as const;

/**
 * What `R3` proposes, before any check.
 *
 * Untrusted by construction: `ARCHITECTURE.md §4` boundary 2 treats a model
 * response as adversarial, and `packages/llm`'s schema, allowlist and grounding
 * checks run **before** this type is populated. This module then applies the two
 * checks that are **not** `packages/llm`'s — `P_max` and the pre-call `I6` of
 * `DECISION_BRIEF.md §L.1` rule 8, which is required *"independently of any
 * allowlist check"*.
 *
 * `date` is carried as an **opaque string** and is never parsed here.
 * `DATA_MODEL.md §22.2` M31 records that the field the recon endpoint is
 * date-scoped on is *"not decided"*, and `§12` declines to invent a date type;
 * spec 1.4.23 settles neither. The loop passes it through untouched.
 */
export type ProbeProposal =
  | { readonly probe: "fetch_order"; readonly order_id: string }
  | { readonly probe: "fetch_payment"; readonly payment_id: string }
  | { readonly probe: "fetch_refund"; readonly refund_id: string }
  | {
      readonly probe: "fetch_settlement_recon";
      readonly settlement_id: string;
      readonly date: string;
    }
  | { readonly probe: "widen_temporal_window"; readonly days: number }
  | { readonly probe: typeof NO_USEFUL_PROBE };

/** A proposal that names one of the five probes, rather than declining. */
export type ProbeCallProposal = Exclude<ProbeProposal, { probe: typeof NO_USEFUL_PROBE }>;

declare const validatedProbeCall: unique symbol;

/**
 * A probe call that has passed `P_max`, the closed enum and pre-call `I6`.
 *
 * Enforced the way `ARCHITECTURE.md §4` boundary 3 enforces `ValidatedDecision`,
 * and for the same reason: TypeScript is structurally typed, so *"only the loop
 * may construct"* would be a convention rather than a property without a
 * **non-exported** unique-symbol brand and no exported constructor. `validate`
 * below is the only function that produces one.
 */
export type ValidatedProbeCall = ProbeCallProposal & {
  readonly [validatedProbeCall]: true;
};

/** Why a proposal was refused. Each maps to a frozen control. */
export type RejectionReason =
  /** `§6.2` / `PREREGISTRATION.md §7`: `P_max = 3` per component. */
  | "BUDGET_EXHAUSTED"
  /** `§T7`: the enum is closed at five. */
  | "NOT_IN_CLOSED_ENUM"
  /** `§L.1` rule 8 / `I6`: the argument names no observation. */
  | "ARGUMENT_NOT_IN_OBSERVATION_SET"
  /** `DATA_MODEL.md §12`: `days` is `integer > 0`. */
  | "ARGUMENT_OUT_OF_RANGE";

export type ProposalCheck =
  | { readonly ok: true; readonly call: ValidatedProbeCall }
  | {
      readonly ok: false;
      readonly reason: RejectionReason;
      /** The offending argument, where one is identifiable. */
      readonly argument: string | null;
    };

/**
 * The entity id a proposal names, or `null` where the probe names none.
 *
 * `widen_temporal_window` carries no entity id — `DATA_MODEL.md §12`'s variant is
 * `{ probe, days }` — so `I6` has nothing to check on it. That is a property of
 * the probe, not an exemption: the range check below still applies.
 */
export function argumentEntityId(proposal: ProbeCallProposal): string | null {
  switch (proposal.probe) {
    case "fetch_order":
      return proposal.order_id;
    case "fetch_payment":
      return proposal.payment_id;
    case "fetch_refund":
      return proposal.refund_id;
    case "fetch_settlement_recon":
      return proposal.settlement_id;
    case "widen_temporal_window":
      return null;
  }
}

/** Whether a proposal declines rather than naming a probe. */
export function isNoUsefulProbe(
  proposal: ProbeProposal,
): proposal is { readonly probe: typeof NO_USEFUL_PROBE } {
  return proposal.probe === NO_USEFUL_PROBE;
}

/** The observation set, as the pre-call `I6` check needs to see it. */
export interface ObservationUniverse {
  /**
   * Whether an **entity** id appears in the observation set.
   *
   * `DECISION_BRIEF.md §L.1` rule 8: *"Every LLM-referenced entity ID must exist
   * in the observation set (invariant `I6`), **independently of any allowlist
   * check**."* `R3` proposes the probe, so its argument is an LLM-referenced
   * entity id and this check is `I6`'s pre-call half — distinct from
   * `packages/llm`'s boundary-2 allowlist and from `S5`'s post-hoc `I6`.
   */
  readonly hasEntityId: (entityId: string) => boolean;
}

/**
 * The one constructor of a `ValidatedProbeCall`.
 *
 * Checks run in a fixed order so a rejection names the **first** control that
 * refused, which is what makes the loop's transitions testable:
 *
 * ```
 *   1  P_max            §6.2, PREREGISTRATION.md §7 — budget before anything else
 *   2  closed enum      §T7 — a sixth probe is not a call
 *   3  pre-call I6      §L.1 rule 8 — the argument must exist
 *   4  argument range   §12 — `days` is integer > 0
 * ```
 */
export function validate(
  proposal: ProbeCallProposal,
  universe: ObservationUniverse,
  attemptsSpent: number,
  pMax: number,
): ProposalCheck {
  if (attemptsSpent >= pMax) {
    return { ok: false, reason: "BUDGET_EXHAUSTED", argument: null };
  }

  if (!(PROBE_KINDS as readonly string[]).includes(proposal.probe)) {
    return { ok: false, reason: "NOT_IN_CLOSED_ENUM", argument: proposal.probe };
  }

  const entityId = argumentEntityId(proposal);
  if (entityId !== null && !universe.hasEntityId(entityId)) {
    return {
      ok: false,
      reason: "ARGUMENT_NOT_IN_OBSERVATION_SET",
      argument: entityId,
    };
  }

  if (proposal.probe === "widen_temporal_window") {
    const { days } = proposal;
    if (!Number.isInteger(days) || days <= 0) {
      return {
        ok: false,
        reason: "ARGUMENT_OUT_OF_RANGE",
        argument: String(days),
      };
    }
  }

  return { ok: true, call: proposal as ValidatedProbeCall };
}

/** The probe kind a validated call names. */
export function kindOf(call: ValidatedProbeCall): ProbeKind {
  return call.probe;
}
