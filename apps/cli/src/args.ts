import { UsageError } from "./errors.js";

/**
 * A hand-rolled argument parser.
 *
 * No third-party parser is used. `.npmrc` records why the workspace pins
 * dependencies exactly — *"a caret range would let a transitive upgrade change
 * behaviour between the sealed run and a reviewer's re-run"* — and
 * `EVALUATION_SPEC.md §7` names pinned dependencies among the guarantees that a
 * third party can reproduce every number in the report. An argument parser is
 * the cheapest possible dependency to avoid, and every dependency avoided is one
 * fewer thing between a reviewer and a byte-identical re-run.
 *
 * The parser is **strict** in the sense `ARCHITECTURE.md §4` boundary 1 uses the
 * word: an unknown flag is refused rather than ignored. A silently ignored
 * `--strict-replay` would turn `DECISION_BRIEF.md §L.1` rule 11 off without
 * saying so, which is precisely the failure that rule exists to prevent.
 */

/** What a flag carries. */
export type FlagKind = "boolean" | "string";

export interface FlagSpec {
  readonly kind: FlagKind;
  readonly describe: string;
}

export type FlagSpecs = Readonly<Record<string, FlagSpec>>;

export interface ParsedArgs {
  /** The subcommand, or `null` when none was given. */
  readonly command: string | null;
  /** Declared flags that were present. Booleans are `true`; strings carry their value. */
  readonly flags: ReadonlyMap<string, string | true>;
  /** Positional arguments after the command, in order. */
  readonly positional: readonly string[];
}

/** `--flag=value`, `--flag value`, `--flag` and `--` are the whole grammar. */
const LONG = /^--([A-Za-z][A-Za-z0-9-]*)(?:=(.*))?$/s;

/**
 * Parse `argv` (already stripped of `node` and the script path).
 *
 * @throws UsageError on an unknown flag, a missing value, or a repeated flag.
 */
export function parseArgs(argv: readonly string[], specs: FlagSpecs): ParsedArgs {
  let command: string | null = null;
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  let literal = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (literal) {
      positional.push(token);
      continue;
    }
    if (token === "--") {
      literal = true;
      continue;
    }

    const match = LONG.exec(token);
    if (match === null) {
      if (token.startsWith("-") && token !== "-") {
        throw new UsageError(
          `unknown option ${JSON.stringify(token)}. Only long options (--name) are accepted; ` +
            `single-letter aliases are not, because a one-character typo must not silently ` +
            `select a different mode.`,
        );
      }
      if (command === null) command = token;
      else positional.push(token);
      continue;
    }

    const name = match[1];
    if (name === undefined) continue;
    const spec = specs[name];
    if (spec === undefined) {
      throw new UsageError(
        `unknown flag --${name}. An unrecognised flag is refused rather than ignored: a ` +
          `silently dropped --strict-replay would disable DECISION_BRIEF.md §L.1 rule 11 ` +
          `without saying so.`,
      );
    }
    if (flags.has(name)) {
      throw new UsageError(`--${name} given more than once; the CLI takes each flag at most once.`);
    }

    const inline = match[2];
    if (spec.kind === "boolean") {
      if (inline !== undefined) {
        throw new UsageError(`--${name} is a boolean flag and takes no value.`);
      }
      flags.set(name, true);
      continue;
    }

    if (inline !== undefined) {
      flags.set(name, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || LONG.test(next)) {
      throw new UsageError(`--${name} requires a value.`);
    }
    flags.set(name, next);
    i += 1;
  }

  return { command, flags: flags, positional: Object.freeze(positional) };
}

/** A declared string flag's value, or `null` when it was not given. */
export function stringFlag(parsed: ParsedArgs, name: string): string | null {
  const value = parsed.flags.get(name);
  if (value === undefined) return null;
  if (value === true) {
    throw new UsageError(`--${name} requires a value.`);
  }
  return value;
}

/** Whether a declared boolean flag was given. */
export function boolFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags.get(name) === true;
}

/** A required string flag. */
export function requireFlag(parsed: ParsedArgs, name: string): string {
  const value = stringFlag(parsed, name);
  if (value === null) throw new UsageError(`--${name} is required.`);
  return value;
}
