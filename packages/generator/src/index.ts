/**
 * `@assay/generator` — the forward business simulation, its ground truth, and
 * the declared degradation layer.
 *
 * `ARCHITECTURE.md §3`: "Must be independently runnable and seed-deterministic.
 * Kept out of the engine so no engine code can ever import ground truth — an
 * import lint enforces this." That lint (`PREREGISTRATION.md §6.2` `AL1`) was
 * written before this package existed, and bans both `packages/engine` and
 * `packages/oracle` from importing it.
 *
 * **This package writes no file.** `assay generate` belongs to `apps/cli`;
 * `PREREGISTRATION.md §9` sequences it after the seal tag and `§6.1` forbids
 * `--split test` before then.
 */

export {
  type FamilyId, type DegradationOp, FAMILY_IDS, IMPLEMENTED_FAMILIES,
  UNIMPLEMENTED_FAMILIES, HELD_OUT_FAMILIES, DEGRADATION_OPS,
  OPERATOR_DECLARING_FAMILY, PUBLISHED_TARGET_RECORD_COUNTS, BENCHMARK_VERSION,
  GT_VERSION, SPEC_VERSION, PERIOD, SPLIT_TABLE,
} from "./frozen.js";

export {
  type Convention, CONVENTIONS, UNRATIFIED, UNRATIFIED_COUNT,
} from "./conventions.js";

export {
  type Composition, COMPOSITION, TARGET_RECORD_COUNT, FAMILY_DELTA, compositionAt,
  datasetRecordCount, driverIsFeasible, evenSplit, feasibleDriverRange, realize,
} from "./composition.js";

export {
  DAY_COUNT, F03_RATE_CHANGE_AT, PERIOD_FROM, PERIOD_TO, SECONDS_PER_DAY,
  dayInstant, dayOf, dayStart, inPeriod, settlementInstant,
} from "./period.js";

export { Prng, STREAMS, substream, substreamKey } from "./prng.js";
export { Minter, mintUtr } from "./mint.js";
export { assertOrderRefsInjective, buildReceipt, receiptToOrderRef } from "./receipt.js";
export { type FamilyMechanics, FAMILY_MECHANICS } from "./families.js";

export {
  type SettlementIndex, type TrueState, NegativeSettlementError, settlementsByMember,
  simulate,
} from "./simulate.js";

export {
  type TrueJournalLine, buildTrueJournal, projectTrueBalances, trialBalance,
} from "./truth-journal.js";

export { type Emission, emit } from "./emit.js";
export { type DegradationRecord, type Degraded, degrade } from "./degrade.js";

/**
 * `RECONCILIATION_SPEC.md §6.2`'s PG-side recon report. `apps/cli` writes it to
 * `bench/<split>/recon_report.jsonl`; this package produces the rows and their
 * order, and performs no I/O.
 */
export { type ReconReportRow, buildReconReport } from "./recon-report.js";

export {
  type GeneratedFamily, type GenerateOptions, type GroundTruth, generateFamily,
} from "./generate.js";

export {
  type Burn, type SeedBlock, type Split, BurnRegister, DECLARED_SEEDS,
  SEED_BLOCKS, blockOf, familiesFor, isDeclaredSeed,
} from "./seeds.js";

export {
  type BenchmarkManifest, type BenchmarkScenario, type ManifestInputs,
  benchmarkScenarios, buildManifest,
} from "./manifest.js";
