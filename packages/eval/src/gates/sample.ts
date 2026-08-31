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
 * ## The whole draw is frozen, sampler and seed together
 *
 * Spec 1.4.27 left both open and made `apps/cli` fail closed rather than derive a
 * seed. **Spec 1.4.28 (`DATA_MODEL.md §22.2` M44) freezes them into
 * `PREREGISTRATION.md §7`, bound by `AL3`:**
 *
 * ```
 *   R                     20,000 pairs, UNCHANGED, per (dev, seed) dataset
 *   CONSISTENCY_DRAW_SEED 417203, shared by every dev dataset
 *   member-set size       uniformly 1..4, drawn BEFORE the member indices
 *   target pool           every target-kind observation in the dataset
 *   member pool           every member-eligible observation (§11.1)
 *   anchored/allocated    always empty
 *   draw order            target index, then member-set size, then members
 *   PRNG consumption      exactly one word per index draw
 * ```
 *
 * **Both had to be frozen, and freezing only the seed would have frozen
 * nothing.** A seed selects a path through a PRNG stream; it selects **pairs**
 * only in combination with the procedure that consumes the stream. Change the
 * member-set bound, the draw order, either pool, or the words consumed per pair,
 * and the same seed draws a different sample. `ARCHITECTURE.md §7.3` names *"the
 * sampler and seed"* as one object and `§7` now carries both — so **this module
 * holds no literal of its own**; every parameter comes from `frozen.ts`.
 *
 * **`417203` is a ratification, not a derivation.** Deriving from a `§6.1`
 * dataset seed was available and rejected: at least four derivations exist and no
 * document selects among them, `substream(seed, family, stream)` is the
 * generator's **phase** namespace and a gate is not a generation phase, and a
 * `§6.1` seed is fixed by `§7` for **generation**. What makes the value
 * legitimate is that it was fixed **before any dev gate result existed**.
 *
 * **The PRNG is `packages/generator`'s vendored xorshift128+, reached through
 * `Prng.fromSeed` and never through `substream`.** `ARCHITECTURE.md §11` vendors
 * it precisely so a Node upgrade cannot silently change a benchmark quantity, and
 * `EVALUATION_SPEC.md §5.2`'s bootstrap already reaches it the same way — sharing
 * the algorithm, not the seed space. `Math.random` would make a gate run
 * unreproducible outright.
 */

import type { Observation } from "@assay/domain";
import { Prng } from "@assay/generator";
import { isTargetKind, memberContribution } from "@assay/oracle";

import {
  CONSISTENCY_DRAW_SEED, CONSISTENCY_MEMBER_SET_MAX, CONSISTENCY_SAMPLE_SIZE,
} from "../frozen.js";
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
  /**
   * How many pairs to draw. Defaults to `§7`'s frozen `R`.
   *
   * An override for a caller that is not running the gate — a property test, say.
   * `§7` fixes `R` and `AL3` binds it, so an official run never passes this.
   */
  readonly size?: number;
}

/** `§7`'s `R`, re-exported from the one place it is transcribed. */
export { CONSISTENCY_SAMPLE_SIZE, CONSISTENCY_DRAW_SEED, CONSISTENCY_MEMBER_SET_MAX };

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
 * @param seed the draw's seed. Defaults to `§7`'s frozen
 *   {@link CONSISTENCY_DRAW_SEED}; a caller supplies one only for
 *   **non-authoritative** local exploration, which `apps/cli` refuses on a
 *   sealed or official run (`AL3`, M44).
 */
export function drawPairs(
  observations: readonly Observation[],
  seed: number = CONSISTENCY_DRAW_SEED,
  options: DrawOptions = {},
): readonly DifferentialPair[] {
  const size = options.size ?? CONSISTENCY_SAMPLE_SIZE;
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

    // §7's member-set bound, frozen at spec 1.4.28 (M44) WITH the seed: change
    // it and the same seed draws a different sample. Drawn BEFORE the member
    // indices, which is part of what §7 fixes -- the draw order decides the
    // stream path as much as the bound does.
    const count = 1 + prng.below(CONSISTENCY_MEMBER_SET_MAX);
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
