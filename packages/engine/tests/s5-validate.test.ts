import { describe, expect, it } from "vitest";

import { INVARIANT_IDS } from "@assay/domain";
import type { JournalLine } from "@assay/ledger";

import {
  ALLOCATION_SCOPED_INVARIANTS,
  checkIdempotency,
  solve,
  validate,
  type Member,
  type ValidationInput,
} from "@assay/engine";

import { obsId, reconLine } from "./fixtures.js";

/**
 * Stage `S5` (`RECONCILIATION_SPEC.md §7`).
 *
 * `§7`'s failure semantics are the thing under test: *"**any** invariant failure
 * rejects the allocation. It is never partially posted, never repaired, never
 * downgraded to a warning."* So the negative cases carry the weight — each
 * invariant must be able to fail **alone** and be named.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const HASH = "a".repeat(64) as never;

const member = (
  n: number,
  o: Parameters<typeof reconLine>[1] = {},
): Member =>
  reconLine(n, {
    amount: 100_000,
    fee: 2_000,
    credit: 98_000,
    createdAt: T0,
    settledAt: T0 + 2 * DAY,
    ...o,
  });

const line = (dr: number, cr: number, id = "pay_x"): JournalLine =>
  ({
    account: "1100_GATEWAY_RECEIVABLE",
    dr_paise: dr,
    cr_paise: cr,
    memo_ref: "P1",
    source_entity_id: id,
  }) as JournalLine;

function base(o: Partial<ValidationInput> = {}): ValidationInput {
  const members = o.members ?? [member(1)];
  return {
    decision_id: "dec_00000000000001" as never,
    type: "RECONCILED",
    journal_lines: [line(100_000, 0), line(0, 100_000)],
    members,
    target_amount_paise: 98_000,
    bank_tie_out: null,
    referenced_ids: [],
    observation_entity_ids: new Set(members.map((m) => m.payload.entity_id)),
    already_allocated_entity_ids: new Set(),
    idempotency: null,
    subject_obs_ids: members.map((m) => m.obs_id),
    evidence_ids: [],
    certificate: null,
    inputs_hash: HASH,
    ...o,
  };
}

const idsOf = (r: ReturnType<typeof validate>) =>
  r.valid ? r.decision.invariants_failed : r.invariants_failed;

describe("the invariant vocabulary", () => {
  it("evaluates I1-I8 per allocation and holds I9 at run scope", () => {
    expect(ALLOCATION_SCOPED_INVARIANTS).toEqual([
      "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8",
    ]);
    // §7 lists nine; I9 is "re-running the same input yields an identical
    // ledger root hash" -- a two-run property, so it is not allocation-scoped.
    expect(INVARIANT_IDS).toHaveLength(9);
    expect((ALLOCATION_SCOPED_INVARIANTS as readonly string[]).includes("I9")).toBe(false);
  });
});

describe("each invariant passes on a clean allocation", () => {
  it("validates and reports every checked id, with none failed", () => {
    const r = validate(base());
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.decision.invariants_failed).toEqual([]);
    expect(r.decision.invariants_checked).toEqual(["I1", "I2", "I3", "I4", "I7", "I8"]);
  });
});

describe("each invariant can fail alone and names itself", () => {
  it("I1 — trial balance", () => {
    const r = validate(base({ journal_lines: [line(100_000, 0), line(0, 99_999)] }));
    expect(idsOf(r)).toEqual(["I1"]);
  });

  it("I2 — no double allocation, against the run", () => {
    const m = member(1);
    const r = validate(
      base({
        members: [m],
        already_allocated_entity_ids: new Set([m.payload.entity_id]),
      }),
    );
    expect(idsOf(r)).toEqual(["I2"]);
  });

  it("I2 — and against a repeat inside one allocation", () => {
    const m = member(1);
    const r = validate(base({ members: [m, m], target_amount_paise: 196_000 }));
    expect(idsOf(r)).toContain("I2");
  });

  it("I3 — line arithmetic", () => {
    const bad = member(1, { credit: 97_000 }); // amount 100_000 - fee 2_000 = 98_000
    const r = validate(base({ members: [bad], target_amount_paise: 97_000 }));
    expect(idsOf(r)).toEqual(["I3"]);
  });

  it("I4 — settlement closure", () => {
    const r = validate(base({ target_amount_paise: 97_999 }));
    expect(idsOf(r)).toEqual(["I4"]);
  });

  it("I5 — bank tie-out, when a mapping exists", () => {
    const r = validate(
      base({
        bank_tie_out: { settlement_total_paise: 98_000, bank_line_amount_paise: 97_000 },
      }),
    );
    expect(idsOf(r)).toEqual(["I5"]);
  });

  it("I6 — referential integrity, the hallucination defence", () => {
    const r = validate(base({ referenced_ids: ["pay_XXXXXXXXXXXXXX"] }));
    expect(idsOf(r)).toEqual(["I6"]);
  });

  it("I7 — range and sign", () => {
    const r = validate(base({ members: [member(1, { fee: -1, credit: 100_001 })] }));
    expect(idsOf(r)).toContain("I7");
  });

  it("I8 — temporal", () => {
    const r = validate(
      base({ members: [member(1, { createdAt: T0 + 5 * DAY, settledAt: T0 })] }),
    );
    expect(idsOf(r)).toContain("I8");
  });

  it("I9 — idempotency, at its own run scope", () => {
    expect(checkIdempotency(HASH, HASH).passed).toBe(true);
    const differs = checkIdempotency(HASH, ("b".repeat(64) as never));
    expect(differs.passed).toBe(false);
    expect(differs.id).toBe("I9");
  });

  it("I9 enters invariants_checked only when both hashes are supplied", () => {
    const without = validate(base());
    expect(without.valid && without.decision.invariants_checked).not.toContain("I9");
    const with9 = validate(
      base({ idempotency: { first_root_hash: HASH, second_root_hash: HASH } }),
    );
    expect(with9.valid && with9.decision.invariants_checked).toContain("I9");
  });
});

describe("multiple failures are all reported", () => {
  it("names every failed invariant, not just the first", () => {
    const r = validate(
      base({
        journal_lines: [line(1, 0)], // I1
        members: [member(1, { credit: 90_000, fee: -5 })], // I3, I7
        referenced_ids: ["pay_XXXXXXXXXXXXXX"], // I6
      }),
    );
    expect(r.valid).toBe(false);
    expect(idsOf(r)).toEqual(["I1", "I3", "I4", "I6", "I7"]);
  });

  it("never reports a failure for an invariant it did not check", () => {
    const r = validate(base({ bank_tie_out: null, target_amount_paise: null }));
    const checked = r.valid ? r.decision.invariants_checked : r.invariants_checked;
    for (const id of idsOf(r)) expect(checked).toContain(id);
    expect(checked).not.toContain("I4");
    expect(checked).not.toContain("I5");
  });

  it("keeps both arrays deterministically ordered and duplicate-free", () => {
    const r = validate(
      base({
        journal_lines: [line(1, 0)],
        members: [member(1, { credit: 1, fee: -1 })],
      }),
    );
    const checked = r.valid ? r.decision.invariants_checked : r.invariants_checked;
    const failed = idsOf(r);
    expect([...checked]).toEqual([...checked].sort());
    expect([...failed]).toEqual([...failed].sort());
    expect(new Set(checked).size).toBe(checked.length);
    expect(new Set(failed).size).toBe(failed.length);
  });
});

describe("§7: an invalid allocation never becomes a ValidatedDecision", () => {
  it("returns valid: false and no decision field", () => {
    const r = validate(base({ target_amount_paise: 1 }));
    expect(r.valid).toBe(false);
    expect(Object.keys(r)).not.toContain("decision");
  });

  it("a successful decision always has invariants_failed empty", () => {
    const r = validate(base());
    expect(r.valid && r.decision.invariants_failed).toEqual([]);
  });
});

describe("certificate iff ABSTAINED", () => {
  const cert = {
    comp_id: "comp_1",
    solution_a: { candidate_id: "cand_1", member_obs_ids: [obsId(1)] },
    solution_b: { candidate_id: "cand_2", member_obs_ids: [obsId(2)] },
    shared_hard_constraints: [],
    evidence_score_gap_bps: 0,
    materiality_paise: 0,
    epsilon_bps: 1_500,
    tau_paise: 10_000,
    probes_attempted: [],
    reason: "EVIDENCE_TIE",
  } as never;

  it("accepts ABSTAINED with a certificate", () => {
    const r = validate(base({ type: "ABSTAINED", certificate: cert }));
    expect(r.valid).toBe(true);
    expect(r.valid && r.decision.certificate).not.toBeNull();
  });

  it("rejects ABSTAINED without one", () => {
    const r = validate(base({ type: "ABSTAINED", certificate: null }));
    expect(r.valid).toBe(false);
    expect(r.valid === false && r.rejection).toContain("no AmbiguityCertificate");
  });

  it("rejects RECONCILED or EXCEPTION carrying one", () => {
    for (const type of ["RECONCILED", "EXCEPTION"] as const) {
      const r = validate(base({ type, certificate: cert }));
      expect(r.valid).toBe(false);
    }
  });
});

describe("the decision preserves what it was given", () => {
  it("carries decision_id, type, journal_lines, subjects, evidence and inputs_hash", () => {
    const m = [member(1), member(2)];
    const r = validate(
      base({
        members: m,
        target_amount_paise: 196_000,
        subject_obs_ids: [obsId(1), obsId(2)],
        evidence_ids: ["ev_1" as never],
      }),
    );
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.decision.decision_id).toBe("dec_00000000000001");
    expect(r.decision.type).toBe("RECONCILED");
    expect(r.decision.journal_lines).toHaveLength(2);
    expect(r.decision.subject_obs_ids).toEqual([obsId(1), obsId(2)]);
    expect(r.decision.evidence_ids).toEqual(["ev_1"]);
    expect(r.decision.inputs_hash).toBe(HASH);
  });

  it("is deterministic across repeated calls", () => {
    expect(validate(base())).toEqual(validate(base()));
  });
});

describe("S4 → S5 integration", () => {
  const solveFixture = (members: readonly Member[], candidates: readonly number[][]) =>
    solve({
      component: {
        target_ids: [obsId(900)],
        member_obs_ids: members.map((m) => m.obs_id),
        size: members.length,
        total_value_paise: 1_000_000,
        exceeds_k_max: false,
      },
      target: {
        obs_id: obsId(900),
        kind: "settlement",
        amount: 98_000,
        bank_value_date: null,
        anchored_members: [],
      },
      candidates: candidates.map((ns) => ({ member_obs_ids: ns.map(obsId) })),
      members,
      mode_days: 2,
      target_entity_id: "setl_aaaaaaaaaaaaaa",
      recon_reports: [],
      observationIdForEntityId: () => undefined,
      probe_attempts: 0,
      bank_evidence: null,
    });

  it("takes a UNIQUE best through the gate to a ValidatedDecision", () => {
    const m = [member(1)];
    const s4 = solveFixture(m, [[1]]);
    expect(s4.outcome).toBe("UNIQUE");
    const r = validate(base({ members: m }));
    expect(r.valid).toBe(true);
  });

  it("carries an exact tie resolved by the v1.4.21 key into a valid decision", () => {
    const m = [1, 2, 3, 4].map((n) => member(n, { amount: 50_000, fee: 0, credit: 50_000 }));
    const s4 = solveFixture(m, [[3, 4], [1, 2], [2, 3]]);
    // identical scores -> canonical key decides
    expect(new Set(s4.ranked.map((x) => x.evidence_score_bps)).size).toBe(1);
    expect(s4.best?.candidate.member_obs_ids).toEqual([obsId(1), obsId(2)]);
    const chosen = m.filter((x) => s4.best?.candidate.member_obs_ids.includes(x.obs_id));
    const r = validate(base({ members: chosen, target_amount_paise: 100_000 }));
    expect(r.valid).toBe(true);
  });

  it("routes IMMATERIALLY_AMBIGUOUS's accepted best through the gate", () => {
    const m = [member(1), member(2)];
    const s4 = solveFixture(m, [[1], [2]]);
    expect(s4.outcome).toBe("IMMATERIALLY_AMBIGUOUS");
    const chosen = m.filter((x) => s4.best?.candidate.member_obs_ids.includes(x.obs_id));
    const r = validate(base({ members: chosen }));
    expect(r.valid).toBe(true);
  });

  it("does not recompute or alter S4's ranking", () => {
    const m = [member(1, { settledAt: T0 + 2 * DAY }), member(2, { settledAt: T0 + 6 * DAY })];
    const s4 = solveFixture(m, [[2], [1]]);
    const before = s4.ranked.map((x) => x.canonical_key);
    validate(base({ members: m, target_amount_paise: 196_000 }));
    expect(solveFixture(m, [[2], [1]]).ranked.map((x) => x.canonical_key)).toEqual(before);
  });
});
