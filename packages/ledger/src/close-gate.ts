/**
 * The five close gates `G1`–`G5` — `RECONCILIATION_SPEC.md §10.1`.
 *
 * **This module is pure.** It performs no I/O, reads no clock, draws no random
 * number and persists nothing. That is not a stylistic preference: `§10.1`
 * closes with the sentence the whole gate rests on — *"Balances at close are
 * **recomputed by projection from the event log**, never read from cached
 * state. A corrupted balance that is not backed by an event simply disappears
 * on re-projection, which is what makes G2 and G3 meaningful."* A gate that
 * could read a stored balance could be handed one, so this module takes the
 * event log as data and re-projects it itself on every call.
 *
 * **It reports; it does not decide.** `ARCHITECTURE.md §9` requires
 * `POST /runs/:id/close` to return *"the individual gate results rather than a
 * boolean, because 'why won't it close' is the question an analyst actually
 * asks"*, and `§10.2` requires that on a failure *"the failing gate is named"*.
 * {@link closeGate} therefore returns all five booleans, the named list of
 * failures, and a located finding for each one. It converts none of that into a
 * period status: that is `close.ts`, and keeping the two apart is what makes
 * *"any gate fails → BLOCKED"* a single unavoidable line rather than a rule
 * scattered across five checks.
 *
 * **What throws and what is reported.** The rule is `projection.ts`'s and is
 * repeated here because it decides the shape of every check below. A fact about
 * the **ledger** is returned — an unbalanced log is `g2_trial_balance: false`,
 * a tampered chain is `g4_hash_chain: false`. A defect in the **caller's own
 * argument** — a kind outside `DATA_MODEL.md §10`'s nine, a negative
 * `value_paise`, a digest that is not a digest — throws
 * {@link ProjectionInputError}, because a gate that silently absorbed a
 * malformed queue would report `BLOCKED` for a reason the caller could not act
 * on. That error class is reused rather than a fifth being added: its contract
 * is exactly *"the caller's own argument is unusable — not the ledger's
 * contents ... fix the lookup table you passed in"*.
 *
 * **`G3`'s two sides come from two stores, and this module holds neither.**
 * `§10.1`: *"`Σᵢ |item_net_paise(i)|` is computed from the **journal lines** —
 * the books. `unresolved_value_paise` is computed from the **`Decision` and
 * `Exception` records** — the queue ... They span one universe and are
 * maintained independently, so a suppression on either side breaks the
 * identity."* The books arrive as {@link CloseGateInput.events}; the queue
 * arrives as {@link CloseGateInput.unresolved_items}. This module joins them and
 * owns neither, which is the only arrangement under which the comparison is a
 * cross-check rather than a restatement of one store against itself
 * (`THREAT_MODEL.md §T8`).
 *
 * **The amended `G3`, not the superseded one.** `§10.1` records that through
 * benchmark v1.0.2 the right-hand side was summed over *"every reconcilable
 * observation in a non-resolved state"* — several *views* of one economic break
 * — and that **no set of postings satisfies an exact identity against that
 * sum**, so the gate was unsatisfiable and every run ended `BLOCKED`. The
 * universe implemented here is the amended one: **one item per abstained target
 * and per open exception whose class posts**, keyed by
 * `JournalLine.source_entity_id` (`DATA_MODEL.md §16`, `§17.1.1`). The
 * superseded quantity is neither computed nor used as a gate anywhere; it is
 * carried through `close.ts` as `unresolved_value_paise_multiview`, `EXPLORATORY`,
 * exactly as `§10.1`, `DATA_MODEL.md §20` and `PREREGISTRATION.md §8` require.
 */

import {
  OBSERVATION_KINDS,
  SUSPENSE_ACCOUNT,
  isInvariantId,
  isReferenceKind,
  type InvariantId,
  type ObservationKind,
  type Sha256,
} from "@assay/domain";
import { abs, paise, type Paise } from "@assay/money";

import { sealStoredEvent, type LedgerEvent } from "./events.js";
import { verifyChain } from "./hash-chain.js";
import { OBSERVATION_STATES, type ObservationState } from "./journal.js";
import {
  ProjectionInputError,
  projectLedger,
  type AccountBalances,
  type DecisionState,
  type LedgerProjection,
} from "./projection.js";

// ---------------------------------------------------------------------------
// The gates, named
// ---------------------------------------------------------------------------

/**
 * The five gates, in `RECONCILIATION_SPEC.md §10.1`'s order and under
 * `DATA_MODEL.md §20`'s `CloseGateResult` field names.
 *
 * The names are the specification's, not this module's. `§20` fixes them as the
 * fields of the record a close report publishes and `EVALUATION_SPEC.md §4.9`
 * counts `close_gate_failures` per gate under them, so a rename here would
 * silently rename a frozen metric's dimension.
 */
export const CLOSE_GATE_IDS = Object.freeze([
  "g1_all_terminal",
  "g2_trial_balance",
  "g3_suspense_identity",
  "g4_hash_chain",
  "g5_no_failed_invariant_posted",
] as const);

/** One of the five gates of `RECONCILIATION_SPEC.md §10.1`. */
export type CloseGateId = (typeof CLOSE_GATE_IDS)[number];

/**
 * Why a gate failed, as a closed set of codes.
 *
 * These are **diagnostics under a named gate**, never gates of their own: the
 * gate vocabulary is `§10.1`'s five and this module adds none. A closed union is
 * used rather than free prose so that "why won't it close" can be answered
 * mechanically — `ARCHITECTURE.md §9` — while the human-readable half stays in
 * {@link CloseGateFinding.detail}.
 */
export const CLOSE_GATE_FINDING_CODES = Object.freeze([
  /** `G1` — a record was dropped: an observation reached no terminal state. */
  "OBSERVATION_WITHOUT_TERMINAL_STATE",
  /** `G1` — "**exactly** one terminal state" (`§10.1`, `DECISION_BRIEF.md §L.1` rule 5). */
  "OBSERVATION_WITH_MULTIPLE_TERMINAL_STATES",
  /** `G1` — a state was recorded against an observation the set does not contain. */
  "TERMINAL_STATE_FOR_UNKNOWN_OBSERVATION",
  /** `G1` — "a reconcilable observation was retired as `REFERENCE`" (`§10.1`). */
  "REFERENCE_ASSIGNED_TO_RECONCILABLE_KIND",
  /** `G1` — a reference kind reached a state `DATA_MODEL.md §10.1` does not give it. */
  "NON_REFERENCE_STATE_ON_REFERENCE_KIND",
  /** `G2` — `Σ dr ≠ Σ cr` over the re-projected log. */
  "TRIAL_BALANCE_UNEQUAL",
  /** `G2`/`G3` — the log could not be re-projected, so neither can be asserted. */
  "PROJECTION_FAILED",
  /** `G3` — the Suspense partition could not be computed from the log. */
  "SUSPENSE_ITEMS_UNCOMPUTABLE",
  /** `G3` — `Σᵢ |item_net_paise(i)| ≠ unresolved_value_paise`. */
  "SUSPENSE_IDENTITY_MISMATCH",
  /** `G3` diagnostic — an item open in the books that the queue does not carry. */
  "ITEM_MISSING_FROM_QUEUE",
  /** `G3` diagnostic — a queue item with no open Suspense item behind it. */
  "ITEM_MISSING_FROM_BOOKS",
  /** `G3` diagnostic — one key, two figures. */
  "ITEM_VALUE_MISMATCH",
  /** `G4` — a check in `verifyChain` failed; the check is named in the detail. */
  "CHAIN_CHECK_FAILED",
  /** `G5` — "No allocation with a non-empty `invariants_failed` was posted". */
  "INVARIANT_FAILED_DECISION_POSTED",
] as const);

/** One diagnostic code, under one of the five gates. */
export type CloseGateFindingCode = (typeof CLOSE_GATE_FINDING_CODES)[number];

/** One reason one gate failed, located as precisely as the gate can locate it. */
export interface CloseGateFinding {
  readonly gate: CloseGateId;
  readonly code: CloseGateFindingCode;
  /** The entity the finding is about — an `obs_id`, an item key, a `dec_…`. */
  readonly subject: string | null;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * One member of the observation set, as `G1` reads it.
 *
 * Only the two fields `G1` quantifies over. `kind` is required because `§10.1`'s
 * second clause — *"every `REFERENCE` assignment matches the static kind
 * classification in `DATA_MODEL.md §10.1`"* — is not checkable without it, and
 * that clause is the whole reason `REFERENCE` cannot become a drop path.
 */
export interface CloseObservationRecord {
  readonly obs_id: string;
  readonly kind: ObservationKind;
}

/**
 * One terminal-state assignment.
 *
 * Modelled as a **list of assignments** rather than a map from observation to
 * state, because a map cannot express the defect `G1` exists to catch. *"Every
 * observation reaches exactly one terminal state ... No fifth state, no drop
 * path"* (`DECISION_BRIEF.md §L.1` rule 5) fails in two directions — zero
 * assignments and more than one — and a `Map<obs_id, state>` silently repairs
 * the second by keeping the last write.
 */
export interface TerminalStateRecord {
  readonly obs_id: string;
  readonly state: ObservationState;
}

/**
 * Which store an open item's value was read from.
 *
 * `DATA_MODEL.md §20` splits `unresolved_value_paise` into *"its abstention
 * half"* and *"its open-exception half"*, and `EVALUATION_SPEC.md §4.9` writes
 * the same sum as `value_abstained + value_open_exceptions`. The split is a
 * reported figure, never a gate input: `G3` compares the total.
 */
export type UnresolvedItemOrigin = "ABSTENTION" | "EXCEPTION";

/**
 * One open item on the **queue** side — `G3`'s right-hand side, per item.
 *
 * `DATA_MODEL.md §20`, benchmark v1.0.3: `unresolved_value_paise` is *"summed
 * over **open Suspense items** — one per **abstained target** and per open
 * exception whose class posts, keyed by `JournalLine.source_entity_id` (§16) —
 * and its per-item figure is read from the owning `Decision` or `Exception`
 * record"* at `value(observation)` (`DATA_MODEL.md §14.1`).
 *
 * The seven exception classes `DATA_MODEL.md §17.1.1` gives no Suspense item
 * (`E05`–`E08`, `E10`, `E11`, `E13`) contribute **no record here**, and neither
 * does a non-target member of an abstained component. *"An exception whose class
 * opens no Suspense item is in neither sum; it cannot be suppressed either,
 * because `G1` still requires it to hold a terminal state"* (`§10.1`).
 */
export interface UnresolvedItemRecord {
  /** The item key — `JournalLine.source_entity_id` (`DATA_MODEL.md §16`). */
  readonly source_entity_id: string;
  readonly origin: UnresolvedItemOrigin;
  /** `value(observation)` (`DATA_MODEL.md §14.1`), integer paise, non-negative. */
  readonly value_paise: Paise;
}

/**
 * One decision that posted, as `G5` reads it.
 *
 * `RECONCILIATION_SPEC.md §10.1` `G5` is *"No allocation with a non-empty
 * `invariants_failed` was posted"*. `ValidatedDecision` (`validated-decision.ts`)
 * satisfies this interface structurally and is the intended argument; the
 * narrower shape is declared so the gate stays checkable over a record read back
 * from storage, which is where a bypass would have to be detected. `§10.1` calls
 * a `G5` failure *"the validation gate was bypassed"* — a check that could only
 * run over an object S5 had just minted would be checking the thing that cannot
 * be wrong.
 */
export interface PostedDecisionRecord {
  readonly decision_id: string;
  readonly invariants_failed: readonly InvariantId[];
}

/** Everything the five gates read. Nothing else is consulted. */
export interface CloseGateInput {
  /** `DATA_MODEL.md §16`'s genesis digest, for `G4`'s recomputation. */
  readonly genesis_hash: Sha256;
  /** The root `G4` must match — *"matches the stored root hash"* (`§10.1`). */
  readonly stored_root_hash: Sha256;
  /** The event log. `G2`, `G3` and `G4` are all recomputed from it. */
  readonly events: readonly LedgerEvent[];
  /** The observation set `G1` quantifies over. */
  readonly observations: readonly CloseObservationRecord[];
  /** Every terminal-state assignment made during the run. */
  readonly terminal_states: readonly TerminalStateRecord[];
  /** The queue — `G3`'s right-hand side, from the `Decision`/`Exception` records. */
  readonly unresolved_items: readonly UnresolvedItemRecord[];
  /** Every decision that posted, for `G5`. */
  readonly posted_decisions: readonly PostedDecisionRecord[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * One open Suspense item on the **books** side.
 *
 * `DATA_MODEL.md §16`: *"For key `k`, `item_net_paise(k) = Σ dr(k,
 * 9000_SUSPENSE) − Σ cr(k, 9000_SUSPENSE)` over the whole event log ... *Open*
 * means `item_net_paise(k) ≠ 0`."* Openness is arithmetic and needs no status
 * flag — a `P7` resolution reverses under the same key, so a resolved item nets
 * to zero and drops out on its own.
 */
export interface SuspenseItem {
  readonly source_entity_id: string;
  /** `Σ dr − Σ cr` over this key's `9000_SUSPENSE` lines. Never zero. */
  readonly item_net_paise: Paise;
  /** `|item_net_paise|` — this item's contribution to `G3`'s gross left side. */
  readonly item_gross_paise: Paise;
}

/**
 * The outcome of running `G1`–`G5`.
 *
 * The five booleans and {@link failed_gates} are `DATA_MODEL.md §20`'s
 * `CloseGateResult` exactly, so a close report projects onto it without a
 * rename. The remaining fields are the arithmetic the gates produced on the way,
 * carried because `§20`'s report publishes it and recomputing it would mean
 * projecting the log twice.
 */
export interface CloseGateResult {
  /** `G1` — every observation holds exactly one terminal state, `REFERENCE` statically. */
  readonly g1_all_terminal: boolean;
  /** `G2` — `Σ dr = Σ cr` over the re-projected event log. */
  readonly g2_trial_balance: boolean;
  /** `G3` — the gross per-item Suspense identity, exactly, to the paisa. */
  readonly g3_suspense_identity: boolean;
  /** `G4` — the chain recomputes from genesis and matches the stored root. */
  readonly g4_hash_chain: boolean;
  /** `G5` — no allocation with a non-empty `invariants_failed` was posted. */
  readonly g5_no_failed_invariant_posted: boolean;
  /** The failing gates, named, in `§10.1` order. Empty iff all five passed. */
  readonly failed_gates: readonly CloseGateId[];
  /** `failed_gates.length === 0`. The single condition `§10.2` turns on. */
  readonly all_passed: boolean;
  /** Every reason every failing gate failed, in `§10.1` gate order. */
  readonly findings: readonly CloseGateFinding[];

  /**
   * The re-projection `§10.1` demands, or `null` if the log could not be
   * projected at all.
   *
   * `null` is not "zero balances": `projection.ts` refuses to hand back a number
   * that looks like a balance and is not, and so does this. It is non-`null`
   * whenever `g2_trial_balance` is `true`, which is why a close report — emitted
   * only when every gate passed — always has balances to publish.
   */
  readonly projection: LedgerProjection | null;
  /** `null` exactly when {@link projection} is. */
  readonly account_balances: AccountBalances | null;
  /** The open Suspense items read from the books, in first-appearance order. */
  readonly suspense_items: readonly SuspenseItem[];
  /** `G3`'s left side: `Σᵢ |item_net_paise(i)|`, gross, from the journal lines. */
  readonly suspense_gross_item_paise: Paise;
  /** `G3`'s right side: `Σ value(observation)` over the same items, from the queue. */
  readonly unresolved_value_paise: Paise;
  /** `§20` — the abstention half of {@link unresolved_value_paise}. */
  readonly value_abstained_paise: Paise;
  /** `§20` — the open-exception half of {@link unresolved_value_paise}. */
  readonly value_exceptions_paise: Paise;
  /** The root `G4` recomputed from genesis, whether or not it matched. */
  readonly recomputed_root_hash: Sha256;
  /** `§20` — `observations_total`. */
  readonly observations_total: number;
  /** `§20` — `observations_reference`, the count in the `REFERENCE` state. */
  readonly observations_reference: number;
  /** `§20` — `decisions`, counted over singly-assigned observations. */
  readonly decisions: Readonly<Record<DecisionState, number>>;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const DIGEST = /^[0-9a-f]{64}$/;

/**
 * Run `G1`–`G5` over one run's books, queue and observation set.
 *
 * The procedure is `RECONCILIATION_SPEC.md §10.4` steps 1–5, with one deliberate
 * departure: `§10.4` reads as a sequence of assertions that stop at the first
 * failure (*"Any observation without a terminal state → BLOCKED"*), and this
 * function evaluates **all five** and reports every one that failed. The outcome
 * is identical — `§10.2` sends *"any gate fails"* to `BLOCKED` however many
 * failed — and the difference is exactly what `ARCHITECTURE.md §9` asks for:
 * an analyst who fixes the first failure and re-runs to discover the second has
 * been told less than the gate knew.
 *
 * Deterministic: the same log and the same records produce an identical result,
 * findings and all. Every traversal follows the caller's array order or the
 * log's own order, and no iteration depends on the insertion order of a
 * collection the caller did not order.
 *
 * @throws ProjectionInputError if an argument is malformed — an unknown kind or
 *   state, a duplicated observation, a negative or fractional `value_paise`, an
 *   identifier that is not a non-empty string, or a digest that is not one.
 */
export function closeGate(input: CloseGateInput): CloseGateResult {
  const genesisHash = readDigest(input.genesis_hash, "genesis_hash");
  const storedRoot = readDigest(input.stored_root_hash, "stored_root_hash");

  const findings: CloseGateFinding[] = [];

  // --- G1 ---------------------------------------------------------------
  const g1 = runG1(input, findings);

  // --- §10.4 step 2: re-project, then G2 and G3 --------------------------
  let projection: LedgerProjection | null = null;
  let projectionFailure: string | null = null;
  try {
    projection = projectLedger(input.events);
  } catch (error) {
    projectionFailure = messageOf(error);
  }

  const g2 = projection !== null && projection.trialBalanceOk;
  if (projection === null) {
    findings.push(
      finding(
        "g2_trial_balance",
        "PROJECTION_FAILED",
        null,
        `the event log could not be re-projected, so I1 cannot be asserted: ` +
          `${projectionFailure ?? "unknown"}`,
      ),
    );
  } else if (!g2) {
    findings.push(
      finding(
        "g2_trial_balance",
        "TRIAL_BALANCE_UNEQUAL",
        null,
        `Σ dr = ${String(projection.totalDrPaise)} paise, ` +
          `Σ cr = ${String(projection.totalCrPaise)} paise, recomputed over ` +
          `${String(projection.journalLineCount)} journal lines ` +
          `(RECONCILIATION_SPEC.md §10.1 G2, DATA_MODEL.md §17)`,
      ),
    );
  }

  const g3 = runG3(input, projection, projectionFailure, findings);

  // --- G4 ---------------------------------------------------------------
  const verification = verifyChain(genesisHash, input.events, storedRoot);
  for (const failure of verification.failures) {
    findings.push(
      finding(
        "g4_hash_chain",
        "CHAIN_CHECK_FAILED",
        failure.evt_id,
        `${failure.check}: ${failure.detail}`,
      ),
    );
  }

  // --- G5 ---------------------------------------------------------------
  const g5 = runG5(input, findings);

  const gates: Readonly<Record<CloseGateId, boolean>> = {
    g1_all_terminal: g1.passed,
    g2_trial_balance: g2,
    g3_suspense_identity: g3.passed,
    g4_hash_chain: verification.ok,
    g5_no_failed_invariant_posted: g5,
  };
  const failed = CLOSE_GATE_IDS.filter((id) => !gates[id]);

  return Object.freeze({
    ...gates,
    failed_gates: Object.freeze(failed),
    all_passed: failed.length === 0,
    findings: Object.freeze(orderFindings(findings)),
    projection,
    account_balances: projection === null ? null : projection.balances,
    suspense_items: g3.items,
    suspense_gross_item_paise: g3.gross,
    unresolved_value_paise: g3.unresolved,
    value_abstained_paise: g3.abstained,
    value_exceptions_paise: g3.exceptions,
    recomputed_root_hash: verification.root_hash,
    observations_total: g1.total,
    observations_reference: g1.reference,
    decisions: Object.freeze(g1.decisions),
  });
}

// ---------------------------------------------------------------------------
// G1 — every observation has exactly one terminal state
// ---------------------------------------------------------------------------

interface G1Result {
  readonly passed: boolean;
  readonly total: number;
  readonly reference: number;
  readonly decisions: Record<DecisionState, number>;
}

/**
 * `G1`, both clauses.
 *
 * *"Every observation has exactly one terminal state (`RECONCILED`,
 * `ABSTAINED`, `EXCEPTION`, `REFERENCE`), and every `REFERENCE` assignment
 * matches the static kind classification in `DATA_MODEL.md §10.1`"*. The failure
 * it names is *"A record was dropped, or a reconcilable observation was retired
 * as `REFERENCE`"*.
 *
 * The classification clause is checked as a **biconditional**, in both
 * directions. `DATA_MODEL.md §10.1` states it as one: a reference kind *"Reaches
 * `REFERENCE`"* and a reconcilable kind *"Reaches `RECONCILED`, `ABSTAINED` or
 * `EXCEPTION`"*, and the classification *"is a property of the kind alone ...
 * never depends on a decision"*. Checking only the first direction would let a
 * `payment` row be reported as `RECONCILED` and counted in a coverage numerator
 * §10.1 excludes it from.
 */
function runG1(input: CloseGateInput, findings: CloseGateFinding[]): G1Result {
  const kinds = new Map<string, ObservationKind>();
  for (let index = 0; index < input.observations.length; index += 1) {
    const record = input.observations[index];
    const path = `observations[${String(index)}]`;
    const obsId = readIdentifier(record?.obs_id, `${path}.obs_id`);
    const kind = readKind(record?.kind, `${path}.kind`);
    if (kinds.has(obsId)) {
      throw new ProjectionInputError(
        `the observation set carries ${JSON.stringify(obsId)} more than once, at ` +
          `${path}; it is a set, and a duplicate makes "exactly one terminal ` +
          `state" (RECONCILIATION_SPEC.md §10.1 G1) undecidable rather than false`,
      );
    }
    kinds.set(obsId, kind);
  }

  const assigned = new Map<string, ObservationState[]>();
  const unknown: string[] = [];
  const unknownSeen = new Set<string>();
  for (let index = 0; index < input.terminal_states.length; index += 1) {
    const record = input.terminal_states[index];
    const path = `terminal_states[${String(index)}]`;
    const obsId = readIdentifier(record?.obs_id, `${path}.obs_id`);
    const state = readState(record?.state, `${path}.state`);
    if (!kinds.has(obsId)) {
      if (!unknownSeen.has(obsId)) {
        unknownSeen.add(obsId);
        unknown.push(obsId);
      }
      continue;
    }
    const states = assigned.get(obsId);
    if (states === undefined) assigned.set(obsId, [state]);
    else states.push(state);
  }

  let passed = true;
  let reference = 0;
  const decisions: Record<DecisionState, number> = {
    RECONCILED: 0,
    ABSTAINED: 0,
    EXCEPTION: 0,
  };

  // Observation order, not map order: the result must not depend on the order
  // the assignments happened to arrive in.
  for (const record of input.observations) {
    const obsId = record.obs_id;
    const kind = kinds.get(obsId);
    if (kind === undefined) continue;
    const states = assigned.get(obsId) ?? [];

    if (states.length === 0) {
      passed = false;
      findings.push(
        finding(
          "g1_all_terminal",
          "OBSERVATION_WITHOUT_TERMINAL_STATE",
          obsId,
          `observation ${obsId} (${kind}) reached no terminal state; §10.1 G1 ` +
            `reads a missing state as a dropped record, and DECISION_BRIEF.md ` +
            `§L.1 rule 5 admits "no drop path"`,
        ),
      );
      continue;
    }

    if (states.length > 1) {
      passed = false;
      findings.push(
        finding(
          "g1_all_terminal",
          "OBSERVATION_WITH_MULTIPLE_TERMINAL_STATES",
          obsId,
          `observation ${obsId} (${kind}) holds ${String(states.length)} terminal ` +
            `states [${states.join(", ")}]; §10.1 G1 requires exactly one`,
        ),
      );
      continue;
    }

    const state = states[0] as ObservationState;
    const isReference = isReferenceKind(kind);

    if (state === "REFERENCE") {
      if (!isReference) {
        passed = false;
        findings.push(
          finding(
            "g1_all_terminal",
            "REFERENCE_ASSIGNED_TO_RECONCILABLE_KIND",
            obsId,
            `observation ${obsId} is of reconcilable kind ${kind} and was retired ` +
              `as REFERENCE; §10.1 G1 names this failure exactly — "a reconcilable ` +
              `observation was retired as REFERENCE" — and DATA_MODEL.md §10.1 ` +
              `fixes the classification before any run`,
          ),
        );
      } else {
        reference += 1;
      }
      continue;
    }

    if (isReference) {
      passed = false;
      findings.push(
        finding(
          "g1_all_terminal",
          "NON_REFERENCE_STATE_ON_REFERENCE_KIND",
          obsId,
          `observation ${obsId} is of reference kind ${kind} and reached ${state}; ` +
            `DATA_MODEL.md §10.1 gives a reference kind the REFERENCE state alone, ` +
            `"never matched as a target, never posts a journal line"`,
        ),
      );
      continue;
    }

    decisions[state] += 1;
  }

  for (const obsId of unknown) {
    passed = false;
    findings.push(
      finding(
        "g1_all_terminal",
        "TERMINAL_STATE_FOR_UNKNOWN_OBSERVATION",
        obsId,
        `a terminal state was recorded for ${JSON.stringify(obsId)}, which the ` +
          `observation set does not contain; the state store and the observation ` +
          `set disagree, which is the dropped-record defect §10.1 G1 names, seen ` +
          `from the other side`,
      ),
    );
  }

  return {
    passed,
    total: kinds.size,
    reference,
    decisions,
  };
}

// ---------------------------------------------------------------------------
// G3 — the gross per-item Suspense identity
// ---------------------------------------------------------------------------

interface G3Result {
  readonly passed: boolean;
  readonly items: readonly SuspenseItem[];
  readonly gross: Paise;
  readonly unresolved: Paise;
  readonly abstained: Paise;
  readonly exceptions: Paise;
}

/**
 * `G3`, exactly as `RECONCILIATION_SPEC.md §10.1` and `DECISION_BRIEF.md §L.1`
 * rule 6 freeze it.
 *
 * ```
 *   Σᵢ |item_net_paise(i)|  ===  unresolved_value_paise
 * ```
 *
 * **Gross, per item, exactly, to the paisa.** `§10.1` gives the reason for each
 * of those four words. Gross because *"Suspense receives value from both
 * directions"* — `P5` credits it, `P6` debits it, `P8` posts on either side —
 * so *"a purely net identity is ... satisfiable by an attacker who suppresses
 * one item on each side"*; *"the gross form makes offsetting suppression
 * arithmetically impossible"*. Per item because `§16` makes one
 * `source_entity_id` one obligation, and *"two genuinely open items cannot
 * cancel each other"*. Exactly because `§10.1` says so and
 * `EVALUATION_SPEC.md §4.9` requires `suspense_identity_exact` to be `true` on
 * every run.
 *
 * The equality of the **totals** is the gate, and nothing else here is. The
 * per-key findings below are emitted only once the gate has already failed;
 * they answer "which item" for an analyst and never make the gate stricter than
 * the frozen text, which quantifies over the two sums and not over the keys.
 */
function runG3(
  input: CloseGateInput,
  projection: LedgerProjection | null,
  projectionFailure: string | null,
  findings: CloseGateFinding[],
): G3Result {
  // The queue side is read first: it is the caller's argument, so a defect in it
  // is a throw regardless of whether the books could be projected.
  const queue = readQueue(input.unresolved_items);

  if (projection === null) {
    findings.push(
      finding(
        "g3_suspense_identity",
        "PROJECTION_FAILED",
        null,
        `the event log could not be re-projected, so the books side of the ` +
          `Suspense identity does not exist: ${projectionFailure ?? "unknown"}`,
      ),
    );
    return {
      passed: false,
      items: Object.freeze([]),
      gross: paise(0),
      unresolved: queue.total,
      abstained: queue.abstained,
      exceptions: queue.exceptions,
    };
  }

  let items: readonly SuspenseItem[];
  try {
    items = openSuspenseItems(input.events);
  } catch (error) {
    findings.push(
      finding(
        "g3_suspense_identity",
        "SUSPENSE_ITEMS_UNCOMPUTABLE",
        null,
        `the open Suspense items could not be computed from the log: ` +
          `${messageOf(error)}`,
      ),
    );
    return {
      passed: false,
      items: Object.freeze([]),
      gross: paise(0),
      unresolved: queue.total,
      abstained: queue.abstained,
      exceptions: queue.exceptions,
    };
  }

  let grossTotal = 0;
  for (const item of items) grossTotal += item.item_gross_paise;
  const gross = paise(grossTotal);

  const passed = gross === queue.total;

  if (!passed) {
    findings.push(
      finding(
        "g3_suspense_identity",
        "SUSPENSE_IDENTITY_MISMATCH",
        null,
        `Σ |item_net_paise| = ${String(gross)} paise over ` +
          `${String(items.length)} open Suspense items (the books), against ` +
          `unresolved_value_paise = ${String(queue.total)} paise over ` +
          `${String(input.unresolved_items.length)} queue records; §10.1 requires ` +
          `them equal exactly, to the paisa`,
      ),
    );
    describeKeyDivergence(items, queue, findings);
  }

  return {
    passed,
    items,
    gross,
    unresolved: queue.total,
    abstained: queue.abstained,
    exceptions: queue.exceptions,
  };
}

/**
 * Partition the `9000_SUSPENSE` journal lines into items and keep the open ones.
 *
 * `DATA_MODEL.md §16`: an item is the set of lines sharing one
 * `JournalLine.source_entity_id`, its net is `Σ dr − Σ cr` *"over the whole event
 * log"*, and it is open while that net is non-zero. Every event is re-admitted
 * through `sealStoredEvent` first, for the reason `projection.ts` gives: a
 * stored event is `unknown` however it was declared, and this function's output
 * is half of an identity a close report publishes.
 *
 * First-appearance order is preserved so the result is stable across runs
 * without imposing an order the specification does not state.
 */
function openSuspenseItems(events: readonly LedgerEvent[]): readonly SuspenseItem[] {
  const order: string[] = [];
  const nets = new Map<string, number>();

  const total = events.length;
  for (let index = 0; index < total; index += 1) {
    const event = sealStoredEvent(events[index]);
    for (const line of event.journal_lines) {
      if (line.account !== SUSPENSE_ACCOUNT) continue;
      const key = line.source_entity_id;
      const running = nets.get(key);
      if (running === undefined) order.push(key);
      nets.set(key, (running ?? 0) + line.dr_paise - line.cr_paise);
    }
  }

  const items: SuspenseItem[] = [];
  let gross = 0;
  for (const key of order) {
    const net = nets.get(key) ?? 0;
    if (net === 0) continue;
    const netPaise = paise(net);
    const magnitude = abs(netPaise);
    gross += magnitude;
    if (!Number.isSafeInteger(gross)) {
      throw new RangeError(
        `the gross Suspense sum left the safe-integer range at item ` +
          `${JSON.stringify(key)}; Σ |item_net_paise| is not exact, and §10.1 ` +
          `requires the identity to hold to the paisa (invariant I7)`,
      );
    }
    items.push(
      Object.freeze({
        source_entity_id: key,
        item_net_paise: netPaise,
        item_gross_paise: magnitude,
      }),
    );
  }

  return Object.freeze(items);
}

interface Queue {
  readonly total: Paise;
  readonly abstained: Paise;
  readonly exceptions: Paise;
  readonly byKey: ReadonlyMap<string, number>;
  readonly order: readonly string[];
}

/** The queue side, validated and summed. Order-independent by construction. */
function readQueue(records: readonly UnresolvedItemRecord[]): Queue {
  let abstained = 0;
  let exceptions = 0;
  const byKey = new Map<string, number>();
  const order: string[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const path = `unresolved_items[${String(index)}]`;
    const key = readIdentifier(record?.source_entity_id, `${path}.source_entity_id`);
    const origin = record?.origin;
    if (origin !== "ABSTENTION" && origin !== "EXCEPTION") {
      throw new ProjectionInputError(
        `${path}.origin must be "ABSTENTION" or "EXCEPTION" — DATA_MODEL.md §20 ` +
          `splits unresolved_value_paise into an abstention half and an ` +
          `open-exception half — received ${JSON.stringify(origin)}`,
      );
    }
    const value = record?.value_paise;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new ProjectionInputError(
        `${path}.value_paise must be a non-negative integer number of paise ` +
          `(value(observation), DATA_MODEL.md §14.1); received ` +
          `${String(value)}`,
      );
    }

    if (origin === "ABSTENTION") abstained += value;
    else exceptions += value;

    const running = byKey.get(key);
    if (running === undefined) order.push(key);
    byKey.set(key, (running ?? 0) + value);
  }

  const total = abstained + exceptions;
  if (!Number.isSafeInteger(total)) {
    throw new ProjectionInputError(
      `the queue's unresolved value left the safe-integer range; §10.1 requires ` +
        `an identity exact to the paisa, which inexact arithmetic cannot assert`,
    );
  }

  return {
    total: paise(total),
    abstained: paise(abstained),
    exceptions: paise(exceptions),
    byKey,
    order: Object.freeze(order),
  };
}

/**
 * Name the keys the two stores disagree about, once `G3` has already failed.
 *
 * Diagnostic only. `§10.1` quantifies the gate over the two **sums**; this says
 * which item to look at. Emitted after the mismatch finding so an analyst reads
 * the total first and the items second.
 */
function describeKeyDivergence(
  items: readonly SuspenseItem[],
  queue: Queue,
  findings: CloseGateFinding[],
): void {
  const books = new Map<string, number>();
  for (const item of items) books.set(item.source_entity_id, item.item_gross_paise);

  for (const item of items) {
    const queued = queue.byKey.get(item.source_entity_id);
    if (queued === undefined) {
      findings.push(
        finding(
          "g3_suspense_identity",
          "ITEM_MISSING_FROM_QUEUE",
          item.source_entity_id,
          `the books hold an open Suspense item of ${String(item.item_gross_paise)} ` +
            `paise under this key and the Decision / Exception records carry none; ` +
            `a suppression on the queue side (THREAT_MODEL.md §T8)`,
        ),
      );
    } else if (queued !== item.item_gross_paise) {
      findings.push(
        finding(
          "g3_suspense_identity",
          "ITEM_VALUE_MISMATCH",
          item.source_entity_id,
          `|item_net_paise| = ${String(item.item_gross_paise)} paise in the books ` +
            `against ${String(queued)} paise on the queue`,
        ),
      );
    }
  }

  for (const key of queue.order) {
    if (books.has(key)) continue;
    findings.push(
      finding(
        "g3_suspense_identity",
        "ITEM_MISSING_FROM_BOOKS",
        key,
        `the Decision / Exception records carry ${String(queue.byKey.get(key) ?? 0)} ` +
          `paise of unresolved value under this key and the journal lines net to ` +
          `zero for it; either the posting was suppressed or the item is resolved ` +
          `and the queue was not told`,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// G5 — the validation gate was not bypassed
// ---------------------------------------------------------------------------

/**
 * `G5` — *"No allocation with a non-empty `invariants_failed` was posted"*.
 *
 * `RECONCILIATION_SPEC.md §7` makes an invariant failure *"never partially
 * posted, never repaired"* and routes the allocation to an exception instead, so
 * a posted decision carrying a failure means the gate was bypassed. The check is
 * a scan and not a type constraint on purpose: `validated-decision.ts` records
 * that `invariants_failed` is *"typed as an array rather than `never[]` because
 * `G5` is a runtime check over a recorded value: a type that made non-emptiness
 * unrepresentable would move the guarantee from the gate into the compiler and
 * leave `G5` verifying a tautology"*.
 */
function runG5(input: CloseGateInput, findings: CloseGateFinding[]): boolean {
  let passed = true;
  for (let index = 0; index < input.posted_decisions.length; index += 1) {
    const record = input.posted_decisions[index];
    const path = `posted_decisions[${String(index)}]`;
    const decisionId = readIdentifier(record?.decision_id, `${path}.decision_id`);
    const failed = record?.invariants_failed;
    if (!Array.isArray(failed)) {
      throw new ProjectionInputError(
        `${path}.invariants_failed must be an array of invariant ids (I1-I9); ` +
          `received ${String(failed)}`,
      );
    }
    const ids: string[] = [];
    for (let position = 0; position < failed.length; position += 1) {
      const id: unknown = failed[position];
      if (typeof id !== "string" || !isInvariantId(id)) {
        throw new ProjectionInputError(
          `${path}.invariants_failed[${String(position)}] is not an invariant id ` +
            `(RECONCILIATION_SPEC.md §7 declares I1-I9); received ` +
            `${JSON.stringify(id)}`,
        );
      }
      ids.push(id);
    }

    if (ids.length > 0) {
      passed = false;
      findings.push(
        finding(
          "g5_no_failed_invariant_posted",
          "INVARIANT_FAILED_DECISION_POSTED",
          decisionId,
          `decision ${decisionId} posted with invariants_failed = ` +
            `[${ids.join(", ")}]; §7 rejects an allocation on any invariant ` +
            `failure and §10.1 G5 reads a posted one as the validation gate ` +
            `having been bypassed`,
        ),
      );
    }
  }
  return passed;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function finding(
  gate: CloseGateId,
  code: CloseGateFindingCode,
  subject: string | null,
  detail: string,
): CloseGateFinding {
  return Object.freeze({ gate, code, subject, detail });
}

/** `§10.1` gate order, with each gate's findings in the order they were made. */
function orderFindings(findings: readonly CloseGateFinding[]): CloseGateFinding[] {
  const ordered: CloseGateFinding[] = [];
  for (const gate of CLOSE_GATE_IDS) {
    for (const item of findings) {
      if (item.gate === gate) ordered.push(item);
    }
  }
  return ordered;
}

function readDigest(value: unknown, field: string): Sha256 {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new ProjectionInputError(
      `${field} must be 64 lowercase hexadecimal characters (DATA_MODEL.md §0 ` +
        `rule 4); received ${JSON.stringify(value)}`,
    );
  }
  return value as Sha256;
}

function readIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new ProjectionInputError(
      `${path} must be a non-empty identifier with no surrounding whitespace; ` +
        `received ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function readKind(value: unknown, path: string): ObservationKind {
  if (
    typeof value !== "string" ||
    !(OBSERVATION_KINDS as readonly string[]).includes(value)
  ) {
    throw new ProjectionInputError(
      `${path} must be one of DATA_MODEL.md §10's nine observation kinds; ` +
        `received ${JSON.stringify(value)}`,
    );
  }
  return value as ObservationKind;
}

function readState(value: unknown, path: string): ObservationState {
  if (
    typeof value !== "string" ||
    !(OBSERVATION_STATES as readonly string[]).includes(value)
  ) {
    throw new ProjectionInputError(
      `${path} must be one of the four terminal states of DATA_MODEL.md §13 ` +
        `(RECONCILED, ABSTAINED, EXCEPTION, REFERENCE); received ` +
        `${JSON.stringify(value)}`,
    );
  }
  return value as ObservationState;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
