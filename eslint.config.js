import js from "@eslint/js";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------
// Architectural boundaries — pre-registered before the packages they constrain.
//
// DECISION_BRIEF.md §L.1 rule 3 and PREREGISTRATION.md §6.2 AL1 both state
// these as ESLint-enforced and CI-checked, not as conventions:
//
//   packages/engine may not import packages/generator, packages/oracle, or
//   untrusted_text.  packages/oracle may not import packages/engine or
//   packages/generator.
//
// They are written now, while every constrained package is still empty, because
// a boundary added after the code it governs is a boundary that has already
// been crossed at least once. ARCHITECTURE.md §7.1 makes the same point about
// the oracle: its whole value is being *not* the engine and *not* the
// generator, and that is only true if it is mechanically prevented from
// becoming either.
// ---------------------------------------------------------------------------

/** `packages/generator` — holds GroundTruth, including `true_journal`. */
const GENERATOR = [
  "@assay/generator",
  "@assay/generator/*",
  "**/packages/generator/**",
];

/** `packages/oracle` — the deliberately naive second implementation. */
const ORACLE = ["@assay/oracle", "@assay/oracle/*", "**/packages/oracle/**"];

/**
 * `packages/engine` — stages S1–S5.
 *
 * NOT S0: `RECONCILIATION_SPEC.md §2` gives S0 the output `Observation[]` +
 * `UntrustedText[]`, and the ban below forbids this package from importing
 * `UntrustedText` at all. A stage cannot emit a type its package may not
 * import, so S0 is `packages/domain`'s over data `apps/cli` has already read
 * (`ARCHITECTURE.md §3`, spec 1.4.18; `DECISION_BRIEF.md §A.25`).
 */
const ENGINE = ["@assay/engine", "@assay/engine/*", "**/packages/engine/**"];

/**
 * The quarantined free-text store (DATA_MODEL.md §10).
 *
 * `UntrustedText` must live in its own module with its own subpath export so
 * that it is separately bannable while `packages/engine` keeps importing the
 * rest of `packages/domain`. The path below is therefore a binding convention
 * for Phase 2: schemas/untrusted-text.ts, exported as
 * "@assay/domain/untrusted-text".
 */
const UNTRUSTED_TEXT = [
  "@assay/domain/untrusted-text",
  "**/schemas/untrusted-text",
  "**/schemas/untrusted-text.js",
];

const GENERATOR_MSG =
  "packages/engine and packages/oracle may not import packages/generator. " +
  "It holds GroundTruth (DATA_MODEL.md §1). DECISION_BRIEF.md §L.1 rule 3; " +
  "PREREGISTRATION.md §6.2 AL1.";

const ORACLE_MSG =
  "packages/engine may not import packages/oracle. The oracle's independence " +
  "is what makes abstention precision measurable (ARCHITECTURE.md §7.2). " +
  "DECISION_BRIEF.md §L.1 rule 3.";

const ENGINE_MSG =
  "packages/oracle may not import packages/engine. The oracle must be a " +
  "second, independent implementation of constraints.decl.ts, or the " +
  "consistency gate compares the engine with itself (ARCHITECTURE.md §7.2). " +
  "DECISION_BRIEF.md §L.1 rule 3.";

const UNTRUSTED_TEXT_MSG =
  "packages/engine may not import the quarantined text store. The " +
  "prompt-injection defence is that the deterministic core *cannot* read " +
  "hostile text, not that it chooses not to (DATA_MODEL.md §10, " +
  "THREAT_MODEL.md §T1). DECISION_BRIEF.md §L.1 rule 3.";

/**
 * `no-restricted-imports` does not inspect dynamic `import()`, which would
 * leave a one-line bypass of a rule the specification treats as structural.
 */
const dynamicImportBan = (pattern, message) => ({
  selector: `ImportExpression > Literal[value=${pattern}]`,
  message: `${message} (dynamic import)`,
});

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.d.ts",
      "runs/**",
      "bench/**",
      "fixtures/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    linterOptions: {
      // A stale `eslint-disable` is a rule everyone believes is running.
      reportUnusedDisableDirectives: "error",
    },
  },

  // --- packages/engine ↛ generator | oracle | untrusted_text ---------------
  {
    files: ["packages/engine/**"],
    linterOptions: {
      // §L.1 rule 3 and AL1 describe these bans as enforced. A boundary that a
      // one-line `eslint-disable` can lift is not enforced, and AL7 burns a
      // seed on any breach — so inline configuration is refused here rather
      // than trusted. Restructure the import instead of suppressing the rule.
      noInlineConfig: true,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: GENERATOR, message: GENERATOR_MSG },
            { group: ORACLE, message: ORACLE_MSG },
            { group: UNTRUSTED_TEXT, message: UNTRUSTED_TEXT_MSG },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        dynamicImportBan("/generator/", GENERATOR_MSG),
        dynamicImportBan("/oracle/", ORACLE_MSG),
        dynamicImportBan("/untrusted-text/", UNTRUSTED_TEXT_MSG),
      ],
    },
  },

  // --- packages/oracle ↛ engine | generator --------------------------------
  {
    files: ["packages/oracle/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ENGINE, message: ENGINE_MSG },
            { group: GENERATOR, message: GENERATOR_MSG },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        dynamicImportBan("/engine/", ENGINE_MSG),
        dynamicImportBan("/generator/", GENERATOR_MSG),
      ],
    },
  },

  // --- packages/money determinism ------------------------------------------
  // Money arithmetic feeds the ledger root hash, so it must produce identical
  // output on every execution and under every locale. Metric 23
  // (`determinism_check`) and invariant I9 both require two runs over identical
  // inputs to agree byte for byte; DATA_MODEL.md §0 rule 1 keeps formatting at
  // render time only. A wall-clock read, a random draw or a locale-sensitive
  // conversion inside packages/money would break all three.
  {
    files: ["packages/money/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message:
            "packages/money must be deterministic: no wall-clock reads. " +
            "Timestamps are Unix seconds supplied by the caller " +
            "(DATA_MODEL.md §0 rule 2).",
        },
        {
          name: "Intl",
          message:
            "packages/money must be locale-independent. Money is formatted at " +
            "render only (DATA_MODEL.md §0 rule 1).",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "packages/money must be deterministic. Randomness belongs to the " +
            "generator's vendored xorshift128+ PRNG (ARCHITECTURE.md §11).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^toLocale/]",
          message:
            "Locale-dependent formatting is forbidden in packages/money: its " +
            "output must be identical under every locale " +
            "(DATA_MODEL.md §0 rule 1).",
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Deferred, and deliberately not written yet:
  //
  //   * The §L.1 rule 3 allowlist for packages/eval/src/gates/
  //     consistency-gate.ts, the single file permitted to import both engine
  //     and oracle. It lands with packages/eval (Phase 10).
  //
  //   * The §L.1 rule 2 schema lint: "No LLM output schema may contain a
  //     numeric field. A CI lint fails the build if one appears." This needs a
  //     custom rule and cannot be expressed with a stock one; it lands with
  //     packages/llm (Phase 8) and is that phase's acceptance criterion.
  // -------------------------------------------------------------------------
);
