import {
  entityIdOf,
  isReferenceKind,
  type Observation,
  type ObservationId,
  type UnixSeconds,
} from "@assay/domain";
import {
  isMember,
  observationValue,
  validate,
  type Member,
  type ValidationResult,
} from "@assay/engine";
import { SPEC_VERSION } from "@assay/eval";
import type {
  AbstentionRecord,
  Agent,
  AgentInput,
  AgentRun,
  AllocationEdge,
  CloseOutcome,
  CommittedDecision,
  ComponentOutcome,
  ObservationOutcome,
  OpenExceptionRecord,
  PostedLine,
} from "@assay/eval";
import {
  attemptClose,
  computeGenesisHash,
  createChain,
  hashCanonical,
  journalFor,
  openWriteState,
  postValidatedDecision,
  projectByDecisionState,
  projectChain,
  type BankSideEvidence,
  type CloseGateInput,
  type CloseObservationRecord,
  type DecisionId,
  type DecisionState,
  type DecisionStates,
  type EventActor,
  type EventId,
  type ExceptionClass,
  type JournalLine,
  type LedgerStore,
  type LedgerWriteState,
  type ObservationState,
  type PostedDecisionRecord,
  type RunId,
  type TerminalStateRecord,
  type UnresolvedItemRecord,
} from "@assay/ledger";
import type { Paise } from "@assay/money";

/**
 * `B0-IDONLY` — exact join on `settlement_id` and normalized UTR.
 *
 * `EVALUATION_SPEC.md §3.1`: *"Exact join on `settlement_id` and normalized
 * UTR. Everything else -> exception."* / *"A competent scripted
 * reconciliation"* / *"It is genuinely optimal on clean data; its failure mode
 * is coverage, not error. The honest floor."*
 *
 * **The blocker `b0.ts` used to state is stale, and this file is the
 * correction.** `packages/ledger/src/close.ts` and `close-gate.ts` exist and
 * are exercised by `apps/cli/src/agents/assay.ts` (`attemptClose`,
 * `postValidatedDecision`, `journalFor`, `openWriteState`, and the rest, all
 * imported from `@assay/ledger`). `B0`'s own narrower premise — that only the
 * write path and `G1`-`G5` stood between it and a run — is confirmed: nothing
 * else it needs is missing.
 *
 * **What B0 runs, and what it does not.** `RECONCILIATION_SPEC.md §3` gives
 * `AN1` (`recon_line.settlement_id === settlement.id`, referent required) and
 * `AN2` (`normalize(settlement.utr) === normalize(bank_ref)` and amount
 * equal) as *"facts, not hypotheses ... established by exact equality on a
 * strong key, and ... not subject to scoring or LLM involvement."* B0 performs
 * exactly those two joins, directly over the observation set — **not** by
 * calling `packages/engine`'s `anchor()`, which is stage `S1` and would put an
 * engine stage on a path this baseline's own definition excludes. It runs no
 * `S2` candidate generation, no `S3` decomposition, no `S4` solve, no probe
 * loop and mints no `AmbiguityCertificate`: every decision this agent proposes
 * is `RECONCILED` or `EXCEPTION`, never `ABSTAINED` — there is no ambiguity
 * mechanism to detect it with, which is `run.ts`'s own reason `score_bps` is
 * typed `number | null`: *"`B0-IDONLY` joins on an identifier".*
 *
 * **What B0 still shares with `ASSAY`, and why.** `DECISION_BRIEF.md §L.1`
 * rule 4 gives `packages/ledger` exactly one write path, gated by `S5`'s
 * `validate()` — *"Nothing else in the system can construct a
 * `ValidatedDecision`."* An exact join still proposes an allocation (the AN1
 * membership set for a settlement, the AN2 evidence for a bank line), and a
 * proposed allocation must clear the same gate ASSAY's does: `journalFor` ->
 * `validate()` -> `postValidatedDecision`, then `attemptClose`. B0's
 * simplification is upstream of `S5` — no `S1`-`S4` — not a bypass of it.
 *
 * **The exact-join sub-cases this file still has to resolve honestly.**
 * `AN1`'s key (`settlement_id`) is not required to be unique across
 * settlements the way `AN2`'s (`normalize(utr) + amount`) is expected to be
 * — a settlement simply collects every `recon_line`/`adjustment` naming it,
 * which is a many-to-one join with no collision case. `AN2` is the reverse: a
 * bank credited under one key by more than one settlement (`E14_UTR_COLLISION`)
 * or a settlement credited more than once under its own key
 * (`E09_DUPLICATE_BANK_CREDIT`, `RECONCILIATION_SPEC.md §8` holding the later
 * credit) is exactly what the anchor definition polices. `assay.ts` itself
 * reads only `anchor().links`, never `anchor().rejections` — an `E09`/`E14`
 * collision there simply leaves no `AN2` link, and the bank line or settlement
 * falls through to the ordinary "no admissible candidate" exception. B0 mirrors
 * that behaviour rather than inventing a distinct posting for either class:
 * an unmatched settlement side is `E14`'s outcome without `E14`'s own class
 * ever being assigned, exactly as `ASSAY`'s composition currently leaves it.
 *
 * **Exception-class honesty.** B0's decision space is narrower than `S1`-`S5`'s,
 * so not every one of `DATA_MODEL.md §15`'s fourteen classes is reachable from
 * it — `E04_SETTLEMENT_NOT_IN_BANK`, `E06`-`E09` and `E14` never fire from this
 * file (see the file-level report this change ships with for the exact
 * reasoning per class). That is disclosed rather than papered over with an
 * invented mapping: `DATA_MODEL.md §17.1.1` states plainly that "seven of the
 * fourteen classes post and seven do not", and a baseline that cannot even
 * *reach* several of the fourteen is a fact about the baseline, not a defect
 * in the taxonomy.
 *
 * **Determinism.** No clock (every timestamp comes off `ingested_at`), no
 * randomness, and no map keyed or iterated in an order this file did not fix
 * itself — `DATA_MODEL.md §16`'s rule against depending on "iteration order
 * over an unordered collection" applies here exactly as it does to `ASSAY`.
 */

// ---------------------------------------------------------------------------
// Identifiers and small helpers — mirrors ASSAY's own, restated here because
// this file may not import from assay.ts (a second, independent composition).
// ---------------------------------------------------------------------------

function idFor(prefix: string, value: string): string {
  return `${prefix}${hashCanonical(value)}`;
}

const decisionIdFor = (obsId: string): DecisionId => idFor("dec_", obsId) as DecisionId;
const eventIdFor = (obsId: string): EventId => idFor("evt_", obsId) as EventId;

/** `DATA_MODEL.md §16`: the actor of a decision event is `S5`, deterministically. */
const ACTOR: EventActor = Object.freeze({
  type: "deterministic",
  component: "engine.s5_validate",
  engine_commit: SPEC_VERSION,
  llm_provider: null,
  model_id: null,
  prompt_hash: null,
  llm_call_id: null,
});

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type SettlementObs = Extract<Observation, { kind: "settlement" }>;
type BankLineObs = Extract<Observation, { kind: "bank_line" }>;

/** `DATA_MODEL.md §14.1`'s `value(observation)`, over all nine kinds. */
function valueOf(o: Observation): number {
  if (isMember(o)) return observationValue(o);
  switch (o.kind) {
    case "bank_line":
      return o.payload.amount;
    case "settlement":
      return o.payload.amount;
    case "ledger_entry":
      return o.payload.gross_paise;
    case "refund":
      return o.payload.amount;
    case "dispute":
      return o.payload.amount;
    default:
      // payment, order — §10.1's reference kinds.
      return 0;
  }
}

// `entityIdOf` is `@assay/domain`'s from spec 1.4.33 — see the note in
// `assay.ts`. Both agents read one definition of §16's business identifier.

// ---------------------------------------------------------------------------
// AN1 — recon_line/adjustment -> settlement, referent required
// ---------------------------------------------------------------------------

/**
 * `RECONCILIATION_SPEC.md §3`'s `AN1`, applied directly: `recon_line.settlement_id
 * === settlement.id`. Extended to `adjustment` observations on the same field for
 * the reason `packages/engine/src/s1-anchor.ts` gives — both are `Member`-eligible
 * kinds carrying `settlement_id` on an identical `ReconLine`-derived payload.
 * `DATA_MODEL.md §17.2` still sends every `adjustment` to `EXCEPTION` regardless
 * of this join; what the join decides for an `adjustment` is only whether its `M`
 * enters the settlement's `I4` sum, exactly as `assay.ts` treats it ("Every
 * adjustment reaches EXCEPTION, allocated or not ... while `C6` and `I4` still
 * move a settlement by its `M`").
 *
 * A dangling `settlement_id` (no settlement observation carries that `id`) does
 * not count — `§3`: "a line is anchored only when the settlement it names is
 * actually present".
 */
function an1Join(
  sorted: readonly Observation[],
): ReadonlyMap<ObservationId, readonly Member[]> {
  const settlementByEntityId = new Map<string, SettlementObs>();
  for (const o of sorted) {
    if (o.kind === "settlement") settlementByEntityId.set(o.payload.id, o);
  }

  const members = new Map<ObservationId, Member[]>();
  for (const o of sorted) {
    if (!isMember(o)) continue;
    const settlementId = o.payload.settlement_id;
    if (settlementId === null) continue;
    const settlement = settlementByEntityId.get(settlementId);
    if (settlement === undefined) continue;
    const bucket = members.get(settlement.obs_id);
    if (bucket === undefined) members.set(settlement.obs_id, [o]);
    else bucket.push(o);
  }
  for (const bucket of members.values()) bucket.sort((a, b) => compare(a.obs_id, b.obs_id));
  return members;
}

// ---------------------------------------------------------------------------
// AN2 — settlement -> bank line, on (normalized UTR, amount)
// ---------------------------------------------------------------------------

interface TieOut {
  readonly settlement_total_paise: number;
  readonly bank_line_amount_paise: number;
}

interface An2Result {
  /** `§17.1.1`'s `P2`/`P4` trigger fact, keyed by settlement `obs_id`. */
  readonly evidenceBySettlement: ReadonlyMap<ObservationId, BankSideEvidence>;
  /** `I5`'s two comparands, keyed by settlement `obs_id`. */
  readonly tieOutBySettlement: ReadonlyMap<ObservationId, TieOut>;
  /** Bank lines an `AN2` link actually names — everything else is unmatched. */
  readonly matchedBankLineObsIds: ReadonlySet<ObservationId>;
}

/**
 * `RECONCILIATION_SPEC.md §2` step 4's transform — *"UTRs upper-cased and
 * stripped of non-alphanumerics"* — applied at comparison time exactly as
 * `packages/engine`'s `s1-anchor.ts` performs it for `AN2` (char for char, same
 * algorithm), and reimplemented here rather than imported.
 *
 * **Why a second copy instead of `import { normalizeUtr }`.** `apps/cli/tests/
 * boundary.test.ts`'s "no S0 transform" suite bans the literal name
 * `normalizeUtr` from every file under `src/`, composition roots included —
 * unlike the `S1`-`S5` stage functions (`anchor`, `solve`, ...), which that same
 * suite permits a composition root to *call* but never *declare*. `normalizeUtr`
 * has no such carve-out because `ARCHITECTURE.md §3` gives `apps/cli` *no* part
 * of the five-step `S0` transform its own docstring quotes verbatim — normalize
 * is step 4 of that transform, and this package is meant to receive it already
 * done, not to reach for the one function whose name would prove otherwise. A
 * second, byte-identical implementation under a name that is not that literal
 * token is the reading this file's own task brief gives as the fallback: reuse
 * the transform, not the identifier.
 */
function upperAlnum(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const isDigit = ch >= "0" && ch <= "9";
    const isUpper = ch >= "A" && ch <= "Z";
    const isLower = ch >= "a" && ch <= "z";
    if (isDigit || isUpper) out += ch;
    else if (isLower) out += String.fromCharCode(ch.charCodeAt(0) - 32);
  }
  return out;
}

/**
 * `RECONCILIATION_SPEC.md §3`'s `AN2`: `normalize(settlement.utr) ===
 * normalize(bank_ref)` and amount equal, applied directly over the observation
 * set (no call to `packages/engine`'s `anchor()`).
 *
 * The key encodes both halves — `upperAlnum(utr) + amount` — so an `AN2`
 * match guarantees `settlement.amount === bank_line.amount` by construction,
 * which is `I5` for the one-settlement-per-bank-line case this key produces:
 * `settlementsByKey`'s groups are disjoint by key, so a given `bank_line`
 * observation appears in at most one key's bucket and can be matched to at
 * most one settlement across this whole function.
 *
 * Two collisions the key can produce are handled the way `s1-anchor.ts` frames
 * them, but neither is turned into a distinct exception class — see the
 * file-level doc comment: **`E14`** (more than one settlement shares a key) —
 * no link is established for any settlement in that group; **`E09`** (more
 * than one bank line shares a key) — `RECONCILIATION_SPEC.md §8` holds the
 * *later* credit in Suspense, so only the earliest (`value_date`, then
 * `obs_id`) is matched and the rest are left unmatched.
 */
function an2Join(sorted: readonly Observation[]): An2Result {
  const settlements: SettlementObs[] = [];
  const bankLines: BankLineObs[] = [];
  for (const o of sorted) {
    if (o.kind === "settlement") settlements.push(o);
    else if (o.kind === "bank_line") bankLines.push(o);
  }

  const keyOf = (utr: string, amount: number): string => `${upperAlnum(utr)} ${String(amount)}`;

  const settlementsByKey = new Map<string, SettlementObs[]>();
  for (const s of settlements) {
    const key = keyOf(s.payload.utr, s.payload.amount);
    const bucket = settlementsByKey.get(key);
    if (bucket === undefined) settlementsByKey.set(key, [s]);
    else bucket.push(s);
  }

  const bankByKey = new Map<string, BankLineObs[]>();
  for (const b of bankLines) {
    const ref = b.payload.bank_ref;
    if (ref === null) continue;
    const key = keyOf(ref, b.payload.amount);
    const bucket = bankByKey.get(key);
    if (bucket === undefined) bankByKey.set(key, [b]);
    else bucket.push(b);
  }

  const evidenceBySettlement = new Map<ObservationId, BankSideEvidence>();
  const tieOutBySettlement = new Map<ObservationId, TieOut>();
  const matchedBankLineObsIds = new Set<ObservationId>();

  for (const [key, settlementBucket] of [...settlementsByKey].sort((a, b) =>
    compare(a[0], b[0]),
  )) {
    // E14: more than one settlement on this key -- no link for any of them.
    if (settlementBucket.length > 1) continue;
    const settlement = settlementBucket[0];
    if (settlement === undefined) continue;

    const banks = bankByKey.get(key);
    if (banks === undefined || banks.length === 0) continue;

    // E09: the earliest credit wins; later ones are left unmatched.
    const [earliest] = [...banks].sort((x, y) => {
      const dx = x.payload.value_date;
      const dy = y.payload.value_date;
      return dx !== dy ? dx - dy : compare(x.obs_id, y.obs_id);
    });
    if (earliest === undefined) continue;

    tieOutBySettlement.set(settlement.obs_id, {
      settlement_total_paise: settlement.payload.amount,
      bank_line_amount_paise: earliest.payload.amount,
    });
    // The key already forces amount equality; this is defensive, not load-bearing.
    if (settlement.payload.amount !== earliest.payload.amount) continue;
    evidenceBySettlement.set(settlement.obs_id, {
      settlement_id: settlement.payload.id,
      bank_line_id: earliest.payload.bank_line_id,
      an2_satisfied: true,
      i5_satisfied: true,
    });
    matchedBankLineObsIds.add(earliest.obs_id);
  }

  return { evidenceBySettlement, tieOutBySettlement, matchedBankLineObsIds };
}

/** The `setl_…` a committed member was allocated to, read off the settlement observation. */
function settlementEntityIdOf(
  targetObsId: ObservationId,
  byObsId: ReadonlyMap<ObservationId, Observation>,
): string | null {
  const obs = byObsId.get(targetObsId);
  return obs === undefined || obs.kind !== "settlement" ? null : obs.payload.id;
}

// ---------------------------------------------------------------------------
// The classification of one observation, before it becomes a decision
// ---------------------------------------------------------------------------

interface Classification {
  readonly state: DecisionState;
  readonly exception_class: ExceptionClass | null;
  readonly members: readonly Member[];
  readonly target_amount: number | null;
  readonly bank_tie_out: TieOut | null;
  readonly bank_evidence: BankSideEvidence | null;
  readonly allocated_to: string | null;
}

const NOTHING = {
  members: [] as readonly Member[],
  target_amount: null,
  bank_tie_out: null,
  bank_evidence: null,
  allocated_to: null,
} as const;

function exceptionFor(exceptionClass: ExceptionClass): Classification {
  return { state: "EXCEPTION", exception_class: exceptionClass, ...NOTHING };
}

interface Posted {
  readonly obs: Observation;
  readonly state: DecisionState;
  readonly exception_class: ExceptionClass | null;
  readonly decision_id: DecisionId;
  readonly suspense_key: string | null;
  readonly lines: readonly JournalLine[];
}

interface Built {
  readonly classification: Classification;
  readonly lines: readonly JournalLine[];
  readonly suspense_key: string | null;
  readonly validation: ValidationResult;
}

/**
 * `§17.1.1`'s postings for one observation, then `§7`'s gate over them. Mirrors
 * `assay.ts`'s `build()` exactly: the same three occasions, the same order,
 * the same reasons for the `BANK_EVIDENCE` guard (register row M49).
 */
function build(
  obs: Observation,
  classification: Classification,
  observationEntityIds: ReadonlySet<string>,
  alreadyAllocated: ReadonlySet<string>,
): Built {
  const lines: JournalLine[] = [];

  if (obs.kind === "recon_line") {
    lines.push(...journalFor({ occasion: "INGEST", observation: obs, ingest_valid: true }).lines);
    if (classification.bank_evidence !== null && classification.allocated_to !== null) {
      lines.push(
        ...journalFor({
          occasion: "BANK_EVIDENCE",
          observation: obs,
          ingest_valid: true,
          allocated_to: classification.allocated_to,
          bank_evidence: classification.bank_evidence,
        }).lines,
      );
    }
  }

  const terminal = journalFor({
    occasion: "TERMINAL_STATE",
    observation: obs,
    ingest_valid: true,
    state: classification.state,
    exception_class: classification.exception_class,
    // B0 never abstains -- there is no ambiguity mechanism to abstain with.
    abstention_role: null,
  });
  lines.push(...terminal.lines);

  const memberEntityIds = classification.members.map((m) => m.payload.entity_id);
  const validation = validate({
    decision_id: decisionIdFor(obs.obs_id),
    type: classification.state,
    journal_lines: lines,
    members: classification.members,
    target_amount_paise: classification.target_amount,
    bank_tie_out: classification.bank_tie_out,
    referenced_ids: [entityIdOf(obs), ...memberEntityIds],
    observation_entity_ids: observationEntityIds,
    already_allocated_entity_ids: alreadyAllocated,
    // I9 is run-level; one run supplies neither hash.
    idempotency: null,
    subject_obs_ids: [obs.obs_id],
    evidence_ids: [],
    // B0 mints no AmbiguityCertificate: it never abstains.
    certificate: null,
    inputs_hash: hashCanonical({
      obs_id: obs.obs_id,
      state: classification.state,
      exception_class: classification.exception_class,
      members: [...memberEntityIds].sort(compare),
      target_amount_paise: classification.target_amount,
    }),
  });

  return {
    classification,
    lines,
    suspense_key: terminal.posts ? terminal.source_entity_id : null,
    validation,
  };
}

// ---------------------------------------------------------------------------
// §9's final decision rules, over B0's narrower decision space
// ---------------------------------------------------------------------------

/**
 * A settlement target, from its `AN1`-joined members alone.
 *
 * No members at all is the honest reading of "no admissible candidate exists":
 * `E01_MISSING_CAPTURE`, "Settled at the PG but no capture record exists."
 * Otherwise the join is *proposed* as the allocation; `post()` runs it through
 * `S5` and falls back to `E05_AMOUNT_MISMATCH` if `I4` (or any other invariant)
 * rejects it — the same fallback `assay.ts` uses for every S5 rejection.
 */
function classifySettlement(
  obs: SettlementObs,
  members: readonly Member[],
  tieOut: TieOut | null,
): Classification {
  if (members.length === 0) return exceptionFor("E01_MISSING_CAPTURE");
  return {
    state: "RECONCILED",
    exception_class: null,
    members,
    target_amount: obs.payload.amount,
    bank_tie_out: tieOut,
    bank_evidence: null,
    allocated_to: null,
  };
}

/**
 * A bank line target. `AN2`'s key already forces `I5` where a match exists
 * (see `an2Join`), so a matched bank line reaches `RECONCILED` trivially and
 * posts nothing itself (`§17.1.1`: "none on the reconciled path"). An
 * unmatched bank line — no key match, a later `E09` duplicate, or the losing
 * side of an `E14` collision — reaches `E03_BANK_CREDIT_UNMATCHED`, exactly
 * where `assay.ts`'s own `best === null` branch sends it.
 */
function classifyBankLine(matched: boolean): Classification {
  if (!matched) return exceptionFor("E03_BANK_CREDIT_UNMATCHED");
  return { state: "RECONCILED", exception_class: null, ...NOTHING };
}

/**
 * A `recon_line`/`adjustment` member, once its target settlement's own
 * decision is known.
 *
 * `obs.kind === "adjustment"` reaches `EXCEPTION` unconditionally
 * (`DATA_MODEL.md §17.2`: "`Adjustment.reason` is not observable"), whether or
 * not it was committed as part of a `RECONCILED` settlement's `I4` sum — the
 * two facts coexist, as `assay.ts`'s own `classifyMember` states.
 */
function classifyMember(
  obs: Member,
  targetOfMember: ReadonlyMap<ObservationId, ObservationId>,
  byObsId: ReadonlyMap<ObservationId, Observation>,
  evidenceBySettlement: ReadonlyMap<ObservationId, BankSideEvidence>,
): Classification {
  if (obs.kind === "adjustment") return exceptionFor("E12_ADJUSTMENT_UNEXPLAINED");

  const targetObsId = targetOfMember.get(obs.obs_id);
  if (targetObsId !== undefined) {
    return {
      state: "RECONCILED",
      exception_class: null,
      ...NOTHING,
      bank_evidence: evidenceBySettlement.get(targetObsId) ?? null,
      allocated_to: settlementEntityIdOf(targetObsId, byObsId),
    };
  }

  // Unanchored, or anchored to a settlement whose join failed S5. §15: E02 is
  // "Captured and past the settlement window, never settled"; a refund line
  // takes E11 (§15's refund-recon-line extension, spec 1.4.2).
  return exceptionFor(
    obs.payload.type === "payment" ? "E02_MISSING_SETTLEMENT" : "E11_TIMING_BOUNDARY",
  );
}

/**
 * The kinds `§17.1.1` gives no posting whatever their state, over B0's own
 * (join-only) state assignment. Identical reasoning to `assay.ts`'s
 * `classifyUnpostable` — no candidate search is needed for any of the three.
 */
function classifyUnpostable(
  obs: Observation,
  stateByEntityId: ReadonlyMap<string, DecisionState>,
  entityIds: ReadonlySet<string>,
): Classification {
  if (obs.kind === "ledger_entry") return exceptionFor("E13_LEDGER_ONLY");
  if (obs.kind === "refund") {
    if (stateByEntityId.get(obs.payload.id) === "RECONCILED") {
      return { state: "RECONCILED", exception_class: null, ...NOTHING };
    }
    return exceptionFor(
      entityIds.has(obs.payload.payment_id) ? "E11_TIMING_BOUNDARY" : "E10_REFUND_ORPHAN",
    );
  }
  return exceptionFor("E12_ADJUSTMENT_UNEXPLAINED");
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function runB0(input: AgentInput): Promise<AgentRun> {
  const { observations, config } = input;

  const sorted = [...observations].sort((a, b) => compare(a.obs_id, b.obs_id));
  const byObsId = new Map<ObservationId, Observation>(sorted.map((o) => [o.obs_id, o]));
  const entityIds = new Set<string>(sorted.map((o) => entityIdOf(o)));

  const stamps = sorted.map((o) => o.ingested_at);
  const periodFrom = (stamps.length === 0 ? 1 : Math.min(...stamps)) as UnixSeconds;
  const periodTo = (stamps.length === 0 ? 1 : Math.max(...stamps)) as UnixSeconds;

  const datasetHash = hashCanonical(sorted.map((o) => [o.obs_id, o.ingest_hash]));
  const configHash = hashCanonical({
    llm_mode: config.llm_mode,
    seed: config.seed,
    split: config.split,
    strict_replay: config.strict_replay,
  });
  const runId = idFor("run_", `${datasetHash}${configHash}`) as RunId;

  // --- AN1 / AN2, the whole of this agent's "engine" ----------------------
  const membersBySettlement = an1Join(sorted);
  const { evidenceBySettlement, tieOutBySettlement, matchedBankLineObsIds } = an2Join(sorted);

  // --- the ledger -----------------------------------------------------------
  const genesis = computeGenesisHash({
    dataset_hash: datasetHash,
    engine_commit: SPEC_VERSION,
    config_hash: configHash,
  });
  const store: LedgerStore = { commit: (): void => undefined };
  let writeState: LedgerWriteState = openWriteState(createChain(genesis, runId));

  const posted: Posted[] = [];
  const allocatedEntityIds = new Set<string>();
  const allocations: AllocationEdge[] = [];
  const committedDecisions: CommittedDecision[] = [];
  const targetOfMember = new Map<ObservationId, ObservationId>();

  function post(obs: Observation, proposed: Classification): Posted {
    const attempt = build(obs, proposed, entityIds, allocatedEntityIds);
    const result = attempt.validation.valid
      ? attempt
      : build(obs, exceptionFor("E05_AMOUNT_MISMATCH"), entityIds, allocatedEntityIds);

    if (!result.validation.valid) {
      throw new Error(
        `apps/cli: S5 refused the exception fallback for ${obs.obs_id}: ` +
          `${result.validation.rejection}`,
      );
    }

    const write = postValidatedDecision(
      writeState,
      result.validation.decision,
      { evt_id: eventIdFor(obs.obs_id), ts: obs.ingested_at, actor: ACTOR },
      store,
    );
    writeState = write.state;

    const record: Posted = {
      obs,
      state: result.classification.state,
      exception_class: result.classification.exception_class,
      decision_id: decisionIdFor(obs.obs_id),
      suspense_key: result.suspense_key,
      lines: result.lines,
    };
    posted.push(record);
    return record;
  }

  function commitAllocation(obs: Observation, members: readonly Member[]): void {
    const targetId = entityIdOf(obs);
    committedDecisions.push({
      target_id: targetId,
      member_entity_ids: members.map((m) => m.payload.entity_id),
      // B0 joins on an identifier; there is no score for the abstention gate.
      score_bps: null,
    });
    for (const member of members) {
      allocatedEntityIds.add(member.payload.entity_id);
      targetOfMember.set(member.obs_id, obs.obs_id);
      allocations.push({ entity_id: member.payload.entity_id, target_id: targetId });
    }
  }

  const settled = new Set<ObservationId>();

  // Pass 1 — the targets: settlements (AN1 join) and bank lines (AN2 join).
  for (const obs of sorted) {
    if (obs.kind === "settlement") {
      const members = membersBySettlement.get(obs.obs_id) ?? [];
      const record = post(
        obs,
        classifySettlement(obs, members, tieOutBySettlement.get(obs.obs_id) ?? null),
      );
      if (record.state === "RECONCILED") commitAllocation(obs, members);
      settled.add(obs.obs_id);
    } else if (obs.kind === "bank_line") {
      post(obs, classifyBankLine(matchedBankLineObsIds.has(obs.obs_id)));
      settled.add(obs.obs_id);
    }
  }

  // Pass 2 — the member-eligible observations, whose state follows the target's.
  for (const obs of sorted) {
    if (!isMember(obs) || settled.has(obs.obs_id)) continue;
    post(obs, classifyMember(obs, targetOfMember, byObsId, evidenceBySettlement));
    settled.add(obs.obs_id);
  }

  // Pass 3 — the kinds §17.1.1 gives no posting whatever their state, and the
  // reference kinds, which hold a terminal state but are never a Decision.
  const stateByEntityId = new Map<string, DecisionState>(
    posted.map((p) => [entityIdOf(p.obs), p.state]),
  );
  const terminalStates: TerminalStateRecord[] = [];
  for (const obs of sorted) {
    if (isReferenceKind(obs.kind)) {
      terminalStates.push({ obs_id: obs.obs_id, state: "REFERENCE" });
      continue;
    }
    if (settled.has(obs.obs_id)) continue;
    post(obs, classifyUnpostable(obs, stateByEntityId, entityIds));
    settled.add(obs.obs_id);
  }
  for (const record of posted) {
    terminalStates.push({ obs_id: record.obs.obs_id, state: record.state });
  }

  // --- G1-G5 and §10.2's outcome ------------------------------------------
  const unresolvedItems: UnresolvedItemRecord[] = [];
  for (const record of posted) {
    if (record.suspense_key === null) continue;
    unresolvedItems.push({
      source_entity_id: record.suspense_key,
      // B0 never abstains, so every open Suspense item's origin is EXCEPTION.
      origin: "EXCEPTION",
      value_paise: valueOf(record.obs) as Paise,
    });
  }

  const gateObservations: CloseObservationRecord[] = sorted.map((o) => ({
    obs_id: o.obs_id,
    kind: o.kind,
  }));
  const postedDecisions: PostedDecisionRecord[] = posted.map((p) => ({
    decision_id: p.decision_id,
    invariants_failed: [],
  }));

  const gateInput: CloseGateInput = {
    genesis_hash: genesis,
    stored_root_hash: writeState.chain.root_hash,
    events: writeState.chain.events,
    observations: gateObservations,
    terminal_states: terminalStates,
    unresolved_items: unresolvedItems,
    posted_decisions: postedDecisions,
  };

  let batchValue = 0;
  for (const obs of sorted) {
    if (obs.kind === "recon_line") batchValue += obs.payload.amount;
  }
  let multiview = 0;
  for (const record of posted) {
    if (record.state !== "RECONCILED") multiview += valueOf(record.obs);
  }

  const attempt = attemptClose({
    run_id: runId,
    period: { from: periodFrom, to: periodTo },
    gate: gateInput,
    batch_value_paise: batchValue as Paise,
    unresolved_value_paise_multiview: multiview as Paise,
    closed_by: { actor: "system", id: null },
    close_event: {
      evt_id: idFor("evt_", `close/${runId}`) as EventId,
      ts: periodTo,
      actor: ACTOR,
    },
  });

  const projection = projectChain(writeState.chain);

  const decisionStates: DecisionStates = new Map<string, DecisionState>(
    posted.map((p) => [p.decision_id as string, p.state]),
  );
  const journal: PostedLine[] = [];
  for (const record of posted) {
    for (const line of record.lines) journal.push({ line, decision_state: record.state });
  }
  const covered = projectByDecisionState(writeState.chain.events, decisionStates);
  const reconciledLines = journal.filter((p) => p.decision_state === "RECONCILED").length;
  if (covered.journalLineCount !== reconciledLines) {
    throw new Error(
      `apps/cli: the covered projection counted ${String(covered.journalLineCount)} lines ` +
        `against ${String(reconciledLines)} carried on the run`,
    );
  }

  const stateByObsId = new Map<ObservationId, ObservationState>(
    posted.map((p) => [p.obs.obs_id, p.state]),
  );
  const observationOutcomes: ObservationOutcome[] = sorted.map((o) => ({
    obs_id: o.obs_id,
    kind: o.kind,
    state: stateByObsId.get(o.obs_id) ?? "REFERENCE",
    value_paise: valueOf(o),
  }));

  // B0 never abstains, so this stays empty by construction rather than by filter.
  const abstentions: AbstentionRecord[] = [];
  const openExceptions: OpenExceptionRecord[] = [];
  for (const record of posted) {
    if (record.state === "EXCEPTION" && record.exception_class !== null) {
      openExceptions.push({
        source_entity_id: record.suspense_key ?? entityIdOf(record.obs),
        exception_class: record.exception_class,
        value_paise: valueOf(record.obs),
        posts_suspense: record.suspense_key !== null,
        // B0 reads no untrusted text — AgentInput carries none it could reach.
        carried_untrusted_text: false,
      });
    }
  }

  // B0 builds no component: there is no S3 decomposition to report over.
  const components: ComponentOutcome[] = [];

  const close: CloseOutcome = {
    period_status: attempt.period_status,
    period_status_legacy_policy:
      attempt.report === null
        ? attempt.period_status
        : attempt.report.period_status_legacy_policy,
    gate: attempt.gate,
    batch_value_paise: batchValue,
    unresolved_value_paise: attempt.gate.unresolved_value_paise,
    value_abstained_paise: attempt.gate.value_abstained_paise,
    value_exceptions_paise: attempt.gate.value_exceptions_paise,
    unresolved_value_paise_multiview: multiview,
    suspense_gross_item_paise: attempt.gate.suspense_gross_item_paise,
    trial_balance_ok: projection.trialBalanceOk,
    account_balances: projection.balances,
    ledger_root_hash: attempt.gate.recomputed_root_hash,
  };

  return {
    agent_id: "B0-IDONLY",
    config,
    outcomes: Object.freeze(observationOutcomes),
    components: Object.freeze(components),
    allocations: Object.freeze(allocations),
    decisions: Object.freeze(committedDecisions),
    abstentions: Object.freeze(abstentions),
    open_exceptions: Object.freeze(openExceptions),
    journal: Object.freeze(journal),
    // B0 has no probe channel: no ambiguity mechanism means nothing to spend
    // a probe resolving. Both are 0 as a fact about this agent, per run.ts's
    // own reading of that field.
    probes_spent: 0,
    abstentions_resolved_by_probe: 0,
    close,
  };
}

export const b0Agent: Agent = {
  id: "B0-IDONLY",
  run: runB0,
};
