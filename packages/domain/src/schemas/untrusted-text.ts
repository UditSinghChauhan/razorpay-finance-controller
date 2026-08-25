/**
 * THE QUARANTINE. Free text removed from every structural record.
 *
 * This module is reachable only as `@assay/domain/untrusted-text`, and it is
 * deliberately NOT re-exported from the package root. `packages/engine` imports
 * the rest of `@assay/domain` legitimately, so a root re-export would make the
 * ban on this module unenforceable.
 *
 * `DECISION_BRIEF.md §L.1` rule 3 and `DATA_MODEL.md §10`:
 *
 *   "Nothing in `packages/engine` may import `UntrustedText`. Enforced by an
 *    ESLint `no-restricted-imports` rule, verified in CI. This is the
 *    structural prompt-injection defence: it is not that the core *chooses* not
 *    to read hostile text, it is that it *cannot*."
 *
 * `THREAT_MODEL.md §T1` makes the same point about a future maintainer: the ban
 * prevents "a future developer 'just peeking' at the description for a hint".
 * The lint rule for this exact path was written in the workspace commit, before
 * this file existed, precisely so it could never be added without one.
 *
 * `RECONCILIATION_SPEC.md §2` explains why the split happens at stage zero:
 * "if free text is available anywhere downstream, someone will eventually read
 * it 'just for a hint'. Removing it structurally is the only durable defence."
 */

import { z } from "zod";

import { observationIdField } from "./primitives.js";

/**
 * The five free-text fields, and the only five.
 *
 * `DATA_MODEL.md §0` rule 4 names `description`, `notes`, `order_receipt` and
 * bank `narration`; `§8` adds the merchant ledger's `memo`, and `§10` lists all
 * five in the `field` union.
 */
export const UNTRUSTED_TEXT_FIELDS = [
  "description",
  "notes",
  "narration",
  "memo",
  "order_receipt",
] as const;

export type UntrustedTextField = (typeof UNTRUSTED_TEXT_FIELDS)[number];

/**
 * One quarantined field, keyed to the observation it was stripped from.
 *
 * `notes` is a documented JSON **object** — up to 15 key-value pairs of 256
 * characters each — not a bare string. `§10` quarantines the whole object as a
 * single row carrying its canonical-JSON serialization, "so the deterministic
 * core sees a single opaque blob and the injection surface is one field rather
 * than N". That strengthens the `F10` adversarial family rather than weakening
 * it: hostile text realistically arrives in merchant-chosen *values* under
 * merchant-chosen *keys*, and both end up inside the quarantined payload.
 */
export const UntrustedTextSchema = z.strictObject({
  obs_id: observationIdField,
  field: z.enum(UNTRUSTED_TEXT_FIELDS),
  /** Verbatim. Never interpreted by the deterministic core. */
  raw: z.string(),
  length: z.number().int().nonnegative(),
  /** Control characters stripped. For UI display only — never for matching. */
  sanitized_preview: z.string(),
});

export type UntrustedText = z.infer<typeof UntrustedTextSchema>;

/**
 * Code points removed from a preview.
 *
 * Expressed as numeric ranges and filtered per code point rather than as a
 * regular expression, so that no control character appears literally in this
 * source file and no lint rule has to be suppressed to describe them.
 */
const STRIPPED_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08], // C0 controls before tab (0x09)
  [0x0b, 0x0c], // vertical tab and form feed, between newline (0x0a) and CR (0x0d)
  [0x0e, 0x1f], // C0 controls after CR, including ESC (0x1b)
  [0x7f, 0x9f], // DEL and the C1 controls
  [0x200b, 0x200f], // zero-width space/joiners and LTR/RTL marks
  [0x202a, 0x202e], // bidirectional embedding and override
  [0x2066, 0x2069], // bidirectional isolates
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
];

/**
 * Strip control and text-spoofing characters for display.
 *
 * `sanitized_preview` exists so a UI can show an analyst what arrived without
 * rendering terminal escapes or bidirectional overrides. It is explicitly "for
 * UI display only" (`§10`): nothing downstream may match, parse or decide on
 * it, and `raw` keeps the verbatim value.
 *
 * Tab, newline and carriage return are kept — they are ordinary content in a
 * bank narration and removing them would alter what the analyst is looking at.
 * The bidirectional and zero-width characters are removed because they change
 * what a human reads without changing the string, which is exactly the
 * confusion an operator reviewing hostile merchant text must not be exposed to.
 */
export function sanitizeForPreview(raw: string): string {
  let out = "";
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    const stripped = STRIPPED_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
    if (!stripped) out += character;
  }
  return out;
}
