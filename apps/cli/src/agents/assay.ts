import type { Agent, AgentRun } from "@assay/eval";

import { AgentUnavailableError } from "../errors.js";

/**
 * `ASSAY` — the system under test, composed here (spec 1.4.29, M47).
 *
 * `ARCHITECTURE.md §10` gives every agent one interface — *"Observations ->
 * Decisions + Ledger"* — and `EVALUATION_SPEC.md §3.2` states why that matters:
 * an ablation is a control only while it *"differs from ASSAY in exactly one
 * respect, so the difference is attributable"*, which is false the moment an
 * ablation is a second codebase. So `ASSAY` is the composition, and `a1.ts`,
 * `a2.ts` and `a3.ts` are this file with one component removed.
 *
 * **Why this file is here and not in `packages/eval`.** `DECISION_BRIEF.md §K`
 * placed it there, and an ASSAY agent cannot live there: it composes
 * `packages/engine` (S1-S5), `packages/llm` (R1-R4), `packages/probe` (`§6.2`'s
 * loop) and `packages/ledger`, and `eslint.config.js` refuses the first three
 * anywhere under `packages/eval/`. Register row **M37** had already ratified the
 * reason at spec 1.4.23 — *"hosting the run loop there would put the system
 * under test inside the thing measuring it"* — and `§K` never absorbed it. The
 * agent is therefore constructed in the composition root and **injected**;
 * `packages/eval` imports nothing new.
 *
 * **The pipeline is not implemented here and no part of it is worked around.**
 * `ARCHITECTURE.md §3` assigns every stage to a package and four of them are
 * unwritten, in pipeline order:
 *
 * ```
 *   S0 ingest    packages/domain owns S0's orchestration over source data
 *                (spec 1.4.18, M32); §3 records it "SCHEDULED, NOT WRITTEN".
 *   S1 -> S2     packages/engine exports the five stages and NO constructor for
 *                S2's Target or EvaluationContext from S1's AnchorResult.
 *                Target.bank_value_date and anchored_members are readings of
 *                §3's anchor semantics; deriving them here would put S1/S2
 *                semantics in apps/cli, which ARCHITECTURE.md §3 forbids.
 *   ledger write DECISION_BRIEF.md §L.1 rule 4 gives packages/ledger "exactly
 *                one write path"; ValidatedDecision is declared and the mutating
 *                path it guards is not.
 *   close gate   RECONCILIATION_SPEC.md §10.1's G1-G5; close-gate.ts and close.ts
 *                are "deliberately absent rather than stubbed" in that package,
 *                and AgentRun carries a CloseOutcome that only they produce.
 * ```
 *
 * `RECONCILIATION_SPEC.md §6.2` makes `packages/probe` *"the ONLY constructor of
 * a probe call, so a caller cannot dispatch around them"*, and the same
 * reasoning governs every row above.
 */

/**
 * The blocker `ASSAY` and its three ablations share.
 *
 * Shared rather than repeated because `§3.2`'s *"exactly one respect"* is a
 * property of the code: an ablation that named a different set of missing
 * dependencies would already differ from `ASSAY` in a second respect.
 */
export function assayPipelineBlocker(agentId: string, removed: string | null): AgentUnavailableError {
  return new AgentUnavailableError(
    agentId,
    "packages/domain (S0), packages/engine (the S1->S2 seam), packages/ledger " +
      "(the write path and the G1-G5 close gate)",
    "ARCHITECTURE.md §3, §10; DECISION_BRIEF.md §L.1 rule 4, §L.2; " +
      "RECONCILIATION_SPEC.md §10.1",
    `${removed === null ? "ASSAY" : `${agentId}, which is ASSAY with ${removed} removed,`} ` +
      `composes stages this app does not own and four of them are unwritten.`,
  );
}

export const assayAgent: Agent = {
  id: "ASSAY",
  // The input is unused: an agent that reports its blocker reads nothing. The
  // interface admits a nullary implementation for the reason `commands/bench.ts`
  // gives for the same shape.
  //
  // `async` is load-bearing rather than stylistic. `Agent.run` is typed
  // `Promise<AgentRun>` and the runner that will inject these is a promise
  // chain; a method that threw *synchronously* from a promise-returning
  // signature would escape a `.catch()` and surface as a crash rather than as
  // the blocked stage it is.
  async run(): Promise<AgentRun> {
    throw assayPipelineBlocker("ASSAY", null);
  },
};
