# PREREGISTRATION — ASSAY Benchmark v1.0.0

**Spec version:** 1.1.1 · **Benchmark version:** 1.0.0

**Status: FROZEN on commit. Amendments require a version bump and a new seal.**
**Date frozen:** 2026-08-23 · **Sealed at:** _(pending — see §9)_

**Amendment 1.1.1 (pre-seal, factual correction).** Applied before the seal and
before any dataset was generated or any result existed. It corrects statements
about Razorpay behaviour that verification against current official documentation
found to be wrong or over-claimed, and adds a provenance classification to every
such statement (`DATA_MODEL.md §0` rule 6 and §22). **No metric, threshold,
scenario family, split, baseline, ablation, seed count or stopping rule changed.**
The three substantive changes are: the fee/GST arithmetic convention (§2, §4.2),
the UPI and netbanking fee constants (§4.2), and the `F07` mechanism (§4.1).
`DECISION_BRIEF.md §F` rows F6 and F7 are closed by this amendment.

This document is written **before any test-split result exists**. Its purpose is
to make post-hoc rationalisation impossible: metrics, thresholds, dataset
construction and stopping rules are all fixed here, and the git history proves
when.

---

## 1. Pre-registration discipline, and its honest limits

**What is committed here, before results:** the metric list, the harm function,
the abstention thresholds (τ, ε), the soft-evidence weights, the scenario
families, the train/dev/test split, the baselines and ablations, the number of
seeds, and the stopping rule.

**How the commitment is enforced:**

1. This file and the generator source are committed. The commit SHA is recorded
   in `benchmark_manifest.json`.
2. The test-split ground truth is generated and its `sha256` committed **before**
   any agent runs against it. The ground-truth file itself is gitignored and held
   back.
3. The repository is tagged `bench-v1.0.0` (signed) at seal time.
4. After the seal, **no changes to agent code are permitted before the results
   are recorded.** Any change invalidates the seal and requires a new benchmark
   version with fresh seeds.

**The limit, stated plainly and repeated in the final report:** this is
self-enforced pre-registration by a solo team. There is no third-party registry
and no external custodian of the sealed data. A determined author could break
every rule above and re-commit. What the git history establishes is *ordering* —
that the methodology existed before the numbers did — not incorruptibility.
Claiming more than that would be exactly the kind of overstatement this document
exists to prevent.

---

## 2. Data provenance — what is real and what is not

| Element | Provenance |
|---|---|
| API field names, types, units, value sets | **Real, and re-verified in spec 1.1.1** against the published API reference for `/v1/payments`, `/v1/orders`, `/v1/refunds`, `/v1/settlements`, `/v1/settlements/recon/combined` and `/v1/disputes`. That re-verification found and fixed four schema errors carried in 1.1.0: `card_network: "Amex"` (documented value is `American Express`), `speed_processed: "optimum"` (documented only for `speed_requested`), `Dispute.status` missing `under_review`, and card attributes placed on the Payment entity when they are settlement-recon columns. Each field's provenance class is recorded in `DATA_MODEL.md §22`. |
| ID grammars | **Prefixes real; suffix length assumed.** The `pay_` / `order_` / `rfnd_` / `setl_` / `adj_` / `disp_` prefixes are documented. The 14-character suffix is consistent across every official sample but is not stated as a contract, so it is a declared ASSAY assumption (`DATA_MODEL.md §0` rule 3). |
| Fee/GST arithmetic identity (`credit = amount − fee`, where `fee` is GST-inclusive and `tax` is the GST component inside it) | **Real, but sourced precisely.** The GST-inclusive convention is documented on the **Payment entity** (*"Fee (including GST) charged by Razorpay"*) and on the instant-settlement entity (*"Total amount (fees+tax)"*); the recon endpoint documents `tax` as *"the tax on the fee"*. The recon endpoint does **not** state the identity itself — ASSAY derives it, and says so. Spec 1.1.0's claim that `credit = amount − fee − tax` was "taken from the documented recon report schema" was false and is withdrawn (`DATA_MODEL.md §6`). |
| GST rate of 18% on the fee | **Real.** Stated on Razorpay's pricing documentation (*"2% + 18% GST"*) and corroborated by the documented Payment sample (`amount 2100, fee 50, tax 8`). The rate is statutory, not Razorpay-set. |
| Settlement `fees` / `tax` are 0 on a normal settlement | **Real.** Documented verbatim on the Settlements entity and shown in the `settlement.processed` webhook sample. |
| Settlement cycle baseline (T+2 **working** days, domestic; UTR present on every settlement) | **Real.** Documented Razorpay behaviour. ASSAY's calendar-day simulation of it, and its T+1/T+3 dispersion, are **synthetic** — see §4.2. |
| Calibration objects | **Real but tiny.** The test account holds 1 captured payment (₹300.00), 9 orders (1 paid), 0 refunds, 0 settlements, 0 recon rows. |
| Transaction volumes, merchant behaviour, distributions | **Synthetic.** Programmatically generated. |
| Bank statements, merchant ledgers | **Synthetic.** No real bank data exists in the test account. |
| Settlement and recon records | **Synthetic.** The test account returns `count: 0` for both endpoints. |

**Required disclosure, to appear verbatim in every report and demo:**

> ASSAY's benchmark is synthetic. Razorpay Test Mode exposes the settlement and
> recon endpoints but contains no settlement records, so no real settlement data
> was used or could be used. Real API contracts and real test-mode objects were
> used to calibrate the schema, arithmetic and identifier grammars of a
> programmatically generated financial universe.

Synthetic data is explicitly what Track 04 asks for. The disclosure exists so
that no reviewer can discover an overstatement we did not make ourselves.

---

## 3. Generation principle — ground truth by construction

The generator **simulates the business process forward** and records what
actually happened. Ground truth is a byproduct of construction:

```
  merchant behaviour model
      → orders → payment attempts → captures
      → fee + GST computed per method
      → settlement batching on the T+n cycle
      → bank credit emission (bank clock, value date)
      → refunds, partial refunds, adjustments, disputes
      → merchant ERP booking (merchant clock, own references)
                    │
                    ├──▶ TRUE STATE  (what happened)
                    │
              degradation layer
                    │
                    └──▶ OBSERVATIONS (what the systems recorded)
```

Three rules govern this, and violating any one invalidates the benchmark:

1. **No LLM is involved in generating data or ground truth.** Ground truth comes
   from the simulation's own bookkeeping.
2. **Ground truth is never authored as an annotation.** There is no
   `correct_answer` field written by a human or a model. There is no
   `is_ambiguous` label (see §5).
3. **The degradation layer only removes or corrupts information.** It never adds
   a hint, and it never knows what the solver will do with the result.

---

## 4. Scenario families

Twelve declared families. Each carries a required real-world justification —
a family that cannot state why it occurs in production is a manufactured puzzle,
and manufactured puzzles are what make adversarial evaluation look artificial.

### 4.1 Family table

| ID | Name | Real-world justification | Split |
|---|---|---|---|
| `F01` | Clean T+2 settlement | The baseline case; establishes that coverage is high when data is good | dev + test |
| `F02` | Partial refund crossing a settlement boundary | Refund initiated day N, settled in batch N+2; the single most common real break | dev + test |
| `F03` | Fee/GST rounding drift and a mid-period rate change | Pricing changes mid-month; half-paisa rounding accumulates over thousands of lines | dev + test |
| `F04` | Duplicate bank credit / re-presented UTR | Banks do re-present and double-post credits, especially around NEFT batch boundaries | dev + test |
| `F05` | Missing capture record | Authorised-but-uncaptured payments and PG report lag produce settled amounts with no capture row | dev + test |
| `F06` | Equal-amount collision | Two payments of identical amount, same day, same method; only one settles. Common for fixed-price SKUs | dev + test |
| `F07` | Chargeback deduction and later reversal | Razorpay documents that a lost dispute results in the amount being **deducted from the merchant's account** (the Dispute entity carries `amount_deducted`). ASSAY models the deduction as a debit adjustment line in one settlement and a subsequent win as a credit adjustment line in a later cycle. Corrected in spec 1.1.1: the previous `on_hold`-based mechanism was not supported — `on_hold` is documented as a Razorpay **Route transfer** flag, not a dispute mechanism | **test only** |
| `F08` | Bank narration corruption | Statement exports truncate narration (commonly ~35 chars) and mangle UTRs; `settlement_id` absent from the merchant's copy | **test only** |
| `F09` | Late / out-of-order arrival across a period boundary | T+3 settlements for month-end captures land in the next period | **test only** |
| `F10` | Adversarial metadata | Merchant-controlled `notes` fields carrying instruction-shaped text; conflicting references; forged-looking IDs | **test only** |
| `F11` | Multi-currency / FX settlement | Real for exporters, but a separate truth model | **specified, NOT IMPLEMENTED** |
| `F12` | Split settlement across two bank credits | Large settlements split by banking limits. **Not representable under the frozen model:** invariant `I5` ties a bank line to `Σ settlement.amount`, and the ground-truth `bank_mappings` shape records bank line → settlements with no per-bank-line partial amount, so a single settlement carried by two credits cannot be recorded or tied out. Implementing it would require changing `I5` and the ground-truth schema | **specified, NOT IMPLEMENTED** |

### 4.2 Frozen generation parameters

```
  Fee rates (basis points on gross, EX-GST; the observable `fee` field is
  GST-inclusive — see the fee model below and DATA_MODEL.md §6):
      card    : 200      upi : 200     netbanking : 200
      wallet  : 200      emi : 300
  GST on fee                : 1800 bps (18%)
  Rounding                  : half-up to nearest paisa, applied once per line
  Settlement cycle          : T+2 default; T+1 for 10% of batches; T+3 for 15%
                              (CALENDAR days — see the timing note below)
  Settlement window bound   : T_min = 1 day, T_max = 7 days   (constraint C4)
  F03 mid-period rate change: card 200 → 195 bps at 60% through the period
  Payment amount distribution: log-normal, median ₹1,850, p99 ₹2,40,000
  Refund rate               : 4.5% of captured payments; 40% of those partial
  Adjustment rate           : 0.8% of settlements
  Dispute rate              : 0.15% of captured payments
```

**The fee model, and what each number is `[RZP-DOC]` / `[ASSAY-MODEL]`.**

```
  fee_ex_gst = round_half_up(amount * rate_bps / 10_000)
  tax        = round_half_up(fee_ex_gst * 1800 / 10_000)
  fee        = fee_ex_gst + tax        // this is what the recon line carries
  credit     = amount - fee            // == amount - fee_ex_gst - tax
```

- `card`, `wallet`, `upi`, `netbanking` at **200 bps** — `[RZP-DOC]`. Razorpay's
  pricing documentation states 2% per transaction covering *"all modes cards, UPI,
  wallets, and net banking"*, and its structured pricing data declares
  `price: 2.00 PERCENT`. The documented Payment sample confirms it arithmetically
  (2% of ₹21.00 = 42 paise, +18% GST = `fee: 50`, `tax: 8`).
- **UPI corrected from 0 → 200 bps in spec 1.1.1.** Zero MDR is a bank/government
  rate, not Razorpay's charge: the pricing documentation states explicitly that
  *"a standard platform or technology fee of 2% will be applied"* to zero-MDR UPI.
  A 0-bps UPI leg would have distorted the fee mass across the whole benchmark on
  a factually wrong premise.
- **Netbanking corrected from 190 → 200 bps in spec 1.1.1.** No Razorpay source
  states 1.9%; the documented list price is 2%.
- `emi` at **300 bps** — `[RZP-DOC]`, but from Razorpay's official *blog* rather
  than its API or pricing reference (*"EMI, Corporate Cards, Amex/Diners, Pay
  Later, and certain premium methods are typically 3% + GST"*). This is a weaker
  source tier and is labelled as such.
- The **F03 mid-period change (200 → 195 bps)** is `[ASSAY-MODEL]`. Mid-period
  repricing is commercially real — Razorpay documents custom pricing above
  ₹5 Lakh monthly volume — but 195 bps is an invented figure standing in for
  "the rate changed," not a published Razorpay rate.
- **Instrument rates ASSAY does not model `[ASSAY-MODEL]`:** international cards
  (documented ~3%), international bank transfers (~1%), Amex / Diners / corporate
  cards (~3%), Pay Later (~3%), Credit Card on UPI (2.15%, stated on the pricing
  page). The generator emits none of these instruments, precisely so that no line
  carries a rate that misrepresents published pricing.

**A consequence of correction 3, stated before any result exists.** With card,
UPI, netbanking and wallet all at 200 bps, two payments of equal gross now produce
an equal `credit` *regardless of method*, where previously a UPI line at 0 bps
settled at its gross and a card line did not. Equal-credit collisions of the `F06`
kind should therefore become **more** frequent, not less — the expected direction
is marginally lower coverage and marginally higher abstention than spec 1.1.0
would have produced. This is recorded here so that if the dev split shows it, it
is a predicted consequence of a factual correction rather than a post-hoc
explanation. It is not a reason to revert the constants: 0 bps for UPI was
factually wrong, and a benchmark made easier by a wrong number is worth nothing.

**The settlement-timing model `[ASSAY-MODEL]`, and how it differs from Razorpay.**

`[RZP-DOC]` The documented standard domestic cycle is **T+2 working days** from
capture, where working days exclude Sundays, the second and fourth Saturdays, and
bank holidays. The cycle is subject to bank approval and varies by business
vertical and risk. International payments follow a longer documented cycle (T+7
working days) and are out of scope.

`[ASSAY-MODEL]` ASSAY simulates **calendar** days and deliberately implements **no
bank-holiday calendar**. The T+1 / T+2 / T+3 mix above is a synthetic dispersion
standing in for the documented bank/vertical/risk variation; it is not a claim
that Razorpay publishes a T+1..T+3 band. `C4`'s `T_max = 7` calendar days is
sized to absorb the working-day expansion — a capture before a weekend plus a
public holiday can exceed five calendar days — and is deliberately generous rather
than tight. Consequence, stated in advance: because no holiday calendar is
modelled, ASSAY's settlement-lag distribution is smoother than a real merchant's,
which makes `SE3` (temporal proximity to the modal lag) a slightly *easier* signal
here than it would be in production. That direction of bias is reported, not
corrected, because adding a holiday engine would change the benchmark rather than
describe it.

### 4.3 Degradation operators

Applied to observations only, never to the true state. Each is declared, and each
must state what it models.

| Op | Models |
|---|---|
| `TRUNCATE_NARRATION(n)` | Bank statement exports capping narration length |
| `MANGLE_UTR(mode)` | OCR/transcription errors and character substitution in bank exports |
| `DROP_SETTLEMENT_ID` | Merchant-side recon copies that lack the PG's batch identifier |
| `DROP_FIELD(field)` | Optional fields absent in a given export format |
| `DUPLICATE_ROW` | Double export, double import, bank re-presentation |
| `SHIFT_TIMESTAMP(±d)` | Clock skew between PG, bank and ERP |
| `SWAP_ORDER_REF` | Merchant ERP reference schemes that do not map cleanly |
| `INJECT_NOTES(payload)` | Merchant-controlled free-text fields (`F10` only). `notes` is a documented **object** of up to 15 key-value pairs, so the payload may hide in a key as well as a value; the whole object is quarantined as one blob (`DATA_MODEL.md §10`) |
| `CONFLICT_REFERENCE` | A row referencing two mutually exclusive parents |
| `ROUND_BANK_AMOUNT` | Declared bank-side rounding; the only sanctioned source of a `C6` tolerance. **Not exercised in benchmark v1.0.0** — no family declares it, and neither a tolerance magnitude nor an engine-visible signal that it is in force is specified. Activating it requires a spec amendment supplying both |

---

## 5. Ambiguity ground truth — the Ambiguity Oracle

**No family declares a case ambiguous.** There is no `is_ambiguous` field
anywhere in the ground truth. Ambiguity is an emergent property of the degraded
observation set, determined afterwards by a program that is independent of both
the generator and the reconciliation engine.

### 5.1 Independence from the generator

The Ambiguity Oracle (`packages/oracle`) reads **observation files only**. It
cannot read ground truth: a runtime path guard throws on any read matching
`**/ground_truth*.jsonl`, and an ESLint rule forbids importing
`packages/generator`. Its input is exactly what every agent receives.

### 5.2 Independence from the engine

Full independence would require two authors who never spoke. What is achievable
is **two independent implementations of one declarative specification**:

- Hard constraints `C1`–`C8` live in `packages/domain/src/constraints.decl.ts` as
  **data** — each a named, documented predicate specification with its real-world
  justification.
- The **engine** implements them as fused, short-circuiting filters optimised for
  throughput during candidate generation.
- The **oracle** implements them as naive per-candidate boolean checks over a
  fully enumerated space: no ordering, no pruning, no early exit, no soft
  scoring, no LLM. Budget `K_oracle = 30`, `C_oracle = 2,000,000`, offline,
  minutes per component.
- `packages/oracle` may not import `packages/engine`; enforced by lint in CI.

### 5.3 The two gates

Both are **hard build gates**. They catch different faults and neither is
sufficient alone.

**Completeness gate.** For every target in a generated dataset, the true
allocation from ground truth must appear among the oracle's enumerated solutions.
Catches a constraint set that is *too strict* — one that excludes reality. If it
fails, the benchmark is invalid and no results may be reported from it. Runs
offline, inside the generator's trust zone, before any agent exists.

**Consistency gate.** For `R = 20,000` randomly sampled `(target, member-set)`
pairs from the dev split — deliberately including inadmissible ones — the
engine's admissibility verdict must equal the oracle's, constraint by
constraint. Catches engine and oracle *diverging* from the shared declaration.
Any disagreement fails the build and names the constraint.

### 5.4 The ambiguity definition

A case is **truly ambiguous** iff the oracle finds ≥ 2 admissible allocations
whose control-account balances differ by more than τ. Note both halves:
*admissible* under the frozen constraints, and *materially different* in the
books. Neither the mere existence of an arithmetic alternative nor a difference
below τ qualifies.

### 5.5 What the oracle buys, and its limit

The oracle defines the best abstention policy achievable from the observations,
so ASSAY reports `gap_to_oracle` rather than an unanchored accuracy figure.

**Limitation, stated before results:** the oracle and the engine share the
*declaration* of the hard constraints. If that declaration misrepresents the real
world, both are wrong together and no amount of differential testing would reveal
it. This is why `C1`–`C8` are frozen here with individual justifications rather
than tuned during development, and why `constraint_set_hash` is part of the
manifest.

## 6. Splits and anti-leakage

### 6.1 Family-level, not row-level

Row-level splits leak: rows generated from one simulated batch share merchant
behaviour, timing and fee structure, so a row-level holdout measures memorisation
of the generator, not capability.

```
  TRAIN   families F01–F06, seeds 1000–1004      developer may inspect freely
  DEV     families F01–F06, seeds 2000–2004      developer may inspect freely
  TEST    families F01–F06, seeds 9000–9004      SEALED, never inspected
        + families F07–F10, seeds 9100–9104      SEALED, held-out families
```

Held-out families `F07`–`F10` are **written during development but never
executed** until the sealed run. This is the strongest available guarantee that
adversarial cases were not seen during agent development, and it is the reason
the adversarial suite must be authored early (day 2 of the build) rather than
late.

### 6.2 Anti-leakage rules (binding on the implementation agent)

| # | Rule |
|---|---|
| AL1 | `packages/engine` may not import `packages/generator` or `packages/oracle`; `packages/oracle` may not import `packages/engine` or `packages/generator`. Enforced by ESLint `no-restricted-imports`, checked in CI. |
| AL2 | Neither engine nor oracle code may read a file matching `**/ground_truth*.jsonl`. Enforced by a runtime path guard that throws. |
| AL3 | Every constant in §7 — τ, ε, the SE1–SE5 weights, `K_max`, `C_max`, `P_max`, `C_review`, `C_exception`, the close policy bounds, `k_sigma` and `queue_top_n` — is fixed before the seal and immutable after it. |
| AL4 | The developer may inspect TRAIN and DEV outputs without limit and TEST outputs **never** before the sealed run. |
| AL5 | The CLI's `--sealed` flag refuses to print, log or write any ground-truth field; only aggregate metrics are emitted. |
| AL6 | Prompt text may not contain examples derived from any TEST record. |
| AL7 | If a TEST record is inspected for any reason, that seed is burned: it is discarded and replaced, and the burn is recorded in the manifest. |

### 6.3 Contamination note

Synthetic data generated at run time from a private seed cannot be in a model's
pre-training corpus, which removes the usual benchmark-contamination concern.
What it does **not** remove is *developer* contamination — tuning against the
test split. Rules AL1–AL7 target that, because it is the real risk here.

---

## 7. Frozen thresholds

```
  tau   (materiality)      = max(10_000 paise (₹100.00), 0.1% of component value)
  epsilon (evidence margin)= 0.15
  K_max (component bound)  = 22 members
  C_max (candidate bound)  = 5_000 enumerated candidates
  P_max (probe budget)     = 3 per component
  C_review  (analyst cost per abstention)        = 25_000 paise (₹250)
  C_exception (analyst cost per open exception)  = 50_000 paise (₹500)
  Seeds per configuration  = 5
  Bootstrap resamples      = 10_000
  Confidence level         = 95%

  Close policy (RECONCILIATION_SPEC.md §10.3):
      max_unresolved_ratio  = 0.005            // 0.5% of total batch value
      max_unresolved_abs    = 5_000_000 paise  // ₹50,000
      period auto-closes iff unresolved <= min(ratio × batch_value, abs)

  Abstention spike detection (THREAT_MODEL.md §T9, M2):
      k_sigma               = 3
      baseline              = rolling mean/stddev of abstention-rate-by-value
                              over the DEV split, computed before the seal
      queue_top_n           = 20   (value-ranked; M1 requires the largest
                              exception to always appear within it)

  Soft-evidence weights (RECONCILIATION_SPEC.md §4.2), summing to 1.00:
      SE1 utr_prefix_match_length   = 0.35
      SE2 order_ref_similarity      = 0.20
      SE3 temporal_proximity        = 0.15
      SE4 method_agreement          = 0.10
      SE5 probe_corroboration       = 0.20
```

These weights are set by judgement, not fitted. They may be adjusted on the
TRAIN and DEV splits before the seal; after the seal they are immutable. They
influence only candidate *ranking* and the ε-gap — never admission, never an
amount — so a poor choice of weights degrades abstention precision rather than
producing a wrong allocation.

**Justification for `C_review` = ₹250:** approximately 15 minutes of a finance
analyst's time at a fully-loaded rate of ~₹1,000/hour. This is an assumption, not
a measurement. It is reported as such, and §8 requires a sensitivity sweep at
₹100 / ₹250 / ₹1,000 so that no conclusion depends on the exact figure.

**Why an abstention cost exists at all:** without it, abstaining on everything
trivially minimises financial harm and the metric is meaningless. Pricing
abstention is what makes the risk–coverage tradeoff real.

---

## 8. Frozen metric list

Metrics not on this list may be computed and reported, but must be labelled
**`EXPLORATORY`** in the report. Only the metrics below may be used to support a
claim about ASSAY's performance. Full definitions in `EVALUATION_SPEC.md §4`.

**Primary (the claim rests on these):**
1. `coverage_by_value`
2. `net_cost_inr` = balance harm + abstention cost + exception cost
3. `aurc_inr` — area under the ₹-denominated risk–coverage curve
4. `abstention_precision` and `abstention_recall` vs the Ambiguity Oracle

**Secondary:**
5. `match_precision`, `match_recall`, `match_f1` at allocation-edge level
6. `balance_harm_inr` and `misdirected_value_inr` (reported separately)
7. `ece` — expected calibration error of the score used for abstention
8. `gap_to_oracle`
9. `coverage_by_count`
10. `exception_class_confusion`

**Close-loop (added in spec 1.1 — the loop must be shown to terminate):**
11. `period_status_distribution` — share of seeded runs ending `CLOSED` / `OPEN` / `BLOCKED`
12. `unresolved_value_inr` at close, split into abstained vs open exceptions
13. `suspense_identity_exact` — must be `true` on every run (gate G3)
14. `close_gate_failures` — per-gate failure counts across all runs; `BLOCKED` must be 0

**Robustness and the DoS surface:**
15. `injection_financial_success_rate`
16. `forced_abstention_rate` under adversarial input
17. `abstention_spike_flag` — fires on the F10 split, not on clean splits
18. `attributable_to_untrusted_text_rate`
19. `largest_exception_in_top_n` — must be `true` on every run (M1)
20. `hallucinated_id_rate` and `id_rejection_rate`

**Operational and reproducibility:**
21. `throughput_rps_deterministic`, `throughput_rps_llm`, `pct_records_needing_llm`
22. `p50_latency_ms`, `p95_latency_ms`, `cost_inr_per_1000_records`
23. `determinism_check` — identical ledger root hash across two `--llm=replay` runs
24. `offline_parity` — the full pipeline passes every acceptance test under
    `--llm=offline`, and the delta in every primary metric between
    `--llm=offline` and `--llm=replay` is reported
25. `component_size_distribution` and `intractable_rate`
26. `tau_sensitivity` and `c_review_sensitivity` sweeps

Metric 24 is the pre-registered form of the provider-independence requirement: it
forces the offline-vs-model comparison to be *published as a number*, so "the LLM
contributed X" is measured rather than asserted — including the outcome where X
is approximately zero.

**Stopping rule:** the sealed test run is executed **once** per benchmark
version. Its output is reported whatever it says. If a bug is found after the
seal, the fix requires a new benchmark version with fresh seeds, and **both**
results are reported, with the reason for the re-run.

## 9. Seal procedure

```
  1. Freeze code:  git tag -s bench-v1.0.0 -m "ASSAY benchmark v1.0.0 seal"
  2. Generate:     assay generate --split test --seeds 9000-9004,9100-9104
  3. Oracle:       assay oracle --split test          # completeness gate MUST pass
  4. Hash:         sha256 observations.jsonl ground_truth.jsonl oracle_labels.jsonl
  5. Commit hashes into benchmark_manifest.json      # ground truth itself NOT committed
  6. Commit + push. Record the commit SHA as the seal point.
  7. Run:          assay bench --sealed --agents all --seeds all
  8. Record results. NO CODE CHANGES BETWEEN 6 AND 8.
```

Step 3 is a gate, not a formality: if the oracle cannot recover the true
allocation for every target, the constraint set is wrong and nothing downstream
is trustworthy.

---

## 10. Declared threats to validity

Stated here, before results, so they cannot be presented later as afterthoughts.

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| V1 | Generator and solver share the author's assumptions | Oracle independent of both (§5.1–5.2); completeness **and** consistency gates; frozen, individually justified constraints; family-level holdout | **Real and not eliminated.** If the shared constraint *declaration* misrepresents production, everything is consistently wrong. |
| V2 | Synthetic data does not resemble production | Real API contracts and value sets (§2), Razorpay's documented fee/GST convention and published 2% / 18% rates (§4.2), distributions from public payment-industry norms | **High.** No external validity is claimed. Note specifically that the bank statement and merchant ledger are entirely invented, that no bank-holiday calendar is modelled, and that a single merchant profile is simulated. |
| V3 | Developer tunes against the test split | AL1–AL7; sealed hashes; held-out families; single sealed run | Moderate — self-enforced |
| V4 | Baselines are strawmen | `B2-LLM-DIRECT` is the *obvious* approach, not a weakened one, given equal prompt effort and token budget; ablations A1–A3 are same-system controls | Low for ablations, moderate for baselines |
| V5 | Harm function chosen to flatter ASSAY | Harm frozen here; two independent harm measures reported; cost parameters swept | Low |
| V6 | Abstention thresholds tuned for the headline | τ and ε frozen; sensitivity sweep required; raising τ moves cases into a separately reported bucket | Low |
| V7 | LLM non-determinism makes results irreproducible | All scored runs use `--llm=replay` against a committed cache; provider, model ID and per-call hashes recorded | Low |
| V8 | Only one merchant profile simulated | Single profile in v1.0.0 | **Acknowledged limitation.** Stated in the report. |
| V9 | Results depend on one model vendor | `LlmProvider` abstraction; `offline_parity` (metric 24) publishes every primary metric under `--llm=offline` alongside the model path | Low — but note the offline path is authored by the same developer |
| V10 | The close gate never fires, so it is untested | Metric 11 requires the distribution of `CLOSED` / `OPEN` / `BLOCKED` across seeds; success criterion S12 requires at least one legitimate `OPEN` | Low |
| V11 | Abstention DoS mitigations are instrumentation, not defence | M1 (value-ranked queue) and M4 (immaterial auto-resolve) change behaviour, not just reporting; M2/M3/M5/M6 are detection and attribution | **Real.** A sub-threshold, source-spread flood evades M2 and M3. Stated in `THREAT_MODEL.md §T9`. |

**The claim ASSAY is entitled to make, and no more:**

> On a pre-registered synthetic benchmark whose observation-degradation model is
> declared in advance, ASSAY's abstention policy is calibrated against an
> ambiguity oracle that is independent of both the data generator and the
> reconciliation engine; removing its deterministic validation layer measurably
> increases rupee-denominated financial error; and its period close either
> completes with balanced books or refuses to complete with the unresolved value
> quantified.

Not: that it works on real Razorpay data. Not: that it beats commercial
reconciliation products. Not: that Razorpay's own reconciliation has a gap. Not:
that its accuracy figure transfers to production.

