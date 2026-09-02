import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

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

const chosen = port();
serve({ fetch: createApp().fetch, hostname: HOST, port: chosen }, (info) => {
  process.stdout.write(`assay-api listening on http://${HOST}:${String(info.port)}\n`);
});
