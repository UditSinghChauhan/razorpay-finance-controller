import type { ProbeResultDetail, SettlementId } from "@assay/domain";
import { P_MAX } from "@assay/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { validate, type ProbeCallProposal } from "../../src/call.js";
import { acceptResult, decide, initialState } from "../../src/loop.js";
import { probeEventBody } from "../../src/event.js";
import { ORDER, PAY, RFND, SETL, UNIVERSE, ambiguousAt, probeId } from "../fixtures.js";

/**
 * The invariants this package owns (`DECISION_BRIEF.md §L.3`).
 *
 * `P_max` and the pre-call `I6` check are controls `THREAT_MODEL.md §T7`
 * requires; a control that holds only on the shapes someone thought of is not a
 * control.
 */

const inUniverse = fc.constantFrom(SETL, PAY, ORDER, RFND);

const proposalArb: fc.Arbitrary<ProbeCallProposal> = fc.oneof(
  fc.record({ probe: fc.constant("fetch_order" as const), order_id: fc.string() }),
  fc.record({ probe: fc.constant("fetch_payment" as const), payment_id: fc.string() }),
  fc.record({ probe: fc.constant("fetch_refund" as const), refund_id: fc.string() }),
  fc.record({
    probe: fc.constant("fetch_settlement_recon" as const),
    settlement_id: fc.string(),
    date: fc.string(),
  }),
  fc.record({ probe: fc.constant("widen_temporal_window" as const), days: fc.integer() }),
);

describe("P_max can never be exceeded", () => {
  it("refuses every proposal at or beyond the budget", () => {
    fc.assert(
      fc.property(proposalArb, fc.integer({ min: P_MAX, max: 50 }), (p, spent) => {
        const r = validate(p, UNIVERSE, spent, P_MAX);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("BUDGET_EXHAUSTED");
      }),
      { numRuns: 2000 },
    );
  });

  it("attempts advance by exactly one per accepted result, never more", () => {
    fc.assert(
      fc.property(fc.array(inUniverse, { maxLength: 8 }), (ids) => {
        let s = initialState("c");
        ids.forEach((id, i) => {
          const detail: ProbeResultDetail = {
            probe: "fetch_settlement_recon",
            settlement_id: id as SettlementId,
            constituent_entity_ids: [],
          };
          const v = validate(
            { probe: "fetch_settlement_recon", settlement_id: id, date: "d" },
            UNIVERSE,
            0,
            P_MAX,
          );
          if (v.ok) s = acceptResult(s, v.call, detail, probeId(i));
        });
        expect(s.attempts).toBe(ids.length);
        expect(s.probes_attempted).toHaveLength(ids.length);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("pre-call I6 holds for every argument shape", () => {
  it("an id outside the observation set is never validated", () => {
    fc.assert(
      fc.property(proposalArb, (p) => {
        const r = validate(p, { hasEntityId: () => false }, 0, P_MAX);
        // widen_temporal_window names no entity, so I6 has nothing to refuse.
        if (p.probe === "widen_temporal_window") return;
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("ARGUMENT_NOT_IN_OBSERVATION_SET");
      }),
      { numRuns: 2000 },
    );
  });

  it("a validated call always names an id the universe admits", () => {
    fc.assert(
      fc.property(proposalArb, (p) => {
        const r = validate(p, UNIVERSE, 0, P_MAX);
        if (!r.ok) return;
        for (const [k, v] of Object.entries(r.call)) {
          if (k === "probe" || k === "date" || k === "days") continue;
          expect(UNIVERSE.hasEntityId(String(v))).toBe(true);
        }
      }),
      { numRuns: 2000 },
    );
  });
});

describe("determinism", () => {
  it("validate is a pure function of its arguments", () => {
    fc.assert(
      fc.property(proposalArb, fc.integer({ min: 0, max: 5 }), (p, spent) => {
        expect(validate(p, UNIVERSE, spent, P_MAX)).toEqual(validate(p, UNIVERSE, spent, P_MAX));
      }),
      { numRuns: 2000 },
    );
  });

  it("decide is a pure function of state and solve result", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (attempts) => {
        const s = { ...initialState("c"), attempts };
        const r = ambiguousAt(attempts);
        expect(decide(s, r)).toEqual(decide(s, r));
      }),
      { numRuns: 1000 },
    );
  });

  it("the PROBE event body is identical for identical calls", () => {
    fc.assert(
      fc.property(inUniverse, fc.string(), fc.integer({ min: 0, max: 2 }), (id, date, before) => {
        const v = validate(
          { probe: "fetch_settlement_recon", settlement_id: id, date },
          UNIVERSE,
          0,
          P_MAX,
        );
        if (!v.ok) return;
        const mk = () =>
          probeEventBody({
            call: v.call,
            comp_id: "c",
            attempts_before: before,
            evidence_ids: [],
            decision_id: null,
          });
        expect(mk()).toEqual(mk());
      }),
      { numRuns: 1000 },
    );
  });
});

describe("the loop never invents a terminal reason", () => {
  it("STOP always carries the engine's own certificate_reason", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), (attempts) => {
        const s = { ...initialState("c"), attempts };
        const solveResult = ambiguousAt(attempts);
        const d = decide(s, solveResult);
        if (d.action !== "STOP") return;
        expect(d.certificate_reason).toBe(solveResult.certificate_reason);
      }),
      { numRuns: 1000 },
    );
  });
});
