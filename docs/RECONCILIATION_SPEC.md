# RECONCILIATION_SPEC — ASSAY

**Spec version:** 1.4.31 · **Date:** 2026-09-01

**At spec 1.4.31** this document adds **one clarifying paragraph to `§10.1`** and
changes no gate, invariant, constraint or threshold. Register row `DATA_MODEL.md
§22.2` **M50** records what `G5` asserts — *no allocation carrying a **recorded**
invariant failure was posted* — and what it does not: it does not assert that any
invariant was **evaluated**, which is `Decision.invariants_checked`'s business. That
distinction is what lets `EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` ablation exist
without weakening the gate, and it forecloses the reading in which `A1` evaluates the
invariants and posts the failures anyway. **`G1`–`G5` are unchanged and stay active
for every agent**, as are `§10.2`'s three outcomes, `§10.3`'s close policy, `§10.4`'s
procedure, `§7`'s `I1`–`I9` **definitions** and its failure semantics, `§6`'s
materiality and probe loop, `§3`'s anchor table, `§4.1`'s `C1`–`C8` and every `§9`
terminal state. **`constraint_set_hash` does not move** and benchmark stays
**v1.0.8**. See `DECISION_BRIEF.md §A.38` and `PREREGISTRATION.md §10` **V26**.

**At spec 1.4.30** this document is unchanged apart from the version header. The
amendment fixes `DATA_MODEL.md §17.1.1`'s *"the settlement it is allocated to"* as
the settlement of the **allocation under evaluation** (register row
`DATA_MODEL.md §22.2` M49), which is what makes `§6`'s materiality non-zero and
`§6`'s `AMBIGUOUS` and `DISCRIMINATED` outcomes reachable — the reachability
**spec 1.4.21 already asserted** here and in `§11`. **`§6` is not amended**: its
materiality formula, its four outcomes, `τ`, `ε` and the second-best certificate
are untouched, as are `§6.2`'s probe loop, its `P_max` budget, its closed
five-probe enum and its committed surface, `§11`'s worked example and verdict, and
`§3`'s anchor table. **No constraint, signal, weight, threshold, probe, probe
source or outcome rule changes** and `constraint_set_hash` does not move.
Benchmark v1.0.7 → **v1.0.8**. See `DECISION_BRIEF.md §A.37`.

**At spec 1.4.29** this document is unchanged apart from the version header. The
amendment settles agent **placement** (register row `DATA_MODEL.md §22.2` M47) and the
evaluation **output surface** (M48); `§6.2`'s probe loop, its `P_max` budget, its
five-probe enum and its committed surface are untouched, and `§10.1`'s `G1`–`G5` are
neither implemented nor amended here. **No constraint, signal, weight, threshold,
probe, probe source or outcome rule changes** and `constraint_set_hash` does not move.
Benchmark stays **v1.0.7**. See `DECISION_BRIEF.md §A.36`.

**At spec 1.4.28** this document is unchanged apart from the version header. The
amendment freezes the `PREREGISTRATION.md §5.3` consistency draw (register row M44)
— a build gate's sampler, which reads `C1`–`C8` through the two implementations it
compares and **amends none of them**. **No constraint, signal, weight, threshold,
probe, probe source or outcome rule changes**; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`,
`P_max = 3`, the five-probe enum, `§6`'s four outcomes and `§6.2`'s probe surface
are untouched, and `constraint_set_hash` does not move. Benchmark v1.0.6 →
**v1.0.7**. See `DECISION_BRIEF.md §A.35`.

**At spec 1.4.27** `§6.2`'s probe surface `bench/<split>/recon_report.jsonl` is
**unchanged**: `DATA_MODEL.md §22.2` M42 scopes the *dataset* artifacts to
`(split, seed)` and leaves this one split-scoped exactly as M36 ratified, because it
is a lookup table keyed by a globally unique `settlement_id` and is *"never an
`Observation`, and never ingested"* — a surface has nothing to partition. M38's
`entity_id`-ascending order now holds over the merged split artifact, which is what
that order was always for. **No constraint, signal, weight, threshold, probe, probe
source or outcome rule changes**; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, `P_max = 3`, the
five-probe enum and `§6`'s four outcomes are untouched, and `constraint_set_hash` does
not move. Benchmark v1.0.5 → **v1.0.6**. See `DECISION_BRIEF.md §A.34`.

**At spec 1.4.26** `§6.2` records that its *"abstentions resolved per probe spent"*
comparison is **non-discriminating on the conforming v1.0.0 population** — `R3`'s
choice set is a singleton and `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy is
weakly dominant, so the affirmative *"beats"* reading is unfalsifiable and is
withdrawn. **Disclosure only.** **No constraint, signal, weight, threshold, probe,
probe source or outcome rule changes**; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`,
`P_max = 3`, the five-probe enum and `§6`'s four outcomes are untouched,
`constraint_set_hash` does not move, `GT_VERSION` stays 1.1.0 and **benchmark v1.0.5
is unchanged**. See `DECISION_BRIEF.md §A.33`, register row M41,
`PREREGISTRATION.md §10` V23.

**At spec 1.4.25** `§6.2` records three governance decisions and one implementation
convention: the `A3-NOLLM` **static probe priority policy** is frozen into
`PREREGISTRATION.md §7` (register row M39); `R3` **may not propose
`widen_temporal_window`**, `DECISION_BRIEF.md §L.1` rule 2 being unchanged and
unweakened (M40); `§6`'s `A2` middle case is **closed** by
`DATA_MODEL.md §13`'s fourth certificate reason `NO_USEFUL_PROBE_AVAILABLE` (M40);
and a well-formed proposal rejected before budget is spent **terminates the loop**,
recorded as an implementation convention. **No constraint, signal, weight, threshold
or outcome rule changes**; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, `P_max = 3` and `§6`'s
four outcomes are untouched, the probe enum stays **closed at five** for the
executor, `constraint_set_hash` does not move and `GT_VERSION` stays 1.1.0.
Benchmark v1.0.4 → **v1.0.5**. `M31`'s date-scoping field and `M33`'s `days` bound
**remain open**. See `DECISION_BRIEF.md §A.32`.

**At spec 1.4.24** `§6.2` fixes three properties of the recon report the spec-1.4.22
amendment named but did not settle: its **row order** (`entity_id` ascending), that
**unsettled rows are included**, and that the **offline seal may read the artifact**
to compute `recon_report_sha256`. **No constraint, signal, weight, threshold or
outcome rule changes**; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε`, `P_max` and `§6`'s four
outcomes are untouched, `constraint_set_hash` does not move, `GT_VERSION` stays
1.1.0 and benchmark v1.0.4 is unchanged. `M31`'s date-scoping field **remains
open**. See `DECISION_BRIEF.md §A.31`.

**At spec 1.4.23** `§6.2` names the owner of the probe **loop**: `packages/probe`,
a pure state machine holding `P_max` accounting, the pre-call `I6` check, the sole
constructor of the closed five-probe call, and the `PROBE` event body. It performs
**no I/O** and does not call `R3`. **No constraint, signal, weight, threshold or
outcome rule changes**, `§6`'s `A2_MIDDLE_CASE_UNSPECIFIED` seam is surfaced rather
than replaced, and benchmark v1.0.4 is unchanged. See `DECISION_BRIEF.md §A.30`.

**At spec 1.4.22** `§6.2` ratifies `fetch_settlement_recon`'s **source**: the
committed PG-side recon report `bench/<split>/recon_report.jsonl`, with
`settlement_id` as its only query key and **no `settlement_utr` fallback**.
`DATA_MODEL.md §12` had named the source class since spec 1.4.14; what was
missing was a file able to hold a row the observations do not. **No constraint,
signal, weight, threshold or outcome rule changes** — `C1`–`C8`, `SE1`–`SE5`,
`τ`, `ε`, `P_max` and `§6`'s four outcomes are untouched, and
`constraint_set_hash` does not move. Benchmark v1.0.3 → **v1.0.4**. See
`DECISION_BRIEF.md §A.29`.

The matching algorithm, the ambiguity definition, and the rules that decide
accept / reject / abstain. This is the technical core of the project.

**At spec 1.4.6** this document is unchanged apart from the version header.
**`§6`'s `τ` formula is untouched** — `max(₹100.00, 10 bps of component value)`
stands exactly as written; what changed is that `DATA_MODEL.md §11` now defines
the `Component.total_value_paise` its second term names. `§5`'s component
decomposition is likewise unchanged and is now cited by that definition. See
`DECISION_BRIEF.md §A.13`.

**At spec 1.4.5** this document is unchanged apart from the version header.
`§3`'s `AN2` and `§10.3`'s close policy are named in `PREREGISTRATION.md §10`
V19 and **neither is changed**; `max_unresolved_ratio_bps` remains 50. See
`DECISION_BRIEF.md §A.12`.

**At spec 1.4.4** this document is unchanged apart from the version header.
`C1`–`C8` membership, order and clauses are untouched and `constraint_set_hash`
does not move; `DATA_MODEL.md §11.1` supplies the terms the eight rows read
rather than altering any of them. See `DECISION_BRIEF.md §A.11`.

**At spec 1.4.3** this document **splits `C3` into two declared halves** (§4.1)
and states **co-settlement coherence** as a consequence of `DATA_MODEL.md §6`'s
new definition of `settled_at` (§4.1). **`C1`–`C8` membership and order are
unchanged, no constraint was added, removed or reordered, `I1`–`I9` are unchanged,
no threshold moved and no metric definition changed**, and benchmark v1.0.3 is
unchanged. The split follows `C2`'s precedent: `C3`'s two conjuncts have different
evidence requirements, and the bank-arrival half is declared
**binding-when-in-scope** rather than allowed to return a silent pass on the ~70%
of settlement targets whose bank line `AN2` cannot identify. Co-settlement
coherence is **not a ninth constraint** — it is the observable content of a field
definition, it reads only members' own `settled_at`, and it is *necessary, not
sufficient*, so `F08` remains a matching problem. `constraint_set_hash` moves for
the `C3` split. See `DECISION_BRIEF.md §A.10`.

**At spec 1.4.2** this document fixes the truth value of `C3` and `C4` against a
null `settled_at` (§4.1): a candidate member whose `settled_at` is null satisfies
neither, and is excluded from every candidate. **`C1`–`C8` membership is
unchanged, `I1`–`I9` are unchanged, no threshold moved and no metric definition
changed**, and benchmark v1.0.3 is unchanged. The rule is confined to a case the
specification previously left undetermined; every true allocation contains only
settled members, so `PREREGISTRATION.md §5.3`'s completeness gate is unaffected.
It is **not** an application of `DATA_MODEL.md §17.1.1`'s *"undefined — not
satisfied"* principle, which is stated for **invariant** `I5` at a different
stage; the grounds are `C4`'s own bounded quantity and `C8`'s unique
settled-only scoping, both given at §4.1. See `DECISION_BRIEF.md §A.9`.

**At spec 1.4.1** this document **retired anchor `AN5`** (§3) and annotated `SE2`
as a post-probe signal (§4.2). `AN5` was never implementable — `order.receipt` is
quarantined by `DATA_MODEL.md §0` rule 4 — and, independently, a hard anchor on
merchant-controlled ERP data contradicts `THREAT_MODEL.md §T5`'s soft-evidence
doctrine and is forgeable by the insider that section models. **No constraint,
invariant, threshold or metric changed**, and benchmark v1.0.3 is unchanged. The
consequence — every `ledger_entry` reaches `E13_LEDGER_ONLY` — is disclosed at
§3 and in `EVALUATION_SPEC.md §4.1`. See `DECISION_BRIEF.md §A.8`.

**At spec 1.4.0** this document defined gate G3's item partition and amended its
right-hand side's universe (§10.1), restated §9's terminal-state postings against
`DATA_MODEL.md §17.1.1` (seven of fourteen exception classes open a Suspense
item and seven do not), restated the close-policy residual (§10.3), and verified
G3 arithmetically on the §11 worked example. **`C1`–`C8` membership is unchanged,
`I1`–`I9` are unchanged, and no threshold moved** — `max_unresolved_ratio_bps`
remains 50. The G3 amendment **lowers `unresolved_value_paise` and makes
`CLOSED` easier to reach**; see `DECISION_BRIEF.md §A.7`.

**At spec 1.3.0** this document restated the fourth `EXCEPTION` trigger as an
evidence condition (§9) and declared `C2`'s adjustment half a generation invariant,
non-binding agent-side, following the `C8` precedent (§4.1) — see
`DECISION_BRIEF.md §A.6`. **`C1`–`C8` membership is unchanged and no threshold
moved.** The paragraphs below describe the earlier **1.2.0** and
**1.1.1** releases and are retained as history.

**At spec 1.2.0** this document added the `REFERENCE` terminal state and a fourth
`EXCEPTION` trigger (§9), restated gate G3 in gross per-item form (§10.1),
replaced the close policy's absolute bound (§10.3), and moved `evidence_score`
and ε to basis points — see `DECISION_BRIEF.md §A.5`.

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
| ~~`AN5` ledger entry → order~~ | ~~`merchant_ledger.order_ref === order.receipt`~~ | **NOT EXERCISED at spec 1.4.1 — see below.** The anchor set is `AN1`–`AN4` |

An anchor is **rejected** if it would violate the one-allocation invariant (I2) —
i.e. if the target is already anchored to a different source. A rejected anchor
becomes `E08`/`E09`/`E14`, never a silent overwrite.

**`AN5` is not exercised, for two independent reasons `[ASSAY-MODEL]`.** It is
declared here and retired here; the row above is struck through rather than
deleted so that the anchor's history stays legible.

*It is not implementable.* `AN5` compares `merchant_ledger.order_ref` against
`order.receipt`, and `order.receipt` is quarantined: `DATA_MODEL.md §0` rule 4
places it *"only in `untrusted_text` … visible only to the LLM adjudicator"*,
`DATA_MODEL.md §10` makes the ban structural — *"it is not that the core
*chooses* not to read hostile text, it is that it *cannot*"* — and
`ARCHITECTURE.md §4` boundary 1 states that *"the deterministic core never reads
them."* The shipped `OrderSchema` accordingly carries no `receipt` field. Nor may
the comparison be delegated: this section requires anchors to be *"not subject to
scoring or LLM involvement."*

*It should not be implemented.* `THREAT_MODEL.md §T5` holds that the merchant
ledger *"only contributes **soft** evidence (`SE2`)"*, and `DATA_MODEL.md §12`
holds that *"soft evidence can only rank, never admit."* An anchor is hard
evidence, and this section removes everything anchored from the search space — so
`AN5` would make a **hard, scrutiny-retiring** determination out of a field
`THREAT_MODEL.md §1.1` classes as merchant-controlled, on the source it rates
*"the highest-value surface."* It is also forgeable by the adversary `§T5`
models: an insider who controls `order_ref` and knows the merchant's receipt
scheme can set the two equal, anchor a fabricated entry to a real order, and
retire it from the exception queue — defeating the control `§T5` exists to
provide. Hashing the key would not change this, because the preimage is
guessable by construction.

**The consequence is stated rather than mitigated.** A `ledger_entry` is a
reconcilable kind (`DATA_MODEL.md §10.1`), is never a target (§4) and cannot be a
candidate member (`C6` requires `credit`/`debit`, which `MerchantLedgerEntry` does
not carry), so with `AN5` retired it has no route to `RECONCILED` and reaches
`EXCEPTION` under §9's *"no admissible candidate exists at all"*, with class
`E13_LEDGER_ONLY`. **Every merchant ledger entry therefore reaches `E13`.**
`§T5`'s *prevention* is unaffected and in fact strengthened — a fabricated entry
cannot reach `RECONCILED`, posts no journal line (`DATA_MODEL.md §17.1.1`) and
moves no control account — but its *detection* loses discrimination, because the
fabricated entry is flagged among all of them rather than among a few. The
evaluation consequences are disclosed at `EVALUATION_SPEC.md §4.1` and `§6` and
recorded as a threat to validity at `PREREGISTRATION.md §10`.

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
| `C2` | Type compatibility. **Refund half, binding:** a refund may only offset a payment on the same `order_id`. **The test is referential, not co-membership, ratified at spec 1.4.8 `[ASSAY-MODEL]`, register row M22:** the refund member's own `order_id` must equal the `order_id` of the payment its `payment_id` names, and **that payment need not be a member of the same candidate**. Where the named payment has no observation in the dataset the clause is **not evaluated** and excludes nothing — that absence is `E10_REFUND_ORPHAN` (`DATA_MODEL.md §15`), not a `C2` exclusion. Where both a `recon_line` carrying that `entity_id` and a `payment` observation carrying that `id` are present, **the `recon_line` governs**. **Adjustment half, non-binding agent-side:** an adjustment may only attach to its `related_entity_id` when present | `[RZP-DOC]` for the refund half — a refund documents its parent `payment_id`. `[ASSAY-MODEL]` for the adjustment half: `related_entity_id` is ASSAY's construct, not a Razorpay field, and per `DATA_MODEL.md §10` it is **not observable** — it lives on the true-state `Adjustment` entity (`DATA_MODEL.md §9`), which is never an observation. The adjustment half is therefore a **generation invariant**: the generator honours it when constructing the true state, and neither the engine nor the oracle can evaluate it. Following the `C8` precedent, it is retained in the constraint set and declared expected-non-binding on v1.0.0 data, and the fraction of candidates it excludes is reported so a reviewer can see that it is doing nothing rather than assume it is doing something |
| `C3` | Temporal ordering, in two halves since spec 1.4.3. **Ordering half, binding:** `created_at ≤ settled_at` for every member. **Bank-arrival half, binding where a bank line is in scope:** `settled_at ≤ bank.value_date` for every member, where *bank* is the bank line that receives the **target's** money — the target itself when the target is a `bank_line`, and its `AN2`-matched bank line when the target is a `settlement`. Where no bank line is in scope the half is *evaluated: non-binding* under `PREREGISTRATION.md §5.3`, **per target rather than per dataset** | Money cannot settle before capture or arrive before it is sent. `[RZP-DOC]` Razorpay documents that settlement `status: processed` marks *initiation*, with the bank credit following the NEFT/RTGS/IMPS timeline — so a strictly later bank value date is expected, not anomalous. `[ASSAY-MODEL]` the split: the two halves have different evidence requirements — the first is intrinsic to the member, the second needs a bank line identified, and `PREREGISTRATION.md §4.2` freezes `bank_ref` quality at *"30% a clean UTR, 70% absent or non-UTR"*, so the second is unavailable on most settlement targets. Membership is unchanged; this is the shape `C2` has carried since spec 1.3.0 |
| `C4` | Settlement window: `settled_at − created_at ∈ [T_min, T_max]` (declared: 1–7 **calendar** days) | `[RZP-DOC]` the documented standard domestic cycle is **T+2 working days** from capture, and is subject to bank approval and variation by vertical and risk. `[ASSAY-MODEL]` ASSAY simulates in calendar days with no bank-holiday calendar; `T_max = 7` is sized to absorb the working-day expansion (a capture before a weekend plus a public holiday can exceed five calendar days). See `PREREGISTRATION.md §4.2` |
| `C5` | Per-line arithmetic identity: `credit = amount − fee` for payments (`fee` is GST-inclusive), `debit = amount` for refunds | `DATA_MODEL.md §6`; a line failing this is corrupt, not a candidate. Corrected in spec 1.1.1: Razorpay documents `fee` as *"Fee (including GST)"* with `tax` the GST component **inside** it, so subtracting both double-counts GST |
| `C6` | Exact tie-out: `Σ credit(members) − Σ debit(members) = target.amount`, **zero tolerance** in paise | Settlement amounts are exact; a tolerance here is how false matches get admitted |
| `C7` | One-allocation: no member may already belong to an accepted allocation | Double-counting a payment is the most expensive reconciliation error. `[RZP-DOC]` and directly supported: Razorpay documents that partial settlements defer **whole transactions** to the next slot — its own worked example settles P1 and P2 and defers P3 — so a single payment is not split across two settlements |
| `C8` | `on_hold === false` for members claimed as settled | `[ASSAY-MODEL]` a line flagged as held is not part of the settled set. `[RZP-DOC]` the field itself is documented, but specifically as *"whether the account settlement **for transfer** is on hold"* — a Razorpay Route concept toggled via `PATCH /v1/transfers/:id`. Route is out of Tier-0 scope, so **`C8` is expected to be non-binding on v1.0.0 data**; it is retained as a declared admissibility filter, and the fraction of candidates it excludes is reported so a reviewer can see that it is doing nothing rather than assume it is doing something |

**`C2`'s refund half is referential, ratified at spec 1.4.8 `[ASSAY-MODEL]`.**
*"Offset"* admitted two readings and this section had not chosen between them.
**Co-membership** would require the parent payment to be a member of the same
candidate; **referential** requires only that the refund's own `order_id` agree
with the payment its `payment_id` names. The referential reading is adopted, and
the co-membership reading is not merely disfavoured but **refuted**:

```
  §3's AN3      states the refund -> payment link's basis as "Referential".

  this row's    "a refund documents its parent payment_id" -- a fact carried
  justification on the refund's own row, needing no co-member.

  §15's E10     "Refund references a payment NOT IN THE DATASET" already owns
                absence, so C2 is not the absence filter.

  §4.2 + §4.1   one settlement batch per capture-day, and F02's refund
                "settled in batch N+2" -- which §4.2 relies on when it says
                this "leaves the 31-day grid for a refund raised in the final
                two days". A refund's batch is keyed to ITS OWN day, and a
                refund follows its capture, so the parent is never in the
                same batch and never a co-member.

  PREREGISTRATION.md §5.3   co-membership therefore excludes EVERY
                refund-carrying true allocation, failing the completeness
                gate, at which point "the benchmark is invalid and no results
                may be reported from it".
```

A reading under which this specification invalidates its own benchmark is not
the reading it intends, so the choice is closed rather than preferred.

**The source precedence is a declaration, not a derivation.** No clause ranks the
two observations that can carry the parent's `order_id`. The `recon_line` is
chosen because `DATA_MODEL.md §11.1` scopes a member's quantities to *"its own
observation payload and from no other source"* and `§22.1` D10 makes the
date-scoped recon report the source of settlement constituents: taking the
parent's `order_id` from the `pg_payments` view would compare a recon-report
field against a different view whose cross-view agreement nothing guarantees,
which is what `F04` and `F08` attack. Registered at `DATA_MODEL.md §22.2` M22.

**Membership, ordering and every other clause are unchanged.** The adjustment
half is untouched and stays *expected-non-binding*; `C1`, `C3`–`C8` are
untouched. `constraint_set_hash` **moves**, for the `C2` refund-half statement
alone, exactly as it moved for the `C3` split at spec 1.4.3.

**`C3` and `C4` against a null `settled_at`, ratified at spec 1.4.2
`[ASSAY-MODEL]`.** `PREREGISTRATION.md §4.2`'s batch-composition rule emits a
member the batch cannot carry with `settled_at: null`, and both constraints read
that field. Their truth value there was undetermined, and it is fixed here.

```
  rule      a candidate member whose settled_at is null does NOT satisfy C3,
            and does NOT satisfy C4. It is excluded from every candidate.

  applies   identically to both. They sit in one table, are both unqualified
            over members, read the same field and are evaluated at the same
            stage on the same candidate; §5.2 has the engine and the oracle
            implement one shared declaration that §5.3's consistency gate
            compares constraint by constraint, so a split treatment would make
            one null admissible under C3 and not under C4 with nothing to
            justify the difference.

  scope     the member's OWN settled_at. No constraint is re-based onto the
            target's settlement clock, and none is given a settled-only scope:
            C8 alone is written "for members claimed as settled", so the
            silence of C3 and C4 on that point is deliberate and they remain
            unconditional over members.

  effect    exclusion, never admission. A filter "admits or excludes, never
            ranks" (above), and an unconditional filter whose bounded quantity
            does not exist cannot report that it is within bounds: C4 bounds a
            settlement window an unsettled member does not have, and C3's
            ordering chain has a missing link.
```

**This changes nothing about the true allocation, and that is the point.** Every
allocation the generator records contains only settled members, each carrying a
`settled_at`, so `C3` and `C4` evaluate normally on it and
`PREREGISTRATION.md §5.3`'s completeness gate is unaffected. What the rule
removes is the engine's and the oracle's freedom to propose an **unsettled**
member as part of an allocation — a proposal that contradicts the row's own
`settled: false` and that `C6` would otherwise be the only filter against. It
therefore narrows enumeration rather than widening it, and it leaves `E02`'s
unsettled capture and `E11`'s unsettled refund to reach their terminal states by
the route `§9` already gives them: no admissible candidate exists at all.

**Co-settlement coherence, entailed at spec 1.4.3 — a consequence, not a ninth
constraint `[ASSAY-MODEL]`.** `DATA_MODEL.md §6` defines `settled_at` as
settlement-scoped: every recon line carried by one settlement records the same
value. A candidate for a settlement target proposes a set of lines **as the lines
that settlement carried**. If two proposed members carry different non-null
`settled_at`, the definition places them in different settlements, contradicting
the proposal. Therefore

```
  every member of a candidate for a settlement target carries the same settled_at.
```

**`C1`–`C8` membership, order and wording are unchanged, and this is not a ninth
filter.** It is the observable content of a field definition, so it is stated here
rather than added to the table above, and `constraints.decl.ts` gains no row for
it. Two properties are load-bearing and both follow from `§6`'s wording. It reads
**only members' own `settled_at`** — never the target's clock — so this section's
*"no constraint is re-based onto the target's settlement clock"* is untouched, and
`DATA_MODEL.md §6` explicitly asserts no relationship to `Settlement.created_at`.
And it is **necessary, not sufficient**: lines sharing a `settled_at` need not
share a settlement, so `F08` remains a matching problem rather than becoming a
lookup, and `C6` still has to tell two same-instant settlements apart.

**What it supplies is the bound `PREREGISTRATION.md §5.2`'s budget already
presupposes.** The unanchored members partition into `settled_at` equivalence
classes, each fully enumerated. `§5.2` requires *"a fully enumerated space"* under
`C_oracle`, which is satisfiable only over a bounded pool; nothing in `C1`–`C8`
bounds one, because every per-member clause is silent about the target. This does,
and `§5`'s expectation that *"~90% of components have size 1–3"* is a statement
about those classes rather than about an undifferentiated pool.

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
| `SE1` | UTR prefix match length, between `settlement.utr` and the `bank_ref` of its `AN2`-matched bank line. **Permanently inactive for ranking, from spec 1.4.10.** Both comparands are target-scoped, so `SE1` takes one value across every candidate of a target and can neither order candidates nor move the ε-gap — the only two uses this section gives the score. It could discriminate only for a `bank_line` target, whose candidates are sets of settlements each carrying its own UTR; `DATA_MODEL.md §11.1` (spec 1.4.4) gives that target the empty candidate set, so the context is gone. The row and its weight are **retained, not removed and not reallocated** | 3500 |
| `SE2` | `order_ref` ↔ `receipt` string similarity (Jaro–Winkler). **Post-probe only** — `receipt` is quarantined, so this signal is computable solely from a `fetch_order` probe result (§6.2), as `SE5` is. It scores 0 for every candidate on which no probe has run. **`SE2` is additionally declared expected-non-binding on v1.0.0 data at spec 1.4.20**, on the `C8` precedent in `§4.1` already applied to `SE1` (1.4.10) and `SE4` (1.4.11): `receipt` is reachable through `fetch_order`, but `order_ref` exists **only** on `MerchantLedgerEntry` (`DATA_MODEL.md §8`) and **no frozen clause pairs a `MerchantLedgerEntry` with a candidate, component, target or probed order** — `AN5`, the one historical pairing route, was retired at spec 1.4.1, and `§11.1` and `§17.1.1` leave `ledger_entry` neither member-eligible nor a target. The comparison therefore has no candidate-relative form on conforming v1.0.0 data. Its weight is **unchanged and unreallocated**, and **no pairing or aggregation function is ratified here** | 2000 |
| `SE3` | Temporal proximity to the modal settlement lag, restated in dimensionally coherent form at spec 1.4.13. `lag_days = (settled_at − created_at) / 86400`, a **real number, not floored**. `mode_days` = the mode of `floor(lag_days)` over **every `recon_line` observation in the dataset**, **ties to the lowest bin**. A **member's** score is `max(0, 1 − |lag_days − mode_days| / (T_max − T_min))`; a **candidate's** score is the **arithmetic mean** of its members' scores. Both terms are in days, so the ratio is unitless and expressing both in seconds gives an identical value | 1500 |
| `SE4` | Method / card-network agreement with the merchant memo. **Post-probe only** — `memo` is quarantined (`DATA_MODEL.md §0` rule 4, `§8`, `§10`) and `MerchantLedgerEntry` carries no structural method or card-network field, so this signal is computable solely from a `fetch_payment` probe result (§6.2), as `SE2` and `SE5` are. It scores 0 for every candidate on which no probe has run. **`SE4` is additionally declared expected-non-binding on v1.0.0 data at spec 1.4.11**, on the `C8` precedent in `§4.1`: it is retained as a declared signal, its weight is unchanged and unreallocated, and the fact that it separates no candidates is reported rather than assumed. **Its agreement function is therefore left undefined — partial credit between `method` and `card_network`, and the treatment of a `card_network` null on both sides, are unnecessary while the signal is non-discriminating, and are NOT settled here** | 1000 |
| `SE5` | Probe result corroboration: agreement between a `fetch_settlement_recon` report and a candidate's members. **Post-probe only**, as `SE2` and `SE4` are — already stated by this section's pre-probe block (spec 1.4.10) — so it scores 0 for every candidate on which no such probe has run. **Scope, ratified at spec 1.4.15: `fetch_settlement_recon` results only**; `§6.2` names a consumer for every other probe and leaves this one unnamed. **Score, ratified at spec 1.4.16.** Let `R` be the probe's returned `constituent_entity_ids`; let `R*` be their images under `DATA_MODEL.md §12`'s identifier relation (spec 1.4.14), **a returned id with no observation being excluded from `R*` entirely** — neither numerator nor denominator; and let `M` be `Candidate.member_obs_ids`. Both are then `ObservationId` sets, and `SE5 = \|R* ∩ M\| / \|R* ∪ M\|`, with `SE5 = 0` when `\|R* ∪ M\| = 0`. `SE5 = 1` iff `R*` and `M` are equal and non-empty. `R*` is target-scoped and `M` is candidate-scoped, so unlike `SE1` this signal does order the candidates of one target. **Multi-probe aggregation, derived at spec 1.4.17.** Where more than one `fetch_settlement_recon` result carries `settlement_id = S`, `R` is the **union** of their `constituent_entity_ids` over **every** such result — irrespective of each probe's `date` argument and of the order the probes ran. Repeating a probe adds nothing; a result that returns nothing removes nothing | 2000 |

`evidence_score_bps ∈ [0, 10_000]` is a weighted sum, used **only** to order candidates and
to compute the ε-gap in §6. Weights are frozen in `PREREGISTRATION.md` before the
sealed run and are **not tuned on the test split**.

**What is live before a probe, stated at spec 1.4.10 `[ASSAY-MODEL]`, register row
M24, restated at spec 1.4.13 (M27).** With `SE1` inactive and `SE2`, `SE4` and
`SE5` post-probe only, **`SE3` alone is computable before any probe runs** —
*derived*. `PREREGISTRATION.md §4.2`'s frozen cycle admits only `T+1`, `T+2` and
`T+3`, and the spec-1.4.7 grid puts `lag_days ∈ (n, n + 0.875]`, so on any
conforming dataset the modal bin is `2` and the largest attainable
`|lag_days − mode_days|` is **1.875 days** — reached by a `T+3` member captured at
the start of its day. Hence `SE3 ∈ [1 − 1.875/6, 1) = [0.6875, 1)` and the
greatest pre-probe `Δs` is `1500 × 0.3125 = **469 bps**`, **roughly one third of
`ε = 1500`**. `§6`'s `DISCRIMINATED` outcome is therefore **unreachable before
probing**, and by a wide margin rather than at a boundary.

**This supersedes the figure published at spec 1.4.10.** That amendment stated
`1250 bps`, computed from `C4`'s full `[1, 7]`-day domain under the formula
corrected here. `1250` remains a true upper bound and nothing published under it
is falsified, but the frozen `T+1`–`T+3` cycle never populates that domain's
tails, so `469` is the bound that actually holds. Every materially ambiguous component must reach
`§6.2`'s probe loop or abstain, which is the order `§6.2` already describes, and
which makes `P_max = 3` and the *abstentions resolved per probe spent* metric
load-bearing on every material case. Recorded at `PREREGISTRATION.md §10` V20.

**A dimensional error in the spec-1.4.10 wording, corrected at spec 1.4.13
`[ASSAY-MODEL]`, register row M27.** That text defined `lag` in **elapsed
seconds** and the modal lag in **whole days**, then wrote `|lag − mode|` —
subtracting a day index from a second count. The two terms had no common unit:

```
  member: T+2 batch, captured 09:00   lag = 216_000 s = 2.5 days,  mode = 2

  as written, denominator in days     1 - |216000 - 2| / 6      -> clamped to 0
  as written, denominator in seconds  1 - |216000 - 2| / 518400  -> 0.5833
  dimensionally coherent (days)       1 - |2.5 - 2|    / 6       -> 0.9167
```

Under the first reading **every member scores 0** and `SE3` would have been
silently inert, joining `SE1` and `SE4`; under the second it is systematically
wrong, because `mode` is subtracted from a seconds quantity without conversion.
The row above is the coherent form. **`T_min`, `T_max`, the 1500-bps weight and
the kernel's shape are unchanged** — only the units and the two previously
unstated terms are supplied.

**What is derived and what is ratified, kept apart.** *Derived:* the lag term
itself (`C4`; `O-C4-UNIT` at spec 1.4.7); that the **mode** requires binning (the
1.4.7 grid makes a seconds-granular mode degenerate); that the **numerator stays
continuous**, because that binning rationale is scoped to the mode and does not
reach the `lag` term; that days and seconds give an identical ratio; and the two
exclusions above. *Ratified, and frozen text determines none of them:* the
whole-day bin granularity, the run-level modal population, the lowest-bin tie
rule, the linear clamped kernel, the **`T_max − T_min` denominator** and the
**arithmetic-mean** member aggregation.

**Why those last two, on the record.** The denominator is `T_max − T_min` because
it is expressible in `C4`'s two frozen constants alone, where `T_max − mode`
mixes a frozen constant with a data-derived statistic and is **zero when the mode
reaches `T_max`** — well-defined here only because `§4.2`'s frozen cycle holds the
mode at 2, which is the kind of population-accident safety spec 1.4.7 was issued
to remove. **No cross-run comparability argument is offered:**
`EVALUATION_SPEC.md §5.3`'s batch sweep *"measures metrics 21 and 22 only"* and
produces no close-loop metric, so it does not bear on this choice. Aggregation is
the **arithmetic mean** because *"proximity"* of a set reads as a central tendency
rather than an extremum; `min` and `max` are extremum readings, and on a
two-member example `max` selects the **opposite** candidate from `mean`, `median`
and `min` alike. That ground is linguistic, and the record says so rather than
dressing it as a derivation.

**Members of one candidate genuinely differ in lag**, so aggregation is not
vacuous: `settled_at` is the instant of `capture-day + cycle`, so capture-day 5 at
`T+3`, capture-day 6 at `T+2` and capture-day 7 at `T+1` all settle on day 8 and
fall in one co-settlement class. A candidate may therefore hold members with
`n = 1, 2` and `3`.

**`SE5`'s scope, ratified at spec 1.4.15 `[ASSAY-MODEL]`, register row M29.**
`§6.2` declares five probes and names a consumer for four of them; `SE5` is the
one signal with no named input, and `fetch_settlement_recon` the one probe with no
named consumer. The scope is therefore **`fetch_settlement_recon` results only** —
**ratified, not derived**: elimination is not entailment, and this section's own
wording (*"Probe **result** corroboration"*) and `DATA_MODEL.md §12`'s generic
`kind: "probe_result"` both read the other way.

**A generic scope is excluded, and that part IS derived.** It would take
`widen_temporal_window` as an input, and that probe returns no evidence about the
world — it changes `C4`'s bound. Scoring it would let a constraint relaxation
**raise** the evidence score of the candidates the relaxation admitted, which is
the *"quiet constraint relaxation to manufacture a match"* that
`THREAT_MODEL.md §T7` names as the attack its controls prevent. `DATA_MODEL.md
§12` also splits evidence into *"hard = a filter, soft = a score contribution"*; a
rule change is the former, and scoring it as the latter miscategorises it.

**A named subset drawing on `fetch_order` or `fetch_payment` is NOT excluded.**
No clause in this specification forbids one probe result from feeding two
signals, and the arithmetic permits it — each signal is capped at its own weight
and the five total 10,000. Such a subset would, however, require a
**double-counting policy this specification does not state**, and none is
supplied here. That option is left open rather than closed.

**What this deliberately does not settle.** The **scoring function** is undefined:
no binary, recall, precision or Jaccard rule is introduced, and none is implied.
Nor is the treatment of `PREREGISTRATION.md §4.2`'s **`F05` partiality** —
`fetch_settlement_recon` queries the PG's recon report, so a returned
`constituent_entity_id` may have no observation (`DATA_MODEL.md §12`, spec
1.4.14), and whether such an id enters a numerator, a denominator, or neither is
**open**. The audit that produced this amendment established that the function
and that `F05` treatment are **one coupled decision rather than two**: the
measures whose denominator ranges over the returned set cannot be chosen without
also deciding `F05`, and the measures that avoid `F05` were shown to score
degenerately on constructed examples. Multi-probe aggregation under `P_max = 3`,
and any aggregation across probe results, are likewise **open**.

**`SE5`'s score, ratified at spec 1.4.16 `[ASSAY-MODEL]`, register row M30.** The
scoring function, the `F05` denominator treatment and the empty-result rule were
shown at spec 1.4.15 to be **one coupled decision**, and they are settled together
here. Three parts are derived; one is ratified.

**Derived — the `F05` treatment.** `PREREGISTRATION.md §5.3` resolved this exact
fact pattern for the completeness gate: `F05` withholds one constituent
`recon_line` at emission, so *"that member has no observation"*, and *"no
constraint excluded that allocation — it was never expressible in the candidate
language at all, and a gate that failed on it would report a constraint fault
where none exists"*. A `Candidate.member_obs_ids` ranges over observations, so
**no candidate can contain a member that has no observation**; charging one for
that absence reports an *evidence* fault where none exists. `§5.3`'s guard
transfers with it — expressibility is *"a property of observation existence and
kind alone"* — so the exclusion is decided by whether the observation exists and
never by whether excluding it helps a candidate. Under the rejected reading a
**perfect score is unattainable on every `F05` settlement**: with `R = {a,b,c}`,
`c` withheld, the best possible candidate `{a,b}` scores `0.667` against a wrong
candidate's `0`, giving `Δs = 1333 < ε` and an abstention on a target the
observable evidence identifies uniquely. Excluding the id gives `1.000` against
`0`, `Δs = 2000`, `DISCRIMINATED`.

**Derived — both directions of disagreement are penalised.** `§4.1` makes `C6`
exact with zero tolerance because *"a tolerance here is how false matches get
admitted"*, and `I4` makes a settlement **equal** to its allocated lines. A
candidate that omits a constituent the report names and one that adds a member
the report does not are therefore errors of the same kind. Each asymmetric
measure is blind to one of them, and blind in the strong sense of **returning a
tie between an allocation the report confirms and one it contradicts**: binary
consistency ties `{a,g}` with all six of `{a…f}` and yields `Δs = 0`; recall ties
the exact `{a,b,c}` with the superset `{a,b,c,d,e}`; precision ties `{a}` with
`{a,b,c}` against a six-member report. A signal `§4.2` gives no purpose but
ranking cannot rank there.

**Derived — an empty result scores 0 rather than dropping out.** `DATA_MODEL.md
§12` states that an empty `constituent_entity_ids` is *"a result rather than an
error"*, so it must produce a score; `AL3` freezes the `SE1`–`SE5` weights and
bars renormalisation; and this section requires a defined weighted sum. **Zero is
the only remaining value** — the same argument this specification accepted for
`SE4` absent a probe at spec 1.4.11. The formula already yields 0 for an empty
return whenever the candidate has members; the `|R* ∪ M| = 0` clause covers the
single remaining case, a zero-member candidate against an empty report.

**Ratified — Jaccard among the symmetric measures.** Derivation fixes that both
directions count; it does not select `|R* ∩ M| / |R* ∪ M|` over `F1` or any other
symmetric measure, and **frozen text names none**. Jaccard is adopted as the
standard set-similarity measure on this section's own precedent for `SE2`, which
names Jaro–Winkler rather than deriving a string metric. The choice is recorded
**ratified**, not dressed as entailment.

**Two ε-crossings, at `ε = 1500` bps and `SE5`'s frozen 2000.** Against a
six-constituent report, the exact candidate versus `{a,g}` scores **1667 under
recall, 1000 under precision and 1714 under Jaccard** — recall and Jaccard
`DISCRIMINATED`, precision `AMBIGUOUS`. Against the same report, `{a,g}` versus
all six scores **0 under binary and 1714 under Jaccard**. Each flips whether a
component posts to the control accounts or opens a Suspense item.

**`SE5` under more than one probe, derived at spec 1.4.17 `[ASSAY-MODEL]`, register
row M31.** `P_max = 3` is a budget **per component** (`ARCHITECTURE.md §R3`,
`THREAT_MODEL.md §T7`), and `§6.2`'s loop is sequential — *"deterministic code
executes it and **re-runs the solve**"* — so a component may accumulate several
`fetch_settlement_recon` results before the solve that emits a decision. `R` is the
**union** of `constituent_entity_ids` over every result carrying the target's
`settlement_id`. `R*`, `M`, the quotient and the empty-union zero are exactly as
ratified at spec 1.4.16 and are **not** reopened.

**The evidence accumulates rather than being replaced — derived.** `DATA_MODEL.md
§13` gives the certificate `probes_attempted: ProbeId[]`, *"what we tried before
giving up"*, and `§11`'s worked case spends three probes, evaluates them together
(*"returns receipts that match neither set distinctively"*) and records **all
three** on one certificate. **No clause in this specification discards or
supersedes an `Evidence` row.**

**Union is forced by this section's own frozen sentence.** `§6.2` names the probe's
referent as *"the lines carrying that `settlement_id`"* — the date is a query
parameter, not the object — and `DATA_MODEL.md §6` states the report is *"date-scoped
and paginated, and a period-close ingest must **iterate** rather than issue one
call"*, so reading it whole means combining windows additively. Against three
windows `{a,b}`, `{c,d}`, `{e,f}` of a six-constituent settlement, **only the union
lets a candidate equal to the settlement's constituent set score `1.000`**;
intersection gives `0.000` and latest, first and any per-probe aggregate give
`0.333`, each **falsifying** the row's *"`SE5 = 1` iff `R*` and `M` are equal and
non-empty"*. Worse, *latest* certifies the one-window candidate `{e,f}` **at
1.000** — a wrong allocation declared perfect. This is the same defect the `F05`
exclusion was derived from at spec 1.4.16: a perfect score made unattainable where
the evidence is complete.

**The alternatives fail on three further counts.** *Order dependence* — over the six
orderings of `{a}`, `{b,c}`, `{d,e,f}`, union takes **one** value while latest and
first take **three**, swinging `667` bps on probe order, an input
`ProbeResultDetail` does not carry (no date, no ordinal, no timestamp). *Evidence
destruction* — under intersection or latest a probe spent on a window that returns
nothing **erases** what an earlier probe established, while `§6.2`'s own metric is
*"abstentions **resolved** per probe spent"* and `ARCHITECTURE.md §R3` expressly
contemplates a *"wasted probe budget"*. *The cap* — scoring each result as separate
evidence gives `6000` bps for a signal frozen at `2000`, breaks
`evidence_score_bps ∈ [0, 10_000]`, and `AL3` bars the renormalisation that would
repair it; it also makes three identical probes score triple one probe.

**Union has the properties the loop requires — verified.** *Idempotent*: `§6.2`'s
*"deterministic code"* over a static dataset makes identical arguments return
identical results, and union of a repeat is inert. *Order-independent*. *Monotone*:
`R*` only grows, so an empty or repeated result never lowers a score, and a newly
returned constituent lowers one **only** where the candidate genuinely omits it — a
candidate holding the expanded `R*` still scores `1.000`. *Deterministic*: `R` is a
set, materialised in lexicographic order of `entity_id` so it enters `inputs_hash`
reproducibly under `DATA_MODEL.md §0` rule 5 and metric 23. **No `Evidence` field is
added.**

**Two things this deliberately leaves unspecified.** The **field the recon report is
date-scoped on** — `§22.1` D11 gives only *"`year` + `month`, optional `day`"* and no
document names the field. The union rule does not need it: under a `settled_at`
reading every line of one settlement shares a bucket and a query returns
all-or-nothing; under a `created_at` reading the optional `day` splits a
settlement's capture-days into disjoint partials. **Union is correct under both**,
and this amendment decides neither. Also unspecified: **any `R3` policy** about
which dates or probes to spend the budget on — that is probe *selection*, not probe
*aggregation*. `SE4`'s agreement function is untouched, and the spec-1.4.15
double-counting question stays dormant while the scope is one probe no other signal
consumes.

**Why `SE4` separates nothing, stated at spec 1.4.11 `[ASSAY-MODEL]`, register row
M25.** Six facts, each read off frozen text and none of them a choice:

```
  1  `memo` is quarantined (§0 rule 4, §8, §10) and NO §6.2 probe returns it.
     The five probes are fetch_order, fetch_payment, fetch_refund,
     fetch_settlement_recon and widen_temporal_window, and none is a
     ledger-entry probe. Contrast `receipt`, which DATA_MODEL.md §3 states
     is "reachable only through the `fetch_order` probe".

  2  MerchantLedgerEntry (§8) carries ledger_entry_id, booked_at, order_ref,
     invoice_no, gross_paise, expected_net_paise and gl_account -- no
     structural method or card-network field of any kind.

  3  fetch_payment supplies `method`, and §10's `payment` observation ALREADY
     carries `method` structurally, so the probe supplies nothing the engine
     lacked.

  4  `card_network` has NO Payment-side field. Spec 1.1.1 corrected the card
     attributes onto ReconLine "when they are settlement-recon columns", so
     the card half of this signal has no comparand on the probed entity.

  5  No EXERCISED §4.3 operator perturbs `method` or `card_network`.
     DROP_FIELD could and is declared not exercised; CONFLICT_REFERENCE
     alters references, not methods.

  6  §4.2's F06 construction draws "identical method -- ONCE from the frozen
     mix" and uses it for BOTH members of a collision pair, so the family
     that manufactures equal-credit ambiguity gives SE4 nothing to separate
     precisely where separation would be needed.
```

**Therefore `SE4` takes one value across every candidate of a target on any
conforming dataset, and contributes nothing to the ε-gap — derived.** Retaining
the row and its 1000 bps rather than reallocating or removing them is the
**ratified** half, and follows `§4.1`'s treatment of `C8` exactly: a declared
signal that excludes nothing is kept and reported doing nothing rather than
deleted. `§6.2`'s `fetch_payment` route is unchanged, the probe enum stays
closed, and no ledger-entry probe is added.

**Derived and ratified are kept apart here.** *Derived:* `SE1`'s comparand and its
inactivity; `SE4`'s post-probe gating and its zero score absent a probe; that
`SE3` requires **some** binning, because the spec-1.4.7 clock grid makes lag
near-continuous in seconds and a seconds-granular mode degenerate. *Ratified:*
retaining `SE1`'s weight rather than reallocating or removing it; and `SE3`'s
whole-day bin granularity, its dataset-wide modal population, its lowest-bin tie
rule, its linear clamped kernel, **its `T_max − T_min` denominator and its
arithmetic-mean member aggregation** — **none of which frozen text determines**.

**Two further `SE3` properties are excluded by derivation, recorded at spec 1.4.13
so they are not revisited.** A **candidate-scoped** modal population would let
each candidate supply its own mode and score itself ≈ 1.0, making `SE3` constant
across candidates and unable to rank — the only two uses this section gives the
score. A **raw sum** over members leaves `[0, 1]` — two members alone reach 1.686
— and breaks this section's `evidence_score_bps ∈ [0, 10_000]`; a *normalised*
sum is the arithmetic mean. Keeping the numerator **continuous** is likewise
derived: spec 1.4.10 introduced binning because a *seconds-granular **mode*** is
degenerate, and that reason does not reach the `lag` term, which `C4` defines as
the raw difference. **`SE4`'s agreement function is not settled by this amendment**,
and `SE5`'s scoring function was not settled by it either — `SE5`'s *scope* is
settled separately at spec 1.4.15 and its *score* at spec 1.4.16 — and the table
above says so in the rows themselves rather than leaving a reader to infer
completeness.

**`SE2` separates nothing on v1.0.0 data, derived at spec 1.4.20 `[ASSAY-MODEL]`,
register row M34.** Four facts, each read off frozen text:

```
  1  §4.2's SE2 comparands are `order_ref` and `receipt`. `receipt` is
     quarantined on Order and IS reachable -- §6.2's fetch_order supplies it,
     and DATA_MODEL.md §12's ProbeResultDetail carries it (spec 1.4.12).

  2  `order_ref` exists ONLY on MerchantLedgerEntry (DATA_MODEL.md §8).
     ReconLine's counterpart `order_receipt` is quarantined, and no other
     entity carries the field.

  3  AN5 -- `merchant_ledger.order_ref === order.receipt`, the ONLY clause
     that ever joined a ledger entry to an order -- is RETIRED at spec 1.4.1
     (§3), on two independent grounds.

  4  With AN5 retired, DATA_MODEL.md §11.1 makes `ledger_entry` not
     member-eligible and §17.1.1 makes it not a target, so §3's consequence
     holds: "every merchant ledger entry reaches E13_LEDGER_ONLY".
```

**Therefore no frozen clause pairs a `MerchantLedgerEntry` with a candidate, a
component, a target or a probed order, and `SE2` has no candidate-relative
comparison to make — derived.** `PREREGISTRATION.md §10` V12 states the same fact
from the other side: *"ASSAY consumes three sources and **ties out two**."*

**Retaining the row and its 2000 bps is the ratified half**, and follows `§4.1`'s
treatment of `C8` exactly, as `SE1` did at spec 1.4.10 and `SE4` at spec 1.4.11: a
declared signal that separates nothing is kept and reported doing nothing rather
than deleted. **Nothing is renormalised** — `AL3` freezes the `SE1`–`SE5` weights
at `3500 / 2000 / 1500 / 1000 / 2000`, summing to 10,000, and this amendment moves
none of them. **No ledger-entry probe is added**, which would open an enum `§6.2`
calls closed and route a merchant-controlled surface (`THREAT_MODEL.md §T1`) into
the evidence path. **No pairing rule and no aggregation rule is invented.**

**The narrower formulation is deliberate.** `SE2` is *expected-non-binding on
v1.0.0 data*, the `SE4` wording — **not** `SE1`'s *permanently inactive*. `SE1`'s
status follows from `§11.1`'s empty `bank_line` candidate set, a structural fact
about the candidate language itself. `SE2`'s follows from the **absence** of a
pairing clause, which a future amendment could supply without changing any
constraint. The weaker claim is the one the frozen text supports.

**`DISCRIMINATED` remains reachable, and the arithmetic is worth stating.**
Pre-probe, `SE3` alone gives `Δs ≤ 469 bps < ε` (spec 1.4.13, unchanged).
Post-probe, `SE5`'s full 2000 bps exceeds `ε = 1500` on its own, so a
`fetch_settlement_recon` result can still discriminate. What this amendment
removes is a signal that was never able to contribute, not the system's ability to
resolve a material ambiguity.

**The current disposition of the five signals**, none of whose weights move:

```
  SE1  3500  INACTIVE                          spec 1.4.10
  SE2  2000  EXPECTED-NON-BINDING on v1.0.0    spec 1.4.20
  SE3  1500  LIVE / DEFINED                    spec 1.4.13
  SE4  1000  EXPECTED-NON-BINDING on v1.0.0    spec 1.4.11
  SE5  2000  LIVE / DEFINED                    spec 1.4.16 / 1.4.17
```

**What is NOT settled.** Any future pairing or aggregation rule for `order_ref` ↔
`receipt`, and any fetch route not already in `§6.2`'s closed five-probe enum.

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

**Exact-score ties, ratified at spec 1.4.21 `[ASSAY-MODEL]`, register row M35.**
Step 1 says *"the best is the one with the highest `evidence_score_bps`"* and
**does not say which is best when two are equal**. That gap is outcome-bearing and
is closed here.

**Ties are reachable, and pre-probe they are ordinary — derived.** With `SE1`
inactive (spec 1.4.10), `SE2` expected-non-binding (spec 1.4.20), `SE4`
expected-non-binding (spec 1.4.11) and `SE5` zero before any probe,
`evidence_score_bps` **is `SE3` alone**, and `SE3` reads member lag only. Members
sharing a capture day and cycle carry identical `lag_days`, so candidates with the
same lag multiset score identically: four such members of equal credit against a
target admitting any two of them yield **six feasible allocations at the same
score**. `PREREGISTRATION.md §4.2`'s `F06` sharpens this deliberately — *"identical
amount, drawn ONCE and used for both; identical method; same simulated day"*.

**An ordering is required — derived.** `Δs = 0 < ε`, so a tie never reaches
`DISCRIMINATED`; it reaches `AMBIGUOUS` or, below `τ`, `IMMATERIALLY_AMBIGUOUS`,
whose rule is *"accept best"*. Which allocation is accepted sets
`Decision.chosen_candidate_id` and the `source_entity_id`s gate `G3` partitions by,
and `solution_a`/`solution_b` enter the hashed event body (`DATA_MODEL.md §13`,
`§16`). Metric 23 requires identical root hashes across two runs and `§16` forbids
any result depending on *"iteration order over an unordered collection"*, so
**enumeration order cannot be the tie-break** — also derived.

**The key is ratified, not derived.** `§16` demands determinism; it names no
ordering, and nothing else in this specification ranks equal-scored allocations.

```
  allocation identity   the set of (target_id, member_obs_id) pairs the
                        solution asserts; a target with an empty allocation
                        contributes the single pair (target_id, "")

  canonical key         those pairs sorted by (target_id, member_obs_id),
                        each serialised  target_id | member_obs_id,
                        joined by  ;

  rule                  highest evidence_score_bps wins. On EXACT equality the
                        lexicographically smallest canonical key wins, and the
                        same order fixes solution_a before solution_b.
```

**`member_obs_ids` alone would not do**, and the target is in the key for that
reason: a component may hold several targets (`§5`), two targets of equal amount
admit the identical member set, and `§5` defers `C7`'s coupling to *"a single
serialized pass after all components are solved"* — so both are feasible at solve
time and their member sets collide. The key adds **no new quantity**: `target_id`
and `member_obs_ids` are `DATA_MODEL.md §11` fields, and ids match
`^prefix_[A-Za-z0-9]{14}$`, so neither separator can occur inside one and the
encoding is injective.

**The ranking criterion is unchanged.** This applies **only** after exact
equality; it never enters `evidence_score_bps`, never reorders unequal scores, and
touches no weight. `ε = 1500`, `τ = max(₹100, 10 bps of component value)`, the
`SE1`–`SE5` weights at 3500 / 2000 / 1500 / 1000 / 2000, and `C1`–`C8` are all
untouched.

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

**That comparison is NON-DISCRIMINATING on the conforming v1.0.0 population,
disclosed at spec 1.4.26 `[ASSAY-MODEL]`, register row M41.** The sentence above
stands unedited and its metric is still reported; what is withdrawn is the
**affirmative reading** — that `R3` can be shown to *beat* the static list. Five
frozen facts compose, and none is amended:

```
  DATA_MODEL.md §11.1   a bank_line target has the EMPTY candidate set, so only
                        a SETTLEMENT target ever reaches this loop
  DATA_MODEL.md §11.1   a settlement target carries exactly ONE settlement_id
  §4.2  SE5             target-scoped -- a report whose settlement_id is not the
                        target's contributes nothing
  §6.2  M36             fetch_settlement_recon is the ONLY probe with a source
  EVALUATION_SPEC §4.5  net_cost_inr carries NO probe term, and neither does any
                        other metric on PREREGISTRATION.md §8's list of 28
```

So every `AMBIGUOUS` component offers **one** probe, **one** reachable argument, at
**zero** cost, and `§4.2`'s multi-probe rule (spec 1.4.17) makes repetition
idempotent. `PREREGISTRATION.md §7`'s frozen policy takes that action every time and
it is **weakly dominant**: a proposer can match it, decline and forgo the only
evidence above `ε`, or spend budget that buys nothing. **A maximisation over a
one-element choice set cannot be beaten.**

**Disclosed, not repaired, and nothing here is tuned.** This is `§4.1`'s standing
`C8` treatment — retain the declared thing, report that it separates nothing —
already applied to `SE1` (1.4.10), `SE4` (1.4.11) and `SE2` (1.4.20). The
`A3-NOLLM` policy **stays exactly as `PREREGISTRATION.md §7` freezes it and must not
be widened or tuned**: revising a control-arm parameter after observing that it is
optimal is the result-driven change `DECISION_BRIEF.md §L.4` forbids. **Adding the
three missing probe sources would not repair it** — `fetch_payment` and
`fetch_refund` are redundant against the observation set, and `fetch_order` sits
behind the inert `SE2` consumer. **No probe source is added and the enum stays
closed at five.** The **software is valid and unchanged**; a claim is withdrawn, not
a capability. `abstentions resolved per probe spent` remains **`EXPLORATORY`**
(`EVALUATION_SPEC.md §4.13`) and is not added to the 28.

**Population-specific.** A future family or amendment producing a component with
several independently probeable `settlement_id`s would restore a real choice; **no
such policy is decided here.**

**The static priority list is stated, and frozen, at spec 1.4.25 `[ASSAY-MODEL]`,
register row M39.** The sentence above has made that list the **comparand** of this
metric since spec 1.0.0 while **no document stated it**. It is now a pre-registered
parameter in `PREREGISTRATION.md §7`, bound by `AL3` and `DECISION_BRIEF.md §L.1`
rule 12, so `§L.4`'s bar on result-driven change reaches it. Reproduced here
verbatim; `§7` is the normative home and the two must remain identical:

```
  A3-NOLLM probe priority policy (RATIFIED at spec 1.4.25, register row M39;
  ARCHITECTURE.md §6.5's "static probe priority list"; the comparand of
  RECONCILIATION_SPEC.md §6.2's "abstentions resolved per probe spent"):

      priority order      1. fetch_settlement_recon
                          2. fetch_payment
                          3. fetch_order
                          4. fetch_refund
                          widen_temporal_window is NOT proposable (M40)

      eligible argument   an argument of the exact type that probe requires,
                          present in the call's available-probe context, that
                          passes the already-frozen deterministic validity and
                          pre-call I6 checks (DECISION_BRIEF.md §L.1 rule 8)

      argument selection  the LEXICOGRAPHICALLY SMALLEST eligible argument for
                          that probe kind. Never enumeration order, never
                          wall-clock order, never derived from model output.

      stop rule           the first probe in priority order for which a
                          constructible, valid argument exists; if none exists,
                          NO_USEFUL_PROBE.
```

**This is a RATIFICATION and the record says so.** No frozen clause determines an
ordering. It is fixed **now** — with `R3` unbuilt in both arms, no dataset generated
and no H1 or dev figure in existence — because `A3`'s probe spend decides its own
figures for metrics **1, 2, 3, 4, 6, 8** and **9**, so a policy chosen after a result
was seen would move the comparand of the claim `DECISION_BRIEF.md §H` tier H1 exists
to make. `fetch_settlement_recon` leads because `SE5`'s 2000 bps is the only route
above `ε = 1500` (`PREREGISTRATION.md §10` V20) while `SE2` and `SE4` are declared
expected-non-binding; the rest follow this section's own declaration order; and
lexicographic argument selection is total and order-independent, which enumeration
order and wall-clock order are not — `§16` and metric 23 forbid enumeration order
from supplying an outcome, as `M35` already found for tie-breaks. **The policy is
additionally unadjustable on TRAIN and DEV**, unlike the `SE1`–`SE5` weights, because
it parameterises the control rather than the system under test.

**`fetch_settlement_recon`'s source, ratified at spec 1.4.22 `[ASSAY-MODEL]`,
register row M36.** The probe queries the **committed PG-side recon report** —
`bench/<split>/recon_report.jsonl`, one row per `ReconLine` the simulation
produced, carrying `settlement_id`, `entity_id` and `settled_at` and **nothing
else**. It does **not** query the observation set.

**Row order, ratified at spec 1.4.24 `[ASSAY-MODEL]`, register row M38.** Rows are
ordered by **`entity_id` ascending**, so that a regeneration at the same seed is
byte-identical as `PREREGISTRATION.md §7` requires of every generator artifact.
`entity_id` is total over the report and never null, so the order is a total order
and **no null-ordering rule is introduced**. Ordering by `settled_at` or
`settlement_id` would need one, both being nullable here; and `DATA_MODEL.md §0`'s
canonical traversal is scoped to `true_journal` and keys on `seq` and `account`,
which this artifact does not carry. The order is a **serialization property and
carries no meaning**: `§6.2`'s query selects on `settlement_id` and `SE5` is a set
measure, so no rule reads a row's position.

**Unsettled rows are included, derived at spec 1.4.24, register row M38.** A row
whose `settlement_id` and `settled_at` are both `null` is emitted like any other.
`PREREGISTRATION.md §4.2` states that a member its batch cannot carry *"is emitted
UNSETTLED"* with `settlement_id: null`, and `DATA_MODEL.md §6` fixes `settled_at`
as *"`null` exactly when no settlement carried the line"* — so such a line **is** a
`ReconLine` the simulation produced, and the membership rule above admits it. That
`settlement_id` is *"its only query key"* makes the row **unreachable**, which is
not the same as excluded: this section states membership and reachability as two
independent facts and neither qualifies the other. The report already holds a row
the observations do not (`F05`); it may equally hold one no query returns.
**Uncaptured payments are a different case and remain absent**: they produce no
`ReconLine` at all, so there is no row to include or omit.

**The offline seal may read the artifact, derived at spec 1.4.24, register row
M38.** `PREREGISTRATION.md §9` step 4 requires `recon_report_sha256` and step 5
makes its absence a **SEAL FAILURE**, which is satisfiable only if the seal can
open the file. `AL8`'s binding prohibition names **engine and oracle code**, and
the seal is neither — the identical scope in `AL2` already lets the seal hash
`ground_truth.jsonl` inside `ARCHITECTURE.md §10`'s *"generator's trust zone,
offline, before any agent exists"*. `AL8`'s *"reachable **only** through the probe
executor, under `P_max`"* governs the **evidence path an agent may use**, as
`EVALUATION_SPEC.md §2` uses the same phrase to define *"an agent's inputs"* and as
`ARCHITECTURE.md §4` boundary 1 already uses it of quarantined text that the
generator nonetheless writes to a file. **Hashing is not reachability**: the seal
spends no `P_max`, runs before any agent exists, and a SHA-256 digest carries no
`constituent_entity_id` into any decision. The permission is **seal-scoped and
distinct from the probe's** — it does not extend to `GENERATOR_TRUST`, so the
`§5.3` completeness gate can never reach the artifact and `§10` V22's asymmetry is
preserved structurally.

*Derived, not chosen.* `DATA_MODEL.md §12` has stated since spec 1.4.14 that this
probe reads the PG's own date-scoped recon report *"rather than the observation
set"*, and derived the identifier relation's **partiality** from exactly that:
`PREREGISTRATION.md §4.2`'s `F05` withholds one constituent `recon_line`
**observation** at emission, so the report may return an `entity_id` for which no
observation exists. No observation-backed source can satisfy that derivation,
because the withheld row is absent from `observations.jsonl` by construction.
What was missing was never the source *class* — it was a file able to hold a row
the observations do not. `DATA_MODEL.md §12`'s spec-1.4.16 treatment of such an
id — **excluded from `R*` entirely, neither numerator nor denominator** — is
unchanged and is now reachable rather than hypothetical.

*`settlement_id` is the only query key, and no fallback is added.* A line whose
`settlement_id` was nulled by `§4.3`'s `DROP_SETTLEMENT_ID` still carries it in
the report, because that operator models *"**Merchant-side** recon copies that
lack the PG's batch identifier"* (`§4.3`) and `F08` states the loss as *"absent
from **the merchant's copy**"* (`§4.1`). The key therefore never fails on a
conforming dataset. **`settlement_utr` is not a probe comparand**, and
`DECISION_BRIEF.md §A.17`'s finding that it *"is read by no normative rule
anywhere"* (spec 1.4.10, register row M24) **stands unchanged**.

*The oracle does not receive this evidence, and must not.* `PREREGISTRATION.md
§6.2` `AL8` bars `packages/engine` and `packages/oracle` from the artifact;
`§5.3`'s completeness gate is scoped to expressible targets **because** `F05`
withholds a line, and an oracle holding the report would void that scoping and
make the gate tautological. The asymmetry is intentional and is recorded at
`PREREGISTRATION.md §5.1`, `§10` V22 and `EVALUATION_SPEC.md §4.3`.

**The probe loop's owner, ratified at spec 1.4.23 `[ASSAY-MODEL]`, register row
M37.** `packages/probe` owns the loop this section describes, as a **pure state
machine**. It performs **no I/O of any kind** and does not call `R3`: it consumes
an `R3` proposal as a value, and it emits a validated probe call and a `PROBE`
event body that its caller dispatches and appends.

```
  packages/probe owns          P_max accounting per component
                               pre-call I6 over every probe argument
                               construction of the closed five-probe call --
                                 it is the ONLY constructor of one
                               assembly of the PROBE LedgerEvent body

  packages/probe does NOT own  R3's selection policy      (A3-NOLLM's frozen at
                                                          PREREGISTRATION.md §7,
                                                          spec 1.4.25 / M39; the
                                                          model arm's is R3's own
                                                          output, not a constant)
                               the model call             packages/llm
                               the data-surface read      apps/cli
                               result schema validation   packages/domain
                               the re-solve                packages/engine S4
                               the ledger append           packages/ledger
```

*Why a separate owner, and why not an existing one.* `§3` gives `packages/engine`
*"no I/O, no network"* and `DECISION_BRIEF.md §L.2` builds it **before** `llm`, so
the engine cannot drive this. `packages/llm`'s `§3` row is the provider interface,
the four roles, the cache and output verification — a loop is none of them, and
placing `P_max` and the pre-call `I6` check inside the package that calls the model
would put a control and the party it constrains inside one boundary, against `§4`
boundary 2. `packages/eval` is scoped to measurement, and hosting the run loop there
would put the system under test inside the thing measuring it. `apps/cli` performs
the read but is absent from `§L.2`'s build order, so a loop there could not be
imported by `packages/eval`'s agent runner and would have to be **forked** — against
`ARCHITECTURE.md §10`'s *"ablations are configuration flags rather than forked
codebases, which is what makes them valid controls."*

*The seam `§6` already defines is preserved and not replaced.* Where the loop stops
without discriminating, the certificate reason is whatever
`packages/engine`'s `certificateReason(attempts)` returns — `EVIDENCE_TIE` at zero
attempts, `PROBE_BUDGET_EXHAUSTED` at `P_max`, and the **undecided**
`A2_MIDDLE_CASE_UNSPECIFIED` seam in between. **No new terminal reason is invented
for a loop that stopped on `NO_USEFUL_PROBE` with budget remaining**; that gap is
`§6`'s and remains open.

**Closed at spec 1.4.25 `[ASSAY-MODEL]`, register row M40.** The sentence above is
**superseded, and its reasoning is honoured rather than overturned**: spec 1.4.23
declined to invent a reason because nothing could reach the state — no proposer
existed, so `attempts` was always `0` and the middle interval was empty. This
amendment is the one that makes it reachable, in **both** arms: `ARCHITECTURE.md §6`
gives `R3` the output *"one call … or `NO_USEFUL_PROBE`"*, so a model may decline
after spending one or two probes, and `PREREGISTRATION.md §7`'s frozen `A3-NOLLM`
policy returns the same token when no priority entry has a constructible argument.
`DATA_MODEL.md §13` therefore supplies the **fourth and final**
`AmbiguityCertificate.reason`:

```
  attempts == 0                    EVIDENCE_TIE
  attempts == P_max                PROBE_BUDGET_EXHAUSTED
  0 < attempts < P_max, and the    NO_USEFUL_PROBE_AVAILABLE
    loop terminated because no
    usable probe remained
  component exceeded K_max         SEARCH_BOUND_EXCEEDED   (unchanged; §4.3)
```

The mapping is **total** over `attempts`, so `A2_MIDDLE_CASE_UNSPECIFIED` is retired
rather than defaulted. **No fourth unrelated terminal reason is added**, no existing
reason changes meaning or referent, the certificate is still emitted **iff** the
decision is `ABSTAINED`, and `DATA_MODEL.md §16`'s hashed `body` projection and
genesis are untouched — `reason` already entered the hashed body through
`certificate`.

**A rejected proposal terminates the loop — an implementation convention, and
labelled as one (`N1`, spec 1.4.25).** Where `packages/probe` rejects a
**well-formed** proposal before budget is spent — pre-call `I6`, or an argument
range — the loop terminates for that component, the proposal is not re-issued,
`attempts` is unchanged, and the terminal reason follows from the resulting state
under the mapping above. The alternative is not neutral: an unchanged loop state
yields an unchanged `input_hash`, hence an unchanged `cache_key`, hence the identical
rejected proposal returned forever under `--llm=replay` and `--llm=offline` alike.
**This is a convention, not a frozen constant, a metric or a constraint** — it adds
nothing to `PREREGISTRATION.md §7` or `AL3` and writes no value anywhere. It is
recorded at `ARCHITECTURE.md §12` beside the other failure dispositions.

*Unchanged by this ratification.* The closed five-probe enum; `P_max = 3`;
`SE5`'s scope (1.4.15), score (1.4.16) and union aggregation (1.4.17); `SE1`–`SE5`
weights; `C1`–`C8` and `constraint_set_hash`; every `§7` threshold; and the field
a query is date-scoped on, which `DATA_MODEL.md §22.2` M31 leaves undecided and
which is **not** settled here.

**`widen_temporal_window` is expected-non-binding on v1.0.0 data, recorded at spec
1.4.19 `[ASSAY-MODEL]`, register row M33.** `THREAT_MODEL.md §T7` states that this
probe *"has a hard bound"*. **No document states the number**, `PREREGISTRATION.md
§7`'s frozen block carries none, `§6.2` AL3's enumeration omits it, and **none is
supplied here** — the figure remains **unspecified**, as `DATA_MODEL.md §12` and
`PREREGISTRATION.md §4.2` already disclosed at spec 1.4.12.

**What is derived instead is that no relaxation is needed at all.** Three frozen
facts fix the true lag range on any conforming dataset. `PREREGISTRATION.md §4.2`
admits only `T+1`, `T+2` and `T+3`; the spec-1.4.7 clock grid puts
`lag_days ∈ (n, n + 0.875]`; and `§4.3`'s `SHIFT_TIMESTAMP(±d)` — the only operator
that could move a lag — is **declared not exercised** (*"No family declares it; the
clock skew it models is already structural"*). Hence:

```
  C4 admits        [T_min, T_max] = [1, 7] days
  true lag range   (1, 3.875]     days      T+1..T+3 under the 1.4.7 grid

    lower   min lag > 1 >= T_min      C4's lower bound never binds
    upper   max lag = 3.875 <= 7      headroom 3.125 days
```

**`C4` therefore excludes no member of any true allocation, and the widening
required for completeness is zero days.** That figure is a *derived quantity — what
is needed —* and **not a ceiling imposed on the probe**: `days` keeps the
`integer > 0` type spec 1.4.12 gave it, with no upper bound in the schema. It
follows that any `days > 0` **strictly enlarges** the admissible candidate set with
allocations the true one does not require, which is why the probe is expected to
separate nothing on this population.

**This is the `C8` treatment, and it is a disclosure rather than a prohibition.**
`§4.1` keeps a declared-but-inert clause and reports that it does nothing rather
than deleting it; spec 1.4.10 did the same for `SE1` and spec 1.4.11 for `SE4`. The
probe **stays in the closed enum of five** — `THREAT_MODEL.md §T7`'s SSRF and spend
controls depend on that enum being shut, and `DATA_MODEL.md §12`'s
`ProbeResultDetail` has five variants for the same reason. **Expected-non-binding
does not mean prohibited: nothing here forbids `R3` from proposing this probe, and
whether it may is NOT settled.** `P_max = 3`, `C4`, `T_min`, `T_max` and every `§7`
threshold are unchanged.

**What remains open.** The numeric hard bound `§T7` promises. Whether `R3` may
propose the probe. And the engine's treatment of a proposed-but-unnecessary widen,
beyond what `§6.2` already fixes — the probe is logged, it consumes one of `P_max`,
and spec 1.4.15 already bars its result from feeding `SE5`.

**One of those three is closed at spec 1.4.25 `[ASSAY-MODEL]`, register row M40:
`R3` may NOT propose `widen_temporal_window`.** `DECISION_BRIEF.md §L.1` rule 2
forbids a numeric field in any LLM output schema, is listed among *"invariants that
may never be violated"*, and is **unchanged and unweakened by this amendment**. Since
`R3`'s authority over this probe was expressly unsettled — by the paragraph above, by
`THREAT_MODEL.md §T7` and by register row M33 — a **settled** invariant governs an
**unsettled** question, and the question resolves in the only direction that
preserves the invariant. `R3`'s output is therefore the four id-argument probes plus
`NO_USEFUL_PROBE`, every field string-typed.

**Recorded as a ratification, not smuggled in as a derivation.** Two alternatives
were tested against frozen text and both fail. A **string numeral** meets rule 2's
letter and defeats `ARCHITECTURE.md §4` boundary 2's stated mechanism — *"the model
returns an **identifier** and deterministic code **looks up** the value"* — a parsed
numeral being neither an identifier nor looked up in anything. A **symbolic token
with a deterministic mapping** is boundary 2's own mechanism and fails on the table
rather than the shape: its values exist in no document, this section and
`DATA_MODEL.md §12` and `§T7` have each declined to supply one, and the single figure
frozen text does derive — M33's *"the widening required for completeness is **zero
days**"* — is excluded by `§12`'s own `integer > 0`. Amending rule 2 was not viable:
it would weaken a trust boundary to admit a probe this section already reports as
expected-non-binding and whose result spec 1.4.15 bars from feeding `SE5`.

**Nothing else about this probe moves.** It **stays in the closed enum of five** —
`§T7`'s SSRF and spend controls and `DATA_MODEL.md §12`'s five-variant
`ProbeResultDetail` are unchanged, because the executor's enum and the actions **one
proposer** may name are different sets. `days` keeps `integer > 0` with no ceiling,
**no constant is invented**, `PREREGISTRATION.md §7` gains no `days` bound, and
`§T7`'s numeric hard bound **remains unspecified** — this ratification makes it
unreachable through `R3` rather than supplying it. **Still open:** that bound, and
the engine's treatment of a proposed-but-unnecessary widen arriving from any future
non-`R3` caller.

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
               → opens a Suspense item under DATA_MODEL.md §17.1.1,
                 carries a certificate

  EXCEPTION    an ingest invariant failed, an S5 invariant failed, no
               admissible candidate exists at all, or no observable evidence
               determines the observation's accounting treatment
               (DATA_MODEL.md §17.2 — every adjustment observation reaches
               this state, because `Adjustment.reason` is not observable)
               → carries a class + owner; opens a Suspense item where
                 DATA_MODEL.md §17.1.1 gives its class a posting

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

**Not every exception posts, and spec 1.4.0 says so plainly.** Through spec 1.3.0
this section read *"posts to `9000_SUSPENSE_UNRECONCILED`"* for every
`EXCEPTION`, while `DATA_MODEL.md §17.1`/`§17.2` enumerated a posting for only
three of the fourteen classes. The trigger table at `DATA_MODEL.md §17.1.1`
closes that gap in the direction the evidence supports: seven classes open a
Suspense item and seven do not, because a record that failed ingest validation,
duplicates another record, is a deferral this specification refuses to call an
error, or would require an untrusted source to move a control account, cannot be
posted without asserting a rupee movement nothing establishes. A class with no
posting still carries an owner and an analyst question, still appears in the
value-ranked queue and in `exceptions_by_class`, and is still priced once at
`C_exception`. It cannot be dropped: gate `G1` requires exactly one terminal
state per observation and there is no drop path.

The fourth `EXCEPTION` trigger is new in spec 1.2.0, and was restated in spec
1.3.0 as an evidence condition, so that the posting fallback in
`DATA_MODEL.md §17.2` has a terminal state to land in. It is deliberately an
exception rather than a reconciliation: an item whose accounting treatment the
observable evidence does not determine has **not** been reconciled, and must not
be reported as though it had been.

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
| **G3** | Suspense identity, gross per-item, **exactly, to the paisa**. An open Suspense item *i* is the set of `9000_SUSPENSE` journal lines sharing one `JournalLine.source_entity_id` (`DATA_MODEL.md §16`), where `item_net_paise(i) = Σ dr(i, 9000_SUSPENSE) − Σ cr(i, 9000_SUSPENSE) ≠ 0`. Then `Σᵢ |item_net_paise(i)| === unresolved_value_paise`, the latter summed over the same items from the `Decision` / `Exception` records | An exception was suppressed, double-posted, or offset against another — an ASSAY defect |
| **G4** | Hash chain recomputes from genesis and matches the stored root hash | The audit trail was altered |
| **G5** | No allocation with a non-empty `invariants_failed` was posted | The validation gate was bypassed |

**What identifies an item, added at spec 1.4.0.** Through spec 1.3.0 this gate
quantified over *"each open Suspense item `i`"* and **named no field that
partitioned journal lines into items**. `true_journal` had `source_entity_id` as
*"the JOIN KEY"* (`DATA_MODEL.md §1`) and the agent side had no counterpart, so
at least four mutually inconsistent readings were available — `decision_id`,
which is per *component* and collapses several items into one; `Exception.exc_id`,
which never appears on a `LedgerEvent` at all; `subject_ids[0]`; and one item per
posting event, keyed on an `evt_id` that §16 excludes from the hashed body. Each
gives a different partition and therefore a different value of frozen metric 13.
`JournalLine.source_entity_id` is the counterpart, and *open* is arithmetic
rather than a status flag: a `P7` resolution reverses under the same key, so a
resolved item nets to zero and drops out of the gross sum on its own.

**The two sides are drawn from two stores, which is the point.**
`Σᵢ |item_net_paise(i)|` is computed from the **journal lines** — the books.
`unresolved_value_paise` is computed from the **`Decision` and `Exception`
records** — the queue — at `value(observation)` per `DATA_MODEL.md §14.1`. They
span one universe and are maintained independently, so a suppression on either
side breaks the identity. An exception whose class opens no Suspense item
(`DATA_MODEL.md §17.1.1`) is in neither sum; it cannot be suppressed either,
because `G1` still requires it to hold a terminal state.

**Why the universe was amended, and what it cost.** Through benchmark v1.0.2 the
right-hand side was summed over every reconcilable observation in a non-resolved
state — several *views* of one economic break, as §10.3 records. **No set of
postings satisfies an exact identity against that sum.** The worked example in
§11 posts ₹1,00,000 for a break whose multi-view total is ₹3,00,000; posting each
view separately would relieve `1100_GATEWAY_RECEIVABLE` twice for one break. The
gate was therefore unsatisfiable, which ends every run `BLOCKED` and violates
metric 14 by construction. §11 was written against the amended semantics already
— it computes `item_net_paise` for the settlement alone — so this amendment makes
the definitions agree with the worked example rather than the reverse. It
**lowers `unresolved_value_paise` and makes `CLOSED` easier to reach**; the
superseded quantity is retained and reported every run as
`unresolved_value_paise_multiview` (`DATA_MODEL.md §20`), and the disclosure is
in `PREREGISTRATION.md §8` and `DECISION_BRIEF.md §A.7`.

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

**What `G5` asserts, and what it does not — clarified at spec 1.4.31, register row
`DATA_MODEL.md §22.2` M50. The gate is unchanged and stays active for every agent.**
`G5` asserts that **no allocation carrying a recorded invariant failure was
posted**. It is a runtime scan over `Decision.invariants_failed`, which is what makes
*"the validation gate was bypassed"* checkable by a third party reading a stored
artifact rather than by trusting the stage that minted it. It does **not** assert
that any invariant was **evaluated**; `Decision.invariants_checked` (`DATA_MODEL.md
§13`) records that, and the two fields are read together. This is precisely what lets
`EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` ablation exist without weakening
anything: `A1` records `invariants_checked: []` and `invariants_failed: []`, so `G5`
passes over a set holding no failure **because none was evaluated**, and the artifact
says exactly that rather than concealing it. The competing reading — that `A1`
evaluates the invariants and posts the failures anyway — is **foreclosed here**:
`G5` refuses such an allocation at close and the single write path refuses it before
that, and expressing it by recording an empty `invariants_failed` while failures were
found is `THREAT_MODEL.md §T8`'s suppression, not an ablation. **`§7`'s failure
semantics are unchanged for every invariant that is evaluated**: *"any invariant
failure rejects the allocation. It is never partially posted, never repaired, never
downgraded to a warning."* And `G2` is unaffected either way — `I1` is re-checked on
the cumulative totals at every append, independently of what `S5` evaluated, which is
why a broken trial balance is unreachable through this write path and why
`EVALUATION_SPEC.md §3.2` withdrew that expectation for `A1` (`DECISION_BRIEF.md
§A.38`).

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
same universe.** `unresolved_value_paise` is summed over **open Suspense items**
(`§10.1`, `DATA_MODEL.md §20`), whose keys range over settlements, bank lines,
payment recon lines and adjustments. `batch_value_paise` is summed over
**`recon_line` observations only** (`EVALUATION_SPEC.md §4.1`). The comparison is
therefore **not a like-for-like fraction of one universe**, and the sentence above
should be read accordingly: the threshold is a fixed proportion of *recon-line*
value, measured against unresolved value drawn from a different set.

**Restated at benchmark v1.0.3, and the direction of the residual reverses.**
Through v1.0.2 this paragraph described the numerator as summed over *"all
reconcilable observation kinds"*, so that *"a single economic break can leave
several of its views unresolved and each contributes to the numerator while only
the recon line contributes to the denominator"* — making effective strictness
**tighter** than the stated 0.5% and variable by exception class. That universe
made gate `G3` unsatisfiable (`§10.1`, `§11`) and is amended. Under the item
universe each break contributes **once**, so the multi-view inflation is gone and
**effective strictness is no longer tighter than 0.5% on that account** — the
gate is easier to pass than it was under the v1.0.2 text.

**A second, separate easing applies to the same numerator**, and it is not the
view collapse: `DATA_MODEL.md §17.1.1` gives seven of the fourteen exception
classes no Suspense item, so ledger-side, duplicate, ingest-failure,
orphan-refund and timing value leaves `unresolved_value_paise` altogether. A
third effect pushes the other way — the remaining seven classes open items no
implementation was opening before. All three are enumerated, with their
consequences for the close gate, in `PREREGISTRATION.md §8`; no net direction is
claimed there or here.

A residual remains and is smaller: an unresolved bank-side item is denominated in
a *net-of-fee* bank credit while the denominator is gross recon-line value, and an
unresolved settlement aggregates lines that each also appear in the denominator.
The numerator and denominator are still not one universe. The direction is no
longer uniformly conservative, which is a change from the v1.0.2 declaration and
is disclosed as such. `PREREGISTRATION.md §10` V10 records it as a threat to
validity, and `unresolved_value_paise_multiview` is reported on every run so the
v1.0.2 figure remains visible alongside the amended one.

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
  `1100_GATEWAY_RECEIVABLE`, and the delta exceeds τ. **The figure this line
  carried — ₹1,00,000 — was illustrative and is withdrawn at spec 1.4.21 as
  NON-REPRODUCIBLE from §6's normative formula, which stays unchanged.** `§6`
  computes `max over AccountCode of |balance_best(acct) − balance_second(acct)|`;
  this example is an `F08` case with no `AN2` match, so `P2`/`P4` do not fire
  (`DATA_MODEL.md §17.1.1` conditions both on *"`AN2` satisfied against an actual
  `bank_line`"*), and the unallocated remainder takes `E02`→`P6` for the same
  ₹1,00,000 under either allocation — so the per-`AccountCode` delta is not the
  figure stated. Reproducing a specific number needs the per-line `fee` values
  this example does not give: `C6` pins `Σ credit − Σ debit`, **not** `Σ amount`
  or `Σ fee`, and `P2` posts on `amount`, `fee − tax` and `tax`, so competing
  allocations move the control accounts by genuinely different totals whenever
  their fee composition differs. **The verdict below is unchanged** — the example
  still abstains, and `AMBIGUOUS` remains reachable.
- Δs = 400 bps < ε = 1500 bps.
- Probes: `fetch_order` on all five returns receipts that match neither set
  distinctively. `PROBE_BUDGET_EXHAUSTED`.
- **Verdict: `ABSTAINED`.** Certificate records `{A,B,C}` vs `{D,E}`, shared
  hard constraints `[C1,C2,C3,C4,C5,C7,C8]`, Δs = 400 bps, materiality
  ₹1,00,000, τ, ε, and the three probes attempted.
- Ledger (posting P6, `DATA_MODEL.md §17.1` — the unexplained item is the
  outbound settlement, so Suspense takes the debit and the receivable is
  relieved): `DR 9000_SUSPENSE_UNRECONCILED ₹1,00,000 / CR 1100_GATEWAY_RECEIVABLE
  ₹1,00,000`, with `source_entity_id = setl_A` on both legs.
  `item_net_paise(setl_A)` is `+10,000,000`, and it enters gate G3 as
  `|+10,000,000|`.
- Terminal states: **six** observations, one state each (`G1`). The settlement is
  `ABSTAINED` and carries the item; the five recon lines are `ABSTAINED` and are
  **attached to that item**, posting no Suspense leg of their own — `§17.1.1`
  gives an abstained payment line `P6` only when it is itself the allocation
  target, and here the target is `setl_A`.

**Gate G3 on this example, computed both ways.**

```
  books   Σᵢ |item_net_paise(i)|   over one item, key setl_A   = 10,000,000
  queue   unresolved_value_paise = value(setl_A) = Settlement.amount
                                                                = 10,000,000
                                                       G3 holds, exactly ✓

  EXPLORATORY, reported alongside (DATA_MODEL.md §20):
  unresolved_value_paise_multiview = 10,000,000                  (the settlement)
                                   +  4,000,000 + 3,500,000 + 2,500,000
                                   +  6,000,000 + 4,000,000     (the five lines)
                                   = 30,000,000
```

Under the benchmark v1.0.2 universe the right-hand side was the ₹3,00,000
multi-view figure while the books posted ₹1,00,000, so **G3 failed by ₹2,00,000
on this very example**, the period ended `BLOCKED`, and metric 14's requirement
that `BLOCKED` be zero on every run was unsatisfiable by construction. Posting
each view separately does not rescue it: the five lines' `P1` postings already
recognised ₹2,00,000 in `1100_GATEWAY_RECEIVABLE`, and relieving both the lines
and their settlement would credit that account twice for one break. This is the
worked example that forced the v1.0.3 amendment, and the bullet above is
unchanged from spec 1.2.0 — the definitions were amended to agree with it, not
the reverse.

**The books, in full, so the trial balance is checkable.** Five `P1` captures
(`DR 1100 ₹2,00,000 / CR 4000 ₹2,00,000`) and one `P6` (`DR 9000 ₹1,00,000 /
CR 1100 ₹1,00,000`): `Σ dr = Σ cr = ₹3,00,000`, so `I1` and gate `G2` hold, and
`1100_GATEWAY_RECEIVABLE` closes at `+₹1,00,000` — the three captures ASSAY could
not place. Truth books the same five captures and settles `{D,E}` under `P2`,
closing `1100` at `+₹1,00,000` as well. The two agree on the account, which is
what `DATA_MODEL.md §17.1`'s sign convention exists to preserve.

Contrast: ablation `A2-NOABSTAIN` — ASSAY with the abstention gate removed —
accepts `{A,B,C}` and reports "matched." When ground truth says the settlement
was `{D,E}`, it has silently misstated ₹1,00,000 across two control accounts and
reported zero exceptions, with a Suspense balance of zero it did not earn. That
delta, measured across a batch and priced in rupees, is the project's core
result — and because `A2` differs from ASSAY in exactly one component, the delta
is attributable to abstention alone.
