# DATA_MODEL — ASSAY

**Spec version:** 1.1.0 · **Date:** 2026-08-23

All schemas are normative. The implementation agent must not add, rename or
retype fields without a spec version bump.

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
   `disp_[A-Za-z0-9]{14}`. Synthetic IDs are drawn from the same alphabet so the
   engine cannot distinguish synthetic from real by shape. ASSAY-internal IDs use
   distinct prefixes (`obs_`, `cand_`, `comp_`, `dec_`, `evt_`, `exc_`) so a
   Razorpay ID can never be confused with an ASSAY ID.
4. **Untrusted text is never a field on a structural record.** `description`,
   `notes`, `order_receipt` and bank `narration` live only in `untrusted_text`
   (§10) and are visible only to the LLM adjudicator.
5. **Canonical JSON** for hashing: keys sorted lexicographically, no whitespace,
   UTF-8, integers only (no exponent notation). Used for every `*_hash` field.

---

## 1. Ground truth (`packages/generator`, never visible to the engine)

The generator runs a **forward simulation of the business process**. Ground truth
is a *byproduct of construction*, never an annotation and never an LLM output.

```ts
interface GroundTruth {
  gt_version: string;              // "1.0.0"
  seed: number;
  family_id: FamilyId;             // F01..F12
  // The true allocation. Every edge here actually happened in the simulation.
  allocations: Array<{
    settlement_id: SettlementId;
    entity_id: PaymentId | RefundId | AdjustmentId;
    entity_type: "payment" | "refund" | "adjustment";
    gross_paise: Paise;            // amount
    fee_paise: Paise;
    tax_paise: Paise;              // GST on fee
    net_paise: Paise;              // credit - debit contribution
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
  // True control-account balances at period end, from the simulation itself.
  true_balances: Record<AccountCode, Paise>;
  // Degradations applied, for post-hoc analysis only. NOT an ambiguity label.
  degradations: Array<{ op: DegradationOp; target_id: string; params: object }>;
}
```

**There is no `is_ambiguous` field.** Ambiguity is not authored; it is discovered
by the Ambiguity Oracle from observations alone (`ARCHITECTURE.md §7`).

---

## 2. `Payment` — mirrors `GET /v1/payments`

Field names and semantics verified against the live Razorpay test-mode API.

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
  // card sub-fields, present only when method === "card"
  card_network: "Visa" | "MasterCard" | "RuPay" | "Amex" | null;
  card_issuer: string | null;      // 4-char bank code, e.g. "KARB"
  card_type: "credit" | "debit" | null;
  // QUARANTINED — see §10, not present on the structural record
  // description, notes
}
```

**Invariants asserted at ingest:** `amount_refunded <= amount`;
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

**Invariants:** `amount_paid + amount_due === amount`;
`status === "paid"` iff `amount_due === 0`.

Orders matter to reconciliation because they are the join key to the merchant's
ERP: the merchant books receivables against orders, not payments.

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
  speed_processed: "normal" | "optimum" | "instant";
  created_at: UnixSeconds;
  // QUARANTINED: notes
}
```

**Invariants:** `amount > 0`; `amount <= payment.amount`;
`Σ refunds(payment) <= payment.amount`; `refund.created_at >= payment.created_at`.

Partial refunds crossing a settlement boundary (family F02) are the single most
common source of real-world reconciliation breaks and are a first-class case.

---

## 5. `Settlement` — mirrors `GET /v1/settlements`

```ts
interface Settlement {
  id: SettlementId;                // "setl_..."
  entity: "settlement";
  amount: Paise;                   // net amount transferred to the bank
  status: "created" | "processed" | "failed";
  fees: Paise;                     // total fee across constituent lines
  tax: Paise;                      // total GST on those fees
  utr: string;                     // bank UTR, e.g. "1568176960vxp0rj"
  created_at: UnixSeconds;
}
```

---

## 6. `ReconLine` — mirrors `GET /v1/settlements/recon/combined`

**This is the primary PG-side observation.** Field list verified against
Razorpay's published recon report schema.

```ts
interface ReconLine {
  entity_id: string;               // pay_… | rfnd_… | adj_… | trf_…
  type: "payment" | "refund" | "transfer" | "adjustment";
  debit: Paise;                    // amount debited from the merchant
  credit: Paise;                   // amount credited to the merchant
  amount: Paise;                   // gross
  currency: "INR";
  fee: Paise;
  tax: Paise;                      // GST on fee
  on_hold: boolean;
  settled: boolean;
  created_at: UnixSeconds;
  settled_at: UnixSeconds | null;
  settlement_id: SettlementId | null;
  posted_at: UnixSeconds | null;
  credit_type: "default" | "refund_credit" | "dispute_credit";
  payment_id: PaymentId | null;    // populated for refund / transfer rows
  settlement_utr: string | null;
  order_id: OrderId | null;
  method: string | null;
  card_network: string | null;
  card_issuer: string | null;
  card_type: string | null;
  dispute_id: DisputeId | null;
  // QUARANTINED: description, notes, order_receipt
}
```

**The arithmetic identity that anchors everything (invariant I3):**

```
  type === "payment"    →  credit = amount - fee - tax   and  debit = 0
  type === "refund"     →  debit  = amount               and  credit = 0
  type === "adjustment" →  exactly one of debit/credit is non-zero
```

**Fee and GST model.** `fee` is the gateway's processing fee on `amount`. `tax`
is **18% GST on the fee**, not on the transaction. The generator computes:

```
  fee_ex_gst = round_half_up(amount * rate_bps / 10_000)   // rate by method
  tax        = round_half_up(fee_ex_gst * 1800 / 10_000)   // 18%
  credit     = amount - fee_ex_gst - tax
```

Rounding is **half-up to the nearest paisa, applied once per line, never
re-derived downstream**. Getting this wrong is the fastest way for a Razorpay
engineer to disbelieve the whole dataset. Method rates are declared in
`PREREGISTRATION.md §4.2` and held fixed across the benchmark, with a mid-period
rate change as scenario family F03.

---

## 7. `BankStatementLine` — the second independent view

Not a Razorpay entity. Models what a bank's statement export actually contains.

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
narration, and no entity IDs. Reconciling it is the part Razorpay's own recon
report structurally cannot do.

---

## 8. `MerchantLedgerEntry` — the third independent view

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
interface Adjustment {
  id: AdjustmentId;                // "adj_..."
  amount: Paise;                   // signed by direction, magnitude only here
  direction: "debit" | "credit";
  reason: "chargeback_hold" | "chargeback_release" | "fee_correction"
        | "gst_correction" | "manual";
  created_at: UnixSeconds;
  related_entity_id: string | null;
}

interface Dispute {
  id: DisputeId;                   // "disp_..."
  payment_id: PaymentId;
  amount: Paise;
  status: "open" | "won" | "lost" | "closed";
  created_at: UnixSeconds;
}
```

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
                | "pg_payments" | "pg_orders" | "pg_refunds";
  source_file: string;
  source_line: number;
  ingest_hash: Sha256;             // canonical JSON hash of the raw record
  ingested_at: UnixSeconds;
  kind: "recon_line" | "bank_line" | "ledger_entry" | "payment"
      | "order" | "refund" | "settlement" | "adjustment" | "dispute";
  payload: ReconLine | BankStatementLine | /* … */;  // structural fields only
}

interface UntrustedText {
  obs_id: ObservationId;
  field: "description" | "notes" | "narration" | "memo" | "order_receipt";
  raw: string;                     // verbatim, never interpreted by the core
  length: number;
  sanitized_preview: string;       // control chars stripped, for UI display only
}
```

**Nothing in `packages/engine` may import `UntrustedText`.** Enforced by an
ESLint `no-restricted-imports` rule, verified in CI. This is the structural
prompt-injection defence: it is not that the core *chooses* not to read hostile
text, it is that it *cannot*.

---

## 11. `Candidate` and `Component`

```ts
interface Candidate {
  cand_id: CandidateId;
  target_id: string;               // what is being explained (settlement / bank line)
  member_obs_ids: ObservationId[]; // the observations proposed to explain it
  hard_constraints_satisfied: ConstraintId[];   // e.g. ["C1","C2","C4","C7"]
  evidence_score: number;          // soft score, [0,1]; NEVER used for arithmetic
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

`evidence_score` is a soft ranking signal only. It orders candidates and feeds
the ε-margin ambiguity test. **It never enters an amount, a balance or an
invariant.**

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
  evidence_score_gap: number;      // |score_a - score_b|, below epsilon
  materiality_paise: Paise;        // max |balance_a - balance_b| over accounts
  epsilon: number;                 // the pre-registered margin in force
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
| `E06_FEE_MISMATCH` | `credit ≠ amount − fee − tax` |
| `E07_GST_MISMATCH` | Tax is not 18% of fee within rounding tolerance |
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
  hash: Sha256;                    // sha256(canonical_json(body) || prev_hash)
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

**Genesis hash** = `sha256(canonical_json({run_id, dataset_hash, engine_commit,
config_hash, started_at}))`. This binds the chain to the exact inputs, so a
report cannot be attached to a different dataset after the fact.

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

**Invariant I1 (trial balance):** at every point in the event log,
`Σ dr_paise === Σ cr_paise` across all journal lines. Checked continuously during
the run and again as close gate **G2**; failure ends the period `BLOCKED` and no
close report is emitted (`RECONCILIATION_SPEC.md §10`).

**`9000_SUSPENSE_UNRECONCILED` is the honesty account.** Every abstention and
every unresolved exception posts here. Its closing balance is the single number
that says how much of the period ASSAY did not resolve. A system that reports
"100% matched" has a zero Suspense balance and no way to prove it earned one.

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
  benchmark_version: string;       // "1.0.0"
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
  gate: CloseGateResult;
  close_policy: { max_unresolved_ratio: number; max_unresolved_abs_paise: Paise };
  closed_by: { actor: "system" | "human"; id: string | null } | null;

  // --- what was decided ---
  observations_total: number;
  decisions: Record<DecisionType, number>;
  coverage_by_count: number;
  coverage_by_value: number;       // PRIMARY headline metric
  value_reconciled_paise: Paise;

  // --- what was not ---
  unresolved_value_paise: Paise;   // = abstained + open exceptions
  value_abstained_paise: Paise;
  value_exceptions_paise: Paise;
  value_suspense_paise: Paise;     // MUST equal unresolved_value_paise (G3)

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

`value_suspense_paise` must equal `unresolved_value_paise` exactly — that is gate
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

