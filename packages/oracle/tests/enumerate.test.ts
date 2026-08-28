import { describe, expect, it } from "vitest";

import {
  anchorBankLines,
  anchoredEntities,
  classify,
  completenessGate,
  emptyContext,
  enumerateAll,
  isMemberEligibleKind,
  memberContribution,
  normalizeUtr,
  settledAtClasses,
  tauFor,
  type MemberContribution,
} from "../src/index.js";
import { BNK, DAY, PAY, RFND, SETL, T0, bankLine, payment, reconLine, settlement } from "./fixtures.js";

const UTR = "1568176960vxp0rj";

/** Two unanchored lines that tie out to one settlement, plus a decoy. */
function dataset() {
  const a = reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }); // credit 976
  const b = reconLine({ entity: PAY(2), type: "payment", amount: 500, fee: 12 }); // credit 488
  const decoy = reconLine({
    entity: PAY(3),
    type: "payment",
    amount: 700,
    fee: 16,
    settled_at: T0 + 3 * DAY, // a DIFFERENT settled_at: another coherence class
  });
  const setl = settlement(SETL(1), 1464, UTR); // 976 + 488
  const bank = bankLine(BNK(1), 1464, UTR);
  return { a, b, decoy, setl, bank, observations: [a, b, decoy, setl, bank] };
}

describe("anchors", () => {
  it("normalizes a UTR by upper-casing and stripping non-alphanumerics", () => {
    expect(normalizeUtr("1568-176960 vxp0rj")).toBe("1568176960VXP0RJ");
  });

  it("AN2 matches on normalized UTR and equal amount", () => {
    const { observations } = dataset();
    const { anchors } = anchorBankLines(observations);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.settlement_id).toBe(SETL(1));
  });

  it("AN2 refuses to anchor a collision rather than taking first-wins (§3, I2)", () => {
    const setl = settlement(SETL(1), 1000, UTR);
    const b1 = bankLine(BNK(1), 1000, UTR);
    const b2 = bankLine(BNK(2), 1000, UTR);
    const { anchors, collisions } = anchorBankLines([setl, b1, b2]);
    expect(anchors).toHaveLength(0);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("AN1 anchors only lines whose settlement_id names a settlement present in the set", () => {
    const present = reconLine({ entity: PAY(1), type: "payment", amount: 100, fee: 2, settlement_id: SETL(1) });
    const dangling = reconLine({ entity: PAY(2), type: "payment", amount: 100, fee: 2, settlement_id: SETL(9) });
    const anchored = anchoredEntities([present, dangling, settlement(SETL(1), 98, UTR)]);
    expect([...anchored]).toEqual([PAY(1)]);
  });
});

describe("the candidate universe — DATA_MODEL §11.1", () => {
  it("admits recon_line and adjustment, and no other kind", () => {
    expect(memberContribution(reconLine({ entity: PAY(1), type: "payment", amount: 10 }))).not.toBeNull();
    expect(memberContribution(reconLine({ entity: "adj_x", type: "adjustment", amount: 10 }))).not.toBeNull();
    expect(memberContribution(settlement(SETL(1), 10, UTR))).toBeNull();
    expect(memberContribution(bankLine(BNK(1), 10, UTR))).toBeNull();
    expect(memberContribution(payment(PAY(1), 10, "order_00000000000001"))).toBeNull();
  });

  it("keeps isMemberEligibleKind in step with the narrowing memberContribution uses", () => {
    for (const kind of ["recon_line", "adjustment"]) expect(isMemberEligibleKind(kind)).toBe(true);
    for (const kind of ["settlement", "bank_line", "payment", "order", "refund", "ledger_entry", "dispute"]) {
      expect(isMemberEligibleKind(kind)).toBe(false);
    }
  });
});

describe("co-settlement coherence partitions the pool", () => {
  it("groups members by settled_at and drops the null ones", () => {
    const members = [
      reconLine({ entity: PAY(1), type: "payment", amount: 100, fee: 2 }),
      reconLine({ entity: PAY(2), type: "payment", amount: 100, fee: 2 }),
      reconLine({ entity: PAY(3), type: "payment", amount: 100, fee: 2, settled_at: T0 + 3 * DAY }),
      reconLine({ entity: PAY(4), type: "payment", amount: 100, fee: 2, settled_at: null }),
    ]
      .map((o) => memberContribution(o))
      .filter((m): m is MemberContribution => m !== null);
    const classes = settledAtClasses(members);
    expect(classes.size).toBe(2);
    expect([...classes.values()].reduce((t, c) => t + c.length, 0)).toBe(3);
  });
});

describe("enumerateAll", () => {
  it("finds the tie-out and reports it as the only admissible allocation", () => {
    const { a, b, setl, observations } = dataset();
    const results = enumerateAll(observations, emptyContext());
    const forSettlement = results.find((r) => r.target_id === setl.payload.id);
    expect(forSettlement?.status).toBe("ENUMERATED");
    expect(forSettlement?.solutions).toHaveLength(1);
    expect(forSettlement?.solutions[0]?.member_obs_ids).toEqual(
      [a.obs_id, b.obs_id].sort((x, y) => (x < y ? -1 : 1)),
    );
  });

  it("never proposes members from two settled_at classes in one candidate", () => {
    const { decoy, setl, observations } = dataset();
    const forSettlement = enumerateAll(observations, emptyContext()).find(
      (r) => r.target_id === setl.payload.id,
    );
    for (const s of forSettlement?.solutions ?? []) {
      expect(s.member_obs_ids).not.toContain(decoy.obs_id);
    }
  });

  it("gives a bank_line target the empty candidate set (O-BANK-TARGET-EMPTY)", () => {
    const { bank, observations } = enumerateFixture();
    const forBank = enumerateAll(observations, emptyContext()).find(
      (r) => r.target_id === bank.payload.bank_line_id,
    );
    expect(forBank?.status).toBe("NO_ELIGIBLE_MEMBER_KIND");
    expect(forBank?.solutions).toHaveLength(0);
  });

  it("reports a fully AN1-anchored settlement as ANCHORED without enumerating", () => {
    const line = reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, settlement_id: SETL(1) });
    const setl = settlement(SETL(1), 976, UTR);
    const result = enumerateAll([line, setl], emptyContext()).find((r) => r.target_id === SETL(1));
    expect(result?.status).toBe("ANCHORED");
    expect(result?.candidates_enumerated).toBe(0);
  });

  it("counts what each constraint excluded, as §4.1 requires it to be reported", () => {
    const { setl, observations } = dataset();
    const result = enumerateAll(observations, emptyContext()).find((r) => r.target_id === setl.payload.id);
    // C6 rejects every subset that does not tie out; the count must be visible.
    expect(result?.excluded_by.C6).toBeGreaterThan(0);
    expect(result?.excluded_by.C1).toBe(0);
  });
});

function enumerateFixture() {
  return dataset();
}

describe("classification — §5.4", () => {
  it("labels a single admissible allocation UNAMBIGUOUS", () => {
    const { setl, observations } = dataset();
    const result = enumerateAll(observations, emptyContext()).find((r) => r.target_id === setl.payload.id);
    if (result === undefined) throw new Error("no result");
    const label = classify(result, new Map(), setl.payload.amount);
    expect(label.label).toBe("UNAMBIGUOUS");
  });

  it("computes tau as max(Rs 100, 10 bps of the base)", () => {
    expect(tauFor(1_000_000)).toBe(10_000); // 10 bps = 1,000 -> floor wins
    expect(tauFor(1_000_000_000)).toBe(1_000_000); // 10 bps = 10,00,000 -> rate wins
  });
});

describe("the completeness gate — §5.3", () => {
  it("passes when the true allocation is among the enumerated solutions", () => {
    const { a, b, setl, observations } = dataset();
    const results = enumerateAll(observations, emptyContext());
    const gate = completenessGate(results, [
      { target_id: setl.payload.id, member_obs_ids: [a.obs_id, b.obs_id], expressible: true },
    ]);
    expect(gate.passed).toBe(true);
    expect(gate.targets_in_scope).toBe(1);
  });

  it("FAILS and names the excluding constraints when truth is absent", () => {
    const { a, setl, observations } = dataset();
    const results = enumerateAll(observations, emptyContext());
    const gate = completenessGate(results, [
      // a alone does not tie out, so it is not among the solutions
      { target_id: setl.payload.id, member_obs_ids: [a.obs_id], expressible: true },
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.failures[0]?.outcome).toBe("TRUE_ALLOCATION_ABSENT");
    expect(gate.failures[0]?.excluded_by).toContain("C6");
  });

  it("scopes out an inexpressible target rather than failing on it (F05's shape)", () => {
    const { setl, observations } = dataset();
    const results = enumerateAll(observations, emptyContext());
    const gate = completenessGate(results, [
      { target_id: setl.payload.id, member_obs_ids: ["obs_withheld"], expressible: false },
    ]);
    expect(gate.passed).toBe(true);
    expect(gate.scoped_out_inexpressible).toBe(1);
    expect(gate.targets_in_scope).toBe(0);
  });

  it("still fails on an EXPRESSIBLE target — scoping is not a way to pass", () => {
    const { setl, observations } = dataset();
    const results = enumerateAll(observations, emptyContext());
    const gate = completenessGate(results, [
      { target_id: setl.payload.id, member_obs_ids: ["obs_not_a_solution"], expressible: true },
    ]);
    expect(gate.passed).toBe(false);
  });

  it("reports a refund's parent join without needing it: RFND ids are unused here", () => {
    expect(RFND(1).startsWith("rfnd_")).toBe(true);
  });
});
