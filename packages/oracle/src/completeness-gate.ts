/**
 * The completeness gate — `PREREGISTRATION.md §5.3`.
 *
 * "For every target in a generated dataset, the true allocation from ground
 * truth must appear among the oracle's enumerated solutions. Catches a
 * constraint set that is *too strict* — one that excludes reality. If it fails,
 * the benchmark is invalid and no results may be reported from it."
 *
 * **Scoped to expressible targets at spec 1.4.4.** `§5.3`: "A target is
 * **expressible** iff every member of its true allocation has an observation in
 * the dataset whose kind is member-eligible under `DATA_MODEL.md §11.1`. The
 * gate requires the true allocation to appear among the oracle's enumerated
 * solutions **for every expressible target**, and reports the inexpressible ones
 * with their cause and count."
 *
 * **Expressibility is decided without reading `C1`–`C8`.** It is a property of
 * observation existence and kind alone. That is what keeps the scoping from
 * becoming a way to pass: a constraint set that wrongly excludes a genuinely
 * expressible true allocation still fails this gate. Scoping instead by whether
 * the oracle enumerated anything would be circular and `§5.3` refuses it.
 *
 * **This function performs no I/O and takes ground truth as an argument.**
 * `DECISION_BRIEF.md §K` places this module in `packages/oracle`; `§6.2` `AL2`
 * bars oracle code from reading any `ground_truth*.jsonl` path and `AL1` bars it from
 * importing `packages/generator`. A pure function over data the caller supplies
 * satisfies all three, and mirrors the contract `packages/ledger`'s `journal.ts`
 * already uses — the caller states the facts rather than the module inferring
 * them. `apps/cli` performs the read.
 */

import type { OracleTargetResult } from "./enumerate.js";

/**
 * One target's true allocation, as the caller derives it from `GroundTruth`.
 *
 * `member_obs_ids` rather than `entity_id`s: `GroundTruth.allocations` keys on
 * `pay_… | rfnd_… | adj_…` while the oracle enumerates `obs_id`s, so the caller
 * performs the join. It is 1:1 on recon rows — every generated dataset carries
 * one recon row per entity — and doing it caller-side keeps this module free of
 * any assumption about how ground truth is shaped.
 */
export interface TrueAllocation {
  readonly target_id: string;
  readonly member_obs_ids: readonly string[];
  /**
   * `true` when every member of the true allocation has a member-eligible
   * observation in the dataset. The caller decides this, because only the
   * caller holds both ground truth and the observation set.
   */
  readonly expressible: boolean;
}

/** Why one target failed, or why it was not in scope. */
export type CompletenessOutcome =
  | "PASS"
  | "TRUE_ALLOCATION_ABSENT"
  | "TARGET_NOT_ENUMERATED"
  | "SCOPED_OUT_INEXPRESSIBLE"
  | "SCOPED_OUT_BUDGET_EXHAUSTED";

/** One target's gate result. */
export interface CompletenessFinding {
  readonly target_id: string;
  readonly outcome: CompletenessOutcome;
  /**
   * The constraints that rejected the true allocation, when it was enumerated
   * and rejected. **This is the diagnostic half of the gate.** A gate that
   * returns false without naming the constraint that excluded reality sends a
   * reviewer to read the whole declaration.
   */
  readonly excluded_by: readonly string[];
}

/** The gate's verdict over a dataset. */
export interface CompletenessResult {
  readonly passed: boolean;
  readonly targets_total: number;
  readonly targets_in_scope: number;
  readonly scoped_out_inexpressible: number;
  readonly scoped_out_budget_exhausted: number;
  readonly failures: readonly CompletenessFinding[];
  readonly findings: readonly CompletenessFinding[];
}

/**
 * A canonical, order-independent key for a member set.
 *
 * The separator is `NUL`, written as an escape rather than as a literal byte:
 * an obs id cannot contain one, so no two distinct member sets can collide on
 * their joined key, and the source file stays plain text that `git` diffs and
 * blames line by line. A raw `0x00` here would work identically at runtime and
 * make the whole module a binary blob to version control.
 */
const sortedKey = (ids: readonly string[]): string =>
  [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join("\u0000");

/**
 * Run the completeness gate.
 *
 * @param results  what the oracle enumerated, per target.
 * @param truth    the true allocation per target, with its expressibility, as
 *                 the caller derived it from `GroundTruth`.
 */
export function completenessGate(
  results: readonly OracleTargetResult[],
  truth: readonly TrueAllocation[],
): CompletenessResult {
  const byTarget = new Map(results.map((r) => [r.target_id, r]));
  const findings: CompletenessFinding[] = [];
  let inScope = 0;
  let inexpressible = 0;
  let budgetExhausted = 0;

  for (const t of truth) {
    if (!t.expressible) {
      inexpressible += 1;
      findings.push({
        target_id: t.target_id,
        outcome: "SCOPED_OUT_INEXPRESSIBLE",
        excluded_by: [],
      });
      continue;
    }
    const result = byTarget.get(t.target_id);
    if (result === undefined) {
      inScope += 1;
      findings.push({
        target_id: t.target_id,
        outcome: "TARGET_NOT_ENUMERATED",
        excluded_by: [],
      });
      continue;
    }
    if (result.status === "K_ORACLE_EXCEEDED" || result.status === "C_ORACLE_EXCEEDED") {
      budgetExhausted += 1;
      findings.push({
        target_id: t.target_id,
        outcome: "SCOPED_OUT_BUDGET_EXHAUSTED",
        excluded_by: [],
      });
      continue;
    }

    inScope += 1;
    const wanted = sortedKey(t.member_obs_ids);
    const found = result.solutions.some((s) => sortedKey(s.member_obs_ids) === wanted);
    findings.push({
      target_id: t.target_id,
      outcome: found ? "PASS" : "TRUE_ALLOCATION_ABSENT",
      excluded_by: found ? [] : namesOfExcluders(result),
    });
  }

  const failures = findings.filter((f) => f.outcome !== "PASS" && !f.outcome.startsWith("SCOPED_OUT"));
  return Object.freeze({
    passed: failures.length === 0,
    targets_total: truth.length,
    targets_in_scope: inScope,
    scoped_out_inexpressible: inexpressible,
    scoped_out_budget_exhausted: budgetExhausted,
    failures: Object.freeze(failures),
    findings: Object.freeze(findings),
  });
}

/**
 * The constraints that rejected candidates for a target whose truth was absent.
 *
 * A best-effort diagnostic rather than a proof: it names the constraints that
 * did any excluding at all in this target's enumeration, which is where a
 * reviewer should look first when the gate fails.
 */
function namesOfExcluders(result: OracleTargetResult): readonly string[] {
  return Object.freeze(
    Object.entries(result.excluded_by)
      .filter(([, n]) => n > 0)
      .map(([id]) => id)
      .sort(),
  );
}
