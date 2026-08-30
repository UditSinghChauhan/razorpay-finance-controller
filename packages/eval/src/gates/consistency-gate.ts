/**
 * The consistency gate — `PREREGISTRATION.md §5.3`, `ARCHITECTURE.md §7.3`.
 *
 * > *"For `R = 20,000` randomly sampled `(target, member-set)` pairs from the
 * > dev split — **deliberately including inadmissible ones** — the engine's
 * > admissibility verdict must equal the oracle's, **constraint by
 * > constraint**. Catches engine and oracle *diverging* from the shared
 * > declaration. Any disagreement fails the build and names the constraint."*
 *
 * **This file is `DECISION_BRIEF.md §L.1` rule 3's single permitted exception.**
 * Rule 3 bars `packages/engine` from importing `packages/oracle` and
 * `packages/oracle` from importing `packages/engine`, then names
 * *"`packages/eval/src/gates/consistency-gate.ts`, which must import both engine
 * and oracle to compare them; it is allowlisted by path in the lint config and
 * **may contain no logic other than the differential test**."*
 *
 * That last clause governs everything below. This module:
 *
 *   - implements **no predicate**. Every verdict comes from
 *     `@assay/engine`'s `evaluate` or from `@assay/oracle`'s `checkAll` and its
 *     two `C3` half accessors. There is no third opinion here about what `C4`
 *     means, because a third opinion is what the gate exists to detect;
 *   - builds **no context**. `parentOrderIdResolver` is the engine's own reading
 *     of `C2`'s referent set and `oracleContext` is the oracle's; each side is
 *     asked for its own, so a disagreement about the referent set is *inside*
 *     the measurement rather than hidden by a shared helper the gate wrote;
 *   - performs **no sampling** and **no I/O**. `§7.3` fixes `R`; the caller
 *     draws the pairs and `apps/cli` reads the split. A gate that sampled would
 *     hold a dataset, and a gate that held a dataset would be a second place
 *     the dev split is interpreted.
 *
 * **Why the comparison is on *exclusion* rather than on the verdict word.** The
 * two sides publish different vocabularies, and neither is wrong:
 * `@assay/engine` reports `PASS | FAIL | NON_BINDING | NOT_EVALUATED` per clause
 * — it separates *"the clause had no comparand"* from *"the clause cannot bind
 * here"* — while `@assay/oracle` reports `SATISFIED | NOT_SATISFIED |
 * NON_BINDING`. `RECONCILIATION_SPEC.md §4.1` says what a constraint is:
 * *"filters — they admit or exclude, never rank"*, and `§5.3` compares *"the
 * engine's **admissibility** verdict"*. The admissibility content of every word
 * in both vocabularies is exactly one bit — did this clause exclude the
 * candidate — so that bit is what is compared, and both raw words are carried on
 * every disagreement so the report never shows a bit without its provenance.
 * Folding the vocabularies any other way would require choosing which of
 * `NOT_EVALUATED` and `NON_BINDING` the oracle "meant", which is an opinion
 * about a constraint and therefore forbidden here.
 */

import type { ConstraintId, Observation } from "@assay/domain";
import {
  evaluate,
  isMember,
  parentOrderIdResolver,
  type ClauseVerdict,
  type Member,
  type Target,
} from "@assay/engine";
import {
  checkAll,
  checkC3BankArrival,
  checkC3Ordering,
  isAdmissible,
  memberContribution,
  oracleContext,
  targetContribution,
  type Candidate as OracleCandidate,
  type CandidateContext as OracleContext,
  type MemberContribution,
  type Verdict,
} from "@assay/oracle";

/**
 * `ARCHITECTURE.md §7.3` and `PREREGISTRATION.md §5.3`: *"`R = 20,000` randomly
 * sampled `(target, member-set)` pairs"*.
 *
 * Declared here and **checked, not enforced**: {@link consistencyGate} reports
 * `sample_size` and `meets_declared_sample_size` so that
 * `EVALUATION_SPEC.md §5.4` item 4 — *"Oracle gate results ... with the sample
 * size used for the differential test"* — is answerable from the result. The
 * gate does not draw the sample, so it cannot make one the right size; what it
 * can do is refuse to let a short run be reported as a full one.
 */
export const DECLARED_SAMPLE_SIZE = 20_000;

/**
 * One `(target, member-set)` pair, stated in observations.
 *
 * Stated in observations rather than in either side's projected types because
 * `PREREGISTRATION.md §5.2` makes the projection itself part of what differs:
 * `@assay/engine`'s `Member` is a narrowed `Observation` and `@assay/oracle`'s
 * `MemberContribution` is a mapping of one. Handing each side the raw
 * observation and letting it project is what keeps the comparison a comparison
 * of two implementations rather than of two callers.
 *
 * `§7.3` requires the sample to include **inadmissible** pairs deliberately, so
 * nothing here is validated for admissibility and no field is rejected for
 * making one impossible. A pair that both sides exclude is a pair on which they
 * agreed.
 */
export interface DifferentialPair {
  /** The caller's handle, echoed on every finding so a failure is addressable. */
  readonly pair_id: string;
  /** A `settlement` or `bank_line` observation (`DATA_MODEL.md §17.1.1`). */
  readonly target: Observation;
  /** The proposed member set. May be empty, may be inadmissible. */
  readonly members: readonly Observation[];
  /** Members `AN1` already anchored to this target (`RECONCILIATION_SPEC.md §3`). */
  readonly anchored: readonly Observation[];
  /**
   * `C3`'s bank-arrival referent — *"the bank line that receives the **target's**
   * money"* — or `null` where none is in scope for this target.
   *
   * The caller supplies it because it is `AN2`'s determination over the dataset,
   * and `§5.3` scopes the half's exclusion *"per target rather than per
   * dataset"*, which only a per-pair field can express.
   */
  readonly bank_value_date: number | null;
  readonly bank_line_id: string | null;
  /** `C7`: observations already belonging to an accepted allocation. */
  readonly allocated: readonly Observation[];
}

/** A clause, at the granularity both sides publish one. */
export interface ClauseKey {
  readonly id: ConstraintId;
  /** `§4.1`'s own name for the half, or `null` where the constraint is undivided. */
  readonly half: string | null;
}

/**
 * Why a clause is not in the pass criterion, or `null` when it is.
 *
 * `PREREGISTRATION.md §5.3`: *"Constraint halves declared **non-binding
 * agent-side** in `RECONCILIATION_SPEC.md §4.1` — `C8` in full, and `C2`'s
 * adjustment half — are excluded from the differential test's pass criterion and
 * reported separately as *evaluated: non-binding*. A gate that cannot fail on a
 * constraint neither side can evaluate would otherwise report agreement it never
 * tested."* And: *"`C3`'s bank-arrival half is excluded **conditionally, not
 * wholesale** ... The exclusion is therefore **per target rather than per
 * dataset**, and the gate reports the split."*
 */
export type ExclusionReason = "DECLARED_NON_BINDING" | "OUT_OF_SCOPE_ON_THIS_TARGET";

/** One clause's outcome on one pair. */
export interface ClauseComparison {
  readonly clause: ClauseKey;
  readonly engine: ClauseVerdict;
  readonly oracle: Verdict;
  /** Whether the engine's word excludes the candidate. */
  readonly engine_excludes: boolean;
  /** Whether the oracle's word excludes the candidate. */
  readonly oracle_excludes: boolean;
  /** `null` when the clause counts toward the pass criterion. */
  readonly excluded_from_criterion: ExclusionReason | null;
}

/** One disagreement, named as `§5.3` requires. */
export interface Divergence {
  readonly pair_id: string;
  readonly clause: ClauseKey;
  readonly engine: ClauseVerdict;
  readonly oracle: Verdict;
}

/** Per-clause tallies, so agreement is never reported without its denominator. */
export interface ClauseTally {
  readonly clause: ClauseKey;
  /** Pairs on which the clause counted toward the pass criterion. */
  readonly compared: number;
  readonly agreed: number;
  readonly diverged: number;
  /** `§5.3`'s *evaluated: non-binding* count — declared out of the criterion. */
  readonly declared_non_binding: number;
  /**
   * `C3`'s bank-arrival half only: pairs whose target had no bank line in scope.
   *
   * `§5.3` requires *"the split — pairs on which the half was evaluated, and
   * pairs on which it was not"*, and this is the second number.
   */
  readonly out_of_scope: number;
}

/** The gate's verdict. */
export interface ConsistencyResult {
  /** `§5.3`: *"Any disagreement fails the build"*, over the criterion clauses. */
  readonly passed: boolean;
  readonly sample_size: number;
  /** Whether `sample_size` reached {@link DECLARED_SAMPLE_SIZE}. */
  readonly meets_declared_sample_size: boolean;
  readonly divergences: readonly Divergence[];
  readonly by_clause: readonly ClauseTally[];
  /**
   * Pairs on which the two sides disagreed about **overall** admissibility.
   *
   * Reported beside the clause tallies rather than instead of them: the
   * criterion is constraint by constraint, and an overall agreement reached
   * through two offsetting clause disagreements is not agreement.
   */
  readonly admissibility_divergences: readonly string[];
}

/**
 * The comparison order, and the only place a clause list is written here.
 *
 * It is the engine's `Admissibility.clauses` order, because that side already
 * publishes the halved granularity `§5.3` compares at. The oracle's counterpart
 * for each row is named in {@link oracleVerdicts}, which reads only exported
 * oracle predicates.
 */
const CLAUSES: readonly ClauseKey[] = Object.freeze([
  { id: "C1", half: null },
  { id: "C2", half: "refund" },
  { id: "C2", half: "adjustment" },
  { id: "C3", half: "ordering" },
  { id: "C3", half: "bank-arrival" },
  { id: "C4", half: null },
  { id: "C5", half: null },
  { id: "C6", half: null },
  { id: "C7", half: null },
  { id: "C8", half: null },
]);

const keyOf = (clause: ClauseKey): string => `${clause.id}/${clause.half ?? ""}`;

/** The engine's word, reduced to the one bit `§4.1` says a filter carries. */
const engineExcludes = (verdict: ClauseVerdict): boolean => verdict === "FAIL";

/** The oracle's word, reduced to the same bit. */
const oracleExcludes = (verdict: Verdict): boolean => verdict === "NOT_SATISFIED";

/**
 * Run the differential test.
 *
 * @param observations the dataset the pairs were drawn from. Read **only** so
 *   that each side can build its own `C2` referent context from it; no pair is
 *   resolved against it and no member is looked up in it.
 * @param pairs the sample. `§7.3` requires it to include inadmissible pairs.
 */
export function consistencyGate(
  observations: readonly Observation[],
  pairs: readonly DifferentialPair[],
): ConsistencyResult {
  // Each side builds its own context from the same dataset. `C2`'s referent set
  // is part of what the gate measures: through spec 1.4.23 the oracle read only
  // recon lines while the engine also read `payment` observations, which is a
  // divergence on exactly the rows §4.2's F05 degrades. A context the GATE built
  // would have hidden it behind one shared reading.
  const parentOrderId = parentOrderIdResolver(observations);
  const oracleOrderIds = oracleContext(observations).orderIdByEntity;

  const tallies = new Map<string, {
    compared: number;
    agreed: number;
    diverged: number;
    declared_non_binding: number;
    out_of_scope: number;
  }>();
  for (const clause of CLAUSES) {
    tallies.set(keyOf(clause), {
      compared: 0,
      agreed: 0,
      diverged: 0,
      declared_non_binding: 0,
      out_of_scope: 0,
    });
  }

  const divergences: Divergence[] = [];
  const admissibilityDivergences: string[] = [];

  for (const pair of pairs) {
    const comparison = comparePair(pair, parentOrderId, oracleOrderIds);
    for (const clause of comparison.clauses) {
      const tally = tallies.get(keyOf(clause.clause));
      // Unreachable while CLAUSES and the engine's clause list are in step,
      // which a test pins. Counting an unknown clause into a fresh bucket would
      // let a renamed half pass the gate by being compared against nothing.
      if (tally === undefined) continue;
      if (clause.excluded_from_criterion === "DECLARED_NON_BINDING") {
        tally.declared_non_binding += 1;
        continue;
      }
      if (clause.excluded_from_criterion === "OUT_OF_SCOPE_ON_THIS_TARGET") {
        tally.out_of_scope += 1;
        continue;
      }
      tally.compared += 1;
      if (clause.engine_excludes === clause.oracle_excludes) {
        tally.agreed += 1;
      } else {
        tally.diverged += 1;
        divergences.push({
          pair_id: pair.pair_id,
          clause: clause.clause,
          engine: clause.engine,
          oracle: clause.oracle,
        });
      }
    }
    if (comparison.engine_admissible !== comparison.oracle_admissible) {
      admissibilityDivergences.push(pair.pair_id);
    }
  }

  return Object.freeze({
    passed: divergences.length === 0 && admissibilityDivergences.length === 0,
    sample_size: pairs.length,
    meets_declared_sample_size: pairs.length >= DECLARED_SAMPLE_SIZE,
    divergences: Object.freeze(divergences),
    by_clause: Object.freeze(
      CLAUSES.map((clause) => {
        const tally = tallies.get(keyOf(clause));
        return Object.freeze({
          clause,
          compared: tally?.compared ?? 0,
          agreed: tally?.agreed ?? 0,
          diverged: tally?.diverged ?? 0,
          declared_non_binding: tally?.declared_non_binding ?? 0,
          out_of_scope: tally?.out_of_scope ?? 0,
        });
      }),
    ),
    admissibility_divergences: Object.freeze(admissibilityDivergences),
  });
}

/** One pair's ten clause comparisons, plus each side's overall verdict. */
export interface PairComparison {
  readonly clauses: readonly ClauseComparison[];
  readonly engine_admissible: boolean;
  readonly oracle_admissible: boolean;
}

/**
 * Compare one pair. Exported so a failing pair can be re-examined on its own.
 *
 * Each side is asked its own question with its own projection and its own
 * context, and the two answers are placed side by side. Nothing between the two
 * calls decides anything about a constraint: `admissible` is the engine's own
 * field and `isAdmissible` is the oracle's own function.
 *
 * @throws Error if `pair.target` is neither a `settlement` nor a `bank_line`.
 *   `DATA_MODEL.md §17.1.1` closes the target universe at those two kinds, and
 *   silently skipping a malformed pair would shrink `R` without saying so —
 *   a sample that is smaller than it reports is a gate that tested less than it
 *   claims.
 */
export function comparePair(
  pair: DifferentialPair,
  parentOrderId: (paymentId: string) => string | null | undefined,
  oracleOrderIds: ReadonlyMap<string, string | null>,
): PairComparison {
  const engineAnchored: Member[] = pair.anchored.filter(isMember);
  const engineTarget = engineTargetOf(pair, engineAnchored);
  const oracleTarget = targetContribution(
    pair.target,
    pair.bank_value_date === null || pair.bank_line_id === null
      ? null
      : { value_date: pair.bank_value_date, bank_line_id: pair.bank_line_id },
  );
  if (engineTarget === null || oracleTarget === null) {
    throw new Error(
      `consistency gate: pair ${pair.pair_id} has target kind "${pair.target.kind}", ` +
        `which DATA_MODEL.md §17.1.1 does not admit as a target (settlement | bank_line).`,
    );
  }

  const engineResult = evaluate(pair.members.filter(isMember), {
    target: engineTarget,
    parentOrderId,
    allocated: new Set(pair.allocated.map((o) => o.obs_id)),
  });

  // C7 keys on entity_id oracle-side and on obs_id engine-side; §4.1 declares it
  // as "no member may already belong to an accepted allocation" and names
  // neither identifier. Both keyings are derived here from the SAME
  // caller-supplied observations by each side's OWN projection, so a divergence
  // the gate reports is between the two predicates and never between two
  // differently-populated sets.
  const oracleCtx: OracleContext = {
    orderIdByEntity: oracleOrderIds,
    allocatedEntities: new Set(contributions(pair.allocated).map((m) => m.entity_id)),
  };
  const oracleCandidate: OracleCandidate = {
    target: oracleTarget,
    members: [...contributions(pair.anchored), ...contributions(pair.members)],
  };
  const oracleVerdicts = checkAll(oracleCandidate, oracleCtx);

  const clauses: ClauseComparison[] = CLAUSES.map((clause) => {
    const engineVerdict: ClauseVerdict =
      engineResult.clauses.find((c) => c.id === clause.id && (c.half ?? null) === clause.half)
        ?.verdict ?? "NOT_EVALUATED";
    const oracleVerdict = oracleVerdictFor(clause, oracleVerdicts[clause.id], oracleCandidate);
    return Object.freeze({
      clause,
      engine: engineVerdict,
      oracle: oracleVerdict,
      engine_excludes: engineExcludes(engineVerdict),
      oracle_excludes: oracleExcludes(oracleVerdict),
      excluded_from_criterion: exclusionFor(clause, pair),
    });
  });

  return Object.freeze({
    clauses: Object.freeze(clauses),
    engine_admissible: engineResult.admissible,
    oracle_admissible: isAdmissible(oracleVerdicts),
  });
}

/**
 * `§5.3`'s exclusions from the pass criterion.
 *
 * Written from the section's own two sentences and from nothing else. `C8` and
 * `C2`'s adjustment half are excluded *wholesale* — `RECONCILIATION_SPEC.md
 * §4.1` declares both **expected-non-binding agent-side**, and
 * `constraints.decl.ts`'s `nonBindingClauses()` returns exactly that pair.
 * `C3`'s bank-arrival half is excluded **per target**, on the target's own
 * evidence rather than on a dataset-wide judgement.
 */
function exclusionFor(clause: ClauseKey, pair: DifferentialPair): ExclusionReason | null {
  if (clause.id === "C8") return "DECLARED_NON_BINDING";
  if (clause.id === "C2" && clause.half === "adjustment") return "DECLARED_NON_BINDING";
  if (clause.id === "C3" && clause.half === "bank-arrival" && pair.bank_value_date === null) {
    return "OUT_OF_SCOPE_ON_THIS_TARGET";
  }
  return null;
}

/**
 * The oracle's verdict for one clause row.
 *
 * `checkAll` reports eight constraints; the engine reports ten clauses because
 * `§4.1` halves `C2` and `C3`. Only `C3` has two *separately computable* halves
 * oracle-side, and the oracle exports both accessors for exactly this
 * comparison. `C2`'s adjustment half is `NON_BINDING` on both sides by
 * declaration — `related_entity_id` is not observable (`DATA_MODEL.md §10`) —
 * and is excluded from the criterion anyway, so nothing is decided here about it.
 */
function oracleVerdictFor(
  clause: ClauseKey,
  combined: Verdict,
  candidate: OracleCandidate,
): Verdict {
  if (clause.id === "C3" && clause.half === "ordering") return checkC3Ordering(candidate);
  if (clause.id === "C3" && clause.half === "bank-arrival") return checkC3BankArrival(candidate);
  if (clause.id === "C2" && clause.half === "adjustment") return "NON_BINDING";
  return combined;
}

/** The oracle's own projection, applied to whatever the caller sampled. */
function contributions(observations: readonly Observation[]): MemberContribution[] {
  return observations
    .map((o) => memberContribution(o))
    .filter((m): m is MemberContribution => m !== null);
}

/** The engine's own target projection, from the pair's observation. */
function engineTargetOf(pair: DifferentialPair, anchored: readonly Member[]): Target | null {
  if (pair.target.kind === "settlement") {
    return {
      obs_id: pair.target.obs_id,
      kind: "settlement",
      amount: pair.target.payload.amount,
      bank_value_date: pair.bank_value_date,
      anchored_members: anchored,
    };
  }
  if (pair.target.kind === "bank_line") {
    return {
      obs_id: pair.target.obs_id,
      kind: "bank_line",
      amount: pair.target.payload.amount,
      bank_value_date: pair.target.payload.value_date,
      anchored_members: anchored,
    };
  }
  return null;
}
