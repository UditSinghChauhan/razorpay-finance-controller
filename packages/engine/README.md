# `@assay/engine`

Written against **specification 1.4.19 / benchmark 1.0.3**.

ASSAY's deterministic core — `RECONCILIATION_SPEC.md` stages **`S1`-`S5`**.
`ARCHITECTURE.md §3`: *"Pure functions, no I/O, no network."*

## What this package guarantees

- **`S0` is not here.** `packages/domain` owns stage `S0`'s orchestration from
  spec 1.4.18 (`DATA_MODEL.md §22.2` M32); `apps/cli` performs the filesystem
  read. This package's entry point takes an already-parsed `Observation[]`.
- **No I/O of any kind.** No filesystem, no network, no clock, no randomness.
  Every function is pure over its arguments, which is what makes the core
  replayable and what `determinism_check` (metric 23) rests on.
- **No `GroundTruth`, no oracle, no quarantined text.** Enforced by ESLint in
  CI, not by convention.
- **Deterministic ordering.** No result depends on iteration order over an
  unordered collection (`DATA_MODEL.md §16`).

## Stage status

| Stage | State |
|---|---|
| `S1` anchor | implemented |
| `S2` candidates | implemented |
| `S3` decompose | implemented |
| `S4` solve | implemented |
| `S5` validate | implemented |

## `S1` — anchor matching (`RECONCILIATION_SPEC.md §3`)

`AN1`-`AN4`. `AN5` has **no code path**: `§3` strikes it through, and its key
reads `order.receipt`, which this package is structurally forbidden to import.

- **`AN1`** `recon_line.settlement_id === settlement.id`, **referent required**.
  `packages/oracle` ratified the cheaper `settlement_id !== null` test as
  equivalent on conforming data (`O-ANCHOR-TEST`); implementing `§3`'s literal
  key here keeps the two implementations independent, which is what
  `ARCHITECTURE.md §7.2`'s consistency gate compares.
- **`AN2`** `normalize(utr) === normalize(bank_ref)` **and** amount equal.
- **`AN3`/`AN4`** established as facts and reported, **inert** for the search
  space: `DATA_MODEL.md §11.1` makes `recon_line` and `adjustment` the only
  member-eligible kinds and `§17.1.1` fixes targets as `settlement` and
  `bank_line`, so neither anchor touches a member or a target.

### Collisions

`§3`: *"An anchor is rejected if it would violate the one-allocation invariant
(`I2`)."* Two of the three classes it names are reachable here:

- **`E14_UTR_COLLISION`** — two settlements share a `(normalized UTR, amount)`
  key, so no bank line on that key can be attributed and **no `AN2` link is
  established for any of them**.
- **`E09_DUPLICATE_BANK_CREDIT`** — one settlement, two bank credits on the key.
  `§8` rule 3 holds the **later** credit, ordered by `value_date` then `obs_id`.

**`E08` is not emitted here.** `§8` rule 1 puts it at the ingest level —
*"`ingest_hash` collision within a source"* — which is `S0`'s. `S1` sees only
observations ingest already accepted and cannot perform that check correctly.

## `S2` — candidate generation (`RECONCILIATION_SPEC.md §4`)

`C1`-`C8` are implemented here **against `§4.1` directly**. `PREREGISTRATION.md
§5.2` has the engine and the oracle implement one shared *declaration*
(`@assay/domain`'s `constraints.decl.ts`, read for clause identity and binding
status) and `§5.3`'s consistency gate compares the two *implementations* — a
comparison worth nothing if they shared a predicate. No oracle code is imported.

### Clause verdicts

`PASS` · `FAIL` · `NON_BINDING` · `NOT_EVALUATED`. The last two are **different**
and `§4.1` keeps them apart: `NOT_EVALUATED` means the clause had no comparand
(`C2`'s refund half where the parent payment is absent — that absence is `E10`,
*"not a `C2` exclusion"*); `NON_BINDING` means it structurally cannot bind here
(`C3`'s bank-arrival half out of scope, `C2`'s unobservable adjustment half).

### What each clause does

- **`C1`** currency equality across members and the target, the target's being
  declared `"INR"` (`§11.1` M19).
- **`C2` refund half** — **referential** (spec 1.4.8, M22): the refund's own
  `order_id` against the `order_id` of the payment its `payment_id` names, which
  **need not be a co-member**. Where both a `recon_line` and a `payment`
  observation carry that id, **the `recon_line` governs**.
- **`C2` adjustment half** — always `NON_BINDING`. `related_entity_id` lives on
  the true-state `Adjustment`, which `§10` never makes an observation.
- **`C3`** two halves: ordering binds unconditionally; bank-arrival is
  **binding-when-in-scope**, `NON_BINDING` **per target** where no bank line is
  identified.
- **`C4`** `settled_at − created_at` in **elapsed seconds**, closed interval
  `[1, 7]` days.
- **`C3`/`C4` against a null `settled_at`** — both `FAIL` (spec 1.4.2).
- **`C5`** `credit = amount − fee` for payments, `debit = amount` for refunds.
- **`C6`** exact tie-out, zero tolerance, **allocation-wide**: the sum runs over
  the candidate's members **together with the target's already-anchored
  members**. `§3` removes anchored lines from the *search*, not from the
  settlement, and `I4` makes a settlement equal to its allocated lines.
- **`C7`** no member already in an accepted allocation.
- **`C8`** `on_hold === false`, scoped to members *"claimed as settled"*.
  **Evaluable and expected-non-binding**: it can exclude, is expected never to,
  and its exclusions are counted separately so a non-zero count is visible.
- **Co-settlement coherence** (spec 1.4.3) — reported on its own field, not as a
  clause: `constraints.decl.ts` gains no row for it and it is **not** a ninth
  constraint.

A `bank_line` target gets the **empty candidate set** (`§11.1` spec 1.4.4, V18):
settlements are not member-eligible, so `§4`'s *"bank line needing settlements"*
has no admissible member.

## `S3` — component decomposition (`RECONCILIATION_SPEC.md §5`)

*"Nodes are unanchored observations and targets; an edge joins two nodes if they
co-occur in at least one admissible candidate."* Union-find, rooted at the
**lexicographically smallest** id so the partition cannot depend on edge order.

- **`Component.member_obs_ids`** — the component's **unanchored** observation
  nodes. **`Candidate.member_obs_ids` is a different set**: `§11` (spec 1.4.6)
  makes it *"the whole allocation, ANCHORED members INCLUDED"*, so an anchored id
  appears in a candidate but is **not** a `§5` node and is filtered out before an
  edge is drawn. Without that filter an anchored member would bridge two
  otherwise-separate components.
- **`target_ids`** — the component's target nodes.
- **`total_value_paise`** — `Σ value(observation)` over `member_obs_ids` **only**;
  targets and anchored observations excluded. `§14.1`'s table: `payload.amount`
  for a `recon_line`, and for an `adjustment` **the non-zero of `debit`/`credit`,
  never `amount`**.
- **`size`** = `member_obs_ids.length`, compared against `K_max`.
- **Every** unanchored observation and **every** target is a node, so a
  degree-zero node forms its own singleton component — which is what makes `§9`'s
  *"no admissible candidate exists at all"* reportable rather than a silent
  disappearance.

### `solve_status` is deliberately not set by `S3`

`§11`'s enum is `"SOLVED" | "INTRACTABLE" | "EMPTY"`. `§4.3` gives `INTRACTABLE`
a trigger — exceeding `K_max`/`C_max` — which this stage reports as
`exceeds_k_max`. `SOLVED` belongs to the stage that solves, which is `S4`.
**`EMPTY` appears exactly once in the entire corpus, in that enum declaration,
with no trigger stated anywhere.** Setting the field here would mean inventing
one, so `S3` reports the part `§4.3` determines and leaves the field to `S4`.

## `S4` — solve and rank (`RECONCILIATION_SPEC.md §6`)

A **pure function**, `solve(input)`. `§6.2` has `R3` propose a probe and
*"deterministic code execute it and re-run the solve"*; `DECISION_BRIEF.md §L.2`
builds `llm` **after** `engine S4-S5`, so the engine cannot call `R3`. The loop is
driven outside; `solve` is called again with more accumulated evidence.

- **Scoring** — `SE1` 0 (inactive, 1.4.10) · `SE2` 0 (expected-non-binding,
  1.4.20) · `SE3` per 1.4.13 · `SE4` 0 (expected-non-binding, 1.4.11) · `SE5` per
  1.4.16 with the 1.4.17 union. Weights frozen at 3500/2000/1500/1000/2000,
  **unrenormalised**, with `round_half_up` applied **once, at the end**.
- **`τ`** from `Component.total_value_paise`, never the target amount.
- **Materiality** via `packages/ledger`'s pure `journalFor` — `§L.2` places ledger
  Layer B between `engine S1-S3` and `engine S4-S5` for exactly this. No
  persistence, no write path, no `ValidatedDecision`.
- **Ranking** — highest `evidence_score_bps`; on **exact** equality the
  lexicographically smallest **canonical allocation key** (spec 1.4.21, M35).
- **`§6`'s outcomes** — `UNIQUE` · `IMMATERIALLY_AMBIGUOUS` · `DISCRIMINATED` ·
  `AMBIGUOUS`, plus `§4.3`'s `INTRACTABLE`.

### Three branches deliberately not decided

| Branch | How it surfaces |
|---|---|
| `solve_status` `EMPTY` / `SOLVED` | **no `solve_status` field is emitted** — `§4.3` defines only `INTRACTABLE` |
| `0 < attempts < P_max` + `NO_USEFUL_PROBE` | `{ determined: false, seam: "A2_MIDDLE_CASE_UNSPECIFIED" }` |
| `R3` probe selection | not modelled; the engine never chooses a probe |

## `S5` — the validation gate (`RECONCILIATION_SPEC.md §7`)

*"The only code path that may post to the ledger. Its input is a proposed
allocation; its output is either a `ValidatedDecision` or a rejection."*

`validate` returns a **discriminated union**, so a caller cannot reach the
branded value except through the `valid: true` arm. `§7`'s failure semantics are
absolute — *"any invariant failure rejects the allocation … never partially
posted, never repaired, never downgraded to a warning"* — and every invariant is
evaluated before returning, so a rejection names **every** failure, not the first.

### The single widening assertion

`ARCHITECTURE.md §4` boundary 3 makes *"only S5 may construct"* unenforceable at
runtime under structural typing. The enforcement is the **non-exported**
unique-symbol brand in `packages/ledger/src/validated-decision.ts` plus exactly
**one** widening assertion, in `s5-validate.ts`, which `DECISION_BRIEF.md §L.1`
rule 4 permits. A discipline test counts them and fails on a second, and a
compile-time suite proves the type cannot be forged and that this package exports
no constructor, factory or minting helper.

**No persistence is added.** No write path, no close gate, no chain mutation —
tests assert all three.

### `I9` is run-scoped, and is not faked

`§7` lists nine invariants. Eight are allocation-scoped and evaluated here.
**`I9` — *"re-running the same input yields an identical ledger root hash"* — is
a property of two executions of the whole system**, which a gate holding one
proposed allocation cannot evaluate. `§7` already contemplates run-scoped
manifestations: it says `I1` *"failing at close is a hard abort of the whole
run"*. `I9` is therefore exposed as `checkIdempotency(first, second)` at its own
scope and enters a decision's `invariants_checked` **only when the caller
supplies both root hashes** — never reported as checked when it was not.

### Invariants not evaluated are skipped, never passed by default

`I5` where no bank-line mapping exists (`DATA_MODEL.md §17.1.1`: *"undefined —
not satisfied"*), `I4` with no settlement target, `I3` on an adjustment row
(`§14.1`: *"`I3` declares no `amount` identity for adjustment rows"*). A skipped
invariant is absent from `invariants_checked`, and nothing can appear in
`invariants_failed` that is not in `invariants_checked`.

**Evaluation order is an implementation convention, not a normative one.** `§7`
fixes no order and the result does not depend on one — every invariant is
evaluated and both arrays are sorted `I1`..`I9` for reporting.

## Discrepancies found while implementing `S1`-`S5`

`RECONCILIATION_SPEC.md §2` step 4 directs `S0` to put the normalized UTR
*"into a derived field, leaving the raw value intact"*. **No schema in
`packages/domain` carries such a field** — `Settlement.utr` and
`BankStatementLine.bank_ref` are the raw strings only. `§3`'s `AN2` key is
written as `normalize(...) === normalize(...)`, applying the transform at
comparison time, so this stage is implementable exactly as specified and
`normalizeUtr` lives here. The unreachable derived field is reported rather
than invented; nothing in this package depends on it existing.

**`C5` states no identity for an `adjustment` line.** `§4.1` gives
`credit = amount − fee` for payments and `debit = amount` for refunds — two of
`§6`'s three `type` values. An `adjustment` member has neither form stated, so
`C5` is left `NOT_EVALUATED` on one rather than given an invented identity. This
is a silence, not a contradiction, and it excludes nothing.

**`Component.solve_status`'s `EMPTY` has no stated trigger.** One occurrence in
the corpus — the enum declaration in `DATA_MODEL.md §11`. `SOLVED` likewise has
no trigger beyond belonging to the solve stage; only `INTRACTABLE` is defined
(`§4.3`). Reported rather than assigned; see above.

**`Component.target_ids` is typed `string[]`, not `ObservationId[]`.** `§11`
types it loosely and no clause says whether a target is named by its observation
id or its entity id. This package uses the **observation id**, because `§5` makes
the node an observation and `S2`'s `Target` is keyed that way. It changes no set
membership and no value; recorded because the specification leaves it open.
