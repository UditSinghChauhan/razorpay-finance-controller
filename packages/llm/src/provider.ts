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
 *   gemini                                                 on §F F2 (no metered
 *                                                          credential)
 *   R1, R2                      built
 *   R3                          built        spec 1.4.25, §H tier H1
 *   R4                          DECLARED, not built     -- §H tier H2
 * ```
 *
 * The provider architecture is **preserved as a declared table**
 * (`PROVIDER_DESCRIPTORS` below) rather than stubbed with invented network code.
 * `LLM_PROVIDER_IDS` has five members from spec 1.4.38 and `DATA_MODEL.md §19`'s
 * `LlmProviderId` is widened to match; what a later phase adds is the three
 * network implementations behind an interface that already describes them.
 *
 * **"Not built" means "not built HERE", and that distinction is the whole
 * point of this table.** `anthropic` and `gemini` both have working
 * implementations in `apps/api/src/explain/`, which is the layer that owns the
 * socket and the credential; neither may exist in this package, because
 * `tests/discipline.test.ts` fails the build on a transport import, on a
 * `process.env` read and on a `providers/<network-id>.ts`. That is what makes
 * `§C` T0-11's *"clean checkout with no API key"* a property rather than a
 * promise, and `built: false` records it honestly for every row it holds of.
 */

/** The four bounded roles (`ARCHITECTURE.md §6`). Closed; `§L.4` bars a fifth. */
export const ROLE_IDS = Object.freeze(["R1", "R2", "R3", "R4"] as const);

/** One of `§6`'s four roles. */
export type RoleId = (typeof ROLE_IDS)[number];

/**
 * The roles with a built implementation. `R4` remains `§H` tier H2.
 *
 * `R3` was added at spec 1.4.25 (`§H` tier H1): `PREREGISTRATION.md §7` freezes
 * the `A3-NOLLM` policy the `offline` provider executes, and `DATA_MODEL.md §13`
 * supplies the certificate reason the loop needs to terminate, so the role has
 * both halves of a contract for the first time.
 */
export const IMPLEMENTED_ROLE_IDS = Object.freeze(["R1", "R2", "R3"] as const);

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
 * Kept as a declaration so that the architecture's provider claim is
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

/** `ARCHITECTURE.md §6.5`'s five implementations, in the order it lists them. */
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
  // Appended last, never inserted: `LLM_PROVIDER_IDS` and this table are read
  // in parallel by `apps/cli`'s `--llm` usage text, and `§8`'s "appended, never
  // renumbered" principle governs an ordered declaration for the same reason.
  Object.freeze({
    id: "gemini",
    requiresNetwork: true,
    // Metered in the sense this field means -- a vendor account is billed by
    // request. A free tier is a commercial term of that account and not a
    // property of the provider, so the flag that makes `apps/cli` refuse a
    // network provider outright stays true and CI keeps refusing this one.
    meteredCost: true,
    deterministic: false,
    built: false,
    purpose:
      "@google/genai against the Gemini Developer API, with responseJsonSchema for strict schemas.",
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
export type StructuredRoleInput = R1Input | R2Input | R3Input | R4Input;

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

/**
 * One probe kind the caller has determined is constructible for this component.
 *
 * `ARCHITECTURE.md §6` gives `R3` the input *"the ambiguity certificate + **list
 * of available probes**"*; this is that list. `argument_ids` holds the **eligible**
 * arguments in `PREREGISTRATION.md §7`'s sense — of the exact type the probe
 * requires, present in this component's context, and already past the frozen
 * deterministic validity and pre-call `I6` checks.
 *
 * **The filtering is the caller's and happens before a provider is chosen**, so
 * `offline` and `replay` receive byte-identical context and the only difference
 * between the arms is which entry the proposer picks. `packages/probe` re-runs
 * pre-call `I6` independently on whatever comes back, as `DECISION_BRIEF.md §L.1`
 * rule 8 requires.
 */
export interface R3AvailableProbe {
  /** One of the four `R3` may propose (`DATA_MODEL.md §22.2` M40). */
  readonly probe: "fetch_order" | "fetch_payment" | "fetch_refund" | "fetch_settlement_recon";
  /** Eligible arguments. Empty means the probe is not constructible here. */
  readonly argument_ids: readonly string[];
}

/**
 * What one already-spent probe returned, as `R3` sees it.
 *
 * Carried so that each iteration's input differs from the last: `§19`'s
 * `cache_key` is `sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`,
 * so an input that did not change between attempts would return the **same**
 * proposal from the replay cache and spend all of `P_max` on one probe.
 *
 * Ids only. No amount, no score, no timestamp — there is no quantity here for a
 * model to echo.
 */
export interface R3ProbeResultSummary {
  readonly probe: string;
  /** The entity the probe named, or `null` where the variant carries none. */
  readonly argument_id: string | null;
  /** `DATA_MODEL.md §12`: the probe **ran**; `false` means it yielded nothing. */
  readonly yielded: boolean;
  /** Entity ids the result carried, in the order the result listed them. */
  readonly returned_entity_ids: readonly string[];
}

/**
 * `R3 propose_probe` input (`ARCHITECTURE.md §6`), added at spec 1.4.25.
 *
 * **Amounts are opaque references, never values** — `ARCHITECTURE.md §6`'s `R2`
 * rule, applied here for the same reason: `§4` boundary 2 answers "where a
 * quantity is needed" with *"the model returns an identifier and deterministic
 * code looks up the value"*, and carrying only a reference means there is no
 * rupee figure in the envelope for a model to echo. `§L.5` sentence 4 —
 * *"cannot express a monetary amount"* — stays literally true of this role.
 *
 * Structural counts and basis-point scores **are** carried, following `R2Input`'s
 * `member_count`: they are neither free text nor monetary amounts, and `§L.1`
 * rule 2 constrains **output** schemas.
 */
export interface R3Input {
  readonly role: "R3";
  readonly comp_id: string;
  /** `DATA_MODEL.md §13`'s certificate, structurally. */
  readonly certificate: R3CertificateSummary;
  /** `§6`'s *"list of available probes"*, already filtered for eligibility. */
  readonly available_probes: readonly R3AvailableProbe[];
  /** Probes spent on this component so far. */
  readonly attempts: number;
  /** `P_max` minus {@link attempts}. */
  readonly attempts_remaining: number;
  /** `DATA_MODEL.md §13`: *"what we tried before giving up"*, as ids. */
  readonly probes_attempted: readonly string[];
  /** What those probes returned. Distinguishes one iteration's input from the next. */
  readonly probe_results: readonly R3ProbeResultSummary[];
  /**
   * The `date` argument `§6.2`'s `fetch_settlement_recon(settlement_id, date)`
   * signature requires, supplied by deterministic code as an **opaque string**.
   *
   * `DATA_MODEL.md §22.2` M31 leaves the field a query is date-scoped on
   * undecided and this does **not** settle it: on spec 1.4.22's committed
   * surface `settlement_id` is the only query key, so the argument selects
   * nothing. It is carried because the frozen signature has two arguments and
   * `DATA_MODEL.md §16` records the call as issued through `inputs_hash`.
   */
  readonly recon_date_scope: string;
}

/** `DATA_MODEL.md §13`'s `AmbiguityCertificate`, as `R3` receives it. */
export interface R3CertificateSummary {
  readonly solution_a_obs_ids: readonly string[];
  readonly solution_b_obs_ids: readonly string[];
  /** `C1`-`C8` clauses both solutions satisfy identically. */
  readonly shared_hard_constraints: readonly string[];
  /** `§4.2`'s `|score_a − score_b|` in integer bps. A score, never an amount. */
  readonly evidence_score_gap_bps: number;
  /** The pre-registered margin in force, `1500` bps. */
  readonly epsilon_bps: number;
  /**
   * The materiality between the two solutions, **as an opaque reference**.
   *
   * `ARCHITECTURE.md §6`'s `R2` row carries *"amounts as opaque references"* and
   * the same rule governs here. `τ` and the paise figure stay on the
   * deterministic side; what crosses is a token naming the quantity.
   */
  readonly materiality_ref: string;
}

/** One member of a candidate allocation, priced, as `R4` receives it. */
export interface R4MemberAllocation {
  readonly obs_id: string;
  /** `C6`'s term, rendered — or a plain statement that this run does not price it. */
  readonly allocation: string;
}

/**
 * One candidate allocation, as `R4` receives it.
 *
 * `DATA_MODEL.md §13` names each solution by `candidate_id` and
 * `member_obs_ids` and prices no member; `member_allocations` is the caller's
 * **read model** for the same members, already rendered. `R4` differs from
 * `R2` and `R3` on exactly this point and the difference is `§4`'s, not a
 * relaxation: those two roles sit **on** the decision path, so an amount
 * reaching them is an amount the model could echo into a candidate ranking. By
 * the time `R4` is called the decision is sealed, and `§4` boundary 2 states
 * its rule as *"every numeral in the prose must appear in the attached evidence
 * set"* — a rule that presupposes an evidence set with numerals in it.
 */
export interface R4CandidateSummary {
  readonly candidate_id: string;
  readonly member_obs_ids: readonly string[];
  /**
   * Each member's `C6` term, **already rendered by deterministic code**.
   *
   * Strings, not numbers, because this envelope IS the *"attached evidence
   * set"* the grounding rule checks the prose against: a figure the model may
   * cite has to be present here in the form it may cite it in.
   *
   * The id and the amount are separate fields rather than one `"<id>: <amount>"`
   * line, so that `verify/allowlist.ts` sees an identifier where there is one:
   * `isEntityIdShaped` tests a string's prefix, and a string that merely
   * *starts* with an obs id is neither an id nor recognisable as prose.
   */
  readonly member_allocations: readonly R4MemberAllocation[];
  /** The rendered sum of the above, or `null` where a member has no term. */
  readonly total_allocation: string | null;
}

/**
 * `R4 explain_decision` input (`ARCHITECTURE.md §6`).
 *
 * **`R4` is declared here and implemented nowhere in this package.** `§H` tier
 * H2 leaves the role unbuilt, `providers/offline.ts` returns
 * `ROLE_NOT_IMPLEMENTED` for it, and `tests/discipline.test.ts` fails the build
 * if a `roles/r4.ts` appears. What this type adds is the **shape of the
 * envelope**, so that a caller which does implement the role — `apps/api`'s
 * product explanation surface — reaches a provider through `§6.5`'s one
 * interface and `§4`'s three checks rather than around them. `§L.4` prohibits
 * *"adding an LLM call outside roles R1-R4, or outside the `LlmProvider`
 * interface"*; a declared role with no declared input is an invitation to do
 * both.
 *
 * **Every field is a value the deterministic side already decided.** Nothing
 * here is computed to be explained: the state, the reason, the two candidates,
 * the four thresholds and the period status are read off the sealed
 * `DecisionEvidence` and its `AmbiguityCertificate`. The role's whole contract
 * is that it receives a decision and returns prose about it.
 */
export interface R4Input {
  readonly role: "R4";
  readonly decision_id: string;
  readonly comp_id: string | null;
  /**
   * `§L.1` rule 5's terminal state, **as ASSAY decided it**.
   *
   * Carried so the model can name the outcome it is explaining, and carried as
   * an input for the reason it is not an output: the `R4` response schema has
   * no state field, so nothing the model returns can contradict this.
   */
  readonly state: string;
  /** `DATA_MODEL.md §13`'s certificate reason, or `null` off an abstention. */
  readonly reason: string | null;
  readonly subject: {
    readonly obs_id: string;
    readonly entity_id: string;
    readonly kind: string;
    /** `§14.1`'s `value(observation)`, rendered. */
    readonly value: string;
  };
  readonly candidate_a: R4CandidateSummary | null;
  readonly candidate_b: R4CandidateSummary | null;
  /** `C1`-`C8` clauses both solutions satisfy identically. */
  readonly shared_hard_constraints: readonly string[];
  /** `§4.2`'s `|score_a − score_b|`, rendered in basis points. */
  readonly evidence_score_gap: string | null;
  /** The pre-registered margin in force, rendered in basis points. */
  readonly epsilon: string | null;
  /** The materiality between the two solutions, rendered. */
  readonly materiality: string | null;
  /** The materiality threshold, rendered. */
  readonly tau: string | null;
  /** `§13`: *"what we tried before giving up"*, as ids. */
  readonly probes_attempted: readonly string[];
  /** `§20`'s unresolved value for the whole close, rendered. */
  readonly unresolved_value: string;
  /** `DATA_MODEL.md §20`'s three outcomes. */
  readonly period_status: string;
  /**
   * Every string above, flattened — `§4` boundary 2's *"attached evidence
   * set"*, named so that the grounding rule and the prompt cannot disagree
   * about what was attached.
   */
  readonly evidence_set: readonly string[];
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
