# BENCH_V2_PREREGISTRATION — ASSAY bench-v2, the stress corpus

**Status:** PRE-REGISTERED, **UNSEALED**. Drafted at bench-v2 increment 3
(2026-09-21), completed 2026-11-24 and **revised on review 2026-11-25 (§9,
revision 1)**, at spec 1.4.39 and benchmark 1.0.13 unchanged, **before any
bench-v2 corpus has been generated, scored or sealed**. Every number in §5 is a
prediction.

**What evidences the order — the PUSH, not the commit.** A commit's date is
set by its author's clock. The evidence that these predictions preceded the
results is the **server-recorded time at which the commit carrying this file
was pushed**, read after the push from
`gh api repos/UditSinghChauhan/razorpay-finance-controller/activity` and
recorded **in the results document**, not here. `scripts/seal-bench-v2.mjs`
(§7, gate G-D) refuses to seal unless this file is byte-identical to its
content at the pre-registration commit, that commit is on a remote-tracking
branch, and no later commit touches the file; it records the commit's SHA and
every earlier version of the file. **Any edit after that commit refuses the
seal** (§9 states the one exception and how it is made visible).

**What this document is not.** It is not `PREREGISTRATION.md`, which stays
frozen at benchmark 1.0.13 with its 28 metrics, its `§7` thresholds and its
`§10` disclosures; nothing here moves any of them. It is the pre-registration
of a **second corpus** built to make under-determination reachable
(`docs/BENCH_V2_DESIGN.md §A`) — a stress corpus whose family prevalences are
declared parameters, not base rates — and of seven new metrics computed over
it by a **documented** evidence model that is deliberately not the engine's.

**Reading order.** `PREREGISTRATION.md §10` V35 (why bench-v1.0.13 could not
test abstention), V37–V38 (what the sealed engine computes), **V39** (the
deferred cascade defect and the quantity it contaminates here) and **V40**
(the specification finding this corpus is built around); then **V41–V44**
(the probe arm, what it bends, what was dropped, what it cannot resolve, and
the defect it exposed); then `docs/BENCH_V2_DESIGN.md §C` (the four
investigations and the families as observed at test seeds).

---

## 1. Frozen inputs, and what does not move

Every threshold this document reads is `PREREGISTRATION.md §7`'s, byte-identical
across the three packages that transcribe it and asserted identical by
`apps/cli/tests/bench-v2-documented-model.test.ts`:

```
  EPSILON_BPS             1_500
  TAU                     max(10_000 paise, 10 bps × component value)   (> τ, strict)
  SEARCH_BOUND            k_max 22 members per class, c_max 5_000 candidates
  P_MAX                   3            — a budget per COMPONENT (DATA_MODEL.md §22.2 M64)
  SE_WEIGHTS_BPS          SE1 3_500 · SE2 2_000 · SE3 1_500 · SE4 1_000 · SE5 2_000
  EVIDENCE_SCORE_MAX_BPS  10_000
```

None moves, for a test or otherwise. `runs/seal-v1.0.13/**`, `bench/test/**`
and `bench/dev/**` are not touched by anything this document describes (gate
G-E). `classifyMember`'s cascade (V39, `DATA_MODEL.md §22.2` M62) is **not**
fixed before the seal; its consequence is carried in §4 and §6.

### 1.1 Every arm is scored `--llm=offline`

`EVALUATION_SPEC.md §2` makes `--llm=replay --strict-replay` the scored mode.
**bench-v2 scores every arm under `--llm=offline` instead**, for a reason that
is mechanical, not preferential: `R3` is consulted on every `AMBIGUOUS` target
in every arm, no replay cache exists for this corpus, and a strict replay miss
is a deliberate hard error (`packages/llm/src/adjudicator.ts`), so `ASSAY`
cannot run bench-v2 under replay at all. **Precedent:** all 50 sealed v1.0.13
units were scored `offline` (`runs/seal-v1.0.13/**`, every unit directory
`offline/`).

**`R3` in this benchmark is `PREREGISTRATION.md §7`'s frozen deterministic
priority policy (register row M39), not a language model.** It proposes
`fetch_settlement_recon` on the lexicographically smallest eligible settlement
id or declines; no figure here says anything about what a model would propose.
Every `R3` call is recorded (`RunEvidence.llm_calls`, M65) with
`provider: "offline"`, `model_id: "rules-v1"`.

---

## 2. Corpus composition

### 2.1 Families

Six bench-v2 family ids, all STRESS families, all `split: "test"`, each
detaching lines with `DROP_BATCH_IDENTITY` and nothing else
(`packages/generator/src/families.ts`, `manifest.ts`):

| id | family | construction (one instance = 31 capture days) | targets touched / instance | records / instance |
|---|---|---|---|---|
| `A01` | AMB-1 | 3 split days; equal-credit twins on 200 vs 300 bps; both twins detached; clean `bank_ref` on both halves | 6 | 2,627 |
| `A02` | AMB-2 | 3 split days; `{P}` vs `{P2, R1}` refund netting; three lines detached | 6 | 2,627 |
| `A03` | AMB-3 | 3 split days; AMB-1's twins with gross delta in [₹51, ₹80] (sub-τ) | 6 | 2,627 |
| `A04` | AMB-4 | 3 split days; AMB-1's twins, the moving twin **alone** in `S₂` (`k = 0`); `S₁` keeps every other line (`k ≥ 1`) | 6 (3 × `S₁`, 3 × `S₂`) | 2,627 |
| `A05` | AMB-5 | 3 batches at distinct instants, 15 payment lines each detached; no split | 3 | 2,621 |
| `B01` | BENIGN | BEN-3 3 split days (one line from each half), BEN-1 3 days × 1 line, BEN-2 3 days × 2 lines; credits differ | 12 | 2,627 |

Rates are the code's **Convention 1** — `round_half_up(rate × 31) = 3` days per
construction (`AMB1_PAIR_RATE` … `BEN3_DAY_RATE`) — **kept by decision**
(Work Order 3c): raising them would move the `A01` figures that the
`CASCADE_DEFERRED` pins and `PREREGISTRATION.md §10` V39 state, and the sample
size is met with seeds instead (§2.2). `docs/BENCH_V2_DESIGN.md §C.3` derives a
case for 20 % on AMB-1/2/3 and a larger BENIGN; **that case is recorded and not
adopted here**. If the rates are moved before the seal, §2 and §5 are
re-derived and this file's hash is re-recorded **before** any generation; if
after, the seal is refused (G-D).

### 2.2 Blocks, seeds, and the sample-size rule

**The rule** (Work Order 3b, 1.6), applied to block P: **≥ 100
documented-truly-ambiguous PAIRS, ≥ 30 documented-discriminable targets,
≥ 100 BENIGN single-allocation targets.** Per block-P seed the corpus carries
6 documented-TA pairs (`A01` 3, `A02` 3; `A04`'s pairs hold one TA target and
one discriminable one and are not counted as pairs), 3 discriminable targets
(`A04`'s `S₂`) and 12 single-allocation targets (`B01`). The smallest block
meeting all three is **17 seeds**: 102 pairs, 51 discriminable, 204 singles
(16 seeds give 96 pairs).

**Block S is not held to the rule**, by decision: it exists to keep `A05`'s
15-line classes away from the twin families (`§8` R5) and carries `A01` only to
reach the record band; it carries no `A02` and no `A04`, so the discriminable
and pair counts could not be met without changing what the block is for.

```
  block P  seeds 9200–9216  (17)  [A01, A02, A03, A04, B01]   13,135 records / seed
  block S  seeds 9300–9304   (5)  [A05, A01, A03, B01]        10,502 records / seed
```

Both per-seed totals sit inside `PROJECT_SPEC.md §9`'s 10,000–20,000 band. The
seeds are TEST-only, in no `§6.1` block, to be declared in
`packages/generator/src/seeds.ts` under `PREREGISTRATION.md §6.2` AL7's
successor rule before generation (§8). Per-instant pooling across
`A01`/`A02`/`A03`/`A04` at three days each is expected on roughly one day per
seed; it merges no component (the families' candidates share no member) and
adds a third admissible allocation only on an exact-credit coincidence, which
`solution_count` makes visible (§4, M-F's `reason_mix` and the per-target row).

**What the rule costs, measured** (16-core host, one process, test seed 7001,
generation + oracle + all six scored arms): **11.6 s per block-P seed and
10.4 s per block-S seed**, the documented model adding ≈ 0.5 s per instance —
**≈ 3.6 min for block P and ≈ 1 min for block S, ≈ 5 min end to end**, against
≈ 1 min for block P at the five seeds first drafted: the rule costs ≈ 2.6 min.

### 2.3 Test seeds informed these predictions — and the corpus shares none

**The predictions in §5 were informed by test seeds 7001–7020** — the engine's
verdicts on every family at 7001–7003, the twenty-seed tie-break and offset
sweeps at 7001–7020 (`docs/BENCH_V2_DESIGN.md §C`), and Work Order 3c's
`ASSAY-PROBE` runs at 7001–7005. That is acceptable (Work Order 3b, 1.3) only
because **no corpus seed is a test seed**, and that is enforced, not asserted:

- `scripts/test-seed-registry.json` declares every seed any test file uses —
  literal, computed (`7001 + i` up to 7200) and fast-check (`20,000–999,999`)
  — and `tests/test-seed-registry.test.ts` fails if any test file spells a seed
  outside it, or spells a corpus seed (9200–9216, 9300–9304) anywhere;
- seal gate **G-F** (§7) refuses a corpus seed inside any registered range.

### 2.4 Expected populations, by construction

Deterministic per seed under the documented model (§3), before any engine
runs. `T` = `documented_truly_ambiguous`, `D` = `documented_discriminable`,
`I` = documented immaterial, `S` = single-allocation, `X` = `SEARCH_BOUND_ORACLE`.

```
                    per seed                 per block
  block P   T 15  (A01 6, A02 6, A04 3)      T 255  D 51   I 102  S 204  X 0      (17 seeds)
            D  3  (A04 S₂)
            I  6  (A03)
            S 12  (B01)
  block S   T  6  (A01)                      T 30   D 0    I 30   S 60   X 15     (5 seeds)
            I  6  (A03) · S 12 (B01) · X 3 (A05)
```

A seed whose counts differ from these is a generator or oracle defect, not a
result, and the seal refuses it (G-A, G-B, G-C).

---

## 3. The predicates, verbatim

### 3.1 `structurally_exchangeable(t)` — `packages/oracle/src/structural.ts`

From the oracle's own enumeration over **observations only** (`AL2` intact; no
quarantined text, no recon report, no engine output, no generator flag):

> `structurally_exchangeable(t)` ⇔ the oracle finds **≥ 2** admissible
> allocations for settlement target `t` under the documented `C1`–`C8` and
> co-settlement coherence, **and** the engine's `S2` bound would not have
> stopped it: no candidate class of `t` exceeds `k_max = 22`, and `Σ (2ⁿ − 1)`
> over `t`'s candidate classes does not exceed `c_max = 5,000`.

The label is one of `EXCHANGEABLE`, `SINGLE` (exactly one allocation on a
target that needed enumeration), `NONE`, `ANCHOR_RESOLVED` (the anchored
members already tie out; never reaches `S2`), `SEARCH_BOUND_ORACLE` (the bound
above, or the oracle's own wider bound, would be hit) and `NO_MEMBER_KIND`
(`bank_line` targets: the empty candidate set). No field is inspected: the
evidence question is settled by the gap term only (§3.2).

`SEARCH_BOUND_ORACLE` is declared here, before any figure exists, as an
exclusion from every denominator in §4, and its count is printed **in the same
sentence as every rate it leaves**. This is the opposite of what
`PREREGISTRATION.md §10` V35 records for metric 4: there a population was
found empty **after** the sealed figure; here the exclusion is pre-registered
with the metric and reported beside it on every line.

### 3.2 `documented_evidence_gap_bps(t)` — `packages/eval/src/documented-model/`

A re-implementation of `RECONCILIATION_SPEC.md §4.2`'s **specified** model,
**deliberately divergent from `packages/engine/src/s4-solve.ts`** (which
hardcodes `SE1`, `SE2`, `SE4` to `0` and, outside `ASSAY-PROBE`, computes
`SE5` only after a probe it never dispatches — V37, V38) **and not the
oracle**. For every admissible allocation the oracle found for `t`:

```
  score_bps(allocation) = round_half_up( Σ over signals IN the gap of weight × unit )
  documented_evidence_gap_bps(t) = score_bps(top) − score_bps(second)        (§6's Δs)
```

**Which signals are in the gap, and why — the complete list of what `§4.2`
determines and what it leaves open** (`SE_DISPOSITIONS`, as data):

| signal | weight | disposition | ground, in `§4.2`'s own words |
|---|---|---|---|
| `SE1` | 3,500 | **TARGET_CONSTANT** — cancels in every gap | *"Both comparands are target-scoped, so `SE1` takes one value across every candidate of a target and can neither order candidates nor move the ε-gap."* The scaling of *"UTR prefix match length"* to a unit score is **not stated**; a gap does not need it and it is not invented. |
| `SE2` | 2,000 | **UNDETERMINABLE** — excluded, disclosed | *"no frozen clause pairs a `MerchantLedgerEntry` with a candidate, component, target or probed order … no pairing or aggregation function is ratified here."* No candidate-relative form exists on conforming data. |
| `SE3` | 1,500 | **COMPUTED** | spec 1.4.13: `lag_days` real; `mode_days` the mode of `floor(lag_days)` over every `recon_line`, ties to the lowest bin; member score `max(0, 1 − |lag_days − mode_days| / (T_max − T_min))`; candidate score the arithmetic mean. |
| `SE4` | 1,000 | **UNDETERMINABLE** — excluded, disclosed, **never `0`** | *"Its agreement function is therefore left undefined — partial credit between `method` and `card_network`, and the treatment of a `card_network` null on both sides … are NOT settled here."* |
| `SE5` | 2,000 | **COMPUTED**, as if one `fetch_settlement_recon` had been dispatched for `t` | specs 1.4.15–1.4.17: `R` the union of constituent ids over every report for the settlement; `R*` their images under `§12`, an id with no observation excluded entirely; `SE5 = |R* ∩ M| / |R* ∪ M|`, `0` on an empty union. |

**Every scoring rule `§4.2` leaves underdetermined, and the judgement taken on
each** — the complete list, read off `RECONCILIATION_SPEC.md §4.2` line by line:

| # | open rule | `§4.2`'s words | judgement here |
|---|---|---|---|
| U1 | `SE4`'s agreement function (`method`/`card_network` partial credit; a `card_network` null on both sides) | *"left undefined … NOT settled here"* | `SE4` **UNDETERMINABLE**: excluded from the gap, disclosed on every row, never `0` |
| U2 | `SE2`'s pairing of `order_ref` with a candidate, and its aggregation | *"no pairing or aggregation function is ratified here"*; *"What is NOT settled. Any future pairing or aggregation rule for `order_ref` ↔ `receipt`"* | `SE2` **UNDETERMINABLE**, as U1 |
| U3 | `SE1`'s scaling of *"UTR prefix match length"* to a unit score | not stated | not needed: `SE1` is target-constant and cancels in every gap; no scale is invented |
| U4 | the double-counting policy for one `fetch_order`/`fetch_payment` result feeding two signals | *"a double-counting policy this specification does not state, and none is supplied here"* | moot while U1 and U2 hold; not decided |
| U5 | multi-probe aggregation for `SE2`/`SE4` under `P_max` | *"Multi-probe aggregation … and any aggregation across probe results, are likewise open"* (only `SE5`'s union is ratified, spec 1.4.17) | moot while U1 and U2 hold; not decided |
| U6 | the field the recon report is date-scoped on (`settled_at` or `created_at`) | *"Two things this deliberately leaves unspecified. The field the recon report is date-scoped on"* | not needed: `R` is the union of every row naming the settlement, which `§4.2` shows is correct under either reading |
| U7 | an `R3` policy for which dates or probes to spend the budget on | *"Also unspecified: any `R3` policy"* | sidestepped by the full-information reading below: the report is read whole for the target, as if every window had been fetched. (The `ASSAY-PROBE` ARM uses `§7`'s frozen control-arm policy, §1.1; the documented model does not.) |

`SE3`'s bin granularity, modal population, tie rule, kernel, `T_max − T_min`
denominator and mean aggregation, and `SE5`'s Jaccard, are **ratified** in
`§4.2` (specs 1.4.13, 1.4.16), not open; they are implemented as ratified.

**The full-information reading, stated.** `SE5` is computed as though the
target's own recon report had been fetched. Under the other reading (no probe)
`SE5 = 0` on every allocation, the documented gap is `SE3`'s alone, and
`documented_discriminable` is empty on every family by V38's 469-bps bound
including `AMB-4`; that reading measures the engine's probe surface, not the
specification, and is not what this document pre-registers.

**The recon report enters `packages/eval` as a value.** `AL8` bars the engine
and the oracle from reading `recon_report*.jsonl`; `packages/eval` is neither,
performs no I/O, and receives the rows from the caller as it receives ground
truth. Which `apps/cli` zone performs that read is the scoring command's
decision (§8, open item 3).

### 3.3 The composed predicates — `documented.ts`

With `materiality` and `τ` read off the oracle's frozen `OracleLabel`
(`PREREGISTRATION.md §5.4`: the largest per-account difference between any two
admissible allocations' `P2`/`P4` projections; `τ = max(₹100, 10 bps ×
component value)`, strict `>`):

```
  documented_truly_ambiguous(t)  ⇔  structurally_exchangeable(t)
                                     ∧ documented_evidence_gap_bps(t) < EPSILON_BPS
                                     ∧ max_materiality_paise(t) > tau_paise(t)

  documented_discriminable(t)    ⇔  structurally_exchangeable(t)
                                     ∧ documented_evidence_gap_bps(t) ≥ EPSILON_BPS

  documented_immaterial(t)       ⇔  structurally_exchangeable(t)
                                     ∧ gap < EPSILON_BPS ∧ materiality ≤ τ      (in neither population)

  documented_single(t)           ⇔  structural label SINGLE                      (M-G's population)
```

**The boundary is `RECONCILIATION_SPEC.md §6`'s** (line 1045: `DISCRIMINATED`
when `Δs ≥ ε`; lines 1048 and 1051: the ambiguous branches when `Δs < ε`), as
the engine applies it (`s4-solve.ts`, `deltaS >= epsilonBps`). The first
draft of this section read `> ε` / `≤ ε`; it was aligned on review (revision 1,
`exchangeableClassOf`, tested at `ε − 1`, `ε` and `ε + 1`). No bench-v2
construction produces a gap of exactly 1,500, so no population above moves.

Every target has exactly one documented class; `TRULY_AMBIGUOUS` and
`DISCRIMINABLE` are disjoint by construction; neither holds with fewer than two
admissible allocations; the rows are a function of `(family, seed)` and do not
depend on observation or report-row order (`packages/oracle/tests/structural.test.ts`,
`packages/eval/tests/documented-model.test.ts` — including fast-check
properties over generated universes and permutations, with a guard that the
generator reaches every population — and
`apps/cli/tests/bench-v2-documented-model.test.ts`). **No new lint-boundary
edge:** `packages/eval → packages/oracle` already exists (`gates/sample.ts`,
`metrics/abstention.ts`; `eslint.config.js` states nothing bars it), and
`packages/oracle/src/structural.ts` imports only within the oracle and
`@assay/domain` types. The frozen oracle label
`TRULY_AMBIGUOUS` (`classify.ts`) is untouched and unrenamed; the names here
are `documented_*` and live in new files.

### 3.4 The expected `AMB-4` gap — the paragraph required before the family was built

For a one-for-one twin swap under the documented model, with `k` anchored
members shared, `SE5(true) = 1` and `SE5(wrong) = k / (k + 2)`, so the `SE5`
term of the gap is `2000 · 2 / (k + 2)`; the twins share `created_at` and both
batches share `settled_at`, so `SE3` is identical on both allocations and
contributes `0`; `SE1` cancels; `SE2` and `SE4` are undeterminable. `AMB-4`
deals the moving twin **alone** into `S₂`, so `S₂`'s target has `k = 0` and its
two allocations differ by **exactly 2,000 bps ≥ ε = 1,500** —
`documented_discriminable`, the one construction in bench-v2 on which the
documented model separates competing allocations (V40). `S₁` keeps every other
line of the day, so its target has `k ≥ 1` (the generator requires a third
settling capture on the day) and its gap is `4000 / (k + 2) ≤ 1,333 < ε` —
`documented_truly_ambiguous`, since the twins are AMB-1's and material by
`AMB1_MIN_CREDIT_PAISE`. The frozen engine, with `SE5 = 0` on every candidate,
sees both as AMB-1: `AMBIGUOUS` / `EVIDENCE_TIE` with a `0` gap. That is the
family's purpose — to give metric M-B a non-empty denominator on which the
engine's verdict and the specification's differ — and it is why G-B is
satisfiable. Built inside its one-session time box; measured at test seeds
7001–7003 as `2000` on every `S₂` and `181–211` on every `S₁` (`k` 17–20).

---

## 4. The seven metrics — `packages/eval/src/metrics/bench-v2.ts`

Every metric is emitted as `(numerator, denominator, excluded, excluded_by,
value)`; a zero denominator prints **`DENOMINATOR_EMPTY`**, never `0` or `NaN`;
the excluded count appears **inline in the headline sentence**, never in a
footnote (`formatBenchV2Metric`). Per family and overall, from the same units,
tallied per dataset and summed (never pooled by target id). Sets: `A` =
targets the agent abstained on (`AgentRun.abstentions`), `T`, `D`, `S` as in
§2.4, `X` = `SEARCH_BOUND_ORACLE` (excluded from every population, counted),
`U` = abstained ids the oracle labelled as no target at all.

```
  M-A  abstention_recall         = |A ∩ T| / |T|                         excluded: X
  M-B  false_abstention_rate     = |A ∩ D| / |D|                         excluded: X
  M-C  abstention_precision      = |A ∩ T| / |A ∖ (A ∩ X) ∖ U|
                                   — the denominator EXCLUDES search-bound abstentions (A ∩ X)
                                   and unlabelled abstentions (U), each counted and named inline
                                                                         excluded: SEARCH_BOUND_ORACLE |A ∩ X|,
                                                                                   NOT_A_LABELLED_TARGET |U|
  M-D  forced choice, arm A2-NOABSTAIN against ASSAY, on T — REPORTED, NOT A HEADLINE:
       share  misbooked_share = value_paise / contested_paise
                                   contested_paise = Σ |amount| over the DETACHED entities (observed
                                   settlement_id null) A2 committed on t ∈ T ∩ A_ASSAY — the ambiguous
                                   value A2 had to choose an owner for. Printed beside the corpus's
                                   total settlement value, and labelled
                                   "≈0.5 by construction; measured to confirm the arm behaves as modelled".
       value  value_paise = Σ |amount(e)| over A2 edges e onto t ∈ T ∩ A_ASSAY with true_target(e) ≠ t
                                   — anchored members of a wrong allocation are correctly placed and
                                   not charged. excluded, named inline: EXCEPTED_NO_ALLOCATION,
                                   NOT_HELD_BY_REFERENCE (T ∖ A_ASSAY), X.
       rate   a2_misallocation_rate = |wrong| / |committed|            committed = T with ≥ 1 A2 allocation edge;
                                   wrong = some edge whose entity's true target ≠ t; excluded: X;
                                   EXCEPTED_NO_ALLOCATION (T with no A2 edge — the I2 → E05 half),
                                   counted separately, never folded in
  M-E  mean_documented_gap_bps   = Σ gap(t) / |A with gap defined|       excluded: GAP_UNDEFINED (A ∩ X, A ∩ non-exchangeable)
  M-F  certificate_reason_mix    = |A with a reason| / |A|, plus one count per reason   excluded: REASON_UNKNOWN
  M-G  spurious_abstention_rate  = |A ∩ S| / |S|                         excluded: X
```

**Why M-D is not a headline** (Work Order 3b, Part 2a). Its rupee value is
fixed by the generator's amount table, and its 0.5 by exchangeability: A2
commits one of two allocations no evidence separates, on a coin. Measuring it
confirms the ablation behaves as the construction says; it is not evidence
that abstaining is worth anything beyond that arithmetic. The first draft made
M-D's value the headline; that is withdrawn.

`unresolved_value_paise` appears in **no** metric above and nothing reads
`AgentRun.close` (V39). Where a target's value is reported at all it is per
target, beside its double-counted component, in the per-target row.

**M-B and M-G are different failures.** M-B asks whether the agent abstains
where the documented model would separate two admissible allocations; M-G asks
whether it abstains where there is only one allocation to find. `B01` populates
M-G; only `A04`'s `S₂` targets populate M-B.

### 4.1 The headline: the abstention profile, read together

**bench-v2's headline is M-A, M-G and M-B read as one profile** (Work Order
3b, Part 2b): M-A — does the agent abstain on documented-truly-ambiguous
targets; M-G — does it NOT abstain where there is one allocation; M-B — does
it ALSO abstain where the documented model could separate the allocations.

> **M-A = 1.0 alone is not evidence of evidential discrimination. With
> M-B = 1.0, abstention is admissibility- and materiality-based:** the agent
> abstains wherever two admissible allocations post materially differently,
> whether or not the evidence separates them.

`ASSAY` (and every arm but `ASSAY-PROBE`) is predicted to show exactly that
profile — M-A 1.0, M-G 0.0, **M-B 1.0**. `ASSAY-PROBE` is the arm in which
evidence can enter: it is predicted to show M-A 1.0, M-G 0.0, **M-B 0.0**. The
difference between the two profiles, on the same targets, is the measurement
of evidential discrimination this corpus makes — and V40 bounds it, before any
figure exists, to `k = 0` targets.

---

## 5. Predictions, with tolerance

Made from the construction and from the arms' behaviour at test seeds (§2.3;
never a corpus seed), before any block-P or block-S dataset exists.

**The arms.** `ASSAY` is the scored agent for M-A, M-B, M-C, M-E, M-F, M-G;
`A2-NOABSTAIN` for M-D. Under `llm_mode = offline` (§1.1) `A1-NOVALIDATE` and
`A3-NOLLM` are predicted identical to `ASSAY` on every line (V35's mechanism:
nothing here engages the validation layer differently, and `ASSAY` offline
*is* `A3-NOLLM`). `B0-IDONLY` never abstains and is predicted `M-A = 0`,
`M-C`/`M-E`/`M-F = DENOMINATOR_EMPTY`, `M-G = 0`. `B2-LLM-DIRECT` is **not
scored**: it refuses to run (`apps/cli/src/agents/b2.ts`; `DECISION_BRIEF.md
§F` F2). `ASSAY-PROBE` (`EVALUATION_SPEC.md §3.3`) is predicted in §5.2.

### 5.1 `ASSAY` (= `A1-NOVALIDATE` = `A3-NOLLM`) and `A2-NOABSTAIN`

| metric | population | prediction | tolerance | reasoning (one sentence) |
|---|---|---|---|---|
| **M-A** | block P | **1.000** (255 / 255, 0 excluded) | ≥ 0.95 | The engine abstained on every twin pair of `A01`, `A02` and `A04` at test seeds, the τ guard keeps every materiality ≥ ₹1 clear of both τ formulas, and one miss reads 0.996. |
| **M-A** | block S | **1.000** (30 / 30, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | ≥ 0.95 | Same mechanism on `A01`; `A05`'s three targets per seed are `X` and leave the denominator by declaration. |
| **M-B** | block P | **1.000** (51 / 51, 0 excluded) — **expected poor; a reported result** | ≥ 0.95 | The frozen engine's `SE5` is `0` before a probe it never dispatches, so `A04`'s `S₂` is indistinguishable from AMB-1 to it and it abstains on every one; this is V40's finding measured, not a target to be tuned toward. |
| **M-B** | block S | `DENOMINATOR_EMPTY` (0 / 0, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | exact | Block S carries no `A04`. |
| M-C | block P | **0.833** (255 / 306, 0 excluded) | [0.80, 0.86] | Per seed 18 abstentions of which 15 are `T` and 3 are `A04`'s `D`; a spurious abstention on `A03` or `B01` (predicted 0) would lower it. |
| M-C | block S | **1.000** (30 / 30, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | ≥ 0.95 | Every abstention in block S outside `X` is on `A01`. |
| M-D share | block P (`A2-NOABSTAIN` vs `ASSAY`) | **0.50 — ≈0.5 by construction; measured to confirm the arm behaves as modelled** — beside the corpus's total settlement value (reported, not predicted) | 95 % interval **[0.25, 0.75]** | A2 commits one of two exchangeable allocations on the twin-batch coin (`A01`/`A04`) or on which target posts first (`A02`), and the share is value-weighted, so its interval is the 2.5–97.5 % range of 200,000 fixed-seed Monte-Carlo draws over the frozen amount table (`scripts/predict-bench-v2-md.mjs`, 17 seeds). |
| M-D share | block S | **0.50**, same label | [0.09, 0.91] | Same draw on `A01`'s fifteen coupled pairs alone; the band is wide because fifteen value-weighted coins over a heavy-tailed table is a small sample. |
| M-D rate | block P | **0.50** (≈ 64 / 128, **≈ 127 EXCEPTED_NO_ALLOCATION**, 0 excluded (SEARCH_BOUND_ORACLE 0)) | [0.41, 0.59] | On a coupled pair one target commits and the other fails `I2` into `E05` (§C.2), so about half of `T` is excepted and reported beside the rate; the committed allocation is wrong on the coin (the tie-break was truth on 60/120 over twenty test seeds); Monte-Carlo 95 % range at `n ≈ 128`. |
| M-D rate | block S | **0.50** (≈ 8 / 15, **≈ 15 EXCEPTED_NO_ALLOCATION**, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | [0.27, 0.73] | Same mechanism on `A01` alone, `n = 15`. |
| M-D value | block P | reported, not a headline: median **265,625,607 paise** | [140,691,034, 605,424,067] | The same Monte-Carlo draw; fixed by the amount table, which is why it is not a headline (§4). |
| M-D value | block S | reported: median **34,537,671 paise** | [9,215,321, 180,240,279] | As above, `A01` alone. |
| M-E | block P | **≈ 670 bps** | [560, 780] | Per seed `6 × ~390` (`A01`, `k` 4–15) `+ 6 × ~520` (`A02`, `u + w = 3`) `+ 3 × ~205` (`A04 S₁`, `k` 17–20) `+ 3 × 2000` (`A04 S₂`) over 18, measured at 7001–7003 as 406/511/1105 per family; the band is the spread of `k`. |
| M-E | block S | **≈ 390 bps** (**15 excluded (GAP_UNDEFINED 15)**) | [320, 470] | `A01` alone; `A05`'s abstentions carry no defined gap and are named beside the mean. |
| M-F | block P | **EVIDENCE_TIE 306 / 306** | exact | Every split day carries a clean `bank_ref` on both halves by declaration, so materiality is defined on every twin target and `MATERIALITY_UNDETERMINED` cannot fire; no probe is dispatched, so no budget reason fires. |
| M-F | block S | **EVIDENCE_TIE 30, SEARCH_BOUND_EXCEEDED 15** (45 / 45) | exact | `A05`'s bound is `S2`'s and surfaces as `SEARCH_BOUND_EXCEEDED` on the certificate (§C.2 finding). |
| **M-G** | block P | **0.000** (0 / 204, 0 excluded) | ≤ 0.05 | `B01`'s twelve targets committed on every test seed; the rule-of-three bound on zero events at `n = 204` is 0.015. |
| **M-G** | block S | **0.000** (0 / 60, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | ≤ 0.05 | Same; `A05`'s bound targets are single-allocation to the oracle but `X` under the engine's bound, so they leave M-G's denominator by declaration rather than inflating it. |

### 5.2 `ASSAY-PROBE` — `A3-NOLLM` with the probe executor bound

Measured at test seeds 7001–7005 on every family before this revision (§2.3;
`apps/cli/tests/assay-probe.test.ts` pins 7001–7003). Its own §4 sets are the
same `T`, `D`, `S`, `X`.

| prediction | population | value | tolerance | reasoning (one sentence) |
|---|---|---|---|---|
| **M-B** | block P | **0.000** (0 / 51, 0 excluded) | exact | Every `A04` `S₂` has `k = 0`; one `fetch_settlement_recon` returns its true single member, `SE5` opens the full 2,000-bps gap (V40) and `S4` returns `DISCRIMINATED`. |
| `S₂` commits are correct | block P | **51 / 51 commit the TRUE twin** (100 %) | exact | The probe answer is the true constituent list (V41), so the only allocation `SE5` scores 1 is the true one. |
| probes naming each resolved `S₂` | block P | **exactly 1** per `S₂` (51) | exact | The context offers each settlement id once (§1.1, M63); the component's two settlements are each probed once, so each `A04` component spends exactly 2 and exactly one names `S₂`. |
| per-component attempts | blocks P, S | **≤ P_MAX = 3**, always; **2** on every `A01`, `A02` and `A04` component | exact | M64's per-component budget; a two-settlement component has two ids to offer, then `R3` declines. |
| probes spent | block P / block S | **306** (17 × 18) / **30** (5 × 6) | exact | 6 per `A01`, `A02` and `A04` instance; `A03`, `A05` and `B01` reach no `AMBIGUOUS` target and dispatch none. |
| AMB-1 / AMB-2 still abstain | block P / S | **all 102 + 102 / 30** abstain, reason **`NO_USEFUL_PROBE_AVAILABLE`**, gap > 0 and < ε | exact | V40: with `k ≥ 4` the post-probe `SE5` gap is at most `2000 · 2 / 6 = 667` bps on AMB-1 and `2000 · 3 / 7 = 857` on AMB-2, below ε plus `SE3`'s ≤ 469; both settlement ids are spent and `R3` declines with budget left. |
| AMB-3 | blocks P, S | **unchanged from `A3-NOLLM`**: `IMMATERIALLY_AMBIGUOUS`, commits; **no probe** | exact | Probing is gated on `AMBIGUOUS` alone and AMB-3 is sub-τ; the twin it commits is AMB-3's construction, not a probe outcome. |
| `A04` `S₁` still abstains | block P | **51 / 51**, `NO_USEFUL_PROBE_AVAILABLE`, 2 probes on the certificate | exact | V43: `S₁` is determined by elimination once `S₂` commits, and `S4` does not propagate it. |
| **M-A** | block P / S | **1.000** (255 / 255) / **1.000** (30 / 30, **15 excluded (SEARCH_BOUND_ORACLE 15)**) | ≥ 0.95 | Unchanged from `A3-NOLLM`: every documented-TA target has `k ≥ 1`. |
| **M-G** | block P / S | **0.000** (0 / 204) / **0.000** (0 / 60, **15 excluded**) | ≤ 0.05 | `B01` reaches no `AMBIGUOUS` target and never reads the report. |
| M-C | block P / S | **1.000** (255 / 255) / **1.000** (30 / 30, **15 excluded**) | ≥ 0.95 | `A04`'s `S₂` no longer abstains, so every abstention outside `X` is documented-TA. |
| M-E | block P / S | **≈ 405 bps** / **≈ 390 bps (15 excluded (GAP_UNDEFINED 15))** | [330, 480] / [320, 470] | Block P's mean loses the 2,000-bps `S₂` terms: `(6 × 390 + 6 × 520 + 3 × 205) / 15`. |
| M-F | block P / S | **NO_USEFUL_PROBE_AVAILABLE 255 / 255** / **NO_USEFUL_PROBE_AVAILABLE 30, SEARCH_BOUND_EXCEEDED 15** | exact | A probe was spent on every abstaining twin component and `R3` declined with budget left. |
| runtime | per instance | **≈ +0.4 s** over `A3-NOLLM`, the report read **once** per run | — | Measured at test seeds; the executor is memoised. |

**Populations G-A–G-C will find** (§2.4): `T` 255 and 30, `D` 51 and 0, `S`
204 and 60, `X` 0 and 15 — exact, by construction.

---

## 6. Success criterion and falsification

**bench-v2 supports its claim** — *that on a corpus where under-determination
is reachable, ASSAY's abstention tracks the documented model's
`documented_truly_ambiguous`, that it is admissibility- and materiality-based
until evidence is dispatched, and that once evidence is dispatched it
discriminates exactly where V40 says it can* — iff, on block P at the seal:

1. **The abstention profile (§4.1).** `ASSAY`: M-A ≥ 0.95 **and** M-G ≤ 0.05,
   reported beside M-B. `ASSAY-PROBE`: M-A ≥ 0.95, M-G ≤ 0.05 **and M-B = 0.0**.
2. `ASSAY-PROBE` commits **no** wrong allocation, and every `A04` `S₂` it
   commits is the true twin.
3. M-C ≥ 0.80 for `ASSAY` with the `A04`-`D` share accounted for.
4. M-F reports **no** `MATERIALITY_UNDETERMINED` on block P, in any arm.

M-D is not in the criterion (§4): its share is reported beside the corpus's
settlement value and is expected inside its band.

**M-B for `ASSAY` is expected to be poor, and it is a reported result — not a
defect to fix before sealing.** It is predicted **1.000**, which is poor by its
own name: the frozen engine abstains on targets the documented model would
resolve. That is V40's specification finding on the one family where it
bites, and the number is published as measured. **It is not a criterion
because the corpus was built knowing the engine cannot pass it**, and a
criterion the design already knows the outcome of is not a test. Nothing in
the engine, the corpus or the documented model is to be changed before the
seal to move it. `ASSAY-PROBE` — which dispatches its probe and computes `SE5`
— is measured on M-B against the same pre-registered denominator.

**What would FALSIFY, stated before the run** — any one suffices:

- **`ASSAY-PROBE` commits any wrong allocation**, on any family;
- **any component exceeds `P_MAX`** in any arm;
- **any `AMB-1` or `AMB-2` target, or any `A04` `S₁`, commits under
  `ASSAY-PROBE`** — which would mean V40's bound is wrong — or `ASSAY-PROBE`
  dispatches any probe on `A03`, `A05` or `B01`;
- **any default-arm pin drift** — `apps/cli/tests/default-arm-pin.test.ts`
  failing for `ASSAY`, `A2-NOABSTAIN` or `A3-NOLLM`;
- M-A < 0.95 in any arm (an arm commits on a documented-TA target — the τ
  guard or the construction is wrong); M-G > 0.05 (an arm abstains on a
  single-allocation target — a spurious abstention mechanism exists); M-D's
  rate outside [0.41, 0.59] on block P (the tie-break is not a coin — an
  information leak into `best`, §C.1 A3's R3 detector); any
  `MATERIALITY_UNDETERMINED` on block P (a split half lost its `bank_ref`).

**Not falsifying, and reported as such:** `ASSAY`'s M-B at 1.000; `X` on block
S; the excepted half of M-D's population; M-D's share or value outside its
interval (the amount table's tail, reported with the per-target rows that
produced it); `A03`'s six `I` targets per seed reaching `E05` under the frozen
engine (§C.2 finding); `A04`'s `S₁` abstaining under `ASSAY-PROBE` (V43).
**Unexpected and reported, not a success:** any `A04` `S₁` resolving.

**What is not claimed.** Nothing about production data; nothing about a
language model's probe selection (`R3` is the frozen deterministic policy,
§1.1); nothing about the realism of the recon report, which is generator-written
from the true state (V41) — `ASSAY-PROBE` measures whether the pipeline USES
faithful evidence; nothing about `SE2`/`SE4` (undeterminable); nothing about
`unresolved_value_paise` (V39). No cross-block aggregate is a headline: block
P and block S are reported side by side.

---

## 7. Step 5 — the seal gates, as they are implemented

`scripts/seal-bench-v2.mjs` (written at increment 3, **not run on any corpus**)
refuses, naming the gate and the reason, with a non-zero exit, unless all of:

```
  G-A  count(documented_truly_ambiguous) > 0     overall, and on every (block, seed)
  G-B  count(documented_discriminable)   > 0     overall, and on every block-P seed (A04 present); no escape hatch
  G-C  every headline denominator — ASSAY's OVERALL M-A, M-B, M-C, M-E, M-F, M-G and A2-NOABSTAIN's M-D,
       per block — is non-empty, OR is declared empty in §5 (M-B on block S, and a declared-empty
       denominator that turns out non-empty also refuses); M-D's committed set may be empty only if
       EXCEPTED_NO_ALLOCATION accounts for every documented-TA target of the block; and M-D's value
       must have been computed against the ASSAY reference arm (not NO_REFERENCE_ARM)
  G-D  docs/BENCH_V2_PREREGISTRATION.md is byte-identical to its content at the pre-registration
       commit — the commit that added it, or the revision named with --prereg-commit <sha> — which
       must touch the file, be an ancestor of HEAD and be on a remote-tracking branch, with no later
       commit touching the file. The commit SHA, its author date (a convenience — the EVIDENCE is the
       push time, recorded in the results document), the file's sha256 and every earlier version of
       the file (prior_versions) are recorded in the seal output
  G-E  nothing under runs/seal-v1.0.13/**, bench/test/** or bench/dev/** differs from the
       pre-registration commit, in HEAD or in the working tree (untracked files included)
  G-F  no corpus seed in the report lies in any range of scripts/test-seed-registry.json — the
       declared union of every seed any test file uses (§2.3)
```

It reads one input, the scored report of the seal order's scoring command, in
the shape its docblock fixes; `--check` evaluates every gate and writes
nothing; on success it writes `runs/bench-v2-seal/seal.json` and never
overwrites one. A refused seed is **burned** under AL7 and replaced by the
successor rule; nothing is re-run, re-rated or re-labelled to pass a gate.

**Tested before it is ever run for real** (Work Order 3b, 1.7):
`tests/seal-bench-v2.test.ts` runs the real script against throwaway git
repositories with a pushed remote and drives **every refusal path** — the four
`INPUT` refusals; G-A per seed and overall; G-B per seed and with no block P;
G-C's missing metric, undeclared empty denominator, declared-empty-but-filled,
missing reference arm and the `EXCEPTED_NO_ALLOCATION` admission; G-D's
never-committed, not-pushed, working-tree-differs, later-commit,
not-a-commit, does-not-touch and not-an-ancestor cases; G-E's untracked and
committed changes; G-F's registered seed and missing/malformed registry — and
the **all-pass path** (`--check`, a real seal with all six gates recorded, the
refusal to overwrite it, and a `--prereg-commit` revision listing its earlier
version).

---

## 8. Open items the seal order must close (recorded here, decided there)

1. **Rates.** Convention 1 (3 days) is pre-registered and **decided** (§2.1);
   `§C.3`'s 20 % case is not adopted.
2. **Seeds.** `9200–9216` and `9300–9304` are named and sized here (§2.2) and
   not yet declared in `seeds.ts`; declaring them is AL7 work for the seal
   order, and G-F checks them.
3. **The recon-report read for the documented model.** `packages/eval` takes
   the rows as a value; the `apps/cli` scoring command must read
   `bench/<split>/recon_report.jsonl` (split-scoped, as `assay generate` writes
   it) in a zone `fs/guard.ts` permits for scoring — today only
   `PROBE_DISPATCH` and the seal may. `ASSAY-PROBE`'s own read is the probe
   executor's, already `PROBE_DISPATCH`-zoned (M63). A new zone for the scorer
   is a guard change and is named here rather than made silently.
4. **Certificate reasons** reach `packages/eval` as a value per abstained
   target (`BenchV2Unit.certificate_reason_of_target`), read by `apps/cli` off
   its own `RunEvidence`; `AgentRun` is not widened.
5. **M-D's pairing.** The scoring command runs `ASSAY` and `A2-NOABSTAIN` on
   the same dataset and passes `ASSAY`'s abstentions to the `A2` unit as
   `reference_abstentions`, with `entityAmountsPaise(observations)`,
   `detachedEntityIds(observations)` and `settlementValuePaise(observations)`.
6. **The report shape** `scripts/seal-bench-v2.mjs` reads (its docblock) is the
   scoring command's output contract.
7. **`SPEC_VERSION`** stays 1.4.39 through this increment: no engine byte
   moved (M63–M66 are `apps/cli`, `packages/ledger`, `packages/probe` and
   `packages/eval` changes, each dormant or additive on every sealed and
   default-arm figure). The cascade fix after the seal moves it.
8. **The bench-v2 scoring path.** `assay generate` accepts only `§6.1` seeds
   and `assay bench` scores per `§6.1` unit; bench-v2's corpus needs its own
   generation and scoring path, which binds `ASSAY-PROBE` to the split's recon
   report as `assay bench` already does (`bindProbeExecutor`).

---

## 9. Amendments

G-D compares this file byte for byte with its content at the pre-registration
commit, so **an amendment refuses the seal by construction**. The one
exception: a revision made **before any bench-v2 corpus exists** — for example
on review of these predictions — is committed as a new commit and named to the
seal with `--prereg-commit <sha>`; the seal output then lists every earlier
version under `prior_versions`, so the revision is visible beside the result
rather than silent. After any corpus exists, there is no exception.

**Revision 1 — 2026-11-25, on review (Work Orders 3b and 3c), before any
corpus exists.** The first version (committed at increment 3 and **never
pushed**, so it carries no push-time evidence) is superseded by the commit
that carries this text, which the seal must name with `--prereg-commit`. What
changed, and nothing else:

- the evidence of order is the **push** time, recorded in the results
  document (header, §7 G-D);
- block P grows to **17 seeds** under the sample-size rule, with its runtime
  (§2.2); every block-P count in §2.4 and §5 is re-derived from it;
- the **test-seed disclosure** and gate **G-F** (§2.3, §7);
- **M-C's denominator** stated exactly (§4);
- the documented model's **`≥ ε` boundary**, aligned with
  `RECONCILIATION_SPEC.md §6` (§3.3) — no population moves;
- **`--llm=offline` for every arm**, with the v1.0.13 precedent, and `R3`
  stated to be the frozen deterministic policy (§1.1);
- **M-D demoted** to the share of ambiguous value A2 misbooks, beside the
  corpus's settlement value, "≈0.5 by construction" (§4, §5.1);
- **the headline is the abstention profile** M-A + M-G + M-B, with the
  statement that M-A alone is not evidence of evidential discrimination
  (§4.1);
- the **`ASSAY-PROBE` arm's predictions**, falsifiers and runtime (§5.2, §6),
  with `PREREGISTRATION.md §10` V41–V44 and `DATA_MODEL.md §22.2` M63–M66
  behind them;
- the seal gates' **tests** (§7).

Kept from the first version, unchanged in substance: the families, rates,
predicates, signal dispositions, open rules U1–U7, the full-information
reading, every `ASSAY` prediction and tolerance other than those re-derived
for 17 seeds, the `M-B is a reported result` statement, and §8's items 3–7.
