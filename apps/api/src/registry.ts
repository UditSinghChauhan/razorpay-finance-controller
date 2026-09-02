import {
  loadObservations,
  runAssayComposedFull,
  type AssayRunResult,
  type DecisionEvidence,
} from "@assay/cli";
import type { LedgerEvent } from "@assay/ledger";

import { observationsPathFor, type DemoDatasetId } from "./datasets.js";

/**
 * The in-process run store — a `Map`, deliberately.
 *
 * `ARCHITECTURE.md §8` names the eventual store *"SQLite, single file, WAL
 * mode, via `better-sqlite3`"*, which is in no manifest in this workspace and is
 * not built here. This is the presentation prototype's registry and says so:
 * it holds runs for the life of the process and persists nothing.
 *
 * **Nothing is recomputed on read.** The run is executed once, on `POST /runs`,
 * and every later request reads the {@link AssayRunResult} that execution
 * returned. A registry that re-ran the pipeline per request would make two
 * requests two runs, and `GET /runs/:id/decisions/:decision_id` would be
 * answering about a different chain from the one `GET /runs/:id/close` reported.
 */

/** One executed run, with the two indexes the read endpoints need. */
export interface StoredRun {
  /**
   * `DATA_MODEL.md §16`'s run identifier, minted by the engine from
   * `(dataset_hash, config_hash)`.
   *
   * **Content-addressed, so it is stable across executions.** Two `POST /runs`
   * over the same dataset in the same mode produce the same id and the same
   * chain — which is `I9`/metric 23's determinism, visible in the API rather
   * than asserted about it. The registry therefore replaces an entry with an
   * identical one rather than accumulating duplicates.
   */
  readonly run_id: string;
  readonly dataset: DemoDatasetId;
  readonly agent_id: string;
  readonly llm_provider: (typeof OFFLINE)["llm_mode"];
  readonly observation_count: number;
  /** Exactly what `runAssayComposedFull` returned. Never edited, never rebuilt. */
  readonly result: AssayRunResult;
  readonly decisionsById: ReadonlyMap<string, DecisionEvidence>;
  readonly eventsById: ReadonlyMap<string, LedgerEvent>;
}

/**
 * `PROJECT_SPEC.md §10`'s demo path: *"runnable with `--llm=offline` so it
 * cannot fail on a network"*.
 *
 * `EVALUATION_SPEC.md §2` reserves `replay` for **scored** runs and this API
 * scores nothing, so `offline` is not merely the default here — it is the only
 * mode the type admits.
 */
const OFFLINE = Object.freeze({
  llm_mode: "offline",
  strict_replay: false,
  // `RunConfig` requires one of three splits and a demo fixture belongs to none.
  // `train` is the split `EVALUATION_SPEC.md §2` never scores, so it is the only
  // value that cannot be mistaken for a scored unit. Nothing reads it.
  split: "train",
  seed: 0,
} as const);

// Spelled structurally rather than annotated `RunConfig`: `packages/eval` owns
// that type and it is the MEASUREMENT layer. This package scores nothing, so it
// declares no dependency on the scorer — the literal above satisfies
// `runAssayComposedFull`'s parameter by shape, and the compiler checks it at the
// call below exactly as an annotation would.

/** How a run is executed. Injectable so a test can supply a fixture root. */
export interface RegistryOptions {
  readonly datasetRoot?: string | undefined;
}

export class RunRegistry {
  readonly #runs = new Map<string, StoredRun>();
  readonly #datasetRoot: string | undefined;

  constructor(options: RegistryOptions = {}) {
    this.#datasetRoot = options.datasetRoot;
  }

  /**
   * Execute one allowlisted dataset through the existing ASSAY composition.
   *
   * This function is the whole adapter: it resolves a name to a path, hands the
   * path to `@assay/cli`'s guarded reader, and hands the observations to
   * `@assay/cli`'s composed run. It evaluates no constraint, ranks no candidate,
   * mints no decision and reads no threshold — `apps/api` holds no
   * reconciliation logic of any kind, which is what `ARCHITECTURE.md §3`'s
   * *"thin HTTP over engine + ledger"* means.
   */
  async create(dataset: DemoDatasetId): Promise<StoredRun> {
    const observations = loadObservations(
      observationsPathFor(dataset, this.#datasetRoot),
    );
    const result = await runAssayComposedFull(
      { observations, config: OFFLINE },
      { agentId: "ASSAY" },
    );

    const stored: StoredRun = {
      run_id: result.evidence.chain.run_id,
      dataset,
      agent_id: result.run.agent_id,
      llm_provider: OFFLINE.llm_mode,
      observation_count: observations.length,
      result,
      decisionsById: new Map(result.evidence.decisions.map((d) => [d.decision_id as string, d])),
      eventsById: new Map(result.evidence.chain.events.map((e) => [e.evt_id as string, e])),
    };
    this.#runs.set(stored.run_id, stored);
    return stored;
  }

  get(runId: string): StoredRun | undefined {
    return this.#runs.get(runId);
  }
}
