import { SPEC_VERSION, BENCHMARK_VERSION, GT_VERSION } from "@assay/generator";

import { GLOBAL_FLAGS } from "./config.js";
import { COMMANDS, flagsFor, type Command } from "./commands/index.js";

/**
 * Usage text.
 *
 * Every command carries its `DECISION_BRIEF.md §C` T0-11 summary, and the five
 * that cannot run yet say so on the line where a user would otherwise discover
 * it by running them. `report` joined the list at spec 1.4.29 (`DATA_MODEL.md
 * §22.2` M48), appended rather than renumbered. `ARCHITECTURE.md §3` calls the CLI *"the real interface;
 * the UI is a view over it"*, which makes an honest surface part of the
 * deliverable rather than a courtesy.
 */

function flagLines(command: Command | null): string[] {
  const specs = command === null ? GLOBAL_FLAGS : flagsFor(command);
  return Object.entries(specs).map(
    ([name, spec]) =>
      `  --${name}${spec.kind === "string" ? " <value>" : ""}`.padEnd(28) + spec.describe,
  );
}

export function usage(command: Command | null): string {
  if (command !== null) {
    return [
      `assay ${command.name} — ${command.summary}`,
      "",
      "Flags:",
      ...flagLines(command),
    ].join("\n");
  }

  return [
    "assay — ASSAY settlement reconciliation controller",
    "",
    "Usage: assay <command> [flags]",
    "",
    "Commands (DECISION_BRIEF.md §C T0-11):",
    ...COMMANDS.map((c) => `  ${c.name.padEnd(10)}${c.summary}`),
    "",
    "Global flags:",
    ...flagLines(null),
    "",
    "The full pipeline is designed to run with no API key and no network:",
    "--llm=offline is the default (DECISION_BRIEF.md §L.1 rule 10), and every",
    "metered provider is refused (ARCHITECTURE.md §6.5).",
  ].join("\n");
}

/** `--version`. The three frozen version strings, from the package that owns them. */
export function versionLine(): string {
  return `assay — specification ${SPEC_VERSION}, benchmark ${BENCHMARK_VERSION}, ground truth ${GT_VERSION}`;
}
