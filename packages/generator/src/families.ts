/**
 * What each family does, as data.
 *
 * `PREREGISTRATION.md §4.1` names ten mechanisms and `§4.3` maps six operators
 * onto three of them. Expressing both as one table rather than as branches
 * scattered through the simulation means a reviewer can check the code against
 * `§4.1` and `§4.3` by reading one screen, and means the **disposal rule** is
 * mechanical: a family with no entry for a mechanism does not run it.
 *
 * `§4.3`'s disposal rule is the load-bearing part: "This section's own disposal
 * rule governs an operator no family declares ... **Assigning them would invent
 * a family pairing this specification does not state.**"
 */

import {
  F08_OPERATOR_ORDER,
  F10_OPERATOR_ORDER,
  IMPLEMENTED_FAMILIES,
  OPERATOR_DECLARING_FAMILY,
  type DegradationOp,
  type FamilyId,
} from "./frozen.js";

/** The true-state and emission mechanisms a family runs. Everything else is shared. */
export interface FamilyMechanics {
  /** `F03`: card repricing 200 -> 195 bps at the frozen instant. */
  readonly f03_repricing: boolean;
  /** `F02`: a refund settles in the batch two days after its own. */
  readonly f02_refund_boundary: boolean;
  /** `F05`: one constituent `recon_line` withheld at emission per selected settlement. */
  readonly f05_withhold: boolean;
  /** `F06`: equal-amount, equal-method, same-day capture pairs; one member settles. */
  readonly f06_collisions: boolean;
  /** `F07`: a chargeback deduction and its later reversal, per dispute. */
  readonly f07_chargebacks: boolean;
  /** `F09`: the final three capture days settle at T+3, so their rows leave the period. */
  readonly f09_forced_late: boolean;
  /** The degradation operators this family declares, in composition order. */
  readonly operators: readonly DegradationOp[];
}

const NONE = {
  f03_repricing: false, f02_refund_boundary: false, f05_withhold: false,
  f06_collisions: false, f07_chargebacks: false, f09_forced_late: false,
  operators: [] as readonly DegradationOp[],
} as const;

/** `§4.1`'s ten implemented families and the mechanism each one declares. */
export const FAMILY_MECHANICS: Readonly<Record<FamilyId, FamilyMechanics>> = Object.freeze({
  /** "Clean T+2 settlement — the baseline case". No mechanism, no operator. */
  F01: { ...NONE },
  /** "Partial refund crossing a settlement boundary". */
  F02: { ...NONE, f02_refund_boundary: true },
  /** "Fee/GST rounding drift and a mid-period rate change". */
  F03: { ...NONE, f03_repricing: true },
  /** "Duplicate bank credit / re-presented UTR" — `DUPLICATE_ROW`. */
  F04: { ...NONE, operators: [OP("DUPLICATE_ROW")] },
  /** "Missing capture record" — a withheld row, not a degradation operator (`§4.2`). */
  F05: { ...NONE, f05_withhold: true },
  /** "Equal-amount collision" — true state, not degradation (`§4.2`). */
  F06: { ...NONE, f06_collisions: true },
  /** "Chargeback deduction and later reversal". Held out. */
  F07: { ...NONE, f07_chargebacks: true },
  /** "Bank narration corruption" — the only family declaring three operators. */
  F08: { ...NONE, operators: F08_OPERATOR_ORDER },
  /** "Late / out-of-order arrival across a period boundary". Held out. */
  F09: { ...NONE, f09_forced_late: true },
  /** "Adversarial metadata" — `INJECT_NOTES` then `CONFLICT_REFERENCE`. */
  F10: { ...NONE, operators: F10_OPERATOR_ORDER },
  /** `§4.1`: "specified, NOT IMPLEMENTED". */
  F11: { ...NONE },
  F12: { ...NONE },
});

/** Assert at authoring time that an operator is one `§4.3` maps to a family. */
function OP(op: DegradationOp): DegradationOp {
  if (OPERATOR_DECLARING_FAMILY[op] === null) {
    /* c8 ignore next 4 */
    throw new Error(
      `families: ${op} is declared NOT EXERCISED by PREREGISTRATION.md §4.3. Assigning it to a ` +
        `family would invent a pairing the specification does not state.`,
    );
  }
  return op;
}

// Every operator §4.3 maps to a family must appear in exactly that family's list,
// and no family may run an operator §4.3 leaves unassigned. Checked at load so the
// mapping cannot drift away from the table it transcribes.
for (const [op, declaring] of Object.entries(OPERATOR_DECLARING_FAMILY) as [DegradationOp, FamilyId | null][]) {
  const carriers = IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes(op));
  const expected = declaring === null ? [] : [declaring];
  if (carriers.join(",") !== expected.join(",")) {
    throw new Error(
      `families: PREREGISTRATION.md §4.3 maps ${op} to ${declaring ?? "no family"}, but this table ` +
        `gives it to [${carriers.join(", ")}].`,
    );
  }
}
