import { describe, expectTypeOf, it } from "vitest";

import type { InvariantId } from "@assay/domain";

import type { ValidatedDecision } from "@assay/ledger";

/**
 * The brand is the enforcement; this file is the proof that it holds.
 *
 * `ARCHITECTURE.md §4` boundary 3 is explicit that *"only S5 may construct"*
 * cannot be a runtime property: *"TypeScript is structurally typed, so any
 * object with matching fields inhabits a bare interface and 'only S5 may
 * construct' would be a convention rather than a property."* The enforcement is
 * therefore a **non-exported** unique-symbol brand in
 * `packages/ledger/src/validated-decision.ts`, and the only test that can
 * observe it is a compile-time one.
 *
 * Each `@ts-expect-error` asserts that the line beneath it MUST fail to compile.
 * If the brand is ever removed or exported, those lines start compiling,
 * TypeScript reports the directives as unused, and this file fails — the
 * opposite of suppressing an error.
 */

declare const line: ValidatedDecision["journal_lines"][number];
declare const decisionId: ValidatedDecision["decision_id"];
declare const inputsHash: ValidatedDecision["inputs_hash"];
declare const lines: ValidatedDecision["journal_lines"];

describe("the brand cannot be forged by structural typing", () => {
  it("rejects an object literal carrying every declared field", () => {
    // Every non-brand field is present and correctly typed. Under a bare
    // interface this compiles, which is exactly the hole the brand closes.
    // @ts-expect-error — the non-exported unique-symbol brand cannot be named
    const forged: ValidatedDecision = {
      decision_id: decisionId,
      type: "RECONCILED",
      journal_lines: [line],
      invariants_checked: ["I1"],
      invariants_failed: [],
      subject_obs_ids: [],
      evidence_ids: [],
      certificate: null,
      inputs_hash: inputsHash,
    };
    expectTypeOf(forged).toEqualTypeOf<ValidatedDecision>();
  });

  it("rejects an empty object and a cast-free spread", () => {
    // @ts-expect-error — nothing structurally inhabits the branded type
    const empty: ValidatedDecision = {};
    expectTypeOf(empty).toEqualTypeOf<ValidatedDecision>();

    const parts = {
      decision_id: decisionId,
      type: "ABSTAINED" as const,
      journal_lines: [],
      invariants_checked: [],
      invariants_failed: [],
      subject_obs_ids: [],
      evidence_ids: [],
      certificate: null,
      inputs_hash: inputsHash,
    };
    // @ts-expect-error — a spread carries no brand either
    const spread: ValidatedDecision = { ...parts };
    expectTypeOf(spread).toEqualTypeOf<ValidatedDecision>();
  });

  it("does not let the brand key be named from outside the module", () => {
    // If the symbol were exported, this would resolve and the directive would
    // go unused. `ARCHITECTURE.md §4`: ledger "exports no constructor".
    // @ts-expect-error — VALIDATED_BRAND is module-private by construction
    type Brand = import("@assay/ledger").VALIDATED_BRAND;
    expectTypeOf<Brand>().toBeAny();
  });
});

describe("the shape is the one ARCHITECTURE §4 boundary 3 demands", () => {
  it("types the gate result as InvariantId, not ConstraintId", () => {
    // The spec-1.4.9 correction (DATA_MODEL §13, M23), pinned at the type level.
    expectTypeOf<ValidatedDecision["invariants_checked"]>().toEqualTypeOf<
      readonly InvariantId[]
    >();
    expectTypeOf<ValidatedDecision["invariants_failed"]>().toEqualTypeOf<
      readonly InvariantId[]
    >();

    const ok: InvariantId = "I9";
    expectTypeOf(ok).toExtend<InvariantId>();
    // @ts-expect-error — C1..C8 are ConstraintId, a deliberately distinct vocabulary
    const wrong: InvariantId = "C1";
    expectTypeOf(wrong).toExtend<InvariantId>();
  });

  it("reuses the three-member decision union and excludes REFERENCE", () => {
    // DATA_MODEL §13: "A REFERENCE observation produces no Decision at all, so
    // REFERENCE is deliberately NOT a member of this union."
    expectTypeOf<ValidatedDecision["type"]>().toEqualTypeOf<
      "RECONCILED" | "ABSTAINED" | "EXCEPTION"
    >();
    // @ts-expect-error — REFERENCE is an ObservationState, never a decision type
    const wrong: ValidatedDecision["type"] = "REFERENCE";
    expectTypeOf(wrong).toEqualTypeOf<ValidatedDecision["type"]>();
  });

  it("carries every field the boundary enumerates", () => {
    type Required =
      | "decision_id"
      | "type"
      | "journal_lines"
      | "invariants_checked"
      | "invariants_failed"
      | "subject_obs_ids"
      | "evidence_ids"
      | "certificate"
      | "inputs_hash";
    expectTypeOf<Required>().toExtend<keyof ValidatedDecision>();
  });

  it("is read-only across the boundary", () => {
    // @ts-expect-error — push does not exist on a readonly array
    lines.push(line);
    // A mutable array is not assignable back through the boundary's field type.
    expectTypeOf<ValidatedDecision["journal_lines"]>().not.toEqualTypeOf<
      (typeof line)[]
    >();
  });
});
