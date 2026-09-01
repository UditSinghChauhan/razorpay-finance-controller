import type { Observation, ObservationId } from "@assay/domain";
import type { AgentInput, RunConfig } from "@assay/eval";
import { R3_PROBE_PRIORITY, offlineProvider } from "@assay/llm";
import { describe, expect, it } from "vitest";

import { agentById } from "../src/agents/index.js";
import { AgentUnavailableError, EXIT } from "../src/errors.js";

/**
 * `A1-NOVALIDATE`, `A2-NOABSTAIN`, `A3-NOLLM` — the three ablations `assay.ts`
 * composes over (`EVALUATION_SPEC.md §3.2`).
 *
 * `apps/cli/tests/agents.test.ts` and `h1-integration.test.ts` are untouched by
 * this file, per the coordinator's split. This suite is everything specific to
 * the three ablations: `A1`'s governance-gap blocker, and `A2`/`A3`'s exact
 * semantics as configuration flags over `assay.ts`'s composition.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const MODE = 2;

const obsId = (n: number): ObservationId =>
  `obs_${String(n).padStart(14, "0")}` as ObservationId;
const entId = (n: number, type: "payment" | "refund" = "payment"): string =>
  `${type === "refund" ? "rfnd_" : "pay_"}${String(n).padStart(14, "0")}`;
const setlEntId = (n: number): string => `setl_${String(n).padStart(14, "0")}`;
const bankEntId = (n: number): string => `bnk_${String(n).padStart(14, "0")}`;

interface LineOpts {
  readonly type?: "payment" | "refund";
  readonly credit?: number;
  readonly debit?: number;
  readonly amount?: number;
  readonly settlementId?: string | null;
  readonly entityId?: string;
  readonly settledAtDayOffset?: number;
}

function reconLine(n: number, opts: LineOpts = {}): Observation {
  const type = opts.type ?? "payment";
  const credit = opts.credit ?? 50_000;
  const debit = opts.debit ?? 0;
  const amount = opts.amount ?? credit + debit + 2_000;
  const dayOffset = opts.settledAtDayOffset ?? MODE;
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: opts.entityId ?? entId(n, type),
      type,
      debit,
      credit,
      amount,
      currency: "INR",
      fee: 2_000,
      tax: 305,
      on_hold: false,
      settled: true,
      created_at: T0,
      settled_at: T0 + dayOffset * DAY,
      settlement_id: opts.settlementId === undefined ? null : opts.settlementId,
      posted_at: null,
      credit_type: "default",
      payment_id: null,
      settlement_utr: null,
      order_id: null,
      method: "card",
      card_network: "Visa",
      card_issuer: null,
      card_type: "credit",
      dispute_id: null,
    },
  } as unknown as Observation;
}

function settlementObs(n: number, amount: number, utr: string): Observation {
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_settlements",
    kind: "settlement",
    payload: {
      id: setlEntId(n),
      entity: "settlement",
      amount,
      status: "processed",
      fees: 0,
      tax: 0,
      utr,
      created_at: T0,
    },
  } as unknown as Observation;
}

function bankLineObs(n: number, amount: number, bankRef: string): Observation {
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "bank_statement",
    kind: "bank_line",
    payload: {
      bank_line_id: bankEntId(n),
      value_date: T0 + (MODE + 1) * DAY,
      amount,
      direction: "credit",
      running_balance: null,
      bank_ref: bankRef,
    },
  } as unknown as Observation;
}

function config(over: Partial<RunConfig> = {}): RunConfig {
  return {
    llm_mode: "offline",
    strict_replay: true,
    split: "dev",
    seed: 2000,
    ...over,
  };
}

function input(observations: readonly Observation[], over: Partial<RunConfig> = {}): AgentInput {
  return { observations, config: config(over) };
}

// ---------------------------------------------------------------------------
// A1-NOVALIDATE — governance gap, not implemented
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — a genuine governance gap, not a stub with the old message", () => {
  it("still throws AgentUnavailableError, EXIT.UNAVAILABLE", async () => {
    const error = await agentById("A1-NOVALIDATE")
      .run(input([]))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as AgentUnavailableError).exitCode).toBe(EXIT.UNAVAILABLE);
    expect((error as AgentUnavailableError).agentId).toBe("A1-NOVALIDATE");
  });

  it("cites §L.1 rule 4's ValidatedDecision brand, not the old generic stage list", async () => {
    const error = (await agentById("A1-NOVALIDATE")
      .run(input([]))
      .catch((e: unknown) => e)) as AgentUnavailableError;
    // The precise governance gap, not "packages/domain (S0) ... the write path
    // and the G1-G5 close gate" — those stages are now built and ASSAY composes
    // them; the blocker A1 leaves behind must name the real, remaining gap.
    expect(error.blockedBy).toContain("ValidatedDecision");
    expect(error.message).toContain("DECISION_BRIEF.md §L.1 rule 4");
    expect(error.message).toMatch(/validate\(\)/);
    expect(error.message).not.toContain("packages/domain (S0)");
  });

  it("is deterministic — the same blocker on every call", async () => {
    const a = await agentById("A1-NOVALIDATE")
      .run(input([]))
      .catch((e: unknown) => (e instanceof AgentUnavailableError ? e.message : null));
    const b = await agentById("A1-NOVALIDATE")
      .run(input([]))
      .catch((e: unknown) => (e instanceof AgentUnavailableError ? e.message : null));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Fixture 1 — an AMBIGUOUS component (§6.6's chain never resolves it: assay.ts
// passes probe/run.ts an empty available-probe context, so R3 -- either
// provider -- can only decline. ASSAY therefore abstains on this target
// deterministically, and A2-NOABSTAIN's forced-commit branch is exercised.)
// ---------------------------------------------------------------------------

const AMBIG_SETL = 900;
const AMBIG_BANK = 901;
const AMBIG_AMOUNT = 100_000;
const AMBIG_UTR = "UTR-AMBIG-0001";

function ambiguousFixture(): readonly Observation[] {
  return [
    settlementObs(AMBIG_SETL, AMBIG_AMOUNT, AMBIG_UTR),
    bankLineObs(AMBIG_BANK, AMBIG_AMOUNT, AMBIG_UTR),
    reconLine(1, { credit: 50_000 }),
    reconLine(2, { credit: 50_000 }),
    reconLine(3, { credit: 150_000 }),
    reconLine(4, { type: "refund", debit: 50_000, credit: 0, amount: 50_000 }),
  ];
}

// ---------------------------------------------------------------------------
// Fixture 2 — a component S2 reports INTRACTABLE (§4.3's *other* trigger, the
// one `solve` cannot see on its own): 23 unanchored recon_lines share one
// `settled_at`, so `generateCandidates`'s per-class bucket exceeds `K_max = 22`
// before a single candidate is admitted. `result.best` is therefore `null` —
// S4's "no feasible solution at all" — so A2 has nothing to force through.
// ---------------------------------------------------------------------------

const INTRACT_SETL = 2000;
const INTRACT_BANK = 2001;
const INTRACT_AMOUNT = 50_000;
const INTRACT_UTR = "UTR-INTRACT-0001";

function intractableFixture(): readonly Observation[] {
  const lines = Array.from({ length: 23 }, (_, i) => reconLine(2100 + i, { credit: 40_000 }));
  return [
    settlementObs(INTRACT_SETL, INTRACT_AMOUNT, INTRACT_UTR),
    bankLineObs(INTRACT_BANK, INTRACT_AMOUNT, INTRACT_UTR),
    ...lines,
  ];
}

// ---------------------------------------------------------------------------
// Fixture 3 — the AMBIGUOUS component again, plus a SECOND, already
// AN1-resolved settlement whose sole anchored member reuses member 1's own
// `entity_id`. Pass 1 (assay.ts's `anchor_resolved` loop) commits that entity
// before the ambiguous target is ever classified, so I2 ("no double
// allocation") is already violated for member 1 by the time A2 forces a
// commit of candidate [1,2] through it.
// ---------------------------------------------------------------------------

const I2_COLLISION_SETL = 3000;
const I2_COLLISION_MEMBER = 3001;

function i2CollisionFixture(): readonly Observation[] {
  return [
    ...ambiguousFixture(),
    settlementObs(I2_COLLISION_SETL, 50_000, "UTR-I2-COLLISION"),
    reconLine(I2_COLLISION_MEMBER, {
      credit: 50_000,
      settlementId: setlEntId(I2_COLLISION_SETL),
      entityId: entId(1),
    }),
  ];
}

// ---------------------------------------------------------------------------
// A2-NOABSTAIN
// ---------------------------------------------------------------------------

describe("A2-NOABSTAIN — forces the top candidate through instead of abstaining", () => {
  it("ASSAY abstains on the AMBIGUOUS target (no probe surface reaches R3 in-process)", async () => {
    const run = await agentById("ASSAY").run(input(ambiguousFixture()));
    const target = run.outcomes.find((o) => o.obs_id === obsId(AMBIG_SETL));
    expect(target?.state).toBe("ABSTAINED");
    expect(run.abstentions).toHaveLength(1);
  });

  it("A2-NOABSTAIN commits S4's own top candidate for the identical input", async () => {
    const assay = await agentById("ASSAY").run(input(ambiguousFixture()));
    const run = await agentById("A2-NOABSTAIN").run(input(ambiguousFixture()));
    const target = run.outcomes.find((o) => o.obs_id === obsId(AMBIG_SETL));
    expect(target?.state).toBe("RECONCILED");

    // ASSAY abstained on this same input, so this fixture genuinely reaches
    // S4's AMBIGUOUS branch rather than resolving on its own.
    const abstention = assay.outcomes.find((o) => o.obs_id === obsId(AMBIG_SETL));
    expect(abstention?.state).toBe("ABSTAINED");

    const decision = run.decisions.find((d) => d.target_id === setlEntId(AMBIG_SETL));
    expect(decision).toBeDefined();
    const committed = decision?.member_entity_ids.slice().sort() ?? [];
    // Exactly one of the two admissible allocations this fixture generates.
    const candidateA = [entId(1), entId(2)].sort();
    const candidateB = [entId(3), entId(4, "refund")].sort();
    expect(committed.length).toBe(2);
    const isCandidateA = committed.join(",") === candidateA.join(",");
    const isCandidateB = committed.join(",") === candidateB.join(",");
    expect(isCandidateA || isCandidateB, JSON.stringify(committed)).toBe(true);
  });

  it("A2 never abstains and never constructs a certificate for this target", async () => {
    const run = await agentById("A2-NOABSTAIN").run(input(ambiguousFixture()));
    expect(run.abstentions).toHaveLength(0);
    expect(run.outcomes.some((o) => o.state === "ABSTAINED")).toBe(false);
  });

  it("coverage rises under A2 relative to ASSAY on the same input (§3.2's expectation)", async () => {
    const assay = await agentById("ASSAY").run(input(ambiguousFixture()));
    const a2 = await agentById("A2-NOABSTAIN").run(input(ambiguousFixture()));
    expect(a2.close?.value_abstained_paise ?? 0).toBeLessThanOrEqual(
      assay.close?.value_abstained_paise ?? 0,
    );
  });

  it("I1-I9 are untouched — a forced commit that fails I2 becomes EXCEPTION, not a phantom RECONCILED", async () => {
    const run = await agentById("A2-NOABSTAIN").run(input(i2CollisionFixture()));
    const target = run.outcomes.find((o) => o.obs_id === obsId(AMBIG_SETL));
    // Member 1's entity_id was already committed by the AN1-anchored settlement
    // 3000 in pass 1, so I2 rejects the forced commit and it falls back to the
    // ordinary exception path -- never a RECONCILED decision built on a double
    // allocation.
    expect(target?.state).toBe("EXCEPTION");
    expect(run.open_exceptions.some((e) => e.exception_class === "E05_AMOUNT_MISMATCH")).toBe(
      true,
    );
    expect(run.abstentions).toHaveLength(0);
  });

  it("S4's genuinely empty candidate set (K_max exceeded) still reaches EXCEPTION under A2", async () => {
    const assay = await agentById("ASSAY").run(input(intractableFixture()));
    const a2 = await agentById("A2-NOABSTAIN").run(input(intractableFixture()));
    const assayTarget = assay.outcomes.find((o) => o.obs_id === obsId(INTRACT_SETL));
    const a2Target = a2.outcomes.find((o) => o.obs_id === obsId(INTRACT_SETL));
    // ASSAY: SEARCH_BOUND_EXCEEDED -> ABSTAINED (§4.3, best === null already).
    expect(assayTarget?.state).toBe("ABSTAINED");
    // A2: nothing to force through -- best is null, so this is §9's "no
    // admissible candidate exists at all", the SAME EXCEPTION class ASSAY
    // itself would reach on a target with best === null (E01, bank evidence
    // named the settlement but no candidate ties out to it).
    expect(a2Target?.state).toBe("EXCEPTION");
    expect(a2.open_exceptions.some((e) => e.exception_class === "E01_MISSING_CAPTURE")).toBe(
      true,
    );
    expect(a2.abstentions).toHaveLength(0);
  });

  it("is deterministic", async () => {
    const a = await agentById("A2-NOABSTAIN").run(input(ambiguousFixture()));
    const b = await agentById("A2-NOABSTAIN").run(input(ambiguousFixture()));
    expect(b).toEqual(a);
  });

  it("reports its own agent_id and the caller's config, untouched", async () => {
    const run = await agentById("A2-NOABSTAIN").run(
      input(ambiguousFixture(), { llm_mode: "offline", seed: 77 }),
    );
    expect(run.agent_id).toBe("A2-NOABSTAIN");
    expect(run.config).toEqual(config({ llm_mode: "offline", seed: 77 }));
  });
});

// ---------------------------------------------------------------------------
// A3-NOLLM
// ---------------------------------------------------------------------------

describe("A3-NOLLM — exactly ASSAY --llm=offline, the flag forced rather than read", () => {
  it("forces llm_mode to offline even when the caller asks for replay", async () => {
    // No fixtures/llm-cache/ is committed at this spec version, so ASSAY under
    // --llm=replay fails immediately building the provider -- proving the
    // input really did ask for replay. A3-NOLLM on the identical input must
    // NOT fail the same way, because it never builds a replay provider at all.
    await expect(
      agentById("ASSAY").run(input([], { llm_mode: "replay" })),
    ).rejects.toThrow();

    const run = await agentById("A3-NOLLM").run(input([], { llm_mode: "replay" }));
    expect(run.agent_id).toBe("A3-NOLLM");
    expect(run.config.llm_mode).toBe("offline");
  });

  it("touches llm_mode alone -- every other config field passes through", async () => {
    const run = await agentById("A3-NOLLM").run(
      input([], { llm_mode: "replay", strict_replay: false, split: "test", seed: 42 }),
    );
    expect(run.config).toEqual({
      llm_mode: "offline",
      strict_replay: false,
      split: "test",
      seed: 42,
    });
  });

  it("is a no-op override when the caller already asked for offline", async () => {
    const run = await agentById("A3-NOLLM").run(input([], { llm_mode: "offline" }));
    expect(run.config.llm_mode).toBe("offline");
  });

  it("matches ASSAY under --llm=offline in every field but agent_id and config", async () => {
    const assay = await agentById("ASSAY").run(input(ambiguousFixture(), { llm_mode: "offline" }));
    const a3 = await agentById("A3-NOLLM").run(input(ambiguousFixture(), { llm_mode: "replay" }));
    expect(a3.outcomes).toEqual(assay.outcomes);
    expect(a3.decisions).toEqual(assay.decisions);
    expect(a3.abstentions).toEqual(assay.abstentions);
    expect(a3.open_exceptions).toEqual(assay.open_exceptions);
    expect(a3.journal).toEqual(assay.journal);
    expect(a3.close).toEqual(assay.close);
    expect(a3.agent_id).not.toBe(assay.agent_id);
    expect(a3.config.llm_mode).toBe(assay.config.llm_mode);
  });

  it("never invokes anything but the offline provider (no network, no metered cost)", () => {
    const provider = offlineProvider();
    expect(provider.id).toBe("offline");
    expect(provider.requiresNetwork).toBe(false);
    expect(provider.meteredCost).toBe(false);
  });

  it("R3_PROBE_PRIORITY (packages/llm's frozen policy) is untouched", () => {
    // DECISION_BRIEF.md §L.1 rule 12: fetch_settlement_recon -> fetch_payment ->
    // fetch_order -> fetch_refund. Read from @assay/llm, not restated.
    expect(R3_PROBE_PRIORITY).toEqual([
      "fetch_settlement_recon",
      "fetch_payment",
      "fetch_order",
      "fetch_refund",
    ]);
  });

  it("is deterministic", async () => {
    const a = await agentById("A3-NOLLM").run(input(ambiguousFixture()));
    const b = await agentById("A3-NOLLM").run(input(ambiguousFixture()));
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// Integration — the Agent interface, and the boundary the composition root may
// not cross (the same G8-style checks the rest of the suite applies).
// ---------------------------------------------------------------------------

describe("integration — A1/A2/A3 through the same composition root as ASSAY", () => {
  it("agentById resolves all three, with the ids EVALUATION_SPEC.md §3 declares", () => {
    expect(agentById("A1-NOVALIDATE").id).toBe("A1-NOVALIDATE");
    expect(agentById("A2-NOABSTAIN").id).toBe("A2-NOABSTAIN");
    expect(agentById("A3-NOLLM").id).toBe("A3-NOLLM");
  });

  it("A2 and A3 satisfy the Agent interface end to end on the empty observation set", async () => {
    for (const id of ["A2-NOABSTAIN", "A3-NOLLM"] as const) {
      const run = await agentById(id).run(input([]));
      expect(run.agent_id).toBe(id);
      expect(run.close).not.toBeNull();
      expect(run.outcomes).toEqual([]);
    }
  });

  it("neither a2.ts nor a3.ts reaches the filesystem door or reimplements a stage", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    for (const name of ["a2.ts", "a3.ts"] as const) {
      const path = fileURLToPath(new URL(`../src/agents/${name}`, import.meta.url));
      const text = readFileSync(path, "utf8");
      expect(text, name).not.toMatch(/from\s+["'][^"']*\.\.\/fs\//);
      expect(text, name).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
      // Both files delegate to assay.ts's shared composition and hold no engine
      // logic of their own.
      expect(text, name).toMatch(/runAssayAblation/);
      expect(text, name).not.toMatch(/@assay\/engine/);
      expect(text, name).not.toMatch(/@assay\/ledger/);
    }
  });
});
