/**
 * The single mutating write path — `DECISION_BRIEF.md §L.1` rule 4 and
 * `ARCHITECTURE.md §4` boundary 3.
 *
 * `§4`: *"`packages/ledger` exposes exactly one mutating function, and it
 * accepts only a `ValidatedDecision` — a type that can only be constructed by
 * S5. There is no other write path."* `RECONCILIATION_SPEC.md §7` states the
 * same rule from the other end: S5 *"is the only code path that may post to the
 * ledger"*. {@link postValidatedDecision} is that function. This module exports
 * no second one, and the count of mutating functions in this package is now one
 * rather than zero.
 *
 * **What it does.** It refuses what `§4` says may not be posted, turns the
 * validated artifact into `DATA_MODEL.md §16`'s record, appends it through
 * `hash-chain.ts` — which assigns `seq`, links `prev_hash`, computes `hash` and
 * checks `I1` — and commits the sealed event through the injected
 * {@link LedgerStore}. Every step before the commit is pure, and the commit is
 * the last thing that happens, so a refusal at any stage leaves nothing behind.
 *
 * **What it does not do.**
 *
 * - **It does not re-derive the posting.** `ARCHITECTURE.md §4`:
 *   `journal_lines` are *"the lines S5 validated. The write path must post
 *   *these*, never re-derive them."* `journalFor` is not called from here, and
 *   this module does not import `journal.ts`. Calling it would be a second
 *   implementation of the posting table sitting downstream of the one S5
 *   checked `I1` against, and the two would eventually disagree.
 * - **It does not read a clock or a counter.** `ts` and `evt_id` arrive on an
 *   {@link EventStamp}. `DATA_MODEL.md §16` keeps both outside the hashed `body`
 *   precisely because they *"vary between two executions over identical inputs,
 *   which metric 23 (`determinism_check`) requires to produce identical root
 *   hashes"*; a clock inside this function would make `I9` — *"re-running the
 *   same input yields an identical ledger root hash"* — unfalsifiable from
 *   outside.
 * - **It does not open a file or a database.** See `store.ts`.
 * - **It does not re-check `I2`.** `RECONCILIATION_SPEC.md §7` gives S5 *"no
 *   double allocation: each `entity_id` appears in at most one accepted
 *   allocation across the run"*, and S5 takes the already-allocated entity set
 *   as an input; this package holds no observation set and could not answer the
 *   question. Nor could it be re-derived from the journal lines: `§16` requires
 *   a `P7` resolution to reverse its opening posting under the **same**
 *   `source_entity_id`, and `ARCHITECTURE.md §8` makes a correction *"a new
 *   event"*, so a repeated entity key is specified behaviour rather than a
 *   duplicate. What this boundary protects is **identity** — one decision, one
 *   event; one `evt_id`, one event — which is the part it can see.
 * - **It does not close the period.** Gates `G1`–`G5` and the `CLOSE` event are
 *   `close-gate.ts` and `close.ts` (`DECISION_BRIEF.md §L.2`), which are a
 *   later position in the build order and are not stubbed here.
 *
 * **The brand is untouched.** Nothing in this file constructs, widens or
 * exports a route to {@link ValidatedDecision}: it is imported as a type,
 * consumed, and never produced. `ARCHITECTURE.md §4` places the single widening
 * assertion in `packages/engine/src/s5-validate.ts` and nowhere else.
 */

import type { UnixSeconds } from "@assay/domain";

import type {
  DecisionId,
  EventActor,
  EventId,
  EventKind,
  LedgerEvent,
  LedgerEventDraft,
} from "./events.js";
import { appendEvent, type LedgerChain } from "./hash-chain.js";
import type { DecisionState } from "./projection.js";
import type { LedgerStore } from "./store.js";
import type { ValidatedDecision } from "./validated-decision.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The ledger refused a post.
 *
 * A common supertype so a caller can separate *"the ledger would not take
 * it"* from *"the store could not save it"* in one `catch`, which are the two
 * halves of a failed write and have nothing else in common.
 */
export class LedgerWriteError extends Error {
  readonly decision_id: DecisionId;

  constructor(decisionId: DecisionId, message: string) {
    super(message);
    this.name = "LedgerWriteError";
    this.decision_id = decisionId;
  }
}

/**
 * The decision may not be posted at all.
 *
 * Distinct from {@link DuplicatePostError} because the responses differ. This
 * one can only mean S5 minted an artifact `ARCHITECTURE.md §4` says it cannot
 * mint, which is a bug in the validator and a hard abort — the treatment
 * `ARCHITECTURE.md §12` gives an `I1` failure, and for the same reason: a
 * boundary that repaired its input would be reporting a decision nobody made.
 */
export class RejectedDecisionError extends LedgerWriteError {
  constructor(decisionId: DecisionId, message: string) {
    super(decisionId, message);
    this.name = "RejectedDecisionError";
  }
}

/**
 * Something already in the chain would be recorded twice.
 *
 * A *recoverable* refusal, unlike {@link RejectedDecisionError}: a run resuming
 * over a chain it has already partly written should skip what
 * {@link LedgerWriteState} already holds rather than catch this, and the sets on
 * that value are public so that it can.
 */
export class DuplicatePostError extends LedgerWriteError {
  /** Which identity collided. */
  readonly key: "decision_id" | "evt_id";
  /** The colliding value. */
  readonly value: string;

  constructor(
    decisionId: DecisionId,
    key: "decision_id" | "evt_id",
    value: string,
    message: string,
  ) {
    super(decisionId, message);
    this.name = "DuplicatePostError";
    this.key = key;
    this.value = value;
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * The three `DATA_MODEL.md §16` fields a `ValidatedDecision` deliberately does
 * not carry.
 *
 * `ARCHITECTURE.md §4` lists what the validated artifact leaves out and why:
 * *"Any timestamp — `ts` is outside the hashed `body` for the reason `§16`
 * gives."* `evt_id` is excluded from `body` too and `§16` exempts it from the
 * deterministic-identifier rule, so it is the caller's handle. `actor` is the
 * one field here that **does** enter `body`: it records *"who did it"*, and only
 * the executing stage knows its own `engine_commit` and component name.
 *
 * They travel together in one value rather than as three parameters so that a
 * caller cannot transpose two strings at a call site and post an event stamped
 * with someone else's identity.
 */
export interface EventStamp {
  /** `§16`. Excluded from `body`; unique within the run (`EVENT_ID_UNIQUE`). */
  readonly evt_id: EventId;

  /** `§16`. Excluded from `body`; see `THREAT_MODEL.md §T10`'s declared residual. */
  readonly ts: UnixSeconds;

  /**
   * `§16`'s actor block, in full — it enters `body`.
   *
   * Only `§16`'s own rule is enforced, and `events.ts` already enforces it:
   * *"For any `RECONCILE` event, `actor.type` is always `deterministic` — by
   * construction."* No further constraint is added here. `ARCHITECTURE.md §8`
   * admits an actor carrying *"provider, model ID and prompt hash where
   * applicable"*, and which of the nine event kinds may name a model is `§16`'s
   * question, not this boundary's.
   */
  readonly actor: EventActor;
}

/**
 * The write path's position in a run: the chain, plus what has already been
 * posted into it.
 *
 * An immutable value, like `LedgerChain` itself. A post returns a **new** state
 * and leaves this one untouched, which is what makes all-or-nothing structural:
 * a caller that holds the old state after a failure holds a state in which the
 * failed post never happened, with no rollback step to forget.
 *
 * The two sets are an index over `chain.events` and nothing more —
 * {@link openWriteState} builds them by reading the chain. They are typed
 * `ReadonlySet` and the value is frozen; a caller determined to mutate the
 * underlying sets can only cause a duplicate to be admitted or an honest post to
 * be refused, and the chain remains the authority either way — `verifyChain`'s
 * `EVENT_ID_UNIQUE` check still fails a chain carrying one `evt_id` twice.
 */
export interface LedgerWriteState {
  readonly chain: LedgerChain;

  /**
   * Every `decision_id` already carried by an event in `chain`.
   *
   * `DATA_MODEL.md §13` makes `Decision` a per-decision record keyed by
   * `decision_id`, and `ARCHITECTURE.md §8` puts *"one event per decision or
   * state change"* in the log. Posting one twice would book its `journal_lines`
   * twice.
   */
  readonly posted_decision_ids: ReadonlySet<DecisionId>;

  /** Every `evt_id` already in `chain` — `verifyChain`'s `EVENT_ID_UNIQUE`. */
  readonly posted_event_ids: ReadonlySet<EventId>;
}

/** What one successful post produced. */
export interface LedgerWriteResult {
  /** The state to carry into the next post. The argument state is unchanged. */
  readonly state: LedgerWriteState;
  /** The sealed event, with the `seq`, `prev_hash` and `hash` the chain assigned. */
  readonly event: LedgerEvent;
}

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

/**
 * `DATA_MODEL.md §13`'s `DecisionType` to `§16`'s `kind`.
 *
 * Derived, not chosen: three of `§16`'s nine kinds are the three decision types
 * under the spelling `§16` uses, and `ARCHITECTURE.md §5` walks the worked
 * example from *"→ ABSTAIN, certificate {A} vs {B,C}"* to *"event {kind:
 * ABSTAIN, certificate, prev_hash, hash}"*. The remaining six kinds belong to
 * stages that post no decision (`INGEST`, `ANCHOR`, `CANDIDATE`, `PROBE`),
 * to a resolution, or to the close.
 *
 * The write path **derives** the kind rather than accepting it. A caller-chosen
 * kind would let a `RECONCILED` decision be filed as an `ABSTAIN`, which no
 * later check could detect: the terminal state and the event kind would disagree
 * with nothing left to compare them against.
 */
const EVENT_KIND_BY_DECISION_TYPE = Object.freeze({
  RECONCILED: "RECONCILE",
  ABSTAINED: "ABSTAIN",
  EXCEPTION: "EXCEPTION",
} as const satisfies Readonly<Record<DecisionState, EventKind>>);

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

/**
 * Index an existing chain for writing. **Reads; writes nothing.**
 *
 * Not a second entry point: it opens no resource, calls no store and produces no
 * event. It is the pure constructor of {@link LedgerWriteState}, and it is
 * separate from {@link postValidatedDecision} so that the per-post duplicate
 * check is a set membership rather than a scan of the whole log — which would
 * make a run quadratic in its own event count.
 *
 * Pass `createChain(genesisHash, runId)` to start a run, or a chain rebuilt from
 * stored events to resume one.
 */
export function openWriteState(chain: LedgerChain): LedgerWriteState {
  const decisionIds = new Set<DecisionId>();
  const eventIds = new Set<EventId>();
  for (const event of chain.events) {
    eventIds.add(event.evt_id);
    if (event.decision_id !== null) decisionIds.add(event.decision_id);
  }
  return Object.freeze({
    chain,
    posted_decision_ids: decisionIds,
    posted_event_ids: eventIds,
  });
}

/**
 * **The mutating write path.** Post one validated decision to the ledger.
 *
 * The order of operations is the contract, because it is what makes the write
 * all-or-nothing without a rollback path:
 *
 * 1. **Refuse what `§4` forbids.** A non-empty `invariants_failed` (gate `G5`)
 *    and a broken certificate biconditional are checked first, before anything
 *    has been built.
 * 2. **Refuse a duplicate.** The `decision_id` and the `evt_id` must both be new
 *    to this chain.
 * 3. **Build the draft** from the decision, the stamp and the chain's own
 *    `run_id`, deriving `kind` from `type`.
 * 4. **Append.** `appendEvent` seals the draft — rejecting any field `§16` does
 *    not admit — assigns `seq`, links `prev_hash`, computes `hash` and raises
 *    `TrialBalanceError` if the append would break `I1`. It returns a new chain
 *    and leaves the old one untouched.
 * 5. **Commit.** The sealed event goes to the store as one unit, and only then
 *    is the new state returned.
 *
 * Every failure mode therefore precedes the single call to `store.commit`, or is
 * that call. There is no window in which some of the write has happened: either
 * the store refused and the caller still holds the state it passed in, or the
 * store accepted and the returned state is the whole of the change.
 *
 * **Determinism.** Nothing here reads a clock, a counter, a random source or the
 * environment, so two runs given identical arguments produce byte-identical
 * events and an identical root hash — `I9`, and metric 23.
 *
 * @param state the position in the run, from {@link openWriteState} or a prior post
 * @param decision the artifact only `engine/src/s5-validate.ts` may construct
 * @param stamp the `§16` fields the decision deliberately omits
 * @param store where the sealed event is persisted, atomically
 *
 * @throws RejectedDecisionError if `§4` boundary 3 forbids posting the decision
 * @throws DuplicatePostError if the decision or the event id is already in the chain
 * @throws LedgerEventError if any field is one `DATA_MODEL.md §16` does not admit
 * @throws ChainMismatchError if the chain is not one a chain could have produced
 * @throws TrialBalanceError if the append would break `I1`
 */
export function postValidatedDecision(
  state: LedgerWriteState,
  decision: ValidatedDecision,
  stamp: EventStamp,
  store: LedgerStore,
): LedgerWriteResult {
  // Gate G5, RECONCILIATION_SPEC.md §10.1: "No allocation with a non-empty
  // invariants_failed was posted." ARCHITECTURE.md §4 types the field as an
  // array rather than never[] exactly so this is a runtime check over a
  // recorded value; a type that made non-emptiness unrepresentable would leave
  // G5 verifying a tautology.
  if (decision.invariants_failed.length > 0) {
    throw new RejectedDecisionError(
      decision.decision_id,
      `decision ${decision.decision_id} failed ` +
        `${JSON.stringify([...decision.invariants_failed])} and may not be ` +
        `posted (gate G5, RECONCILIATION_SPEC.md §10.1); a rejected allocation ` +
        `"is never partially posted, never repaired, never downgraded to a ` +
        `warning" (§7)`,
    );
  }

  // ARCHITECTURE.md §4 boundary 3: `certificate` is "non-null exactly when
  // type === 'ABSTAINED'". §4 makes it a runtime obligation on S5; this is the
  // boundary that observes it, because an ABSTAIN event with no certificate is
  // an abstention with no stated grounds and a RECONCILE event carrying one
  // claims a tie it did not have.
  if ((decision.type === "ABSTAINED") !== (decision.certificate !== null)) {
    throw new RejectedDecisionError(
      decision.decision_id,
      `decision ${decision.decision_id} is ${JSON.stringify(decision.type)} ` +
        `with ${decision.certificate === null ? "no" : "a"} certificate; ` +
        `ARCHITECTURE.md §4 boundary 3 requires one exactly when the type is ` +
        `"ABSTAINED"`,
    );
  }

  if (state.posted_decision_ids.has(decision.decision_id)) {
    throw new DuplicatePostError(
      decision.decision_id,
      "decision_id",
      decision.decision_id,
      `decision ${decision.decision_id} is already posted to this chain; ` +
        `ARCHITECTURE.md §8 records "one event per decision or state change" ` +
        `and posting it again would book its journal lines twice`,
    );
  }

  if (state.posted_event_ids.has(stamp.evt_id)) {
    throw new DuplicatePostError(
      decision.decision_id,
      "evt_id",
      stamp.evt_id,
      `evt_id ${stamp.evt_id} is already in this chain; an event identifier ` +
        `identifies one event (verifyChain's EVENT_ID_UNIQUE check)`,
    );
  }

  const draft: LedgerEventDraft = {
    evt_id: stamp.evt_id,
    // The chain's, never the caller's: §16 makes sequence numbers "gapless, per
    // run", and appendEvent refuses a draft belonging to another run. Taking it
    // from the chain removes the mismatch rather than detecting it.
    run_id: state.chain.run_id,
    ts: stamp.ts,
    actor: stamp.actor,
    kind: EVENT_KIND_BY_DECISION_TYPE[decision.type],
    subject_ids: decision.subject_obs_ids,
    evidence_ids: decision.evidence_ids,
    decision_id: decision.decision_id,
    inputs_hash: decision.inputs_hash,
    // Posted as validated. See the module header.
    journal_lines: decision.journal_lines,
    certificate: decision.certificate,
  };

  // Seals, positions, links, hashes and checks I1 — hash-chain.ts, unchanged.
  // A throw here happens before the store is touched.
  const chain = appendEvent(state.chain, draft);

  const event = chain.events.at(-1);
  if (event === undefined) {
    // Unreachable: appendEvent returns a chain one event longer than its
    // argument. Asserted rather than cast, because the alternative is a
    // non-null assertion that would also silence a real regression here.
    throw new Error(
      "appendEvent returned a chain with no events; this is a bug in " +
        "packages/ledger/src/hash-chain.ts",
    );
  }

  // The single act of persistence, and the last thing that can fail. An adapter
  // that throws has stored nothing (store.ts), and the state below is never
  // reached, so the caller's `state` argument remains the whole truth.
  store.commit({
    run_id: chain.run_id,
    genesis_hash: chain.genesis_hash,
    events: Object.freeze([event]),
    root_hash: chain.root_hash,
  });

  const decisionIds = new Set(state.posted_decision_ids);
  decisionIds.add(decision.decision_id);
  const eventIds = new Set(state.posted_event_ids);
  eventIds.add(event.evt_id);

  return Object.freeze({
    state: Object.freeze({
      chain,
      posted_decision_ids: decisionIds,
      posted_event_ids: eventIds,
    }),
    event,
  });
}
