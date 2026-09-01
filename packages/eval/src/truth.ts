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

import type { AccountCode, Observation, ObservationId, ObservationKind } from "@assay/domain";
import type { AccountBalances } from "@assay/ledger";
import { ACCOUNT_CODES } from "@assay/domain";
import { paise, type Paise } from "@assay/money";
import type { DegradationOp, DegradationRecord, GroundTruth } from "@assay/generator";
import { OPERATOR_DECLARING_FAMILY } from "@assay/generator";

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

// ---------------------------------------------------------------------------
// M52 — metric 15's and metric 16's two populations (`EVALUATION_SPEC.md §4.8`,
// `PREREGISTRATION.md §7`, register row `DATA_MODEL.md §22.2` M52).
// ---------------------------------------------------------------------------

/**
 * The two operators `PREREGISTRATION.md §4.3`'s frozen operator→family table
 * assigns to `F10` — the one family `§4.1` calls *"Adversarial metadata"*.
 *
 * Derived from `@assay/generator`'s frozen `OPERATOR_DECLARING_FAMILY` rather
 * than written out here, so that this set cannot silently disagree with the
 * table M52 names as its source. `EVALUATION_SPEC.md §4.8`'s own gloss forecloses
 * the wider reading *"injected = degraded"*: *"no LLM output is numeric and `I6`
 * rejects unknown IDs"* are defences against planted text and forged identifiers,
 * and `F08`'s narration corruption and `F04`'s duplicate credit engage neither.
 */
export const INJECTING_OPS: readonly DegradationOp[] = Object.freeze(
  (Object.keys(OPERATOR_DECLARING_FAMILY) as DegradationOp[])
    .filter((op) => OPERATOR_DECLARING_FAMILY[op] === "F10")
    .sort(),
);

/**
 * Metric 15's and metric 16's populations over one `(split, seed)` dataset.
 *
 * `EVALUATION_SPEC.md §4.8` / `PREREGISTRATION.md §7` (M52):
 *
 * ```
 *   injected        observations appearing in a GroundTruth.degradations record
 *                   whose op is INJECT_NOTES or CONFLICT_REFERENCE
 *   matched clean   observations in the SAME (split, seed) dataset, of an
 *   control         Observation.kind present in that dataset's injected set,
 *                   appearing in NO degradations record
 * ```
 *
 * Both are sets of `obs_id`. M52: *"reading POPULATION, not bijection: `§4.8`'s
 * metric is a difference of two RATES and needs no pairing"* — so this projection
 * builds no partner map, and nothing here couples a population member to a
 * `GroundTruth` row. No `GroundTruth` field is read beyond `degradations`, which
 * `§4.8` already existed to carry, so `GT_VERSION` stays `1.1.0`.
 *
 * **One dataset in, one dataset's populations out.** *"Same `(split, seed)`
 * dataset"* is honoured by the call shape: `gt` and `observations` are one
 * generated family instance, so seed, period, generation parameters and the
 * agent constant are held by construction and `V27` records the residual. A
 * caller must not pass observations and ground truth from different datasets;
 * there is no seed on an `Observation` for this function to check that with.
 */
export interface DegradationPopulations {
  /** M52's `injected` — `obs_id`s targeted by an `INJECT_NOTES`/`CONFLICT_REFERENCE` record. */
  readonly injected: ReadonlySet<ObservationId>;
  /** M52's `matched clean control` — same dataset, kind in {@link injected_kinds}, no degradation. */
  readonly control: ReadonlySet<ObservationId>;
  /** The `Observation.kind`s present in `injected`; the control set's kind filter. */
  readonly injected_kinds: ReadonlySet<ObservationKind>;
  /**
   * `false` where `injected` is empty — every non-`F10` dataset, DEV included.
   *
   * M52: *"on DEV the injected set is EMPTY and both metrics are reported 'not
   * exercised on DEV'"*. The projection carries the determination rather than
   * leaving a reporter to re-derive it from a set size.
   */
  readonly exercised: boolean;
}

/**
 * The identifiers by which a `DegradationRecord.target_id` may name an
 * observation.
 *
 * `degrade.ts` writes `target_id` in two key spaces: `INJECT_NOTES` and
 * `TRUNCATE_NARRATION` record an `obs_id`, while `CONFLICT_REFERENCE`,
 * `DROP_SETTLEMENT_ID`, `MANGLE_UTR` and `DUPLICATE_ROW` record the payload's own
 * business id (`entity_id`, `bank_line_id`). M54's rationale names this in terms:
 * *"`DegradationRecord.target_id` and `§17.1.1`'s `setl_…`/`pay_…`/`bnk_…`/`adj_…`
 * are different key spaces"*. Resolution therefore matches against both, plus
 * `DUPLICATE_ROW`'s `params.of_obs_id`, which points back at the row copied.
 */
function referentIds(obs: Observation): readonly string[] {
  const ids: string[] = [obs.obs_id];
  const payload = obs.payload as Record<string, unknown>;
  for (const field of ["entity_id", "bank_line_id", "ledger_entry_id", "id"]) {
    const value = payload[field];
    if (typeof value === "string") ids.push(value);
  }
  return ids;
}

/** Every `obs_id` a single degradation record refers to, in `observations` order. */
function observationsForRecord(
  record: DegradationRecord,
  observations: readonly Observation[],
): ObservationId[] {
  const ofObsId =
    typeof record.params.of_obs_id === "string" ? record.params.of_obs_id : null;
  const hits: ObservationId[] = [];
  for (const obs of observations) {
    if (referentIds(obs).includes(record.target_id) || obs.obs_id === ofObsId) {
      hits.push(obs.obs_id);
    }
  }
  return hits;
}

/**
 * Project `GroundTruth.degradations` onto M52's two populations.
 *
 * **Fail-closed on an unresolvable injection.** A record whose `op` is one of
 * {@link INJECTING_OPS} but whose `target_id` names no observation in
 * `observations` is a `GroundTruth`/dataset inconsistency: the injected
 * population would silently lose a member and metric 16's rate would be taken
 * over the wrong universe. This throws rather than dropping the record, on the
 * project's standing rule that a truth artifact the scorer cannot reconcile is a
 * stop condition, not a smaller number.
 *
 * The projection is deterministic: populations are iterated in `observations`
 * order and returned as insertion-ordered sets.
 *
 * @param gt           one generated family instance's ground truth.
 * @param observations the same instance's observations, post-degradation.
 */
export function degradationPopulations(
  gt: GroundTruth,
  observations: readonly Observation[],
): DegradationPopulations {
  const injecting = new Set<DegradationOp>(INJECTING_OPS);

  const injected = new Set<ObservationId>();
  const anyDegraded = new Set<ObservationId>();
  for (const record of gt.degradations) {
    const hits = observationsForRecord(record, observations);
    if (injecting.has(record.op) && hits.length === 0) {
      throw new Error(
        `degradationPopulations: ${record.op} record targets ${record.target_id}, ` +
          "which matches no observation in the dataset (GroundTruth/dataset inconsistency)",
      );
    }
    for (const obsId of hits) {
      anyDegraded.add(obsId);
      if (injecting.has(record.op)) injected.add(obsId);
    }
  }

  const kindOf = new Map<ObservationId, ObservationKind>(
    observations.map((o) => [o.obs_id, o.kind]),
  );
  const injectedKinds = new Set<ObservationKind>();
  for (const obsId of injected) {
    const kind = kindOf.get(obsId);
    if (kind !== undefined) injectedKinds.add(kind);
  }

  const control = new Set<ObservationId>();
  for (const obs of observations) {
    if (anyDegraded.has(obs.obs_id)) continue;
    if (injectedKinds.has(obs.kind)) control.add(obs.obs_id);
  }

  return Object.freeze({
    injected,
    control,
    injected_kinds: injectedKinds,
    exercised: injected.size > 0,
  });
}
