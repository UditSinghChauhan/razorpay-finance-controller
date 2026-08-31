import { AGENT_IDS, agentDeclaration, tier0Agents, type Agent, type AgentId } from "@assay/eval";

import { ALL } from "../args.js";
import { UsageError } from "../errors.js";
import { a1Agent } from "./a1.js";
import { a2Agent } from "./a2.js";
import { a3Agent } from "./a3.js";
import { assayAgent } from "./assay.js";
import { b0Agent } from "./b0.js";
import { b1Agent } from "./b1.js";
import { b2Agent } from "./b2.js";

/**
 * The seven agents, constructed here and **injected** into `packages/eval`.
 *
 * **Ratified at spec 1.4.29, register row `DATA_MODEL.md §22.2` M47.**
 * `DECISION_BRIEF.md §K` placed `agents/{assay,b0,b1,b2,a1,a2,a3}.ts` under
 * `packages/eval/src/`, where they cannot live: an agent composes
 * `packages/engine`, `packages/llm` and `packages/probe`, and
 * `eslint.config.js` refuses all three anywhere under `packages/eval/`. Register
 * row **M37** had already ratified the reason at spec 1.4.23 — *"`packages/eval`
 * (scoped to measurement; hosting the run loop puts the system under test inside
 * the thing measuring it)"* — and `§K` never absorbed it.
 *
 * **Injection is what makes the composition root the right home.** M37 also
 * rejected `apps/cli`, on the ground that *"`packages/eval`'s agent runner could
 * not import it and the loop would be **forked**"* — reasoned against the
 * opposite import direction. Here `apps/cli` imports `@assay/eval` and passes a
 * constructed {@link Agent} in; that package imports nothing new,
 * `DECISION_BRIEF.md §L.2` is silent on `apps/cli`, and the graph stays acyclic.
 * **Nothing is forked**: all seven share one interface and differ only by
 * `RunConfig` flags, which is what `ARCHITECTURE.md §10` and
 * `EVALUATION_SPEC.md §3.2` require to keep the ablations valid controls.
 *
 * **This directory may not reach the filesystem door.** `eslint.config.js` bans
 * `../fs/` from `apps/cli/src/agents/**` under `noInlineConfig`. `fs/guard.ts`
 * records why the ban is needed even here: *"the zone is an argument at the call
 * site"*, so zones are per-read rather than per-process and a module is not
 * restricted by sitting in the composition root. Four protections already held —
 * no `node:fs` outside `src/fs/**`; `AGENT` refuses both restricted artifacts;
 * `AgentInput` carries only `observations` and `config`, so an agent has nothing
 * to read *with*; and `AL1` binds `packages/engine` and `packages/oracle` **by
 * name**, and neither moves — and the path-scoped ban closes the residual with
 * the mechanism `§L.1` rules 3 and 4 already use.
 *
 * **No agent here runs.** Each reports the package that owes the piece it cannot
 * run without, in the shape `commands/bench.ts` established: a stand-in would
 * produce numbers `DECISION_BRIEF.md §L.4` forbids, and under `§3.2` it would
 * make an ablation differ from ASSAY in a second respect nobody recorded.
 */

/**
 * Every agent `EVALUATION_SPEC.md §3` names, in `AGENT_IDS` order.
 *
 * The order is `packages/eval`'s and is not restated: `agents.test.ts` asserts
 * this list against `AGENT_IDS`, so a row added there without an implementation
 * here fails the suite rather than disappearing from a sweep.
 */
export const ALL_AGENTS: readonly Agent[] = Object.freeze([
  assayAgent,
  b0Agent,
  b1Agent,
  b2Agent,
  a1Agent,
  a2Agent,
  a3Agent,
]);

/**
 * The agents `EVALUATION_SPEC.md §2`'s protocol loop actually runs.
 *
 * Derived from `packages/eval`'s `tier0Agents()` rather than listed, because
 * `§3.1` records `B1-GREEDY`'s exclusion as **data** (`inTier0: false`) and a
 * second hand-written list would be a second place that fact is decided.
 */
export const TIER0_AGENTS: readonly Agent[] = Object.freeze(
  tier0Agents().map((declaration) => agentById(declaration.id)),
);

/** The constructed agent for one `EVALUATION_SPEC.md §3` id. */
export function agentById(id: AgentId): Agent {
  const found = ALL_AGENTS.find((agent) => agent.id === id);
  if (found === undefined) {
    // Unreachable while ALL_AGENTS and AGENT_IDS are in step, which a test pins.
    // Returning a default would let a missing implementation be scored.
    throw new Error(`apps/cli: no implementation for §3 agent ${id}`);
  }
  return found;
}

/** Whether `raw` is one of `EVALUATION_SPEC.md §3`'s declared ids. */
export function isAgentId(raw: string): raw is AgentId {
  return (AGENT_IDS as readonly string[]).includes(raw);
}

/**
 * Read one id, refusing anything `§3` does not declare.
 *
 * The declaration is read from `packages/eval` and never restated here, for the
 * reason `commands/generate.ts` gives for `§6.1`'s split table: a second reader
 * is a second place a frozen table is interpreted.
 */
export function readAgentId(raw: string): AgentId {
  if (isAgentId(raw)) return raw;
  throw new UsageError(
    `${JSON.stringify(raw)} is not an agent EVALUATION_SPEC.md §3 declares. The seven are ` +
      `${AGENT_IDS.join(", ")}. Note that §3 spells them in full -- "B0-IDONLY", not "B0" -- ` +
      `because the id is what a metrics.json is filed under (spec 1.4.29, M48).`,
  );
}

/**
 * `PREREGISTRATION.md §9` step 7's `--agents all`, and the explicit list form.
 *
 * **A convention, not a ratification** — the treatment `args.ts` gives
 * `--seeds all`, and for the same reason: `§9` step 7 and `EVALUATION_SPEC.md
 * §7` both write `--agents all`, and **no document states an agent-argument
 * grammar at all**, ratified or otherwise. A selector had to be designed
 * regardless, so the only spelling either document uses is the one implemented.
 *
 * `all` is {@link TIER0_AGENTS}, not {@link ALL_AGENTS}: `EVALUATION_SPEC.md §2`
 * loops `for agent in {ASSAY, B0, B2, A1, A2, A3} (+ B1 if built)`, so the sweep
 * is the Tier-0 set and `B1-GREEDY` joins it by being built rather than by being
 * named. Selecting `B1-GREEDY` explicitly is still permitted — `§3.1` declares
 * it, and an explicit request is not the sweep.
 *
 * Order follows `AGENT_IDS`, never the order the caller typed: a run set whose
 * order depended on an argument would make two spellings of one sweep produce
 * two orderings of one report.
 *
 * @throws UsageError on an unknown id, an empty item or a repeat.
 */
export function selectAgents(raw: string): readonly Agent[] {
  if (raw.trim() === ALL) return TIER0_AGENTS;

  const chosen = new Set<AgentId>();
  for (const item of raw.split(",")) {
    const trimmed = item.trim();
    if (trimmed === "") {
      throw new UsageError(
        `--agents: empty item in ${JSON.stringify(raw)}. Every item names an agent, or the ` +
          `whole argument is "all" (PREREGISTRATION.md §9 step 7).`,
      );
    }
    const id = readAgentId(trimmed);
    if (chosen.has(id)) {
      throw new UsageError(
        `--agents: ${id} appears more than once in ${JSON.stringify(raw)}. A repeated agent ` +
          `would be scored twice into one interval, and EVALUATION_SPEC.md §2 draws its CIs ` +
          `over seeds rather than over repeats.`,
      );
    }
    chosen.add(id);
  }
  return Object.freeze(ALL_AGENTS.filter((agent) => chosen.has(agent.id)));
}

export { agentDeclaration };
export { a1Agent, a2Agent, a3Agent, assayAgent, b0Agent, b1Agent, b2Agent };
