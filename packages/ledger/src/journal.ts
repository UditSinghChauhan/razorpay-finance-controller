/**
 * Layer B — the posting rules `P1`–`P8`.
 *
 * `DATA_MODEL.md §17.1` holds the posting table, `§17.1.1` the trigger table
 * that selects among its rows, and `§17.2` the adjustment fallback. This module
 * is those three sections and nothing else: given one proposed posting occasion
 * it returns either the journal lines that occasion posts, or an explicit,
 * named refusal to post.
 *
 * **It is a pure function and it does not take a `ValidatedDecision`.**
 * `ARCHITECTURE.md §4` boundary 3 draws the line here and gives the reason:
 * "S5 must check `I1` over journal lines before it may emit a
 * `ValidatedDecision`, so it needs those lines first. `journal.ts` therefore
 * takes a **proposed** allocation and its terminal state — never the validated
 * wrapper — and is a pure function with no I/O." `DECISION_BRIEF.md §L.1`
 * rule 4 repeats it: the rule binds "the **mutating write path**: `journal.ts`
 * is a pure posting function over a *proposed* allocation and does not take
 * this type, which is what keeps S5 → `I1` → mint → write acyclic." Read the
 * other way it is a dependency cycle, which is why the boundary is stated in
 * the specification rather than left to this file.
 *
 * **The four phases are kept separate on purpose**, and in this order:
 *
 *   A. input validation      `readRequest`   — is this a request at all?
 *   B. posting selection     `selectRule`    — §17.1.1: which rule, or none?
 *   C. journal construction  `buildLegs`     — §17.1 / §17.2: which lines?
 *   D. invariant validation  `sealPosting`   — §16 shape, `I1`, one item key
 *
 * B never reads an amount and C never re-decides a rule. A rule that could
 * inspect the rupees it is about to post is a rule that can be talked out of
 * posting them, which is the shape of every silent-suppression bug `G3` exists
 * to make impossible.
 *
 * **This module is the system under test, not an oracle.** It contains no
 * second implementation of the posting table to compare itself against, and no
 * helper here is shaped so that a future differential test could accidentally
 * run it against itself (`ARCHITECTURE.md §7.2`).
 *
 * **What is deliberately absent.** Gate `G3` (`close-gate.ts`), the balance
 * projection (`projection.ts`), the mutating write path, and any judgement
 * about whether the *facts* a request asserts are true. Whether `AN2` really
 * matched, whether `I5` really held, whether the named observation exists
 * (`I6`), whether an allocation is unique — all belong to stages S1–S5, which
 * hold the observation set. This module holds none, and says so by requiring
 * the caller to state those facts rather than inferring them.
 */

import {
  ACCOUNT_CODES,
  ObservationSchema,
  SUSPENSE_ACCOUNT,
  isAdjustmentId,
  isBankLineId,
  isPaymentId,
  isRefundId,
  isSettlementId,
  type AccountCode,
  type Observation,
} from "@assay/domain";
import { paise, sub, type Paise } from "@assay/money";

import {
  describe,
  readArray,
  readMember,
  readObject,
  readToken,
  rejectUnknownKeys,
  sealJournalLine,
  type JournalLine,
} from "./events.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A posting request that cannot be turned into journal lines.
 *
 * A fifth error class, because it demands a fifth response. `LedgerEventError`
 * means fix the record; `TrialBalanceError` means abort the run
 * (`ARCHITECTURE.md §12`); `ChainMismatchError` means these events are not one
 * chain; `ProjectionInputError` means fix the lookup table you passed in — and
 * this one means the proposed allocation is not postable, which
 * `RECONCILIATION_SPEC.md §7` says "is never partially posted, never repaired,
 * never downgraded to a warning. The rejected allocation becomes an exception
 * carrying `invariants_failed`, and the batch continues."
 *
 * It extends `TypeError` for the reason `LedgerEventError` does, and carries
 * `path` in the same `$.a.b[0]` form.
 */
export class JournalError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "JournalError";
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Closed sets
// ---------------------------------------------------------------------------

/**
 * The eight posting rules of `DATA_MODEL.md §17.1` and `§17.2`.
 *
 * Identical in spelling and order to `GroundTruth.true_journal.posting_ref`
 * (`§1`), so the agent's `memo_ref` and truth's `posting_ref` are the same
 * token for the same rule and a reviewer can join them by eye. The set is
 * closed: `DECISION_BRIEF.md §L.4` makes "adding an account, a posting rule, or
 * a row to it a spec amendment".
 */
export const POSTING_REFS = Object.freeze([
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7",
  "P8",
] as const);

/** One of `DATA_MODEL.md §17.1`'s eight posting rules. */
export type PostingRef = (typeof POSTING_REFS)[number];

/**
 * The fourteen exception classes of `DATA_MODEL.md §15`, in declaration order.
 *
 * Declared here rather than imported for the reason `events.ts` declares
 * `EVENT_KINDS` and `projection.ts` declares `DecisionState`: `@assay/domain`
 * scopes itself to the ingest-boundary grammars and states plainly that
 * "`ExceptionClass` is not part of this package". This module cannot select a
 * posting without it, and `§15` is explicit that the set is closed —
 * "`classify_exception` cannot emit anything else" — so an open string would
 * be a wider domain than the specification has.
 */
export const EXCEPTION_CLASSES = Object.freeze([
  "E01_MISSING_CAPTURE",
  "E02_MISSING_SETTLEMENT",
  "E03_BANK_CREDIT_UNMATCHED",
  "E04_SETTLEMENT_NOT_IN_BANK",
  "E05_AMOUNT_MISMATCH",
  "E06_FEE_MISMATCH",
  "E07_GST_MISMATCH",
  "E08_DUPLICATE_OBSERVATION",
  "E09_DUPLICATE_BANK_CREDIT",
  "E10_REFUND_ORPHAN",
  "E11_TIMING_BOUNDARY",
  "E12_ADJUSTMENT_UNEXPLAINED",
  "E13_LEDGER_ONLY",
  "E14_UTR_COLLISION",
] as const);

/** `DATA_MODEL.md §15`'s closed taxonomy. */
export type ExceptionClass = (typeof EXCEPTION_CLASSES)[number];

/**
 * The four terminal states of `DATA_MODEL.md §13`.
 *
 * `projection.ts` declares the three-member `DecisionType`; this is the
 * four-member `ObservationState`, and the difference is load-bearing:
 * "`REFERENCE` observation produces no `Decision` at all, so `REFERENCE` is
 * deliberately NOT a member of this union". Selection here is by *observation*
 * state, so the fourth member is required.
 */
export const OBSERVATION_STATES = Object.freeze([
  "RECONCILED",
  "ABSTAINED",
  "EXCEPTION",
  "REFERENCE",
] as const);

/** `DATA_MODEL.md §13`. */
export type ObservationState = (typeof OBSERVATION_STATES)[number];

/**
 * The four moments at which `DATA_MODEL.md §17.1.1` fires a posting.
 *
 * Every one is the specification's own word for the moment, not a stage
 * invented here:
 *
 * - `INGEST` — "**`P1`** at ingest", "**`P3`** at ingest" (§17.1.1 rows 1, 3).
 * - `BANK_EVIDENCE` — "the settlement it is allocated to is **itself
 *   reconciled to a bank credit through real bank-side evidence**" (rows 2, 4).
 * - `TERMINAL_STATE` — "**every terminal `ABSTAINED` or `EXCEPTION` state**",
 *   and the rows that post nothing whatever the state.
 * - `RESOLUTION` — `§17.1`'s `P7` row, "Resolution of a Suspense item".
 *
 * They are four rather than one because they are four separate **events**.
 * `P1` posts a capture the recon report asserts; `P2` posts a bank credit that
 * arrives days later; `§17.1`'s `P7` row says the correcting posting follows
 * "as **new events**". Collapsing them would make one call return two postings
 * and would put a bank leg and a capture leg inside one digest that the run
 * never observed together.
 */
export const POSTING_OCCASIONS = Object.freeze([
  "INGEST",
  "BANK_EVIDENCE",
  "TERMINAL_STATE",
  "RESOLUTION",
] as const);

/** One of the four moments `DATA_MODEL.md §17.1.1` fires a posting at. */
export type PostingOccasion = (typeof POSTING_OCCASIONS)[number];

/**
 * Whether an abstained observation is the component's target or a member of it.
 *
 * `DATA_MODEL.md §17.1.1` splits the abstention rows three ways and the split
 * decides whether anything posts at all: the target carries the obligation, and
 * "a second posting for each member would relieve `1100_GATEWAY_RECEIVABLE`
 * again for one break".
 *
 * The target universe is **settlements and bank lines** and this module does
 * not widen it. `RECONCILIATION_SPEC.md §4` enumerates a target as "a
 * settlement needing constituents, or a bank line needing settlements",
 * `Candidate.target_id` (`§11`) as "what is being explained (settlement / bank
 * line)", and `PREREGISTRATION.md §8` records it as a frozen dependency of the
 * Ambiguity Oracle. `§A.7` G-G.1 removed a drafting error that had implied a
 * `recon_line` could be one.
 */
export type AbstentionRole = "TARGET" | "MEMBER";

const ABSTENTION_ROLES = Object.freeze(["TARGET", "MEMBER"] as const);

/**
 * Why an occasion posted nothing.
 *
 * A closed set, one member per clause of `DATA_MODEL.md §17.1.1`, because
 * "explicitly non-posting" has to be inspectable to be worth anything. An
 * implementation that returned an empty array for every silent case would be
 * indistinguishable, from the outside, from one that had lost a posting — and
 * losing a posting is exactly threat `THREAT_MODEL.md §T8`.
 *
 * `§17.1.1` is emphatic that these are not gaps: "An exception that posts
 * nothing is still an exception. It carries a class, a `severity`, an
 * `owner_role` and an `analyst_question` ... It cannot be suppressed either:
 * close gate `G1` requires every observation to hold exactly one terminal
 * state, with no drop path."
 */
export const NON_POSTING_GROUNDS = Object.freeze([
  /** "A line that **fails ingest validation posts nothing at all**, in either direction." */
  "INGEST_VALIDATION_FAILED",
  /** `payment`, `order` — "Reference kinds; §10.1". Never post a journal line. */
  "REFERENCE_KIND",
  /** `ledger_entry`, `dispute`, any state — "truth posts no line attributable to either kind". */
  "NO_ATTRIBUTABLE_KEY",
  /** `settlement`, `bank_line` on the reconciled path — `I4`/`I5` make them aggregates. */
  "AGGREGATE_VIEW",
  /** §17.1.1 gives this kind no posting at this occasion; its postings fire elsewhere. */
  "NO_TRIGGER_AT_THIS_OCCASION",
  /** "`ABSTAINED`, observation is a **non-target member** of the abstained component". */
  "NON_TARGET_MEMBER",
  /** `E05`, `E06`, `E07` — "ingest-invariant failures". */
  "INGEST_INVARIANT_FAILURE",
  /** `E08` — "A duplicate is not a second economic event." */
  "DUPLICATE_OBSERVATION",
  /** `E10` — "An `I6` referential failure ... the line never posts". */
  "REFERENTIAL_FAILURE",
  /** `E11` — "deliberately not an error class ... deferred, not an error". */
  "TIMING_DEFERRAL",
  /** `E13` — either leg "would let an attacker-controlled ERP row move a PG-side control account". */
  "UNTRUSTED_LEDGER_SOURCE",
  /** The `refund`-kind seam on the reconciled path. See `postsNothingOnReconciledPath`. */
  "NO_CONSTRUCTIBLE_RULE",
] as const);

/** Why `DATA_MODEL.md §17.1.1` posted nothing for an occasion. */
export type NonPostingGround = (typeof NON_POSTING_GROUNDS)[number];

// ---------------------------------------------------------------------------
// The request — a *proposed* allocation, never a validated one
// ---------------------------------------------------------------------------

/**
 * The bank-side fact `P2` and `P4` require, stated by the stage that can see it.
 *
 * `DATA_MODEL.md §17.1.1` conditions both rules on the settlement being
 * "**itself reconciled to a bank credit through real bank-side evidence** —
 * `AN2` satisfied against an actual `bank_line`, and `I5` therefore defined and
 * satisfied". This module holds no observation set and cannot check either, so
 * the caller states them. Three fields rather than one boolean, and each is
 * load-bearing:
 *
 * - `bank_line_id` is required because "`I5` is **undefined** — not satisfied —
 *   when no bank-line mapping exists". A boolean can be true with no bank line
 *   behind it; a `bnk_…` cannot. This is the field that makes
 *   `E04_SETTLEMENT_NOT_IN_BANK` unable to manufacture a `1200_BANK`
 *   realization: an `E04` settlement has no bank line to name.
 * - `settlement_id` is checked against the recon line's own `settlement_id`, so
 *   one settlement's bank evidence cannot be attached to another settlement's
 *   line.
 * - `an2_satisfied` and `i5_satisfied` are typed `true`, not `boolean`, so
 *   "the anchor did not match" is unrepresentable rather than merely false. A
 *   caller with no evidence omits the occasion; it does not pass a negative
 *   attestation and hope the ledger declines politely.
 *
 * `AN1` alone is deliberately **not** enough and is not among these fields.
 * It is "`recon_line.settlement_id === settlement.id`" on the basis "Same
 * system, same identifier" — "a **gateway-internal identity match that carries
 * no bank-side information**".
 */
export interface BankSideEvidence {
  /** The settlement the line is allocated to (`AN1`). Must match the line's own. */
  readonly settlement_id: string;
  /** The actual `bank_line` `AN2` matched. Its existence is what defines `I5`. */
  readonly bank_line_id: string;
  /** `AN2`: `normalize(settlement.utr) === normalize(bank_ref)` and amount equal. */
  readonly an2_satisfied: true;
  /** `I5`: `Σ settlement.amount` mapped to that bank line `= bank_line.amount`. */
  readonly i5_satisfied: true;
}

/** `DATA_MODEL.md §17.1.1` rows 1 and 3 — `P1` and `P3` "at ingest". */
export interface IngestPostingRequest {
  readonly occasion: "INGEST";
  readonly observation: Observation;
  /** `§17.1.1`: a record that fails ingest validation "posts nothing at all". */
  readonly ingest_valid: boolean;
}

/** `DATA_MODEL.md §17.1.1` rows 2 and 4 — `P2` and `P4`, on real bank evidence. */
export interface BankEvidencePostingRequest {
  readonly occasion: "BANK_EVIDENCE";
  readonly observation: Observation;
  readonly ingest_valid: boolean;
  readonly bank_evidence: BankSideEvidence;
}

/** `DATA_MODEL.md §17.1.1`'s Suspense table, and the rows that post nothing. */
export interface TerminalStatePostingRequest {
  readonly occasion: "TERMINAL_STATE";
  readonly observation: Observation;
  readonly ingest_valid: boolean;
  readonly state: ObservationState;
  /** Non-null exactly when `state === "EXCEPTION"` (`DATA_MODEL.md §14`). */
  readonly exception_class: ExceptionClass | null;
  /** Non-null exactly when `state === "ABSTAINED"` (`§17.1.1`'s three rows). */
  readonly abstention_role: AbstentionRole | null;
}

/**
 * `DATA_MODEL.md §17.1` row `P7` — "exact reversal of P5 or P6 under the
 * **same** `source_entity_id`".
 *
 * It carries the opening posting and nothing else, because that is all a
 * reversal needs: `§16` defines a resolved item arithmetically — "a `P7`
 * resolution reverses the opening posting under the **same** key, so a resolved
 * item nets to zero and leaves `Σ |item_net_paise|` by arithmetic rather than by
 * a flag someone must remember to set."
 *
 * "followed by the correct posting, as **new events**" is deliberately not this
 * request's business: the correct posting is a separate occasion with its own
 * trigger, and folding it in here would put two events' lines in one digest.
 */
export interface ResolutionPostingRequest {
  readonly occasion: "RESOLUTION";
  /** The `P5` or `P6` lines being reversed, as they were posted. */
  readonly opening: readonly JournalLine[];
}

/** One proposed posting occasion. */
export type PostingRequest =
  | IngestPostingRequest
  | BankEvidencePostingRequest
  | TerminalStatePostingRequest
  | ResolutionPostingRequest;

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

/** An occasion that posts: the rule it took, its item key, and its lines. */
export interface Posting {
  readonly posts: true;
  /** Which of `P1`–`P8` fired. Also each line's `memo_ref`. */
  readonly rule: PostingRef;
  /** `JournalLine.source_entity_id`, identical on every line including the counter-leg. */
  readonly source_entity_id: string;
  /** Ordered by `ACCOUNT_CODES` index; see `orderLegs`. */
  readonly lines: readonly JournalLine[];
}

/** An occasion that posts nothing, and the clause of `§17.1.1` that says so. */
export interface NonPosting {
  readonly posts: false;
  readonly rule: null;
  readonly ground: NonPostingGround;
  readonly lines: readonly [];
}

/** What one posting occasion yields. */
export type JournalDecision = Posting | NonPosting;

// ---------------------------------------------------------------------------
// A — input validation
// ---------------------------------------------------------------------------

const INGEST_KEYS = ["occasion", "observation", "ingest_valid"] as const;
const BANK_EVIDENCE_KEYS = [...INGEST_KEYS, "bank_evidence"] as const;
const TERMINAL_KEYS = [
  ...INGEST_KEYS,
  "state",
  "exception_class",
  "abstention_role",
] as const;
const RESOLUTION_KEYS = ["occasion", "opening"] as const;
const EVIDENCE_KEYS = [
  "settlement_id",
  "bank_line_id",
  "an2_satisfied",
  "i5_satisfied",
] as const;

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new JournalError(path, `expected a boolean, received ${describe(value)}`);
  }
  return value;
}

function readTrue(value: unknown, path: string): true {
  if (value !== true) {
    throw new JournalError(
      path,
      `expected true. An anchor that did not hold is expressed by omitting the ` +
        `BANK_EVIDENCE occasion, never by attesting to it: \`I5\` is ` +
        `"undefined — not satisfied — when no bank-line mapping exists" ` +
        `(DATA_MODEL.md §17.1.1), and §7 rejects an allocation on "any ` +
        `invariant failure". Received ${describe(value)}`,
    );
  }
  return true;
}

/**
 * An identifier of a stated family.
 *
 * The bank evidence's two identifiers are checked against their grammars rather
 * than admitted as bare tokens, because the whole reason `bank_line_id` is a
 * field is that "`I5` is **undefined** — not satisfied — when no bank-line
 * mapping exists". A token that is not a `bnk_…` names no bank line, so it
 * would restore exactly the boolean this field replaced.
 */
function readIdOfFamily(
  value: unknown,
  path: string,
  admits: (candidate: string) => boolean,
  family: string,
): string {
  const token = readToken(value, path);
  if (!admits(token)) {
    throw new JournalError(
      path,
      `expected a ${family} identifier (DATA_MODEL.md §0 rule 3); received ` +
        `${JSON.stringify(token)}`,
    );
  }
  return token;
}

function readNullableMember<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new JournalError(path, "expected a value or null; undefined is not either");
  }
  return readMember(value, path, allowed) as T;
}

/**
 * Re-parse the observation through the ingest schema.
 *
 * Not a duplicate of stage S0 and not a second opinion about what an
 * observation is: it is *the same* schema, called again at a second trust
 * boundary, and it is what makes the rest of this module able to read
 * `payload.amount` without asking whether `payload` is a `Proxy` whose getter
 * answers differently on the second read. `ObservationSchema` is a
 * `discriminatedUnion` of `strictObject`s, so it rejects an unknown field, a
 * mismatched `(kind, source_system, payload)` triple and a malformed
 * identifier, and it returns a fresh object rather than the caller's.
 *
 * `DATA_MODEL.md §17.1.1`'s trigger table keys on `Observation.kind`; a value
 * that is not an `Observation` has no row, and inventing one for it is what
 * `DECISION_BRIEF.md §L.4` prohibits.
 */
function readObservation(value: unknown, path: string): Observation {
  const parsed = ObservationSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${path}.${first.path.join(".")}` : path;
    throw new JournalError(
      where,
      `not a valid Observation (DATA_MODEL.md §10): ${first?.message ?? "parse failed"}`,
    );
  }
  return parsed.data;
}

function readEvidence(value: unknown, path: string): BankSideEvidence {
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, EVIDENCE_KEYS);
  return Object.freeze({
    settlement_id: readIdOfFamily(
      record["settlement_id"],
      `${path}.settlement_id`,
      isSettlementId,
      "setl_…",
    ),
    bank_line_id: readIdOfFamily(
      record["bank_line_id"],
      `${path}.bank_line_id`,
      isBankLineId,
      "bnk_…",
    ),
    an2_satisfied: readTrue(record["an2_satisfied"], `${path}.an2_satisfied`),
    i5_satisfied: readTrue(record["i5_satisfied"], `${path}.i5_satisfied`),
  });
}

/**
 * Read the request into a fresh, frozen structure, exactly once per field.
 *
 * The `events.ts` argument applies here unchanged: "Reading once also defeats a
 * getter that returns one value to the validator and another to the serializer,
 * which a validate-then-use design cannot rule out." A posting is hashed
 * immediately afterwards, so a request that can answer twice is a request that
 * can put one figure past the rules and a different figure into the digest.
 */
function readRequest(request: PostingRequest): PostingRequest {
  const path = "$";
  const record = readObject(request, path);
  const occasion = readMember(record["occasion"], `${path}.occasion`, POSTING_OCCASIONS);

  if (occasion === "RESOLUTION") {
    rejectUnknownKeys(record, path, RESOLUTION_KEYS);
    const opening = readArray(record["opening"], `${path}.opening`);
    return Object.freeze({
      occasion,
      opening: Object.freeze(
        opening.map((line, index) =>
          sealJournalLine(line, `${path}.opening[${String(index)}]`),
        ),
      ),
    });
  }

  const known =
    occasion === "INGEST"
      ? INGEST_KEYS
      : occasion === "BANK_EVIDENCE"
        ? BANK_EVIDENCE_KEYS
        : TERMINAL_KEYS;
  rejectUnknownKeys(record, path, known);

  const common = {
    observation: readObservation(record["observation"], `${path}.observation`),
    ingest_valid: readBoolean(record["ingest_valid"], `${path}.ingest_valid`),
  };

  if (occasion === "INGEST") return Object.freeze({ occasion, ...common });

  if (occasion === "BANK_EVIDENCE") {
    return Object.freeze({
      occasion,
      ...common,
      bank_evidence: readEvidence(record["bank_evidence"], `${path}.bank_evidence`),
    });
  }

  const state = readMember(record["state"], `${path}.state`, OBSERVATION_STATES);
  const exceptionClass = readNullableMember(
    record["exception_class"],
    `${path}.exception_class`,
    EXCEPTION_CLASSES,
  );
  const abstentionRole = readNullableMember(
    record["abstention_role"],
    `${path}.abstention_role`,
    ABSTENTION_ROLES,
  );

  // `DATA_MODEL.md §14` gives every `Exception` a class, and `§17.1.1` selects
  // on it, so an `EXCEPTION` with no class has no row. The converse matters as
  // much: a class carried on a `RECONCILED` observation would let a caller
  // select a Suspense posting for something it just declared reconciled.
  if ((state === "EXCEPTION") !== (exceptionClass !== null)) {
    throw new JournalError(
      `${path}.exception_class`,
      `exception_class is non-null exactly when state === "EXCEPTION" ` +
        `(DATA_MODEL.md §14, §17.1.1); received state ${JSON.stringify(state)} ` +
        `with ${exceptionClass === null ? "null" : JSON.stringify(exceptionClass)}`,
    );
  }
  if ((state === "ABSTAINED") !== (abstentionRole !== null)) {
    throw new JournalError(
      `${path}.abstention_role`,
      `abstention_role is non-null exactly when state === "ABSTAINED" ` +
        `(DATA_MODEL.md §17.1.1's three abstention rows); received state ` +
        `${JSON.stringify(state)} with ` +
        `${abstentionRole === null ? "null" : JSON.stringify(abstentionRole)}`,
    );
  }

  return Object.freeze({
    occasion,
    ...common,
    state,
    exception_class: exceptionClass,
    abstention_role: abstentionRole,
  });
}

// ---------------------------------------------------------------------------
// B — posting selection (`DATA_MODEL.md §17.1.1`)
// ---------------------------------------------------------------------------

/** What selection yields: a rule to build, or a named refusal. */
type Selection = { readonly rule: PostingRef } | { readonly ground: NonPostingGround };

const posts = (rule: PostingRef): Selection => ({ rule });
const silent = (ground: NonPostingGround): Selection => ({ ground });

/**
 * `§17.1.1`'s Suspense table, exception rows: class → rule, and the kind the
 * key column binds it to.
 *
 * The `kind` column is not extra policy. `§17.1.1` names a
 * `source_entity_id` family for every posting row, and `§16` fixes what that
 * family means: the key "carries **the identifier of the observation whose
 * obligation the posting records**" and is "a business identifier drawn from
 * the observation set". Only one observation kind carries each family — a
 * `setl_…` comes from a `Settlement`, a `bnk_…` from a `BankStatementLine`, a
 * `pay_…`/`rfnd_…` from a `ReconLine.entity_id`, an `adj_…` from an adjustment
 * row — so pairing an `E04` with a bank line would post a `setl_…` key that
 * names no settlement. Refusing that pairing enforces the stated key domain; it
 * adds no rule and no row.
 */
const EXCEPTION_ROWS: Readonly<
  Record<ExceptionClass, Selection & { readonly kinds?: readonly string[] }>
> = Object.freeze({
  // `setl_…` — "the settlement with no capture behind it (§15)".
  E01_MISSING_CAPTURE: { ...posts("P6"), kinds: ["settlement"] },
  // `pay_…` — "`P1` recognised the receivable; its disposition is unknown".
  E02_MISSING_SETTLEMENT: { ...posts("P6"), kinds: ["recon_line"] },
  E03_BANK_CREDIT_UNMATCHED: { ...posts("P5"), kinds: ["bank_line"] },
  E04_SETTLEMENT_NOT_IN_BANK: { ...posts("P6"), kinds: ["settlement"] },
  E05_AMOUNT_MISMATCH: silent("INGEST_INVARIANT_FAILURE"),
  E06_FEE_MISMATCH: silent("INGEST_INVARIANT_FAILURE"),
  E07_GST_MISMATCH: silent("INGEST_INVARIANT_FAILURE"),
  E08_DUPLICATE_OBSERVATION: silent("DUPLICATE_OBSERVATION"),
  // "the **later** credit, held in Suspense rather than netted".
  E09_DUPLICATE_BANK_CREDIT: { ...posts("P5"), kinds: ["bank_line"] },
  E10_REFUND_ORPHAN: silent("REFERENTIAL_FAILURE"),
  E11_TIMING_BOUNDARY: silent("TIMING_DEFERRAL"),
  E12_ADJUSTMENT_UNEXPLAINED: { ...posts("P8"), kinds: ["adjustment"] },
  E13_LEDGER_ONLY: silent("UNTRUSTED_LEDGER_SOURCE"),
  // "one item per settlement whose credit cannot be attributed". The
  // unattributable bank line takes its own `E03`/`P5` under its own key —
  // §17.1.1's disclosed two-item residual.
  E14_UTR_COLLISION: { ...posts("P6"), kinds: ["settlement"] },
});

/**
 * `§17.1.1`: "those four post nothing whatever their class, and no row below
 * overrides that."
 */
function silentKind(kind: Observation["kind"]): NonPostingGround | null {
  if (kind === "payment" || kind === "order") return "REFERENCE_KIND";
  if (kind === "ledger_entry" || kind === "dispute") return "NO_ATTRIBUTABLE_KEY";
  return null;
}

/**
 * The reconciled path, for a kind that reaches it.
 *
 * `§17.1.1`'s kind table enumerates `recon_line`, `settlement`, `bank_line`,
 * `ledger_entry`, `dispute`, `payment` and `order`; `§17.2` states that an
 * adjustment "is **never** reported as `RECONCILED`", which is why reaching
 * this function as an `adjustment` is a caller error rather than a row.
 *
 * **The `refund` kind is the one seam in the table and is reported, not
 * papered over.** `Observation.kind === "refund"` (the `pg_refunds` view,
 * `§10`) appears in neither `§17.1.1`'s reconciled-path table nor `§14.1`'s
 * `value(observation)` table, though `§10.1` classes it reconcilable. It is
 * treated as non-posting here on the same ground `§A.7` G-F withdrew the
 * universal `P8` fallback for — **no rule among `P1`–`P8` is constructible over
 * a `Refund` payload**: `P1`–`P4` read `ReconLine` fields the entity does not
 * carry, `P5`/`P6` require a target and the target universe is settlements and
 * bank lines, and `P8` is adjustments only. Its abstained and excepted paths
 * *are* enumerated — the non-target-member row and `E10` — and both are
 * likewise silent, so this is the same answer every enumerated neighbour gives.
 * It is given its own ground so that it is visible in the code, in the suite and
 * in review rather than folded into a row that does cover it.
 */
function postsNothingOnReconciledPath(kind: Observation["kind"]): NonPostingGround {
  switch (kind) {
    case "settlement":
    case "bank_line":
      // "`P2` already posts the bank leg per line, so a second posting on the
      // aggregate view would double every account it touches."
      return "AGGREGATE_VIEW";
    case "recon_line":
      // The E04 guard, structurally. `§A.7` G-G.1 B3: a line reaches
      // `RECONCILED` on `AN1` alone, "a gateway-internal identifier match
      // carrying no bank-side information". Its postings are `P1`/`P3` at
      // ingest and `P2`/`P4` on bank evidence; arriving at `RECONCILED` is not
      // itself a trigger and must not debit `1200_BANK`.
      return "NO_TRIGGER_AT_THIS_OCCASION";
    case "refund":
      return "NO_CONSTRUCTIBLE_RULE";
    default:
      throw new JournalError(
        "$.state",
        `DATA_MODEL.md §17.2 states that an adjustment observation "is never ` +
          `reported as RECONCILED"; kind ${JSON.stringify(kind)} has no ` +
          `reconciled-path row in §17.1.1`,
      );
  }
}

/**
 * `DATA_MODEL.md §17.1.1`, in full. Reads no amount and no rupee field.
 */
function selectRule(request: PostingRequest): Selection {
  if (request.occasion === "RESOLUTION") return posts("P7");

  // "A line that **fails ingest validation posts nothing at all**, in either
  // direction." Posting the amount of a line whose own arithmetic identity
  // fails "would assert a figure the line is an exception *for* failing to
  // substantiate."
  if (!request.ingest_valid) return silent("INGEST_VALIDATION_FAILED");

  const kind = request.observation.kind;
  const always = silentKind(kind);
  if (always !== null) return silent(always);

  // `DECISION_BRIEF.md §L.1` rule 5: `REFERENCE` "is assigned statically at
  // ingest from `Observation.kind` and may never be assigned by a decision, so
  // it cannot become a route for retiring an observation the engine failed to
  // explain". Every kind it is legal for returned above.
  if (request.occasion === "TERMINAL_STATE" && request.state === "REFERENCE") {
    throw new JournalError(
      "$.state",
      `REFERENCE is assigned statically from Observation.kind and belongs only ` +
        `to payment and order (DATA_MODEL.md §10.1; DECISION_BRIEF.md §L.1 ` +
        `rule 5); received it on kind ${JSON.stringify(kind)}`,
    );
  }

  const reconLineType =
    kind === "recon_line" ? request.observation.payload.type : null;

  if (request.occasion === "INGEST") {
    // "**`P1`** at ingest, on `amount`. A capture is a fact the recon report
    // asserts; it does not wait on ASSAY being able to settle it."
    if (reconLineType === "payment") return posts("P1");
    if (reconLineType === "refund") return posts("P3");
    return silent("NO_TRIGGER_AT_THIS_OCCASION");
  }

  if (request.occasion === "BANK_EVIDENCE") {
    if (reconLineType === "payment") return posts("P2");
    if (reconLineType === "refund") return posts("P4");
    return silent("NO_TRIGGER_AT_THIS_OCCASION");
  }

  if (request.state === "RECONCILED") return silent(postsNothingOnReconciledPath(kind));

  if (request.state === "ABSTAINED") {
    // "An `adjustment` observation cannot appear as an `ABSTAINED` row because
    // §17.2 sends every one of them to `EXCEPTION`."
    if (kind === "adjustment") {
      throw new JournalError(
        "$.state",
        `DATA_MODEL.md §17.1.1: "An adjustment observation cannot appear as an ` +
          `ABSTAINED row because §17.2 sends every one of them to EXCEPTION"`,
      );
    }
    if (request.abstention_role === "MEMBER") return silent("NON_TARGET_MEMBER");
    if (kind === "bank_line") return posts("P5");
    if (kind === "settlement") return posts("P6");
    throw new JournalError(
      "$.abstention_role",
      `the target universe is settlements and bank lines ` +
        `(RECONCILIATION_SPEC.md §4; DATA_MODEL.md §11; PREREGISTRATION.md §8), ` +
        `and DATA_MODEL.md §17.1.1 does not widen it; kind ` +
        `${JSON.stringify(kind)} cannot be a TARGET`,
    );
  }

  // EXCEPTION. `readRequest` already established that the class is non-null on
  // this state, and this re-establishes it rather than asserting it away with a
  // cast: the cast would keep compiling if that check were ever relaxed, and
  // `EXCEPTION_ROWS[null]` is `undefined`, which reads as "no row" and would
  // fall through to a posting nobody selected.
  const exceptionClass = request.exception_class;
  if (exceptionClass === null) {
    throw new JournalError(
      "$.exception_class",
      "an EXCEPTION carries a class (DATA_MODEL.md §14, §17.1.1)",
    );
  }
  const row = EXCEPTION_ROWS[exceptionClass];
  if (row.kinds !== undefined && !row.kinds.includes(kind)) {
    throw new JournalError(
      "$.observation.kind",
      `DATA_MODEL.md §17.1.1 keys ${exceptionClass} on ` +
        `${row.kinds.join(" | ")}, because §16 requires source_entity_id to name ` +
        `"the identifier of the observation whose obligation the posting ` +
        `records"; received kind ${JSON.stringify(kind)}`,
    );
  }
  return row;
}

// ---------------------------------------------------------------------------
// C — journal construction (`DATA_MODEL.md §17.1`, `§17.2`)
// ---------------------------------------------------------------------------

/** One side of one line, before ordering and before the zero legs are dropped. */
interface Leg {
  readonly account: AccountCode;
  readonly side: "dr" | "cr";
  readonly amount: Paise;
}

const dr = (account: AccountCode, amount: Paise): Leg => ({ account, side: "dr", amount });
const cr = (account: AccountCode, amount: Paise): Leg => ({ account, side: "cr", amount });

/** What construction yields: the rule's legs, and the key every one of them carries. */
interface Construction {
  readonly legs: readonly Leg[];
  readonly sourceEntityId: string;
}

/**
 * `ReconLine.entity_id`, checked against the family its `type` fixes.
 *
 * `DATA_MODEL.md §6` types the field `string` and states its domain in the same
 * line — `[RZP-DOC] pay_… | rfnd_… | adj_…` — and `§10`'s table binds each row
 * type to one of the three. The ingest schema types it `z.string().min(1)`,
 * which is the broader of the two, so the narrower rule is enforced at the
 * boundary that consumes it: this is the value that becomes
 * `JournalLine.source_entity_id`, and a mis-keyed Suspense line moves an item
 * between `G3` partitions without moving a rupee.
 */
function reconLineKey(
  entityId: string,
  type: "payment" | "refund" | "adjustment",
): string {
  const admits =
    type === "payment" ? isPaymentId : type === "refund" ? isRefundId : isAdjustmentId;
  const expected = type === "payment" ? "pay_" : type === "refund" ? "rfnd_" : "adj_";
  if (!admits(entityId)) {
    throw new JournalError(
      "$.observation.payload.entity_id",
      `a recon row of type ${JSON.stringify(type)} carries a ${expected}… ` +
        `identifier (DATA_MODEL.md §6, §10); received ${JSON.stringify(entityId)}`,
    );
  }
  return entityId;
}

/** The `ReconLine` behind a `recon_line` or `adjustment` observation. */
function reconLineOf(observation: Observation, rule: PostingRef) {
  if (observation.kind !== "recon_line" && observation.kind !== "adjustment") {
    throw new JournalError(
      "$.observation.kind",
      `${rule} reads ReconLine fields and kind ${JSON.stringify(observation.kind)} ` +
        `carries none (DATA_MODEL.md §17.2, §A.7 G-F)`,
    );
  }
  return observation.payload;
}

/**
 * `P2`/`P4`'s bank-side condition, checked as far as this module can see it.
 *
 * `AN2` and `I5` themselves are stated by the caller and cannot be recomputed
 * here. `AN1` — "`recon_line.settlement_id === settlement.id`" — *is* visible,
 * because the recon line carries its own `settlement_id`, so it is checked:
 * without it one settlement's bank evidence could be attached to another
 * settlement's line, and the evidence would be true of a settlement this line
 * was never allocated to.
 */
function assertBankEvidenceMatchesLine(
  settlementId: string | null,
  evidence: BankSideEvidence,
): void {
  if (settlementId === null) {
    throw new JournalError(
      "$.observation.payload.settlement_id",
      `P2/P4 require the line to be allocated to the settlement the bank ` +
        `evidence names (AN1, RECONCILIATION_SPEC.md §3); the line carries no ` +
        `settlement_id`,
    );
  }
  if (settlementId !== evidence.settlement_id) {
    throw new JournalError(
      "$.bank_evidence.settlement_id",
      `the bank evidence names ${JSON.stringify(evidence.settlement_id)} and the ` +
        `line is allocated to ${JSON.stringify(settlementId)} (AN1, ` +
        `RECONCILIATION_SPEC.md §3)`,
    );
  }
}

/**
 * `DATA_MODEL.md §17.2`'s `M` — "the non-zero one of `ReconLine.debit` /
 * `ReconLine.credit`, which `I3` guarantees to exist and be unique for
 * `type === "adjustment"`".
 *
 * Not `ReconLine.amount`: "`I4` closes a settlement as `settlement.amount =
 * Σ credit − Σ debit` over its allocated lines ... The rupees that actually move
 * a settlement are therefore `debit`/`credit`, and P8 must post the same figure
 * or the ledger would carry a number the settlement arithmetic does not
 * recognise." `§14.1` reads `value(observation)` off the same field, which is
 * what keeps `G3`'s two sides equal on an adjustment.
 *
 * Where `I3`'s guarantee does not hold the figure is refused rather than
 * guessed. `§A.7` G-F is explicit that "`M` is not unique on exactly the rows
 * that reached the fallback", and a row with two candidates for "the non-zero
 * one" is an `E05`/`E06`/`E07`, which posts nothing.
 */
function adjustmentM(debit: Paise, credit: Paise): { readonly m: Paise; readonly debitSide: boolean } {
  if ((debit === 0) === (credit === 0)) {
    throw new JournalError(
      "$.observation.payload",
      `P8 posts M, "the non-zero one of ReconLine.debit / ReconLine.credit, ` +
        `which I3 guarantees to exist and be unique for type === adjustment" ` +
        `(DATA_MODEL.md §17.2); received debit=${String(debit)} ` +
        `credit=${String(credit)}, for which M is not unique`,
    );
  }
  return debit === 0 ? { m: credit, debitSide: false } : { m: debit, debitSide: true };
}

/**
 * `DATA_MODEL.md §17.1`'s posting table and `§17.2`'s `P8` row, transcribed.
 *
 * Amounts are read here and nowhere else, and no branch re-decides which rule
 * fired. Every figure is `value(observation)` per `§14.1` where the rule opens
 * a Suspense item, which is what makes gate `G3`'s two sides — the books and
 * the queue — the same number.
 */
function buildLegs(rule: PostingRef, request: PostingRequest): Construction {
  if (rule === "P7") {
    if (request.occasion !== "RESOLUTION") {
      throw new JournalError("$.occasion", "P7 is reached only from RESOLUTION");
    }
    return reverseOpening(request.opening);
  }
  if (request.occasion === "RESOLUTION") {
    throw new JournalError("$.occasion", "RESOLUTION reaches only P7");
  }

  const observation = request.observation;

  switch (rule) {
    // | P1 | Payment captured at the gateway
    // | DR 1100_GATEWAY_RECEIVABLE amount | CR 4000_REVENUE amount |
    case "P1": {
      const line = reconLineOf(observation, rule);
      return {
        legs: [dr("1100_GATEWAY_RECEIVABLE", line.amount), cr("4000_REVENUE", line.amount)],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    // | P2 | Settlement reconciled to a bank credit
    // | DR 1200_BANK credit; 5100_PG_FEE_EXPENSE fee − tax; 1300_GST_INPUT_CREDIT tax
    // | CR 1100_GATEWAY_RECEIVABLE amount |
    //
    // "P2 balances by construction: credit + (fee − tax) + tax = amount − fee +
    // fee = amount", which holds exactly when `I3` holds. It is not re-checked
    // here — `I3` is stage S5's (`RECONCILIATION_SPEC.md §7`) — and a line on
    // which it fails is caught by phase D's balance invariant rather than by a
    // second copy of the identity that could drift from the first.
    case "P2": {
      if (request.occasion !== "BANK_EVIDENCE") {
        throw new JournalError("$.occasion", "P2 is reached only from BANK_EVIDENCE");
      }
      const line = reconLineOf(observation, rule);
      assertBankEvidenceMatchesLine(line.settlement_id, request.bank_evidence);
      // `fee` is GST-inclusive and `tax` is the component inside it (§6), so
      // `fee_ex_gst = fee − tax`. `sub` re-validates and refuses a result
      // outside the safe range; a negative one is refused below, because a
      // negative debit is not a posting (§16, and `I7`'s no-negative rule).
      const feeExGst = sub(line.fee, line.tax);
      if (feeExGst < 0) {
        throw new JournalError(
          "$.observation.payload.tax",
          `fee is GST-inclusive and tax is the component inside it ` +
            `(DATA_MODEL.md §6), so fee − tax cannot be negative; received ` +
            `fee=${String(line.fee)} tax=${String(line.tax)}`,
        );
      }
      return {
        legs: [
          dr("1200_BANK", line.credit),
          dr("5100_PG_FEE_EXPENSE", feeExGst),
          dr("1300_GST_INPUT_CREDIT", line.tax),
          cr("1100_GATEWAY_RECEIVABLE", line.amount),
        ],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    // | P3 | Refund initiated
    // | DR 4000_REVENUE refund_amount | CR 2200_REFUND_LIABILITY refund_amount |
    //
    // `§17.1.1` gives the trigger "at ingest, on `amount`" and `I3` fixes
    // `debit = amount` on a refund row, so the two figures are the same one.
    case "P3": {
      const line = reconLineOf(observation, rule);
      return {
        legs: [dr("4000_REVENUE", line.amount), cr("2200_REFUND_LIABILITY", line.amount)],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    // | P4 | Refund settled out of the bank
    // | DR 2200_REFUND_LIABILITY refund_amount | CR 1200_BANK refund_amount |
    case "P4": {
      if (request.occasion !== "BANK_EVIDENCE") {
        throw new JournalError("$.occasion", "P4 is reached only from BANK_EVIDENCE");
      }
      const line = reconLineOf(observation, rule);
      assertBankEvidenceMatchesLine(line.settlement_id, request.bank_evidence);
      return {
        legs: [dr("2200_REFUND_LIABILITY", line.amount), cr("1200_BANK", line.amount)],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    // | P5 | Abstention or open exception on an **inbound** item — value has
    //        arrived in the bank and cannot be attributed
    // | DR 1200_BANK amount | CR 9000_SUSPENSE_UNRECONCILED amount |
    //
    // The bank leg posts in its **true economic direction**, which `§17.1` says
    // is why the sign convention was chosen: "an abstained ₹1,00,000 bank credit
    // leaves `1200_BANK` at +₹1,00,000, matching truth, and harm on that account
    // is zero." Inverting it would charge ₹2,00,000 of phantom harm "only to
    // agents that abstain".
    case "P5": {
      if (observation.kind !== "bank_line") {
        throw new JournalError(
          "$.observation.kind",
          `P5 is the inbound rule and its key is bnk_… (DATA_MODEL.md §17.1.1); ` +
            `received kind ${JSON.stringify(observation.kind)}`,
        );
      }
      // **A seam, and it is refused rather than guessed.** Every source for
      // this row describes a bank *credit*: §17.1's P5 row is "value has
      // arrived in the bank", §17.1.1's Direction column reads `inbound`,
      // §14.1 values a bank line at "the credit that actually arrived", and
      // the canonical class is `E03_BANK_CREDIT_UNMATCHED`. None of them
      // predicates on `BankStatementLine.direction` (§7), which is a real
      // field with a real `"debit"` value — a refund settled out of the bank
      // under `P4` is one. Posting `DR 1200_BANK` for an unmatched bank
      // *debit* would assert that money arrived when it left, and would break
      // the one property §17.1 chose the sign convention to preserve: that
      // "the known leg of an abstained item [posts] in its true economic
      // direction", so `balance_harm_inr` charges zero for a rupee correctly
      // parked. No row in §17.1.1 covers the outbound bank line, so this is
      // refused and reported rather than posted under a row written for the
      // other direction.
      if (observation.payload.direction !== "credit") {
        throw new JournalError(
          "$.observation.payload.direction",
          `P5 is DATA_MODEL.md §17.1.1's inbound row — "value has arrived in ` +
            `the bank" (§17.1), valued at "the credit that actually arrived" ` +
            `(§14.1) — and §17.1.1 states no row for an unmatched bank line ` +
            `with direction "debit". Posting one would debit 1200_BANK for ` +
            `money that left. This is a specification seam and is refused ` +
            `rather than resolved here`,
        );
      }
      const amount = observation.payload.amount; // §14.1: "the credit that actually arrived"
      return {
        legs: [dr("1200_BANK", amount), cr(SUSPENSE_ACCOUNT, amount)],
        sourceEntityId: observation.payload.bank_line_id,
      };
    }

    // | P6 | Abstention or open exception on an **outbound** item — an
    //        obligation recognised at the gateway whose disposition is unknown
    // | DR 9000_SUSPENSE_UNRECONCILED amount | CR 1100_GATEWAY_RECEIVABLE amount |
    //
    // `RECONCILIATION_SPEC.md §11` writes the same posting out: "the unexplained
    // item is the outbound settlement, so Suspense takes the debit and the
    // receivable is relieved".
    case "P6": {
      if (observation.kind === "settlement") {
        // §14.1: "`I4` closes a settlement at exactly this figure".
        const amount = observation.payload.amount;
        return {
          legs: [dr(SUSPENSE_ACCOUNT, amount), cr("1100_GATEWAY_RECEIVABLE", amount)],
          sourceEntityId: observation.payload.id,
        };
      }
      // The `E02` row: key `pay_…`, "`P1` recognised the receivable; its
      // disposition is unknown". §14.1 values a payment recon line at
      // `payload.amount` — "the gross the `P1` receivable was recognised at, so
      // relieving it takes the same figure".
      const line = reconLineOf(observation, rule);
      if (line.type !== "payment") {
        throw new JournalError(
          "$.observation.payload.type",
          `P6 on a recon_line is DATA_MODEL.md §17.1.1's E02 row, whose key is ` +
            `pay_…; received type ${JSON.stringify(line.type)}`,
        );
      }
      return {
        legs: [dr(SUSPENSE_ACCOUNT, line.amount), cr("1100_GATEWAY_RECEIVABLE", line.amount)],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    // | P8 | Conservative fallback — any adjustment observation, since its
    //        accounting cause is not observable
    // | debit non-zero: DR 9000 M / CR 1200_BANK M
    // | credit non-zero: DR 1200_BANK M / CR 9000 M |
    //
    // **Narrowed at spec 1.4.0 and not a catch-all.** "`P8` applies to
    // adjustment observations and to nothing else." The universal reading "was
    // not constructible and is withdrawn" (`§17.2`, `§A.7` G-F): outside
    // adjustments no `M` exists, `M` is not unique on the rows that reached the
    // fallback, and where it is unique it is the wrong figure.
    case "P8": {
      if (observation.kind !== "adjustment") {
        throw new JournalError(
          "$.observation.kind",
          `P8 applies to adjustment observations and to nothing else ` +
            `(DATA_MODEL.md §17.2, spec 1.4.0; DECISION_BRIEF.md §A.7 G-F); ` +
            `received kind ${JSON.stringify(observation.kind)}`,
        );
      }
      const line = observation.payload;
      const { m, debitSide } = adjustmentM(line.debit, line.credit);
      return {
        // "The bank leg posts in its true economic direction, so `1200_BANK`
        // agrees with truth and contributes no harm."
        legs: debitSide
          ? [dr(SUSPENSE_ACCOUNT, m), cr("1200_BANK", m)]
          : [dr("1200_BANK", m), cr(SUSPENSE_ACCOUNT, m)],
        sourceEntityId: reconLineKey(line.entity_id, line.type),
      };
    }

    default: {
      const unreachable: never = rule;
      throw new JournalError("$", `unhandled posting rule ${String(unreachable)}`);
    }
  }
}

/**
 * `P7` — "exact reversal of P5 or P6 under the **same** `source_entity_id`".
 *
 * Exact means every leg keeps its account and its amount and swaps its side, so
 * reversing twice returns the opening. Under `§17.1`'s convention
 * `balance(acct) = Σ dr − Σ cr` that is what nets the item to zero, and `§16`
 * makes *open* arithmetic rather than a flag: "a resolved item nets to zero and
 * leaves `Σ |item_net_paise|` by arithmetic rather than by a flag someone must
 * remember to set."
 *
 * **Only a `P5` or a `P6` opening is accepted**, because those are the two
 * `§17.1`'s `P7` row names. A `P8` opening is refused rather than reversed by
 * analogy: `§17.1` does not name it, and `DECISION_BRIEF.md §L.4` makes
 * extending a posting rule to a case the table does not enumerate a spec
 * amendment. Refusing is the non-inventing answer — it declines to post where
 * no rule authorises a posting.
 */
function reverseOpening(opening: readonly JournalLine[]): Construction {
  const path = "$.opening";
  if (opening.length !== 2) {
    throw new JournalError(
      path,
      `a P5 or P6 opening is two lines (DATA_MODEL.md §17.1); received ` +
        `${String(opening.length)}`,
    );
  }
  const [first, second] = opening as readonly [JournalLine, JournalLine];
  if (first.source_entity_id !== second.source_entity_id) {
    throw new JournalError(
      path,
      `both legs of one posting carry one source_entity_id (DATA_MODEL.md §16); ` +
        `received ${JSON.stringify(first.source_entity_id)} and ` +
        `${JSON.stringify(second.source_entity_id)}`,
    );
  }

  const accounts = [first.account, second.account].sort();
  const suspenseLeg = first.account === SUSPENSE_ACCOUNT ? first : second;
  const counterLeg = first.account === SUSPENSE_ACCOUNT ? second : first;

  // P5: DR 1200_BANK / CR 9000.   P6: DR 9000 / CR 1100_GATEWAY_RECEIVABLE.
  const isP5 =
    accounts[0] === "1200_BANK" &&
    accounts[1] === SUSPENSE_ACCOUNT &&
    counterLeg.dr_paise > 0 &&
    suspenseLeg.cr_paise > 0;
  const isP6 =
    accounts[0] === "1100_GATEWAY_RECEIVABLE" &&
    accounts[1] === SUSPENSE_ACCOUNT &&
    suspenseLeg.dr_paise > 0 &&
    counterLeg.cr_paise > 0;

  if (!isP5 && !isP6) {
    throw new JournalError(
      path,
      `P7 reverses a P5 or a P6 opening and DATA_MODEL.md §17.1 names no other ` +
        `(a P8 opening is a spec amendment, DECISION_BRIEF.md §L.4); received ` +
        `${accounts.join(" + ")} with ` +
        `dr on ${first.dr_paise > 0 ? first.account : second.account}`,
    );
  }
  if (suspenseLeg.dr_paise + suspenseLeg.cr_paise !== counterLeg.dr_paise + counterLeg.cr_paise) {
    throw new JournalError(
      path,
      `an opening posting balances (invariant I1); received ` +
        `${String(suspenseLeg.dr_paise + suspenseLeg.cr_paise)} against ` +
        `${String(counterLeg.dr_paise + counterLeg.cr_paise)}`,
    );
  }

  return {
    legs: opening.map((line) =>
      line.dr_paise > 0
        ? cr(line.account, line.dr_paise)
        : dr(line.account, line.cr_paise),
    ),
    sourceEntityId: first.source_entity_id,
  };
}

// ---------------------------------------------------------------------------
// D — journal invariant validation
// ---------------------------------------------------------------------------

/**
 * Order lines by `ACCOUNT_CODES` index — ascending account code.
 *
 * The specification states no line order for the agent's `journal_lines`, and
 * one has to be chosen: the field enters `LedgerEvent.body` (`§16`), so two
 * orders are two digests for one posting and `I9`/metric 23 require the same
 * inputs to produce the same root hash. This module reuses the rule the
 * specification *does* state for the counterpart journal — `§1`'s `true_journal`
 * is emitted in simulated-time order "ties broken by `source_entity_id`
 * ascending, then by `account` ascending", and within one posting the first two
 * keys are constant, so the account is the tie-break that survives.
 *
 * It is a **total** order here because no rule among `P1`–`P8` touches one
 * account twice; `assertNoRepeatedAccount` asserts that rather than assuming it.
 * Ordering by index rather than by string comparison keeps it locale-free:
 * `Intl` and `localeCompare` can reorder digits under some collations, and a
 * digest must not depend on the machine's locale.
 *
 * No gate reads line order — `G2` and `G3` are sums, and `proj_agent` /
 * `proj_truth` are sums — so this fixes a digest, not an accounting outcome.
 */
function orderLegs(legs: readonly Leg[]): readonly Leg[] {
  const index = (account: AccountCode): number => ACCOUNT_CODES.indexOf(account);
  return [...legs].sort((a, b) => index(a.account) - index(b.account));
}

function assertNoRepeatedAccount(legs: readonly Leg[], rule: PostingRef): void {
  const seen = new Set<AccountCode>();
  for (const leg of legs) {
    if (seen.has(leg.account)) {
      throw new JournalError(
        "$",
        `${rule} posted ${leg.account} twice; no rule in DATA_MODEL.md §17.1 or ` +
          `§17.2 does, and two legs on one account are one posting wearing two ` +
          `memos`,
      );
    }
    seen.add(leg.account);
  }
}

/**
 * Turn legs into `§16` journal lines, and refuse anything that is not one.
 *
 * Three rules decide what survives, and each is `§16`'s or `§17`'s:
 *
 * - **A zero leg is dropped, not posted.** `§16` requires "exactly one of dr/cr
 *   is non-zero", so a zero-amount line is not expressible. `P2` on a zero-fee
 *   line is the case that matters: `fee = tax = 0` makes two of its four legs
 *   zero, and `credit + 0 + 0 = amount` still balances.
 * - **A posting whose every leg is zero is refused.** The trigger table says
 *   this observation posts; `§16` says a zero line cannot; this module refuses
 *   rather than choosing which to disobey. Returning silently would drop an
 *   item the queue still counts, which breaks `G3` in the direction
 *   `THREAT_MODEL.md §T8` names.
 * - **`I1` holds on the posting.** `§17` requires `Σ dr === Σ cr` "at every
 *   point in the event log", and every posting in `§17.1`/`§17.2` balances on
 *   its own, so per-posting is the strongest form of the same rule and the one
 *   that names the offending posting rather than the batch.
 */
function sealPosting(rule: PostingRef, construction: Construction): Posting {
  const ordered = orderLegs(construction.legs);
  assertNoRepeatedAccount(ordered, rule);

  const lines = ordered
    .filter((leg) => leg.amount !== 0)
    .map((leg, index) =>
      sealJournalLine(
        {
          account: leg.account,
          dr_paise: leg.side === "dr" ? leg.amount : paise(0),
          cr_paise: leg.side === "cr" ? leg.amount : paise(0),
          memo_ref: rule,
          source_entity_id: construction.sourceEntityId,
        },
        `$.lines[${String(index)}]`,
      ),
    );

  if (lines.length === 0) {
    throw new JournalError(
      "$.lines",
      `${rule} resolved to a posting of zero paise, and DATA_MODEL.md §16 admits ` +
        `no journal line with dr and cr both zero. The observation is one the ` +
        `§17.1.1 trigger table says posts, so this is refused rather than ` +
        `silently dropped`,
    );
  }

  let totalDr = 0;
  let totalCr = 0;
  for (const line of lines) {
    totalDr += line.dr_paise;
    totalCr += line.cr_paise;
  }
  // Exactness is tested before equality, for the reason `projection.ts` gives
  // on the same check: "Past 2⁵³ two totals that both lost precision can still
  // compare equal". A four-legged `P2` can exceed the safe range on a line
  // whose own arithmetic is corrupt, and an imbalance that compares equal is an
  // unbalanced journal escaping validation. Invariant `I7`.
  if (!Number.isSafeInteger(totalDr) || !Number.isSafeInteger(totalCr)) {
    throw new JournalError(
      "$.lines",
      `${rule}'s totals left the safe-integer range (DATA_MODEL.md §0 rule 1, ` +
        `invariant I7): Σ dr = ${String(totalDr)}, Σ cr = ${String(totalCr)}. ` +
        `Two inexact totals can compare equal, so exactness is tested first`,
    );
  }
  if (totalDr !== totalCr) {
    throw new JournalError(
      "$.lines",
      `${rule} does not balance: Σ dr = ${String(totalDr)}, Σ cr = ` +
        `${String(totalCr)} (invariant I1, close gate G2). ` +
        (rule === "P2"
          ? "P2 balances as credit + (fee − tax) + tax = amount, which holds " +
            "exactly when I3's credit = amount − fee holds on the line."
          : "Every posting in DATA_MODEL.md §17.1 and §17.2 balances by " +
            "construction, so this is a defect in the line's own arithmetic."),
    );
  }

  return Object.freeze({
    posts: true,
    rule,
    source_entity_id: construction.sourceEntityId,
    lines: Object.freeze(lines),
  });
}

const NON_POSTING: Readonly<Record<NonPostingGround, NonPosting>> = Object.freeze(
  Object.fromEntries(
    NON_POSTING_GROUNDS.map((ground) => [
      ground,
      Object.freeze({
        posts: false,
        rule: null,
        ground,
        lines: Object.freeze([]),
      }) as NonPosting,
    ]),
  ) as Record<NonPostingGround, NonPosting>,
);

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * The posting for one proposed occasion, or a named refusal to post.
 *
 * Pure: it reads its argument, retains nothing, mutates nothing, reaches for no
 * clock, no randomness, no locale, no filesystem and no module-level state, and
 * returns a deep-frozen result. Two calls on equal requests return equal
 * postings, which is what `I9` and metric 23 require of everything that reaches
 * `LedgerEvent.body`.
 *
 * The four phases run in order and do not see each other's inputs: selection
 * (`DATA_MODEL.md §17.1.1`) never reads an amount, construction
 * (`§17.1`, `§17.2`) never re-decides a rule, and validation (`§16`, `I1`)
 * accepts nothing it was not handed.
 *
 * @throws JournalError when the request is not a request, when the trigger
 *   table has no row for it, or when the lines it implies are not postable.
 *   Never partially posted and never repaired (`RECONCILIATION_SPEC.md §7`).
 */
export function journalFor(request: PostingRequest): JournalDecision {
  const read = readRequest(request);
  const selection = selectRule(read);
  if (!("rule" in selection)) return NON_POSTING[selection.ground];
  return sealPosting(selection.rule, buildLegs(selection.rule, read));
}
