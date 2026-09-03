import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  callHashes,
  rawResponseHash,
  type InvokeRequest,
  type InvokeResult,
  type LlmCallMeta,
  type LlmProvider,
  type StructuredRoleInput,
} from "@assay/llm";
import type { ZodType } from "zod";

import type { ExplainFailure } from "./failure.js";

/**
 * `ARCHITECTURE.md §6.5`'s **`anthropic`** provider, at last built — in the
 * server layer, which is the only layer allowed to have it.
 *
 * `§6.5`'s table describes this row as *"`@anthropic-ai/sdk` with
 * `messages.parse()` and `zodOutputFormat`"*, and that is what is below. It was
 * left unbuilt at Phase 8 for a reason `§F` F2 records — no metered credential
 * — and it may not be built where it was declared: `packages/llm`'s discipline
 * suite fails the build on a transport import, on a `process.env` read and on a
 * `providers/anthropic.ts`, which is what makes `§C` T0-11's *"clean checkout
 * with no API key"* a property rather than a promise. Those assertions are
 * unchanged and still pass.
 *
 * **So the boundary moved, not the guarantee.** `apps/api` is already
 * `ARCHITECTURE.md §3`'s one socket in the workspace — *"`apps/cli` is the
 * filesystem door and reaches no network; `apps/api` binds a port and reaches
 * no file"* — and the credential belongs with the socket. The browser never
 * holds it, `apps/web` never names it, and the interface this class implements
 * is `§6.5`'s own, so `§L.4`'s *"outside the `LlmProvider` interface"*
 * prohibition is satisfied by construction rather than by review.
 *
 * **This provider verifies nothing.** `messages.parse()` validates for its own
 * convenience and the result is passed on regardless; `adjudicate()` re-applies
 * schema, allowlist and grounding at the boundary, because `§4` requires the
 * response to be *"treated as adversarial"* and a boundary cannot do that while
 * taking the adversary's word that it validated itself.
 */

/** The prompt pair one `system_prompt_id` renders to. */
export interface PromptTemplate {
  readonly system: string;
  readonly user: (input: StructuredRoleInput) => string;
}

export interface AnthropicProviderOptions {
  /** The credential. Read from the environment by `config.ts`; never logged. */
  readonly apiKey: string;
  readonly modelId: string;
  /** Prompt text by `§19` `system_prompt_id`. A miss is a `BAD_REQUEST`. */
  readonly prompts: ReadonlyMap<string, PromptTemplate>;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  /**
   * Transport override, for pointing an end-to-end check at a local stand-in.
   *
   * `ANTHROPIC_BASE_URL` is the SDK's own environment variable and this simply
   * forwards it. It changes where the request goes, never what is sent or how
   * the response is checked.
   */
  readonly baseURL?: string | undefined;
  /** Injectable so a test can drive the class without a socket. */
  readonly client?: Pick<Anthropic["messages"], "parse"> | undefined;
}

function failureFor(error: unknown): ExplainFailure {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      code: "AUTHENTICATION",
      message: "The configured provider credential was rejected.",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "RATE_LIMITED", message: "The provider rate-limited this request." };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { code: "TIMEOUT", message: "The provider did not answer within the timeout." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "PROVIDER_UNAVAILABLE", message: "The provider could not be reached." };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { code: "BAD_REQUEST", message: "The provider rejected the request as malformed." };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: `The provider returned an error status (${String(error.status ?? "unknown")}).`,
    };
  }
  // An `AnthropicError` that is not an `APIError` is the SDK failing to parse a
  // response it did receive — `messages.parse()` throws one when the model's
  // text is not the JSON the format asked for. The call reached the provider
  // and came back; what failed was the shape. §12 treats that as the
  // schema-reject row, not the unreachable one.
  if (error instanceof Anthropic.AnthropicError) {
    return {
      code: "MALFORMED_RESPONSE",
      message: "The provider's response could not be read as the requested shape.",
    };
  }
  return { code: "PROVIDER_UNAVAILABLE", message: "The provider call failed." };
}

/** Whether a thrown error means the response was unreadable rather than absent. */
function isResponseShapeFailure(error: unknown): boolean {
  return error instanceof Anthropic.AnthropicError && !(error instanceof Anthropic.APIError);
}

export class AnthropicProvider implements LlmProvider {
  /** `DATA_MODEL.md §19`'s closed four-member union. */
  readonly id = "anthropic" as const;
  readonly modelId: string;
  readonly requiresNetwork = true;
  readonly meteredCost = true;

  /**
   * Every attempt that did not produce a value, in order.
   *
   * `LlmCallMeta.failure` is `§6.5`'s closed four-member union and cannot carry
   * "rate limited" or "the credential was rejected" — distinctions a product
   * surface has to be able to show a user, and which `ARCHITECTURE.md §12`
   * treats identically on purpose. They are recorded here instead of widening
   * the interface. One provider instance serves one request.
   */
  readonly failures: ExplainFailure[] = [];

  readonly #messages: Pick<Anthropic["messages"], "parse">;
  readonly #prompts: ReadonlyMap<string, PromptTemplate>;
  readonly #maxTokens: number;

  constructor(options: AnthropicProviderOptions) {
    this.modelId = options.modelId;
    this.#prompts = options.prompts;
    this.#maxTokens = options.maxTokens;
    this.#messages =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey,
        timeout: options.timeoutMs,
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      }).messages;
  }

  async invoke<T>(req: InvokeRequest<T>): Promise<InvokeResult<T>> {
    const hashes = callHashes({
      provider: this.id,
      modelId: this.modelId,
      systemPromptId: req.systemPromptId,
      input: req.input,
    });

    const template = this.#prompts.get(req.systemPromptId);
    if (template === undefined) {
      this.failures.push({
        code: "BAD_REQUEST",
        message: `No prompt is registered for ${req.systemPromptId}.`,
      });
      return { value: null, meta: this.#meta(hashes, 0, "SCHEMA_REJECT", "") };
    }

    const started = Date.now();
    let parsed;
    try {
      parsed = await this.#messages.parse({
        model: this.modelId,
        max_tokens: this.#maxTokens,
        system: template.system,
        messages: [{ role: "user", content: template.user(req.input) }],
        // `§6.5`: *"`messages.parse()` and `zodOutputFormat`"*. Schema-constrained
        // output is boundary 2 check 1 applied by the provider for its own
        // benefit; `adjudicate()` applies it again at the boundary.
        output_config: { format: zodOutputFormat(req.schema as ZodType) },
      });
    } catch (error) {
      this.failures.push(failureFor(error));
      if (isResponseShapeFailure(error)) {
        // A response arrived and could not be read. Reported as a schema
        // reject, exactly like `parsed_output === null` below, so the surface
        // says "the model's answer was discarded" rather than "the provider is
        // down" — two different things to tell an analyst.
        return { value: null, meta: this.#meta(hashes, Date.now() - started, "SCHEMA_REJECT", "") };
      }
      // §12: "provider unreachable / rate-limited -> retry with backoff, then
      // fall back". Thrown, so `adjudicate` runs that table rather than this
      // class deciding what a failed call means.
      throw error;
    }
    const latency = Date.now() - started;

    const value = parsed.parsed_output as T | null;
    if (value === null) {
      // `§12`: *"Never coerce or repair a malformed financial-adjacent
      // response."* Reported, discarded, not patched.
      this.failures.push({
        code: "MALFORMED_RESPONSE",
        message: "The provider's response did not match the requested schema.",
      });
      return { value: null, meta: this.#meta(hashes, latency, "SCHEMA_REJECT", "", parsed.usage) };
    }

    return {
      value,
      meta: this.#meta(hashes, latency, null, rawResponseHash(value), parsed.usage),
    };
  }

  #meta(
    hashes: { readonly cache_key: string },
    latencyMs: number,
    failure: LlmCallMeta["failure"],
    responseHash: string,
    usage?: { readonly input_tokens: number | null; readonly output_tokens: number },
  ): LlmCallMeta {
    return {
      provider: this.id,
      model_id: this.modelId,
      requires_network: true,
      cache_key: hashes.cache_key,
      // A live call is not served from `fixtures/llm-cache/`.
      cache_hit: false,
      raw_response_hash: responseHash,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      latency_ms: latencyMs,
      failure,
    };
  }
}
