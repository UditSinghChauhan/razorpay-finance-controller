import type { LlmProviderId } from "@assay/ledger";
import type { ZodType } from "zod";

/**
 * The `LlmProvider` contract (`ARCHITECTURE.md §6.5`).
 *
 * *"Every model call in ASSAY goes through one interface. Roles R1-R4 are
 * written against this interface and have no knowledge of which provider is
 * behind it."*
 *
 * `DECISION_BRIEF.md §L.4` makes the choke point normative rather than
 * stylistic: *"Adding an LLM call outside roles R1-R4, or outside the
 * `LlmProvider` interface"* is prohibited without a spec amendment.
 *
 * **What is built at Phase 8, and what is not.** `§L.2`'s build order names this
 * position **`llm (provider + offline + replay)`** and `§C`'s T0-7 scopes it to
 * *"`LlmProvider` interface + `offline` + `replay` providers; roles R1, R2;
 * schema/allowlist/grounding verification"*. So:
 *
 * ```
 *   interface + verification    built
 *   offline, replay             built        no network, deterministic
 *   anthropic, openai-compatible DECLARED, not built    -- §H tier H2, blocked
 *                                                          on §F F2 (no metered
 *                                                          credential)
 *   R1, R2                      built
 *   R3, R4                      DECLARED, not built     -- §H tier H1 / H2
 * ```
 *
 * The four-provider architecture is **preserved as a declared table**
 * (`PROVIDER_DESCRIPTORS` below) rather than stubbed with invented network code.
 * `LLM_PROVIDER_IDS` still has four members and `DATA_MODEL.md §19`'s
 * `LlmProviderId` is unchanged; what a later phase adds is two implementations
 * behind an interface that already describes them.
 */

/** The four bounded roles (`ARCHITECTURE.md §6`). Closed; `§L.4` bars a fifth. */
export const ROLE_IDS = Object.freeze(["R1", "R2", "R3", "R4"] as const);

/** One of `§6`'s four roles. */
export type RoleId = (typeof ROLE_IDS)[number];

/** The roles this phase implements. `R3` is `§H` tier H1, `R4` tier H2. */
export const IMPLEMENTED_ROLE_IDS = Object.freeze(["R1", "R2"] as const);

/** A role with a built implementation at Phase 8. */
export type ImplementedRoleId = (typeof IMPLEMENTED_ROLE_IDS)[number];

/** Whether a role has a built implementation at this phase. */
export function isImplementedRole(role: RoleId): role is ImplementedRoleId {
  return (IMPLEMENTED_ROLE_IDS as readonly RoleId[]).includes(role);
}

/**
 * `§19`'s per-call role names, which are longer than `§6`'s `R1`-`R4` labels.
 *
 * `DATA_MODEL.md §19` types `LlmCall.role` as
 * `"R1_parse_narration" | "R2_classify_exception" | "R3_propose_probe" |
 * "R4_explain_decision"` while `§6.5`'s `invoke` takes `"R1" | ... | "R4"`. Two
 * spellings of one fact, so the mapping is declared once here rather than
 * written out at each call site.
 */
export const ROLE_CALL_NAMES = Object.freeze({
  R1: "R1_parse_narration",
  R2: "R2_classify_exception",
  R3: "R3_propose_probe",
  R4: "R4_explain_decision",
} as const);

/** `DATA_MODEL.md §19`'s `LlmCall.role`. */
export type RoleCallName = (typeof ROLE_CALL_NAMES)[RoleId];

/**
 * `§6.5`'s provider table, as data.
 *
 * Kept as a declaration so that the architecture's four-provider claim is
 * checkable at Phase 8 — when only two are built — rather than asserted in
 * prose. `built: false` is the honest encoding of `§F` F2: the row exists, the
 * implementation does not, and nothing pretends otherwise.
 */
export interface ProviderDescriptor {
  readonly id: LlmProviderId;
  readonly requiresNetwork: boolean;
  readonly meteredCost: boolean;
  /** `§6.5`: `offline` and `replay` are *"fully deterministic"*. */
  readonly deterministic: boolean;
  /** Whether an implementation exists in this package at this phase. */
  readonly built: boolean;
  /** `§6.5`'s Purpose column, one line. */
  readonly purpose: string;
}

/** `ARCHITECTURE.md §6.5`'s four implementations, in the order it lists them. */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = Object.freeze([
  Object.freeze({
    id: "offline",
    requiresNetwork: false,
    meteredCost: false,
    deterministic: true,
    built: true,
    purpose:
      "Rule-based implementation of the roles. The CI default and the guaranteed demo path.",
  }),
  Object.freeze({
    id: "replay",
    requiresNetwork: false,
    meteredCost: false,
    deterministic: true,
    built: true,
    purpose:
      "Serves committed responses from fixtures/llm-cache/. All scored benchmark runs use this mode.",
  }),
  Object.freeze({
    id: "anthropic",
    requiresNetwork: true,
    meteredCost: true,
    deterministic: false,
    built: false,
    purpose: "@anthropic-ai/sdk with messages.parse() and zodOutputFormat.",
  }),
  Object.freeze({
    id: "openai-compatible",
    requiresNetwork: true,
    meteredCost: true,
    deterministic: false,
    built: false,
    purpose:
      "Any endpoint speaking the OpenAI chat-completions schema. Present so no single vendor is load-bearing.",
  }),
] as const);

/** The descriptor for one provider id. */
export function providerDescriptor(id: LlmProviderId): ProviderDescriptor {
  const found = PROVIDER_DESCRIPTORS.find((d) => d.id === id);
  /* c8 ignore next */
  if (found === undefined) throw new Error(`providerDescriptor: unknown provider ${id}`);
  return found;
}

/**
 * The structured input one role is called with.
 *
 * `§6.5`: *"no free text except the quarantined field"*. `R1` carries exactly
 * one quarantined string, the bank narration; `R2` carries a structured summary
 * in which, per `ARCHITECTURE.md §6`, amounts appear **as opaque references**
 * and never as values.
 */
export type StructuredRoleInput = R1Input | R2Input;

/** `R1 parse_bank_narration` input (`ARCHITECTURE.md §6`). */
export interface R1Input {
  readonly role: "R1";
  /** The observation the narration was quarantined from. */
  readonly obs_id: string;
  /**
   * THE quarantined field, and the only free text that crosses this boundary.
   *
   * `ARCHITECTURE.md §4` boundary 1: quarantined text is *"reachable only by the
   * LLM adjudicator, and only through an envelope that marks them as data."*
   * This field is that envelope: it is named, typed and confined to `R1`.
   */
  readonly narration: string;
}

/** `R2 classify_exception` input (`ARCHITECTURE.md §6`). */
export interface R2Input {
  readonly role: "R2";
  readonly comp_id: string;
  /** The target's observation kind, or `null` where the component has no target. */
  readonly target_kind: string | null;
  /** Member observation kinds, in the order the caller produced them. */
  readonly member_kinds: readonly string[];
  /** `C1`-`C8` clauses that excluded, as ids. */
  readonly failed_constraints: readonly string[];
  /** `I1`-`I9` invariants that failed, as ids. */
  readonly failed_invariants: readonly string[];
  /**
   * Amounts **as opaque references** (`ARCHITECTURE.md §6` R2), never values.
   *
   * A rupee figure in this envelope would be a number the model had seen and
   * could echo. `§4` boundary 2 answers that with *"where a quantity is needed,
   * the model returns an identifier and deterministic code looks up the value"*;
   * carrying only references means there is no value to echo in the first place.
   */
  readonly amount_refs: readonly string[];
  /** Structural shape only: how many unanchored members the component holds. */
  readonly member_count: number;
  /** Whether the target has an `AN2` bank-side match established. */
  readonly bank_matched: boolean;
}

/** Why a call did not return a usable value. */
export type InvocationFailure =
  | "UNAVAILABLE"
  | "SCHEMA_REJECT"
  | "CACHE_MISS"
  | "ROLE_NOT_IMPLEMENTED";

/**
 * Provider-side telemetry for one `invoke`, feeding `DATA_MODEL.md §19`.
 *
 * Numbers are permitted here and nowhere near the response schema: `§L.1` rule 2
 * constrains *"LLM output schema[s]"*, and this is a call record the
 * deterministic side writes about the call, not a value the model produced.
 */
export interface LlmCallMeta {
  readonly provider: LlmProviderId;
  readonly model_id: string;
  readonly requires_network: boolean;
  readonly cache_key: string;
  readonly cache_hit: boolean;
  readonly raw_response_hash: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly latency_ms: number;
  /** Non-null exactly when `value` is `null`. */
  readonly failure: InvocationFailure | null;
}

/** One `invoke` request (`ARCHITECTURE.md §6.5`). */
export interface InvokeRequest<T> {
  readonly role: RoleId;
  /** Must contain no number-typed field (`§L.1` rule 2), asserted at call time. */
  readonly schema: ZodType<T>;
  readonly systemPromptId: string;
  readonly input: StructuredRoleInput;
  readonly idAllowlist: readonly string[];
}

/** One `invoke` result (`ARCHITECTURE.md §6.5`). */
export interface InvokeResult<T> {
  readonly value: T | null;
  readonly meta: LlmCallMeta;
}

/**
 * `ARCHITECTURE.md §6.5`'s interface, transcribed.
 *
 * Deliberately unchanged in shape from the specification's block, including the
 * `Promise` return that the two deterministic providers satisfy synchronously.
 */
export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly modelId: string;
  readonly requiresNetwork: boolean;
  readonly meteredCost: boolean;

  /** The ONLY entry point. Schema-constrained, non-numeric by contract. */
  invoke<T>(req: InvokeRequest<T>): Promise<InvokeResult<T>>;
}
