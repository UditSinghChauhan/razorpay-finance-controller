import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ScenarioPicker } from "../src/components/ScenarioPicker.js";
import { RunContext } from "../src/context/RunContext.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { DEMO_SCENARIOS, DEFAULT_SCENARIO_ID, scenarioFor } from "../src/lib/scenarios.js";
import {
  ABSTAINED_VALUE_LABEL,
  SCENARIO_LAB_HEADLINE,
  SCENARIO_LAB_SUBHEAD,
} from "../src/lib/copy.js";
import type { CloseReport, RunSummary } from "../src/hooks/useAssayApi.js";
import { CLOSE_500, CLOSE_CLOSED, CLOSE_MULTI, RUN, runContext } from "./fixtures.js";

/**
 * The demo period selector, and the Command Center's use of it.
 *
 * Rendered through `renderToStaticMarkup` like every other component suite
 * here, so what is asserted is the markup the component actually produces.
 *
 * **What this file does NOT assert is any controller outcome.** The picker
 * chooses which evidence the next run reads; what the controller does with it is
 * `apps/api/tests/scenarios.test.ts`'s subject, driven against live runs. A
 * prediction here would be a second answer that could disagree with the real
 * one.
 */

function render(page: React.ReactElement, value = runContext()): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={value}>{page}</RunContext.Provider>
    </MemoryRouter>,
  );
}

const picker = (selected: string, disabled = false): string =>
  renderToStaticMarkup(
    <ScenarioPicker selected={selected} disabled={disabled} onSelect={() => undefined} />,
  );

describe("ScenarioPicker", () => {
  const html = picker(DEFAULT_SCENARIO_ID);

  it("offers every period, by label", () => {
    expect(DEMO_SCENARIOS.length).toBeGreaterThan(1);
    for (const scenario of DEMO_SCENARIOS) {
      expect(html, scenario.id).toContain(scenario.label);
    }
  });

  it("names the selected period's id and describes what it contains", () => {
    const active = scenarioFor(DEFAULT_SCENARIO_ID);
    expect(active).toBeDefined();
    expect(html).toContain(DEFAULT_SCENARIO_ID);
    expect(html).toContain(active?.description.slice(0, 40) ?? "");
  });

  it.each(DEMO_SCENARIOS.map((s) => s.id))("marks %s pressed when it is the selection", (id) => {
    const markup = picker(id);
    // One pressed button, and it is this one. `aria-pressed` precedes the
    // button's contents in the rendered attribute order, so the label and its
    // evidence line are what follow the opening tag it closes. Both are
    // asserted: the button carries the period's name AND the evidence that
    // distinguishes it, which is the comparison the lab exists to offer.
    expect([...markup.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
    const pressed = markup.split('aria-pressed="true">')[1] ?? "";
    const inner = pressed.slice(0, pressed.indexOf("</button>"));
    const scenario = scenarioFor(id);
    expect(scenario).toBeDefined();
    expect(inner).toContain(`>${scenario?.label ?? ""}</span>`);
    expect(inner).toContain(`>${scenario?.evidence ?? ""}</span>`);
  });

  it("disables every button while a run is in flight", () => {
    const busy = picker(DEFAULT_SCENARIO_ID, true);
    expect([...busy.matchAll(/disabled=""/g)]).toHaveLength(DEMO_SCENARIOS.length);
    expect(picker(DEFAULT_SCENARIO_ID, false)).not.toContain('disabled=""');
  });

  it("says these are not benchmark evidence, where a reviewer reads the figures", () => {
    expect(html).toContain("never benchmark evidence");
  });
});

describe("Command Center — selecting and running a period", () => {
  it("renders the picker before any run, beside the Run button", () => {
    const html = render(<CommandCenter />, runContext({ run: null, loading: false }));
    for (const scenario of DEMO_SCENARIOS) expect(html).toContain(scenario.label);
    expect(html).toContain("Run Demo");
    // The start screen names the period that will actually be run.
    expect(html).toContain(`dataset: ${DEFAULT_SCENARIO_ID}`);
  });

  it("renders the picker after a run, so another period can be chosen", () => {
    const html = render(<CommandCenter />);
    for (const scenario of DEMO_SCENARIOS) expect(html).toContain(scenario.label);
  });

  /**
   * The button says which of the two things it will do. Re-running the period
   * on screen and running a different one are different actions, and a reviewer
   * who has just clicked another period should not have to guess which they are
   * about to get.
   */
  it("offers a re-run when the selection is the period that ran", () => {
    const html = render(<CommandCenter />, runContext({ dataset: RUN.dataset }));
    expect(html).toContain("Re-Run Demo");
    expect(html).not.toContain("Run this period");
  });

  it("offers to run the selection when it differs from the period that ran", () => {
    const other = DEMO_SCENARIOS.find((s) => s.id !== RUN.dataset);
    expect(other).toBeDefined();
    const html = render(<CommandCenter />, runContext({ dataset: other?.id ?? "" }));
    expect(html).toContain("Run this period");
    expect(html).not.toContain("Re-Run Demo");
  });

  it("shows the period being executed while a run is in flight", () => {
    const html = render(
      <CommandCenter />,
      runContext({ run: null, loading: true, dataset: "demo-multi" }),
    );
    expect(html).toContain("Running ASSAY engine over demo-multi");
  });
});

/**
 * The close outcome is on the page whether or not anything was abstained.
 *
 * `period_status` used to be rendered in exactly one place — inside the
 * "Ambiguity Detected" alert, which is gated on there being at least one
 * abstention decision. A period that closed cleanly has none, so the single
 * most important fact about it appeared nowhere: the reviewer saw the same
 * green "Close" tick that an OPEN period shows, and had to run the controller
 * to learn the difference.
 */
describe("Command Center — the close outcome is visible without an abstention", () => {
  const closedRun = {
    ...RUN,
    dataset: "demo-close",
    summary: {
      ...RUN.summary,
      abstentions: 0,
      period_status: "CLOSED" as const,
      unresolved_value_paise: 0,
    },
  };
  const html = render(
    <CommandCenter />,
    runContext({ run: closedRun, close: CLOSE_CLOSED, dataset: "demo-close" }),
  );

  it("hides the ambiguity alert, because nothing was abstained", () => {
    expect(html).not.toContain("Ambiguity Detected");
  });

  it("states the period outcome anyway, beside the gates", () => {
    expect(html).toContain(">Period<");
    expect(html).toContain(">CLOSED<");
  });

  it("shows the residual against the threshold it was measured on", () => {
    expect(html).toContain("Unresolved vs. threshold");
    expect(html).toContain("₹5,726.54");
  });

  it("distinguishes a closed period from an open one on the pipeline strip", () => {
    const open = render(<CommandCenter />, runContext({ close: { ...CLOSE_CLOSED, period_status: "OPEN" } }));
    // The close node carries the outcome as a word, so the two are not the
    // same green tick.
    expect(html).toContain(">CLOSED<");
    expect(open).toContain(">OPEN<");
  });
});

/**
 * The ambiguity alert reports the ABSTENTION half of the residual, not the
 * residual.
 *
 * `DATA_MODEL.md §20` splits `unresolved_value_paise` into `value_abstained_paise`
 * and `value_exceptions_paise`. On `demo-500` those two are equal — the
 * abstained settlement is the only Suspense-opening item — so a panel headed
 * "Ambiguity Detected" over the residual was right by coincidence. On
 * `demo-multi` it is not: ₹89,000 of the ₹1,89,000 residual belongs to four
 * unattributed bank credits that no certificate covers.
 *
 * Both figures below are the close gate's own fields, read straight off
 * `GET /runs/:id/close`. Nothing is summed, scaled or derived in the app.
 */
describe("Command Center — the ambiguity alert reports abstained value", () => {
  const withClose = (close: CloseReport, summary: Partial<RunSummary["summary"]> = {}): string =>
    render(
      <CommandCenter />,
      runContext({ run: { ...RUN, summary: { ...RUN.summary, ...summary } }, close }),
    );

  it("demo-500: abstained value and residual coincide, and both read ₹1,00,000", () => {
    expect(CLOSE_500.value_abstained_paise).toBe(CLOSE_500.unresolved_value_paise);
    const html = withClose(CLOSE_500);
    expect(html).toContain("Ambiguity Detected");
    expect(html).toContain(ABSTAINED_VALUE_LABEL);
    expect(html).toContain("₹1,00,000");
  });

  it("demo-multi: the alert shows ₹1,00,000 abstained, not the ₹1,89,000 residual", () => {
    expect(CLOSE_MULTI.value_abstained_paise).toBe(10_000_000);
    expect(CLOSE_MULTI.unresolved_value_paise).toBe(18_900_000);
    const html = withClose(CLOSE_MULTI, { unresolved_value_paise: 18_900_000 });

    // The alert's own metric block, isolated: from its label to the tile that
    // follows it. The residual must not appear inside that block.
    const start = html.indexOf(ABSTAINED_VALUE_LABEL);
    expect(start).toBeGreaterThan(-1);
    const block = html.slice(start, html.indexOf("Period Status", start));
    expect(block).toContain("₹1,00,000");
    expect(block).not.toContain("₹1,89,000");
  });

  it("demo-multi: the total unresolved value is still visible, separately", () => {
    const html = withClose(CLOSE_MULTI, { unresolved_value_paise: 18_900_000 });
    // Against the threshold it is actually measured on, under Close Gates.
    expect(html).toContain("Unresolved vs. threshold");
    expect(html).toContain("₹1,89,000");
    expect(html).toContain("₹6,747.19");
  });

  it("says which figure it is showing, and where the other one is", () => {
    const html = withClose(CLOSE_MULTI);
    expect(html).toContain("It is not the total unresolved");
  });

  it("demo-close: no abstention, so no ambiguity amount is rendered at all", () => {
    const html = render(
      <CommandCenter />,
      runContext({
        run: {
          ...RUN,
          dataset: "demo-close",
          summary: {
            ...RUN.summary,
            abstentions: 0,
            period_status: "CLOSED" as const,
            unresolved_value_paise: 0,
          },
        },
        close: CLOSE_CLOSED,
        dataset: "demo-close",
      }),
    );
    expect(html).not.toContain("Ambiguity Detected");
    expect(html).not.toContain(ABSTAINED_VALUE_LABEL);
  });
});

/**
 * The scenario lab's story: one system, four inputs.
 *
 * Four buttons with no framing read as four demos. The headline states the
 * invariant and the variable together, so the controller behaving differently
 * below is legible as a consequence of the evidence rather than of a mode the
 * operator switched — which is the single claim the lab exists to make.
 */
describe("the scenario lab says what varies and what does not", () => {
  const html = picker(DEFAULT_SCENARIO_ID);

  it("leads with the one-line story", () => {
    expect(html).toContain(SCENARIO_LAB_HEADLINE);
    expect(html).toContain("Same Finance Controller. Different evidence. Different action.");
  });

  it("names what is held constant, so 'same controller' is checkable rather than asserted", () => {
    expect(html).toContain(SCENARIO_LAB_SUBHEAD);
    expect(html).toContain("Only the period changes");
    expect(html).toContain("no threshold, constraint or provider is configured differently");
  });

  it("shows every period's evidence at once, not only the selected one's", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(html, scenario.id).toContain(scenario.evidence);
    }
  });

  /**
   * The prohibition the picker has always carried, now asserted over the
   * evidence lines too. What the controller does with a period is the panel's
   * answer to give; a caption that predicted it would be a second, unchecked
   * answer that could disagree with the real one.
   */
  it("predicts no outcome in any period's copy", () => {
    const forbidden = [
      "escalat", "closes", "will close", "closed period", "budget", "abstains",
      "resolves", "outcome", "passes", "fails",
    ];
    for (const scenario of DEMO_SCENARIOS) {
      const copy = `${scenario.evidence} ${scenario.description}`.toLowerCase();
      for (const word of forbidden) {
        expect(copy, `${scenario.id}: "${word}"`).not.toContain(word);
      }
    }
  });
});

/**
 * Switching periods, made legible.
 *
 * `CommandCenter` keys the controller panel on `run_id`, so a completed new run
 * cannot leave the previous period's trace on screen. The gap this notice
 * closes is the one before that: between clicking a period and pressing the
 * button, every figure on the page — the trace included — still belongs to the
 * period that ran, and a reviewer is entitled to be told so rather than to
 * discover it by reading a rupee figure that answers a question they stopped
 * asking.
 */
describe("switching periods says what carries over and what does not", () => {
  const transition = (selected: string, ran: string | undefined): string =>
    renderToStaticMarkup(
      <ScenarioPicker selected={selected} disabled={false} onSelect={() => undefined} ranDataset={ran} />,
    );

  it("warns while the selection and the period on screen differ", () => {
    const html = transition("demo-backlog", "demo-500");
    expect(html).toContain("New period selected");
    expect(html).toContain("Everything below still belongs to Ambiguity");
    expect(html).toContain("Running Backlog starts a new period");
  });

  it("says the new run produces its own trace, and the old one does not carry over", () => {
    const html = transition("demo-backlog", "demo-500");
    expect(html).toContain("the controller produces a new trace over it");
    expect(html).toContain("the Ambiguity trace does not carry over");
  });

  it("names both periods by their human labels, in the right roles", () => {
    // Selected → the one about to run; ran → the one on screen. Reversing them
    // would be a warning that points at the wrong period.
    const html = transition("demo-close", "demo-multi");
    expect(html).toContain("Everything below still belongs to Several items");
    expect(html).toContain("Running Clean close starts a new period");
  });

  it("is silent when the selection is the period on screen", () => {
    expect(transition("demo-500", "demo-500")).not.toContain("New period selected");
  });

  it("is silent before any run exists — there is nothing to have carried over", () => {
    expect(transition("demo-500", undefined)).not.toContain("New period selected");
  });
});

/**
 * The Command Center's use of the notice: it must be driven by the period that
 * actually ran, never by the selection, or the warning would never fire.
 */
describe("Command Center — the transition notice is driven by run.dataset", () => {
  it("warns when the selection differs from the run on screen", () => {
    const other = DEMO_SCENARIOS.find((s) => s.id !== RUN.dataset);
    expect(other).toBeDefined();
    const html = render(<CommandCenter />, runContext({ dataset: other?.id ?? "" }));
    expect(html).toContain("New period selected");
    expect(html).toContain("Everything below still belongs to Ambiguity");
  });

  it("does not warn when they agree", () => {
    const html = render(<CommandCenter />, runContext({ dataset: RUN.dataset }));
    expect(html).not.toContain("New period selected");
  });

  it("does not warn on the start screen, where no run has happened", () => {
    const html = render(<CommandCenter />, runContext({ run: null, loading: false }));
    expect(html).toContain(SCENARIO_LAB_HEADLINE);
    expect(html).not.toContain("New period selected");
  });
});
