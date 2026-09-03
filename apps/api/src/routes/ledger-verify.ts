import { verifyChain } from "@assay/ledger";
import { Hono } from "hono";

import type { RunRegistry, StoredRun } from "../registry.js";

/**
 * `GET /runs/:id/ledger/verify` — `ARCHITECTURE.md §9`'s declared, previously
 * unbuilt route: *"Recomputes the hash chain from genesis, re-projects
 * balances, re-checks the Suspense identity. Returns pass/fail per check."*
 *
 * Built now because `packages/controller`'s `P0_INTEGRITY` policy rule reads
 * it — the loop refuses to plan against a chain it has not itself recomputed
 * (`policy.ts`: *"`P0` is the rule that stops the loop before it acts, so it
 * should read the stronger of the two"* — stronger than the cached `G4` flag
 * on `GET /runs/:id/close`, which is a value the run recorded when it ran).
 *
 * **What is genuinely re-derived, and what is not.**
 *
 * `verifyChain` is called fresh, here, against the stored run's own
 * `chain.events` and `chain.genesis_hash` — the hash-chain and trial-balance
 * checks (`ChainCheck`'s `STRUCTURE` through `ROOT_HASH`, and `TRIAL_BALANCE`)
 * are independent recomputations, not cached values passed through.
 *
 * The Suspense identity (`G3`) is **not** independently re-derived here, and
 * that is a boundary this file may not cross rather than an omission.
 * `apps/api/src/index.ts` states the constraint directly: *"It holds no
 * reconciliation logic of any kind."* `G3` compares the books' Suspense
 * balance against the queue of abstained and open-exception value —
 * `packages/ledger`'s `closeGate` computes it from `unresolved_items`,
 * `posted_decisions` and `terminal_states`, an input `apps/cli`'s
 * `runAssayComposedFull` assembles from the run. Reconstructing that assembly
 * a second time in `apps/api` would be a second place *"how do you build a
 * close-gate input"* is decided — exactly the duplication this workspace's
 * packages consistently refuse (`packages/llm`'s discipline suite fails a
 * build on a second `providers/anthropic.ts`; `apps/cli/src/agents/index.ts`:
 * *"Nothing here is forked"*). So `G3` is reported from the sealed
 * `close.gate.g3_suspense_identity` this run's own `attemptClose` already
 * computed, named as exactly that rather than presented as a fresh recompute.
 */

interface VerifyBody {
  readonly run_id: string;
  readonly chain_ok: boolean;
  readonly recomputed_root_hash: string;
  readonly stored_root_hash: string;
  readonly root_matches: boolean;
  readonly trial_balance_ok: boolean;
  readonly total_dr_paise: number;
  readonly total_cr_paise: number;
  readonly event_count: number;
  readonly checks: readonly { readonly name: string; readonly passed: boolean }[];
}

/**
 * Exported so `apps/api/src/controller/runtime.ts` can bind
 * `@assay/controller`'s `ledger_verify` tool to it directly — one function
 * builds this body, this route and the controller both read it.
 */
export function verifyBody(stored: StoredRun): VerifyBody {
  const { chain, close } = stored.result.evidence;
  const verification = verifyChain(chain.genesis_hash, chain.events, chain.root_hash);

  const rootMatches = !verification.failures.some((f) => f.check === "ROOT_HASH");
  // Structural chain integrity, independent of the stored-root comparison and
  // of the trial-balance check verifyChain also performs — kept apart so a
  // caller can tell "the chain itself is intact" from "it matches what was
  // stored" and from "the books balance", which are three different findings.
  const chainOk = !verification.failures.some(
    (f) => f.check !== "ROOT_HASH" && f.check !== "TRIAL_BALANCE",
  );
  const trialBalanceOk = !verification.failures.some((f) => f.check === "TRIAL_BALANCE");
  const suspenseIdentityOk = close.gate.g3_suspense_identity;

  return {
    run_id: stored.run_id,
    chain_ok: chainOk,
    recomputed_root_hash: verification.root_hash,
    stored_root_hash: chain.root_hash,
    root_matches: rootMatches,
    trial_balance_ok: trialBalanceOk,
    total_dr_paise: verification.total_dr_paise,
    total_cr_paise: verification.total_cr_paise,
    event_count: verification.event_count,
    checks: [
      { name: "genesis_to_root", passed: chainOk && rootMatches },
      { name: "trial_balance", passed: trialBalanceOk },
      { name: "suspense_identity", passed: suspenseIdentityOk },
    ],
  };
}

export function ledgerVerifyRoutes(registry: RunRegistry): Hono {
  const app = new Hono();

  app.get("/runs/:id/ledger/verify", (c) => {
    const id = c.req.param("id") ?? "";
    const stored = registry.get(id);
    if (stored === undefined) {
      return c.json(
        {
          error: "unknown_run",
          message:
            `No run ${id} is held by this process. Runs live in memory for the life of ` +
            `the server, so a run started before a restart is gone. POST /runs to start one.`,
          run_id: id,
        },
        404,
      );
    }
    return c.json(verifyBody(stored));
  });

  return app;
}
