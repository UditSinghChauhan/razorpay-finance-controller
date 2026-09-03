import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEMO_DATASET_IDS, observationsPathFor } from "../apps/api/src/index.js";

/**
 * The product surface reaches no benchmark artifact, and invents no figure.
 *
 * This lives at the workspace level rather than under `apps/web/tests/` for the
 * reason `workspace-suite-floor.test.ts` does: it is a check about a boundary
 * BETWEEN parts of the workspace, and it reads the source tree of one app while
 * importing the allowlist of another. Neither belongs inside a package's own
 * suite.
 *
 * Two boundaries are checked, and they are different:
 *
 * 1. **No benchmark path is reachable.** `demo/README.md` states five hard
 *    boundaries on the demo fixture and the fifth is that nothing there may
 *    support a benchmark claim; `EVALUATION_SPEC.md §5.5` admits only numbers
 *    that exist in a committed run artifact. The frontend therefore reads no
 *    file at all — it speaks to `apps/api` over `/api`, and `apps/api` resolves
 *    a dataset NAME against a table with no benchmark entry in it.
 * 2. **No figure is fabricated.** Every rupee amount, identifier and count the
 *    UI shows arrives in a response. A demo value hard-coded into a component
 *    would render identically to a real one, so the source is checked for the
 *    run's own values directly.
 *
 * The tree is walked rather than listed, so a component added later is covered
 * without anyone remembering to add it here.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const FILES = sourceFiles(WEB_SRC);

/** Source with block and line comments removed, so prose cannot trip a check. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const name = (path: string): string => relative(WEB_SRC, path);

describe("apps/web has source to check", () => {
  it("finds component files", () => {
    // Guards the degenerate case: `it.each` over an empty list asserts nothing.
    expect(FILES.length).toBeGreaterThan(0);
  });
});

describe("no benchmark path is reachable from apps/web", () => {
  it.each(FILES)("%s names no benchmark or run artifact", (path) => {
    const body = code(path);
    for (const forbidden of [
      "bench/",
      "runs/seal-",
      "seal-v1.0.13",
      "metrics.json",
      "ground_truth",
      "oracle_labels",
      ".jsonl",
    ]) {
      expect(body, `${name(path)} contains ${forbidden}`).not.toContain(forbidden);
    }
  });

  it.each(FILES)("%s reads no file of its own", (path) => {
    const body = code(path);
    for (const forbidden of ["node:fs", "node:path", "readFileSync", "createReadStream"]) {
      expect(body, name(path)).not.toContain(forbidden);
    }
  });

  it("addresses only the /api namespace", () => {
    const targets = FILES.flatMap((path) => [
      ...code(path).matchAll(/fetch\(\s*[`"']([^`"']*)/g),
    ]).map((match) => match[1] ?? "");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^\/api\/runs/);
  });

  it("cannot name a benchmark dataset, because the allowlist has none", () => {
    // The structural guarantee behind the checks above: apps/api resolves a
    // NAME, never a path, and the table it resolves against holds one entry.
    expect([...DEMO_DATASET_IDS]).toEqual(["demo-500"]);
    const path = observationsPathFor("demo-500");
    expect(path).toContain(join("demo", "demo-500"));
    expect(path).not.toContain(join(ROOT, "bench"));
  });
});

describe("no demo value is hard-coded into apps/web", () => {
  it.each(FILES)("%s carries none of the run's own identifiers", (path) => {
    const body = code(path);
    for (const forbidden of [
      "obs_reconline",
      "obs_settlement",
      "setl_AMBIG",
      "pay_AMB",
      "cand_",
      "comp_58b9",
      "engine.s5_validate",
    ]) {
      expect(body, name(path)).not.toContain(forbidden);
    }
  });

  it.each(FILES)("%s carries none of the certificate's member amounts", (path) => {
    const body = code(path);
    // The five allocation terms and the target they tie out to, in paise.
    for (const amount of ["5000000", "3000000", "2000000", "6000000", "4000000", "10000000"]) {
      expect(body, name(path)).not.toContain(amount);
    }
  });
});
