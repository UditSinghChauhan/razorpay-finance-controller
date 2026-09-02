# DECISION_BRIEF — ASSAY

**Adversarial review, and the locked project definition after revision.**
**Spec version:** 1.4.35 · **Date:** 2026-09-02
**Reviewer role:** principal architect / skeptical reviewer

**At spec 1.4.35** §A.42 records **one ratification**, taken at a governance gate held
after spec 1.4.34 and — the condition that makes it legitimate — **before any
benchmark data existed**: `bench/` absent, `runs/` holding only `.gitkeep`, no dataset
generated, no agent scored, no metric computed and no seal tag cut. Wiring the
truth-side metrics exposed that `EVALUATION_SPEC.md §4.6` had frozen metric 7's
formula, its ten bins, its reliability diagram and its ε-gap scope while naming
`accuracy(bin)` **without ever defining what makes a committed decision right**. Two
readings stood on the frozen text and they **disagree numerically** on a decision
asserting a **subset** of the true members: **set equality** against the true
allocation, which `M35` already calls *"allocation identity"*, and **edge-level
agreement**, under which `§4.2`'s `FP` clause alone would decide. **M57** ratifies set
equality. The population is `RECONCILIATION_SPEC.md §6` step 3's **`DISCRIMINATED`**
branch — the one accept in which the ε-gap decided the gate — the binned prediction is
that decision's `Δs`, and **one committed decision is one prediction**. **The `§4.6`
formula is preserved verbatim**, as are the ten bins, the reliability diagram and
metric 7's name and number. Six alternatives are **rejected and preserved as
rejected**: calibrating `evidence_score_bps` itself, including `UNIQUE` decisions with
an invented score, including `IMMATERIALLY_AMBIGUOUS` decisions, edge-level or
partial-credit correctness, the edge as the prediction unit, and leaving the metric
unresolved. `§4.2` is **read and not amended**, and metric **5** remains the
partial-credit metric. **`BENCHMARK_VERSION` moves 1.0.11 → 1.0.12** on `M39`'s
precedent — metric 7 moves from an unavailable state to a number — while `GT_VERSION`
stays 1.1.0, `constraint_set_hash` does not move, `RunKey` and `RunConfig` are
unchanged, `AL1`–`AL8` are untouched in substance and wording, and the 28-metric list
stays at 28 with no other formula changed. The residual is **disclosed rather than
hidden**, at `PREREGISTRATION.md §10` **V32**. **No implementation code is touched.**
See `PREREGISTRATION.md` amendment 1.4.35.

**At spec 1.4.34** §A.41 records **one ratification**, taken at a governance gate held
after spec 1.4.33 and — the condition that makes it legitimate — **before any
benchmark data existed**: `bench/` absent, `runs/` holding only `.gitkeep`, no dataset
generated, no agent scored, no metric computed and no seal tag cut. Wiring `M55`
exposed a contradiction the corpus had carried since spec 1.4.27:
`EVALUATION_SPEC.md §2` defines a scored unit as `score(agent output, ground truth,
oracle labels)` on **both** splits, `PREREGISTRATION.md §9` step 7 makes
`assay bench --sealed` the **only** run that ever scores TEST, and `§5.3` said that
*"`AL5` withdraws that route under `--sealed`"* — so the official sealed sweep could
produce **no truth-side metric at all**. **M56** rules that `§6.2` **`AL5` is an
EMISSION rule**: it *"refuses to print, log or write any ground-truth field; only
aggregate metrics are emitted"*, and reading is none of those three. The **scorer**
therefore reads ground truth at step 7 and emits aggregates. `§5.3`'s sentence is
**narrowed to the two readers it was written against** — the completeness gate and the
seal, neither of which `§9` ever runs sealed — and their withdrawal is re-grounded on a
**flag refusal**, which is stricter than the read refusal it replaces. **Three states
are kept apart: agent execution under `--sealed` is unchanged; truth computation after
the run may read the answer key; the emitted artifact carries aggregates only.** No
permission is created: `AL1` and `AL2` bind `packages/engine` and `packages/oracle`
**by name**, and the scorer is neither. Four alternatives are **rejected and preserved
as rejected**: a fifth `ReadZone`, a second scoring pass or step 7b, copying or
re-keying the truth artifact, and emitting `0.0` for an unavailable metric. The ruling
is **general**, governing metrics 2, 3, 5, 6, 7, 8, 15, 16 and 26's cost half and every
future truth-dependent metric. **`BENCHMARK_VERSION` moves 1.0.10 → 1.0.11** on
`M39`'s precedent, while `GT_VERSION` stays 1.1.0, `constraint_set_hash` does not move,
`RunKey` and `RunConfig` are unchanged, `AL1`–`AL4` and `AL6`–`AL8` are untouched in
substance and wording, `§7` gains no entry and the 28-metric list stays at 28 with no
formula changed. The residual is **disclosed rather than hidden**, at
`PREREGISTRATION.md §10` **V31**. **No implementation code is touched.** See
`PREREGISTRATION.md` amendment 1.4.34.

**At spec 1.4.33** §A.40 records **one ratification**, taken at a governance gate held
after spec 1.4.32 and — the condition that makes it legitimate — **before any
benchmark data existed**: `bench/` absent, `runs/` holding only `.gitkeep`, no dataset
generated, no agent scored, no metric computed and no seal tag cut. **M52** supplied
metrics 15 and 16's two **populations** and said in terms that *"the formulas in
`EVALUATION_SPEC.md §4.8` are unchanged; what is supplied is the universe"* — which
left metric 15's **numerator** without one. *"Injected cases with `balance_harm > 0`"*
names a **per-case** harm, and `§4.4(a)` defines only a **run-level aggregate** whose
absolute value sits outside the per-account difference, so it does not decompose.
**M55** ratifies one per-case decomposition — `§4.4(a)`'s two projections each
restricted to the case's own `source_entity_id` (`DATA_MODEL.md §16`, `§12`/`M28`),
Suspense excluded and the covered-set scope unchanged — and ratifies the **structural
zero** for a case that posts no line, which contributes `0` **and stays in the
denominator**. Two admissible alternatives are **rejected and preserved as rejected**:
the leave-one-out marginal, and substituting `§4.4(b)`'s `misdirected_value_inr`.
**`BENCHMARK_VERSION` moves 1.0.9 → 1.0.10** on `M39`'s precedent — an input to a
frozen figure enters the pre-registered surface — while `GT_VERSION` stays 1.1.0,
`constraint_set_hash` does not move, `RunKey` stays `(agent_id, split, seed,
llm_mode)`, and `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε` and every pre-existing `§7` threshold
are unchanged. **`M52`'s populations are preserved verbatim and unnarrowed, metric 16
is untouched, and the 28-metric list stays at 28.** The non-additivity is **disclosed
rather than hidden**, at `PREREGISTRATION.md §10` **V30**. **No implementation code is
touched and metric 15 remains unwired.** See `PREREGISTRATION.md` amendment 1.4.33.

**At spec 1.4.32** §A.39 records **four rulings**, taken at a governance gate held
after spec 1.4.31 and — the condition that makes them legitimate — **before any
benchmark data existed**: `bench/` absent, `runs/` holding only `.gitkeep`, no
dataset generated, no agent scored, no metric computed and no seal tag cut. Four
quantities on `PREREGISTRATION.md §8`'s frozen list of 28 had **no determinate
procedure or no computable universe**. **M51** fixes the ε/τ/cost sweep contract: the
ε grid `{0, 500, …, 10_000}` bps with **1500 on it**, a sweep point as an evaluation
**inside one scored unit**, `apps/cli` owning the two sweeps that re-execute an
agent, the oracle **not** re-run at a swept τ, and `C_review` and `C_exception` moved
**together**. **M52** supplies metrics 15 and 16's injected and matched-clean-control
populations. **M53** supplies `abstention_rate_by_value`'s universe and metric 17's
DEV baseline, produced by `PREREGISTRATION.md §9`'s new **step 0**. **M54** records
metric 10 as **not computable on the frozen population** and preserves the three
rejected repairs as rejected. **`BENCHMARK_VERSION` moves 1.0.8 → 1.0.9** on `M39`'s
precedent — four inputs to frozen figures enter the pre-registered surface — while
`GT_VERSION` stays 1.1.0, `constraint_set_hash` does not move, `RunKey` stays
`(agent_id, split, seed, llm_mode)`, and `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε` and every
pre-existing `§7` threshold are unchanged. **The 28-metric list stays at 28**, none
added, removed or renumbered; metrics 15, 16 and 17 gain the **universe** their
formulas quantify over, which is the benchmark-v1.0.3 treatment of metric 13. **No
implementation code is touched and neither the scorer nor `bench` is begun.** See
`PREREGISTRATION.md` amendment 1.4.32 and `§10` **V27**–**V29**.

**At spec 1.4.31** §A.38 records **one ratification and two withdrawals**, taken at a
governance gate held after spec 1.4.30 and — the condition that makes them
legitimate — **before any scored result existed**: `bench/` absent, `runs/` holding
only `.gitkeep`, no dataset generated, no agent scored and no metric computed.
`EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` row loses *"runs end `BLOCKED`"*, which
contradicts `§2`'s protocol, `§4.9` and metric 14 and would forfeit the very
criterion `PROJECT_SPEC.md §7` **S6** asks the ablation for, and *"trial balance
breaks"*, which the ledger boundary makes unreachable because `I1` is re-checked at
every append independently of `S5`. *"Removed: Stage S5 invariants `I1`–`I9`"* is
ratified as **`S5` does not evaluate the allocation-scoped set `I1`–`I8`** — never
*"evaluate and ignore the failures"* — so an `A1` decision records
`invariants_checked: []` and the run closes `CLOSED`/`OPEN` like any other agent's.
`§L.1` rule 4 gains a **narrowly-scoped** clause: `validate()` may take the evaluated
set as a parameter, defaulting to the full set for every ordinary caller, with the
empty set selectable only from the path-allowlisted `A1-NOVALIDATE` module, and with
**no second `ValidatedDecision` constructor and no second widening assertion**.
Register row **M50**. **`BENCHMARK_VERSION` stays 1.0.8**; `GT_VERSION` stays 1.1.0;
`constraint_set_hash` does not move; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, every `§7`
threshold, the definitions of `I1`–`I9`, `§17.1`'s `P1`–`P8`, `§13`'s certificate,
the closed five-probe enum, the `A3-NOLLM` policy and all **28** metric definitions
are unchanged. **No implementation code is touched and `A1` remains unimplemented.**
See `PREREGISTRATION.md` amendment 1.4.31 and `§10` **V26**.

**At spec 1.4.30** §A.37 records **one ratification**, taken at a governance gate
held after spec 1.4.29 and — the condition that makes it legitimate — **before any
scored result existed**: `bench/` absent, `runs/` holding only `.gitkeep`, no
dataset generated and no metric computed. `DATA_MODEL.md §17.1.1`'s *"the settlement
it is allocated to"* is fixed as the settlement of the **allocation under
evaluation** — the `Candidate.target_id` for a proposed allocation, the target of
the candidate `S5` validated for an accepted one — and **not**
`ReconLine.settlement_id`. The competing reading makes `RECONCILIATION_SPEC.md §6`'s
materiality identically zero and its `AMBIGUOUS` and `DISCRIMINATED` outcomes
unreachable, which spec 1.4.21's own reachability argument forecloses. Register row
**M49**. **Benchmark v1.0.7 → v1.0.8**; `GT_VERSION` stays 1.1.0,
`constraint_set_hash` does not move, `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, every `§7`
threshold, `I1`–`I9`, `§17.1`'s `P1`–`P8`, `§13`'s certificate, the closed
five-probe enum and all **28** metric definitions are unchanged, and no artifact
byte changes. `§H`'s `H1` disposition and `M41`'s finding are untouched. See
`PREREGISTRATION.md` amendment 1.4.30.

**At spec 1.4.29** §A.36 records **four ratifications** in three groups, taken at a
governance gate held after spec 1.4.28 and — the condition that makes them
legitimate — **before any DEV scored result existed**: `bench/` absent, `runs/`
holding only `.gitkeep`, no agent run and no metric computed. **M45** makes `§9` step
1's signed tag *the seal* and lifts `--split test` on a `--seal-tag` operator
attestation; **M46** corrects `§9`'s stale `1.0.6` literals; **M47** places the seven
agents at `apps/cli/src/agents/` and injects them into `packages/eval`; **M48** makes
`assay report` an eighth command, keys `metrics.json` `(agent_id, split, seed,
llm_mode)` and makes scored run artifacts committed. Register rows **M45**–**M48**.
**Benchmark version does NOT move and stays v1.0.7**; `GT_VERSION` stays 1.1.0,
`constraint_set_hash` does not move, `C1`–`C8`, `SE1`–`SE5`, every `§7` threshold and
all **28** metrics are unchanged, and no artifact byte changes. `--record`/`F2` and
`§H`'s `H1` disposition are untouched. See `PREREGISTRATION.md` amendment 1.4.29.

**At spec 1.4.28** §A.35 records **one ratification**, taken at a governance gate
held after spec 1.4.27 and — the condition that makes it legitimate — **before any
dev consistency-gate result existed**: the `PREREGISTRATION.md §5.3` consistency
draw is frozen into `§7` and bound by `AL3`, **sampler and seed together**, with
`CONSISTENCY_DRAW_SEED = 417203` and `R = 20,000` unchanged. Register row **M44**;
threat row `PREREGISTRATION.md §10` **V25**, closing **V24**. **Benchmark v1.0.6 →
v1.0.7**; `GT_VERSION` stays 1.1.0, `constraint_set_hash` does not move, `C1`–`C8`,
`SE1`–`SE5`, every other `§7` threshold and all **28** metrics are unchanged, no
generation seed is touched and no artifact byte changes.

**At spec 1.4.27** §A.34 records **two ratifications**, taken at a governance gate
held after spec 1.4.26 and **before any dataset was generated**: the committed
**dataset artifact unit is `(split, seed)`** and family is not a file dimension
(**M42**), and **`apps/cli` executes both `PREREGISTRATION.md §5.3` gates** with no
gate logic moving package (**M43**). Both were forced by an audit of the sealed-run
path, which found that `§9` had never stated the artifact unit and that the
completeness gate — declared MUST-PASS — had **no execution path and no power to
stop a seal**. `bench/<split>/recon_report.jsonl` does **not** move and M36/M38 are
preserved verbatim. Threat row `PREREGISTRATION.md §10` **V24** records the one thing
deliberately left open: the `R = 20,000` consistency draw's sampler and seed.
**Benchmark v1.0.5 → v1.0.6**; `GT_VERSION` stays 1.1.0, `constraint_set_hash` does
not move, `C1`–`C8`, `SE1`–`SE5`, every `§7` threshold and all **28** metrics are
unchanged, and §H's H1 disposition is not reopened.

**At spec 1.4.26** §A.33 records one **disclosure**, taken at a governance gate held
after spec 1.4.25, after `R3` was built and tested, and **before any dataset was
generated or any result observed**: `§H` tier **H1**'s affirmative claim — that
`R3`'s probe selection *beats* the `A3-NOLLM` static priority list — is **not
answerable on the conforming v1.0.0 population**, because `R3`'s choice set is a
**singleton** and `PREREGISTRATION.md §7`'s frozen policy is **weakly dominant**.
**Documentation only; a claim is withdrawn, not a capability.** Threat row
`PREREGISTRATION.md §10` **V23**, register row **M41**. No metric definition,
threshold, `C1`–`C8`, `SE1`–`SE5` weight, probe source, success criterion or package
implementation changes; **`BENCHMARK_VERSION` stays 1.0.5**, `GT_VERSION` 1.1.0 and
`constraint_set_hash` does not move.

**At spec 1.4.25** §A.32 records three governance decisions and one implementation
convention, taken at a governance gate held **after spec 1.4.24, before `R3` exists
in any form, and before any H1, dev or benchmark figure was observed**: the
`A3-NOLLM` probe priority policy is **frozen** into `PREREGISTRATION.md §7`;
`DATA_MODEL.md §13` gains a fourth and final certificate reason
`NO_USEFUL_PROBE_AVAILABLE`; `R3` **may not propose `widen_temporal_window`**, with
`§L.1` rule 2 **unchanged and unweakened**; and a rejected probe proposal terminates
the loop, recorded as a convention. Register rows **M39** and **M40**. **Two are
ratifications and the record says so.** No metric definition, `C1`–`C8`, `SE1`–`SE5`
weight, `§7` threshold, population parameter or `constraint_set_hash` moves;
`GT_VERSION` stays 1.1.0. Benchmark v1.0.4 → **v1.0.5**.

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

### A.25 Spec 1.4.18 / benchmark 1.0.3 — the stage nobody owned

**The decision.** `packages/domain` owns stage `S0`'s orchestration over source data
`apps/cli` has already read; `apps/cli` performs the filesystem I/O and no `S0`
transform; `packages/engine` begins at `S1` and owns `S1`–`S5`. Register row M32.

**A1 was a true contradiction, and only one side could stand.** `ARCHITECTURE.md §3`
gave the engine *"Stages S1–S5"* while `§L.2`, `§I`'s T0-4, `§I`'s Aug-25 row and
`§I`'s repository tree gave it `S0` — the tree going so far as to place
`s0-ingest.ts` inside `packages/engine/src/`. **The engine side was not merely
outvoted, it was impossible.** `RECONCILIATION_SPEC.md §2` declares `S0`'s output as
`Observation[]` + **`UntrustedText[]`**, and `DATA_MODEL.md §10` states that
*"nothing in `packages/engine` may import `UntrustedText`"*, because *"it is not that
the core **chooses** not to read hostile text, it is that it **cannot**"*. `§L.1`
rule 3 lists that ban among the invariants that may never be violated,
`PREREGISTRATION.md §6.2` `AL1` repeats it, and `eslint.config.js` enforces it in CI
with `noInlineConfig` and a dynamic-import ban. **A stage cannot emit a type its
package is forbidden to import.**

**A build order does not outrank an invariant, and `§L.2` had already made this
mistake once.** `§L.1` is titled *"Invariants that may never be violated"* and sits
directly above `§L.2` in the same document; rule 3 is the `UntrustedText` ban. `§L.2`
itself records an earlier correction in the same voice — of the `ledger` split, *"the
two documents disagreed and this one was wrong"* — and the identical remedy applies.
`§I`'s entries were not shorthand either: T0-4 read *"`packages/engine` S0–S3 —
**quarantine**"*, naming `S0` step 3 and the package together.

**Why `packages/domain`, and why this creates nothing.** `ARCHITECTURE.md §3`
excluded the engine but **named no owner**, so the owner was a genuine choice among
`domain`, `apps/cli` and a new package. `domain` wins on every stated preference at
once: it already holds every per-record part `S0` performs — the strict schemas of
`§4` boundary 1.1, `checkReconLineInvariants` for `RECONCILIATION_SPEC.md §2` step 2,
the quarantine module at the separately-bannable `@assay/domain/untrusted-text`, and
`DATA_MODEL.md §10.1`'s static `REFERENCE` classification — all committed before this
amendment. It builds second, so nothing waits on it. It performs **no I/O**, so `S0`
stays deterministic and unit-testable without a filesystem. **No package is created
and no code moves.** `apps/cli` was the alternative and loses on one concrete count:
it does not appear in `§L.2`'s build order at all, so `S0` would sit outside the
ordering that makes *"every stage independently testable"*.

**The I/O split is the load-bearing part.** `S0`'s stated input is *"raw source
files"* while `§3` gives the engine *"no I/O, no network"*. Those are reconciled by
separating **who reads** from **who transforms**: the CLI acquires bytes, domain
turns them into `Observation[]` + `UntrustedText[]`, the engine receives
`Observation[]` alone. `ARCHITECTURE.md §2`'s component map already drew exactly this
— `ingest` inside trust boundary 1, the engine box beneath it listing `S1`–`S5` — and
is unchanged.

**Nothing is built here.** `packages/engine` remains **absent** at spec 1.4.18 and
domain's `S0` orchestration is scheduled, not written; the amendment moves no file and
adds no module. `ARCHITECTURE.md §4` boundary 1's three obligations, `§2`'s map and
the engine's `§3` row are all untouched — the engine row's *"Stages S1–S5"* is
byte-identical to what it has said since spec 1.0.0, which is the point.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes; `C1`–`C8` and
`SE1`–`SE5` are untouched and `constraint_set_hash` does not move; benchmark v1.0.3
and `GT_VERSION` 1.1.0 are unchanged and no dataset exists. `A2`, `THREAT_MODEL.md
§T7`'s `days` bound, `SE4`'s agreement function and the recon endpoint's date-scoping
field are all untouched.

### A.26 Spec 1.4.19 / benchmark 1.0.3 — a promised control that was never built

**The decision.** `widen_temporal_window` is **expected-non-binding on v1.0.0
data**. Its numeric hard bound stays **unspecified**, and this amendment **does not
invent one**. Register row M33.

**`§T7` asserted a control that does not exist.** Its Controls paragraph lists four:
a closed enum of five read-only operations, allowlisted arguments, `P_max = 3` per
component, and — for the one probe that relaxes a constraint — *"a hard bound"*. The
first three are real and enforced. **The fourth is a claim with nothing behind it**:
no document states the figure, `PREREGISTRATION.md §7`'s frozen block carries none,
and `§6.2` AL3's enumeration of frozen constants omits it. Spec 1.4.12 disclosed the
gap twice, in `DATA_MODEL.md §12` and `PREREGISTRATION.md §4.2`, and declined to
bound `days` in the schema on the ground that doing so *"would invent a frozen
constant"*. That reasoning stands; this record adds what it could not.

**The arithmetic makes the missing number harmless on this population.** `§4.2`'s
frozen cycle admits only `T+1`, `T+2` and `T+3`; the spec-1.4.7 grid puts
`lag_days ∈ (n, n + 0.875]`; and `§4.3`'s `SHIFT_TIMESTAMP` — the only operator that
could move a lag — is declared **not exercised**. So the true lag range is
`(1, 3.875]` days inside `C4`'s `[1, 7]`, with **3.125 days of headroom at the top
and a lower bound that never binds**. `C4` excludes no true member; the widening
needed for completeness is **zero days**; and any positive widening can only admit
allocations the truth does not require — which is `§T7`'s own named attack, *"quiet
constraint relaxation to manufacture a match"*, approached from the inside.

**Zero is what is *needed*, not a ceiling that is *imposed*.** The distinction is
the whole of this amendment's restraint. Turning "no widening is necessary" into "no
widening is permitted" would be a new frozen constant wearing a derivation's
clothes. `days` keeps `integer > 0` with no schema ceiling, and `packages/domain`'s
shipped test — *"does NOT bound `days` — `THREAT_MODEL §T7` promises a bound no
document states"* — keeps pinning that absence.

**Expected-non-binding is not a prohibition, and the record says so explicitly.**
Nothing here forbids `R3` from proposing the probe; whether it may is **not
settled**. The probe keeps its place in the closed enum, because `§T7`'s SSRF and
spend controls rest on that enum being shut at five and `DATA_MODEL.md §12`'s
`ProbeResultDetail` mirrors it variant for variant.

**`§T7`'s stated attack survives the missing bound on a different control.** Spec
1.4.15 derived that a `widen_temporal_window` result may **not** feed `SE5`,
precisely because scoring it *"would let a `C4` relaxation raise the evidence score
of the candidates it admitted"*. That exclusion is already frozen, and it — not a
ceiling — is what currently prevents the relaxation-to-manufacture-a-match path. The
`§T7` edit made here is the **first in the project**, and it is made because the
sentence was false rather than merely incomplete.

**Nothing observable moves.** `C4`, `T_min`, `T_max`, `P_max = 3`, `C1`–`C8`,
`SE1`–`SE5` and `ProbeResultDetail` are all unchanged; no population parameter,
seed, split, family, `target_record_count`, rate, threshold or metric definition
changes; `constraint_set_hash` does not move; benchmark v1.0.3 and `GT_VERSION`
1.1.0 are unchanged and no dataset exists.

### A.27 Spec 1.4.20 / benchmark 1.0.3 — the third signal with no comparand

**The decision.** `SE2` is **expected-non-binding on v1.0.0 data**. Its 2000-bps
weight is retained, unreallocated, and the row is not removed. Register row M34.

**Found by implementing, not by reading.** `S4` needs `evidence_score_bps`, which
needs all five signals. Inspecting the actual APIs before writing the scorer
surfaced a comparand chain that does not close: `receipt` is reachable through
`fetch_order`, `order_ref` lives only on `MerchantLedgerEntry`, and **nothing pairs
a `MerchantLedgerEntry` with a candidate**. `AN5` was that pairing and was retired
at spec 1.4.1 — on grounds this specification argued at length — after which
`DATA_MODEL.md §11.1` and `§17.1.1` leave `ledger_entry` neither member-eligible
nor a target, and every one reaches `E13_LEDGER_ONLY`.

**Two frozen statements could not both hold.** `PREREGISTRATION.md §4.2` said the
surviving receipt sequence made `SE2` *"a strong signal"*; `§10` V12 says *"ASSAY
consumes three sources and **ties out two**."* `SE2` can only be strong if some
candidate is scored against a ledger entry's `order_ref`, and V12 says the ledger
view is never tied out. V12 is the one consistent with `AN5`'s retirement and with
every clause downstream of it, so the *"strong signal"* sentence is corrected.

**This is the third signal retained while doing nothing, and the pattern now has
three members.** `§A.17` found `SE1` inactive because spec 1.4.4 removed the
matching problem it was sized for. `§A.19` found `SE4` non-binding because its
comparand was never reachable. This record finds `SE2` non-binding because its
**pairing** was retired — a third distinct cause, same disposition: retained,
unreallocated, reported. `RECONCILIATION_SPEC.md §4.1`'s `C8` treatment is doing a
lot of work in this specification, and it is doing it deliberately.

**Expected-non-binding, not permanently inactive.** `SE1`'s status is structural —
`§11.1`'s empty `bank_line` candidate set removed the only context in which its
comparands could differ. `SE2`'s is the absence of a clause, which an amendment
could supply without touching a constraint. The weaker claim is the one the frozen
text supports, and the stronger one is deliberately not made.

**The system still resolves material ambiguity.** Pre-probe `Δs ≤ 469 bps < ε`
(spec 1.4.13); post-probe `SE5`'s 2000 bps clears `ε = 1500` unaided. What v1.4.20
removes is a signal that could never have contributed, not the ability to reach
`DISCRIMINATED`.

**Nothing observable moves.** No weight is renormalised — the five stand at 3500 /
2000 / 1500 / 1000 / 2000. `SE1`, `SE3`, `SE4`, `SE5`, `ProbeResultDetail`, M28,
`C1`–`C8`, `P_max` and every `§7` threshold are untouched; no population parameter,
seed, split, family, rate, threshold or metric definition changes;
`constraint_set_hash` does not move; benchmark v1.0.3 and `GT_VERSION` 1.1.0 are
unchanged and no dataset exists. `packages/engine` is not created or modified by
this amendment.

### A.28 Spec 1.4.21 / benchmark 1.0.3 — which of two equal answers

**The decision.** An exact `evidence_score_bps` tie is resolved by the
lexicographically smallest **canonical allocation key**: the solution's
`(target_id, member_obs_id)` pairs, sorted, serialised `target_id | member_obs_id`,
joined by `;`. The same order fixes `solution_a` before `solution_b`. Register row
M35.

**Found by implementing, again.** `S4` needs a best and a second-best.
`RECONCILIATION_SPEC.md §6` says *"the best is the one with the highest
`evidence_score_bps`"* and stops there. Three amendments had quietly made that gap
load-bearing: with `SE1` inactive, `SE2` and `SE4` expected-non-binding and `SE5`
zero before a probe, the score **is `SE3` alone** — a function of member lag — so
any two candidates drawn from members sharing a capture day and cycle score
*exactly* equal. `§4.2`'s `F06` builds that population on purpose.

**The specification demanded a deterministic answer without supplying one.** Metric
23 requires identical ledger root hashes across two runs and `DATA_MODEL.md §16`
forbids a result that depends on *"iteration order over an unordered collection"*,
while `IMMATERIALLY_AMBIGUOUS`'s *"accept best"* decides which allocation posts.
Determinism was frozen; the ordering was not. That is the narrow thing this record
ratifies, and it is marked ratified rather than dressed as derivation.

**Why the target is in the key.** `member_obs_ids` alone would collide: a component
may hold several targets, two of equal amount admit the identical member set, and
`§5` defers `C7`'s coupling to *"a single serialized pass after all components are
solved"*, so both are feasible when the tie is broken. The key is the smallest
representation that separates them, and it introduces no quantity `DATA_MODEL.md
§11` did not already carry.

**A second finding, corrected as documentation only.** `§11`'s worked example
states a materiality of ₹1,00,000, and that figure does not reproduce from `§6`'s
`max over AccountCode` formula: the example is an `F08` case with no `AN2` match, so
`P2`/`P4` do not fire, and the unallocated remainder takes `E02`→`P6` for the same
₹1,00,000 either way. The figure is **withdrawn as illustrative**; `§6` is
**unchanged and normative**. Materiality remains generally non-zero in the real
case, because `C6` pins `Σ credit − Σ debit` and **not** `Σ amount` or `Σ fee`,
while `P2` posts on `amount`, `fee − tax` and `tax` — so allocations differing in
fee composition move the control accounts by different totals, and `AMBIGUOUS`
stays reachable. **No new materiality definition was invented to rescue the old
number**, which was the tempting repair and the wrong one.

**Nothing observable moves.** The ranking criterion is unchanged and the tie-break
applies only after exact equality; it never enters `evidence_score_bps`. `ε`, `τ`,
`P_max`, `K_max`, `C_max`, every `SE` weight, `C1`–`C8` and `I1`–`I9` are untouched;
`constraint_set_hash` does not move; benchmark v1.0.3 and `GT_VERSION` 1.1.0 are
unchanged and no dataset exists. `packages/engine` is not created or modified by
this amendment — `S4` remains unimplemented.

---

### A.29 Spec 1.4.22 / benchmark 1.0.4 — the probe that had no source

**The decisions.** `RECONCILIATION_SPEC.md §6.2` names `fetch_settlement_recon`'s
source: the **committed PG-side recon report** `bench/<split>/recon_report.jsonl`,
carrying `settlement_id`, `entity_id` and `settled_at`, with `settlement_id` as
its only query key. The Ambiguity Oracle is **barred** from it (`AL8`) and remains
observations-only. Two sentences written before the consequence was reachable are
corrected. Register row M36; threat row `PREREGISTRATION.md §10` V22.

**The probe had a source class and no source.** `DATA_MODEL.md §12` has said since
spec 1.4.14 that this probe queries the PG's own report *"rather than the
observation set"*, and derived the identifier relation's **partiality** from it:
`PREREGISTRATION.md §4.2`'s `F05` withholds one constituent `recon_line`
**observation** at emission, so a returned `entity_id` may have no observation. No
observation-backed source can satisfy that derivation — the withheld row is absent
from `observations.jsonl` by construction. What was missing was never the class. It
was a file.

**`settlement_utr` was considered and refused — for the second time.** The
alternative was to read the observation set and fall back to
`ReconLine.settlement_utr` matched against `Settlement.utr` where
`DROP_SETTLEMENT_ID` had nulled the key. `§A.17` (spec 1.4.10, M24) evaluated
**exactly that field-pair** as `SE1`'s member-scoped reading and rejected it:
*"`settlement_utr` is read by no normative rule anywhere."* `§A.17` had already
noticed the survival fact the fallback relies on — *"`DROP_SETTLEMENT_ID` nulls
only `settlement_id` … in the singular"*. Adopting it would have falsified a
sentence M24's derivation rests on, by implementation rather than by amendment.
**And it is unnecessary:** `§4.3` models the operator as *"**Merchant-side** recon
copies that lack the PG's batch identifier"* and `§4.1`'s `F08` as *"absent from
**the merchant's copy**"*, so the PG's own report retains the key and it never
fails.

**V22 — the asymmetry is older than the source, and it is intentional.** Naming a
source makes `SE5` able to contribute, and `§10` V20 shows `DISCRIMINATED` was
**unreachable** pre-probe (`Δs ≤ 469 bps < ε`). So ASSAY can now resolve a case the
oracle, reading observations only, calls truly ambiguous — `abstention_recall`
falls, `silent_guess_value_inr` counts correct decisions, and `gap_to_oracle` may
go **negative**. *Derived:* this asymmetry is **not created here**.
`RECONCILIATION_SPEC.md §6`'s `DISCRIMINATED` branch **accepts** when `Δs ≥ ε`
while `PREREGISTRATION.md §5.4`'s ambiguity definition carries **no `Δs` term**, so
every `DISCRIMINATED` decision has been a commit on an oracle-ambiguous case since
spec 1.0.0; spec 1.4.22 makes a frozen branch reachable, nothing more. *Ratified:*
the asymmetry is **intentional** — the oracle stays a fixed observations-only
reference and its labels can never depend on a probe result.

**Letting the oracle read the artifact was rejected on frozen grounds.**
`PREREGISTRATION.md §5.3` scopes the completeness gate to **expressible** targets
precisely *because* `F05` withholds a line. An oracle holding the report would make
those targets expressible, void the scoping, and reduce the gate to a tautology —
checking the constraint set against an answer key rather than against reality, and
destroying the independence `ARCHITECTURE.md §7` exists to establish. `AL8` makes
the bar structural rather than a convention.

**What changed is prose, not formulas.** `PREREGISTRATION.md §5.1` closed with
*"Its input is exactly what every agent receives"*, true while no channel reached
past the observations and false afterwards. `EVALUATION_SPEC.md §4.3` glossed
`silent_guess_value_inr` as *"decisions the system made that it had no evidential
right to make"*, which `Δs ≥ ε` already contradicted. Both are corrected in place
with the superseded wording quoted, and `§4.13` now states that a negative
`gap_to_oracle` is valid and requires metrics 4 and 8 to be reported beside the
probe count. **No metric formula, definition, number or count changes**; the frozen
list stays at **28**; `DISCRIMINATED` is not redefined; **no exploratory second
reference model is added**, `§L.4` would force it to `EXPLORATORY` where it could
support no claim.

**What moves and what does not.** `BENCHMARK_VERSION` **1.0.3 → 1.0.4**, because
the committed benchmark surface gains an artifact. `constraint_set_hash` does
**not** move — `C1`–`C8` are untouched. `GT_VERSION` stays **1.1.0**;
`GroundTruth`'s shape is unchanged. The generated population is unchanged: same
seeds, families, rates, `target_record_count` and composition, and
`observations_sha256` does not move. `SE1`–`SE5` and every `§7` threshold are
untouched. **No dataset is invalidated — none exists**: `bench/` is absent, `runs/`
holds only `.gitkeep`, no manifest, run or root hash has been produced and no
`bench-v1.0.3` tag was ever cut.

**Nothing is built here.** The artifact is specified and scheduled, not written; no
probe executor and no probe loop exist. **Role C remains open** — where the loop
lives, and who owns `P_max` enforcement, pre-call `I6` re-checking, dispatch and
`PROBE` `LedgerEvent` emission. `DATA_MODEL.md §22.2` M31's undecided
date-scoping field and M33's unstated `widen_temporal_window` bound both stand.

### A.30 Spec 1.4.23 / benchmark 1.0.4 — the loop nobody owned

**The decision.** A new package, `packages/probe`, owns the `RECONCILIATION_SPEC.md
§6.2` probe loop as a **pure state machine**: `P_max` accounting, the pre-call `I6`
existence check, construction of the closed five-probe call, and assembly of the
`PROBE` `LedgerEvent` body. It performs **no I/O** and does not call `R3`. It is
inserted in `§L.2` between `engine S4–S5` and `llm`; no existing position moves.
Register row M37.

**This is a RATIFICATION, not a derivation, and the record says so plainly.**
Frozen text derives a great deal — that the loop is not the engine's (`§3`'s *"no
I/O, no network"*, and `§L.2` builds it before `llm`), not the oracle's (`AL1`,
`AL8`), not the generator's (`AL1`/`AL2`), not `domain`'s (no I/O, builds at
position two), not `ledger`'s, and not `apps/api`'s. It also derives that three of
the responsibilities already have owners and are **already built**: `apps/cli`
acquires the data surface (`§3`'s *"all filesystem I/O"*, and spec 1.4.22 made that
surface a file), `packages/domain` validates the result
(`ProbeResultDetailSchema`), and `packages/engine`'s `S4` re-solves
(`SolveInput` already carries `recon_reports`, `probe_attempts` and
`observationIdForEntityId`). **What no frozen clause determines is where the
remaining loop state lives**, and creating a package to hold it is a choice.

**Why `§A.25`'s preference against creating a package does not forbid this.**
`§A.25` chose `packages/domain` for `S0` and gave *"no new package is created"* as a
deciding reason. That was a **tie-breaker among viable homes**, not a prohibition:
its force came from `domain` *"already hold[ing] every per-record part `S0`
performs"*. Here no existing package holds the parts. `packages/llm`'s `§3` row is
the provider interface, the four roles, the cache and output verification;
`packages/eval`'s is measurement; `packages/engine`'s excludes I/O and builds too
early. `§A.25` also **rejected `apps/cli` for `S0` on a count that applies again** —
*"it does not appear in `§L.2`'s build order at all"* — and here that count is
sharper, because `packages/eval`'s agent runner must drive the same pipeline
(`ARCHITECTURE.md §10`) and cannot import an app, so a loop in `apps/cli` would be
**forked**, against `§10`'s own validity argument. `§A.25` weighed the same three
options and reached a different answer because the facts differ; applying its
tie-breaker where its premise fails would be cargo-culting the conclusion.

**Purity is load-bearing, not stylistic.** The loop emits a request and consumes a
response, so it imports `engine`, `domain` and `ledger` types and **nothing else** —
which is what lets it sit before `llm` and keeps the build order acyclic. It is the
pattern `§L.1` rule 4 already runs for `journal.ts`, *"a pure posting function over
a **proposed** allocation"*, and the one `S4` runs when it returns an undecided seam
rather than a fabricated default.

**Security: the four `§T7` controls stop being split.** `packages/probe` is the
**only** constructor of a probe call, and the call is a closed union over `§6.2`'s
five probes with **no URL or host type anywhere in the path** — so on spec 1.4.22's
filesystem-backed surface `§T7`'s SSRF control is a property rather than a check.
Pre-call `I6` lives here, separate from `packages/llm`'s boundary-2 allowlist as
`§L.1` rule 8 requires (*"independently of any allowlist check"*) and separate from
`S5`'s post-hoc `I6`. `P_max` is counted here against `packages/engine`'s frozen
constant. A caller that skipped the loop would have **no way to build a probe call**.

**One layer, not two.** `§6.2` names a committed file as the source; `§C` T0-11
requires the pipeline to run *"from a clean checkout with no API key"*; and `§H`
puts a live Razorpay adapter at tier **H3** with *"near-zero evaluative value"*. **No
frozen text requires an abstraction over a future live API**, so none is built.

**The name is an implementation convention.** The repository establishes none.
`probe` follows the short-domain-noun convention of `money`, `domain`, `engine`,
`ledger`, `oracle`, `llm` and `eval`, and names the section it implements. Nothing
turns on it.

**Nothing observable moves.** No population parameter, seed, split, family,
`target_record_count`, rate, threshold or metric definition changes; the frozen
metric list stays at **28**; `C1`–`C8` and `SE1`–`SE5` are untouched so
`constraint_set_hash` does not move; **`BENCHMARK_VERSION` stays 1.0.4** and
`GT_VERSION` stays **1.1.0**; no benchmark artifact changes and no data exists to
regenerate. Spec 1.4.22's probe source is preserved verbatim.

**What this does NOT settle.** `R3`'s probe-selection policy; the recon endpoint's
date-scoping field (M31); `THREAT_MODEL.md §T7`'s numeric `days` bound (M33); any
live-API semantics; any new metric; and `§6`'s undecided
`A2_MIDDLE_CASE_UNSPECIFIED` seam, which is **surfaced rather than replaced** — no
new terminal reason is invented for a loop that stopped on `NO_USEFUL_PROBE` with
budget remaining.

### A.31 Spec 1.4.24 / benchmark 1.0.4 — three properties the recon report needed

**The decision.** `RECONCILIATION_SPEC.md §6.2` fixes three properties of the
PG-side recon report that spec 1.4.22 named the artifact without settling: rows are
ordered by **`entity_id` ascending**; rows whose `settlement_id` and `settled_at`
are `null` are **included**; and the **offline seal may read** the artifact to
compute `recon_report_sha256`. Register row M38. Nothing is generated: no dataset
existed when this was written, which is why the order could still be chosen at all.

**Two of the three are derivations and are recorded as such.** The null rows follow
from two frozen sentences meeting: `PREREGISTRATION.md §4.2` emits a member its
batch cannot carry as *"UNSETTLED"* with `settlement_id: null`, and `DATA_MODEL.md
§6` fixes `settled_at` as *"`null` exactly when no settlement carried the line"* —
so such a line is a `ReconLine` the simulation produced, and `§6.2`'s *"one row per
`ReconLine` the simulation produced"* admits it. The counter-argument — that
`settlement_id` is *"its only query key"*, so the row is unreachable — confuses
**membership** with **reachability**; `§6.2` states the two as independent sentences
and neither qualifies the other. The report already holds a row the observations do
not, which is `F05`'s whole point; holding one no query returns is the same species
of fact.

The seal read follows from `AL8`'s own scope. Its binding sentence names **engine
and oracle code**, and it is verbatim `AL2`'s — under which the seal already hashes
`ground_truth.jsonl` inside `ARCHITECTURE.md §10`'s *"generator's trust zone,
offline, before any agent exists"*, at a call site that has existed since `apps/cli`
landed. `AL8`'s *"reachable **only** through the probe executor, under `P_max`"* is
a statement about the evidence path available to an **agent**: `EVALUATION_SPEC.md
§2` uses that exact phrase to define *"an agent's inputs"*, and `ARCHITECTURE.md §4`
boundary 1 uses it of quarantined text that the generator nonetheless writes to a
file nobody claims it may not write. Opening bytes to digest them is not making them
reachable — the seal spends no `P_max`, runs before any agent exists, and a SHA-256
carries no `constituent_entity_id` into any decision.

**The order is a RATIFICATION, and the record says so.** No frozen rule determined
it. `PREREGISTRATION.md §7` requires a regeneration at the same seed to be
byte-identical, which constrains **determinism** but not the **choice** — any
deterministic order satisfies it. Three candidate derivations were tested and all
fail: the observation emission order is frozen nowhere and is in any case undefined
for this artifact, since an `F05`-withheld row has no position in the observation
stream; `DATA_MODEL.md §0`'s canonical traversal is scoped to `true_journal` by its
own words and keys on `seq` and `account`, neither of which this artifact carries;
and `§16`'s ordering governs `LedgerEvent`. Choosing was therefore unavoidable, and
choosing silently because a candidate happened to be deterministic would have been
the failure this register exists to prevent.

`entity_id` ascending is chosen because it is **total and never null** in this
artifact, so it needs no null-ordering rule — which ordering by `settled_at` or
`settlement_id` would, both being nullable here, and each of which would have forced
a second ratification about where nulls sort. It also matches the nearest existing
conventions: `DATA_MODEL.md §0` breaks its own ties by `source_entity_id` ascending,
and the oracle and engine already sort identifier sets ascending. **The order
carries no meaning**: `§6.2`'s query selects on `settlement_id` and `SE5` is a set
measure, so no rule reads a row's position. It is fixed only so the bytes, and
therefore `recon_report_sha256`, are stable.

**What was rejected.** Widening `GENERATOR_TRUST` to cover the artifact — the
one-line alternative to a seal-scoped permission. It was rejected because that zone
is claimed by **both** the completeness gate and the seal, and `PREREGISTRATION.md
§5.3` and `§10` V22 require the completeness gate never to hold the report: an
oracle or gate holding it would void `§5.3`'s expressibility scoping and make the
gate tautological. Widening the shared zone would have left that guarantee resting
on the fact that no gate call site happens to use it today. A distinct seal
permission keeps it structural.

**What does not change.** Every metric formula, definition and number; the 28-metric
list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5`; every `§7`
threshold; `§18`'s `BenchmarkManifest`; the population, seeds, families and rates;
`BENCHMARK_VERSION` 1.0.4; and `GT_VERSION` 1.1.0. **`M31`'s date-scoping field
remains open** and is not resolved here — it governs `fetch_settlement_recon`'s
`date` argument, which is the dispatch's business rather than the artifact's.

### A.32 Spec 1.4.25 / benchmark 1.0.5 — the control arm nobody had frozen

**The decision.** Four items, taken together because they are one seam. `A3-NOLLM`'s
**static probe priority policy** is stated and frozen into `PREREGISTRATION.md §7`
(register row M39). `R3`'s **proposable action set** is fixed at the four
id-argument probes plus `NO_USEFUL_PROBE`, excluding `widen_temporal_window`
(M40). `DATA_MODEL.md §13`'s `AmbiguityCertificate.reason` gains a **fourth and
final** member, `NO_USEFUL_PROBE_AVAILABLE`, closing `RECONCILIATION_SPEC.md §6`'s
`A2` middle case (M40). And a rejected probe proposal **terminates the loop**, an
implementation convention recorded at `ARCHITECTURE.md §12`. Nothing is generated
and nothing is implemented: `R3` does not exist in either arm, which is precisely
why the policy could still be frozen honestly.

**The one that mattered most was invisible.** `ARCHITECTURE.md §6.5` has called the
`offline` provider's `R3` a *"static probe priority list"* since spec 1.0.0, and
`RECONCILIATION_SPEC.md §6.2` has made that list the **comparand** of *"whether the
LLM's probe selection beats a static priority list (`A3-NOLLM`)"* for just as long.
**No document ever stated the list.** Six sites recorded it open and none supplied
it. That is not a missing detail: `A3`'s probe spend decides `A3`'s own figures for
metrics **1, 2, 3, 4, 6, 8** and **9**, all primary, so an unstated policy is an
outcome-bearing decision parameter of a **scored control agent** — and `§L.4`'s bar
on result-driven change reaches only *"any frozen threshold or decision parameter
listed in `PREREGISTRATION.md §7`"*, which this was not. An implementer could have
authored the list, seen dev figures, and revised it, violating no frozen rule and
moving the denominator of the only claim `§H` tier H1 exists to make.
`EVALUATION_SPEC.md §3.2` requires an ablation to differ from ASSAY *"in exactly one
respect"*; unfrozen, `A3` differed in two — the provider, and a hand-authored
policy.

**It is a RATIFICATION, and the record says so.** No frozen clause determines an
ordering; three candidate derivations were tested and none survives as more than an
argument. The values were chosen on frozen consumer facts rather than on taste:
`fetch_settlement_recon` leads because `SE5`'s 2000 bps is the only route above
`ε = 1500` (`PREREGISTRATION.md §10` V20) while `SE2` (spec 1.4.20) and `SE4` (spec
1.4.11) are declared expected-non-binding, so it is the only probe that can move a
decision on this population; the remaining three follow `§6.2`'s own declaration
order among equals, which needs no new fact. **Argument selection is the half that
would have been missed**, and it is not derivable from an ordering: which
`settlement_id` a probe names decides what the report returns, hence `SE5`, hence
`Δs`, hence commit-versus-abstain. Lexicographically smallest is chosen because it
is **total, order-independent and admits no human or model choice at the moment of
selection** — the property `AL7`'s successor rule was written for, and the property
enumeration order and wall-clock order both lack. `DATA_MODEL.md §16` and metric 23
already forbid enumeration order from supplying an outcome, which `§A.28`'s M35
found for tie-breaks and which applies here unchanged.

**Frozen on stricter terms than the weights, deliberately.** `PREREGISTRATION.md §7`
lets the `SE1`–`SE5` weights be adjusted on TRAIN and DEV before the seal. The
priority policy is **not** covered by that permission and `§7` now says so: the
weights rank candidates inside one agent, while this policy parameterises the
**control** the system under test is measured against. It is bound by `AL3`, listed
in `§L.1` rule 12, and unadjustable on TRAIN, DEV and TEST alike. R1's regex battery
and R2's classifier are **not** pre-registered this way and do not need to be —
R1's output is verified against its input by substring grounding and R2's is scored
against a known cause by metric 10; neither is a denominator.

**The days conflict resolved without touching `§L.1` rule 2, and that is the whole
point.** `RECONCILIATION_SPEC.md §6.2` declares `widen_temporal_window(days)` and
`DATA_MODEL.md §12` types `days` as `integer > 0`; rule 2 forbids a numeric field in
any LLM output schema and sits under *"invariants that may never be violated"*. The
apparent contradiction dissolves on reading which proposition is settled. Rule 2 is
settled, absolute and doubly enforced. Whether `R3` may propose this probe is
**expressly unsettled** — `§6.2`, `THREAT_MODEL.md §T7` and register row M33 each
say so in terms. A settled invariant governs an unsettled question, so the question
resolves in the only direction that preserves the invariant. **Rule 2 is unchanged
and unweakened, and no `days` constant is invented.**

**Two alternatives were tested and both fail on frozen text, not on convenience.** A
**string numeral** satisfies rule 2's letter and defeats the mechanism rule 2 exists
to enforce: `ARCHITECTURE.md §4` boundary 2 says *"where a quantity is needed, the
model returns an **identifier** and deterministic code **looks up** the value"*, and
a numeral a caller parses is neither an identifier nor looked up in anything. A
**symbolic token with a deterministic mapping** is boundary 2's own mechanism, and
fails on the table rather than the shape: its values exist in no document, three
sections have expressly declined to supply one, and the single figure frozen text
does derive — M33's *"the widening required for completeness is **zero days**"* — is
excluded by `§12`'s own `integer > 0`. The frozen derivation and the frozen schema
are mutually exclusive at the only derivable point. Amending rule 2 was rejected as
disproportionate: it would weaken a trust boundary to admit a probe M33 already
reports as expected-non-binding on this population and whose result spec 1.4.15 bars
from feeding `SE5`.

**The enum is not narrowed and the probe is not deleted.** `DATA_MODEL.md §12` keeps
five `ProbeResultDetail` variants, `§6.2` keeps five probes, and `THREAT_MODEL.md
§T7`'s *"closed enum of five read-only operations"* is untouched — the executor's
enum and the set of actions **one proposer** may name are different sets, and only
the second is decided. `§T7`'s numeric hard bound **remains unspecified**; it is now
unreachable through `R3` rather than supplied. Both arms use the same four-probe
schema, which is what keeps `EVALUATION_SPEC.md §3.2`'s attributability intact — an
asymmetry in proposable actions would itself have been a second difference.

**The `A2` middle case had to close here, and spec 1.4.23 said as much.** `§6.2`
wrote *"No new terminal reason is invented for a loop that stopped on
`NO_USEFUL_PROBE` with budget remaining; that gap is `§6`'s and remains open"* at a
point when nothing could reach the state: no proposer existed, `attempts` was always
`0`, and the interval `0 < attempts < P_max` was empty. This amendment makes it
reachable in **both** arms — a model may decline after spending one or two probes,
and M39's policy returns the same token when no priority entry is constructible — so
this is the amendment that must close it. `DATA_MODEL.md §13`'s union was a **closed
three-member** type: without a fourth value the state is not merely undefined, it is
**unrepresentable**, and no defaulting could have hidden that. The mapping is now
total over `attempts`. **No fourth unrelated reason is added**, no existing reason
is re-pointed, the certificate is still emitted **iff** `ABSTAINED`, and `§16`'s
hashed `body` projection and genesis are unchanged — `reason` already entered the
hashed body through `certificate`.

**`N1` is labelled a convention because that is what it is.** A well-formed proposal
that `packages/probe` rejects before budget is spent terminates the loop for that
component; it is not re-issued, `attempts` does not move, and the terminal reason
follows from the resulting state. The alternative is not neutral: an unchanged loop
state yields an unchanged `input_hash`, hence an unchanged `cache_key`, hence the
identical rejected proposal forever under `--llm=replay` and `--llm=offline` alike.
It writes no value, adds nothing to `§7` or `AL3`, and is recorded at
`ARCHITECTURE.md §12` beside the other failure dispositions rather than in a frozen
block.

**What this does NOT settle.** `M31`'s date-scoping field, which the policy never
reads. `M33`'s `days` bound, now unreachable through `R3` but still unstated.
`R3`'s own selection policy in the `replay` and live arms — that is the model's
output and is not a frozen constant, which is the entire point of the comparison.
And one thing worth stating plainly: **`abstentions resolved per probe spent` is not
on `PREREGISTRATION.md §8`'s frozen list of 28**, and `EVALUATION_SPEC.md §4.13`
says it is *"not a new quantity that could support a claim"*. `§H` tier H1's
evidence therefore runs through **metric 24 `offline_parity`** — which `§E.6` already
names *"the pre-registered form of the AI-necessity claim"* — plus the ASSAY-versus-`A3`
deltas in the primary metrics, with the probe ratio reported beside them as
provenance and labelled `EXPLORATORY`. **No metric is added here to fix that**;
doing so would be a benchmark amendment made because a claim wanted one.

**What does not change.** Every metric formula, definition and number; the 28-metric
list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5`; every `§7`
threshold including `P_max = 3`; `DATA_MODEL.md §18`'s `BenchmarkManifest` **shape**;
the population, seeds, families and rates; and `GT_VERSION` **1.1.0**.
`BENCHMARK_VERSION` moves **1.0.4 → 1.0.5**, because the pre-registered parameter set
gains a control-arm policy and the certificate gains a legal value. **`§L.1` rule 2
is unchanged and unweakened**, and the four sentences of `§L.5` remain true —
sentence 4's *"cannot express a monetary amount"* is strengthened, not qualified, by
`R3` losing its one numeric argument.

### A.33 Spec 1.4.26 / benchmark 1.0.5 — the experiment that cannot fail its control

**The decision.** `§H` tier **H1**'s affirmative claim is withdrawn: on the
conforming v1.0.0 population, *"whether the LLM's probe selection **beats** a static
priority list"* (`RECONCILIATION_SPEC.md §6.2`) is **not answerable**. Threat row
`PREREGISTRATION.md §10` **V23**, register row **M41**. **Documentation only.**
Nothing is generated, nothing is implemented, and no probe source is added.

**This was found by audit before any data existed, which is the only time it could
have been found honestly.** Had it surfaced after a sealed run, the difference
between *"we disclose a degenerate experiment"* and *"we explain away a null
result"* would have been invisible to a reader and nearly invisible to us.

**The cause is choice-set cardinality, and every input to it is already frozen.**
Five clauses compose, and this amendment changes none of them:

```
  §11.1 (1.4.4)    a bank_line target has the EMPTY candidate set
                     -> only a SETTLEMENT target reaches §6.2's probe loop
  §11.1            a settlement target carries exactly ONE settlement_id
  §4.2  SE5        target-scoped: a report whose settlement_id is not the
                   target's contributes nothing
  M36   (1.4.22)   fetch_settlement_recon is the ONLY probe with a source
  §4.5             net_cost_inr has NO probe term, and neither does any other
                   metric on §8's list of 28 -- a probe is FREE
```

So every `AMBIGUOUS` component offers **one** probe, with **one** reachable
argument, at **zero** cost — and spec 1.4.17 makes repetition idempotent
(*"Repeating a probe adds nothing; a result that returns nothing removes
nothing"*). `PREREGISTRATION.md §7`'s frozen policy takes that action every time,
and it is **weakly dominant**: a proposer can match it, decline and forgo the only
evidence above `ε` (`§10` V20), or spend budget that buys nothing. **A maximisation
over a one-element choice set cannot be beaten.** The two arms can still differ —
but only in the model's disfavour, which is a one-sided measurement and not the
comparison `§6.2` describes.

**The three missing probe sources are a red herring, and supplying them would not
repair H1.** `fetch_payment` and `fetch_refund` are **redundant**: `method`,
`card_network`, `card_issuer` and `card_type` sit on every `recon_line` payload and
on the `payment` observation; a refund `recon_line` carries its parent `payment_id`
(`§22.1` D14); and `PREREGISTRATION.md §4.3`'s `DROP_FIELD` is **not exercised**, so
nothing removes them. `fetch_order` is genuinely different — `receipt` is quarantined
and no normative rule reads it — but its **only named consumer `SE2` is
expected-non-binding** (spec 1.4.20), because `order_ref` lives only on
`MerchantLedgerEntry` and no frozen clause pairs one with a candidate, component,
target or probed order. A fetched `receipt` would have nothing to compare against.
**No probe source is added here**, and `DATA_MODEL.md §12`'s five variants are
unchanged.

**The `A3-NOLLM` policy stays exactly as `§L.1` rule 12 and `PREREGISTRATION.md §7`
freeze it, and this is the part it would be easiest to get wrong.** The tempting
move is to widen the policy — offer more probe kinds, more arguments — so that a
choice exists and H1 becomes measurable. That is **forbidden and would be
disqualifying**: it revises a control-arm parameter *after* observing that it is
optimal, which is precisely the result-driven change `§L.4` bars and `AL3` binds
against. The policy is not defective. It is correct, total, and optimal on this
population; the population is what has no decision in it.

**This is the `C8` treatment, applied for the first time to an experiment rather
than a clause.** `§4.1` has retained a declared-but-inert constraint and reported
that it does nothing since spec 1.0.0; spec 1.4.10 did it for `SE1`, 1.4.11 for
`SE4`, 1.4.20 for `SE2`. H1 gets the same disposition: **declared, reported inert,
not deleted, not tuned.**

**What is withdrawn is a claim, not a capability.** `R3`, `packages/probe`'s loop,
the `§6.2` dispatch and `§6.6`'s composition are built, tested and correct, and the
full suite is green. `--llm=offline` still runs the whole pipeline. Nothing is
un-built and no code is touched by this amendment.

**What still stands, and is not weakened.** `metric 24` `offline_parity` remains
valid for the purpose `§E.6` gives it — *"the pre-registered form of the
AI-necessity claim: measured, not asserted, **including the outcome where the model
contributed nothing measurable**"* — and `R1` and `R2` have live, discriminating
roles that it measures. Every metric on `PREREGISTRATION.md §8`'s list of **28**
stands for its stated purpose. `A1-NOVALIDATE` and `A2-NOABSTAIN` are untouched, and
with them `PROJECT_SPEC.md §7`'s `S6` — **no success criterion depends on H1**.
**`abstentions resolved per probe spent` is NOT added to the 28 and stays
`EXPLORATORY`**, exactly as `EVALUATION_SPEC.md §4.13` already requires: *"not a new
quantity that could support a claim"*.

**What the report must and must not say.** It must not assert that ASSAY's probe
selection beats the static list, or that H1 supplies AI-necessity evidence. It must
report V23 as a declared threat, state that `R3`'s decision space is a singleton on
v1.0.0 data, and publish the probe count and `metric 24` as the pre-registered
figures they are.

**Population-specific, and no future policy is decided.** The limitation follows
from the v1.0.0 family composition and `§11.1`'s target universe. A future family or
amendment producing a component with **several independently probeable
`settlement_id`s** would restore a genuine choice and with it H1's power. Whether to
build one is **not decided here**, and deciding it after a result would carry the
same `§L.4` problem this row exists to avoid.

**What does not change.** Every metric formula, definition, number and the 28-metric
list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5` and their weights;
every `§7` threshold **including the `A3-NOLLM` priority policy**; `DATA_MODEL.md
§13`'s four certificate reasons and `§12`'s five probe variants; `§18`'s
`BenchmarkManifest`; the population, seeds, families and rates; every
`PROJECT_SPEC.md §7` success criterion; `BENCHMARK_VERSION` **1.0.5**; and
`GT_VERSION` **1.1.0**. No package implementation is modified.

### A.34 Spec 1.4.27 / benchmark 1.0.6 — the unit nobody stated and the gate nobody could run

**The decision.** Two ratifications. **M42:** the committed **dataset artifact unit
is `(split, seed)`** — `bench/<split>/<seed>/` holds `observations.jsonl`,
`untrusted_text.jsonl`, `ground_truth.jsonl`, `oracle_labels.jsonl`,
`oracle_gate.json` and one `benchmark_manifest.json` — and **family is a composition
dimension, never a file dimension**. `bench/<split>/recon_report.jsonl` **does not
move**. **M43:** **`apps/cli` executes both `PREREGISTRATION.md §5.3` gates**, the
pure gate implementations staying exactly where `§K` puts them, and a missing or
failing completeness gate becomes a **SEAL FAILURE**. Threat row
`PREREGISTRATION.md §10` **V24**. `BENCHMARK_VERSION` **1.0.5 → 1.0.6**.

**Both were found by audit before any data existed, which is the only time either
could have been found cheaply.** The generator, the engine, the probe loop, the
oracle, the scorer and seven CLI commands were all built and green — 1,914 tests, no
type errors — and the sealed-run path still could not be walked end to end. That is
the characteristic shape of a specification gap rather than a defect: every component
satisfies its own contract, and the contract between them was never written down.

#### M42 — the artifact unit

**The gap, stated exactly.** `PREREGISTRATION.md §9` step 4 hashes four **singular**
filenames into **one** manifest, and no document said which files those were.
`assay generate` had answered it at the keyboard — one artifact per **family**, at
`<split>/<seed>/<family>/` — a level **no frozen document introduces anywhere**.
`assay seal` took one path per artifact class. The two were never reconciled because
nothing forced them to be: `buildManifest` computes `§9` step 5's 10,000–20,000 band
from the **declared** `target_record_count`s, not from the bytes it hashes, so
sealing against a single family's file would have passed every check while
`record_counts` and `families` claimed all six. **The failure mode was a silently
valid manifest binding the wrong bytes**, which is worse than a loud one.

**The unit is derived, not chosen.** `§4.1` already reads `record_counts` *"per seed
range"* and already defines a dataset as one *"`(split, seed)` dataset [that] holds
exactly the families `§6.1` assigns to that seed's range"*; `EVALUATION_SPEC.md §2`
loops `for seed in seeds(split)` with **no family loop**; `ARCHITECTURE.md §10` scores
`metrics.json` per `(agent × seed × split)`; `PROJECT_SPEC.md §9` bounds *"one
`(split, seed)` dataset"*. Four documents agree and none mentions a family file.

**Why the recon report does not move, and why that is not an inconsistency.** It is a
**probe response surface**, not a dataset artifact: `DATA_MODEL.md §12` and
`RECONCILIATION_SPEC.md §6.2` make it *"never an `Observation`, and never ingested"*,
and `settlement_id` — *"its only query key"* — is unique across every family and seed.
A lookup table has nothing to partition. **This is precisely why M36 could ratify a
location for this one artifact while no document ever gave one for the other three**,
and the asymmetry is now stated rather than left for a reader to reconstruct. M36 and
M38 are preserved verbatim; `entity_id` ascending now holds over the merged split
artifact, which is what M38's order was already for.

**Split-level aggregation of the dataset artifacts was considered and rejected.** It
reads `bench/<split>/recon_report.jsonl` most literally and matches `§K`'s single
`benchmark_manifest.json` — but `DATA_MODEL.md §10`'s `Observation` carries **no seed
and no family**, so a split-level `observations.jsonl` could not be partitioned back
into the runs `EVALUATION_SPEC.md §2` scores. Repairing that means adding a
discriminator to `Observation`, which moves `§10`'s shape, `GT_VERSION` and every
artifact byte. **A larger amendment to reach the same seal is not the smaller one**,
and `§18`'s plural `seeds` is left standing rather than retyped: the field admits a
set, this fixes the cardinality one manifest carries, and `§4.1`'s derivation from
the type is untouched.

**A family-granular manifest was rejected outright.** `§18`'s `record_counts` is a
map **over** families **inside one** manifest, and `§9` step 5's band is a **sum**
over a seed's families — 2,621 for one family against a 10,000 floor. It contradicts
the frozen text rather than merely underfitting it.

**The aggregation order is a RATIFICATION and the record says so.** No frozen rule
determined one. `§7` requires byte-identical regeneration at the same seed, which
constrains **determinism** and not the **choice**; `conventions.ts`'s
`U-EMISSION-ORDER` carries `spec_basis: null` and orders **within** one family
instance; and `§A.31` already found, for the recon report, that *"the observation
emission order is frozen nowhere"*. That finding applies unchanged here. Choosing
silently because a candidate happened to be deterministic is exactly the failure the
provenance register exists to prevent, so: **F01..F10 ascending**, each family's own
row order preserved, **concatenation and never canonical reserialization** so
`§6.2`'s and `§10`'s declaration key order survives, UTF-8 with a trailing newline.

**`source_line` re-basing is forced, not stylistic.** `U-SOURCE-FILES` numbers lines
1-based **within the logical file**, per family instance, so a naive concatenation
puts six observations at `pg_recon.jsonl` line 1 inside one dataset — against
`ARCHITECTURE.md §4`'s *"Nothing enters the system anonymously."* It is **free of
hash consequences**: `ingest_hash` covers the canonical **payload** alone, so no
`ingest_hash`, no `inputs_hash` and no ledger body moves. **The re-basing is the
generator's**, not the CLI's: `ARCHITECTURE.md §3` bars `apps/cli` from performing an
`S0` transform and provenance stamping is `RECONCILIATION_SPEC.md §2` step 5, so the
package that owns `U-SOURCE-FILES` owns the renumbering and hands `apps/cli` rows —
the same split spec 1.4.24 already used for the recon report.

**What is deliberately not tightened.** `DATA_MODEL.md §0` rule 3's cross-family
identifier uniqueness stays the probabilistic property the minter already
characterizes — asserted within a family instance, astronomically unlikely to fail
across them at 62^14. Promoting it to an invariant would add a check no frozen rule
requires and would dress a probability as a guarantee.

#### M43 — the gate owner

**The gap, stated exactly.** `§9` step 3 says *"Step 3 is a gate, not a formality"*
and `§5.3` calls both gates *"hard build gates"*. `completenessGate` existed, was
correct and was tested; **no command could invoke it.** `assay oracle` wrote labels,
had no `--ground-truth` input, and exited 0 unconditionally. `assay seal` read no gate
result. So a MUST-PASS gate had no execution path, and a seal taken without it was
indistinguishable from one taken after it. That is not an implementation omission
alone — **it is a control that existed only in prose.**

**The owner is derived.** `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem
I/O"*; neither gate's package performs any, and both modules already name their
caller — `completeness-gate.ts`: *"`apps/cli` performs the read"*;
`consistency-gate.ts`: *"performs no sampling and no I/O … the caller draws the pairs
and `apps/cli` reads the split"*. The exclusions are equally derived: the completeness
gate cannot be `packages/eval`'s, since `§K` places it in `oracle/src/` and `§L.2`
builds `oracle` **before** `eval`; and neither gate can be its own package's, `AL2`
barring oracle code from ground truth and both packages performing no I/O at all.
**No gate logic moves.** `§L.2` records that *"`apps/cli` is absent from this line"*,
so it sits outside the build order and importing `packages/eval` opens no cycle.

**The split asymmetry was already the rule.** `§5.3` and `ARCHITECTURE.md §7.3` scope
the consistency gate to *"pairs drawn from the dev split"* — a **build** gate — while
the completeness gate *"runs on every dataset before any agent sees it"* and `§9` step
3 makes it a **seal** gate. `EVALUATION_SPEC.md §7` writes *"# gates must pass"* for
dev and `§9` step 3 *"# completeness gate MUST pass"* for test. The two spellings were
never inconsistent; nothing had read them together.

**Access is restated, not widened.** Ground truth reaches the completeness gate
through `GENERATOR_TRUST` alone, the route `AL2` has permitted since `apps/cli`
landed, and `AL5` withdraws it under `--sealed` **for the two readers that zone then
held, the `§5.3` completeness gate and the `§9` seal** — so neither gate runs sealed,
and `§9` step 3 correctly carries no such flag. **Narrowed to those two at spec 1.4.34
(`§A.41`, register row `DATA_MODEL.md §22.2` M56):** `AL5` is an **emission** rule and
withdraws no route from the **scorer**, which `§9` step 7 runs sealed. `recon_report.jsonl` reaches **neither**
gate: `AL8` says its seal-scoped permission *"does not extend to the `§5.3`
completeness gate, which stays observations-only"*, and `§10` V22 rests on that. **The
consistency gate never receives ground truth** and gains no parameter for it; a
differential test that consulted the answer key would measure nothing.

**On test, aggregate only.** `AL4` bars inspection of TEST outputs before the sealed
run and `AL7` burns the seed on a breach, so `oracle_gate.json` on the test split
carries counts, per-family tallies and the pass bit — never a `target_id` and never a
`member_obs_ids`. A gate that named a failing target would be performing the
inspection itself.

**Sequencing is a procedure; a seal precondition is a control.** `§9` step 5 gains one
check, and it is the check that makes step 3 mean what it says.

**What is deliberately left open: the `R = 20,000` draw.** `§7` freezes `R` and
freezes **no sampler and no seed**. Deriving one from the dataset seed was available,
cheap and deterministic — and would have been a choice made silently because a
candidate happened to be deterministic, which is the failure M38's own record names in
terms. It is therefore **not taken**. The draw's seed is an operator input, the
command **fails closed** without one, and the seed is recorded beside the result so a
gate run always names the draw that produced it. `§10` **V24** carries the disclosure.
This binds the **dev build gate only**; the `§9` seal path is completeness-only.

**The command surface is the frozen text's own.** `§9` step 2 writes
`--seeds 9000-9004,9100-9104` and `EVALUATION_SPEC.md §7` writes `--seeds 2000-2004`,
so the seed argument is a comma-separated list of declared seeds and inclusive
`lo-hi` ranges. **No new syntax is invented** — this records the spelling both
documents already use, and `§6.1`'s split table stays the sole authority on which
seeds exist. **`assay generate --split test` remains refused**: `§6.1`'s forbidden
list bars *"invoking `--split test` for any purpose"* before the seal, and nothing
here lifts it. That the seal procedure's own step 2 is therefore still not executable
is a **separate** open item, deliberately untouched by this amendment.

**What does not change.** Every metric formula, definition, number and the 28-metric
list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5` and their weights;
every `§7` threshold including the `A3-NOLLM` priority policy; `AL1`–`AL8`;
`DATA_MODEL.md §10`'s `Observation`, `§13`'s four certificate reasons, `§12`'s five
probe variants and `§18`'s `BenchmarkManifest` **shape**; `§6.1`'s split and seed
table; `§4.1`'s composition and every `target_record_count`; every `PROJECT_SPEC.md
§7` success criterion; §H's **H1** disposition, which is not reopened; and
`GT_VERSION` **1.1.0**. **No dataset exists to regenerate** — `bench/` is absent,
`runs/` holds only `.gitkeep`, and no manifest, run, root hash or `bench-v1.0.5` tag
was ever produced.

### A.35 Spec 1.4.28 / benchmark 1.0.7 — the seed that had to be chosen, not derived

**The decision.** The `PREREGISTRATION.md §5.3` consistency draw is frozen into
`§7` and bound by `AL3` — **sampler and seed together** — with
`CONSISTENCY_DRAW_SEED = 417203`, `R = 20,000` **unchanged**, and one independent
draw per `(dev, seed)` dataset. Register row `DATA_MODEL.md §22.2` **M44**; threat
row `PREREGISTRATION.md §10` **V25**, closing **V24**. `BENCHMARK_VERSION`
**1.0.6 → 1.0.7**.

**The condition that makes this legitimate is an ordering, and it holds.** The
value was fixed **before any dev consistency-gate result existed**: `bench/` was
absent, no dev dataset had been generated, and `assay oracle --split dev` had
never been run. Nothing could have informed the choice, which is the only state in
which an arbitrary constant can be frozen honestly. Spec 1.4.27 made the command
fail closed precisely to preserve that state until a governance gate could use it.

#### Why nothing could be derived

Spec 1.4.27 (§A.34) left this open deliberately, and the reason it gave is the
reason it stays true: deriving a seed from a `§6.1` dataset seed *"would be a
choice made silently because a candidate happened to be deterministic"*. Made
concrete, at least four derivations were available —

```
  Prng.fromSeed(dataset_seed)              Prng.fromSeed(dataset_seed + 1)
  substream(dataset_seed, family, stream)  Prng.fromSeed(sha256(dataset_seed))
```

— and **no document selects among them**. A derivation nobody can check against a
clause is a choice with a derivation's manners. Two further grounds close it:
`substream(seed, family, stream)` is the **generator's phase namespace** and a
gate is not a generation phase, so a name added there would couple a build gate to
benchmark generation; and a `§6.1` seed is fixed by `§7` for **generation**, so
reusing one would give a single integer two unrelated jobs and make a change to
the split table silently change what the gate tests.

**The vendored PRNG is shared and the stream namespace is not.**
`ARCHITECTURE.md §11` fixes xorshift128+ as the project's generator, and
`EVALUATION_SPEC.md §5.2`'s bootstrap already reaches it through the plain
`Prng.fromSeed` constructor on the stated ground that *"a second PRNG would be a
second thing to keep deterministic"*. The draw does the same. Sharing an algorithm
is not coupling; sharing a seed space would be.

#### Why the sampler had to be frozen with the seed

A seed selects a path through a PRNG stream. It selects **pairs** only in
combination with the procedure that consumes the stream — so freezing `417203`
over a free sampler would have frozen nothing:

```
  member-set bound   1..4 today; change it and the same seed draws other members
  draw order         target -> size -> members; reorder and the whole path shifts
  pools              target-kind and member-eligible; narrow either and the
                     indices land elsewhere
  words per draw     one per index; consume two and every later pair moves
```

`ARCHITECTURE.md §7.3` names *"the sampler and seed"* as the pair that was
unspecified, and `§7` now carries both. **A frozen seed over a free sampler is
vacuous**, and recording that is the substance of M44 rather than the number.

#### Why the stricter terms

`§7`'s permission to adjust *"on the TRAIN and DEV splits before the seal"* is
scoped, in its own words, to **the `SE1`–`SE5` weights**. Those rank candidates
inside one agent, and a poor choice *"degrade[s] abstention precision"* — a
reported figure a reader can see and weigh. **This parameter decides a hard build
gate's pass criterion, and a poor choice is invisible.** The report line reads
*"consistency: passing"*; a reader cannot see which pairs went untested, and an
author who re-rolled after a failure would have concealed an engine/oracle
divergence — the one thing `ARCHITECTURE.md §7.2` says the gate exists to make *"a
checked property rather than a claim"*. It therefore takes the `A3-NOLLM`
treatment (M39): `AL3` binds it, `§L.1` rule 12 lists it, `§L.4` forbids changing
it on an observed result, and it is unadjustable on TRAIN and DEV. An override
survives for local exploration, is explicitly **non-authoritative**, and is
**refused on a sealed or official run**.

#### The precedent that was considered and not followed

`EVALUATION_SPEC.md §5.2`'s `bootstrapMean` faces the identical shape — `§7`
freezes `Bootstrap resamples = 10_000` and `Confidence level = 95%` and **no
resampling seed** — and the repository already answered it: the seed is an
explicit caller parameter, *"the caller's to record in the run manifest"*. Spec
1.4.27 followed that precedent. It does **not** transfer, and the asymmetry is
exact:

```
  bootstrap seed   jitters a REPORTED INTERVAL. The mean is exact whatever the
                   seed; the reader sees the number. A bad seed hides nothing.

  draw seed        decides a PASS/FAIL BUILD GATE. A different seed can flip the
                   verdict, and the report shows only that it passed.
```

A seed that perturbs a published figure is a nuisance parameter. A seed that can
flip a gate is a **decision parameter**, and `AL3` is what the specification has
for decision parameters. `bootstrapMean` is unchanged and its seed stays the
caller's.

#### What the closure costs, stated as a threat rather than a footnote

`V24` said the free draw made *"the gate passed"* irreproducible. `V25` says the
frozen draw makes it *"passed on this sample"*. **Both are true and they trade
against each other**; neither can be eliminated while `§7.3` says *"randomly
sampled"*. This amendment takes the second because reproducibility is checkable
and coverage is bounded either way — a free seed is *also* a fixed slice, just an
unrecorded one chosen after the fact. `V24` is closed in place and preserved as
written; `V25` is a separate row because irreproducibility and bounded coverage
are different threats and folding one into the other would lose the trade.

**`R = 20,000` is NOT raised to compensate.** Raising a `§7` constant to answer a
disclosure is a parameter change made in response to reasoning about a result, and
`§4.1`'s standing treatment of a declared-but-bounded control — applied to `C8`,
`SE1`, `SE4` and `SE2` — is to report the bound rather than tune around it. The
draw is per `(dev, seed)` over five datasets with five different observation pools,
so one frozen seed yields **five different samples and 100,000 pairs**, not one
sample re-tested; widening beyond that is available to a future amendment and no
such policy is decided here.

**What does not change.** Every metric formula, definition, number and the
28-metric list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5` and
their weights; every other `§7` threshold, `R = 20,000` included; `AL1`–`AL2` and
`AL4`–`AL8`; `DATA_MODEL.md §10`'s `Observation`, `§11.1`'s member-eligible set,
`§13`, `§12` and `§18`'s `BenchmarkManifest` **shape**; `§6.1`'s split and seed
table and **every generation seed**; `§4.1`'s composition and every
`target_record_count`; `M42`, `M43` and §H's **H1** disposition; every
`PROJECT_SPEC.md §7` success criterion; and `GT_VERSION` **1.1.0**. **No artifact
byte changes** and **no dataset exists to regenerate** — `bench/` is absent,
`runs/` holds only `.gitkeep`, and no manifest, run, root hash or `bench-v1.0.6`
tag was ever produced.

### A.36 Spec 1.4.29 / benchmark 1.0.7 — three contracts that could not be executed

**The decision.** Four ratifications in three groups, closing the last contract
defects that stood between the repository and a first DEV scored run. Register rows
`DATA_MODEL.md §22.2` **M45**–**M48**. **`BENCHMARK_VERSION` does not move and stays
1.0.7**; `SPEC_VERSION` **1.4.28 → 1.4.29**; `GT_VERSION` stays 1.1.0.

**The condition that makes this legitimate is an ordering, and it holds.** Every
decision below was fixed **before any DEV scored result existed**: `bench/` absent,
`runs/` holding only `.gitkeep`, no agent constructed, no metric computed and
`assay bench` never run. This matters most for **M45**, which governs *when the test
split becomes reachable* — a rule of that kind is defensible fixed before any figure
exists and indefensible fixed after, which is why it is taken now rather than at the
seal, even though it is **executed** last. It is spec 1.4.28's own legitimacy claim,
applied to a different parameter.

#### Group I — the seal that was defined twice (M45, M46)

Through spec 1.4.28 `PREREGISTRATION.md §9`'s own note read *"remains refused until
this procedure's step 1 has been taken; `§6.1`'s forbidden list bars … before the
seal, **and nothing here lifts that**"* — a sentence that names a condition and
revokes it. §A.34 recorded the consequence honestly: *"That the seal procedure's own
step 2 is therefore still not executable is a separate open item."*

**The defect was never a missing condition.** It was a term defined twice. `§9` step
6 calls the commit SHA *"the seal point"*; `PREREGISTRATION.md §1`'s framing has
always read *"tagged `bench-v…` (signed) **at seal time**"*. Two readings of *"the
seal"* existed, and under the commit reading the procedure forbids its own step 2.
The tag reading is selected because it is the only one under which steps 2 through 5
are executable, and it leaves **both** sentences true:

```
  THE SEAL        step 1's signed tag.        §6.1's boundary.
  THE SEAL POINT  step 6's commit SHA.        the provenance record.
```

**No third condition was invented, and no detection was added.** `apps/cli` cannot
learn whether a tag exists: it runs no subprocess, `eslint.config.js` bans the
transports, and `commands/seal.ts` already states the principle — *"a commit SHA read
by running a subprocess is a fact about the working tree rather than about the sealed
artifact"*. What remains is an operator **attestation**, `--seal-tag <name>`, and its
semantics were held to the minimum that does the job: it lifts the refusal, its value
must equal `bench-v<BENCHMARK_VERSION>`, it is refused unless `--split` is `test`, and
it is recorded in `BenchmarkManifest.seal_signature` — a field `DATA_MODEL.md §18`
already types *"signed git tag name"*. **No field, artifact, trust zone, exit code or
subprocess is added.** `§10` **V3** already carries the residual — *"Developer tunes
against the test split … Moderate — self-enforced"* — so no threat row is opened.

**The rule is not weakened.** `AL7` keeps its burn rule and its fail-closed default:
an unattested `--split test` invocation is still a forbidden-list breach. What changed
is that the frozen procedure became executable, not that test data became easier to
reach.

**M46 is clerical and is recorded as such.** Spec 1.4.28 moved `BENCHMARK_VERSION` to
1.0.7 and did not carry the move into `§9`, leaving step 1 naming a tag nobody may cut
and step 5 a literal no conforming manifest can carry — while
`packages/generator/src/frozen.ts` asserted *"§9 step 5 now requires this field to
read `"1.0.7"`"*, a citation to text that did not exist. Applying a bump already
taken is not a new bump; M45's equality check now makes the same drift unrepeatable.

#### Group II — the placement M37 had already settled (M47)

`§K` placed `agents/{assay,b0,b1,b2,a1,a2,a3}.ts` under `packages/eval/src/`, where
an agent cannot live: it must import `engine` (S1–S5), `llm` (R1–R4) and `probe`
(`§6.2`'s loop), and `eslint.config.js` refuses all three under `noInlineConfig`.

**This was not a new finding. It was a consequence of M37 that `§K` never absorbed.**
Register row M37 (spec 1.4.23) already rejected this package in terms — *"`packages/eval`
(scoped to measurement; hosting the run loop puts the system under test inside the
thing measuring it)"*. M37 also rejected `apps/cli`, and that rejection **does not
reach the resolution taken here**, because it was reasoned against the opposite import
direction: *"`packages/eval`'s agent runner could not import it and the loop would be
**forked**"*. Injection reverses the direction — `apps/cli` imports `@assay/eval` and
passes a constructed `Agent` in, eval imports nothing new, `§L.2` is silent on
`apps/cli`, and the graph stays acyclic. Nothing is forked: all seven agents share one
`Agent` surface and differ only by `RunConfig` flags, which is precisely what
`ARCHITECTURE.md §10` requires to keep the ablations valid controls.

**One provenance correction, recorded so a later reader does not mis-locate the
conflict.** `eslint.config.js`'s `packages/eval ↛ engine|llm|probe` bans are **derived**
from M37 and the measurement boundary (`ARCHITECTURE.md §10`, `EVALUATION_SPEC.md
§4.11`, `RECONCILIATION_SPEC.md §6.2`) — **not** from the literal wording of `§L.1`
rule 3, which binds `engine ↛ generator|oracle` and `oracle ↛ engine|generator` and
names `consistency-gate.ts` only as the exception to *that* pair. The contradiction
was M37-vs-`§K`, not rule-3-vs-`§K`, and the lint is correctly stricter than rule 3's
text.

**`report/` does not move,** because it never participated: a renderer reads metrics
and imports no engine, llm or probe.

**G8, the enforcement, is the same mechanism used three times already.** `guard.ts`
records that *"the zone is an argument at the call site"*, so zones are per-read rather
than per-process and a module is not zone-restricted by sitting in the composition
root. Four protections already hold — no `node:fs` outside `apps/cli/src/fs/**`; every
read declares a `ReadZone` and `AGENT` refuses both restricted artifacts; `AgentInput`
carries only `observations` and `config`, so an agent has nothing to read *with*; and
`AL1` binds `packages/engine` and `packages/oracle` **by name**, and neither moves. The
residual is closed by a **path-scoped** ban on the filesystem door from
`apps/cli/src/agents/**`, and deliberately not broadened.

#### Group III — the command that existed everywhere but the list (M48)

`EVALUATION_SPEC.md §7` invokes `assay report --out runs/report.html` inside the
reproducibility guarantee; `§C` **T0-13** is a Tier-0 row distinct from T0-9 and
T0-11; `§K` gives the renderer its own `report/` module. Three sources support the
command against one — T0-11's enumeration — that merely omits it. Folding it into
`bench` was rejected: it would falsify `§7`'s literal recipe, closing one
contradiction by creating another, and `§9` step 8's *"NO CODE CHANGES BETWEEN 6 AND
8"* means re-rendering must not require re-scoring.

**The key tuple was never in conflict.** `ARCHITECTURE.md §10` writes *(agent × seed ×
split)* and T0-9 writes *(agent × seed × llm-mode)* — overlapping subsets, not rival
claims. `RunConfig` already carries `{llm_mode, strict_replay, split, seed}`;
`strict_replay` cannot vary within the scored set because `§L.1` rule 11 fixes it
true; `§5.4` item 6 requires `llm_mode` as a reported dimension. The union is forced:
**`(agent_id, split, seed, llm_mode)`**, with the bootstrap resampling `seed` alone.

**The committability defect could not have waited.** `PROJECT_SPEC.md §7` **S10**,
`EVALUATION_SPEC.md §5.5` and T0-13 each require every claimed number to be traceable
to a **committed** run artifact, while `§K` and `.gitignore` excluded `runs/`
wholesale — so a conforming scored run would have produced numbers `§5.5` forbids
reporting. Settling it after a run would mean choosing where results live after seeing
them, which is the pattern `AL3` and `§L.4` exist to prevent. `*.sqlite` is already
excluded globally, so the database stays ignored with no `runs/`-specific rule.

#### What was left open, deliberately

**`--record`, the live recording pass, and `§9`'s missing recording step.** `§F`
**F2** is *"Unresolved"* and already carries a pre-declared response; on the F2-false
branch the benchmark runs `--llm=offline` throughout and needs no cache, no
`--record` and nothing from this amendment. One gap is recorded now so it is not
discovered later: `DATA_MODEL.md §19`'s `cache_key` is content-addressed on the
structured role input, so **a DEV-recorded cache cannot serve TEST calls** — on the
F2-true branch `§9` would need a recording step between steps 2 and 7, and step 7,
which names no `--llm` mode while `§L.1` rule 11 requires one, would need it stated.
Amending for that now would fix a procedure nobody can execute, so it waits on the
credential fact. **F2's disposition is untouched.**

**`--seeds all` / `--agents all`** are implementation conventions, not ratifications.
Spec 1.4.27 derived the seed grammar from two instances and overlooked `§9` step 7's
third spelling; `--seeds all` is in any case semantically identical to the explicit
enumeration that grammar already admits, so no frozen text requires a parser change
and none is ratified. Both are recorded in code on `artifacts/replay-cache.ts`'s
convention precedent.

**What does not change.** Every metric formula, definition, number and the 28-metric
list; `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5` and their weights;
every `§7` threshold, the `A3-NOLLM` policy and the `§5.3` consistency draw;
`AL1`–`AL8` in substance, `AL7`'s burn rule and fail-closed default included;
`AgentInput`'s two fields; `DATA_MODEL.md §10`'s `Observation`, `§11.1`, `§13`, `§12`
and `§18`'s `BenchmarkManifest` **shape**; `§6.1`'s split and seed table and every
generation seed; `§4.1`'s composition and every `target_record_count`; `M42`, `M43`,
`M44`, `V23`, `V25`, `§F` **F2** and §H's **H1** disposition; every `PROJECT_SPEC.md
§7` success criterion; and `GT_VERSION` **1.1.0**. **No artifact byte changes** and
**no dataset exists to regenerate** — `bench/` is absent, `runs/` holds only
`.gitkeep`, and no manifest, run, root hash or `bench-v1.0.7` tag was ever produced.

### A.37 Spec 1.4.30 / benchmark 1.0.8 — the phrase that decided whether abstention exists

**The decision.** One ratification. `DATA_MODEL.md §17.1.1`'s *"the settlement it is
allocated to"* is the settlement of the **allocation under evaluation**: the
`Candidate.target_id` for a *proposed* allocation, the target of the candidate `S5`
validated for an *accepted* one. It is **not** `ReconLine.settlement_id`. Register
row `DATA_MODEL.md §22.2` **M49**. **`BENCHMARK_VERSION` moves 1.0.7 → 1.0.8**;
`SPEC_VERSION` **1.4.29 → 1.4.30**; `GT_VERSION` stays 1.1.0.

**The condition that makes this legitimate is an ordering, and it holds.** The
reading was fixed **before any scored result existed**: `bench/` absent, `runs/`
holding only `.gitkeep`, no dataset generated, no agent scored, no metric computed
and no seal tag cut. It is fixed **now** rather than at the seal because
`PREREGISTRATION.md §10` **V17** already records that the candidate machinery is
first exercised on the **sealed test split** — so a phrase that decides whether
abstention can occur at all would otherwise have been settled after seeing the only
run permitted to observe it.

**The phrase was undefined for the only allocation `§6` projects.** *"Allocated
to"* occurs **twice in the entire corpus**, both times in `§17.1.1`'s `P2`/`P4`
trigger rows, and no clause defines it. The nearest definition is `I4`'s
*"`settlement.amount = Σ credit − Σ debit` over its **allocated lines**"*
(`RECONCILIATION_SPEC.md §7`) — the allocation `S4`/`S5` establish, not an observed
field. `§L.1` rule 4 and `ARCHITECTURE.md §4` boundary 3 both fix `journal.ts` as
*"a pure posting function over a **proposed** allocation"*, and a proposed
allocation's target cannot be read off a field `S1` has already declined to anchor.

**The competing reading is foreclosed by a frozen sentence, not by convenience.**
Spec 1.4.21 — §A.28 above, and `PREREGISTRATION.md §7` — holds that *"materiality
remains generally non-zero in the real case, because `C6` pins `Σ credit − Σ debit`
and **not** `Σ amount` or `Σ fee`, while `P2` posts on `amount`, `fee − tax` and
`tax` — so allocations differing in fee composition move the control accounts by
different totals, and `AMBIGUOUS` stays reachable."* Two candidates for one target
**share every anchored member** — `S2` puts the same `anchored_members` in each — so
they can differ **only** in members `§3` left unanchored. That unamended sentence
therefore asserts `P2` firing on unanchored members inside `§6`'s materiality
projection, which the `AN1`-necessity reading makes impossible.

**What the rejected reading costs, stated as a consequence rather than a risk.**
Under it, `§6`'s materiality is **identically zero** for every component: with no
`AN2` no bank leg posts either side, and with `AN2` the only members that
distinguish the candidates are exactly the ones refused. `materiality > τ` is then
unattainable, so `AMBIGUOUS` and `DISCRIMINATED` are unreachable, `§6.2`'s probe
loop never runs, `R3` is never called in either arm, and `§11`'s worked example
cannot reach the verdict `§11` states for it. `PREREGISTRATION.md §8`'s metric list,
`EVALUATION_SPEC.md §4.13`'s `EXPLORATORY` line and §H's **H1** each presuppose the
loop exists. A second consequence reaches the committed path: a line correctly
allocated to an `AN2`-confirmed settlement would post `P1` and never `P2`, putting
`proj_agent ≠ proj_truth` on a **correct** decision — the confound
`EVALUATION_SPEC.md §4.4` exists to remove, and which `§17.1.1` itself cites in the
`ledger_entry` row.

**`AN1` was stated insufficient, never necessary.** `§17.1.1`'s own paragraph reads
*"it is **sufficient** to reconcile a line to its settlement; it is **not
sufficient** to debit `1200_BANK`"* — a bar on `AN1` **alone** carrying a bank leg,
which is precisely what `AN2` clears. No frozen clause makes `AN1` a precondition of
`P2`, and none of `M1`–`M48` registers one.

**Ratified, and the record says so.** The phrase supported both readings and
**neither excluded the other**; the frozen reachability argument selects one. This
is marked a ratification rather than dressed as a derivation, on the `M35`
precedent. **No new materiality definition was invented** — the tempting repair, and
the wrong one, exactly as spec 1.4.21 said of the ₹1,00,000 figure.

**Four repairs were rejected for want of textual support.** `journalFor` **skipping**
an unanchored member: `NON_POSTING_GROUNDS` is a closed set, *"one member per clause
of `§17.1.1`"*, and a silent skip is indistinguishable from `THREAT_MODEL.md §T8`'s
lost posting. `S4` **excluding** the member from the balance, or **treating** its
bank evidence as zero: both delete exactly the members two candidates differ in, so
materiality stays identically zero — self-defeating rather than wrong. An
`S1`/`S2` **guarantee** that such a member cannot reach `S4`: contradicted directly
by `§3`'s *"everything anchored is removed from the search space"*, `§4`'s
unanchored targets, `§11`'s `Component.member_obs_ids`, `§11`'s own `F08` worked
example and `V17`.

**Why the benchmark version moves when the last three amendments' did not.** M45–M48
settled placement, output surface and procedure; none changed what a conforming
agent **posts**. This one does — the `P2` bank leg on solved allocations — so runs
either side of it are not comparable, which is what `BENCHMARK_VERSION` exists to
express. `M46`'s precedent requires the bump to reach `PREREGISTRATION.md §9`'s code
block in the same amendment that takes it, and it does: step 1 tags `bench-v1.0.8`
and step 5 requires `"1.0.8"`.

**What does not change.** Every metric formula, definition, universe and number, and
the 28-metric list; `RECONCILIATION_SPEC.md §6`'s materiality formula, its four
outcomes and its second-best certificate; `§6.2`'s probe loop, `P_max = 3`, the
closed five-probe enum, `fetch_settlement_recon`'s source and the `A3-NOLLM` policy;
`§11`'s worked example and verdict; `§3`'s anchor table and `AN5`'s retirement;
`τ`, `ε`, `K_max`, `C_max`, `C1`–`C8` and therefore `constraint_set_hash`;
`SE1`–`SE5` and their weights; `I1`–`I9`; `DATA_MODEL.md §17.1`'s `P1`–`P8`, `§17.2`,
`§13`, `§11.1`, `§10`'s `Observation` and `§18`'s `BenchmarkManifest` **shape**;
`AL1`–`AL8`; `§6.1`'s split and seed table and every generation seed; `§4.1`'s
composition and every `target_record_count`; `M41`'s finding, `V17`, `V22`–`V25`,
`§F`'s rows and §H's **H1** disposition; every `PROJECT_SPEC.md §7` success
criterion; and `GT_VERSION` **1.1.0**. **No artifact byte changes** and **no dataset
exists to regenerate** — `bench/` is absent, `runs/` holds only `.gitkeep`, and no
manifest, run, root hash or seal tag was ever produced. Historical amendment records
are preserved **verbatim**.

### A.38 Spec 1.4.31 / benchmark 1.0.8 — the control that was specified to fail the build

**The decision.** One ratification and two withdrawals, all confined to
`EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` row and the clauses that read it.
*"Removed: Stage S5 invariants `I1`–`I9`"* means **`S5` does not evaluate the
allocation-scoped set `I1`–`I8`**; the expectations *"trial balance breaks"* and
*"runs end `BLOCKED`"* are **withdrawn**. Register row `DATA_MODEL.md §22.2`
**M50**. `SPEC_VERSION` **1.4.30 → 1.4.31**; **`BENCHMARK_VERSION` stays 1.0.8** and
`GT_VERSION` stays **1.1.0**.

**The condition that makes this legitimate is the same ordering `§A.37` relied on,
and it still holds.** No dataset has been generated, no agent has been scored, no
metric has been computed, `bench/` is absent, `runs/` holds only `.gitkeep`, and no
seal tag has been cut. `A1-NOVALIDATE` has **never run**: it is the one Tier-0 agent
that is unimplemented, and this row is settled **before** the code exists rather than
after a figure has been seen. Nothing here is adjusted in response to a result,
because there is no result — `§L.4`'s bar on result-driven revision is not engaged.

**`runs end BLOCKED` contradicted three frozen clauses outright.**
`EVALUATION_SPEC.md §2` closes its protocol with *"A run that ends `BLOCKED` is a
defect and fails the build; the distribution of `CLOSED` vs `OPEN` is a reported
result."* `§4.9` states *"`BLOCKED` must be **0 across every run** — it indicates a
defect in ASSAY, not a property of the data."* `PREREGISTRATION.md §8`'s **metric
14** is *"`close_gate_failures` — per-gate failure counts across all runs; `BLOCKED`
must be 0"*. And `RECONCILIATION_SPEC.md §10.2` makes the outcome *"NO close report.
Run marked `invalid`"*, with `§10.1` calling every gate failure *"an ASSAY defect"*
and `ARCHITECTURE.md §12` agreeing. Three of the four are not commentary: they are a
build gate, a frozen metric and a run's validity.

**And it was self-defeating, which is what settles it rather than merely
disfavouring it.** `PROJECT_SPEC.md §7` **S6** — the criterion `A1` exists to
serve — is *"ablation `A1-NOVALIDATE` shows a statistically significant ₹-harm
increase"*. That needs a mean and a bootstrap interval over `§2`'s *"≥ 5 seeds"*, and
`EVALUATION_SPEC.md §5.5` bars *"any number that does not exist in a committed run
artifact"*. A run marked `invalid` emits no close report and commits no figure. **The
expectation, if satisfied, destroys the criterion it was written to support** — so it
cannot have been the intended reading, and no reading of `§3.2` is available on which
both survive.

**`trial balance breaks` is unreachable through the only write path there is.** `I1`
is not `S5`'s alone: `DATA_MODEL.md §17` requires *"at every point in the event log,
`Σ dr_paise === Σ cr_paise`"*, which the ledger re-checks on the **cumulative
totals at every append**, before anything is persisted and independently of what
`S5` evaluated. `§17.1`'s `P1`–`P8` balance by construction, and `§L.1` rule 4 leaves
exactly one write path. `PROJECT_SPEC.md §7` **S5** independently requires *"trial
balance = 0 and Suspense identity exact **on every run**"*, and `ARCHITECTURE.md §12`
classes a broken one as *"a bug in the ledger itself"* and a hard abort. An `A1` that
broke the trial balance would be reporting an `ASSAY` ledger defect under an
ablation's name. Both withdrawals follow **`M41`**'s precedent — an expectation the
frozen text cannot admit is **withdrawn**, and the ablation stays valid and stays
reported — and spec 1.4.21's, which withdrew `§11`'s ₹1,00,000 figure as
non-reproducible rather than inventing arithmetic to justify it.

**The ratification: `removed` means `not evaluated`, and the alternative is
foreclosed rather than merely rejected.** Two readings were available — (i) `S5` does
not evaluate `I1`–`I8`, and (ii) `S5` evaluates them and ignores the failures — and
they diverge at gate `G5`, which is *"No allocation with a non-empty
`invariants_failed` was posted"*, a **runtime check over a recorded value**. Under
(ii) the failures are found and must be recorded, and `G5` then refuses the
allocation twice over — at the write path and again at close. Making it pass means
weakening `G5` for **every** agent, contradicting `RECONCILIATION_SPEC.md §7`'s
*"never partially posted, never repaired, never downgraded to a warning"* and the
purpose of `§L.1` rule 4. The only other way to express (ii) is to record an empty
`invariants_failed` while failures were found, which makes the artifact assert
something false — `THREAT_MODEL.md §T8`'s suppression, committed by the system
itself, and barred by `EVALUATION_SPEC.md §5.5`. Reading (i) needs none of that:
`invariants_checked` records `[]` **truthfully**, `invariants_failed` is `[]` because
nothing was evaluated rather than because nothing failed, and `G5` stays literally
true **and** meaningful. It also keeps `§3.2`'s *"exactly one respect"* literally
true, the removed component being the invariants and not the stage: `S5` still runs,
still enforces its certificate/abstention agreement, and still mints.

**A defect in the phrase itself, corrected in passing.** `I9` is **run-scoped** —
`§7` folds it in *"only when the caller supplies both hashes"* — so it is evaluated
by no per-allocation gate in **either** arm, `ASSAY` included. *"Remove `I1`–`I9`"*
therefore named one invariant that was never there to remove. The allocation-scoped
set is `I1`–`I8`, and the row now says so. **No invariant definition changes.**

**What `A1` will actually demonstrate, and it is the hypothesis unchanged.** With the
set empty, the allocation `S5` would have rejected is committed instead of being
re-classified to an `E05` exception. `I2`'s double allocation, `I3`'s line
arithmetic, `I4`'s settlement closure, `I5`'s bank tie-out, `I6`'s referential
integrity, `I7`'s range and sign and `I8`'s temporal ordering are the channels, and
they land in `EVALUATION_SPEC.md §4.4`'s `balance_harm_inr` and
`misdirected_value_inr` and `§4.8`'s `id_rejection_rate` — which is exactly what
`§3.2` states the ablation tests and exactly what **S6** reads. **The hypothesis, its
metric linkage and S6 are untouched.**

**The disclosure this creates, recorded rather than left for a reader to find.**
Because `I1` and the `G1`–`G5` close gates keep running, `A1` measures *"`ASSAY` with
the `S5` invariant gate removed"* and **not** *"an unvalidated ledger"*. Its harm
figure is therefore a **conservative lower bound** on what removing validation costs
a system with no such boundary, and the direction is the honest one — it understates
`ASSAY`'s benefit rather than inflating it. `PREREGISTRATION.md §10` **V26** carries
this, `EVALUATION_SPEC.md §5.4` item 5 requires it beside the figure, and the claim
that `A1` reproduces a fully unvalidated ledger may not be made.

**Rejected: three dispositions with no textual support.** **Scoping metric 14 or
metric 11 to exclude `A1`** — it amends two frozen metrics to accommodate a sentence
that was itself the defect, and establishes that an agent can be exempted from a
close gate, which is the precedent `§10.2`'s *"treating `BLOCKED` as `OPEN`"*
warning exists to prevent. **Declaring `A1` an intentionally invalid control run** —
`§10.2` marks such a run `invalid`, so it forfeits S6 as shown above. **A second
`ValidatedDecision` constructor, or a skip-checks mode inside `validate()` reachable
by any caller** — the first voids the brand `§L.1` rule 4 rests on and the second
weakens, for every agent, the one gate `RECONCILIATION_SPEC.md §7` calls *"the only
code path that may post to the ledger"*. The clause added to rule 4 does neither: the
default is the full set, the empty set is reachable from one path-allowlisted module,
the brand and the single widening assertion are untouched, and the selection is
recorded in the artifact.

**Unchanged.** Every metric formula, definition, universe and number, and the
28-metric list; `§5.4`'s **thirteen** obligations and `§5.5`'s twelve forbidden
practices; `§2`'s protocol, `§4.9`'s close-loop block and metric 14's *"`BLOCKED`
must be 0"*, which now bind `A1` as they bind every agent; `RECONCILIATION_SPEC.md
§7`'s `I1`–`I9` **definitions** and its failure semantics; `§10.1`'s `G1`–`G5` and
`§10.2`'s three outcomes; `§10.3`'s close policy; `§6`'s materiality, `§6.2`'s probe
loop, `P_max`, the closed five-probe enum and the `A3-NOLLM` policy; `τ`, `ε`,
`K_max`, `C_max`, `C1`–`C8` and therefore `constraint_set_hash`; `SE1`–`SE5` and
their weights; `DATA_MODEL.md §17.1`'s `P1`–`P8`, `§17.2`, `§13`'s `Decision` **shape**
and `§18`'s `BenchmarkManifest` shape; `AL1`–`AL8`; `§6.1`'s split and seed table and
every generation seed; `§4.1`'s composition and every `target_record_count`; every
`PROJECT_SPEC.md §7` success criterion, **S5** and **S6** included; `M41`'s finding,
`V17`, `V22`–`V25`, `§F`'s rows and `§H`'s dispositions; and `GT_VERSION` **1.1.0**.

**Why the benchmark version does not move.** `M49`'s own test is whether an
amendment changes **what a conforming agent posts**, so that runs either side of it
are not comparable. `ASSAY`, `B0`, `B1`, `B2`, `A2` and `A3` post byte-identically
before and after this row. The only agent whose postings change is `A1`, which posts
**nothing today** — it is unimplemented and has produced no figure — so there is no
pair of runs this row could make incomparable. `M45`–`M48` are the precedent: each
settled placement, output surface or procedure and none moved the constant. **No
artifact byte changes and no dataset exists to regenerate.** Historical amendment
records are preserved **verbatim**.

**What this amendment does not do.** It does not implement `A1`, change
`packages/engine/src/s5-validate.ts`, change `packages/ledger`, or touch any
implementation file: the parameter `§L.1` rule 4 now permits is **ratified here and
built later**, which is the order `§A.37` used for `M49` and the order `§L.4`
requires. `A1-NOVALIDATE` remains an unimplemented Tier-0 ablation, and
`apps/cli/src/agents/a1.ts` still reports it as blocked — on this row's authority
now, rather than on an unresolved governance question.

### A.40 Spec 1.4.33 / benchmark 1.0.10 — the numerator M52 left behind

**The decision.** One ratification, closing the gap a governance review of `M52`'s
implementation found. Register row `DATA_MODEL.md §22.2` **M55**. `SPEC_VERSION`
**1.4.32 → 1.4.33**; **`BENCHMARK_VERSION` 1.0.9 → 1.0.10**; `GT_VERSION` stays
**1.1.0**.

**The defect.** `M52` closed with a sentence that is exactly right and exactly
limited: *"The formulas in `EVALUATION_SPEC.md §4.8` are **unchanged**; what is
supplied is the universe."* It supplied metric 15's **denominator** — the injected
population — and stopped. The numerator is *"injected cases **with `balance_harm >
0`**"*, and `§4.4(a)` defines `balance_harm_inr` as

```
  balance_harm_inr = Σ over AccountCode (excluding Suspense)
                       | proj_agent(acct) − proj_truth(acct) |
```

with the absolute value **outside** the per-account difference and both projections
taken over the whole covered set at once. That aggregate does not decompose —
`|a₁+a₂ − t₁−t₂| ≠ |a₁−t₁| + |a₂−t₂|` — so *"cases with `balance_harm > 0`"* named a
per-case quantity the corpus had never defined. Metric 15 was **half computable**: a
determinate denominator over an indeterminate numerator.

**Why this is a ratification and not a derivation.** At least three attributions are
admissible on the frozen text and **none excludes the others**: restrict both
projections to the case's own `source_entity_id`; recompute the run-level aggregate
with the case removed and ask whether it moved (the leave-one-out marginal); or read
`§4.4(b)`'s natively per-entity `misdirected_value_inr` in its place. They disagree
whenever two cases' account errors cancel. That is precisely the situation `M35`,
`M49` and `M50` legislate for — *"the phrase supported both readings and neither
excluded the other … marked ratified rather than dressed as derivation"* — and `M55`
takes the same form. A first attempt recorded these points as *"Derived"* inside
`M52`'s own row; that was wrong on three counts and is not what shipped: it mislabelled
an outcome-bearing choice, it put a decision in the register's *justification* column,
and it would have made `M52` self-contradictory against its own closing sentence.

**What is ratified.** The case is the injected observation. Its key is its own
business identifier — `DATA_MODEL.md §16`'s *"the identifier of the observation whose
obligation the posting records"*, through `§12`/`M28`'s relation, one-to-one on a
conforming dataset. `case_balance_harm(o)` is `§4.4(a)`'s account-level
absolute-difference sum with **both** projections restricted to that key, Suspense
excluded and the covered-set scope applied unchanged. **The agent-side restriction is
part of the ratification**, not a reading of `§4.4(a)`: that clause keys `proj_agent`
by *"whose owning decision is `RECONCILED`"* and applies no `source_entity_id`
predicate at all. A case of a reference kind (`§10.1`), or whose key falls outside
`§16`'s `source_entity_id` grammar — an `order_…` — posts no line, so it contributes
**`0` and stays in the denominator**; dropping it would narrow `M52`, and `§4.8`
requires the opposite: *"measuring it anyway is the point."*

**What is preserved.** `M52`'s two populations **verbatim and unnarrowed**, its
TEST-only scope and its *"population, not bijection"* reading. Metric **16** entirely
— formula and both populations. `§4.4`'s own two figures, including `balance_harm_inr`
itself, which keeps its definition and its published value. `§8`'s list at **28**.
`RunKey`, `RunConfig`, `§18`'s manifest shape, every `§7` threshold that existed
before, `C1`–`C8` so `constraint_set_hash` does not move, and the oracle, which this
row never reaches. **No `GroundTruth` field is added**, so `GT_VERSION` holds.

**What is disclosed rather than hidden.** `PREREGISTRATION.md §10` **V30**: the
per-case figures **do not sum** to `balance_harm_inr`, the choice among attributions
is outcome-bearing, and the agent-side restriction is `M55`'s. Metric 15 publishes the
share of injected cases carrying their own non-zero account-level difference — not a
partition of the run-level figure — and no additivity may be claimed or implied. This
is the corpus's settled disposal, the one `M54` took for metric 10: publish the honest
quantity with its explanation attached, and never amend a definition to make a number
look better.

**Legitimacy and sequence.** Taken before any dataset existed, so `§6.2` **AL3** and
`§L.4` are satisfied rather than merely not engaged; the definition is bound on the
**M39** terms, unadjustable on TRAIN, DEV and TEST alike. **`BENCHMARK_VERSION` moves
on `M39`'s precedent and not `M49`'s** — no conforming agent's postings change, but an
input to a frozen figure enters the pre-registered surface. **No implementation code
is touched**: `packages/eval/src/metrics/robustness.ts` is unmodified, metric 15 stays
unwired, and the build follows per `§I`.

### A.39 Spec 1.4.32 / benchmark 1.0.9 — four figures that had no procedure

**The decision.** Four rulings, closing the four evaluation-procedure gaps a
governance audit found in `EVALUATION_SPEC.md §5.1`, `§5.3`, `§4.8`, `§4.10` and
`§6`. Register rows `DATA_MODEL.md §22.2` **M51**–**M54**. `SPEC_VERSION`
**1.4.31 → 1.4.32**; **`BENCHMARK_VERSION` 1.0.8 → 1.0.9**; `GT_VERSION` stays
**1.1.0**.

**The defect they share.** Four quantities on `PREREGISTRATION.md §8`'s frozen list
of 28 were **stated but not executable**. Metric 3 `aurc_inr` — a *primary* metric —
declared an ε interval and no discretization. Metric 26 named a τ range and no output
quantity, and its cost half contradicted itself across four clauses. Metrics 15 and
16 quantified over *"injected cases"* and *"matched clean controls"*, defined nowhere.
Metric 17 compared a `rate_by_value` with no numerator or denominator against a
*"rolling"* baseline over a benchmark with no time axis. Metric 10 asked for a
confusion matrix against a truth side that does not exist. This is the shape `§A.20`
and `§A.7` each found once before — *"a formula that could not be evaluated"*, *"the
gate that could not be satisfied"* — and the corpus's own remedy is the one applied:
supply the universe, never amend the formula to fit what happens to be computable.

**The condition that makes these legitimate.** No dataset has been generated, no
agent scored, no metric computed, `bench/` is absent, `runs/` holds only `.gitkeep`
and no seal tag exists. Every one of the four is an **input to a frozen figure**, so
`PREREGISTRATION.md §6.2` `AL3` and `§L.4` require it to be fixed before the figure
it feeds exists — and each is bound on the **M39** terms that froze the `A3-NOLLM`
probe policy for exactly this reason. Nothing here responds to a result, because
there is no result.

**M51 — the sweep contract.** The ε grid is `{0, 500, …, 10_000}` bps, 21 uniform
points. The step is forced up to one choice: a uniform `s` must divide `10_000` to
reach `§5.1`'s endpoint and `1500` so the frozen operating point lies on the curve,
so `s | gcd(10_000, 1500) = 500` and the coarsest is 500. **`1500` must be on the
grid** because `§5.2` and `§5.4` item 5 report the curve's own two axes at the frozen
ε, and a grid without it publishes a primary figure the reported run cannot be
located on. **A sweep point is an evaluation inside one scored unit** — M48's *"exactly
four fields"*, `§7`'s bootstrap holding *"the other three fixed"*, and `§5.4`/`§5.5`'s
CI requirement each independently forbid a fifth key dimension — so `RunKey` is
untouched and every point lands in its unit's own `metrics.json`. **ε and τ re-execute
the agent and belong to `apps/cli`**, `M37` and `M47` keeping the run loop out of the
measurement package; the cost sweep re-executes nothing and stays in the scorer.
**The oracle is not re-run at a swept τ**, because `RECONCILIATION_SPEC.md §6.1`
fixes what that sweep reports and all three quantities are engine-side — which
dissolves what looked like the hardest problem in the set, and leaves
`oracle_labels.jsonl` and its manifest digest untouched. **The curve runs offline**,
`§F` **F2** being applied rather than reopened. And the contradicted cost sweep is
resolved **in favour of the sentences over the labels**: `§4.5`, `§8` twice and `§E`
item 2 all say both parameters move, and only that reading leaves no frozen clause
vacuous.

**M52 — two populations.** `injected` is `INJECT_NOTES` or `CONFLICT_REFERENCE`, the
two operators `§4.3`'s frozen table assigns to `F10`, the one family `§4.1` calls
adversarial; reading it as *"degraded"* is foreclosed by `§4.8`'s own gloss about
numeric output and `I6`. The control is the same dataset, the same
`Observation.kind`, no degradation record — the smallest reading that leaves
*"matched"* doing work, with the residual declared at `§10` **V27** rather than
patched by an invented covariate. **No ground-truth field**, so `GT_VERSION` holds.

**M53 — a baseline that had to be measured.** `abstention_rate_by_value` takes
`§4.1`'s four-constraint denominator unchanged. The baseline is the five DEV seeds,
per `(agent_id, llm_mode)` — pooling would make the detector structurally non-firing,
which `§4.10` itself calls broken. It is the **one** `§7` entry whose value cannot be
chosen a priori, so `PREREGISTRATION.md §9` gains **step 0**: a non-scored pre-seal
DEV pass, between generation and the tag. `§L.4` is not engaged, because the
procedure and population are frozen **before** the measurement and the numbers follow
with no choice at the moment of computation — the form `M44`'s consistency draw
already takes.

**M54 — the measurement that cannot be built, and is not faked.** `GroundTruth`
carries no exception-cause field and no frozen table maps an operator to a class; one
cannot be constructed, because most classes arise from the true state that `§4.3`
puts beyond every operator's reach and the relation is one-to-many besides. Three
repairs were considered and **all three rejected**, the first two because they would
couple the generator to the engine's classification — the coupling
`PREREGISTRATION.md §5.1`/`§5.2` exist to prevent and `§10` **V1** names as this
project's least-eliminable threat. Metric 10 keeps its number, the list stays at 28,
and what is published is the honest state plus an `EXPLORATORY` marginal that
supports no claim. **This is a real gap in the deliverable and `§10` V29 says so** —
`EVALUATION_SPEC.md §6` calls the exception report a deliverable, and the part that
would show the triage is trustworthy is absent.

**The benchmark version moves on `M39`'s precedent, not `M49`'s.** No conforming
agent's postings change — `M49`'s test — but four inputs to figures on `§8`'s list
enter the pre-registered surface, which is the ground on which 1.0.4 → 1.0.5 moved
when `§7` gained the `A3-NOLLM` policy. `§9` step 1's tag and step 5's literal are
carried with it on `M46`'s precedent. **No artifact byte changes and no dataset
exists to regenerate.**

**What this amendment does not do.** It does not implement the scorer, `bench`, the
sweep loops, the baseline pass or metric 10's `EXPLORATORY` marginal; it touches no
file in `packages/eval`, `apps/cli`, `packages/engine`, `packages/generator`,
`packages/ledger` or `packages/oracle` beyond the three version constants and one
test's assertion of a version literal. The ε and τ parameters that `SolveInput` will
need are **ratified here and built later**, the order `§A.37` and `§A.38` both used.
`assay bench` still reports itself blocked, and `packages/eval/src/metric-list.ts`
still records metric 10's blocker in terms this row supersedes — an implementation
follow-up, named in `§I`.

### A.41 Spec 1.4.34 / benchmark 1.0.11 — the rule that was read twice

**The decision.** One ratification, closing a contradiction that wiring `M55` exposed
and that the corpus had carried since spec 1.4.27. Register row `DATA_MODEL.md §22.2`
**M56**. `SPEC_VERSION` **1.4.33 → 1.4.34**; **`BENCHMARK_VERSION` 1.0.10 → 1.0.11**;
`GT_VERSION` stays **1.1.0**.

**The condition that makes this legitimate is an ordering, and it holds.** `bench/`
absent, `runs/` holding only `.gitkeep`, no dataset generated, no agent scored, no
metric computed, no seal tag cut. This matters more here than it did at `§A.40`: M56
governs **what the sealed run can produce**, and a rule of that kind is defensible
fixed before any figure exists and indefensible fixed after. It is `§A.36`'s own
legitimacy claim for `M45`, applied to a different parameter.

**The contradiction.** Three frozen sentences cannot all hold at `§9` step 7:

```
  EVALUATION_SPEC.md §2   for split in {dev, test}: ... for agent in {...}:
                            score(agent output, ground truth, oracle labels)
                              -> metrics.json
  PREREGISTRATION §9      7. Run: assay bench --sealed --agents all --seeds all
                            -- the ONLY run that ever scores the TEST split
  PREREGISTRATION §5.3    "AL5 withdraws that route under --sealed"
```

Under the third, the first cannot be executed at the second. The consequence was not
confined to metrics 15 and 16: **nine figures on `§8`'s list** read the truth side —
metrics **2**, **3**, **5**, **6**, **7**, **8**, **15**, **16** and **26**'s
`c_review_sensitivity` half, with `§5.1`'s ε curve reading it through its y-axis — and
the official sweep could report none of them, while `EVALUATION_SPEC.md §5.4` item 5
requires every metric on the list and `§5.5` bars a fabricated number in place of a
missing one. Metrics 15 and 16 surfaced it first only because they are the first
truth-side metrics wired.

**The defect was never a missing permission. It was that `AL5` was read twice.** Its
binding text in `§6.2` is an **emission** rule:

> *"The CLI's `--sealed` flag refuses to print, log or write any ground-truth field;
> only aggregate metrics are emitted."*

Reading is none of print, log or write. Metrics 15 and 16 **are** aggregate metrics.
The stronger **read**-withdrawal reading entered the corpus at spec 1.4.27 (**M43**),
in a sentence written about zone `GENERATOR_TRUST` when that zone held exactly **two**
readers — the `§5.3` completeness gate and the `§9` seal — **neither of which `§9` ever
runs sealed**, step 3 and steps 4–5 carrying no such flag. A third reader, the scorer,
arrived at spec 1.4.33. The sentence was never restated against the reader set it had
come to govern.

**This is `§A.36`'s shape, and the same test selects.** There, *"the seal"* had been
defined twice and *"the tag reading is selected because it is the only one under which
this procedure's own steps 2 through 5 are executable"*. Here, `AL5` has been read
twice, and the emission reading is selected because it is the only one under which
step 7 is executable. Both readings are admissible on the frozen text, so this is
marked **ratified rather than dressed as derivation**, on the
`M35`/`M45`/`M49`/`M50`/`M55` precedent.

**Three states, kept apart. This is the whole of the ruling.**

```
  A  AGENT EXECUTION under --sealed      UNCHANGED. AL1, AL2, AL4, AL6, AL7
                                          untouched in substance AND wording.
                                          No agent, engine or oracle reads
                                          ground truth, sealed or not.
                                          AgentInput still carries observations
                                          and config and nothing else.
  B  TRUTH/EVALUATION COMPUTATION        The scorer MAY read ground_truth.jsonl,
     after the agent run                  under --sealed, at §9 step 7.
  C  THE EMITTED SCORED ARTIFACT         AGGREGATES ONLY. No GroundTruth field
                                          printed, logged or written.
```

**No permission is created, and that is the point.** `AL2` binds *"neither engine nor
oracle code"*; `AL1` binds those same two packages' imports — **by name, not by
category**. `DATA_MODEL.md §1`'s exclusion paragraph names engine, oracle, agent,
baseline and ablation. The scorer is none of them, and
`packages/eval/src/truth.ts` has said so since it landed: *"Neither rule binds the
scorer, and neither could … A scorer that could not see the answer key could not mark
the paper."* What M56 removes is a `§5.3` sentence about two **other** readers that had
come to bind a third. It grants nothing `AL2` withheld.

**The gates' withdrawal is preserved, and preserved more strongly.** *"Neither gate
runs sealed"* remains true and remains structural, carried now by a **flag refusal** on
`assay oracle` and `assay seal` — `§9` steps 3, 4 and 5, none of which carries
`--sealed` — rather than by a read refusal reached only if a gate call site happens to
open the file. That is precisely what `§A.31` demanded when it rejected widening a
shared zone: the guarantee must not rest *"on the fact that no gate call site happens
to use it today"*.

**What was rejected, and is preserved as rejected.**

- **A fifth `ReadZone` for the scorer.** `§A.31` multiplied a zone to separate two
  readers of **one** artifact where no frozen rule separated them in words. Here `AL2`
  names its constrained parties by package, so a zone expressing what `AL2`'s own
  sentence expresses is ceremony — and a fourth party in a four-zone table invites the
  next reader to add a fifth. The scorer reads in `GENERATOR_TRUST`, `AL2`'s standing
  route.
- **A second scoring pass, or an unsealed step 7b.** `§9` step 8 reads *"NO CODE
  CHANGES BETWEEN 6 AND 8"*, `M48` already fixed that *"re-rendering must not require
  re-scoring"*, and `EVALUATION_SPEC.md §2` puts `score(...)` **inside** the per-agent
  loop. Adding a pass would change the official procedure silently.
- **Copying or re-keying `ground_truth.jsonl`.** A second path to the artifact is a
  second evidence path, refused in terms by `AL8` for the recon report and again by
  `§A.31` for the seal; and a copy outside `bench/<split>/<seed>/` escapes both
  `.gitignore`'s hold-back and `§9` step 4's digest, so the committed hash would stop
  covering every instance of the bytes.
- **Emitting `0.0` for an unavailable truth-dependent metric.** `EVALUATION_SPEC.md
  §5.5` bars *"any number in the demo that does not exist in a committed run
  artifact"*, and `M50` fixed the rule that *"an expectation the frozen text cannot
  admit is withdrawn, not reported"*. A zero standing in for an unread population is a
  fabricated number, and `§4.8` requires the opposite: *"measuring it anyway is the
  point."*

None of the four may be adopted without reopening `M56`.

**The ruling is general, and says so.** It governs every truth-dependent metric and
every future one, not metrics 15 and 16. Metric **4** is unaffected — it scores against
`oracle_labels.jsonl`, which no rule restricts. Metric **10** stays `NOT COMPUTABLE ON
THE FROZEN POPULATION` per **M54**, having no truth axis to restore. Metric **17** is
unaffected, its baseline being `§9` **step 0**'s, produced on DEV, unsealed.

**The residual is declared rather than argued away.** `§10` **V31**: the guarantee now
rests on an **emission** boundary rather than a read refusal. Four structural
protections still hold — `AL1`/`AL2` by name, `AgentInput`'s two fields,
`truth.ts` as the single generator import site converting `GroundTruth` into a
projection before any metric module sees it, and a scored artifact that is a closed
record of scalars — and `AL4`, `AL7`, `§9` step 5's digest-only commit and
`.gitignore`'s hold-back stand behind them.

**Why the benchmark version moves, and why `M45`'s non-bump does not govern.** The bump
is taken on **M39**'s precedent — the pre-registered surface changes in what the sealed
run yields for nine figures on `§8`'s list — and not on **M49**'s, no conforming
agent's postings changing. `§A.36` held `BENCHMARK_VERSION` at 1.0.7 across `M45`–`M48`,
and that is **distinguished rather than overlooked**: `M45` governed *when the test
dataset becomes reachable* and changed nothing about a scored artifact's contents,
whereas this row decides whether step 7 yields a **number** or a *"not exercised"*
state. Under-bumping is the error `M46` exists to make unrepeatable, so `§9` step 1's
tag and step 5's literal are carried in the same amendment.

**What does not change.** `AL1`, `AL2`, `AL3`, `AL4`, `AL6`, `AL7` and `AL8` in
substance **and in wording**; `AL5`'s own `§6.2` text, which is **read and not
rewritten**; `§9`'s eight steps in number, order, command and flag, **step 0**
included; every metric formula, definition, universe and number, and `§8`'s list at
**28**; `§7` gains no entry and revises none, so `M51`'s grids, `M52`'s populations,
`M53`'s baseline and `M54`'s disposition all stand; `C1`–`C8` and therefore
`constraint_set_hash`; `SE1`–`SE5`, `τ`, `ε`; `RunKey` `(agent_id, split, seed,
llm_mode)` and `RunConfig`; `AgentInput`'s two fields; `DATA_MODEL.md §1`'s
`GroundTruth` in every field, type and comment, so `GT_VERSION` stays **1.1.0**;
`§18`'s `BenchmarkManifest` **shape**; `§6.1`'s split and seed table; `§4.1`'s
composition; `V17` and `V22`–`V30`; `§F`'s rows and `§H`'s dispositions. **No artifact
byte changes and no dataset exists to regenerate** — no manifest, run, root hash or
`bench-v1.0.11` tag was ever produced.

**What this amendment does not do.** It implements nothing. `apps/cli/src/fs/guard.ts`,
`apps/cli/src/bench/scorer.ts`, `apps/cli/src/commands/bench.ts`,
`apps/cli/src/commands/oracle.ts`, `apps/cli/src/commands/seal.ts`,
`packages/eval/src/truth.ts` and `packages/eval/src/metrics/robustness.ts` are all
untouched; no file outside the three version constants and one test's assertion of a
version literal changes in any package. `assay bench --sealed` still records metrics 15
and 16 *"not exercised"*, and `bench/scorer.ts` still carries the standing-refusal
constant this row supersedes — an implementation follow-up, named in `§I`, and
**ratified here and built later**, the order `§A.37`, `§A.38` and `§A.40` all used.

### A.42 Spec 1.4.35 / benchmark 1.0.12 — the term that was never defined

**The decision.** One ratification, closing a gap `EVALUATION_SPEC.md §4.6` has
carried since it was written. Register row `DATA_MODEL.md §22.2` **M57**.
`SPEC_VERSION` **1.4.34 → 1.4.35**; **`BENCHMARK_VERSION` 1.0.11 → 1.0.12**;
`GT_VERSION` stays **1.1.0**.

**The condition that makes this legitimate is an ordering, and it holds.** `bench/`
absent, `runs/` holding only `.gitkeep`, no dataset generated, no agent scored, no
metric computed, no seal tag cut. It matters here for the same reason it mattered at
`§A.41`: a correctness predicate is defensible fixed before any figure exists and
indefensible fixed after, because after, the choice can be made to favour a number
already seen. `PREREGISTRATION.md §6.2` **AL3** and `§L.4` are satisfied rather than
merely not engaged.

**The gap.** `§4.6` is complete in every respect but one:

```
  FROZEN   the formula   ECE = Σ_bins (n_bin/N) × |accuracy(bin) − mean_score(bin)|
  FROZEN   the bins      "10 equal-width bins"
  FROZEN   the companion "Plus a reliability diagram in the report"
  FROZEN   the scope     "calibration is reported for the ε-gap component,
                          which is the one place a soft score influences the gate"

  ABSENT   accuracy(bin) -- WHAT MAKES ONE COMMITTED DECISION RIGHT
```

Nothing in the corpus defines it. `EVALUATION_SPEC.md §5.4` item 5 nevertheless
requires **every** metric on `PREREGISTRATION.md §8`'s list of 28 in the report, and
`§5.5` bars *"any number that does not exist in a committed run artifact"* — so the
term could be neither omitted nor invented at scoring time.

**Two readings, and they disagree on a case the benchmark will contain.**

```
  set equality      the decision is right iff the set of (target_id, entity_id)
                    edges it asserts EQUALS the true allocation's set for that
                    target. RECONCILIATION_SPEC.md §6 / M35 already call that set
                    the solution's "allocation identity".

  edge-level        the decision is right iff every edge it asserts is true.
                    EVALUATION_SPEC.md §4.2's FP clause alone; a decision that
                    asserted a SUBSET of the true members has no false positive.
```

A decision asserting two of three true members is **wrong** under the first and
**right** under the second. The choice therefore **moves a figure on `§8`'s list**,
which is the definition of outcome-bearing, and `§A.41` fixed the standard that
applies: *"Both readings are admissible on the frozen text, so this is marked
**ratified rather than dressed as derivation**."* The same marking is taken here, on
the `M35`/`M49`/`M50`/`M55`/`M56` precedent.

**The ruling, and it is the whole of it.**

```
  POPULATION    committed decisions carrying a non-null score --
                RECONCILIATION_SPEC.md §6 step 3's DISCRIMINATED branch.
  PREDICTION    one committed decision = one prediction. N counts gate events.
  BINNED VALUE  Δs = |evidence_score_bps(best) − evidence_score_bps(second)|,
                integer bps; DATA_MODEL.md §13's evidence_score_gap_bps.
  CORRECTNESS   correct(d) iff assert(d) = truth(d), set equality against the
                FULL true member set for d's own target.
```

**The unit is derived, not chosen, and this is what selects it.** Every score in the
corpus is a property of a `Candidate` — `DATA_MODEL.md §11`: *"It orders candidates
and feeds the ε-margin ambiguity test"* — and a `Candidate` is `(target_id,
member_obs_ids)`, a whole allocation. **No frozen field carries a per-edge score.**
Binning an edge would replicate one gate event into as many predictions as the
allocation has members and weight `n_bin / N` by allocation size, so a settlement
with forty constituents would outweigh a two-member one twentyfold in a metric about
a **gate**. `§4.2` warns against exactly this confusion in the other direction —
*"a settlement with 40 constituents is one record and forty independent claims"* — and
it chose the edge for a **set-membership** metric. Metric 7's unit is fixed by what
carries the score.

**Given the allocation unit, set equality is what "right" can mean.** `M35` already
fixed *"allocation identity — the set of `(target_id, member_obs_id)` pairs the
solution asserts"* as this corpus's term for the identity of an allocation, and used
it to make an outcome-bearing tie-break deterministic. The predicate **reuses that
term and adds no new quantity**: `target_id` and the member entities are
`DATA_MODEL.md §11` fields, and the truth side is `§1`'s `allocations` and
`bank_mappings` read through the projection the scorer already holds. Nothing is
invented, and `GT_VERSION` does not move.

**The population is derived.** `§6` step 3 tests **materiality first**, so a `UNIQUE`
decision has no second solution and therefore **no `Δs` to bin**; an
`IMMATERIALLY_AMBIGUOUS` decision was settled by the materiality clause, whose `§6.1`
rationale is that *"the ledger is identical either way"*, so the score influenced
nothing and `§4.6`'s *"the one place a soft score influences the gate"* does not
reach it; an `AMBIGUOUS` decision **abstains**, `chosen_candidate_id` being `null`, so
there is no committed allocation to be right about and `§4.3`'s metric 4 owns it; and
`INTRACTABLE` commits nothing. `DISCRIMINATED` is the remainder.

**What was rejected, and is preserved as rejected.**

- **Calibrating `evidence_score_bps` itself instead of `Δs`.** `§4.6`'s stated
  purpose is that *"an uncalibrated score cannot justify a threshold"*, and the only
  threshold this corpus applies to a score-derived quantity is **ε**, which
  `RECONCILIATION_SPEC.md §6` compares against `Δs` and against nothing else. That
  reading would calibrate a quantity no frozen threshold is applied to and would
  justify **no threshold at all**, defeating the section's own decision.
- **Including `UNIQUE` decisions with an invented score.** There is no second
  solution and therefore no gap; supplying `10_000`, or any other value, is the
  fabricated number `§5.5` forbids and `M56` refused for the same reason when it
  rejected emitting `0.0` for an unavailable metric.
- **Including `IMMATERIALLY_AMBIGUOUS` decisions.** Their gap exists but their gate
  never consulted it. Mixing two accept rules into one reliability curve would
  calibrate a threshold against decisions a different threshold made.
- **Edge-level / partial-credit correctness.** It is `§4.2`'s `FP` clause with its
  `FN` clause deleted, and `§4.2` pairs them precisely because *"how much does it
  miss"* is a separate question. Under it metric 7 would calibrate `match_precision`
  and duplicate metric 5's numerator, while the claim the gate actually makes is that
  **this allocation explains this target** — what `§6` step 1 accepts, what stage
  `S5` validates and what `DATA_MODEL.md §17.1` posts.
- **The edge as the prediction unit.** Rejected on the weighting argument above.
- **Importing `§4.2`'s abstained/excepted `FN` exclusion.** Its rationale is **cost
  double-counting** — *"`§4.5` already prices that decision at `C_review` or
  `C_exception`"* — and metric 7 prices nothing. Importing it would make one
  decision's correctness a function of the agent's **other** decisions, so two agents
  asserting an identical allocation against identical truth could be scored
  differently, which defeats cross-agent comparability.
- **Leaving the metric unresolved.** `§5.4` item 5 requires every metric on the list
  of 28. **`M54`'s disposition does not transfer:** metric 10 has **no truth axis**,
  which no amendment can supply without coupling the generator to the engine; metric
  7 has one, and what was missing was a sentence in `§4.6`.

None of the seven may be adopted without reopening `M57`.

**The residual is declared rather than argued away.** `§10` **V32**, in two halves.
Set-equality correctness is **not equivalent** to edge-level correctness, so metric 7
is not comparable with any externally computed edge-wise figure and metric **5**
remains where partial credit is reported. And because only score-consulting
`DISCRIMINATED` decisions enter, metric 7 observes the **accept** side of the very
threshold it exists to justify: bins below ε cannot be populated by construction, an
agent whose gate consults no score contributes no prediction at all, and **sparse or
empty bins are therefore a structural property of the population and never grounds
for changing this definition**. No population size, frequency or expected value is
asserted — **no dataset exists**, and a structural statement is the only kind
available.

**Why the benchmark version moves, and why `M50`'s non-bump does not govern.** The
bump is taken on **M39**'s precedent — the pre-registered surface changes in what the
sealed run yields for a figure on `§8`'s list — and not on **M49**'s, no conforming
agent's postings changing. `M50` held `BENCHMARK_VERSION` at 1.0.8, and that is
**distinguished rather than overlooked**: it **withdrew** two expectations and changed
nothing a scored artifact contains, whereas this row decides whether metric 7 is a
**number** or an unavailable state — which is `§A.41`'s own test, applied to one
figure instead of nine. Under-bumping is the error `M46` exists to make unrepeatable,
so `§9` step 1's tag and step 5's literal are carried in the same amendment.

**What does not change.** `§4.6`'s formula, its **ten** equal-width bins and its
reliability diagram; metric 7's **name and number**; `EVALUATION_SPEC.md §4.2`
entire; `§4.1`, `§4.3`–`§4.5` and `§4.7`–`§4.13`; `§5.1`'s ε grid, `§5.3`'s sweeps,
`§5.4`'s **thirteen** obligations and `§5.5`'s forbidden practices; `§8`'s list at
**28**, none added, removed, renumbered or redefined, and **no other metric's
formula, universe or threshold**; `M51`'s grids, `M52`'s two populations, `M53`'s
baseline, `M54`'s disposition, `M55`'s per-case harm and `M56`'s three states, all
preserved verbatim; `AL1`–`AL8` in substance **and** wording; `§9`'s eight steps in
number, order, command and flag, **step 0** included; `C1`–`C8` and therefore
`constraint_set_hash`; `SE1`–`SE5`, `τ`, `ε`, `K_max`, `C_max`, `P_max` and every
other `§7` threshold; `RunKey` `(agent_id, split, seed, llm_mode)` and `RunConfig`;
`AgentInput`'s two fields; `DATA_MODEL.md §1`'s `GroundTruth` in every field, type and
comment, so `GT_VERSION` stays **1.1.0**; `§13`'s `Decision` and
`AmbiguityCertificate` and `§11`'s `Candidate`; `§18`'s `BenchmarkManifest` **shape**;
`§6.1`'s split and seed table; `§4.1`'s composition; `V17` and `V22`–`V31`; `§F`'s
rows and `§H`'s dispositions. **No artifact byte changes and no dataset exists to
regenerate** — no manifest, run, root hash or `bench-v1.0.12` tag was ever produced.

**What this amendment does not do.** It implements nothing.
`packages/eval/src/metrics/calibration.ts` is **untouched** and remains correct for
the predictions it is given; `packages/eval/src/run.ts`,
`apps/cli/src/bench/scorer.ts`, `apps/cli/src/artifacts/metrics.ts`,
`apps/cli/src/commands/bench.ts` and `packages/eval/src/metric-list.ts` are all
untouched; no file outside the three version constants and one test's assertion of a
version literal changes in any package. `assay bench` still publishes metric 7 as
`null` beside its standing-refusal constant — an implementation follow-up, named in
`§I`, and **ratified here and built later**, the order `§A.37`, `§A.38`, `§A.40` and
`§A.41` all used.


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
| T0-2 | `packages/domain` — zod schemas, Razorpay-faithful fee/GST, ID grammars, **`constraints.decl.ts`**, **stage `S0`: quarantine, ingest invariants, normalization, static `REFERENCE` (spec 1.4.18)** | Ingest invariants reject malformed records; `credit = amount − fee` holds on every generated line, with `fee` GST-inclusive and `tax = 18% × (fee − tax)` (`DATA_MODEL.md §6`) |
| T0-3 | `packages/generator` — forward simulation, families **F01–F10**, seeded | Same seed → byte-identical output; ground truth is a construction byproduct with no `is_ambiguous` field. All four held-out families (`F07`–`F10`) are authored in Tier-0 and held out at family level until the seal (`PREREGISTRATION.md §6.1`) |
| T0-4 | `packages/engine` S1–S3 — anchors, candidates under C1–C8, component decomposition. **`S0` is `packages/domain`'s at spec 1.4.18 and moved to T0-2** | Component-size distribution printed; `intractable_rate` measured on dev |
| T0-5 | `packages/engine` S4–S5 — exact solve, **no-good cut, second-best certificate**, materiality test, invariants I1–I9 | The ₹1,00,000 worked example (`RECONCILIATION_SPEC.md §11`) abstains with a correct certificate |
| T0-6 | `packages/ledger` — Layer A hash chain + Layer B double-entry projection + **close gate G1–G5** | `assay verify` passes; trial balance zero; Suspense identity exact; the close gate emits `CLOSED`, `OPEN` and `BLOCKED` correctly for constructed inputs on each side of the threshold. Whether both `CLOSED` and `OPEN` occur on the DEV seeds is assumption `§F` F9's falsification check — reported as a finding, and **never** grounds for adjusting the close policy (`§L.4`) |
| T0-7 | `packages/llm` — **`LlmProvider` interface + `offline` + `replay` providers**; roles R1, R2; schema/allowlist/grounding verification | **Full pipeline passes with `--llm=offline`, no network.** Hallucinated IDs rejected and counted. `--llm=replay` reproduces byte-identically |
| T0-8 | `packages/oracle` — exhaustive enumeration + **completeness gate + consistency gate** | Both gates pass on dev; 20,000-pair differential test agrees with the engine constraint-by-constraint |
| T0-9 | `packages/eval` — coverage, balance harm, net cost, abstention precision/recall, close-loop metrics, 5 seeds, bootstrap CIs | `metrics.json` per (agent × seed × llm-mode) |
| T0-10 | Baselines `B0-IDONLY`; ablations `A1-NOVALIDATE`, `A2-NOABSTAIN`, `A3-NOLLM`. **`B2-LLM-DIRECT` conditional on F2** — it needs a live credential to populate its replay cache. | All run behind one agent interface; `A3` is literally `ASSAY --llm=offline`. If F2 is unresolved, `B2` defers to tier H2 and the report names which baselines ran and why. The ablations alone are sufficient for the central claim. |
| T0-11 | `apps/cli` — `generate · oracle · run · bench · close · verify · seal · report`. **`report` appended at spec 1.4.29 (register row `DATA_MODEL.md §22.2` M48)** — `EVALUATION_SPEC.md §7` invokes it inside the reproducibility guarantee, T0-13 is a distinct deliverable and `§K` already gives the renderer its own module; it is **appended, never renumbered**, so the original seven keep their order. **The six Tier-0 agents are `apps/cli/src/agents/`'s from spec 1.4.29 (M47)** and are injected into `packages/eval`. | Full pipeline runs from a clean checkout with no API key |
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

**At benchmark 1.0.12 (spec 1.4.35, `§A.42`).** `PREREGISTRATION.md §7` gains **one
entry and revises none**, and **no metric formula, bin count, universe, threshold or
number moves** — the list stays at **28**, none added, removed or renumbered. What
changes is that metric **7** `ece` acquires the correctness semantics
`EVALUATION_SPEC.md §4.6` never stated: the population is `RECONCILIATION_SPEC.md §6`
step 3's `DISCRIMINATED` branch, the binned prediction is that decision's `Δs`, one
committed decision is one prediction, and a decision is correct **iff its asserted
allocation equals the true allocation for the same target**. It is **unaffected in
formula and affected in determinacy**, and saying only "unaffected" would be
misleading — the correctness term had no determinate value before. Metric **5** is
genuinely unaffected and remains the partial-credit metric, `§4.2` being read and not
amended. `AL1`–`AL8`, `C1`–`C8` and `constraint_set_hash`, `SE1`–`SE5`, `τ`, `ε`,
every pre-existing `§7` threshold, `M51`–`M56` entire, `RunKey`, `RunConfig`,
`DATA_MODEL.md §18`'s manifest shape and `GT_VERSION` 1.1.0 are all unmoved, and
`§9`'s eight steps keep their number, order, command and flag. The two-part residual
— non-equivalence with the edge-level reading, and a population confined to the
accept side of ε — is declared at `PREREGISTRATION.md §10` **V32**. Register row
**M57**.

**At benchmark 1.0.11 (spec 1.4.34, `§A.41`).** `PREREGISTRATION.md §7` gains **no
entry and revises none**, and **no metric definition, formula, universe, threshold or
number moves** — the list stays at **28**, none added, removed or renumbered. What
changes is which figures the **official sealed run can produce at all**. `§6.2` `AL5`
is ruled an **emission** rule, so `§9` step 7's `assay bench --sealed` reads ground
truth and emits aggregates; `§5.3`'s access restatement is narrowed to the completeness
gate and the seal, whose withdrawal is re-grounded on a flag refusal on `assay oracle`
and `assay seal`. Nine figures — metrics **2**, **3**, **5**, **6**, **7**, **8**,
**15**, **16** and **26**'s `c_review_sensitivity` half, together with `§5.1`'s ε curve
— become producible on the sealed path; they are unaffected in **definition** and
affected in **availability**, and saying only "unaffected" would be misleading.
`AL1`–`AL4` and `AL6`–`AL8`, `C1`–`C8` and `constraint_set_hash`, `SE1`–`SE5`, `τ`,
`ε`, every pre-existing `§7` threshold, `M51`–`M55` entire, `RunKey`, `RunConfig`,
`DATA_MODEL.md §18`'s manifest shape, the population parameters and `GT_VERSION` 1.1.0
are all unmoved, and `§9`'s eight steps keep their number, order, command and flag. The
emission-boundary residual is declared at `PREREGISTRATION.md §10` **V31**. Register
row **M56**.

**At benchmark 1.0.10 (spec 1.4.33, `§A.40`).** `PREREGISTRATION.md §7` gains **one
entry** — metric **15**'s per-case `balance_harm`: `EVALUATION_SPEC.md §4.4(a)`'s
account-level absolute-difference sum with both projections restricted to the injected
case's own `source_entity_id` (`DATA_MODEL.md §16`, `§12`/`M28`), Suspense excluded and
the covered-set scope unchanged, plus the structural-zero rule for a case that posts no
line, which contributes `0` **and stays in the denominator**. `EVALUATION_SPEC.md §4.8`
gains that per-case quantity; `§4.4` is **read and not amended**, and its run-level
`balance_harm_inr` keeps its definition and its value. **No metric formula changes,
none is added, none is removed and none is renumbered** — the list stays at **28** —
and `M52`'s two populations, metric **16** entire, `constraint_set_hash`, `C1`–`C8`,
`SE1`–`SE5`, `τ`, `ε`, every pre-existing `§7` threshold, `RunKey`, `RunConfig`,
`DATA_MODEL.md §18`'s manifest shape, the population parameters and `GT_VERSION`
1.1.0 are all unmoved. The non-additivity of the per-case figures against
`balance_harm_inr` is declared at `PREREGISTRATION.md §10` **V30**. Register row
**M55**.

**At benchmark 1.0.9 (spec 1.4.32, `§A.39`).** `PREREGISTRATION.md §7` gains **four
entries** — the `EVALUATION_SPEC.md §5.1` **ε grid** (`{0, 500, …, 10_000}` bps, 21
points, `1500` among them), the **cost sweep's point set** with `C_review` and
`C_exception` moved together, metrics **15/16's two populations**, and metric
**17's rate and DEV baseline** — and `§9` gains a **step 0**, the non-scored pre-seal
DEV baseline pass. `EVALUATION_SPEC.md §2`, `§5.1` and `§5.3` become normative on
each sweep's owner, execution depth and output; `§4.8` and `§4.10` gain the universes
metrics 15, 16 and 17 quantify over; `§6` and `§5.4` item 5 record metric **10** as
**not computable on the frozen population**. **No metric formula changes, none is
added, none is removed and none is renumbered** — the list stays at **28** — and
`constraint_set_hash`, `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, every pre-existing `§7`
threshold, `RunKey`, `DATA_MODEL.md §18`'s manifest shape, the population parameters
and `GT_VERSION` 1.1.0 are all unmoved. **Item 2 below is the clause that settles the
cost sweep** and is preserved verbatim: it is the only frozen statement of that
sweep's content for `C_exception`. Register rows **M51**–**M54**.

**At benchmark 1.0.5 (spec 1.4.25, `§A.32`).** `PREREGISTRATION.md §7` gains the
**`A3-NOLLM` probe priority policy** — the control arm's `R3`, stated for the first
time and bound by `AL3` and `§L.1` rule 12 — and `DATA_MODEL.md §13`'s
`AmbiguityCertificate.reason` gains its fourth and final member,
`NO_USEFUL_PROBE_AVAILABLE`. `R3` may not propose `widen_temporal_window`; `§L.1`
rule 2 is unchanged and unweakened and no `days` constant is invented. **No metric
formula, definition, number or count changes** — the list stays at 28 — and
`constraint_set_hash`, `C1`–`C8`, `SE1`–`SE5`, every other `§7` threshold, the
population parameters and `GT_VERSION` 1.1.0 are all unmoved. The numbered items
below are the historical record and are preserved verbatim.

0. **A PG-side recon report is committed, and the benchmark version moves to
   1.0.4** (spec 1.4.22, `§A.29`). `RECONCILIATION_SPEC.md §6.2`'s
   `fetch_settlement_recon` reads it; `AL8` bars the engine and the oracle from
   it, so the oracle stays a fixed observations-only reference and its labels
   never depend on a probe result. `constraint_set_hash`, `GT_VERSION`, the
   generated population and every metric definition are unchanged.

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
| H1 | LLM role R3 (probe planning) + `abstentions resolved per probe` | **Built; the affirmative claim is WITHDRAWN at spec 1.4.26 (§A.33, M41, `PREREGISTRATION.md §10` V23).** This row read *"Strongest genuine-AI-necessity evidence"* through spec 1.4.25; on the conforming v1.0.0 population `R3`'s choice set is a **singleton** and `PREREGISTRATION.md §7`'s frozen policy is **weakly dominant**, so *"beats a static priority list"* is **unfalsifiable** and **must not be claimed**. The software is valid and stays. **From spec 1.4.25:** the claim runs through **metric 24** and the ASSAY-vs-`A3` primary deltas — `abstentions resolved per probe spent` is absent from `PREREGISTRATION.md §8`'s 28 and is reported `EXPLORATORY` as provenance (`EVALUATION_SPEC.md §4.13`). The `A3` comparand is frozen at `PREREGISTRATION.md §7` (M39) and **must not be tuned**. |
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
| **Aug 23** | Monorepo, `money`, `domain` (incl. `constraints.decl.ts`, and **`S0`** from spec 1.4.18), ledger Layer A skeleton | Property tests pass; a hand-built 5-event chain verifies |
| **Aug 24** | Generator: forward simulation, families **F01–F10** (T0-3). **F07–F10 are authored today and held out at family level until the seal (`PREREGISTRATION.md §6.1`).** | `assay generate --split dev`; same seed → identical bytes; `F07`–`F10` generator functions exist and pass structural property tests under the four conditions in `PREREGISTRATION.md §6.1`, with no `--split test` invocation, no engine involvement, and no payload displayed |
| **Aug 25** | Engine S1–S3: anchors, candidates under C1–C8, decomposition (**`S0`'s quarantine is `domain`'s, spec 1.4.18**) | Component-size distribution printed; F8 assumption checked |
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

**The implementation follow-ups spec 1.4.32 leaves, named so they are not lost
(`§A.39`, register rows M51–M54).** The amendment is docs-only by design — `§L.4`'s
order is ratify first, build after — and it leaves exactly this work, in this
sequence. **(1)** `packages/engine` takes ε and the τ floor as parameters of the
solve call, `frozen.ts` keeping `PREREGISTRATION.md §7`'s values as the default every
unswept caller uses. **(2)** `apps/cli`'s `bench` gains the ε and τ loops and writes
each point into its unit's `metrics.json` under `(RunKey, parameter_name,
parameter_value)`. **(3)** `packages/eval/src/metrics/sensitivity.ts` sweeps
`C_review` and `C_exception` **together**, its present `cReviewSweep` holding
`C_exception` fixed against M51. **(4)** `packages/eval/src/truth.ts` projects
`degradations` into M52's two populations — the first time the scorer reads that
field, and it stays the single `@assay/generator` import site. **(5)**
`packages/eval/src/metrics/abstention.ts` gains M53's rate; the baseline stays a
supplied argument, which its present signature already has right. **(6)** `apps/cli`
gains `PREREGISTRATION.md §9` step 0's non-scored DEV baseline pass. **(7)**
`packages/eval/src/metric-list.ts` records metric 10's blocker as *"R2 triage output
on a run; no run artifact exists"*, which **M54 supersedes**: the binding blocker is
the absent truth side, which no run would supply, and the row should say so and name
the `EXPLORATORY` marginal that replaces the matrix.

**The follow-up spec 1.4.33 leaves (`§A.40`, register row M55).** Item **(4)** above
is taken — `packages/eval/src/truth.ts` projects `degradations` into `M52`'s two
populations, and it remains the single `@assay/generator` import site. What **M55**
leaves is item **(8)**: `packages/eval/src/metrics/robustness.ts` consumes those
populations for metrics 15 and 16. Metric **15** takes `M55`'s per-case harm, keyed by
the injected observation's own business identifier and restricted on **both** journal
sides, with a reference-kind or out-of-grammar case contributing `0` without leaving
the denominator, and the `§10` **V30** disclosure printed beside the figure. Metric
**16** needs **no** such ratification and none was taken: *"abstention rate on injected
records"* is the share of the `M52` population whose own terminal state is `ABSTAINED`
(`EVALUATION_SPEC.md §4.4`, `DATA_MODEL.md §10.1`, `§13`), which `AgentRun.outcomes`
already carries per `obs_id` — so it is read there rather than off `AgentRun.abstentions`,
whose key is `DATA_MODEL.md §16`'s Suspense-item key and therefore a different
population. **This amendment takes none of that:** `robustness.ts` is untouched at
spec 1.4.33, exactly as `§L.4`'s ratify-first order requires.

**The follow-up spec 1.4.35 leaves (`§A.42`, register row M57).** What **M57** leaves
is item **(9)**: wiring metric **7**. `packages/eval/src/metrics/calibration.ts` is
**already correct and is not to be edited** — it takes `ScoredPrediction { score_bps,
correct }` and owns the binning, and `M57` supplies precisely the input it was always
missing. The work is at the **call site**: `apps/cli/src/bench/scorer.ts` builds one
`ScoredPrediction` per `AgentRun.decisions` entry whose `score_bps` is non-`null`,
with `correct` computed as **set equality** of that decision's asserted
`(target_id, member_entity_ids)` edges against `packages/eval/src/truth.ts`'s
`ScoringTruth.edges` filtered to the same `target_id`; `apps/cli/src/artifacts/metrics.ts`
then publishes `ece` and the `§4.6` reliability diagram in place of the standing
`METRIC_7_ECE_UNRATIFIED` constant, and publishes the metric **unavailable with its
reason** — never `0.0` — where the population is empty. Two obligations ride with it.
An agent must emit `CommittedDecision.score_bps` **non-`null` exactly on
`RECONCILIATION_SPEC.md §6` step 3's `DISCRIMINATED` branch**, so that the field's
nullity **is** `M57`'s population test rather than merely correlating with it. And
`packages/eval/src/metric-list.ts` row 7 already reads `blockedBy: null,
computedBy: "metrics/calibration.ts"` — a claim that was ahead of the code and that
this wiring makes true; the row needs no edit, unlike item **(7)**'s metric-10 row.
**This amendment takes none of that:** `calibration.ts`, `scorer.ts`, `metrics.ts`,
`run.ts` and `metric-list.ts` are untouched at spec 1.4.35, exactly as `§L.4`'s
ratify-first order requires.

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
│   │                      constraints.decl.ts,s0-ingest.ts}
│   ├── generator/    src/{prng.ts,simulate.ts,families/F01..F12.ts,degrade.ts,emit.ts}
│   ├── oracle/       src/{enumerate.ts,completeness-gate.ts}
│   ├── engine/       src/{s1-anchor.ts,s2-candidates.ts,
│   │                      s3-decompose.ts,s4-solve.ts,s5-validate.ts,
│   │                      constraints/C1..C8.ts,invariants/I1..I9.ts}
│   ├── probe/        src/{call.ts,        # the closed five-probe call; sole ctor
│   │                      loop.ts,        # P_max, pre-call I6, transitions
│   │                      event.ts}       # the PROBE LedgerEvent body
│   │                 # pure: no I/O, no network, no clock, no llm import
│   ├── llm/          src/{provider.ts,                    # the LlmProvider interface
│   │                      providers/{offline,replay,anthropic,openai-compatible}.ts,
│   │                      roles/{r1..r4}.ts,
│   │                      verify/{schema,allowlist,grounding}.ts}
│   ├── ledger/       src/{events.ts,hash-chain.ts,        # Layer A
│   │                      journal.ts,projection.ts,       # Layer B
│   │                      close-gate.ts,close.ts}
│   └── eval/         src/{metrics/,bootstrap.ts,report/,run-key.ts,
│                          gates/consistency-gate.ts}   # ONLY place importing
│                          #        both engine and oracle — see L.1 rule 3
│                     # agents/ MOVED to apps/cli/src/agents/ at spec 1.4.29
│                     #   (register row M47): an agent must import engine, llm
│                     #   and probe, all three refused here — see M37, which
│                     #   already rejected this package as a run-loop host.
│                     #   report/ STAYS: a renderer imports none of the three.
│
├── apps/
│   ├── cli/          src/commands/{generate,oracle,run,bench,close,verify,
│   │                                 seal,report}.ts      # report: 1.4.29, M48
│   │                 src/agents/{assay,b0,b1,b2,a1,a2,a3}.ts   # 1.4.29, M47
│   │                 #   constructed here and INJECTED into packages/eval;
│   │                 #   may not import ../fs/ — path-scoped lint (M47/G8)
│   ├── api/          src/routes/
│   └── web/          src/screens/{Run,Close,Exceptions,Benchmark}.tsx
│
├── bench/                          # layout ratified at spec 1.4.27 (M42):
│   │                               #   dataset artifacts are (split, seed)-scoped;
│   │                               #   family is COMPOSITION, never a file dimension
│   ├── dev/                        # observations + ground truth, committed
│   │   ├── recon_report.jsonl      # PG-side probe surface; engine+oracle barred (AL8)
│   │   │                           #   SPLIT-scoped, unchanged since 1.4.22 (M36)
│   │   └── <seed>/                 # 2000..2004
│   │       ├── observations.jsonl        untrusted_text.jsonl
│   │       ├── ground_truth.jsonl        oracle_labels.jsonl
│   │       ├── oracle_gate.json    # §5.3 gate results (M43); NOT a benchmark digest
│   │       └── benchmark_manifest.json   # one per (split, seed); includes GT +
│   │                               #   constraint-set hashes + recon_report_sha256
│   │                               #   (spec 1.4.22), the latter identical across
│   │                               #   every manifest of the split
│   └── test/                       # observations committed; ground_truth.jsonl GITIGNORED
│       ├── recon_report.jsonl      # committed; AL4/AL7 inspection discipline applies
│       └── <seed>/                 # 9000..9004, 9100..9104; same five files
│                                   #   oracle_gate.json is AGGREGATE ONLY (AL4/AL7)
│
├── fixtures/llm-cache/             # committed; makes replay-mode runs reproducible
└── runs/                           # SCORED ARTIFACTS ARE COMMITTED from spec
                                    #   1.4.29 (M48): PROJECT_SPEC.md §7 S10,
                                    #   EVALUATION_SPEC.md §5.5 and T0-13 each
                                    #   require every claimed number to be
                                    #   traceable to a COMMITTED run artifact.
    ├── <run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
    └── report.html                 # EVALUATION_SPEC.md §7's own --out path
                                    # *.sqlite stays ignored (already global)
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

   **Added at spec 1.4.31, register row `DATA_MODEL.md §22.2` M50 — the evaluated
   invariant set is a parameter, and exactly one module may narrow it.**
   `validate()` may accept the allocation-scoped invariant set it evaluates. **The
   default is the full set `I1`–`I8`, and every ordinary caller receives the full
   evaluation** — `ASSAY`, `B0-IDONLY`, `B1-GREEDY`, `B2-LLM-DIRECT`, `A2-NOABSTAIN`
   and `A3-NOLLM` are ordinary callers and none may pass anything else. The **empty**
   set is selectable **only** from the `A1-NOVALIDATE` agent module, allowlisted by
   path in the lint config — the mechanism rules 3 and 4 already use — so any other
   path passing a non-default set fails the build rather than silently skipping a
   gate. **No arbitrary caller may bypass S5.** This creates **no second
   `ValidatedDecision` constructor and no second widening assertion**: the
   non-exported brand, the single assertion in
   `packages/engine/src/s5-validate.ts` and the one write path in `packages/ledger`
   are untouched, which is what makes this a narrowing of who may select a set
   rather than a weakening of the gate. `Decision.invariants_checked`
   (`DATA_MODEL.md §13`) records the set actually evaluated, so a narrowed run is
   visible in its own artifact and gate `G5` keeps its meaning
   (`RECONCILIATION_SPEC.md §10.1`): an evaluated failure is recorded and refused,
   and an empty `invariants_checked` states plainly that nothing was evaluated.
   **`I9` is not in this set** — `RECONCILIATION_SPEC.md §7` evaluates it only when
   the caller supplies two root hashes — so it is neither selected nor removed here,
   and **no invariant definition changes**. Ledger-side enforcement is unaffected and
   is not reachable by this parameter: `I1` is re-checked on the cumulative totals at
   every append, and `G1`–`G5` run at close for every agent.
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
    `target_record_count` schedule in `PREREGISTRATION.md §4.1`, the SE1–SE5
    weights (3500 / 2000 / 1500 / 1000 / 2000 bps), and — **added at spec 1.4.25,
    register row M39** — the **`A3-NOLLM` probe priority policy** of
    `PREREGISTRATION.md §7`: priority order `fetch_settlement_recon` →
    `fetch_payment` → `fetch_order` → `fetch_refund`, the lexicographically
    smallest eligible argument for the chosen kind, first constructible entry
    wins, else `NO_USEFUL_PROBE`. `max_unresolved_abs` no longer exists.
    **The policy is frozen on stricter terms than the SE1–SE5 weights**, which
    `PREREGISTRATION.md §7` permits adjusting on TRAIN and DEV before the seal: it
    parameterises the **control arm** against which the system under test is
    measured, so it is unadjustable on TRAIN, DEV and TEST alike, and was fixed
    before `R3` existed in either arm.

    **Added at spec 1.4.28, register row M44 — the `§5.3` consistency draw**, also
    of `PREREGISTRATION.md §7`: `R = 20,000` per `(dev, seed)` dataset,
    `CONSISTENCY_DRAW_SEED = 417203`, member-set size uniformly `1..4` drawn
    before the member indices, target pool every target-kind observation, member
    pool every member-eligible observation (`DATA_MODEL.md §11.1`),
    `anchored`/`allocated` always empty, draw order target → size → members, and
    exactly one PRNG word per index draw. **The sampler is frozen with the seed**,
    a seed over a free sampler fixing nothing. It takes the same stricter terms as
    the `A3-NOLLM` policy and for the same reason — it decides a **hard build
    gate's pass criterion**, where a bad choice is invisible to a reader — so it
    is unadjustable on TRAIN and DEV, and an override is non-authoritative and
    refused on a sealed or official run. It was fixed **before any dev
    consistency-gate result existed**.

    **Added at spec 1.4.32, register rows M51–M53 — four evaluation inputs**, all of
    `PREREGISTRATION.md §7` and all taking the same stricter terms as the `A3-NOLLM`
    policy, because each parameterises a figure on `§8`'s frozen list rather than
    ranking candidates inside one agent: (a) the **ε sweep grid**
    `{0, 500, …, 10_000}` bps — 21 uniform points with `1500` among them, swept for
    `ASSAY` and `A1` only, under `--llm=offline` — which produces metric 3
    `aurc_inr`, a **primary** metric; (b) the **cost sweep point set**
    `{₹100, ₹250, ₹1,000}`, over which `C_review` **and `C_exception` move
    together**, `C_exception`'s frozen ₹500 deliberately not among them; (c)
    metrics 15 and 16's **injected** and **matched clean control** populations —
    `INJECT_NOTES` or `CONFLICT_REFERENCE` for the first, same dataset plus same
    `Observation.kind` plus no degradation record for the second; and (d) metric
    17's **`abstention_rate_by_value`** and its **DEV baseline** — the mean and
    sample stddev over seeds `2000`–`2004`, keyed per `(agent_id, llm_mode)`, taken
    by `PREREGISTRATION.md §9`'s **step 0** before the tag. All four were fixed
    **before any dataset existed**, and (d) is frozen as a *procedure plus a
    population* rather than as a hand-chosen number, the form the `§5.3` draw
    established — `§7` records why `§L.4` is therefore not engaged by it. **The
    frozen values of `τ`, `ε`, `C_review` and `C_exception` above are unchanged**:
    a sweep reports a metric at declared points and is what `EVALUATION_SPEC.md
    §5.3` makes mandatory, which is the opposite of the result-driven revision this
    rule and `§L.4` forbid.

### L.2 Build order (do not reorder)

`money` → `domain (incl. S0)` → `ledger Layer A` → `generator` → `engine S1–S3` →
`ledger Layer B` → `engine S4–S5` → **`probe`** →
`llm (provider + offline + replay)` → `oracle` → `eval` → `api` → `web` → seal →
sealed run.

**`probe` was inserted at spec 1.4.23 and no existing position moved.** It sits
after `engine S4–S5` because it reads that stage's `SolveResult` and its `P_MAX`
constant, and **before `llm`** because it does **not** call `R3` — it consumes a
proposal as a value, so it needs no `llm` import and the graph stays acyclic. That
purity is what makes the position available; a loop that called `R3` would have to
build after `llm` and no scope-compatible slot exists there. See `§A.30`.

Each package depends only on those before it, so the dependency graph is acyclic
in build order and every stage is independently testable. Note `llm` precedes
`oracle`: the offline provider is on the critical path for the demo guarantee.


**`S0` is `domain`'s, not the engine's, corrected at spec 1.4.18.** This line read
`engine S0–S3` and `§I` said the same in two places, which `ARCHITECTURE.md §3` has
contradicted since spec 1.0.0 by giving `packages/engine` *"Stages S1–S5"*. **The two
documents disagreed and this one was wrong again** — the same failure this section
already recorded for `ledger`. It was not a labelling slip: `RECONCILIATION_SPEC.md
§2` gives `S0` the output `Observation[]` + `UntrustedText[]`, while `§L.1` rule 3
above forbids `packages/engine` from importing `UntrustedText` at all, so the engine
could never have run `S0`'s step 3. A stage cannot emit a type its package may not
import. `ARCHITECTURE.md §3` now names the owner — `packages/domain`, over source
data `apps/cli` has already read — and `§A.25` carries the record.

**`domain` does not move position.** It already built second; it now carries `S0`,
whose per-record parts (`schemas/`, `checkReconLineInvariants`,
`schemas/untrusted-text.ts`, `§10.1`'s `REFERENCE` classification) were committed
there before this correction. The order stays linear and acyclic: nothing that builds
before `domain` needs `S0`, and `engine S1–S3` consumes only its `Observation[]`
output. **`apps/cli` is absent from this line** and is not added here — the omission
predates spec 1.4.18 and is left standing rather than repaired in passing.

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
