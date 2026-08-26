import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ACCOUNT_CODES, SUSPENSE_ACCOUNT } from "@assay/domain";
import { MAX_PAISE } from "@assay/money";

import {
  EXCEPTION_CLASSES,
  journalFor,
  type ExceptionClass,
  type JournalDecision,
  type Posting,
  type PostingRequest,
} from "@assay/ledger";

import {
  BANK_EVIDENCE,
  adjustmentObservation,
  bankLineObservation,
  paymentObservation,
  refundObservation,
  settlementObservation,
} from "./../journal-fixtures.js";

/**
 * The posting layer's claims are of the form "for every observation", which
 * examples cannot state. Seven are load-bearing elsewhere in the system:
 *
 *   - every posting balances, so gate `G2` cannot be broken by an input
 *     (`DATA_MODEL.md §17` invariant `I1`);
 *   - every line satisfies `§16`'s five-field shape, so a posting always
 *     survives the reader that will hash it;
 *   - one posting is one item — every leg carries one `source_entity_id` — so
 *     gate `G3`'s partition is well defined (`RECONCILIATION_SPEC.md §10.1`);
 *   - `P5` and `P6` are exact mirrors on the Suspense side, so no input inverts
 *     a direction (`DATA_MODEL.md §17.1`, `EVALUATION_SPEC.md §4.4`);
 *   - `P7` nets its item to zero under the same key, so *open* stays arithmetic
 *     rather than a flag (`§16`);
 *   - the item a posting opens is worth `value(observation)` exactly, which is
 *     what makes `G3`'s two sides the same number (`§14.1`);
 *   - the result is a function of the input alone (`I9`, metric 23).
 *
 * The seed is fixed and shared with the projection suite, so a failure is
 * reproducible and two runs of this file are the same run.
 */
const SEED = 20260826;
const RUNS = 2_000;

/**
 * An amount bounded so that `P2`'s four legs cannot overflow while still
 * reaching well past any realistic settlement. `MAX_PAISE / 4` leaves room for
 * `credit + (fee − tax) + tax` and their running total.
 */
const amount = fc.integer({ min: 1, max: Math.floor(MAX_PAISE / 4) });

/** A card line that satisfies `I3`: `credit = amount − fee`, `tax ≤ fee`. */
const cardLine = fc
  .tuple(amount, fc.nat({ max: 10_000 }), fc.nat({ max: 10_000 }))
  .map(([gross, feeSeed, taxSeed]) => {
    const fee = Math.min(feeSeed, gross);
    const tax = Math.min(taxSeed, fee);
    return { amount: gross, fee, tax, credit: gross - fee };
  });

const postingClasses = [
  "E01_MISSING_CAPTURE",
  "E02_MISSING_SETTLEMENT",
  "E03_BANK_CREDIT_UNMATCHED",
  "E04_SETTLEMENT_NOT_IN_BANK",
  "E09_DUPLICATE_BANK_CREDIT",
  "E12_ADJUSTMENT_UNEXPLAINED",
  "E14_UTR_COLLISION",
] as const satisfies readonly ExceptionClass[];

const silentClasses = EXCEPTION_CLASSES.filter(
  (c) => !(postingClasses as readonly string[]).includes(c),
);

/** Every occasion that posts, paired with the figure `§14.1` values it at. */
const postingRequest: fc.Arbitrary<{
  request: PostingRequest;
  rule: string;
  /** `value(observation)` where the rule opens a Suspense item, else null. */
  value: number | null;
}> = fc.oneof(
  cardLine.map((line) => ({
    request: {
      occasion: "INGEST" as const,
      observation: paymentObservation(line as never),
      ingest_valid: true,
    },
    rule: "P1",
    value: null,
  })),
  cardLine.map((line) => ({
    request: {
      occasion: "BANK_EVIDENCE" as const,
      observation: paymentObservation(line as never),
      ingest_valid: true,
      bank_evidence: BANK_EVIDENCE,
    },
    rule: "P2",
    value: null,
  })),
  amount.map((gross) => ({
    request: {
      occasion: "INGEST" as const,
      observation: refundObservation({ amount: gross, debit: gross } as never),
      ingest_valid: true,
    },
    rule: "P3",
    value: null,
  })),
  amount.map((gross) => ({
    request: {
      occasion: "BANK_EVIDENCE" as const,
      observation: refundObservation({ amount: gross, debit: gross } as never),
      ingest_valid: true,
      bank_evidence: BANK_EVIDENCE,
    },
    rule: "P4",
    value: null,
  })),
  amount.map((gross) => ({
    request: {
      occasion: "TERMINAL_STATE" as const,
      observation: bankLineObservation({ amount: gross } as never),
      ingest_valid: true,
      state: "EXCEPTION" as const,
      exception_class: "E03_BANK_CREDIT_UNMATCHED" as const,
      abstention_role: null,
    },
    rule: "P5",
    // §14.1, bank_line: "the credit that actually arrived".
    value: gross,
  })),
  amount.map((gross) => ({
    request: {
      occasion: "TERMINAL_STATE" as const,
      observation: settlementObservation({ amount: gross } as never),
      ingest_valid: true,
      state: "ABSTAINED" as const,
      exception_class: null,
      abstention_role: "TARGET" as const,
    },
    rule: "P6",
    // §14.1, settlement: "I4 closes a settlement at exactly this figure".
    value: gross,
  })),
  fc.tuple(amount, fc.boolean()).map(([m, debitSide]) => ({
    request: {
      occasion: "TERMINAL_STATE" as const,
      observation: adjustmentObservation({
        debit: debitSide ? m : 0,
        credit: debitSide ? 0 : m,
        // §17.2 leaves `amount` unconstrained on adjustment rows; it is drawn
        // independently so a P8 that posted it would fail these properties.
        amount: MAX_PAISE,
      } as never),
      ingest_valid: true,
      state: "EXCEPTION" as const,
      exception_class: "E12_ADJUSTMENT_UNEXPLAINED" as const,
      abstention_role: null,
    },
    rule: "P8",
    // §14.1, adjustment: "M — the non-zero one of debit/credit. **Not amount.**"
    value: m,
  })),
);

function posted(decision: JournalDecision): Posting {
  if (!decision.posts) throw new Error(`expected a posting, got ${decision.ground}`);
  return decision;
}

const sumDr = (posting: Posting) => posting.lines.reduce((a, l) => a + l.dr_paise, 0);
const sumCr = (posting: Posting) => posting.lines.reduce((a, l) => a + l.cr_paise, 0);

/** `item_net_paise(k)` over one posting (`RECONCILIATION_SPEC.md §10.1`). */
const itemNet = (lines: readonly Posting["lines"][number][]) =>
  lines
    .filter((l) => l.account === SUSPENSE_ACCOUNT)
    .reduce((a, l) => a + l.dr_paise - l.cr_paise, 0);

describe("every posting the trigger table can produce", () => {
  it("balances — invariant I1, close gate G2", () => {
    fc.assert(
      fc.property(postingRequest, ({ request }) => {
        const posting = posted(journalFor(request));
        expect(sumDr(posting)).toBe(sumCr(posting));
        expect(Number.isSafeInteger(sumDr(posting))).toBe(true);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("emits only well-formed §16 lines, on the seven control accounts", () => {
    fc.assert(
      fc.property(postingRequest, ({ request }) => {
        for (const line of posted(journalFor(request)).lines) {
          expect(ACCOUNT_CODES).toContain(line.account);
          expect(Number.isSafeInteger(line.dr_paise)).toBe(true);
          expect(Number.isSafeInteger(line.cr_paise)).toBe(true);
          expect(line.dr_paise).toBeGreaterThanOrEqual(0);
          expect(line.cr_paise).toBeGreaterThanOrEqual(0);
          expect(line.dr_paise === 0).not.toBe(line.cr_paise === 0);
          expect(Object.keys(line)).toHaveLength(5);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("is one item: one source_entity_id on every leg, and one leg per account", () => {
    fc.assert(
      fc.property(postingRequest, ({ request }) => {
        const posting = posted(journalFor(request));
        for (const line of posting.lines) {
          expect(line.source_entity_id).toBe(posting.source_entity_id);
        }
        const accounts = posting.lines.map((l) => l.account);
        expect(new Set(accounts).size).toBe(accounts.length);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("names its rule and takes the rule the request implies", () => {
    fc.assert(
      fc.property(postingRequest, ({ request, rule }) => {
        const posting = posted(journalFor(request));
        expect(posting.rule).toBe(rule);
        for (const line of posting.lines) expect(line.memo_ref).toBe(rule);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("orders lines by ascending account code", () => {
    fc.assert(
      fc.property(postingRequest, ({ request }) => {
        const accounts = posted(journalFor(request)).lines.map((l) => l.account);
        expect(accounts).toEqual([...accounts].sort());
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("is a function of its input alone — I9, metric 23", () => {
    fc.assert(
      fc.property(postingRequest, ({ request }) => {
        expect(JSON.stringify(journalFor(request))).toBe(
          JSON.stringify(journalFor(request)),
        );
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("Suspense direction and the G3 quantity", () => {
  it("opens an item worth exactly value(observation) — §14.1", () => {
    fc.assert(
      fc.property(postingRequest, ({ request, value }) => {
        const posting = posted(journalFor(request));
        const net = itemNet([...posting.lines]);
        if (value === null) {
          // P1–P4 open no Suspense item at all.
          expect(net).toBe(0);
        } else {
          // This is G3's left side for one item; its right side is
          // value(observation), read from the Decision / Exception record.
          expect(Math.abs(net)).toBe(value);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("credits Suspense inbound and debits it outbound — never the reverse", () => {
    fc.assert(
      fc.property(amount, (gross) => {
        const p5 = posted(
          journalFor({
            occasion: "TERMINAL_STATE",
            observation: bankLineObservation({ amount: gross } as never),
            ingest_valid: true,
            state: "EXCEPTION",
            exception_class: "E03_BANK_CREDIT_UNMATCHED",
            abstention_role: null,
          }),
        );
        const p6 = posted(
          journalFor({
            occasion: "TERMINAL_STATE",
            observation: settlementObservation({ amount: gross } as never),
            ingest_valid: true,
            state: "EXCEPTION",
            exception_class: "E04_SETTLEMENT_NOT_IN_BANK",
            abstention_role: null,
          }),
        );
        // §17.1: the known leg posts in its true economic direction, so an
        // abstained bank credit leaves 1200_BANK positive and matching truth.
        expect(itemNet([...p5.lines])).toBe(-gross);
        expect(itemNet([...p6.lines])).toBe(gross);
        const bank = p5.lines.find((l) => l.account === "1200_BANK");
        expect(bank?.dr_paise).toBe(gross);
        const receivable = p6.lines.find(
          (l) => l.account === "1100_GATEWAY_RECEIVABLE",
        );
        expect(receivable?.cr_paise).toBe(gross);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("P7 nets its item to zero under the same key", () => {
    fc.assert(
      fc.property(postingRequest, ({ request, value }) => {
        const opening = posted(journalFor(request));
        if (value === null || opening.rule === "P8") return; // P7 takes P5 or P6 only
        const reversal = posted(
          journalFor({ occasion: "RESOLUTION", opening: opening.lines }),
        );
        expect(reversal.source_entity_id).toBe(opening.source_entity_id);
        expect(itemNet([...opening.lines, ...reversal.lines])).toBe(0);
        expect(sumDr(reversal)).toBe(sumCr(reversal));
        // Every account of the opening reappears, on the other side.
        expect(reversal.lines.map((l) => l.account)).toEqual(
          opening.lines.map((l) => l.account),
        );
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("two distinct items never merge, and never net each other away", () => {
    fc.assert(
      fc.property(amount, amount, (a, b) => {
        const inbound = posted(
          journalFor({
            occasion: "TERMINAL_STATE",
            observation: bankLineObservation({ amount: a } as never),
            ingest_valid: true,
            state: "EXCEPTION",
            exception_class: "E03_BANK_CREDIT_UNMATCHED",
            abstention_role: null,
          }),
        );
        const outbound = posted(
          journalFor({
            occasion: "TERMINAL_STATE",
            observation: settlementObservation({ amount: b } as never),
            ingest_valid: true,
            state: "EXCEPTION",
            exception_class: "E14_UTR_COLLISION",
            abstention_role: null,
          }),
        );
        expect(inbound.source_entity_id).not.toBe(outbound.source_entity_id);
        // The E14 residual: two items, counted twice, gross not net. The gross
        // sum is what gate G3 tests, and it is a + b whatever the two are.
        const gross = Math.abs(itemNet([...inbound.lines])) +
          Math.abs(itemNet([...outbound.lines]));
        expect(gross).toBe(a + b);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("the classes and kinds that post nothing", () => {
  it("never post, whatever the amount", () => {
    fc.assert(
      fc.property(
        amount,
        fc.constantFrom(...silentClasses),
        (gross, cls) => {
          const decision = journalFor({
            occasion: "TERMINAL_STATE",
            observation: paymentObservation({ amount: gross, credit: gross, fee: 0, tax: 0 } as never),
            ingest_valid: true,
            state: "EXCEPTION",
            exception_class: cls,
            abstention_role: null,
          });
          // All seven are silent on any kind. Only the seven *posting* rows are
          // kind-bound, because only those name a `source_entity_id` family
          // that has to come from somewhere; §17.1.1's key column for these is
          // "—", so there is no domain to enforce and none is invented.
          expect(decision.posts).toBe(false);
          expect(decision.lines).toHaveLength(0);
          expect(decision.rule).toBeNull();
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("a failed ingest validation posts nothing, on every occasion", () => {
    fc.assert(
      fc.property(cardLine, (line) => {
        for (const request of [
          {
            occasion: "INGEST" as const,
            observation: paymentObservation(line as never),
            ingest_valid: false,
          },
          {
            occasion: "BANK_EVIDENCE" as const,
            observation: paymentObservation(line as never),
            ingest_valid: false,
            bank_evidence: BANK_EVIDENCE,
          },
        ]) {
          const decision = journalFor(request);
          expect(decision.posts).toBe(false);
          expect(decision.lines).toHaveLength(0);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
