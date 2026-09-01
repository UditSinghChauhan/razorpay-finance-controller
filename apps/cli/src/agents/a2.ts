import type { Agent, AgentInput, AgentRun } from "@assay/eval";

import { runAssayAblation } from "./assay.js";

/**
 * `A2-NOABSTAIN` — ASSAY with abstention removed; always commits the top candidate.
 *
 * `EVALUATION_SPEC.md §3.2`: *"Abstention is worth its cost. Expected: coverage
 * 100%, sharply higher harm and net cost, Suspense near zero — the '100%
 * matched, 0 exceptions' failure mode, reproduced deliberately."* It is the
 * comparand ASSAY's headline result is drawn against, which is why it is
 * reproduced rather than described.
 *
 * **The removal is a configuration flag over `assay.ts`, not a fork.**
 * `runAssayAblation` is `assay.ts`'s own composition with `commitOnAbstain: true`
 * — the one place `classifyTarget` would otherwise return `ABSTAINED` for a
 * target `S4` marked `AMBIGUOUS`/`INTRACTABLE`, it instead falls through to the
 * same `RECONCILED` path a non-abstaining target uses, committing
 * `result.best` — S4's own top-ranked candidate, unmodified.
 *
 * **`I1`-`I9` are untouched.** The forced commit still goes through `build()` /
 * `post()` exactly like any other proposed allocation: `validate()` runs every
 * invariant over it, and a candidate that fails one still falls back to
 * `EXCEPTION` (`E05_AMOUNT_MISMATCH`) — that is ordinary invariant rejection,
 * not abstention, and is out of this ablation's scope to change.
 *
 * **No candidate to commit stays no candidate to commit.** When `S4` finds no
 * feasible solution at all (`result.best === null` — `INTRACTABLE` via
 * `exceeds_k_max`, or a truncated `C_max` enumeration that produced nothing),
 * there is nothing for A2 to force through, and the target falls to `§9`'s "no
 * admissible candidate exists at all" `EXCEPTION`, exactly as it would for
 * `ASSAY`.
 */
export const a2Agent: Agent = {
  id: "A2-NOABSTAIN",
  run(input: AgentInput): Promise<AgentRun> {
    return runAssayAblation(input, { agentId: "A2-NOABSTAIN", commitOnAbstain: true });
  },
};
