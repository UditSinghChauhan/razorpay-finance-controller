import { describe, expect, it } from "vitest";

import {
  AGENT_IDS,
  SCORED_LLM_MODES,
  aggregationGroup,
  byConfiguration,
  groupId,
  runKey,
  sameGroup,
  type RunConfig,
  type RunKey,
} from "../src/index.js";

/**
 * `M48`\'s key, and the dimension the bootstrap resamples.
 *
 * The interesting assertions are the two exclusions: `strict_replay` is not a
 * key dimension because `DECISION_BRIEF.md §L.1` rule 11 fixes it true on every
 * scored run, and `seed` is not a *group* dimension because
 * `EVALUATION_SPEC.md §2` resamples it — *"Every configuration runs on >= 5
 * seeds"*. A key that carried `strict_replay` would file two names for one run;
 * a group that carried `seed` would leave every configuration a sample of one,
 * which `§5.5` bans from the report.
 */
describe("M48's canonical run key", () => {
  const config = (over: Partial<RunConfig> = {}): RunConfig => ({
    llm_mode: "replay",
    strict_replay: true,
    split: "dev",
    seed: 2000,
    ...over,
  });

  it("is exactly (agent_id, split, seed, llm_mode)", () => {
    const key = runKey("ASSAY", config());
    expect(Object.keys(key).sort()).toEqual(["agent_id", "llm_mode", "seed", "split"]);
    expect(key).toEqual({ agent_id: "ASSAY", split: "dev", seed: 2000, llm_mode: "replay" });
  });

  it("does not carry strict_replay, which §L.1 rule 11 fixes for every scored run", () => {
    const strict = runKey("ASSAY", config({ strict_replay: true }));
    const relaxed = runKey("ASSAY", config({ strict_replay: false }));
    expect(strict).toEqual(relaxed);
  });

  it("drops seed from the configuration, because §2 resamples it", () => {
    const group = aggregationGroup(runKey("ASSAY", config({ seed: 2003 })));
    expect(Object.keys(group).sort()).toEqual(["agent_id", "llm_mode", "split"]);
    expect(group).not.toHaveProperty("seed");
  });

  it("holds no path: layout is apps/cli's", () => {
    const key = runKey("B0-IDONLY", config());
    expect(JSON.stringify(key)).not.toContain("/");
    expect(JSON.stringify(key)).not.toContain("runs");
  });
});

describe("configurations are what the bootstrap averages over", () => {
  const key = (
    agent: RunKey["agent_id"],
    seed: number,
    llm: RunKey["llm_mode"] = "replay",
    split: RunKey["split"] = "dev",
  ): RunKey => ({ agent_id: agent, split, seed, llm_mode: llm });

  it("groups the five seeds of one configuration together", () => {
    const keys = [2000, 2001, 2002, 2003, 2004].map((s) => key("ASSAY", s));
    const grouped = byConfiguration(keys);
    expect(grouped.size).toBe(1);
    expect([...grouped.values()][0]).toHaveLength(5);
  });

  it("keeps agents, splits and llm-modes apart", () => {
    const grouped = byConfiguration([
      key("ASSAY", 2000, "replay"),
      key("ASSAY", 2000, "offline"),
      key("A3-NOLLM", 2000, "replay"),
      key("ASSAY", 9000, "replay", "test"),
    ]);
    expect(grouped.size).toBe(4);
  });

  it("preserves the order a sample was given in", () => {
    // §8 metric 23 requires an interval to be a function of (sample, seed)
    // alone, so a partition that reordered would silently change one.
    const keys = [2004, 2000, 2002].map((s) => key("ASSAY", s));
    const bucket = [...byConfiguration(keys).values()][0];
    expect(bucket?.map((k) => k.seed)).toEqual([2004, 2000, 2002]);
  });

  it("agrees with sameGroup", () => {
    expect(sameGroup(key("ASSAY", 2000), key("ASSAY", 2004))).toBe(true);
    expect(sameGroup(key("ASSAY", 2000), key("A1-NOVALIDATE", 2000))).toBe(false);
    expect(sameGroup(key("ASSAY", 2000, "replay"), key("ASSAY", 2000, "offline"))).toBe(false);
  });

  it("gives every declared agent x mode a distinct group id", () => {
    const ids = new Set<string>();
    for (const agent of AGENT_IDS) {
      for (const mode of SCORED_LLM_MODES) {
        ids.add(groupId({ agent_id: agent, split: "dev", llm_mode: mode }));
      }
    }
    // No AgentId, split or llm-mode contains the separator, so no two
    // configurations can collide into one interval.
    expect(ids.size).toBe(AGENT_IDS.length * SCORED_LLM_MODES.length);
  });
});
