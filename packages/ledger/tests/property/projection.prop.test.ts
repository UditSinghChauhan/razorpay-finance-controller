import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ACCOUNT_CODES, canonicalJson, type AccountCode } from "@assay/domain";
import { MAX_PAISE, type Paise } from "@assay/money";

import {
  LedgerEventError,
  SOURCE_ENTITY_PREFIXES,
  TrialBalanceError,
  appendEvent,
  createChain,
  computeGenesisHash,
  projectByDecisionState,
  projectLedger,
  type DecisionState,
  type JournalLine,
  type LedgerEvent,
  type LedgerEventDraft,
} from "@assay/ledger";

import { GENESIS_INPUTS, RUN_ID, asEvents, digest, storedCopy } from "./../fixtures.js";

/**
 * The projection's claims are of the form "for every event log", which examples
 * cannot state. Five are load-bearing elsewhere in the system:
 *
 *   - balances are a function of the lines and not of their order, so a close
 *     that re-projects cannot depend on how rows came back from storage;
 *   - the seven balances conserve — `Σ balance === Σ dr − Σ cr` always, and
 *     zero exactly when `I1` holds (`DATA_MODEL.md §17`, gate `G2`);
 *   - projection is deterministic (`EVALUATION_SPEC.md §4.12`, metric 23);
 *   - the covered-set filter partitions rather than drops or double-counts,
 *     which is what makes `proj_agent` (`EVALUATION_SPEC.md §4.4`) trustworthy;
 *   - `I7` is never satisfied by inexact arithmetic.
 */
const SEED = 20260826;
const RUNS = 2_000;

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

const amount = fc.integer({ min: 1, max: 10_000_000_000 });

/**
 * A `source_entity_id` — one of `§16`'s five business families, at the fourteen
 * alphanumerics `§0` rule 3 states for the four Razorpay ones and `§7`'s `bnk_`
 * grammar accepts.
 */
const sourceEntityId = fc
  .tuple(
    fc.constantFrom(...SOURCE_ENTITY_PREFIXES),
    fc.array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      ),
      { minLength: 14, maxLength: 14 },
    ),
  )
  .map(([prefix, suffix]) => `${prefix}${suffix.join("")}`);

/**
 * A balanced posting: one or more legs on one side and a single counter-leg
 * carrying their total. Every posting in `§17.1` and `§17.2` has this shape,
 * and every leg of one posting carries one `source_entity_id` (`§16`, `§17.1.1`).
 */
const balancedLines = (
  value: fc.Arbitrary<number>,
): fc.Arbitrary<readonly JournalLine[]> =>
  fc
    .tuple(
      fc.array(fc.tuple(fc.constantFrom(...ACCOUNT_CODES), value), {
        minLength: 1,
        maxLength: 3,
      }),
      fc.constantFrom(...ACCOUNT_CODES),
      fc.boolean(),
      sourceEntityId,
    )
    .map(([legs, counterAccount, mirrored, entity]) => {
      const total = legs.reduce((acc, [, v]) => acc + v, 0);
      const many = legs.map(([account, v], index): JournalLine => ({
        account,
        dr_paise: (mirrored ? 0 : v) as Paise,
        cr_paise: (mirrored ? v : 0) as Paise,
        memo_ref: `leg${String(index)}`,
        source_entity_id: entity,
      }));
      return [
        ...many,
        {
          account: counterAccount,
          dr_paise: (mirrored ? total : 0) as Paise,
          cr_paise: (mirrored ? 0 : total) as Paise,
          memo_ref: "counter",
          source_entity_id: entity,
        },
      ];
    });

const DECISION_STATES: readonly DecisionState[] = [
  "RECONCILED",
  "ABSTAINED",
  "EXCEPTION",
];

interface Spec {
  readonly lines: readonly JournalLine[];
  readonly state: DecisionState;
  readonly hasDecision: boolean;
}

const spec = (value: fc.Arbitrary<number>): fc.Arbitrary<Spec> =>
  fc.record({
    lines: fc.oneof(balancedLines(value), fc.constant([] as readonly JournalLine[])),
    state: fc.constantFrom(...DECISION_STATES),
    hasDecision: fc.boolean(),
  });

const specs = (value: fc.Arbitrary<number> = amount): fc.Arbitrary<readonly Spec[]> =>
  fc.array(spec(value), { minLength: 0, maxLength: 6 });

function draftOf(one: Spec, index: number): LedgerEventDraft {
  return {
    evt_id: `evt_${String(index).padStart(6, "0")}A`,
    run_id: RUN_ID,
    ts: 1_787_000_000 + index,
    actor: {
      type: "deterministic",
      component: "engine.s5_validate",
      engine_commit: GENESIS_INPUTS.engine_commit,
      llm_provider: null,
      model_id: null,
      prompt_hash: null,
      llm_call_id: null,
    },
    kind: "RECONCILE",
    subject_ids: [],
    evidence_ids: [],
    decision_id: one.hasDecision ? `dec_${String(index).padStart(6, "0")}A` : null,
    inputs_hash: digest(index),
    journal_lines: one.lines,
    certificate: null,
  } as unknown as LedgerEventDraft;
}

function build(list: readonly Spec[]): readonly LedgerEvent[] {
  let chain = createChain(GENESIS, RUN_ID);
  list.forEach((one, index) => {
    chain = appendEvent(chain, draftOf(one, index));
  });
  return chain.events;
}

function stateMap(list: readonly Spec[]): ReadonlyMap<string, DecisionState> {
  const map = new Map<string, DecisionState>();
  list.forEach((one, index) => {
    if (one.hasDecision) {
      map.set(`dec_${String(index).padStart(6, "0")}A`, one.state);
    }
  });
  return map;
}

const sumBalances = (balances: Readonly<Record<AccountCode, Paise>>): number =>
  ACCOUNT_CODES.reduce((acc, code) => acc + balances[code], 0);

// ---------------------------------------------------------------------------

describe("balances do not depend on the order events are read back in", () => {
  it("any permutation of a log projects to the same balances", () => {
    fc.assert(
      fc.property(specs(), fc.nat({ max: 720 }), (list, rotation) => {
        const events = storedCopy(build(list));
        // A rotation is a permutation, and re-`seq`ing keeps each array
        // internally consistent so the seal admits both.
        const offset = list.length === 0 ? 0 : rotation % list.length;
        const rotated = [...events.slice(offset), ...events.slice(0, offset)];

        const a = projectLedger(asEvents(events.map((e, i) => ({ ...e, seq: i }))));
        const b = projectLedger(asEvents(rotated.map((e, i) => ({ ...e, seq: i }))));

        expect({ ...a.balances }).toEqual({ ...b.balances });
        expect(a.totalDrPaise).toBe(b.totalDrPaise);
        expect(a.totalCrPaise).toBe(b.totalCrPaise);
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("the seven balances conserve", () => {
  it("Σ balance === Σ dr − Σ cr, and is zero exactly when I1 holds", () => {
    fc.assert(
      fc.property(specs(), (list) => {
        const projection = projectLedger(build(list));
        expect(sumBalances(projection.balances)).toBe(
          projection.totalDrPaise - projection.totalCrPaise,
        );
        expect(sumBalances(projection.balances) === 0).toBe(
          projection.trialBalanceOk,
        );
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("a chain built by appendEvent always balances", () => {
    // Layer A refuses an append that would break `I1`, so every log it can
    // produce projects to `trialBalanceOk`. This is the property that makes
    // `G2` a check on storage integrity rather than on the engine.
    fc.assert(
      fc.property(specs(), (list) => {
        expect(projectLedger(build(list)).trialBalanceOk).toBe(true);
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("projection is deterministic — metric 23, invariant I9", () => {
  it("two projections of the same events are byte-identical", () => {
    fc.assert(
      fc.property(specs(), (list) => {
        const events = build(list);
        const a = projectLedger(events);
        const b = projectLedger(events);
        expect(canonicalJson({ ...a.balances })).toBe(
          canonicalJson({ ...b.balances }),
        );
        expect(a).toEqual(b);
        // Key order is ACCOUNT_CODES order on every run.
        expect(Object.keys(a.balances)).toEqual([...ACCOUNT_CODES]);
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("the covered-set filter partitions the log", () => {
  it("the three decision states sum back to the events that carry one", () => {
    // Neither dropping nor double-counting: `proj_agent` is only trustworthy if
    // the RECONCILED slice is exactly the part of the log it claims.
    fc.assert(
      fc.property(specs(), (list) => {
        const events = build(list);
        const states = stateMap(list);

        const undecided = projectLedger(
          events.filter((event) => event.decision_id === null),
        );

        const perState = DECISION_STATES.map((state) =>
          projectByDecisionState(events, states, state),
        );

        const whole = projectLedger(events);
        for (const code of ACCOUNT_CODES) {
          const parts =
            undecided.balances[code] +
            perState.reduce((acc, p) => acc + p.balances[code], 0);
          expect(parts).toBe(whole.balances[code]);
        }
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("every filtered slice balances on its own", () => {
    fc.assert(
      fc.property(specs(), (list) => {
        const events = build(list);
        const states = stateMap(list);
        for (const state of DECISION_STATES) {
          expect(projectByDecisionState(events, states, state).trialBalanceOk).toBe(
            true,
          );
        }
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("invariant I7 is never satisfied by inexact arithmetic", () => {
  it("either every total is exact, or the log is refused", () => {
    // Amounts near the top of the range, so a log of two or three events
    // straddles the safe-integer boundary rather than staying safely below it.
    const huge = fc.integer({
      min: Math.floor(MAX_PAISE / 3),
      max: MAX_PAISE,
    });

    fc.assert(
      fc.property(specs(huge), (list) => {
        let projection;
        try {
          projection = projectLedger(build(list));
        } catch (error) {
          // `I7` is refused at two granularities and both count. A single
          // amount outside the safe range never reaches a total at all — the
          // seal rejects it as `LedgerEventError` — while a log whose
          // *cumulative* totals leave the range is a `TrialBalanceError`. The
          // property is that no result is ever returned over inexact
          // arithmetic; which of the two refusals fired is not part of it, and
          // asserting only one of them asserted something this property never
          // claimed. The claim itself is the `expect`s below, unchanged.
          expect(
            error instanceof TrialBalanceError || error instanceof LedgerEventError,
          ).toBe(true);
          return true;
        }
        expect(Number.isSafeInteger(projection.totalDrPaise)).toBe(true);
        expect(Number.isSafeInteger(projection.totalCrPaise)).toBe(true);
        for (const code of ACCOUNT_CODES) {
          expect(Number.isSafeInteger(projection.balances[code])).toBe(true);
        }
        return true;
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("the result cannot be written to", () => {
  it("every projection is frozen, balances included", () => {
    fc.assert(
      fc.property(specs(), (list) => {
        const projection = projectLedger(build(list));
        expect(Object.isFrozen(projection)).toBe(true);
        expect(Object.isFrozen(projection.balances)).toBe(true);
        expect(() => {
          (projection.balances as Record<string, number>)["1200_BANK"] = 1;
        }).toThrow(TypeError);
        return true;
      }),
      { seed: SEED, numRuns: 500 },
    );
  });
});
