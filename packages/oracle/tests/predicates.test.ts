import { describe, expect, it } from "vitest";

import { CONSTRAINT_IDS, HARD_CONSTRAINTS } from "@assay/domain";

import {
  checkAll,
  checkC1,
  checkC2,
  checkC3,
  checkC3BankArrival,
  checkC3Ordering,
  checkC4,
  checkC5,
  checkC6,
  checkC7,
  checkC8,
  emptyContext,
  isAdmissible,
  memberContribution,
  targetContribution,
  type Candidate,
  type MemberContribution,
  type TargetContribution,
} from "../src/index.js";
import { DAY, ORDER, PAY, RFND, SETL, T0, reconLine, settlement } from "./fixtures.js";

const member = (o: ReturnType<typeof reconLine>): MemberContribution => {
  const m = memberContribution(o);
  if (m === null) throw new Error("fixture is not member-eligible");
  return m;
};

const target = (amount: number, valueDate: number | null = null): TargetContribution => {
  const t = targetContribution(
    settlement(SETL(1), amount, "UTR000000000001"),
    valueDate === null ? null : { value_date: valueDate, bank_line_id: "bnk_x" },
  );
  if (t === null) throw new Error("fixture is not a target");
  return t;
};

const candidate = (members: MemberContribution[], amount: number, vd: number | null = null): Candidate => ({
  target: target(amount, vd),
  members,
});

describe("C1 — currency equality across members and the target", () => {
  it("is satisfied when every member and the declared target currency agree", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC1(candidate([m], 976))).toBe("SATISFIED");
  });
});

describe("C2 — the refund half, under conventions.ts O-C2-REFUND", () => {
  it("is NON_BINDING on a candidate with no refund member: nothing was tested", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC2(candidate([m], 976), emptyContext())).toBe("NON_BINDING");
  });

  it("is satisfied when a refund's order_id matches the line its payment_id names", () => {
    const r = member(
      reconLine({ entity: RFND(1), type: "refund", amount: 500, order_id: ORDER(1), payment_id: PAY(1) }),
    );
    const ctx = { orderIdByEntity: new Map([[PAY(1), ORDER(1)]]), allocatedEntities: new Set<string>() };
    expect(checkC2(candidate([r], 0), ctx)).toBe("SATISFIED");
  });

  it("is violated when the refund's order_id disagrees with its named parent's", () => {
    const r = member(
      reconLine({ entity: RFND(1), type: "refund", amount: 500, order_id: ORDER(1), payment_id: PAY(1) }),
    );
    const ctx = { orderIdByEntity: new Map([[PAY(1), ORDER(2)]]), allocatedEntities: new Set<string>() };
    expect(checkC2(candidate([r], 0), ctx)).toBe("NOT_SATISFIED");
  });

  it("does not exclude a refund whose named parent is absent — that is E10's business", () => {
    const r = member(
      reconLine({ entity: RFND(1), type: "refund", amount: 500, order_id: ORDER(1), payment_id: PAY(9) }),
    );
    expect(checkC2(candidate([r], 0), emptyContext())).toBe("SATISFIED");
  });
});

describe("C3 — the two halves spec 1.4.3 declares", () => {
  it("ordering half is violated when settled_at precedes created_at", () => {
    const m = member(
      reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, created_at: T0 + DAY, settled_at: T0 }),
    );
    expect(checkC3Ordering(candidate([m], 976))).toBe("NOT_SATISFIED");
  });

  it("ordering half is violated by a null settled_at — §4.1's spec-1.4.2 rule", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, settled_at: null }));
    expect(checkC3Ordering(candidate([m], 976))).toBe("NOT_SATISFIED");
  });

  it("bank-arrival half is NON_BINDING when no bank line is in scope", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC3BankArrival(candidate([m], 976, null))).toBe("NON_BINDING");
  });

  it("bank-arrival half binds hard where a bank line IS in scope", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC3BankArrival(candidate([m], 976, T0 + 2 * DAY + 3600))).toBe("SATISFIED");
    expect(checkC3BankArrival(candidate([m], 976, T0 + DAY))).toBe("NOT_SATISFIED");
  });

  it("combined C3 fails if either half fails", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC3(candidate([m], 976, T0 + DAY))).toBe("NOT_SATISFIED");
  });
});

describe("C4 — the settlement window, in elapsed seconds (O-C4-UNIT)", () => {
  it("admits a gap inside [1, 7] days and rejects either side", () => {
    const inside = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC4(candidate([inside], 976))).toBe("SATISFIED");

    const tooSoon = member(
      reconLine({ entity: PAY(2), type: "payment", amount: 1000, fee: 24, settled_at: T0 + 3600 }),
    );
    expect(checkC4(candidate([tooSoon], 976))).toBe("NOT_SATISFIED");

    const tooLate = member(
      reconLine({ entity: PAY(3), type: "payment", amount: 1000, fee: 24, settled_at: T0 + 8 * DAY }),
    );
    expect(checkC4(candidate([tooLate], 976))).toBe("NOT_SATISFIED");
  });

  it("rejects a null settled_at, identically to C3", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, settled_at: null }));
    expect(checkC4(candidate([m], 976))).toBe("NOT_SATISFIED");
    expect(checkC3Ordering(candidate([m], 976))).toBe("NOT_SATISFIED");
  });
});

describe("C5 — the per-line identity, re-implemented rather than delegated", () => {
  it("holds for a well-formed payment, refund and adjustment row", () => {
    const p = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, tax: 4 }));
    const r = member(reconLine({ entity: RFND(1), type: "refund", amount: 500 }));
    expect(checkC5(candidate([p], 976))).toBe("SATISFIED");
    expect(checkC5(candidate([r], 0))).toBe("SATISFIED");
  });
});

describe("C6 — exact tie-out, zero tolerance", () => {
  it("admits an exact match and rejects a one-paisa miss", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    expect(checkC6(candidate([m], 976))).toBe("SATISFIED");
    expect(checkC6(candidate([m], 977))).toBe("NOT_SATISFIED");
  });

  it("nets a refund's debit against payment credits", () => {
    const p = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    const r = member(reconLine({ entity: RFND(1), type: "refund", amount: 476 }));
    expect(checkC6(candidate([p, r], 500))).toBe("SATISFIED");
  });
});

describe("C7 and C8", () => {
  it("C7 rejects a member already in an accepted allocation", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    const ctx = { orderIdByEntity: new Map<string, string | null>(), allocatedEntities: new Set([PAY(1)]) };
    expect(checkC7(candidate([m], 976), ctx)).toBe("NOT_SATISFIED");
    expect(checkC7(candidate([m], 976), emptyContext())).toBe("SATISFIED");
  });

  it("C8 rejects a held line, and is evaluated rather than skipped", () => {
    const held = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, on_hold: true }));
    expect(checkC8(candidate([held], 976))).toBe("NOT_SATISFIED");
  });
});

describe("checkAll — §5.2's naive contract", () => {
  it("returns a verdict for all eight constraints even when the first already fails", () => {
    // on_hold true fails C8; a null settled_at fails C3 and C4; the amount
    // misses C6. Every constraint must still report.
    const broken = member(
      reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24, settled_at: null, on_hold: true }),
    );
    const verdicts = checkAll(candidate([broken], 12345), emptyContext());
    expect(Object.keys(verdicts).sort()).toEqual([...CONSTRAINT_IDS].sort());
    for (const id of CONSTRAINT_IDS) expect(verdicts[id]).toBeDefined();
    expect(isAdmissible(verdicts)).toBe(false);
  });

  it("covers exactly the eight constraints the shared declaration holds", () => {
    expect(Object.keys(checkAll(candidate([], 0), emptyContext())).sort()).toEqual(
      HARD_CONSTRAINTS.map((c) => c.id).sort(),
    );
  });

  it("treats NON_BINDING as neither a pass nor a failure", () => {
    const m = member(reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 }));
    const verdicts = checkAll(candidate([m], 976, null), emptyContext());
    expect(verdicts.C2).toBe("NON_BINDING");
    expect(isAdmissible(verdicts)).toBe(true);
  });
});
