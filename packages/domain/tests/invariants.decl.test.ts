import { describe, expect, it } from "vitest";

import {
  CONSTRAINT_IDS,
  INVARIANT_IDS,
  isInvariantId,
  type ConstraintId,
  type InvariantId,
} from "@assay/domain";

/**
 * `I1`–`I9`, and the separation from `C1`–`C8` that spec 1.4.9 exists to state.
 *
 * `DATA_MODEL.md §13` typed `Decision.invariants_checked` / `invariants_failed`
 * as `ConstraintId[]` through spec 1.4.8, while the only stage that populates
 * them — `RECONCILIATION_SPEC.md §7`'s S5 gate — evaluates `I1`–`I9`. The
 * amendment supplies the missing type and keeps the two vocabularies apart.
 * These tests pin both halves: that `InvariantId` is exactly the gate, and that
 * `ConstraintId` did not move while it was being added.
 *
 * Naming: this file is the declaration's test, alongside
 * `constraints.decl.test.ts`. `invariants.test.ts` is a different subject — the
 * per-entity **ingest** invariants of `DATA_MODEL.md §2`–`§9`, which `§2` step 2
 * routes to `E05`/`E06`/`E07` and which have nothing to do with `§7`'s gate.
 */

describe("InvariantId is exactly RECONCILIATION_SPEC §7's nine", () => {
  it("has nine members, I1 through I9, in the specification's order", () => {
    expect(INVARIANT_IDS).toEqual(["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"]);
  });

  it("keeps the runtime list and the union in step", () => {
    // The union is written literally in the module, so nothing derives one from
    // the other; a member added to either alone must fail here.
    const fromUnion: InvariantId[] = ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"];
    expect([...INVARIANT_IDS]).toEqual(fromUnion);
    for (const id of INVARIANT_IDS) expect(isInvariantId(id)).toBe(true);
  });

  it("is frozen, so no consumer can widen the gate in place", () => {
    expect(Object.isFrozen(INVARIANT_IDS)).toBe(true);
  });

  it("rejects anything outside the gate", () => {
    for (const id of CONSTRAINT_IDS) expect(isInvariantId(id)).toBe(false);
    for (const value of ["I0", "I10", "i1", "", "I", "1"]) {
      expect(isInvariantId(value)).toBe(false);
    }
  });
});

describe("the two vocabularies stay distinct (DATA_MODEL §13, spec 1.4.9)", () => {
  it("ConstraintId remains exactly C1–C8 — the amendment moved nothing here", () => {
    expect(CONSTRAINT_IDS).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);
  });

  it("shares no member in either direction", () => {
    const constraints = new Set<string>(CONSTRAINT_IDS);
    const invariants = new Set<string>(INVARIANT_IDS);
    for (const id of invariants) expect(constraints.has(id)).toBe(false);
    for (const id of constraints) expect(invariants.has(id)).toBe(false);
    // Neither is a subset of the other, which is the property §13 states in
    // terms and which a future "unify the id types" refactor would break.
    expect(constraints.size).toBe(8);
    expect(invariants.size).toBe(9);
  });

  it("does not let a ConstraintId satisfy InvariantId at the type level", () => {
    const c: ConstraintId = "C1";
    // A runtime guard is the only bridge, and it refuses.
    expect(isInvariantId(c)).toBe(false);
  });
});
