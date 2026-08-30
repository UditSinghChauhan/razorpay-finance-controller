import { createHash } from "node:crypto";

import { hashCanonical, type LlmProviderId } from "@assay/ledger";
import type { CanonicalValue } from "@assay/domain";

import type { StructuredRoleInput } from "./provider.js";

/**
 * `DATA_MODEL.md §19`'s content hashes.
 *
 * ```
 *   cache_key = sha256(provider || model_id || system_prompt_hash || input_hash)
 * ```
 *
 * transcribed literally, including the concatenation. Concatenation of
 * variable-length strings is not injective in general; it is here, because
 * `provider` is drawn from `§19`'s closed four-member union and the two hashes
 * are fixed-width hex, so no two distinct call descriptions share a preimage.
 * The literal form is kept because `ARCHITECTURE.md §6.5` makes this key the
 * thing a **committed** cache is addressed by — `fixtures/llm-cache/`, keyed by
 * `sha256(provider || model_id || system_prompt_hash || input_hash)` — and a
 * cache whose key is computed one way and read another is a cache that misses
 * every time.
 *
 * The component hashes use `hashCanonical` (`DATA_MODEL.md §0` rule 5), so an
 * input's hash does not depend on key order or on how a caller happened to
 * build the object.
 */

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * `system_prompt_hash` — the hash of the versioned prompt id.
 *
 * `§19` requires the id to be *"versioned, stable across a benchmark version"*
 * and carries the hash beside it. Hashing the id rather than prompt text keeps
 * the record free of configuration that `THREAT_MODEL.md §T11` requires never to
 * be logged: *"`llm_call` records store prompt **hashes**, never prompt text
 * containing configuration."*
 */
export function systemPromptHash(systemPromptId: string): string {
  return hashCanonical(systemPromptId as CanonicalValue);
}

/**
 * `input_hash` — the canonical hash of the structured role input.
 *
 * Covers the quarantined narration where one is present, which is what makes a
 * replay cache entry specific to the text it was recorded against.
 */
export function inputHash(input: StructuredRoleInput): string {
  return hashCanonical(input as unknown as CanonicalValue);
}

/** `raw_response_hash` — the canonical hash of what the provider returned. */
export function rawResponseHash(raw: unknown): string {
  return hashCanonical(raw as CanonicalValue);
}

/** `§19`: `sha256(provider || model_id || system_prompt_hash || input_hash)`. */
export function cacheKey(args: {
  readonly provider: LlmProviderId;
  readonly modelId: string;
  readonly systemPromptHash: string;
  readonly inputHash: string;
}): string {
  return sha256Hex(args.provider + args.modelId + args.systemPromptHash + args.inputHash);
}

/** Build every `§19` hash for one call in a single step. */
export function callHashes(args: {
  readonly provider: LlmProviderId;
  readonly modelId: string;
  readonly systemPromptId: string;
  readonly input: StructuredRoleInput;
}): {
  readonly system_prompt_hash: string;
  readonly input_hash: string;
  readonly cache_key: string;
} {
  const system = systemPromptHash(args.systemPromptId);
  const inputs = inputHash(args.input);
  return {
    system_prompt_hash: system,
    input_hash: inputs,
    cache_key: cacheKey({
      provider: args.provider,
      modelId: args.modelId,
      systemPromptHash: system,
      inputHash: inputs,
    }),
  };
}
