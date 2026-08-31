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

/** `packages/llm` — the four bounded roles behind one provider interface. */
const LLM = ["@assay/llm", "@assay/llm/*", "**/packages/llm/**"];

/** `packages/probe` — the §6.2 loop, whose channel belongs to the agent. */
const PROBE = ["@assay/probe", "@assay/probe/*", "**/packages/probe/**"];

const PROTECTED_ARTIFACT_MSG =
  "packages/engine and packages/oracle perform no I/O at all. " +
  "PREREGISTRATION.md §6.2 AL2 bars both from reading **/ground_truth*.jsonl " +
  "and AL8 bars both from **/recon_report*.jsonl, 'enforced by the same " +
  "runtime path guard as AL2 and by an ESLint rule'. Banning the transport is " +
  "stronger than banning the path: it makes the guard vacuous by construction. " +
  "ARCHITECTURE.md §3 gives apps/cli all filesystem I/O; the caller reads and " +
  "passes values in.";

const EVAL_ENGINE_MSG =
  "packages/eval may not import packages/engine. ARCHITECTURE.md §10 puts every " +
  "agent behind ONE interface so that 'ablations are configuration flags rather " +
  "than forked codebases -- which is what makes them valid controls'; a scorer " +
  "that orchestrated stages would be a second agent. The single permitted " +
  "exception is packages/eval/src/gates/consistency-gate.ts, allowlisted by " +
  "path below (DECISION_BRIEF.md §L.1 rule 3).";

const EVAL_LLM_MSG =
  "packages/eval may not import packages/llm. EVALUATION_SPEC.md §4.11 measures " +
  "the model's contribution through offline_parity; a measurement layer holding " +
  "LLM policy would be measuring itself. The provider is the AGENT's, behind " +
  "ARCHITECTURE.md §6.5's interface.";

const EVAL_PROBE_MSG =
  "packages/eval may not import packages/probe. RECONCILIATION_SPEC.md §6.2's " +
  "channel belongs to the agent, under P_max, and PREREGISTRATION.md §6.2 AL8 " +
  "keeps the recon report off every other path. EVALUATION_SPEC.md §4.13 has " +
  "eval read back the probe COUNT, which arrives on the run as a value.";

const EVAL_UNTRUSTED_TEXT_MSG =
  "packages/eval may not import the quarantined text store (DATA_MODEL.md §10). " +
  "Metric 18 attributes abstentions to quarantined text; the attribution is " +
  "REPORTED by the party that read the text, never derived by the scorer.";

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

const CLI_NO_NETWORK_MSG =
  "apps/cli reaches no network. DECISION_BRIEF.md §C T0-11 requires the full " +
  "pipeline to run from a clean checkout with no API key, and §L.1 rule 10 " +
  "makes every acceptance test pass under --llm=offline. This package SELECTS " +
  "the provider, so a transport reachable here would put a live call one " +
  "configuration mistake from the demo path. The two metered providers are §H " +
  "tier H2 and live in packages/llm, never here.";

const AGENT_FS_DOOR_MSG =
  "apps/cli/src/agents/** may not import the filesystem door (spec 1.4.29, " +
  "register row DATA_MODEL.md §22.2 M47/G8). An agent receives DATA -- " +
  "packages/eval's AgentInput carries only `observations` and `config`, no " +
  "path and no reader -- so it has nothing to read WITH, and this rule keeps " +
  "that a property rather than a convention. fs/guard.ts states why location " +
  "alone is not enough: 'the zone is an argument at the call site', so a module " +
  "is not zone-restricted by sitting in the composition root, and a call site " +
  "here could otherwise declare GENERATOR_TRUST and reach ground truth. " +
  "PREREGISTRATION.md §6.2 AL1/AL2/AL4 and EVALUATION_SPEC.md §2's 'No agent " +
  "ever sees ground truth or oracle labels' are what this protects. The runner " +
  "reads the dataset and passes the values in.";

const CLI_FS_DOOR_MSG =
  "apps/cli performs all filesystem I/O (ARCHITECTURE.md §3) and performs it " +
  "in ONE place: src/fs/. PREREGISTRATION.md §6.2's AL2/AL8 runtime path guard " +
  "runs in src/fs/io.ts before every read, and a second door would make it a " +
  "guard nobody passes through. Route the read through readText/readLines with " +
  "the ReadZone the bytes are for.";

/** Transports, as bare specifiers and as `node:`-prefixed patterns. */
const CLI_NETWORK_PATHS = [
  "http", "https", "net", "tls", "dgram", "http2", "undici", "node-fetch", "axios",
];
const CLI_NETWORK_PATTERNS = [
  "node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:http2",
];
const CLI_NETWORK_DYNAMIC = ["http", "https", "net", "tls", "dgram", "http2"];

/** The filesystem door's own modules — legal in src/fs/, nowhere else in src/. */
const CLI_FS_PATHS = ["fs", "path", "crypto", "os", "child_process"];
const CLI_FS_PATTERNS = [
  "node:fs", "node:fs/promises", "node:path", "node:crypto", "node:os", "node:child_process",
];

/**
 * The door itself, as an agent under `apps/cli/src/agents/` would spell it.
 *
 * Deliberately narrow: exactly `src/fs/`, reached relatively from one directory
 * down or by workspace path. It is not a ban on all relative imports — an agent
 * composes `../providers.js` and `../probe/` by design — and over-broadening it
 * would make the rule a style preference rather than the one boundary it states.
 */
const AGENT_FS_DOOR = ["../fs", "../fs/*", "**/apps/cli/src/fs", "**/apps/cli/src/fs/*"];

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

  // --- AL8 + AL2 · engine and oracle read no protected artifact ------------
  //
  // PREREGISTRATION.md §6.2 AL2: "Neither engine nor oracle code may read a file
  // matching **/ground_truth*.jsonl. Enforced by a runtime path guard that
  // throws." AL8, added at spec 1.4.22: "Neither engine nor oracle code may read
  // a file matching **/recon_report*.jsonl. Enforced by the same runtime path
  // guard as AL2 AND BY AN ESLINT RULE."
  //
  // This block is that ESLint rule, and it is stronger than a path check. Both
  // packages are pure by declaration — ARCHITECTURE.md §3 gives packages/engine
  // "no I/O, no network" and apps/cli all filesystem I/O — so the enforceable
  // property is not "does not read THOSE paths" but "cannot read ANY path".
  // Banning the transports outright makes AL2's and AL8's guards vacuous by
  // construction, which is the same argument packages/probe's block makes for
  // §T7's SSRF control and which packages/oracle's own README already claims:
  // "there is nothing here for such a guard to intercept, which is stronger
  // than passing one."
  //
  // The recon report is reachable ONLY through RECONCILIATION_SPEC.md §6.2's
  // probe under P_max, and the engine legitimately RECEIVES probe results as
  // values (s4-solve.ts's `recon_reports` input). Nothing here touches that: a
  // value passed in is not a read, and the ban is on the transport.
  //
  // Scoped to `src/`, not the package, for the reason packages/probe's block
  // states: the suites that ASSERT purity read their own package's source as
  // text, which is filesystem I/O.
  {
    files: ["packages/engine/src/**", "packages/oracle/src/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "fs", "path", "http", "https", "net", "tls", "dgram", "http2",
            "child_process", "undici", "node-fetch", "axios",
          ].map((mod) => ({
            name: mod,
            message: PROTECTED_ARTIFACT_MSG,
          })),
          patterns: [
            {
              group: [
                "node:fs", "node:fs/promises", "node:path", "node:http", "node:https",
                "node:net", "node:tls", "node:dgram", "node:http2", "node:child_process",
              ],
              message: PROTECTED_ARTIFACT_MSG,
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...["fs", "http", "https", "net", "tls", "child_process"].map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, PROTECTED_ARTIFACT_MSG),
        ),
      ],
    },
  },

  // --- packages/eval · the measurement layer's import discipline -----------
  //
  // §L.1 rule 3 names packages/eval/src/gates/consistency-gate.ts as "the single
  // permitted exception" to the engine <-> oracle bans, "which must import both
  // engine and oracle to compare them; it is allowlisted BY PATH in the lint
  // config and may contain no logic other than the differential test". The
  // deferral note this block replaces scheduled it for Phase 10, which is now.
  //
  // The allowlist needs two halves, and this is the first: a general ban, so
  // that there is something for the exception to be an exception TO. Without it
  // the "single permitted file" would be single by convention.
  //
  // What is banned, and why each ban is load-bearing:
  //
  //   @assay/engine  — ARCHITECTURE.md §10 has every agent behind ONE interface
  //                    "so ablations are configuration flags rather than forked
  //                    codebases -- which is what makes them valid controls".
  //                    A scorer that could orchestrate stages would be a second
  //                    agent, and its ablations would not be controls.
  //   @assay/llm     — same argument, and §4.11's offline_parity measures the
  //                    model's contribution. A measurement layer holding LLM
  //                    policy would be measuring itself.
  //   @assay/probe   — RECONCILIATION_SPEC.md §6.2's channel is the AGENT's,
  //                    under P_max. §4.13 has eval read back the probe COUNT,
  //                    which arrives on the run rather than from the loop.
  //   untrusted_text — DATA_MODEL.md §10. Metric 18 attributes abstentions to
  //                    quarantined text; the attribution is reported by the
  //                    party that read the text, never derived by the scorer.
  //
  // packages/generator is deliberately NOT banned. AL1 binds the engine and the
  // oracle; EVALUATION_SPEC.md §4.2 scores agent edges "against ground truth"
  // and §4.4 projects proj_truth from true_journal. A scorer that could not see
  // the answer key could not mark the paper. packages/eval/src/truth.ts confines
  // the import to one module and tests/discipline.test.ts counts it.
  {
    files: ["packages/eval/**"],
    linterOptions: {
      // §L.1 rule 3 is among "the invariants that may never be violated", and a
      // boundary a one-line `eslint-disable` can lift is not enforced. The same
      // reason the engine and oracle blocks above refuse inline configuration.
      noInlineConfig: true,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ENGINE, message: EVAL_ENGINE_MSG },
            { group: LLM, message: EVAL_LLM_MSG },
            { group: PROBE, message: EVAL_PROBE_MSG },
            { group: UNTRUSTED_TEXT, message: EVAL_UNTRUSTED_TEXT_MSG },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        dynamicImportBan("/engine/", EVAL_ENGINE_MSG),
        dynamicImportBan("/llm/", EVAL_LLM_MSG),
        dynamicImportBan("/probe/", EVAL_PROBE_MSG),
        dynamicImportBan("/untrusted-text/", EVAL_UNTRUSTED_TEXT_MSG),
      ],
    },
  },

  // --- §L.1 rule 3's allowlist · the single permitted exception ------------
  //
  // "The single permitted exception is packages/eval/src/gates/
  // consistency-gate.ts, which must import both engine and oracle to compare
  // them; it is allowlisted by path in the lint config and may contain no logic
  // other than the differential test."
  //
  // This is the second half. It is a CONFIG-LEVEL override rather than a
  // file-level `eslint-disable`, because the block above sets noInlineConfig and
  // an allowlist a file grants itself is not an allowlist. Flat config applies
  // objects in order and the last matching one wins per rule, so this block
  // restates `no-restricted-imports` and `no-restricted-syntax` for exactly one
  // path — WITHOUT the ENGINE group and WITH everything else intact. @assay/llm,
  // @assay/probe and untrusted_text stay banned here: rule 3's exception is
  // about engine and oracle, and widening it to the rest would grant the
  // differential test permissions the differential test does not need.
  //
  // packages/oracle needs no entry: nothing bars packages/eval from importing
  // it. §L.2 builds `oracle` before `eval`, and the metric modules legitimately
  // read the oracle's labels (§4.3). What rule 3 forbids is the ENGINE reaching
  // the oracle and the oracle reaching the ENGINE; this file is where the two
  // verdicts are placed side by side, and it is the only place they may be.
  {
    files: ["packages/eval/src/gates/consistency-gate.ts"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: LLM, message: EVAL_LLM_MSG },
            { group: PROBE, message: EVAL_PROBE_MSG },
            { group: UNTRUSTED_TEXT, message: EVAL_UNTRUSTED_TEXT_MSG },
            {
              group: GENERATOR,
              message:
                "packages/eval/src/gates/consistency-gate.ts may not import " +
                "packages/generator. §L.1 rule 3 permits this ONE file to import engine " +
                "and oracle and says it 'may contain no logic other than the " +
                "differential test'. Ground truth is not part of that test: §5.3's " +
                "consistency gate compares two IMPLEMENTATIONS, and §5.3's " +
                "COMPLETENESS gate is the one that reads truth. Ground truth reaches " +
                "packages/eval through src/truth.ts only.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        dynamicImportBan("/llm/", EVAL_LLM_MSG),
        dynamicImportBan("/probe/", EVAL_PROBE_MSG),
        dynamicImportBan("/untrusted-text/", EVAL_UNTRUSTED_TEXT_MSG),
        dynamicImportBan("/generator/", GENERATOR_MSG),
      ],
    },
  },

  // --- apps/cli · no network, ever -----------------------------------------
  //
  // DECISION_BRIEF.md §C T0-11: "Full pipeline runs from a clean checkout with
  // no API key", and §L.1 rule 10 makes every acceptance test pass under
  // --llm=offline. This package is where the provider is SELECTED
  // (ARCHITECTURE.md §6.5), which is exactly why the transport is banned here
  // rather than trusted here: selection code that could also open a socket puts
  // a live call one configuration mistake away from the demo path.
  //
  // Scoped to the whole package, tests included, because the guarantee is about
  // the binary a reviewer runs, not about one directory. Verified clean at the
  // time of writing: no import of a transport exists anywhere under apps/cli.
  {
    files: ["apps/cli/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: CLI_NETWORK_PATHS.map((mod) => ({
            name: mod,
            message: CLI_NO_NETWORK_MSG,
          })),
          patterns: [{ group: CLI_NETWORK_PATTERNS, message: CLI_NO_NETWORK_MSG }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...CLI_NETWORK_DYNAMIC.map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, CLI_NO_NETWORK_MSG),
        ),
      ],
    },
  },

  // --- apps/cli · one filesystem door --------------------------------------
  //
  // ARCHITECTURE.md §3 gives apps/cli "all filesystem I/O". PREREGISTRATION.md
  // §6.2's AL2/AL8 runtime path guard is what makes that permission safe, and
  // it runs in src/fs/io.ts before every read — so a second door would make it
  // a guard nobody passes through.
  //
  // Scoped to src/ and excluding src/fs/, for the reason packages/probe's and
  // packages/engine's blocks already state: the suite that ASSERTS the property
  // has to read the package's own source, which is filesystem I/O. Tests are
  // therefore outside this block and keep their node:fs access.
  //
  // The network paths are REPEATED here rather than inherited. Flat config
  // applies objects in order and the last matching one WINS PER RULE — it does
  // not merge — so for files matching both blocks this object's
  // `no-restricted-imports` replaces the one above. Dropping the transports
  // here would silently reopen them under src/.
  {
    files: ["apps/cli/src/**"],
    ignores: ["apps/cli/src/fs/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...CLI_FS_PATHS.map((mod) => ({ name: mod, message: CLI_FS_DOOR_MSG })),
            ...CLI_NETWORK_PATHS.map((mod) => ({ name: mod, message: CLI_NO_NETWORK_MSG })),
          ],
          patterns: [
            { group: CLI_FS_PATTERNS, message: CLI_FS_DOOR_MSG },
            { group: CLI_NETWORK_PATTERNS, message: CLI_NO_NETWORK_MSG },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        ...CLI_FS_PATHS.map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, CLI_FS_DOOR_MSG),
        ),
        ...CLI_NETWORK_DYNAMIC.map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, CLI_NO_NETWORK_MSG),
        ),
      ],
    },
  },

  // --- apps/cli/src/agents · G8, the filesystem door -----------------------
  //
  // Spec 1.4.29, register row DATA_MODEL.md §22.2 M47. The agents moved here
  // from packages/eval, where an import ban had kept them away from the data
  // they measure against; inside the composition root that ban no longer
  // applies, because apps/cli legitimately holds every unlock.
  //
  // Four protections already hold, and this closes the residual:
  //   1. no node:fs outside src/fs/ (the block above);
  //   2. every read declares a ReadZone, and AGENT refuses ground_truth*.jsonl
  //      and recon_report*.jsonl;
  //   3. AgentInput carries only `observations` and `config`, so an agent has
  //      no path and no reader to read with;
  //   4. AL1 binds packages/engine and packages/oracle BY NAME, and neither
  //      package moves.
  // The residual is fs/guard.ts's own disclosure -- "the zone is an argument at
  // the call site" -- so a module here could declare GENERATOR_TRUST and reach
  // ground truth. A path-scoped ban is the mechanism §L.1 rules 3 and 4 already
  // use, and it is scoped to the door alone rather than to relative imports
  // generally: an agent composes ../providers.js and ../probe/ by design.
  //
  // The fs and network paths are REPEATED, not inherited. Flat config applies
  // objects in order and the last matching one WINS PER RULE -- it does not
  // merge -- so dropping them here would silently reopen them under src/agents/.
  {
    files: ["apps/cli/src/agents/**"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...CLI_FS_PATHS.map((mod) => ({ name: mod, message: CLI_FS_DOOR_MSG })),
            ...CLI_NETWORK_PATHS.map((mod) => ({ name: mod, message: CLI_NO_NETWORK_MSG })),
          ],
          patterns: [
            { group: AGENT_FS_DOOR, message: AGENT_FS_DOOR_MSG },
            { group: CLI_FS_PATTERNS, message: CLI_FS_DOOR_MSG },
            { group: CLI_NETWORK_PATTERNS, message: CLI_NO_NETWORK_MSG },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        dynamicImportBan("/\\/fs\\//", AGENT_FS_DOOR_MSG),
        ...CLI_FS_PATHS.map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, CLI_FS_DOOR_MSG),
        ),
        ...CLI_NETWORK_DYNAMIC.map((mod) =>
          dynamicImportBan(`/^(node:)?${mod}$/`, CLI_NO_NETWORK_MSG),
        ),
      ],
    },
  },
);
