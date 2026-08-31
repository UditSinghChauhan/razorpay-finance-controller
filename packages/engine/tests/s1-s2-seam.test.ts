import { describe, expect, it } from "vitest";

import type { Observation, ObservationId } from "@assay/domain";

import { anchor, type AnchorResult } from "../src/s1-anchor.js";
import {
  IncoherentAnchorStateError,
  buildSeam,
  type Seam,
} from "../src/s1-s2-seam.js";
import {
  evaluate,
  generateCandidates,
  type EvaluationContext,
  type Member,
  type Target,
} from "../src/s2-candidates.js";

import { adjustment, bankLine, obsId, payment, reconLine, settlement } from "./fixtures.js";

/**
 * The `S1` → `S2` seam.
 *
 * **Expectations are written against the frozen text, not against the module.**
 * Each test states what `RECONCILIATION_SPEC.md §3`/`§4` or `DATA_MODEL.md §11`
 * requires and asserts the construction against it, the way the `S1` and `S2`
 * suites do — a test that merely restates the implementation would pass on a
 * misreading of `§4`'s *"unanchored target"* as readily as on a correct one.
 *
 * Imports are by module path rather than through `@assay/engine`: wiring the
 * package's public surface is the coordinator's, at integration.
 */

/** The settlement **entity** id `fixtures.ts` gives `settlement(n)`. */
const SETL = (n: number): string => `setl_${String(n).padStart(14, "0")}`;

const seamOf = (observations: readonly Observation[]): Seam =>
  buildSeam({ observations, anchors: anchor(observations) });

const targetOf = (seam: Seam, n: number): Target | undefined =>
  seam.targets.find((t) => t.obs_id === obsId(n));

const contextOf = (seam: Seam, n: number): EvaluationContext | undefined =>
  seam.contexts.find((c) => c.target.obs_id === obsId(n));

/** An `AnchorResult` assembled by hand, for the states `anchor()` cannot produce. */
function anchorResult(over: Partial<AnchorResult>): AnchorResult {
  return {
    links: [],
    rejections: [],
    anchored_obs_ids: [],
    unanchored_member_obs_ids: [],
    ...over,
  };
}

/** The incoherence code a call raises, or a failure if it raises nothing. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof IncoherentAnchorStateError) return e.code;
    throw e;
  }
  throw new Error("expected an IncoherentAnchorStateError; the call returned");
}

const verdictOf = (
  a: ReturnType<typeof evaluate>,
  id: string,
  half: string | null,
): string | undefined => a.clauses.find((c) => c.id === id && c.half === half)?.verdict;

// ---------------------------------------------------------------------------
// §4 — "For each unanchored target (a settlement needing constituents, or a
//       bank line needing settlements)"
// ---------------------------------------------------------------------------

describe("target selection — §4's unanchored target", () => {
  it("selects a settlement no anchor touched", () => {
    // No recon line names it, so AN1 establishes nothing and §3 removes nothing.
    const obs = [
      settlement(1, { amount: 98_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: null }),
    ];
    const seam = seamOf(obs);

    expect(seam.targets.map((t) => t.obs_id)).toEqual([obsId(1)]);
    const t = targetOf(seam, 1);
    expect(t?.kind).toBe("settlement");
    expect(t?.amount).toBe(98_000);
    expect(t?.anchored_members).toEqual([]);
    expect(t?.bank_value_date).toBeNull();
    expect(seam.anchor_resolved).toEqual([]);
  });

  it("selects a settlement whose anchored members do not yet satisfy C6", () => {
    // §4: "a settlement NEEDING CONSTITUENTS". One anchored line of credit
    // 98,000 against an amount of 196,000 leaves a residual, so it needs them.
    const obs = [
      settlement(1, { amount: 196_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }),
      reconLine(3, { settlementId: null }),
    ];
    const seam = seamOf(obs);

    const t = targetOf(seam, 1);
    expect(t).toBeDefined();
    expect(t?.anchored_members.map((m) => m.obs_id)).toEqual([obsId(2)]);
    expect(seam.anchor_resolved).toEqual([]);
  });

  it("does NOT select a settlement whose AN1-anchored members already tie out", () => {
    // §3: "Everything anchored is removed from the search space." The anchored
    // allocation satisfies C6 -- 98,000 credit, 0 debit, amount 98,000 -- so the
    // settlement needs no constituents and is not a §4 target.
    const obs = [
      settlement(1, { amount: 98_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }),
    ];
    const seam = seamOf(obs);

    expect(seam.targets).toEqual([]);
    expect(seam.anchor_resolved).toEqual([
      { obs_id: obsId(1), kind: "settlement", resolution: "AN1_ALREADY_TIED_OUT" },
    ]);
  });

  it("ties out across several anchored members, debits included", () => {
    // C6 is Σ credit − Σ debit, so a refund line's debit reduces the total.
    const obs = [
      settlement(1, { amount: 78_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }), // credit 98,000
      reconLine(3, { settlementId: SETL(1), type: "refund", amount: 20_000 }), // debit 20,000
    ];
    const seam = seamOf(obs);

    expect(seam.targets).toEqual([]);
    expect(seam.anchor_resolved.map((r) => r.resolution)).toEqual([
      "AN1_ALREADY_TIED_OUT",
    ]);
  });

  it("keeps a zero-amount settlement no anchor touched — the rule is conjunctive", () => {
    // Σ over ∅ is 0, so a bare C6 test would retire this settlement. §3 licenses
    // removal only for what an ANCHOR established, and nothing anchored it.
    const obs = [settlement(1, { amount: 0, utr: "NOMATCH" })];
    const seam = seamOf(obs);

    expect(seam.targets.map((t) => t.obs_id)).toEqual([obsId(1)]);
    expect(seam.anchor_resolved).toEqual([]);
  });

  it("selects a bank line no AN2 link matched", () => {
    // DATA_MODEL.md §11.1: such a target has no admissible member and reaches
    // §9's "no admissible candidate exists at all", with class E03. It has to be
    // a target for that to be reachable.
    const obs = [bankLine(5, { bankRef: null })];
    const seam = seamOf(obs);

    const t = targetOf(seam, 5);
    expect(t?.kind).toBe("bank_line");
    expect(t?.amount).toBe(100_000);
    expect(t?.anchored_members).toEqual([]);
    expect(seam.anchor_resolved).toEqual([]);
  });

  it("does NOT select a bank line AN2 matched to a settlement", () => {
    // PREREGISTRATION.md §10 V18: "AN2 is therefore the only route by which a
    // bank line reaches RECONCILED." Left as a target it would draw the empty
    // candidate set and reach E03 -- "bank credit maps to no known settlement" --
    // on a credit whose settlement S1 named as a fact.
    const obs = [
      settlement(1, { amount: 100_000, utr: "UTR000009" }),
      bankLine(9),
    ];
    const seam = seamOf(obs);

    expect(seam.targets.map((t) => t.obs_id)).toEqual([obsId(1)]);
    expect(seam.anchor_resolved).toEqual([
      { obs_id: obsId(9), kind: "bank_line", resolution: "AN2_MATCHED" },
    ]);
  });

  it("reports both resolutions rather than dropping them — §9 has no drop path", () => {
    const obs = [
      settlement(1, { amount: 98_000, utr: "UTR000009" }),
      reconLine(2, { settlementId: SETL(1) }),
      bankLine(9, { amount: 98_000 }),
    ];
    const seam = seamOf(obs);

    expect(seam.targets).toEqual([]);
    expect(seam.anchor_resolved).toEqual([
      { obs_id: obsId(1), kind: "settlement", resolution: "AN1_ALREADY_TIED_OUT" },
      { obs_id: obsId(9), kind: "bank_line", resolution: "AN2_MATCHED" },
    ]);
  });

  it("makes a target of neither a member-eligible nor a reference kind", () => {
    // §17.1.1: "The target universe is settlements and bank lines, and this
    // table does not widen it." A recon line is a member; a payment is REFERENCE.
    const obs = [
      reconLine(2, { settlementId: null }),
      payment(3),
      settlement(1, { amount: 12_345, utr: "NOMATCH" }),
    ];
    const seam = seamOf(obs);

    expect(seam.targets.map((t) => t.obs_id)).toEqual([obsId(1)]);
  });
});

// ---------------------------------------------------------------------------
// §4.1 C3 — the bank-arrival half's comparand
// ---------------------------------------------------------------------------

describe("Target.bank_value_date — C3's bank-arrival half", () => {
  it("is the settlement's AN2-matched bank line's value_date", () => {
    const obs = [
      settlement(1, { amount: 100_000, utr: "UTR000009" }),
      reconLine(2, { settlementId: SETL(1) }), // 98,000 -- does not tie out
      bankLine(9, { valueDate: 1_783_200_000 }),
    ];
    const seam = seamOf(obs);

    expect(targetOf(seam, 1)?.bank_value_date).toBe(1_783_200_000);
  });

  it("is the bank line's own value_date when the target IS the bank line", () => {
    // §4.1: "the target itself when the target is a bank_line".
    const obs = [bankLine(5, { bankRef: null, valueDate: 1_783_400_000 })];
    expect(targetOf(seamOf(obs), 5)?.bank_value_date).toBe(1_783_400_000);
  });

  it("is null where S1 established no AN2 link, and C3's half is then NON_BINDING", () => {
    // "Where no bank line is in scope the half is evaluated: non-binding ...
    // PER TARGET rather than per dataset."
    const obs = [
      settlement(1, { amount: 196_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: null }),
      bankLine(9), // present in the dataset, matched to nothing
    ];
    const seam = seamOf(obs);
    const ctx = contextOf(seam, 1);

    expect(ctx?.target.bank_value_date).toBeNull();
    expect(ctx).toBeDefined();
    if (ctx !== undefined) {
      const verdict = evaluate(seam.pool, ctx);
      expect(verdictOf(verdict, "C3", "bank-arrival")).toBe("NON_BINDING");
    }
  });

  it("stays null on an E14 collision — no link was established for either", () => {
    // §3: two settlements on one (normalized UTR, amount) key, so "no bank line
    // on it can be attributed" and no AN2 link exists to read a value date from.
    const obs = [
      settlement(1, { utr: "UTRDUP", amount: 100_000 }),
      settlement(2, { utr: "UTRDUP", amount: 100_000 }),
      bankLine(3, { bankRef: "UTRDUP", amount: 100_000 }),
    ];
    const seam = seamOf(obs);

    expect(seam.anchor_resolved).toEqual([]);
    expect(targetOf(seam, 1)?.bank_value_date).toBeNull();
    expect(targetOf(seam, 2)?.bank_value_date).toBeNull();
    // The unattributable credit is still a target: §17.1.1's E14 residual gives
    // it P5 "under its own key", which needs it to reach a state of its own.
    expect(targetOf(seam, 3)?.kind).toBe("bank_line");
  });

  it("takes the EARLIEST credit on an E09 duplicate, and the later one stays a target", () => {
    // §8 rule 3: the later credit is "held in Suspense rather than netted".
    const obs = [
      settlement(1, { utr: "UTRDUP", amount: 100_000 }),
      bankLine(3, { bankRef: "UTRDUP", amount: 100_000, valueDate: 1_783_100_000 }),
      bankLine(4, { bankRef: "UTRDUP", amount: 100_000, valueDate: 1_783_200_000 }),
    ];
    const seam = seamOf(obs);

    expect(targetOf(seam, 1)?.bank_value_date).toBe(1_783_100_000);
    expect(seam.anchor_resolved).toEqual([
      { obs_id: obsId(3), kind: "bank_line", resolution: "AN2_MATCHED" },
    ]);
    expect(targetOf(seam, 4)?.bank_value_date).toBe(1_783_200_000);
  });
});

// ---------------------------------------------------------------------------
// §3 / DATA_MODEL.md §11 — anchored members belong to the allocation
// ---------------------------------------------------------------------------

describe("Target.anchored_members — removed from the SEARCH, not from the settlement", () => {
  it("carries every AN1-anchored member of the settlement, sorted by obs_id", () => {
    const obs = [
      settlement(1, { amount: 500_000, utr: "NOMATCH" }),
      reconLine(4, { settlementId: SETL(1) }),
      reconLine(2, { settlementId: SETL(1) }),
      reconLine(3, { settlementId: null }),
    ];
    const seam = seamOf(obs);

    expect(targetOf(seam, 1)?.anchored_members.map((m) => m.obs_id)).toEqual([
      obsId(2),
      obsId(4),
    ]);
  });

  it("carries an anchored adjustment — §11.1's second member-eligible kind", () => {
    const obs = [
      settlement(1, { amount: 500_000, utr: "NOMATCH" }),
      adjustment(2, { settlementId: SETL(1) }),
    ];
    const seam = seamOf(obs);

    const anchored = targetOf(seam, 1)?.anchored_members ?? [];
    expect(anchored.map((m) => m.kind)).toEqual(["adjustment"]);
  });

  it("gives a bank_line target none — a settlement is not member-eligible", () => {
    const obs = [
      settlement(1, { amount: 98_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }),
      bankLine(5, { bankRef: null }),
    ];
    const seam = seamOf(obs);

    expect(targetOf(seam, 5)?.anchored_members).toEqual([]);
  });

  it("counts one member once when the same anchor is stated twice", () => {
    // An anchor is a fact; a fact asserted twice is one member. Counted twice it
    // would double a credit inside C6.
    const obs = [
      settlement(1, { amount: 196_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }),
    ];
    const link = { anchor: "AN1", source_obs_id: obsId(2), target_obs_id: obsId(1) } as const;
    const seam = buildSeam({
      observations: obs,
      anchors: anchorResult({ links: [link, link] }),
    });

    expect(targetOf(seam, 1)?.anchored_members.map((m) => m.obs_id)).toEqual([obsId(2)]);
  });

  it("is unaffected by AN3 and AN4, which touch neither a member nor a target", () => {
    const obs = [
      settlement(1, { amount: 98_000, utr: "NOMATCH" }),
      payment(6, { orderId: "order_x" }),
      reconLine(2, { settlementId: null }),
    ];
    const seam = seamOf(obs);

    expect(targetOf(seam, 1)?.anchored_members).toEqual([]);
    expect(seam.pool.map((m) => m.obs_id)).toEqual([obsId(2)]);
  });
});

// ---------------------------------------------------------------------------
// §5's observation nodes
// ---------------------------------------------------------------------------

describe("the member pool — §5's unanchored observation nodes", () => {
  it("is S1's unanchored member-eligible set, sorted, with anchored members out", () => {
    const obs = [
      settlement(1, { amount: 500_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }), // anchored
      reconLine(4, { settlementId: null }),
      adjustment(3, { settlementId: null }),
      payment(5),
      bankLine(6, { bankRef: null }),
    ];
    const seam = seamOf(obs);

    expect(seam.pool.map((m) => m.obs_id)).toEqual([obsId(3), obsId(4)]);
  });

  it("holds a recon line whose settlement_id names a settlement not in the set", () => {
    // AN1 is the literal key, referent included: no settlement, no anchor, so
    // the line is still in the search space.
    const obs = [reconLine(2, { settlementId: "setl_does_not_exist" })];
    expect(seamOf(obs).pool.map((m) => m.obs_id)).toEqual([obsId(2)]);
  });
});

// ---------------------------------------------------------------------------
// EvaluationContext
// ---------------------------------------------------------------------------

describe("EvaluationContext", () => {
  it("pairs each context with its target, in the same order", () => {
    const obs = [
      settlement(1, { amount: 12_000, utr: "NOMATCH" }),
      settlement(2, { amount: 13_000, utr: "NOMATCH2" }),
      bankLine(3, { bankRef: null }),
    ];
    const seam = seamOf(obs);

    expect(seam.contexts.map((c) => c.target)).toEqual([...seam.targets]);
    expect(seam.contexts).toHaveLength(seam.targets.length);
  });

  it("resolves C2's parent order id from the observation set", () => {
    const obs = [
      settlement(1, { amount: 12_000, utr: "NOMATCH" }),
      payment(6, { id: "pay_parent", orderId: "order_parent" }),
    ];
    const ctx = contextOf(seamOf(obs), 1);

    expect(ctx?.parentOrderId("pay_parent")).toBe("order_parent");
    // §4.1: absence leaves C2 UNEVALUATED -- E10 territory, not an exclusion.
    expect(ctx?.parentOrderId("pay_absent")).toBeUndefined();
  });

  it("defaults allocated to empty — §5 commits allocation after every component is solved", () => {
    const obs = [settlement(1, { amount: 12_000, utr: "NOMATCH" })];
    const ctx = contextOf(seamOf(obs), 1);

    expect(ctx?.allocated.size).toBe(0);
  });

  it("passes a supplied allocated set through, so C7 can bind on a later pass", () => {
    const obs = [
      settlement(1, { amount: 98_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: null }),
    ];
    const allocated = new Set<ObservationId>([obsId(2)]);
    const seam = buildSeam({ observations: obs, anchors: anchor(obs), allocated });
    const ctx = contextOf(seam, 1);

    expect(ctx).toBeDefined();
    if (ctx !== undefined) {
      expect(verdictOf(evaluate(seam.pool, ctx), "C7", null)).toBe("FAIL");
    }
  });
});

// ---------------------------------------------------------------------------
// Composition with S2 — the stage itself is unchanged
// ---------------------------------------------------------------------------

describe("composition with S2", () => {
  it("hands generateCandidates a context that finds the residual allocation", () => {
    // C6 reads over the WHOLE allocation: 98,000 anchored + 98,000 proposed
    // against an amount of 196,000.
    const obs = [
      settlement(1, { amount: 196_000, utr: "NOMATCH" }),
      reconLine(2, { settlementId: SETL(1) }),
      reconLine(3, { settlementId: null }),
    ];
    const seam = seamOf(obs);
    const ctx = contextOf(seam, 1);

    expect(ctx).toBeDefined();
    if (ctx !== undefined) {
      const generated = generateCandidates(seam.pool, ctx);
      expect(generated.status).toBe("COMPLETE");
      expect(generated.candidates.map((c) => [...c.member_obs_ids])).toEqual([
        [obsId(2), obsId(3)], // §11: the whole allocation, anchored members included
      ]);
    }
  });

  it("a bank_line target still yields the empty candidate set (V18)", () => {
    const obs = [
      bankLine(5, { bankRef: null }),
      reconLine(2, { settlementId: null }),
    ];
    const seam = seamOf(obs);
    const ctx = contextOf(seam, 5);

    expect(ctx).toBeDefined();
    if (ctx !== undefined) {
      expect(generateCandidates(seam.pool, ctx).candidates).toEqual([]);
    }
  });

  it("S2's enumeration is untouched: the tied-out case is excluded at SELECTION", () => {
    // Handed the tied-out settlement as a target anyway, S2 enumerates from
    // mask = 1 and therefore proposes nothing -- which is correct for S2, and is
    // exactly why the settlement must not be selected as a target at all.
    const settled = settlement(1, { amount: 98_000, utr: "NOMATCH" });
    const anchored: Member = reconLine(2, { settlementId: SETL(1) });
    const target: Target = {
      obs_id: settled.obs_id,
      kind: "settlement",
      amount: 98_000,
      bank_value_date: null,
      anchored_members: [anchored],
    };
    const ctx: EvaluationContext = {
      target,
      parentOrderId: () => undefined,
      allocated: new Set<ObservationId>(),
    };

    // The anchored allocation alone is admissible -- C6 holds over it ...
    expect(evaluate([], ctx).admissible).toBe(true);
    // ... but S2 never enumerates the empty proposal, so nothing is produced.
    expect(generateCandidates([], ctx).candidates).toEqual([]);
    // The seam is where the case is handled, and it handles it by not selecting.
    expect(seamOf([settled, anchored]).targets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism and purity — ARCHITECTURE.md §3, DATA_MODEL.md §16
// ---------------------------------------------------------------------------

describe("determinism and purity", () => {
  const dataset = (): Observation[] => [
    settlement(1, { amount: 196_000, utr: "UTR000009" }),
    reconLine(2, { settlementId: SETL(1) }),
    reconLine(3, { settlementId: null }),
    adjustment(4, { settlementId: null }),
    bankLine(9),
    bankLine(8, { bankRef: null }),
    payment(7),
  ];

  /**
   * Everything a `§16` identifier can be built from. `parentOrderId` is a
   * closure and two constructions never share one, so it is compared by what it
   * answers rather than by reference.
   */
  const shapeOf = (seam: Seam) => ({
    targets: seam.targets,
    pool: seam.pool.map((m) => m.obs_id),
    anchor_resolved: seam.anchor_resolved,
    contexts: seam.contexts.map((c) => ({
      target: c.target,
      allocated: [...c.allocated].sort(),
    })),
  });

  it("returns an identical result for the same input twice", () => {
    const obs = dataset();
    const anchors = anchor(obs);
    const a = buildSeam({ observations: obs, anchors });
    const b = buildSeam({ observations: obs, anchors });

    expect(shapeOf(a)).toEqual(shapeOf(b));
    expect(a.contexts[0]?.parentOrderId("pay_00000000000007")).toBe(
      b.contexts[0]?.parentOrderId("pay_00000000000007"),
    );
  });

  it("does not depend on the order of the observation array", () => {
    const forward = seamOf(dataset());
    const reversed = seamOf([...dataset()].reverse());

    expect(shapeOf(reversed)).toEqual(shapeOf(forward));
  });

  it("does not mutate its arguments", () => {
    const obs = dataset();
    const anchors = anchor(obs);
    const snapshot = structuredClone(obs);
    buildSeam({ observations: obs, anchors });
    expect(obs).toEqual(snapshot);
  });

  it("freezes what it hands back", () => {
    const seam = seamOf(dataset());
    expect(Object.isFrozen(seam.targets)).toBe(true);
    expect(Object.isFrozen(seam.contexts)).toBe(true);
    expect(Object.isFrozen(seam.pool)).toBe(true);
    expect(Object.isFrozen(seam.anchor_resolved)).toBe(true);
    for (const t of seam.targets) expect(Object.isFrozen(t.anchored_members)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Malformed upstream state — fail loudly, never build a wrong Target
// ---------------------------------------------------------------------------

describe("an AnchorResult that cannot yield a coherent Target is refused", () => {
  const settled = settlement(1, { amount: 196_000, utr: "NOMATCH" });
  const line = reconLine(2, { settlementId: SETL(1) });
  const bank = bankLine(3, { bankRef: null });
  const pay = payment(4);

  it("refuses two observations carrying one obs_id", () => {
    const obs = [settled, settled];
    expect(codeOf(() => buildSeam({ observations: obs, anchors: anchorResult({}) }))).toBe(
      "DUPLICATE_OBS_ID",
    );
  });

  it("refuses an anchor endpoint the observation set does not carry", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled],
          anchors: anchorResult({
            links: [
              { anchor: "AN1", source_obs_id: obsId(99), target_obs_id: obsId(1) },
            ],
          }),
        }),
      ),
    ).toBe("ANCHOR_ENDPOINT_UNKNOWN");
  });

  it("refuses an AN1 target that is not a settlement", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [line, bank],
          anchors: anchorResult({
            links: [
              { anchor: "AN1", source_obs_id: obsId(2), target_obs_id: obsId(3) },
            ],
          }),
        }),
      ),
    ).toBe("ANCHOR_ENDPOINT_WRONG_KIND");
  });

  it("refuses an AN1 source that is not member-eligible", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, pay],
          anchors: anchorResult({
            links: [
              { anchor: "AN1", source_obs_id: obsId(4), target_obs_id: obsId(1) },
            ],
          }),
        }),
      ),
    ).toBe("ANCHOR_ENDPOINT_WRONG_KIND");
  });

  it("refuses an AN2 source that is not a settlement", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [line, bank],
          anchors: anchorResult({
            links: [
              { anchor: "AN2", source_obs_id: obsId(2), target_obs_id: obsId(3) },
            ],
          }),
        }),
      ),
    ).toBe("ANCHOR_ENDPOINT_WRONG_KIND");
  });

  it("refuses an AN2 target that is not a bank line", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, line],
          anchors: anchorResult({
            links: [
              { anchor: "AN2", source_obs_id: obsId(1), target_obs_id: obsId(2) },
            ],
          }),
        }),
      ),
    ).toBe("ANCHOR_ENDPOINT_WRONG_KIND");
  });

  it("refuses one member anchored to two settlements — §3 rejects that under I2", () => {
    const other = settlement(5, { amount: 196_000, utr: "NOMATCH2" });
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, other, line],
          anchors: anchorResult({
            links: [
              { anchor: "AN1", source_obs_id: obsId(2), target_obs_id: obsId(1) },
              { anchor: "AN1", source_obs_id: obsId(2), target_obs_id: obsId(5) },
            ],
          }),
        }),
      ),
    ).toBe("MEMBER_MULTIPLY_ANCHORED");
  });

  it("refuses one settlement matched to two bank lines — C3 names one", () => {
    const other = bankLine(6, { bankRef: null });
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, bank, other],
          anchors: anchorResult({
            links: [
              { anchor: "AN2", source_obs_id: obsId(1), target_obs_id: obsId(3) },
              { anchor: "AN2", source_obs_id: obsId(1), target_obs_id: obsId(6) },
            ],
          }),
        }),
      ),
    ).toBe("BANK_LINE_AMBIGUOUS");
  });

  it("refuses a pool id the observation set does not carry", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled],
          anchors: anchorResult({ unanchored_member_obs_ids: [obsId(99)] }),
        }),
      ),
    ).toBe("POOL_ID_UNKNOWN");
  });

  it("refuses a pool id of a kind §11.1 does not admit", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, bank],
          anchors: anchorResult({ unanchored_member_obs_ids: [obsId(3)] }),
        }),
      ),
    ).toBe("POOL_ID_NOT_MEMBER_ELIGIBLE");
  });

  it("refuses a pool id that AN1 anchored — §3 removes it from the search space", () => {
    expect(
      codeOf(() =>
        buildSeam({
          observations: [settled, line],
          anchors: anchorResult({
            links: [
              { anchor: "AN1", source_obs_id: obsId(2), target_obs_id: obsId(1) },
            ],
            unanchored_member_obs_ids: [obsId(2)],
          }),
        }),
      ),
    ).toBe("POOL_ID_ANCHORED");
  });

  it("names the observations the contradiction is about", () => {
    try {
      buildSeam({
        observations: [settled],
        anchors: anchorResult({ unanchored_member_obs_ids: [obsId(99)] }),
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IncoherentAnchorStateError);
      if (e instanceof IncoherentAnchorStateError) {
        expect(e.obs_ids).toEqual([obsId(99)]);
        expect(e.message).toContain("POOL_ID_UNKNOWN");
      }
    }
  });

  it("accepts every AnchorResult that anchor() can actually produce", () => {
    // The refusals above are for states S1 cannot reach; none of them may fire
    // on S1's own output, whatever the observation set.
    const obs = [
      settlement(1, { amount: 196_000, utr: "UTRDUP" }),
      settlement(2, { amount: 196_000, utr: "UTRDUP" }),
      reconLine(3, { settlementId: SETL(1) }),
      reconLine(4, { settlementId: "setl_absent" }),
      adjustment(5, { settlementId: SETL(2) }),
      bankLine(6, { bankRef: "UTRDUP", amount: 196_000 }),
      bankLine(7, { bankRef: "UTRDUP", amount: 196_000 }),
      payment(8),
    ];
    expect(() => seamOf(obs)).not.toThrow();
  });
});
