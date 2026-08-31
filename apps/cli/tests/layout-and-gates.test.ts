import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONSISTENCY_DRAW_SEED } from "@assay/eval";
import { BENCHMARK_VERSION, TARGET_RECORD_COUNT, familiesFor } from "@assay/generator";
import { afterAll, describe, expect, it } from "vitest";

import { EXIT, dispatch, memorySink, type MemorySink } from "../src/index.js";
import { recorder } from "./fixtures.js";

/**
 * `DATA_MODEL.md §22.2` M42 and M43, at the command surface.
 *
 * M42: the dataset artifact unit is `(split, seed)`, one manifest per dataset,
 * and `bench/<split>/recon_report.jsonl` stays split-scoped. M43: `apps/cli`
 * runs both `PREREGISTRATION.md §5.3` gates, a failing gate exits non-zero, and
 * a missing or failing gate artifact is a **SEAL FAILURE**.
 *
 * **No benchmark data is produced here.** `generate`'s happy path is not driven,
 * for the reason `commands.test.ts` already gives: `§6.1` holds the test split
 * until the seal and `§9` sequences generation after the seal tag, so this suite
 * stops short of `generateFamily`. Every artifact below is either empty or
 * arbitrary bytes; `seal` hashes an artifact and does not interpret one, and the
 * gates are exercised on an empty dataset because their arithmetic belongs to
 * `packages/oracle` and `packages/eval`.
 */

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-m42-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Outcome {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  readonly sink: MemorySink;
}

async function run(argv: readonly string[]): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({ argv, env: {}, out: out.write, err: err.write, sink });
  return { code, out: out.lines.join("\n"), err: err.lines.join("\n"), sink };
}

/** An empty `(split, seed)` dataset at M42's paths. Not benchmark data. */
function emptyDataset(root: string, split: string, seed: number): string {
  const dir = join(join(root, split), String(seed));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "observations.jsonl"), "", "utf8");
  writeFileSync(join(dir, "ground_truth.jsonl"), "", "utf8");
  return dir;
}

describe("M42 — the dataset artifact unit is (split, seed)", () => {
  it("reads and writes at bench/<split>/<seed>/, with no family segment", async () => {
    const root = tempDir();
    emptyDataset(root, "dev", 2000);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "7",
    ]);
    expect(result.code).toBe(EXIT.OK);

    const written = [...result.sink.files.keys()].sort();
    expect(written).toEqual([
      join(join(join(root, "dev"), "2000"), "oracle_gate.json"),
      join(join(join(root, "dev"), "2000"), "oracle_labels.jsonl"),
    ]);
    // Family is a COMPOSITION dimension: no path segment names one.
    for (const path of written) {
      expect(path).not.toMatch(/[/\\]F0[1-9][/\\]/);
    }
  });

  it("writes one dataset per seed when several are named", async () => {
    const root = tempDir();
    for (const seed of [2000, 2001, 2002]) emptyDataset(root, "dev", seed);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000-2002", "--bench", root,
      "--consistency-seed", "7",
    ]);
    expect(result.code).toBe(EXIT.OK);
    expect(result.sink.files.size).toBe(6);
    for (const seed of [2000, 2001, 2002]) {
      expect(result.sink.files.has(join(join(join(root, "dev"), String(seed)), "oracle_gate.json")))
        .toBe(true);
    }
  });
});

describe("M42 — one BenchmarkManifest per (split, seed)", () => {
  const ARTIFACTS = ["observations.jsonl", "ground_truth.jsonl", "oracle_labels.jsonl"] as const;

  /**
   * A sealable `(split, seed)` with a split-scoped recon report above it.
   *
   * Arbitrary bytes per seed, and **one** recon report shared by the split —
   * which is the layout M42 ratifies and the thing the digest assertion below
   * turns into a checkable property.
   */
  function sealable(root: string, seed: number): string[] {
    const dir = join(join(root, "dev"), String(seed));
    mkdirSync(dir, { recursive: true });
    for (const name of ARTIFACTS) writeFileSync(join(dir, name), `${name} ${String(seed)}\n`, "utf8");
    writeFileSync(
      join(dir, "oracle_gate.json"),
      `${JSON.stringify({ completeness: { passed: true } }, null, 2)}\n`,
      "utf8",
    );
    return [
      "seal",
      "--seed", String(seed),
      "--observations", join(dir, "observations.jsonl"),
      "--ground-truth", join(dir, "ground_truth.jsonl"),
      "--oracle-labels", join(dir, "oracle_labels.jsonl"),
      "--recon-report", join(join(root, "dev"), "recon_report.jsonl"),
      "--oracle-gate", join(dir, "oracle_gate.json"),
      "--generator-commit", "b1460ef1bb334074fded46a8c1b428b729217ea5",
      "--spec-commit", "0f1e2d3c4b5a69788796a5b4c3d2e1f001234567",
      "--created-at", "1787000000",
      "--out", dir,
    ];
  }

  function splitRoot(): string {
    const root = tempDir();
    mkdirSync(join(root, "dev"), { recursive: true });
    // ONE recon report for the whole split (M36, unchanged by M42).
    writeFileSync(join(join(root, "dev"), "recon_report.jsonl"), "recon_report\n", "utf8");
    return root;
  }

  it("names the manifest benchmark_manifest.json, per §9 step 5 and §K", async () => {
    const root = splitRoot();
    const result = await run(sealable(root, 2000));
    expect(result.code).toBe(EXIT.OK);
    expect(result.sink.files.has(join(join(join(root, "dev"), "2000"), "benchmark_manifest.json")))
      .toBe(true);
  });

  it("carries a singleton seeds array and that seed's families", async () => {
    const root = splitRoot();
    const result = await run(sealable(root, 2000));
    const manifest = JSON.parse(
      result.sink.files.get(join(join(join(root, "dev"), "2000"), "benchmark_manifest.json")) ?? "{}",
    ) as { seeds: number[]; families: string[]; record_counts: Record<string, number> };

    expect(manifest.seeds).toEqual([2000]);
    expect(manifest.families).toEqual([...familiesFor(2000)]);
    // record_counts holds THAT seed's families, at §4.1's frozen counts.
    expect(Object.keys(manifest.record_counts).sort()).toEqual([...familiesFor(2000)].sort());
    for (const family of familiesFor(2000)) {
      expect(manifest.record_counts[family]).toBe(TARGET_RECORD_COUNT[family]);
    }
    // §9 step 5's band, over the SUM across the seed's families.
    const total = Object.values(manifest.record_counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(10_000);
    expect(total).toBeLessThanOrEqual(20_000);
  });

  it("reads benchmark_version 1.0.7", async () => {
    const root = splitRoot();
    const result = await run(sealable(root, 2000));
    const manifest = JSON.parse(
      result.sink.files.get(join(join(join(root, "dev"), "2000"), "benchmark_manifest.json")) ?? "{}",
    ) as { benchmark_version: string };
    expect(manifest.benchmark_version).toBe(BENCHMARK_VERSION);
    expect(manifest.benchmark_version).toBe("1.0.7");
  });

  it("gives every manifest of one split the SAME recon_report_sha256", async () => {
    // M42: the digest is the SPLIT-level artifact's, so it is identical across
    // the split's manifests by construction rather than by a check. Two seeds,
    // two manifests, two different observation digests, one report digest.
    const root = splitRoot();
    const a = await run(sealable(root, 2000));
    const b = await run(sealable(root, 2001));
    expect(a.code).toBe(EXIT.OK);
    expect(b.code).toBe(EXIT.OK);

    const read = (outcome: Outcome, seed: number): Record<string, string> =>
      JSON.parse(
        outcome.sink.files.get(
          join(join(join(root, "dev"), String(seed)), "benchmark_manifest.json"),
        ) ?? "{}",
      ) as Record<string, string>;

    const one = read(a, 2000);
    const two = read(b, 2001);
    const expected = createHash("sha256")
      .update(readFileSync(join(join(root, "dev"), "recon_report.jsonl")))
      .digest("hex");

    expect(one["recon_report_sha256"]).toBe(expected);
    expect(two["recon_report_sha256"]).toBe(expected);
    // ...while the dataset digests differ, because the datasets do.
    expect(two["observations_sha256"]).not.toBe(one["observations_sha256"]);
  });
});

describe("M44 — §7's frozen consistency draw, and its non-authoritative override", () => {
  it("uses §7's frozen seed on an official dev run and marks it authoritative", async () => {
    const root = tempDir();
    emptyDataset(root, "dev", 2000);
    const result = await run(["oracle", "--split", "dev", "--seeds", "2000", "--bench", root]);
    expect(result.code).toBe(EXIT.OK);

    const gate = JSON.parse(
      result.sink.files.get(join(join(join(root, "dev"), "2000"), "oracle_gate.json")) ?? "{}",
    ) as { consistency: { draw_seed: number; frozen_draw_seed: number; authoritative: boolean } };
    expect(gate.consistency.draw_seed).toBe(CONSISTENCY_DRAW_SEED);
    expect(gate.consistency.frozen_draw_seed).toBe(CONSISTENCY_DRAW_SEED);
    expect(gate.consistency.authoritative).toBe(true);
    expect(result.out).toContain("§7 frozen");
  });

  it("records the frozen seed beside an override, and marks the run NOT authoritative", async () => {
    // AL4 lets a developer inspect DEV without limit, so exploring another draw
    // is legitimate. What AL3 forbids is choosing WHICH run counts after seeing
    // it -- so an overridden artifact must not be able to pass itself off.
    const root = tempDir();
    emptyDataset(root, "dev", 2000);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "99",
    ]);
    expect(result.code).toBe(EXIT.OK);

    const gate = JSON.parse(
      result.sink.files.get(join(join(join(root, "dev"), "2000"), "oracle_gate.json")) ?? "{}",
    ) as { consistency: { draw_seed: number; frozen_draw_seed: number; authoritative: boolean } };
    expect(gate.consistency.draw_seed).toBe(99);
    expect(gate.consistency.frozen_draw_seed).toBe(CONSISTENCY_DRAW_SEED);
    expect(gate.consistency.authoritative).toBe(false);
    expect(result.out).toContain("NOT AUTHORITATIVE");
  });

  it("REFUSES an override under --sealed — an official run takes §7's seed", async () => {
    const root = tempDir();
    emptyDataset(root, "dev", 2000);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root,
      "--consistency-seed", "99", "--sealed",
    ]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("refused under --sealed");
    expect(result.err).toContain(String(CONSISTENCY_DRAW_SEED));
    expect(result.sink.files.size).toBe(0);
  });

  it("refuses an override on a split whose gate does not run", async () => {
    const root = tempDir();
    emptyDataset(root, "test", 9000);
    const result = await run([
      "oracle", "--split", "test", "--seeds", "9000", "--bench", root, "--consistency-seed", "99",
    ]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("dev split");
    expect(result.sink.files.size).toBe(0);
  });

  it("gives every dev dataset the same frozen seed", async () => {
    // §7: one seed across all DEV datasets. The samples differ because the pools
    // do; the seed never does.
    const root = tempDir();
    for (const seed of [2000, 2001]) emptyDataset(root, "dev", seed);
    const result = await run(["oracle", "--split", "dev", "--seeds", "2000-2001", "--bench", root]);
    expect(result.code).toBe(EXIT.OK);
    for (const seed of [2000, 2001]) {
      const gate = JSON.parse(
        result.sink.files.get(
          join(join(join(root, "dev"), String(seed)), "oracle_gate.json"),
        ) ?? "{}",
      ) as { consistency: { draw_seed: number } };
      // Not the dataset seed, and the same for both: M44's central property.
      expect(gate.consistency.draw_seed).toBe(CONSISTENCY_DRAW_SEED);
      expect(gate.consistency.draw_seed).not.toBe(seed);
    }
  });
});

describe("M43 — a gate failure stops the pipeline", () => {
  it("exits non-zero when the completeness gate fails", async () => {
    // Ground truth naming a settlement the observation set does not carry is a
    // dataset/truth disagreement, which the join refuses rather than scoping out
    // -- scoping it out silently would hide the defect behind a pass.
    const root = tempDir();
    const dir = emptyDataset(root, "dev", 2000);
    writeFileSync(
      join(dir, "ground_truth.jsonl"),
      `${JSON.stringify({
        family_id: "F01",
        allocations: [{ settlement_id: "setl_00000000000001", entity_id: "pay_00000000000001" }],
      })}\n`,
      "utf8",
    );
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "7",
    ]);
    expect(result.code).not.toBe(EXIT.OK);
    expect(result.err).toContain("setl_00000000000001");
  });

  it("refuses a malformed ground-truth record rather than passing on a short truth", async () => {
    const root = tempDir();
    const dir = emptyDataset(root, "dev", 2000);
    writeFileSync(join(dir, "ground_truth.jsonl"), `${JSON.stringify({ family_id: "F01" })}\n`, "utf8");
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "7",
    ]);
    expect(result.code).not.toBe(EXIT.OK);
    expect(result.err).toContain("allocations");
  });
});

describe("M43 — the §5.3 gate is a seal precondition", () => {
  const ARTIFACTS = [
    "observations.jsonl", "ground_truth.jsonl", "oracle_labels.jsonl", "recon_report.jsonl",
  ] as const;

  function argv(dir: string, gate: string | null): string[] {
    const base = [
      "seal",
      "--seed", "2000",
      "--observations", join(dir, "observations.jsonl"),
      "--ground-truth", join(dir, "ground_truth.jsonl"),
      "--oracle-labels", join(dir, "oracle_labels.jsonl"),
      "--recon-report", join(dir, "recon_report.jsonl"),
      "--generator-commit", "b1460ef1bb334074fded46a8c1b428b729217ea5",
      "--spec-commit", "0f1e2d3c4b5a69788796a5b4c3d2e1f001234567",
      "--created-at", "1787000000",
      "--out", dir,
    ];
    return gate === null ? base : [...base, "--oracle-gate", gate];
  }

  function fixture(gate: "pass" | "fail" | "absent"): string {
    const dir = tempDir();
    for (const name of ARTIFACTS) writeFileSync(join(dir, name), `${name}\n`, "utf8");
    if (gate !== "absent") {
      writeFileSync(
        join(dir, "oracle_gate.json"),
        `${JSON.stringify({ completeness: { passed: gate === "pass" } }, null, 2)}\n`,
        "utf8",
      );
    }
    return dir;
  }

  it("requires --oracle-gate rather than defaulting it", async () => {
    const dir = fixture("pass");
    const result = await run(argv(dir, null));
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("--oracle-gate is required");
    expect(result.sink.files.size).toBe(0);
  });

  it("is a SEAL FAILURE when the gate artifact is missing", async () => {
    const dir = fixture("absent");
    const result = await run(argv(dir, join(dir, "oracle_gate.json")));
    expect(result.code).toBe(EXIT.FAILURE);
    expect(result.err).toContain("SEAL FAILURE");
    expect(result.sink.files.size).toBe(0);
  });

  it("is a SEAL FAILURE when the gate did not pass", async () => {
    const dir = fixture("fail");
    const result = await run(argv(dir, join(dir, "oracle_gate.json")));
    expect(result.code).toBe(EXIT.FAILURE);
    expect(result.err).toContain("SEAL FAILURE");
    expect(result.err).toContain("§9 step 3");
    expect(result.sink.files.size).toBe(0);
  });

  it("refuses BEFORE hashing, so no digest is computed for a refused seal", async () => {
    const dir = fixture("fail");
    const result = await run(argv(dir, join(dir, "oracle_gate.json")));
    expect(result.out).not.toContain("observations_sha256");
    expect(result.out).not.toContain("recon_report_sha256");
  });

  it("seals when the gate passes, and names the gate it was permitted by", async () => {
    const dir = fixture("pass");
    const result = await run(argv(dir, join(dir, "oracle_gate.json")));
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).toContain("oracle_gate         PASS");
    expect(result.sink.files.has(join(dir, "benchmark_manifest.json"))).toBe(true);
  });

  it("does not hash the gate artifact into the manifest", async () => {
    // M43: oracle_gate.json is a build product, not a benchmark surface. §9
    // step 4's digest set stays at four.
    const dir = fixture("pass");
    const result = await run(argv(dir, join(dir, "oracle_gate.json")));
    const manifest = JSON.parse(
      result.sink.files.get(join(dir, "benchmark_manifest.json")) ?? "{}",
    ) as Record<string, unknown>;
    const digests = Object.keys(manifest).filter((key) => key.endsWith("_sha256")).sort();
    expect(digests).toEqual([
      "ground_truth_sha256",
      "observations_sha256",
      "oracle_labels_sha256",
      "recon_report_sha256",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("oracle_gate");
  });
});
