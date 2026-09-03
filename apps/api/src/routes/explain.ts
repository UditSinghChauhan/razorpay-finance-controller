import type { DecisionEvidence } from "@assay/cli";
import { Hono } from "hono";

import { resolveProvider } from "../explain/config.js";
import { explainEvidence } from "../explain/evidence.js";
import { evidenceSummary } from "../explain/fallback.js";
import type { ExplainFailure } from "../explain/failure.js";
import type { ExplainProvider } from "../explain/provider.js";
import { explainDecision, type ExplainOutcome } from "../explain/service.js";
import type { RunRegistry, StoredRun } from "../registry.js";

/**
 * `POST /runs/:id/decisions/:decision_id/explain` — the product's *"Explain
 * with AI"*, over evidence the server loads itself.
 *
 * **The request body carries presentation preferences and nothing else.** There
 * is no field on it through which a client could supply an amount, a state, a
 * certificate or an identifier; the route resolves `:id` and `:decision_id`
 * against the in-memory registry and reads the `DecisionEvidence` that
 * `POST /runs` sealed. `THREAT_MODEL.md §T3` is the reason stated in one line:
 * a browser that could submit the financial evidence could submit any figure,
 * and the model would then be grounded against a number nothing in the ledger
 * supports.
 *
 * **What comes back, and in what order it should be read.**
 *
 * ```
 *   decision_id, run_id     the pair that was asked about
 *   status                  ok | rejected | unavailable
 *   explanation             the model's, or null
 *   fallback                ASSAY's own evidence summary, on `unavailable`
 *   provider                which model answered, and how long it took
 *   grounding               what was checked, and the state ASSAY decided
 *   failure                 why there is no explanation, when there is none
 * ```
 *
 * **`explanation` and `fallback` are never both populated, and `fallback` is
 * never a model's words.** The provider is selected on the server from
 * `ASSAY_EXPLAIN_PROVIDER`; the browser asks for an explanation and is told
 * which provider answered, never which one to use and never with what
 * credential.
 *
 * `grounding.deterministic_state` is read off the sealed decision on **every**
 * branch of `explain/service.ts`, so the state this route reports is the
 * engine's whether the model answered, failed, or answered something that was
 * discarded. Nothing the provider returns can reach it.
 *
 * **Status codes.** A configuration or transport failure answers `503`: the
 * server genuinely cannot do the thing that was asked, and saying `200` would
 * make an operational fault look like a product outcome. A response the model
 * produced and `ARCHITECTURE.md §4` boundary 2 **discarded** answers `200` with
 * `status: "rejected"` — that is the control working exactly as specified, not
 * a server error, and the page has something true to show. `404` is unchanged
 * from the sibling read routes and is answered before a provider is built, so
 * an unknown id never spends a metered call.
 */

/** `§9`'s 404 body, in the wording the read routes already use. */
function notFound(id: string): { error: string; message: string; run_id: string } {
  return {
    error: "unknown_run",
    message:
      `No run ${id} is held by this process. Runs live in memory for the life of the ` +
      `server (ARCHITECTURE.md §8's SQLite store is not built), so a run started before a ` +
      `restart is gone. POST /runs to start one.`,
    run_id: id,
  };
}

/**
 * The presentation preferences a caller may express.
 *
 * Closed, and closed for the reason the whole route exists: an open options
 * object is the seam through which evidence eventually arrives. `audience`
 * selects wording only and is not on the prompt path at this version — it is
 * accepted and echoed so the frontend has a stable field to grow into, and
 * refused when it is not one of the two known values rather than silently
 * ignored.
 */
const AUDIENCES = Object.freeze(["analyst", "executive"] as const);
type Audience = (typeof AUDIENCES)[number];

interface Preferences {
  readonly audience: Audience;
}

type PreferenceParse =
  | { readonly ok: true; readonly preferences: Preferences }
  | { readonly ok: false; readonly reason: "unknown_audience" | "unexpected_field"; readonly received: unknown };

/**
 * Parse the body, refusing every field that is not a presentation preference.
 *
 * Rejecting an unknown key rather than ignoring it is the point. A body that
 * silently drops `{"materiality_paise": 1}` and a body that refuses it behave
 * identically today and diverge the moment someone adds a field lookup; only
 * the second one makes "the browser cannot submit the financial evidence" a
 * property a test can hold onto.
 */
function readPreferences(raw: unknown): PreferenceParse {
  if (raw === null || typeof raw !== "object") return { ok: true, preferences: { audience: "analyst" } };
  const fields = raw as Record<string, unknown>;
  const unexpected = Object.keys(fields).filter((k) => k !== "audience");
  if (unexpected.length > 0) return { ok: false, reason: "unexpected_field", received: unexpected };
  const audience = fields["audience"] ?? "analyst";
  if (typeof audience !== "string" || !(AUDIENCES as readonly string[]).includes(audience)) {
    return { ok: false, reason: "unknown_audience", received: audience };
  }
  return { ok: true, preferences: { audience: audience as Audience } };
}

/** The body every branch answers with, so the page can render one shape. */
function body(
  stored: StoredRun,
  decisionId: string,
  audience: Audience,
  outcome: ExplainOutcome,
): unknown {
  return {
    run_id: stored.run_id,
    decision_id: decisionId,
    audience,
    status: outcome.status,
    explanation: outcome.explanation,
    fallback: outcome.fallback,
    provider: outcome.provider,
    grounding: outcome.grounding,
    failure: outcome.failure,
  };
}

/**
 * The body used when no provider could be built — nothing was ever sent.
 *
 * It still carries the deterministic summary. An unconfigured server and an
 * unreachable one are different facts about the deployment and the same fact
 * about the analyst's screen: there is no model answer, and the evidence is
 * still there to be read. `failure.code` keeps the two apart.
 */
function unconfigured(
  stored: StoredRun,
  decisionId: string,
  decision: DecisionEvidence,
  audience: Audience,
  failure: ExplainFailure,
): unknown {
  const evidence = explainEvidence(stored, decision);
  return {
    run_id: stored.run_id,
    decision_id: decisionId,
    audience,
    status: "unavailable",
    explanation: null,
    fallback: evidenceSummary(evidence),
    provider: null,
    grounding: {
      decision_evidence_verified: true,
      certificate_used: decision.certificate !== null,
      decision_authority: "none",
      deterministic_state: evidence.deterministicState,
      checks: { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" },
      rejected_entity_ids: [],
      rejected_numerals: [],
      // Nothing was hashed because nothing was sent. The count is the evidence
      // the summary above IS grounded in, which is not zero.
      system_prompt_id: null,
      system_prompt_hash: "",
      input_hash: "",
      cache_key: "",
      evidence_item_count: evidence.evidenceSet.length,
    },
    failure,
  };
}

export interface ExplainRouteOptions {
  /**
   * Provider override, for tests and for an end-to-end check that must not
   * spend a metered call.
   *
   * Absent in production: `resolveProvider()` reads the environment, which is
   * the only place a credential lives.
   */
  readonly provider?: (() => ExplainProvider) | undefined;
}

export function explainRoutes(
  registry: RunRegistry,
  options: ExplainRouteOptions = {},
): Hono {
  const app = new Hono();

  app.post("/runs/:id/decisions/:decision_id/explain", async (c) => {
    const runId = c.req.param("id") ?? "";
    const stored = registry.get(runId);
    if (stored === undefined) return c.json(notFound(runId), 404);

    const decisionId = c.req.param("decision_id") ?? "";
    const decision = stored.decisionsById.get(decisionId);
    if (decision === undefined) {
      return c.json(
        {
          error: "unknown_decision",
          message:
            `Run ${stored.run_id} holds no decision ${decisionId}. A REFERENCE observation ` +
            `produces no Decision at all (DATA_MODEL.md §13), so it has no id here.`,
          run_id: stored.run_id,
          decision_id: decisionId,
        },
        404,
      );
    }

    // An absent or unparseable body is the documented default request: the
    // endpoint takes presentation preferences, and having none is legitimate.
    const raw: unknown = await c.req.json().catch(() => null);
    const preferences = readPreferences(raw);
    if (!preferences.ok) {
      return c.json(
        {
          error: preferences.reason,
          message:
            `This endpoint accepts presentation preferences only — audience: ` +
            `${AUDIENCES.join(" | ")}. It accepts no evidence of any kind: the server ` +
            `reads the DecisionEvidence from its own run registry, so a decision cannot ` +
            `be explained against figures a client supplied.`,
          received: preferences.received,
          supported: AUDIENCES,
        },
        400,
      );
    }
    const { audience } = preferences.preferences;

    let provider: ExplainProvider;
    if (options.provider === undefined) {
      const resolved = resolveProvider();
      if (!resolved.ok) {
        // Nothing was sent anywhere: there was no provider to send it to.
        return c.json(
          unconfigured(stored, decisionId, decision, audience, resolved.failure),
          503,
        );
      }
      provider = resolved.provider;
    } else {
      provider = options.provider();
    }
    const outcome = await explainDecision({
      stored,
      decision,
      provider,
      providerFailures: () => provider.failures,
    });

    // 503 only where the server could not do the work. A discarded response is
    // the boundary doing its job and answers 200 with `status: "rejected"`.
    return c.json(body(stored, decisionId, audience, outcome), outcome.status === "unavailable" ? 503 : 200);
  });

  return app;
}
