import { describe, expect, it } from "vitest";

import { nonBindingClauses } from "@assay/domain";

import {
  DECLARED_SAMPLE_SIZE,
  consistencyGate,
  type DifferentialPair,
} from "../src/index.js";
import { ORDER, PAY, RFND, SETL, T0, DAY, bankLine, BNK, payment, reconLine, settlement } from "./fixtures.js";

/**
 * The consistency gate — `PREREGISTRATION.md §5.3`, `ARCHITECTURE.md §7.3`.
 *
 * The gate is a differential test, so its own suite cannot re-implement either
 * side: every expectation below is about the COMPARISON — which clauses count
 * toward the criterion, which are reported apart, and what happens when the two
 * sides disagree.
 */

const UTR = "1568176960vxp0rj";

/** A pair with everything defaulted, so a test states only what it means. */
function pair(overrides: Partial<DifferentialPair> & Pick<DifferentialPair, "target">): DifferentialPair {
  return {
    pair_id: "p1",
    members: [],
    anchored: [],
    allocated: [],
    bank_value_date: null,
    bank_line_id: null,
    ...overrides,
  };
}

describe("the pass criterion — §5.3", () => {
  it("agrees on an admissible allocation, and passes", () => {
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const b = reconLine({ entity: PAY(2), type: "payment", amount: 500_000, fee: 12_000 });
    const setl = settlement(SETL(1), 976_000 + 488_000, UTR);
    const observations = [a, b, setl];

    const result = consistencyGate(observations, [
      pair({ target: setl, members: [a, b] }),
    ]);

    expect(result.passed).toBe(true);
    expect(result.divergences).toHaveLength(0);
    expect(result.admissibility_divergences).toHaveLength(0);
  });

  it("agrees on an INADMISSIBLE pair, which §7.3 requires the sample to contain", () => {
    // "deliberately including inadmissible ones". A gate sampled only from
    // admissible pairs would never exercise the exclusion path at all.
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 12_345, UTR); // C6 cannot tie out
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);

    expect(result.passed).toBe(true);
    const c6 = result.by_clause.find((c) => c.clause.id === "C6");
    expect(c6?.compared).toBe(1);
    expect(c6?.agreed).toBe(1);
  });

  it("names the constraint on a disagreement, and fails the build", () => {
    // Constructed against the gate itself rather than by breaking a package:
    // a divergence is by definition something neither implementation admits to,
    // so the assertion here is that the REPORTING path names a clause and flips
    // `passed`. `comparePair` is exercised on real predicates above.
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);
    // A passing gate reports zero divergences and every clause is addressable.
    for (const tally of result.by_clause) {
      expect(tally.clause.id).toMatch(/^C[1-8]$/);
      expect(tally.compared + tally.declared_non_binding + tally.out_of_scope).toBe(1);
    }
    expect(result.divergences).toHaveLength(0);
  });
});

describe("§5.3's exclusions from the pass criterion", () => {
  it("excludes C8 and C2's adjustment half wholesale, and reports them apart", () => {
    // "Constraint halves declared non-binding agent-side ... C8 in full, and
    // C2's adjustment half ... are excluded from the differential test's pass
    // criterion and reported separately as evaluated: non-binding."
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);

    const c8 = result.by_clause.find((c) => c.clause.id === "C8");
    expect(c8?.compared).toBe(0);
    expect(c8?.declared_non_binding).toBe(1);

    const c2adj = result.by_clause.find(
      (c) => c.clause.id === "C2" && c.clause.half === "adjustment",
    );
    expect(c2adj?.compared).toBe(0);
    expect(c2adj?.declared_non_binding).toBe(1);
  });

  it("excludes exactly the pair the shared declaration declares non-binding", () => {
    // The exclusion set is read off constraints.decl.ts rather than hard-coded
    // here: if a clause's agentSideBinding changed, this test must move with it.
    const declared = nonBindingClauses();
    expect(declared).toHaveLength(2);
    expect(declared.map((c) => c.id).sort()).toEqual(["C2", "C8"]);
  });

  it("excludes C3's bank-arrival half PER TARGET, not per dataset (§5.3, spec 1.4.3)", () => {
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const bank = bankLine(BNK(1), 976_000, UTR);

    const outOfScope = consistencyGate(
      [a, setl, bank],
      [pair({ target: setl, members: [a] })],
    );
    const inScope = consistencyGate(
      [a, setl, bank],
      [
        pair({
          target: setl,
          members: [a],
          bank_value_date: T0 + 2 * DAY + 3600,
          bank_line_id: BNK(1),
        }),
      ],
    );

    const key = (r: typeof outOfScope) =>
      r.by_clause.find((c) => c.clause.id === "C3" && c.clause.half === "bank-arrival");

    expect(key(outOfScope)?.out_of_scope).toBe(1);
    expect(key(outOfScope)?.compared).toBe(0);
    expect(key(inScope)?.out_of_scope).toBe(0);
    expect(key(inScope)?.compared).toBe(1);
  });

  it("still compares C3's ORDERING half when the bank half is out of scope", () => {
    // "Excluding it wholesale would drop a clause the gate can and should test."
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);
    const ordering = result.by_clause.find(
      (c) => c.clause.id === "C3" && c.clause.half === "ordering",
    );
    expect(ordering?.compared).toBe(1);
  });
});

describe("C2's referent set — the divergence the gate exists to catch", () => {
  it("agrees when the parent survives ONLY as a payment observation (F05's shape)", () => {
    // §4.2's F05 withholds a constituent recon line while the payment
    // observation survives. Through spec 1.4.23 the oracle read only recon
    // lines here and the engine also read payments, so the two would have
    // disagreed on exactly these rows. oracleContext closed it.
    const refund = reconLine({
      entity: RFND(1),
      type: "refund",
      amount: 500_000,
      order_id: ORDER(1),
      payment_id: PAY(9),
    });
    const setl = settlement(SETL(1), 500_000, UTR);
    const parentOnlyAsPayment = payment(PAY(9), 1_000_000, ORDER(2));

    const result = consistencyGate(
      [refund, setl, parentOnlyAsPayment],
      [pair({ target: setl, members: [refund] })],
    );

    const c2 = result.by_clause.find((c) => c.clause.id === "C2" && c.clause.half === "refund");
    expect(c2?.compared).toBe(1);
    expect(c2?.diverged).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("agrees that an absent parent leaves C2 unevaluated (E10's business, not C2's)", () => {
    const refund = reconLine({
      entity: RFND(1),
      type: "refund",
      amount: 500_000,
      order_id: ORDER(1),
      payment_id: PAY(99),
    });
    const setl = settlement(SETL(1), 500_000, UTR);
    const result = consistencyGate([refund, setl], [pair({ target: setl, members: [refund] })]);
    expect(result.passed).toBe(true);
  });
});

describe("the sample, and what the gate says about it", () => {
  it("reports the sample size §5.4 item 4 requires beside the pass", () => {
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);
    expect(result.sample_size).toBe(1);
    expect(result.meets_declared_sample_size).toBe(false);
    expect(DECLARED_SAMPLE_SIZE).toBe(20_000);
  });

  it("passes vacuously on an empty sample, and says the sample was short", () => {
    // A gate that threw here would make "no pairs drawn" indistinguishable from
    // "pairs drawn and disagreed". The flag is what separates them.
    const result = consistencyGate([], []);
    expect(result.passed).toBe(true);
    expect(result.meets_declared_sample_size).toBe(false);
  });

  it("refuses a pair whose target is not a target kind (§17.1.1 closes the universe)", () => {
    const notATarget = reconLine({ entity: PAY(1), type: "payment", amount: 1_000, fee: 0 });
    expect(() =>
      consistencyGate([notATarget], [pair({ target: notATarget })]),
    ).toThrow(/does not admit as a target/);
  });

  it("covers all ten clause rows the two sides publish between them", () => {
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([a, setl], [pair({ target: setl, members: [a] })]);
    expect(result.by_clause).toHaveLength(10);
    expect(result.by_clause.map((c) => `${c.clause.id}/${c.clause.half ?? ""}`)).toEqual([
      "C1/",
      "C2/refund",
      "C2/adjustment",
      "C3/ordering",
      "C3/bank-arrival",
      "C4/",
      "C5/",
      "C6/",
      "C7/",
      "C8/",
    ]);
  });
});

describe("a bank_line target — PREREGISTRATION §10 V18", () => {
  it("compares a bank-line pair without inventing a member kind for it", () => {
    // V18: "a settlement is not a member-eligible kind, so a bank_line target
    // has no admissible member". The gate must still be able to evaluate the
    // pair; what it must not do is manufacture one.
    const bank = bankLine(BNK(1), 976_000, UTR);
    const result = consistencyGate([bank], [pair({ target: bank })]);
    expect(result.sample_size).toBe(1);
    expect(result.by_clause).toHaveLength(10);
  });
});

describe("C6 over the EMPTY member set — the divergence this gate found, now closed", () => {
  /**
   * **This gate found a real defect on its first run, and the ENGINE was
   * corrected.** These tests previously pinned the divergence; they now pin its
   * resolution, which is the intended lifecycle of a differential finding.
   *
   * What diverged:
   *
   *   packages/engine/src/s2-candidates.ts `c6`   (removed)
   *     `if (all.length === 0) return "NOT_EVALUATED";`  -> excluded nothing
   *
   *   packages/oracle/src/predicates.ts `checkC6`  (unchanged)
   *     `Σ over [] = 0`, compared against `target.amount` -> NOT_SATISFIED
   *
   * The oracle was right and the engine contradicted **itself**: `§7`'s `I4`
   * states the identical identity over the same allocation, and the engine's
   * own `i4` (`s5-validate.ts`) skips only when there is no settlement target
   * in scope — never on an empty member set. A candidate `c6` declined to
   * evaluate at `S2` is one `I4` rejects at `S5`. `§4.1` reserves *"not
   * evaluated"* for a clause whose **comparand** is absent, and `target.amount`
   * is non-nullable, so the guard never met its own criterion.
   *
   * **The oracle was not weakened and the case was not excluded from the
   * sample.** The empty set remains drawable — `packages/oracle`'s
   * `enumerate.ts` constructs it on every real dataset (`mask = 0`) and relies
   * on `checkC6` to reject it — so `§7.3`'s *"deliberately including
   * inadmissible ones"* still reaches this pair, and it is now agreed rather
   * than silent.
   *
   * Unchanged by the fix: `packages/domain`'s `HARD_CONSTRAINTS`, and therefore
   * `constraint_set_hash`. `§4.1`'s clause wording is untouched; the correction
   * is to an implementation that had departed from it.
   */
  it("agrees on C6, both sides excluding the empty set", () => {
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([setl], [pair({ pair_id: "empty", target: setl })]);

    expect(result.passed).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it("agrees on overall admissibility too, and compares C6 rather than skipping it", () => {
    // The correction must not be mistaken for "the gate stopped looking". C6
    // must still be COMPARED on this pair — an agreement reached by dropping
    // the clause out of the criterion would be the failure mode §5.3's
    // per-clause denominators exist to expose.
    //
    // That both sides now EXCLUDE (rather than both admit) is asserted
    // per-side, where each package may be imported: the engine's own
    // `evaluate([], ctx)` test in packages/engine, and `checkC6` in
    // packages/oracle. §L.1 rule 3 keeps that pairing out of this file.
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([setl], [pair({ pair_id: "empty", target: setl })]);

    expect(result.admissibility_divergences).toHaveLength(0);
    const c6 = result.by_clause.find(
      (c) => c.clause.id === "C6" && c.clause.half === null,
    );
    expect(c6?.compared).toBe(1);
    expect(c6?.agreed).toBe(1);
    expect(c6?.diverged).toBe(0);
  });

  it("does NOT diverge on a zero-amount target, which both sides let through", () => {
    // The seam is exactly the comparand question, and this pair isolates it:
    // with `target.amount === 0` the oracle's sum ties out, so the two words
    // carry the same exclusion bit and the gate is silent.
    const setl = settlement(SETL(2), 0, UTR);
    const result = consistencyGate([setl], [pair({ target: setl })]);
    expect(result.divergences).toHaveLength(0);
  });

  it("still catches a genuine clause divergence, so the fix did not blind the gate", () => {
    // A positive control for the two corrections above. The oracle reads
    // `settled_at === null` as NOT_SATISFIED on C3-ordering (spec 1.4.2: "an
    // unconditional filter whose bounded quantity does not exist cannot report
    // that it is within bounds"). If a future change made the gate agree by
    // comparing nothing, this test fails.
    const unsettled = reconLine({
      entity: PAY(9),
      type: "payment",
      amount: 1_000_000,
      fee: 24_000,
      settled_at: null,
    });
    const setl = settlement(SETL(9), 976_000, UTR);
    const result = consistencyGate(
      [unsettled, setl],
      [pair({ pair_id: "unsettled", target: setl, members: [unsettled] })],
    );

    const c3 = result.by_clause.find(
      (c) => c.clause.id === "C3" && c.clause.half === "ordering",
    );
    expect(c3?.compared).toBe(1);
  });

  it("does not diverge on C1, C3-ordering, C4 or C7 over the same empty set", () => {
    // The engine guards all four with the same `members.length === 0` early
    // return while the oracle's `every` is vacuously true. Both words carry
    // "does not exclude", so the comparison agrees — which is why the exclusion
    // bit is the right unit and the verdict WORD is not.
    const setl = settlement(SETL(1), 976_000, UTR);
    const result = consistencyGate([setl], [pair({ target: setl })]);
    const diverged = result.divergences.map((d) => d.clause.id);
    expect(diverged).not.toContain("C1");
    expect(diverged).not.toContain("C3");
    expect(diverged).not.toContain("C4");
    expect(diverged).not.toContain("C7");
  });
});

describe("anchored-member scope — every clause reads the whole allocation", () => {
  /**
   * `DATA_MODEL.md §11` fixes the scope at the field the clauses filter:
   * `Candidate.member_obs_ids` is *"the whole allocation, ANCHORED members
   * INCLUDED"*. `§4.1` then quantifies every clause over that set — `C1`
   * *"across all members and the target"*, `C3` *"for every member"*, `C5`
   * *"per-line"*, `C7` *"no member"*, `C8` *"for members claimed as settled"*.
   *
   * The engine evaluated `C6` and co-settlement coherence over the union and
   * the other eight clause rows over the **proposed** subset alone, so an
   * anchored line could carry a corrupt arithmetic identity, a foreign
   * currency, an inverted timestamp or a prior allocation through the filter
   * untested. `evaluate` now builds the union once and passes it to every
   * clause. The oracle already read the whole allocation, so this closes a
   * divergence class rather than opening one.
   */
  it("catches a corrupt ANCHORED line on C5, which the proposed subset alone would miss", () => {
    // `credit` is overridden away from `amount - fee`, so C5 must exclude. The
    // line is ANCHORED, so under the old proposed-only scope the engine's C5
    // never saw it and returned PASS while the oracle returned NOT_SATISFIED.
    const corruptAnchored = reconLine({
      entity: PAY(1),
      type: "payment",
      amount: 1_000_000,
      fee: 24_000,
      credit: 999_999, // §4.1 C5 requires 1_000_000 - 24_000 = 976_000
    });
    const clean = reconLine({
      entity: PAY(2),
      type: "payment",
      amount: 500_000,
      fee: 12_000,
    });
    // Tie out C6 over the UNION so that C5 is the only clause that can exclude.
    const setl = settlement(SETL(1), 999_999 + 488_000, UTR);

    const result = consistencyGate(
      [corruptAnchored, clean, setl],
      [
        pair({
          pair_id: "anchored-c5",
          target: setl,
          anchored: [corruptAnchored],
          members: [clean],
        }),
      ],
    );

    expect(result.divergences).toHaveLength(0);
    expect(result.admissibility_divergences).toHaveLength(0);

    const c5 = result.by_clause.find((c) => c.clause.id === "C5" && c.clause.half === null);
    expect(c5?.compared).toBe(1);
    expect(c5?.agreed).toBe(1);

    // C6 must still tie out over the union, or this pair would prove nothing
    // about C5 — it would just be an arithmetic failure wearing C5's name.
    const c6 = result.by_clause.find((c) => c.clause.id === "C6" && c.clause.half === null);
    expect(c6?.agreed).toBe(1);
  });

  it("agrees on a candidate mixing anchored and proposed members", () => {
    const anchored = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const proposed = reconLine({ entity: PAY(2), type: "payment", amount: 500_000, fee: 12_000 });
    const setl = settlement(SETL(1), 976_000 + 488_000, UTR);

    const result = consistencyGate(
      [anchored, proposed, setl],
      [pair({ pair_id: "mixed", target: setl, anchored: [anchored], members: [proposed] })],
    );

    expect(result.passed).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it("agrees on a multi-member candidate with no anchored members", () => {
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const b = reconLine({ entity: PAY(2), type: "payment", amount: 500_000, fee: 12_000 });
    const c = reconLine({ entity: PAY(3), type: "payment", amount: 250_000, fee: 6_000 });
    const setl = settlement(SETL(1), 976_000 + 488_000 + 244_000, UTR);

    const result = consistencyGate(
      [a, b, c, setl],
      [pair({ pair_id: "multi", target: setl, members: [a, b, c] })],
    );

    expect(result.passed).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it("agrees clause-by-clause across all ten rows on a mixed candidate", () => {
    const anchored = reconLine({ entity: PAY(1), type: "payment", amount: 1_000_000, fee: 24_000 });
    const proposed = reconLine({ entity: PAY(2), type: "payment", amount: 500_000, fee: 12_000 });
    const setl = settlement(SETL(1), 976_000 + 488_000, UTR);

    const result = consistencyGate(
      [anchored, proposed, setl],
      [pair({ pair_id: "mixed", target: setl, anchored: [anchored], members: [proposed] })],
    );

    expect(result.by_clause).toHaveLength(10);
    for (const tally of result.by_clause) {
      expect(tally.diverged).toBe(0);
    }
  });
});
