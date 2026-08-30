import { describe, expectTypeOf, it } from "vitest";

import type { ProbeCallProposal, ValidatedProbeCall } from "../../src/call.js";
import type { ProbeLoopState } from "../../src/loop.js";
import type { SolveInput } from "@assay/engine";

/**
 * The brand is a compile-time property, so it needs a compile-time test.
 *
 * `ARCHITECTURE.md §4` boundary 3 makes the same argument for
 * `ValidatedDecision`: under structural typing, *"only the loop may construct"*
 * is a convention unless a non-exported unique symbol makes forging a type error.
 */
describe("a probe call cannot be forged", () => {
  it("a bare proposal is not a ValidatedProbeCall", () => {
    expectTypeOf<ProbeCallProposal>().not.toExtend<ValidatedProbeCall>();
  });

  it("an object literal with every visible field is still not one", () => {
    expectTypeOf<{
      readonly probe: "fetch_payment";
      readonly payment_id: string;
    }>().not.toExtend<ValidatedProbeCall>();
  });

  it("a validated call IS a proposal — validation adds, never replaces", () => {
    expectTypeOf<ValidatedProbeCall>().toExtend<ProbeCallProposal>();
  });
});

describe("the S4 handoff is type-exact", () => {
  it("accumulated reports are assignable to SolveInput['recon_reports']", () => {
    expectTypeOf<ProbeLoopState["reports"]>().toExtend<SolveInput["recon_reports"]>();
  });

  it("attempts are assignable to SolveInput['probe_attempts']", () => {
    expectTypeOf<ProbeLoopState["attempts"]>().toExtend<SolveInput["probe_attempts"]>();
  });
});
