import type { Agent, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";

/**
 * `B1-GREEDY` — first-fit greedy subset match on amount within a +/-3-day window.
 *
 * **Declared, and deliberately not built.** `EVALUATION_SPEC.md §3.1` marks it
 * *"(stretch — `DECISION_BRIEF.md §H`, tier H2)"* and `§2`'s protocol loop reads
 * `for agent in {ASSAY, B0, B2, A1, A2, A3} (+ B1 if built)`. `packages/eval`'s
 * `AGENTS` records the same fact as data, `inTier0: false`.
 *
 * **This is a different status from the other six and the message says so.**
 * They are blocked on a package; this one is out of Tier-0 scope, and `§3.1`
 * gives the reason in its own terms: *"Omitted from Tier-0 because the ablations
 * carry the argument; its absence weakens breadth, not validity."* The file
 * exists because `DECISION_BRIEF.md §K` lists it and because a row recorded as
 * data is clearer than a gap — *"its absence weakens breadth, not validity"* is
 * a claim a reader should be able to check against the code.
 */
export const b1Agent: Agent = {
  id: "B1-GREEDY",
  async run(): Promise<AgentRun> {
    throw new AgentUnavailableError(
      "B1-GREEDY",
      "DECISION_BRIEF.md §H tier H2 (out of Tier-0 scope)",
      "EVALUATION_SPEC.md §3.1, §2; packages/eval AGENTS.inTier0 === false",
      `it is a declared stretch baseline and is not blocked on any package: §3.1 omits it ` +
        `from Tier-0 "because the ablations carry the argument; its absence weakens breadth, ` +
        `not validity", and §2's loop reads "(+ B1 if built)".`,
    );
  },
};
