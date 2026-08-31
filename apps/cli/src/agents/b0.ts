import type { Agent, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";

/**
 * `B0-IDONLY` — exact join on `settlement_id` and normalized UTR.
 *
 * `EVALUATION_SPEC.md §3.1`: *"A competent scripted reconciliation … It is
 * genuinely optimal on clean data; its failure mode is coverage, not error. The
 * honest floor."* Everything it cannot join becomes an exception.
 *
 * **Its blocker is narrower than ASSAY's, and the difference is real.** It runs
 * no engine stage — no candidate generation, no decomposition, no solve, no
 * `S5` — so `packages/domain`'s `S0` and `packages/engine`'s `S1->S2` seam are
 * not on its path. What it still cannot do is finish a run: `AgentRun` carries a
 * `CloseOutcome`, `EVALUATION_SPEC.md §2` requires that *"Every run attempts a
 * period close"*, and `RECONCILIATION_SPEC.md §10.1`'s `G1`-`G5` live in
 * `packages/ledger`'s unwritten `close-gate.ts`. Posting its exceptions needs
 * the same package's single write path.
 *
 * Naming the narrower blocker rather than ASSAY's is not a detail: `§3.1` calls
 * this baseline *"the honest floor"*, and a floor that appeared to need the
 * whole architecture would misstate what it measures.
 */
export const b0Agent: Agent = {
  id: "B0-IDONLY",
  async run(): Promise<AgentRun> {
    throw new AgentUnavailableError(
      "B0-IDONLY",
      "packages/ledger (the write path and the G1-G5 close gate)",
      "RECONCILIATION_SPEC.md §10.1; DECISION_BRIEF.md §L.1 rule 4, §L.2; " +
        "EVALUATION_SPEC.md §2",
      `the identifier join itself needs no engine stage, but a run must post its ` +
        `exceptions and attempt a period close, and close-gate.ts and close.ts are ` +
        `"deliberately absent rather than stubbed" in that package.`,
    );
  },
};
