/**
 * `C1`–`C8` as naive per-candidate boolean checks.
 *
 * `PREREGISTRATION.md §5.2` fixes the shape: the engine implements these "as
 * fused, short-circuiting filters optimised for throughput"; the oracle
 * implements them "as naive per-candidate boolean checks over a fully enumerated
 * space: no ordering, no pruning, no early exit, no soft scoring, no LLM".
 *
 * Three properties of this module carry that requirement, and each is tested:
 *
 *   1. **One exported function per constraint.** Nothing is fused. A caller can
 *      evaluate `C5` without evaluating `C1`.
 *   2. **`checkAll` never short-circuits.** It evaluates all eight on every
 *      candidate, including candidates the first constraint already rejects,
 *      because `§5.3`'s consistency gate compares the two implementations
 *      "constraint by constraint" and a verdict that was not computed is a
 *      verdict that cannot be compared.
 *   3. **No predicate here is imported from anywhere else.** In particular
 *      `C5` is re-implemented rather than delegated to
 *      `@assay/domain`'s `checkReconLineInvariants`, which computes the same
 *      arithmetic for the ingest stage. Sharing it would make the engine and the
 *      oracle one implementation for `C5` and the consistency gate would compare
 *      that function with itself — the defect `ARCHITECTURE.md §7.2` exists to
 *      prevent. The declaration in `constraints.decl.ts` is shared; the
 *      predicates are not.
 */

import { CONSTRAINT_IDS, type ConstraintId } from "@assay/domain";

import { SETTLEMENT_WINDOW_SECONDS } from "./frozen.js";
import type { MemberContribution, TargetContribution } from "./universe.js";

/**
 * A constraint's verdict on one candidate.
 *
 * Three values, not two. `NON_BINDING` means the clause could not be evaluated
 * on this candidate — `PREREGISTRATION.md §5.3` requires such clauses to be
 * "reported separately as *evaluated: non-binding*", because "a gate that cannot
 * fail on a constraint neither side can evaluate would otherwise report
 * agreement it never tested". It is **not** a pass: `isAdmissible` treats it as
 * neither satisfied nor violated.
 */
export type Verdict = "SATISFIED" | "NOT_SATISFIED" | "NON_BINDING";

/** A verdict for each of the eight constraints, in declaration order. */
export type ConstraintVerdicts = Readonly<Record<ConstraintId, Verdict>>;

/**
 * The facts a predicate needs that are not carried by the candidate itself.
 *
 * `C2`'s refund half is referential — it reads the recon line a refund's
 * `payment_id` names, which may not be a member — and `C7` is about allocations
 * already committed elsewhere in the run. Both are supplied by the caller rather
 * than looked up here, so this module holds no observation set and cannot
 * accidentally widen what a predicate reads.
 */
export interface CandidateContext {
  /** `entity_id` → `order_id`, over every recon-line-shaped observation. */
  readonly orderIdByEntity: ReadonlyMap<string, string | null>;
  /** Entities already belonging to an accepted allocation (`C7`). */
  readonly allocatedEntities: ReadonlySet<string>;
}

/** An empty context, for candidates evaluated outside a committed run. */
export function emptyContext(): CandidateContext {
  return { orderIdByEntity: new Map(), allocatedEntities: new Set() };
}

/** One candidate: a member set proposed as the members of one target. */
export interface Candidate {
  readonly target: TargetContribution;
  readonly members: readonly MemberContribution[];
}

const verdict = (ok: boolean): Verdict => (ok ? "SATISFIED" : "NOT_SATISFIED");

/**
 * `C1` — currency equality across all members **and the target**.
 *
 * The target's currency is `DATA_MODEL.md §11.1`'s declared `"INR"`, register
 * row M19; neither target entity carries the field. Note that `C1` cannot
 * exclude anything on a conforming dataset, because `currency` is a literal in
 * the frozen schema — that is a property of the data, not of this predicate,
 * and `§4.1` requires the excluded fraction to be reported so a reviewer can see
 * the clause doing nothing rather than assume it is doing something.
 */
export function checkC1(candidate: Candidate): Verdict {
  return verdict(candidate.members.every((m) => m.currency === candidate.target.currency));
}

/**
 * `C2` — type compatibility.
 *
 * **Refund half, binding.** `conventions.ts` `O-C2-REFUND` implements the
 * referential reading: a refund member's own `order_id` must equal the
 * `order_id` of the recon line its `payment_id` names, where that line is in the
 * observation set. A refund whose named parent is absent is not excluded on that
 * ground — absence is `E10`'s business, not `C2`'s.
 *
 * **Adjustment half, non-binding.** `§4.1` declares it a generation invariant:
 * `related_entity_id` "lives on the true-state `Adjustment` entity … which is
 * never an observation", so neither engine nor oracle can evaluate it. The half
 * returns `NON_BINDING` rather than a silent pass.
 *
 * The combined verdict is `NOT_SATISFIED` if the refund half fails, and
 * otherwise `SATISFIED` when a refund member was actually checked. A candidate
 * with no refund member exercises neither half, and the constraint reports
 * `NON_BINDING` on it — nothing about it was tested.
 */
export function checkC2(candidate: Candidate, context: CandidateContext): Verdict {
  const refunds = candidate.members.filter((m) => m.row_type === "refund");
  if (refunds.length === 0) return "NON_BINDING";
  for (const refund of refunds) {
    if (refund.payment_id === null) continue;
    if (!context.orderIdByEntity.has(refund.payment_id)) continue;
    const parentOrder = context.orderIdByEntity.get(refund.payment_id) ?? null;
    if (parentOrder !== refund.order_id) return "NOT_SATISFIED";
  }
  return "SATISFIED";
}

/**
 * `C3`'s **ordering half**, binding: `created_at <= settled_at` for every member.
 *
 * A `null` `settled_at` does **not** satisfy it — `RECONCILIATION_SPEC.md §4.1`,
 * ratified at spec 1.4.2: "a candidate member whose `settled_at` is null does
 * NOT satisfy `C3`, and does NOT satisfy `C4`. It is excluded from every
 * candidate." The rule is exclusion, never admission.
 */
export function checkC3Ordering(candidate: Candidate): Verdict {
  return verdict(
    candidate.members.every((m) => m.settled_at !== null && m.created_at <= m.settled_at),
  );
}

/**
 * `C3`'s **bank-arrival half**, binding where a bank line is in scope:
 * `settled_at <= bank.value_date` for every member.
 *
 * `§4.1` at spec 1.4.3 names the referent: "the bank line that receives the
 * **target's** money — the target itself when the target is a `bank_line`, and
 * its `AN2`-matched bank line when the target is a `settlement`". Where none is
 * in scope the half is `NON_BINDING`, per target rather than per dataset.
 */
export function checkC3BankArrival(candidate: Candidate): Verdict {
  const valueDate = candidate.target.value_date;
  if (valueDate === null) return "NON_BINDING";
  return verdict(
    candidate.members.every((m) => m.settled_at !== null && m.settled_at <= valueDate),
  );
}

/**
 * `C3` combined, for the eight-verdict record.
 *
 * A `NOT_SATISFIED` on either half fails the constraint. When the ordering half
 * passes and the bank-arrival half is out of scope, the constraint reports
 * `SATISFIED` — the half that *was* evaluable was satisfied — and the
 * bank-arrival half's own verdict is available separately through
 * {@link checkC3BankArrival} for `§5.3`'s conditional exclusion.
 */
export function checkC3(candidate: Candidate): Verdict {
  const ordering = checkC3Ordering(candidate);
  if (ordering === "NOT_SATISFIED") return "NOT_SATISFIED";
  const bank = checkC3BankArrival(candidate);
  if (bank === "NOT_SATISFIED") return "NOT_SATISFIED";
  return ordering;
}

/**
 * `C4` — settlement window: `settled_at − created_at ∈ [T_min, T_max]`.
 *
 * Measured in elapsed epoch seconds (`conventions.ts` `O-C4-UNIT`). A `null`
 * `settled_at` does not satisfy it, by the same spec-1.4.2 ratification `C3`
 * carries: "`C4` bounds a settlement window an unsettled member does not have".
 */
export function checkC4(candidate: Candidate): Verdict {
  return verdict(
    candidate.members.every((m) => {
      if (m.settled_at === null) return false;
      const gap = m.settled_at - m.created_at;
      return gap >= SETTLEMENT_WINDOW_SECONDS.min && gap <= SETTLEMENT_WINDOW_SECONDS.max;
    }),
  );
}

/**
 * `C5` — per-line arithmetic identity.
 *
 * `credit = amount − fee` for payments, where `fee` is GST-inclusive, and
 * `debit = amount` for refunds. Kind-typed in `§4.1`'s own text, so an
 * adjustment row exercises the third identity `DATA_MODEL.md §6` states for it:
 * exactly one of `debit`/`credit` is non-zero.
 *
 * **Deliberately not delegated.** `@assay/domain`'s `checkReconLineInvariants`
 * computes this same arithmetic for the ingest stage. Calling it would collapse
 * engine and oracle into one implementation for `C5`. See this module's header.
 */
export function checkC5(candidate: Candidate): Verdict {
  return verdict(
    candidate.members.every((m) => {
      switch (m.row_type) {
        case "payment":
          return m.credit === m.amount - m.fee && m.debit === 0;
        case "refund":
          return m.debit === m.amount && m.credit === 0 && m.fee === 0 && m.tax === 0;
        case "adjustment":
          return (m.debit !== 0) !== (m.credit !== 0);
      }
    }),
  );
}

/**
 * `C6` — exact tie-out, zero tolerance in paise.
 *
 * `Σ credit(members) − Σ debit(members) = target.amount`. `§4.1`: "Settlement
 * amounts are exact; a tolerance here is how false matches get admitted." The
 * only sanctioned source of a tolerance is `ROUND_BANK_AMOUNT`, which
 * `PREREGISTRATION.md §4.3` declares not exercised, so there is none here.
 *
 * The empty member set ties out only against a zero-amount target, which is the
 * correct reading rather than a special case.
 */
export function checkC6(candidate: Candidate): Verdict {
  let net = 0;
  for (const m of candidate.members) net += m.credit - m.debit;
  return verdict(net === candidate.target.amount);
}

/** `C7` — one-allocation: no member may already belong to an accepted allocation. */
export function checkC7(candidate: Candidate, context: CandidateContext): Verdict {
  return verdict(!candidate.members.some((m) => context.allocatedEntities.has(m.entity_id)));
}

/**
 * `C8` — `on_hold === false` for members claimed as settled.
 *
 * `§4.1` declares it **expected-non-binding on v1.0.0 data**: `on_hold` is a
 * Route concept and Route is out of Tier-0 scope, so no conforming line carries
 * it true. It is still *evaluated* here — the declaration says the clause
 * excludes nothing, not that it cannot be computed — and `§5.3` excludes it from
 * the consistency gate's pass criterion on the declaration, not on this verdict.
 */
export function checkC8(candidate: Candidate): Verdict {
  return verdict(candidate.members.every((m) => m.on_hold === false));
}

/**
 * Evaluate all eight constraints. **Never short-circuits.**
 *
 * Every constraint is evaluated on every candidate, including candidates an
 * earlier constraint already rejected. `§5.3` compares the engine's and the
 * oracle's verdicts "constraint by constraint"; a verdict that was not computed
 * is a verdict that cannot be compared, and an implementation that stopped early
 * would silently narrow the differential test.
 */
export function checkAll(candidate: Candidate, context: CandidateContext): ConstraintVerdicts {
  return Object.freeze({
    C1: checkC1(candidate),
    C2: checkC2(candidate, context),
    C3: checkC3(candidate),
    C4: checkC4(candidate),
    C5: checkC5(candidate),
    C6: checkC6(candidate),
    C7: checkC7(candidate, context),
    C8: checkC8(candidate),
  });
}

/**
 * Whether a verdict record admits the candidate.
 *
 * A candidate is admissible when no constraint returned `NOT_SATISFIED`.
 * `NON_BINDING` is not a pass and not a failure: it records that the clause had
 * nothing to say about this candidate, which is exactly what `§5.3` wants
 * reported apart rather than folded into agreement.
 */
export function isAdmissible(verdicts: ConstraintVerdicts): boolean {
  return CONSTRAINT_IDS.every((id) => verdicts[id] !== "NOT_SATISFIED");
}
