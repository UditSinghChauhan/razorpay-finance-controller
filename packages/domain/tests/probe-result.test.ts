import { describe, expect, it } from "vitest";

import {
  PAYMENT_METHODS,
  PROBE_KINDS,
  ProbeResultDetailSchema,
  isProbeKind,
} from "@assay/domain";

/**
 * `Evidence.detail` for `kind: "probe_result"` (`DATA_MODEL.md §12`, spec 1.4.12).
 *
 * These tests pin the two properties the amendment exists to establish: that the
 * union covers `RECONCILIATION_SPEC.md §6.2`'s **closed** five-probe enum exactly,
 * and that **every field is one a named frozen consumer reads** — no more. The
 * negative assertions matter more than the positive ones here: a schema that
 * silently accepted `date`, or `card_network`, or a sixth probe, would be the
 * failure this module was written to prevent.
 */

const ORDER = `order_${"a".repeat(14)}`;
const PAY = `pay_${"b".repeat(14)}`;
const RFND = `rfnd_${"c".repeat(14)}`;
const SETL = `setl_${"d".repeat(14)}`;

describe("the probe enum is closed at §6.2's five", () => {
  it("has exactly the five probes, in the specification's order", () => {
    expect(PROBE_KINDS).toEqual([
      "fetch_order",
      "fetch_payment",
      "fetch_refund",
      "fetch_settlement_recon",
      "widen_temporal_window",
    ]);
  });

  it("is frozen, and rejects anything outside the enum", () => {
    expect(Object.isFrozen(PROBE_KINDS)).toBe(true);
    for (const v of ["fetch_ledger_entry", "fetch_settlement", "", "FETCH_ORDER"]) {
      expect(isProbeKind(v)).toBe(false);
    }
    // THREAT_MODEL §T7 rests on the enum being shut; a sixth variant must not
    // parse, or the "closed enum of five read-only operations" is not closed.
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_ledger_entry", memo: "x" }).success,
    ).toBe(false);
  });
});

describe("each variant carries exactly its consumer's fields", () => {
  it("fetch_order → SE2 reads receipt", () => {
    const ok = ProbeResultDetailSchema.parse({
      probe: "fetch_order",
      order_id: ORDER,
      receipt: "INV-202607-00042",
    });
    expect(ok).toMatchObject({ probe: "fetch_order", receipt: "INV-202607-00042" });
  });

  it("fetch_payment → SE4 reads method, drawn from the frozen value set", () => {
    for (const method of PAYMENT_METHODS) {
      expect(
        ProbeResultDetailSchema.safeParse({ probe: "fetch_payment", payment_id: PAY, method })
          .success,
      ).toBe(true);
    }
    expect(
      ProbeResultDetailSchema.safeParse({
        probe: "fetch_payment",
        payment_id: PAY,
        method: "paylater",
      }).success,
    ).toBe(false);
  });

  it("fetch_refund → C2/E10 read the parent payment_id", () => {
    const ok = ProbeResultDetailSchema.parse({
      probe: "fetch_refund",
      refund_id: RFND,
      payment_id: PAY,
    });
    expect(ok).toMatchObject({ probe: "fetch_refund", payment_id: PAY });
  });

  it("fetch_settlement_recon → constituent ids, and an empty list is legitimate", () => {
    const ok = ProbeResultDetailSchema.parse({
      probe: "fetch_settlement_recon",
      settlement_id: SETL,
      constituent_entity_ids: [PAY, RFND],
    });
    expect(ok).toMatchObject({ constituent_entity_ids: [PAY, RFND] });
    // The report may carry no line for that settlement — F08's premise from the
    // merchant side — so [] is a result, not a parse failure.
    expect(
      ProbeResultDetailSchema.safeParse({
        probe: "fetch_settlement_recon",
        settlement_id: SETL,
        constituent_entity_ids: [],
      }).success,
    ).toBe(true);
  });

  it("widen_temporal_window → C4 reads days, a positive integer", () => {
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "widen_temporal_window", days: 2 }).success,
    ).toBe(true);
    for (const days of [0, -1, 1.5]) {
      expect(
        ProbeResultDetailSchema.safeParse({ probe: "widen_temporal_window", days }).success,
      ).toBe(false);
    }
  });

  it("does NOT bound days — THREAT_MODEL §T7 promises a bound no document states", () => {
    // §T7: the probe "has a hard bound and its use is recorded on the decision",
    // but §7's frozen threshold block carries no figure. Asserting one here
    // would invent a frozen constant; enforcement belongs to whoever relaxes C4
    // once the number is ratified. This test records the deliberate absence.
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "widen_temporal_window", days: 3650 }).success,
    ).toBe(true);
  });
});

describe("a probe that ran and found nothing is representable", () => {
  it("accepts null on every hedged result field", () => {
    // §6.2 hedges each effect — "MAY supply receipt", "MAY resolve a refund's
    // parent payment" — and ARCHITECTURE.md §5's worked probe returns "still no
    // discriminator", so ran-but-empty is a state the schema must carry. A probe
    // that never ran produces no Evidence row at all, which is a different thing.
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_order", order_id: ORDER, receipt: null })
        .success,
    ).toBe(true);
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_payment", payment_id: PAY, method: null })
        .success,
    ).toBe(true);
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_refund", refund_id: RFND, payment_id: null })
        .success,
    ).toBe(true);
  });

  it("still requires the argument id, which I6 checks", () => {
    // DECISION_BRIEF §L.1 rule 8: "Every LLM-referenced entity ID must exist in
    // the observation set (invariant I6)". R3 proposes the probe, so the
    // argument is an LLM-referenced id and cannot be dropped when the result is
    // empty — Evidence.obs_ids carries OBSERVATION ids, not entity ids.
    expect(ProbeResultDetailSchema.safeParse({ probe: "fetch_order", receipt: null }).success).toBe(
      false,
    );
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_payment", method: null }).success,
    ).toBe(false);
  });

  it("rejects a malformed argument id rather than coercing it", () => {
    expect(
      ProbeResultDetailSchema.safeParse({ probe: "fetch_order", order_id: PAY, receipt: null })
        .success,
    ).toBe(false);
  });
});

describe("fields no frozen consumer needs are absent", () => {
  it("rejects `date` on fetch_settlement_recon — spec 1.4.12's deliberate omission", () => {
    // §6.2 names `date` as a probe ARGUMENT. No frozen rule reads it back out of
    // Evidence.detail; every "date-scoped" statement in the corpus describes the
    // recon REPORT or the endpoint. §22.1 D11 documents the endpoint as
    // year+month with an optional day — the shape of a QUERY — and no document
    // states an ASSAY representation for it as a value. The PROBE LedgerEvent
    // logs the call via subject_ids and inputs_hash. `strict` makes the omission
    // enforced rather than merely intended.
    expect(
      ProbeResultDetailSchema.safeParse({
        probe: "fetch_settlement_recon",
        settlement_id: SETL,
        constituent_entity_ids: [],
        date: 1_783_000_000,
      }).success,
    ).toBe(false);
  });

  it("rejects `card_network` on fetch_payment — no consumer, and no Payment-side field", () => {
    // Spec 1.1.1 corrected the card attributes onto ReconLine "when they are
    // settlement-recon columns", so PaymentSchema carries none and a probe
    // cannot return one. SE4 is expected-non-binding at spec 1.4.11 partly for
    // this reason.
    expect(
      ProbeResultDetailSchema.safeParse({
        probe: "fetch_payment",
        payment_id: PAY,
        method: "card",
        card_network: "Visa",
      }).success,
    ).toBe(false);
  });

  it("rejects a generic catch-all payload on any variant", () => {
    expect(
      ProbeResultDetailSchema.safeParse({
        probe: "fetch_order",
        order_id: ORDER,
        receipt: null,
        raw: { anything: true },
      }).success,
    ).toBe(false);
  });
});
