import { describe, expect, it } from "vitest";

import { paise } from "@assay/money";

import { amountForCredit, feeBreakdown } from "../src/amount.js";
import {
  AMB2_PAIR_COUNT, AMB3_PAIR_COUNT, AMB5_DAY_COUNT, BEN1_DAY_COUNT, BEN2_DAY_COUNT, BEN3_DAY_COUNT,
  COMPOSITION, TARGET_RECORD_COUNT,
} from "../src/composition.js";
import { FAMILY_MECHANICS } from "../src/families.js";
import {
  AMB1_BASE_METHODS, AMB1_TWIN_METHOD, AMB2_MIN_REFUND_PAISE, AMB2_REFUND_BPS, AMB3_DELTA_RANGE_PAISE,
  AMB5_DROP_COUNT, BEN1_DROP_COUNT, BEN2_DROP_COUNT, BEN3_MIN_CREDIT_GAP_PAISE, BENCH_V2_FAMILY_IDS,
  FEE_RATE_BPS, IMPLEMENTED_FAMILIES, OPERATOR_DECLARING_FAMILY, PUBLISHED_TARGET_RECORD_COUNTS,
} from "../src/frozen.js";
import { simulate, type SimMember, type TrueState } from "../src/simulate.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

/**
 * bench-v2's second increment — `A02` (`AMB-2`), `A03` (`AMB-3`), `A05`
 * (`AMB-5`) and `B01` (`BENIGN`) — checked against what the engine will READ
 * (`docs/BENCH_V2_DESIGN.md §C`).
 *
 * **Every one is a STRESS family** (`§A`): its prevalence is a declared
 * parameter and nothing asserted here is a rate. `§6.1` condition 3: nothing
 * here reaches `packages/engine`; the engine's verdict on each family is
 * asserted in `apps/cli/tests/bench-v2-families.test.ts`.
 *
 * The **tau guard** at the end is the corpus-level assertion `§C` A2 asked
 * for: the engine's `tau` is `max(floor, Math.floor(10 bps x V))` and the
 * oracle's is `max(floor, round_half_up(10 bps x V))` (`§1.6`), which
 * disagree by one paisa on roughly a third of components whose proportional
 * term exceeds the floor. No generated case may have its materiality inside
 * that one-paisa window, because there the two would disagree about
 * ambiguity. Both formulas are restated here from `RECONCILIATION_SPEC.md §6`
 * rather than imported, because this package may import neither.
 */

const memberId = (state: TrueState, m: SimMember): string =>
  m.kind === "payment" ? (state.payments[m.index]?.id ?? "")
  : m.kind === "refund" ? (state.refunds[m.index]?.id ?? "")
  : (state.adjustments[m.index]?.id ?? "");

const settlementOf = (state: TrueState, m: SimMember): number => {
  const hit = state.settlements.find((s) => s.members.some((x) => x.kind === m.kind && x.index === m.index));
  if (hit === undefined) throw new Error(`member ${m.kind}:${String(m.index)} is in no settlement`);
  return hit.index;
};

/** `tau` as the engine computes it (`s4-solve.ts`, `Math.floor`). */
const tauEngine = (v: number): number => Math.max(10_000, Math.floor((v * 10) / 10_000));
/** `tau` as the oracle computes it (`classify.ts`, `roundHalfUp`). */
const tauOracle = (v: number): number => Math.max(10_000, Math.floor((v * 10) / 10_000 + 0.5));

describe("registration — ids, counts, the single-carrier guard", () => {
  it("declares A02, A03, A05 and B01 beside A01, all implemented, none in §4.1's table", () => {
    expect(BENCH_V2_FAMILY_IDS).toStrictEqual(["A01", "A02", "A03", "A05", "B01"]);
    for (const family of BENCH_V2_FAMILY_IDS) expect(IMPLEMENTED_FAMILIES).toContain(family);
  });

  it("derives every published target_record_count as base + 2 x split days", () => {
    expect(TARGET_RECORD_COUNT.A02).toBe(COMPOSITION.base + 2 * AMB2_PAIR_COUNT);
    expect(TARGET_RECORD_COUNT.A03).toBe(COMPOSITION.base + 2 * AMB3_PAIR_COUNT);
    expect(TARGET_RECORD_COUNT.A05).toBe(COMPOSITION.base);
    expect(TARGET_RECORD_COUNT.B01).toBe(COMPOSITION.base + 2 * BEN3_DAY_COUNT);
    expect(PUBLISHED_TARGET_RECORD_COUNTS).toMatchObject({ A02: 2627, A03: 2627, A05: 2621, B01: 2627 });
    for (const family of ["A02", "A03", "A05", "B01"] as const) {
      expect(dataset(family, TEST_SEEDS[0]).observations).toHaveLength(PUBLISHED_TARGET_RECORD_COUNTS[family]);
    }
  });

  it("lists DROP_BATCH_IDENTITY's carriers explicitly, and the guard finds exactly them", () => {
    // §B.1's guard, in both directions, now over a LIST for the bench-v2
    // operator. The v1 rows are still single-valued and F08 is still the only
    // carrier of DROP_SETTLEMENT_ID.
    expect(OPERATOR_DECLARING_FAMILY.DROP_BATCH_IDENTITY).toStrictEqual(["A01", "A02", "A03", "A05", "B01"]);
    const carriers = IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes("DROP_BATCH_IDENTITY"));
    expect(carriers).toStrictEqual([...OPERATOR_DECLARING_FAMILY.DROP_BATCH_IDENTITY]);
    expect(IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes("DROP_SETTLEMENT_ID")))
      .toStrictEqual(["F08"]);
  });

  it("names exactly the constructed members as identity drops, and degrades exactly those", () => {
    for (const family of ["A02", "A03", "A05", "B01"] as const) {
      for (const seed of TEST_SEEDS) {
        const built = dataset(family, seed);
        const expected = built.true_state.identity_drops.map((m) => memberId(built.true_state, m)).sort();
        const degraded = built.ground_truth.degradations.map((d) => d.target_id).sort();
        expect(degraded).toStrictEqual(expected);
        for (const record of built.ground_truth.degradations) expect(record.op).toBe("DROP_BATCH_IDENTITY");
      }
    }
  });

  it("leaves every §4.1 family and A01 without a foreign drop or split", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const state = simulate(family, TEST_SEEDS[0]);
      if (!family.startsWith("A") && !family.startsWith("B")) {
        expect(state.split_batches).toStrictEqual([]);
        expect(state.identity_drops).toStrictEqual([]);
      }
    }
    const a01 = simulate("A01", TEST_SEEDS[0]);
    expect(a01.split_batches.map((s) => s.construction)).toStrictEqual(["A01", "A01", "A01"]);
    expect(a01.identity_drops).toHaveLength(6);
    expect(a01.identity_drops.every((m) => m.kind === "payment")).toBe(true);
  });
});

describe("A02 — refund-netting twins, {P} vs {P2, R1} (§3.2 T4-b, the material form)", () => {
  it("splits three days, each hosting P, P2 and P2's refund, all three detached", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A02", seed).true_state;
      expect(AMB2_PAIR_COUNT).toBe(3);
      expect(state.split_batches).toHaveLength(AMB2_PAIR_COUNT);
      expect(state.identity_drops).toHaveLength(3 * AMB2_PAIR_COUNT);
      for (const split of state.split_batches) {
        expect(split.construction).toBe("A02");
        expect(split.refund).not.toBeNull();
        const refund = state.refunds[split.refund ?? -1];
        const p2 = state.payments[refund?.payment_index ?? -1];
        const p = state.payments[refund?.payment_index === split.twin_a ? split.twin_b : split.twin_a];
        if (refund === undefined || p2 === undefined || p === undefined) throw new Error("A02 pair missing");
        expect([split.twin_a, split.twin_b]).toContain(refund.payment_index);
        // The refund rides with its parent: same half, same day, raised after the capture.
        expect(settlementOf(state, { kind: "refund", index: refund.index }))
          .toBe(settlementOf(state, { kind: "payment", index: p2.index }));
        expect(refund.day).toBe(split.day);
        expect(refund.settlement_day).toBe(split.day);
        expect(refund.partial).toBe(true);
        expect(refund.created_at).toBeGreaterThanOrEqual(p2.created_at);
        // Equal net: credit(P2) - R = credit(P); one method, one rate, one clock, no card.
        expect((p2.fee?.credit ?? 0) - refund.amount).toBe(p.fee?.credit);
        expect(p2.method).toBe(p.method);
        expect(AMB1_BASE_METHODS).toContain(p.method);
        expect(p2.created_at).toBe(p.created_at);
        expect(p.card).toBeNull();
        expect(p2.card).toBeNull();
        expect(p.refunded_paise).toBe(0);
        expect(p2.refunded_paise).toBe(refund.amount);
        expect(p.dispute_index).toBeNull();
        expect(p2.dispute_index).toBeNull();
        // The declared refund: max(Rs 250, 5 % of P's credit), strictly partial.
        const expectedRefund = Math.max(AMB2_MIN_REFUND_PAISE, Math.floor(((p.fee?.credit ?? 0) * AMB2_REFUND_BPS) / 10_000 + 0.5));
        expect(refund.amount).toBe(expectedRefund);
        expect(refund.amount).toBeLessThan(p2.amount);
        expect(p2.amount).toBe(amountForCredit(paise((p.fee?.credit ?? 0) + refund.amount), p2.rate_bps));
      }
    }
  });

  it("rewrites an EXISTING refund, so the refund count and every record count stay frozen", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A02", seed).true_state;
      expect(state.refunds).toHaveLength(COMPOSITION.R);
      // Refunded paise across payments is the refund mass: the former payment
      // gave its refund up and P2 took it.
      const refundedByPayments = state.payments.reduce((t, p) => t + p.refunded_paise, 0);
      const refundMass = state.refunds.reduce((t, r) => t + r.amount, 0);
      expect(refundedByPayments).toBe(refundMass);
      for (const p of state.payments) expect(p.refunded_paise).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps I4 on both halves and closes neither below zero", () => {
    for (const seed of TEST_SEEDS) {
      const built = dataset("A02", seed);
      for (const split of built.true_state.split_batches) {
        for (const index of [split.settlement_a_index, split.settlement_b_index]) {
          const settlement = built.true_state.settlements[index];
          expect(settlement?.amount).toBeGreaterThanOrEqual(0);
          const net = built.ground_truth.allocations
            .filter((a) => a.settlement_id === settlement?.id)
            .reduce((t, a) => t + a.net_paise, 0);
          expect(net).toBe(settlement?.amount);
        }
      }
    }
  });

  it("separates the two allocations on 2200_REFUND_LIABILITY by R and on 1100 by ~R/(1 - rate), above tau", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A02", seed).true_state;
      for (const split of state.split_batches) {
        const refund = state.refunds[split.refund ?? -1];
        if (refund === undefined) throw new Error("refund missing");
        const p2 = state.payments[refund.payment_index];
        const p = state.payments[refund.payment_index === split.twin_a ? split.twin_b : split.twin_a];
        if (p2 === undefined || p === undefined) throw new Error("pair missing");
        const materiality = Math.max(refund.amount, p2.amount - p.amount);
        const componentValue = p.amount + p2.amount + refund.amount;
        expect(materiality - tauEngine(componentValue)).toBeGreaterThanOrEqual(100);
        expect(materiality - tauOracle(componentValue)).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("is exchangeable: P's and P2's recon lines differ in identity and the deliberate (amount, fee, tax, credit) only", () => {
    // Unlike AMB-1, the twins' CREDITS differ — credit(P2) = credit(P) + R —
    // and it is the NET of {P2, R1} that equals credit(P). The credit is part
    // of the deliberate difference; the refund's existence is the other part.
    const IDENTITY = new Set(["entity_id", "order_id"]);
    const DELIBERATE = new Set(["amount", "fee", "tax", "credit"]);
    for (const seed of TEST_SEEDS) {
      const built = dataset("A02", seed);
      const state = built.true_state;
      for (const split of state.split_batches) {
        const lines = [split.twin_a, split.twin_b].map((i) => built.observations.find(
          (o) => o.kind === "recon_line" && o.payload.entity_id === state.payments[i]?.id,
        ));
        const [x, y] = lines;
        if (x?.kind !== "recon_line" || y?.kind !== "recon_line") throw new Error("twin line missing");
        const px = x.payload as Record<string, unknown>;
        const py = y.payload as Record<string, unknown>;
        for (const field of Object.keys(px)) {
          if (JSON.stringify(px[field]) === JSON.stringify(py[field])) continue;
          expect(IDENTITY.has(field) || DELIBERATE.has(field), `${String(seed)}: recon_line.${field} distinguishes the twins`).toBe(true);
        }
        for (const p of [px, py]) {
          expect(p.settlement_id).toBeNull();
          expect(p.settlement_utr).toBeNull();
          expect(p.settled).toBe(true);
        }
      }
    }
  });
});

describe("A03 — sub-tau boundary twins, delta in [Rs 51, Rs 80] (§3.3)", () => {
  it("builds AMB-1's twins with the gross difference inside the declared window", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A03", seed).true_state;
      expect(AMB3_PAIR_COUNT).toBe(3);
      expect(state.split_batches).toHaveLength(AMB3_PAIR_COUNT);
      expect(state.identity_drops).toHaveLength(2 * AMB3_PAIR_COUNT);
      for (const split of state.split_batches) {
        expect(split.construction).toBe("A03");
        expect(split.refund).toBeNull();
        const a = state.payments[split.twin_a];
        const b = state.payments[split.twin_b];
        if (a === undefined || b === undefined) throw new Error("twin missing");
        expect(a.fee?.credit).toBe(b.fee?.credit);
        expect(new Set([a.rate_bps, b.rate_bps])).toStrictEqual(new Set([FEE_RATE_BPS.upi, FEE_RATE_BPS[AMB1_TWIN_METHOD]]));
        expect(a.created_at).toBe(b.created_at);
        const delta = Math.abs(a.amount - b.amount);
        expect(delta).toBeGreaterThanOrEqual(AMB3_DELTA_RANGE_PAISE.min);
        expect(delta).toBeLessThanOrEqual(AMB3_DELTA_RANGE_PAISE.max);
        for (const twin of [a, b]) {
          if (twin.fee === null) throw new Error("twin has no fee");
          expect(twin.fee).toStrictEqual(feeBreakdown(twin.amount, twin.rate_bps));
        }
      }
    }
  });

  it("sits below tau's floor on BOTH formulas by >= Rs 20 and above the Rs 50 sweep point by >= Rs 1", () => {
    // The floor binds — the component is worth ~Rs 10k, so 10 bps is ~Rs 20 —
    // and the two formulas agree exactly. Below the frozen tau: commit. Above
    // the Rs 50 and Rs 10 sweep floors: abstain. That is the non-flat tau sweep.
    for (const seed of TEST_SEEDS) {
      const state = dataset("A03", seed).true_state;
      for (const split of state.split_batches) {
        const a = state.payments[split.twin_a];
        const b = state.payments[split.twin_b];
        if (a === undefined || b === undefined) throw new Error("twin missing");
        const delta = Math.abs(a.amount - b.amount);
        const v = a.amount + b.amount;
        expect(tauEngine(v)).toBe(10_000);
        expect(tauOracle(v)).toBe(10_000);
        expect(10_000 - delta).toBeGreaterThanOrEqual(2_000);
        expect(delta - 5_000).toBeGreaterThanOrEqual(100);
        expect(delta - 1_000).toBeGreaterThanOrEqual(100);
      }
    }
  });
});

describe("A05 — the search bound, 15 lines of one batch (§3.5)", () => {
  it("detaches 15 payment lines from each of three batches at pairwise-distinct instants, splitting nothing", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A05", seed).true_state;
      expect(AMB5_DAY_COUNT).toBe(3);
      expect(state.split_batches).toStrictEqual([]);
      expect(state.settlements).toHaveLength(COMPOSITION.S);
      expect(state.identity_drops).toHaveLength(AMB5_DAY_COUNT * AMB5_DROP_COUNT);
      const perBatch = new Map<number, number>();
      for (const m of state.identity_drops) {
        expect(m.kind).toBe("payment");
        const s = settlementOf(state, m);
        perBatch.set(s, (perBatch.get(s) ?? 0) + 1);
      }
      expect(perBatch.size).toBe(AMB5_DAY_COUNT);
      const instants = new Set<number>();
      for (const [index, count] of perBatch) {
        expect(count).toBe(AMB5_DROP_COUNT);
        const settlement = state.settlements[index];
        if (settlement === undefined) throw new Error("settlement missing");
        expect(settlement.members.filter((m) => m.kind === "payment").length).toBeGreaterThanOrEqual(AMB5_DROP_COUNT);
        instants.add(settlement.settled_at);
      }
      expect(instants.size).toBe(AMB5_DAY_COUNT);
    }
  });

  it("is sized to exceed C_max = 5,000 without exceeding K_max = 22, and to stay inside C_ORACLE", () => {
    // PREREGISTRATION.md §7's frozen bounds, restated (this package imports
    // neither the engine nor the oracle). The oracle enumerates 2^15 = 32,768
    // subsets (`C_ORACLE = 2,000,000`) and finds one; the engine stops.
    expect(2 ** AMB5_DROP_COUNT - 1).toBeGreaterThan(5_000);
    expect(AMB5_DROP_COUNT).toBeLessThanOrEqual(22);
    expect(2 ** AMB5_DROP_COUNT).toBeLessThanOrEqual(2_000_000);
  });
});

describe("B01 — BENIGN: BEN-1, BEN-2, BEN-3 on disjoint days (§3.6)", () => {
  it("drops one line (BEN-1), two lines (BEN-2), and one from each half of a split day (BEN-3)", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("B01", seed).true_state;
      expect([BEN1_DAY_COUNT, BEN2_DAY_COUNT, BEN3_DAY_COUNT]).toStrictEqual([3, 3, 3]);
      expect(state.split_batches).toHaveLength(BEN3_DAY_COUNT);
      expect(state.identity_drops).toHaveLength(
        BEN1_DAY_COUNT * BEN1_DROP_COUNT + BEN2_DAY_COUNT * BEN2_DROP_COUNT + 2 * BEN3_DAY_COUNT,
      );
      const perBatch = new Map<number, number>();
      for (const m of state.identity_drops) {
        expect(m.kind).toBe("payment");
        const s = settlementOf(state, m);
        perBatch.set(s, (perBatch.get(s) ?? 0) + 1);
      }
      const splitHalves = new Set(state.split_batches.flatMap((s) => [s.settlement_a_index, s.settlement_b_index]));
      const ordinary = [...perBatch].filter(([index]) => !splitHalves.has(index));
      expect(ordinary.filter(([, n]) => n === BEN1_DROP_COUNT)).toHaveLength(BEN1_DAY_COUNT);
      expect(ordinary.filter(([, n]) => n === BEN2_DROP_COUNT)).toHaveLength(BEN2_DAY_COUNT);
      for (const half of splitHalves) expect(perBatch.get(half)).toBe(1);
    }
  });

  it("BEN-3 rewrites nothing and its two lines' credits differ by the declared gap — the direct AMB-1 control", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("B01", seed).true_state;
      for (const split of state.split_batches) {
        expect(split.construction).toBe("BEN3");
        expect(split.refund).toBeNull();
        const a = state.payments[split.twin_a];
        const b = state.payments[split.twin_b];
        if (a === undefined || b === undefined) throw new Error("line missing");
        expect(Math.abs((a.fee?.credit ?? 0) - (b.fee?.credit ?? 0))).toBeGreaterThanOrEqual(BEN3_MIN_CREDIT_GAP_PAISE);
        // Nothing rewritten: each line's fee is the frozen model at its own
        // method's rate, its card attributes follow its method, and the two
        // keep their own clocks — no shared created_at, no EMI pairing.
        for (const line of [a, b]) {
          if (line.fee === null) throw new Error("line has no fee");
          expect(line.rate_bps).toBe(FEE_RATE_BPS[line.method]);
          expect(line.fee).toStrictEqual(feeBreakdown(line.amount, line.rate_bps));
          expect(line.card === null).toBe(line.method !== "card");
        }
        expect(a.created_at).not.toBe(b.created_at);
        const sa = state.settlements[split.settlement_a_index];
        const sb = state.settlements[split.settlement_b_index];
        expect(sa?.settled_at).toBe(sb?.settled_at);
        expect(sa?.day).toBe(split.day);
      }
    }
  });

  it("keeps BEN-1 and BEN-2 away from BEN-3's days AND instants, so no control class pools with a split class", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("B01", seed).true_state;
      const splitDays = new Set(state.split_batches.map((s) => s.day));
      const splitInstants = new Set(state.split_batches.map((s) => state.settlements[s.settlement_a_index]?.settled_at));
      const splitHalves = new Set(state.split_batches.flatMap((s) => [s.settlement_a_index, s.settlement_b_index]));
      for (const m of state.identity_drops) {
        const index = settlementOf(state, m);
        if (splitHalves.has(index)) continue;
        const settlement = state.settlements[index];
        expect(splitDays.has(settlement?.day ?? -1)).toBe(false);
        expect(splitInstants.has(settlement?.settled_at)).toBe(false);
      }
    }
  });
});

describe("the tau guard — no materiality inside the engine/oracle disagreement window (§1.6, §C A2)", () => {
  // Twenty seeds, none in §6.1, over every family that constructs a
  // two-solution component. Materiality is computed from the true state; the
  // component's value is the sum of the detached lines' amounts (§1.4).
  const SEEDS = Array.from({ length: 20 }, (_, i) => 7001 + i);

  function materialCases(family: "A01" | "A02" | "A03", seed: number): { materiality: number; value: number }[] {
    const state = simulate(family, seed);
    return state.split_batches.map((split) => {
      const a = state.payments[split.twin_a];
      const b = state.payments[split.twin_b];
      if (a === undefined || b === undefined) throw new Error("twin missing");
      if (split.refund === null) {
        return { materiality: Math.abs(a.amount - b.amount), value: a.amount + b.amount };
      }
      const refund = state.refunds[split.refund];
      if (refund === undefined) throw new Error("refund missing");
      const p2 = refund.payment_index === a.index ? a : b;
      const p = p2 === a ? b : a;
      return { materiality: Math.max(refund.amount, p2.amount - p.amount), value: a.amount + b.amount + refund.amount };
    });
  }

  it.each(["A01", "A02", "A03"] as const)("%s: every case sits outside (tau_floor, tau_round_half_up] and at least Rs 1 from both", (family) => {
    let cases = 0;
    let divergent = 0;
    for (const seed of SEEDS) {
      for (const { materiality, value } of materialCases(family, seed)) {
        cases += 1;
        const lo = Math.min(tauEngine(value), tauOracle(value));
        const hi = Math.max(tauEngine(value), tauOracle(value));
        if (lo !== hi) divergent += 1;
        expect(hi - lo).toBeLessThanOrEqual(1);
        // The window itself: materiality > lo && materiality <= hi is the one
        // place the engine says AMBIGUOUS and the oracle IMMATERIALLY_AMBIGUOUS.
        expect(materiality > lo && materiality <= hi, `${family} ${String(seed)}: materiality in the disagreement window`).toBe(false);
        // The design rule (§1.6): a rupee clear of BOTH values, on the side the family declares.
        if (family === "A03") expect(lo - materiality).toBeGreaterThanOrEqual(100);
        else expect(materiality - hi).toBeGreaterThanOrEqual(100);
      }
    }
    expect(cases).toBe(3 * SEEDS.length);
    // A03's component is worth ~Rs 10k, so the floor binds and the formulas
    // cannot diverge; A01 and A02 can and do (about a third of the cases whose
    // proportional term exceeds the floor), which is why the guard is over the
    // window and not over "the formulas agree".
    if (family === "A03") expect(divergent).toBe(0);
  });
});
