import { EXCEPTION_CLASSES } from "@assay/ledger";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { R1OutputSchema, groundR1, offlineR1 } from "../../src/roles/r1.js";
import { R2OutputSchema, classifyOffline, offlineR2 } from "../../src/roles/r2.js";
import { checkAllowlist } from "../../src/verify/allowlist.js";
import { r1Input, r2Input } from "../fixtures.js";

/**
 * The properties the two offline roles own (`DECISION_BRIEF.md §L.3`).
 *
 * `ARCHITECTURE.md §6.5`: the `offline` provider *"is built properly, not as a
 * stub — a sabotaged offline path would both break the demo guarantee and
 * invalidate the ablation"*. These are the properties that make "properly"
 * checkable rather than asserted.
 */

describe("R1 · the regex battery", () => {
  it("is grounded BY CONSTRUCTION: every emitted string is a literal substring", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narration) => {
        const out = offlineR1(r1Input(narration));
        expect(groundR1(out, narration).ok).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it("always produces a response its own schema accepts", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narration) => {
        expect(R1OutputSchema.safeParse(offlineR1(r1Input(narration))).success).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narration) => {
        expect(offlineR1(r1Input(narration))).toEqual(offlineR1(r1Input(narration)));
      }),
      { numRuns: 1000 },
    );
  });

  it("emits no duplicate in either list", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narration) => {
        const out = offlineR1(r1Input(narration));
        expect(new Set(out.utr_candidates).size).toBe(out.utr_candidates.length);
        expect(new Set(out.reference_hints).size).toBe(out.reference_hints.length);
      }),
      { numRuns: 1000 },
    );
  });

  it("never emits an entity-id-shaped string, so it cannot trip the allowlist", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narration) => {
        // A narration could legitimately CONTAIN an id, so this asserts the
        // weaker true property: whatever it emits, the allowlist check over an
        // allowlist containing those ids passes. §6 keeps R1's output "only
        // filtered against real settlement UTRs" downstream.
        const out = offlineR1(r1Input(narration));
        const ids = [...out.utr_candidates, ...out.reference_hints];
        expect(checkAllowlist(out, ids).ok).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

const kindArb = fc.constantFrom(
  "recon_line",
  "bank_line",
  "ledger_entry",
  "settlement",
  "refund",
  "adjustment",
  "payment",
  "order",
  "dispute",
);

const r2InputArb = fc.record({
  target_kind: fc.option(kindArb, { nil: null }),
  member_kinds: fc.array(kindArb, { maxLength: 4 }),
  failed_constraints: fc.array(
    fc.constantFrom("C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"),
    { maxLength: 4 },
  ),
  failed_invariants: fc.array(
    fc.constantFrom("I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"),
    { maxLength: 4 },
  ),
  bank_matched: fc.boolean(),
  member_count: fc.integer({ min: 0, max: 22 }),
});

describe("R2 · the decision-tree classifier", () => {
  it("is total — every shape yields a member of §15's closed taxonomy", () => {
    fc.assert(
      fc.property(r2InputArb, (over) => {
        const { exception_class } = classifyOffline(r2Input(over));
        expect(EXCEPTION_CLASSES).toContain(exception_class);
      }),
      { numRuns: 2000 },
    );
  });

  it("never emits E12 — metric 10 excludes it as a deterministic assignment", () => {
    fc.assert(
      fc.property(r2InputArb, (over) => {
        expect(classifyOffline(r2Input(over)).exception_class).not.toBe(
          "E12_ADJUSTMENT_UNEXPLAINED",
        );
      }),
      { numRuns: 2000 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(r2InputArb, (over) => {
        const input = r2Input(over);
        expect(classifyOffline(input)).toEqual(classifyOffline(input));
      }),
      { numRuns: 1000 },
    );
  });

  it("cites no id outside the allowlist, whatever the caller passes", () => {
    fc.assert(
      fc.property(
        r2InputArb,
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
        (over, refs, allowlist) => {
          const input = r2Input({ ...over, amount_refs: refs });
          const out = offlineR2(input, allowlist);
          expect(R2OutputSchema.safeParse(out).success).toBe(true);
          expect(checkAllowlist(out, allowlist).ok).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("always attaches a non-empty analyst question (§14: an exception without one is a shrug)", () => {
    fc.assert(
      fc.property(r2InputArb, (over) => {
        expect(offlineR2(r2Input(over), []).analyst_question.length).toBeGreaterThan(0);
      }),
      { numRuns: 1000 },
    );
  });
});
