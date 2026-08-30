import { LLM_PROVIDER_IDS, type LlmProviderId } from "@assay/ledger";

import { boolFlag, stringFlag, type FlagSpecs, type ParsedArgs } from "./args.js";
import { UsageError } from "./errors.js";

/**
 * The configuration surface, exactly as `.env.example` at the repository root
 * declares it, plus the two flags the specification names by name.
 *
 * ```
 *   ASSAY_LLM_PROVIDER   offline | replay | anthropic | openai-compatible
 *   ASSAY_LLM_MODEL_ID   "rules-v1" for offline
 *   ASSAY_STRICT_REPLAY  DECISION_BRIEF.md §L.1 rule 11
 *   ASSAY_DB_PATH        ARCHITECTURE.md §8's single-file SQLite database
 *
 *   --llm=<id>           ARCHITECTURE.md §6.5: "all interchangeable at runtime"
 *   --strict-replay      §L.1 rule 11
 *   --sealed             PREREGISTRATION.md §6.2 AL5
 * ```
 *
 * **No `.env` file is parsed here.** `.env.example` says *"copy to `.env`"*, and
 * Node 22 loads one with `--env-file`; adding a parser would put a second
 * configuration format inside the package whose whole filesystem story is one
 * guarded read path. The environment is read from `process.env` and nothing
 * else.
 *
 * **The default provider is `offline` and the default for `strict_replay` is
 * `true`.** Both defaults are the frozen direction: `§L.1` rule 10 makes the
 * full pipeline pass under `--llm=offline`, and rule 11 makes a replay cache
 * miss a hard error. A default that had to be switched on to be safe would be a
 * default that is off in the run nobody checked.
 */

export interface CliConfig {
  readonly llmProvider: LlmProviderId;
  readonly llmModelId: string;
  /** `§L.1` rule 11. A cache miss is a hard error. */
  readonly strictReplay: boolean;
  /** `ARCHITECTURE.md §8`'s database path. Recorded; see `commands/run.ts`. */
  readonly dbPath: string;
  /** `AL5`: refuses to print, log or write any ground-truth field. */
  readonly sealed: boolean;
}

/** The flags every command accepts. Command-specific flags are added to these. */
export const GLOBAL_FLAGS: FlagSpecs = Object.freeze({
  llm: { kind: "string", describe: "Provider id: offline | replay (ARCHITECTURE.md §6.5)." },
  "llm-model": { kind: "string", describe: "Model id recorded on the run (§19 cache_key)." },
  "strict-replay": { kind: "boolean", describe: "A replay cache miss is a hard error (§L.1 r11)." },
  "no-strict-replay": { kind: "boolean", describe: "Explicitly relax §L.1 rule 11. Never for a scored run." },
  sealed: { kind: "boolean", describe: "AL5: emit only aggregate metrics; refuse ground truth." },
  help: { kind: "boolean", describe: "Print usage and exit." },
  version: { kind: "boolean", describe: "Print the spec and benchmark versions and exit." },
});

function readProviderId(raw: string): LlmProviderId {
  const found = LLM_PROVIDER_IDS.find((id) => id === raw);
  if (found === undefined) {
    throw new UsageError(
      `unknown LLM provider ${JSON.stringify(raw)}. ARCHITECTURE.md §6.5 declares exactly ` +
        `four: ${LLM_PROVIDER_IDS.join(", ")}.`,
    );
  }
  return found;
}

/**
 * Resolve configuration from flags over environment over defaults.
 *
 * `env` is a parameter rather than a direct `process.env` read so the resolution
 * order is testable without mutating the process — the same reason
 * `packages/probe` takes a proposal as a value instead of calling `R3`.
 */
export function resolveConfig(
  parsed: ParsedArgs,
  env: Readonly<Partial<Record<string, string>>>,
): CliConfig {
  const flagProvider = stringFlag(parsed, "llm");
  const envProvider = env["ASSAY_LLM_PROVIDER"];
  const llmProvider = readProviderId(flagProvider ?? envProvider ?? "offline");

  const strict = boolFlag(parsed, "strict-replay");
  const relaxed = boolFlag(parsed, "no-strict-replay");
  if (strict && relaxed) {
    throw new UsageError(
      "--strict-replay and --no-strict-replay are contradictory. DECISION_BRIEF.md §L.1 " +
        "rule 11 admits exactly one answer for a scored run.",
    );
  }
  const envStrict = env["ASSAY_STRICT_REPLAY"];
  const strictReplay = strict ? true : relaxed ? false : envStrict !== "false";

  return Object.freeze({
    llmProvider,
    llmModelId: stringFlag(parsed, "llm-model") ?? env["ASSAY_LLM_MODEL_ID"] ?? "rules-v1",
    strictReplay,
    dbPath: env["ASSAY_DB_PATH"] ?? "./runs/assay.sqlite",
    sealed: boolFlag(parsed, "sealed"),
  });
}
