import type { Agent, AgentInput, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";
import type { ProbeExecutor } from "../probe/surface.js";
import { runAssayAblation } from "./assay.js";

/**
 * `ASSAY-PROBE` — `A3-NOLLM` with the `§6.2` probe executor bound (bench-v2,
 * Work Order 3c; register row `DATA_MODEL.md §22.2` M63; `EVALUATION_SPEC.md
 * §3.3`).
 *
 * **It differs from `A3-NOLLM` in exactly one respect: whether the executor is
 * present.** Both force `llm_mode` to `"offline"`, so `R3` is
 * `PREREGISTRATION.md §7`'s frozen deterministic priority policy in both — not a
 * language model. With the executor absent the composition offers `R3` an empty
 * context and it can only decline; with it present `R3` is offered the
 * component's settlement ids minus those already probed, proposes the
 * lexicographically smallest, and `packages/probe` validates it under `P_max`
 * before the executor answers. Every other line of the run — `S1`–`S5`, the
 * budget, the ledger, the close gate — is `assay.ts`'s, unchanged.
 *
 * **Why it is built.** `A3-NOLLM` never dispatches a probe, so `SE5` is inert on
 * every candidate and `§6`'s evidence-gap arm cannot fire (`§10` V38); bench-v2
 * would otherwise measure abstention without ever measuring discrimination by
 * evidence. This arm is how V40's bound — `2000·(u+w)/(k+u+w)` — is measured
 * rather than only derived.
 *
 * **Binding is the composition root's.** The executor is bound to one split's
 * recon report by a command (or by a test standing in for one); this module
 * holds no path. {@link assayProbeAgent} is what `ALL_AGENTS` lists, and it
 * refuses to run unbound — a probe arm without its executor would be `A3-NOLLM`
 * under another name, scored as if it had probed.
 */
export function boundAssayProbeAgent(executor: ProbeExecutor): Agent {
  return {
    id: "ASSAY-PROBE",
    run(input: AgentInput): Promise<AgentRun> {
      return runAssayAblation(input, {
        agentId: "ASSAY-PROBE",
        llmModeOverride: "offline",
        probeExecutor: executor,
      });
    },
  };
}

/** The unbound arm, as `ALL_AGENTS` lists it. Refuses to run. */
export const assayProbeAgent: Agent = {
  id: "ASSAY-PROBE",
  run(): Promise<AgentRun> {
    return Promise.reject(
      new AgentUnavailableError(
        "ASSAY-PROBE",
        "the composition root's probe-executor binding",
        "DATA_MODEL.md §22.2 M63; PREREGISTRATION.md §6.2 AL8",
        "ASSAY-PROBE is A3-NOLLM with a probe executor bound to one split's recon report. " +
          "It must be constructed with boundAssayProbeAgent(reconReportExecutor(<path>)) by a " +
          "command; run unbound it would be A3-NOLLM under another name.",
      ),
    );
  },
};
