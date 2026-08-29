import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { anchor, normalizeUtr } from "@assay/engine";

import { adjustment, bankLine, reconLine, settlement } from "../fixtures.js";

/**
 * `DECISION_BRIEF.md §L.3` makes property tests on every invariant a package
 * owns a condition of that package being complete. `S1` owns three:
 * order-independence, the anchored/unanchored partition, and the `I2` rule that
 * a collision yields **no** link.
 */

const arbUtr = fc.stringMatching(/^[A-Za-z0-9 _-]{1,12}$/);

const arbInput = fc
  .array(
    fc.oneof(
      fc
        .record({ n: fc.integer({ min: 1, max: 40 }), utr: arbUtr, amount: fc.integer({ min: 1, max: 5 }) })
        .map(({ n, utr, amount }) => settlement(n, { utr, amount: amount * 100 })),
      fc
        .record({
          n: fc.integer({ min: 1, max: 40 }),
          sid: fc.option(fc.integer({ min: 1, max: 40 }), { nil: null }),
        })
        .map(({ n, sid }) =>
          reconLine(n, {
            settlementId: sid === null ? null : `setl_${String(sid).padStart(14, "0")}`,
          }),
        ),
      fc
        .record({
          n: fc.integer({ min: 1, max: 40 }),
          sid: fc.option(fc.integer({ min: 1, max: 40 }), { nil: null }),
        })
        .map(({ n, sid }) =>
          adjustment(n, {
            settlementId: sid === null ? null : `setl_${String(sid).padStart(14, "0")}`,
          }),
        ),
      fc
        .record({
          n: fc.integer({ min: 1, max: 40 }),
          ref: fc.option(arbUtr, { nil: null }),
          amount: fc.integer({ min: 1, max: 5 }),
          vd: fc.integer({ min: 1, max: 3 }),
        })
        .map(({ n, ref, amount, vd }) =>
          bankLine(n, { bankRef: ref, amount: amount * 100, valueDate: vd }),
        ),
    ),
    { maxLength: 14 },
  )
  // Distinct obs_ids: two observations sharing one id is an E08 ingest fault,
  // which §8 rule 1 resolves before S1 ever sees the set.
  .map((obs) => {
    const seen = new Set<string>();
    return obs.filter((o) => (seen.has(o.obs_id) ? false : (seen.add(o.obs_id), true)));
  });

describe("S1 properties", () => {
  it("is order-independent: shuffling the input changes nothing", () => {
    fc.assert(
      fc.property(arbInput, fc.integer(), (obs, seed) => {
        const shuffled = [...obs].sort((a, b) => {
          const ha = (a.obs_id.length * 31 + seed) % 7;
          const hb = (b.obs_id.length * 31 + seed) % 7;
          return ha - hb || (a.obs_id < b.obs_id ? 1 : -1);
        });
        expect(anchor(shuffled)).toEqual(anchor(obs));
      }),
      { numRuns: 2_000 },
    );
  });

  it("partitions member-eligible observations into anchored and pool", () => {
    fc.assert(
      fc.property(arbInput, (obs) => {
        const r = anchor(obs);
        const members = obs
          .filter((o) => o.kind === "recon_line" || o.kind === "adjustment")
          .map((o) => o.obs_id);
        const an1 = new Set(
          r.links.filter((l) => l.anchor === "AN1").map((l) => l.source_obs_id),
        );
        const pool = new Set(r.unanchored_member_obs_ids);
        // Every member is in exactly one side.
        for (const m of members) expect(an1.has(m) !== pool.has(m)).toBe(true);
        expect(an1.size + pool.size).toBe(members.length);
      }),
      { numRuns: 2_000 },
    );
  });

  it("never establishes an AN2 link for a settlement it rejected as E14", () => {
    fc.assert(
      fc.property(arbInput, (obs) => {
        const r = anchor(obs);
        const collided = new Set(
          r.rejections
            .filter((x) => x.exception === "E14_UTR_COLLISION")
            .flatMap((x) => x.obs_ids),
        );
        for (const l of r.links) {
          if (l.anchor === "AN2") expect(collided.has(l.source_obs_id)).toBe(false);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("gives each bank line at most one AN2 anchor — the I2 property", () => {
    fc.assert(
      fc.property(arbInput, (obs) => {
        const targets = anchor(obs)
          .links.filter((l) => l.anchor === "AN2")
          .map((l) => l.target_obs_id);
        expect(new Set(targets).size).toBe(targets.length);
      }),
      { numRuns: 2_000 },
    );
  });

  it("normalizeUtr is idempotent and yields only [0-9A-Z]", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeUtr(s);
        expect(normalizeUtr(once)).toBe(once);
        expect(/^[0-9A-Z]*$/.test(once)).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });
});
