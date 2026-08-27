/**
 * Shared test fixtures.
 *
 * **Every seed here lies outside `PREREGISTRATION.md §6.1`'s split table.**
 * `§6.1`'s permitted list for held-out families requires their tests to run
 * "under a seed that appears in **no** row of the split table. No seed range is
 * reserved for this purpose; the constraint is exclusion from the splits."
 * `AL7` burns a seed on any breach, so the same rule is applied to every family
 * rather than only to `F07`-`F10`: a single constant is easier to audit than a
 * per-family exception.
 */

import { DECLARED_SEEDS } from "../src/seeds.js";
import { generateFamily } from "../src/generate.js";
import type { FamilyId } from "../src/frozen.js";

/** Seeds used by this package's tests. None appears in `§6.1`. */
export const TEST_SEEDS = Object.freeze([7001, 7002, 7003, 7004, 7005] as const);

for (const seed of TEST_SEEDS) {
  if (DECLARED_SEEDS.includes(seed)) {
    throw new Error(`fixtures: ${String(seed)} is a declared §6.1 split seed; §6.1 forbids its use here.`);
  }
}

/**
 * One generated family instance per `(family, seed)`, computed at most once.
 *
 * `generateFamily` is expensive by design: a single call runs the whole pipeline
 * and emits ~2,621 observations, each parsed against the strict frozen schema
 * and SHA-256 hashed — roughly 110 ms. The suites below assert many separate
 * properties of the same few datasets, so without a memo they recompute
 * identical results dozens of times, and a single `it()` holding a
 * family x seed matrix runs 50 pipelines against vitest's 30 s per-test budget.
 * That is what times out when workspace parallelism competes for the CPU.
 *
 * Memoising is sound rather than a shortcut. `generateFamily` is a pure function
 * of `(family, seed)`: `generate.test.ts` asserts byte-identical output for a
 * repeated call and `property/generate.prop.test.ts` asserts it over random
 * seeds, so determinism is covered by tests that exist for that purpose and is
 * never incidentally "covered" by recomputation elsewhere. Every result is
 * deep-frozen and is only ever read. **No assertion anywhere is removed,
 * relaxed, skipped or given a longer timeout by this**: each one runs against
 * exactly the data it ran against before.
 *
 * The cache is per worker process, so it is bounded by the distinct
 * `(family, seed)` pairs one test file actually touches.
 */
const CACHE = new Map<string, ReturnType<typeof generateFamily>>();

export function dataset(family: FamilyId, seed: number): ReturnType<typeof generateFamily> {
  const key = `${family}:${String(seed)}`;
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;
  const built = generateFamily(family, seed);
  CACHE.set(key, built);
  return built;
}
