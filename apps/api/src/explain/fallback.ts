import type { R4Input } from "@assay/llm";

import type { ExplainEvidence } from "./evidence.js";

/**
 * The deterministic evidence summary — what the panel shows when there is no
 * model.
 *
 * `ARCHITECTURE.md §12`'s standing requirement is that *"a finance close must
 * not be blocked on a third-party API"* and that degradation is *"visible in the
 * report ... not hidden"*. Both sentences are load-bearing here and they pull in
 * opposite directions if the fallback is written carelessly: an empty panel
 * blocks the analyst, and a fallback that reads like prose someone wrote hides
 * the degradation. So this module answers with a summary that is **useful and
 * unmistakably not an explanation**.
 *
 * **It is not carried in `explanation`.** {@link ExplainOutcome.explanation} is
 * documented as *"the model's, or `null`"* and `apps/web` renders it as model
 * prose under an "AI explanation" heading. Putting a template there would make
 * the one field the UI trusts as the model's answer sometimes not be, and every
 * reader of that field — this suite, the page, a later route — would have to
 * learn a flag to tell the two apart. It rides in its own field instead, so
 * *"the fallback is never presented as an AI-generated explanation"* is a
 * property of the response **shape** rather than of the wording someone chose.
 *
 * **It invents nothing.** Every figure below is a string copied out of the same
 * `R4Input` envelope the model would have been sent, which is itself read off
 * the sealed `DecisionEvidence`. No amount is computed, no threshold is
 * re-derived, no state is decided — and `tests/gemini.test.ts` asserts the
 * result passes `groundR4` against the run's own evidence set, which is the
 * same check a model's answer has to pass.
 */

/** The label the product requires, verbatim. Not a template — the constant. */
export const FALLBACK_LABEL = "Evidence summary — AI unavailable";

/**
 * A summary produced by ASSAY itself.
 *
 * Deliberately **not** shaped like {@link R4Output}: `why` is `points`, and
 * `label`/`generated_by` are present and constant. A consumer that reached for
 * this object expecting the model's four fields gets a type error rather than a
 * template rendered under an AI heading.
 */
export interface EvidenceSummary {
  readonly label: typeof FALLBACK_LABEL;
  /** Never `"llm"`, never a provider id. This text has no model in its history. */
  readonly generated_by: "assay-deterministic";
  readonly summary: string;
  readonly points: readonly string[];
  readonly risk: string;
  readonly next_step: string;
}

/** `§L.1` rule 5's terminal states, as a sentence an analyst reads. */
function stateSentence(state: string): string {
  switch (state) {
    case "ABSTAINED":
      return "ASSAY abstained on this observation and attached an ambiguity certificate.";
    case "RECONCILED":
      return "ASSAY reconciled this observation.";
    case "EXCEPTION":
      return "ASSAY raised an exception on this observation.";
    default:
      return `ASSAY recorded this observation as ${state}.`;
  }
}

/** The evidence points, in the order a reader meets them. */
function points(input: R4Input): readonly string[] {
  const found: string[] = [
    `Subject: observation ${input.subject.obs_id} (${input.subject.kind}) on entity ` +
      `${input.subject.entity_id}, value ${input.subject.value}.`,
  ];

  if (input.reason !== null) {
    found.push(`Certificate reason recorded by the engine: ${input.reason}.`);
  }
  if (input.candidate_a !== null && input.candidate_b !== null) {
    found.push(
      `Two candidate allocations were compared: ${input.candidate_a.candidate_id} ` +
        `(${String(input.candidate_a.member_obs_ids.length)} members) and ` +
        `${input.candidate_b.candidate_id} ` +
        `(${String(input.candidate_b.member_obs_ids.length)} members).`,
    );
  }
  if (input.shared_hard_constraints.length > 0) {
    found.push(
      `Both candidates satisfy the same hard constraints: ` +
        `${input.shared_hard_constraints.join(", ")}.`,
    );
  }
  if (input.evidence_score_gap !== null && input.epsilon !== null) {
    found.push(
      `The evidence score gap is ${input.evidence_score_gap} against a pre-registered ` +
        `margin of ${input.epsilon}.`,
    );
  }
  if (input.materiality !== null && input.tau !== null) {
    found.push(
      `The materiality between the two allocations is ${input.materiality}, against a ` +
        `threshold of ${input.tau}.`,
    );
  }
  found.push(
    input.probes_attempted.length === 0
      ? "No probe was attempted on this component."
      : `Probes attempted before the engine stopped: ${input.probes_attempted.join(", ")}.`,
  );
  return found;
}

/**
 * Build the deterministic summary for one decision's evidence.
 *
 * Takes the {@link ExplainEvidence} the provider would have been sent, so the
 * summary and the prompt cannot disagree about what the run said — the same
 * reason `evidence.ts` derives the evidence set from the envelope itself.
 */
export function evidenceSummary(evidence: ExplainEvidence): EvidenceSummary {
  const { input } = evidence;
  return {
    label: FALLBACK_LABEL,
    generated_by: "assay-deterministic",
    summary:
      `${stateSentence(evidence.deterministicState)} This is ASSAY's own record of the ` +
      `evidence, written by the engine because no AI explanation was available. It adds ` +
      `nothing to the decision and interprets nothing.`,
    points: points(input),
    risk:
      `Unresolved value across this close is ${input.unresolved_value}, and the period ` +
      `status is ${input.period_status}.`,
    next_step:
      "The certificate and the ledger on this page are complete and unaffected. Read them " +
      "directly, or retry the AI explanation once the provider is configured and reachable.",
  };
}
