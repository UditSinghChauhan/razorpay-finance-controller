import type { Agent, AgentInput, AgentRun } from "@assay/eval";

import { runAssayAblation } from "./assay.js";

/**
 * `A1-NOVALIDATE` — ASSAY with stage `S5`'s allocation-scoped invariant
 * evaluation removed.
 *
 * `EVALUATION_SPEC.md §3.2`: *"The deterministic validator prevents real
 * financial error."* Expected: higher `balance_harm_inr` and
 * `misdirected_value_inr`, hallucinated IDs admitted, and allocations `S5` would
 * have rejected **committed** rather than routed to an `E05` exception.
 *
 * **Built at spec 1.4.31 on register row `DATA_MODEL.md §22.2` M50**, which
 * settled the governance question this file previously reported as a blocker.
 * The row ratifies three things and this file depends on all of them:
 *
 * 1. *"Removed"* means `S5` **does not evaluate** the allocation-scoped set
 *    `I1`–`I8`. It does **not** mean *"evaluate and ignore the failures"* — an
 *    evaluated failure must be recorded in `invariants_failed`, and gate `G5`
 *    refuses to post an allocation carrying one, at the write path and again at
 *    close. So this agent records `invariants_checked: []` and
 *    `invariants_failed: []`, the second empty **because nothing was evaluated
 *    rather than because nothing failed**.
 * 2. `DECISION_BRIEF.md §L.1` rule 4's M50 clause permits `validate()` to take
 *    the evaluated set as a parameter, **defaulting to the full set**, with the
 *    empty set selectable **only from this file** — allowlisted by path in
 *    `eslint.config.js`, the mechanism rules 3 and 4 already use. The
 *    `"NONE_A1_NOVALIDATE"` literal below is the one occurrence in the
 *    repository outside `packages/engine`'s own declaration, and lint fails the
 *    build on any other.
 * 3. `RECONCILIATION_SPEC.md §10.1`'s clarified `G5` asserts that no allocation
 *    with a **recorded** failure was posted, and does not assert that any
 *    invariant was evaluated. `Decision.invariants_checked` is where that shows,
 *    which is why the removal is **visible in the artifact** rather than
 *    inferred from the agent's name.
 *
 * **This is a configuration flag over `assay.ts`, not a fork** — the treatment
 * `a2.ts` and `a3.ts` already receive, and what `EVALUATION_SPEC.md §3.2`
 * requires to keep an ablation a valid control: *"an ablation differs from ASSAY
 * in exactly one respect, so the difference is attributable."* Every other
 * component is `ASSAY`'s own: `S0`–`S4`, the `§6.2` probe loop, `R1`–`R3`, the
 * provider selection, `journalFor`'s posting rules, the single write path, and
 * the `G1`–`G5` close gate.
 *
 * **What is NOT removed, and could not be.** `packages/ledger` is untouched by
 * M50 and by this file. `I1` is re-checked on the **cumulative totals at every
 * append**, independently of `S5`, so the trial balance cannot break; `G5`
 * still runs; `G1`–`G4` still run; and the `ValidatedDecision` brand still has
 * exactly one construction route, the single widening assertion inside
 * `packages/engine/src/s5-validate.ts`. This agent mints through that route like
 * every other, and no second constructor exists for it to use.
 *
 * **Two consequences of that, both disclosed rather than discovered.** `A1`
 * reaches `CLOSED` or `OPEN` like every other agent and **not** `BLOCKED` —
 * spec 1.4.31 withdrew that expectation, because `EVALUATION_SPEC.md §2`, `§4.9`
 * and metric 14 all forbid it and a `BLOCKED` run is marked `invalid`, which
 * would forfeit the very figure `PROJECT_SPEC.md §7` **S6** asks this ablation
 * for. And `A1`'s harm is a **conservative lower bound** on the cost of removing
 * validation, because the ledger-side enforcement above keeps intercepting what
 * it always did: `PREREGISTRATION.md §10` **V26** records it, and no claim that
 * `A1` reproduces a fully unvalidated ledger may be made.
 *
 * **`I9` is untouched and is not part of the removal.** It is run-scoped and
 * `RECONCILIATION_SPEC.md §7` folds it in *"only when the caller supplies both
 * hashes"*; `assay.ts` supplies neither, for `ASSAY` and for `A1` alike.
 */
export const a1Agent: Agent = {
  id: "A1-NOVALIDATE",
  run(input: AgentInput): Promise<AgentRun> {
    return runAssayAblation(input, {
      agentId: "A1-NOVALIDATE",
      // The one respect in which this agent differs from ASSAY. Lint permits
      // this literal in this file and nowhere else (M50; §L.1 rule 4).
      invariantSelection: "NONE_A1_NOVALIDATE",
    });
  },
};
