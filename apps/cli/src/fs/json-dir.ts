import { readdirSync } from "node:fs";
import { join } from "node:path";

import { SourceReadError } from "./io.js";

/**
 * Every `*.json` file directly under `dir`, sorted.
 *
 * Lives beside `io.ts` rather than inside it only so that `io.ts` stays the
 * module whose every export is guarded; a directory listing names files but
 * opens none, so it is not a read and does not take a zone. The bytes are
 * acquired afterwards, through `readText`, which is guarded.
 *
 * Sorted for the reason `io.ts`'s listing is: `DATA_MODEL.md §16` bars any
 * hashed result that depends on *"iteration order over an unordered
 * collection"*, and a directory listing is one.
 */
export function readdirJson(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => join(dir, entry));
  } catch (cause) {
    throw new SourceReadError(dir, cause instanceof Error ? cause.message : String(cause));
  }
}
