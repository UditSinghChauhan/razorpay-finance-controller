/**
 * Stage `S0` — normalization and quarantine, as orchestration over primitives
 * this package already holds.
 *
 * `ARCHITECTURE.md §3`, spec 1.4.18, register row `M32`: `packages/domain` owns
 * `S0`'s orchestration "over source data `apps/cli` has already read", because
 * `RECONCILIATION_SPEC.md §2` gives `S0` the output `Observation[]` +
 * `UntrustedText[]` and `DATA_MODEL.md §10` forbids `packages/engine` from
 * importing `UntrustedText` at all — "a stage cannot emit a type its package is
 * forbidden to import". `apps/cli` performs the read; `packages/engine` begins
 * at `S1`.
 *
 * **Nothing here is a second implementation of anything.** `§3` states the
 * reason domain won the ownership question: it "already holds every per-record
 * piece `S0` performs". This module therefore composes, and does not restate:
 *
 *   - step 1 is `schemas/entities.ts` + `schemas/observation.ts`, strict;
 *   - step 2 is `schemas/invariants.ts`'s four checkers and `gstIdentityHolds`;
 *   - step 3 is `schemas/untrusted-text.ts`, the separately-bannable quarantine;
 *   - step 4's `Paise` and Unix-seconds validation is `schemas/primitives.ts`;
 *   - the static `REFERENCE` classification is `observation.ts`'s `§10.1` pair.
 *
 * **This module must NOT be re-exported from `src/index.ts`.** It emits
 * `UntrustedText`, and `index.ts` states why that matters: the quarantine is
 * "reachable only through the `@assay/domain/untrusted-text` subpath, which
 * `packages/engine` is forbidden to import", and "re-exporting it from the
 * package root would make that ban unenforceable, because the engine
 * legitimately imports the rest of this package". `eslint.config.js` bans the
 * paths `@assay/domain/untrusted-text` and the `schemas/untrusted-text` module;
 * a root re-export of this file would route the type around both. `S0` needs
 * its own subpath export — `@assay/domain/s0-ingest` — added to that ban group,
 * for exactly the reason the quarantine has one.
 *
 * **No I/O, no network, no clock, no randomness.** `§3`: "Domain performs no
 * I/O; it transforms bytes the CLI has already read, which keeps `S0`
 * deterministic and unit-testable without a filesystem." `ingested_at` is a
 * caller-supplied value rather than a clock read, for the reason
 * `DATA_MODEL.md §16` gives: a hashed body may hold no value that "can differ
 * between two executions over identical input". `packages/generator`'s
 * `emit.ts` passes a frozen constant for the same reason.
 *
 * The five steps of `RECONCILIATION_SPEC.md §2` are performed in its order:
 *
 *   1. Parse per source schema; reject unknown fields (strict zod).
 *   2. Assert per-entity ingest invariants (`DATA_MODEL.md §2`-`§9`). A record
 *      failing one becomes `E05`/`E06`/`E07` "immediately and never enters the
 *      candidate space — it cannot corrupt a match".
 *   3. Split structural fields from free text. Free text goes to
 *      `untrusted_text`.
 *   4. Normalize: amounts to `Paise`; timestamps to Unix seconds; UTRs
 *      upper-cased and stripped of non-alphanumerics **into a derived field**,
 *      leaving the raw value intact.
 *   5. Stamp provenance and `ingest_hash`.
 */

import { createHash } from "node:crypto";

import { sub } from "@assay/money";
import { z } from "zod";

import { canonicalJson, type CanonicalValue } from "./canonical-json.js";
import type { ObservationId } from "./ids.js";
import {
  BankStatementLineSchema,
  DisputeSchema,
  MerchantLedgerEntrySchema,
  OrderSchema,
  PaymentSchema,
  RefundSchema,
  SettlementSchema,
  type Order,
  type Payment,
  type ReconLine,
  type Refund,
} from "./schemas/entities.js";
import {
  checkOrderInvariants,
  checkPaymentInvariants,
  checkReconLineInvariants,
  checkRefundInvariants,
  gstIdentityHolds,
  type InvariantViolation,
} from "./schemas/invariants.js";
import {
  AdjustmentPayloadSchema,
  ObservationSchema,
  ReconLinePayloadSchema,
  isReferenceKind,
  type Observation,
  type ObservationKind,
  type SourceSystem,
} from "./schemas/observation.js";
import { unixSecondsField, type Sha256, type UnixSeconds } from "./schemas/primitives.js";
import {
  UntrustedTextSchema,
  sanitizeForPreview,
  type UntrustedText,
  type UntrustedTextField,
} from "./schemas/untrusted-text.js";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Re-exported: `SourceDocument.source_system` below is typed by it, so a
 * caller building a `SourceDocument` needs the type from the same module that
 * demands it, not a second import of `./schemas/observation.js`.
 */
export type { SourceSystem };

/** One record as it was read, at the position it was read from. */
export interface SourceRecord {
  /** 1-based within `source_file`, as `ARCHITECTURE.md §4` stamps it. */
  readonly line: number;
  /** The decoded JSON value. `apps/cli` framed the file; it inspected no field. */
  readonly value: unknown;
}

/**
 * One source file's contents, already read.
 *
 * `source_system` is the caller's statement of which of `DATA_MODEL.md §10`'s
 * eight systems produced the file. It is not guessed from the payload: `§10`
 * makes the `(kind, source_system, payload)` triple normative, so the system is
 * an input to be checked against the payload rather than a conclusion drawn
 * from it.
 */
export interface SourceDocument {
  readonly source_system: SourceSystem;
  readonly source_file: string;
  readonly records: readonly SourceRecord[];
}

/**
 * The dataset's plausible-timestamp window, inclusive at both ends.
 *
 * `ARCHITECTURE.md §4` boundary 1.1 requires that "timestamps must be plausible
 * Unix seconds **within the dataset window**", and `schemas/primitives.ts`
 * explains why the window is not a field type: it "is a property of the dataset
 * being ingested, not of the schema, so it is applied by the ingest stage that
 * knows the window". This is that stage; the window is optional because a
 * caller ingesting outside a benchmark dataset has none.
 */
export interface DatasetWindow {
  readonly from: UnixSeconds;
  readonly to: UnixSeconds;
}

/** Everything `S0` consumes. Values only — this stage opens no file. */
export interface IngestRequest {
  readonly documents: readonly SourceDocument[];
  /**
   * Stamped on every observation. A caller-supplied constant, never a clock:
   * `DATA_MODEL.md §16` forbids a hashed body from carrying a value that "can
   * differ between two executions over identical input".
   */
  readonly ingested_at: UnixSeconds;
  readonly window?: DatasetWindow;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * The three classes an ingest-invariant failure can take.
 *
 * `RECONCILIATION_SPEC.md §2` step 2 fixes the set: a record failing an ingest
 * invariant "becomes `E05`/`E06`/`E07` immediately". The literals are spelled
 * as `DATA_MODEL.md §15` spells them, so this type is assignable to
 * `packages/ledger`'s `ExceptionClass` without either package importing the
 * other — `packages/ledger` builds *after* `packages/domain` in `§L.2`'s order,
 * so the import could not run in that direction anyway. `packages/engine`'s
 * `AnchorExceptionClass` is the same construction for the same reason.
 */
export type IngestExceptionClass =
  | "E05_AMOUNT_MISMATCH"
  | "E06_FEE_MISMATCH"
  | "E07_GST_MISMATCH";

/** A record that did not survive step 1. It never became an `Observation`. */
export interface RejectedRecord {
  readonly source_system: SourceSystem;
  readonly source_file: string;
  readonly source_line: number;
  /** Why the record was refused, as the schema that refused it put it. */
  readonly reason: string;
}

/**
 * A record that parsed and then failed an ingest invariant.
 *
 * It carries a fully stamped `Observation` because the exception the caller
 * raises has to name one, and `DATA_MODEL.md §16` requires that name to be a
 * deterministic identifier. It is deliberately **absent** from
 * `IngestResult.observations`: `§2` step 2 requires that such a record "never
 * enters the candidate space".
 */
export interface IngestInvariantFailure {
  readonly observation: Observation;
  readonly exception_class: IngestExceptionClass;
  /** Every rule that did not hold, in the order its checker reported them. */
  readonly violations: readonly InvariantViolation[];
}

/**
 * An `ingest_hash` collision within one source (`RECONCILIATION_SPEC.md §8`
 * mechanism 1) — "catches the same file imported twice and the same row
 * exported twice".
 *
 * Reported rather than resolved. `§8` states the class and no disposition, and
 * `DATA_MODEL.md §17.1` says only that a duplicate posts nothing while "the
 * retained copy posts under its own class" — so the duplicate stays in
 * `observations` and reaches its terminal state through the caller that raises
 * exceptions. Dropping it here would retire an observation from `§L.1` rule 5's
 * "exactly one terminal state" by omission, which is the drop path that rule
 * exists to forbid.
 *
 * `packages/engine`'s `s1-anchor.ts` records the other half of this split: `E08`
 * is "not" reachable from `S1`, because `§8` "assigns it to the ingest level —
 * `ingest_hash` collision within a source — which is `S0`'s".
 */
export interface DuplicateObservation {
  readonly exception_class: "E08_DUPLICATE_OBSERVATION";
  /** The later observation carrying an already-seen hash. */
  readonly obs_id: ObservationId;
  /** The first observation in this source to carry it. */
  readonly first_obs_id: ObservationId;
  readonly source_system: SourceSystem;
  readonly ingest_hash: Sha256;
}

/** The three fields `§2` step 4's UTR normalization applies to. */
export type DerivedUtrField = "utr" | "settlement_utr" | "bank_ref";

/**
 * `§2` step 4's derived UTR: "upper-cased and stripped of non-alphanumerics
 * **into a derived field**, leaving the raw value intact".
 *
 * It is a derived field **beside** the payload rather than on it, because
 * `DATA_MODEL.md §10`'s `Observation` is frozen and its payload schemas are
 * strict: adding a field would change `§10`'s shape and move `GT_VERSION`. The
 * raw value stays exactly where the source put it, which is the half of step 4
 * that is stated rather than implied.
 *
 * `RECONCILIATION_SPEC.md §3`'s `AN2` is the consumer:
 * `normalize(settlement.utr) === normalize(bank_ref)` and amount equal.
 */
export interface DerivedUtr {
  readonly obs_id: ObservationId;
  readonly field: DerivedUtrField;
  /** Verbatim, as the source carried it. */
  readonly raw: string;
  readonly normalized: string;
}

/**
 * Everything `S0` produces.
 *
 * `untrusted_text` and `derived_utrs` cover **every** record that was stamped,
 * including one that failed an ingest invariant. Disposition is carried by
 * membership of `observations` versus `invariant_failures`, never by a silent
 * omission from a side table.
 */
export interface IngestResult {
  /** Step 1-5 survivors. This, and only this, is what `S1` receives. */
  readonly observations: readonly Observation[];
  readonly untrusted_text: readonly UntrustedText[];
  readonly derived_utrs: readonly DerivedUtr[];
  /**
   * `DATA_MODEL.md §10.1`'s static classification, assigned at ingest.
   *
   * `DECISION_BRIEF.md §L.1` rule 5: `REFERENCE` "is assigned statically at
   * ingest from `Observation.kind` and may never be assigned by a decision, so
   * it cannot become a route for retiring an observation the engine failed to
   * explain". Recorded here so the assignment is visibly ingest's, and computed
   * with `observation.ts`'s `isReferenceKind` rather than a second copy of the
   * table.
   */
  readonly reference_obs_ids: readonly ObservationId[];
  readonly rejected: readonly RejectedRecord[];
  readonly invariant_failures: readonly IngestInvariantFailure[];
  readonly duplicates: readonly DuplicateObservation[];
}

/** A caller contract violation: the request itself is malformed. */
export class S0IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "S0IngestError";
  }
}

// ---------------------------------------------------------------------------
// Step 4 — normalization primitives
// ---------------------------------------------------------------------------

/**
 * `§2` step 4's UTR normalization: upper-case, strip non-alphanumerics.
 *
 * Implemented per code point rather than by a Unicode case fold, because
 * `DATA_MODEL.md §0` rule 5's whole purpose is that two runs over identical
 * input produce identical bytes: `toUpperCase` is locale-sensitive in principle
 * and folds non-ASCII letters into ASCII-looking ones, which would let two
 * different raw UTRs normalize equal. `[0-9A-Z]` out, always, and idempotent.
 */
export function normalizeUtr(raw: string): string {
  let out = "";
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    const isDigit = code >= 0x30 && code <= 0x39;
    const isUpper = code >= 0x41 && code <= 0x5a;
    const isLower = code >= 0x61 && code <= 0x7a;
    if (isDigit || isUpper) out += character;
    else if (isLower) out += String.fromCharCode(code - 32);
  }
  return out;
}

/**
 * `sha256(canonical_json(payload))` — `§2` step 5's `ingest_hash`.
 *
 * Over the **payload alone**, which `PREREGISTRATION.md §4.1` states as the
 * reason re-basing `source_line` is free: "`ingest_hash` is `sha256` over the
 * canonical **payload** alone, so no `ingest_hash`, no `inputs_hash` and no
 * hashed ledger body moves". `packages/generator`'s `emit.ts` hashes the same
 * bytes, so an observation this stage produces and the same observation the
 * generator emitted carry the same digest.
 *
 * `packages/ledger`'s `hashCanonical` is the identical construction and is not
 * imported: `§L.2` builds `domain` **before** `ledger`, so the dependency
 * cannot run in that direction. `createHash` reads no file, no socket and no
 * clock; it is arithmetic over bytes already in hand.
 */
export function ingestHash(payload: CanonicalValue): Sha256 {
  return createHash("sha256")
    .update(canonicalJson(payload), "utf8")
    .digest("hex") as Sha256;
}

/**
 * The observation id for a record at a given position in the input.
 *
 * `DATA_MODEL.md §16`: ASSAY-internal identifiers "must be assigned
 * deterministically: each is derived from a canonical traversal of the input in
 * a fixed order, never from a counter seeded by wall-clock time, process ID,
 * iteration order over an unordered collection, or any other source that can
 * differ between two executions over identical input."
 *
 * The address `(source_system, source_file, source_line)` **is** that traversal:
 * it is the record's position in the input, it is unique by construction — M42
 * re-bases `source_line` 1-based within the aggregated logical file precisely so
 * that two records never share one — and it is what `ARCHITECTURE.md §4`
 * boundary 1.3 already stamps. The payload is deliberately excluded: hashing it
 * would give two duplicate rows one identifier and make `§8`'s `E08` unstatable.
 *
 * `§0` rule 3 fixes the prefix and leaves the suffix length open, and none is
 * invented here — the digest is carried whole.
 */
function mintObservationId(
  sourceSystem: SourceSystem,
  sourceFile: string,
  sourceLine: number,
): ObservationId {
  const digest = ingestHash({
    source_system: sourceSystem,
    source_file: sourceFile,
    source_line: sourceLine,
  });
  return `obs_${digest}` as ObservationId;
}

// ---------------------------------------------------------------------------
// Step 1 — the source schemas
// ---------------------------------------------------------------------------

/**
 * The one kind each source system carries, for the seven that carry one.
 *
 * `pg_recon` is absent because it is the one system that carries two:
 * `DATA_MODEL.md §10` splits the recon report by row type, `type: "payment" |
 * "refund"` arriving as `recon_line` and `type: "adjustment"` as `adjustment`.
 * Redundant with `observation.ts`'s `KIND_SOURCE_SYSTEM` and deliberately so,
 * in the same spirit that table is redundant with the union: this is the
 * inverse direction, and a test checks the two agree row by row.
 */
const SINGLE_KIND_SOURCE = Object.freeze({
  bank_statement: "bank_line",
  merchant_ledger: "ledger_entry",
  pg_payments: "payment",
  pg_orders: "order",
  pg_refunds: "refund",
  pg_settlements: "settlement",
  pg_disputes: "dispute",
} as const satisfies Partial<Record<SourceSystem, ObservationKind>>);

/**
 * The free-text fields each kind carries in its **source** record, and the
 * `UntrustedText.field` each becomes.
 *
 * Transcribed from the `QUARANTINED:` line of `DATA_MODEL.md §2`-`§9`. The two
 * names differ in exactly one place, which is why the table has two columns:
 * `§3`'s Order carries `receipt`, and `§10`'s `UntrustedText.field` union calls
 * it `order_receipt`. `packages/generator`'s `emit.ts` performs the same
 * renaming at its own emission boundary.
 */
const QUARANTINED_FIELDS = Object.freeze({
  // §6: "QUARANTINED: description, notes (an OBJECT — see §10), order_receipt"
  recon_line: [
    { source: "description", field: "description" },
    { source: "notes", field: "notes" },
    { source: "order_receipt", field: "order_receipt" },
  ],
  adjustment: [
    { source: "description", field: "description" },
    { source: "notes", field: "notes" },
    { source: "order_receipt", field: "order_receipt" },
  ],
  // §7: "QUARANTINED: narration (the messy part)"
  bank_line: [{ source: "narration", field: "narration" }],
  // §8: "QUARANTINED: memo"
  ledger_entry: [{ source: "memo", field: "memo" }],
  // §2: "description, notes"
  payment: [
    { source: "description", field: "description" },
    { source: "notes", field: "notes" },
  ],
  // §3: "QUARANTINED: receipt, notes"
  order: [
    { source: "receipt", field: "order_receipt" },
    { source: "notes", field: "notes" },
  ],
  // §4: "QUARANTINED: notes"
  refund: [{ source: "notes", field: "notes" }],
  // §5 and §9 declare no quarantined field.
  settlement: [],
  dispute: [],
} as const satisfies Record<
  ObservationKind,
  readonly { readonly source: string; readonly field: UntrustedTextField }[]
>);

/**
 * `notes` is a documented JSON **object**, not a string.
 *
 * `DATA_MODEL.md §10`: "Razorpay documents `notes` as a JSON object — a
 * key-value store of at most 15 pairs, 256 characters each", and ASSAY
 * "quarantines the whole object as one `UntrustedText` row carrying its
 * canonical-JSON serialization, so the deterministic core sees a single opaque
 * blob and the injection surface is one field rather than N".
 *
 * The documented 15-pair and 256-character bounds are **not** enforced as a
 * rejection: no document states them as an ingest rule, and `§4.1`'s treatment
 * of `C6` is the precedent for refusing to invent a bound rather than guessing
 * one. A hostile merchant filling both is `F10`'s adversarial family working as
 * designed, and the blob is quarantined either way.
 */
const notesField = z.record(z.string(), z.string()).nullish();
const textField = z.string().nullish();

/** The entity schema each kind's payload is, before free text is added back. */
const ENTITY_SCHEMA = Object.freeze({
  recon_line: ReconLinePayloadSchema,
  adjustment: AdjustmentPayloadSchema,
  bank_line: BankStatementLineSchema,
  ledger_entry: MerchantLedgerEntrySchema,
  payment: PaymentSchema,
  order: OrderSchema,
  refund: RefundSchema,
  settlement: SettlementSchema,
  dispute: DisputeSchema,
});

/**
 * The **source** schema for a kind: its frozen entity schema, extended with the
 * free-text fields the source record carries, still strict.
 *
 * `§2` numbers the strict parse before the quarantine split, and that ordering
 * is only coherent against a schema that admits the text: `entities.ts` states
 * that free text "is absent by construction" from every entity schema and that
 * "a record carrying one is rejected by strict mode", so parsing a raw source
 * row against the entity schema directly would reject every order, payment,
 * refund, recon line, bank line and ledger entry in the input. `§2` step 1 says
 * "parse per **source** schema", and this is that schema.
 *
 * The structural half is never restated — it is the frozen schema, extended.
 * Unknown fields stay rejected: `.extend` preserves strict mode, so a field
 * that is neither structural nor one of `§10`'s five quarantined names is still
 * refused, which is `ARCHITECTURE.md §4` boundary 1.1's requirement intact.
 */
const SOURCE_SCHEMA: Readonly<Record<ObservationKind, z.ZodType>> = (() => {
  const built: Partial<Record<ObservationKind, z.ZodType>> = {};
  for (const kind of Object.keys(ENTITY_SCHEMA) as ObservationKind[]) {
    const shape: Record<string, z.ZodType> = {};
    for (const { source } of QUARANTINED_FIELDS[kind]) {
      shape[source] = source === "notes" ? notesField : textField;
    }
    built[kind] = ENTITY_SCHEMA[kind].extend(shape);
  }
  return Object.freeze(built as Record<ObservationKind, z.ZodType>);
})();

/**
 * Every timestamp field name `DATA_MODEL.md §2`-`§9` declares.
 *
 * A name table rather than a per-kind table, because the window check is the
 * same statement about every one of them and `§0` rule 2 gives them one type.
 * A test asserts the set matches the schemas.
 */
const TIMESTAMP_FIELDS: readonly string[] = Object.freeze([
  "created_at",
  "settled_at",
  "posted_at",
  "value_date",
  "booked_at",
]);

// ---------------------------------------------------------------------------
// Step 2 — invariants and their classification
// ---------------------------------------------------------------------------

/**
 * `§6`'s GST identity, as an `InvariantViolation` so it reads like the four
 * checkers' output.
 *
 * `schemas/invariants.ts` implements the identity **exactly** and records why:
 * `DATA_MODEL.md §15` phrases `E07` as holding "within rounding tolerance" and
 * "the specification nowhere quantifies that tolerance", so "a caller that
 * needs one has to obtain the magnitude from a spec amendment rather than from
 * here". This caller does not invent one.
 */
function gstViolation(line: ReconLine): InvariantViolation {
  return {
    entity: "ReconLine",
    rule: "tax = round_half_up(0.18 * (fee - tax)) (DATA_MODEL.md §6, §15 E07)",
    detail: `fee=${String(line.fee)} tax=${String(line.tax)}`,
  };
}

/** Step 2, per record. Every checker is `schemas/invariants.ts`'s. */
function perRecordViolations(
  kind: ObservationKind,
  record: Record<string, unknown>,
): InvariantViolation[] {
  switch (kind) {
    case "payment":
      return checkPaymentInvariants(record as unknown as Payment);
    case "order":
      return checkOrderInvariants(record as unknown as Order);
    case "refund":
      return checkRefundInvariants(record as unknown as Refund);
    case "recon_line":
    case "adjustment": {
      const line = record as unknown as ReconLine;
      const out = checkReconLineInvariants(line);
      if (!gstIdentityHolds(line.fee, line.tax)) out.push(gstViolation(line));
      return out;
    }
    // §5, §7, §8 and §9 declare no ingest invariant. `SettlementSchema` says so
    // for the one case a reader is most likely to expect one: "that is not
    // asserted as an ingest invariant here: §5 states no such invariant".
    case "settlement":
    case "bank_line":
    case "ledger_entry":
    case "dispute":
      return [];
  }
}

/**
 * Which of the three classes a failure takes.
 *
 * `DATA_MODEL.md §15` names them: `E06_FEE_MISMATCH` is "`credit != amount -
 * fee`", `E07_GST_MISMATCH` is "`tax != round_half_up(0.18 x (fee - tax))`",
 * and `E05_AMOUNT_MISMATCH` is "tie-out fails by a non-zero delta".
 *
 * Two things here are choices rather than transcriptions, and both are stated
 * rather than buried:
 *
 *   - **`E05` is the residual class.** `§2` step 2 closes the set at three, and
 *     two of the three name one identity each, so every other ingest invariant —
 *     `amount > 0`, `amount_paid + amount_due === amount`, `captured` against
 *     `status`, `§4`'s cross-record refund rules — has nowhere else to land. No
 *     document assigns them individually.
 *   - **`E06` outranks `E07`** when both identities fail on one row. `§6` calls
 *     `credit = amount - fee` "the arithmetic identity that anchors everything",
 *     and `tax` is a component **inside** `fee`, so the outer identity is the
 *     one to report. One record takes one class; no document orders them.
 */
function classify(
  kind: ObservationKind,
  record: Record<string, unknown>,
): IngestExceptionClass {
  if (kind !== "recon_line" && kind !== "adjustment") return "E05_AMOUNT_MISMATCH";
  const line = record as unknown as ReconLine;
  if (line.type === "payment" && line.credit !== sub(line.amount, line.fee)) {
    return "E06_FEE_MISMATCH";
  }
  if (!gstIdentityHolds(line.fee, line.tax)) return "E07_GST_MISMATCH";
  return "E05_AMOUNT_MISMATCH";
}

// ---------------------------------------------------------------------------
// The stage
// ---------------------------------------------------------------------------

/** A record that survived steps 1-5, before cross-record invariants have run. */
interface Staged {
  readonly observation: Observation;
  readonly kind: ObservationKind;
  readonly structural: Record<string, unknown>;
  readonly texts: readonly UntrustedText[];
  readonly derived: readonly DerivedUtr[];
  violations: InvariantViolation[];
}

const issueText = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");

/**
 * Run stage `S0` over source contents `apps/cli` has already read.
 *
 * Deterministic: the same request yields byte-identical output. Every output
 * array is in input order — documents in the order given, records in the order
 * given — and no `Map` is ever iterated to produce one.
 *
 * @throws S0IngestError if the request itself is malformed (an `ingested_at`
 *   that is not Unix seconds, or a window whose ends are inverted). That is a
 *   caller contract violation, not untrusted input, so it is not a
 *   `RejectedRecord`.
 */
export function ingest(request: IngestRequest): IngestResult {
  if (!unixSecondsField.safeParse(request.ingested_at).success) {
    throw new S0IngestError(
      "ingested_at must be positive integer Unix seconds (DATA_MODEL.md §0 rule 2); " +
        `received ${String(request.ingested_at)}`,
    );
  }
  const window = request.window;
  if (window !== undefined) {
    const ends = [window.from, window.to];
    if (!ends.every((end) => unixSecondsField.safeParse(end).success)) {
      throw new S0IngestError(
        "the dataset window's ends must be positive integer Unix seconds " +
          "(ARCHITECTURE.md §4 boundary 1.1)",
      );
    }
    if (window.from > window.to) {
      throw new S0IngestError(
        `the dataset window is inverted: from ${String(window.from)} > to ${String(window.to)}`,
      );
    }
  }

  const rejected: RejectedRecord[] = [];
  const staged: Staged[] = [];

  for (const document of request.documents) {
    for (const record of document.records) {
      const reject = (reason: string): void => {
        rejected.push({
          source_system: document.source_system,
          source_file: document.source_file,
          source_line: record.line,
          reason,
        });
      };

      // --- step 1: which kind, then parse per source schema ----------------
      const kind = kindOf(document.source_system, record.value);
      if (typeof kind !== "string") {
        reject(kind.reason);
        continue;
      }

      const parsed = SOURCE_SCHEMA[kind].safeParse(record.value);
      if (!parsed.success) {
        reject(issueText(parsed.error));
        continue;
      }
      const source = parsed.data as Record<string, unknown>;

      // `ARCHITECTURE.md §4` boundary 1.1's third structural requirement. It is
      // part of the same bullet as the schema, the amounts and the ID grammars,
      // so a record outside the window is refused rather than classified.
      const outOfWindow =
        window === undefined ? undefined : firstOutOfWindow(source, window);
      if (outOfWindow !== undefined) {
        reject(outOfWindow);
        continue;
      }

      // --- step 2: per-entity ingest invariants -----------------------------
      const violations = perRecordViolations(kind, source);

      // --- step 3: split structural fields from free text -------------------
      const obsId = mintObservationId(
        document.source_system,
        document.source_file,
        record.line,
      );
      const structural: Record<string, unknown> = { ...source };
      const texts: UntrustedText[] = [];
      for (const { source: name, field } of QUARANTINED_FIELDS[kind]) {
        const value = structural[name];
        delete structural[name];
        if (value === undefined || value === null) continue;
        // §10: for `notes`, `raw` is the canonical-JSON serialization of the
        // OBJECT, "so the quarantine boundary handles one type".
        const raw =
          typeof value === "string" ? value : canonicalJson(value as CanonicalValue);
        texts.push(
          UntrustedTextSchema.parse({
            obs_id: obsId,
            field,
            raw,
            length: raw.length,
            sanitized_preview: sanitizeForPreview(raw),
          }),
        );
      }

      // --- step 4: normalize ------------------------------------------------
      // Amounts and timestamps were normalized by the parse: `paiseField` is
      // "a non-negative safe integer of paise" and `unixSecondsField` is a
      // positive integer of Unix seconds, both `schemas/primitives.ts`'s, and
      // `DATA_MODEL.md §0` rule 1 forbids a float anywhere for either to be
      // converted from. What remains is the UTR, which is derived rather than
      // rewritten so the raw value stays intact.
      const derived: DerivedUtr[] = [];
      for (const field of utrFieldsOf(kind)) {
        const raw = structural[field];
        if (typeof raw !== "string") continue;
        derived.push({ obs_id: obsId, field, raw, normalized: normalizeUtr(raw) });
      }

      // --- step 5: stamp provenance and ingest_hash -------------------------
      const observation = ObservationSchema.parse({
        obs_id: obsId,
        source_system: document.source_system,
        source_file: document.source_file,
        source_line: record.line,
        ingest_hash: ingestHash(structural as CanonicalValue),
        ingested_at: request.ingested_at,
        kind,
        payload: structural,
      });

      staged.push({ observation, kind, structural, texts, derived, violations });
    }
  }

  crossRecordRefundInvariants(staged);

  // --- assembly ------------------------------------------------------------
  const observations: Observation[] = [];
  const untrustedText: UntrustedText[] = [];
  const derivedUtrs: DerivedUtr[] = [];
  const referenceObsIds: ObservationId[] = [];
  const invariantFailures: IngestInvariantFailure[] = [];
  const duplicates: DuplicateObservation[] = [];
  const firstSeen = new Map<string, ObservationId>();

  for (const item of staged) {
    untrustedText.push(...item.texts);
    derivedUtrs.push(...item.derived);

    if (item.violations.length > 0) {
      invariantFailures.push({
        observation: item.observation,
        exception_class: classify(item.kind, item.structural),
        violations: item.violations,
      });
      continue;
    }

    observations.push(item.observation);
    if (isReferenceKind(item.kind)) referenceObsIds.push(item.observation.obs_id);

    // `§8` mechanism 1, scoped to the source. "Within a source" is read as
    // within a `source_system` rather than within a `source_file`: it is the
    // wider net of the two, `§10` names the systems, and it catches both cases
    // `§8` gives — "the same file imported twice and the same row exported
    // twice" — where a file-scoped reading would miss the first whenever one
    // system's rows arrive across two files.
    const key = `${item.observation.source_system} ${item.observation.ingest_hash}`;
    const first = firstSeen.get(key);
    if (first === undefined) {
      firstSeen.set(key, item.observation.obs_id);
    } else {
      duplicates.push({
        exception_class: "E08_DUPLICATE_OBSERVATION",
        obs_id: item.observation.obs_id,
        first_obs_id: first,
        source_system: item.observation.source_system,
        ingest_hash: item.observation.ingest_hash,
      });
    }
  }

  return Object.freeze({
    observations: Object.freeze(observations),
    untrusted_text: Object.freeze(untrustedText),
    derived_utrs: Object.freeze(derivedUtrs),
    reference_obs_ids: Object.freeze(referenceObsIds),
    rejected: Object.freeze(rejected),
    invariant_failures: Object.freeze(invariantFailures),
    duplicates: Object.freeze(duplicates),
  });
}

/**
 * `§4`'s three cross-record refund invariants.
 *
 * `schemas/invariants.ts` implements only the intra-record rules and says why:
 * `§4`'s "`amount <= payment.amount`, `sum refunds(payment) <= payment.amount`
 * and `refund.created_at >= payment.created_at` each need a second record and
 * therefore belong to **the ingest stage that holds the observation set**".
 * This is that stage.
 *
 * A record that already failed step 2 is excluded from both the payment index
 * and the refund total: it "never enters the candidate space", so it is not
 * evidence about anything else either.
 *
 * **The attribution of a sum breach is a choice.** `§4` states the rule over the
 * set and names no culprit, and one record takes one class. The running total
 * is accumulated over refunds in input order and the refund that first carries
 * it past `payment.amount` is the one that fails — the standard ingest reading,
 * where each record is measured against the state the already-accepted records
 * built. The alternative, failing every refund of the payment, would quarantine
 * records that are individually consistent.
 */
function crossRecordRefundInvariants(staged: readonly Staged[]): void {
  const payments = new Map<string, Payment>();
  for (const item of staged) {
    if (item.kind !== "payment" || item.violations.length > 0) continue;
    const payment = item.structural as unknown as Payment;
    // First wins. A second row with the same id is `§8`'s duplicate, not a
    // replacement, and letting it overwrite would make the index depend on
    // which copy arrived last.
    if (!payments.has(payment.id)) payments.set(payment.id, payment);
  }

  const refundedSoFar = new Map<string, number>();
  for (const item of staged) {
    if (item.kind !== "refund" || item.violations.length > 0) continue;
    const refund = item.structural as unknown as Refund;
    const payment = payments.get(refund.payment_id);
    // §4.2's F05 withholds records; an absent payment is not a breach.
    if (payment === undefined) continue;

    const found: InvariantViolation[] = [];
    if (refund.amount > payment.amount) {
      found.push({
        entity: "Refund",
        rule: "amount <= payment.amount (DATA_MODEL.md §4)",
        detail:
          `refund ${refund.id} amount ${String(refund.amount)} exceeds payment ` +
          `${payment.id} amount ${String(payment.amount)}`,
      });
    }
    if (refund.created_at < payment.created_at) {
      found.push({
        entity: "Refund",
        rule: "refund.created_at >= payment.created_at (DATA_MODEL.md §4)",
        detail:
          `refund ${refund.id} created_at ${String(refund.created_at)} precedes ` +
          `payment ${payment.id} created_at ${String(payment.created_at)}`,
      });
    }
    const running = (refundedSoFar.get(payment.id) ?? 0) + refund.amount;
    if (running > payment.amount) {
      found.push({
        entity: "Refund",
        rule: "sum refunds(payment) <= payment.amount (DATA_MODEL.md §4)",
        detail:
          `refunds of payment ${payment.id} reach ${String(running)} against amount ` +
          `${String(payment.amount)} at refund ${refund.id}`,
      });
    }

    if (found.length > 0) item.violations = [...item.violations, ...found];
    else refundedSoFar.set(payment.id, running);
  }
}

/** Which `DerivedUtrField`s a kind's payload carries. */
function utrFieldsOf(kind: ObservationKind): readonly DerivedUtrField[] {
  switch (kind) {
    // §5's Settlement carries `utr`, `AN2`'s left comparand.
    case "settlement":
      return ["utr"];
    // §6's ReconLine carries `settlement_utr`.
    case "recon_line":
    case "adjustment":
      return ["settlement_utr"];
    // §7's BankStatementLine carries `bank_ref`, `AN2`'s right comparand —
    // "sometimes a clean UTR, often not", which is why it is normalized.
    case "bank_line":
      return ["bank_ref"];
    default:
      return [];
  }
}

/** The first timestamp outside the dataset window, as a rejection reason. */
function firstOutOfWindow(
  record: Record<string, unknown>,
  window: DatasetWindow,
): string | undefined {
  for (const field of TIMESTAMP_FIELDS) {
    const value = record[field];
    if (typeof value !== "number") continue;
    if (value >= window.from && value <= window.to) continue;
    return (
      `${field}: ${String(value)} is outside the dataset window ` +
      `[${String(window.from)}, ${String(window.to)}] (ARCHITECTURE.md §4 boundary 1.1)`
    );
  }
  return undefined;
}

/**
 * Which kind a record from `sourceSystem` claims to be.
 *
 * `DATA_MODEL.md §10`'s table is `(kind, source_system, payload)`, and seven of
 * the eight systems fix the kind outright. `pg_recon` carries two, split on the
 * row's `type`; a `type` the recon report does not admit — `transfer` above all,
 * which `§6` refuses because Route "is OUT OF TIER-0 SCOPE" and its rows obey
 * "a third arithmetic form that neither documented identity covers" — has no
 * branch and is refused here rather than parsed partially.
 */
function kindOf(
  sourceSystem: SourceSystem,
  value: unknown,
): ObservationKind | { readonly reason: string } {
  if (sourceSystem !== "pg_recon") return SINGLE_KIND_SOURCE[sourceSystem];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { reason: "(root): expected a JSON object" };
  }
  const type = (value as Record<string, unknown>)["type"];
  if (type === "adjustment") return "adjustment";
  if (type === "payment" || type === "refund") return "recon_line";
  return {
    reason:
      `type: ${JSON.stringify(type)} is not a recon row type this dataset admits. ` +
      'DATA_MODEL.md §6 accepts "payment", "refund" and "adjustment" and refuses ' +
      '"transfer" because Razorpay Route is out of Tier-0 scope',
  };
}
