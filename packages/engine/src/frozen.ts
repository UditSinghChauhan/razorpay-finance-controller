/**
 * Frozen constants this package reads, transcribed from the specification with
 * the clause that fixes each one.
 *
 * They are **transcribed, not imported**. `packages/generator` holds the same
 * figures in its own `frozen.ts`, and this package may not import it
 * (`DECISION_BRIEF.md §L.1` rule 3) — it holds `GroundTruth`. Duplicating a
 * frozen number under `AL3`, where the value cannot move without a spec
 * amendment and a version bump, is the intended shape rather than a smell: the
 * alternative is an import the architecture forbids.
 *
 * `AL3` (`PREREGISTRATION.md §6.2`): *"Every constant in §7 ... is fixed before
 * the seal and immutable after it."*
 */

/** Seconds in one calendar day. `DATA_MODEL.md §0`: all timestamps are Unix seconds. */
export const SECONDS_PER_DAY = 86_400;

/**
 * `C4`'s settlement window (`RECONCILIATION_SPEC.md §4.1`):
 * *"`settled_at − created_at ∈ [T_min, T_max]` (declared: 1–7 **calendar**
 * days)"*, and `PREREGISTRATION.md §4.2`: *"Settlement window bound: `T_min = 1`
 * day, `T_max = 7` days (constraint `C4`)"*.
 *
 * Both `settled_at` and `created_at` are `UnixSeconds`, so the difference the
 * clause bounds is **elapsed seconds**; the bound is stated in days and is
 * converted here rather than at each comparison. Both ends are **inclusive** —
 * the clause writes a closed interval.
 */
export const SETTLEMENT_WINDOW = Object.freeze({
  t_min_days: 1,
  t_max_days: 7,
  t_min_seconds: 1 * SECONDS_PER_DAY,
  t_max_seconds: 7 * SECONDS_PER_DAY,
} as const);

/**
 * `RECONCILIATION_SPEC.md §4.3`: *"Candidate enumeration inside a component is
 * bounded by `K_max = 22` members and `C_max = 5,000` enumerated candidates.
 * Exceeding either yields `solve_status: INTRACTABLE`."* Also
 * `PREREGISTRATION.md §7`, frozen under `AL3`.
 */
export const SEARCH_BOUND = Object.freeze({
  k_max: 22,
  c_max: 5_000,
} as const);

/**
 * `DATA_MODEL.md §11.1`, register row M19: *"`currency(target) := "INR"` is a
 * declaration, not a derivation"*. Neither target kind carries a `currency`
 * field, and `C1` names the target explicitly, so the value is declared.
 */
export const TARGET_CURRENCY = "INR";

/**
 * `DATA_MODEL.md §11.1`: *"The member-eligible kinds are therefore `recon_line`
 * and `adjustment`, and every other kind is excluded by frozen text."*
 */
export const MEMBER_ELIGIBLE_KINDS = Object.freeze([
  "recon_line",
  "adjustment",
] as const);

/**
 * `DATA_MODEL.md §17.1.1`: *"The target universe is settlements and bank lines,
 * and this table does not widen it."*
 */
export const TARGET_KINDS = Object.freeze(["settlement", "bank_line"] as const);

/**
 * `§6`'s evidence margin: *"`ε` (evidence margin) = `1500` basis points
 * (`0.15`), frozen. The comparison `Δs < ε` is an **integer** comparison"*.
 * Also `PREREGISTRATION.md §7`, immutable under `AL3`.
 */
export const EPSILON_BPS = 1_500;

/**
 * `§6`'s materiality threshold: *"`τ` = `max(₹100.00, 10 bps of component
 * value)`"*, with `PREREGISTRATION.md §7` giving the floor as `10_000` paise.
 * *"Component value"* is `Component.total_value_paise` (`DATA_MODEL.md §11`,
 * spec 1.4.6) — **not** the target's amount.
 */
export const TAU = Object.freeze({
  floor_paise: 10_000,
  component_value_bps: 10,
} as const);

/** `§6.2` / `PREREGISTRATION.md §7`: *"`P_max` (probe budget) = 3 per component"*. */
export const P_MAX = 3;

/**
 * `§4.2`'s frozen soft-evidence weights, summing to `10_000` bps.
 *
 * `AL3` fixes them and **bars renormalisation**. Three are known to contribute
 * nothing on v1.0.0 data and their weights are retained anyway, exactly as
 * `§4.1`'s `C8` precedent requires:
 *
 * ```
 *   SE1  3500  INACTIVE                        spec 1.4.10
 *   SE2  2000  EXPECTED-NON-BINDING on v1.0.0  spec 1.4.20
 *   SE3  1500  LIVE / DEFINED                  spec 1.4.13
 *   SE4  1000  EXPECTED-NON-BINDING on v1.0.0  spec 1.4.11
 *   SE5  2000  LIVE / DEFINED                  spec 1.4.16 / 1.4.17
 * ```
 */
export const SE_WEIGHTS_BPS = Object.freeze({
  SE1: 3_500,
  SE2: 2_000,
  SE3: 1_500,
  SE4: 1_000,
  SE5: 2_000,
} as const);

/** `§4.2`: *"`evidence_score_bps ∈ [0, 10_000]`"*. */
export const EVIDENCE_SCORE_MAX_BPS = 10_000;
