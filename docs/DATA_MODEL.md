# DATA_MODEL — ASSAY

**Spec version:** 1.4.31 · **Date:** 2026-09-01

**At spec 1.4.31** this document adds register row **M50** (`§22.2`) and changes
nothing else. The row settles what `EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE`
ablation removes — stage `S5`'s **evaluation** of the allocation-scoped invariants
`I1`–`I8`, never *"evaluate and ignore the failures"* — and withdraws two
expectations that row carried. **No field is added, renamed or retyped**: `§13`'s
`Decision` already declares `invariants_checked: InvariantId[]` and an empty array is
already representable, which is the whole of this row's data-model footprint, and
`§18`'s `BenchmarkManifest` **shape** is unchanged. **No entity, account, posting
rule, trigger, exception class, invariant definition or metric definition changes** —
`§17.1`'s `P1`–`P8`, `§17.1.1`'s trigger table, `§17.2`, `§16`'s hashed body, `§14.1`'s
value table and `§10.1`'s `REFERENCE` classification are untouched, and `§17`'s
*"at every point in the event log, `Σ dr_paise === Σ cr_paise`"* is the clause that
makes one withdrawn expectation unreachable rather than a clause being amended.
`C1`–`C8` are untouched so `constraint_set_hash` does not move; **`BENCHMARK_VERSION`
stays 1.0.8** — no conforming agent's postings change — and `GT_VERSION` stays
**1.1.0**. **No artifact byte changes**, `bench/` being absent. `M42`–`M49` are
preserved verbatim. See `DECISION_BRIEF.md §A.38` and `PREREGISTRATION.md §10`
**V26**.

**At spec 1.4.30** this document adds register row **M49** (`§22.2`) and the
clause it ratifies in `§17.1.1`, and annotates **one comment** in `§18` —
`benchmark_version` now reads `"1.0.8"`. `§17.1.1`'s *"the settlement it is
allocated to"* is fixed as the settlement of the **allocation under evaluation**:
the `Candidate.target_id` for a proposed allocation, the target of the candidate
`S5` validated for an accepted one, and **not** `ReconLine.settlement_id`. **No
field is added, renamed or retyped**, `§18`'s `BenchmarkManifest` **shape** is
unchanged, and **no posting rule, account, trigger, exception class, entity,
invariant or metric definition changes** — `§17.1`'s `P1`–`P8` and `§17.2` are
untouched and the new clause only selects among them. `C1`–`C8` are untouched so
`constraint_set_hash` does not move, and `GT_VERSION` stays **1.1.0**.
**`BENCHMARK_VERSION` moves 1.0.7 → 1.0.8** — the clause changes what a
conforming agent posts — and **no artifact byte changes**, `bench/` being absent.
`M42`–`M48` are preserved verbatim. See `DECISION_BRIEF.md §A.37`.

**At spec 1.4.29** this document adds register rows **M45**–**M48** (`§22.2`) and
annotates **two comments** in `§18` — `benchmark_version`'s citation and
`seal_signature`'s, the latter now naming the `--seal-tag` attestation that writes it.
**No field is added, renamed or retyped** and `§18`'s `BenchmarkManifest` **shape** is
unchanged. **No entity, account, posting rule, exception class, invariant or metric
definition changes**; `C1`–`C8` are untouched so `constraint_set_hash` does not move;
`GT_VERSION` stays **1.1.0**, `BENCHMARK_VERSION` stays **1.0.7** and **no artifact
byte changes**. `M42`, `M43` and `M44` are preserved verbatim. See
`DECISION_BRIEF.md §A.36`.

**At spec 1.4.28** this document adds register row **M44** (`§22.2`) and changes
**one comment** in `§18` — `benchmark_version` now reads `"1.0.7"`. **No field is
added, renamed or retyped** and `§18`'s `BenchmarkManifest` **shape** is unchanged.
**No entity, account, posting rule, exception class, invariant or metric
definition changes**; `§11.1`'s member-eligible set — which the frozen draw's
member pool cites — is **read, not amended**; `C1`–`C8` are untouched so
`constraint_set_hash` does not move; `GT_VERSION` stays **1.1.0** and **no
artifact byte changes**. **Benchmark v1.0.6 → v1.0.7**, a decision parameter
entering `PREREGISTRATION.md §7`. `M42` and `M43` are preserved verbatim. See
`DECISION_BRIEF.md §A.35`, `PREREGISTRATION.md §10` **V25**, with **V24** closed.

**At spec 1.4.27** this document adds register rows **M42** and **M43** (`§22.2`)
and changes **one comment** in `§18` — `benchmark_version` now reads `"1.0.6"`. **No
field is added, renamed or retyped**; `§18`'s `BenchmarkManifest` **shape** is
unchanged and `seeds` stays `number[]`, M42 fixing only the cardinality one manifest
carries. **No entity, account, posting rule, exception class, invariant or metric
definition changes**; `§10`'s `Observation` gains **no** `seed` and **no** `family`
field; `§0` rule 3's identifier characterization is unchanged and is **not** promoted
to a cross-family invariant; `§12`'s five probe variants and `§13`'s four certificate
reasons are unchanged; `C1`–`C8` are untouched so `constraint_set_hash` does not
move; `GT_VERSION` stays **1.1.0**. **Benchmark v1.0.5 → v1.0.6**, the committed
artifact surface changing shape. **M36 and M38 are preserved verbatim and are not
rewritten**: the recon report stays split-scoped, `entity_id`-ascending and
unpartitioned, and M42 records why that is a property of a probe surface rather than
an inconsistency with the dataset artifacts. See `DECISION_BRIEF.md §A.34`,
`PREREGISTRATION.md §10` V24.

**At spec 1.4.26** this document adds register row M41 (`§22.2`) and changes
nothing else. **No field, entity, account, posting rule, exception class, invariant
or metric definition changes**; `§18`'s `BenchmarkManifest` is unchanged, `§13`'s
four certificate reasons are unchanged, `§12`'s five probe variants are unchanged,
`C1`–`C8` are untouched so `constraint_set_hash` does not move, `GT_VERSION` stays
1.1.0 and **benchmark v1.0.5 is unchanged**. See `DECISION_BRIEF.md §A.33`.

**At spec 1.4.25** this document adds **one value** to `§13`'s
`AmbiguityCertificate.reason` — `NO_USEFUL_PROBE_AVAILABLE`, closing the
`A2` middle case — records in `§12` that `R3` may not propose
`widen_temporal_window`, moves `§18`'s `benchmark_version` to `"1.0.5"`, and adds
register rows **M39** and **M40** (`§22.2`). **No field is added, renamed or
retyped; no entity, account, posting rule, exception class, invariant or metric
definition changes**; `§18`'s `BenchmarkManifest` shape is unchanged; `C1`–`C8` are
untouched so `constraint_set_hash` does not move; and `GT_VERSION` stays 1.1.0.
Benchmark v1.0.4 → **v1.0.5**. See `DECISION_BRIEF.md §A.32`.

**At spec 1.4.24** this document adds register row M38 (`§22.2`) and changes
nothing else. **No field, entity, account, posting rule, exception class, invariant
or metric definition changes**; `§18`'s `BenchmarkManifest` is unchanged, `C1`–`C8`
are untouched so `constraint_set_hash` does not move, `GT_VERSION` stays 1.1.0 and
benchmark v1.0.4 is unchanged. See `DECISION_BRIEF.md §A.31`.

**At spec 1.4.23** this document adds register row M37 (`§22.2`) and changes
nothing else. **No field, entity, account, posting rule, exception class, invariant
or metric definition changes**; `C1`–`C8` are untouched so `constraint_set_hash`
does not move; `GT_VERSION` stays 1.1.0 and benchmark v1.0.4 is unchanged. See
`DECISION_BRIEF.md §A.30`.

**At spec 1.4.22** this document names `fetch_settlement_recon`'s source in `§12`,
adds `recon_report_sha256` to `§18`'s `BenchmarkManifest`, records that the recon
report is **not** an `Observation` and adds no `§10` triple, and registers the
decision as M36 (`§22.2`). **No field, entity, account, posting rule, exception
class, invariant or metric definition changes**; `C1`–`C8` are untouched so
`constraint_set_hash` does not move, and `GT_VERSION` stays 1.1.0. Benchmark
v1.0.3 → **v1.0.4**. See `DECISION_BRIEF.md §A.29`.

All schemas are normative. The implementation agent must not add, rename or
retype fields without a spec version bump.

**At spec 1.4.6** this document **defines `Component.member_obs_ids` and
`Component.total_value_paise`** (§11) and registers the pair as `[ASSAY-MODEL]`
M20 (§22.2). The second is the quantity `τ` reads as *"component value"*, and
neither carried a definition through spec 1.4.5. **No field, entity, account,
posting rule, exception class, invariant or metric definition changes**,
`C1`–`C8` are untouched so `constraint_set_hash` does not move, and benchmark
v1.0.3 is unchanged. See `DECISION_BRIEF.md §A.13`.

**At spec 1.4.5** this document is unchanged apart from the version header.
`§14.1`'s `value(bank_line)` and `§17.1.1`'s `E03` → `P5` are two of the five
frozen rules `PREREGISTRATION.md §10` V19 records, and **both are unchanged** —
V19 is a disclosure, not a repair. See `DECISION_BRIEF.md §A.12`.

**At spec 1.4.4** this document gains **§11.1, the candidate universe** — the
member and target contributions `C1`–`C8` read — and register row **M19**
(§22.2). Member eligibility is **derived** from `RECONCILIATION_SPEC.md §4.1`'s
spec-1.4.2 ratification rather than declared, and resolves to `recon_line` and
`adjustment`. **No field, entity, account, posting rule, exception class,
invariant or metric definition changes**, `C1`–`C8` are untouched so
`constraint_set_hash` does not move, and benchmark v1.0.3 is unchanged. See
`DECISION_BRIEF.md §A.11`.

**At spec 1.4.3** this document **defines `ReconLine.settled_at`** (§6) and
registers the semantics as `[ASSAY-MODEL]` M18 (§22.2). Through spec 1.4.2 the
field was declared with no comment, no provenance class and no semantics anywhere
in this specification, which `§0` rule 6 makes a defect in its own right — while
`C3`, `C4` and §7 all read the term. **No field, entity, account, posting rule,
exception class, invariant or metric definition changes**, and benchmark v1.0.3 is
unchanged. The definition asserts **no** relationship to `Settlement.created_at`,
which is `[RZP-DOC]` and documents the creation of the settlement record. Its
consequence for candidate generation is stated at `RECONCILIATION_SPEC.md §4.1`.
See `DECISION_BRIEF.md §A.10`.

**At spec 1.4.2** this document extends `E11_TIMING_BOUNDARY` in §15 to a refund
`recon_line` left unsettled by `PREREGISTRATION.md §4.2`'s batch-composition rule
— a **semantic addition**, recorded as such — and adds the missing `refund` row to
§17.1.1's kind table, a **contradiction repair** of §17.2's totality claim. **No
posting rule, no `AccountCode`, no exception class and no metric definition was
added or changed**, both additions are non-posting, and `§17.1.1` already
determined the unsettled refund's own postings: `P3` at ingest and `P4` only
where its settlement is reconciled to a bank credit, so truth and agent agree.
`E02` is untouched and still owns the unsettled *capture*. See
`DECISION_BRIEF.md §A.9` and `PREREGISTRATION.md §10` V15.

**At spec 1.4.1** this document withdrew §3's claim that `receipt`'s documented
uniqueness *"makes anchor `AN5` legitimate"* — the anchor is retired in
`RECONCILIATION_SPEC.md §3` — and added §22.2 rows M16 and M17. **No schema,
field, account, posting rule, invariant or metric changed**, `receipt` remains
quarantined, and the trust boundary is untouched. See `DECISION_BRIEF.md §A.8`.

**At spec 1.4.0** this document added `§17.1.1`, the normative posting-trigger
table over `Observation.kind` × terminal state × `ExceptionClass`; narrowed `P8`
to adjustment observations and deleted the universal fallback (§17.2); added
`JournalLine.source_entity_id` as the Suspense item key (§16); stated
`value(observation)` per reconcilable kind (§14.1); and restricted
`unresolved_value_paise` to open Suspense items with the v1.0.2 universe retained
as `unresolved_value_paise_multiview` (§20) — see `DECISION_BRIEF.md §A.7`. **No
`AccountCode` and no posting rule was added, and §16's hashed `body` projection
and genesis are unchanged**, though every digest changes because `journal_lines`
carries a new field.

**At spec 1.3.0** this document made the `(kind, source_system, payload)` mapping
normative and added two `source_system` values (§10), stated the adjustment
information boundary (§9, §22.2 M15), rewrote §17.2 as a two-sided posting model
in which every adjustment observation takes P8 on the non-zero `debit`/`credit`,
and added `GroundTruth.true_journal` with `true_balances` as its projection
(§1, `gt_version` → 1.1.0) — see `DECISION_BRIEF.md §A.6`. **§16's hashed `body`
and genesis are unchanged.** The paragraphs below describe the earlier **1.2.0** and
**1.1.1** releases and are retained as history.

**At spec 1.2.0** this document gained §10.1, §17.1 and §17.2, a normative `body`
and genesis definition (§16), basis-point encoding for hashed ratios (§0 rule 5),
and new `CloseReport` fields (§20) — see `DECISION_BRIEF.md §A.5`.

**Spec 1.1.1 is a factual-correction release.** No feature, architecture or
Tier-0 scope change. It aligns every statement about Razorpay behaviour with the
current official documentation and classifies each such statement by provenance
(§0 rule 6, register in §22).

---

## 0. Universal rules

1. **All money is integer paise.** Type `Paise = number & { readonly __paise: unique symbol }`.
   Floats are forbidden everywhere, including intermediate values, JSON, SQLite
   columns (`INTEGER`) and the UI (formatted at render only). Rationale: ₹0.01
   errors compound across 10,000 records and destroy the tie-out invariants that
   the whole system rests on.
2. **All timestamps are Unix epoch seconds (integer, UTC).** Matches Razorpay.
   Display converts to IST at render only.
3. **IDs follow Razorpay grammars.** `pay_[A-Za-z0-9]{14}`, `order_[A-Za-z0-9]{14}`,
   `rfnd_[A-Za-z0-9]{14}`, `setl_[A-Za-z0-9]{14}`, `adj_[A-Za-z0-9]{14}`,
   `disp_[A-Za-z0-9]{14}`. The prefixes are `[RZP-DOC]`; the **14-character
   suffix length is `[ASSAY-MODEL]`** — it is consistent across every official
   sample identifier but is not stated as a contract anywhere, so ASSAY treats it
   as an observed regularity it has chosen to reproduce, not a documented rule.
   Synthetic IDs are drawn from the same alphabet so the
   engine cannot distinguish synthetic from real by shape. ASSAY-internal IDs use
   distinct prefixes (`obs_`, `cand_`, `comp_`, `dec_`, `evt_`, `exc_`) so a
   Razorpay ID can never be confused with an ASSAY ID.
4. **Untrusted text is never a field on a structural record.** `description`,
   `notes`, `order_receipt` and bank `narration` live only in `untrusted_text`
   (§10) and are visible only to the LLM adjudicator.
5. **Canonical JSON** for hashing: keys sorted lexicographically, no whitespace,
   UTF-8, integers only (no exponent notation). Used for every `*_hash` field.
   **Every dimensionless ratio that enters a hashed body, or that a gate or
   invariant compares, is an integer in basis points** — one bp is 1e-4, the same
   scale already used by `rate_bps` and the `/ 10_000` fee arithmetic (§6), so
   0.15 is `1500` and a unit score is `10_000`. This covers
   `evidence_score_bps`, `evidence_score_gap_bps`, `epsilon_bps` and
   `max_unresolved_ratio_bps`. Ratios that are neither hashed nor compared — the
   four `coverage_by_value*` figures and `coverage_by_count` in `CloseReport`
   (§20) — are derived display values computed at render from the authoritative
   integer paise fields, and are outside this rule.
6. **Every factual statement about Razorpay carries a provenance class.** This
   applies to claims about Razorpay's entities, fields, value sets, arithmetic,
   pricing, timing and semantics — not to ASSAY's own design prose, which needs
   no such class because it asserts nothing about a third party. Exactly one of:
   - **`[RZP-DOC]`** — stated in current official Razorpay documentation. The
     specific source is named in the provenance register (§22).
   - **`[ASSAY-MODEL]`** — ASSAY's own modelling decision. It may be *consistent*
     with Razorpay behaviour, but Razorpay does not document it, and ASSAY does
     not claim that it does.
   - **`[NOT-CLAIMED]`** — considered and deliberately not asserted, because no
     official source supports it.

   A Razorpay claim with no class is a defect. The rule exists because ASSAY's only
   claim to realism is schema and arithmetic fidelity: one overstated "verified
   against the API" converts that strength into a liability under review.
   Convenience is never a reason to promote `[ASSAY-MODEL]` to `[RZP-DOC]`.

---

## 1. Ground truth (`packages/generator`, never visible to the engine)

The generator runs a **forward simulation of the business process**. Ground truth
is a *byproduct of construction*, never an annotation and never an LLM output.

```ts
interface GroundTruth {
  gt_version: string;              // "1.1.0"
  seed: number;
  family_id: FamilyId;             // F01..F12
  // The true allocation. Every edge here actually happened in the simulation.
  allocations: Array<{
    settlement_id: SettlementId;
    entity_id: PaymentId | RefundId | AdjustmentId;
    entity_type: "payment" | "refund" | "adjustment";
    gross_paise: Paise;            // amount
    fee_paise: Paise;              // GST-INCLUSIVE fee, as the recon line carries it
    tax_paise: Paise;              // the GST component INSIDE fee_paise
    net_paise: Paise;              // credit - debit contribution; = gross - fee
  }>;
  // Which bank credit line actually carried which settlement(s).
  bank_mappings: Array<{
    bank_line_id: BankLineId;
    settlement_ids: SettlementId[];
  }>;
  // Which merchant ledger entry actually corresponds to which payment.
  ledger_mappings: Array<{
    ledger_entry_id: LedgerEntryId;
    payment_id: PaymentId | null;  // null = merchant booked something spurious
  }>;
  // The journal the simulation itself wrote, in the order it wrote it.
  // Produced by applying DATA_MODEL §17.1–§17.2 (truth side) to the simulated
  // events at the moment each occurs. Never visible to the engine or the oracle
  // (PREREGISTRATION.md §6.2 AL1, AL2).
  true_journal: Array<{
    seq: number;                     // strictly increasing, gapless, from 0
    source_entity_id: string;        // pay_… | rfnd_… | adj_… | setl_… | bank_…
                                     // the JOIN KEY for covered-set projection
    posting_ref: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8";
    account: AccountCode;            // the frozen seven; unchanged
    dr_paise: Paise;                 // exactly one of dr/cr is non-zero
    cr_paise: Paise;
  }>;
  // Projection of true_journal, retained as a redundant checksum.
  // For every account: Σ dr_paise − Σ cr_paise over true_journal.
  true_balances: Record<AccountCode, Paise>;
  // Degradations applied, for post-hoc analysis only. NOT an ambiguity label.
  degradations: Array<{ op: DegradationOp; target_id: string; params: object }>;
}
```

**Why `true_journal` exists.** `true_balances` was a stored vector with no
specified derivation from any other field, so it could not be recomputed, could
not be audited, and could not be projected onto a subset of items — which
`EVALUATION_SPEC.md §4.4`'s covered-set restriction requires. `true_journal`
supplies all three. It mirrors the construction `ARCHITECTURE.md §8` already
applies to the agent, where Layer B is *"a pure projection over Layer A"*: truth
and agent are now compared structure to structure rather than rule to vector.

**Determinism.** `true_journal` is emitted in a fixed order derived from the
simulation's own event sequence: `seq` is assigned by a canonical traversal in
simulated-time order, ties broken by `source_entity_id` ascending, then by
`account` ascending. It is never ordered by wall-clock time, process ID or
iteration over an unordered collection. The same seed produces byte-identical
output, as `PREREGISTRATION.md §7` requires of every generator artifact.

**Relationship to `true_balances`.** `true_balances` is the projection, retained
as a redundant checksum. A mismatch between the two is a **generator defect and a
seal failure** (`PREREGISTRATION.md §9` step 5).

**What `true_journal` is not.** It is **not** a `LedgerEvent` stream. It carries
no `run_id`, no `evt_id`, no `ts`, no `prev_hash`, no `hash`, no `actor`, no
`subject_ids`, no `evidence_ids`, no `decision_id`, no `inputs_hash` and no
`certificate`. It is not hash-chained, does not participate in genesis, and does
not enter any `ledger_root_hash`. The hashed `body` and genesis definitions in
§16 are **unchanged** — the ledger chain belongs to the agent's run, and truth has
no run. `true_journal`'s integrity is covered by the `ground_truth.jsonl` SHA-256
already committed at `PREREGISTRATION.md §9` step 4.

**Exclusion from observation.** `true_journal` is a field of `GroundTruth`. `AL1`
bars `packages/engine` and `packages/oracle` from importing
`packages/generator`; `AL2`'s runtime path guard throws on any read matching
`**/ground_truth*.jsonl`; the file itself is gitignored with only its hash
committed. No agent, baseline or ablation can reach it.

**There is no `is_ambiguous` field.** Ambiguity is not authored; it is discovered
by the Ambiguity Oracle from observations alone (`ARCHITECTURE.md §7`).

---

## 2. `Payment` — a declared subset of the documented Payment entity

**`[RZP-DOC]`** for every field below: name, type and unit match the documented
Payment entity (`GET /v1/payments`, `GET /v1/payments/:id`).

**`[ASSAY-MODEL]`** that this is a *subset*. ASSAY carries only the fields
reconciliation needs. It is not a mirror of the entity, and §22 lists what is
deliberately omitted.

```ts
interface Payment {
  id: PaymentId;                   // "pay_..."
  entity: "payment";
  amount: Paise;                   // gross authorised/captured amount
  currency: "INR";
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: OrderId | null;
  method: "card" | "upi" | "netbanking" | "wallet" | "emi";
  captured: boolean;
  amount_refunded: Paise;          // running total; <= amount
  created_at: UnixSeconds;
  // QUARANTINED — see §10, not present on the structural record
  // description, notes
}
```

**Card detail is not on this entity. `[RZP-DOC]`** `card_network`, `card_issuer`
and `card_type` are **settlement-reconciliation** columns (§6), not Payment
fields; the documented Payment entity exposes card detail through `card_id` and
the Cards API. Spec 1.1.0 carried them here in error. ASSAY reads card attributes
only from the recon line, which is where the reconciliation logic needs them and
where Razorpay documents them.

**Documented fields ASSAY deliberately does not carry `[ASSAY-MODEL]`:** `fee`,
`tax`, `international`, `refund_status`, `invoice_id`, `card_id`, `bank`,
`wallet`, `vpa`, `email`, `contact`, `acquirer_data`, `error_*`. Fee and tax are
consumed from the recon line, which is the settlement-side view ASSAY reconciles;
carrying a second copy on the payment would create two sources for one number.

**Method coverage `[ASSAY-MODEL]`.** The documented method set additionally
includes `paylater`. ASSAY v1.0.0 simulates the five methods above and does not
simulate `paylater`; that is a scope decision, not a claim that the value does not
exist.

**Invariants asserted at ingest `[ASSAY-MODEL]`:** `amount_refunded <= amount`;
`captured === true` iff `status ∈ {captured, refunded}`;
`amount > 0`.

---

## 3. `Order` — mirrors `GET /v1/orders`

```ts
interface Order {
  id: OrderId;                     // "order_..."
  entity: "order";
  amount: Paise;
  amount_paid: Paise;
  amount_due: Paise;
  currency: "INR";
  status: "created" | "attempted" | "paid";
  attempts: number;
  created_at: UnixSeconds;
  // QUARANTINED: receipt, notes
}
```

**Invariants `[ASSAY-MODEL]`:** `amount_paid + amount_due === amount`;
`status === "paid"` iff `amount_due === 0`. Both follow from the documented field
descriptions ("the amount paid against the order" / "the amount pending against
the order"), but Razorpay does not state them as invariants, so ASSAY asserts
them as its own.

Orders matter to reconciliation because they are the join key to the merchant's
ERP: the merchant books receivables against orders, not payments. `[RZP-DOC]`
`receipt` is documented as at most 40 characters and required to be unique. Spec
1.2.0 through 1.4.0 added that *"that documented uniqueness is what makes anchor
`AN5` legitimate rather than a guess."* **That sentence is withdrawn at spec
1.4.1.** Documented uniqueness would have made `AN5` *well-keyed*; it never made
it *admissible*. `receipt` is quarantined by §0 rule 4 and is therefore not
available to the deterministic core that would have to evaluate the anchor, and
`THREAT_MODEL.md §T5` holds that the merchant ledger contributes soft evidence
only — so a hard anchor on a merchant-controlled reference is excluded on trust
grounds as well as on availability. `AN5` is retired in
`RECONCILIATION_SPEC.md §3`; `receipt` remains quarantined and is reachable only
through the `fetch_order` probe, where it feeds `SE2` as soft evidence.

---

## 4. `Refund` — mirrors `GET /v1/refunds`

```ts
interface Refund {
  id: RefundId;                    // "rfnd_..."
  entity: "refund";
  amount: Paise;                   // may be < payment.amount (partial)
  currency: "INR";
  payment_id: PaymentId;
  status: "pending" | "processed" | "failed";
  // [RZP-DOC] the two speed fields have DIFFERENT value sets; they are not
  // interchangeable, and both appear only when `speed` was set on the request.
  speed_requested: "normal" | "optimum" | null;
  speed_processed: "instant" | "normal" | null;
  created_at: UnixSeconds;
  // QUARANTINED: notes
}
```

**Speed correction `[RZP-DOC]`.** Spec 1.1.0 declared
`speed_processed: "normal" | "optimum" | "instant"`. `optimum` is documented as a
value of **`speed_requested`** ("processed at an optimal speed based on Razorpay's
internal fund transfer logic"), never of `speed_processed`, whose documented
values are exactly `instant` and `normal`.

**Documented fields ASSAY does not carry `[ASSAY-MODEL]`:** `receipt`,
`acquirer_data`, `batch_id`, `notes` (quarantined). Instant Refunds carry their
own charge and are outside Tier-0 (§5).

**Invariants `[ASSAY-MODEL]`:** `amount > 0`; `amount <= payment.amount`;
`Σ refunds(payment) <= payment.amount`; `refund.created_at >= payment.created_at`.

Partial refunds crossing a settlement boundary (family F02) are the single most
common source of real-world reconciliation breaks and are a first-class case.

---

## 5. `Settlement` — mirrors `GET /v1/settlements`

**`[RZP-DOC]`** The documented Settlement entity has exactly eight parameters,
all of which appear below. There is no `currency` and no `settled_at`.

```ts
interface Settlement {
  id: SettlementId;                // "setl_..."
  entity: "settlement";
  amount: Paise;                   // net amount transferred to the bank
  status: "created" | "processed" | "failed";
  // [RZP-DOC] ALWAYS 0 for a normal settlement. These are NOT the aggregated
  // processing fees of the constituent lines — those are already netted inside
  // each line's `credit` (§6). They carry the INSTANT-settlement service charge.
  fees: Paise;                     // 0 for every settlement ASSAY generates
  tax: Paise;                      // 0 for every settlement ASSAY generates
  utr: string;                     // bank UTR, e.g. "1568176960vxp0rj"
  created_at: UnixSeconds;
}
```

**The 1.1.0 error, and why it mattered `[RZP-DOC]`.** Spec 1.1.0 declared
`fees` as "total fee across constituent lines" and `tax` as "total GST on those
fees". Razorpay documents the opposite in plain words: *"In case of a normal
settlement the fee charge will be `0`"*, and likewise for tax. The
`settlement.processed` webhook payload shows `fees: 0, tax: 0` on a processed
settlement. A generator that summed constituent fees into these fields would emit
a settlement object no real account ever returns.

This also explains why invariant `I4` (`settlement.amount = Σ credit − Σ debit`)
is correct **as written**: because `fees` is zero there is nothing further to
subtract, and subtracting `settlement.fees` would double-deduct.

**Instant Settlements are outside Tier-0 `[ASSAY-MODEL]`.** The documented
`settlement.ondemand` entity is where non-zero `fees`/`tax` appear (documented as
*"Total amount (fees+tax)"*, i.e. GST-inclusive, consistent with §6). ASSAY
v1.0.0 generates no instant settlements, models no instant-settlement charge, and
makes no claim about that flow.

**`status: "processed"` is not "money has arrived" `[RZP-DOC]`.** Razorpay
documents that `processed` confirms *initiation* of the transfer and that the
credit lands after the NEFT/RTGS/IMPS timeline, which can take up to three hours.
This is the documentary basis for constraint `C3`'s bank-clock gap and for
exception class `E04_SETTLEMENT_NOT_IN_BANK` being a genuine timing state rather
than an error.

---

## 6. `ReconLine` — models `GET /v1/settlements/recon/combined`

**This is the primary PG-side observation.** The documented endpoint declares
**24 response parameters**; every field below whose name matches one of them is
`[RZP-DOC]` in name, type and unit. Three deviations are deliberate and are each
argued below: the `type` union is **narrowed** (Route out of scope), and
`posted_at` / `credit_type` appear in Razorpay's sample payload but in no
documented parameter list, so their semantics are `[ASSAY-MODEL]`. "Models", not
"mirrors": this is a faithful but declared subset.

```ts
interface ReconLine {
  entity_id: string;               // [RZP-DOC] pay_… | rfnd_… | adj_…
  // [RZP-DOC] the documented value set is
  //   "payment" | "refund" | "transfer" | "adjustment".
  // ASSAY narrows it: "transfer" is a Razorpay Route concept and Route is
  // OUT OF TIER-0 SCOPE (see "Route transfers" below). The ingest schema
  // rejects transfer rows rather than modelling them partially.
  type: "payment" | "refund" | "adjustment";
  debit: Paise;                    // amount debited from the merchant
  credit: Paise;                   // amount credited to the merchant
  amount: Paise;                   // gross
  currency: "INR";
  // [RZP-DOC] `fee` is GST-INCLUSIVE and `tax` is the GST component INSIDE it.
  // See "Fee and GST model" below. Do not add them together.
  fee: Paise;
  tax: Paise;
  on_hold: boolean;                // [RZP-DOC] field; see C8 for its scope
  settled: boolean;
  created_at: UnixSeconds;
  settled_at: UnixSeconds | null;
  settlement_id: SettlementId | null;
  posted_at: UnixSeconds | null;   // [ASSAY-MODEL] semantics — see below
  credit_type: "default";          // [ASSAY-MODEL] beyond "default" — see below
  payment_id: PaymentId | null;    // [RZP-DOC] null for payments; set for refunds
  settlement_utr: string | null;
  order_id: OrderId | null;
  method: string | null;           // card | netbanking | wallet | upi | emi
  card_network: string | null;     // documented value set below
  card_issuer: string | null;      // 4-char code; [RZP-DOC] unset for intl cards
  card_type: string | null;        // credit | debit
  dispute_id: DisputeId | null;
  // QUARANTINED: description, notes (an OBJECT — see §10), order_receipt
}
```

**`card_network` documented value set `[RZP-DOC]`:** `American Express`,
`Diners Club`, `Maestro`, `MasterCard`, `RuPay`, `Visa`, `unknown`. Spec 1.1.0
used `"Amex"`, which is not a Razorpay value. The ingest schema accepts all seven.
**`[ASSAY-MODEL]`** the v1.0.0 generator emits only `Visa`, `MasterCard` and
`RuPay`, because `American Express` and `Diners Club` carry a documented 3%
premium rate that the flat card rate in `PREREGISTRATION.md §4.2` would
misrepresent. Emitting them at 2% would be a fabricated fee, so they are not
emitted at all.

**`posted_at` and `credit_type` `[ASSAY-MODEL]`.** Both appear in Razorpay's
official sample response but in **neither** documented parameter list, so their
semantics are undocumented and ASSAY does not claim otherwise. `credit_type` is
observed only with the value `"default"`. Spec 1.1.0 additionally declared
`"refund_credit"` and `"dispute_credit"`; those values appear in no Razorpay
source, are **`[NOT-CLAIMED]`**, and have been removed rather than relabelled —
an invented enum value in a schema that claims API fidelity is exactly the kind of
detail that discredits the rest of it.

**`settled_at` — semantics `[ASSAY-MODEL]`, supplied at spec 1.4.3.** `settled_at`
is **the instant at which the settlement that carried this line transferred**, in
Unix epoch seconds. It is a property of that settlement rather than of the line:
**every recon line carried by one settlement records the same `settled_at`**,
whether or not the line still carries the `settlement_id` naming it. It is `null`
exactly when no settlement carried the line — the unsettled member of
`PREREGISTRATION.md §4.2`, whose treatment under `C3` and `C4`
`RECONCILIATION_SPEC.md §4.1` fixes.

*Why this is `[ASSAY-MODEL]` and not `[RZP-DOC]`.* The field's **name, type and
unit** are documented and are covered by this section's opening; its **semantics**
are not, exactly as for `posted_at` and `credit_type` above. No official source
states that the value is settlement-scoped, and none relates it to any field of
the `Settlement` entity. The reading is ASSAY's.

*It is the reading the frozen constraint set already assumes, and stating it adds
no constraint.* `C4` is named *"Settlement window"* and is justified entirely by
the documented **T+2 settlement cycle** — a per-settlement quantity, not a
per-line one. `C3` places `settled_at` between the capture and the bank value
date, which is the transfer. And `§7` contrasts the bank line as having *"a
different clock (value date, not `settled_at`)"*, treating `settled_at` as the
PG-side settlement clock. Three frozen clauses read this term and none defined
it; through spec 1.4.2 the field carried no comment, no provenance class and no
semantics anywhere in this specification, which `§0` rule 6 makes a defect in its
own right.

*What is deliberately **not** asserted.* **No relationship whatever to
`Settlement.created_at`.** That field is `[RZP-DOC]` and documents the creation of
the settlement *record*; `§0` rule 6 forbids promoting an ASSAY reading onto a
documented field, and no rule anywhere compares the two. The definition is also
**necessary, not sufficient**: two lines sharing a `settled_at` are not thereby
carried by the same settlement, which is what keeps `F08` a matching problem
rather than a lookup.

**Route transfers are out of Tier-0 scope `[ASSAY-MODEL]`.** `type: "transfer"`
(`trf_…`) is genuinely documented, and Razorpay's own sample shows a transfer row
obeying a *third* arithmetic form (`debit = amount + fee`) that neither of the
identities below covers. Rather than invent an accounting identity for a product
ASSAY does not model, Route is declared out of scope: the generator emits no
transfer rows, the ingest schema does not accept them, and ingesting a real recon
report that contains them requires a spec amendment. This is a deliberate refusal
to model something partially, not an oversight.

**The arithmetic identity that anchors everything (invariant I3) `[RZP-DOC]`:**

```
  type === "payment"    →  credit = amount - fee    and  debit = 0
  type === "refund"     →  debit  = amount          and  credit = 0    (fee = tax = 0)
  type === "adjustment" →  exactly one of debit/credit is non-zero
```

**Fee and GST model — corrected in spec 1.1.1.**

`[RZP-DOC]` Razorpay's Payment entity documents `fee` as *"Fee (**including
GST**) charged by Razorpay"* and `tax` as *"GST charged for the payment"*: **`tax`
is a component inside `fee`, not an addend on top of it.** The documented sample
is decisive — `amount: 2100, fee: 50, tax: 8`, where 2% of ₹21.00 is 42 paise,
18% GST on 42 is 7.56 → `tax: 8`, and 49.56 → `fee: 50`. The same convention is
documented for instant settlements (*"Total amount (fees+tax)"*) and is the only
reading consistent with the transfer row in the recon endpoint's own sample.

`[RZP-DOC]` The recon endpoint documents `tax` as *"the tax on the fee"* —
confirming GST is charged on the fee, not on the transaction — and the pricing
documentation states the rate as 18%.

The generator therefore computes:

```
  fee_ex_gst = round_half_up(amount * rate_bps / 10_000)   // rate by method
  tax        = round_half_up(fee_ex_gst * 1800 / 10_000)   // 18% of the fee
  fee        = fee_ex_gst + tax                            // GST-INCLUSIVE
  credit     = amount - fee                                // == amount - fee_ex_gst - tax
```

and any consumer that needs the fee net of GST derives it as `fee_ex_gst = fee −
tax`. Note that **`credit` is numerically unchanged from spec 1.1.0** — only the
value carried in the observable `fee` field changes, and with it the identity used
to check a line. No rupee flow, ledger balance or metric is affected.

**What spec 1.1.0 got wrong, stated plainly.** It declared
`credit = amount − fee − tax` with `fee` net of GST, and `PREREGISTRATION.md §2`
called that identity *"Real. Structural identity taken from the documented recon
report schema."* That provenance claim was false: the recon endpoint documents
only *"the fees charged to process the transaction"* and *"the tax on the fee"* —
it does not state the GST-inclusivity either way, and the one sample row capable
of discriminating the two conventions supports GST-inclusive. Under the old
identity a consumer reading real Razorpay data would subtract GST twice.

Rounding is **half-up to the nearest paisa, applied once per line, never
re-derived downstream `[ASSAY-MODEL]`** — Razorpay does not document its rounding
mode, and its own sample (`fee: 296, tax: 46`, against a clean 18% of 250 = 45)
shows that sub-paisa drift is real, which is what scenario family F03 exists to
exercise. Method rates are declared in `PREREGISTRATION.md §4.2` and held fixed
across the benchmark, with a mid-period rate change as scenario family F03.

**Endpoint scoping `[RZP-DOC]`.** `GET /v1/settlements/recon/combined` requires
`year` and `month`; `day` is optional; `count` is capped at 1000 with `skip` for
paging. The recon report is therefore date-scoped and paginated, and a period-close
ingest must iterate rather than issue one call.

---

## 7. `BankStatementLine` — the second independent view

**`[ASSAY-MODEL]` in its entirety.** Not a Razorpay entity and not derived from
any Razorpay documentation. It models what a bank's statement export contains.
Its realism is the weakest link in the data model and no external validity is
claimed for it (`PREREGISTRATION.md §10`, V2).

```ts
interface BankStatementLine {
  bank_line_id: BankLineId;        // "bnk_..."
  value_date: UnixSeconds;         // date-granular; bank clock, not PG clock
  amount: Paise;
  direction: "credit" | "debit";
  running_balance: Paise | null;   // often absent in exports
  bank_ref: string | null;         // sometimes a clean UTR, often not
  // QUARANTINED: narration (the messy part)
}
```

**Why this entity is the crux:** the bank line is where the money *actually*
arrived. It has a different clock (value date, not `settled_at`), a truncated
narration, and no entity IDs. It is also not Razorpay's data and was never within
the recon report's remit — reconciling a merchant's bank statement against the
gateway's record requires holding both, which is a statement about how many
sources a single-source view holds, not a criticism of any implementation of one
(`RELATED_WORK.md §1.1`).

---

## 8. `MerchantLedgerEntry` — the third independent view

**`[ASSAY-MODEL]` in its entirety.** Not a Razorpay entity. Models a merchant
ERP's own booking record.

```ts
interface MerchantLedgerEntry {
  ledger_entry_id: LedgerEntryId;  // "mle_..."
  booked_at: UnixSeconds;          // merchant's clock; often capture date
  order_ref: string;               // merchant's own order reference, not order_id
  invoice_no: string | null;
  gross_paise: Paise;
  expected_net_paise: Paise | null; // merchant's guess at post-fee net
  gl_account: AccountCode;
  // QUARANTINED: memo
}
```

`order_ref` is deliberately *not* `order_id`: merchants use their own scheme and
the mapping is lossy. Recovering it is a genuine matching problem.

---

## 9. `Adjustment` and `Dispute`

```ts
// [ASSAY-MODEL] — see the provenance note below. Razorpay publishes NO
// Adjustments API entity. Only the `adj_…` row type in the recon report and the
// "Adjustment" line of the settlement break-up are documented.
interface Adjustment {
  id: AdjustmentId;                // "adj_..." — [RZP-DOC] the id prefix only
  amount: Paise;                   // signed by direction, magnitude only here
  direction: "debit" | "credit";   // [ASSAY-MODEL]
  reason: "chargeback_debit" | "chargeback_reversal" | "fee_correction"
        | "gst_correction" | "manual";                        // [ASSAY-MODEL]
  created_at: UnixSeconds;
  related_entity_id: string | null;                           // [ASSAY-MODEL]
}

interface Dispute {
  id: DisputeId;                   // "disp_..."
  payment_id: PaymentId;
  amount: Paise;
  // [RZP-DOC] documented status set; `under_review` was missing in spec 1.1.0
  status: "open" | "under_review" | "won" | "lost" | "closed";
  created_at: UnixSeconds;
}
```

**Adjustment provenance `[ASSAY-MODEL]`.** What Razorpay documents is: rows of
`type: "adjustment"` with `adj_…` identifiers in the recon report, and
*"Adjustment — adjustments to transactions, if any"* as a component of the
settlement break-up. It documents no adjustment entity, no `direction` field and
no reason taxonomy. Every one of those is ASSAY's construct, retained because
Tier-0 needs out-of-band settlement movements to reconcile, and labelled as such
rather than presented as API fidelity.

`reason` values `chargeback_hold` / `chargeback_release` were renamed to
`chargeback_debit` / `chargeback_reversal` in spec 1.1.1, because the old names
encoded an `on_hold`-based dispute mechanism that Razorpay does not document
(§6, `PREREGISTRATION.md §4.1` F07). The documented dispute fund flow is a
**deduction**: the Dispute entity carries `amount_deducted`, and *"if you lose the
dispute, the amount would be deducted from your account."* ASSAY therefore models
a lost or contested dispute as a **debit adjustment line** and a subsequent win as
a **credit adjustment line** in a later cycle.

**`Adjustment` is a true-state entity and is never an observation.** It does not
appear in `Observation.payload` (§10). ASSAY sees an adjustment only as a
recon-report row — `ReconLine` with `type === "adjustment"` — which carries
`entity_id`, `debit`, `credit`, `amount`, `settlement_id` and `created_at`, and
carries **no `reason`, no `direction` field and no `related_entity_id`**.
`direction` is nevertheless recoverable, since `I3` guarantees exactly one of
`debit`/`credit` is non-zero on such a row; `reason` and `related_entity_id` are
not recoverable from anything. This is the information boundary that
§17.2 and `RECONCILIATION_SPEC.md §4.1` `C2` both rest on.

**Documented Dispute fields ASSAY does not carry `[ASSAY-MODEL]`:**
`amount_deducted`, `reason_code`, `respond_by`, `phase`
(`fraud` / `retrieval` / `chargeback` / `pre_arbitration` / `arbitration`),
`currency`.

Adjustments are the reconciliation cases that break naive matchers: they carry no
payment, arrive out of band, and change a settlement total by an amount that
corresponds to no transaction.

---

## 10. `Observation` and `UntrustedText`

Everything entering the system becomes an `Observation`.

```ts
interface Observation {
  obs_id: ObservationId;           // "obs_..."
  source_system: "pg_recon" | "bank_statement" | "merchant_ledger"
                | "pg_payments" | "pg_orders" | "pg_refunds"
                | "pg_settlements" | "pg_disputes";
  source_file: string;
  source_line: number;
  ingest_hash: Sha256;             // canonical JSON hash of the raw record
  ingested_at: UnixSeconds;
  kind: "recon_line" | "bank_line" | "ledger_entry" | "payment"
      | "order" | "refund" | "settlement" | "adjustment" | "dispute";
  payload: ReconLine | BankStatementLine | MerchantLedgerEntry | Payment
         | Order | Refund | Settlement | Dispute;   // structural fields only
}

interface UntrustedText {
  obs_id: ObservationId;
  field: "description" | "notes" | "narration" | "memo" | "order_receipt";
  // For `notes`, `raw` is the canonical-JSON serialization of the notes OBJECT
  // (§0 rule 5), so the quarantine boundary handles one type. See below.
  raw: string;                     // verbatim, never interpreted by the core
  length: number;
  sanitized_preview: string;       // control chars stripped, for UI display only
}
```

**`notes` is an object, not a string `[RZP-DOC]`.** Razorpay documents `notes` as
a JSON object — a key-value store of at most 15 pairs, 256 characters each — on
Orders, Payments, Refunds and the recon report. Spec 1.1.0 treated it as a bare
string. `[ASSAY-MODEL]` ASSAY quarantines the whole object as one `UntrustedText`
row carrying its canonical-JSON serialization, so the deterministic core sees a
single opaque blob and the injection surface is one field rather than N. This
*strengthens* the F10 adversarial family: hostile text realistically arrives in
merchant-chosen **values** under merchant-chosen **keys**, and both are now
inside the quarantined payload.

**Nothing in `packages/engine` may import `UntrustedText`.** Enforced by an
ESLint `no-restricted-imports` rule, verified in CI. This is the structural
prompt-injection defence: it is not that the core *chooses* not to read hostile
text, it is that it *cannot*.

**Every kind has exactly one source and one payload type.** `ARCHITECTURE.md §6`
requires that nothing enter the system anonymously; this table is what makes that
checkable. Ingest rejects any observation whose `(kind, source_system, payload)`
triple is not a row below.

| `kind` | `source_system` | `payload` |
|---|---|---|
| `recon_line` | `pg_recon` | `ReconLine` with `type === "payment"` or `"refund"` |
| `adjustment` | `pg_recon` | `ReconLine` with `type === "adjustment"` |
| `bank_line` | `bank_statement` | `BankStatementLine` |
| `ledger_entry` | `merchant_ledger` | `MerchantLedgerEntry` |
| `payment` | `pg_payments` | `Payment` |
| `order` | `pg_orders` | `Order` |
| `refund` | `pg_refunds` | `Refund` |
| `settlement` | `pg_settlements` | `Settlement` |
| `dispute` | `pg_disputes` | `Dispute` |

**The PG-side recon report is not an `Observation`, and this table is unchanged
by spec 1.4.22.** `RECONCILIATION_SPEC.md §6.2`'s `fetch_settlement_recon` reads
`bench/<split>/recon_report.jsonl`, which is a **probe response surface**: it is
never ingested, never assigned an `obs_id`, never given a terminal state, and
never counted in any coverage numerator or denominator. It therefore enters no
`(kind, source_system, payload)` triple above, and no row is added. `Evidence`
(§12) still records a probe result with `produced_by: "deterministic"`, since the
executor rather than the model performs the call.

`pg_settlements` and `pg_disputes` were added in spec 1.3.0. Benchmark v1.0.0 and
v1.0.1 declared six source systems against nine kinds, so `settlement`,
`adjustment` and `dispute` observations had no source they could carry — a
provenance gap, not a behavioural one. **No frozen metric depends on
`source_system`**: `AbstentionTelemetry.by_source_system` (§21) is typed
`Record<string, …>` and is not on the frozen metric list, so widening the union
changes no number.

**`Adjustment` is deliberately absent from the payload union.** An adjustment
reaches ASSAY as a **recon-report row** — `ReconLine` with `type ===
"adjustment"`, carrying `entity_id` (`adj_…`), `debit`, `credit`, `amount`,
`settlement_id` and `created_at`. The `Adjustment` entity of §9, and with it
`reason`, `direction` and `related_entity_id`, is **true state only** and is never
an observation. See §9 and §17.2.

### 10.1 Reconcilable and reference kinds

Every `Observation.kind` is statically classified. The classification is a
property of the kind alone — it is fixed before any run, identical for every
agent, and never depends on a decision.

**Normative principle.** A **reconcilable** observation represents an independent
reconciliation or accounting obligation. A **reference** observation provides
contextual evidence for another obligation and is not independently counted as a
reconciliation obligation.

| Class | Kinds | Meaning |
|---|---|---|
| **Reconcilable** | `recon_line`, `bank_line`, `ledger_entry`, `settlement`, `refund`, `adjustment`, `dispute` | Carries an independent claim about money that must be tied out. Reaches `RECONCILED`, `ABSTAINED` or `EXCEPTION`. May post to the ledger. |
| **Reference** | `payment`, `order` | Supporting evidence for matching a reconcilable observation. Reaches `REFERENCE`. Never matched as a target, never posts a journal line, never enters a coverage numerator or denominator, never contributes to `unresolved_value_paise`. |

The classification is consistent with the exception taxonomy (§15): every
reconcilable kind has at least one exception class that attaches to it —
`E03` to `bank_line`, `E04` to `settlement`, `E10` to `refund`, `E12` to
`adjustment`, `E13` to `ledger_entry`, `E05`/`E06`/`E07` to `recon_line`, and
`F07`'s deduction to `dispute`. Neither `payment` nor `order` has one.
`E01_MISSING_CAPTURE` is the apparent counter-example and is not one: it attaches
to the *settlement* that has no capture behind it, not to a `payment` row.

A reference observation still passes ingest validation, is still hashed into the
dataset, and is still available to stages S1–S4 as evidence. `REFERENCE` means
*"not a reconciliation target"*, never *"not examined"*.

---

## 11. `Candidate` and `Component`

```ts
interface Candidate {
  cand_id: CandidateId;
  target_id: string;               // what is being explained (settlement / bank line)
  member_obs_ids: ObservationId[]; // the observations proposed to explain it
  hard_constraints_satisfied: ConstraintId[];   // e.g. ["C1","C2","C4","C7"]
  evidence_score_bps: number;      // integer soft score in basis points,
                                   // 0..10_000; NEVER used for arithmetic on money
  evidence_items: EvidenceId[];
  generated_by: "anchor" | "constraint_search" | "llm_probe";
}

interface Component {
  comp_id: ComponentId;
  target_ids: string[];
  member_obs_ids: ObservationId[];
  size: number;                    // |members|; compared against K_max
  total_value_paise: Paise;
  solve_status: "SOLVED" | "INTRACTABLE" | "EMPTY";
}
```

`evidence_score_bps` is a soft ranking signal only. It orders candidates and feeds
the ε-margin ambiguity test. **It never enters an amount, a balance or an
invariant.** It is an integer in basis points rather than a float because the
ε-margin test is a comparison whose outcome must be identical across two
executions, and because the score reaches the hashed event body through
`AmbiguityCertificate.evidence_score_gap_bps` (§13), where §0 rule 5 admits
integers only. The SE1–SE5 weighted sum is evaluated in integer basis points with
`round_half_up` applied once, at the end.

**`Component.member_obs_ids` and `Component.total_value_paise` `[ASSAY-MODEL]`,
supplied at spec 1.4.6.** Both were declared without comment through spec 1.4.5,
while `RECONCILIATION_SPEC.md §6` and `PREREGISTRATION.md §7` read the second as
*"component value"* in `τ`. They are defined here in that order, because the
second is a sum over the first and a value cannot be scoped before its domain is.

**`Component.member_obs_ids` — the component's unanchored observation nodes.**
`RECONCILIATION_SPEC.md §5` builds the component graph where *"nodes are
unanchored observations and targets"*, and this field is exactly that graph's
**observation** nodes for this component; `target_ids` is its target nodes.
Anchored observations are **not** members of a component: `§3` states that
*"everything anchored is removed from the search space"*, and the component is
that search space.

**Three fields share the name `member_obs_ids` and they are not the same set.**
The distinction is load-bearing and is stated once here:

```
  Candidate.member_obs_ids   (§11) the observations proposed to explain a
                             target -- the whole allocation, ANCHORED members
                             INCLUDED, because §4.1's C6 reads
                             "Sigma credit(members) - Sigma debit(members) =
                             target.amount" over the allocation and not over a
                             residual.

  Component.member_obs_ids   (§11) the UNANCHORED observation nodes of one §5
                             component. A strict subset of the union of its
                             candidates' member sets whenever any member is
                             anchored.

  AmbiguityCertificate
    .solution_*.member_obs_ids  (§13) Candidate semantics: the field sits
                             beside `candidate_id` and names that candidate's
                             members.
```

**`Component.total_value_paise`:**

```
  total_value_paise = Sigma value(observation) over Component.member_obs_ids
```

`value(observation)` is §14.1's table, which is total over the member-eligible
kinds §11.1 admits (`recon_line`, `adjustment`), so the sum is defined for every
observation this field can range over. **Target observations are excluded**, and
so are anchored observations, by the scoping above.

**Two scopes named "member" meet here and are orthogonal.** §11.1's
*member-eligible* is a scope over **kinds** — which kinds can supply a member
contribution at all. This paragraph's scope is over **membership** — which
observations belong to this component. `Component.member_obs_ids` satisfies
both: unanchored, and of a member-eligible kind.

**This is a ratification, not a derivation, and the record says so.** For
`total_value_paise`, §5's node definition and §11's sibling `size` comment
(*"|members|"*) each supported a different reading and **neither excluded the
other**; the member-scoped one is chosen. For `member_obs_ids`, §11 never stated
that `Component` is §5's graph output — the link was by name and stage only — and
this paragraph states it. Neither claims spec 1.4.5 already implied it. See
`DECISION_BRIEF.md §A.13`.

---

### 11.1 The candidate universe `[ASSAY-MODEL]`

`C1`–`C8` read five quantities off "members" and two off "the target", and
through spec 1.4.3 **no section said which observation kinds can supply them**.
`Candidate.member_obs_ids` (§11) is typed `ObservationId[]` with no kind
restriction, so the type system does not decide it either. This section supplies
the mapping. **It adds no field, no constraint and no account**, and it changes no
`C1`–`C8` clause; where it states an eligibility it is **derived** from text
already frozen, and the one place it declares rather than derives is marked.

**Member contribution.** A candidate member must supply, from its own observation
payload and from no other source:

```
  currency · created_at · settled_at · credit · debit · on_hold
```

`C2`'s and `C5`'s remaining terms are already kind-typed in their own text and
need nothing added here.

**Member eligibility is derived, not declared.** `RECONCILIATION_SPEC.md §4.1`
ratified at spec 1.4.2 that a member whose `settled_at` is null *"does NOT
satisfy"* `C3` and `C4` and *"is excluded from every candidate"*, and that `C3`
and `C4` *"remain unconditional over members"*. A kind that carries **no
`settled_at` field at all** cannot satisfy them a fortiori: the bounded quantity
does not exist, and `§4.1`'s own reasoning is that *"an unconditional filter whose
bounded quantity does not exist cannot report that it is within bounds"*. Of the
nine kinds in §10, only `recon_line` and `adjustment` carry `settled_at` — both as
a `ReconLine` payload (§10's table). **The member-eligible kinds are therefore
`recon_line` and `adjustment`, and every other kind is excluded by frozen text.**

**Two independent routes agree, kind for kind.** The specification already applies
a second test three times — `RECONCILIATION_SPEC.md §3` and
`EVALUATION_SPEC.md §4.1` bar a `ledger_entry` because *"`C6` requires
`credit`/`debit`, which `MerchantLedgerEntry` does not carry"*, and
`PREREGISTRATION.md §10` V15 bars the `refund` kind on the same ground. That test
and the `settled_at` test above return the same verdict for all nine kinds. The
universe is over-determined rather than chosen.

**Target contribution.** A target must supply `amount`, and `currency` for `C1`.
`§17.1.1` fixes the target universe as `settlement` and `bank_line` and states
that its table *"does not widen it"*.

```
  amount      Settlement.amount · BankStatementLine.amount
  currency    "INR" for both target kinds -- DECLARED, see below
  value_date  BankStatementLine.value_date, for C3's bank-arrival half
              (§7: "date-granular; bank clock, not PG clock")
```

**`currency(target) := "INR"` is a declaration, not a derivation `[ASSAY-MODEL]`,
registered at §22.2 M19.** Neither target kind carries a `currency` field — §5
says so of `Settlement` explicitly. `C1` is not silent about the target the way
`C3` and `C4` are silent about scope: it names it, requiring *"currency equality
across all members **and the target**"*. Applying `§4.1`'s absence rule to the
target role would therefore make `C1` unsatisfiable for **every** candidate and
admit nothing at all, which is a reductio rather than a reading. The declared
value asserts nothing beyond what the frozen schema already forces: `currency` is
a literal `"INR"` on every observation that carries the field, so no conforming
dataset contains another value, and `C1`'s own justification states that *"Tier-0
is INR-only by construction"*.

**What this section does not do.** It does not make a `settlement` a candidate
member. Doing so would require declaring `C3` and `C4` **conditional**, which
`§4.1` forecloses in terms — *"the silence of `C3` and `C4` on that point is
deliberate and they remain unconditional over members"* — and would require
inventing five quantities the entity does not carry (`currency`, `settled_at`,
`on_hold`, `credit`, `debit`). It follows that a `bank_line` target has **no
admissible member**, that `RECONCILIATION_SPEC.md §4`'s *"a bank line needing
settlements"* yields the empty candidate set, and that such a target reaches
`EXCEPTION` by `§9`'s *"no admissible candidate exists at all"*, with class `E03`.
That consequence is disclosed at `PREREGISTRATION.md §10` V18 and is **not**
compensated here.

---

## 12. `Evidence`

```ts
interface Evidence {
  evidence_id: EvidenceId;
  obs_ids: ObservationId[];
  kind: "exact_id_match" | "utr_match" | "utr_prefix_match" | "amount_identity"
      | "arithmetic_identity" | "temporal_window" | "method_agreement"
      | "order_ref_similarity" | "probe_result" | "llm_narration_parse";
  strength: "hard" | "soft";       // hard = a filter, soft = a score contribution
  detail: object;                  // kind-specific, schema per kind
  produced_by: "deterministic" | "llm";
  llm_call_id: LlmCallId | null;
}
```

`strength: "hard"` evidence acts as a **filter** — it can only remove candidates,
never rank them. `soft` evidence can only rank, never admit. Keeping these
mechanically distinct is what stops a persuasive-but-wrong signal from
manufacturing a match.

**`detail` for `kind: "probe_result"` `[ASSAY-MODEL]`, supplied at spec 1.4.12,
register row M26.** `detail` is typed `object` above and annotated *"kind-specific,
schema per kind"*, and **no schema was supplied for any of the ten kinds**. This
amendment supplies the one kind whose consumers are already named in frozen text.
The other nine are untouched and remain undefined; `Evidence` itself is
deliberately **not** implemented, because declaring it would force nine invented
detail schemas.

```
  ProbeResultDetail = discriminated union on `probe`, exactly five variants,
                      matching RECONCILIATION_SPEC.md §6.2's closed enum

  { probe: "fetch_order",            order_id,      receipt: string | null }
  { probe: "fetch_payment",          payment_id,    method: PaymentMethod | null }
  { probe: "fetch_refund",           refund_id,     payment_id: PaymentId | null }
  { probe: "fetch_settlement_recon", settlement_id, constituent_entity_ids: string[] }
  { probe: "widen_temporal_window",  days: integer > 0 }
```

**Every field is required by a named frozen consumer, and nothing else is
present.** `receipt` by `SE2`; `method` by `SE4`; the result `payment_id` by
`C2`'s referential half and `E10_REFUND_ORPHAN`; `constituent_entity_ids` by
`SE5`; `days` by `C4`. The **argument** ids — `order_id`, `payment_id`,
`refund_id`, `settlement_id` — are required by `I6`, through
`DECISION_BRIEF.md §L.1` rule 8: *"Every **LLM-referenced** entity ID must exist
in the observation set (invariant `I6`), independently of any allowlist check."*
`R3` proposes the probe, so its argument **is** an LLM-referenced entity id, and
`obs_ids` above carries **observation** ids rather than entity ids — so the id is
not recoverable from the evidence record by any other route.

**`null` on a result field means the probe ran and the referent yielded
nothing**, not that the probe was skipped. `§6.2` hedges every effect — *"**may**
supply `receipt`"*, *"**may** resolve a refund's parent payment"* — and
`ARCHITECTURE.md §5`'s worked probe returns *"still no discriminator"*, so
ran-but-empty is a state the specification already contemplates. A probe that
never ran produces no `Evidence` row at all. An empty
`constituent_entity_ids` is likewise a result rather than an error.

**`date` is deliberately absent, and this is the one ratified choice here.**
`§6.2` names it as a probe **argument** — `fetch_settlement_recon(settlement_id,
date)` — and **no frozen rule reads it back out of `detail`**; every
*"date-scoped"* statement in this specification describes the recon **report** or
the endpoint, not a result field. `§22.1` D11 documents that endpoint as
requiring `year` + `month` with an optional `day`, which is the shape of a
**query**, and no document states an ASSAY representation for it as a value.
Recording the call belongs to the `PROBE` `LedgerEvent`, which `§16` gives
`subject_ids` and an `inputs_hash` defined as *"hash of everything the step
read"*. Carrying it here would require inventing a date type for a field nothing
consumes.

**`days` carries no upper bound here, and that is a disclosure rather than an
omission.** `THREAT_MODEL.md §T7` states that `widen_temporal_window` *"has a
hard bound and its use is recorded on the decision"*, but **no document states
the number** and `PREREGISTRATION.md §7`'s frozen block carries none. Bounding it
in this schema would invent a frozen constant; enforcing `§T7`'s promise belongs
to whichever stage relaxes `C4`, once the figure is ratified.

**`R3` may not propose `widen_temporal_window`, recorded at spec 1.4.25
`[ASSAY-MODEL]`, register row M40 — and nothing in this section changes.** The
variant above stays in the five-member union, `days` keeps `integer > 0` with no
ceiling, and no constant is supplied. What is settled is a different question, which
`RECONCILIATION_SPEC.md §6.2`, `THREAT_MODEL.md §T7` and register row M33 all left
open: **whether `R3` may propose the probe at all.** It may not.
`DECISION_BRIEF.md §L.1` rule 2 — *"No LLM output schema may contain a numeric
field"* — is listed among *"invariants that may never be violated"*, is **unchanged
and unweakened**, and is enforced twice (`ARCHITECTURE.md §4` boundary 2's schema
check, plus the CI lint). A settled invariant governs an unsettled question, so the
unsettled question resolves in the only direction that preserves it.

**Two alternatives were tested against frozen text and both fail.** Emitting `days`
as a **string numeral** satisfies the letter of rule 2 and defeats its stated
mechanism: `ARCHITECTURE.md §4` boundary 2 says *"where a quantity is needed, the
model returns an **identifier** and deterministic code **looks up** the value"*, and
a numeral a caller parses is not an identifier and is looked up in nothing. Emitting
a **symbolic token** that deterministic code maps to a number is boundary 2's own
mechanism and fails on the table rather than the shape: the mapping's values exist in
no document — this section, `RECONCILIATION_SPEC.md §6.2` and `THREAT_MODEL.md §T7`
have each declined to supply one — and the single figure frozen text does derive,
M33's *"the widening required for completeness is **zero days**"*, is excluded by
this schema's own `integer > 0`. Amending rule 2 was not viable: it would weaken a
trust boundary to admit a probe M33 already reports as **expected-non-binding** on
this population and whose result spec 1.4.15 bars from feeding `SE5`.

**The probe is not deleted and the enum is not narrowed.** `ProbeResultDetail` keeps
five variants, `RECONCILIATION_SPEC.md §6.2` keeps five probes and
`THREAT_MODEL.md §T7`'s *"closed enum of five read-only operations"* is unchanged.
The executor's enum and the set of actions **one proposer** may name are different
sets, and only the second is decided here. `§T7`'s numeric hard bound **remains
unspecified**; this ratification makes it unreachable through `R3` rather than
supplying it.

**The two identifier namespaces, and the relation between them `[ASSAY-MODEL]`,
supplied at spec 1.4.14, register row M28.** They are distinct, and a rule that
compared them directly would always find the empty set:

```
  constituent_entity_ids   ENTITY ids, on §6's grammar: pay_… | rfnd_… | adj_…
                           Typed `string[]` above, as `ReconLine.entity_id`
                           itself is.

  Candidate.member_obs_ids (§11) OBSERVATION ids -- `ObservationId`, obs_…
```

**The relation.** For each returned `entity_id`, the corresponding observation is
the one whose `payload.entity_id` equals that `entity_id`; its `obs_id` is the
`ObservationId` that may appear in `Candidate.member_obs_ids`. The relation runs
through the observation set and through nothing else — neither id is derivable
from the other by transformation.

**It is one-to-one on a conforming dataset, and that is derived rather than
assumed.** `PREREGISTRATION.md §4.3`'s operator table carries exactly one
duplication operator, `DUPLICATE_ROW`, and its parameter row scopes it to
*"share of **`bank_line`**"*; `§4.1`'s composition credits `F04` with
*"`round_half_up(0.10 × B)` = 3 extra **`bank_line`** rows"*. **No operator emits
a `recon_line` twice**, so no `entity_id` maps to two observations.

**It is PARTIAL, and this is not an edge case.** `§4.2`'s `F05` *"withholds one
constituent `recon_line` at emission"* while the settlement itself is emitted, so
`fetch_settlement_recon` — which queries the PG's own date-scoped recon report
(`RECONCILIATION_SPEC.md §6.2`, `§22.1` D10) rather than the observation set — may
return an `entity_id` for which **no observation exists**. The relation is
therefore a partial function from returned entity ids to observation ids, and the
gap is a designed property of the benchmark rather than a defect.

**The source is named at spec 1.4.22, register row M36.** This section's *"rather
than the observation set"* has denoted a source **class** since spec 1.4.14 and no
document named a file; `RECONCILIATION_SPEC.md §6.2` now does —
`bench/<split>/recon_report.jsonl`, carrying `settlement_id`, `entity_id` and
`settled_at`. The partiality this section derived is therefore **exercisable
rather than hypothetical**, and the spec-1.4.16 rule for a returned id with no
observation — excluded from `R*` entirely, neither numerator nor denominator — is
**unchanged and now reachable**. Nothing above is edited: the relation, its
one-to-one property on a conforming dataset, and its partiality all stand exactly
as spec 1.4.14 committed them.

**Any rule that compares the two namespaces must state what it does with a
returned `entity_id` that has no observation.** This section establishes the
relation and stops there: it does not say whether such an id is skipped, counted
against a candidate, or excluded from a denominator, because that choice belongs
to whichever rule performs the comparison and is outcome-bearing there.

**What this does not decide — and, from spec 1.4.17, what has since been decided
elsewhere.** `SE5`'s scope, its scoring function, its multi-probe and member
aggregation, and whether one probe result may feed two signals were all **open** at
spec 1.4.12 and **remained open at spec 1.4.14**; in particular this section decided
**nothing** about whether an unobserved constituent counts in an `SE5` denominator,
whether `SE5` normalises by the returned set, by the candidate's members or by their
union, or whether `SE5` reads `fetch_settlement_recon` exclusively. **That record
stands as written, and the questions were settled afterwards in
`RECONCILIATION_SPEC.md §4.2` rather than here:**

```
  scope                      settled at spec 1.4.15 (M29)
                             -- fetch_settlement_recon results only

  F05 treatment              settled at spec 1.4.16 (M30)
                             -- a returned id with no observation is excluded
                                from R* entirely, neither numerator nor
                                denominator

  normalisation / scoring    settled at spec 1.4.16 (M30)
                             -- SE5 = |R* ∩ M| / |R* ∪ M| over the union, with
                                0 when the union is empty

  member aggregation         does not arise -- the formula is set-level, so
                             there is no separate per-member step to aggregate

  multi-probe combination    settled at spec 1.4.17 (M31)
                             -- R is the UNION of every fetch_settlement_recon
                                result carrying that settlement_id; date
                                argument and probe order are irrelevant

  double-counting            dormant, not settled -- no other signal consumes
                             fetch_settlement_recon at the ratified scope
```

**Every `SE5` question this section raised is now settled elsewhere.** Only the
double-counting entry stays dormant, and it is not `SE5`'s to answer while the scope
names one probe no other signal consumes. This section is still the schema `SE5`
reads *from* and still defines none of `SE5`'s arithmetic itself; what changed is
that the arithmetic now exists to point at. `SE1`, `SE3` and `SE4`
are untouched, as are `C1`–`C8` and every `§7` threshold.

---

## 13. `Decision` and `AmbiguityCertificate`

```ts
// Per-observation terminal state. Every observation reaches exactly one.
type ObservationState = "RECONCILED" | "EXCEPTION" | "ABSTAINED" | "REFERENCE";

// Per-decision outcome. A `REFERENCE` observation produces no Decision at all,
// so `REFERENCE` is deliberately NOT a member of this union.
type DecisionType = "RECONCILED" | "EXCEPTION" | "ABSTAINED";

// The S5 validation-gate invariants of `RECONCILIATION_SPEC.md §7`. Corrected
// at spec 1.4.9 -- see below. DISTINCT from `ConstraintId` (`C1`-`C8`), which
// is the hard-constraint set of `RECONCILIATION_SPEC.md §4.1`.
type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7" | "I8" | "I9";

interface Decision {
  decision_id: DecisionId;
  run_id: RunId;
  comp_id: ComponentId;
  type: DecisionType;
  chosen_candidate_id: CandidateId | null;   // null when ABSTAINED
  uniqueness: "UNIQUE" | "DISCRIMINATED" | "IMMATERIALLY_AMBIGUOUS"
            | "AMBIGUOUS" | "INTRACTABLE";
  invariants_checked: InvariantId[];
  invariants_failed: InvariantId[];
  certificate: AmbiguityCertificate | null;
  financial_impact: Array<{ account: AccountCode; delta_paise: Paise }>;
  explanation: string;             // R4 output, or template if rejected
  explanation_source: "llm_grounded" | "template";
  decided_at: UnixSeconds;
  decided_by: { engine_commit: string; model_id: string | null };
}

interface AmbiguityCertificate {
  comp_id: ComponentId;
  solution_a: { candidate_id: CandidateId; member_obs_ids: ObservationId[] };
  solution_b: { candidate_id: CandidateId; member_obs_ids: ObservationId[] };
  // Proof that no HARD evidence separates them: identical satisfaction vectors.
  shared_hard_constraints: ConstraintId[];
  evidence_score_gap_bps: number;  // integer |score_a − score_b| in basis points,
                                   // 0..10_000; strictly below epsilon_bps
  materiality_paise: Paise;        // max |balance_a − balance_b| over accounts
  epsilon_bps: number;             // the pre-registered margin in force,
                                   // 1500 bps == 0.15
  tau_paise: Paise;                // the pre-registered materiality threshold
  probes_attempted: ProbeId[];     // what we tried before giving up
  reason: "EVIDENCE_TIE" | "SEARCH_BOUND_EXCEEDED" | "PROBE_BUDGET_EXHAUSTED"
        | "NO_USEFUL_PROBE_AVAILABLE";   // fourth and final member, spec 1.4.25
}
```

**`NO_USEFUL_PROBE_AVAILABLE` was added at spec 1.4.25 `[ASSAY-MODEL]`, register
row M40.** It is the **fourth and final** member of this union and it closes
`RECONCILIATION_SPEC.md §6`'s `A2` middle case, which spec 1.4.23 surfaced and
expressly declined to fill: *"No new terminal reason is invented for a loop that
stopped on `NO_USEFUL_PROBE` with budget remaining; that gap is `§6`'s and remains
open."* This amendment is the one that made the state reachable, so it is the one
that closes it. The complete mapping, and it is total over `attempts`:

```
  attempts == 0                    EVIDENCE_TIE
  attempts == P_max                PROBE_BUDGET_EXHAUSTED
  0 < attempts < P_max, and the    NO_USEFUL_PROBE_AVAILABLE
    loop terminated because no
    usable probe remained
  component exceeded K_max         SEARCH_BOUND_EXCEEDED   (unchanged; §4.3)
```

**Why the state is reachable and was not before.** `ARCHITECTURE.md §6` gives `R3`
the output *"one call from a closed enum with allowlisted arguments, or
`NO_USEFUL_PROBE`"*, so a proposer may decline **after** spending one or two probes;
`PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy returns `NO_USEFUL_PROBE` when no
priority entry has a constructible argument, so the control arm reaches the same
state; and spec 1.4.25's `N1` convention terminates the loop on a rejected
well-formed proposal without spending budget. Through spec 1.4.24 no proposer
existed, `attempts` was always `0`, and the middle interval was empty.

**Three properties are preserved, not merely unaffected.** The certificate is
emitted **iff** the decision is `ABSTAINED`, exactly as before — this adds a value,
never an emission condition. The hashed event body is unchanged in shape: `reason`
already entered it through `certificate`, and `§16`'s `body` projection and genesis
are untouched, so no digest definition moves. And **no fourth unrelated terminal
reason is added**: `SEARCH_BOUND_EXCEEDED` keeps its `§4.3` meaning, the other two
keep theirs, and nothing is re-pointed.

**Not a metric input.** No metric on `PREREGISTRATION.md §8`'s frozen list of 28
reads `AmbiguityCertificate.reason`. `metric 13` and `metric 14` are computed from
journal lines and gate outcomes; `metric 4` reads the oracle's labels against
abstention **occurrence**, not its stated reason.

The certificate is the product. It is the difference between "confidence 0.62"
and "here is the specific alternative I could not rule out, here is the ₹ at
stake, and here is what I tried."

**`invariants_checked` / `invariants_failed` carry `I1`–`I9`, corrected at spec
1.4.9 `[ASSAY-MODEL]`, register row M23.** Through spec 1.4.8 both fields were
typed `ConstraintId[]`, and that typing **conflicted with the only stage that
populates them**:

```
  what §13 declared   invariants_checked: ConstraintId[]
                      invariants_failed:  ConstraintId[]
                      ConstraintId is C1..C8 -- the HARD CONSTRAINTS of
                      RECONCILIATION_SPEC.md §4.1, evaluated at stage S2.

  what fills them     RECONCILIATION_SPEC.md §7's S5 validation gate, whose
                      table is I1..I9: "any invariant failure rejects the
                      allocation ... The rejected allocation becomes an
                      exception carrying `invariants_failed`."

  who reads them      gate G5 (§10.1): "No allocation with a non-empty
                      `invariants_failed` was posted", and ARCHITECTURE.md §4
                      boundary 3, which puts both fields on `ValidatedDecision`
                      because "G5 is unverifiable unless the validated artifact
                      carries the result" -- the result of S5, which is I1..I9.
```

`I1`–`I9` are not `ConstraintId`s and **no document declared a type for them**,
so the fields could not express the values the specification requires them to
hold. Under the old typing `S5` could record *that* validation failed but never
*which* invariant failed, and `Exception.invariants_failed` would name a hard
constraint for a gate that never evaluates one.

**The correction is the typing, not the gate.** `InvariantId` is declared above
as exactly `I1`–`I9`, matching `§7`'s table row for row, and both fields are
retyped to it. `ConstraintId` is **unchanged and remains exactly `C1`–`C8`**; the
two vocabularies are deliberately distinct and neither is a subset of the other.
`RECONCILIATION_SPEC.md §7`'s invariants, `§4.1`'s constraints, `§10.1`'s gates
and `ARCHITECTURE.md §4`'s field list are all untouched — this states which of
two already-frozen vocabularies the fields were always drawing from.

**Nothing observable moves.** No benchmark population parameter, seed, split,
family, `target_record_count`, rate, threshold, metric definition or stopping
rule changes; `C1`–`C8` and `constraint_set_hash` are untouched, because
`ConstraintId` is unchanged and the constraint declaration does not carry these
fields; and no generated data exists or would differ. See
`DECISION_BRIEF.md §A.16`.

---

## 14. `Exception`

```ts
interface Exception {
  exc_id: ExceptionId;
  run_id: RunId;
  decision_id: DecisionId;
  class: ExceptionClass;           // the 14-member closed taxonomy, §15
  severity: "material" | "immaterial";  // by tau
  value_paise: Paise;              // = value(observation), §14.1
  owner_role: "analyst" | "controller" | "engineering" | "pg_support";
  analyst_question: string;        // R2 output: what a human must determine
  suggested_probe: string | null;
  status: "open" | "resolved" | "written_off";
  resolved_by: string | null;
  resolution_note: string | null;
}
```

An exception with no `owner_role` and no `analyst_question` is not an exception,
it is a shrug. The track bar asks for an *honest exception list*; honest means
actionable.

### 14.1 `value(observation)` — the rupee figure an unresolved item carries `[ASSAY-MODEL]`

`Exception.value_paise`, `CloseReport.value_abstained_paise`,
`value_exceptions_paise`, `exceptions_by_class` and gate `G3`'s right-hand side
all read the rupee value of an observation, and through spec 1.3.0 **no document
stated how it was derived for any kind.** It is stated here. One rule per
reconcilable kind, all integer paise, all read from fields the observation
already carries:

| `kind` | `value(observation)` | Why this field |
|---|---|---|
| `recon_line` (`payment`) | `payload.amount` | The gross the `P1` receivable was recognised at, so relieving it takes the same figure. It is also `batch_value_paise`'s summand (`EVALUATION_SPEC.md §4.1`), which keeps the close ratio's numerator and denominator commensurable on this kind |
| `recon_line` (`refund`) | `payload.amount` | `I3` fixes `debit = amount` on a refund row, so the two agree by construction |
| `adjustment` | `M` — the non-zero one of `debit`/`credit` | **Not `amount`.** `I3` declares no `amount` identity for adjustment rows and §17.2 leaves the field deliberately unconstrained on them; `M` is what `P8` posts and what `I4`/`C6` move a settlement by. Using `amount` here would put a number in `unresolved_value_paise` that the ledger never posted and break `G3` on every adjustment |
| `bank_line` | `payload.amount` | The credit that actually arrived |
| `settlement` | `payload.amount` | `I4` closes a settlement at exactly this figure |
| `ledger_entry` | `payload.gross_paise` | The only gross figure the entity carries; `expected_net_paise` is the merchant's *guess* and is nullable |
| `dispute` | `payload.amount` | The documented deduction amount |

Reference kinds (`payment`, `order`) have no value under this definition: §10.1
gives them no terminal state that carries one, and they *"contribute to no
unresolved value"*.

**`value(observation)` is a queue-side quantity.** It is recorded on the
`Decision` or `Exception` record. Gate `G3` compares it against the **books** —
the Suspense journal lines — which is what makes the identity a cross-check
between two independently maintained stores rather than a restatement of one
(`RECONCILIATION_SPEC.md §10.1`, `THREAT_MODEL.md §T8`).

---

## 15. `ExceptionClass` — closed taxonomy

Fourteen classes. Closed set; `classify_exception` cannot emit anything else.

| Code | Meaning |
|---|---|
| `E01_MISSING_CAPTURE` | Settled at the PG but no capture record exists |
| `E02_MISSING_SETTLEMENT` | Captured and past the settlement window, never settled |
| `E03_BANK_CREDIT_UNMATCHED` | Bank credit maps to no known settlement |
| `E04_SETTLEMENT_NOT_IN_BANK` | Settlement marked processed, no bank credit |
| `E05_AMOUNT_MISMATCH` | Tie-out fails by a non-zero delta |
| `E06_FEE_MISMATCH` | `credit ≠ amount − fee` (recall `fee` is GST-inclusive, §6) |
| `E07_GST_MISMATCH` | `tax ≠ round_half_up(0.18 × (fee − tax))` within rounding tolerance |
| `E08_DUPLICATE_OBSERVATION` | Same entity observed twice from one source |
| `E09_DUPLICATE_BANK_CREDIT` | Same UTR credited twice |
| `E10_REFUND_ORPHAN` | Refund references a payment not in the dataset |
| `E11_TIMING_BOUNDARY` | Event falls outside the period — or a `recon_line` with `type === "refund"` that is in period and carries no settlement, because the settlement that would relieve it falls outside the period (`PREREGISTRATION.md §4.2`); deferred, not an error |
| `E12_ADJUSTMENT_UNEXPLAINED` | Adjustment with no traceable cause |
| `E13_LEDGER_ONLY` | Merchant booked an entry with no PG counterpart |
| `E14_UTR_COLLISION` | Multiple settlements share a UTR prefix after truncation |

`E11` is deliberately *not* an error class — timing differences are the most
common false positive in real reconciliation, and calling them errors is how
recon tools lose analyst trust.

**The refund clause is a semantic addition at spec 1.4.2, not a clarification
`[ASSAY-MODEL]`.** Through spec 1.4.1 `E11` fired only where an observation's
**own** membership clock lay outside the period, and it still does:
`PREREGISTRATION.md §4.2` defines membership as *"IN PERIOD iff the observation's
OWN clock lies in `[from, to]`"*, and `F09`'s late `settlement` and `bank_line`
rows carry out-of-period clocks of their own, so the original trigger is
unchanged and remains reachable. The clause is added because `§4.2`'s
batch-composition rule leaves a refund **in** period whose settlement is not
assignable within it, and `§14` types `Exception.class` as one of the fourteen
with no null admitted — so a class must be assigned and no other member of the
closed set fits.

**It is confined to refund recon lines, and the boundary is load-bearing.** An
unsettled *capture* remains `E02`, whose `P6` relieves the
`1100_GATEWAY_RECEIVABLE` that `P1` recognised. A refund recognised a
`2200_REFUND_LIABILITY` under `P3`, which neither `P5` nor `P6` can touch, so the
correct posting is none and only a non-posting class fits — which is why `E02`
cannot simply be stretched across. Widening the clause beyond refund recon lines
would move `F06`'s unsettled capture out of Suspense and change metrics 12, 13
and 14 and gate `G3`. **`E11` becomes exercisable on DEV data through `F02`**,
whose *"settled in batch N+2"* mechanism strands a refund raised in the final two
days of the period; `PREREGISTRATION.md §10` V14 records the consequence.

---

## 16. `LedgerEvent` — the hash-chained audit trail

```ts
interface LedgerEvent {
  seq: number;                     // strictly increasing, gapless, per run
  evt_id: EventId;
  run_id: RunId;
  ts: UnixSeconds;
  prev_hash: Sha256;               // seq 0 uses the run's genesis hash
  hash: Sha256;                    // sha256(canonical_json(body) || prev_hash);
                                   // `body` is defined normatively below
  actor: {
    type: "deterministic" | "llm" | "human";
    component: string;             // "engine.s5_validate"
    engine_commit: string;
    llm_provider: LlmProviderId | null;  // see §19 for the type
    model_id: string | null;             // "rules-v1" for the offline provider
    prompt_hash: Sha256 | null;
    llm_call_id: LlmCallId | null;
  };
  kind: "INGEST" | "ANCHOR" | "CANDIDATE" | "PROBE" | "RECONCILE"
      | "ABSTAIN" | "EXCEPTION" | "RESOLVE" | "CLOSE";
  subject_ids: string[];
  evidence_ids: EvidenceId[];
  decision_id: DecisionId | null;
  inputs_hash: Sha256;             // hash of everything the step read
  journal_lines: JournalLine[];    // may be empty for non-posting events
  certificate: AmbiguityCertificate | null;
}

interface JournalLine {
  account: AccountCode;
  dr_paise: Paise;                 // exactly one of dr/cr is non-zero
  cr_paise: Paise;
  memo_ref: string;                // reference only, never free text from input
  source_entity_id: string;        // pay_… | rfnd_… | adj_… | setl_… | bnk_…
                                   // the JOIN KEY, and the Suspense item key
                                   // (§10.1 G3). Added at spec 1.4.0 — see below
}
```

**`source_entity_id`, added at spec 1.4.0 `[ASSAY-MODEL]`.** `true_journal` (§1)
was given this field as *"the JOIN KEY for covered-set projection"* at spec
1.3.0 and the agent side received no counterpart, which left
`RECONCILIATION_SPEC.md §10.1`'s gate `G3` — `Σᵢ |item_net_paise(i)|` over *"each
open Suspense item `i`"* — quantifying over a partition no field defined. The
field is the counterpart, named identically so that the two journals join
structure to structure.

It carries **the identifier of the observation whose obligation the posting
records**: the allocation target for an abstention, the excepted observation for
an exception, and the recon line itself for `P1`–`P4`. It is a business
identifier drawn from the observation set, never an ASSAY-internal handle, so a
reviewer holding only the run artifact can verify `G3` — the standard §20 already
sets for `period_status`. It is required and non-null on **every** journal line,
including the counter-leg, so that an item can be read whole.

**An open Suspense item is defined arithmetically, and needs no status field.**
For key *k*, `item_net_paise(k) = Σ dr(k, 9000_SUSPENSE) − Σ cr(k, 9000_SUSPENSE)`
over the whole event log. A `P7` resolution reverses the opening posting under
the **same** key, so a resolved item nets to zero and leaves `Σ |item_net_paise|`
by arithmetic rather than by a flag someone must remember to set. *Open* means
`item_net_paise(k) ≠ 0`. Two genuinely open items cannot cancel each other,
because one key is one obligation; offsetting suppression across *different*
keys is what the gross form catches, and it still does.

**This changes every event digest and reopens nothing.** `source_entity_id`
enters `body` only because `journal_lines` already enters `body` whole, so §16's
`body` **projection** and the genesis definition are textually unchanged and
`DECISION_BRIEF.md §A.5` B2 is not reopened. No run has been executed and no root
hash has been published, so no committed digest is invalidated. The field is
derived from the observation set by a canonical traversal and is subject to the
deterministic-identifier rule below.

**The hashed `body`.** `body` is the following projection of `LedgerEvent`, and
nothing else:

```
  body = { seq, kind, actor, subject_ids, evidence_ids,
           decision_id, inputs_hash, journal_lines, certificate }
```

Serialized as canonical JSON (§0 rule 5), with `subject_ids` and `evidence_ids`
in the order the emitting stage produced them — that order is itself
deterministic, see below. Excluded and therefore **not** covered by the chain:
`evt_id`, `run_id`, `prev_hash`, `hash`, and `ts`. Each exclusion has a reason:
`prev_hash` is concatenated after the digest rather than included in it; `hash`
cannot cover itself; and `evt_id`, `run_id` and `ts` all vary between two
executions over identical inputs, which metric 23 (`determinism_check`) requires
to produce identical root hashes. `actor` is included **in full** — it contains no
wall-clock field, so no exclusion is needed there.

**Genesis hash** = `sha256(canonical_json({dataset_hash, engine_commit,
config_hash}))`. This binds the chain to the exact inputs, so a report cannot be
attached to a different dataset after the fact. `run_id` and `started_at` were
part of genesis in spec 1.1.1 and are removed: both vary per execution, so
including them made two runs over identical inputs produce different root hashes
by construction and made metric 23 unsatisfiable. `run_id` remains a free
per-execution handle recorded on `Run` (§20) and on every event, outside the
hashed content — which is what allows two runs over identical inputs to coexist,
be addressed separately under `runs/<run_id>/`, and be compared.

**Deterministic internal identifiers.** `subject_ids`, `evidence_ids` and
`decision_id` enter `body`, so ASSAY-internal identifiers (`obs_`, `cand_`,
`comp_`, `dec_`, `exc_`) must be assigned deterministically: each is derived from
a canonical traversal of the input in a fixed order, never from a counter seeded
by wall-clock time, process ID, iteration order over an unordered collection, or
any other source that can differ between two executions over identical input.
`evt_id` is excluded from `body` and is unconstrained by this rule.
`JournalLine.source_entity_id` is **not** an ASSAY-internal identifier — it is
copied from the observation set — but it enters `body` and is therefore bound by
the same requirement: the observation it names is selected by a rule
(§17.1.1's trigger table), never by iteration order over an unordered
collection.

**Declared residual (`THREAT_MODEL.md §T10`).** Because `ts` is outside `body`,
altering an event's timestamp does not break the chain. Timestamp alteration is
therefore **not chain-detectable**. This is an accepted cost of reproducibility:
`ts` cannot be both wall-clock-accurate and identical across two runs, and the
value of a verifiable root hash exceeds the value of tamper-evidence on a field
that no gate, metric or invariant reads.

The `actor` block is what lets a reviewer answer "was a model involved in this
decision, and which one?" without reading prose. For any `RECONCILE` event,
`actor.type` is always `deterministic` — by construction.

---

## 17. Control accounts

```ts
type AccountCode =
  | "1100_GATEWAY_RECEIVABLE"   // captured at PG, not yet in bank
  | "1200_BANK"                 // actual bank credits
  | "1300_GST_INPUT_CREDIT"     // GST paid on gateway fees, recoverable
  | "2200_REFUND_LIABILITY"     // refunds owed / in flight
  | "4000_REVENUE"              // gross sales
  | "5100_PG_FEE_EXPENSE"       // gateway fees ex-GST
  | "9000_SUSPENSE_UNRECONCILED"; // everything ASSAY refuses to guess
```

**The fee posting split `[ASSAY-MODEL]`.** Because the observed `fee` is
GST-inclusive (§6), a settled payment line posts the fee in two parts:
`5100_PG_FEE_EXPENSE` receives `fee − tax` and `1300_GST_INPUT_CREDIT` receives
`tax`. The rupee amounts are identical to spec 1.1.0 — only their derivation from
the observed fields changes. Razorpay documents the fee and its GST component; it
documents nothing about how a merchant books them, so the account mapping is
ASSAY's.

**Invariant I1 (trial balance):** at every point in the event log,
`Σ dr_paise === Σ cr_paise` across all journal lines. Checked continuously during
the run and again as close gate **G2**; failure ends the period `BLOCKED` and no
close report is emitted (`RECONCILIATION_SPEC.md §10`).

**`9000_SUSPENSE_UNRECONCILED` is the honesty account.** Every abstention and
every unresolved exception posts here. Its closing balance is the single number
that says how much of the period ASSAY did not resolve. A system that reports
"100% matched" has a zero Suspense balance and no way to prove it earned one.

### 17.1 Balance sign convention and posting table `[ASSAY-MODEL]`

**Convention.** For every account,

```
  balance(acct) = Σ dr_paise(acct) − Σ cr_paise(acct)
```

computed by projection over the event log, in integer paise, with no per-account
adjustment. Liability, revenue and credit-balance accounts therefore carry
negative balances, and that is correct rather than an error to be corrected at
render.

**Why this convention and not the accounting-normal-balance alternative.**
`AccountCode` above is a bare string union. It carries **no account-class
metadata** — nothing in this data model says which accounts are assets and which
are liabilities — so a normal-balance convention is not computable from the
specified schema. Only `Σdr − Σcr` and `Σcr − Σdr` are. Between those two,
`EVALUATION_SPEC.md §4.4` decides: `balance_harm_inr` is the absolute deviation
from truth per account, and it must charge zero harm for a rupee correctly parked
in Suspense. That requires the known leg of an abstained item to post in its true
economic direction. Under `Σdr − Σcr` with the table below, an abstained
₹1,00,000 bank credit leaves `1200_BANK` at +₹1,00,000, matching truth, and harm
on that account is zero. Under the inverted posting it would read −₹1,00,000
against a truth of +₹1,00,000 — ₹2,00,000 of phantom harm on one account, charged
only to agents that abstain, which reintroduces exactly the confound §4.4 exists
to remove.

**Posting table.** All amounts are integer paise. `fee` is GST-inclusive and
`tax` is the GST component inside it (§6), so `fee_ex_gst = fee − tax`.

| # | Event | Debit | Credit |
|---|---|---|---|
| P1 | Payment captured at the gateway | `1100_GATEWAY_RECEIVABLE` `amount` | `4000_REVENUE` `amount` |
| P2 | Settlement reconciled to a bank credit | `1200_BANK` `credit`; `5100_PG_FEE_EXPENSE` `fee − tax`; `1300_GST_INPUT_CREDIT` `tax` | `1100_GATEWAY_RECEIVABLE` `amount` |
| P3 | Refund initiated | `4000_REVENUE` `refund_amount` | `2200_REFUND_LIABILITY` `refund_amount` |
| P4 | Refund settled out of the bank | `2200_REFUND_LIABILITY` `refund_amount` | `1200_BANK` `refund_amount` |
| P5 | Abstention or open exception on an **inbound** item — value has arrived in the bank and cannot be attributed (canonically `E03`) | `1200_BANK` `amount` | `9000_SUSPENSE_UNRECONCILED` `amount` |
| P6 | Abstention or open exception on an **outbound** item — an obligation recognised at the gateway whose disposition is unknown (canonically `E04`) | `9000_SUSPENSE_UNRECONCILED` `amount` | `1100_GATEWAY_RECEIVABLE` `amount` |
| P7 | Resolution of a Suspense item | exact reversal of P5 or P6 under the **same** `source_entity_id`, followed by the correct posting, as **new events** | — |

P2 balances by construction: `credit + (fee − tax) + tax = amount − fee + fee =
amount`.

**`P5` and `P6` are selected by the direction of the item, not by its exception
class.** The class in each row is the canonical instance, not the trigger. The
specification already relies on this: `RECONCILIATION_SPEC.md §11` applies `P6`
to an abstention that is not `E04`, and `§8` holds the later of two duplicate
bank credits *"in Suspense rather than netted"*, which is `P5`'s shape on `E09`.
The trigger table below states the rule the two rows were always being read
under.

### 17.1.1 Posting triggers `[ASSAY-MODEL]`

Through spec 1.3.0 §17.1's table was keyed by prose descriptions of economic
events and **nothing mapped `Observation.kind`, terminal state or
`ExceptionClass` onto it.** Three of the fourteen exception classes had an
enumerated posting and eleven had none, while `RECONCILIATION_SPEC.md §9`
required every `EXCEPTION` to post. `P1`–`P4` had no observation trigger at all.
The table below is that mapping. **It adds no account and no posting rule** — it
selects among `P1`–`P8`, which are unchanged.

**Reconciled and unconditional path.**

| Observation | Trigger | Posting |
|---|---|---|
| `recon_line`, `type === "payment"` | passes ingest validation | **`P1`** at ingest, on `amount`. A capture is a fact the recon report asserts; it does not wait on ASSAY being able to settle it |
| `recon_line`, `type === "payment"` | the settlement it is allocated to is **itself reconciled to a bank credit through real bank-side evidence** — `AN2` satisfied against an actual `bank_line`, and `I5` therefore defined and satisfied | **`P2`** |
| `recon_line`, `type === "refund"` | passes ingest validation | **`P3`** at ingest, on `amount` |
| `recon_line`, `type === "refund"` | the settlement it is allocated to is **itself reconciled to a bank credit through real bank-side evidence**, as for `P2` above | **`P4`** |
| `settlement`, `bank_line` | reaches `RECONCILED` | **none on the reconciled path** — their unresolved states do post, under `P6` and `P5` respectively; see the Suspense table below. `I4` closes a settlement as the sum of its allocated lines and `I5` makes a bank line a sum of settlements — `EVALUATION_SPEC.md §4.1` states the same thing when it rejects `Σ bank_line.amount` as a denominator because *"`I5` makes bank lines aggregates"*. `P2` already posts the bank leg per line, so a second posting on the aggregate view would double every account it touches |
| `ledger_entry`, `dispute` | **any state, including `ABSTAINED` and `EXCEPTION`** | **none.** `true_journal.source_entity_id` (§1) ranges over `pay_… \| rfnd_… \| adj_… \| setl_… \| bnk_…` and admits no `mle_…` or `disp_…`, so **truth posts no line attributable to either kind**. An agent that posted one would put `proj_agent ≠ proj_truth` on a *correct* decision and charge itself `balance_harm_inr` for it — the confound `EVALUATION_SPEC.md §4.4` exists to remove |
| `refund` | **any state, including `ABSTAINED` and `EXCEPTION`** | **none.** No rule among `P1`–`P8` is constructible over a `Refund` payload: `P1`–`P4` read `ReconLine` fields the entity does not carry, `P5`/`P6` require the observation to be an allocation target and the target universe is settlements and bank lines (`RECONCILIATION_SPEC.md §4`), and `P8` is adjustment observations only (§17.2). The obligation is already posted by the refund's `recon_line` (`type === "refund"`) under `P3` and `P4`; a second posting on the `pg_refunds` view would book one economic event twice, which the `settlement` / `bank_line` row above refuses on the same ground |
| `payment`, `order` | — | **none.** Reference kinds; §10.1 |

**`"the settlement it is allocated to"` is the settlement of the ALLOCATION UNDER
EVALUATION, ratified at spec 1.4.30 `[ASSAY-MODEL]`, register row M49.** For a
**proposed** allocation — the only kind `journal.ts` receives
(`DECISION_BRIEF.md §L.1` rule 4, `ARCHITECTURE.md §4` boundary 3), and the kind
`RECONCILIATION_SPEC.md §6`'s materiality projects — it is the
`Candidate.target_id` under evaluation. For an **accepted** allocation it is the
target of the candidate `S5` validated. It is **not** `ReconLine.settlement_id`:
`AN1` is *"sufficient to reconcile a line to its settlement"* and this table
conditions `P2`/`P4` on `AN2`, **not** on `AN1`, so a member `§3` left unanchored
posts `P2` under the allocation that explains it. `RECONCILIATION_SPEC.md §3`
removes anchored members from the search space, so requiring `AN1` here would make
`§6`'s materiality **identically zero** and `AMBIGUOUS` **unreachable** — which
spec 1.4.21 forecloses. The anti-cross-attachment guarantee is preserved by
comparing the bank evidence's `settlement_id` against the **allocation's target**,
which is what `AN2` attests to.

**This adds no posting rule, no account, no trigger and no exception class.** It
selects among `P1`–`P8`, which are unchanged, and it moves no row of the table
above. `§6`'s materiality formula, `τ`, `ε`, `C1`–`C8`, `SE1`–`SE5`, `I1`–`I9`
and `§13`'s certificate are untouched, so `constraint_set_hash` does not move.
What changes is which of two available readings of one phrase is normative — the
phrase supported both, and neither excluded the other, which is why this is a
**ratification** rather than a derivation.

**The `refund` row is a contradiction repair, added at spec 1.4.2
`[ASSAY-MODEL]`.** §17.2 states that this table is *"total over `Observation.kind`
× terminal state × `ExceptionClass`"*, and through spec 1.4.2 it was not:
`Observation.kind === "refund"` — the `pg_refunds` view of §10 — had no row,
though §10.1 classes it reconcilable. The row above **adds no posting rule, no
account and no exception class**; the non-posting it declares was already forced
by exhaustion over `P1`–`P8`, which is why it repairs the totality claim rather
than deciding anything. Note that §14.1's `value(observation)` table omits the
same kind, so a `refund`-kind observation that reached `EXCEPTION` would carry no
defined `value_paise`; that is recorded rather than resolved here, and the only
class §10.1 attaches to the kind is `E10`, which requires an orphan.

A line that **fails ingest validation posts nothing at all**, in either
direction. `RECONCILIATION_SPEC.md §2` step 2 already states that such a record
*"becomes `E05`/`E06`/`E07` immediately and never enters the candidate space"*,
and §7 makes an invariant failure *"never partially posted, never repaired"*.
Posting the `amount` of a line whose own arithmetic identity fails would assert a
figure the line is an exception *for* failing to substantiate.

**`I5` is undefined — not satisfied — when no bank-line mapping exists, and
`P2`/`P4` require it defined `[ASSAY-MODEL]`.** `I5` reads *"`Σ settlement.amount`
mapped to a bank line `= bank_line.amount`"* (`RECONCILIATION_SPEC.md §7`). With
no mapping there is no right-hand side, so the comparison has no truth value;
`§7` rejects an allocation on *"**any** invariant failure"*, and an invariant with
no truth value has not been satisfied. This is stated because the permissive
reading is available on the literal text and produces exactly the failure `I5`
names in its own purpose column — *"Claiming money arrived that did not."*

The consequence is the trigger stated above. `AN1` is
*"`recon_line.settlement_id === settlement.id`"* on the basis *"Same system, same
identifier"* (`§3`) — a **gateway-internal identity match that carries no
bank-side information**. It is sufficient to reconcile a line to its settlement;
it is not sufficient to debit `1200_BANK`, which §17 types as *"actual bank
credits"* and which `P2`'s own row conditions on a *"Settlement reconciled to a
**bank credit**"*. `DATA_MODEL.md §5` is the documentary basis: *"`status:
"processed"` is not 'money has arrived'"*, which is why
`E04_SETTLEMENT_NOT_IN_BANK` is *"a genuine timing state rather than an error"*.

**This does not depress recon-view coverage.** The line still reaches
`RECONCILED` on `AN1`, so it stays in metric 1's numerator; what waits on bank
evidence is the bank leg, not the terminal state. That preserves
`EVALUATION_SPEC.md §4.1`'s design exactly — *"a run can show 99% recon-view
coverage while the bank statement is largely untied. The bank and ledger views do
not solve that — they **expose** it"* — with metric 27 `coverage_by_value_bank`
carrying the exposure.

**A disclosed residual on `E14_UTR_COLLISION`.** Where a bank credit exists but
its attribution does not (`E14`), the settlement takes `P6` under its own key and
the unattributable `bank_line` takes `P5` under its own key. **One economic event
therefore opens two Suspense items and is counted twice in
`unresolved_value_paise`.** The two obligations are genuinely distinct — a
settlement whose disposition is unknown, and a credit whose attribution is
unknown — and their keys differ, so `G3` holds; but this is a partial
reinstatement of the multi-view counting that the benchmark v1.0.3 universe
amendment removed elsewhere, and it is recorded here rather than netted away.

**Suspense path — every terminal `ABSTAINED` or `EXCEPTION` state.**

**How the two tables compose.** The kind rows above govern the `RECONCILED` path
and, for `ledger_entry`, `dispute`, `payment` and `order`, every state — those
four post nothing whatever their class, and no row below overrides that. Every
other observation in a terminal `ABSTAINED` or `EXCEPTION` state is governed by
the table below. An `adjustment` observation cannot appear as an `ABSTAINED` row
because §17.2 sends every one of them to `EXCEPTION`.

**The target universe is settlements and bank lines, and this table does not
widen it.** `RECONCILIATION_SPEC.md §4` enumerates a target as *"a settlement
needing constituents, or a bank line needing settlements"*; `Candidate.target_id`
(§11) is *"what is being explained (settlement / bank line)"*; and
`PREREGISTRATION.md §8` records as a frozen dependency that the Ambiguity
Oracle's *"targets are settlements and bank lines"*. A `recon_line` is therefore
never a target — it reaches an abstained component as a **member**, and the
non-target row below governs it.

| Class / state | Direction | Posting | `source_entity_id` |
|---|---|---|---|
| `ABSTAINED`, target is a `bank_line` | inbound | **`P5`** | `bnk_…` |
| `ABSTAINED`, target is a `settlement` | outbound | **`P6`** | `setl_…` |
| `ABSTAINED`, observation is a **non-target member** of the abstained component | — | **none.** The obligation is the target's and is carried whole by the target's item; a second posting for each member would relieve `1100_GATEWAY_RECEIVABLE` again for one break. The member is *attached* to that item and reaches its own terminal state, so `G1` still sees it | the **target's** key, carried on no line of its own |
| `E01_MISSING_CAPTURE` | outbound | **`P6`** | `setl_…` — the settlement with no capture behind it (§15) |
| `E02_MISSING_SETTLEMENT` | outbound | **`P6`** | `pay_…` — `P1` recognised the receivable; its disposition is unknown |
| `E03_BANK_CREDIT_UNMATCHED` | inbound | **`P5`** | `bnk_…` |
| `E04_SETTLEMENT_NOT_IN_BANK` | outbound | **`P6`** | `setl_…` |
| `E09_DUPLICATE_BANK_CREDIT` | inbound | **`P5`** | `bnk_…` — the **later** credit, *"held in Suspense rather than netted"* (`RECONCILIATION_SPEC.md §8`) |
| `E12_ADJUSTMENT_UNEXPLAINED` | either, by `M`'s side | **`P8`** | `adj_…` |
| `E14_UTR_COLLISION` | outbound | **`P6`** | `setl_…` — one item per settlement whose credit cannot be attributed |
| `E05_AMOUNT_MISMATCH`, `E06_FEE_MISMATCH`, `E07_GST_MISMATCH` | — | **none** — ingest-invariant failures, above | — |
| `E08_DUPLICATE_OBSERVATION` | — | **none.** A duplicate is not a second economic event. Posting it would book one fact twice, which is the error `E08` exists to detect; the retained copy posts under its own class | — |
| `E10_REFUND_ORPHAN` | — | **none.** An `I6` referential failure — *"every referenced ID exists in the observation set"* — so §7's rejection applies and the line never posts | — |
| `E11_TIMING_BOUNDARY` | — | **none.** §15 is explicit that this is *"deliberately not an error class — timing differences… deferred, not an error"*. The event belongs to the next period. Posting it to Suspense would book a healthy deferral as unresolved value and charge it `C_exception` | — |
| `E13_LEDGER_ONLY` | — | **none.** Neither leg is establishable: `P6` would credit `1100_GATEWAY_RECEIVABLE` and `P5` would debit `1200_BANK`, so **either would let an attacker-controlled ERP row move a PG-side control account** — precisely the attack `THREAT_MODEL.md §T5` exists to prevent. The control that prevents it is *"it can never create a PG-side allocation"*, which is unaffected | — |

**An exception that posts nothing is still an exception.** It carries a class, a
`severity`, an `owner_role` and an `analyst_question`; it appears in
`exceptions_by_class` at its `value(observation)` (§14.1); it is ranked in the
value-ordered queue that metric 19 protects; and it is priced once at
`C_exception` in `net_cost_inr`. What it does not do is open a Suspense item,
because no rule among `P1`–`P8` can post it without asserting a rupee movement
the evidence does not support. It cannot be suppressed either: close gate `G1`
requires every observation to hold exactly one terminal state, with no drop path.

**Seven of the fourteen classes post and seven do not**, and that split is the
honest reading of the evidence rather than a gap: four of the seven silent
classes are records that failed validation or duplicate another record, one is a
deferral the specification refuses to call an error, and two would require a
control account to be moved by an untrusted source.

### 17.2 Adjustment postings: a two-sided model `[ASSAY-MODEL]`

The posting model for adjustments is **two-sided**, and stating that plainly is
the point of this section. Truth posts from omniscience; ASSAY posts from
evidence. They diverge wherever ASSAY cannot determine the treatment, which is
also true of the abstention postings P5 and P6 and has always been true of them.

**Truth side — the five-way branch, retained in full.** The simulation knows
`Adjustment.reason` and `Adjustment.direction` (§9) and books accordingly:

| `reason` | Truth posting |
|---|---|
| `fee_correction` | `direction === "debit"`: `DR 5100_PG_FEE_EXPENSE` / `CR 1200_BANK`. `direction === "credit"`: the reverse |
| `gst_correction` | `direction === "debit"`: `DR 1300_GST_INPUT_CREDIT` / `CR 1200_BANK`. `direction === "credit"`: the reverse |
| `chargeback_debit` | P8 shape — no account among the seven corresponds to a dispute deduction |
| `chargeback_reversal` | P8 shape — as above |
| `manual` | P8 shape — undetermined by construction |

**ASSAY side — P8, for every adjustment.** No documented observable field
distinguishes `fee_correction` from `gst_correction` from `manual`. `reason` lives
only on the true-state `Adjustment` entity, which §10 excludes from the payload
union. `ReconLine` carries no equivalent: it has no `reason`, `I3` declares no
`fee`/`tax` identity for adjustment rows, and `fee` is GST-inclusive with `tax`
the component inside it, so the two are non-zero together on any fee-bearing row
and cannot partition the reasons. **Every adjustment observation therefore takes
P8.**

| # | Event | Debit | Credit |
|---|---|---|---|
| P8 | **Conservative fallback** — any adjustment observation, since its accounting cause is not observable (§10, Scenario C) | Let `M` be the non-zero one of `ReconLine.debit` / `ReconLine.credit`, which `I3` guarantees to exist and be unique for `type === "adjustment"`. If `debit` is the non-zero one: `DR 9000_SUSPENSE_UNRECONCILED` `M` / `CR 1200_BANK` `M`. If `credit` is: `DR 1200_BANK` `M` / `CR 9000_SUSPENSE_UNRECONCILED` `M` | — |

**Why `M` and not `ReconLine.amount`.** `I4` closes a settlement as
`settlement.amount = Σ credit − Σ debit` over its allocated lines, and `C6` ties
out an allocation the same way. The rupees that actually move a settlement are
therefore `debit`/`credit`, and P8 must post the same figure or the ledger would
carry a number the settlement arithmetic does not recognise.
`ReconLine.amount` is **deliberately left unconstrained on adjustment rows**: the
only thing `I3` (§6) says about an adjustment row is that exactly one of
`debit`/`credit` is non-zero — it declares an `amount` identity for payments and
refunds and none for adjustments, no rule in this specification reads `amount` on
an adjustment row, and an out-of-band event that corresponds to no transaction
has no gross to constrain. **No
`amount = debit + credit` identity is asserted.**

**P8 is an exception, not a reconciliation.** An observation posted under P8
reaches the `EXCEPTION` terminal state with class
`E12_ADJUSTMENT_UNEXPLAINED` — *"Adjustment with no traceable cause"* (§15) —
`severity` by τ, an `owner_role`, and an `analyst_question`. It is **never**
reported as `RECONCILED`, never counted in any coverage numerator, and its value
enters `unresolved_value_paise` and gate G3 like any other open exception. The
bank leg posts in its true economic direction, so `1200_BANK` agrees with truth
and contributes no harm.

**Why the boundary is drawn here.** Two options were investigated and rejected.
Exposing `reason` as an observable field would give the engine a construct
Razorpay publishes no counterpart for (§22.2 M9), in a schema whose only claim to
realism is API fidelity — the same objection that removed the invented
`credit_type` values in §6. Deriving `reason` from `fee`/`tax` would repurpose two
`[RZP-DOC]` fields away from their documented meaning and fails arithmetically
besides. Routing every adjustment to Suspense with a named class, an owner and an
analyst question is the honest remaining option, and it is the behaviour this
system exists to exhibit: an out-of-band event that *"corresponds to no
transaction"* (§9) cannot be booked from the evidence, and saying so is the
product working rather than failing.

**No eighth `AccountCode` is added.** The seven control accounts in §17 are
unchanged, so `EVALUATION_SPEC.md §4.4`'s summation universe is unchanged.

**How the two sides are compared.** They are not compared on adjustments at all:
an adjustment reaches `EXCEPTION`, so it is outside the covered set over which
`balance_harm_inr` is computed (`EVALUATION_SPEC.md §4.4`). It is priced once, as
`C_exception` in `net_cost_inr`.

**`P8` applies to adjustment observations and to nothing else `[ASSAY-MODEL]`.**
Spec 1.2.0 through 1.3.0 closed this section with *"any posting not enumerated in
§17.1 or §17.2 falls to P8"*, and `DECISION_BRIEF.md §L.4` made departing from
that fallback a spec amendment. **The universal reading was not constructible**
and is withdrawn at spec 1.4.0. `P8`'s amount `M` is read off
`ReconLine.debit`/`credit` under a guarantee `I3` gives *"for `type ===
"adjustment"`"* only, and it fails three ways outside that domain:

- **No `M` exists.** A `bank_line`, `ledger_entry`, `settlement` or `dispute`
  observation carries no `ReconLine`. `BankStatementLine` has `amount` and
  `direction`; `MerchantLedgerEntry` has `gross_paise` and `gl_account`. Neither
  has `debit`/`credit`.
- **`M` is not unique on exactly the rows that reached the fallback.** `E05`,
  `E06` and `E07` are raised *because* `I3` failed (`RECONCILIATION_SPEC.md §2`
  step 2), so a row with `debit = 500` and `credit = 97_000` has two candidates
  for *"the non-zero one"*.
- **`M` is the wrong figure even where it is unique.** On a well-formed card
  payment line at the frozen `PREREGISTRATION.md §4.2` parameters —
  `amount = 100_000`, `fee = 2_360`, `tax = 360`, `credit = 97_640` — the
  fallback posts `97_640` while the item's `value(observation)` is `100_000`
  (§14.1), so gate `G3` fails by `2_360` paise, exactly the fee, and every run
  ends `BLOCKED`.

The counter-leg fails as well: `1200_BANK` is right for an adjustment, which *is*
a settlement-account movement, and asserts an unevidenced bank movement for
anything else.

**There is still no undefined path.** §17.1.1's trigger table is total over
`Observation.kind` × terminal state × `ExceptionClass`, so nothing reaches this
section that is not an adjustment. An event ASSAY cannot book authoritatively
becomes a named, owned, valued exception rather than a silent omission or a
guess — which for seven of the fourteen classes means an exception with an owner
and no journal line, not an invented posting.

---

## 18. `BenchmarkScenario` and `BenchmarkManifest`

```ts
interface BenchmarkScenario {
  family_id: FamilyId;             // F01..F12
  name: string;
  real_world_justification: string; // REQUIRED. Why this happens in production.
  generator_fn: string;
  degradation_ops: DegradationOp[];
  split: "dev" | "test" | "both";
  target_record_count: number;
}

interface BenchmarkManifest {
  benchmark_version: string;       // "1.0.8"  (spec 1.4.30, M49; §9 step 5
                                   //  pins it at 1.0.8)
  created_at: UnixSeconds;
  generator_commit: string;
  spec_commit: string;             // commit of PREREGISTRATION.md at seal time
  families: FamilyId[];
  seeds: number[];                 // singleton [seed] from spec 1.4.27 (M42)
  record_counts: Record<FamilyId, number>;
  observations_sha256: Sha256;
  ground_truth_sha256: Sha256;     // committed BEFORE any test run
  oracle_labels_sha256: Sha256;
  recon_report_sha256: Sha256;     // the committed PG-side probe surface (1.4.22)
  constraint_set_hash: Sha256;     // the frozen hard-constraint definitions
  sealed_at: UnixSeconds | null;
  seal_signature: string | null;   // signed git tag name -- the value the
                                   //  operator attested with --seal-tag
                                   //  (spec 1.4.29, M45). Recorded, not verified.
}
```

**`recon_report_sha256` was added at spec 1.4.22 `[ASSAY-MODEL]`, register row
M36.** `RECONCILIATION_SPEC.md §6.2`'s `fetch_settlement_recon` reads a committed
artifact, and a manifest that pins the observations but not the probe surface
would let two runs over "the same" benchmark answer probes differently. It is
required and non-null from benchmark v1.0.4; `PREREGISTRATION.md §9` step 5 makes
its absence a seal failure. `benchmark_version` read `"1.0.4"` from that amendment
and reads **`"1.0.5"`** from spec 1.4.25, which freezes the `A3-NOLLM` probe
priority policy into `PREREGISTRATION.md §7` and adds `§13`'s fourth certificate
reason (register rows M39, M40). **The `BenchmarkManifest` shape is unchanged by
that amendment — no field is added, renamed or retyped**, and
`constraint_set_hash` is **unchanged**, `C1`–`C8` being untouched.

**One manifest per `(split, seed)`, ratified at spec 1.4.27 `[ASSAY-MODEL]`,
register row M42.** `PREREGISTRATION.md §4.1` defines a dataset as *"a `(split,
seed)` dataset [that] holds exactly the families `§6.1` assigns to that seed's
range"*, `EVALUATION_SPEC.md §2` loops `for seed in seeds(split)` with no family
loop, and `ARCHITECTURE.md §10` scores per `(agent × seed × split)` — so the
manifest is written once per `(split, seed)` at
`bench/<split>/<seed>/benchmark_manifest.json`. `seeds` is the singleton `[seed]`
and `record_counts` holds that seed's families. **The field is not retyped**:
`number[]` admits a set, `§4.1`'s derivation that *"one `record_counts` map against
a plural `seeds` array"* forces a seed-invariant composition reasons about the type
rather than about any manifest's contents, and both readings survive.

**`recon_report_sha256` is the SPLIT-level digest and is identical across the
manifests of one split.** M36 is unchanged and is not rewritten: the recon report is
a **probe response surface**, not a dataset artifact — never an `Observation`, never
ingested (`§12`), and keyed by a `settlement_id` unique across every family and
seed — so nothing partitions it and `bench/<split>/recon_report.jsonl` stays exactly
where M36 put it. M38's `entity_id`-ascending order holds over the merged split
artifact. **This asymmetry is the point rather than an inconsistency**: it is why
M36 could ratify a location for this artifact while no document ever gave one for
the other three, and spec 1.4.27 states it rather than leaving it to be inferred.

`real_world_justification` is a required field, not documentation. A scenario
family that cannot state why it occurs in production is a manufactured puzzle,
and manufactured puzzles are what make adversarial evaluation look artificial.

---

## 19. `LlmCall` — full provider and model provenance

```ts
type LlmProviderId = "offline" | "replay" | "anthropic" | "openai-compatible";

interface LlmCall {
  llm_call_id: LlmCallId;
  run_id: RunId;
  role: "R1_parse_narration" | "R2_classify_exception"
      | "R3_propose_probe" | "R4_explain_decision";
  provider: LlmProviderId;
  model_id: string;                // "rules-v1" when provider === "offline"
  requires_network: boolean;
  system_prompt_id: string;        // versioned, stable across a benchmark version
  system_prompt_hash: Sha256;
  input_hash: Sha256;
  cache_key: Sha256;               // sha256(provider ‖ model_id ‖ system_hash ‖ input_hash)
  cache_hit: boolean;
  raw_response_hash: Sha256;
  schema_valid: boolean;
  allowlist_violations: string[];  // hallucinated IDs, if any
  grounding_violations: string[];  // ungrounded numerals / non-substrings
  outcome: "accepted" | "rejected_schema" | "rejected_allowlist"
         | "rejected_grounding" | "fallback_offline";
  input_tokens: number;            // 0 for offline
  output_tokens: number;           // 0 for offline
  latency_ms: number;
}
```

`provider` is recorded on **every** call, including offline ones, so a report can
always state exactly what produced each decision. A run executed entirely with
`provider: "offline"` is a valid, complete run — it is the CI default and the
guaranteed demo path (`ARCHITECTURE.md §6.5`).

`allowlist_violations` and `grounding_violations` are **reported metrics**, not
just logs. "The model hallucinated 3 transaction IDs across 10,000 records and
all 3 were structurally rejected" is a far stronger claim than "we used an LLM
carefully."

## 20. `Run`, `CloseReport` and the close gate

```ts
interface Run {
  run_id: RunId;
  dataset_id: string;
  dataset_hash: Sha256;
  engine_commit: string;
  config_hash: Sha256;
  llm_provider: LlmProviderId;
  llm_model_id: string;
  llm_cache_hash: Sha256 | null;
  strict_replay: boolean;          // true = a cache miss is a hard error
  started_at: UnixSeconds;
  finished_at: UnixSeconds | null;
  status: "running" | "complete" | "invalid" | "tampered";
}

type PeriodStatus = "CLOSED" | "OPEN" | "BLOCKED";

interface CloseGateResult {
  g1_all_terminal: boolean;        // every observation has exactly one state
  g2_trial_balance: boolean;       // Σ dr = Σ cr
  g3_suspense_identity: boolean;   // Suspense = Σ abstained + Σ open exceptions
  g4_hash_chain: boolean;          // chain recomputes from genesis
  g5_no_failed_invariant_posted: boolean;
  failed_gates: string[];          // named, for the analyst-facing message
}

interface CloseReport {
  run_id: RunId;
  period: { from: UnixSeconds; to: UnixSeconds };

  // --- the close gate ---
  period_status: PeriodStatus;
  period_status_legacy_policy: PeriodStatus;  // same run scored under the spec
                                              // 1.1.1 close policy; reported for
                                              // transparency, never used as a gate
  gate: CloseGateResult;
  close_policy: { max_unresolved_ratio_bps: number };  // 50 == 0.005
  closed_by: { actor: "system" | "human"; id: string | null } | null;

  // --- what was decided ---
  observations_total: number;
  observations_reference: number;  // count in the REFERENCE terminal state;
                                   // required because `decisions` is keyed by
                                   // DecisionType (3 values) and no longer sums
                                   // to observations_total once REFERENCE exists
  decisions: Record<DecisionType, number>;
  batch_value_paise: Paise;        // Σ recon_line.amount — the coverage and
                                   // close-policy denominator (EVALUATION_SPEC §4.1)
  coverage_by_count: number;
  coverage_by_value: number;       // PRIMARY headline metric (metric 1)
  coverage_by_value_bank: number;   // metric 27
  coverage_by_value_ledger: number; // metric 28
  coverage_by_value_all_observations: number;  // EXPLORATORY audit line only;
                                   // the spec 1.1.1 definition of metric 1
  value_reconciled_paise: Paise;   // Σ recon_line.amount where RECONCILED

  // --- what was not ---
  unresolved_value_paise: Paise;   // Σ value(item) over OPEN SUSPENSE ITEMS,
                                   // read from the Decision / Exception records.
                                   // The G3 right-hand side. Amended at
                                   // benchmark v1.0.3 — see below.
  value_abstained_paise: Paise;    // its abstention half
  value_exceptions_paise: Paise;   // its open-exception half
  unresolved_value_paise_multiview: Paise;  // the benchmark v1.0.2 universe:
                                   // Σ value(observation) over EVERY reconcilable
                                   // observation in ABSTAINED or EXCEPTION.
                                   // EXPLORATORY, reported every run, never a
                                   // gate and never a close-policy input.
  value_suspense_paise: Paise;     // NET projected Suspense balance (Σdr − Σcr
                                   // over 9000_SUSPENSE). NOT the G3 quantity:
                                   // G3 tests the GROSS Σ |item_net_paise|
                                   // against unresolved_value_paise. See below.

  // --- the books ---
  trial_balance_ok: boolean;
  account_balances: Record<AccountCode, Paise>;
  exceptions_by_class: Record<ExceptionClass, { count: number; value_paise: Paise }>;

  // --- provenance ---
  ledger_root_hash: Sha256;
  llm_provider: LlmProviderId;
  llm_calls: number;
  llm_rejections: number;
  abstention_telemetry: AbstentionTelemetry;
  throughput_records_per_sec: number;
  wall_clock_ms: number;
}
```

**A `CloseReport` is emitted for `CLOSED` and `OPEN`, never for `BLOCKED`.** Its
existence is a positive assertion that all five gates passed; `period_status`
then says whether the remaining work is zero or merely quantified.

`coverage_by_value` is the headline, not `coverage_by_count`. Reconciling 98% of
records while abstaining on the three largest settlements is a bad outcome that a
count-based metric would flatter.

`batch_value_paise` is recorded so that `period_status` is **independently
recomputable from the close report alone**: the close threshold is
`round_half_up(batch_value_paise * 5 / 1000)` (`RECONCILIATION_SPEC.md §10.3`). A
reviewer holding only this artifact can verify the gate outcome without the
database, the engine or the observation file. The four coverage ratios are derived
display values computed at render from the integer paise fields; the integers are
authoritative and no gate compares a ratio.

`value_suspense_paise` is the net projected Suspense balance. `unresolved_value_paise`
ties to the **gross** `Σ |item_net_paise|` over open Suspense items. The two are
equal only when every open Suspense item lies on the same side, which a run
containing both `E03` and `E04` does not satisfy; testing only their equality, as
benchmark v1.0.0 did, would fail on a structurally healthy run and would be
satisfiable by two offsetting suppressions. The gross identity is gate
G3, and it is what makes silent exception suppression arithmetically impossible.

**`unresolved_value_paise`'s universe, amended at benchmark v1.0.3.** It is
summed over **open Suspense items** — one per **abstained target** and per open
exception whose class posts, keyed by `JournalLine.source_entity_id` (§16) — and
its per-item figure is read from the owning `Decision` or `Exception` record.
Gate `G3` therefore compares the **queue** against the **books**: the two sums
are drawn from two independently maintained stores over one universe, and a
suppression on either side breaks the identity. That is the whole of what
`THREAT_MODEL.md §T8` asks for, and it is unchanged.

Through benchmark v1.0.2 this field was summed over **every** reconcilable
observation in a non-resolved state, which `RECONCILIATION_SPEC.md §10.3` records
as counting *"several views"* of one economic break. `G3` is an identity **exact
to the paisa**, and no set of postings satisfies it against a multi-view sum: the
worked example at `RECONCILIATION_SPEC.md §11` posts ₹1,00,000 for a break whose
multi-view total is ₹3,00,000, and posting each view separately would relieve
`1100_GATEWAY_RECEIVABLE` twice for one break. The v1.0.2 universe made `G3`
unsatisfiable, which ends every run `BLOCKED` and violates metric 14 by
construction.

**The v1.0.2 quantity is retained, not replaced.**
`unresolved_value_paise_multiview` carries it on every run, labelled
`EXPLORATORY` per `PREREGISTRATION.md §8`, in the same way
`period_status_legacy_policy` carries the superseded close policy. It supports no
claim and gates nothing; it exists so a reader can see both universes and the
transition between them without re-running anything. **This amendment lowers
`unresolved_value_paise` and makes `CLOSED` easier to reach**; the disclosure is
in `PREREGISTRATION.md §8` and `DECISION_BRIEF.md §A.7`.

---

## 21. `AbstentionTelemetry` — measuring the DoS surface

```ts
interface AbstentionTelemetry {
  abstention_rate_by_value: number;
  baseline_rate_by_value: number;      // rolling mean from the dev split
  baseline_stddev: number;
  spike_flag: boolean;                 // rate > baseline + k·σ, k = 3 (frozen)
  // attribution: which inputs are driving abstention
  abstentions_with_untrusted_text: number;
  abstentions_without_untrusted_text: number;
  attributable_to_untrusted_text_rate: number;
  by_source_system: Record<string, { count: number; value_paise: Paise }>;
  // queue protection
  top_n_shown: number;                 // 20
  largest_exception_in_top_n: boolean; // MUST be true; value-ranked queue
}
```

This exists to make the attention-denial-of-service threat
(`THREAT_MODEL.md §T9`) measurable rather than hypothetical. An attacker who
cannot move money may still be able to flood the exception queue; these fields
detect that, attribute it to a source, and prove that value-ranking kept the
largest item visible.

---

## 22. Provenance register

Every statement this specification makes about Razorpay, classified per §0
rule 6. This table is the audit surface for the rule: a reviewer checks the class,
not the prose. Sources are the most specific official one available — API entity
reference beats endpoint reference beats product guide beats pricing page.

### 22.1 `[RZP-DOC]` — stated in official Razorpay documentation

| # | Statement | Object | Source |
|---|---|---|---|
| D1 | `fee` is GST-inclusive; `tax` is the GST component inside it | Payment | Payment entity: *"Fee (including GST) charged by Razorpay"* / *"GST charged for the payment"*; sample `amount 2100, fee 50, tax 8` |
| D2 | GST is charged on the fee, not on the transaction | Settlement recon | Recon endpoint: `tax` = *"the tax on the fee"* |
| D3 | The GST rate on gateway fees is 18% | Pricing | Pricing page, *"2% + GST"* / *"2% + 18% GST"* |
| D4 | Standard domestic list price is 2% per transaction, covering cards, UPI, netbanking and wallets | Pricing | Pricing page FAQ and its structured `price: 2.00 PERCENT` |
| D5 | Zero MDR on UPI and RuPay debit does **not** mean zero charge — a 2% platform fee still applies | Pricing | Pricing page FAQ |
| D6 | Premium instruments (EMI, Amex/Diners, corporate cards, Pay Later, international cards) carry ~3% | Pricing | Official Razorpay blog — *marketing content on the official domain*, a weaker tier than API docs |
| D7 | `Settlement.fees` and `Settlement.tax` are **0** for a normal settlement | Settlement | Settlements entity: *"In case of a normal settlement the fee charge will be 0"*; `settlement.processed` webhook sample |
| D8 | Non-zero settlement `fees`/`tax` belong to instant settlements, and `fees` there is *"Total amount (fees+tax)"* | Settlement (instant) | Instant Settlements entity |
| D9 | `GET /v1/settlements/:id` returns the settlement entity only — 8 parameters, no constituents | Settlement | Fetch Settlement With ID |
| D10 | Settlement constituents come from the date-scoped recon report, keyed by `settlement_id` | Settlement recon | `GET /v1/settlements/recon/combined` |
| D11 | The recon endpoint requires `year` + `month`, takes optional `day`, caps `count` at 1000, and pages with `skip` | Settlement recon | Recon endpoint query parameters |
| D12 | The recon endpoint documents 24 response parameters; `posted_at` and `credit_type` are not among them | Settlement recon | Recon endpoint response parameters vs. its sample payload |
| D13 | `type` value set is `payment` \| `refund` \| `transfer` \| `adjustment` | Settlement recon | Recon endpoint |
| D14 | `payment_id` is null for payment rows and set for refund/transfer rows | Settlement recon | Recon endpoint |
| D15 | `card_network` value set is American Express, Diners Club, Maestro, MasterCard, RuPay, Visa, unknown | Settlement recon | Recon endpoint |
| D16 | `card_issuer` is not set for international cards | Settlement recon | Recon endpoint |
| D17 | `on_hold` is documented as *"whether the account settlement **for transfer** is on hold"* — a Route concept, set via `PATCH /v1/transfers/:id` with `on_hold` / `on_hold_until` | Settlement recon / Route transfer | Recon endpoint; Modify Settlement Hold for Transfers |
| D18 | `notes` is a JSON object (≤ 15 key-value pairs, 256 chars each) | Order, Payment, Refund, Settlement recon | Entity references |
| D19 | Standard domestic settlement cycle is **T+2 working days**, T = capture date; working days exclude Sundays, 2nd/4th Saturdays and bank holidays | Settlement | Settlements guide and FAQ |
| D20 | The cycle is subject to bank approval and varies by business vertical and risk | Settlement | Settlements guide |
| D21 | International payments settle on a longer cycle (documented T+7 working days) | Settlement | Settlements FAQ |
| D22 | Settlements are made in **INR regardless of the currency the customer paid in** | Settlement | Settlements FAQ |
| D23 | Partial settlements defer **whole transactions** to the next slot; a single payment is not split across settlements | Settlement | Settlements guide worked example (P1, P2 settle; P3 deferred) |
| D24 | `status: "processed"` confirms transfer *initiation*; the bank credit follows the NEFT/RTGS/IMPS timeline, up to ~3 hours | Settlement | Settlements webhook events |
| D25 | Settlement break-up components are Payment, Adjustment, Tax, Fee, Transfer, Refunds | Settlement | Settlements dashboard guide |
| D26 | UTR is *"available across banks"* and is used to track a settlement in the bank account | Settlement | Settlements entity |
| D27 | `speed_requested` ∈ {normal, optimum}; `speed_processed` ∈ {instant, normal} | Refund | Refunds entity |
| D28 | Refund `status` ∈ {pending, processed, failed} | Refund | Refunds entity |
| D29 | Dispute `status` ∈ {open, under_review, won, lost, closed}; the entity carries `amount_deducted` | Dispute | Disputes entity |
| D30 | A lost dispute results in the amount being **deducted from the merchant's account** | Dispute | Disputes guide |
| D31 | Order `receipt` is at most 40 characters and must be unique | Order | Orders entity |
| D32 | Payment `method` value set includes `paylater` in addition to card/netbanking/wallet/upi/emi | Payment | Payment entity |
| D33 | Amounts are integers in currency subunits; timestamps are Unix epoch seconds | All | All entity references |
| D34 | Entity id prefixes `pay_`, `order_`, `rfnd_`, `setl_`, `adj_`, `disp_`, `trf_` | All | All entity references |

### 22.2 `[ASSAY-MODEL]` — ASSAY's own decisions, not Razorpay behaviour

| # | Assumption | Why it is ASSAY's, not Razorpay's |
|---|---|---|
| M1 | Half-up rounding, applied once per line | Razorpay documents no rounding mode; its own sample shows sub-paisa drift |
| M2 | Per-line GST computation; no CGST/SGST/IGST split | Not documented; ASSAY collapses GST into one input-credit account |
| M3 | Method fee rates as basis points, fixed per benchmark | Razorpay publishes list pricing, not a per-merchant rate card |
| M4 | The F03 mid-period rate change (card 200 → 195 bps) | A plausible commercial event — custom pricing above ₹5L/month is documented — but 195 bps is invented |
| M5 | T+n modelled in **calendar** days, with no bank-holiday calendar | Razorpay's cycle is in working days; see `PREREGISTRATION.md §4.2` |
| M6 | The T+1 / T+2 / T+3 mix across batches | Documented baseline is T+2; the dispersion is ASSAY's stand-in for documented bank/vertical/risk variation |
| M7 | 14-character id suffix length | Consistent in every sample, never stated as a contract |
| M8 | UTR treated as a unique key for anchoring (`AN2`), and UTR prefix length as a soft signal (`SE1`) | Razorpay documents UTR as a tracking reference; it asserts no uniqueness, and official samples show at least three different UTR shapes |
| M9 | The entire `Adjustment` construct: `direction`, `reason`, `related_entity_id` | No public Adjustments API entity exists |
| M10 | `BankStatementLine` and `MerchantLedgerEntry` in their entirety | Not Razorpay objects at all |
| M11 | Every ingest invariant in §2–§9 | Razorpay documents field meanings, not invariants |
| M12 | `C8` (`on_hold === false`) applied as a general admissibility filter | Documented only in the Route-transfer context (D17) |
| M13 | Narrowing `ReconLine.type` to exclude `transfer`; excluding `paylater`, Amex and Diners from generation | Scope decisions; the documented value sets are wider |
| M14 | Quarantining `notes` as one canonical-JSON blob | A design choice about the trust boundary |
| M15 | The adjustment information boundary: `Adjustment` (`reason`, `direction`, `related_entity_id`) is true-state only and never observed; ASSAY sees an adjustment as a `ReconLine` with `type === "adjustment"` | Razorpay publishes no Adjustments API entity (M9), so there is no documented observable from which a reason could be read. The boundary is ASSAY's modelling decision, not a Razorpay behaviour |
| M16 | `AN5` is not exercised, and the merchant ledger is soft evidence only | Retiring the anchor is ASSAY's decision, taken at spec 1.4.1 on two grounds internal to this specification — `order.receipt`'s quarantine (§0 rule 4) and `THREAT_MODEL.md §T5`'s soft-evidence doctrine. Razorpay documents nothing about how a merchant's ERP references its own orders, and asserts no anchor either way |
| M17 | The `order.receipt` → `MerchantLedgerEntry.order_ref` lossy re-encoding, and its retention band | §8 states that the mapping is lossy; the *form* of the transform and how much shape it retains are ASSAY's, and are a declared governance convention with no documentary basis (`PREREGISTRATION.md §4.2`) |
| M18 | `ReconLine.settled_at` is **settlement-scoped**: the instant the carrying settlement transferred, identical across every line that settlement carried (§6, spec 1.4.3) | The field's name, type and unit are documented; its **semantics** are not, and no source states the scope or relates it to `Settlement.created_at`. `C3`, `C4` and §7 already read the term this way; the definition states what they assume. The refusal is part of the row: no relationship to `Settlement.created_at` is asserted, and the condition is necessary rather than sufficient |
| M19 | `currency(target) := "INR"` for both target kinds (§11.1, spec 1.4.4) | Neither `Settlement` nor `BankStatementLine` carries a `currency` field, and `C1` names the target explicitly rather than being silent about it, so a target contribution must be declared or `C1` admits nothing. The value asserts nothing beyond the frozen schema, where `currency` is a literal `"INR"` on every observation carrying the field, and matches `C1`'s own *"Tier-0 is INR-only by construction"*. It is ASSAY's declaration, not a documented Razorpay fact about either entity |
| M20 | `Component.member_obs_ids` is the **unanchored** observation nodes of one `RECONCILIATION_SPEC.md §5` component, and `Component.total_value_paise` is `Σ value(observation)` over that field — targets and anchored observations excluded (§11, spec 1.4.6) | Both were declared without comment while `τ` read the second as *"component value"*. For the value, §5's node definition and §11's `size` comment each supported a different reading and neither excluded the other, so the member-scoped one is **ratified** rather than derived; the rationale is `size`'s own member scope and the v1.0.3 single-contribution treatment, not textual necessity. For the domain, §11 never stated that `Component` is §5's graph output — the link was by name and stage only |
| M21 | The **time of day** for the settlement instant (`21:00:00` IST on the settlement's own calendar date) and for captures, refunds and ERP bookings (`[00:00:00, 21:00:00)` IST of their day) (`PREREGISTRATION.md §4.2`, spec 1.4.7) | `§4.2` fixed each entity's **day** and stated no time of day. The silence was load-bearing: `C4` bounds `settled_at − created_at` at one day and `§6` makes `settled_at` settlement-scoped, so with the times free a `T+1` batch admits a **true-allocation** member that passes `C4` on a calendar-date reading and fails it on an elapsed-seconds reading — which `PREREGISTRATION.md §5.3` makes a question of benchmark validity, not of implementation taste. The grid is chosen so the two readings **agree** rather than so one wins: every event is strictly before the settlement instant, which makes the `T_min` floor strict. `21:00:00` is the latest instant leaving the three hours `§4.2`'s bank clock needs inside the same calendar date, so `C3`'s bank-arrival half holds by construction. It states the grid the benchmark already had; no population quantity moves |
| M22 | `C2`'s refund half is **referential** — the refund member's own `order_id` must equal the `order_id` of the payment its `payment_id` names, and that payment need not be a candidate member — and where a `recon_line` and a `payment` observation both carry it, the **`recon_line` governs** (`RECONCILIATION_SPEC.md §4.1`, spec 1.4.8) | *"Offset"* admitted a co-membership reading and §4.1 had not chosen. The referential reading is **forced**: §3's `AN3` states the link's basis as *"Referential"*, §4.1's own justification is *"a refund documents its parent `payment_id`"*, §15's `E10_REFUND_ORPHAN` already owns absence from the dataset, and `PREREGISTRATION.md §4.2`'s one-batch-per-capture-day with `F02`'s *"batch N+2"* puts a refund's batch on its own day, so the parent is never a co-member and co-membership would exclude every refund-carrying true allocation and fail `§5.3`. **The source precedence is a declaration, not a derivation:** no clause ranks the two views, and the recon line is chosen because §11.1 scopes a member to its own payload and §22.1 D10 makes the recon report the constituent source |
| M23 | `Decision.invariants_checked` and `Decision.invariants_failed` carry **`InvariantId`** (`I1`–`I9`), not `ConstraintId` (`C1`–`C8`), and `InvariantId` is declared as exactly `I1`–`I9` (§13, spec 1.4.9) | Through spec 1.4.8 §13 typed both fields `ConstraintId[]`, while the only stage that populates them — `RECONCILIATION_SPEC.md §7`'s S5 gate — evaluates `I1`–`I9`, and gate `G5` and `ARCHITECTURE.md §4` boundary 3 read them as *"the result"* of that gate. `I1`–`I9` had **no declared type anywhere**, so the fields could not hold the values the specification required: S5 could record that validation failed but never which invariant failed. The correction is the **typing**, not the gate — `§7`'s invariants, `§4.1`'s constraints and `§10.1`'s gates are untouched, `ConstraintId` remains exactly `C1`–`C8`, and the two vocabularies stay distinct with neither a subset of the other |
| M24 | `SE1`'s comparands are `settlement.utr` and its `AN2`-matched `bank_ref`, and `SE1` is permanently **inactive** for ranking; `SE3`'s modal lag is day-binned over the dataset's `recon_line` observations with lowest-bin ties and a linear kernel over `[T_min, T_max]`; `SE4` is **post-probe only** (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.10) | **What is derived:** `SE1`'s comparand — M8 registers it in one row with `AN2` on the same UTR justification, `E14` frames prefix collision bank-side, and `RECONCILIATION_SPEC.md §11`'s worked example is arithmetically reproducible **only** if `SE1` contributes equally to both candidates, its stated `Δs = 400 bps` with `SE3` deciding being impossible under a member-scoped reading, which would put `Δs ≥ 3500` and yield `DISCRIMINATED` rather than the stated `ABSTAINED`. `SE1`'s inactivity — from `§11.1`'s spec-1.4.4 empty candidate set. `SE4`'s gating — from the quarantine of `memo` plus `AL3`'s frozen weights, which bar renormalisation and leave zero as the only defined contribution. That `SE3` requires **some** binning — from the spec-1.4.7 clock grid, which makes a seconds-granular mode degenerate. **What is ratified:** retaining `SE1`'s weight rather than reallocating or removing it, on the `C8` precedent; and all four of `SE3`'s choices — the whole-day granularity, the dataset-wide population, the lowest-bin tie rule and the linear kernel — **none of which frozen text determines**. `SE4`'s agreement function and `SE5` in its entirety are **not** settled here |
| M25 | `SE4` is **expected-non-binding on v1.0.0 data**: it is retained with its 1000-bps weight, its agreement function is left undefined, and the fact that it separates no candidates is reported (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.11) | **Derived:** `memo` is quarantined and no `§6.2` probe returns it; `MerchantLedgerEntry` (§8) has no structural method or card-network field; `fetch_payment` supplies `method`, which §10's `payment` observation already carries; `card_network` has no Payment-side field, spec 1.1.1 having moved the card attributes to `ReconLine`; no exercised `§4.3` operator perturbs either field; and `PREREGISTRATION.md §4.2`'s `F06` draws one method for both members of a collision pair. `SE4` therefore takes one value across every candidate of a target. **Ratified:** retaining the row and its weight rather than reallocating or removing them, on the `C8` precedent — `§4.1` keeps a declared filter that excludes nothing and reports it doing nothing. **Not settled, and deliberately so:** the agreement function itself, which is unobservable while the signal is non-discriminating |
| M26 | `Evidence.detail` for `kind: "probe_result"` is a five-variant discriminated union on `probe`, matching `RECONCILIATION_SPEC.md §6.2`'s closed enum; `date` is **not** a member of the `fetch_settlement_recon` variant (§12, spec 1.4.12) | **Derived:** the five variants and their argument ids — `§6.2` declares exactly five probes and `THREAT_MODEL.md §T7` calls them *"a closed enum of five read-only operations"*; each result field has a named consumer (`receipt`→`SE2`, `method`→`SE4`, parent `payment_id`→`C2`/`E10`, `constituent_entity_ids`→`SE5`, `days`→`C4`); and the argument ids are required by `I6` through `DECISION_BRIEF.md §L.1` rule 8, since `R3` proposes the probe and `obs_ids` carries observation rather than entity ids. Nullable results are `§6.2`'s own hedging (*"may supply"*) plus `ARCHITECTURE.md §5`'s *"still no discriminator"*. **Ratified:** omitting `date`, because no frozen rule reads it from `detail`, `§22.1` D11 describes only the external endpoint's query shape, and the `PROBE` `LedgerEvent` already logs the call — so carrying it would mean inventing a date type for a field nothing consumes. Also ratified: defining this one kind **without** implementing the `Evidence` entity, whose other nine kinds have no identified consumers. **Not settled:** `SE5`'s scope, function and aggregation, and `§T7`'s unstated hard bound on `days` |
| M27 | `SE3`'s complete definition, dimensionally corrected (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.13): `lag_days` is the **unfloored** real quotient, `mode_days` the mode of `floor(lag_days)` run-level with lowest-bin ties, a member scores `max(0, 1 − |lag_days − mode_days| / (T_max − T_min))`, and a **candidate scores the arithmetic mean** of its members | **The correction:** spec 1.4.10 defined `lag` in elapsed seconds and the mode in whole days and then subtracted them, so the terms had no common unit — on a `T+2` member captured at 09:00 the formula clamped to **0** rather than the intended **0.9167**, and `SE3` would have been silently inert. **Derived:** the lag term (`C4`, `O-C4-UNIT`); that the *mode* needs binning (the 1.4.7 grid makes a seconds-granular mode degenerate); that the *numerator stays continuous*, that rationale being scoped to the mode alone; that days and seconds give an identical ratio; that a **candidate-scoped** mode is excluded, since it would make `SE3` constant across candidates and unable to rank; and that a **raw sum** over members is excluded, leaving `[0,1]` and breaking `§4.2`'s `[0, 10_000]`. **Ratified, none determined by frozen text:** the whole-day granularity, the run-level population, the lowest-bin tie, the linear clamped kernel, the `T_max − T_min` denominator and the arithmetic-mean aggregation. The 1500-bps weight, `T_min`, `T_max` and the kernel's shape are unchanged |
| M28 | A probe-returned `constituent_entity_id` and a `Candidate.member_obs_id` are in **distinct namespaces**, related only through the observation whose `payload.entity_id` equals the returned id; the relation is **one-to-one** on a conforming dataset and **partial** (§12, spec 1.4.14) | **Derived:** the two grammars are already frozen — §6 gives `entity_id` as `pay_… | rfnd_… | adj_…` and §11 types `member_obs_ids` as `ObservationId`, so a direct comparison always yields the empty set; the relation is one-to-one because `PREREGISTRATION.md §4.3`'s only duplication operator, `DUPLICATE_ROW`, is scoped to *"share of `bank_line`"* and `§4.1` credits `F04` with extra **bank_line** rows alone, so no `recon_line` is emitted twice; and it is partial because `§4.2`'s `F05` withholds a constituent `recon_line` while `fetch_settlement_recon` queries the PG's recon report (§22.1 D10) rather than the observation set. **Ratified:** nothing — this row states a relation that the frozen grammars and operator table already determine. **Deliberately not decided:** what a comparing rule does with a returned id that has no observation. That is outcome-bearing where the comparison happens, and `SE5`'s scope, function, normalisation, aggregation and double-counting all remain open |
| M29 | `SE5`'s **scope** is `fetch_settlement_recon` results only; its **scoring function remains undefined** (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.15) | **Ratified, not derived.** `§6.2` names a consumer for four of its five probes — `fetch_order`→`SE2`, `fetch_payment`→`SE4`, `fetch_refund`→`C2`/`E10`, `widen_temporal_window`→`C4` — leaving `SE5` the one signal without a named input and `fetch_settlement_recon` the one probe without a named consumer. That is elimination, not entailment, and `§4.2`'s *"Probe **result** corroboration"* with §12's generic `kind: "probe_result"` both read the other way. **The generic-scope exclusion IS derived:** scoring `widen_temporal_window` would let a `C4` relaxation raise the evidence score of the candidates it admitted — the *"quiet constraint relaxation to manufacture a match"* `THREAT_MODEL.md §T7` names — and §12 classes a rule change as *"hard"* evidence rather than a score contribution. A named subset using `fetch_order` or `fetch_payment` is **not** excluded: no clause forbids one probe result feeding two signals and the arithmetic permits it, but it would need a double-counting policy this specification does not state. **Not settled:** the scoring function, the `F05` denominator treatment — shown to be one coupled decision with the function rather than two — empty-result scoring, and multi-probe aggregation |
| M30 | `SE5 = \|R* ∩ M\| / \|R* ∪ M\|`, where `R*` is the `fetch_settlement_recon` report's returned ids mapped through §12's relation with **unobserved ids excluded entirely** and `M` is `Candidate.member_obs_ids`; `0` when `\|R* ∪ M\| = 0` (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.16) | **Derived — the `F05` exclusion:** `PREREGISTRATION.md §5.3` resolved the identical pattern for the completeness gate, holding that an `F05`-withheld member *"was never expressible in the candidate language at all"* and that a gate failing on it *"would report a constraint fault where none exists"*; a candidate cannot hold a member with no observation, so charging it reports an evidence fault where none exists, and `§5.3`'s guard — expressibility is *"a property of observation existence and kind alone"* — carries over. Under the rejected reading a perfect score is unattainable on any `F05` settlement (`Δs = 1333 < ε` where exclusion gives `2000`). **Derived — symmetry:** `§4.1` makes `C6` exact with zero tolerance and `I4` equates a settlement with its allocated lines, so omission and addition are errors of one kind; each asymmetric measure returns a **tie** between a confirmed and a contradicted allocation (binary: `{a,g}` vs all six; recall: exact vs superset; precision: `{a}` vs `{a,b,c}`), and a signal whose only uses are ordering and the ε-gap cannot rank there. **Derived — empty result scores 0:** §12 calls an empty `constituent_entity_ids` *"a result rather than an error"*, `AL3` bars renormalisation, and `§4.2` needs a defined sum. **Ratified:** Jaccard specifically, over `F1` or any other symmetric measure — frozen text names none, and the adoption follows `§4.2`'s own Jaro–Winkler precedent for `SE2`. **Not settled:** multi-probe aggregation under `P_max = 3`; `§6.2`'s determinism makes repeated identical calls idempotent, but combining results from different arguments is unspecified |
| M31 | Where several `fetch_settlement_recon` results carry one `settlement_id`, `R` is the **union** of their `constituent_entity_ids`, irrespective of `date` argument or probe order (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.17) | **Derived, nothing ratified.** *Evidence accumulates:* §13's certificate carries `probes_attempted: ProbeId[]`, *"what we tried before giving up"*, and `RECONCILIATION_SPEC.md §11` spends three probes, evaluates them together and records all three; no clause discards or supersedes an `Evidence` row. *Union is forced:* `§6.2`'s referent is *"the lines carrying that `settlement_id`"*, and §6 makes the report *"date-scoped and paginated"* such that *"a period-close ingest must iterate rather than issue one call"*. Against windows `{a,b}`/`{c,d}`/`{e,f}` only the union lets a candidate equal to the constituent set score `1.000`; intersection scores it `0.000` and latest, first and per-probe aggregates `0.333`, each falsifying `§4.2`'s frozen *"`SE5 = 1` iff `R*` and `M` are equal and non-empty"*, with *latest* certifying a one-window candidate at `1.000`. *Also excluded:* latest/first are order-dependent (`667` bps over six orderings) on an input `ProbeResultDetail` does not carry; intersection and latest let a nothing-returning probe erase established evidence against `§6.2`'s *"abstentions resolved per probe spent"*; and summing results yields `6000` bps for a signal frozen at `2000`, which `AL3` forbids renormalising. **Not decided:** the field the recon endpoint is date-scoped on — the rule is correct under every reading of it — and any `R3` probe-selection policy  **Superseded in part at spec 1.4.25 (M39, M40)**, which does not edit anything above: `R3`'s probe-selection policy is settled for the **control arm** by `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy (M39), and whether `R3` may propose `widen_temporal_window` is settled in the negative by `DECISION_BRIEF.md §L.1` rule 2 (M40). `M31`'s date-scoping field and `§T7`'s numeric `days` bound remain open. |
| M32 | Stage `S0` is owned by `packages/domain`, over source data `apps/cli` has already read; `packages/engine` owns `S1`–`S5` and performs no I/O (`ARCHITECTURE.md §3`, spec 1.4.18) | **Derived — the engine's exclusion:** `RECONCILIATION_SPEC.md §2` declares `S0`'s output `Observation[]` + `UntrustedText[]`, and §10 states *"nothing in `packages/engine` may import `UntrustedText`"* — a ban `DECISION_BRIEF.md §L.1` rule 3 lists among the invariants that may never be violated, `PREREGISTRATION.md §6.2` `AL1` repeats, and `eslint.config.js` enforces in CI. A stage cannot emit a type its package is forbidden to import, so `S0` was never the engine's, and `ARCHITECTURE.md §3`'s *"Stages S1–S5"* was correct against `DECISION_BRIEF.md §L.2` and `§I`. **Derived — the I/O split:** `S0`'s input is *"raw source files"* while `§3` gives the engine *"no I/O, no network"*, so reading and transforming are different parties. **Ratified:** `packages/domain` as the transform's owner rather than `apps/cli` or a new package — `ARCHITECTURE.md §3` excluded the engine but named nobody. Domain already holds every per-record part (`schemas/`, `checkReconLineInvariants`, `@assay/domain/untrusted-text`, §10.1's `REFERENCE` classification), builds second, and does no I/O. **Not decided:** nothing is built — `packages/engine` remains absent and domain's `S0` orchestration is scheduled, not written |
| M33 | `widen_temporal_window` is **expected-non-binding on v1.0.0 data** and its numeric hard bound remains **unstated**; the probe keeps its place in the closed five-probe enum (`RECONCILIATION_SPEC.md §6.2`, `THREAT_MODEL.md §T7`, spec 1.4.19) | **Derived:** `PREREGISTRATION.md §4.2` admits only `T+1`/`T+2`/`T+3`, the spec-1.4.7 clock grid puts `lag_days ∈ (n, n + 0.875]`, and `§4.3`'s `SHIFT_TIMESTAMP` is declared **not exercised**, so the true lag range is `(1, 3.875]` days against `C4`'s `[1, 7]` — **headroom 3.125 days**, `C4` excludes no true member, the widening needed for completeness is **zero days**, and any `days > 0` strictly enlarges the admissible set with allocations the truth does not require. **Ratified:** retaining the probe and its closed-enum position while reporting that it separates nothing, on `§4.1`'s `C8` precedent and the `SE1` (1.4.10) / `SE4` (1.4.11) treatments; and **declining to fabricate the missing figure** — `§7`'s frozen block and `§6.2` AL3's enumeration both omit it and neither gains a constant here. **Not settled:** the numeric bound; whether `R3` may propose the probe — expected-non-binding is **not** a prohibition; and the engine's handling of a proposed-but-unnecessary widen beyond `§6.2`'s logging, its `P_max` cost and spec 1.4.15's bar on feeding `SE5`. `days` keeps `integer > 0` with **no schema ceiling**, exactly as spec 1.4.12 defined it  **Superseded in part at spec 1.4.25 (M39, M40)**, which does not edit anything above: `R3`'s probe-selection policy is settled for the **control arm** by `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy (M39), and whether `R3` may propose `widen_temporal_window` is settled in the negative by `DECISION_BRIEF.md §L.1` rule 2 (M40). `M31`'s date-scoping field and `§T7`'s numeric `days` bound remain open. |
| M34 | `SE2` is **expected-non-binding on v1.0.0 data**; its 2000-bps weight is retained and unreallocated (`RECONCILIATION_SPEC.md §4.2`, spec 1.4.20) | **Derived:** `SE2`'s comparands are `order_ref` and `receipt`; `receipt` is reachable through `§6.2`'s `fetch_order` and `§12`'s `ProbeResultDetail`, but `order_ref` exists only on `MerchantLedgerEntry` (§8) and **no frozen clause pairs a `MerchantLedgerEntry` with a candidate, component, target or probed order**. `AN5` — `merchant_ledger.order_ref === order.receipt` — was the only such route and is retired at spec 1.4.1 (`RECONCILIATION_SPEC.md §3`); with it gone §11.1 makes `ledger_entry` not member-eligible and §17.1.1 not a target, so *"every merchant ledger entry reaches `E13_LEDGER_ONLY`"*. `PREREGISTRATION.md §10` V12 states the same fact as *"ASSAY consumes three sources and ties out two"*. **Ratified:** retaining the row and its 2000 bps rather than reallocating or removing them, on `§4.1`'s `C8` precedent already applied to `SE1` (1.4.10) and `SE4` (1.4.11); and the **narrower** *expected-non-binding on v1.0.0 data* formulation rather than `SE1`'s *permanently inactive*, since `SE2`'s status follows from a missing clause a future amendment could supply, not from a structural property of the candidate language. **Not settled:** any future pairing or aggregation rule for `order_ref` ↔ `receipt`, and any fetch route outside `§6.2`'s closed five-probe enum. `constraint_set_hash` does not move; no weight is renormalised; `DISCRIMINATED` stays reachable, `SE5`'s 2000 exceeding `ε` alone |
| M35 | An exact `evidence_score_bps` tie between feasible solutions is resolved by the **lexicographically smallest canonical allocation key** — the solution's `(target_id, member_obs_id)` pairs, sorted, serialised `target_id | member_obs_id` and joined by `;` — and the same order fixes `solution_a` before `solution_b` (`RECONCILIATION_SPEC.md §6`, spec 1.4.21) | **Derived — ties are reachable:** with `SE1` inactive (1.4.10), `SE2` (1.4.20) and `SE4` (1.4.11) expected-non-binding and `SE5` zero pre-probe, `evidence_score_bps` is `SE3` alone, which reads member lag only; members sharing a capture day and cycle carry identical `lag_days`, and `PREREGISTRATION.md §4.2`'s `F06` constructs *"identical amount, drawn ONCE and used for both; identical method; same simulated day"*. **Derived — an ordering is required:** `Δs = 0 < ε` sends a tie to `AMBIGUOUS` or `IMMATERIALLY_AMBIGUOUS`, whose rule is *"accept best"*, which fixes `Decision.chosen_candidate_id` and the `source_entity_id`s `G3` partitions by, while `solution_a`/`solution_b` enter the hashed body (§13, §16); metric 23 needs identical root hashes and §16 forbids depending on *"iteration order over an unordered collection"*, so **enumeration order cannot be the tie-break**. **Ratified:** this particular key — §16 demands determinism but names no ordering, and nothing else ranks equal-scored allocations. `member_obs_ids` alone is **insufficient**: a component may hold several targets (§5), two targets of equal amount admit the identical member set, and §5 defers `C7` coupling to *"a single serialized pass after all components are solved"*, so both are feasible at solve time and their member sets collide. The key adds no new quantity — `target_id` and `member_obs_ids` are §11 fields — and ids match `^prefix_[A-Za-z0-9]{14}$`, so neither separator can occur inside one and the encoding is injective. **Unchanged:** the ranking criterion itself, `ε`, `τ`, every `SE` weight and `C1`–`C8`; the rule applies only after exact equality and never enters the score |
| M36 | `fetch_settlement_recon`'s source is the committed PG-side recon report `bench/<split>/recon_report.jsonl`, carrying `settlement_id`, `entity_id` and `settled_at`; `settlement_id` is its only query key; the Ambiguity Oracle is barred from the artifact and remains observations-only (`RECONCILIATION_SPEC.md §6.2`, `PREREGISTRATION.md §5.1`/`§6.2` AL8, spec 1.4.22) | **Derived — the source class:** §12 has stated since spec 1.4.14 that the probe queries the PG's own report *"rather than the observation set"* and derived the identifier relation's partiality from it; `PREREGISTRATION.md §4.2` removes the `F05` line **at emission**, so no observation-backed source can satisfy that derivation. **Derived — no fallback is needed:** `§4.3` gives `DROP_SETTLEMENT_ID` as *"Merchant-side recon copies that lack the PG's batch identifier"* and `§4.1`'s `F08` as *"absent from the merchant's copy"*, so the PG's report retains `settlement_id` and the key never fails. **Derived — the oracle asymmetry is not new:** `RECONCILIATION_SPEC.md §6`'s `DISCRIMINATED` branch accepts when `Δs ≥ ε` while `PREREGISTRATION.md §5.4`'s ambiguity definition carries no `Δs` term, so ASSAY committing on an oracle-ambiguous case is frozen behaviour from spec 1.0.0; `§10` V20 shows only that it was unreachable pre-probe. **Ratified:** the artifact's location, its three columns, committing it for both splits, and the asymmetry as **intentional** — the oracle stays a fixed observations-only reference. **Rejected:** an observation-backed source with a `settlement_utr` fallback, which would make that field a normative probe comparand against `DECISION_BRIEF.md §A.17`'s finding (M24) that it *"is read by no normative rule anywhere"*; and letting the oracle read the artifact, which would void `PREREGISTRATION.md §5.3`'s expressibility scoping and make the completeness gate tautological. **Documentation correction, not a semantic change:** `PREREGISTRATION.md §5.1`'s *"Its input is exactly what every agent receives"* and `EVALUATION_SPEC.md §4.3`'s *"had no evidential right to make"*. **Not decided:** the field a query is date-scoped on (M31 stands); `R3`'s probe-selection policy; the owner of the probe loop. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5` and every §7 threshold. `BENCHMARK_VERSION` moves 1.0.3 → 1.0.4; `GT_VERSION` stays 1.1.0  **Superseded in part at spec 1.4.25 (M39, M40)**, which does not edit anything above: `R3`'s probe-selection policy is settled for the **control arm** by `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy (M39), and whether `R3` may propose `widen_temporal_window` is settled in the negative by `DECISION_BRIEF.md §L.1` rule 2 (M40). `M31`'s date-scoping field and `§T7`'s numeric `days` bound remain open. |
| M37 | The `RECONCILIATION_SPEC.md §6.2` probe **loop** is owned by `packages/probe`, a new pure package holding `P_max` accounting, the pre-call `I6` check, the sole constructor of the closed five-probe call, and the `PROBE` event body; it performs no I/O and does not call `R3`, and is inserted in `DECISION_BRIEF.md §L.2` between `engine S4–S5` and `llm` (spec 1.4.23) | **Derived — the exclusions:** the loop is not `packages/engine`'s (`ARCHITECTURE.md §3` gives it *"no I/O, no network"* and `§L.2` builds it before `llm`), not `packages/oracle`'s (`AL1`, `AL8`), not `packages/generator`'s (`AL1`/`AL2`), not `packages/domain`'s (no I/O; builds at position two, so it cannot import `engine` or `llm`), not `packages/ledger`'s, and not `apps/api`'s (`§3`: *"thin HTTP over engine + ledger"*; `§9` declares no probe endpoint). **Derived — three responsibilities already had owners and were already built:** `apps/cli` acquires the surface (`§3`'s *"all filesystem I/O"*, spec 1.4.22 having made it a file), `packages/domain` validates the result (`ProbeResultDetailSchema`), and `packages/engine`'s `S4` re-solves (`SolveInput` carries `recon_reports`, `probe_attempts`, `observationIdForEntityId`). **Derived — the position:** a loop that consumes an `R3` proposal as a **value** imports no `llm`, so it can sit before it and the graph stays acyclic. **Ratified, and recorded as such:** that a new package is created at all. No frozen clause requires one and `§A.25` gave *"no new package is created"* as a tie-breaker — but that was a tie-breaker among viable homes, resting on `domain` already holding `S0`'s parts, and here no existing package holds the parts. Also ratified: the name `probe`, an implementation convention the repository does not establish. **Rejected:** `packages/llm` (its `§3` row covers none of this, and co-locating `P_max` and pre-call `I6` with the model call puts a control and the party it constrains in one boundary, against `§4` boundary 2); `packages/eval` (scoped to measurement; hosting the run loop puts the system under test inside the thing measuring it); `apps/cli` (absent from `§L.2`, so `packages/eval`'s agent runner could not import it and the loop would be **forked**, against `ARCHITECTURE.md §10`). **Not settled:** `R3`'s selection policy; M31's date-scoping field; M33's `days` bound; live-API semantics; and `§6`'s `A2_MIDDLE_CASE_UNSPECIFIED` seam, which is surfaced rather than replaced. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every §7 threshold, `BENCHMARK_VERSION` 1.0.4, `GT_VERSION` 1.1.0, and spec 1.4.22's probe source  **Superseded in part at spec 1.4.25 (M39, M40)**, which does not edit anything above: `R3`'s probe-selection policy is settled for the **control arm** by `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` policy (M39), and whether `R3` may propose `widen_temporal_window` is settled in the negative by `DECISION_BRIEF.md §L.1` rule 2 (M40). `M31`'s date-scoping field and `§T7`'s numeric `days` bound remain open. |
| M38 | The `bench/<split>/recon_report.jsonl` rows are ordered by **`entity_id` ascending**; rows whose `settlement_id` and `settled_at` are `null` are **included**; and the offline seal may **read** the artifact to compute `recon_report_sha256`, which is not a second evidence path (`RECONCILIATION_SPEC.md §6.2`, `PREREGISTRATION.md §6.2` AL8/`§9`, spec 1.4.24) | **Ratified — the order:** no frozen rule determined one. `PREREGISTRATION.md §7` requires a regeneration at the same seed to be byte-identical, which constrains determinism but not the choice; `DATA_MODEL.md §0`'s canonical traversal is scoped to `true_journal` and keys on `seq` and `account`, which this artifact does not carry; and no document states an order for any other `.jsonl` artifact, `observations.jsonl` included. `entity_id` is chosen because it is **total and never null** here, so the order needs no null rule — which ordering by `settled_at` or `settlement_id` would, both being nullable in this artifact. The order is a serialization property and carries no meaning: the query selects on `settlement_id` and `SE5` is a set measure, so no rule reads a row's position. **Derived — the null rows:** `PREREGISTRATION.md §4.2` emits a member its batch cannot carry as UNSETTLED with `settlement_id: null`, and `§6` fixes `settled_at` as *"null exactly when no settlement carried the line"*, so such a line **is** a `ReconLine` the simulation produced and `§6.2`'s membership rule admits it; that `settlement_id` is the only query key makes it unreachable, which `§6.2` states as a separate fact that does not qualify membership. Uncaptured payments remain absent because they produce no `ReconLine` at all. **Derived — the seal read:** `AL8`'s prohibition names engine and oracle and the seal is neither, exactly as `AL2` already permits the seal to hash ground truth inside `ARCHITECTURE.md §10`'s offline trust zone; `AL8`'s *"reachable only through the probe executor"* governs an agent's evidence path, the sense `EVALUATION_SPEC.md §2` gives the same phrase and `ARCHITECTURE.md §4` boundary 1 gives it of quarantined text the generator still writes to a file. The seal spends no `P_max` and a digest carries no constituent identifier into a decision. **Rejected:** widening `GENERATOR_TRUST` to cover the artifact, which would put it within reach of the `§5.3` completeness gate and make `§10` V22's asymmetry incidental rather than structural; the permission is seal-scoped and kept distinct from the probe's. **Not decided:** `M31`'s date-scoping field, which stands open. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every §7 threshold, `§18`'s `BenchmarkManifest`, `BENCHMARK_VERSION` 1.0.4 and `GT_VERSION` 1.1.0 |
| M39 | The `A3-NOLLM` static probe priority policy is **frozen into `PREREGISTRATION.md §7`** and bound by `AL3` and `DECISION_BRIEF.md §L.1` rule 12: priority order `fetch_settlement_recon` → `fetch_payment` → `fetch_order` → `fetch_refund`; the **lexicographically smallest eligible argument** for the chosen kind; first constructible entry wins, else `NO_USEFUL_PROBE` (`ARCHITECTURE.md §6.5`, `RECONCILIATION_SPEC.md §6.2`, spec 1.4.25) | **Ratified, and recorded as such — no part of it is derived.** `ARCHITECTURE.md §6.5` names the `offline` provider's `R3` a *"static probe priority list"* and `§6.2` makes that list the comparand of *"whether the LLM's probe selection beats a static priority list (`A3-NOLLM`)"*, but **no document stated the list**, and six sites recorded it open — `RECONCILIATION_SPEC.md §6.2` twice, `PREREGISTRATION.md §8`'s 1.4.17 statement, `DECISION_BRIEF.md §A.24` and `§A.30`, and register rows M31/M36/M37. **Why it had to be frozen rather than left to the implementer:** `A3`'s probe spend decides its own figures for metrics **1, 2, 3, 4, 6, 8** and **9**, all primary, so an unstated policy is an outcome-bearing free parameter of a **scored control agent**. `§7` is the only place `DECISION_BRIEF.md §L.4`'s bar on result-driven change reaches, since that rule binds *"any frozen threshold or decision parameter listed in `PREREGISTRATION.md §7`"* — outside it, the list could have been iterated against dev figures without violating any frozen rule, and `§10` V4's *"same-system controls"* rating would have been unearned. **Why these four values, argued but not claimed as derivations:** `fetch_settlement_recon` leads because it is the only probe feeding a live signal — `SE5` at 2000 bps, which `§10` V20 shows is the **only** route above `ε = 1500` — while `SE2` and `SE4` are declared expected-non-binding (specs 1.4.20, 1.4.11); the remaining three follow `§6.2`'s own declaration order among equals; lexicographic argument selection is total, order-independent and admits no human or model choice at the moment of selection, which is the property `AL7`'s successor rule was written for and which enumeration order and wall-clock order both lack (`§16` and metric 23 forbid enumeration order supplying an outcome, as `M35` already found for tie-breaks). **Fixed before anything could inform it:** at spec 1.4.25, with `R3` unbuilt in both arms, no dataset generated and no H1, dev or benchmark figure in existence. **Additionally unadjustable on TRAIN and DEV**, unlike the `SE1`–`SE5` weights, because it parameterises the control rather than the system under test. **Not decided here:** `M31`'s date-scoping field, which the policy does not read; `M33`'s `days` bound; and `R3`'s own selection policy in the `replay`/live arm, which is the model's output and not a frozen constant. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, `τ`, `ε`, `P_max = 3` and every other `§7` threshold, `§18`'s `BenchmarkManifest` shape, and `GT_VERSION` 1.1.0. `BENCHMARK_VERSION` moves 1.0.4 → **1.0.5** |
| M40 | `R3`'s proposable action set is the **four id-argument probes plus `NO_USEFUL_PROBE`**, `widen_temporal_window` excluded; `§13`'s `AmbiguityCertificate.reason` gains a fourth and final member `NO_USEFUL_PROBE_AVAILABLE` for `0 < attempts < P_max`; and a well-formed proposal rejected before budget is spent terminates the loop as an **implementation convention** (`DECISION_BRIEF.md §L.1` rule 2, `RECONCILIATION_SPEC.md §6` / `§6.2`, `ARCHITECTURE.md §6` / `§12`, spec 1.4.25) | **Ratified — the `widen_temporal_window` exclusion, and the record says ratified rather than derived.** `§6.2`, `THREAT_MODEL.md §T7` and register row M33 each state that *"whether `R3` may propose the probe is NOT settled"*, so deciding it is a choice; what makes the direction forced is that `§L.1` rule 2 is **settled, inviolable and doubly enforced** while the authority is not, and a settled invariant governs an unsettled question. **Rule 2 is unchanged and unweakened.** *Rejected:* a **string numeral**, which satisfies rule 2's letter and defeats `ARCHITECTURE.md §4` boundary 2's stated mechanism — *"the model returns an **identifier** and deterministic code **looks up** the value"* — a parsed numeral being neither; and a **symbolic token with a deterministic mapping**, which is boundary 2's own mechanism but requires a table whose values three documents have expressly declined to supply and whose only frozen candidate, M33's *"zero days"*, `§12`'s `integer > 0` excludes. **No `days` constant is invented, no numeric field is added, `§7` gains no `days` bound, and `§T7`'s hard bound stays unspecified** — unreachable through `R3` rather than supplied. The **executor's** enum is untouched at five in `§12`, `§6.2` and `§T7`: the actions one proposer may name and the calls the executor may construct are different sets. **Derived — the certificate reason.** `ARCHITECTURE.md §6` already gives `R3` the output *"one call … or `NO_USEFUL_PROBE`"*, and `PREREGISTRATION.md §7`'s M39 policy returns the same token when no priority entry is constructible, so **both arms** reach `0 < attempts < P_max`. `§6.2` left that gap open at spec 1.4.23 in terms — *"No new terminal reason is invented for a loop that stopped on `NO_USEFUL_PROBE` with budget remaining; that gap is `§6`'s and remains open"* — for the phase that made it reachable, which is this one. The mapping is **total** over `attempts`: `0` → `EVIDENCE_TIE`, `P_max` → `PROBE_BUDGET_EXHAUSTED`, strictly between → `NO_USEFUL_PROBE_AVAILABLE`, with `SEARCH_BOUND_EXCEEDED` keeping its `§4.3` meaning. **No fourth unrelated reason is added and no existing reason is re-pointed.** Through spec 1.4.24 the interval was empty, no proposer existing. **Implementation convention, labelled as one — N1.** A well-formed proposal that `packages/probe` rejects before budget is spent terminates the loop for that component; it is not re-issued, `attempts` does not move, and the terminal reason follows from the resulting state under the mapping above. Without it, an unchanged loop state produces an unchanged `input_hash`, hence an unchanged `cache_key`, hence the identical rejected proposal forever under `replay` and `offline` alike. **It is not a frozen constant, not a metric and not a constraint**: it adds nothing to `§7` or `AL3` and writes no value anywhere, which is why it is recorded at `ARCHITECTURE.md §12` beside the other failure dispositions rather than in a frozen block. **Preserved:** the certificate is emitted **iff** `ABSTAINED`; `§16`'s `body` projection, genesis and every digest definition are unchanged, `reason` having entered the hashed body through `certificate` already; and no metric on `PREREGISTRATION.md §8`'s list reads `reason`. **Not decided:** `M31`'s date-scoping field; `M33`'s `days` bound; and whether `abstentions resolved per probe spent` may support a claim — it is absent from `§8`'s 28-metric list and `EVALUATION_SPEC.md §4.13` states it is *"not a new quantity that could support a claim"*, so `§H` tier H1's evidence runs through metric 24 and the primary deltas. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every `§7` threshold, `§18`'s `BenchmarkManifest` shape, `GT_VERSION` 1.1.0. `BENCHMARK_VERSION` moves 1.0.4 → **1.0.5** |
| M41 | `DECISION_BRIEF.md §H` tier **H1**'s affirmative claim — that `R3`'s probe selection *beats* the `A3-NOLLM` static priority list — is **not answerable on the conforming v1.0.0 population**, because `R3`'s choice set is a **singleton** and `PREREGISTRATION.md §7`'s frozen policy is **weakly dominant**. Disclosed, not repaired (`PREREGISTRATION.md §10` V23, `§H`, `RECONCILIATION_SPEC.md §6.2`, `ARCHITECTURE.md §6`, spec 1.4.26) | **Derived, and nothing is ratified.** Five frozen facts compose and none is amended: `§11.1` (spec 1.4.4) gives a `bank_line` target the **empty candidate set**, so only a **settlement** target reaches `RECONCILIATION_SPEC.md §6.2`'s loop; `§11.1` gives such a target exactly **one** `settlement_id`; `RECONCILIATION_SPEC.md §4.2`'s `SE5` is **target-scoped**, so a report carrying any other `settlement_id` contributes nothing; M36 gives **only** `fetch_settlement_recon` a source; and `EVALUATION_SPEC.md §4.5`'s `net_cost_inr` carries **no probe term**, nor does any other metric on `PREREGISTRATION.md §8`'s list of 28 — a probe is **free**. Every `AMBIGUOUS` component therefore offers one probe, one reachable argument, at zero cost, and M31 (spec 1.4.17) makes repetition **idempotent**. The frozen policy takes that action every time; a proposer can match it, decline and forgo the only evidence above `ε` (`§10` V20), or spend budget that buys nothing. **A maximisation over a one-element choice set cannot be beaten.** **Disclosed rather than repaired — the `C8` treatment, applied to the experiment itself**, as `§4.1` has done for a declared-but-inert clause since spec 1.0.0 and as `SE1` (1.4.10), `SE4` (1.4.11) and `SE2` (1.4.20) already receive. **Not an implementation defect:** `R3`, `packages/probe`'s loop, the `§6.2` dispatch and `§6.6`'s composition are built, tested and correct; a **claim** is withdrawn, not a capability. **Adding the three missing probe sources would not repair it** — `fetch_payment` and `fetch_refund` are **redundant**, since `method` and the three `card_*` fields sit on every `recon_line` payload and on the `payment` observation, a refund `recon_line` carries its parent `payment_id` (`§22.1` D14), and `PREREGISTRATION.md §4.3`'s `DROP_FIELD` is **not exercised**; and `fetch_order`, whose `receipt` is genuinely quarantined and unobservable, sits behind the **inert** `SE2` consumer (spec 1.4.20) and would move no primary metric. **No probe source is added and `§12`'s five variants are unchanged.** **`PREREGISTRATION.md §7`'s `A3-NOLLM` policy stays ratified and must not be tuned** — revising it having observed that it is optimal is the result-driven change `DECISION_BRIEF.md §L.4` forbids and `AL3` binds against. **Population-specific:** a future family or amendment producing a component with several independently probeable `settlement_id`s would restore the choice and H1's power; **no such policy is decided here.** **Unchanged:** every metric formula, definition and number, the 28-metric list — `abstentions resolved per probe spent` is **not** added and stays `EXPLORATORY` (`EVALUATION_SPEC.md §4.13`) — `metric 24` `offline_parity` and its stated purpose, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every `§7` threshold including the `A3-NOLLM` policy, `§13`'s four certificate reasons, `§12`'s five probe variants, `§18`'s `BenchmarkManifest`, every `PROJECT_SPEC.md §7` success criterion, `BENCHMARK_VERSION` **1.0.5** and `GT_VERSION` **1.1.0** |
| M42 | The committed **dataset artifact unit is `(split, seed)`** — `bench/<split>/<seed>/{observations,untrusted_text,ground_truth,oracle_labels}.jsonl` plus one `benchmark_manifest.json` whose `seeds` is the singleton `[seed]`; **family is a composition dimension and not a file dimension**; `bench/<split>/recon_report.jsonl` is **unchanged and stays split-scoped** (M36), its digest identical across the manifests of one split (`PREREGISTRATION.md §4.1`/`§9`, `DATA_MODEL.md §18`, spec 1.4.27) | **Derived — the unit:** `PREREGISTRATION.md §4.1` already reads `record_counts` *"per seed range"* and defines a dataset as one *"`(split, seed)` dataset [that] holds exactly the families `§6.1` assigns to that seed's range"*; `EVALUATION_SPEC.md §2`'s protocol loops `for seed in seeds(split)` with **no family loop**; `ARCHITECTURE.md §10` scores `metrics.json` per `(agent × seed × split)`; and `PROJECT_SPEC.md §9` bounds *"one `(split, seed)` dataset"*. **Derived — the exclusion:** no frozen document anywhere introduces a per-family artifact file, so the family level had no source. **Derived — why the recon report does not move:** `§12` and `RECONCILIATION_SPEC.md §6.2` make it *"never an `Observation`, and never ingested"*, and `settlement_id`, *"its only query key"*, is unique across every family and seed — a lookup table has nothing to partition. This is why M36 could ratify a **location** for this artifact while no document ever gave one for the other three, and the asymmetry is stated here rather than inferred. **Ratified — the aggregation:** family order **F01..F10 ascending** (`§4.1`'s table order); each family's own row order preserved; **concatenation, never canonical reserialization**, so `§6.2`'s and `§10`'s declaration key order survives; UTF-8, `\n`-delimited, trailing newline; and `source_line` **re-based** 1-based within the aggregated logical file. No frozen rule determined any of these: `PREREGISTRATION.md §7` constrains **determinism** and not the **choice**, `conventions.ts`'s `U-EMISSION-ORDER` is `[ASSAY-MODEL]` and scoped **within** one family instance, and `DECISION_BRIEF.md §A.31` already found *"the observation emission order is frozen nowhere"*. This is M38's situation and takes M38's treatment. **Derived — why re-basing is required:** `U-SOURCE-FILES` numbers `source_line` 1-based **within the file**, per family instance, so a naive concatenation puts six observations at `pg_recon.jsonl` line 1 against `ARCHITECTURE.md §4`'s *"Nothing enters the system anonymously"*. **Derived — why it is free:** `ingest_hash` is `sha256` over the canonical **payload** alone, so no `ingest_hash`, no `inputs_hash` and no hashed ledger body moves. **Rejected:** a family-granular manifest — `§18`'s `record_counts` is a map **over** families **inside one** manifest and `§9` step 5's band is a **sum** over a seed's families, which one family (2,621) can never reach; and split-level aggregation of the dataset artifacts — `§10`'s `Observation` carries no seed and no family, so a split-level `observations.jsonl` could not be partitioned back into the runs `EVALUATION_SPEC.md §2` scores, and making it so would change `§10`'s shape and move `GT_VERSION`. **Not decided:** nothing about `§10`'s `Observation`, which gains no field; and `§0` rule 3's cross-family identifier uniqueness, which stays the probabilistic property the minter already characterizes and is **not** promoted to an invariant. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every `§7` threshold, `§18`'s `BenchmarkManifest` **shape**, `§6.1`'s split table, `§4.1`'s composition and `target_record_count`s, `GT_VERSION` 1.1.0, and M36 and M38 **verbatim**. `BENCHMARK_VERSION` moves **1.0.5 → 1.0.6** |
| M43 | **`apps/cli` executes both `PREREGISTRATION.md §5.3` gates**; the pure gate logic does not move (`completeness-gate.ts` in `packages/oracle`, `consistency-gate.ts` in `packages/eval`). `assay oracle --split dev` runs labels + completeness + consistency; `--split test` runs labels + completeness only. Results are written to `bench/<split>/<seed>/oracle_gate.json`, which is **not** a benchmark digest and **not** a metric; a missing or failing completeness gate is a **SEAL FAILURE** (`PREREGISTRATION.md §5.3`/`§9`, spec 1.4.27) | **Derived — the owner:** `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem I/O"*, and both gate packages perform none — `packages/oracle`'s header calls having nothing for a guard to intercept *"a stronger property than passing one"*, and `consistency-gate.ts` states *"performs **no sampling** and **no I/O** … the caller draws the pairs and `apps/cli` reads the split"*. `completeness-gate.ts` states *"`apps/cli` performs the read"*. **Derived — the exclusions:** the completeness gate cannot be `packages/eval`'s (`DECISION_BRIEF.md §K` places it in `oracle/src/` and `§L.2` builds `oracle` **before** `eval`); neither gate can be its own package's (`AL2` bars oracle code from `**/ground_truth*.jsonl`, and neither package performs I/O at all); and `§L.2` records that *"`apps/cli` is **absent from this line**"*, so it is a composition root outside the build order and importing `packages/eval` creates no cycle. **Derived — the split asymmetry:** `PREREGISTRATION.md §5.3` and `ARCHITECTURE.md §7.3` scope the consistency gate to *"pairs drawn from the **dev split**"* — a hard **build** gate — while the completeness gate *"runs on every dataset before any agent sees it"* and `§9` step 3 makes it a **seal** gate. `EVALUATION_SPEC.md §7` already writes *"# gates must pass"* for dev and `§9` step 3 *"# completeness gate MUST pass"* for test. **Derived — access:** ground truth through `GENERATOR_TRUST` alone (`AL2`), withdrawn under `--sealed` by `AL5`, so neither gate runs sealed; `recon_report.jsonl` reaches **neither** gate, `AL8`'s seal-scoped permission *"does not extend to the `§5.3` completeness gate, which stays observations-only"* and `§10` V22 rests on it; and the consistency gate **never** receives ground truth and gains no parameter for it. **Derived — the artifact:** `§5.3` already requires the inexpressibles *"with their cause and count, per family, in the same artifact as the pass"* and `EVALUATION_SPEC.md §5.4` item 4 requires both gate results in the report with the differential sample size. **Derived — aggregate-only on test:** `AL4` bars inspection of TEST outputs before the sealed run and `AL7` burns the seed on a breach, so no `target_id` and no `member_obs_ids` may be written, printed or logged for that split. **Ratified:** that step 3 becomes a **seal precondition** rather than a sequenced step — through spec 1.4.26 `assay seal` read no gate result, so a seal taken without the gate was indistinguishable from one taken after it. **Not decided, and deliberately:** the `R = 20,000` pair-drawing procedure and its seed. `§7` freezes `R` and nothing about the draw; deriving one from the dataset seed would be a silent choice, so the seed is an **operator input** and the command fails closed without it. `PREREGISTRATION.md §10` **V24**. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every `§7` threshold, `AL1`–`AL8`, `GT_VERSION` 1.1.0, and both gate implementations, which move neither package nor logic |
| M44 | The `PREREGISTRATION.md §5.3` consistency draw is **frozen in `§7` and bound by `AL3`**: `R = 20,000` **unchanged**, one independent draw per `(dev, seed)` dataset, `CONSISTENCY_DRAW_SEED = 417203` shared by every dev dataset, member-set size uniformly `1..4` drawn before the member indices, target pool every target-kind observation and member pool every member-eligible observation (`§11.1`), `anchored`/`allocated` always empty, draw order target → size → members, exactly one PRNG word per index draw (`PREREGISTRATION.md §5.3`/`§7`, `ARCHITECTURE.md §7.3`, spec 1.4.28) | **Ratified, and recorded as such:** the seed's value. No frozen rule determined it and **no derivation was available that would not have been a choice wearing a derivation's clothes** — at least four derivations from a `§6.1` dataset seed exist (`fromSeed(s)`, `fromSeed(s+1)`, `substream(s, family, stream)`, `sha256(s)`) and nothing selects among them. **What makes it legitimate is when it was fixed, not how it was computed:** before any dev consistency-gate result existed, with `bench/` absent, no dev dataset generated and the gate never run. `AL3` and `DECISION_BRIEF.md §L.4` make a later change on the basis of an observed result a spec violation. **Ratified — the sampler, and it had to be frozen WITH the seed:** a seed selects a path through a PRNG stream and selects **pairs** only with the procedure that consumes it, so a frozen seed over a free sampler fixes nothing — the member-set bound, the draw order, the pools and the words-per-pair each change the sample under an unchanged seed. `ARCHITECTURE.md §7.3` names *"the sampler and seed"* and both are settled here. **Derived — the exclusions:** the seed is **not** in the generator's `substream(seed, family, stream)` namespace, that space being one of generation **phases** to which a gate is not one; and it is **not** a `§6.1` dataset seed, which `§7` fixes for **generation**. The draw uses `ARCHITECTURE.md §11`'s vendored PRNG through the plain `Prng.fromSeed` constructor, as `EVALUATION_SPEC.md §5.2`'s bootstrap already does, sharing the algorithm and no stream name. **Derived — the terms:** `§7`'s permission to adjust *"on the TRAIN and DEV splits before the seal"* is scoped to the `SE1`–`SE5` **weights**, which rank candidates inside one agent and whose misconfiguration degrades a figure a reader can see. This parameter decides a **hard build gate's pass criterion** and a bad choice is invisible — the report line reads *"consistency: passing"*. It therefore takes the `A3-NOLLM` treatment (M39): unadjustable on TRAIN and DEV, with an override that is explicitly **non-authoritative** and **refused on a sealed or official run**. **Derived — the scope:** `EVALUATION_SPEC.md §2` loops `for seed in seeds(split)` and M43 runs the gate per dataset, so `R` counts **per `(dev, seed)`**; `§5.3`'s and `§7.3`'s *"from the dev split"* is the split the pairs come from, not a single pooled draw. **Rejected:** leaving the seed an operator input on `EVALUATION_SPEC.md §5.2`'s `bootstrapMean` precedent — that seed jitters a **reported interval** whose mean is exact and whose value a reader sees, while this one can **flip a pass/fail gate** invisibly, and `AL3` exists for decision parameters; and raising `R` to widen coverage, which would change a `§7` constant in response to reasoning about the residual. **Disclosed, not repaired:** a frozen sample is a fixed slice, so the gate's coverage is bounded — `PREREGISTRATION.md §10` **V25**, which closes **V24** and states the two threats as a trade rather than folding one into the other. **Unchanged:** every metric formula, definition and number, the 28-metric list, `C1`–`C8`, `constraint_set_hash`, `SE1`–`SE5`, every other `§7` threshold, **`R = 20,000` itself**, `§18`'s `BenchmarkManifest` shape, `§11.1`, `§6.1`'s split table, `§4.1`'s composition, every generation seed, `GT_VERSION` 1.1.0 and **every artifact byte**; `oracle_gate.json` remains a build product outside `§9` step 4's digest set (M43). `BENCHMARK_VERSION` moves **1.0.6 → 1.0.7** |
| M45 | **The seal is `PREREGISTRATION.md §9` step 1's signed `bench-v<BENCHMARK_VERSION>` tag**, and `§6.1`'s *"before the seal"* means before that tag exists; step 6's commit SHA is the seal **point** — the provenance record — and not the access boundary. `--split test` stays refused until the operator attests to step 1 with `assay generate --seal-tag <name>`, whose value must equal `bench-v<BENCHMARK_VERSION>` exactly, which is refused unless `--split` is `test`, and which is recorded in `§18`'s existing `BenchmarkManifest.seal_signature` (`PREREGISTRATION.md §6.1`/`§9`, spec 1.4.29) | **Derived — the defect:** through spec 1.4.28 `§9`'s own note named a condition and revoked it in one sentence, so **step 2 of the seal procedure was not executable**; `DECISION_BRIEF.md §A.34` recorded exactly that as *"a separate open item, deliberately untouched"*. **Derived — the root cause:** the defect was never a missing condition but a **term defined twice** — `§9` step 6 calls the commit SHA *"the seal point"* while `PREREGISTRATION.md §1`'s framing has always read *"tagged `bench-v…` (signed) **at seal time**"*. **Derived — the selection:** the tag reading is the only one under which `§9`'s own steps 2–5 are executable, and it leaves both sentences true by distinguishing *the seal* (the tag) from *the seal point* (the commit). No third condition is introduced. **Ratified — the attestation, and its minimality is the point:** `apps/cli` **cannot** establish that a tag exists — `commands/seal.ts` states the principle, *"a commit SHA read by running a subprocess is a fact about the working tree rather than about the sealed artifact"* — so detection was never available and an operator assertion is the only mechanism left. It adds **no field** (`seal_signature` already exists and is already typed *"signed git tag name"*), **no artifact**, **no trust zone**, **no exit code** and **no subprocess**. **Derived — why the equality check:** the value is checkable against `BENCHMARK_VERSION` without git, which mechanizes the exact drift `M46` corrects and makes it unrepeatable. **Ratified — it is an attestation, not a control:** `§10` **V3** already declares *"Developer tunes against the test split … Moderate — self-enforced"*, so the residual is an existing declared class and **no new threat row is opened**. **Rejected:** git-tag detection inside `apps/cli` (it runs no subprocess by design and `eslint.config.js` bans the transports); the commit reading of *"the seal"* (it makes `§9` self-blocking); and lifting `§6.1`'s bar generally, which would weaken the rule rather than make the procedure executable. **Unchanged:** `AL7`'s burn rule and its fail-closed default — an unattested `--split test` invocation is still a forbidden-list breach; `AL4`; `§6.1`'s four permitted conditions for `F07`–`F10`; the split and seed table; every metric, `C1`–`C8`, `SE1`–`SE5`, every `§7` threshold, `constraint_set_hash`, `GT_VERSION` 1.1.0 and **every artifact byte**. `BENCHMARK_VERSION` stays **1.0.7** |
| M46 | `PREREGISTRATION.md §9`'s stale literals are corrected to the benchmark version already in force: step 1 tags **`bench-v1.0.7`** and step 5 requires `benchmark_version` to read **`"1.0.7"`** (`PREREGISTRATION.md §9`, `DATA_MODEL.md §18`, spec 1.4.29) | **Derived, and purely clerical:** spec 1.4.28 moved `BENCHMARK_VERSION` 1.0.6 → 1.0.7 (M44) and **did not carry the move into `§9`'s code block**, leaving step 1 naming a tag nobody may cut and step 5 naming a literal no conforming manifest can carry. `packages/generator/src/frozen.ts` had already asserted *"§9 step 5 now requires this field to read `\"1.0.7\"`"* — a citation to text that did not exist, which is the sharpest available statement of the defect. **Derived — why this is not a version bump:** this row **applies** a bump already taken; treating a follow-through correction as a new bump would make the version count amendments rather than benchmark surfaces. **Not decided:** the `bench-v<version>` naming convention itself, which appears at `bench-v1.0.3`, `bench-v1.0.5` and `bench-v1.0.6` and is **derived from three consistent instances rather than stated as a rule** — `M45`'s equality check now pins it operationally without promoting it. **Unchanged:** every metric, threshold, seed, family and artifact byte; `GT_VERSION` 1.1.0; `constraint_set_hash`. `BENCHMARK_VERSION` stays **1.0.7** |
| M47 | **The seven agent implementations live at `apps/cli/src/agents/{assay,b0,b1,b2,a1,a2,a3}.ts` and are INJECTED into `packages/eval`**, which stays the measurement package and gains no import; `packages/eval/src/report/` **does not move**; `apps/cli/src/agents/**` may not import the filesystem door, enforced by a path-scoped ESLint rule (`DECISION_BRIEF.md §K`, `ARCHITECTURE.md §3`/`§10`, spec 1.4.29) | **Derived — the contradiction was already ratified, and §K never absorbed it:** register row **M37** (spec 1.4.23) rejected `packages/eval` as a run-loop host in terms — *"scoped to measurement; hosting the run loop puts the system under test inside the thing measuring it"* — while `§K` continued to place `agents/…` under `packages/eval/src/`. This row is the consequence of M37, not a new finding. **Derived — why M37's rejection of `apps/cli` does not reach here:** M37 rejected `apps/cli` because *"`packages/eval`'s agent runner could not import it and the loop would be forked"*, which assumes the runner lives in eval and imports downward. **Injection reverses the direction**: `apps/cli` imports `@assay/eval` and passes a constructed `Agent` in, eval imports nothing new, `§L.2`'s build order is silent on `apps/cli`, and the graph stays acyclic. **No agent is forked** — all seven share one `Agent` surface and differ only by `RunConfig` flags, which is exactly what `ARCHITECTURE.md §10` requires to keep the ablations valid controls. **Recorded — the lint's provenance:** `eslint.config.js`'s `packages/eval ↛ engine|llm|probe` bans are **derived from M37 and the measurement boundary (`ARCHITECTURE.md §10`, `EVALUATION_SPEC.md §4.11`, `RECONCILIATION_SPEC.md §6.2`), NOT from the literal wording of `DECISION_BRIEF.md §L.1` rule 3**, which binds engine↛generator|oracle and oracle↛engine|generator and names `consistency-gate.ts` only as the exception to *that* pair. Stating the provenance here stops a later reader from reading the contradiction as rule-3-vs-`§K` when it is M37-vs-`§K`. **Derived — `report/` does not participate:** a renderer reads metrics and imports no engine, llm or probe, so nothing about it was ever in tension with the bans; it stays exactly where `§K` puts it. **Derived — the enforcement (G8):** `guard.ts` states that *"the zone is an argument at the call site"*, so zones are per-read rather than per-process and a module inside the composition root is not zone-restricted by its location. Four protections already hold — `eslint.config.js` bans `node:fs` outside `apps/cli/src/fs/**`; every read declares a `ReadZone` and `AGENT` refuses both restricted artifacts; `AgentInput` carries **only** `observations` and `config`, so an agent has nothing to read *with*; and `AL1` binds `packages/engine` and `packages/oracle` **by name** and those packages do not move. The residual is closed by the mechanism `§L.1` rules 3 and 4 already use: a **path-scoped** ban, here on the filesystem door itself, deliberately not broadened further. **Unchanged:** `AgentInput`'s two fields; `AGENT_IDS` and `EVALUATION_SPEC.md §3`'s table; `packages/eval`'s existing import bans, verbatim; engine, probe and llm package boundaries; `AL1`–`AL8`; every metric, `C1`–`C8`, `SE1`–`SE5`, every `§7` threshold, `constraint_set_hash`, `GT_VERSION` 1.1.0 and **every artifact byte**. `BENCHMARK_VERSION` stays **1.0.7** |
| M48 | **`assay report` is an eighth CLI command**, its renderer staying at `packages/eval/src/report/`; `metrics.json` is keyed **`(agent_id, split, seed, llm_mode)`** and the bootstrap aggregates over `seed` holding the other three fixed; the canonical paths are `runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json` and `runs/report.html`; **scored run artifacts are committed** and `.gitignore` no longer excludes `runs/` wholesale, SQLite staying ignored (`DECISION_BRIEF.md §C` T0-9/T0-11/T0-13, `§K`, `EVALUATION_SPEC.md §5.5`/`§7`, `PROJECT_SPEC.md §7` S10, spec 1.4.29) | **Derived — the eighth command:** `EVALUATION_SPEC.md §7` invokes `assay report --out runs/report.html` inside the reproducibility guarantee, `§C` **T0-13** is a Tier-0 row distinct from T0-9 and T0-11, and `§K` already gives the renderer its own `report/` module — **three sources support a separate command against one (T0-11's enumeration) that merely omits it**. **Rejected — folding it into `bench`:** that would falsify `§7`'s literal recipe, closing one contradiction by creating another; and `§9` step 8's *"NO CODE CHANGES BETWEEN 6 AND 8"* means re-rendering a report must not require re-running the scored sweep. **Ratified — the position:** appended last, on `§8`'s own principle that metrics 27–28 are *"appended, never renumbered"*, so T0-11's seven keep their order. **Derived — the key tuple:** the two documents named overlapping subsets, not conflicting ones — `ARCHITECTURE.md §10` writes *(agent × seed × split)*, T0-9 writes *(agent × seed × llm-mode)* — and the union is forced: `packages/eval`'s `RunConfig` already carries `{llm_mode, strict_replay, split, seed}`, `strict_replay` cannot vary within the scored set because `§L.1` rule 11 fixes it true, and `EVALUATION_SPEC.md §5.4` item 6 requires `llm_mode` to be a reported dimension. **Derived — the aggregation:** `§2` requires *"Every configuration runs on ≥ 5 seeds"* with CIs, so `seed` is the resampled dimension and the other three are held fixed. **Ratified — the paths:** `runs/report.html` is **given** by `§7`; the `metrics.json` path mirrors `M42`'s `(split, seed)` nesting with the two dimensions a scored run adds, and is recorded as a **convention** on `artifacts/replay-cache.ts`'s precedent so a later amendment naming a different layout supersedes it rather than contradicting a rule nobody wrote. **Derived — committability, and why it could not wait:** `PROJECT_SPEC.md §7` **S10**, `EVALUATION_SPEC.md §5.5` and `§C` **T0-13** each require every claimed number to be traceable to a **committed** run artifact, while `§K` and `.gitignore` excluded `runs/` wholesale — so a conforming scored run produced numbers `§5.5` forbids reporting. Settling it **after** a run would mean choosing where results live after seeing them, which is the pattern `AL3` and `§L.4` exist to prevent. `*.sqlite` is already excluded globally, so the regenerable database stays ignored without a `runs/`-specific rule. **Unchanged:** every metric formula, definition, universe and number, and the 28-metric list; `§5.4`'s thirteen report obligations and `§5.5`'s forbidden practices; `C1`–`C8`, `SE1`–`SE5`, every `§7` threshold, `constraint_set_hash`, `GT_VERSION` 1.1.0 and **every artifact byte**. `BENCHMARK_VERSION` stays **1.0.7** |
| M49 | **`§17.1.1`'s `"the settlement it is allocated to"` is the settlement of the ALLOCATION UNDER EVALUATION** — the `Candidate.target_id` for a *proposed* allocation, the target of the candidate `S5` validated for an *accepted* one — and it is **not** `ReconLine.settlement_id`; `P2`/`P4` are conditioned on `AN2` and **not** on `AN1`, so a member `RECONCILIATION_SPEC.md §3` left unanchored posts `P2` under the allocation that explains it, and the anti-cross-attachment guarantee is preserved by comparing the bank evidence's `settlement_id` against the allocation's **target** (`DATA_MODEL.md §17.1.1`, spec 1.4.30) | **Derived — the phrase was undefined for the only allocation `§6` projects.** `"allocated to"` occurs **twice in the corpus**, both in `§17.1.1`'s `P2`/`P4` rows, and is defined nowhere; the nearest definition is `I4`'s *"over its **allocated lines**"* (`RECONCILIATION_SPEC.md §7`), which is the allocation `S4`/`S5` establish rather than an observed field. `DECISION_BRIEF.md §L.1` rule 4 and `ARCHITECTURE.md §4` boundary 3 both fix `journal.ts` as *"a pure posting function over a **proposed** allocation"*, and a proposed allocation's target cannot be read off a field `S1` already declined. **Derived — the alternative reading is foreclosed by a frozen reachability argument.** Spec 1.4.21 (`DECISION_BRIEF.md §A.28`, `PREREGISTRATION.md §7`) holds that *"materiality remains generally non-zero in the real case … while `P2` posts on `amount`, `fee − tax` and `tax` — so allocations differing in fee composition move the control accounts by different totals, and `AMBIGUOUS` stays reachable"*. Two candidates for one target **share every anchored member** and can differ **only** in members `§3` left unanchored, so that unamended sentence asserts `P2` firing on unanchored members inside `§6`'s projection. Under the `AN1`-necessity reading `§6`'s materiality is **identically zero** for every component, `materiality > τ` is unattainable, and `AMBIGUOUS`, `DISCRIMINATED` and the whole of `§6.2`'s probe loop are unreachable — a consequence `§11`'s worked example (*"the example still abstains, and `AMBIGUOUS` remains reachable"*), `PREREGISTRATION.md §8`'s metric list and `DECISION_BRIEF.md §H`'s H1 each contradict. **Derived — `AN1` was stated insufficient, never necessary.** `§17.1.1`'s own paragraph reads *"it is **sufficient** to reconcile a line to its settlement; it is **not sufficient** to debit `1200_BANK`"* — a bar on `AN1` **alone** carrying a bank leg, which `AN2` clears. No frozen clause makes `AN1` a precondition of `P2`. **Derived — the population is reachable and test-only, which is why this could not be left open.** `PREREGISTRATION.md §4.2`'s `DROP_SETTLEMENT_ID` at 10% of `recon_line` meets `§4.2`'s 30% clean-`bank_ref` share, so an `AN2`-confirmed settlement target with unanchored members is generic on the **test** split; `§10` **V17** states DEV cannot produce one — *"Every DEV settlement is fully `AN1`-anchored"* — so the defect would have survived every pre-seal gate and first appeared in the sealed run. **Ratified — the reading, and the record says so.** The phrase supported both readings and **neither excluded the other**; the frozen reachability argument selects one. Marked ratified rather than dressed as derivation, on the `M35` precedent. **Rejected — four repairs with no textual support:** `journalFor` **skipping** an unanchored member (`NON_POSTING_GROUNDS` is closed, *"one member per clause of `§17.1.1`"*, and a silent skip is `THREAT_MODEL.md §T8`'s lost posting); `S4` **excluding** the member from the balance or **treating** its bank evidence as zero (both delete exactly the members two candidates differ in, so materiality stays identically zero — self-defeating); and an `S1`/`S2` **guarantee** that such a member cannot reach `S4`, which `§3`, `§4`, `§11`, `§11`'s `F08` example and `V17` each contradict directly. **Not settled:** nothing about `§6.2`'s probe surface, `R3`'s proposable set (`M40`) or `M41`'s finding that H1's affirmative claim is non-answerable on the conforming v1.0.0 population — this row makes the loop **reachable**, and changes **no** policy it runs under. **Unchanged:** every metric formula, definition, universe and number, and the 28-metric list; `§6`'s materiality formula and its four outcomes; `τ`, `ε`, `K_max`, `C_max`, `P_max`, `C1`–`C8`, `SE1`–`SE5` and every `§7` threshold, so **`constraint_set_hash` does not move**; `I1`–`I9`; `§13`'s `AmbiguityCertificate`; `§17.1`'s `P1`–`P8` and `§17.2`; the closed five-probe enum and the `A3-NOLLM` policy; `§18`'s `BenchmarkManifest` **shape**; `§6.1`'s split and seed table, `§4.1`'s composition and every generation seed; and `GT_VERSION` **1.1.0**. **No artifact byte changes and no dataset exists to regenerate** — `bench/` is absent. `BENCHMARK_VERSION` moves **1.0.7 → 1.0.8**, because the row changes what a conforming agent **posts** and runs either side of it are therefore not comparable |
| M50 | **`EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` removes stage `S5`'s EVALUATION of the allocation-scoped invariants `I1`–`I8`** — not `S5` itself, and **not** *"evaluate the invariants and ignore the failures"*. An `A1` decision records `invariants_checked: []` and `invariants_failed: []`, the second empty **because nothing was evaluated rather than because nothing failed**, and `A1`'s run reaches `CLOSED`/`OPEN` like every other agent's. The row's two other expectations — *"trial balance breaks"* and *"runs end `BLOCKED`"* — are **withdrawn** (`EVALUATION_SPEC.md §3.2`, spec 1.4.31) | **Derived — `BLOCKED` contradicts three frozen clauses and defeats the criterion the ablation serves.** `EVALUATION_SPEC.md §2` closes *"A run that ends `BLOCKED` is a defect and fails the build"*; `§4.9` states *"`BLOCKED` must be **0 across every run** — it indicates a defect in ASSAY, not a property of the data"*; `PREREGISTRATION.md §8`'s **metric 14** requires the same; and `RECONCILIATION_SPEC.md §10.2` marks such a run **`invalid`** with no close report emitted. `PROJECT_SPEC.md §7` **S6** asks `A1` for *"a statistically significant ₹-harm increase"*, which needs a CI over `§2`'s *"≥ 5 seeds"*, while `EVALUATION_SPEC.md §5.5` bars *"any number that does not exist in a committed run artifact"* — so the expectation, if met, would destroy the criterion it exists to support. **Derived — a broken trial balance is unreachable through the only write path.** `§17` requires *"at every point in the event log, `Σ dr_paise === Σ cr_paise`"*, re-checked on the cumulative totals at **every append** and independently of what `S5` evaluated; `§17.1`'s `P1`–`P8` balance by construction; `DECISION_BRIEF.md §L.1` rule 4 leaves exactly one write path; and `PROJECT_SPEC.md §7` **S5** independently requires *"trial balance = 0 … on every run"*, with `ARCHITECTURE.md §12` classing a break as *"a bug in the ledger itself"*. Both withdrawals follow **`M41`**'s precedent, which withdrew an unfalsifiable claim while keeping the ablation valid and reported. **Derived — the *"evaluate and ignore"* reading is foreclosed, not merely disfavoured.** `RECONCILIATION_SPEC.md §10.1`'s `G5` is *"No allocation with a non-empty `invariants_failed` was posted"*, a runtime check over a **recorded** value; an evaluated failure must be recorded, and `G5` then refuses the allocation at the write path and again at close. The only other way to express that reading is to record an empty `invariants_failed` while failures were found, which makes the artifact assert something false — `THREAT_MODEL.md §T8`'s suppression, and barred by `EVALUATION_SPEC.md §5.5`. **Derived — the phrase named an invariant that is not in the set.** `RECONCILIATION_SPEC.md §7` evaluates `I9` *"only when the caller supplies both hashes"*, so it is run-scoped and in **no** arm's per-allocation set, `ASSAY` included; the allocation-scoped set is `I1`–`I8`. **Ratified — the reading, and the record says so.** *"Removed"* admitted both readings and neither excluded the other; the argument above selects one. Marked ratified rather than dressed as derivation, on the `M35`/`M49` precedent. **Rejected — three dispositions with no textual support:** scoping metric 14 or metric 11 to exclude `A1` (amends two frozen metrics to accommodate the defective sentence, and establishes that an agent may be exempted from a close gate); declaring `A1` an intentionally invalid control run (`§10.2` marks it `invalid`, forfeiting S6); and a second `ValidatedDecision` constructor or a skip-checks mode reachable by any caller (the first voids the brand `§L.1` rule 4 rests on, the second weakens the only path that may post to the ledger, for every agent). `§L.1` rule 4's new clause does neither: the evaluated set is a parameter **defaulting to the full set**, the empty set is reachable only from the path-allowlisted `A1` module, the brand and the single widening assertion are untouched, and the selection is recorded in `§13`'s `invariants_checked`. **Disclosed:** `PREREGISTRATION.md §10` **V26** — because ledger-side enforcement keeps running, `A1`'s harm figure is a **conservative lower bound** and no claim that it reproduces a fully unvalidated ledger may be made. **Not settled:** nothing about `A2`, `A3`, `B0`–`B2` or `ASSAY`, whose behaviour is unchanged, and no implementation — `A1` remains unbuilt and this row is ratified before its code exists. **Unchanged:** every metric formula, universe, number and the 28-metric list, metric 14 included; `§13`'s `Decision` **shape** and `§18`'s manifest shape; `§17.1`'s `P1`–`P8`, `§17.1.1`, `§17.2`, `§16`, `§14.1` and `§10.1`; `I1`–`I9`'s **definitions** and `§7`'s failure semantics; `G1`–`G5`; `C1`–`C8`, `SE1`–`SE5`, `τ`, `ε` and every `§7` threshold, so **`constraint_set_hash` does not move**; `GT_VERSION` **1.1.0**. **`BENCHMARK_VERSION` stays 1.0.8** — the M49 test is whether the amendment changes what a **conforming agent posts**, and the only arm this row settles has never posted anything, so no two runs are made incomparable. **No artifact byte changes and no dataset exists to regenerate** — `bench/` is absent |

### 22.3 `[NOT-CLAIMED]` — considered and deliberately not asserted

| # | Statement | Why not |
|---|---|---|
| N1 | `credit_type` values `refund_credit` and `dispute_credit` | Appear in no Razorpay source. Removed from the schema in spec 1.1.1 |
| N2 | `posted_at` / `credit_type` semantics | Present in the sample payload only; undocumented |
| N3 | That disputes place funds on hold via `on_hold` and release them as an adjustment | The documented mechanism is deduction (D30); `on_hold` is a Route concept (D17) |
| N4 | That `GET /v1/settlements/:id` can return constituent transactions | It returns 8 parameters (D9) |
| N5 | That UPI carries zero gateway charge | Zero MDR is not zero fee (D5) |
| N6 | That netbanking carries 1.9% | No Razorpay source states it; list price is 2% (D4) |
| N7 | That `credit = amount − fee − tax` is the documented recon identity | The endpoint documents neither the GST-inclusivity nor the identity (§6) |
| N8 | That Razorpay's reconciliation has a gap, defect or missing capability | Out of scope by policy (`PROJECT_SPEC.md §8`), and unverifiable from outside |
| N9 | That any figure in this benchmark transfers to production Razorpay data | No external validity is claimed (`PREREGISTRATION.md §10`, V2) |
