import { UnavailableStageError } from "../errors.js";
import type { Command } from "./types.js";

/**
 * `assay report` — render the benchmark report from committed run artifacts.
 *
 * **The eighth command, ratified at spec 1.4.29 (`DATA_MODEL.md §22.2` M48).**
 * Through spec 1.4.28 this command was invoked by `EVALUATION_SPEC.md §7`'s
 * reproducibility recipe — `pnpm assay report --out runs/report.html` — and
 * appeared in no command list: `DECISION_BRIEF.md §C` T0-11 enumerated seven and
 * `§K` gave `apps/cli/src/commands/` seven files. Three frozen sources supported
 * the command against one that merely omitted it: `§7`'s own recipe line, `§C`
 * **T0-13** as a Tier-0 row distinct from T0-9 and T0-11, and `§K`'s separate
 * `packages/eval/src/report/` module.
 *
 * **Folding it into `bench` was rejected.** It would have falsified `§7`'s
 * literal recipe — closing one contradiction by creating another — and
 * `PREREGISTRATION.md §9` step 8's *"NO CODE CHANGES BETWEEN 6 AND 8"* means
 * re-rendering a report must not require re-running the scored sweep. A renderer
 * that reads a committed `metrics.json` is also the only form under which
 * `EVALUATION_SPEC.md §5.5`'s *"any number … that does not exist in a committed
 * run artifact"* is checkable by a third party.
 *
 * **The renderer is `packages/eval`'s and does not move** (M47): a report reads
 * metrics and imports no `engine`, `llm` or `probe`, so it never participated in
 * the contradiction that moved the agents. `ARCHITECTURE.md §3` gives that
 * package *"report generation"* and `§K` gives it `report/`.
 *
 * That module is not written. The wiring is deferred rather than stubbed, for
 * the reason `commands/bench.ts` gives: a report is a set of numbers, and
 * `DECISION_BRIEF.md §L.4` forbids reporting one that does not exist in a
 * committed run artifact — which is exactly what a fabricated renderer would
 * produce. `EVALUATION_SPEC.md §5.4` fixes thirteen obligations this command
 * will discharge, `§5.5` twelve practices it must refuse, and neither is
 * satisfiable before a scored run exists.
 *
 * **What this command will read, when the dependency lands** (M48):
 *
 * ```
 *   runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
 *   runs/report.html                    EVALUATION_SPEC.md §7's own --out path
 * ```
 *
 * `artifacts/metrics-path.ts` holds that layout; `@assay/eval`'s `run-key.ts`
 * holds the `(agent_id, split, seed, llm_mode)` key it is derived from.
 */
// The context is unused: a command that reports its blocker reads nothing
// and writes nothing, and `Command.run` admits a nullary implementation.
async function run(): Promise<void> {
  throw new UnavailableStageError(
    "report",
    "packages/eval (src/report/)",
    "DECISION_BRIEF.md §C T0-13, §K; ARCHITECTURE.md §3; EVALUATION_SPEC.md §5.4",
    `the renderer is packages/eval's and is not written, and there is no scored run to ` +
      `render: assay bench is itself blocked. EVALUATION_SPEC.md §5.5 forbids reporting a ` +
      `number that does not exist in a committed run artifact, so a renderer built ahead of ` +
      `the artifacts it reads would produce exactly the numbers that rule prohibits.`,
  );
}

export const reportCommand: Command = {
  name: "report",
  summary: "Render the benchmark report from committed metrics.json artifacts (§5.4).",
  flags: {
    out: { kind: "string", describe: "Output path. EVALUATION_SPEC.md §7: runs/report.html" },
    run: { kind: "string", describe: "The runs/<run_id> directory to read metrics.json from." },
  },
  run,
};
