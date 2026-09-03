import type { DecisionEvidence } from "@assay/cli";
import type { RunId } from "@assay/ledger";
import { adjudicate, type GroundingCheck, type LlmCall, type LlmProvider } from "@assay/llm";

import type { StoredRun } from "../registry.js";
import { explainEvidence } from "./evidence.js";
import { evidenceSummary, type EvidenceSummary } from "./fallback.js";
import type { ExplainFailure } from "./failure.js";
import {
  R4OutputSchema,
  R4_ENTITY_PATH,
  R4_SYSTEM_PROMPT_ID,
  groundR4,
  type R4Output,
} from "./r4.js";

/**
 * One explanation attempt, from sealed evidence to a checked answer.
 *
 * ```
 *   DecisionEvidence (sealed)  ->  R4 envelope  ->  LlmProvider  ->  boundary 2
 *          |                                                            |
 *          +--------------------  the answer  --------------------------+
 * ```
 *
 * **The deterministic decision is on the left of that diagram and never on the
 * right.** Everything the route publishes about the decision — its state, its
 * value, its certificate — is read from {@link StoredRun} before the model is
 * called and is republished unchanged afterwards, in the success branch and in
 * every failure branch alike. There is no code path in this module in which a
 * provider response reaches a decision field.
 *
 * **The three checks are `adjudicate`'s, not this module's.** `§L.4` prohibits
 * *"adding an LLM call outside roles R1-R4, or outside the `LlmProvider`
 * interface"*, and `ARCHITECTURE.md §4` fixes the order — schema, allowlist,
 * grounding — at one choke point. Re-implementing that sequence here to add a
 * product feature would be the exact drift both sentences exist to prevent, so
 * this module supplies a role request and a grounding rule and calls the choke
 * point.
 *
 * **Nothing is persisted.** No prompt text, no credential, no response body
 * reaches disk or the registry: `DATA_MODEL.md §19` records prompt **hashes**
 * (`THREAT_MODEL.md §T11`: *"never prompt text containing configuration"*), and
 * those hashes are returned to the caller and then dropped with the request.
 */

export type ExplainStatus = "ok" | "rejected" | "unavailable";

/** Which of `§4` boundary 2's three checks ran, and how it went. */
export type CheckOutcome = "pass" | "fail" | "not_reached";

export interface ExplainGrounding {
  /** The evidence came from the run registry, not the request body. Always true. */
  readonly decision_evidence_verified: true;
  /** Whether a `DATA_MODEL.md §13` certificate was part of the evidence. */
  readonly certificate_used: boolean;
  /** `ARCHITECTURE.md §6`'s *"roles the model is explicitly forbidden"*. */
  readonly decision_authority: "none";
  /** The state ASSAY decided. Read from the sealed decision in every branch. */
  readonly deterministic_state: string;
  readonly checks: {
    readonly schema: CheckOutcome;
    readonly allowlist: CheckOutcome;
    readonly numerals: CheckOutcome;
  };
  /** Entity ids the response named that the call did not allow. */
  readonly rejected_entity_ids: readonly string[];
  /** Numerals the response wrote that the evidence set does not contain. */
  readonly rejected_numerals: readonly string[];
  /** `§19`'s hashes. Hashes, never text (`§T11`). */
  readonly system_prompt_id: string;
  readonly system_prompt_hash: string;
  readonly input_hash: string;
  readonly cache_key: string;
  /** How many strings the prose was grounded against. */
  readonly evidence_item_count: number;
}

export interface ExplainProviderMeta {
  readonly provider: string;
  readonly model_id: string;
  readonly requires_network: boolean;
  readonly attempts: number;
  readonly latency_ms: number;
}

export interface ExplainOutcome {
  readonly status: ExplainStatus;
  /** `null` on every status but `ok`. Always the model's; never a template. */
  readonly explanation: R4Output | null;
  /**
   * ASSAY's own summary of the same evidence, when there was no model answer.
   *
   * Present on `unavailable` — the provider was not configured, or was
   * configured and could not be reached — and `null` otherwise. A **separate
   * field** from {@link explanation} on purpose: see `fallback.ts`. It is never
   * populated on `ok`, where the model answered, and never on `rejected`, where
   * the model answered and `§4` boundary 2 discarded it — that branch's finding
   * is that the control worked, and burying it under a summary would replace
   * the most informative thing this surface ever says with a template.
   */
  readonly fallback: EvidenceSummary | null;
  readonly provider: ExplainProviderMeta;
  readonly grounding: ExplainGrounding;
  readonly failure: ExplainFailure | null;
}

/** What `groundR4` rejected, split by hazard. */
interface StrayValues {
  readonly entityIds: readonly string[];
  readonly numerals: readonly string[];
}

function strayValues(check: GroundingCheck | null): StrayValues {
  if (check === null || check.ok) return { entityIds: [], numerals: [] };
  // Deduplicated: `groundNumerals` reports one violation per OCCURRENCE, which
  // is right for a count and wrong for a list a person reads — an invented
  // "77,77,777" arrives as three digit runs and would be shown as "77, 77, 777".
  const distinct = (isEntity: boolean): readonly string[] => [
    ...new Set(
      check.violations.filter((v) => (v.path === R4_ENTITY_PATH) === isEntity).map((v) => v.value),
    ),
  ];
  return { entityIds: distinct(true), numerals: distinct(false) };
}

/** The check outcomes one `§19` call record implies. */
function checksOf(call: LlmCall | undefined, stray: StrayValues): ExplainGrounding["checks"] {
  if (call === undefined) {
    return { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" };
  }
  switch (call.outcome) {
    case "accepted":
      return { schema: "pass", allowlist: "pass", numerals: "pass" };
    case "rejected_schema":
      return { schema: "fail", allowlist: "not_reached", numerals: "not_reached" };
    case "rejected_allowlist":
      return { schema: "pass", allowlist: "fail", numerals: "not_reached" };
    case "rejected_grounding":
      // Both hazards are checked in one pass, so both have a verdict here: an
      // id the call never showed the model fails the allowlist question, a
      // figure the evidence does not contain fails the numeral one, and a
      // response can do either without doing the other.
      return {
        schema: "pass",
        allowlist: stray.entityIds.length > 0 ? "fail" : "pass",
        numerals: stray.numerals.length > 0 ? "fail" : "pass",
      };
    default:
      return { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" };
  }
}

/** The failure a verification reject reports, or `null` where none applies. */
function verificationFailure(
  call: LlmCall | undefined,
  stray: StrayValues,
): ExplainFailure | null {
  switch (call?.outcome) {
    case "rejected_schema":
      return {
        code: "MALFORMED_RESPONSE",
        message:
          "The model's response did not match the required shape, so ASSAY discarded it. " +
          "Nothing was shown and nothing was changed.",
      };
    case "rejected_allowlist":
      return {
        code: "UNKNOWN_ENTITY_ID",
        message:
          "The model referred to an identifier that is not in this decision's evidence, " +
          "so ASSAY discarded the whole response.",
      };
    case "rejected_grounding":
      // An invented identifier is the more specific finding, so it is the one
      // reported when a response manages both.
      return stray.entityIds.length > 0
        ? {
            code: "UNKNOWN_ENTITY_ID",
            message:
              "The model named an identifier that is not in this decision's evidence, so " +
              "ASSAY discarded the whole response. The certificate below is unchanged.",
          }
        : {
            code: "UNGROUNDED_NUMERAL",
            message:
              "The model wrote a figure that does not appear in the verified evidence, so " +
              "ASSAY discarded the whole response. The certificate below is unchanged.",
          };
    default:
      return null;
  }
}

export interface ExplainDecisionArgs {
  readonly stored: StoredRun;
  readonly decision: DecisionEvidence;
  readonly provider: LlmProvider;
  /**
   * The transport-level failures the provider recorded, read after the call.
   *
   * `LlmCallMeta.failure` is `§6.5`'s closed four-member union and cannot
   * distinguish a rate limit from a rejected credential. The provider records
   * that distinction on itself and this is how the service reads it, rather
   * than by widening an interface four implementations share.
   */
  readonly providerFailures?: () => readonly ExplainFailure[];
}

/**
 * Explain one decision, or report why there is no explanation.
 *
 * Never throws for a provider problem: `§12` requires degradation to be
 * *"visible in the report ... not hidden"*, and a thrown error on this surface
 * would be a blank panel where a stated reason belongs.
 */
export async function explainDecision(args: ExplainDecisionArgs): Promise<ExplainOutcome> {
  const { stored, decision, provider } = args;
  const evidence = explainEvidence(stored, decision);

  // The last grounding verdict, kept so the surface can say WHICH hazard fired.
  // `LlmCall.grounding_violations` carries the values but not their paths, and
  // "it invented an account" and "it invented an amount" are different things
  // to tell an analyst.
  const seen: { check: GroundingCheck | null } = { check: null };

  const result = await adjudicate(provider, {
    runId: stored.run_id as RunId,
    request: {
      role: "R4",
      schema: R4OutputSchema,
      systemPromptId: R4_SYSTEM_PROMPT_ID,
      input: evidence.input,
      idAllowlist: evidence.idAllowlist,
    },
    grounding: (value) => {
      const check = groundR4(value, evidence.evidenceSet, evidence.idAllowlist);
      seen.check = check;
      return check;
    },
  });
  const stray = strayValues(seen.check);

  // The metered provider's own attempts. `adjudicate`'s §12 fallback appends an
  // `offline` record, and `offline` answers R4 with ROLE_NOT_IMPLEMENTED (§H
  // tier H2) — a record of the fallback having been tried, not a second
  // explainer whose template could be mistaken for the model's answer.
  const own = result.calls.filter((c) => c.provider === provider.id);
  const last = own.at(-1);
  const accepted = own.find((c) => c.outcome === "accepted");
  const decisive = accepted ?? last;

  const grounding: ExplainGrounding = {
    decision_evidence_verified: true,
    certificate_used: decision.certificate !== null,
    decision_authority: "none",
    // Read from the sealed decision, in EVERY branch — not from `result`.
    deterministic_state: evidence.deterministicState,
    checks: checksOf(decisive, stray),
    rejected_entity_ids: [
      ...new Set([...(decisive?.allowlist_violations ?? []), ...stray.entityIds]),
    ],
    rejected_numerals: stray.numerals,
    system_prompt_id: R4_SYSTEM_PROMPT_ID,
    system_prompt_hash: decisive?.system_prompt_hash ?? "",
    input_hash: decisive?.input_hash ?? "",
    cache_key: decisive?.cache_key ?? "",
    evidence_item_count: evidence.evidenceSet.length,
  };

  const providerMeta: ExplainProviderMeta = {
    provider: provider.id,
    model_id: provider.modelId,
    requires_network: provider.requiresNetwork,
    attempts: own.length,
    latency_ms: own.reduce((total, c) => total + c.latency_ms, 0),
  };

  if (result.value !== null && result.acceptedFrom === provider.id) {
    return {
      status: "ok",
      explanation: result.value,
      fallback: null,
      provider: providerMeta,
      grounding,
      failure: null,
    };
  }

  const rejected = verificationFailure(decisive, stray);
  if (rejected !== null) {
    return {
      status: "rejected",
      explanation: null,
      fallback: null,
      provider: providerMeta,
      grounding,
      failure: rejected,
    };
  }

  const transport = args.providerFailures?.().at(-1);
  return {
    status: "unavailable",
    explanation: null,
    // Built from `evidence`, the same envelope the provider was sent, so the
    // panel says something true about this decision rather than going blank.
    fallback: evidenceSummary(evidence),
    provider: providerMeta,
    grounding,
    failure: transport ?? {
      code: "PROVIDER_UNAVAILABLE",
      message: "The AI provider did not return an explanation. ASSAY's decision is unaffected.",
    },
  };
}
