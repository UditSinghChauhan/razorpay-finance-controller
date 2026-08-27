import { describe, expect, it } from "vitest";

import {
  canonicalJson, checkOrderInvariants, checkPaymentInvariants,
  checkReconLineInvariants, checkRefundInvariants, gstIdentityHolds,
} from "@assay/domain";

import { COMPOSITION, F05_SELECTED_SETTLEMENTS } from "../src/composition.js";
import { CONVENTION_1, IMPLEMENTED_FAMILIES } from "../src/frozen.js";
import { degrade } from "../src/degrade.js";
import { emit } from "../src/emit.js";
import { simulate } from "../src/simulate.js";
import { PERIOD_FROM, PERIOD_TO, SECONDS_PER_DAY } from "../src/period.js";
import { realize } from "../src/composition.js";
import { dataset, TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

/**
 * The hard constraints, checked against the **true** allocation.
 *
 * This is the property the oracle **completeness gate** tests: "For every target
 * in a generated dataset, the true allocation from ground truth must appear
 * among the oracle's enumerated solutions" (`PREREGISTRATION.md §5.3`). A true
 * allocation that fails a frozen constraint cannot appear there, and the gate's
 * failure means "the benchmark is invalid and no results may be reported from
 * it". `packages/oracle` does not exist yet, so this suite is the standing check
 * until it does — it is the single most expensive thing for this package to get
 * wrong.
 */
describe("the true allocation satisfies every hard constraint", () => {
  it("C1 — every member and target is INR", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind === "recon_line" || observation.kind === "adjustment") {
          expect(observation.payload.currency).toBe("INR");
        }
      }
    }
  });

  // Decomposed into one independently executable test per family. The union of
  // the ten covers exactly the original family x seed product and every
  // assertion inside is unchanged; no single test now carries 50 pipelines.
  it.each(IMPLEMENTED_FAMILIES)(
    "C3 — created_at <= settled_at <= the bank line's value_date, for %s",
    (family) => {
      for (const seed of TEST_SEEDS) {
        const result = dataset(family, seed);
        const valueDateOf = new Map<string, number>();
        for (const line of result.true_state.bank_lines) {
          const settlement = result.true_state.settlements[line.settlement_index];
          if (settlement !== undefined) valueDateOf.set(settlement.id, line.value_date);
        }
        for (const observation of result.observations) {
          if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
          const { created_at, settled_at, settlement_id } = observation.payload;
          if (settled_at === null) continue;
          expect(created_at).toBeLessThanOrEqual(settled_at);
          const valueDate = settlement_id === null ? undefined : valueDateOf.get(settlement_id);
          if (valueDate !== undefined) expect(settled_at).toBeLessThanOrEqual(valueDate);
        }
      }
    },
  );

  it.each(IMPLEMENTED_FAMILIES.map((f) => [f, [f]] as const))(
    "C4 — settled_at - created_at lies in [1, 7] calendar days for EVERY member kind, %s",
    (_label, families) => {
    // Adjustments included. `C4` quantifies over "every member", and an
    // adjustment is a member; a chargeback row stamped at its own batch's
    // instant would have a gap of zero and fail the completeness gate.
    const violations: string[] = [];
    for (const family of families) {
      for (const seed of TEST_SEEDS) {
        for (const observation of dataset(family, seed).observations) {
          if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
          const { created_at, settled_at, entity_id } = observation.payload;
          if (settled_at === null) continue;
          const gap = settled_at - created_at;
          if (gap < SECONDS_PER_DAY || gap > 7 * SECONDS_PER_DAY) {
            violations.push(`${family}/${String(seed)} ${entity_id} gap=${String(gap / SECONDS_PER_DAY)}d`);
          }
        }
      }
    }
      expect(violations.slice(0, 10)).toStrictEqual([]);
    },
  );

  it("C5 — the per-line arithmetic identity holds on every emitted line", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
        expect(checkReconLineInvariants(observation.payload), observation.payload.entity_id).toStrictEqual([]);
      }
    }
  });

  it("C6 — a settlement ties out EXACTLY against its emitted members, except under F05", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const seed of TEST_SEEDS) {
        const result = dataset(family, seed);
        const net = new Map<string, number>();
        for (const observation of result.observations) {
          if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
          const { settlement_id, credit, debit } = observation.payload;
          if (settlement_id === null) continue;
          net.set(settlement_id, (net.get(settlement_id) ?? 0) + credit - debit);
        }
        const broken: number[] = [];
        for (const observation of result.observations) {
          if (observation.kind !== "settlement") continue;
          const emitted = net.get(observation.payload.id) ?? 0;
          if (emitted !== observation.payload.amount) broken.push(observation.payload.amount - emitted);
        }

        // Two families break this deliberately, and only these two. Both break
        // it in the SAME direction — the visible sum is too SMALL — because both
        // remove a line from view and neither invents one.
        if (family === "F05") {
          // "I4 fails from the engine's view because the settlement's amount
          // exceeds the sum of the lines it can see, which is E01" (§4.2).
          expect(broken).toHaveLength(F05_SELECTED_SETTLEMENTS);
          for (const shortfall of broken) expect(shortfall).toBeGreaterThan(0);
        } else if (family === "F08") {
          // `DROP_SETTLEMENT_ID` detaches a line from its batch identifier, so
          // it leaves the set reachable by `AN1` without ceasing to exist. The
          // line is still emitted, still ties out arithmetically, and is still
          // recoverable through `settlement_utr` — which is what makes F08 a
          // matching problem rather than a corruption.
          //
          // The discrepancy is therefore EXACTLY the net contribution of the
          // detached lines, and its sign is not uniform: detaching a payment
          // (a credit) lowers the visible sum, detaching a refund (a debit)
          // raises it. Asserted as an identity rather than as a direction.
          const dropped = new Set(
            result.ground_truth.degradations
              .filter((d) => d.op === "DROP_SETTLEMENT_ID")
              .map((d) => d.target_id),
          );
          const detachedNet = new Map<string, number>();
          for (const allocation of result.ground_truth.allocations) {
            if (!dropped.has(allocation.entity_id)) continue;
            detachedNet.set(
              allocation.settlement_id,
              (detachedNet.get(allocation.settlement_id) ?? 0) + allocation.net_paise,
            );
          }
          const discrepancy = new Map<string, number>();
          for (const observation of result.observations) {
            if (observation.kind !== "settlement") continue;
            const gap = observation.payload.amount - (net.get(observation.payload.id) ?? 0);
            if (gap !== 0) discrepancy.set(observation.payload.id, gap);
          }
          expect([...discrepancy.entries()].sort()).toStrictEqual([...detachedNet.entries()].sort());
          expect(discrepancy.size).toBeGreaterThan(0);
        } else {
          expect(broken, `${family}/${String(seed)}`).toStrictEqual([]);
        }
      }
    }
  });

  it("C7 — no entity is allocated twice, and no entity_id appears on two rows", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      const result = dataset(family, SEED);
      const rows = result.observations
        .filter((o) => o.kind === "recon_line" || o.kind === "adjustment")
        .map((o) => o.payload.entity_id);
      expect(new Set(rows).size, family).toBe(rows.length);
      const allocated = result.ground_truth.allocations.map((a) => a.entity_id);
      expect(new Set(allocated).size, family).toBe(allocated.length);
    }
  });

  it("C8 — on_hold is false on every row, so the filter is non-binding as §4.1 predicts", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind === "recon_line" || observation.kind === "adjustment") {
          expect(observation.payload.on_hold).toBe(false);
        }
      }
    }
  });
});

/**
 * `RECONCILIATION_SPEC.md §2` step 2: a record failing an ingest invariant
 * "becomes `E05`/`E06`/`E07` immediately and never enters the candidate space".
 * No family declares an arithmetic corruption, so **no generated record may fail
 * one** — including a degraded one. `§4.3`'s operators corrupt references and
 * text, never arithmetic.
 */
describe("no generated record fails an ingest invariant", () => {
  it.each(IMPLEMENTED_FAMILIES)("%s passes every §2-§9 ingest invariant", (family) => {
    for (const seed of TEST_SEEDS) {
      for (const observation of dataset(family, seed).observations) {
        switch (observation.kind) {
          case "payment":
            expect(checkPaymentInvariants(observation.payload)).toStrictEqual([]);
            break;
          case "order":
            expect(checkOrderInvariants(observation.payload)).toStrictEqual([]);
            break;
          case "refund":
            expect(checkRefundInvariants(observation.payload)).toStrictEqual([]);
            break;
          case "recon_line":
          case "adjustment":
            expect(checkReconLineInvariants(observation.payload)).toStrictEqual([]);
            break;
          default:
            break;
        }
      }
    }
  });

  it("keeps the GST identity exact on every fee-bearing line, so E07 never fires", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind !== "recon_line") continue;
        if (observation.payload.type !== "payment") continue;
        expect(gstIdentityHolds(observation.payload.fee, observation.payload.tax)).toBe(true);
      }
    }
  });
});

/**
 * Degradation corrupts references and text. It must not corrupt arithmetic, and
 * it must not change a field the specification does not name.
 */
describe("what degradation is allowed to break, and what it is not", () => {
  it("F08 leaves `settled` true while nulling `settlement_id` — the field §4.3 names, and only it", () => {
    for (const seed of TEST_SEEDS) {
      const result = dataset("F08", seed);
      const incoherent = result.observations.filter(
        (o) => o.kind === "recon_line" && o.payload.settled && o.payload.settlement_id === null,
      );
      // Exactly the drop count: the operator "sets the field to `null`, which
      // the schema already admits" and touches no second field. `AN1` therefore
      // fails while the arithmetic still ties out — an anchor break, not a
      // corrupt line. No ingest invariant covers the pair, checked above.
      const dropped = result.ground_truth.degradations.filter((d) => d.op === "DROP_SETTLEMENT_ID");
      expect(incoherent).toHaveLength(dropped.length);
      for (const observation of incoherent) {
        if (observation.kind !== "recon_line") continue;
        expect(observation.payload.settled_at).not.toBeNull();
        expect(observation.payload.settlement_utr).not.toBeNull();
      }
    }
  });

  it("leaves `settled` and `settlement_id` coherent everywhere no operator ran", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      if (family === "F08") continue;
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind !== "recon_line" && observation.kind !== "adjustment") continue;
        expect(observation.payload.settled).toBe(observation.payload.settlement_id !== null);
      }
    }
  });

  // One test per family; the union is the original family x seed product.
  it.each(IMPLEMENTED_FAMILIES)(
    "changes no amount, fee, tax, credit or debit for %s — against the same family undegraded",
    (family) => {
      // Compared against the SAME family's own pre-degradation emission, never
      // against another family: sub-streams are derived from (seed, family,
      // stream), so two families at one seed are independent draws by design and
      // their money masses have no reason to agree.
      for (const seed of TEST_SEEDS) {
        const state = simulate(family, seed);
        const before = emit(state);
        const after = degrade(before, family, seed);
        const mass = (observations: readonly { kind: string; payload: unknown }[]): string =>
          canonicalJson(
            observations
              .filter((o) => o.kind === "recon_line" || o.kind === "adjustment")
              .map((o) => {
                const p = o.payload as Record<string, number>;
                return [p.amount, p.fee, p.tax, p.credit, p.debit];
              })
              .sort() as never,
          );
        expect(mass(after.observations), `${family}/${String(seed)}`).toBe(mass(before.observations));
      }
    },
  );
});

/**
 * `§4.2`: "capture window: every simulated capture falls in `[from, to]`.
 * Settlements, bank credits and **ERP bookings** follow their own clocks and MAY
 * fall outside it." The drift is therefore permitted — and bounded, so that no
 * operator and no clock convention can widen it into a manufactured `E11`.
 */
describe("period membership per kind", () => {
  it("keeps every capture, order and refund clock inside the period", () => {
    for (const family of IMPLEMENTED_FAMILIES) {
      for (const observation of dataset(family, SEED).observations) {
        if (observation.kind !== "payment" && observation.kind !== "order" && observation.kind !== "refund") {
          continue;
        }
        expect(observation.payload.created_at).toBeGreaterThanOrEqual(PERIOD_FROM);
        expect(observation.payload.created_at).toBeLessThanOrEqual(PERIOD_TO);
      }
    }
  });

  it("lets an ERP booking leave the period by at most one day, and only at an edge", () => {
    for (const seed of TEST_SEEDS) {
      const result = dataset("F01", seed);
      const outside = result.observations.filter(
        (o) => o.kind === "ledger_entry" && (o.payload.booked_at < PERIOD_FROM || o.payload.booked_at > PERIOD_TO),
      );
      for (const observation of outside) {
        if (observation.kind !== "ledger_entry") continue;
        const overshoot =
          observation.payload.booked_at < PERIOD_FROM
            ? PERIOD_FROM - observation.payload.booked_at
            : observation.payload.booked_at - PERIOD_TO;
        expect(overshoot).toBeLessThanOrEqual(SECONDS_PER_DAY);
      }
      // Bounded by the drift rate itself: at most 10% of captures drift at all.
      expect(outside.length).toBeLessThanOrEqual(realize(CONVENTION_1, COMPOSITION.N));
    }
  });

  it("puts F09's late settlement and bank rows outside the period on their own clocks", () => {
    const result = dataset("F09", SEED);
    const lateSettlements = result.observations.filter(
      (o) => o.kind === "settlement" && o.payload.created_at > PERIOD_TO,
    );
    const lateBank = result.observations.filter(
      (o) => o.kind === "bank_line" && o.payload.value_date > PERIOD_TO,
    );
    expect(lateSettlements.length).toBeGreaterThanOrEqual(3);
    expect(lateBank.length).toBeGreaterThanOrEqual(3);
    // ...and the same rows are emitted, not dropped: E11 is unreachable unless
    // the late rows are visible to the engine (§4.2).
    expect(result.observations.filter((o) => o.kind === "settlement")).toHaveLength(COMPOSITION.S);
    expect(result.observations.filter((o) => o.kind === "bank_line")).toHaveLength(COMPOSITION.B);
  });

  it("emits F07's reversal even where its own clock falls past period.to", () => {
    let lateReversals = 0;
    for (let seed = 60_000; seed < 60_030; seed += 1) {
      const result = dataset("F07", seed);
      expect(result.observations.filter((o) => o.kind === "adjustment")).toHaveLength(2 * COMPOSITION.D);
      for (const adjustment of result.true_state.adjustments) {
        if (adjustment.created_at > PERIOD_TO) lateReversals += 1;
      }
    }
    // The count is seed-invariant whether or not the reversal lands in period.
    expect(lateReversals).toBeGreaterThan(0);
  });
});
