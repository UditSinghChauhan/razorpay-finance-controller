import type { ProbeResultDetail } from "@assay/domain";
import { solve, type SolveInput, type SolveResult } from "@assay/engine";
import type { CertificateReason, DecisionId, EvidenceId, ProbeId, RunId } from "@assay/ledger";
import {
  R3OutputSchema,
  R3_SYSTEM_PROMPT_ID,
  adjudicate,
  type LlmCall,
  type LlmProvider,
  type R3AvailableProbe,
  type R3CertificateSummary,
  type R3Input,
  type R3Output,
} from "@assay/llm";
import {
  acceptResult,
  decide,
  initialState,
  offerR3Proposal,
  probeEventBody,
  type ObservationUniverse,
  type ProbeEventBody,
  type ProbeLoopState,
  type R3Proposal,
  type RejectionReason,
} from "@assay/probe";

import { dispatchProbe, isDispatchable, type ProbeDispatchOptions } from "./surface.js";

/**
 * The `RECONCILIATION_SPEC.md §6.6` chain, composed.
 *
 * ```
 *   engine S4          -> AMBIGUOUS with budget left
 *   packages/llm  R3   -> a proposal, as a VALUE
 *   packages/probe     -> P_max · pre-call I6 · the only ValidatedProbeCall
 *   apps/cli           -> dispatch, PROBE_DISPATCH-zoned
 *   packages/domain    -> ProbeResultDetail
 *   packages/probe     -> acceptResult, then the PROBE event body
 *   engine S4          -> re-solve from accumulated evidence
 *   packages/ledger    -> append (the caller's; this module returns drafts)
 * ```
 *
 * **`ASSAY` and `A3-NOLLM` run this function.** `ARCHITECTURE.md §10` requires
 * *"ablations [to be] configuration flags rather than forked codebases, which is
 * what makes them valid controls"*, and `EVALUATION_SPEC.md §3.2` requires an
 * ablation to differ *"in exactly one respect"*. The respect is
 * {@link ProbeRunInput.provider} and nothing else: the available-probe context,
 * the budget, the validation, the dispatch, the re-solve and the event body are
 * one code path taken by both arms.
 *
 * **Attribution, stated as a property of the code.** The context this module
 * hands `R3` is built by {@link buildAvailableProbes} **before** the provider is
 * consulted, from the same `SolveInput` and the same `ObservationUniverse`, so
 * neither arm can see an id the other cannot. Nothing downstream of the proposal
 * varies by provider.
 *
 * **This module appends nothing and mints no `ValidatedProbeCall`.** It returns
 * `PROBE` event drafts for the caller to append; `packages/probe` remains the
 * sole constructor of a call, and this file cannot build one.
 */

/** One `PROBE` event this run produced, ready for `packages/ledger`. */
export interface ProbeEventDraft {
  readonly body: ProbeEventBody;
  /** `THREAT_MODEL.md §T7`: *"every probe logged with its proposer"*. */
  readonly proposer: {
    readonly type: "llm";
    readonly llm_provider: string;
    readonly model_id: string;
    readonly llm_call_id: string | null;
  };
}

/** Why the loop stopped, when it stopped without a determined solve. */
export interface ProbeRunStop {
  readonly certificate_reason: CertificateReason;
  /** `null` when `R3` declined; the control that refused otherwise (`N1`). */
  readonly rejection: RejectionReason | null;
  readonly argument: string | null;
}

export interface ProbeRunResult {
  /** The last `S4` result — the one a decision is taken from. */
  readonly solve: SolveResult;
  readonly state: ProbeLoopState;
  readonly events: readonly ProbeEventDraft[];
  /** `DATA_MODEL.md §19` records every call, accepted or not. */
  readonly calls: readonly LlmCall[];
  /** `null` when `S4` reached a determined outcome and no abstention is forced. */
  readonly stop: ProbeRunStop | null;
}

/** The entity ids one component can offer as probe arguments. */
export interface AvailableProbeContext {
  readonly settlement_ids?: readonly string[];
  readonly payment_ids?: readonly string[];
  readonly order_ids?: readonly string[];
  readonly refund_ids?: readonly string[];
}

/**
 * `ARCHITECTURE.md §6`'s *"list of available probes"*, built once per iteration.
 *
 * Three filters, in this order, and each is somebody else's rule rather than
 * this module's:
 *
 * 1. **Pre-call `I6`** (`DECISION_BRIEF.md §L.1` rule 8) — an argument that names
 *    no observation is not eligible. `packages/probe` re-checks this
 *    *"independently of any allowlist check"* on whatever comes back; running it
 *    here as well is what `PREREGISTRATION.md §7`'s *"passing deterministic
 *    validity and pre-call `I6`"* means for the context.
 * 2. **A committed source** — a probe this build cannot dispatch is not offered,
 *    because proposing it could only burn `P_max` on a refusal. Today that is
 *    `fetch_settlement_recon` alone (spec 1.4.22, M36); see `surface.ts`.
 * 3. **Deduplicated and sorted** — so the context, and therefore `§19`'s
 *    `input_hash`, is a function of the component rather than of the caller's
 *    iteration order. Selection does **not** depend on it:
 *    `PREREGISTRATION.md §7` takes the lexicographically smallest, which is
 *    order-independent by construction.
 *
 * The order of {@link R3_CONTEXT_KINDS} is `RECONCILIATION_SPEC.md §6.2`'s
 * declaration order, **not** `§7`'s priority order. The policy ranks; this only
 * lists.
 */
export const R3_CONTEXT_KINDS = Object.freeze([
  "fetch_order",
  "fetch_payment",
  "fetch_refund",
  "fetch_settlement_recon",
] as const);

export interface BuildContextOptions {
  /**
   * Offer only probes with a committed source. Defaults to `true`.
   *
   * `false` is for tests that exercise `PREREGISTRATION.md §7`'s full ranking;
   * a real run must not propose what it cannot dispatch.
   */
  readonly dispatchableOnly?: boolean;
}

export function buildAvailableProbes(
  context: AvailableProbeContext,
  universe: ObservationUniverse,
  options: BuildContextOptions = {},
): readonly R3AvailableProbe[] {
  const dispatchableOnly = options.dispatchableOnly ?? true;
  const byKind: Record<(typeof R3_CONTEXT_KINDS)[number], readonly string[]> = {
    fetch_order: context.order_ids ?? [],
    fetch_payment: context.payment_ids ?? [],
    fetch_refund: context.refund_ids ?? [],
    fetch_settlement_recon: context.settlement_ids ?? [],
  };

  const out: R3AvailableProbe[] = [];
  for (const probe of R3_CONTEXT_KINDS) {
    if (dispatchableOnly && !isDispatchable(probe)) continue;
    const eligible = [...new Set(byKind[probe])]
      .filter((id) => universe.hasEntityId(id))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (eligible.length === 0) continue;
    out.push(Object.freeze({ probe, argument_ids: Object.freeze(eligible) }));
  }
  return Object.freeze(out);
}

export interface ProbeRunInput {
  readonly runId: RunId;
  /**
   * `DATA_MODEL.md §11`'s `ComponentId`, supplied by the caller.
   *
   * `S3`'s `DecomposedComponent` carries `target_ids`, `member_obs_ids`, `size`
   * and `total_value_paise` and **mints no id** — the same deliberate omission
   * that leaves `solve_status` to `S4`. Deriving one here would be inventing an
   * id grammar `DATA_MODEL.md §0` rule 3 does not state.
   */
  readonly compId: string;
  /**
   * The only thing that differs between `ASSAY` and `A3-NOLLM`
   * (`EVALUATION_SPEC.md §3.2`).
   */
  readonly provider: LlmProvider;
  /** `S4`'s input, minus the evidence this loop accumulates. */
  readonly solveInput: Omit<SolveInput, "recon_reports" | "probe_attempts">;
  readonly universe: ObservationUniverse;
  readonly context: AvailableProbeContext;
  readonly certificate: R3CertificateSummary;
  /** `§6.2`'s second argument, an opaque string. `M31` is not resolved here. */
  readonly reconDateScope: string;
  readonly dispatch: ProbeDispatchOptions;
  /** Deterministic ids for the `Evidence` rows a result produced, per attempt. */
  readonly evidenceIdsFor?: (attempt: number) => readonly EvidenceId[];
  readonly probeIdFor?: (attempt: number) => ProbeId;
  readonly decisionId?: DecisionId | null;
  readonly contextOptions?: BuildContextOptions;
}

function defaultProbeId(compId: string, attempt: number): ProbeId {
  return `prb_${compId}_${String(attempt)}` as ProbeId;
}

/**
 * Drive `§6.2`'s loop for one component to completion.
 *
 * Terminates on every path: `decide` stops at `P_max`, a decline stops, and a
 * rejected proposal stops (`N1`, spec 1.4.25) — there is no branch that re-issues
 * a proposal, so no input can make this iterate more than `P_max` times.
 */
export async function runProbeLoop(input: ProbeRunInput): Promise<ProbeRunResult> {
  const compId = input.compId;
  const probeIdFor = input.probeIdFor ?? ((n: number) => defaultProbeId(compId, n));
  const evidenceIdsFor = input.evidenceIdsFor ?? (() => []);

  let state = initialState(compId);
  const events: ProbeEventDraft[] = [];
  const calls: LlmCall[] = [];

  const resolve = (s: ProbeLoopState): SolveResult =>
    solve({
      ...input.solveInput,
      recon_reports: s.reports,
      probe_attempts: s.attempts,
    });

  let current = resolve(state);

  for (;;) {
    const next = decide(state, current);
    if (next.action === "ACCEPT") {
      return { solve: current, state, events, calls, stop: null };
    }
    if (next.action === "STOP") {
      return {
        solve: current,
        state,
        events,
        calls,
        stop: { certificate_reason: next.certificate_reason, rejection: null, argument: null },
      };
    }

    // §6.2: "The LLM (R3) proposes one probe from a closed enum." The context is
    // built here, before the provider is consulted, so both arms see it.
    const r3Input: R3Input = {
      role: "R3",
      comp_id: compId,
      certificate: input.certificate,
      available_probes: buildAvailableProbes(
        input.context,
        input.universe,
        input.contextOptions ?? {},
      ),
      attempts: state.attempts,
      attempts_remaining: next.attempts_remaining,
      probes_attempted: state.probes_attempted.map((p) => p as string),
      probe_results: state.reports.map((r) => ({
        probe: "fetch_settlement_recon",
        argument_id: r.settlement_id,
        yielded: r.constituent_entity_ids.length > 0,
        returned_entity_ids: r.constituent_entity_ids,
      })),
      recon_date_scope: input.reconDateScope,
    };

    const adjudicated = await adjudicate<R3Output>(input.provider, {
      runId: input.runId,
      request: {
        role: "R3",
        schema: R3OutputSchema,
        systemPromptId: R3_SYSTEM_PROMPT_ID,
        input: r3Input,
        idAllowlist: r3Input.available_probes.flatMap((p) => [...p.argument_ids]),
      },
      // No `grounding` is passed. §4 boundary 2 states a rule for R1 and R4
      // only; `hasGroundingRule("R3") === false`, and a role with no rule passes
      // that check by ABSENCE of a rule rather than by one that always returns
      // true. Supplying a permissive rule here would look identical and mean the
      // opposite.
    });
    calls.push(...adjudicated.calls);

    // A response no provider could produce a usable value for is a decline: §12
    // degrades visibly rather than inventing a probe.
    const proposal: R3Proposal = adjudicated.value ?? { probe: "NO_USEFUL_PROBE" };

    const offered = offerR3Proposal(state, proposal, input.universe, current);
    if (offered.kind === "STOP") {
      return {
        solve: current,
        state,
        events,
        calls,
        stop: {
          certificate_reason: offered.certificate_reason,
          rejection: offered.rejection,
          argument: offered.argument,
        },
      };
    }

    const attempt = state.attempts + 1;
    const detail: ProbeResultDetail = dispatchProbe(offered.call, input.dispatch);
    const evidenceIds = evidenceIdsFor(attempt);

    events.push(
      Object.freeze({
        body: probeEventBody({
          call: offered.call,
          comp_id: compId,
          attempts_before: state.attempts,
          evidence_ids: evidenceIds,
          decision_id: input.decisionId ?? null,
        }),
        proposer: Object.freeze({
          type: "llm" as const,
          llm_provider: adjudicated.acceptedFrom ?? input.provider.id,
          model_id: input.provider.modelId,
          llm_call_id: adjudicated.calls.at(-1)?.llm_call_id ?? null,
        }),
      }),
    );

    state = acceptResult(state, offered.call, detail, probeIdFor(attempt));
    current = resolve(state);
  }
}
