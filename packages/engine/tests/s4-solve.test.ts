import { describe, expect, it } from "vitest";

import { CERTIFICATE_REASONS, JournalError } from "@assay/ledger";

import {
  EPSILON_BPS,
  P_MAX,
  SE_WEIGHTS_BPS,
  canonicalAllocationKey,
  certificateReason,
  modalLagDays,
  solve,
  tauFor,
  type Candidate,
  type DecomposedComponent,
  type Member,
  type ReconReport,
  type SolveInput,
  type Target,
} from "@assay/engine";

import type { BankSideEvidence } from "@assay/ledger";

import { obsId, reconLine } from "./fixtures.js";

/**
 * Stage `S4` (`RECONCILIATION_SPEC.md §6`).
 *
 * Expectations are computed **independently in this file** — `SE3` and the
 * Jaccard are recomputed from the frozen formulas rather than read back from
 * the implementation, and the oracle is never called.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const MODE = 2;
const TARGET_ENTITY_ID = `setl_${"a".repeat(14)}`;

/**
 * SE3 recomputed from §4.2 (spec 1.4.13), independently of the engine, as an
 * **unrounded** bps contribution.
 *
 * §4.2: *"The SE1–SE5 weighted sum is evaluated in integer basis points with
 * `round_half_up` applied **once, at the end**."* So a per-signal contribution
 * is not itself rounded — rounding each would round twice.
 */
function expectedSe3Bps(lagSeconds: readonly number[], mode = MODE): number {
  const denom = 7 - 1;
  const mean =
    lagSeconds
      .map((s) => Math.max(0, 1 - Math.abs(s / DAY - mode) / denom))
      .reduce((a, b) => a + b, 0) / lagSeconds.length;
  return mean * SE_WEIGHTS_BPS.SE3;
}

/** Jaccard recomputed from §4.2 (spec 1.4.16), unrounded, as above. */
function expectedSe5Bps(rStar: readonly string[], m: readonly string[]): number {
  const R = new Set(rStar);
  const M = new Set(m);
  let inter = 0;
  for (const x of R) if (M.has(x)) inter += 1;
  const union = R.size + M.size - inter;
  const unit = union === 0 ? 0 : inter / union;
  return unit * SE_WEIGHTS_BPS.SE5;
}

/** §4.2's single round_half_up, applied once to the weighted sum. */
const roundedTotal = (...contributions: number[]): number =>
  Math.floor(contributions.reduce((a, b) => a + b, 0) + 0.5);

const member = (n: number, lagSeconds = 2 * DAY, credit = 50_000): Member =>
  reconLine(n, {
    createdAt: T0,
    settledAt: T0 + lagSeconds,
    amount: credit + 1_000,
    fee: 1_000,
    credit,
  });

const component = (
  totalValue: number,
  opts: { exceeds?: boolean; members?: readonly Member[] } = {},
): DecomposedComponent => ({
  target_ids: [obsId(900)],
  member_obs_ids: (opts.members ?? []).map((m) => m.obs_id),
  size: (opts.members ?? []).length,
  total_value_paise: totalValue,
  exceeds_k_max: opts.exceeds ?? false,
});

const target = (amount: number): Target => ({
  obs_id: obsId(900),
  kind: "settlement",
  amount,
  bank_value_date: null,
  anchored_members: [],
});

const cand = (ns: readonly number[]): Candidate => ({
  member_obs_ids: ns.map(obsId),
});

function input(o: {
  members: readonly Member[];
  candidates: readonly Candidate[];
  targetAmount?: number;
  totalValue?: number;
  reports?: readonly ReconReport[];
  attempts?: number;
  exceeds?: boolean;
  observed?: readonly string[];
  bankEvidence?: BankSideEvidence | null;
}): SolveInput {
  const observed = new Set(o.observed ?? []);
  return {
    component: component(o.totalValue ?? 1_000_000, {
      exceeds: o.exceeds ?? false,
      members: o.members,
    }),
    target: target(o.targetAmount ?? 100_000),
    candidates: o.candidates,
    members: o.members,
    mode_days: MODE,
    target_entity_id: TARGET_ENTITY_ID,
    recon_reports: o.reports ?? [],
    // The v1.4.14 relation: entity id -> observation id, PARTIAL. An id absent
    // from `observed` has no observation and is excluded from R* (spec 1.4.16).
    observationIdForEntityId: (e) =>
      observed.has(e) ? (e.replace("ent_", "obs_") as never) : undefined,
    probe_attempts: o.attempts ?? 0,
    bank_evidence: o.bankEvidence ?? null,
  };
}

/**
 * `AN2` evidence for `TARGET_ENTITY_ID`, which is what `§17.1.1` conditions
 * `P2`/`P4` on. Named settlement matches the target, so M49's comparand agrees
 * and the anti-cross-attachment check passes.
 */
const BANK_EVIDENCE: BankSideEvidence = {
  settlement_id: TARGET_ENTITY_ID,
  bank_line_id: `bnk_${"b".repeat(14)}`,
  an2_satisfied: true,
  i5_satisfied: true,
};

// ---------------------------------------------------------------------------
// M49 — the branch that was unreachable before spec 1.4.30
// ---------------------------------------------------------------------------

/**
 * `RECONCILIATION_SPEC.md §6`'s `AMBIGUOUS`, reached on the population that
 * produces it (register row `DATA_MODEL.md §22.2` **M49**).
 *
 * Before spec 1.4.30 this describe block could not exist. `journal.ts` read
 * `§17.1.1`'s *"the settlement it is allocated to"* off `ReconLine.settlement_id`
 * — an `AN1` field — while `§3` removes everything anchored from the search
 * space, so **every** member of a proposed allocation carried `null` or a
 * dangling id there. With `bank_evidence` non-null `balances` threw; with it
 * null the materiality was `0` and `§6` returned `IMMATERIALLY_AMBIGUOUS`. Both
 * regimes made `materiality > τ` unattainable, so `AMBIGUOUS` and
 * `DISCRIMINATED` were unreachable and `§6.2`'s probe loop never ran.
 *
 * The fixture is spec 1.4.21's own reachability argument, made concrete: *"`C6`
 * pins `Σ credit − Σ debit` and **not** `Σ amount` or `Σ fee`, while `P2` posts
 * on `amount`, `fee − tax` and `tax`"*. Two allocations tie out identically and
 * move the control accounts by different totals.
 *
 * ```
 *   A = {a1, a2}   amount 51_000  fee  1_000  credit 50_000  tax 305   each
 *   B = {b1, b2}   amount 80_000  fee 30_000  credit 50_000  tax 305   each
 *
 *   C6   Σ credit − Σ debit = 100_000 = target.amount        for BOTH
 *   P2   1200_BANK        +100_000                           for BOTH
 *        1100_RECEIVABLE  −102_000  (A)   −160_000  (B)      Δ = 58_000
 *        5100_FEE_EXPENSE  +1_390   (A)    +59_390  (B)      Δ = 58_000
 *        1300_GST_INPUT      +610   (A)       +610  (B)      Δ =      0
 *
 *   materiality = 58_000 paise   τ = max(10_000, 10 bps of 1_000_000) = 10_000
 *   Δs = 0 (identical lag multisets, SE5 = 0) < ε = 1500
 * ```
 *
 * Every member carries `settlement_id: null` — `PREREGISTRATION.md §4.2`'s
 * `DROP_SETTLEMENT_ID`, and the state `§3` leaves every unanchored member in.
 */
describe("§6 AMBIGUOUS is reachable on an AN2 target with unanchored members (M49)", () => {
  const lag = 2 * DAY;
  const line = (n: number, amount: number, fee: number): Member =>
    reconLine(n, {
      settlementId: null, // §3 left it unanchored; DROP_SETTLEMENT_ID emptied it
      amount,
      fee,
      createdAt: T0,
      settledAt: T0 + lag,
    });

  const a1 = line(1, 51_000, 1_000);
  const a2 = line(2, 51_000, 1_000);
  const b1 = line(3, 80_000, 30_000);
  const b2 = line(4, 80_000, 30_000);
  const members = [a1, a2, b1, b2];
  const candidates = [cand([1, 2]), cand([3, 4])];

  const ambiguous = (): ReturnType<typeof solve> =>
    solve(input({ members, candidates, bankEvidence: BANK_EVIDENCE }));

  it("does not throw — a member §3 left unanchored reaches the projection", () => {
    // The exact failure M49 closed: journalFor at the BANK_EVIDENCE occasion,
    // for every member of each candidate, on lines with no settlement_id.
    expect(() => ambiguous()).not.toThrow();
  });

  it("computes a NON-ZERO materiality from the fee composition", () => {
    const r = ambiguous();
    // Recomputed here from §17.1's posting table, not read back from the engine:
    // the max per-AccountCode delta is 1100_GATEWAY_RECEIVABLE's Σ amount.
    const sumAmount = (ms: readonly Member[]): number =>
      ms.reduce((a, m) => a + m.payload.amount, 0);
    expect(r.materiality_paise).toBe(
      Math.abs(sumAmount([a1, a2]) - sumAmount([b1, b2])),
    );
    expect(r.materiality_paise).toBe(58_000);
    expect(r.materiality_paise).toBeGreaterThan(0);
  });

  it("exceeds τ and returns AMBIGUOUS with a certificate", () => {
    const r = ambiguous();
    expect(r.tau_paise).toBe(10_000);
    expect(r.materiality_paise).toBeGreaterThan(r.tau_paise);
    expect(r.delta_s_bps).toBe(0);
    expect(r.delta_s_bps).toBeLessThan(EPSILON_BPS);
    expect(r.outcome).toBe("AMBIGUOUS");
    // §6: the second-best solution IS the certificate, so both must be present.
    expect(r.best).not.toBeNull();
    expect(r.second).not.toBeNull();
    expect(r.certificate_reason).toBe("EVIDENCE_TIE");
  });

  it("is the branch the pre-M49 reading could not reach", () => {
    // Same fixture, no AN2: §17.1.1 conditions P2/P4 on "AN2 satisfied against
    // an actual bank_line", so neither allocation posts and the difference is 0.
    // This is the ONLY outcome the whole population could produce before M49.
    const withoutAn2 = solve(input({ members, candidates, bankEvidence: null }));
    expect(withoutAn2.materiality_paise).toBe(0);
    expect(withoutAn2.outcome).toBe("IMMATERIALLY_AMBIGUOUS");
  });

  it("DISCRIMINATED is reachable on the same population", () => {
    // The other branch materiality > τ gates. One SE5 report names A's members,
    // so Δs = 2000 bps ≥ ε = 1500 and §6 attaches the discriminator instead of
    // abstaining. It too was unreachable while materiality was identically zero.
    const r = solve(
      input({
        members,
        candidates,
        bankEvidence: BANK_EVIDENCE,
        // The suite's own §12 relation: `ent_…N` resolves to `obs_…N`, which is
        // `obsId(N)`. A report naming A's two members gives A a perfect Jaccard
        // (SE5 = 2000 bps) and B a zero, which is the only route above ε.
        reports: [
          {
            settlement_id: TARGET_ENTITY_ID,
            constituent_entity_ids: ["ent_00000000000001", "ent_00000000000002"],
          },
        ],
        observed: ["ent_00000000000001", "ent_00000000000002"],
      }),
    );
    expect(r.materiality_paise).toBeGreaterThan(r.tau_paise);
    expect(r.delta_s_bps).toBeGreaterThanOrEqual(EPSILON_BPS);
    expect(r.outcome).toBe("DISCRIMINATED");
  });

  it("drops no candidate: every S2-admissible one is ranked", () => {
    // §6 "ranks, it does not re-filter". An unanchored member is not a reason to
    // omit a candidate, and M49 rejected the repairs that would have skipped one.
    const three = [...candidates, cand([1, 3])];
    const r = solve(input({ members, candidates: three, bankEvidence: BANK_EVIDENCE }));
    expect(r.ranked).toHaveLength(three.length);
    expect(new Set(r.ranked.map((s) => s.canonical_key)).size).toBe(three.length);
  });

  it("projects every member — an allocation is not silently shortened", () => {
    // A one-member allocation against a two-member one. If `balances` skipped a
    // member §3 left unanchored, both sides would project nothing and the
    // materiality would collapse to 0 — the self-defeating repair M49 rejected.
    const r = solve(
      input({ members, candidates: [cand([1, 2]), cand([3])], bankEvidence: BANK_EVIDENCE }),
    );
    // §6 maximises over EVERY AccountCode. Here the widest is 1200_BANK, which
    // P2 debits by `credit`: 100_000 against 50_000. A skipped member would
    // shrink one side to nothing and take this to 0.
    expect(r.materiality_paise).toBe(Math.abs(50_000 * 2 - 50_000));
    expect(r.materiality_paise).toBe(50_000);
  });

  // --- G2 (post-M49 audit) --------------------------------------------------
  // Every fixture above sets `target_entity_id` and `bank_evidence.settlement_id`
  // to the SAME value, so a mutant that threads `balances` from
  // `bank_evidence.settlement_id` instead of `SolveInput.target_entity_id` would
  // make the anti-cross-attachment check compare the evidence against itself and
  // never fail — and the whole suite would still pass. This is the one test that
  // sets them apart, so it is the one test that mutant cannot survive.
  it("rejects when target_entity_id and bank_evidence.settlement_id disagree (G2)", () => {
    // input()'s target_entity_id is fixed at TARGET_ENTITY_ID -- setl_A. The
    // evidence below names a DIFFERENT settlement -- setl_B -- so a correct
    // threading of target_entity_id into journalFor's `allocated_to` must be
    // what journal.ts rejects; if S4 threaded the evidence's OWN settlement_id
    // instead, `allocated_to` would equal `evidence.settlement_id` by
    // construction and this candidate pair would solve to AMBIGUOUS instead.
    const mismatchedEvidence: BankSideEvidence = {
      ...BANK_EVIDENCE,
      settlement_id: `setl_${"b".repeat(14)}`, // setl_B -- differs from TARGET_ENTITY_ID (setl_A)
    };
    expect(mismatchedEvidence.settlement_id).not.toBe(TARGET_ENTITY_ID);

    // Two admissible candidates reach the second-best branch, which is what
    // makes `solve` call `materiality` -> `balances` -> `journalFor` at all.
    const attempt = (): ReturnType<typeof solve> =>
      solve(input({ members, candidates, bankEvidence: mismatchedEvidence }));

    expect(attempt).toThrow(JournalError);
    // §17.1.1's own phrase, from `assertBankEvidenceMatchesAllocation`'s
    // diagnostic -- proof the rejection is M49's check and not some other
    // failure mode reached by accident.
    expect(attempt).toThrow(/the settlement it is allocated to/);
  });
});

describe("frozen constants are not renormalised", () => {
  it("keeps 3500 / 2000 / 1500 / 1000 / 2000 summing to 10_000", () => {
    expect(SE_WEIGHTS_BPS).toEqual({
      SE1: 3_500,
      SE2: 2_000,
      SE3: 1_500,
      SE4: 1_000,
      SE5: 2_000,
    });
    const sum = Object.values(SE_WEIGHTS_BPS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(10_000);
    expect(EPSILON_BPS).toBe(1_500);
  });
});

describe("the three non-contributing signals contribute exactly zero", () => {
  it("SE1, SE2 and SE4 are 0 bps while keeping their weights", () => {
    const m = [member(1), member(2)];
    const r = solve(input({ members: m, candidates: [cand([1, 2])] }));
    const s = r.best?.signals;
    expect(s?.SE1).toBe(0); // permanently inactive, spec 1.4.10
    expect(s?.SE2).toBe(0); // expected-non-binding, spec 1.4.20
    expect(s?.SE4).toBe(0); // expected-non-binding, spec 1.4.11
    // ...and the score is SE3 + SE5 alone.
    expect(r.best?.evidence_score_bps).toBe((s?.SE3 ?? 0) + (s?.SE5 ?? 0));
  });
});

describe("SE3 — §4.2 spec 1.4.13", () => {
  it("uses a continuous numerator against a day-binned mode", () => {
    // 2.5 days: the fractional part must survive into |lag - mode|.
    const m = [member(1, Math.round(2.5 * DAY))];
    const r = solve(input({ members: m, candidates: [cand([1])] }));
    expect(r.best?.signals.SE3).toBe(expectedSe3Bps([Math.round(2.5 * DAY)]));
    expect(r.best?.signals.SE3).not.toBe(expectedSe3Bps([2 * DAY]));
  });

  it("aggregates members by ARITHMETIC MEAN, not a sum", () => {
    const lags = [2 * DAY, 4 * DAY];
    const m = [member(1, lags[0]), member(2, lags[1])];
    const r = solve(input({ members: m, candidates: [cand([1, 2])] }));
    expect(r.best?.signals.SE3).toBe(expectedSe3Bps(lags));
    // A sum would exceed the weight; the mean cannot.
    expect(r.best?.signals.SE3).toBeLessThanOrEqual(SE_WEIGHTS_BPS.SE3);
  });

  it("clamps at zero rather than going negative", () => {
    // lag 20 days, mode 2 -> 1 - 18/6 < 0.
    const m = [member(1, 20 * DAY)];
    const r = solve(input({ members: m, candidates: [cand([1])] }));
    expect(r.best?.signals.SE3).toBe(0);
  });

  it("modalLagDays bins by floor and breaks ties to the LOWEST bin", () => {
    const pool = [
      member(1, 2 * DAY + 100),
      member(2, 2 * DAY + 900),
      member(3, 5 * DAY),
      member(4, 5 * DAY),
    ];
    // bins {2:2, 5:2} -> tie -> lowest bin wins
    expect(modalLagDays(pool)).toBe(2);
  });
});

describe("§4.2's round_half_up is applied ONCE, at the end", () => {
  it("rounds the weighted SUM, not each contribution", () => {
    // SE5 = 1/3 * 2000 = 666.666..., SE3 chosen to land the total off an
    // integer. Rounding per-signal first would give a different total.
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000003"];
    const r = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [
          { settlement_id: "setl_aaaaaaaaaaaaaa", constituent_entity_ids: observed },
        ],
        observed,
      }),
    );
    const s = r.best?.signals;
    expect(s?.SE5).not.toBe(Math.round(s?.SE5 ?? 0)); // contribution is fractional
    expect(r.best?.evidence_score_bps).toBe(
      roundedTotal(s?.SE1 ?? 0, s?.SE2 ?? 0, s?.SE3 ?? 0, s?.SE4 ?? 0, s?.SE5 ?? 0),
    );
  });
});

describe("SE5 — §4.2 specs 1.4.15 / 1.4.16 / 1.4.17", () => {
  const rpt = (ids: readonly string[]): ReconReport => ({
    settlement_id: "setl_aaaaaaaaaaaaaa",
    constituent_entity_ids: ids,
  });

  it("scores an exact match at the full weight", () => {
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000002"];
    const r = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(observed)],
        observed,
      }),
    );
    expect(r.best?.signals.SE5).toBe(
      expectedSe5Bps([obsId(1), obsId(2)], [obsId(1), obsId(2)]),
    );
    expect(r.best?.signals.SE5).toBe(SE_WEIGHTS_BPS.SE5);
  });

  it("scores partial overlap by Jaccard", () => {
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000003"];
    const r = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(observed)],
        observed,
      }),
    );
    // R* = {obs_1, obs_3}; M = {obs_1, obs_2}; |n|=1 |u|=3 -> 1/3
    expect(r.best?.signals.SE5).toBe(
      expectedSe5Bps([obsId(1), obsId(3)], [obsId(1), obsId(2)]),
    );
  });

  it("scores 0 on an empty union and 0 with no report at all", () => {
    const m = [member(1)];
    const none = solve(input({ members: m, candidates: [cand([1])] }));
    expect(none.best?.signals.SE5).toBe(0);
    const empty = solve(
      input({ members: m, candidates: [cand([])], reports: [rpt([])] }),
    );
    expect(empty.best?.signals.SE5).toBe(0);
  });

  it("EXCLUDES a returned id with no observation — the F05 case", () => {
    const m = [member(1)];
    // ent_..2 is returned but withheld at emission, so it has no observation.
    const r = solve(
      input({
        members: m,
        candidates: [cand([1])],
        reports: [rpt(["ent_00000000000001", "ent_00000000000002"])],
        observed: ["ent_00000000000001"],
      }),
    );
    // R* = {obs_1} only -> perfect match, full weight. Including the withheld
    // id in the denominator would give 1/2 instead.
    expect(r.best?.signals.SE5).toBe(SE_WEIGHTS_BPS.SE5);
    expect(r.best?.signals.SE5).not.toBe(expectedSe5Bps([obsId(1), obsId(2)], [obsId(1)]));
  });

  it("UNIONS multiple reports for one settlement (spec 1.4.17)", () => {
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000002"];
    const r = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(["ent_00000000000001"]), rpt(["ent_00000000000002"])],
        observed,
      }),
    );
    // Union {1,2} -> exact match. Intersection would be empty -> 0.
    expect(r.best?.signals.SE5).toBe(SE_WEIGHTS_BPS.SE5);
  });

  it("is idempotent under a repeated identical report", () => {
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000002"];
    const once = solve(
      input({ members: m, candidates: [cand([1, 2])], reports: [rpt(observed)], observed }),
    );
    const thrice = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(observed), rpt(observed), rpt(observed)],
        observed,
      }),
    );
    expect(thrice.best?.signals.SE5).toBe(once.best?.signals.SE5);
  });

  it("is independent of report order", () => {
    const m = [member(1), member(2)];
    const observed = ["ent_00000000000001", "ent_00000000000002"];
    const a = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(["ent_00000000000001"]), rpt(["ent_00000000000002"])],
        observed,
      }),
    );
    const b = solve(
      input({
        members: m,
        candidates: [cand([1, 2])],
        reports: [rpt(["ent_00000000000002"]), rpt(["ent_00000000000001"])],
        observed,
      }),
    );
    expect(b.best?.signals.SE5).toBe(a.best?.signals.SE5);
  });

  it("ignores a report for a different settlement", () => {
    const m = [member(1)];
    const r = solve(
      input({
        members: m,
        candidates: [cand([1])],
        reports: [
          { settlement_id: "setl_bbbbbbbbbbbbbb", constituent_entity_ids: ["ent_00000000000001"] },
        ],
        observed: ["ent_00000000000001"],
      }),
    );
    expect(r.best?.signals.SE5).toBe(0);
  });
});

describe("τ — §6, from Component.total_value_paise", () => {
  it("floors at ₹100 and scales at 10 bps of COMPONENT value", () => {
    expect(tauFor(component(1_000_000))).toBe(10_000); // 10bps = 1_000 < floor
    expect(tauFor(component(500_000_000))).toBe(500_000); // 10bps = 500_000
  });

  it("does not read the target amount", () => {
    const small = component(1_000_000);
    const r = solve(
      input({ members: [member(1)], candidates: [cand([1])], targetAmount: 999_999_999 }),
    );
    expect(r.tau_paise).toBe(tauFor(small));
  });
});

describe("§6's outcome table", () => {
  it("UNIQUE when there is no second feasible solution", () => {
    const r = solve(input({ members: [member(1)], candidates: [cand([1])] }));
    expect(r.outcome).toBe("UNIQUE");
    expect(r.second).toBeNull();
    expect(r.certificate_reason).toBeNull();
  });

  it("IMMATERIALLY_AMBIGUOUS when materiality <= τ", () => {
    // No bank evidence -> P2/P4 cannot fire -> both allocations post nothing
    // -> materiality 0 <= τ. §17.1.1 conditions P2/P4 on "AN2 satisfied".
    const m = [member(1), member(2)];
    const r = solve(input({ members: m, candidates: [cand([1]), cand([2])] }));
    expect(r.materiality_paise).toBe(0);
    expect(r.outcome).toBe("IMMATERIALLY_AMBIGUOUS");
  });

  it("INTRACTABLE at §4.3's bound, with SEARCH_BOUND_EXCEEDED", () => {
    const r = solve(
      input({ members: [member(1)], candidates: [cand([1])], exceeds: true }),
    );
    expect(r.outcome).toBe("INTRACTABLE");
    expect(r.certificate_reason).toBe("SEARCH_BOUND_EXCEEDED");
    expect(r.best).toBeNull();
  });
});

describe("Δs and ε", () => {
  it("computes Δs as the absolute score difference", () => {
    const m = [member(1, 2 * DAY), member(2, 5 * DAY)];
    const r = solve(input({ members: m, candidates: [cand([1]), cand([2])] }));
    const hi = roundedTotal(expectedSe3Bps([2 * DAY]));
    const lo = roundedTotal(expectedSe3Bps([5 * DAY]));
    expect(r.delta_s_bps).toBe(Math.abs(hi - lo));
    expect(r.best?.evidence_score_bps).toBe(hi);
    expect(r.second?.evidence_score_bps).toBe(lo);
  });

  it("ranks strictly by evidence_score_bps", () => {
    const m = [member(1, 2 * DAY), member(2, 6 * DAY)];
    const r = solve(input({ members: m, candidates: [cand([2]), cand([1])] }));
    // Input order puts the WORSE candidate first; ranking must not care.
    expect(r.best?.candidate.member_obs_ids).toEqual([obsId(1)]);
  });
});

describe("the v1.4.21 canonical tie-break", () => {
  it("builds the key as target|member pairs, sorted, joined by ;", () => {
    expect(canonicalAllocationKey("obs_T", [obsId(2), obsId(1)])).toBe(
      `obs_T|${obsId(1)};obs_T|${obsId(2)}`,
    );
    expect(canonicalAllocationKey("obs_T", [])).toBe("obs_T|");
  });

  it("is independent of member order", () => {
    expect(canonicalAllocationKey("obs_T", [obsId(3), obsId(1), obsId(2)])).toBe(
      canonicalAllocationKey("obs_T", [obsId(1), obsId(2), obsId(3)]),
    );
  });

  it("breaks an EXACT score tie by smallest key, not by input order", () => {
    // Four members with identical lag -> every pair scores identically.
    const m = [1, 2, 3, 4].map((n) => member(n, 2 * DAY));
    const pairs: Candidate[] = [cand([3, 4]), cand([1, 2]), cand([2, 3])];
    const r = solve(input({ members: m, candidates: pairs }));
    const scores = new Set(r.ranked.map((s) => s.evidence_score_bps));
    expect(scores.size).toBe(1); // genuinely tied
    expect(r.best?.candidate.member_obs_ids).toEqual([obsId(1), obsId(2)]);
    expect(r.second?.candidate.member_obs_ids).toEqual([obsId(2), obsId(3)]);
    expect(r.delta_s_bps).toBe(0);
  });

  it("gives the same winner under every input permutation", () => {
    const m = [1, 2, 3].map((n) => member(n, 2 * DAY));
    const base: Candidate[] = [cand([1]), cand([2]), cand([3])];
    const winners = new Set<string>();
    for (const p of [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
    ]) {
      const r = solve(input({ members: m, candidates: p.map((i) => base[i] as Candidate) }));
      winners.add(r.best?.canonical_key ?? "");
    }
    expect(winners.size).toBe(1);
  });
});

describe("A2 — probe endpoints and the middle case, total from spec 1.4.25", () => {
  it("zero attempts => EVIDENCE_TIE", () => {
    expect(certificateReason(0)).toBe("EVIDENCE_TIE");
  });

  it("attempts === P_max => PROBE_BUDGET_EXHAUSTED", () => {
    expect(certificateReason(P_MAX)).toBe("PROBE_BUDGET_EXHAUSTED");
  });

  it("0 < attempts < P_max => NO_USEFUL_PROBE_AVAILABLE (M40)", () => {
    for (const n of [1, 2]) {
      expect(certificateReason(n)).toBe("NO_USEFUL_PROBE_AVAILABLE");
    }
  });

  it("is TOTAL over attempts and never returns an undecided seam", () => {
    for (let n = -2; n <= P_MAX + 3; n += 1) {
      const r = certificateReason(n);
      expect(CERTIFICATE_REASONS).toContain(r);
      expect(typeof r).toBe("string");
    }
    // A2_MIDDLE_CASE_UNSPECIFIED is retired, not defaulted: no value of
    // `attempts` produces it and the type no longer admits it.
    expect(CERTIFICATE_REASONS).not.toContain("A2_MIDDLE_CASE_UNSPECIFIED");
  });

  it("SEARCH_BOUND_EXCEEDED is §4.3's and is not produced by attempts", () => {
    for (let n = -2; n <= P_MAX + 3; n += 1) {
      expect(certificateReason(n)).not.toBe("SEARCH_BOUND_EXCEEDED");
    }
  });
});

describe("solve_status is not invented", () => {
  it("emits no solve_status field at all", () => {
    const r = solve(input({ members: [member(1)], candidates: [cand([1])] }));
    expect(Object.keys(r)).not.toContain("solve_status");
    // §4.3 defines INTRACTABLE; EMPTY and SOLVED have no frozen trigger, so the
    // outcome enum carries the part that IS determined and nothing more.
    expect(r.outcome).not.toBe("EMPTY");
    expect(r.outcome).not.toBe("SOLVED");
  });
});

describe("determinism", () => {
  it("is repeatable and independent of candidate input order", () => {
    const m = [member(1, 2 * DAY), member(2, 3 * DAY), member(3, 4 * DAY)];
    const cs = [cand([1]), cand([2]), cand([3])];
    const a = solve(input({ members: m, candidates: cs }));
    const b = solve(input({ members: m, candidates: [...cs].reverse() }));
    expect(b.ranked.map((x) => x.canonical_key)).toEqual(
      a.ranked.map((x) => x.canonical_key),
    );
    expect(solve(input({ members: m, candidates: cs }))).toEqual(a);
  });

  it("ranks the COMPLETE feasible set — nothing is dropped", () => {
    const m = [member(1), member(2), member(3)];
    const cs = [cand([1]), cand([2]), cand([3])];
    const r = solve(input({ members: m, candidates: cs }));
    expect(r.ranked).toHaveLength(3);
    expect(new Set(r.ranked.map((x) => x.canonical_key)).size).toBe(3);
  });
});
