/**
 * `@assay/cli` — the ASSAY command line.
 *
 * `ARCHITECTURE.md §3`: *"`assay generate / oracle / run / bench / close /
 * verify / seal`; **all filesystem I/O — it acquires raw source contents and
 * passes them into `packages/domain`'s `S0` boundary, and performs no `S0`
 * transform itself (spec 1.4.18)**. The CLI is the real interface; the UI is a
 * view over it. Everything demonstrable must be scriptable."*
 *
 * This package is a **composition root**. It contains no reconciliation logic:
 * no `S0` transform, no `S1`-`S5` stage, no probe loop, no close gate, no
 * `R3` policy. What it contains is the read, the write, the argument surface,
 * the provider selection and the dispatch.
 *
 * The surface below exists for `tests/`; the binary is `src/main.ts`.
 */

export { dispatch, type CliInvocation } from "./cli.js";
export { parseArgs, boolFlag, stringFlag, requireFlag, type FlagSpec, type FlagSpecs, type ParsedArgs } from "./args.js";
export { GLOBAL_FLAGS, resolveConfig, type CliConfig } from "./config.js";
export { CliError, UsageError, UnavailableStageError, EXIT, type ExitCode } from "./errors.js";
export {
  PathGuardError,
  RESTRICTED_ARTIFACTS,
  assertReadable,
  isRestricted,
  type GuardPolicy,
  type ReadZone,
} from "./fs/guard.js";
export {
  SourceReadError,
  diskSink,
  memorySink,
  readLines,
  readText,
  type MemorySink,
  type ReadRequest,
  type WriteSink,
} from "./fs/io.js";
export { sha256Text } from "./fs/digest.js";
export { decodeJsonl, encodeJsonl, RecordRejectedError, type Decoder } from "./artifacts/jsonl.js";
export { loadObservations } from "./artifacts/observations.js";
export { loadLedgerEvents } from "./artifacts/ledger-events.js";
export { loadReplayCache, ReplayCacheError } from "./artifacts/replay-cache.js";
export { buildProvider, ProviderRefusedError, DEFAULT_REPLAY_CACHE_DIR } from "./providers.js";
export { COMMANDS, T0_11_COMMANDS, findCommand, flagsFor, type Command, type CommandContext } from "./commands/index.js";
export { usage, versionLine } from "./usage.js";
