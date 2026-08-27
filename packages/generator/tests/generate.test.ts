import { describe, expect, it } from "vitest";

import { ObservationSchema, hasAssayPrefix, hasRazorpayPrefix, isObservationId } from "@assay/domain";
import { UntrustedTextSchema } from "@assay/domain/untrusted-text";
import { hashCanonical } from "@assay/ledger";

import { COMPOSITION, TARGET_RECORD_COUNT } from "../src/composition.js";
import { generateFamily } from "../src/generate.js";
import { IMPLEMENTED_FAMILIES, PUBLISHED_TARGET_RECORD_COUNTS } from "../src/frozen.js";
import { PERIOD_FROM, PERIOD_TO } from "../src/period.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

describe("exact target counts", () => {
  it.each(IMPLEMENTED_FAMILIES)("emits %s's frozen target_record_count", (family) => {
    const result = dataset(family, SEED);
    expect(result.observations).toHaveLength(PUBLISHED_TARGET_RECORD_COUNTS[family]);
    expect(result.observations).toHaveLength(TARGET_RECORD_COUNT[family]);
  });

  // One independently executable test per family; the union covers exactly the
  // original family x seed product and the assertion is unchanged.
  it.each(IMPLEMENTED_FAMILIES)(
    "holds %s's count on every seed — no count-affecting quantity is drawn",
    (family) => {
      for (const seed of TEST_SEEDS) {
        expect(dataset(family, seed).observations).toHaveLength(
          PUBLISHED_TARGET_RECORD_COUNTS[family],
        );
      }
    },
  );

  it("realizes the per-kind composition base(P) implies", () => {
    const result = dataset("F01", SEED);
    const byKind = countByKind(result.observations);
    const { P, N, R, D, S, B, Adj } = COMPOSITION;
    expect(byKind).toStrictEqual({
      order: P, payment: P, recon_line: N + R, ledger_entry: N,
      refund: R, dispute: D, settlement: S, bank_line: B, adjustment: Adj,
    });
  });
});

describe("deterministic repeatability", () => {
  it("produces byte-identical output for the same seed", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const a = dataset(family, SEED);
      const b = dataset(family, SEED);
      expect(digest(a)).toBe(digest(b));
    }
  });

  it("reads no clock: `ingested_at` is a frozen period value, not `Date.now()`", () => {
    const result = dataset("F01", SEED);
    for (const observation of result.observations) {
      expect(observation.ingested_at).toBe(PERIOD_TO);
    }
  });
});

describe("seed isolation", () => {
  it("changes content between seeds while holding every count", () => {
    const a = dataset("F01", TEST_SEEDS[0]);
    const b = dataset("F01", TEST_SEEDS[1]);
    expect(digest(a)).not.toBe(digest(b));
    expect(a.observations).toHaveLength(b.observations.length);
    expect(countByKind(a.observations)).toStrictEqual(countByKind(b.observations));
  });

  it("changes content between families at one seed", () => {
    expect(digest(dataset("F01", SEED)))
      .not.toBe(digest(dataset("F02", SEED)));
  });

  it("shares no identifier across two seeds of one family", () => {
    const a = new Set(dataset("F01", TEST_SEEDS[0]).observations.map((o) => o.obs_id));
    const b = dataset("F01", TEST_SEEDS[1]).observations.map((o) => o.obs_id);
    expect(b.some((id) => a.has(id))).toBe(false);
  });
});

describe("schema validity and the trust boundary", () => {
  it("parses every observation and every quarantined row against the frozen schema", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const result = dataset(family, SEED);
      for (const observation of result.observations) {
        expect(() => ObservationSchema.parse(observation)).not.toThrow();
      }
      for (const row of result.untrusted_text) {
        expect(() => UntrustedTextSchema.parse(row)).not.toThrow();
      }
    }
  });

  it("recomputes every ingest_hash from the payload it claims to cover", () => {
    const result = dataset("F08", SEED);
    for (const observation of result.observations) {
      expect(observation.ingest_hash).toBe(hashCanonical(observation.payload as never));
    }
  });

  it("stamps provenance on every record: nothing enters anonymously", () => {
    const result = dataset("F01", SEED);
    const lines = new Map<string, Set<number>>();
    for (const observation of result.observations) {
      expect(observation.source_file).toMatch(/^[a-z_]+\.jsonl$/);
      expect(observation.source_line).toBeGreaterThan(0);
      const seen = lines.get(observation.source_file) ?? new Set<number>();
      expect(seen.has(observation.source_line)).toBe(false);
      seen.add(observation.source_line);
      lines.set(observation.source_file, seen);
    }
  });

  it.each(IMPLEMENTED_FAMILIES)(
    "keeps every free-text field out of every structural record, for %s",
    (family) => {
      const result = dataset(family, SEED);
      for (const observation of result.observations) {
        const keys = Object.keys(observation.payload as object);
        for (const banned of ["receipt", "notes", "description", "narration", "memo", "order_receipt"]) {
          expect(keys).not.toContain(banned);
        }
      }
    },
  );

  it("keeps every quarantined row keyed to a real observation", () => {
    const result = dataset("F10", SEED);
    const ids = new Set(result.observations.map((o) => o.obs_id));
    for (const row of result.untrusted_text) {
      expect(ids.has(row.obs_id)).toBe(true);
      expect(["order_receipt", "narration", "memo", "notes"]).toContain(row.field);
    }
  });
});

describe("ID grammar", () => {
  it("mints every Razorpay identifier to DATA_MODEL.md §0 rule 3's grammar", () => {
    const result = dataset("F07", SEED);
    const grammars: Record<string, RegExp> = {
      pay_: /^pay_[A-Za-z0-9]{14}$/, order_: /^order_[A-Za-z0-9]{14}$/,
      rfnd_: /^rfnd_[A-Za-z0-9]{14}$/, setl_: /^setl_[A-Za-z0-9]{14}$/,
      adj_: /^adj_[A-Za-z0-9]{14}$/, disp_: /^disp_[A-Za-z0-9]{14}$/,
    };
    let checked = 0;
    for (const id of allIdentifiers(result)) {
      if (!hasRazorpayPrefix(id)) continue;
      const prefix = Object.keys(grammars).find((p) => id.startsWith(p));
      expect(prefix).toBeDefined();
      expect(id).toMatch(grammars[prefix ?? ""] ?? /^$/);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("keeps ASSAY-owned identifiers on their own prefixes, never confusable with Razorpay's", () => {
    const result = dataset("F04", SEED);
    for (const observation of result.observations) {
      expect(isObservationId(observation.obs_id)).toBe(true);
      expect(hasRazorpayPrefix(observation.obs_id)).toBe(false);
      expect(hasAssayPrefix(observation.obs_id)).toBe(true);
    }
  });

  it("mints every identifier at most once across the whole dataset", () => {
    // Cross-references legitimately repeat an id (a payment id appears on its
    // own row, on its recon line and on its dispute), so uniqueness is asserted
    // over the MINTED set: each entity's own identifier, plus every obs_id.
    const result = dataset("F06", SEED);
    const state = result.true_state;
    const minted = [
      ...state.orders.map((x) => x.id), ...state.payments.map((x) => x.id),
      ...state.refunds.map((x) => x.id), ...state.disputes.map((x) => x.id),
      ...state.adjustments.map((x) => x.id), ...state.settlements.map((x) => x.id),
      ...state.bank_lines.map((x) => x.id), ...state.ledger_entries.map((x) => x.id),
      ...result.observations.map((o) => o.obs_id),
    ];
    expect(new Set(minted).size).toBe(minted.length);
    expect(minted.length).toBeGreaterThan(4000);
  });
});

describe("period boundaries", () => {
  it("keeps every capture inside [period.from, period.to]", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const state = dataset(family, SEED).true_state;
      for (const payment of state.payments) {
        expect(payment.created_at).toBeGreaterThanOrEqual(PERIOD_FROM);
        expect(payment.created_at).toBeLessThanOrEqual(PERIOD_TO);
      }
    }
  });

  it("lets settlements, bank credits and ERP bookings follow their own clocks", () => {
    const state = dataset("F09", SEED).true_state;
    expect(state.settlements.some((s) => s.settled_at > PERIOD_TO)).toBe(true);
    expect(state.bank_lines.some((b) => b.value_date > PERIOD_TO)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

function digest(result: ReturnType<typeof generateFamily>): string {
  return hashCanonical({
    observations: result.observations as never,
    untrusted_text: result.untrusted_text as never,
    ground_truth: result.ground_truth as never,
  });
}

function countByKind(observations: readonly { kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {
    order: 0, payment: 0, recon_line: 0, ledger_entry: 0,
    refund: 0, dispute: 0, settlement: 0, bank_line: 0, adjustment: 0,
  };
  for (const observation of observations) out[observation.kind] = (out[observation.kind] ?? 0) + 1;
  return out;
}

function allIdentifiers(result: ReturnType<typeof generateFamily>): string[] {
  const out: string[] = [];
  for (const observation of result.observations) {
    out.push(observation.obs_id);
    for (const value of Object.values(observation.payload as Record<string, unknown>)) {
      if (typeof value === "string" && (hasRazorpayPrefix(value) || hasAssayPrefix(value))) out.push(value);
    }
  }
  return out;
}
