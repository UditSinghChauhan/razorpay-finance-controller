import { boolFlag, parseArgs } from "./args.js";
import { findCommand, flagsFor } from "./commands/index.js";
import { GLOBAL_FLAGS, resolveConfig } from "./config.js";
import { CliError, EXIT, type ExitCode } from "./errors.js";
import { diskSink, type WriteSink } from "./fs/io.js";
import { usage, versionLine } from "./usage.js";

/**
 * The dispatcher, as a pure function of its inputs.
 *
 * `process` is never touched here: `argv`, `env`, the output streams and the
 * write sink all arrive as arguments, and the result is an exit **code** rather
 * than a call to `process.exit`. `main.ts` is the only file that binds them to
 * the real process. That split is what lets `tests/` drive all seven commands
 * end to end without a filesystem and without a live process — the same
 * construction `packages/probe` uses to stay testable without I/O.
 *
 * **The command must be the first argument.** The flag table is
 * command-dependent, so nothing can be validated until the command is known,
 * and a parser that guessed which of several bare words was the command would
 * have to guess again for every string flag. `assay <command> [flags]` removes
 * the ambiguity rather than resolving it.
 */

export interface CliInvocation {
  readonly argv: readonly string[];
  readonly env: Readonly<Partial<Record<string, string>>>;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly sink?: WriteSink;
}

export async function dispatch(invocation: CliInvocation): Promise<ExitCode> {
  const { argv, env, out, err } = invocation;
  const sink: WriteSink = invocation.sink ?? diskSink();

  try {
    const first = argv[0];

    // No command: only the two informational flags are meaningful, and they are
    // in GLOBAL_FLAGS, so a strict parse is correct here.
    if (first === undefined || first.startsWith("-")) {
      const global = parseArgs(argv, GLOBAL_FLAGS);
      if (boolFlag(global, "version")) {
        out(versionLine());
        return EXIT.OK;
      }
      out(usage(null));
      return boolFlag(global, "help") ? EXIT.OK : EXIT.USAGE;
    }

    const command = findCommand(first);
    if (command === null) {
      err(`assay: unknown command ${JSON.stringify(first)}.`);
      err(usage(null));
      return EXIT.USAGE;
    }

    const parsed = parseArgs(argv, flagsFor(command));
    if (boolFlag(parsed, "help")) {
      out(usage(command));
      return EXIT.OK;
    }
    if (boolFlag(parsed, "version")) {
      out(versionLine());
      return EXIT.OK;
    }

    await command.run({
      config: resolveConfig(parsed, env),
      args: parsed,
      sink,
      out,
      env,
    });
    return EXIT.OK;
  } catch (cause) {
    if (cause instanceof CliError) {
      err(`assay: ${cause.message}`);
      return cause.exitCode;
    }
    // `ReplayCacheMissError` is packages/llm's and is deliberately NOT converted
    // into a softer outcome anywhere in this package: §L.1 rule 11 makes a cache
    // miss "a hard error, never a silent live call". Matching on `name` rather
    // than importing the class keeps the mapping one-directional — this file
    // reports the failure, it does not handle it.
    if (cause instanceof Error && cause.name === "ReplayCacheMissError") {
      err(`assay: ${cause.message}`);
      return EXIT.REPLAY_MISS;
    }
    err(`assay: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT.FAILURE;
  }
}
