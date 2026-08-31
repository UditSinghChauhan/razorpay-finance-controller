/**
 * One `(split, seed)` dataset — the committed artifact unit (`DATA_MODEL.md
 * §22.2` M42, spec 1.4.27).
 *
 * `PREREGISTRATION.md §4.1` has defined a dataset this way since benchmark
 * v1.0.1 — *"a `(split, seed)` dataset holds exactly the families `§6.1` assigns
 * to that seed's range, and it is the sum over **those** families that must fall
 * in the 10,000-20,000 band"* — and `EVALUATION_SPEC.md §2` loops `for seed in
 * seeds(split)` with **no family loop**. What no frozen document ever said was
 * how the family instances compose into the files `§9` steps 4 and 5 hash. M42
 * settles it, and this module is that settlement.
 *
 * **Family is a composition dimension, never a file dimension.** `generateFamily`
 * still produces one family instance and nothing about it changes; this module
 * concatenates a seed's instances into the four dataset artifacts.
 *
 * **This package still writes no file.** The rows are data; `apps/cli`
 * serializes them, exactly as it already does for `recon-report.ts`. What is
 * *not* `apps/cli`'s is the re-basing below: `ARCHITECTURE.md §3` bars that app
 * from performing an `S0` transform and `RECONCILIATION_SPEC.md §2` step 5 makes
 * provenance stamping `S0`'s, so the package that owns `U-SOURCE-FILES` owns the
 * renumbering.
 */

import type { Observation } from "@assay/domain";
// The quarantined store has its own subpath export so it stays separately
// bannable (`DATA_MODEL.md §10`); `emit.ts` imports it the same way.
import type { UntrustedText } from "@assay/domain/untrusted-text";

import { IMPLEMENTED_FAMILIES, type FamilyId } from "./frozen.js";
import {
  generateFamily, type GeneratedFamily, type GenerateOptions, type GroundTruth,
} from "./generate.js";
import type { ReconReportRow } from "./recon-report.js";
import { familiesFor } from "./seeds.js";

/**
 * The four dataset artifacts for one `(split, seed)`, as rows.
 *
 * `recon_report` is carried per dataset **and is not a dataset artifact**. M36
 * scopes `bench/<split>/recon_report.jsonl` to the split and M42 leaves it there:
 * it is `RECONCILIATION_SPEC.md §6.2`'s probe response surface, *"never an
 * `Observation`, and never ingested"*, keyed by a `settlement_id` unique across
 * every family and seed — a lookup table has nothing to partition. The rows ride
 * along here so the caller can merge one split's datasets through
 * {@link mergeReconReports} without generating twice.
 */
export interface GeneratedDataset {
  readonly seed: number;
  /** `§6.1`'s families for this seed, in `§4.1` table order. */
  readonly families: readonly FamilyId[];
  /** Every family's observations, concatenated, with `source_line` re-based. */
  readonly observations: readonly Observation[];
  readonly untrusted_text: readonly UntrustedText[];
  /**
   * One `GroundTruth` per family, in the same order.
   *
   * Not merged into a single record: `DATA_MODEL.md §1` types it per family
   * instance and it carries its own `seed` and `family_id`, so the aggregated
   * artifact is self-describing and `PREREGISTRATION.md §5.3`'s per-family
   * reporting has a key to group on.
   */
  readonly ground_truth: readonly GroundTruth[];
  /** This seed's contribution to the split-scoped `§6.2` probe surface. */
  readonly recon_report: readonly ReconReportRow[];
}

/**
 * `§4.1`'s table order, F01..F10 ascending — ratified at spec 1.4.27 (M42).
 *
 * `familiesFor` returns `§6.1`'s row as written and every row happens to be
 * ascending today, so this sort changes nothing now. It is applied anyway
 * because the aggregation order is what the sealed bytes rest on: an order that
 * holds because a table happens to be typed in it is not an order, and M42
 * ratifies **F01..F10 ascending** rather than "whatever `§6.1` lists".
 */
function inTableOrder(families: readonly FamilyId[]): readonly FamilyId[] {
  const rank = new Map<FamilyId, number>(
    IMPLEMENTED_FAMILIES.map((family, index) => [family, index]),
  );
  return [...families].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    /* c8 ignore next 5 */
    if (ra === undefined || rb === undefined) {
      throw new Error(
        `buildDataset: ${ra === undefined ? a : b} is not an implemented family. ` +
          `PREREGISTRATION.md §4.1 gives F11/F12 target_record_count 0 and §6.1 ` +
          `assigns them to no seed.`,
      );
    }
    return ra - rb;
  });
}

/**
 * Re-base `source_line` to 1-based within the aggregated logical file.
 *
 * **Required, not cosmetic.** `conventions.ts` `U-SOURCE-FILES` gives one logical
 * filename per source system and numbers `source_line` *"1-based within the
 * file"*, per family instance. Concatenating six families without this puts six
 * observations at `pg_recon.jsonl` line 1 inside one dataset, against
 * `ARCHITECTURE.md §4`'s *"Every record carries `source_system`, `source_file`,
 * `source_line`, `ingest_hash`. Nothing enters the system anonymously."*
 *
 * **Free of hash consequences.** `emit.ts` computes `ingest_hash` as
 * `hashCanonical(payload)` — the canonical **payload** alone — so no
 * `ingest_hash`, no `inputs_hash` and no hashed ledger body moves. Nothing in
 * `packages/engine`, `packages/oracle` or `packages/eval` reads `source_line`;
 * `packages/domain`'s schema is its only other consumer, and it requires a
 * non-negative integer, which a 1-based counter is.
 *
 * The spread preserves key insertion order, so the serialized bytes differ from
 * the un-aggregated form in exactly the one value that changed.
 */
function rebaseSourceLines(observations: readonly Observation[]): readonly Observation[] {
  const next = new Map<string, number>();
  return observations.map((observation) => {
    const line = (next.get(observation.source_file) ?? 0) + 1;
    next.set(observation.source_file, line);
    return Object.freeze({ ...observation, source_line: line });
  });
}

/**
 * Aggregate already-generated family instances into one dataset.
 *
 * Separate from {@link buildDataset} so the **aggregation** — M42's whole
 * subject — is exercisable without generating at a declared seed.
 * `PREREGISTRATION.md §6.1`'s permitted list requires a generator test to run
 * *"under a seed that appears in **no** row of the split table"*, and
 * `familiesFor` only answers for a declared one; a function that takes the
 * instances lets the suite satisfy both.
 *
 * The family list is **not** a policy input: `buildDataset` derives it from
 * `§6.1` and this function only orders what it is given. A caller that assembled
 * the wrong set would have had to bypass the split table to obtain it.
 */
export function aggregateFamilies(
  seed: number,
  instances: readonly GeneratedFamily[],
): GeneratedDataset {
  const ordered = inTableOrder(instances.map((instance) => instance.family_id));
  const byFamily = new Map(instances.map((instance) => [instance.family_id, instance]));

  const observations: Observation[] = [];
  const untrusted: UntrustedText[] = [];
  const truth: GroundTruth[] = [];
  const report: ReconReportRow[] = [];

  for (const family of ordered) {
    const generated = byFamily.get(family);
    /* c8 ignore next */
    if (generated === undefined) continue;
    if (generated.seed !== seed) {
      throw new Error(
        `aggregateFamilies: ${family} was generated at seed ${String(generated.seed)}, not ` +
          `${String(seed)}. A dataset is one (split, seed) (DATA_MODEL.md §22.2 M42); mixing ` +
          `seeds would produce an artifact no manifest describes.`,
      );
    }
    observations.push(...generated.observations);
    untrusted.push(...generated.untrusted_text);
    truth.push(generated.ground_truth);
    report.push(...generated.recon_report);
  }

  return Object.freeze({
    seed,
    families: Object.freeze(ordered),
    observations: Object.freeze(rebaseSourceLines(observations)),
    // `untrusted_text` carries no line number — `DATA_MODEL.md §10` keys it on
    // `obs_id` — so concatenation is the whole of its aggregation.
    untrusted_text: Object.freeze(untrusted),
    ground_truth: Object.freeze(truth),
    recon_report: Object.freeze(report),
  }) satisfies GeneratedDataset;
}

/**
 * Build one `(split, seed)` dataset.
 *
 * The families are `§6.1`'s for this seed and are never a parameter: the split
 * table is frozen and `familiesFor` is its only reader. `options` is forwarded
 * unchanged to `generateFamily`, so `allow_declared_seed` still has to be passed
 * explicitly by a caller that genuinely means to build a split — `AL7` burns a
 * seed on a breach of `§6.1`'s forbidden list and that guard is not weakened by
 * being called in a loop.
 */
export function buildDataset(seed: number, options: GenerateOptions = {}): GeneratedDataset {
  const families = inTableOrder(familiesFor(seed));
  return aggregateFamilies(
    seed,
    families.map((family) => generateFamily(family, seed, options)),
  );
}

/**
 * Merge several datasets' rows into the split-scoped `§6.2` probe surface.
 *
 * **`entity_id` ascending, which is M38's order and not a new one.** M38
 * ratified that order for `bench/<split>/recon_report.jsonl` and M42 leaves the
 * artifact exactly where M36 put it, so the order now holds over the merged
 * split file — which is what it was always for: *"It is fixed only so the bytes,
 * and therefore `recon_report_sha256`, are stable."* Code-unit comparison, not
 * `localeCompare`, for the reason `recon-report.ts` gives: a locale-aware
 * comparison would make the sealed bytes depend on the machine that produced
 * them.
 *
 * **No cross-dataset distinctness is asserted.** `recon-report.ts` asserts it
 * *within* a family instance, where `mint.ts` guarantees it. Across families and
 * seeds the property is the probabilistic one `DATA_MODEL.md §0` rule 3 and the
 * minter already characterize, and M42 declines to promote it to an invariant:
 * a check no frozen rule requires would dress a probability as a guarantee.
 */
export function mergeReconReports(
  datasets: readonly GeneratedDataset[],
): readonly ReconReportRow[] {
  const rows = datasets.flatMap((dataset) => [...dataset.recon_report]);
  rows.sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));
  return Object.freeze(rows);
}
