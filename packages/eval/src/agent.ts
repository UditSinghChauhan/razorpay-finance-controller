/**
 * The single agent interface — `ARCHITECTURE.md §10`.
 *
 * > *"agent runner ── ASSAY · B0 · B1 · B2 · A1 · A2 · A3 — one interface:
 * > **Observations -> Decisions + Ledger** — all runs use `--llm=replay` for
 * > reproducibility."*
 *
 * `§10` states why one interface rather than seven entry points: *"Every agent
 * implements the same interface, so ablations are configuration flags rather
 * than forked codebases — which is what makes them valid controls."*
 * `EVALUATION_SPEC.md §3.2` puts the same requirement the other way round: an
 * ablation *"differs from ASSAY in exactly one respect, so the difference is
 * attributable"*, which is false the moment an ablation is a second codebase.
 *
 * **This module is types and identity, and holds no agent.** `packages/eval`
 * depends on the interface only — no agent implementation, no engine
 * orchestration, no LLM policy. The lint block in `eslint.config.js` makes that
 * structural rather than stated: nothing under `packages/eval/` may import
 * `@assay/engine` or `@assay/llm` except the one allowlisted differential test.
 *
 * **Ground truth cannot reach an agent through this interface, and that is a
 * property of the type rather than a rule about the caller.**
 * `PREREGISTRATION.md §6.2` `AL1`/`AL2` and `EVALUATION_SPEC.md §2` require
 * *"No agent ever sees ground truth or oracle labels"*. {@link AgentInput} has
 * no field that could carry either: no `GroundTruth`, no `OracleLabel`, no
 * filesystem path, no reader callback. `tests/discipline.test.ts` asserts that
 * this module imports nothing from `@assay/generator` or `@assay/oracle`, so a
 * later author cannot widen the input without the suite saying so.
 */

import type { Observation } from "@assay/domain";
import type { LlmProviderId } from "@assay/ledger";

import type { AgentRun } from "./run.js";

/**
 * The seven agents `EVALUATION_SPEC.md §3` and `ARCHITECTURE.md §10` name.
 *
 * Ordered as `§10`'s diagram writes them. `B1-GREEDY` is on the list because
 * `§3.1` names it; {@link AGENTS} records that it is a stretch item and not
 * built, which is a different statement from it not existing.
 */
export const AGENT_IDS = Object.freeze([
  "ASSAY",
  "B0-IDONLY",
  "B1-GREEDY",
  "B2-LLM-DIRECT",
  "A1-NOVALIDATE",
  "A2-NOABSTAIN",
  "A3-NOLLM",
] as const);

export type AgentId = (typeof AGENT_IDS)[number];

/** Whether an agent is a baseline (`§3.1`), an ablation (`§3.2`), or ASSAY itself. */
export type AgentRole = "SYSTEM_UNDER_TEST" | "BASELINE" | "ABLATION";

/** What `§3` declares about one agent, as data. */
export interface AgentDeclaration {
  readonly id: AgentId;
  readonly role: AgentRole;
  /** `§3`'s own one-line description of what it represents or removes. */
  readonly represents: string;
  /**
   * `false` where the specification itself defers the agent.
   *
   * `§3.1` marks `B1-GREEDY` *"(stretch — `DECISION_BRIEF.md §H`, tier H2)"* and
   * `§2`'s protocol loop reads `for agent in {ASSAY, B0, B2, A1, A2, A3}
   * (+ B1 if built)`. Recording it as data rather than omitting the row keeps
   * `§3.1`'s own justification visible — *"its absence weakens breadth, not
   * validity"* — instead of leaving a reader to wonder where `B1` went.
   */
  readonly inTier0: boolean;
}

/** `EVALUATION_SPEC.md §3`'s table, as data. */
export const AGENTS: readonly AgentDeclaration[] = Object.freeze([
  {
    id: "ASSAY",
    role: "SYSTEM_UNDER_TEST",
    represents: "The system under test.",
    inTier0: true,
  },
  {
    id: "B0-IDONLY",
    role: "BASELINE",
    represents:
      "Exact join on settlement_id and normalized UTR; everything else an " +
      "exception. A competent scripted reconciliation — the honest floor.",
    inTier0: true,
  },
  {
    id: "B1-GREEDY",
    role: "BASELINE",
    represents:
      "First-fit greedy subset match on amount within a +/-3-day window, ties " +
      "broken by proximity. Spreadsheet / legacy recon tooling.",
    inTier0: false,
  },
  {
    id: "B2-LLM-DIRECT",
    role: "BASELINE",
    represents:
      "The batch chunked into the context window, the model asked for the " +
      "allocation JSON, the output accepted. The obvious build under time " +
      "pressure, and the comparison that decides whether the architecture earns " +
      "its complexity.",
    inTier0: true,
  },
  {
    id: "A1-NOVALIDATE",
    role: "ABLATION",
    represents: "Stage S5's invariants I1-I9 removed.",
    inTier0: true,
  },
  {
    id: "A2-NOABSTAIN",
    role: "ABLATION",
    represents: "Abstention removed; always commits the top candidate.",
    inTier0: true,
  },
  {
    id: "A3-NOLLM",
    role: "ABLATION",
    represents:
      "All four LLM roles routed to the offline provider. Literally " +
      "`ASSAY --llm=offline`, so the ablation and the offline demo path are the " +
      "same code (§3.2).",
    inTier0: true,
  },
]);

/**
 * The provider modes a **scored** run may use.
 *
 * `EVALUATION_SPEC.md §2`: *"All scored runs use `--llm=replay
 * --strict-replay`"*, and *"Every configuration is additionally run with
 * `--llm=offline`"*. `DECISION_BRIEF.md §L.1` rule 11 states the first as an
 * invariant. The two metered providers exist (`ARCHITECTURE.md §6.5`) and are
 * how the cache is recorded, but a run that used one is not scorable, so the
 * type this interface accepts is narrower than `LlmProviderId` on purpose.
 */
export type ScoredLlmMode = Extract<LlmProviderId, "offline" | "replay">;

/** The two `ScoredLlmMode` values, for iteration in the parity comparison (metric 24). */
export const SCORED_LLM_MODES = Object.freeze(["replay", "offline"] as const);

/**
 * The run configuration that distinguishes one agent invocation from another.
 *
 * Every field is a **flag**, which is `§10`'s whole point: *"ablations are
 * configuration flags rather than forked codebases"*.
 */
export interface RunConfig {
  readonly llm_mode: ScoredLlmMode;
  /**
   * `§2`: *"a cache miss is a hard error rather than a silent live call"*.
   * Meaningless under `offline`, which reaches no cache; carried anyway so the
   * flag set is identical across modes and the manifest records what was asked.
   */
  readonly strict_replay: boolean;
  /** `PREREGISTRATION.md §6.1`'s split. The scorer never infers it from the data. */
  readonly split: "train" | "dev" | "test";
  /** `§6.1`'s seed. One number, so a result is addressable. */
  readonly seed: number;
}

/**
 * Everything an agent receives. **Observations and configuration, and nothing
 * else.**
 *
 * `EVALUATION_SPEC.md §2`: *"All agents run on byte-identical observation
 * files. Same input, same scorer, differences attributable to the agent
 * alone."*
 *
 * **What is deliberately absent, and why each absence is load-bearing:**
 *
 * - **No ground truth.** `AL2` and `§2`'s first rule. There is no field it
 *   could arrive in and no path an agent could read it from.
 * - **No oracle labels.** Same rule. The oracle's product is the *scorer's*
 *   input (`§4.3`), never an agent's.
 * - **No filesystem path and no reader callback.** `ARCHITECTURE.md §3` gives
 *   `apps/cli` all filesystem I/O. An agent that could be handed a path could
 *   be handed `ground_truth.jsonl`, and the ban would become a convention.
 * - **No quarantined text.** `DATA_MODEL.md §10` keeps `UntrustedText` behind
 *   the separately-bannable `@assay/domain/untrusted-text` subpath; an agent
 *   that reads it obtains it through its own `S0` boundary, not through the
 *   measurement layer.
 * - **No probe surface.** `RECONCILIATION_SPEC.md §6.2`'s recon report is
 *   reachable *"only through the probe executor, under `P_max`"*
 *   (`PREREGISTRATION.md §6.2` `AL8`), which is the agent's own channel through
 *   `packages/probe`. `packages/eval` neither supplies it nor inspects it; what
 *   it reads back is the **probe count** `§4.13` requires beside metrics 4
 *   and 8, and that is reported on {@link AgentRun}.
 */
export interface AgentInput {
  readonly observations: readonly Observation[];
  readonly config: RunConfig;
}

/**
 * `ARCHITECTURE.md §10`'s interface, in one method.
 *
 * `Promise` because `ARCHITECTURE.md §6.5` types `LlmProvider.invoke` as
 * asynchronous and `B2-LLM-DIRECT` is defined by calling it. A deterministic
 * agent resolves immediately; the signature does not force one to be
 * asynchronous in fact, only in type.
 */
export interface Agent {
  readonly id: AgentId;
  run(input: AgentInput): Promise<AgentRun>;
}

/** Look up `§3`'s declaration for an agent. */
export function agentDeclaration(id: AgentId): AgentDeclaration {
  const found = AGENTS.find((a) => a.id === id);
  if (found === undefined) {
    // Unreachable while AGENT_IDS and AGENTS are in step, which a test pins.
    // Returning a default would let a missing row be scored as an agent.
    throw new Error(`eval: no §3 declaration for agent ${id}`);
  }
  return found;
}

/** The agents `EVALUATION_SPEC.md §2`'s protocol loop actually runs. */
export function tier0Agents(): readonly AgentDeclaration[] {
  return AGENTS.filter((a) => a.inTier0);
}
