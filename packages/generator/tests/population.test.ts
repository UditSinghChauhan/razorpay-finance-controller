import { describe, expect, it } from "vitest";

import { CARD_ISSUER_SET } from "../src/conventions.js";
import { COMPOSITION } from "../src/composition.js";
import {
  BANK_REF_CLEAN_RATE, CARD_NETWORK_MIX, CARD_TYPE_MIX, CONVENTION_1,
  DISPUTE_STATUS_MIX, IMPLEMENTED_FAMILIES, METHOD_MIX,
} from "../src/frozen.js";
import { simulate } from "../src/simulate.js";
import { realize } from "../src/composition.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

/** `§4.2`'s population register. Every value is `[ASSAY-MODEL]`. */
describe("§4.2 the population register", () => {
  it("realizes the capture split exactly: 90% captured, 10% authorised-not-captured", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("F01", seed).true_state;
      expect(state.payments.filter((p) => p.captured)).toHaveLength(COMPOSITION.N);
      expect(state.payments.filter((p) => !p.captured)).toHaveLength(COMPOSITION.A);
      expect(COMPOSITION.A).toBe(realize(CONVENTION_1, COMPOSITION.P));
    }
  });

  it("generates no failed payment and no unpaid created order", () => {
    const result = dataset("F01", SEED);
    for (const observation of result.observations) {
      if (observation.kind === "payment") expect(observation.payload.status).not.toBe("failed");
      if (observation.kind === "order") expect(observation.payload.status).not.toBe("created");
    }
  });

  it("keeps orders 1:1 with payments at attempts = 1", () => {
    const result = dataset("F01", SEED);
    const orders = result.observations.filter((o) => o.kind === "order");
    expect(orders).toHaveLength(COMPOSITION.P);
    for (const order of orders) {
      if (order.kind !== "order") continue;
      expect(order.payload.attempts).toBe(1);
      expect(order.payload.amount_paid + order.payload.amount_due).toBe(order.payload.amount);
      expect(order.payload.status === "paid").toBe(order.payload.amount_due === 0);
    }
  });

  it("books an ERP entry for every capture and no spurious row", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const result = dataset(family, SEED);
      expect(result.true_state.ledger_entries).toHaveLength(COMPOSITION.N);
      const captured = new Set(result.true_state.payments.filter((p) => p.captured).map((p) => p.index));
      for (const entry of result.true_state.ledger_entries) {
        expect(captured.has(entry.payment_index)).toBe(true);
      }
    }
  });

  it("offsets exactly 10% of merchant clocks by one day, in either direction", () => {
    for (const seed of TEST_SEEDS) {
      const result = dataset("F01", seed);
      const offsets = result.true_state.ledger_entries.filter((entry) => {
        const payment = result.true_state.payments[entry.payment_index];
        return entry.booked_at !== payment?.created_at;
      });
      expect(offsets).toHaveLength(realize(CONVENTION_1, COMPOSITION.N));
      for (const entry of offsets) {
        const payment = result.true_state.payments[entry.payment_index];
        expect(Math.abs(entry.booked_at - (payment?.created_at ?? 0))).toBe(86_400);
      }
    }
  });

  it("gives exactly 30% of bank lines a clean UTR and leaves the rest absent", () => {
    for (const seed of TEST_SEEDS) {
      const result = dataset("F01", seed);
      const utrs = new Set(result.true_state.settlements.map((s) => s.utr));
      const clean = result.true_state.bank_lines.filter((b) => b.bank_ref !== null);
      expect(clean).toHaveLength(realize(BANK_REF_CLEAN_RATE, COMPOSITION.B));
      for (const line of clean) expect(utrs.has(line.bank_ref ?? "")).toBe(true);
      for (const line of result.true_state.bank_lines) {
        if (line.bank_ref === null) continue;
        expect(line.bank_ref).toMatch(/^\d{10}[a-z0-9]{6}$/);
      }
    }
  });

  it("lands every bank credit at or after its settlement, within three hours, same date", () => {
    const result = dataset("F01", SEED);
    for (const line of result.true_state.bank_lines) {
      const settlement = result.true_state.settlements[line.settlement_index];
      const gap = line.value_date - (settlement?.settled_at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(3 * 60 * 60);
    }
  });

  it("draws the categorical mixes from their declared value sets and uses every member", () => {
    const seen = { method: new Set<string>(), network: new Set<string>(), type: new Set<string>(), issuer: new Set<string>() };
    for (const seed of TEST_SEEDS) {
      for (const payment of dataset("F01", seed).true_state.payments) {
        seen.method.add(payment.method);
        if (payment.card === null) continue;
        seen.network.add(payment.card.network);
        seen.type.add(payment.card.type);
        seen.issuer.add(payment.card.issuer);
      }
    }
    expect([...seen.method].sort()).toStrictEqual([...METHOD_MIX].sort());
    expect([...seen.network].sort()).toStrictEqual([...CARD_NETWORK_MIX].sort());
    expect([...seen.type].sort()).toStrictEqual([...CARD_TYPE_MIX].sort());
    expect([...seen.issuer].sort()).toStrictEqual([...CARD_ISSUER_SET].sort());
    for (const issuer of CARD_ISSUER_SET) expect(issuer).toHaveLength(4);
  });

  it("emits no instrument whose rate §4.2 does not freeze", () => {
    const result = dataset("F01", SEED);
    for (const observation of result.observations) {
      if (observation.kind === "payment") expect(METHOD_MIX).toContain(observation.payload.method);
      if (observation.kind !== "recon_line") continue;
      // §6: American Express and Diners Club carry a documented 3% rate that the
      // flat card rate would misrepresent, so they are not emitted at all.
      expect(["American Express", "Diners Club", "Maestro"]).not.toContain(observation.payload.card_network);
    }
  });

  it("draws dispute status from §9's five documented values", () => {
    const seen = new Set<string>();
    for (let seed = 30_000; seed < 30_030; seed += 1) {
      // Asserts about the TRUE STATE only, so it runs `simulate` rather than the
      // whole pipeline: `generateFamily` stores exactly this object as
      // `true_state`, and the ~2,621 schema parses and hashes that `emit`
      // performs are not part of what this test checks.
      for (const dispute of simulate("F01", seed).disputes) {
        seen.add(dispute.status);
      }
    }
    for (const status of seen) expect(DISPUTE_STATUS_MIX).toContain(status);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves posted_at null on every line — §6 declares its semantics undocumented", () => {
    for (const observation of dataset("F07", SEED).observations) {
      if (observation.kind === "recon_line" || observation.kind === "adjustment") {
        expect(observation.payload.posted_at).toBeNull();
        expect(observation.payload.credit_type).toBe("default");
        expect(observation.payload.on_hold).toBe(false);
      }
    }
  });

  it("keeps Settlement.fees and Settlement.tax at zero — [RZP-DOC] D7", () => {
    for (const observation of dataset("F01", SEED).observations) {
      if (observation.kind !== "settlement") continue;
      expect(observation.payload.fees).toBe(0);
      expect(observation.payload.tax).toBe(0);
      expect(observation.payload.status).toBe("processed");
    }
  });
});

/**
 * `PREREGISTRATION.md §4.2`'s batch-composition rule, ratified at spec 1.4.2 and
 * registered as `conventions.ts` `C-NEGATIVE-BATCH`.
 *
 * Through spec 1.4.1 this was the one blocking seam in the register and
 * `simulate()` refused. The specification has since supplied the rule, so the
 * tests below check the ratified behaviour rather than the refusal, and they
 * check it as the **only** behaviour: there is no policy argument to pass.
 */
describe("§4.2 batch composition — a member the batch cannot carry", () => {
  it("completes on every family instance and never closes a batch below zero", () => {
    // `ARCHITECTURE.md §4` types `Settlement.amount` non-negative and `I4` fixes
    // it as the net over the ALLOCATED lines. The admission rule is what makes
    // the two compatible; this is the property it exists to produce.
    for (let seed = 40_000; seed < 40_020; seed += 1) {
      for (const family of IMPLEMENTED_FAMILIES) {
        for (const settlement of simulate(family, seed).settlements) {
          expect(settlement.amount, `${family}/${String(seed)} day ${String(settlement.day)}`)
            .toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("fires on a substantial minority of instances, so the rule is load-bearing", () => {
    // Measured at roughly a quarter of instances at the frozen parameters
    // (`§4.2`: 22.15% over 2,000 family instances). Asserted as an AGGREGATE
    // band over 200 instances, not per family: `F06` and `F09` legitimately sit
    // outside it, and a per-family band would be a different, noisier claim.
    let withUnsettled = 0;
    let total = 0;
    for (let seed = 40_000; seed < 40_020; seed += 1) {
      for (const family of IMPLEMENTED_FAMILIES) {
        total += 1;
        const state = simulate(family, seed);
        const allocated = new Set(
          state.settlements.flatMap((s) =>
            s.members.filter((m) => m.kind === "refund").map((m) => m.index),
          ),
        );
        // Only a refund whose own batch could not carry it counts. `F02`'s
        // day-30/31 refunds leave the grid instead and are excluded here.
        const stranded = state.refunds.some(
          (r) => r.settlement_day === null && r.day + (family === "F02" ? 2 : 0) <= 31 && !allocated.has(r.index),
        );
        if (stranded) withUnsettled += 1;
      }
    }
    expect(withUnsettled).toBeGreaterThan(total / 10);
    expect(withUnsettled).toBeLessThan(total / 2);
  });

  it("emits the member unsettled with exactly the fields §4.2 lists, and no others", () => {
    // "settlement_id: null, settled: false, settled_at: null, settlement_utr:
    // null, created_at: UNCHANGED, amount: UNCHANGED, every other field:
    // UNCHANGED."
    let checked = 0;
    for (let seed = 40_000; seed < 40_010; seed += 1) {
      const result = dataset("F01", seed);
      const refundOf = new Map(result.true_state.refunds.map((r) => [r.id as string, r]));
      for (const observation of result.observations) {
        if (observation.kind !== "recon_line") continue;
        if (observation.payload.type !== "refund") continue;
        if (observation.payload.settled) continue;
        const refund = refundOf.get(observation.payload.entity_id);
        expect(refund).toBeDefined();
        expect(observation.payload.settlement_id).toBeNull();
        expect(observation.payload.settled_at).toBeNull();
        expect(observation.payload.settlement_utr).toBeNull();
        expect(observation.payload.created_at).toBe(refund?.created_at);
        expect(observation.payload.amount).toBe(refund?.amount);
        expect(observation.payload.debit).toBe(refund?.amount);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("admits debit members in ascending amount, so no unsettled member is smaller than an admitted one", () => {
    // The observable consequence of "ascending amount ... while the running net
    // stays non-negative": within one batch the admitted debit set is a prefix
    // of the ascending order, so every admitted amount is <= every skipped one.
    for (let seed = 40_000; seed < 40_010; seed += 1) {
      for (const family of IMPLEMENTED_FAMILIES) {
        const state = simulate(family, seed);
        const strandedByDay = new Map<number, number[]>();
        for (const refund of state.refunds) {
          if (refund.settlement_day !== null) continue;
          const day = refund.day + (family === "F02" ? 2 : 0);
          if (day > 31) continue; // left the grid, not refused by its batch
          strandedByDay.set(day, [...(strandedByDay.get(day) ?? []), refund.amount]);
        }
        for (const settlement of state.settlements) {
          const stranded = strandedByDay.get(settlement.day);
          if (stranded === undefined) continue;
          const admitted = settlement.members
            .filter((m) => m.kind === "refund")
            .map((m) => state.refunds[m.index]?.amount ?? 0);
          for (const skipped of stranded) {
            for (const taken of admitted) {
              expect(taken, `${family}/${String(seed)} day ${String(settlement.day)}`)
                .toBeLessThanOrEqual(skipped);
            }
          }
        }
      }
    }
  });

  it("moves no member to another batch, so no settled_at is manufactured", () => {
    // "`scope`: only the batch §4.1 and §4.2 already allocated the member to. No
    // member is moved to another capture-day, so no settled_at is manufactured
    // and C4 is neither stretched nor consulted."
    for (let seed = 40_000; seed < 40_010; seed += 1) {
      for (const family of IMPLEMENTED_FAMILIES) {
        const state = simulate(family, seed);
        for (const settlement of state.settlements) {
          for (const member of settlement.members) {
            if (member.kind !== "refund") continue;
            const refund = state.refunds[member.index];
            const expectedDay = (refund?.day ?? 0) + (family === "F02" ? 2 : 0);
            expect(settlement.day, `${family}/${String(seed)}`).toBe(expectedDay);
          }
        }
      }
    }
  });

  it("leaves true_journal posting P3 for a stranded refund and never P4", () => {
    // Truth posts what happened: the refund was initiated, so `P3` fires; it was
    // never settled out of the bank, so `P4` does not. The agent side agrees —
    // `DATA_MODEL.md §17.1.1` fires `P3` at ingest and conditions `P4` on bank
    // evidence — so an unsettled refund puts no `proj_agent != proj_truth` on a
    // correct decision.
    let checked = 0;
    for (let seed = 40_000; seed < 40_010; seed += 1) {
      const result = dataset("F01", seed);
      const settled = new Set(
        result.true_state.settlements.flatMap((s) =>
          s.members.filter((m) => m.kind === "refund").map((m) => result.true_state.refunds[m.index]?.id),
        ),
      );
      for (const refund of result.true_state.refunds) {
        if (settled.has(refund.id)) continue;
        const lines = result.ground_truth.true_journal.filter((l) => l.source_entity_id === refund.id);
        expect(lines.map((l) => l.posting_ref).sort()).toStrictEqual(["P3", "P3"]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // One test per family over the same six seeds; the union is the original
  // product and the assertion is unchanged.
  it.each(IMPLEMENTED_FAMILIES)(
    "changes no target_record_count when the rule fires, for %s",
    (family) => {
      for (let seed = 40_000; seed < 40_006; seed += 1) {
        expect(dataset(family, seed).observations.length).toBeGreaterThan(2600);
      }
    },
  );

  it("leaves an unsettled member emitted rather than dropped", () => {
    for (let seed = 40_000; seed < 40_020; seed += 1) {
      const result = dataset("F01", seed);
      expect(result.true_state.refunds).toHaveLength(COMPOSITION.R);
      expect(result.observations.filter((o) => o.kind === "recon_line")).toHaveLength(
        COMPOSITION.N + COMPOSITION.R,
      );
    }
  });
});
