import type { Observation, ObservationId } from "@assay/domain";

import { TARGET_KINDS } from "./frozen.js";
import type { AnchorResult } from "./s1-anchor.js";
import {
  isMember,
  parentOrderIdResolver,
  type EvaluationContext,
  type Member,
  type Target,
} from "./s2-candidates.js";

/**
 * The `S1` → `S2` seam — `S2`'s `Target` and `EvaluationContext`, constructed
 * from `S1`'s `AnchorResult` and the observation set it was computed over.
 *
 * `apps/cli`'s `run` command records the gap this module closes: *"packages/engine
 * exports anchor(), generateCandidates(), decompose(), solve() and validate(), and
 * NO constructor for S2's `Target` or `EvaluationContext` from S1's AnchorResult …
 * Both are readings of `§3`'s anchor semantics; deriving them there would put
 * S1/S2 semantics in apps/cli, which `ARCHITECTURE.md §3` forbids."* They are
 * derived here instead, from the `AN1`/`AN2` links `S1` actually established —
 * never re-derived from a key `S1` already evaluated, so an anchor `S1` refused
 * (`E09`, `E14`) cannot re-enter through this door.
 *
 * **Pure, like every other stage in this package.** A function of its arguments
 * alone: no file, no socket, no clock, no random number, and no new dependency.
 * `ARCHITECTURE.md §3` gives this package *"Stages S1-S5. Pure functions, no I/O,
 * no network"*, and this module sits between two of them.
 *
 * **It changes no stage.** `S1` and `S2` are untouched; `C1`–`C8`, the
 * co-settlement rule and every frozen constant keep the values they had. What
 * was missing was never a constraint — it was the boundary that decides *which
 * observations are targets at all* and *what each target already carries*.
 *
 * ---
 *
 * ### Target selection — `§4`'s *"unanchored target"*
 *
 * `RECONCILIATION_SPEC.md §4`: *"For each **unanchored** target (a settlement
 * needing constituents, or a bank line needing settlements), generate candidate
 * member sets subject to hard constraints."* The parenthetical is the definition
 * of the adjective, and `§3` supplies the licence to act on it: *"Everything
 * anchored is removed from the search space. In a realistic batch this is 85–95%
 * of records, and it is what makes the residual tractable. The percentage of
 * records resolved by anchor alone is a reported metric."*
 *
 * ```
 *   settlement   a target UNLESS AN1 already anchored at least one member to it
 *                AND those anchored members already satisfy C6 --
 *                "Sigma credit(members) - Sigma debit(members) = target.amount"
 *                -- in which case it needs no constituents.
 *
 *   bank_line    a target UNLESS AN2 matched it to a settlement, in which case
 *                it needs no settlements.
 * ```
 *
 * **The exclusion is licensed by an anchor and by nothing else.** A settlement
 * that no `AN1` link touches stays a target however its arithmetic reads, because
 * `§3` removes what an *anchor* established, and nothing anchored it. That is why
 * the settlement rule is conjunctive rather than a bare `C6` test: the degenerate
 * zero-amount settlement with no anchored member satisfies `Σ ∅ = 0 = amount`, and
 * retiring it here would be this module deciding a settlement's fate on arithmetic
 * no anchor supports. It stays a target and reaches `§9` on its own evidence.
 *
 * **The bank-line rule is forced twice over.** `DATA_MODEL.md §11.1` states the
 * consequence of a `bank_line` target directly — *"a `bank_line` target has **no
 * admissible member** … such a target reaches `EXCEPTION` by `§9`'s 'no admissible
 * candidate exists at all', with class `E03`"* — and `PREREGISTRATION.md §10` V18
 * states that *"`AN2` is therefore the only route by which a bank line reaches
 * `RECONCILED`"*. An `AN2`-matched bank line kept as a target would draw the empty
 * candidate set and reach `E03_BANK_CREDIT_UNMATCHED` — *"Bank credit maps to no
 * known settlement"* (`DATA_MODEL.md §15`) — on a credit whose settlement `S1`
 * named as a fact. Excluding it is what makes V18's route exist; keeping the
 * unmatched ones is what makes `§11.1`'s `E03` reachable.
 *
 * **`S2`'s enumeration is not touched, and does not need to be.** `S2` enumerates
 * subsets from `mask = 1`, so the empty proposed set is never a candidate. That is
 * correct there: a candidate proposing nothing is not a proposal, and the one case
 * where the empty proposal is the whole answer — a settlement whose anchored
 * members already tie out — is a settlement `§4` does not send to `S2` in the first
 * place. The case is handled by not selecting the target, which is where `§3` and
 * `§4` put it, rather than by widening an enumeration whose bound `§4.3` fixes.
 *
 * ### `Target.bank_value_date` — `§4.1`'s `C3` bank-arrival half
 *
 * `C3`'s second half binds *"where a bank line is in scope"*, and names the bank
 * line: *"the bank line that receives the **target's** money — the target itself
 * when the target is a `bank_line`, and its `AN2`-matched bank line when the
 * target is a `settlement`. Where no bank line is in scope the half is
 * *evaluated: non-binding* … **per target rather than per dataset**"*.
 *
 * ```
 *   bank_line target    the target's own BankStatementLine.value_date
 *   settlement target   value_date of the bank line named by the AN2 link whose
 *                       source is this settlement; null where S1 established none
 * ```
 *
 * `null` is the *"no bank line in scope"* case, and `S2`'s `c3BankArrival` reads
 * it as `NON_BINDING` — the per-target split `PREREGISTRATION.md §5.3` requires
 * the consistency gate to report. Reading the link rather than re-matching the
 * `UTR` is what keeps `§3`'s collision rulings intact: on `E14` no link exists and
 * the half is out of scope, and on `E09` `S1` linked the **earliest** credit while
 * *"the later one is held in Suspense rather than netted"* (`§8` rule 3).
 *
 * ### `Target.anchored_members` — `§3`'s removal, read exactly
 *
 * The members `AN1` anchored to this settlement: the source observations of every
 * `AN1` link whose target is it, sorted by `obs_id`. `§3` removes them from the
 * **search space** — `S1` already did that, in `unanchored_member_obs_ids` — not
 * from the settlement they belong to. `DATA_MODEL.md §11` fixes the distinction:
 * `Candidate.member_obs_ids` is *"the whole allocation, ANCHORED members
 * INCLUDED, because `§4.1`'s `C6` reads `Σ credit(members) − Σ debit(members) =
 * target.amount` over the allocation and not over a residual"*, while
 * `Component.member_obs_ids` is *"the UNANCHORED observation nodes"*. `S2`'s
 * `evaluate` unions the two sets itself; this module's job is to supply the first.
 *
 * A `bank_line` target carries none, and cannot: `AN1`'s target is a settlement,
 * and `DATA_MODEL.md §11.1` makes `recon_line` and `adjustment` the only
 * member-eligible kinds, so nothing in the corpus can be a bank line's member.
 *
 * ### What this module does **not** decide
 *
 * - **Terminal states.** Exclusion from the target set is not a decision. `§9`
 *   owns terminal states and `DATA_MODEL.md §17.1.1` owns the postings; the
 *   excluded observations are reported on `anchor_resolved` so that the caller
 *   can reach them rather than lose them — `§9`: *"nothing is dropped."*
 * - **`I2` beyond target coherence.** A malformed `AnchorResult` is refused only
 *   where it makes a `Target` ill-defined (below). `S1` adjudicates `I2` and emits
 *   `§3`'s rejections; re-adjudicating it here would be a second, quieter ruling.
 * - **`AN3`/`AN4`.** Inert for this boundary, exactly as they are for `S1`'s
 *   search space: neither touches a member-eligible kind or a target kind, so
 *   neither can reach a field constructed here.
 */

/** `Observation` narrowed to one `kind` — the discriminated union of `DATA_MODEL.md §10`. */
type Obs<K extends Observation["kind"]> = Extract<Observation, { kind: K }>;

/** `DATA_MODEL.md §17.1.1`: *"The target universe is settlements and bank lines"*. */
type TargetKind = (typeof TARGET_KINDS)[number];

type TargetObs = Obs<"settlement"> | Obs<"bank_line">;

/**
 * The ways an `AnchorResult` can fail to name a coherent `Target`.
 *
 * Every one of them is a contradiction between the anchor record and the
 * observation set it claims to be about. None is reachable from `anchor()` on any
 * observation set: they are the states a hand-assembled or corrupted upstream
 * value can hold, and this module refuses them rather than building a `Target`
 * whose `bank_value_date` or `anchored_members` would be quietly wrong.
 */
export type AnchorStateIncoherence =
  | "DUPLICATE_OBS_ID"
  | "ANCHOR_ENDPOINT_UNKNOWN"
  | "ANCHOR_ENDPOINT_WRONG_KIND"
  | "MEMBER_MULTIPLY_ANCHORED"
  | "BANK_LINE_AMBIGUOUS"
  | "POOL_ID_UNKNOWN"
  | "POOL_ID_NOT_MEMBER_ELIGIBLE"
  | "POOL_ID_ANCHORED";

/** Raised when `S1`'s output and the observation set cannot both be true. */
export class IncoherentAnchorStateError extends Error {
  readonly code: AnchorStateIncoherence;
  /** The observations the contradiction is about, sorted. */
  readonly obs_ids: readonly ObservationId[];

  constructor(
    code: AnchorStateIncoherence,
    obs_ids: readonly ObservationId[],
    detail: string,
  ) {
    super(`S1->S2 seam [${code}]: ${detail}`);
    this.name = "IncoherentAnchorStateError";
    this.code = code;
    this.obs_ids = Object.freeze([...obs_ids].sort());
  }
}

export interface SeamInput {
  /** The observation set `S1` ran over. `S0` produced it; this package never reads one. */
  readonly observations: readonly Observation[];
  /** `S1`'s output over exactly those observations. */
  readonly anchors: AnchorResult;
  /**
   * `C7`'s accepted-allocation set. **Empty at this boundary**, and defaulted so:
   * `§5` commits allocation *"in a single serialized pass after all components are
   * solved"*, so nothing is accepted when `S2` is first entered. It is a parameter
   * rather than a constant because the same construction is what a later pass —
   * or a re-solve after `§6.2`'s probe — needs, and inventing the set here would
   * make `C7` unable to bind.
   */
  readonly allocated?: ReadonlySet<ObservationId>;
}

/** Why a target-kind observation was not selected as a target. */
export type AnchorResolution = "AN1_ALREADY_TIED_OUT" | "AN2_MATCHED";

/**
 * A target-kind observation `§3`'s anchors already resolved, reported rather than
 * dropped — `§9`: *"Every observation reaches exactly one terminal state … nothing
 * is dropped"*, and close gate `G1` has no drop path.
 */
export interface AnchorResolvedTarget {
  readonly obs_id: ObservationId;
  readonly kind: TargetKind;
  readonly resolution: AnchorResolution;
}

export interface Seam {
  /** `§4`'s unanchored targets, sorted by `obs_id`. `S3`'s `DecomposeInput.targets`. */
  readonly targets: readonly Target[];
  /**
   * One context per target, in the same order — `contexts[i].target` is
   * `targets[i]`. `S2`'s `generateCandidates` takes one of these per target.
   */
  readonly contexts: readonly EvaluationContext[];
  /**
   * `§5`'s observation nodes: the member-eligible observations `AN1` did not
   * anchor, sorted by `obs_id`. `S2`'s member pool and `S3`'s `DecomposeInput.pool`.
   */
  readonly pool: readonly Member[];
  /** Target-kind observations an anchor resolved, sorted by `obs_id`. */
  readonly anchor_resolved: readonly AnchorResolvedTarget[];
}

const byId = (a: ObservationId, b: ObservationId): number =>
  a < b ? -1 : a > b ? 1 : 0;

function isTargetObs(o: Observation): o is TargetObs {
  return (TARGET_KINDS as readonly string[]).includes(o.kind);
}

/**
 * `§4.1`'s `C6` left-hand side, over the anchored allocation alone.
 *
 * Written as `C6` writes it — *"`Σ credit(members) − Σ debit(members)`"*, zero
 * tolerance, in paise — because the question this answers is `C6`'s own: whether
 * the settlement still needs constituents.
 */
function anchoredNet(members: readonly Member[]): number {
  let credit = 0;
  let debit = 0;
  for (const m of members) {
    credit += m.payload.credit;
    debit += m.payload.debit;
  }
  return credit - debit;
}

/**
 * Construct `S2`'s inputs from `S1`'s output.
 *
 * Deterministic and order-independent: every lookup is keyed by identifier, every
 * output array is sorted by identifier, and no iteration order over an unordered
 * collection reaches a result — the property `DATA_MODEL.md §16` requires of
 * anything whose identifiers enter the hashed event body.
 *
 * Throws `IncoherentAnchorStateError` where the anchor record and the observation
 * set contradict each other. It does not repair, default or skip: a `Target` built
 * from a contradiction would carry a `bank_value_date` or an `anchored_members`
 * set that no evidence supports, and `C3` and `C6` read both.
 */
export function buildSeam(input: SeamInput): Seam {
  const { observations, anchors } = input;

  // --- one observation per id ----------------------------------------------
  // Every resolution below is by obs_id; a repeated id makes each of them
  // ambiguous, and an anchored member counted twice breaks C6 by construction.
  const byObsId = new Map<ObservationId, Observation>();
  for (const o of observations) {
    if (byObsId.has(o.obs_id)) {
      throw new IncoherentAnchorStateError(
        "DUPLICATE_OBS_ID",
        [o.obs_id],
        `two observations carry ${o.obs_id}; every lookup on it is ambiguous`,
      );
    }
    byObsId.set(o.obs_id, o);
  }

  const endpoint = (
    id: ObservationId,
    anchorId: string,
    role: "source" | "target",
  ): Observation => {
    const o = byObsId.get(id);
    if (o === undefined) {
      throw new IncoherentAnchorStateError(
        "ANCHOR_ENDPOINT_UNKNOWN",
        [id],
        `${anchorId}'s ${role} names ${id}, which the observation set does not carry`,
      );
    }
    return o;
  };

  const wrongKind = (
    o: Observation,
    anchorId: string,
    role: "source" | "target",
    expected: string,
  ): IncoherentAnchorStateError =>
    new IncoherentAnchorStateError(
      "ANCHOR_ENDPOINT_WRONG_KIND",
      [o.obs_id],
      `${anchorId}'s ${role} ${o.obs_id} is a ${o.kind}; §3 keys it to a ${expected}`,
    );

  // --- AN1 · the anchored members of each settlement -----------------------
  // §3: `recon_line.settlement_id === settlement.id`. Keyed by the settlement's
  // OBSERVATION id, which is the namespace `Target.obs_id` lives in.
  const anchoredBySettlement = new Map<ObservationId, Map<ObservationId, Member>>();
  const settlementOfMember = new Map<ObservationId, ObservationId>();

  for (const link of anchors.links) {
    if (link.anchor !== "AN1") continue;
    const source = endpoint(link.source_obs_id, "AN1", "source");
    if (!isMember(source)) {
      // DATA_MODEL.md §11.1: recon_line and adjustment are the member-eligible
      // kinds. Anything else cannot supply C1/C3/C4/C5/C6/C8's quantities.
      throw wrongKind(source, "AN1", "source", "recon_line or adjustment");
    }
    const target = endpoint(link.target_obs_id, "AN1", "target");
    if (target.kind !== "settlement") {
      throw wrongKind(target, "AN1", "target", "settlement");
    }

    const prior = settlementOfMember.get(source.obs_id);
    if (prior !== undefined && prior !== target.obs_id) {
      // I2, the one-allocation invariant: §3 REJECTS such an anchor rather than
      // establishing both. A member in two allocations makes both targets wrong.
      throw new IncoherentAnchorStateError(
        "MEMBER_MULTIPLY_ANCHORED",
        [source.obs_id, prior, target.obs_id],
        `AN1 anchors member ${source.obs_id} to two settlements (${prior}, ${target.obs_id}), ` +
          `which §3 rejects under I2 rather than establishes`,
      );
    }
    settlementOfMember.set(source.obs_id, target.obs_id);

    let bucket = anchoredBySettlement.get(target.obs_id);
    if (bucket === undefined) {
      bucket = new Map<ObservationId, Member>();
      anchoredBySettlement.set(target.obs_id, bucket);
    }
    // Keyed by member id: an anchor is a fact, and a fact asserted twice is one
    // member, not two. C6 would double-count the second copy.
    bucket.set(source.obs_id, source);
  }

  // --- AN2 · the bank line that receives each settlement's money -----------
  const bankLineOfSettlement = new Map<ObservationId, Obs<"bank_line">>();
  const bankLinesMatched = new Set<ObservationId>();

  for (const link of anchors.links) {
    if (link.anchor !== "AN2") continue;
    const source = endpoint(link.source_obs_id, "AN2", "source");
    if (source.kind !== "settlement") {
      throw wrongKind(source, "AN2", "source", "settlement");
    }
    const target = endpoint(link.target_obs_id, "AN2", "target");
    if (target.kind !== "bank_line") {
      throw wrongKind(target, "AN2", "target", "bank_line");
    }

    const prior = bankLineOfSettlement.get(source.obs_id);
    if (prior !== undefined && prior.obs_id !== target.obs_id) {
      // C3's bank-arrival half names "THE bank line that receives the target's
      // money", singular. Two would leave `bank_value_date` undetermined, and
      // §3/§8 place the second credit in E09 rather than in a second link.
      throw new IncoherentAnchorStateError(
        "BANK_LINE_AMBIGUOUS",
        [source.obs_id, prior.obs_id, target.obs_id],
        `AN2 matches settlement ${source.obs_id} to two bank lines ` +
          `(${prior.obs_id}, ${target.obs_id}); C3's bank-arrival half names one`,
      );
    }
    bankLineOfSettlement.set(source.obs_id, target);
    bankLinesMatched.add(target.obs_id);
  }

  // --- the member pool · §5's observation nodes ----------------------------
  // S1 defines the field as "member-eligible observations that AN1 did not
  // anchor"; each claim is checked against the observation set rather than
  // trusted, because S2 enumerates over exactly this pool.
  const pool: Member[] = [];
  for (const id of [...new Set(anchors.unanchored_member_obs_ids)].sort(byId)) {
    const o = byObsId.get(id);
    if (o === undefined) {
      throw new IncoherentAnchorStateError(
        "POOL_ID_UNKNOWN",
        [id],
        `unanchored_member_obs_ids names ${id}, which the observation set does not carry`,
      );
    }
    if (!isMember(o)) {
      throw new IncoherentAnchorStateError(
        "POOL_ID_NOT_MEMBER_ELIGIBLE",
        [id],
        `unanchored_member_obs_ids names ${id}, a ${o.kind}; DATA_MODEL.md §11.1 admits ` +
          `only recon_line and adjustment`,
      );
    }
    if (settlementOfMember.has(id)) {
      throw new IncoherentAnchorStateError(
        "POOL_ID_ANCHORED",
        [id],
        `${id} is both AN1-anchored and in unanchored_member_obs_ids; §3 removes ` +
          `everything anchored from the search space`,
      );
    }
    pool.push(o);
  }

  // --- target selection ----------------------------------------------------
  const targets: Target[] = [];
  const anchorResolved: AnchorResolvedTarget[] = [];

  for (const o of observations) {
    if (!isTargetObs(o)) continue;

    if (o.kind === "settlement") {
      const bucket = anchoredBySettlement.get(o.obs_id);
      const anchored: Member[] =
        bucket === undefined
          ? []
          : [...bucket.values()].sort((a, b) => byId(a.obs_id, b.obs_id));

      // "A settlement needing constituents" (§4). One whose anchored members
      // already satisfy C6 needs none, and §3 removes it from the search space.
      if (anchored.length > 0 && anchoredNet(anchored) === o.payload.amount) {
        anchorResolved.push({
          obs_id: o.obs_id,
          kind: "settlement",
          resolution: "AN1_ALREADY_TIED_OUT",
        });
        continue;
      }

      const bank = bankLineOfSettlement.get(o.obs_id);
      targets.push({
        obs_id: o.obs_id,
        kind: "settlement",
        amount: o.payload.amount,
        bank_value_date: bank === undefined ? null : bank.payload.value_date,
        anchored_members: Object.freeze(anchored),
      });
      continue;
    }

    // "A bank line needing settlements" (§4). An AN2-matched one has its
    // settlement as a fact -- PREREGISTRATION.md §10 V18's only route by which a
    // bank line reaches RECONCILED -- so it is not searched for another.
    if (bankLinesMatched.has(o.obs_id)) {
      anchorResolved.push({
        obs_id: o.obs_id,
        kind: "bank_line",
        resolution: "AN2_MATCHED",
      });
      continue;
    }

    targets.push({
      obs_id: o.obs_id,
      kind: "bank_line",
      amount: o.payload.amount,
      // C3: "the target itself when the target is a bank_line".
      bank_value_date: o.payload.value_date,
      // DATA_MODEL.md §11.1: a settlement is not member-eligible, so a bank line
      // has no member of any kind, anchored or otherwise.
      anchored_members: Object.freeze([]),
    });
  }

  targets.sort((a, b) => byId(a.obs_id, b.obs_id));
  anchorResolved.sort((a, b) => byId(a.obs_id, b.obs_id));

  // --- contexts ------------------------------------------------------------
  // One resolver over the whole observation set, shared by every context: it is
  // a pure closure over the same data, and C2's precedence (M22) is a property
  // of the dataset rather than of the target.
  const parentOrderId = parentOrderIdResolver(observations);
  const allocated: ReadonlySet<ObservationId> =
    input.allocated ?? new Set<ObservationId>();

  const contexts: EvaluationContext[] = targets.map((target) => ({
    target,
    parentOrderId,
    allocated,
  }));

  return {
    targets: Object.freeze(targets),
    contexts: Object.freeze(contexts),
    pool: Object.freeze(pool),
    anchor_resolved: Object.freeze(anchorResolved),
  };
}
