import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/index.js";

/**
 * `GET /runs/:id/ledger/verify` — `ARCHITECTURE.md §9`'s previously-unbuilt
 * route, over `demo/demo-500`.
 *
 * Exercised through `Hono`'s own `app.request`, exactly as `runs.test.ts` and
 * `gemini.test.ts` do: no socket, no port, the same routing and JSON bodies
 * `src/main.ts` serves.
 */

const app = createApp();

/**
 * `POST /runs` names its period.
 *
 * The dataset is a required field, not a default: `apps/api/src/routes/runs.ts`
 * answers `400 missing_dataset` to a request that names none, so a body whose
 * `dataset` went missing can no longer come back as a real run over a period
 * nobody asked for. Every creation below therefore says which period it wants.
 */
const START_DEMO_500 = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ dataset: "demo-500" }),
} as const;


interface RunCreated {
  readonly run_id: string;
}

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

let runId: string;

beforeAll(async () => {
  const response = await app.request("/runs", START_DEMO_500);
  expect(response.status).toBe(201);
  ({ run_id: runId } = (await response.json()) as RunCreated);
}, 60_000);

describe("GET /runs/:id/ledger/verify", () => {
  it("recomputes the chain and reports it verified, for a real sealed run", async () => {
    const response = await app.request(`/runs/${runId}/ledger/verify`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as VerifyBody;
    expect(body.run_id).toBe(runId);
    expect(body.chain_ok).toBe(true);
    expect(body.root_matches).toBe(true);
    expect(body.trial_balance_ok).toBe(true);
    expect(body.recomputed_root_hash).toBe(body.stored_root_hash);
    expect(body.recomputed_root_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.event_count).toBeGreaterThan(0);
    expect(body.total_dr_paise).toBe(body.total_cr_paise);
  });

  it("names all three checks, and every one passes on the real demo run", async () => {
    const response = await app.request(`/runs/${runId}/ledger/verify`);
    const body = (await response.json()) as VerifyBody;
    const names = body.checks.map((c) => c.name).sort();
    expect(names).toEqual(["genesis_to_root", "suspense_identity", "trial_balance"]);
    for (const check of body.checks) expect(check.passed, check.name).toBe(true);
  });

  it("agrees with GET /runs/:id/close on the same run's own hashes", async () => {
    const verify = (await (
      await app.request(`/runs/${runId}/ledger/verify`)
    ).json()) as VerifyBody;
    const close = (await (await app.request(`/runs/${runId}/close`)).json()) as {
      readonly ledger_root_hash: string;
      readonly trial_balance_ok: boolean;
      readonly total_dr_paise: number;
      readonly total_cr_paise: number;
    };
    // Two independent computations — one cached from the run, one recomputed
    // fresh from genesis here — agree on the same real chain.
    expect(verify.recomputed_root_hash).toBe(close.ledger_root_hash);
    expect(verify.trial_balance_ok).toBe(close.trial_balance_ok);
    expect(verify.total_dr_paise).toBe(close.total_dr_paise);
    expect(verify.total_cr_paise).toBe(close.total_cr_paise);
  });

  it("404s an unknown run", async () => {
    const response = await app.request("/runs/run_does_not_exist/ledger/verify");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("unknown_run");
  });
});
