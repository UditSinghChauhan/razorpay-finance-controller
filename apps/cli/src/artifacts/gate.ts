import type { Observation } from "@assay/domain";
import type { ConsistencyResult } from "@assay/eval";
import { memberContribution, type CompletenessResult, type TrueAllocation } from "@assay/oracle";

/**
 * `bench/<split>/<seed>/oracle_gate.json` — the `PREREGISTRATION.md §5.3` gate
 * artifact, and the ground-truth join that feeds the completeness gate.
 *
 * Spec 1.4.27 (`DATA_MODEL.md §22.2` M43) makes `apps/cli` the executor of both
 * gates while leaving the gates themselves untouched in their own packages. Two
 * jobs land here and neither is gate logic:
 *
 *   1. **The join.** `completeness-gate.ts` states its own contract:
 *      *"`member_obs_ids` rather than `entity_id`s: `GroundTruth.allocations`
 *      keys on `pay_… | rfnd_… | adj_…` while the oracle enumerates `obs_id`s,
 *      **so the caller performs the join**."* No constraint is evaluated below
 *      and no `C1`–`C8` clause is read.
 *   2. **The artifact.** `§5.3` requires the inexpressible ones reported *"with
 *      their cause and count, per family, in the same artifact as the pass"*, and
 *      `EVALUATION_SPEC.md §5.4` item 4 requires both gate results in the report
 *      with the differential sample size.
 *
 * **Expressibility is decided without reading `C1`–`C8`.** `§5.3`: it *"is a
 * property of observation existence and kind alone. A constraint set that
 * wrongly excludes a genuinely expressible true allocation therefore still fails
 * the gate, which is what keeps the scoping from becoming a way to pass."* The
 * kind test below is `packages/oracle`'s own `memberContribution`, so
 * `DATA_MODEL.md §11.1`'s member-eligible set is read from the package that
 * declares it rather than restated here.
 *
 * **On the test split the artifact is aggregate only.** `AL4` bars inspection of
 * TEST outputs before the sealed run and `AL7` burns the seed on a breach, so a
 * finding naming a `target_id` would be an inspection the gate performed on the
 * developer's behalf. {@link redactForSplit} drops every per-target record and
 * keeps the counts, the per-family tallies and the pass bit — which is the whole
 * of what `§5.3` and `§5.4` require to be reported.
 */

/** A `CompletenessResult` with every record-level field removed (`AL4`/`AL7`). */
export interface AggregateCompleteness {
  readonly passed: boolean;
  readonly targets_total: number;
  readonly targets_in_scope: number;
  readonly scoped_out_inexpressible: number;
  readonly scoped_out_budget_exhausted: number;
  /** How many targets failed. The targets themselves are not named. */
  readonly failure_count: number;
  /** `§5.3`'s per-family breakdown — counts only, and already record-free. */
  readonly by_family: CompletenessResult["by_family"];
  /**
   * The constraints that excluded a true allocation, deduplicated and sorted.
   *
   * Kept because it is the gate's diagnostic half and names a **clause**, never
   * a record: `§5.3` requires a failure to name the constraint, and `C6` is not a
   * TEST observation.
   */
  readonly excluded_by: readonly string[];
}

/** The consistency half, as the artifact carries it (`§5.4` item 4). */
export interface ConsistencyReport {
  readonly passed: boolean;
  readonly sample_size: number;
  readonly meets_declared_sample_size: boolean;
  /**
   * The draw's seed. **Not frozen** — `PREREGISTRATION.md §10` V24 — so it is
   * recorded here, and a gate run always names the draw that produced it.
   */
  readonly draw_seed: number;
  readonly by_clause: ConsistencyResult["by_clause"];
  readonly divergences: ConsistencyResult["divergences"];
  readonly admissibility_divergences: readonly string[];
}

/** One `(split, seed)`'s gate artifact. */
export interface OracleGateReport {
  readonly spec_version: string;
  readonly split: string;
  readonly seed: number;
  /** Both gates that ran, passing. A gate that did not run cannot make this true. */
  readonly passed: boolean;
  /** Full on train/dev; aggregate on test, where `AL4` bars record-level output. */
  readonly completeness: CompletenessResult | AggregateCompleteness;
  /** `null` on `test`: `§5.3` draws the differential sample from the dev split. */
  readonly consistency: ConsistencyReport | null;
}

/**
 * Exactly the `GroundTruth` fields the `§5.3` join reads, and nothing more.
 *
 * Narrower than `packages/generator`'s `GroundTruth` on purpose. That type is
 * **structurally assignable** to this one, so a caller holding a real record
 * passes it unchanged and no cast is needed anywhere; and a reader that names
 * only `family_id` and the two allocation keys cannot come to depend on
 * `true_journal`, `true_balances` or `degradations`, none of which the gate is
 * entitled to see. `DATA_MODEL.md §1` owns the full shape; this is a projection
 * of it, declared where it is consumed.
 */
export interface TruthRow {
  readonly family_id: string;
  readonly allocations: readonly {
    readonly settlement_id: string;
    readonly entity_id: string;
  }[];
}

/**
 * Read one `ground_truth.jsonl` record into a {@link TruthRow}.
 *
 * **Not an `S0` transform and not a schema.** `RECONCILIATION_SPEC.md §2`'s five
 * steps are over *source data*; ground truth is the generator's own output, is
 * never ingested, and reaches no agent. This checks the two fields the join
 * dereferences so that a malformed record fails loudly here rather than
 * producing a silently short `member_obs_ids` and a gate that passes on a
 * truncated truth.
 */
export function readTruthRow(value: unknown): TruthRow {
  const record = asObject(value, "ground truth record");
  const family = record["family_id"];
  if (typeof family !== "string" || family === "") {
    throw new TypeError(`ground truth record: family_id must be a non-empty string.`);
  }
  const rows = record["allocations"];
  if (!Array.isArray(rows)) {
    throw new TypeError(`ground truth record: allocations must be an array (DATA_MODEL.md §1).`);
  }
  return Object.freeze({
    family_id: family,
    allocations: Object.freeze(
      rows.map((row, index) => {
        const allocation = asObject(row, `allocations[${String(index)}]`);
        const settlementId = allocation["settlement_id"];
        const entityId = allocation["entity_id"];
        if (typeof settlementId !== "string" || typeof entityId !== "string") {
          throw new TypeError(
            `ground truth allocations[${String(index)}]: settlement_id and entity_id must be ` +
              `strings (DATA_MODEL.md §1).`,
          );
        }
        return Object.freeze({ settlement_id: settlementId, entity_id: entityId });
      }),
    ),
  });
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${what}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * `GroundTruth.allocations`, joined onto the oracle's `obs_id` space.
 *
 * One `TrueAllocation` per settlement named in ground truth. `expressible` is
 * `§5.3`'s: every member of the true allocation has a member-eligible
 * observation in the dataset. `PREREGISTRATION.md §4.2`'s `F05` withholds one
 * constituent `recon_line` **observation**, so that target is inexpressible and
 * the gate scopes it out — which is the case `§5.3`'s quantifier moved for.
 *
 * @throws Error when a settlement in ground truth has no `settlement`
 *   observation. Not a data condition: `§4.1` emits one observation per
 *   settlement, so a miss means the dataset and its ground truth disagree about
 *   what exists, and scoping it out silently would hide that behind a pass.
 */
export function trueAllocations(
  truth: readonly TruthRow[],
  observations: readonly Observation[],
): readonly TrueAllocation[] {
  const targetObsId = new Map<string, string>();
  for (const observation of observations) {
    if (observation.kind === "settlement") targetObsId.set(observation.payload.id, observation.obs_id);
  }

  const memberObsId = new Map<string, string>();
  for (const observation of observations) {
    const member = memberContribution(observation);
    if (member !== null) memberObsId.set(member.entity_id, member.obs_id);
  }

  const out: TrueAllocation[] = [];
  for (const gt of truth) {
    // Grouped in first-appearance order, which is `GroundTruth.allocations`'
    // own; the gate reads a set and no rule reads a target's position here.
    const bySettlement = new Map<string, string[]>();
    for (const allocation of gt.allocations) {
      const held = bySettlement.get(allocation.settlement_id);
      if (held === undefined) bySettlement.set(allocation.settlement_id, [allocation.entity_id]);
      else held.push(allocation.entity_id);
    }

    for (const [settlementId, entityIds] of bySettlement) {
      const targetId = targetObsId.get(settlementId);
      if (targetId === undefined) {
        throw new Error(
          `oracle gate: ground truth names settlement ${settlementId}, which has no settlement ` +
            `observation in the dataset. PREREGISTRATION.md §4.1 emits one observation per ` +
            `settlement, so this is a dataset defect rather than a §5.3 expressibility question.`,
        );
      }
      const memberIds = entityIds.map((entityId) => memberObsId.get(entityId));
      out.push(
        Object.freeze({
          target_id: targetId,
          member_obs_ids: Object.freeze(
            memberIds.filter((obsId): obsId is string => obsId !== undefined),
          ),
          // §5.3: "every member of its true allocation has an observation in the
          // dataset whose kind is member-eligible under DATA_MODEL.md §11.1".
          expressible: memberIds.every((obsId) => obsId !== undefined),
          family: gt.family_id,
        }),
      );
    }
  }
  return Object.freeze(out);
}

/**
 * Reduce a gate result to counts where the split forbids records.
 *
 * `train` and `dev` keep the findings: `AL4` permits inspection of both *"without
 * limit"*, and a developer fixing a constraint set needs the target that failed.
 * `test` gets counts only.
 */
export function redactForSplit(
  result: CompletenessResult,
  split: string,
): CompletenessResult | AggregateCompleteness {
  if (split !== "test") return result;
  const clauses = new Set<string>();
  for (const finding of result.failures) for (const id of finding.excluded_by) clauses.add(id);
  return Object.freeze({
    passed: result.passed,
    targets_total: result.targets_total,
    targets_in_scope: result.targets_in_scope,
    scoped_out_inexpressible: result.scoped_out_inexpressible,
    scoped_out_budget_exhausted: result.scoped_out_budget_exhausted,
    failure_count: result.failures.length,
    by_family: result.by_family,
    excluded_by: Object.freeze([...clauses].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))),
  });
}

/**
 * Serialize a gate report.
 *
 * Two-space JSON with a trailing newline, matching `assay seal`'s manifest: both
 * are single-object artifacts a reviewer reads by eye, and neither enters a
 * digest — `§9` step 4 hashes the four dataset artifacts and the probe surface,
 * and M43 keeps `oracle_gate.json` out of that set deliberately, it being a build
 * product rather than a benchmark surface.
 */
export function encodeGateReport(report: OracleGateReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Whether a decoded gate artifact records a passing completeness gate. */
export function gateArtifactPasses(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const completeness = record["completeness"];
  if (typeof completeness !== "object" || completeness === null) return false;
  return (completeness as Record<string, unknown>)["passed"] === true;
}
