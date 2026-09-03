import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PROVIDER_DESCRIPTORS, providerDescriptor } from "../src/provider.js";
import { OfflineProvider, offlineProvider } from "../src/providers/offline.js";
import { ReplayCacheMissError, replayProvider } from "../src/providers/replay.js";
import { callHashes } from "../src/cache-key.js";
import { R1OutputSchema, R1_SYSTEM_PROMPT_ID } from "../src/roles/r1.js";
import { NumericSchemaError } from "../src/verify/schema.js";
import { r1Input, r1Request, r2Request, r3Request } from "./fixtures.js";

describe("the five-provider architecture (ARCHITECTURE §6.5)", () => {
  it("declares all five, with the three network ones marked unbuilt HERE", () => {
    expect(PROVIDER_DESCRIPTORS.map((d) => d.id)).toEqual([
      "offline",
      "replay",
      "anthropic",
      "openai-compatible",
      "gemini",
    ]);
    expect(PROVIDER_DESCRIPTORS.filter((d) => d.built).map((d) => d.id)).toEqual([
      "offline",
      "replay",
    ]);
  });

  it("every built provider is zero-cost, offline and deterministic", () => {
    for (const d of PROVIDER_DESCRIPTORS.filter((x) => x.built)) {
      expect(d.requiresNetwork).toBe(false);
      expect(d.meteredCost).toBe(false);
      expect(d.deterministic).toBe(true);
    }
  });

  it("every metered provider requires a network, so CI can refuse it by config", () => {
    for (const d of PROVIDER_DESCRIPTORS.filter((x) => x.meteredCost)) {
      expect(d.requiresNetwork).toBe(true);
      // `built: false` is a claim about THIS PACKAGE. `anthropic` and `gemini`
      // are both implemented in apps/api/src/explain/, which owns the socket
      // and the credential; what must not exist here is a transport, and the
      // flag is what keeps apps/cli refusing every one of these by config.
      expect(d.built).toBe(false);
    }
  });

  it("declares gemini as a metered, networked, non-deterministic provider", () => {
    const gemini = providerDescriptor("gemini");
    expect(gemini.requiresNetwork).toBe(true);
    expect(gemini.meteredCost).toBe(true);
    expect(gemini.deterministic).toBe(false);
    // A free tier is a commercial term of an account, not a property of the
    // provider — so meteredCost stays true and CI still refuses it outright.
    expect(gemini.purpose).toContain("@google/genai");
  });

  it("descriptors are frozen", () => {
    expect(Object.isFrozen(PROVIDER_DESCRIPTORS)).toBe(true);
    expect(Object.isFrozen(providerDescriptor("offline"))).toBe(true);
  });
});

describe("the offline provider — §6.5's guaranteed demo path", () => {
  const provider = offlineProvider();

  it("reports itself as zero-cost and network-free, with model_id rules-v1", () => {
    expect(provider.id).toBe("offline");
    expect(provider.modelId).toBe("rules-v1");
    expect(provider.requiresNetwork).toBe(false);
    expect(provider.meteredCost).toBe(false);
  });

  it("answers R1", async () => {
    const result = await provider.invoke(r1Request());
    expect(result.value).not.toBeNull();
    expect(result.meta.failure).toBeNull();
    expect(result.meta.input_tokens).toBe(0);
    expect(result.meta.output_tokens).toBe(0);
  });

  it("answers R2", async () => {
    const result = await provider.invoke(r2Request());
    expect(result.value).not.toBeNull();
    expect(result.meta.failure).toBeNull();
  });

  it("refuses R4 — still declared and not built (§H tier H2)", async () => {
    const result = await provider.invoke({ ...r1Request(), role: "R4" });
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("ROLE_NOT_IMPLEMENTED");
  });

  it("answers R3 from PREREGISTRATION.md §7's frozen policy, not an invented list", async () => {
    const result = await provider.invoke(r3Request());
    expect(result.value).not.toBeNull();
    expect(result.meta.failure).toBeNull();
  });

  it("is byte-deterministic across repeated calls (metric 23's precondition)", async () => {
    const a = await provider.invoke(r1Request());
    const b = await provider.invoke(r1Request());
    expect(a.value).toEqual(b.value);
    expect(a.meta.cache_key).toBe(b.meta.cache_key);
    expect(a.meta.raw_response_hash).toBe(b.meta.raw_response_hash);
  });

  it("refuses a numeric response schema whoever passed it (§L.1 rule 2)", async () => {
    await expect(
      provider.invoke({
        ...r1Request(),
        schema: z.strictObject({ score: z.number() }),
      }),
    ).rejects.toThrow(NumericSchemaError);
  });

  it("reports SCHEMA_REJECT when the response does not fit the role schema", async () => {
    const result = await provider.invoke({
      ...r1Request(),
      schema: z.strictObject({ nothing_like_r1: z.string() }),
    });
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("SCHEMA_REJECT");
  });
});

describe("the replay provider — §L.1 rule 11", () => {
  function keyFor(narration?: string): string {
    return callHashes({
      provider: "replay",
      modelId: "replay-v1",
      systemPromptId: R1_SYSTEM_PROMPT_ID,
      input: r1Input(narration),
    }).cache_key;
  }

  const recorded = {
    utr_candidates: ["RZPX0001"],
    counterparty_hint: null,
    reference_hints: [],
  };

  it("serves a committed response on a hit", async () => {
    const provider = replayProvider({ cache: new Map([[keyFor(), recorded]]) });
    const result = await provider.invoke(r1Request());
    expect(result.value).toEqual(recorded);
    expect(result.meta.cache_hit).toBe(true);
  });

  it("a miss under strict replay is a HARD ERROR, never a silent live call", async () => {
    const provider = replayProvider({ cache: new Map() });
    await expect(provider.invoke(r1Request())).rejects.toThrow(ReplayCacheMissError);
  });

  it("defaults to strict — the safe direction is the frozen one", async () => {
    const provider = replayProvider({ cache: new Map() });
    await expect(provider.invoke(r1Request())).rejects.toThrow(/strict-replay/);
  });

  it("reports CACHE_MISS without throwing only when strictness is explicitly off", async () => {
    const provider = replayProvider({ cache: new Map(), strict: false });
    const result = await provider.invoke(r1Request());
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("CACHE_MISS");
  });

  it("keys on the input, so a different narration is a different entry", async () => {
    const provider = replayProvider({ cache: new Map([[keyFor(), recorded]]), strict: false });
    const other = await provider.invoke(r1Request("A COMPLETELY DIFFERENT NARRATION"));
    expect(other.meta.cache_hit).toBe(false);
  });

  it("still applies the schema check to a committed response", async () => {
    const provider = replayProvider({
      cache: new Map([[keyFor(), { utr_candidates: "not-an-array" }]]),
    });
    const result = await provider.invoke(r1Request());
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("SCHEMA_REJECT");
  });

  it("computes keys against the RECORDED provider, not against itself", async () => {
    const liveKey = callHashes({
      provider: "anthropic",
      modelId: "some-model",
      systemPromptId: R1_SYSTEM_PROMPT_ID,
      input: r1Input(),
    }).cache_key;
    const provider = replayProvider({
      cache: new Map([[liveKey, recorded]]),
      recordedProvider: "anthropic",
      recordedModelId: "some-model",
    });
    const result = await provider.invoke(r1Request());
    expect(result.meta.cache_hit).toBe(true);
    expect(result.value).toEqual(recorded);
  });
});

describe("cache keys (DATA_MODEL §19)", () => {
  it("distinguishes provider, model, prompt and input", () => {
    const base = {
      provider: "replay" as const,
      modelId: "m",
      systemPromptId: "p",
      input: r1Input(),
    };
    const keys = new Set([
      callHashes(base).cache_key,
      callHashes({ ...base, provider: "offline" }).cache_key,
      callHashes({ ...base, modelId: "m2" }).cache_key,
      callHashes({ ...base, systemPromptId: "p2" }).cache_key,
      callHashes({ ...base, input: r1Input("other") }).cache_key,
    ]);
    expect(keys.size).toBe(5);
  });

  it("is stable across two computations of the same call", () => {
    const args = {
      provider: "offline" as const,
      modelId: "rules-v1",
      systemPromptId: R1_SYSTEM_PROMPT_ID,
      input: r1Input(),
    };
    expect(callHashes(args)).toEqual(callHashes(args));
  });
});

describe("the offline provider satisfies its own role schemas", () => {
  it("R1 output always parses under R1OutputSchema", async () => {
    const provider = new OfflineProvider();
    const result = await provider.invoke(r1Request());
    expect(R1OutputSchema.safeParse(result.value).success).toBe(true);
  });
});
