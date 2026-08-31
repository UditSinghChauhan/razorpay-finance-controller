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

/**
 * `PREREGISTRATION.md §9` step 7's `all`, as both `--seeds` and `--agents` spell it.
 *
 * One constant rather than two literals: the two flags took the word from the
 * same line of the same code block, and a spelling that drifted between them
 * would make one of `§9` step 7's two arguments silently different from the
 * other.
 */
export const ALL = "all";

/** A required string flag. */
export function requireFlag(parsed: ParsedArgs, name: string): string {
  const value = stringFlag(parsed, name);
  if (value === null) throw new UsageError(`--${name} is required.`);
  return value;
}

/**
 * `PREREGISTRATION.md §9` step 2's seed argument, parsed.
 *
 * ```
 *   assay generate --split test --seeds 9000-9004,9100-9104     §9 step 2
 *   pnpm assay generate --split dev --seeds 2000-2004           EVALUATION_SPEC.md §7
 * ```
 *
 * **The grammar is the frozen text's own and nothing is invented** (spec 1.4.27,
 * `DATA_MODEL.md §22.2` M43): a comma-separated list whose items are a single
 * integer or an inclusive `lo-hi` range. Both documents already spell it this
 * way; this function reads what they wrote rather than choosing a syntax.
 *
 * **`all` is a third spelling, and it is a convention rather than a
 * ratification.** `§9` step 7 writes `assay bench --sealed --agents all --seeds
 * all`, and spec 1.4.27's derivation above considered only step 2 and
 * `EVALUATION_SPEC.md §7` — so `all` is a form that derivation **overlooked**,
 * not one it rejected. It is accepted here because refusing a spelling `§9`
 * literally writes would leave the frozen procedure inexecutable, which is the
 * defect spec 1.4.29 `M45` exists to close elsewhere. Nothing is ratified: `all`
 * is semantically identical to the explicit enumeration the frozen grammar
 * already admits, expands only over `§6.1`'s declared seeds for the split the
 * caller names, and is recorded here on `artifacts/replay-cache.ts`'s precedent
 * so a later amendment naming a different syntax supersedes this file rather
 * than contradicting a rule nobody wrote.
 *
 * **`all` resolves nothing on its own.** The caller supplies the seeds, because
 * `§6.1`'s split table is `packages/generator`'s and a parser that expanded it
 * would be the second reader this function's next paragraph refuses to become.
 *
 * **Membership is not checked here.** `PREREGISTRATION.md §6.1`'s split table is
 * the sole authority on which seeds exist and which split each belongs to, and
 * `packages/generator`'s `blockOf` is its only reader. A parser that also
 * validated would be a second place the table is interpreted.
 *
 * Ascending, and duplicates are refused rather than collapsed: a seed named
 * twice would generate a dataset twice and quietly overwrite it, and `§9` step 2
 * names each seed exactly once.
 *
 * @throws UsageError on an empty list, a malformed item, or a repeat.
 */
export function parseSeedList(
  raw: string,
  flag = "seeds",
  allSeeds?: readonly number[],
): readonly number[] {
  if (raw.trim() === ALL) {
    if (allSeeds === undefined) {
      throw new UsageError(
        `--${flag} all is not available here: PREREGISTRATION.md §9 step 7 spells it for a ` +
          `command that knows its split, and §6.1's table is the sole authority on which ` +
          `seeds a split has. Name the seeds, as §9 step 2 does: "9000-9004,9100-9104".`,
      );
    }
    if (allSeeds.length === 0) {
      throw new UsageError(`--${flag} all expanded to no seed; §6.1 assigns every split five.`);
    }
    return Object.freeze([...allSeeds].sort((a, b) => a - b));
  }

  const seeds: number[] = [];
  const seen = new Set<number>();

  const add = (seed: number, item: string): void => {
    if (seen.has(seed)) {
      throw new UsageError(
        `--${flag}: seed ${String(seed)} appears more than once in ${JSON.stringify(raw)}. ` +
          `A repeated seed would generate one dataset twice; PREREGISTRATION.md §9 step 2 ` +
          `names each seed once. (from ${JSON.stringify(item)})`,
      );
    }
    seen.add(seed);
    seeds.push(seed);
  };

  const readOne = (text: string, item: string): number => {
    if (!/^[0-9]+$/.test(text)) {
      throw new UsageError(
        `--${flag}: ${JSON.stringify(item)} is not a seed or a lo-hi range. The grammar is ` +
          `PREREGISTRATION.md §9's own — a comma-separated list of integers and inclusive ` +
          `ranges, as in "9000-9004,9100-9104".`,
      );
    }
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new UsageError(`--${flag}: ${JSON.stringify(item)} is not a positive integer seed.`);
    }
    return value;
  };

  for (const item of raw.split(",")) {
    const trimmed = item.trim();
    if (trimmed === "") {
      throw new UsageError(
        `--${flag}: empty item in ${JSON.stringify(raw)}. Every item names a seed or a range.`,
      );
    }
    const dash = trimmed.indexOf("-");
    if (dash === -1) {
      add(readOne(trimmed, trimmed), trimmed);
      continue;
    }
    const lo = readOne(trimmed.slice(0, dash), trimmed);
    const hi = readOne(trimmed.slice(dash + 1), trimmed);
    if (hi < lo) {
      throw new UsageError(
        `--${flag}: range ${JSON.stringify(trimmed)} runs backwards. §9 step 2 writes ` +
          `"9000-9004", low to high.`,
      );
    }
    for (let seed = lo; seed <= hi; seed += 1) add(seed, trimmed);
  }

  if (seeds.length === 0) {
    throw new UsageError(`--${flag} names no seed.`);
  }
  return Object.freeze([...seeds].sort((a, b) => a - b));
}

/**
 * The seeds a command was given, from `--seeds` or the singular `--seed`.
 *
 * `--seed` is retained as the degenerate one-element case rather than removed:
 * a single `(split, seed)` dataset is the unit `DATA_MODEL.md §22.2` M42 names,
 * and naming one is the commonest thing a caller does. `--seeds` is the surface
 * `PREREGISTRATION.md §9` and `EVALUATION_SPEC.md §7` write.
 *
 * `allSeeds` is what `--seeds all` expands to, and is the caller's because
 * `§6.1`'s split table is `packages/generator`'s. A command that knows its split
 * passes that split's declared seeds; one that does not passes nothing, and
 * `all` is refused rather than guessed.
 *
 * @throws UsageError when both or neither is given.
 */
export function requireSeeds(
  parsed: ParsedArgs,
  allSeeds?: readonly number[],
): readonly number[] {
  const list = stringFlag(parsed, "seeds");
  const one = stringFlag(parsed, "seed");
  if (list !== null && one !== null) {
    throw new UsageError(
      `--seeds and --seed name the same thing; give one. PREREGISTRATION.md §9 step 2 uses ` +
        `--seeds, and --seed is its one-element case.`,
    );
  }
  if (list !== null) return parseSeedList(list, "seeds", allSeeds);
  // `--seed` is the ONE-element case and takes no `all`: naming one seed and
  // meaning every seed is a contradiction the flag's own name already rules out.
  if (one !== null) return parseSeedList(one, "seed");
  throw new UsageError(`--seeds is required (PREREGISTRATION.md §9 step 2), or --seed for one.`);
}
