import { valueOf, type DecisionEvidence } from "@assay/cli";
import type { Observation } from "@assay/domain";
import type { AmbiguityCertificate, CertificateSolution } from "@assay/ledger";

/**
 * The certificate's **product read model** — each solution's members priced
 * from the observations the run already loaded.
 *
 * **Why this exists.** `DATA_MODEL.md §13`'s certificate names the two
 * allocations by `candidate_id` and `member_obs_ids` and carries no rupee figure
 * for a member, and `§17.1.1`'s journal lines for an abstained target are
 * *settlement-level* — `1100_GATEWAY_RECEIVABLE` credited and
 * `9000_SUSPENSE_UNRECONCILED` debited for the whole break, both keyed to the
 * settlement. So the posting cannot say what each candidate would have
 * allocated, and a drill-down that wants to show the two hypotheses side by side
 * has nowhere on the sealed record to read a member's amount from.
 *
 * **What it does not do.** It runs no stage, evaluates no clause, ranks no
 * candidate and re-derives no allocation: *which* member belongs to *which*
 * solution is read from the certificate exactly as the engine sealed it, and the
 * only work here is a lookup by `obs_id` into the observation set `POST /runs`
 * read. Nothing on the certificate is edited, replaced or recomputed — this
 * travels **beside** it.
 *
 * **The two rupee figures are different quantities, and both are named.** A
 * member carries two amounts that the corpus defines separately, and collapsing
 * them is the mistake this module exists to prevent:
 *
 * - `allocation_paise` — `RECONCILIATION_SPEC.md §4.1`'s `C6` reads
 *   *"`Σ credit(members) − Σ debit(members)` = `target.amount`"*, so a member's
 *   own term in that sum is `credit − debit`. This is the figure that ties an
 *   allocation out against its target, and therefore the one a hypothesis card
 *   must show.
 * - `value_paise` — `DATA_MODEL.md §14.1`'s `value(observation)`, which for a
 *   recon line is `payload.amount` (gross of fee and tax). It is what
 *   `GET /runs/:id/exceptions` ranks by and what `unresolved_value_paise`
 *   carries. It is **not** an allocation term and does not tie out.
 *
 * `§14.1` itself insists on the distinction for the adjustment row — using
 * `amount` there *"would put a number in `unresolved_value_paise` that the
 * ledger never posted"* — so the read model reports both under their own names
 * rather than choosing one and calling it "the amount".
 */

/** One member of a candidate allocation, priced from its own observation. */
export interface AllocationMember {
  readonly obs_id: string;
  /**
   * `C6`'s per-member term, `credit − debit`, in paise.
   *
   * `null` where the run holds no observation under this id, or where the
   * observation is of a kind that carries no `credit`/`debit` pair —
   * `packages/engine`'s `Member` is `recon_line | adjustment` and no other kind
   * has the fields `C6` sums. `null` rather than `0`, because a zero here would
   * read as *"contributes nothing to the tie-out"* rather than *"has no term"*.
   */
  readonly allocation_paise: number | null;
  /** `DATA_MODEL.md §14.1`'s `value(observation)`; `null` when the id is unknown. */
  readonly value_paise: number | null;
}

/** One of `§13`'s two allocations, with its members priced. */
export interface AllocationSolution {
  readonly candidate_id: string;
  readonly members: readonly AllocationMember[];
}

/** The certificate's target and both solutions, priced. */
export interface CertificateAllocation {
  readonly comp_id: string;
  /**
   * The component's abstained **target** — the figure both solutions tie out
   * against.
   *
   * `DATA_MODEL.md §17.1.1` splits an abstained component's rows so that the
   * target carries the obligation and opens the one Suspense item, while
   * *"a second posting for each member would relieve `1100_GATEWAY_RECEIVABLE`
   * again for one break"*; so exactly one abstained decision in a component has
   * a non-null `suspense_key`, and that row is the target. It is **found**, not
   * derived: the state, the key and the value were all decided by the run.
   *
   * `value_paise` is `§14.1`'s value, which for a `settlement` is
   * `payload.amount` — the same figure `C6` ties out against.
   */
  readonly target: {
    readonly obs_id: string;
    readonly entity_id: string;
    readonly value_paise: number;
  } | null;
  readonly solution_a: AllocationSolution;
  readonly solution_b: AllocationSolution;
}

/** `C6`'s per-member term, read off the observation. `null` off a member kind. */
function allocationPaise(observation: Observation): number | null {
  if (observation.kind === "recon_line" || observation.kind === "adjustment") {
    return observation.payload.credit - observation.payload.debit;
  }
  return null;
}

function priceSolution(
  solution: CertificateSolution,
  observationsById: ReadonlyMap<string, Observation>,
): AllocationSolution {
  return {
    candidate_id: solution.candidate_id,
    // Member order is the certificate's own and is not re-sorted: it is part of
    // the record the hash chain sealed.
    members: solution.member_obs_ids.map((id) => {
      const observation = observationsById.get(id);
      if (observation === undefined) {
        return { obs_id: id, allocation_paise: null, value_paise: null };
      }
      return {
        obs_id: id,
        allocation_paise: allocationPaise(observation),
        // §14.1's table is `@assay/cli`'s `valueOf` and is not restated here.
        value_paise: valueOf(observation),
      };
    }),
  };
}

/**
 * Price one certificate's two solutions against the run's observations.
 *
 * `decisions` is the run's own evidence, used only to find the component's
 * target row; `observationsById` is the observation set the run was executed
 * over. Neither is modified.
 */
export function certificateAllocation(
  certificate: AmbiguityCertificate,
  decisions: readonly DecisionEvidence[],
  observationsById: ReadonlyMap<string, Observation>,
): CertificateAllocation {
  const compId = certificate.comp_id as string;
  const targetRow = decisions.find(
    (d) => d.comp_id === compId && d.state === "ABSTAINED" && d.suspense_key !== null,
  );

  return {
    comp_id: compId,
    target:
      targetRow === undefined
        ? null
        : {
            obs_id: targetRow.obs_id as string,
            entity_id: targetRow.entity_id,
            value_paise: targetRow.value_paise,
          },
    solution_a: priceSolution(certificate.solution_a, observationsById),
    solution_b: priceSolution(certificate.solution_b, observationsById),
  };
}
