import { describe, expect, it } from "vitest";

import type { Observation } from "@assay/domain";
import { paise } from "@assay/money";
import type { DegradationOp, DegradationRecord, GroundTruth } from "@assay/generator";

import { INJECTING_OPS, degradationPopulations } from "../src/index.js";
import { bankLine, payment, reconLine } from "./fixtures.js";

/**
 * M52 — metric 15's and metric 16's two populations
 * (`EVALUATION_SPEC.md §4.8`, `PREREGISTRATION.md §7`, register row
 * `DATA_MODEL.md §22.2` M52).
 *
 * `PREREGISTRATION.md §6.1` forbids a test from touching a split seed or the
 * generator, so every observation is a hand-built `fixtures.ts` value and every
 * `GroundTruth` here carries only the `degradations` this projection reads.
 */

function degradation(
  op: DegradationOp,
  targetId: string,
  params: Record<string, unknown> = {},
): DegradationRecord {
  return { op, target_id: targetId, params };
}

/** A `GroundTruth` carrying only what {@link degradationPopulations} reads. */
function groundTruth(degradations: readonly DegradationRecord[]): GroundTruth {
  return {
    gt_version: "1.1.0",
    seed: 9100,
    family_id: "F10",
    allocations: [],
    bank_mappings: [],
    ledger_mappings: [],
    true_journal: [],
    true_balances: {} as GroundTruth["true_balances"],
    degradations,
  } as GroundTruth;
}

const entityOf = (obs: Observation): string =>
  (obs.payload as { entity_id: string }).entity_id;

describe("INJECTING_OPS — the two operators §4.3's frozen table assigns to F10", () => {
  it("is exactly INJECT_NOTES and CONFLICT_REFERENCE", () => {
    expect([...INJECTING_OPS].sort()).toEqual(["CONFLICT_REFERENCE", "INJECT_NOTES"]);
  });
});

describe("degradationPopulations — M52's injected set", () => {
  it("resolves an INJECT_NOTES record by obs_id and a CONFLICT_REFERENCE record by entity_id", () => {
    const injectedPayment = payment("pay_00000000000001", 500_000, "order_00000000000001");
    const injectedRecon = reconLine({ entity: "pay_00000000000002", type: "payment", amount: 300_000 });
    const observations = [injectedPayment, injectedRecon];

    const gt = groundTruth([
      // degrade.ts writes INJECT_NOTES.target_id as the obs_id...
      degradation("INJECT_NOTES", injectedPayment.obs_id, { exemplar: "x", vector: "key+value" }),
      // ...and CONFLICT_REFERENCE.target_id as the recon_line's own entity_id.
      degradation("CONFLICT_REFERENCE", entityOf(injectedRecon), { was: "u1", settlement_utr: "u2" }),
    ]);

    const pops = degradationPopulations(gt, observations);
    expect([...pops.injected].sort()).toEqual([injectedPayment.obs_id, injectedRecon.obs_id].sort());
    expect([...pops.injected_kinds].sort()).toEqual(["payment", "recon_line"]);
    expect(pops.exercised).toBe(true);
  });

  it("does not add a non-injecting degradation's target to the injected set", () => {
    const dropped = reconLine({ entity: "pay_00000000000003", type: "payment", amount: 100_000 });
    const gt = groundTruth([degradation("DROP_SETTLEMENT_ID", entityOf(dropped), { field: "settlement_id" })]);

    const pops = degradationPopulations(gt, [dropped]);
    expect(pops.injected.size).toBe(0);
    expect(pops.injected_kinds.size).toBe(0);
    expect(pops.exercised).toBe(false);
  });
});

describe("degradationPopulations — M52's matched clean control", () => {
  it("keeps only clean observations whose kind appears in the injected set", () => {
    const injectedRecon = reconLine({ entity: "pay_00000000000010", type: "payment", amount: 400_000 });
    const cleanReconA = reconLine({ entity: "pay_00000000000011", type: "payment", amount: 200_000 });
    const cleanReconB = reconLine({ entity: "rfnd_00000000000012", type: "refund", amount: 90_000 });
    // A clean bank_line: never an injected kind here, so never a control.
    const cleanBank = bankLine("bnk_00000000000013", 400_000, "utr-clean");

    const gt = groundTruth([degradation("CONFLICT_REFERENCE", entityOf(injectedRecon), {})]);
    const pops = degradationPopulations(gt, [injectedRecon, cleanReconA, cleanReconB, cleanBank]);

    expect(pops.injected_kinds).toEqual(new Set(["recon_line"]));
    expect([...pops.control].sort()).toEqual([cleanReconA.obs_id, cleanReconB.obs_id].sort());
    expect(pops.control.has(injectedRecon.obs_id)).toBe(false);
    expect(pops.control.has(cleanBank.obs_id)).toBe(false);
  });

  it("excludes an observation in ANY degradation record, injecting or not", () => {
    const injectedRecon = reconLine({ entity: "pay_00000000000020", type: "payment", amount: 400_000 });
    const alsoDegraded = reconLine({ entity: "pay_00000000000021", type: "payment", amount: 400_000 });
    const clean = reconLine({ entity: "pay_00000000000022", type: "payment", amount: 400_000 });

    const gt = groundTruth([
      degradation("CONFLICT_REFERENCE", entityOf(injectedRecon), {}),
      degradation("DROP_SETTLEMENT_ID", entityOf(alsoDegraded), {}),
    ]);
    const pops = degradationPopulations(gt, [injectedRecon, alsoDegraded, clean]);

    expect(pops.injected).toEqual(new Set([injectedRecon.obs_id]));
    expect(pops.control).toEqual(new Set([clean.obs_id]));
  });
});

describe("degradationPopulations — DEV / not-exercised", () => {
  it("returns empty populations and exercised=false when no degradation injects", () => {
    const observations = [
      reconLine({ entity: "pay_00000000000030", type: "payment", amount: 400_000 }),
      reconLine({ entity: "pay_00000000000031", type: "payment", amount: 400_000 }),
    ];
    const pops = degradationPopulations(groundTruth([]), observations);

    expect(pops.injected.size).toBe(0);
    expect(pops.control.size).toBe(0);
    expect(pops.injected_kinds.size).toBe(0);
    expect(pops.exercised).toBe(false);
  });
});

describe("degradationPopulations — fail-closed", () => {
  it("throws when an INJECT_NOTES / CONFLICT_REFERENCE record names no observation", () => {
    const gt = groundTruth([degradation("INJECT_NOTES", "obs_00000000009999", {})]);
    expect(() => degradationPopulations(gt, [])).toThrow(/matches no observation/);
  });

  it("does NOT throw when a non-injecting record names no observation", () => {
    const clean = reconLine({ entity: "pay_00000000000040", type: "payment", amount: 400_000 });
    const gt = groundTruth([degradation("MANGLE_UTR", "bnk_00000000009999", { mode: "TRUNCATE" })]);
    expect(() => degradationPopulations(gt, [clean])).not.toThrow();
  });
});

describe("degradationPopulations — determinism and shape", () => {
  it("returns frozen, insertion-ordered sets over the observations order", () => {
    const a = reconLine({ entity: "pay_00000000000050", type: "payment", amount: 1 });
    const b = reconLine({ entity: "pay_00000000000051", type: "payment", amount: 1 });
    const c = reconLine({ entity: "pay_00000000000052", type: "payment", amount: 1 });
    const gt = groundTruth([degradation("CONFLICT_REFERENCE", entityOf(a), {})]);

    const pops = degradationPopulations(gt, [a, b, c]);
    expect(Object.isFrozen(pops)).toBe(true);
    expect([...pops.control]).toEqual([b.obs_id, c.obs_id]);

    const again = degradationPopulations(gt, [a, b, c]);
    expect([...again.control]).toEqual([...pops.control]);
  });

  it("counts an injected kind that reached the set via a reference-only observation", () => {
    // INJECT_NOTES targets order | payment | refund; order and payment are
    // REFERENCE kinds. The population is still a population of observations
    // filtered by kind — the metric-side consequence (a reference kind never
    // abstains) is EVALUATION_SPEC.md §4.8's, not this projection's.
    const p = payment("pay_00000000000060", paise(10), "order_00000000000060");
    const cleanPayment = payment("pay_00000000000061", paise(10), "order_00000000000061");
    const gt = groundTruth([degradation("INJECT_NOTES", p.obs_id, {})]);

    const pops = degradationPopulations(gt, [p, cleanPayment]);
    expect(pops.injected_kinds).toEqual(new Set(["payment"]));
    expect(pops.control).toEqual(new Set([cleanPayment.obs_id]));
  });
});
