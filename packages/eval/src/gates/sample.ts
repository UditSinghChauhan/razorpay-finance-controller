/**
 * The `PREREGISTRATION.md §5.3` differential draw.
 *
 * > *"For `R = 20,000` randomly sampled `(target, member-set)` pairs from the dev
 * > split — **deliberately including inadmissible ones** — the engine's
 * > admissibility verdict must equal the oracle's, constraint by constraint."*
 *
 * **This module exists because `consistency-gate.ts` may not contain it.**
 * `DECISION_BRIEF.md §L.1` rule 3 allows that file to *"contain no logic other
 * than the differential test"*, and its own header records that it *"performs
 * **no sampling** and **no I/O** … the caller draws the pairs"*. Spec 1.4.27
 * (`DATA_MODEL.md §22.2` M43) gives `apps/cli` the job of running the gate, and a
 * composition root holds no logic either — so the draw lives here, beside the
 * gate it feeds and outside the file rule 3 constrains.
 *
 * ## What is frozen here, and what is emphatically not
 *
 * `PREREGISTRATION.md §7` freezes `R = 20,000` and **freezes nothing about the
 * draw** — no sampler, no seed. Spec 1.4.27 declined to resolve it and recorded
 * the gap as `PREREGISTRATION.md §10` **V24**: deriving a seed from the dataset
 * seed was available, cheap and deterministic, and would have been *"a choice
 * made silently because a candidate happened to be deterministic"*, which is the
 * failure `DATA_MODEL.md §22.2` exists to prevent and which M38's own record
 * names in terms.
 *
 * **So this module chooses no seed.** {@link drawPairs} takes one, and
 * `apps/cli` fails closed without it. The seed is recorded beside the result so a
 * gate run always names the draw that produced it. When governance ratifies a
 * sampler this file is where it lands; until then it implements a draw and
 * asserts nothing about its being *the* draw.
 *
 * **The PRNG is `packages/generator`'s vendored xorshift128+.**
 * `ARCHITECTURE.md §11` vendors it precisely so a Node upgrade cannot silently
 * change a benchmark quantity, and `packages/eval` already depends on that
 * package. `Math.random` would make a gate run unreproducible even once the seed
 * is ratified.
 */

import type { Observation } from "@assay/domain";
import { Prng } from "@assay/generator";
import { isTargetKind, memberContribution } from "@assay/oracle";

import type { DifferentialPair } from "./consistency-gate.js";

/** `§5.3`'s bank-side referent for one target, as the caller determined it. */
export interface BankReferent {
  readonly value_date: number;
  readonly bank_line_id: string;
}

export interface DrawOptions {
  /**
   * `AN2`'s determination per target `obs_id`, or absent where none is in scope.
   *
   * `§5.3` scopes `C3`'s bank-arrival exclusion *"per target rather than per
   * dataset"*, so it is carried per pair rather than decided here. An empty map
   * is legitimate and means the half is out of scope on every drawn target.
   */
  readonly bank?: ReadonlyMap<string, BankReferent>;
  /** How many pairs to draw. Defaults to `§7`'s frozen `R`. */
  readonly size?: number;
}

/** `§7`: `R = 20,000`. Restated from `consistency-gate.ts`'s own constant. */
export { DECLARED_SAMPLE_SIZE } from "./consistency-gate.js";

/**
 * Draw `size` `(target, member-set)` pairs from one dataset.
 *
 * **Inadmissible pairs are the point, not a tolerated by-product.** `§5.3` says
 * *"deliberately including inadmissible ones"*, and the draw below applies **no**
 * constraint: member sets are drawn from the whole member-eligible pool of the
 * dataset, not from the target's own allocation, so most pairs fail `C6` and many
 * fail `C3`. A sampler that drew only plausible sets would test the two
 * implementations on the easy half of their domain.
 *
 * **Deterministic in the seed, and in nothing else.** Two calls with equal
 * inputs return equal output; the draw depends on no clock, no `Math.random` and
 * no iteration order over an unordered collection — the targets and the pool are
 * both taken in observation order, which the dataset fixes.
 *
 * Returns fewer than `size` pairs only when the dataset has no target or no
 * member-eligible observation, in which case it returns none; the caller reports
 * `meets_declared_sample_size: false` rather than this module inventing a pair.
 *
 * @param observations the dataset the pairs are drawn from.
 * @param seed the draw's seed. **Not frozen** — `PREREGISTRATION.md §10` V24.
 */
export function drawPairs(
  observations: readonly Observation[],
  seed: number,
  options: DrawOptions = {},
): readonly DifferentialPair[] {
  const size = options.size ?? 20_000;
  const bank = options.bank ?? new Map<string, BankReferent>();

  const targets = observations.filter((o) => isTargetKind(o.kind));
  const pool = observations.filter((o) => memberContribution(o) !== null);
  if (targets.length === 0 || pool.length === 0) return Object.freeze([]);

  const prng = Prng.fromSeed(BigInt(seed));
  const pairs: DifferentialPair[] = [];

  for (let i = 0; i < size; i += 1) {
    const target = targets[prng.below(targets.length)];
    /* c8 ignore next */
    if (target === undefined) continue;

    // A member set of 1..4, small enough that most draws are cheap to compare
    // and large enough that C6's sum has something to reject. The bound is this
    // module's and is not a §7 threshold: it parameterises the draw, which §7
    // does not freeze, and K_max (22) bounds a COMPONENT rather than a sample.
    const count = 1 + prng.below(4);
    const members: Observation[] = [];
    for (let m = 0; m < count; m += 1) {
      const member = pool[prng.below(pool.length)];
      /* c8 ignore next */
      if (member === undefined) continue;
      // Distinct within a pair: a repeated member is not a member SET, and
      // C7's one-allocation rule reads set membership.
      if (!members.some((held) => held.obs_id === member.obs_id)) members.push(member);
    }
    /* c8 ignore next */
    if (members.length === 0) continue;

    const referent = bank.get(target.obs_id) ?? null;
    pairs.push(
      Object.freeze({
        pair_id: `pair_${String(i)}`,
        target,
        members: Object.freeze(members),
        // Nothing is pre-anchored: AN1 anchoring is a property of the real
        // component, and a drawn pair is not one. §5.3 compares the two
        // implementations on the pair as given.
        anchored: Object.freeze([]),
        bank_value_date: referent?.value_date ?? null,
        bank_line_id: referent?.bank_line_id ?? null,
        allocated: Object.freeze([]),
      }),
    );
  }

  return Object.freeze(pairs);
}
