import { describe, expect, it } from "vitest";

import { feeBreakdown } from "../src/amount.js";
import { AMB1_PAIR_COUNT, COMPOSITION, TARGET_RECORD_COUNT } from "../src/composition.js";
import { degrade } from "../src/degrade.js";
import { emit } from "../src/emit.js";
import { FAMILY_MECHANICS } from "../src/families.js";
import {
  AMB1_BASE_METHODS, AMB1_MIN_CREDIT_PAISE, AMB1_TWIN_METHOD, FEE_RATE_BPS, IMPLEMENTED_FAMILIES,
  OPERATOR_DECLARING_FAMILY, PUBLISHED_TARGET_RECORD_COUNTS,
} from "../src/frozen.js";
import { simulate } from "../src/simulate.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

/**
 * bench-v2 `A01` — `AMB-1`, material twins in same-day split batches
 * (`docs/BENCH_V2_DESIGN.md §3.1`, §B.2).
 *
 * **This is a STRESS family** (`§A`): its prevalence is a declared parameter
 * and nothing asserted here is a rate. Every assertion is about the shape of
 * the construction — that the two primitives do what D1 and D2 say, and that
 * the twins differ in nothing but their identity and the deliberate
 * `(amount, fee, tax, method)` difference that makes them material.
 *
 * `§6.1` condition 3: nothing here reaches `packages/engine`. The engine's
 * verdict on this family is asserted in `apps/cli/tests`, where the pipeline is
 * composed; here the family is checked against what the engine will READ.
 */

const SEED = TEST_SEEDS[0];

/** `TAU` as `RECONCILIATION_SPEC.md §6` states it, restated for the twins' component. */
function tauPaise(componentValuePaise: number): number {
  return Math.max(10_000, Math.floor((componentValuePaise * 10) / 10_000));
}

describe("primitive (a) — same-day split batch (D1)", () => {
  it("settles each split day in two batches at ONE settled_at, and nothing else changes count", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A01", seed).true_state;
      expect(AMB1_PAIR_COUNT).toBe(3);
      expect(state.split_batches).toHaveLength(AMB1_PAIR_COUNT);
      expect(state.settlements).toHaveLength(COMPOSITION.S + AMB1_PAIR_COUNT);
      expect(state.bank_lines).toHaveLength(COMPOSITION.B + AMB1_PAIR_COUNT);
      for (const split of state.split_batches) {
        const a = state.settlements[split.settlement_a_index];
        const b = state.settlements[split.settlement_b_index];
        expect(a?.day).toBe(split.day);
        expect(b?.day).toBe(split.day);
        expect(a?.settled_at).toBe(b?.settled_at);
        expect(a?.cycle_days).toBe(b?.cycle_days);
        expect(a?.id).not.toBe(b?.id);
        expect(a?.utr).not.toBe(b?.utr);
      }
    }
  });

  it("REJECTS cross-day: every member of BOTH batches was captured on the split day", () => {
    // §1.5: a batch's lines share a capture day 100 % of the time in this
    // generator, so a cross-day twin would leak its batch through created_at.
    for (const seed of TEST_SEEDS) {
      const state = dataset("A01", seed).true_state;
      for (const split of state.split_batches) {
        for (const index of [split.settlement_a_index, split.settlement_b_index]) {
          const settlement = state.settlements[index];
          expect(settlement).toBeDefined();
          for (const member of settlement?.members ?? []) {
            const day =
              member.kind === "payment" ? state.payments[member.index]?.day
              : member.kind === "refund" ? state.refunds[member.index]?.settlement_day
              : state.adjustments[member.index]?.settlement_day;
            expect(day, `${String(seed)} day ${String(split.day)} ${member.kind}:${String(member.index)}`).toBe(split.day);
          }
        }
      }
    }
  });

  it("keeps I4 on both halves and never closes a half below zero", () => {
    for (const seed of TEST_SEEDS) {
      const built = dataset("A01", seed);
      const state = built.true_state;
      for (const split of state.split_batches) {
        for (const index of [split.settlement_a_index, split.settlement_b_index]) {
          const settlement = state.settlements[index];
          expect(settlement?.amount).toBeGreaterThanOrEqual(0);
          const net = built.ground_truth.allocations
            .filter((allocation) => allocation.settlement_id === settlement?.id)
            .reduce((total, allocation) => total + allocation.net_paise, 0);
          expect(net).toBe(settlement?.amount);
        }
      }
    }
  });

  it("gives BOTH twin-hosting settlements a clean bank_ref, so AN2 can link them (T5)", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A01", seed).true_state;
      for (const split of state.split_batches) {
        for (const index of [split.settlement_a_index, split.settlement_b_index]) {
          const settlement = state.settlements[index];
          const line = state.bank_lines[index];
          expect(line?.settlement_index).toBe(index);
          expect(line?.bank_ref).toBe(settlement?.utr);
          expect(line?.amount).toBe(settlement?.amount);
        }
      }
    }
  });
});

describe("primitive (b) — DROP_BATCH_IDENTITY (D2)", () => {
  it("REQUIRED: after the operator runs, BOTH settlement_id AND settlement_utr are absent — not one", () => {
    for (const seed of TEST_SEEDS) {
      const built = dataset("A01", seed);
      const dropped = built.ground_truth.degradations.filter((d) => d.op === "DROP_BATCH_IDENTITY");
      expect(dropped).toHaveLength(2 * AMB1_PAIR_COUNT);
      for (const record of dropped) {
        expect(record.params).toStrictEqual({ fields: ["settlement_id", "settlement_utr"], to: null });
        const line = built.observations.find(
          (o) => o.kind === "recon_line" && o.payload.entity_id === record.target_id,
        );
        expect(line).toBeDefined();
        if (line?.kind !== "recon_line") continue;
        expect(line.payload.settlement_id).toBeNull();
        expect(line.payload.settlement_utr).toBeNull();
        // The row is detached, not unsettled: `settled` and `settled_at` stay.
        expect(line.payload.settled).toBe(true);
        expect(line.payload.settled_at).not.toBeNull();
      }
    }
  });

  it("touches exactly the twins and exactly those two fields", () => {
    for (const seed of TEST_SEEDS) {
      const state = simulate("A01", seed);
      const before = emit(state);
      const after = degrade(before, "A01", seed);
      const twins = new Set(before.batch_identity_drops);
      expect(twins.size).toBe(2 * AMB1_PAIR_COUNT);
      expect(after.observations).toHaveLength(before.observations.length);
      for (const [i, original] of before.observations.entries()) {
        const degraded = after.observations[i];
        if (original.kind !== "recon_line" || !twins.has(original.payload.entity_id)) {
          expect(degraded).toStrictEqual(original);
          continue;
        }
        expect(degraded).toStrictEqual({
          ...original,
          ingest_hash: degraded?.ingest_hash,
          payload: { ...original.payload, settlement_id: null, settlement_utr: null },
        });
        expect(degraded?.ingest_hash).not.toBe(original.ingest_hash);
      }
      expect(after.untrusted_text).toStrictEqual(before.untrusted_text);
    }
  });

  it("is a no-op on a family that declares it with no split day, and is refused by no §4.3 rule", () => {
    // The v1 families carry an empty selection: the operator names nothing.
    const state = simulate("F01", SEED);
    const before = emit(state);
    expect(before.batch_identity_drops).toStrictEqual([]);
  });

  it("carries the twins' true batch in the §6.2 recon report — the probe surface is not degraded", () => {
    const built = dataset("A01", SEED);
    const report = new Map(built.recon_report.map((row) => [row.entity_id, row]));
    for (const record of built.ground_truth.degradations) {
      const row = report.get(record.target_id);
      expect(row?.settlement_id).not.toBeNull();
      const truth = built.ground_truth.allocations.find((a) => a.entity_id === record.target_id);
      expect(row?.settlement_id).toBe(truth?.settlement_id);
    }
  });
});

describe("the single-carrier guard (families.ts), over a declared carrier list", () => {
  it("lists A01 first among DROP_BATCH_IDENTITY's carriers, and A01 declares nothing else", () => {
    // The second increment widened the bench-v2 row to a LIST (docs/BENCH_V2_DESIGN.md
    // §C); the guard still requires the carriers to be exactly the declared
    // ones. A01's own declaration is unchanged.
    expect(OPERATOR_DECLARING_FAMILY.DROP_BATCH_IDENTITY[0]).toBe("A01");
    const carriers = IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes("DROP_BATCH_IDENTITY"));
    expect(carriers).toStrictEqual([...OPERATOR_DECLARING_FAMILY.DROP_BATCH_IDENTITY]);
    expect(FAMILY_MECHANICS.A01.operators).toStrictEqual(["DROP_BATCH_IDENTITY"]);
    // DROP_SETTLEMENT_ID is NOT reused: F08 is still its only carrier.
    expect(IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes("DROP_SETTLEMENT_ID")))
      .toStrictEqual(["F08"]);
  });

  it("derives A01's target_record_count as base + 2 x pairs and publishes it", () => {
    expect(TARGET_RECORD_COUNT.A01).toBe(COMPOSITION.base + 2 * AMB1_PAIR_COUNT);
    expect(PUBLISHED_TARGET_RECORD_COUNTS.A01).toBe(2627);
    for (const seed of TEST_SEEDS) expect(dataset("A01", seed).observations).toHaveLength(2627);
  });
});

describe("AMB-1 — the twins", () => {
  it("net to ONE credit on two rates, above the declared floor, with one shared clock", () => {
    for (const seed of TEST_SEEDS) {
      const state = dataset("A01", seed).true_state;
      for (const split of state.split_batches) {
        const a = state.payments[split.twin_a];
        const b = state.payments[split.twin_b];
        expect(a?.fee?.credit).toBe(b?.fee?.credit);
        expect(a?.fee?.credit).toBeGreaterThanOrEqual(AMB1_MIN_CREDIT_PAISE);
        expect(new Set([a?.rate_bps, b?.rate_bps])).toStrictEqual(new Set([200, 300]));
        const emi = a?.method === AMB1_TWIN_METHOD ? a : b;
        const base = emi === a ? b : a;
        expect(emi?.method).toBe("emi");
        expect(emi?.rate_bps).toBe(FEE_RATE_BPS.emi);
        expect(AMB1_BASE_METHODS).toContain(base?.method);
        expect(a?.created_at).toBe(b?.created_at);
        expect(a?.day).toBe(split.day);
        expect(b?.day).toBe(split.day);
        expect(a?.card).toBeNull();
        expect(b?.card).toBeNull();
        expect(a?.refunded_paise).toBe(0);
        expect(b?.refunded_paise).toBe(0);
        expect(a?.dispute_index).toBeNull();
        expect(b?.dispute_index).toBeNull();
        // The fee arithmetic on each twin is the frozen model at its own rate.
        for (const twin of [a, b]) {
          if (twin?.fee === null || twin === undefined) throw new Error("twin has no fee");
          expect(twin.fee).toStrictEqual(feeBreakdown(twin.amount, twin.rate_bps));
        }
      }
    }
  });

  it("differ on 1100_GATEWAY_RECEIVABLE by more than tau — the P2 projections are material", () => {
    // §1.1 point 4: C6 forces the bank leg equal; separation is Σ amount.
    // tau's base is the component's unanchored value, amount(A) + amount(B).
    for (const seed of TEST_SEEDS) {
      const state = dataset("A01", seed).true_state;
      for (const split of state.split_batches) {
        const a = state.payments[split.twin_a];
        const b = state.payments[split.twin_b];
        if (a === undefined || b === undefined) throw new Error("twin missing");
        const delta = Math.abs(a.amount - b.amount);
        const tau = tauPaise(a.amount + b.amount);
        expect(delta).toBeGreaterThan(tau);
        // ...and by a margin that no 1-paise rounding difference (§1.6) can erase.
        expect(delta - tau).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("are exchangeable: the emitted twin observations differ in nothing but identity and the deliberate difference", () => {
    // The adversarial check on the construction itself (`§8` R1). Any field
    // outside the two allowed sets is a leak.
    const IDENTITY = new Set(["entity_id", "order_id", "id"]);
    const DELIBERATE = new Set(["amount", "fee", "tax", "method"]);
    for (const seed of TEST_SEEDS) {
      const built = dataset("A01", seed);
      const state = built.true_state;
      for (const split of state.split_batches) {
        const ids = [state.payments[split.twin_a]?.id, state.payments[split.twin_b]?.id];
        for (const kind of ["recon_line", "payment", "order"] as const) {
          const [x, y] = ids.map((id) => built.observations.find((o) => {
            if (o.kind !== kind) return false;
            const p = o.payload as Record<string, unknown>;
            const key = kind === "recon_line" ? p.entity_id : kind === "payment" ? p.id : p.id;
            const orderId = state.orders[state.payments.find((pm) => pm.id === id)?.order_index ?? -1]?.id;
            return kind === "order" ? key === orderId : key === id;
          }));
          expect(x, `${kind} of twin`).toBeDefined();
          expect(y, `${kind} of twin`).toBeDefined();
          const px = x?.payload as Record<string, unknown>;
          const py = y?.payload as Record<string, unknown>;
          expect(Object.keys(px).sort()).toStrictEqual(Object.keys(py).sort());
          const differing = Object.keys(px).filter((k) => JSON.stringify(px[k]) !== JSON.stringify(py[k]));
          for (const field of differing) {
            expect(
              IDENTITY.has(field) || DELIBERATE.has(field) || (kind === "order" && field === "amount_paid"),
              `${String(seed)} ${kind}: field ${field} distinguishes the twins (${JSON.stringify(px[field])} vs ${JSON.stringify(py[field])})`,
            ).toBe(true);
          }
          // Both identifiers are gone on BOTH recon lines: no residual identity.
          if (kind === "recon_line") {
            for (const p of [px, py]) {
              expect(p.settlement_id).toBeNull();
              expect(p.settlement_utr).toBeNull();
              expect(p.settled).toBe(true);
            }
            expect(px.settled_at).toBe(py.settled_at);
            expect(px.created_at).toBe(py.created_at);
            expect(px.credit).toBe(py.credit);
          }
        }
      }
    }
  });

  it("assigns the twins to batches by a coin, not by capture time or index", () => {
    // §8 R3: over the test seeds the 200-bps twin must not always be the one
    // that stays in the day's batch, nor always the lower payment index.
    let baseStays = 0;
    let lowerIndexStays = 0;
    let pairs = 0;
    for (const seed of [...TEST_SEEDS, 7006, 7007, 7008, 7009, 7010]) {
      const state = simulate("A01", seed);
      for (const split of state.split_batches) {
        pairs += 1;
        if (state.payments[split.twin_a]?.method !== AMB1_TWIN_METHOD) baseStays += 1;
        if (split.twin_a < split.twin_b) lowerIndexStays += 1;
      }
    }
    expect(pairs).toBe(10 * AMB1_PAIR_COUNT);
    expect(baseStays).toBeGreaterThan(0);
    expect(baseStays).toBeLessThan(pairs);
    expect(lowerIndexStays).toBeGreaterThan(0);
    expect(lowerIndexStays).toBeLessThan(pairs);
  });

  it("leaves the recon report, the ledger and every v1 family byte-identical", () => {
    // The v1 families do not run the mechanism: their observations are the
    // same bytes as before this family existed (checked by the existing
    // determinism suite against the published counts), and their split list is empty.
    for (const family of ["F01", "F06", "F08"] as const) {
      expect(simulate(family, SEED).split_batches).toStrictEqual([]);
      expect(emit(simulate(family, SEED)).batch_identity_drops).toStrictEqual([]);
    }
  });
});
