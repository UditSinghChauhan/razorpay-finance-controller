/**
 * Layer B — the balance projection over Layer A's event log.
 *
 * `ARCHITECTURE.md §8` is normative and states the whole contract in one
 * sentence: Layer B is "a **pure projection** over Layer A: replaying the event
 * log recomputes every control-account balance from scratch." It answers "*what
 * are the books, and do they balance*".
 *
 * The two layers exist because they fail differently. "Layer A detects
 * *tampering* — someone changed the record of what happened. Layer B detects
 * *incoherence* — the record is intact but the books do not balance." This
 * module is the second half of that sentence and deliberately implements none
 * of the first.
 *
 * **Scope.** `DECISION_BRIEF.md §K` places `journal.ts` and `projection.ts` on
 * the Layer B line, and both are now present. The split between them is strict
 * and this module holds the passive half: it reads the `journal_lines` an event
 * already carries and never decides what they should have been. `journal.ts`
 * decides; nothing here imports it, and a test asserts that.
 *
 * **What this module refuses, and where that work lives instead.**
 *
 * - Gate `G3`'s gross per-item Suspense identity is **not** implemented here.
 *   `G3` is `Σᵢ |item_net_paise(i)|` over "each open Suspense item *i*", where
 *   an item is "the set of `9000_SUSPENSE` journal lines sharing one
 *   `JournalLine.source_entity_id`" and is *open* while that set nets to a
 *   non-zero figure (`RECONCILIATION_SPEC.md §10.1`, spec 1.4.0). Layer A now
 *   carries and hashes that key, so the partition is computable — but the gate
 *   that computes it is `close-gate.ts`, and its right-hand side is summed from
 *   the `Decision` / `Exception` records, which this package does not hold.
 *   `§10.1` is explicit that the two sides "are drawn from two stores, which is
 *   the point". `valueSuspensePaise` below is the **net** balance and is not
 *   that identity; `DATA_MODEL.md §20` is explicit that the two are different
 *   numbers.
 * - The close gates themselves are `close-gate.ts`, a later milestone. This
 *   module supplies the arithmetic `G2` runs and does not run it.
 * - Content tampering is `verifyChain`'s job, not this one. An amount edited in
 *   storage to another well-formed amount projects as written; it is gate `G4`
 *   that detects it. Duplication and structural corruption *are* caught here,
 *   for the reasons given on each check.
 *
 * **Report or refuse.** One rule governs every failure path below. When this
 * module can state a true fact about the ledger it returns it — an unbalanced
 * but exactly-representable log is reported as `trialBalanceOk: false`, because
 * `CloseGateResult.g2_trial_balance` is a boolean an analyst has to be shown
 * (`ARCHITECTURE.md §9`: `POST /runs/:id/close` "returns the individual gate
 * results rather than a boolean, because 'why won't it close' is the question an
 * analyst actually asks"). When it cannot state a true fact it throws, because
 * the alternative is handing back a number that looks like a balance and is not.
 */

import {
  ACCOUNT_CODES,
  SUSPENSE_ACCOUNT,
  type AccountCode,
} from "@assay/domain";
import { paise, sub, type Paise } from "@assay/money";

import { sealStoredEvent, type LedgerEvent } from "./events.js";
import { ChainMismatchError, TrialBalanceError, type LedgerChain } from "./hash-chain.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The caller's own argument is unusable — not the ledger's contents.
 *
 * A fourth class is introduced rather than folded into the three Layer A
 * established, because it demands a fourth response. `LedgerEventError` means
 * fix the record, `TrialBalanceError` means abort the run
 * (`ARCHITECTURE.md §12`), `ChainMismatchError` means these events are not one
 * chain — and this one means fix the lookup table you passed in. A caller that
 * cannot tell them apart cannot obey any of them.
 */
export class ProjectionInputError extends TypeError {
  constructor(detail: string) {
    super(detail);
    this.name = "ProjectionInputError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A balance for each of the seven control accounts, in `ACCOUNT_CODES` order.
 *
 * Frozen. `ARCHITECTURE.md §8` requires balances to be recomputed by projection
 * and "never mutated in place and never cached authoritatively", and a mutable
 * result is a cache waiting to be written to.
 */
export type AccountBalances = Readonly<Record<AccountCode, Paise>>;

/**
 * The per-decision outcome of `DATA_MODEL.md §13`.
 *
 * Transcribed rather than imported: `Decision` is not this package's entity, and
 * `§13` is explicit that `REFERENCE` "is deliberately NOT a member of this
 * union" because a `REFERENCE` observation produces no `Decision` at all.
 */
export type DecisionState = "RECONCILED" | "ABSTAINED" | "EXCEPTION";

/**
 * The caller-supplied decision → state mapping.
 *
 * A `ReadonlyMap`, which every `Map` satisfies. This module reads it during the
 * call and retains no reference, so mutating it afterwards cannot change a
 * result already returned. **The mapping is the caller's**: `Decision` belongs
 * to the engine, and a projection that owned one would be inventing the entity
 * `§13` assigns elsewhere.
 */
export type DecisionStates = ReadonlyMap<string, DecisionState>;

/** The outcome of replaying an event log. */
export interface LedgerProjection {
  /** `balance(acct) = Σ dr_paise(acct) − Σ cr_paise(acct)` (`DATA_MODEL.md §17.1`). */
  readonly balances: AccountBalances;
  /** `Σ dr_paise` over every projected line. */
  readonly totalDrPaise: Paise;
  /** `Σ cr_paise` over every projected line. */
  readonly totalCrPaise: Paise;
  /**
   * Invariant `I1` — `Σ dr === Σ cr`. The arithmetic gate `G2` reads
   * (`RECONCILIATION_SPEC.md §10.1`), recomputed from the event log and never
   * read from cached state.
   */
  readonly trialBalanceOk: boolean;
  /** Events considered — after filtering, where a filter was applied. */
  readonly eventCount: number;
  /** Of those, how many carried at least one journal line. */
  readonly postingEventCount: number;
  /** Journal lines projected. */
  readonly journalLineCount: number;
  /**
   * `seq` of the last event projected, or `null` if none was.
   *
   * Diagnostic. It exists so that `assertTrialBalance` can raise a
   * `TrialBalanceError` whose `seq` means what Layer A means by it — the point
   * in the log at which the cumulative imbalance stands — rather than a count
   * wearing the same field name.
   */
  readonly lastSeq: number | null;
  /**
   * The **net** projected Suspense balance — `CloseReport.value_suspense_paise`
   * (`DATA_MODEL.md §20`), identically `balances["9000_SUSPENSE_UNRECONCILED"]`.
   *
   * **This is not gate `G3`.** `§20` states the distinction and why it matters:
   * `G3` tests the **gross** `Σ |item_net_paise|` over open Suspense items, and
   * "the two are equal only when every open Suspense item lies on the same
   * side, which a run containing both `E03` and `E04` does not satisfy".
   * Reporting this number as the Suspense identity would be satisfiable by two
   * offsetting suppressions, which is the attack `THREAT_MODEL.md §T8` exists to
   * make arithmetically impossible. The gross form partitions on
   * `JournalLine.source_entity_id` (`§16`, spec 1.4.0) and compares against the
   * `Decision` / `Exception` records; it belongs to `close-gate.ts`, which holds
   * both stores.
   */
  readonly valueSuspensePaise: Paise;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/**
 * Replay `events` and recompute every control-account balance from scratch.
 *
 * Every event is re-admitted through `sealStoredEvent` first. A stored event is
 * `unknown` no matter what its TypeScript type says — this function's whole
 * purpose is to produce a number a close report will publish, so it cannot
 * begin by trusting the shape of what it was handed. That check is what rejects
 * a negative debit, a line with both sides non-zero, an eighth account code and
 * a fractional amount edited into storage.
 *
 * **Duplicate `evt_id` is refused.** Two copies of one balanced event leave
 * `Σ dr === Σ cr` intact while corrupting every account it touches, so `I1`
 * cannot catch it; `verifyChain` catches it as `EVENT_ID_UNIQUE`, but
 * `proj_agent` (`EVALUATION_SPEC.md §4.4`) and `POST /runs/:id/close` both
 * project without running `G4` first. Refusing here is defence in depth against
 * the one corruption a trial balance is blind to.
 *
 * **Events from two runs are refused.** `§16` makes sequence numbers "gapless,
 * per run", and `appendEvent` already rejects a draft belonging to another run.
 * A total over two runs is nobody's balance.
 *
 * @throws LedgerEventError if a stored event is malformed.
 * @throws ChainMismatchError on a duplicate `evt_id` or a mixed-run array.
 * @throws TrialBalanceError if the running totals leave the safe-integer range.
 */
export function projectLedger(events: readonly LedgerEvent[]): LedgerProjection {
  return project(events, null);
}

/**
 * Project a chain, reading **only** its events.
 *
 * `chain.total_dr_paise` and `chain.total_cr_paise` are deliberately not read.
 * Layer A carries them as an append-time `I1` guard and says so; treating them
 * as balances would contradict `ARCHITECTURE.md §8` — "an edited balance without
 * a corresponding event simply disappears on the next projection" — which is
 * the property `THREAT_MODEL.md §T10` rests on. This function exists so that
 * guarantee is mechanical and testable rather than a convention every caller has
 * to remember.
 */
export function projectChain(chain: LedgerChain): LedgerProjection {
  return project(chain.events, null);
}

/**
 * `proj_agent(acct)` — the covered-set projection of `EVALUATION_SPEC.md §4.4`:
 * "`Σ dr_paise − Σ cr_paise` over the agent's journal lines whose owning
 * decision is `RECONCILED`".
 *
 * The owning decision is `LedgerEvent.decision_id`. An event with no decision
 * has no owning decision and is therefore not covered, so it is excluded — which
 * is the same reading that keeps `REFERENCE` observations out of every set in
 * `§4.4`, since they "post nothing".
 *
 * **A decision this map does not cover is an error, not an exclusion.**
 * `balance_harm_inr` is a frozen metric (`PREREGISTRATION.md §8` metric 6) and
 * silently dropping a posting the caller forgot to classify would move it by an
 * amount nobody would see. Coverage is required only for events that actually
 * post: an event carrying no journal line contributes nothing to any balance, so
 * its state is irrelevant and is not demanded.
 *
 * @throws ProjectionInputError if a posting event's decision is not in `states`.
 * @throws LedgerEventError, ChainMismatchError, TrialBalanceError as `projectLedger`.
 */
export function projectByDecisionState(
  events: readonly LedgerEvent[],
  states: DecisionStates,
  target: DecisionState = "RECONCILED",
): LedgerProjection {
  return project(events, { states, target });
}

interface DecisionFilter {
  readonly states: DecisionStates;
  readonly target: DecisionState;
}

function project(
  events: readonly LedgerEvent[],
  filter: DecisionFilter | null,
): LedgerProjection {
  const debits = new Map<AccountCode, number>();
  const credits = new Map<AccountCode, number>();
  for (const code of ACCOUNT_CODES) {
    debits.set(code, 0);
    credits.set(code, 0);
  }

  let totalDr = 0;
  let totalCr = 0;
  let eventCount = 0;
  let postingEventCount = 0;
  let journalLineCount = 0;
  let lastSeq: number | null = null;
  let runId: string | null = null;
  const seenEventIds = new Set<string>();
  // Each decision is looked up in the caller's map at most once. A lookup that
  // answered differently on a second call would put the same decision in two
  // states and silently break the partition `proj_agent` depends on.
  const resolved = new Map<string, DecisionState | undefined>();

  // Read once. `events` is `readonly LedgerEvent[]` to the type system and an
  // arbitrary object at runtime, and a length that answers differently on each
  // iteration would make the traversal — and therefore the balance — depend on
  // something outside the log.
  const eventTotal = events.length;

  for (let index = 0; index < eventTotal; index += 1) {
    // A stored event is `unknown` however it was declared (`sealStoredEvent`).
    const event = sealStoredEvent(events[index]);

    if (runId === null) {
      runId = event.run_id;
    } else if (event.run_id !== runId) {
      throw new ChainMismatchError(
        `event ${event.evt_id} at position ${String(index)} belongs to run ` +
          `${JSON.stringify(event.run_id)}, but the projection is over run ` +
          `${JSON.stringify(runId)}; sequence numbers are gapless per run ` +
          `(DATA_MODEL.md §16)`,
      );
    }

    if (seenEventIds.has(event.evt_id)) {
      throw new ChainMismatchError(
        `evt_id ${JSON.stringify(event.evt_id)} appears more than once at ` +
          `position ${String(index)}; an event identifier identifies one event, ` +
          `and projecting a duplicate double-counts every account it touches ` +
          `while leaving Σ dr === Σ cr intact`,
      );
    }
    seenEventIds.add(event.evt_id);

    if (filter !== null && !isCovered(event, filter, resolved)) continue;

    eventCount += 1;
    lastSeq = event.seq;
    if (event.journal_lines.length === 0) continue;
    postingEventCount += 1;

    for (const line of event.journal_lines) {
      journalLineCount += 1;
      // §16 admits only one non-zero side per line, and Layer A rejects a
      // negative amount, so each of these four totals is monotonically
      // non-decreasing.
      debits.set(line.account, (debits.get(line.account) ?? 0) + line.dr_paise);
      credits.set(line.account, (credits.get(line.account) ?? 0) + line.cr_paise);
      totalDr += line.dr_paise;
      totalCr += line.cr_paise;
    }

    // Checked per event rather than once at the end, so a log that overflows
    // and returns to the safe range cannot pass unnoticed — the rule
    // `@assay/money`'s `sum` applies to a list, applied to a replay.
    //
    // `sum` itself is not used: it raises `RangeError`, and this module must
    // raise `TrialBalanceError` to keep the Layer A error taxonomy intact.
    //
    // Checking the two grand totals is sufficient to guarantee every per-account
    // total is exact as well. Every `dr_paise` and `cr_paise` is non-negative
    // (Layer A enforces it), so `Σ dr(acct) <= Σ dr` and `Σ cr(acct) <= Σ cr`
    // for all seven accounts at every step, and each balance lies in
    // `[−Σ cr, +Σ dr]`.
    if (!Number.isSafeInteger(totalDr) || !Number.isSafeInteger(totalCr)) {
      throw new TrialBalanceError(event.seq, totalDr, totalCr);
    }
  }

  const balances = {} as Record<AccountCode, Paise>;
  // ACCOUNT_CODES order, so the key order of the result is identical on every
  // run. `EVALUATION_SPEC.md §4.12` requires two runs over identical input to
  // agree, and an unstable traversal is one of the ways that quietly stops
  // being true.
  for (const code of ACCOUNT_CODES) {
    balances[code] = sub(
      paise(debits.get(code) ?? 0),
      paise(credits.get(code) ?? 0),
    );
  }

  return Object.freeze({
    balances: Object.freeze(balances),
    totalDrPaise: paise(totalDr),
    totalCrPaise: paise(totalCr),
    // Exact by the check above, so equality here is a fact about the ledger and
    // never an artefact of inexact arithmetic.
    trialBalanceOk: totalDr === totalCr,
    eventCount,
    postingEventCount,
    journalLineCount,
    lastSeq,
    valueSuspensePaise: balances[SUSPENSE_ACCOUNT],
  });
}

function isCovered(
  event: LedgerEvent,
  filter: DecisionFilter,
  resolved: Map<string, DecisionState | undefined>,
): boolean {
  const decisionId = event.decision_id;
  if (decisionId === null) return false;

  let state: DecisionState | undefined;
  if (resolved.has(decisionId)) {
    state = resolved.get(decisionId);
  } else {
    state = filter.states.get(decisionId);
    resolved.set(decisionId, state);
  }

  if (state === undefined) {
    // Only a posting event's classification can move a balance, so only a
    // posting event's absence is an error.
    if (event.journal_lines.length === 0) return false;
    throw new ProjectionInputError(
      `no decision state supplied for ${JSON.stringify(decisionId)}, carried by ` +
        `posting event ${event.evt_id}; a covered-set projection over an ` +
        `incomplete map would silently understate balance_harm_inr ` +
        `(EVALUATION_SPEC.md §4.4)`,
    );
  }
  return state === filter.target;
}

// ---------------------------------------------------------------------------
// The hard-abort path
// ---------------------------------------------------------------------------

/**
 * Raise `TrialBalanceError` unless `I1` holds.
 *
 * Offered alongside `trialBalanceOk` rather than instead of it because the
 * specification needs both readings of the same fact. `CloseGateResult`
 * (`DATA_MODEL.md §20`) carries `g2_trial_balance` as a boolean an analyst is
 * shown, while `RECONCILIATION_SPEC.md §7` makes `I1` failing "a hard abort of
 * the whole run" and `ARCHITECTURE.md §12` explains why — it "can only indicate
 * a bug in the ledger itself". A caller reporting a gate wants the boolean; a
 * caller about to act on a balance wants the throw.
 *
 * @throws TrialBalanceError if `Σ dr !== Σ cr`.
 */
export function assertTrialBalance(projection: LedgerProjection): void {
  if (!projection.trialBalanceOk) {
    throw new TrialBalanceError(
      projection.lastSeq ?? 0,
      projection.totalDrPaise,
      projection.totalCrPaise,
    );
  }
}
