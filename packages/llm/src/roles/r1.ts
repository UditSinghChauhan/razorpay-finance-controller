import { z } from "zod";

import type { R1Input } from "../provider.js";
import { groundInSource, type GroundingCheck } from "../verify/grounding.js";

/**
 * `R1 · parse_bank_narration` (`ARCHITECTURE.md §6`).
 *
 * *"Input: one quarantined narration string. Output: `{utr_candidates:
 * string[], counterparty_hint: string|null, reference_hints: string[]}`."*
 *
 * **Why this role is not a rule** — and why the rule is still built. `§6`:
 * *"A regex battery handles the formats in your sample and fails silently on the
 * next bank. **We do not assume the model wins.** `A3-NOLLM` runs a regex
 * battery on the same inputs and the comparison is reported, including the case
 * where the regex is better on seen formats."* `§6.5` makes the same battery the
 * `offline` provider's `R1`, and `EVALUATION_SPEC.md §3.2` makes `A3-NOLLM`
 * *"exactly `ASSAY --llm=offline`"* — so this is one component with two jobs and
 * *"a rigged ablation would break the demo, so the incentive runs the right
 * way"*.
 *
 * **The output is hints, never a decision.** `§6`: *"the candidates it produces
 * are only **filtered** against real settlement UTRs"* by deterministic code, so
 * *"a wrong parse costs a missed anchor (-> ambiguity -> abstention), never a
 * wrong allocation"*. Over-production is therefore safe and under-production is
 * the expensive direction, which is what the thresholds below are tuned for.
 */

/**
 * `R1`'s response schema. **No number-typed field** (`§L.1` rule 2).
 *
 * `.readonly()` on both arrays because `§4` boundary 2 treats a response as
 * adversarial input: a caller that can mutate a verified value in place can
 * defeat a check that has already run.
 */
export const R1OutputSchema = z.strictObject({
  utr_candidates: z.array(z.string().min(1)).readonly(),
  counterparty_hint: z.string().min(1).nullable(),
  reference_hints: z.array(z.string().min(1)).readonly(),
});

export type R1Output = z.infer<typeof R1OutputSchema>;

/** `DATA_MODEL.md §19`'s `system_prompt_id`, versioned and cache-stable. */
export const R1_SYSTEM_PROMPT_ID = "r1_parse_bank_narration.v1";

/**
 * Rail, product and party words that are never a payment reference.
 *
 * Drawn from the narration shapes `ARCHITECTURE.md §6` lists
 * (`NEFT-RZPX00012345-RAZORPAY SOFTWARE PVT-CR`, `MMT/IMPS/RZP/452310/...`,
 * `BY TRANSFER-NEFT*RZPX0001*RAZORPAYSOFT`) together with the generator's own
 * pre-degradation form (`PREREGISTRATION.md §4.3`, convention `U-NARRATION`:
 * `NEFT CR <UTR> RAZORPAY SOFTWARE PVT LTD SETTLEMENT <yyyy-mm-dd>`).
 *
 * Matched case-insensitively. This list is the battery's **only** tuning
 * surface, and it is a list of transport nouns rather than of dataset contents.
 */
const STOP_TOKENS: ReadonlySet<string> = new Set([
  // Rails and scheme codes. `rzp` belongs here rather than among the party
  // words: in `MMT/IMPS/RZP/452310` it is the scheme segment of an IMPS
  // reference, not a counterparty. The party in that family's other shape is
  // spelled out (`RAZORPAYSOFT`) and is matched on its own.
  "neft", "rtgs", "imps", "upi", "mmt", "ach", "chq", "rzp",
  "cr", "dr", "by", "to", "from", "ref", "transfer", "trf", "txn",
  "settlement", "settle", "credit", "debit", "payment", "pmt",
]);

/** The minimum token length treated as a UTR candidate. */
const UTR_MIN_LENGTH = 6;

/** The minimum token length treated as a weaker reference hint. */
const REFERENCE_MIN_LENGTH = 4;

/** Maximal runs of `[A-Za-z0-9]`, which is what every listed shape separates on. */
function tokenize(narration: string): readonly string[] {
  return narration.match(/[A-Za-z0-9]+/g) ?? [];
}

function hasDigit(token: string): boolean {
  return /\d/.test(token);
}

function isStop(token: string): boolean {
  return STOP_TOKENS.has(token.toLowerCase());
}

/**
 * The longest contiguous alphabetic-and-space run that names something.
 *
 * Contiguous and untrimmed-in-the-middle, so the result **is** a literal
 * substring of the narration and grounding holds by construction rather than by
 * a later check passing. A run consisting only of `STOP_TOKENS` yields `null`:
 * `IMPS` is a rail, not a counterparty, and returning it would be a hint that
 * points at nothing.
 */
function counterpartyHint(narration: string): string | null {
  let best: string | null = null;
  // The boundary assertions are load-bearing, not tidiness. Without them the
  // run may START INSIDE an alphanumeric token: the generator's UTR ends
  // `...vxp0rj`, so a bare `[A-Za-z][A-Za-z ]*[A-Za-z]` matches from the `rj`
  // and returns "rj RAZORPAY SOFTWARE ...". Still a literal substring, so
  // grounding would not have caught it — a hint has to name the party, not the
  // tail of the reference beside it.
  for (const match of narration.match(/(?<![A-Za-z0-9])[A-Za-z][A-Za-z ]*[A-Za-z](?![A-Za-z0-9])/g) ??
    []) {
    const words = match.split(" ").filter((w) => w.length > 0);
    if (!words.some((w) => w.length >= 3 && !isStop(w))) continue;
    if (best === null || match.length > best.length) best = match;
  }
  return best;
}

/**
 * The `offline` provider's `R1` — `ARCHITECTURE.md §6.5`'s *"regex battery"*.
 *
 * Deterministic and total: the same narration always yields the same output, and
 * every emitted string is a slice of the input, so `groundR1` cannot fail on
 * this provider's own output. That is asserted as a property, not assumed.
 */
export function offlineR1(input: R1Input): R1Output {
  const tokens = tokenize(input.narration);
  const utr: string[] = [];
  const refs: string[] = [];

  for (const token of tokens) {
    if (isStop(token) || !hasDigit(token)) continue;
    if (token.length >= UTR_MIN_LENGTH) {
      if (!utr.includes(token)) utr.push(token);
    } else if (token.length >= REFERENCE_MIN_LENGTH) {
      if (!refs.includes(token)) refs.push(token);
    }
  }

  return R1OutputSchema.parse({
    utr_candidates: utr,
    counterparty_hint: counterpartyHint(input.narration),
    reference_hints: refs,
  });
}

/**
 * Every string in an `R1` response that `§4` boundary 2 requires to be grounded.
 *
 * All three fields, because all three are *extracted* from the narration.
 */
export function groundR1(value: R1Output, narration: string): GroundingCheck {
  const extracted: { value: string; path: string }[] = [];
  value.utr_candidates.forEach((v, i) => {
    extracted.push({ value: v, path: `$.utr_candidates[${String(i)}]` });
  });
  value.reference_hints.forEach((v, i) => {
    extracted.push({ value: v, path: `$.reference_hints[${String(i)}]` });
  });
  if (value.counterparty_hint !== null) {
    extracted.push({ value: value.counterparty_hint, path: "$.counterparty_hint" });
  }
  return groundInSource(extracted, narration);
}
