import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentInput, RunConfig } from "@assay/eval";
import { generateFamily } from "@assay/generator";
import { verifyChain } from "@assay/ledger";

import type { AssayComposeOptions } from "../src/agents/assay.js";
import { loadObservations, runAssayComposedFull } from "../src/index.js";

/**
 * Work Order 3c, B2 — what the probe loop produces is written, not dropped
 * (`PREREGISTRATION.md §10` V42, register row `DATA_MODEL.md §22.2` M65).
 *
 * - **Every `R3` call reaches its `DATA_MODEL.md §19` home** — `RunEvidence.llm_calls`
 *   — in every arm that runs the loop. On a default arm `R3` is consulted once
 *   per `AMBIGUOUS` target and declines (its context is empty), so the record
 *   count is the `AMBIGUOUS` count.
 * - **A decline creates no chain event.** No default arm dispatches a probe, so
 *   no default chain carries a `PROBE` event and every default root is the one
 *   `default-arm-pin.test.ts` pinned before B2.
 *
 * Measures nothing: `demo/` is never scored and 7001 is a test seed.
 */

const ARMS: Readonly<Record<string, AssayComposeOptions>> = Object.freeze({
  ASSAY: { agentId: "ASSAY" },
  "A2-NOABSTAIN": { agentId: "A2-NOABSTAIN", commitOnAbstain: true },
  "A3-NOLLM": { agentId: "A3-NOLLM", llmModeOverride: "offline" },
});

const config = (seed: number): RunConfig =>
  Object.freeze({ llm_mode: "offline", strict_replay: false, split: "train", seed });

const demo = (id: string): AgentInput =>
  Object.freeze({
    observations: loadObservations(resolve(import.meta.dirname, `../../../demo/${id}/observations.jsonl`)),
    config: config(0),
  });

const INPUTS: readonly (readonly [string, () => AgentInput, number])[] = [
  // [name, input, AMBIGUOUS targets — the pin's own figures]
  ["demo-500", () => demo("demo-500"), 1],
  ["demo-backlog", () => demo("demo-backlog"), 1],
  ["demo-multi", () => demo("demo-multi"), 1],
  ["demo-close", () => demo("demo-close"), 0],
  ["A01@7001", () => Object.freeze({ observations: generateFamily("A01", 7001).observations, config: config(7001) }), 6],
];

describe("every R3 call reaches its §19 home; a decline puts nothing on the chain (B2)", () => {
  for (const [name, load, ambiguous] of INPUTS) {
    for (const [arm, options] of Object.entries(ARMS)) {
      it(`${name} / ${arm}: ${String(ambiguous)} R3 record(s), no PROBE event, chain verifies`, async () => {
        const { evidence, solve_outcomes } = await runAssayComposedFull(load(), options);
        expect(solve_outcomes.AMBIGUOUS).toBe(ambiguous);

        // One consultation per AMBIGUOUS target, each recorded whole.
        expect(evidence.llm_calls).toHaveLength(ambiguous);
        for (const call of evidence.llm_calls) {
          expect(call.role).toBe("R3_propose_probe");
          expect(call.provider).toBe("offline");
          expect(call.model_id).toBe("rules-v1");
          expect(call.run_id).toBe(evidence.chain.run_id);
          expect(call.schema_valid).toBe(true);
        }

        // A decline is not a probe: nothing dispatched, so nothing appended.
        expect(evidence.chain.events.filter((e) => e.kind === "PROBE")).toHaveLength(0);
        expect(verifyChain(evidence.chain.genesis_hash, evidence.chain.events, evidence.chain.root_hash).ok).toBe(true);
      }, 60_000);
    }
  }
});
