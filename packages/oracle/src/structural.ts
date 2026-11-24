/**
 * bench-v2's STRUCTURAL label — `structurally_exchangeable(t)` and its
 * complements — from the oracle's own enumeration and nothing else
 * (`docs/BENCH_V2_PREREGISTRATION.md §3`).
 *
 * **What this is.** A second reading of `enumerate.ts`'s result that asks one
 * question per settlement target: *how many allocations are admissible under
 * the documented `C1`–`C8`, and would the ENGINE's search bound have let it
 * find out?* It carries no evidence score, no materiality and no `τ`: those
 * belong to `classify.ts` (`§5.4`'s frozen `TRULY_AMBIGUOUS`, which this file
 * does not touch and does not rename) and, for bench-v2's documented model, to
 * `packages/eval/src/documented-model/`. The frozen label vocabulary
 * `AMBIGUITY_LABELS` is untouched; the names here are distinct on purpose.
 *
 * **Observations only.** `AL2` holds by construction as it does for the rest of
 * this package: the inputs are the agent's observation set and the oracle run
 * computed from it. No quarantined text, no recon report, no ground truth, no
 * engine output and no generator intent flag reaches this module.
 *
 * **The engine's bound is a parameter, not an import.** `packages/oracle` may
 * not import `packages/engine` (`AL1`, `eslint.config.js`), so the caller
 * supplies `{ k_max, c_max }`; `packages/eval/src/frozen.ts` transcribes
 * `PREREGISTRATION.md §7`'s `SEARCH_BOUND` for that purpose. The bound is
 * mirrored from `s2-candidates.ts`'s rule exactly — a **class** larger than
 * `k_max`, or more than `c_max` **non-empty** subsets summed over the target's
 * candidate classes — and a target that would trip it is labelled
 * `SEARCH_BOUND_ORACLE` and enters no structural population. That exclusion
 * is declared before any bench-v2 figure exists; the count is reported inline
 * beside every rate it affects (`docs/BENCH_V2_PREREGISTRATION.md §4`).
 */

import type { Observation } from "@assay/domain";

import type { OracleRun } from "./classify.js";
import { settledAtClasses, unanchoredMembers, type OracleTargetResult } from "./enumerate.js";
import { memberContribution, type MemberContribution, type TargetContribution } from "./universe.js";

/** The engine's `S2` search bound, supplied by the caller (`PREREGISTRATION.md §7`). */
export interface SearchBounds {
  readonly k_max: number;
  readonly c_max: number;
}

/**
 * The structural label of one target.
 *
 * - `EXCHANGEABLE`: **≥ 2** admissible allocations under `C1`–`C8`, within the
 *   engine's bound. bench-v2's `structurally_exchangeable(t)`.
 * - `SINGLE`: exactly **one**, within the bound, on a target that needed
 *   enumeration. Metric M-G's denominator.
 * - `NONE`: **zero**, within the bound.
 * - `ANCHOR_RESOLVED`: the target's `AN1`-anchored members already tie out
 *   (`enumerate.ts` status `ANCHORED`); it never reaches `S2` and is in no
 *   structural population.
 * - `SEARCH_BOUND_ORACLE`: the engine's bound (or the oracle's own, which is
 *   wider) would be hit before the count is known. Reported, never scored.
 * - `NO_MEMBER_KIND`: a `bank_line` target (`DATA_MODEL.md §11.1`: the empty
 *   candidate set). In no population.
 */
export type StructuralLabel =
  | "EXCHANGEABLE"
  | "SINGLE"
  | "NONE"
  | "ANCHOR_RESOLVED"
  | "SEARCH_BOUND_ORACLE"
  | "NO_MEMBER_KIND";

export const STRUCTURAL_LABELS: readonly StructuralLabel[] = Object.freeze([
  "EXCHANGEABLE",
  "SINGLE",
  "NONE",
  "ANCHOR_RESOLVED",
  "SEARCH_BOUND_ORACLE",
  "NO_MEMBER_KIND",
]);

/** One target's structural row. */
export interface StructuralRow {
  readonly target_id: string;
  readonly target_kind: TargetContribution["kind"];
  readonly label: StructuralLabel;
  /** Admissible allocations found; `0` under a bound label. */
  readonly solution_count: number;
  /** `AN1`-anchored members of the target — `k` in `PREREGISTRATION.md §10` V40's bound. */
  readonly anchored_count: number;
  /** Sizes of the target's candidate classes, ascending by instant. */
  readonly class_sizes: readonly number[];
  /** Non-empty subsets the engine would enumerate: `Σ (2^n − 1)` over the classes. */
  readonly engine_subsets: number;
}

/** `structurally_exchangeable(t)`, as a predicate over a row. */
export function structurallyExchangeable(row: StructuralRow): boolean {
  return row.label === "EXCHANGEABLE";
}

/**
 * The candidate classes the engine would enumerate for one settlement target,
 * mirrored from `enumerate.ts` / `s2-candidates.ts`: with anchored members the
 * class is the anchored instant's; without, every `settled_at` class.
 */
function candidateClassSizes(
  anchored: readonly MemberContribution[],
  unanchored: readonly MemberContribution[],
): readonly number[] {
  const anchoredInstants = new Set(anchored.map((m) => m.settled_at).filter((t): t is number => t !== null));
  const classes = settledAtClasses(unanchored);
  const chosen = [...classes.entries()]
    .filter(([instant]) => anchoredInstants.size !== 1 || anchoredInstants.has(instant))
    .sort(([a], [b]) => a - b);
  return chosen.map(([, members]) => members.length);
}

function rowFor(
  result: OracleTargetResult,
  anchored: readonly MemberContribution[],
  unanchored: readonly MemberContribution[],
  bounds: SearchBounds,
): StructuralRow {
  const base = { target_id: result.target_id, target_kind: result.target_kind, anchored_count: anchored.length } as const;
  if (result.target_kind === "bank_line" || result.status === "NO_ELIGIBLE_MEMBER_KIND") {
    return { ...base, label: "NO_MEMBER_KIND", solution_count: 0, class_sizes: [], engine_subsets: 0 };
  }
  const classSizes = candidateClassSizes(anchored, unanchored);
  const engineSubsets = classSizes.reduce((t, n) => t + (2 ** n - 1), 0);
  const sized = { ...base, class_sizes: Object.freeze(classSizes), engine_subsets: engineSubsets } as const;
  if (result.status === "ANCHORED") {
    return { ...sized, label: "ANCHOR_RESOLVED", solution_count: result.solutions.length };
  }
  if (
    result.status === "K_ORACLE_EXCEEDED" ||
    result.status === "C_ORACLE_EXCEEDED" ||
    classSizes.some((n) => n > bounds.k_max) ||
    engineSubsets > bounds.c_max
  ) {
    return { ...sized, label: "SEARCH_BOUND_ORACLE", solution_count: 0 };
  }
  const count = result.solutions.length;
  return { ...sized, label: count >= 2 ? "EXCHANGEABLE" : count === 1 ? "SINGLE" : "NONE", solution_count: count };
}

/**
 * The structural row of every target in an oracle run, in the run's own order.
 *
 * Pure in both inputs: the same observations and the same run give the same
 * rows whatever order the observations arrive in, because every set below is
 * keyed by id and every class is sorted by instant.
 */
export function structuralLabels(
  observations: readonly Observation[],
  run: OracleRun,
  bounds: SearchBounds,
): readonly StructuralRow[] {
  const members = observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);
  const unanchored = unanchoredMembers(members);
  const anchoredBySettlement = new Map<string, MemberContribution[]>();
  for (const m of members) {
    if (m.settlement_id === null) continue;
    const bucket = anchoredBySettlement.get(m.settlement_id);
    if (bucket === undefined) anchoredBySettlement.set(m.settlement_id, [m]);
    else bucket.push(m);
  }
  return Object.freeze(
    run.results.map((result) =>
      rowFor(result, anchoredBySettlement.get(result.target_id) ?? [], unanchored, bounds),
    ),
  );
}

/** Counts by structural label, every label present (zero where empty). */
export function structuralCounts(rows: readonly StructuralRow[]): Readonly<Record<StructuralLabel, number>> {
  const out = {} as Record<StructuralLabel, number>;
  for (const label of STRUCTURAL_LABELS) out[label] = 0;
  for (const row of rows) out[row.label] += 1;
  return Object.freeze(out);
}
