# DATA_MODEL — ASSAY

**Spec version:** 1.3.0 · **Date:** 2026-08-25

All schemas are normative. The implementation agent must not add, rename or
retype fields without a spec version bump.

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
`receipt` is documented as at most 40 characters and required to be unique — that
documented uniqueness is what makes anchor `AN5` legitimate rather than a guess.

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

---

## 13. `Decision` and `AmbiguityCertificate`

```ts
// Per-observation terminal state. Every observation reaches exactly one.
type ObservationState = "RECONCILED" | "EXCEPTION" | "ABSTAINED" | "REFERENCE";

// Per-decision outcome. A `REFERENCE` observation produces no Decision at all,
// so `REFERENCE` is deliberately NOT a member of this union.
type DecisionType = "RECONCILED" | "EXCEPTION" | "ABSTAINED";

interface Decision {
  decision_id: DecisionId;
  run_id: RunId;
  comp_id: ComponentId;
  type: DecisionType;
  chosen_candidate_id: CandidateId | null;   // null when ABSTAINED
  uniqueness: "UNIQUE" | "DISCRIMINATED" | "IMMATERIALLY_AMBIGUOUS"
            | "AMBIGUOUS" | "INTRACTABLE";
  invariants_checked: ConstraintId[];
  invariants_failed: ConstraintId[];
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
  reason: "EVIDENCE_TIE" | "SEARCH_BOUND_EXCEEDED" | "PROBE_BUDGET_EXHAUSTED";
}
```

The certificate is the product. It is the difference between "confidence 0.62"
and "here is the specific alternative I could not rule out, here is the ₹ at
stake, and here is what I tried."

---

## 14. `Exception`

```ts
interface Exception {
  exc_id: ExceptionId;
  run_id: RunId;
  decision_id: DecisionId;
  class: ExceptionClass;           // the 14-member closed taxonomy, §15
  severity: "material" | "immaterial";  // by tau
  value_paise: Paise;
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
| `E11_TIMING_BOUNDARY` | Event falls outside the period; deferred, not an error |
| `E12_ADJUSTMENT_UNEXPLAINED` | Adjustment with no traceable cause |
| `E13_LEDGER_ONLY` | Merchant booked an entry with no PG counterpart |
| `E14_UTR_COLLISION` | Multiple settlements share a UTR prefix after truncation |

`E11` is deliberately *not* an error class — timing differences are the most
common false positive in real reconciliation, and calling them errors is how
recon tools lose analyst trust.

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
}
```

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
| P5 | Abstention or open exception on an **inbound** item — a bank credit that cannot be attributed (`E03`) | `1200_BANK` `amount` | `9000_SUSPENSE_UNRECONCILED` `amount` |
| P6 | Abstention or open exception on an **outbound** item — a settlement with no bank credit (`E04`) | `9000_SUSPENSE_UNRECONCILED` `amount` | `1100_GATEWAY_RECEIVABLE` `amount` |
| P7 | Resolution of a Suspense item | exact reversal of P5 or P6, followed by the correct posting, as **new events** | — |

P2 balances by construction: `credit + (fee − tax) + tax = amount − fee + fee =
amount`.

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

**Any posting not enumerated in §17.1 or §17.2 falls to P8.** There is no
undefined path: an event ASSAY cannot book authoritatively becomes a named,
owned, valued exception rather than a silent omission or a guess.

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
  benchmark_version: string;       // "1.0.2"
  created_at: UnixSeconds;
  generator_commit: string;
  spec_commit: string;             // commit of PREREGISTRATION.md at seal time
  families: FamilyId[];
  seeds: number[];
  record_counts: Record<FamilyId, number>;
  observations_sha256: Sha256;
  ground_truth_sha256: Sha256;     // committed BEFORE any test run
  oracle_labels_sha256: Sha256;
  constraint_set_hash: Sha256;     // the frozen hard-constraint definitions
  sealed_at: UnixSeconds | null;
  seal_signature: string | null;   // signed git tag name
}
```

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
  unresolved_value_paise: Paise;   // = abstained + open exceptions
  value_abstained_paise: Paise;
  value_exceptions_paise: Paise;
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
