import type { Observation, ObservationId } from "@assay/domain";

import { MEMBER_ELIGIBLE_KINDS } from "./frozen.js";

/** `Observation` narrowed to one `kind` — the discriminated union of `DATA_MODEL.md §10`. */
type Obs<K extends Observation["kind"]> = Extract<Observation, { kind: K }>;

/**
 * Stage `S1` — anchor matching (`RECONCILIATION_SPEC.md §3`).
 *
 * *"Anchors are **facts**, not hypotheses. They are established by exact
 * equality on a strong key, and they are not subject to scoring or LLM
 * involvement."*
 *
 * This module is a **pure function over an already-read observation set**. It
 * reads no file, opens no socket, calls no clock and draws no random number:
 * `ARCHITECTURE.md §3` gives this package *"Stages S1-S5. Pure functions, no
 * I/O, no network"*, and stage `S0` — which does the reading — belongs to
 * `packages/domain` from spec 1.4.18 (`§22.2` M32).
 *
 * **`AN1` is implemented literally, referent check included.** `§3` states the
 * key as `recon_line.settlement_id === settlement.id`, so a line is anchored
 * only when the settlement it names is actually present. `packages/oracle`
 * ratified the cheaper `settlement_id !== null` test as *equivalent on a
 * conforming dataset* (`O-ANCHOR-TEST`), registering that a hand-built fixture
 * with a dangling id separates them. Implementing the literal key here keeps
 * the two implementations genuinely independent, which is the whole point of
 * `ARCHITECTURE.md §7.2`'s consistency gate; on conforming data they agree.
 *
 * **`AN5` has no code path.** `§3` strikes the row through — *"NOT EXERCISED at
 * spec 1.4.1 ... The anchor set is `AN1`-`AN4`"* — for two independent reasons,
 * the first being that `order.receipt` is quarantined and this package *cannot*
 * import it.
 */

/** `§3`'s anchor table, less the struck-through `AN5`. */
export const ANCHOR_IDS = Object.freeze(["AN1", "AN2", "AN3", "AN4"] as const);

/** One of `§3`'s four exercised anchors. */
export type AnchorId = (typeof ANCHOR_IDS)[number];

/**
 * The exception classes an `S1` collision produces.
 *
 * `§3`: *"A rejected anchor becomes `E08`/`E09`/`E14`, never a silent
 * overwrite."* Two of the three are reachable from this stage. `E08` is **not**:
 * `§8` assigns it to the ingest level — *"`ingest_hash` collision within a
 * source"* — which is `S0`'s, and `S1` sees observations that ingest already
 * accepted. Emitting `E08` here would duplicate a check this stage cannot
 * perform correctly, since it never saw the source rows.
 */
export type AnchorExceptionClass =
  | "E09_DUPLICATE_BANK_CREDIT"
  | "E14_UTR_COLLISION";

/** An established anchor: an exact-equality fact between two observations. */
export interface AnchorLink {
  readonly anchor: AnchorId;
  readonly source_obs_id: ObservationId;
  readonly target_obs_id: ObservationId;
}

/**
 * An anchor refused because establishing it would violate `I2`.
 *
 * `§3`: *"An anchor is **rejected** if it would violate the one-allocation
 * invariant (`I2`) — i.e. if the target is already anchored to a different
 * source."* `obs_ids` carries every observation in the colliding group, sorted,
 * so the record names the whole collision rather than an arbitrary survivor.
 */
export interface AnchorRejection {
  readonly anchor: AnchorId;
  readonly exception: AnchorExceptionClass;
  readonly obs_ids: readonly ObservationId[];
}

export interface AnchorResult {
  /** Established anchors, sorted by `(anchor, source_obs_id, target_obs_id)`. */
  readonly links: readonly AnchorLink[];
  /** `I2` collisions, sorted by `(anchor, exception, first obs_id)`. */
  readonly rejections: readonly AnchorRejection[];
  /** Every observation that an established anchor touches, sorted. */
  readonly anchored_obs_ids: readonly ObservationId[];
  /**
   * `§5`'s node set: member-eligible observations that `AN1` did **not**
   * anchor. `§3`: *"Everything anchored is removed from the search space."*
   */
  readonly unanchored_member_obs_ids: readonly ObservationId[];
}

/**
 * `§2` step 4: *"UTRs upper-cased and stripped of non-alphanumerics"*.
 *
 * `§3`'s `AN2` key is written as `normalize(settlement.utr) ===
 * normalize(bank_ref)`, applying the transform at comparison time, which is
 * what this function is for. `§2` additionally directs `S0` to store the result
 * *"into a derived field, leaving the raw value intact"* — **no schema carries
 * such a field**, so nothing downstream can read one. The comparison is exact
 * either way; see this package's README for the discrepancy.
 *
 * `toUpperCase()` is called without a locale argument on a string already
 * reduced to `[0-9A-Z]`, so no locale-dependent mapping can apply.
 */
export function normalizeUtr(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const isDigit = ch >= "0" && ch <= "9";
    const isUpper = ch >= "A" && ch <= "Z";
    const isLower = ch >= "a" && ch <= "z";
    if (isDigit || isUpper) out += ch;
    else if (isLower) out += String.fromCharCode(ch.charCodeAt(0) - 32);
  }
  return out;
}

function isMemberEligible(o: Observation): boolean {
  return (MEMBER_ELIGIBLE_KINDS as readonly string[]).includes(o.kind);
}

const byId = (a: ObservationId, b: ObservationId): number =>
  a < b ? -1 : a > b ? 1 : 0;

function sortedIds(ids: Iterable<ObservationId>): ObservationId[] {
  return [...ids].sort(byId);
}

/**
 * Establish `§3`'s anchors over an observation set.
 *
 * Deterministic and order-independent: every grouping is keyed by value, every
 * output is sorted by identifier, and no iteration order over an unordered
 * collection reaches a result. `DATA_MODEL.md §16` requires exactly that of
 * anything whose identifiers enter the hashed event body.
 */
export function anchor(observations: readonly Observation[]): AnchorResult {
  const links: AnchorLink[] = [];
  const rejections: AnchorRejection[] = [];

  // --- indexes, all keyed by value rather than by position -----------------
  const settlementByEntityId = new Map<string, Obs<"settlement">>();
  const paymentByEntityId = new Map<string, Obs<"payment">>();
  const orderByEntityId = new Map<string, Obs<"order">>();
  const settlements: Obs<"settlement">[] = [];
  const bankLines: Obs<"bank_line">[] = [];

  for (const o of observations) {
    switch (o.kind) {
      case "settlement":
        settlementByEntityId.set(o.payload.id, o);
        settlements.push(o);
        break;
      case "payment":
        paymentByEntityId.set(o.payload.id, o);
        break;
      case "order":
        orderByEntityId.set(o.payload.id, o);
        break;
      case "bank_line":
        bankLines.push(o);
        break;
      default:
        break;
    }
  }

  // --- AN1 · recon line -> settlement --------------------------------------
  // `recon_line.settlement_id === settlement.id`, referent required.
  const an1Anchored = new Set<ObservationId>();
  for (const o of observations) {
    if (o.kind !== "recon_line" && o.kind !== "adjustment") continue;
    const settlementId = o.payload.settlement_id;
    if (settlementId === null) continue;
    const target = settlementByEntityId.get(settlementId);
    if (target === undefined) continue;
    links.push({
      anchor: "AN1",
      source_obs_id: o.obs_id,
      target_obs_id: target.obs_id,
    });
    an1Anchored.add(o.obs_id);
  }

  // --- AN2 · settlement -> bank line ---------------------------------------
  // `normalize(settlement.utr) === normalize(bank_ref)` AND amount equal.
  //
  // Two distinct I2 collisions live here, and `§3`/`§8` name them separately:
  //
  //   E09  two BANK LINES share (normalized UTR, amount) -- `§8` rule 3, "two
  //        credits with the same normalized UTR and amount", the LATER one
  //        "held in Suspense rather than netted".
  //   E14  two SETTLEMENTS match one bank line on the same key -- `§3`: the
  //        UTR is ASSAY's uniqueness assumption, "which is why the anchor also
  //        requires amount equality, and why E14_UTR_COLLISION exists".
  const keyOf = (utr: string, amount: number): string =>
    `${normalizeUtr(utr)} ${String(amount)}`;

  const bankByKey = new Map<string, Obs<"bank_line">[]>();
  for (const b of bankLines) {
    const ref = b.payload.bank_ref;
    if (ref === null) continue;
    const key = keyOf(ref, b.payload.amount);
    const bucket = bankByKey.get(key);
    if (bucket === undefined) bankByKey.set(key, [b]);
    else bucket.push(b);
  }

  const settlementByKey = new Map<string, Obs<"settlement">[]>();
  for (const s of settlements) {
    const key = keyOf(s.payload.utr, s.payload.amount);
    const bucket = settlementByKey.get(key);
    if (bucket === undefined) settlementByKey.set(key, [s]);
    else bucket.push(s);
  }

  for (const [key, bucket] of settlementByKey) {
    const banks = bankByKey.get(key);
    if (banks === undefined) continue;

    // E14 first: if the key names more than one settlement, no bank line on it
    // can be attributed, so no AN2 link is established for any of them.
    if (bucket.length > 1) {
      rejections.push({
        anchor: "AN2",
        exception: "E14_UTR_COLLISION",
        obs_ids: sortedIds(bucket.map((o) => o.obs_id)),
      });
      continue;
    }

    // E09: one settlement, but the bank credited it more than once. `§8` holds
    // the LATER credit -- ordered by value_date, then by obs_id so that two
    // credits sharing a value date still order deterministically.
    const ordered = [...banks].sort((x, y) => {
      const dx = x.payload.value_date;
      const dy = y.payload.value_date;
      if (dx !== dy) return dx - dy;
      return byId(x.obs_id, y.obs_id);
    });
    const [earliest, ...later] = ordered;
    if (earliest === undefined) continue;

    const settlement = bucket[0];
    if (settlement === undefined) continue;

    links.push({
      anchor: "AN2",
      source_obs_id: settlement.obs_id,
      target_obs_id: earliest.obs_id,
    });

    if (later.length > 0) {
      rejections.push({
        anchor: "AN2",
        exception: "E09_DUPLICATE_BANK_CREDIT",
        obs_ids: sortedIds(later.map((o) => o.obs_id)),
      });
    }
  }

  // --- AN3 · refund -> payment ---------------------------------------------
  // --- AN4 · payment -> order ----------------------------------------------
  //
  // Established as FACTS and reported, but INERT for the search space:
  // `DATA_MODEL.md §11.1` makes `recon_line` and `adjustment` the only
  // member-eligible kinds and `§17.1.1` fixes the target universe as
  // `settlement` and `bank_line`, so neither anchor touches a member or a
  // target. Nothing they anchor was ever in the pool to be removed from.
  for (const o of observations) {
    if (o.kind === "refund") {
      const target = paymentByEntityId.get(o.payload.payment_id);
      if (target !== undefined) {
        links.push({
          anchor: "AN3",
          source_obs_id: o.obs_id,
          target_obs_id: target.obs_id,
        });
      }
    } else if (o.kind === "payment") {
      // `Payment.order_id` is nullable: DATA_MODEL.md §3 admits a payment with
      // no order, and AN4's key cannot be evaluated for one.
      const orderId = o.payload.order_id;
      const target = orderId === null ? undefined : orderByEntityId.get(orderId);
      if (target !== undefined) {
        links.push({
          anchor: "AN4",
          source_obs_id: o.obs_id,
          target_obs_id: target.obs_id,
        });
      }
    }
  }

  // --- outputs, all deterministically ordered ------------------------------
  links.sort(
    (a, b) =>
      (a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0) ||
      byId(a.source_obs_id, b.source_obs_id) ||
      byId(a.target_obs_id, b.target_obs_id),
  );
  rejections.sort(
    (a, b) =>
      (a.anchor < b.anchor ? -1 : a.anchor > b.anchor ? 1 : 0) ||
      (a.exception < b.exception ? -1 : a.exception > b.exception ? 1 : 0) ||
      byId(a.obs_ids[0] ?? ("" as ObservationId), b.obs_ids[0] ?? ("" as ObservationId)),
  );

  const anchored = new Set<ObservationId>();
  for (const l of links) {
    anchored.add(l.source_obs_id);
    anchored.add(l.target_obs_id);
  }

  const unanchoredMembers = observations
    .filter((o) => isMemberEligible(o) && !an1Anchored.has(o.obs_id))
    .map((o) => o.obs_id);

  return {
    links: Object.freeze(links),
    rejections: Object.freeze(rejections),
    anchored_obs_ids: Object.freeze(sortedIds(anchored)),
    unanchored_member_obs_ids: Object.freeze(sortedIds(unanchoredMembers)),
  };
}
