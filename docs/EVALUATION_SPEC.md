# EVALUATION_SPEC — ASSAY

**Spec version:** 1.4.24 · **Date:** 2026-08-28

**At spec 1.4.24** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.31`.

**At spec 1.4.23** this document is unchanged apart from the version header. **No
metric formula, definition, number or count changes** — the frozen list stays at
**28**. See `DECISION_BRIEF.md §A.30`.

**At spec 1.4.22** `§4.3`'s gloss on `silent_guess_value_inr` and `§2`'s
input description are corrected, and `§4.13` records that a **negative
`gap_to_oracle` is valid** and requires metrics 4 and 8 to be reported beside the
probe count. **No metric formula, definition, number or count changes** — the
frozen list stays at **28** — and `DISCRIMINATED` is not redefined. See
`DECISION_BRIEF.md §A.29`.

Every metric answers the question: **what decision does this number let someone
make?** A metric that does not change anyone's behaviour is not reported.

**At spec 1.4.6** this document is unchanged apart from the version header. **No
metric definition changes.** Metric 26's `tau_sensitivity` sweep is unaffected —
it sweeps `τ` over absolute values and does not read the base. See
`DECISION_BRIEF.md §A.13`.

**At spec 1.4.5** this document is unchanged apart from the version header. **No
metric definition changes.** Metric 11 `period_status_distribution` is expected to
be structurally degenerate on the frozen population and is reported with its
cause (`PREREGISTRATION.md §10` V19); metrics 12, 13 and 14 are unaffected and
`BLOCKED` must still be 0. See `DECISION_BRIEF.md §A.12`.

**At spec 1.4.4** this document is unchanged apart from the version header. **No
metric definition changes.** Metric 27 `coverage_by_value_bank` is bounded by
`AN2` alone under `DATA_MODEL.md §11.1`; the figure is published unchanged with
its explanation, as metric 28 already is (`PREREGISTRATION.md §10` V18). See
`DECISION_BRIEF.md §A.11`.

**At spec 1.4.3** this document is unchanged apart from the version header. **No
metric formula, universe or threshold changes.** `§5.4`'s oracle-gate report line
should carry the count of targets that entered enumeration alongside the pass, so
a reader can see the completeness gate was exercised rather than vacuous
(`PREREGISTRATION.md §10` V17). See `DECISION_BRIEF.md §A.10`.

**At spec 1.4.2 / benchmark 1.0.3** this document is unchanged apart from the
version header. **No metric formula, universe or threshold was amended.**
`PREREGISTRATION.md §4.2`'s batch-composition rule moves realized values only —
metrics 1 and 9 downward, metric 2 upward by one `C_exception` per unsettled
refund — with `batch_value_paise` and every §4.1 denominator unchanged. The full
dependency statement is at `PREREGISTRATION.md §8`.

**At spec 1.4.1 / benchmark 1.0.3** this document disclosed the consequences of
retiring anchor `AN5` (`RECONCILIATION_SPEC.md §3`): metric 28
`coverage_by_value_ledger` reads `0.0` by construction, metric 9 is depressed by a
denominator its ledger-entry members cannot leave, and metric 2 carries one
`C_exception` per ledger entry — identical across every agent, so no comparison
shifts (§4.1, §4.5, §6). **No metric formula, universe or threshold was amended**;
the effects are published with their explanations and one `EXPLORATORY` companion
line. Benchmark v1.0.3 is unchanged. See `PREREGISTRATION.md §8` and
`DECISION_BRIEF.md §A.8`.

**At spec 1.4.0 / benchmark 1.0.3** this document amended **metric 12**'s
universe — `unresolved_value_inr` is summed over open Suspense items rather than
over every reconcilable observation in a non-resolved state (§4.9) — and restated
**metric 13** against the item key now defined in `DATA_MODEL.md §16`. The v1.0.2
universe is retained and reported every run as `unresolved_value_inr_multiview`,
labelled `EXPLORATORY`. **This lowers metric 12 and makes `CLOSED` easier to
reach** — through two separate channels, the view collapse and the seven
exception classes that §17.1.1 gives no Suspense item — and it is nevertheless
required: under the v1.0.2 universe gate G3 was unsatisfiable and every run ended
`BLOCKED`. Metric 28's denominator field name
was corrected to `gross_paise` (§4.1), and §6 now requires exceptions that open
no Suspense item to be reported separately. Direction of effect and the full
dependency statement are in `PREREGISTRATION.md §8` and `DECISION_BRIEF.md §A.7`.
The paragraphs below describe the earlier releases and are retained as history.

**At spec 1.3.0 / benchmark 1.0.2** this document amended **metric 6**: both
`balance_harm_inr` and `misdirected_value_inr` are now computed over the covered
set only (§4.4), and the ε sweep is written in basis points (§5.1, §5.3). Metric 6
is the package's one formula change; metrics 2, 3 and 8 change in **value** as a
result, and the direction of effect is disclosed in `PREREGISTRATION.md §8` and
`DECISION_BRIEF.md §A.6`. The paragraphs below describe the earlier **1.2.0** and
**1.1.1** releases and are retained as history.

**At spec 1.2.0 / benchmark 1.0.1** this document amended metrics 1, 9 and 13,
appended metrics 27 and 28, and restated §4.4's ground-truth basis and §4.9's
close-loop block — see `DECISION_BRIEF.md §A.5`.

Spec 1.1.1 changed **no metric, no baseline, no ablation and no sweep.** It was a
factual-correction pass over statements about Razorpay behaviour; the frozen
metric list in `PREREGISTRATION.md §8` is untouched. It did add two reporting
rules, both of which constrain how claims are presented rather than what is
measured: report requirement 11 (§5.4), which requires the provenance register,
and one forbidden practice (§5.5), which bars describing an ASSAY modelling
assumption as documented Razorpay behaviour.

---

## 1. Framing: this is selective prediction, not classification

ASSAY may decline to answer. That makes accuracy alone meaningless — any system
can reach 100% accuracy on the questions it chooses to answer. The correct
framework is **selective prediction**: a predictor paired with a gate, evaluated
on the joint behaviour of both.

The two quantities that matter together:

- **Coverage** — the fraction of the batch on which a decision was committed.
- **Selective risk** — the error among covered decisions.

Neither is meaningful alone. Reporting one without the other is the standard way
an abstaining system flatters itself, and it is the first thing a competent
reviewer will check for.

The headline artifact is therefore the **risk–coverage curve** (`§5.1`) and its
integral, **AURC**, denominated in rupees.

---

## 2. Test protocol

```
  for split in {dev, test}:
    for seed in seeds(split):
      generate observations + ground truth      (generator, seeded)
      oracle: enumerate from observations ONLY  -> ambiguity labels
      oracle completeness gate  (vs ground truth, offline)   MUST PASS
      oracle consistency gate   (vs engine, differential)    MUST PASS
      for agent in {ASSAY, B0, B2, A1, A2, A3}   (+ B1 if built):
        run agent on observations only, --llm=replay --strict-replay
        attempt period close -> CLOSED | OPEN | BLOCKED
        score(agent output, ground truth, oracle labels) -> metrics.json
  aggregate over seeds -> mean ± bootstrap 95% CI -> report.html
```

Rules:

- **No agent ever sees ground truth or oracle labels.** Enforced structurally
  (`PREREGISTRATION.md §6.2`, AL1–AL2). The completeness gate runs offline inside
  the generator's trust zone, before any agent exists.
- **An agent's inputs are the observation files plus, from spec 1.4.22, the
  PG-side recon report reachable only through `RECONCILIATION_SPEC.md §6.2`'s
  probe under `P_max`.** The protocol line above reads *"observations only"* in
  the sense that matters — no ground truth, no oracle labels — and the recon
  report is neither. The **oracle** remains observations-only and is barred from
  the report by `AL8` (`PREREGISTRATION.md §5.1`, §5.3), so the oracle's
  reference universe is deliberately smaller than the agents'.
- **Every configuration runs on ≥ 5 seeds.** Single-run numbers are banned from
  the report; a figure without a confidence interval is not a result.
- **All agents run on byte-identical observation files.** Same input, same
  scorer, differences attributable to the agent alone.
- **All scored runs use `--llm=replay --strict-replay`**, so results are
  bit-reproducible and a cache miss is a hard error rather than a silent live
  call. The cache is populated by one recorded `--llm=<live provider> --record`
  pass whose provider, model ID, token counts and cost are reported.
- **Every configuration is additionally run with `--llm=offline`** and every
  primary metric is published for both, as metric 24 `offline_parity`. This is
  how the LLM's contribution is measured rather than asserted.
- **Every run attempts a period close.** A run that ends `BLOCKED` is a defect
  and fails the build; the distribution of `CLOSED` vs `OPEN` is a reported
  result.

## 3. Agents under evaluation

### 3.1 Baselines — what someone would plausibly build instead

These are not strawmen. Each is the honest best version of a real approach, and
none is presented as a third-party agent that ASSAY "judges." They are reference
points for our own system.

| ID | Agent | What it represents | Why it is a fair comparison |
|---|---|---|---|
| `B0-IDONLY` | Exact join on `settlement_id` and normalized UTR. Everything else → exception. | A competent scripted reconciliation | It is genuinely optimal on clean data; its failure mode is coverage, not error. The honest floor. |
| `B1-GREEDY` *(stretch — `DECISION_BRIEF.md §H`, tier H2)* | First-fit greedy subset match on amount within a ±3-day window, ties broken by proximity | Spreadsheet / legacy recon tooling | What many finance teams actually run today. Implemented well, not crippled. Omitted from Tier-0 because the ablations carry the argument; its absence weakens breadth, not validity. |
| `B2-LLM-DIRECT` | The batch is chunked into the context window; the model is asked for the allocation JSON; the output is accepted | **The obvious build under time pressure** | The fair comparison, because it is what a strong team would ship in a week without ASSAY's architecture. Given the same provider, model, prompt-engineering effort and total token budget as ASSAY. |

`B2` is the important one. If ASSAY cannot beat a well-prompted direct LLM on net
cost, the architecture is not earning its complexity, and the report must say so.

### 3.2 Ablations — the scientific controls

Same system, one component removed. These are what make the evaluation
non-circular: unlike an agent someone else wrote, an ablation differs from ASSAY
in exactly one respect, so the difference is attributable.

| ID | Removed | Hypothesis it tests |
|---|---|---|
| `A1-NOVALIDATE` | Stage S5 invariants I1–I9 | *The deterministic validator prevents real financial error.* Expected: higher `balance_harm_inr`, hallucinated IDs admitted, trial balance breaks, runs end `BLOCKED`. |
| `A2-NOABSTAIN` | Abstention; always commits the top candidate | *Abstention is worth its cost.* Expected: coverage 100%, sharply higher harm and net cost, Suspense near zero — the "100% matched, 0 exceptions" failure mode, reproduced deliberately. |
| `A3-NOLLM` | All four LLM roles → the `offline` provider | *The LLM contributes measurably.* **This may fail, and failing is a legitimate result.** |

**`A3-NOLLM` is exactly `ASSAY --llm=offline`**, which means the `offline_parity`
comparison for ASSAY (metric 24) and the `A3` ablation are the same measurement
viewed two ways: parity asks "how much did the model change the numbers," and the
ablation asks "does the model earn its place." One run answers both. The ablation and the offline
demo path are the same component (`ARCHITECTURE.md §6.5`), which has three
consequences worth stating: the deterministic counterparts are built properly
rather than sabotaged, because the demo depends on them; the ablation is
exercised by the normal test suite; and a rigged ablation would break the demo,
so the incentive runs the right way. A rigged ablation is worse than no ablation,
because it converts a real result into a fabricated one.

## 4. Metric definitions

### 4.1 Coverage

Coverage is measured over the **reconcilable** observation universe only
(`DATA_MODEL.md §10.1`). Reference-kind observations reach the `REFERENCE`
terminal state, are never matched, never post to the ledger, and appear in no
coverage numerator or denominator.

**Recon view — the primary value metric (1) and the count metric (9).**
Numerator and denominator draw on the *same* reconcilable universe, and for
`coverage_by_value` specifically on `recon_line`:

```
  batch_value_paise = Σ over all recon_line observations of payload.amount

  coverage_by_value = Σ recon_line.amount where state = RECONCILED
                      ───────────────────────────────────────
                                  batch_value_paise

  coverage_by_count = |RECONCILED over reconcilable kinds|      (metric 9)
                      ──────────────────────────────────────
                      |observations of reconcilable kinds|
```

**Secondary views (metrics 27 and 28), both mandatory:**

```
  coverage_by_value_bank   = Σ bank_line.amount   where state = RECONCILED
                             ────────────────────────────────────────────
                             Σ bank_line.amount

  coverage_by_value_ledger = Σ ledger_entry.gross_paise where state = RECONCILED
                             ────────────────────────────────────────────
                             Σ ledger_entry.gross_paise
```

**`gross_paise`, corrected.** `MerchantLedgerEntry` (`DATA_MODEL.md §8`) carries
`gross_paise`, `expected_net_paise` and `gl_account`, and declares **no `amount`
field**; the formula named one that does not exist. `gross_paise` is the only
field on the entity that is a gross rupee figure, so the correction is forced
rather than chosen: `expected_net_paise` is the merchant's *guess* at the
post-fee net and is nullable, which fails both as a denominator and as a
like-for-like counterpart to `bank_line.amount`. `BankStatementLine` does
declare `amount`, so metric 27 above is unaffected.

**Metric 28 reads `0.0` by construction at spec 1.4.1, and this is a scope
statement rather than a performance figure.** `AN5` — the merchant ledger's only
anchor — is retired in `RECONCILIATION_SPEC.md §3`, because evaluating it would
require `order.receipt`, which `DATA_MODEL.md §0` rule 4 quarantines, and because
`THREAT_MODEL.md §T5` holds the ledger to soft evidence only. A `ledger_entry` is
never a target and cannot be a candidate member, so with `AN5` retired it has no
route to `RECONCILED`: the numerator is structurally empty on every run, for every
agent, on every seed. **The figure is published unchanged and this paragraph is
published with it.** Its definition is not amended to compensate, and no threshold
or composition is adjusted to move it — the quantity is honest and the
explanation belongs beside it. Metric 27 `coverage_by_value_bank` is unaffected:
`AN2` reads `settlement.utr` and `bank_ref`, both structural.

**Metric 9 `coverage_by_count` is depressed by the same cause, and is likewise
not amended.** `ledger_entry` is a reconcilable kind (`DATA_MODEL.md §10.1`), so
it sits in metric 9's denominator and can never leave it — the precise shape of
the defect this section corrected for reference kinds at benchmark v1.0.1. It is
**not** corrected the same way here: reclassifying `ledger_entry` as a reference
kind would delete `E13_LEDGER_ONLY` and with it `THREAT_MODEL.md §T5`'s detection,
which is a worse trade than a depressed rate. Reported with this note attached.

**Why the universes must match.** A single ₹1,000 payment surfaces as up to six
observations across `recon_line`, `payment`, `order`, `ledger_entry` and shares of
`settlement` and `bank_line`. Under a numerator over all observations and a
denominator over all observations, one economic rupee is counted several times on
both sides at inconsistent weights, and the ratio is not bounded by 1.0. A
quantity that can exceed unity is not a coverage rate.

The same restriction applies to `coverage_by_count` (metric 9), and is forced
rather than chosen: reference-kind observations reach `REFERENCE` and can never
reach `RECONCILED`, so leaving them in the denominator would cap the metric
permanently below 1.0 and make a perfect run indistinguishable from an imperfect
one. Metric 9's definition is therefore amended alongside metric 1.

**Why `recon_line`.** Four constraints in this specification jointly determine the
denominator, and exactly one candidate satisfies all four:

1. It must be computable from observations alone — `coverage_by_value` is a field
   of `CloseReport` (`DATA_MODEL.md §20`), emitted by the running system, and
   `PREREGISTRATION.md §6.2` AL2 forbids the engine reading ground truth.
2. It must be agent-independent — §2 requires all agents to run on byte-identical
   observation files with differences attributable to the agent alone. A
   denominator requiring cross-kind identity resolution would be agent-dependent,
   because identity resolution is exactly what `F04` and `F08` attack.
3. It must carry each economic event once, or the ratio is unbounded.
4. It must be rupee-denominated (`PROJECT_SPEC.md §7` S2).

`Σ bank_line.amount` fails (3) — `I5` makes bank lines aggregates — and is not
commensurable with gross payment value because bank amounts are net of fees. A
ground-truth denominator fails (1). A deduplicated economic-event set derived from
observations fails (2). `Σ recon_line.amount` satisfies all four.

**Decision enabled:** "How much of my close is automated?" `coverage_by_value` is
primary because abstaining on the three largest settlements while reconciling
9,997 small ones is a bad outcome that the count metric would hide.

**What the primary metric does not measure, and why three views are published.**
Recon-view coverage measures automation of the *payment-gateway-side* workload
only. Reconciliation is three-sided, and a run can show 99% recon-view coverage
while the bank statement is largely untied. The bank view does not solve that — it
**exposes** it. **The ledger view does not, at spec 1.4.1**: metric 28 is
structurally `0.0` because `AN5` is retired, so it bounds nothing and exposes
nothing about reconciliation quality. Two views are tied out against each other
and the third is held as soft evidence — `PROJECT_SPEC.md §1` states it in those
terms. No weighting of three views into one scalar is
defensible, and any weighting would be tunable, so all three are published
side by side and none is collapsed into the others.

**Audit line (`EXPLORATORY`).** Every report additionally carries

```
  coverage_by_value_all_observations = Σ value(RECONCILED over all observations)
                                    ──────────────────────────────────────────
                                    Σ value(all observations)
```

computed under the spec 1.1.1 definition of this metric and labelled
`EXPLORATORY` per `PREREGISTRATION.md §8`. It supports no claim. It exists so that
a reviewer can see both definitions and the transition between them without
re-running anything.

### 4.2 Match precision / recall — at the allocation-edge level

The unit is an **edge**: a `(entity_id, target_id)` allocation pair. Records are
the wrong unit because a settlement with 40 constituents is one record and forty
independent claims.

```
  TP = edges present in both agent output and ground truth
  FP = edges asserted by the agent, absent from ground truth
  FN = edges in ground truth, not asserted (excluding abstained/excepted)

  match_precision = TP / (TP + FP)
  match_recall    = TP / (TP + FN)
```

**Decision enabled:** "When it says matched, how often is it right, and how much
does it miss?"

### 4.3 Abstention precision / recall — against the oracle

Ground truth for "truly ambiguous" comes from the Ambiguity Oracle
(`PREREGISTRATION.md §5`), not from the generator and not from a label.

```
  abstention_precision = |abstained ∩ truly_ambiguous| / |abstained|
  abstention_recall    = |abstained ∩ truly_ambiguous| / |truly_ambiguous|
```

**Decision enabled:** "Is abstention a real signal, or is the system dodging work
it could have done?" Low precision means it abstains on decidable cases and wastes
analyst time. Low recall means it confidently commits on genuinely undecidable
cases — the expensive failure.

Two derived diagnostics:

```
  over_abstention_cost_inr  = |abstained \ truly_ambiguous| × C_review
  silent_guess_value_inr    = Σ value(truly_ambiguous \ abstained)
```

`silent_guess_value_inr` is the rupee value of decisions the system committed on
cases the oracle finds ambiguous **from the observations alone**. **This is the
number the whole project is about** — and from spec 1.4.22 it is read with one
qualification.

**It is not, on its own, a count of unjustified guesses.** Through spec 1.4.21
this line read *"decisions the system made that it had no evidential right to
make"*, which held while the observations were the only evidence any agent could
reach. Two frozen mechanisms make that gloss too strong. First,
`RECONCILIATION_SPEC.md §6`'s `DISCRIMINATED` branch **accepts** an allocation
when the evidence gap `Δs ≥ ε`, while `PREREGISTRATION.md §5.4`'s ambiguity
definition carries **no `Δs` term** — so every `DISCRIMINATED` decision falls in
this set by construction, and has since spec 1.0.0. Second, from spec 1.4.22
`§6.2`'s `fetch_settlement_recon` supplies bounded supplemental evidence the
oracle is barred from (`PREREGISTRATION.md §6.2` `AL8`), so a probe-resolved
decision can be **correct and well-evidenced** while the oracle, reading
observations only, still calls the case ambiguous. Neither mechanism is a defect
and neither is being changed here.

**What the figure measures, stated exactly.** The value ASSAY committed on cases
that are undecidable **from the observations**. Two populations sit inside it and
figures already reported beside it separate them: `balance_harm_inr` (§4.4)
prices the decisions that were actually wrong, and the probe count (§4.13) shows
how much of the remainder was bought with evidence. A high
`silent_guess_value_inr` with **zero probes spent and non-zero balance harm** is
the failure this metric exists to catch. The same figure with **probes spent and
zero harm** is the system doing what `§6.2` designed the budget for, and must be
reported as such rather than as a guess.

**The formula is unchanged**, as are `over_abstention_cost_inr`, the 28-metric
list of `PREREGISTRATION.md §8` and its numbering. `DISCRIMINATED` is not
redefined.

### 4.4 Financial harm — two measures, reported separately

Face value of misallocated records is the wrong measure: moving a payment between
two settlements that both land in the same account on the same day harms nobody.
Harm is what changes in the books.

**(a) Balance harm — how wrong are the accounts, among the decisions the system
actually made?**

```
  covered   = observations whose component reached RECONCILED
  abstained = observations whose component reached ABSTAINED
  excepted  = observations whose component reached EXCEPTION
  (REFERENCE observations post nothing and enter none of these sets)

  proj_agent(acct) = Σ dr_paise − Σ cr_paise over the agent's journal lines
                     whose owning decision is RECONCILED
  proj_truth(acct) = Σ dr_paise − Σ cr_paise over true_journal lines whose
                     `source_entity_id` belongs to a covered observation

  balance_harm_inr = Σ over AccountCode (excluding Suspense)
                       | proj_agent(acct) − proj_truth(acct) |
```

**`balance_harm_inr` is selective risk, and selective risk is computed over the
covered set only.** `PROJECT_SPEC.md §7` S3 states the criterion as *"harm on the
covered set"*; §1 of this document defines selective risk as *"the error among
covered decisions"*; §4.5 justifies pricing abstention on the ground that
*"without a cost on abstention, `A2-NOABSTAIN` is trivially beaten by a system
that abstains on everything"*, which holds only if abstaining lowers harm; and
§5.1 plots harm against coverage as a risk–coverage curve, which requires harm to
fall as coverage falls. Benchmark v1.0.0 and v1.0.1 summed over the whole run
instead. Under that formula harm **rose** with abstention, the curve sloped
upward, `aurc_inr` measured the inverse of its stated meaning, and
`A2-NOABSTAIN` — the ablation built never to abstain — scored the lowest balance
harm in the field. The restriction to the covered set is what those four sections
already require.

**Suspense is excluded from the account sum** because a rupee correctly parked
there is a *correct* outcome, and including it would count the same abstention
twice within this metric — once on the Suspense side and once on its counterparty.

**Abstention and exception remain priced, once, elsewhere.** An abstained item
costs `C_review` and an open exception costs `C_exception` in `net_cost_inr`
(§4.5). Both enter `unresolved_value_inr` (§4.9) and gate G3
(`RECONCILIATION_SPEC.md §10.1`). Neither is removed by this amendment; what is
removed is a **fourth** charge for the same item, levied inside a metric that is
defined to measure the covered set.

**The degenerate case, checked.** An agent that abstains on everything has an
empty covered set and `balance_harm_inr = 0` — but `net_cost_inr` is
`N × C_review`, and `coverage_by_value` is 0, which fails S2. Abstaining on
everything is not rewarded.

**(b) Misdirected value — how many rupees sit in the wrong place?**

```
  misdirected_value_inr = Σ over COVERED entities where
                            allocated_target ≠ true_target
                            of entity.amount
```

Scoped to the covered set for the same reason as (a): an abstained or excepted
entity has no allocated target, so it can be neither correctly nor incorrectly
directed. Stating the scope explicitly prevents an implementation from counting
an abstention as a misdirection.

Both are reported. They answer different questions — (a) "can I trust the trial
balance for what the system decided?", (b) "how much money is filed under the
wrong settlement?" — and a system can be good at one and bad at the other.
Collapsing them into a single number would hide that.

### 4.5 Net cost — the single comparable figure

```
  net_cost_inr = balance_harm_inr
               + |abstained|          × C_review      (₹250)
               + |open_exceptions|    × C_exception   (₹500)
```

**Decision enabled:** "Which system costs me less to run?" — the only question a
controller actually asks.

**A constant term entered this metric at spec 1.4.1 and is disclosed rather than
removed.** With `AN5` retired (`RECONCILIATION_SPEC.md §3`) every `ledger_entry`
reaches `E13_LEDGER_ONLY`, so `net_cost_inr` carries one `C_exception` per ledger
entry in the dataset — **identical for ASSAY, `B0`, `B2`, `A1`, `A2` and `A3`**.
It therefore inflates every *absolute* figure and cancels in every *comparison*,
including metric 8 `gap_to_oracle`, which is a difference of two `net_cost_inr`
values. The formula is **not** amended to exclude it. Instead every report carries
a companion line, labelled `EXPLORATORY` per `PREREGISTRATION.md §8`:

```
  net_cost_inr_excluding_e13 = net_cost_inr − (|E13| × C_exception)
```

reported beside the authoritative figure — the pattern §4.9 already uses for
`unresolved_value_inr_multiview`. It supports no claim; it exists so a reader can
see the comparison without the constant. Note also that metric 26's cost sweep
scales this term with `C_exception`, so the two move together and the sweep is
read accordingly.

This is the metric that makes the evaluation honest, because it prices
abstention. Without a cost on abstention, `A2-NOABSTAIN` is trivially beaten by
a system that abstains on everything, and the comparison is meaningless.

`C_review` and `C_exception` are assumptions, not measurements. A sensitivity
sweep at ₹100 / ₹250 / ₹1,000 is mandatory (`§5.3`), and any conclusion that
flips within that range must be reported as unstable.

### 4.6 Calibration

For the score used by the abstention gate, bin predictions into 10 equal-width
bins and compute expected calibration error:

```
  ECE = Σ_bins (n_bin / N) × | accuracy(bin) − mean_score(bin) |
```

Plus a reliability diagram in the report.

**Decision enabled:** "Does a score of 0.9 mean 90%?" An uncalibrated score
cannot justify a threshold, and a threshold that cannot be justified is a magic
number. Note that ASSAY's *primary* abstention path is evidential (the
second-best certificate), not score-based; calibration is reported for the ε-gap
component, which is the one place a soft score influences the gate.

### 4.7 Throughput and cost

```
  throughput_rps_deterministic   records/sec through S0–S5 with --llm=off
  throughput_rps_llm             records/sec for records that reach the LLM
  pct_records_needing_llm        share of records touching any LLM role
  p50_latency_ms, p95_latency_ms per-component decision latency
  cost_inr_per_1000_records      token cost at published rates
```

**Decision enabled:** "Can this run on my volume, and what does it cost?"
Splitting the two paths is the honest presentation: the deterministic path should
handle 100k records comfortably; the LLM path is small because it only touches
the residual. Reporting a blended number would hide both facts.

A separate scaling run reports deterministic throughput at 1k / 10k / 100k
records with `--llm=off`, to demonstrate that the architecture's cost scales with
*difficulty*, not with volume.

### 4.8 Robustness

```
  injection_financial_success_rate = |injected cases with balance_harm > 0|
                                     / |injected cases|
  forced_abstention_rate           = abstention rate on injected records
                                     − abstention rate on matched clean controls
  hallucinated_id_rate             = LLM responses referencing non-existent IDs
                                     / total LLM responses
  id_rejection_rate                = hallucinated IDs caught by allowlist + I6
                                     / hallucinated IDs emitted
```

`injection_financial_success_rate` should be **structurally zero** for ASSAY — no
LLM output is numeric and I6 rejects unknown IDs. Measuring it anyway is the
point: an architectural claim that is asserted is worth much less than one that
is tested.

`forced_abstention_rate` is the subtle attack and the more interesting number. An
attacker who cannot move money may still be able to inflate the exception queue
until the analyst stops reading it — a denial-of-service on human attention. If
ASSAY is vulnerable here, the report says so.

### 4.9 Close-loop outcome

```
  period_status_distribution = share of runs ending CLOSED / OPEN / BLOCKED
  unresolved_value_inr       = value_abstained + value_open_exceptions at close,
                                 summed over OPEN SUSPENSE ITEMS — one per
                                 ABSTAINED TARGET and per open exception whose
                                 class posts (DATA_MODEL §17.1.1), keyed by
                                 JournalLine.source_entity_id, valued at
                                 value(observation) (DATA_MODEL §14.1) and read
                                 from the Decision / Exception records.
                                 Amended at benchmark v1.0.3.
  unresolved_value_inr_multiview
                             = the benchmark v1.0.2 universe: value(observation)
                                 over EVERY reconcilable observation in ABSTAINED
                                 or EXCEPTION. EXPLORATORY per PREREGISTRATION §8,
                                 reported for every seeded run, never a gate and
                                 never a close-policy input. Retained so both
                                 universes and the transition between them are
                                 visible without re-running anything.
  suspense_identity_exact    = gate G3, gross per-item (RECONCILIATION_SPEC §10.1):
                                 Σ |item_net_paise| === unresolved_value_paise,
                                 the left side from the journal lines and the
                                 right side from the Decision / Exception records
  close_gate_failures        = per-gate failure counts across all runs
  batch_value_paise          = Σ recon_line.amount, the close denominator
  close_threshold_paise      = round_half_up(batch_value_paise * 5 / 1000)
  period_status_legacy_policy= the same run's outcome under the benchmark v1.0.0
                                 policy min(0.005 × batch, ₹50,000). Reported for
                                 every seeded run. Never a gate. Labelled
                                 EXPLORATORY per PREREGISTRATION §8, since it is
                                 not on the frozen metric list and supports no
                                 claim about ASSAY's performance.
```

**Decision enabled:** "Did the loop actually terminate, and can I sign the
period?" `BLOCKED` must be **0 across every run** — it indicates a defect in
ASSAY, not a property of the data. `OPEN` occurring on adversarial or
high-ambiguity seeds is the *expected and desired* behaviour, and at least one
legitimate `OPEN` is required by success criterion S12: a close gate that has
never refused to close is an untested close gate.

`suspense_identity_exact` must be `true` on every run. It is the gross per-item
form of gate G3 (`RECONCILIATION_SPEC.md §10.1`) — the arithmetic proof that no
exception was silently dropped between the queue and the books, and that two
offsetting suppressions cannot cancel each other out of the total. Its two sides
are drawn from two independently maintained stores over one universe, which is
what makes it a cross-check rather than a restatement.

**Metric 12's universe was amended at benchmark v1.0.3, and the direction is
disclosed.** Through v1.0.2 it summed every reconcilable observation in a
non-resolved state — several *views* of one economic break — against which G3's
exact identity was **unsatisfiable**: `RECONCILIATION_SPEC.md §11`'s worked
example posts ₹1,00,000 against a multi-view total of ₹3,00,000, so every run
ended `BLOCKED` and metric 14 was violated by construction. Collapsing onto the
item universe **lowers this metric and makes `CLOSED` easier to reach**. It
applies identically to ASSAY, both baselines and all three ablations, so no
comparison between agents shifts. `unresolved_value_inr_multiview` carries the
superseded figure on every run.

**A second, separate channel lowers it as well.** `DATA_MODEL.md §17.1.1` gives
seven of the fourteen exception classes no Suspense item, so `E05`, `E06`, `E07`,
`E08`, `E10`, `E11` and `E13` leave this metric entirely. The close gate
therefore no longer sees ledger-side, duplicate, ingest-failure, orphan-refund or
timing value, and a period can close while the merchant ledger is substantially
untied — the failure mode §4.1 publishes three coverage views to expose. Metric
28 scores zero for it, `C_exception` prices it, and §6 requires the count and
value of non-posting exceptions on every run; `G3` does not cover it. A third
channel pushes the other way: the remaining seven classes open items no
implementation was opening before. **The net is not claimed here** — see
`PREREGISTRATION.md §8`.

### 4.10 Abstention DoS surface

```
  abstention_spike_flag              = rate_by_value > baseline + 3σ   (frozen k)
  attributable_to_untrusted_text_rate= abstentions whose component carried
                                        quarantined text / all abstentions
  largest_exception_in_top_n         = is the largest-value exception within the
                                        20 items the queue surfaces first?
  over_abstention_cost_inr           = |abstained \ truly_ambiguous| × C_review
```

**Decision enabled:** "Is someone flooding my queue, where is it coming from, and
is the item that matters still visible?" These correspond to mitigations M1–M6 in
`THREAT_MODEL.md §T9`.

`largest_exception_in_top_n` must be `true` on **every** run including the
adversarial split — that is the guarantee that a flood of small planted items
cannot bury a large genuine one. `abstention_spike_flag` is expected to fire on
the F10 adversarial split and not to fire on clean splits; a flag that fires
everywhere is a broken baseline, and one that fires nowhere is a broken detector.

### 4.11 Provider independence

```
  offline_parity = for each primary metric M:
                     { M(--llm=offline), M(--llm=replay), delta, CI overlap }
```

**Decision enabled:** "How much did the language model actually contribute, and
does this system work without one?" Reporting both columns side by side is the
honest form of the AI-necessity claim. If the deltas are within overlapping
confidence intervals, the correct conclusion — and the one that must be written —
is that the LLM did not measurably contribute to those metrics on this benchmark.

### 4.12 Determinism

```
  determinism_check = (ledger_root_hash(run_1) === ledger_root_hash(run_2))
```

Two runs, same input, `--llm=replay`. **Decision enabled:** "If I re-run the
close, do I get the same books?" A finance control that is not reproducible is
not a control. Also directly validates invariant I9.

### 4.13 Gap to oracle

```
  gap_to_oracle = net_cost_inr(ASSAY) − net_cost_inr(oracle_policy)
```

Where the oracle policy abstains on exactly the truly-ambiguous set and is
correct elsewhere. This is the best achievable performance given the
observations.

**Decision enabled:** "Is the remaining error a solvable engineering problem, or
is the information simply not present in the data?" A small gap means the
information limit has been reached and further work should go into acquiring
better evidence, not better algorithms.

**A negative gap is valid, and it means something specific `[ASSAY-MODEL]`,
supplied at spec 1.4.22, register row M36.** `net_cost_inr` (§4.5) charges
`C_review` on every abstention, and the oracle policy abstains on the whole
truly-ambiguous set. ASSAY, having spent probe budget under
`RECONCILIATION_SPEC.md §6.2`, may abstain on strictly fewer while keeping
balance harm at zero, so it can cost less than the reference. The formula's sign
is unconstrained and nothing here changes it. The reading is: **ASSAY exceeded
the best policy achievable from the observations alone, by spending bounded
supplemental evidence acquired outside them.** That is the action this metric's
own decision prompt recommends — *"acquiring better evidence"* — so measuring it
is the point rather than an anomaly.

**Metrics 4 and 8 are therefore reported beside the probe count.** Every report
carries, per agent and per split, the number of probes spent and the number of
abstentions they resolved (`§6.2`'s *"abstentions resolved per probe spent"*),
so a reader can attribute a negative gap or a reduced `abstention_recall` to the
probe channel rather than infer it. Without that line the provenance of the
difference is invisible, and the two metrics would appear to disagree with §4.3
for no stated reason. **No metric definition changes and no metric is added**:
the probe count is reporting provenance for figures already on
`PREREGISTRATION.md §8`'s list, not a new quantity that could support a claim.

---

## 5. Reporting

### 5.1 Risk–coverage curve — the primary figure

Sweep the abstention aggressiveness (vary ε from 0 to 10_000 bps with τ fixed).
At each point plot **coverage by value** on x and **balance harm in ₹** on y. One line
per agent. `B0`, `B1`, `B2` and `A2` are single points (they do not abstain, or
abstain trivially); ASSAY and `A1` are curves.

**AURC** (area under the risk–coverage curve, ₹-denominated) is the scalar
summary. Lower is better.

This single figure carries the argument: it shows simultaneously that ASSAY
achieves high coverage, that its harm at that coverage is low, and that the
alternatives sit above and to the left.

### 5.2 The comparison table

One row per agent, columns: `coverage_by_value`, `coverage_by_value_bank`,
`coverage_by_value_ledger`, `balance_harm_inr`, `misdirected_value_inr`,
`net_cost_inr`, `abstention_precision`, `silent_guess_value_inr`,
`throughput_rps`. Every cell is `mean ± 95% CI` over 5 seeds. The three coverage
columns are always shown together; publishing the recon view alone would present
one side of a three-sided reconciliation as if it were the whole. **Cells whose confidence intervals overlap are explicitly marked as not
significantly different** — no bolding of a 2% lead over a 15% interval.

### 5.3 Mandatory sensitivity analyses

| Sweep | Range | Why |
|---|---|---|
| τ (materiality) | ₹10 / ₹100 / ₹1,000 / ₹10,000 | Prevents τ from being tuned to inflate coverage; shows the `AMBIGUOUS` → `IMMATERIALLY_AMBIGUOUS` shift |
| ε (evidence margin) | 0 → 10_000 bps | Generates the risk–coverage curve |
| `C_review` | ₹100 / ₹250 / ₹1,000 | Any conclusion that flips must be flagged as unstable |
| Batch size | 1k / 10k / 100k | Throughput scaling, deterministic path. Measures metrics 21 and 22 only; produces no close-loop metric and does not alter the dataset sizes frozen in `PREREGISTRATION.md §4.1` |

### 5.4 What the report must contain

1. The synthetic-data disclosure from `PREREGISTRATION.md §2`, verbatim, first.
2. The positioning statement from `RELATED_WORK.md §1.4` — ASSAY consumes the
   Razorpay recon report as authoritative input and claims no gap in it.
3. The benchmark manifest hashes, the `constraint_set_hash`, and the seal commit SHA.
4. Oracle gate results: completeness and consistency, both passing, with the
   sample size used for the differential test.
5. The full metric table with CIs, including every metric in the frozen list —
   **including the ones where ASSAY does poorly.**
6. **Two columns for every primary metric:** `--llm=replay` and `--llm=offline`,
   with the delta and whether the CIs overlap (metric 24, `offline_parity`).
7. The risk–coverage figure and reliability diagram.
8. The close-loop table: `period_status` per seed, `unresolved_value_inr`,
   `batch_value_inr`, `close_threshold_inr`, **`period_status_legacy_policy` in
   an adjacent column so the benchmark v1.0.0 and v1.0.1 close policies are shown
   side by side**, and confirmation that `BLOCKED` count is zero and
   `suspense_identity_exact` is true on every run. Where the two policy columns
   disagree, the report states the count and says plainly that the v1.0.1 policy
   is the one in force and why (`RECONCILIATION_SPEC.md §10.3`).
9. The abstention DoS panel: spike flags by split, source attribution, and
   `largest_exception_in_top_n` across all runs.
10. The declared threats to validity (`PREREGISTRATION.md §10`), unedited.
11. The provenance register (`DATA_MODEL.md §22`), or a link to it, so a reader
    can check which statements about Razorpay are documented, which are ASSAY's
    modelling assumptions, and which are explicitly not claimed.
12. Every `EXPLORATORY`-labelled metric, clearly separated.
13. A named list of what was **not** tested: FX, real bank formats, multiple
    merchant profiles, non-INR settlement, production volumes, and any live
    Razorpay settlement data (none exists in the test account).

### 5.5 Forbidden reporting practices

Listed explicitly because each is a plausible temptation under deadline pressure:

- Reporting a single-seed number without a CI.
- Reporting accuracy without coverage.
- Choosing a threshold after seeing test results.
- Showing one impressive matched record as evidence of quality — the track brief
  explicitly rejects this ("one cherry-picked match proves nothing").
- Describing an ablation as a "competitor."
- Reporting harm in record counts rather than rupees.
- Any claim of real-data provenance.
- Any claim that Razorpay's reconciliation has a gap or defect.
- Describing an `[ASSAY-MODEL]` assumption as documented Razorpay behaviour, or
  citing a marketing page where an API reference exists (`DATA_MODEL.md §22`).
- Any assertion about what a commercial vendor does internally.
- Reporting only the `--llm=replay` column while omitting `--llm=offline`.
- Any number in the demo that does not exist in a committed run artifact.

---

## 6. Exception reporting

The track bar asks for "the exceptions it could not resolve." The exception
report is a deliverable, not a footnote.

For each of the 14 exception classes: count, total rupee value, mean value,
`owner_role`, and three redacted examples with their analyst questions. Plus:

- **Exception class confusion matrix** — R2's classification against the
  generator's known cause. Measures whether the triage is trustworthy.
- **Suspense reconciliation** — proof of gate G3, exactly:
  `Σ |item_net_paise| = Σ abstained value + Σ open exception value` over open
  Suspense items, keyed by `JournalLine.source_entity_id`. Reported with the
  split between debit-side and credit-side Suspense items, since a net-only
  figure would hide two offsetting suppressions. Confirms nothing was quietly
  dropped between the queue and the books.
- **Exceptions that open no Suspense item** — `DATA_MODEL.md §17.1.1` gives
  seven of the fourteen classes no posting, so they carry an owner and a value
  but no journal line and enter neither side of G3. Their count and rupee value
  are reported **separately and explicitly**, because an exception outside the
  Suspense identity is one the identity cannot vouch for, and a reader is
  entitled to see how much of the exception queue that is. They remain covered
  by gate G1, which admits no drop path.
- **`E13_LEDGER_ONLY`, reported apart from the other thirteen classes** — with
  `AN5` retired (`RECONCILIATION_SPEC.md §3`) every merchant ledger entry reaches
  this class, so its count is the ledger-entry count and carries no information
  about which entries are anomalous. It is reported with that statement attached,
  and the confusion matrix above is read without it, because a class every record
  reaches measures no triage judgement — the same ground on which `E12` is
  excluded. `THREAT_MODEL.md §T5`'s *prevention* is unaffected: an `E13` posts no
  journal line and can move no control account. Its *detection* is
  non-discriminating, and saying so is the point of this line.
- **`unresolved_value_inr_multiview`** — the benchmark v1.0.2 universe, labelled
  `EXPLORATORY`, printed beside the amended figure.
- **`net_cost_inr_excluding_e13`** — the §4.5 companion line, labelled
  `EXPLORATORY`, printed beside metric 2.

---

## 7. Reproducibility

A third party with the repository must be able to reproduce every number, with
**no API key and no network**:

```
  pnpm install
  pnpm assay generate --split dev --seeds 2000-2004
  pnpm assay oracle   --split dev                    # gates must pass
  pnpm assay bench    --split dev --agents all --llm offline
  pnpm assay bench    --split dev --agents all --llm replay --strict-replay
  pnpm assay report   --out runs/report.html
```

The `--llm=offline` line requires nothing external at all. The `--llm=replay`
line requires only the committed response cache. Neither touches the network.

Guaranteed by: seeded generation with a vendored PRNG; pinned dependencies
(`pnpm-lock.yaml`); a committed response cache keyed by
`sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`; the engine commit
SHA in every manifest; and `assay verify --run <id>`, which recomputes the hash
chain from genesis, re-projects all balances, and re-checks the Suspense
identity.

**The LLM non-determinism problem, stated honestly:** language models are not
deterministic even at fixed settings, so live-provider runs are not
bit-reproducible. This is why every scored run uses `--llm=replay
--strict-replay`, where a cache miss is a hard error rather than a silent live
call. The live pass that produced the cache is recorded with provider, model ID
and per-call hashes, and the report states which mode produced each number.
Claiming reproducibility without this distinction would be false.

**Provider independence is part of reproducibility.** Because every primary
metric is also published under `--llm=offline` (metric 24, `offline_parity`), a
reader who distrusts the recorded cache — or who cannot obtain the same model —
can still reproduce a complete, fully deterministic result set and see exactly
how much the model changed.

