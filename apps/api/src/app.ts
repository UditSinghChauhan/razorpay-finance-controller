import { Hono } from "hono";

import { RunRegistry, type RegistryOptions } from "./registry.js";
import { runRoutes } from "./routes/runs.js";

/**
 * The ASSAY internal API — `ARCHITECTURE.md §3`'s *"thin HTTP over engine +
 * ledger"*.
 *
 * `§9`: *"Internal HTTP, `apps/api`, consumed only by `apps/web`. Local bind
 * only."* Four of `§9`'s nine routes are mounted, which is what
 * `DECISION_BRIEF.md §C` **T0-12** needs — *"close report, exception queue
 * (value-ranked), **certificate drill-down**"*. The remainder are not stubbed:
 * `GET /runs/:id` wants stage timings this composition does not record,
 * `POST /runs/:id/close` wants a close to be re-attemptable independently of the
 * run that produced it, `/abstention-telemetry` reports metric 17 against
 * `PREREGISTRATION.md §7`'s frozen baseline and is therefore a **measurement**
 * surface this package deliberately does not have, and `/bench/:version` serves
 * a benchmark report. Each is absent rather than answered with an invented
 * value.
 *
 * **`/ledger/verify` is absent for a different reason and it is worth naming.**
 * `§9` gives it as the endpoint that lets *"a reviewer check tamper-evidence
 * live rather than be told about it"*, and everything it needs is already on
 * this API's `close` response — `genesis_hash`, `ledger_root_hash` and the
 * gate's own `g4_hash_chain`. It is a small route over `verifyChain` and it
 * belongs here; it is simply not in this task's four.
 *
 * **No health endpoint.** `§9`'s table declares nine routes and none of them is
 * one, and a liveness probe answers a question nobody in this architecture is
 * asking: the API binds to loopback and is consumed by one page on the same
 * machine.
 */
export interface ApiOptions extends RegistryOptions {
  /** Injectable so a test can drive a registry it also inspects. */
  readonly registry?: RunRegistry | undefined;
}

export function createApp(options: ApiOptions = {}): Hono {
  const registry = options.registry ?? new RunRegistry(options);
  const app = new Hono();

  app.route("/", runRoutes(registry));

  // A JSON 404 rather than Hono's text default: every other answer on this API
  // is JSON, and a client that has to branch on content type to read an error
  // is a client that will not read it.
  app.notFound((c) =>
    c.json(
      {
        error: "not_found",
        message: `No route matches ${c.req.method} ${new URL(c.req.url).pathname}.`,
      },
      404,
    ),
  );

  return app;
}
