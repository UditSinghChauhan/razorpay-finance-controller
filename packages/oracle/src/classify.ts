/**
 * Stage S4's ambiguity test, for the oracle — materiality and the `§5.4` label.
 *
 * `PREREGISTRATION.md §5.4`: "A case is **truly ambiguous** iff the oracle finds
 * ≥ 2 admissible allocations whose control-account balances differ by more than
 * `τ`. Note both halves: *admissible* under the frozen constraints, and
 * *materially different* in the books."
 *
 * `RECONCILIATION_SPEC.md §6` supplies the measure: "**materiality** = `max over
 * AccountCode of |balance_best(acct) − balance_second(acct)|`, computed by
 * running both allocations through the ledger projection in memory."
 *
 * **The projection is implemented natively, not through `@assay/ledger`.**
 * `conventions.ts` `O-MATERIALITY-PROJECTION` records why: routing it through
 * the agent's journal module would make the oracle's own product depend on the
 * agent's posting implementation, which is what `ARCHITECTURE.md §7.2`'s
 * independence argument exists to prevent. The postings below are transcribed
 * from `DATA_MODEL.md §17.1`'s table, which is the shared declaration.
 *
 * **Why only `P2` and `P4` appear.** `§17.1.1` triggers `P1` and `P3` at ingest
 * on every valid recon line, so both allocations carry them identically and they
 * cancel in the difference. The allocation-dependent postings are `P2` for a
 * payment member and `P4` for a refund member. An adjustment member posts `P8`
 * under its own key regardless of allocation (`§17.2` sends every adjustment to
 * `EXCEPTION`), so it too cancels — but note that it still enters `C6`'s sum,
 * which is why an adjustment can move `1200_BANK` between two allocations.
 */

import { ACCOUNT_CODES, type AccountCode, type Observation } from "@assay/domain";
import { roundHalfUp, type Paise } from "@assay/money";

import { decompose, type Decomposition } from "./components.js";
import { BPS_DENOMINATOR, TAU_FLOOR_PAISE, TAU_RATE_BPS } from "./frozen.js";
import { enumerateAll, type OracleSolution, type OracleTargetResult } from "./enumerate.js";
import type { CandidateContext } from "./predicates.js";
import {
  memberContribution,
  type MemberContribution,
  type TargetContribution,
} from "./universe.js";

/** A balance for each of the seven control accounts (`DATA_MODEL.md §17`). */
export type AccountBalances = Readonly<Record<AccountCode, number>>;

function zeroBalances(): Record<AccountCode, number> {
  const out = {} as Record<AccountCode, number>;
  for (const code of ACCOUNT_CODES) out[code] = 0;
  return out;
}

/**
 * Project one allocation's own postings into control-account balances.
 *
 * `DATA_MODEL.md §17.1`, under `§17.1`'s sign convention
 * `balance(acct) = Σ dr − Σ cr`:
 *
 * - `P2`, payment member: DR `1200_BANK` `credit`; DR `5100_PG_FEE_EXPENSE`
 *   `fee − tax`; DR `1300_GST_INPUT_CREDIT` `tax`; CR
 *   `1100_GATEWAY_RECEIVABLE` `amount`.
 * - `P4`, refund member: DR `2200_REFUND_LIABILITY` `amount`; CR `1200_BANK`
 *   `amount`.
 */
export function projectAllocation(members: readonly MemberContribution[]): AccountBalances {
  const b = zeroBalances();
  for (const m of members) {
    if (m.row_type === "payment") {
      b["1200_BANK"] += m.credit;
      b["5100_PG_FEE_EXPENSE"] += m.fee - m.tax;
      b["1300_GST_INPUT_CREDIT"] += m.tax;
      b["1100_GATEWAY_RECEIVABLE"] -= m.amount;
    } else if (m.row_type === "refund") {
      b["2200_REFUND_LIABILITY"] += m.amount;
      b["1200_BANK"] -= m.amount;
    }
    // An adjustment member posts P8 under its own key regardless of the
    // allocation (§17.2), so it contributes nothing to a difference.
  }
  return Object.freeze(b);
}

/** `§6`'s materiality: the largest per-account difference between two projections. */
export function materiality(a: AccountBalances, b: AccountBalances): number {
  let max = 0;
  for (const code of ACCOUNT_CODES) {
    const d = Math.abs(a[code] - b[code]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * `τ` for one component.
 *
 * `PREREGISTRATION.md §7`: `max(₹100.00, 10 bps of component value)`. **The base
 * is `Component.total_value_paise`**, which `DATA_MODEL.md §11` defines at spec
 * 1.4.6 as `Σ value(observation)` over `Component.member_obs_ids` — the
 * unanchored observation nodes of `RECONCILIATION_SPEC.md §5`'s component.
 * `components.ts` computes it and {@link labelAll} supplies it.
 *
 * **This is a swap, and the record says what it moved.** Through spec 1.4.5 the
 * base was undetermined and this package declared the target's own amount
 * (`conventions.ts` `O-TAU-BASE`, then unratified). The two bases are not
 * interchangeable: a component base runs roughly `2×` a target base on a
 * two-solution component, so a materiality between the two `τ` values changes
 * label. `tests/property/oracle.prop.test.ts` pins that divergence and now
 * identifies which side of it the ratified definition lands on.
 *
 * The parameter is named for what it is. Passing a target's amount here still
 * type-checks — it is a number — so a caller that wants the pre-1.4.6 behaviour
 * can still get it, which is what lets the divergence test measure both.
 */
export function tauFor(componentValue: number): number {
  return Math.max(TAU_FLOOR_PAISE, roundHalfUp(componentValue * TAU_RATE_BPS, BPS_DENOMINATOR));
}

/** `§5.4`'s label for one target. */
export type AmbiguityLabel =
  | "UNAMBIGUOUS"
  | "IMMATERIALLY_AMBIGUOUS"
  | "TRULY_AMBIGUOUS"
  | "NO_SOLUTION"
  | "INTRACTABLE";

/** The oracle's product for one target — one row of `oracle_labels.jsonl`. */
export interface OracleLabel {
  readonly target_id: string;
  readonly target_kind: TargetContribution["kind"];
  readonly label: AmbiguityLabel;
  readonly solution_count: number;
  /** The largest materiality between any two admissible allocations, in paise. */
  readonly max_materiality_paise: number;
  readonly tau_paise: number;
}

/**
 * Classify one target's enumeration result.
 *
 * `§5.4`'s definition, with both halves: **≥ 2 admissible allocations** and
 * **balances differing by more than `τ`**. Neither the mere existence of an
 * arithmetic alternative nor a difference at or below `τ` qualifies.
 *
 * A budget status yields `INTRACTABLE`, which is a statement about the oracle
 * rather than about the data, and is deliberately not folded into
 * `NO_SOLUTION`.
 */
export function classify(
  result: OracleTargetResult,
  membersByObsId: ReadonlyMap<string, MemberContribution>,
  componentValue: number,
): OracleLabel {
  const tau = tauFor(componentValue);
  const base = {
    target_id: result.target_id,
    target_kind: result.target_kind,
    tau_paise: tau,
  } as const;

  if (result.status === "K_ORACLE_EXCEEDED" || result.status === "C_ORACLE_EXCEEDED") {
    return { ...base, label: "INTRACTABLE", solution_count: 0, max_materiality_paise: 0 };
  }
  if (result.solutions.length === 0) {
    return { ...base, label: "NO_SOLUTION", solution_count: 0, max_materiality_paise: 0 };
  }
  if (result.solutions.length === 1) {
    return { ...base, label: "UNAMBIGUOUS", solution_count: 1, max_materiality_paise: 0 };
  }

  const projections = result.solutions.map((s) => projectAllocation(membersOf(s, membersByObsId)));
  let max = 0;
  for (let i = 0; i < projections.length; i += 1) {
    for (let j = i + 1; j < projections.length; j += 1) {
      const a = projections[i];
      const b = projections[j];
      if (a === undefined || b === undefined) continue;
      const d = materiality(a, b);
      if (d > max) max = d;
    }
  }
  return {
    ...base,
    label: max > tau ? "TRULY_AMBIGUOUS" : "IMMATERIALLY_AMBIGUOUS",
    solution_count: result.solutions.length,
    max_materiality_paise: max,
  };
}

function membersOf(
  solution: OracleSolution,
  byObsId: ReadonlyMap<string, MemberContribution>,
): readonly MemberContribution[] {
  const out: MemberContribution[] = [];
  for (const id of solution.member_obs_ids) {
    const m = byObsId.get(id);
    if (m !== undefined) out.push(m);
  }
  return out;
}

/** Convenience alias so a caller need not know `Paise` is a branded number. */
export type MaterialityPaise = Paise | number;

/** {@link labelAll}'s product: the labels, and the decomposition they were taken over. */
export interface OracleRun {
  readonly results: readonly OracleTargetResult[];
  readonly decomposition: Decomposition;
  readonly labels: readonly OracleLabel[];
}

/**
 * The oracle end to end: enumerate, decompose, classify.
 *
 * **This is the function that makes `τ`'s base the component's.** `classify`
 * takes the base as a parameter and cannot know it; the base is a property of
 * `RECONCILIATION_SPEC.md §5`'s graph, which is not knowable until every target
 * has been enumerated, because an edge is *"two nodes co-occurring in at least
 * one admissible candidate"*. Hence three passes in this order, and hence a
 * caller that wants labels should call this rather than assembling the pieces
 * and choosing a base of its own.
 *
 * `observations` is the same input every agent receives, and nothing else is
 * read — `PREREGISTRATION.md §6.2` `AL2`, satisfied by there being no read.
 */
export function labelAll(
  observations: readonly Observation[],
  context: CandidateContext,
): OracleRun {
  const results = enumerateAll(observations, context);
  const members = observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);
  const decomposition = decompose(results, members);

  const byObsId = new Map<string, MemberContribution>();
  for (const m of members) byObsId.set(m.obs_id, m);

  const labels = results.map((result) => {
    const component = decomposition.byTargetId.get(result.target_id);
    if (component === undefined) {
      // Not a data condition: decompose() adds a node for every enumerated
      // target, so a miss means the two disagree about what a target is.
      // Substituting a default would silently drop tau to the Rs 100 floor for
      // this target, which is exactly the kind of quiet semantic move
      // DECISION_BRIEF.md §L.4 exists to forbid.
      throw new Error(
        `oracle: target ${result.target_id} has no component; decompose() must place every enumerated target`,
      );
    }
    return classify(result, byObsId, component.total_value_paise);
  });

  return Object.freeze({ results, decomposition, labels: Object.freeze(labels) });
}
