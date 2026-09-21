import { describe, expect, it } from "vitest";

import { simulate, type TrueState } from "../src/simulate.js";
import { dataset } from "./fixtures.js";

/**
 * bench-v2 `AMB-1`, exchangeability MEASURED (`docs/BENCH_V2_DESIGN.md §8` R1,
 * R3; `§C` A3).
 *
 * The construction's claim is that, once the batch identity is gone, nothing
 * on or around the two twins says which batch each came from. The previous
 * increment checked that claim field by field at five seeds and found one
 * residual difference outside the observations `S2` reads — the merchant
 * ledger's 10 % `booked_at` offset (`§B.3`). This file does not remove the
 * offset (`§9.10`): an independent difference is evidence the construction
 * is not scrubbed. It measures, over many seeds, that the offset — and every
 * other differing field — lands on the twin that STAYS in the day's own batch
 * and on the twin that MOVES to the second batch at the same rate, and pins
 * that rate. A rigged construction shows up here as a skew; a coin does not.
 *
 * "Stay" and "move" are the fixed frame: `settlement_a` keeps the day's id,
 * cycle and instant and `settlement_b` is the appended batch, so the stay twin
 * is the truth twin of the day's own batch and the decoy of the other.
 *
 * `§6.1` condition 3: nothing here reaches `packages/engine`. Condition 4: no
 * assertion message carries a payload value — field NAMES and COUNTS only.
 */

/** Two hundred seeds, none in `§6.1` (the fixtures' rule, applied to a range). */
const OFFSET_SEEDS = Array.from({ length: 200 }, (_, i) => 7001 + i);
/** Forty seeds for the per-field sweep, which needs the emission. */
const FIELD_SEEDS = Array.from({ length: 40 }, (_, i) => 7001 + i);

function stayAndMove(state: TrueState, split: TrueState["split_batches"][number]) {
  const stay = state.payments[split.twin_a];
  const move = state.payments[split.twin_b];
  if (stay === undefined || move === undefined) throw new Error("twin missing");
  return { stay, move };
}

function hasOffset(state: TrueState, paymentIndex: number): boolean {
  const entry = state.ledger_entries.find((l) => l.payment_index === paymentIndex);
  const payment = state.payments[paymentIndex];
  if (entry === undefined || payment === undefined) throw new Error("ledger entry missing");
  return entry.booked_at !== payment.created_at;
}

describe("the merchant-clock offset lands on the stay twin and the move twin at the same rate", () => {
  it.each(["A01", "A02", "A03"] as const)("%s: over 200 seeds the single-offset pairs split near one half", (family) => {
    let pairs = 0;
    let stayOnly = 0;
    let moveOnly = 0;
    let both = 0;
    for (const seed of OFFSET_SEEDS) {
      const state = simulate(family, seed);
      for (const split of state.split_batches) {
        pairs += 1;
        const { stay, move } = stayAndMove(state, split);
        const s = hasOffset(state, stay.index);
        const m = hasOffset(state, move.index);
        if (s && m) both += 1;
        else if (s) stayOnly += 1;
        else if (m) moveOnly += 1;
      }
    }
    expect(pairs).toBe(3 * OFFSET_SEEDS.length);
    // The offset is drawn from the `merchant` stream, the batch from the
    // family's; independence makes the expected share exactly one half. With
    // ~55 single-offset pairs the two-sided 99 % band on a fair coin is about
    // [0.33, 0.67]; a leak would sit at 0 or 1.
    const single = stayOnly + moveOnly;
    expect(single).toBeGreaterThanOrEqual(30);
    const share = stayOnly / single;
    expect(share).toBeGreaterThanOrEqual(0.33);
    expect(share).toBeLessThanOrEqual(0.67);
    // And the offset is neither absent nor universal on the twins: ~10 % each.
    expect(both).toBeLessThan(single);
  });
});

describe("no field on any twin-related observation correlates with which twin stayed", () => {
  /**
   * For every field of every observation the twins own — `recon_line`,
   * `payment`, `order`, `ledger_entry`, the envelope (`obs_id`, `source_line`,
   * `ingest_hash`) and the quarantined text (`order_receipt`, `memo`) — the
   * sign of `compare(stay, move)` over 120 pairs. A field is either IDENTICAL
   * on every pair, or a COIN (its non-equal comparisons split within a band),
   * or a LEAK. The band is the same as above; a structural leak is 120:0.
   */
  it("A01: every differing field is a coin; every other field is identical", () => {
    const cmp = (a: unknown, b: unknown): number => {
      if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
      const x = JSON.stringify(a);
      const y = JSON.stringify(b);
      return x < y ? -1 : x > y ? 1 : 0;
    };
    const stats = new Map<string, { lt: number; eq: number; gt: number }>();
    const bump = (key: string, c: number): void => {
      const s = stats.get(key) ?? { lt: 0, eq: 0, gt: 0 };
      if (c < 0) s.lt += 1;
      else if (c > 0) s.gt += 1;
      else s.eq += 1;
      stats.set(key, s);
    };
    let pairs = 0;
    for (const seed of FIELD_SEEDS) {
      const built = dataset("A01", seed);
      const state = built.true_state;
      const text = new Map(built.untrusted_text.map((t) => [`${t.obs_id}:${t.field}`, t]));
      for (const split of state.split_batches) {
        pairs += 1;
        const { stay, move } = stayAndMove(state, split);
        const ledgerId = (p: typeof stay): string => state.ledger_entries.find((l) => l.payment_index === p.index)?.id ?? "";
        const orderId = (p: typeof stay): string => state.orders[p.order_index]?.id ?? "";
        const pick = (kind: string, p: typeof stay) => built.observations.find((o) => {
          if (o.kind !== kind) return false;
          const payload = o.payload as Record<string, unknown>;
          switch (kind) {
            case "recon_line": return payload.entity_id === p.id;
            case "payment": return payload.id === p.id;
            case "order": return payload.id === orderId(p);
            default: return payload.ledger_entry_id === ledgerId(p);
          }
        });
        for (const kind of ["recon_line", "payment", "order", "ledger_entry"] as const) {
          const x = pick(kind, stay);
          const y = pick(kind, move);
          if (x === undefined || y === undefined) throw new Error(`${kind} of a twin is missing`);
          for (const f of ["obs_id", "source_line", "ingest_hash"] as const) bump(`${kind}.${f}`, cmp(x[f], y[f]));
          const px = x.payload as Record<string, unknown>;
          const py = y.payload as Record<string, unknown>;
          for (const f of Object.keys(px)) bump(`${kind}.payload.${f}`, cmp(px[f], py[f]));
          for (const f of ["order_receipt", "memo"]) {
            const tx = text.get(`${x.obs_id}:${f}`);
            const ty = text.get(`${y.obs_id}:${f}`);
            if (tx !== undefined || ty !== undefined) bump(`${kind}.text.${f}`, cmp(tx?.raw, ty?.raw));
          }
        }
      }
    }
    expect(pairs).toBe(3 * FIELD_SEEDS.length);
    const leaks: string[] = [];
    const coins: string[] = [];
    for (const [field, s] of stats) {
      if (s.eq === pairs) continue;
      const nonEqual = s.lt + s.gt;
      const share = Math.max(s.lt, s.gt) / nonEqual;
      if (share > 0.67) leaks.push(`${field} (${String(s.lt)}:${String(s.gt)})`);
      else coins.push(field);
    }
    expect(leaks, `fields skewed towards one twin: ${leaks.join(", ")}`).toStrictEqual([]);
    // The coins are exactly the identity fields, the deliberate difference,
    // the envelope (minted and line-numbered in payment-index order, and the
    // index is a coin), and the merchant offset.
    expect(coins.sort()).toStrictEqual([
      "ledger_entry.ingest_hash", "ledger_entry.obs_id", "ledger_entry.payload.booked_at",
      "ledger_entry.payload.expected_net_paise", "ledger_entry.payload.gross_paise",
      "ledger_entry.payload.invoice_no", "ledger_entry.payload.ledger_entry_id",
      "ledger_entry.payload.order_ref", "ledger_entry.source_line", "ledger_entry.text.memo",
      "order.ingest_hash", "order.obs_id", "order.payload.amount", "order.payload.amount_paid",
      "order.payload.id", "order.source_line", "order.text.order_receipt",
      "payment.ingest_hash", "payment.obs_id", "payment.payload.amount", "payment.payload.id",
      "payment.payload.method", "payment.payload.order_id", "payment.source_line",
      "recon_line.ingest_hash", "recon_line.obs_id", "recon_line.payload.amount",
      "recon_line.payload.entity_id", "recon_line.payload.fee", "recon_line.payload.method",
      "recon_line.payload.order_id", "recon_line.payload.tax", "recon_line.source_line",
    ]);
  });

  it("A01: the one asymmetry is on the TARGETS — the appended batch is emitted last — and it names no twin", () => {
    // `settlement_b` is appended after the 31 day batches, so its settlement
    // and bank-line observations always carry a later `source_line`. That
    // tells a reader which of the two batches is the split-off one. It does
    // not tell them which twin is in it: the twin-to-batch coin is
    // independent of everything, which the two sweeps above measure. Pinned
    // so the asymmetry is recorded rather than discovered.
    let pairs = 0;
    let bLater = 0;
    let emiStays = 0;
    let lowerIndexStays = 0;
    for (const seed of FIELD_SEEDS) {
      const built = dataset("A01", seed);
      const state = built.true_state;
      for (const split of state.split_batches) {
        pairs += 1;
        const { stay, move } = stayAndMove(state, split);
        if (stay.method === "emi") emiStays += 1;
        if (stay.index < move.index) lowerIndexStays += 1;
        const line = (index: number): number => {
          const id = state.settlements[index]?.id;
          const obs = built.observations.find((o) => o.kind === "settlement" && o.payload.id === id);
          if (obs === undefined) throw new Error("settlement observation missing");
          return obs.source_line;
        };
        if (line(split.settlement_b_index) > line(split.settlement_a_index)) bLater += 1;
      }
    }
    expect(bLater).toBe(pairs);
    for (const count of [emiStays, lowerIndexStays]) {
      expect(count / pairs).toBeGreaterThanOrEqual(0.33);
      expect(count / pairs).toBeLessThanOrEqual(0.67);
    }
  });
});
