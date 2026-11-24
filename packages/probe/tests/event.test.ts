import type { ProbeResultDetail } from "@assay/domain";
import { P_MAX } from "@assay/engine";
import type { EvidenceId } from "@assay/ledger";
import { describe, expect, it } from "vitest";

import { validate, type ValidatedProbeCall } from "../src/call.js";
import { probeEventBody } from "../src/event.js";
import { ProbeResultMismatchError } from "../src/loop.js";
import { PAY, SETL, UNIVERSE } from "./fixtures.js";

function call(p: Parameters<typeof validate>[0]): ValidatedProbeCall {
  const r = validate(p, UNIVERSE, 0, P_MAX);
  if (!r.ok) throw new Error("fixture invalid");
  return r.call;
}

const EV = ["ev_1" as EvidenceId];

/** The validated result answering `c` — what `acceptResult` binds against. */
function answer(c: ValidatedProbeCall): ProbeResultDetail {
  switch (c.probe) {
    case "fetch_settlement_recon":
      return { probe: "fetch_settlement_recon", settlement_id: c.settlement_id, constituent_entity_ids: [] } as unknown as ProbeResultDetail;
    case "fetch_payment":
      return { probe: "fetch_payment", payment_id: c.payment_id, method: null } as unknown as ProbeResultDetail;
    case "widen_temporal_window":
      return { probe: "widen_temporal_window", days: c.days } as unknown as ProbeResultDetail;
    default:
      throw new Error(`fixture: no answer for ${c.probe}`);
  }
}

function mint(c: ValidatedProbeCall, over: { comp_id?: string; attempts_before?: number; evidence_ids?: readonly EvidenceId[] } = {}) {
  return probeEventBody({
    call: c,
    result: answer(c),
    comp_id: over.comp_id ?? "c",
    attempts_before: over.attempts_before ?? 0,
    evidence_ids: over.evidence_ids ?? [],
  });
}

describe("the PROBE event body (DATA_MODEL §16)", () => {
  const recon = call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" });
  const body = mint(recon, { comp_id: "comp_1", evidence_ids: EV });

  it("is kind PROBE and posts no journal line", () => {
    expect(body.kind).toBe("PROBE");
    expect(body.journal_lines).toEqual([]);
  });

  it("carries no certificate — a probe is not an abstention", () => {
    expect(body.certificate).toBeNull();
  });

  it("carries no decision_id — a probe informs a decision and is not one (M65)", () => {
    expect(body.decision_id).toBeNull();
  });

  it("names the probed entity in subject_ids", () => {
    expect(body.subject_ids).toEqual([SETL]);
  });

  it("carries an inputs_hash — §16's 'hash of everything the step read'", () => {
    expect(body.inputs_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is empty-subject for a probe naming no entity", () => {
    expect(mint(call({ probe: "widen_temporal_window", days: 2 })).subject_ids).toEqual([]);
  });

  it("is DETERMINISTIC — two assemblies of one call agree byte for byte", () => {
    const again = mint(call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }), {
      comp_id: "comp_1",
      evidence_ids: EV,
    });
    expect(again).toEqual(body);
    expect(again.inputs_hash).toBe(body.inputs_hash);
  });

  it("distinguishes calls that differ only in the date argument", () => {
    const a = mint(call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }));
    const b = mint(call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-09" }));
    // §12 omits `date` from ProbeResultDetail *because* "recording the call
    // belongs to the PROBE LedgerEvent". This is that recording.
    expect(a.inputs_hash).not.toBe(b.inputs_hash);
  });

  it("distinguishes the same call at different budget positions", () => {
    const mk = (attempts_before: number) =>
      mint(call({ probe: "fetch_payment", payment_id: PAY }), { attempts_before }).inputs_hash;
    expect(mk(0)).not.toBe(mk(1));
  });

  it("is frozen", () => {
    expect(Object.isFrozen(body)).toBe(true);
    expect(Object.isFrozen(body.subject_ids)).toBe(true);
  });
});

describe("a body is minted only from a call AND the result that answered it (M65)", () => {
  const recon = call({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" });

  it("refuses a result for another probe kind", () => {
    expect(() =>
      probeEventBody({
        call: recon,
        result: { probe: "fetch_payment", payment_id: PAY, method: null } as unknown as ProbeResultDetail,
        comp_id: "c",
        attempts_before: 0,
        evidence_ids: [],
      }),
    ).toThrow(ProbeResultMismatchError);
  });

  it("refuses a result for another entity", () => {
    expect(() =>
      probeEventBody({
        call: recon,
        result: {
          probe: "fetch_settlement_recon",
          settlement_id: "setl_zzzzzzzzzzzzzz",
          constituent_entity_ids: [],
        } as unknown as ProbeResultDetail,
        comp_id: "c",
        attempts_before: 0,
        evidence_ids: [],
      }),
    ).toThrow(ProbeResultMismatchError);
  });
});
