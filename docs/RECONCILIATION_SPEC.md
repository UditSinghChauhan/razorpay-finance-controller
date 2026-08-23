# RECONCILIATION_SPEC — ASSAY

**Spec version:** 1.1.0 · **Date:** 2026-08-23

The matching algorithm, the ambiguity definition, and the rules that decide
accept / reject / abstain. This is the technical core of the project.

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
| `AN2` settlement → bank line | `normalize(settlement.utr) === normalize(bank_ref)` and amount equal | UTR is designed to be globally unique |
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
| `C1` | Currency equality across all members and the target | Cross-currency netting does not occur within an INR settlement |
| `C2` | Type compatibility: a refund may only offset a payment on the same `order_id`; an adjustment may only attach to its `related_entity_id` when present | Gateway semantics |
| `C3` | Temporal ordering: `created_at ≤ settled_at ≤ bank.value_date` for every member | Money cannot settle before capture or arrive before it is sent |
| `C4` | Settlement window: `settled_at − created_at ∈ [T_min, T_max]` (declared: 1–7 days) | Razorpay settlement cycles are T+1 to T+3 for standard merchants; 7 days covers holidays and holds |
| `C5` | Per-line arithmetic identity: `credit = amount − fee − tax` for payments, `debit = amount` for refunds | `DATA_MODEL.md §6`; a line failing this is corrupt, not a candidate |
| `C6` | Exact tie-out: `Σ credit(members) − Σ debit(members) = target.amount`, **zero tolerance** in paise | Settlement amounts are exact; a tolerance here is how false matches get admitted |
| `C7` | One-allocation: no member may already belong to an accepted allocation | Double-counting a payment is the most expensive reconciliation error |
| `C8` | `on_hold === false` for members claimed as settled | Held funds are not in the transfer |

Zero tolerance on `C6` is deliberate and worth defending: real settlement
arithmetic is exact in paise. Where a *declared* bank-side rounding operator is
in force (family F03), the tolerance is an explicit, logged property of that
operator, not a global fudge factor. A global tolerance is the standard way recon
tools manufacture confident wrong answers.

### 4.2 Soft evidence (ranks — never admits)

| ID | Signal | Weight |
|---|---|---|
| `SE1` | UTR prefix match length | 0.35 |
| `SE2` | `order_ref` ↔ `receipt` string similarity (Jaro–Winkler) | 0.20 |
| `SE3` | Temporal proximity to the modal settlement lag | 0.15 |
| `SE4` | Method / card-network agreement with the merchant memo | 0.10 |
| `SE5` | Probe result corroboration | 0.20 |

`evidence_score ∈ [0,1]` is a weighted sum, used **only** to order candidates and
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
   solutions, the best is the one with the highest `evidence_score`.
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
- **Δs** = `|evidence_score(best) − evidence_score(second)|`.
- **τ** (materiality threshold) = `max(₹100.00, 0.1% of component value)`,
  frozen in `PREREGISTRATION.md`.
- **ε** (evidence margin) = `0.15`, frozen.

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
| `fetch_settlement_detail(settlement_id)` | May supply constituent IDs directly |
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
| `I3` | Line arithmetic: `credit = amount − fee − tax` (payments), `debit = amount` (refunds) | Accepting a corrupted or forged recon line |
| `I4` | Settlement closure: `settlement.amount = Σ credit − Σ debit` over its allocated lines | A settlement that does not equal its own contents |
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

Every observation reaches exactly one terminal state. There is no fourth state
and nothing is dropped.

```
  RECONCILED   an allocation passed S4 with UNIQUE / DISCRIMINATED /
               IMMATERIALLY_AMBIGUOUS and passed all of I1..I9
               → posts to the real control accounts

  ABSTAINED    S4 returned AMBIGUOUS or INTRACTABLE
               → posts to 9000_SUSPENSE_UNRECONCILED, carries a certificate

  EXCEPTION    an ingest invariant failed, an S5 invariant failed, or no
               admissible candidate exists at all
               → posts to 9000_SUSPENSE_UNRECONCILED, carries a class + owner
```

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
| **G1** | Every observation has exactly one terminal state (`RECONCILED`, `ABSTAINED`, `EXCEPTION`) | A record was dropped — an ASSAY defect |
| **G2** | Trial balance: `Σ dr = Σ cr` over all posted journal lines, recomputed from the event log | The ledger is incoherent — an ASSAY defect |
| **G3** | Suspense identity: `balance(9000_SUSPENSE) = Σ abstained value + Σ open exception value`, **exactly, to the paisa** | An exception was suppressed or double-posted — an ASSAY defect |
| **G4** | Hash chain recomputes from genesis and matches the stored root hash | The audit trail was altered |
| **G5** | No allocation with a non-empty `invariants_failed` was posted | The validation gate was bypassed |

Balances at close are **recomputed by projection from the event log**, never read
from cached state. A corrupted balance that is not backed by an event simply
disappears on re-projection, which is what makes G2 and G3 meaningful.

### 10.2 The three outcomes

```
  all gates pass  AND  unresolved_value <= close_policy.max_unresolved
      → CLOSED
        signed close report, ledger root hash published, period sealed

  all gates pass  AND  unresolved_value >  close_policy.max_unresolved
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
  close_policy.max_unresolved_ratio = 0.005   // 0.5% of total batch value
  close_policy.max_unresolved_abs   = 5_000_000 paise  (₹50,000)
  → period may auto-close iff unresolved_value <= min(ratio × batch, abs)
```

Both bounds are frozen in `PREREGISTRATION.md §7`. The ratio prevents a large
batch from auto-closing over a large absolute gap; the absolute bound prevents a
small batch from auto-closing over a gap that is small in percentage terms but
material in rupees. An operator may always close manually, which records a
`human` actor on the `CLOSE` event — the override is permitted, but never silent.

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
- Δs = 0.04 < ε = 0.15.
- Probes: `fetch_order` on all five returns receipts that match neither set
  distinctively. `PROBE_BUDGET_EXHAUSTED`.
- **Verdict: `ABSTAINED`.** Certificate records `{A,B,C}` vs `{D,E}`, shared
  hard constraints `[C1,C2,C3,C4,C5,C7,C8]`, Δs = 0.04, materiality
  ₹1,00,000, τ, ε, and the three probes attempted.
- Ledger: `DR 9000_SUSPENSE ₹1,00,000 / CR 1200_BANK ₹1,00,000`.

Contrast: ablation `A2-NOABSTAIN` — ASSAY with the abstention gate removed —
accepts `{A,B,C}` and reports "matched." When ground truth says the settlement
was `{D,E}`, it has silently misstated ₹1,00,000 across two control accounts and
reported zero exceptions, with a Suspense balance of zero it did not earn. That
delta, measured across a batch and priced in rupees, is the project's core
result — and because `A2` differs from ASSAY in exactly one component, the delta
is attributable to abstention alone.
