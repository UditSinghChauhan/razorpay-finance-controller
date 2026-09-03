import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ApiError } from "@google/genai";
import { assertNoNumericField } from "@assay/llm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EXPLAIN_PROMPTS,
  FALLBACK_LABEL,
  GeminiProvider,
  R4OutputSchema,
  R4_SYSTEM_PROMPT,
  R4_SYSTEM_PROMPT_ID,
  createApp,
  evidenceSummary,
  explainEvidence,
  groundR4,
  resolveProvider,
  responseJsonSchema,
  RunRegistry,
  type GeminiTransport,
  type StoredRun,
} from "../src/index.js";

/**
 * The `gemini` provider — `ARCHITECTURE.md §6.5`'s fifth row, over
 * `demo/demo-500`.
 *
 * **No test here reaches a network and none needs a credential.** Every call
 * goes through the real {@link GeminiProvider} with its **transport** injected
 * at `Models.generateContent`, which is the SDK's own boundary — so what is
 * exercised is the shipped provider (its request shape, its `§12` error
 * mapping, its `§19` call meta) and only the socket is a stand-in.
 * `DECISION_BRIEF.md §C` T0-11 requires the repository to run from a clean
 * checkout with no API key; a suite that called a live model would end that, and
 * a suite that mocked the provider *interface* would prove nothing about the
 * provider that ships.
 *
 * **The Anthropic provider is not re-tested here.** `explain.test.ts` covers it
 * and is unchanged; this file's job is the new row and the two things that are
 * new with it — server-side provider selection, and the deterministic fallback.
 *
 * **The fixture measures nothing.** `demo/demo-500` lives outside `bench/`, has
 * no ground truth and is never scored (`demo/README.md`).
 */

const SENTINEL_KEY = "AIzaSy-not-a-real-key-000000000000000";
const SENTINEL_ANTHROPIC_KEY = "sk-ant-not-a-real-key-0000000000";

interface FallbackBody {
  readonly label: string;
  readonly generated_by: string;
  readonly summary: string;
  readonly points: readonly string[];
  readonly risk: string;
  readonly next_step: string;
}

interface ExplainBody {
  readonly run_id: string;
  readonly decision_id: string;
  readonly status: "ok" | "rejected" | "unavailable";
  readonly explanation: {
    readonly summary: string;
    readonly why: readonly string[];
    readonly risk: string;
    readonly next_step: string;
  } | null;
  readonly fallback: FallbackBody | null;
  readonly provider: {
    readonly provider: string;
    readonly model_id: string;
    readonly requires_network: boolean;
    readonly attempts: number;
  } | null;
  readonly grounding: {
    readonly deterministic_state: string;
    readonly certificate_used: boolean;
    readonly decision_authority: string;
    readonly checks: { schema: string; allowlist: string; numerals: string };
    readonly evidence_item_count: number;
    readonly system_prompt_id: string | null;
  };
  readonly failure: { readonly code: string; readonly message: string } | null;
}

/** One recorded call to the transport the provider was given. */
interface Recorded {
  readonly system: string;
  readonly user: string;
  readonly model: string;
  readonly config: Record<string, unknown>;
}

/**
 * A transport stand-in at the SDK's own `generateContent`.
 *
 * `answer` is returned as the model's body text: a string is sent verbatim (so
 * a malformed body can be exercised), anything else is JSON-serialised. An
 * `Error` is thrown instead, which is what the SDK does.
 */
function transport(answer: unknown, recorded: Recorded[]): GeminiTransport {
  return {
    generateContent: ((params: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => {
      recorded.push({
        model: params.model,
        user: params.contents,
        system: String(params.config?.["systemInstruction"] ?? ""),
        config: params.config ?? {},
      });
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve({
        text: typeof answer === "string" ? answer : JSON.stringify(answer),
        usageMetadata: { promptTokenCount: 1400, candidatesTokenCount: 180 },
      });
    }) as never,
  };
}

function providerWith(answer: unknown, recorded: Recorded[] = []): GeminiProvider {
  return new GeminiProvider({
    apiKey: SENTINEL_KEY,
    modelId: "gemini-2.5-flash",
    prompts: EXPLAIN_PROMPTS,
    maxTokens: 2000,
    timeoutMs: 1000,
    client: transport(answer, recorded),
  });
}

/** A well-formed, fully grounded answer for the demo abstention. */
const GOOD = {
  summary:
    "ASSAY abstained: two allocations remain materially indistinguishable under the " +
    "available evidence.",
  why: [
    "Both candidate allocations satisfy every shared hard constraint.",
    "The evidence score gap is inside the pre-registered epsilon, so neither candidate wins.",
  ],
  risk: "The settlement stays in Suspense and the period cannot close on it.",
  next_step: "Obtain a bank-side reference that names one allocation and re-run.",
};

const registry = new RunRegistry();
let stored: StoredRun;
let decisionId: string;

async function explainWith(answer: unknown, recorded: Recorded[] = []): Promise<ExplainBody> {
  const app = createApp({ registry, explainProvider: () => providerWith(answer, recorded) });
  const response = await app.request(
    `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
    { method: "POST" },
  );
  return (await response.json()) as ExplainBody;
}

beforeAll(async () => {
  stored = await registry.create("demo-500");
  const abstained = stored.result.evidence.decisions.find(
    (d) => d.state === "ABSTAINED" && d.certificate !== null && d.suspense_key !== null,
  );
  expect(abstained, "the demo fixture must produce the ambiguity case").toBeDefined();
  decisionId = abstained?.decision_id as string;
}, 60_000);

// ---------------------------------------------------------------------------
// 1. A successful Gemini explanation.
// ---------------------------------------------------------------------------

describe("a successful gemini explanation", () => {
  it("answers for the pair it was asked about, naming gemini as the provider", async () => {
    const body = await explainWith(GOOD);
    expect(body.status).toBe("ok");
    expect(body.explanation?.summary).toContain("abstained");
    expect(body.provider?.provider).toBe("gemini");
    expect(body.provider?.model_id).toBe("gemini-2.5-flash");
    expect(body.provider?.requires_network).toBe(true);
    expect(body.grounding.checks).toEqual({
      schema: "pass",
      allowlist: "pass",
      numerals: "pass",
    });
    // A model answered, so there is no deterministic summary beside it.
    expect(body.fallback).toBeNull();
  });

  it("sends the R4 envelope as the user turn and the role prompt as the system turn", async () => {
    const seen: Recorded[] = [];
    await explainWith(GOOD, seen);
    const call = seen.at(0);
    expect(call?.system).toBe(R4_SYSTEM_PROMPT);
    expect(call?.user).toContain("DECISION EVIDENCE (verified, read from the sealed run");
    expect(call?.model).toBe("gemini-2.5-flash");

    // The same verified figures the Anthropic path sends, from the same
    // envelope: the evidence builder is shared and not re-implemented here.
    const decision = stored.decisionsById.get(decisionId);
    expect(call?.user).toContain(String(decision?.value_paise));
    expect(call?.user).toContain(String(decision?.certificate?.materiality_paise));
    expect(call?.user).toContain(String(decision?.certificate?.epsilon_bps));
  });

  it("constrains the decode to R4's schema, with no dialect keyword the API rejects", () => {
    const schema = responseJsonSchema(R4OutputSchema) as Record<string, unknown>;
    expect(schema["$schema"]).toBeUndefined();
    expect(schema["type"]).toBe("object");
    expect(schema["additionalProperties"]).toBe(false);
    expect(Object.keys(schema["properties"] as object).sort()).toEqual([
      "next_step",
      "risk",
      "summary",
      "why",
    ]);
    // §L.1 rule 2 holds over the schema the transport is actually handed.
    expect(() => {
      assertNoNumericField(R4OutputSchema);
    }).not.toThrow();
  });

  it("records §19 call meta from the provider's own usage figures", async () => {
    const provider = providerWith(GOOD);
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const evidence = explainEvidence(stored, decision);
    const result = await provider.invoke({
      role: "R4",
      schema: R4OutputSchema,
      systemPromptId: R4_SYSTEM_PROMPT_ID,
      input: evidence.input,
      idAllowlist: evidence.idAllowlist,
    });
    expect(result.value).not.toBeNull();
    expect(result.meta.provider).toBe("gemini");
    expect(result.meta.requires_network).toBe(true);
    expect(result.meta.cache_hit).toBe(false);
    expect(result.meta.input_tokens).toBe(1400);
    expect(result.meta.output_tokens).toBe(180);
    expect(result.meta.failure).toBeNull();
    expect(result.meta.cache_key).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 2. A malformed response.
// ---------------------------------------------------------------------------

describe("a malformed gemini response is discarded, never repaired", () => {
  const cases: readonly [string, unknown][] = [
    ["prose instead of JSON", "I cannot help with that request."],
    ["a fenced block", "```json\n{\"summary\":\"x\"}\n```"],
    ["an empty body", ""],
    ["valid JSON of the wrong shape", { verdict: "RECONCILED" }],
    ["a missing required field", { summary: "x", risk: "y", next_step: "z" }],
    ["an extra field the strictObject forbids", { ...GOOD, state: "RECONCILED" }],
    ["a one-item why array", { ...GOOD, why: ["only one point"] }],
  ];

  for (const [label, answer] of cases) {
    it(`reports ${label} as a discarded response, not as an outage`, async () => {
      const body = await explainWith(answer);
      expect(body.status).toBe("rejected");
      expect(body.explanation).toBeNull();
      expect(body.failure?.code).toBe("MALFORMED_RESPONSE");
      expect(body.grounding.checks.schema).toBe("fail");
      // The decision is untouched in every one of these branches.
      expect(body.grounding.deterministic_state).toBe("ABSTAINED");
    });
  }

  it("returns a SCHEMA_REJECT meta rather than throwing", async () => {
    const provider = providerWith("not json at all");
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const evidence = explainEvidence(stored, decision);
    const result = await provider.invoke({
      role: "R4",
      schema: R4OutputSchema,
      systemPromptId: R4_SYSTEM_PROMPT_ID,
      input: evidence.input,
      idAllowlist: evidence.idAllowlist,
    });
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("SCHEMA_REJECT");
    expect(result.meta.raw_response_hash).toBe("");
    expect(provider.failures.at(-1)?.code).toBe("MALFORMED_RESPONSE");
  });

  it("still rejects an ungrounded figure and an unknown identifier", async () => {
    const invented = await explainWith({
      ...GOOD,
      risk: "The exposure is ₹9,99,99,999 against the settlement.",
    });
    expect(invented.status).toBe("rejected");
    expect(invented.failure?.code).toBe("UNGROUNDED_NUMERAL");
    expect(invented.grounding.checks.numerals).toBe("fail");

    const stray = await explainWith({
      ...GOOD,
      next_step: "Reconcile against pay_NOTINEVIDENCE.",
    });
    expect(stray.status).toBe("rejected");
    expect(stray.failure?.code).toBe("UNKNOWN_ENTITY_ID");
    expect(stray.grounding.checks.allowlist).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// 3. A missing credential, and 4. an unavailable provider.
// ---------------------------------------------------------------------------

describe("configuration is environment-only, and its absence is reported", () => {
  it("names GEMINI_API_KEY when gemini is selected and has no credential", () => {
    const resolved = resolveProvider({ ASSAY_EXPLAIN_PROVIDER: "gemini" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("MISSING_CREDENTIAL");
    expect(resolved.failure.message).toContain("GEMINI_API_KEY");
    // Never the other vendor's variable: the operator is told what THEY set.
    expect(resolved.failure.message).not.toContain("ANTHROPIC_API_KEY");
  });

  it("does not fall through to another vendor's key", () => {
    // An Anthropic key present while gemini is selected must NOT produce a
    // provider: a surface that used whichever credential happened to be set
    // would send this run's evidence to a vendor nobody named.
    const resolved = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      ANTHROPIC_API_KEY: SENTINEL_ANTHROPIC_KEY,
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("MISSING_CREDENTIAL");
  });

  it("builds the gemini provider from GEMINI_API_KEY, with the Flash default", () => {
    const resolved = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      GEMINI_API_KEY: SENTINEL_KEY,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.provider.id).toBe("gemini");
    expect(resolved.provider.modelId).toBe("gemini-2.5-flash");
    expect(resolved.provider.requiresNetwork).toBe(true);
    expect(resolved.provider.meteredCost).toBe(true);
  });

  it("takes the model id from GEMINI_MODEL when one is set", () => {
    const resolved = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      GEMINI_API_KEY: SENTINEL_KEY,
      GEMINI_MODEL: "gemini-2.0-flash",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.provider.modelId).toBe("gemini-2.0-flash");
  });

  it("leaves the anthropic path exactly as it was", () => {
    // The default is unchanged, so an existing deployment that set only
    // ANTHROPIC_API_KEY keeps the provider it had.
    const resolved = resolveProvider({ ANTHROPIC_API_KEY: SENTINEL_ANTHROPIC_KEY });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.provider.id).toBe("anthropic");
    expect(resolved.provider.modelId).toBe("claude-opus-5");

    const explicit = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: SENTINEL_ANTHROPIC_KEY,
      ASSAY_EXPLAIN_MODEL_ID: "claude-sonnet-5",
    });
    expect(explicit.ok).toBe(true);
    if (!explicit.ok) return;
    expect(explicit.provider.id).toBe("anthropic");
    expect(explicit.provider.modelId).toBe("claude-sonnet-5");
  });

  /**
   * The regression this block exists for.
   *
   * `apps/api`'s `dev` script started the server with no `--env-file`, so the
   * process saw no `ASSAY_EXPLAIN_PROVIDER` at all, fell to the code default, and
   * asked its operator for `ANTHROPIC_API_KEY` while their `.env` said `gemini`.
   * The script is fixed; these assertions cover the half of the fault that was in
   * this module — a message that could not tell the operator which of the two
   * things had happened.
   */
  it("says the provider was DEFAULTED when ASSAY_EXPLAIN_PROVIDER is unset", () => {
    const resolved = resolveProvider({});
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("MISSING_CREDENTIAL");
    // The provider is named, so the sentence cannot be read as "your gemini
    // configuration was ignored" when the truth is "no configuration arrived".
    expect(resolved.failure.message).toContain("anthropic");
    expect(resolved.failure.message).toContain("ASSAY_EXPLAIN_PROVIDER is not set");
    expect(resolved.failure.message).toContain("ANTHROPIC_API_KEY");
  });

  it("says the provider was SELECTED when the variable is set", () => {
    const resolved = resolveProvider({ ASSAY_EXPLAIN_PROVIDER: "gemini" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.message).toContain("The configured explanation provider is gemini");
    expect(resolved.failure.message).not.toContain("defaulted");
  });

  /**
   * The second reported symptom: a model id arriving as `NAME=value`.
   *
   * Node's `--env-file` does not overwrite a variable already exported in the
   * shell, so a one-off `GEMINI_MODEL=GEMINI_MODEL=...` on a command line wins over
   * a correct `.env` and travels to the provider as the model name. It is refused
   * here rather than repaired: stripping the prefix would call a model the operator
   * can no longer see they named, and `§19` would record that as deliberate.
   */
  it("refuses a model id that carries its own variable name", () => {
    for (const bad of [
      "GEMINI_MODEL=gemini-2.5-flash",
      "gemini-2.5-flash extra",
      "=gemini-2.5-flash",
    ]) {
      const resolved = resolveProvider({
        ASSAY_EXPLAIN_PROVIDER: "gemini",
        GEMINI_API_KEY: SENTINEL_KEY,
        GEMINI_MODEL: bad,
      });
      expect(resolved.ok, bad).toBe(false);
      if (resolved.ok) return;
      expect(resolved.failure.code).toBe("INVALID_MODEL_ID");
      expect(resolved.failure.message).toContain("GEMINI_MODEL");
      // §T11: the message describes the shape and quotes no configuration, because
      // the variable holding the wrong thing may be holding a credential.
      expect(resolved.failure.message).not.toContain(bad);
    }
  });

  it("applies the same refusal to the anthropic model variable", () => {
    const resolved = resolveProvider({
      ANTHROPIC_API_KEY: SENTINEL_ANTHROPIC_KEY,
      ASSAY_EXPLAIN_MODEL_ID: "ASSAY_EXPLAIN_MODEL_ID=claude-opus-5",
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("INVALID_MODEL_ID");
    expect(resolved.failure.message).toContain("ASSAY_EXPLAIN_MODEL_ID");
  });

  it("trims a padded model id and treats a blank one as unset", () => {
    const padded = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      GEMINI_API_KEY: SENTINEL_KEY,
      GEMINI_MODEL: "  gemini-3.1-flash-lite  ",
    });
    expect(padded.ok).toBe(true);
    if (!padded.ok) return;
    expect(padded.provider.modelId).toBe("gemini-3.1-flash-lite");

    const blank = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      GEMINI_API_KEY: SENTINEL_KEY,
      GEMINI_MODEL: "   ",
    });
    expect(blank.ok).toBe(true);
    if (!blank.ok) return;
    expect(blank.provider.modelId).toBe("gemini-2.5-flash");
  });

  /**
   * The demo path, resolved exactly as the running server resolves it.
   *
   * `model_id` is what `§19` records and what the panel prints, so the id the
   * environment names must reach the provider character-for-character.
   */
  it("carries GEMINI_MODEL to the provider unchanged", () => {
    const resolved = resolveProvider({
      ASSAY_EXPLAIN_PROVIDER: "gemini",
      GEMINI_API_KEY: SENTINEL_KEY,
      GEMINI_MODEL: "gemini-3.1-flash-lite",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.provider.id).toBe("gemini");
    expect(resolved.provider.modelId).toBe("gemini-3.1-flash-lite");
  });

  it("refuses a provider this surface does not build", () => {
    for (const id of ["openai-compatible", "offline", "replay", "google"]) {
      const resolved = resolveProvider({
        ASSAY_EXPLAIN_PROVIDER: id,
        GEMINI_API_KEY: SENTINEL_KEY,
      });
      expect(resolved.ok, id).toBe(false);
      if (resolved.ok) return;
      expect(resolved.failure.code).toBe("UNSUPPORTED_PROVIDER");
    }
  });
});

/**
 * The environment has to REACH the process, and that is a wiring fact.
 *
 * Every assertion above drives `resolveProvider` with an explicit `env` object,
 * which is right for the branches and blind to the one thing that actually broke
 * the demo: the server was started by a script that loaded no `.env`, so the real
 * `process.env` reaching `resolveProvider()` was empty and every correct branch
 * above ran on nothing. No unit test could have failed. This one reads the launch
 * command itself, which is where the fault was.
 */
describe("the launch command loads the environment it resolves from", () => {
  const ROOT_DIR = join(import.meta.dirname, "..", "..", "..");
  const readJson = (...parts: string[]): Record<string, unknown> =>
    JSON.parse(readFileSync(join(ROOT_DIR, ...parts), "utf8")) as Record<string, unknown>;

  it("starts apps/api with the repository .env", () => {
    const scripts = readJson("apps", "api", "package.json")["scripts"] as Record<string, string>;
    const dev = scripts["dev"] ?? "";
    expect(dev).toContain("bin/assay-api.mjs");
    // `if-exists`, not `--env-file`: §C T0-11 requires a clean checkout with no
    // .env to start normally, and a hard --env-file makes an absent file fatal.
    expect(dev).toContain("--env-file-if-exists=../../.env");
  });

  it("has exactly one definition of how the server starts", () => {
    // The regression was two: a root `dev:api` that loaded .env and a package
    // `dev` that did not, with `pnpm dev` reaching the second one. A second
    // literal `node ... assay-api.mjs` anywhere is that fault returning.
    const root = readJson("package.json")["scripts"] as Record<string, string>;
    for (const [name, command] of Object.entries(root)) {
      if (!command.includes("assay-api.mjs")) continue;
      expect(command, `root script ${name} restates the launch command`).toContain(
        "--env-file",
      );
    }
    expect(root["dev"]).toContain("--filter @assay/api dev");
    expect(root["dev:api"]).toContain("--filter @assay/api dev");
  });
});

describe("ARCHITECTURE.md §12's failure table, over the real gemini provider", () => {
  const cases: readonly [string, Error, string][] = [
    ["unreachable", new TypeError("fetch failed"), "PROVIDER_UNAVAILABLE"],
    [
      "timed out",
      Object.assign(new Error("aborted"), { name: "AbortError" }),
      "TIMEOUT",
    ],
    [
      "rate limited",
      new ApiError({ message: "quota exceeded", status: 429 }),
      "RATE_LIMITED",
    ],
    [
      "credential rejected",
      new ApiError({ message: "API key not valid", status: 401 }),
      "AUTHENTICATION",
    ],
    [
      "credential forbidden",
      new ApiError({ message: "permission denied", status: 403 }),
      "AUTHENTICATION",
    ],
    [
      "request refused",
      new ApiError({ message: "invalid argument", status: 400 }),
      "BAD_REQUEST",
    ],
    [
      "server error",
      new ApiError({ message: "internal", status: 503 }),
      "PROVIDER_UNAVAILABLE",
    ],
  ];

  for (const [label, error, code] of cases) {
    it(`reports ${label} without touching the decision`, async () => {
      const app = createApp({ registry, explainProvider: () => providerWith(error) });
      const response = await app.request(
        `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
        { method: "POST" },
      );
      const body = (await response.json()) as ExplainBody;
      expect(response.status).toBe(503);
      expect(body.status).toBe("unavailable");
      expect(body.explanation).toBeNull();
      expect(body.failure?.code).toBe(code);
      expect(body.grounding.deterministic_state).toBe("ABSTAINED");
      expect(body.grounding.certificate_used).toBe(true);
      // Degradation is visible AND survivable: §12's two halves together.
      expect(body.fallback?.label).toBe(FALLBACK_LABEL);
    });
  }

  it("retries once and then stops, per §12", async () => {
    const seen: Recorded[] = [];
    await explainWith(new TypeError("fetch failed"), seen);
    expect(seen.length).toBe(2);
  });

  it("leaks no credential into any failure message", async () => {
    for (const [, error] of cases) {
      const body = await explainWith(error);
      expect(JSON.stringify(body)).not.toContain(SENTINEL_KEY);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. The deterministic fallback.
// ---------------------------------------------------------------------------

describe("the deterministic evidence summary", () => {
  it("is labelled as an evidence summary and not as an AI explanation", async () => {
    const body = await explainWith(new TypeError("fetch failed"));
    expect(body.fallback?.label).toBe("Evidence summary — AI unavailable");
    expect(body.fallback?.generated_by).toBe("assay-deterministic");
    // The field the page renders as the model's prose stays null. This is the
    // structural half of "never presented as an AI-generated explanation".
    expect(body.explanation).toBeNull();
  });

  it("appears when the server has no provider configured at all", async () => {
    const saved = {
      key: process.env["ANTHROPIC_API_KEY"],
      gemini: process.env["GEMINI_API_KEY"],
      provider: process.env["ASSAY_EXPLAIN_PROVIDER"],
    };
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    process.env["ASSAY_EXPLAIN_PROVIDER"] = "gemini";
    try {
      const bare = createApp({ registry });
      const response = await bare.request(
        `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
        { method: "POST" },
      );
      const body = (await response.json()) as ExplainBody;
      expect(response.status).toBe(503);
      expect(body.failure?.code).toBe("MISSING_CREDENTIAL");
      expect(body.explanation).toBeNull();
      expect(body.provider).toBeNull();
      expect(body.fallback?.label).toBe(FALLBACK_LABEL);
      expect(body.fallback?.points.length).toBeGreaterThan(2);
      // Nothing was hashed because nothing was sent...
      expect(body.grounding.system_prompt_id).toBeNull();
      // ...but the summary IS grounded in the run's own evidence.
      expect(body.grounding.evidence_item_count).toBeGreaterThan(10);
      expect(body.grounding.deterministic_state).toBe("ABSTAINED");
      // The rest of the surface is untouched by the absence.
      expect((await bare.request(`/runs/${stored.run_id}/close`)).status).toBe(200);
    } finally {
      if (saved.key !== undefined) process.env["ANTHROPIC_API_KEY"] = saved.key;
      if (saved.gemini !== undefined) process.env["GEMINI_API_KEY"] = saved.gemini;
      if (saved.provider === undefined) delete process.env["ASSAY_EXPLAIN_PROVIDER"];
      else process.env["ASSAY_EXPLAIN_PROVIDER"] = saved.provider;
    }
  });

  it("invents nothing — it passes the same grounding check a model's answer must", () => {
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const evidence = explainEvidence(stored, decision);
    const summary = evidenceSummary(evidence);

    // Re-shaped into R4's four fields purely so groundR4 can read it. This is
    // the assertion that the template quotes and never computes: every numeral
    // must appear in the evidence set and every id must be on the allowlist.
    const check = groundR4(
      {
        summary: summary.summary,
        why: [...summary.points],
        risk: summary.risk,
        next_step: summary.next_step,
      },
      evidence.evidenceSet,
      evidence.idAllowlist,
    );
    expect(check.ok, JSON.stringify(check)).toBe(true);
  });

  it("states ASSAY's own decision and never a different one", () => {
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const summary = evidenceSummary(explainEvidence(stored, decision));
    expect(summary.summary).toContain("abstained");
    expect(summary.summary).toContain("no AI explanation was available");
    for (const forbidden of ["I think", "recommend", "should be reconciled"]) {
      expect(JSON.stringify(summary)).not.toContain(forbidden);
    }
  });

  it("is absent when the boundary discarded a real answer", async () => {
    // A rejected response is the control WORKING. Replacing that finding with a
    // template would hide the most informative thing this surface ever says.
    const body = await explainWith({ ...GOOD, state: "RECONCILED" });
    expect(body.status).toBe("rejected");
    expect(body.fallback).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. No benchmark access, and 7. no browser credential exposure.
// ---------------------------------------------------------------------------

describe("the gemini path touches no benchmark artifact", () => {
  const ROOT = join(import.meta.dirname, "..", "..", "..");

  /**
   * Source with comments stripped — `packages/llm/tests/discipline.test.ts`'s
   * helper, for its reason.
   *
   * The assertions below are about what the code REACHES, and prose is not
   * reach: `app.ts` names `/bench/:version` in the paragraph explaining which of
   * `§9`'s nine routes it deliberately does not mount, and a check that failed
   * on that would be a check that punishes the disclosure.
   */
  function code(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  function sourcesUnder(dir: string): readonly { file: string; text: string }[] {
    const found: { file: string; text: string }[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        found.push(...sourcesUnder(full));
        continue;
      }
      if (entry.endsWith(".ts")) found.push({ file: full, text: readFileSync(full, "utf8") });
    }
    return found;
  }

  it("reaches no bench path, seal artifact or ground-truth file in apps/api/src", () => {
    for (const { file, text } of sourcesUnder(join(ROOT, "apps", "api", "src"))) {
      for (const forbidden of [
        "bench/",
        "ground_truth",
        "benchmark_manifest",
        "recon_report",
        "oracle_gate",
        "metrics.json",
      ]) {
        expect(code(text).includes(forbidden), `${file} reaches ${forbidden}`).toBe(false);
      }
    }
  });

  it("reads no filesystem and no benchmark module from the explain surface", () => {
    for (const { file, text } of sourcesUnder(join(ROOT, "apps", "api", "src", "explain"))) {
      for (const forbidden of ["node:fs", "@assay/eval", "@assay/generator", "@assay/oracle"]) {
        expect(code(text).includes(forbidden), `${file} imports ${forbidden}`).toBe(false);
      }
    }
  });

  it("grounds the explanation only in this run's own sealed evidence", async () => {
    const seen: Recorded[] = [];
    await explainWith(GOOD, seen);
    const prompt = seen.at(0)?.user ?? "";
    // A figure no stage of this run produced never appears.
    expect(prompt).not.toContain("99999999");
    expect(prompt).not.toContain("ground_truth");
  });
});

describe("the browser is never exposed to a credential", () => {
  const ROOT = join(import.meta.dirname, "..", "..", "..");

  /**
   * Everything `apps/web` ships to a browser.
   *
   * `src/` and `index.html` only. `tests/` is deliberately outside: it holds a
   * FIXTURE of the API's own `MISSING_CREDENTIAL` message, which names the
   * variable an operator has to set and is a string the panel is supposed to
   * display. Banning the name there would be banning the server's instruction
   * to its operator, which is not the thing that must not reach a browser — the
   * VALUE is, and no test carries one.
   */
  function webSources(dir: string): readonly { file: string; text: string }[] {
    const found: { file: string; text: string }[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        found.push(...webSources(full));
        continue;
      }
      if (/\.(ts|tsx|html)$/.test(entry)) {
        found.push({ file: full, text: readFileSync(full, "utf8") });
      }
    }
    return found;
  }

  it("the shipped bundle names no provider credential, SDK or endpoint", () => {
    const shipped = [
      ...webSources(join(ROOT, "apps", "web", "src")),
      { file: "index.html", text: readFileSync(join(ROOT, "apps", "web", "index.html"), "utf8") },
    ];
    for (const { file, text } of shipped) {
      for (const forbidden of [
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "ANTHROPIC_API_KEY",
        "@google/genai",
        "@anthropic-ai/sdk",
        "generativelanguage.googleapis.com",
        "api.anthropic.com",
      ]) {
        expect(text.includes(forbidden), `${file} names ${forbidden}`).toBe(false);
      }
    }
  });

  it("returns no credential, prompt text or provider configuration in the body", async () => {
    const ok = await explainWith(GOOD);
    const down = await explainWith(new ApiError({ message: "nope", status: 401 }));
    for (const body of [ok, down]) {
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain(SENTINEL_KEY);
      expect(serialised).not.toContain("AIzaSy");
      // §T11: hashes travel, prompt text never does.
      expect(serialised).not.toContain("YOUR ROLE");
      expect(serialised).not.toContain("GROUNDING RULES");
    }
  });

  it("accepts no provider selection from the request body", async () => {
    const app = createApp({ registry });
    for (const attempt of [
      { provider: "gemini" },
      { model: "gemini-2.5-flash" },
      { api_key: SENTINEL_KEY },
      { audience: "analyst", provider: "anthropic" },
    ]) {
      const response = await app.request(
        `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt),
        },
      );
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe("unexpected_field");
    }
  });
});

// ---------------------------------------------------------------------------
// 8. The decision state is unchanged, whatever the model says.
// ---------------------------------------------------------------------------

describe("gemini cannot alter the decision", () => {
  it("leaves the sealed decision and its certificate byte-identical", async () => {
    const app = createApp({ registry, explainProvider: () => providerWith(GOOD) });
    const before = await (
      await app.request(`/runs/${stored.run_id}/decisions/${decisionId}`)
    ).json();
    const closeBefore = await (await app.request(`/runs/${stored.run_id}/close`)).json();

    // Every branch: accepted, discarded, and unreachable.
    await explainWith(GOOD);
    await explainWith({ ...GOOD, state: "RECONCILED" });
    await explainWith(new TypeError("fetch failed"));

    const after = await (
      await app.request(`/runs/${stored.run_id}/decisions/${decisionId}`)
    ).json();
    const closeAfter = await (await app.request(`/runs/${stored.run_id}/close`)).json();
    expect(after).toEqual(before);
    expect(closeAfter).toEqual(closeBefore);
    expect((closeAfter as { ledger_root_hash: string }).ledger_root_hash).toBe(
      stored.result.evidence.chain.root_hash,
    );
  });

  it("reports ASSAY's state even when the prose claims another one", async () => {
    const body = await explainWith({
      ...GOOD,
      summary: "ASSAY reconciled this settlement and no further work is needed.",
    });
    expect(body.status).toBe("ok");
    // The prose is the model's. The state is not.
    expect(body.grounding.deterministic_state).toBe("ABSTAINED");
    expect(body.grounding.decision_authority).toBe("none");
  });

  it("has no field through which a state, candidate or amount could return", () => {
    expect(Object.keys(R4OutputSchema.shape).sort()).toEqual([
      "next_step",
      "risk",
      "summary",
      "why",
    ]);
  });
});
