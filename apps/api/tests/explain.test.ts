import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { assertNoNumericField, collectEntityIds } from "@assay/llm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  AnthropicProvider,
  EXPLAIN_PROMPTS,
  R4OutputSchema,
  R4_SYSTEM_PROMPT,
  R4_SYSTEM_PROMPT_ID,
  createApp,
  explainEvidence,
  r4UserPrompt,
  resolveProvider,
  RunRegistry,
  type StoredRun,
} from "../src/index.js";

/**
 * `POST /runs/:id/decisions/:decision_id/explain` — the product's grounded
 * explanation, over `demo/demo-500`.
 *
 * **No test here reaches a network and none needs a credential.** Every call
 * goes through the real {@link AnthropicProvider} with its **transport**
 * injected, so what is exercised is the shipped provider — its request shape,
 * its `ARCHITECTURE.md §12` error mapping, its `§19` call meta — and only the
 * socket is a stand-in. `DECISION_BRIEF.md §C` T0-11 requires the repository to
 * run from a clean checkout with no API key; a suite that called a live model
 * would end that, and a suite that mocked the provider *interface* would prove
 * nothing about the provider that ships.
 *
 * **The fixture measures nothing.** `demo/demo-500` lives outside `bench/`, has
 * no ground truth and is never scored (`demo/README.md`).
 */

const SENTINEL_KEY = "sk-ant-not-a-real-key-0000000000";

interface ExplainBody {
  readonly run_id: string;
  readonly decision_id: string;
  readonly audience: string;
  readonly status: "ok" | "rejected" | "unavailable";
  readonly explanation: {
    readonly summary: string;
    readonly why: readonly string[];
    readonly risk: string;
    readonly next_step: string;
  } | null;
  readonly provider: {
    readonly provider: string;
    readonly model_id: string;
    readonly requires_network: boolean;
    readonly attempts: number;
  } | null;
  readonly grounding: {
    readonly decision_evidence_verified: boolean;
    readonly certificate_used: boolean;
    readonly decision_authority: string;
    readonly deterministic_state: string;
    readonly checks: { schema: string; allowlist: string; numerals: string };
    readonly rejected_entity_ids: readonly string[];
    readonly rejected_numerals: readonly string[];
    readonly system_prompt_id: string | null;
    readonly system_prompt_hash: string;
    readonly input_hash: string;
    readonly evidence_item_count: number;
  };
  readonly failure: { readonly code: string; readonly message: string } | null;
}

/** One recorded call to the transport the provider was given. */
interface Recorded {
  readonly system: string;
  readonly user: string;
  readonly model: string;
}

/** A transport stand-in: answers with `answer`, or throws what it is given. */
function transport(
  answer: unknown | Error,
  recorded: Recorded[],
): ConstructorParameters<typeof AnthropicProvider>[0]["client"] {
  return {
    // The SDK types `parse` as returning an APIPromise; a suite driving the
    // class needs only the shape the class reads.
    parse: ((params: {
      system: string;
      model: string;
      messages: readonly { content: string }[];
    }) => {
      recorded.push({
        system: params.system,
        user: params.messages[0]?.content ?? "",
        model: params.model,
      });
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve({
        parsed_output: answer,
        usage: { input_tokens: 1200, output_tokens: 200 },
      });
    }) as never,
  };
}

function providerWith(answer: unknown | Error, recorded: Recorded[] = []): AnthropicProvider {
  return new AnthropicProvider({
    apiKey: SENTINEL_KEY,
    modelId: "claude-opus-5",
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

const recorded: Recorded[] = [];
const app = createApp({ registry, explainProvider: () => providerWith(GOOD, recorded) });

async function explain(
  runId: string,
  decision: string,
  body?: unknown,
): Promise<{ status: number; body: ExplainBody }> {
  const response = await app.request(`/runs/${runId}/decisions/${decision}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as ExplainBody };
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
// 1. The endpoint receives a run/decision pair.
// ---------------------------------------------------------------------------

describe("the endpoint takes a run and a decision", () => {
  it("answers for the pair it was asked about", async () => {
    const { status, body } = await explain(stored.run_id, decisionId);
    expect(status).toBe(200);
    expect(body.run_id).toBe(stored.run_id);
    expect(body.decision_id).toBe(decisionId);
    expect(body.status).toBe("ok");
    expect(body.explanation?.summary).toContain("abstained");
    expect(body.provider?.provider).toBe("anthropic");
    expect(body.provider?.model_id).toBe("claude-opus-5");
  });

  it("defaults the audience and accepts the two it names", async () => {
    expect((await explain(stored.run_id, decisionId)).body.audience).toBe("analyst");
    expect((await explain(stored.run_id, decisionId, { audience: "executive" })).body.audience).toBe(
      "executive",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The server obtains the DecisionEvidence itself.
// ---------------------------------------------------------------------------

describe("the server loads the evidence; the browser cannot supply it", () => {
  it("refuses a body carrying anything but a presentation preference", async () => {
    for (const attempt of [
      { materiality_paise: 1 },
      { evidence: { state: "RECONCILED" } },
      { audience: "analyst", value_paise: 999 },
    ]) {
      const { status, body } = await explain(stored.run_id, decisionId, attempt);
      expect(status).toBe(400);
      expect((body as unknown as { error: string }).error).toBe("unexpected_field");
    }
  });

  it("refuses an audience it does not know", async () => {
    const { status, body } = await explain(stored.run_id, decisionId, { audience: "regulator" });
    expect(status).toBe(400);
    expect((body as unknown as { error: string }).error).toBe("unknown_audience");
  });

  it("builds the envelope from the registry's own sealed decision", () => {
    const decision = stored.decisionsById.get(decisionId);
    expect(decision).toBeDefined();
    if (decision === undefined) return;
    const evidence = explainEvidence(stored, decision);

    // Every §1 field the product requires, from the run and nowhere else.
    expect(evidence.input.state).toBe(decision.state);
    expect(evidence.input.reason).toBe(decision.certificate?.reason);
    expect(evidence.input.candidate_a?.candidate_id).toBe(
      decision.certificate?.solution_a.candidate_id,
    );
    expect(evidence.input.candidate_b?.candidate_id).toBe(
      decision.certificate?.solution_b.candidate_id,
    );
    expect(evidence.input.candidate_a?.member_obs_ids).toEqual(
      decision.certificate?.solution_a.member_obs_ids,
    );
    expect(evidence.input.shared_hard_constraints).toEqual(
      decision.certificate?.shared_hard_constraints,
    );
    expect(evidence.input.evidence_score_gap).toContain(
      String(decision.certificate?.evidence_score_gap_bps),
    );
    expect(evidence.input.epsilon).toContain(String(decision.certificate?.epsilon_bps));
    expect(evidence.input.materiality).toContain(
      String(decision.certificate?.materiality_paise),
    );
    expect(evidence.input.tau).toContain(String(decision.certificate?.tau_paise));
    expect(evidence.input.probes_attempted).toEqual(decision.certificate?.probes_attempted);
    expect(evidence.input.unresolved_value).toContain(
      String(stored.result.evidence.close.gate.unresolved_value_paise),
    );
    expect(evidence.input.period_status).toBe(stored.result.evidence.close.period_status);
    expect(evidence.deterministicState).toBe("ABSTAINED");
  });
});

// ---------------------------------------------------------------------------
// 3. The prompt contains only verified evidence.
// ---------------------------------------------------------------------------

describe("the prompt carries verified evidence and nothing else", () => {
  it("states every grounding rule the model has to obey", () => {
    for (const rule of [
      "ALREADY BEEN MADE",
      "You explain the evidence behind a decision that ASSAY already took",
      "You do not choose a reconciliation candidate",
      "never recommend changing the deterministic decision",
      "Use ONLY the evidence supplied in this request",
      "Invent no value of any kind",
      "say that it does not state it",
    ]) {
      expect(R4_SYSTEM_PROMPT).toContain(rule);
    }
  });

  it("names no identifier the call did not allow", () => {
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const evidence = explainEvidence(stored, decision);
    const allowed = new Set(evidence.idAllowlist);
    // Every entity-id-shaped token in the rendered prompt must be one this
    // decision's own evidence carries. A prompt that leaked an id from another
    // component would be evidence the model was never entitled to see.
    for (const found of collectEntityIds(JSON.parse(JSON.stringify(evidence.input)))) {
      expect(allowed.has(found.id), `${found.path} -> ${found.id}`).toBe(true);
    }
  });

  it("carries the certificate's real figures, and no figure from anywhere else", async () => {
    const seen: Recorded[] = [];
    const scoped = createApp({ registry, explainProvider: () => providerWith(GOOD, seen) });
    await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
      method: "POST",
    });
    const prompt = seen.at(0)?.user ?? "";
    const decision = stored.decisionsById.get(decisionId);
    const certificate = decision?.certificate;
    expect(prompt).toContain(String(decision?.value_paise));
    expect(prompt).toContain(String(certificate?.materiality_paise));
    expect(prompt).toContain(String(certificate?.tau_paise));
    expect(prompt).toContain(String(certificate?.epsilon_bps));
    // A figure no stage of this run produced never appears.
    expect(prompt).not.toContain("99999999");
    // And no credential rides along with it.
    expect(prompt).not.toContain(SENTINEL_KEY);
    expect(seen.at(0)?.system).not.toContain(SENTINEL_KEY);
  });

  it("attaches the evidence set the grounding rule is checked against", () => {
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) throw new Error("fixture");
    const evidence = explainEvidence(stored, decision);
    expect(evidence.evidenceSet.length).toBeGreaterThan(10);
    expect(evidence.input.evidence_set).toEqual(evidence.evidenceSet);
    expect(r4UserPrompt(evidence.input)).toContain("this is everything you have");
  });
});

// ---------------------------------------------------------------------------
// 4. The model cannot alter the decision state.
// ---------------------------------------------------------------------------

describe("the model cannot alter the decision", () => {
  it("has no state field to alter it through", () => {
    expect(Object.keys(R4OutputSchema.shape).sort()).toEqual([
      "next_step",
      "risk",
      "summary",
      "why",
    ]);
  });

  it("discards a response that adds one", async () => {
    const scoped = createApp({
      registry,
      explainProvider: () => providerWith({ ...GOOD, state: "RECONCILED" }),
    });
    const response = await scoped.request(
      `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
      { method: "POST" },
    );
    const body = (await response.json()) as ExplainBody;
    expect(response.status).toBe(200);
    expect(body.status).toBe("rejected");
    expect(body.explanation).toBeNull();
    expect(body.grounding.checks.schema).toBe("fail");
    expect(body.failure?.code).toBe("MALFORMED_RESPONSE");
    expect(body.grounding.deterministic_state).toBe("ABSTAINED");
  });

  it("reports ASSAY's state even when the prose claims another one", async () => {
    const scoped = createApp({
      registry,
      explainProvider: () =>
        providerWith({
          ...GOOD,
          summary: "ASSAY reconciled this settlement and no further work is needed.",
        }),
    });
    const body = (await (
      await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
        method: "POST",
      })
    ).json()) as ExplainBody;
    expect(body.status).toBe("ok");
    // The prose is the model's. The state is not.
    expect(body.grounding.deterministic_state).toBe("ABSTAINED");
    expect(body.grounding.decision_authority).toBe("none");
  });

  it("leaves the sealed decision and its certificate byte-identical", async () => {
    const before = await (
      await app.request(`/runs/${stored.run_id}/decisions/${decisionId}`)
    ).json();
    await explain(stored.run_id, decisionId);
    const after = await (
      await app.request(`/runs/${stored.run_id}/decisions/${decisionId}`)
    ).json();
    expect(after).toEqual(before);
    expect(stored.result.evidence.chain.root_hash).toBe(
      (await (await app.request(`/runs/${stored.run_id}/close`)).json() as {
        ledger_root_hash: string;
      }).ledger_root_hash,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The model cannot inject authoritative financial values.
// ---------------------------------------------------------------------------

describe("the model cannot inject a financial value", () => {
  it("has no numeric field in its output schema (§L.1 rule 2)", () => {
    expect(() => {
      assertNoNumericField(R4OutputSchema);
    }).not.toThrow();
  });

  it("discards a whole response that quotes an amount not in the evidence", async () => {
    const scoped = createApp({
      registry,
      explainProvider: () =>
        providerWith({
          ...GOOD,
          risk: "The exposure is ₹9,99,99,999 against the settlement.",
        }),
    });
    const body = (await (
      await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
        method: "POST",
      })
    ).json()) as ExplainBody;
    expect(body.status).toBe("rejected");
    expect(body.explanation).toBeNull();
    expect(body.failure?.code).toBe("UNGROUNDED_NUMERAL");
    expect(body.grounding.checks.numerals).toBe("fail");
    expect(body.grounding.rejected_numerals.length).toBeGreaterThan(0);
    expect(body.grounding.deterministic_state).toBe("ABSTAINED");
  });

  it("discards a response that names an entity this decision never showed it", async () => {
    const scoped = createApp({
      registry,
      explainProvider: () =>
        providerWith({ ...GOOD, next_step: "Reconcile against pay_NOTINEVIDENCE." }),
    });
    const body = (await (
      await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
        method: "POST",
      })
    ).json()) as ExplainBody;
    expect(body.status).toBe("rejected");
    expect(body.failure?.code).toBe("UNKNOWN_ENTITY_ID");
    expect(body.grounding.checks.allowlist).toBe("fail");
    expect(body.grounding.rejected_entity_ids).toContain("pay_NOTINEVIDENCE");
  });

  it("admits the figures the evidence does carry", async () => {
    const decision = stored.decisionsById.get(decisionId);
    const cert = decision?.certificate;
    const scoped = createApp({
      registry,
      explainProvider: () =>
        providerWith({
          ...GOOD,
          why: [
            `The evidence score gap is ${String(cert?.evidence_score_gap_bps)} bps.`,
            `Epsilon is ${String(cert?.epsilon_bps)} bps, so neither candidate wins.`,
          ],
        }),
    });
    const body = (await (
      await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
        method: "POST",
      })
    ).json()) as ExplainBody;
    expect(body.status).toBe("ok");
    expect(body.grounding.checks.numerals).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// 7. Provider failure produces a safe state (the API half; the UI half is in
//    apps/web/tests/ai-explanation.test.tsx).
// ---------------------------------------------------------------------------

describe("ARCHITECTURE.md §12's failure table, over the real provider", () => {
  const cases: readonly [string, Error, string][] = [
    [
      "unreachable",
      new Anthropic.APIConnectionError({ message: "socket hang up" }),
      "PROVIDER_UNAVAILABLE",
    ],
    [
      "timed out",
      new Anthropic.APIConnectionTimeoutError({ message: "timed out" }),
      "TIMEOUT",
    ],
    [
      "rate limited",
      new Anthropic.RateLimitError(429, undefined, "rate limit", new Headers()),
      "RATE_LIMITED",
    ],
    [
      "credential rejected",
      new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()),
      "AUTHENTICATION",
    ],
  ];

  for (const [label, error, code] of cases) {
    it(`reports ${label} without touching the decision`, async () => {
      const scoped = createApp({ registry, explainProvider: () => providerWith(error) });
      const response = await scoped.request(
        `/runs/${stored.run_id}/decisions/${decisionId}/explain`,
        { method: "POST" },
      );
      const body = (await response.json()) as ExplainBody;
      expect(response.status).toBe(503);
      expect(body.status).toBe("unavailable");
      expect(body.explanation).toBeNull();
      expect(body.failure?.code).toBe(code);
      expect(body.failure?.message).not.toContain(SENTINEL_KEY);
      expect(body.grounding.deterministic_state).toBe("ABSTAINED");
      expect(body.grounding.certificate_used).toBe(true);
    });
  }

  it("reports a response that matched no schema at all", async () => {
    const scoped = createApp({ registry, explainProvider: () => providerWith(null) });
    const body = (await (
      await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
        method: "POST",
      })
    ).json()) as ExplainBody;
    expect(body.status).toBe("rejected");
    expect(body.failure?.code).toBe("MALFORMED_RESPONSE");
  });

  it("retries once and then stops, per §12", async () => {
    const seen: Recorded[] = [];
    const failing = new AnthropicProvider({
      apiKey: SENTINEL_KEY,
      modelId: "claude-opus-5",
      prompts: EXPLAIN_PROMPTS,
      maxTokens: 2000,
      timeoutMs: 1000,
      client: transport(new Anthropic.APIConnectionError({ message: "down" }), seen),
    });
    const scoped = createApp({ registry, explainProvider: () => failing });
    await scoped.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, {
      method: "POST",
    });
    expect(seen.length).toBe(2);
  });
});

describe("configuration is environment-only, and its absence is reported", () => {
  it("names the missing credential rather than throwing", () => {
    const resolved = resolveProvider({});
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("MISSING_CREDENTIAL");
    expect(resolved.failure.message).toContain("ANTHROPIC_API_KEY");
  });

  it("builds the anthropic provider when the credential is present", () => {
    const resolved = resolveProvider({ ANTHROPIC_API_KEY: SENTINEL_KEY });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.provider.id).toBe("anthropic");
    expect(resolved.provider.modelId).toBe("claude-opus-5");
    expect(resolved.provider.requiresNetwork).toBe(true);
  });

  it("refuses a provider it does not build", () => {
    const resolved = resolveProvider({
      ANTHROPIC_API_KEY: SENTINEL_KEY,
      ASSAY_EXPLAIN_PROVIDER: "openai-compatible",
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.code).toBe("UNSUPPORTED_PROVIDER");
  });

  it("registers exactly the one prompt this surface serves", () => {
    expect([...EXPLAIN_PROMPTS.keys()]).toEqual([R4_SYSTEM_PROMPT_ID]);
  });

  it("answers 503 with a stated reason when the server has no credential", async () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
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
      expect(body.grounding.deterministic_state).toBe("ABSTAINED");
      // The rest of the surface is untouched by the absence.
      expect((await bare.request(`/runs/${stored.run_id}/close`)).status).toBe(200);
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Unknown run/decision returns 404.
// ---------------------------------------------------------------------------

describe("an unknown pair is a 404, before a provider is built", () => {
  it("404s on an unknown run", async () => {
    const { status, body } = await explain("run_nope", decisionId);
    expect(status).toBe(404);
    expect((body as unknown as { error: string }).error).toBe("unknown_run");
  });

  it("404s on an unknown decision, naming the run that does exist", async () => {
    const { status, body } = await explain(stored.run_id, "dec_nope");
    expect(status).toBe(404);
    expect((body as unknown as { error: string }).error).toBe("unknown_decision");
    expect((body as unknown as { run_id: string }).run_id).toBe(stored.run_id);
  });

  it("spends no provider call on either", async () => {
    const seen: Recorded[] = [];
    const scoped = createApp({ registry, explainProvider: () => providerWith(GOOD, seen) });
    await scoped.request(`/runs/run_nope/decisions/${decisionId}/explain`, { method: "POST" });
    await scoped.request(`/runs/${stored.run_id}/decisions/dec_nope/explain`, { method: "POST" });
    expect(seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 9 + 10. No benchmark file is reachable; no credential reaches apps/web.
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "..", "..", "..");

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, extensions));
    else if (extensions.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

/** Import/require specifiers, ignoring anything inside a comment. */
function specifiers(text: string): string[] {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const re of [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const m of stripped.matchAll(re)) if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("no benchmark file is reachable from this surface", () => {
  const apiSources = sourceFiles(join(ROOT, "apps", "api", "src"), [".ts"]).map((file) => ({
    file,
    text: readFileSync(file, "utf8"),
  }));

  it("the dataset allowlist holds the demo fixture and nothing else", async () => {
    const { DEMO_DATASET_IDS, observationsPathFor } = await import("../src/datasets.js");
    expect([...DEMO_DATASET_IDS]).toEqual(["demo-500"]);
    const path = observationsPathFor("demo-500").replaceAll("\\", "/");
    expect(path).toContain("/demo/demo-500/");
    expect(path).not.toContain("/bench/");
    expect(path).not.toContain("/runs/");
  });

  it("no source under apps/api names a benchmark artifact", () => {
    for (const { file, text } of apiSources) {
      const body = code(text);
      for (const forbidden of ["bench/", "ground_truth", "recon_report", "seal-v", "metrics.json"]) {
        expect(body.includes(forbidden), `${file} names ${forbidden}`).toBe(false);
      }
    }
  });

  it("the explanation modules perform no filesystem I/O at all", () => {
    const explainSources = apiSources.filter((s) =>
      s.file.replaceAll("\\", "/").includes("/src/explain/"),
    );
    expect(explainSources.length).toBeGreaterThan(0);
    for (const { file, text } of explainSources) {
      for (const spec of specifiers(text)) {
        expect(["fs", "node:fs", "node:fs/promises", "node:path", "path"], file).not.toContain(spec);
      }
    }
  });

  it("this surface declares no dependency on the scorer or the benchmark", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "apps", "api", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).not.toContain("@assay/eval");
    expect(deps).not.toContain("@assay/generator");
    expect(deps).not.toContain("@assay/oracle");
    expect(deps).toContain("@assay/llm");
    expect(deps).toContain("@anthropic-ai/sdk");
  });
});

describe("no credential reaches apps/web", () => {
  const webSources = sourceFiles(join(ROOT, "apps", "web", "src"), [".ts", ".tsx"]).map((file) => ({
    file,
    text: readFileSync(file, "utf8"),
  }));

  it("names no credential, no key and no provider SDK", () => {
    expect(webSources.length).toBeGreaterThan(0);
    for (const { file, text } of webSources) {
      const body = code(text);
      for (const forbidden of [
        "ANTHROPIC_API_KEY",
        "API_KEY",
        "apiKey",
        "x-api-key",
        "Authorization",
        "sk-ant",
        "import.meta.env",
        "process.env",
      ]) {
        expect(body.includes(forbidden), `${file} names ${forbidden}`).toBe(false);
      }
      expect(specifiers(text)).not.toContain("@anthropic-ai/sdk");
    }
  });

  it("declares no provider SDK in its manifest", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "apps", "web", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all)).not.toContain("@anthropic-ai/sdk");
    expect(Object.keys(all)).not.toContain("@assay/llm");
  });

  it("puts no credential in any response body the page can read", async () => {
    const bodies = await Promise.all(
      [
        app.request(`/runs/${stored.run_id}/decisions/${decisionId}/explain`, { method: "POST" }),
        app.request(`/runs/${stored.run_id}/decisions/${decisionId}`),
        app.request(`/runs/${stored.run_id}/close`),
      ].map(async (p) => (await p).text()),
    );
    for (const text of bodies) {
      expect(text).not.toContain(SENTINEL_KEY);
      expect(text).not.toContain("sk-ant");
      expect(text.toLowerCase()).not.toContain("api_key");
      // §T11: prompt hashes travel, prompt text never does.
      expect(text).not.toContain("ALREADY BEEN MADE");
    }
  });

  it("returns the §19 hashes and not the prompt they were taken over", async () => {
    const { body } = await explain(stored.run_id, decisionId);
    expect(body.grounding.system_prompt_id).toBe(R4_SYSTEM_PROMPT_ID);
    expect(body.grounding.system_prompt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.grounding.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.grounding.evidence_item_count).toBeGreaterThan(10);
  });
});
