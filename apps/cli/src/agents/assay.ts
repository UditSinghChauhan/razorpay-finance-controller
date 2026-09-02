import {
  entityIdOf,
  isReferenceKind,
  type ConstraintId,
  type Observation,
  type ObservationId,
  type UnixSeconds,
} from "@assay/domain";
import {
  EPSILON_BPS,
  anchor,
  buildSeam,
  decompose,
  evaluate,
  generateCandidates,
  isMember,
  modalLagDays,
  solve,
  validate,
  type AnchorLink,
  type Candidate,
  type ClauseVerdict,
  type DecomposedComponent,
  type EvaluationContext,
  type GenerationStatus,
  type InvariantSelection,
  type Member,
  type ScoredSolution,
  type SolveInput,
  type SolveOutcome,
  type SolveResult,
  type Target,
  type ValidationResult,
} from "@assay/engine";
import { SPEC_VERSION } from "@assay/eval";
import type {
  AbstentionRecord,
  Agent,
  AgentId,
  AgentInput,
  AgentRun,
  AllocationEdge,
  CloseOutcome,
  CommittedDecision,
  ComponentOutcome,
  ObservationOutcome,
  OpenExceptionRecord,
  PostedLine,
  RunConfig,
  ScoredLlmMode,
} from "@assay/eval";
import type { R3CertificateSummary } from "@assay/llm";
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
  type AbstentionRole,
  type AmbiguityCertificate,
  type BankSideEvidence,
  type CandidateId,
  type CertificateReason,
  type CloseGateInput,
  type CloseObservationRecord,
  type ComponentId,
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
  type ProbeId,
  type RunId,
  type TerminalStateRecord,
  type UnresolvedItemRecord,
} from "@assay/ledger";
import type { Paise } from "@assay/money";

import { valueOf } from "../values.js";

import { resolveConfig } from "../config.js";
import { AgentUnavailableError } from "../errors.js";
import { runProbeLoop } from "../probe/run.js";
import { buildProvider } from "../providers.js";

/**
 * `ASSAY` — the system under test, composed here (spec 1.4.29, M47).
 *
 * `ARCHITECTURE.md §10` gives every agent one interface — *"Observations ->
 * Decisions + Ledger"* — and `EVALUATION_SPEC.md §3.2` states why that matters:
 * an ablation is a control only while it *"differs from ASSAY in exactly one
 * respect, so the difference is attributable"*, which is false the moment an
 * ablation is a second codebase. So `ASSAY` is the composition, and `a1.ts`,
 * `a2.ts` and `a3.ts` are this file with one component removed.
 *
 * **Why this file is here and not in `packages/eval`.** `DECISION_BRIEF.md §K`
 * placed it there, and an ASSAY agent cannot live there: it composes
 * `packages/engine` (S1-S5), `packages/llm` (`§6.2`'s `R3`), `packages/probe`
 * and `packages/ledger`, and `eslint.config.js` refuses the first three anywhere
 * under `packages/eval/`. Register row **M37** had already ratified the reason at
 * spec 1.4.23 — *"hosting the run loop there would put the system under test
 * inside the thing measuring it"* — and `§K` never absorbed it. The agent is
 * constructed in the composition root and **injected**; `packages/eval` imports
 * nothing new.
 *
 * ---
 *
 * ## The pipeline, and who owns each step
 *
 * ```
 *   S0            apps/cli's read + packages/domain's ingest; the runner hands
 *                 this agent the already-parsed Observation[] (ARCHITECTURE.md §3)
 *   S1            packages/engine   anchor()
 *   S1 -> S2      packages/engine   buildSeam()
 *   S2            packages/engine   generateCandidates()
 *   S3            packages/engine   decompose()
 *   S4            packages/engine   solve(), then apps/cli's probe/run.ts
 *                                   composition of §6.6 where §6.2's loop is
 *                                   required -- which packages/probe's `decide`
 *                                   defines as AMBIGUOUS with budget left
 *   §17.1.1       packages/ledger   journalFor()   -- the PROPOSED postings
 *   S5            packages/engine   validate()     -- I1..I9 over them
 *   write         packages/ledger   openWriteState() + postValidatedDecision()
 *   G1-G5         packages/ledger   attemptClose(), which runs closeGate()
 *   §4.4          packages/ledger   projectByDecisionState()
 * ```
 *
 * **Not one of those stages is implemented here, and none is worked around.**
 * `RECONCILIATION_SPEC.md §6.2` makes `packages/probe` *"the ONLY constructor of
 * a probe call, so a caller cannot dispatch around them"*, and the same
 * reasoning governs every row: this file sequences calls and holds no rule.
 * `boundary.test.ts` states the licence in one line — *"A composition root may
 * CALL a stage; it may not BE one"* — and asserts it against this directory's
 * source text.
 *
 * **`journalFor` is called before `validate`, not after.** `ARCHITECTURE.md §4`
 * boundary 3 draws the line there: `journal.ts` is *"a pure function over a
 * **proposed** allocation and deliberately does not take a `ValidatedDecision`
 * ... so that S5 -> `I1` -> mint -> write stays acyclic"*. `I1` is a trial
 * balance **over the journal lines**, so the lines exist before the gate that
 * checks them, and the branded artifact exists only after it.
 *
 * **One decision per reconcilable observation.** `DECISION_BRIEF.md §L.1` rule 5
 * gives every observation *"exactly one terminal state ... No fifth state, no
 * drop path"*, and gate `G1` checks exactly that; a decision per observation is
 * that rule expressed as the unit of the write path. `DATA_MODEL.md §13`'s
 * fourth state is the exception: a `REFERENCE` observation *"produces no
 * `Decision` at all"*, so it holds a terminal state for `G1` and reaches the
 * chain never.
 *
 * ## What the agent cannot reach, stated rather than filled in
 *
 * - **The `§6.2` probe surface.** `PREREGISTRATION.md §6.2` `AL8` keeps
 *   `recon_report*.jsonl` reachable *"only through the probe executor, under
 *   `P_max`"*, and `AgentInput` carries *"only `observations` and `config`, no
 *   path and no reader"* (`eslint.config.js`, `G8`). So the available-probe
 *   context offered to `R3` is **empty** — `probe/run.ts`'s own second filter
 *   ("a probe this build cannot dispatch is not offered, because proposing it
 *   could only burn `P_max` on a refusal") applied at the one place that knows
 *   the surface is absent. `R3` is still consulted, so the loop, the budget and
 *   the attribution are one code path for `ASSAY` and `A3-NOLLM`; it can only
 *   decline, so no `ValidatedProbeCall` is constructed and the dispatch is
 *   unreachable. Its path is left empty rather than invented.
 * - **A build identity.** `DATA_MODEL.md §16` binds genesis to
 *   `(dataset_hash, engine_commit, config_hash)`. Two of the three are functions
 *   of `AgentInput`; the third is not carried on it, so `SPEC_VERSION` — the
 *   specification the engine was built at — is what this run can name.
 * - **A clock.** Every timestamp is read off the observation set's own
 *   `ingested_at`, so two runs over identical inputs agree byte for byte
 *   (`I9`, metric 23). `§16` excludes `ts` from the hashed body in any case;
 *   what determinism buys here is a reported close period that does not drift.
 */

// ---------------------------------------------------------------------------
// The blocker the three ablations still report
// ---------------------------------------------------------------------------

/**
 * The blocker `ASSAY`'s three ablations share.
 *
 * Shared rather than repeated because `§3.2`'s *"exactly one respect"* is a
 * property of the code: an ablation that named a different set of missing
 * dependencies would already differ from `ASSAY` in a second respect.
 *
 * `ASSAY` itself no longer raises it — the pipeline above is composed — and this
 * stays because `a1.ts`, `a2.ts` and `a3.ts` each remove one component from that
 * pipeline and no removal is built. `A3-NOLLM` is `§3.2`'s *"literally `ASSAY
 * --llm=offline`"* and is the nearest of the three to being reachable; which
 * flag reaches which agent is the runner's decision and is not taken here.
 */
export function assayPipelineBlocker(
  agentId: string,
  removed: string | null,
): AgentUnavailableError {
  return new AgentUnavailableError(
    agentId,
    "packages/domain (S0), packages/engine (the S1->S2 seam), packages/ledger " +
      "(the write path and the G1-G5 close gate)",
    "ARCHITECTURE.md §3, §10; DECISION_BRIEF.md §L.1 rule 4, §L.2; " +
      "RECONCILIATION_SPEC.md §10.1",
    `${removed === null ? "ASSAY" : `${agentId}, which is ASSAY with ${removed} removed,`} ` +
      `composes stages this app does not own and the removal itself is not built.`,
  );
}

// ---------------------------------------------------------------------------
// Identifiers — DATA_MODEL.md §0 rule 3's prefixes over a content digest
// ---------------------------------------------------------------------------

/**
 * `§16` forbids an ASSAY-internal identifier from depending on *"iteration order
 * over an unordered collection"*, so every id below is a prefix over a digest of
 * the thing it names. Content-addressed rather than counted: an index would be a
 * function of the loop that happened to mint it, and `§0` rule 3's suffix
 * grammar is `[A-Za-z0-9]+`, which a hexadecimal digest satisfies.
 */
function idFor(prefix: string, value: string): string {
  return `${prefix}${hashCanonical(value)}`;
}

const decisionIdFor = (obsId: string): DecisionId => idFor("dec_", obsId) as DecisionId;
const eventIdFor = (obsId: string): EventId => idFor("evt_", obsId) as EventId;
const componentIdFor = (component: DecomposedComponent): ComponentId =>
  idFor("comp_", [...component.target_ids, ...component.member_obs_ids].join("|")) as ComponentId;
const candidateIdFor = (solution: ScoredSolution): CandidateId =>
  idFor("cand_", solution.canonical_key) as CandidateId;

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

/**
 * The same actor with `A1-NOVALIDATE`'s removal named on it (spec 1.4.31, M50).
 *
 * `§16` types `LedgerEvent.actor.component` as a free token and `events.ts`
 * accepts any non-spoofing string, so this **invents no field and no schema
 * change** — it is `DECISION_BRIEF.md §A.38`'s *"already-existing allowed
 * metadata surface"*, and it is the audit trail's own copy of a fact
 * `Decision.invariants_checked` records on the decision side. A reader holding
 * only the event log can see which run had the gate removed; a reader holding
 * only the decisions can see it too; neither has to be trusted about the other.
 *
 * `ASSAY`'s actor is {@link ACTOR}, byte-identical to what it has always been,
 * so no existing hash moves. `A1`'s events hash differently from `ASSAY`'s, which
 * is correct — they are different agents' runs, and `I9`/metric 23 compare a run
 * against **itself**, not against another agent.
 */
const ACTOR_A1_NOVALIDATE: EventActor = Object.freeze({
  ...ACTOR,
  component: "engine.s5_validate.a1_novalidate",
});

/** `ASSAY`'s actor, or `A1`'s when `S5`'s invariant evaluation was removed. */
function actorFor(selection: InvariantSelection | undefined): EventActor {
  return selection === undefined ? ACTOR : ACTOR_A1_NOVALIDATE;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type BankLineObs = Extract<Observation, { kind: "bank_line" }>;

// ---------------------------------------------------------------------------
// value(observation) — DATA_MODEL.md §14.1's table
// ---------------------------------------------------------------------------

// `valueOf` — §14.1's nine-kind table — is `../values.js`'s.
// It was transcribed here and in `b0.ts`, and `bench/scorer.ts` needs the same
// table to build the value maps `metrics/harm.ts` and `metrics/abstention.ts`
// take as parameters; a third copy is a third place §14.1 can drift. The move
// is the one `entityIdOf` already made at M55, for the same reason.

// `entityIdOf` — the business identifier `§16` calls "the observation's own" —
// is `@assay/domain`'s from spec 1.4.33 (register row DATA_MODEL.md §22.2 M55).
// It was transcribed here and in `b0.ts`; M55's metric 15 keys on the same field
// from `packages/eval`, and three copies of one §16 rule is three places for the
// two journals to come to disagree about what keys them.

// ---------------------------------------------------------------------------
// The bank side — §17.1.1's P2/P4 trigger and I5's two comparands
// ---------------------------------------------------------------------------

interface TieOut {
  readonly settlement_total_paise: number;
  readonly bank_line_amount_paise: number;
}

interface BankSide {
  /** Keyed by settlement `obs_id`. Present only where `AN2` **and** `I5` hold. */
  readonly evidence: ReadonlyMap<ObservationId, BankSideEvidence>;
  /** `I5`'s two sides, present wherever a mapping exists at all. */
  readonly tie_out: ReadonlyMap<ObservationId, TieOut>;
}

/**
 * Read `§17.1.1`'s bank-side condition off `S1`'s `AN2` links.
 *
 * *"the settlement it is allocated to is itself reconciled to a bank credit
 * through real bank-side evidence — `AN2` satisfied against an actual
 * `bank_line`, and `I5` therefore defined and satisfied"*. Both halves are read
 * from the links `S1` **established**, never re-matched on the `UTR`, so an
 * anchor `§3` refused (`E09`, `E14`) cannot re-enter through this door — the
 * property `s1-s2-seam.ts` states for the same reason.
 *
 * `I5` is *"undefined — not satisfied — when no bank-line mapping exists"*, so a
 * settlement with no `AN2` link appears in neither map.
 */
function readBankSide(
  links: readonly AnchorLink[],
  byObsId: ReadonlyMap<ObservationId, Observation>,
): BankSide {
  const bankOf = new Map<ObservationId, BankLineObs>();
  for (const link of links) {
    if (link.anchor !== "AN2") continue;
    const source = byObsId.get(link.source_obs_id);
    const target = byObsId.get(link.target_obs_id);
    if (source === undefined || source.kind !== "settlement") continue;
    if (target === undefined || target.kind !== "bank_line") continue;
    bankOf.set(source.obs_id, target);
  }

  // I5's left side: "Σ settlement.amount mapped to a bank line".
  const totals = new Map<ObservationId, number>();
  for (const [settlementObsId, bank] of bankOf) {
    const settlement = byObsId.get(settlementObsId);
    if (settlement === undefined || settlement.kind !== "settlement") continue;
    totals.set(bank.obs_id, (totals.get(bank.obs_id) ?? 0) + settlement.payload.amount);
  }

  const evidence = new Map<ObservationId, BankSideEvidence>();
  const tieOut = new Map<ObservationId, TieOut>();
  for (const [settlementObsId, bank] of bankOf) {
    const settlement = byObsId.get(settlementObsId);
    if (settlement === undefined || settlement.kind !== "settlement") continue;
    const total = totals.get(bank.obs_id) ?? 0;
    tieOut.set(settlementObsId, {
      settlement_total_paise: total,
      bank_line_amount_paise: bank.payload.amount,
    });
    if (total !== bank.payload.amount) continue;
    evidence.set(settlementObsId, {
      settlement_id: settlement.payload.id,
      bank_line_id: bank.payload.bank_line_id,
      an2_satisfied: true,
      i5_satisfied: true,
    });
  }
  return { evidence, tie_out: tieOut };
}

/** The members `AN1` anchored to one settlement, read off `S1`'s links. */
function anchoredMembersOf(
  settlementObsId: ObservationId,
  links: readonly AnchorLink[],
  byObsId: ReadonlyMap<ObservationId, Observation>,
): readonly Member[] {
  const out = new Map<ObservationId, Member>();
  for (const link of links) {
    if (link.anchor !== "AN1" || link.target_obs_id !== settlementObsId) continue;
    const source = byObsId.get(link.source_obs_id);
    if (source === undefined || !isMember(source)) continue;
    out.set(source.obs_id, source);
  }
  return [...out.values()].sort((a, b) => compare(a.obs_id, b.obs_id));
}

// ---------------------------------------------------------------------------
// The classification of one observation, before it becomes a decision
// ---------------------------------------------------------------------------

interface Classification {
  readonly state: DecisionState;
  readonly exception_class: ExceptionClass | null;
  readonly abstention_role: AbstentionRole | null;
  /** The proposed allocation's members. Empty for a decision that allocates nothing. */
  readonly members: readonly Member[];
  /** `I4`'s comparand. `null` where the decision closes no settlement. */
  readonly target_amount: number | null;
  /** `I5`'s two sides, or `null` where the invariant is undefined. */
  readonly bank_tie_out: TieOut | null;
  /** `§17.1.1`'s `P2`/`P4` trigger, where `S1` established it. */
  readonly bank_evidence: BankSideEvidence | null;
  /**
   * `§17.1.1`'s *"the settlement it is allocated to"* — the `setl_…` of the
   * target this decision allocates the observation to (register row
   * `DATA_MODEL.md §22.2` M49). `null` where the decision allocates nothing.
   *
   * Read from the **allocation**, not from the evidence: it is the target
   * observation's own `payload.id`, while `bank_evidence.settlement_id` comes
   * from the settlement `S1`'s `AN2` link names. `journal.ts` compares the two,
   * so they must arrive from independent sources or the check is vacuous.
   */
  readonly allocated_to: string | null;
  readonly certificate: AmbiguityCertificate | null;
}

const NOTHING = {
  members: [] as readonly Member[],
  target_amount: null,
  bank_tie_out: null,
  bank_evidence: null,
  allocated_to: null,
  certificate: null,
} as const;

/** `§9`: an exception *"carries a class + owner"*, and allocates nothing. */
function exceptionFor(exceptionClass: ExceptionClass): Classification {
  return { state: "EXCEPTION", exception_class: exceptionClass, abstention_role: null, ...NOTHING };
}

/** What one posted decision left behind, for the close gate and for the run. */
interface Posted {
  readonly obs: Observation;
  readonly state: DecisionState;
  readonly exception_class: ExceptionClass | null;
  readonly decision_id: DecisionId;
  /** `JournalLine.source_entity_id` where the terminal-state rule opened a Suspense item. */
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
 * `§17.1.1`'s postings for one observation, then `§7`'s gate over them.
 *
 * Three occasions can fire for one observation and they are three separate
 * calls, because `journal.ts` makes them four separate **events** — *"`P1` posts
 * a capture the recon report asserts; `P2` posts a bank credit that arrives days
 * later"*. They are carried on one decision because `DECISION_BRIEF.md §L.1`
 * rule 4 admits exactly one mutating function and it posts one decision; what
 * the decision books is every line `§17.1.1` fires for the observation it is
 * about.
 */
function build(
  obs: Observation,
  classification: Classification,
  observationEntityIds: ReadonlySet<string>,
  alreadyAllocated: ReadonlySet<string>,
  invariantSelection: InvariantSelection | undefined,
): Built {
  const lines: JournalLine[] = [];

  // The unconditional rows. Every observation this agent sees passed S0's ingest
  // validation -- `ingest()` reports its rejects on a separate field and the
  // runner passes only the accepted set -- so §17.1.1's trigger is satisfied.
  if (obs.kind === "recon_line") {
    lines.push(...journalFor({ occasion: "INGEST", observation: obs, ingest_valid: true }).lines);
    // §17.1.1 rows 2 and 4. Both halves are required and neither is inferred
    // from the other: the evidence is `AN2`/`I5` as `S1` established them, and
    // `allocated_to` is the settlement this decision allocates the line to
    // (M49). A decision that allocates nothing has no allocation to post a bank
    // leg under, whatever evidence exists for some other target.
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
    abstention_role: classification.abstention_role,
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
    // `I6`: "every LLM-referenced entity ID must exist in the observation set".
    // A deterministic decision references its own subject and its allocation.
    referenced_ids: [entityIdOf(obs), ...memberEntityIds],
    observation_entity_ids: observationEntityIds,
    already_allocated_entity_ids: alreadyAllocated,
    // `I9` is run-level and evaluable only from two executions; `§7` folds it in
    // "only when the caller supplies both hashes", and one run supplies neither.
    idempotency: null,
    // M50 (spec 1.4.31). Spread rather than assigned, so that for every agent
    // but `A1-NOVALIDATE` the field is ABSENT rather than explicitly undefined:
    // the `ValidationInput` ASSAY builds is the one it has always built, and
    // `packages/engine`'s default of the full `I1`-`I8` set applies for the
    // reason it always did. This file only FORWARDS the value; it cannot
    // originate one: `eslint.config.js` bans both the empty selection's literal
    // and the `invariantSelection` option key in every apps/cli file but a1.ts,
    // and this file spells neither.
    ...(invariantSelection === undefined ? {} : { invariant_selection: invariantSelection }),
    subject_obs_ids: [obs.obs_id],
    evidence_ids: [],
    certificate: classification.certificate,
    // §16: "hash of everything the step read".
    inputs_hash: hashCanonical({
      obs_id: obs.obs_id,
      state: classification.state,
      exception_class: classification.exception_class,
      abstention_role: classification.abstention_role,
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
// §13's AmbiguityCertificate
// ---------------------------------------------------------------------------

/** The clause verdicts one candidate draws, keyed by constraint. */
function verdictsOf(
  solution: ScoredSolution,
  context: EvaluationContext,
  memberById: ReadonlyMap<ObservationId, Member>,
): ReadonlyMap<ConstraintId, string> {
  // `Candidate.member_obs_ids` is "the whole allocation, ANCHORED members
  // INCLUDED" (§11) and `evaluate` unions the anchored set itself, so the
  // anchored half is removed before the call rather than counted twice.
  const anchored = new Set<ObservationId>(context.target.anchored_members.map((m) => m.obs_id));
  const members: Member[] = [];
  for (const id of solution.candidate.member_obs_ids) {
    if (anchored.has(id)) continue;
    const member = memberById.get(id);
    if (member !== undefined) members.push(member);
  }

  const out = new Map<ConstraintId, string>();
  for (const clause of evaluate(members, context).clauses) {
    const verdict: ClauseVerdict = clause.verdict;
    out.set(clause.id, `${out.get(clause.id) ?? ""}${verdict}|`);
  }
  return out;
}

/** `§13`: the `C1`-`C8` clauses *"both solutions satisfy identically"*. */
function sharedConstraints(
  result: SolveResult,
  context: EvaluationContext,
  memberById: ReadonlyMap<ObservationId, Member>,
): readonly ConstraintId[] {
  const best = result.best;
  const second = result.second;
  if (best === null || second === null) return [];
  const a = verdictsOf(best, context, memberById);
  const b = verdictsOf(second, context, memberById);
  const out: ConstraintId[] = [];
  for (const [id, verdict] of a) {
    if (b.get(id) === verdict) out.push(id);
  }
  return out;
}

/**
 * `DATA_MODEL.md §13`'s certificate — *"the difference between 'confidence 0.62'
 * and 'here is the specific alternative I could not rule out'"*.
 *
 * **`epsilon_bps` is `packages/engine`'s constant, imported rather than
 * spelled.** `§13` requires the certificate to record *"whichever margin was in
 * force"*, `PREREGISTRATION.md §7` freezes it, and `s4-solve.ts` is the one
 * place it is compared against a gap. No result field carries it, so it is read
 * from the module that freezes it; nothing here declares a second copy, which is
 * what `§L.1` rule 12 protects.
 *
 * **A `SEARCH_BOUND_EXCEEDED` certificate names no second solution, and that is
 * disclosed rather than fabricated.** `§4.3` reaches `INTRACTABLE` before any
 * candidate is scored, so both solutions are empty and their ids name the
 * component. `packages/ledger` records the same gap from its own side: the
 * *"strictly below `epsilon_bps`"* relation is *"deliberately not enforced ...
 * whether it holds for a `SEARCH_BOUND_EXCEEDED` certificate is an open
 * governance question"*, and it is not settled here either.
 */
function certificateFor(
  result: SolveResult,
  reason: CertificateReason,
  compId: ComponentId,
  probeIds: readonly ProbeId[],
  context: EvaluationContext,
  memberById: ReadonlyMap<ObservationId, Member>,
): AmbiguityCertificate {
  const solutionOf = (
    solution: ScoredSolution | null,
    label: string,
  ): { readonly candidate_id: CandidateId; readonly member_obs_ids: readonly ObservationId[] } =>
    solution === null
      ? {
          candidate_id: idFor("cand_", `${compId}/${label}`) as CandidateId,
          member_obs_ids: [],
        }
      : {
          candidate_id: candidateIdFor(solution),
          member_obs_ids: solution.candidate.member_obs_ids,
        };

  return {
    comp_id: compId,
    solution_a: solutionOf(result.best, "a"),
    solution_b: solutionOf(result.second, "b"),
    shared_hard_constraints: sharedConstraints(result, context, memberById),
    evidence_score_gap_bps: result.delta_s_bps ?? 0,
    materiality_paise: (result.materiality_paise ?? 0) as Paise,
    epsilon_bps: EPSILON_BPS,
    tau_paise: result.tau_paise as Paise,
    probes_attempted: probeIds,
    reason,
  };
}

/** `§6.2`'s certificate, as `R3` receives it — amounts as opaque references. */
function summarize(
  result: SolveResult,
  compId: ComponentId,
  context: EvaluationContext,
  memberById: ReadonlyMap<ObservationId, Member>,
): R3CertificateSummary {
  return {
    solution_a_obs_ids: result.best?.candidate.member_obs_ids ?? [],
    solution_b_obs_ids: result.second?.candidate.member_obs_ids ?? [],
    shared_hard_constraints: sharedConstraints(result, context, memberById),
    evidence_score_gap_bps: result.delta_s_bps ?? 0,
    epsilon_bps: EPSILON_BPS,
    // `ARCHITECTURE.md §6`: "amounts as opaque references". τ and the paise
    // figure stay on the deterministic side; what crosses is a token.
    materiality_ref: `${compId}.materiality`,
  };
}

// ---------------------------------------------------------------------------
// §11's Component, as metric 25 reads it
// ---------------------------------------------------------------------------

/**
 * `DATA_MODEL.md §11`'s three-valued `solve_status`, from `S3` and `S2`'s own
 * reports rather than from a fourth reading.
 *
 * `§4.3` fixes `INTRACTABLE` as the bound `S3` already recorded on
 * `exceeds_k_max`, and a component no candidate mentions has nothing to solve.
 */
function solveStatusOf(
  component: DecomposedComponent,
  tagged: readonly { readonly target_id: string }[],
  generationByTarget: ReadonlyMap<ObservationId, GenerationStatus>,
): ComponentOutcome["solve_status"] {
  if (component.exceeds_k_max) return "INTRACTABLE";
  // §4.3's other half. Metric 25's `intractable_rate` counts the bound however
  // it was hit, so a component whose enumeration stopped is INTRACTABLE here
  // even though `S3` saw a graph small enough to be within `K_max`.
  for (const id of component.target_ids) {
    if (generationByTarget.get(id as ObservationId) === "INTRACTABLE") return "INTRACTABLE";
  }
  const targets = new Set(component.target_ids);
  return tagged.some((t) => targets.has(t.target_id)) ? "SOLVED" : "EMPTY";
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** One target's `S4` result, with what `§6.2`'s loop spent reaching it. */
interface TargetOutcome {
  readonly solve: SolveResult;
  readonly probes_spent: number;
  readonly probe_ids: readonly ProbeId[];
  readonly resolved_by_probe: boolean;
  readonly comp_id: ComponentId;
  readonly context: EvaluationContext;
  /**
   * `S2`'s own `§4.3` report, which no `S4` input carries.
   *
   * `§4.3` gives `INTRACTABLE` two triggers — *"exceeding `K_max` members or
   * `C_max` enumerated candidates"* — and they are reported in different places:
   * `S3` records the first on `DecomposedComponent.exceeds_k_max`, which `solve`
   * reads, while the second is `CandidateSet.status` and reaches nobody but the
   * caller. Carrying it is what stops a truncated enumeration from arriving at
   * `§9`'s *"no admissible candidate exists at all"*, which is a different fact
   * about a different dataset.
   */
  readonly generation: GenerationStatus;
}

/**
 * The internal composition knobs `A2-NOABSTAIN` and `A3-NOLLM` vary.
 *
 * **`apps/cli`-internal only** — not part of `RunConfig` (`packages/eval`
 * owns that, and `EVALUATION_SPEC.md §3.2` puts `llm_mode` there already, for
 * `ASSAY` itself) and not exported from `packages/eval`'s public surface. This
 * is the "configuration flag over `assay.ts`" `a1.ts`/`a2.ts`/`a3.ts`'s own
 * docstrings describe: each ablation differs from `ASSAY` in exactly one field
 * of this object, which is `§3.2`'s *"exactly one respect"* made a code fact
 * rather than a documentation claim.
 */
export interface AssayComposeOptions {
  /** The `AgentId` this run reports as (`EVALUATION_SPEC.md §3`). */
  readonly agentId: AgentId;
  /**
   * `A3-NOLLM`: forces `config.llm_mode` to `"offline"` regardless of what the
   * caller's `AgentInput.config.llm_mode` says — `§3.2`'s *"A3-NOLLM is exactly
   * ASSAY --llm=offline"*. `undefined` leaves `config.llm_mode` as given, which
   * is `ASSAY`'s own behaviour.
   */
  readonly llmModeOverride?: ScoredLlmMode;
  /**
   * `A2-NOABSTAIN`: when a target would abstain (`classifyTarget`'s
   * `reason !== null` branch), commit `result.best` instead, through the same
   * `S5`/ledger path a `RECONCILED` decision uses. `I1`-`I9` still run on the
   * forced commit — this flag changes nothing about `validate()` or about what
   * `S4` computed, only what `classifyTarget` decides to *do* with an
   * abstaining outcome. `false`/`undefined` is `ASSAY`'s own behaviour.
   */
  readonly commitOnAbstain?: boolean;
  /**
   * `A1-NOVALIDATE`: which allocation-scoped invariants stage `S5` evaluates
   * (spec 1.4.31, register row `DATA_MODEL.md §22.2` **M50**).
   *
   * `undefined` — every agent but `A1` — is `packages/engine`'s default, the
   * full set `I1`–`I8`, so `ASSAY`'s behaviour is unchanged in the strictest
   * sense: the field is absent from the `ValidationInput` it builds.
   *
   * **This file forwards the value and cannot originate one.** The empty
   * selection's literal is banned by `eslint.config.js` everywhere except
   * `apps/cli/src/agents/a1.ts`, so the composition that `ASSAY`, `B0`,
   * `A2` and `A3` all run through has no way to reach the empty set — which is
   * what `DECISION_BRIEF.md §L.1` rule 4's M50 clause requires of it.
   *
   * Removing `S5`'s invariant **evaluation** is the whole of the difference.
   * Nothing else moves: `journalFor` builds the same lines, the single write
   * path still refuses a non-empty `invariants_failed` (`G5`), `I1` is still
   * re-checked on the cumulative totals at every append, and `G1`–`G5` still run
   * at close. `EVALUATION_SPEC.md §3.2`'s *"exactly one respect"*, literally.
   */
  readonly invariantSelection?: InvariantSelection;
  /**
   * `EVALUATION_SPEC.md §5.1`'s `ε` for this execution, in integer basis points
   * (spec 1.4.32, register row `DATA_MODEL.md §22.2` **M51**).
   *
   * `undefined` — every ordinary execution — is `packages/engine`'s default,
   * `PREREGISTRATION.md §7`'s frozen `1500`, so the field is absent from the
   * `SolveInput` this file builds and `ASSAY`'s behaviour is unchanged in the
   * strictest sense.
   *
   * **It lives here rather than on `RunConfig` because M51 says so.** The scored
   * unit stays `(agent_id, split, seed, llm_mode)` — `EVALUATION_SPEC.md §7`'s
   * M48 derives it as *"exactly four fields"* — and a sweep point is *"an
   * evaluation inside one scored unit, never a fifth key dimension"*. This
   * object is already `apps/cli`-internal and already carries exactly this kind
   * of per-execution knob, which is why the sweep parameters join it rather than
   * `AgentInput`: an agent's inputs are *"observations and configuration, and
   * nothing else"*, and `packages/eval`'s `Agent` interface is untouched.
   */
  readonly epsilonBps?: number;
  /**
   * `§5.3`'s `τ` **floor** for this execution, in paise (M51).
   *
   * `undefined` is `packages/engine`'s frozen `TAU.floor_paise`. Only the floor
   * moves: the `10` bps rate is `frozen.ts`'s on every call, swept or not, which
   * spec 1.4.6 fixed — the sweep *"sweeps τ over absolute values and does not
   * read the base"*.
   */
  readonly tauFloorPaise?: number;
}

/**
 * The `§6` outcome tally over a run's targets — M51's `tau_sensitivity` input.
 *
 * `EVALUATION_SPEC.md §5.3` fixes what the τ sweep reports: `coverage_by_value`,
 * `count(AMBIGUOUS)` and `count(IMMATERIALLY_AMBIGUOUS)`. The first is
 * `packages/eval`'s `coverage()` over the `AgentRun`; the other two are **not
 * derivable from an `AgentRun`** — an `IMMATERIALLY_AMBIGUOUS` target commits
 * exactly as `UNIQUE` and `DISCRIMINATED` do, so the three are indistinguishable
 * once a decision is recorded. They are therefore counted here, where `S4`'s
 * result is still in hand.
 *
 * **This does not reach `packages/eval`.** `AgentRun` gains no field and no
 * metric definition moves: the tally travels beside the run on
 * {@link ComposedRun}, which is `apps/cli`-internal, and only the sweep writer
 * reads it.
 */
export type SolveOutcomeTally = Readonly<Record<SolveOutcome, number>>;

/** Every `§6` outcome at zero, in `RECONCILIATION_SPEC.md §6`'s own order. */
export const ZERO_SOLVE_OUTCOMES: SolveOutcomeTally = Object.freeze({
  UNIQUE: 0,
  IMMATERIALLY_AMBIGUOUS: 0,
  DISCRIMINATED: 0,
  AMBIGUOUS: 0,
  INTRACTABLE: 0,
});

/**
 * What one composed execution produced: the agent's product, and the `§6` tally
 * beside it.
 *
 * `Agent.run` returns the `AgentRun` alone (`ARCHITECTURE.md §10`); this is the
 * `apps/cli`-internal shape the sweep runner consumes, so that surfacing the
 * tally costs `packages/eval` nothing.
 */
export interface ComposedRun {
  readonly run: AgentRun;
  readonly solve_outcomes: SolveOutcomeTally;
}

/** `ARCHITECTURE.md §10`'s interface, composed. */
async function runAssayComposed(
  input: AgentInput,
  options: AssayComposeOptions,
): Promise<ComposedRun> {
  const { observations } = input;
  const config: RunConfig =
    options.llmModeOverride === undefined
      ? input.config
      : { ...input.config, llm_mode: options.llmModeOverride };
  const commitOnAbstain = options.commitOnAbstain ?? false;
  // M50: `undefined` for every agent but `A1-NOVALIDATE`. Read once and passed
  // down, so there is exactly one place the run's selection is decided.
  const invariantSelection = options.invariantSelection;
  const actor = actorFor(invariantSelection);

  // --- the provider -------------------------------------------------------
  // §3.2: `llm_mode` "is the whole of the difference" between ASSAY and
  // A3-NOLLM. The model id and the cache directory are `config.ts`'s defaults
  // rather than this file's: a second spelling of a default is a second place it
  // is decided. No environment is read -- `resolveConfig` takes it as an
  // argument, and an agent has none.
  const provider = buildProvider({
    ...resolveConfig(
      { command: null, flags: new Map<string, string | true>(), positional: [] },
      {},
    ),
    llmProvider: config.llm_mode,
    strictReplay: config.strict_replay,
  });

  // --- run-level facts ----------------------------------------------------
  const sorted = [...observations].sort((a, b) => compare(a.obs_id, b.obs_id));
  const byObsId = new Map<ObservationId, Observation>(sorted.map((o) => [o.obs_id, o]));
  const entityIds = new Set<string>(sorted.map((o) => entityIdOf(o)));
  const obsIdByEntityId = new Map<string, ObservationId>(
    sorted.map((o) => [entityIdOf(o), o.obs_id]),
  );
  const memberPool = sorted.filter((o): o is Member => isMember(o));
  const memberById = new Map<ObservationId, Member>(memberPool.map((m) => [m.obs_id, m]));
  // §4.2's SE3 population is "every recon_line observation in the dataset", so
  // it is run-level: computed once and passed into every solve.
  const modeDays = modalLagDays(memberPool);

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

  // --- S1, and the S1 -> S2 seam ------------------------------------------
  const anchors = anchor(sorted);
  const seam = buildSeam({ observations: sorted, anchors });
  const bankSide = readBankSide(anchors.links, byObsId);

  // --- S2 ------------------------------------------------------------------
  const tagged: { readonly target_id: string; readonly candidate: Candidate }[] = [];
  const candidatesByTarget = new Map<ObservationId, readonly Candidate[]>();
  const generationByTarget = new Map<ObservationId, GenerationStatus>();
  seam.targets.forEach((target, index) => {
    const context = seam.contexts[index];
    if (context === undefined) return;
    const generated = generateCandidates(seam.pool, context);
    candidatesByTarget.set(target.obs_id, generated.candidates);
    generationByTarget.set(target.obs_id, generated.status);
    for (const candidate of generated.candidates) {
      tagged.push({ target_id: target.obs_id, candidate });
    }
  });

  // --- S3 ------------------------------------------------------------------
  const decomposition = decompose({
    targets: seam.targets,
    pool: seam.pool,
    candidates: tagged,
  });
  const componentByTarget = new Map<string, DecomposedComponent>();
  const componentIdByMember = new Map<string, ComponentId>();
  for (const component of decomposition.components) {
    const compId = componentIdFor(component);
    for (const id of component.target_ids) componentByTarget.set(id, component);
    for (const id of component.member_obs_ids) componentIdByMember.set(id, compId);
  }

  // --- S4, and §6.2's loop where it is required ---------------------------
  const outcomes = new Map<ObservationId, TargetOutcome>();
  for (const [index, target] of seam.targets.entries()) {
    const context = seam.contexts[index];
    const component = componentByTarget.get(target.obs_id);
    if (context === undefined || component === undefined) continue;

    const members = [...target.anchored_members, ...seam.pool];
    const partial = {
      component,
      target,
      candidates: candidatesByTarget.get(target.obs_id) ?? [],
      members,
      mode_days: modeDays,
      target_entity_id: targetEntityId(target, byObsId),
      observationIdForEntityId: (id: string): ObservationId | undefined => obsIdByEntityId.get(id),
      bank_evidence: bankSide.evidence.get(target.obs_id) ?? null,
      // M51: absent unless a sweep supplied one, so `packages/engine` resolves
      // `PREREGISTRATION.md §7`'s frozen pair and an ordinary run is unchanged.
      // Both flow through `runProbeLoop`'s `Omit<SolveInput, ...>` and its
      // re-solve for free -- the loop spreads the input it was given.
      ...(options.epsilonBps === undefined ? {} : { epsilon_bps: options.epsilonBps }),
      ...(options.tauFloorPaise === undefined
        ? {}
        : { tau_floor_paise: options.tauFloorPaise }),
    } satisfies Omit<SolveInput, "recon_reports" | "probe_attempts">;

    const first = solve({ ...partial, recon_reports: [], probe_attempts: 0 });
    const compId = componentIdFor(component);

    // packages/probe's `decide` owns the gate -- "Probing is gated on AMBIGUOUS
    // alone ... no probe enlarges a bound" -- and re-reaches this same first
    // solve itself. Entering the loop on any other outcome would spend budget on
    // a case §6.2 says it cannot help.
    if (first.outcome !== "AMBIGUOUS") {
      outcomes.set(target.obs_id, {
        solve: first,
        probes_spent: 0,
        probe_ids: [],
        resolved_by_probe: false,
        comp_id: compId,
        context,
        generation: generationByTarget.get(target.obs_id) ?? "COMPLETE",
      });
      continue;
    }

    const loop = await runProbeLoop({
      runId,
      compId,
      provider,
      solveInput: partial,
      universe: { hasEntityId: (id: string): boolean => entityIds.has(id) },
      // Empty by necessity, not by policy: see the module header.
      context: {},
      certificate: summarize(first, compId, context, memberById),
      reconDateScope: String(periodTo),
      dispatch: { reconReportPath: "" },
    });

    outcomes.set(target.obs_id, {
      solve: loop.solve,
      probes_spent: loop.state.attempts,
      probe_ids: loop.state.probes_attempted,
      resolved_by_probe: loop.state.attempts > 0 && loop.stop === null,
      comp_id: compId,
      context,
      generation: generationByTarget.get(target.obs_id) ?? "COMPLETE",
    });
  }

  // --- the ledger ---------------------------------------------------------
  const genesis = computeGenesisHash({
    dataset_hash: datasetHash,
    engine_commit: SPEC_VERSION,
    config_hash: configHash,
  });
  // The agent's product is the AgentRun it returns. `§L.2` places persistence
  // after this package, `AgentInput` carries no path and `src/agents/**` may not
  // reach the filesystem door, so the port is satisfied by a sink that keeps
  // nothing: `apps/cli`'s own commands own `ARCHITECTURE.md §8`'s database.
  const store: LedgerStore = { commit: (): void => undefined };
  let writeState: LedgerWriteState = openWriteState(createChain(genesis, runId));

  const posted: Posted[] = [];
  const allocatedEntityIds = new Set<string>();
  const allocations: AllocationEdge[] = [];
  const committedDecisions: CommittedDecision[] = [];
  const targetOfMember = new Map<ObservationId, ObservationId>();
  const certificateByComponent = new Map<ComponentId, AmbiguityCertificate>();

  function post(obs: Observation, proposed: Classification): Posted {
    const attempt = build(obs, proposed, entityIds, allocatedEntityIds, invariantSelection);
    // §7: "any invariant failure rejects the allocation ... never partially
    // posted, never repaired, never downgraded to a warning", and §9 sends "an
    // S5 invariant failed" to EXCEPTION. §15's E05 is the tie-out that "fails by
    // a non-zero delta"; the re-classified decision allocates nothing, so no
    // member is committed on a gate that refused it.
    const result = attempt.validation.valid
      ? attempt
      : build(
          obs,
          exceptionFor("E05_AMOUNT_MISMATCH"),
          entityIds,
          allocatedEntityIds,
          invariantSelection,
        );

    if (!result.validation.valid) {
      // Unreachable: the fallback allocates nothing, carries no certificate and
      // posts only what §17.1.1 fires unconditionally. Thrown rather than
      // defaulted, because a decision reaching the write path un-validated is
      // the one thing ARCHITECTURE.md §4 boundary 3 exists to prevent.
      throw new Error(
        `apps/cli: S5 refused the exception fallback for ${obs.obs_id}: ` +
          `${result.validation.rejection}`,
      );
    }

    const write = postValidatedDecision(
      writeState,
      result.validation.decision,
      { evt_id: eventIdFor(obs.obs_id), ts: obs.ingested_at, actor },
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

  function commitAllocation(
    obs: Observation,
    members: readonly Member[],
    scoreBps: number | null,
  ): void {
    const targetId = entityIdOf(obs);
    committedDecisions.push({
      target_id: targetId,
      member_entity_ids: members.map((m) => m.payload.entity_id),
      score_bps: scoreBps,
    });
    for (const member of members) {
      allocatedEntityIds.add(member.payload.entity_id);
      targetOfMember.set(member.obs_id, obs.obs_id);
      allocations.push({ entity_id: member.payload.entity_id, target_id: targetId });
    }
  }

  // Pass 1 — the targets. §17.1.1 makes the target the party that carries an
  // unresolved obligation, so a member's own state follows from what the target
  // was actually allowed to commit.
  for (const resolved of seam.anchor_resolved) {
    const obs = byObsId.get(resolved.obs_id);
    if (obs === undefined) continue;
    // Read by KIND, not by resolution name: the two resolutions are the seam's
    // vocabulary and stay there. A settlement is here because AN1 already tied
    // it out; a bank line because AN2 named its settlement, which
    // PREREGISTRATION.md §10 V18 calls "the only route by which a bank line
    // reaches RECONCILED".
    const members =
      obs.kind === "settlement" ? anchoredMembersOf(obs.obs_id, anchors.links, byObsId) : [];
    const record = post(obs, {
      state: "RECONCILED",
      exception_class: null,
      abstention_role: null,
      members,
      target_amount: obs.kind === "settlement" ? obs.payload.amount : null,
      bank_tie_out: bankSide.tie_out.get(obs.obs_id) ?? null,
      // §17.1.1: settlement and bank_line post nothing on the reconciled path --
      // I4 and I5 make them aggregates, and P2 already posts the bank leg per
      // line. A target is not ALLOCATED to a settlement; it is one.
      bank_evidence: null,
      allocated_to: null,
      certificate: null,
    });
    // §4.6: `score_bps` is null "where the agent's gate consulted no score at
    // all", and an anchor is an identifier fact rather than a scored solution.
    if (record.state === "RECONCILED") commitAllocation(obs, members, null);
  }

  for (const target of seam.targets) {
    const obs = byObsId.get(target.obs_id);
    const outcome = outcomes.get(target.obs_id);
    if (obs === undefined || outcome === undefined) continue;

    const classification = classifyTarget(
      obs,
      outcome,
      bankSide,
      memberById,
      commitOnAbstain,
    );
    if (classification.certificate !== null) {
      certificateByComponent.set(outcome.comp_id, classification.certificate);
    }
    const record = post(obs, classification);
    if (record.state === "RECONCILED") {
      // §4.6 / M57: the score is carried on `RECONCILIATION_SPEC.md §6` step 3's
      // DISCRIMINATED branch and NOWHERE else, because that branch is metric 7's
      // whole population. `delta_s_bps` is also non-null on
      // IMMATERIALLY_AMBIGUOUS -- §6 computes the gap and then decides on
      // MATERIALITY, never consulting it -- so passing it through unfiltered
      // would put a decision the gap did not decide into the calibration set.
      // `run.ts` states the contract; this is the one site that satisfies it.
      commitAllocation(
        obs,
        classification.members,
        outcome.solve.outcome === "DISCRIMINATED" ? outcome.solve.delta_s_bps : null,
      );
    }
  }

  // Pass 2a — the member-eligible observations, whose state follows the target's.
  const abstainedComponents = new Set<ComponentId>();
  for (const record of posted) {
    if (record.state !== "ABSTAINED") continue;
    const outcome = outcomes.get(record.obs.obs_id);
    if (outcome !== undefined) abstainedComponents.add(outcome.comp_id);
  }
  const settled = new Set<ObservationId>(posted.map((p) => p.obs.obs_id));

  for (const obs of memberPool) {
    if (settled.has(obs.obs_id)) continue;
    post(
      obs,
      classifyMember(
        obs,
        targetOfMember,
        componentIdByMember,
        abstainedComponents,
        certificateByComponent,
        bankSide,
        byObsId,
      ),
    );
    settled.add(obs.obs_id);
  }

  // Pass 2b — the kinds §17.1.1 gives no posting whatever their state.
  const stateByEntityId = new Map<string, DecisionState>(
    posted.map((p) => [entityIdOf(p.obs), p.state]),
  );
  const terminalStates: TerminalStateRecord[] = [];
  for (const obs of sorted) {
    if (isReferenceKind(obs.kind)) {
      // §10.1: "assigned statically at ingest from `kind` alone, never by a
      // decision", and §13 gives a reference observation no Decision at all — so
      // it holds a terminal state for G1 and reaches the chain never.
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
      origin: record.state === "ABSTAINED" ? "ABSTENTION" : "EXCEPTION",
      value_paise: valueOf(record.obs) as Paise,
    });
  }

  const gateObservations: CloseObservationRecord[] = sorted.map((o) => ({
    obs_id: o.obs_id,
    kind: o.kind,
  }));
  const postedDecisions: PostedDecisionRecord[] = posted.map((p) => ({
    decision_id: p.decision_id,
    // Gate G5 reads what was posted, and the write path refuses a non-empty
    // list, so every decision on the chain carries none by construction.
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

  // §4.1's denominator: "Σ recon_line.amount".
  let batchValue = 0;
  for (const obs of sorted) {
    if (obs.kind === "recon_line") batchValue += obs.payload.amount;
  }
  // The superseded benchmark v1.0.2 universe: value(observation) over every
  // reconcilable observation in ABSTAINED or EXCEPTION. EXPLORATORY, "never a
  // gate and never a close-policy input", and a queue-side quantity
  // packages/ledger cannot hold.
  let multiview = 0;
  for (const record of posted) {
    if (record.state !== "RECONCILED") multiview += valueOf(record.obs);
  }

  const attempt = attemptClose({
    run_id: runId,
    period: { from: periodFrom, to: periodTo },
    // `attemptClose` runs `closeGate` as §10.4 steps 1-5 and returns its result
    // on `.gate`; calling the gate again here would run G1-G5 twice over one log
    // and leave two answers where §10.1 states one.
    gate: gateInput,
    batch_value_paise: batchValue as Paise,
    unresolved_value_paise_multiview: multiview as Paise,
    closed_by: { actor: "system", id: null },
    close_event: {
      evt_id: idFor("evt_", `close/${runId}`) as EventId,
      ts: periodTo,
      // The run's own actor, so one run carries one actor value across its
      // decision events and its close event rather than two (M50).
      actor,
    },
  });

  // §10.4 step 7's CLOSE event comes back as a DRAFT for the single write path
  // to append, and that path accepts only what S5 minted -- so it is not
  // appended here, and `ledger_root_hash` is the root the gates were run
  // against, which is the value `CloseReport` records under that name.
  const projection = projectChain(writeState.chain);

  // --- §4.4's covered-set projection --------------------------------------
  const decisionStates: DecisionStates = new Map<string, DecisionState>(
    posted.map((p) => [p.decision_id as string, p.state]),
  );
  const journal: PostedLine[] = [];
  for (const record of posted) {
    for (const line of record.lines) journal.push({ line, decision_state: record.state });
  }
  // The map must be TOTAL over every posting decision: `projectByDecisionState`
  // raises ProjectionInputError otherwise, because "silently dropping a posting
  // the caller forgot to classify would move `balance_harm_inr` by an amount
  // nobody would see". This call discharges that obligation.
  const covered = projectByDecisionState(writeState.chain.events, decisionStates);
  const reconciledLines = journal.filter((p) => p.decision_state === "RECONCILED").length;
  if (covered.journalLineCount !== reconciledLines) {
    // The join is packages/ledger's; `decision_state` on the line is this run's
    // copy of it, and `run.ts` warns that "duplicating that join here would let
    // the two disagree". They are compared rather than assumed to agree.
    throw new Error(
      `apps/cli: the covered projection counted ${String(covered.journalLineCount)} lines ` +
        `against ${String(reconciledLines)} carried on the run`,
    );
  }

  // --- the run -------------------------------------------------------------
  const stateByObsId = new Map<ObservationId, ObservationState>(
    posted.map((p) => [p.obs.obs_id, p.state]),
  );
  const observationOutcomes: ObservationOutcome[] = sorted.map((o) => ({
    obs_id: o.obs_id,
    kind: o.kind,
    state: stateByObsId.get(o.obs_id) ?? "REFERENCE",
    value_paise: valueOf(o),
  }));

  const abstentions: AbstentionRecord[] = [];
  const openExceptions: OpenExceptionRecord[] = [];
  for (const record of posted) {
    if (record.state === "ABSTAINED" && record.suspense_key !== null) {
      abstentions.push({
        source_entity_id: record.suspense_key,
        value_paise: valueOf(record.obs),
        // Metric 18 is REPORTED by the party that read the text. This agent
        // reads none: the quarantine is unreachable from apps/cli at all
        // (DATA_MODEL.md §10), so the attribution is a fact about the code
        // rather than a default.
        carried_untrusted_text: false,
      });
    }
    if (record.state === "EXCEPTION" && record.exception_class !== null) {
      openExceptions.push({
        source_entity_id: record.suspense_key ?? entityIdOf(record.obs),
        exception_class: record.exception_class,
        value_paise: valueOf(record.obs),
        posts_suspense: record.suspense_key !== null,
        carried_untrusted_text: false,
      });
    }
  }

  const components: ComponentOutcome[] = decomposition.components.map((component) => ({
    size: component.size,
    solve_status: solveStatusOf(component, tagged, generationByTarget),
  }));

  let probesSpent = 0;
  let resolvedByProbe = 0;
  for (const outcome of outcomes.values()) {
    probesSpent += outcome.probes_spent;
    if (outcome.resolved_by_probe) resolvedByProbe += 1;
  }

  const close: CloseOutcome = {
    period_status: attempt.period_status,
    period_status_legacy_policy:
      attempt.report === null
        ? attempt.period_status
        : attempt.report.period_status_legacy_policy,
    // `CloseGateResult` carries §20's field names, so it projects onto
    // `CloseGateOutcome` without a rename and without this file naming a gate.
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

  // M51's `tau_sensitivity` counts, taken from the `S4` results still in hand.
  // Iteration order does not reach the value -- these are counts over a set --
  // so `§16`'s bar on a result depending on iteration order is not engaged.
  const solveOutcomes: Record<SolveOutcome, number> = { ...ZERO_SOLVE_OUTCOMES };
  for (const outcome of outcomes.values()) {
    solveOutcomes[outcome.solve.outcome] += 1;
  }

  return {
    run: {
      agent_id: options.agentId,
      config,
      outcomes: Object.freeze(observationOutcomes),
      components: Object.freeze(components),
      allocations: Object.freeze(allocations),
      decisions: Object.freeze(committedDecisions),
      abstentions: Object.freeze(abstentions),
      open_exceptions: Object.freeze(openExceptions),
      journal: Object.freeze(journal),
      probes_spent: probesSpent,
      abstentions_resolved_by_probe: resolvedByProbe,
      close,
    },
    solve_outcomes: Object.freeze(solveOutcomes),
  };
}

// ---------------------------------------------------------------------------
// §9's final decision rules, one function per population
// ---------------------------------------------------------------------------

/** The target's **entity** id, which `§6.2`'s report and `§17.1.1`'s key use. */
function targetEntityId(
  target: Target,
  byObsId: ReadonlyMap<ObservationId, Observation>,
): string | null {
  if (target.kind !== "settlement") return null;
  const obs = byObsId.get(target.obs_id);
  return obs === undefined || obs.kind !== "settlement" ? null : obs.payload.id;
}

/**
 * `§17.1.1`'s `allocated_to` for a committed allocation (M49): the `setl_…` of
 * the target observation an accepted decision allocated a member to.
 *
 * The same field `targetEntityId` reads, reached from an `obs_id` rather than
 * from an `S2` `Target`, because pass 2a holds the allocation edge and not the
 * target record. `null` for a target that is not a settlement, which `§17.1.1`
 * gives no `P2`/`P4` row anyway.
 */
function settlementEntityIdOf(
  targetObsId: ObservationId,
  byObsId: ReadonlyMap<ObservationId, Observation>,
): string | null {
  const obs = byObsId.get(targetObsId);
  return obs === undefined || obs.kind !== "settlement" ? null : obs.payload.id;
}

/**
 * `§9` over one target.
 *
 * ```
 *   certificate_reason !== null   ABSTAINED  -- S4 returned AMBIGUOUS or
 *                                              INTRACTABLE; §6's certificate is
 *                                              the abstention
 *   best === null                 EXCEPTION  -- "no admissible candidate exists
 *                                              at all"
 *   otherwise                     RECONCILED -- UNIQUE / DISCRIMINATED /
 *                                              IMMATERIALLY_AMBIGUOUS
 * ```
 *
 * An abstention passes `null` for `I4` and `I5`: both are **allocation-scoped**,
 * and an abstention allocates nothing, so comparing an empty allocation against
 * the settlement's own amount would reject the abstention for being one.
 */
function classifyTarget(
  obs: Observation,
  outcome: TargetOutcome,
  bankSide: BankSide,
  memberById: ReadonlyMap<ObservationId, Member>,
  commitOnAbstain: boolean,
): Classification {
  const result = outcome.solve;
  // §4.3's second trigger, which `solve` cannot see: "exceeding ... C_max
  // enumerated candidates yields solve_status: INTRACTABLE ... Reported rather
  // than silently truncated -- ASSAY reports the bound it hit." An enumeration
  // that stopped at a bound has not established that no admissible candidate
  // exists, so §9 sends it to ABSTAINED with the engine's own reason for a
  // bound, not to EXCEPTION.
  const reason: CertificateReason | null =
    result.certificate_reason ??
    (outcome.generation === "INTRACTABLE" ? "SEARCH_BOUND_EXCEEDED" : null);

  // `A2-NOABSTAIN` (`EVALUATION_SPEC.md §3.2`): "always commits the top
  // candidate" instead of abstaining. This is the one branch that removes --
  // whatever `result.best` is (possibly `null`, S4's "no feasible solution at
  // all") falls straight into the same `best === null` / RECONCILED logic
  // below that ASSAY already uses for a non-abstaining target. No certificate
  // is built on this path, because it is never reached under `commitOnAbstain`.
  if (reason !== null && !commitOnAbstain) {
    return {
      state: "ABSTAINED",
      exception_class: null,
      // §17.1.1's target rows: P5 for a bank line, P6 for a settlement. The
      // target universe is settlements and bank lines and this does not widen it.
      abstention_role: "TARGET",
      members: [],
      target_amount: null,
      bank_tie_out: null,
      bank_evidence: null,
      allocated_to: null,
      certificate: certificateFor(
        result,
        reason,
        outcome.comp_id,
        outcome.probe_ids,
        outcome.context,
        memberById,
      ),
    };
  }

  const best = result.best;
  if (best === null) {
    if (obs.kind === "bank_line") {
      // DATA_MODEL.md §11.1: "a bank_line target has no admissible member ...
      // such a target reaches EXCEPTION by §9's 'no admissible candidate exists
      // at all', with class E03".
      return exceptionFor("E03_BANK_CREDIT_UNMATCHED");
    }
    // §15 separates the two settlement failures by which side is missing: E04 is
    // "Settlement marked processed, no bank credit" -- no AN2 link -- and E01 is
    // "Settled at the PG but no capture record exists", which is the settlement
    // whose bank credit S1 did name and whose constituents S2 could not.
    return exceptionFor(
      bankSide.tie_out.has(obs.obs_id) ? "E01_MISSING_CAPTURE" : "E04_SETTLEMENT_NOT_IN_BANK",
    );
  }

  const members: Member[] = [];
  for (const id of best.candidate.member_obs_ids) {
    const member = memberById.get(id);
    if (member !== undefined) members.push(member);
  }

  return {
    state: "RECONCILED",
    exception_class: null,
    abstention_role: null,
    members,
    target_amount: obs.kind === "settlement" ? obs.payload.amount : null,
    bank_tie_out: bankSide.tie_out.get(obs.obs_id) ?? null,
    // As above: the target carries no P2/P4 leg of its own.
    bank_evidence: null,
    allocated_to: null,
    certificate: null,
  };
}

/**
 * `§9` over one member-eligible observation.
 *
 * A member is never a target (`§17.1.1`: *"A `recon_line` is therefore never a
 * target — it reaches an abstained component as a **member**"*), so its own
 * decision allocates nothing and `I2`-`I4` are evaluated on the target's
 * decision, where the allocation actually is.
 *
 * **Every adjustment reaches `EXCEPTION`, allocated or not.** `DATA_MODEL.md
 * §17.2`: *"`Adjustment.reason` is not observable"*, so *"an adjustment is never
 * reported as `RECONCILED`"* — while `C6` and `I4` still move a settlement by its
 * `M`. The two facts coexist in `§17.1.1` and are not reconciled away here.
 */
function classifyMember(
  obs: Member,
  targetOfMember: ReadonlyMap<ObservationId, ObservationId>,
  componentIdByMember: ReadonlyMap<string, ComponentId>,
  abstainedComponents: ReadonlySet<ComponentId>,
  certificateByComponent: ReadonlyMap<ComponentId, AmbiguityCertificate>,
  bankSide: BankSide,
  byObsId: ReadonlyMap<ObservationId, Observation>,
): Classification {
  if (obs.kind === "adjustment") return exceptionFor("E12_ADJUSTMENT_UNEXPLAINED");

  const targetObsId = targetOfMember.get(obs.obs_id);
  if (targetObsId !== undefined) {
    return {
      state: "RECONCILED",
      exception_class: null,
      abstention_role: null,
      ...NOTHING,
      // §17.1.1's P2/P4 trigger, which fires on the line rather than on the
      // aggregate. The evidence is passed as `S1` established it: M49 fixes the
      // trigger's "settlement it is allocated to" as the ALLOCATION's target,
      // which for a committed decision is the target this member was allocated
      // to, and `journal.ts` checks the evidence against that. A line `§3` left
      // unanchored therefore posts its bank leg on the allocation that explains
      // it, instead of losing it to a field `DROP_SETTLEMENT_ID` emptied.
      bank_evidence: bankSide.evidence.get(targetObsId) ?? null,
      allocated_to: settlementEntityIdOf(targetObsId, byObsId),
    };
  }

  const compId = componentIdByMember.get(obs.obs_id);
  const certificate = compId === undefined ? undefined : certificateByComponent.get(compId);
  if (compId !== undefined && abstainedComponents.has(compId) && certificate !== undefined) {
    return {
      state: "ABSTAINED",
      exception_class: null,
      // §17.1.1's third abstention row: the obligation "is the target's and is
      // carried whole by the target's item; a second posting for each member
      // would relieve 1100_GATEWAY_RECEIVABLE again for one break".
      abstention_role: "MEMBER",
      members: [],
      target_amount: null,
      bank_tie_out: null,
      bank_evidence: null,
      allocated_to: null,
      // §6 and ARCHITECTURE.md §4 boundary 3: an ABSTAINED decision carries a
      // certificate. The member's abstention IS the component's, so it carries
      // the component's rather than a second one minted for the same break.
      certificate,
    };
  }

  // §15: E02 is "Captured and past the settlement window, never settled", keyed
  // `pay_…`. A refund line takes E11, which §15 extends at spec 1.4.2 to "a
  // recon_line with type 'refund' that is in period and carries no settlement,
  // because the settlement that would relieve it falls outside the period".
  return exceptionFor(
    obs.payload.type === "payment" ? "E02_MISSING_SETTLEMENT" : "E11_TIMING_BOUNDARY",
  );
}

/**
 * `§9` over the kinds `§17.1.1` gives **no posting whatever their state**.
 *
 * `ledger_entry`, `dispute` and `refund` are reconcilable under `§10.1`, so each
 * must reach a terminal state that is not `REFERENCE` — *"there is no drop
 * path"* — and none of them can post: `true_journal.source_entity_id` admits no
 * `mle_…` or `disp_…`, and *"no rule among `P1`-`P8` is constructible over a
 * `Refund` payload"*. The class each carries is therefore **reportable only**:
 * it reaches `exceptions_by_class` and the value-ranked queue, and moves no
 * rupee in either direction.
 *
 * - **`ledger_entry` → `E13_LEDGER_ONLY`**, *"Merchant booked an entry with no
 *   PG counterpart"*, which is the class `THREAT_MODEL.md §T5` names for it.
 * - **`refund`** follows its own `recon_line` — the `pg_refunds` row is a second
 *   **view** of an obligation `P3`/`P4` already posted, and `§17.1.1` refuses a
 *   second posting on it for the reason it refuses one on `settlement`. Where
 *   the view has no reconciled counterpart, `§15`'s `E10` is the referential
 *   case — *"Refund references a payment not in the dataset"* — and `E11` the
 *   timing one.
 * - **`dispute` → `E12_ADJUSTMENT_UNEXPLAINED`. A disclosed seam.** `§15` names
 *   **no** dispute class. `§9`'s fourth `EXCEPTION` trigger covers it — *"no
 *   observable evidence determines the observation's accounting treatment"* —
 *   and `DATA_MODEL.md §22.1` D30 models the documented dispute flow as *"a
 *   **debit adjustment line**"*, so the money is on an `adjustment` row and this
 *   row is the unexplained view of it. That makes `E12` the nearest class `§15`
 *   states rather than one this file invented, and `§17.1.1`'s
 *   `ledger_entry`/`dispute` row makes the posting `none` whatever the class, so
 *   the choice is visible in a report and absent from the books.
 */
function classifyUnpostable(
  obs: Observation,
  stateByEntityId: ReadonlyMap<string, DecisionState>,
  entityIds: ReadonlySet<string>,
): Classification {
  if (obs.kind === "ledger_entry") return exceptionFor("E13_LEDGER_ONLY");
  if (obs.kind === "refund") {
    if (stateByEntityId.get(obs.payload.id) === "RECONCILED") {
      return { state: "RECONCILED", exception_class: null, abstention_role: null, ...NOTHING };
    }
    return exceptionFor(
      entityIds.has(obs.payload.payment_id) ? "E11_TIMING_BOUNDARY" : "E10_REFUND_ORPHAN",
    );
  }
  return exceptionFor("E12_ADJUSTMENT_UNEXPLAINED");
}

/** `ASSAY` itself: the composition above with no option overridden. */
async function runAssay(input: AgentInput): Promise<AgentRun> {
  return (await runAssayComposed(input, { agentId: "ASSAY" })).run;
}

/**
 * The composition `A2-NOABSTAIN` and `A3-NOLLM` call, with their one differing
 * option (`EVALUATION_SPEC.md §3.2`'s *"differs from ASSAY in exactly one
 * respect"*). Not part of `packages/eval`'s public surface — an
 * `apps/cli`-internal composition helper, the same status `AssayComposeOptions`
 * has.
 */
export async function runAssayAblation(
  input: AgentInput,
  options: AssayComposeOptions,
): Promise<AgentRun> {
  return (await runAssayComposed(input, options)).run;
}

/**
 * The same composition, keeping the `§6` tally — M51's sweep entry point.
 *
 * `apps/cli`-internal, like {@link runAssayAblation} and
 * {@link AssayComposeOptions} themselves. Only `bench/sweep.ts` calls it, and it
 * exists so that a swept execution can report `count(AMBIGUOUS)` and
 * `count(IMMATERIALLY_AMBIGUOUS)` without `AgentRun` gaining a field.
 */
export function runAssayComposedFull(
  input: AgentInput,
  options: AssayComposeOptions,
): Promise<ComposedRun> {
  return runAssayComposed(input, options);
}

export const assayAgent: Agent = {
  id: "ASSAY",
  run: runAssay,
};
