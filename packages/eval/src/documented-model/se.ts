/**
 * `RECONCILIATION_SPEC.md §4.2`'s five soft-evidence signals, **as specified**
 * — a re-implementation of the DOCUMENTED model for bench-v2's documented
 * predicates (`docs/BENCH_V2_PREREGISTRATION.md §3`).
 *
 * **This is deliberately divergent from `packages/engine/src/s4-solve.ts`, and
 * it is not the oracle.** The engine hardcodes `SE1`, `SE2` and `SE4` to zero
 * and computes `SE5` only after a probe it has never dispatched
 * (`PREREGISTRATION.md §10` V37, V38). This module asks a different question:
 * *what would the specification's own model say about two admissible
 * allocations if every signal it names were computed as written?* The answer
 * is the finding `PREREGISTRATION.md §10` V40 records, and this module exists
 * so that finding is measured rather than argued.
 *
 * **Where the specification does not determine a scoring rule, this module
 * says so and computes nothing.** Each signal's status is one of:
 *
 * - `COMPUTED` — `§4.2` states a formula and it is implemented here verbatim.
 * - `TARGET_CONSTANT` — `§4.2` states the signal is target-scoped, so it takes
 *   one value across every allocation of a target and **cancels in every
 *   gap**. Its own scale is not needed for a gap and is not invented.
 * - `UNDETERMINABLE` — `§4.2` states, in its own words, that the function is
 *   not settled. The signal is **excluded** from the gap and **disclosed**,
 *   never carried as `0`: a zero would assert a score the specification does
 *   not make.
 *
 * ```
 *   signal  weight  status            ground (RECONCILIATION_SPEC.md §4.2)
 *   SE1     3500    TARGET_CONSTANT   "both comparands are target-scoped ... takes one
 *                                     value across every candidate of a target";
 *                                     the length→unit scaling is not stated
 *   SE2     2000    UNDETERMINABLE    "no pairing or aggregation function is ratified
 *                                     here"; order_ref exists only on the merchant
 *                                     ledger entry, which no clause pairs with a candidate
 *   SE3     1500    COMPUTED          spec 1.4.13's dimensionally coherent form
 *   SE4     1000    UNDETERMINABLE    "Its agreement function is therefore left
 *                                     undefined ... NOT settled here"
 *   SE5     2000    COMPUTED          spec 1.4.16's Jaccard over R* and M, with the
 *                                     F05 exclusion; spec 1.4.17's union
 * ```
 *
 * **`SE5` is computed as if one `fetch_settlement_recon` had been dispatched
 * for the target** — the full-information reading of the documented model.
 * Under the other reading (no probe) `SE5 = 0` on every allocation, the model
 * is `SE3` alone, and `documented_discriminable` is empty by V38's 469-bps
 * bound on every family including `AMB-4`; that reading measures the engine,
 * not the specification, and is not the one bench-v2 pre-registers.
 *
 * **Inputs are values, never files.** The recon report rows arrive as a
 * parameter; this package performs no I/O (`index.ts`) and imports neither
 * `packages/probe` nor the quarantined text store (`tests/discipline.test.ts`).
 * The row shape is declared here structurally rather than imported from
 * `@assay/generator`, whose importers that suite pins to three modules.
 */

import { SECONDS_PER_DAY, SETTLEMENT_WINDOW_DAYS, type MemberContribution } from "@assay/oracle";

import { SE_WEIGHTS_BPS } from "../frozen.js";

/** The five signal ids, in `§4.2`'s order. */
export const SE_IDS = Object.freeze(["SE1", "SE2", "SE3", "SE4", "SE5"] as const);
export type SeId = (typeof SE_IDS)[number];

/** How the documented model treats each signal, and why. */
export type SeStatus = "COMPUTED" | "TARGET_CONSTANT" | "UNDETERMINABLE";

export interface SeDisposition {
  readonly id: SeId;
  readonly weight_bps: number;
  readonly status: SeStatus;
  /** `§4.2`'s own words, or the derivation, for the status. */
  readonly ground: string;
}

/**
 * The disposition of every signal under the documented model — the complete
 * list of what `§4.2` determines and what it leaves open, as data so the
 * pre-registration and the report print the same table.
 */
export const SE_DISPOSITIONS: readonly SeDisposition[] = Object.freeze([
  {
    id: "SE1",
    weight_bps: SE_WEIGHTS_BPS.SE1,
    status: "TARGET_CONSTANT",
    ground:
      "§4.2: 'Both comparands are target-scoped, so SE1 takes one value across every candidate of a target and can neither order candidates nor move the ε-gap.' Cancels in every gap. The scaling of 'UTR prefix match length' to a unit score is not stated and is not needed for a gap.",
  },
  {
    id: "SE2",
    weight_bps: SE_WEIGHTS_BPS.SE2,
    status: "UNDETERMINABLE",
    ground:
      "§4.2: 'no frozen clause pairs a MerchantLedgerEntry with a candidate, component, target or probed order ... no pairing or aggregation function is ratified here.' No candidate-relative form exists on conforming data; excluded from the gap and disclosed.",
  },
  {
    id: "SE3",
    weight_bps: SE_WEIGHTS_BPS.SE3,
    status: "COMPUTED",
    ground:
      "§4.2 (spec 1.4.13): lag_days real; mode_days the mode of floor(lag_days) over every recon_line, ties to the lowest bin; member score max(0, 1 − |lag_days − mode_days| / (T_max − T_min)); candidate score the arithmetic mean.",
  },
  {
    id: "SE4",
    weight_bps: SE_WEIGHTS_BPS.SE4,
    status: "UNDETERMINABLE",
    ground:
      "§4.2: 'Its agreement function is therefore left undefined — partial credit between method and card_network, and the treatment of a card_network null on both sides ... are NOT settled here.' Excluded from the gap and disclosed, never carried as 0.",
  },
  {
    id: "SE5",
    weight_bps: SE_WEIGHTS_BPS.SE5,
    status: "COMPUTED",
    ground:
      "§4.2 (specs 1.4.15–1.4.17): R the union of constituent ids over every fetch_settlement_recon result for the settlement; R* their images under §12's relation, an id with no observation excluded entirely; SE5 = |R* ∩ M| / |R* ∪ M|, 0 when the union is empty. Computed as if one such probe had been dispatched for the target.",
  },
]);

/** The signals the gap is summed over, and the ones it discloses as excluded. */
export const SE_IN_GAP: readonly SeId[] = Object.freeze(
  SE_DISPOSITIONS.filter((d) => d.status === "COMPUTED").map((d) => d.id),
);
export const SE_UNDETERMINABLE: readonly SeId[] = Object.freeze(
  SE_DISPOSITIONS.filter((d) => d.status === "UNDETERMINABLE").map((d) => d.id),
);

// ---------------------------------------------------------------------------
// SE3 — temporal proximity to the modal settlement lag (spec 1.4.13)
// ---------------------------------------------------------------------------

/**
 * `mode_days`: the mode of `floor(lag_days)` over **every `recon_line`** in the
 * dataset with a `settled_at`, ties to the lowest bin. Run-level: `§4.2`
 * excludes a candidate-scoped population by derivation.
 */
export function documentedModeDays(members: readonly MemberContribution[]): number {
  const counts = new Map<number, number>();
  for (const m of members) {
    if (m.kind !== "recon_line" || m.settled_at === null) continue;
    const bin = Math.floor((m.settled_at - m.created_at) / SECONDS_PER_DAY);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const bin of [...counts.keys()].sort((a, b) => a - b)) {
    const c = counts.get(bin) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = bin;
    }
  }
  return best ?? 0;
}

/** `SE3` for one allocation, in `[0, 1]`: the arithmetic mean of its members' scores. */
export function documentedSe3(members: readonly MemberContribution[], modeDays: number): number {
  if (members.length === 0) return 0;
  const denominator = SETTLEMENT_WINDOW_DAYS.t_max - SETTLEMENT_WINDOW_DAYS.t_min;
  let total = 0;
  for (const m of members) {
    if (m.settled_at === null) continue;
    const lagDays = (m.settled_at - m.created_at) / SECONDS_PER_DAY;
    total += Math.max(0, 1 - Math.abs(lagDays - modeDays) / denominator);
  }
  return total / members.length;
}

// ---------------------------------------------------------------------------
// SE5 — probe-result corroboration (specs 1.4.15 / 1.4.16 / 1.4.17)
// ---------------------------------------------------------------------------

/**
 * One row of the PG-side recon report, structurally — `§6.2`: `settlement_id`,
 * `entity_id`, `settled_at`, and nothing else. `settled_at` is not read here.
 */
export interface ReconReportRowLike {
  readonly settlement_id: string | null;
  readonly entity_id: string;
}

/**
 * `R*` for one target: the report's constituent ids for `settlement_id`,
 * mapped through `§12`'s identifier relation, **an id with no observation
 * excluded entirely** (spec 1.4.16's `F05` treatment). Union over every row
 * naming the settlement (spec 1.4.17).
 */
export function documentedRStar(
  settlementId: string,
  rows: readonly ReconReportRowLike[],
  obsIdOfEntity: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.settlement_id !== settlementId) continue;
    const obsId = obsIdOfEntity.get(row.entity_id);
    if (obsId !== undefined) out.add(obsId);
  }
  return out;
}

/** `SE5 = |R* ∩ M| / |R* ∪ M|`, `0` when the union is empty. */
export function documentedSe5(allocationObsIds: ReadonlySet<string>, rStar: ReadonlySet<string>): number {
  let intersection = 0;
  for (const id of rStar) if (allocationObsIds.has(id)) intersection += 1;
  const union = rStar.size + allocationObsIds.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
