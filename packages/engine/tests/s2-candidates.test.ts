import { describe, expect, it } from "vitest";

import { CONSTRAINT_IDS, canonicalConstraintSet } from "@assay/domain";
import {
  SETTLEMENT_WINDOW,
  evaluate,
  generateCandidates,
  parentOrderIdResolver,
  type EvaluationContext,
  type Member,
  type Target,
} from "@assay/engine";

import { adjustment, obsId, payment, reconLine } from "./fixtures.js";

/**
 * Stage `S2` (`RECONCILIATION_SPEC.md §4`).
 *
 * **Expectations are stated independently, never by calling the oracle.** Each
 * test writes what `§4.1` requires and asserts the engine's own verdict against
 * it; `PREREGISTRATION.md §5.3`'s consistency gate is what compares the two
 * implementations, and it is worth nothing if the tests on either side are
 * borrowed from the other.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;

function ctxFor(
  opts: {
    amount?: number;
    kind?: "settlement" | "bank_line";
    bankValueDate?: number | null;
    anchored?: readonly Member[];
    allocated?: readonly string[];
    observations?: readonly Parameters<typeof parentOrderIdResolver>[0][number][];
  } = {},
): EvaluationContext {
  const target: Target = {
    obs_id: obsId(999),
    kind: opts.kind ?? "settlement",
    amount: opts.amount ?? 98_000,
    bank_value_date: opts.bankValueDate ?? null,
    anchored_members: opts.anchored ?? [],
  };
  return {
    target,
    parentOrderId: parentOrderIdResolver(opts.observations ?? []),
    allocated: new Set((opts.allocated ?? []) as never[]),
  };
}

const verdictOf = (a: ReturnType<typeof evaluate>, id: string, half: string | null) =>
  a.clauses.find((c) => c.id === id && c.half === half)?.verdict;

describe("the constraint set did not move", () => {
  it("still hashes to f0c93b5f...", async () => {
    // AL3 freezes C1-C8. S2 implements them; it may not restate them.
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256")
      .update(canonicalConstraintSet(), "utf8")
      .digest("hex");
    expect(hash).toBe(
      "f0c93b5f6a5ffd583c6619a8eaf4d44099718fdf39b28bf61588a887a02f0c1b",
    );
    expect(CONSTRAINT_IDS).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);
  });
});

describe("C1 — currency equality across members and the target", () => {
  it("passes on INR and fails on anything else", () => {
    const ok = reconLine(1, { settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([ok], ctxFor()), "C1", null)).toBe("PASS");

    const bad = reconLine(2, { settledAt: T0 + 2 * DAY });
    const mutated = {
      ...bad,
      payload: { ...bad.payload, currency: "USD" },
    } as unknown as Member;
    expect(verdictOf(evaluate([mutated], ctxFor()), "C1", null)).toBe("FAIL");
  });
});

describe("C2 refund half — referential, spec 1.4.8", () => {
  const refund = (n: number, opts: { orderId: string; parentId: string | null }) =>
    reconLine(n, {
      type: "refund",
      settledAt: T0 + 2 * DAY,
      orderId: opts.orderId,
      paymentId: opts.parentId,
    });

  it("PASSES when the refund's order_id equals the named payment's", () => {
    const parent = reconLine(10, { entityId: "pay_aaaaaaaaaaaaaa", orderId: "order_X" });
    const r = refund(1, { orderId: "order_X", parentId: "pay_aaaaaaaaaaaaaa" });
    const a = evaluate([r], ctxFor({ observations: [parent] }));
    expect(verdictOf(a, "C2", "refund")).toBe("PASS");
  });

  it("FAILS when they disagree", () => {
    const parent = reconLine(10, { entityId: "pay_aaaaaaaaaaaaaa", orderId: "order_X" });
    const r = refund(1, { orderId: "order_Y", parentId: "pay_aaaaaaaaaaaaaa" });
    expect(verdictOf(evaluate([r], ctxFor({ observations: [parent] })), "C2", "refund")).toBe(
      "FAIL",
    );
  });

  it("is NOT_EVALUATED when the parent payment is absent — that is E10, not a C2 exclusion", () => {
    const r = refund(1, { orderId: "order_X", parentId: "pay_zzzzzzzzzzzzzz" });
    const a = evaluate([r], ctxFor({ observations: [] }));
    expect(verdictOf(a, "C2", "refund")).toBe("NOT_EVALUATED");
    expect(a.failed).not.toContain("C2");
  });

  it("does NOT require the parent to be a co-member", () => {
    // The refuted co-membership reading would exclude every refund-carrying
    // true allocation and fail the completeness gate (§4.1's own argument).
    const parent = reconLine(10, { entityId: "pay_aaaaaaaaaaaaaa", orderId: "order_X" });
    const r = refund(1, { orderId: "order_X", parentId: "pay_aaaaaaaaaaaaaa" });
    const a = evaluate([r], ctxFor({ observations: [parent, r] }));
    expect(verdictOf(a, "C2", "refund")).toBe("PASS");
    expect(a.failed).not.toContain("C2");
  });

  it("lets the recon_line govern over a disagreeing payment observation (M22)", () => {
    const asReconLine = reconLine(10, {
      entityId: "pay_aaaaaaaaaaaaaa",
      orderId: "order_FROM_RECON",
    });
    const asPayment = payment(11, {
      id: "pay_aaaaaaaaaaaaaa",
      orderId: "order_FROM_PAYMENTS",
    });
    const r = refund(1, { orderId: "order_FROM_RECON", parentId: "pay_aaaaaaaaaaaaaa" });
    // Both present, and they disagree. The recon_line governs => PASS.
    const a = evaluate([r], ctxFor({ observations: [asPayment, asReconLine] }));
    expect(verdictOf(a, "C2", "refund")).toBe("PASS");

    // The reverse proves the precedence is real rather than incidental.
    const r2 = refund(2, {
      orderId: "order_FROM_PAYMENTS",
      parentId: "pay_aaaaaaaaaaaaaa",
    });
    expect(
      verdictOf(evaluate([r2], ctxFor({ observations: [asPayment, asReconLine] })), "C2", "refund"),
    ).toBe("FAIL");
  });

  it("falls back to the payment observation when no recon_line carries the id", () => {
    const asPayment = payment(11, { id: "pay_bbbbbbbbbbbbbb", orderId: "order_P" });
    const r = refund(1, { orderId: "order_P", parentId: "pay_bbbbbbbbbbbbbb" });
    expect(
      verdictOf(evaluate([r], ctxFor({ observations: [asPayment] })), "C2", "refund"),
    ).toBe("PASS");
  });
});

describe("C2 adjustment half — expected-non-binding, unevaluable", () => {
  it("is always NON_BINDING and never contributes a failure", () => {
    // related_entity_id lives on the true-state Adjustment entity, which
    // DATA_MODEL.md §10 never makes an observation.
    const a = evaluate([adjustment(1, { settledAt: T0 + 2 * DAY })], ctxFor());
    const clause = a.clauses.find((c) => c.id === "C2" && c.half === "adjustment");
    expect(clause?.verdict).toBe("NON_BINDING");
    expect(clause?.expectedNonBinding).toBe(true);
    expect(a.failed).not.toContain("C2");
  });
});

describe("C3 — two halves since spec 1.4.3", () => {
  it("ordering half binds unconditionally: created_at <= settled_at", () => {
    const good = reconLine(1, { createdAt: T0, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([good], ctxFor()), "C3", "ordering")).toBe("PASS");

    const inverted = reconLine(2, { createdAt: T0 + 2 * DAY, settledAt: T0 });
    expect(verdictOf(evaluate([inverted], ctxFor()), "C3", "ordering")).toBe("FAIL");
  });

  it("ordering half FAILS on a null settled_at — spec 1.4.2", () => {
    const unsettled = reconLine(3, { settledAt: null });
    const a = evaluate([unsettled], ctxFor());
    expect(verdictOf(a, "C3", "ordering")).toBe("FAIL");
    expect(a.failed).toContain("C3");
  });

  it("bank-arrival half is NON_BINDING with no bank line in scope, PER TARGET", () => {
    const m = reconLine(1, { settledAt: T0 + 2 * DAY });
    const a = evaluate([m], ctxFor({ bankValueDate: null }));
    expect(verdictOf(a, "C3", "bank-arrival")).toBe("NON_BINDING");
    expect(a.admissible || a.failed.length > 0).toBe(true);
    expect(a.failed).not.toContain("C3");
  });

  it("bank-arrival half BINDS when a bank line is in scope", () => {
    const m = reconLine(1, { settledAt: T0 + 2 * DAY });
    const inScopeOk = ctxFor({ bankValueDate: T0 + 3 * DAY });
    expect(verdictOf(evaluate([m], inScopeOk), "C3", "bank-arrival")).toBe("PASS");

    const inScopeBad = ctxFor({ bankValueDate: T0 + 1 * DAY });
    const a = evaluate([m], inScopeBad);
    expect(verdictOf(a, "C3", "bank-arrival")).toBe("FAIL");
    expect(a.failed).toContain("C3");
  });

  it("admits settled_at exactly equal to the bank value date", () => {
    const m = reconLine(1, { settledAt: T0 + 2 * DAY });
    expect(
      verdictOf(evaluate([m], ctxFor({ bankValueDate: T0 + 2 * DAY })), "C3", "bank-arrival"),
    ).toBe("PASS");
  });
});

describe("C4 — elapsed seconds in a closed [T_min, T_max]", () => {
  it("uses seconds, not day indices", () => {
    expect(SETTLEMENT_WINDOW.t_min_seconds).toBe(86_400);
    expect(SETTLEMENT_WINDOW.t_max_seconds).toBe(7 * 86_400);
  });

  const at = (elapsed: number) =>
    reconLine(1, { createdAt: T0, settledAt: T0 + elapsed });

  it("admits both boundaries and rejects just outside them", () => {
    expect(verdictOf(evaluate([at(DAY)], ctxFor()), "C4", null)).toBe("PASS");
    expect(verdictOf(evaluate([at(7 * DAY)], ctxFor()), "C4", null)).toBe("PASS");
    expect(verdictOf(evaluate([at(DAY - 1)], ctxFor()), "C4", null)).toBe("FAIL");
    expect(verdictOf(evaluate([at(7 * DAY + 1)], ctxFor()), "C4", null)).toBe("FAIL");
  });

  it("admits a sub-day fraction inside the window — the 1.4.7 grid's shape", () => {
    // The grid puts lag in (n, n + 0.875] days; 2.5 days is representative and
    // must not be truncated to a day index by the comparison.
    expect(verdictOf(evaluate([at(Math.round(2.5 * DAY))], ctxFor()), "C4", null)).toBe("PASS");
  });

  it("FAILS on a null settled_at — spec 1.4.2, identically to C3", () => {
    const a = evaluate([reconLine(1, { settledAt: null })], ctxFor());
    expect(verdictOf(a, "C4", null)).toBe("FAIL");
    expect(a.failed).toEqual(expect.arrayContaining(["C3", "C4"]));
  });
});

describe("C5 — per-line arithmetic identity", () => {
  it("payments: credit = amount - fee, fee GST-inclusive", () => {
    const ok = reconLine(1, { amount: 100_000, fee: 2_000, credit: 98_000, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([ok], ctxFor()), "C5", null)).toBe("PASS");

    const bad = reconLine(2, { amount: 100_000, fee: 2_000, credit: 97_695, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([bad], ctxFor()), "C5", null)).toBe("FAIL");
  });

  it("refunds: debit = amount", () => {
    const ok = reconLine(1, { type: "refund", amount: 5_000, debit: 5_000, credit: 0, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([ok], ctxFor()), "C5", null)).toBe("PASS");

    const bad = reconLine(2, { type: "refund", amount: 5_000, debit: 4_999, credit: 0, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([bad], ctxFor()), "C5", null)).toBe("FAIL");
  });

  it("is NOT_EVALUATED on an adjustment — §4.1 states no identity for one", () => {
    const a = evaluate([adjustment(1, { settledAt: T0 + 2 * DAY })], ctxFor());
    expect(verdictOf(a, "C5", null)).toBe("NOT_EVALUATED");
    expect(a.failed).not.toContain("C5");
  });
});

describe("C6 — exact tie-out, allocation-wide, zero tolerance", () => {
  it("sums credit minus debit over the members", () => {
    const m1 = reconLine(1, { amount: 60_000, fee: 1_000, credit: 59_000, settledAt: T0 + 2 * DAY });
    const m2 = reconLine(2, { amount: 40_000, fee: 1_000, credit: 39_000, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([m1, m2], ctxFor({ amount: 98_000 })), "C6", null)).toBe("PASS");
  });

  it("has zero tolerance — one paisa off FAILS", () => {
    const m = reconLine(1, { amount: 100_000, fee: 2_000, credit: 98_000, settledAt: T0 + 2 * DAY });
    expect(verdictOf(evaluate([m], ctxFor({ amount: 98_001 })), "C6", null)).toBe("FAIL");
    expect(verdictOf(evaluate([m], ctxFor({ amount: 97_999 })), "C6", null)).toBe("FAIL");
  });

  it("subtracts refund debits", () => {
    const pay = reconLine(1, { amount: 100_000, fee: 2_000, credit: 98_000, settledAt: T0 + 2 * DAY });
    const ref = reconLine(2, {
      type: "refund",
      amount: 8_000,
      debit: 8_000,
      credit: 0,
      settledAt: T0 + 2 * DAY,
    });
    expect(verdictOf(evaluate([pay, ref], ctxFor({ amount: 90_000 })), "C6", null)).toBe("PASS");
  });

  it("INCLUDES the target's already-anchored members", () => {
    // §3 removes anchored lines from the SEARCH, not from the settlement. A
    // candidate proposes the unanchored remainder; C6 ties out over the whole
    // allocation, which is what I4 makes a settlement equal to.
    const anchored = reconLine(1, { amount: 60_000, fee: 1_000, credit: 59_000, settledAt: T0 + 2 * DAY });
    const proposed = reconLine(2, { amount: 40_000, fee: 1_000, credit: 39_000, settledAt: T0 + 2 * DAY });

    const whole = ctxFor({ amount: 98_000, anchored: [anchored] });
    expect(verdictOf(evaluate([proposed], whole), "C6", null)).toBe("PASS");

    // Against the remainder alone it would tie out at 39_000 — the wrong identity.
    const remainderOnly = ctxFor({ amount: 98_000, anchored: [] });
    expect(verdictOf(evaluate([proposed], remainderOnly), "C6", null)).toBe("FAIL");
  });
});

describe("C7 — one allocation", () => {
  it("FAILS a member already in an accepted allocation", () => {
    const m = reconLine(1, { settledAt: T0 + 2 * DAY });
    const free = evaluate([m], ctxFor());
    expect(verdictOf(free, "C7", null)).toBe("PASS");

    const taken = evaluate([m], ctxFor({ allocated: [obsId(1)] }));
    expect(verdictOf(taken, "C7", null)).toBe("FAIL");
    expect(taken.admissible).toBe(false);
  });
});

describe("C8 — expected-non-binding, but a real filter", () => {
  it("PASSES an unheld member and FAILS a held one", () => {
    const free = reconLine(1, { settledAt: T0 + 2 * DAY, onHold: false });
    expect(verdictOf(evaluate([free], ctxFor()), "C8", null)).toBe("PASS");

    const held = reconLine(2, { settledAt: T0 + 2 * DAY, onHold: true });
    expect(verdictOf(evaluate([held], ctxFor()), "C8", null)).toBe("FAIL");
  });

  it("reports its failure SEPARATELY from the binding constraints", () => {
    const held = reconLine(1, {
      amount: 100_000,
      fee: 2_000,
      credit: 98_000,
      settledAt: T0 + 2 * DAY,
      onHold: true,
    });
    const a = evaluate([held], ctxFor({ amount: 98_000 }));
    expect(a.failed).toEqual(["C8"]);
    expect(a.failedExpectedNonBinding).toEqual(["C8"]);
    expect(a.clauses.find((c) => c.id === "C8")?.expectedNonBinding).toBe(true);
  });

  it("is scoped to members claimed as settled — §4.1's own qualifier", () => {
    // C8 alone is written "for members claimed as settled"; a null settled_at
    // is outside its scope, while C3 and C4 stay unconditional.
    const a = evaluate([reconLine(1, { settledAt: null, onHold: true })], ctxFor());
    expect(verdictOf(a, "C8", null)).toBe("NOT_EVALUATED");
    expect(a.failed).not.toContain("C8");
  });
});

describe("co-settlement coherence — a consequence, not a ninth constraint", () => {
  it("rejects members carrying different settled_at values", () => {
    const a1 = reconLine(1, { settledAt: T0 + 2 * DAY });
    const a2 = reconLine(2, { settledAt: T0 + 3 * DAY });
    const a = evaluate([a1, a2], ctxFor());
    expect(a.coSettlementCoherent).toBe(false);
    expect(a.admissible).toBe(false);
    // It is NOT a C1-C8 failure: constraints.decl.ts gains no row for it.
    expect(a.failed).not.toContain("C3");
    expect(a.clauses.some((c) => c.half === "co-settlement")).toBe(false);
  });

  it("accepts members sharing one settled_at", () => {
    const a1 = reconLine(1, { settledAt: T0 + 2 * DAY });
    const a2 = reconLine(2, { settledAt: T0 + 2 * DAY });
    expect(evaluate([a1, a2], ctxFor()).coSettlementCoherent).toBe(true);
  });

  it("is vacuous for a bank_line target", () => {
    const a1 = reconLine(1, { settledAt: T0 + 2 * DAY });
    const a2 = reconLine(2, { settledAt: T0 + 3 * DAY });
    expect(
      evaluate([a1, a2], ctxFor({ kind: "bank_line" })).coSettlementCoherent,
    ).toBe(true);
  });

  it("reads members' own settled_at, never the target's clock", () => {
    // §4.1: "no constraint is re-based onto the target's settlement clock".
    // The target carries no settled_at in this type at all, which is the point.
    const t = ctxFor().target;
    expect(Object.keys(t)).not.toContain("settled_at");
  });
});

describe("candidate generation", () => {
  const pool = (): Member[] => [
    reconLine(1, { amount: 60_000, fee: 1_000, credit: 59_000, settledAt: T0 + 2 * DAY }),
    reconLine(2, { amount: 40_000, fee: 1_000, credit: 39_000, settledAt: T0 + 2 * DAY }),
    reconLine(3, { amount: 30_000, fee: 1_000, credit: 29_000, settledAt: T0 + 2 * DAY }),
  ];

  it("finds every subset that ties out and no other", () => {
    const g = generateCandidates(pool(), ctxFor({ amount: 98_000 }));
    expect(g.status).toBe("COMPLETE");
    expect(g.candidates).toEqual([{ member_obs_ids: [obsId(1), obsId(2)] }]);
  });

  it("returns TWO candidates where two subsets tie out — the ambiguity S4 resolves", () => {
    const p = [
      reconLine(1, { amount: 50_000, fee: 0, credit: 50_000, settledAt: T0 + 2 * DAY }),
      reconLine(2, { amount: 50_000, fee: 0, credit: 50_000, settledAt: T0 + 2 * DAY }),
      reconLine(3, { amount: 100_000, fee: 0, credit: 100_000, settledAt: T0 + 2 * DAY }),
    ];
    const g = generateCandidates(p, ctxFor({ amount: 100_000 }));
    expect(g.candidates).toEqual([
      { member_obs_ids: [obsId(3)] },
      { member_obs_ids: [obsId(1), obsId(2)] },
    ]);
  });

  it("gives a bank_line target the EMPTY candidate set — §11.1 spec 1.4.4", () => {
    const g = generateCandidates(pool(), ctxFor({ kind: "bank_line", amount: 98_000 }));
    expect(g.candidates).toEqual([]);
    expect(g.status).toBe("COMPLETE");
  });

  it("never mixes co-settlement classes", () => {
    const p = [
      reconLine(1, { amount: 50_000, fee: 0, credit: 50_000, settledAt: T0 + 2 * DAY }),
      reconLine(2, { amount: 50_000, fee: 0, credit: 50_000, settledAt: T0 + 3 * DAY }),
    ];
    // 50_000 + 50_000 would tie out at 100_000, but the two sit in different
    // settlements by DATA_MODEL.md §6's definition of settled_at.
    expect(generateCandidates(p, ctxFor({ amount: 100_000 })).candidates).toEqual([]);
  });

  it("drops members with a null settled_at rather than enumerating them", () => {
    const p = [
      reconLine(1, { amount: 98_000, fee: 0, credit: 98_000, settledAt: null }),
    ];
    expect(generateCandidates(p, ctxFor({ amount: 98_000 })).candidates).toEqual([]);
  });

  it("counts candidates excluded ONLY by an expected-non-binding clause", () => {
    const p = [
      reconLine(1, {
        amount: 98_000,
        fee: 0,
        credit: 98_000,
        settledAt: T0 + 2 * DAY,
        onHold: true,
      }),
    ];
    const g = generateCandidates(p, ctxFor({ amount: 98_000 }));
    expect(g.candidates).toEqual([]);
    expect(g.excludedByExpectedNonBinding).toBe(1);
  });

  it("is order-independent and deterministic", () => {
    const forward = generateCandidates(pool(), ctxFor({ amount: 98_000 }));
    const reversed = generateCandidates([...pool()].reverse(), ctxFor({ amount: 98_000 }));
    expect(reversed).toEqual(forward);
    expect(generateCandidates(pool(), ctxFor({ amount: 98_000 }))).toEqual(forward);
  });

  it("reports INTRACTABLE past K_max rather than truncating", () => {
    const big = Array.from({ length: 23 }, (_, i) =>
      reconLine(i + 1, { amount: 1_000, fee: 0, credit: 1_000, settledAt: T0 + 2 * DAY }),
    );
    expect(generateCandidates(big, ctxFor({ amount: 5_000 })).status).toBe("INTRACTABLE");
  });

  it("enumerates against already-anchored members", () => {
    const anchored = reconLine(9, {
      amount: 60_000,
      fee: 1_000,
      credit: 59_000,
      settledAt: T0 + 2 * DAY,
    });
    const p = [
      reconLine(1, { amount: 40_000, fee: 1_000, credit: 39_000, settledAt: T0 + 2 * DAY }),
    ];
    const g = generateCandidates(p, ctxFor({ amount: 98_000, anchored: [anchored] }));
    // §11: Candidate.member_obs_ids is the WHOLE allocation, anchored included.
    // Component.member_obs_ids (S3) is the unanchored subset — a different set.
    expect(g.candidates).toEqual([{ member_obs_ids: [obsId(1), obsId(9)] }]);
  });
});
