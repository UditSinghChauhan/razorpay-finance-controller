/**
 * The hash chain — Layer A's tamper-evidence mechanism.
 *
 * `DATA_MODEL.md §16` is normative:
 *
 *   hash    = sha256(canonical_json(body) ‖ prev_hash)
 *   body    = { seq, kind, actor, subject_ids, evidence_ids,
 *               decision_id, inputs_hash, journal_lines, certificate }
 *   genesis = sha256(canonical_json({dataset_hash, engine_commit, config_hash}))
 *
 * and `evt_id`, `run_id`, `prev_hash`, `hash` and `ts` are excluded from `body`.
 * Each exclusion has a reason the specification states: `prev_hash` is
 * concatenated after the digest rather than included in it, `hash` cannot cover
 * itself, and `evt_id`, `run_id` and `ts` "all vary between two executions over
 * identical inputs, which metric 23 (`determinism_check`) requires to produce
 * identical root hashes".
 *
 * The declared residual is reproduced here so nobody has to re-derive it:
 * because `ts` is outside `body`, **altering an event's timestamp is not
 * chain-detectable** (`THREAT_MODEL.md §T10`). That is an accepted cost of
 * reproducibility, not an oversight, and this package does not claim otherwise.
 *
 * `ARCHITECTURE.md §8` states the honest limit of the whole mechanism: it makes
 * tampering *evident*, not impossible. "An attacker with write access can
 * rewrite the entire chain — what they cannot do is rewrite it and match a root
 * hash that was already published."
 */

import { createHash } from "node:crypto";

import { canonicalJson, type CanonicalValue, type Sha256 } from "@assay/domain";
import { type Paise } from "@assay/money";

import {
  journalTotals,
  readSha256,
  readToken,
  sealDraft,
  sealStoredEvent,
  type LedgerEvent,
  type LedgerEventContent,
  type LedgerEventDraft,
  type RunId,
} from "./events.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Invariant `I1` failed at append.
 *
 * Distinct from `LedgerEventError` because the two demand different responses.
 * A malformed draft is a rejected allocation and the batch continues
 * (`RECONCILIATION_SPEC.md §7`); a trial balance that does not hold "can only
 * indicate a bug in the ledger itself" and is a hard abort of the whole run
 * (`ARCHITECTURE.md §12`). A caller that cannot tell them apart cannot obey
 * either rule.
 */
export class TrialBalanceError extends Error {
  readonly seq: number;
  readonly total_dr_paise: number;
  readonly total_cr_paise: number;

  constructor(seq: number, dr: number, cr: number) {
    super(
      `invariant I1 (trial balance) failed at seq ${String(seq)}: ` +
        `Σ dr = ${String(dr)} paise, Σ cr = ${String(cr)} paise ` +
        `(DATA_MODEL.md §17)`,
    );
    this.name = "TrialBalanceError";
    this.seq = seq;
    this.total_dr_paise = dr;
    this.total_cr_paise = cr;
  }
}

/** An event that does not belong to the chain it was offered to. */
export class ChainMismatchError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ChainMismatchError";
  }
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

/**
 * SHA-256 of a UTF-8 string, as 64 lowercase hexadecimal characters.
 *
 * Lowercase hex is `@assay/domain`'s contract for `Sha256`, chosen there
 * because "two representations of the same digest would produce two different
 * hashes" once a digest reaches a hashed body. This is the only place in the
 * package that computes one.
 */
function sha256Hex(input: string): Sha256 {
  return createHash("sha256").update(input, "utf8").digest("hex") as Sha256;
}

/**
 * `sha256(canonical_json(value))` — the shape every `*_hash` field in the
 * specification takes (`DATA_MODEL.md §0` rule 5).
 *
 * Offered so that a caller computing `inputs_hash` — "hash of everything the
 * step read" (`§16`) — uses the same encoding the chain does. *What* a step
 * read is the step's business; how those bytes are formed is not.
 */
export function hashCanonical(value: CanonicalValue): Sha256 {
  return sha256Hex(canonicalJson(value));
}

/** The three inputs genesis binds the chain to (`DATA_MODEL.md §16`). */
export interface GenesisInputs {
  readonly dataset_hash: Sha256;
  readonly engine_commit: string;
  readonly config_hash: Sha256;
}

/**
 * `sha256(canonical_json({dataset_hash, engine_commit, config_hash}))`.
 *
 * "This binds the chain to the exact inputs, so a report cannot be attached to
 * a different dataset after the fact" (`§16`).
 *
 * `run_id` and `started_at` were part of genesis in spec 1.1.1 and were removed
 * in 1.2.0: "both vary per execution, so including them made two runs over
 * identical inputs produce different root hashes by construction and made
 * metric 23 unsatisfiable". They are not accepted here, and the strict key
 * check below is what stops one being reintroduced by a caller passing a wider
 * object.
 *
 * @throws LedgerEventError if any input is malformed or unrecognised.
 */
export function computeGenesisHash(inputs: GenesisInputs): Sha256 {
  const record: Record<string, unknown> = { ...inputs };
  for (const key of Object.keys(record)) {
    if (key !== "dataset_hash" && key !== "engine_commit" && key !== "config_hash") {
      throw new ChainMismatchError(
        `genesis binds exactly (dataset_hash, engine_commit, config_hash) ` +
          `(DATA_MODEL.md §16); received an extra field ${JSON.stringify(key)}`,
      );
    }
  }

  return hashCanonical({
    config_hash: readSha256(record["config_hash"], "$.config_hash"),
    dataset_hash: readSha256(record["dataset_hash"], "$.dataset_hash"),
    engine_commit: readToken(record["engine_commit"], "$.engine_commit"),
  });
}

/**
 * The hashed `body` — `DATA_MODEL.md §16`'s projection, and nothing else.
 *
 * Every field is copied out by name rather than by spreading the event, so the
 * projection is checkable against the specification line by line and no field
 * added to `LedgerEvent` in a later revision can reach the digest by accident.
 * The nested structures are rebuilt for the same reason.
 *
 * Key order is irrelevant to the output — `canonicalJson` sorts
 * lexicographically — but array order is semantic and is preserved exactly.
 */
export function canonicalEventBody(content: LedgerEventContent): CanonicalValue {
  const { actor, certificate } = content;

  return {
    seq: content.seq,
    kind: content.kind,
    actor: {
      type: actor.type,
      component: actor.component,
      engine_commit: actor.engine_commit,
      llm_provider: actor.llm_provider,
      model_id: actor.model_id,
      prompt_hash: actor.prompt_hash,
      llm_call_id: actor.llm_call_id,
    },
    subject_ids: content.subject_ids.map((id) => id),
    evidence_ids: content.evidence_ids.map((id) => id as string),
    decision_id: content.decision_id as string | null,
    inputs_hash: content.inputs_hash as string,
    journal_lines: content.journal_lines.map((line) => ({
      account: line.account as string,
      dr_paise: line.dr_paise as number,
      cr_paise: line.cr_paise as number,
      memo_ref: line.memo_ref,
    })),
    certificate:
      certificate === null
        ? null
        : {
            comp_id: certificate.comp_id as string,
            solution_a: {
              candidate_id: certificate.solution_a.candidate_id as string,
              member_obs_ids: certificate.solution_a.member_obs_ids.map(
                (id) => id as string,
              ),
            },
            solution_b: {
              candidate_id: certificate.solution_b.candidate_id as string,
              member_obs_ids: certificate.solution_b.member_obs_ids.map(
                (id) => id as string,
              ),
            },
            shared_hard_constraints: certificate.shared_hard_constraints.map(
              (id) => id as string,
            ),
            evidence_score_gap_bps: certificate.evidence_score_gap_bps,
            materiality_paise: certificate.materiality_paise as number,
            epsilon_bps: certificate.epsilon_bps,
            tau_paise: certificate.tau_paise as number,
            probes_attempted: certificate.probes_attempted.map((id) => id as string),
            reason: certificate.reason,
          },
  };
}

/**
 * `sha256(canonical_json(body) ‖ prev_hash)`.
 *
 * **The specification writes `‖` and does not say in what encoding.** This
 * package binds it to concatenation of the two as text: the canonical JSON of
 * the body, then the 64 lowercase hexadecimal characters of `prev_hash`, hashed
 * as UTF-8. The alternative — appending the 32 raw digest bytes — is equally
 * defensible and produces different digests, so one had to be chosen and
 * written down.
 *
 * The choice is unambiguous rather than merely conventional: a canonical body
 * always ends in `}` and `prev_hash` is always exactly 64 characters, so the
 * boundary between the two halves can be recovered from the concatenation and
 * no pair of distinct (body, prev_hash) inputs can produce the same string.
 */
export function computeEventHash(
  content: LedgerEventContent,
  prevHash: Sha256,
): Sha256 {
  return sha256Hex(canonicalJson(canonicalEventBody(content)) + prevHash);
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/**
 * An append-only chain of events, as an immutable value.
 *
 * There is no mutating operation: `appendEvent` returns a new chain and leaves
 * its argument untouched, which is a stronger statement of "nothing is ever
 * updated or deleted" (`ARCHITECTURE.md §8`) than a guarded setter would be.
 * The events are deep-frozen and shared between successive chains, so appending
 * copies references and never the records themselves.
 *
 * This layer is pure. It performs no I/O and holds no connection: persistence
 * is Layer B's SQLite tables (`ARCHITECTURE.md §8`), and the single
 * `ValidatedDecision` write path of `DECISION_BRIEF.md §L.1` rule 4 lands with
 * stage S5, which does not yet exist. Layer A therefore exposes no mutating
 * function at all — the count of them is zero, not one.
 */
export interface LedgerChain {
  readonly genesis_hash: Sha256;
  /** Every event in a chain belongs to one run — `§16`: "gapless, per run". */
  readonly run_id: RunId;
  readonly events: readonly LedgerEvent[];
  /**
   * The chain's root hash: the last event's `hash`, or `genesis_hash` when the
   * chain is empty.
   *
   * `§16` and gate `G4` both use the term "root hash" without defining it. In a
   * hash chain the head is the only value that commits to every earlier record,
   * and `G4` — "hash chain recomputes from genesis and matches the stored root
   * hash" — is only a whole-chain check under that reading. It is this
   * package's contract, stated because the specification leaves it implicit.
   */
  readonly root_hash: Sha256;
  /**
   * Running `Σ dr_paise` / `Σ cr_paise` across every posted line.
   *
   * An append-time guard for `I1` only, never an authoritative balance:
   * `ARCHITECTURE.md §8` requires balances to be recomputed by projection and
   * "never cached authoritatively", and `verifyChain` accordingly recomputes
   * both totals from the events and never reads these fields. Per-account
   * balances are Layer B's projection and are deliberately absent here.
   */
  readonly total_dr_paise: Paise;
  readonly total_cr_paise: Paise;
}

/** An empty chain bound to `genesisHash`, for run `runId`. */
export function createChain(genesisHash: Sha256, runId: RunId): LedgerChain {
  const genesis = readSha256(genesisHash, "$.genesis_hash");
  return Object.freeze({
    genesis_hash: genesis,
    run_id: readToken(runId, "$.run_id") as RunId,
    events: Object.freeze([] as readonly LedgerEvent[]),
    root_hash: genesis,
    total_dr_paise: 0 as Paise,
    total_cr_paise: 0 as Paise,
  });
}

/**
 * Seal `draft`, link it to the head, and return the extended chain.
 *
 * The caller supplies neither `seq` nor `prev_hash`: `seq` is the current
 * length, which is strictly increasing and gapless from zero because it cannot
 * be anything else, and `prev_hash` is the current root. Two of the tamper
 * paths a chain exists to detect are therefore unreachable at construction
 * rather than merely detected afterwards.
 *
 * `I1` is checked on the cumulative totals after the append, which is `§17`'s
 * wording exactly — "at every point in the event log, `Σ dr_paise === Σ cr_paise`".
 * Because the check runs after *every* append, it is equivalent to requiring
 * each event to balance on its own, which every posting in `§17.1` and `§17.2`
 * does by construction.
 *
 * @throws LedgerEventError if the draft is malformed.
 * @throws ChainMismatchError if the draft belongs to another run.
 * @throws TrialBalanceError if the append would break `I1`.
 */
export function appendEvent(
  chain: LedgerChain,
  draft: LedgerEventDraft,
): LedgerChain {
  // The chain is normally one this module produced, but nothing in the type
  // system says so: a hand-built object satisfying `LedgerChain` would
  // otherwise link the new event to whatever string it carried, and an event
  // whose `prev_hash` is not a digest is a record no chain could have made.
  if (!/^[0-9a-f]{64}$/.test(chain.root_hash)) {
    throw new ChainMismatchError(
      `the chain's root hash is not a digest: ${JSON.stringify(chain.root_hash)}`,
    );
  }

  const sealed = sealDraft(draft);

  if (sealed.run_id !== chain.run_id) {
    throw new ChainMismatchError(
      `event ${sealed.evt_id} belongs to run ${JSON.stringify(sealed.run_id)}, ` +
        `but the chain is for run ${JSON.stringify(chain.run_id)}; ` +
        `sequence numbers are gapless per run (DATA_MODEL.md §16)`,
    );
  }

  const content: LedgerEventContent = Object.freeze({
    ...sealed,
    seq: chain.events.length,
  });
  const prevHash = chain.root_hash;
  const event: LedgerEvent = Object.freeze({
    ...content,
    prev_hash: prevHash,
    hash: computeEventHash(content, prevHash),
  });

  const { dr, cr } = journalTotals(event.journal_lines);
  const totalDr = chain.total_dr_paise + dr;
  const totalCr = chain.total_cr_paise + cr;
  if (!Number.isSafeInteger(totalDr) || !Number.isSafeInteger(totalCr)) {
    throw new TrialBalanceError(event.seq, totalDr, totalCr);
  }
  if (totalDr !== totalCr) {
    throw new TrialBalanceError(event.seq, totalDr, totalCr);
  }

  return Object.freeze({
    genesis_hash: chain.genesis_hash,
    run_id: chain.run_id,
    events: Object.freeze([...chain.events, event]),
    root_hash: event.hash,
    total_dr_paise: totalDr as Paise,
    total_cr_paise: totalCr as Paise,
  });
}

// ---------------------------------------------------------------------------
// Verification — gate G4 and `GET /runs/:id/ledger/verify`
// ---------------------------------------------------------------------------

/** The named checks `verifyChain` performs. */
export type ChainCheck =
  | "STRUCTURE"
  | "RUN_ID"
  | "EVENT_ID_UNIQUE"
  | "SEQUENCE"
  | "PREV_HASH"
  | "EVENT_HASH"
  | "TRIAL_BALANCE"
  | "ROOT_HASH";

/** One failed check, located. */
export interface ChainFailure {
  readonly index: number | null;
  readonly seq: number | null;
  readonly evt_id: string | null;
  readonly check: ChainCheck;
  readonly detail: string;
}

/** The outcome of recomputing a chain from genesis. */
export interface ChainVerification {
  readonly ok: boolean;
  readonly root_hash: Sha256;
  readonly event_count: number;
  readonly total_dr_paise: number;
  readonly total_cr_paise: number;
  readonly failures: readonly ChainFailure[];
}

/**
 * Recompute a chain from genesis and report every check that fails.
 *
 * This **returns** rather than throws, including on a chain that has been
 * tampered with. `GET /runs/:id/ledger/verify` "returns pass/fail per check"
 * (`ARCHITECTURE.md §9`) and `POST /runs/:id/close` "returns the individual gate
 * results rather than a boolean, because 'why won't it close' is the question
 * an analyst actually asks". A verifier that throws on the first altered byte
 * cannot answer that question.
 *
 * Every event is re-validated from scratch before its digest is recomputed, so
 * a record whose structure was edited after storage fails as `STRUCTURE` rather
 * than being hashed in its edited form. Nothing here trusts the static type of
 * `events`: a stored event is `unknown` however it was declared.
 *
 * Pass `expectedRoot` to perform `G4` in full — "hash chain recomputes from
 * genesis **and matches the stored root hash**".
 */
export function verifyChain(
  genesisHash: Sha256,
  events: readonly LedgerEvent[],
  expectedRoot?: Sha256,
): ChainVerification {
  const failures: ChainFailure[] = [];
  const fail = (
    index: number | null,
    seq: number | null,
    evtId: string | null,
    check: ChainCheck,
    detail: string,
  ): void => {
    failures.push(Object.freeze({ index, seq, evt_id: evtId, check, detail }));
  };

  const genesis = readSha256(genesisHash, "$.genesis_hash");

  let expectedPrev = genesis;
  let rootHash = genesis;
  let totalDr = 0;
  let totalCr = 0;
  let balanceReported = false;
  let runId: string | null = null;
  const seenEventIds = new Set<string>();

  for (let index = 0; index < events.length; index += 1) {
    const raw: unknown = events[index];
    const storedSeq = readNumberOrNull(raw, "seq");
    const storedId = readStringOrNull(raw, "evt_id");

    let event: LedgerEvent;
    try {
      event = sealStoredEvent(raw);
    } catch (error) {
      fail(
        index,
        storedSeq,
        storedId,
        "STRUCTURE",
        error instanceof Error ? error.message : String(error),
      );
      // The record cannot be hashed, so the link into the next event cannot be
      // recomputed either. Carry the stored digest forward where it is at least
      // well formed, so that one corrupt record does not report as a failure on
      // every record after it.
      const storedHash = readStringOrNull(raw, "hash");
      if (storedHash !== null && /^[0-9a-f]{64}$/.test(storedHash)) {
        expectedPrev = storedHash as Sha256;
        rootHash = storedHash as Sha256;
      }
      continue;
    }

    if (runId === null) {
      runId = event.run_id;
    } else if (event.run_id !== runId) {
      fail(
        index,
        event.seq,
        event.evt_id,
        "RUN_ID",
        `run ${JSON.stringify(event.run_id)} in a chain for run ` +
          `${JSON.stringify(runId)}; sequence numbers are gapless per run ` +
          `(DATA_MODEL.md §16)`,
      );
    }

    if (seenEventIds.has(event.evt_id)) {
      fail(
        index,
        event.seq,
        event.evt_id,
        "EVENT_ID_UNIQUE",
        `evt_id ${JSON.stringify(event.evt_id)} appears more than once; an ` +
          `event identifier identifies one event`,
      );
    }
    seenEventIds.add(event.evt_id);

    if (event.seq !== index) {
      fail(
        index,
        event.seq,
        event.evt_id,
        "SEQUENCE",
        `seq ${String(event.seq)} at position ${String(index)}; §16 requires ` +
          `strictly increasing, gapless sequence numbers from 0`,
      );
    }

    if (event.prev_hash !== expectedPrev) {
      fail(
        index,
        event.seq,
        event.evt_id,
        "PREV_HASH",
        `prev_hash ${event.prev_hash} does not link to ${expectedPrev}`,
      );
    }

    // Recomputed over the record's OWN stored prev_hash, so a broken link and a
    // broken digest are reported as two distinct facts rather than one
    // cascading into the other.
    const recomputed = computeEventHash(event, event.prev_hash);
    if (recomputed !== event.hash) {
      fail(
        index,
        event.seq,
        event.evt_id,
        "EVENT_HASH",
        `stored hash ${event.hash} does not match the digest of its body, ` +
          `${recomputed}`,
      );
    }

    const { dr, cr } = journalTotals(event.journal_lines);
    totalDr += dr;
    totalCr += cr;
    // Equality alone is not enough. Every individual amount is a safe integer,
    // but a long enough chain can push a running total past 2^53, where
    // addition stops being exact — and two totals that both lost precision can
    // still compare equal. Invariant `I7` forbids leaving that range at all
    // (`RECONCILIATION_SPEC.md §7`), so an unsafe total is an I1 failure rather
    // than a passing check on inexact arithmetic.
    const exact = Number.isSafeInteger(totalDr) && Number.isSafeInteger(totalCr);
    if ((!exact || totalDr !== totalCr) && !balanceReported) {
      balanceReported = true;
      fail(
        index,
        event.seq,
        event.evt_id,
        "TRIAL_BALANCE",
        exact
          ? `invariant I1 first fails here: Σ dr = ${String(totalDr)} paise, ` +
              `Σ cr = ${String(totalCr)} paise (DATA_MODEL.md §17)`
          : `the running totals left the safe-integer range at this event, so ` +
              `Σ dr and Σ cr are no longer exact and I1 cannot be asserted ` +
              `(invariant I7, RECONCILIATION_SPEC.md §7)`,
      );
    }

    expectedPrev = event.hash;
    rootHash = event.hash;
  }

  if (expectedRoot !== undefined && rootHash !== expectedRoot) {
    fail(
      null,
      null,
      null,
      "ROOT_HASH",
      `recomputed root ${rootHash} does not match the stored root ${expectedRoot} ` +
        `(gate G4, RECONCILIATION_SPEC.md §10.1)`,
    );
  }

  return Object.freeze({
    ok: failures.length === 0,
    root_hash: rootHash,
    event_count: events.length,
    total_dr_paise: totalDr,
    total_cr_paise: totalCr,
    failures: Object.freeze(failures),
  });
}

/**
 * Best-effort read of a field for error reporting, from a record of any shape.
 *
 * Guarded, because these run *before* the structural seal and therefore on a
 * value nothing has vetted. A record whose property getter throws would
 * otherwise propagate out of `verifyChain`, which promises to report a failed
 * check rather than raise on one.
 */
function readFieldOrNull(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return null;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return null;
  }
}

function readNumberOrNull(value: unknown, key: string): number | null {
  const field = readFieldOrNull(value, key);
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function readStringOrNull(value: unknown, key: string): string | null {
  const field = readFieldOrNull(value, key);
  return typeof field === "string" ? field : null;
}
