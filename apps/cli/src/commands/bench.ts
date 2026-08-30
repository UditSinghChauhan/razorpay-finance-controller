import { UnavailableStageError } from "../errors.js";
import type { Command } from "./types.js";

/**
 * `assay bench` — the scored benchmark sweep.
 *
 * `ARCHITECTURE.md §10` puts everything this command does inside
 * `packages/eval`: the agent runner behind one interface, the scorer producing
 * `metrics.json` per `(agent × seed × split)`, and the aggregator's bootstrap
 * CIs. `DECISION_BRIEF.md §C` T0-9 and T0-10 name the same package for the
 * metrics, the baselines and the ablations.
 *
 * That package is being written now and `apps/cli` does not import it. The
 * wiring is deferred rather than stubbed: an interface guessed against an
 * unwritten API is a guess that will be wrong in a way nobody notices, and
 * `§L.4` forbids reporting a number that does not exist in a committed run
 * artifact — which is what a fabricated runner would produce.
 *
 * **What this command will be, when the dependency lands.**
 * `DECISION_BRIEF.md §L.1` rule 11 fixes its configuration and this package
 * already implements that half: *"All scored benchmark runs use `--llm=replay
 * --strict-replay`. A cache miss is a hard error, never a silent live call."*
 * `--strict-replay` defaults to on, `providers.ts` refuses every metered
 * provider, and `packages/llm`'s `ReplayCacheMissError` is not caught anywhere
 * in this package.
 */
// The context is unused: a command that reports its blocker reads nothing
// and writes nothing, and `Command.run` admits a nullary implementation.
async function run(): Promise<void> {
  throw new UnavailableStageError(
    "bench",
    "packages/eval",
    "ARCHITECTURE.md §10; DECISION_BRIEF.md §C T0-9, T0-10",
    `the agent runner, the scorer and the aggregator are all packages/eval's, and the package ` +
      `is not available to this one yet. apps/cli composes it and does not reimplement it.`,
  );
}

export const benchCommand: Command = {
  name: "bench",
  summary: "Score every agent over every seed and aggregate with bootstrap CIs.",
  flags: {
    agents: { kind: "string", describe: "Comma-separated agent ids (ASSAY, B0, A1, A2, A3)." },
    seeds: { kind: "string", describe: "Comma-separated declared seeds." },
    out: { kind: "string", describe: "Directory for metrics.json." },
  },
  run,
};
