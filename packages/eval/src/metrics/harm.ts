/**
 * Financial harm — `EVALUATION_SPEC.md §4.4`. Metric 6, both halves.
 *
 * `§4.4` opens by rejecting the obvious measure: *"Face value of misallocated
 * records is the wrong measure: moving a payment between two settlements that
 * both land in the same account on the same day harms nobody. **Harm is what
 * changes in the books.**"*
 *
 * ```
 *   proj_agent(acct) = Σ dr_paise − Σ cr_paise over the agent's journal lines
 *                      whose owning decision is RECONCILED
 *   proj_truth(acct) = Σ dr_paise − Σ cr_paise over true_journal lines whose
 *                      source_entity_id belongs to a covered observation
 *
 *   balance_harm_inr = Σ over AccountCode (excluding Suspense)
 *                        | proj_agent(acct) − proj_truth(acct) |
 * ```
 *
 * **Two scoping rules are implemented here, and both were corrections.**
 *
 * *Covered set only.* `§4.4`: *"`balance_harm_inr` is selective risk, and
 * selective risk is computed over the covered set only."* Benchmark v1.0.0 and
 * v1.0.1 summed over the whole run, under which *"harm **rose** with abstention,
 * the curve sloped upward, `aurc_inr` measured the inverse of its stated
 * meaning, and `A2-NOABSTAIN` — the ablation built never to abstain — scored the
 * lowest balance harm in the field."*
 *
 * *Suspense excluded.* *"because a rupee correctly parked there is a *correct*
 * outcome, and including it would count the same abstention twice within this
 * metric — once on the Suspense side and once on its counterparty."* Abstention
 * remains priced once, in `§4.5`'s `net_cost_inr`.
 *
 * **The degenerate case, checked** (`§4.4`): an agent that abstains on
 * everything has an empty covered set and `balance_harm = 0` — but pays
 * `N × C_review` in metric 2 and scores `0` coverage. Abstaining on everything
 * is not rewarded, and the check belongs in the metric *set* rather than in this
 * function.
 */

import { ACCOUNT_CODES, SUSPENSE_ACCOUNT, type AccountCode } from "@assay/domain";
import type { AccountBalances } from "@assay/ledger";
import { paise, type Paise } from "@assay/money";

import type { AgentRun } from "../run.js";
import { projectTruth, trueTargetByEntity, type ScoringTruth } from "../truth.js";

/** Metric 6, both halves, with the per-account differences that produced (a). */
export interface HarmReport {
  /** `Σ over AccountCode (excluding Suspense) | proj_agent − proj_truth |`, paise. */
  readonly balance_harm_paise: number;
  /** `Σ entity.amount` over covered entities whose target is not the true one, paise. */
  readonly misdirected_value_paise: number;
  /**
   * The per-account absolute differences, Suspense included but not summed.
   *
   * Reported because `§4.4` asks *"can I trust the trial balance for what the
   * system decided?"*, and an aggregate that names no account cannot be acted
   * on. Suspense is present so a reader can see what the exclusion removed
   * rather than take it on trust.
   */
  readonly by_account: Readonly<Record<AccountCode, number>>;
  /** Entities in the covered set — metric 6's denominator of attention. */
  readonly covered_entities: number;
}

/**
 * `proj_agent(acct)` — the covered-set projection of the agent's own journal.
 *
 * Computed here from {@link AgentRun.journal} rather than through
 * `@assay/ledger`'s `projectByDecisionState`, which needs a `LedgerEvent` chain
 * this package is not given. The arithmetic is `ARCHITECTURE.md §8`'s
 * debit-positive `balance(acct) = Σ dr − Σ cr` *"with no per-account
 * adjustment"*, and the filter is `§4.4`'s own clause.
 */
export function projectAgent(run: AgentRun): AccountBalances {
  const totals = {} as Record<AccountCode, number>;
  for (const code of ACCOUNT_CODES) totals[code] = 0;
  for (const posted of run.journal) {
    if (posted.decision_state !== "RECONCILED") continue;
    totals[posted.line.account] += posted.line.dr_paise - posted.line.cr_paise;
  }
  // Through `paise()` rather than a cast, for the reason `truth.ts` states:
  // it raises on a sum outside the safe-integer range, which is `I7`.
  const balances = {} as Record<AccountCode, Paise>;
  for (const code of ACCOUNT_CODES) balances[code] = paise(totals[code]);
  return Object.freeze(balances);
}

/**
 * Metric 6(a) — `balance_harm_inr`, in paise, over the covered set.
 *
 * Suspense is excluded from the **sum** and retained in the breakdown.
 */
export function balanceHarm(
  agent: AccountBalances,
  truth: AccountBalances,
): { readonly total_paise: number; readonly by_account: Readonly<Record<AccountCode, number>> } {
  const byAccount = {} as Record<AccountCode, number>;
  let total = 0;
  for (const code of ACCOUNT_CODES) {
    const difference = Math.abs(agent[code] - truth[code]);
    byAccount[code] = difference;
    if (code !== SUSPENSE_ACCOUNT) total += difference;
  }
  return Object.freeze({ total_paise: total, by_account: Object.freeze(byAccount) });
}

/**
 * Metric 6(b) — `misdirected_value_inr`, in paise.
 *
 * ```
 *   misdirected_value_inr = Σ over COVERED entities where
 *                             allocated_target ≠ true_target
 *                             of entity.amount
 * ```
 *
 * `§4.4`: *"Scoped to the covered set for the same reason as (a): an abstained
 * or excepted entity has no allocated target, so it can be neither correctly nor
 * incorrectly directed. **Stating the scope explicitly prevents an
 * implementation from counting an abstention as a misdirection.**"* The covered
 * set here is the entities the agent actually asserted an edge for, which is
 * that scope exactly.
 *
 * An entity the agent allocated that has **no** true target is misdirected: it
 * was filed under a settlement it does not belong to. It is not skipped, because
 * skipping it would make a wholly invented allocation cost nothing here.
 *
 * @param valueOfEntity `entity.amount` per entity, from the observation set.
 *   `DATA_MODEL.md §14.1` values a `recon_line` at `payload.amount` on both the
 *   payment and refund rows, which is the figure this sum names.
 */
export function misdirectedValue(
  run: AgentRun,
  truth: ScoringTruth,
  valueOfEntity: ReadonlyMap<string, number>,
): number {
  const trueTarget = trueTargetByEntity(truth.edges);
  let total = 0;
  const counted = new Set<string>();
  for (const edge of run.allocations) {
    // One entity, one charge. C7 makes an entity belong to at most one accepted
    // allocation, so a second edge for the same entity is an agent defect —
    // charging its amount twice would price the defect rather than the money.
    if (counted.has(edge.entity_id)) continue;
    counted.add(edge.entity_id);
    if (trueTarget.get(edge.entity_id) === edge.target_id) continue;
    total += valueOfEntity.get(edge.entity_id) ?? 0;
  }
  return total;
}

/**
 * Both halves of metric 6, computed together.
 *
 * `§4.4`: *"Both are reported. They answer different questions ... and a system
 * can be good at one and bad at the other. **Collapsing them into a single
 * number would hide that.**"* One record, two fields, no scalar.
 */
export function harm(
  run: AgentRun,
  truth: ScoringTruth,
  covered: ReadonlySet<string>,
  valueOfEntity: ReadonlyMap<string, number>,
): HarmReport {
  const agent = projectAgent(run);
  const truthProjection = projectTruth(truth.journal, covered);
  const balance = balanceHarm(agent, truthProjection);
  return Object.freeze({
    balance_harm_paise: balance.total_paise,
    misdirected_value_paise: misdirectedValue(run, truth, valueOfEntity),
    by_account: balance.by_account,
    covered_entities: covered.size,
  });
}
