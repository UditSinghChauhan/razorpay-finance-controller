import type { Agent, AgentRun } from "@assay/eval";

import { assayPipelineBlocker } from "./assay.js";

/**
 * `A2-NOABSTAIN` — ASSAY with abstention removed; always commits the top candidate.
 *
 * `EVALUATION_SPEC.md §3.2`: *"Abstention is worth its cost. Expected: coverage
 * 100%, sharply higher harm and net cost, Suspense near zero — the '100%
 * matched, 0 exceptions' failure mode, reproduced deliberately."* It is the
 * comparand ASSAY's headline result is drawn against, which is why it is
 * reproduced rather than described.
 *
 * The removal is a configuration flag over `assay.ts` and shares its blocker,
 * so the ablation differs from ASSAY in exactly one respect (`§3.2`).
 */
export const a2Agent: Agent = {
  id: "A2-NOABSTAIN",
  async run(): Promise<AgentRun> {
    throw assayPipelineBlocker("A2-NOABSTAIN", "abstention");
  },
};
