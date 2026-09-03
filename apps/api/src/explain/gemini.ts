import {
  ApiError,
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Models,
} from "@google/genai";
import {
  callHashes,
  rawResponseHash,
  type InvokeRequest,
  type InvokeResult,
  type LlmCallMeta,
  type StructuredRoleInput,
} from "@assay/llm";
import { z, type ZodType } from "zod";

import type { ExplainFailure } from "./failure.js";
import type { ExplainProvider, PromptTemplate } from "./provider.js";

/**
 * `ARCHITECTURE.md §6.5`'s **`gemini`** provider — the fifth row, added at spec
 * 1.4.38 (register row `DATA_MODEL.md §22.2` M60).
 *
 * **Why a fifth id rather than the fourth one reused.** `§6.5` scopes
 * `openai-compatible` to *"any endpoint speaking the OpenAI chat-completions
 * schema with JSON-schema response format"*. `@google/genai` speaks Google's own
 * `generateContent` schema, so recording a native Google call under that id
 * would have made `DATA_MODEL.md §19`'s per-call provenance — the field that
 * exists so *"a report can always state exactly what produced each decision"* —
 * describe a transport that was never used. The union widened instead.
 *
 * **This class is a sibling of {@link AnthropicProvider}, not a replacement.**
 * The Anthropic implementation is untouched: same file, same interface, same
 * `§12` mapping, same tests. Which one a request reaches is one environment
 * variable read by `config.ts` on the server, and both reach the boundary
 * through `§6.5`'s single `invoke`.
 *
 * **It lives here for the reason the Anthropic one does.** `packages/llm`'s
 * discipline suite fails the build on a transport import, on a `process.env`
 * read and on a `providers/<network-id>.ts`; `apps/api` is `ARCHITECTURE.md §3`'s
 * one socket in the workspace, and the credential belongs with the socket. The
 * browser never holds it and `apps/web` never names it.
 *
 * **This provider verifies nothing.** `responseJsonSchema` constrains the
 * decode for its own convenience and `safeParse` below rejects a body that is
 * not the requested shape, but the value is passed on regardless of what it
 * says; `adjudicate()` re-applies schema, allowlist and grounding at the
 * boundary, because `§4` requires the response to be *"treated as adversarial"*
 * and a boundary cannot do that while taking the adversary's word for it.
 */

/** The transport this class needs: `§6.5`'s one call, nothing else. */
export type GeminiTransport = Pick<Models, "generateContent">;

export interface GeminiProviderOptions {
  /** The credential. Read from the environment by `config.ts`; never logged. */
  readonly apiKey: string;
  /** `GEMINI_MODEL`, or `config.ts`'s Flash default. */
  readonly modelId: string;
  /** Prompt text by `§19` `system_prompt_id`. A miss is a `BAD_REQUEST`. */
  readonly prompts: ReadonlyMap<string, PromptTemplate>;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  /**
   * Transport override, for pointing an end-to-end check at a local stand-in.
   *
   * Forwarded to the SDK's own `httpOptions.baseUrl`. It changes where the
   * request goes, never what is sent or how the response is checked.
   */
  readonly baseURL?: string | undefined;
  /** Injectable so a test can drive the class without a socket. */
  readonly client?: GeminiTransport | undefined;
}

/**
 * `req.schema`, as the Gemini API's `responseJsonSchema` wants it.
 *
 * `$schema` is stripped because the API rejects a top-level dialect keyword it
 * does not recognise, and keeping it would turn every call into a `400` that
 * looked like a prompt problem. Nothing else is rewritten: the `strictObject`'s
 * `additionalProperties: false` travels, so the transport is asked for the same
 * closed shape `checkSchema` will independently require.
 */
export function responseJsonSchema(schema: ZodType): unknown {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  const { ...rest } = json;
  delete rest["$schema"];
  return rest;
}

/** Whether a thrown error is the SDK reporting a request that never landed. */
function isTimeout(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * `ARCHITECTURE.md §12`'s failure table, over what `@google/genai` throws.
 *
 * The SDK models every HTTP failure as one `ApiError` carrying a status rather
 * than as the error subclasses `@anthropic-ai/sdk` exposes, so the split that
 * class makes with `instanceof` is made here on `status`. The **codes are the
 * same codes**: `failure.ts`'s union is one union for the whole surface, and a
 * UI that had to learn a second vocabulary per provider is a UI that will show
 * the wrong sentence.
 */
export function failureFor(error: unknown): ExplainFailure {
  if (isTimeout(error)) {
    return { code: "TIMEOUT", message: "The provider did not answer within the timeout." };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        code: "AUTHENTICATION",
        message: "The configured provider credential was rejected.",
      };
    }
    if (error.status === 429) {
      return { code: "RATE_LIMITED", message: "The provider rate-limited this request." };
    }
    if (error.status === 400) {
      return { code: "BAD_REQUEST", message: "The provider rejected the request as malformed." };
    }
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: `The provider returned an error status (${String(error.status)}).`,
    };
  }
  // A `fetch` that never reached a server throws a plain `TypeError`. There is
  // no response to have misread, so §12's unreachable row is the honest one.
  return { code: "PROVIDER_UNAVAILABLE", message: "The provider could not be reached." };
}

export class GeminiProvider implements ExplainProvider {
  /** `DATA_MODEL.md §19`'s five-member union, fifth member. */
  readonly id = "gemini" as const;
  readonly modelId: string;
  readonly requiresNetwork = true;
  readonly meteredCost = true;

  /**
   * Every attempt that did not produce a value, in order.
   *
   * `LlmCallMeta.failure` is `§6.5`'s closed four-member union and cannot carry
   * "rate limited" or "the credential was rejected" — distinctions a product
   * surface has to be able to show a user. They are recorded here instead of
   * widening the interface. One provider instance serves one request.
   */
  readonly failures: ExplainFailure[] = [];

  readonly #models: GeminiTransport;
  readonly #prompts: ReadonlyMap<string, PromptTemplate>;
  readonly #maxTokens: number;
  readonly #timeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    this.modelId = options.modelId;
    this.#prompts = options.prompts;
    this.#maxTokens = options.maxTokens;
    this.#timeoutMs = options.timeoutMs;
    this.#models =
      options.client ??
      new GoogleGenAI({
        apiKey: options.apiKey,
        httpOptions: {
          timeout: options.timeoutMs,
          ...(options.baseURL === undefined ? {} : { baseUrl: options.baseURL }),
        },
      }).models;
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
    let response: GenerateContentResponse;
    try {
      response = await this.#models.generateContent(this.#request(template, req));
    } catch (error) {
      this.failures.push(failureFor(error));
      // §12: "provider unreachable / rate-limited -> retry with backoff, then
      // fall back". Thrown, so `adjudicate` runs that table rather than this
      // class deciding what a failed call means.
      throw error;
    }
    const latency = Date.now() - started;

    const usage = {
      input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };

    const value = this.#decode(req.schema, response.text);
    if (value === null) {
      // `§12`: *"Never coerce or repair a malformed financial-adjacent
      // response."* Reported, discarded, not patched. This is the schema-reject
      // row and not the unreachable one: the call landed and came back, and
      // what failed was the shape — two different things to tell an analyst.
      this.failures.push({
        code: "MALFORMED_RESPONSE",
        message: "The provider's response did not match the requested schema.",
      });
      return { value: null, meta: this.#meta(hashes, latency, "SCHEMA_REJECT", "", usage) };
    }

    return {
      value,
      meta: this.#meta(hashes, latency, null, rawResponseHash(value), usage),
    };
  }

  /** One `generateContent` request, from one role call. */
  #request(template: PromptTemplate, req: InvokeRequest<unknown>): GenerateContentParameters {
    return {
      model: this.modelId,
      contents: template.user(req.input as StructuredRoleInput),
      config: {
        // The role's standing instruction is the system turn, so `§19`'s
        // `system_prompt_hash` names text that actually travelled as one.
        systemInstruction: template.system,
        maxOutputTokens: this.#maxTokens,
        // Schema-constrained output is boundary 2 check 1 applied by the
        // provider for its own benefit; `adjudicate()` applies it again.
        responseMimeType: "application/json",
        responseJsonSchema: responseJsonSchema(req.schema as ZodType),
        // The SDK's request timeout covers the socket; this covers a stream the
        // socket keeps open. Both are the one configured bound.
        abortSignal: AbortSignal.timeout(this.#timeoutMs),
      },
    };
  }

  /** The response body as `T`, or `null` if it is not that shape. */
  #decode<T>(schema: InvokeRequest<T>["schema"], text: string | undefined): T | null {
    if (text === undefined || text.trim() === "") return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON at all — a refusal sentence, a truncated body, a fenced block.
      // Discarded whole, never salvaged.
      return null;
    }
    const checked = schema.safeParse(parsed);
    return checked.success ? checked.data : null;
  }

  #meta(
    hashes: { readonly cache_key: string },
    latencyMs: number,
    failure: LlmCallMeta["failure"],
    responseHash: string,
    usage?: { readonly input_tokens: number; readonly output_tokens: number },
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
