import { R4_SYSTEM_PROMPT, R4_SYSTEM_PROMPT_ID, r4UserPrompt } from "./r4.js";
import type { ExplainFailure } from "./failure.js";
import { AnthropicProvider, type PromptTemplate } from "./provider.js";

/**
 * Provider configuration — **environment only, server only**.
 *
 * `THREAT_MODEL.md §T11` and the product requirement agree: the credential
 * lives in the process that opens the socket and nowhere else. It is never a
 * request field, never a response field, never a build-time constant, never
 * reachable from `apps/web`, and never interpolated into an error message. The
 * repository's `.gitignore` has excluded `.env` since the first commit and
 * `.env.example` already declares `ANTHROPIC_API_KEY` with an empty value.
 *
 * ```
 *   ASSAY_EXPLAIN_PROVIDER    anthropic (default)  -- §19's provider id
 *   ANTHROPIC_API_KEY         required for anthropic
 *   ASSAY_EXPLAIN_MODEL_ID    claude-opus-5 (default)
 *   ASSAY_EXPLAIN_MAX_TOKENS  2000 (default)
 *   ASSAY_EXPLAIN_TIMEOUT_MS  60000 (default)
 *   ANTHROPIC_BASE_URL        optional; the SDK's own transport override
 * ```
 *
 * **An absent credential is a reported state, not a crash.** `ARCHITECTURE.md
 * §12`'s standing requirement is that *"a finance close must not be blocked on
 * a third-party API"*, and this surface holds to it literally: with no key
 * configured every ASSAY route still answers, the certificate still renders,
 * and the explanation endpoint reports `MISSING_CREDENTIAL`. `§C` T0-11's clean
 * checkout runs exactly as before.
 */

/** `DATA_MODEL.md §19` provider ids this product surface can construct. */
const SUPPORTED = Object.freeze(["anthropic"] as const);

const DEFAULT_MODEL_ID = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;

/** The `§19` prompt registry this surface serves. `R4` is its one entry. */
export const EXPLAIN_PROMPTS: ReadonlyMap<string, PromptTemplate> = new Map([
  [
    R4_SYSTEM_PROMPT_ID,
    {
      system: R4_SYSTEM_PROMPT,
      user: (input) => r4UserPrompt(input as Parameters<typeof r4UserPrompt>[0]),
    } satisfies PromptTemplate,
  ],
]);

export type ProviderResolution =
  | { readonly ok: true; readonly provider: AnthropicProvider }
  | { readonly ok: false; readonly failure: ExplainFailure };

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Build the configured provider, or say why there isn't one.
 *
 * `env` is a parameter so a test can drive every branch without mutating the
 * process, and it defaults to `process.env` so production has no second path.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  const id = env["ASSAY_EXPLAIN_PROVIDER"] ?? "anthropic";
  if (!(SUPPORTED as readonly string[]).includes(id)) {
    return {
      ok: false,
      failure: {
        code: "UNSUPPORTED_PROVIDER",
        message:
          `ASSAY_EXPLAIN_PROVIDER names ${JSON.stringify(id)}. This surface builds ` +
          `${SUPPORTED.join(", ")}. The deterministic decision is unaffected.`,
      },
    };
  }

  const apiKey = env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    return {
      ok: false,
      failure: {
        code: "MISSING_CREDENTIAL",
        message:
          "No provider credential is configured on the server. Set ANTHROPIC_API_KEY in " +
          "the API process environment to enable AI explanations. ASSAY's decision, " +
          "certificate and ledger are unaffected.",
      },
    };
  }

  const baseURL = env["ANTHROPIC_BASE_URL"];
  return {
    ok: true,
    provider: new AnthropicProvider({
      apiKey,
      modelId: env["ASSAY_EXPLAIN_MODEL_ID"] ?? DEFAULT_MODEL_ID,
      prompts: EXPLAIN_PROMPTS,
      maxTokens: positiveInt(env["ASSAY_EXPLAIN_MAX_TOKENS"], DEFAULT_MAX_TOKENS),
      timeoutMs: positiveInt(env["ASSAY_EXPLAIN_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
      baseURL: baseURL === undefined || baseURL.trim() === "" ? undefined : baseURL,
    }),
  };
}
