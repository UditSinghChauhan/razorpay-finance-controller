import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { resolveProvider } from "./explain/config.js";

/**
 * `ARCHITECTURE.md §9`: *"Internal HTTP, `apps/api`, consumed only by
 * `apps/web`. **Local bind only.**"*
 *
 * The hostname is `127.0.0.1` and is not configurable. `§9` states the
 * constraint and `THREAT_MODEL.md` treats the surface as internal, so a
 * `0.0.0.0` fallback reachable through an environment variable would make the
 * one architectural property this server has depend on a deployment detail. The
 * port is settable because a port collision is an operational accident rather
 * than a security boundary.
 */
const HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;

function port(): number {
  const raw = process.env["ASSAY_API_PORT"];
  if (raw === undefined) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(
      `ASSAY_API_PORT must be an integer TCP port in [1, 65535]; received ${JSON.stringify(raw)}`,
    );
  }
  return parsed;
}

/**
 * One line naming the explanation provider this process resolved, at startup.
 *
 * **Why it exists.** The provider is chosen from the environment, and an
 * environment that never reached this process fails silently: the server starts,
 * every reconciliation route answers, and the misconfiguration surfaces only as a
 * sentence inside one 503 on one panel — where it reads as the wrong provider
 * having been chosen rather than as no environment having arrived. Saying it once
 * at boot puts the fact where an operator is already looking.
 *
 * **It calls `resolveProvider` rather than re-reading the environment**, so what
 * it prints is what the route will do and not a second derivation that can drift
 * from it. Resolution constructs an SDK client and makes no network call; nothing
 * is sent to a provider until a request asks for an explanation.
 *
 * **It cannot print a credential.** `ExplainProvider` exposes an id and a model
 * id and no key, and `ExplainFailure.message` is by contract safe to display —
 * `THREAT_MODEL.md §T11` keeps configuration out of the strings this surface
 * produces. The presence of a key is reported by whether a provider resolved at
 * all, which is the only thing an operator needs from this line.
 */
function explainProviderLine(): string {
  const resolved = resolveProvider();
  return resolved.ok
    ? `assay-api explanations: ${resolved.provider.id} / ${resolved.provider.modelId}\n`
    : `assay-api explanations: unavailable (${resolved.failure.code}) — ${resolved.failure.message}\n`;
}

const chosen = port();
serve({ fetch: createApp().fetch, hostname: HOST, port: chosen }, (info) => {
  process.stdout.write(`assay-api listening on http://${HOST}:${String(info.port)}\n`);
  process.stdout.write(explainProviderLine());
});
