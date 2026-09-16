import { configDefaults, defineConfig } from "vitest/config";

// Test runner for the whole workspace. DECISION_BRIEF.md §J fixes vitest +
// fast-check because "property-based tests are the right tool for conservation
// invariants", and §L.3 makes property tests on every invariant a package owns
// a condition of that package being complete.
/**
 * Files whose properties build a whole dataset, chain or report per
 * fast-check case. Measured on an idle machine the heaviest single test in
 * each takes 3-7s (`population.test.ts` "completes on every family instance"
 * is 6.8s; `chain.prop.test.ts` "gives equal digests only to equal canonical
 * bodies" is 3.6s), and under a full-width parallel run on a loaded box that
 * is inflated 5-10x — 16 workers on 16 logical cores with 7 GB of RAM saw the
 * suite's import phase alone reach 470s of CPU across a 220s wall clock. The
 * 30s `testTimeout` then reports a timeout on a green tree in roughly two
 * runs out of three (three consecutive `pnpm run test` on that box: 5 timed
 * out, 0, 2 — always in these files), and a reviewer who clones the repo
 * reads that as a broken project, not a busy machine.
 *
 * These files get their own bound via the `slow-properties` project. That is
 * the whole difference: same include globs, same assertions, same fast-check
 * `numRuns`, same seeds. Nothing is skipped, retried or marked flaky.
 */
const SLOW_PROPERTY_FILES = [
  "packages/generator/tests/**/*.test.ts",
  "packages/ledger/tests/property/**/*.test.ts",
];

export default defineConfig({
  test: {
    environment: "node",

    // §K places each package's tests under packages/<name>/tests/. The
    // workspace-level tests/ directory holds checks that belong to no single
    // package — currently the §L.3 suite floor.
    // `.test.tsx` is matched as well as `.test.ts` because apps/web's units are
    // React components and a component test that may not write JSX is a
    // component test that will be written against a string instead.
    include: [
      "packages/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.ts",
      "apps/*/tests/**/*.test.tsx",
      "tests/**/*.test.ts",
    ],

    // Property suites run 2,000 cases each (DECISION_BRIEF.md §J fixes
    // fast-check; §L.3 makes property tests on every invariant a completeness
    // condition), and vitest runs test FILES in parallel. The heaviest single
    // property in packages/ledger takes ~2.6s alone and 3-6x that when several
    // workers are competing for the CPU, so the 5s default is not a real
    // budget — it is a machine-speed test wearing a correctness test's clothes,
    // and it failed on a green tree the first time a fourth property file was
    // added. The bound below is generous enough that only a genuine hang trips
    // it. It relaxes no assertion: a property that fails still fails.
    // The generator and ledger property files outgrew even this bound under
    // contention; they run under the `slow-properties` project below.
    testTimeout: 30_000,

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

    // Two projects, one bound each; the split decides only which
    // `testTimeout` a file runs under.
    //
    // `workspace` inherits everything above (`extends: true`) and subtracts
    // the slow files. `slow-properties` deliberately does NOT extend: the
    // inheritance is a Vite `mergeConfig`, which CONCATENATES arrays, so an
    // extended project that declared its own `include` would collect the
    // root's globs as well and run every file twice. It declares the three
    // things it needs instead. Typechecking stays with `workspace` alone — a
    // `.test-d.ts` collected by both projects would be counted twice.
    //
    // The 120s bound comes from the note on SLOW_PROPERTY_FILES: the worst
    // reading at four workers was 12.4s and the full-width run passed 30s, so
    // 120s leaves roughly 3x over the worst contention seen while a genuine
    // hang still fails. The 30s bound above is untouched for every other file.
    projects: [
      {
        extends: true,
        test: {
          name: "workspace",
          exclude: [...configDefaults.exclude, ...SLOW_PROPERTY_FILES],
        },
      },
      {
        test: {
          name: "slow-properties",
          environment: "node",
          include: SLOW_PROPERTY_FILES,
          testTimeout: 120_000,
        },
      },
    ],
  },
});
