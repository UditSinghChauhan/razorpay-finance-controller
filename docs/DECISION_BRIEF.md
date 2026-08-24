# DECISION_BRIEF — ASSAY

**Adversarial review, and the locked project definition after revision.**
**Spec version:** 1.3.0 · **Date:** 2026-08-25
**Reviewer role:** principal architect / skeptical reviewer

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
| **Sep 1** | **SEAL** (`PREREGISTRATION.md §9`) → sealed test run | Signed tag `bench-v1.0.2`; results recorded whatever they say |
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
   exactly one write path and accepts only that type.
5. Every observation reaches exactly one terminal state: `RECONCILED`,
   `ABSTAINED`, `EXCEPTION`, or `REFERENCE`. No fifth state, no drop path.
   `REFERENCE` is assigned statically at ingest from `Observation.kind`
   (`DATA_MODEL.md §10.1`) and may never be assigned by a decision, so it cannot
   become a route for retiring an observation the engine failed to explain.
6. Gate G3 at close, exactly: `Σ |item_net_paise| = Σ abstained value + Σ open
   exception value` over open Suspense items, in the gross per-item form
   (`RECONCILIATION_SPEC.md §10.1`, `DATA_MODEL.md §17.1`).
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

`money` → `domain` → `ledger` → `generator` → `engine S0–S3` → `engine S4–S5` →
`llm (provider + offline + replay)` → `oracle` → `eval` → `api` → `web` → seal →
sealed run.

Each package depends only on those before it, so the dependency graph is acyclic
in build order and every stage is independently testable. Note `llm` precedes
`oracle`: the offline provider is on the critical path for the demo guarantee.

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
Inventing an accounting mapping for an event that `DATA_MODEL.md §17.2` leaves
unmapped, instead of taking the P8 fallback. Adding a chat interface to the main
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
