import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * `scripts/seal-bench-v2.mjs`, every gate's refusal path and the all-pass
 * path, BEFORE the script is ever run for real (Work Order 3b, 1.7).
 *
 * Each case builds a throwaway git repository with a bare "remote" it has been
 * pushed to, lays out the paths the gates read (the pre-registration, the
 * test-seed registry, the protected trees) and runs the REAL script in it as a
 * child process — the same code path a seal takes, with nothing stubbed. The
 * report is a fixture in the shape the script's docblock fixes. No bench-v2
 * corpus exists or is generated; these figures are made up and say so.
 */

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts/seal-bench-v2.mjs");
const PREREG = "docs/BENCH_V2_PREREGISTRATION.md";
const SEAL = "runs/bench-v2-seal/seal.json";

const bases: string[] = [];
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Seal Fixture",
  GIT_AUTHOR_EMAIL: "seal-fixture@example.invalid",
  GIT_COMMITTER_NAME: "Seal Fixture",
  GIT_COMMITTER_EMAIL: "seal-fixture@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text, "utf8");
}

interface Fixture {
  readonly dir: string;
  readonly base: string;
  readonly report: string;
}

/** A repository in which every gate passes. `opts` withholds one precondition. */
function fixture(opts: { commitPrereg?: boolean; push?: boolean } = {}): Fixture {
  const base = mkdtempSync(join(tmpdir(), "assay-seal-"));
  bases.push(base);
  const dir = join(base, "work");
  const remote = join(base, "remote.git");
  mkdirSync(dir);
  git(base, "init", "-q", "--bare", remote);
  git(dir, "init", "-q");
  write(dir, "README.md", "fixture\n");
  // The fixture's own registry: the gate's logic is under test, not the real
  // registry's contents (tests/test-seed-registry.test.ts covers those).
  write(
    dir,
    "scripts/test-seed-registry.json",
    JSON.stringify({ ranges: [{ from: 7001, to: 7200, source: "fixture: bench-v2 test seeds" }] }),
  );
  write(dir, "runs/seal-v1.0.13/test/9000/ASSAY/offline/metrics.json", "{}\n");
  write(dir, "bench/test/9000/observations.jsonl", "\n");
  write(dir, "bench/dev/9100/observations.jsonl", "\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  if (opts.commitPrereg ?? true) {
    write(dir, PREREG, "# pre-registration v1\n");
    git(dir, "add", PREREG);
    git(dir, "commit", "-q", "-m", "pre-register");
  }
  if (opts.push ?? true) {
    git(dir, "remote", "add", "origin", remote);
    git(dir, "push", "-q", "origin", "main");
  }
  const report = join(base, "report.json");
  writeFileSync(report, JSON.stringify(goodReport(), null, 2), "utf8");
  return { dir, base, report };
}

const metric = (id: string, denominator: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  numerator: denominator,
  denominator,
  excluded: 0,
  excluded_by: {},
  value: denominator === 0 ? null : 1,
  ...extra,
});

/** A report every gate accepts: made-up figures, real shape. */
function goodReport(): {
  benchmark: string;
  units: { block: string; seed: number; family: string; documented_counts: Record<string, number> }[];
  headline: Record<string, unknown>[];
} {
  const units = [
    ...[8200, 8201].flatMap((seed) => [
      { block: "P", seed, family: "A01", documented_counts: { TRULY_AMBIGUOUS: 6, DISCRIMINABLE: 0 } },
      { block: "P", seed, family: "A04", documented_counts: { TRULY_AMBIGUOUS: 3, DISCRIMINABLE: 3 } },
    ]),
    { block: "S", seed: 8300, family: "A01", documented_counts: { TRULY_AMBIGUOUS: 6, DISCRIMINABLE: 0 } },
  ];
  const headline = ["P", "S"].flatMap((block) => [
    {
      block,
      agent: "ASSAY",
      population: "OVERALL",
      metrics: ["M-A", "M-B", "M-C", "M-E", "M-F", "M-G"].map((id) => metric(id, id === "M-B" && block === "S" ? 0 : 5)),
    },
    {
      block,
      agent: "A2-NOABSTAIN",
      population: "OVERALL",
      metrics: [metric("M-D", 4)],
      forced_choice_harm: { value_paise: 123_456, held_targets: 8, held_committed: 4, excluded_by: {} },
    },
  ]);
  return { benchmark: "bench-v2", units, headline };
}

function run(f: Fixture, ...args: string[]): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: f.dir, encoding: "utf8", env: GIT_ENV });
  return { status: r.status, stdout: `${r.stdout}${r.stderr}` };
}

function setReport(f: Fixture, edit: (r: ReturnType<typeof goodReport>) => void): void {
  const r = goodReport();
  edit(r);
  writeFileSync(f.report, JSON.stringify(r), "utf8");
}

function expectRefused(result: { status: number | null; stdout: string }, gate: string, f: Fixture): void {
  expect(result.status, result.stdout).toBe(1);
  expect(result.stdout).toContain(`REFUSED [${gate}]`);
  expect(result.stdout).toContain("Nothing written.");
  expect(existsSync(join(f.dir, SEAL))).toBe(false);
}

const TIMEOUT = 60_000;

// ---------------------------------------------------------------------------

describe("the all-pass path", () => {
  it("--check: every gate passes and nothing is written", () => {
    const f = fixture();
    const r = run(f, "--report", f.report, "--check");
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain("ALL GATES PASS");
    expect(r.stdout).not.toContain("REFUSED");
    expect(existsSync(join(f.dir, SEAL))).toBe(false);
  }, TIMEOUT);

  it("seals once, records all six gates and the commit, and never overwrites", () => {
    const f = fixture();
    const first = run(f, "--report", f.report);
    expect(first.status, first.stdout).toBe(0);
    const seal = JSON.parse(readFileSync(join(f.dir, SEAL), "utf8")) as {
      gates: { gate: string; passed: boolean }[];
      prereg: { prereg_commit: string; on_remote: string[] };
      test_seed_registry: { corpus_seeds: number[] };
    };
    expect(seal.gates.map((g) => g.gate)).toStrictEqual(["G-A", "G-B", "G-C", "G-D", "G-E", "G-F"]);
    expect(seal.prereg.prereg_commit).toBe(git(f.dir, "log", "-1", "--format=%H", "--", PREREG).trim());
    expect(seal.prereg.on_remote).toContain("origin/main");
    expect(seal.test_seed_registry.corpus_seeds).toStrictEqual([8200, 8201, 8300]);

    const second = run(f, "--report", f.report);
    expect(second.status).toBe(1);
    expect(second.stdout).toContain("REFUSED [OUTPUT]");
  }, TIMEOUT);

  it("names a revision with --prereg-commit and lists the earlier version", () => {
    const f = fixture();
    const v1 = git(f.dir, "rev-parse", "HEAD").trim();
    write(f.dir, PREREG, "# pre-registration v2, revised on review\n");
    git(f.dir, "commit", "-q", "-am", "revise");
    git(f.dir, "push", "-q", "origin", "main");
    const v2 = git(f.dir, "rev-parse", "HEAD").trim();

    // Without the override the adding commit is the reference, and v2 changed the file after it.
    expectRefused(run(f, "--report", f.report, "--check"), "G-D", f);

    const r = run(f, "--report", f.report, "--prereg-commit", v2, "--check");
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain(v2);
    expect(r.stdout).toContain(`prior versions           ${v1}`);
  }, TIMEOUT);
});

describe("INPUT refusals", () => {
  it("refuses without --report", () => {
    const f = fixture();
    expectRefused(run(f, "--check"), "INPUT", f);
  }, TIMEOUT);

  it("refuses a report that does not exist, is not JSON, or is not a bench-v2 report", () => {
    const f = fixture();
    expectRefused(run(f, "--report", join(f.base, "absent.json"), "--check"), "INPUT", f);
    writeFileSync(f.report, "{not json", "utf8");
    expectRefused(run(f, "--report", f.report, "--check"), "INPUT", f);
    writeFileSync(f.report, JSON.stringify({ benchmark: "bench-v1", units: [], headline: [] }), "utf8");
    expectRefused(run(f, "--report", f.report, "--check"), "INPUT", f);
  }, TIMEOUT);

  it("refuses an unknown argument with exit 2", () => {
    const f = fixture();
    const r = run(f, "--report", f.report, "--force");
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("REFUSED [INPUT]");
  }, TIMEOUT);
});

describe("G-A — documented-TA is non-empty overall and on every (block, seed)", () => {
  it("refuses a (block, seed) with no documented-TA target", () => {
    const f = fixture();
    setReport(f, (r) => {
      for (const u of r.units) if (u.seed === 8201) u.documented_counts["TRULY_AMBIGUOUS"] = 0;
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-A", f);
    expect(r.stdout).toContain("P:8201");
  }, TIMEOUT);

  it("refuses a corpus with none at all", () => {
    const f = fixture();
    setReport(f, (r) => {
      for (const u of r.units) u.documented_counts["TRULY_AMBIGUOUS"] = 0;
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-A", f);
    expect(r.stdout).toContain("over the whole corpus");
  }, TIMEOUT);
});

describe("G-B — documented-discriminable is non-empty on every block-P seed", () => {
  it("refuses a block-P seed with no discriminable target", () => {
    const f = fixture();
    setReport(f, (r) => {
      for (const u of r.units) if (u.seed === 8200) u.documented_counts["DISCRIMINABLE"] = 0;
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-B", f);
    expect(r.stdout).toContain("8200");
  }, TIMEOUT);

  it("refuses a report with no block-P unit", () => {
    const f = fixture();
    setReport(f, (r) => {
      r.units = r.units.filter((u) => u.block !== "P");
    });
    expectRefused(run(f, "--report", f.report, "--check"), "G-B", f);
  }, TIMEOUT);
});

describe("G-C — every headline denominator is non-empty or declared empty", () => {
  it("refuses a missing headline metric", () => {
    const f = fixture();
    setReport(f, (r) => {
      const row = r.headline.find((h) => h["block"] === "P" && h["agent"] === "ASSAY") as { metrics: { id: string }[] };
      row.metrics = row.metrics.filter((m) => m.id !== "M-G");
    });
    expectRefused(run(f, "--report", f.report, "--check"), "G-C", f);
  }, TIMEOUT);

  it("refuses an empty denominator §5 does not declare", () => {
    const f = fixture();
    setReport(f, (r) => {
      const row = r.headline.find((h) => h["block"] === "P" && h["agent"] === "ASSAY") as { metrics: { id: string; denominator: number }[] };
      const m = row.metrics.find((x) => x.id === "M-A");
      if (m) m.denominator = 0;
    });
    expectRefused(run(f, "--report", f.report, "--check"), "G-C", f);
  }, TIMEOUT);

  it("refuses a declared-empty denominator (M-B on block S) that is not empty", () => {
    const f = fixture();
    setReport(f, (r) => {
      const row = r.headline.find((h) => h["block"] === "S" && h["agent"] === "ASSAY") as { metrics: { id: string; denominator: number }[] };
      const m = row.metrics.find((x) => x.id === "M-B");
      if (m) m.denominator = 3;
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-C", f);
    expect(r.stdout).toContain("declared empty");
  }, TIMEOUT);

  it("refuses M-D's value computed with no reference arm", () => {
    const f = fixture();
    setReport(f, (r) => {
      const row = r.headline.find((h) => h["block"] === "P" && h["agent"] === "A2-NOABSTAIN") as Record<string, unknown>;
      row["forced_choice_harm"] = { value_paise: null, excluded_by: { NO_REFERENCE_ARM: 8 } };
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-C", f);
    expect(r.stdout).toContain("NO_REFERENCE_ARM");
  }, TIMEOUT);

  it("admits an empty M-D committed set only when EXCEPTED_NO_ALLOCATION covers every documented-TA target", () => {
    const f = fixture();
    const emptyMd = (excepted: number) => (r: ReturnType<typeof goodReport>): void => {
      const row = r.headline.find((h) => h["block"] === "S" && h["agent"] === "A2-NOABSTAIN") as { metrics: Record<string, unknown>[] };
      row.metrics = [metric("M-D", 0, { excluded_by: { EXCEPTED_NO_ALLOCATION: excepted } })];
    };
    setReport(f, emptyMd(6));
    expect(run(f, "--report", f.report, "--check").status).toBe(0);
    setReport(f, emptyMd(5));
    expectRefused(run(f, "--report", f.report, "--check"), "G-C", f);
  }, TIMEOUT);
});

describe("G-D — the pre-registration is byte-identical to its pushed commit", () => {
  it("refuses when the document was never committed", () => {
    const f = fixture({ commitPrereg: false });
    expectRefused(run(f, "--report", f.report, "--check"), "G-D", f);
  }, TIMEOUT);

  it("refuses a commit that is on no remote-tracking branch", () => {
    const f = fixture({ push: false });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-D", f);
    expect(r.stdout).toContain("no remote-tracking branch");
  }, TIMEOUT);

  it("refuses a working tree that differs from the commit", () => {
    const f = fixture();
    write(f.dir, PREREG, "# pre-registration v1, edited after the fact\n");
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-D", f);
    expect(r.stdout).toContain("not byte-identical");
  }, TIMEOUT);

  it("refuses a later commit that touches the document", () => {
    const f = fixture();
    write(f.dir, PREREG, "# pre-registration v1, amended\n");
    git(f.dir, "commit", "-q", "-am", "amend");
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-D", f);
    expect(r.stdout).toContain("was changed after the pre-registration commit");
  }, TIMEOUT);

  it("refuses --prereg-commit that names no commit, or one that does not touch the document", () => {
    const f = fixture();
    expectRefused(run(f, "--report", f.report, "--prereg-commit", "deadbeef", "--check"), "G-D", f);
    const base = git(f.dir, "rev-list", "--max-parents=0", "HEAD").trim();
    const r = run(f, "--report", f.report, "--prereg-commit", base, "--check");
    expectRefused(r, "G-D", f);
    expect(r.stdout).toContain("does not touch");
  }, TIMEOUT);

  it("refuses a --prereg-commit that is not an ancestor of HEAD", () => {
    const f = fixture();
    git(f.dir, "checkout", "-q", "-b", "elsewhere");
    write(f.dir, PREREG, "# a version that never reached main\n");
    git(f.dir, "commit", "-q", "-am", "side");
    git(f.dir, "push", "-q", "origin", "elsewhere");
    const side = git(f.dir, "rev-parse", "HEAD").trim();
    git(f.dir, "checkout", "-q", "main");
    const r = run(f, "--report", f.report, "--prereg-commit", side, "--check");
    expectRefused(r, "G-D", f);
    expect(r.stdout).toContain("not an ancestor of HEAD");
  }, TIMEOUT);
});

describe("G-E — the protected trees are untouched", () => {
  it("refuses an uncommitted or untracked change under a protected path", () => {
    const f = fixture();
    write(f.dir, "bench/test/9000/stray.jsonl", "x\n");
    expectRefused(run(f, "--report", f.report, "--check"), "G-E", f);
  }, TIMEOUT);

  it("refuses a committed change under a protected path since the pre-registration", () => {
    const f = fixture();
    write(f.dir, "runs/seal-v1.0.13/test/9000/ASSAY/offline/metrics.json", "{\"moved\":true}\n");
    git(f.dir, "commit", "-q", "-am", "touch the seal");
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-E", f);
    expect(r.stdout).toContain("committed changes under protected paths");
  }, TIMEOUT);
});

describe("G-F — corpus seeds are disjoint from every test seed", () => {
  it("refuses a corpus seed inside a registered test-seed range", () => {
    const f = fixture();
    setReport(f, (r) => {
      for (const u of r.units) if (u.seed === 8201) u.seed = 7003;
    });
    const r = run(f, "--report", f.report, "--check");
    expectRefused(r, "G-F", f);
    expect(r.stdout).toContain("corpus seed 7003");
  }, TIMEOUT);

  it("refuses when the registry is missing or malformed", () => {
    const f = fixture();
    writeFileSync(join(f.dir, "scripts/test-seed-registry.json"), JSON.stringify({ ranges: [] }), "utf8");
    expectRefused(run(f, "--report", f.report, "--check"), "G-F", f);
    rmSync(join(f.dir, "scripts/test-seed-registry.json"));
    expectRefused(run(f, "--report", f.report, "--check"), "G-F", f);
  }, TIMEOUT);
});
