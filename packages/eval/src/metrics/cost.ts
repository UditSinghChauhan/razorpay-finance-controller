/**
 * Net cost and gap to oracle — `EVALUATION_SPEC.md §4.5` and `§4.13`.
 * Metrics 2 and 8.
 *
 * ```
 *   net_cost_inr = balance_harm_inr
 *                + |abstained|       × C_review     (₹250)
 *                + |open_exceptions| × C_exception  (₹500)
 * ```
 *
 * `§4.5`: *"**Decision enabled:** 'Which system costs me less to run?' — the
 * only question a controller actually asks. ... This is the metric that makes
 * the evaluation honest, because it prices abstention. Without a cost on
 * abstention, `A2-NOABSTAIN` is trivially beaten by a system that abstains on
 * everything, and the comparison is meaningless."*
 *
 * **`C_review` and `C_exception` are assumptions, not measurements** (`§4.5`,
 * `PREREGISTRATION.md §7`), which is why both are parameters here and why
 * `§5.3`'s ₹100 / ₹250 / ₹1,000 sweep is mandatory. Parameterising them does not
 * make them tunable: `DECISION_BRIEF.md §L.4` forbids changing a frozen decision
 * parameter on the basis of an observed result, and `frozen.ts` holds the values
 * every unswept call uses.
 */

import { C_EXCEPTION_PAISE, C_REVIEW_PAISE } from "../frozen.js";
import type { AgentRun } from "../run.js";

/** Metric 2, with its three terms visible. */
export interface NetCostReport {
  readonly balance_harm_paise: number;
  readonly abstention_count: number;
  readonly abstention_cost_paise: number;
  readonly open_exception_count: number;
  readonly exception_cost_paise: number;
  readonly net_cost_paise: number;
  /**
   * `net_cost_inr_excluding_e13` — `EXPLORATORY` (`§4.5`,
   * `PREREGISTRATION.md §8`).
   *
   * *"With `AN5` retired every `ledger_entry` reaches `E13_LEDGER_ONLY`, so
   * `net_cost_inr` carries one `C_exception` per ledger entry in the dataset —
   * **identical for ASSAY, `B0`, `B2`, `A1`, `A2` and `A3`**. It therefore
   * inflates every *absolute* figure and cancels in every *comparison* ... The
   * formula is **not** amended to exclude it. Instead every report carries a
   * companion line."* It supports no claim and is printed beside metric 2.
   */
  readonly net_cost_paise_excluding_e13: number;
  readonly e13_count: number;
}

/** The three cost parameters, so a `§5.3` sweep varies data rather than code. */
export interface CostParameters {
  readonly c_review_paise: number;
  readonly c_exception_paise: number;
}

/** The frozen pair (`PREREGISTRATION.md §7`). */
export const FROZEN_COSTS: CostParameters = Object.freeze({
  c_review_paise: C_REVIEW_PAISE,
  c_exception_paise: C_EXCEPTION_PAISE,
});

/**
 * Metric 2 — `net_cost_inr`, in paise.
 *
 * @param balanceHarmPaise metric 6(a), **over the covered set** (`§4.4`).
 *   Passed in rather than recomputed so that the two metrics cannot disagree
 *   about which set they scored.
 */
export function netCost(
  run: AgentRun,
  balanceHarmPaise: number,
  costs: CostParameters = FROZEN_COSTS,
): NetCostReport {
  const abstentions = run.abstentions.length;
  const exceptions = run.open_exceptions.length;
  const e13 = run.open_exceptions.filter((e) => e.exception_class === "E13_LEDGER_ONLY").length;
  const abstentionCost = abstentions * costs.c_review_paise;
  const exceptionCost = exceptions * costs.c_exception_paise;
  const total = balanceHarmPaise + abstentionCost + exceptionCost;
  return Object.freeze({
    balance_harm_paise: balanceHarmPaise,
    abstention_count: abstentions,
    abstention_cost_paise: abstentionCost,
    open_exception_count: exceptions,
    exception_cost_paise: exceptionCost,
    net_cost_paise: total,
    net_cost_paise_excluding_e13: total - e13 * costs.c_exception_paise,
    e13_count: e13,
  });
}

/**
 * The reference policy metric 8 is measured against — `§4.13`.
 *
 * *"Where the oracle policy abstains on exactly the truly-ambiguous set and is
 * correct elsewhere."* Correct elsewhere means `balance_harm = 0`, so the
 * policy's cost is its abstention charge plus whatever open exceptions it still
 * carries.
 *
 * **The structural exception count is a parameter, not zero.** `§4.5` states
 * that the per-`ledger_entry` `C_exception` term *"cancels in every comparison,
 * **including metric 8 `gap_to_oracle`, which is a difference of two
 * `net_cost_inr` values**"* — which is true only if the reference policy carries
 * the same term. Defaulting it to `0` would silently make metric 8 carry the
 * constant `§4.5` says it does not, so the caller states it and the report shows
 * what was stated.
 *
 * @param trulyAmbiguousCount `|truly_ambiguous|` from the oracle's labels.
 * @param structuralOpenExceptions the open exceptions the reference policy still
 *   carries — the `E13` population, plus any other class no policy can resolve
 *   from the observations.
 */
export function oraclePolicyNetCost(
  trulyAmbiguousCount: number,
  structuralOpenExceptions: number,
  costs: CostParameters = FROZEN_COSTS,
): number {
  return (
    trulyAmbiguousCount * costs.c_review_paise +
    structuralOpenExceptions * costs.c_exception_paise
  );
}

/**
 * Metric 8 — `gap_to_oracle = net_cost_inr(ASSAY) − net_cost_inr(oracle_policy)`.
 *
 * **A negative gap is valid and means something specific** (`§4.13`, spec
 * 1.4.22, register row M36): *"ASSAY, having spent probe budget under
 * `RECONCILIATION_SPEC.md §6.2`, may abstain on strictly fewer while keeping
 * balance harm at zero, so it can cost less than the reference. **The formula's
 * sign is unconstrained and nothing here changes it.**"* No clamp is applied
 * here, and `§4.13` requires the probe count to be reported beside this figure
 * so the provenance of a negative gap is visible rather than inferred.
 *
 * **Decision enabled:** *"Is the remaining error a solvable engineering problem,
 * or is the information simply not present in the data?"*
 */
export function gapToOracle(agentNetCostPaise: number, oraclePolicyPaise: number): number {
  return agentNetCostPaise - oraclePolicyPaise;
}
