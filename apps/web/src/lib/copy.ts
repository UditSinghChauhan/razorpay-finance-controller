/**
 * Copy whose wording carries a data semantic.
 *
 * These strings live together because each one exists to stop a real reading
 * error, and because a phrase that has to stay accurate is easier to keep
 * accurate when it is written once and asserted on directly.
 */

/**
 * The Command Center's granularity: how many abstention DECISIONS the run made.
 *
 * `POST /runs` reports two different abstention counts and they are both right:
 * `summary.abstentions` is the number of decisions ASSAY declined to make, and
 * `summary.observation_states.ABSTAINED` is the number of observations those
 * decisions covered. On the demo run they are 1 and 6. DATA_MODEL.md §17.1.1 is
 * why they differ: one abstained component posts once, keyed to its target,
 * while every member of that component still reaches an ABSTAINED terminal
 * state, because §9 lets nothing be dropped.
 */
export function abstentionDecisionLabel(decisions: number): string {
  return `${String(decisions)} abstention decision${decisions === 1 ? "" : "s"}`;
}

/**
 * The Investigation Queue's granularity: how many OBSERVATIONS those decisions
 * affected.
 *
 * The queue is observation-level by design -- ARCHITECTURE.md §9 ranks it "by
 * rupee value", and a member carrying real money must be visible as its own row
 * rather than folded into the target's. So six rows is not six abstentions; it
 * is the observation-level consequence of one.
 */
export function affectedObservationsLabel(observations: number): string {
  return `${String(observations)} affected observation${observations === 1 ? "" : "s"}`;
}

/** One sentence tying the queue's row count back to the decision count. */
export function abstentionGranularityNote(
  decisions: number,
  observations: number,
): string {
  return (
    `${affectedObservationsLabel(observations)} — the observation-level ` +
    `consequences of ${abstentionDecisionLabel(decisions)}. The Command Center ` +
    `counts the decision once; this queue lists every observation it covers.`
  );
}

/**
 * The Command Center's reconciliation figure is **value-weighted**, and the
 * label says so.
 *
 * It is `(batch_value_paise − unresolved_value_paise) ÷ batch_value_paise`, both
 * read from the close report. A count-weighted figure over the same run --
 * reconciled observations ÷ observations -- is a different number, and a bare
 * "Reconciled 92.6%" invites it to be read as that.
 */
export const RECONCILIATION_LABEL = "Value-Weighted Reconciliation";

export const RECONCILIATION_BASIS =
  "Value-weighted reconciliation = (batch value − unresolved value) ÷ batch value, " +
  "both from the close report. It is not a count of observations.";

/**
 * What the certificate's probe section may truthfully say.
 *
 * The wording matters because the empty case is not a failure. With
 * `probes_attempted: []` and reason `EVIDENCE_TIE`,
 * RECONCILIATION_SPEC.md §6's ladder found the two allocations already tied
 * within ε — no probe was required, so "no probe produced admissible evidence"
 * asserts an outcome for probes that were never run.
 *
 * Where probes WERE run and the certificate still issued, they genuinely failed
 * to discriminate, and the sentence says that instead. No reason other than
 * EVIDENCE_TIE gets an explanation invented for it: the count is reported and
 * the terminal reason is displayed beside it.
 */
export function probeSummary(probeCount: number, reason: string): string {
  if (probeCount === 0) {
    return reason === "EVIDENCE_TIE"
      ? "0 probes required — the evidence scores were already tied."
      : "0 probes were run.";
  }
  const noun = probeCount === 1 ? "probe" : "probes";
  return (
    `${String(probeCount)} ${noun} attempted; none produced admissible evidence ` +
    `that discriminates the hypotheses.`
  );
}
