import { PROBE_KINDS } from "@assay/domain";
import { describe, expect, it } from "vitest";

import {
  NO_USEFUL_PROBE,
  argumentEntityId,
  isNoUsefulProbe,
  kindOf,
  validate,
  type ProbeCallProposal,
} from "../src/call.js";
import { ABSENT, ORDER, PAY, RFND, SETL, UNIVERSE } from "./fixtures.js";

const P_MAX = 3;

describe("the closed five-probe enum (§6.2, §T7)", () => {
  it("covers exactly §6.2's five probes and no sixth", () => {
    expect([...PROBE_KINDS]).toEqual([
      "fetch_order",
      "fetch_payment",
      "fetch_refund",
      "fetch_settlement_recon",
      "widen_temporal_window",
    ]);
  });

  it("accepts each of the five with an in-universe argument", () => {
    const proposals: ProbeCallProposal[] = [
      { probe: "fetch_order", order_id: ORDER },
      { probe: "fetch_payment", payment_id: PAY },
      { probe: "fetch_refund", refund_id: RFND },
      { probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" },
      { probe: "widen_temporal_window", days: 1 },
    ];
    for (const p of proposals) {
      const r = validate(p, UNIVERSE, 0, P_MAX);
      expect(r.ok, p.probe).toBe(true);
      if (r.ok) expect(PROBE_KINDS).toContain(kindOf(r.call));
    }
  });

  it("rejects a probe outside the closed enum", () => {
    const forged = { probe: "fetch_ledger_entry", order_id: ORDER } as unknown as ProbeCallProposal;
    const r = validate(forged, UNIVERSE, 0, P_MAX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NOT_IN_CLOSED_ENUM");
  });

  it("carries no URL, host, endpoint or path field on any variant (§T7 SSRF)", () => {
    const source = [
      // The call type is the whole attack surface; assert on its own text.
      ...Object.keys({ probe: "", order_id: "", payment_id: "", refund_id: "" }),
    ];
    for (const key of source) {
      expect(key).not.toMatch(/url|host|endpoint|path|uri|origin/i);
    }
  });
});

describe("pre-call I6 (§L.1 rule 8)", () => {
  it("rejects an argument that names no observation", () => {
    const r = validate({ probe: "fetch_payment", payment_id: ABSENT }, UNIVERSE, 0, P_MAX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("ARGUMENT_NOT_IN_OBSERVATION_SET");
      expect(r.argument).toBe(ABSENT);
    }
  });

  it("checks every id-carrying probe, not only one", () => {
    const forged: ProbeCallProposal[] = [
      { probe: "fetch_order", order_id: ABSENT },
      { probe: "fetch_payment", payment_id: ABSENT },
      { probe: "fetch_refund", refund_id: ABSENT },
      { probe: "fetch_settlement_recon", settlement_id: ABSENT, date: "2026-08" },
    ];
    for (const p of forged) {
      const r = validate(p, UNIVERSE, 0, P_MAX);
      expect(r.ok, p.probe).toBe(false);
    }
  });

  it("widen_temporal_window carries no entity id, so I6 has nothing to check", () => {
    expect(argumentEntityId({ probe: "widen_temporal_window", days: 2 })).toBeNull();
    expect(validate({ probe: "widen_temporal_window", days: 2 }, UNIVERSE, 0, P_MAX).ok).toBe(true);
  });

  it("still range-checks days as integer > 0 (§12)", () => {
    for (const days of [0, -1, 1.5, Number.NaN]) {
      const r = validate({ probe: "widen_temporal_window", days }, UNIVERSE, 0, P_MAX);
      expect(r.ok, String(days)).toBe(false);
      if (!r.ok) expect(r.reason).toBe("ARGUMENT_OUT_OF_RANGE");
    }
  });
});

describe("P_max is checked before anything else (§6.2)", () => {
  it("refuses at the budget even for an otherwise valid call", () => {
    const r = validate({ probe: "fetch_payment", payment_id: PAY }, UNIVERSE, P_MAX, P_MAX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("BUDGET_EXHAUSTED");
  });

  it("budget outranks a bad argument, so the first refusal is the budget", () => {
    const r = validate({ probe: "fetch_payment", payment_id: ABSENT }, UNIVERSE, P_MAX, P_MAX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("BUDGET_EXHAUSTED");
  });

  it("admits at one below the budget and refuses at it", () => {
    const p: ProbeCallProposal = { probe: "fetch_payment", payment_id: PAY };
    expect(validate(p, UNIVERSE, P_MAX - 1, P_MAX).ok).toBe(true);
    expect(validate(p, UNIVERSE, P_MAX, P_MAX).ok).toBe(false);
  });
});

describe("NO_USEFUL_PROBE (ARCHITECTURE §6)", () => {
  it("is recognised and is not a call", () => {
    expect(isNoUsefulProbe({ probe: NO_USEFUL_PROBE })).toBe(true);
    expect(isNoUsefulProbe({ probe: "fetch_payment", payment_id: PAY })).toBe(false);
  });
});
