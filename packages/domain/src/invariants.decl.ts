/**
 * `I1`–`I9` — the S5 validation-gate vocabulary (`RECONCILIATION_SPEC.md §7`).
 *
 * **Why this is a separate module from `constraints.decl.ts`.** The two
 * vocabularies are deliberately distinct and neither is a subset of the other:
 *
 * ```
 *   ConstraintId  C1..C8   RECONCILIATION_SPEC.md §4.1's HARD CONSTRAINTS.
 *                          Filters over candidate member sets, evaluated at
 *                          stage S2. Serialized into `constraint_set_hash`.
 *
 *   InvariantId   I1..I9   RECONCILIATION_SPEC.md §7's VALIDATION GATE.
 *                          Checks over a proposed allocation and the journal
 *                          lines it produces, evaluated at stage S5. NOT part
 *                          of the hashed constraint declaration.
 * ```
 *
 * Declaring `InvariantId` inside `constraints.decl.ts` would put the S5 gate's
 * vocabulary in the module whose serialization *is* `constraint_set_hash`
 * (`DATA_MODEL.md §18`), blurring the separation `DATA_MODEL.md §13` states in
 * terms at spec 1.4.9. Nothing here enters that hash.
 *
 * **Supplied at spec 1.4.9, as a correction rather than an addition.**
 * `DATA_MODEL.md §13` typed `Decision.invariants_checked` and
 * `invariants_failed` as `ConstraintId[]` through spec 1.4.8, while the only
 * stage that populates them is `§7`'s gate over `I1`–`I9`, and gate `G5`
 * (`§10.1`) together with `ARCHITECTURE.md §4` boundary 3 read them as *"the
 * result"* of that gate. `I1`–`I9` had no declared type anywhere, so the fields
 * could not hold the values the specification required: S5 could record *that*
 * validation failed but never *which* invariant failed. Register row M23; full
 * record at `DECISION_BRIEF.md §A.16`.
 *
 * **This module declares identities, not checks.** The invariants themselves
 * are `§7`'s table and are implemented by stage S5; nothing here evaluates
 * anything, exactly as `constraints.decl.ts` declares `C1`–`C8` without
 * implementing them.
 */

/**
 * The nine validation-gate invariants, in `RECONCILIATION_SPEC.md §7`'s order.
 *
 * Order is the specification's, not an implementation preference — `§7`'s table
 * reads `I1` through `I9` and a reordering here would misreport the gate.
 */
export const INVARIANT_IDS = Object.freeze([
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
  "I7",
  "I8",
  "I9",
] as const);

/**
 * One of `RECONCILIATION_SPEC.md §7`'s nine validation-gate invariants.
 *
 * `DATA_MODEL.md §13` at spec 1.4.9: *"The S5 validation-gate invariants of
 * `RECONCILIATION_SPEC.md §7` … **DISTINCT** from `ConstraintId` (`C1`-`C8`)."*
 *
 * | Id | `§7` invariant |
 * |---|---|
 * | `I1` | Trial balance: `Σ dr = Σ cr` across posted journal lines |
 * | `I2` | No double allocation across the run |
 * | `I3` | Line arithmetic: `credit = amount − fee`; `debit = amount` |
 * | `I4` | Settlement closure: `settlement.amount = Σ credit − Σ debit` |
 * | `I5` | Bank tie-out: `Σ settlement.amount = bank_line.amount` |
 * | `I6` | Referential integrity: every referenced ID exists |
 * | `I7` | Range/sign: no negative fee or tax; `Paise` in safe-integer range |
 * | `I8` | Temporal: no settlement dated before its constituent captures |
 * | `I9` | Idempotency: identical input yields an identical root hash |
 *
 * The table is transcribed for the reader; `§7` remains the normative text and
 * this module adds no obligation to it.
 */
export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8" | "I9";

/** Whether a string is one of `§7`'s nine invariant ids. */
export function isInvariantId(value: string): value is InvariantId {
  return (INVARIANT_IDS as readonly string[]).includes(value);
}
