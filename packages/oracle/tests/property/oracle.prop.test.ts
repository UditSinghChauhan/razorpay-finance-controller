import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ACCOUNT_CODES, CONSTRAINT_IDS } from "@assay/domain";
import type { Observation } from "@assay/domain";

import {
  C_ORACLE,
  K_ORACLE,
  TAU_FLOOR_PAISE,
  anchoredEntities,
  checkAll,
  classify,
  decompose,
  emptyContext,
  enumerateAll,
  isAdmissible,
  labelAll,
  materiality,
  memberContribution,
  observationValue,
  projectAllocation,
  tauFor,
  unanchoredMembers,
  type MemberContribution,
  type TargetContribution,
} from "../../src/index.js";
import { ADJ, BNK, DAY, PAY, SETL, T0, bankLine, reconLine, settlement } from "../fixtures.js";

const UTR = "1568176960vxp0rj";
const RUNS = 2_000;

/**
 * A recon line honouring `C5`, built only from the arbitrary's own draws.
 *
 * No `Math.random`, no clock: a property that fails must be reproducible from
 * fast-check's seed alone, which is the same discipline
 * `packages/generator` applies to the benchmark itself.
 */
const lineArb = fc
  .record({
    index: fc.integer({ min: 1, max: 999_999 }),
    amount: fc.integer({ min: 1, max: 5_000_000 }),
    feeBps: fc.integer({ min: 0, max: 400 }),
    dayOffset: fc.integer({ min: 1, max: 7 }),
    isRefund: fc.boolean(),
  })
  .map(({ index, amount, feeBps, dayOffset, isRefund }) =>
    reconLine({
      entity: PAY(index),
      type: isRefund ? "refund" : "payment",
      amount,
      fee: isRefund ? 0 : Math.round((amount * feeBps) / 10_000),
      settled_at: T0 + dayOffset * DAY,
    }),
  );

const contributionsOf = (observations: readonly Observation[]): MemberContribution[] =>
  observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);

const targetOf = (amount: number): TargetContribution => ({
  obs_id: settlement(SETL(1), amount, UTR).obs_id,
  id: SETL(1),
  kind: "settlement",
  amount: settlement(SETL(1), amount, UTR).payload.amount,
  currency: "INR",
  value_date: null,
  bank_line_id: null,
});

describe("checkAll never short-circuits (§5.2, §5.3)", () => {
  it("returns a verdict for all eight constraints on every candidate", () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { maxLength: 6 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (lines, amount) => {
          const verdicts = checkAll(
            { target: targetOf(amount), members: contributionsOf(lines) },
            emptyContext(),
          );
          for (const id of CONSTRAINT_IDS) {
            expect(["SATISFIED", "NOT_SATISFIED", "NON_BINDING"]).toContain(verdicts[id]);
          }
          return Object.keys(verdicts).length === CONSTRAINT_IDS.length;
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("enumeration is exhaustive, and never truncated (§5.2, §4.3)", () => {
  it("returns exactly the admissible subsets an independent brute force finds", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { minLength: 1, maxLength: 6 }), (lines) => {
        const head = memberContribution(lines[0]!);
        if (head === null) return true;
        // Restrict to one coherence class so the pool the oracle enumerates and
        // the pool the reference enumerates are the same set.
        const sameClass = lines.filter(
          (l) => memberContribution(l)?.settled_at === head.settled_at,
        );
        const members = contributionsOf(sameClass);
        const net = members.reduce((t, m) => t + m.credit - m.debit, 0);
        if (net < 0) return true; // Settlement.amount is non-negative (ARCH §4)

        const setl = settlement(SETL(1), net, UTR);
        const result = enumerateAll([...sameClass, setl], emptyContext()).find(
          (r) => r.target_id === SETL(1),
        );
        if (result === undefined || result.status !== "ENUMERATED") return true;

        const target: TargetContribution = {
          obs_id: setl.obs_id, id: SETL(1), kind: "settlement",
          amount: setl.payload.amount, currency: "INR", value_date: null, bank_line_id: null,
        };
        const reference: string[] = [];
        for (let mask = 0; mask < 2 ** members.length; mask += 1) {
          const chosen = members.filter((_, i) => mask & (1 << i));
          if (isAdmissible(checkAll({ target, members: chosen }, emptyContext()))) {
            reference.push(chosen.map((m) => m.obs_id).sort().join(" "));
          }
        }
        const got = result.solutions.map((s) => [...s.member_obs_ids].sort().join(" "));
        return got.sort().join("|") === reference.sort().join("|");
      }),
      { numRuns: 400 },
    );
  });
});

describe("order-independence — the oracle's analogue of I9", () => {
  it("rotating the observation array changes no solution and no status", () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 9 }),
        (lines, rotation) => {
          const members = contributionsOf(lines);
          const net = members.reduce((t, m) => t + m.credit - m.debit, 0);
          if (net < 0) return true;
          const base: Observation[] = [...lines, settlement(SETL(1), net, UTR), bankLine(BNK(1), net, UTR)];
          const rotated = [...base];
          for (let i = 0; i < rotation % base.length; i += 1) rotated.push(rotated.shift()!);

          const a = enumerateAll(base, emptyContext()).find((r) => r.target_id === SETL(1));
          const b = enumerateAll(rotated, emptyContext()).find((r) => r.target_id === SETL(1));
          const key = (r: typeof a): string =>
            (r?.solutions ?? [])
              .map((s) => [...s.member_obs_ids].sort().join(" "))
              .sort()
              .join("|");
          return key(a) === key(b) && a?.status === b?.status;
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("the budget is a bound, not a truncation (§4.3)", () => {
  it("a class over K_oracle yields no solutions at all", () => {
    const many = Array.from({ length: K_ORACLE + 1 }, (_, i) =>
      reconLine({ entity: PAY(i + 1), type: "payment", amount: 100 + i, fee: 0 }),
    );
    const result = enumerateAll(
      [...many, settlement(SETL(1), 999_999, UTR)],
      emptyContext(),
    ).find((r) => r.target_id === SETL(1));
    expect(result?.status).toBe("K_ORACLE_EXCEEDED");
    expect(result?.solutions).toHaveLength(0);
    expect(2 ** K_ORACLE).toBeGreaterThan(C_ORACLE); // §5.2's recorded inconsistency
  });
});

describe("materiality is a metric (§6)", () => {
  it("is symmetric, non-negative, and zero against itself", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 5 }), fc.array(lineArb, { maxLength: 5 }), (xs, ys) => {
        const px = projectAllocation(contributionsOf(xs));
        const py = projectAllocation(contributionsOf(ys));
        return (
          materiality(px, py) >= 0 &&
          materiality(px, py) === materiality(py, px) &&
          materiality(px, px) === 0
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("projects only into the seven frozen control accounts", () => {
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 5 }), (xs) => {
        const keys = Object.keys(projectAllocation(contributionsOf(xs))).sort();
        return keys.join() === [...ACCOUNT_CODES].sort().join();
      }),
      { numRuns: 500 },
    );
  });
});

describe("tau, and the B7 base convention (conventions.ts O-TAU-BASE)", () => {
  it("never falls below the Rs 100 floor and is monotone in its base", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.integer({ min: 0, max: 10_000_000_000 }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          return tauFor(lo) >= TAU_FLOOR_PAISE && tauFor(hi) >= tauFor(lo);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("PINS the divergence between tau bases, and which side spec 1.4.6 ratified", () => {
    // conventions.ts O-TAU-BASE. The divergence is kept, not deleted: ratifying
    // the base settles WHICH reading is normative, it does not make the two
    // readings agree. A test that stopped measuring the gap would let a future
    // reader assume they always had.
    //
    // Construction: two payments with the same credit and different fees, so
    // both tie out to one target while their projections differ by the fee gap
    // (B1's mechanism). The component base is ~2x the target base, so a
    // materiality between the two taus lands on opposite sides of them.
    const credit = 50_000_000; // Rs 5,00,000
    const feeGap = 75_000; // Rs 750 -- above tau(target), below tau(component)
    const a = reconLine({ entity: PAY(1), type: "payment", amount: credit, fee: 0 });
    const b = reconLine({ entity: PAY(2), type: "payment", amount: credit + feeGap, fee: feeGap });
    const setl = settlement(SETL(1), credit, UTR);

    const observations = [a, b, setl];
    const result = enumerateAll(observations, emptyContext()).find((r) => r.target_id === SETL(1));
    expect(result?.solutions.length).toBe(2);
    if (result === undefined) throw new Error("no result");

    const members = contributionsOf([a, b]);
    const byObs = new Map(members.map((m) => [m.obs_id, m]));

    // The RATIFIED base, computed by the oracle rather than restated here:
    // DATA_MODEL.md §11's Sigma value(observation) over the component's
    // unanchored nodes. Both lines are unanchored and both appear in an
    // admissible candidate, so the component holds exactly the two of them.
    const { decomposition, labels } = labelAll(observations, emptyContext());
    const component = decomposition.byTargetId.get(SETL(1));
    if (component === undefined) throw new Error("no component");
    expect(component.member_obs_ids).toEqual([a.obs_id, b.obs_id].sort());
    expect(component.total_value_paise).toBe(credit + (credit + feeGap));
    expect(component.size).toBe(2);

    const onTarget = classify(result, byObs, credit);
    const onComponent = classify(result, byObs, component.total_value_paise);

    expect(onTarget.max_materiality_paise).toBe(feeGap);
    expect(tauFor(credit)).toBeLessThan(feeGap);
    expect(tauFor(component.total_value_paise)).toBeGreaterThan(feeGap);
    expect(onTarget.label).toBe("TRULY_AMBIGUOUS");
    expect(onComponent.label).toBe("IMMATERIALLY_AMBIGUOUS");
    expect(onTarget.label).not.toBe(onComponent.label);

    // And the oracle's own product takes the ratified side. This is the
    // assertion that fails if labelAll ever reverts to the target's amount.
    const label = labels.find((l) => l.target_id === SETL(1));
    expect(label?.label).toBe("IMMATERIALLY_AMBIGUOUS");
    expect(label?.tau_paise).toBe(tauFor(component.total_value_paise));
    expect(label?.tau_paise).not.toBe(tauFor(credit));
  });
});

describe("component decomposition — RECONCILIATION_SPEC §5", () => {
  it("excludes ANCHORED members from total_value_paise, which can drop tau to the floor", () => {
    // DECISION_BRIEF.md §A.13's disclosed consequence, measured. The anchored
    // line is a member of every CANDIDATE (C6 reads the whole allocation) but
    // is not a NODE of the component, so its value is not in the base.
    const anchored = reconLine({
      entity: PAY(1), type: "payment", amount: 90_000_000, fee: 0, settlement_id: SETL(1),
    });
    const free = reconLine({ entity: PAY(2), type: "payment", amount: 500_000, fee: 0 });
    const setl = settlement(SETL(1), 90_500_000, UTR);

    const { decomposition, results } = labelAll([anchored, free, setl], emptyContext());
    const result = results.find((r) => r.target_id === SETL(1));
    const component = decomposition.byTargetId.get(SETL(1));
    if (component === undefined) throw new Error("no component");

    // The allocation carries both; the component carries only the unanchored one.
    expect(result?.solutions[0]?.member_obs_ids).toEqual(
      [anchored.obs_id, free.obs_id].sort(),
    );
    expect(component.member_obs_ids).toEqual([free.obs_id]);
    expect(component.total_value_paise).toBe(500_000);

    // 10 bps of 5,00,000 paise is 500 -- below the Rs 100_00 floor, so the
    // floor wins. On the whole allocation (9,05,00,000) it would have been
    // 90,500, which is 9x the floor.
    expect(tauFor(component.total_value_paise)).toBe(TAU_FLOOR_PAISE);
    expect(tauFor(90_500_000)).toBeGreaterThan(TAU_FLOOR_PAISE);
  });

  it("puts two targets sharing an admissible member in ONE component", () => {
    // §5's edge rule is co-occurrence in an admissible candidate, and C7 is
    // inert in an empty context, so one line can serve two settlements. The
    // component is then the union, and both targets read the same tau base.
    const line = reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 });
    const other = reconLine({ entity: PAY(2), type: "payment", amount: 500, fee: 12 });
    const s1 = settlement(SETL(1), 976, UTR);
    const s2 = settlement(SETL(2), 976, "9900000000abcdef");

    const { decomposition } = labelAll([line, other, s1, s2], emptyContext());
    const c1 = decomposition.byTargetId.get(SETL(1));
    const c2 = decomposition.byTargetId.get(SETL(2));
    expect(c1).toBe(c2);
    expect(c1?.target_ids).toEqual([SETL(1), SETL(2)]);
    expect(c1?.member_obs_ids).toContain(line.obs_id);
    expect(c1?.solve_status).toBe("SOLVED");
  });

  it("is order-independent — the decomposition is a function of the input set", () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 9 }),
        (lines, rotation) => {
          const members = contributionsOf(lines);
          const net = members.reduce((t, m) => t + m.credit - m.debit, 0);
          if (net < 0) return true;
          const base: Observation[] = [...lines, settlement(SETL(1), net, UTR)];
          const rotated = [...base];
          for (let i = 0; i < rotation % base.length; i += 1) rotated.push(rotated.shift()!);

          const key = (obs: readonly Observation[]): string =>
            decompose(
              enumerateAll(obs, emptyContext()),
              obs.map((o) => memberContribution(o)).filter((m): m is MemberContribution => m !== null),
            )
              .components.map(
                (c) => `${c.key}|${c.total_value_paise}|${c.member_obs_ids.join(",")}`,
              )
              .join("||");
          return key(base) === key(rotated);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("dangling settlement_id: the ratified O-ANCHOR-TEST rule governs, and is pinned", () => {
    // conventions.ts O-ANCHOR-TEST. PREREGISTRATION.md §4.2/§4.3 admit no
    // conforming dataset carrying a non-null settlement_id that names an absent
    // settlement, so this input is OUTSIDE the declared population and exists
    // only to pin which reading governs if one ever appears.
    const dangling = reconLine({
      entity: PAY(1), type: "payment", amount: 1000, fee: 24, settlement_id: SETL(9),
    });
    const free = reconLine({ entity: PAY(2), type: "payment", amount: 500, fee: 12 });
    const setl = settlement(SETL(1), 488, UTR);
    const observations = [dangling, free, setl];
    const members = contributionsOf(observations);

    // AN1 establishes no anchor for it -- the referent is absent.
    expect([...anchoredEntities(observations)]).not.toContain(PAY(1));
    // The ratified pool test excludes it anyway: it carries a settlement_id.
    expect(unanchoredMembers(members).map((m) => m.entity_id)).not.toContain(PAY(1));
    expect(unanchoredMembers(members).map((m) => m.entity_id)).toContain(PAY(2));

    // Consequence, stated rather than left to be discovered: it is not a §5 node.
    const { decomposition } = labelAll(observations, emptyContext());
    expect(
      decomposition.components.some((c) => c.member_obs_ids.includes(dangling.obs_id)),
    ).toBe(false);

    // And it reaches no target's tau base, because a line in no admissible
    // candidate draws no edge. This is why the divergence is inert.
    const component = decomposition.byTargetId.get(SETL(1));
    expect(component?.member_obs_ids).toEqual([free.obs_id]);
    expect(component?.total_value_paise).toBe(500);
  });

  it("the ratified rule changes no enumeration: a null settlement_id still searches", () => {
    // The companion to the case above. O-ANCHOR-TEST ratifies the EXISTING
    // filter, so a line with settlement_id null must still enter the pool and
    // still be found -- if this ever fails, the ratification changed behaviour.
    const a = reconLine({ entity: PAY(1), type: "payment", amount: 1000, fee: 24 });
    const b = reconLine({ entity: PAY(2), type: "payment", amount: 500, fee: 12 });
    const setl = settlement(SETL(1), 976 + 488, UTR);
    const result = enumerateAll([a, b, setl], emptyContext()).find(
      (r) => r.target_id === SETL(1),
    );
    expect(result?.status).toBe("ENUMERATED");
    expect(result?.pool_size).toBe(2);
    expect(result?.solutions).toHaveLength(1);
    expect(result?.solutions[0]?.member_obs_ids).toEqual([a.obs_id, b.obs_id].sort());
  });

  it("values an adjustment at M, NOT at amount (§14.1), on both sides", () => {
    // §14.1: "M -- the non-zero one of debit/credit. **Not `amount`.**" The
    // amounts below are chosen so `amount` and `M` cannot coincide, which is
    // what makes this a test of the rule rather than of the fixture.
    const debitSide = reconLine({
      entity: ADJ(1), type: "adjustment", amount: 7_777, debit: 4_242, credit: 0,
    });
    const creditSide = reconLine({
      entity: ADJ(2), type: "adjustment", amount: 7_777, debit: 0, credit: 3_333,
    });
    const dm = memberContribution(debitSide);
    const cm = memberContribution(creditSide);
    if (dm === null || cm === null) throw new Error("adjustment must be member-eligible");

    expect(observationValue(dm)).toBe(4_242);
    expect(observationValue(dm)).not.toBe(dm.amount);
    expect(observationValue(cm)).toBe(3_333);
    expect(observationValue(cm)).not.toBe(cm.amount);

    // Both satisfy C5's adjustment identity, so both can legitimately be
    // members of an admissible candidate and reach total_value_paise.
    expect((dm.debit !== 0) !== (dm.credit !== 0)).toBe(true);
    expect((cm.debit !== 0) !== (cm.credit !== 0)).toBe(true);

    // And a payment is still valued at amount, so the branch is real.
    const pay = memberContribution(
      reconLine({ entity: PAY(9), type: "payment", amount: 1_000, fee: 24 }),
    );
    if (pay === null) throw new Error("payment must be member-eligible");
    expect(observationValue(pay)).toBe(1_000);
    expect(observationValue(pay)).not.toBe(pay.credit);
  });
});
