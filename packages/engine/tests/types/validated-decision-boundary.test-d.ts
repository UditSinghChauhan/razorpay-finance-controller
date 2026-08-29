import { describe, expectTypeOf, it } from "vitest";

import type { ValidatedDecision } from "@assay/ledger";

import { validate, type ValidationResult } from "@assay/engine";

/**
 * The brand boundary, from the engine's side.
 *
 * `packages/ledger` already proves the brand cannot be forged structurally.
 * This file proves the complementary property: **`S5`'s result is the only way
 * this package hands one out**, and the failure arm carries no decision at all.
 *
 * `ARCHITECTURE.md §4` boundary 3: *"only S5 may construct"* cannot be a runtime
 * property, so each `@ts-expect-error` below asserts the line beneath it MUST
 * fail to compile. If the brand is ever exported or a constructor added, those
 * lines start compiling, TypeScript reports the directives as unused, and this
 * file fails.
 */

declare const result: ValidationResult;

describe("the engine exposes no way to mint a ValidatedDecision", () => {
  it("has no constructor, factory or minting helper", async () => {
    const engine = await import("@assay/engine");
    // @ts-expect-error — there is no mintValidatedDecision
    void engine.mintValidatedDecision;
    // @ts-expect-error — there is no createValidatedDecision
    void engine.createValidatedDecision;
    // @ts-expect-error — there is no asValidatedDecision
    void engine.asValidatedDecision;
    // @ts-expect-error — the brand symbol is module-private in packages/ledger
    void engine.VALIDATED_BRAND;
  });

  it("cannot be forged from a literal, even with every field present", () => {
    // @ts-expect-error — the non-exported unique-symbol brand cannot be named
    const forged: ValidatedDecision = {
      decision_id: result.valid ? result.decision.decision_id : ("x" as never),
      type: "RECONCILED",
      journal_lines: [],
      invariants_checked: [],
      invariants_failed: [],
      subject_obs_ids: [],
      evidence_ids: [],
      certificate: null,
      inputs_hash: "a" as never,
    };
    expectTypeOf(forged).toEqualTypeOf<ValidatedDecision>();
  });
});

describe("the failure arm carries no decision", () => {
  it("does not expose `decision` unless `valid` is true", () => {
    if (result.valid) {
      expectTypeOf(result.decision).toEqualTypeOf<ValidatedDecision>();
    } else {
      // @ts-expect-error — the invalid arm has no `decision` property at all
      void result.decision;
    }
  });

  it("types validate's return as the union, never the bare decision", () => {
    expectTypeOf(validate).returns.toEqualTypeOf<ValidationResult>();
    expectTypeOf(validate).returns.not.toEqualTypeOf<ValidatedDecision>();
  });
});
