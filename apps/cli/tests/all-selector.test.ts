import { AGENT_IDS, tier0Agents } from "@assay/eval";
import { SEED_BLOCKS } from "@assay/generator";
import { describe, expect, it } from "vitest";

import { ALL, EXIT, TIER0_AGENTS, parseSeedList, selectAgents } from "../src/index.js";
import { CliError } from "../src/errors.js";

/**
 * `PREREGISTRATION.md §9` step 7\'s `--seeds all` and `--agents all`.
 *
 * **Conventions, not ratifications** (spec 1.4.29, `DECISION_BRIEF.md §A.36`).
 * Spec 1.4.27 derived the seed grammar from `§9` step 2 and `EVALUATION_SPEC.md
 * §7` and **overlooked** step 7\'s third spelling; no document states an agent
 * grammar at all. What these assert is the property that keeps them conventions:
 * `all` expands to exactly what the explicit enumeration the frozen grammar
 * already admits would have produced, so accepting it decides nothing.
 */

const declared = (split: "train" | "dev" | "test"): readonly number[] =>
  SEED_BLOCKS.filter((b) => b.split === split).flatMap((b) => [...b.seeds]);

function usageCode(fn: () => unknown): number | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof CliError ? error.exitCode : null;
  }
}

describe("--seeds all is the explicit enumeration, spelled differently", () => {
  it("expands dev to §6.1's five declared seeds", () => {
    expect(parseSeedList(ALL, "seeds", declared("dev"))).toEqual([2000, 2001, 2002, 2003, 2004]);
  });

  it("spans both test blocks, which §9 step 2 writes out in full", () => {
    // The whole claim that this is a convention rests on the two agreeing.
    expect(parseSeedList(ALL, "seeds", declared("test"))).toEqual(
      parseSeedList("9000-9004,9100-9104"),
    );
  });

  it("is refused where no split is known, rather than guessed", () => {
    expect(usageCode(() => parseSeedList(ALL))).toBe(EXIT.USAGE);
  });

  it("leaves the frozen grammar untouched", () => {
    expect(parseSeedList("2000-2004")).toEqual([2000, 2001, 2002, 2003, 2004]);
    expect(parseSeedList("9000-9004,9100-9104")).toHaveLength(10);
    // Still ascending, still no duplicates, still no invented syntax.
    expect(usageCode(() => parseSeedList("2000,2000"))).toBe(EXIT.USAGE);
    expect(usageCode(() => parseSeedList("2004-2000"))).toBe(EXIT.USAGE);
    expect(usageCode(() => parseSeedList("every"))).toBe(EXIT.USAGE);
  });

  it("does not accept all for the singular --seed", () => {
    // Naming one seed and meaning every seed is a contradiction the flag's own
    // name rules out.
    expect(usageCode(() => parseSeedList(ALL, "seed"))).toBe(EXIT.USAGE);
  });
});

describe("--agents all is EVALUATION_SPEC.md §2's protocol loop", () => {
  it("selects the Tier-0 six, not all seven", () => {
    // §2 loops {ASSAY, B0, B2, A1, A2, A3} (+ B1 if built).
    expect(selectAgents(ALL)).toEqual(TIER0_AGENTS);
    expect(selectAgents(ALL).map((a) => a.id)).toEqual(tier0Agents().map((d) => d.id));
    expect(selectAgents(ALL).map((a) => a.id)).not.toContain("B1-GREEDY");
  });

  it("still allows B1-GREEDY to be named explicitly", () => {
    // §3.1 declares it; an explicit request is not the sweep.
    expect(selectAgents("B1-GREEDY").map((a) => a.id)).toEqual(["B1-GREEDY"]);
  });

  it("orders by AGENT_IDS, never by the order typed", () => {
    const typed = selectAgents("A3-NOLLM,ASSAY,B0-IDONLY").map((a) => a.id);
    expect(typed).toEqual(
      AGENT_IDS.filter((id) => ["A3-NOLLM", "ASSAY", "B0-IDONLY"].includes(id)),
    );
    expect(typed).toEqual(["ASSAY", "B0-IDONLY", "A3-NOLLM"]);
  });

  it("refuses an unknown id, an empty item and a repeat", () => {
    expect(usageCode(() => selectAgents("B0"))).toBe(EXIT.USAGE);
    expect(usageCode(() => selectAgents("ASSAY,,B0-IDONLY"))).toBe(EXIT.USAGE);
    expect(usageCode(() => selectAgents("ASSAY,ASSAY"))).toBe(EXIT.USAGE);
  });
});
