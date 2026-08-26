/**
 * Adversarial input to `journalFor`.
 *
 * The threat this file is written against is `THREAT_MODEL.md §T8`: "Cause a
 * discrepancy to disappear rather than be flagged. In most systems this is the
 * *easiest* attack, because dropped records are invisible." A posting function
 * that could be talked into returning the wrong lines, no lines, or lines that
 * differ from the ones it validated is the first step of that attack, so every
 * case below asks whether a hostile or merely malformed request can get past
 * the boundary rather than whether a well-formed one is handled.
 *
 * `DATA_MODEL.md §0` rule 1 and `DECISION_BRIEF.md §L.1` rule 1 are also on
 * trial here: "No floating point anywhere, including intermediates."
 */

import { describe, expect, it } from "vitest";

import {
  JournalError,
  journalFor,
  type ExceptionClass,
  type JournalDecision,
  type Posting,
  type PostingRequest,
} from "@assay/ledger";

import { entityId } from "./fixtures.js";
import {
  BANK_EVIDENCE,
  CARD_LINE,
  SETL_ID,
  adjustmentObservation,
  bankLineObservation,
  paymentObservation,
  refundObservation,
  settlementObservation,
} from "./journal-fixtures.js";

function posted(decision: JournalDecision): Posting {
  if (!decision.posts) throw new Error(`expected a posting, got ${decision.ground}`);
  return decision;
}

const exception = (
  observation: ReturnType<typeof paymentObservation>,
  cls: ExceptionClass,
): PostingRequest => ({
  occasion: "TERMINAL_STATE",
  observation,
  ingest_valid: true,
  state: "EXCEPTION",
  exception_class: cls,
  abstention_role: null,
});

const P1: PostingRequest = {
  occasion: "INGEST",
  observation: paymentObservation(),
  ingest_valid: true,
};

// ---------------------------------------------------------------------------
// Malformed requests
// ---------------------------------------------------------------------------

describe("a request that is not a request", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
    ["a string", "INGEST"],
    ["an array", []],
    ["a class instance", new Date()],
    ["an object with a null prototype", Object.create(null)],
  ])("refuses %s", (_label, value) => {
    expect(() => journalFor(value as unknown as PostingRequest)).toThrow(TypeError);
  });

  it("refuses an unknown occasion", () => {
    expect(() =>
      journalFor({ occasion: "SETTLE", observation: {}, ingest_valid: true } as never),
    ).toThrow(/expected one of INGEST/);
  });

  it("refuses an unknown field on the request", () => {
    // ARCHITECTURE.md §4: strict parsing, because "stripping would let a field
    // ASSAY does not model travel silently beside one it does".
    expect(() => journalFor({ ...P1, override_amount: 1 } as never)).toThrow(
      /unknown field/,
    );
  });

  it("refuses a field belonging to another occasion", () => {
    expect(() => journalFor({ ...P1, bank_evidence: BANK_EVIDENCE } as never)).toThrow(
      /unknown field/,
    );
    expect(() =>
      journalFor({ ...P1, state: "RECONCILED", exception_class: null } as never),
    ).toThrow(/unknown field/);
  });

  it.each(["observation", "ingest_valid"])("refuses a missing %s", (field) => {
    const partial: Record<string, unknown> = { ...P1 };
    delete partial[field];
    expect(() => journalFor(partial as unknown as PostingRequest)).toThrow(TypeError);
  });

  it("refuses a non-boolean ingest_valid", () => {
    // A truthy string would silently pass a `!request.ingest_valid` guard.
    expect(() => journalFor({ ...P1, ingest_valid: "true" } as never)).toThrow(
      /expected a boolean/,
    );
    expect(() => journalFor({ ...P1, ingest_valid: 1 } as never)).toThrow(
      /expected a boolean/,
    );
  });
});

describe("a request whose observation is not one", () => {
  it("refuses an unknown field on the payload", () => {
    const observation = paymentObservation();
    expect(() =>
      journalFor({
        ...P1,
        observation: {
          ...observation,
          payload: { ...observation.payload, shadow_amount: 1 },
        } as never,
      }),
    ).toThrow(/not a valid Observation/);
  });

  it("refuses a mismatched (kind, source_system) pair", () => {
    // §10: "Ingest rejects any observation whose (kind, source_system, payload)
    // triple is not a row below."
    expect(() =>
      journalFor({
        ...P1,
        observation: {
          ...paymentObservation(),
          source_system: "bank_statement",
        } as never,
      }),
    ).toThrow(/not a valid Observation/);
  });

  it.each([
    ["a bare token", "x"],
    ["an ASSAY-internal handle", "obs_000001A"],
    ["a wrong family", entityId("rfnd_", 1)],
    ["a truncated suffix", "pay_0001"],
  ])("refuses %s as a payment recon line's entity_id", (_label, value) => {
    // §6 states the domain — `pay_… | rfnd_… | adj_…` — and §10's table binds
    // each row type to one. The value becomes JournalLine.source_entity_id, so
    // the narrow rule is enforced where it is consumed.
    expect(() =>
      journalFor({ ...P1, observation: paymentObservation({ entity_id: value }) }),
    ).toThrow(JournalError);
  });

  it("refuses an adjustment row carrying a pay_ identifier", () => {
    expect(() =>
      journalFor(
        exception(
          adjustmentObservation({ entity_id: entityId("pay_", 1) }),
          "E12_ADJUSTMENT_UNEXPLAINED",
        ),
      ),
    ).toThrow(/carries a adj_… identifier/);
  });

  it("refuses an unknown gl_account on a merchant ledger entry", () => {
    // Reaches the schema, not this module: a gl_account outside the seven
    // control accounts is not an observation at all.
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: {
          obs_id: "obs_000006A",
          source_file: "erp.json",
          source_line: 6,
          ingest_hash: "a".repeat(64),
          ingested_at: 1_787_000_000,
          kind: "ledger_entry",
          source_system: "merchant_ledger",
          payload: {
            ledger_entry_id: `mle_${"1".repeat(14)}`,
            booked_at: 1_787_000_000,
            order_ref: "INV-1",
            invoice_no: null,
            gross_paise: 1,
            expected_net_paise: null,
            gl_account: "9999_PROFIT",
          },
        } as never,
        ingest_valid: true,
        state: "EXCEPTION",
        exception_class: "E13_LEDGER_ONLY",
        abstention_role: null,
      }),
    ).toThrow(/not a valid Observation/);
  });
});

describe("contradictory decision information", () => {
  it("refuses an EXCEPTION with no class", () => {
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "EXCEPTION",
        exception_class: null,
        abstention_role: null,
      }),
    ).toThrow(/non-null exactly when state === "EXCEPTION"/);
  });

  it("refuses a class carried on a RECONCILED observation", () => {
    // Otherwise a caller could select a Suspense posting for something it had
    // just declared reconciled.
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "RECONCILED",
        exception_class: "E04_SETTLEMENT_NOT_IN_BANK",
        abstention_role: null,
      }),
    ).toThrow(/non-null exactly when state === "EXCEPTION"/);
  });

  it("refuses an ABSTAINED with no role, and a role on a non-abstention", () => {
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "ABSTAINED",
        exception_class: null,
        abstention_role: null,
      }),
    ).toThrow(/non-null exactly when state === "ABSTAINED"/);
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "RECONCILED",
        exception_class: null,
        abstention_role: "TARGET",
      }),
    ).toThrow(/non-null exactly when state === "ABSTAINED"/);
  });

  it("refuses an unknown exception class and an unknown state", () => {
    expect(() =>
      journalFor({ ...exception(settlementObservation(), "E15_NEW" as never) }),
    ).toThrow(/expected one of E01_MISSING_CAPTURE/);
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "PARTIAL" as never,
        exception_class: null,
        abstention_role: null,
      }),
    ).toThrow(/expected one of RECONCILED/);
  });

  it("refuses undefined where null is required", () => {
    // §16's reason: "undefined is dropped by JSON.stringify and would vanish
    // from the hashed body".
    expect(() =>
      journalFor({
        occasion: "TERMINAL_STATE",
        observation: settlementObservation(),
        ingest_valid: true,
        state: "RECONCILED",
        exception_class: undefined as never,
        abstention_role: null,
      }),
    ).toThrow(/expected a value or null/);
  });

  it("refuses every class paired with the wrong kind", () => {
    const wrongPairs: readonly [ExceptionClass, ReturnType<typeof paymentObservation>][] =
      [
        ["E01_MISSING_CAPTURE", bankLineObservation()],
        ["E02_MISSING_SETTLEMENT", settlementObservation()],
        ["E03_BANK_CREDIT_UNMATCHED", settlementObservation()],
        ["E04_SETTLEMENT_NOT_IN_BANK", bankLineObservation()],
        ["E09_DUPLICATE_BANK_CREDIT", settlementObservation()],
        ["E12_ADJUSTMENT_UNEXPLAINED", paymentObservation()],
        ["E14_UTR_COLLISION", bankLineObservation()],
      ];
    for (const [cls, observation] of wrongPairs) {
      expect(() => journalFor(exception(observation, cls))).toThrow(
        /§17.1.1 keys .* on/,
      );
    }
  });

  it("refuses P6 on a refund recon line — the E02 row's key is pay_…", () => {
    expect(() =>
      journalFor(exception(refundObservation(), "E02_MISSING_SETTLEMENT")),
    ).toThrow(/whose key is pay_…/);
  });
});

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

describe("amounts", () => {
  it("refuses a negative amount before it can become a negative posting", () => {
    // `paiseField` is non-negative (ARCHITECTURE.md §4); a negative debit would
    // give one economic fact two spellings and two hashed bodies.
    expect(() =>
      journalFor({ ...P1, observation: paymentObservation({ amount: -1 as never }) }),
    ).toThrow(/not a valid Observation/);
  });

  it.each([
    ["a float", 100_000.5],
    ["a negative zero", -0],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["2^53", Number.MAX_SAFE_INTEGER + 1],
    ["a numeric string", "100000"],
    ["a bigint", 100_000n],
  ])("refuses %s as a settlement amount", (label, value) => {
    const request = exception(
      settlementObservation({ amount: value as never }),
      "E04_SETTLEMENT_NOT_IN_BANK",
    );
    if (label === "a negative zero") {
      // -0 IS a safe non-negative integer, so it parses; the posting it implies
      // is zero paise, which §16 cannot express, so it is refused there instead.
      expect(() => journalFor(request)).toThrow(/zero paise/);
    } else {
      expect(() => journalFor(request)).toThrow(TypeError);
    }
  });

  it("carries a very large safe amount through without loss", () => {
    const amount = Number.MAX_SAFE_INTEGER;
    const posting = posted(
      journalFor(
        exception(
          settlementObservation({ amount: amount as never }),
          "E04_SETTLEMENT_NOT_IN_BANK",
        ),
      ),
    );
    expect(posting.lines.map((l) => l.dr_paise + l.cr_paise)).toEqual([amount, amount]);
    expect(posting.lines.reduce((a, l) => a + l.dr_paise, 0)).toBe(
      posting.lines.reduce((a, l) => a + l.cr_paise, 0),
    );
  });

  it("refuses a P2 whose legs would overflow the safe range", () => {
    // `sub` re-validates each leg, and `sealPosting` tests exactness before
    // equality — so a total that has lost precision is named as an `I7`
    // failure rather than compared against another inexact total.
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation({
          amount: Number.MAX_SAFE_INTEGER as never,
          credit: Number.MAX_SAFE_INTEGER as never,
          fee: 1 as never,
          tax: 0 as never,
        }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
    ).toThrow(/left the safe-integer range/);
  });

  it("still names an ordinary imbalance as one", () => {
    // The exactness check must not swallow the common case: a line on which
    // `I3` fails inside the safe range is reported as an imbalance.
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation({ credit: 90_000 as never }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
    ).toThrow(/does not balance/);
  });

  it("never produces a non-integer paise figure", () => {
    for (const request of [
      P1,
      exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED"),
      exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED"),
    ]) {
      for (const line of posted(journalFor(request)).lines) {
        expect(Number.isInteger(line.dr_paise)).toBe(true);
        expect(Number.isInteger(line.cr_paise)).toBe(true);
        expect(Object.is(line.dr_paise, -0)).toBe(false);
        expect(Object.is(line.cr_paise, -0)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Regressions found in the adversarial review of this milestone
// ---------------------------------------------------------------------------

describe("bank-side evidence names real identifiers", () => {
  it.each([
    ["a bare token", "yes"],
    ["an ASSAY-internal handle", "obs_000001A"],
    ["a settlement id", SETL_ID],
  ])("refuses %s as bank_line_id", (_label, value) => {
    // The whole reason `bank_line_id` is a field rather than a boolean is that
    // "I5 is undefined — not satisfied — when no bank-line mapping exists". A
    // token naming no bank line restores the boolean this field replaced.
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation(),
        ingest_valid: true,
        bank_evidence: { ...BANK_EVIDENCE, bank_line_id: value },
      }),
    ).toThrow(/expected a bnk_… identifier/);
  });

  it("refuses a settlement_id that is not one", () => {
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation(),
        ingest_valid: true,
        bank_evidence: { ...BANK_EVIDENCE, settlement_id: "setl_short" },
      }),
    ).toThrow(/expected a setl_… identifier/);
  });

  it("refuses an unknown field on the evidence", () => {
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation(),
        ingest_valid: true,
        bank_evidence: { ...BANK_EVIDENCE, an1_satisfied: true } as never,
      }),
    ).toThrow(/unknown field/);
  });
});

describe("an unbalanced posting cannot escape by losing precision", () => {
  it("refuses totals outside the safe-integer range before comparing them", () => {
    // Two totals that both lost precision can compare equal, which is how an
    // unbalanced journal would pass a naive `Σdr === Σcr`. Invariant I7.
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation({
          amount: Number.MAX_SAFE_INTEGER as never,
          credit: Number.MAX_SAFE_INTEGER as never,
          fee: Number.MAX_SAFE_INTEGER as never,
          tax: 0 as never,
        }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
    ).toThrow(/left the safe-integer range/);
  });
});

describe("P5 refuses a bank line whose observed direction is outbound", () => {
  it("does not debit 1200_BANK for money that left", () => {
    // §17.1.1's P5 row is the *inbound* row and §17.1 describes it as "value
    // has arrived in the bank". `BankStatementLine.direction` (§7) has a real
    // "debit" value, and no row covers it, so it is refused rather than posted
    // under a row written for the other direction.
    for (const request of [
      exception(bankLineObservation({ direction: "debit" }), "E03_BANK_CREDIT_UNMATCHED"),
      exception(bankLineObservation({ direction: "debit" }), "E09_DUPLICATE_BANK_CREDIT"),
      {
        occasion: "TERMINAL_STATE" as const,
        observation: bankLineObservation({ direction: "debit" }),
        ingest_valid: true,
        state: "ABSTAINED" as const,
        exception_class: null,
        abstention_role: "TARGET" as const,
      },
    ]) {
      expect(() => journalFor(request)).toThrow(/specification seam/);
    }
  });

  it("still posts a credit-direction bank line", () => {
    const posting = posted(
      journalFor(
        exception(bankLineObservation({ direction: "credit" }), "E03_BANK_CREDIT_UNMATCHED"),
      ),
    );
    expect(posting.rule).toBe("P5");
  });
});

// ---------------------------------------------------------------------------
// Mutation, aliasing and hostile accessors
// ---------------------------------------------------------------------------

describe("the posting cannot be changed after it is built", () => {
  it("is deep-frozen", () => {
    const posting = posted(journalFor(P1));
    expect(Object.isFrozen(posting)).toBe(true);
    expect(Object.isFrozen(posting.lines)).toBe(true);
    for (const line of posting.lines) expect(Object.isFrozen(line)).toBe(true);
  });

  it("refuses a write to a line, an amount and the array", () => {
    const posting = posted(journalFor(P1));
    expect(() => {
      (posting.lines as { length: number }).length = 0;
    }).toThrow(TypeError);
    expect(() => {
      (posting.lines[0] as { dr_paise: number }).dr_paise = 1;
    }).toThrow(TypeError);
    expect(() => {
      (posting.lines[0] as { source_entity_id: string }).source_entity_id = "x";
    }).toThrow(TypeError);
    expect(() => {
      (posting as { rule: string }).rule = "P8";
    }).toThrow(TypeError);
  });

  it("shares no object with its request", () => {
    const observation = paymentObservation();
    const request: PostingRequest = { occasion: "INGEST", observation, ingest_valid: true };
    const posting = posted(journalFor(request));
    // Mutating the caller's own observation afterwards changes nothing.
    (observation.payload as { amount: number }).amount = 1;
    expect(posting.lines.map((l) => l.dr_paise + l.cr_paise)).toEqual([
      CARD_LINE.amount,
      CARD_LINE.amount,
    ]);
  });

  it("reads a hostile getter once, and posts what it validated", () => {
    // The `events.ts` argument: reading twice "cannot show one value to the
    // validator and hand another to the serializer".
    let reads = 0;
    const base = settlementObservation();
    const hostile = {
      ...base,
      payload: new Proxy(base.payload, {
        get(target, key, receiver) {
          if (key === "amount") {
            reads += 1;
            return reads === 1 ? 10_000_000 : 1;
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
    };
    const posting = posted(
      journalFor(exception(hostile as never, "E04_SETTLEMENT_NOT_IN_BANK")),
    );
    // Whatever the proxy said, both legs agree and the posting balances.
    const amounts = posting.lines.map((l) => l.dr_paise + l.cr_paise);
    expect(new Set(amounts).size).toBe(1);
    expect(posting.lines.reduce((a, l) => a + l.dr_paise, 0)).toBe(
      posting.lines.reduce((a, l) => a + l.cr_paise, 0),
    );
  });

  it("refuses a request object whose `occasion` getter changes answer", () => {
    let reads = 0;
    const hostile = {
      get occasion() {
        reads += 1;
        return reads === 1 ? "INGEST" : "RESOLUTION";
      },
      observation: paymentObservation(),
      ingest_valid: true,
    };
    // Either it is read once and behaves as INGEST, or it is refused. What it
    // must not do is select one rule and construct another.
    const decision = journalFor(hostile as never);
    expect(decision.posts && decision.rule).toBe("P1");
  });

  it("does not retain the request — two calls on one object agree", () => {
    const request: PostingRequest = exception(
      settlementObservation(),
      "E04_SETTLEMENT_NOT_IN_BANK",
    );
    expect(journalFor(request)).toEqual(journalFor(request));
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  const requests: readonly PostingRequest[] = [
    P1,
    {
      occasion: "BANK_EVIDENCE",
      observation: paymentObservation(),
      ingest_valid: true,
      bank_evidence: BANK_EVIDENCE,
    },
    { occasion: "INGEST", observation: refundObservation(), ingest_valid: true },
    exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED"),
    exception(settlementObservation(), "E14_UTR_COLLISION"),
    exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED"),
  ];

  it("repeated identical input yields byte-identical postings", () => {
    // `I9` and metric 23: two runs over identical inputs must produce identical
    // root hashes, and `journal_lines` is inside the hashed body.
    for (const request of requests) {
      const runs = Array.from({ length: 25 }, () => JSON.stringify(journalFor(request)));
      expect(new Set(runs).size).toBe(1);
    }
  });

  it("does not depend on the key order of the request or the payload", () => {
    const shuffle = <T extends object>(value: T): T =>
      Object.fromEntries(
        Object.entries(value)
          .slice()
          .sort(([a], [b]) => (a < b ? 1 : -1)),
      ) as T;
    const observation = settlementObservation();
    const reordered = {
      ...shuffle(observation),
      payload: shuffle(observation.payload),
    } as typeof observation;
    expect(
      JSON.stringify(journalFor(exception(reordered, "E04_SETTLEMENT_NOT_IN_BANK"))),
    ).toBe(
      JSON.stringify(journalFor(exception(observation, "E04_SETTLEMENT_NOT_IN_BANK"))),
    );
  });

  it("orders lines identically whichever order the accounts were built in", () => {
    // The ordering rule is by ACCOUNT_CODES index, so it cannot depend on the
    // order §17.1's table happens to print a rule's columns in.
    const p2 = posted(
      journalFor({
        occasion: "BANK_EVIDENCE",
        observation: paymentObservation(),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
    );
    expect(p2.lines.map((l) => l.account)).toEqual([...p2.lines.map((l) => l.account)].sort());
  });
});

// ---------------------------------------------------------------------------
// Duplicates, and the two-store identity G3 rests on
// ---------------------------------------------------------------------------

describe("duplicates and item identity", () => {
  it("two calls on one observation are two postings, not one merged item", () => {
    // The journal is a pure function and does not deduplicate: `I2`/`C7` are
    // stage S5's and the engine's (RECONCILIATION_SPEC.md §7, §8). What this
    // asserts is that it does not silently *merge* them either.
    const a = posted(journalFor(P1));
    const b = posted(journalFor(P1));
    expect(a.source_entity_id).toBe(b.source_entity_id);
    expect(a.lines).toEqual(b.lines);
    expect(a.lines).not.toBe(b.lines);
  });

  it("distinct observations never share an item key", () => {
    const keys = [
      posted(journalFor(P1)).source_entity_id,
      posted(journalFor({ ...P1, observation: refundObservation() })).source_entity_id,
      posted(journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")))
        .source_entity_id,
      posted(journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")))
        .source_entity_id,
      posted(journalFor(exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED")))
        .source_entity_id,
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("an E04 settlement and its own recon lines are one item, not two", () => {
    // RECONCILIATION_SPEC.md §11: the five member lines "post no Suspense leg
    // of their own". Only the settlement opens an item.
    const settlement = posted(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
    );
    const member = journalFor({
      occasion: "TERMINAL_STATE",
      observation: paymentObservation(),
      ingest_valid: true,
      state: "ABSTAINED",
      exception_class: null,
      abstention_role: "MEMBER",
    });
    expect(member.posts).toBe(false);
    const suspenseKeys = [...settlement.lines, ...member.lines]
      .filter((l) => l.account === "9000_SUSPENSE_UNRECONCILED")
      .map((l) => l.source_entity_id);
    expect(suspenseKeys).toEqual([SETL_ID]);
  });
});
