# EVALUATION_SPEC — ASSAY

**Spec version:** 1.4.37 · **Date:** 2026-09-02

**At spec 1.4.37** this document adds **one reading paragraph** to `§4.10` and changes
nothing else. Register row `DATA_MODEL.md §22.2` **M59** records that
`PREREGISTRATION.md §9` **step 0** has been taken and returned
`mean_bps = stddev_bps = 0` for all five `offline` Tier-0 keys, and ratifies that a
measured `(0, 0)` pair **is a baseline**: `metric17BaselineFor` returns it, the flag is
**computed** rather than reported UNAVAILABLE, and `§5.5`'s unavailable-with-reason
governs a key `§7` records **no pair** for rather than a key whose measured pair is
zero. The paragraph states the arithmetic consequence and **defines nothing**: on
`(0, 0)` the unchanged expression evaluates to `rate > 0 + 3 · 0`, so what the published
flag identifies for such a key is **the presence of any positive abstained `recon_line`
value**, not an excursion above a non-degenerate reference. **`§4.10`'s formula
`rate > baseline + k·σ` is preserved verbatim, `k_sigma` stays 3, and the rate's
numerator, denominator, universe, population, producer and consumer do not move** — M58's
encoding, rounding and transcription rules stand entire and M53's are untouched. The
measurement being zero follows from structure already recorded before the seal:
`PREREGISTRATION.md §10` **V17**'s fully `AN1`-anchored DEV population, `F08`'s
`DROP_SETTLEMENT_ID` being test-only, and **V28**'s test-only `F07`–`F10`. `§4.1`–`§4.9`
and `§4.11`–`§4.13` are unchanged, `§4.6`'s M57 semantics stand entire, `§5.1`–`§5.5` are
untouched, `§3.2`'s ablation table is untouched, and `§8`'s list stays at **28**.
**Benchmark stays v1.0.13.** **This amendment is taken after a measured figure exists**
and does not claim otherwise; the legitimacy argument is at `DATA_MODEL.md §22.2`
**M59**. See `DECISION_BRIEF.md §A.44` and `PREREGISTRATION.md §10` **V34**.

**At spec 1.4.36** this document supplies **metric 17's missing baseline encoding** in
`§4.10` and changes nothing else. Register row `DATA_MODEL.md §22.2` **M58** ratifies
that `PREREGISTRATION.md §7`'s `mean_bps` / `stddev_bps` are **integer basis points**,
that the five per-seed rates enter the mean and **sample** standard deviation at **full
precision**, that each statistic is converted to bps and rounded **exactly once** at the
end of `§9` **step 0** by **`round_half_up` with ties away from zero**, that the two
figures are rounded **independently**, and that the detector compares the run's
**full-precision** rate against the **rounded** pair. **`§4.10`'s formula
`rate > baseline + k·σ` is preserved verbatim, `k_sigma` stays 3, and the rate's
numerator, denominator and universe do not move** — what M58 supplies is the encoding
`§7` named and never stated. **This is metric 17's rule and not a claim that half-up is
this corpus's only rounding mode:** `§4.6`'s bin selection **floors** and `M27`'s
`mode_days` **floors**, both unchanged and not reopened. M58 also fixes that `§7`
remains the **authoritative** baseline record and `packages/eval/src/frozen.ts`'s
`METRIC_17_BASELINE` its **executable transcription**, empty until step 0 and
transcribed before `§9` step 1's tag. `§4.1`–`§4.9` and `§4.11`–`§4.13` are unchanged,
`§4.6`'s M57 semantics stand entire, `§5.1`–`§5.5` are untouched, and `§8`'s list stays
at **28**. Benchmark moves to **v1.0.13**. See `DECISION_BRIEF.md §A.43` and
`PREREGISTRATION.md §10` **V33**.

**At spec 1.4.35** this document supplies **metric 7's missing correctness
semantics** in `§4.6`, and changes nothing else. Register row `DATA_MODEL.md §22.2`
**M57**. `§4.6` fixed the formula, the ten equal-width bins, the reliability diagram
and the ε-gap scope, and stated **no correctness source for `accuracy(bin)`** — more
than one reading was admissible on the frozen text and they disagree on a decision
that asserts a **subset** of the true members, so the choice is **ratified rather
than dressed as derivation**, on the `M35`/`M49`/`M50`/`M55`/`M56` precedent. **The
formula is preserved verbatim** — `ECE = Σ_bins (n_bin / N) × | accuracy(bin) −
mean_score(bin) |` — as are the ten bins and `§5.4` item 7's reliability diagram;
what `§4.6` gains is the **population**, the **binned prediction** and the
**correctness predicate**. The population is `RECONCILIATION_SPEC.md §6` step 3's
**`DISCRIMINATED`** branch, the prediction is that decision's **ε-gap `Δs`**, and a
decision is correct **iff its allocation identity equals ground truth's for the same
target** — `M35`'s own term, reused rather than reinvented. **`§4.2` is read and NOT
amended**: its edge unit, its `FP`/`FN` clauses and its abstained/excepted exclusion
are untouched, and metric **5** remains the place partial credit is reported. **No
metric formula changes, none is added, none is removed and none is renumbered** — the
frozen list stays at **28**, `§5.4`'s thirteen obligations and `§5.5`'s forbidden
practices are unchanged, `§4.1`–`§4.5` and `§4.7`–`§4.13` are untouched, and `RunKey`
stays `(agent_id, split, seed, llm_mode)`. Benchmark v1.0.11 → **v1.0.12**;
`GT_VERSION` stays 1.1.0 and `constraint_set_hash` does not move. See
`DECISION_BRIEF.md §A.42` and `PREREGISTRATION.md §10` **V32**.

**At spec 1.4.34** this document is unchanged apart from the version header, and **`§2`
is the clause the amendment reads to settle the question**. Register row
`DATA_MODEL.md §22.2` **M56** rules that `PREREGISTRATION.md §6.2` `AL5` is an
**emission** rule, so the scorer reads ground truth at `§9` step 7 under `--sealed`.
`§2`'s protocol line — `score(agent output, ground truth, oracle labels) ->
metrics.json`, inside a loop over `{dev, test}` — is **read and not amended**: it is
the sentence that made the pre-M56 reading of `PREREGISTRATION.md §5.3` unexecutable,
and it says now exactly what it said before. `§2`'s first rule, **"No agent ever sees
ground truth or oracle labels"**, is likewise untouched and is state **A** of `M56`;
the scorer is not an agent, and `§4.2` and `§4.4` have always scored *"against ground
truth"*. **No metric definition, formula, universe or threshold changes**: `§4.1`–`§4.13`
are untouched, `§4.8`'s `M52` populations and `M55` per-case harm are unchanged, `§5.1`'s
ε grid and `§5.3`'s sweeps are unchanged, `§5.4`'s thirteen report obligations and
`§5.5`'s forbidden practices are unchanged — and `§5.5`'s bar on *"any number that does
not exist in a committed run artifact"* is one of the four grounds on which `M56`
rejects emitting `0.0` for an unavailable metric. What the amendment restores is the
**producibility** on the sealed path of metrics **2**, **3**, **5**, **6**, **7**,
**8**, **15**, **16** and **26**'s cost half. Benchmark moves to **v1.0.11**. See
`DECISION_BRIEF.md §A.41` and `PREREGISTRATION.md §10` **V31**.

**At spec 1.4.33** this document supplies **metric 15's per-case `balance_harm`** in
`§4.8`, and changes nothing else. Register row `DATA_MODEL.md §22.2` **M55**. `M52`
supplied metrics 15 and 16's two populations and closed by saying *"the formulas in
`§4.8` are unchanged; what is supplied is the universe"* — which left metric 15's
**numerator** with no per-case quantity to test, `§4.4(a)` defining `balance_harm_inr`
as a **run-level aggregate** whose absolute value sits outside the per-account
difference and which therefore does not decompose. `§4.8` now carries one
deterministic per-case decomposition, keyed by the injected observation's own
`source_entity_id` (`DATA_MODEL.md §16`, `§12`/`M28`), and the structural-zero rule
for a case that posts no line and stays in the denominator. **`§4.4` is read and NOT
amended** — its two formulas, its covered-set restriction, its Suspense exclusion and
its run-level `balance_harm_inr` are untouched, and the per-case figures do not sum to
it (`PREREGISTRATION.md §10` **V30**). **Metric 16 is untouched**, formula and both
populations, and `M52`'s populations are preserved **verbatim and unnarrowed**. **No
other metric formula changes, none is added, none is removed and none is renumbered**
— the frozen list stays at **28**, `§5.4`'s thirteen obligations and `§5.5`'s
forbidden practices are untouched, and `RunKey` stays `(agent_id, split, seed,
llm_mode)`. Benchmark v1.0.9 → **v1.0.10**; `GT_VERSION` stays 1.1.0 and
`constraint_set_hash` does not move. See `DECISION_BRIEF.md §A.40` and
`PREREGISTRATION.md §10` **V30**.

**At spec 1.4.32** this document closes the four evaluation-procedure gaps that
`§5.1`, `§5.3`, `§4.8`, `§4.10` and `§6` left open, in the one amendment cycle that
precedes generation. Register rows `DATA_MODEL.md §22.2` **M51**–**M54**. **`§2`'s
protocol loop** gains the nested sweeps it already reported but never produced;
**`§5.1`** gains the ε grid — `{0, 500, …, 10_000}` bps, 21 points, `1500` among them
— and states that the curve runs under `--llm=offline` with the replay curve deferred
to `DECISION_BRIEF.md §F` **F2**; **`§5.3`** becomes normative on each sweep's owner,
execution depth and output, and records that `C_review` **and** `C_exception` move
together over `{₹100, ₹250, ₹1,000}`; **`§4.8`** gains the two populations metrics 15
and 16 quantify over; **`§4.10`** gains `abstention_rate_by_value`'s universe; and
**`§6`** and `§5.4` item 5 record metric 10 as **not computable on the frozen
population**, with its reason. **No metric formula changes, none is added, none is
removed and none is renumbered** — the frozen list stays at **28**, `§5.4`'s
**thirteen** obligations and `§5.5`'s forbidden practices are untouched, and `RunKey`
stays `(agent_id, split, seed, llm_mode)`: a sweep point is an evaluation **inside**
one scored unit, never a fifth key dimension. What metrics 15, 16 and 17 gain is the
**universe** their formulas quantify over, on the benchmark-v1.0.3 precedent that
supplied metric 13's item partition. Benchmark v1.0.8 → **v1.0.9**; `GT_VERSION`
stays 1.1.0 and `constraint_set_hash` does not move. See `DECISION_BRIEF.md §A.39`
and `PREREGISTRATION.md §10` **V27**–**V29**.

**At spec 1.4.31** this document amends **§3.2's `A1-NOVALIDATE` row**, and adds one
sentence to `§5.4` item 5 and one bullet to `§6`. Two expectations that row carried
are **withdrawn** — *"runs end `BLOCKED`"*, which contradicts `§2`'s protocol, `§4.9`
and `PREREGISTRATION.md §8`'s metric 14, and *"trial balance breaks"*, which the
frozen ledger boundary makes structurally unreachable — and the row now states the
behaviour that boundary actually admits. *"Removed: Stage S5 invariants `I1`–`I9`"*
is ratified as **`S5` does not evaluate the allocation-scoped set `I1`–`I8`**, never
*"evaluate and ignore the failures"*. **No metric formula, definition, universe,
number or count changes** — the frozen list stays at **28**, `§5.4`'s **thirteen**
obligations and `§5.5`'s forbidden practices are untouched, and `§2`'s protocol,
`§4.9`'s close-loop block and metric 14's *"`BLOCKED` must be 0"* stand exactly as
written: it was the `A1` row that contradicted them. `§3.1`'s baselines,
`A2-NOABSTAIN`, `A3-NOLLM` and every `§4` definition are unchanged. Register row
`DATA_MODEL.md §22.2` **M50**; benchmark stays **v1.0.8**. See `DECISION_BRIEF.md
§A.38` and `PREREGISTRATION.md §10` **V26**.

**At spec 1.4.30** this document is unchanged apart from the version header.
Register row `DATA_MODEL.md §22.2` **M49** fixes `§17.1.1`'s *"the settlement it
is allocated to"* as the allocation under evaluation. **No metric formula,
definition, universe, number or count changes** — the frozen list stays at **28**
— and `§5.4`'s thirteen obligations, `§5.5`'s forbidden practices, `§5.3`'s τ
sensitivity sweep and `§4.13`'s `EXPLORATORY` line are untouched. **Metric
*values* will move**, because the clause makes `RECONCILIATION_SPEC.md §6`'s
`AMBIGUOUS` reachable and restores the `P2` bank leg on solved allocations; no
figure exists to move, `bench/` being absent and no scored run having been
produced. Benchmark v1.0.7 → **v1.0.8**. See `DECISION_BRIEF.md §A.37`.

**At spec 1.4.29** `§7`'s command block records the artifact locations a scored run
writes (register row `DATA_MODEL.md §22.2` M48): `metrics.json` is keyed
`(agent_id, split, seed, llm_mode)` at
`runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json`, `report.html` at
`runs/report.html`, and **scored run artifacts are committed**, which `§5.5`'s
*"committed run artifact"* rule and `PROJECT_SPEC.md §7` S10 already required. `assay
report` is confirmed as an eighth CLI command, its renderer staying in
`packages/eval/src/report/`. **No metric formula, definition, number or count
changes** — the frozen list stays at **28** — and `§5.4`'s thirteen obligations and
`§5.5`'s forbidden practices are untouched. `--record` and the live recording pass
stay **unresolved** under `DECISION_BRIEF.md §F` F2. Benchmark stays **v1.0.7**. See
`DECISION_BRIEF.md §A.36`.

**At spec 1.4.28** `§2`'s protocol and `§7`'s command block record that the `§5.3`
consistency draw is **frozen** at `PREREGISTRATION.md §7` (register row M44) —
`R = 20,000` unchanged, per `(dev, seed)` dataset, `CONSISTENCY_DRAW_SEED =
417203` — so `assay oracle --split dev --seeds 2000-2004` needs no draw flag and
`§7`'s reproducibility block returns to its frozen spelling. `§5.4` item 4 reads
the frozen seed from `oracle_gate.json` rather than an operator's. **No metric
formula, definition, number or count changes** — the frozen list stays at **28**,
none is added or removed, and `oracle_gate.json` is still not a metric. Benchmark
v1.0.6 → **v1.0.7**. See `DECISION_BRIEF.md §A.35`, `PREREGISTRATION.md §10`
**V25**.

**At spec 1.4.27** `§2`'s protocol and `§7`'s command block record the committed
artifact paths — dataset artifacts at `bench/<split>/<seed>/`, `recon_report.jsonl`
**unchanged** at `bench/<split>/` — and that **`apps/cli` runs both `§5.3` gates**,
consistency on **dev only**. `§5.4` item 4's oracle-gate line now names the artifact
it is read from. **No metric formula, definition, number or count changes** — the
frozen list stays at **28**, no metric is added or removed, and `oracle_gate.json` is
**not** a metric. Benchmark v1.0.5 → **v1.0.6**. See `DECISION_BRIEF.md §A.34`,
register rows **M42** and **M43**, `PREREGISTRATION.md §10` V24.

**At spec 1.4.26** `§3.2` records that the `A3-NOLLM` comparison is
**non-discriminating for `R3`** on the conforming v1.0.0 population. **No metric
formula, definition, number or count changes** — the frozen list stays at **28**,
`metric 24` `offline_parity` keeps its stated purpose, and `abstentions resolved per
probe spent` is **not** added and remains `EXPLORATORY` (`§4.13`). Benchmark v1.0.5
is unchanged. See `DECISION_BRIEF.md §A.33`, register row M41,
`PREREGISTRATION.md §10` V23.

**At spec 1.4.25** `§3.2`'s `A3-NOLLM` row records that the ablation's `R3` probe
policy is **pre-registered** at `PREREGISTRATION.md §7`. **No metric formula,
definition, number or count changes** — the frozen list stays at **28**, and no
metric is added. Benchmark v1.0.4 → **v1.0.5**. See `DECISION_BRIEF.md §A.32`.

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
      oracle consistency gate   (vs engine, differential)    MUST PASS, DEV ONLY
        both run by apps/cli (M43); results -> bench/<split>/<seed>/oracle_gate.json
      for agent in {ASSAY, B0, B2, A1, A2, A3}   (+ B1 if built):
        run agent on observations only, --llm=replay --strict-replay
        attempt period close -> CLOSED | OPEN | BLOCKED
        score(agent output, ground truth, oracle labels) -> metrics.json

        # NESTED SWEEPS (spec 1.4.32, register row M51). Every point below is an
        # evaluation INSIDE this scored unit and never an additional one: the
        # RunKey stays (agent_id, split, seed, llm_mode), and each point is
        # written into THIS metrics.json keyed by
        #   (RunKey, parameter_name, parameter_value).
        if agent in {ASSAY, A1}:                     # §5.1: the others are
          for eps in {0, 500, 1000, ..., 10_000}:    #   single points and get
            re-run agent at eps, --llm=offline       #   no curve
            -> (coverage_by_value, balance_harm)     # 21 points; 1500 is one
                                                     # metric 3, aurc_inr
        for tau_floor in {1_000, 10_000,             # paise: Rs 10 / 100 /
                          100_000, 1_000_000}:       #   1,000 / 10,000
          re-run agent at tau_floor                  # ENGINE ONLY. The oracle is
          -> (coverage_by_value,                     #   NOT re-run and
              count(AMBIGUOUS),                      #   oracle_labels.jsonl is
              count(IMMATERIALLY_AMBIGUOUS))         #   NOT regenerated (§5.3)
                                                     # metric 26, tau_sensitivity
        for c in {10_000, 25_000, 100_000}:          # paise: Rs 100 / 250 / 1,000
          re-score THIS unit at C_review = c         # NO re-run: post-hoc, and
                          and C_exception = c        #   both costs move together
          -> net_cost_inr                            # metric 26, c_review_sens.
  aggregate over seeds -> mean ± bootstrap 95% CI -> report.html
```

Rules:

- **No agent ever sees ground truth or oracle labels.** Enforced structurally
  (`PREREGISTRATION.md §6.2`, AL1–AL2). The completeness gate runs offline inside
  the generator's trust zone, before any agent exists.
- **The dataset unit is `(split, seed)`** (spec 1.4.27, `DATA_MODEL.md §22.2` M42).
  A seed's families are concatenated into one dataset in **F01..F10** order at
  `bench/<split>/<seed>/`; family is a composition dimension and never a file
  dimension. `bench/<split>/recon_report.jsonl` is **split-scoped and does not
  move** — it is `§6.2`'s probe surface, keyed by a globally unique
  `settlement_id`, never ingested, and therefore never partitioned (M36, M38).
- **The consistency gate is dev-scoped** (`PREREGISTRATION.md §5.3`,
  `ARCHITECTURE.md §7.3`: *"pairs drawn from the dev split"*). The loop line above
  runs it on `dev` alone; `test` runs the completeness gate only, exactly as
  `PREREGISTRATION.md §9` step 3 spells it. Its `R = 20,000` draw is **frozen** at
  `PREREGISTRATION.md §7` from spec 1.4.28 (register row M44) — sampler and seed
  together, `CONSISTENCY_DRAW_SEED = 417203`, one independent draw per
  `(dev, seed)` dataset — and `AL3` binds it. The seed is recorded beside the
  result; an override is non-authoritative and refused on a sealed or official
  run. The frozen sample bounds the gate's coverage, which `PREREGISTRATION.md
  §10` **V25** states.
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
- **A sweep point is an evaluation inside one scored unit, never a scored unit of
  its own** (spec 1.4.32, register row `DATA_MODEL.md §22.2` **M51**). Three
  clauses force it and none of them is amended. `§7`'s **M48** derives the scored
  unit as *"exactly four fields"* — `(agent_id, split, seed, llm_mode)` — and a
  fifth key dimension contradicts that derivation; `§7` says the bootstrap
  *"resamples `seed` and holds the other three fixed"*, which a fifth dimension
  falsifies; and `§5.4` item 5 with `§5.5` requires every frozen metric to carry a
  CI, so `aurc_inr` is **one scalar per scored unit** bootstrapped over seed, which
  places the whole curve inside it. `RunConfig` therefore keeps its four fields,
  and `§5.3`'s batch-size row is the contrast that settles it: this specification
  creates a **separate operation** where it wants one — *"a separate scaling run …
  produces no close-loop metric"* (`§4.7`) — and creates none for ε, τ or the cost
  parameters.
- **The three sweeps sit at three different execution depths, and this is read off
  the frozen text rather than chosen** (M51). ε is read at `RECONCILIATION_SPEC.md
  §6` step 3's `Δs ≥ ε` branch, inside stage **S4**, so an ε point is a **full
  agent re-execution**; the τ **floor** is read at the same step's materiality
  branch, so a τ point is likewise an agent re-execution, but the **oracle is not
  re-run** (`§5.3`); `C_review` and `C_exception` are read by the **scorer alone**
  — `§4.5` and `§4.3` — so a cost point is a post-hoc re-evaluation of one unit's
  artifacts and re-executes nothing.

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
| `A1-NOVALIDATE` | Stage S5's **evaluation** of the allocation-scoped invariants I1–I8 | *The deterministic validator prevents real financial error.* Expected: higher `balance_harm_inr` and `misdirected_value_inr`, hallucinated IDs admitted (metric 20's `id_rejection_rate` falls), and allocations S5 would have rejected **committed** rather than routed to an `E05` exception. The run reaches `CLOSED` or `OPEN` like every other agent. **Two expectations were withdrawn at spec 1.4.31 (register row `DATA_MODEL.md §22.2` M50) — *"trial balance breaks"* and *"runs end `BLOCKED`"*; see below.** |
| `A2-NOABSTAIN` | Abstention; always commits the top candidate | *Abstention is worth its cost.* Expected: coverage 100%, sharply higher harm and net cost, Suspense near zero — the "100% matched, 0 exceptions" failure mode, reproduced deliberately. |
| `A3-NOLLM` | All four LLM roles → the `offline` provider | *The LLM contributes measurably.* **This may fail, and failing is a legitimate result.** From spec 1.4.25 its `R3` probe policy is **pre-registered** (`PREREGISTRATION.md §7`, `AL3`, register row M39), so the control's probe spend is fixed before any figure exists. |

**`A1`'s two withdrawn expectations `[ASSAY-MODEL]`, spec 1.4.31, register row
`DATA_MODEL.md §22.2` M50.** Through spec 1.4.30 the row above expected *"trial
balance breaks, runs end `BLOCKED`"*. Both are withdrawn rather than restated, on
the `M41` precedent: an expectation the frozen text cannot admit is withdrawn, not
reported. **The hypothesis is untouched** — the validator still has to be shown to
prevent real financial error, and `PROJECT_SPEC.md §7` **S6** still asks `A1` for a
statistically significant ₹-harm increase.

- **`BLOCKED` is withdrawn because three frozen clauses forbid it and the fourth
  makes it self-defeating.** `§2`'s protocol closes *"A run that ends `BLOCKED` is a
  defect and fails the build"*; `§4.9` states *"`BLOCKED` must be **0 across every
  run** — it indicates a defect in ASSAY, not a property of the data"*;
  `PREREGISTRATION.md §8`'s metric 14 requires the same; and
  `RECONCILIATION_SPEC.md §10.2` marks a `BLOCKED` run **`invalid`** and emits no
  close report. S6 needs a figure with a confidence interval over ≥ 5 seeds, and
  `§5.5` bars *"any number that does not exist in a committed run artifact"* — so an
  `A1` that ended `BLOCKED` could not supply the number S6 is written to read. The
  expectation, if met, would destroy the criterion it exists to serve.
- **A broken trial balance is withdrawn because the ledger boundary makes it
  unreachable.** `I1` is re-checked **independently of `S5`** on the cumulative
  totals at every ledger append — `DATA_MODEL.md §17`: *"at every point in the event
  log, `Σ dr_paise === Σ cr_paise`"* — and `§17.1`'s `P1`–`P8` balance by
  construction, so no allocation reaching the one write path can leave the books
  unbalanced whatever `S5` evaluated. `PROJECT_SPEC.md §7` **S5** independently
  requires *"trial balance = 0 and Suspense identity exact on every run"*, and
  `ARCHITECTURE.md §12` makes a broken one *"a bug in the ledger itself"*. The
  sentence described an `ASSAY` defect, not a property of the ablation.

**What `A1` removes, stated so it cannot be read two ways (M50).** `A1` removes
`S5`'s **evaluation** of the allocation-scoped invariant set `I1`–`I8`. It does
**not** mean *"evaluate the invariants and ignore the failures"*, and that reading is
foreclosed rather than merely disfavoured: an evaluated failure must be recorded in
`invariants_failed`, and gate `G5` refuses to post an allocation carrying one — at
the write path and again at close — so the only way to express it is to record an
empty `invariants_failed` while failures were found, which falsifies the artifact and
is `THREAT_MODEL.md §T8`'s suppression rather than an ablation. `I9` is **run-scoped**
and `RECONCILIATION_SPEC.md §7` evaluates it *"only when the caller supplies both
hashes"*, so it is in neither arm's per-allocation set. An `A1` decision therefore
records `invariants_checked: []` **and** `invariants_failed: []`, and the second is
empty **because nothing was evaluated, not because nothing failed** — the first field
is what makes the removal visible in the run artifact. The removal is **one respect**,
as this section requires: `S5`'s certificate/abstention agreement, the
`ValidatedDecision` mint, the single write path and the whole `G1`–`G5` close gate
are `ASSAY`'s, unchanged.

**`A1`'s harm figure is a conservative lower bound, and the report must say so (M50,
`PREREGISTRATION.md §10` **V26**).** `I1` and the five close gates keep running, so
`A1` is *"`ASSAY` with the `S5` invariant gate removed"* and **not** *"an unvalidated
ledger"*. It understates what removing validation would cost a system with no such
boundary. The figure is reported with that statement attached, and no claim that `A1`
reproduces a fully unvalidated ledger may be made.

**`A3`'s `R3` arm is non-discriminating on v1.0.0 data `[ASSAY-MODEL]`, spec
1.4.26, register row M41.** The ablation stays valid and stays reported; what is
withdrawn is the affirmative claim that `R3` **beats** it. `DATA_MODEL.md §11.1`
leaves only settlement targets probeable and gives each one `settlement_id`; `§4.2`'s
`SE5` is target-scoped; M36 sources one probe; and `§4.5` prices none — **one probe,
one argument, zero cost**, so `PREREGISTRATION.md §7`'s policy is weakly dominant and
the arms can differ only in the model's disfavour. **No metric definition changes and
no metric is added**: `metric 24` `offline_parity` keeps the purpose `DECISION_BRIEF.md
§E.6` gives it — *"including the outcome where the model contributed nothing
measurable"* — and `R1` and `R2` remain live, discriminating roles it measures. The
probe count stays `EXPLORATORY` per `§4.13`. See `PREREGISTRATION.md §10` V23.

**`A3`'s `R3` policy is pre-registered, and this is what keeps the row above an
ablation `[ASSAY-MODEL]`, spec 1.4.25, register row M39.** `§3.2` requires an
ablation to differ from ASSAY *"in exactly one respect, so the difference is
attributable"*. Through spec 1.4.24 the `offline` provider's `R3` — which
`ARCHITECTURE.md §6.5` calls a *"static probe priority list"* and
`RECONCILIATION_SPEC.md §6.2` makes the comparand of *"abstentions resolved per
probe spent"* — was **stated nowhere**, so an implementer would have supplied it,
and `A3` would have differed from ASSAY in two respects: the provider, and a
hand-authored policy able to move `A3`'s figures for metrics 1, 2, 3, 4, 6, 8 and 9.
`PREREGISTRATION.md §7` now fixes it, `AL3` binds it, `DECISION_BRIEF.md §L.1`
rule 12 lists it and `§L.4` forbids revising it from a result. **No metric
definition changes and no metric is added**: this fixes an input to figures already
on `PREREGISTRATION.md §8`'s list of 28.

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

**Metric 7's population, binned prediction and correctness predicate, ratified at
spec 1.4.35 `[ASSAY-MODEL]`, register row `DATA_MODEL.md §22.2` M57.** Everything
above is **unchanged** — the formula, the ten equal-width bins, the reliability
diagram and the ε-gap scope. What this paragraph supplies is the three things the
section never stated: **which** decisions are binned, **which** number is binned,
and what makes one of them *right*. Through spec 1.4.34 `accuracy(bin)` had **no
correctness source in any frozen clause**; more than one reading was admissible and
they disagree numerically, so this is **ratified rather than dressed as a
derivation**, on the `M35`/`M49`/`M50`/`M55`/`M56` precedent.

```
  population    the scored unit's COMMITTED decisions carrying a non-null score --
                RECONCILIATION_SPEC.md §6 step 3's DISCRIMINATED branch, the one
                accept in which the ε-gap decided the gate.

  prediction    ONE COMMITTED DECISION = ONE PREDICTION. N is the number of such
                decisions in the scored unit; n_bin is the number falling in
                that bin.

  binned value  Δs = |evidence_score_bps(best) − evidence_score_bps(second)|,
                an integer in basis points -- the quantity DATA_MODEL.md §13
                carries as AmbiguityCertificate.evidence_score_gap_bps and §6
                names "the evidence gap".

  correctness   assert(d) = { (d.target_id, e) : e a member entity of d }
                truth(d)  = { (target_id, entity_id) : a TRUE allocation edge
                              whose target_id = d.target_id }
                correct(d)  iff  assert(d) = truth(d)        SET EQUALITY

  bins          ten equal-width bins of 1000 bps over the FULL 0..10_000 range,
                never the observed range; lower edge inclusive and upper edge
                exclusive, EXCEPT the tenth, which includes 10_000; an empty bin
                contributes no term to the sum.

  N = 0         the metric is published UNAVAILABLE with its reason. NEVER 0.0.
```

**The unit of correctness is the decision, and that is derived.** Every score in
this corpus is a property of a `Candidate` — `DATA_MODEL.md §11`: *"It orders
candidates and feeds the ε-margin ambiguity test"* — and a `Candidate` is a whole
allocation, `(target_id, member_obs_ids)`. **No frozen field carries a per-edge
score**, and `RECONCILIATION_SPEC.md §6`'s gate fires once per decision, so `N`
counts gate events. Binning an **edge** would replicate one gate event into as many
predictions as the allocation has members and weight `n_bin / N` by allocation size,
so a settlement with forty constituents would carry forty times the weight of one
gate event — the unit confusion `§4.2` warns against, running in the other direction.
`§4.2` chose the **edge** for a set-membership metric; metric 7's unit is fixed by
what carries the score, and that is the allocation.

**The population is derived, not chosen.** `§6` step 3 tests **materiality first**,
so a `UNIQUE` decision has no second solution and therefore **no `Δs` to bin** — one
would have to be invented, which `§5.5` bars — and an `IMMATERIALLY_AMBIGUOUS`
decision was decided by the materiality clause, whose own `§6.1` rationale is that
*"the ledger is identical either way"*, so the score influenced nothing and the
sentence above (*"the one place a soft score influences the gate"*) does not reach
it. An `AMBIGUOUS` decision **abstains**: `DATA_MODEL.md §13`'s
`Decision.chosen_candidate_id` is `null`, there is no committed allocation for
`accuracy(bin)` to test, and `§4.3`'s metrics 4 and the oracle own that population.
`INTRACTABLE` commits nothing. What remains is exactly `DISCRIMINATED`.

**What set equality decides, stated exhaustively so that no case is left to an
implementation.** A **strict subset** of the true member set for that target is
**incorrect**; a **superset** is **incorrect**; any differing member makes the
decision incorrect. A target the truth carries no allocation edge for gives
`truth(d) = ∅`, so any non-empty assertion against it is **incorrect**. An asserted
**empty** allocation is correct **only** against a true empty allocation, which is
`M35`'s own convention — *"a target with an empty allocation contributes the single
pair `(target_id, "")`"* — read here as a comparison rather than as a sort key.
Correctness is evaluated against the **full true member set for the decision's
target** and never against individual truth edges.

**`§4.2` is read and NOT substituted, and its exclusion is NOT imported.** `§4.2`'s
`FP`/`FN` clauses, its edge unit and its parenthesis *"(excluding
abstained/excepted)"* are untouched and continue to govern **metric 5**, which
remains the place partial credit is reported. Two consequences follow and both are
deliberate. First, an *"every asserted edge is true"* predicate would be `§4.2`'s
`FP` clause with its `FN` clause deleted, and `§4.2` pairs them precisely because
*"how much does it miss"* is a separate question — under that reading metric 7 would
calibrate `match_precision` and duplicate metric 5's numerator, while the claim the
gate actually makes is that **this allocation explains this target**, which is what
`§6` step 1 accepts, what stage `S5` validates and what `DATA_MODEL.md §17.1` posts.
Second, `§4.2`'s abstained/excepted exclusion exists to prevent **cost
double-counting** — *"`§4.5` already prices that decision at `C_review` or
`C_exception`"* — and metric 7 prices nothing, so the rationale does not reach it;
importing it would make one decision's correctness depend on the agent's **other**
decisions, so two agents asserting an identical allocation against identical truth
could be scored differently, which destroys the cross-agent comparability `§2`'s
protocol is built on.

**Three alternatives are rejected and preserved as rejected.** Calibrating
**`evidence_score_bps` itself** instead of `Δs`: the section's own purpose is that
*"an uncalibrated score cannot justify a threshold"*, and the only threshold this
corpus applies to a score-derived quantity is **ε**, which `§6` compares against
`Δs` and against nothing else — so that reading would calibrate a quantity no frozen
threshold is applied to and would justify no threshold at all. **Edge-level or
partial-credit correctness**, and **the edge as the prediction unit**: both are
refused on the grounds above. Leaving the metric **unresolved** is likewise
rejected: `§5.4` item 5 requires every metric on `PREREGISTRATION.md §8`'s list of
28 in the report, the gap was in this section's own text rather than in the
population, and `M54`'s disposition does not transfer — metric 10 has **no truth
axis**, while metric 7 has one whose definition was merely undetermined. None of
these may be adopted without reopening `M57`.

**The residual is declared rather than argued away**, at `PREREGISTRATION.md §10`
**V32**: set-equality correctness is **not equivalent** to edge-level correctness,
so metric 7 is not comparable with any externally computed edge-wise figure; and
because only score-consulting `DISCRIMINATED` decisions enter, sparse or empty bins
are a **structural property of the population** and are never grounds for changing
this definition.

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

**The two populations these metrics quantify over, supplied at spec 1.4.32
`[ASSAY-MODEL]`, register row `DATA_MODEL.md §22.2` M52.** Through spec 1.4.31
*"injected cases"*, *"injected records"* and *"matched clean controls"* were named
here and in `THREAT_MODEL.md §T9` M6 and **defined nowhere**, so metric 15's whole
denominator and metric 16's subtrahend had no computable universe. Both formulas
above are **unchanged**; what is supplied is what they range over — the defect
`PREREGISTRATION.md §8` records for metric 13 at benchmark v1.0.3, where a metric
quantified over *"each open Suspense item"* with no field defining an item.

```
  injected  = observations appearing in a GroundTruth.degradations record whose
              op is INJECT_NOTES or CONFLICT_REFERENCE

  matched   = observations in the SAME (split, seed) dataset, of an
  clean       Observation.kind present in that dataset's injected set, and
  control     appearing in NO degradations record
```

**Why those two operators and no others — derived.** `PREREGISTRATION.md §4.3`'s
frozen operator→family table assigns `INJECT_NOTES` and `CONFLICT_REFERENCE` to
**`F10`**, and `§4.1` calls `F10` *"Adversarial metadata — Merchant-controlled
`notes` fields carrying instruction-shaped text; conflicting references;
forged-looking IDs"*. The remaining exercised operators belong to `F08` (*"Bank
narration corruption"*) and `F04` (*"Duplicate bank credit"*) — an export-format
defect and a bank behaviour, neither an attack. Reading *"injected"* as *"degraded"*
is foreclosed by this section's own gloss: *"no LLM output is numeric and `I6`
rejects unknown IDs"* are defences against planted text and forged identifiers, and
neither is engaged by a truncated narration or an absent `settlement_id`.

**Why a population and not a pairing — derived.** `forced_abstention_rate` is a
**difference of two rates**, and a rate needs a set rather than a bijection. The
pairing reading would require either a `GroundTruth` field recording each injected
record's partner — moving `GT_VERSION` and making the truth artifact serve the
scorer — or a matching algorithm no frozen clause states. Neither is required by
this formula, so neither is adopted.

**What *"matched"* adds beyond *"clean"*, and why it is the kind — forced.** Both
populations are drawn from **one dataset**, so seed, period, generation parameters
and the agent under test are held constant by construction. The one further
restriction the metric's own arithmetic requires is `Observation.kind`: a control of
a kind that can never reach `ABSTAINED` (`DATA_MODEL.md §17.1.1`) contributes a
structural zero to a rate this metric subtracts. No further dimension is matched, and
`PREREGISTRATION.md §10` **V27** declares the residual.

**Both metrics are TEST-only, and the report says so on DEV — derived.**
`PREREGISTRATION.md §6.1` makes `F07`–`F10` test-only and assigns `F10` to seeds
**9100–9104** alone; `THREAT_MODEL.md §T9` M6 already scoped the metric to *"the
sealed adversarial split"*. On DEV the injected set is **empty**, so metrics 15 and
16 are undefined rather than zero and are reported *"not exercised on DEV"* — the
treatment `PREREGISTRATION.md §10` **V14** already gives a DEV-unexercisable
quantity. **No `GroundTruth` field is added**: both populations are computed from
`degradations` and `Observation.kind`, which already exist, so `GT_VERSION` stays
`1.1.0` and no dataset is regenerated.

**Metric 15's per-case `balance_harm`, supplied at spec 1.4.33 `[ASSAY-MODEL]`,
register row `DATA_MODEL.md §22.2` M55.** M52 supplied the two **populations** above
and closed by stating that the formulas here are unchanged and *"what is supplied is
the universe"*. That left metric 15's **numerator** open: *"injected cases with
`balance_harm > 0`"* names a harm **per case**, and `§4.4(a)` defines
`balance_harm_inr` as a **run-level aggregate** — the absolute value taken **outside**
the per-account difference, over the whole covered set at once. Such an aggregate does
not decompose, so no per-case quantity followed from it.

```
  case_balance_harm(o) = Σ over AccountCode (excluding Suspense)
                           | proj_agent_o(acct) − proj_truth_o(acct) |

    where proj_agent_o and proj_truth_o are §4.4(a)'s two projections, EACH
    restricted to the journal lines whose `source_entity_id` equals `o`'s own
    business identifier, and §4.4(a)'s covered-set scope applies unchanged.

  injection_financial_success_rate = |{ o ∈ injected : case_balance_harm(o) > 0 }|
                                     / |injected|
```

**The key is the observation's own business identifier.** `DATA_MODEL.md §16` fixes
`source_entity_id` as *"the identifier of the observation whose obligation the posting
records"* and names the agent-side field *"named identically so that the two journals
join structure to structure"*; `§12` (register row **M28**) fixes the relation between
that identifier and the observation, and derives that it is **one-to-one on a
conforming dataset** — `DUPLICATE_ROW` is scoped to `bank_line`, so *"no `entity_id`
maps to two observations"*.

**The structural zero, and why the case stays in the denominator.** An injected
observation of a **reference kind** — `DATA_MODEL.md §10.1` gives `payment` and
`order` *"never posts a journal line, never enters a coverage numerator or
denominator"*, and `§4.4` says *"(REFERENCE observations post nothing and enter none
of these sets)"* — or one whose business identifier falls outside `§16`'s
`source_entity_id` grammar `pay_… | rfnd_… | adj_… | setl_… | bnk_…`, such as an
`order_…`, is not covered and moves no account. Its `case_balance_harm` is `0` **by
the frozen text rather than by exclusion**, and it therefore **remains in the
denominator**. Removing it would narrow M52's population, and this section requires
the opposite: *"Measuring it anyway is the point."*

**This is a ratification, and two readings are rejected.** At least three attributions
are admissible and none excludes the others, so M55 is marked **ratified** rather than
derived, on the `M35`/`M49`/`M50` precedent. Rejected, and preserved as rejected: the
**leave-one-out marginal** — recomputing `balance_harm_inr` with `o` removed from the
covered set — because it makes one case's figure a function of every other case's, so
the number would not be a property of the injection, and cancellation would let a
genuine harm read `0`; and substituting **`§4.4(b)`'s `misdirected_value_inr`**, which
is natively per-entity but answers `§4.4(b)`'s question, the two being *"reported
separately"* here precisely because *"a system can be good at one and bad at the
other"*. The **agent-side** restriction is part of the ratification and not a reading
of `§4.4(a)`, which keys `proj_agent` by *"whose owning decision is `RECONCILED`"* and
applies no `source_entity_id` predicate.

**`§4.4` is not amended and the figures are not additive.** `balance_harm_inr` keeps
its definition and its published value; the per-case figures **do not sum to it**, and
metric 15 publishes the share of injected cases carrying their own non-zero
account-level difference rather than a partition of the run-level number. No
additivity may be claimed or implied. `PREREGISTRATION.md §10` **V30** carries the
residual and is reported beside the metric. **Metric 16 is untouched** — neither
`forced_abstention_rate`'s formula nor either of its populations above — and no
`GroundTruth` field is added, so `GT_VERSION` stays `1.1.0`.

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

**`abstention_rate_by_value`'s universe, supplied at spec 1.4.32
`[ASSAY-MODEL]`, register row `DATA_MODEL.md §22.2` M53.** The quantity was named
here and in `DATA_MODEL.md §21` and **defined nowhere** — no numerator, no
denominator — so metric 17 was not computable. The formula
`rate > baseline + k·σ` is **unchanged** and `k_sigma = 3` is unchanged:

```
  abstention_rate_by_value = Σ recon_line.amount over recon_line observations
                             whose component reached ABSTAINED
                             ───────────────────────────────────────────────
                                          batch_value_paise
```

**Both sides sit on the `recon_line` universe, and `§4.1`'s four constraints force
it unchanged.** The denominator must be computable from observations alone,
agent-independent, carry each economic event once, and be rupee-denominated;
`batch_value_paise = Σ recon_line.amount` is the one candidate satisfying all four,
and `§4.9` already uses it as the close denominator. A numerator over **all**
observations against this denominator is unbounded above, and a numerator and
denominator both over all observations reproduces exactly the defect `§4.1`
corrected — *"one economic rupee is counted several times on both sides at
inconsistent weights, and the ratio is not bounded by 1.0"*. A universe of open
Suspense items is likewise refused: `DATA_MODEL.md §17.1.1` gives seven exception
classes no item, so the rate would silently exclude value the flag exists to detect,
and it would be a close-loop quantity rather than an abstention rate.

**The baseline is a frozen constant, not a computation.** It is
`PREREGISTRATION.md §7`'s — the mean and **sample** standard deviation of this rate
over the five DEV seeds `2000`–`2004`, keyed per `(agent_id, llm_mode)` and produced
by `§9`'s **non-scored pre-seal DEV baseline pass**. TEST scoring **reads** that
pair and computes no baseline of its own; no run contributes to the baseline it is
judged against. `PREREGISTRATION.md §10` **V28** declares the residual: the baseline
is built on DEV's `F01`–`F06`, while the flag's expected firing site is `F10` at
seeds `9100`–`9104` beside `F07`–`F09`, so the comparison crosses a
family-composition boundary and `n = 5` bounds what a `3σ` bar can resolve.

**The baseline pair's encoding, supplied at spec 1.4.36 `[ASSAY-MODEL]`, register row
`DATA_MODEL.md §22.2` M58.** `PREREGISTRATION.md §7` named the fields `mean_bps` and
`stddev_bps` and stated **no rounding rule**; two readings were admissible and they
disagree numerically, therefore on the flag. **The formula above is unchanged and
`k_sigma = 3` is unchanged.** The encoding is:

```
  mean_bps, stddev_bps    INTEGER basis points (DATA_MODEL.md §0 rule 5 — the pair
                          is a dimensionless ratio that a detector COMPARES, so
                          rule 5's main clause binds it and its §20 carve-out,
                          which is enumerated, closed and conditioned on values
                          "computed at render from the authoritative integer paise
                          fields", does not reach it)

  inputs                  the five per-seed rates enter the mean and the SAMPLE
                          standard deviation at FULL PRECISION; they are NOT
                          rounded first

  when                    each statistic is converted to bps and rounded EXACTLY
                          ONCE, at the end of PREREGISTRATION.md §9 step 0's
                          arithmetic

  mode                    round_half_up, ties away from zero

  independence            mean_bps and stddev_bps are rounded INDEPENDENTLY, each
                          from its own full-precision result; stddev_bps is never
                          re-derived from mean_bps nor from rounded inputs

  what the detector reads the ROUNDED pair, against the run's own FULL-PRECISION
                          rate:
                            abstention_spike_flag =
                              rate > mean_bps / 10_000
                                     + k_sigma * stddev_bps / 10_000
                          NO SECOND, UNROUNDED BASELINE EXISTS ANYWHERE.
```

**This is metric 17's rule and it is not a claim about the corpus.** Half-up is **not**
this corpus's only rounding or quantization mode: `§4.6`'s bin selection **floors**,
`M27`'s `mode_days` **floors**, and remainder distribution **floors**. Those rules are
unchanged and are not reopened. What M58 takes from `M27` is its **structure** — `M27`
quantized the recorded, compared term while leaving `lag_days` *"the unfloored real
quotient"*, and M58 quantizes the recorded baseline pair while leaving the run's rate
at full precision.

**Where the pair lives.** `PREREGISTRATION.md §7` is the **authoritative
human-readable** record and `packages/eval/src/frozen.ts`'s `METRIC_17_BASELINE` is its
**executable transcription** — empty before `§9` step 0, written into **both** after
step 0 and **before** step 1's tag, never recomputed at scoring time, never a
`BenchmarkManifest` field, and any divergence between the two a **seal/reproducibility
failure**. Where `§7` records **no row** for a scored unit's `(agent_id, llm_mode)`,
the **flag** is published **UNAVAILABLE with its reason** and never `false` — a
detector reporting *"no spike"* against a baseline it does not have is the broken
detector this section names, and `§5.5` bars a number that does not exist in a
committed run artifact. The **rate** is published regardless.

`PREREGISTRATION.md §10` **V33** declares this ruling's own residual: a full-precision
rate against a quantized bar moves the comparison by up to `2` bps, and a genuinely
non-zero `σ` below `0.5` bps records as `0`.

**A measured `(0, 0)` pair is a baseline, and the bar it makes — reading supplied at
spec 1.4.37 `[ASSAY-MODEL]`, register row `DATA_MODEL.md §22.2` M59.**
`PREREGISTRATION.md §9` step 0 has been taken and recorded `mean_bps = stddev_bps = 0`
for all five `offline` Tier-0 keys. **Nothing in this section changes**: the formula
above is preserved verbatim, `k_sigma` stays `3`, and the rate's numerator, denominator,
universe, population, producer and consumer do not move. What is stated is a
**consequence of applying the frozen expression to a measured input**, and it is
arithmetic rather than a definition:

```
  a measured (0, 0)       IS a baseline. metric17BaselineFor returns the row, the
                          FLAG IS COMPUTED, and §5.5's "unavailable with its
                          reason" is NOT engaged -- that rule governs a key §7
                          records NO PAIR for, which is a different condition from
                          a key whose measured pair is zero.

  the bar it makes        rate > 0 / 10_000 + 3 * 0 / 10_000
                            = rate > 0 + 3 * 0
                            = rate > 0

  what the flag means     the comparison is STRICT, so a scored run carrying no
                          abstained recon_line value yields FALSE and one carrying
                          ANY positive abstained recon_line value yields TRUE. For
                          such a key the published flag identifies THE PRESENCE OF
                          ANY POSITIVE ABSTAINED recon_line VALUE, not an excursion
                          above a non-degenerate reference; "spike" in the field's
                          name is read with this paragraph attached.
```

**This section's own expectation is met on its own terms.** A clean split does not
fire and the `F10` adversarial split, carrying abstained value, does — so the flag is
neither the *"broken baseline"* that fires everywhere nor the *"broken detector"* that
fires nowhere. **No frequency, magnitude or expected firing rate is asserted here**, no
scored run existing.

**Why the measurement is zero is already on the record and is not a new finding.**
`PREREGISTRATION.md §10` **V17** states that *"every DEV settlement is fully
`AN1`-anchored"* because `F08`'s `DROP_SETTLEMENT_ID` is **test-only**, so *"the
completeness gate passes on DEV without ever enumerating a candidate"*; **V28** states
that `§6.1` makes `F07`–`F10` test-only. A population enumerating no candidate presents
no `AMBIGUOUS` or `INTRACTABLE` target, so `RECONCILIATION_SPEC.md §9`'s abstention
branch is not reached and no `recon_line` reaches `ABSTAINED`. `A2-NOABSTAIN` is zero on
a second and independent ground, being the agent `§3.2` defines as never abstaining.
`PREREGISTRATION.md §10` **V34** declares this reading's residual: on such a bar the
flag's power to discriminate a graded abstention increase is absent by construction, and
neither the DEV population nor this detector may be changed in response — `§6.2` **AL3**
and `DECISION_BRIEF.md §L.4` forbid revising a pre-registered quantity from a result.

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

**The ε grid, ratified at spec 1.4.32 `[ASSAY-MODEL]`, register row `DATA_MODEL.md
§22.2` M51.** Through spec 1.4.31 this section declared the interval and no
discretization, so metric 3 — a **primary** metric — had no determinate procedure
and an implementer's grid would have parameterized it after the fact. The grid is
frozen in `PREREGISTRATION.md §7`, bound by `§6.2` `AL3` and listed in
`DECISION_BRIEF.md §L.1` rule 12, on the **M39** terms that froze the `A3-NOLLM`
probe policy — before any figure exists:

```
  ε grid   {0, 500, 1000, 1500, 2000, ..., 9500, 10_000} bps   21 points
```

**The step is forced up to one choice.** A uniform step `s` must divide `10_000` to
reach this section's declared endpoint and must divide `1500` so that the frozen
operating point lies on the curve, hence `s | gcd(10_000, 1500) = 500`; the coarsest
such `s` is **500**. Uniformity is the only free choice, and it is ratified rather
than derived.

**`ε = 1500` must be a grid point, and that is derived rather than convenient.**
`§5.2`'s table and `§5.4` item 5 report `coverage_by_value` and `balance_harm_inr`
at the frozen ε; `§5.1` plots those same two quantities as this curve's axes. A grid
omitting `1500` would publish a primary figure on which the run every other number
describes cannot be located, and a reader could not check one against the other.

**The curve runs under `--llm=offline`, and the replay curve is deferred to
`DECISION_BRIEF.md §F` F2 (M51).** Varying ε changes which components abstain and
therefore which `R3` probes fire, so a swept run's cache keys differ from the
recorded pass's; `§2` populates the cache from *"one recorded `--llm=<live provider>
--record` pass"* and `--strict-replay` makes a miss a hard error. Under F2's standing
disposition — *"Ship with `--llm=offline` + `replay` only"* — no live pass exists to
record the other 20 points. `--llm=offline` reaches no cache, and `§2` requires every
configuration to be run offline in any case (metric 24), so choosing it **adds no
obligation and opens no new branch**: metric 3 under `--llm=replay` is deferred
exactly as `DECISION_BRIEF.md §C` T0-10 defers `B2-LLM-DIRECT`, and the report says
which mode produced the curve.

**Only `ASSAY` and `A1-NOVALIDATE` are swept.** This section already says `B0`,
`B1`, `B2` and `A2` *"are single points"*; they contribute one point at the frozen ε
and no curve, and `metrics/risk-coverage.ts`'s `is_single_point` records that their
`AURC` is not comparable with a curve's.

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
| `C_review` **and `C_exception`, moved together** | ₹100 / ₹250 / ₹1,000 | Any conclusion that flips must be flagged as unstable |
| Batch size | 1k / 10k / 100k | Throughput scaling, deterministic path. Measures metrics 21 and 22 only; produces no close-loop metric and does not alter the dataset sizes frozen in `PREREGISTRATION.md §4.1` |

**The sweep procedure is normative from spec 1.4.32, register row `DATA_MODEL.md
§22.2` M51.** The table above declared four ranges and no procedure; what follows
states, for each, who executes it, what it re-runs and what it reports. Every point
is a nested evaluation inside one scored unit and is written into that unit's
`metrics.json` keyed `(RunKey, parameter_name, parameter_value)` — `§2`'s rules and
`§7`'s M48 layout, neither amended.

| Sweep | Owner | Re-runs | Reports |
|---|---|---|---|
| ε | `apps/cli` `bench` | the **agent**, S0–S5 and the ledger write, per point | `(coverage_by_value, balance_harm)` per point → metric 3 `aurc_inr` |
| τ **floor** | `apps/cli` `bench` | the **agent** only | `coverage_by_value`, `count(AMBIGUOUS)`, `count(IMMATERIALLY_AMBIGUOUS)` per point → metric 26 `tau_sensitivity` |
| `C_review` / `C_exception` | `packages/eval` scorer | **nothing** — post-hoc over one unit's artifacts | `net_cost_inr` per point → metric 26 `c_review_sensitivity` |
| Batch size | the `§4.7` separate scaling run | — | metrics 21 and 22 only |

**Why `apps/cli` owns the two that re-execute.** `ARCHITECTURE.md §10` and register
row **M37** keep the run loop out of `packages/eval` — *"hosting the run loop puts
the system under test inside the thing measuring it"* — and **M47** makes `apps/cli`
the composition root that constructs and injects agents. `packages/eval` integrates
points it is handed, which `metrics/risk-coverage.ts` already states of itself. The
cost sweep re-executes nothing and stays where it is.

**`tau_sensitivity`'s output is derived, not chosen.** `RECONCILIATION_SPEC.md §6.1`
states what this sweep exists to show — *"raising τ moves cases from `AMBIGUOUS` to
`IMMATERIALLY_AMBIGUOUS` and the shift is visible in the report.
`EVALUATION_SPEC.md §5.3` reports a τ sensitivity sweep **for exactly this
reason**"* — and this table's own *"Why"* column names coverage inflation beside it.
The three quantities above are that statement, and only that statement. **The τ
sweep moves the floor, not the rate**: `PREREGISTRATION.md §7` freezes
`τ = max(₹100, 10 bps of component value)`, this table's four figures are points for
the **floor**, and spec 1.4.6 already records that the sweep *"sweeps τ over absolute
values and does not read the base"*.

**The Ambiguity Oracle is not re-run at a swept τ, and `oracle_labels.jsonl` is
never regenerated, shadowed or overwritten (M51).** All three reported quantities are
**engine-side**: coverage is read off the decisions, and the two counts off stage
`S4`'s outcome (`RECONCILIATION_SPEC.md §6` step 3). None reads an oracle label. τ
enters the oracle only through `PREREGISTRATION.md §5.4`'s ambiguity definition,
which feeds **metric 4** — and metric 4 is not swept. The sealed artifact and its
`BenchmarkManifest.oracle_labels_sha256` are therefore untouched, `AL4`/`AL7`'s
aggregate-only rule on the test split is never approached, and this sweep creates
**no new artifact**.

**`C_review` and `C_exception` are swept together, over one shared point set
(M51).** `§4.5` opens *"`C_review` **and** `C_exception` are assumptions, not
measurements"* and continues *"A sensitivity sweep at ₹100 / ₹250 / ₹1,000 is
mandatory"*; `§4.5` again says the `E13` constant *"scales … with `C_exception`, so
the two move together"*; `PREREGISTRATION.md §8` says twice that *"metric 26's cost
sweep scales that term"*, which a fixed `C_exception` — an additive constant —
cannot do; and `DECISION_BRIEF.md §E` item 2 states it outright: *"both frozen,
**both swept at ₹100 / ₹250 / ₹1,000**"*. Holding `C_exception` at ₹500 makes four
frozen sentences vacuous. The contrary evidence is two **labels** — this row's
header through spec 1.4.31 and `§8`'s metric name `c_review_sensitivity` — and
`§8`'s rows 5, 6, 21, 22, 25 and 26 each name two or more quantities on one line, so
an under-inclusive label there is that section's own established form rather than a
statement of scope. **No scale factor is introduced**: both parameters take the same
three values. `C_exception`'s frozen **₹500 is deliberately not among them**, and
that is consistent rather than an oversight — this row's job is `§5.3`'s stability
verdict, *"any conclusion that flips"*, not a curve that must locate the reported
run. Only the ε grid carries that obligation, and `§5.1` discharges it.

### 5.4 What the report must contain

1. The synthetic-data disclosure from `PREREGISTRATION.md §2`, verbatim, first.
2. The positioning statement from `RELATED_WORK.md §1.4` — ASSAY consumes the
   Razorpay recon report as authoritative input and claims no gap in it.
3. The benchmark manifest hashes, the `constraint_set_hash`, and the seal commit SHA.
4. Oracle gate results: completeness and consistency, both passing, with the
   sample size used for the differential test — read from
   `bench/<split>/<seed>/oracle_gate.json` (spec 1.4.27, M43), together with the
   seed that produced the differential draw — `PREREGISTRATION.md §7`'s frozen
   `CONSISTENCY_DRAW_SEED` on any official run (spec 1.4.28, M44), and the report
   states plainly if a run used a non-authoritative override instead. On the test split the consistency gate does not
   run and the line says so; on the test split the completeness figures are
   aggregate only, `AL4` and `AL7` barring any record-level detail.
5. The full metric table with CIs, including every metric in the frozen list —
   **including the ones where ASSAY does poorly.** For `A1-NOVALIDATE` the table
   carries `invariants_checked` from the run artifact — the **empty set** (spec
   1.4.31, register row `DATA_MODEL.md §22.2` M50) — so the removed gate is shown
   rather than asserted, beside `PREREGISTRATION.md §10` **V26**'s statement that
   `A1`'s harm figure is a conservative lower bound. **Metric 10
   `exception_class_confusion` is carried in that table as `NOT COMPUTABLE ON THE
   FROZEN POPULATION`, with `§6`'s reason printed beside it** (spec 1.4.32, register
   row `DATA_MODEL.md §22.2` **M54**) — the metric keeps its number and its place on
   `PREREGISTRATION.md §8`'s list of 28, and what is published is its honest state
   rather than a fabricated matrix, `§5.5` barring *"any number that does not exist
   in a committed run artifact"*. **Metric 7 `ece` is carried in that table with
   `PREREGISTRATION.md §10` **V32** printed beside it** (spec 1.4.35, register row
   `DATA_MODEL.md §22.2` **M57**) — the ratified correctness predicate is set
   equality on the allocation, which is not equivalent to edge-level agreement, and
   a reader who cannot see that cannot compare the figure with an edge-wise one;
   where the `§4.6` population is empty for an agent the cell reads `UNAVAILABLE`
   with its reason and never `0.0`. This is an existing obligation read onto existing
   fields, and the count of obligations in this list is **thirteen**, unchanged.
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

- **Exception class confusion matrix — `NOT COMPUTABLE ON THE FROZEN POPULATION`,
  spec 1.4.32, register row `DATA_MODEL.md §22.2` M54.** The line's purpose is
  unchanged — *R2's classification against the generator's known cause*, measuring
  whether the triage is trustworthy — and metric 10 keeps its number and its place
  on `PREREGISTRATION.md §8`'s list of **28**. What is recorded is that the
  measurement has no truth side on this benchmark, and the reason is structural:
  **`GroundTruth` carries no exception-cause field** — `DATA_MODEL.md §1` declares
  `gt_version`, `seed`, `family_id`, `allocations`, `bank_mappings`,
  `ledger_mappings`, `true_journal`, `true_balances` and `degradations`, and none of
  them is a class — **and no frozen table supplies a mapping from a degradation
  operator to an `ExceptionClass`.** `PREREGISTRATION.md §4.3`'s table maps
  operators to **families**; `DATA_MODEL.md §15` maps a class to its **meaning**;
  `§17.1.1` runs the wrong way, `PREREGISTRATION.md §8` saying so in terms — *"`§17.1.1`
  selects a *posting* from a class, **never a class from a posting**"*. Constructing
  one is refused rather than deferred, on four frozen grounds: six exercised
  operators cannot cover fourteen classes; `E01`, `E02`, `E04`, `E10`, `E11`, `E12`
  and `E13` arise from the **true state**, which `PREREGISTRATION.md §4.3` puts
  beyond every operator's reach — *"applied to observations only, never to the true
  state"*; the relation is one-to-many and state-dependent, `DUPLICATE_ROW` reaching
  `E08` or `E09` and `MANGLE_UTR(TRUNCATE)` reaching `E14` only where a collision is
  realized; and a degraded record often reaches **no** exception at all,
  `DROP_SETTLEMENT_ID` being designed so that *"a soft path survives"*. Inventing the
  pairing is what `§4.3`'s own disposal rule forbids — *"Assigning them would invent
  a family pairing this specification does not state."* **What is published instead**
  is the computable half, labelled `EXPLORATORY` per `PREREGISTRATION.md §8`: the
  **marginal distribution of R2's assigned exception classes**, which is an agent
  output and does exist in the run artifact. It carries no truth axis, and **no
  claim of classification accuracy, triage trustworthiness or a confusion matrix may
  be made from it.** `E12` and `E13`'s existing exclusions are unchanged and are not
  the reason for this line. See `PREREGISTRATION.md §10` **V29**.
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
- **`A1-NOVALIDATE`'s `invariants_checked`, printed as the empty set** — spec
  1.4.31, register row `DATA_MODEL.md §22.2` **M50**. `ASSAY` and every other agent
  report the full allocation-scoped set `I1`–`I8` on every decision; `A1` reports
  `[]`, and `invariants_failed` is `[]` for both, for opposite reasons. No exception
  class, count, owner or value changes and the table's shape is untouched: what this
  line adds is the artifact-side evidence that the ablation removed the gate it
  claims to have removed, drawn from a committed run rather than from this document
  (`§5.5`).
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
  pnpm assay oracle   --split dev --seeds 2000-2004  # gates must pass (§5.3)
  pnpm assay bench    --split dev --agents all --llm offline
  pnpm assay bench    --split dev --agents all --llm replay --strict-replay
  pnpm assay report   --out runs/report.html
```

**Where a scored run's artifacts land, ratified at spec 1.4.29 (`DATA_MODEL.md §22.2`
M48).** The scored unit is `(agent_id, split, seed, llm_mode)` — the union of what
`ARCHITECTURE.md §10` and `DECISION_BRIEF.md §C` T0-9 each named in part, forced by
`RunConfig`, by `§L.1` rule 11 fixing `strict_replay` true on every scored run, and by
`§5.4` item 6 requiring `llm_mode` as a reported dimension. The bootstrap resamples
**`seed`** and holds the other three fixed, `§2` requiring *"≥ 5 seeds"* per
configuration.

```
  runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
  runs/report.html
```

**These are committed.** `§5.5` forbids *"Any number in the demo that does not exist in
a committed run artifact"*, `PROJECT_SPEC.md §7` `S10` and `DECISION_BRIEF.md §C`
T0-13 say the same, and through spec 1.4.28 `§K` and `.gitignore` excluded `runs/`
wholesale — so a conforming run produced numbers this section forbids reporting. The
SQLite database stays ignored; it is regenerable and is not an artifact any number is
traced to.

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

