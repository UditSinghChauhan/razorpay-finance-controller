import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONVENTIONS, UNRATIFIED, UNRATIFIED_COUNT } from "../src/conventions.js";
import { BENCHMARK_VERSION, HELD_OUT_FAMILIES, IMPLEMENTED_FAMILIES } from "../src/frozen.js";
import { generateFamily } from "../src/generate.js";
import { DECLARED_SEEDS } from "../src/seeds.js";
import { TEST_SEEDS } from "./fixtures.js";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");

/**
 * `PREREGISTRATION.md §6.1`'s permitted and forbidden lists for `F07`-`F10`.
 *
 * Every condition is binding; the tests are permitted only when all four hold.
 * `AL7` burns a seed on any breach of the forbidden list, not only on inspection.
 */
describe("§6.1 held-out family discipline", () => {
  it("condition 1 — every test seed appears in no row of the split table", () => {
    for (const seed of TEST_SEEDS) expect(DECLARED_SEEDS).not.toContain(seed);
  });

  it("refuses to generate at a declared split seed unless the caller says so explicitly", () => {
    for (const seed of DECLARED_SEEDS) {
      expect(() => generateFamily("F07", seed)).toThrow(/declared §6.1 split seed/);
      expect(() => generateFamily("F01", seed)).toThrow(/declared §6.1 split seed/);
    }
  });

  it("condition 3 — no test in this package reaches packages/engine, directly or otherwise", () => {
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "tests"))) {
      expect(source.text).not.toMatch(/@assay\/(engine|oracle)/);
      expect(source.text).not.toMatch(/packages\/(engine|oracle)/);
    }
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "src"))) {
      expect(source.text).not.toMatch(/@assay\/(engine|oracle)/);
    }
  });

  it("condition 4 — no test prints, logs or writes anything", () => {
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "tests"))) {
      expect(source.text, `${source.path} must not log`).not.toMatch(/console\.(log|info|warn|error|debug)/);
      expect(source.text, `${source.path} must not write files`).not.toMatch(
        /writeFileSync|createWriteStream|appendFileSync|process\.stdout/,
      );
    }
  });

  it("assigns F07-F10 to no development split", () => {
    expect(HELD_OUT_FAMILIES).toStrictEqual(["F07", "F08", "F09", "F10"]);
    for (const family of HELD_OUT_FAMILIES) {
      // §6.1: "Generating F07-F10 instances into the dev or train split at all"
      // is forbidden. The generator has no split concept; the seed is the gate,
      // and every train/dev seed is refused above.
      expect(IMPLEMENTED_FAMILIES).toContain(family);
    }
  });
});

/**
 * `PREREGISTRATION.md §1` step 1 and `§9` step 2: generation is a sealed-run
 * activity. This milestone builds the generator and generates nothing.
 */
describe("this milestone generates no benchmark data", () => {
  it("writes no file: nothing in src reaches the filesystem or the network", () => {
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "src"))) {
      expect(source.text, `${source.path}`).not.toMatch(/node:fs|node:net|node:http|require\(['"]fs/);
      expect(source.text, `${source.path}`).not.toMatch(/\bfetch\s*\(/);
      expect(source.text, `${source.path}`).not.toMatch(/writeFileSync|mkdirSync|createWriteStream/);
    }
  });

  it("reads no clock and no environment: two runs over identical input agree", () => {
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "src"))) {
      // `new Date(...)` with an explicit epoch argument is permitted for the IST
      // calendar conversions; `Date.now()` and a bare `new Date()` are not.
      expect(source.text, `${source.path}`).not.toMatch(/Date\.now\(\)/);
      expect(source.text, `${source.path}`).not.toMatch(/new Date\(\s*\)/);
      expect(source.text, `${source.path}`).not.toMatch(/process\.env/);
      expect(source.text, `${source.path}`).not.toMatch(/Math\.random/);
    }
  });

  // RETIRED: "leaves bench/ absent — no dataset artifact exists".
  //
  // It asserted existsSync(REPO_ROOT/bench) === false, which held for the
  // milestone that wrote it and is false of any repository where
  // PREREGISTRATION.md §9 step 0 has been taken. Step 0's first command IS
  // `assay generate --split dev --seeds 2000-2004`, which writes
  // bench/dev/<seed>/ by construction, and §9 records that this is permitted
  // before the seal: "DEV generation is permitted before the seal in any case
  // -- §6.1's forbidden list bars --split test, not --split dev." The assertion
  // therefore contradicted the frozen procedure rather than guarding it, and no
  // frozen clause requires bench/ to be absent.
  //
  // Nothing else in this describe is weakened: this package still writes no
  // file, reads no clock and no environment, and references no provider, and
  // runs/ is still asserted to carry no unaccounted run output below — which is
  // the check that actually keeps a SCRATCH scored run out of the tree, and
  // which §9 step 0 does not produce ("It EMITS NO metrics.json, is NOT a
  // scored run").

  // AMENDED, on the same ground as the retirement above: "leaves runs/ empty
  // apart from its .gitkeep".
  //
  // It asserted readdirSync(REPO_ROOT/runs) === [".gitkeep"], which held for
  // the milestone that wrote it and is false of any repository where
  // PREREGISTRATION.md §9 step 7 has been taken. Step 7 IS `assay bench
  // --sealed --agents … --seeds …`, and EVALUATION_SPEC.md §7 places its
  // artifacts at runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
  // and requires them COMMITTED — §5.5 forbids "any number in the demo that
  // does not exist in a committed run artifact", and .gitignore records the
  // same at spec 1.4.29 (M48). The bare assertion therefore contradicted the
  // frozen procedure rather than guarding it, exactly as the bench/ assertion
  // did, and no frozen clause requires runs/ to hold only .gitkeep once the
  // sealed run has been recorded.
  //
  // WHAT THE CHECK IS FOR IS UNCHANGED, and is what it still enforces: this
  // package generates no benchmark data, so no run output may appear that the
  // sealed lifecycle does not account for. A directory left behind by a test,
  // a scratch sweep or a second unrecorded run still fails. The sealed run's
  // directory is DERIVED from BENCHMARK_VERSION rather than transcribed, on
  // M46's lesson — §9's own literals drifted from that constant once already —
  // so a version bump moves this allowance with it rather than silently
  // admitting a stale directory.
  it("adds no run output beyond the committed sealed run", () => {
    const sealedRun = `seal-v${BENCHMARK_VERSION}`;
    const unaccounted = readdirSync(join(REPO_ROOT, "runs")).filter(
      (entry) => entry !== ".gitkeep" && entry !== sealedRun,
    );
    expect(unaccounted).toStrictEqual([]);
  });

  it("involves no model: nothing in this package references a provider", () => {
    for (const source of sourcesUnder(join(PACKAGE_ROOT, "src"))) {
      expect(source.text, `${source.path}`).not.toMatch(/anthropic|openai|llm|LlmProvider/i);
    }
  });
});

/** `conventions.ts`'s pin — the mechanism that makes an invented parameter countable. */
describe("the convention register", () => {
  it("pins the number of unratified conventions", () => {
    expect(UNRATIFIED).toHaveLength(UNRATIFIED_COUNT);
  });

  it("gives every convention an id, a subject, a decision and a reason", () => {
    for (const convention of CONVENTIONS) {
      expect(convention.id).toMatch(/^[UC]-[A-Z0-9-]+$/);
      expect(convention.subject.length).toBeGreaterThan(8);
      expect(convention.decision.length).toBeGreaterThan(20);
      expect(convention.why.length).toBeGreaterThan(40);
    }
    expect(new Set(CONVENTIONS.map((c) => c.id)).size).toBe(CONVENTIONS.length);
  });

  it("prefixes a ratified convention with C- and an unratified one with U-", () => {
    for (const convention of CONVENTIONS) {
      expect(convention.id.startsWith(convention.spec_basis === null ? "U-" : "C-")).toBe(true);
    }
  });

  it("lists every unratified convention in the package README", () => {
    const readme = readFileSync(join(PACKAGE_ROOT, "README.md"), "utf8");
    for (const convention of UNRATIFIED) {
      expect(readme, `README must carry ${convention.id}`).toContain(convention.id);
    }
  });
});

/**
 * Every `.ts` file under `dir`, with comments stripped and this scanner itself
 * excluded.
 *
 * Comments are stripped because the bans below are on **code**, not on prose: a
 * module that documents why it does not call `Math.random` would otherwise fail
 * the check that it does not call it. This file is excluded because it carries
 * every banned pattern as a literal, and a scanner that matches itself reports
 * nothing useful.
 */
function sourcesUnder(dir: string): { path: string; text: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) => entry.name !== "discipline.test.ts")
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { path, text: stripComments(readFileSync(path, "utf8")) };
    });
}

/** Remove block and line comments. Deliberately simple; it scans source, not JS. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
