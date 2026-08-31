import type { RunKey } from "@assay/eval";

import { UsageError } from "../errors.js";
import { join } from "../fs/io.js";

/**
 * Where a scored run's artifacts sit — `DECISION_BRIEF.md §K`, `EVALUATION_SPEC.md §7`.
 *
 * **Ratified at spec 1.4.29, register row `DATA_MODEL.md §22.2` M48.**
 *
 * ```
 *   runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
 *   runs/report.html
 * ```
 *
 * **`report.html` is given, not chosen.** `EVALUATION_SPEC.md §7`'s
 * reproducibility recipe writes `pnpm assay report --out runs/report.html`, so
 * this module transcribes a path the specification already spelled.
 *
 * **The `metrics.json` path is a convention, and is recorded as one** — the
 * treatment `artifacts/replay-cache.ts` established for `fixtures/llm-cache/`:
 * *"recorded here as a convention so that a later specification amendment naming
 * a different layout supersedes this file rather than contradicting a rule
 * nobody wrote."* No frozen document states a layout. What is derived rather
 * than invented is the **shape**: `DATA_MODEL.md §22.2` M42 nests the dataset
 * artifacts `<split>/<seed>/`, and a scored run adds exactly the two dimensions
 * `@assay/eval`'s `RunKey` adds — the agent and the llm-mode. The path is
 * therefore M42's nesting with M48's key appended, in the order M48 states it.
 *
 * **These are committed, and that is the point of M48.** `PROJECT_SPEC.md §7`
 * `S10`, `EVALUATION_SPEC.md §5.5` and `DECISION_BRIEF.md §C` T0-13 each require
 * every claimed number to be traceable to a **committed** run artifact, while
 * `§K` and `.gitignore` excluded `runs/` wholesale — so a conforming scored run
 * produced numbers `§5.5` forbids reporting. `*.sqlite` stays ignored: the
 * database is regenerable and is not an artifact any number is traced to.
 *
 * **This module writes nothing and reads nothing.** It builds strings.
 * `fs/io.ts` remains the one door, and `fs/guard.ts` still decides every read.
 */

/** `§K`'s run-artifact root. */
export const RUNS_ROOT = "runs";

/** The per-run file `DECISION_BRIEF.md §C` T0-9 names. */
export const METRICS_FILE = "metrics.json";

/** `EVALUATION_SPEC.md §7`'s own `--out` path, transcribed. */
export const REPORT_PATH = join(RUNS_ROOT, "report.html");

/**
 * A `run_id` that is one path segment and nothing else.
 *
 * Rejected rather than sanitised: a run id is an identifier a caller chose, and
 * quietly rewriting one would file a scored result under a name that is not the
 * name it was reported under. `§5.5`'s traceability rests on the two matching.
 */
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function checkRunId(runId: string): string {
  if (!RUN_ID.test(runId)) {
    throw new UsageError(
      `run id ${JSON.stringify(runId)} is not a single path segment of ASCII letters, ` +
        `digits, ".", "_" or "-" (1-64 characters). It is refused rather than rewritten: ` +
        `EVALUATION_SPEC.md §5.5 traces every reported number to a committed run artifact, ` +
        `and a silently renamed directory breaks that trace.`,
    );
  }
  return runId;
}

/** `runs/<run_id>` — the directory one scored sweep writes into. */
export function runRoot(runId: string): string {
  return join(RUNS_ROOT, checkRunId(runId));
}

/**
 * `runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json`.
 *
 * The key's field order is M48's: `agent_id`, `split`, `seed`, `llm_mode`. The
 * *path* nests `split/seed` first because M42 already nests the dataset that way
 * and a reader comparing a scored run to its dataset should not have to
 * transpose two trees.
 */
export function metricsPath(runId: string, key: RunKey): string {
  return join(
    runRoot(runId),
    key.split,
    String(key.seed),
    key.agent_id,
    key.llm_mode,
    METRICS_FILE,
  );
}
