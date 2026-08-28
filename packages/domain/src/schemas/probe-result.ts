import { z } from "zod";

import { PAYMENT_METHODS } from "./entities.js";
import {
  orderIdField,
  paymentIdField,
  refundIdField,
  settlementIdField,
} from "./primitives.js";

/**
 * `Evidence.detail` for `kind: "probe_result"` — supplied at spec 1.4.12.
 *
 * `DATA_MODEL.md §12` types `Evidence.detail` as `object` and annotates it
 * *"kind-specific, schema per kind"*. It supplies a schema for **none** of the
 * ten kinds. This module supplies the one kind whose consumers are already
 * named in frozen text, and no other.
 *
 * **Only `probe_result` is defined here, and the `Evidence` entity itself is
 * deliberately not implemented.** `§12`'s other nine kinds have no identified
 * consumers and no stated fields; declaring `Evidence` would force nine
 * invented detail schemas, which is exactly the invention `§12`'s silence
 * should not be repaired with. `ProbeResultDetail` stands alone until those
 * kinds are settled in their own governance cycles.
 *
 * **One variant per probe, and the probe set is closed.**
 * `RECONCILIATION_SPEC.md §6.2` declares five read-only probes and
 * `THREAT_MODEL.md §T7` calls them *"a **closed enum** of five read-only
 * operations"*. The union below has exactly five members for that reason; a
 * sixth would open an enum the threat model relies on being shut.
 *
 * **Every field is required by a named frozen consumer.** Nothing here is
 * added for symmetry or for a future reader's convenience:
 *
 * ```
 *   receipt                 SE2  (§4.2: "order_ref <-> receipt similarity")
 *   method                  SE4  (§6.2: "may supply method/card details")
 *   payment_id (result)     C2's referential half / E10_REFUND_ORPHAN
 *   constituent_entity_ids  SE5  (§6.2: "may supply constituent IDs directly")
 *   days                    C4   (§6.2: "relaxes C4 by a declared amount")
 *
 *   order_id / payment_id / refund_id / settlement_id  (arguments)
 *                           I6, via DECISION_BRIEF.md §L.1 rule 8: "Every
 *                           LLM-REFERENCED entity ID must exist in the
 *                           observation set (invariant I6), independently of
 *                           any allowlist check". R3 proposes the probe, so
 *                           its argument IS an LLM-referenced entity id, and
 *                           `Evidence.obs_ids` carries OBSERVATION ids rather
 *                           than entity ids -- so the entity id is not
 *                           recoverable from the evidence record otherwise.
 * ```
 *
 * **`date` is deliberately absent from the `fetch_settlement_recon` variant.**
 * `§6.2` names it as a probe **argument** — `fetch_settlement_recon(settlement_id,
 * date)` — and no frozen rule reads it back out of `Evidence.detail`; every
 * *"date-scoped"* statement in the corpus describes the recon **report** or the
 * endpoint, not a result field. `DATA_MODEL.md §22.1` D11 documents the external
 * endpoint as requiring `year` + `month` with an optional `day`, which is the
 * shape of a **query**, and no document states an ASSAY representation for it as
 * a value. Recording the call is the `PROBE` `LedgerEvent`'s job — `§16` gives it
 * `subject_ids` and `inputs_hash`, *"hash of everything the step read"* — so the
 * request lives there and the result lives here. Inventing a date type to carry
 * an argument nothing consumes would add a field no frozen consumer needs.
 *
 * **What this module does NOT decide.** `SE5`'s scope, its scoring function, its
 * multi-probe or member aggregation, and whether one probe result may feed two
 * signals are all open at spec 1.4.12. This is the schema `SE5` will read *from*;
 * it says nothing about what `SE5` computes.
 */

/** `RECONCILIATION_SPEC.md §6.2`'s closed probe enum, in the order it declares them. */
export const PROBE_KINDS = Object.freeze([
  "fetch_order",
  "fetch_payment",
  "fetch_refund",
  "fetch_settlement_recon",
  "widen_temporal_window",
] as const);

/** One of `§6.2`'s five probes. */
export type ProbeKind = (typeof PROBE_KINDS)[number];

/**
 * A payment method, derived from the frozen value set rather than re-spelled.
 *
 * `entities.ts` declares `PAYMENT_METHODS` and `ReconLine.method` /
 * `Payment.method` both read `z.enum(PAYMENT_METHODS)`; this is the same
 * const-tuple-to-type idiom `ExceptionClass` and `ObservationState` already use,
 * so the union cannot drift from the value set.
 */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const paymentMethodField = z.enum(PAYMENT_METHODS);

/**
 * `null` on a result field means **the probe ran and the referent yielded
 * nothing** — not that the probe was skipped.
 *
 * `§6.2`'s effects are all hedged (*"**May** supply `receipt`"*, *"**may**
 * resolve a refund's parent payment"*), and `ARCHITECTURE.md §5`'s worked
 * probe returns *"still no discriminator"*, so a ran-but-empty result is a
 * state the specification already contemplates and the schema has to carry.
 * A probe that never ran produces no `Evidence` row at all.
 */
export const FetchOrderResultSchema = z.strictObject({
  probe: z.literal("fetch_order"),
  order_id: orderIdField,
  receipt: z.string().min(1).nullable(),
});

export const FetchPaymentResultSchema = z.strictObject({
  probe: z.literal("fetch_payment"),
  payment_id: paymentIdField,
  method: paymentMethodField.nullable(),
});

export const FetchRefundResultSchema = z.strictObject({
  probe: z.literal("fetch_refund"),
  refund_id: refundIdField,
  payment_id: paymentIdField.nullable(),
});

/**
 * `constituent_entity_ids` are **entity** ids (`pay_… | rfnd_… | adj_…`), typed
 * as `ReconLine.entity_id` already is — `z.string().min(1)` — rather than as a
 * narrower union. `§6.2` says only *"constituent IDs"* and `§22.1` D10 keys the
 * recon report by `settlement_id`; neither names the id grammar, and the recon
 * report carries all three row types.
 *
 * An empty array is a legitimate result: the report may carry no line for that
 * settlement, which is `F08`'s premise from the merchant side.
 */
export const FetchSettlementReconResultSchema = z.strictObject({
  probe: z.literal("fetch_settlement_recon"),
  settlement_id: settlementIdField,
  constituent_entity_ids: z.array(z.string().min(1)).readonly(),
});

/**
 * `days` is a positive integer and **carries no upper bound here**.
 *
 * `THREAT_MODEL.md §T7` states that this probe *"has a hard bound and its use is
 * recorded on the decision"* — but **no document states the number**, and `§7`'s
 * frozen threshold block does not carry one. Asserting a bound in this schema
 * would invent a frozen constant; enforcing the one `§T7` promises belongs to
 * whichever stage relaxes `C4`, once the figure is ratified.
 */
export const WidenTemporalWindowResultSchema = z.strictObject({
  probe: z.literal("widen_temporal_window"),
  days: z.number().int().positive(),
});

/** `Evidence.detail` for `kind: "probe_result"` (`DATA_MODEL.md §12`, spec 1.4.12). */
export const ProbeResultDetailSchema = z.discriminatedUnion("probe", [
  FetchOrderResultSchema,
  FetchPaymentResultSchema,
  FetchRefundResultSchema,
  FetchSettlementReconResultSchema,
  WidenTemporalWindowResultSchema,
]);

export type ProbeResultDetail = z.infer<typeof ProbeResultDetailSchema>;

export type FetchOrderResult = z.infer<typeof FetchOrderResultSchema>;
export type FetchPaymentResult = z.infer<typeof FetchPaymentResultSchema>;
export type FetchRefundResult = z.infer<typeof FetchRefundResultSchema>;
export type FetchSettlementReconResult = z.infer<typeof FetchSettlementReconResultSchema>;
export type WidenTemporalWindowResult = z.infer<typeof WidenTemporalWindowResultSchema>;

/** Whether a string names one of `§6.2`'s five probes. */
export function isProbeKind(value: string): value is ProbeKind {
  return (PROBE_KINDS as readonly string[]).includes(value);
}
