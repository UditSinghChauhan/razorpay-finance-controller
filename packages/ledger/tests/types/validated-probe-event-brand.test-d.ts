import { describe, expectTypeOf, it } from "vitest";

import {
  postProbeEvent,
  type EventStamp,
  type LedgerStore,
  type LedgerWriteState,
  type ValidatedDecision,
  type ValidatedProbeEvent,
} from "@assay/ledger";

/**
 * `postProbeEvent` accepts only what `packages/probe` minted — proved at compile
 * time (register row `DATA_MODEL.md §22.2` M65).
 *
 * The same argument `validated-decision-brand.test-d.ts` makes for `S5`: under
 * structural typing *"only packages/probe may construct"* would be a convention
 * unless a non-exported unique-symbol brand makes forging a type error. Each
 * `@ts-expect-error` asserts the line beneath it MUST fail to compile; if the
 * brand is removed or exported, the directive goes unused and this file fails.
 */

declare const state: LedgerWriteState;
declare const stamp: EventStamp;
declare const store: LedgerStore;
declare const inputsHash: ValidatedProbeEvent["inputs_hash"];
declare const decision: ValidatedDecision;

describe("a hand-built PROBE body does not compile", () => {
  it("rejects an object literal carrying every declared field", () => {
    // @ts-expect-error — the non-exported unique-symbol brand cannot be named
    const forged: ValidatedProbeEvent = {
      kind: "PROBE",
      subject_ids: ["setl_aaaaaaaaaaaaaa"],
      evidence_ids: [],
      decision_id: null,
      inputs_hash: inputsHash,
      journal_lines: [],
      certificate: null,
    };
    expectTypeOf(forged).toEqualTypeOf<ValidatedProbeEvent>();
  });

  it("rejects a hand-built body at the entry point itself", () => {
    const parts = {
      kind: "PROBE" as const,
      subject_ids: [],
      evidence_ids: [],
      decision_id: null,
      inputs_hash: inputsHash,
      journal_lines: [] as const,
      certificate: null,
    };
    // @ts-expect-error — postProbeEvent takes only the branded type
    postProbeEvent(state, parts, stamp, store);
  });

  it("does not accept a ValidatedDecision in a probe's place", () => {
    // @ts-expect-error — the decision brand is not the probe brand, and a
    // decision carries money the probe entry point refuses
    postProbeEvent(state, decision, stamp, store);
  });

  it("does not let the brand key be named from outside the module", () => {
    // @ts-expect-error — PROBE_EVENT_BRAND is module-private by construction
    type Brand = import("@assay/ledger").PROBE_EVENT_BRAND;
    expectTypeOf<Brand>().toBeAny();
  });
});

describe("the type carries no money, no certificate and no decision", () => {
  it("journal_lines is the empty tuple", () => {
    expectTypeOf<ValidatedProbeEvent["journal_lines"]>().toEqualTypeOf<readonly []>();
  });

  it("certificate and decision_id are null", () => {
    expectTypeOf<ValidatedProbeEvent["certificate"]>().toEqualTypeOf<null>();
    expectTypeOf<ValidatedProbeEvent["decision_id"]>().toEqualTypeOf<null>();
  });

  it("kind is the literal PROBE", () => {
    expectTypeOf<ValidatedProbeEvent["kind"]>().toEqualTypeOf<"PROBE">();
  });
});
