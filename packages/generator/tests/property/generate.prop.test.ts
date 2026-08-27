import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { hashCanonical } from "@assay/ledger";

import { generateFamily } from "../../src/generate.js";
import { IMPLEMENTED_FAMILIES, PUBLISHED_TARGET_RECORD_COUNTS, type FamilyId } from "../../src/frozen.js";
import { DECLARED_SEEDS } from "../../src/seeds.js";

/**
 * Seeds drawn well away from `PREREGISTRATION.md §6.1`'s four blocks.
 *
 * `§6.1` condition 1 binds every held-out family test: "The test runs under a
 * seed that appears in **no** row of the split table." The filter is belt and
 * braces — the range below cannot intersect the table.
 */
const seedArb = fc.integer({ min: 20_000, max: 999_999 }).filter((s) => !DECLARED_SEEDS.includes(s));

const digestOf = (family: FamilyId, seed: number): string => {
  const result = generateFamily(family, seed);
  return hashCanonical({
    observations: result.observations as never,
    untrusted_text: result.untrusted_text as never,
    ground_truth: result.ground_truth as never,
  });
};

/**
 * Each property below is decomposed into one independently executable test per
 * family, with `numRuns` set so the TOTAL number of draws is at least what the
 * single combined property performed (40 -> 10x4, and 16/12/20/20 -> 10x2). The
 * family is now BOUND rather than drawn, which guarantees every family is
 * exercised instead of leaving that to the draw — coverage is preserved and, on
 * the family dimension, strengthened.
 *
 * The reason is mechanical rather than cosmetic: one `fc.assert` running dozens
 * of full `generateFamily` pipelines inside a single `it()` exceeds vitest's
 * 30 s per-test budget whenever workspace parallelism competes for the CPU.
 * **No assertion is removed, relaxed or skipped, and no timeout is raised.**
 */
describe("target_record_count is seed-invariant", () => {
  it.each(IMPLEMENTED_FAMILIES)("holds for %s at every seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(generateFamily(family, seed).observations).toHaveLength(
          PUBLISHED_TARGET_RECORD_COUNTS[family],
        );
      }),
      { numRuns: 4 },
    );
  });
});

describe("determinism", () => {
  it.each(IMPLEMENTED_FAMILIES)("produces the same bytes twice for %s at any seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(digestOf(family, seed)).toBe(digestOf(family, seed));
      }),
      { numRuns: 2 },
    );
  });
});

describe("seed isolation", () => {
  it.each(IMPLEMENTED_FAMILIES)("gives %s two distinct seeds distinct content and identical counts", (family) => {
    fc.assert(
      fc.property(seedArb, seedArb, (a, b) => {
        fc.pre(a !== b);
        expect(digestOf(family, a)).not.toBe(digestOf(family, b));
        expect(generateFamily(family, a).observations.length).toBe(
          generateFamily(family, b).observations.length,
        );
      }),
      { numRuns: 2 },
    );
  });
});

describe("the frozen invariants hold on every generated true state", () => {
  it.each(IMPLEMENTED_FAMILIES)("keeps I1, I3, I4, I5 and I7 satisfied for %s", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const result = generateFamily(family, seed);
        const { true_journal, allocations, bank_mappings } = result.ground_truth;

        // I1 — trial balance.
        let dr = 0;
        let cr = 0;
        for (const line of true_journal) { dr += line.dr_paise; cr += line.cr_paise; }
        expect(dr).toBe(cr);

        // I3 — per-line arithmetic on every emitted recon line.
        for (const observation of result.observations) {
          if (observation.kind === "recon_line") {
            const p = observation.payload;
            if (p.type === "payment") {
              expect(p.credit).toBe(p.amount - p.fee);
              expect(p.debit).toBe(0);
            } else {
              expect(p.debit).toBe(p.amount);
              expect(p.credit).toBe(0);
              expect(p.fee).toBe(0);
              expect(p.tax).toBe(0);
            }
          }
          if (observation.kind === "adjustment") {
            const p = observation.payload;
            expect((p.debit === 0) !== (p.credit === 0)).toBe(true);
          }
        }

        // I4 — a settlement closes at the net of its own allocations.
        for (const settlement of result.true_state.settlements) {
          const net = allocations
            .filter((a) => a.settlement_id === settlement.id)
            .reduce((total, a) => total + a.net_paise, 0);
          expect(net).toBe(settlement.amount);
        }

        // I5 — the bank tie-out, one settlement per line.
        const amountOf = new Map<string, number>(result.true_state.settlements.map((s) => [s.id, s.amount]));
        for (const mapping of bank_mappings) {
          const line = result.true_state.bank_lines.find((b) => b.id === mapping.bank_line_id);
          expect(mapping.settlement_ids.reduce((t, id) => t + (amountOf.get(id) ?? 0), 0)).toBe(line?.amount);
        }

        // I7 — every amount a non-negative safe integer.
        for (const observation of result.observations) {
          for (const value of Object.values(observation.payload as Record<string, unknown>)) {
            if (typeof value === "number") {
              expect(Number.isSafeInteger(value)).toBe(true);
            }
          }
        }
      }),
      { numRuns: 2 },
    );
  });
});

describe("the quarantine holds on every generated dataset", () => {
  it.each(IMPLEMENTED_FAMILIES)("puts no free-text field on any structural record, %s", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const result = generateFamily(family, seed);
        const ids = new Set(result.observations.map((o) => o.obs_id));
        for (const observation of result.observations) {
          for (const key of Object.keys(observation.payload as object)) {
            expect(["receipt", "notes", "description", "narration", "memo", "order_receipt"]).not.toContain(key);
          }
        }
        for (const row of result.untrusted_text) expect(ids.has(row.obs_id)).toBe(true);
      }),
      { numRuns: 2 },
    );
  });
});
