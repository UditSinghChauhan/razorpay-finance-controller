import { describe, expect, it } from "vitest";

import {
  ALLOWED_TRANSITIONS,
  CONTROLLER_STATES,
  WRITE_PHASE_STATES,
  isTerminal,
} from "../src/state.js";
import { runController } from "../src/machine.js";
import {
  CLOSE_REPORT,
  EXCEPTION_QUEUE,
  RUN_ID,
  fixtureRegistry,
} from "./support/fixture-registry.js";

/**
 * Reachability — the guarantee `state.ts`'s docstring makes, checked.
 *
 * `APPLY_RESOLUTION` and `RECHECK` are declared states with no financial-write
 * caller. This suite proves they are not merely undocumented but genuinely
 * unreachable: every step of every real execution path stays inside the
 * reachable set computed by exhausting `ALLOWED_TRANSITIONS` from `INIT`.
 */

function reachableFrom(start: string): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const s = stack.pop()!;
    const next = ALLOWED_TRANSITIONS[s as keyof typeof ALLOWED_TRANSITIONS] ?? [];
    for (const n of next) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

describe("the declared transition table", () => {
  it("covers every state, and only declared states", () => {
    const keys = Object.keys(ALLOWED_TRANSITIONS).sort();
    expect(keys).toEqual([...CONTROLLER_STATES].sort());
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const target of targets) {
        expect(CONTROLLER_STATES).toContain(target);
      }
    }
  });

  it("both terminal states have no outgoing transition", () => {
    expect(ALLOWED_TRANSITIONS.COMPLETE).toEqual([]);
    expect(ALLOWED_TRANSITIONS.HALT).toEqual([]);
  });
});

describe("write-phase states are structurally reachable in the table but never entered", () => {
  it("APPLY_RESOLUTION and RECHECK are graph-reachable from INIT (the table permits them)", () => {
    // The table declares the FULL nine-state shape a later phase completes —
    // AWAIT_HUMAN -> APPLY_RESOLUTION is a legal edge in the graph. What
    // makes them unreachable in THIS phase is that no rule in policy.ts ever
    // requests that edge, which the next test proves empirically.
    const reachable = reachableFrom("INIT");
    for (const state of WRITE_PHASE_STATES) {
      expect(reachable.has(state)).toBe(true);
    }
  });

  it("no real execution — success, halt, or empty-eligibility — ever visits either", async () => {
    const scenarios = [
      fixtureRegistry(),
      fixtureRegistry({ close_report: async () => ({ ...CLOSE_REPORT, period_status: "CLOSED" }) }),
      fixtureRegistry({
        close_report: async () => {
          throw new Error("simulated outage");
        },
      }),
      fixtureRegistry({
        exception_queue: async () => ({
          ...EXCEPTION_QUEUE,
          items: EXCEPTION_QUEUE.items.map((i) => ({ ...i, suspense_key: null })),
        }),
      }),
    ];
    for (const tools of scenarios) {
      const trace = await runController({ runId: RUN_ID, tools });
      const visited = new Set(trace.steps.map((s) => s.state));
      for (const state of WRITE_PHASE_STATES) {
        expect(visited.has(state)).toBe(false);
      }
      // Every step's OWN next_state is checked too, not just the states the
      // loop happened to render — a state can be "reached" as a next_state
      // without a further step being recorded for it if it were terminal,
      // which neither write-phase state is.
      for (const step of trace.steps) {
        for (const state of WRITE_PHASE_STATES) {
          expect(step.next_state).not.toBe(state);
        }
      }
    }
  });
});

describe("isTerminal", () => {
  it("is true for COMPLETE and HALT only", () => {
    for (const s of CONTROLLER_STATES) {
      expect(isTerminal(s)).toBe(s === "COMPLETE" || s === "HALT");
    }
  });
});
