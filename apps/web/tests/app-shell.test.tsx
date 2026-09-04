import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Sidebar } from "../src/components/Sidebar.js";
import { TopBar } from "../src/components/TopBar.js";
import { RunContext } from "../src/context/RunContext.js";
import { runContext } from "./fixtures.js";

/**
 * The shell: the reviewer journey in the sidebar, and the way back in the top
 * bar.
 *
 * **What this file can and cannot check.** The run has no layout engine, so
 * the *widths* at which the sidebar becomes a rail and then a drawer are
 * asserted against the stylesheet in `tests/web-responsive-shell.test.ts`.
 * What is asserted here is the half that lives in the markup: that the drawer
 * has an open state the shell can drive, that the menu button reports it, that
 * both label variants are in the document at every width so the CSS swap has
 * something to swap, and that every deep page names its parent.
 */

function shell(node: React.ReactElement, route = "/command-center", ctx = runContext()): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <RunContext.Provider value={ctx}>{node}</RunContext.Provider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// The sidebar is the journey
// ---------------------------------------------------------------------------

describe("the sidebar shows the whole reviewer journey, in order", () => {
  const html = shell(<Sidebar />);

  it("names all five steps", () => {
    for (const label of [
      "Command Center",
      "Investigation Queue",
      "Evidence Trail",
      "Ambiguity Certificate",
      "Verify Ledger",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("orders them Command Center → Queue → Evidence → Certificate → Audit", () => {
    const positions = [
      html.indexOf("Command Center"),
      html.indexOf("Investigation Queue"),
      html.indexOf("Evidence Trail"),
      html.indexOf("Ambiguity Certificate"),
      html.indexOf("Verify Ledger"),
    ];
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("numbers them, so the list reads as a path rather than five destinations", () => {
    for (const step of ["1", "2", "3", "4", "5"]) {
      expect(html).toContain(`<span class="sidebar-step" aria-hidden="true">${step}</span>`);
    }
  });

  it("carries both label variants, because the rail swaps between them in CSS", () => {
    expect(html).toContain('class="sidebar-nav-label-full"');
    expect(html).toContain('class="sidebar-nav-label-short"');
  });

  it("invents no destination beyond the five real routes", () => {
    // Settings and Ledger Explorer were removed with their routes; a nav item
    // that promises a page this system must not have is worse than no item.
    expect(html).not.toContain("Settings");
    expect(html).not.toContain("Ledger Explorer");
  });
});

describe("the two decision-scoped steps are shown but not enterable until one is selected", () => {
  const withoutDecision = shell(<Sidebar />, "/command-center", runContext({ selectedDecisionId: null }));
  const withDecision = shell(<Sidebar />, "/command-center", runContext({ selectedDecisionId: "dec_x" }));

  it("disables Evidence Trail and Ambiguity Certificate with no decision selected", () => {
    // Both are about ONE decision. Opening either with nothing selected is not
    // navigation, so they are rendered disabled — visible as steps 3 and 4,
    // with the reason stated — rather than hidden.
    expect(withoutDecision).toContain('aria-disabled="true"');
    expect(withoutDecision).toContain("Select a decision in the Investigation Queue");
    expect(withoutDecision).not.toContain('href="/evidence-trail"');
    expect(withoutDecision).not.toContain('href="/ambiguity-certificate"');
  });

  it("makes both reachable once a decision is selected", () => {
    expect(withDecision).toContain('href="/evidence-trail"');
    expect(withDecision).toContain('href="/ambiguity-certificate"');
    expect(withDecision).not.toContain('aria-disabled="true"');
  });

  it("keeps the always-reachable steps as links either way", () => {
    for (const html of [withoutDecision, withDecision]) {
      expect(html).toContain('href="/command-center"');
      expect(html).toContain('href="/investigation-queue"');
      expect(html).toContain('href="/audit-logs"');
    }
  });
});

describe("the drawer has an open state the shell can drive", () => {
  it("reports closed by default", () => {
    expect(shell(<Sidebar />)).toContain('data-open="false"');
  });

  it("reports open when the shell opens it", () => {
    expect(shell(<Sidebar open />)).toContain('data-open="true"');
  });

  it("renders without a RunContext at all, so a nav cannot make the app unmountable", () => {
    const bare = renderToStaticMarkup(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(bare).toContain("Command Center");
    expect(bare).toContain('aria-disabled="true"');
  });
});

// ---------------------------------------------------------------------------
// The top bar is the way back
// ---------------------------------------------------------------------------

describe("the breadcrumb names the parent step of every deep page", () => {
  const crumb = (route: string): string =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[route]}>
        <TopBar />
      </MemoryRouter>,
    );

  it("gives the Investigation Queue a link back to the Command Center", () => {
    const html = crumb("/investigation-queue");
    expect(html).toContain('href="/command-center"');
    expect(html).toContain("Investigation Queue");
  });

  it("gives the Evidence Trail a link back to the Investigation Queue", () => {
    const html = crumb("/evidence-trail");
    expect(html).toContain('href="/investigation-queue"');
    expect(html).toContain("Evidence Trail");
  });

  it("gives the Ambiguity Certificate a link back to the Evidence Trail", () => {
    const html = crumb("/ambiguity-certificate");
    expect(html).toContain('href="/evidence-trail"');
    expect(html).toContain("Ambiguity Certificate");
  });

  it("gives Verify Ledger a link back to the Command Center", () => {
    const html = crumb("/audit-logs");
    expect(html).toContain('href="/command-center"');
    expect(html).toContain("Verify Ledger");
  });

  it("gives the Command Center no parent, because it is the first step", () => {
    const html = crumb("/command-center");
    expect(html).toContain("Command Center");
    expect(html).not.toContain("href=");
  });
});

describe("the menu button reports the drawer's state", () => {
  const bar = (open: boolean): string =>
    renderToStaticMarkup(
      <MemoryRouter>
        <TopBar menuOpen={open} />
      </MemoryRouter>,
    );

  it("offers to open the menu when it is closed", () => {
    const html = bar(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open navigation menu"');
  });

  it("offers to close it when it is open", () => {
    const html = bar(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Close navigation menu"');
  });

  it("still carries nothing inert — no search, no bell, no avatar", () => {
    const html = bar(false);
    expect(html).not.toContain("search-box");
    expect(html).not.toContain("notifications");
    expect(html).not.toContain("avatar");
  });
});
