import type { LlmCallId, LlmProviderId, RunId } from "@assay/ledger";

import { callHashes } from "./cache-key.js";
import {
  ROLE_CALL_NAMES,
  type InvokeRequest,
  type LlmProvider,
  type RoleCallName,
  type RoleId,
} from "./provider.js";
import { OfflineProvider } from "./providers/offline.js";
import { ReplayCacheMissError } from "./providers/replay.js";
import { checkAllowlist } from "./verify/allowlist.js";
import { checkSchema } from "./verify/schema.js";
import type { GroundingCheck } from "./verify/grounding.js";

/**
 * Trust boundary 2, assembled (`ARCHITECTURE.md §4`).
 *
 * *"The model is called with structured, minimal context and its output is
 * treated as adversarial. **Every response passes three checks before use**:
 * schema, allowlist, grounding."*
 *
 * The three checks live in `verify/`; this module is the single place they are
 * applied **in order**, together with `§12`'s failure table, so that no call
 * site can reach a provider while skipping one. `§L.4` makes that structural:
 * *"Adding an LLM call outside roles R1-R4, or outside the `LlmProvider`
 * interface"* requires a spec amendment.
 *
 * ## `ARCHITECTURE.md §12`, transcribed
 *
 * ```
 *   provider unreachable / rate-limited   retry with backoff, then fall back to
 *                                         `offline` FOR THAT ROLE, log
 *                                         LLM_UNAVAILABLE. The run completes.
 *
 *   invalid schema                        discard, ONE retry, then `offline`
 *                                         fallback for that call. Counted.
 *
 *   replay cache miss + --strict-replay   HARD ERROR. Never a silent live call.
 * ```
 *
 * The third is why `ReplayCacheMissError` is re-thrown below rather than treated
 * as unavailability: every other failure degrades visibly, and that one stops
 * the run. `§12`'s reason for the first is that *"a finance close must not be
 * blocked on a third-party API"*, and *"degradation is visible in the report as
 * a raised abstention rate, not hidden"* — which is what the `LlmCall` record
 * this module emits makes true.
 */

/** `DATA_MODEL.md §19`'s outcome union. */
export type LlmCallOutcome =
  | "accepted"
  | "rejected_schema"
  | "rejected_allowlist"
  | "rejected_grounding"
  | "fallback_offline";

/** `DATA_MODEL.md §19`, in full. */
export interface LlmCall {
  readonly llm_call_id: LlmCallId;
  readonly run_id: RunId;
  readonly role: RoleCallName;
  readonly provider: LlmProviderId;
  readonly model_id: string;
  readonly requires_network: boolean;
  readonly system_prompt_id: string;
  readonly system_prompt_hash: string;
  readonly input_hash: string;
  readonly cache_key: string;
  readonly cache_hit: boolean;
  readonly raw_response_hash: string;
  readonly schema_valid: boolean;
  readonly allowlist_violations: readonly string[];
  readonly grounding_violations: readonly string[];
  readonly outcome: LlmCallOutcome;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly latency_ms: number;
}

/** One adjudicated call: the verified value, and every record it produced. */
export interface AdjudicatedResult<T> {
  /** `null` when no attempt survived all three checks. */
  readonly value: T | null;
  /** Which provider produced `value`, or `null` when none did. */
  readonly acceptedFrom: LlmProviderId | null;
  /** One record per attempt, in order — `§19` records **every** call. */
  readonly calls: readonly LlmCall[];
}

/**
 * The role-specific grounding rule, supplied by the caller.
 *
 * `§4` boundary 2 states a rule for `R1` (*"every extracted token must be a
 * literal substring of the input narration"*) and one for `R4`, and none for
 * `R2` or `R3`. A role with no rule passes this check by **absence of a rule**,
 * not by a rule that always returns true — the distinction is visible here so
 * that adding `R4` later means supplying a function, not editing a default.
 */
export type GroundingRule<T> = (value: T) => GroundingCheck;

export interface AdjudicateOptions<T> {
  readonly runId: RunId;
  readonly request: InvokeRequest<T>;
  /** `§4` boundary 2 check 3, where the role has one. */
  readonly grounding?: GroundingRule<T>;
  /**
   * `§12`: *"discard, **one** retry, then `offline` fallback"*. One, by default.
   */
  readonly retries?: number;
  /**
   * `§12`: *"retry with **backoff**"*.
   *
   * Injected rather than performed, and defaulting to a no-op, because a real
   * sleep inside the adjudicator would put wall-clock time in the path of
   * `--llm=offline`'s acceptance tests without changing a single outcome. A
   * caller driving a live provider supplies a real one.
   */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly backoffMs?: readonly number[];
  /** The role fallback of `§12`. Defaults to a fresh `offline` provider. */
  readonly fallback?: LlmProvider;
}

const DEFAULT_BACKOFF_MS: readonly number[] = Object.freeze([250, 1000]);

/**
 * A deterministic `llm_call_id`.
 *
 * `DATA_MODEL.md §0` rule 3 states **no grammar** for `LlmCallId` — `§16`'s
 * comment in `packages/ledger` records it as an opaque reference token — so none
 * is invented. It is derived from the call's own content hash plus the attempt
 * ordinal so that two executions over identical inputs produce identical ids,
 * which is what metric 23 requires of everything that reaches a hashed body
 * (`llm_call_id` reaches it through `LedgerEvent.actor`).
 */
function callId(cacheKey: string, attempt: number): LlmCallId {
  return `${cacheKey}:${String(attempt)}` as LlmCallId;
}

function isUnavailable(error: unknown): boolean {
  // A cache miss under --strict-replay is NOT unavailability: §12 makes it a
  // hard error and this module must not convert it into a fallback.
  return !(error instanceof ReplayCacheMissError);
}

/**
 * Run one role call through boundary 2 and `§12`'s failure table.
 *
 * The order of the three checks is `§4`'s own: schema, then allowlist, then
 * grounding. It matters — allowlist and grounding both read a **parsed** value,
 * so a response that fails the schema has no fields to check and is discarded
 * before either runs.
 */
export async function adjudicate<T>(
  provider: LlmProvider,
  options: AdjudicateOptions<T>,
): Promise<AdjudicatedResult<T>> {
  const { request, runId } = options;
  const retries = options.retries ?? 1;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep;
  const fallback = options.fallback ?? new OfflineProvider();
  const calls: LlmCall[] = [];

  const attemptOn = async (
    p: LlmProvider,
    attempt: number,
  ): Promise<{ value: T | null; outcome: LlmCallOutcome }> => {
    const hashes = callHashes({
      provider: p.id,
      modelId: p.modelId,
      systemPromptId: request.systemPromptId,
      input: request.input,
    });

    let result;
    try {
      result = await p.invoke(request);
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      calls.push({
        llm_call_id: callId(hashes.cache_key, attempt),
        run_id: runId,
        role: ROLE_CALL_NAMES[request.role],
        provider: p.id,
        model_id: p.modelId,
        requires_network: p.requiresNetwork,
        system_prompt_id: request.systemPromptId,
        system_prompt_hash: hashes.system_prompt_hash,
        input_hash: hashes.input_hash,
        cache_key: hashes.cache_key,
        cache_hit: false,
        raw_response_hash: "",
        schema_valid: false,
        allowlist_violations: [],
        grounding_violations: [],
        outcome: "fallback_offline",
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: 0,
      });
      return { value: null, outcome: "fallback_offline" };
    }

    const { value, meta } = result;
    let outcome: LlmCallOutcome = "accepted";
    let allowlistViolations: readonly string[] = [];
    let groundingViolations: readonly string[] = [];
    let accepted: T | null = value;

    // The three checks, in `§4`'s order, applied HERE rather than trusted to
    // the provider.
    //
    // A provider is an implementation of an interface, and `§6.5` contemplates
    // four of them including two written against third-party SDKs. `§4` requires
    // the response to be *"treated as adversarial"*, which a boundary cannot do
    // while taking the adversary's word that it already validated itself. The
    // built providers parse for their own convenience; this re-parse is what
    // makes the guarantee independent of them, and it is not redundant — without
    // it a provider returning a non-null value of the wrong shape reaches the
    // allowlist and grounding rules, which are written against the parsed type.
    let schemaValid = false;
    if (value === null) {
      outcome = meta.failure === "SCHEMA_REJECT" ? "rejected_schema" : "fallback_offline";
    } else {
      const parsed = checkSchema(request.schema, value);
      if (!parsed.ok) {
        outcome = "rejected_schema";
        accepted = null;
      } else {
        schemaValid = true;
        accepted = parsed.value;
        const allow = checkAllowlist(parsed.value, request.idAllowlist);
        if (!allow.ok) {
          allowlistViolations = allow.violations.map((v) => v.id);
          outcome = "rejected_allowlist";
          accepted = null;
        } else if (options.grounding !== undefined) {
          const ground = options.grounding(parsed.value);
          if (!ground.ok) {
            groundingViolations = ground.violations.map((v) => v.value);
            outcome = "rejected_grounding";
            accepted = null;
          }
        }
      }
    }

    calls.push({
      llm_call_id: callId(meta.cache_key, attempt),
      run_id: runId,
      role: ROLE_CALL_NAMES[request.role],
      provider: meta.provider,
      model_id: meta.model_id,
      requires_network: meta.requires_network,
      system_prompt_id: request.systemPromptId,
      system_prompt_hash: hashes.system_prompt_hash,
      input_hash: hashes.input_hash,
      cache_key: meta.cache_key,
      cache_hit: meta.cache_hit,
      raw_response_hash: meta.raw_response_hash,
      schema_valid: schemaValid,
      allowlist_violations: allowlistViolations,
      grounding_violations: groundingViolations,
      outcome,
      input_tokens: meta.input_tokens,
      output_tokens: meta.output_tokens,
      latency_ms: meta.latency_ms,
    });

    return { value: accepted, outcome };
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && sleep !== undefined) {
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
    }
    const { value } = await attemptOn(provider, attempt);
    if (value !== null) return { value, acceptedFrom: provider.id, calls };
  }

  // §12: "fall back to the `offline` provider FOR THAT ROLE ... The run
  // completes." A fallback that is itself the offline provider is not retried
  // against itself.
  if (provider.id === fallback.id) return { value: null, acceptedFrom: null, calls };

  const { value } = await attemptOn(fallback, retries + 1);
  return {
    value,
    acceptedFrom: value === null ? null : fallback.id,
    calls,
  };
}

/** Whether a role is one `§4` boundary 2 states a grounding rule for. */
export function hasGroundingRule(role: RoleId): boolean {
  return role === "R1" || role === "R4";
}
