/**
 * `@assay/cli` — the ASSAY command line.
 *
 * `ARCHITECTURE.md §3`: *"`assay generate / oracle / run / bench / close /
 * verify / seal / report`; **all filesystem I/O — it acquires raw source
 * contents and passes them into `packages/domain`'s `S0` boundary, and performs
 * no `S0` transform itself (spec 1.4.18)**. The CLI is the real interface; the UI is a
 * view over it. Everything demonstrable must be scriptable."*
 *
 * This package is a **composition root**. It contains no reconciliation logic:
 * no `S0` transform, no `S1`-`S5` stage, no close gate, and **no `R3` policy** —
 * `PREREGISTRATION.md §7`'s frozen list lives in `packages/llm`. What it contains
 * is the read, the write, the argument surface, the provider selection, the
 * `§6.2` dispatch and, from spec 1.4.25, the `§6.6` composition that joins them
 * (`src/probe/`). The loop's decisions are `packages/probe`'s; this package
 * sequences the calls and performs the one read.
 *
 * **From spec 1.4.29 (`DATA_MODEL.md §22.2` M47) it also holds the seven agent
 * implementations**, at `src/agents/`. That is not reconciliation logic moving
 * here: an agent is a *composition* of `engine`, `llm`, `probe` and `ledger`
 * behind `@assay/eval`'s one interface, and `packages/eval` refuses all three
 * imports because M37 already ruled that hosting the run loop there would put
 * the system under test inside the thing measuring it. The agents are
 * constructed here and **injected** into `packages/eval`, which imports nothing
 * new. `src/agents/**` may not reach `src/fs/` at all.
 *
 * The surface below exists for `tests/`; the binary is `src/main.ts`.
 */

export { dispatch, type CliInvocation } from "./cli.js";
export {
  ALL, parseArgs, boolFlag, stringFlag, requireFlag, parseSeedList, requireSeeds,
  type FlagSpec, type FlagSpecs, type ParsedArgs,
} from "./args.js";
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
export {
  datasetGroundTruth, loadGroundTruth, readGroundTruthRecord,
} from "./artifacts/ground-truth.js";
export {
  V30_NON_ADDITIVITY,
  encodeMetrics,
  type BaseMetrics,
  type RobustnessMetrics,
  type ScoredMetrics,
} from "./artifacts/metrics.js";
export {
  AL5_GROUND_TRUTH_WITHHELD,
  EMPTY_INJECTED_POPULATION,
  EXERCISED_SPLIT,
  isExercisedSplit,
  notExercised,
  notExercisedOnSplit,
  overDataset,
  scoreRobustness,
  type RobustnessDataset,
  type RobustnessSource,
} from "./bench/scorer.js";
export { loadLedgerEvents } from "./artifacts/ledger-events.js";
export { loadReplayCache, ReplayCacheError } from "./artifacts/replay-cache.js";
export {
  METRICS_FILE, REPORT_PATH, RUNS_ROOT, metricsPath, runRoot,
} from "./artifacts/metrics-path.js";
export { buildProvider, ProviderRefusedError, DEFAULT_REPLAY_CACHE_DIR } from "./providers.js";
export {
  DISPATCHABLE_PROBE_KINDS,
  ProbeSourceUnavailableError,
  dispatchProbe,
  isDispatchable,
  type ProbeDispatchOptions,
} from "./probe/surface.js";
export {
  R3_CONTEXT_KINDS,
  buildAvailableProbes,
  runProbeLoop,
  type AvailableProbeContext,
  type BuildContextOptions,
  type ProbeEventDraft,
  type ProbeRunInput,
  type ProbeRunResult,
  type ProbeRunStop,
} from "./probe/run.js";
export { COMMANDS, T0_11_COMMANDS, findCommand, flagsFor, type Command, type CommandContext } from "./commands/index.js";
export {
  ALL_AGENTS, TIER0_AGENTS, agentById, isAgentId, readAgentId, selectAgents,
} from "./agents/index.js";
export { AgentUnavailableError } from "./errors.js";
export { SEAL_TAG, checkSealTag } from "./seal-tag.js";
export { usage, versionLine } from "./usage.js";
