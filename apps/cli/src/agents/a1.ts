import type { Agent, AgentRun } from "@assay/eval";

import { assayPipelineBlocker } from "./assay.js";

/**
 * `A1-NOVALIDATE` — ASSAY with stage `S5`'s invariants `I1`-`I9` removed.
 *
 * `EVALUATION_SPEC.md §3.2`: *"The deterministic validator prevents real
 * financial error. Expected: higher `balance_harm_inr`, hallucinated IDs
 * admitted, trial balance breaks, runs end `BLOCKED`."*
 *
 * The removal is a **configuration flag over `assay.ts`**, not a fork, and the
 * shared blocker below is part of how that stays true: an ablation that named a
 * different dependency set would already differ from ASSAY in a second respect,
 * which `§3.2` says would invalidate it as a control.
 */
export const a1Agent: Agent = {
  id: "A1-NOVALIDATE",
  async run(): Promise<AgentRun> {
    throw assayPipelineBlocker("A1-NOVALIDATE", "stage S5's invariants I1-I9");
  },
};
