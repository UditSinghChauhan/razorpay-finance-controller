# RECONCILIATION_SPEC — ASSAY

**Spec version:** 1.4.13 · **Date:** 2026-08-28

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
| `SE2` | `order_ref` ↔ `receipt` string similarity (Jaro–Winkler). **Post-probe only** — `receipt` is quarantined, so this signal is computable solely from a `fetch_order` probe result (§6.2), as `SE5` is. It scores 0 for every candidate on which no probe has run | 2000 |
| `SE3` | Temporal proximity to the modal settlement lag, restated in dimensionally coherent form at spec 1.4.13. `lag_days = (settled_at − created_at) / 86400`, a **real number, not floored**. `mode_days` = the mode of `floor(lag_days)` over **every `recon_line` observation in the dataset**, **ties to the lowest bin**. A **member's** score is `max(0, 1 − |lag_days − mode_days| / (T_max − T_min))`; a **candidate's** score is the **arithmetic mean** of its members' scores. Both terms are in days, so the ratio is unitless and expressing both in seconds gives an identical value | 1500 |
| `SE4` | Method / card-network agreement with the merchant memo. **Post-probe only** — `memo` is quarantined (`DATA_MODEL.md §0` rule 4, `§8`, `§10`) and `MerchantLedgerEntry` carries no structural method or card-network field, so this signal is computable solely from a `fetch_payment` probe result (§6.2), as `SE2` and `SE5` are. It scores 0 for every candidate on which no probe has run. **`SE4` is additionally declared expected-non-binding on v1.0.0 data at spec 1.4.11**, on the `C8` precedent in `§4.1`: it is retained as a declared signal, its weight is unchanged and unreallocated, and the fact that it separates no candidates is reported rather than assumed. **Its agreement function is therefore left undefined — partial credit between `method` and `card_network`, and the treatment of a `card_network` null on both sides, are unnecessary while the signal is non-discriminating, and are NOT settled here** | 1000 |
| `SE5` | Probe result corroboration | 2000 |

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
the raw difference. **`SE4`'s agreement function and `SE5` in its entirety are not
settled by this amendment**, and the table above says so in the rows themselves
rather than leaving a reader to infer completeness.

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
