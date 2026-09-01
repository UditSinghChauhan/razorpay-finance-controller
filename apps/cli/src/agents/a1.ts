import type { Agent, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";

/**
 * `A1-NOVALIDATE` — ASSAY with stage `S5`'s invariants `I1`-`I9` removed.
 *
 * `EVALUATION_SPEC.md §3.2`: *"The deterministic validator prevents real
 * financial error. Expected: higher `balance_harm_inr`, hallucinated IDs
 * admitted, trial balance breaks, runs end `BLOCKED`."*
 *
 * ## This is not implemented, and the reason is a governance gap rather than
 * ## missing plumbing
 *
 * For `A1` to be a real ablation rather than a relabeled `ASSAY`, some decision
 * that `I1`-`I9` would reject has to be able to reach the ledger anyway — that
 * is what *"hallucinated IDs admitted"* and *"trial balance breaks"* describe.
 * The write path this file would have to call to do that does not exist:
 *
 * - `postValidatedDecision` (`packages/ledger`) accepts **only** a
 *   `ValidatedDecision`.
 * - `ValidatedDecision` (`packages/ledger/src/validated-decision.ts`) can be
 *   **constructed only inside `packages/engine/src/s5-validate.ts`**, by a
 *   non-exported unique-symbol brand with **no exported constructor** anywhere
 *   else. `packages/ledger/src/index.ts` exports the *type*, never a builder.
 * - `validate()` itself (`packages/engine/src/s5-validate.ts`) has **no
 *   parameter to skip or downgrade a check** — every invariant runs
 *   unconditionally over `I1`-`I8`, plus `I9` when both root hashes are
 *   supplied — and a failing input returns `{ valid: false }`, never a branded
 *   value. `packages/engine/src/index.ts` exports `validate` and nothing that
 *   widens past it.
 *
 * This is `DECISION_BRIEF.md §L.1` rule 4, verbatim: *"Only stage S5 may
 * construct a `ValidatedDecision`; `packages/ledger` exposes exactly one write
 * path and accepts only that type ... Enforcement is a non-exported
 * unique-symbol brand with no exported constructor."* `§L.1` is titled
 * *"Invariants that may never be violated"*, and this is one of the twelve on
 * it — not an oversight this file can route around.
 *
 * **What was checked before concluding this, so the claim above is not a
 * paraphrase relied on secondhand:** `packages/engine/src/index.ts`'s full
 * export list (no alternate `S5` entry point); `packages/ledger/src/index.ts`
 * (exports `type ValidatedDecision`, never a constructor, and exactly the one
 * `postValidatedDecision` write path); `s5-validate.ts`'s `validate()` in full
 * (`i1` through `i8` run unconditionally, `i9` is conditional on two supplied
 * hashes, and no argument disables any of them); and `docs/` grepped for
 * `NOVALIDATE` (`PROJECT_SPEC.md` lines 22, 32, 334, 402; `PREREGISTRATION.md`
 * line 936; `DECISION_BRIEF.md` lines 2137, 2758) — every hit states that `A1`
 * is a required Tier-0 ablation with a stated hypothesis, and none licenses a
 * second construction route for `ValidatedDecision` or a skip mode for
 * `validate()`.
 *
 * **What implementing this without weakening rule 4 would require, and why it
 * is not done here.** The only route into the ledger is a `ValidatedDecision`
 * that `validate()` refuses to mint for an invariant-failing input. Building one
 * anyway means either a second constructor for the type (voids the brand: any
 * caller could then mint one, not just `A1`) or a skip-checks mode inside
 * `validate()` itself (weakens the one gate every other agent — `ASSAY`
 * included — relies on to keep `§7`'s *"any invariant failure rejects the
 * allocation ... never partially posted, never repaired, never downgraded to a
 * warning"* true). Both are changes to `packages/engine/src/s5-validate.ts`'s
 * frozen enforcement mechanism, not to this file, and both are far larger and
 * more dangerous than one ablation: `RECONCILIATION_SPEC.md §7` calls `S5` *"the
 * only code path that may post to the ledger"*, for every agent, not for `A1`
 * conditionally. Resolving this is a specification amendment — the register
 * would need an entry the shape of M49's S4/journal seam fix: naming a second,
 * explicitly-scoped construction route (or a parameterised `validate()` that
 * still enforces `§L.1` rule 4 for every *other* caller), ratified in
 * `DECISION_BRIEF.md §L.1` itself, before any code changes. That amendment is
 * out of scope here and is not attempted.
 *
 * **What this file deliberately does not do.** It does not add a bypass flag to
 * `validate()`. It does not add a second `ValidatedDecision` constructor. It
 * does not call `ASSAY` unchanged and claim the ablation is implemented — a
 * rigged ablation would misrepresent an unremoved component as removed, which
 * is worse than reporting the gap: `EVALUATION_SPEC.md §3.2` makes exactly this
 * point about `A3` — *"a rigged ablation is worse than no ablation, because it
 * converts a real result into a fabricated one"* — and the same reasoning binds
 * `A1`.
 */
export const a1Agent: Agent = {
  id: "A1-NOVALIDATE",
  async run(): Promise<AgentRun> {
    throw new AgentUnavailableError(
      "A1-NOVALIDATE",
      "packages/ledger's ValidatedDecision constructor, which packages/engine/src/s5-validate.ts " +
        "holds exclusively via a non-exported unique-symbol brand with no exported alternate route",
      "DECISION_BRIEF.md §L.1 rule 4 (\"Invariants that may never be violated\"); " +
        "ARCHITECTURE.md §4 boundary 3; RECONCILIATION_SPEC.md §7",
      "A1-NOVALIDATE requires a decision that stage S5's invariants I1-I9 would reject to reach " +
        "the ledger anyway, but the only write path (postValidatedDecision) accepts only a " +
        "ValidatedDecision, and that type can be constructed nowhere but inside a passing call to " +
        "validate() itself -- there is no skip-checks parameter and no second constructor. " +
        "Implementing this ablation without inventing an unsanctioned bypass would mean weakening " +
        "DECISION_BRIEF.md §L.1 rule 4 for every agent, which is a specification amendment (of the " +
        "shape M49's S4/journal seam fix took), not an apps/cli change, and is not attempted here.",
    );
  },
};
