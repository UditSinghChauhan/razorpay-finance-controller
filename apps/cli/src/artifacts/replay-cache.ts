import type { ReplayCache } from "@assay/llm";

import { CliError, EXIT } from "../errors.js";
import { basename, isDirectory, readText, resolve } from "../fs/io.js";
import { readdirJson } from "../fs/json-dir.js";

/**
 * Loading `fixtures/llm-cache/` — `ARCHITECTURE.md §6.5`'s committed response
 * cache.
 *
 * > *"Serves committed responses from `fixtures/llm-cache/`, keyed by
 * > `sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`. Cache miss
 * > under `--strict-replay` is a hard error, never a silent live call."*
 *
 * **The read is here because `packages/llm` refuses to do it.** That package's
 * `replay.ts` says so in terms: *"This provider performs no filesystem I/O. It
 * is handed an already-loaded map. `ARCHITECTURE.md §3` gives `apps/cli` all
 * filesystem I/O, and spec 1.4.18 settled the same split for `S0`: the CLI
 * acquires bytes, the package transforms them."* This module is the acquisition
 * half and does nothing else — it neither computes a cache key nor interprets a
 * response. `cacheKey` is `packages/llm/src/cache-key.ts`'s, and the key a
 * lookup uses is computed there at call time from the request.
 *
 * **The on-disk layout is a convention of this package, not a rule of the
 * specification.** `§6.5` names the directory and the key and stops there; no
 * document states a file layout. One file per key, named for the key, is the
 * most literal reading available — *"keyed by sha256(…)"* with the key as the
 * filename — and it has the property the alternatives lack: a cache entry is a
 * separately reviewable, separately diffable committed file, which is what
 * `EVALUATION_SPEC.md §7`'s reproducibility guarantee asks of a committed
 * artifact. It is recorded here as a convention so that a later specification
 * amendment naming a different layout supersedes this file rather than
 * contradicting a rule nobody wrote.
 */

/** A cache-key filename: 64 lowercase hex characters and `.json`. */
const ENTRY = /^([0-9a-f]{64})\.json$/;

export class ReplayCacheError extends CliError {
  constructor(message: string) {
    super(message, EXIT.FAILURE);
    this.name = "ReplayCacheError";
  }
}

/**
 * Load every committed response under `dir` into the map `replayProvider` takes.
 *
 * Zone `AGENT`: the cache sits on the agent path and neither restricted
 * artifact may be reached through it.
 *
 * @throws ReplayCacheError when the directory is absent or holds a file whose
 *   name is not a cache key. A miss on a **key** is `packages/llm`'s
 *   `ReplayCacheMissError` under `§L.1` rule 11; a malformed **cache** is a
 *   configuration fault and is caught before a single call is made.
 */
export function loadReplayCache(dir: string): ReplayCache {
  if (!isDirectory(dir)) {
    throw new ReplayCacheError(
      `no replay cache at ${JSON.stringify(resolve(dir))}. ARCHITECTURE.md §6.5 serves ` +
        `committed responses from fixtures/llm-cache/; DECISION_BRIEF.md §L.1 rule 11 makes a ` +
        `miss a hard error, so an absent cache is reported here rather than at the first call.`,
    );
  }

  const cache = new Map<string, unknown>();
  for (const path of readdirJson(dir)) {
    const name = basename(path);
    const match = ENTRY.exec(name);
    if (match === null || match[1] === undefined) {
      throw new ReplayCacheError(
        `${JSON.stringify(name)} is not a cache entry. Every file under fixtures/llm-cache/ is ` +
          `named for its §19 cache_key — 64 lowercase hex characters and ".json" — because a ` +
          `file the loader cannot key is a committed response that would never be served, and ` +
          `§L.1 rule 11 would report the resulting miss as ASSAY's fault rather than the ` +
          `cache's.`,
      );
    }
    const text = readText({ path, zone: "AGENT" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      throw new ReplayCacheError(
        `${JSON.stringify(name)} is not valid JSON: ` +
          `${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    cache.set(match[1], parsed);
  }
  return cache;
}
