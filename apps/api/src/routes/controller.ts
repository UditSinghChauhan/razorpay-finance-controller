import { runController, type ControllerTrace } from "@assay/controller";
import { Hono, type Context } from "hono";

import { controllerToolsFor } from "../controller/runtime.js";
import type { RunRegistry } from "../registry.js";

/**
 * `POST /runs/:id/controller/start` and `GET /runs/:id/controller` — the
 * product surface for `@assay/controller`, over one sealed run.
 *
 * **Not in `ARCHITECTURE.md §9`'s table, and not a reconciliation route.**
 * `app.ts`'s own docstring states the boundary: this drives a bounded
 * orchestrator over the four routes `§9` already declares, and in this phase
 * it writes nothing. `POST .../controller/start` is not `POST /runs` — it
 * starts no new reconciliation, mints no decision, and appends no `§16`
 * event; it drives the controller once over a run this process already holds
 * and returns the trace that produced.
 *
 * **The controller re-runs on every `POST`, and that is deliberate.** Nothing
 * is memoised across a call: `runController` reads the SAME sealed
 * `StoredRun` every time (`controllerToolsFor` is rebuilt fresh, per request),
 * so requirement 9's determinism — *"repeated execution on the same demo
 * produces the same controller outcome"* — is a property of every request
 * this route answers, not just of the test suite. `GET` re-runs identically
 * rather than reading a cache, for the same reason: a stale trace next to a
 * live run would be a second place *"what does the controller say"* could
 * disagree with itself.
 */

function notFound(id: string): { error: string; message: string; run_id: string } {
  return {
    error: "unknown_run",
    message:
      `No run ${id} is held by this process. Runs live in memory for the life of the ` +
      `server, so a run started before a restart is gone. POST /runs to start one.`,
    run_id: id,
  };
}

/**
 * The body every branch answers with — the trace, plus the two facts a reader
 * should not have to compute from it: whether anything was written, and
 * whether a person is now waiting on this batch.
 */
function traceBody(trace: ControllerTrace): unknown {
  return {
    ...trace,
    // Restated at the top level, so a client reading the response does not
    // have to know that `writes_attempted`/`writes_applied` are on the trace
    // to notice that both are always zero in this phase.
    financial_write_performed: trace.writes_attempted > 0 || trace.writes_applied > 0,
    awaiting_human_review: trace.escalations.length > 0,
  };
}

export function controllerRoutes(registry: RunRegistry): Hono {
  const app = new Hono();

  const handler = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const stored = registry.get(id);
    if (stored === undefined) return c.json(notFound(id), 404);

    const trace = await runController({ runId: stored.run_id, tools: controllerToolsFor(stored) });
    return c.json(traceBody(trace));
  };

  app.post("/runs/:id/controller/start", handler);
  app.get("/runs/:id/controller", handler);

  return app;
}
