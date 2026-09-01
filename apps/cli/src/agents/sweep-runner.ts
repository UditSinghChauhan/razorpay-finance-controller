import type { AgentId, AgentInput } from "@assay/eval";

import { runAssayComposedFull, type ComposedRun } from "./assay.js";

/**
 * The `§6` thresholds one swept execution runs at — spec 1.4.32, register row
 * `DATA_MODEL.md §22.2` **M51**.
 *
 * **Both fields optional, and an empty object is the ordinary run.** Omitting a
 * field leaves `packages/engine` to resolve `PREREGISTRATION.md §7`'s frozen
 * value, so `{}` is exactly the pre-M51 execution. Nothing here is a default of
 * its own: `frozen.ts` stays the single authority, and this module holds no
 * threshold literal.
 *
 * **This is not `RunConfig` and never becomes it.** M51 keeps the scored unit at
 * `(agent_id, split, seed, llm_mode)` and makes a sweep point *"an evaluation
 * inside one scored unit, never a fifth key dimension"*, so the thresholds are
 * per-execution arguments carried on `apps/cli`'s own composition options.
 * `packages/eval`'s `AgentInput`, `RunConfig` and `RunKey` are untouched, which
 * `tests/bench-sweep.test.ts` asserts by reading their sources.
 */
export interface SweepParameters {
  readonly epsilonBps?: number;
  readonly tauFloorPaise?: number;
}

/**
 * An agent that can be executed at supplied thresholds.
 *
 * Returns a {@link ComposedRun} rather than an `AgentRun`, because
 * `EVALUATION_SPEC.md §5.3` requires the τ sweep to report `count(AMBIGUOUS)`
 * and `count(IMMATERIALLY_AMBIGUOUS)` and neither is derivable from an
 * `AgentRun` — see `assay.ts`'s {@link ComposedRun}.
 */
export type SweptRunner = (input: AgentInput, sweep: SweepParameters) => Promise<ComposedRun>;

/**
 * `ASSAY` at supplied `§6` thresholds — `§5.1`'s first curve agent.
 *
 * Defined here rather than in `assay.ts` so that the two curve agents are
 * registered side by side; `A1`'s counterpart must live in `a1.ts`, because the
 * empty-invariant-selection literal its options carry is lint-allowlisted to
 * that file alone (M50, `DECISION_BRIEF.md §L.1` rule 4).
 */
export function assaySwept(input: AgentInput, sweep: SweepParameters): Promise<ComposedRun> {
  return runAssayComposedFull(input, { agentId: "ASSAY", ...sweep });
}

/**
 * The agent ids `EVALUATION_SPEC.md §5.1` draws as **curves**, and only those.
 *
 * > *"One line per agent. `B0`, `B1`, `B2` and `A2` are single points (they do
 * > not abstain, or abstain trivially); ASSAY and `A1` are curves."*
 *
 * Held as data rather than branched on, so the list a reader must trust and
 * `§5.1`'s sentence are one list. `B0-IDONLY`, `A2-NOABSTAIN` and `A3-NOLLM` are
 * executed **once**, at the frozen thresholds, and contribute a single point;
 * `B1-GREEDY` and `B2-LLM-DIRECT` are outside Tier-0 entirely (`§3.1`,
 * `DECISION_BRIEF.md §C` T0-10) and are unimplemented besides.
 *
 * `A3-NOLLM` is deliberately **absent** even though it composes `assay.ts`:
 * `§5.1` names the curve agents and `A3` is not among them, and a sweep widened
 * here would be a sweep no frozen sentence licenses.
 *
 * The id list lives here; the id → runner map is built in `agents/index.ts`,
 * where both runners are already in scope — `a1Swept` cannot be imported into
 * this module without a cycle, `a1.ts` importing {@link SweepParameters} from
 * it.
 */
export const SWEPT_AGENT_IDS: readonly AgentId[] = Object.freeze([
  "ASSAY",
  "A1-NOVALIDATE",
] as const);

/** Whether `§5.1` draws this agent as a curve. */
export function isSweptAgent(id: AgentId): boolean {
  return SWEPT_AGENT_IDS.includes(id);
}
