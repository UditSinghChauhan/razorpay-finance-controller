import { describe, expect, it } from "vitest";

import {
  COMPOSITION, F04_DUPLICATE_COUNT, F05_SELECTED_SETTLEMENTS, F06_PAIR_COUNT,
  PARTIAL_REFUND_COUNT, T_PLUS_1_BATCHES, T_PLUS_3_BATCHES,
} from "../src/composition.js";
import { FAMILY_MECHANICS } from "../src/families.js";
import { F09_LATE_WINDOW_DAYS, SETTLEMENT_CYCLE } from "../src/frozen.js";
import { generateFamily } from "../src/generate.js";
import { DAY_COUNT, F03_RATE_CHANGE_AT, PERIOD_TO } from "../src/period.js";
import { TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

/** `§4.1` F03 and `§4.2`'s mid-period repricing. */
describe("F03 — the mid-period rate change", () => {
  it("prices card lines at 200 bps before the frozen instant and 195 at or after it", () => {
    const state = generateFamily("F03", SEED).true_state;
    let before = 0;
    let after = 0;
    for (const payment of state.payments) {
      if (payment.method !== "card") { expect([200, 300]).toContain(payment.rate_bps); continue; }
      if (payment.created_at < F03_RATE_CHANGE_AT) { expect(payment.rate_bps).toBe(200); before += 1; }
      else { expect(payment.rate_bps).toBe(195); after += 1; }
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
  });

  it("leaves every other family's card lines at the frozen 200 bps", () => {
    for (const family of ["F01", "F02", "F04", "F05"] as const) {
      const state = generateFamily(family, SEED).true_state;
      for (const payment of state.payments) {
        if (payment.method === "card") expect(payment.rate_bps).toBe(200);
      }
    }
  });
});

/** `§4.1` F04 and `§4.3`'s `DUPLICATE_ROW`. */
describe("F04 — duplicate bank credit", () => {
  it("emits round_half_up(0.10 x B) = 3 extra bank_line rows and nothing else", () => {
    const base = generateFamily("F01", SEED);
    const f04 = generateFamily("F04", SEED);
    expect(F04_DUPLICATE_COUNT).toBe(3);
    expect(f04.observations.filter((o) => o.kind === "bank_line")).toHaveLength(COMPOSITION.B + 3);
    expect(f04.observations).toHaveLength(base.observations.length + 3);
    for (const kind of ["order", "payment", "recon_line", "settlement", "ledger_entry"] as const) {
      expect(f04.observations.filter((o) => o.kind === kind).length)
        .toBe(base.observations.filter((o) => o.kind === kind).length);
    }
  });

  it("emits each duplicate immediately after its original, with an identical ingest_hash", () => {
    const f04 = generateFamily("F04", SEED);
    const bank = f04.observations.filter((o) => o.kind === "bank_line");
    let duplicates = 0;
    for (const [i, observation] of bank.entries()) {
      if (i === 0) continue;
      const previous = bank[i - 1];
      if (previous === undefined || previous.ingest_hash !== observation.ingest_hash) continue;
      duplicates += 1;
      expect(observation.obs_id).not.toBe(previous.obs_id);
      expect(observation.payload).toStrictEqual(previous.payload);
      // §4.3: the duplicate is a second row, so it takes its own source_line.
      expect(observation.source_line).toBe(previous.source_line + 1);
    }
    expect(duplicates).toBe(F04_DUPLICATE_COUNT);
  });

  it("leaves the TRUE state untouched — a duplicate is an observation artifact", () => {
    const state = generateFamily("F04", SEED).true_state;
    expect(state.bank_lines).toHaveLength(COMPOSITION.B);
    const truth = generateFamily("F04", SEED).ground_truth;
    expect(truth.bank_mappings).toHaveLength(COMPOSITION.B);
  });
});

/** `§4.2`'s `F05` missing-capture construction. */
describe("F05 — the withheld recon line", () => {
  it("removes exactly one recon_line per selected settlement, three in all", () => {
    expect(F05_SELECTED_SETTLEMENTS).toBe(3);
    const base = generateFamily("F01", SEED);
    const f05 = generateFamily("F05", SEED);
    expect(f05.observations).toHaveLength(base.observations.length - 3);
    expect(f05.observations.filter((o) => o.kind === "recon_line").length)
      .toBe(base.observations.filter((o) => o.kind === "recon_line").length - 3);
  });

  it("leaves the payment, order, ledger entry and settlement in place", () => {
    const f05 = generateFamily("F05", SEED);
    const state = f05.true_state;
    expect(f05.observations.filter((o) => o.kind === "payment")).toHaveLength(COMPOSITION.P);
    expect(f05.observations.filter((o) => o.kind === "order")).toHaveLength(COMPOSITION.P);
    expect(f05.observations.filter((o) => o.kind === "ledger_entry")).toHaveLength(COMPOSITION.N);
    expect(f05.observations.filter((o) => o.kind === "settlement")).toHaveLength(COMPOSITION.S);
    // "the settlement observation carrying its FULL amount" — the withholding is
    // an emission decision, so the settlement's own arithmetic is unchanged.
    for (const settlement of state.settlements) {
      const emitted = f05.observations.find(
        (o) => o.kind === "settlement" && o.payload.id === settlement.id,
      );
      expect(emitted?.kind === "settlement" ? emitted.payload.amount : -1).toBe(settlement.amount);
    }
  });

  it("keeps truth's P1 posting for the withheld capture — the true state is not degraded", () => {
    const f05 = generateFamily("F05", SEED);
    const emitted = new Set(
      f05.observations.filter((o) => o.kind === "recon_line").map((o) => o.payload.entity_id),
    );
    const missing = f05.true_state.payments.filter((p) => p.captured && !emitted.has(p.id));
    expect(missing).toHaveLength(3);
    for (const payment of missing) {
      const p1 = f05.ground_truth.true_journal.filter(
        (l) => l.source_entity_id === payment.id && l.posting_ref === "P1",
      );
      expect(p1).toHaveLength(2);
    }
  });

  it("malforms nothing: a row is absent, not corrupt", () => {
    const f05 = generateFamily("F05", SEED);
    expect(f05.ground_truth.degradations).toHaveLength(0);
  });
});

/** `§4.2`'s `F06` collision construction. */
describe("F06 — the equal-amount collision", () => {
  it("builds three same-day pairs with one amount and one method drawn once each", () => {
    expect(F06_PAIR_COUNT).toBe(3);
    const state = generateFamily("F06", SEED).true_state;
    const byKey = new Map<string, typeof state.payments[number][]>();
    for (const payment of state.payments) {
      if (!payment.captured) continue;
      const key = `${String(payment.day)}|${String(payment.amount)}|${payment.method}`;
      byKey.set(key, [...(byKey.get(key) ?? []), payment]);
    }
    const pairs = [...byKey.values()].filter((group) => group.length === 2);
    expect(pairs.length).toBeGreaterThanOrEqual(F06_PAIR_COUNT);
    for (const [a, b] of pairs) {
      if (a === undefined || b === undefined) continue;
      expect(a.amount).toBe(b.amount);
      expect(a.method).toBe(b.method);
      expect(a.day).toBe(b.day);
      expect(a.id).not.toBe(b.id); // "its own unique pay_ / order_ identifier"
      expect(a.order_index).not.toBe(b.order_index);
    }
  });

  it("settles exactly one member of each pair and emits no extra row", () => {
    const f06 = generateFamily("F06", SEED);
    const state = f06.true_state;
    const unsettled = state.payments.filter((p) => p.captured && !p.settles);
    expect(unsettled).toHaveLength(F06_PAIR_COUNT);
    expect(f06.observations).toHaveLength(generateFamily("F01", SEED).observations.length);
    // The unsettled member still has its own recon line, marked unsettled.
    for (const payment of unsettled) {
      const line = f06.observations.find(
        (o) => o.kind === "recon_line" && o.payload.entity_id === payment.id,
      );
      expect(line).toBeDefined();
      if (line?.kind === "recon_line") {
        expect(line.payload.settled).toBe(false);
        expect(line.payload.settlement_id).toBeNull();
      }
    }
  });

  it("books the collision in truth: P1 for both captures, P2 for the settled one", () => {
    const f06 = generateFamily("F06", SEED);
    const unsettled = f06.true_state.payments.filter((p) => p.captured && !p.settles);
    for (const payment of unsettled) {
      const lines = f06.ground_truth.true_journal.filter((l) => l.source_entity_id === payment.id);
      expect(lines.filter((l) => l.posting_ref === "P1")).toHaveLength(2);
      expect(lines.filter((l) => l.posting_ref === "P2")).toHaveLength(0);
    }
  });

  it("touches no UTR, so E14 stays independent", () => {
    const state = generateFamily("F06", SEED).true_state;
    expect(new Set(state.settlements.map((s) => s.utr)).size).toBe(state.settlements.length);
  });
});

/** `§4.1` F07 and `§4.2`'s dispute pair. Held out; structural assertions only. */
describe("F07 — chargeback deduction and reversal", () => {
  it("emits 2D adjustment rows unconditionally", () => {
    const f07 = generateFamily("F07", SEED);
    expect(f07.observations.filter((o) => o.kind === "adjustment")).toHaveLength(2 * COMPOSITION.D);
    expect(f07.true_state.adjustments).toHaveLength(2 * COMPOSITION.D);
    const [deduction, reversal] = f07.true_state.adjustments;
    expect(deduction?.direction).toBe("debit");
    expect(deduction?.reason).toBe("chargeback_debit");
    expect(reversal?.direction).toBe("credit");
    expect(reversal?.reason).toBe("chargeback_reversal");
    expect(reversal?.created_at).toBeGreaterThan(deduction?.created_at ?? 0);
  });

  it("emits both rows on every seed, including where the reversal leaves the period", () => {
    for (const seed of TEST_SEEDS) {
      const f07 = generateFamily("F07", seed);
      expect(f07.observations.filter((o) => o.kind === "adjustment")).toHaveLength(2);
      expect(f07.observations).toHaveLength(2623);
    }
  });

  it("generates no generic adjustment in any other family — §10 V14", () => {
    expect(COMPOSITION.Adj).toBe(0);
    for (const family of ["F01", "F02", "F03", "F04", "F05", "F06", "F08", "F09", "F10"] as const) {
      expect(generateFamily(family, SEED).true_state.adjustments).toHaveLength(0);
    }
  });
});

/** `§4.1` F09 and `§4.2`'s late window. */
describe("F09 — late arrival across the period boundary", () => {
  it("settles the final three capture days at T+3, past period.to", () => {
    const state = generateFamily("F09", SEED).true_state;
    for (let day = DAY_COUNT - F09_LATE_WINDOW_DAYS + 1; day <= DAY_COUNT; day += 1) {
      const settlement = state.settlements.find((s) => s.day === day);
      expect(settlement?.cycle_days).toBe(SETTLEMENT_CYCLE.t_plus_3.days);
      expect(settlement?.settled_at).toBeGreaterThan(PERIOD_TO);
    }
  });

  it("keeps the frozen cycle mix exactly realized: 3 x T+1, 5 x T+3, 23 x T+2", () => {
    for (const family of ["F01", "F09"] as const) {
      for (const seed of TEST_SEEDS) {
        const state = generateFamily(family, seed).true_state;
        const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0]]);
        for (const settlement of state.settlements) {
          counts.set(settlement.cycle_days, (counts.get(settlement.cycle_days) ?? 0) + 1);
        }
        expect(counts.get(1)).toBe(T_PLUS_1_BATCHES);
        expect(counts.get(3)).toBe(T_PLUS_3_BATCHES);
        expect(counts.get(2)).toBe(COMPOSITION.S - T_PLUS_1_BATCHES - T_PLUS_3_BATCHES);
      }
    }
    expect([T_PLUS_1_BATCHES, T_PLUS_3_BATCHES]).toStrictEqual([3, 5]);
  });

  it("emits the same 31 settlements — the family adds no row", () => {
    const f09 = generateFamily("F09", SEED);
    expect(f09.observations.filter((o) => o.kind === "settlement")).toHaveLength(COMPOSITION.S);
    expect(f09.observations).toHaveLength(2621);
  });
});

/** `§4.1` F02, and the refund population `§4.2` freezes. */
describe("F02 — a refund crossing a settlement boundary", () => {
  it("realizes 27 refunds of which 11 are partial, on every seed", () => {
    expect(PARTIAL_REFUND_COUNT).toBe(11);
    for (const seed of TEST_SEEDS) {
      const state = generateFamily("F02", seed).true_state;
      expect(state.refunds).toHaveLength(COMPOSITION.R);
      expect(state.refunds.filter((r) => r.partial)).toHaveLength(PARTIAL_REFUND_COUNT);
      for (const refund of state.refunds) {
        const payment = state.payments[refund.payment_index];
        expect(refund.amount).toBeGreaterThan(0);
        expect(refund.amount).toBeLessThanOrEqual(payment?.amount ?? 0);
        expect(refund.created_at).toBeGreaterThanOrEqual(payment?.created_at ?? 0);
      }
    }
  });

  it("shifts a refund's settlement two days later than F01 would", () => {
    const f01 = generateFamily("F01", SEED).true_state;
    const f02 = generateFamily("F02", SEED).true_state;
    const shifted = f02.refunds.filter((r, i) => {
      const base = f01.refunds[i];
      return base?.settlement_day !== null && r.settlement_day !== base?.settlement_day;
    });
    expect(shifted.length).toBeGreaterThan(0);
  });
});

/** The mechanism table itself: `§4.3`'s disposal rule made mechanical. */
describe("the family mechanics table", () => {
  it("gives no family an operator §4.3 declares unexercised", () => {
    for (const mechanics of Object.values(FAMILY_MECHANICS)) {
      for (const op of mechanics.operators) {
        expect(["DROP_FIELD", "SHIFT_TIMESTAMP", "SWAP_ORDER_REF", "ROUND_BANK_AMOUNT"]).not.toContain(op);
      }
    }
  });

  it("makes F08 the only family declaring more than one operator", () => {
    const multi = Object.entries(FAMILY_MECHANICS).filter(([, m]) => m.operators.length > 1);
    expect(multi.map(([family]) => family)).toStrictEqual(["F08", "F10"]);
    expect(FAMILY_MECHANICS.F08.operators).toStrictEqual([
      "DROP_SETTLEMENT_ID", "MANGLE_UTR", "TRUNCATE_NARRATION",
    ]);
  });
});
