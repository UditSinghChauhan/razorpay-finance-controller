import {
  TOOL_SCHEMAS,
  type ToolRegistry,
} from "@assay/controller";

import { closeBody, queueRow } from "../routes/runs.js";
import { verifyBody } from "../routes/ledger-verify.js";
import type { StoredRun } from "../registry.js";

/**
 * Binds `@assay/controller`'s four-tool registry to one real, sealed run.
 *
 * **Every function below reuses a route's own body-building function** —
 * `closeBody` and `queueRow` from `routes/runs.ts`, `verifyBody` from
 * `routes/ledger-verify.ts` — rather than re-deriving the same projection a
 * second time. That is what makes the controller's reads and `apps/web`'s
 * direct reads of the same routes provably the same figures: one function
 * builds each body, and both callers use it.
 *
 * **This module performs no reconciliation of any kind.** It calls no
 * function in `packages/engine`, evaluates no constraint and ranks no
 * candidate; it indexes `StoredRun.result.evidence`, which `@assay/cli`'s
 * `runAssayComposedFull` already sealed, exactly as every other route on this
 * API does.
 *
 * **Every function returned is a `Promise`-returning wrapper over a
 * synchronous, in-process read.** There is no HTTP call here and no second
 * socket: the controller runs inside the same process that holds the
 * registry, `async` only because {@link ToolRegistry} is typed for a driver
 * that might one day cross a real network boundary (a remote provider, a
 * persisted store) without every call site changing shape.
 *
 * `TOOL_SCHEMAS.*.output.parse(...)` validates every body **before** it
 * reaches the controller, exactly as `machine.ts`'s own `invoke()` does a
 * second time on the other side — belt and suspenders across a boundary that
 * is, today, one process, but is written as if it were not.
 */

/**
 * Project `closeBody`'s full response down to the controller's narrower
 * `close_report` tool shape.
 *
 * `GET /runs/:id/close` serves several fields the controller's schema
 * deliberately excludes — `account_balances`, `report`, the raw journal and
 * event counts — because `packages/controller/src/tools.ts` narrows every
 * tool schema to what the policy actually reads, on purpose:
 * `strictObject` is chosen specifically so *"a field silently appearing is a
 * parse failure rather than a surprise"*. Reusing `closeBody` unfiltered
 * would defeat that: the schema would either have to widen (losing the
 * guarantee) or reject a body the route legitimately serves. Picking the
 * subset here, once, keeps both true.
 */
function closeReportBody(stored: StoredRun): unknown {
  const full = closeBody(stored) as Record<string, unknown>;
  const {
    run_id,
    period_status,
    gate,
    batch_value_paise,
    unresolved_value_paise,
    value_abstained_paise,
    value_exceptions_paise,
    close_threshold_paise,
    ledger_root_hash,
    genesis_hash,
    trial_balance_ok,
  } = full;
  return {
    run_id,
    period_status,
    gate,
    batch_value_paise,
    unresolved_value_paise,
    value_abstained_paise,
    value_exceptions_paise,
    close_threshold_paise,
    ledger_root_hash,
    genesis_hash,
    trial_balance_ok,
  };
}

/** The full, real exception queue for one run — every row, unfiltered. */
function fullExceptionQueue(stored: StoredRun): unknown {
  const rows = stored.result.evidence.decisions
    .filter((d) => d.state === "ABSTAINED" || d.state === "EXCEPTION")
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
  return {
    run_id: stored.run_id,
    total: rows.length,
    value_abstained_paise: stored.result.evidence.close.gate.value_abstained_paise,
    value_exceptions_paise: stored.result.evidence.close.gate.value_exceptions_paise,
    items: rows.map((d) => queueRow(stored, d.decision_id as string)),
  };
}

/**
 * The `decision_evidence` tool's narrower projection.
 *
 * `GET /runs/:id/decisions/:decision_id` returns the FULL `DecisionEvidence`
 * plus `certificate_allocation` — the two solutions' priced members, which the
 * controller may not hold (`packages/controller/src/tools.ts`: *"choosing
 * between them is the decision ASSAY declined to make ... a controller
 * holding both allocations in memory would be holding the material for a
 * choice it may not make"*). This is a **narrowing** of that route's own
 * `decision`, not a second read of anything — same `StoredRun`, same
 * `DecisionEvidence`, fewer fields kept.
 */
function decisionEvidenceBody(stored: StoredRun, decisionId: string): unknown {
  const decision = stored.decisionsById.get(decisionId);
  if (decision === undefined) {
    throw new Error(
      `run ${stored.run_id} holds no decision ${decisionId}`,
    );
  }
  const event = stored.eventsById.get(decision.evt_id as string) ?? null;
  const cert = decision.certificate;
  return {
    run_id: stored.run_id,
    decision_id: decision.decision_id,
    state: decision.state,
    kind: decision.kind,
    entity_id: decision.entity_id,
    value_paise: decision.value_paise,
    exception_class: decision.exception_class,
    suspense_key: decision.suspense_key,
    comp_id: decision.comp_id,
    certificate:
      cert === null
        ? null
        : {
            comp_id: cert.comp_id,
            reason: cert.reason,
            evidence_score_gap_bps: cert.evidence_score_gap_bps,
            epsilon_bps: cert.epsilon_bps,
            materiality_paise: cert.materiality_paise,
            tau_paise: cert.tau_paise,
            probes_attempted: cert.probes_attempted,
            shared_hard_constraint_count: cert.shared_hard_constraints.length,
            solution_a_member_count: cert.solution_a.member_obs_ids.length,
            solution_b_member_count: cert.solution_b.member_obs_ids.length,
          },
    event:
      event === null
        ? null
        : { evt_id: event.evt_id, seq: event.seq, prev_hash: event.prev_hash, hash: event.hash },
  };
}

/** Build a `ToolRegistry` over one sealed, in-memory run. */
export function controllerToolsFor(stored: StoredRun): ToolRegistry {
  return {
    close_report: async () => TOOL_SCHEMAS.close_report.output.parse(closeReportBody(stored)),
    exception_queue: async () =>
      TOOL_SCHEMAS.exception_queue.output.parse(fullExceptionQueue(stored)),
    decision_evidence: async ({ decision_id }) =>
      TOOL_SCHEMAS.decision_evidence.output.parse(decisionEvidenceBody(stored, decision_id)),
    ledger_verify: async () => TOOL_SCHEMAS.ledger_verify.output.parse(verifyBody(stored)),
  };
}
