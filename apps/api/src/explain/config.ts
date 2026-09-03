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
 * **But a default is only safe while it is legible.** Because this default
 * exists, a server whose environment never arrived is indistinguishable, from
 * the outside, from a server deliberately set to `anthropic` — and it will ask
 * its operator for `ANTHROPIC_API_KEY` while their `.env` plainly says `gemini`.
 * That is not hypothetical: it is what a `dev` script missing `--env-file`
 * produced, and the failure message was the only place it could have been seen.
 * So every failure this module returns states whether the provider was selected
 * or defaulted to, and `main.ts` prints the resolved provider once at startup.
 * Neither prints a credential.
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

/**
 * The `MISSING_CREDENTIAL` failure, naming the provider **and** its variable.
 *
 * It names the provider because this message is read by an operator looking at
 * their own `.env`, and the two facts they need are which provider this process
 * actually selected and which variable that provider reads. A message that named
 * only the variable was ambiguous in the one case where the ambiguity mattered: a
 * process whose environment never arrived reports the DEFAULT provider's variable,
 * and an operator who had configured a different one reads that as the server
 * ignoring their configuration rather than as never having received it.
 *
 * `defaulted` is that case, stated. When `ASSAY_EXPLAIN_PROVIDER` is unset the
 * message says so, so the sentence on screen distinguishes "you selected this
 * provider and its key is missing" from "nothing selected a provider here".
 */
function missingCredential(
  provider: ExplainProviderId,
  variable: string,
  defaulted: boolean,
): ExplainFailure {
  const selection = defaulted
    ? `ASSAY_EXPLAIN_PROVIDER is not set in this server process, so the explanation ` +
      `provider defaulted to ${provider}`
    : `The configured explanation provider is ${provider}`;
  return {
    code: "MISSING_CREDENTIAL",
    message:
      `${selection}, and no credential for it is configured on the server. Set ` +
      `${variable} in the API process environment to enable AI explanations. ASSAY's ` +
      `decision, certificate and ledger are unaffected.`,
  };
}

/**
 * A model id read from the environment, or a failure saying why it is not one.
 *
 * **Empty is absent; a paste is refused.** A value blank after trimming is treated
 * as unset and takes the default, which is what an operator who cleared a line
 * means. A value carrying an `=` or interior whitespace is refused outright,
 * because no model id this surface can call contains either and the overwhelmingly
 * likely cause is the variable NAME having been pasted along with the value —
 * `GEMINI_MODEL=GEMINI_MODEL=gemini-2.5-flash` from a shell line, which a shell
 * will happily export and Node will happily pass on.
 *
 * **Refused rather than repaired**, on `ARCHITECTURE.md §12`'s standing rule that a
 * malformed input is reported and discarded, never patched. Stripping the prefix
 * would silently call a model the operator can no longer see they named, and
 * falling back to the default would bill a model nobody chose while `§19`'s
 * `model_id` provenance recorded it as deliberate. Both are worse than one sentence
 * telling the operator to fix the line.
 *
 * **The value is never echoed.** `THREAT_MODEL.md §T11` keeps configuration out of
 * records an operator reads, and a variable holding the wrong thing is exactly the
 * one that might be holding a credential. The message describes the shape and names
 * the variable; it quotes nothing.
 */
type ModelIdResolution =
  | { readonly ok: true; readonly modelId: string }
  | { readonly ok: false; readonly failure: ExplainFailure };

function modelId(variable: string, raw: string | undefined, fallback: string): ModelIdResolution {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return { ok: true, modelId: fallback };
  if (!/[\s=]/.test(trimmed)) return { ok: true, modelId: trimmed };
  return {
    ok: false,
    failure: {
      code: "INVALID_MODEL_ID",
      message:
        `${variable} is not a model id: its value contains an "=" or a space. That ` +
        `usually means the variable name was pasted along with the value. Set it to ` +
        `the bare id — for example ${fallback} — or unset it to use that default. ` +
        `ASSAY's decision, certificate and ledger are unaffected.`,
    },
  };
}

/**
 * Build the configured provider, or say why there isn't one.
 *
 * `env` is a parameter so a test can drive every branch without mutating the
 * process, and it defaults to `process.env` so production has no second path.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  const selected = env["ASSAY_EXPLAIN_PROVIDER"];
  // Whether this process was TOLD which provider to use, or fell to the code
  // default because its environment never carried the variable. The failure
  // messages below say which, so an unconfigured process is distinguishable from
  // a misconfigured one without anyone reading the server's environment.
  const defaulted = selected === undefined || selected.trim() === "";
  const id = defaulted ? DEFAULT_PROVIDER : selected.trim();
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
      return { ok: false, failure: missingCredential("gemini", "GEMINI_API_KEY", defaulted) };
    }
    const model = modelId("GEMINI_MODEL", env["GEMINI_MODEL"], DEFAULT_GEMINI_MODEL_ID);
    if (!model.ok) return { ok: false, failure: model.failure };
    return {
      ok: true,
      provider: new GeminiProvider({
        ...shared,
        apiKey,
        modelId: model.modelId,
        baseURL: baseUrl(env["GEMINI_BASE_URL"]),
      }),
    };
  }

  const apiKey = env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    return { ok: false, failure: missingCredential("anthropic", "ANTHROPIC_API_KEY", defaulted) };
  }
  const model = modelId("ASSAY_EXPLAIN_MODEL_ID", env["ASSAY_EXPLAIN_MODEL_ID"], DEFAULT_MODEL_ID);
  if (!model.ok) return { ok: false, failure: model.failure };
  return {
    ok: true,
    provider: new AnthropicProvider({
      ...shared,
      apiKey,
      modelId: model.modelId,
      baseURL: baseUrl(env["ANTHROPIC_BASE_URL"]),
    }),
  };
}
