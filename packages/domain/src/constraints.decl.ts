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
 *
 * **Spec 1.4.3 split `C3` into two clauses and changed no membership.** The
 * eight rows and their order are unchanged; `C3` gains a second clause the way
 * `C2` has carried two halves since spec 1.3.0, because its two conjuncts have
 * different evidence requirements — `created_at <= settled_at` is intrinsic to
 * the member, while `settled_at <= bank.value_date` needs a bank line the target
 * may not have. `constraint_set_hash` moves, for the reason recorded below.
 * Spec 1.4.3 also defines `ReconLine.settled_at` (`DATA_MODEL.md §6`) and states
 * its consequence — co-settlement coherence — in `RECONCILIATION_SPEC.md §4.1`.
 * That consequence is deliberately **not** a row here: it is the observable
 * content of a field definition, not a ninth constraint, and adding it would
 * make the set nine.
 *
 * **Spec 1.4.2 added `settledAtNull` and changed no membership.** No constraint
 * was added, removed or reordered and no clause was edited; the eight rows and
 * their order are the ones spec 1.3.0 froze. What the amendment supplied is the
 * truth value of `C3` and `C4` against a null `settled_at`, which was previously
 * undetermined, and it is recorded on the declaration rather than in either
 * implementation. `constraint_set_hash` therefore moves — deliberately, because
 * `PREREGISTRATION.md §5.5` exists so a result names the exact declaration in
 * force when it was produced, and this is a different declaration. No dataset
 * and no manifest has been generated against the previous one.
 */

import { canonicalJson } from "./canonical-json.js";

/** The eight hard constraints. A closed set (`RECONCILIATION_SPEC.md §4.1`). */
export type ConstraintId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";

/** Provenance classes, defined in `DATA_MODEL.md §0` rule 6. */
export type ProvenanceClass = "RZP-DOC" | "ASSAY-MODEL";

/**
 * Whether a clause can actually be evaluated from observations.
 *
 * `binding-when-in-scope`, added at spec 1.4.3, is a third status and not a
 * softer second: the clause **is** evaluable and **does** exclude, but only where
 * the evidence it reads is in scope for the target at hand. `C3`'s bank-arrival
 * half is the only carrier. `RECONCILIATION_SPEC.md §4.1` scopes it "per target
 * rather than per dataset", which is why it is not folded into
 * `expected-non-binding`: that status says a clause excludes nothing on v1.0.0
 * data, and this one excludes a great deal on the targets where it applies.
 * `nonBindingClauses()` therefore continues to return only the wholesale pair,
 * and `§5.3`'s differential-test exclusion for this half is conditional.
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
export type AgentSideBinding =
  | "binding"
  | "expected-non-binding"
  | "binding-when-in-scope";

/**
 * How a constraint that reads `settled_at` evaluates against a **null** one.
 *
 * Ratified at spec 1.4.2. `PREREGISTRATION.md §4.2`'s batch-composition rule
 * emits a settlement member its batch cannot carry with `settled_at: null`, and
 * `C3` and `C4` both read that field. Their truth value there was undetermined
 * until `RECONCILIATION_SPEC.md §4.1` fixed it, and it is transcribed here
 * because `PREREGISTRATION.md §5.2` has the engine and the oracle implement one
 * shared declaration that `§5.3`'s consistency gate compares constraint by
 * constraint. A rule the two sides read from different places is a rule they can
 * disagree about while both believe they are conforming.
 *
 * The four fields are `§4.1`'s own block, verbatim in structure, so a reviewer
 * checks this against the specification rather than against a paraphrase.
 */
export interface SettledAtNullRule {
  /** `§4.1`: the member "does NOT satisfy" the constraint. Never "satisfies vacuously". */
  readonly verdict: "NOT_SATISFIED";
  readonly rule: string;
  /** Why the treatment is identical across every constraint carrying this rule. */
  readonly applies: string;
  /** Which `settled_at` is read, and which re-basings `§4.1` refuses. */
  readonly scope: string;
  /** Exclusion, never admission. */
  readonly effect: string;
  /** The specification version that ratified it. */
  readonly ratified_at_spec: string;
}

/**
 * `RECONCILIATION_SPEC.md §4.1`, "`C3` and `C4` against a null `settled_at`,
 * ratified at spec 1.4.2 `[ASSAY-MODEL]`".
 *
 * One object, referenced by both constraints rather than written twice, because
 * `§4.1` states the identity of treatment as part of the rule: "a split
 * treatment would make one null admissible under `C3` and not under `C4` with
 * nothing to justify the difference." Two copies could drift; one cannot.
 */
export const SETTLED_AT_NULL_RULE: SettledAtNullRule = deepFreeze({
  verdict: "NOT_SATISFIED",
  rule:
    "A candidate member whose settled_at is null does NOT satisfy this " +
    "constraint. It is excluded from every candidate.",
  applies:
    "Identically to C3 and C4. They sit in one table, are both unqualified " +
    "over members, read the same field and are evaluated at the same stage on " +
    "the same candidate; PREREGISTRATION.md §5.2 has the engine and the oracle " +
    "implement one shared declaration that §5.3's consistency gate compares " +
    "constraint by constraint, so a split treatment would make one null " +
    "admissible under C3 and not under C4 with nothing to justify the " +
    "difference.",
  scope:
    "The member's OWN settled_at. No constraint is re-based onto the target's " +
    "settlement clock, and none is given a settled-only scope: C8 alone is " +
    "written \"for members claimed as settled\", so the silence of C3 and C4 " +
    "on that point is deliberate and they remain unconditional over members.",
  effect:
    "Exclusion, never admission. A filter admits or excludes, never ranks, and " +
    "an unconditional filter whose bounded quantity does not exist cannot " +
    "report that it is within bounds: C4 bounds a settlement window an " +
    "unsettled member does not have, and C3's ordering chain has a missing link.",
  ratified_at_spec: "1.4.2",
});

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
  /**
   * The ratified treatment of a null `settled_at`, or `null` where the
   * constraint does not read the field.
   *
   * It lives inside the hashed declaration rather than beside it because
   * `canonicalConstraintSet()` is what `constraint_set_hash` covers, and
   * `PREREGISTRATION.md §5.5` exists so a result can be read against "the exact
   * declaration in force when it was produced". A rule kept outside that
   * serialization would bind both implementations and be pinned by nothing.
   */
  readonly settledAtNull: SettledAtNullRule | null;
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
    settledAtNull: null,
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
    settledAtNull: null,
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
    provenance: ["RZP-DOC", "ASSAY-MODEL"],
    settledAtNull: SETTLED_AT_NULL_RULE,
    clauses: [
      {
        half: "ordering half",
        statement: "created_at <= settled_at for every member.",
        agentSideBinding: "binding",
        nonBindingReason: null,
      },
      {
        half: "bank-arrival half",
        statement:
          "settled_at <= bank.value_date for every member, where bank is the " +
          "bank line that receives the TARGET's money: the target itself when " +
          "the target is a bank_line, and its AN2-matched bank line when the " +
          "target is a settlement.",
        agentSideBinding: "binding-when-in-scope",
        nonBindingReason:
          "A settlement target's bank line is identifiable only through AN2, " +
          "which needs a clean bank_ref, and PREREGISTRATION.md §4.2 freezes " +
          "bank_ref quality at '30% a clean UTR, 70% absent or non-UTR'. Where " +
          "no bank line is in scope the half is reported evaluated: non-binding " +
          "under §5.3 — per target, not per dataset. Where it IS in scope it " +
          "binds hard, so it is not expected-non-binding.",
      },
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
    settledAtNull: SETTLED_AT_NULL_RULE,
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
    settledAtNull: null,
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
    settledAtNull: null,
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
    settledAtNull: null,
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
    settledAtNull: null,
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
 * The constraints that read `settled_at` and therefore carry the ratified
 * null-settlement rule. Derived from the declaration, never restated.
 */
export const SETTLED_AT_NULL_CONSTRAINTS = deepFreeze(
  HARD_CONSTRAINTS.filter((c) => c.settledAtNull !== null).map((c) => c.id),
) as readonly ConstraintId[];

/**
 * `RECONCILIATION_SPEC.md §4.1` makes the identity of treatment part of the
 * rule, so it is checked at load rather than left to review.
 *
 * Two conditions, and both are load-bearing. The carrier set must be exactly
 * `C3` and `C4`: `§4.1` scopes the rule to the two constraints that read the
 * field, and `C8`'s unique "for members claimed as settled" wording is the
 * evidence that the silence of the others is deliberate. And the two must carry
 * the **same object**, not two equal ones — reference equality is what makes "a
 * split treatment" unrepresentable rather than merely absent today.
 */
{
  const carriers = SETTLED_AT_NULL_CONSTRAINTS.join(",");
  if (carriers !== "C3,C4") {
    throw new Error(
      `constraints.decl: RECONCILIATION_SPEC.md §4.1 ratifies the null settled_at rule for ` +
        `C3 and C4; this declaration carries it on [${carriers}].`,
    );
  }
  for (const constraint of HARD_CONSTRAINTS) {
    if (constraint.settledAtNull === null) continue;
    if (constraint.settledAtNull !== SETTLED_AT_NULL_RULE) {
      throw new Error(
        `constraints.decl: ${constraint.id} carries its own copy of the null settled_at rule. ` +
          `§4.1 requires C3 and C4 to be treated identically, "so a split treatment would make ` +
          `one null admissible under C3 and not under C4 with nothing to justify the difference".`,
      );
    }
  }
}

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
/**
 * The clauses that bind only where their evidence is in scope for the target.
 *
 * Added at spec 1.4.3 with `C3`'s bank-arrival half, the only carrier. Kept apart
 * from `nonBindingClauses()` deliberately: `PREREGISTRATION.md §5.3` excludes a
 * clause from the consistency gate's pass criterion because *neither side can
 * evaluate it*, which is a property of the dataset. This one is evaluable on some
 * targets and not others, so its exclusion is **per target**, and folding the two
 * together would let the gate drop a clause it can and should test.
 */
export function conditionallyBindingClauses(): readonly {
  id: ConstraintId;
  half: string | null;
}[] {
  return HARD_CONSTRAINTS.flatMap((constraint) =>
    constraint.clauses
      .filter((clause) => clause.agentSideBinding === "binding-when-in-scope")
      .map((clause) => ({ id: constraint.id, half: clause.half })),
  );
}

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
