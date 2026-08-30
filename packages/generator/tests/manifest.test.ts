import { describe, expect, it } from "vitest";

import { canonicalConstraintSet } from "@assay/domain";
import { hashCanonical } from "@assay/ledger";

import { TARGET_RECORD_COUNT } from "../src/composition.js";
import { FAMILY_IDS, BENCHMARK_VERSION, type FamilyId } from "../src/frozen.js";
import { benchmarkScenarios, buildManifest } from "../src/manifest.js";
import { BurnRegister, SEED_BLOCKS } from "../src/seeds.js";

const digest = hashCanonical({ placeholder: 1 });

const inputs = (families: readonly FamilyId[], seeds: readonly number[]) => ({
  created_at: 1_785_522_599,
  generator_commit: "0".repeat(40),
  spec_commit: "1".repeat(40),
  families,
  seeds,
  observations_sha256: digest,
  ground_truth_sha256: digest,
  oracle_labels_sha256: digest,
  recon_report_sha256: digest,
  constraint_set_hash: hashCanonical(JSON.parse(canonicalConstraintSet()) as never),
});

describe("§18 BenchmarkScenario", () => {
  it("declares all twelve families with a required real-world justification", () => {
    const scenarios = benchmarkScenarios();
    expect(scenarios.map((s) => s.family_id)).toStrictEqual([...FAMILY_IDS]);
    for (const scenario of scenarios) {
      expect(scenario.real_world_justification.length).toBeGreaterThan(30);
      expect(scenario.name).toBeTruthy();
      expect(scenario.target_record_count).toBe(TARGET_RECORD_COUNT[scenario.family_id]);
    }
  });

  it("marks F11 and F12 NOT IMPLEMENTED with a zero record count", () => {
    for (const scenario of benchmarkScenarios()) {
      if (scenario.family_id !== "F11" && scenario.family_id !== "F12") continue;
      expect(scenario.generator_fn).toBe("NOT IMPLEMENTED");
      expect(scenario.target_record_count).toBe(0);
      expect(scenario.degradation_ops).toStrictEqual([]);
    }
  });

  it("assigns F07-F10 to the test split alone", () => {
    for (const scenario of benchmarkScenarios()) {
      if (["F07", "F08", "F09", "F10"].includes(scenario.family_id)) expect(scenario.split).toBe("test");
      if (["F01", "F02", "F03", "F04", "F05", "F06"].includes(scenario.family_id)) {
        expect(scenario.split).toBe("both");
      }
    }
  });

  it("lists each family's declared operators and no other", () => {
    const byFamily = new Map(benchmarkScenarios().map((s) => [s.family_id, s.degradation_ops]));
    expect(byFamily.get("F04")).toStrictEqual(["DUPLICATE_ROW"]);
    expect(byFamily.get("F08")).toStrictEqual(["DROP_SETTLEMENT_ID", "MANGLE_UTR", "TRUNCATE_NARRATION"]);
    expect(byFamily.get("F10")).toStrictEqual(["INJECT_NOTES", "CONFLICT_REFERENCE"]);
    expect(byFamily.get("F01")).toStrictEqual([]);
  });
});

describe("§18 BenchmarkManifest", () => {
  it("reads benchmark_version 1.0.3 and carries the frozen record_counts", () => {
    const block = SEED_BLOCKS[3];
    if (block === undefined) throw new Error("missing block");
    const manifest = buildManifest(inputs(block.families, block.seeds));
    expect(manifest.benchmark_version).toBe(BENCHMARK_VERSION);
    expect(manifest.record_counts).toStrictEqual({ F07: 2623, F08: 2621, F09: 2621, F10: 2621 });
    expect(manifest.sealed_at).toBeNull();
    expect(manifest.seal_signature).toBeNull();
  });

  it("refuses a family set outside PROJECT_SPEC.md §9's band — §9 step 5's seal check", () => {
    expect(() => buildManifest(inputs(["F01"], [7001]))).toThrow(/SEAL FAILURE/);
    expect(() => buildManifest(inputs([...FAMILY_IDS], [7001]))).toThrow(/SEAL FAILURE/);
  });

  it("refuses a manifest with no seed", () => {
    expect(() => buildManifest(inputs(["F01", "F02", "F03", "F04", "F05", "F06"], []))).toThrow(/no seed/);
  });

  it("carries every AL7 burn and its successor, as §6.2 requires", () => {
    const register = new BurnRegister();
    register.burn(9100, "HELD_OUT_FORBIDDEN_LIST_BREACH");
    const block = SEED_BLOCKS[3];
    if (block === undefined) throw new Error("missing block");
    const manifest = buildManifest({
      ...inputs(block.families, register.effectiveSeeds(block)),
      burns: register.burns,
    });
    expect(manifest.seeds).toStrictEqual([9105, 9101, 9102, 9103, 9104]);
    expect(manifest.burns).toStrictEqual([
      { burned: 9100, successor: 9105, reason: "HELD_OUT_FORBIDDEN_LIST_BREACH" },
    ]);
  });

  it("carries recon_report_sha256 between oracle_labels_sha256 and constraint_set_hash", () => {
    // `DATA_MODEL.md §18` positions the field, spec 1.4.22 (M36) added it, and
    // `PREREGISTRATION.md §9` step 5 makes its absence a SEAL FAILURE "because
    // §6.2's probe has no source without it and SE5 would silently score 0 on
    // every candidate". It is an INPUT: this package computes no digest, having
    // no file of its own to hash.
    const block = SEED_BLOCKS[1];
    if (block === undefined) throw new Error("missing block");
    const manifest = buildManifest(inputs(block.families, block.seeds));
    expect(manifest.recon_report_sha256).toBe(digest);
    expect(Object.keys(manifest)).toStrictEqual([
      "benchmark_version", "created_at", "generator_commit", "spec_commit", "families", "seeds",
      "record_counts", "observations_sha256", "ground_truth_sha256", "oracle_labels_sha256",
      "recon_report_sha256", "constraint_set_hash", "sealed_at", "seal_signature", "burns",
    ]);
  });

  it("is frozen once built", () => {
    const block = SEED_BLOCKS[1];
    if (block === undefined) throw new Error("missing block");
    const manifest = buildManifest(inputs(block.families, block.seeds));
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.record_counts)).toBe(true);
  });
});
