import { ObservationSchema, type Observation } from "@assay/domain";

import { decodeJsonl } from "./jsonl.js";

/**
 * Loading `observations.jsonl` — the artifact `ARCHITECTURE.md §10` gives to
 * *"every agent"*.
 *
 * **This is a decode of an already-`S0`'d artifact, and it is not `S0`.**
 * `RECONCILIATION_SPEC.md §2` gives `S0` the input *"raw source files"* and the
 * output `Observation[]` + `UntrustedText[]`; `observations.jsonl` holds that
 * **output**, one serialized `Observation` per line, already carrying the
 * `source_file`, `source_line` and `ingest_hash` that `§2` step 5 stamps. The
 * only thing that happens below is `ObservationSchema.parse` — `packages/domain`'s
 * own schema, invoked on bytes this package read. No field is renamed,
 * normalized, classified or hashed here.
 *
 * **The raw-source ingest path is a different route and is not available.**
 * `S0`'s own entry point — the orchestration `ARCHITECTURE.md §3` assigns to
 * `packages/domain` at spec 1.4.18 — does not exist in that package. `§3` says
 * so itself: *"domain's `S0` orchestration is **scheduled, not written**"*. See
 * `commands/run.ts`, which reports the gap rather than filling it here.
 */

/** Read an `observations.jsonl` artifact into `packages/domain`'s `Observation`. */
export function loadObservations(path: string): readonly Observation[] {
  return decodeJsonl({ path, zone: "AGENT" }, ObservationSchema);
}
