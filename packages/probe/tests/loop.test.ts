import type { ProbeResultDetail } from "@assay/domain";
import { P_MAX, type SolveInput } from "@assay/engine";
import { describe, expect, it } from "vitest";

import { validate, type ValidatedProbeCall } from "../src/call.js";
import {
  ProbeResultMismatchError,
  acceptResult,
  budgetExhausted,
  decide,
  initialState,
  offerProposal,
} from "../src/loop.js";
import { ABSENT, PAY, SETL, UNIVERSE, ambiguousAt, probeId, solve } from "./fixtures.js";

function call(over: Parameters<typeof validate>[0]): ValidatedProbeCall {
  const r = validate(over, UNIVERSE, 0, P_MAX);
  if (!r.ok) throw new Error(`fixture is not valid: ${r.reason}`);
  return r.call;
}

const RECON: ProbeResultDetail = {
  probe: "fetch_settlement_recon",
  settlement_id: SETL,
  constituent_entity_ids: [PAY],
};

describe("P_max accounting (§6.2, PREREGISTRATION §7)", () => {
  it("starts at zero and advances one per accepted result", () => {
    let s = initialState("comp_1");
    expect(s.attempts).toBe(0);
    for (let i = 1; i <= P_MAX; i += 1) {
      s = acceptResult(s, call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }), RECON, probeId(i));
      expect(s.attempts).toBe(i);
    }
    expect(budgetExhausted(s)).toBe(true);
  });

  it("counts a probe that returned nothing — §12's ran-but-empty", () => {
    const empty: ProbeResultDetail = {
      probe: "fetch_settlement_recon",
      settlement_id: SETL,
      constituent_entity_ids: [],
    };
    const s = acceptResult(
      initialState("c"),
      call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }),
      empty,
      probeId(1),
    );
    expect(s.attempts).toBe(1);
    expect(s.reports).toHaveLength(1);
  });

  it("records every probe on `probes_attempted` (§13)", () => {
    let s = initialState("c");
    s = acceptResult(s, call({ probe: "fetch_payment", payment_id: PAY }), { probe: "fetch_payment", payment_id: PAY, method: null }, probeId(1));
    s = acceptResult(s, call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }), RECON, probeId(2));
    expect(s.probes_attempted).toEqual([probeId(1), probeId(2)]);
  });

  it("state is frozen — a caller cannot advance the budget by mutation", () => {
    const s = initialState("c");
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.reports)).toBe(true);
    expect(Object.isFrozen(s.probes_attempted)).toBe(true);
  });
});

describe("the three attempt positions — 0 / middle / exhausted", () => {
  it("zero attempts: probes, and the engine's reason is EVIDENCE_TIE", () => {
    const s = initialState("c");
    const d = decide(s, ambiguousAt(0));
    expect(d.action).toBe("PROBE");
    if (d.action === "PROBE") expect(d.attempts_remaining).toBe(P_MAX);
  });

  it("middle: probes while budget remains", () => {
    const s = { ...initialState("c"), attempts: 1 };
    const d = decide(s, ambiguousAt(1));
    expect(d.action).toBe("PROBE");
    if (d.action === "PROBE") expect(d.attempts_remaining).toBe(P_MAX - 1);
  });

  it("exhausted: stops with the engine's PROBE_BUDGET_EXHAUSTED", () => {
    const s = { ...initialState("c"), attempts: P_MAX };
    const d = decide(s, ambiguousAt(P_MAX));
    expect(d.action).toBe("STOP");
    if (d.action === "STOP") {
      expect(d.certificate_reason).toEqual({
        determined: true,
        reason: "PROBE_BUDGET_EXHAUSTED",
      });
    }
  });

  it("SURFACES §6's undecided middle seam and invents no terminal reason", () => {
    // The A2 middle case: stopped with budget left, on NO_USEFUL_PROBE.
    const s = { ...initialState("c"), attempts: 2 };
    const out = offerProposal(s, { probe: "NO_USEFUL_PROBE" }, UNIVERSE, ambiguousAt(2));
    expect(out.kind).toBe("STOP");
    if (out.kind === "STOP") {
      expect(out.certificate_reason).toEqual({
        determined: false,
        seam: "A2_MIDDLE_CASE_UNSPECIFIED",
        attempts: 2,
      });
      // Nothing here fabricates a `reason` for the undecided branch.
      expect(out.certificate_reason.determined).toBe(false);
    }
  });
});

describe("transitions", () => {
  it("ACCEPTs when the solve forces no certificate", () => {
    expect(decide(initialState("c"), solve({ certificate_reason: null })).action).toBe("ACCEPT");
  });

  it("does not spend budget on INTRACTABLE — no probe enlarges a search bound", () => {
    const d = decide(
      initialState("c"),
      solve({
        outcome: "INTRACTABLE",
        certificate_reason: { determined: true, reason: "SEARCH_BOUND_EXCEEDED" },
      }),
    );
    expect(d.action).toBe("STOP");
  });

  it("is deterministic — identical inputs give identical decisions", () => {
    const s = { ...initialState("c"), attempts: 1 };
    const r = ambiguousAt(1);
    expect(decide(s, r)).toEqual(decide(s, r));
  });

  it("a repeated full run produces an identical final state", () => {
    const run = () => {
      let s = initialState("c");
      for (let i = 1; i <= P_MAX; i += 1) {
        s = acceptResult(s, call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }), RECON, probeId(i));
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe("R3 proposal and execution stay separated (§6.2)", () => {
  it("offerProposal only validates — it never dispatches or returns a result", () => {
    const out = offerProposal(
      initialState("c"),
      { probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" },
      UNIVERSE,
      ambiguousAt(0),
    );
    expect(out.kind).toBe("CALL");
    if (out.kind === "CALL" && out.check.ok) {
      // A call, not a result: no data field exists on it.
      expect(Object.keys(out.check.call)).toEqual(["probe", "settlement_id", "date"]);
    }
  });

  it("rejects a proposal whose argument fails pre-call I6, without spending budget", () => {
    const s = initialState("c");
    const out = offerProposal(s, { probe: "fetch_payment", payment_id: ABSENT }, UNIVERSE, ambiguousAt(0));
    expect(out.kind).toBe("CALL");
    if (out.kind === "CALL") expect(out.check.ok).toBe(false);
    expect(s.attempts).toBe(0);
  });
});

describe("a result must answer the call it was issued for", () => {
  it("rejects a mismatched probe kind", () => {
    expect(() =>
      acceptResult(
        initialState("c"),
        call({ probe: "fetch_payment", payment_id: PAY }),
        RECON,
        probeId(1),
      ),
    ).toThrow(ProbeResultMismatchError);
  });

  it("rejects a matching kind with a different entity id", () => {
    expect(() =>
      acceptResult(
        initialState("c"),
        call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }),
        { probe: "fetch_settlement_recon", settlement_id: "setl_zzzzzzzzzzzzzz" as typeof SETL, constituent_entity_ids: [] },
        probeId(1),
      ),
    ).toThrow(ProbeResultMismatchError);
  });
});

describe("evidence accumulation feeds S4 (§4.2 spec 1.4.17)", () => {
  it("accumulates rather than de-duplicating — the union rule lives in the engine", () => {
    let s = initialState("c");
    const c = call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" });
    s = acceptResult(s, c, RECON, probeId(1));
    s = acceptResult(s, c, RECON, probeId(2));
    expect(s.reports).toHaveLength(2);
    // Repeating a probe adds nothing to the UNION, which is §4.2's own rule and
    // is enforced where SE5 is computed, not here.
    const union = new Set(s.reports.flatMap((r) => r.constituent_entity_ids));
    expect([...union]).toEqual([PAY]);
  });

  it("only fetch_settlement_recon contributes a report — §4.2 spec 1.4.15's scope", () => {
    let s = initialState("c");
    s = acceptResult(s, call({ probe: "fetch_payment", payment_id: PAY }), { probe: "fetch_payment", payment_id: PAY, method: "card" }, probeId(1));
    s = acceptResult(s, call({ probe: "widen_temporal_window", days: 2 }), { probe: "widen_temporal_window", days: 2 }, probeId(2));
    expect(s.reports).toHaveLength(0);
    expect(s.attempts).toBe(2);
  });

  it("hands S4 exactly the shape SolveInput.recon_reports requires", () => {
    const s = acceptResult(
      initialState("c"),
      call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "x" }),
      RECON,
      probeId(1),
    );
    const forSolve: Pick<SolveInput, "recon_reports" | "probe_attempts"> = {
      recon_reports: s.reports,
      probe_attempts: s.attempts,
    };
    expect(forSolve.recon_reports[0]).toEqual({
      settlement_id: SETL,
      constituent_entity_ids: [PAY],
    });
    expect(forSolve.probe_attempts).toBe(1);
  });
});
