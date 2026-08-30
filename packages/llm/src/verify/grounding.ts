/**
 * Boundary 2, check 3 — the grounding check (`ARCHITECTURE.md §4`).
 *
 * *"For `parse_bank_narration`, every extracted token must be a literal
 * substring of the input narration. For `explain_decision`, every numeral in the
 * prose must appear in the attached evidence set; otherwise the explanation is
 * discarded and replaced with a template."*
 *
 * Two rules, two functions. `groundInSource` is `R1`'s and is exercised at this
 * phase. `groundNumerals` is `R4`'s; `R4` is `§H` tier H2 and **is not built
 * here**, so the rule exists without a caller. It is written now rather than
 * with `R4` because `§K` names this module as one of the three verification
 * layers and `§C`'s T0-7 makes those layers a Phase 8 deliverable — the layer is
 * complete, the role that will use half of it is not.
 */

/** One extracted value that its source does not contain. */
export interface GroundingViolation {
  readonly value: string;
  readonly path: string;
}

/** The outcome of a grounding check. */
export type GroundingCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "LLM_GROUNDING_REJECT";
      readonly violations: readonly GroundingViolation[];
    };

/**
 * `R1`'s rule: every string in `extracted` must be a **literal substring** of
 * `source`.
 *
 * Literal, not normalized: `§4` says *"a literal substring of the input
 * narration"*, and a check that first upper-cased, trimmed or unpunctuated both
 * sides would admit a token the narration does not contain. `S1`'s
 * `normalizeUtr` exists for **comparison** against known settlement UTRs and
 * runs afterwards, in the engine, on a token this check has already grounded.
 *
 * An empty string is a violation: it is a substring of everything and grounds
 * nothing.
 */
export function groundInSource(
  extracted: readonly { readonly value: string; readonly path: string }[],
  source: string,
): GroundingCheck {
  const violations = extracted.filter((e) => e.value === "" || !source.includes(e.value));
  if (violations.length === 0) return { ok: true };
  return { ok: false, reason: "LLM_GROUNDING_REJECT", violations };
}

/**
 * Every maximal run of digits in `text`, in the order they appear.
 *
 * Digits only. `DATA_MODEL.md §0` rule 1 keeps money formatted at render time
 * and rule 5 makes every stored figure an integer, so a grouping separator or a
 * decimal point is presentation around a numeral rather than part of one; the
 * runs on either side of it are each checked.
 */
export function numeralsIn(text: string): readonly string[] {
  return text.match(/\d+/g) ?? [];
}

/**
 * `R4`'s rule: every numeral in `prose` must appear in the evidence set.
 *
 * The evidence set is passed as the strings a caller is willing to have cited —
 * `ARCHITECTURE.md §4`'s *"attached evidence set"*. A numeral is grounded when
 * it occurs as a digit run in at least one of them, so `10000000` grounds
 * against an evidence string containing `10000000` and not against one
 * containing `100000000`.
 *
 * **No caller at this phase.** `R4` is not built; see the module header.
 */
export function groundNumerals(prose: string, evidence: readonly string[]): GroundingCheck {
  const grounded = new Set<string>();
  for (const e of evidence) for (const n of numeralsIn(e)) grounded.add(n);
  const violations = numeralsIn(prose)
    .filter((n) => !grounded.has(n))
    .map((n) => ({ value: n, path: "$.explanation" }));
  if (violations.length === 0) return { ok: true };
  return { ok: false, reason: "LLM_GROUNDING_REJECT", violations };
}
