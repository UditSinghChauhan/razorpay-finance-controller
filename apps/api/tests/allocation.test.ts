import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/index.js";

/**
 * `certificate_allocation` — the product read model that prices a certificate's
 * members, asserted against a **real run** over `demo/demo-500`.
 *
 * No figure below is written into the test as an expectation of what the engine
 * ought to produce: every amount is checked against the run's own observations
 * by an identity the corpus states — `RECONCILIATION_SPEC.md §4.1`'s `C6`, the
 * tie-out an admissible candidate had to satisfy to exist at all. A fabricated
 * member amount fails these assertions rather than passing them.
 *
 * The fixture is a product artifact and nothing here is a measurement:
 * `demo/demo-500` is outside `bench/`, is never scored, and no assertion below
 * is a rate, an aggregate or a comparison between agents.
 */

interface QueueRow {
  readonly decision_id: string;
  readonly obs_id: string;
  readonly kind: string;
  readonly state: string;
  readonly suspense_key: string | null;
  readonly has_certificate: boolean;
}

interface AllocationMember {
  readonly obs_id: string;
  readonly allocation_paise: number | null;
  readonly value_paise: number | null;
}

interface DecisionBody {
  readonly decision: {
    readonly certificate: {
      readonly comp_id: string;
      readonly solution_a: { candidate_id: string; member_obs_ids: string[] };
      readonly solution_b: { candidate_id: string; member_obs_ids: string[] };
    } | null;
  };
  readonly certificate_allocation: {
    readonly comp_id: string;
    readonly target: { obs_id: string; entity_id: string; value_paise: number } | null;
    readonly solution_a: { candidate_id: string; members: AllocationMember[] };
    readonly solution_b: { candidate_id: string; members: AllocationMember[] };
  } | null;
}

const app = createApp();

let runId: string;
let abstained: QueueRow[];

beforeAll(async () => {
  const created = (await (await app.request("/runs", { method: "POST" })).json()) as {
    run_id: string;
  };
  runId = created.run_id;
  const queue = (await (await app.request(`/runs/${runId}/exceptions`)).json()) as {
    items: QueueRow[];
  };
  abstained = queue.items.filter((r) => r.state === "ABSTAINED");
  expect(abstained.length).toBeGreaterThan(0);
}, 60_000);

async function decisionBody(decisionId: string): Promise<DecisionBody> {
  const response = await app.request(`/runs/${runId}/decisions/${decisionId}`);
  expect(response.status).toBe(200);
  return (await response.json()) as DecisionBody;
}

describe("GET /runs/:id/decisions/:decision_id — certificate_allocation", () => {
  it("prices every member the certificate names, and only those", async () => {
    for (const row of abstained) {
      const body = await decisionBody(row.decision_id);
      const certificate = body.decision.certificate;
      const allocation = body.certificate_allocation;
      expect(certificate, row.obs_id).not.toBeNull();
      expect(allocation, row.obs_id).not.toBeNull();
      if (certificate === null || allocation === null) continue;

      // The read model travels beside the certificate and never re-keys it: the
      // solution ids and the member lists are the sealed record's own.
      expect(allocation.comp_id).toBe(certificate.comp_id);
      expect(allocation.solution_a.candidate_id).toBe(certificate.solution_a.candidate_id);
      expect(allocation.solution_b.candidate_id).toBe(certificate.solution_b.candidate_id);
      expect(allocation.solution_a.members.map((m) => m.obs_id)).toEqual(
        certificate.solution_a.member_obs_ids,
      );
      expect(allocation.solution_b.members.map((m) => m.obs_id)).toEqual(
        certificate.solution_b.member_obs_ids,
      );
    }
  });

  it("gives every member a real amount, from the run's own observations", async () => {
    const first = abstained[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const allocation = (await decisionBody(first.decision_id)).certificate_allocation;
    expect(allocation).not.toBeNull();
    if (allocation === null) return;

    for (const solution of [allocation.solution_a, allocation.solution_b]) {
      expect(solution.members.length).toBeGreaterThan(0);
      for (const member of solution.members) {
        // A member of an admissible candidate is a recon line or an adjustment
        // (packages/engine's `Member`), so C6's term exists for every one of
        // them and none may be reported as absent.
        expect(member.allocation_paise, member.obs_id).not.toBeNull();
        expect(member.value_paise, member.obs_id).not.toBeNull();
        expect(Number.isSafeInteger(member.allocation_paise), member.obs_id).toBe(true);
      }
    }
  });

  it("makes both solutions tie out to the target, which is C6's identity", async () => {
    const first = abstained[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const allocation = (await decisionBody(first.decision_id)).certificate_allocation;
    expect(allocation).not.toBeNull();
    if (allocation === null) return;

    // §17.1.1: exactly one abstained row in a component carries the Suspense
    // key, and that row is the target the allocations tie out against.
    expect(allocation.target).not.toBeNull();
    const target = allocation.target;
    if (target === null) return;

    const totals = [allocation.solution_a, allocation.solution_b].map((s) =>
      s.members.reduce((sum, m) => sum + (m.allocation_paise ?? 0), 0),
    );
    // C6 — "Σ credit(members) − Σ debit(members) = target.amount", zero
    // tolerance in paise. Both candidates satisfied it, so both totals must
    // land on the target exactly. This is what makes a fabricated amount
    // impossible to slip past: it would not sum.
    for (const total of totals) expect(total).toBe(target.value_paise);
  });

  it("reports allocation and §14.1 value as different, separately named figures", async () => {
    const first = abstained[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const allocation = (await decisionBody(first.decision_id)).certificate_allocation;
    if (allocation === null) return;

    // A demo recon line carries a fee, so its gross §14.1 value exceeds its C6
    // allocation term. Collapsing the two would break the tie-out above; this
    // asserts they are genuinely distinct rather than incidentally equal.
    const members = [...allocation.solution_a.members, ...allocation.solution_b.members];
    expect(
      members.some((m) => m.value_paise !== null && m.value_paise !== m.allocation_paise),
    ).toBe(true);
  });

  it("is null on a decision that carries no certificate", async () => {
    const queue = (await (await app.request(`/runs/${runId}/exceptions`)).json()) as {
      items: QueueRow[];
    };
    const plain = queue.items.find((r) => !r.has_certificate);
    expect(plain).toBeDefined();
    if (plain === undefined) return;
    const body = await decisionBody(plain.decision_id);
    expect(body.decision.certificate).toBeNull();
    expect(body.certificate_allocation).toBeNull();
  });

  it("answers identically from a member's drill-down and the target's", async () => {
    // One certificate covers the whole component, so the read model beside it
    // must not depend on which of the component's rows was opened.
    const target = abstained.find((r) => r.suspense_key !== null);
    const member = abstained.find((r) => r.suspense_key === null);
    expect(target).toBeDefined();
    expect(member).toBeDefined();
    if (target === undefined || member === undefined) return;

    const fromTarget = (await decisionBody(target.decision_id)).certificate_allocation;
    const fromMember = (await decisionBody(member.decision_id)).certificate_allocation;
    expect(fromMember).toEqual(fromTarget);
  });
});
