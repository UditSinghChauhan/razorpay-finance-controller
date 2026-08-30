import { P_MAX } from "@assay/engine";
import type { DecisionId, EvidenceId } from "@assay/ledger";
import { describe, expect, it } from "vitest";

import { validate, type ValidatedProbeCall } from "../src/call.js";
import { probeEventBody } from "../src/event.js";
import { PAY, SETL, UNIVERSE } from "./fixtures.js";

function call(p: Parameters<typeof validate>[0]): ValidatedProbeCall {
  const r = validate(p, UNIVERSE, 0, P_MAX);
  if (!r.ok) throw new Error("fixture invalid");
  return r.call;
}

const EV = ["ev_1" as EvidenceId];
const DEC = "dec_aaaaaaaaaaaaaa" as DecisionId;

describe("the PROBE event body (DATA_MODEL §16)", () => {
  const body = probeEventBody({
    call: call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }),
    comp_id: "comp_1",
    attempts_before: 0,
    evidence_ids: EV,
    decision_id: DEC,
  });

  it("is kind PROBE and posts no journal line", () => {
    expect(body.kind).toBe("PROBE");
    expect(body.journal_lines).toEqual([]);
  });

  it("carries no certificate — a probe is not an abstention", () => {
    expect(body.certificate).toBeNull();
  });

  it("names the probed entity in subject_ids", () => {
    expect(body.subject_ids).toEqual([SETL]);
  });

  it("carries an inputs_hash — §16's 'hash of everything the step read'", () => {
    expect(body.inputs_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is empty-subject for a probe naming no entity", () => {
    const w = probeEventBody({
      call: call({ probe: "widen_temporal_window", days: 2 }),
      comp_id: "c",
      attempts_before: 0,
      evidence_ids: [],
      decision_id: null,
    });
    expect(w.subject_ids).toEqual([]);
  });

  it("is DETERMINISTIC — two assemblies of one call agree byte for byte", () => {
    const again = probeEventBody({
      call: call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }),
      comp_id: "comp_1",
      attempts_before: 0,
      evidence_ids: EV,
      decision_id: DEC,
    });
    expect(again).toEqual(body);
    expect(again.inputs_hash).toBe(body.inputs_hash);
  });

  it("distinguishes calls that differ only in the date argument", () => {
    const a = probeEventBody({
      call: call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }),
      comp_id: "c", attempts_before: 0, evidence_ids: [], decision_id: null,
    });
    const b = probeEventBody({
      call: call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-09" }),
      comp_id: "c", attempts_before: 0, evidence_ids: [], decision_id: null,
    });
    // §12 omits `date` from ProbeResultDetail *because* "recording the call
    // belongs to the PROBE LedgerEvent". This is that recording.
    expect(a.inputs_hash).not.toBe(b.inputs_hash);
  });

  it("distinguishes the same call at different budget positions", () => {
    const mk = (attempts_before: number) =>
      probeEventBody({
        call: call({ probe: "fetch_payment", payment_id: PAY }),
        comp_id: "c", attempts_before, evidence_ids: [], decision_id: null,
      }).inputs_hash;
    expect(mk(0)).not.toBe(mk(1));
  });

  it("is frozen", () => {
    expect(Object.isFrozen(body)).toBe(true);
    expect(Object.isFrozen(body.subject_ids)).toBe(true);
  });
});
