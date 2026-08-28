/**
 * Stage S1 — anchor matching, naively.
 *
 * `RECONCILIATION_SPEC.md §3`: "Anchors are **facts**, not hypotheses. They are
 * established by exact equality on a strong key, and they are not subject to
 * scoring or LLM involvement." And: "**Everything anchored is removed from the
 * search space.**"
 *
 * The oracle needs anchoring for two reasons, both structural rather than
 * performance-driven. `§4` generates candidates "for each **unanchored**
 * target", so what counts as unanchored has to be decided before enumeration
 * begins; and `C3`'s bank-arrival half reads the bank line `AN2` identifies, so
 * without `AN2` that half is out of scope on every settlement target.
 *
 * **Scope.** `conventions.ts` `O-ANCHOR-SCOPE`: `AN1` and `AN2` only. `AN3`
 * (refund → payment) and `AN4` (payment → order) are referential facts about
 * reference-kind observations; neither is member-eligible under
 * `DATA_MODEL.md §11.1`, so neither removes anything from the settlement search
 * space. `AN5` is retired by `§3` at spec 1.4.1 and is not implemented — there
 * is deliberately no code path here that reads `order.receipt` or
 * `order_ref`, which `DATA_MODEL.md §0` rule 4 quarantines.
 */

import type { Observation } from "@assay/domain";

/**
 * `§2` step 4's normalization, applied to a UTR.
 *
 * "UTRs upper-cased and stripped of non-alphanumerics **into a derived field**,
 * leaving the raw value intact." The raw value is never mutated here; this
 * returns the derived form.
 */
export function normalizeUtr(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** One `AN2` match: a settlement and the bank line that carried it. */
export interface BankAnchor {
  readonly settlement_id: string;
  readonly bank_line_id: string;
  readonly value_date: number;
}

/**
 * `AN2` — settlement → bank line.
 *
 * `§3`'s key: "`normalize(settlement.utr) === normalize(bank_ref)` **and amount
 * equal**". Both conjuncts are required; `§3` is explicit that the amount clause
 * exists because ASSAY's treatment of the UTR as a unique key is
 * `[ASSAY-MODEL]` and "Razorpay asserts no uniqueness".
 *
 * **One-allocation is enforced (`I2`).** `§3`: "An anchor is **rejected** if it
 * would violate the one-allocation invariant (`I2`) — i.e. if the target is
 * already anchored to a different source. A rejected anchor becomes
 * `E08`/`E09`/`E14`, never a silent overwrite." A settlement matching two bank
 * lines, or a bank line matching two settlements, yields **no** anchor for
 * either and is reported as a collision rather than resolved by first-wins.
 */
export function anchorBankLines(observations: readonly Observation[]): {
  readonly anchors: readonly BankAnchor[];
  readonly collisions: readonly string[];
} {
  const settlements = observations.filter(
    (o): o is Extract<Observation, { kind: "settlement" }> => o.kind === "settlement",
  );
  const bankLines = observations.filter(
    (o): o is Extract<Observation, { kind: "bank_line" }> => o.kind === "bank_line",
  );

  const pairs: BankAnchor[] = [];
  for (const s of settlements) {
    const utr = normalizeUtr(s.payload.utr);
    for (const b of bankLines) {
      if (b.payload.bank_ref === null) continue;
      if (normalizeUtr(b.payload.bank_ref) !== utr) continue;
      if (b.payload.amount !== s.payload.amount) continue;
      pairs.push({
        settlement_id: s.payload.id,
        bank_line_id: b.payload.bank_line_id,
        value_date: b.payload.value_date,
      });
    }
  }

  const bySettlement = new Map<string, number>();
  const byBankLine = new Map<string, number>();
  for (const p of pairs) {
    bySettlement.set(p.settlement_id, (bySettlement.get(p.settlement_id) ?? 0) + 1);
    byBankLine.set(p.bank_line_id, (byBankLine.get(p.bank_line_id) ?? 0) + 1);
  }

  const anchors: BankAnchor[] = [];
  const collisions: string[] = [];
  for (const p of pairs) {
    const oneEach =
      (bySettlement.get(p.settlement_id) ?? 0) === 1 && (byBankLine.get(p.bank_line_id) ?? 0) === 1;
    if (oneEach) anchors.push(p);
    else collisions.push(`${p.settlement_id}~${p.bank_line_id}`);
  }
  return { anchors: Object.freeze(anchors), collisions: Object.freeze([...new Set(collisions)]) };
}

/**
 * `AN1` — recon line → settlement, by `recon_line.settlement_id === settlement.id`.
 *
 * Returns the entity ids for which an anchor is **established**. A line whose
 * `settlement_id` names a settlement absent from the observation set does not
 * establish one: `§3` establishes anchors *"by exact equality on a strong
 * key"*, and a key with no referent matches nothing to be equal to.
 *
 * **This is the anchor-establishment test, and it is not the test the
 * enumerator applies at the pool boundary.** `enumerate.ts`'s
 * {@link unanchoredMembers} asks the narrower question *"is this line outside
 * §3's search space"* and answers it with `settlement_id !== null`. The two are
 * **extensionally identical on every conforming dataset** — `conventions.ts`
 * `O-ANCHOR-TEST` carries the derivation from `PREREGISTRATION.md §4.2` and
 * `§4.3`, which together admit no way for a non-null `settlement_id` to name an
 * absent settlement.
 *
 * They are written separately rather than unified because they answer different
 * questions and only one of them can be answered from a single row: this
 * function needs the whole observation set to check the referent, the pool
 * filter needs only the row. Where they could differ — a hand-built fixture
 * carrying a dangling id — `O-ANCHOR-TEST` records which one governs and why
 * that input is outside the declared population. Neither reading is applied
 * silently.
 */
export function anchoredEntities(observations: readonly Observation[]): ReadonlySet<string> {
  const settlementIds = new Set(
    observations.filter((o) => o.kind === "settlement").map((o) => o.payload.id),
  );
  const anchored = new Set<string>();
  for (const o of observations) {
    if (o.kind !== "recon_line" && o.kind !== "adjustment") continue;
    const sid = o.payload.settlement_id;
    if (sid !== null && settlementIds.has(sid)) anchored.add(o.payload.entity_id);
  }
  return anchored;
}

/**
 * The `AN1`-anchored net a settlement already has, per settlement id.
 *
 * `§4` searches for "a settlement **needing constituents**". A settlement whose
 * anchored members already tie out to its amount needs none, and the residual a
 * search must close is `target.amount − anchoredNet`. This is `C6` applied to
 * the unanchored remainder rather than a new rule: `§3` removes the anchored
 * members from the search space, so what is left to explain is what they do not
 * already account for.
 */
export function anchoredNetBySettlement(
  observations: readonly Observation[],
): ReadonlyMap<string, number> {
  const net = new Map<string, number>();
  const settlementIds = new Set(
    observations.filter((o) => o.kind === "settlement").map((o) => o.payload.id),
  );
  for (const o of observations) {
    if (o.kind !== "recon_line" && o.kind !== "adjustment") continue;
    const sid = o.payload.settlement_id;
    if (sid === null || !settlementIds.has(sid)) continue;
    net.set(sid, (net.get(sid) ?? 0) + o.payload.credit - o.payload.debit);
  }
  return net;
}
