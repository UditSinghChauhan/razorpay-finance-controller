import type { RunKey } from "@assay/eval";
import { describe, expect, it } from "vitest";

import { EXIT, METRICS_FILE, REPORT_PATH, RUNS_ROOT, metricsPath, runRoot } from "../src/index.js";
import { CliError } from "../src/errors.js";

/**
 * `M48`\'s artifact layout.
 *
 * `report.html` is **transcribed** from `EVALUATION_SPEC.md §7` and the
 * `metrics.json` path is a **convention**, so what is worth asserting is that the
 * convention is the derived one: `M42`\'s `<split>/<seed>/` nesting with the two
 * dimensions a scored run adds. Nothing here touches the filesystem.
 */
describe("M48's scored-artifact paths", () => {
  const key: RunKey = {
    agent_id: "A3-NOLLM",
    split: "dev",
    seed: 2001,
    llm_mode: "offline",
  };

  it("transcribes EVALUATION_SPEC.md §7's own --out path", () => {
    expect(REPORT_PATH).toBe("runs/report.html");
  });

  it("nests M42's split/seed first, then M48's agent and llm-mode", () => {
    expect(metricsPath("2026-08-31T00-00-00Z", key)).toBe(
      "runs/2026-08-31T00-00-00Z/dev/2001/A3-NOLLM/offline/metrics.json",
    );
  });

  it("distinguishes the two llm-modes §5.4 item 6 requires as separate columns", () => {
    const replay = metricsPath("r1", { ...key, llm_mode: "replay" });
    const offline = metricsPath("r1", { ...key, llm_mode: "offline" });
    expect(replay).not.toBe(offline);
  });

  it("keeps every scored run of one seed under that seed", () => {
    const dir = "runs/r1/dev/2001/";
    for (const agent of ["ASSAY", "B0-IDONLY", "A2-NOABSTAIN"] as const) {
      expect(metricsPath("r1", { ...key, agent_id: agent }).startsWith(dir)).toBe(true);
    }
  });

  it("refuses a run id that is not one path segment, rather than rewriting it", () => {
    // §5.5 traces every reported number to a committed run artifact, and a
    // silently renamed directory breaks that trace.
    for (const bad of ["../escape", "a/b", "", ".hidden", "x".repeat(65)]) {
      let code: number | null = null;
      try {
        runRoot(bad);
      } catch (error) {
        code = error instanceof CliError ? error.exitCode : null;
      }
      expect(code, bad).toBe(EXIT.USAGE);
    }
  });

  it("roots everything at §K's runs/ and names T0-9's file", () => {
    expect(RUNS_ROOT).toBe("runs");
    expect(METRICS_FILE).toBe("metrics.json");
    expect(runRoot("r1")).toBe("runs/r1");
  });
});
