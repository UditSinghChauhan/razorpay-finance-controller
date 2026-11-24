/**
 * bench-v2's seven metrics, M-A to M-G (`docs/BENCH_V2_PREREGISTRATION.md §4`).
 *
 * Every metric is a ratio of two **counts of targets** (M-E: a sum of gaps over
 * a count), and every one is emitted with its numerator, its denominator and
 * the number of targets **excluded** from the denominator by a declared
 * exclusion — `SEARCH_BOUND_ORACLE`, an undefined gap, an unknown certificate
 * reason — so the reader sees what the rate does not cover in the same record
 * as the rate. A zero denominator is reported as `DENOMINATOR_EMPTY`, never as
 * `0` or `NaN`: an empty population is a result about the corpus, and the
 * pre-registration predicts which ones will be empty.
 *
 * **`unresolved_value_paise` appears in no metric here**, by
 * `PREREGISTRATION.md §10` V39: on a family with an abstained, partly anchored
 * settlement it counts the same rupees twice, and the defect is deferred, not
 * fixed. Nothing below reads `AgentRun.close`.
 *
 * **What is joined, and where it comes from.** The documented rows are
 * `documented-model/`'s (oracle structure + specified evidence model, from
 * observations and the recon report); the engine's verdict is `AgentRun`'s
 * (`abstentions`, `allocations`); the truth is `truth.ts`'s
 * `trueTargetByEntity`; the certificate reason per abstained target is the
 * agent's, supplied as a value because `AgentRun` carries no certificate
 * (`apps/cli` reads it off its own evidence). Per-family and overall figures
 * are computed by the same function over one unit and over the union.
 *
 * **M-D is NOT a headline** (Work Order 3b, Part 2a). Its rupee value is fixed
 * by the generator's amount table and its 0.5 by exchangeability, so it is
 * reported as the SHARE of the ambiguous value the arm misbooks, with the
 * corpus's total settlement value beside it — *"≈0.5 by construction; measured
 * to confirm the arm behaves as modelled"*. Scored on the
 * `A2-NOABSTAIN` unit: the RATE is wrong commits over committed documented-TA
 * targets; the VALUE is the paise that arm books to the wrong allocation on
 * documented-TA targets the reference arm (`ASSAY`) held under a certificate
 * on the same dataset — {@link ForcedChoiceHarm}. A paisa is counted once per
 * wrongly allocated entity, at its observed `amount` (absolute): the anchored
 * members a wrong allocation also carries are correctly placed and are not
 * charged.
 */

import type { Observation } from "@assay/domain";
import { memberContribution } from "@assay/oracle";

import type { AgentRun } from "../run.js";
import {
  documentedDiscriminable,
  documentedSingle,
  documentedTrulyAmbiguous,
  type DocumentedTargetRow,
} from "../documented-model/documented.js";

export const BENCH_V2_METRIC_IDS = Object.freeze(["M-A", "M-B", "M-C", "M-D", "M-E", "M-F", "M-G"] as const);
export type BenchV2MetricId = (typeof BENCH_V2_METRIC_IDS)[number];

/** Printed where a denominator is zero. Never `0`, never `NaN`. */
export const DENOMINATOR_EMPTY = "DENOMINATOR_EMPTY" as const;

/** One metric's value, with the three counts it is made of. */
export interface BenchV2Metric {
  readonly id: BenchV2MetricId;
  readonly name: string;
  readonly numerator: number;
  readonly denominator: number;
  /** Targets a declared exclusion kept out of the denominator; named in `excluded_by`. */
  readonly excluded: number;
  readonly excluded_by: Readonly<Record<string, number>>;
  /** `numerator / denominator`, or `DENOMINATOR_EMPTY`. */
  readonly value: number | typeof DENOMINATOR_EMPTY;
}

/** M-F: the reason mix is one row per reason beside the ratio record. */
export interface CertificateReasonMix {
  readonly reason: string;
  readonly count: number;
}

/** One scored unit: one family instance's run, rows, truth and reasons. */
export interface BenchV2Unit {
  /** The family the unit belongs to (`A01`, ...); overall figures pool every unit. */
  readonly family: string;
  readonly run: AgentRun;
  readonly rows: readonly DocumentedTargetRow[];
  /** `truth.ts`'s `trueTargetByEntity`: an entity's true settlement. */
  readonly true_target_of_entity: ReadonlyMap<string, string>;
  /** The certificate `reason` per abstained target, from the agent's own evidence. */
  readonly certificate_reason_of_target: ReadonlyMap<string, string>;
  /**
   * M-D's value term only: the targets the REFERENCE arm (`ASSAY`) abstained
   * on — held under a certificate — for this same dataset. Supplied on the
   * `A2-NOABSTAIN` unit; a unit without it contributes nothing to the value
   * and its documented-TA targets are counted under `NO_REFERENCE_ARM`.
   */
  readonly reference_abstentions?: ReadonlySet<string>;
  /** Observed `amount` per entity, paise — {@link entityAmountsPaise}. Required with `reference_abstentions`. */
  readonly entity_amount_paise?: ReadonlyMap<string, number>;
  /**
   * M-D's share term: the entities whose observed batch identity is absent —
   * {@link detachedEntityIds}. On a documented-TA target these are the lines
   * the admissible allocations dispute; the anchored rest is common to them.
   */
  readonly detached_entity_ids?: ReadonlySet<string>;
  /** This dataset's total settlement value, paise — {@link settlementValuePaise}. Printed beside M-D's share. */
  readonly settlement_value_paise?: number;
}

/**
 * M-D's value: the paise the scored arm books to the WRONG allocation on
 * documented-TA targets the reference arm held under a certificate.
 */
export interface ForcedChoiceHarm {
  /** `Σ |amount|` over wrongly allocated entities on held TA targets; `null` when no unit carried a reference arm. */
  readonly value_paise: number | null;
  /** Held TA targets on which the scored arm committed at least one wrong entity. */
  readonly wrong_targets: number;
  /** Entities behind `value_paise`. */
  readonly wrong_entities: number;
  /** TA targets the reference arm held, in units that carry one. */
  readonly held_targets: number;
  /** Of `held_targets`, those the scored arm committed an allocation on (the rest are excepted). */
  readonly held_committed: number;
  /** TA targets outside the value's population, by reason; and wrong entities with no amount. */
  readonly excluded_by: Readonly<Record<string, number>>;
  /**
   * `Σ |amount|` over the DETACHED entities the scored arm committed on held
   * TA targets — the ambiguous value it had to choose an owner for. `null`
   * where no unit carried a reference arm and the detached set.
   */
  readonly contested_paise: number | null;
  /**
   * **M-D's reported figure** (Work Order 3b, Part 2a): `value_paise /
   * contested_paise`, the share of the ambiguous value the arm misbooks.
   * **≈ 0.5 by construction** — the arm commits one of two exchangeable
   * allocations on a coin — and measured to confirm the arm behaves as modelled,
   * not as evidence of anything. `DENOMINATOR_EMPTY` on no contested value;
   * `null` as `contested_paise`.
   */
  readonly share: number | typeof DENOMINATOR_EMPTY | null;
  /** `Σ` settlement value over the units, paise; printed beside `share`. `null` if any unit lacked it. */
  readonly corpus_settlement_value_paise: number | null;
}

/** The seven metrics for one population (a family, or all families pooled). */
export interface BenchV2Report {
  readonly population: string;
  readonly units: number;
  readonly metrics: readonly BenchV2Metric[];
  readonly reason_mix: readonly CertificateReasonMix[];
  /** M-D's rupee figure, beside M-D's rate in `metrics`. */
  readonly forced_choice_harm: ForcedChoiceHarm;
}

/**
 * The observed `amount` of every member-eligible observation, by entity id —
 * what {@link BenchV2Unit.entity_amount_paise} expects. Absolute paise.
 */
export function entityAmountsPaise(observations: readonly Observation[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const o of observations) {
    const m = memberContribution(o);
    if (m !== null) out.set(m.entity_id, Math.abs(m.amount));
  }
  return out;
}

/**
 * The entities whose observed batch identity is absent: `recon_line`s with
 * `settlement_id: null` — what {@link BenchV2Unit.detached_entity_ids} expects.
 * On bench-v2 these are exactly the lines `DROP_BATCH_IDENTITY` detached.
 */
export function detachedEntityIds(observations: readonly Observation[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const o of observations) {
    if (o.kind === "recon_line" && o.payload.settlement_id === null) out.add(o.payload.entity_id);
  }
  return out;
}

/** `Σ amount` over the dataset's `settlement` observations, paise. */
export function settlementValuePaise(observations: readonly Observation[]): number {
  let total = 0;
  for (const o of observations) if (o.kind === "settlement") total += Math.abs(o.payload.amount);
  return total;
}

function metric(
  id: BenchV2MetricId,
  name: string,
  numerator: number,
  denominator: number,
  excludedBy: Readonly<Record<string, number>>,
): BenchV2Metric {
  const excluded = Object.values(excludedBy).reduce((t, n) => t + n, 0);
  return Object.freeze({
    id,
    name,
    numerator,
    denominator,
    excluded,
    excluded_by: Object.freeze({ ...excludedBy }),
    value: denominator === 0 ? DENOMINATOR_EMPTY : numerator / denominator,
  });
}

interface Tally {
  ta: number; taAbstained: number; taCommitted: number; taWrong: number; taExcepted: number;
  disc: number; discAbstained: number;
  single: number; singleAbstained: number;
  bound: number;
  abstained: number; abstainedTa: number; abstainedBound: number; abstainedUnclassed: number;
  gapSum: number; gapCount: number; gapUndefined: number;
  reasonKnown: number;
  mix: Map<string, number>;
  // M-D value
  referenceUnits: number;
  harmPaise: number; harmWrongTargets: number; harmWrongEntities: number;
  heldTargets: number; heldCommitted: number; heldExcepted: number; heldSelfAbstained: number;
  notHeld: number; noReference: number; amountUnknown: number;
  contestedPaise: number; contestedUnits: number; settlementPaise: number; settlementUnits: number;
}

function emptyTally(): Tally {
  return {
    ta: 0, taAbstained: 0, taCommitted: 0, taWrong: 0, taExcepted: 0,
    disc: 0, discAbstained: 0, single: 0, singleAbstained: 0, bound: 0,
    abstained: 0, abstainedTa: 0, abstainedBound: 0, abstainedUnclassed: 0,
    gapSum: 0, gapCount: 0, gapUndefined: 0, reasonKnown: 0, mix: new Map(),
    referenceUnits: 0, harmPaise: 0, harmWrongTargets: 0, harmWrongEntities: 0,
    heldTargets: 0, heldCommitted: 0, heldExcepted: 0, heldSelfAbstained: 0,
    notHeld: 0, noReference: 0, amountUnknown: 0,
    contestedPaise: 0, contestedUnits: 0, settlementPaise: 0, settlementUnits: 0,
  };
}

/**
 * One unit's counts. Units are tallied separately and summed, never pooled by
 * target id: ids are minted per dataset and two seeds may mint the same one.
 */
function tallyUnit(unit: BenchV2Unit, into: Tally): void {
  const rowOf = new Map<string, DocumentedTargetRow>();
  for (const row of unit.rows) rowOf.set(row.target_id, row);
  const abstained = new Set(unit.run.abstentions.map((a) => a.source_entity_id));
  const committed = new Set<string>();
  // A set per target: an entity is charged once however many edges name it.
  const wrongEntitiesOf = new Map<string, Set<string>>();
  const detachedCommittedOf = new Map<string, Set<string>>();
  const detached = unit.detached_entity_ids;
  if (unit.settlement_value_paise !== undefined) {
    into.settlementPaise += unit.settlement_value_paise;
    into.settlementUnits += 1;
  }
  if (unit.reference_abstentions !== undefined && detached !== undefined) into.contestedUnits += 1;
  for (const e of unit.run.allocations) {
    committed.add(e.target_id);
    if (detached?.has(e.entity_id) === true) {
      const bucket = detachedCommittedOf.get(e.target_id);
      if (bucket === undefined) detachedCommittedOf.set(e.target_id, new Set([e.entity_id]));
      else bucket.add(e.entity_id);
    }
    if (unit.true_target_of_entity.get(e.entity_id) !== e.target_id) {
      const bucket = wrongEntitiesOf.get(e.target_id);
      if (bucket === undefined) wrongEntitiesOf.set(e.target_id, new Set([e.entity_id]));
      else bucket.add(e.entity_id);
    }
  }
  const reference = unit.reference_abstentions;
  if (reference !== undefined) into.referenceUnits += 1;
  for (const row of unit.rows) {
    const isAbstained = abstained.has(row.target_id);
    if (row.documented === "SEARCH_BOUND_ORACLE") into.bound += 1;
    if (documentedTrulyAmbiguous(row)) {
      into.ta += 1;
      const wrongHere = wrongEntitiesOf.get(row.target_id) ?? new Set<string>();
      if (isAbstained) into.taAbstained += 1;
      else if (committed.has(row.target_id)) {
        into.taCommitted += 1;
        if (wrongHere.size > 0) into.taWrong += 1;
      } else into.taExcepted += 1;
      // M-D value: TA targets the reference arm held, where this arm committed.
      if (reference === undefined) into.noReference += 1;
      else if (!reference.has(row.target_id)) into.notHeld += 1;
      else {
        into.heldTargets += 1;
        if (isAbstained) into.heldSelfAbstained += 1;
        else if (!committed.has(row.target_id)) into.heldExcepted += 1;
        else {
          into.heldCommitted += 1;
          if (wrongHere.size > 0) into.harmWrongTargets += 1;
          for (const entity of detachedCommittedOf.get(row.target_id) ?? []) {
            into.contestedPaise += unit.entity_amount_paise?.get(entity) ?? 0;
          }
          for (const entity of wrongHere) {
            const amount = unit.entity_amount_paise?.get(entity);
            if (amount === undefined) into.amountUnknown += 1;
            else {
              into.harmPaise += amount;
              into.harmWrongEntities += 1;
            }
          }
        }
      }
    }
    if (documentedDiscriminable(row)) {
      into.disc += 1;
      if (isAbstained) into.discAbstained += 1;
    }
    if (documentedSingle(row)) {
      into.single += 1;
      if (isAbstained) into.singleAbstained += 1;
    }
  }
  for (const target of abstained) {
    into.abstained += 1;
    const row = rowOf.get(target);
    if (row === undefined) into.abstainedUnclassed += 1;
    else if (row.documented === "SEARCH_BOUND_ORACLE") into.abstainedBound += 1;
    else if (documentedTrulyAmbiguous(row)) into.abstainedTa += 1;
    if (row?.gap_bps === null || row === undefined) into.gapUndefined += 1;
    else {
      into.gapSum += row.gap_bps;
      into.gapCount += 1;
    }
    const reason = unit.certificate_reason_of_target.get(target);
    if (reason !== undefined) {
      into.reasonKnown += 1;
      into.mix.set(reason, (into.mix.get(reason) ?? 0) + 1);
    }
  }
}

const nonZero = (entries: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(entries).filter(([, n]) => n > 0));

/**
 * Compute M-A .. M-G over a set of units. Call once per family (one unit, or
 * that family's units across seeds) and once over every unit for the overall line.
 */
export function benchV2Metrics(units: readonly BenchV2Unit[], population: string): BenchV2Report {
  const t = emptyTally();
  for (const unit of units) tallyUnit(unit, t);
  const bound = nonZero({ SEARCH_BOUND_ORACLE: t.bound });

  // M-A abstention_recall = abstained ∩ TA / TA
  const mA = metric("M-A", "abstention_recall", t.taAbstained, t.ta, bound);
  // M-B false_abstention_rate = abstained ∩ D / D
  const mB = metric("M-B", "false_abstention_rate", t.discAbstained, t.disc, bound);
  // M-C precision = abstained ∩ TA / abstained, over targets the model classed.
  const mC = metric(
    "M-C",
    "abstention_precision",
    t.abstainedTa,
    t.abstained - t.abstainedBound - t.abstainedUnclassed,
    nonZero({ SEARCH_BOUND_ORACLE: t.abstainedBound, NOT_A_LABELLED_TARGET: t.abstainedUnclassed }),
  );
  // M-D a2_misallocation_rate = wrong / committed TA; excepted (no allocation,
  // not abstained) counted separately, never folded in. On the A2 arm nothing
  // is abstained; on any other arm its own abstentions are named, not hidden.
  const mD = metric("M-D", "a2_misallocation_rate", t.taWrong, t.taCommitted, {
    ...bound,
    ...nonZero({ EXCEPTED_NO_ALLOCATION: t.taExcepted, ABSTAINED_BY_THIS_ARM: t.taAbstained }),
  });
  // M-E mean documented gap over abstained targets with a defined gap.
  const mE = metric("M-E", "mean_documented_gap_bps_over_abstained", t.gapSum, t.gapCount, nonZero({ GAP_UNDEFINED: t.gapUndefined }));
  // M-F certificate reason mix: share of abstentions carrying a known reason,
  // with the per-reason counts beside it.
  const mF = metric("M-F", "certificate_reason_mix", t.reasonKnown, t.abstained, nonZero({ REASON_UNKNOWN: t.abstained - t.reasonKnown }));
  // M-G spurious_abstention_rate = abstained ∩ SINGLE / SINGLE
  const mG = metric("M-G", "spurious_abstention_rate", t.singleAbstained, t.single, bound);

  const contested = t.contestedUnits === 0 ? null : t.contestedPaise;
  const forcedChoiceHarm: ForcedChoiceHarm = Object.freeze({
    contested_paise: contested,
    share: contested === null ? null : contested === 0 ? DENOMINATOR_EMPTY : t.harmPaise / contested,
    corpus_settlement_value_paise: units.length > 0 && t.settlementUnits === units.length ? t.settlementPaise : null,
    value_paise: t.referenceUnits === 0 ? null : t.harmPaise,
    wrong_targets: t.harmWrongTargets,
    wrong_entities: t.harmWrongEntities,
    held_targets: t.heldTargets,
    held_committed: t.heldCommitted,
    excluded_by: Object.freeze(
      nonZero({
        ...bound,
        EXCEPTED_NO_ALLOCATION: t.heldExcepted,
        ABSTAINED_BY_THIS_ARM: t.heldSelfAbstained,
        NOT_HELD_BY_REFERENCE: t.notHeld,
        NO_REFERENCE_ARM: t.noReference,
        AMOUNT_UNKNOWN: t.amountUnknown,
      }),
    ),
  });

  return Object.freeze({
    population,
    units: units.length,
    metrics: Object.freeze([mA, mB, mC, mD, mE, mF, mG]),
    reason_mix: Object.freeze(
      [...t.mix.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([reason, count]) => Object.freeze({ reason, count })),
    ),
    forced_choice_harm: forcedChoiceHarm,
  });
}

/** Per-family reports followed by the overall one, from the same units. */
export function benchV2ByFamily(units: readonly BenchV2Unit[]): readonly BenchV2Report[] {
  const families = [...new Set(units.map((u) => u.family))].sort();
  const perFamily = families.map((f) => benchV2Metrics(units.filter((u) => u.family === f), f));
  return Object.freeze([...perFamily, benchV2Metrics(units, "OVERALL")]);
}

/**
 * The headline line for one metric — the excluded count **in the same
 * sentence** as the rate, never in a footnote (`docs/BENCH_V2_PREREGISTRATION.md §4`).
 */
export function formatBenchV2Metric(m: BenchV2Metric): string {
  const value = m.value === DENOMINATOR_EMPTY ? DENOMINATOR_EMPTY : m.value.toFixed(4);
  const exclusions =
    m.excluded === 0
      ? "0 excluded"
      : `${String(m.excluded)} excluded (${Object.entries(m.excluded_by)
          .map(([k, v]) => `${k} ${String(v)}`)
          .join(", ")})`;
  return `${m.id} ${m.name} = ${value} (${String(m.numerator)} / ${String(m.denominator)}; ${exclusions})`;
}

/**
 * M-D's headline line: the rupees, the targets they sit on, and every
 * exclusion in the same sentence. `null` prints `NO_REFERENCE_ARM`.
 */
export function formatForcedChoiceHarm(h: ForcedChoiceHarm): string {
  const entries = Object.entries(h.excluded_by);
  const excluded = entries.reduce((t, [, n]) => t + n, 0);
  const exclusions =
    excluded === 0 ? "0 excluded" : `${String(excluded)} excluded (${entries.map(([k, v]) => `${k} ${String(v)}`).join(", ")})`;
  if (h.value_paise === null) return `M-D forced_choice_harm = NO_REFERENCE_ARM (${exclusions})`;
  const rupees = (h.value_paise / 100).toFixed(2);
  const share =
    h.share === null
      ? "share NOT_COMPUTED (no detached set)"
      : h.share === DENOMINATOR_EMPTY
        ? `share ${DENOMINATOR_EMPTY}`
        : `share ${h.share.toFixed(4)} of ${String(h.contested_paise)} contested paise (≈0.5 by construction; measured to confirm the arm behaves as modelled)`;
  const corpus =
    h.corpus_settlement_value_paise === null ? "corpus settlement value unknown" : `corpus settlement value ${String(h.corpus_settlement_value_paise)} paise`;
  return (
    `M-D ${share}; ${corpus}; Rs ${rupees} (${String(h.value_paise)} paise, ${String(h.wrong_entities)} entities) ` +
    `booked to the wrong allocation on ${String(h.wrong_targets)} of ${String(h.held_committed)} committed targets ` +
    `the reference arm held (${String(h.held_targets)} held; ${exclusions})`
  );
}
