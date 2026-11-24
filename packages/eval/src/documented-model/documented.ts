/**
 * bench-v2's documented predicates — `documented_evidence_gap_bps(t)`,
 * `documented_truly_ambiguous(t)`, `documented_discriminable(t)` — composed
 * from the oracle's STRUCTURAL label and this package's re-implementation of
 * the SPECIFIED evidence model (`docs/BENCH_V2_PREREGISTRATION.md §3`).
 *
 * **Division of labour, as ordered.** `packages/oracle` decides how many
 * allocations are admissible under `C1`–`C8` within the engine's bound — from
 * observations only, `AL2` intact (`structural.ts`). This module decides how
 * far apart the documented model scores them, which needs the recon report
 * (`SE5`) and therefore cannot live in the oracle. Neither reads the engine's
 * output: a target's engine verdict is joined to these rows only in
 * `metrics/bench-v2.ts`, as the thing being measured.
 *
 * **The gap is `§6`'s: the top score minus the second.** Every admissible
 * allocation is scored as `round_half_up(Σ weight × unit)` over the signals the
 * model can compute (`se.ts`), the allocations are ranked, and
 * `gap_bps = score[0] − score[1]`. With two allocations that is their
 * difference; with more it is the margin the top one holds, which is what
 * `RECONCILIATION_SPEC.md §6` compares with `ε`.
 *
 * **Materiality and `τ` are the oracle's frozen ones**, read off
 * `OracleLabel.max_materiality_paise` and `OracleLabel.tau_paise`
 * (`classify.ts`, `PREREGISTRATION.md §5.4`): `> τ` with `τ = max(₹100, 10 bps
 * × component value)`. This module recomputes neither. `EPSILON_BPS` is this
 * package's transcription (`frozen.ts`).
 */

import type { Observation } from "@assay/domain";
import {
  memberContribution,
  structuralLabels,
  type MemberContribution,
  type OracleRun,
  type SearchBounds,
  type StructuralLabel,
  type StructuralRow,
} from "@assay/oracle";

import { EPSILON_BPS, SE_WEIGHTS_BPS } from "../frozen.js";
import {
  documentedModeDays,
  documentedRStar,
  documentedSe3,
  documentedSe5,
  SE_IN_GAP,
  SE_UNDETERMINABLE,
  type ReconReportRowLike,
  type SeId,
} from "./se.js";

/**
 * A target's class under the documented model. Exactly one per target.
 *
 * - `TRULY_AMBIGUOUS`: `structurally_exchangeable ∧ gap ≤ ε ∧ materiality > τ`.
 * - `DISCRIMINABLE`: `structurally_exchangeable ∧ gap > ε`.
 * - `IMMATERIAL`: `structurally_exchangeable ∧ gap ≤ ε ∧ materiality ≤ τ` —
 *   the documented model's `IMMATERIALLY_AMBIGUOUS`; in neither population.
 * - `SINGLE`: exactly one admissible allocation on a target that needed
 *   enumeration — metric M-G's denominator.
 * - `NONE`, `ANCHOR_RESOLVED`, `SEARCH_BOUND_ORACLE`, `NO_MEMBER_KIND`: the
 *   structural label, carried through; in no population, counted as excluded.
 */
export type DocumentedClass =
  | "TRULY_AMBIGUOUS"
  | "DISCRIMINABLE"
  | "IMMATERIAL"
  | Exclude<StructuralLabel, "EXCHANGEABLE">;

export const DOCUMENTED_CLASSES: readonly DocumentedClass[] = Object.freeze([
  "TRULY_AMBIGUOUS",
  "DISCRIMINABLE",
  "IMMATERIAL",
  "SINGLE",
  "NONE",
  "ANCHOR_RESOLVED",
  "SEARCH_BOUND_ORACLE",
  "NO_MEMBER_KIND",
]);

/** One admissible allocation's documented score. */
export interface DocumentedScore {
  /** Member `obs_id`s, canonical order — the oracle's `OracleSolution.member_obs_ids`. */
  readonly member_obs_ids: readonly string[];
  readonly se3_unit: number;
  readonly se5_unit: number;
  /** `round_half_up(Σ weight × unit)` over {@link SE_IN_GAP}, in integer bps. */
  readonly score_bps: number;
}

/** One target under the documented model. */
export interface DocumentedTargetRow {
  readonly target_id: string;
  readonly structural: StructuralRow;
  readonly documented: DocumentedClass;
  /**
   * `documented_evidence_gap_bps(t)`: top score minus second, or `null` where
   * fewer than two allocations are known (every non-exchangeable class).
   */
  readonly gap_bps: number | null;
  /** The ranked scores, top first; empty where `gap_bps` is `null`. */
  readonly scores: readonly DocumentedScore[];
  readonly max_materiality_paise: number;
  readonly tau_paise: number;
  /** `k` in V40's bound: the target's `AN1`-anchored members. */
  readonly anchored_count: number;
  /** The signals the gap was summed over, and the ones excluded as undeterminable. */
  readonly signals_in_gap: readonly SeId[];
  readonly signals_undeterminable: readonly SeId[];
}

/** `documented_truly_ambiguous(t)`. */
export const documentedTrulyAmbiguous = (row: DocumentedTargetRow): boolean => row.documented === "TRULY_AMBIGUOUS";
/** `documented_discriminable(t)`. */
export const documentedDiscriminable = (row: DocumentedTargetRow): boolean => row.documented === "DISCRIMINABLE";
/** M-G's population: exactly one admissible allocation on a target that needed enumeration. */
export const documentedSingle = (row: DocumentedTargetRow): boolean => row.documented === "SINGLE";

/** `DATA_MODEL.md §0` rule 5: `round_half_up`, applied once, at the end. */
const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

function scoreAllocation(
  memberObsIds: readonly string[],
  byObsId: ReadonlyMap<string, MemberContribution>,
  modeDays: number,
  rStar: ReadonlySet<string>,
): DocumentedScore {
  const members: MemberContribution[] = [];
  for (const id of memberObsIds) {
    const m = byObsId.get(id);
    if (m !== undefined) members.push(m);
  }
  const se3 = documentedSe3(members, modeDays);
  const se5 = documentedSe5(new Set(memberObsIds), rStar);
  // SE1 is target-constant and cancels; SE2 and SE4 are undeterminable and
  // are excluded, not zeroed. The sum ranges over SE_IN_GAP only.
  const raw = se3 * SE_WEIGHTS_BPS.SE3 + se5 * SE_WEIGHTS_BPS.SE5;
  return Object.freeze({ member_obs_ids: memberObsIds, se3_unit: se3, se5_unit: se5, score_bps: roundHalfUp(raw) });
}

/** Rank top first: score descending, then canonical member key ascending, so the order is total. */
function rank(scores: readonly DocumentedScore[]): readonly DocumentedScore[] {
  return [...scores].sort((a, b) => {
    if (a.score_bps !== b.score_bps) return b.score_bps - a.score_bps;
    const x = a.member_obs_ids.join("\u0000");
    const y = b.member_obs_ids.join("\u0000");
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/**
 * Every target's documented row, in the oracle run's own order.
 *
 * @param observations the agent's input, as the oracle received it.
 * @param run the oracle's run over those observations (`labelAll`).
 * @param reconReport the PG-side recon report rows for the dataset, as values.
 * @param bounds the engine's `S2` bound (`frozen.ts` `SEARCH_BOUND`).
 */
export function documentedRows(
  observations: readonly Observation[],
  run: OracleRun,
  reconReport: readonly ReconReportRowLike[],
  bounds: SearchBounds,
): readonly DocumentedTargetRow[] {
  const members = observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);
  const byObsId = new Map<string, MemberContribution>();
  const obsIdOfEntity = new Map<string, string>();
  for (const m of members) {
    byObsId.set(m.obs_id, m);
    obsIdOfEntity.set(m.entity_id, m.obs_id);
  }
  const modeDays = documentedModeDays(members);
  const structural = structuralLabels(observations, run, bounds);
  const labelOf = new Map(run.labels.map((l) => [l.target_id, l]));
  const resultOf = new Map(run.results.map((r) => [r.target_id, r]));

  return Object.freeze(
    structural.map((s): DocumentedTargetRow => {
      const label = labelOf.get(s.target_id);
      const result = resultOf.get(s.target_id);
      const base = {
        target_id: s.target_id,
        structural: s,
        max_materiality_paise: label?.max_materiality_paise ?? 0,
        tau_paise: label?.tau_paise ?? 0,
        anchored_count: s.anchored_count,
        signals_in_gap: SE_IN_GAP,
        signals_undeterminable: SE_UNDETERMINABLE,
      } as const;
      if (s.label !== "EXCHANGEABLE" || result === undefined || label === undefined) {
        return { ...base, documented: s.label === "EXCHANGEABLE" ? "NONE" : s.label, gap_bps: null, scores: [] };
      }
      const rStar = documentedRStar(s.target_id, reconReport, obsIdOfEntity);
      const scores = rank(result.solutions.map((sol) => scoreAllocation(sol.member_obs_ids, byObsId, modeDays, rStar)));
      const top = scores[0]?.score_bps ?? 0;
      const second = scores[1]?.score_bps ?? 0;
      const gap = top - second;
      const material = label.max_materiality_paise > label.tau_paise;
      const documented: DocumentedClass =
        gap > EPSILON_BPS ? "DISCRIMINABLE" : material ? "TRULY_AMBIGUOUS" : "IMMATERIAL";
      return { ...base, documented, gap_bps: gap, scores };
    }),
  );
}

/** Counts by documented class, every class present. */
export function documentedCounts(rows: readonly DocumentedTargetRow[]): Readonly<Record<DocumentedClass, number>> {
  const out = {} as Record<DocumentedClass, number>;
  for (const c of DOCUMENTED_CLASSES) out[c] = 0;
  for (const row of rows) out[row.documented] += 1;
  return Object.freeze(out);
}
