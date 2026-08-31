import type { Agent, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";

/**
 * `B2-LLM-DIRECT` — the batch chunked into the context window, the model asked
 * for the allocation JSON, the output accepted.
 *
 * `EVALUATION_SPEC.md §3.1` calls it *"**The obvious build under time
 * pressure**"* and *"the fair comparison, because it is what a strong team would
 * ship in a week without ASSAY's architecture"*, given the same provider, model,
 * prompt-engineering effort and token budget as ASSAY. `§3.1` also states what
 * rides on it: *"If ASSAY cannot beat a well-prompted direct LLM on net cost,
 * the architecture is not earning its complexity, and the report must say so."*
 *
 * **Two blockers, and the second is not this repository's to clear.**
 * `packages/ledger`'s write path and close gate are unwritten, as for every
 * agent. Beyond that, `DECISION_BRIEF.md §C` T0-10 makes this baseline
 * *"conditional on F2 — it needs a live credential to populate its replay
 * cache"*, and `§F` **F2** is `Unresolved`. F2's response is pre-declared and is
 * not reopened here: *"`B2-LLM-DIRECT` was not built (deferred to H2), so the
 * 'beats the naive LLM build' claim (S7) is **not made**"*, and *"the ablations
 * A1-A3 carry the central claim on their own"*.
 *
 * Spec 1.4.29 leaves `--record` and the live recording pass exactly as F2
 * classifies them. Nothing here anticipates either branch.
 */
export const b2Agent: Agent = {
  id: "B2-LLM-DIRECT",
  async run(): Promise<AgentRun> {
    throw new AgentUnavailableError(
      "B2-LLM-DIRECT",
      "packages/ledger (the write path and the G1-G5 close gate); and DECISION_BRIEF.md §F F2",
      "DECISION_BRIEF.md §C T0-10, §F F2; RECONCILIATION_SPEC.md §10.1",
      `the provider interface exists and the ledger's write path does not; and T0-10 makes ` +
        `this baseline conditional on a metered credential, which F2 records as Unresolved ` +
        `with a pre-declared response that defers it to tier H2 rather than weakening it.`,
    );
  },
};
