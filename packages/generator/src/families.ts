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
  /**
   * bench-v2 `A01` (`AMB-1`): same-day split batches hosting equal-credit twins
   * on different fee rates (`docs/BENCH_V2_DESIGN.md §B.2`).
   */
  readonly amb1_material_twins: boolean;
  /**
   * bench-v2 `A02` (`AMB-2`): same-day split batches hosting `{P}` vs
   * `{P2, R1}` — a capture against a larger capture net of its own partial
   * refund, equal net, the refund leg material (`§3.2` T4-b).
   */
  readonly amb2_refund_netting: boolean;
  /**
   * bench-v2 `A03` (`AMB-3`): `AMB-1`'s twins with the gross difference held
   * in `[Rs 51, Rs 80]` — below `tau`'s floor, above the sweep's Rs 50 point.
   */
  readonly amb3_subtau_twins: boolean;
  /** bench-v2 `A05` (`AMB-5`): 15 lines of one batch detached, so `S2` hits `C_max`. */
  readonly amb5_search_bound: boolean;
  /** bench-v2 `B01` (`BENIGN`): `BEN-1`/`BEN-2`/`BEN-3`, determinable targets that reach `S2`. */
  readonly benign_controls: boolean;
  /** The degradation operators this family declares, in composition order. */
  readonly operators: readonly DegradationOp[];
}

const NONE = {
  f03_repricing: false, f02_refund_boundary: false, f05_withhold: false,
  f06_collisions: false, f07_chargebacks: false, f09_forced_late: false,
  amb1_material_twins: false, amb2_refund_netting: false, amb3_subtau_twins: false,
  amb5_search_bound: false, benign_controls: false,
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
  /**
   * bench-v2 `AMB-1` — "material twins" (`docs/BENCH_V2_DESIGN.md §3.1`, §B.2).
   * True state: split batches and twins. Operator: `DROP_BATCH_IDENTITY` on
   * exactly the twins, selected by construction from the pair.
   */
  A01: { ...NONE, amb1_material_twins: true, operators: [OP("DROP_BATCH_IDENTITY")] },
  /** bench-v2 `AMB-2` — refund-netting twins (`§3.2` T4-b). Same operator, same selection principle. */
  A02: { ...NONE, amb2_refund_netting: true, operators: [OP("DROP_BATCH_IDENTITY")] },
  /** bench-v2 `AMB-3` — sub-`tau` boundary twins (`§3.3`). A negative control for abstention. */
  A03: { ...NONE, amb3_subtau_twins: true, operators: [OP("DROP_BATCH_IDENTITY")] },
  /** bench-v2 `AMB-5` — the search bound (`§3.5`). No split day. */
  A05: { ...NONE, amb5_search_bound: true, operators: [OP("DROP_BATCH_IDENTITY")] },
  /** bench-v2 `BENIGN` — `BEN-1`, `BEN-2`, `BEN-3` on disjoint day blocks (`§3.6`). */
  B01: { ...NONE, benign_controls: true, operators: [OP("DROP_BATCH_IDENTITY")] },
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
// mapping cannot drift away from the table it transcribes. A bench-v2 operator
// declares a LIST of carriers (`docs/BENCH_V2_DESIGN.md §C`); the check is the
// same in both directions — the carriers must be exactly the declared ones, in
// declaration order — so a family that runs `DROP_BATCH_IDENTITY` without being
// listed, or a listed family that drops it, still refuses to load.
for (const [op, declaring] of Object.entries(OPERATOR_DECLARING_FAMILY) as [DegradationOp, FamilyId | readonly FamilyId[] | null][]) {
  const carriers = IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes(op));
  const expected = declaring === null ? [] : typeof declaring === "string" ? [declaring] : [...declaring];
  if (carriers.join(",") !== expected.join(",")) {
    throw new Error(
      `families: PREREGISTRATION.md §4.3 maps ${op} to ${declaring ?? "no family"}, but this table ` +
        `gives it to [${carriers.join(", ")}].`,
    );
  }
}
