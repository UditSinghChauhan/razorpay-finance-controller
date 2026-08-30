import { EXCEPTION_CLASSES } from "@assay/ledger";
import { describe, expect, it } from "vitest";

import { R1OutputSchema, groundR1, offlineR1 } from "../src/roles/r1.js";
import {
  R2OutputSchema,
  analystQuestion,
  classifyOffline,
  offlineR2,
} from "../src/roles/r2.js";
import { assertNoNumericField } from "../src/verify/schema.js";
import { NARRATION, SHAPES, r1Input, r2Input } from "./fixtures.js";

describe("R1 · parse_bank_narration (ARCHITECTURE §6)", () => {
  it("its schema carries no number-typed field (§L.1 rule 2)", () => {
    expect(() => {
      assertNoNumericField(R1OutputSchema);
    }).not.toThrow();
  });

  it("extracts the generator's UTR from its own narration shape", () => {
    const out = offlineR1(r1Input());
    expect(out.utr_candidates).toContain("1568176960vxp0rj");
    expect(out.counterparty_hint).toBe("RAZORPAY SOFTWARE PVT LTD SETTLEMENT");
  });

  it("handles every narration shape §6 lists, and the truncation of §4.3", () => {
    for (const shape of SHAPES) {
      const out = offlineR1(r1Input(shape));
      expect(groundR1(out, shape).ok).toBe(true);
    }
    expect(offlineR1(r1Input(SHAPES[1] ?? "")).utr_candidates).toContain("RZPX00012345");
    expect(offlineR1(r1Input(SHAPES[2] ?? "")).utr_candidates).toContain("2026081412345");
    expect(offlineR1(r1Input(SHAPES[3] ?? "")).utr_candidates).toContain("RZPX0001");
  });

  it("survives a 35-char truncation with the UTR still recovered", () => {
    const truncated = NARRATION.slice(0, 35);
    const out = offlineR1(r1Input(truncated));
    expect(out.utr_candidates).toContain("1568176960vxp0rj");
  });

  it("returns no counterparty hint for a rail-only narration", () => {
    expect(offlineR1(r1Input("MMT/IMPS/RZP/452310/")).counterparty_hint).toBeNull();
  });

  it("is deterministic — the same narration always yields the same output", () => {
    for (const shape of SHAPES) {
      expect(offlineR1(r1Input(shape))).toEqual(offlineR1(r1Input(shape)));
    }
  });

  it("emits no duplicate candidate", () => {
    const out = offlineR1(r1Input("REF RZPX0001 AND RZPX0001 AGAIN"));
    expect(out.utr_candidates).toEqual(["RZPX0001"]);
  });

  it("is total: an empty narration yields an empty, valid, grounded response", () => {
    const out = offlineR1(r1Input(""));
    expect(R1OutputSchema.safeParse(out).success).toBe(true);
    expect(out.utr_candidates).toEqual([]);
    expect(out.counterparty_hint).toBeNull();
    expect(groundR1(out, "").ok).toBe(true);
  });

  it("grounding rejects a token the narration does not contain", () => {
    const forged = R1OutputSchema.parse({
      utr_candidates: ["RZPX9999"],
      counterparty_hint: null,
      reference_hints: [],
    });
    expect(groundR1(forged, NARRATION).ok).toBe(false);
  });
});

describe("R2 · classify_exception (ARCHITECTURE §6)", () => {
  it("its schema carries no number-typed field (§L.1 rule 2)", () => {
    expect(() => {
      assertNoNumericField(R2OutputSchema);
    }).not.toThrow();
  });

  it("admits all fourteen classes — §15's taxonomy, read from the frozen tuple", () => {
    for (const cls of EXCEPTION_CLASSES) {
      expect(
        R2OutputSchema.safeParse({
          exception_class: cls,
          evidence_obs_ids: [],
          analyst_question: analystQuestion(cls),
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    ["I3 failed", { failed_invariants: ["I3"] }, "E06_FEE_MISMATCH", "I3_LINE_ARITHMETIC"],
    [
      "I4 on a settlement",
      { failed_invariants: ["I4"], target_kind: "settlement" },
      "E01_MISSING_CAPTURE",
      "I4_SETTLEMENT_SHORTFALL",
    ],
    [
      "a refund with no parent",
      { member_kinds: ["refund"], failed_invariants: ["I6"] },
      "E10_REFUND_ORPHAN",
      "REFUND_PARENT_ABSENT",
    ],
    [
      "a ledger entry",
      { member_kinds: ["ledger_entry"] },
      "E13_LEDGER_ONLY",
      "LEDGER_ENTRY_NO_COUNTERPART",
    ],
    ["C4 failed", { failed_constraints: ["C4"] }, "E11_TIMING_BOUNDARY", "TEMPORAL_OUT_OF_WINDOW"],
    [
      "a settlement with no AN2 match",
      { target_kind: "settlement", bank_matched: false },
      "E04_SETTLEMENT_NOT_IN_BANK",
      "SETTLEMENT_NOT_IN_BANK",
    ],
    ["C6 failed", { failed_constraints: ["C6"] }, "E05_AMOUNT_MISMATCH", "C6_TIE_OUT"],
    [
      "an unmatched bank line",
      { target_kind: "bank_line" },
      "E03_BANK_CREDIT_UNMATCHED",
      "BANK_LINE_UNMATCHED",
    ],
    [
      "nothing else, on a settlement",
      { target_kind: "settlement" },
      "E02_MISSING_SETTLEMENT",
      "DEFAULT_BY_TARGET_KIND",
    ],
  ])("classifies %s", (_label, over, expectedClass, expectedRule) => {
    const result = classifyOffline(r2Input(over));
    expect(result.exception_class).toBe(expectedClass);
    expect(result.rule).toBe(expectedRule);
  });

  it("never emits E12 — metric 10 excludes it as a deterministic assignment", () => {
    const shapes = [
      { member_kinds: ["adjustment"] },
      { member_kinds: ["adjustment"], target_kind: null },
      { member_kinds: ["adjustment"], failed_constraints: ["C2"] },
      { target_kind: "adjustment" },
    ];
    for (const over of shapes) {
      expect(classifyOffline(r2Input(over)).exception_class).not.toBe(
        "E12_ADJUSTMENT_UNEXPLAINED",
      );
    }
  });

  it("is deterministic and total over every shape the ladder can see", () => {
    const kinds = [null, "settlement", "bank_line", "ledger_entry"];
    for (const target_kind of kinds) {
      for (const bank_matched of [true, false]) {
        const input = r2Input({ target_kind, bank_matched });
        const first = classifyOffline(input);
        expect(classifyOffline(input)).toEqual(first);
        expect(EXCEPTION_CLASSES).toContain(first.exception_class);
      }
    }
  });

  it("every analyst question is present and carries no numeral", () => {
    for (const cls of EXCEPTION_CLASSES) {
      const question = analystQuestion(cls);
      expect(question.length).toBeGreaterThan(0);
      expect(question).not.toMatch(/\d/);
    }
  });

  it("cites only ids the caller allowlisted, so offline cannot trip check 2", () => {
    const input = r2Input({ amount_refs: ["obs_aaaaaaaaaaaaaa", "obs_bbbbbbbbbbbbbb"] });
    const out = offlineR2(input, ["obs_aaaaaaaaaaaaaa"]);
    expect(out.evidence_obs_ids).toEqual(["obs_aaaaaaaaaaaaaa"]);
  });
});
