import { Hono } from "hono";

import type { ExplainProvider } from "./explain/provider.js";
import { RunRegistry, type RegistryOptions } from "./registry.js";
import { controllerRoutes } from "./routes/controller.js";
import { explainRoutes } from "./routes/explain.js";
import { ledgerVerifyRoutes } from "./routes/ledger-verify.js";
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
 * **`/ledger/verify` is now built, and the reasoning above is why it was
 * always going to be one of the next ones.** `§9` gives it as the endpoint
 * that lets *"a reviewer check tamper-evidence live rather than be told about
 * it"*; `routes/ledger-verify.ts` is a small route over `verifyChain`, over
 * the stored run's own `chain.events` and `chain.genesis_hash`. It is built
 * now because `@assay/controller`'s `ledger_verify` tool reads it — the close
 * controller refuses to plan against a chain it has not itself recomputed.
 *
 * **No health endpoint.** `§9`'s table declares nine routes and none of them is
 * one, and a liveness probe answers a question nobody in this architecture is
 * asking: the API binds to loopback and is consumed by one page on the same
 * machine.
 *
 * **Two routes here are not in `§9`'s table, and neither is a reconciliation
 * route.**
 *
 * `POST /runs/:id/decisions/:decision_id/explain` is the product's *"Explain
 * with AI"*: it reads the `DecisionEvidence` this process already sealed,
 * sends it through `ARCHITECTURE.md §6.5`'s `LlmProvider` interface, and
 * returns prose that passed `§4` boundary 2's three checks. It decides
 * nothing — `routes/explain.ts` states the guarantee and `explain/service.ts`
 * implements it — and every other route on this surface answers identically
 * whether it is configured, unreachable or absent.
 *
 * `routes/controller.ts` drives `@assay/controller`'s close controller over a
 * sealed run and serves its trace. It is orchestration over the four read
 * routes above, not a fifth reconciliation surface: it evaluates no
 * constraint, ranks no candidate, and (in this phase) writes nothing — its
 * terminal state is human review, never a ledger event. See that module for
 * the guarantee stated in full.
 */
export interface ApiOptions extends RegistryOptions {
  /** Injectable so a test can drive a registry it also inspects. */
  readonly registry?: RunRegistry | undefined;
  /**
   * Explanation provider override.
   *
   * Absent in production, where `explain/config.ts` reads the environment: the
   * credential lives in the server process and nowhere else. Present so the
   * suite can exercise every branch of `§12`'s failure table, and so an
   * end-to-end check can run without spending a metered call.
   *
   * Typed as the shared {@link ExplainProvider} contract rather than as one
   * class, so a check can drive `anthropic` or `gemini` through the same door
   * the environment selects between.
   */
  readonly explainProvider?: (() => ExplainProvider) | undefined;
}

export function createApp(options: ApiOptions = {}): Hono {
  const registry = options.registry ?? new RunRegistry(options);
  const app = new Hono();

  app.route("/", runRoutes(registry));
  app.route("/", explainRoutes(registry, { provider: options.explainProvider }));
  app.route("/", ledgerVerifyRoutes(registry));
  app.route("/", controllerRoutes(registry));

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
