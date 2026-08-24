# RECONCILIATION_SPEC — ASSAY

**Spec version:** 1.2.0 · **Date:** 2026-08-24

The matching algorithm, the ambiguity definition, and the rules that decide
accept / reject / abstain. This is the technical core of the project.

**At spec 1.2.0** this document added the `REFERENCE` terminal state and a fourth
`EXCEPTION` trigger (§9), restated gate G3 in gross per-item form (§10.1),
replaced the close policy's absolute bound (§10.3), and moved `evidence_score`
and ε to basis points — see `DECISION_BRIEF.md §A.5`. The paragraph below
describes the earlier **1.1.1** release and is retained as history.

Provenance classes `[RZP-DOC]` / `[ASSAY-MODEL]` / `[NOT-CLAIMED]` are defined in
`DATA_MODEL.md §0` rule 6, with the full register in `DATA_MODEL.md §22`. Spec
1.1.1 corrected the *justifications* of `C1`, `C4`, `C5`, `C8`, `I3` and one probe
definition. **No constraint was added, removed or reordered, and no threshold
changed** — the frozen constraint set `C1`–`C8` and invariant set `I1`–`I9` are
identical in membership and in admissibility behaviour, with the single exception
of `C5`/`I3`, whose arithmetic is restated to match Razorpay's documented
GST-inclusive fee convention.

---

## 1. The mistake this spec exists to avoid

The naive formulation of settlement reconciliation is subset-sum:

> Given a settlement of ₹1,00,000 and a pool of transactions, find the subset
> that sums to ₹1,00,000. If more than one subset works, abstain.

**This formulation is fatal and must be rejected.** In a pool of 500
rupee-granular transactions, the number of subsets summing to any given total is
astronomically large. An abstention rule based on "does a second subset exist?"
abstains on essentially every real batch, produces zero coverage, and would be
spotted as unworkable by any reviewer in under a minute.

The correction is the central design idea of ASSAY:

> **Reconciliation is not a search over arithmetic possibilities. It is a search
> over *evidence-admissible* allocations. Ambiguity is a property of the
> evidence, not of the arithmetic — and it only matters when the alternatives
> differ by an amount a controller would care about.**

Concretely, three restrictions turn an intractable, meaningless problem into a
tractable, meaningful one:

1. **Hard evidence constraints prune first.** Currency, entity type, temporal
   feasibility, per-line arithmetic identity and the one-allocation rule remove
   the overwhelming majority of arithmetically-valid-but-impossible subsets
   *before* any search runs.
2. **The problem decomposes.** After pruning, the candidate graph splits into
   many small independent components. Uniqueness is decided per component, where
   exhaustive proof is cheap, not globally, where it is hopeless.
3. **Ambiguity must be material.** Two allocations that produce identical
   control-account balances are not a decision the analyst needs to make.

---

## 2. Stage S0 — Normalization and quarantine

**Input:** raw source files. **Output:** `Observation[]` + `UntrustedText[]`.

1. Parse per source schema; reject unknown fields (`strict` zod).
2. Assert per-entity ingest invariants (`DATA_MODEL.md §2–§9`). A record failing
   an ingest invariant becomes `E05`/`E06`/`E07` immediately and never enters the
   candidate space — it cannot corrupt a match.
3. Split structural fields from free text. Free text goes to `untrusted_text`.
4. Normalize: amounts to `Paise`; timestamps to Unix seconds; UTRs upper-cased
   and stripped of non-alphanumerics **into a derived field**, leaving the raw
   value intact.
5. Stamp provenance and `ingest_hash`.

**Why quarantine at stage zero:** if free text is available anywhere downstream,
someone will eventually read it "just for a hint." Removing it structurally is
the only durable defence (`THREAT_MODEL.md §3`).

---

## 3. Stage S1 — Anchor matching

Anchors are **facts**, not hypotheses. They are established by exact equality on
a strong key, and they are not subject to scoring or LLM involvement.

| Anchor | Key | Confidence basis |
|---|---|---|
| `AN1` recon line → settlement | `recon_line.settlement_id === settlement.id` | Same system, same identifier |
| `AN2` settlement → bank line | `normalize(settlement.utr) === normalize(bank_ref)` and amount equal | `[RZP-DOC]` the UTR is documented as the reference *"available across banks"* used to track a settlement in the bank account. `[ASSAY-MODEL]` treating it as a **unique** key is ASSAY's assumption — Razorpay asserts no uniqueness, and official samples show at least three different UTR shapes. This is why the anchor also requires amount equality, and why `E14_UTR_COLLISION` exists |
| `AN3` refund → payment | `refund.payment_id === payment.id` | Referential |
| `AN4` payment → order | `payment.order_id === order.id` | Referential |
| `AN5` ledger entry → order | `merchant_ledger.order_ref === order.receipt` (exact, after normalization) | Merchant-controlled but exact |

An anchor is **rejected** if it would violate the one-allocation invariant (I2) —
i.e. if the target is already anchored to a different source. A rejected anchor
becomes `E08`/`E09`/`E14`, never a silent overwrite.

**Everything anchored is removed from the search space.** In a realistic batch
this is 85–95% of records, and it is what makes the residual tractable. The
percentage of records resolved by anchor alone is a reported metric — it is also
the honest statement of how much of the problem is easy.

---

## 4. Stage S2 — Candidate generation under hard constraints

For each unanchored **target** (a settlement needing constituents, or a bank line
needing settlements), generate candidate member sets subject to hard constraints.

### 4.1 Hard constraints (filters — they admit or exclude, never rank)

| ID | Constraint | Real-world justification |
|---|---|---|
| `C1` | Currency equality across all members and the target | `[ASSAY-MODEL]` Tier-0 is INR-only by construction, so a non-INR line in an INR dataset is a source or scope error, not a netting event. **Not** justified by "cross-currency netting does not occur": Razorpay documents that settlements are made in INR *regardless of the currency the customer paid in*, so a real multi-currency merchant needs the F11 conversion truth model, which is specified and deliberately not implemented |
| `C2` | Type compatibility: a refund may only offset a payment on the same `order_id`; an adjustment may only attach to its `related_entity_id` when present | `[RZP-DOC]` for the refund half — a refund documents its parent `payment_id`. `[ASSAY-MODEL]` for the adjustment half: `related_entity_id` is ASSAY's construct, not a Razorpay field (`DATA_MODEL.md §9`) |
| `C3` | Temporal ordering: `created_at ≤ settled_at ≤ bank.value_date` for every member | Money cannot settle before capture or arrive before it is sent. `[RZP-DOC]` Razorpay documents that settlement `status: processed` marks *initiation*, with the bank credit following the NEFT/RTGS/IMPS timeline — so a strictly later bank value date is expected, not anomalous |
| `C4` | Settlement window: `settled_at − created_at ∈ [T_min, T_max]` (declared: 1–7 **calendar** days) | `[RZP-DOC]` the documented standard domestic cycle is **T+2 working days** from capture, and is subject to bank approval and variation by vertical and risk. `[ASSAY-MODEL]` ASSAY simulates in calendar days with no bank-holiday calendar; `T_max = 7` is sized to absorb the working-day expansion (a capture before a weekend plus a public holiday can exceed five calendar days). See `PREREGISTRATION.md §4.2` |
| `C5` | Per-line arithmetic identity: `credit = amount − fee` for payments (`fee` is GST-inclusive), `debit = amount` for refunds | `DATA_MODEL.md §6`; a line failing this is corrupt, not a candidate. Corrected in spec 1.1.1: Razorpay documents `fee` as *"Fee (including GST)"* with `tax` the GST component **inside** it, so subtracting both double-counts GST |
| `C6` | Exact tie-out: `Σ credit(members) − Σ debit(members) = target.amount`, **zero tolerance** in paise | Settlement amounts are exact; a tolerance here is how false matches get admitted |
| `C7` | One-allocation: no member may already belong to an accepted allocation | Double-counting a payment is the most expensive reconciliation error. `[RZP-DOC]` and directly supported: Razorpay documents that partial settlements defer **whole transactions** to the next slot — its own worked example settles P1 and P2 and defers P3 — so a single payment is not split across two settlements |
| `C8` | `on_hold === false` for members claimed as settled | `[ASSAY-MODEL]` a line flagged as held is not part of the settled set. `[RZP-DOC]` the field itself is documented, but specifically as *"whether the account settlement **for transfer** is on hold"* — a Razorpay Route concept toggled via `PATCH /v1/transfers/:id`. Route is out of Tier-0 scope, so **`C8` is expected to be non-binding on v1.0.0 data**; it is retained as a declared admissibility filter, and the fraction of candidates it excludes is reported so a reviewer can see that it is doing nothing rather than assume it is doing something |

Zero tolerance on `C6` is deliberate and worth defending: real settlement
arithmetic is exact in paise. **In benchmark v1.0.0 `C6` is zero-tolerance
throughout**: no scenario family exercises the declared bank-side rounding
operator (`ROUND_BANK_AMOUNT`, `PREREGISTRATION.md §4.3`), which remains the only
sanctioned source of a `C6` tolerance. Activating it requires a spec amendment
supplying two things this specification does not: a declared tolerance magnitude,
and an engine-visible signal that the operator is in force — the engine cannot
infer one, because degradation records live in ground truth, which `AL1` and
`AL2` bar it from reading. Any such tolerance would be an explicit, logged
property of that operator, never a global fudge factor. A global tolerance is the
standard way recon tools manufacture confident wrong answers.

### 4.2 Soft evidence (ranks — never admits)

| ID | Signal | Weight (bps) |
|---|---|---|
| `SE1` | UTR prefix match length | 3500 |
| `SE2` | `order_ref` ↔ `receipt` string similarity (Jaro–Winkler) | 2000 |
| `SE3` | Temporal proximity to the modal settlement lag | 1500 |
| `SE4` | Method / card-network agreement with the merchant memo | 1000 |
| `SE5` | Probe result corroboration | 2000 |

`evidence_score_bps ∈ [0, 10_000]` is a weighted sum, used **only** to order candidates and
to compute the ε-gap in §6. Weights are frozen in `PREREGISTRATION.md` before the
sealed run and are **not tuned on the test split**.

### 4.3 Search bound

Candidate enumeration inside a component is bounded by `K_max = 22` members and
`C_max = 5,000` enumerated candidates. Exceeding either yields
`solve_status: INTRACTABLE` → abstention with reason `SEARCH_BOUND_EXCEEDED`.

**Why a hard bound rather than a heuristic search:** a heuristic that returns
"the best I found in the time available" is indistinguishable, from the outside,
from a proof. ASSAY reports the bound it hit. The distribution of component sizes
is a published metric precisely so a reviewer can check that the bound is rarely
binding rather than take our word for it.

---

## 5. Stage S3 — Component decomposition

Build an undirected graph: nodes are unanchored observations and targets; an edge
joins two nodes if they co-occur in at least one admissible candidate. Compute
connected components (union-find).

**Uniqueness is proven per component, never globally.** This is the engineering
move that makes the mathematics both tractable and meaningful:

- Global uniqueness over 10,000 records is intractable and, as argued in §1,
  would be false anyway.
- Component-local uniqueness is exactly what the analyst cares about: "for *this*
  settlement, is there more than one story?"
- After anchoring and hard-constraint pruning, components are small. Expected
  distribution: ~90% of components have size 1–3, and the tail beyond `K_max` is
  the reported `INTRACTABLE` rate.

Components are solved independently and in parallel. Because `C7`
(one-allocation) can couple components, allocation is committed in a single
serialized pass after all components are solved, and any commit that would
violate `C7` demotes the later allocation to `E08`.

---

## 6. Stage S4 — Exact solve and the second-best certificate

Within a component:

1. **Solve exactly.** Depth-first branch-and-bound over member subsets, ordered
   by descending amount, with memoization on `(index, remaining_paise)` and
   pruning when `remaining < 0` or `remaining > Σ(remaining members)`. Bounded by
   `K_max` / `C_max`, so worst case is enumerable and known. Among feasible
   solutions, the best is the one with the highest `evidence_score_bps`.
2. **Apply a no-good cut.** Add the constraint "the solution must differ from the
   one just found in at least one member," and re-solve.
3. **Interpret the second-best result.**

```
  no second feasible solution
      → UNIQUE                       → accept

  second solution exists, materiality ≤ τ
      → IMMATERIALLY_AMBIGUOUS       → accept best, flag on the decision

  second solution exists, materiality > τ, evidence gap Δs ≥ ε
      → DISCRIMINATED                → accept best, attach the discriminator

  second solution exists, materiality > τ, Δs < ε
      → AMBIGUOUS                    → ABSTAIN + certificate
```

Where:

- **materiality** = `max over AccountCode of |balance_best(acct) − balance_second(acct)|`,
  computed by running both allocations through the ledger projection in memory.
  It measures *how much the books would differ*, not how many rupees changed
  hands.
- **Δs** = `|evidence_score_bps(best) − evidence_score_bps(second)|`, an integer
  in basis points.
- **τ** (materiality threshold) = `max(₹100.00, 10 bps of component value)`,
  frozen in `PREREGISTRATION.md` (10 bps == 0.1%; the value is unchanged, only
  its encoding, per `DATA_MODEL.md §0` rule 5).
- **ε** (evidence margin) = `1500` basis points (`0.15`), frozen. The comparison
  `Δs < ε` is an integer comparison; its **value** is unchanged from spec 1.1.1
  and only its encoding differs, so that the test is bit-identical across runs
  and the certificate can be hashed under `DATA_MODEL.md §0` rule 5.

The second-best solution, when it exists and forces abstention, **is** the
`AmbiguityCertificate`. Producing it costs one extra solve and converts the
abstention from an assertion into a checkable artifact: a reviewer can take
solution B, run it through the invariants, and confirm for themselves that it is
equally admissible.

### 6.1 Why the materiality clause is not a loophole

Abstaining on an ambiguity that changes no balance is pedantry that a finance
team would switch off within a week. If two identical ₹500 payments could each
explain the same settlement line, the ledger is identical either way and there is
nothing for a human to decide. Abstention must be **decision-relevant** or it is
just a way to avoid being scored.

`IMMATERIALLY_AMBIGUOUS` decisions are counted and reported separately, so the
threshold cannot be used to quietly inflate coverage: raising τ moves cases from
`AMBIGUOUS` to `IMMATERIALLY_AMBIGUOUS` and the shift is visible in the report.
`EVALUATION_SPEC.md §5.3` reports a τ sensitivity sweep for exactly this reason.

### 6.2 Probing before giving up

Before emitting an abstention, up to `P_max = 3` probes may be attempted. The LLM
(`R3`) proposes one probe from a closed enum; deterministic code executes it and
re-runs the solve.

| Probe | Effect |
|---|---|
| `fetch_order(order_id)` | May supply `receipt` to discriminate via `SE2` |
| `fetch_payment(payment_id)` | May supply method/card details for `SE4` |
| `fetch_refund(refund_id)` | May resolve a refund's parent payment |
| `fetch_settlement_recon(settlement_id, date)` | Queries the **date-scoped recon report** for the lines carrying that `settlement_id`, which may supply constituent IDs directly |
| `widen_temporal_window(days)` | Relaxes `C4` by a declared, logged amount |

All probes are read-only, allowlist-constrained, and logged. If probes exhaust
without discriminating, the certificate records `PROBE_BUDGET_EXHAUSTED`. The
metric `abstentions resolved per probe spent` measures whether the LLM's probe
selection beats a static priority list (`A3-NOLLM`).

---

## 7. Stage S5 — Deterministic validation gate

**This is the only code path that may post to the ledger.** Its input is a
proposed allocation; its output is either a `ValidatedDecision` or a rejection.
Nothing else in the system can construct a `ValidatedDecision`.

| ID | Invariant | What failure prevents |
|---|---|---|
| `I1` | Trial balance: `Σ dr = Σ cr` across posted journal lines | A ledger that does not balance is not a ledger |
| `I2` | No double allocation: each `entity_id` appears in at most one accepted allocation across the run | Paying or recognising the same rupee twice |
| `I3` | Line arithmetic: `credit = amount − fee` (payments, `fee` GST-inclusive), `debit = amount` (refunds) | Accepting a corrupted or forged recon line |
| `I4` | Settlement closure: `settlement.amount = Σ credit − Σ debit` over its allocated lines | A settlement that does not equal its own contents. `[RZP-DOC]` no further fee subtraction belongs here: processing fees are already netted inside each line's `credit`, and `Settlement.fees` / `Settlement.tax` are documented as **0** for a normal settlement (`DATA_MODEL.md §5`) |
| `I5` | Bank tie-out: `Σ settlement.amount` mapped to a bank line `= bank_line.amount` | Claiming money arrived that did not |
| `I6` | Referential integrity: every referenced ID exists in the observation set | **Hallucinated transaction IDs** |
| `I7` | Range/sign: no negative fee or tax; no allocated amount exceeding the observed amount; no `Paise` outside safe-integer range | Silent overflow and sign-flip errors |
| `I8` | Temporal: no settlement dated before its constituent captures | Physically impossible allocations |
| `I9` | Idempotency: re-running the same input yields an identical ledger root hash | Non-determinism hiding in the engine |

Failure semantics: **any** invariant failure rejects the allocation. It is never
partially posted, never repaired, never downgraded to a warning. The rejected
allocation becomes an exception carrying `invariants_failed`, and the batch
continues. `I1` failing at close is a hard abort of the whole run
(`ARCHITECTURE.md §12`), because it can only indicate a bug in the ledger itself.

`I6` deserves emphasis: it is the structural answer to hallucinated transaction
IDs. Even if a model invents `pay_XXXXXXXXXXXXXX` and every other layer somehow
passes it through, `I6` cannot admit it, because the ID is not in the observation
set. The defence does not depend on the model behaving.

---

## 8. Duplicate prevention

Three independent mechanisms, because duplication arises three different ways:

1. **Ingest-level.** `ingest_hash` collision within a source ⇒ `E08`. Catches the
   same file imported twice and the same row exported twice.
2. **Allocation-level.** `C7` / `I2` ⇒ an entity can belong to at most one
   accepted allocation. Catches the same payment explaining two settlements.
3. **Bank-level.** Two credits with the same normalized UTR and amount ⇒ `E09`,
   with the *later* one held in Suspense rather than netted. Catches genuine
   duplicate bank credits, which do occur and which a naive matcher happily
   allocates twice.

The bank-level case is the interesting one: the naive behaviour is to match both
credits and report 100%. ASSAY holds the second in Suspense and names it, which
is the behaviour that saves money.

---

## 9. Final decision rules

Every observation reaches exactly one terminal state. There is no fifth state
and nothing is dropped.

```
  RECONCILED   an allocation passed S4 with UNIQUE / DISCRIMINATED /
               IMMATERIALLY_AMBIGUOUS and passed all of I1..I9
               → posts to the real control accounts

  ABSTAINED    S4 returned AMBIGUOUS or INTRACTABLE
               → posts to 9000_SUSPENSE_UNRECONCILED, carries a certificate

  EXCEPTION    an ingest invariant failed, an S5 invariant failed, no
               admissible candidate exists at all, or the allocation is
               correct but no authoritative non-Suspense posting is defined
               for it (DATA_MODEL.md §17.2, the conservative fallback)
               → posts to 9000_SUSPENSE_UNRECONCILED, carries a class + owner

  REFERENCE    the observation is of a reference kind (DATA_MODEL.md §10.1:
               `payment`, `order`) and is therefore not a reconciliation target
               → posts nothing; contributes to no coverage ratio and to no
                 unresolved value; assigned statically at ingest from `kind`
                 alone, never by a decision
```

`REFERENCE` is assigned by table lookup at ingest, before any candidate is
generated. It is not an outcome the engine can choose, so it cannot be used to
retire an observation the engine failed to explain: an unmatched `bank_line`
becomes `E03`, never `REFERENCE`. This is what keeps the fourth state from
becoming a drop path.

The fourth `EXCEPTION` trigger is new in spec 1.2.0 and exists so that the
posting fallback in `DATA_MODEL.md §17.2` has a terminal state to land in. It is
deliberately an exception rather than a reconciliation: an item whose accounting
treatment this specification does not define has **not** been reconciled, and
must not be reported as though it had been.

The distinction between `ABSTAINED` and `EXCEPTION` is meaningful and must not be
blurred: an exception says *"something is wrong with this data"*; an abstention
says *"the data is fine, and it supports two different answers."* They go to
different people and require different work, so they are different states.

## 10. Period close — the loop terminates, or says why it cannot

The loop ends in a close attempt, which is a deterministic procedure with three
possible outcomes. **A finance period that cannot be closed honestly must not be
closed.**

### 10.1 The five close gates

| Gate | Check | Failure means |
|---|---|---|
| **G1** | Every observation has exactly one terminal state (`RECONCILED`, `ABSTAINED`, `EXCEPTION`, `REFERENCE`), and every `REFERENCE` assignment matches the static kind classification in `DATA_MODEL.md §10.1` | A record was dropped, or a reconcilable observation was retired as `REFERENCE` — an ASSAY defect |
| **G2** | Trial balance: `Σ dr = Σ cr` over all posted journal lines, recomputed from the event log | The ledger is incoherent — an ASSAY defect |
| **G3** | Suspense identity, gross per-item, **exactly, to the paisa**. For each open Suspense item *i* (one per abstention and per open exception), `item_net_paise(i) = Σ dr(i, 9000_SUSPENSE) − Σ cr(i, 9000_SUSPENSE)`. Then `Σᵢ |item_net_paise(i)| === unresolved_value_paise` | An exception was suppressed, double-posted, or offset against another — an ASSAY defect |
| **G4** | Hash chain recomputes from genesis and matches the stored root hash | The audit trail was altered |
| **G5** | No allocation with a non-empty `invariants_failed` was posted | The validation gate was bypassed |

**Why G3 is gross and not net.** Suspense receives value from both directions:
an unattributable bank credit credits it (`E03`, posting P5), a settlement with
no bank credit debits it (`E04`, posting P6), and an adjustment with no
authoritative mapping posts on either side (`E12`, posting P8) — see
`DATA_MODEL.md §17.1` and `§17.2`. A purely net identity is therefore satisfiable
on a structurally healthy run whose two sides happen to cancel, and — more
seriously — is satisfiable by an attacker who suppresses one item on each side
(threat `THREAT_MODEL.md §T8`). The gross form makes offsetting suppression
arithmetically impossible.

Balances at close are **recomputed by projection from the event log**, never read
from cached state. A corrupted balance that is not backed by an event simply
disappears on re-projection, which is what makes G2 and G3 meaningful.

### 10.2 The three outcomes

```
  all gates pass  AND  unresolved_value_paise <= close_threshold_paise
      → CLOSED
        signed close report, ledger root hash published, period sealed

  all gates pass  AND  unresolved_value_paise >  close_threshold_paise
      → OPEN
        close report emitted and marked OPEN, carrying:
          unresolved_value_paise, its split across abstentions vs exceptions,
          the ranked work queue, and the owner role for each item

  any gate fails
      → BLOCKED
        NO close report. Run marked `invalid`. The failing gate is named.
```

**`OPEN` is a business state; `BLOCKED` is a defect.** Conflating them would be a
design error in either direction: treating `OPEN` as failure punishes the system
for being honest about genuine ambiguity, and treating `BLOCKED` as `OPEN` would
publish a report over books that do not balance.

A period ending `OPEN` is the normal, expected outcome when the input contains
real ambiguity. The deliverable in that case is not "we failed to reconcile" but
*"₹4,21,300 across 37 items remains unresolved; here is each item, its rupee
value, why it is unresolved, and who must act."*

### 10.3 Close policy (pre-registered)

```
  close_policy.max_unresolved_ratio_bps = 50            // 0.005 == 0.5%

  batch_value_paise      = Σ recon_line.amount           (EVALUATION_SPEC §4.1)
  close_threshold_paise  = round_half_up(batch_value_paise * 5 / 1000)

  → period may auto-close iff unresolved_value_paise <= close_threshold_paise
```

The ratio is frozen in `PREREGISTRATION.md §7`. It is the whole rule: **the
threshold is a fixed proportion of period value at every batch size.** An operator
may always close manually, which records a `human` actor on the `CLOSE` event —
the override is permitted, but never silent. **A manual close is not an autonomous
gate outcome and does not by itself satisfy success criterion S12**, which asks
whether the close gate is real.

**Why the absolute bound was removed before the seal (benchmark v1.0.1).**
Benchmark v1.0.0 specified `min(0.005 × batch, ₹50,000)`. The two bounds cross at
exactly ₹1 crore of batch value. Success criterion S1 requires at least 10,000
observations per test run, which at the frozen amount distribution
(`PREREGISTRATION.md §4.2`: log-normal, median ₹1,850, p99 ₹2,40,000, mean
≈ ₹16,482) puts every conforming run above ₹2.7 crore. Three consequences
followed, all of them properties of the rule rather than of any measured result:

- `max_unresolved_ratio` never bound on any conforming run. One of the two frozen
  constants was inert.
- The rule permitted exactly three average payments to remain unresolved whether
  the batch held 600 payments or 24,000. Across the 1k / 10k / 100k batch sweep
  that `EVALUATION_SPEC.md §5.3` mandates, effective strictness varied 40×
  (0.5% → 0.125% → 0.0125%), so `period_status_distribution` was not comparable
  across the very sweep this specification requires.
- Because `EVALUATION_SPEC.md §2` has every agent attempt a close, the ablation
  `A2-NOABSTAIN` — which never abstains — would have closed on every run while
  ASSAY closed on none. Metric 11 would have been constant for the system under
  test and therefore uninformative.

The correction is scale-invariance. The 0.5% ratio is unchanged, and the rule is
unchanged for every batch below ₹1 crore. **Both close policies are scored and
reported for every seeded run** (`period_status` and `period_status_legacy_policy`,
`DATA_MODEL.md §20`), so a reader can see the outcome under the v1.0.0 rule
alongside the outcome under this one.

The justification given in spec 1.1.1 for holding two bounds had the two bounds'
roles reversed: under `min()`, the absolute bound governed **large** batches and
the ratio governed **small** ones, not the other way round. That error is recorded
here rather than quietly dropped.

**A declared residual of this policy: the two sides of the ratio do not span the
same universe.** `unresolved_value_paise` is summed over **all reconcilable
observation kinds** (`DATA_MODEL.md §10.1`: `recon_line`, `bank_line`,
`ledger_entry`, `settlement`, `refund`, `adjustment`, `dispute`), because it must
tie to gate G3's gross Suspense sum. `batch_value_paise` is summed over
**`recon_line` observations only** (`EVALUATION_SPEC.md §4.1`). The comparison is
therefore **not a like-for-like fraction of one universe**, and the sentence above
should be read accordingly: the threshold is a fixed proportion of *recon-line*
value, measured against unresolved value drawn from a wider set.

Two consequences follow, and both are declared rather than corrected in benchmark
v1.0.1. Effective strictness is **tighter** than the stated 0.5%, because a single
economic break can leave several of its views unresolved and each contributes to
the numerator while only the recon line contributes to the denominator. And
effective strictness **varies with how many views of a break remain unresolved**,
which differs by exception class — an unattributable bank credit (`E03`) may leave
one view unresolved where a missing capture (`E05`) leaves several. The variation
is in the conservative direction: the gate is harder to pass than its stated ratio
suggests, never easier. `PREREGISTRATION.md §10` V10 records it as a threat to
validity.

### 10.4 Procedure

```
  1. Assert G1. Any observation without a terminal state → BLOCKED.
  2. Re-project all control-account balances from the event log.
  3. Assert G2 (trial balance) and G3 (Suspense identity).
  4. Recompute the hash chain from genesis; assert G4.
  5. Assert G5 over all posted decisions.
  6. Evaluate close policy → CLOSED or OPEN.
  7. Emit CloseReport; append a CLOSE event whose hash becomes the run root hash.
```

A close report that exists is therefore a positive assertion that the ledger
balanced, nothing was dropped, and the trail is intact — and its `period_status`
field says whether the work is finished or merely accounted for.

## 11. Worked example — the ₹1,00,000 case from the brief

The motivating example, run through this spec:

- Settlement `setl_A` for ₹1,00,000. Its recon lines are missing
  `settlement_id` (degradation op `DROP_SETTLEMENT_ID`, family F08).
- Pool after `C1`–`C5` pruning: payments A (₹40,000), B (₹35,000), C (₹25,000),
  D (₹60,000), E (₹40,000).
- `C6` admits `{A,B,C}` = ₹1,00,000 and `{D,E}` = ₹1,00,000. Both satisfy
  `C1,C2,C3,C4,C5,C7,C8`.
- Component size 6 ≤ `K_max`. Exact solve returns `{A,B,C}` (higher `SE3`
  temporal proximity). No-good cut → second-best `{D,E}`, feasible.
- Materiality: the two allocations differ by which payments leave
  `1100_GATEWAY_RECEIVABLE`; max account delta = ₹1,00,000 ≫ τ.
- Δs = 400 bps < ε = 1500 bps.
- Probes: `fetch_order` on all five returns receipts that match neither set
  distinctively. `PROBE_BUDGET_EXHAUSTED`.
- **Verdict: `ABSTAINED`.** Certificate records `{A,B,C}` vs `{D,E}`, shared
  hard constraints `[C1,C2,C3,C4,C5,C7,C8]`, Δs = 400 bps, materiality
  ₹1,00,000, τ, ε, and the three probes attempted.
- Ledger (posting P6, `DATA_MODEL.md §17.1` — the unexplained item is the
  outbound settlement, so Suspense takes the debit and the receivable is
  relieved): `DR 9000_SUSPENSE_UNRECONCILED ₹1,00,000 / CR 1100_GATEWAY_RECEIVABLE
  ₹1,00,000`. `item_net_paise` for this item is `+10,000,000`, and it enters
  gate G3 as `|+10,000,000|`.

Contrast: ablation `A2-NOABSTAIN` — ASSAY with the abstention gate removed —
accepts `{A,B,C}` and reports "matched." When ground truth says the settlement
was `{D,E}`, it has silently misstated ₹1,00,000 across two control accounts and
reported zero exceptions, with a Suspense balance of zero it did not earn. That
delta, measured across a batch and priced in rupees, is the project's core
result — and because `A2` differs from ASSAY in exactly one component, the delta
is attributable to abstention alone.
