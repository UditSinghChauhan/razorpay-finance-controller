import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { BankSideEvidence } from "@assay/ledger";

import {
  solve,
  type Candidate,
  type DecomposedComponent,
  type Member,
  type SolveInput,
  type Target,
} from "@assay/engine";

import { obsId, reconLine } from "./fixtures.js";

/**
 * `RECONCILIATION_SPEC.md §6`'s materiality test when its comparand is absent
 * — spec 1.4.39, register row `DATA_MODEL.md §22.2` M61.
 *
 * **The defect this file is the regression test for.** Through spec 1.4.38,
 * `s4-solve.ts`'s `balances` returned an empty projection when
 * `bank_evidence === null`, so `materiality` computed as `0`, `0 <= τ` held,
 * `§6` returned `IMMATERIALLY_AMBIGUOUS` and the caller **committed the top
 * candidate** — on every settlement with no `AN2`-matched bank line, which
 * `PREREGISTRATION.md §4.2`'s 30 % clean-`bank_ref` share makes the majority
 * of the population — while `packages/oracle` labelled the same target
 * `TRULY_AMBIGUOUS`. An absent comparand was licensing a commit.
 *
 * **The precedent it violated is `I5`'s.** `DATA_MODEL.md §17.1.1`: *"`I5` is
 * undefined — not satisfied — when no bank-line mapping exists"*, and
 * `s5-validate.ts` carries it as `bank_tie_out: null ⇒ skip`, never `pass`.
 * Materiality has the same comparand — the `P2`/`P4` bank leg `§17.1.1`
 * conditions on `AN2` — and now takes the same rule: `materiality_paise` is
 * `null` (undefined), the immateriality branch is **not evaluated**, and the
 * component abstains with `MATERIALITY_UNDETERMINED`.
 *
 * The first test below **failed against the spec-1.4.38 engine** (it returned
 * `IMMATERIALLY_AMBIGUOUS` with `materiality_paise: 0`) before the fix was
 * applied; that failure was observed and recorded before `s4-solve.ts` changed.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const MODE = 2;
const TARGET_ENTITY_ID = `setl_${"a".repeat(14)}`;

const member = (n: number, credit = 50_000, fee = 1_000): Member =>
  reconLine(n, {
    createdAt: T0,
    settledAt: T0 + 2 * DAY,
    amount: credit + fee,
    fee,
    credit,
  });

const component = (members: readonly Member[]): DecomposedComponent => ({
  target_ids: [obsId(900)],
  member_obs_ids: members.map((m) => m.obs_id),
  size: members.length,
  total_value_paise: members.reduce((t, m) => t + m.payload.amount, 0),
  exceeds_k_max: false,
});

const target = (amount: number): Target => ({
  obs_id: obsId(900),
  kind: "settlement",
  amount,
  bank_value_date: null,
  anchored_members: [],
});

const cand = (ns: readonly number[]): Candidate => ({ member_obs_ids: ns.map(obsId) });

const BANK_EVIDENCE: BankSideEvidence = {
  settlement_id: TARGET_ENTITY_ID,
  bank_line_id: `bnk_${"b".repeat(14)}`,
  an2_satisfied: true,
  i5_satisfied: true,
};

function input(o: {
  members: readonly Member[];
  candidates: readonly Candidate[];
  targetAmount: number;
  bankEvidence: BankSideEvidence | null;
  attempts?: number;
}): SolveInput {
  return {
    component: component(o.members),
    target: target(o.targetAmount),
    candidates: o.candidates,
    members: o.members,
    mode_days: MODE,
    target_entity_id: TARGET_ENTITY_ID,
    recon_reports: [],
    observationIdForEntityId: () => undefined,
    probe_attempts: o.attempts ?? 0,
    bank_evidence: o.bankEvidence,
  };
}

/**
 * Two allocations that tie out identically and differ materially in fee
 * composition — spec 1.4.21's own reachability fixture, as `s4-solve.test.ts`
 * uses it: `C6` pins `Σ credit`, `P2` posts `amount`, so a fee difference of
 * ₹580 moves `1100_GATEWAY_RECEIVABLE` by ₹580 > τ's ₹100 floor.
 */
const a1 = member(1, 50_000, 1_000);
const a2 = member(2, 50_000, 1_000);
const b1 = member(3, 50_000, 30_000);
const b2 = member(4, 50_000, 30_000);
const MATERIAL = {
  members: [a1, a2, b1, b2],
  candidates: [cand([1, 2]), cand([3, 4])],
  targetAmount: 100_000,
};

describe("§6 materiality with no AN2 comparand (spec 1.4.39, M61)", () => {
  it("test 1 — ≥ 2 candidates + bank evidence absent ⇒ ABSTAIN, not commit", () => {
    const r = solve(input({ ...MATERIAL, bankEvidence: null }));
    // The escape hatch that licensed the commit is unavailable, not passed.
    expect(r.outcome).toBe("AMBIGUOUS");
    expect(r.certificate_reason).toBe("MATERIALITY_UNDETERMINED");
    // Undefined is represented as `null`, exactly as `ValidationInput.bank_tie_out`
    // represents I5's absent comparand — never as `0`.
    expect(r.materiality_paise).toBeNull();
    expect(r.best).not.toBeNull();
    expect(r.second).not.toBeNull();
  });

  it("test 2 — ≥ 2 candidates + bank evidence present + Δ ≤ τ ⇒ still IMMATERIALLY_AMBIGUOUS, still commits", () => {
    // Identical fee composition: both allocations post the same totals.
    const c1 = member(1, 50_000, 1_000);
    const c2 = member(2, 50_000, 1_000);
    const r = solve(
      input({
        members: [c1, c2],
        candidates: [cand([1]), cand([2])],
        targetAmount: 50_000,
        bankEvidence: BANK_EVIDENCE,
      }),
    );
    expect(r.materiality_paise).toBe(0);
    expect(r.outcome).toBe("IMMATERIALLY_AMBIGUOUS");
    expect(r.certificate_reason).toBeNull();
  });

  it("test 2b — bank evidence present + Δ > τ ⇒ AMBIGUOUS with EVIDENCE_TIE, as before", () => {
    const r = solve(input({ ...MATERIAL, bankEvidence: BANK_EVIDENCE }));
    expect(r.materiality_paise).toBe(58_000);
    expect(r.outcome).toBe("AMBIGUOUS");
    expect(r.certificate_reason).toBe("EVIDENCE_TIE");
  });

  it("test 3 — exactly 1 candidate + bank evidence absent ⇒ still UNIQUE, still commits", () => {
    const r = solve(
      input({
        members: [a1, a2],
        candidates: [cand([1, 2])],
        targetAmount: 100_000,
        bankEvidence: null,
      }),
    );
    expect(r.outcome).toBe("UNIQUE");
    expect(r.certificate_reason).toBeNull();
    expect(r.best).not.toBeNull();
    expect(r.second).toBeNull();
  });

  it("no candidate + bank evidence absent ⇒ UNIQUE with best null, as before (§9's exception path)", () => {
    const r = solve(input({ members: [], candidates: [], targetAmount: 100_000, bankEvidence: null }));
    expect(r.outcome).toBe("UNIQUE");
    expect(r.best).toBeNull();
    expect(r.certificate_reason).toBeNull();
  });

  it("MATERIALITY_UNDETERMINED takes precedence over the attempts-derived reasons", () => {
    // The bank line is the cheapest resolution and the one the certificate
    // must name, however many probes were spent without discriminating.
    for (const attempts of [0, 1, 3]) {
      const r = solve(input({ ...MATERIAL, bankEvidence: null, attempts }));
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.certificate_reason).toBe("MATERIALITY_UNDETERMINED");
    }
  });

  it("DISCRIMINATED stays reachable with undefined materiality — the gap arm needs no comparand", () => {
    // One SE5 report naming A's members: Δs = 2000 bps ≥ ε.
    const r = solve({
      ...input({ ...MATERIAL, bankEvidence: null }),
      recon_reports: [
        { settlement_id: TARGET_ENTITY_ID, constituent_entity_ids: ["ent_1", "ent_2"] },
      ],
      observationIdForEntityId: (e) => (e === "ent_1" ? obsId(1) : e === "ent_2" ? obsId(2) : undefined),
    });
    expect(r.outcome).toBe("DISCRIMINATED");
    expect(r.materiality_paise).toBeNull();
    expect(r.certificate_reason).toBeNull();
  });
});

describe("test 4 — property: no commit on a multi-candidate component with undefined materiality", () => {
  /**
   * Any number of members (2..8), any partition of them into ≥ 2 candidates
   * that tie out, any fee composition, any probe count below P_max, and no
   * bank evidence: `solve` never returns a committing outcome unless the
   * evidence gap itself discriminates — and with no recon report it cannot.
   */
  const memberArb = fc.record({
    credit: fc.integer({ min: 1_000, max: 5_000_000 }),
    fee: fc.integer({ min: 0, max: 100_000 }),
  });

  it("holds for every generated component", () => {
    fc.assert(
      fc.property(
        fc.array(memberArb, { minLength: 2, maxLength: 8 }),
        fc.integer({ min: 0, max: 2 }),
        (specs, attempts) => {
          // Build twins in pairs so two disjoint candidates net identically:
          // candidate A takes every even index, B every odd, with B's credit
          // copied from A's so C6 is satisfied for both.
          const members: Member[] = [];
          const aIds: number[] = [];
          const bIds: number[] = [];
          specs.forEach((s, i) => {
            const n = i + 1;
            const credit = i % 2 === 0 ? s.credit : (specs[i - 1]?.credit ?? s.credit);
            members.push(member(n, credit, s.fee));
            (i % 2 === 0 ? aIds : bIds).push(n);
          });
          if (bIds.length === 0) return true;
          const amountOf = (ids: number[]): number =>
            ids.reduce((t, n) => t + (members[n - 1]?.payload.credit ?? 0), 0);
          // Trim A to B's length so both net the same target amount.
          const a = aIds.slice(0, bIds.length);
          const targetAmount = amountOf(a);
          if (targetAmount !== amountOf(bIds)) return true;

          const r = solve(
            input({
              members,
              candidates: [cand(a), cand(bIds)],
              targetAmount,
              bankEvidence: null,
              attempts,
            }),
          );
          expect(r.materiality_paise).toBeNull();
          expect(r.outcome).toBe("AMBIGUOUS");
          expect(r.certificate_reason).toBe("MATERIALITY_UNDETERMINED");
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});
