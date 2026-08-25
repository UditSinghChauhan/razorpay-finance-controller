/**
 * `LedgerEvent` and `JournalLine` — the Layer A audit record.
 *
 * `DATA_MODEL.md §16` is normative and the interfaces below are transcribed
 * from it field for field. `ARCHITECTURE.md §8` states what Layer A is for:
 * "append-only, hash-chained, one event per decision or state change. Answers
 * *what happened, who did it, on what evidence, and when*."
 *
 * This module holds the record and its admission rules. It does not hash
 * (`hash-chain.ts`), does not decide which posting an event carries
 * (`journal.ts`, Layer B) and does not project balances (`projection.ts`,
 * Layer B).
 *
 * **Why the constructor copies rather than validates in place.** An event is
 * hashed and then published; if the object the caller still holds is the object
 * the chain stored, a mutation after the fact silently desynchronises the
 * record from its digest. `sealDraft` therefore reads every field exactly once
 * into a fresh, deep-frozen structure. Reading once also defeats a getter that
 * returns one value to the validator and another to the serializer, which a
 * validate-then-use design cannot rule out.
 */

import {
  CONSTRAINT_IDS,
  isAccountCode,
  isObservationId,
  type AccountCode,
  type ConstraintId,
  type ObservationId,
  type Sha256,
  type UnixSeconds,
} from "@assay/domain";
import { isPaise, paise, type Paise } from "@assay/money";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * A draft that may not enter the chain.
 *
 * Extends `TypeError` because `@assay/domain`'s `canonicalJson` already raises
 * `TypeError` for a value that cannot be serialized reproducibly, and these are
 * the same class of failure: a structure that must not be hashed. `path` names
 * the offending field in the same `$.a.b[0]` form that module uses.
 */
export class LedgerEventError extends TypeError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "LedgerEventError";
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Identifiers
//
// `DATA_MODEL.md §16` types these fields but the specification defines them
// nowhere, and `@assay/domain` deliberately does not: its README scopes itself
// to "the specification's [grammars], and nothing more", and `LedgerEvent` is
// not a domain entity. They are declared here because `LedgerEvent` cannot be
// typed without them, and this package owns `LedgerEvent`.
//
// `§0` rule 3 states a prefix for `evt_`, `dec_`, `cand_` and `comp_` and that
// prefix is enforced. It states nothing at all about `RunId`, `EvidenceId`,
// `LlmCallId` or `ProbeId` — no prefix, no suffix, no length — so those are
// validated as opaque reference tokens and no grammar is invented for them.
// ---------------------------------------------------------------------------

/** A ledger event id, `evt_` + suffix (`§0` rule 3). Outside the hashed body. */
export type EventId = string & { readonly __eventId: unique symbol };
/** A decision id, `dec_` + suffix (`§0` rule 3). Inside the hashed body. */
export type DecisionId = string & { readonly __decisionId: unique symbol };
/** A candidate id, `cand_` + suffix (`§0` rule 3). Reaches the body via the certificate. */
export type CandidateId = string & { readonly __candidateId: unique symbol };
/** A component id, `comp_` + suffix (`§0` rule 3). Reaches the body via the certificate. */
export type ComponentId = string & { readonly __componentId: unique symbol };

/** A run handle (`§20`). Deliberately outside the hashed body; no grammar is stated. */
export type RunId = string & { readonly __runId: unique symbol };
/** An evidence id (`§12`). Inside the hashed body; no grammar is stated. */
export type EvidenceId = string & { readonly __evidenceId: unique symbol };
/** An LLM call id (`§19`). Reaches the body via `actor`; no grammar is stated. */
export type LlmCallId = string & { readonly __llmCallId: unique symbol };
/** A probe id (`§6`). Reaches the body via the certificate; no grammar is stated. */
export type ProbeId = string & { readonly __probeId: unique symbol };

/** The four providers of `DATA_MODEL.md §19`. */
export const LLM_PROVIDER_IDS = Object.freeze([
  "offline",
  "replay",
  "anthropic",
  "openai-compatible",
] as const);

/** `DATA_MODEL.md §19`. */
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** The nine event kinds of `DATA_MODEL.md §16`, in declaration order. */
export const EVENT_KINDS = Object.freeze([
  "INGEST",
  "ANCHOR",
  "CANDIDATE",
  "PROBE",
  "RECONCILE",
  "ABSTAIN",
  "EXCEPTION",
  "RESOLVE",
  "CLOSE",
] as const);

/** `DATA_MODEL.md §16`. */
export type EventKind = (typeof EVENT_KINDS)[number];

/** The three actor types of `DATA_MODEL.md §16`. */
export const ACTOR_TYPES = Object.freeze([
  "deterministic",
  "llm",
  "human",
] as const);

/** `DATA_MODEL.md §16`. */
export type ActorType = (typeof ACTOR_TYPES)[number];

/** The three abstention reasons of `DATA_MODEL.md §13`. */
export const CERTIFICATE_REASONS = Object.freeze([
  "EVIDENCE_TIE",
  "SEARCH_BOUND_EXCEEDED",
  "PROBE_BUDGET_EXHAUSTED",
] as const);

/** `DATA_MODEL.md §13`. */
export type CertificateReason = (typeof CERTIFICATE_REASONS)[number];

/** A unit score in basis points (`§0` rule 5): "a unit score is `10_000`". */
const UNIT_SCORE_BPS = 10_000;

// ---------------------------------------------------------------------------
// The record — `DATA_MODEL.md §16`
// ---------------------------------------------------------------------------

/**
 * One leg of a posting.
 *
 * `§16`: "exactly one of dr/cr is non-zero", and `memo_ref` is "reference only,
 * never free text from input".
 */
export interface JournalLine {
  readonly account: AccountCode;
  readonly dr_paise: Paise;
  readonly cr_paise: Paise;
  readonly memo_ref: string;
}

/**
 * Who took the step, and whether a model was involved.
 *
 * `§16`: the block "is what lets a reviewer answer 'was a model involved in
 * this decision, and which one?' without reading prose". It enters the hashed
 * body **in full** — "it contains no wall-clock field, so no exclusion is
 * needed there".
 */
export interface EventActor {
  readonly type: ActorType;
  readonly component: string;
  readonly engine_commit: string;
  readonly llm_provider: LlmProviderId | null;
  readonly model_id: string | null;
  readonly prompt_hash: Sha256 | null;
  readonly llm_call_id: LlmCallId | null;
}

/** `DATA_MODEL.md §13`. One of the two allocations no hard evidence separates. */
export interface CertificateSolution {
  readonly candidate_id: CandidateId;
  readonly member_obs_ids: readonly ObservationId[];
}

/**
 * `DATA_MODEL.md §13` — "the product ... the difference between 'confidence
 * 0.62' and 'here is the specific alternative I could not rule out'".
 *
 * Declared here because it is a field of `LedgerEvent` and therefore part of
 * the hashed body. The engine produces it; this package only admits it.
 */
export interface AmbiguityCertificate {
  readonly comp_id: ComponentId;
  readonly solution_a: CertificateSolution;
  readonly solution_b: CertificateSolution;
  readonly shared_hard_constraints: readonly ConstraintId[];
  readonly evidence_score_gap_bps: number;
  readonly materiality_paise: Paise;
  readonly epsilon_bps: number;
  readonly tau_paise: Paise;
  readonly probes_attempted: readonly ProbeId[];
  readonly reason: CertificateReason;
}

/**
 * The caller-supplied part of an event: `§16` minus the three fields the chain
 * owns.
 *
 * `seq`, `prev_hash` and `hash` are deliberately absent. They are properties of
 * an event's *position*, not of the step that produced it, and a caller that
 * cannot supply them cannot forge a sequence number, re-point a link or claim a
 * digest — three of the tamper paths become unreachable rather than merely
 * detected.
 */
export interface LedgerEventDraft {
  readonly evt_id: EventId;
  readonly run_id: RunId;
  readonly ts: UnixSeconds;
  readonly actor: EventActor;
  readonly kind: EventKind;
  readonly subject_ids: readonly string[];
  readonly evidence_ids: readonly EvidenceId[];
  readonly decision_id: DecisionId | null;
  readonly inputs_hash: Sha256;
  readonly journal_lines: readonly JournalLine[];
  readonly certificate: AmbiguityCertificate | null;
}

/** A draft once the chain has assigned its position. The hashed body projects from this. */
export interface LedgerEventContent extends LedgerEventDraft {
  readonly seq: number;
}

/** `DATA_MODEL.md §16` in full. */
export interface LedgerEvent extends LedgerEventContent {
  readonly prev_hash: Sha256;
  readonly hash: Sha256;
}

// ---------------------------------------------------------------------------
// Field readers
//
// Each reads its argument exactly once and returns a value that is either a
// primitive or a frozen structure. Nothing here mutates, and nothing retains a
// reference to anything the caller passed in.
// ---------------------------------------------------------------------------

/**
 * Code points forbidden in a reference token.
 *
 * Expressed as numeric ranges and tested per code point rather than as a
 * regular expression, so that no control character appears literally in this
 * source file — the same construction, and the same reason, as
 * `@assay/domain`'s `sanitizeForPreview`.
 *
 * The set is that function's, plus tab, newline and carriage return. Those
 * three are ordinary content in a bank narration and it keeps them; they are
 * not ordinary content in an account reference, a component name or a commit
 * hash, and `§16` says `memo_ref` is "reference only, never free text from
 * input". Rejecting them is how that sentence is enforced rather than assumed.
 */
const FORBIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], // C0 controls, including tab, newline and carriage return
  [0x7f, 0x9f], // DEL and the C1 controls
  [0x200b, 0x200f], // zero-width space/joiners and the LTR/RTL marks
  [0x2028, 0x2029], // line and paragraph separators
  [0x202a, 0x202e], // bidirectional embedding and override
  [0x2066, 0x2069], // bidirectional isolates
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
];

function hasForbiddenCodePoint(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (FORBIDDEN_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) return true;
  }
  return false;
}

/** A non-empty string carrying no control or text-spoofing code point. */
export function readToken(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new LedgerEventError(path, `expected a string, received ${describe(value)}`);
  }
  if (value.length === 0) {
    throw new LedgerEventError(path, "expected a non-empty string");
  }
  if (hasForbiddenCodePoint(value)) {
    throw new LedgerEventError(
      path,
      "a reference token may not carry control or text-spoofing code points " +
        "(DATA_MODEL.md §0 rule 4, §16)",
    );
  }
  return value;
}

const ASSAY_SUFFIX = /^[A-Za-z0-9]+$/;

/**
 * A token carrying one of `§0` rule 3's ASSAY prefixes.
 *
 * The suffix character class follows `@assay/domain`'s: alphanumeric, with the
 * length deliberately unconstrained because the specification states none.
 */
function readPrefixedId<T extends string>(
  value: unknown,
  path: string,
  prefix: string,
): T {
  const token = readToken(value, path);
  if (!token.startsWith(prefix) || !ASSAY_SUFFIX.test(token.slice(prefix.length))) {
    throw new LedgerEventError(
      path,
      `expected an identifier matching ${prefix}[A-Za-z0-9]+ (DATA_MODEL.md §0 rule 3), ` +
        `received ${JSON.stringify(token)}`,
    );
  }
  return token as T;
}

export function readSha256(value: unknown, path: string): Sha256 {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new LedgerEventError(
      path,
      `expected 64 lowercase hexadecimal characters, received ${describe(value)}`,
    );
  }
  return value as Sha256;
}

function readMember<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new LedgerEventError(
      path,
      `expected one of ${allowed.join(" | ")}, received ${describe(value)}`,
    );
  }
  return value as T;
}

/**
 * A monetary amount.
 *
 * Validity is `@assay/money`'s `isPaise`, never a second opinion about what an
 * integer is, and the value is passed through `paise()` so that a negative zero
 * cannot enter the chain as a second spelling of zero.
 */
function readPaise(value: unknown, path: string, minimum: number): Paise {
  if (typeof value !== "number" || !isPaise(value)) {
    throw new LedgerEventError(
      path,
      `expected an exact integer of paise within the safe range ` +
        `(DATA_MODEL.md §0 rule 1), received ${describe(value)}`,
    );
  }
  if (value < minimum) {
    throw new LedgerEventError(
      path,
      `expected at least ${String(minimum)} paise, received ${String(value)}`,
    );
  }
  return paise(value);
}

function readBoundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new LedgerEventError(
      path,
      `expected a safe integer, received ${describe(value)}`,
    );
  }
  if (value < minimum || value > maximum) {
    throw new LedgerEventError(
      path,
      `expected an integer in [${String(minimum)}, ${String(maximum)}], ` +
        `received ${String(value)}`,
    );
  }
  return value === 0 ? 0 : value;
}

/** A plain object, and nothing else. Class instances and proxied exotics are refused. */
function readObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new LedgerEventError(
      path,
      `expected an object, received ${describe(value)}`,
    );
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new LedgerEventError(
      path,
      "expected a plain object; a class instance or exotic object cannot be " +
        "canonically serialized (DATA_MODEL.md §0 rule 5)",
    );
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new LedgerEventError(path, `expected an array, received ${describe(value)}`);
  }
  return value as readonly unknown[];
}

/**
 * Reject any key the schema does not name.
 *
 * `ARCHITECTURE.md §4` requires strict parsing at trust boundary 1 because
 * "stripping would let a field ASSAY does not model travel silently beside one
 * it does". The same argument is sharper here: an unmodelled key would be
 * copied into the hashed body by nothing and would therefore be invisible to
 * the chain, which is precisely the gap a hash chain exists to close.
 */
function rejectUnknownKeys(
  record: Record<string, unknown>,
  path: string,
  known: readonly string[],
): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      throw new LedgerEventError(
        `${path}.${key}`,
        "unknown field; the record is strict (ARCHITECTURE.md §4)",
      );
    }
  }
}

function readNullable<T>(
  value: unknown,
  path: string,
  read: (inner: unknown, innerPath: string) => T,
): T | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new LedgerEventError(
      path,
      "expected a value or null; undefined is dropped by JSON.stringify and " +
        "would vanish from the hashed body (DATA_MODEL.md §0 rule 5)",
    );
  }
  return read(value, path);
}

/**
 * Name a rejected value for the error message.
 *
 * The object branch does not reach for `constructor.name`: an object created
 * with `Object.create(null)` has no `constructor`, and reading `.name` off it
 * threw a bare `TypeError` carrying no field path. That failure was invisible
 * in the suite, because `LedgerEventError` extends `TypeError` and every
 * assertion of the form `toThrow(TypeError)` passed either way.
 */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === null) return "an object with a null prototype";
    const name: unknown = (value as { constructor?: { name?: unknown } }).constructor
      ?.name;
    return typeof name === "string" ? `an instance of ${name}` : "an object";
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value;
}

// ---------------------------------------------------------------------------
// The sealing constructor
// ---------------------------------------------------------------------------

const JOURNAL_LINE_KEYS = ["account", "dr_paise", "cr_paise", "memo_ref"] as const;

function sealJournalLine(value: unknown, path: string): JournalLine {
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, JOURNAL_LINE_KEYS);

  const account = readToken(record["account"], `${path}.account`);
  if (!isAccountCode(account)) {
    throw new LedgerEventError(
      `${path}.account`,
      `expected one of the seven control accounts (DATA_MODEL.md §17), ` +
        `received ${JSON.stringify(account)}`,
    );
  }

  // Non-negative because every posting in the §17.1 / §17.2 tables is a
  // magnitude, and P7 reverses by swapping the two sides rather than by
  // negating one. Admitting a negative debit would give one economic fact two
  // spellings and therefore two different hashed bodies. This bound is this
  // package's contract; the specification states the sign convention for
  // *balances* (§17.1) and not for postings.
  const dr = readPaise(record["dr_paise"], `${path}.dr_paise`, 0);
  const cr = readPaise(record["cr_paise"], `${path}.cr_paise`, 0);

  // §16: "exactly one of dr/cr is non-zero". A line with both zero carries no
  // value and would still enter the body; a line with both non-zero is two
  // postings wearing one memo.
  if ((dr === 0) === (cr === 0)) {
    throw new LedgerEventError(
      path,
      `exactly one of dr_paise / cr_paise must be non-zero (DATA_MODEL.md §16), ` +
        `received dr=${String(dr)} cr=${String(cr)}`,
    );
  }

  return Object.freeze({
    account,
    dr_paise: dr,
    cr_paise: cr,
    memo_ref: readToken(record["memo_ref"], `${path}.memo_ref`),
  });
}

const ACTOR_KEYS = [
  "type",
  "component",
  "engine_commit",
  "llm_provider",
  "model_id",
  "prompt_hash",
  "llm_call_id",
] as const;

function sealActor(value: unknown, path: string): EventActor {
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, ACTOR_KEYS);

  return Object.freeze({
    type: readMember(record["type"], `${path}.type`, ACTOR_TYPES),
    component: readToken(record["component"], `${path}.component`),
    engine_commit: readToken(record["engine_commit"], `${path}.engine_commit`),
    llm_provider: readNullable(
      record["llm_provider"],
      `${path}.llm_provider`,
      (inner, innerPath) => readMember(inner, innerPath, LLM_PROVIDER_IDS),
    ),
    model_id: readNullable(record["model_id"], `${path}.model_id`, readToken),
    prompt_hash: readNullable(record["prompt_hash"], `${path}.prompt_hash`, readSha256),
    llm_call_id: readNullable(
      record["llm_call_id"],
      `${path}.llm_call_id`,
      (inner, innerPath) => readToken(inner, innerPath) as LlmCallId,
    ),
  });
}

const SOLUTION_KEYS = ["candidate_id", "member_obs_ids"] as const;

function sealSolution(value: unknown, path: string): CertificateSolution {
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, SOLUTION_KEYS);

  const members = readArray(record["member_obs_ids"], `${path}.member_obs_ids`);
  return Object.freeze({
    candidate_id: readPrefixedId<CandidateId>(
      record["candidate_id"],
      `${path}.candidate_id`,
      "cand_",
    ),
    member_obs_ids: Object.freeze(
      members.map((member, index) => {
        const memberPath = `${path}.member_obs_ids[${String(index)}]`;
        const token = readToken(member, memberPath);
        if (!isObservationId(token)) {
          throw new LedgerEventError(
            memberPath,
            `expected an observation id matching obs_[A-Za-z0-9]+ ` +
              `(DATA_MODEL.md §0 rule 3), received ${JSON.stringify(token)}`,
          );
        }
        return token as ObservationId;
      }),
    ),
  });
}

const CERTIFICATE_KEYS = [
  "comp_id",
  "solution_a",
  "solution_b",
  "shared_hard_constraints",
  "evidence_score_gap_bps",
  "materiality_paise",
  "epsilon_bps",
  "tau_paise",
  "probes_attempted",
  "reason",
] as const;

/**
 * `DATA_MODEL.md §13`, structurally.
 *
 * The cross-field relation §13 states — the gap is "strictly below
 * `epsilon_bps`" — is deliberately **not** enforced. It reads naturally for
 * `EVIDENCE_TIE`, and whether it holds for a `SEARCH_BOUND_EXCEEDED`
 * certificate is an open governance question at the time of writing. Enforcing
 * it here would settle that question in the ledger, which is not where it is
 * settled. The fields are admitted; the relation belongs to the stage that
 * constructs the certificate, once the question is closed.
 */
function sealCertificate(value: unknown, path: string): AmbiguityCertificate {
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, CERTIFICATE_KEYS);

  const constraints = readArray(
    record["shared_hard_constraints"],
    `${path}.shared_hard_constraints`,
  );
  const probes = readArray(record["probes_attempted"], `${path}.probes_attempted`);

  return Object.freeze({
    comp_id: readPrefixedId<ComponentId>(record["comp_id"], `${path}.comp_id`, "comp_"),
    solution_a: sealSolution(record["solution_a"], `${path}.solution_a`),
    solution_b: sealSolution(record["solution_b"], `${path}.solution_b`),
    shared_hard_constraints: Object.freeze(
      constraints.map((constraint, index) =>
        readMember(
          constraint,
          `${path}.shared_hard_constraints[${String(index)}]`,
          CONSTRAINT_IDS,
        ),
      ),
    ),
    // §13 states the range: "integer |score_a - score_b| in basis points,
    // 0..10_000".
    evidence_score_gap_bps: readBoundedInteger(
      record["evidence_score_gap_bps"],
      `${path}.evidence_score_gap_bps`,
      0,
      UNIT_SCORE_BPS,
    ),
    materiality_paise: readPaise(
      record["materiality_paise"],
      `${path}.materiality_paise`,
      0,
    ),
    // The value in force is frozen at seal time by PREREGISTRATION.md §7 and
    // §L.1 rule 12; the certificate records whichever margin was in force, so
    // the ledger checks that it is a non-negative integer and does not assert
    // the constant.
    epsilon_bps: readBoundedInteger(
      record["epsilon_bps"],
      `${path}.epsilon_bps`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    tau_paise: readPaise(record["tau_paise"], `${path}.tau_paise`, 0),
    probes_attempted: Object.freeze(
      probes.map(
        (probe, index) =>
          readToken(probe, `${path}.probes_attempted[${String(index)}]`) as ProbeId,
      ),
    ),
    reason: readMember(record["reason"], `${path}.reason`, CERTIFICATE_REASONS),
  });
}

const DRAFT_KEYS = [
  "evt_id",
  "run_id",
  "ts",
  "actor",
  "kind",
  "subject_ids",
  "evidence_ids",
  "decision_id",
  "inputs_hash",
  "journal_lines",
  "certificate",
] as const;

/** The three fields the chain owns. A caller may not supply them. */
const CHAIN_KEYS = ["seq", "prev_hash", "hash"] as const;

const EVENT_KEYS = [...DRAFT_KEYS, ...CHAIN_KEYS] as const;

/**
 * Read the eleven caller-owned fields into a fresh, deep-frozen structure.
 *
 * `subject_ids` and `evidence_ids` keep the caller's order. `§16` requires them
 * "in the order the emitting stage produced them — that order is itself
 * deterministic", so sorting here would destroy information the emitting stage
 * is responsible for and is explicitly forbidden.
 */
function sealDraftFields(
  record: Record<string, unknown>,
  path: string,
): LedgerEventDraft {
  const kind = readMember(record["kind"], `${path}.kind`, EVENT_KINDS);
  const actor = sealActor(record["actor"], `${path}.actor`);

  // §16: "For any `RECONCILE` event, `actor.type` is always `deterministic` —
  // by construction." This is that construction. ARCHITECTURE.md §3 puts the
  // burden here rather than on callers: append-only semantics and the ledger's
  // invariants are "properties of this package, not conventions its callers
  // must remember".
  if (kind === "RECONCILE" && actor.type !== "deterministic") {
    throw new LedgerEventError(
      `${path}.actor.type`,
      `a RECONCILE event is deterministic by construction (DATA_MODEL.md §16), ` +
        `received ${JSON.stringify(actor.type)}`,
    );
  }

  const subjects = readArray(record["subject_ids"], `${path}.subject_ids`);
  const evidence = readArray(record["evidence_ids"], `${path}.evidence_ids`);
  const lines = readArray(record["journal_lines"], `${path}.journal_lines`);

  return Object.freeze({
    evt_id: readPrefixedId<EventId>(record["evt_id"], `${path}.evt_id`, "evt_"),
    run_id: readToken(record["run_id"], `${path}.run_id`) as RunId,
    // A positive integer of Unix seconds, matching `@assay/domain`'s
    // `unixSecondsField`: epoch zero is not a plausible capture.
    ts: readBoundedInteger(
      record["ts"],
      `${path}.ts`,
      1,
      Number.MAX_SAFE_INTEGER,
    ) as UnixSeconds,
    actor,
    kind,
    subject_ids: Object.freeze(
      subjects.map((subject, index) =>
        readToken(subject, `${path}.subject_ids[${String(index)}]`),
      ),
    ),
    evidence_ids: Object.freeze(
      evidence.map(
        (item, index) =>
          readToken(item, `${path}.evidence_ids[${String(index)}]`) as EvidenceId,
      ),
    ),
    decision_id: readNullable(
      record["decision_id"],
      `${path}.decision_id`,
      (inner, innerPath) => readPrefixedId<DecisionId>(inner, innerPath, "dec_"),
    ),
    inputs_hash: readSha256(record["inputs_hash"], `${path}.inputs_hash`),
    journal_lines: Object.freeze(
      lines.map((line, index) =>
        sealJournalLine(line, `${path}.journal_lines[${String(index)}]`),
      ),
    ),
    certificate: readNullable(
      record["certificate"],
      `${path}.certificate`,
      sealCertificate,
    ),
  });
}

/**
 * Admit a draft: validate it, copy it, and freeze the copy.
 *
 * The returned value shares no object with the argument, so a caller that keeps
 * and later mutates its draft cannot alter what was hashed.
 *
 * `seq`, `prev_hash` and `hash` are rejected as unknown keys. They belong to
 * the chain, and a draft that carries them is a caller attempting to choose its
 * own position.
 *
 * @throws LedgerEventError on any field the specification does not admit.
 */
export function sealDraft(draft: LedgerEventDraft): LedgerEventDraft {
  const path = "$";
  const record = readObject(draft, path);
  rejectUnknownKeys(record, path, DRAFT_KEYS);
  return sealDraftFields(record, path);
}

/**
 * Admit an event that already carries its position — one read back from
 * storage, a file, or an API response.
 *
 * This is the entry point verification uses. It exists because a stored event
 * is `unknown` no matter what its TypeScript type says: `verifyChain` is the
 * function that answers "was this record altered", so it cannot begin by
 * trusting the record's shape.
 *
 * @throws LedgerEventError on any field the specification does not admit.
 */
export function sealStoredEvent(value: unknown): LedgerEvent {
  const path = "$";
  const record = readObject(value, path);
  rejectUnknownKeys(record, path, EVENT_KEYS);

  const draft = sealDraftFields(record, path);
  return Object.freeze({
    ...draft,
    // Gapless from zero (§16, and §1's `true_journal` states "from 0"), so a
    // negative or fractional sequence number is not a mis-ordering, it is a
    // record that never came from a chain.
    seq: readBoundedInteger(record["seq"], `${path}.seq`, 0, Number.MAX_SAFE_INTEGER),
    prev_hash: readSha256(record["prev_hash"], `${path}.prev_hash`),
    hash: readSha256(record["hash"], `${path}.hash`),
  });
}

/** `Σ dr_paise` and `Σ cr_paise` over one event's lines. */
export function journalTotals(lines: readonly JournalLine[]): {
  readonly dr: number;
  readonly cr: number;
} {
  let dr = 0;
  let cr = 0;
  for (const line of lines) {
    dr += line.dr_paise;
    cr += line.cr_paise;
  }
  return { dr, cr };
}
