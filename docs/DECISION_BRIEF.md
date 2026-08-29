# DECISION_BRIEF — ASSAY

**Adversarial review, and the locked project definition after revision.**
**Spec version:** 1.4.17 · **Date:** 2026-08-28
**Reviewer role:** principal architect / skeptical reviewer

**At spec 1.4.6** §A.13 records one definition, taken at a governance gate held
during the `packages/oracle` build and before any dataset was generated:
`Component.total_value_paise` — the quantity `τ`'s *"10 bps of component value"*
names — carried no definition, and neither did the field it sums over.
**Documentation only; the choice is a ratification and the record says so.**
Benchmark v1.0.3 is unchanged and no frozen quantity moved.

**At spec 1.4.5** §A.12 records one disclosure, taken at a governance gate held
after spec 1.4.4 and before any dataset was generated: under the frozen `§4.2`
composition the close gate cannot return `CLOSED`, so `S12`'s `CLOSED` half is
reported failed. **Documentation only — no threshold, population parameter,
metric definition or criterion is changed**, `DECISION_BRIEF.md §F` F9's
pre-declared disposition governs, and benchmark v1.0.3 is unchanged.

**At spec 1.4.4** §A.11 records one further resolution, taken at a governance gate
held **after spec 1.4.3 and before any dataset was generated**: the specification
had never said which observation kinds may be candidate members, and contradicted
itself on the answer. Eligibility is now **derived** from `RECONCILIATION_SPEC.md
§4.1`'s existing ratification rather than declared. **No declared value changes**;
`C1`–`C8` are untouched so `constraint_set_hash` does not move, and benchmark
v1.0.3 is unchanged.

**At spec 1.4.3** §A.10 records one further resolution, taken at a governance gate
held **after the `packages/oracle` design audit and before any dataset was
generated**: `ReconLine.settled_at` carried no definition anywhere in this
specification while three frozen clauses read it, and `C3` bundled two conjuncts
with different evidence requirements into one row. **No declared value changes**;
`C1`–`C8` membership and order, `I1`–`I9`, every `§7` threshold and benchmark
v1.0.3 are unchanged.

**At spec 1.4.2** §A.9 records one further resolution, taken at a governance gate
held **after `packages/generator` was written and before any dataset was
generated**: a capture-day batch whose refund debits exceed its credits had no
representation under the frozen rules, and `PREREGISTRATION.md §4.2` now states
that such a member is emitted **unsettled** rather than allocated or deferred.
The rule supplies a value where the specification stated none; **no declared
value changes**, benchmark v1.0.3 is unchanged, and two consequences it does not
determine were traced in a further governance pass and closed in the same
release — `E11`'s refund clause, `§17.1.1`'s missing `refund` row, and `C3`/`C4`
against a null `settled_at` — with `PREREGISTRATION.md §10` V15 separating what
the specification already determined from what was newly ratified.

**At spec 1.4.1** §A.8 records one further correction: anchor `AN5` is retired as
both unimplementable and, independently, inconsistent with `THREAT_MODEL.md §T5`.
The same release supplies `PREREGISTRATION.md §4.1`'s reserved composition table —
a uniform driver of `P = 659` payments per family, with `target_record_count`
derived rather than chosen — transcribes the remainder of the generator contract
into `§4.2`, `§4.3` and `§6.2`, and records three exception classes as
DEV-unexercisable (`§10` V12–V14). Every transcribed value supplies one the
specification previously left unstated; none changes a declared value. Benchmark
v1.0.3 is unchanged. The GO verdict below stands, and §F's two
unresolved assumptions are untouched.

Spec 1.0.0 returned a MODIFY verdict with four blocking corrections. This
revision applies them, plus nine further corrections raised in review. §A records
what changed and why; §B onward is the locked definition.

---

## A. Final verdict after modification: **GO**

**GO, conditional on two unresolved assumptions (§F) and on holding the Tier-0
scope in §C.** The design that failed review in 1.0.0 has been corrected; the
design that remains is buildable in the time available and defensible under
engineering scrutiny.

### A.1 The corrections applied in this revision

| # | Defect in 1.0.0 | Correction | Where |
|---|---|---|---|
| 1 | **Dual-product framing.** ASSAY positioned as both a reconciler and an independent evaluator that catches other AI agents lying. Self-graded exam: we write the agents, the ground truth *and* the grader. Also a track mismatch — a meta-evaluator is Track 05. | Removed entirely. ASSAY is one product: a finance controller. Comparative work is now ablations of ASSAY itself plus reference baselines, explicitly framed as controls, never as third-party agents ASSAY judges. | `PROJECT_SPEC.md §8`, `EVALUATION_SPEC.md §3` |
| 2 | **Naive ambiguity definition.** "A+B+C = ₹1,00,000 and also D+E, therefore abstain" abstains on every realistic batch, since subsets hitting any total are astronomically common. Coverage ≈ 0. | Replaced with the full chain: hard evidence-admissibility constraints C1–C8 → connected-component decomposition → exact solve within the component → no-good cut → second-best solution → abstention certificate. | `RECONCILIATION_SPEC.md §1, §4–6` |
| 3 | **Ambiguity defined arithmetically.** Any mathematically possible alternative triggered abstention. | Ambiguity must be **material**: abstention requires `max control-account balance delta > τ`. Sub-τ alternatives resolve as `IMMATERIALLY_AMBIGUOUS` and are counted separately so τ cannot quietly inflate coverage. | `RECONCILIATION_SPEC.md §6, §6.1` |
| 4 | **Abstention was free.** Abstain-on-everything minimised ₹-harm perfectly, making the headline metric meaningless. | `C_review` = ₹250 and `C_exception` = ₹500, pre-registered, with a mandatory sensitivity sweep. `net_cost_inr` is the single comparable figure. | `PREREGISTRATION.md §7`, `EVALUATION_SPEC.md §4.5` |
| 5 | **Harm measured at face value.** Moving a payment between two settlements that land in the same account was scored as full harm. | Harm redefined as **control-account balance delta**, with `misdirected_value_inr` reported separately as a second, distinct measure. Suspense excluded from harm so a correct abstention is not double-charged. | `EVALUATION_SPEC.md §4.4` |
| 6 | **No closed loop.** Ingest → reconcile → evaluate is a pipeline. Track 04 requires a closed loop. | Period close with five gates (G1–G5) and three outcomes: `CLOSED`, `OPEN` with unresolved value quantified, or `BLOCKED` on defect. Every observation reaches exactly one terminal state. | `RECONCILIATION_SPEC.md §10`, `PROJECT_SPEC.md §5.1` |
| 7 | **Oracle independence asserted, not achieved.** | Oracle is independent of the generator (observations only, path-guarded) *and* of the engine (separate naive implementation of a shared declarative constraint table, import-linted). Two hard gates: **completeness** (truth ∈ oracle solutions) and **consistency** (20,000-pair differential test vs engine). | `ARCHITECTURE.md §7`, `PREREGISTRATION.md §5` |
| 8 | **Shadow ledger was a JSON decision log.** No chain, so edits invisible; no arithmetic invariant, so a lost rupee undetectable. | Two layers: **Layer A** append-only hash-chained audit events; **Layer B** double-entry projection into seven control accounts with a continuous trial-balance invariant and an exact Suspense identity. | `ARCHITECTURE.md §8` |
| 9 | **Attention DoS acknowledged but unmitigated.** | Promoted to a first-class threat with six measurable mitigations (M1–M6): value-ranked queue, 3σ spike detection, source attribution, immaterial auto-resolve, cost visibility, injection delta. Suppression-by-lowering-abstention explicitly rejected. | `THREAT_MODEL.md §T9`, `DATA_MODEL.md §21` |
| 10 | **Implied a gap in Razorpay's reconciliation.** Unverifiable and needlessly adversarial toward the host. | Repositioned: ASSAY **consumes the recon report as authoritative anchor input** and claims no defect in it. Differentiation is verification-first, evidence-bounded reconciliation and safe period close. Vendor claims reduced to what is publicly documented. | `PROJECT_SPEC.md §3`, `RELATED_WORK.md §1–2` |
| 11 | **No dated scope boundary.** | Tier-0 frozen for **31 August**; **5 September** is the submission deadline. Seal and sealed run occur 1 September, inside the gap. | §C, §I |
| 12 | **Tier-0 vs stretch undefined.** | §C is binding and complete; §H is explicitly optional and ordered. | §C, §H |
| 13 | **Hard dependency on one LLM vendor**, and an implicit assumption that a consumer subscription could serve as an API. | `LlmProvider` interface with four implementations — `offline`, `replay`, `anthropic`, `openai-compatible`. Full pipeline must pass every acceptance test with `--llm=offline`. Consumer subscriptions (Claude Pro, ChatGPT Go, Google AI Pro) are never used as API access. | `ARCHITECTURE.md §6.5`, `PROJECT_SPEC.md §6.1` |

### A.2 What survived review unchanged

Track 04 remains the right choice — the cross-track reasoning holds, and the
track's bar (throughput + measured accuracy + honest exception list) rewards
engineering discipline over demo polish. Abstention as a first-class outcome
remains the correct central idea. The ₹1,00,000 two-explanations example remains
the right motivating case. Refusing to claim real settlement data remains correct
and is now stated more loudly, since Test Mode returns `count: 0` and anyone can
check.

### A.3 The one differentiator

Ten listed differentiators is zero differentiators. Eight of the original ten are
hygiene — the price of being taken seriously, not a reason to be remembered.
**Exactly one is a differentiator: evidence-based abstention with a
machine-checkable certificate.** Everything else in this specification exists to
make that single claim believable.

### A.4 Spec 1.1.1 — factual corrections against Razorpay documentation

A narrow verification pass checked every assumption this specification makes about
Razorpay settlement, fees, GST, payment fields, deductions and reconciliation
semantics against current official documentation, preferring the most specific
source available (API entity reference over endpoint reference over product guide
over pricing page). Twelve corrections were applied **before the seal and before
any dataset was generated**, which is the only window in which they are free.

**This was a correction pass, not a redesign. Nothing was added to or removed from
Tier-0, no architecture changed, and no threshold, metric, baseline or ablation
moved.** `DECISION_BRIEF.md §F` rows F6 and F7 are closed by it.

| # | Correction | Class of error | Where |
|---|---|---|---|
| 1 | **Fee/GST convention.** Razorpay documents `fee` as *"Fee (including GST)"* with `tax` the GST component **inside** it. The identity is `credit = amount − fee`, not `credit = amount − fee − tax`, and `fee_ex_gst = fee − tax`. The 1.1.0 claim that the old identity was "taken from the documented recon report schema" was false and is withdrawn. **`credit` is numerically unchanged** — only the value carried in the observable `fee` field, and the identity used to check a line. | Wrong, and over-claimed provenance | `DATA_MODEL.md §6`, `RECONCILIATION_SPEC.md` C5/I3, `THREAT_MODEL.md` T6, `PREREGISTRATION.md §2`, T0-2 |
| 2 | **`Settlement.fees` / `Settlement.tax` are 0** on a normal settlement — documented verbatim, and shown in the `settlement.processed` webhook sample. They are the instant-settlement service charge, not aggregated constituent fees. Instant settlements are declared outside Tier-0. | Directly contradicted | `DATA_MODEL.md §5` |
| 3 | **UPI 0 → 200 bps; netbanking 190 → 200 bps.** Zero MDR is a bank/government rate; Razorpay's pricing page states a 2% platform fee still applies to UPI. No source states 1.9% for netbanking. | Wrong constants | `PREREGISTRATION.md §4.2` |
| 4 | **Settlement constituents** come from the date-scoped recon report, not from `GET /v1/settlements/:id`, which returns 8 fields and no constituent list. The probe was renamed and redefined. | Unsupported capability | `RECONCILIATION_SPEC.md §6.2`, `ARCHITECTURE.md §5` |
| 5 | **Schema value sets:** `card_network` `"Amex"` → `"American Express"` (plus the other five documented values and `unknown`); `notes` is an **object**, not a string; `posted_at` and `credit_type` are sample-only and their semantics are not claimed; the invented `credit_type` values `refund_credit` / `dispute_credit` are removed. | Invented / wrong values | `DATA_MODEL.md §6`, §10 |
| 6 | **Refund speeds:** `speed_processed` ∈ {instant, normal}; `optimum` is a `speed_requested` value only. | Wrong value set | `DATA_MODEL.md §4` |
| 7 | **Dispute status** gains the documented `under_review`. | Incomplete value set | `DATA_MODEL.md §9` |
| 8 | **Settlement timing:** the documented baseline is **T+2 working days** (domestic), not "T+1 to T+3 for standard merchants". ASSAY's calendar-day simulator and its T+1/T+3 dispersion are labelled as modelling assumptions, and the direction of the resulting bias is stated. **No bank-holiday engine was added.** | Over-claimed provenance | `RECONCILIATION_SPEC.md` C4, `PREREGISTRATION.md §2`, §4.2 |
| 9 | **`C1` justification:** Razorpay settles in INR *regardless of the currency the customer paid in*, so "cross-currency netting does not occur" was wrong. `C1` now rests on Tier-0 being INR-only by construction. The constraint itself is unchanged. | Wrong justification | `RECONCILIATION_SPEC.md` C1 |
| 10 | **Payment vs reconciliation fields:** `card_network` / `card_issuer` / `card_type` are settlement-recon columns, not Payment entity fields. Removed from `Payment`; the reconciliation model is untouched. | Wrong object attribution | `DATA_MODEL.md §2` |
| 11 | **Constructs relabelled, not deleted:** the `Adjustment` entity (`direction`, `reason`, `related_entity_id`) has no public Razorpay counterpart and is now labelled an ASSAY construct; `F07`'s mechanism moves from an unsupported `on_hold` hold/release to the documented dispute **deduction**; `on_hold` is documented as a Route-transfer flag, so `C8` is retained but declared expected-non-binding; and **Route transfers are declared out of Tier-0 scope** rather than partially modelled with an invented identity. | Unsupported mechanism | `DATA_MODEL.md §6`, §9, `PREREGISTRATION.md §4.1`, `RECONCILIATION_SPEC.md` C8 |
| 12 | **Unsupported product-capability claim removed.** *"Reconciling it is the part Razorpay's own recon report structurally cannot do"* asserted a limit on Razorpay's product that is not verifiable from outside and contradicted this project's own standing rule against vendor-capability claims (`PROJECT_SPEC.md §8`, `§L.4`). Rewritten to the scope framing used everywhere else: the bank statement is not Razorpay's data and was never within the recon report's remit, and detecting multi-source disagreement requires holding more than one source. | Unverifiable vendor claim | `DATA_MODEL.md §7` |

**The discipline this installs.** Every statement about Razorpay now carries one
of three provenance classes — `[RZP-DOC]`, `[ASSAY-MODEL]`, `[NOT-CLAIMED]` —
defined in `DATA_MODEL.md §0` rule 6 and registered in full in `DATA_MODEL.md §22`.
A statement with no class is a defect. This exists because ASSAY's only claim to
realism is schema and arithmetic fidelity, and a single overstated "verified
against the API" converts that strength into a liability in front of the one
audience most able to check it.

---

### A.5 Spec 1.2.0 / benchmark 1.0.1 — contradiction and measurement-validity corrections

A pre-implementation review of the frozen 1.1.1 specification set found four
blocking contradictions (B1–B4) and one measurement-validity defect (N1). All five
are corrected here, **before any code existed, before any dataset was generated,
and before any number was observed**. That window is the only one in which these
changes are free, and it is the same window in which the 1.1.1 factual corrections
were made.

**This was a correction pass, not a redesign.** No component was added to or
removed from the architecture, no constraint C1–C8 changed, no soft-evidence
weight changed in value, no seed changed, no split changed, no generation
parameter changed, no degradation operator changed, and the oracle is untouched.
Tier-0 gains two held-out families it was already required to produce.

| # | Correction | Class | Where |
|---|---|---|---|
| **B1** | **Ledger sign convention.** No balance convention was stated, and `AccountCode` carries no account-class metadata, so balances were not computable from the schema. Debit-positive `Σdr − Σcr` adopted, normative posting table added, both worked examples corrected (they posted the known leg backwards, which would have charged ₹2,00,000 of phantom harm to abstaining agents on a ₹1,00,000 item). Gate **G3 restated as a gross per-item identity** because Suspense is structurally two-sided. | Architecture correction + metric amendment (metric 13) | `DATA_MODEL.md §17.1`, `RECONCILIATION_SPEC.md §10.1`, §11, `ARCHITECTURE.md §5`, §8, `EVALUATION_SPEC.md §4.9`, §6, `PREREGISTRATION.md §8`, `§L.1` |
| **B2** | **Reproducible root hash.** `DATA_MODEL.md §16` wrote `sha256(canonical_json(body) ‖ prev_hash)` and never defined `body`; genesis bound `run_id` and `started_at`, both of which vary per execution, making metric 23 unsatisfiable by construction. `body` defined; genesis reduced to `(dataset_hash, engine_commit, config_hash)`; `run_id` kept outside hashed content; hashed and gate-compared ratios moved to **integer basis points**, the scale the specification already uses for `rate_bps`, resolving a standing conflict between §0 rule 5 and §13; deterministic internal ID assignment required; the timestamp-alteration residual declared in `THREAT_MODEL.md §T10`. **No ratio value changed — only its encoding.** | Architecture correction. **No metric changes.** | `DATA_MODEL.md §0`, §11, §13, §16, `RECONCILIATION_SPEC.md §6`, `ARCHITECTURE.md §8`, `THREAT_MODEL.md §T10`, `PREREGISTRATION.md §7` |
| **B3** | **Coverage denominator.** `coverage_by_value` was `Σ value(RECONCILED) / Σ value(all observations)` over a universe in which one ₹1,000 payment surfaces as up to six observations, so the ratio was **not bounded by 1.0** and was inflatable by trivially reconciling reference rows. Both sides restricted to the `recon_line` universe; static reconcilable/reference classification by kind; `REFERENCE` terminal state added; bank-view and ledger-view coverages appended as mandatory metrics 27–28; `batch_value_paise` added to `CloseReport`; the 1.1.1 definition retained as an `EXPLORATORY` audit line. | **Metric amendment + preregistration amendment.** Definitions amended: metrics 1 and 9. Values change through altered input populations: metrics 2, 3, 4, 6 (`misdirected_value_inr`), 8, 10, 12, 16, 26 (`c_review_sensitivity`), and S3's absolute bar. Full dependency statement in `PREREGISTRATION.md §8`. | `EVALUATION_SPEC.md §4.1`, §5.2, `DATA_MODEL.md §10.1`, §13, §20, `RECONCILIATION_SPEC.md §9`, §10.1, `PREREGISTRATION.md §8`, `PROJECT_SPEC.md §7`, `§L.1` |
| **B4** | **Held-out families.** §C declared Tier-0 "binding and complete" while omitting F07 and F09, which §I twice mandates authoring and which `PREREGISTRATION.md §4.1` and §6.1 already declare as sealed test-only families. F07 and F09 promoted into T0-3; the corresponding §H stretch row deleted. | Planning correction. `PREREGISTRATION.md §4.1` and `§6.1` family/seed definitions **untouched**. | `DECISION_BRIEF.md §C`, §H, §I |
| **N1** | **Close policy scale-dependence.** `min(0.005 × batch, ₹50,000)` crosses over at exactly ₹1 crore. S1 forces every conforming run above ₹2.7 crore, so `max_unresolved_ratio` never bound, the rule permitted exactly three average payments unresolved whether the batch held 600 or 24,000, effective strictness varied 40× across the mandated 1k/10k/100k sweep, and metric 11 would have been constant for ASSAY while `A2-NOABSTAIN` closed on every run. The absolute bound is deleted; the 0.5% ratio is unchanged (`50 bps`); per-family record composition is frozen before generation because the threshold is now a proportion of batch value; both policies are scored and reported per run. Assumption F9 is narrowed so it can no longer authorise result-driven re-tuning. | **Preregistration amendment + benchmark amendment** | `RECONCILIATION_SPEC.md §10.2`, §10.3, `PREREGISTRATION.md §4.1`, §7, §9, §10 V10, `DATA_MODEL.md §18`, §20, `EVALUATION_SPEC.md §4.9`, §5.3, §5.4, `DECISION_BRIEF.md §D.8`, `§F` F9, `§L.1`, `§L.4` |
| **A3** | **Undefined accounting semantics.** B1's posting table surfaced a pre-existing gap: three of the five `Adjustment.reason` values (`chargeback_debit`, `chargeback_reversal`, `manual`) have no authoritative mapping to any of the seven control accounts, and B4 makes `F07` — which generates the first two — a Tier-0 deliverable. **No mapping was invented and no eighth account was added.** Such an adjustment posts to Suspense under fallback **P8** as an `E12_ADJUSTMENT_UNEXPLAINED` exception with an owner and an analyst question. `fee_correction` and `gst_correction` keep their determinate mappings. | Architecture correction | `DATA_MODEL.md §17.2`, `RECONCILIATION_SPEC.md §9`, `EVALUATION_SPEC.md §4.4`, `PREREGISTRATION.md §8` metric 10, `§L.4` |

**Why these are not post-hoc optimization.** No benchmark result exists, no source
code exists, no benchmark has been sealed, and no score has been observed — all
four verifiable from this repository's git history. B3 **removes** an inflation
vector and tightens S3's absolute bar by roughly 5.9×. A3 makes ASSAY look
*worse*, not better: more open exceptions raise `net_cost_inr`, lower
`coverage_by_count`, raise `unresolved_value_inr` and make `CLOSED` harder to
reach. N1 does not change the 0.5% ratio and is justified by two properties of the
rule — 40× strictness variance across a mandated sweep, and a metric constant for
the system under test — neither of which references measured performance. Both the
old and new close policies are reported for every run, and F9 no longer permits a
result-driven adjustment.

**What this amendment deliberately did not do.** No optional item-level
concentration bound on unresolved Suspense items. No eighth `AccountCode`. No
per-family record-count values — the freeze rule is written, the composition
remains an explicit pre-generation decision. No fixed-point scale other than the
basis points the specification already used.

### A.6 Spec 1.3.0 / benchmark 1.0.2 — the adjustment observability seam, and the selective-risk measurement defect it exposed

A closure audit over the sealed 1.2.0 specification found that `DATA_MODEL.md
§17.2` branched the agent's posting on `Adjustment.reason`, a field no observable
schema carries. Tracing that seam surfaced three further consistency gaps of the
same root (G-C, G-D, G-E), an unreproducible ground-truth field (F-14), and a
defect in frozen secondary metric 6 (H-1). All six are corrected here, **before
any code existed, before any dataset was generated, and before any number was
observed** — the same window in which the 1.1.1 and 1.2.0 corrections were made.

**One frozen metric formula changes, and its direction of effect is disclosed.**
H-1 restricts `balance_harm_inr` to the covered set. That **lowers** the metric
for every abstaining system, ASSAY included, and through metrics 2 and 3 it may
improve two of the four headline numbers; it also makes S3 easier to pass. It is
nevertheless required, because `PROJECT_SPEC.md §7` S3, `EVALUATION_SPEC.md §1`,
§4.5 and §5.1 each independently specify the covered-set form, and the whole-run
form made harm *rise* with abstention — inverting the risk–coverage curve metric 3
integrates and giving `A2-NOABSTAIN`, the ablation built never to abstain, the
best harm score in the field. The correction also **raises** `A2-NOABSTAIN`'s
harm, which cuts against ASSAY's headline comparison rather than for it. The full
statement is in `PREREGISTRATION.md §8`.

**The package is not uniformly favourable.** Scenario C makes the benchmark
harder on four axes simultaneously: every adjustment now becomes an exception, so
metric 12 rises, metric 2's exception term rises, and `CLOSED` becomes harder to
reach (`PREREGISTRATION.md §10` V10). No difficult case was removed, no
distribution altered, no threshold moved.

**No constraint `C1`–`C8` changed in membership, no `AccountCode` was added, no
soft-evidence weight, seed, split, generation parameter or degradation operator
changed, the oracle is untouched, and `DATA_MODEL.md §16`'s hashed `body` and
genesis are unchanged — B2 is not reopened.**

| # | Correction | Class | Where |
|---|---|---|---|
| **G-B / Scenario C** | **Adjustment observability.** `§17.2` branched on `Adjustment.reason`, but no documented observable carries it: `Adjustment` is `[ASSAY-MODEL]` in full (§22.2 M9), `ReconLine` has no `reason`, and `fee`/`tax` cannot discriminate because `fee` is GST-inclusive with `tax` inside it, so both are non-zero together. A3's two determinate agent-side mappings were unreachable by the agent while truth could execute them — an information asymmetry `balance_harm_inr` charged to ASSAY. **Every adjustment now takes P8.** Truth retains the five-way branch; `reason` stays true-state only; no field is exposed. | Architecture correction + A3 amendment | `DATA_MODEL.md §9`, §10, §17.2, §22.2 M15, `RECONCILIATION_SPEC.md §9` |
| **G-C** | Three of nine `Observation.kind` values had no producible `source_system`, contradicting `ARCHITECTURE.md §6`'s anonymity rule, and `payload` was elided. The `(kind, source_system, payload)` mapping is now normative; two source values added; `Adjustment` is deliberately absent from the payload union. | Consistency + minor schema | `DATA_MODEL.md §10`, `ARCHITECTURE.md §6` |
| **G-D** | `C2`'s adjustment half constrains `related_entity_id`, which no observable schema declares, so neither engine nor oracle could evaluate it and the consistency gate agreed trivially. Declared a generation invariant and non-binding agent-side, following the `C8` precedent. **`C1`–`C8` membership unchanged.** | Consistency correction | `RECONCILIATION_SPEC.md §4.1`, `PREREGISTRATION.md §5.3` |
| **G-E** | P8 posted `ReconLine.amount`, which is unconstrained on adjustment rows, while `I4` and `C6` move settlements by `debit`/`credit`. P8 now posts the non-zero `debit`/`credit`. **No `amount = debit + credit` identity is asserted.** | Consistency correction | `DATA_MODEL.md §17.2` |
| **F-14** | `true_balances` was a stored vector with no specified derivation — not recomputable, not auditable, and not projectable onto a subset. `GroundTruth` gains `true_journal` with `source_entity_id` and `posting_ref`; `true_balances` becomes its projection; `gt_version` → 1.1.0. Not hash-chained; §16's `body` and genesis are unchanged. | Architecture correction + schema amendment | `DATA_MODEL.md §1`, `PREREGISTRATION.md §9` |
| **H-1** | **`balance_harm_inr` restricted to the covered set**, with `misdirected_value_inr` scoped likewise. The v1.0.0 / v1.0.1 whole-run form made harm rise with abstention, inverted the risk–coverage curve metric 3 integrates, and gave `A2-NOABSTAIN` the best harm score in the field. S3, `EVALUATION_SPEC.md §1`, §4.5 and §5.1 each independently require the covered-set form. Thresholds unchanged. **Direction of effect disclosed in `PREREGISTRATION.md §8`.** | **Metric amendment + preregistration amendment** | `EVALUATION_SPEC.md §4.4`, `PREREGISTRATION.md §8`, §10 |

**What this amendment deliberately did not do.** No observable field was added to
any schema — `reason`, `direction` and `related_entity_id` remain true-state only.
No eighth `AccountCode`. No constraint added, removed or reordered. No threshold,
seed, split, family, generation parameter or degradation operator touched. No
`amount = debit + credit` identity invented for adjustment rows. `DATA_MODEL.md
§16`'s hashed `body` and genesis were not reopened.

### A.7 Spec 1.4.0 / benchmark 1.0.3 — the posting layer, and the gate that could not be satisfied

A governance review held **before `journal.ts` was written** found that the
posting layer could not be implemented from the frozen text without inventing
accounting semantics, which `§L.4` prohibits. Three defects were structural and
interlocking: `P8`'s universal fallback was not constructible outside
adjustments; nothing mapped observations onto the posting table, leaving eleven
of fourteen exception classes and all of `P1`–`P4` without a trigger; and gate
`G3` quantified over an item partition no field defined, against a right-hand
side that made the identity **unsatisfiable on this specification's own worked
example**. Four further gaps of the same root are corrected with them.

Applied **before any code for the affected layer existed, before any dataset was
generated, and before any number was observed** — the same window in which the
1.1.1, 1.2.0 and 1.3.0 corrections were made, and, because the next step after
it is `assay generate --split test`, **the last amendment that can claim it.**

**One frozen metric's universe changes, and it is the favourable direction.**
`H-2` restricts `unresolved_value_inr` to open Suspense items. That **lowers**
metric 12 and makes `CLOSED` easier to reach, which is the opposite of `§A.6`'s
Scenario C. It is nevertheless forced rather than chosen: `G3` is an identity
exact to the paisa, `RECONCILIATION_SPEC.md §11` posts ₹1,00,000 against a
multi-view total of ₹3,00,000, and the only alternative remedy — posting every
view — credits `1100_GATEWAY_RECEIVABLE` twice for one economic break. Under the
v1.0.2 universe every conforming run ends `BLOCKED`, which violates metric 14 by
construction and makes success criteria S5 and S12 unreachable. **Replacing a
gate no implementation can pass is not the same as relaxing a hard one**, and
the superseded quantity is retained and reported on every run as
`unresolved_value_inr_multiview`. Full statement in `PREREGISTRATION.md §8`.

**`unresolved_value_paise` falls through two channels, not one, and both are
disclosed.** The first is `H-2`: several views of one economic break now count
once. The second is `G-G`: **seven of the fourteen exception classes open no
Suspense item, so their value leaves the close numerator entirely** — `E05`,
`E06`, `E07`, `E08`, `E10`, `E11` and `E13`. Through v1.0.2 the specification
nominally counted them (it required every `EXCEPTION` to post, without saying
how); under v1.0.3 they are named, owned, priced at `C_exception` and reported,
but they are outside the close gate. **A period can therefore close while the
merchant ledger is substantially untied**, which is the failure mode
`EVALUATION_SPEC.md §4.1` warns about when it publishes three coverage views
instead of one. Three things bound it and none of them is the close gate: metric
28 `coverage_by_value_ledger` scores zero for exactly that behaviour, every such
exception costs ₹500 in `net_cost_inr`, and `EVALUATION_SPEC.md §6` now requires
the count and value of non-posting exceptions to be reported separately.

**`G-G` pushes both ways and its net is not claimed.** Seven other classes —
`E01`, `E02`, `E03`, `E04`, `E09`, `E12`, `E14` — open Suspense items that no
implementation was opening before, *raising* `Σ |item_net_paise|` and
`unresolved_value_paise`. Whether the seven that leave outweigh the seven that
arrive depends on the value distribution across classes, which no seeded run has
produced. **This section claims no net direction for `G-G` and no net direction
for the package on metric 11**; the dev falsification check (`§F` F9) is where
that is observed, and F9 forbids re-tuning in response to it.

**Metric 2 is unaffected by `G-G`**: its exception term is a count, and all
fourteen classes produced an `Exception` record before the amendment and produce
one after. `G-F` removes a fallback that would have posted *something* for every
unmapped event and replaces it, for seven classes, with an honest refusal to
post.

**No constraint `C1`–`C8` changed in membership, no `AccountCode` was added, no
posting rule `P1`–`P8` was added or altered in its debit/credit shape, no
soft-evidence weight, threshold, seed, split, family, generation parameter or
degradation operator changed, the oracle is untouched, and `DATA_MODEL.md §16`'s
hashed `body` projection and genesis definition are unchanged — `§A.5` B2 is not
reopened.**

| # | Correction | Class | Where |
|---|---|---|---|
| **G-F** | **The universal `P8` fallback.** `§17.2` closed with *"any posting not enumerated in §17.1 or §17.2 falls to P8"* and `§L.4` made departing from it an amendment, but `P8`'s amount `M` is read off `ReconLine.debit`/`credit` under a guarantee `I3` gives for `type === "adjustment"` only. Outside that domain no `M` exists (`bank_line`, `ledger_entry`, `settlement`, `dispute` carry no `ReconLine`); `M` is not unique on `E05`/`E06`/`E07`, which are raised *because* `I3` failed; and where `M` is unique it is the wrong figure — on a well-formed card line at frozen §4.2 parameters it posts `97_640` against a value of `100_000`, failing `G3` by the fee. **`P8` narrowed to adjustment observations; the catch-all deleted; `§L.4` amended.** | Architecture correction | `DATA_MODEL.md §17.2`, `§L.4` |
| **G-G** | **The posting-trigger mapping.** `§17.1`'s table was keyed by prose descriptions of economic events; nothing mapped `Observation.kind`, terminal state or `ExceptionClass` onto it. Three of fourteen exception classes had a posting and eleven had none, while `RECONCILIATION_SPEC.md §9` required all fourteen to post; `P1`–`P4` and `P7` had no trigger. **`§17.1.1` added, total over kind × state × class.** Seven classes open a Suspense item by direction of the item; seven post nothing, because they failed ingest validation, duplicate another record, are a deferral §15 refuses to call an error, or would let an untrusted source move a control account. **No account and no posting rule added.** | Architecture correction | `DATA_MODEL.md §17.1`, `RECONCILIATION_SPEC.md §9`, `THREAT_MODEL.md §T5` |
| **G-G.1** | **Two corrections to `§17.1.1` found in pre-commit review of this amendment, before it was committed.** *(B2)* A drafting error gave the Suspense table a row for *"`ABSTAINED`, target is a payment `recon_line`"*. **No `recon_line` is ever a target** — `RECONCILIATION_SPEC.md §4` and `Candidate.target_id` (§11) both enumerate the target universe as settlement or bank line, and `PREREGISTRATION.md §8` records it as a frozen dependency of the Ambiguity Oracle. The row was unreachable, and the non-target-member row already governs abstained recon lines, so it is **removed**; the target universe is restated in §17.1.1 and is **not widened**. *(B3)* The draft triggered `P2`/`P4` on *"its allocation reaches `RECONCILED`"*, which `AN1` alone can satisfy — a gateway-internal identifier match carrying no bank-side information. That would debit `1200_BANK` (*"actual bank credits"*, §17) for a settlement whose credit has not arrived, which is the failure `I5` names in its own purpose column. **`P2`/`P4` now require the settlement to be reconciled to a bank credit against an actual `bank_line`**, and §17.1.1 states that `I5` is **undefined, not satisfied**, when no mapping exists. `P2`'s own row has read *"Settlement reconciled to a bank credit"* since spec 1.2.0, so this restores its stated trigger rather than adding one. **No posting rule, amount, account, threshold or metric definition changed**, terminal states are unaffected, and metric 1 is unaffected because the line still reaches `RECONCILED` on `AN1`. A residual is disclosed in §17.1.1: an `E14` break opens two Suspense items for one economic event. | Consistency correction *(within this amendment, pre-commit)* | `DATA_MODEL.md §17.1.1` |
| **G-H** | **The Suspense item key.** `G3` quantified over *"each open Suspense item `i`"* and no field partitioned journal lines into items; `true_journal` had `source_entity_id` as *"the JOIN KEY"* (§1) and the agent side had no counterpart, leaving at least four inconsistent readings each giving a different value of frozen metric 13. **`JournalLine.source_entity_id` added**, named identically to truth's. *Open* is arithmetic — a `P7` reversal under the same key nets the item to zero. Every digest changes; §16's `body` projection and genesis do not. | Architecture correction + schema amendment | `DATA_MODEL.md §16`, `RECONCILIATION_SPEC.md §10.1`, `ARCHITECTURE.md §8`, `§L.1` r6 |
| **G-I** | **`value(observation)`.** `Exception.value_paise`, `value_abstained_paise`, `exceptions_by_class` and `G3`'s right-hand side all read an observation's rupee value and **no document derived it for any kind.** `§14.1` states one rule per reconcilable kind. An adjustment is valued at `M`, not `ReconLine.amount`, which `I3` leaves unconstrained on adjustment rows. | Consistency correction | `DATA_MODEL.md §14`, `§20`, `EVALUATION_SPEC.md §4.9` |
| **H-2** | **`unresolved_value_paise` restricted to open Suspense items**, read from the `Decision`/`Exception` records so `G3` compares the queue against the books — two independently maintained stores over one universe, which is all `THREAT_MODEL.md §T8` requires. The v1.0.2 multi-view universe made `G3` unsatisfiable. **Direction of effect disclosed: metric 12 falls, `CLOSED` becomes easier.** The v1.0.2 quantity is retained as `unresolved_value_inr_multiview`, `EXPLORATORY`, on every run. | **Metric amendment + preregistration amendment** | `RECONCILIATION_SPEC.md §10.1`, `§10.3`, `§11`, `EVALUATION_SPEC.md §4.9`, `§6`, `DATA_MODEL.md §20`, `PREREGISTRATION.md §8`, `§L.1` r6 |
| **C-1** | **`ValidatedDecision` defined.** Named at five sites, defined at none — no fields, no declaration site, no enforcement of *"only S5 may construct"*. Declared in `packages/ledger`, minted only in `engine/src/s5-validate.ts`, enforced by a non-exported unique-symbol brand plus an ESLint path allowlist reusing `§L.1` rule 3's mechanism. Every field traced to the gate or invariant that demands it. Records that `journal.ts` is a pure function and is S5's dependency, so there is no cycle. | Implementation-contract clarification | `ARCHITECTURE.md §4`, `§L.1` r4, `§L.2` |
| **C-2** | `THREAT_MODEL.md §T8` still stated `G3` in the **net** form spec 1.2.0 amended away from, in the section that motivates the gate. Restated gross per-item. | Consistency correction | `THREAT_MODEL.md §T8` |
| **C-3** | `§L.2` named `ledger` once, third, while `§I` already scheduled Layer A on day 1 and Layer B after engine S4–S5 — which read as a dependency cycle around `ValidatedDecision`. Split to match `§I`. | Consistency correction | `§L.2` |
| **C-4** | Metric 28 read `Σ ledger_entry.amount`; `MerchantLedgerEntry` declares `gross_paise` and no `amount`, so the metric was not computable. Corrected. | Consistency correction | `EVALUATION_SPEC.md §4.1` |
| **I-1** | `vitest.config.ts` carried an unactioned review note four commits past its trigger, and nothing detected a per-package suite deletion — vitest decides a run from the aggregate module list against the root config, so `passWithNoTests` and per-project overrides both miss it. `passWithNoTests: false`; `tests/workspace-suite-floor.test.ts` makes `§L.3` executable. | Infrastructure correction | `vitest.config.ts`, `tsconfig.json`, `tests/` |

**What this amendment deliberately did not do.** No eighth `AccountCode`. No
ninth posting rule, and no change to the debit/credit shape of `P1`–`P8`. No
observable field added to any *entity* schema — `reason`, `direction` and
`related_entity_id` remain true-state only, and `source_entity_id` is added to a
journal line, not to an observation. No threshold, seed, split, family,
generation parameter or degradation operator touched. No change to `§16`'s `body`
projection or genesis. No new close policy — `max_unresolved_ratio_bps` remains
50. No success-criterion threshold moved. No item-level concentration bound on
unresolved Suspense. No `journal.ts`.

**The honest reading of the cadence.** This is the third amendment cycle on a
specification `PREREGISTRATION.md` describes as frozen, and the first whose net
effect on a close-loop metric favours the system under test. That pattern is a
fair question independent of any single item's merits, and the answer is checkable
rather than asserted: `git log` and `git tag -l` show no seal, no dataset, no
benchmark manifest and no executed run at the point of amendment, and
`RECONCILIATION_SPEC.md §11` — unchanged since spec 1.2.0 — demonstrates the
defect inside the frozen text without reference to any result. The mitigation is
a number, not a paragraph: both universes are reported on every run.

### A.8 Spec 1.4.1 / benchmark 1.0.3 — the anchor that could not be built, and should not have been

A governance gate held **before `packages/generator` was written** asked what
terminal state a `ledger_entry` can attain, and found that it can attain only one.
`AN5` — the merchant ledger's sole anchor — compares `merchant_ledger.order_ref`
against `order.receipt`, and `order.receipt` is quarantined by `DATA_MODEL.md §0`
rule 4, unreadable by the deterministic core under `ARCHITECTURE.md §4` boundary
1, and undelegatable because `RECONCILIATION_SPEC.md §3` bars anchors from LLM
involvement. The shipped `OrderSchema` already carried no `receipt` field, which
is what made the contradiction concrete rather than arguable: `packages/domain`
implemented the quarantine correctly and thereby demonstrated that an anchor the
reconciliation spec declares cannot be built.

**The second reason is the one that decided it.** `THREAT_MODEL.md §T5` holds
that the merchant ledger *"only contributes **soft** evidence (`SE2`)"* and
`DATA_MODEL.md §12` that *"soft evidence can only rank, never admit."* `AN5` made
a merchant-controlled field a **hard** anchor, and `§3` removes everything
anchored from the search space — so an insider controlling `order_ref` could set
it equal to a real `receipt`, anchor a fabricated entry, and retire it from the
exception queue. **That is `§T5`'s own attack, succeeding through the mechanism
meant to catch it.** A derived digest key was considered and rejected: it hides
the plaintext from the core but the preimage is guessable by construction, so it
changes nothing about forgeability while adding a carve-out to §0 rule 4. `AN5` is
therefore retired rather than repaired, and the quarantine and `§T5`'s doctrine
are left as the single consistent principle they always were — `AN5` was the
outlier.

**Consequences are published, not compensated.** Every `ledger_entry` now reaches
`E13_LEDGER_ONLY`, so metric 28 reads `0.0`, metric 9 is depressed, and metric 2
carries one `C_exception` per ledger entry. **No metric definition was amended and
no threshold or composition was adjusted** in either direction; three disclosures
and one `EXPLORATORY` companion line carry the effect instead. `PROJECT_SPEC.md
§1` restates the claim honestly: three sources consumed, two tied out against each
other, the third held as soft evidence and flagged wholesale. Reclassifying
`ledger_entry` as a reference kind was rejected for the opposite reason to the
digest key — it would delete `E13` and with it `§T5`'s detection entirely, paying
a benchmark version bump to reach a weaker security position.

**Benchmark v1.0.3 is unchanged, and the reason is precise:** no metric
definition, threshold, family, split, baseline, ablation, seed count or stopping
rule moves, and no measured quantity moves relative to any *conforming*
implementation — because no conforming implementation could ever have executed
`AN5`. Applied **before any dataset was generated and before any number was
observed**, on an analytical finding rather than an observed result. `§F` F9's
prohibition is untouched: nothing here adjusts the close policy, and `§L.4`'s ban
on result-driven parameter changes is unaffected because no result exists.

**What this cost and what it bought.** The project loses the ability to
demonstrate three-way tie-out and must say so in its own words. It gains a
threat-model control that holds unconditionally, and a governance record showing
that the specification's own anchor was tested against the specification's own
threat model and removed. `§G` item 4 already conceded that three-way
reconciliation over a synthetic bank statement *"isn't really three-way"*; this is
a sharper version of a concession already on the record, and it is a design
rationale rather than an admission of synthetic weakness.

### A.9 Spec 1.4.2 / benchmark 1.0.3 — the batch that could not be represented

A governance gate held **after `packages/generator` was written and before any
dataset was generated** asked what a capture-day batch does when its refund
debits exceed its credits. The answer was that it cannot do anything: four frozen
rules are jointly unsatisfiable there, and the specification had never said so.

`ARCHITECTURE.md §4` requires `Settlement.amount` to be a non-negative amount.
`I4` fixes `settlement.amount = Σ credit − Σ debit` over the allocated lines.
`I3` enters a refund into that sum as a **debit**. And `PREREGISTRATION.md §4.1`
allocates **one batch per capture-day** against `§4.2`'s 4.5% refund rate and its
log-normal amount distribution, whose p99 is ₹2,40,000 against an expected daily
gross of roughly ₹3,04,000. The generator surfaced it rather than absorbing it:
its default was to refuse, name the family, seed, day and shortfall, and call the
case a specification seam.

**The frequency is what made it blocking.** Over 2,000 family instances at the
frozen parameters, **22.15%** contain at least one such batch — every family,
17.0% (`F09`) to 30.0% (`F02`) — with shortfalls from ₹46 to ₹25,97,694.
Estimated under independence, the probability that all five seeds of the
`F01`–`F06` range generate is **0.039%**, and **0.88%** for the held-out
`F07`–`F10` range. This was not an edge case to be documented; the benchmark
could not be produced.

**Two resolutions were traced in full, and the smaller one was taken.** The
rejected alternative was to defer the refund to a later batch on the shape of
`DATA_MODEL.md §22.1` D23, *"Partial settlements defer whole transactions to the
next slot"*. Three findings decided against it, **none of them a metric**:

1. **The documentary claim does not survive.** D23 is documented for *payments*
   deferred **out of** a settlement that cannot carry them, which lowers that
   settlement's amount. Deferring a *refund* **in order to raise** a settlement
   out of negative territory inverts both the item type and the direction.
   Asserting it would promote an `[ASSAY-MODEL]` decision to `[RZP-DOC]`, the
   move `DATA_MODEL.md §0` rule 6 forbids and spec 1.1.1 was released to correct.
   Both options are ASSAY's own; deferral simply carries more machinery.
2. **It does not terminate on its own.** Over 6,480 refunds, deferral reaches a
   depth of 22 slots, carries 2 in 60 past `C4`'s `T_max = 7` calendar days —
   making the *true* allocation inadmissible, failing the completeness gate, and
   invalidating the benchmark under `PREREGISTRATION.md §5.3` — and leaves 12 in
   60 with no slot before the period ends. **Deferral still needs the unsettled
   state as its residue**, so it is an additional mechanism on top of the adopted
   rule rather than an alternative to it.
3. **It is the option that flatters the headline metric.** Refunds fail to fit
   precisely *because they are large*. Deferral settles exactly those, raising
   metric 1 `coverage_by_value`, on which `PROJECT_SPEC.md §7` S2 sets a ≥ 0.90
   threshold. Choosing the metric-improving option at a governance gate is the
   shape of decision pre-registration exists to prevent, and it is recorded here
   so that the choice cannot be read as having been made on those grounds.

**The adopted rule makes an already-reachable state explicit.** `§4.1`'s `F02`
mechanism settles a refund *"in batch N+2"*, which leaves the 31-day grid for a
refund raised in the final two days; measured under the pre-amendment default,
198 of 207 completing `F02` instances already contained unsettled refunds. `F06`
already declares that a capture *"remains unsettled within the period"*. Truth
and agent both post `P3` at ingest and neither posts `P4`, exactly as
`DATA_MODEL.md §17.1.1` already conditions them, so the two journals agree and
`balance_harm_inr` is unaffected. No posting rule, account or exception class is
added.

**What the batch-composition rule did not itself decide, and how it was closed.**
Three questions survived it, and each was traced against the existing text before
anything was written. **The `§15` class an unsettled refund reaches:** `E02` could
not be stretched to it — `§17.1.1` keys `E02` to `pay_…` and posts `P6`, crediting
`1100_GATEWAY_RECEIVABLE`, an account a refund never debited, so applying it would
put `proj_agent ≠ proj_truth` on a *correct* decision. `E11` was the only member of
the closed fourteen whose meaning and absent posting both fit, but its stated
trigger is the observation's **own** clock, which `PREREGISTRATION.md §4.2` makes
explicit — so extending it is a **semantic addition** and is labelled one rather
than passed off as reading. **`§17.1.1`'s totality claim:** `§17.2` asserted the
trigger table was total over `Observation.kind` while the `refund` kind had no
row; the row added is a **contradiction repair**, because non-posting was already
forced by exhaustion over `P1`–`P8` — `packages/ledger` had reached the same
conclusion independently and named the seam rather than papering over it.
**`C3`/`C4` against a null `settled_at`:** the specification does not determine
it, and the choice was put to the human rather than taken at the keyboard. What
the text *did* settle was ruled out first — `C8`'s unique *"for members claimed as
settled"* scoping shows the silence of `C3` and `C4` is deliberate, so they are
unconditional and cannot merely "not apply" — and the ratified reading is that
neither is satisfied and the member is excluded from every candidate.

**None of the three moved a frozen quantity**, all three are recorded at
`PREREGISTRATION.md §10` V15, and the one consequence left open — the terminal
state an ordinary `refund`-kind observation reaches under `G1`, and that kind's
absence from `§14.1` — binds the engine phase rather than generation.

---

---

### A.10 Spec 1.4.3 / benchmark 1.0.3 — the field that was never defined

A governance gate held **after the `packages/oracle` design audit and before any
dataset was generated** asked what bounds the oracle's candidate pool. The answer
was that nothing does, and that the reason is a field with no semantics.

`PREREGISTRATION.md §5.2` requires the oracle to check candidates *"over a fully
enumerated space"* under `C_oracle = 2,000,000`, which is satisfiable only where
the pool holds at most twenty members. Nothing in `C1`–`C8` bounds one: every
per-member clause is silent about the target, so the pool is every unanchored
eligible line in the dataset. The budget was describing a decomposition the
constraint set did not deliver.

**The cause was one undefined field.** `ReconLine.settled_at` was declared in
`DATA_MODEL.md §6` with no comment, no provenance class and no semantics anywhere
in the specification — while `C3` chains through it, `C4` is named *"Settlement
window"* and justified by the documented T+2 **settlement** cycle, and `§7`
contrasts the bank line as having *"a different clock (value date, not
`settled_at`)"*. Three frozen clauses read a term none of them defined, which
`§0` rule 6 makes a defect independent of anything the oracle needed.

**What was rejected, and why it matters more than what was adopted.** The
tractable rule available without any amendment was to compare a member's clock to
`Settlement.created_at`. It holds on every generated row. It was **refused**:
`Settlement.created_at` is `[RZP-DOC]` and documents the creation of the
settlement *record*, so reading it as the transfer instant would promote an ASSAY
convention onto a documented field against `§0` rule 6 — and the identity is
observable only in `packages/generator/src/emit.ts`, which is not a normative
source. Had it been false, it would have excluded **every** true allocation rather
than degrading, and no differential test could have detected the assumption. A
second alternative — enumerating by ascending cardinality until the budget was
spent — was rejected against `§5.2`'s *"fully enumerated space"*.

**What was adopted.** The definition itself, as `[ASSAY-MODEL]` M18: `settled_at`
is the instant the carrying settlement transferred, identical across every line
that settlement carried. Its consequence follows without a new rule — two members
with different `settled_at` sit in different settlements, so a candidate cannot
hold both — and that partitions the pool into equivalence classes the declared
budget can fully enumerate. The relation is **member-to-member**, so `§4.1`'s
*"no constraint is re-based onto the target's settlement clock"* stands untouched,
and the definition explicitly asserts nothing about `Settlement.created_at`. It is
**necessary, not sufficient**: lines sharing an instant need not share a
settlement, so `F08` stays a matching problem and `C6` still has to separate two
same-instant settlements.

`C3`'s split is the second item and is independent. Its two conjuncts have
different evidence requirements — `created_at ≤ settled_at` is intrinsic to the
member, `settled_at ≤ bank.value_date` needs a bank line `AN2` can identify on
roughly three settlement targets in ten. Declaring the second half
**binding-when-in-scope** stops it returning a silent pass that `§5.3`'s
differential test would have counted as agreement it never tested. The residual —
admissibility that is not uniform across targets — is disclosed at `§10` V16
rather than repaired, because repairing it would move `§4.2`'s frozen 30/70
`bank_ref` quality and that is a new benchmark version.

**What this amendment does not close.** Under the `B2`/`B3` candidate-universe
proposal a bank-line target's members would be settlements, and a `Settlement`
carries no `settled_at` — `DATA_MODEL.md §5` says so — so co-settlement coherence
induces no classes there and that pool is still unbounded. That gap is recorded
and left open rather than closed by analogy, because the only available link runs
through a `§4.2` generation parameter and would repeat the mistake this amendment
refused.

---

### A.11 Spec 1.4.4 / benchmark 1.0.3 — the candidate universe, and the option that was refused

A governance gate held after spec 1.4.3 and before any dataset was generated
asked which observation kinds may be candidate members. The specification had
never said, and it contradicted itself on the answer: `RECONCILIATION_SPEC.md §3`,
`EVALUATION_SPEC.md §4.1` and `PREREGISTRATION.md §10` V15 each bar a kind from
membership because it carries no `credit`/`debit`, while `PREREGISTRATION.md §8`
asserted that reference observations *"remain candidate members"*. A `Payment`
carries no `credit`. Both could not hold.

**What was proposed and rejected.** The earlier audit recommended admitting
`settlement` as a member kind, on the ground that `I5` already names
`Σ settlement.amount` as the bank-line tie-out figure. That option would have made
a `bank_line` target solvable and metric 27 reach ≈ 1.0. **It was refused.**
Verified against the nine entity schemas, only `ReconLine` carries `settled_at`;
`DATA_MODEL.md §5` states that `Settlement` has none. `RECONCILIATION_SPEC.md
§4.1`, ratified at spec 1.4.2 and untouched since, holds that `C3` and `C4`
*"remain unconditional over members"* and that a member whose bounded quantity
does not exist is *"excluded from every candidate"*. Admitting a settlement member
would therefore require declaring `C3` and `C4` **conditional** against that
ratification's explicit words, and inventing five quantities the entity does not
carry — `currency`, `settled_at`, `on_hold`, `credit` and `debit`. That is the
same fault spec 1.4.3 refused when it declined to read `Settlement.created_at` as
a transfer instant, and it is refused again here for the same reason.

**What was adopted.** Eligibility is **derived, not declared**: the 1.4.2
ratification applied to the frozen schemas admits exactly `recon_line` and
`adjustment`, and the independent `C6` credit/debit test returns the same verdict
for all nine kinds. The universe is over-determined by frozen text rather than
chosen, which is why `§11.1` adds no constraint and `constraint_set_hash` does not
move. One genuine declaration was unavoidable and is marked as such: `C1` names
the target explicitly, and neither target kind carries a `currency`, so
`currency(target) := "INR"` is registered at `§22.2` M19 rather than inferred.

**The completeness gate's quantifier moved, and the reason it does not weaken.**
`§4.2`'s `F05` withholds a constituent `recon_line` at emission while
`GroundTruth.allocations` is built from the true state, so `C6`'s term for that
member exists in no observation — the surviving `payment` row carries no `credit`
and no `fee`. No constraint excluded that allocation; it was never expressible.
`§5.3` now quantifies over **expressible** targets, where expressibility is
decided from observation existence and kind alone and reads no constraint, so a
constraint set that wrongly excludes a genuinely expressible allocation still
fails the gate. Scoping instead by whether the oracle enumerated anything would
have been circular and is refused in the text.

**Consequences are published rather than compensated.** A `bank_line` target has
no admissible member, so `AN2` is its only route to `RECONCILED` and metric 27 is
bounded by it; no `bank_line` target is expressible, so the completeness gate
never covers the bank side. Both are recorded at `§10` V18, with metric 27's
definition unchanged — the treatment `V12` already gave metric 28. **A larger
consequence is deliberately not addressed in this amendment:** the close gate is
unreachable under these rules, and that is reported separately and unrepaired as
blocker `B8` rather than folded in here.

---

### A.12 Spec 1.4.5 / benchmark 1.0.3 — the close that cannot happen, and the rule that already covered it

A governance gate held after spec 1.4.4 and before any dataset was generated
asked whether the close gate can ever return `CLOSED` on the frozen population.
It cannot, and the reason is arithmetic rather than a defect in any single rule.

`PREREGISTRATION.md §4.1` realizes `§4.2`'s 30% clean `bank_ref` share exactly —
`realize(30/100, 31) = 9` per family instance — so **at least** 22 of each
family's 31 bank lines carry no anchorable reference. The figure is a floor
rather than an exact count: `F04`'s `DUPLICATE_ROW` and `F08`'s `MANGLE_UTR`
perturb it **upward only**, never down. `RECONCILIATION_SPEC.md §3` makes `AN2`
the only bank-side anchor and `DATA_MODEL.md §11.1` leaves a `bank_line` target
no admissible member, so nothing else can reach them. `§17.1.1` sends each to
`E03` → `P5`, `§14.1` enters it at its full `amount`, and `§10.3` allows 0.5% of
`batch_value_paise`. The bank side alone is of the order of 138 times the
threshold.

**What was rejected.** Six repairs were surveyed. Raising the clean-`bank_ref`
share, redefining `value(bank_line)`, removing `E03`'s posting and raising
`max_unresolved_ratio_bps` all change benchmark semantics and would require a new
benchmark version and fresh seeds; the last is additionally barred by `§L.4`,
which forbids changing a frozen decision parameter *"on the basis of an observed
result"*, and by `§F` F9, which forbids re-tuning in response to the
falsification check. **Withdrawing `S12` was also rejected** — F9's declared
response is to report the finding, and deleting the criterion that surfaces it
would destroy the evidence rather than disclose it.

**What was adopted, and why it is barely a decision.** `§F` F9 already governs
this outcome: if *"all families close, or none does"*, the result *"is reported
as a finding in the threats-to-validity section and the run proceeds to the seal
unchanged"*. This amendment is that report, written from the derivation because
the derivation needs no run. `§I`'s Aug 27 row draws the matching distinction on
the implementation side: the three close outcomes are exercised **on constructed
inputs**, while *"the DEV-seed outcome distribution is recorded for `§F` F9 and
is not a completion gate"*.

**The preregistered claim is unaffected, and that is the test that matters.**
`PREREGISTRATION.md §10`'s claim is a disjunction — the period close *"either
completes with balanced books **or refuses to complete with the unresolved value
quantified**"*. A run that ends `OPEN` with `unresolved_value_paise` named
satisfies the second disjunct. `S12`'s `CLOSED` half is reported failed; its
`OPEN` half passes, and `S12`'s stated purpose — that a gate which has never
refused is untested — is met on every run. `PROJECT_SPEC.md §7` lists `S3`,
`S4`, `S6`, `S9` and `S11` as the criteria that matter and none of them reads the
close outcome.

**Evidence discipline.** The derivation uses frozen parameters only and
references no seed. It was separately illustrated on seeds outside `§6.1`'s split
table, which are **not benchmark results** and carry no `AL7` consequence.
Confirmation on split seeds remains `F9`'s dev run, which this record does not
pre-empt.

---

### A.13 Spec 1.4.6 / benchmark 1.0.3 — the base for τ, ratified rather than derived

A governance gate held after spec 1.4.5, during the `packages/oracle` build and
before any dataset was generated, asked what `τ`'s *"10 bps of component value"*
is 10 bps **of**.

The frozen formula names a quantity: `Component.total_value_paise` is the only
value field the `Component` entity carries (`DATA_MODEL.md §11`). The pointer
resolves. **The field did not.** It appeared exactly once in nine documents, as a
bare declaration with no comment, while the sibling line above it carried one.

**Three readings were examined and one was eliminated on the text.**

*Option A, the target's own amount,* was **rejected outright**: no section names
a target's value as the component's value, so it has no normative pointer at all.
It is what `packages/oracle` implemented before this gate, and it is recorded
here as an error found and corrected rather than quietly replaced.

*Option C, members plus targets,* has the better single citation — `§5`'s graph
where *"nodes are unanchored observations **and** targets"*. It was **rejected on
double-counting**: `§14.1` values a settlement at `payload.amount` and each of its
recon lines at `payload.amount`, while `I4` closes the settlement as the sum of
those lines, so C counts one economic break roughly twice. That is the inflation
`RECONCILIATION_SPEC.md §10.1` removed at benchmark v1.0.3, where *"posting each
view separately would relieve `1100_GATEWAY_RECEIVABLE` twice for one break"* and
each break must now *"contribute once"*. **The analogy is the reason for the
choice, not a demonstration that the text required it** — `§10.1` decided that
for `unresolved_value_paise` under gate `G3`, not for this field.

*Option B, members only,* is adopted: the narrower, member-scoped reading,
consistent with `§11`'s own `size` comment (*"|members|"*) and total over
`§14.1`'s existing valuation table for every member-eligible kind.

**A second ambiguity was found inside Option B, before the amendment was
applied, and it is recorded rather than glossed.** The first drafting said the
sum ranged over *"the component's member observations"*. That phrase admitted
three readings — the component's unanchored nodes, the whole allocation including
anchored members, or merely every observation of a member-eligible kind — because
`member_obs_ids` is declared **three times** across `Candidate`, `Component` and
`AmbiguityCertificate`, and only the `Candidate` one carried a comment. The two
live readings differ by roughly 3.2× on a realistic settlement, which moves labels
at the threshold. `§11` therefore now defines `Component.member_obs_ids` **first**,
as `§5`'s unanchored observation nodes, and states the three-way distinction
explicitly. `§11` had never said that `Component` is `§5`'s graph output; the link
was by name and stage only.

**This is a governance decision and the record does not dress it as anything
else.** Neither B nor C was excluded by spec 1.4.5. A reviewer who prefers C is
not contradicted by the frozen text; they are outvoted by this gate, and the
reason is written above so the choice can be revisited on its merits.

**What made the choice unavoidable rather than deferrable.** The three readings
give different labels on the same case. On a certified two-solution example with
materiality 75,000 paise, `τ` is 50,000 under A, 100,075 under B and 150,075
under C — `TRULY_AMBIGUOUS` under the first and `IMMATERIALLY_AMBIGUOUS` under the
other two. `§5.4`'s ambiguity ground truth, and through it metric 4 and success
criterion `S12`'s neighbour `S4`, therefore depended on a field the specification
had left blank. `packages/oracle`'s property suite pins that divergence and is
retained, because it is the demonstration that the base has to be normative
rather than a convention.

**A disclosed consequence of the member scope.** Because anchored observations
are excluded, a component's value is the value of its *unanchored* residual, so
`τ` sits at its `₹100.00` floor whenever that residual is at or below `₹1,00,000`
— a threshold derived from the frozen formula alone, since `10 bps` of `₹1,00,000`
is exactly the floor. A fully anchored settlement has `total_value_paise = 0` and
`τ` at the floor; such a target has one solution, so `τ` is never consulted on it.
The `10 bps` term is **not** inert, but it binds on a minority of components. This
is disclosed here rather than treated as a reason to reopen the base.

**No frozen quantity moved.** No `AccountCode`, posting rule, exception class,
metric definition, threshold, rate, composition figure, seed, split, baseline,
ablation or stopping rule changed, `C1`–`C8` are untouched so
`constraint_set_hash` does not move, and benchmark v1.0.3 is unchanged.

### A.14 Spec 1.4.7 / benchmark 1.0.3 — the silence that decided a gate

**The decision.** `PREREGISTRATION.md §4.2` now freezes the **time of day** it had
left free: the settlement instant at `21:00:00` IST on the settlement's own
calendar date, and captures, refunds and ERP bookings within
`[00:00:00, 21:00:00)` IST of their day. Register row M21.

**Why a silence needed closing.** `§4.2` fixed each entity's **day** — capture
window, `T+n` cycle, merchant clock — and said nothing about the time within it.
That looked like a free implementation detail and was not. `C4` bounds
`settled_at − created_at` at `T_min = 1` day; `DATA_MODEL.md §6` makes
`settled_at` **settlement-scoped**, one instant for every line the settlement
carried, explicitly unrelated to `Settlement.created_at`. The gap therefore varies
across a batch by the spread of capture times inside its capture-day, and on a
`T+1` batch a member captured late in the day has a gap under one day in elapsed
seconds and exactly one day as a calendar-date difference.

**That member is in a true allocation, which is what makes it a governance
matter.** `PREREGISTRATION.md §5.3`'s completeness gate requires every true
allocation to appear among the oracle's solutions, and *"if it fails, the
benchmark is invalid and no results may be reported from it."* Two defensible
readings of `C4` therefore disagreed about **whether the benchmark is valid** —
not about a label, and not about throughput.

**The amendment makes the readings agree instead of picking a winner, and that
is the whole of its content.** With every event strictly before the settlement
instant, `elapsed > n · 86_400 ≥ T_min` strictly, `elapsed ≤ 334_800 s ≤ T_max`,
and the calendar difference is `n ∈ {1,2,3} ⊆ [1,7]`. Both readings admit every
member of every true allocation. **`C4` is not amended, `T_min` and `T_max` do not
move, and `constraint_set_hash` does not move.** `21:00:00` is derived rather than
preferred: it is the latest instant leaving the three hours `§4.2`'s own bank
clock needs inside the same calendar date, so `C3`'s bank-arrival half also holds
by construction.

**What was actually wrong, stated plainly.** The property the benchmark's
validity rested on was implemented in `packages/generator`'s `period.ts` and
registered there as `U-CLOCKS` (ratified at this amendment and renamed
`C-CLOCKS`) — **with `spec_basis: null`**, and with a row whose
text recorded only *"drawn uniformly within the IST calendar day"*, omitting the
`21:00` cap and the `21:00` stamp that do the work. An author honouring that row
as written would have drawn over the full day and invalidated the benchmark
without touching a frozen parameter. Meanwhile `packages/oracle`'s `O-C4-UNIT`
described the exposure as a *consistency*-gate concern only, which understated it.
Both rows are corrected and ratified against `§4.2` here.

**No population quantity moves.** The grid states what the benchmark already had:
no rate, count, composition figure, seed, split, family or `target_record_count`
changes, and a regeneration at the same seeds is byte-identical. Benchmark v1.0.3
is unchanged. This is a case of the specification catching up with a property its
own gates already depended on, not of the population being altered to suit an
implementation.

### A.15 Spec 1.4.8 / benchmark 1.0.3 — the word that meant two things

**The decision.** `RECONCILIATION_SPEC.md §4.1`'s `C2` refund half is
**referential**: the refund member's own `order_id` must equal the `order_id` of
the payment its `payment_id` names, and **that payment need not be a member of
the same candidate**. A named payment absent from the dataset leaves the clause
unevaluated and excludes nothing — that is `E10_REFUND_ORPHAN`. Where a
`recon_line` and a `payment` observation both carry the parent's `order_id`, the
`recon_line` governs. Register row M22.

**Why it needed deciding.** *"A refund may only offset a payment on the same
`order_id`"* admits **co-membership** — the parent must be in the candidate — and
**referential** — the refund's own field must agree with its parent's. Both are
ordinary readings of *"offset"*, and neither §4.1 nor
`packages/domain/src/constraints.decl.ts` chose. The declaration carried the
sentence **verbatim**, which mattered because `PREREGISTRATION.md §5.2` has the
engine and the oracle implement *"one declarative specification"*: an ambiguity
there is an ambiguity both must resolve independently, and `§5.3`'s consistency
gate would catch a divergence only at build time, after both were written.

**Co-membership is refuted, not outvoted — and this is the difference from
`§A.13`.** `§4.2` allocates one settlement batch per capture-day; `§4.1`'s `F02`
settles a refund *"in batch N+2"*; and `§4.2` relies on exactly that when it says
the rule *"leaves the 31-day grid for a refund raised in the final two days"* — a
refund can only leave the grid if its batch is keyed to **its own** day. Since a
refund follows its capture, the parent's batch is strictly earlier, so the two
are never in one settlement and never co-members. Co-membership would therefore
exclude **every** refund-carrying true allocation, fail `§5.3`'s completeness
gate, and by `§5.3`'s own words make *"the benchmark invalid"*. Three further
signals point the same way independently: `§3`'s `AN3` gives the link's basis as
*"Referential"*, `§4.1`'s justification is *"a refund documents its parent
`payment_id`"* — a fact on the refund's own row — and `§15`'s `E10` already owns
absence from the dataset, so `C2` was never the absence filter.

**One half of this is a declaration and the record says so.** Nothing ranks the
two observations that can supply the parent's `order_id`. The `recon_line` is
chosen because `DATA_MODEL.md §11.1` scopes a member's quantities to *"its own
observation payload and from no other source"* and `§22.1` D10 makes the
date-scoped recon report the constituent source; taking it from `pg_payments`
would compare across two views whose agreement nothing guarantees, which is what
`F04` and `F08` attack. A reviewer who prefers the other source is not
contradicted by frozen text.

**`constraint_set_hash` moves, and only for this.** From
`1f389d5d4e9898e2dc5ba460ae90f2c95ed22b326ac876c0d92c00930f0e1649` to
`f0c93b5f6a5ffd583c6619a8eaf4d44099718fdf39b28bf61588a887a02f0c1b`, verified by
diffing the canonical serialisation: eight constraints before and after, ids and
order identical, and exactly one field different — `C2.clauses[0].statement`.
`C1` and `C3`–`C8` are byte-identical, the adjustment half is untouched, and the
precedent is `§A.10`, where the `C3` split moved the hash at benchmark 1.0.3.

**No behaviour changes and no data moves.** `packages/oracle`'s `checkC2` already
implemented the referential reading as its unratified `O-C2-REFUND` convention,
so this ratification makes the specification the authority for what the code
already did. No population parameter, seed, split, family or
`target_record_count` changes; benchmark v1.0.3 is unchanged; and no dataset
exists to regenerate.

### A.16 Spec 1.4.9 / benchmark 1.0.3 — two vocabularies, one field

**The decision.** `DATA_MODEL.md §13`'s `invariants_checked` and
`invariants_failed` are retyped from `ConstraintId[]` to **`InvariantId[]`**, and
`InvariantId` is declared as exactly `I1`–`I9`. Register row M23.

**The conflict, stated rather than absorbed.** Three frozen statements could not
all be true at once:

- `§13` typed both fields `ConstraintId[]`, and `ConstraintId` is exactly
  `C1`–`C8` — the hard constraints of `RECONCILIATION_SPEC.md §4.1`, evaluated at
  stage **S2**.
- `RECONCILIATION_SPEC.md §7`, the **only** stage that populates them, is the S5
  validation gate over `I1`–`I9`: *"any invariant failure rejects the allocation …
  The rejected allocation becomes an exception carrying `invariants_failed`."*
- `§10.1`'s gate `G5` and `ARCHITECTURE.md §4` boundary 3 read the fields as the
  **result of that gate** — `§4` puts both on `ValidatedDecision` precisely
  because *"`G5` is unverifiable unless the validated artifact carries the
  result."*

`I1`–`I9` are not `ConstraintId`s, and **no document declared a type for them at
all**. So the fields as typed could not hold the values the specification
requires: S5 could record *that* validation failed but never *which* invariant
failed, and an `Exception` would name a hard constraint for a gate that never
evaluates one.

**Why this is a correction and not a preference.** Unlike `§A.13`, where two
readings were each defensible and one was chosen, here the declared typing is
**unsatisfiable by the stage that fills the field**. There is no reading of
`ConstraintId[]` under which `§7`'s gate can report its own result. The
alternative — leaving the typing and having S5 report constraint ids — would make
`G5` a non-emptiness check over values describing the wrong stage, which is worse
than silent: it is a record that reads as informative and is not.

**Scope, kept minimal.** The gate is untouched: `§7`'s `I1`–`I9`, `§4.1`'s
`C1`–`C8`, `§10.1`'s five close gates and `ARCHITECTURE.md §4`'s field list all
stand exactly as frozen. **`ConstraintId` remains exactly `C1`–`C8`.** The two
vocabularies are deliberately distinct and neither is a subset of the other; this
amendment states which of them the fields were always drawing from, and supplies
the type that was missing.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold, metric definition or stopping rule
changes. `constraint_set_hash` does **not** move — `ConstraintId` is unchanged
and `constraints.decl.ts` does not carry these fields. Benchmark v1.0.3 is
unchanged and no dataset exists to regenerate.

**What it unblocks.** `ARCHITECTURE.md §4` boundary 3's `ValidatedDecision` names
these two fields among its minimum set, so the boundary type could not be
declared while their element type was undetermined. It can now.

### A.17 Spec 1.4.10 / benchmark 1.0.3 — the signal that lost its question

**The decisions.** `RECONCILIATION_SPEC.md §4.2` now states `SE1`'s comparands and
declares it **permanently inactive** for ranking; ratifies `SE3`'s scoring
function; and gates `SE4` to post-probe only. Register row M24; threat row
`PREREGISTRATION.md §10` V20. **`SE5` is deliberately untouched.**

**`SE1` had two live readings and one of them is impossible.** *Target-scoped*
compares `settlement.utr` with its `AN2`-matched `bank_ref`; *member-scoped*
compares each member's `settlement_utr` with the target settlement's `utr`. The
member-scoped reading is not merely unsupported — `settlement_utr` is read by no
normative rule anywhere — it is **arithmetically refuted by `§11`**. That worked
example states three facts: the winner is `{A,B,C}`, the deciding signal is `SE3`,
and `Δs = 400 bps`, giving `ABSTAINED`. Under the member-scoped reading its
`F08` members retain `setl_A`'s UTR — `DROP_SETTLEMENT_ID` nulls only
`settlement_id`, `PREREGISTRATION.md §4.3` saying *"sets the field to null"* in the
singular — while `{D,E}` carry another settlement's, so `SE1` alone would
contribute 3500 bps. That falsifies all three stated facts at once: `Δs` would
exceed 3500, `SE1` rather than `SE3` would decide, and `3500 ≥ ε` would yield
`DISCRIMINATED` instead of the stated `ABSTAINED`. The target-scoped reading
reproduces the example exactly, and `§22.2` M8 independently registers `SE1` in
one row with `AN2` on the same UTR justification.

**And the target-scoped reading makes `SE1` inert.** Both comparands are fixed per
target, so `SE1` takes one value across every candidate of that target and can do
neither of the two things `§4.2` says the score is for. It could rank only for a
`bank_line` target, whose candidates are sets of settlements each carrying its own
UTR — and `DATA_MODEL.md §11.1` at spec **1.4.4** gave that target the empty
candidate set. **The amendment that closed the bank-side matching problem also
inactivated the largest weight in the frozen evidence set, and `§10` V18 recorded
1.4.4's other consequences without recording this one.**

**Three repairs, and why retention was chosen.** *Retire it* — `AN5`'s striking is
precedent, but `AN5` was not an `AL3` constant and retirement would break
`PREREGISTRATION.md §7`'s stated *"summing to 10_000 bps"*. *Reallocate the 3500
bps* — `§7` does permit pre-seal adjustment, but its stated mechanism is tuning
*"on the TRAIN and DEV splits"*, which is data-driven, and no data exists; a
principled reallocation would still be a change to `AL3` constants. *Retain,
declare inactive, report* — which is what `RECONCILIATION_SPEC.md §4.1` already
does for `C8` and for `C2`'s adjustment half, requiring that *"the fraction of
candidates it excludes is reported so a reviewer can see that it is doing nothing
rather than assume it is doing something."* **The third is taken. It changes no
frozen constant, and it is a ratification, not a derivation.**

**`SE3` is four ratified choices standing on one derivation.** *Derived:* that a
mode over raw seconds is degenerate, because the spec-1.4.7 clock grid makes
`lag = n·86400 + (S − o)` with `o` drawn from a 21-hour window. *Ratified, and
none of it determined by frozen text:* binning at whole days, taking the
population as every `recon_line` in the dataset, resolving ties to the lowest bin,
and the linear kernel over `[T_min, T_max]`. Two of these are better supported
than the others — `C4` and `§4.2` express this quantity only in days, and `§4.2`
speaks of *"ASSAY's settlement-lag distribution"* as a run-level property — but
support is not entailment and the record says so.

**A consequence of the combination, disclosed rather than absorbed.** With `SE1`
inactive and `SE2`, `SE4` and `SE5` post-probe, `SE3` is the only signal
computable before a probe. Under the ratified kernel `SE3 ∈ [1/6, 1]`, so the
greatest pre-probe `Δs` is 1250 bps — **below `ε = 1500`** — and `DISCRIMINATED`
is unreachable before probing. *(Restated at spec 1.4.13: under the corrected
formula the bound is `469 bps`. `1250` remains a true upper bound and the
conclusion is unchanged; see `§A.20`.)* That follows the order `§6.2` already describes,
but it makes `P_max` load-bearing on every material case. It is an artefact of the
kernel's denominator, which is a ratified choice: `(T_max − mode)` would have made
the ceiling exactly `ε`. Recorded at V20.

**`SE4` is gated here and not defined here.** Post-probe only, scoring 0 absent a
probe, weight unchanged — all **derived** from `memo`'s quarantine, the absence of
any structural method or card-network field on `MerchantLedgerEntry`, and `AL3`
barring renormalisation. **The agreement function is a separate governance
decision and the `§4.2` row says so in its own text**, so the table does not read
as complete.

**`SE5` remains wholly unresolved, and this record exists partly to say so.** Its
row is unchanged byte for byte, its 2000 bps stands, and no probe scope, scoring
function or `probe_result` `Evidence.detail` schema is supplied. Six frozen
mentions name it, weight it, and place it post-probe; none says what it measures.
Three defensible definitions — binary consistency, fraction of probes
corroborating, and probe-ID overlap — straddle `ε` with an exact flip on a minimal
two-probe case, and that flip decides whether a component posts to the control
accounts or opens a Suspense item. Choosing among them from this text would be
invention, and it is left open.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3
is unchanged and no dataset exists. `packages/oracle` receives **no** convention
row: `PREREGISTRATION.md §5.2` gives the oracle *"no soft scoring"*, so `SE1`–`SE5`
are engine-side and their register entries belong with `packages/engine`.

### A.18 Spec 1.4.11 / benchmark 1.0.3 — the second signal with nothing to compare

**The decision.** `SE4` is declared **expected-non-binding on v1.0.0 data**,
retained with its 1000-bps weight, and its agreement function is left undefined.
Register row M25; threat row `PREREGISTRATION.md §10` V21.

**The question that was asked, and the answer that was found.** The open item
after spec 1.4.10 was `SE4`'s agreement function — partial credit between
`method` and `card_network`, and the handling of a `card_network` null on both
sides. Auditing it produced a different answer: **the function is unobservable,
because `SE4` separates no candidates at all.** Six frozen facts, none of them a
choice:

1. `memo` is quarantined and **no `§6.2` probe returns it**. The closed enum
   holds `fetch_order`, `fetch_payment`, `fetch_refund`,
   `fetch_settlement_recon` and `widen_temporal_window` — no ledger-entry probe.
   `DATA_MODEL.md §3` gives `receipt` an explicit sentence making it *"reachable
   only through the `fetch_order` probe"*; **`memo` has no counterpart anywhere.**
2. `MerchantLedgerEntry` (`§8`) carries no structural method or card-network
   field.
3. `fetch_payment` supplies `method` — which `§10`'s `payment` observation
   **already carries structurally**, so the probe adds nothing.
4. `card_network` has **no Payment-side field**. Spec 1.1.1 corrected the card
   attributes onto `ReconLine` *"when they are settlement-recon columns"*, so the
   card half of `SE4` has no comparand on the probed entity.
5. No **exercised** `§4.3` operator perturbs `method` or `card_network`;
   `DROP_FIELD` could and is declared not exercised.
6. `PREREGISTRATION.md §4.2`'s `F06` construction draws *"identical method —
   ONCE from the frozen mix"* and uses it for **both** members of a collision
   pair. The family that manufactures equal-credit ambiguity gives `SE4` nothing
   to separate exactly where separation would be needed.

**Derived, then, is that `SE4` takes one value across every candidate of a
target.** Ratified is only the disposition: retain the row and its weight, report
that it does nothing, and leave the function undefined. That is
`RECONCILIATION_SPEC.md §4.1`'s treatment of `C8` applied unchanged — *"retained
as a declared admissibility filter, and the fraction of candidates it excludes is
reported so a reviewer can see that it is doing nothing rather than assume it is
doing something."*

**What was deliberately not done.** The agreement function is **not** invented:
partial-credit and null-handling rules would be unexercisable on any conforming
dataset, and ratifying an unexercisable rule is worse than leaving the gap
visible. `§6.2`'s probe enum is **not** opened: a `fetch_ledger_entry` probe would
make `SE4` genuinely discriminating, and it was considered and rejected here
rather than silently omitted — it would open an enum `§6.2` calls closed, spend
`P_max` budget, and route a merchant-controlled surface (`THREAT_MODEL.md §T1`'s
injection register) into the evidence path. The 1000 bps is **not** reallocated,
`AL3` freezing it and `§7`'s *"summing to 10_000 bps"* holding.

**Two signals now, and the pattern is worth naming.** `§A.17` found `SE1`
inactive because spec 1.4.4 removed the matching problem it was sized for; this
record finds `SE4` non-binding because its comparand was never reachable. Both
were retained rather than repaired, both on the `C8` precedent, and both are
reported. The evidence budget that is **live and defined** is now `SE2` + `SE3` =
3500 of 10000 bps, with `SE5`'s 2000 still undefined — a fact a reader of `§4.2`'s
weight table would otherwise have to reconstruct.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold or **metric definition** changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3
is unchanged and no dataset exists. `packages/oracle` receives no convention row:
`PREREGISTRATION.md §5.2` gives the oracle *"no soft scoring"*.

### A.19 Spec 1.4.12 / benchmark 1.0.3 — a schema for one kind, and nine left alone

**The decision.** `DATA_MODEL.md §12`'s `Evidence.detail` gains a schema for
`kind: "probe_result"` — a five-variant discriminated union on `probe`, matching
`RECONCILIATION_SPEC.md §6.2`'s closed enum. Register row M26. **`SE5` is not
defined here**, and the `Evidence` entity is not implemented.

**Why this could be settled while `SE5` could not.** `§12` promises *"schema per
kind"* and supplies none, so `SE5` has no input record to read and could not be
implemented even if its function were chosen. The two are separable: `SE2`,
`C2`/`E10` and `C4` need their variants regardless of what `SE5` turns out to
mean, so the schema is worth having on its own and prejudges nothing.

**Every field is required by a named frozen consumer.** `receipt` by `SE2`;
`method` by `SE4`; the result `payment_id` by `C2`'s referential half and `E10`;
`constituent_entity_ids` by `SE5`; `days` by `C4`. The **argument** ids are
required by `I6` through `§L.1` rule 8 — *"Every **LLM-referenced** entity ID must
exist in the observation set (invariant `I6`), independently of any allowlist
check"* — because `R3` proposes the probe, so its argument **is** an
LLM-referenced entity id, and `Evidence.obs_ids` carries **observation** ids
rather than entity ids, leaving the referenced id otherwise unrecoverable from
the record.

**`date` is omitted, and that is the ratified half.** `§6.2` names it as a probe
**argument**, and no frozen rule reads it back out of `detail`; every
*"date-scoped"* statement in the corpus describes the recon **report** or the
endpoint. `§22.1` D11 documents that endpoint as `year` + `month` with an optional
`day` — the shape of a **query** — and no document states an ASSAY representation
for it as a value, so the three candidate encodings (`UnixSeconds`, D11's triple,
an ISO string) each carry a different semantic and none is derivable. The `PROBE`
`LedgerEvent` already logs the call through `subject_ids` and `inputs_hash`,
*"hash of everything the step read"*. **Carrying `date` would have meant inventing
a date type for a field nothing consumes**, which is the trade this project has
refused elsewhere. The omission is enforced rather than intended: the variants are
strict objects, and a test asserts that a `date` key fails to parse.

**Two disclosures rather than repairs.** `THREAT_MODEL.md §T7` promises that
`widen_temporal_window` *"has a hard bound and its use is recorded on the
decision"*, and **no document states the number**; the schema types `days` as a
positive integer and asserts no ceiling, because inventing one would create a
frozen constant, and a test records the deliberate absence. And `Evidence` remains
unimplemented: its other nine kinds have no identified consumers and no stated
fields, so declaring the entity would force nine invented schemas — the invention
`§12`'s silence should not be repaired with.

**No `card_network` field exists on any variant**, and a test enforces its
rejection. Spec 1.1.1 corrected the card attributes onto `ReconLine` *"when they
are settlement-recon columns"*, so `PaymentSchema` carries none and a probe cannot
return one — the same fact that made `SE4` expected-non-binding at `§A.18`.

**Still open, and deliberately.** `SE5`'s scope, its scoring function, its
multi-probe and member aggregation, and whether one probe result may feed two
signals. Three candidate functions straddle `ε` with proven crossings, and none is
preferred by frozen text. `SE1`, `SE3` and `SE4` are untouched.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3
is unchanged and no dataset exists. This is additive domain typing: no existing
type, schema or runtime behaviour is altered.

### A.20 Spec 1.4.13 / benchmark 1.0.3 — a formula that could not be evaluated

**The decision.** `RECONCILIATION_SPEC.md §4.2`'s `SE3` row is restated in
dimensionally coherent form, and the two properties spec 1.4.10 left unstated —
the denominator and member aggregation — are ratified. Register row M27; `§10`
V20's figure restated from `1250` to `469 bps`.

**The error.** Spec 1.4.10 defined `lag` in **elapsed seconds**, defined the modal
lag in **whole days**, and then wrote `|lag − mode|`. The terms had no common
unit. On a real member — a `T+2` batch captured at 09:00, `lag = 216,000 s`,
`mode = 2`:

```
  denominator read as days      1 − |216000 − 2| / 6       -> clamped to 0
  denominator read as seconds   1 − |216000 − 2| / 518400  -> 0.5833
  dimensionally coherent        1 − |2.5 − 2|    / 6       -> 0.9167
```

Under the first reading **every member would have scored 0**, making `SE3`
silently inert and leaving no live pre-probe signal at all; under the second it is
systematically wrong. This is a defect in text this project committed, not a
governance choice, and it had to be fixed whichever denominator was adopted.

**Two properties were also missing, and the earlier audit did not catch them.**
`§4.2`'s row scored *a* lag, but a candidate holds many members with different
lags — `settled_at` is the instant of `capture-day + cycle`, so capture-day 5 at
`T+3`, capture-day 6 at `T+2` and capture-day 7 at `T+1` all settle on day 8 and
sit in one co-settlement class. **Member aggregation was undefined**, and so was
whether the numerator's `lag` is the raw quotient or its day bin. Both change the
selected allocation.

**Derived, and recorded as such.** The lag term itself (`C4`; `O-C4-UNIT`). That
the **mode** requires binning — the spec-1.4.7 grid makes a seconds-granular mode
degenerate. That the **numerator stays continuous**: that binning rationale is
scoped to the mode and does not reach the `lag` term, which `C4` defines as the
raw difference. That days and seconds yield an identical ratio, the `86400`
cancelling. That a **candidate-scoped** modal population is excluded, because each
candidate would supply its own mode and score itself ≈ 1.0, making `SE3` constant
across candidates and unable to rank. And that a **raw sum** over members is
excluded, two members alone reaching 1.686 and breaking `§4.2`'s
`evidence_score_bps ∈ [0, 10_000]`; the normalised sum is the arithmetic mean.

**Ratified, and frozen text determines none of it.** The whole-day bin
granularity, the run-level modal population, the lowest-bin tie rule, the linear
clamped kernel, the **`T_max − T_min` denominator** and the **arithmetic-mean**
member aggregation.

**Why the denominator, on the record.** `T_max − T_min` is expressible in `C4`'s
two frozen constants alone. `T_max − mode` mixes a frozen constant with a
data-derived statistic and is **zero when the mode reaches `T_max`** —
well-defined here only because `§4.2`'s frozen cycle holds the mode at 2, which is
exactly the population-accident safety spec 1.4.7 was issued to remove. **An
earlier draft argued this from cross-run comparability under
`EVALUATION_SPEC.md §5.3`'s batch sweep; that argument is withdrawn**, because
`§5.3` states the sweep *"measures metrics 21 and 22 only"* and produces no
close-loop metric, so it does not bear on the choice. `T_max − mode`'s one real
advantage — reaching 0 — is unused: neither denominator's floor is approached on
conforming data, `SE3` bottoming at `0.6875` and `0.6250` respectively.

**Why the mean, on the record, and it is the weaker of the two.** *"Proximity"* of
a set reads as a central tendency rather than an extremum. `min` and `max` are
extremum readings, and on a two-member example `max` selects the **opposite**
candidate from `mean`, `median` and `min` alike; on a three-member example
`median` and `mean` also diverge. The ground is linguistic, and this record says
so rather than dressing it as a derivation.

**What the corrected mathematics changes.** `§4.2`'s frozen cycle admits only
`T+1`–`T+3` and the 1.4.7 grid puts `lag_days ∈ (n, n + 0.875]`, so the modal bin
is `2` and the largest attainable `|lag_days − mode_days|` is **1.875 days**.
Hence `SE3 ∈ [0.6875, 1)` and the greatest pre-probe `Δs` is **469 bps**, about a
third of `ε = 1500`. `§A.17` published `1250 bps`, computed from `C4`'s full
`[1, 7]`-day domain under the formula corrected here. **`1250` remains a true
upper bound and nothing published under it is falsified** — the conclusion, that
`DISCRIMINATED` is unreachable before probing, is unchanged and now holds by a
wider margin. Had the numerator been binned instead, `T+1` and `T+3` would have
scored **identically**, both sitting one bin from the mode, and `SE3` could not
have distinguished an early settlement from a late one.

**Nothing observable moves.** `SE3`'s 1500 bps, `T_min`, `T_max` and the kernel's
shape are unchanged, and no weight is renormalised. `SE1`, `SE2`, `SE4` and `SE5`
are untouched. No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3
is unchanged and no dataset exists.

### A.21 Spec 1.4.14 / benchmark 1.0.3 — two namespaces that never met

**The decision.** `DATA_MODEL.md §12` states the relation between a
probe-returned `constituent_entity_id` and a `Candidate.member_obs_id`. Register
row M28. **`SE5` is not defined here and its status is unchanged.**

**Why it was needed before any `SE5` definition.** Every candidate `SE5` function
compares the ids `fetch_settlement_recon` returns against a candidate's members.
Those are **different namespaces**: `§6` gives `entity_id` as
`pay_… | rfnd_… | adj_…`, and `§11` types `member_obs_ids` as `ObservationId`
(`obs_…`). A direct intersection is **always empty**, so every proposed `SE5`
function — binary consistency, fraction, overlap in either normalisation — was
resting on a comparison that cannot be performed as written. The relation had to
be stated before the function could be argued about at all.

**Everything here is derived; nothing is ratified.** The grammars are already
frozen. The relation is **one-to-one** on a conforming dataset because
`PREREGISTRATION.md §4.3`'s operator table carries exactly one duplication
operator, `DUPLICATE_ROW`, scoped to *"share of `bank_line`"*, with `§4.1`
crediting `F04` with *"`round_half_up(0.10 × B)` = 3 extra **`bank_line`** rows"*
— no operator emits a `recon_line` twice. And it is **partial** because `§4.2`'s
`F05` *"withholds one constituent `recon_line` at emission"* while
`fetch_settlement_recon` queries the PG's own recon report (`§22.1` D10) rather
than the observation set, so a returned id can have no observation at all.

**What this record deliberately does not do, stated so the next cycle is not
prejudged.** It does **not** decide whether an unobserved constituent counts in an
`SE5` denominator; whether `SE5` normalises by the returned set, by the
candidate's members, or by their union; whether `SE5` reads
`fetch_settlement_recon` exclusively; how multiple probes combine; or whether one
probe result may feed two signals. Each of those is outcome-bearing — the audit
that produced this amendment reproduced three separate reversals, two crossing
`ε = 1500` exactly — and none is preferred by frozen text. `§12` therefore says
only that a comparing rule **must** state its treatment of an unmatched id, and
leaves the treatment to the rule.

**Nothing observable moves.** `SE5`'s 2000-bps weight and unresolved status stand;
`SE1`, `SE2`, `SE3` and `SE4` are untouched; no population parameter, seed, split,
family, `target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3
is unchanged and no dataset exists. No schema field is added or altered — the
`ProbeResultDetail` union of spec 1.4.12 stands exactly as committed.

### A.22 Spec 1.4.15 / benchmark 1.0.3 — the one probe nobody had claimed

**The decision.** `SE5`'s **scope** is `fetch_settlement_recon` results only.
Register row M29. **Its scoring function is not defined here**, and neither is
the `F05` treatment it turns out to be coupled to.

**The elimination, and its limit.** `RECONCILIATION_SPEC.md §6.2` declares five
probes and names a consumer for four — `fetch_order` to `SE2`, `fetch_payment` to
`SE4`, `fetch_refund` to `C2`'s referential half and `E10`, and
`widen_temporal_window` to `C4`. `SE5` is the one signal with no named input and
`fetch_settlement_recon` the one probe with no named consumer. **That is
elimination, not entailment**, and the record marks the decision **ratified**:
`§4.2`'s own wording — *"Probe **result** corroboration"* — and `DATA_MODEL.md
§12`'s generic `kind: "probe_result"` both point at a broader scope.

**One part of it is genuinely derived: the generic scope is excluded.** A generic
`SE5` would take `widen_temporal_window` as an input. That probe returns no
evidence about the world; it changes `C4`'s bound. Scoring it would let a
relaxation **raise** the evidence score of the candidates the relaxation
admitted, which is precisely the *"quiet constraint relaxation to manufacture a
match"* that `THREAT_MODEL.md §T7` lists among the attacks its controls prevent.
`§12`'s own split — *"hard = a filter, soft = a score contribution"* — puts a rule
change on the hard side, so scoring it as soft evidence miscategorises it. **An
earlier draft of this reasoning said `days` had no candidate-relative content;
that was wrong** — `days` together with a candidate's own lags does yield a
candidate-relative predicate — and the exclusion rests on `§T7` instead.

**A named subset is left open rather than closed.** Adding `fetch_order` or
`fetch_payment` would give `SE5` more to work with, and **no clause in this
specification forbids one probe result from feeding two signals**; the arithmetic
permits it, each signal being capped at its own weight with the five totalling
10,000. It would require a double-counting policy this specification does not
state, so it is unavailable now — **not wrong**.

**Why the function could not follow in the same amendment.** The audit compared
binary consistency, recall, precision and Jaccard, and found the choice coupled to
a question this cycle was asked to leave open. The two substantively sound
measures — recall and Jaccard — divide by something ranging over the **returned**
set, so neither can be adopted without also deciding whether an `F05`-withheld
constituent counts there. The two that avoid `F05` score degenerately on
constructed examples: binary awards the full 2000 bps for matching **one of
three** authoritative constituents, and precision scores a candidate holding
**one of six** constituents at 1.000, because it cannot see what the candidate is
missing. **Choosing a function to dodge the coupling would have been choosing a
worse rule for a procedural reason**, and choosing recall or Jaccard would have
settled `F05` by implication. Both were refused.

**Two ε-crossings stand behind that refusal**, reproduced at spec 1.4.14
semantics: binary versus recall separates 2000 bps from 667 across `ε = 1500`,
and recall versus precision separates 1667 from 1000. Each flips `DISCRIMINATED`
to `AMBIGUOUS`, and with it whether a component posts to the control accounts or
opens a Suspense item.

**Nothing observable moves.** `SE5`'s 2000-bps weight stands; `SE1`, `SE2`, `SE3`
and `SE4` are untouched; the `ProbeResultDetail` union of spec 1.4.12 and the
identifier relation of spec 1.4.14 are unchanged. No population parameter, seed,
split, family, `target_record_count`, rate, threshold or metric definition
changes; `constraint_set_hash` does not move, `C1`–`C8` being untouched;
benchmark v1.0.3 is unchanged and no dataset exists.

### A.23 Spec 1.4.16 / benchmark 1.0.3 — the coupled decision, taken together

**The decision.** `SE5 = |R* ∩ M| / |R* ∪ M|`; a returned constituent id with no
observation is excluded from `R*` entirely; an empty result scores 0. Register row
M30. Spec 1.4.15 established these were **one coupled decision rather than
three**, and this record closes all of it or none.

**Three parts are derived.** The `F05` treatment, from `PREREGISTRATION.md §5.3`,
which resolved the identical fact pattern for the completeness gate and held that
a gate failing on an inexpressible member *"would report a constraint fault where
none exists"*. Symmetry, from `C6`'s zero tolerance and `I4`'s equality. The empty
result, from `DATA_MODEL.md §12`'s *"a result rather than an error"* against
`AL3`'s frozen weights.

**One part is ratified, and is marked as such.** Derivation fixes that both
directions of disagreement count; it does not pick Jaccard over `F1`. Frozen text
names no symmetric measure, and the adoption rests on `RECONCILIATION_SPEC.md
§4.2`'s own precedent of naming Jaro–Winkler for `SE2` rather than deriving a
metric.

**The asymmetric measures fail on ties, not on taste.** Each returns an identical
score for an allocation the authoritative report confirms and one it contradicts —
binary for `{a,g}` against all six of `{a…f}`, recall for the exact set against a
superset, precision for `{a}` against `{a,b,c}`. `§4.2` gives the score two uses,
ordering candidates and the ε-gap, and a tie serves neither.

**`SE5` avoids the failure mode that inactivated `SE1`.** `SE1` was declared
permanently inactive at spec 1.4.10 because **both** its comparands are
target-scoped, so it takes one value across every candidate of a target and can
neither order candidates nor move the ε-gap. `SE5`'s `R*` is target-scoped but its
`M` is candidate-scoped, so the quotient varies across a target's candidates and
the signal ranks. With `SE1` inactive and `SE4` expected-non-binding on v1.0.0
data, the evidence budget that is both live and defined rises from `SE2` + `SE3` =
3500 bps to `SE2` + `SE3` + `SE5` = **5500** of 10,000.

**What is still open, and stated rather than left to inference.** Multi-probe
aggregation under `P_max = 3`. `§6.2`'s *"deterministic code"* makes repeated
identical calls idempotent, so the open case is narrow — combining results from
different arguments — but it is genuinely unspecified and no rule is implied here.
`SE4`'s agreement function is untouched, and the spec-1.4.15 double-counting
question stays dormant while the scope names one probe no other signal consumes.

**Nothing observable moves.** `SE5`'s 2000-bps weight stands; `SE1`–`SE4` are
untouched; the `ProbeResultDetail` union of spec 1.4.12 is **sufficient as
committed** and no schema field is added or altered; the identifier relation of
spec 1.4.14 is unchanged. No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3 is
unchanged and no dataset exists.

### A.24 Spec 1.4.17 / benchmark 1.0.3 — what a second probe is for

**The decision.** Where several `fetch_settlement_recon` results carry one
`settlement_id`, `R` is the **union** of their `constituent_entity_ids` — date
argument and probe order both irrelevant. Register row M31. **Derived; this is the
first `SE5` cycle with no ratified component.**

**The question was whether a second probe gathers more evidence or retries the same
evidence.** `RECONCILIATION_SPEC.md §6.2` answers it structurally: the loop is
*"deterministic code executes it and **re-runs the solve**"*, `P_max = 3` is a budget
**per component**, and `DATA_MODEL.md §13`'s certificate carries `probes_attempted` as
a **list**. `§11`'s worked case spends three probes, weighs them together and records
all three. A second probe **gathers**; nothing in this specification retires what the
first returned.

**Union is not a preference — every alternative falsifies a sentence frozen one
version ago.** `§4.2` says *"`SE5 = 1` iff `R*` and `M` are equal and non-empty"*.
Against a six-constituent settlement reported through three windows, a candidate
**equal to the true constituent set** scores `1.000` under union, `0.000` under
intersection and `0.333` under latest, first and every per-probe aggregate. Under
*latest* the clause instead certifies the one-window candidate at `1.000` — the
specification would declare a wrong allocation perfect. That is the defect the `F05`
exclusion was derived from at 1.4.16, reappearing.

**Three independent confirmations.** Latest and first swing `667` bps over the six
orderings of three windows, on an input `ProbeResultDetail` deliberately does not
carry. Intersection and latest let a probe that returns nothing **erase** an earlier
probe's evidence, against `§6.2`'s *"abstentions resolved per probe spent"* and
`ARCHITECTURE.md §R3`'s expressly contemplated *"wasted probe budget"*. Summing
results as separate evidence yields `6000` bps for a signal frozen at `2000` and makes
three identical probes score triple one — `AL3` bars the renormalisation that would
hide it.

**What the rule deliberately does not need.** The recon endpoint's **date-scoping
field is unnamed anywhere in this corpus**, and it stays that way. Under a
`settled_at` reading a settlement's lines share one bucket and a query is
all-or-nothing; under a `created_at` reading the optional `day` splits capture-days
into disjoint partials. **Union is correct under both**, which is the property that
let this be settled without settling that. `R3`'s probe-selection policy is likewise
untouched.

**`DATA_MODEL.md §12`'s live disposition table now reads `settled at spec 1.4.17
(M31)`.** The paragraph recording what 1.4.12 and 1.4.14 left open is preserved
byte-identical — history is not rewritten; only the table that tracks current
disposition moves, which is what it exists for.

**Nothing observable moves.** `SE5`'s 2000-bps weight, scope, scoring function, `F05`
treatment and empty-result zero all stand exactly as frozen at 1.4.16; `SE1`–`SE4` are
untouched; `ProbeResultDetail` and the 1.4.14 identifier relation are unchanged and
**no schema field is added**; `P_max = 3` is unchanged. No population parameter, seed,
split, family, `target_record_count`, rate, threshold or metric definition changes;
`constraint_set_hash` does not move, `C1`–`C8` being untouched; benchmark v1.0.3 is
unchanged and no dataset exists.

---

## B. Locked project definition

> **ASSAY is a settlement reconciliation controller for Razorpay-shaped payment
> data. It consumes Razorpay's settlement recon report as its authoritative
> anchor input and reconciles it against two views the gateway does not hold —
> the merchant's bank statement and the merchant's own ledger — across a
> synthetic batch of 10,000+ records. Every accepted allocation must pass nine
> deterministic invariants before it posts as balanced double-entry journal lines
> into a hash-chained shadow ledger. Where the evidence admits more than one
> materially different allocation, ASSAY abstains and attaches the alternative it
> could not rule out. The period closes only if the books balance and Suspense
> reconciles exactly; otherwise it stays open with the unresolved rupees
> quantified. Its abstention policy is validated against an ambiguity oracle
> independent of both the data generator and the reconciliation engine, on a
> pre-registered sealed benchmark, and it runs end to end with no language model
> at all.**

Scope is frozen. The three hardest non-goals to hold: no chat box on the main
path, no FX, and no claim that Razorpay's reconciliation has a gap.

---

## C. Tier-0 scope — binding, complete by 31 August

**Every item is required.** If Tier-0 is not demoable by 31 August, cut from §H,
never from here. A working Tier-0 beats a half-built Tier-1 by a wide margin.

| # | Component | Acceptance test |
|---|---|---|
| T0-1 | `packages/money` — branded `Paise`, integer-only | Property test: conservation under split/allocate over 10k random cases; float usage is a compile error |
| T0-2 | `packages/domain` — zod schemas, Razorpay-faithful fee/GST, ID grammars, **`constraints.decl.ts`** | Ingest invariants reject malformed records; `credit = amount − fee` holds on every generated line, with `fee` GST-inclusive and `tax = 18% × (fee − tax)` (`DATA_MODEL.md §6`) |
| T0-3 | `packages/generator` — forward simulation, families **F01–F10**, seeded | Same seed → byte-identical output; ground truth is a construction byproduct with no `is_ambiguous` field. All four held-out families (`F07`–`F10`) are authored in Tier-0 and held out at family level until the seal (`PREREGISTRATION.md §6.1`) |
| T0-4 | `packages/engine` S0–S3 — quarantine, anchors, candidates under C1–C8, component decomposition | Component-size distribution printed; `intractable_rate` measured on dev |
| T0-5 | `packages/engine` S4–S5 — exact solve, **no-good cut, second-best certificate**, materiality test, invariants I1–I9 | The ₹1,00,000 worked example (`RECONCILIATION_SPEC.md §11`) abstains with a correct certificate |
| T0-6 | `packages/ledger` — Layer A hash chain + Layer B double-entry projection + **close gate G1–G5** | `assay verify` passes; trial balance zero; Suspense identity exact; the close gate emits `CLOSED`, `OPEN` and `BLOCKED` correctly for constructed inputs on each side of the threshold. Whether both `CLOSED` and `OPEN` occur on the DEV seeds is assumption `§F` F9's falsification check — reported as a finding, and **never** grounds for adjusting the close policy (`§L.4`) |
| T0-7 | `packages/llm` — **`LlmProvider` interface + `offline` + `replay` providers**; roles R1, R2; schema/allowlist/grounding verification | **Full pipeline passes with `--llm=offline`, no network.** Hallucinated IDs rejected and counted. `--llm=replay` reproduces byte-identically |
| T0-8 | `packages/oracle` — exhaustive enumeration + **completeness gate + consistency gate** | Both gates pass on dev; 20,000-pair differential test agrees with the engine constraint-by-constraint |
| T0-9 | `packages/eval` — coverage, balance harm, net cost, abstention precision/recall, close-loop metrics, 5 seeds, bootstrap CIs | `metrics.json` per (agent × seed × llm-mode) |
| T0-10 | Baselines `B0-IDONLY`; ablations `A1-NOVALIDATE`, `A2-NOABSTAIN`, `A3-NOLLM`. **`B2-LLM-DIRECT` conditional on F2** — it needs a live credential to populate its replay cache. | All run behind one agent interface; `A3` is literally `ASSAY --llm=offline`. If F2 is unresolved, `B2` defers to tier H2 and the report names which baselines ran and why. The ablations alone are sufficient for the central claim. |
| T0-11 | `apps/cli` — `generate · oracle · run · bench · close · verify · seal` | Full pipeline runs from a clean checkout with no API key |
| T0-12 | `apps/web` + `apps/api` — close report, exception queue (value-ranked), **certificate drill-down**, `/ledger/verify` | The certificate view renders solution A vs B with shared constraints and ₹ materiality |
| T0-13 | Static benchmark report with the risk–coverage figure and the `offline` / `replay` two-column table | Every number traceable to a committed run artifact |

**T0-5's second-best certificate and T0-12's certificate view are the project.**
T0-7's offline provider is the demo insurance policy. If schedule pressure forces
a choice, cut anything else first.

---

## D. Architecture changes in this revision

1. **`LlmProvider` interface** (`ARCHITECTURE.md §6.5`) — four implementations
   (`offline`, `replay`, `anthropic`, `openai-compatible`) behind one `invoke()`
   entry point. Roles R1–R4 have no knowledge of which is behind it. No vendor is
   load-bearing; `meteredCost` providers are refused in CI so no test can spend.
2. **Two-layer shadow ledger** (`ARCHITECTURE.md §8`) — Layer A append-only
   hash-chained audit events; Layer B a pure double-entry projection over them.
   They fail differently (tampering vs incoherence) and so are checked
   differently. Balances are never authoritative cached state.
3. **Close gate G1–G5 with three outcomes** — `CLOSED` / `OPEN` (business state,
   quantified) / `BLOCKED` (defect, no report emitted). Added to the API as
   `POST /runs/:id/close`, which returns per-gate results rather than a boolean,
   because "why won't it close" is the question an analyst actually asks.
4. **Declarative constraint table** (`packages/domain/src/constraints.decl.ts`) —
   constraints as data, implemented twice: fused filters in the engine, naive
   per-candidate checks in the oracle. This is what makes oracle independence a
   checked property rather than a claim.
5. **Consistency gate** — a 20,000-pair differential test between engine and
   oracle admissibility, failing the build on any disagreement.
6. **`AbstentionTelemetry`** (`DATA_MODEL.md §21`) and
   `GET /runs/:id/abstention-telemetry` — makes the DoS surface measurable.
7. **Provider provenance everywhere** — `LlmCall.provider` and
   `LedgerEvent.actor.llm_provider` are recorded on every call and every event,
   including offline ones, so a report can always state what produced a decision.
8. **Value-ranked exception queue** as an architectural guarantee (M1), not a UI
   preference: the largest-value exception must always appear in the top 20.

---

## E. Benchmark changes in this revision

1. **Ambiguity ground truth is oracle-derived, twice-gated.** Completeness
   (truth ∈ oracle solutions) catches a constraint set that is too strict;
   consistency (engine ≡ oracle) catches implementation divergence. Neither alone
   suffices.
2. **Abstention is priced.** `C_review` = ₹250, `C_exception` = ₹500, both frozen,
   both swept at ₹100/₹250/₹1,000. `net_cost_inr` is now the single comparable
   figure, so abstain-on-everything is no longer optimal.
3. **Harm is balance delta, not face value**, with `misdirected_value_inr` as a
   separate second measure. Suspense excluded to avoid double-charging correct
   abstentions.
4. **Four close-loop metrics added** (11–14): `period_status_distribution`,
   `unresolved_value_inr`, `suspense_identity_exact`, `close_gate_failures`.
   `BLOCKED` must be zero across all runs; at least one legitimate `OPEN` is
   required by success criterion S12, because a close gate that has never refused
   to close is untested.
5. **Six DoS metrics added** (15–20), including `abstention_spike_flag`
   (expected to fire on F10, not on clean splits) and
   `largest_exception_in_top_n` (must be true on every run).
6. **`offline_parity` (metric 24)** — every primary metric published in two
   columns, `--llm=offline` and `--llm=replay`, with deltas and CI overlap. This
   is the pre-registered form of the AI-necessity claim: measured, not asserted,
   including the outcome where the model contributed nothing measurable.
7. **All scored runs use `--llm=replay --strict-replay`**, where a cache miss is
   a hard error rather than a silent live call.
8. **Close policy frozen**: auto-close iff unresolved ≤ 0.5% of `batch_value_paise`
   (`RECONCILIATION_SPEC.md §10.3`). A single scale-invariant bound, so that
   `period_status` means the same thing at every batch size in the mandated
   1k / 10k / 100k sweep. Spec 1.1.1 also carried an absolute ₹50,000 bound under
   a `min()`; it was deleted before the seal in benchmark v1.0.1 because S1 forces
   every conforming run above the ₹1 crore crossover, which made the ratio inert
   and made effective strictness vary 40× across the sweep.
9. **Threats V9–V11 added** to the declared threats-to-validity table: vendor
   dependence, untested close gate, and DoS mitigations that are partly
   instrumentation rather than defence.

---

## F. Unresolved assumptions

Two are blocking. The rest are cheap to check and should be closed on day 1.

| # | Assumption | Status | How to verify | If false |
|---|---|---|---|---|
| **F1** | Tier-0 freeze 31 Aug, submission 5 Sep | **Given by the user; not independently verified** | Buildathon portal | If the submission date is earlier than 5 Sep, the seal moves earlier and §H is dropped entirely. If later, promote H1 items into Tier-0. |
| **F2** | A metered API credential is available for the `anthropic` or `openai-compatible` provider | **Unresolved. Blocks the R1/R2 live path and `B2-LLM-DIRECT`; blocks nothing else.** | One live call | Ship with `--llm=offline` + `replay` only. **Tier-0 remains deliverable**: the offline provider is required regardless, every acceptance test must pass without a key, and the ablations A1–A3 carry the central claim on their own. Two consequences to state in the report: the LLM layer is specified and interface-complete but unexercised live, and `B2-LLM-DIRECT` was not built (deferred to H2), so the "beats the naive LLM build" claim (S7) is **not made**. |
| F3 | Submission format is repo + demo video | Unverified | Buildathon rules | A required live deployment breaks the local-first assumption and costs a day |
| F4 | Solo build | Unverified | — | A second person takes T0-12 in parallel, freeing a day |
| F5 | Razorpay test-mode settlements stay empty | Verified 2026-08-23 (`count: 0`) | Re-check before the demo | If records appear, use for calibration only, never as benchmark data; update the disclosure |
| ~~F6~~ | Fee rates in `PREREGISTRATION.md §4.2` are plausible | **CLOSED 2026-08-23.** Verified against Razorpay's published pricing. Card and wallet at 200 bps confirmed; **UPI corrected 0 → 200** (zero MDR is not zero fee — the pricing page states a 2% platform fee still applies) and **netbanking corrected 190 → 200** (no source states 1.9%). EMI 300 bps retained on a weaker source tier (official blog), labelled as such. | — | Adjusted before the seal, as required |
| ~~F7~~ | GST on gateway fees is 18% | **CLOSED 2026-08-23.** Confirmed: the recon endpoint documents `tax` as *"the tax on the fee"*, the pricing page states *"2% + 18% GST"*, and the documented Payment sample (`amount 2100, fee 50, tax 8`) is arithmetically consistent with 18% on a 2% fee. Constant unchanged at 1800 bps. **The related identity was not unaffected** — see §A.4 item 1. | — | — |
| F8 | `K_max = 22` keeps `intractable_rate` low | Unverified until day 3 | Measure component-size distribution on dev | Raise `K_max` **before the seal only** |
| F9 | The corrected close policy (0.5% of `batch_value_paise`, no absolute bound) produces both `CLOSED` and `OPEN` outcomes across seeds | **Structural defect in the v1.0.0 policy found and corrected pre-seal** (benchmark v1.0.1, `§A.5` N1). The corrected policy is unverified against data. | Dev run on day 6, as a **falsification check with a pre-declared response** | **The threshold may NOT be adjusted in response to what the check shows.** If both outcomes occur, F9 closes. If they do not — all families close, or none does — that is **reported as a finding** in the threats-to-validity section and the run proceeds to the seal unchanged. Any further change to `max_unresolved_ratio_bps` requires a formally opened governance/amendment cycle, a new benchmark version, and a written statement of what was observed before the change was proposed. |
| F10 | Judges value measurement discipline over feature count | Inferred from track bar language | — | Strongly implied by "honest metrics" and "one cherry-picked match proves nothing" |

---

## G. Remaining reasons a Razorpay engineer could reject this

Stated without mitigation claims, because these are the ones that survive the
current design.

1. **"Your constraint set is the whole thing, and you wrote it."** The engine and
   the oracle are two implementations of one declaration. If `C1`–`C8`
   misrepresent real settlement behaviour — a wrong T+n window, a fee identity
   that does not hold for some method — both are wrong together and the
   differential test will never reveal it. This is declared as threat V1 and is
   the single strongest objection available. **Not fully answerable within a
   synthetic benchmark.**
2. **"Synthetic data means the result doesn't transfer."** Correct, and conceded
   in `PREREGISTRATION.md §2` and §10 (V2). No external validity is claimed. A
   reviewer who weights production realism above methodology will not be
   persuaded by rigour.
3. **"Abstention is a way of not being scored."** Partly answered by pricing
   abstention and by the oracle-derived precision/recall, but a reviewer may
   still consider any abstention rate above a few percent commercially
   unacceptable regardless of how well-justified each one is.
4. **"Three-way reconciliation with a synthetic bank statement isn't really
   three-way."** The bank statement and merchant ledger are the two sources that
   make the problem interesting, and both are entirely invented. Their realism is
   the weakest link in the data model, and there is no way to validate it without
   a real merchant's data.
5. **"You may have solved a problem that the recon report plus a spreadsheet
   already handles."** `B0-IDONLY` exists precisely to measure this, and it may
   score well on clean families. If B0's coverage is high and its harm is near
   zero on realistic degradation levels, the honest conclusion is that the
   marginal value of ASSAY is confined to degraded-evidence cases — and the
   report must say so.
6. **"The LLM turned out to be decoration."** `offline_parity` may show
   negligible deltas. This is a pre-committed possible outcome, but it weakens
   the "meaningful AI use" story that some rubrics weight.
7. **"Sub-threshold flooding defeats your DoS mitigations."** Conceded in
   `THREAT_MODEL.md §T9`: an attacker who stays below 3σ and spreads across
   sources evades M2 and M3. Rate-limiting per source is future work.
8. **"Self-enforced pre-registration proves ordering, not integrity."** Conceded
   in `PREREGISTRATION.md §1`. A determined author could break every rule and
   re-commit.

Items 1, 2 and 4 are structural limits of a solo synthetic project, not defects
to be fixed. The correct response is to state them first, in our own words,
before a reviewer does.

---

## H. Stretch goals — optional, ordered, only after Tier-0 works end to end

| Tier | Item | Value |
|---|---|---|
| H1 | LLM role R3 (probe planning) + `abstentions resolved per probe` | Strongest genuine-AI-necessity evidence |
| H1 | Calibration: reliability diagram + ECE | Justifies the ε threshold |
| H2 | LLM role R4 (grounded explanations) with numeral verification | Demo polish with a real control attached |
| H2 | `anthropic` and `openai-compatible` providers exercised live | Completes the provider matrix; needs F2 resolved |
| H2 | τ and `C_review` sensitivity sweeps | Pre-empts "you tuned the threshold" |
| H2 | Baseline `B1-GREEDY` | Third reference point |
| H2 | 100k-record deterministic throughput run | Answers the scale question |
| H3 | Analyst resolution workflow feeding back into close | Closes the human half of the loop |
| H3 | Family `F11` (FX) | **Do not attempt.** Separate truth model. |
| H3 | Family `F12` (settlement split across two bank credits) | **Do not attempt.** Requires changing invariant `I5` and the ground-truth `bank_mappings` shape. |
| H3 | Live Razorpay adapter on the one real test payment | Provenance touch, near-zero evaluative value |
| H3 | Q&A over the ledger with citations | High demo appeal, high LLM-wrapper risk. Last. |

---

## I. Recommended implementation order

Tier-0 freeze **31 August**. Seal and sealed run **1 September**. Submission
**5 September**. Each day ends with something runnable.

| Date | Build | Done when |
|---|---|---|
| **Aug 23** | Monorepo, `money`, `domain` (incl. `constraints.decl.ts`), ledger Layer A skeleton | Property tests pass; a hand-built 5-event chain verifies |
| **Aug 24** | Generator: forward simulation, families **F01–F10** (T0-3). **F07–F10 are authored today and held out at family level until the seal (`PREREGISTRATION.md §6.1`).** | `assay generate --split dev`; same seed → identical bytes; `F07`–`F10` generator functions exist and pass structural property tests under the four conditions in `PREREGISTRATION.md §6.1`, with no `--split test` invocation, no engine involvement, and no payload displayed |
| **Aug 25** | Engine S0–S3: quarantine, anchors, candidates under C1–C8, decomposition | Component-size distribution printed; F8 assumption checked |
| **Aug 26** | Engine S4–S5: exact solve, no-good cut, second-best certificate, materiality, I1–I9 | ₹1,00,000 worked example abstains with a correct certificate |
| **Aug 27** | Ledger Layer B + close gate G1–G5 + three outcomes | Trial balance zero; Suspense identity exact; all three close outcomes exercised on constructed inputs. The DEV-seed outcome distribution is recorded for `§F` F9 and is not a completion gate for this day |
| **Aug 28** | `LlmProvider` interface + `offline` provider (all four roles) + `replay` provider; roles R1, R2 + three verification layers | **Full pipeline green with `--llm=offline`, no network** |
| **Aug 29** | Oracle + completeness gate + consistency gate | Both gates pass on dev; 20,000-pair differential agrees |
| **Aug 30** | Eval harness: metrics, bootstrap CIs, B0/B2, A1/A2/A3, multi-seed runner | Full dev benchmark table with CIs, two llm-mode columns |
| **Aug 31** | UI + API + CLI polish; report generation; **TIER-0 FREEZE** | Demo runs end to end without a terminal; §C fully green |
| **Sep 1** | **SEAL** (`PREREGISTRATION.md §9`) → sealed test run | Signed tag `bench-v1.0.3`; results recorded whatever they say |
| **Sep 2** | Write results, threats-to-validity, report page | Report contains all 13 required elements (`EVALUATION_SPEC.md §5.4`) |
| **Sep 3** | H1 stretch items **only if the sealed run is clean** | No Tier-0 regression |
| **Sep 4** | Demo recording, submission package | Video runs on `--llm=offline` |
| **Sep 5** | **SUBMISSION.** Buffer only — no new code | — |

Two disciplines that are not negotiable: held-out families F07–F10 are a **Tier-0
deliverable** (T0-3), authored on 24 Aug and **held out at family level until
1 Sep under the permitted/forbidden lists in `PREREGISTRATION.md §6.1`** — their
generator tests execute generator code and are permitted; their output never
reaches the engine and is never displayed; and **no agent code changes between the
seal on 1 Sep and the recorded result.**

Authoring the held-out families inside Tier-0 rather than as a stretch item is not
a scope increase. `PREREGISTRATION.md §4.1` already declares all four as test-only
families, `§6.1` already assigns them seeds 9100–9104, and the generation
parameters `F07` needs — adjustment rate 0.8% and dispute rate 0.15% — are already
frozen in `§4.2`. Deferring them to a stretch tier would have left the sealed test
split undeliverable by the document that defines it.

Slip plan: if 26 Aug slips, cut R2 and run template triage. If 29 Aug slips,
restrict the oracle to the dev split and say so in the report. If 30 Aug slips,
cut `B2-LLM-DIRECT` and keep the ablations — the controls matter more than the
baselines.

---

## J. Recommended technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x strict, Node 22 (present: v22.23.1) | One language across generator, engine, eval, UI. A polyglot repo costs a day in glue on this schedule. |
| Monorepo | pnpm workspaces (present: v11.17.0) | No Nx/Turbo ceremony needed at this size |
| Money | Branded `Paise = number & {__paise}` | Float money becomes a compile error |
| Schemas | `zod` | Same schema validates ingest and constrains LLM output |
| PRNG | Vendored xorshift128+ (~20 lines) | Reproducibility must survive dependency upgrades |
| Storage | `better-sqlite3`, WAL, single file | Transactional, synchronous, hashable run artifact, no server |
| Testing | `vitest` + `fast-check` | Property tests are the right tool for conservation invariants |
| API | `hono` | Minimal, local bind only |
| UI | Vite + React + Tailwind | No component library; four screens |
| Charts | Hand-rolled SVG or `recharts` | Only risk–coverage and reliability diagram are needed |
| **LLM** | **`LlmProvider` interface, 4 implementations.** Default `offline`. `anthropic` provider uses `@anthropic-ai/sdk` with `messages.parse()` + `zodOutputFormat`, `thinking: {type:"adaptive"}`, prompt caching on the stable system prefix. `openai-compatible` covers self-hosted and third-party endpoints. | No vendor is load-bearing. Model choice on the live path is the team's cost decision (F2), not an architectural dependency. |
| Secrets | `.env`, gitignored; `gitleaks` pre-commit | Already scaffolded |

Deliberately excluded: Docker, Postgres, Redis, vector databases, LangChain or
any agent framework, ORMs, auth libraries. Each adds surface without touching the
contribution.

**Explicitly prohibited:** using Claude Pro, ChatGPT Go, Google AI Pro or any
consumer subscription as a programmatic API. They are end-user products with
their own terms; ASSAY does not automate, scrape, proxy or route traffic through
them.

---

## K. Exact repository structure

```
razorpay-finance-controller/
├── README.md
├── .gitignore                      # secrets + sealed ground truth
├── .env.example                    # names only, never values
├── package.json                    # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── eslint.config.js                # import bans: engine ↛ generator|oracle|untrusted_text
│                                   #              oracle ↛ engine|generator
│                                   # schema lint: no numeric field in any LLM response schema
│
├── docs/                           # this specification set
│   ├── DECISION_BRIEF.md
│   ├── PROJECT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── RECONCILIATION_SPEC.md
│   ├── PREREGISTRATION.md
│   ├── EVALUATION_SPEC.md
│   ├── THREAT_MODEL.md
│   └── RELATED_WORK.md
│
├── packages/
│   ├── money/        src/{paise.ts,ops.ts,round.ts}              + tests/property/
│   ├── domain/       src/{schemas/,ids.ts,accounts.ts,canonical-json.ts,
│   │                      constraints.decl.ts}
│   ├── generator/    src/{prng.ts,simulate.ts,families/F01..F12.ts,degrade.ts,emit.ts}
│   ├── oracle/       src/{enumerate.ts,completeness-gate.ts}
│   ├── engine/       src/{s0-ingest.ts,s1-anchor.ts,s2-candidates.ts,
│   │                      s3-decompose.ts,s4-solve.ts,s5-validate.ts,
│   │                      constraints/C1..C8.ts,invariants/I1..I9.ts}
│   ├── llm/          src/{provider.ts,                    # the LlmProvider interface
│   │                      providers/{offline,replay,anthropic,openai-compatible}.ts,
│   │                      roles/{r1..r4}.ts,
│   │                      verify/{schema,allowlist,grounding}.ts}
│   ├── ledger/       src/{events.ts,hash-chain.ts,        # Layer A
│   │                      journal.ts,projection.ts,       # Layer B
│   │                      close-gate.ts,close.ts}
│   └── eval/         src/{agents/{assay,b0,b1,b2,a1,a2,a3}.ts,metrics/,
│                          bootstrap.ts,report/,
│                          gates/consistency-gate.ts}   # ONLY place importing
│                          #        both engine and oracle — see L.1 rule 3
│
├── apps/
│   ├── cli/          src/commands/{generate,oracle,run,bench,close,verify,seal}.ts
│   ├── api/          src/routes/
│   └── web/          src/screens/{Run,Close,Exceptions,Benchmark}.tsx
│
├── bench/
│   ├── benchmark_manifest.json     # committed, includes GT + constraint-set hashes
│   ├── dev/                        # observations + ground truth, committed
│   └── test/                       # observations committed; ground_truth.jsonl GITIGNORED
│
├── fixtures/llm-cache/             # committed; makes replay-mode runs reproducible
└── runs/                           # gitignored run artifacts
```

---

## L. IMPLEMENTATION FREEZE

Binding on the implementing agent. Deviation requires an explicit spec amendment
with a version bump, not a judgement call at the keyboard.

### L.1 Invariants that may never be violated

1. All money is integer paise via the branded `Paise` type. **No floating point
   anywhere**, including intermediates, JSON and SQLite columns.
2. **No LLM output schema may contain a numeric field.** A CI lint fails the
   build if one appears.
3. `packages/engine` may not import `packages/generator`, `packages/oracle`, or
   `untrusted_text`. `packages/oracle` may not import `packages/engine` or
   `packages/generator`. Enforced by ESLint in CI. **The single permitted
   exception is `packages/eval/src/gates/consistency-gate.ts`**, which must
   import both engine and oracle to compare them; it is allowlisted by path in
   the lint config and may contain no logic other than the differential test.
4. Only stage S5 may construct a `ValidatedDecision`; `packages/ledger` exposes
   exactly one write path and accepts only that type. The type is **declared**
   in `packages/ledger` and **constructed** only in
   `packages/engine/src/s5-validate.ts`; its fields, and the obligation that
   demands each one, are normative in `ARCHITECTURE.md §4` boundary 3.
   Enforcement is a non-exported unique-symbol brand with no exported
   constructor, plus an ESLint path allowlist for the single widening
   assertion — the mechanism rule 3 already uses for `consistency-gate.ts`,
   because TypeScript's structural typing cannot express "only S5" on its own.
   The rule binds the **mutating write path**: `journal.ts` is a pure posting
   function over a *proposed* allocation and does not take this type, which is
   what keeps S5 → `I1` → mint → write acyclic.
5. Every observation reaches exactly one terminal state: `RECONCILED`,
   `ABSTAINED`, `EXCEPTION`, or `REFERENCE`. No fifth state, no drop path.
   `REFERENCE` is assigned statically at ingest from `Observation.kind`
   (`DATA_MODEL.md §10.1`) and may never be assigned by a decision, so it cannot
   become a route for retiring an observation the engine failed to explain.
6. Gate G3 at close, exactly: `Σ |item_net_paise| = Σ abstained value + Σ open
   exception value` over open Suspense items, in the gross per-item form
   (`RECONCILIATION_SPEC.md §10.1`, `DATA_MODEL.md §17.1`). An item is the set of
   `9000_SUSPENSE` journal lines sharing one `JournalLine.source_entity_id`
   (`DATA_MODEL.md §16`) and is **open** while that set nets to a non-zero
   figure. The left side is computed from the journal lines and the right side
   from the `Decision` / `Exception` records at `value(observation)`
   (`DATA_MODEL.md §14.1`), over the same universe — two stores, one identity.
7. The period ends `CLOSED`, `OPEN` or `BLOCKED`. A close report is emitted for
   the first two and **never** for `BLOCKED`.
8. Every LLM-referenced entity ID must exist in the observation set (invariant
   I6), independently of any allowlist check.
9. `C6` exact tie-out has zero tolerance except where a declared degradation
   operator is in force, and that use is logged on the decision.
10. **The full pipeline must pass every acceptance test under `--llm=offline`.**
11. All scored benchmark runs use `--llm=replay --strict-replay`. A cache miss is
    a hard error, never a silent live call.
12. Frozen at seal time and immutable thereafter: `τ = max(₹100, 10 bps)`,
    `ε = 1500 bps (0.15)`, `K_max = 22`, `C_max = 5000`, `P_max = 3`,
    `C_review = ₹250`, `C_exception = ₹500`, `k_sigma = 3`, `queue_top_n = 20`,
    `max_unresolved_ratio_bps = 50 (0.005)`, the per-family
    `target_record_count` schedule in `PREREGISTRATION.md §4.1`, and the SE1–SE5
    weights (3500 / 2000 / 1500 / 1000 / 2000 bps). `max_unresolved_abs` no
    longer exists.

### L.2 Build order (do not reorder)

`money` → `domain` → `ledger Layer A` → `generator` → `engine S0–S3` →
`ledger Layer B` → `engine S4–S5` → `llm (provider + offline + replay)` →
`oracle` → `eval` → `api` → `web` → seal → sealed run.

Each package depends only on those before it, so the dependency graph is acyclic
in build order and every stage is independently testable. Note `llm` precedes
`oracle`: the offline provider is on the critical path for the demo guarantee.

**`ledger` occupies two positions, not one, and `§I` already scheduled it that
way.** `ARCHITECTURE.md §8` splits the package in two — Layer A is the
hash-chained audit event log (`events.ts`, `hash-chain.ts`), Layer B is the
double-entry projection and the posting rules (`journal.ts`, `projection.ts`,
`close-gate.ts`, `close.ts`). `§I` builds "ledger Layer A skeleton" on day 1 and
"Ledger Layer B + close gate G1–G5" after "Engine S4–S5", while this line named
`ledger` once, third. The two documents disagreed and this one was wrong.

The split is load-bearing rather than cosmetic. `§L.1` rule 4 makes
`ValidatedDecision` the only type the ledger's write path accepts, and stage S5
is the only thing permitted to construct one — so a monolithic `ledger` position
three places ahead of S5 reads as a dependency cycle. There is none. Layer A is
pure and needs nothing from S5. Layer B's `journal.ts` is a **pure posting
function** and is S5's *dependency*, not its dependent: S5 must obtain journal
lines before it can check `I1` over them and only then mint a
`ValidatedDecision`. Only the single **mutating write path** — which
`ARCHITECTURE.md §4` boundary 3 constrains, and which arrives with persistence —
takes that type. Drawn there, the order above is linear and acyclic.

### L.3 Definition of done, per package

No package is complete without: strict TypeScript with no `any` at a public
boundary; unit tests on the happy path; **property tests on every invariant it
owns**; a `README.md` stating what it guarantees; and zero imports violating L.1-3.

### L.4 Prohibited without a spec amendment

Adding an LLM call outside roles R1–R4, or outside the `LlmProvider` interface.
Adding a probe that writes. Adding a tolerance to `C6`. Changing a frozen
threshold after the seal. **Changing any frozen threshold or decision parameter
listed in `PREREGISTRATION.md §7` on the basis of an observed result** — pre-seal
adjustment is permitted by `§6.2` AL3 only on an argument that does not reference
measured performance, and a result-driven adjustment requires a formally opened
governance/amendment cycle that states what was observed first (`§F` F9).
Inventing an accounting mapping for an observation, terminal state or exception
class that `DATA_MODEL.md §17.1.1`'s trigger table does not enumerate. That table
is total, so there is nothing to invent; adding an account, a posting rule, or a
row to it is a spec amendment. **Superseded at spec 1.4.0:** this rule previously
read *"instead of taking the P8 fallback"*, which mandated a fallback that could
not be constructed outside adjustment observations (`§A.7` G-F). Adding a chat interface to the main
path. Making any acceptance test depend on a live model. Using a consumer AI subscription as an
API. Reporting a metric not in `PREREGISTRATION.md §8` without labelling it
`EXPLORATORY`. Reporting any number that does not exist in a committed run
artifact. Claiming real Razorpay settlement data. Claiming a gap or defect in
Razorpay's reconciliation. Asserting what a commercial vendor does internally.
Committing a credential.

### L.5 The four sentences the implementing agent must be able to recite

1. ASSAY consumes Razorpay's recon report as authoritative input, reconciles it
   against a bank statement and a merchant ledger, and posts every decision as
   balanced double-entry journal lines into a hash-chained ledger.
2. When the evidence admits two materially different allocations, it abstains and
   attaches the second allocation as a certificate, because a plausible wrong
   answer costs more than an honest refusal.
3. The period closes only if the books balance and Suspense reconciles exactly;
   otherwise it stays open with the unresolved rupees named.
4. The language model reads messy text and triages exceptions behind a provider
   interface; it cannot express a monetary amount, cannot name an entity that
   does not exist, cannot commit a decision, and can be removed entirely with
   `--llm=offline`.

If a proposed change would make any of those four sentences false, it is out of
scope.
