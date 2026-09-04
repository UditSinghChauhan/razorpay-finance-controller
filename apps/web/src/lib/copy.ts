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
 * What this figure is **not**, said where a reviewer might otherwise carry it
 * across to the benchmark.
 *
 * The sealed benchmark publishes four coverage views side by side — recon,
 * all-observation, bank-leg and ledger-leg (`EVALUATION_SPEC.md §4.1`) — and
 * `§5.2` requires them shown together, because a run can reconcile 99% of
 * gateway-side value while the bank statement is largely untied. A demo period
 * carries none of those: `packages/ledger`'s `CloseReport` does not compute
 * them, so this app has one view and says so rather than letting one view read
 * as the whole of a three-sided reconciliation. The four benchmark figures are
 * in `README.md`, read from the committed sealed artifacts.
 */
export const RECONCILIATION_SCOPE =
  "One view of a three-sided reconciliation, over this demo period only. The bank-leg and " +
  "ledger-leg views are benchmark figures and are published in README.md from the sealed " +
  "run; this is not a benchmark result and supports no claim about coverage or harm.";

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
  return probeAttemptedSummary(probeCount);
}

/**
 * The same distinction, in the sentence the controller's escalation record
 * renders.
 *
 * `ControllerPanel`'s `escalationWhy` said *"no admissible probe could break
 * the tie"* whenever `probes_attempted` was empty. That asserts an attempt: it
 * reads as a probe having been run against the tie and lost. What actually
 * happened on the empty case is that the frozen probe policy
 * (`RECONCILIATION_SPEC.md §6.2`) offered nothing to run — the two allocations
 * were already inside ε — so no probe was required and none was available, and
 * the tie stood untouched. The two readings differ in whether ASSAY tried and
 * failed or never needed to try, which is exactly the difference between a weak
 * detector and a correct abstention.
 */
export function probeEscalationClause(probeCount: number): string {
  return probeCount === 0
    ? "no probe was required or available under the frozen probe policy, so the evidence " +
        "stayed tied"
    : `${String(probeCount)} probe(s) were run and none broke the tie`;
}

/** The heading for the certificate's probe section, which is not always "attempted". */
export function probeSectionHeading(probeCount: number): string {
  return probeCount === 0 ? "Probes — none required" : `Probes attempted (${String(probeCount)})`;
}

function probeAttemptedSummary(probeCount: number): string {
  const noun = probeCount === 1 ? "probe" : "probes";
  return (
    `${String(probeCount)} ${noun} attempted; none produced admissible evidence ` +
    `that discriminates the hypotheses.`
  );
}

/**
 * How this run's ledger is actually verified, stated without naming a command
 * that does not work.
 *
 * The certificate used to print `assay verify --run <first 16 chars of run_id>`.
 * Three things were wrong with it and any one is enough to strand a reviewer:
 * `apps/cli/src/commands/verify.ts` reads `--run` as a **directory** under
 * `runs/`, not as a run id; the id was truncated to sixteen characters, so it
 * was not even the whole value; and without `--events` the command raises
 * `UnavailableStageError` and exits, because `ARCHITECTURE.md §8`'s SQLite
 * store is not built and there is no reader for the Layer A log.
 *
 * What does work is the Verify Ledger page, which recomputes the chain from
 * genesis over the live `GET /runs/:id/ledger/verify`. That is what the copy
 * names. The identifiers stay on the page and stay copyable, because they are
 * what a reviewer checks the recomputation against — what is removed is the
 * instruction to run something that cannot succeed.
 */
export const CERTIFICATE_VERIFY_HOW =
  "Verify this on the Verify Ledger page: it recomputes the hash chain from genesis over " +
  "this run's own event log and re-projects the balances, then reports where that " +
  "recomputation lands.";

export const CERTIFICATE_VERIFY_IDS =
  "The identifiers above are the inputs to that check, copyable in full. No CLI step is " +
  "required, and none is offered here: the repository's `assay verify` needs a run " +
  "directory and an exported event log that this in-process demo does not write.";

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

/* ═══════════════════════════════════════════════════════════════════════════
   REVIEWER-FIRST VOCABULARY

   One wording per concept, in one file, used on every page. The pages had
   drifted into saying "decision", "outcome" and "result" for the same thing
   and, worse, into three different sentences for the authority ordering — the
   one fact the product cannot afford to leave ambiguous.

   Nothing below states a figure, a threshold or a scenario outcome. These are
   sentences about what the system IS; every quantity on every screen still
   comes from the API response that screen renders.
   ═══════════════════════════════════════════════════════════════════════════ */

/** What this is, in the words a reviewer would use to describe it afterwards. */
export const PRODUCT_WHAT =
  "A Finance Controller for settlement reconciliation — deterministic on the money, " +
  "agentic on the workflow around it.";

/** What is agentic about it, named as the loop's own stages rather than as a claim. */
export const PRODUCT_AGENTIC =
  "The Controller observes the close gate, triages the exception queue, plans a bounded " +
  "inspection, acts through read-only tools, and escalates to human review what it may " +
  "not decide.";

/**
 * The authority ordering, in one line.
 *
 * The legend below the fold states it in three cards; this is the same
 * ordering compressed to a sentence, for the top of the page where a reviewer
 * meets the three names for the first time. The two must not disagree, so the
 * sentence lives here and the top of the page reads it rather than restating
 * it.
 */
export const AUTHORITY_ONE_LINE =
  "ASSAY decides. The Controller chooses what to inspect next. The explanation model describes " +
  "a decision already made.";

/**
 * The explanation layer's name in generic copy, and why it is not a brand.
 *
 * `apps/api/src/explain/config.ts` resolves the provider at request time from
 * `ASSAY_EXPLAIN_PROVIDER`, defaulting to `anthropic` and supporting `gemini`.
 * Naming either one in standing copy states a fact about the server that the
 * server did not report, and on a default-configured process it contradicts the
 * explanation panel's own footer, which prints the provider that actually
 * answered. Every generic surface therefore says "the explanation model", and
 * the concrete provider and model id appear only where the response supplies
 * them — see {@link resolvedModelLine}.
 */
export const EXPLANATION_MODEL_NOUN = "the explanation model";

/** The authority sentence the explanation panel carries on every branch. */
export const EXPLANATION_AUTHORITY_LINE =
  "ASSAY made the decision. The explanation model describes the verified evidence, and can " +
  "change nothing.";

/**
 * The concrete provider, from the response that named it.
 *
 * Rendered only on the `ok` branch, where `provider` is non-null: this is the
 * one place a provider name is a measurement rather than an assumption.
 */
export function resolvedModelLine(modelId: string, provider: string): string {
  return `Model ${modelId} via ${provider}`;
}

/**
 * Why no model can move money here, stated structurally.
 *
 * Three separate facts, each checkable on screen: the engine's own `llm_mode`,
 * the controller's tool registry and its `writes_applied` counter, and the
 * explanation layer's grounding record. It is not a promise about behaviour —
 * it is a statement about what surface exists to be misused.
 */
export const NO_MODEL_WRITES =
  "No model can change the books. The reconciliation engine consults none, the Controller's " +
  "tool surface is four reads, and the explanation layer is removable.";

/** What is at stake while a decision is unresolved, in the ledger's own terms. */
export const UNRESOLVED_MEANING =
  "Unresolved value stays in Suspense. The ledger remains balanced and nothing is written " +
  "off, suppressed or guessed — the period simply cannot close until a person resolves it.";

/**
 * The Finance Controller's availability, before it has been run.
 *
 * Stated as availability rather than as a result: the panel has not run, so
 * the page must not imply an outcome for it. `ControllerPanel` renders the
 * actual outcome once a trace exists.
 */
export const CONTROLLER_NOT_RUN =
  "Not yet run — the bounded agentic workflow is available on this period.";

/**
 * What the Evidence Trail's ledger section actually shows.
 *
 * "Ledger Event" read as an application log line. It is not one: it is the
 * accounting consequence of the deterministic decision above it — the posting
 * ASSAY made, sealed into the hash chain, with the hashes that make it
 * checkable. The heading now says which of those three it is.
 */
export const LEDGER_EVENT_HEADING = "Accounting consequence — the sealed ledger event";

export const LEDGER_EVENT_BASIS =
  "Not an application log. This is the posting the deterministic decision caused, sealed " +
  "into the run's hash chain: what was written, by which component, and the hashes that " +
  "let it be recomputed.";

/**
 * What the Ambiguity Certificate is, relative to the Evidence Trail.
 *
 * A reviewer arriving on the certificate from a queue row has no way to know
 * that it is the formal record of the same decision whose evidence they were
 * just reading. The two pages are one decision seen twice, and both now say so.
 */
export const CERTIFICATE_RELATIONSHIP =
  "The formal certificate produced from this decision's Evidence Trail — the same decision, " +
  "as the sealed record states it.";

/* ═══════════════════════════════════════════════════════════════════════════
   STATES A REVIEWER CAN LAND IN, AND THE FIGURES THAT NEED A DENOMINATOR

   Everything below either names a state the app can be in, or supplies the
   scope of a number the app already renders. Nothing here computes a figure,
   and nothing here states an outcome the API did not report.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The API being unreachable is an operator state, not a run result.
 *
 * `fetch` rejects with `TypeError: Failed to fetch` when nothing is listening,
 * and the page used to render that string as its whole explanation. It names no
 * cause a reviewer can act on: it does not say which process is missing, where
 * it should be, or how to start it. The three facts that do are the address the
 * frontend proxies to, the command that starts that process alone, and the fact
 * that no credential is involved — a reviewer who has just been told a model is
 * optional should not be left wondering whether a missing key is the cause.
 *
 * The raw message is not discarded; it moves below the actionable text, where a
 * developer can still read it.
 */
export const API_UNAVAILABLE_HEADLINE = "ASSAY's API is not reachable";

export const API_UNAVAILABLE_BODY =
  "The engine API should be listening on 127.0.0.1:8787 and is not answering. Start it with " +
  "`pnpm run dev:api`, or `pnpm run dev` to start the API and this frontend together, then " +
  "retry. No API key is needed — the reconciliation engine runs fully offline.";

export const API_UNAVAILABLE_DETAIL_LABEL = "Underlying error";

/**
 * Whether a failure was the API being absent rather than a run refusing.
 *
 * A rejected `fetch` carries no status, so the distinction has to be made on
 * the message. A `4xx`/`5xx` from a server that answered is a different event
 * and keeps its own text: the API states its reason in the body, and replacing
 * that with "start the server" would be worse than the raw string this exists
 * to replace.
 */
export function isApiUnreachable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("econnrefused") ||
    m.includes("fetch failed")
  );
}

/**
 * What this certificate is, and is not, evidence of.
 *
 * The certificate on screen is a real abstention: the machinery ran, the two
 * hypotheses tied inside ε, and the record is the one `RECONCILIATION_SPEC.md`
 * specifies. What it is not is a measurement of how often ASSAY abstains
 * correctly, because the sealed corpus never posed the question — `V35`
 * records `truly_ambiguous`, `abstentions` and `probes_spent` as `0` on all 50
 * scored units, so the TEST population contains no truly ambiguous target and
 * the benchmark reports no abstention rate, precision or probe figure.
 *
 * One sentence, next to the result, because a reviewer reading a certificate
 * is exactly the reader who would otherwise take it for the benchmark's
 * verdict on abstention. It states the boundary and points at the disclosures;
 * it does not restate them, and it weakens nothing about the record beside it —
 * every field on this page is still the certificate's own.
 */
export const CERTIFICATE_BENCHMARK_BOUNDARY =
  "Benchmark boundary: the sealed TEST corpus contains zero truly ambiguous targets, so " +
  "abstention is demonstrated here rather than quantitatively measured by the benchmark. " +
  "See the README benchmark disclosures.";

/**
 * A run id that outlived the process holding it.
 *
 * `apps/api/src/registry.ts` keeps runs in an in-process `Map`, so a restart
 * drops every one of them, and a bookmarked or reloaded URL can name a run the
 * server no longer holds. That is a real state with one honest answer: say the
 * run is gone, say why, and offer a new one. It is never filled in from a cached
 * figure — {@link RunContext} persists a run id and a period id and nothing
 * else, so there is no stale rupee value available to show even by accident.
 */
export const RUN_NOT_FOUND_HEADLINE = "That run is no longer held by the API";

export const RUN_NOT_FOUND_BODY =
  "Runs live in the API process's memory for the life of the server, so a run started before " +
  "a restart is gone. Nothing financial was cached in this browser — only the run id and the " +
  "period name — so there is no stale figure to show. Run the period again to get a fresh one.";

/**
 * A `404` that is about the route, not about the run.
 *
 * `apps/api` answers `404` twice over, and the two are unrelated events.
 * `apps/api/src/routes/runs.ts` answers `{"error": "unknown_run"}` when the
 * registry does not hold the id — the state {@link RUN_NOT_FOUND_HEADLINE}
 * describes — while `apps/api/src/app.ts`'s fallback answers
 * `{"error": "not_found"}` when nothing matched the request at all. The second
 * is what a frontend built against `GET /runs/:id` gets from an API process
 * that predates the route, which is a live possibility precisely because the
 * API does not hot-reload: `pnpm run dev` starts a Node process that keeps
 * serving the build it started with until it is restarted.
 *
 * Reported as a version mismatch and never as a missing run, because the
 * server never looked the run up. Saying *"that run is gone"* on this branch
 * would be a statement about financial state that no response supports — and
 * saying *"the API is not reachable"* would contradict the API that answered.
 */
export const API_MISMATCH_HEADLINE = "This API build does not support run rehydration";

export const API_MISMATCH_BODY =
  "The API answered, and has no GET /runs/:id route — so this frontend is newer than the " +
  "process it is talking to. Restart the API with `pnpm run dev:api` (or `pnpm run dev` for " +
  "both), then retry: the API does not hot-reload, so a process started before this revision " +
  "keeps serving the build it launched with. Nothing about the run itself was reported — the " +
  "server never looked it up — so no figure and no verdict is shown for it here.";

/**
 * The controller's runtime checks, named for what they actually are.
 *
 * *"Runtime checks — 12/12 passed"* reads as an external certification. It is
 * not one: `packages/controller/src/telemetry.ts` derives every check from the
 * controller's own trace, in the same process that produced it, and stamps the
 * result `EXPLORATORY` for that reason. They are worth showing — a self-check
 * that fails is still a finding — but they must not read as independent
 * attestation, and the one surface on this app that *is* independent
 * recomputation is the Verify Ledger page.
 *
 * The count is unchanged. Only the name and the sentence beside it move.
 */
export const RUNTIME_ASSERTIONS_LABEL = "Runtime policy assertions";

export const RUNTIME_ASSERTIONS_BASIS =
  "Self-checks the controller derives from its own trace in the same process that produced " +
  "it — runtime invariants, not an independent audit, which is why they are labelled " +
  "EXPLORATORY. Independent recomputation of this run is on the Verify Ledger page.";

/**
 * `steps / step_budget`, which is `65 / 64` on a run that hit the bound.
 *
 * The arithmetic is correct and is not touched here.
 * `packages/controller/src/policy.ts` emits one final transition when
 * `stepsTaken >= budget` — the `SEQ_BUDGET` rule moving the machine to
 * `COMPLETE` — and that transition is itself recorded as a step. So a run that
 * consumed its whole 64-step budget records 65 steps: sixty-four of work and
 * one saying it stopped. `apps/api/tests/scenarios.test.ts` pins
 * `steps.length > DEFAULT_STEP_BUDGET`, which is the behaviour being described.
 *
 * Rendered as a bare `65 / 64` it reads as a bound that was broken. What is
 * shown instead is the work against the bound it was measured on, with the stop
 * record named separately, so nothing is hidden and nothing exceeds anything.
 */
export function stepBudgetLabel(steps: number, budget: number): string {
  const capped = Math.min(steps, budget);
  return steps > budget
    ? `${String(capped)} / ${String(budget)} — bound reached`
    : `${String(steps)} / ${String(budget)}`;
}

/**
 * The same reconciliation, compact enough to sit under the telemetry counters.
 *
 * {@link stepBudgetLabel} renders `65 / 64` as `64 / 64 — bound reached`, which
 * is the honest reading but is NOT the trace's raw `steps`. The telemetry block
 * states that every figure in it is recomputable from the trace, so the raw
 * value has to be on screen there too — `stepBudgetBasis`'s paragraph is in the
 * outcome banner, several sections up, and a reader checking the counters
 * against `trace.steps.length` should not have to scroll to find out why the
 * two differ by one.
 *
 * `null` when the run finished inside its bound, because then the counter is
 * the raw value and there is nothing to reconcile.
 */
export function stepBudgetCounterBasis(steps: number, budget: number): string | null {
  if (steps <= budget) return null;
  return (
    `${String(budget)} work steps against a ${String(budget)}-step budget; the trace holds ` +
    `${String(steps)} records, the last being the terminal SEQ_BUDGET record marking the stop.`
  );
}

export function stepBudgetBasis(steps: number, budget: number): string {
  return steps > budget
    ? `The controller used its full ${String(budget)}-step budget and stopped itself. The ` +
        `trace holds ${String(steps)} records: ${String(budget)} of work, plus one terminal ` +
        `SEQ_BUDGET record marking where it stopped. The bound was reached, not exceeded.`
    : `${String(steps)} of a ${String(budget)}-step budget. The controller finished before ` +
        `the bound.`;
}

/**
 * What the pipeline strip's `Validate S5` count is a count of.
 *
 * Every earlier node counts one population: `Ingest` and `Anchor S1` count
 * observations, `Candidates S2` and `Solve S4` count decisions. `Validate S5`
 * counts `decisions + open_exceptions`, which is larger than `S4`'s figure and
 * reads, unexplained, as validation having produced new decisions. It has not:
 * `S5` is where each candidate allocation is checked against `I1`–`I8` and
 * either committed as a decision or routed to an exception, so its count is the
 * two outcomes of one stage rather than a new population. The strip also shows
 * five of the pipeline's stages rather than all of them; `S0` and `S3` post
 * nothing a per-stage count could be taken over, so they are named here instead
 * of drawn as nodes with no number.
 */
export const S5_COUNT_BASIS =
  "Validate S5 counts both outcomes of one stage — the decisions it committed plus the " +
  "exceptions it routed — so it is larger than Solve S4's decision count without any new " +
  "decision having been made. S0 (orchestration) and S3 (pruning) carry no per-stage count " +
  "and are not drawn.";

/** What Audit Logs verifies, said where a reviewer might expect a log viewer. */
export const AUDIT_SCOPE =
  "Verifies this run's ledger chain. Not an application log viewer: it re-hashes the run's " +
  "events from genesis and re-adds the balances, then reports where that recomputation lands.";

/**
 * The page's name, which was the reason the subtitle above had to exist.
 *
 * *"Audit Logs"* promises a browsable event log and this page is not one — it
 * recomputes the hash chain over `GET /runs/:id/ledger/verify` and reports a
 * verdict. The subtitle stays, because the name being right does not make the
 * scope obvious, but the name no longer contradicts it.
 */
export const VERIFY_LEDGER_TITLE = "Verify Ledger";
