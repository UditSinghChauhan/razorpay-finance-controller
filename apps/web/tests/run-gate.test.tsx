import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AmbiguityCertificate } from "../src/pages/AmbiguityCertificate.js";
import { AuditLogs } from "../src/pages/AuditLogs.js";
import { CommandCenter } from "../src/pages/CommandCenter.js";
import { EvidenceTrail } from "../src/pages/EvidenceTrail.js";
import { InvestigationQueue } from "../src/pages/InvestigationQueue.js";
import { ApiErrorNotice } from "../src/components/RunGate.js";
import { RunContext, type RehydrateState, type RunContextValue } from "../src/context/RunContext.js";
import { fetchRun } from "../src/hooks/useAssayApi.js";
import { runContext } from "./fixtures.js";

/**
 * The reload path: what a run-dependent page shows before it has a run.
 *
 * **The defect this file pins.** `RunContext` restores a persisted run
 * asynchronously — a run id and a period name go out to `GET /runs/:id` and the
 * summary comes back — and every page's own empty state used to render while
 * that request was outstanding. A reviewer who reloaded a deep link was told
 * *"Run the demo first"*, *"No active run"* or *"select a decision"* and then
 * watched the page they had asked for appear underneath the instruction. Worse,
 * the branch where the API never answered at all was computed and dropped, so a
 * server that was down looked exactly like a first visit.
 *
 * Each page now consults `useRunGate` before its own empty state, so all five
 * agree. That is what is asserted here: one table of pages, one table of
 * states, and every cell checked.
 *
 * **No figure is asserted anywhere in this file.** Every state below is
 * rendered from `RehydrateState` alone, with `run: null` — there is no run, so
 * there is nothing financial on screen to assert about.
 */

const PAGES = [
  ["Command Center", CommandCenter],
  ["Investigation Queue", InvestigationQueue],
  ["Verify Ledger", AuditLogs],
  ["Evidence Trail", EvidenceTrail],
  ["Ambiguity Certificate", AmbiguityCertificate],
] as const;

function renderPage(
  Page: () => React.ReactElement,
  overrides: Partial<RunContextValue>,
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext({ run: null, ...overrides })}>
        <Page />
      </RunContext.Provider>
    </MemoryRouter>,
  );
}

const RESTORING: RehydrateState = { kind: "restoring" };
const NOT_FOUND: RehydrateState = { kind: "not_found" };
const UNREACHABLE: RehydrateState = { kind: "unreachable", message: "Failed to fetch" };
const API_MISMATCH: RehydrateState = { kind: "api_mismatch" };

// ---------------------------------------------------------------------------
// restoring — no page may answer "start over" while the answer is in flight
// ---------------------------------------------------------------------------

describe("a run being restored is reported, on every page", () => {
  it.each(PAGES)("%s says it is restoring", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: RESTORING });
    expect(html).toContain("Restoring run");
  });

  it.each(PAGES)("%s does not tell a reviewer to start over while restoring", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: RESTORING });
    // The four instructions each page used to render over an incoming run.
    expect(html).not.toContain("Run the demo first");
    expect(html).not.toContain("No active run");
    expect(html).not.toContain("Select a decision from the Investigation Queue");
    expect(html).not.toContain("Run Demo");
  });

  it("says the figures come back from the server, not from the browser", () => {
    const html = renderPage(CommandCenter, { rehydrate: RESTORING });
    expect(html).toContain("nothing financial is restored from this browser");
  });
});

// ---------------------------------------------------------------------------
// not_found — a real state with an honest answer, not an error
// ---------------------------------------------------------------------------

describe("a run the API no longer holds is reported, on every page", () => {
  it.each(PAGES)("%s names the state and offers a new run", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: NOT_FOUND });
    expect(html).toContain("no longer held by the API");
    expect(html).toContain("Run this period");
  });

  it("says nothing financial was cached, because nothing was", () => {
    const html = renderPage(AuditLogs, { rehydrate: NOT_FOUND });
    expect(html).toContain("Nothing financial was cached in this browser");
    expect(html).toContain("only the run id and the period name");
  });
});

// ---------------------------------------------------------------------------
// unreachable — the branch that used to be computed and discarded
// ---------------------------------------------------------------------------

describe("an unreachable API during rehydration is reported, on every page", () => {
  it.each(PAGES)("%s names the API, the address and the command", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: UNREACHABLE });
    expect(html).toContain("ASSAY&#x27;s API is not reachable");
    expect(html).toContain("127.0.0.1:8787");
    expect(html).toContain("pnpm run dev:api");
  });

  it.each(PAGES)("%s keeps the underlying error rather than replacing it", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: UNREACHABLE });
    expect(html).toContain("Underlying error");
    expect(html).toContain("Failed to fetch");
  });

  it("says no credential is involved, so a missing key is not suspected", () => {
    const html = renderPage(CommandCenter, { rehydrate: UNREACHABLE });
    expect(html).toContain("No API key is needed");
  });

  it("offers a retry, because the pointer is kept on this branch", () => {
    const html = renderPage(CommandCenter, { rehydrate: UNREACHABLE });
    expect(html).toContain("Retry");
  });
});

// ---------------------------------------------------------------------------
// idle and restored let the page through
// ---------------------------------------------------------------------------

describe("the two states that are not a gate let the page render", () => {
  it("shows the start screen on a genuine first visit", () => {
    const html = renderPage(CommandCenter, { rehydrate: { kind: "idle" } });
    expect(html).toContain("ASSAY Command Center");
    expect(html).toContain("Run Demo");
    expect(html).not.toContain("Restoring run");
  });

  it("shows the queue's own empty state once nothing is being restored", () => {
    const html = renderPage(InvestigationQueue, { rehydrate: { kind: "idle" } });
    expect(html).toContain("Run the demo first");
  });

  it("shows Verify Ledger's own empty state once nothing is being restored", () => {
    const html = renderPage(AuditLogs, { rehydrate: { kind: "idle" } });
    expect(html).toContain("No active run");
  });
});

// ---------------------------------------------------------------------------
// The classifier, over the two failures it exists to keep apart
// ---------------------------------------------------------------------------

describe("a page-level failure is classified rather than printed", () => {
  const notice = (error: string): string =>
    renderToStaticMarkup(
      <MemoryRouter>
        <RunContext.Provider value={runContext()}>
          <ApiErrorNotice error={error} title="The run could not be started" />
        </RunContext.Provider>
      </MemoryRouter>,
    );

  it("turns a rejected fetch into an operator's instruction", () => {
    const html = notice("TypeError: Failed to fetch");
    expect(html).toContain("ASSAY&#x27;s API is not reachable");
    expect(html).toContain("pnpm run dev:api");
    // The raw string is demoted, never discarded.
    expect(html).toContain("TypeError: Failed to fetch");
  });

  it("keeps a server's own sentence when the server answered", () => {
    // A 4xx/5xx already carries the reason in its body. Replacing that with
    // "start the server" would destroy the only information the response had.
    const html = notice("400: unsupported_llm_provider");
    expect(html).toContain("The run could not be started");
    expect(html).toContain("400: unsupported_llm_provider");
    expect(html).not.toContain("pnpm run dev:api");
  });
});

// ---------------------------------------------------------------------------
// N-01 — two different `404`s, told apart by the body rather than the status
// ---------------------------------------------------------------------------

/**
 * **The defect this section pins.** `fetchRun` branched on `res.status === 404`
 * alone and called every one of them a missing run. `apps/api` answers `404`
 * for two unrelated reasons: `routes/runs.ts` answers `{"error":
 * "unknown_run"}` for a run its in-process registry no longer holds, and
 * `app.ts`'s fallback answers `{"error": "not_found"}` for a request that
 * matched no route — which is what a frontend built against `GET /runs/:id`
 * gets from an API process that predates the route, a live possibility because
 * the API does not hot-reload. Reading the second as the first told a reviewer
 * their run was gone on the evidence of a server that never looked it up.
 *
 * The two are now separate members of `RehydrateOutcome`, so the difference is
 * structural rather than a shade of one message, and neither invents anything
 * about the run: `fetchRun` returns a `run` on exactly one branch, the one
 * where the API sent one.
 */
describe("N-01: a 404 is read from the error code, not from the status", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** One canned response, in the shape `apps/api` actually answers with. */
  const stubFetch = (status: number, body: unknown): void => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status, headers: { "content-type": "application/json" } },
    ))));
  };

  it("reads unknown_run as a run the API no longer holds", async () => {
    stubFetch(404, {
      error: "unknown_run",
      message: "No run run_x is held by this process.",
      run_id: "run_x",
    });
    expect(await fetchRun("run_x")).toEqual({ kind: "not_found" });
  });

  it("reads a route-level not_found as an API that lacks the route", async () => {
    stubFetch(404, { error: "not_found", message: "No route matches GET /runs/run_x." });
    expect(await fetchRun("run_x")).toEqual({ kind: "api_mismatch" });
  });

  it("keeps the two apart, on the same status code", async () => {
    stubFetch(404, { error: "unknown_run", message: "gone", run_id: "run_x" });
    const missingRun = await fetchRun("run_x");
    stubFetch(404, { error: "not_found", message: "no route" });
    const missingRoute = await fetchRun("run_x");
    expect(missingRun.kind).not.toBe(missingRoute.kind);
  });

  it("assigns a 404 it cannot classify to neither, rather than guessing", async () => {
    // A 404 with no readable body is most likely not this API at all — a proxy
    // or a static server. Calling it a missing run would state a history no
    // response reported.
    stubFetch(404, "<!doctype html><title>404</title>");
    const outcome = await fetchRun("run_x");
    expect(outcome.kind).toBe("unreachable");
  });

  it("leaves every other HTTP failure exactly as it was", async () => {
    stubFetch(500, { error: "internal", message: "boom" });
    const outcome = await fetchRun("run_x");
    expect(outcome.kind).toBe("unreachable");
    if (outcome.kind === "unreachable") expect(outcome.message).toContain("500");
  });

  it("caches and fabricates no financial state on either 404 branch", async () => {
    for (const code of ["unknown_run", "not_found"]) {
      stubFetch(404, { error: code, message: "…", run_id: "run_x" });
      const outcome = await fetchRun("run_x");
      // `run` exists on exactly one member of the union — the one the API
      // supplied a summary for. Neither of these is it.
      expect(outcome).not.toHaveProperty("run");
      expect(JSON.stringify(outcome)).not.toContain("paise");
    }
  });
});

// ---------------------------------------------------------------------------
// N-01 — and the two states say different things on screen
// ---------------------------------------------------------------------------

describe("N-01: an API without the rehydration route is not a missing run", () => {
  it.each(PAGES)("%s names the version mismatch and the restart", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: API_MISMATCH });
    expect(html).toContain("This API build does not support run rehydration");
    expect(html).toContain("pnpm run dev:api");
  });

  it.each(PAGES)("%s does not claim the run is gone", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: API_MISMATCH });
    // The server never looked the run up, so its absence is not established.
    expect(html).not.toContain("no longer held by the API");
    expect(html).not.toContain("Runs live in the API process&#x27;s memory");
  });

  it.each(PAGES)("%s does not claim the API is unreachable, because it answered", (_name, Page) => {
    const html = renderPage(Page, { rehydrate: API_MISMATCH });
    expect(html).not.toContain("ASSAY&#x27;s API is not reachable");
  });

  it("says why the process can be stale, and offers the retry the pointer allows", () => {
    const html = renderPage(CommandCenter, { rehydrate: API_MISMATCH });
    expect(html).toContain("does not hot-reload");
    expect(html).toContain("Retry");
  });

  it("shows no figure and no verdict for a run nothing was reported about", () => {
    const html = renderPage(CommandCenter, { rehydrate: API_MISMATCH });
    expect(html).not.toContain("₹");
    expect(html).toContain("Nothing about the run itself was reported");
  });

  it("is a different screen from the missing-run one", () => {
    const mismatch = renderPage(CommandCenter, { rehydrate: API_MISMATCH });
    const gone = renderPage(CommandCenter, { rehydrate: NOT_FOUND });
    expect(mismatch).not.toEqual(gone);
    expect(gone).toContain("no longer held by the API");
    expect(gone).not.toContain("This API build does not support run rehydration");
  });
});
