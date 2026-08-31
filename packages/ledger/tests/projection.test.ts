/**
 * Layer B's balance projection — `ARCHITECTURE.md §8`, `DATA_MODEL.md §17.1`.
 *
 * The postings used as data below are transcribed from `§17.1`, and their
 * `source_entity_id` values from `§17.1.1`'s own column, so the arithmetic and
 * the item key are both checkable against the specification by eye. Nothing
 * here *selects* a posting: choosing which accounts an event posts to is
 * `journal.ts`, the next milestone, and not implemented.
 */

import { describe, expect, it } from "vitest";

import { ACCOUNT_CODES, SUSPENSE_ACCOUNT, type AccountCode } from "@assay/domain";
import { MAX_PAISE, type Paise } from "@assay/money";

import {
  ChainMismatchError,
  LedgerEventError,
  ProjectionInputError,
  TrialBalanceError,
  appendEvent,
  assertTrialBalance,
  computeGenesisHash,
  createChain,
  projectByDecisionState,
  projectChain,
  projectLedger,
  type DecisionState,
  type LedgerChain,
  type LedgerEvent,
  type LedgerEventDraft,
} from "@assay/ledger";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  PAYMENT_ID,
  REFUND_ID,
  RUN_ID,
  SETTLEMENT_ID,
  asEvents,
  digest,
  id,
  line,
  makeActor,
  makeDraft,
  storedCopy,
} from "./fixtures.js";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

/** A chain holding `drafts`, in order. */
function chainOf(drafts: readonly LedgerEventDraft[]): LedgerChain {
  let chain = createChain(GENESIS, RUN_ID);
  for (const draft of drafts) chain = appendEvent(chain, draft);
  return chain;
}

function eventsOf(drafts: readonly LedgerEventDraft[]): readonly LedgerEvent[] {
  return chainOf(drafts).events;
}

let nextEvent = 0;
/** A draft with a fresh `evt_id`, so a sequence of them is a legal chain. */
function draft(overrides: Partial<LedgerEventDraft> = {}): LedgerEventDraft {
  nextEvent += 1;
  return makeDraft({
    evt_id: id("evt_", nextEvent) as LedgerEventDraft["evt_id"],
    certificate: null,
    ...overrides,
  });
}

/**
 * A hand-built stored record.
 *
 * The chain refuses to *create* an unbalanced or duplicated log, so the only
 * way to project one is to build it the way an attacker with write access to
 * `assay.sqlite` would (`THREAT_MODEL.md §T10`). `hash` and `prev_hash` are
 * well-formed but arbitrary: projection does not verify digests — that is
 * `verifyChain` and gate `G4` — and saying so in a fixture keeps the boundary
 * honest.
 */
function storedEvent(
  seq: number,
  overrides: Partial<LedgerEventDraft> = {},
): Record<string, unknown> {
  return {
    ...draft(overrides),
    seq,
    prev_hash: digest(900 + seq),
    hash: digest(901 + seq),
  } as unknown as Record<string, unknown>;
}

// The postings below carry the `source_entity_id` that `§17.1.1`'s trigger table
// puts in its own column for each: the recon line's `entity_id` for `P1`–`P4`
// ("the recon line itself", §16), the bank line for `P5` and the settlement for
// `P6`. That is test data, not a rule — selecting a posting is `journal.ts`'s
// job and a later milestone. What it buys is that the item key is legible in
// every fixture, and identical on both legs, as `§16` requires.

// `§17.1` P1 — payment captured at the gateway.
const p1 = (amount: number) => [
  line("1100_GATEWAY_RECEIVABLE", amount, 0, "P1.dr", PAYMENT_ID),
  line("4000_REVENUE", 0, amount, "P1.cr", PAYMENT_ID),
];

// `§17.1` P2 — settlement reconciled to a bank credit. `fee` is GST-inclusive.
const p2 = (amount: number, fee: number, tax: number) => [
  line("1200_BANK", amount - fee, 0, "P2.dr", PAYMENT_ID),
  line("5100_PG_FEE_EXPENSE", fee - tax, 0, "P2.dr", PAYMENT_ID),
  line("1300_GST_INPUT_CREDIT", tax, 0, "P2.dr", PAYMENT_ID),
  line("1100_GATEWAY_RECEIVABLE", 0, amount, "P2.cr", PAYMENT_ID),
];

// `§17.1` P3 — refund initiated.
const p3 = (amount: number) => [
  line("4000_REVENUE", amount, 0, "P3.dr", REFUND_ID),
  line("2200_REFUND_LIABILITY", 0, amount, "P3.cr", REFUND_ID),
];

// `§17.1` P4 — refund settled out of the bank.
const p4 = (amount: number) => [
  line("2200_REFUND_LIABILITY", amount, 0, "P4.dr", REFUND_ID),
  line("1200_BANK", 0, amount, "P4.cr", REFUND_ID),
];

// `§17.1` P5 — an inbound item ASSAY declined to attribute (`E03`).
const p5 = (amount: number, key: string = BANK_LINE_ID) => [
  line("1200_BANK", amount, 0, "P5.dr", key),
  line(SUSPENSE_ACCOUNT, 0, amount, "P5.cr", key),
];

// `§17.1` P6 — an outbound settlement with no bank credit (`E04`).
const p6 = (amount: number, key: string = SETTLEMENT_ID) => [
  line(SUSPENSE_ACCOUNT, amount, 0, "P6.dr", key),
  line("1100_GATEWAY_RECEIVABLE", 0, amount, "P6.cr", key),
];

const ZERO_VECTOR: Record<AccountCode, number> = {
  "1100_GATEWAY_RECEIVABLE": 0,
  "1200_BANK": 0,
  "1300_GST_INPUT_CREDIT": 0,
  "2200_REFUND_LIABILITY": 0,
  "4000_REVENUE": 0,
  "5100_PG_FEE_EXPENSE": 0,
  "9000_SUSPENSE_UNRECONCILED": 0,
};

const expectBalances = (
  actual: Readonly<Record<AccountCode, Paise>>,
  expected: Partial<Record<AccountCode, number>>,
): void => {
  expect({ ...actual }).toEqual({ ...ZERO_VECTOR, ...expected });
};

// ---------------------------------------------------------------------------

describe("an empty log projects to zero", () => {
  it("returns a zero balance for all seven accounts", () => {
    const projection = projectLedger([]);
    expectBalances(projection.balances, {});
    expect(projection.totalDrPaise).toBe(0);
    expect(projection.totalCrPaise).toBe(0);
    expect(projection.trialBalanceOk).toBe(true);
    expect(projection.eventCount).toBe(0);
    expect(projection.postingEventCount).toBe(0);
    expect(projection.journalLineCount).toBe(0);
    expect(projection.lastSeq).toBeNull();
    expect(projection.valueSuspensePaise).toBe(0);
  });

  it("an empty chain projects to zero", () => {
    expectBalances(projectChain(createChain(GENESIS, RUN_ID)).balances, {});
  });
});

describe("a single balanced event", () => {
  it("projects P1 — DR receivable, CR revenue", () => {
    const projection = projectLedger(eventsOf([draft({ journal_lines: p1(50_000) })]));

    expectBalances(projection.balances, {
      "1100_GATEWAY_RECEIVABLE": 50_000,
      // §17.1: revenue is a credit-balance account and "carries a negative
      // balance, and that is correct rather than an error to be corrected at
      // render".
      "4000_REVENUE": -50_000,
    });
    expect(projection.totalDrPaise).toBe(50_000);
    expect(projection.totalCrPaise).toBe(50_000);
    expect(projection.trialBalanceOk).toBe(true);
    expect(projection.eventCount).toBe(1);
    expect(projection.postingEventCount).toBe(1);
    expect(projection.journalLineCount).toBe(2);
    expect(projection.lastSeq).toBe(0);
  });

  it("projects P2, whose four legs balance by construction", () => {
    // §17.1: "P2 balances by construction: credit + (fee − tax) + tax =
    // amount − fee + fee = amount." fee is GST-inclusive at 18% on fee_ex_gst.
    const projection = projectLedger(
      eventsOf([draft({ journal_lines: p2(2_100, 50, 8) })]),
    );

    expectBalances(projection.balances, {
      "1200_BANK": 2_050,
      "5100_PG_FEE_EXPENSE": 42,
      "1300_GST_INPUT_CREDIT": 8,
      "1100_GATEWAY_RECEIVABLE": -2_100,
    });
    expect(projection.trialBalanceOk).toBe(true);
  });
});

describe("multiple events and every control account", () => {
  it("accumulates across a mixed log and touches all seven accounts", () => {
    const projection = projectLedger(
      eventsOf([
        draft({ journal_lines: p1(2_100) }),
        draft({ journal_lines: p2(2_100, 50, 8) }),
        draft({ journal_lines: p3(500) }),
        draft({ journal_lines: p4(500) }),
        draft({ journal_lines: p5(45_231_000) }),
        draft({ journal_lines: p6(10_000_000) }),
      ]),
    );

    expectBalances(projection.balances, {
      // P1 +2100, P2 −2100, P6 −10,000,000
      "1100_GATEWAY_RECEIVABLE": -10_000_000,
      // P2 +2050, P4 −500, P5 +45,231,000
      "1200_BANK": 45_232_550,
      "1300_GST_INPUT_CREDIT": 8,
      // P3 −500, P4 +500
      "2200_REFUND_LIABILITY": 0,
      // P1 −2100, P3 +500
      "4000_REVENUE": -1_600,
      "5100_PG_FEE_EXPENSE": 42,
      // P5 −45,231,000, P6 +10,000,000
      "9000_SUSPENSE_UNRECONCILED": -35_231_000,
    });
    expect(projection.trialBalanceOk).toBe(true);
    expect(projection.eventCount).toBe(6);
    expect(projection.postingEventCount).toBe(6);
    expect(projection.journalLineCount).toBe(14);
    expect(projection.lastSeq).toBe(5);

    // Every account is exercised by this log, so the assertion above is a
    // statement about all seven and not only about the ones that moved.
    for (const code of ACCOUNT_CODES) {
      expect(projection.balances[code]).toBeTypeOf("number");
    }
  });

  it("the seven balances sum to zero whenever I1 holds", () => {
    // Σ_acct (Σdr(acct) − Σcr(acct)) === Σdr − Σcr === 0.
    const projection = projectLedger(
      eventsOf([
        draft({ journal_lines: p2(2_100, 50, 8) }),
        draft({ journal_lines: p6(10_000_000) }),
      ]),
    );
    const total = ACCOUNT_CODES.reduce(
      (acc, code) => acc + projection.balances[code],
      0,
    );
    expect(total).toBe(0);
  });
});

describe("the debit-positive convention — DATA_MODEL.md §17.1", () => {
  it("an abstained inbound credit leaves 1200_BANK positive, matching truth", () => {
    // §17.1 states this case as the reason the convention is Σdr − Σcr: "an
    // abstained ₹1,00,000 bank credit leaves 1200_BANK at +₹1,00,000, matching
    // truth, and harm on that account is zero. Under the inverted posting it
    // would read −₹1,00,000 against a truth of +₹1,00,000".
    const projection = projectLedger(
      eventsOf([draft({ journal_lines: p5(10_000_000) })]),
    );
    expect(projection.balances["1200_BANK"]).toBe(10_000_000);
    expect(projection.balances[SUSPENSE_ACCOUNT]).toBe(-10_000_000);
  });

  it("liability and revenue accounts carry negative balances", () => {
    const projection = projectLedger(
      eventsOf([draft({ journal_lines: p1(70_000) }), draft({ journal_lines: p3(9_000) })]),
    );
    expect(projection.balances["4000_REVENUE"]).toBe(-61_000);
    expect(projection.balances["2200_REFUND_LIABILITY"]).toBe(-9_000);
  });

  it("the worked example of RECONCILIATION_SPEC.md §11 projects as stated", () => {
    // "DR 9000_SUSPENSE_UNRECONCILED ₹1,00,000 / CR 1100_GATEWAY_RECEIVABLE
    // ₹1,00,000. item_net_paise for this item is +10,000,000."
    const projection = projectLedger(
      eventsOf([draft({ kind: "ABSTAIN", journal_lines: p6(10_000_000) })]),
    );
    expect(projection.balances[SUSPENSE_ACCOUNT]).toBe(10_000_000);
    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(-10_000_000);
  });
});

describe("the trial balance is recomputed from the log", () => {
  it("holds on a well-formed chain", () => {
    const projection = projectLedger(eventsOf([draft({ journal_lines: p1(1) })]));
    expect(projection.trialBalanceOk).toBe(true);
    expect(() => {
      assertTrialBalance(projection);
    }).not.toThrow();
  });

  it("reports an imbalance rather than throwing", () => {
    // CloseGateResult.g2_trial_balance is a boolean an analyst is shown
    // (DATA_MODEL.md §20), so the reporting path must not raise.
    const tampered = [
      storedEvent(0, { journal_lines: [line("1200_BANK", 500, 0, "dr")] }),
    ];
    const projection = projectLedger(asEvents(tampered));

    expect(projection.trialBalanceOk).toBe(false);
    expect(projection.totalDrPaise).toBe(500);
    expect(projection.totalCrPaise).toBe(0);
    expect(projection.balances["1200_BANK"]).toBe(500);
  });

  it("assertTrialBalance raises TrialBalanceError on that same projection", () => {
    const tampered = [
      storedEvent(4, { journal_lines: [line("1200_BANK", 500, 0, "dr")] }),
    ];
    const projection = projectLedger(asEvents(tampered));

    expect(() => {
      assertTrialBalance(projection);
    }).toThrow(TrialBalanceError);
    try {
      assertTrialBalance(projection);
    } catch (error) {
      // Layer A's meaning of `seq`: the point in the log at which the
      // cumulative imbalance stands.
      expect((error as TrialBalanceError).seq).toBe(4);
      expect((error as TrialBalanceError).total_dr_paise).toBe(500);
      expect((error as TrialBalanceError).total_cr_paise).toBe(0);
    }
  });

  it("an imbalance that cancels later still reports the true final totals", () => {
    const tampered = [
      storedEvent(0, { journal_lines: [line("1200_BANK", 500, 0, "dr")] }),
      storedEvent(1, { journal_lines: [line(SUSPENSE_ACCOUNT, 0, 500, "cr")] }),
    ];
    const projection = projectLedger(asEvents(tampered));
    expect(projection.trialBalanceOk).toBe(true);
    expect(projection.balances["1200_BANK"]).toBe(500);
    expect(projection.balances[SUSPENSE_ACCOUNT]).toBe(-500);
  });
});

describe("the safe-integer boundary — invariant I7", () => {
  it("accepts totals at exactly MAX_PAISE", () => {
    const projection = projectLedger(
      eventsOf([draft({ journal_lines: p5(MAX_PAISE) })]),
    );
    expect(projection.totalDrPaise).toBe(MAX_PAISE);
    expect(projection.balances["1200_BANK"]).toBe(MAX_PAISE);
    expect(projection.trialBalanceOk).toBe(true);
  });

  it("refuses a single amount of exactly 2^53, one past MAX_PAISE", () => {
    // `I7` refused at the individual-amount granularity: the seal rejects it
    // before any total exists. Distinct from the cumulative case below, and
    // the two must stay distinguishable.
    const record = storedEvent(0, { journal_lines: p5(MAX_PAISE) });
    (record["journal_lines"] as Record<string, unknown>[])[0]!["dr_paise"] =
      MAX_PAISE + 1;
    expect(() => projectLedger(asEvents([record]))).toThrow(LedgerEventError);
  });

  it("refuses a log whose running totals leave the safe range", () => {
    // Two maximal events. Each is individually valid and balanced; their sum is
    // not representable, so `Σdr === Σcr` would be an artefact of inexact
    // arithmetic rather than a fact about the ledger.
    const overflowing = [
      storedEvent(0, { journal_lines: p5(MAX_PAISE) }),
      storedEvent(1, { journal_lines: p5(MAX_PAISE) }),
    ];
    expect(() => projectLedger(asEvents(overflowing))).toThrow(TrialBalanceError);
  });

  it("does not report equality on totals that both lost precision", () => {
    const overflowing = [
      storedEvent(0, { journal_lines: p5(MAX_PAISE) }),
      storedEvent(1, { journal_lines: p5(MAX_PAISE) }),
    ];
    // The naive check `totalDr === totalCr` is TRUE here — both are
    // 18014398509481982 — which is exactly why exactness is tested first.
    expect(MAX_PAISE * 2 === MAX_PAISE * 2).toBe(true);
    expect(Number.isSafeInteger(MAX_PAISE * 2)).toBe(false);
    expect(() => projectLedger(asEvents(overflowing))).toThrow(TrialBalanceError);
  });
});

describe("order independence and determinism", () => {
  const drafts = [
    draft({ journal_lines: p1(2_100) }),
    draft({ journal_lines: p2(2_100, 50, 8) }),
    draft({ journal_lines: p5(45_231_000) }),
    draft({ journal_lines: p6(10_000_000) }),
  ];

  it("the same events in a different order give the same balances", () => {
    const forward = storedCopy(eventsOf(drafts));
    const reversed = [...forward].reverse();

    // Re-`seq`ed so both arrays are internally consistent; balances are a sum
    // and addition commutes, which is the property under test.
    const a = projectLedger(asEvents(forward.map((e, i) => ({ ...e, seq: i }))));
    const b = projectLedger(asEvents(reversed.map((e, i) => ({ ...e, seq: i }))));

    expect({ ...a.balances }).toEqual({ ...b.balances });
    expect(a.totalDrPaise).toBe(b.totalDrPaise);
    expect(a.totalCrPaise).toBe(b.totalCrPaise);
  });

  it("repeated projection over identical events is identical", () => {
    const events = eventsOf(drafts);
    expect(projectLedger(events)).toEqual(projectLedger(events));
  });

  it("the key order of the balance vector is ACCOUNT_CODES order", () => {
    const projection = projectLedger(eventsOf(drafts));
    expect(Object.keys(projection.balances)).toEqual([...ACCOUNT_CODES]);
  });
});

describe("the covered-set projection — EVALUATION_SPEC.md §4.4", () => {
  const decisionA = id("dec_", 1) as LedgerEventDraft["decision_id"];
  const decisionB = id("dec_", 2) as LedgerEventDraft["decision_id"];
  const decisionC = id("dec_", 3) as LedgerEventDraft["decision_id"];

  const mixed = () =>
    eventsOf([
      draft({ kind: "RECONCILE", decision_id: decisionA, journal_lines: p1(2_100) }),
      draft({ kind: "ABSTAIN", decision_id: decisionB, journal_lines: p5(45_231_000) }),
      draft({
        kind: "EXCEPTION",
        decision_id: decisionC,
        journal_lines: p6(10_000_000),
      }),
    ]);

  const states: ReadonlyMap<string, DecisionState> = new Map([
    [decisionA as string, "RECONCILED" as DecisionState],
    [decisionB as string, "ABSTAINED" as DecisionState],
    [decisionC as string, "EXCEPTION" as DecisionState],
  ]);

  it("projects only lines whose owning decision is RECONCILED", () => {
    const projection = projectByDecisionState(mixed(), states);
    expectBalances(projection.balances, {
      "1100_GATEWAY_RECEIVABLE": 2_100,
      "4000_REVENUE": -2_100,
    });
    expect(projection.eventCount).toBe(1);
    expect(projection.postingEventCount).toBe(1);
    expect(projection.journalLineCount).toBe(2);
  });

  it("Suspense is untouched by the covered set, which is why §4.4 excludes it", () => {
    const projection = projectByDecisionState(mixed(), states);
    expect(projection.valueSuspensePaise).toBe(0);
  });

  it("a filtered projection still balances", () => {
    // Layer A checks I1 after *every* append, so each event balances on its
    // own by induction, and therefore so does any subset of events.
    expect(projectByDecisionState(mixed(), states).trialBalanceOk).toBe(true);
  });

  it("no matching decisions projects to zero", () => {
    const noneReconciled: ReadonlyMap<string, DecisionState> = new Map([
      [decisionA as string, "ABSTAINED" as DecisionState],
      [decisionB as string, "ABSTAINED" as DecisionState],
      [decisionC as string, "EXCEPTION" as DecisionState],
    ]);
    const projection = projectByDecisionState(mixed(), noneReconciled);
    expectBalances(projection.balances, {});
    expect(projection.eventCount).toBe(0);
    expect(projection.trialBalanceOk).toBe(true);
  });

  it("another target state can be selected", () => {
    const projection = projectByDecisionState(mixed(), states, "ABSTAINED");
    expectBalances(projection.balances, {
      "1200_BANK": 45_231_000,
      "9000_SUSPENSE_UNRECONCILED": -45_231_000,
    });
  });

  it("an event with no owning decision is not covered", () => {
    const events = eventsOf([
      draft({ kind: "INGEST", decision_id: null, journal_lines: p1(2_100) }),
    ]);
    const projection = projectByDecisionState(events, new Map());
    expectBalances(projection.balances, {});
    expect(projection.eventCount).toBe(0);
  });

  it("a posting event whose decision is unmapped is refused, not dropped", () => {
    expect(() => projectByDecisionState(mixed(), new Map())).toThrow(
      ProjectionInputError,
    );
    expect(() => projectByDecisionState(mixed(), new Map())).toThrow(
      /balance_harm_inr/,
    );
  });

  it("a non-posting event whose decision is unmapped is simply not covered", () => {
    const events = eventsOf([
      draft({ kind: "PROBE", decision_id: decisionA, journal_lines: [] }),
    ]);
    const projection = projectByDecisionState(events, new Map());
    expectBalances(projection.balances, {});
    expect(projection.eventCount).toBe(0);
  });

  it("mutating the decision map afterwards cannot change a returned result", () => {
    const mutable = new Map<string, DecisionState>([
      [decisionA as string, "RECONCILED"],
      [decisionB as string, "ABSTAINED"],
      [decisionC as string, "EXCEPTION"],
    ]);
    const events = mixed();
    const before = projectByDecisionState(events, mutable);

    mutable.set(decisionB as string, "RECONCILED");
    mutable.delete(decisionA as string);

    expect({ ...before.balances }).toEqual({
      ...ZERO_VECTOR,
      "1100_GATEWAY_RECEIVABLE": 2_100,
      "4000_REVENUE": -2_100,
    });
  });
});

describe("net Suspense — DATA_MODEL.md §20, and what it is not", () => {
  it("equals the projected Suspense balance", () => {
    const projection = projectLedger(
      eventsOf([draft({ journal_lines: p5(45_231_000) })]),
    );
    expect(projection.valueSuspensePaise).toBe(projection.balances[SUSPENSE_ACCOUNT]);
    expect(projection.valueSuspensePaise).toBe(-45_231_000);
  });

  it("is NET, and two opposite items cancel — which is why it is not gate G3", () => {
    // §20: the net and gross figures "are equal only when every open Suspense
    // item lies on the same side, which a run containing both E03 and E04 does
    // not satisfy". Here they cancel exactly: the net is 0 while two items are
    // open for ₹1,00,000 each. G3's gross form is deliberately not computed —
    // the specification defines no agent-side per-item partition key.
    const projection = projectLedger(
      eventsOf([
        draft({ journal_lines: p5(10_000_000) }),
        draft({ journal_lines: p6(10_000_000) }),
      ]),
    );
    expect(projection.valueSuspensePaise).toBe(0);
    expect(projection.trialBalanceOk).toBe(true);
  });

  it("the projection exposes no gross per-item figure", () => {
    const projection = projectLedger(eventsOf([draft({ journal_lines: p5(1) })]));
    expect(Object.keys(projection).sort()).toEqual([
      "balances",
      "eventCount",
      "journalLineCount",
      "lastSeq",
      "postingEventCount",
      "totalCrPaise",
      "totalDrPaise",
      "trialBalanceOk",
      "valueSuspensePaise",
    ]);
  });
});

describe("cached totals are never authoritative — ARCHITECTURE.md §8, T10", () => {
  it("projectChain ignores a tampered total_dr_paise / total_cr_paise", () => {
    const real = chainOf([draft({ journal_lines: p5(45_231_000) })]);
    const tampered = {
      ...real,
      total_dr_paise: 999_999_999 as Paise,
      total_cr_paise: 999_999_999 as Paise,
    } as LedgerChain;

    const projection = projectChain(tampered);
    // "An edited balance without a corresponding event simply disappears on the
    // next projection."
    expect(projection.totalDrPaise).toBe(45_231_000);
    expect(projection.totalCrPaise).toBe(45_231_000);
    expect(projection.balances["1200_BANK"]).toBe(45_231_000);
  });

  it("projectChain agrees with projectLedger over the chain's events", () => {
    const chain = chainOf([
      draft({ journal_lines: p1(2_100) }),
      draft({ journal_lines: p6(10_000_000) }),
    ]);
    expect(projectChain(chain)).toEqual(projectLedger(chain.events));
  });
});

describe("immutability", () => {
  it("the returned balance vector cannot be written to", () => {
    const projection = projectLedger(eventsOf([draft({ journal_lines: p1(2_100) })]));
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.balances)).toBe(true);
    expect(() => {
      (projection.balances as Record<string, number>)["1200_BANK"] = 1;
    }).toThrow(TypeError);
    expect(() => {
      (projection as unknown as Record<string, unknown>)["trialBalanceOk"] = false;
    }).toThrow(TypeError);
  });

  it("a new account code cannot be grafted onto the result", () => {
    const projection = projectLedger([]);
    expect(() => {
      (projection.balances as Record<string, number>)["8000_INVENTED"] = 1;
    }).toThrow(TypeError);
    expect(Object.keys(projection.balances)).toHaveLength(7);
  });

  it("projection does not mutate the events it was given", () => {
    const events = eventsOf([draft({ journal_lines: p2(2_100, 50, 8) })]);
    const before = structuredClone(events) as unknown;
    projectLedger(events);
    expect(structuredClone(events) as unknown).toEqual(before);
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(Object.isFrozen(events[0]?.journal_lines)).toBe(true);
  });

  it("mutating the caller's array after projection cannot change the result", () => {
    const records = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const projection = projectLedger(asEvents(records));

    const first = records[0];
    if (first !== undefined) {
      (first["journal_lines"] as Record<string, unknown>[])[0]!["dr_paise"] = 999;
    }
    records.push(storedEvent(1, { journal_lines: p1(1_000) }));

    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(2_100);
    expect(projection.eventCount).toBe(1);
  });
});

describe("a stored event is untrusted, whatever its declared type", () => {
  const project = (record: Record<string, unknown>) => () =>
    projectLedger(asEvents([record]));

  it("rejects a fractional amount", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    (record["journal_lines"] as Record<string, unknown>[])[0]!["dr_paise"] = 12.5;
    expect(project(record)).toThrow(LedgerEventError);
  });

  it("rejects a negative debit", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    (record["journal_lines"] as Record<string, unknown>[])[0]!["dr_paise"] = -1;
    expect(project(record)).toThrow(LedgerEventError);
  });

  it("rejects a line with both sides non-zero", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    (record["journal_lines"] as Record<string, unknown>[])[0]!["cr_paise"] = 5;
    expect(project(record)).toThrow(/exactly one of dr_paise \/ cr_paise/);
  });

  it("rejects a line with both sides zero", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    const first = (record["journal_lines"] as Record<string, unknown>[])[0]!;
    first["dr_paise"] = 0;
    first["cr_paise"] = 0;
    expect(project(record)).toThrow(LedgerEventError);
  });

  it("rejects an eighth account code", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    (record["journal_lines"] as Record<string, unknown>[])[0]!["account"] =
      "8000_INVENTED";
    expect(project(record)).toThrow(/seven control accounts/);
  });

  it("rejects an unknown field on a stored event", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    record["balance_override"] = 500;
    expect(project(record)).toThrow(/unknown field/);
  });

  it("rejects a record missing its chain position", () => {
    const record = storedEvent(0, { journal_lines: p1(2_100) });
    delete record["hash"];
    expect(project(record)).toThrow(LedgerEventError);
  });

  it("rejects a RECONCILE event that claims a model decided it", () => {
    const record = storedEvent(0, {
      kind: "RECONCILE",
      journal_lines: p1(2_100),
      actor: makeActor({ type: "llm", llm_provider: "anthropic", model_id: "x" }),
    });
    expect(project(record)).toThrow(/deterministic by construction/);
  });
});

describe("corruption a trial balance cannot see", () => {
  it("refuses a duplicated event, which balances but doubles every account", () => {
    const events = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const duplicated = [events[0]!, { ...events[0]! }];

    // The duplicate is perfectly balanced, so I1 alone would pass it.
    expect(() => projectLedger(asEvents(duplicated))).toThrow(ChainMismatchError);
    expect(() => projectLedger(asEvents(duplicated))).toThrow(/more than once/);
  });

  it("refuses events belonging to two runs", () => {
    const a = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const b = storedEvent(1, { journal_lines: p1(500) });
    b["run_id"] = "run_20260827T000000Z";

    expect(() => projectLedger(asEvents([a[0]!, b]))).toThrow(ChainMismatchError);
    expect(() => projectLedger(asEvents([a[0]!, b]))).toThrow(/gapless per run/);
  });

  it("a modified amount that is still well formed projects as written", () => {
    // Stated as a limit, not a defect: content tampering is gate G4's job
    // (`verifyChain`), and duplicating that check here would make the boundary
    // between the two layers a matter of opinion.
    const records = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const lines = records[0]!["journal_lines"] as Record<string, unknown>[];
    lines[0]!["dr_paise"] = 9_999;
    lines[1]!["cr_paise"] = 9_999;

    const projection = projectLedger(asEvents(records));
    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(9_999);
    expect(projection.trialBalanceOk).toBe(true);
  });

  it("a swapped debit/credit side is projected, and inverts the balance", () => {
    const records = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const lines = records[0]!["journal_lines"] as Record<string, unknown>[];
    lines[0]!["dr_paise"] = 0;
    lines[0]!["cr_paise"] = 2_100;
    lines[1]!["cr_paise"] = 0;
    lines[1]!["dr_paise"] = 2_100;

    const projection = projectLedger(asEvents(records));
    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(-2_100);
    expect(projection.balances["4000_REVENUE"]).toBe(2_100);
    // Still balanced — which is precisely why G4 exists and G2 is not enough.
    expect(projection.trialBalanceOk).toBe(true);
  });
});

describe("regressions", () => {
  it("a length that changes mid-traversal cannot change the balance", () => {
    // Found in adversarial review. `events` is `readonly LedgerEvent[]` to the
    // type system and an arbitrary object at runtime; re-reading `.length` on
    // every iteration let a growing exotic extend the traversal, so the balance
    // would have depended on something outside the log. The length is now read
    // once.
    const real = storedCopy(eventsOf([draft({ journal_lines: p1(2_100) })]));
    const extra = storedEvent(1, { journal_lines: p1(1_000_000) });

    let reads = 0;
    const growing = new Proxy(real, {
      get(target, key, receiver): unknown {
        if (key === "length") {
          reads += 1;
          return reads > 1 ? 2 : 1;
        }
        if (key === "1") return extra;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });

    const projection = projectLedger(asEvents(growing as unknown as LedgerEvent[]));
    expect(projection.eventCount).toBe(1);
    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(2_100);
  });

  it("a decision looked up twice cannot land in two states", () => {
    // Found in adversarial review. The state was read from the caller's map
    // once per event, so a lookup answering differently on a second call put
    // one decision in two states and broke the partition `proj_agent` rests
    // on. Each decision is now resolved at most once per projection.
    const shared = id("dec_", 77) as LedgerEventDraft["decision_id"];
    const events = eventsOf([
      draft({ kind: "RECONCILE", decision_id: shared, journal_lines: p1(2_100) }),
      draft({ kind: "RECONCILE", decision_id: shared, journal_lines: p1(3_000) }),
    ]);

    let calls = 0;
    const flipping: ReadonlyMap<string, DecisionState> = {
      get(): DecisionState {
        calls += 1;
        return calls === 1 ? "RECONCILED" : "ABSTAINED";
      },
    } as unknown as ReadonlyMap<string, DecisionState>;

    const projection = projectByDecisionState(events, flipping);
    // Both events share one decision, so both are covered or neither is.
    expect(projection.eventCount).toBe(2);
    expect(projection.balances["1100_GATEWAY_RECEIVABLE"]).toBe(5_100);
    expect(calls).toBe(1);
  });
});

describe("non-posting events", () => {
  it("are counted but move nothing", () => {
    const projection = projectLedger(
      eventsOf([
        draft({ kind: "INGEST", journal_lines: [], decision_id: null }),
        draft({ kind: "ANCHOR", journal_lines: [], decision_id: null }),
        draft({ journal_lines: p1(2_100) }),
      ]),
    );
    expect(projection.eventCount).toBe(3);
    expect(projection.postingEventCount).toBe(1);
    expect(projection.journalLineCount).toBe(2);
    expectBalances(projection.balances, {
      "1100_GATEWAY_RECEIVABLE": 2_100,
      "4000_REVENUE": -2_100,
    });
  });

  it("a log of nothing but non-posting events balances at zero", () => {
    const projection = projectLedger(
      eventsOf([
        draft({ kind: "INGEST", journal_lines: [], decision_id: null }),
        draft({ kind: "CLOSE", journal_lines: [], decision_id: null }),
      ]),
    );
    expectBalances(projection.balances, {});
    expect(projection.trialBalanceOk).toBe(true);
    expect(projection.lastSeq).toBe(1);
  });
});

describe("the package's public surface is exactly T0-6's", () => {
  // The boundary this suite guards moved when journal.ts landed, again at spec
  // 1.4.9 when `ValidatedDecision` was DECLARED here without its write path,
  // and again now that Phase 2 landed `write.ts`, `close-gate.ts` and
  // `close.ts` and wired them through this barrel. Two clauses below asserted
  // ABSENCE while those modules were unwritten; §C's T0-6 — "Layer A hash chain
  // + Layer B double-entry projection + close gate G1-G5" — now makes them
  // present, so each is restated as the bound that actually governs a package
  // that HAS them. Neither is dropped and neither is loosened: "no mutating
  // write path" becomes "EXACTLY ONE, and it is named", which is what
  // DECISION_BRIEF.md §L.1 rule 4 says, and it fails on a second one where the
  // old form could only fail on the first.
  it("exposes the close gate and the close attempt, and no third close path", async () => {
    // §C T0-6 puts G1-G5 in this package, and RECONCILIATION_SPEC.md §10.4
    // sequences them into one attempt. `attemptClose` is the only producer of a
    // `CloseReport`, and it runs the gate first and unconditionally (§10.2), so
    // a second close entry point is the way that guarantee would be lost.
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    const close = Object.keys(ledger)
      .filter((name) => /close/i.test(name))
      .sort();

    expect(close).toEqual([
      "CLOSE_GATE_FINDING_CODES",
      "CLOSE_GATE_IDS",
      "attemptClose",
      "closeGate",
    ]);
  });

  it("exports no close-report builder that could bypass the gate", async () => {
    // DATA_MODEL.md §20: a close report's "existence is a positive assertion
    // that all five gates passed". A builder reachable without `attemptClose`
    // would make it an assertion about nothing.
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    for (const name of Object.keys(ledger)) {
      expect(name).not.toMatch(/^(make|build|create|emit)Close/i);
      expect(name).not.toMatch(/closeReport/i);
    }
  });

  it("exports ValidatedDecision as a TYPE only — no runtime value, no constructor", async () => {
    // ARCHITECTURE.md §4 boundary 3: ledger "exports no constructor". A type-only
    // export leaves nothing on the runtime namespace, so the check is that the
    // name is absent from the module object even though `import type` compiles.
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    expect(Object.keys(ledger)).not.toContain("ValidatedDecision");
    for (const name of Object.keys(ledger)) {
      // Nothing that would let a caller mint one either. The verbs are the
      // assertion: through Phase 1 this read `/validatedDecision/i`, which was
      // exact while NO export named the type at all, and became wrong the
      // moment `postValidatedDecision` landed — a function that CONSUMES a
      // `ValidatedDecision` and cannot produce one, since the brand is a
      // non-exported unique symbol and the single widening lives in
      // `packages/engine/src/s5-validate.ts`. Naming the constructor verbs
      // keeps what the clause was guarding — no runtime construction surface —
      // and still fails on the helper it was written to catch.
      expect(name).not.toMatch(/^(mint|make|create|new|build|as)ValidatedDecision/i);
    }
  });

  it("exposes EXACTLY ONE mutating write path, and it is postValidatedDecision", async () => {
    // ARCHITECTURE.md §4 boundary 3: "packages/ledger exposes exactly one
    // mutating function, and it accepts only a ValidatedDecision ... There is
    // no other write path." The count is the assertion. `openWriteState` is
    // excluded by the ^ anchor rather than by an exception: it builds the value
    // the write threads and mutates nothing.
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    const mutators = Object.keys(ledger)
      .filter((name) => /^(write|persist|save|commit|post)[A-Z]/.test(name))
      .sort();

    expect(mutators).toEqual(["postValidatedDecision"]);
  });

  it("routes persistence through an injected port and opens nothing itself", async () => {
    // ARCHITECTURE.md §3 gives apps/cli all filesystem I/O, and §8's
    // better-sqlite3 is in no manifest here. `LedgerStore` is a TYPE, so it
    // leaves nothing on the runtime namespace: there is no adapter to import.
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    expect(Object.keys(ledger)).not.toContain("LedgerStore");
    expect(Object.keys(ledger)).not.toContain("LedgerCommit");
  });

  it("projection.ts, journal.ts, close-gate.ts and close.ts all exist", async () => {
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    expect(existsSync(`${src}projection.ts`)).toBe(true);
    expect(existsSync(`${src}journal.ts`)).toBe(true);
    // `close-gate.ts` needs `unresolved_value_paise` from the `Decision` /
    // `Exception` records, and `RECONCILIATION_SPEC.md §10.1` is explicit that
    // "the two sides are drawn from two stores, which is the point". The file
    // now exists, and the invariant this test guarded still holds: this
    // package holds one store (the event log) and `CloseGateInput` takes the
    // queue's `unresolved_items` as the CALLER's argument rather than reading
    // a second store of its own. A stub reading both from a single internal
    // store would have been the claim otherwise; `close-gate.ts` and
    // `close.ts` are not that.
    expect(existsSync(`${src}close-gate.ts`)).toBe(true);
    expect(existsSync(`${src}close.ts`)).toBe(true);
  });

  it("projection.ts does not import the posting rules", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      fileURLToPath(new URL("../src/projection.ts", import.meta.url)),
      "utf8",
    );
    // `ARCHITECTURE.md §8`: Layer B's projection is "a **pure projection** over
    // Layer A". It reads the `journal_lines` an event already carries and never
    // decides what they should have been, so it has no business importing the
    // module that does decide.
    expect(source).not.toMatch(/from "\.\/journal\.js"/);
  });
});
