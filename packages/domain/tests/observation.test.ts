import { describe, expect, it } from "vitest";

import {
  KIND_SOURCE_SYSTEM,
  OBSERVATION_KINDS,
  ObservationSchema,
  RECONCILABLE_KINDS,
  REFERENCE_KINDS,
  SOURCE_SYSTEMS,
  entityIdOf,
  isReconcilableKind,
  isReferenceKind,
  isSourceEntityId,
  type ObservationKind,
  type SourceSystem,
} from "@assay/domain";

import {
  ADJ_ID,
  BNK_ID,
  DISP_ID,
  MLE_ID,
  ORDER_ID,
  PAY_ID,
  RFND_ID,
  SETL_ID,
  provenance,
  validAdjustment,
  validAdjustmentLine,
  validBankLine,
  validDispute,
  validLedgerEntry,
  validOrder,
  validPayment,
  validReconLine,
  validRefund,
  validSettlement,
} from "./fixtures.js";

/** One valid payload per kind, matching the §10 table. */
const PAYLOAD: Record<ObservationKind, () => unknown> = {
  recon_line: validReconLine,
  adjustment: validAdjustmentLine,
  bank_line: validBankLine,
  ledger_entry: validLedgerEntry,
  payment: validPayment,
  order: validOrder,
  refund: validRefund,
  settlement: validSettlement,
  dispute: validDispute,
};

const observation = (
  kind: ObservationKind,
  source_system: SourceSystem,
  payload: unknown,
) => ({ ...provenance(), kind, source_system, payload });

describe("the (kind, source_system, payload) table is normative", () => {
  it("declares nine kinds and eight source systems", () => {
    expect(OBSERVATION_KINDS).toHaveLength(9);
    expect(SOURCE_SYSTEMS).toHaveLength(8);
  });

  it("accepts every row of the table", () => {
    for (const kind of OBSERVATION_KINDS) {
      const parsed = ObservationSchema.safeParse(
        observation(kind, KIND_SOURCE_SYSTEM[kind], PAYLOAD[kind]()),
      );
      expect(parsed.success, `${kind} should parse`).toBe(true);
    }
  });

  it("rejects every off-table (kind, source_system) pair", () => {
    // §10: "Ingest rejects any observation whose (kind, source_system,
    // payload) triple is not a row below." ARCHITECTURE.md §6 requires that
    // nothing enter the system anonymously; this is what makes it checkable.
    let rejected = 0;
    for (const kind of OBSERVATION_KINDS) {
      for (const source of SOURCE_SYSTEMS) {
        if (source === KIND_SOURCE_SYSTEM[kind]) continue;
        const parsed = ObservationSchema.safeParse(
          observation(kind, source, PAYLOAD[kind]()),
        );
        expect(parsed.success, `${kind} must not accept ${source}`).toBe(false);
        rejected += 1;
      }
    }
    // 9 kinds x 8 sources, minus the 9 legal rows.
    expect(rejected).toBe(9 * 8 - 9);
  });

  it("rejects a payload of the wrong type for its kind", () => {
    expect(
      ObservationSchema.safeParse(
        observation("bank_line", "bank_statement", validPayment()),
      ).success,
    ).toBe(false);
    expect(
      ObservationSchema.safeParse(
        observation("payment", "pg_payments", validBankLine()),
      ).success,
    ).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(
      ObservationSchema.safeParse({
        ...provenance(),
        kind: "invented_kind",
        source_system: "pg_recon",
        payload: validReconLine(),
      }).success,
    ).toBe(false);
  });
});

describe("the recon report is split by row type", () => {
  it("routes payment and refund rows to recon_line", () => {
    for (const type of ["payment", "refund"] as const) {
      const payload =
        type === "payment"
          ? validReconLine()
          : { ...validReconLine(), type, debit: 2_100, credit: 0, fee: 0, tax: 0 };
      expect(
        ObservationSchema.safeParse(observation("recon_line", "pg_recon", payload))
          .success,
      ).toBe(true);
    }
  });

  it("refuses an adjustment row under kind recon_line", () => {
    expect(
      ObservationSchema.safeParse(
        observation("recon_line", "pg_recon", validAdjustmentLine()),
      ).success,
    ).toBe(false);
  });

  it("refuses a payment row under kind adjustment", () => {
    expect(
      ObservationSchema.safeParse(
        observation("adjustment", "pg_recon", validReconLine()),
      ).success,
    ).toBe(false);
  });
});

describe("the Adjustment entity is never an observation", () => {
  it("cannot be carried as a payload under any kind or source", () => {
    // §10: "Adjustment is deliberately absent from the payload union ... the
    // Adjustment entity of §9, and with it reason, direction and
    // related_entity_id, is true state only." §17.2 and C2 both rest on this
    // information boundary.
    for (const kind of OBSERVATION_KINDS) {
      for (const source of SOURCE_SYSTEMS) {
        expect(
          ObservationSchema.safeParse(observation(kind, source, validAdjustment()))
            .success,
        ).toBe(false);
      }
    }
  });

  it("keeps reason and direction off the observable adjustment row", () => {
    const row = validAdjustmentLine() as Record<string, unknown>;
    expect(row["reason"]).toBeUndefined();
    expect(row["direction"]).toBeUndefined();
    expect(row["related_entity_id"]).toBeUndefined();
    // direction is recoverable, because I3 guarantees exactly one of
    // debit/credit is non-zero on such a row (§9). reason is not.
    expect((row["debit"] === 0) !== (row["credit"] === 0)).toBe(true);
  });
});

describe("provenance is mandatory", () => {
  for (const field of ["obs_id", "source_file", "source_line", "ingest_hash", "ingested_at"]) {
    it(`rejects an observation missing ${field}`, () => {
      const obs = observation("bank_line", "bank_statement", validBankLine()) as Record<
        string,
        unknown
      >;
      delete obs[field];
      expect(ObservationSchema.safeParse(obs).success).toBe(false);
    });
  }

  it("rejects a malformed ingest hash", () => {
    const obs = observation("bank_line", "bank_statement", validBankLine());
    expect(
      ObservationSchema.safeParse({ ...obs, ingest_hash: "A".repeat(64) }).success,
    ).toBe(false);
    expect(
      ObservationSchema.safeParse({ ...obs, ingest_hash: "a".repeat(63) }).success,
    ).toBe(false);
  });
});

describe("§10.1 reconcilable and reference classification", () => {
  it("classifies every kind exactly once", () => {
    expect([...RECONCILABLE_KINDS, ...REFERENCE_KINDS].sort()).toEqual(
      [...OBSERVATION_KINDS].sort(),
    );
    for (const kind of OBSERVATION_KINDS) {
      expect(isReconcilableKind(kind)).toBe(!isReferenceKind(kind));
    }
  });

  it("names exactly the seven reconcilable kinds", () => {
    expect([...RECONCILABLE_KINDS].sort()).toEqual([
      "adjustment",
      "bank_line",
      "dispute",
      "ledger_entry",
      "recon_line",
      "refund",
      "settlement",
    ]);
  });

  it("names payment and order as the only reference kinds", () => {
    expect([...REFERENCE_KINDS].sort()).toEqual(["order", "payment"]);
  });

  it("is a property of the kind alone, with no decision input", () => {
    // §10.1: "fixed before any run, identical for every agent, and never
    // depends on a decision." That is what stops REFERENCE becoming a drop
    // path for an observation the engine failed to explain.
    expect(isReconcilableKind).toHaveLength(1);
    expect(isReferenceKind).toHaveLength(1);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(RECONCILABLE_KINDS)).toBe(true);
    expect(Object.isFrozen(REFERENCE_KINDS)).toBe(true);
    expect(Object.isFrozen(KIND_SOURCE_SYSTEM)).toBe(true);
  });
});


/**
 * `entityIdOf` — `§16`'s *"the identifier of the observation whose obligation
 * the posting records"*, and the one definition of it (spec 1.4.33, register row
 * `§22.2` M55's implementation).
 *
 * The rule was transcribed independently in `apps/cli/src/agents/assay.ts`,
 * `apps/cli/src/agents/b0.ts` and would have been a third time in
 * `packages/eval/src/metrics/robustness.ts`. The table below is the semantics all
 * three carried, asserted once here so the copies cannot come back and diverge.
 */
describe("§16 — entityIdOf, the observation's own business identifier", () => {
  /** The field the §10 payload table names for each kind, and the id it holds. */
  const EXPECTED: Record<ObservationKind, string> = {
    recon_line: PAY_ID,
    adjustment: ADJ_ID,
    bank_line: BNK_ID,
    ledger_entry: MLE_ID,
    payment: PAY_ID,
    order: ORDER_ID,
    refund: RFND_ID,
    settlement: SETL_ID,
    dispute: DISP_ID,
  };

  it("reads the identifier the §10 table gives each of the nine kinds", () => {
    for (const kind of OBSERVATION_KINDS) {
      const parsed = ObservationSchema.parse(
        observation(kind, KIND_SOURCE_SYSTEM[kind], PAYLOAD[kind]()),
      );
      expect(entityIdOf(parsed), kind).toBe(EXPECTED[kind]);
    }
  });

  it("is total over the nine kinds and never returns an obs_id", () => {
    // §16: "a business identifier drawn from the observation set, never an
    // ASSAY-internal handle" -- so `obs_` must never be the answer.
    for (const kind of OBSERVATION_KINDS) {
      const parsed = ObservationSchema.parse(
        observation(kind, KIND_SOURCE_SYSTEM[kind], PAYLOAD[kind]()),
      );
      const id = entityIdOf(parsed);
      expect(id.length, kind).toBeGreaterThan(0);
      expect(id.startsWith("obs_"), kind).toBe(false);
      expect(id, kind).not.toBe(parsed.obs_id);
    }
  });

  it("reproduces the switch the two agent modules carried, branch for branch", () => {
    // The retired local copies, restated as a table: recon_line and adjustment
    // read payload.entity_id, bank_line reads payload.bank_line_id,
    // ledger_entry reads payload.ledger_entry_id, and every other kind reads
    // payload.id. Identical semantics is the condition of the refactor.
    const fieldOf: Record<ObservationKind, string> = {
      recon_line: "entity_id",
      adjustment: "entity_id",
      bank_line: "bank_line_id",
      ledger_entry: "ledger_entry_id",
      payment: "id",
      order: "id",
      refund: "id",
      settlement: "id",
      dispute: "id",
    };
    for (const kind of OBSERVATION_KINDS) {
      const parsed = ObservationSchema.parse(
        observation(kind, KIND_SOURCE_SYSTEM[kind], PAYLOAD[kind]()),
      );
      const payload = parsed.payload as Record<string, unknown>;
      expect(entityIdOf(parsed), kind).toBe(payload[fieldOf[kind]]);
    }
  });

  it("gives a reference kind a well-formed identifier that §16 still refuses", () => {
    // The two structural zeros M55 keeps apart. A `payment` carries a `pay_...`,
    // which IS in §16's grammar -- so only §10.1's classification decides it.
    // An `order` carries an `order_...`, which the grammar itself refuses.
    const paymentObs = ObservationSchema.parse(
      observation("payment", KIND_SOURCE_SYSTEM.payment, validPayment()),
    );
    const orderObs = ObservationSchema.parse(
      observation("order", KIND_SOURCE_SYSTEM.order, validOrder()),
    );
    expect(isReferenceKind(paymentObs.kind)).toBe(true);
    expect(isSourceEntityId(entityIdOf(paymentObs))).toBe(true);
    expect(isReferenceKind(orderObs.kind)).toBe(true);
    expect(isSourceEntityId(entityIdOf(orderObs))).toBe(false);
  });

  it("gives ledger_entry and dispute identifiers §16's grammar refuses", () => {
    // §17.1.1 reasons from exactly this: the grammar "admits no mle_... or
    // disp_..., so truth posts no line attributable to either kind" -- even
    // though §10.1 makes both reconcilable.
    for (const kind of ["ledger_entry", "dispute"] as const) {
      const parsed = ObservationSchema.parse(
        observation(kind, KIND_SOURCE_SYSTEM[kind], PAYLOAD[kind]()),
      );
      expect(isReconcilableKind(kind), kind).toBe(true);
      expect(isSourceEntityId(entityIdOf(parsed)), kind).toBe(false);
    }
  });
});
