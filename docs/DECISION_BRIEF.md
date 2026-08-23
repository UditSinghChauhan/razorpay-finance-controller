# DECISION_BRIEF — ASSAY

**Adversarial review, and the locked project definition after revision.**
**Spec version:** 1.1.0 · **Date:** 2026-08-23
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
| T0-2 | `packages/domain` — zod schemas, Razorpay-faithful fee/GST, ID grammars, **`constraints.decl.ts`** | Ingest invariants reject malformed records; `credit = amount − fee − tax` holds on every generated line |
| T0-3 | `packages/generator` — forward simulation, families F01–F06 + F08 + F10, seeded | Same seed → byte-identical output; ground truth is a construction byproduct with no `is_ambiguous` field |
| T0-4 | `packages/engine` S0–S3 — quarantine, anchors, candidates under C1–C8, component decomposition | Component-size distribution printed; `intractable_rate` measured on dev |
| T0-5 | `packages/engine` S4–S5 — exact solve, **no-good cut, second-best certificate**, materiality test, invariants I1–I9 | The ₹1,00,000 worked example (`RECONCILIATION_SPEC.md §11`) abstains with a correct certificate |
| T0-6 | `packages/ledger` — Layer A hash chain + Layer B double-entry projection + **close gate G1–G5** | `assay verify` passes; trial balance zero; Suspense identity exact; at least one seed ends `OPEN` and one ends `CLOSED` |
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
8. **Close policy frozen**: auto-close iff unresolved ≤ min(0.5% of batch value,
   ₹50,000). Two bounds, because a ratio alone lets a large batch auto-close over
   a large absolute gap, and an absolute bound alone punishes small batches.
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
| F6 | Fee rates in `PREREGISTRATION.md §4.2` are plausible | Unverified | Razorpay public pricing | Adjust **before the seal**, never after |
| F7 | GST on gateway fees is 18% | Standard rate; unverified against current notification | Public GST schedule | Adjust the constant; the arithmetic identity is unaffected |
| F8 | `K_max = 22` keeps `intractable_rate` low | Unverified until day 3 | Measure component-size distribution on dev | Raise `K_max` **before the seal only** |
| F9 | Close policy (0.5% / ₹50,000) produces both `CLOSED` and `OPEN` outcomes across seeds | Unverified | Dev run on day 6 | Adjust before the seal; S12 requires both outcomes to occur |
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
| H1 | Families `F07` (chargeback hold/release), `F09` (period boundary) | Broadens the held-out adversarial split |
| H1 | Calibration: reliability diagram + ECE | Justifies the ε threshold |
| H2 | LLM role R4 (grounded explanations) with numeral verification | Demo polish with a real control attached |
| H2 | `anthropic` and `openai-compatible` providers exercised live | Completes the provider matrix; needs F2 resolved |
| H2 | τ and `C_review` sensitivity sweeps | Pre-empts "you tuned the threshold" |
| H2 | Baseline `B1-GREEDY` | Third reference point |
| H2 | 100k-record deterministic throughput run | Answers the scale question |
| H3 | Analyst resolution workflow feeding back into close | Closes the human half of the loop |
| H3 | Family `F11` (FX) | **Do not attempt.** Separate truth model. |
| H3 | Live Razorpay adapter on the one real test payment | Provenance touch, near-zero evaluative value |
| H3 | Q&A over the ledger with citations | High demo appeal, high LLM-wrapper risk. Last. |

---

## I. Recommended implementation order

Tier-0 freeze **31 August**. Seal and sealed run **1 September**. Submission
**5 September**. Each day ends with something runnable.

| Date | Build | Done when |
|---|---|---|
| **Aug 23** | Monorepo, `money`, `domain` (incl. `constraints.decl.ts`), ledger Layer A skeleton | Property tests pass; a hand-built 5-event chain verifies |
| **Aug 24** | Generator: forward simulation, families F01–F06. **Author F07–F10 now and never run them.** | `assay generate --split dev`; same seed → identical bytes |
| **Aug 25** | Engine S0–S3: quarantine, anchors, candidates under C1–C8, decomposition | Component-size distribution printed; F8 assumption checked |
| **Aug 26** | Engine S4–S5: exact solve, no-good cut, second-best certificate, materiality, I1–I9 | ₹1,00,000 worked example abstains with a correct certificate |
| **Aug 27** | Ledger Layer B + close gate G1–G5 + three outcomes | Trial balance zero; Suspense identity exact; `OPEN` and `CLOSED` both observed |
| **Aug 28** | `LlmProvider` interface + `offline` provider (all four roles) + `replay` provider; roles R1, R2 + three verification layers | **Full pipeline green with `--llm=offline`, no network** |
| **Aug 29** | Oracle + completeness gate + consistency gate | Both gates pass on dev; 20,000-pair differential agrees |
| **Aug 30** | Eval harness: metrics, bootstrap CIs, B0/B2, A1/A2/A3, multi-seed runner | Full dev benchmark table with CIs, two llm-mode columns |
| **Aug 31** | UI + API + CLI polish; report generation; **TIER-0 FREEZE** | Demo runs end to end without a terminal; §C fully green |
| **Sep 1** | **SEAL** (`PREREGISTRATION.md §9`) → sealed test run | Signed tag `bench-v1.0.0`; results recorded whatever they say |
| **Sep 2** | Write results, threats-to-validity, report page | Report contains all 12 required elements (`EVALUATION_SPEC.md §5.4`) |
| **Sep 3** | H1 stretch items **only if the sealed run is clean** | No Tier-0 regression |
| **Sep 4** | Demo recording, submission package | Video runs on `--llm=offline` |
| **Sep 5** | **SUBMISSION.** Buffer only — no new code | — |

Two disciplines that are not negotiable: adversarial families F07–F10 are written
on 24 Aug and never executed until 1 Sep; and **no agent code changes between the
seal on 1 Sep and the recorded result.**

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
   `ABSTAINED`, or `EXCEPTION`. No fourth state, no drop path.
6. `Suspense balance = Σ abstained value + Σ open exception value`, exactly, at
   close (gate G3).
7. The period ends `CLOSED`, `OPEN` or `BLOCKED`. A close report is emitted for
   the first two and **never** for `BLOCKED`.
8. Every LLM-referenced entity ID must exist in the observation set (invariant
   I6), independently of any allowlist check.
9. `C6` exact tie-out has zero tolerance except where a declared degradation
   operator is in force, and that use is logged on the decision.
10. **The full pipeline must pass every acceptance test under `--llm=offline`.**
11. All scored benchmark runs use `--llm=replay --strict-replay`. A cache miss is
    a hard error, never a silent live call.
12. Frozen at seal time and immutable thereafter: `τ = max(₹100, 0.1%)`,
    `ε = 0.15`, `K_max = 22`, `C_max = 5000`, `P_max = 3`, `C_review = ₹250`,
    `C_exception = ₹500`, `k_sigma = 3`, `queue_top_n = 20`,
    `max_unresolved_ratio = 0.005`, `max_unresolved_abs = ₹50,000`, and the
    SE1–SE5 weights.

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
threshold after the seal. Adding a chat interface to the main path. Making any
acceptance test depend on a live model. Using a consumer AI subscription as an
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
