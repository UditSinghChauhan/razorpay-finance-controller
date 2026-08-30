import { describe, expect, it } from "vitest";

import {
  GLOBAL_FLAGS,
  UsageError,
  boolFlag,
  parseArgs,
  requireFlag,
  resolveConfig,
  stringFlag,
  type FlagSpecs,
} from "../src/index.js";

/**
 * The hand-rolled parser, and the configuration resolution over it.
 *
 * The parser is strict in the sense `ARCHITECTURE.md §4` boundary 1 uses: an
 * unknown flag is refused rather than ignored. `DECISION_BRIEF.md §L.1` rule 11
 * is the reason — a silently dropped `--strict-replay` would turn the rule off
 * without saying so.
 */

const SPECS: FlagSpecs = {
  ...GLOBAL_FLAGS,
  seed: { kind: "string", describe: "seed" },
  split: { kind: "string", describe: "split" },
};

describe("parseArgs", () => {
  it("reads the command, --flag=value, --flag value and booleans", () => {
    const parsed = parseArgs(["generate", "--seed=9000", "--split", "dev", "--sealed"], SPECS);
    expect(parsed.command).toBe("generate");
    expect(stringFlag(parsed, "seed")).toBe("9000");
    expect(stringFlag(parsed, "split")).toBe("dev");
    expect(boolFlag(parsed, "sealed")).toBe(true);
  });

  it("refuses an unknown flag rather than ignoring it", () => {
    expect(() => parseArgs(["run", "--strictreplay"], SPECS)).toThrow(UsageError);
  });

  it("refuses a repeated flag", () => {
    expect(() => parseArgs(["generate", "--seed=1", "--seed=2"], SPECS)).toThrow(UsageError);
  });

  it("refuses a value on a boolean flag and a missing value on a string flag", () => {
    expect(() => parseArgs(["run", "--sealed=yes"], SPECS)).toThrow(UsageError);
    expect(() => parseArgs(["generate", "--seed"], SPECS)).toThrow(UsageError);
    expect(() => parseArgs(["generate", "--seed", "--split", "dev"], SPECS)).toThrow(UsageError);
  });

  it("refuses short options, so a one-character typo cannot select a mode", () => {
    expect(() => parseArgs(["run", "-s"], SPECS)).toThrow(UsageError);
  });

  it("stops interpreting flags after --", () => {
    const parsed = parseArgs(["run", "--", "--not-a-flag"], SPECS);
    expect(parsed.positional).toEqual(["--not-a-flag"]);
  });

  it("requireFlag names the flag it wanted", () => {
    const parsed = parseArgs(["generate"], SPECS);
    expect(() => requireFlag(parsed, "seed")).toThrow(/--seed is required/);
  });
});

describe("resolveConfig — .env.example's surface", () => {
  const empty: Record<string, string> = {};

  it("defaults to the frozen direction: offline, strict replay on", () => {
    const config = resolveConfig(parseArgs(["run"], SPECS), empty);
    // §L.1 rule 10 makes the full pipeline pass under --llm=offline, and rule 11
    // makes a cache miss a hard error. A default that had to be switched on to
    // be safe would be off in the run nobody checked.
    expect(config.llmProvider).toBe("offline");
    expect(config.strictReplay).toBe(true);
    expect(config.llmModelId).toBe("rules-v1");
    expect(config.dbPath).toBe("./runs/assay.sqlite");
    expect(config.sealed).toBe(false);
  });

  it("takes the environment, and lets a flag override it", () => {
    const env = {
      ASSAY_LLM_PROVIDER: "replay",
      ASSAY_LLM_MODEL_ID: "recorded-v3",
      ASSAY_STRICT_REPLAY: "false",
      ASSAY_DB_PATH: "/tmp/x.sqlite",
    };
    const fromEnv = resolveConfig(parseArgs(["run"], SPECS), env);
    expect(fromEnv.llmProvider).toBe("replay");
    expect(fromEnv.llmModelId).toBe("recorded-v3");
    expect(fromEnv.strictReplay).toBe(false);
    expect(fromEnv.dbPath).toBe("/tmp/x.sqlite");

    const overridden = resolveConfig(parseArgs(["run", "--llm=offline"], SPECS), env);
    expect(overridden.llmProvider).toBe("offline");
    expect(resolveConfig(parseArgs(["run", "--strict-replay"], SPECS), env).strictReplay).toBe(true);
  });

  it("refuses a provider ARCHITECTURE.md §6.5 does not declare", () => {
    expect(() => resolveConfig(parseArgs(["run", "--llm=ollama"], SPECS), empty)).toThrow(UsageError);
  });

  it("refuses a contradictory pair of strict-replay flags", () => {
    expect(() =>
      resolveConfig(parseArgs(["bench", "--strict-replay", "--no-strict-replay"], SPECS), empty),
    ).toThrow(UsageError);
  });
});
