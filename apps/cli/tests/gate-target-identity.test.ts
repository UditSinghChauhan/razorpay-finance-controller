import { DECLARED_SEEDS, SEED_BLOCKS, aggregateFamilies, generateFamily } from "@assay/generator";
import { completenessGate, labelAll, oracleContext } from "@assay/oracle";
import { describe, expect, it } from "vitest";

import { trueAllocations } from "../src/artifacts/gate.js";

/**
 * The `PREREGISTRATION.md §5.3` join keys targets by ENTITY id, not by `obs_id`.
 *
 * **What this suite pins.** `completenessGate` finds the oracle's result for a
 * target by `target_id` and by nothing else, so the truth side and the oracle
 * must emit that key in the **same id space**. `DATA_MODEL.md §11` fixes which
 * one: the frozen `Candidate` types `target_id` as a plain `string` — *"what is
 * being explained (settlement / bank line)"* — beside `member_obs_ids:
 * ObservationId[]`, and `RECONCILIATION_SPEC.md §6`'s allocation identity is a
 * set of `(target_id, member_obs_id)` pairs on the same asymmetry.
 * `packages/oracle` emits it: `enumerate.ts` keys results by
 * `TargetContribution.id`, which is `Settlement.id`.
 *
 * **Why it is worth a suite of its own.** The two sides are written in different
 * packages and no test compared them, so a truth side keyed on the settlement
 * observation's own `obs_id` type-checks, passes every existing test, and
 * intersects the oracle's key set **nowhere** — reporting every target
 * `TARGET_NOT_ENUMERATED` with an empty `excluded_by`, a total failure that
 * names no constraint. The last case below is the guard: it re-keys the truth
 * onto `obs_id` and requires the gate to FAIL, so the mismatch can never pass
 * silently again.
 *
 * **The seed appears in no row of `§6.1`'s split table**, which is the discipline
 * `packages/generator/tests/fixtures.ts` states for every generated fixture:
 * tests run *"under a seed that appears in **no** row of the split table"* and
 * `AL7` burns a seed on any breach. The families are read from `§6.1`'s frozen
 * dev row rather than restated, and the counts asserted below are `§4.1`'s
 * exact-realization composition — 31 settlements per family instance over six
 * families — with `§4.2`'s `F05` withholding `round_half_up(0.10 × S)` = 3
 * constituent `recon_line` observations. They are properties of the frozen
 * composition, not of this seed.
 */

const SEED = 4207;
if (DECLARED_SEEDS.includes(SEED)) {
  throw new Error(`gate-target-identity: ${String(SEED)} is a declared §6.1 split seed.`);
}

const DEV_FAMILIES = SEED_BLOCKS.find((block) => block.split === "dev")?.families ?? [];

const dataset = aggregateFamilies(
  SEED,
  DEV_FAMILIES.map((family) => generateFamily(family, SEED)),
);
const oracleRun = labelAll(dataset.observations, oracleContext(dataset.observations));
const truth = trueAllocations(dataset.ground_truth, dataset.observations);

/** `§4.1`: one settlement observation per settlement. The id it is keyed by is NOT the target key. */
const settlementObsId = new Map<string, string>();
for (const observation of dataset.observations) {
  if (observation.kind === "settlement") settlementObsId.set(observation.payload.id, observation.obs_id);
}

const TARGETS = 186;
const IN_SCOPE = 183;
const INEXPRESSIBLE = 3;

function outcomes(findings: readonly { readonly outcome: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.outcome] = (counts[finding.outcome] ?? 0) + 1;
  return counts;
}

describe("§5.3 — the truth target key and the oracle target key are the same id space", () => {
  it("emits settlement ENTITY ids on both sides, and they intersect completely", () => {
    const oracleSettlements = new Set(
      oracleRun.results.filter((r) => r.target_kind === "settlement").map((r) => r.target_id),
    );
    const truthTargets = new Set(truth.map((t) => t.target_id));

    expect(truthTargets.size).toBe(TARGETS);
    expect(oracleSettlements.size).toBe(TARGETS);
    for (const id of truthTargets) expect(id.startsWith("setl_")).toBe(true);
    expect([...truthTargets].filter((id) => oracleSettlements.has(id))).toHaveLength(TARGETS);
  });

  it("never keys a target by the settlement observation's obs_id", () => {
    const everyObsId = new Set<string>(dataset.observations.map((o) => o.obs_id));
    for (const t of truth) {
      expect(everyObsId.has(t.target_id)).toBe(false);
      expect(t.target_id.startsWith("obs_")).toBe(false);
    }
  });

  it("keys every MEMBER by obs_id, which the join does translate", () => {
    const everyObsId = new Set<string>(dataset.observations.map((o) => o.obs_id));
    const members = truth.flatMap((t) => [...t.member_obs_ids]);
    expect(members.length).toBeGreaterThan(0);
    for (const obsId of members) expect(everyObsId.has(obsId)).toBe(true);
  });
});

describe("§5.3 — the gate passes on a clean dev dataset", () => {
  const result = completenessGate(oracleRun.results, truth);

  it("matches every expressible target and fails none", () => {
    expect(result.passed).toBe(true);
    expect(result.targets_total).toBe(TARGETS);
    expect(result.targets_in_scope).toBe(IN_SCOPE);
    expect(result.failures).toHaveLength(0);
    expect(outcomes(result.findings)).toEqual({
      PASS: IN_SCOPE,
      SCOPED_OUT_INEXPRESSIBLE: INEXPRESSIBLE,
    });
  });

  it("scopes out F05's three inexpressible targets and no others", () => {
    expect(result.scoped_out_inexpressible).toBe(INEXPRESSIBLE);
    expect(result.scoped_out_budget_exhausted).toBe(0);

    const scopedOut = result.findings.filter((f) => f.outcome === "SCOPED_OUT_INEXPRESSIBLE");
    expect(scopedOut).toHaveLength(INEXPRESSIBLE);
    for (const finding of scopedOut) expect(finding.family).toBe("F05");

    for (const row of result.by_family) {
      expect(row.failures).toBe(0);
      expect(row.scoped_out_inexpressible).toBe(row.family === "F05" ? INEXPRESSIBLE : 0);
    }
  });

  it("scopes out exactly the settlements the oracle could find no solution for", () => {
    const scopedOut = new Set(
      result.findings.filter((f) => f.outcome === "SCOPED_OUT_INEXPRESSIBLE").map((f) => f.target_id),
    );
    const noSolution = new Set(
      oracleRun.labels
        .filter((l) => l.target_kind === "settlement" && l.label === "NO_SOLUTION")
        .map((l) => l.target_id),
    );
    expect(noSolution).toEqual(scopedOut);
  });
});

describe("§5.3 — an obs_id/entity_id mismatch cannot pass silently", () => {
  it("fails every in-scope target, naming no constraint, when the truth is re-keyed onto obs_id", () => {
    // The defect this suite exists for, reconstructed: the members stay correct
    // and only the TARGET key moves into the observation space.
    const misKeyed = truth.map((t) => ({ ...t, target_id: settlementObsId.get(t.target_id) ?? t.target_id }));
    const result = completenessGate(oracleRun.results, misKeyed);

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(IN_SCOPE);
    expect(outcomes(result.findings)).toEqual({
      TARGET_NOT_ENUMERATED: IN_SCOPE,
      SCOPED_OUT_INEXPRESSIBLE: INEXPRESSIBLE,
    });
    // The signature of a key-space miss rather than a too-strict constraint set.
    for (const failure of result.failures) expect(failure.excluded_by).toHaveLength(0);
  });
});
