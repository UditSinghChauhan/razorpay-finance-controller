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

  // --- packages/probe · purity, and the §T7 control surface ----------------
  //
  // Spec 1.4.23 makes this package the sole constructor of a probe call and the
  // single owner of §T7's four controls. Two properties keep that true.
  //
  // PURITY. §L.2 places `probe` between `engine S4-S5` and `llm`, which is only
  // available because the loop consumes an R3 proposal as a VALUE. An import of
  // packages/llm would make the build order cyclic; an import of the oracle or
  // the generator would breach AL1/AL2's spirit for a package that sits on the
  // agent path. A clock or a random draw would break metric 23, since the PROBE
  // event body enters the hashed body (DATA_MODEL.md §16).
  //
  // NO TRANSPORT. §T7's SSRF control is a property rather than a check only
  // while no URL, host or socket exists in this path. Banning the transports
  // outright is what makes that structural.
  //
  // Scoped to `src/`, not the package. The suite that ASSERTS purity has to read
  // this package's own source as text, which is filesystem I/O — the point
  // packages/engine's discipline suite already makes: "The engine itself
  // performs no I/O; a test asserting that fact necessarily does."
  {
    files: ["packages/probe/src/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "http", "https", "net", "tls", "dgram", "http2", "fs", "path", "undici", "axios",
          ].map((mod) => ({
            name: mod,
            message:
              "packages/probe is pure: no filesystem and no network. The caller " +
              "performs the dispatch (ARCHITECTURE.md §3 gives apps/cli all " +
              "filesystem I/O; spec 1.4.23, §A.30).",
          })),
          patterns: [
            {
              group: [
                "node:http", "node:https", "node:net", "node:tls", "node:dgram",
                "node:http2", "node:fs", "node:fs/promises", "node:path",
              ],
              message:
                "packages/probe is pure: no filesystem and no network (spec 1.4.23).",
            },
            {
              group: ["@assay/llm", "@assay/llm/*", "**/packages/llm/**"],
              message:
                "packages/probe may not import packages/llm. DECISION_BRIEF.md §L.2 " +
                "places `probe` BEFORE `llm`, which is only available because the " +
                "loop consumes an R3 proposal as a value rather than calling R3.",
            },
            {
              group: GENERATOR,
              message:
                "packages/probe may not import packages/generator. It holds " +
                "GroundTruth (DATA_MODEL.md §1); this package sits on the agent path.",
            },
            {
              group: ORACLE,
              message:
                "packages/probe may not import packages/oracle. The oracle is the " +
                "observations-only reference (PREREGISTRATION.md §5.1, AL8).",
            },
            { group: UNTRUSTED_TEXT, message: UNTRUSTED_TEXT_MSG },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message:
            "packages/probe must be deterministic: the PROBE event body enters " +
            "the hashed body (DATA_MODEL.md §16) and metric 23 requires two runs " +
            "over identical inputs to agree.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "packages/probe must be deterministic (DATA_MODEL.md §16).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...["http", "https", "net", "tls", "fs"].map((mod) =>
          dynamicImportBan(
            `/^(node:)?${mod}$/`,
            "packages/probe is pure: no filesystem and no network (spec 1.4.23).",
          ),
        ),
        dynamicImportBan(
          "/llm/",
          "packages/probe may not import packages/llm (DECISION_BRIEF.md §L.2).",
        ),
      ],
    },
  },

  // --- packages/llm · §L.1 rule 2 + the offline no-network guarantee -------
  //
  // Rule 2: "No LLM output schema may contain a numeric field. A CI lint fails
  // the build if one appears." The deferred note this block replaces expected a
  // custom rule; `no-restricted-syntax` expresses it directly, and a stock rule
  // is the better outcome — there is no plugin to keep in step with the ESLint
  // API, and the selectors below cannot be satisfied by a schema that merely
  // looks non-numeric.
  //
  // This is the half of the enforcement that catches a schema WRITTEN here.
  // A schema PASSED IN from elsewhere is caught at runtime by
  // packages/llm/src/verify/schema.ts, which walks the zod tree on every call —
  // §6.5 types `invoke`'s `schema` as an arbitrary ZodType, so a lint over this
  // package alone could never be the whole control.
  //
  // The second group is the `--llm=offline` guarantee. §6.5 gives that provider
  // "Network: none" and §L.1 rule 10 makes the full pipeline pass under it, so
  // the two built providers must have no network reachable at all. Banning the
  // transports outright is stronger than trusting a code path not to take them,
  // and it is what makes T0-11's "runs from a clean checkout with no API key"
  // structural. The two metered providers are §H tier H2 and are not built
  // here; the phase that builds them scopes this group to exclude their files.
  //
  // Scoped to `src/`, not to the package. `tests/` must be able to CONSTRUCT a
  // numeric schema in order to assert that the guard rejects it — a test that
  // cannot express the forbidden thing cannot prove it is forbidden, which is
  // the same reason packages/money's type-level suite writes the float
  // assignment it exists to reject. Nothing ships from `tests/`: the role
  // schemas live in `src/roles/`, this block covers them, and
  // `tests/discipline.test.ts` independently asserts that each shipped schema
  // passes `assertNoNumericField`.
  {
    files: ["packages/llm/src/**"],
    linterOptions: {
      // §L.1 rule 2 is listed among "invariants that may never be violated". A
      // boundary a one-line `eslint-disable` can lift is not enforced.
      noInlineConfig: true,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["number", "int", "int32", "uint32", "float32", "float64", "bigint", "nan", "date"].map(
          (numeric) => ({
            selector: `MemberExpression[object.name='z'][property.name='${numeric}']`,
            message:
              `DECISION_BRIEF.md §L.1 rule 2: no LLM output schema may contain a ` +
              `number-typed field (z.${numeric}). Where a quantity is needed the model ` +
              `returns an IDENTIFIER and deterministic code looks up the value ` +
              `(ARCHITECTURE.md §4 boundary 2).`,
          }),
        ),
        {
          // `raw` rather than `value`: on a numeric Literal `value` is a number
          // and esquery's regex operand is a string test, so `[value=/…/]` never
          // matches. `raw` is the source text and always is one.
          // Descendant, not child: `z.literal(-1)` parses as a UnaryExpression
          // wrapping the Literal, so a `>` combinator misses every negative.
          selector: "CallExpression[callee.property.name='literal'] Literal[raw=/^[0-9]/]",
          message:
            "DECISION_BRIEF.md §L.1 rule 2: z.literal(<number>) is a number-typed " +
            "field in an LLM output schema. Use a string identifier.",
        },
        {
          selector: "CallExpression[callee.property.name='literal'] Literal[bigint]",
          message:
            "DECISION_BRIEF.md §L.1 rule 2: z.literal(<bigint>) is a number-typed " +
            "field in an LLM output schema. Use a string identifier.",
        },
        // `no-restricted-imports` does not inspect dynamic `import()`, which
        // would otherwise leave a one-line bypass of the no-network guarantee —
        // the same hole the engine block closes the same way.
        ...["http", "https", "net", "tls", "dgram", "http2"].map((mod) =>
          dynamicImportBan(
            `/^(node:)?${mod}$/`,
            "ARCHITECTURE.md §6.5: the providers built at Phase 8 (`offline`, `replay`) " +
              "are Network: none. DECISION_BRIEF.md §C T0-11 requires the full pipeline " +
              "to run from a clean checkout with no API key.",
          ),
        ),
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "http", "https", "net", "tls", "dgram", "http2", "undici", "node-fetch", "axios",
          ].map((mod) => ({
            name: mod,
            message:
              "ARCHITECTURE.md §6.5 gives the `offline` provider Network: none, and " +
              "§L.1 rule 10 makes the full pipeline pass under --llm=offline. The two " +
              "providers built at Phase 8 reach no network at all.",
          })),
          patterns: [
            {
              group: ["node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:http2"],
              message:
                "ARCHITECTURE.md §6.5: the providers built at Phase 8 (`offline`, " +
                "`replay`) are Network: none. DECISION_BRIEF.md §C T0-11 requires the " +
                "full pipeline to run from a clean checkout with no API key.",
            },
          ],
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
  // -------------------------------------------------------------------------
);
