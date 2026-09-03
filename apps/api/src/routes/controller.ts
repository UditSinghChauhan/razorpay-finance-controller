import {
  DEFAULT_STEP_BUDGET,
  evaluateController,
  runController,
  type ControllerTrace,
} from "@assay/controller";
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
 * should not have to compute from it, plus the telemetry derived from it.
 *
 * **`telemetry` is additive and derived, never authoritative.**
 * `evaluateController` is a pure function of the trace above it: a client that
 * distrusts these figures can recompute every one of them from `steps`,
 * `escalations` and `plan` in the same response and must get the same answer.
 * It is served here rather than computed in the browser only so `apps/web`
 * need not take a dependency on `@assay/controller`; it adds no fact the trace
 * did not already carry, and it is labelled `EXPLORATORY` at its own root
 * (`DECISION_BRIEF.md §L.4`).
 *
 * `stepBudget` is passed in rather than defaulted here. It is the ONE bound
 * the trace was actually produced under, and {@link controllerRoutes} hands
 * the identical value to `runController`; see that function on why the two
 * must not be allowed to default independently.
 */
function traceBody(trace: ControllerTrace, stepBudget: number): unknown {
  return {
    ...trace,
    // Restated at the top level, so a client reading the response does not
    // have to know that `writes_attempted`/`writes_applied` are on the trace
    // to notice that both are always zero in this phase.
    financial_write_performed: trace.writes_attempted > 0 || trace.writes_applied > 0,
    awaiting_human_review: trace.escalations.length > 0,
    telemetry: evaluateController(trace, stepBudget),
  };
}

export interface ControllerRouteOptions {
  /**
   * The step bound every request on these routes is driven under.
   *
   * Optional, and absent in production: `app.ts` mounts these routes with no
   * options, so the value stays `DEFAULT_STEP_BUDGET` exactly as before. It
   * exists so the bound can be driven to a non-default value in a test, which
   * is the only way the single-source-of-truth below can be proved rather than
   * asserted.
   */
  readonly stepBudget?: number | undefined;
}

/**
 * Mount the two controller routes.
 *
 * **The step budget is resolved once, here, and the same value reaches both
 * `runController` and `evaluateController`.** Both of those parameters default
 * to `DEFAULT_STEP_BUDGET` independently, and the trace does not carry the
 * bound it ran under — so a call site that passed a budget to the machine and
 * let the telemetry default would report `step_budget` as 64 beside a run that
 * actually stopped at, say, 3. That is not a wrong pixel: `budget_not_exhausted`
 * is a policy-compliance check, and a stale bound next to it turns the
 * telemetry's own guarantee — *every figure here is recomputable from the
 * trace* — into something a reader cannot in fact recompute. Binding the value
 * to one `const` makes the two calls unable to disagree.
 */
export function controllerRoutes(registry: RunRegistry, options: ControllerRouteOptions = {}): Hono {
  const app = new Hono();
  const stepBudget = options.stepBudget ?? DEFAULT_STEP_BUDGET;

  const handler = async (c: Context): Promise<Response> => {
    const id = c.req.param("id") ?? "";
    const stored = registry.get(id);
    if (stored === undefined) return c.json(notFound(id), 404);

    const trace = await runController({
      runId: stored.run_id,
      tools: controllerToolsFor(stored),
      budget: stepBudget,
    });
    return c.json(traceBody(trace, stepBudget));
  };

  app.post("/runs/:id/controller/start", handler);
  app.get("/runs/:id/controller", handler);

  return app;
}
