import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { runController } from "../../src/machine.js";
import { TELEMETRY_CHECK_IDS, TELEMETRY_GROUPS, evaluateController } from "../../src/telemetry.js";
import { CLOSE_REPORT, RUN_ID, fixtureRegistry } from "../support/fixture-registry.js";

/**
 * Telemetry invariants over arbitrary residual/threshold pairs.
 *
 * The generator perturbs the two figures `closingSet` reads, which is what
 * drives every branch of `PLAN` — already-closed, already-under-threshold, a
 * real closing set, an insufficient one — over evidence that is otherwise
 * genuine. The properties assert that the telemetry stays internally
 * consistent and that containment holds on *every* branch, not just the one
 * the demo happens to take.
 */

const scenarioArb = fc.record({
  unresolved: fc.integer({ min: 0, max: 20_000_000 }),
  threshold: fc.integer({ min: 0, max: 20_000_000 }),
});

async function evaluateWith(unresolved: number, threshold: number) {
  const trace = await runController({
    runId: RUN_ID,
    tools: fixtureRegistry({
      close_report: async () => ({
        ...CLOSE_REPORT,
        unresolved_value_paise: unresolved,
        close_threshold_paise: threshold,
      }),
    }),
  });
  return { trace, telemetry: evaluateController(trace) };
}

describe("telemetry invariants", () => {
  it("always emits the full closed set of checks, each in a declared group", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const { telemetry } = await evaluateWith(unresolved, threshold);
        expect(telemetry.checks).toHaveLength(TELEMETRY_CHECK_IDS.length);
        for (const c of telemetry.checks) {
          expect(TELEMETRY_CHECK_IDS).toContain(c.id);
          expect(TELEMETRY_GROUPS).toContain(c.group);
          expect(c.detail.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("containment holds on every branch — no write, no event, no model call", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const { telemetry } = await evaluateWith(unresolved, threshold);
        const byId = new Map(telemetry.checks.map((c) => [c.id, c.passed]));
        expect(byId.get("no_writes_attempted")).toBe(true);
        expect(byId.get("no_writes_applied")).toBe(true);
        expect(byId.get("no_caused_events")).toBe(true);
        expect(byId.get("no_model_call")).toBe(true);
        expect(byId.get("no_write_phase_state")).toBe(true);
        expect(byId.get("reads_only")).toBe(true);
        expect(telemetry.counters.writes_attempted).toBe(0);
        expect(telemetry.counters.writes_applied).toBe(0);
      }),
      { numRuns: 60 },
    );
  });

  it("all_passed is exactly checks_passed === checks_total", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const { telemetry } = await evaluateWith(unresolved, threshold);
        const passed = telemetry.checks.filter((c) => c.passed).length;
        expect(telemetry.checks_passed).toBe(passed);
        expect(telemetry.all_passed).toBe(passed === telemetry.checks_total);
      }),
      { numRuns: 60 },
    );
  });

  it("counters never contradict the trace they were derived from", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const { trace, telemetry } = await evaluateWith(unresolved, threshold);
        expect(telemetry.counters.steps).toBe(trace.steps.length);
        expect(telemetry.counters.escalations).toBe(trace.escalations.length);
        expect(telemetry.counters.tool_calls).toBe(
          trace.steps.filter((s) => s.tool !== null).length,
        );
        const summed = Object.values(telemetry.counters.tool_calls_by_name).reduce((a, b) => a + b, 0);
        expect(summed).toBe(telemetry.counters.tool_calls);
      }),
      { numRuns: 60 },
    );
  });

  it("every real execution passes every check", async () => {
    // The strong claim: the machine as written does not violate its own
    // declared policy on any branch the generator can reach.
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const { telemetry } = await evaluateWith(unresolved, threshold);
        const failed = telemetry.checks.filter((c) => !c.passed).map((c) => c.id);
        expect(failed).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});
