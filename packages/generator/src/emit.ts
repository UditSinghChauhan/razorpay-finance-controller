/**
 * True state -> observations, and the quarantine boundary.
 *
 * Emission is where the generator crosses `ARCHITECTURE.md §4` boundary 1 from
 * the inside. Three things happen here and nothing else does:
 *
 *   1. Each true-state record becomes an `Observation` carrying **structural
 *      fields only**, validated against the frozen schema.
 *   2. Free text is split off into `UntrustedText`. `DATA_MODEL.md §0` rule 4:
 *      "Untrusted text is never a field on a structural record." `receipt`,
 *      `narration` and `memo` exist in the true state and leave through this
 *      door alone; `OrderSchema` carries no `receipt` field and strict mode
 *      rejects one, so the quarantine is structural rather than remembered.
 *   3. `F05`'s withholding. `§4.2`: "selection and removal occur at EMISSION,
 *      after the true state is complete and BEFORE any degradation operator
 *      runs. No operator ever observes the gap and none can widen it."
 *
 * **No degradation happens here** — that is `degrade.ts`, and `§4.3` confines it
 * to observations, never the true state.
 */

import {
  ObservationSchema, type Observation, type CanonicalValue,
} from "@assay/domain";
import { UntrustedTextSchema, sanitizeForPreview, type UntrustedText } from "@assay/domain/untrusted-text";
import { hashCanonical } from "@assay/ledger";
import { paise } from "@assay/money";

import { F05_SELECTED_SETTLEMENTS } from "./composition.js";
import { EMISSION_KIND_ORDER, SOURCE_FILES } from "./conventions.js";
import { FAMILY_MECHANICS } from "./families.js";
import { POSTED_AT } from "./frozen.js";
import { Minter } from "./mint.js";
import { PERIOD_TO } from "./period.js";
import { STREAMS, substream } from "./prng.js";
import { settlementsByMember, type TrueState } from "./simulate.js";

/** An observation plus the free text stripped from it. */
export interface Emission {
  readonly observations: readonly Observation[];
  readonly untrusted_text: readonly UntrustedText[];
  /** `F05`: the `pay_…` whose `recon_line` was withheld, per selected settlement. */
  readonly withheld_recon_lines: readonly string[];
}

/** A record before provenance is stamped on it. */
interface Draft {
  readonly kind: Observation["kind"];
  readonly payload: Record<string, unknown>;
  /** Free text belonging to this record, stripped before the payload is built. */
  readonly text: readonly { field: UntrustedText["field"]; raw: string }[];
}

export function emit(state: TrueState): Emission {
  const mechanics = FAMILY_MECHANICS[state.family_id];
  const minter = new Minter(substream(state.seed, state.family_id, STREAMS.ID_OBS));
  const f05 = substream(state.seed, state.family_id, STREAMS.F05);

  // The same inversion `recon-report.ts` reads, so the `settlement_id` and
  // `settled_at` an observation carries and the ones the `§6.2` report carries
  // cannot drift apart. Built once, in `simulate.ts`, beside the type it reads.
  const {
    payment: settlementOfPayment,
    refund: settlementOfRefund,
    adjustment: settlementOfAdjustment,
  } = settlementsByMember(state);

  // --- F05: which recon lines are withheld (§4.2) --------------------------
  const withheld = new Set<number>();
  const withheldIds: string[] = [];
  if (mechanics.f05_withhold) {
    for (const position of f05.sample(state.settlements.length, F05_SELECTED_SETTLEMENTS)) {
      const settlement = state.settlements[position];
      /* c8 ignore next */
      if (settlement === undefined) throw new Error("emit: F05 selected a settlement out of range");
      const constituents = settlement.members.filter((m) => m.kind === "payment").map((m) => m.index);
      if (constituents.length === 0) {
        /* c8 ignore next 4 */
        throw new Error(
          `emit: F05 selected settlement ${settlement.id}, which has no payment constituent to ` +
            `withhold. §4.2 removes "exactly ONE constituent recon_line observation per selected settlement".`,
        );
      }
      const chosen = constituents[f05.below(constituents.length)];
      /* c8 ignore next */
      if (chosen === undefined) throw new Error("emit: F05 constituent index out of range");
      withheld.add(chosen);
      const payment = state.payments[chosen];
      /* c8 ignore next */
      if (payment === undefined) throw new Error("emit: F05 payment index out of range");
      withheldIds.push(payment.id);
    }
  }

  // --- drafts, by kind ------------------------------------------------------
  const drafts = new Map<Observation["kind"], Draft[]>(
    EMISSION_KIND_ORDER.map((kind) => [kind, [] as Draft[]]),
  );
  const push = (draft: Draft): void => {
    const bucket = drafts.get(draft.kind);
    /* c8 ignore next */
    if (bucket === undefined) throw new Error(`emit: no bucket for kind ${draft.kind}`);
    bucket.push(draft);
  };

  for (const order of state.orders) {
    push({
      kind: "order",
      // `receipt` and `notes` are QUARANTINED (§3). They are not in this payload.
      payload: {
        id: order.id, entity: "order", amount: order.amount, amount_paid: order.amount_paid,
        amount_due: order.amount_due, currency: "INR", status: order.status, attempts: 1,
        created_at: order.created_at,
      },
      text: [{ field: "order_receipt", raw: order.receipt }],
    });
  }

  for (const payment of state.payments) {
    const status = !payment.captured ? "authorized" : payment.refunded_paise > 0 ? "refunded" : "captured";
    push({
      kind: "payment",
      payload: {
        id: payment.id, entity: "payment", amount: payment.amount, currency: "INR", status,
        order_id: state.orders[payment.order_index]?.id ?? null, method: payment.method,
        captured: payment.captured, amount_refunded: payment.refunded_paise,
        created_at: payment.created_at,
      },
      text: [],
    });
  }

  for (const payment of state.payments) {
    if (!payment.captured || payment.fee === null) continue;
    if (withheld.has(payment.index)) continue; // F05: the row is absent, not corrupt.
    const settlement = settlementOfPayment.get(payment.index);
    const dispute = payment.dispute_index === null ? null : state.disputes[payment.dispute_index];
    push({
      kind: "recon_line",
      payload: {
        entity_id: payment.id, type: "payment", debit: paise(0), credit: payment.fee.credit,
        amount: payment.amount, currency: "INR", fee: payment.fee.fee, tax: payment.fee.tax,
        on_hold: false, settled: settlement !== undefined, created_at: payment.created_at,
        settled_at: settlement?.settled_at ?? null, settlement_id: settlement?.id ?? null,
        posted_at: POSTED_AT, credit_type: "default",
        payment_id: null, // [RZP-DOC] D14: null for payment rows.
        settlement_utr: settlement?.utr ?? null,
        order_id: state.orders[payment.order_index]?.id ?? null,
        method: payment.method,
        card_network: payment.card?.network ?? null,
        card_issuer: payment.card?.issuer ?? null,
        card_type: payment.card?.type ?? null,
        dispute_id: dispute?.id ?? null,
      },
      text: [],
    });
  }

  for (const refund of state.refunds) {
    const payment = state.payments[refund.payment_index];
    /* c8 ignore next */
    if (payment === undefined) throw new Error("emit: refund references an unknown payment");
    const settlement = settlementOfRefund.get(refund.index);
    push({
      kind: "recon_line",
      payload: {
        entity_id: refund.id, type: "refund",
        // I3: `debit = amount` on a refund row, `credit = 0`, `fee = tax = 0`.
        debit: refund.amount, credit: paise(0), amount: refund.amount, currency: "INR",
        fee: paise(0), tax: paise(0), on_hold: false, settled: settlement !== undefined,
        created_at: refund.created_at, settled_at: settlement?.settled_at ?? null,
        settlement_id: settlement?.id ?? null, posted_at: POSTED_AT, credit_type: "default",
        payment_id: payment.id, // [RZP-DOC] D14: set for refund rows.
        settlement_utr: settlement?.utr ?? null,
        order_id: state.orders[payment.order_index]?.id ?? null,
        method: payment.method,
        card_network: payment.card?.network ?? null,
        card_issuer: payment.card?.issuer ?? null,
        card_type: payment.card?.type ?? null,
        dispute_id: null,
      },
      text: [],
    });
    push({
      kind: "refund",
      payload: {
        id: refund.id, entity: "refund", amount: refund.amount, currency: "INR",
        payment_id: payment.id, status: "processed",
        // [RZP-DOC] both speed fields "appear only when `speed` was set on the request".
        speed_requested: null, speed_processed: null, created_at: refund.created_at,
      },
      text: [],
    });
  }

  for (const adjustment of state.adjustments) {
    const settlement = settlementOfAdjustment.get(adjustment.index);
    const dispute = adjustment.dispute_index === null ? null : state.disputes[adjustment.dispute_index];
    const M = adjustment.amount;
    push({
      kind: "adjustment",
      payload: {
        entity_id: adjustment.id, type: "adjustment",
        // I3: "exactly one of debit/credit is non-zero" — the only identity the
        // specification declares for an adjustment row.
        debit: adjustment.direction === "debit" ? M : paise(0),
        credit: adjustment.direction === "credit" ? M : paise(0),
        amount: M, // conventions.ts U-ADJ-AMOUNT
        currency: "INR", fee: paise(0), tax: paise(0), on_hold: false,
        settled: settlement !== undefined, created_at: adjustment.created_at,
        settled_at: settlement?.settled_at ?? null, settlement_id: settlement?.id ?? null,
        posted_at: POSTED_AT, credit_type: "default", payment_id: null,
        settlement_utr: settlement?.utr ?? null, order_id: null, method: null,
        card_network: null, card_issuer: null, card_type: null,
        dispute_id: dispute?.id ?? null,
      },
      text: [],
    });
  }

  for (const settlement of state.settlements) {
    push({
      kind: "settlement",
      payload: {
        id: settlement.id, entity: "settlement", amount: settlement.amount, status: "processed",
        // [RZP-DOC] D7: 0 for every normal settlement. These carry the
        // instant-settlement service charge, which ASSAY does not model.
        fees: paise(0), tax: paise(0), utr: settlement.utr,
        created_at: settlement.settled_at,
      },
      text: [],
    });
  }

  for (const line of state.bank_lines) {
    push({
      kind: "bank_line",
      payload: {
        bank_line_id: line.id, value_date: line.value_date, amount: line.amount,
        direction: "credit", running_balance: null, bank_ref: line.bank_ref,
      },
      text: [{ field: "narration", raw: line.narration }],
    });
  }

  for (const entry of state.ledger_entries) {
    push({
      kind: "ledger_entry",
      payload: {
        ledger_entry_id: entry.id, booked_at: entry.booked_at, order_ref: entry.order_ref,
        invoice_no: entry.invoice_no, gross_paise: entry.gross_paise,
        expected_net_paise: entry.expected_net_paise, gl_account: entry.gl_account,
      },
      text: [{ field: "memo", raw: entry.memo }],
    });
  }

  for (const dispute of state.disputes) {
    push({
      kind: "dispute",
      payload: {
        id: dispute.id, payment_id: state.payments[dispute.payment_index]?.id ?? null,
        amount: dispute.amount, status: dispute.status, created_at: dispute.created_at,
      },
      text: [],
    });
  }

  // --- stamp provenance in canonical emission order (conventions U-EMISSION-ORDER)
  const observations: Observation[] = [];
  const untrusted: UntrustedText[] = [];
  const lineOf = new Map<string, number>();
  for (const kind of EMISSION_KIND_ORDER) {
    for (const draft of drafts.get(kind) ?? []) {
      const sourceSystem = SOURCE_SYSTEM[kind];
      const file = SOURCE_FILES[sourceSystem];
      const line = (lineOf.get(file) ?? 0) + 1;
      lineOf.set(file, line);
      const obsId = minter.observation();
      observations.push(
        ObservationSchema.parse({
          obs_id: obsId,
          source_system: sourceSystem,
          source_file: file,
          source_line: line,
          ingest_hash: hashCanonical(draft.payload as CanonicalValue),
          // §16 forbids any value that "can differ between two executions".
          ingested_at: PERIOD_TO,
          kind,
          payload: draft.payload,
        }),
      );
      for (const { field, raw } of draft.text) {
        untrusted.push(
          UntrustedTextSchema.parse({
            obs_id: obsId, field, raw, length: raw.length,
            sanitized_preview: sanitizeForPreview(raw),
          }),
        );
      }
    }
  }

  return Object.freeze({
    observations,
    untrusted_text: untrusted,
    withheld_recon_lines: withheldIds,
  });
}

/** `DATA_MODEL.md §10`'s normative `(kind, source_system)` table. */
const SOURCE_SYSTEM = Object.freeze({
  recon_line: "pg_recon", adjustment: "pg_recon", bank_line: "bank_statement",
  ledger_entry: "merchant_ledger", payment: "pg_payments", order: "pg_orders",
  refund: "pg_refunds", settlement: "pg_settlements", dispute: "pg_disputes",
} as const satisfies Record<Observation["kind"], keyof typeof SOURCE_FILES>);
