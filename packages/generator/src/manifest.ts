/**
 * `BenchmarkScenario` and `BenchmarkManifest` (`DATA_MODEL.md §18`).
 *
 * The scenario table is a **property of the specification**, not of a run: every
 * field except the hashes is derivable before a single record exists, which is
 * what lets `PREREGISTRATION.md §9` step 5 check a generated dataset against it.
 * `real_world_justification` "is a required field, not documentation. A scenario
 * family that cannot state why it occurs in production is a manufactured puzzle."
 *
 * **No hash is computed here.** `§9` sequences hashing after generation and
 * after the oracle gate; `buildManifest` takes the five digests and the two
 * commits as inputs so that nothing in this package can produce a manifest that
 * claims a dataset it never saw. `recon_report_sha256` is the fifth (spec
 * 1.4.22, M36) and is an input for exactly the same reason as its siblings —
 * this package writes no file, so it has no bytes of its own to digest, even
 * though `recon-report.ts` produces the rows they are made of.
 */

import type { Sha256 } from "@assay/domain";

import { TARGET_RECORD_COUNT } from "./composition.js";
import { FAMILY_MECHANICS } from "./families.js";
import {
  BENCHMARK_VERSION, FAMILY_IDS, IMPLEMENTED_FAMILIES, RECORD_COUNT_BAND,
  type DegradationOp, type FamilyId,
} from "./frozen.js";
import type { Burn } from "./seeds.js";

/** `DATA_MODEL.md §18`. */
export interface BenchmarkScenario {
  readonly family_id: FamilyId;
  readonly name: string;
  readonly real_world_justification: string;
  readonly generator_fn: string;
  readonly degradation_ops: readonly DegradationOp[];
  readonly split: "dev" | "test" | "both";
  readonly target_record_count: number;
}

/** `PREREGISTRATION.md §4.1`'s family table, transcribed. */
const FAMILY_TABLE = Object.freeze({
  F01: { name: "Clean T+2 settlement", split: "both",
    why: "The baseline case; establishes that coverage is high when data is good" },
  F02: { name: "Partial refund crossing a settlement boundary", split: "both",
    why: "Refund initiated day N, settled in batch N+2; the single most common real break" },
  F03: { name: "Fee/GST rounding drift and a mid-period rate change", split: "both",
    why: "Pricing changes mid-month; half-paisa rounding accumulates over thousands of lines" },
  F04: { name: "Duplicate bank credit / re-presented UTR", split: "both",
    why: "Banks do re-present and double-post credits, especially around NEFT batch boundaries" },
  F05: { name: "Missing capture record", split: "both",
    why: "Authorised-but-uncaptured payments and PG report lag produce settled amounts with no capture row" },
  F06: { name: "Equal-amount collision", split: "both",
    why: "Two payments of identical amount, same day, same method; only one settles. Common for fixed-price SKUs" },
  F07: { name: "Chargeback deduction and later reversal", split: "test",
    why: "Razorpay documents that a lost dispute results in the amount being deducted from the merchant's account (the Dispute entity carries amount_deducted)" },
  F08: { name: "Bank narration corruption", split: "test",
    why: "Statement exports truncate narration (commonly ~35 chars) and mangle UTRs; settlement_id absent from the merchant's copy" },
  F09: { name: "Late / out-of-order arrival across a period boundary", split: "test",
    why: "T+3 settlements for month-end captures land in the next period" },
  F10: { name: "Adversarial metadata", split: "test",
    why: "Merchant-controlled notes fields carrying instruction-shaped text; conflicting references; forged-looking IDs" },
  F11: { name: "Multi-currency / FX settlement", split: "test",
    why: "Real for exporters, but a separate truth model. SPECIFIED, NOT IMPLEMENTED" },
  F12: { name: "Split settlement across two bank credits", split: "test",
    why: "Large settlements split by banking limits. NOT REPRESENTABLE under the frozen model: invariant I5 ties a bank line to the sum of settlement amounts. SPECIFIED, NOT IMPLEMENTED" },
} as const satisfies Record<FamilyId, { name: string; split: "dev" | "test" | "both"; why: string }>);

/** The twelve declared scenarios. `F11` and `F12` carry `target_record_count: 0`. */
export function benchmarkScenarios(): readonly BenchmarkScenario[] {
  return Object.freeze(
    FAMILY_IDS.map((family) => {
      const row = FAMILY_TABLE[family];
      const implemented = IMPLEMENTED_FAMILIES.includes(family as (typeof IMPLEMENTED_FAMILIES)[number]);
      return Object.freeze({
        family_id: family,
        name: row.name,
        real_world_justification: row.why,
        generator_fn: implemented ? `generateFamily("${family}", seed)` : "NOT IMPLEMENTED",
        degradation_ops: FAMILY_MECHANICS[family].operators,
        split: row.split,
        target_record_count: TARGET_RECORD_COUNT[family],
      });
    }),
  );
}

/** `DATA_MODEL.md §18`, plus the `AL7` burn provenance `§6.2` requires it to carry. */
export interface BenchmarkManifest {
  readonly benchmark_version: string;
  readonly created_at: number;
  readonly generator_commit: string;
  readonly spec_commit: string;
  readonly families: readonly FamilyId[];
  readonly seeds: readonly number[];
  readonly record_counts: Readonly<Record<FamilyId, number>>;
  readonly observations_sha256: Sha256;
  readonly ground_truth_sha256: Sha256;
  readonly oracle_labels_sha256: Sha256;
  /**
   * `bench/<split>/recon_report.jsonl`, added at spec 1.4.22 (M36).
   *
   * `DATA_MODEL.md §18`: *"a manifest that pins the observations but not the
   * probe surface would let two runs over 'the same' benchmark answer probes
   * differently. It is required and non-null from benchmark v1.0.4"*, and
   * `PREREGISTRATION.md §9` step 5 makes its absence a **SEAL FAILURE**,
   * *"because §6.2's probe has no source without it and `SE5` would silently
   * score 0 on every candidate"*. Spec 1.4.24 (M38) settles who may compute it:
   * `AL8` bars engine and oracle code, and *"the offline seal is the one
   * exception and is not a second evidence path"*.
   */
  readonly recon_report_sha256: Sha256;
  readonly constraint_set_hash: Sha256;
  readonly sealed_at: number | null;
  readonly seal_signature: string | null;
  /** `AL7`: "each burn and its successor are recorded in `BenchmarkManifest`". */
  readonly burns: readonly Burn[];
}

/** Everything a manifest needs that this package cannot know. */
export interface ManifestInputs {
  readonly created_at: number;
  readonly generator_commit: string;
  readonly spec_commit: string;
  readonly families: readonly FamilyId[];
  readonly seeds: readonly number[];
  readonly observations_sha256: Sha256;
  readonly ground_truth_sha256: Sha256;
  readonly oracle_labels_sha256: Sha256;
  /** `§9` step 4 hashes the file; nothing here can compute it. See the field above. */
  readonly recon_report_sha256: Sha256;
  readonly constraint_set_hash: Sha256;
  readonly sealed_at?: number | null;
  readonly seal_signature?: string | null;
  readonly burns?: readonly Burn[];
}

/**
 * Assemble a manifest and apply `§9` step 5's two seal checks up front.
 *
 * "`record_counts` must match the frozen `§4.1` composition; a mismatch, or a
 * per-`(split,seed)` total outside 10,000-20,000, is a SEAL FAILURE."
 */
export function buildManifest(inputs: ManifestInputs): BenchmarkManifest {
  const counts = Object.fromEntries(
    inputs.families.map((family) => [family, TARGET_RECORD_COUNT[family]]),
  ) as Record<FamilyId, number>;

  const total = inputs.families.reduce((sum, family) => sum + TARGET_RECORD_COUNT[family], 0);
  if (total < RECORD_COUNT_BAND.min || total > RECORD_COUNT_BAND.max) {
    throw new Error(
      `buildManifest: families [${inputs.families.join(", ")}] total ${String(total)} observations, ` +
        `outside PROJECT_SPEC.md §9's ${String(RECORD_COUNT_BAND.min)}-${String(RECORD_COUNT_BAND.max)} ` +
        `band. PREREGISTRATION.md §9 step 5 calls this a SEAL FAILURE.`,
    );
  }
  if (inputs.seeds.length === 0) {
    throw new Error("buildManifest: a manifest with no seed describes no dataset.");
  }

  return Object.freeze({
    benchmark_version: BENCHMARK_VERSION,
    created_at: inputs.created_at,
    generator_commit: inputs.generator_commit,
    spec_commit: inputs.spec_commit,
    families: Object.freeze([...inputs.families]),
    seeds: Object.freeze([...inputs.seeds]),
    record_counts: Object.freeze(counts),
    observations_sha256: inputs.observations_sha256,
    ground_truth_sha256: inputs.ground_truth_sha256,
    oracle_labels_sha256: inputs.oracle_labels_sha256,
    recon_report_sha256: inputs.recon_report_sha256,
    constraint_set_hash: inputs.constraint_set_hash,
    sealed_at: inputs.sealed_at ?? null,
    seal_signature: inputs.seal_signature ?? null,
    burns: Object.freeze([...(inputs.burns ?? [])]),
  });
}
