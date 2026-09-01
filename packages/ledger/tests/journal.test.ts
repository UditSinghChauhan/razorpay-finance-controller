import { describe, expect, it } from "vitest";

import type { SettlementId } from "@assay/domain";

import {
  EXCEPTION_CLASSES,
  JournalError,
  journalFor,
  type ExceptionClass,
  type JournalDecision,
  type Posting,
  type PostingRequest,
} from "@assay/ledger";

import { entityId } from "./fixtures.js";
import {
  ADJ_ID,
  BANK_EVIDENCE,
  BNK_ID,
  CARD_LINE,
  PAY_ID,
  RFND_ID,
  SETL_ID,
  adjustmentObservation,
  bankLineObservation,
  disputeObservation,
  ledgerEntryObservation,
  orderObservation,
  paymentEntityObservation,
  paymentObservation,
  refundEntityObservation,
  refundObservation,
  settlementObservation,
} from "./journal-fixtures.js";

// ---------------------------------------------------------------------------
// Helpers — none of which decides a posting
// ---------------------------------------------------------------------------

/** The lines of a decision that must have posted, keyed by account. */
function postedOr(decision: JournalDecision, fail: string): Posting {
  if (!decision.posts) throw new Error(`${fail}: ground ${decision.ground}`);
  return decision;
}

/** `{ account: signed paise }`, debit-positive per `DATA_MODEL.md §17.1`. */
function movements(posting: Posting): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of posting.lines) {
    out[line.account] = (out[line.account] ?? 0) + line.dr_paise - line.cr_paise;
  }
  return out;
}

const terminal = (
  observation: ReturnType<typeof paymentObservation>,
  state: "RECONCILED" | "ABSTAINED" | "EXCEPTION" | "REFERENCE",
  extra: {
    exception_class?: ExceptionClass | null;
    abstention_role?: "TARGET" | "MEMBER" | null;
    ingest_valid?: boolean;
  } = {},
): PostingRequest => ({
  occasion: "TERMINAL_STATE",
  observation,
  ingest_valid: extra.ingest_valid ?? true,
  state,
  exception_class: extra.exception_class ?? null,
  abstention_role: extra.abstention_role ?? null,
});

const exception = (
  observation: ReturnType<typeof paymentObservation>,
  cls: ExceptionClass,
): PostingRequest => terminal(observation, "EXCEPTION", { exception_class: cls });

// ---------------------------------------------------------------------------
// P1 — capture at the gateway
// ---------------------------------------------------------------------------

describe("P1 — payment captured at the gateway", () => {
  it("posts DR 1100 / CR 4000 on `amount` at ingest", () => {
    const posting = postedOr(
      journalFor({
        occasion: "INGEST",
        observation: paymentObservation(),
        ingest_valid: true,
      }),
      "P1 did not fire",
    );
    expect(posting.rule).toBe("P1");
    expect(movements(posting)).toEqual({
      "1100_GATEWAY_RECEIVABLE": CARD_LINE.amount,
      "4000_REVENUE": -CARD_LINE.amount,
    });
  });

  it("keys the item on the recon line itself, a `pay_…`", () => {
    const posting = postedOr(
      journalFor({
        occasion: "INGEST",
        observation: paymentObservation(),
        ingest_valid: true,
      }),
      "P1 did not fire",
    );
    // §16: source_entity_id is "the recon line itself for P1–P4", and is
    // "required and non-null on every journal line, including the counter-leg".
    expect(posting.source_entity_id).toBe(PAY_ID);
    for (const line of posting.lines) expect(line.source_entity_id).toBe(PAY_ID);
  });

  it("does not wait on the settlement — §17.1.1 row 1", () => {
    // "A capture is a fact the recon report asserts; it does not wait on ASSAY
    // being able to settle it."
    const unsettled = paymentObservation({
      settled: false,
      settled_at: null,
      settlement_id: null,
      settlement_utr: null,
    });
    const posting = postedOr(
      journalFor({ occasion: "INGEST", observation: unsettled, ingest_valid: true }),
      "P1 must not wait on settlement",
    );
    expect(posting.rule).toBe("P1");
  });

  it("posts nothing at all when the line failed ingest validation", () => {
    const decision = journalFor({
      occasion: "INGEST",
      observation: paymentObservation(),
      ingest_valid: false,
    });
    expect(decision.posts).toBe(false);
    expect(decision.lines).toEqual([]);
    expect(decision.posts === false && decision.ground).toBe("INGEST_VALIDATION_FAILED");
  });
});

// ---------------------------------------------------------------------------
// P2 — the settled payment leg, and the E04 phantom-bank guard
// ---------------------------------------------------------------------------

describe("P2 — settlement reconciled to a bank credit", () => {
  const request: PostingRequest = {
    occasion: "BANK_EVIDENCE",
    allocated_to: SETL_ID,
    observation: paymentObservation(),
    ingest_valid: true,
    bank_evidence: BANK_EVIDENCE,
  };

  it("splits the GST-inclusive fee across 5100 and 1300", () => {
    const posting = postedOr(journalFor(request), "P2 did not fire");
    expect(posting.rule).toBe("P2");
    expect(movements(posting)).toEqual({
      "1200_BANK": CARD_LINE.credit,
      "5100_PG_FEE_EXPENSE": CARD_LINE.feeExGst,
      "1300_GST_INPUT_CREDIT": CARD_LINE.tax,
      "1100_GATEWAY_RECEIVABLE": -CARD_LINE.amount,
    });
  });

  it("balances by construction: credit + (fee − tax) + tax = amount", () => {
    const posting = postedOr(journalFor(request), "P2 did not fire");
    const dr = posting.lines.reduce((a, l) => a + l.dr_paise, 0);
    const cr = posting.lines.reduce((a, l) => a + l.cr_paise, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(CARD_LINE.amount);
  });

  it("omits the fee legs on a zero-fee line rather than posting a zero line", () => {
    // §16 admits no line with dr and cr both zero. The posting still balances.
    const posting = postedOr(
      journalFor({
        ...request,
        observation: paymentObservation({
          fee: 0 as never,
          tax: 0 as never,
          credit: CARD_LINE.amount as never,
        }),
      }),
      "P2 did not fire on a zero-fee line",
    );
    expect(posting.lines.map((l) => l.account)).toEqual([
      "1100_GATEWAY_RECEIVABLE",
      "1200_BANK",
    ]);
    for (const line of posting.lines) {
      expect(line.dr_paise === 0).not.toBe(line.cr_paise === 0);
    }
  });

  it("refuses a line whose `credit` breaks I3, rather than posting an unbalanced one", () => {
    expect(() =>
      journalFor({
        ...request,
        // credit = amount − fee is I3; 90_000 is not 97_640.
        observation: paymentObservation({ credit: 90_000 as never }),
      }),
    ).toThrow(/does not balance/);
  });

  it("refuses tax greater than fee — the GST component is inside the fee", () => {
    expect(() =>
      journalFor({
        ...request,
        observation: paymentObservation({ tax: 5_000 as never }),
      }),
    ).toThrow(/fee − tax cannot be negative/);
  });
});

describe("E04 — AN1 alone must never manufacture a 1200_BANK realization", () => {
  // The regression `DECISION_BRIEF.md §A.7` G-G.1 B3 exists for. `AN1` is
  // "recon_line.settlement_id === settlement.id" — "a gateway-internal identity
  // match that carries no bank-side information". A line reaches RECONCILED on
  // it, which is why the terminal-state occasion must post nothing.
  const line = paymentObservation(); // settlement_id is set: AN1 holds

  it("a recon line reaching RECONCILED on AN1 posts nothing", () => {
    const decision = journalFor(terminal(line, "RECONCILED"));
    expect(decision.posts).toBe(false);
    expect(decision.posts === false && decision.ground).toBe(
      "NO_TRIGGER_AT_THIS_OCCASION",
    );
    expect(decision.lines).toEqual([]);
  });

  it("the E04 settlement takes P6, not a bank posting", () => {
    const posting = postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "E04 must open a Suspense item",
    );
    expect(posting.rule).toBe("P6");
    expect(posting.source_entity_id).toBe(SETL_ID);
    expect(movements(posting)).toEqual({
      "9000_SUSPENSE_UNRECONCILED": 10_000_000,
      "1100_GATEWAY_RECEIVABLE": -10_000_000,
    });
    // The account §17 types as "actual bank credits" is untouched.
    expect(movements(posting)["1200_BANK"]).toBeUndefined();
  });

  it("no account on the E04 path is 1200_BANK, over the whole break", () => {
    // P1 at ingest, then the terminal state. Together: the receivable is
    // recognised and then relieved into Suspense; the bank never moves.
    const p1 = postedOr(
      journalFor({ occasion: "INGEST", observation: line, ingest_valid: true }),
      "P1",
    );
    const p6 = postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "P6",
    );
    const accounts = [...p1.lines, ...p6.lines].map((l) => l.account);
    expect(accounts).not.toContain("1200_BANK");
    expect(accounts).toContain("9000_SUSPENSE_UNRECONCILED");
    expect(accounts).toContain("1100_GATEWAY_RECEIVABLE");
  });

  it("G2 holds across both events, and G3's item is the settlement alone", () => {
    const p1 = postedOr(
      journalFor({ occasion: "INGEST", observation: line, ingest_valid: true }),
      "P1",
    );
    const p6 = postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "P6",
    );
    const lines = [...p1.lines, ...p6.lines];
    expect(lines.reduce((a, l) => a + l.dr_paise, 0)).toBe(
      lines.reduce((a, l) => a + l.cr_paise, 0),
    );

    // §10.1's item partition: Suspense lines sharing one source_entity_id.
    const items = new Map<string, number>();
    for (const l of lines) {
      if (l.account !== "9000_SUSPENSE_UNRECONCILED") continue;
      items.set(
        l.source_entity_id,
        (items.get(l.source_entity_id) ?? 0) + l.dr_paise - l.cr_paise,
      );
    }
    expect([...items]).toEqual([[SETL_ID, 10_000_000]]);
    // unresolved_value_paise = value(settlement) = Settlement.amount (§14.1).
    const gross = [...items.values()].reduce((a, n) => a + Math.abs(n), 0);
    expect(gross).toBe(10_000_000);
  });

  it("bank evidence with no bank line is unrepresentable", () => {
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: line,
        ingest_valid: true,
        // `I5` is undefined — not satisfied — when no mapping exists.
        bank_evidence: { ...BANK_EVIDENCE, i5_satisfied: false as never },
      }),
    ).toThrow(JournalError);
  });

  // --- M49's comparand (spec 1.4.30) --------------------------------------
  // §17.1.1's "the settlement it is allocated to" is the ALLOCATION UNDER
  // EVALUATION's, carried as `allocated_to`. The anti-cross-attachment guarantee
  // is unchanged; only its comparand moved, from a field carrying AN1 to the
  // allocation AN2 attests to.

  it("one settlement's bank evidence cannot be attached to another's allocation", () => {
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: line,
        ingest_valid: true,
        bank_evidence: { ...BANK_EVIDENCE, settlement_id: entityId("setl_", 99) },
      }),
    ).toThrow(/the settlement it is allocated to/);
  });

  it("rejects the mismatch from the OTHER side too — evidence right, allocation wrong", () => {
    // The line and the evidence agree on setl_…01; the allocation names another
    // settlement. Before M49 this passed, because the check read the line's own
    // field and never saw the allocation. It is the direction that matters: a
    // caller cannot post one settlement's bank credit under another's
    // allocation by supplying evidence that happens to match the line.
    expect(() =>
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: entityId("setl_", 99),
        observation: line,
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
    ).toThrow(/the settlement it is allocated to/);
  });

  it("a line §3 left UNANCHORED takes P2 under the allocation that explains it", () => {
    // The M49 case, and the one the pre-1.4.30 reading refused. `settlement_id`
    // is null — PREREGISTRATION.md §4.2's DROP_SETTLEMENT_ID, and every member
    // RECONCILIATION_SPEC.md §3 leaves unanchored is such a line — while the
    // allocation under evaluation is the settlement AN2 confirmed. §17.1.1
    // conditions P2 on AN2 and NOT on AN1, so the bank leg posts.
    const posting = postedOr(
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: paymentObservation({ settlement_id: null }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
      "P2 did not fire on an unanchored line",
    );

    expect(posting.rule).toBe("P2");
    // The same four legs, on the same figures, as an AN1-anchored line.
    expect(movements(posting)).toEqual({
      "1200_BANK": CARD_LINE.credit,
      "5100_PG_FEE_EXPENSE": CARD_LINE.feeExGst,
      "1300_GST_INPUT_CREDIT": CARD_LINE.tax,
      "1100_GATEWAY_RECEIVABLE": -CARD_LINE.amount,
    });
  });

  it("a line naming ANOTHER settlement still takes P2 under this allocation", () => {
    // A dangling settlement_id — one naming a settlement absent from the
    // observation set — is also unanchored by S1 and also reaches the pool. M49
    // does not read the field at all, so this posts exactly as the null case
    // does. Re-imposing AN1 in the narrower "non-null must match" form would
    // reject it and reopen what M49 closed.
    const posting = postedOr(
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: paymentObservation({
          settlement_id: entityId("setl_", 77) as SettlementId,
        }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
      "P2 did not fire on a dangling settlement_id",
    );
    expect(posting.rule).toBe("P2");
  });

  it("P4 takes the same comparand, on a refund line with no settlement_id", () => {
    const posting = postedOr(
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: refundObservation({ settlement_id: null }),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
      "P4 did not fire on an unanchored refund line",
    );
    expect(posting.rule).toBe("P4");
  });
});

// ---------------------------------------------------------------------------
// P3 / P4 — refunds
// ---------------------------------------------------------------------------

describe("P3 and P4 — refunds", () => {
  it("P3 posts DR 4000 / CR 2200 at ingest, keyed rfnd_…", () => {
    const posting = postedOr(
      journalFor({
        occasion: "INGEST",
        observation: refundObservation(),
        ingest_valid: true,
      }),
      "P3 did not fire",
    );
    expect(posting.rule).toBe("P3");
    expect(posting.source_entity_id).toBe(RFND_ID);
    expect(movements(posting)).toEqual({
      "4000_REVENUE": 50_000,
      "2200_REFUND_LIABILITY": -50_000,
    });
  });

  it("P4 posts DR 2200 / CR 1200 only on real bank evidence", () => {
    const posting = postedOr(
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: refundObservation(),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
      "P4 did not fire",
    );
    expect(posting.rule).toBe("P4");
    expect(movements(posting)).toEqual({
      "2200_REFUND_LIABILITY": 50_000,
      "1200_BANK": -50_000,
    });
  });

  it("a refund reaching RECONCILED posts no bank leg", () => {
    const decision = journalFor(terminal(refundObservation(), "RECONCILED"));
    expect(decision.posts).toBe(false);
    expect(decision.posts === false && decision.ground).toBe(
      "NO_TRIGGER_AT_THIS_OCCASION",
    );
  });
});

// ---------------------------------------------------------------------------
// P5 / P6 — direction, and the inversion that §17.1 warns about
// ---------------------------------------------------------------------------

describe("P5 — inbound, the bank leg in its true economic direction", () => {
  it("debits 1200_BANK and credits Suspense on an abstained bank line", () => {
    const posting = postedOr(
      journalFor(
        terminal(bankLineObservation(), "ABSTAINED", { abstention_role: "TARGET" }),
      ),
      "P5 did not fire",
    );
    expect(posting.rule).toBe("P5");
    expect(posting.source_entity_id).toBe(BNK_ID);
    // ARCHITECTURE.md §5's worked example, exactly.
    expect(movements(posting)).toEqual({
      "1200_BANK": 45_231_000,
      "9000_SUSPENSE_UNRECONCILED": -45_231_000,
    });
  });

  it("leaves 1200_BANK matching truth, so balance_harm charges zero", () => {
    // §17.1: "an abstained ₹1,00,000 bank credit leaves 1200_BANK at
    // +₹1,00,000, matching truth ... Under the inverted posting it would read
    // −₹1,00,000 against a truth of +₹1,00,000".
    const posting = postedOr(
      journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")),
      "E03 did not fire",
    );
    expect(movements(posting)["1200_BANK"]).toBeGreaterThan(0);
    expect(movements(posting)["9000_SUSPENSE_UNRECONCILED"]).toBeLessThan(0);
  });

  it("E09 holds the later duplicate credit in Suspense rather than netting it", () => {
    const later = bankLineObservation({ bank_line_id: entityId("bnk_", 2) as never }, 11);
    const posting = postedOr(
      journalFor(exception(later, "E09_DUPLICATE_BANK_CREDIT")),
      "E09 did not fire",
    );
    expect(posting.rule).toBe("P5");
    expect(posting.source_entity_id).toBe(entityId("bnk_", 2));
  });
});

describe("P6 — outbound, Suspense takes the debit and the receivable is relieved", () => {
  it("matches RECONCILIATION_SPEC.md §11's worked example to the paisa", () => {
    const posting = postedOr(
      journalFor(
        terminal(settlementObservation(), "ABSTAINED", { abstention_role: "TARGET" }),
      ),
      "P6 did not fire",
    );
    expect(posting.rule).toBe("P6");
    expect(posting.source_entity_id).toBe(SETL_ID);
    // "DR 9000_SUSPENSE_UNRECONCILED ₹1,00,000 / CR 1100_GATEWAY_RECEIVABLE
    // ₹1,00,000, with source_entity_id = setl_A on both legs."
    expect(movements(posting)).toEqual({
      "9000_SUSPENSE_UNRECONCILED": 10_000_000,
      "1100_GATEWAY_RECEIVABLE": -10_000_000,
    });
    // "item_net_paise(setl_A) is +10,000,000, and it enters gate G3 as |…|."
    const suspense = posting.lines.find(
      (l) => l.account === "9000_SUSPENSE_UNRECONCILED",
    );
    expect(suspense?.dr_paise).toBe(10_000_000);
  });

  it("P5 and P6 are exact mirrors — neither direction can be inverted", () => {
    const p5 = postedOr(
      journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")),
      "P5",
    );
    const p6 = postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "P6",
    );
    const suspenseOf = (posting: Posting) =>
      posting.lines.find((l) => l.account === "9000_SUSPENSE_UNRECONCILED");
    // Inbound credits Suspense; outbound debits it. Opposite sides, always.
    expect(suspenseOf(p5)?.cr_paise).toBeGreaterThan(0);
    expect(suspenseOf(p5)?.dr_paise).toBe(0);
    expect(suspenseOf(p6)?.dr_paise).toBeGreaterThan(0);
    expect(suspenseOf(p6)?.cr_paise).toBe(0);
  });

  it("E01 keys on the settlement with no capture behind it", () => {
    const posting = postedOr(
      journalFor(exception(settlementObservation(), "E01_MISSING_CAPTURE")),
      "E01",
    );
    expect(posting.rule).toBe("P6");
    expect(posting.source_entity_id).toBe(SETL_ID);
  });

  it("E02 keys on the payment whose disposition is unknown, at recon-line amount", () => {
    const posting = postedOr(
      journalFor(exception(paymentObservation(), "E02_MISSING_SETTLEMENT")),
      "E02",
    );
    expect(posting.rule).toBe("P6");
    expect(posting.source_entity_id).toBe(PAY_ID);
    // §14.1: "the gross the P1 receivable was recognised at, so relieving it
    // takes the same figure".
    expect(movements(posting)).toEqual({
      "9000_SUSPENSE_UNRECONCILED": CARD_LINE.amount,
      "1100_GATEWAY_RECEIVABLE": -CARD_LINE.amount,
    });
  });

  it("an abstained non-target member posts nothing of its own", () => {
    // §17.1.1: "a second posting for each member would relieve
    // 1100_GATEWAY_RECEIVABLE again for one break."
    const decision = journalFor(
      terminal(paymentObservation(), "ABSTAINED", { abstention_role: "MEMBER" }),
    );
    expect(decision.posts).toBe(false);
    expect(decision.posts === false && decision.ground).toBe("NON_TARGET_MEMBER");
  });

  it("the target universe is not widened — a recon line cannot be a TARGET", () => {
    expect(() =>
      journalFor(
        terminal(paymentObservation(), "ABSTAINED", { abstention_role: "TARGET" }),
      ),
    ).toThrow(/target universe is settlements and bank lines/);
  });
});

// ---------------------------------------------------------------------------
// E14 — the disclosed two-item residual
// ---------------------------------------------------------------------------

describe("E14 — one economic event, two Suspense items, disclosed not netted", () => {
  it("the settlement takes P6 under setl_… and the bank line P5 under bnk_…", () => {
    const settlementSide = postedOr(
      journalFor(exception(settlementObservation(), "E14_UTR_COLLISION")),
      "E14 settlement side",
    );
    const bankSide = postedOr(
      journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")),
      "E14 bank side",
    );
    expect(settlementSide.rule).toBe("P6");
    expect(settlementSide.source_entity_id).toBe(SETL_ID);
    expect(bankSide.rule).toBe("P5");
    expect(bankSide.source_entity_id).toBe(BNK_ID);
  });

  it("counts twice in the gross G3 sum, and the residual is preserved", () => {
    // §17.1.1: "One economic event therefore opens two Suspense items and is
    // counted twice in unresolved_value_paise ... recorded here rather than
    // netted away." This test exists to fail if someone "fixes" it.
    const lines = [
      ...postedOr(
        journalFor(exception(settlementObservation(), "E14_UTR_COLLISION")),
        "settlement",
      ).lines,
      ...postedOr(
        journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")),
        "bank",
      ).lines,
    ];

    const items = new Map<string, number>();
    for (const l of lines) {
      if (l.account !== "9000_SUSPENSE_UNRECONCILED") continue;
      items.set(
        l.source_entity_id,
        (items.get(l.source_entity_id) ?? 0) + l.dr_paise - l.cr_paise,
      );
    }
    expect(items.size).toBe(2);
    expect(items.get(SETL_ID)).toBe(10_000_000);
    expect(items.get(BNK_ID)).toBe(-45_231_000);

    const gross = [...items.values()].reduce((a, n) => a + Math.abs(n), 0);
    const net = [...items.values()].reduce((a, n) => a + n, 0);
    expect(gross).toBe(55_231_000);
    // The net is a different number, and G3 is the gross one — the property
    // THREAT_MODEL.md §T8 rests on.
    expect(net).toBe(-35_231_000);
    expect(gross).not.toBe(Math.abs(net));
  });

  it("two distinct economic events never merge into one item", () => {
    const a = postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "a",
    );
    const b = postedOr(
      journalFor(
        exception(
          settlementObservation({ id: entityId("setl_", 2) as never }, 12),
          "E04_SETTLEMENT_NOT_IN_BANK",
        ),
      ),
      "b",
    );
    expect(a.source_entity_id).not.toBe(b.source_entity_id);
  });
});

// ---------------------------------------------------------------------------
// P7 — reversal
// ---------------------------------------------------------------------------

describe("P7 — exact reversal under the same source_entity_id", () => {
  const p5 = () =>
    postedOr(
      journalFor(exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED")),
      "P5",
    );
  const p6 = () =>
    postedOr(
      journalFor(exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK")),
      "P6",
    );

  it("reverses a P5 opening and nets the item to zero", () => {
    const opening = p5();
    const reversal = postedOr(
      journalFor({ occasion: "RESOLUTION", opening: opening.lines }),
      "P7",
    );
    expect(reversal.rule).toBe("P7");
    expect(reversal.source_entity_id).toBe(opening.source_entity_id);

    const net = [...opening.lines, ...reversal.lines]
      .filter((l) => l.account === "9000_SUSPENSE_UNRECONCILED")
      .reduce((a, l) => a + l.dr_paise - l.cr_paise, 0);
    expect(net).toBe(0);
  });

  it("reverses a P6 opening and nets the item to zero", () => {
    const opening = p6();
    const reversal = postedOr(
      journalFor({ occasion: "RESOLUTION", opening: opening.lines }),
      "P7",
    );
    const net = [...opening.lines, ...reversal.lines]
      .filter((l) => l.account === "9000_SUSPENSE_UNRECONCILED")
      .reduce((a, l) => a + l.dr_paise - l.cr_paise, 0);
    expect(net).toBe(0);
  });

  it("is direction-symmetric: every leg keeps its account and amount, and swaps side", () => {
    // "Exact reversal" leg for leg. Asserted on the output rather than by
    // round-tripping through a second call, because reversing a reversal is an
    // operation §17.1 does not describe — see the test below.
    for (const opening of [p5(), p6()]) {
      const reversal = postedOr(
        journalFor({ occasion: "RESOLUTION", opening: opening.lines }),
        "P7",
      );
      expect(reversal.lines).toHaveLength(opening.lines.length);
      for (const line of opening.lines) {
        const mirror = reversal.lines.find((l) => l.account === line.account);
        expect(mirror).toBeDefined();
        expect(mirror?.dr_paise).toBe(line.cr_paise);
        expect(mirror?.cr_paise).toBe(line.dr_paise);
        expect(mirror?.source_entity_id).toBe(line.source_entity_id);
      }
    }
  });

  it("refuses to reverse a reversal — that would re-open a resolved item", () => {
    // §17.1's P7 row takes "P5 or P6" and names no other input, and §16 makes a
    // resolved item one that "nets to zero". Re-opening it is not an operation
    // the specification describes, so it is refused rather than invented.
    for (const opening of [p5(), p6()]) {
      const reversal = postedOr(
        journalFor({ occasion: "RESOLUTION", opening: opening.lines }),
        "P7",
      );
      expect(() =>
        journalFor({ occasion: "RESOLUTION", opening: reversal.lines }),
      ).toThrow(/P7 reverses a P5 or a P6 opening/);
    }
  });

  it("balances", () => {
    const reversal = postedOr(
      journalFor({ occasion: "RESOLUTION", opening: p6().lines }),
      "P7",
    );
    expect(reversal.lines.reduce((a, l) => a + l.dr_paise, 0)).toBe(
      reversal.lines.reduce((a, l) => a + l.cr_paise, 0),
    );
  });

  it("refuses a P8 opening — §17.1's P7 row names P5 or P6 and no other", () => {
    const p8 = postedOr(
      journalFor(exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED")),
      "P8",
    );
    expect(() => journalFor({ occasion: "RESOLUTION", opening: p8.lines })).toThrow(
      /P7 reverses a P5 or a P6 opening/,
    );
  });

  it("refuses a P1 opening", () => {
    const p1 = postedOr(
      journalFor({
        occasion: "INGEST",
        observation: paymentObservation(),
        ingest_valid: true,
      }),
      "P1",
    );
    expect(() => journalFor({ occasion: "RESOLUTION", opening: p1.lines })).toThrow(
      JournalError,
    );
  });

  it("refuses legs that carry two different item keys", () => {
    const opening = p6();
    const forged = [
      opening.lines[0]!,
      { ...opening.lines[1]!, source_entity_id: entityId("setl_", 3) },
    ];
    expect(() => journalFor({ occasion: "RESOLUTION", opening: forged })).toThrow(
      /one source_entity_id/,
    );
  });

  it("refuses an opening of two well-formed lines that do not balance", () => {
    const opening = p6();
    // Both lines satisfy §16 on their own — "exactly one of dr/cr is non-zero" —
    // so this reaches `reverseOpening`'s own I1 check rather than the line
    // reader's. Reversing an unbalanced opening would produce an unbalanced
    // reversal and leave the item netting to a figure nobody posted.
    const forged = opening.lines.map((line) =>
      line.cr_paise > 0 ? { ...line, cr_paise: 9_999_999 as never } : line,
    );
    expect(() => journalFor({ occasion: "RESOLUTION", opening: forged })).toThrow(
      /an opening posting balances/,
    );
  });

  it("refuses an opening line that is not a §16 journal line at all", () => {
    // Layer A's own reader rejects it, and its error is the right one: a line
    // with dr and cr both non-zero is a malformed *record*, which is what
    // `LedgerEventError` means, not an unpostable allocation.
    const opening = p6();
    const forged = opening.lines.map((line) =>
      line.cr_paise > 0 ? { ...line, dr_paise: 1 as never } : line,
    );
    let raised: unknown;
    try {
      journalFor({ occasion: "RESOLUTION", opening: forged });
    } catch (error) {
      raised = error;
    }
    expect((raised as Error).name).toBe("LedgerEventError");
    expect((raised as Error).message).toMatch(/exactly one of dr_paise \/ cr_paise/);
  });

  it("refuses an opening of the wrong arity", () => {
    const opening = p6();
    expect(() => journalFor({ occasion: "RESOLUTION", opening: [] })).toThrow(
      JournalError,
    );
    expect(() =>
      journalFor({ occasion: "RESOLUTION", opening: [opening.lines[0]!] }),
    ).toThrow(JournalError);
  });
});

// ---------------------------------------------------------------------------
// P8 — narrowed to adjustments
// ---------------------------------------------------------------------------

describe("P8 — the adjustment fallback, and only adjustments", () => {
  it("posts M's debit side as DR Suspense / CR 1200_BANK", () => {
    const posting = postedOr(
      journalFor(exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED")),
      "P8",
    );
    expect(posting.rule).toBe("P8");
    expect(posting.source_entity_id).toBe(ADJ_ID);
    expect(movements(posting)).toEqual({
      "9000_SUSPENSE_UNRECONCILED": 25_000,
      "1200_BANK": -25_000,
    });
  });

  it("posts M's credit side as DR 1200_BANK / CR Suspense", () => {
    const posting = postedOr(
      journalFor(
        exception(
          adjustmentObservation({ debit: 0 as never, credit: 25_000 as never }),
          "E12_ADJUSTMENT_UNEXPLAINED",
        ),
      ),
      "P8",
    );
    expect(movements(posting)).toEqual({
      "1200_BANK": 25_000,
      "9000_SUSPENSE_UNRECONCILED": -25_000,
    });
  });

  it("posts M and never ReconLine.amount", () => {
    // §17.2: "`ReconLine.amount` is deliberately left unconstrained on
    // adjustment rows"; the fixture sets it to 999_999 so a regression is loud.
    const posting = postedOr(
      journalFor(exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED")),
      "P8",
    );
    for (const line of posting.lines) {
      expect(line.dr_paise + line.cr_paise).toBe(25_000);
      expect(line.dr_paise + line.cr_paise).not.toBe(999_999);
    }
  });

  it("refuses a row on which M is not unique", () => {
    // §A.7 G-F: "a row with debit = 500 and credit = 97_000 has two candidates
    // for the non-zero one". Such a row is an E05/E06/E07 and posts nothing.
    expect(() =>
      journalFor(
        exception(
          adjustmentObservation({ debit: 500 as never, credit: 97_000 as never }),
          "E12_ADJUSTMENT_UNEXPLAINED",
        ),
      ),
    ).toThrow(/M is not unique/);
    expect(() =>
      journalFor(
        exception(
          adjustmentObservation({ debit: 0 as never, credit: 0 as never }),
          "E12_ADJUSTMENT_UNEXPLAINED",
        ),
      ),
    ).toThrow(/M is not unique/);
  });

  it("cannot be reached by any kind but `adjustment`", () => {
    // The universal catch-all is withdrawn (§A.7 G-F). E12 is keyed on the
    // adjustment kind, so every other kind is refused before construction.
    for (const observation of [
      paymentObservation(),
      settlementObservation(),
      bankLineObservation(),
      refundObservation(),
    ]) {
      expect(() =>
        journalFor(exception(observation, "E12_ADJUSTMENT_UNEXPLAINED")),
      ).toThrow(/§17.1.1 keys E12_ADJUSTMENT_UNEXPLAINED on adjustment/);
    }
  });

  it("an adjustment can never be ABSTAINED or RECONCILED", () => {
    expect(() =>
      journalFor(
        terminal(adjustmentObservation(), "ABSTAINED", { abstention_role: "MEMBER" }),
      ),
    ).toThrow(/sends every one of them to EXCEPTION/);
    expect(() => journalFor(terminal(adjustmentObservation(), "RECONCILED"))).toThrow(
      /never.*reported as RECONCILED/,
    );
  });
});

// ---------------------------------------------------------------------------
// The seven classes that post nothing, and the kinds that never post
// ---------------------------------------------------------------------------

describe("the seven non-posting exception classes", () => {
  const cases: readonly [ExceptionClass, ReturnType<typeof paymentObservation>, string][] =
    [
      ["E05_AMOUNT_MISMATCH", paymentObservation(), "INGEST_INVARIANT_FAILURE"],
      ["E06_FEE_MISMATCH", paymentObservation(), "INGEST_INVARIANT_FAILURE"],
      ["E07_GST_MISMATCH", paymentObservation(), "INGEST_INVARIANT_FAILURE"],
      ["E08_DUPLICATE_OBSERVATION", paymentObservation(), "DUPLICATE_OBSERVATION"],
      ["E10_REFUND_ORPHAN", refundEntityObservation(), "REFERENTIAL_FAILURE"],
      ["E11_TIMING_BOUNDARY", paymentObservation(), "TIMING_DEFERRAL"],
      ["E13_LEDGER_ONLY", ledgerEntryObservation(), "NO_ATTRIBUTABLE_KEY"],
    ];

  it.each(cases)("%s posts nothing", (cls, observation, ground) => {
    const decision = journalFor(exception(observation, cls));
    expect(decision.posts).toBe(false);
    expect(decision.lines).toEqual([]);
    expect(decision.posts === false && decision.ground).toBe(ground);
  });

  it("seven classes post and seven do not", () => {
    // §17.1.1: "Seven of the fourteen classes post and seven do not, and that
    // split is the honest reading of the evidence rather than a gap."
    const posting = new Set([
      "E01_MISSING_CAPTURE",
      "E02_MISSING_SETTLEMENT",
      "E03_BANK_CREDIT_UNMATCHED",
      "E04_SETTLEMENT_NOT_IN_BANK",
      "E09_DUPLICATE_BANK_CREDIT",
      "E12_ADJUSTMENT_UNEXPLAINED",
      "E14_UTR_COLLISION",
    ]);
    expect(posting.size).toBe(7);
    expect(EXCEPTION_CLASSES.filter((c) => !posting.has(c))).toHaveLength(7);
    expect(EXCEPTION_CLASSES).toHaveLength(14);
  });
});

describe("kinds that post nothing whatever their state", () => {
  it("E13 cannot move a PG-side control account — THREAT_MODEL.md §T5", () => {
    // "either would let an attacker-controlled ERP row move a PG-side control
    // account". Every state, every class.
    for (const cls of EXCEPTION_CLASSES) {
      const decision = journalFor(exception(ledgerEntryObservation(), cls));
      expect(decision.posts).toBe(false);
      expect(decision.lines).toEqual([]);
    }
    for (const state of ["RECONCILED", "ABSTAINED"] as const) {
      const decision = journalFor(
        terminal(ledgerEntryObservation(), state, {
          abstention_role: state === "ABSTAINED" ? "MEMBER" : null,
        }),
      );
      expect(decision.posts).toBe(false);
    }
  });

  it("a dispute posts nothing in any state", () => {
    for (const cls of EXCEPTION_CLASSES) {
      expect(journalFor(exception(disputeObservation(), cls)).posts).toBe(false);
    }
    expect(journalFor(terminal(disputeObservation(), "RECONCILED")).posts).toBe(false);
  });

  it("reference kinds never post — §10.1", () => {
    for (const observation of [paymentEntityObservation(), orderObservation()]) {
      const decision = journalFor(terminal(observation, "REFERENCE"));
      expect(decision.posts).toBe(false);
      expect(decision.posts === false && decision.ground).toBe("REFERENCE_KIND");
      expect(
        journalFor({ occasion: "INGEST", observation, ingest_valid: true }).posts,
      ).toBe(false);
    }
  });

  it("a settlement or bank line on the reconciled path is an aggregate view", () => {
    for (const observation of [settlementObservation(), bankLineObservation()]) {
      const decision = journalFor(terminal(observation, "RECONCILED"));
      expect(decision.posts).toBe(false);
      expect(decision.posts === false && decision.ground).toBe("AGGREGATE_VIEW");
    }
  });

  it("REFERENCE may not be assigned to a reconcilable kind — §L.1 rule 5", () => {
    for (const observation of [
      paymentObservation(),
      settlementObservation(),
      bankLineObservation(),
    ]) {
      expect(() => journalFor(terminal(observation, "REFERENCE"))).toThrow(
        /assigned statically from Observation.kind/,
      );
    }
  });

  it("nothing but a recon line posts at ingest", () => {
    for (const observation of [
      settlementObservation(),
      bankLineObservation(),
      adjustmentObservation(),
    ]) {
      const decision = journalFor({
        occasion: "INGEST",
        observation,
        ingest_valid: true,
      });
      expect(decision.posts).toBe(false);
      expect(decision.posts === false && decision.ground).toBe(
        "NO_TRIGGER_AT_THIS_OCCASION",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Line shape, ordering, and the invariants that belong at this boundary
// ---------------------------------------------------------------------------

const EVERY_POSTING: readonly PostingRequest[] = [
  { occasion: "INGEST", observation: paymentObservation(), ingest_valid: true },
  {
    occasion: "BANK_EVIDENCE",
    allocated_to: SETL_ID,
    observation: paymentObservation(),
    ingest_valid: true,
    bank_evidence: BANK_EVIDENCE,
  },
  { occasion: "INGEST", observation: refundObservation(), ingest_valid: true },
  {
    occasion: "BANK_EVIDENCE",
    allocated_to: SETL_ID,
    observation: refundObservation(),
    ingest_valid: true,
    bank_evidence: BANK_EVIDENCE,
  },
  exception(bankLineObservation(), "E03_BANK_CREDIT_UNMATCHED"),
  exception(settlementObservation(), "E04_SETTLEMENT_NOT_IN_BANK"),
  exception(adjustmentObservation(), "E12_ADJUSTMENT_UNEXPLAINED"),
];

describe("journal invariants, on every posting the table can produce", () => {
  it.each(EVERY_POSTING.map((r, i) => [i, r] as const))(
    "posting %i satisfies §16's line shape",
    (_i, request) => {
      const posting = postedOr(journalFor(request), "expected a posting");
      for (const line of posting.lines) {
        expect(Number.isSafeInteger(line.dr_paise)).toBe(true);
        expect(Number.isSafeInteger(line.cr_paise)).toBe(true);
        expect(line.dr_paise).toBeGreaterThanOrEqual(0);
        expect(line.cr_paise).toBeGreaterThanOrEqual(0);
        // "exactly one of dr/cr is non-zero"
        expect(line.dr_paise === 0).not.toBe(line.cr_paise === 0);
        expect(Object.keys(line).sort()).toEqual([
          "account",
          "cr_paise",
          "dr_paise",
          "memo_ref",
          "source_entity_id",
        ]);
      }
    },
  );

  it.each(EVERY_POSTING.map((r, i) => [i, r] as const))(
    "posting %i balances (I1 / G2)",
    (_i, request) => {
      const posting = postedOr(journalFor(request), "expected a posting");
      expect(posting.lines.reduce((a, l) => a + l.dr_paise, 0)).toBe(
        posting.lines.reduce((a, l) => a + l.cr_paise, 0),
      );
    },
  );

  it.each(EVERY_POSTING.map((r, i) => [i, r] as const))(
    "posting %i carries one item key on every leg",
    (_i, request) => {
      const posting = postedOr(journalFor(request), "expected a posting");
      for (const line of posting.lines) {
        expect(line.source_entity_id).toBe(posting.source_entity_id);
      }
      expect(posting.source_entity_id).toMatch(/^(pay_|rfnd_|adj_|setl_|bnk_)/);
    },
  );

  it.each(EVERY_POSTING.map((r, i) => [i, r] as const))(
    "posting %i names its rule in memo_ref, and touches no account twice",
    (_i, request) => {
      const posting = postedOr(journalFor(request), "expected a posting");
      for (const line of posting.lines) expect(line.memo_ref).toBe(posting.rule);
      const accounts = posting.lines.map((l) => l.account);
      expect(new Set(accounts).size).toBe(accounts.length);
    },
  );

  it("orders lines by ascending account code, on every posting", () => {
    for (const request of EVERY_POSTING) {
      const posting = postedOr(journalFor(request), "expected a posting");
      const accounts = posting.lines.map((l) => l.account);
      expect(accounts).toEqual([...accounts].sort());
    }
  });

  it("P2's four legs come out in ACCOUNT_CODES order", () => {
    const posting = postedOr(
      journalFor({
        occasion: "BANK_EVIDENCE",
        allocated_to: SETL_ID,
        observation: paymentObservation(),
        ingest_valid: true,
        bank_evidence: BANK_EVIDENCE,
      }),
      "P2",
    );
    expect(posting.lines.map((l) => l.account)).toEqual([
      "1100_GATEWAY_RECEIVABLE",
      "1200_BANK",
      "1300_GST_INPUT_CREDIT",
      "5100_PG_FEE_EXPENSE",
    ]);
  });

  it("refuses a posting whose every leg would be zero", () => {
    expect(() =>
      journalFor({
        occasion: "INGEST",
        observation: paymentObservation({
          amount: 0 as never,
          credit: 0 as never,
          fee: 0 as never,
          tax: 0 as never,
        }),
        ingest_valid: true,
      }),
    ).toThrow(/zero paise/);
  });
});
