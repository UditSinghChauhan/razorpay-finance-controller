import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { F05_SELECTED_SETTLEMENTS } from "../../src/composition.js";
import { FAMILY_MECHANICS } from "../../src/families.js";
import { generateFamily } from "../../src/generate.js";
import { F05_WITHHELD_PER_SETTLEMENT, IMPLEMENTED_FAMILIES } from "../../src/frozen.js";
import type { ReconReportRow } from "../../src/recon-report.js";
import { DECLARED_SEEDS } from "../../src/seeds.js";

/**
 * `DECISION_BRIEF.md §L.3` requires property tests on the invariants a package
 * owns. `RECONCILIATION_SPEC.md §6.2` gives this package two that no example can
 * establish, because both are claims about **every** dataset the generator can
 * produce rather than about one:
 *
 *   - the **row order** (`entity_id` ascending, total), ratified at spec 1.4.24;
 *   - **byte-stability** at a seed, which `PREREGISTRATION.md §7` requires of
 *     every generator artifact and on which `recon_report_sha256` rests.
 *
 * `§6.2`'s membership rule is included for the same reason: the F05 asymmetry it
 * exists to permit is only safe if it is the ONLY asymmetry, at every seed.
 *
 * Seeds are drawn well away from `§6.1`'s four blocks and filtered against the
 * table, as `generate.prop.test.ts` does; `AL7` burns a seed on any breach.
 */
const seedArb = fc.integer({ min: 20_000, max: 999_999 }).filter((s) => !DECLARED_SEEDS.includes(s));

/** `apps/cli/src/artifacts/jsonl.ts`'s `encodeJsonl` — the bytes `§9` step 4 hashes. */
const encodeJsonl = (rows: readonly ReconReportRow[]): string =>
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

describe("§6.2 row order is entity_id ascending, and total", () => {
  it.each(IMPLEMENTED_FAMILIES)("holds for %s at every seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rows = generateFamily(family, seed).recon_report;
        expect(rows.length).toBeGreaterThan(0);
        for (let i = 1; i < rows.length; i += 1) {
          const previous = rows[i - 1]?.entity_id ?? "";
          const current = rows[i]?.entity_id ?? "";
          // Strict `<` carries both halves of M38 at once: ascending, and total
          // rather than merely non-decreasing.
          expect(previous < current, `${previous} must sort before ${current}`).toBe(true);
        }
      }),
      { numRuns: 2 },
    );
  });
});

describe("§7 byte-identical regeneration of the recon report", () => {
  it.each(IMPLEMENTED_FAMILIES)("produces the same bytes twice for %s at any seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(encodeJsonl(generateFamily(family, seed).recon_report)).toBe(
          encodeJsonl(generateFamily(family, seed).recon_report),
        );
      }),
      { numRuns: 2 },
    );
  });
});

describe("§6.2 membership and the three-column closure", () => {
  it.each(IMPLEMENTED_FAMILIES)("holds for %s at every seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const built = generateFamily(family, seed);
        const { payments, refunds, adjustments } = built.true_state;
        const captured = payments.filter((p) => p.captured && p.fee !== null);

        // One row per ReconLine the simulation produced, and no other.
        expect(built.recon_report).toHaveLength(
          captured.length + refunds.length + adjustments.length,
        );

        const ids = new Set(built.recon_report.map((r) => r.entity_id));
        for (const payment of payments) {
          expect(ids.has(payment.id)).toBe(payment.captured && payment.fee !== null);
        }

        for (const row of built.recon_report) {
          // "carrying settlement_id, entity_id and settled_at and NOTHING else".
          expect(Object.keys(row)).toStrictEqual(["settlement_id", "entity_id", "settled_at"]);
          // DATA_MODEL.md §6: settled_at is "null exactly when no settlement
          // carried the line", which is the same condition as a null batch.
          expect(row.settlement_id === null).toBe(row.settled_at === null);
        }
      }),
      { numRuns: 2 },
    );
  });
});

describe("§6.2 the report differs from the observations by F05 alone", () => {
  it.each(IMPLEMENTED_FAMILIES)("holds for %s at every seed", (family) => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const built = generateFamily(family, seed);
        const observed = new Set<string>();
        for (const observation of built.observations) {
          if (observation.kind === "recon_line" || observation.kind === "adjustment") {
            observed.add(observation.payload.entity_id);
          }
        }
        const reported = new Set(built.recon_report.map((r) => r.entity_id));

        // Every observed line is in the report: the report is a superset, and
        // F04's DUPLICATE_ROW adds no id the true state does not carry.
        for (const id of observed) expect(reported.has(id)).toBe(true);

        // The other direction is F05's withholding and nothing else: exactly
        // `§4.2`'s "ONE constituent recon_line observation per selected
        // settlement", and an empty difference for every family that does not
        // declare the mechanism. An asymmetry that widened fails here.
        const onlyInReport = [...reported].filter((id) => !observed.has(id));
        expect(onlyInReport).toHaveLength(
          FAMILY_MECHANICS[family].f05_withhold
            ? F05_SELECTED_SETTLEMENTS * F05_WITHHELD_PER_SETTLEMENT
            : 0,
        );
      }),
      { numRuns: 2 },
    );
  });
});
