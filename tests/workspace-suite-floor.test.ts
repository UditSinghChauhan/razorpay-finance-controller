import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The workspace suite floor — `DECISION_BRIEF.md §L.3`, made executable.
 *
 * §L.3 states that no package is complete without "unit tests on the happy
 * path" and "**property tests on every invariant it owns**". Nothing enforced
 * it. The include globs in `vitest.config.ts` cannot: vitest decides a run's
 * outcome from the AGGREGATE module list against the ROOT config, so deleting
 * one package's `tests/` directory leaves the workspace green for as long as
 * any other package still matches. `passWithNoTests: false` closes only the
 * case where nothing matched anywhere, and declaring vitest `projects` with a
 * per-project `passWithNoTests` does not close the per-package case either —
 * the check reads the root config, not the project's.
 *
 * This file is the missing check. It is deliberately a test rather than a
 * script so that it runs on the same `pnpm run verify` path as everything else
 * and fails the build in the same way.
 *
 * Scope is `packages/*` only. §L.3 says "per package"; `apps/*` are
 * applications and own no invariant of their own.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");

/** Every workspace package: a `packages/*` directory carrying a manifest. */
function packageNames(): string[] {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(PACKAGES, name, "package.json")))
    .sort();
}

/** `*.test.ts` files beneath `packages/<name>/<subtree>`, sorted. */
function testFiles(name: string, subtree: string): string[] {
  const dir = join(PACKAGES, name, subtree);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const NAMES = packageNames();

describe("the workspace contributes at least one package", () => {
  it("finds a package under packages/", () => {
    // Guards the degenerate case the floor below cannot see: `describe.each`
    // over an empty list registers no assertion at all, so a workspace whose
    // packages have vanished would satisfy every check by having none.
    expect(NAMES.length).toBeGreaterThan(0);
  });
});

describe.each(NAMES)("packages/%s", (name) => {
  it("contributes at least one test file (§L.3, unit tests)", () => {
    expect(testFiles(name, "tests")).not.toHaveLength(0);
  });

  it("contributes at least one property test (§L.3, invariants)", () => {
    // §J fixes fast-check because "property-based tests are the right tool for
    // conservation invariants", and §L.3 makes them a completeness condition
    // rather than a preference. A package whose property subtree is empty has
    // stopped meeting that condition whether or not its unit tests still pass.
    expect(testFiles(name, join("tests", "property"))).not.toHaveLength(0);
  });
});
