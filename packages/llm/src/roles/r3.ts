import { z } from "zod";

import type { R3Input } from "../provider.js";

/**
 * `R3 · propose_probe` (`ARCHITECTURE.md §6`).
 *
 * *"Input: the ambiguity certificate + list of available probes. Output: one
 * call from a closed enum with allowlisted arguments, or `NO_USEFUL_PROBE`."*
 *
 * *"Why not a rule: this is sequential decision-making under uncertainty — which
 * single lookup, out of many, most reduces ambiguity here. A static priority
 * list is the deterministic baseline and it is measured against this
 * (`abstentions resolved per probe spent`). If the static list wins, we say
 * so."*
 *
 * *"If wrong or hostile: wastes probe budget (hard-capped at 3 per component).
 * All probes are read-only and allowlisted, so a hostile choice cannot reach an
 * unintended target."*
 *
 * ## Two things this file must get right, and why
 *
 * **1. No numeric field, and therefore only four probes.** `DECISION_BRIEF.md
 * §L.1` rule 2 forbids a numeric field in any LLM output schema and is listed
 * among *"invariants that may never be violated"*. `widen_temporal_window`'s
 * only argument is `days`, typed `integer > 0` by `DATA_MODEL.md §12`, so it
 * cannot appear in this schema. Whether `R3` may propose it was expressly
 * unsettled at `RECONCILIATION_SPEC.md §6.2`, `THREAT_MODEL.md §T7` and register
 * row M33; spec 1.4.25 (M40) settles it in the negative, because a settled
 * invariant governs an unsettled question. **The executor's enum is still five**
 * — `packages/domain`'s `PROBE_KINDS` and `packages/probe`'s `validate` are
 * unchanged — and only what one proposer may name is narrowed.
 *
 * **2. `offlineR3` is a pre-registered control, not an implementation detail.**
 * `ARCHITECTURE.md §6.5` calls it a *"static probe priority list"* and `§6.2`
 * makes it the comparand of the `A3-NOLLM` comparison. `PREREGISTRATION.md §7`
 * freezes it, `AL3` binds it and `DECISION_BRIEF.md §L.1` rule 12 lists it, so
 * `§L.4` forbids revising it from an observed result — on TRAIN, DEV and TEST
 * alike. **Nothing in this file may be tuned.**
 */

// ---------------------------------------------------------------------------
// Output schema — §L.1 rule 2: every field is a string
// ---------------------------------------------------------------------------

/**
 * `R3`'s response schema. **No number-typed field** (`§L.1` rule 2).
 *
 * Four id-argument probes plus the decline, in `RECONCILIATION_SPEC.md §6.2`'s
 * own declaration order — which is deliberately **not** the `A3-NOLLM` priority
 * order below. Conflating a declaration order with a policy order is how a
 * frozen parameter drifts into a schema that nobody thinks of as one.
 *
 * `date` is an **opaque string** and this package never parses it.
 * `DATA_MODEL.md §22.2` M31 leaves the field a query is date-scoped on
 * undecided, and on spec 1.4.22's committed surface `settlement_id` is the only
 * query key — so the argument reaches only the `PROBE` event's `inputs_hash`.
 * M31 is **not** resolved here.
 */
export const R3OutputSchema = z.discriminatedUnion("probe", [
  z.strictObject({
    probe: z.literal("fetch_order"),
    order_id: z.string().min(1),
  }),
  z.strictObject({
    probe: z.literal("fetch_payment"),
    payment_id: z.string().min(1),
  }),
  z.strictObject({
    probe: z.literal("fetch_refund"),
    refund_id: z.string().min(1),
  }),
  z.strictObject({
    probe: z.literal("fetch_settlement_recon"),
    settlement_id: z.string().min(1),
    date: z.string().min(1),
  }),
  z.strictObject({
    probe: z.literal("NO_USEFUL_PROBE"),
  }),
]);

export type R3Output = z.infer<typeof R3OutputSchema>;

/** `DATA_MODEL.md §19`'s `system_prompt_id`, versioned and cache-stable. */
export const R3_SYSTEM_PROMPT_ID = "r3_propose_probe.v1";

// ---------------------------------------------------------------------------
// The frozen A3-NOLLM policy — PREREGISTRATION.md §7, register row M39
// ---------------------------------------------------------------------------

/**
 * `PREREGISTRATION.md §7`'s frozen priority order, verbatim.
 *
 * ```
 *   priority order      1. fetch_settlement_recon
 *                       2. fetch_payment
 *                       3. fetch_order
 *                       4. fetch_refund
 *                       widen_temporal_window is NOT proposable (M40)
 * ```
 *
 * **Frozen at spec 1.4.25, before `R3` existed in either arm and before any H1,
 * dev or benchmark figure was produced.** `AL3` binds it; `DECISION_BRIEF.md
 * §L.1` rule 12 lists it; `§L.4` forbids changing it on the basis of an observed
 * result. Unlike the `SE1`–`SE5` weights it is **not** adjustable on TRAIN or
 * DEV, because it parameterises the control arm rather than the system under
 * test.
 */
export const R3_PROBE_PRIORITY = Object.freeze([
  "fetch_settlement_recon",
  "fetch_payment",
  "fetch_order",
  "fetch_refund",
] as const);

/** One of the four probes the frozen policy ranks. */
export type R3PriorityProbe = (typeof R3_PROBE_PRIORITY)[number];

/**
 * The `offline` provider's `R3` — `PREREGISTRATION.md §7`'s policy, executed.
 *
 * ```
 *   argument selection  the LEXICOGRAPHICALLY SMALLEST eligible argument for
 *                       that probe kind. Never enumeration order, never
 *                       wall-clock order, never derived from model output.
 *
 *   stop rule           the first probe in priority order for which a
 *                       constructible, valid argument exists; if none exists,
 *                       NO_USEFUL_PROBE.
 * ```
 *
 * **Eligibility is the caller's, and deliberately so.** `§7` defines an eligible
 * argument as one *"present in the call's available-probe context"* that passes
 * *"the already-frozen deterministic validity and pre-call `I6` checks"*. The
 * composition root builds that context from the component and filters it; this
 * function selects within it. Two consequences the comparison depends on: the
 * context is built **before** a provider is chosen, so both arms see byte-identical
 * input, and `packages/probe` still runs pre-call `I6` **independently**
 * afterwards, as `§L.1` rule 8 requires (*"independently of any allowlist
 * check"*).
 *
 * **Deterministic by construction.** `Array.prototype.sort` on strings with an
 * explicit comparator, no clock, no randomness, no `Map` iteration order in the
 * result path. Two calls on equal input return equal output, which is what
 * metric 23 requires of everything reaching a hashed body.
 */
export function offlineR3(input: R3Input): R3Output {
  for (const probe of R3_PROBE_PRIORITY) {
    const available = input.available_probes.find((p) => p.probe === probe);
    if (available === undefined) continue;

    const smallest = lexicographicallySmallest(available.argument_ids);
    if (smallest === null) continue;

    switch (probe) {
      case "fetch_settlement_recon":
        return R3OutputSchema.parse({
          probe,
          settlement_id: smallest,
          date: input.recon_date_scope,
        });
      case "fetch_payment":
        return R3OutputSchema.parse({ probe, payment_id: smallest });
      case "fetch_order":
        return R3OutputSchema.parse({ probe, order_id: smallest });
      case "fetch_refund":
        return R3OutputSchema.parse({ probe, refund_id: smallest });
    }
  }
  return R3OutputSchema.parse({ probe: "NO_USEFUL_PROBE" });
}

/**
 * The lexicographically smallest member, or `null` for an empty list.
 *
 * `localeCompare` is **not** used: it is locale- and ICU-version-dependent, and a
 * benchmark whose control arm reorders with the host's locale data is not
 * reproducible. `<` on strings compares UTF-16 code units, which is total and
 * fixed.
 */
function lexicographicallySmallest(ids: readonly string[]): string | null {
  let smallest: string | null = null;
  for (const id of ids) {
    if (smallest === null || id < smallest) smallest = id;
  }
  return smallest;
}
