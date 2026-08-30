import { describe, expect, it } from "vitest";

import type { Observation } from "@assay/domain";

import { F05_SELECTED_SETTLEMENTS } from "../src/composition.js";
import { emit } from "../src/emit.js";
import { generateFamily } from "../src/generate.js";
import { buildReconReport, type ReconReportRow } from "../src/recon-report.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

/**
 * `apps/cli/src/artifacts/jsonl.ts`'s `encodeJsonl`, restated rather than
 * imported: this package holds ground truth and does not depend on the app that
 * writes it. The definition is one line —
 * `records.map((r) => JSON.stringify(r)).join("\n") + "\n"` — and it is what the
 * `PREREGISTRATION.md §9` step 4 digest is taken over, so the byte-stability
 * assertions below have to speak in exactly these bytes.
 */
const encodeJsonl = (rows: readonly ReconReportRow[]): string =>
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

/** Every `entity_id` a `ReconLine`-bearing observation carries, by kind. */
function observedReconLines(
  observations: readonly Observation[],
): Map<string, { settlement_id: string | null; settled_at: number | null }> {
  const out = new Map<string, { settlement_id: string | null; settled_at: number | null }>();
  for (const observation of observations) {
    if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
    const payload = observation.payload;
    out.set(payload.entity_id, {
      settlement_id: payload.settlement_id,
      settled_at: payload.settled_at,
    });
  }
  return out;
}

describe("§6.2 the PG-side recon report — the row", () => {
  it("carries settlement_id, entity_id and settled_at and NOTHING else", () => {
    // §6.2 states the column set as a closure, so the assertion is on the key
    // SET and not on the presence of three keys. The order is asserted too: it
    // is the serialized key order, and the digest is taken over those bytes.
    for (const family of ["F01", "F06", "F07"] as const) {
      for (const row of dataset(family, SEED).recon_report) {
        expect(Object.keys(row)).toStrictEqual(["settlement_id", "entity_id", "settled_at"]);
      }
    }
  });

  it("never carries a null entity_id — the order needs no null rule (M38)", () => {
    for (const seed of TEST_SEEDS) {
      for (const row of dataset("F02", seed).recon_report) {
        expect(typeof row.entity_id).toBe("string");
        expect(row.entity_id).toMatch(/^(pay|rfnd|adj)_[A-Za-z0-9]{14}$/);
      }
    }
  });

  it("nulls settlement_id and settled_at together — DATA_MODEL.md §6", () => {
    for (const seed of TEST_SEEDS) {
      for (const row of dataset("F06", seed).recon_report) {
        expect(row.settlement_id === null).toBe(row.settled_at === null);
      }
    }
  });
});

describe("§6.2 membership — one row per ReconLine the simulation produced", () => {
  it("is the captured payments, every refund and every adjustment", () => {
    for (const family of ["F02", "F07"] as const) {
      const built = dataset(family, SEED);
      const { payments, refunds, adjustments } = built.true_state;
      const captured = payments.filter((p) => p.captured && p.fee !== null);
      expect(built.recon_report).toHaveLength(captured.length + refunds.length + adjustments.length);

      const ids = new Set(built.recon_report.map((r) => r.entity_id));
      for (const payment of captured) expect(ids.has(payment.id)).toBe(true);
      for (const refund of refunds) expect(ids.has(refund.id)).toBe(true);
      for (const adjustment of adjustments) expect(ids.has(adjustment.id)).toBe(true);
    }
  });

  it("holds no row for an uncaptured payment — it produces no ReconLine at all", () => {
    // §6.2: "Uncaptured payments are a different case and remain absent: they
    // produce no ReconLine at all, so there is no row to include or omit."
    // This is NOT F05, which removes an observation of a line that does exist.
    const built = dataset("F05", SEED);
    const uncaptured = built.true_state.payments.filter((p) => !p.captured || p.fee === null);
    expect(uncaptured.length).toBeGreaterThan(0);

    const ids = new Set(built.recon_report.map((r) => r.entity_id));
    for (const payment of uncaptured) expect(ids.has(payment.id)).toBe(false);
  });

  it("includes a row whose settlement_id and settled_at are both null — M38", () => {
    // `F06`'s unsettled collision member is the payment-side case and
    // `PREREGISTRATION.md §4.2`'s UNSETTLED member the refund-side one. Such a
    // row is UNREACHABLE — `settlement_id` is the only query key — which §6.2
    // states as a fact independent of membership. It is emitted like any other.
    for (const seed of TEST_SEEDS) {
      const unsettled = dataset("F06", seed).recon_report.filter((r) => r.settlement_id === null);
      expect(unsettled.length).toBeGreaterThan(0);
      for (const row of unsettled) expect(row.settled_at).toBeNull();
    }
  });

  it("agrees with every surviving observation of the same line", () => {
    // The report and `emit.ts` read one settlement inversion, so on any line no
    // operator touched the two must state the same batch and the same instant.
    const built = dataset("F02", SEED);
    const observed = observedReconLines(built.observations);
    for (const row of built.recon_report) {
      const line = observed.get(row.entity_id);
      if (line === undefined) continue;
      expect(line.settlement_id).toBe(row.settlement_id);
      expect(line.settled_at).toBe(row.settled_at);
    }
  });
});

describe("§6.2 the report is pre-F05 and pre-operator", () => {
  it("keeps the F05-withheld row, which observations.jsonl does not carry", () => {
    // §6.2, derived: "the report may return an `entity_id` for which no
    // observation exists ... What was missing was never the source class — it
    // was a file able to hold a row the observations do not."
    const built = dataset("F05", SEED);
    const withheld = emit(built.true_state).withheld_recon_lines;
    expect(withheld).toHaveLength(F05_SELECTED_SETTLEMENTS);

    const reported = new Set(built.recon_report.map((r) => r.entity_id));
    const observed = observedReconLines(built.observations);
    for (const id of withheld) {
      expect(reported.has(id), `${id} must be in the report`).toBe(true);
      expect(observed.has(id), `${id} must be absent from the observations`).toBe(false);
    }

    // And the asymmetry is EXACTLY F05's — no other row differs, in either
    // direction. A widening of the gap fails here.
    const onlyInReport = [...reported].filter((id) => !observed.has(id)).sort();
    expect(onlyInReport).toStrictEqual([...withheld].sort());
    for (const id of observed.keys()) expect(reported.has(id)).toBe(true);
  });

  it("keeps the settlement_id F08's DROP_SETTLEMENT_ID nulled on the merchant's copy", () => {
    // §4.3 gives the operator as "Merchant-side recon copies that lack the PG's
    // batch identifier", so §6.2: "a line whose settlement_id was nulled by
    // §4.3's DROP_SETTLEMENT_ID still carries it in the report ... The key
    // therefore never fails on a conforming dataset."
    const built = dataset("F08", SEED);
    const dropped = built.ground_truth.degradations
      .filter((record) => record.op === "DROP_SETTLEMENT_ID")
      .map((record) => record.target_id);
    expect(dropped.length).toBeGreaterThan(0);

    const reported = new Map(built.recon_report.map((r) => [r.entity_id, r]));
    const observed = observedReconLines(built.observations);
    for (const id of dropped) {
      const row = reported.get(id);
      const line = observed.get(id);
      expect(line?.settlement_id, `${id} must be detached on the merchant's copy`).toBeNull();
      expect(row?.settlement_id, `${id} must keep its batch in the report`).not.toBeNull();
      // Only `settlement_id` moved: `settled_at` is untouched on both sides,
      // which is what makes the report a lookup rather than a second source.
      expect(row?.settled_at).toBe(line?.settled_at);
    }
  });

  it("is a function of the true state alone — degradation cannot reach it", () => {
    // `degrade()` takes an `Emission` and cannot take a `TrueState`, so the
    // report built from the state and the one `generateFamily` returns agree
    // for every family, including the four that declare operators.
    for (const family of ["F04", "F08", "F10"] as const) {
      const built = dataset(family, SEED);
      expect(buildReconReport(built.true_state)).toStrictEqual(built.recon_report);
    }
  });
});

describe("§6.2 row order — entity_id ascending, ratified at spec 1.4.24 (M38)", () => {
  it("orders rows by entity_id ascending, and the order is total", () => {
    for (const seed of TEST_SEEDS) {
      const rows = dataset("F07", seed).recon_report;
      for (let i = 1; i < rows.length; i += 1) {
        const previous = rows[i - 1]?.entity_id ?? "";
        const current = rows[i]?.entity_id ?? "";
        // Strict, not `<=`: §6.2 calls the order total, which holds only while
        // the ids are distinct. A duplicate would leave the sealed bytes
        // resting on a sort's stability rather than on the stated rule.
        expect(previous < current, `${previous} must sort before ${current}`).toBe(true);
      }
    }
  });

  it("does not order by settled_at or settlement_id", () => {
    // Both are nullable here, which is the reason M38 rejected them: either
    // would force a second ratification about where nulls sort. `F06` carries
    // unsettled rows, so an order keyed on either would have to place them.
    const rows = dataset("F06", SEED).recon_report;
    const asEmitted = rows.map((r) => r.entity_id);
    expect(asEmitted).toStrictEqual([...asEmitted].sort());

    // Ordering by either nullable key gives a different sequence, so the
    // ratified key is doing real work rather than agreeing with a candidate
    // M38 rejected. Neither comparator below is normative; both exist only to
    // show the report is not incidentally in one of those orders.
    expect([...rows].sort((a, b) => (a.settled_at ?? 0) - (b.settled_at ?? 0)).map((r) => r.entity_id))
      .not.toStrictEqual(asEmitted);
    expect([...rows].sort((a, b) => (a.settlement_id ?? "").localeCompare(b.settlement_id ?? "")).map((r) => r.entity_id))
      .not.toStrictEqual(asEmitted);
  });
});

describe("§7 byte-identical regeneration", () => {
  it("serializes to the same bytes twice at the same seed", () => {
    // The report is data here and bytes only in `apps/cli`, so byte-stability
    // is asserted through that app's exact encoder. `dataset()` memoizes, so
    // this deliberately calls `generateFamily` rather than reading the cache.
    for (const family of ["F06", "F08"] as const) {
      const a = generateFamily(family, SEED).recon_report;
      const b = generateFamily(family, SEED).recon_report;
      expect(encodeJsonl(a)).toBe(encodeJsonl(b));
    }
  });

  it("gives two distinct seeds distinct bytes and an identical row count", () => {
    const a = dataset("F02", TEST_SEEDS[0]).recon_report;
    const b = dataset("F02", TEST_SEEDS[1]).recon_report;
    expect(encodeJsonl(a)).not.toBe(encodeJsonl(b));
    expect(a).toHaveLength(b.length);
  });

  it("ends every line with LF and the file with a trailing newline", () => {
    const encoded = encodeJsonl(dataset("F01", SEED).recon_report);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(encoded).not.toContain("\r");
    expect(encoded.trimEnd().split("\n")).toHaveLength(dataset("F01", SEED).recon_report.length);
    // One row's bytes, in full: the three keys in §6.2's order and no other.
    expect(encoded.split("\n")[0]).toMatch(
      /^\{"settlement_id":(null|"setl_[A-Za-z0-9]{14}"),"entity_id":"(pay|rfnd|adj)_[A-Za-z0-9]{14}","settled_at":(null|\d+)\}$/,
    );
  });

  it("is frozen once built", () => {
    expect(Object.isFrozen(dataset("F01", SEED).recon_report)).toBe(true);
    expect(Object.isFrozen(dataset("F01", SEED).recon_report[0])).toBe(true);
  });
});
