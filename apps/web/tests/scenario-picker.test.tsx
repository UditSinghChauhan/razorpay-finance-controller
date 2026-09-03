import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ScenarioPicker } from "../src/components/ScenarioPicker.js";
import { RunContext } from "../src/context/RunContext.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { DEMO_SCENARIOS, DEFAULT_SCENARIO_ID, scenarioFor } from "../src/lib/scenarios.js";
import { ABSTAINED_VALUE_LABEL } from "../src/lib/copy.js";
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
    // label in the rendered attribute order, so the label is what follows the
    // opening tag it closes.
    expect([...markup.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);
    const pressed = markup.split('aria-pressed="true">')[1] ?? "";
    expect(pressed.slice(0, pressed.indexOf("</button>"))).toBe(scenarioFor(id)?.label);
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
