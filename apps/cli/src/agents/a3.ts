import type { Agent, AgentRun } from "@assay/eval";

import { assayPipelineBlocker } from "./assay.js";

/**
 * `A3-NOLLM` — ASSAY with all four LLM roles routed to the `offline` provider.
 *
 * **`A3-NOLLM` is exactly `ASSAY --llm=offline`** (`EVALUATION_SPEC.md §3.2`),
 * which is why this file delegates to `assay.ts` rather than reimplementing
 * anything: *"the ablation and the offline demo path are the same code"*, with
 * three consequences `§3.2` states — the deterministic counterparts are built
 * properly because the demo depends on them, the ablation is exercised by the
 * normal test suite, and a rigged ablation would break the demo, so the
 * incentive runs the right way. `A3` and ASSAY's `offline_parity` (metric 24)
 * are one measurement viewed twice.
 *
 * **`llm_mode` is the whole of the difference, and it is not read here.** The
 * mode arrives on `RunConfig`, which `packages/eval` owns and the runner sets;
 * this file records what `§3.2` fixes and decides nothing about it.
 *
 * **`§7`'s `A3-NOLLM` probe priority policy is `packages/llm`'s and is frozen**
 * (spec 1.4.25, register row M39; `AL3`; `DECISION_BRIEF.md §L.1` rule 12). It
 * parameterises the control arm, so it is unadjustable on TRAIN, DEV and TEST
 * alike, and no part of it is restated or reachable here.
 *
 * **`§H` tier `H1`'s affirmative claim is withdrawn** (spec 1.4.26, M41): on the
 * conforming v1.0.0 population `R3`'s choice set is a singleton and the frozen
 * policy is weakly dominant, so *"beats a static priority list"* is
 * unfalsifiable and must not be claimed. The ablation stays valid and stays
 * reported; that disposition is not reopened here.
 */
export const a3Agent: Agent = {
  id: "A3-NOLLM",
  async run(): Promise<AgentRun> {
    throw assayPipelineBlocker("A3-NOLLM", "the LLM (all four roles routed to offline)");
  },
};
