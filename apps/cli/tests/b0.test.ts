import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Observation, ObservationId, Sha256, UnixSeconds } from "@assay/domain";
import type { RunConfig } from "@assay/eval";
import { describe, expect, it } from "vitest";

import { b0Agent } from "../src/agents/b0.js";

/**
 * `B0-IDONLY` — the exact-join baseline (`EVALUATION_SPEC.md §3.1`).
 *
 * Fixtures are hand-built rather than shared with `packages/engine/tests` or
 * `packages/oracle`'s own, on the same principle those two keep independent of
 * each other: `ARCHITECTURE.md §7.2`'s consistency gate is only worth anything
 * if the two implementations it compares were never built against one shared
 * builder, and B0 is a third, independent reading of `RECONCILIATION_SPEC.md
 * §3`'s `AN1`/`AN2` keys and deserves the same independence.
 */

type Obs<K extends Observation["kind"]> = Extract<Observation, { kind: K }>;

const HASH = "a".repeat(64) as Sha256;
const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(14, "0")}`;

const base = (n: number) => ({
  obs_id: `obs_${String(n).padStart(14, "0")}` as ObservationId,
  source_file: "fixture.jsonl",
  source_line: n,
  ingest_hash: HASH,
  ingested_at: 1_783_000_000 as UnixSeconds,
});

function settlement(
  n: number,
  opts: { id?: string; amount?: number; utr?: string } = {},
): Obs<"settlement"> {
  return {
    ...base(n),
    source_system: "pg_settlements",
    kind: "settlement",
    payload: {
      id: opts.id ?? pad("setl_", n),
      entity: "settlement",
      amount: opts.amount ?? 100_000,
      status: "processed",
      fees: 0,
      tax: 0,
      utr: opts.utr ?? `UTR${String(n).padStart(6, "0")}`,
      created_at: 1_782_900_000 as UnixSeconds,
    },
  } as Obs<"settlement">;
}

function reconLine(
  n: number,
  opts: {
    settlementId?: string | null;
    amount?: number;
    credit?: number;
    debit?: number;
    fee?: number;
    type?: "payment" | "refund";
    paymentId?: string | null;
  } = {},
): Obs<"recon_line"> {
  const amount = opts.amount ?? 100_000;
  const fee = opts.fee ?? 0;
  const type = opts.type ?? "payment";
  return {
    ...base(n),
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: pad(type === "refund" ? "rfnd_" : "pay_", n),
      type,
      debit: opts.debit ?? (type === "refund" ? amount : 0),
      credit: opts.credit ?? (type === "refund" ? 0 : amount - fee),
      amount,
      currency: "INR",
      fee,
      tax: 0,
      on_hold: false,
      settled: true,
      created_at: 1_782_900_000 as UnixSeconds,
      settled_at: 1_783_000_000 as UnixSeconds,
      settlement_id: opts.settlementId === undefined ? pad("setl_", n) : opts.settlementId,
      posted_at: null,
      credit_type: "default",
      payment_id: opts.paymentId ?? null,
      settlement_utr: null,
      order_id: pad("order_", n),
      method: "card",
      card_network: "Visa",
      card_issuer: null,
      card_type: "credit",
      dispute_id: null,
    },
  } as Obs<"recon_line">;
}

function bankLine(
  n: number,
  opts: { amount?: number; bankRef?: string | null; valueDate?: number } = {},
): Obs<"bank_line"> {
  return {
    ...base(n),
    source_system: "bank_statement",
    kind: "bank_line",
    payload: {
      bank_line_id: pad("bnk_", n),
      value_date: (opts.valueDate ?? 1_783_100_000) as UnixSeconds,
      amount: opts.amount ?? 100_000,
      direction: "credit",
      running_balance: null,
      bank_ref: opts.bankRef === undefined ? `UTR${String(n).padStart(6, "0")}` : opts.bankRef,
    },
  } as Obs<"bank_line">;
}

const CONFIG: RunConfig = Object.freeze({
  llm_mode: "offline",
  strict_replay: false,
  split: "dev",
  seed: 1,
});

describe("B0-IDONLY satisfies the Agent interface", () => {
  it("carries the declared id and an async run()", () => {
    expect(b0Agent.id).toBe("B0-IDONLY");
    expect(typeof b0Agent.run).toBe("function");
  });
});

describe("a clean AN1 match (recon_line.settlement_id === settlement.id, I4 ties out)", () => {
  it("reconciles the line and the settlement, and closes the period", async () => {
    const setl = settlement(1);
    const line = reconLine(2, {
      settlementId: setl.payload.id,
      amount: 100_000,
      fee: 0,
      credit: 100_000,
    });
    const run = await b0Agent.run({ observations: [setl, line], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(setl.obs_id)?.state).toBe("RECONCILED");
    expect(byId.get(line.obs_id)?.state).toBe("RECONCILED");
    expect(run.decisions).toHaveLength(1);
    expect(run.decisions[0]).toEqual({
      target_id: setl.payload.id,
      member_entity_ids: [line.payload.entity_id],
      score_bps: null,
    });
    expect(run.allocations).toEqual([
      { entity_id: line.payload.entity_id, target_id: setl.payload.id },
    ]);
    expect(run.open_exceptions).toEqual([]);
    expect(run.abstentions).toEqual([]);
    expect(run.close).not.toBeNull();
    expect(run.close?.period_status).toBe("CLOSED");
    expect(run.close?.trial_balance_ok).toBe(true);
    expect(run.close?.gate.g1_all_terminal).toBe(true);
    expect(run.close?.gate.g2_trial_balance).toBe(true);
    // A committed AN1 join posts P1 (ingest) at least; the run's own journal
    // carries the lines rather than this test re-deriving them.
    expect(run.journal.length).toBeGreaterThan(0);
    expect(run.journal.every((p) => p.decision_state === "RECONCILED")).toBe(true);
  });
});

describe("a clean AN2 match (normalize(settlement.utr) === normalize(bank_ref), amount equal)", () => {
  it("reconciles the bank line, and the settlement's line posts its bank leg (P2)", async () => {
    const setl = settlement(10, { utr: "utr-2/CR", amount: 50_000 });
    const line = reconLine(11, { settlementId: setl.payload.id, amount: 50_000, credit: 50_000 });
    const bank = bankLine(12, { amount: 50_000, bankRef: "UTR2 cr" });
    const run = await b0Agent.run({ observations: [setl, line, bank], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(bank.obs_id)?.state).toBe("RECONCILED");
    expect(byId.get(setl.obs_id)?.state).toBe("RECONCILED");
    expect(byId.get(line.obs_id)?.state).toBe("RECONCILED");
    // P2 fires only under real bank-side evidence (M49): the accepted line's
    // BANK_EVIDENCE posting is present, so more than the one INGEST leg posts.
    const lineLines = run.journal.filter(
      (p) => p.line.source_entity_id === line.payload.entity_id,
    );
    expect(lineLines.length).toBeGreaterThan(1);
    expect(run.close?.period_status).toBe("CLOSED");
  });
});

describe("an unmatched line reaches an exception", () => {
  it("a recon_line with no settlement_id reaches E02_MISSING_SETTLEMENT", async () => {
    const line = reconLine(3, { settlementId: null });
    const run = await b0Agent.run({ observations: [line], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(line.obs_id)?.state).toBe("EXCEPTION");
    expect(run.open_exceptions).toHaveLength(1);
    expect(run.open_exceptions[0]?.exception_class).toBe("E02_MISSING_SETTLEMENT");
    expect(run.decisions).toEqual([]);
    expect(run.allocations).toEqual([]);
  });

  it("a settlement with no AN1-joined member reaches E01_MISSING_CAPTURE", async () => {
    const setl = settlement(4);
    const run = await b0Agent.run({ observations: [setl], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(setl.obs_id)?.state).toBe("EXCEPTION");
    expect(run.open_exceptions[0]?.exception_class).toBe("E01_MISSING_CAPTURE");
  });

  it("a bank line with no AN2 match reaches E03_BANK_CREDIT_UNMATCHED", async () => {
    const bank = bankLine(5, { bankRef: null });
    const run = await b0Agent.run({ observations: [bank], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(bank.obs_id)?.state).toBe("EXCEPTION");
    expect(run.open_exceptions[0]?.exception_class).toBe("E03_BANK_CREDIT_UNMATCHED");
  });

  it("a settlement whose AN1 join fails I4 falls back to E05_AMOUNT_MISMATCH", async () => {
    const setl = settlement(30, { amount: 100_000 });
    // amount ties to neither settlement.amount nor its own arithmetic identity
    // in a way I4 accepts: credit sums to less than the settlement's amount.
    const line = reconLine(31, {
      settlementId: setl.payload.id,
      amount: 100_000,
      fee: 0,
      credit: 40_000,
    });
    const run = await b0Agent.run({ observations: [setl, line], config: CONFIG });

    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(setl.obs_id)?.state).toBe("EXCEPTION");
    expect(byId.get(setl.obs_id)?.state === "EXCEPTION").toBe(true);
    const setlException = run.open_exceptions.find(
      (e) => e.source_entity_id === setl.payload.id,
    );
    expect(setlException?.exception_class).toBe("E05_AMOUNT_MISMATCH");
    // The member itself is not part of any committed allocation.
    expect(run.allocations).toEqual([]);
  });

  it("an adjustment always reaches E12_ADJUSTMENT_UNEXPLAINED, allocated or not", async () => {
    const setl = settlement(40, { amount: 100_500 });
    const line = reconLine(41, {
      settlementId: setl.payload.id,
      amount: 100_000,
      fee: 0,
      credit: 100_000,
    });
    const adj = {
      ...base(42),
      source_system: "pg_recon",
      kind: "adjustment",
      payload: {
        ...line.payload,
        entity_id: pad("adj_", 42),
        type: "adjustment",
        settlement_id: setl.payload.id,
        // I3 needs exactly one non-zero side; I4's sum must still tie out to
        // the settlement's amount (100_000 + 500 = 100_500) for this test to
        // show the adjustment's own decision as EXCEPTION *despite* being part
        // of a RECONCILED settlement's allocation.
        credit: 500,
        debit: 0,
        amount: 500,
      },
    } as unknown as Obs<"adjustment">;
    const run = await b0Agent.run({ observations: [setl, line, adj], config: CONFIG });
    const byId = new Map(run.outcomes.map((o) => [o.obs_id, o]));
    expect(byId.get(adj.obs_id)?.state).toBe("EXCEPTION");
    const adjException = run.open_exceptions.find(
      (e) => e.source_entity_id === adj.payload.entity_id,
    );
    expect(adjException?.exception_class).toBe("E12_ADJUSTMENT_UNEXPLAINED");
  });
});

describe("determinism — same AgentInput, byte-identical AgentRun", () => {
  it("produces deep-equal runs across two invocations", async () => {
    const setl = settlement(50, { utr: "UTR000050" });
    const line = reconLine(51, {
      settlementId: setl.payload.id,
      amount: 75_000,
      fee: 1_000,
      credit: 74_000,
    });
    const bank = bankLine(52, { amount: 75_000, bankRef: "UTR000050" });
    const stray = reconLine(53, { settlementId: null, type: "refund" });
    const input = { observations: [setl, line, bank, stray], config: CONFIG };

    const first = await b0Agent.run(input);
    const second = await b0Agent.run(input);

    expect(second).toEqual(first);
    expect(first.close?.ledger_root_hash).toEqual(second.close?.ledger_root_hash);
  });
});

describe("G8 — B0 cannot reach the filesystem door or a prohibited surface", () => {
  const SOURCE = readFileSync(
    fileURLToPath(new URL("../src/agents/b0.ts", import.meta.url)),
    "utf8",
  );

  it("imports no fs module and reaches no ../fs/ door", () => {
    expect(SOURCE).not.toMatch(/from ["']node:fs["']/);
    expect(SOURCE).not.toMatch(/require\(["']node:fs["']\)/);
    expect(SOURCE).not.toMatch(/\.\.\/fs\//);
  });

  it("names no ground truth, oracle label or recon report surface", () => {
    expect(SOURCE).not.toMatch(/ground_truth/);
    expect(SOURCE).not.toMatch(/oracle_labels/);
    expect(SOURCE).not.toMatch(/recon_report/);
  });
});
