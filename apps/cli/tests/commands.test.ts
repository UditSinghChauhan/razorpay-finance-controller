import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONSISTENCY_DRAW_SEED } from "@assay/eval";
import { BENCHMARK_VERSION } from "@assay/generator";
import { afterAll, describe, expect, it } from "vitest";

import {
  COMMANDS,
  EXIT,
  SEAL_TAG,
  T0_11_COMMANDS,
  dispatch,
  encodeJsonl,
  memorySink,
  type MemorySink,
} from "../src/index.js";
import { reconReportRows, recorder } from "./fixtures.js";

/**
 * `DECISION_BRIEF.md §C` T0-11 — `generate · oracle · run · bench · close ·
 * verify · seal · report`.
 *
 * Every command is registered. Five report the dependency that blocks them
 * rather than working around it, and this suite asserts **which** dependency
 * each names — a command that failed for a reason nobody recorded would be
 * indistinguishable from one that is merely broken. `report` joined the list at
 * spec 1.4.29 (`DATA_MODEL.md §22.2` M48).
 *
 * **No benchmark data is produced anywhere in this file.** `PREREGISTRATION.md
 * §6.1` holds the test split until `§9` step 1's signed tag and the operator's
 * `--seal-tag` attestation (spec 1.4.29, M45), so `generate`'s happy path is
 * deliberately not exercised: only its refusals and its attestation checks are,
 * and none of them reaches `generateFamily`.
 */

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-cmd-"));
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

async function run(argv: readonly string[], env: Record<string, string> = {}): Promise<Outcome> {
  const out = recorder();
  const err = recorder();
  const sink = memorySink();
  const code = await dispatch({ argv, env, out: out.write, err: err.write, sink });
  return { code, out: out.lines.join("\n"), err: err.lines.join("\n"), sink };
}

describe("the registry is T0-11's list", () => {
  it("holds exactly the eight commands, in the order the table names them", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([...T0_11_COMMANDS]);
    expect(T0_11_COMMANDS).toEqual([
      "generate",
      "oracle",
      "run",
      "bench",
      "close",
      "verify",
      "seal",
      // Appended at spec 1.4.29 (M48) on §8's own principle for metrics 27-28 —
      // "appended, never renumbered" — so the original seven keep their order.
      "report",
    ]);
  });

  it("gives every command a summary and a help page", async () => {
    for (const command of COMMANDS) {
      expect(command.summary.length, command.name).toBeGreaterThan(0);
      const result = await run([command.name, "--help"]);
      expect(result.code, command.name).toBe(EXIT.OK);
      expect(result.out, command.name).toContain(`assay ${command.name}`);
    }
  });
});

describe("the top-level surface", () => {
  it("prints usage and exits 2 when given nothing", async () => {
    const result = await run([]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.out).toContain("assay <command> [flags]");
  });

  it("prints usage and exits 0 for --help", async () => {
    expect((await run(["--help"])).code).toBe(EXIT.OK);
  });

  it("prints the frozen versions for --version", async () => {
    const result = await run(["--version"]);
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).toContain(BENCHMARK_VERSION);
  });

  it("refuses an unknown command", async () => {
    const result = await run(["reconcile"]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("unknown command");
  });
});

describe("blocked commands name their owner and their citation", () => {
  // `bench` left this list at spec 1.4.32 (register row `DATA_MODEL.md §22.2`
  // M51, implementation item (2)): it composes the injected agents, executes
  // §5.1's ε curve and §5.3's τ sweep, and writes M48's metrics.json. Three
  // commands remain blocked, each on a package that still owes a piece.
  const expected = [
    { argv: ["close", "--run", "runs/x"], owner: "packages/ledger", cite: "RECONCILIATION_SPEC.md §10.1" },
    { argv: ["run", "--dataset", "bench/dev/2000"], owner: "packages/domain", cite: "ARCHITECTURE.md §3" },
    { argv: ["report"], owner: "packages/eval (src/report/)", cite: "DECISION_BRIEF.md §C T0-13" },
  ] as const;

  for (const { argv, owner, cite } of expected) {
    it(`assay ${argv[0]} reports ${owner}`, async () => {
      const result = await run([...argv]);
      expect(result.code).toBe(EXIT.UNAVAILABLE);
      expect(result.err).toContain(owner);
      expect(result.err).toContain(cite);
      // A blocked command writes nothing. §L.4 forbids reporting a number that
      // does not exist in a committed run artifact, and a half-written artifact
      // is how one appears.
      expect(result.sink.files.size).toBe(0);
    });
  }

  it("assay run still constructs the provider, which is the half T0-11 does hold", async () => {
    // "Full pipeline runs from a clean checkout with no API key" — the provider
    // half of that criterion is met and is visible before the block.
    const result = await run(["run", "--dataset", "bench/dev/2000"]);
    expect(result.out).toContain("llm_provider        offline");
    expect(result.out).toContain("requires_network    false");
    expect(result.out).toContain("metered_cost        false");
  });

});

describe("assay oracle", () => {
  /**
   * An empty `(split, seed)` dataset at M42's paths.
   *
   * `PREREGISTRATION.md §6.1` forbids generating benchmark data before the seal,
   * so this suite exercises the **wiring** and not the oracle's arithmetic or the
   * gates' verdicts, which `packages/oracle` and `packages/eval` own. Empty files
   * are not benchmark data.
   */
  function dataset(split: string, seed: number): string {
    const root = tempDir();
    const dir = join(join(root, split), String(seed));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "observations.jsonl"), "", "utf8");
    writeFileSync(join(dir, "ground_truth.jsonl"), "", "utf8");
    return root;
  }

  it("labels a (split, seed) dataset and writes labels and the gate where it says", async () => {
    const root = dataset("dev", 2000);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000",
      "--bench", root, "--consistency-seed", "7",
    ]);
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).toContain("observations      0");

    const seedDir = join(join(root, "dev"), "2000");
    // M42's names, and §9 step 4's own spelling for the labels.
    expect(result.sink.files.get(join(seedDir, "oracle_labels.jsonl"))).toBe("\n");
    const gate = result.sink.files.get(join(seedDir, "oracle_gate.json"));
    expect(gate).toBeDefined();
    expect(JSON.parse(gate ?? "{}")).toMatchObject({ split: "dev", seed: 2000, passed: true });
  });

  it("runs the consistency gate on dev and NOT on test (§5.3 draws from dev)", async () => {
    const dev = dataset("dev", 2000);
    const onDev = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", dev, "--consistency-seed", "7",
    ]);
    expect(onDev.code).toBe(EXIT.OK);
    const devGate = JSON.parse(
      onDev.sink.files.get(join(join(join(dev, "dev"), "2000"), "oracle_gate.json")) ?? "{}",
    ) as { consistency: { draw_seed: number } | null };
    expect(devGate.consistency).not.toBeNull();
    // An explicit override: exercised here because this test is about WHICH gate
    // runs, and a non-frozen seed makes the assertion independent of §7's value.
    expect(devGate.consistency?.draw_seed).toBe(7);

    const test = dataset("test", 9000);
    const onTest = await run(["oracle", "--split", "test", "--seeds", "9000", "--bench", test]);
    expect(onTest.code).toBe(EXIT.OK);
    expect(onTest.out).toContain("not run");
    const testGate = JSON.parse(
      onTest.sink.files.get(join(join(join(test, "test"), "9000"), "oracle_gate.json")) ?? "{}",
    ) as { consistency: unknown };
    expect(testGate.consistency).toBeNull();
  });

  it("needs no --consistency-seed on dev: §7's frozen seed is the default", async () => {
    // Spec 1.4.28 (M44) closed V24. §7 carries the whole draw, AL3 binds it, and
    // an official run takes no draw parameter from the command line.
    const root = dataset("dev", 2000);
    const result = await run(["oracle", "--split", "dev", "--seeds", "2000", "--bench", root]);
    expect(result.code).toBe(EXIT.OK);
    const gate = JSON.parse(
      result.sink.files.get(join(join(join(root, "dev"), "2000"), "oracle_gate.json")) ?? "{}",
    ) as { consistency: { draw_seed: number; authoritative: boolean } | null };
    expect(gate.consistency?.draw_seed).toBe(CONSISTENCY_DRAW_SEED);
    expect(gate.consistency?.authoritative).toBe(true);
  });

  it("needs no consistency seed on test — the gate does not run there", async () => {
    const root = dataset("test", 9000);
    const result = await run(["oracle", "--split", "test", "--seeds", "9000", "--bench", root]);
    expect(result.code).toBe(EXIT.OK);
  });

  it("keeps test-split gate output aggregate only (AL4 / AL7)", async () => {
    const root = dataset("test", 9000);
    const result = await run(["oracle", "--split", "test", "--seeds", "9000", "--bench", root]);
    const raw = result.sink.files.get(join(join(join(root, "test"), "9000"), "oracle_gate.json"));
    expect(raw).toBeDefined();
    // No record-level field survives the redaction: a finding naming a target
    // would be an inspection of a TEST output, which AL7 burns the seed for.
    expect(raw).not.toContain("target_id");
    expect(raw).not.toContain("member_obs_ids");
    expect(raw).toContain("failure_count");
  });

  it("keeps records on dev, where AL4 permits inspection without limit", async () => {
    const root = dataset("dev", 2000);
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "7",
    ]);
    const raw = result.sink.files.get(join(join(join(root, "dev"), "2000"), "oracle_gate.json"));
    expect(raw).toBeDefined();
    expect(raw).toContain("failures");
    expect(raw).not.toContain("failure_count");
  });

  it("refuses a (split, seed) pair the frozen table does not assign", async () => {
    const root = dataset("dev", 9000);
    const result = await run(["oracle", "--split", "dev", "--seeds", "9000", "--bench", root]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("test split");
    expect(result.sink.files.size).toBe(0);
  });

  it("reads observations in zone AGENT, so AL8 keeps the probe surface out", async () => {
    // The dataset path is derived, so the artifact NAME is the guard's subject.
    // A dataset whose observations file is named recon_report.jsonl cannot be
    // built through the command's own paths; this asserts the zone directly.
    const root = tempDir();
    const dir = join(join(root, "dev"), "2000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ground_truth.jsonl"), "", "utf8");
    // observations.jsonl is absent: the read fails, and the point is that it is
    // attempted in AGENT, never in a zone that could reach the probe surface.
    const result = await run([
      "oracle", "--split", "dev", "--seeds", "2000", "--bench", root, "--consistency-seed", "7",
    ]);
    expect(result.code).toBe(EXIT.FAILURE);
    expect(result.err).toContain("observations.jsonl");
  });
});

describe("assay generate refuses before it ever simulates", () => {
  it("refuses --split test with no attestation, citing §6.1 and AL7", async () => {
    const result = await run(["generate", "--split", "test", "--seed", "9000"]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("PREREGISTRATION.md §6.1");
    expect(result.err).toContain("AL7");
    // M45: the refusal names the way out rather than only the rule.
    expect(result.err).toContain(SEAL_TAG);
    expect(result.sink.files.size).toBe(0);
  });

  // --- spec 1.4.29, register row M45 ------------------------------------
  //
  // The attestation lifts §6.1's bar and NOTHING ELSE does. These assert the
  // three clauses that can be checked without a tag existing; that no tag is
  // detected is asserted by `boundary.test.ts`'s no-subprocess rule and by
  // eslint.config.js's transport ban, not here.

  it("refuses --split test when the attested tag is not §9 step 1's", async () => {
    const result = await run([
      "generate", "--split", "test", "--seed", "9000", "--seal-tag", "bench-v1.0.6",
    ]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain(SEAL_TAG);
    // M46's defect, refused rather than accepted: the stale literal §9 itself
    // carried for three amendments cannot re-enter through the command line.
    expect(result.err).toContain("bench-v1.0.6");
    expect(result.sink.files.size).toBe(0);
  });

  it("refuses --seal-tag on a split that §6.1 does not bar", async () => {
    const result = await run([
      "generate", "--split", "dev", "--seed", "2000", "--seal-tag", SEAL_TAG,
    ]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("only with --split test");
    expect(result.sink.files.size).toBe(0);
  });

  it("derives the attested tag name from BENCHMARK_VERSION, never a literal", () => {
    // M46: §9's literals drifted from the constant they tracked. Deriving is
    // what removes the class of defect rather than the instance.
    expect(SEAL_TAG).toBe(`bench-v${BENCHMARK_VERSION}`);
  });

  it("refuses a seed that appears in no row of the split table", async () => {
    const result = await run(["generate", "--split", "dev", "--seed", "4242"]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("§6.1");
    expect(result.sink.files.size).toBe(0);
  });

  it("refuses a (split, seed) pair the frozen table does not assign", async () => {
    // 2000 is a dev seed. The split table is frozen and is not overridden from
    // the command line.
    const result = await run(["generate", "--split", "train", "--seed", "2000"]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("dev split");
    expect(result.sink.files.size).toBe(0);
  });
});

describe("assay generate writes RECONCILIATION_SPEC.md §6.2's probe surface", () => {
  /**
   * `generate`'s happy path stays undriven, for the reason this file's header
   * gives: `generateFamily` at a `§6.1` seed **is** a generation, and `§9`
   * sequences every generation after the seal tag. What is asserted here is the
   * seam `apps/cli` owns — the path, the bytes and the row order — through the
   * same `memorySink`, `join` and `encodeJsonl` the command itself uses, so
   * nothing reaches the filesystem and no dataset is produced. That the command
   * performs this write, for every family and unconditioned on the split, is
   * asserted from its source in `tests/boundary.test.ts`.
   */
  const rows = reconReportRows();

  it("serializes one row per line, in the order the producing package chose", () => {
    const lines = encodeJsonl(rows).split("\n").filter((line) => line !== "");
    expect(lines).toHaveLength(rows.length);
    // entity_id ascending, ratified at spec 1.4.24 (M38). encodeJsonl re-orders
    // nothing — "the ordering that matters is the ordering the producing package
    // chose" — and this command must not either.
    expect(lines.map((line) => (JSON.parse(line) as { entity_id: string }).entity_id)).toEqual(
      rows.map((row) => row.entity_id),
    );
  });

  it("carries §6.2's three columns and nothing else, in §6.2's own order", () => {
    for (const line of encodeJsonl(rows).split("\n").filter((l) => l !== "")) {
      expect(Object.keys(JSON.parse(line) as object)).toEqual([
        "settlement_id",
        "entity_id",
        "settled_at",
      ]);
    }
  });

  it("keeps the UNSETTLED row, which spec 1.4.24 fixed as included", () => {
    // §4.2 emits a member its batch cannot carry with settlement_id: null, and
    // DATA_MODEL.md §6 fixes settled_at as "null exactly when no settlement
    // carried the line". Unreachable by the query is not the same as excluded.
    expect(encodeJsonl(rows)).toContain('"settlement_id":null,"entity_id":"pay_');
  });

  it("writes recon_report.jsonl beside the other three artifacts, for either split", () => {
    // The command's own path construction: bench/<split>/<seed>/<family>/. It is
    // split-independent — `split` only names a directory — so both splits the
    // command accepts land the artifact in the same relative position.
    const sink = memorySink();
    for (const split of ["train", "dev"] as const) {
      const familyDir = join("bench", split, "2000", "F01");
      sink.write(join(familyDir, "recon_report.jsonl"), encodeJsonl(rows));
    }
    expect([...sink.files.keys()].sort()).toEqual([
      join("bench", "dev", "2000", "F01", "recon_report.jsonl"),
      join("bench", "train", "2000", "F01", "recon_report.jsonl"),
    ]);
    expect(sink.files.get(join("bench", "dev", "2000", "F01", "recon_report.jsonl"))).toBe(
      encodeJsonl(rows),
    );
  });
});

describe("assay seal", () => {
  const ARTIFACTS = [
    "observations.jsonl",
    "ground_truth.jsonl",
    "oracle_labels.jsonl",
    "recon_report.jsonl",
  ] as const;

  const MANIFEST = "benchmark_manifest.json";

  function dataset(gatePasses = true): { dir: string; argv: string[] } {
    const dir = tempDir();
    // Arbitrary bytes: seal hashes an artifact, it does not interpret one, and
    // this suite must not produce benchmark data (§6.1).
    for (const name of ARTIFACTS) {
      writeFileSync(join(dir, name), `${name}\n`, "utf8");
    }
    // The §5.3 gate artifact. Spec 1.4.27 (M43) makes a passing completeness
    // gate a seal precondition; seal reads the pass bit and interprets nothing
    // else, so a minimal artifact is the right fixture.
    writeFileSync(
      join(dir, "oracle_gate.json"),
      `${JSON.stringify({ completeness: { passed: gatePasses } }, null, 2)}\n`,
      "utf8",
    );
    return {
      dir,
      argv: [
        "seal",
        "--seed",
        "2000",
        "--observations",
        join(dir, "observations.jsonl"),
        "--ground-truth",
        join(dir, "ground_truth.jsonl"),
        "--oracle-labels",
        join(dir, "oracle_labels.jsonl"),
        "--recon-report",
        join(dir, "recon_report.jsonl"),
        "--oracle-gate",
        join(dir, "oracle_gate.json"),
        "--generator-commit",
        "b1460ef1bb334074fded46a8c1b428b729217ea5",
        "--spec-commit",
        "0f1e2d3c4b5a69788796a5b4c3d2e1f001234567",
        "--created-at",
        "1787000000",
        "--out",
        dir,
      ],
    };
  }

  it("writes a manifest whose hashes come from the committed bytes", async () => {
    const { dir, argv } = dataset();
    const result = await run(argv);
    expect(result.code).toBe(EXIT.OK);

    const written = result.sink.files.get(join(dir, MANIFEST));
    expect(written).toBeDefined();
    const manifest = JSON.parse(written ?? "{}") as Record<string, unknown>;
    expect(manifest["benchmark_version"]).toBe(BENCHMARK_VERSION);
    expect(manifest["seeds"]).toEqual([2000]);
    // families come from PREREGISTRATION.md §6.1's table, never from a flag.
    expect(manifest["families"]).toEqual(["F01", "F02", "F03", "F04", "F05", "F06"]);
    expect(manifest["constraint_set_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest["sealed_at"]).toBeNull();
  });

  it("is byte-identical over two invocations on the same inputs", async () => {
    // Metric 23 (determinism_check) requires two runs over identical inputs to
    // agree; --created-at is supplied so the wall clock is not an input.
    const { dir, argv } = dataset();
    const a = await run(argv);
    const b = await run(argv);
    expect(a.sink.files.get(join(dir, MANIFEST))).toBe(
      b.sink.files.get(join(dir, MANIFEST)),
    );
  });

  it("is refused under --sealed, because AL5 keeps ground truth out of the process", async () => {
    const { argv } = dataset();
    const result = await run([...argv, "--sealed"]);
    expect(result.code).toBe(EXIT.GUARD);
    expect(result.err).toContain("AL5");
  });

  it("hashes the recon report over its raw bytes, as sha256sum would", async () => {
    // PREREGISTRATION.md §9 step 4 is `sha256 ... recon_report.jsonl` and step 5
    // makes a missing recon_report_sha256 a SEAL FAILURE. The digest is over the
    // committed bytes, never over a canonical JSON copy of them, so
    // EVALUATION_SPEC.md §7's reproducibility guarantee is checkable by hand.
    const { dir, argv } = dataset();
    const result = await run(argv);
    expect(result.code).toBe(EXIT.OK);

    const manifest = JSON.parse(
      result.sink.files.get(join(dir, MANIFEST)) ?? "{}",
    ) as Record<string, unknown>;
    const expected = createHash("sha256")
      .update(readFileSync(join(dir, "recon_report.jsonl")))
      .digest("hex");
    expect(manifest["recon_report_sha256"]).toBe(expected);
    expect(manifest["recon_report_sha256"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("echoes the digest, because §9 step 5 makes its absence a SEAL FAILURE", async () => {
    const { argv } = dataset();
    const result = await run(argv);
    expect(result.out).toContain("recon_report_sha256");
  });

  it("requires --recon-report rather than defaulting it", async () => {
    // §18: the field "is required and non-null from benchmark v1.0.4", and a
    // manifest that pinned the observations but not the probe surface would let
    // two runs over "the same" benchmark answer probes differently.
    const { argv } = dataset();
    const at = argv.indexOf("--recon-report");
    const result = await run([...argv.slice(0, at), ...argv.slice(at + 2)]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("--recon-report is required");
    expect(result.sink.files.size).toBe(0);
  });

  it("reads the report in zone SEAL — GENERATOR_TRUST still refuses it", async () => {
    // §A.31's rejected alternative, asserted end to end: passing the report on
    // the flag that reads in GENERATOR_TRUST is refused by AL8. That zone is
    // claimed by the §5.3 completeness gate as well, and §5.3 / §10 V22 require
    // the gate never to hold the report.
    const { dir, argv } = dataset();
    const swapped = [...argv];
    swapped[argv.indexOf("--ground-truth") + 1] = join(dir, "recon_report.jsonl");
    const result = await run(swapped);
    expect(result.code).toBe(EXIT.GUARD);
    expect(result.err).toContain("AL8");
    expect(result.sink.files.size).toBe(0);
  });

  it("does not let zone SEAL reach ground truth", async () => {
    // The zone names a permission, not a caller: it carries AL8's exception and
    // only that one. Ground truth keeps AL2's own GENERATOR_TRUST route.
    const { dir, argv } = dataset();
    const swapped = [...argv];
    swapped[argv.indexOf("--recon-report") + 1] = join(dir, "ground_truth.jsonl");
    const result = await run(swapped);
    expect(result.code).toBe(EXIT.GUARD);
    expect(result.err).toContain("AL2");
    expect(result.sink.files.size).toBe(0);
  });
});
