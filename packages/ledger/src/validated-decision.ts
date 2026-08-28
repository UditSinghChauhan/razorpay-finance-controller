/**
 * `ValidatedDecision` — the S5 → ledger boundary type (`ARCHITECTURE.md §4`
 * boundary 3, `DECISION_BRIEF.md §L.1` rule 4).
 *
 * `RECONCILIATION_SPEC.md §7`: *"This is the only code path that may post to the
 * ledger. Its input is a proposed allocation; its output is either a
 * `ValidatedDecision` or a rejection. **Nothing else in the system can construct
 * a `ValidatedDecision`.**"*
 *
 * **Declaration site is forced, not preferred.** `§L.1` rule 4 puts the write
 * path in this package; a function signature must name its parameter's type; and
 * `ledger` cannot import `engine`, which builds after it (`§L.2`).
 * `packages/domain` is the wrong home — `ARCHITECTURE.md §4`: *"its scope is the
 * ingest-boundary entities of `DATA_MODEL.md §2`–`§9`, and a post-validation
 * engine artifact does not belong in the package the trust-boundary-1 schemas
 * live in."*
 *
 * **What lands here and what does not.** This module declares the **type**. It
 * exports **no constructor**, and this package still exposes **no mutating write
 * path**, no `close-gate.ts` and no `close.ts`. `ARCHITECTURE.md §4` licenses
 * exactly that split: *"This paragraph and `§L.1` rule 4 constrain the mutating
 * write path and nothing else."* The type is declared now because
 * `packages/engine`'s S5 cannot name its own return type otherwise, and `§L.2`
 * sequences `ledger Layer B → engine S4–S5`, which is the next step.
 *
 * **Enforcement: an opaque brand plus a path allowlist.** `ARCHITECTURE.md §4`:
 * *"TypeScript is structurally typed, so any object with matching fields
 * inhabits a bare interface and 'only S5 may construct' would be a convention
 * rather than a property. `ledger` therefore declares the type carrying a
 * **non-exported** unique-symbol brand and exports **no constructor**; the
 * single widening assertion lives in `engine/src/s5-validate.ts` and is
 * allowlisted by path in an ESLint rule."* {@link VALIDATED_BRAND} below is that
 * symbol: it is declared at module scope and is **not** exported, so no other
 * module can name the key, and no object literal written elsewhere can satisfy
 * the type. The ESLint path allowlist is added with
 * `packages/engine/src/s5-validate.ts` and is deliberately absent until that
 * file exists — a path allowlist for a path that does not exist would assert a
 * boundary nothing is standing on.
 */

import type { InvariantId, ObservationId, Sha256 } from "@assay/domain";

import type {
  AmbiguityCertificate,
  DecisionId,
  EvidenceId,
  JournalLine,
} from "./events.js";
import type { DecisionState } from "./projection.js";

/**
 * The nominal brand key. **Never exported.**
 *
 * `declare const` emits no runtime value, so this costs nothing at runtime and
 * exists purely so the type has an identity structural typing cannot forge.
 * Because the symbol is unnameable outside this module, a caller cannot write an
 * object literal that satisfies {@link ValidatedDecision} — the only route is the
 * widening assertion `ARCHITECTURE.md §4` allowlists in
 * `packages/engine/src/s5-validate.ts`.
 */
declare const VALIDATED_BRAND: unique symbol;

/**
 * A decision that stage S5 has validated against `RECONCILIATION_SPEC.md §7`'s
 * `I1`–`I9`, and the only type the mutating write path will accept.
 *
 * Every field is present because an already-frozen gate or invariant cannot be
 * evaluated without it; `ARCHITECTURE.md §4` boundary 3 names the demanding
 * obligation for each and this interface adds none of its own.
 *
 * **`invariants_failed` is empty by construction — that emptiness is the type's
 * meaning.** Gate `G5` (`RECONCILIATION_SPEC.md §10.1`) is *"No allocation with a
 * non-empty `invariants_failed` was posted"*, and it is unverifiable unless the
 * validated artifact carries the result. A rejection is not a
 * `ValidatedDecision` with failures listed; it is not a `ValidatedDecision` at
 * all, and `§7` routes it to an exception instead.
 */
export interface ValidatedDecision {
  /**
   * Nominal identity (`§L.1` rule 4). Without it the type is structurally
   * inhabitable by anything with matching fields.
   */
  readonly [VALIDATED_BRAND]: true;

  /**
   * The event body's owning-decision link (`DATA_MODEL.md §16`);
   * `EVALUATION_SPEC.md §4.4`'s `proj_agent` partitions on it.
   */
  readonly decision_id: DecisionId;

  /**
   * Selects the posting family and the terminal state
   * (`RECONCILIATION_SPEC.md §9`, `DATA_MODEL.md §20`).
   *
   * `ARCHITECTURE.md §4` names this field's type `DecisionType`;
   * `DATA_MODEL.md §13` declares that name for the three-member union
   * `"RECONCILED" | "EXCEPTION" | "ABSTAINED"`. `projection.ts` already exports
   * exactly that union as {@link DecisionState}, so it is reused rather than
   * duplicated — one union under two names is how two spellings of one fact
   * drift apart.
   */
  readonly type: DecisionState;

  /**
   * The lines S5 validated (`DATA_MODEL.md §16`, `I1`, gate `G2`). **The write
   * path must post *these*, never re-derive them.**
   */
  readonly journal_lines: readonly JournalLine[];

  /**
   * `RECONCILIATION_SPEC.md §7`'s gate result, demanded by gate `G5`.
   *
   * `InvariantId` (`I1`–`I9`), not `ConstraintId` (`C1`–`C8`) — the two
   * vocabularies are distinct and neither is a subset of the other. Corrected at
   * spec 1.4.9 (`DATA_MODEL.md §13`, register row M23, `DECISION_BRIEF.md
   * §A.16`): through spec 1.4.8 `§13` typed these fields `ConstraintId[]`, which
   * the stage that fills them cannot satisfy.
   */
  readonly invariants_checked: readonly InvariantId[];

  /**
   * Empty by construction. See {@link ValidatedDecision} and gate `G5`.
   *
   * Typed as an array rather than `never[]` because `G5` is a runtime check over
   * a recorded value: a type that made non-emptiness unrepresentable would move
   * the guarantee from the gate into the compiler and leave `G5` verifying a
   * tautology.
   */
  readonly invariants_failed: readonly InvariantId[];

  /** Enters the hashed `body` in emitting-stage order (`DATA_MODEL.md §16`). */
  readonly subject_obs_ids: readonly ObservationId[];

  /** Enters the hashed `body` in emitting-stage order (`DATA_MODEL.md §16`). */
  readonly evidence_ids: readonly EvidenceId[];

  /**
   * `DATA_MODEL.md §13`, `§16`. **Non-null exactly when `type === "ABSTAINED"`.**
   *
   * The biconditional is `ARCHITECTURE.md §4`'s wording and is a runtime
   * obligation on S5, not a type-level one: expressing it as a discriminated
   * union here would change the field list `§4` declares.
   */
  readonly certificate: AmbiguityCertificate | null;

  /**
   * `DATA_MODEL.md §16`: *"hash of everything the step read"* — only S5 knows
   * what it read.
   */
  readonly inputs_hash: Sha256;
}
