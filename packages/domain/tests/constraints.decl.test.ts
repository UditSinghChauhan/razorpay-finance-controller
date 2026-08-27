import { describe, expect, it } from "vitest";

import {
  CONSTRAINT_IDS,
  HARD_CONSTRAINTS,
  SETTLED_AT_NULL_CONSTRAINTS,
  SETTLED_AT_NULL_RULE,
  canonicalConstraintSet,
  nonBindingClauses,
  type ConstraintId,
} from "@assay/domain";

describe("the declared constraint set", () => {
  it("declares exactly C1..C8, in RECONCILIATION_SPEC.md §4.1 order", () => {
    // DECISION_BRIEF.md §A.6: no constraint was "added, removed or reordered".
    // Order is part of the declaration because constraint_set_hash covers it.
    expect(CONSTRAINT_IDS).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
    ]);
    expect(HARD_CONSTRAINTS).toHaveLength(8);
  });

  it("gives every constraint a non-empty real-world justification", () => {
    // DATA_MODEL.md §18 makes the same demand of scenario families: one that
    // "cannot state why it occurs in production is a manufactured puzzle".
    for (const constraint of HARD_CONSTRAINTS) {
      expect(constraint.justification.length).toBeGreaterThan(40);
      expect(constraint.title.length).toBeGreaterThan(0);
    }
  });

  it("gives every constraint at least one clause with a statement", () => {
    for (const constraint of HARD_CONSTRAINTS) {
      expect(constraint.clauses.length).toBeGreaterThan(0);
      for (const clause of constraint.clauses) {
        expect(clause.statement.length).toBeGreaterThan(0);
      }
    }
  });

  it("contains no predicate implementations", () => {
    // ARCHITECTURE.md §7.2: engine and oracle must be two independent
    // implementations of one written declaration. A shared function here would
    // make the consistency gate compare the engine with itself.
    for (const constraint of HARD_CONSTRAINTS) {
      for (const value of Object.values(constraint)) {
        expect(typeof value).not.toBe("function");
      }
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set<ConstraintId>(CONSTRAINT_IDS).size).toBe(8);
  });
});

describe("binding status", () => {
  it("marks exactly the two clauses §4.1 declares non-binding agent-side", () => {
    // C8 in full, and C2's adjustment half (PREREGISTRATION.md §5.3).
    expect(nonBindingClauses()).toEqual([
      { id: "C2", half: "adjustment half" },
      { id: "C8", half: null },
    ]);
  });

  it("splits C2 into the two halves the specification names", () => {
    const c2 = HARD_CONSTRAINTS.find((c) => c.id === "C2");
    expect(c2?.clauses.map((clause) => clause.half)).toEqual([
      "refund half",
      "adjustment half",
    ]);
    expect(c2?.clauses[0]?.agentSideBinding).toBe("binding");
    expect(c2?.clauses[1]?.agentSideBinding).toBe("expected-non-binding");
  });

  it("requires a reason for every non-binding clause and none for a binding one", () => {
    for (const constraint of HARD_CONSTRAINTS) {
      for (const clause of constraint.clauses) {
        if (clause.agentSideBinding === "expected-non-binding") {
          expect(clause.nonBindingReason).not.toBeNull();
          expect(clause.nonBindingReason?.length ?? 0).toBeGreaterThan(40);
        } else {
          expect(clause.nonBindingReason).toBeNull();
        }
      }
    }
  });

  it("leaves C6 with no provenance class, because §4.1 tags none", () => {
    // DATA_MODEL.md §0 rule 6 makes an untagged Razorpay claim a defect;
    // inventing a tag here would conceal one rather than surface it.
    const c6 = HARD_CONSTRAINTS.find((c) => c.id === "C6");
    expect(c6?.provenance).toEqual([]);
  });

  it("uses only the two provenance classes §0 rule 6 defines for assertions", () => {
    for (const constraint of HARD_CONSTRAINTS) {
      for (const cls of constraint.provenance) {
        expect(["RZP-DOC", "ASSAY-MODEL"]).toContain(cls);
      }
    }
  });
});

/**
 * `RECONCILIATION_SPEC.md §4.1`, "`C3` and `C4` against a null `settled_at`,
 * ratified at spec 1.4.2".
 *
 * `PREREGISTRATION.md §4.2`'s batch-composition rule emits a settlement member
 * its batch cannot carry with `settled_at: null`. The rule lives here rather
 * than in either implementation because `§5.2` has the engine and the oracle
 * implement one shared declaration and `§5.3`'s consistency gate compares them
 * constraint by constraint — a rule the two sides read from different places is
 * one they can disagree about while both believe they conform.
 */
describe("the null settled_at rule", () => {
  it("attaches to exactly C3 and C4, the two constraints that read the field", () => {
    // C8 alone is written "for members claimed as settled", so §4.1 holds that
    // the silence of C3 and C4 on that point is deliberate and they remain
    // unconditional over members. No other constraint reads settled_at.
    expect([...SETTLED_AT_NULL_CONSTRAINTS]).toEqual(["C3", "C4"]);
  });

  it("gives C3 and C4 the SAME declaration object, not two equal copies", () => {
    // §4.1: "a split treatment would make one null admissible under C3 and not
    // under C4 with nothing to justify the difference." Reference equality makes
    // a split unrepresentable rather than merely absent today.
    const c3 = HARD_CONSTRAINTS.find((c) => c.id === "C3");
    const c4 = HARD_CONSTRAINTS.find((c) => c.id === "C4");
    expect(c3?.settledAtNull).toBe(SETTLED_AT_NULL_RULE);
    expect(c4?.settledAtNull).toBe(SETTLED_AT_NULL_RULE);
  });

  it("leaves every other constraint with no rule rather than a permissive one", () => {
    for (const constraint of HARD_CONSTRAINTS) {
      if (constraint.id === "C3" || constraint.id === "C4") continue;
      expect(constraint.settledAtNull, constraint.id).toBeNull();
    }
  });

  it("declares exclusion, never vacuous satisfaction", () => {
    // §4.1: "effect: exclusion, never admission ... an unconditional filter
    // whose bounded quantity does not exist cannot report that it is within
    // bounds." A verdict of anything else would admit an unsettled member into
    // a candidate, which is the freedom the rule exists to remove.
    expect(SETTLED_AT_NULL_RULE.verdict).toBe("NOT_SATISFIED");
    expect(SETTLED_AT_NULL_RULE.ratified_at_spec).toBe("1.4.2");
    for (const field of ["rule", "applies", "scope", "effect"] as const) {
      expect(SETTLED_AT_NULL_RULE[field].length, field).toBeGreaterThan(40);
    }
  });

  it("is frozen, so neither implementation can soften it at runtime", () => {
    expect(Object.isFrozen(SETTLED_AT_NULL_RULE)).toBe(true);
    expect(() => {
      (SETTLED_AT_NULL_RULE as unknown as { verdict: string }).verdict = "SATISFIED";
    }).toThrow(TypeError);
  });

  it("is inside the hashed declaration, so constraint_set_hash pins it", () => {
    // PREREGISTRATION.md §5.5: a result is only interpretable alongside the
    // exact declaration in force when it was produced. A rule kept beside the
    // serialization rather than inside it would bind both implementations and
    // be pinned by nothing.
    const encoded = canonicalConstraintSet();
    expect(encoded).toContain("NOT_SATISFIED");
    const parsed = JSON.parse(encoded) as { id: string; settledAtNull: unknown }[];
    expect(parsed.filter((c) => c.settledAtNull !== null).map((c) => c.id)).toEqual(["C3", "C4"]);
  });
});

describe("immutability", () => {
  it("is frozen at the top level, so the set cannot be extended at runtime", () => {
    expect(Object.isFrozen(HARD_CONSTRAINTS)).toBe(true);
    expect(() => {
      (HARD_CONSTRAINTS as unknown as unknown[]).push({});
    }).toThrow(TypeError);
    expect(HARD_CONSTRAINTS).toHaveLength(8);
  });

  it("does not expose the array through CONSTRAINT_IDS", () => {
    expect(Object.isFrozen(CONSTRAINT_IDS)).toBe(true);
  });

  it("is frozen all the way down, not just at the top level", () => {
    // Object.freeze is shallow and `as const` has no runtime effect, so a
    // top-level freeze alone leaves every nested object writable. The hash in
    // constraint_set_hash would then stop describing the declaration actually
    // in force. Regression test for a real defect found in review.
    for (const constraint of HARD_CONSTRAINTS) {
      expect(Object.isFrozen(constraint)).toBe(true);
      expect(Object.isFrozen(constraint.provenance)).toBe(true);
      expect(Object.isFrozen(constraint.clauses)).toBe(true);
      for (const clause of constraint.clauses) {
        expect(Object.isFrozen(clause)).toBe(true);
      }
    }
  });

  it("refuses an in-place edit of a nested constraint", () => {
    const before = canonicalConstraintSet();
    expect(() => {
      (HARD_CONSTRAINTS[0] as unknown as { title: string }).title = "TAMPERED";
    }).toThrow(TypeError);
    expect(canonicalConstraintSet()).toBe(before);
  });

  it("refuses an in-place edit of a clause", () => {
    expect(() => {
      (HARD_CONSTRAINTS[1]?.clauses[1] as unknown as {
        agentSideBinding: string;
      }).agentSideBinding = "binding";
    }).toThrow(TypeError);
    expect(nonBindingClauses()).toHaveLength(2);
  });
});

describe("canonical serialization", () => {
  it("is stable across calls, so constraint_set_hash is reproducible", () => {
    // DATA_MODEL.md §18 puts constraint_set_hash in the benchmark manifest.
    expect(canonicalConstraintSet()).toBe(canonicalConstraintSet());
  });

  it("is valid canonical JSON containing every constraint id", () => {
    const encoded = canonicalConstraintSet();
    const parsed: unknown = JSON.parse(encoded);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as { id: string }[]).map((c) => c.id)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
    ]);
    // Canonical form: object keys sorted, no structural whitespace.
    expect(encoded.replace(/"(\\.|[^"\\])*"/g, "")).not.toMatch(/\s/);
  });

  it("changes if the declaration changes, which is the point of hashing it", () => {
    const baseline = canonicalConstraintSet();
    const mutated = JSON.parse(baseline) as { title: string }[];
    const first = mutated[0];
    if (first) first.title = `${first.title} (edited)`;
    expect(JSON.stringify(mutated)).not.toBe(JSON.stringify(JSON.parse(baseline)));
  });
});
