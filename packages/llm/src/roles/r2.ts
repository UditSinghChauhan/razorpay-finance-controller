import { EXCEPTION_CLASSES, type ExceptionClass } from "@assay/ledger";
import { z } from "zod";

import type { R2Input } from "../provider.js";

/**
 * `R2 · classify_exception` (`ARCHITECTURE.md §6`).
 *
 * *"Input: structured exception summary (constraint violations, component
 * shape, amounts as opaque references). Output: one enum from a fixed taxonomy +
 * evidence IDs + the analyst-facing question."*
 *
 * *"If wrong or hostile: misroutes an exception in a queue a human reads. **Zero
 * financial impact.** Misclassification rate is measured."* — metric 10,
 * `exception_class_confusion`.
 *
 * **`E12_ADJUSTMENT_UNEXPLAINED` is unreachable from here, deliberately.**
 * `PREREGISTRATION.md §8` metric 10 excludes it from the confusion matrix
 * because it is *"raised by the `DATA_MODEL.md §17.2` fallback"* and *"a
 * deterministic assignment is not a classification judgement and counting it
 * would inflate apparent triage accuracy"*. A class the metric refuses to score
 * is a class this role must not emit, or the exclusion is undone at the source.
 * The **schema** still admits all fourteen — `§15` says
 * *"`classify_exception` cannot emit anything else"*, which bounds the taxonomy
 * from above and does not license narrowing the declared type.
 */

/**
 * `R2`'s response schema. **No number-typed field** (`§L.1` rule 2).
 *
 * `z.enum(EXCEPTION_CLASSES)` reads the frozen tuple from `@assay/ledger` rather
 * than re-spelling fourteen strings, so the closed taxonomy of `§15` cannot
 * drift between the class list and the schema that constrains the model to it.
 */
export const R2OutputSchema = z.strictObject({
  exception_class: z.enum(EXCEPTION_CLASSES),
  evidence_obs_ids: z.array(z.string().min(1)).readonly(),
  analyst_question: z.string().min(1),
});

export type R2Output = z.infer<typeof R2OutputSchema>;

/** `DATA_MODEL.md §19`'s `system_prompt_id`, versioned and cache-stable. */
export const R2_SYSTEM_PROMPT_ID = "r2_classify_exception.v1";

/**
 * Which rung of the offline ladder fired.
 *
 * Returned alongside the class so the baseline is auditable: metric 10 compares
 * this classifier against the generator's known cause, and a confusion matrix is
 * far more useful when the losing rule can be named.
 */
export type OfflineRule =
  | "I3_LINE_ARITHMETIC"
  | "I4_SETTLEMENT_SHORTFALL"
  | "REFUND_PARENT_ABSENT"
  | "LEDGER_ENTRY_NO_COUNTERPART"
  | "TEMPORAL_OUT_OF_WINDOW"
  | "SETTLEMENT_NOT_IN_BANK"
  | "C6_TIE_OUT"
  | "BANK_LINE_UNMATCHED"
  | "DEFAULT_BY_TARGET_KIND";

/** The offline classifier's verdict, with the rung that produced it. */
export interface OfflineClassification {
  readonly exception_class: ExceptionClass;
  readonly rule: OfflineRule;
}

/**
 * The `offline` provider's `R2` — `ARCHITECTURE.md §6.5`'s
 * *"decision-tree classifier"*.
 *
 * **Every rung cites the frozen sentence that fixes it.** `§6` justifies the
 * *model's* version of this role by *"the discriminating signal is frequently a
 * **combination** of weak cues"*; the deterministic baseline is the ordered
 * ladder below, and where the corpus does not determine a mapping the ladder
 * falls through rather than guessing.
 *
 * ```
 *   1  I3 failed                    E06  §15: "credit != amount - fee" IS I3's
 *                                        identity, restated as a class
 *   2  I4 failed, settlement target E01  §4.2 via the generator's own test:
 *                                        "I4 fails ... because the settlement's
 *                                        amount exceeds the sum of the lines it
 *                                        can see, which is E01"
 *   3  refund member, I6 or C2 fail E10  §12: the result payment_id is consumed
 *                                        by "C2's referential half and
 *                                        E10_REFUND_ORPHAN"; engine README: the
 *                                        parent's absence "is E10, not a C2
 *                                        exclusion"
 *   4  ledger_entry involved        E13  §3 (spec 1.4.1): "Every merchant ledger
 *                                        entry therefore reaches E13"
 *   5  C4 or I8 failed              E11  §15: "Event falls outside the period";
 *                                        C4 is the settlement window, I8 the
 *                                        temporal invariant
 *   6  settlement, no AN2 match     E04  §15: "Settlement marked processed, no
 *                                        bank credit"
 *   7  C6 failed                    E05  §15: "Tie-out fails by a non-zero
 *                                        delta"; C6 IS the exact tie-out
 *   8  bank_line target             E03  §10 V19: "Each unanchored line reaches
 *                                        E03"
 *   9  otherwise, by target kind         documented default, never a guess at a
 *                                        class the corpus does not reach
 * ```
 *
 * `E02` is the fall-through for a settlement target that reached none of the
 * above — `§15`: *"Captured and past the settlement window, never settled"*, and
 * the engine README's *"an unsettled capture remains `E02`"*. `E07`, `E08`,
 * `E09`, `E12` and `E14` are **not reachable here**: `§T6` gives `E07` its own
 * arithmetic re-check, `§8` rule 1 puts `E08` at ingest, the engine's `S1` owns
 * `E09` and `E14`, and `E12` is excluded above.
 */
export function classifyOffline(input: R2Input): OfflineClassification {
  const constraints = new Set(input.failed_constraints);
  const invariants = new Set(input.failed_invariants);
  const kinds = new Set(input.member_kinds);

  if (invariants.has("I3")) {
    return { exception_class: "E06_FEE_MISMATCH", rule: "I3_LINE_ARITHMETIC" };
  }
  if (invariants.has("I4") && input.target_kind === "settlement") {
    return { exception_class: "E01_MISSING_CAPTURE", rule: "I4_SETTLEMENT_SHORTFALL" };
  }
  if (kinds.has("refund") && (invariants.has("I6") || constraints.has("C2"))) {
    return { exception_class: "E10_REFUND_ORPHAN", rule: "REFUND_PARENT_ABSENT" };
  }
  if (kinds.has("ledger_entry") || input.target_kind === "ledger_entry") {
    return { exception_class: "E13_LEDGER_ONLY", rule: "LEDGER_ENTRY_NO_COUNTERPART" };
  }
  if (constraints.has("C4") || invariants.has("I8")) {
    return { exception_class: "E11_TIMING_BOUNDARY", rule: "TEMPORAL_OUT_OF_WINDOW" };
  }
  if (input.target_kind === "settlement" && !input.bank_matched) {
    return { exception_class: "E04_SETTLEMENT_NOT_IN_BANK", rule: "SETTLEMENT_NOT_IN_BANK" };
  }
  if (constraints.has("C6")) {
    return { exception_class: "E05_AMOUNT_MISMATCH", rule: "C6_TIE_OUT" };
  }
  if (input.target_kind === "bank_line") {
    return { exception_class: "E03_BANK_CREDIT_UNMATCHED", rule: "BANK_LINE_UNMATCHED" };
  }
  return {
    exception_class:
      input.target_kind === "settlement" ? "E02_MISSING_SETTLEMENT" : "E05_AMOUNT_MISMATCH",
    rule: "DEFAULT_BY_TARGET_KIND",
  };
}

/**
 * The analyst-facing question, per class.
 *
 * `DATA_MODEL.md §14`: *"An exception with no `owner_role` and no
 * `analyst_question` is not an exception, it is a shrug."* The offline form is a
 * template — `§6` concedes that writing this well *"is generation, not
 * classification"*, which is precisely the claim metric 10 and `offline_parity`
 * are there to test rather than assume.
 *
 * **No template contains a numeral.** `§4` boundary 2's grounding rule binds
 * `R4` rather than `R2`, but a rupee figure invented by this role would be a
 * number in a model-shaped output either way, and `§L.1` rule 2's purpose is
 * that no such numeral exists to be echoed. Quantities are referred to by name
 * and looked up downstream.
 */
const QUESTION_TEMPLATES: Readonly<Record<ExceptionClass, string>> = Object.freeze({
  E01_MISSING_CAPTURE:
    "This settlement is larger than the capture lines visible for it. Confirm whether a capture record is missing from the recon export or the settlement was funded from a batch outside this period.",
  E02_MISSING_SETTLEMENT:
    "This capture is past its settlement window with no settlement recorded. Confirm whether the settlement is delayed, was withheld, or landed in a later batch.",
  E03_BANK_CREDIT_UNMATCHED:
    "This bank credit matches no known settlement. Confirm whether it belongs to this merchant account and, if so, which settlement batch funded it.",
  E04_SETTLEMENT_NOT_IN_BANK:
    "This settlement is marked processed but no bank credit carries its reference. Confirm whether the credit is in transit, was returned, or arrived under a different reference.",
  E05_AMOUNT_MISMATCH:
    "The tie-out for this item does not close. Confirm which side is authoritative before any adjustment is booked.",
  E06_FEE_MISMATCH:
    "The fee identity does not hold on this line. Confirm whether the pricing in force differs from the one applied, or the line was edited after export.",
  E07_GST_MISMATCH:
    "The tax component inside the fee does not reconcile. Confirm the GST rate applied to this line against the pricing in force.",
  E08_DUPLICATE_OBSERVATION:
    "This entity appears twice from one source. Confirm which record is authoritative and whether the export was run twice.",
  E09_DUPLICATE_BANK_CREDIT:
    "One settlement reference carries two bank credits. Confirm whether the second is a genuine second credit or a duplicated statement row.",
  E10_REFUND_ORPHAN:
    "This refund names a parent payment that is not in the dataset. Confirm whether the parent is outside the period or the reference is wrong.",
  E11_TIMING_BOUNDARY:
    "This item falls across the period boundary. Confirm the period it belongs to; this is a timing difference, not an error.",
  E12_ADJUSTMENT_UNEXPLAINED:
    "This adjustment has no traceable cause in the export. Confirm what it corrects before it is booked.",
  E13_LEDGER_ONLY:
    "The merchant booked this entry with no payment-gateway counterpart. Confirm whether it belongs to a different account, period, or process.",
  E14_UTR_COLLISION:
    "Several settlements share one bank reference after truncation. Confirm which settlement this credit funded before attributing it.",
} as const);

/** The analyst-facing question for one class (`DATA_MODEL.md §14`). */
export function analystQuestion(exceptionClass: ExceptionClass): string {
  return QUESTION_TEMPLATES[exceptionClass];
}

/**
 * The `offline` provider's full `R2` response.
 *
 * `evidence_obs_ids` is the call's own `amount_refs` **intersected with the
 * allowlist**, in the caller's order. The intersection is not defensive
 * decoration: `§4` boundary 2 discards any response naming an id outside the
 * allowlist, and a deterministic provider that could trip that check would make
 * `--llm=offline` fail a gate the model is supposed to be the risky side of.
 */
export function offlineR2(input: R2Input, idAllowlist: readonly string[]): R2Output {
  const allowed = new Set(idAllowlist);
  const { exception_class } = classifyOffline(input);
  return R2OutputSchema.parse({
    exception_class,
    evidence_obs_ids: input.amount_refs.filter((id) => allowed.has(id)),
    analyst_question: analystQuestion(exception_class),
  });
}

/**
 * `DATA_MODEL.md §14`'s `owner_role` has **no producer in the corpus**.
 *
 * `§14` requires it on every `Exception` and calls one without it *"a shrug"*,
 * but `ARCHITECTURE.md §6` scopes `R2`'s output to *"one enum from a fixed
 * taxonomy + evidence IDs + the analyst-facing question"* — three things, and
 * this is not among them. No other stage claims it either. It is therefore **not
 * emitted here**, and the gap is reported rather than filled by inventing a
 * fourth output field for a role whose schema `§6` states exhaustively.
 *
 * Recorded here and in this package's README, the way `packages/engine` records
 * its own — as prose, not as an exported constant standing in for prose.
 */
