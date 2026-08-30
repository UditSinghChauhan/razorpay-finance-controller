import { CliError, EXIT } from "../errors.js";
import { readLines, type ReadRequest } from "../fs/io.js";

/**
 * JSON-lines decoding, and the exact boundary this package is allowed to stand
 * at.
 *
 * `ARCHITECTURE.md §3`: `apps/cli` *"acquires raw source contents and passes
 * them into `packages/domain`'s `S0` boundary, and **performs no `S0` transform
 * itself**"*. Two things follow, and this module is where both are visible.
 *
 * **What this file does.** It splits a file into records and calls a decoder the
 * caller supplied. Line framing and `JSON.parse` are statements about the
 * *file*, not about a record: they decide where one record ends, not what it
 * means.
 *
 * **What this file must never do.** `RECONCILIATION_SPEC.md §2`'s five steps —
 * schema parsing, ingest invariants, free-text quarantine, normalization to
 * `Paise` and Unix seconds, provenance and `ingest_hash` stamping — are `S0`,
 * and `S0` belongs to `packages/domain`. There is no field name anywhere in
 * this module, no schema, no `Paise`, no hash. The `Decoder` below is always
 * something `packages/domain` or `packages/ledger` exported.
 */

/**
 * A validator owned by another package.
 *
 * Structural on purpose, and typed without importing `zod`: `zod` is a
 * dependency of `packages/domain` and `packages/llm`, not of `apps/cli`, and
 * naming a `zod` type at this boundary would make the CLI's public surface
 * depend on a library it does not declare. `ObservationSchema.parse` and
 * `sealStoredEvent` both inhabit this shape already.
 */
export interface Decoder<T> {
  readonly parse: (value: unknown) => T;
}

/** A record that its owning package's decoder refused. */
export class RecordRejectedError extends CliError {
  readonly path: string;
  /** 1-based, counting only non-blank lines, as an editor would report it. */
  readonly record: number;

  constructor(path: string, record: number, detail: string) {
    super(
      `${path}: record ${String(record)} was refused by the schema that owns it: ${detail}`,
      EXIT.FAILURE,
    );
    this.name = "RecordRejectedError";
    this.path = path;
    this.record = record;
  }
}

/**
 * Read a `.jsonl` artifact and hand every record to `decoder`.
 *
 * The read goes through `io.ts`, so `PREREGISTRATION.md §6.2`'s `AL2`/`AL8`
 * guard has already run by the time a record exists.
 */
export function decodeJsonl<T>(request: ReadRequest, decoder: Decoder<T>): readonly T[] {
  const lines = readLines(request);
  const out: T[] = [];
  for (const [index, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (cause) {
      throw new RecordRejectedError(
        request.path,
        index + 1,
        cause instanceof Error ? cause.message : String(cause),
      );
    }
    try {
      out.push(decoder.parse(raw));
    } catch (cause) {
      throw new RecordRejectedError(
        request.path,
        index + 1,
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }
  return Object.freeze(out);
}

/**
 * Serialize records to JSON lines, one per record, with a trailing newline.
 *
 * `JSON.stringify` and not `canonicalJson`: this is the emission side of a
 * `.jsonl` artifact whose records are already canonical values produced by the
 * package that owns them. Where a **hash** is taken over an artifact the digest
 * is computed over these exact bytes, so the ordering that matters is the
 * ordering the producing package chose, not one imposed here.
 */
export function encodeJsonl(records: readonly unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}
