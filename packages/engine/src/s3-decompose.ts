import type { ObservationId } from "@assay/domain";

import { SEARCH_BOUND } from "./frozen.js";
import type { Candidate, Member, Target } from "./s2-candidates.js";

/**
 * Stage `S3` — component decomposition (`RECONCILIATION_SPEC.md §5`).
 *
 * *"Build an undirected graph: nodes are unanchored observations and targets; an
 * edge joins two nodes if they co-occur in at least one admissible candidate.
 * Compute connected components (union-find)."*
 *
 * Three scoping facts do the work here, all ratified at spec 1.4.6
 * (`DATA_MODEL.md §11`, register row M20):
 *
 * - `Component.member_obs_ids` is *"the component's **unanchored** observation
 *   nodes"* — `target_ids` is its target nodes, and anchored observations are
 *   **not** members of a component, because `§3` removes everything anchored
 *   from the search space *"and the component is that search space"*.
 * - `Candidate.member_obs_ids` is a **different set**: *"the whole allocation,
 *   ANCHORED members INCLUDED"*. `§11` calls the distinction load-bearing. So
 *   an edge is drawn only between nodes that exist, and an anchored member of a
 *   candidate is not a node.
 * - `total_value_paise = Σ value(observation)` over `Component.member_obs_ids`,
 *   with `§14.1`'s table — *"target observations are excluded, and so are
 *   anchored observations"*.
 */

/** A node of the `§5` graph: an unanchored observation, or a target. */
export type NodeKind = "member" | "target";

export interface DecomposedComponent {
  /** The component's **target** nodes, sorted. `DATA_MODEL.md §11` types these `string[]`. */
  readonly target_ids: readonly string[];
  /** The component's **unanchored observation** nodes, sorted. Never an anchored id. */
  readonly member_obs_ids: readonly ObservationId[];
  /** `DATA_MODEL.md §11`: *"`|members|`; compared against `K_max`"*. */
  readonly size: number;
  /** `Σ value(observation)` over `member_obs_ids` only (`§14.1`). */
  readonly total_value_paise: number;
  /**
   * `size > K_max`. `RECONCILIATION_SPEC.md §4.3`: exceeding the bound *"yields
   * `solve_status: INTRACTABLE`"*.
   *
   * **`solve_status` itself is deliberately not set here.** `§11`'s enum is
   * `"SOLVED" | "INTRACTABLE" | "EMPTY"`; `§4.3` gives `INTRACTABLE` a trigger,
   * `SOLVED` belongs to the stage that solves — which is `S4`, not this one —
   * and **`EMPTY` appears exactly once in the whole corpus, in that enum
   * declaration, with no trigger stated anywhere**. Emitting a status here
   * would mean inventing one. This flag carries the part `§4.3` determines and
   * leaves the field to `S4`. See this package's README.
   */
  readonly exceeds_k_max: boolean;
}

export interface Decomposition {
  readonly components: readonly DecomposedComponent[];
}

/**
 * `DATA_MODEL.md §14.1` — *"the rupee figure an unresolved item carries"*, for
 * the two member-eligible kinds.
 *
 * ```
 *   recon_line (payment)   payload.amount
 *   recon_line (refund)    payload.amount
 *   adjustment             M -- the NON-ZERO one of debit/credit, NOT amount
 * ```
 *
 * `§14.1` is emphatic about the adjustment row: *"`I3` declares no `amount`
 * identity for adjustment rows ... Using `amount` here would put a number in
 * `unresolved_value_paise` that the ledger never posted and break `G3` on every
 * adjustment."*
 *
 * Where an adjustment carries a zero in both fields the rule yields `0`; where
 * it carries a non-zero in **both**, `§14.1` names no winner and `debit` is
 * taken. A conforming row has exactly one non-zero — `§17.2`'s `P8` posts one
 * side — so neither case arises on conforming data.
 */
export function observationValue(m: Member): number {
  if (m.kind === "adjustment") {
    return m.payload.debit !== 0 ? m.payload.debit : m.payload.credit;
  }
  return m.payload.amount;
}

/**
 * Union-find whose root is always the **lexicographically smallest** id in its
 * set.
 *
 * Rooting at the smallest member rather than at whichever node happened to be
 * seen first is what makes the partition independent of edge order:
 * `DATA_MODEL.md §16` forbids an ASSAY-internal identifier from depending on
 * *"iteration order over an unordered collection"*, and a component's identity
 * is exactly such an identifier.
 */
class SmallestRootUnionFind {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    for (;;) {
      const next = this.parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    // Path compression, applied after the root is known so the walk above is
    // never observing a half-compressed chain.
    let walk = id;
    for (;;) {
      const next = this.parent.get(walk);
      if (next === undefined || next === walk) break;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // The smaller id wins, unconditionally — no rank, no size heuristic. Both
    // would make the root depend on insertion order.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }

  roots(): ReadonlyMap<string, string> {
    const out = new Map<string, string>();
    for (const id of [...this.parent.keys()].sort()) out.set(id, this.find(id));
    return out;
  }
}

export interface DecomposeInput {
  /** Every target, whether or not any candidate was found for it. */
  readonly targets: readonly Target[];
  /** The unanchored member-eligible pool from `S1` — the `§5` observation nodes. */
  readonly pool: readonly Member[];
  /** Admissible candidates, each tagged with the target it explains. */
  readonly candidates: readonly {
    readonly target_id: string;
    readonly candidate: Candidate;
  }[];
}

/**
 * Decompose the `§5` graph into connected components.
 *
 * **Every unanchored observation and every target is a node**, whether or not a
 * candidate ever mentions it — `§5` says the nodes *are* those things, not the
 * ones that happen to have an edge. A degree-zero node therefore forms its own
 * singleton component, which is what makes `§9`'s *"no admissible candidate
 * exists at all"* a reportable state rather than a silent disappearance.
 *
 * Deterministic and order-independent: node ids are sorted before insertion,
 * the union-find roots at the smallest id, and every output array is sorted.
 */
export function decompose(input: DecomposeInput): Decomposition {
  const uf = new SmallestRootUnionFind();

  const poolIds = new Set<string>(input.pool.map((m) => m.obs_id));
  const targetIds = new Set<string>(input.targets.map((t) => t.obs_id));
  const valueOf = new Map<string, number>(
    input.pool.map((m) => [m.obs_id as string, observationValue(m)]),
  );

  // Nodes first, in sorted order, so the structure never depends on the order
  // the caller happened to build its arrays in.
  for (const id of [...poolIds, ...targetIds].sort()) uf.add(id);

  // Edges: a candidate's target and its members co-occur, so they form a clique.
  // Anchored members appear in Candidate.member_obs_ids (§11) but are NOT §5
  // nodes, so they are filtered out here rather than added to the graph.
  for (const { target_id, candidate } of input.candidates) {
    const nodes: string[] = [];
    if (targetIds.has(target_id)) nodes.push(target_id);
    for (const id of candidate.member_obs_ids) {
      if (poolIds.has(id)) nodes.push(id);
    }
    nodes.sort();
    const first = nodes[0];
    if (first === undefined) continue;
    for (const n of nodes) uf.union(first, n);
  }

  // Group by root.
  const grouped = new Map<string, { targets: string[]; members: string[] }>();
  for (const [id, root] of uf.roots()) {
    let bucket = grouped.get(root);
    if (bucket === undefined) {
      bucket = { targets: [], members: [] };
      grouped.set(root, bucket);
    }
    if (targetIds.has(id)) bucket.targets.push(id);
    else bucket.members.push(id);
  }

  const components: DecomposedComponent[] = [];
  for (const root of [...grouped.keys()].sort()) {
    const bucket = grouped.get(root);
    if (bucket === undefined) continue;
    const members = [...bucket.members].sort() as ObservationId[];
    let total = 0;
    for (const id of members) total += valueOf.get(id) ?? 0;
    components.push({
      target_ids: Object.freeze([...bucket.targets].sort()),
      member_obs_ids: Object.freeze(members),
      size: members.length,
      total_value_paise: total,
      exceeds_k_max: members.length > SEARCH_BOUND.k_max,
    });
  }

  return { components: Object.freeze(components) };
}
