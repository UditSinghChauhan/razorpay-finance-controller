import { defineConfig } from "vitest/config";

// Test runner for the whole workspace. DECISION_BRIEF.md §J fixes vitest +
// fast-check because "property-based tests are the right tool for conservation
// invariants", and §L.3 makes property tests on every invariant a package owns
// a condition of that package being complete.
export default defineConfig({
  test: {
    environment: "node",

    // §K places each package's tests under packages/<name>/tests/.
    include: [
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
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

    // The workspace is being built one package at a time (§L.2) and currently
    // holds no packages, so `vitest run` must exit 0 on an empty match rather
    // than fail the verification path. REVIEW THIS at Commit 2: once
    // packages/money lands with its tests, this should be set back to false so
    // that a vanished suite is a build failure.
    passWithNoTests: true,
  },
});
