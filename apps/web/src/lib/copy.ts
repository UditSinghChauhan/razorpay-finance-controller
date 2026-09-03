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

/**
 * The Investigation Queue's row count for the exception population.
 *
 * "Records", not "value": the queue is a list of things to work, and its length
 * is a count of open exception records. It is deliberately worded so that it
 * cannot be read as, or against, the suspense figures below it — those are a
 * different population and {@link SUSPENSE_EXCEPTIONS_LABEL} says so.
 */
export function openExceptionRecordsLabel(records: number): string {
  return `${String(records)} open exception record${records === 1 ? "" : "s"}`;
}

/**
 * The two rupee totals on the queue header are **suspense-queue** totals, and
 * the labels now say which queue they are totals of.
 *
 * `value_abstained_paise` and `value_exceptions_paise` are the close gate's, and
 * DATA_MODEL.md §20 splits them over the unresolved items that reach the
 * suspense account — the items carrying a `suspense_key`. A row in the table
 * below can be an open exception, carry real money, and contribute to neither,
 * because §17.1.1 keys the posting to the component target rather than to every
 * affected record.
 *
 * On the demo run that is exactly what happens: twenty `E13_LEDGER_ONLY`
 * records are open and none of them is keyed, so the gate's exception total is
 * zero while the records themselves are not. A card labelled "Value Exceptions"
 * over that figure reads as a claim that the twenty records are worth nothing,
 * which is the misreading these labels exist to prevent. Neither figure is
 * adjusted, recomputed or replaced here; only the label and the basis line are.
 */
export const SUSPENSE_ABSTAINED_LABEL = "Abstained Value in Suspense";
export const SUSPENSE_EXCEPTIONS_LABEL = "Exception Value in Suspense";

export const SUSPENSE_ABSTAINED_BASIS =
  "Suspense-queue total, from the close gate. It counts the keyed component " +
  "target, not every abstained observation row listed below.";

export const SUSPENSE_EXCEPTIONS_BASIS =
  "Suspense-queue total, from the close gate. Open exception records that post " +
  "no suspense entry are outside this figure — it is not a statement of their " +
  "value. Each record's own rupee value is ranked in the table below.";

/**
 * The Command Center's ambiguity alert shows the **abstention share** of the
 * residual, never the residual.
 *
 * `DATA_MODEL.md §20` splits `unresolved_value_paise` into an abstention half
 * and an open-exception half, and the close gate reports both —
 * `value_abstained_paise` and `value_exceptions_paise`. On a period whose only
 * Suspense-opening item is the abstained settlement the two are equal, and a
 * panel headed *"Ambiguity Detected"* over the residual read correctly by
 * coincidence. On a period that also carries unattributed bank credits it does
 * not: those reach `E03`, open a Suspense item under `P5`, and are counted in
 * the exception half — so rendering the residual there would attribute money to
 * an ambiguity that no certificate covers.
 *
 * The alert therefore reads `value_abstained_paise`, and the basis line says
 * which figure it is and where the other one is. Neither is recomputed,
 * summed or derived in this app; both are the close gate's own.
 */
export const ABSTAINED_VALUE_LABEL = "Abstained Value";

export const ABSTAINED_VALUE_BASIS =
  "The close gate's abstained value — the share of the period's unresolved " +
  "value that ASSAY declined to allocate. It is not the total unresolved " +
  "value, which is reported against the close threshold under Close Gates.";

/**
 * The scenario lab's own sentence, and the reason the picker is on the page at
 * all.
 *
 * A reviewer with four buttons in front of them and no framing reads them as
 * four demos. They are not: they are four *inputs* to one frozen system. The
 * headline says the invariant and the variable in the same breath, so the
 * controller behaving differently below is legible as a consequence of the
 * evidence rather than of a mode the operator switched.
 *
 * It claims nothing about any outcome. What each period produces is rendered
 * from the trace the server actually returned; a headline that promised a
 * result would be a second answer that could disagree with the real one.
 */
export const SCENARIO_LAB_HEADLINE =
  "Same Finance Controller. Different evidence. Different action.";

export const SCENARIO_LAB_SUBHEAD =
  "One frozen engine, one close gate, one controller policy. Only the period changes — " +
  "no threshold, constraint or provider is configured differently between these four.";

/**
 * What selecting a different period means, stated where the selection is made.
 *
 * The controller panel holds one trace, and that trace is about exactly one
 * run: `CommandCenter` keys the panel on `run_id` so a completed new run
 * cannot leave the previous period's trace on screen. Between choosing a
 * period and pressing the button, though, the figures below still belong to
 * the period that ran — and a reviewer who has just clicked "Backlog" is
 * entitled to be told that, rather than to discover it by reading a rupee
 * figure that answers a question they stopped asking.
 */
export function scenarioTransitionNote(selected: string, ran: string): string {
  return (
    `New period selected. Everything below still belongs to ${ran}. ` +
    `Running ${selected} starts a new period: the controller produces a new trace over it, ` +
    `and the ${ran} trace does not carry over.`
  );
}

/**
 * `period_status`, in a reviewer's words rather than the gate's.
 *
 * The three values are `CLOSED`, `OPEN` and `BLOCKED` and they are the close
 * gate's own; nothing here replaces or recomputes one. What is added is the
 * sentence a reader who has not read `PROJECT_SPEC.md §10.2` needs in order to
 * tell a period that finished from a period that did not — the enum word alone
 * left `OPEN` looking like a neutral status rather than an unresolved one.
 */
export function periodStatusMeaning(status: string): string {
  switch (status) {
    case "CLOSED":
      return "Closed — every gate passed and the residual is inside the close threshold.";
    case "OPEN":
      return "Unresolved — the gates passed but value is still in Suspense, so the period cannot close.";
    case "BLOCKED":
      return "Blocked — a close gate failed. The period cannot close until that failure is resolved.";
    default:
      return "";
  }
}

/**
 * How the run's `llm_provider` should be read.
 *
 * `apps/api/src/registry.ts` fixes `llm_mode: "offline"` for every run, and
 * `routes/runs.ts` refuses any other value, because `PROJECT_SPEC.md §10`'s
 * demo path must not be able to fail on a missing key. That is a fact about
 * **the reconciliation engine**: it consults no model on any path.
 *
 * Rendered as `ASSAY/offline` beside a run id, it read as *"ASSAY is
 * offline"* — as though the system were degraded, or as though the
 * explanation provider had failed. Neither is what the field says. The
 * explanation provider is a separate, later, optional call
 * (`apps/api/src/explain/config.ts` resolves `anthropic` or `gemini` in the
 * server process) and its identity is reported by the explanation panel that
 * actually made the call, never here.
 */
export const ENGINE_MODEL_USE =
  "Engine: no model consulted — reconciliation is deterministic on every path.";
