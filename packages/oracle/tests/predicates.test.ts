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
  oracleContext,
  targetContribution,
  type Candidate,
  type MemberContribution,
  type TargetContribution,
} from "../src/index.js";
import { DAY, ORDER, PAY, RFND, SETL, T0, payment, reconLine, settlement } from "./fixtures.js";

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

  it("evaluates the EMPTY member set, satisfied only by a zero-amount target", () => {
    // `Σ` over `∅` is `0`, so the clause is evaluable and excludes wherever the
    // target is non-zero. This module's reading was already correct; the pin is
    // here because `packages/engine` was corrected TO it (its `c6` had returned
    // NOT_EVALUATED on this input, excluding nothing), and a differential
    // finding must never be closed by relaxing the side that was right.
    //
    // `§4.1` reserves "not evaluated" for an absent COMPARAND — its sole use is
    // C2's refund half — and C6's comparand is `target.amount`, non-nullable.
    expect(checkC6(candidate([], 976))).toBe("NOT_SATISFIED");
    expect(checkC6(candidate([], 0))).toBe("SATISFIED");
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

describe("oracleContext — §4.1's declared referent set for C2", () => {
  it("reads a payment's order_id from its recon line", () => {
    const parent = reconLine({
      entity: PAY(1),
      type: "payment",
      amount: 1000,
      fee: 24,
      order_id: ORDER(1),
    });
    const ctx = oracleContext([parent]);
    expect(ctx.orderIdByEntity.get(PAY(1))).toBe(ORDER(1));
  });

  it("falls back to the payment OBSERVATION when no recon line carries it (F05's shape)", () => {
    // §4.2's F05 withholds the constituent recon line while the payment
    // observation survives, so this view is the only one available on exactly
    // the rows F05 degrades. A builder that read recon lines alone would leave
    // C2 unevaluated there while the engine evaluated it.
    const ctx = oracleContext([payment(PAY(2), 1000, ORDER(2))]);
    expect(ctx.orderIdByEntity.has(PAY(2))).toBe(true);
    expect(ctx.orderIdByEntity.get(PAY(2))).toBe(ORDER(2));
  });

  it("lets the recon_line GOVERN where both views are present (§4.1, M22)", () => {
    const parent = reconLine({
      entity: PAY(3),
      type: "payment",
      amount: 1000,
      fee: 24,
      order_id: ORDER(3),
    });
    const disagreeing = payment(PAY(3), 1000, ORDER(4));
    // Both orderings of the input must give the recon line's answer, or the
    // precedence would be an accident of array order rather than a rule.
    expect(oracleContext([parent, disagreeing]).orderIdByEntity.get(PAY(3))).toBe(ORDER(3));
    expect(oracleContext([disagreeing, parent]).orderIdByEntity.get(PAY(3))).toBe(ORDER(3));
  });

  it("omits an identifier no observation names, so C2 stays unevaluated (E10's business)", () => {
    expect(oracleContext([]).orderIdByEntity.has(PAY(9))).toBe(false);
  });

  it("keys only on payment rows: a refund row does not answer for a payment", () => {
    const refundRow = reconLine({
      entity: RFND(1),
      type: "refund",
      amount: 500,
      order_id: ORDER(5),
      payment_id: PAY(5),
    });
    const ctx = oracleContext([refundRow]);
    expect(ctx.orderIdByEntity.has(PAY(5))).toBe(false);
    expect(ctx.orderIdByEntity.has(RFND(1))).toBe(false);
  });

  it("carries C7's allocated set through, and copies it", () => {
    const allocated = new Set([PAY(1)]);
    const ctx = oracleContext([], allocated);
    allocated.add(PAY(2));
    expect(ctx.allocatedEntities.has(PAY(1))).toBe(true);
    expect(ctx.allocatedEntities.has(PAY(2))).toBe(false);
  });

  it("makes C2 BIND on a refund whose parent survives only as a payment observation", () => {
    // The end-to-end consequence of the fallback: without it this candidate's
    // C2 verdict is NON_BINDING and the engine's is FAIL, which is exactly the
    // divergence §5.3's consistency gate exists to name.
    const refundRow = reconLine({
      entity: RFND(2),
      type: "refund",
      amount: 500,
      order_id: ORDER(7),
      payment_id: PAY(7),
    });
    const ctx = oracleContext([payment(PAY(7), 1000, ORDER(8))]);
    expect(checkC2(candidate([member(refundRow)], 500), ctx)).toBe("NOT_SATISFIED");
    expect(checkC2(candidate([member(refundRow)], 500), emptyContext())).toBe("SATISFIED");
  });
});
