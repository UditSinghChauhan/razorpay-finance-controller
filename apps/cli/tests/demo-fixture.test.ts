import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentInput, RunConfig } from "@assay/eval";

import { agentById } from "../src/agents/index.js";
import { loadObservations } from "../src/artifacts/observations.js";

/**
 * The `demo-500` fixture — `PROJECT_SPEC.md §10` step 2, *"Step 2 is the demo.
 * Everything else is support."*
 *
 * **This file measures nothing.** It asserts that ASSAY *abstains* on a case it
 * cannot justify a match for, which is a statement about a code path, not about
 * a rate. No coverage figure, no accuracy, no comparison between agents and no
 * aggregate appears below, because `EVALUATION_SPEC.md §5.5` admits only numbers
 * that exist in a committed run artifact and `demo/` produces none.
 *
 * **The fixture is not benchmark data and cannot become any.** It lives outside
 * `bench/`, carries no seed from `PREREGISTRATION.md §6.1`'s split table, has no
 * ground truth and no oracle labels, and is read through `loadObservations` —
 * the same `AGENT`-zone door every agent reads through, which
 * `fs/guard.ts` already forbids from reaching a restricted artifact. `demo/README.md`
 * states the five boundaries in full.
 *
 * **Why a purpose-built fixture exists at all.** `PREREGISTRATION.md §10`
 * **V35** discloses that the sealed TEST population *"exercises none of the
 * ambiguity, abstention or validation machinery this benchmark exists to
 * compare"* — `abstentions = 0` on all fifty scored units, because every
 * settlement there is fully `AN1`-anchored and `S2` therefore never enumerates a
 * candidate. V35 also records that regenerating the corpus so that ambiguity
 * appears would be a change made *in response to a measured result*, which
 * `DECISION_BRIEF.md §L.4` forbids. A demo dataset is the route the frozen text
 * already provides — `§10`'s own `--dataset demo-500` — and it leaves every
 * benchmark artifact untouched.
 *
 * **`config.split` is `"train"`.** `RunConfig` requires one of three values and
 * this fixture belongs to none of them; `train` is the split
 * `EVALUATION_SPEC.md §2` never scores, so it is the only choice that cannot be
 * mistaken for a scored unit. Nothing reads it here.
 */

const FIXTURE = resolve(import.meta.dirname, "../../../demo/demo-500/observations.jsonl");

/** `--llm=offline`: no network, no credential, no cache — `§C` T0-11's demo path. */
const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: false,
  split: "train",
  seed: 0,
});

describe("demo-500 fixture (PROJECT_SPEC.md §10 step 2)", () => {
  it("holds 500 observations, as §9's demo slice is sized", () => {
    expect(loadObservations(FIXTURE)).toHaveLength(500);
  });

  it("makes ASSAY abstain rather than commit an unjustified match", async () => {
    const observations = loadObservations(FIXTURE);
    const input: AgentInput = Object.freeze({ observations, config: CONFIG });

    const run = await agentById("ASSAY").run(input);

    // The assertion the demo rests on: ASSAY declined to choose between two
    // materially different allocations that the evidence cannot separate.
    expect(run.abstentions.length).toBeGreaterThanOrEqual(1);

    // §17.1.1 opens a Suspense item per abstained target, keyed by
    // `JournalLine.source_entity_id`, and the abstention carries its rupee value
    // so the queue can rank by it.
    for (const abstention of run.abstentions) {
      expect(abstention.source_entity_id.length).toBeGreaterThan(0);
      expect(abstention.value_paise).toBeGreaterThan(0);
    }

    // An abstained target holds a terminal state under G1 — §L.1 rule 5's "no
    // fifth state, no drop path" — so the abstention is visible on the outcomes
    // as well as in the queue.
    const abstained = run.outcomes.filter((o) => o.state === "ABSTAINED");
    expect(abstained.length).toBeGreaterThanOrEqual(1);
  });

  it("reaches a period close that is OPEN on unresolved value", async () => {
    const observations = loadObservations(FIXTURE);
    const run = await agentById("ASSAY").run({ observations, config: CONFIG });

    // §2 requires every run to attempt a close; `null` would mean none was.
    expect(run.close).not.toBeNull();
    const close = run.close;
    if (close === null) return;

    // DATA_MODEL.md §20's three outcomes. BLOCKED is a defect §4.9 requires to
    // be zero, so the fixture is only useful to the demo if it is not one.
    expect(close.period_status).not.toBe("BLOCKED");
    expect(close.period_status).toBe("OPEN");

    // The close gate's own checks, which the /ledger/verify screen re-runs live.
    expect(close.gate.g2_trial_balance).toBe(true);
    expect(close.gate.g4_hash_chain).toBe(true);
    expect(close.gate.g5_no_failed_invariant_posted).toBe(true);
    expect(close.trial_balance_ok).toBe(true);

    // An abstained target opens a Suspense item, so unresolved value is what
    // holds the period open rather than a failed gate.
    expect(close.unresolved_value_paise).toBeGreaterThan(0);
  });
});
