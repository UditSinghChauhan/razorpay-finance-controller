import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RunContext } from "../src/context/RunContext.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { InvestigationQueue } from "../src/pages/InvestigationQueue.js";
import { RECONCILIATION_LABEL } from "../src/lib/copy.js";
import { EXCEPTIONS, RUN, runContext } from "./fixtures.js";

/**
 * F5 — the two abstention granularities, and A2 — the reconciliation basis.
 *
 * `POST /runs` reports 1 abstention DECISION and 6 abstained OBSERVATIONS on the
 * demo run. Both are correct and neither is adjusted; what the pages must do is
 * say which one they are showing.
 */

function render(page: React.ReactElement): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext()}>{page}</RunContext.Provider>
    </MemoryRouter>,
  );
}

describe("Command Center — decision granularity", () => {
  const html = render(<CommandCenter />);

  it("names the count as abstention decisions", () => {
    expect(html).toContain("Abstention Decisions");
    expect(html).toContain("1 abstention decision");
  });

  it("names the observation count beside it, so neither reads as a contradiction", () => {
    expect(html).toContain("6 affected observations");
  });

  it("uses the API's own counts, unadjusted", () => {
    expect(RUN.summary.abstentions).toBe(1);
    expect(RUN.summary.observation_states["ABSTAINED"]).toBe(6);
  });
});

describe("Command Center — reconciliation is value-weighted", () => {
  const html = render(<CommandCenter />);

  it("labels the percentage value-weighted", () => {
    expect(RECONCILIATION_LABEL).toBe("Value-Weighted Reconciliation");
    expect(html).toContain("Value-Weighted Reconciliation");
  });

  it("states the basis, so it cannot be read as a count", () => {
    expect(html).toContain("Value-weighted reconciliation = (batch value");
    expect(html).toContain("It is not a count of observations.");
  });

  it("still shows the value-weighted figure the close report implies", () => {
    // (134_943_859 − 10_000_000) / 134_943_859 = 92.6%. The count-weighted
    // figure over the same run (464/500 = 92.8%) is a different number and is
    // deliberately not shown here.
    expect(html).toContain("92.6%");
    expect(html).not.toContain("92.8%");
  });
});

describe("Investigation Queue — observation granularity", () => {
  const html = render(<InvestigationQueue />);

  it("says the rows are affected observations", () => {
    expect(html).toContain("6 affected observations");
  });

  it("ties the rows back to the one abstention decision", () => {
    expect(html).toContain("the observation-level consequences of 1 abstention decision");
  });

  it("labels the filter and the table at observation granularity", () => {
    expect(html).toContain("Abstained observations (6)");
    expect(html).toContain("Queued Observations");
    expect(html).toContain("One row per affected observation");
  });

  it("does not collapse the six rows", () => {
    const abstained = EXCEPTIONS.items.filter((i) => i.state === "ABSTAINED");
    expect(abstained).toHaveLength(6);
    for (const item of abstained) expect(html).toContain(item.entity_id);
  });
});
