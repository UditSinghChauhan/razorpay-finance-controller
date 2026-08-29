import type { AccountCode, ObservationId } from "@assay/domain";
import type { BankSideEvidence, CertificateReason } from "@assay/ledger";
import { journalFor } from "@assay/ledger";

import {
  EPSILON_BPS,
  EVIDENCE_SCORE_MAX_BPS,
  P_MAX,
  SECONDS_PER_DAY,
  SETTLEMENT_WINDOW,
  SE_WEIGHTS_BPS,
  TAU,
} from "./frozen.js";
import type { DecomposedComponent } from "./s3-decompose.js";
import type { Candidate, Member, Target } from "./s2-candidates.js";

/**
 * Stage `S4` — exact solve and the second-best certificate
 * (`RECONCILIATION_SPEC.md §6`).
 *
 * **This module is a pure function and does not drive the probe loop.** `§6.2`
 * has the LLM (`R3`) propose a probe and *"deterministic code execute it and
 * re-run the solve"*; `DECISION_BRIEF.md §L.2` builds `llm` **after**
 * `engine S4-S5`, so the engine cannot call `R3` and must not try. The
 * orchestration outside calls `solve` again with more accumulated evidence.
 * Everything below is a function of its arguments alone.
 *
 * **Three branches are deliberately not decided here**, each surfaced as a
 * value the caller cannot silently ignore rather than given an invented rule:
 *
 * 1. `Component.solve_status`'s `EMPTY` and `SOLVED` — `DATA_MODEL.md §11`
 *    declares the enum and **no document states a trigger for either**; `§4.3`
 *    defines only `INTRACTABLE`. This module therefore emits no `solve_status`.
 * 2. `0 < attempts < P_max` with `NO_USEFUL_PROBE` — the A2 middle case.
 *    Returned as `{ determined: false }`.
 * 3. `R3`'s probe-selection policy — not the engine's, and not modelled.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** `§6`'s four outcomes, plus `§4.3`'s bound. */
export type SolveOutcome =
  | "UNIQUE"
  | "IMMATERIALLY_AMBIGUOUS"
  | "DISCRIMINATED"
  | "AMBIGUOUS"
  | "INTRACTABLE";

/** The per-signal breakdown, in basis points, before summing. */
export interface SignalContributions {
  readonly SE1: number;
  readonly SE2: number;
  readonly SE3: number;
  readonly SE4: number;
  readonly SE5: number;
}

export interface ScoredSolution {
  readonly candidate: Candidate;
  /** `§4.2`: an integer in `[0, 10_000]`, `round_half_up` applied once at the end. */
  readonly evidence_score_bps: number;
  readonly signals: SignalContributions;
  /** The spec-1.4.21 canonical allocation key. Ties are broken on this. */
  readonly canonical_key: string;
}

/**
 * Why a certificate was emitted — or, for the one case the specification does
 * not decide, an explicit refusal to say.
 *
 * `A2`'s two determined endpoints are `EVIDENCE_TIE` (zero attempts) and
 * `PROBE_BUDGET_EXHAUSTED` (`attempts === P_max`), and `§4.3` gives
 * `SEARCH_BOUND_EXCEEDED`. **The middle case — `0 < attempts < P_max`, the loop
 * having stopped because `R3` returned `NO_USEFUL_PROBE` — has no frozen
 * reason**, and `§6.2`'s *"if probes **exhaust**"* does not cover a budget that
 * still has room. Returning a discriminated union forces the caller to confront
 * that rather than receive a fabricated default.
 */
export type CertificateReasonResult =
  | { readonly determined: true; readonly reason: CertificateReason }
  | {
      readonly determined: false;
      readonly seam: "A2_MIDDLE_CASE_UNSPECIFIED";
      readonly attempts: number;
    };

export interface SolveResult {
  readonly outcome: SolveOutcome;
  readonly best: ScoredSolution | null;
  readonly second: ScoredSolution | null;
  /** `§6`: `|evidence_score_bps(best) − evidence_score_bps(second)|`, integer bps. */
  readonly delta_s_bps: number | null;
  /** `§6`: `max over AccountCode of |balance_best(acct) − balance_second(acct)|`. */
  readonly materiality_paise: number | null;
  readonly tau_paise: number;
  /** Non-null exactly when the outcome forces an abstention certificate. */
  readonly certificate_reason: CertificateReasonResult | null;
  /** Every feasible solution, ranked. */
  readonly ranked: readonly ScoredSolution[];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One accumulated `fetch_settlement_recon` result.
 *
 * `SE5`'s only input (`§4.2`, spec 1.4.15). Shaped after
 * `DATA_MODEL.md §12`'s `ProbeResultDetail` variant, which this module does not
 * import because it needs no other variant and `§12` carries no `date`.
 */
export interface ReconReport {
  readonly settlement_id: string;
  readonly constituent_entity_ids: readonly string[];
}

export interface SolveInput {
  readonly component: DecomposedComponent;
  readonly target: Target;
  /** Admissible candidates from `S2`, for this target. */
  readonly candidates: readonly Candidate[];
  /** Every member the candidates can name, for scoring lookups. */
  readonly members: readonly Member[];
  /**
   * `SE3`'s `mode_days`: the mode of `floor(lag_days)` over **every `recon_line`
   * observation in the dataset**, lowest bin on a tie. Run-level, so it is
   * computed once and passed in — `modalLagDays` below builds it.
   */
  readonly mode_days: number;
  /**
   * The target's **entity** id (`setl_…`), which a `fetch_settlement_recon`
   * report carries. `S2`'s `Target` is keyed by observation id, and `§6.2`'s
   * probe is keyed by `settlement_id`, so the two namespaces meet here — the
   * same distinction `DATA_MODEL.md §22.2` M28 registers. `null` for a target
   * that is not a settlement, which no report can name.
   */
  readonly target_entity_id: string | null;
  /** Accumulated `fetch_settlement_recon` results, in any order. */
  readonly recon_reports: readonly ReconReport[];
  /** `DATA_MODEL.md §12`'s relation (spec 1.4.14): entity id → observation id. */
  readonly observationIdForEntityId: (entityId: string) => ObservationId | undefined;
  /** How many probes have been spent on this component. */
  readonly probe_attempts: number;
  /**
   * `AN2` evidence for the target, where `S1` established it. `null` puts
   * `§17.1.1`'s `P2`/`P4` out of reach, so neither allocation posts on the
   * reconciled path and the materiality between them is `0`.
   */
  readonly bank_evidence: BankSideEvidence | null;
}

// ---------------------------------------------------------------------------
// SE3
// ---------------------------------------------------------------------------

/**
 * `SE3`'s `mode_days` (`§4.2`, spec 1.4.13): the mode of `floor(lag_days)` over
 * **every `recon_line` observation in the dataset**, **ties to the lowest bin**.
 *
 * Run-level, never candidate-scoped — `§4.2` excludes a candidate-scoped
 * population by derivation, since it would let each candidate supply its own
 * mode and score itself ≈ 1.0.
 */
export function modalLagDays(members: readonly Member[]): number {
  const counts = new Map<number, number>();
  for (const m of members) {
    if (m.kind !== "recon_line") continue;
    const settledAt = m.payload.settled_at;
    if (settledAt === null) continue;
    const bin = Math.floor((settledAt - m.payload.created_at) / SECONDS_PER_DAY);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  // Ascending bin order, strict improvement only: the lowest bin keeps a tie.
  for (const bin of [...counts.keys()].sort((a, b) => a - b)) {
    const c = counts.get(bin) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = bin;
    }
  }
  return best ?? 0;
}

/**
 * `SE3` for one candidate (`§4.2`, spec 1.4.13).
 *
 * ```
 *   lag_days      = (settled_at - created_at) / 86400      REAL, not floored
 *   member score  = max(0, 1 - |lag_days - mode_days| / (T_max - T_min))
 *   candidate     = ARITHMETIC MEAN of its members' scores
 * ```
 *
 * The numerator stays **continuous** and only the *mode* is day-binned: `§4.2`
 * introduced binning because a seconds-granular mode is degenerate, *"and that
 * reason does not reach the `lag` term, which `C4` defines as the raw
 * difference"*. The denominator is `T_max − T_min`, ratified at spec 1.4.13.
 */
function se3(members: readonly Member[], modeDays: number): number {
  if (members.length === 0) return 0;
  const denominator = SETTLEMENT_WINDOW.t_max_days - SETTLEMENT_WINDOW.t_min_days;
  let total = 0;
  for (const m of members) {
    const settledAt = m.payload.settled_at;
    if (settledAt === null) continue; // cannot be a member anyway (spec 1.4.2)
    const lagDays = (settledAt - m.payload.created_at) / SECONDS_PER_DAY;
    total += Math.max(0, 1 - Math.abs(lagDays - modeDays) / denominator);
  }
  return total / members.length;
}

// ---------------------------------------------------------------------------
// SE5
// ---------------------------------------------------------------------------

/**
 * `SE5` (`§4.2`, specs 1.4.15 / 1.4.16 / 1.4.17).
 *
 * ```
 *   scope   fetch_settlement_recon results only          1.4.15
 *   R       UNION of constituent_entity_ids over EVERY report carrying
 *           settlement_id = S, irrespective of date argument or probe order   1.4.17
 *   R*      those ids mapped through §12's relation, ids with NO observation
 *           EXCLUDED ENTIRELY -- neither numerator nor denominator            1.4.16
 *   score   |R* n M| / |R* u M|, and 0 when the union is empty                1.4.16
 * ```
 *
 * The union makes repeated identical reports idempotent and probe order
 * irrelevant, which is what spec 1.4.17 derived. With no matching report `R*`
 * is empty and the score is `0` — `§4.2`'s post-probe-only clause falls out of
 * the formula rather than needing a special case.
 */
function se5(
  candidateMembers: ReadonlySet<string>,
  input: SolveInput,
): number {
  const settlementId = input.target_entity_id;
  if (settlementId === null) return 0;

  const returned = new Set<string>();
  for (const report of input.recon_reports) {
    if (report.settlement_id !== settlementId) continue;
    for (const id of report.constituent_entity_ids) returned.add(id);
  }

  const rStar = new Set<string>();
  for (const entityId of returned) {
    const obsId = input.observationIdForEntityId(entityId);
    if (obsId !== undefined) rStar.add(obsId);
  }

  let intersection = 0;
  for (const id of rStar) if (candidateMembers.has(id)) intersection += 1;
  const union = rStar.size + candidateMembers.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** `DATA_MODEL.md §0` rule 5: `round_half_up`, applied once, at the end. */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

function scoreCandidate(
  candidate: Candidate,
  input: SolveInput,
  byId: ReadonlyMap<string, Member>,
): ScoredSolution {
  const members: Member[] = [];
  for (const id of candidate.member_obs_ids) {
    const m = byId.get(id);
    if (m !== undefined) members.push(m);
  }
  const memberIds = new Set<string>(candidate.member_obs_ids);

  // SE1: permanently INACTIVE (spec 1.4.10). Both comparands are target-scoped,
  // so it takes one value across every candidate of a target. Weight retained.
  const se1Unit = 0;
  // SE2: EXPECTED-NON-BINDING on v1.0.0 (spec 1.4.20). `order_ref` lives only on
  // MerchantLedgerEntry and no frozen clause pairs one with a candidate.
  const se2Unit = 0;
  const se3Unit = se3(members, input.mode_days);
  // SE4: EXPECTED-NON-BINDING on v1.0.0 (spec 1.4.11), agreement function
  // deliberately undefined. Weight retained, unreallocated.
  const se4Unit = 0;
  const se5Unit = se5(memberIds, input);

  const signals: SignalContributions = {
    SE1: se1Unit * SE_WEIGHTS_BPS.SE1,
    SE2: se2Unit * SE_WEIGHTS_BPS.SE2,
    SE3: se3Unit * SE_WEIGHTS_BPS.SE3,
    SE4: se4Unit * SE_WEIGHTS_BPS.SE4,
    SE5: se5Unit * SE_WEIGHTS_BPS.SE5,
  };

  // §4.2: a weighted sum in integer basis points with round_half_up applied
  // ONCE, at the end. No renormalisation -- AL3 freezes all five weights and
  // the three that contribute nothing keep theirs.
  const raw =
    signals.SE1 + signals.SE2 + signals.SE3 + signals.SE4 + signals.SE5;
  const bps = Math.min(EVIDENCE_SCORE_MAX_BPS, Math.max(0, roundHalfUp(raw)));

  return {
    candidate,
    evidence_score_bps: bps,
    signals,
    canonical_key: canonicalAllocationKey(input.target.obs_id, candidate.member_obs_ids),
  };
}

/**
 * The spec-1.4.21 **canonical allocation key**, register row M35.
 *
 * *"A solution's allocation identity is the set of `(target_id, member_obs_id)`
 * pairs it asserts; a target with an empty allocation contributes the single
 * pair `(target_id, "")`. Its canonical key is that set sorted by
 * `(target_id, member_obs_id)`, each pair serialised `target_id ‖ "|" ‖
 * member_obs_id`, the pairs joined by `";"`."*
 *
 * `member_obs_ids` alone would collide: a component may hold several targets
 * (`§5`) and two of equal amount admit the identical member set. Ids match
 * `^prefix_[A-Za-z0-9]{14}$`, so neither separator can occur inside one and the
 * encoding is injective.
 */
export function canonicalAllocationKey(
  targetId: string,
  memberObsIds: readonly ObservationId[],
): string {
  const pairs: [string, string][] =
    memberObsIds.length === 0
      ? [[targetId, ""]]
      : memberObsIds.map((m) => [targetId, m as string]);
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  return pairs.map(([t, m]) => `${t}|${m}`).join(";");
}

// ---------------------------------------------------------------------------
// Materiality
// ---------------------------------------------------------------------------

/**
 * `§6`: *"`max over AccountCode of |balance_best(acct) − balance_second(acct)|`,
 * computed by running both allocations through the ledger projection in
 * memory."*
 *
 * Uses `packages/ledger`'s **pure** `journalFor` — `DECISION_BRIEF.md §L.2`
 * places *ledger Layer B* between `engine S1-S3` and `engine S4-S5` precisely so
 * this is available, and `§L.2` calls `journal.ts` *"a pure posting function"*.
 * No persistence, no write path, no `ValidatedDecision`.
 *
 * `§17.1.1` conditions `P2`/`P4` on *"`AN2` satisfied against an actual
 * `bank_line`"*, so with `bank_evidence === null` neither allocation posts on
 * the reconciled path and the difference is `0`. Spec 1.4.21 withdrew `§11`'s
 * illustrative ₹1,00,000 for exactly this reason; `§6`'s formula is normative
 * and is what this computes.
 */
function balances(
  members: readonly Member[],
  bankEvidence: BankSideEvidence | null,
): Map<AccountCode, number> {
  const out = new Map<AccountCode, number>();
  if (bankEvidence === null) return out;
  for (const m of members) {
    const decision = journalFor({
      occasion: "BANK_EVIDENCE",
      observation: m,
      ingest_valid: true,
      bank_evidence: bankEvidence,
    });
    if (!decision.posts) continue;
    for (const line of decision.lines) {
      const prior = out.get(line.account) ?? 0;
      out.set(line.account, prior + line.dr_paise - line.cr_paise);
    }
  }
  return out;
}

function materiality(
  a: readonly Member[],
  b: readonly Member[],
  bankEvidence: BankSideEvidence | null,
): number {
  const ba = balances(a, bankEvidence);
  const bb = balances(b, bankEvidence);
  let max = 0;
  for (const account of new Set([...ba.keys(), ...bb.keys()])) {
    const delta = Math.abs((ba.get(account) ?? 0) - (bb.get(account) ?? 0));
    if (delta > max) max = delta;
  }
  return max;
}

/**
 * `§6`: `τ = max(₹100.00, 10 bps of component value)`, where *"component
 * value"* is `Component.total_value_paise` (`DATA_MODEL.md §11`, spec 1.4.6) —
 * **not** the target amount and **not** a sum over `Candidate.member_obs_ids`.
 */
export function tauFor(component: DecomposedComponent): number {
  const proportional = Math.floor(
    (component.total_value_paise * TAU.component_value_bps) / 10_000,
  );
  return Math.max(TAU.floor_paise, proportional);
}

// ---------------------------------------------------------------------------
// Solve
// ---------------------------------------------------------------------------

/**
 * Rank the feasible solutions and classify the component (`§6`).
 *
 * The feasible set is `S2`'s output, unchanged and untruncated: this stage
 * ranks, it does not re-filter. `§6`'s branch-and-bound is an *implementation
 * note* about how the exact solve may be organised; it may not alter the
 * mathematical feasible set, so the ranking here is over every admissible
 * candidate `S2` produced.
 */
export function solve(input: SolveInput): SolveResult {
  const tau = tauFor(input.component);

  // §4.3: exceeding K_max or C_max yields INTRACTABLE -> abstention with
  // SEARCH_BOUND_EXCEEDED. Reported, never silently truncated.
  if (input.component.exceeds_k_max) {
    return {
      outcome: "INTRACTABLE",
      best: null,
      second: null,
      delta_s_bps: null,
      materiality_paise: null,
      tau_paise: tau,
      certificate_reason: {
        determined: true,
        reason: "SEARCH_BOUND_EXCEEDED",
      },
      ranked: Object.freeze([]),
    };
  }

  const byId = new Map<string, Member>(
    input.members.map((m) => [m.obs_id as string, m]),
  );

  const scored = input.candidates.map((c) => scoreCandidate(c, input, byId));

  // Rank: highest evidence_score_bps first; on EXACT equality the
  // lexicographically smallest canonical allocation key (spec 1.4.21, M35).
  const ranked = [...scored].sort((a, b) => {
    if (a.evidence_score_bps !== b.evidence_score_bps) {
      return b.evidence_score_bps - a.evidence_score_bps;
    }
    return a.canonical_key < b.canonical_key
      ? -1
      : a.canonical_key > b.canonical_key
        ? 1
        : 0;
  });

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  if (best === null) {
    // No feasible solution at all. §9 sends this to "no admissible candidate
    // exists at all"; it is not §6's ambiguity path and gets no certificate.
    return {
      outcome: "UNIQUE",
      best: null,
      second: null,
      delta_s_bps: null,
      materiality_paise: null,
      tau_paise: tau,
      certificate_reason: null,
      ranked: Object.freeze([]),
    };
  }

  if (second === null) {
    // §6: "no second feasible solution -> UNIQUE -> accept".
    return {
      outcome: "UNIQUE",
      best,
      second: null,
      delta_s_bps: null,
      materiality_paise: null,
      tau_paise: tau,
      certificate_reason: null,
      ranked: Object.freeze(ranked),
    };
  }

  const membersOf = (s: ScoredSolution): Member[] => {
    const out: Member[] = [];
    for (const id of s.candidate.member_obs_ids) {
      const m = byId.get(id);
      if (m !== undefined) out.push(m);
    }
    return out;
  };

  const materialityPaise = materiality(
    membersOf(best),
    membersOf(second),
    input.bank_evidence,
  );
  const deltaS = Math.abs(best.evidence_score_bps - second.evidence_score_bps);

  // §6's table, in its own order.
  if (materialityPaise <= tau) {
    return {
      outcome: "IMMATERIALLY_AMBIGUOUS",
      best,
      second,
      delta_s_bps: deltaS,
      materiality_paise: materialityPaise,
      tau_paise: tau,
      certificate_reason: null,
      ranked: Object.freeze(ranked),
    };
  }

  if (deltaS >= EPSILON_BPS) {
    return {
      outcome: "DISCRIMINATED",
      best,
      second,
      delta_s_bps: deltaS,
      materiality_paise: materialityPaise,
      tau_paise: tau,
      certificate_reason: null,
      ranked: Object.freeze(ranked),
    };
  }

  return {
    outcome: "AMBIGUOUS",
    best,
    second,
    delta_s_bps: deltaS,
    materiality_paise: materialityPaise,
    tau_paise: tau,
    certificate_reason: certificateReason(input.probe_attempts),
    ranked: Object.freeze(ranked),
  };
}

/**
 * `A2`'s endpoints, and its unresolved middle.
 *
 * ```
 *   attempts === 0        EVIDENCE_TIE             derived
 *   attempts === P_max    PROBE_BUDGET_EXHAUSTED   §6.2, "if probes exhaust"
 *   0 < attempts < P_max  UNSPECIFIED              surfaced, never defaulted
 * ```
 */
export function certificateReason(attempts: number): CertificateReasonResult {
  if (attempts <= 0) return { determined: true, reason: "EVIDENCE_TIE" };
  if (attempts >= P_MAX) {
    return { determined: true, reason: "PROBE_BUDGET_EXHAUSTED" };
  }
  return {
    determined: false,
    seam: "A2_MIDDLE_CASE_UNSPECIFIED",
    attempts,
  };
}
