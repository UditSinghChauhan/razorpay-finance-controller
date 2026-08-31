import type { FlagSpecs } from "../args.js";
import { GLOBAL_FLAGS } from "../config.js";
import { benchCommand } from "./bench.js";
import { closeCommand } from "./close.js";
import { generateCommand } from "./generate.js";
import { oracleCommand } from "./oracle.js";
import { reportCommand } from "./report.js";
import { runCommand } from "./run.js";
import { sealCommand } from "./seal.js";
import { verifyCommand } from "./verify.js";
import type { Command } from "./types.js";

/**
 * `DECISION_BRIEF.md §C` T0-11's eight commands, in the order it lists them:
 * `generate · oracle · run · bench · close · verify · seal · report`.
 *
 * The order is preserved because it is the order the pipeline runs in, and
 * `tests/commands.test.ts` asserts the registry against the literal list in the
 * acceptance table — a command quietly dropped from a CLI is a command everyone
 * believes exists.
 *
 * **`report` was appended at spec 1.4.29 (`DATA_MODEL.md §22.2` M48), and
 * appended is the operative word.** `EVALUATION_SPEC.md §7` had invoked it since
 * before the CLI existed while T0-11 enumerated seven, so the command was
 * required by the reproducibility guarantee and absent from every list. It goes
 * last on `PREREGISTRATION.md §8`'s own principle for metrics 27 and 28 —
 * *"appended, never renumbered"* — so the original seven keep the positions every
 * cross-reference already assumes.
 */
export const COMMANDS: readonly Command[] = Object.freeze([
  generateCommand,
  oracleCommand,
  runCommand,
  benchCommand,
  closeCommand,
  verifyCommand,
  sealCommand,
  reportCommand,
]);

/** T0-11's list as text, for the assertion that the registry matches it. */
export const T0_11_COMMANDS: readonly string[] = Object.freeze([
  "generate",
  "oracle",
  "run",
  "bench",
  "close",
  "verify",
  "seal",
  "report",
]);

export function findCommand(name: string): Command | null {
  return COMMANDS.find((command) => command.name === name) ?? null;
}

/** A command's flags, merged over the global ones. */
export function flagsFor(command: Command): FlagSpecs {
  return { ...GLOBAL_FLAGS, ...command.flags };
}

export type { Command, CommandContext } from "./types.js";
export {
  benchCommand, closeCommand, generateCommand, oracleCommand, reportCommand,
  runCommand, sealCommand, verifyCommand,
};
