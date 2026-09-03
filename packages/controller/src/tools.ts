import { z } from "zod";

/**
 * The controller's bounded tool surface — **four tools, all read-only**.
 *
 * ## Two rules every schema below obeys
 *
 * ```
 *   R-1  No tool INPUT carries a monetary amount. Amounts are READ from
 *        sealed artifacts, never supplied — the same rule POST …/explain
 *        already enforces by refusing any body field that is not a
 *        presentation preference (THREAT_MODEL.md §T3).
 *   R-2  No tool INPUT is model-authored. Every identifier originates in an
 *        observation the controller itself made, so no model can steer a call.
 * ```
 *
 * ## What is deliberately absent, and why
 *
 * **`apply_resolution` — the write.** `DATA_MODEL.md §17.1`'s `P7` and `§16`'s
 * `RESOLVE` event kind are both frozen, and `journal.ts` already implements the
 * posting; what is missing is a caller. This phase does not become one. The
 * terminal state here is human review, so no tool in this registry can append
 * an event, move a balance, or reach `packages/ledger`'s write path.
 *
 * **`propose_probe` — deliberately not re-entered.** `RECONCILIATION_SPEC.md
 * §6.2`'s probe loop is a real perceive/propose/act cycle and it **already ran
 * inside the run**, bounded at `P_max = 3`, with `packages/probe` as *"the ONLY
 * constructor of a probe call"*. Calling it again from here would re-enter the
 * solver — a probe result feeds `SE5` and forces an `S4` re-solve — which is
 * reconciliation semantics and out of scope. Instead the controller **reads
 * what the loop already did**, from the certificate's own
 * `probes_attempted` and `reason` fields. That is strictly observational: it
 * learns that probing was attempted and what it concluded, without being able
 * to attempt anything.
 *
 * **`explain_decision` — no LLM call in this phase.** The `R4` surface exists,
 * is live, and is untouched. The controller makes **zero** model calls: its
 * policy is deterministic code (`DECISION_BRIEF.md §L.4` forbids an LLM call
 * outside `R1`–`R4`, and a planner would be a fifth role), and the explanatory
 * brief on an escalation packet is a later phase. A controller built without it
 * first is a controller that demonstrably does not need it.
 *
 * ## Why the output schemas are narrow
 *
 * Each is a **projection** of the API body it comes from, carrying only what
 * the policy reads and what an escalation has to report. That is a boundary,
 * not an economy: a controller handed whole financial bodies could grow a
 * dependency on a figure it has no business reading, and `strictObject` makes
 * the reverse — a field silently appearing — a parse failure rather than a
 * surprise.
 */

/** `DATA_MODEL.md §20`'s three period outcomes. */
export const PeriodStatusSchema = z.enum(["CLOSED", "OPEN", "BLOCKED"]);

/** `DATA_MODEL.md §13`'s four certificate reasons, as the ledger declares them. */
export const CertificateReasonSchema = z.enum([
  "EVIDENCE_TIE",
  "SEARCH_BOUND_EXCEEDED",
  "PROBE_BUDGET_EXHAUSTED",
  "NO_USEFUL_PROBE_AVAILABLE",
]);

/** `DECISION_BRIEF.md §L.1` rule 5's four terminal states. */
export const DecisionStateSchema = z.enum([
  "RECONCILED",
  "EXCEPTION",
  "ABSTAINED",
  "OPEN",
]);

// ---------------------------------------------------------------------------
// 1. close_report — the gate, and the two figures the plan is computed from
// ---------------------------------------------------------------------------

export const CloseReportInputSchema = z.strictObject({
  run_id: z.string().min(1),
});

/**
 * `RECONCILIATION_SPEC.md §10.1`'s five gates plus `§10.2`'s outcome.
 *
 * All five flags travel always, and `failed_gates` beside them, because
 * *"why won't it close"* is the question the surface exists to answer — a
 * boolean would make the controller's `HALT` decision unexplainable.
 */
export const CloseReportOutputSchema = z.strictObject({
  run_id: z.string().min(1),
  period_status: PeriodStatusSchema,
  gate: z.strictObject({
    g1_all_terminal: z.boolean(),
    g2_trial_balance: z.boolean(),
    g3_suspense_identity: z.boolean(),
    g4_hash_chain: z.boolean(),
    g5_no_failed_invariant_posted: z.boolean(),
    failed_gates: z.array(z.string()).readonly(),
  }),
  /** `§20`'s denominator. `null` exactly on `BLOCKED`, where no report is emitted. */
  batch_value_paise: z.number().int().nullable(),
  /** `G3`'s quantified residual — the figure the period is `OPEN` on. */
  unresolved_value_paise: z.number().int(),
  value_abstained_paise: z.number().int(),
  value_exceptions_paise: z.number().int(),
  /** `packages/ledger`'s own bound. Read, never recomputed here. */
  close_threshold_paise: z.number().int(),
  ledger_root_hash: z.string().min(1),
  genesis_hash: z.string().min(1),
  trial_balance_ok: z.boolean(),
});

// ---------------------------------------------------------------------------
// 2. exception_queue — both populations, value-ranked
// ---------------------------------------------------------------------------

export const ExceptionQueueInputSchema = z.strictObject({
  run_id: z.string().min(1),
});

/**
 * One queue row.
 *
 * **`suspense_key` is the field the plan turns on.** It is
 * `JournalLine.source_entity_id` where a Suspense item was opened and `null`
 * otherwise, and `DATA_MODEL.md §17.1.1` is why that matters: a `ledger_entry`
 * observation posts **none** of `P1`–`P8` in any state, so an exception on one
 * opens no Suspense item and contributes nothing to
 * `unresolved_value_paise`. A row with a large `value_paise` and a null
 * `suspense_key` therefore cannot move the residual by a single paisa, and a
 * planner ranking on value alone would spend a whole pass on it. See
 * `policy.ts`.
 */
export const QueueItemSchema = z.strictObject({
  decision_id: z.string().min(1),
  obs_id: z.string().min(1),
  entity_id: z.string().min(1),
  kind: z.string().min(1),
  state: DecisionStateSchema,
  /** `DATA_MODEL.md §14.1`'s `value(observation)`, in paise. A passthrough. */
  value_paise: z.number().int(),
  exception_class: z.string().nullable(),
  suspense_key: z.string().nullable(),
  comp_id: z.string().nullable(),
  evt_id: z.string().min(1),
  has_certificate: z.boolean(),
});

export const ExceptionQueueOutputSchema = z.strictObject({
  run_id: z.string().min(1),
  total: z.number().int().nonnegative(),
  value_abstained_paise: z.number().int(),
  value_exceptions_paise: z.number().int(),
  items: z.array(QueueItemSchema).readonly(),
});

// ---------------------------------------------------------------------------
// 3. decision_evidence — the drill-down, and the certificate
// ---------------------------------------------------------------------------

export const DecisionEvidenceInputSchema = z.strictObject({
  run_id: z.string().min(1),
  decision_id: z.string().min(1),
});

/**
 * `DATA_MODEL.md §13`'s certificate, projected.
 *
 * The two solutions' member lists are **counted, not carried**. The controller
 * has no business comparing them: choosing between them is the decision ASSAY
 * declined to make (`DECISION_BRIEF.md §L.5` sentence 2), so a controller
 * holding both allocations in memory would be holding the material for a
 * choice it may not make. The counts are enough to report *that* there are two.
 */
export const CertificateSchema = z.strictObject({
  comp_id: z.string().min(1),
  reason: CertificateReasonSchema,
  /** `Δs` in basis points. `0` is an exact tie. */
  evidence_score_gap_bps: z.number().int(),
  /** `§6`'s `ε`. The gap is compared against this by the ENGINE, not here. */
  epsilon_bps: z.number().int(),
  materiality_paise: z.number().int(),
  /** `τ = max(₹100, 10 bps)`, frozen at seal time (`§L.1` rule 12). */
  tau_paise: z.number().int(),
  /** `§6.2`: *"what we tried before giving up"*. Read, never re-attempted. */
  probes_attempted: z.array(z.string()).readonly(),
  shared_hard_constraint_count: z.number().int().nonnegative(),
  solution_a_member_count: z.number().int().nonnegative(),
  solution_b_member_count: z.number().int().nonnegative(),
});

export const DecisionEvidenceOutputSchema = z.strictObject({
  run_id: z.string().min(1),
  decision_id: z.string().min(1),
  state: DecisionStateSchema,
  kind: z.string().min(1),
  entity_id: z.string().min(1),
  value_paise: z.number().int(),
  exception_class: z.string().nullable(),
  suspense_key: z.string().nullable(),
  comp_id: z.string().nullable(),
  /** Non-null exactly on an `ABSTAINED` decision (`§13`). */
  certificate: CertificateSchema.nullable(),
  /** The `§16` event this decision was appended as. */
  event: z.strictObject({
    evt_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    prev_hash: z.string().min(1),
    hash: z.string().min(1),
  }),
});

// ---------------------------------------------------------------------------
// 4. ledger_verify — an INDEPENDENT recompute, not the cached gate flag
// ---------------------------------------------------------------------------

export const LedgerVerifyInputSchema = z.strictObject({
  run_id: z.string().min(1),
});

/**
 * `ARCHITECTURE.md §9`: *"Recomputes the hash chain from genesis, re-projects
 * balances, re-checks the Suspense identity. Returns pass/fail per check."*
 *
 * **Why the controller uses this and not `close_report.gate.g4_hash_chain`.**
 * That flag is a value the run recorded when it ran. This is a recomputation
 * from genesis performed now, which is the property `THREAT_MODEL.md §T10`
 * rests on — *"an edited balance without a corresponding event simply
 * disappears on the next projection"*. `P0` is the rule that stops the loop
 * before it acts, so it should read the stronger of the two.
 */
export const LedgerVerifyOutputSchema = z.strictObject({
  run_id: z.string().min(1),
  chain_ok: z.boolean(),
  recomputed_root_hash: z.string().min(1),
  stored_root_hash: z.string().min(1),
  root_matches: z.boolean(),
  trial_balance_ok: z.boolean(),
  total_dr_paise: z.number().int(),
  total_cr_paise: z.number().int(),
  event_count: z.number().int().nonnegative(),
  checks: z
    .array(z.strictObject({ name: z.string().min(1), passed: z.boolean() }))
    .readonly(),
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** The four tool names. A frozen, closed set: the policy selects a key from it. */
export const TOOL_NAMES = Object.freeze([
  "close_report",
  "exception_queue",
  "decision_evidence",
  "ledger_verify",
] as const);

export type ToolName = (typeof TOOL_NAMES)[number];

export type CloseReportInput = z.infer<typeof CloseReportInputSchema>;
export type CloseReportOutput = z.infer<typeof CloseReportOutputSchema>;
export type ExceptionQueueInput = z.infer<typeof ExceptionQueueInputSchema>;
export type ExceptionQueueOutput = z.infer<typeof ExceptionQueueOutputSchema>;
export type QueueItem = z.infer<typeof QueueItemSchema>;
export type DecisionEvidenceInput = z.infer<typeof DecisionEvidenceInputSchema>;
export type DecisionEvidenceOutput = z.infer<typeof DecisionEvidenceOutputSchema>;
export type Certificate = z.infer<typeof CertificateSchema>;
export type LedgerVerifyInput = z.infer<typeof LedgerVerifyInputSchema>;
export type LedgerVerifyOutput = z.infer<typeof LedgerVerifyOutputSchema>;

/** Input and output schema for one tool, paired so a driver cannot mismatch them. */
export const TOOL_SCHEMAS = Object.freeze({
  close_report: Object.freeze({
    input: CloseReportInputSchema,
    output: CloseReportOutputSchema,
  }),
  exception_queue: Object.freeze({
    input: ExceptionQueueInputSchema,
    output: ExceptionQueueOutputSchema,
  }),
  decision_evidence: Object.freeze({
    input: DecisionEvidenceInputSchema,
    output: DecisionEvidenceOutputSchema,
  }),
  ledger_verify: Object.freeze({
    input: LedgerVerifyInputSchema,
    output: LedgerVerifyOutputSchema,
  }),
});

/** A call the policy asked for, discriminated so the driver can dispatch it. */
export type ToolCall =
  | { readonly tool: "close_report"; readonly input: CloseReportInput }
  | { readonly tool: "exception_queue"; readonly input: ExceptionQueueInput }
  | { readonly tool: "decision_evidence"; readonly input: DecisionEvidenceInput }
  | { readonly tool: "ledger_verify"; readonly input: LedgerVerifyInput };

/** What a tool answered. `ok: false` is an observation, never an exception. */
export type ToolResult =
  | { readonly tool: "close_report"; readonly ok: true; readonly value: CloseReportOutput }
  | { readonly tool: "exception_queue"; readonly ok: true; readonly value: ExceptionQueueOutput }
  | { readonly tool: "decision_evidence"; readonly ok: true; readonly value: DecisionEvidenceOutput }
  | { readonly tool: "ledger_verify"; readonly ok: true; readonly value: LedgerVerifyOutput }
  | { readonly tool: ToolName; readonly ok: false; readonly refusal: string };

/**
 * The capabilities a driver supplies.
 *
 * Injected rather than imported so this package performs **no I/O of any
 * kind**: it consumes tool results as values. That is what makes every
 * transition in `state.ts` and every rule in `policy.ts` testable against the
 * real `demo-500` run with no server, no socket and no model —
 * `DECISION_BRIEF.md §L.1` rule 10 and `§L.4`'s bar on a test that depends on
 * a live model.
 */
export interface ToolRegistry {
  readonly close_report: (input: CloseReportInput) => Promise<CloseReportOutput>;
  readonly exception_queue: (input: ExceptionQueueInput) => Promise<ExceptionQueueOutput>;
  readonly decision_evidence: (input: DecisionEvidenceInput) => Promise<DecisionEvidenceOutput>;
  readonly ledger_verify: (input: LedgerVerifyInput) => Promise<LedgerVerifyOutput>;
}
