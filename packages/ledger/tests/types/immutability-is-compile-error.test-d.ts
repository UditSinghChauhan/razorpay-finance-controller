import { describe, expectTypeOf, it } from "vitest";

import type { Paise } from "@assay/money";

import {
  appendEvent,
  createChain,
  sealDraft,
  type EventActor,
  type JournalLine,
  type LedgerChain,
  type LedgerEvent,
  type LedgerEventDraft,
} from "@assay/ledger";

/**
 * The runtime freeze is the enforcement; this file is the second half of it.
 *
 * `DECISION_BRIEF.md §L.3` requires "strict TypeScript with no `any` at a
 * public boundary", and Layer A's whole claim is that a record cannot be
 * altered after it is hashed. A `readonly` that a later refactor quietly drops
 * would leave that claim resting on `Object.freeze` alone.
 *
 * Each `@ts-expect-error` asserts that the line beneath it MUST fail to
 * compile. If the public API is ever widened so that one of them starts
 * compiling, TypeScript reports the directive as unused and this file fails —
 * the opposite of suppressing an error.
 */
declare const event: LedgerEvent;
declare const otherActor: EventActor;
declare const chain: LedgerChain;
declare const journalLine: JournalLine;
declare const draft: LedgerEventDraft;

describe("an event cannot be edited through its type", () => {
  it("rejects assignment to a scalar field", () => {
    expectTypeOf<LedgerEvent["seq"]>().toEqualTypeOf<number>();
    // @ts-expect-error — seq is readonly
    event.seq = 99;
    // @ts-expect-error — hash is readonly
    event.hash = event.prev_hash;
    // @ts-expect-error — prev_hash is readonly
    event.prev_hash = event.hash;
  });

  it("rejects assignment through the actor block", () => {
    expectTypeOf<LedgerEvent["actor"]["type"]>().toEqualTypeOf<
      "deterministic" | "llm" | "human"
    >();
    // @ts-expect-error — actor is readonly
    event.actor = otherActor;
    // @ts-expect-error — actor.type is readonly
    event.actor.type = "human";
  });

  it("rejects in-place edits to the journal lines", () => {
    // @ts-expect-error — journal_lines is a readonly array
    event.journal_lines.push(journalLine);
    // @ts-expect-error — journal_lines is a readonly array
    event.journal_lines[0] = journalLine;
    // @ts-expect-error — dr_paise is readonly
    journalLine.dr_paise = 0 as Paise;
  });

  it("rejects in-place edits to the identifier lists", () => {
    // @ts-expect-error — subject_ids is a readonly array
    event.subject_ids.push("obs_x");
    // @ts-expect-error — evidence_ids is a readonly array
    event.evidence_ids.pop();
  });

  it("rejects edits through the certificate", () => {
    if (event.certificate === null) return;
    // @ts-expect-error — materiality_paise is readonly
    event.certificate.materiality_paise = 0 as Paise;
    // @ts-expect-error — member_obs_ids is a readonly array
    event.certificate.solution_a.member_obs_ids.push("obs_x");
  });
});

describe("a chain cannot be edited through its type", () => {
  it("rejects assignment to the chain's own fields", () => {
    // @ts-expect-error — root_hash is readonly
    chain.root_hash = chain.genesis_hash;
    // @ts-expect-error — events is readonly
    chain.events = [];
    // @ts-expect-error — the running totals are readonly
    chain.total_dr_paise = 0 as Paise;
  });

  it("rejects an in-place append", () => {
    // @ts-expect-error — events is a readonly array
    chain.events.push(event);
    // @ts-expect-error — events is a readonly array
    chain.events.splice(0, 1);
  });

  it("returns a new chain rather than mutating one", () => {
    expectTypeOf(appendEvent).returns.toEqualTypeOf<LedgerChain>();
    expectTypeOf(createChain).returns.toEqualTypeOf<LedgerChain>();
  });
});

describe("money in a journal line is Paise, never a bare number", () => {
  it("rejects an unbranded number", () => {
    const bad: JournalLine = {
      account: "1200_BANK",
      // @ts-expect-error — an unbranded number is not a Paise
      dr_paise: 100,
      cr_paise: 0 as Paise,
      memo_ref: "x",
    };
    expectTypeOf<JournalLine["dr_paise"]>().toEqualTypeOf<Paise>();
    expectTypeOf(bad).toEqualTypeOf<JournalLine>();
  });

  it("rejects a float", () => {
    const bad: JournalLine = {
      account: "1200_BANK",
      // @ts-expect-error — a float is not a Paise
      dr_paise: 12.5,
      cr_paise: 0 as Paise,
      memo_ref: "x",
    };
    expectTypeOf(bad).toEqualTypeOf<JournalLine>();
  });

  it("rejects an eighth control account", () => {
    const bad: JournalLine = {
      // @ts-expect-error — the account set is closed at seven (DATA_MODEL.md §17)
      account: "1400_INVENTED",
      dr_paise: 1 as Paise,
      cr_paise: 0 as Paise,
      memo_ref: "x",
    };
    expectTypeOf(bad).toEqualTypeOf<JournalLine>();
  });
});

describe("a draft cannot claim a position in the chain", () => {
  it("rejects seq, prev_hash and hash on a draft", () => {
    // @ts-expect-error — a draft has no seq; the chain assigns it
    const withSeq: LedgerEventDraft = { ...draft, seq: 0 };
    // @ts-expect-error — a draft has no prev_hash; the chain assigns it
    const withPrev: LedgerEventDraft = { ...draft, prev_hash: "0".repeat(64) };
    // @ts-expect-error — a draft has no hash; the chain computes it
    const withHash: LedgerEventDraft = { ...draft, hash: "0".repeat(64) };
    expectTypeOf(withSeq).toEqualTypeOf<LedgerEventDraft>();
    expectTypeOf(withPrev).toEqualTypeOf<LedgerEventDraft>();
    expectTypeOf(withHash).toEqualTypeOf<LedgerEventDraft>();
  });

  it("rejects a bare string where an identifier is required", () => {
    // @ts-expect-error — an unbranded string is not an EventId
    const bad: LedgerEventDraft = { ...draft, evt_id: "evt_1" };
    expectTypeOf(bad).toEqualTypeOf<LedgerEventDraft>();
  });

  it("returns a draft, never a positioned event", () => {
    expectTypeOf(sealDraft).returns.toEqualTypeOf<LedgerEventDraft>();
    expectTypeOf(sealDraft).returns.not.toEqualTypeOf<LedgerEvent>();
  });
});
