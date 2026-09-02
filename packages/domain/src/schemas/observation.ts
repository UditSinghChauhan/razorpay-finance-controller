/**
 * `Observation` — everything entering the system, and the normative table that
 * says what may enter as what.
 *
 * `DATA_MODEL.md §10`: "Every kind has exactly one source and one payload type.
 * `ARCHITECTURE.md §6` requires that nothing enter the system anonymously; this
 * table is what makes that checkable. Ingest rejects any observation whose
 * `(kind, source_system, payload)` triple is not a row below."
 *
 * The table is expressed as a discriminated union on `kind`, so an unlisted
 * triple has no branch to parse against and is rejected structurally rather
 * than by a lookup someone could forget to call.
 */

import { z } from "zod";

import {
  BankStatementLineSchema,
  DisputeSchema,
  MerchantLedgerEntrySchema,
  OrderSchema,
  PaymentSchema,
  ReconLineSchema,
  RefundSchema,
  SettlementSchema,
} from "./entities.js";
import { observationIdField, sha256Field, unixSecondsField } from "./primitives.js";

/** The nine observation kinds (`§10`). */
export const OBSERVATION_KINDS = [
  "recon_line",
  "bank_line",
  "ledger_entry",
  "payment",
  "order",
  "refund",
  "settlement",
  "adjustment",
  "dispute",
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/**
 * The eight source systems (`§10`).
 *
 * `pg_settlements` and `pg_disputes` were added in spec 1.3.0. Benchmark v1.0.0
 * and v1.0.1 "declared six source systems against nine kinds, so `settlement`,
 * `adjustment` and `dispute` observations had no source they could carry — a
 * provenance gap, not a behavioural one".
 */
export const SOURCE_SYSTEMS = [
  "pg_recon",
  "bank_statement",
  "merchant_ledger",
  "pg_payments",
  "pg_orders",
  "pg_refunds",
  "pg_settlements",
  "pg_disputes",
] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

/**
 * Provenance fields carried by every observation.
 *
 * `ARCHITECTURE.md §4`: "Every record carries `source_system`, `source_file`,
 * `source_line`, `ingest_hash`. Nothing enters the system anonymously."
 */
const provenance = {
  obs_id: observationIdField,
  source_file: z.string().min(1),
  source_line: z.number().int().nonnegative(),
  ingest_hash: sha256Field,
  ingested_at: unixSecondsField,
} as const;

/**
 * A recon row that is a payment or a refund.
 *
 * `§10`'s table splits the recon report by row type: `type: "payment" |
 * "refund"` arrives as kind `recon_line`, and `type: "adjustment"` arrives as
 * kind `adjustment`. The two are different reconciliation obligations and post
 * differently (`§17.1` versus `§17.2`), so the split is load-bearing rather
 * than cosmetic.
 */
export const ReconLinePayloadSchema = ReconLineSchema.extend({
  type: z.enum(["payment", "refund"]),
});

/** A recon row that is an adjustment. */
export const AdjustmentPayloadSchema = ReconLineSchema.extend({
  type: z.literal("adjustment"),
});

/**
 * The normative `(kind, source_system, payload)` table.
 *
 * `Adjustment` is deliberately absent from the payload union. `§10`: "An
 * adjustment reaches ASSAY as a **recon-report row** ... The `Adjustment`
 * entity of §9, and with it `reason`, `direction` and `related_entity_id`, is
 * **true state only** and is never an observation."
 */
export const ObservationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...provenance,
    kind: z.literal("recon_line"),
    source_system: z.literal("pg_recon"),
    payload: ReconLinePayloadSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("adjustment"),
    source_system: z.literal("pg_recon"),
    payload: AdjustmentPayloadSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("bank_line"),
    source_system: z.literal("bank_statement"),
    payload: BankStatementLineSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("ledger_entry"),
    source_system: z.literal("merchant_ledger"),
    payload: MerchantLedgerEntrySchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("payment"),
    source_system: z.literal("pg_payments"),
    payload: PaymentSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("order"),
    source_system: z.literal("pg_orders"),
    payload: OrderSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("refund"),
    source_system: z.literal("pg_refunds"),
    payload: RefundSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("settlement"),
    source_system: z.literal("pg_settlements"),
    payload: SettlementSchema,
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("dispute"),
    source_system: z.literal("pg_disputes"),
    payload: DisputeSchema,
  }),
]);

export type Observation = z.infer<typeof ObservationSchema>;

/**
 * The one source system each kind may carry, as a lookup.
 *
 * Redundant with the union above and deliberately so: the union enforces the
 * rule, this table lets a reader and a test check the rule against `§10`
 * row by row without reverse-engineering a parser.
 */
export const KIND_SOURCE_SYSTEM = Object.freeze({
  recon_line: "pg_recon",
  adjustment: "pg_recon",
  bank_line: "bank_statement",
  ledger_entry: "merchant_ledger",
  payment: "pg_payments",
  order: "pg_orders",
  refund: "pg_refunds",
  settlement: "pg_settlements",
  dispute: "pg_disputes",
} as const satisfies Record<ObservationKind, SourceSystem>);

// ---------------------------------------------------------------------------
// §10.1 Reconcilable and reference kinds
// ---------------------------------------------------------------------------

/**
 * Kinds carrying an independent reconciliation obligation (`§10.1`).
 *
 * "Carries an independent claim about money that must be tied out. Reaches
 * `RECONCILED`, `ABSTAINED` or `EXCEPTION`. May post to the ledger."
 */
export const RECONCILABLE_KINDS = Object.freeze([
  "recon_line",
  "bank_line",
  "ledger_entry",
  "settlement",
  "refund",
  "adjustment",
  "dispute",
] as const satisfies readonly ObservationKind[]);

/**
 * Kinds that are contextual evidence rather than an obligation (`§10.1`).
 *
 * "Supporting evidence for matching a reconcilable observation. Reaches
 * `REFERENCE`. Never matched as a target, never posts a journal line, never
 * enters a coverage numerator or denominator, never contributes to
 * `unresolved_value_paise`."
 *
 * `REFERENCE` means "not a reconciliation target", never "not examined": a
 * reference observation still passes ingest validation, is still hashed into
 * the dataset, and is still available to stages S1–S4 as evidence.
 */
export const REFERENCE_KINDS = Object.freeze([
  "payment",
  "order",
] as const satisfies readonly ObservationKind[]);

/**
 * Whether `kind` carries an independent reconciliation obligation.
 *
 * The classification "is a property of the kind alone — it is fixed before any
 * run, identical for every agent, and never depends on a decision" (`§10.1`).
 * That is what stops `REFERENCE` becoming a drop path for an observation the
 * engine failed to explain (`RECONCILIATION_SPEC.md §9`).
 */
export function isReconcilableKind(kind: ObservationKind): boolean {
  return (RECONCILABLE_KINDS as readonly ObservationKind[]).includes(kind);
}

/** Whether `kind` is a reference kind, assigned `REFERENCE` statically at ingest. */
export function isReferenceKind(kind: ObservationKind): boolean {
  return (REFERENCE_KINDS as readonly ObservationKind[]).includes(kind);
}

/**
 * The observation's **own business identifier** — `§16`'s *"the identifier of the
 * observation whose obligation the posting records"*.
 *
 * `§16` requires `JournalLine.source_entity_id` to be *"a business identifier
 * drawn from the observation set, never an ASSAY-internal handle"*, and `§12`
 * (register row `§22.2` **M28**) fixes the relation between that identifier and
 * the observation: *"the corresponding observation is the one whose
 * `payload.entity_id` equals that `entity_id`"*, one-to-one on a conforming
 * dataset because `PREREGISTRATION.md §4.3`'s only duplication operator,
 * `DUPLICATE_ROW`, is scoped to `bank_line`.
 *
 * The field carrying it differs by kind because the payload types do — a recon
 * row names its economic entity `entity_id`, a bank line names itself
 * `bank_line_id`, and the Razorpay entities name themselves `id`. **This is a
 * read of the schema table above, not a mapping invented here**, which is why it
 * lives beside `§10.1`'s classification rather than in a caller.
 *
 * **It is deliberately total and deliberately not narrowed.** A reference kind
 * still has an identifier (`pay_…`, `order_…`); whether that identifier may
 * appear on a journal line is `§16`'s separate question, answered by
 * {@link isSourceEntityId}. Collapsing the two here would hide from a caller
 * that a `payment` observation carries a well-formed `pay_…` and still posts
 * nothing (`§10.1`, `EVALUATION_SPEC.md §4.4`).
 *
 * Declared here at spec 1.4.33 as the single definition of a rule that three
 * modules had transcribed independently (`DATA_MODEL.md §22.2` **M55**'s
 * implementation); `apps/cli`'s agents and `packages/eval`'s scorer now read it
 * from one place, so the two journals cannot come to disagree about what keys
 * them.
 */
export function entityIdOf(observation: Observation): string {
  switch (observation.kind) {
    case "recon_line":
    case "adjustment":
      return observation.payload.entity_id;
    case "bank_line":
      return observation.payload.bank_line_id;
    case "ledger_entry":
      return observation.payload.ledger_entry_id;
    default:
      return observation.payload.id;
  }
}
