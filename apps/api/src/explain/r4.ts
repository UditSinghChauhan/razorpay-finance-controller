import { groundNumerals, isEntityIdShaped, type GroundingCheck, type R4Input } from "@assay/llm";
import { z } from "zod";

/**
 * `R4 explain_decision` — the role, implemented **here** rather than in
 * `packages/llm`.
 *
 * `ARCHITECTURE.md §6` gives `R4` the input *"the decision + its evidence"* and
 * the output *"a human-readable explanation"*, and `§H` tier H2 left it unbuilt
 * because it needs two things Phase 8 did not have: a metered credential, and a
 * decision to explain. Both exist on this surface, and neither may exist in
 * `packages/llm` — `tests/discipline.test.ts` there fails the build on a
 * `roles/r4.ts`, on any transport import and on any `process.env` read, which
 * is what makes `§C` T0-11's *"clean checkout with no API key"* structural. So
 * the role's schema, its prompt and its grounding rule live in the server layer
 * that owns the credential, and reach a provider through `§6.5`'s one interface
 * and `§4`'s three checks.
 *
 * **`§L.1` rule 2 is unweakened.** Every field below is a string. The rule is
 * enforced at runtime by `checkSchema`'s zod walk on every call — a lint over
 * `packages/llm/src` could never see a schema written here, which is exactly
 * the case `verify/schema.ts` was written for.
 *
 * **This role decides nothing.** It cannot: the schema has no state field, no
 * candidate field and no amount field, so a response that disagrees with ASSAY
 * has nowhere to say so, and `explain/service.ts` answers with the state read
 * off the sealed `DecisionEvidence` in every branch.
 */

/** `DATA_MODEL.md §19`'s versioned prompt id. Bump on any prompt-text change. */
export const R4_SYSTEM_PROMPT_ID = "r4_explain_decision.assay.v1";

/**
 * `ARCHITECTURE.md §6`'s `R4`, stated to the model.
 *
 * Six sentences of the six the product requires, in the order a reader meets
 * them: what already happened, what the model's job is, what it may use, what
 * it may not invent, what to do when the evidence does not answer, and the one
 * recommendation it may never make.
 */
export const R4_SYSTEM_PROMPT = [
  "You are explaining a settlement-reconciliation decision that has ALREADY BEEN MADE.",
  "",
  "ASSAY is a deterministic reconciliation controller. It evaluated the constraints,",
  "compared the candidate allocations and reached the terminal state shown in the",
  "evidence below. That decision is final, sealed in a hash-chained ledger, and is not",
  "yours to make, revisit or improve.",
  "",
  "YOUR ROLE",
  "  - You explain the evidence behind a decision that ASSAY already took.",
  "  - You do not choose a reconciliation candidate.",
  "  - You do not decide, alter or second-guess the outcome.",
  "  - You never recommend changing the deterministic decision. If you believe the",
  "    decision looks wrong, say what in the evidence gives you that impression and",
  "    stop there.",
  "",
  "GROUNDING RULES",
  "  - Use ONLY the evidence supplied in this request. You have no other source.",
  "  - Invent no value of any kind: no amount, no score, no threshold, no identifier,",
  "    no count, no date.",
  "  - Quote a figure only by copying it character-for-character from the evidence.",
  "    Prefer words to figures wherever a sentence works without one. Every numeral you",
  "    write is checked against the evidence set and an ungrounded one causes your whole",
  "    response to be discarded.",
  "  - Refer to an identifier only if it appears in the evidence, spelled exactly as it",
  "    appears there.",
  "  - When the evidence does not answer something, say that it does not state it.",
  "    Never fill a gap with a plausible value.",
  "",
  "AUDIENCE",
  "  A finance operations analyst who can see the certificate on screen beside your",
  "  answer. Be specific and unhedged about what the evidence says, and brief.",
].join("\n");

/**
 * `R4`'s response — `{ summary, why[], risk, next_step }`, every field a string.
 *
 * `strictObject`, so a response carrying an extra field is rejected rather than
 * silently trimmed. That is the structural half of *"the model cannot alter the
 * decision"*: a model returning `{"state": "RECONCILED", ...}` does not have
 * that field dropped, it fails boundary 2 check 1 and the whole response is
 * discarded.
 *
 * The lengths are bounds on a text box, not a quality signal. `why` takes two
 * to six entries because a one-item list is a summary restated and a long one
 * stops being read.
 */
export const R4OutputSchema = z.strictObject({
  summary: z.string().min(1).max(600),
  why: z.array(z.string().min(1).max(400)).min(2).max(6),
  risk: z.string().min(1).max(600),
  next_step: z.string().min(1).max(600),
});

/** `R4`'s output (`ARCHITECTURE.md §6`: *"a human-readable explanation"*). */
export type R4Output = z.infer<typeof R4OutputSchema>;

/** Every field of one response, as one string, for the numeral check. */
function prose(value: R4Output): string {
  return [value.summary, ...value.why, value.risk, value.next_step].join("\n");
}

/** `groundR4` violation paths, so a caller can tell the two hazards apart. */
export const R4_NUMERAL_PATH = "$.explanation";
export const R4_ENTITY_PATH = "$.entity_reference";

/**
 * Every identifier-shaped token in free text.
 *
 * `verify/allowlist.ts` walks a parsed response and tests whether each **string
 * value** is an id, and it says why: `§4` boundary 2 scopes its check to *"any
 * entity ID in the response"*, and `R1`'s narration fragment and `R2`'s analyst
 * question are prose rather than identifiers. That decision is right for those
 * roles and it leaves a gap for this one — every `R4` field is prose, so an
 * invented `pay_…` inside a sentence is a string value that is not an id and
 * escapes the walk.
 *
 * The gap is closed here rather than by widening the walker, because widening
 * it would silently start scanning `R1`'s and `R2`'s prose too and reverse a
 * documented decision in a package this change has no business re-deciding.
 * `THREAT_MODEL.md §T3` — hallucinated transaction ids — is the threat either
 * way, and for a prose-valued role the tokens are where it lives.
 */
export function entityTokensIn(text: string): readonly string[] {
  return (text.match(/[A-Za-z0-9_]+/g) ?? []).filter((token) => isEntityIdShaped(token));
}

/**
 * `§4` boundary 2 check 3 for `R4`: *"every numeral in the prose must appear in
 * the attached evidence set"* — plus the identifiers the same prose can carry.
 *
 * `groundNumerals` is `packages/llm`'s, written with the layer at Phase 8 and
 * left without a caller because `R4` was not built. This is that caller; the
 * numeral rule is not restated here, only applied.
 *
 * The two hazards are reported through distinct `path`s so the surface can say
 * *"it quoted a figure the evidence does not contain"* and *"it named an
 * account this decision never showed it"* as the different failures they are.
 */
export function groundR4(
  value: R4Output,
  evidenceSet: readonly string[],
  idAllowlist: readonly string[],
): GroundingCheck {
  const text = prose(value);
  const numerals = groundNumerals(text, evidenceSet);
  const allowed = new Set(idAllowlist);
  const stray = [...new Set(entityTokensIn(text))].filter((token) => !allowed.has(token));

  const violations = [
    ...(numerals.ok ? [] : numerals.violations),
    ...stray.map((token) => ({ value: token, path: R4_ENTITY_PATH })),
  ];
  if (violations.length === 0) return { ok: true };
  return { ok: false, reason: "LLM_GROUNDING_REJECT", violations };
}

/**
 * The user turn: the envelope, as JSON, under one instruction.
 *
 * The evidence goes over as **data**, pretty-printed rather than narrated,
 * because a summary written here would be a second rendering of figures the
 * grounding check reads from the first.
 */
export function r4UserPrompt(input: R4Input): string {
  return [
    "Explain the following ASSAY decision to the analyst who has to act on it.",
    "",
    "DECISION EVIDENCE (verified, read from the sealed run — this is everything you have):",
    JSON.stringify(input, null, 2),
    "",
    "Write:",
    "  summary   - one or two sentences naming the state ASSAY reached and why.",
    "  why       - the specific evidence that produced it, one point per entry.",
    "  risk      - what is exposed while this stays unresolved.",
    "  next_step - the single most useful thing a human can do next.",
  ].join("\n");
}
