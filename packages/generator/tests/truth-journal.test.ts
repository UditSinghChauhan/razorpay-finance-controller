import { describe, expect, it } from "vitest";

import { ACCOUNT_CODES } from "@assay/domain";

import { COMPOSITION } from "../src/composition.js";
import { IMPLEMENTED_FAMILIES } from "../src/frozen.js";
import { projectTrueBalances, trialBalance } from "../src/truth-journal.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

describe("§1 true_journal", () => {
  // `I1` is asserted over the same 5 seeds x 10 families as before, decomposed
  // into ten independently executable tests so that no single one carries the
  // whole matrix. The union of the ten covers exactly the original product; the
  // assertions inside are unchanged.
  it.each(IMPLEMENTED_FAMILIES)(
    "balances: I1 holds for %s on every seed",
    (family) => {
      for (const seed of TEST_SEEDS) {
        const { true_journal } = dataset(family, seed).ground_truth;
        const { dr, cr } = trialBalance(true_journal);
        expect(dr).toBe(cr);
        expect(dr).toBeGreaterThan(0);
      }
    },
  );

  it("puts exactly one of dr/cr non-zero on every line", () => {
    for (const line of dataset("F07", SEED).ground_truth.true_journal) {
      expect(line.dr_paise === 0 || line.cr_paise === 0).toBe(true);
      expect(line.dr_paise + line.cr_paise).toBeGreaterThan(0);
      expect(ACCOUNT_CODES).toContain(line.account);
    }
  });

  it("assigns seq strictly increasing and gapless from 0", () => {
    const journal = dataset("F01", SEED).ground_truth.true_journal;
    expect(journal.map((l) => l.seq)).toStrictEqual(journal.map((_, i) => i));
  });

  it("orders by simulated time, then source_entity_id, then account", () => {
    const journal = dataset("F02", SEED).ground_truth.true_journal;
    for (const [i, line] of journal.entries()) {
      if (i === 0) continue;
      const previous = journal[i - 1];
      if (previous === undefined) continue;
      if (previous.source_entity_id !== line.source_entity_id) continue;
      if (previous.posting_ref !== line.posting_ref) continue;
      expect(ACCOUNT_CODES.indexOf(previous.account)).toBeLessThanOrEqual(ACCOUNT_CODES.indexOf(line.account));
    }
  });

  it("names only P1..P8 and only pay_ / rfnd_ / adj_ keys", () => {
    const journal = dataset("F07", SEED).ground_truth.true_journal;
    for (const line of journal) {
      expect(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]).toContain(line.posting_ref);
      expect(/^(pay_|rfnd_|adj_)/.test(line.source_entity_id)).toBe(true);
    }
  });

  it("posts nothing attributable to a ledger_entry or a dispute — §17.1.1", () => {
    const result = dataset("F07", SEED);
    const keys = new Set(result.ground_truth.true_journal.map((l) => l.source_entity_id));
    for (const entry of result.true_state.ledger_entries) expect(keys.has(entry.id)).toBe(false);
    for (const dispute of result.true_state.disputes) expect(keys.has(dispute.id)).toBe(false);
  });

  it("posts P1 for every capture and P2 only where a bank credit actually carried it", () => {
    const result = dataset("F06", SEED);
    const captures = result.true_state.payments.filter((p) => p.captured);
    const p1 = result.ground_truth.true_journal.filter((l) => l.posting_ref === "P1");
    const p2Keys = new Set(
      result.ground_truth.true_journal.filter((l) => l.posting_ref === "P2").map((l) => l.source_entity_id),
    );
    expect(p1).toHaveLength(2 * captures.length);
    expect(p2Keys.size).toBe(captures.filter((p) => p.settles).length);
  });

  it("splits P2's fee in two: 5100 takes fee - tax and 1300 takes tax", () => {
    const result = dataset("F01", SEED);
    const byKey = new Map<string, { bank: number; fee: number; gst: number; recv: number }>();
    for (const line of result.ground_truth.true_journal) {
      if (line.posting_ref !== "P2") continue;
      const row = byKey.get(line.source_entity_id) ?? { bank: 0, fee: 0, gst: 0, recv: 0 };
      if (line.account === "1200_BANK") row.bank = line.dr_paise;
      if (line.account === "5100_PG_FEE_EXPENSE") row.fee = line.dr_paise;
      if (line.account === "1300_GST_INPUT_CREDIT") row.gst = line.dr_paise;
      if (line.account === "1100_GATEWAY_RECEIVABLE") row.recv = line.cr_paise;
      byKey.set(line.source_entity_id, row);
    }
    expect(byKey.size).toBeGreaterThan(500);
    for (const row of byKey.values()) expect(row.bank + row.fee + row.gst).toBe(row.recv);
  });

  it("takes §17.2's P8 shape for every chargeback row", () => {
    const result = dataset("F07", SEED);
    const adjustmentIds = new Set<string>(result.true_state.adjustments.map((a) => a.id));
    const lines = result.ground_truth.true_journal.filter((l) => adjustmentIds.has(l.source_entity_id));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.posting_ref).toBe("P8");
      expect(["9000_SUSPENSE_UNRECONCILED", "1200_BANK"]).toContain(line.account);
    }
  });
});

describe("§1 true_balances", () => {
  it("is exactly the projection of true_journal for every account", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const { true_journal, true_balances } = dataset(family, SEED).ground_truth;
      expect(true_balances).toStrictEqual(projectTrueBalances(true_journal));
    }
  });

  it("covers all seven control accounts and nets to zero across them", () => {
    const { true_balances } = dataset("F01", SEED).ground_truth;
    expect(Object.keys(true_balances).sort()).toStrictEqual([...ACCOUNT_CODES].sort());
    expect(Object.values(true_balances).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("ties 1200_BANK to the sum of the bank credits actually received", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const result = dataset(family, SEED);
      const banked = result.true_state.bank_lines.reduce((total, line) => total + line.amount, 0);
      expect(result.ground_truth.true_balances["1200_BANK"]).toBe(banked);
    }
  });

  it("carries credit balances negative, as §17.1's Sigma dr - Sigma cr convention requires", () => {
    const { true_balances } = dataset("F01", SEED).ground_truth;
    expect(true_balances["4000_REVENUE"]).toBeLessThan(0);
    expect(true_balances["1200_BANK"]).toBeGreaterThan(0);
    expect(true_balances["5100_PG_FEE_EXPENSE"]).toBeGreaterThan(0);
  });
});

describe("§1 the allocation and mapping tables", () => {
  it("closes every settlement at the net of its own allocations — I4", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const result = dataset(family, SEED);
      for (const settlement of result.true_state.settlements) {
        const net = result.ground_truth.allocations
          .filter((a) => a.settlement_id === settlement.id)
          .reduce((total, a) => total + a.net_paise, 0);
        expect(net).toBe(settlement.amount);
      }
    }
  });

  it("maps every bank line to exactly one settlement of equal amount — I5", () => {
    const result = dataset("F04", SEED);
    expect(result.ground_truth.bank_mappings).toHaveLength(COMPOSITION.B);
    const amountOf = new Map<string, number>(result.true_state.settlements.map((s) => [s.id, s.amount]));
    for (const mapping of result.ground_truth.bank_mappings) {
      expect(mapping.settlement_ids).toHaveLength(1);
      const line = result.true_state.bank_lines.find((b) => b.id === mapping.bank_line_id);
      expect(amountOf.get(mapping.settlement_ids[0] ?? "")).toBe(line?.amount);
    }
  });

  it("maps every ledger entry to a real payment — no spurious ERP row is generated", () => {
    const result = dataset("F01", SEED);
    const paymentIds = new Set(result.true_state.payments.map((p) => p.id));
    expect(result.ground_truth.ledger_mappings).toHaveLength(COMPOSITION.N);
    for (const mapping of result.ground_truth.ledger_mappings) {
      expect(mapping.payment_id).not.toBeNull();
      expect(paymentIds.has(mapping.payment_id as never)).toBe(true);
    }
  });

  it("carries a refund's contribution negative, as a credit - debit figure", () => {
    const result = dataset("F02", SEED);
    const refunds = result.ground_truth.allocations.filter((a) => a.entity_type === "refund");
    expect(refunds.length).toBeGreaterThan(0);
    for (const allocation of refunds) {
      expect(allocation.net_paise).toBe(-allocation.gross_paise);
      expect(allocation.fee_paise).toBe(0);
      expect(allocation.tax_paise).toBe(0);
    }
  });

  it("carries a payment's contribution as gross - fee, with tax inside fee", () => {
    const result = dataset("F01", SEED);
    for (const allocation of result.ground_truth.allocations) {
      if (allocation.entity_type !== "payment") continue;
      expect(allocation.net_paise).toBe(allocation.gross_paise - allocation.fee_paise);
      expect(allocation.tax_paise).toBeLessThanOrEqual(allocation.fee_paise);
    }
  });

  it("authors no ambiguity label anywhere in ground truth", () => {
    const truth = dataset("F10", SEED).ground_truth;
    const keys = Object.keys(truth);
    expect(keys).not.toContain("is_ambiguous");
    expect(keys).not.toContain("correct_answer");
    expect(JSON.stringify(truth)).not.toContain("is_ambiguous");
  });
});
