import { defineConfig } from "vitest/config";

// Test runner for the whole workspace. DECISION_BRIEF.md §J fixes vitest +
// fast-check because "property-based tests are the right tool for conservation
// invariants", and §L.3 makes property tests on every invariant a package owns
// a condition of that package being complete.
export default defineConfig({
  test: {
    environment: "node",

    // §K places each package's tests under packages/<name>/tests/. The
    // workspace-level tests/ directory holds checks that belong to no single
    // package — currently the §L.3 suite floor.
    include: [
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],

    // Type-level tests. T0-1's acceptance criterion is that "float usage is a
    // compile error", which is only assertable by a test that fails when an
    // illegal assignment starts compiling.
    typecheck: {
      enabled: true,
      include: [
        "packages/*/tests/**/*.test-d.ts",
        "apps/*/tests/**/*.test-d.ts",
      ],
    },

    // `packages/money` landed with its tests, so the review this flag asked
    // for is due: a vanished suite is a build failure.
    //
    // What the flag guards is narrower than it looks, and the difference is
    // why tests/workspace-suite-floor.test.ts exists alongside it. Vitest
    // computes the run's outcome from the AGGREGATE module list against the
    // ROOT config — `hasFailed(modules) { if (!modules.length) return
    // !config.passWithNoTests; ... }` — so this setting only decides the case
    // where nothing matched anywhere. Delete one package's tests/ and another
    // package still matches, the module list is non-empty, and the run exits 0
    // whatever this flag says. Declaring per-project `passWithNoTests` does
    // not change that either: the check reads the root config.
    passWithNoTests: false,
  },
});
