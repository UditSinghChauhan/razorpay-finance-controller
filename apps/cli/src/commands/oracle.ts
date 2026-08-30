import { labelAll, oracleContext } from "@assay/oracle";

import { requireFlag, stringFlag } from "../args.js";
import { encodeJsonl } from "../artifacts/jsonl.js";
import { loadObservations } from "../artifacts/observations.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay oracle` — run the Ambiguity Oracle over an observation set.
 *
 * `ARCHITECTURE.md §10`: `oracle ◀── observations ONLY ──▶
 * ambiguity_labels.jsonl`. `packages/oracle`'s header states the split this
 * command sits on: *"**This package performs no I/O.** It takes an observation
 * set as data and returns labels as data … `apps/cli` performs the read."*
 *
 * **Everything below the read is `packages/oracle`'s.** `oracleContext` builds
 * `C2`'s referent set — including `DATA_MODEL.md §22.2` M22's *"the `recon_line`
 * governs"* precedence and `PREREGISTRATION.md §4.2`'s `F05` case — and
 * `labelAll` enumerates, decomposes and classifies. Neither is re-spelled here;
 * that package's own doc comment gives the reason a caller must not invent
 * either: *"an invented reading would be compared against the engine's declared
 * one and the gate would report a divergence between the oracle and its own
 * caller."*
 *
 * **`C7`'s allocated set is empty, and that is the package's default rather
 * than a choice made here.** `oracleContext` scopes it to *"a property of the
 * run's committed decisions rather than of the observation set"*, and
 * `ARCHITECTURE.md §10` runs this pass *"inside the generator's trust zone,
 * offline, **before any agent exists**"* — so there are no committed decisions
 * for it to hold.
 *
 * **`AL8` and the probe surface never enter.** The read below is zone `AGENT`,
 * so the guard refuses `recon_report*.jsonl` and `ground_truth*.jsonl` alike.
 * `PREREGISTRATION.md §10` V22 records why that must stay true: *"an oracle
 * holding the report would void `§5.3`'s expressibility scoping and make the
 * completeness gate tautological."*
 */
async function run(context: CommandContext): Promise<void> {
  const observationsPath = requireFlag(context.args, "observations");
  const outPath = stringFlag(context.args, "out") ?? "ambiguity_labels.jsonl";

  const observations = loadObservations(observationsPath, { sealed: context.config.sealed });
  const result = labelAll(observations, oracleContext(observations));

  context.sink.write(outPath, encodeJsonl(result.labels));

  const counts = new Map<string, number>();
  for (const label of result.labels) {
    counts.set(label.label, (counts.get(label.label) ?? 0) + 1);
  }

  context.out(`observations        ${String(observations.length)}`);
  context.out(`targets             ${String(result.labels.length)}`);
  // Sorted, because DATA_MODEL.md §16 bars a reported result that depends on
  // "iteration order over an unordered collection" and a Map preserves
  // insertion order, which is the enumeration's, not a stable one.
  for (const [label, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    context.out(`  ${label.padEnd(18)}${String(count)}`);
  }
  context.out(`labels              ${outPath}`);
}

export const oracleCommand: Command = {
  name: "oracle",
  summary: "Enumerate evidence-admissible allocations and label ambiguity (observations only).",
  flags: {
    observations: { kind: "string", describe: "Path to observations.jsonl." },
    out: { kind: "string", describe: "Output path. Default: ambiguity_labels.jsonl" },
  },
  run,
};
