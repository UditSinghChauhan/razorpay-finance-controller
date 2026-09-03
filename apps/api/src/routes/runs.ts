import { SUSPENSE_ACCOUNT } from "@assay/domain";
import { Hono } from "hono";

import { certificateAllocation } from "../allocation.js";
import { isDemoDatasetId, DEMO_DATASET_IDS } from "../datasets.js";
import type { RunRegistry, StoredRun } from "../registry.js";

/**
 * `ARCHITECTURE.md §9`'s run routes.
 *
 * **Every field this module returns is read off the evidence the engine
 * produced.** Nothing here evaluates a constraint, ranks a candidate, decides a
 * state, computes a balance or re-reads a threshold; the only work is selecting,
 * ordering and naming what `runAssayComposedFull` already returned. Where an
 * object exists on the evidence in the shape a client needs — a
 * `DecisionEvidence`, an `AmbiguityCertificate`, a `LedgerEvent`, a
 * `CloseReport` — it is passed through **by reference and unedited**, because a
 * re-keyed copy is a second place the record can drift from the one the hash
 * chain sealed.
 *
 * **No metric appears on this surface, and that is deliberate.**
 * `EVALUATION_SPEC.md §4`'s figures are the scorer's, `§5.5` admits only numbers
 * that exist in a committed run artifact, and `demo/README.md` records that
 * `demo-500` is never scored and is not benchmark evidence. This package
 * therefore declares no dependency on `packages/eval` and computes no coverage,
 * accuracy, harm or abstention rate. What it publishes instead are close-report
 * quantities (`DATA_MODEL.md §20`) and terminal-state counts, which are facts
 * about one run rather than measurements of a system.
 */

/** `§10.2`'s outcome and the figures `PROJECT_SPEC.md §10` step 1 puts on screen. */
function closeBody(stored: StoredRun): unknown {
  const { close, projection, chain } = stored.result.evidence;
  return {
    run_id: stored.run_id,
    // DATA_MODEL.md §20's three outcomes.
    period_status: close.period_status,
    // §10.2 requires the failing gate to be NAMED, so all five travel always —
    // "why won't it close" is the question an analyst actually asks (§9).
    gate: {
      g1_all_terminal: close.gate.g1_all_terminal,
      g2_trial_balance: close.gate.g2_trial_balance,
      g3_suspense_identity: close.gate.g3_suspense_identity,
      g4_hash_chain: close.gate.g4_hash_chain,
      g5_no_failed_invariant_posted: close.gate.g5_no_failed_invariant_posted,
      failed_gates: close.gate.failed_gates,
    },
    // §20's denominator lives on the CloseReport, which is the artifact the
    // section requires `period_status` to be recomputable from. `null` only on
    // BLOCKED, where §10.2 emits no report at all — reported as absent rather
    // than as a zero that would look like an empty batch.
    batch_value_paise: close.report?.batch_value_paise ?? null,
    unresolved_value_paise: close.gate.unresolved_value_paise,
    value_abstained_paise: close.gate.value_abstained_paise,
    value_exceptions_paise: close.gate.value_exceptions_paise,
    // G3's left side, from the books, beside the Suspense account's own balance.
    // The account is named by `@assay/domain`'s constant rather than spelled
    // here, so this file holds no second copy of the code.
    suspense_gross_item_paise: close.gate.suspense_gross_item_paise,
    suspense_balance_paise: projection.balances[SUSPENSE_ACCOUNT],
    // Layer B, recomputed from the log — never cached (ARCHITECTURE.md §8).
    trial_balance_ok: projection.trialBalanceOk,
    total_dr_paise: projection.totalDrPaise,
    total_cr_paise: projection.totalCrPaise,
    account_balances: projection.balances,
    // Layer A.
    genesis_hash: chain.genesis_hash,
    ledger_root_hash: chain.root_hash,
    event_count: projection.eventCount,
    journal_line_count: projection.journalLineCount,
    close_threshold_paise: close.close_threshold_paise,
    // `null` exactly on BLOCKED (§10.2, §L.1 rule 7). Passed through whole: it
    // is the artifact §20 requires `period_status` to be recomputable from.
    report: close.report,
  };
}

/** One row of `§9`'s *"exception + abstention queue, ranked by rupee value"*. */
function queueRow(stored: StoredRun, decisionId: string): unknown {
  const decision = stored.decisionsById.get(decisionId);
  if (decision === undefined) return null;
  return {
    decision_id: decision.decision_id,
    obs_id: decision.obs_id,
    entity_id: decision.entity_id,
    kind: decision.kind,
    state: decision.state,
    value_paise: decision.value_paise,
    exception_class: decision.exception_class,
    suspense_key: decision.suspense_key,
    comp_id: decision.comp_id,
    evt_id: decision.evt_id,
    // Whether the drill-down has a certificate to render, without shipping the
    // whole certificate on every queue row.
    has_certificate: decision.certificate !== null,
  };
}

export function runRoutes(registry: RunRegistry): Hono {
  const app = new Hono();

  /**
   * `POST /runs` — *"start a run over a named dataset. Body includes
   * `llm_provider`. Returns `run_id`."*
   *
   * The body is optional in full: `dataset` defaults to the one allowlisted
   * demo fixture and `llm_provider` to `offline`, which is the only mode
   * `PROJECT_SPEC.md §10`'s demo path uses. Both are still **validated** when
   * supplied, because a request that names something unsupported should be told
   * so rather than quietly run something else.
   */
  app.post("/runs", async (c) => {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await c.req.json();
      if (parsed !== null && typeof parsed === "object") {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // An absent or unparseable body is the documented default request, not an
      // error: `POST /runs` with no arguments starts the demo run.
      body = {};
    }

    const dataset = body["dataset"] ?? "demo-500";
    if (typeof dataset !== "string" || !isDemoDatasetId(dataset)) {
      return c.json(
        {
          error: "unknown_dataset",
          message:
            `This API runs an allowlisted demo dataset, never a path. ` +
            `Supported: ${DEMO_DATASET_IDS.join(", ")}.`,
          received: dataset,
          supported: DEMO_DATASET_IDS,
        },
        400,
      );
    }

    const provider = body["llm_provider"] ?? "offline";
    if (provider !== "offline") {
      return c.json(
        {
          error: "unsupported_llm_provider",
          message:
            `PROJECT_SPEC.md §10 runs the demo with --llm=offline "so it cannot fail on a ` +
            `network", and EVALUATION_SPEC.md §2 reserves replay for scored runs. This API ` +
            `scores nothing and supports offline only.`,
          received: provider,
        },
        400,
      );
    }

    const stored = await registry.create(dataset);
    const { run, evidence } = stored.result;

    // Terminal-state counts, over §L.1 rule 5's four states. Counted from the
    // run's own outcomes, which is where the states were decided.
    const states: Record<string, number> = {};
    for (const outcome of run.outcomes) {
      states[outcome.state] = (states[outcome.state] ?? 0) + 1;
    }

    return c.json(
      {
        run_id: stored.run_id,
        dataset: stored.dataset,
        agent_id: stored.agent_id,
        llm_provider: stored.llm_provider,
        observation_count: stored.observation_count,
        summary: {
          observation_states: states,
          decisions: evidence.decisions.length,
          abstentions: run.abstentions.length,
          open_exceptions: run.open_exceptions.length,
          certificates: evidence.certificates.length,
          probes_spent: run.probes_spent,
          period_status: evidence.close.period_status,
          unresolved_value_paise: evidence.close.gate.unresolved_value_paise,
          batch_value_paise: evidence.close.report?.batch_value_paise ?? null,
          ledger_root_hash: evidence.chain.root_hash,
          event_count: evidence.chain.events.length,
        },
      },
      201,
    );
  });

  /** Resolve `:id`, or answer `404` with the id that was asked for. */
  const require_ = (
    c: { req: { param: (k: string) => string | undefined } },
  ): StoredRun | string => {
    const id = c.req.param("id") ?? "";
    return registry.get(id) ?? id;
  };

  const notFound = (id: string): { error: string; message: string; run_id: string } => ({
    error: "unknown_run",
    message:
      `No run ${id} is held by this process. Runs live in memory for the life of the ` +
      `server (ARCHITECTURE.md §8's SQLite store is not built), so a run started before a ` +
      `restart is gone. POST /runs to start one.`,
    run_id: id,
  });

  /** `GET /runs/:id/close` — the close report `§10.4` produced. */
  app.get("/runs/:id/close", (c) => {
    const found = require_(c);
    if (typeof found === "string") return c.json(notFound(found), 404);
    return c.json(closeBody(found));
  });

  /**
   * `GET /runs/:id/exceptions` — *"exception + abstention queue, **ranked by
   * rupee value**, filterable by class."*
   *
   * Both populations, because `§9` names both and `EVALUATION_SPEC.md §6`
   * requires an abstention to be as visible as an exception. Ranked by
   * `value_paise` descending, ties broken on `decision_id` so the order is total
   * and two requests cannot disagree.
   */
  app.get("/runs/:id/exceptions", (c) => {
    const found = require_(c);
    if (typeof found === "string") return c.json(notFound(found), 404);

    const classFilter = c.req.query("class");
    const stateFilter = c.req.query("state");

    const rows = found.result.evidence.decisions
      .filter((d) => d.state === "ABSTAINED" || d.state === "EXCEPTION")
      .filter((d) => classFilter === undefined || d.exception_class === classFilter)
      .filter((d) => stateFilter === undefined || d.state === stateFilter)
      .slice()
      .sort((a, b) =>
        b.value_paise !== a.value_paise
          ? b.value_paise - a.value_paise
          : a.decision_id < b.decision_id
            ? -1
            : a.decision_id > b.decision_id
              ? 1
              : 0,
      );

    return c.json({
      run_id: found.run_id,
      total: rows.length,
      // The two rupee totals the queue header shows, from the close gate rather
      // than summed here — G3 already reconciled them against the books.
      value_abstained_paise: found.result.evidence.close.gate.value_abstained_paise,
      value_exceptions_paise: found.result.evidence.close.gate.value_exceptions_paise,
      items: rows.map((d) => queueRow(found, d.decision_id as string)),
    });
  });

  /**
   * `GET /runs/:id/decisions/:decision_id` — *"full drill-down: evidence,
   * constraints, certificate, hash-chain segment."*
   *
   * `decision` is the {@link DecisionEvidence} the run produced, unedited, and
   * the certificate is nested on it exactly where the engine put it — carrying
   * `solution_a`, `solution_b`, `shared_hard_constraints`,
   * `evidence_score_gap_bps`, `materiality_paise`, `epsilon_bps`, `tau_paise`,
   * `probes_attempted` and `reason`. `event` is the sealed `§16` record the
   * decision was appended as, with its `prev_hash` and `hash`.
   *
   * `certificate_allocation` is the **only** field on this surface that is not
   * a passthrough, and it is deliberately a sibling rather than an addition to
   * the certificate: `§13`'s record names each solution's members but prices
   * none of them, and `§17.1.1`'s journal lines are settlement-level, so a
   * drill-down comparing the two hypotheses has no member amount to read. It
   * carries the price the run's own observations state, leaves the certificate
   * byte-identical to the one the chain sealed, and is `null` where there is no
   * certificate. See `allocation.ts` for what it does and does not compute.
   */
  app.get("/runs/:id/decisions/:decision_id", (c) => {
    const found = require_(c);
    if (typeof found === "string") return c.json(notFound(found), 404);

    const decisionId = c.req.param("decision_id") ?? "";
    const decision = found.decisionsById.get(decisionId);
    if (decision === undefined) {
      return c.json(
        {
          error: "unknown_decision",
          message:
            `Run ${found.run_id} holds no decision ${decisionId}. A REFERENCE observation ` +
            `produces no Decision at all (DATA_MODEL.md §13), so it has no id here.`,
          run_id: found.run_id,
          decision_id: decisionId,
        },
        404,
      );
    }

    return c.json({
      run_id: found.run_id,
      decision,
      // §9's "hash-chain segment". Present for every decision: each is appended
      // as exactly one event, so the drill-down never dead-ends.
      event: found.eventsById.get(decision.evt_id as string) ?? null,
      certificate_allocation:
        decision.certificate === null
          ? null
          : certificateAllocation(
              decision.certificate,
              found.result.evidence.decisions,
              found.observationsById,
            ),
    });
  });

  return app;
}
