/**
 * Stage S3 for the oracle — `RECONCILIATION_SPEC.md §5`'s component decomposition.
 *
 * `§5`: *"Build an undirected graph: nodes are unanchored observations and
 * targets; an edge joins two nodes if they co-occur in at least one admissible
 * candidate. Compute connected components (union-find)."* That is this module,
 * literally: the admissible candidates are `enumerate.ts`'s solutions, so the
 * decomposition runs **after** enumeration rather than before it, and every edge
 * is evidence the enumerator actually produced.
 *
 * **Why the oracle needs it at all.** `τ = max(₹100, 10 bps of component value)`
 * reads `Component.total_value_paise`, which `DATA_MODEL.md §11` defines at spec
 * 1.4.6 as `Σ value(observation)` over `Component.member_obs_ids`. Until that
 * amendment the base was undetermined and this package declared one
 * (`conventions.ts` `O-TAU-BASE`, then unratified); the definition now exists and
 * is implemented here rather than approximated by the target's own amount.
 *
 * **The node set is stated by `§11`, not chosen here.** Two scopes meet:
 *
 *   - `§5` makes the observation nodes the **unanchored** ones. `§3` removes
 *     everything anchored from the search space and `§11` states that the
 *     component *is* that search space.
 *   - `§11`'s definition of `total_value_paise` reads `§14.1`'s
 *     `value(observation)`, *"which is total over the member-eligible kinds
 *     §11.1 admits (`recon_line`, `adjustment`), so the sum is defined for every
 *     observation this field can range over."* A reference kind has no value
 *     under `§14.1` at all, so admitting one as a node would make the sum
 *     undefined and contradict the sentence that justifies it.
 *
 * `§11` draws the conclusion in terms: *"`Component.member_obs_ids` satisfies
 * both: unanchored, and of a member-eligible kind."* This module implements that
 * conjunction and does not re-decide either half.
 *
 * **Which test decides "unanchored" is `conventions.ts` `O-ANCHOR-TEST`**, and
 * the node set is taken from `enumerate.ts`'s {@link unanchoredMembers} so that
 * the graph and the search that produced its edges cannot disagree about it.
 *
 * **`Candidate.member_obs_ids` is a different set and is not conflated with it.**
 * A candidate carries its anchored members — `§4.1`'s `C6` reads
 * `Σ credit − Σ debit = target.amount` over the whole allocation, not over a
 * residual — so `OracleSolution.member_obs_ids` legitimately contains obs ids
 * that are **not** nodes of any component. {@link decompose} skips exactly those
 * when it draws edges, and they never enter `total_value_paise`.
 *
 * **No `comp_id` is minted.** `§11` types the field `ComponentId` and no
 * document states a format, so this module does not invent one. Each component
 * carries a {@link OracleComponent.key} derived from its own node set — the
 * lexicographically smallest node key it contains — which is a function of the
 * partition and therefore identical however the observations were ordered. It is
 * an internal handle, not a persisted identifier.
 */

import type { OracleTargetResult } from "./enumerate.js";
import { unanchoredMembers } from "./enumerate.js";
import type { MemberContribution } from "./universe.js";

/** Node-key namespaces, so a target id and an obs id cannot collide. */
const TARGET_NODE = "T:";
const OBS_NODE = "O:";

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `DATA_MODEL.md §14.1`'s `value(observation)`, for the two member-eligible kinds.
 *
 * | kind | value |
 * |---|---|
 * | `recon_line` (`payment`) | `payload.amount` |
 * | `recon_line` (`refund`) | `payload.amount` |
 * | `adjustment` | `M` — the non-zero one of `debit`/`credit`, **not `amount`** |
 *
 * `§14.1` is explicit that an adjustment is **not** valued at `amount`: *"`I3`
 * declares no `amount` identity for adjustment rows and §17.2 leaves the field
 * deliberately unconstrained on them; `M` is what `P8` posts and what `I4`/`C6`
 * move a settlement by."*
 *
 * *"The non-zero one"* presupposes that exactly one is non-zero, which `C5`
 * enforces on every member of an admissible candidate. A row that satisfies
 * neither branch — both zero — values at zero, and one that satisfies both is
 * not admissible and so contributes to no target's `τ`. This function therefore
 * reports rather than throws: an unenumerable row is a data condition for
 * `predicates.ts` to reject, not a reason for the oracle to abort a run.
 */
export function observationValue(member: MemberContribution): number {
  if (member.row_type === "adjustment") {
    return member.debit !== 0 ? member.debit : member.credit;
  }
  return member.amount;
}

/**
 * One connected component of `§5`'s graph.
 *
 * Named `OracleComponent` rather than `Component` deliberately: it carries the
 * two fields `DATA_MODEL.md §11` defines at spec 1.4.6 and the oracle reads, not
 * the whole `§11` record. In particular it mints no `comp_id` — see this
 * module's header.
 */
export interface OracleComponent {
  /** The lexicographically smallest node key in the component. Not a `ComponentId`. */
  readonly key: string;
  /** `§5`'s **target** nodes for this component, ascending. */
  readonly target_ids: readonly string[];
  /**
   * `§5`'s **observation** nodes for this component, ascending — unanchored and
   * of a member-eligible kind, per `DATA_MODEL.md §11`. **Not** the union of its
   * candidates' `member_obs_ids`, which also carries anchored members.
   */
  readonly member_obs_ids: readonly string[];
  /** `§11`: *"`|members|`; compared against `K_max`"*. */
  readonly size: number;
  /** `§11` at spec 1.4.6: `Σ value(observation)` over {@link member_obs_ids}. */
  readonly total_value_paise: number;
  /**
   * `§11`'s three-valued status, as the **oracle's** budgets determine it.
   *
   * `INTRACTABLE` when a target in the component exhausted `K_oracle` or
   * `C_oracle` — `§5` names the budget tail as *"the reported `INTRACTABLE`
   * rate"*. `EMPTY` when the component holds no target, or no target in it has
   * an admissible allocation. `SOLVED` otherwise. These are the oracle's own
   * budgets, not the engine's `K_max`/`C_max`; the field records what this
   * implementation achieved.
   */
  readonly solve_status: "SOLVED" | "INTRACTABLE" | "EMPTY";
}

/** The decomposition, plus the lookup `classify` needs to find a target's base. */
export interface Decomposition {
  /** Every component, ordered by {@link OracleComponent.key}. */
  readonly components: readonly OracleComponent[];
  /** Each enumerated target's component. Total over the targets in `results`. */
  readonly byTargetId: ReadonlyMap<string, OracleComponent>;
}

/**
 * Union-find with path compression, rooted at the smallest key.
 *
 * Union-by-rank or by-size would pick a root that depends on the order the
 * unions arrived in. Rooting at the lexicographically smaller key makes the root
 * a property of the component's node set alone, so the decomposition is a pure
 * function of the input — the oracle's analogue of `I9`, which
 * `tests/property/oracle.prop.test.ts` checks by rotation. The cost is the
 * asymptotic guarantee, which `§5.2`'s *"naive … minutes per component"* budget
 * does not ask for.
 */
class SmallestRootUnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    let root = key;
    for (;;) {
      const next = this.parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    // Path compression: re-point every node on the walk straight at the root.
    let cursor = key;
    for (;;) {
      const next = this.parent.get(cursor);
      if (next === undefined || next === cursor) break;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (byCodeUnit(ra, rb) <= 0) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }

  keys(): readonly string[] {
    return [...this.parent.keys()];
  }
}

/**
 * Decompose an enumerated run into `§5`'s connected components.
 *
 * `results` supplies the target nodes and every edge; `members` supplies the
 * observation nodes, filtered to the unanchored ones by
 * {@link unanchoredMembers} — the same predicate the enumerator ranged over, so
 * the graph cannot describe a search space different from the one searched.
 *
 * An unanchored observation that appears in no admissible candidate is still a
 * node, and forms a component of its own. `§5` says *"nodes are unanchored
 * observations and targets"* without qualification, and such a component holds
 * no target, so it supplies no `τ` to anything.
 */
export function decompose(
  results: readonly OracleTargetResult[],
  members: readonly MemberContribution[],
): Decomposition {
  const nodes = unanchoredMembers(members);
  const valueByObsId = new Map<string, number>();
  for (const m of nodes) valueByObsId.set(m.obs_id, observationValue(m));

  const uf = new SmallestRootUnionFind();
  for (const result of results) uf.add(TARGET_NODE + result.target_id);
  for (const m of nodes) uf.add(OBS_NODE + m.obs_id);

  for (const result of results) {
    for (const solution of result.solutions) {
      for (const obsId of solution.member_obs_ids) {
        // An anchored member is part of the ALLOCATION and not a node of the
        // GRAPH. Skipping it here is what keeps Candidate.member_obs_ids and
        // Component.member_obs_ids distinct; see this module's header.
        if (!valueByObsId.has(obsId)) continue;
        uf.union(TARGET_NODE + result.target_id, OBS_NODE + obsId);
      }
    }
  }

  const resultsByTargetId = new Map<string, OracleTargetResult>();
  for (const result of results) resultsByTargetId.set(result.target_id, result);

  const grouped = new Map<string, string[]>();
  for (const key of uf.keys()) {
    const root = uf.find(key);
    const bucket = grouped.get(root);
    if (bucket === undefined) grouped.set(root, [key]);
    else bucket.push(key);
  }

  const components: OracleComponent[] = [];
  const byTargetId = new Map<string, OracleComponent>();

  for (const [root, memberKeys] of grouped) {
    const targetIds: string[] = [];
    const memberObsIds: string[] = [];
    for (const key of memberKeys) {
      if (key.startsWith(TARGET_NODE)) targetIds.push(key.slice(TARGET_NODE.length));
      else memberObsIds.push(key.slice(OBS_NODE.length));
    }
    targetIds.sort(byCodeUnit);
    memberObsIds.sort(byCodeUnit);

    let total = 0;
    for (const obsId of memberObsIds) total += valueByObsId.get(obsId) ?? 0;

    const targetResults = targetIds
      .map((id) => resultsByTargetId.get(id))
      .filter((r): r is OracleTargetResult => r !== undefined);
    const intractable = targetResults.some(
      (r) => r.status === "K_ORACLE_EXCEEDED" || r.status === "C_ORACLE_EXCEEDED",
    );
    const solved = targetResults.some((r) => r.solutions.length > 0);

    const component: OracleComponent = Object.freeze({
      key: root,
      target_ids: Object.freeze(targetIds),
      member_obs_ids: Object.freeze(memberObsIds),
      size: memberObsIds.length,
      total_value_paise: total,
      solve_status: intractable ? "INTRACTABLE" : solved ? "SOLVED" : "EMPTY",
    });

    components.push(component);
    for (const id of targetIds) byTargetId.set(id, component);
  }

  components.sort((a, b) => byCodeUnit(a.key, b.key));
  return Object.freeze({ components: Object.freeze(components), byTargetId });
}
