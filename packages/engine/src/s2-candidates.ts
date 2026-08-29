import type { ConstraintId, Observation, ObservationId } from "@assay/domain";

import {
  MEMBER_ELIGIBLE_KINDS,
  SEARCH_BOUND,
  SETTLEMENT_WINDOW,
  TARGET_CURRENCY,
} from "./frozen.js";

/**
 * Stage `S2` — candidate generation under hard constraints
 * (`RECONCILIATION_SPEC.md §4`).
 *
 * *"For each unanchored **target** (a settlement needing constituents, or a bank
 * line needing settlements), generate candidate member sets subject to hard
 * constraints."* `§4.1`: the constraints are **filters** — *"they admit or
 * exclude, never rank"*.
 *
 * **This is the engine's own evaluation path.** `PREREGISTRATION.md §5.2` has
 * the engine and the oracle implement **one shared declaration** —
 * `@assay/domain`'s `constraints.decl.ts`, which this module reads for clause
 * identity and binding status — and `§5.3`'s consistency gate compares the two
 * implementations constraint by constraint. That comparison is worth nothing if
 * the two share a predicate, so every predicate below is written against `§4.1`
 * directly. Nothing is imported from `packages/oracle`; ESLint refuses it.
 */

/** `Observation` narrowed to one `kind`. */
type Obs<K extends Observation["kind"]> = Extract<Observation, { kind: K }>;

/** A member-eligible observation: `DATA_MODEL.md §11.1`'s two kinds. */
export type Member = Obs<"recon_line"> | Obs<"adjustment">;

/**
 * What a clause did on one candidate.
 *
 * `NOT_EVALUATED` and `NON_BINDING` are **different**, and `§4.1` keeps them
 * apart deliberately:
 *
 * - `NOT_EVALUATED` — the clause had no comparand on this candidate, so it
 *   *"is not evaluated and excludes nothing"*. `C2`'s refund half against a
 *   parent payment absent from the dataset is the frozen example; that absence
 *   is `E10_REFUND_ORPHAN`, *"not a `C2` exclusion"*.
 * - `NON_BINDING` — the clause is structurally unable to bind here. `C3`'s
 *   bank-arrival half where no bank line is in scope (*"evaluated:
 *   non-binding ... per target rather than per dataset"*), and `C2`'s
 *   adjustment half, whose `related_entity_id` `DATA_MODEL.md §10` makes
 *   unobservable.
 */
export type ClauseVerdict = "PASS" | "FAIL" | "NON_BINDING" | "NOT_EVALUATED";

export interface ClauseResult {
  readonly id: ConstraintId;
  /** `null` for a single-clause constraint; the half's name where `§4.1` splits one. */
  readonly half: string | null;
  readonly verdict: ClauseVerdict;
  /**
   * `true` where `§4.1` declares the clause **expected-non-binding on v1.0.0
   * data** — `C8`, and `C2`'s adjustment half. `PREREGISTRATION.md §5.3`
   * excludes these from the consistency gate, and `§4.1` requires *"the
   * fraction of candidates it excludes is reported so a reviewer can see that
   * it is doing nothing rather than assume it is doing something"*.
   */
  readonly expectedNonBinding: boolean;
}

export interface Admissibility {
  /** Every clause that could bind returned `PASS`. */
  readonly admissible: boolean;
  readonly clauses: readonly ClauseResult[];
  /** Constraints with at least one `FAIL`, deduplicated and ordered `C1`..`C8`. */
  readonly failed: readonly ConstraintId[];
  /**
   * `FAIL`s contributed **only** by expected-non-binding clauses. `§4.1` wants
   * these visible rather than folded into the pass/fail total, because a
   * non-zero count falsifies the expectation.
   */
  readonly failedExpectedNonBinding: readonly ConstraintId[];
  /**
   * Co-settlement coherence (`§4.1`, spec 1.4.3) — *"every member of a candidate
   * for a settlement target carries the same `settled_at`"*. **Not a ninth
   * constraint**: `§4.1` calls it *"the observable content of a field
   * definition"* and `constraints.decl.ts` gains no row for it, so it is
   * reported on its own field rather than as a `ClauseResult`.
   */
  readonly coSettlementCoherent: boolean;
}

/** The allocation target. `DATA_MODEL.md §17.1.1` fixes the universe at these two kinds. */
export interface Target {
  readonly obs_id: ObservationId;
  readonly kind: "settlement" | "bank_line";
  readonly amount: number;
  /**
   * `C3`'s bank-arrival half: the value date of *"the bank line that receives
   * the **target's** money — the target itself when the target is a
   * `bank_line`, and its `AN2`-matched bank line when the target is a
   * `settlement`"*. `null` puts the half out of scope for this target.
   */
  readonly bank_value_date: number | null;
  /**
   * Members `AN1` already anchored to this target. `C6` ties out over the
   * **whole** allocation, so a candidate proposes members to add to these
   * rather than to replace them (`§3`: *"everything anchored is removed from
   * the search space"* — removed from the SEARCH, not from the settlement).
   */
  readonly anchored_members: readonly Member[];
}

export interface EvaluationContext {
  readonly target: Target;
  /**
   * `C2`'s referential lookup. Given a refund member's `payment_id`, the
   * `order_id` of the payment it names, or `undefined` when the dataset holds
   * no such payment — in which case `§4.1` leaves the clause unevaluated.
   */
  readonly parentOrderId: (paymentId: string) => string | null | undefined;
  /** `C7`: observations already belonging to an accepted allocation. */
  readonly allocated: ReadonlySet<ObservationId>;
}

// ---------------------------------------------------------------------------
// Context construction
// ---------------------------------------------------------------------------

/**
 * Build `C2`'s parent-payment resolver from an observation set.
 *
 * **The `recon_line` governs**, ratified at spec 1.4.8 (`DATA_MODEL.md §22.2`
 * M22): *"Where both a `recon_line` carrying that `entity_id` and a `payment`
 * observation carrying that `id` are present, the `recon_line` governs."*
 * `§4.1` gives the reason — `§11.1` scopes a member's quantities to *"its own
 * observation payload and from no other source"*, and `§22.1` D10 makes the
 * recon report the source of settlement constituents, so reading the parent's
 * `order_id` from the `pg_payments` view would compare across two views whose
 * agreement nothing guarantees.
 */
export function parentOrderIdResolver(
  observations: readonly Observation[],
): (paymentId: string) => string | null | undefined {
  const fromReconLine = new Map<string, string | null>();
  const fromPayment = new Map<string, string | null>();

  for (const o of observations) {
    if (o.kind === "recon_line" || o.kind === "adjustment") {
      // A payment's recon line carries the payment's own id in entity_id.
      if (o.payload.type === "payment") {
        fromReconLine.set(o.payload.entity_id, o.payload.order_id);
      }
    } else if (o.kind === "payment") {
      fromPayment.set(o.payload.id, o.payload.order_id);
    }
  }

  return (paymentId: string): string | null | undefined => {
    if (fromReconLine.has(paymentId)) return fromReconLine.get(paymentId);
    if (fromPayment.has(paymentId)) return fromPayment.get(paymentId);
    return undefined;
  };
}

/** `DATA_MODEL.md §11.1`'s member-eligible kinds, and only those. */
export function isMember(o: Observation): o is Member {
  return (MEMBER_ELIGIBLE_KINDS as readonly string[]).includes(o.kind);
}

// ---------------------------------------------------------------------------
// The clauses — one function each, written against §4.1 directly
// ---------------------------------------------------------------------------

const CONSTRAINT_ORDER: readonly ConstraintId[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
];

/** `C1` — currency equality across all members **and the target**. */
function c1(members: readonly Member[]): ClauseVerdict {
  if (members.length === 0) return "NOT_EVALUATED";
  return members.every((m) => m.payload.currency === TARGET_CURRENCY)
    ? "PASS"
    : "FAIL";
}

/**
 * `C2` refund half — **referential**, spec 1.4.8.
 *
 * *"The refund member's own `order_id` must equal the `order_id` of the payment
 * its `payment_id` names, and that payment need not be a member of the same
 * candidate."* Absence of the named payment leaves the clause unevaluated.
 */
function c2Refund(
  members: readonly Member[],
  ctx: EvaluationContext,
): ClauseVerdict {
  let evaluated = false;
  for (const m of members) {
    if (m.payload.type !== "refund") continue;
    const parentId = m.payload.payment_id;
    if (parentId === null) continue; // no referent named: nothing to compare
    const parentOrderId = ctx.parentOrderId(parentId);
    if (parentOrderId === undefined) continue; // E10 territory, not a C2 exclusion
    evaluated = true;
    if (m.payload.order_id !== parentOrderId) return "FAIL";
  }
  return evaluated ? "PASS" : "NOT_EVALUATED";
}

/**
 * `C3` ordering half — `created_at <= settled_at` for every member.
 *
 * A null `settled_at` **does not satisfy** it (spec 1.4.2): *"an unconditional
 * filter whose bounded quantity does not exist cannot report that it is within
 * bounds ... `C3`'s ordering chain has a missing link."*
 */
function c3Ordering(members: readonly Member[]): ClauseVerdict {
  if (members.length === 0) return "NOT_EVALUATED";
  for (const m of members) {
    const settledAt = m.payload.settled_at;
    if (settledAt === null) return "FAIL";
    if (!(m.payload.created_at <= settledAt)) return "FAIL";
  }
  return "PASS";
}

/**
 * `C3` bank-arrival half — `settled_at <= bank.value_date`, **binding where a
 * bank line is in scope**. Out of scope it is *"evaluated: non-binding ... per
 * target rather than per dataset"*.
 */
function c3BankArrival(
  members: readonly Member[],
  ctx: EvaluationContext,
): ClauseVerdict {
  const valueDate = ctx.target.bank_value_date;
  if (valueDate === null) return "NON_BINDING";
  if (members.length === 0) return "NOT_EVALUATED";
  for (const m of members) {
    const settledAt = m.payload.settled_at;
    if (settledAt === null) return "FAIL";
    if (!(settledAt <= valueDate)) return "FAIL";
  }
  return "PASS";
}

/**
 * `C4` — `settled_at − created_at ∈ [T_min, T_max]`, evaluated in **elapsed
 * seconds** because both fields are `UnixSeconds`. Closed interval; a null
 * `settled_at` does not satisfy it (spec 1.4.2).
 */
function c4(members: readonly Member[]): ClauseVerdict {
  if (members.length === 0) return "NOT_EVALUATED";
  for (const m of members) {
    const settledAt = m.payload.settled_at;
    if (settledAt === null) return "FAIL";
    const elapsed = settledAt - m.payload.created_at;
    if (elapsed < SETTLEMENT_WINDOW.t_min_seconds) return "FAIL";
    if (elapsed > SETTLEMENT_WINDOW.t_max_seconds) return "FAIL";
  }
  return "PASS";
}

/**
 * `C5` — per-line arithmetic identity: `credit = amount − fee` for **payments**,
 * `debit = amount` for **refunds**.
 *
 * `§4.1` names two of `§6`'s three `type` values. **No identity is stated for
 * an `adjustment` line**, so the clause has no comparand on one and is left
 * unevaluated rather than given an invented form. See this package's README.
 */
function c5(members: readonly Member[]): ClauseVerdict {
  let evaluated = false;
  for (const m of members) {
    const p = m.payload;
    if (p.type === "payment") {
      evaluated = true;
      if (p.credit !== p.amount - p.fee) return "FAIL";
    } else if (p.type === "refund") {
      evaluated = true;
      if (p.debit !== p.amount) return "FAIL";
    }
  }
  return evaluated ? "PASS" : "NOT_EVALUATED";
}

/**
 * `C6` — exact tie-out, **allocation-wide**: `Σ credit − Σ debit = target.amount`
 * with **zero tolerance in paise**.
 *
 * The sum runs over the candidate's members **together with the target's
 * already-anchored members**. `§3` removes anchored lines from the *search
 * space*, not from the settlement they belong to, and `I4` makes a settlement
 * equal to its allocated lines — so a candidate that proposed only the
 * unanchored remainder and tied it out against the full `target.amount` would
 * be checking the wrong identity.
 */
function c6(members: readonly Member[], ctx: EvaluationContext): ClauseVerdict {
  const all = [...ctx.target.anchored_members, ...members];
  if (all.length === 0) return "NOT_EVALUATED";
  let credit = 0;
  let debit = 0;
  for (const m of all) {
    credit += m.payload.credit;
    debit += m.payload.debit;
  }
  return credit - debit === ctx.target.amount ? "PASS" : "FAIL";
}

/** `C7` — no member may already belong to an accepted allocation. */
function c7(members: readonly Member[], ctx: EvaluationContext): ClauseVerdict {
  if (members.length === 0) return "NOT_EVALUATED";
  for (const m of members) {
    if (ctx.allocated.has(m.obs_id)) return "FAIL";
  }
  return "PASS";
}

/**
 * `C8` — `on_hold === false` for members claimed as settled.
 *
 * **Evaluable, and expected-non-binding.** `on_hold` is an observable `§6`
 * field, so unlike `C2`'s adjustment half this clause *can* exclude; `§4.1`
 * retains it *"as a declared admissibility filter"* and expects it to fire on
 * nothing, Route being out of Tier-0 scope. Its verdict is therefore real and
 * is reported separately so a non-zero exclusion count is visible rather than
 * silently absorbed.
 *
 * The scope qualifier is `§4.1`'s own: `C8` alone is written *"for members
 * claimed as settled"*, which is why a member with a null `settled_at` is out
 * of its scope here while `C3` and `C4` remain unconditional over members.
 */
function c8(members: readonly Member[]): ClauseVerdict {
  let evaluated = false;
  for (const m of members) {
    if (m.payload.settled_at === null) continue;
    evaluated = true;
    if (m.payload.on_hold !== false) return "FAIL";
  }
  return evaluated ? "PASS" : "NOT_EVALUATED";
}

/**
 * Co-settlement coherence (`§4.1`, spec 1.4.3): every member of a candidate for
 * a **settlement** target carries the same `settled_at`.
 *
 * Reads members' own `settled_at` only — never the target's clock, which `§4.1`
 * explicitly refuses to re-base onto. Vacuous for a `bank_line` target and for
 * a candidate of fewer than two members.
 */
function coSettlementCoherent(
  members: readonly Member[],
  ctx: EvaluationContext,
): boolean {
  if (ctx.target.kind !== "settlement") return true;
  const all = [...ctx.target.anchored_members, ...members];
  let seen: number | null = null;
  for (const m of all) {
    const s = m.payload.settled_at;
    if (s === null) return false;
    if (seen === null) seen = s;
    else if (seen !== s) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Evaluate `C1`-`C8` and co-settlement coherence over one proposed member set. */
export function evaluate(
  members: readonly Member[],
  ctx: EvaluationContext,
): Admissibility {
  const clauses: ClauseResult[] = [
    { id: "C1", half: null, verdict: c1(members), expectedNonBinding: false },
    {
      id: "C2",
      half: "refund",
      verdict: c2Refund(members, ctx),
      expectedNonBinding: false,
    },
    {
      // `related_entity_id` lives on the true-state Adjustment entity, which
      // DATA_MODEL.md §10 never makes an observation. Neither the engine nor
      // the oracle can evaluate it; §4.1 calls it a generation invariant.
      id: "C2",
      half: "adjustment",
      verdict: "NON_BINDING",
      expectedNonBinding: true,
    },
    {
      id: "C3",
      half: "ordering",
      verdict: c3Ordering(members),
      expectedNonBinding: false,
    },
    {
      id: "C3",
      half: "bank-arrival",
      verdict: c3BankArrival(members, ctx),
      expectedNonBinding: false,
    },
    { id: "C4", half: null, verdict: c4(members), expectedNonBinding: false },
    { id: "C5", half: null, verdict: c5(members), expectedNonBinding: false },
    { id: "C6", half: null, verdict: c6(members, ctx), expectedNonBinding: false },
    { id: "C7", half: null, verdict: c7(members, ctx), expectedNonBinding: false },
    { id: "C8", half: null, verdict: c8(members), expectedNonBinding: true },
  ];

  const failedSet = new Set<ConstraintId>();
  const failedEnbSet = new Set<ConstraintId>();
  for (const c of clauses) {
    if (c.verdict !== "FAIL") continue;
    failedSet.add(c.id);
    if (c.expectedNonBinding) failedEnbSet.add(c.id);
  }

  const coherent = coSettlementCoherent(members, ctx);

  return {
    admissible: failedSet.size === 0 && coherent,
    clauses: Object.freeze(clauses),
    failed: Object.freeze(CONSTRAINT_ORDER.filter((id) => failedSet.has(id))),
    failedExpectedNonBinding: Object.freeze(
      CONSTRAINT_ORDER.filter((id) => failedEnbSet.has(id)),
    ),
    coSettlementCoherent: coherent,
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface Candidate {
  /**
   * **The whole allocation, anchored members included** — `DATA_MODEL.md §11`
   * (spec 1.4.6) states this explicitly, *"because `§4.1`'s `C6` reads
   * `Σ credit(members) − Σ debit(members) = target.amount` over the allocation
   * and not over a residual"*.
   *
   * This is **not** `Component.member_obs_ids`, which is the `§5` graph's
   * unanchored observation nodes and is a strict subset whenever any member is
   * anchored. `§11` calls the distinction load-bearing and states it once.
   */
  readonly member_obs_ids: readonly ObservationId[];
}

export type GenerationStatus = "COMPLETE" | "INTRACTABLE";

export interface CandidateSet {
  readonly candidates: readonly Candidate[];
  /**
   * `§4.3`: exceeding `K_max` members or `C_max` enumerated candidates yields
   * `solve_status: INTRACTABLE`. Reported rather than silently truncated —
   * *"ASSAY reports the bound it hit."*
   */
  readonly status: GenerationStatus;
  /** `§4.1`: the count of candidates an expected-non-binding clause excluded. */
  readonly excludedByExpectedNonBinding: number;
}

const byId = (a: ObservationId, b: ObservationId): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Generate every admissible candidate for one target from a member pool.
 *
 * **A `bank_line` target has the empty candidate set.** `DATA_MODEL.md §11.1`
 * (spec 1.4.4) makes `recon_line` and `adjustment` the only member-eligible
 * kinds, so `§4`'s *"a bank line needing settlements"* has no admissible member
 * — settlements are not members. `PREREGISTRATION.md §10` V18 records the
 * consequence; this function returns it rather than inventing a member kind.
 *
 * Deterministic: the pool is sorted by `obs_id`, subsets are enumerated in a
 * fixed order over that sorting, and the result is sorted canonically. No
 * iteration order over an unordered collection reaches the output.
 */
export function generateCandidates(
  pool: readonly Member[],
  ctx: EvaluationContext,
): CandidateSet {
  if (ctx.target.kind === "bank_line") {
    return {
      candidates: Object.freeze([]),
      status: "COMPLETE",
      excludedByExpectedNonBinding: 0,
    };
  }

  // Co-settlement coherence partitions the pool before enumeration: §4.1 calls
  // this "the bound PREREGISTRATION.md §5.2's budget already presupposes".
  // Members whose settled_at is null cannot satisfy C3 or C4 (spec 1.4.2) and
  // are dropped here rather than enumerated and rejected one subset at a time.
  const anchoredSettledAt =
    ctx.target.anchored_members.length > 0
      ? (ctx.target.anchored_members[0]?.payload.settled_at ?? null)
      : null;

  const classes = new Map<number, Member[]>();
  for (const m of [...pool].sort((a, b) => byId(a.obs_id, b.obs_id))) {
    const s = m.payload.settled_at;
    if (s === null) continue;
    if (anchoredSettledAt !== null && s !== anchoredSettledAt) continue;
    const bucket = classes.get(s);
    if (bucket === undefined) classes.set(s, [m]);
    else bucket.push(m);
  }

  const candidates: Candidate[] = [];
  let enumerated = 0;
  let excludedByEnb = 0;
  let status: GenerationStatus = "COMPLETE";

  for (const key of [...classes.keys()].sort((a, b) => a - b)) {
    const members = classes.get(key) ?? [];
    if (members.length > SEARCH_BOUND.k_max) {
      status = "INTRACTABLE";
      continue;
    }

    const total = 1 << members.length;
    for (let mask = 1; mask < total; mask += 1) {
      enumerated += 1;
      if (enumerated > SEARCH_BOUND.c_max) {
        status = "INTRACTABLE";
        break;
      }
      const subset: Member[] = [];
      for (let i = 0; i < members.length; i += 1) {
        const m = members[i];
        if (m !== undefined && (mask & (1 << i)) !== 0) subset.push(m);
      }
      const verdict = evaluate(subset, ctx);
      if (verdict.admissible) {
        // §11: the whole allocation, anchored members included.
        candidates.push({
          member_obs_ids: Object.freeze(
            [...ctx.target.anchored_members, ...subset]
              .map((m) => m.obs_id)
              .sort(byId),
          ),
        });
      } else if (
        verdict.failedExpectedNonBinding.length > 0 &&
        verdict.failed.length === verdict.failedExpectedNonBinding.length &&
        verdict.coSettlementCoherent
      ) {
        // Admissible but for an expected-non-binding clause: exactly the count
        // §4.1 requires be reported.
        excludedByEnb += 1;
      }
    }
    if (status === "INTRACTABLE") break;
  }

  candidates.sort((a, b) => {
    if (a.member_obs_ids.length !== b.member_obs_ids.length) {
      return a.member_obs_ids.length - b.member_obs_ids.length;
    }
    for (let i = 0; i < a.member_obs_ids.length; i += 1) {
      const x = a.member_obs_ids[i];
      const y = b.member_obs_ids[i];
      if (x === undefined || y === undefined) break;
      const c = byId(x, y);
      if (c !== 0) return c;
    }
    return 0;
  });

  return {
    candidates: Object.freeze(candidates),
    status,
    excludedByExpectedNonBinding: excludedByEnb,
  };
}
