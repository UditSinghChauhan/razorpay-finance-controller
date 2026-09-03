import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { runController } from "../../src/machine.js";
import { ALLOWED_TRANSITIONS, WRITE_PHASE_STATES } from "../../src/state.js";
import {
  CLOSE_REPORT,
  EXCEPTION_QUEUE,
  RUN_ID,
  fixtureRegistry,
} from "../support/fixture-registry.js";

/**
 * Property tests over `runController` — the invariants the whole loop owns.
 *
 * The generator perturbs the REAL fixture's `unresolved_value_paise` and
 * `close_threshold_paise` rather than inventing a queue from scratch: this
 * package's one piece of real judgement is the arithmetic in `closingSet`, and
 * varying the two numbers that arithmetic reads is what exercises every branch
 * of `PLAN` — already-closed, already-under-threshold, a real closing set, and
 * an insufficient one — over evidence that is still genuine.
 */

const scenarioArb = fc.record({
  unresolved: fc.integer({ min: 0, max: 20_000_000 }),
  threshold: fc.integer({ min: 0, max: 20_000_000 }),
});

async function runWith(unresolved: number, threshold: number) {
  const tools = fixtureRegistry({
    close_report: async () => ({
      ...CLOSE_REPORT,
      unresolved_value_paise: unresolved,
      close_threshold_paise: threshold,
    }),
  });
  return runController({ runId: RUN_ID, tools });
}

describe("runController — invariants over the real fixture, residual perturbed", () => {
  it("never performs a write: writes_attempted and writes_applied are always 0", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        expect(trace.writes_attempted).toBe(0);
        expect(trace.writes_applied).toBe(0);
      }),
      { numRuns: 60 },
    );
  });

  it("never enters a write-phase state, for any residual/threshold pair", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        const visited = new Set(trace.steps.flatMap((s) => [s.state, s.next_state]));
        for (const state of WRITE_PHASE_STATES) expect(visited.has(state)).toBe(false);
      }),
      { numRuns: 60 },
    );
  });

  it("every transition the run takes is a member of the declared table", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        for (const step of trace.steps) {
          const allowed = ALLOWED_TRANSITIONS[step.state];
          expect(allowed).toContain(step.next_state);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("terminates — COMPLETE or HALT — for every generated residual/threshold pair", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        expect(["COMPLETE", "HALT"]).toContain(trace.terminal);
      }),
      { numRuns: 60 },
    );
  });

  it("is deterministic: the same (unresolved, threshold) always yields the same trace_id", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const a = await runWith(unresolved, threshold);
        const b = await runWith(unresolved, threshold);
        expect(b.trace_id).toBe(a.trace_id);
      }),
      { numRuns: 60 },
    );
  });

  it("an escalation appears only when the plan selected the certificate-bearing settlement", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        // The fixture's only eligible row is the one certificate-bearing
        // settlement (see machine.test.ts requirement 2), so escalating
        // anything at all implies escalating exactly it, whatever the
        // residual/threshold pair generated.
        if (trace.escalations.length > 0) {
          expect(trace.escalations).toHaveLength(1);
          expect(trace.escalations[0]?.reason).toBe("AMBIGUOUS_CERTIFICATE");
        }
      }),
      { numRuns: 60 },
    );
  });

  it("the real queue's population counts are stable across every perturbation", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ unresolved, threshold }) => {
        const trace = await runWith(unresolved, threshold);
        const summary = trace.steps.find((s) => s.observation_summary.includes("queue items"));
        if (summary !== undefined) {
          expect(summary.observation_summary).toContain(`${EXCEPTION_QUEUE.total} queue items`);
        }
      }),
      { numRuns: 60 },
    );
  });
});
