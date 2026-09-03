import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { R1OutputSchema, R1_SYSTEM_PROMPT_ID, callHashes } from "@assay/llm";
import { afterAll, describe, expect, it } from "vitest";

import {
  GLOBAL_FLAGS,
  ReplayCacheError,
  buildProvider,
  loadReplayCache,
  parseArgs,
  resolveConfig,
} from "../src/index.js";

/**
 * Loading `fixtures/llm-cache/`, and `DECISION_BRIEF.md §L.1` rule 11.
 *
 * > *"All scored benchmark runs use `--llm=replay --strict-replay`. A cache miss
 * > is a hard error, never a silent live call."*
 *
 * The read is this package's and the miss is `packages/llm`'s. Both halves are
 * asserted here, because the property that matters is the composition: a cache
 * loaded correctly, and a miss that stops the run.
 */

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-cache-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** An `R1` request whose cache key is computed by `packages/llm`, never here. */
const R1_REQUEST = {
  role: "R1" as const,
  schema: R1OutputSchema,
  systemPromptId: R1_SYSTEM_PROMPT_ID,
  input: {
    role: "R1" as const,
    obs_id: "obs_000001A",
    narration: "NEFT RAZORPAY SETTLEMENT UTR123456789012",
  },
  idAllowlist: ["obs_000001A"],
};

function config(argv: readonly string[]) {
  return resolveConfig(parseArgs(argv, GLOBAL_FLAGS), {});
}

describe("loadReplayCache", () => {
  it("keys entries on the filename, which is the §19 cache_key", () => {
    const dir = tempDir();
    const key = "a".repeat(64);
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ tokens: [] }), "utf8");

    const cache = loadReplayCache(dir);
    expect(cache.size).toBe(1);
    expect(cache.has(key)).toBe(true);
  });

  it("refuses a file whose name is not a cache key", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "not-a-key.json"), "{}", "utf8");
    // A file the loader cannot key is a committed response that would never be
    // served, and rule 11 would then report the miss as ASSAY's fault.
    expect(() => loadReplayCache(dir)).toThrow(ReplayCacheError);
  });

  it("refuses an entry that is not JSON", () => {
    const dir = tempDir();
    writeFileSync(join(dir, `${"b".repeat(64)}.json`), "{", "utf8");
    expect(() => loadReplayCache(dir)).toThrow(ReplayCacheError);
  });

  it("reports an absent cache before the first call rather than at it", () => {
    expect(() => loadReplayCache(join(tempDir(), "missing"))).toThrow(ReplayCacheError);
  });
});

describe("§L.1 rule 11 — a miss is a hard error", () => {
  it("--llm=replay --strict-replay rejects on a miss, and never calls out", async () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    const provider = buildProvider(config(["run", "--llm=replay", "--strict-replay"]), {
      replayCacheDir: dir,
    });

    await expect(provider.invoke(R1_REQUEST)).rejects.toThrow(/strict-replay/);
    expect(provider.requiresNetwork).toBe(false);
    expect(provider.meteredCost).toBe(false);
  });

  it("serves a committed response when the key is present", async () => {
    const dir = tempDir();
    // The key is packages/llm's to compute; this suite must not re-derive it,
    // or it would test its own arithmetic instead of the cache.
    const hashes = callHashes({
      provider: "replay",
      modelId: "rules-v1",
      systemPromptId: R1_SYSTEM_PROMPT_ID,
      input: R1_REQUEST.input,
    });
    writeFileSync(
      join(dir, `${hashes.cache_key}.json`),
      JSON.stringify({ utr_tokens: [], reference_tokens: [], counterparty_tokens: [] }),
      "utf8",
    );

    const provider = buildProvider(config(["run", "--llm=replay"]), { replayCacheDir: dir });
    const result = await provider.invoke(R1_REQUEST);
    expect(result.meta.cache_hit).toBe(true);
    expect(result.meta.cache_key).toBe(hashes.cache_key);
  });

  it("--no-strict-replay degrades to a null value rather than a live call", async () => {
    const dir = tempDir();
    const provider = buildProvider(config(["run", "--llm=replay", "--no-strict-replay"]), {
      replayCacheDir: dir,
    });
    const result = await provider.invoke(R1_REQUEST);
    expect(result.value).toBeNull();
    expect(result.meta.failure).toBe("CACHE_MISS");
    expect(result.meta.requires_network).toBe(false);
  });
});

describe("ARCHITECTURE.md §6.5 — metered providers are refused by configuration", () => {
  it("refuses every networked provider, so no test run can incur spend", () => {
    // gemini joins the list at spec 1.4.38. A free tier does not change the
    // answer: `meteredCost` is a property of the provider row and buildProvider
    // refuses on `meteredCost || requiresNetwork`, so the CLI stays offline.
    for (const id of ["anthropic", "openai-compatible", "gemini"]) {
      expect(() => buildProvider(config(["run", `--llm=${id}`])), id).toThrow(/refused/);
    }
  });

  it("builds the offline provider with no credential and no network", () => {
    const provider = buildProvider(config(["run"]));
    expect(provider.id).toBe("offline");
    expect(provider.requiresNetwork).toBe(false);
    expect(provider.meteredCost).toBe(false);
  });
});
