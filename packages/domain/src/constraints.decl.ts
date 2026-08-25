/**
 * The hard admissibility constraints, declared as data.
 *
 * `ARCHITECTURE.md §7.2` and `PREREGISTRATION.md §5.2` both require this file
 * to exist and to hold the constraints "as **data** — each constraint a named,
 * documented predicate specification with its real-world justification".
 *
 * The reason it is data and not code is the oracle's independence claim. The
 * engine implements these as "fused, short-circuiting filters optimised for
 * throughput"; the oracle implements them as "naive per-candidate boolean
 * checks over a fully enumerated space". Neither reads the other's code, and
 * the consistency gate compares the two verdicts constraint by constraint. That
 * is only a meaningful differential test if both are implementing one written
 * specification rather than one shared function — so this module deliberately
 * contains no predicate implementations at all.
 *
 * `PREREGISTRATION.md §5.5` records the standing limitation: engine and oracle
 * share this *declaration*, so "if that declaration misrepresents the real
 * world, both are wrong together and no amount of differential testing would
 * reveal it". `constraint_set_hash` in the benchmark manifest exists to pin
 * exactly what was declared when a result was produced.
 *
 * Membership is frozen. `DECISION_BRIEF.md §A.6` states that no constraint was
 * "added, removed or reordered" through spec 1.3.0, and `§L.4` forbids changing
 * a frozen decision parameter without a governance cycle.
 */

import { canonicalJson } from "./canonical-json.js";

/** The eight hard constraints. A closed set (`RECONCILIATION_SPEC.md §4.1`). */
export type ConstraintId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";

/** Provenance classes, defined in `DATA_MODEL.md §0` rule 6. */
export type ProvenanceClass = "RZP-DOC" | "ASSAY-MODEL";

/**
 * Whether a clause can actually be evaluated from observations.
 *
 * `expected-non-binding` is not a weaker constraint — it is a declared
 * statement that on v1.0.0 data the clause excludes nothing, either because the
 * field it reads is out of Tier-0 scope (`C8`, Route) or because no observable
 * carries it (`C2`'s adjustment half). `RECONCILIATION_SPEC.md §4.1` requires
 * "the fraction of candidates it excludes is reported so a reviewer can see
 * that it is doing nothing rather than assume it is doing something", and
 * `PREREGISTRATION.md §5.3` excludes these clauses from the consistency gate's
 * pass criterion, because "a gate that cannot fail on a constraint neither side
 * can evaluate would otherwise report agreement it never tested".
 */
export type AgentSideBinding = "binding" | "expected-non-binding";

/**
 * One clause of a constraint. Most constraints have exactly one; `C2` has two
 * halves with different provenance and different binding status, and
 * `RECONCILIATION_SPEC.md §4.1` names them "refund half" and "adjustment half".
 */
export interface ConstraintClause {
  /** The specification's own name for this half, or `null` when undivided. */
  readonly half: string | null;
  /** What the clause requires of an admissible candidate. */
  readonly statement: string;
  /** Whether the clause can bind agent-side on v1.0.0 data. */
  readonly agentSideBinding: AgentSideBinding;
  /** Why it cannot bind, when it cannot. `null` when it binds. */
  readonly nonBindingReason: string | null;
}

/** A declared hard constraint. */
export interface ConstraintDeclaration {
  readonly id: ConstraintId;
  /** Short name, as `RECONCILIATION_SPEC.md §4.1` states it. */
  readonly title: string;
  /**
   * The real-world justification. Required, never decorative: `DATA_MODEL.md
   * §18` makes the same demand of scenario families because "a scenario family
   * that cannot state why it occurs in production is a manufactured puzzle".
   */
  readonly justification: string;
  /**
   * Provenance classes the specification tags on this constraint's row.
   *
   * Empty where `§4.1` tags none — `C6` is the only such row, and no class is
   * asserted here on its behalf, because `DATA_MODEL.md §0` rule 6 makes an
   * untagged Razorpay claim a defect and inventing a tag would hide one.
   */
  readonly provenance: readonly ProvenanceClass[];
  readonly clauses: readonly ConstraintClause[];
}

/**
 * Recursively freeze a declaration tree.
 *
 * `Object.freeze` is shallow, and `as const` is a compile-time annotation with
 * no runtime effect, so a top-level freeze alone leaves every nested constraint
 * object, clause array and provenance array writable. That matters here more
 * than it usually would: `canonicalConstraintSet()` is serialized into
 * `constraint_set_hash` (`DATA_MODEL.md §18`), which exists so a result can be
 * read against the exact declaration in force when it was produced
 * (`PREREGISTRATION.md §5.5`). A table that any consumer can edit in place
 * would let that hash quietly stop describing the constraints actually used,
 * and `DECISION_BRIEF.md §L.4` forbids changing a frozen decision parameter
 * outside a governance cycle.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

const bindingClause = (statement: string): ConstraintClause => ({
  half: null,
  statement,
  agentSideBinding: "binding",
  nonBindingReason: null,
});

/**
 * `C1`–`C8`, in the order `RECONCILIATION_SPEC.md §4.1` declares them.
 *
 * Order is part of the declaration: `constraint_set_hash` is computed over this
 * structure, and a reordering would change the hash of an unchanged constraint
 * set.
 */
export const HARD_CONSTRAINTS = deepFreeze([
  {
    id: "C1",
    title: "Currency equality",
    justification:
      "Tier-0 is INR-only by construction, so a non-INR line in an INR dataset " +
      "is a source or scope error, not a netting event. Deliberately NOT " +
      "justified by 'cross-currency netting does not occur': Razorpay settles " +
      "in INR regardless of the currency the customer paid in, so a real " +
      "multi-currency merchant needs the F11 conversion truth model, which is " +
      "specified and not implemented.",
    provenance: ["ASSAY-MODEL"],
    clauses: [bindingClause("Currency is equal across all members and the target.")],
  },
  {
    id: "C2",
    title: "Type compatibility",
    justification:
      "A refund documents its parent payment, so it can only offset that " +
      "payment's order. An adjustment's parent is ASSAY's own construct and is " +
      "not observable.",
    provenance: ["RZP-DOC", "ASSAY-MODEL"],
    clauses: [
      {
        half: "refund half",
        statement: "A refund may only offset a payment on the same order_id.",
        agentSideBinding: "binding",
        nonBindingReason: null,
      },
      {
        half: "adjustment half",
        statement:
          "An adjustment may only attach to its related_entity_id when present.",
        agentSideBinding: "expected-non-binding",
        nonBindingReason:
          "related_entity_id lives on the true-state Adjustment entity " +
          "(DATA_MODEL.md §9), which DATA_MODEL.md §10 excludes from the " +
          "observation payload union. It is a generation invariant the " +
          "generator honours; neither engine nor oracle can evaluate it.",
      },
    ],
  },
  {
    id: "C3",
    title: "Temporal ordering",
    justification:
      "Money cannot settle before capture or arrive before it is sent. " +
      "Razorpay documents that settlement status 'processed' marks initiation, " +
      "with the bank credit following the NEFT/RTGS/IMPS timeline, so a " +
      "strictly later bank value date is expected rather than anomalous.",
    provenance: ["RZP-DOC"],
    clauses: [
      bindingClause(
        "created_at <= settled_at <= bank.value_date for every member.",
      ),
    ],
  },
  {
    id: "C4",
    title: "Settlement window",
    justification:
      "The documented standard domestic cycle is T+2 working days from " +
      "capture, subject to bank approval and variation by vertical and risk. " +
      "ASSAY simulates calendar days with no bank-holiday calendar, and " +
      "T_max = 7 is sized to absorb the working-day expansion — a capture " +
      "before a weekend plus a public holiday can exceed five calendar days.",
    provenance: ["RZP-DOC", "ASSAY-MODEL"],
    clauses: [
      bindingClause(
        "settled_at - created_at falls within [T_min, T_max], declared as 1 to " +
          "7 calendar days.",
      ),
    ],
  },
  {
    id: "C5",
    title: "Per-line arithmetic identity",
    justification:
      "A line failing this is corrupt, not a candidate. Razorpay documents fee " +
      "as 'Fee (including GST)' with tax the GST component inside it, so " +
      "subtracting both would double-count GST.",
    provenance: ["RZP-DOC"],
    clauses: [
      bindingClause(
        "credit = amount - fee for payments, where fee is GST-inclusive; " +
          "debit = amount for refunds.",
      ),
    ],
  },
  {
    id: "C6",
    title: "Exact tie-out",
    justification:
      "Settlement amounts are exact; a tolerance here is how false matches get " +
      "admitted. In benchmark v1.0.0 C6 is zero-tolerance throughout: no " +
      "scenario family exercises ROUND_BANK_AMOUNT, the only sanctioned source " +
      "of a tolerance, and activating it requires a spec amendment supplying " +
      "both a tolerance magnitude and an engine-visible signal that it is in " +
      "force. A global tolerance is the standard way recon tools manufacture " +
      "confident wrong answers.",
    provenance: [],
    clauses: [
      bindingClause(
        "Sum of member credit minus sum of member debit equals target.amount " +
          "exactly, with zero tolerance in paise.",
      ),
    ],
  },
  {
    id: "C7",
    title: "One-allocation",
    justification:
      "Double-counting a payment is the most expensive reconciliation error. " +
      "Razorpay documents that partial settlements defer whole transactions to " +
      "the next slot — its own worked example settles P1 and P2 and defers P3 " +
      "— so a single payment is not split across two settlements.",
    provenance: ["RZP-DOC"],
    clauses: [
      bindingClause(
        "No member may already belong to an accepted allocation.",
      ),
    ],
  },
  {
    id: "C8",
    title: "Not on hold",
    justification:
      "A line flagged as held is not part of the settled set. The field itself " +
      "is documented, but specifically as 'whether the account settlement for " +
      "transfer is on hold' — a Razorpay Route concept toggled via " +
      "PATCH /v1/transfers/:id.",
    provenance: ["ASSAY-MODEL", "RZP-DOC"],
    clauses: [
      {
        half: null,
        statement: "on_hold is false for members claimed as settled.",
        agentSideBinding: "expected-non-binding",
        nonBindingReason:
          "Route is out of Tier-0 scope, so no v1.0.0 line carries on_hold " +
          "true. C8 is retained as a declared admissibility filter and the " +
          "fraction of candidates it excludes is reported, so a reviewer can " +
          "see that it is doing nothing rather than assume it is doing " +
          "something.",
      },
    ],
  },
] as const satisfies readonly ConstraintDeclaration[]);

/** Every declared constraint id, in declaration order. */
export const CONSTRAINT_IDS = deepFreeze(
  HARD_CONSTRAINTS.map((c) => c.id),
) as readonly ConstraintId[];

/**
 * The canonical serialization of the constraint set.
 *
 * `DATA_MODEL.md §18` puts `constraint_set_hash` in the benchmark manifest and
 * `PREREGISTRATION.md §5.5` explains why: engine and oracle share this
 * declaration, so a result is only interpretable alongside the exact
 * declaration in force when it was produced. This function returns the bytes to
 * hash; computing the digest belongs to the stage that writes the manifest.
 */
export function canonicalConstraintSet(): string {
  return canonicalJson(HARD_CONSTRAINTS as unknown as Record<string, unknown>[]);
}

/**
 * The clauses the consistency gate must exclude from its pass criterion.
 *
 * `PREREGISTRATION.md §5.3`: clauses neither side can evaluate are "reported
 * separately as *evaluated: non-binding*", because a gate that cannot fail on
 * them "would otherwise report agreement it never tested".
 */
export function nonBindingClauses(): readonly {
  id: ConstraintId;
  half: string | null;
}[] {
  return HARD_CONSTRAINTS.flatMap((constraint) =>
    constraint.clauses
      .filter((clause) => clause.agentSideBinding === "expected-non-binding")
      .map((clause) => ({ id: constraint.id, half: clause.half })),
  );
}
