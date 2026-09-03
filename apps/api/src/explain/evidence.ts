import type { DecisionEvidence } from "@assay/cli";
import type { R4CandidateSummary, R4Input } from "@assay/llm";

import { certificateAllocation, type AllocationSolution } from "../allocation.js";
import type { StoredRun } from "../registry.js";
import { paiseSpellings, renderBps, renderPaise } from "./render.js";

/**
 * The `R4` envelope, assembled **on the server from the run registry**.
 *
 * `PROJECT_SPEC.md`'s product requirement and `THREAT_MODEL.md §T3` agree on
 * one thing here and it is the reason this module exists rather than a request
 * body: the browser does not submit the financial evidence. A client that could
 * hand the server a `materiality_paise` could hand it any figure, and the model
 * would then be grounded against a number nothing sealed. Everything below is
 * read off the {@link StoredRun} that `POST /runs` executed — the same
 * `DecisionEvidence`, the same `AmbiguityCertificate` and the same
 * `CloseReport` that `GET /runs/:id/decisions/:decision_id` serves — and the
 * request contributes nothing to it.
 *
 * **Nothing here is computed.** No constraint is evaluated, no candidate is
 * ranked, no threshold is re-read and no state is decided: the fields are
 * selected, rendered and flattened. Member amounts come from
 * {@link certificateAllocation}, which is `apps/api`'s existing read model over
 * the run's own observations, not a second pricing of the certificate.
 *
 * **The evidence set is the envelope, flattened.** `ARCHITECTURE.md §4`
 * boundary 2 checks `R4`'s prose against *"the attached evidence set"*, and the
 * cheapest way for the prompt and the check to disagree about what was attached
 * is to build them from two different places. {@link R4Input.evidence_set} is
 * derived from the very object that is sent, so a field added to the envelope
 * is grounded by construction and a field removed stops being quotable at the
 * same instant.
 */

/** Every string leaf of a value, in traversal order. */
function stringLeaves(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    if (value !== "") into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) stringLeaves(child, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) stringLeaves(child, into);
  }
}

/**
 * One candidate, priced from the read model.
 *
 * `total_allocation` is rendered only when **every** member has a `C6` term:
 * `DATA_MODEL.md §13` prices no member, so a partial sum beside a target would
 * be a tie-out the record does not state. The same rule the certificate page
 * applies to the total it displays.
 */
function candidate(
  solution: { readonly candidate_id: string; readonly member_obs_ids: readonly string[] },
  priced: AllocationSolution,
): R4CandidateSummary {
  const byId = new Map(priced.members.map((m) => [m.obs_id, m]));
  const terms = solution.member_obs_ids.map((id) => byId.get(id)?.allocation_paise ?? null);
  const complete = terms.length > 0 && terms.every((t) => t !== null);
  return {
    candidate_id: solution.candidate_id,
    member_obs_ids: [...solution.member_obs_ids],
    member_allocations: solution.member_obs_ids.map((id, i) => {
      const term = terms[i];
      return {
        obs_id: id,
        allocation:
          term === null || term === undefined
            ? "not stated by this run"
            : renderPaise(term),
      };
    }),
    total_allocation: complete
      ? renderPaise(terms.reduce((sum: number, t) => sum + (t ?? 0), 0))
      : null,
  };
}

/** The envelope, plus what boundary 2 needs to check the response against it. */
export interface ExplainEvidence {
  /** `§6.5`'s structured input. Sent to the provider; never accepted from one. */
  readonly input: R4Input;
  /**
   * `§4` boundary 2 check 2's allowlist — *"any entity ID in the response must
   * be a member of the allowlist passed in that call"*.
   *
   * Built from the ids this envelope actually carries, so an id the model
   * returns that ASSAY did not show it is a hallucination event by
   * construction.
   */
  readonly idAllowlist: readonly string[];
  /** `§4` boundary 2 check 3's *"attached evidence set"*, for the numerals. */
  readonly evidenceSet: readonly string[];
  /**
   * The terminal state ASSAY decided, held **beside** the envelope.
   *
   * The route answers with this field and never with anything the model
   * returned. `§L.1` rule 5's four states are the deterministic side's, and the
   * `R4` response schema has no state field for a model to disagree through.
   */
  readonly deterministicState: string;
}

/**
 * Build one decision's explanation evidence from the run that produced it.
 *
 * `decision` must be the entry `stored.decisionsById` holds — the route looks
 * it up there and this function is not reachable with any other object.
 */
export function explainEvidence(stored: StoredRun, decision: DecisionEvidence): ExplainEvidence {
  const certificate = decision.certificate;
  const allocation =
    certificate === null
      ? null
      : certificateAllocation(
          certificate,
          stored.result.evidence.decisions,
          stored.observationsById,
        );

  const input: R4Input = {
    role: "R4",
    decision_id: decision.decision_id as string,
    comp_id: decision.comp_id === null ? null : (decision.comp_id as string),
    state: decision.state,
    reason: certificate?.reason ?? null,
    subject: {
      obs_id: decision.obs_id as string,
      entity_id: decision.entity_id,
      kind: decision.kind,
      value: renderPaise(decision.value_paise),
    },
    candidate_a:
      certificate === null || allocation === null
        ? null
        : candidate(certificate.solution_a, allocation.solution_a),
    candidate_b:
      certificate === null || allocation === null
        ? null
        : candidate(certificate.solution_b, allocation.solution_b),
    shared_hard_constraints: certificate === null ? [] : [...certificate.shared_hard_constraints],
    evidence_score_gap:
      certificate === null ? null : renderBps(certificate.evidence_score_gap_bps),
    epsilon: certificate === null ? null : renderBps(certificate.epsilon_bps),
    materiality: certificate === null ? null : renderPaise(certificate.materiality_paise),
    tau: certificate === null ? null : renderPaise(certificate.tau_paise),
    probes_attempted: certificate === null ? [] : certificate.probes_attempted.map(String),
    unresolved_value: renderPaise(stored.result.evidence.close.gate.unresolved_value_paise),
    period_status: stored.result.evidence.close.period_status,
    // Filled below, from the object itself.
    evidence_set: [],
  };

  const leaves: string[] = [];
  stringLeaves(input, leaves);

  // Each rendered figure also in the two other spellings a reader might use.
  // See `render.ts`: `groundNumerals` compares digit runs, so `₹1,00,000.00`
  // and `10000000` do not ground each other and both are the same quantity.
  const figures = [
    decision.value_paise,
    stored.result.evidence.close.gate.unresolved_value_paise,
    ...(certificate === null ? [] : [certificate.materiality_paise, certificate.tau_paise]),
    ...(allocation?.target === null || allocation?.target === undefined
      ? []
      : [allocation.target.value_paise]),
  ].flatMap((p) => paiseSpellings(p));

  const evidenceSet = [...new Set([...leaves, ...figures])];

  return {
    input: { ...input, evidence_set: evidenceSet },
    idAllowlist: [
      decision.decision_id as string,
      decision.obs_id as string,
      decision.entity_id,
      ...(decision.comp_id === null ? [] : [decision.comp_id as string]),
      ...(certificate === null
        ? []
        : [
            certificate.comp_id as string,
            certificate.solution_a.candidate_id as string,
            certificate.solution_b.candidate_id as string,
            ...certificate.solution_a.member_obs_ids.map(String),
            ...certificate.solution_b.member_obs_ids.map(String),
            ...certificate.probes_attempted.map(String),
          ]),
      ...(allocation?.target === null || allocation?.target === undefined
        ? []
        : [allocation.target.obs_id, allocation.target.entity_id]),
    ],
    evidenceSet,
    deterministicState: decision.state,
  };
}
