import { R4_SYSTEM_PROMPT, R4_SYSTEM_PROMPT_ID, r4UserPrompt } from "./r4.js";
import type { ExplainFailure } from "./failure.js";
import { GeminiProvider } from "./gemini.js";
import { AnthropicProvider, type ExplainProvider, type PromptTemplate } from "./provider.js";

/**
 * Provider configuration — **environment only, server only**.
 *
 * `THREAT_MODEL.md §T11` and the product requirement agree: the credential
 * lives in the process that opens the socket and nowhere else. It is never a
 * request field, never a response field, never a build-time constant, never
 * reachable from `apps/web`, and never interpolated into an error message. The
 * repository's `.gitignore` has excluded `.env` since the first commit and
 * `.env.example` declares every key below with an empty value.
 *
 * ```
 *   ASSAY_EXPLAIN_PROVIDER    anthropic (default) | gemini  -- §19's provider id
 *   ASSAY_EXPLAIN_MAX_TOKENS  2000 (default)
 *   ASSAY_EXPLAIN_TIMEOUT_MS  60000 (default)
 *
 *   anthropic   ANTHROPIC_API_KEY       required
 *               ASSAY_EXPLAIN_MODEL_ID  claude-opus-5 (default)
 *               ANTHROPIC_BASE_URL      optional; the SDK's own override
 *
 *   gemini      GEMINI_API_KEY          required
 *               GEMINI_MODEL            gemini-2.5-flash (default)
 *               GEMINI_BASE_URL         optional; the SDK's own override
 * ```
 *
 * **The default stays `anthropic`, and that is deliberate.** Selecting a
 * provider is an operator's decision about which account gets billed, and a
 * default that changed under an operator who upgraded would move their spend
 * without their saying so. The demo path is one line — `ASSAY_EXPLAIN_PROVIDER=
 * gemini` in the API process environment, which is what `.env.example` shows —
 * and it is explicit at the point where the choice is made.
 *
 * **Each provider reads only its own credential.** `ANTHROPIC_API_KEY` is not
 * consulted when `gemini` is selected and `GEMINI_API_KEY` is not consulted when
 * `anthropic` is: a surface that fell through to whichever key happened to be
 * present would send this run's evidence to a vendor nobody named.
 *
 * **An absent credential is a reported state, not a crash.** `ARCHITECTURE.md
 * §12`'s standing requirement is that *"a finance close must not be blocked on
 * a third-party API"*, and this surface holds to it literally: with no key
 * configured every ASSAY route still answers, the certificate still renders,
 * and the explanation endpoint reports `MISSING_CREDENTIAL` beside the
 * deterministic evidence summary `fallback.ts` builds. `§C` T0-11's clean
 * checkout runs exactly as before.
 */

/** `DATA_MODEL.md §19` provider ids this product surface can construct. */
const SUPPORTED = Object.freeze(["anthropic", "gemini"] as const);

/** One of the ids {@link resolveProvider} will build. */
export type ExplainProviderId = (typeof SUPPORTED)[number];

const DEFAULT_PROVIDER: ExplainProviderId = "anthropic";
const DEFAULT_MODEL_ID = "claude-opus-5";

/**
 * `GEMINI_MODEL`'s default.
 *
 * A Flash-family model, because this surface's whole shape suits one: `R4` is a
 * single short call over an envelope the server already assembled, with no tool
 * use and no multi-turn state, and the answer is checked by `§4` boundary 2
 * rather than trusted — so what a larger model would buy is style, at a cost the
 * demo is explicitly avoiding. Overridable by environment for exactly that
 * reason: the model id is an operational choice, not an architectural one.
 */
const DEFAULT_GEMINI_MODEL_ID = "gemini-2.5-flash";

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
  | { readonly ok: true; readonly provider: ExplainProvider }
  | { readonly ok: false; readonly failure: ExplainFailure };

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** An optional transport override, empty-string-normalised to absent. */
function baseUrl(raw: string | undefined): string | undefined {
  return raw === undefined || raw.trim() === "" ? undefined : raw;
}

/** The `MISSING_CREDENTIAL` failure, naming the variable the operator must set. */
function missingCredential(variable: string): ExplainFailure {
  return {
    code: "MISSING_CREDENTIAL",
    message:
      `No provider credential is configured on the server. Set ${variable} in the API ` +
      `process environment to enable AI explanations. ASSAY's decision, certificate and ` +
      `ledger are unaffected.`,
  };
}

/**
 * Build the configured provider, or say why there isn't one.
 *
 * `env` is a parameter so a test can drive every branch without mutating the
 * process, and it defaults to `process.env` so production has no second path.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  const id = env["ASSAY_EXPLAIN_PROVIDER"] ?? DEFAULT_PROVIDER;
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

  const shared = {
    prompts: EXPLAIN_PROMPTS,
    maxTokens: positiveInt(env["ASSAY_EXPLAIN_MAX_TOKENS"], DEFAULT_MAX_TOKENS),
    timeoutMs: positiveInt(env["ASSAY_EXPLAIN_TIMEOUT_MS"], DEFAULT_TIMEOUT_MS),
  } as const;

  if (id === "gemini") {
    const apiKey = env["GEMINI_API_KEY"];
    if (apiKey === undefined || apiKey.trim() === "") {
      return { ok: false, failure: missingCredential("GEMINI_API_KEY") };
    }
    return {
      ok: true,
      provider: new GeminiProvider({
        ...shared,
        apiKey,
        modelId: env["GEMINI_MODEL"] ?? DEFAULT_GEMINI_MODEL_ID,
        baseURL: baseUrl(env["GEMINI_BASE_URL"]),
      }),
    };
  }

  const apiKey = env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    return { ok: false, failure: missingCredential("ANTHROPIC_API_KEY") };
  }
  return {
    ok: true,
    provider: new AnthropicProvider({
      ...shared,
      apiKey,
      modelId: env["ASSAY_EXPLAIN_MODEL_ID"] ?? DEFAULT_MODEL_ID,
      baseURL: baseUrl(env["ANTHROPIC_BASE_URL"]),
    }),
  };
}
