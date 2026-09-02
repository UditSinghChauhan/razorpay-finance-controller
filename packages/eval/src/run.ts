/**
 * `AgentRun` — the scorer's input, and the only shape a metric reads.
 *
 * `ARCHITECTURE.md §10` gives the interface as *"Observations -> Decisions +
 * Ledger"*. `AgentInput` (`agent.ts`) is the left side; this module is the
 * right side, expressed as what `EVALUATION_SPEC.md §4` actually reads off a
 * run rather than as a copy of `DATA_MODEL.md §13`'s `Decision` record.
 *
 * **Why a projection rather than the persisted entities.** Three reasons, and
 * the third is the one that matters:
 *
 *   1. `§2` requires *"same input, same scorer"* across seven agents. `B0-IDONLY`
 *      mints no `AmbiguityCertificate` and `B2-LLM-DIRECT` runs no stage `S5`,
 *      so a scorer typed on ASSAY's full record would be typed on ASSAY.
 *   2. `DECISION_BRIEF.md §L.2` places persistence after this package. There is
 *      no `Decision` table to read; there is a value an agent returns.
 *   3. A metric that reads only what it needs cannot silently start reading
 *      ground truth. Every field below is agent-side. The truth side arrives
 *      separately, through `truth.ts`, and the two meet only inside a scorer.
 *
 * **Nothing here is computed by this package.** An agent produces it. The one
 * exception is documented where it occurs: {@link CloseOutcome} is produced by
 * the close gate, which `ARCHITECTURE.md §8` and `DECISION_BRIEF.md §L.2` place
 * in `packages/ledger` **Layer B** (`close-gate.ts`, `close.ts`) — modules that
 * do not exist yet. `packages/eval` **consumes** a close outcome and does not
 * compute one; re-deriving `G1`-`G5` here would make the gate and its own check
 * one implementation, which is the defect `ARCHITECTURE.md §7.2` exists to
 * prevent for the constraints and holds equally for the close gate.
 */

import type { ObservationId, ObservationKind } from "@assay/domain";
import type {
  AccountBalances,
  DecisionState,
  ExceptionClass,
  JournalLine,
  ObservationState,
} from "@assay/ledger";

import type { AgentId, RunConfig } from "./agent.js";

/**
 * One observation's terminal state, with the rupee figure it carries.
 *
 * `DECISION_BRIEF.md §L.1` rule 5: *"Every observation reaches exactly one
 * terminal state ... No fifth state, no drop path."* `value_paise` is
 * `DATA_MODEL.md §14.1`'s `value(observation)`, which the **agent** computes
 * from the observation's own payload — a reference kind has none under `§14.1`,
 * so `REFERENCE` rows carry `0` and enter no numerator or denominator
 * (`§10.1`).
 */
export interface ObservationOutcome {
  readonly obs_id: ObservationId;
  /** `Observation.kind`, carried so coverage can restrict to `§10.1`'s classes. */
  readonly kind: ObservationKind;
  readonly state: ObservationState;
  /** `DATA_MODEL.md §14.1`'s `value(observation)`, in paise. `0` for reference kinds. */
  readonly value_paise: number;
}

/**
 * One allocation edge — `EVALUATION_SPEC.md §4.2`'s unit.
 *
 * *"The unit is an **edge**: a `(entity_id, target_id)` allocation pair. Records
 * are the wrong unit because a settlement with 40 constituents is one record and
 * forty independent claims."*
 *
 * `entity_id` rather than `obs_id`: `GroundTruth.allocations` keys on
 * `pay_… | rfnd_… | adj_…`, and comparing agent output against it at the obs-id
 * level would score the join rather than the allocation.
 */
export interface AllocationEdge {
  readonly entity_id: string;
  readonly target_id: string;
}

/**
 * One committed decision, with the soft score its abstention gate read.
 *
 * `EVALUATION_SPEC.md §4.6` calibrates *"the score used by the abstention
 * gate"*, and notes that ASSAY's *primary* abstention path is evidential rather
 * than score-based: *"calibration is reported for the ε-gap component, which is
 * the one place a soft score influences the gate."* `score_bps` is therefore
 * `|score_a − score_b|` in integer basis points — `DATA_MODEL.md §11` forbids a
 * float here and `§13` carries the same quantity into the hashed body as
 * `evidence_score_gap_bps`.
 *
 * **`null` unless `RECONCILIATION_SPEC.md §6` step 3 reached `DISCRIMINATED`,
 * and from spec 1.4.35 that is a contract rather than a convention**
 * (`DATA_MODEL.md §22.2` **M57**). `M57` fixes metric 7's population as the
 * committed decisions *"carrying a non-null score — `§6` step 3's
 * `DISCRIMINATED` branch, the one accept in which the ε-gap decided the gate"*,
 * so this field's **nullity is that population test** and not merely correlated
 * with it. An agent must therefore carry the gap on `DISCRIMINATED` and `null`
 * on every other committed decision:
 *
 * ```
 *   UNIQUE                    null -- no second solution, so no gap exists and
 *                                     §5.5 bars inventing one
 *   IMMATERIALLY_AMBIGUOUS    null -- §6 tests materiality FIRST, so the gap was
 *                                     computed and never consulted
 *   DISCRIMINATED             Δs   -- the one branch the gap decided
 *   no solve at all           null -- B0-IDONLY joins on an identifier
 * ```
 *
 * `AMBIGUOUS` abstains and reaches `abstentions` rather than this list, and
 * `INTRACTABLE` commits nothing. `packages/eval/src/metrics/calibration-population.ts`
 * reads the field on exactly that understanding and invents nothing.
 */
export interface CommittedDecision {
  readonly target_id: string;
  readonly member_entity_ids: readonly string[];
  readonly score_bps: number | null;
}

/**
 * One abstention, at the unit gate `G3` and metric 12 read it.
 *
 * `DATA_MODEL.md §20` at benchmark v1.0.3: `unresolved_value_paise` is summed
 * over **open Suspense items** — *"one per **abstained target** and per open
 * exception whose class posts, keyed by `JournalLine.source_entity_id`"* — so
 * the key here is that field and not a `decision_id`, which
 * `RECONCILIATION_SPEC.md §10.1` rejects by name as *"per component, which
 * collapses several items into one"*.
 */
export interface AbstentionRecord {
  readonly source_entity_id: string;
  readonly value_paise: number;
  /**
   * `true` where the component carried quarantined free text.
   *
   * Metric 18 `attributable_to_untrusted_text_rate` (`§4.10`). The **agent**
   * reports it; `packages/eval` may not import `@assay/domain/untrusted-text`
   * and so could not derive it, which is the correct division: attribution is a
   * property of what the agent read.
   */
  readonly carried_untrusted_text: boolean;
}

/**
 * One open exception, at the unit `EVALUATION_SPEC.md §6` reports it.
 *
 * `posts_suspense` is `DATA_MODEL.md §17.1.1`'s split, and it is a field rather
 * than a lookup because `§6` requires the non-posting classes to be reported
 * *"separately and explicitly, because an exception outside the Suspense
 * identity is one the identity cannot vouch for"*. Seven of the fourteen
 * classes open no item; they still cost `C_exception` and still hold a terminal
 * state under `G1`.
 */
export interface OpenExceptionRecord {
  readonly source_entity_id: string;
  readonly exception_class: ExceptionClass;
  readonly value_paise: number;
  readonly posts_suspense: boolean;
  readonly carried_untrusted_text: boolean;
}

/**
 * One posted journal line, with the state of the decision that owns it.
 *
 * `EVALUATION_SPEC.md §4.4`: `proj_agent(acct)` is *"`Σ dr_paise − Σ cr_paise`
 * over the agent's journal lines whose owning decision is `RECONCILED`"*. The
 * state travels with the line because the alternative — a second map from
 * decision to state — is the shape `packages/ledger`'s `projectByDecisionState`
 * already takes, and duplicating that join here would let the two disagree.
 */
export interface PostedLine {
  readonly line: JournalLine;
  readonly decision_state: DecisionState;
}

/**
 * One component, as metric 25 reads it (`DATA_MODEL.md §11`).
 *
 * `PREREGISTRATION.md §8` records that metric 25 is *"Explicitly unaffected"* by
 * the benchmark v1.0.1 coverage amendment, because *"reference observations
 * remain available to stages S1–S4 as evidence (`DATA_MODEL.md §10.1`), so the
 * anchor stages and the `K_max` bound are untouched"*. The population is
 * therefore every component the agent built, with no terminal-state filter.
 */
export interface ComponentOutcome {
  /** `§11`: *"`|members|`; compared against `K_max`"*. */
  readonly size: number;
  readonly solve_status: "SOLVED" | "INTRACTABLE" | "EMPTY";
}

/**
 * The close gate's outcome — **consumed, never computed here.**
 *
 * `RECONCILIATION_SPEC.md §10.1` fixes gates `G1`-`G5`, `§10.4` fixes the
 * procedure, and `ARCHITECTURE.md §8` places both in `packages/ledger`
 * **Layer B** — *"the double-entry projection and the posting rules
 * (`journal.ts`, `projection.ts`, `close-gate.ts`, `close.ts`)"*.
 * `DECISION_BRIEF.md §L.2` schedules *"Ledger Layer B + close gate G1–G5"*
 * there too. **`close-gate.ts` and `close.ts` do not exist**, which
 * `packages/ledger/src/index.ts` records in terms: *"`close-gate.ts` and
 * `close.ts` follow, and are deliberately absent rather than stubbed."*
 *
 * This interface is the boundary that absence leaves, stated as a type. It is
 * not a stand-in for the gate: `packages/eval` computes no gate result and
 * asserts none. Metrics 11-14 read what a producer supplies, and
 * `metrics/close-loop.ts` states which of them are checks on the producer's
 * own claim rather than independent recomputations.
 *
 * The field names are `DATA_MODEL.md §20`'s, so a producer's `CloseReport`
 * projects onto this without a rename.
 */
export interface CloseGateOutcome {
  readonly g1_all_terminal: boolean;
  readonly g2_trial_balance: boolean;
  readonly g3_suspense_identity: boolean;
  readonly g4_hash_chain: boolean;
  readonly g5_no_failed_invariant_posted: boolean;
  /** `§20`: *"named, for the analyst-facing message"*. */
  readonly failed_gates: readonly string[];
}

/** `DATA_MODEL.md §20`'s three outcomes. */
export type PeriodStatus = "CLOSED" | "OPEN" | "BLOCKED";

/**
 * What a close produced, as metrics 11-14 read it.
 *
 * `null` on {@link AgentRun.close} means no close was attempted — which
 * `EVALUATION_SPEC.md §2` forbids for a scored run (*"Every run attempts a
 * period close"*), so a scorer treats it as a missing input rather than as a
 * `BLOCKED` outcome. The distinction matters: `BLOCKED` is a **defect** that
 * `§4.9` requires to be zero across every run, and recording an absent producer
 * as one would manufacture that defect.
 */
export interface CloseOutcome {
  readonly period_status: PeriodStatus;
  /** `§4.9`, `EXPLORATORY`: the same run under the benchmark v1.0.0 policy. */
  readonly period_status_legacy_policy: PeriodStatus;
  readonly gate: CloseGateOutcome;
  /** `§4.9`: `Σ recon_line.amount` — the close and coverage denominator. */
  readonly batch_value_paise: number;
  /** `§4.9` metric 12, summed over open Suspense items. */
  readonly unresolved_value_paise: number;
  readonly value_abstained_paise: number;
  readonly value_exceptions_paise: number;
  /** `§4.9`, `EXPLORATORY`: the benchmark v1.0.2 multi-view universe. */
  readonly unresolved_value_paise_multiview: number;
  /** `Σ |item_net_paise|` over open Suspense items — `G3`'s left side, from the books. */
  readonly suspense_gross_item_paise: number;
  readonly trial_balance_ok: boolean;
  readonly account_balances: AccountBalances;
  /** `§4.12`: two runs over identical inputs must agree byte for byte (`I9`). */
  readonly ledger_root_hash: string;
}

/**
 * One agent's product over one `(split, seed, llm_mode)`.
 *
 * Every field is agent-side. There is no ground-truth field and no oracle-label
 * field, which is `EVALUATION_SPEC.md §2`'s first rule expressed as a type.
 */
export interface AgentRun {
  readonly agent_id: AgentId;
  readonly config: RunConfig;
  readonly outcomes: readonly ObservationOutcome[];
  /**
   * `RECONCILIATION_SPEC.md §5`'s components, as metric 25 reads them.
   *
   * `DATA_MODEL.md §11` gives `Component` a `size` — *"`|members|`; compared
   * against `K_max`"* — and a three-valued `solve_status`. Metric 25 is
   * `component_size_distribution` and `intractable_rate` over exactly those two
   * fields, so only those two are projected here.
   */
  readonly components: readonly ComponentOutcome[];
  readonly allocations: readonly AllocationEdge[];
  readonly decisions: readonly CommittedDecision[];
  readonly abstentions: readonly AbstentionRecord[];
  readonly open_exceptions: readonly OpenExceptionRecord[];
  readonly journal: readonly PostedLine[];
  /**
   * `RECONCILIATION_SPEC.md §6.2`'s spend, and what it bought.
   *
   * `EVALUATION_SPEC.md §4.13`: *"Every report carries, per agent and per
   * split, the number of probes spent and the number of abstentions they
   * resolved ... so a reader can attribute a negative gap or a reduced
   * `abstention_recall` to the probe channel rather than infer it."* Both are
   * `0` for an agent with no probe channel, which is a fact about that agent
   * rather than a missing measurement.
   */
  readonly probes_spent: number;
  readonly abstentions_resolved_by_probe: number;
  /** `null` when no close was attempted. See {@link CloseOutcome}. */
  readonly close: CloseOutcome | null;
}
