import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/index.js";

/**
 * `ARCHITECTURE.md §9`'s four run routes, over `demo/demo-500`.
 *
 * **The fixture is a product artifact and these tests measure nothing.**
 * `demo/demo-500` lives outside `bench/`, carries no seed from
 * `PREREGISTRATION.md §6.1`'s split table, has no ground truth and no oracle
 * labels, and is never scored — `demo/README.md` states the five boundaries in
 * full. No benchmark data is read here, and no assertion below is a rate, an
 * accuracy, an aggregate or a comparison between agents. What is asserted is
 * that the API serves the evidence the engine actually produced.
 *
 * The app is exercised through `Hono`'s own `app.request`, so no socket is
 * opened and no port is bound: the routing, the status codes and the JSON bodies
 * under test are the same ones `src/main.ts` serves.
 */

const app = createApp();

interface RunCreated {
  readonly run_id: string;
  readonly dataset: string;
  readonly agent_id: string;
  readonly llm_provider: string;
  readonly observation_count: number;
  readonly summary: {
    readonly observation_states: Record<string, number>;
    readonly decisions: number;
    readonly abstentions: number;
    readonly open_exceptions: number;
    readonly certificates: number;
    readonly period_status: string;
    readonly unresolved_value_paise: number;
    readonly ledger_root_hash: string;
    readonly event_count: number;
  };
}

interface QueueRow {
  readonly decision_id: string;
  readonly obs_id: string;
  readonly entity_id: string;
  readonly kind: string;
  readonly state: string;
  readonly value_paise: number;
  readonly exception_class: string | null;
  readonly suspense_key: string | null;
  readonly comp_id: string | null;
  readonly has_certificate: boolean;
}

let created: RunCreated;

beforeAll(async () => {
  const response = await app.request("/runs", { method: "POST" });
  expect(response.status).toBe(201);
  created = (await response.json()) as RunCreated;
}, 60_000);

describe("POST /runs", () => {
  it("executes a real run over the demo fixture", () => {
    expect(created.run_id.length).toBeGreaterThan(0);
    expect(created.dataset).toBe("demo-500");
    expect(created.agent_id).toBe("ASSAY");
    expect(created.llm_provider).toBe("offline");
    expect(created.observation_count).toBe(500);
  });

  it("produces at least one ABSTAINED decision, with a certificate", () => {
    // The demo's whole subject: ASSAY declined to choose between two allocations
    // the evidence cannot separate (PROJECT_SPEC.md §10 step 2).
    expect(created.summary.observation_states["ABSTAINED"]).toBeGreaterThanOrEqual(1);
    expect(created.summary.abstentions).toBeGreaterThanOrEqual(1);
    expect(created.summary.certificates).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic: a second run returns the same id and root hash", async () => {
    const again = (await (await app.request("/runs", { method: "POST" })).json()) as RunCreated;
    // I9 / metric 23: two runs over identical inputs agree byte for byte. The
    // run id is content-addressed, so the registry replaces rather than duplicates.
    expect(again.run_id).toBe(created.run_id);
    expect(again.summary.ledger_root_hash).toBe(created.summary.ledger_root_hash);
  }, 60_000);

  it("refuses a dataset that is not on the allowlist", async () => {
    for (const dataset of ["bench/test/9000/observations.jsonl", "../../etc/passwd", "test"]) {
      const response = await app.request("/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataset }),
      });
      expect(response.status, dataset).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("unknown_dataset");
    }
  });

  it("refuses a provider other than offline", async () => {
    const response = await app.request("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ llm_provider: "anthropic" }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe(
      "unsupported_llm_provider",
    );
  });
});

describe("GET /runs/:id/close", () => {
  it("reports OPEN with unresolved value and every gate named", async () => {
    const response = await app.request(`/runs/${created.run_id}/close`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      period_status: string;
      gate: Record<string, unknown>;
      unresolved_value_paise: number;
      suspense_balance_paise: number;
      trial_balance_ok: boolean;
      total_dr_paise: number;
      total_cr_paise: number;
      ledger_root_hash: string;
      genesis_hash: string;
      report: unknown;
    };

    expect(body.period_status).toBe("OPEN");
    expect(body.unresolved_value_paise).toBeGreaterThan(0);
    // §17.1.1 opens a Suspense item per abstained target; G3 ties it to the books.
    expect(body.suspense_balance_paise).toBe(body.unresolved_value_paise);

    // All five gates, always — §10.2 requires the failing gate to be named.
    expect(body.gate["failed_gates"]).toEqual([]);
    for (const gate of [
      "g1_all_terminal",
      "g2_trial_balance",
      "g3_suspense_identity",
      "g4_hash_chain",
      "g5_no_failed_invariant_posted",
    ]) {
      expect(body.gate[gate], gate).toBe(true);
    }

    expect(body.trial_balance_ok).toBe(true);
    expect(body.total_dr_paise).toBe(body.total_cr_paise);
    expect(body.ledger_root_hash).toBe(created.summary.ledger_root_hash);
    expect(body.genesis_hash).not.toBe(body.ledger_root_hash);
    // §10.2 / §L.1 rule 7: a report exists for every outcome but BLOCKED.
    expect(body.report).not.toBeNull();
  });

  it("404s on an unknown run", async () => {
    const response = await app.request("/runs/run_nope/close");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string; run_id: string };
    expect(body.error).toBe("unknown_run");
    expect(body.run_id).toBe("run_nope");
  });
});

describe("GET /runs/:id/exceptions", () => {
  it("returns the queue ranked by rupee value, descending", async () => {
    const response = await app.request(`/runs/${created.run_id}/exceptions`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { total: number; items: QueueRow[] };

    expect(body.total).toBeGreaterThan(0);
    expect(body.items).toHaveLength(body.total);
    for (let i = 1; i < body.items.length; i += 1) {
      const previous = body.items[i - 1];
      const current = body.items[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) continue;
      expect(previous.value_paise).toBeGreaterThanOrEqual(current.value_paise);
    }

    // Both populations, because §9 names both.
    expect(body.items.some((r) => r.state === "ABSTAINED")).toBe(true);
    expect(body.items.some((r) => r.state === "EXCEPTION")).toBe(true);
  });

  it("carries the ambiguity case, with a certificate to drill into", async () => {
    const body = (await (
      await app.request(`/runs/${created.run_id}/exceptions`)
    ).json()) as { items: QueueRow[] };

    const abstained = body.items.filter((r) => r.state === "ABSTAINED");
    expect(abstained.length).toBeGreaterThanOrEqual(1);

    for (const row of abstained) {
      // §6's certificate is on every abstained row — the member's abstention IS
      // the component's — and an abstention never carries an exception class.
      expect(row.has_certificate).toBe(true);
      expect(row.exception_class).toBeNull();
      expect(row.entity_id.length).toBeGreaterThan(0);
    }

    // DATA_MODEL.md §17.1.1 splits the abstention rows three ways, and the split
    // decides whether anything posts: the TARGET carries the obligation and
    // opens one Suspense item, while "a second posting for each member would
    // relieve 1100_GATEWAY_RECEIVABLE again for one break". So exactly one row
    // of an abstained component is keyed, and the rest are its members.
    const keyed = abstained.filter((r) => r.suspense_key !== null);
    expect(keyed).toHaveLength(1);
    const target = keyed[0];
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(target.kind).toBe("settlement");
    expect(target.value_paise).toBeGreaterThan(0);

    // One certificate covers the whole component, so every abstained row —
    // target and members alike — belongs to it.
    for (const row of abstained) expect(row.comp_id).toBe(target.comp_id);

    // Every exception carries a class (DATA_MODEL.md §14); an abstention never does.
    for (const row of body.items.filter((r) => r.state === "EXCEPTION")) {
      expect(row.exception_class).not.toBeNull();
    }
  });

  it("filters by exception class, as §9's endpoint requires", async () => {
    const all = (await (
      await app.request(`/runs/${created.run_id}/exceptions`)
    ).json()) as { items: QueueRow[] };
    const someClass = all.items.find((r) => r.exception_class !== null)?.exception_class;
    expect(someClass).toBeDefined();
    if (someClass === undefined || someClass === null) return;

    const filtered = (await (
      await app.request(`/runs/${created.run_id}/exceptions?class=${someClass}`)
    ).json()) as { items: QueueRow[]; total: number };

    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.total).toBeLessThanOrEqual(all.items.length);
    for (const row of filtered.items) expect(row.exception_class).toBe(someClass);
  });

  it("404s on an unknown run", async () => {
    const response = await app.request("/runs/run_nope/exceptions");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toBe("unknown_run");
  });
});

describe("GET /runs/:id/decisions/:decision_id", () => {
  it("returns the real ambiguity certificate and its chain event", async () => {
    const queue = (await (
      await app.request(`/runs/${created.run_id}/exceptions`)
    ).json()) as { items: QueueRow[] };
    const abstained = queue.items.find((r) => r.state === "ABSTAINED");
    expect(abstained).toBeDefined();
    if (abstained === undefined) return;

    const response = await app.request(
      `/runs/${created.run_id}/decisions/${abstained.decision_id}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      decision: {
        decision_id: string;
        state: string;
        journal_lines: unknown[];
        evt_id: string;
        certificate: {
          reason: string;
          solution_a: { candidate_id: string; member_obs_ids: string[] };
          solution_b: { candidate_id: string; member_obs_ids: string[] };
          shared_hard_constraints: string[];
          evidence_score_gap_bps: number;
          materiality_paise: number;
          epsilon_bps: number;
          tau_paise: number;
          probes_attempted: string[];
        } | null;
      };
      event: { evt_id: string; decision_id: string; hash: string; prev_hash: string } | null;
    };

    expect(body.decision.decision_id).toBe(abstained.decision_id);
    expect(body.decision.state).toBe("ABSTAINED");

    const certificate = body.decision.certificate;
    expect(certificate).not.toBeNull();
    if (certificate === null) return;

    // DATA_MODEL.md §13's reason.
    expect(certificate.reason).toBe("EVIDENCE_TIE");

    // "explained equally well by {A,B,C} and by {D,E}" — two distinct solutions.
    expect(certificate.solution_a.member_obs_ids.length).toBeGreaterThan(0);
    expect(certificate.solution_b.member_obs_ids.length).toBeGreaterThan(0);
    expect(certificate.solution_a.candidate_id).not.toBe(certificate.solution_b.candidate_id);
    expect(certificate.solution_a.member_obs_ids).not.toEqual(
      certificate.solution_b.member_obs_ids,
    );

    // "Both satisfy all N hard constraints."
    expect(certificate.shared_hard_constraints.length).toBeGreaterThan(0);

    // Materiality above τ, evidence gap below ε — §6's ladder, as it decided.
    expect(certificate.materiality_paise).toBeGreaterThan(certificate.tau_paise);
    expect(certificate.evidence_score_gap_bps).toBeLessThan(certificate.epsilon_bps);
    expect(Array.isArray(certificate.probes_attempted)).toBe(true);

    // §9's "hash-chain segment": the sealed event this decision was appended as.
    expect(body.event).not.toBeNull();
    expect(body.event?.evt_id).toBe(body.decision.evt_id);
    expect(body.event?.decision_id).toBe(body.decision.decision_id);
    expect(body.event?.hash.length).toBe(64);
    expect(body.event?.prev_hash.length).toBe(64);
  });

  it("carries journal lines on a posting decision", async () => {
    const queue = (await (
      await app.request(`/runs/${created.run_id}/exceptions`)
    ).json()) as { items: QueueRow[] };
    const row = queue.items.find((r) => r.suspense_key !== null);
    expect(row).toBeDefined();
    if (row === undefined) return;

    const body = (await (
      await app.request(`/runs/${created.run_id}/decisions/${row.decision_id}`)
    ).json()) as { decision: { journal_lines: unknown[] } };
    expect(body.decision.journal_lines.length).toBeGreaterThan(0);
  });

  it("404s on an unknown decision, naming the run that does exist", async () => {
    const response = await app.request(`/runs/${created.run_id}/decisions/dec_nope`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: string;
      run_id: string;
      decision_id: string;
    };
    expect(body.error).toBe("unknown_decision");
    expect(body.run_id).toBe(created.run_id);
    expect(body.decision_id).toBe("dec_nope");
  });

  it("404s on an unknown run before it looks at the decision", async () => {
    const response = await app.request("/runs/run_nope/decisions/dec_nope");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toBe("unknown_run");
  });
});

describe("the surface", () => {
  it("answers an unrouted path with JSON rather than text", async () => {
    const response = await app.request("/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(((await response.json()) as { error: string }).error).toBe("not_found");
  });
});
