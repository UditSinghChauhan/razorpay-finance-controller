import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthorityLegend } from "../src/components/AuthorityLegend.js";
import { RunContext } from "../src/context/RunContext.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { runContext } from "./fixtures.js";

/**
 * Three things on the Command Center could be mistaken for one another, and
 * the cost of that confusion is someone believing the AI moved money.
 *
 * The legend states the ordering once: ASSAY decides and is the financial
 * authority; the controller only chooses what to look at next and writes
 * nothing; Gemini only describes an outcome already sealed and is removable.
 * What is asserted below is that each layer names its own authority *and its
 * own bound*, and that the legend itself introduces no figure — it is prose
 * about who decides, not a fourth source of numbers.
 */

const legend = renderToStaticMarkup(<AuthorityLegend />);

describe("the authority legend distinguishes the three layers", () => {
  it("names ASSAY as the deterministic financial authority", () => {
    expect(legend).toContain("ASSAY — deterministic financial authority");
    expect(legend).toContain("Decides. The financial authority.");
    expect(legend).toContain("Ambiguity Certificate");
    expect(legend).toContain("Nothing on this page can overrule it.");
  });

  it("names the controller as bounded orchestration with no authority", () => {
    expect(legend).toContain("Controller — bounded orchestration");
    expect(legend).toContain("Chooses what to look at next. No authority.");
    expect(legend).toContain("Deterministic policy, not a model");
    // The bound is stated structurally — four reads — rather than as a phase
    // the product has not finished. A reader must be able to see WHY it cannot
    // write, not just be told that it did not.
    expect(legend).toContain("Its tool surface is four reads");
    expect(legend).toContain("opens no ledger event and moves no balance");
    expect(legend).toContain("would be a fifth LLM role the spec forbids");
  });

  it("names the explanation model as explanation only, after the fact, and removable", () => {
    expect(legend).toContain("Explanation model — explanation only");
    // F-13: no provider brand in standing copy. `apps/api` resolves the
    // provider at request time, so a name here would be a claim about a server
    // this component never saw.
    expect(legend).not.toContain("Gemini");
    expect(legend).not.toContain("Anthropic");
    expect(legend).toContain("Describes a decision already made. No authority.");
    expect(legend).toContain("after the outcome is sealed");
    expect(legend).toContain("Cannot express an amount");
    expect(legend).toContain("the close loop runs unchanged without it");
  });

  it("orders them by authority: ASSAY, then controller, then the explanation model", () => {
    const positions = [
      legend.indexOf("ASSAY — deterministic financial authority"),
      legend.indexOf("Controller — bounded orchestration"),
      legend.indexOf("Explanation model — explanation only"),
    ];
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("displays no figure of its own — it is a legend, not a fourth data source", () => {
    // No rupee amount, and no identifier from any run. Every number on the
    // Command Center still comes from the API panels around this block.
    expect(legend).not.toContain("₹");
    expect(legend).not.toContain("run_");
    expect(legend).not.toContain("dec_");
  });
});

describe("the Command Center carries the legend above the controller panel", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext()}>
        <CommandCenter />
      </RunContext.Provider>
    </MemoryRouter>,
  );

  it("renders the legend once a run exists", () => {
    expect(html).toContain("Who decides what");
    expect(html).toContain("ASSAY — deterministic financial authority");
  });

  it("puts it before the close controller panel it explains", () => {
    const legendAt = html.indexOf("Who decides what");
    const panelAt = html.indexOf("Finance Controller — bounded orchestration");
    expect(legendAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(legendAt);
  });

  it("is absent before a run is started — it has nothing to be a legend for", () => {
    const empty = renderToStaticMarkup(
      <MemoryRouter>
        <RunContext.Provider value={runContext({ run: null })}>
          <CommandCenter />
        </RunContext.Provider>
      </MemoryRouter>,
    );
    expect(empty).not.toContain("Who decides what");
  });
});
