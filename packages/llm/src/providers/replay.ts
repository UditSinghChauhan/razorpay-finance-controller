import type { LlmProviderId } from "@assay/ledger";

import { callHashes, rawResponseHash } from "../cache-key.js";
import {
  type InvokeRequest,
  type InvokeResult,
  type LlmProvider,
  type LlmCallMeta,
} from "../provider.js";
import { checkSchema } from "../verify/schema.js";

/**
 * The `replay` provider (`ARCHITECTURE.md §6.5`).
 *
 * *"Serves committed responses from `fixtures/llm-cache/`, keyed by
 * `sha256(provider || model_id || system_prompt_hash || input_hash)`. Cache miss
 * under `--strict-replay` is a hard error, never a silent live call. **All
 * scored benchmark runs use this mode.**"*
 *
 * `§L.1` rule 11 states it as an invariant: *"All scored benchmark runs use
 * `--llm=replay --strict-replay`. A cache miss is a hard error, never a silent
 * live call."* `ARCHITECTURE.md §12` gives the reason: *"A benchmark that
 * quietly goes live is no longer reproducible, and the report would be false."*
 *
 * **This provider performs no filesystem I/O.** It is handed an already-loaded
 * map. `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem I/O"*, and spec
 * 1.4.18 settled the same split for `S0`: the CLI acquires bytes, the package
 * transforms them. Keeping the read outside makes the cache unit-testable
 * without a filesystem and keeps this package free of a path it would otherwise
 * have to be trusted not to escape.
 */

/** A loaded `fixtures/llm-cache/`, keyed by `§19`'s `cache_key`. */
export type ReplayCache = ReadonlyMap<string, unknown>;

/**
 * Raised on a cache miss under `--strict-replay`.
 *
 * A distinct error type because `§12` singles this case out as the one failure
 * that must **not** degrade to a fallback: every other provider failure routes
 * to `offline`, and this one stops the run.
 */
export class ReplayCacheMissError extends Error {
  readonly cacheKey: string;
  readonly role: string;

  constructor(cacheKey: string, role: string) {
    super(
      `--strict-replay: no committed response for ${role} at cache_key ${cacheKey}. ` +
        `DECISION_BRIEF.md §L.1 rule 11 makes a miss a hard error, never a silent ` +
        `live call (ARCHITECTURE.md §12). Re-record the cache with one ` +
        `--llm=<live provider> --record pass rather than relaxing this.`,
    );
    this.name = "ReplayCacheMissError";
    this.cacheKey = cacheKey;
    this.role = role;
  }
}

export interface ReplayOptions {
  readonly cache: ReplayCache;
  /**
   * The provider whose responses were recorded.
   *
   * `§19`'s `cache_key` binds `provider` and `model_id`, so replaying entries
   * recorded against `anthropic` requires computing the key with **those**
   * values. Defaults to `"replay"` / `"replay-v1"` for a cache recorded by
   * fixtures rather than by a live pass.
   */
  readonly recordedProvider?: LlmProviderId;
  readonly recordedModelId?: string;
  /** `§L.1` rule 11. Defaults to `true`: the safe direction is the frozen one. */
  readonly strict?: boolean;
}

export class ReplayProvider implements LlmProvider {
  readonly id = "replay" as const;
  readonly requiresNetwork = false;
  readonly meteredCost = false;
  readonly modelId: string;

  readonly #cache: ReplayCache;
  readonly #recordedProvider: LlmProviderId;
  readonly #strict: boolean;

  constructor(options: ReplayOptions) {
    this.#cache = options.cache;
    this.#recordedProvider = options.recordedProvider ?? "replay";
    this.modelId = options.recordedModelId ?? "replay-v1";
    this.#strict = options.strict ?? true;
  }

  /**
   * `async` rather than a sync body returning `Promise.resolve`, so that a
   * strict-replay miss reaches a caller as a **rejection**. A function declaring
   * a `Promise` return but throwing synchronously is invisible to
   * `invoke(req).catch(...)`, and `§L.1` rule 11's hard error is the one failure
   * that must never be lost on its way out.
   */
  async invoke<T>(req: InvokeRequest<T>): Promise<InvokeResult<T>> {
    const hashes = callHashes({
      provider: this.#recordedProvider,
      modelId: this.modelId,
      systemPromptId: req.systemPromptId,
      input: req.input,
    });

    const base = {
      provider: this.id,
      model_id: this.modelId,
      requires_network: false,
      cache_key: hashes.cache_key,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: 0,
    } as const;

    if (!this.#cache.has(hashes.cache_key)) {
      if (this.#strict) throw new ReplayCacheMissError(hashes.cache_key, req.role);
      const meta: LlmCallMeta = {
        ...base,
        cache_hit: false,
        raw_response_hash: "",
        failure: "CACHE_MISS",
      };
      return { value: null, meta };
    }

    const raw = this.#cache.get(hashes.cache_key);
    const checked = checkSchema(req.schema, raw);
    const meta: LlmCallMeta = {
      ...base,
      cache_hit: true,
      raw_response_hash: rawResponseHash(raw),
      failure: checked.ok ? null : "SCHEMA_REJECT",
    };
    return { value: checked.ok ? checked.value : null, meta };
  }
}

/** The `replay` provider over an already-loaded cache. */
export function replayProvider(options: ReplayOptions): LlmProvider {
  return new ReplayProvider(options);
}
