/**
 * The split table, and `AL7`'s burn/successor rule.
 *
 * `PREREGISTRATION.md §6.1` fixes which families and seeds belong to each
 * split, and `§6.2` `AL7` says a burned seed "is discarded and replaced" without
 * saying how. `§6.2` then supplies the rule, and gives the reason it has to
 * exist: "Choosing a replacement after a burn, with no declared rule, would be a
 * free choice made after something was observed."
 *
 * The rule "is **computable before generation** from the declared configuration
 * alone. It reads no result, no model output and no measure of difficulty, and
 * it admits no human choice at the moment of a burn — which is the property that
 * makes it auditable." Nothing in this module takes a metric, an outcome or a
 * date.
 */

import { SEEDS_PER_CONFIGURATION, SPLIT_TABLE, type FamilyId } from "./frozen.js";

export type Split = "train" | "dev" | "test";

/** One row of `§6.1`'s table: a family set, a split, and its five declared seeds. */
export interface SeedBlock {
  readonly split: Split;
  readonly families: readonly FamilyId[];
  readonly seeds: readonly number[];
  /** The block maximum `AL7`'s successor rule counts from. */
  readonly max: number;
}

/** `§6.1`'s four blocks, with each block's maximum derived rather than restated. */
export const SEED_BLOCKS: readonly SeedBlock[] = Object.freeze(
  SPLIT_TABLE.map((row) =>
    Object.freeze({
      split: row.split as Split,
      families: row.families as readonly FamilyId[],
      seeds: row.seeds,
      max: Math.max(...row.seeds),
    }),
  ),
);

/** Every seed named in `§6.1`. A test seed must never be one of these. */
export const DECLARED_SEEDS: readonly number[] = Object.freeze(
  SEED_BLOCKS.flatMap((block) => [...block.seeds]).sort((a, b) => a - b),
);

/** Whether `seed` appears in any row of `§6.1`'s split table. */
export function isDeclaredSeed(seed: number): boolean {
  return DECLARED_SEEDS.includes(seed);
}

/** The block a declared seed belongs to, or `null`. */
export function blockOf(seed: number): SeedBlock | null {
  return SEED_BLOCKS.find((block) => block.seeds.includes(seed)) ?? null;
}

/** The families `§6.1` assigns to a `(split, seed)` dataset. */
export function familiesFor(seed: number): readonly FamilyId[] {
  const block = blockOf(seed);
  if (block === null) {
    throw new RangeError(
      `familiesFor: ${String(seed)} appears in no row of PREREGISTRATION.md §6.1's split table.`,
    );
  }
  return block.families;
}

/** One recorded burn, as `AL7` requires the manifest to carry it. */
export interface Burn {
  readonly burned: number;
  readonly successor: number;
  /** `AL7`'s two triggers: an inspected TEST record, or a `§6.1` forbidden-list breach. */
  readonly reason: "TEST_RECORD_INSPECTED" | "HELD_OUT_FORBIDDEN_LIST_BREACH";
}

/**
 * The burn register — `AL7`, applied iteratively.
 *
 * "successor: the **LOWEST INTEGER STRICTLY GREATER** than the burned seed's own
 * declared block maximum that has not itself been burned."
 *
 *     9000-9004 -> 9005, then 9006, then 9007, ...
 *     9100-9104 -> 9105, then 9106, ...
 *     2000-2004 -> 2005 ;  1000-1004 -> 1005
 */
export class BurnRegister {
  readonly #burns: Burn[] = [];

  /** Every burn, in the order it was recorded. Goes into `BenchmarkManifest`. */
  get burns(): readonly Burn[] {
    return [...this.#burns];
  }

  /** Whether `seed` has been burned. */
  isBurned(seed: number): boolean {
    return this.#burns.some((burn) => burn.burned === seed);
  }

  /**
   * Whether `seed` has already been handed out as a successor.
   *
   * `AL7`'s clause reads "that has not itself been burned", and taken alone it
   * would hand the same successor to two burns from one block. `§6.2`'s own
   * enumeration settles it — "9000-9004 -> **9005, then 9006, then 9007, ...**"
   * — so a successor already in force is unavailable as well. Skipping only
   * burned seeds would put two blocks on one seed, which is the collision the
   * rule exists to prevent.
   */
  isAllocated(seed: number): boolean {
    return this.#burns.some((burn) => burn.successor === seed);
  }

  /** The successor `AL7` prescribes for `seed`, without recording anything. */
  successorFor(seed: number): number {
    const block = this.#blockFor(seed);
    let candidate = block.max + 1;
    while (this.isBurned(candidate) || this.isAllocated(candidate)) candidate += 1;
    this.#assertNoCollision(candidate, block);
    return candidate;
  }

  /** Record a burn and return its successor. Repeated burns apply the rule iteratively. */
  burn(seed: number, reason: Burn["reason"]): number {
    if (this.isBurned(seed)) {
      throw new Error(`BurnRegister: ${String(seed)} is already burned; AL7 replaces a seed once.`);
    }
    const successor = this.successorFor(seed);
    this.#burns.push({ burned: seed, successor, reason });
    return successor;
  }

  /** The seeds in force for a block after every recorded burn. */
  effectiveSeeds(block: SeedBlock): number[] {
    const out = block.seeds.map((seed) => this.#resolve(seed));
    if (out.length !== SEEDS_PER_CONFIGURATION) {
      /* c8 ignore next 4 */
      throw new Error(
        `BurnRegister: a block resolved to ${String(out.length)} seeds; PREREGISTRATION.md §7 ` +
          `fixes "Seeds per configuration = 5".`,
      );
    }
    return out;
  }

  #resolve(seed: number): number {
    let current = seed;
    const seen = new Set<number>([current]);
    for (;;) {
      const burn = this.#burns.find((b) => b.burned === current);
      if (burn === undefined) return current;
      current = burn.successor;
      if (seen.has(current)) {
        /* c8 ignore next */
        throw new Error(`BurnRegister: the successor chain from ${String(seed)} cycles.`);
      }
      seen.add(current);
    }
  }

  /**
   * A burned seed's own declared block, following any successor chain back.
   *
   * A successor is not itself in `§6.1`'s table, so burning a successor has to
   * resolve to the block the original came from — otherwise the rule would not
   * be "total and needs no further decision at any point".
   */
  #blockFor(seed: number): SeedBlock {
    const declared = blockOf(seed);
    if (declared !== null) return declared;
    const origin = this.#burns.find((burn) => burn.successor === seed);
    if (origin === undefined) {
      throw new RangeError(
        `BurnRegister: ${String(seed)} is neither a declared §6.1 seed nor the successor of a ` +
          `recorded burn, so AL7's rule has no block maximum to count from.`,
      );
    }
    return this.#blockFor(origin.burned);
  }

  /**
   * `§6.2`: "blocks are 100 apart and every burn is recorded, so a successor can
   * never collide with another block's range nor with a previously burned seed.
   * **The generator asserts non-collision before use.**"
   */
  #assertNoCollision(candidate: number, block: SeedBlock): void {
    for (const other of SEED_BLOCKS) {
      if (other === block) continue;
      if (other.seeds.includes(candidate)) {
        throw new Error(
          `BurnRegister: AL7's successor ${String(candidate)} collides with the ` +
            `${other.split} block ${other.seeds.join(",")}. §6.2 asserts this cannot happen.`,
        );
      }
    }
    if (this.isBurned(candidate) || this.isAllocated(candidate)) {
      /* c8 ignore next */
      throw new Error(`BurnRegister: AL7's successor ${String(candidate)} is already burned or in force.`);
    }
  }
}
