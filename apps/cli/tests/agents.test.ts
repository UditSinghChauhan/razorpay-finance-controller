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

describe("every agent reports the package that owes it, and none stands in", () => {
  it("names a blocker and exits UNAVAILABLE rather than returning a run", async () => {
    for (const agent of ALL_AGENTS) {
      const input = { observations: [], config: {
        llm_mode: "offline", strict_replay: true, split: "dev", seed: 2000,
      } } as const;
      await expect(agent.run(input)).rejects.toBeInstanceOf(AgentUnavailableError);
      const error = await agent.run(input).catch((e: unknown) => e);
      expect(error, agent.id).toBeInstanceOf(AgentUnavailableError);
      if (error instanceof AgentUnavailableError) {
        expect(error.exitCode, agent.id).toBe(EXIT.UNAVAILABLE);
        expect(error.agentId, agent.id).toBe(agent.id);
        expect(error.blockedBy.length, agent.id).toBeGreaterThan(0);
      }
    }
  });

  it("gives ASSAY and its three ablations the SAME blocker", async () => {
    // §3.2: an ablation is a control only while it "differs from ASSAY in
    // exactly one respect". An ablation naming a different dependency set would
    // already differ in a second respect nobody recorded.
    const blockers = await Promise.all(
      (["ASSAY", "A1-NOVALIDATE", "A2-NOABSTAIN", "A3-NOLLM"] as const).map(async (id) =>
        agentById(id)
          .run({ observations: [], config: {
            llm_mode: "offline", strict_replay: true, split: "dev", seed: 2000,
          } })
          .catch((e: unknown) => (e instanceof AgentUnavailableError ? e.blockedBy : null)),
      ),
    );
    expect(new Set(blockers).size).toBe(1);
    expect(blockers[0]).not.toBeNull();
  });

  it("gives B0-IDONLY a narrower blocker than ASSAY, as §3.1's honest floor", async () => {
    // B0 runs no engine stage, so S0 and the S1->S2 seam are not on its path. A
    // floor that appeared to need the whole architecture would misstate what it
    // measures.
    const blocker = await agentById("B0-IDONLY")
      .run({ observations: [], config: {
        llm_mode: "offline", strict_replay: true, split: "dev", seed: 2000,
      } })
      .catch((e: unknown) => (e instanceof AgentUnavailableError ? e.blockedBy : ""));
    expect(blocker).not.toContain("packages/engine");
    expect(blocker).toContain("packages/ledger");
  });

  it("records B1-GREEDY as out of scope, not blocked on a package", async () => {
    const blocker = await agentById("B1-GREEDY")
      .run({ observations: [], config: {
        llm_mode: "offline", strict_replay: true, split: "dev", seed: 2000,
      } })
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
