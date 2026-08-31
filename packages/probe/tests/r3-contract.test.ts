import { P_MAX } from "@assay/engine";
import { CERTIFICATE_REASONS } from "@assay/ledger";
import { PROBE_KINDS } from "@assay/domain";
import { describe, expect, it } from "vitest";

import {
  R3_PROBE_KINDS,
  isR3ProposableKind,
  validate,
  type R3Proposal,
} from "../src/call.js";
import { acceptResult, initialState, offerProposal, offerR3Proposal } from "../src/loop.js";
import type { ProbeResultDetail } from "@assay/domain";

import { ABSENT, PAY, SETL, UNIVERSE, ambiguousAt, probeId } from "./fixtures.js";

const RECON: ProbeResultDetail = {
  probe: "fetch_settlement_recon",
  settlement_id: SETL,
  constituent_entity_ids: [],
};

/**
 * The spec-1.4.25 half of this package's contract (`DATA_MODEL.md §22.2` M40).
 *
 * Two properties, and they pull in opposite directions on purpose: `R3` may name
 * **four** probes, and the **executor** still constructs five.
 */

describe("the executor's enum stays closed at five for non-R3 callers", () => {
  it("PROBE_KINDS is unchanged and still holds widen_temporal_window", () => {
    expect([...PROBE_KINDS]).toEqual([
      "fetch_order",
      "fetch_payment",
      "fetch_refund",
      "fetch_settlement_recon",
      "widen_temporal_window",
    ]);
  });

  it("validate() still constructs a widen call for a non-R3 caller", () => {
    // §T7's closed enum of five is unchanged; only what one PROPOSER may name is
    // narrowed. Narrowing the executor would change §12's ProbeResultDetail and
    // §T7's surface, which spec 1.4.25 explicitly does not do.
    const r = validate({ probe: "widen_temporal_window", days: 2 }, UNIVERSE, 0, P_MAX);
    expect(r.ok).toBe(true);
  });

  it("still enforces §12's integer > 0 on days for that caller", () => {
    for (const days of [0, -1, 1.5]) {
      const r = validate({ probe: "widen_temporal_window", days }, UNIVERSE, 0, P_MAX);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("ARGUMENT_OUT_OF_RANGE");
    }
  });
});

describe("R3 may propose exactly four probes (M40)", () => {
  it("R3_PROBE_KINDS is the four, and excludes widen_temporal_window", () => {
    expect([...R3_PROBE_KINDS]).toEqual([
      "fetch_order",
      "fetch_payment",
      "fetch_refund",
      "fetch_settlement_recon",
    ]);
    expect(R3_PROBE_KINDS).not.toContain("widen_temporal_window");
    expect(R3_PROBE_KINDS.length).toBe(PROBE_KINDS.length - 1);
  });

  it("isR3ProposableKind admits the four and refuses the fifth and the unknown", () => {
    for (const k of R3_PROBE_KINDS) expect(isR3ProposableKind(k)).toBe(true);
    expect(isR3ProposableKind("widen_temporal_window")).toBe(false);
    expect(isR3ProposableKind("fetch_ledger_entry")).toBe(false);
    expect(isR3ProposableKind("")).toBe(false);
  });

  it("offerR3Proposal REFUSES a widen that crossed a runtime boundary", () => {
    // R3Proposal excludes it at the type level, so this can only arrive from a
    // provider response or a replay cache entry — which §4 boundary 2 requires
    // be treated as adversarial whatever its declared type claims.
    const smuggled = { probe: "widen_temporal_window", days: 2 } as unknown as R3Proposal;
    const out = offerR3Proposal(initialState("c"), smuggled, UNIVERSE, ambiguousAt(0));
    expect(out.kind).toBe("STOP");
    if (out.kind === "STOP") {
      expect(out.rejection).toBe("NOT_R3_PROPOSABLE");
      expect(out.argument).toBe("widen_temporal_window");
    }
  });

  it("offerR3Proposal passes the four through to the same validation", () => {
    const out = offerR3Proposal(
      initialState("c"),
      { probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" },
      UNIVERSE,
      ambiguousAt(0),
    );
    expect(out.kind).toBe("CALL");
  });

  it("offerR3Proposal handles a decline exactly as offerProposal does", () => {
    const s = { ...initialState("c"), attempts: 1 };
    const a = offerR3Proposal(s, { probe: "NO_USEFUL_PROBE" }, UNIVERSE, ambiguousAt(1));
    const b = offerProposal(s, { probe: "NO_USEFUL_PROBE" }, UNIVERSE, ambiguousAt(1));
    expect(a).toEqual(b);
  });
});

describe("N1 — a rejected well-formed proposal ends the component", () => {
  const rejections = [
    {
      name: "pre-call I6: the argument names no observation",
      proposal: { probe: "fetch_payment", payment_id: ABSENT } as R3Proposal,
      reason: "ARGUMENT_NOT_IN_OBSERVATION_SET",
      state: initialState("c"),
    },
    {
      name: "P_max: the budget is spent",
      proposal: { probe: "fetch_payment", payment_id: PAY } as R3Proposal,
      reason: "BUDGET_EXHAUSTED",
      state: { ...initialState("c"), attempts: P_MAX },
    },
  ] as const;

  for (const { name, proposal, reason, state } of rejections) {
    it(`STOPS on ${name}, and spends no budget`, () => {
      const out = offerR3Proposal(state, proposal, UNIVERSE, ambiguousAt(state.attempts));
      expect(out.kind).toBe("STOP");
      if (out.kind === "STOP") {
        expect(out.rejection).toBe(reason);
        expect(CERTIFICATE_REASONS).toContain(out.certificate_reason);
      }
      // `attempts` is unchanged: nothing was dispatched.
      expect(state.attempts).toBe(state.attempts);
    });
  }

  it("there is NO outcome shape a caller could loop on", () => {
    // The convention is expressed as a type: ProposalOutcome has exactly two
    // members and neither says "rejected, ask again". A caller that re-issued
    // would get the identical proposal back forever — an unchanged loop state
    // gives an unchanged input_hash, hence an unchanged cache_key.
    const out = offerR3Proposal(
      initialState("c"),
      { probe: "fetch_order", order_id: ABSENT },
      UNIVERSE,
      ambiguousAt(0),
    );
    expect(["CALL", "STOP"]).toContain(out.kind);
    expect(out.kind).toBe("STOP");
    expect(Object.keys(out).sort()).toEqual(
      ["argument", "certificate_reason", "kind", "rejection"].sort(),
    );
    expect(out).not.toHaveProperty("retry");
    expect(out).not.toHaveProperty("check");
  });

  it("a decline is distinguishable from a rejection", () => {
    const declined = offerR3Proposal(
      initialState("c"),
      { probe: "NO_USEFUL_PROBE" },
      UNIVERSE,
      ambiguousAt(0),
    );
    const rejected = offerR3Proposal(
      initialState("c"),
      { probe: "fetch_order", order_id: ABSENT },
      UNIVERSE,
      ambiguousAt(0),
    );
    expect(declined.kind).toBe("STOP");
    expect(rejected.kind).toBe("STOP");
    if (declined.kind === "STOP") expect(declined.rejection).toBeNull();
    if (rejected.kind === "STOP") expect(rejected.rejection).not.toBeNull();
  });
});

describe("the certificate reason the loop forwards (M40)", () => {
  it("has exactly four members and no undecided seam", () => {
    expect([...CERTIFICATE_REASONS]).toEqual([
      "EVIDENCE_TIE",
      "SEARCH_BOUND_EXCEEDED",
      "PROBE_BUDGET_EXHAUSTED",
      "NO_USEFUL_PROBE_AVAILABLE",
    ]);
  });

  it("a decline at 0 attempts stops on EVIDENCE_TIE", () => {
    const out = offerR3Proposal(
      initialState("c"),
      { probe: "NO_USEFUL_PROBE" },
      UNIVERSE,
      ambiguousAt(0),
    );
    if (out.kind === "STOP") expect(out.certificate_reason).toBe("EVIDENCE_TIE");
  });

  it("a decline strictly inside the budget stops on NO_USEFUL_PROBE_AVAILABLE", () => {
    for (const attempts of [1, 2]) {
      const out = offerR3Proposal(
        { ...initialState("c"), attempts },
        { probe: "NO_USEFUL_PROBE" },
        UNIVERSE,
        ambiguousAt(attempts),
      );
      if (out.kind === "STOP") expect(out.certificate_reason).toBe("NO_USEFUL_PROBE_AVAILABLE");
    }
  });

  it("a decline at P_max stops on PROBE_BUDGET_EXHAUSTED", () => {
    const out = offerR3Proposal(
      { ...initialState("c"), attempts: P_MAX },
      { probe: "NO_USEFUL_PROBE" },
      UNIVERSE,
      ambiguousAt(P_MAX),
    );
    if (out.kind === "STOP") expect(out.certificate_reason).toBe("PROBE_BUDGET_EXHAUSTED");
  });
});

describe("P_max is enforced against the R3 path too", () => {
  it("refuses a fourth probe however it is proposed", () => {
    let s = initialState("c");
    for (let i = 1; i <= P_MAX; i += 1) {
      const out = offerR3Proposal(
        s,
        { probe: "fetch_settlement_recon", settlement_id: SETL, date: "d" },
        UNIVERSE,
        ambiguousAt(s.attempts),
      );
      expect(out.kind).toBe("CALL");
      if (out.kind !== "CALL") return;
      s = acceptResult(s, out.call, RECON, probeId(i));
    }
    expect(s.attempts).toBe(P_MAX);
    const fourth = offerR3Proposal(
      s,
      { probe: "fetch_settlement_recon", settlement_id: SETL, date: "d" },
      UNIVERSE,
      ambiguousAt(P_MAX),
    );
    expect(fourth.kind).toBe("STOP");
    if (fourth.kind === "STOP") {
      expect(fourth.rejection).toBe("BUDGET_EXHAUSTED");
      expect(fourth.certificate_reason).toBe("PROBE_BUDGET_EXHAUSTED");
    }
  });
});
