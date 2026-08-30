import { projectLedger, verifyChain, computeGenesisHash } from "@assay/ledger";
import { sha256Field } from "@assay/domain";

import { requireFlag, stringFlag } from "../args.js";
import { CliError, EXIT, UnavailableStageError } from "../errors.js";
import { join, readText } from "../fs/io.js";
import { loadLedgerEvents } from "../artifacts/ledger-events.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay verify` — `ARCHITECTURE.md §9`'s `GET /runs/:id/ledger/verify`, at the
 * command line.
 *
 * > *"Recomputes the hash chain from genesis, re-projects balances, re-checks
 * > the Suspense identity. Returns pass/fail per check."* — `§9`
 *
 * > *"`/ledger/verify` exists so a reviewer can check tamper-evidence live
 * > rather than be told about it."* — `§9`
 *
 * **Two of the three checks are implemented and the third is not.**
 *
 * ```
 *   G4  hash chain recomputes from genesis and matches the stored root hash
 *         -> packages/ledger's verifyChain. IMPLEMENTED.
 *   G2  trial balance, recomputed from the event log
 *         -> packages/ledger's projectLedger. IMPLEMENTED.
 *   G3  the Suspense identity, gross per item
 *         -> RECONCILIATION_SPEC.md §10.1. It reads Decision and Exception
 *            records against journal lines, and DECISION_BRIEF.md §L.2 puts
 *            close-gate.ts in packages/ledger Layer B, which that package's own
 *            header calls "deliberately absent rather than stubbed". NOT
 *            implemented here: computing it in apps/cli would relocate a gate
 *            the specification has already assigned.
 * ```
 *
 * **The run directory is read as files, not as `ARCHITECTURE.md §8`'s SQLite.**
 * `§8` puts the event log in `runs/<run_id>/assay.sqlite` through
 * `better-sqlite3`, which is not a workspace dependency. `packages/ledger`'s
 * `sealStoredEvent` is documented for an event *"read back from storage, a
 * file, or an API response"*, so a `.jsonl` export verifies exactly as a
 * database row would; `--events` names it. Without one, the command reports the
 * persistence layer as the blocker rather than inventing a reader.
 */

const RUN_MANIFEST = "manifest.json";
const ROOT_HASH_FILE = "ledger_root_hash.txt";

/** Raised when a check fails. `verify` answers a question; a `no` is an exit code. */
export class VerificationFailed extends CliError {
  constructor(message: string) {
    super(message, EXIT.FAILURE);
    this.name = "VerificationFailed";
  }
}

/**
 * The three genesis inputs, as `ARCHITECTURE.md §8` and `DATA_MODEL.md §16`
 * name them.
 *
 * `§8`: *"A run is fully described by `(dataset_hash, engine_commit,
 * config_hash, llm_provider, llm_cache_hash)`. Of these, the genesis hash binds
 * only `(dataset_hash, engine_commit, config_hash)`."* The other two are
 * recorded on `Run` and are not read here, because `computeGenesisHash` throws
 * on any field beyond its three.
 */
interface RunManifestGenesis {
  readonly dataset_hash: string;
  readonly engine_commit: string;
  readonly config_hash: string;
}

function readGenesisInputs(text: string, path: string): RunManifestGenesis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new VerificationFailed(
      `${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new VerificationFailed(`${path} does not hold a run manifest object.`);
  }
  const record = parsed as Record<string, unknown>;
  const engineCommit = record["engine_commit"];
  if (typeof engineCommit !== "string" || engineCommit === "") {
    throw new VerificationFailed(`${path}: engine_commit is missing (ARCHITECTURE.md §8).`);
  }
  return {
    // `sha256Field` is packages/domain's, so the digest spelling is asserted by
    // the package that declares the contract rather than re-tested here.
    dataset_hash: sha256Field.parse(record["dataset_hash"]),
    config_hash: sha256Field.parse(record["config_hash"]),
    engine_commit: engineCommit,
  };
}

async function run(context: CommandContext): Promise<void> {
  const runDir = requireFlag(context.args, "run");
  const eventsFlag = stringFlag(context.args, "events");

  if (eventsFlag === null) {
    throw new UnavailableStageError(
      "verify",
      "the persistence layer",
      "ARCHITECTURE.md §8",
      `§8 stores a run's Layer A events in runs/<run_id>/assay.sqlite via better-sqlite3, ` +
        `which is not a workspace dependency, so there is no reader for it. Point --events at ` +
        `a JSON-lines export of the event log; packages/ledger's sealStoredEvent admits an ` +
        `event "read back from storage, a file, or an API response".`,
    );
  }

  const manifestPath = join(runDir, RUN_MANIFEST);
  const genesisInputs = readGenesisInputs(
    readText({ path: manifestPath, zone: "AGENT" }),
    manifestPath,
  );
  const genesisHash = computeGenesisHash({
    dataset_hash: sha256Field.parse(genesisInputs.dataset_hash),
    engine_commit: genesisInputs.engine_commit,
    config_hash: sha256Field.parse(genesisInputs.config_hash),
  });

  const events = loadLedgerEvents(eventsFlag);

  // The stored root hash is a separate artifact precisely so that G4 compares
  // two independently written records: "hash chain recomputes from genesis and
  // MATCHES THE STORED ROOT HASH" (§10.1). Recomputing and then trusting the
  // recomputation would check nothing.
  const storedRoot = sha256Field.parse(
    readText({ path: join(runDir, ROOT_HASH_FILE), zone: "AGENT" }).trim(),
  );

  const chain = verifyChain(genesisHash, events, storedRoot);
  const projection = projectLedger(events);

  context.out(`genesis_hash        ${genesisHash}`);
  context.out(`recomputed_root     ${chain.root_hash}`);
  context.out(`stored_root         ${storedRoot}`);
  context.out(`event_count         ${String(chain.event_count)}`);
  context.out(`G4 hash chain       ${chain.ok ? "PASS" : "FAIL"}`);
  context.out(`G2 trial balance    ${projection.trialBalanceOk ? "PASS" : "FAIL"}`);
  context.out(
    `G3 Suspense identity  NOT CHECKED — packages/ledger close-gate.ts is absent ` +
      `(DECISION_BRIEF.md §L.2; RECONCILIATION_SPEC.md §10.1)`,
  );
  for (const failure of chain.failures) {
    context.out(`  ${failure.check} at seq ${String(failure.seq)}: ${failure.detail}`);
  }

  if (!chain.ok || !projection.trialBalanceOk) {
    throw new VerificationFailed(
      `assay verify: ${chain.ok ? "" : "G4 failed. "}${projection.trialBalanceOk ? "" : "G2 failed. "}` +
        `RECONCILIATION_SPEC.md §10.1: a G4 failure means the audit trail was altered; a G2 ` +
        `failure means the ledger is incoherent.`,
    );
  }
}

export const verifyCommand: Command = {
  name: "verify",
  summary: "Recompute the hash chain from genesis and re-project balances (G4, G2).",
  flags: {
    run: { kind: "string", describe: "The runs/<run_id> directory to verify." },
    events: { kind: "string", describe: "JSON-lines export of the Layer A event log." },
  },
  run,
};
