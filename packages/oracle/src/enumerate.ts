/**
 * Stage S2/S3 for the oracle — the member pool, and exhaustive enumeration over it.
 *
 * `PREREGISTRATION.md §5.2`: "naive per-candidate boolean checks over a **fully
 * enumerated space**: no ordering, no pruning, no early exit". Two consequences
 * shape this module.
 *
 * **The space must be bounded, and the specification bounds it.** "Fully
 * enumerated" under `C_oracle = 2,000,000` is satisfiable only over a small
 * pool, and nothing in `C1`–`C8` bounds one — every per-member clause is silent
 * about the target. `RECONCILIATION_SPEC.md §4.1`'s **co-settlement coherence**,
 * entailed at spec 1.4.3 by `DATA_MODEL.md §6`'s definition of `settled_at`,
 * supplies the bound: every member of a candidate for a settlement target
 * carries the same `settled_at`, so the pool partitions into equivalence classes
 * and each is enumerated whole. It is a **pool rule, not a ninth constraint**,
 * and it is applied here rather than in `predicates.ts` for exactly that reason.
 *
 * **A candidate carries the anchored members too.** `§4.1`'s `C6` reads
 * `Σ credit(members) − Σ debit(members) = target.amount` over the allocation,
 * not over a residual. `§3` removes anchored records from the *search* space, so
 * enumeration ranges over the unanchored class only — but the anchored members
 * are part of the allocation and are included in every candidate built for that
 * target. No residual amount is invented.
 */

import type { Observation } from "@assay/domain";

import { anchorBankLines, anchoredNetBySettlement, type BankAnchor } from "./anchors.js";
import { C_ORACLE, K_ORACLE } from "./frozen.js";
import {
  checkAll,
  isAdmissible,
  type Candidate,
  type CandidateContext,
  type ConstraintVerdicts,
} from "./predicates.js";
import {
  memberContribution,
  targetContribution,
  type MemberContribution,
  type TargetContribution,
} from "./universe.js";

/** Why enumeration for a target ended as it did. */
export type EnumerationStatus =
  | "ENUMERATED"
  | "ANCHORED"
  | "NO_ELIGIBLE_MEMBER_KIND"
  | "K_ORACLE_EXCEEDED"
  | "C_ORACLE_EXCEEDED";

/** One admissible allocation the oracle found. */
export interface OracleSolution {
  readonly target_id: string;
  /** Member `obs_id`s, in canonical ascending order so the set is comparable. */
  readonly member_obs_ids: readonly string[];
  readonly satisfied: ConstraintVerdicts;
}

/** Everything the oracle determined about one target. */
export interface OracleTargetResult {
  readonly target_id: string;
  readonly target_kind: TargetContribution["kind"];
  readonly status: EnumerationStatus;
  /**
   * The admissible allocations. **Empty whenever `status` is a budget status** —
   * never a truncated set presented as exhaustive. `RECONCILIATION_SPEC.md §4.3`
   * is the reason: "a heuristic that returns 'the best I found in the time
   * available' is indistinguishable, from the outside, from a proof."
   */
  readonly solutions: readonly OracleSolution[];
  readonly pool_size: number;
  readonly candidates_enumerated: number;
  /** How many enumerated candidates each constraint rejected (`§4.1`'s reporting duty). */
  readonly excluded_by: Readonly<Record<string, number>>;
  /** How many enumerated candidates each constraint could not evaluate (`§5.3`). */
  readonly non_binding: Readonly<Record<string, number>>;
}

const CONSTRAINTS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"] as const;

function zeroCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of CONSTRAINTS) out[id] = 0;
  return out;
}

/**
 * The members `§3` leaves in the search space.
 *
 * `RECONCILIATION_SPEC.md §3`: *"Everything anchored is removed from the search
 * space."* `AN1` anchors a recon line to the settlement its own
 * `settlement_id` names, so an unanchored member is one carrying none.
 *
 * **The test is `settlement_id !== null`, and it is exact rather than
 * approximate.** `conventions.ts` `O-ANCHOR-TEST` is the ratification and
 * carries the derivation: `PREREGISTRATION.md §4.3`'s operator table and
 * `§4.2`'s `F05` and `F09` rules together admit no way for a conforming dataset
 * to carry a non-null `settlement_id` naming an absent settlement, so this test
 * and `anchors.ts`'s {@link anchoredEntities} referent check have the **same
 * extension**. The referent check is not repeated here because it cannot change
 * the answer, not because it was judged unnecessary.
 *
 * **Exported because `components.ts` must range over exactly this set.** `§5`'s
 * graph nodes are the *unanchored* observations and `DATA_MODEL.md §11` makes
 * `Component.member_obs_ids` exactly those nodes. Two separate filters spelling
 * the same rule could drift, and a component describing a search space different
 * from the one the enumerator searched would put a `τ` base under a target that
 * no enumeration supports.
 */
export function unanchoredMembers(
  members: readonly MemberContribution[],
): readonly MemberContribution[] {
  return members.filter((m) => m.settlement_id === null);
}

/**
 * Partition members into `settled_at` equivalence classes.
 *
 * `§4.1`'s co-settlement coherence. A member with a `null` `settled_at` belongs
 * to no class: the spec-1.4.2 ratification excludes it from every candidate
 * anyway, so admitting it to a class would only spend budget enumerating
 * candidates that `C3` and `C4` must reject.
 */
export function settledAtClasses(
  members: readonly MemberContribution[],
): ReadonlyMap<number, readonly MemberContribution[]> {
  const classes = new Map<number, MemberContribution[]>();
  for (const m of members) {
    if (m.settled_at === null) continue;
    const bucket = classes.get(m.settled_at);
    if (bucket === undefined) classes.set(m.settled_at, [m]);
    else bucket.push(m);
  }
  return classes;
}

/**
 * Enumerate every admissible allocation for one settlement target.
 *
 * The enumeration is exhaustive over each candidate class: all `2^n` subsets,
 * every one checked against all eight constraints with no early exit. Budgets
 * are checked **before** a class is enumerated, so exceeding one costs nothing
 * and is reported rather than partially spent.
 */
function enumerateSettlementTarget(
  target: TargetContribution,
  anchoredMembers: readonly MemberContribution[],
  unanchored: readonly MemberContribution[],
  context: CandidateContext,
): OracleTargetResult {
  const excluded = zeroCounts();
  const nonBinding = zeroCounts();
  const solutions: OracleSolution[] = [];
  let enumerated = 0;

  // Co-settlement coherence fixes the class when the target already has
  // anchored members: they carry the settlement's own instant, and a candidate
  // cannot mix instants. With none, every class is a candidate class.
  const anchoredInstants = new Set(
    anchoredMembers.map((m) => m.settled_at).filter((t): t is number => t !== null),
  );
  const classes = settledAtClasses(unanchored);
  const candidateClasses =
    anchoredInstants.size === 1
      ? [...classes.entries()].filter(([instant]) => anchoredInstants.has(instant))
      : [...classes.entries()];

  const poolSize = candidateClasses.reduce((t, [, members]) => t + members.length, 0);

  for (const [, members] of candidateClasses) {
    if (members.length > K_ORACLE) {
      return {
        target_id: target.id,
        target_kind: target.kind,
        status: "K_ORACLE_EXCEEDED",
        solutions: [],
        pool_size: poolSize,
        candidates_enumerated: enumerated,
        excluded_by: Object.freeze(excluded),
        non_binding: Object.freeze(nonBinding),
      };
    }
    const subsets = 2 ** members.length;
    if (enumerated + subsets > C_ORACLE) {
      return {
        target_id: target.id,
        target_kind: target.kind,
        status: "C_ORACLE_EXCEEDED",
        solutions: [],
        pool_size: poolSize,
        candidates_enumerated: enumerated,
        excluded_by: Object.freeze(excluded),
        non_binding: Object.freeze(nonBinding),
      };
    }

    for (let mask = 0; mask < subsets; mask += 1) {
      const chosen: MemberContribution[] = [];
      for (let i = 0; i < members.length; i += 1) {
        if (mask & (1 << i)) {
          const m = members[i];
          if (m !== undefined) chosen.push(m);
        }
      }
      const candidate: Candidate = { target, members: [...anchoredMembers, ...chosen] };
      const verdicts = checkAll(candidate, context);
      enumerated += 1;
      for (const id of CONSTRAINTS) {
        if (verdicts[id] === "NOT_SATISFIED") excluded[id] = (excluded[id] ?? 0) + 1;
        else if (verdicts[id] === "NON_BINDING") nonBinding[id] = (nonBinding[id] ?? 0) + 1;
      }
      if (isAdmissible(verdicts)) {
        solutions.push({
          target_id: target.id,
          member_obs_ids: Object.freeze(
            candidate.members.map((m) => m.obs_id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
          ),
          satisfied: verdicts,
        });
      }
    }
  }

  return {
    target_id: target.id,
    target_kind: target.kind,
    status: "ENUMERATED",
    solutions: Object.freeze(solutions),
    pool_size: poolSize,
    candidates_enumerated: enumerated,
    excluded_by: Object.freeze(excluded),
    non_binding: Object.freeze(nonBinding),
  };
}

/**
 * Enumerate every target in an observation set.
 *
 * **Observations only.** This function takes the agent's own input and reads
 * nothing else. `packages/oracle` performs no I/O at all, which is what makes
 * `PREREGISTRATION.md §6.2` `AL2`'s path guard vacuous here by construction
 * rather than by vigilance: there is no read for it to guard.
 */
export function enumerateAll(
  observations: readonly Observation[],
  context: CandidateContext,
): readonly OracleTargetResult[] {
  const bankAnchors = new Map<string, BankAnchor>();
  for (const a of anchorBankLines(observations).anchors) bankAnchors.set(a.settlement_id, a);

  const eligible = observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);

  const anchoredNet = anchoredNetBySettlement(observations);
  const results: OracleTargetResult[] = [];

  for (const observation of observations) {
    if (observation.kind === "bank_line") {
      const target = targetContribution(observation, null);
      if (target === null) continue;
      // conventions.ts O-BANK-TARGET-EMPTY: no member kind can serve a bank-line
      // target, so §4's "a bank line needing settlements" yields the empty set.
      results.push({
        target_id: target.id,
        target_kind: "bank_line",
        status: "NO_ELIGIBLE_MEMBER_KIND",
        solutions: [],
        pool_size: 0,
        candidates_enumerated: 0,
        excluded_by: Object.freeze(zeroCounts()),
        non_binding: Object.freeze(zeroCounts()),
      });
      continue;
    }
    if (observation.kind !== "settlement") continue;

    const anchor = bankAnchors.get(observation.payload.id) ?? null;
    const target = targetContribution(
      observation,
      anchor === null
        ? null
        : { value_date: anchor.value_date, bank_line_id: anchor.bank_line_id },
    );
    if (target === null) continue;

    const anchoredMembers = eligible.filter((m) => m.settlement_id === target.id);
    const unanchored = unanchoredMembers(eligible);

    // §4: candidates are generated for a settlement "needing constituents".
    // One already tied out by its anchored members needs none, and §3 has
    // removed those from the search space.
    if ((anchoredNet.get(target.id) ?? 0) === target.amount) {
      results.push({
        target_id: target.id,
        target_kind: "settlement",
        status: "ANCHORED",
        solutions: [
          {
            target_id: target.id,
            member_obs_ids: Object.freeze(
              anchoredMembers
                .map((m) => m.obs_id)
                .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            ),
            satisfied: checkAll({ target, members: anchoredMembers }, context),
          },
        ],
        pool_size: 0,
        candidates_enumerated: 0,
        excluded_by: Object.freeze(zeroCounts()),
        non_binding: Object.freeze(zeroCounts()),
      });
      continue;
    }

    results.push(enumerateSettlementTarget(target, anchoredMembers, unanchored, context));
  }
  return Object.freeze(results);
}
