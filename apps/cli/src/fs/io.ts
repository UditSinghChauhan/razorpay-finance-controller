import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { CliError, EXIT } from "../errors.js";
import { assertReadable, type ReadZone } from "./guard.js";

/**
 * The single filesystem module. `ARCHITECTURE.md §3` gives `apps/cli` *"all
 * filesystem I/O"*; this file gives `apps/cli` **one** place that performs it.
 *
 * Nothing else in this package imports `node:fs` or `node:path`, and
 * `tests/discipline.test.ts` asserts it by reading the package's own source —
 * the construction `packages/probe` and `packages/engine` already use for their
 * purity suites. The property that buys is not tidiness: `PREREGISTRATION.md
 * §6.2`'s `AL2`/`AL8` guard is only a guard if there is no second door, so
 * every read in the process funnels through `readText` below and every read
 * through `readText` calls `assertReadable` first.
 *
 * **This module performs no `S0` transform.** It returns bytes as a string, or a
 * string per line. Parsing, validation, quarantine, normalization and
 * provenance are `RECONCILIATION_SPEC.md §2`'s five steps and belong to
 * `packages/domain` (`ARCHITECTURE.md §3`, spec 1.4.18); nothing here inspects
 * a field.
 */

/** A read that failed for a reason that is not the guard's. */
export class SourceReadError extends CliError {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`cannot read ${JSON.stringify(path)}: ${detail}`, EXIT.FAILURE);
    this.name = "SourceReadError";
    this.path = path;
  }
}

/**
 * Everything a read needs beyond the path.
 *
 * Two fields, and from spec 1.4.34 (`DATA_MODEL.md §22.2` M56) no third: the
 * optional `GuardPolicy` this carried through spec 1.4.33 existed only to let
 * `--sealed` withdraw `AL2`'s `GENERATOR_TRUST` unlock, and `M56` rules `AL5` an
 * **emission** rule that withdraws no route. A field the guard no longer reads
 * is removed rather than left to be threaded through every call site.
 */
export interface ReadRequest {
  readonly path: string;
  /** Who the bytes are for. `PREREGISTRATION.md §6.2` `AL2`/`AL8`. */
  readonly zone: ReadZone;
}

/**
 * Read a file as UTF-8 text, through the guard.
 *
 * The guard runs **before** the open, not after: `AL7` treats a breach as
 * something that has already happened once the bytes exist in the process.
 */
export function readText(request: ReadRequest): string {
  assertReadable(request.path, request.zone);
  try {
    return readFileSync(request.path, "utf8");
  } catch (cause) {
    throw new SourceReadError(request.path, cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * Read a JSON-lines file as raw lines, through the guard.
 *
 * Blank lines are dropped and nothing else is interpreted. Splitting on `\n` and
 * trimming a trailing `\r` is a framing decision about the file, not a decision
 * about a record: no line is parsed here, so no schema, no invariant and no
 * classification is applied in `apps/cli`.
 */
export function readLines(request: ReadRequest): readonly string[] {
  return readText(request)
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.trim() !== "");
}

/** Whether a path exists. Guarded: existence of a barred artifact is itself a read. */
export function exists(request: ReadRequest): boolean {
  assertReadable(request.path, request.zone);
  return existsSync(request.path);
}

/**
 * Every `*.jsonl` file directly under `dir`, sorted.
 *
 * Sorted rather than in `readdir` order: `DATA_MODEL.md §16` forbids any result
 * that depends on *"iteration order over an unordered collection"* from
 * entering a hashed body, and a directory listing is exactly that.
 */
export function listJsonl(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .sort()
      .map((entry) => join(dir, entry));
  } catch (cause) {
    throw new SourceReadError(dir, cause instanceof Error ? cause.message : String(cause));
  }
}

/** Whether a path names a directory. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The write side, as a port rather than a call.
 *
 * `assay generate` and `assay seal` write benchmark artifacts, and
 * `PREREGISTRATION.md §9` sequences those steps around the seal tag. Taking the
 * sink as a parameter means a test can exercise the whole command without
 * producing a byte of benchmark data — which `§6.1` requires of anything run
 * before the seal — and it keeps this module the only thing that can reach the
 * disk.
 */
export interface WriteSink {
  /** Write `contents` at `path`, creating parent directories. */
  readonly write: (path: string, contents: string) => void;
}

/** The real sink. Creates parent directories; overwrites. */
export function diskSink(): WriteSink {
  return {
    write(path: string, contents: string): void {
      mkdirSync(dirname(resolve(path)), { recursive: true });
      writeFileSync(path, contents, "utf8");
    },
  };
}

/**
 * A sink that keeps everything in memory.
 *
 * Not a test double bolted on afterwards: it is how every command in this
 * package is exercised, because `DECISION_BRIEF.md §L.4` forbids reporting a
 * number that does not exist in a committed run artifact and the tests must
 * therefore produce no artifact at all.
 */
export interface MemorySink extends WriteSink {
  readonly files: ReadonlyMap<string, string>;
}

export function memorySink(): MemorySink {
  const files = new Map<string, string>();
  return {
    files,
    write(path: string, contents: string): void {
      files.set(path, contents);
    },
  };
}

/**
 * Path helpers, re-exported so no other module imports `node:path`.
 *
 * The guard's coverage is a property of there being one filesystem module; a
 * command that reached for `node:path` on its own would be one step from
 * reaching for `node:fs`.
 */
export { basename, dirname, join, relative, resolve };
