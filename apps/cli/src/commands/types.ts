import type { FlagSpecs, ParsedArgs } from "../args.js";
import type { CliConfig } from "../config.js";
import type { WriteSink } from "../fs/io.js";

/**
 * The shape every `DECISION_BRIEF.md §C` T0-11 command has.
 *
 * `T0-11` names seven: `generate · oracle · run · bench · close · verify ·
 * seal`. All seven are registered. Three are implemented against packages that
 * exist; four report the dependency that blocks them, by name and citation,
 * because `apps/cli` is a composition root and `ARCHITECTURE.md §3` fixes which
 * package owns each missing piece. Writing the missing side here would move
 * ownership the specification has already settled.
 */

/**
 * Everything a command may reach.
 *
 * There is no filesystem handle and no `process` in this interface. `out` and
 * `sink` are the only two ways out of a command, which is what lets the suite
 * run every command end to end while writing nothing: `DECISION_BRIEF.md §L.4`
 * forbids reporting a number that does not exist in a committed run artifact,
 * and `PREREGISTRATION.md §6.1` forbids generating benchmark data before the
 * seal.
 */
export interface CommandContext {
  readonly config: CliConfig;
  readonly args: ParsedArgs;
  readonly sink: WriteSink;
  /** One line of human-readable output. */
  readonly out: (line: string) => void;
  readonly env: Readonly<Partial<Record<string, string>>>;
}

export interface Command {
  readonly name: string;
  /** One line, as `T0-11` and `ARCHITECTURE.md §3` describe the command. */
  readonly summary: string;
  /** Flags beyond `GLOBAL_FLAGS`. */
  readonly flags: FlagSpecs;
  readonly run: (context: CommandContext) => Promise<void>;
}
