import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENT_IDS, agentDeclaration, tier0Agents } from "@assay/eval";
import { describe, expect, it } from "vitest";

import {
  ALL_AGENTS,
  EXIT,
  TIER0_AGENTS,
  agentById,
  isAgentId,
  readAgentId,
} from "../src/index.js";
import { AgentUnavailableError, CliError } from "../src/errors.js";

/**
 * `apps/cli/src/agents/` — the placement ratified at spec 1.4.29 (M47), and the
 * injection seam it exists to provide.
 *
 * Two things are worth pinning here and nothing else is invented. First, that
 * the constructed set matches `EVALUATION_SPEC.md §3`\'s table **read from
 * `packages/eval`** rather than restated — a row added there without an
 * implementation here must fail the suite rather than vanish from a sweep.
 * Second, that no agent reaches the filesystem door: `fs/guard.ts` records that
 * *"the zone is an argument at the call site"*, so a module is not zone-restricted
 * by sitting in the composition root, and `eslint.config.js` bans `../fs/` from
 * this directory. The assertion below is the same source-text mechanism
 * `packages/eval/tests/discipline.test.ts` uses, so the property holds whether or
 * not a reviewer runs the linter.
 */

const AGENT_DIR = fileURLToPath(new URL("../src/agents/", import.meta.url));

const agentSources = readdirSync(AGENT_DIR)
  .filter((name) => name.endsWith(".ts"))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(AGENT_DIR, name), "utf8") }));

describe("the constructed set is EVALUATION_SPEC.md §3's table", () => {
  it("implements every declared agent, in AGENT_IDS order", () => {
    expect(ALL_AGENTS.map((a) => a.id)).toEqual([...AGENT_IDS]);
  });

  it("holds §K's seven files plus the registry", () => {
    expect(agentSources.map((s) => s.name)).toEqual([
      "a1.ts", "a2.ts", "a3.ts", "assay.ts", "b0.ts", "b1.ts", "b2.ts", "index.ts",
    ]);
  });

  it("derives the Tier-0 set from packages/eval rather than listing it again", () => {
    // §3.1 records B1-GREEDY's exclusion as data (inTier0: false). A second
    // hand-written list would be a second place that fact is decided.
    expect(TIER0_AGENTS.map((a) => a.id)).toEqual(tier0Agents().map((d) => d.id));
    expect(TIER0_AGENTS).toHaveLength(6);
    expect(TIER0_AGENTS.map((a) => a.id)).not.toContain("B1-GREEDY");
    expect(agentDeclaration("B1-GREEDY").inTier0).toBe(false);
  });

  it("resolves every id to the agent that declares it", () => {
    for (const id of AGENT_IDS) expect(agentById(id).id).toBe(id);
  });

  it("refuses an id §3 does not declare, and does not accept a short form", () => {
    expect(isAgentId("B0-IDONLY")).toBe(true);
    for (const bad of ["B0", "assay", "ASSAY-2", ""]) {
      expect(isAgentId(bad), bad).toBe(false);
      let code: number | null = null;
      try {
        readAgentId(bad);
      } catch (error) {
        code = error instanceof CliError ? error.exitCode : null;
      }
      expect(code, bad).toBe(EXIT.USAGE);
    }
  });
});

const INPUT = {
  observations: [],
  config: { llm_mode: "offline", strict_replay: true, split: "dev", seed: 2000 },
} as const;

/**
 * The four agents Phase 3A composed: `ASSAY` itself, `B0-IDONLY` (no engine
 * stage — `EVALUATION_SPEC.md §3.1`'s honest floor), and the two ablations
 * whose removal is a configuration flag over `assay.ts`'s own composition
 * (`§3.2`) — `A2-NOABSTAIN` (`commitOnAbstain: true`) and `A3-NOLLM`
 * (`llmModeOverride: "offline"`). **`A1-NOVALIDATE` joined them at spec 1.4.31**
 * (register row `DATA_MODEL.md §22.2` **M50**) with the same shape:
 * `invariantSelection: "…"` selects the empty allocation-scoped invariant set,
 * and nothing else about the composition moves. It was blocked until then on a
 * governance question rather than on plumbing — `DECISION_BRIEF.md §L.1` rule 4
 * gives `ValidatedDecision` exactly one construction route — which M50 answered
 * by making the evaluated set a parameter of `validate()` that defaults to the
 * full set and is narrowable only from `a1.ts`. The mint route did not move.
 */
const STILL_BLOCKED_AGENTS = ["B1-GREEDY", "B2-LLM-DIRECT"] as const;

describe("ASSAY, B0-IDONLY and three ablations compose; two still cannot say what they are waiting for", () => {
  it("composes the pipeline rather than reporting a blocker (spec 1.4.29)", async () => {
    // The one agent that is not blocked. `assay.ts` sequences S1 -> the S1/S2
    // seam -> S2 -> S3 -> S4 (with §6.2's loop where packages/probe's `decide`
    // requires it) -> §17.1.1's postings -> S5 -> the single write path -> the
    // G1-G5 close gate, calling each through the package that owns it.
    //
    // Driven on the empty observation set, which is the one input this suite can
    // supply without a dataset: PREREGISTRATION.md §9 sequences every real
    // generation after the seal tag, so the populated path belongs to the
    // integration suite and not here. It is still the whole pipeline — every
    // stage is entered — and it is enough to pin that ASSAY returns an AgentRun.
    const run = await agentById("ASSAY").run(INPUT);

    expect(run.agent_id).toBe("ASSAY");
    expect(run.config).toEqual(INPUT.config);
    // EVALUATION_SPEC.md §2: "Every run attempts a period close." `null` here
    // means no close was attempted, which §2 forbids for a scored run.
    expect(run.close).not.toBeNull();
    expect(run.close?.period_status).toBe("CLOSED");
    // G1-G5 all passed, so §10.2 reached a report rather than BLOCKED.
    expect(run.close?.gate.failed_gates).toEqual([]);
    expect(run.close?.trial_balance_ok).toBe(true);
    // No observation, so no terminal state, no posting and no probe.
    expect(run.outcomes).toEqual([]);
    expect(run.journal).toEqual([]);
    expect(run.probes_spent).toBe(0);
  });

  it("B0-IDONLY, A1-NOVALIDATE, A2-NOABSTAIN and A3-NOLLM also compose, each reporting its own agent_id", async () => {
    // Every one of the three composes the SAME G1-G5 close gate and the SAME
    // single write path ASSAY does -- none is a second stage implementation,
    // and none bypasses packages/ledger's boundary. Driven on the empty
    // observation set for the same reason ASSAY's own test above is: a
    // populated run belongs to each agent's own dedicated suite
    // (b0.test.ts, a1-a2-a3.test.ts).
    for (const id of ["B0-IDONLY", "A1-NOVALIDATE", "A2-NOABSTAIN", "A3-NOLLM"] as const) {
      const run = await agentById(id).run(INPUT);
      expect(run.agent_id, id).toBe(id);
      expect(run.close, id).not.toBeNull();
      expect(run.close?.period_status, id).toBe("CLOSED");
      expect(run.close?.gate.failed_gates, id).toEqual([]);
      expect(run.close?.trial_balance_ok, id).toBe(true);
      expect(run.outcomes, id).toEqual([]);
      expect(run.journal, id).toEqual([]);
      expect(run.probes_spent, id).toBe(0);
    }
  });

  it("names a blocker and exits UNAVAILABLE for the three still waiting", async () => {
    for (const id of STILL_BLOCKED_AGENTS) {
      const agent = agentById(id);
      await expect(agent.run(INPUT)).rejects.toBeInstanceOf(AgentUnavailableError);
      const error = await agent.run(INPUT).catch((e: unknown) => e);
      expect(error, agent.id).toBeInstanceOf(AgentUnavailableError);
      if (error instanceof AgentUnavailableError) {
        expect(error.exitCode, agent.id).toBe(EXIT.UNAVAILABLE);
        expect(error.agentId, agent.id).toBe(agent.id);
        expect(error.blockedBy.length, agent.id).toBeGreaterThan(0);
      }
    }
  });

  it("A1-NOVALIDATE composes rather than reporting a blocker (spec 1.4.31, M50)", async () => {
    // The blocker this test used to assert is gone, and the reason it was there
    // is what M50 settled: A1 was never waiting on missing plumbing -- ASSAY,
    // B0 and its two sibling ablations all composed before it -- it was waiting
    // on whether "remove S5's invariants" could be built without weakening
    // §L.1 rule 4 for every other agent. It could: the evaluated set is now a
    // parameter defaulting to the full set, the ValidatedDecision brand still
    // has exactly one construction route, and packages/ledger is untouched.
    //
    // What A1 actually DOES is a1-novalidate.test.ts's; what is asserted here
    // is only that it is no longer among the agents that cannot run.
    const run = await agentById("A1-NOVALIDATE").run(INPUT);
    expect(run.agent_id).toBe("A1-NOVALIDATE");
    expect(run.close?.period_status).toBe("CLOSED");
    expect(run.close?.gate.failed_gates).toEqual([]);
    expect(STILL_BLOCKED_AGENTS).not.toContain("A1-NOVALIDATE");
  });

  it("B0-IDONLY's own source calls no S1-S4 stage function, as §3.1's honest floor requires", () => {
    // B0 no longer throws, so §3.1's "honest floor" claim -- that it runs no
    // engine stage -- is checked here at the source level rather than on a
    // blocker string. It still shares packages/ledger's single write path and
    // G1-G5 gate with ASSAY, confirmed at the run level by the CLOSED close
    // report above; what must NOT appear is a call into S1's anchor(), S2's
    // generateCandidates(), S3's decompose() or S4's solve() -- the boundary
    // suite bans DECLARING these in apps/cli; this pins that B0 does not even
    // CALL them, which is a narrower, B0-specific claim boundary.test.ts's
    // general composition-root allowance does not make. Read as the `@assay/
    // engine` IMPORT clause alone (not the whole file, which mentions
    // `anchor()` in prose describing what it deliberately does not call) --
    // the same "read the import shape from raw source" technique
    // boundary.test.ts's own `probe/run.ts` check uses.
    const source = agentSources.find((s) => s.name === "b0.ts")?.text ?? "";
    const engineImport = /import\s*\{([^}]*)\}\s*from\s*"@assay\/engine"/s.exec(source)?.[1] ?? "";
    for (const stage of ["anchor", "generateCandidates", "decompose", "solve"]) {
      expect(engineImport, stage).not.toMatch(new RegExp(`\\b${stage}\\b`));
    }
  });

  it("records B1-GREEDY as out of scope, not blocked on a package", async () => {
    const blocker = await agentById("B1-GREEDY")
      .run(INPUT)
      .catch((e: unknown) => (e instanceof AgentUnavailableError ? e.blockedBy : ""));
    expect(blocker).toContain("H2");
    expect(blocker).not.toContain("packages/");
  });
});

describe("G8 — no agent can reach the filesystem door", () => {
  it("imports neither ../fs/ nor node:fs anywhere under src/agents/", () => {
    for (const { name, text } of agentSources) {
      expect(text, name).not.toMatch(/from\s+["'][^"']*\.\.\/fs\//);
      expect(text, name).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
      expect(text, name).not.toMatch(/import\s*\(\s*["'][^"']*\/fs\//);
    }
  });

  it("takes no path, reader, ground truth, oracle label or recon report", () => {
    // AgentInput carries only `observations` and `config`. These are the names
    // that would appear if that ever stopped being true.
    for (const { name, text } of agentSources) {
      for (const forbidden of ["ground_truth", "oracle_labels", "recon_report", "readText", "readLines"]) {
        expect(text.includes(`${forbidden}.jsonl`), `${name} :: ${forbidden}`).toBe(false);
      }
      expect(text, name).not.toMatch(/\breadText\b|\breadLines\b|\bdiskSink\b/);
    }
  });
});
