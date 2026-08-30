/**
 * The ground-truth side of the scorer — **the only module here that imports
 * `packages/generator`.**
 *
 * `PREREGISTRATION.md §6.2` `AL1` bars `packages/engine` and `packages/oracle`
 * from importing `packages/generator`, and `AL2` bars both from reading any
 * `ground_truth*.jsonl` path. **Neither rule binds the scorer**, and neither
 * could: `EVALUATION_SPEC.md §4.2` scores agent edges *"against ground truth"*
 * and `§4.4` projects `proj_truth` from `true_journal`. A scorer that could not
 * see the answer key could not mark the paper.
 *
 * What `§6.2` does require is that the boundary be **visible**. This module is
 * that boundary, and its shape is the argument:
 *
 *   - It is the single import site for `@assay/generator` in `src/`, which
 *     `tests/discipline.test.ts` asserts by counting. A second one is a test
 *     failure, not a review comment.
 *   - It converts `GroundTruth` into {@link ScoringTruth}, a structural
 *     interface owned here. Every metric module takes that type, so **no metric
 *     module imports the generator at all** and none can widen what it reads by
 *     accident.
 *   - It exposes no path, no reader and no `GroundTruth` re-export. An agent
 *     module that imported this one would still obtain nothing it could hand
 *     onward, and `agent.ts` — which is the only surface an agent sees — does
 *     not import it.
 *
 * **This module performs no I/O.** `ARCHITECTURE.md §3` gives `apps/cli` all
 * filesystem I/O; `AL2`'s runtime path guard therefore has nothing here to
 * intercept, which is the same stronger-than-passing property
 * `packages/oracle`'s header claims for the same reason.
 */

import type { AccountCode } from "@assay/domain";
import type { AccountBalances } from "@assay/ledger";
import { ACCOUNT_CODES } from "@assay/domain";
import { paise, type Paise } from "@assay/money";
import type { GroundTruth } from "@assay/generator";

/**
 * One true allocation edge — `EVALUATION_SPEC.md §4.2`'s scoring unit.
 *
 * `GroundTruth.allocations` carries `(settlement_id, entity_id)` rows, which is
 * this pair under other names. The rename is deliberate: `§4.2` defines the
 * metric on `(entity_id, target_id)`, and a settlement is one kind of target.
 */
export interface TrueEdge {
  readonly entity_id: string;
  readonly target_id: string;
}

/**
 * One line of the true journal, structurally.
 *
 * Declared here rather than imported so that metric modules need no generator
 * type. `generator`'s `TrueJournalLine` is assignable to it — it carries `seq`
 * and `posting_ref` as well, neither of which `§4.4` reads.
 */
export interface TrueJournalRow {
  /** `DATA_MODEL.md §1`: *"The JOIN KEY for covered-set projection"*. */
  readonly source_entity_id: string;
  readonly account: AccountCode;
  readonly dr_paise: number;
  readonly cr_paise: number;
}

/**
 * Everything the scorer reads from ground truth, and nothing else.
 *
 * `GroundTruth` additionally carries `gt_version`, `seed`, `family_id`,
 * `true_balances` and `degradations`. They are not projected here because no
 * metric in `EVALUATION_SPEC.md §4` reads them: `true_balances` is the whole-run
 * projection, and `§4.4`'s `proj_truth` is explicitly the **covered-set**
 * projection, so substituting the former would restore the benchmark v1.0.1
 * formula the section amends.
 */
export interface ScoringTruth {
  readonly edges: readonly TrueEdge[];
  readonly journal: readonly TrueJournalRow[];
}

/**
 * Project `GroundTruth` onto what the scorer reads.
 *
 * `bank_mappings` becomes edges alongside `allocations`: `§4.2`'s unit is
 * `(entity_id, target_id)` over allocation pairs generally, and a bank line is
 * a target kind (`DATA_MODEL.md §17.1.1`). **The settlement is the entity on
 * that edge**, which `PREREGISTRATION.md §10` V18 records as the reason no
 * `bank_line` target is *expressible* under `§5.3` — a settlement is not a
 * member-eligible kind. The edges are carried anyway rather than dropped: `§4.2`
 * scores what the agent asserted against what is true, and silently omitting a
 * true edge would turn a false positive into a non-event.
 *
 * `ledger_mappings` is **not** projected. `EVALUATION_SPEC.md §4.1` states that
 * with `AN5` retired *"a `ledger_entry` is never a target and cannot be a
 * candidate member"*, so it supports no edge; metric 28 reads `0.0` by
 * construction and `§4.1` publishes the explanation beside it.
 */
export function scoringTruth(gt: GroundTruth): ScoringTruth {
  const edges: TrueEdge[] = gt.allocations.map((a) => ({
    entity_id: a.entity_id,
    target_id: a.settlement_id,
  }));
  for (const mapping of gt.bank_mappings) {
    for (const settlementId of mapping.settlement_ids) {
      edges.push({ entity_id: settlementId, target_id: mapping.bank_line_id });
    }
  }
  return Object.freeze({
    edges: Object.freeze(edges),
    journal: Object.freeze(gt.true_journal.map((l) => Object.freeze({
      source_entity_id: l.source_entity_id,
      account: l.account,
      dr_paise: l.dr_paise,
      cr_paise: l.cr_paise,
    }))),
  });
}

/**
 * `proj_truth(acct)` — `EVALUATION_SPEC.md §4.4`'s covered-set truth projection.
 *
 * *"`proj_truth(acct) = Σ dr_paise − Σ cr_paise` over `true_journal` lines whose
 * `source_entity_id` belongs to a covered observation."* `covered` is therefore
 * a set of `source_entity_id`s and not of `obs_id`s — `DATA_MODEL.md §1` names
 * that field *"the JOIN KEY for covered-set projection"* in terms.
 *
 * Debit-positive, `balance(acct) = Σ dr − Σ cr`, with no per-account adjustment
 * (`ARCHITECTURE.md §8`). Every account code appears in the result, including
 * the ones no line touched, so a caller differencing two projections never
 * reads `undefined` for an account one side happened to miss.
 */
export function projectTruth(
  journal: readonly TrueJournalRow[],
  covered: ReadonlySet<string>,
): AccountBalances {
  const totals = {} as Record<AccountCode, number>;
  for (const code of ACCOUNT_CODES) totals[code] = 0;
  for (const line of journal) {
    if (!covered.has(line.source_entity_id)) continue;
    totals[line.account] += line.dr_paise - line.cr_paise;
  }
  // Through `paise()` rather than a cast: it is money's only admitting
  // constructor and it raises on a value outside the safe-integer range, which
  // is invariant `I7`. A cast would let an overflowed sum reach a metric as if
  // it were exact.
  const balances = {} as Record<AccountCode, Paise>;
  for (const code of ACCOUNT_CODES) balances[code] = paise(totals[code]);
  return Object.freeze(balances);
}

/** The true target of each entity, for `§4.4`(b)'s misdirected-value test. */
export function trueTargetByEntity(edges: readonly TrueEdge[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const edge of edges) {
    // First writer wins, and a second is not overwritten: C7 makes an entity
    // belong to at most one accepted allocation, so a second true target for
    // one entity is a defect in the truth rather than an update to it. Silently
    // taking the last would make the metric depend on array order.
    if (!out.has(edge.entity_id)) out.set(edge.entity_id, edge.target_id);
  }
  return out;
}
