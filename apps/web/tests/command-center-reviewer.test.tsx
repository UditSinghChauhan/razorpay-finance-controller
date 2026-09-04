import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SCENARIO_LAB_ANCHOR_ID } from "../src/components/ControllerPanel.js";
import { RunContext } from "../src/context/RunContext.js";
import { ENGINE_MODEL_USE } from "../src/lib/copy.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import type { RunSummary } from "../src/hooks/useAssayApi.js";
import { CLOSE_500, CLOSE_CLOSED, RUN, runContext } from "./fixtures.js";

/**
 * The Command Center, read the way a Buildathon reviewer reads it: top to
 * bottom, in three minutes, without the specification open.
 *
 * What this file asserts is the *ordering and the legibility* of what is
 * already on the page — decision, then why, then the controller's trace, then
 * the evaluation, then the evidence, then how to verify it independently. It
 * introduces no figure and asserts no financial semantic; every quantity on
 * the page is still the API's and is covered by the suites that own it
 * (`scenario-picker.test.tsx` for the close outcome and the abstention split,
 * `controller-panel.test.tsx` for the trace, `audit-logs.test.tsx` for the
 * verification).
 */

function render(value = runContext()): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={value}>
        <CommandCenter />
      </RunContext.Provider>
    </MemoryRouter>,
  );
}

/** The same run with one status changed — everything else held constant. */
function withStatus(status: RunSummary["summary"]["period_status"]): string {
  return render(
    runContext({
      run: { ...RUN, summary: { ...RUN.summary, period_status: status } },
      close: { ...CLOSE_500, period_status: status },
    }),
  );
}

/**
 * `period_status` is the single most important fact about a run, and it used to
 * be readable only from a word under the pipeline's Close node and a value
 * inside the Close Gates card — both below the fold on a laptop. Worse, the
 * enum does not carry its own meaning: `OPEN` looks like a neutral status
 * rather than the statement that value is still sitting in Suspense.
 */
describe("the period outcome is stated at the top, in words", () => {
  it("reads CLOSED as closed, and says what closing required", () => {
    const html = withStatus("CLOSED");
    expect(html).toContain("Period status");
    expect(html).toContain(">CLOSED<");
    expect(html).toContain("every gate passed and the residual is inside the close threshold");
  });

  it("reads OPEN as unresolved, not as a neutral status", () => {
    const html = withStatus("OPEN");
    expect(html).toContain(">OPEN<");
    expect(html).toContain("value is still in Suspense, so the period cannot close");
    expect(html).not.toContain("every gate passed and the residual is inside");
  });

  it("reads BLOCKED as a failed gate", () => {
    const html = withStatus("BLOCKED");
    expect(html).toContain(">BLOCKED<");
    expect(html).toContain("a close gate failed");
  });

  it("appears before the metric cards it explains", () => {
    const html = withStatus("OPEN");
    const statusAt = html.indexOf("Period status");
    const metricsAt = html.indexOf("Total Processed");
    expect(statusAt).toBeGreaterThan(-1);
    expect(metricsAt).toBeGreaterThan(statusAt);
  });

  it("is absent before a run exists — there is no period to have a status", () => {
    const html = render(runContext({ run: null, loading: false }));
    expect(html).not.toContain("Period status");
  });
});

/**
 * Audit Logs as the next trust step, not a nav item a reviewer has to find.
 *
 * The control sits beside the claim it checks: the page says the period
 * closed, and `GET /runs/:id/ledger/verify` is where that stops being this
 * page's word for it. The page does not reproduce any of what that route
 * returns.
 */
describe("verification is offered where the claim is made", () => {
  const html = render(runContext({ close: CLOSE_500 }));

  it("offers to verify the ledger from the Command Center", () => {
    expect(html).toContain("Verify Ledger");
  });

  it("does not restate the Audit Logs page's own findings here", () => {
    // The verification's vocabulary belongs to that page and to the response
    // it renders; duplicating it would be a second place a chain result could
    // be decided.
    expect(html).not.toContain("genesis_to_root");
    expect(html).not.toContain("suspense_identity");
    expect(html).not.toContain("Chain verified");
  });
});

/**
 * "ASSAY/offline" read as *"ASSAY is offline"* — a degraded system, or a
 * failed provider. What `llm_provider` records is that the reconciliation
 * engine consults no model on any path: a guarantee, not a state.
 */
describe("the engine's model use is stated as a guarantee, not a status", () => {
  const html = render();

  it("says the engine consults no model", () => {
    expect(html).toContain(ENGINE_MODEL_USE);
    expect(html).toContain("reconciliation is deterministic on every path");
  });

  it("no longer renders the agent and the mode as one slashed token", () => {
    expect(html).not.toContain(`${RUN.agent_id}/${RUN.llm_provider}`);
    expect(html).not.toContain("ASSAY/offline");
  });

  it("still identifies the run, the period and the engine separately", () => {
    expect(html).toContain(RUN.run_id.substring(0, 12));
    expect(html).toContain(`period ${RUN.dataset}`);
    expect(html).toContain(`engine ${RUN.agent_id}`);
  });

  it("says the same thing on the start screen, where 'llm: offline' used to be", () => {
    const start = render(runContext({ run: null, loading: false }));
    expect(start).toContain(ENGINE_MODEL_USE);
    expect(start).not.toContain("llm: offline");
  });
});

/**
 * The authority model, where a reviewer meets it: before the panel that has
 * three kinds of authority sitting next to each other.
 */
describe("the authority model is legible on the page itself", () => {
  const html = render();

  it("names the three layers and what each may do", () => {
    expect(html).toContain("ASSAY — deterministic financial authority");
    expect(html).toContain("Controller — bounded orchestration");
    expect(html).toContain("Explanation model — explanation only");
    expect(html).toContain("ASSAY decides and is the only financial authority");
  });

  it("says the controller writes nothing and the explanation model decides nothing", () => {
    expect(html).toContain("The Controller orchestrates within bounds and writes nothing");
    expect(html).toContain(
      "The explanation model describes an outcome already sealed and decides nothing",
    );
  });

  it("never suggests the model touches reconciliation", () => {
    // The one sentence that would be fatal to get wrong. Reconciliation is
    // ASSAY's, and no surface on this page may imply otherwise.
    expect(html).not.toContain("Gemini reconciles");
    expect(html).not.toContain("AI reconciles");
    expect(html).not.toContain("model decides");
  });
});

/**
 * The reading order the page is arranged in.
 *
 * State → figures → what this is → which period → pipeline → authority →
 * controller. Asserted by position rather than by screenshot, so a reordering
 * that broke the story fails here.
 *
 * **The first two entries are the ones that moved.** The page used to open on
 * the reviewer brief and the scenario lab, which put `Period status` around
 * y=644 on a laptop and roughly three screens down at 390px: an operator met
 * two explanations of the product before it reported anything about the period
 * they came to close. The explanations are not gone — they sit below the
 * figures they contextualise, which is where a reviewer who has just read
 * `OPEN` wants them.
 */
describe("the page is ordered the way it is meant to be read", () => {
  it("leads with the period's state, and puts the product's account of itself below the figures", () => {
    const html = render(runContext({ close: CLOSE_500 }));
    const positions = [
      html.indexOf("Period status"),
      html.indexOf("Total Processed"),
      html.indexOf("What this is"),
      html.indexOf("Same Finance Controller. Different evidence."),
      html.indexOf("Reconciliation Pipeline"),
      html.indexOf("Who decides what"),
      html.indexOf("Finance Controller — bounded orchestration"),
    ];
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("puts nothing between the page title and the period's status", () => {
    // The acceptance criterion behind the reorder: the first thing under the
    // header is the state of the period, not a description of the product.
    const html = render(runContext({ close: CLOSE_500 }));
    const between = html.slice(
      html.indexOf("Settlement reconciliation"),
      html.indexOf("Period status"),
    );
    expect(between).not.toContain("What this is");
    expect(between).not.toContain("Scenario lab");
  });

  it("anchors the scenario lab so the controller panel can send a reviewer back to it", () => {
    expect(render()).toContain(`id="${SCENARIO_LAB_ANCHOR_ID}"`);
  });
});

/**
 * No period's figures survive a switch to another period.
 *
 * `CommandCenter` keys the controller panel on `run_id`, so React discards the
 * panel — and the trace it holds — when the run changes; the picker's notice
 * covers the window before that, while the selection and the run on screen
 * disagree. What is asserted here is the observable half: a page rendered over
 * one period carries no identifier, amount or label belonging to another.
 */
describe("a period's page carries nothing from another period", () => {
  const OTHER_RUN: RunSummary = {
    ...RUN,
    run_id: "run_backlogfixture000000000000000000000000000000000000000000000000",
    dataset: "demo-backlog",
    observation_count: 512,
    summary: {
      ...RUN.summary,
      abstentions: 0,
      observation_states: { RECONCILED: 470, EXCEPTION: 24, REFERENCE: 10, ABSTAINED: 0 },
      period_status: "CLOSED",
      unresolved_value_paise: 0,
      ledger_root_hash: "b".repeat(64),
    },
  };

  const html = render(
    runContext({ run: OTHER_RUN, close: CLOSE_CLOSED, dataset: "demo-backlog", exceptions: null }),
  );

  it("names the period that actually ran", () => {
    expect(html).toContain("period demo-backlog");
    expect(html).toContain(OTHER_RUN.run_id.substring(0, 12));
  });

  it("carries no identifier from the period it did not run", () => {
    expect(html).not.toContain(RUN.run_id.substring(0, 12));
    expect(html).not.toContain(RUN.summary.ledger_root_hash);
  });

  it("shows this period's own outcome, not the default period's", () => {
    expect(html).toContain(">CLOSED<");
    // demo-500's abstention story must not appear on a period with none.
    expect(html).not.toContain("Ambiguity Detected");
    expect(html).not.toContain("Abstained Value");
  });
});
