import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BENCHMARK_VERSION } from "@assay/generator";
import { afterAll, describe, expect, it } from "vitest";

import {
  COMMANDS,
  EXIT,
  T0_11_COMMANDS,
  dispatch,
  encodeJsonl,
  memorySink,
  type MemorySink,
} from "../src/index.js";
import { reconReportRows, recorder } from "./fixtures.js";

/**
 * `DECISION_BRIEF.md §C` T0-11 — `generate · oracle · run · bench · close ·
 * verify · seal`.
 *
 * Every command is registered. Four report the dependency that blocks them
 * rather than working around it, and this suite asserts **which** dependency
 * each names — a command that failed for a reason nobody recorded would be
 * indistinguishable from one that is merely broken.
 *
 * **No benchmark data is produced anywhere in this file.** `PREREGISTRATION.md
 * §6.1` holds the test split until the seal and `§9` sequences generation after
 * the seal tag, so `generate`'s happy path is deliberately not exercised: only
 * its refusals are, and none of them reaches `generateFamily`.
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
  it("holds exactly the seven commands, in the order the table names them", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([...T0_11_COMMANDS]);
    expect(T0_11_COMMANDS).toEqual([
      "generate",
      "oracle",
      "run",
      "bench",
      "close",
      "verify",
      "seal",
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
  const expected = [
    { argv: ["bench"], owner: "packages/eval", cite: "ARCHITECTURE.md §10" },
    { argv: ["close", "--run", "runs/x"], owner: "packages/ledger", cite: "RECONCILIATION_SPEC.md §10.1" },
    { argv: ["run", "--dataset", "bench/dev/2000"], owner: "packages/domain", cite: "ARCHITECTURE.md §3" },
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
  it("labels an observation set and writes them where it says it did", async () => {
    const dir = tempDir();
    const observations = join(dir, "observations.jsonl");
    // An empty dataset. PREREGISTRATION.md §6.1 forbids generating benchmark
    // data before the seal, so this suite exercises the wiring and not the
    // oracle's arithmetic, which packages/oracle's own suite owns.
    writeFileSync(observations, "", "utf8");

    const out = join(dir, "ambiguity_labels.jsonl");
    const result = await run(["oracle", "--observations", observations, "--out", out]);
    expect(result.code).toBe(EXIT.OK);
    expect(result.out).toContain("observations        0");
    expect(result.sink.files.get(out)).toBe("\n");
  });

  it("reads in zone AGENT, so AL8 keeps the probe surface out of it", async () => {
    const dir = tempDir();
    const barred = join(dir, "recon_report.jsonl");
    writeFileSync(barred, "", "utf8");

    const result = await run(["oracle", "--observations", barred]);
    expect(result.code).toBe(EXIT.GUARD);
    expect(result.err).toContain("AL8");
    expect(result.sink.files.size).toBe(0);
  });

  it("refuses ground truth too — the oracle is observations-only", async () => {
    const dir = tempDir();
    const barred = join(dir, "ground_truth.jsonl");
    writeFileSync(barred, "", "utf8");

    const result = await run(["oracle", "--observations", barred]);
    expect(result.code).toBe(EXIT.GUARD);
    expect(result.err).toContain("AL2");
  });
});

describe("assay generate refuses before it ever simulates", () => {
  it("refuses --split test, citing §6.1 and AL7", async () => {
    const result = await run(["generate", "--split", "test", "--seed", "9000"]);
    expect(result.code).toBe(EXIT.USAGE);
    expect(result.err).toContain("PREREGISTRATION.md §6.1");
    expect(result.err).toContain("AL7");
    expect(result.sink.files.size).toBe(0);
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
    "ambiguity_labels.jsonl",
    "recon_report.jsonl",
  ] as const;

  function dataset(): { dir: string; argv: string[] } {
    const dir = tempDir();
    // Arbitrary bytes: seal hashes an artifact, it does not interpret one, and
    // this suite must not produce benchmark data (§6.1).
    for (const name of ARTIFACTS) {
      writeFileSync(join(dir, name), `${name}\n`, "utf8");
    }
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
        join(dir, "ambiguity_labels.jsonl"),
        "--recon-report",
        join(dir, "recon_report.jsonl"),
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

    const written = result.sink.files.get(join(dir, "manifest.json"));
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
    expect(a.sink.files.get(join(dir, "manifest.json"))).toBe(
      b.sink.files.get(join(dir, "manifest.json")),
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
      result.sink.files.get(join(dir, "manifest.json")) ?? "{}",
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
