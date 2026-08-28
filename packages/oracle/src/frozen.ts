/**
 * The frozen contract, transcribed for the oracle.
 *
 * `PREREGISTRATION.md` is **FROZEN on commit** and `DECISION_BRIEF.md §L.4`
 * makes changing any parameter in `§7` a spec amendment. This module is the
 * single place those parameters enter this package: nothing else here may carry
 * a rate, a magnitude, a threshold or a count as a literal. Every constant cites
 * the clause it is transcribed from, so a reviewer checks this file against the
 * specification once rather than auditing the oracle for stray numbers.
 *
 * **Why a transcription rather than an import.** `PREREGISTRATION.md §6.2` `AL1`
 * bars `packages/oracle` from importing `packages/generator`, where the same
 * figures already live as `frozen.ts`. The duplication is deliberate and is the
 * point of the differential design: two independent transcriptions of one
 * written specification, which `§5.3`'s consistency gate then compares. A shared
 * constants module would make the gate compare a value with itself.
 *
 * `packages/domain/src/constraints.decl.ts` holds the constraint *declarations*
 * and is imported, not copied — `§5.2` requires engine and oracle to implement
 * "one declarative specification", and the declaration is that specification.
 * What this file adds is the numeric parameters the declaration states in prose.
 */

/**
 * `C4`'s declared settlement window, in **calendar** days.
 *
 * `RECONCILIATION_SPEC.md §4.1`: "Settlement window: `settled_at − created_at ∈
 * [T_min, T_max]` (declared: 1–7 **calendar** days)". `PREREGISTRATION.md §4.2`
 * repeats it as "Settlement window bound: T_min = 1 day, T_max = 7 days".
 *
 * `[ASSAY-MODEL]` the calendar-day simulation; `[RZP-DOC]` the T+2 cycle it is
 * sized around.
 */
export const SETTLEMENT_WINDOW_DAYS = Object.freeze({ t_min: 1, t_max: 7 } as const);

/** Seconds in one calendar day. `DATA_MODEL.md §0` rule 2 counts epoch seconds. */
export const SECONDS_PER_DAY = 86_400;

/**
 * `C4`'s window in seconds, derived rather than transcribed twice.
 *
 * The measurement convention — elapsed seconds rather than a calendar-date
 * difference — is `conventions.ts` `O-C4-UNIT`. It is a convention because
 * `§4.1` states the unit ("calendar days") and not the measurement.
 */
export const SETTLEMENT_WINDOW_SECONDS = Object.freeze({
  min: SETTLEMENT_WINDOW_DAYS.t_min * SECONDS_PER_DAY,
  max: SETTLEMENT_WINDOW_DAYS.t_max * SECONDS_PER_DAY,
} as const);

/**
 * The oracle's search budget (`PREREGISTRATION.md §5.2`).
 *
 * "Budget `K_oracle = 30`, `C_oracle = 2,000,000`, offline, minutes per
 * component."
 *
 * **`K_oracle` cannot bind under the declared method, and `§5.2` records why**
 * at spec 1.4.3: the oracle enumerates "a fully enumerated space" with "no
 * ordering, no pruning, no early exit", which is `2^K` candidates exactly, and
 * `2^21 = 2_097_152` already exceeds `C_oracle`. `C_oracle` therefore caps a
 * class at 20 members and `K_oracle` is inert. Both are retained here because
 * both are declared, and the enumerator checks both so that a future change to
 * either is honoured without a code change.
 */
export const K_ORACLE = 30;

/** See {@link K_ORACLE}. The binding bound in practice. */
export const C_ORACLE = 2_000_000;

/**
 * `τ`, the materiality threshold (`PREREGISTRATION.md §7`).
 *
 * "`tau (materiality) = max(10_000 paise (₹100.00), 10 bps of component value)`".
 * The base against which the 10 bps is taken is `Component.total_value_paise`,
 * defined at spec 1.4.6 by `DATA_MODEL.md §11` and computed by `components.ts`
 * from `RECONCILIATION_SPEC.md §5`'s decomposition. `conventions.ts`
 * `O-TAU-BASE` records the ratification and what it moved.
 *
 * Neither number below changes. `§7` freezes both the floor and the rate, and
 * the amendment supplied the base they are applied to — not a new magnitude.
 */
export const TAU_FLOOR_PAISE = 10_000;

/** The 10 bps half of `τ`, as an integer basis-point rate (`DATA_MODEL.md §0` rule 5). */
export const TAU_RATE_BPS = 10;

/** Basis-point denominator. One bp is 1e-4 (`§0` rule 5). */
export const BPS_DENOMINATOR = 10_000;

/**
 * The specification version this package is written against.
 *
 * Bumped with the documents, exactly as `packages/generator/src/frozen.ts` does.
 */
export const SPEC_VERSION = "1.4.9";
