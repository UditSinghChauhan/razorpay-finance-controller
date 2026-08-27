# `@assay/generator` — the benchmark generator

The forward business simulation, its ground truth, and the declared degradation
layer. `ARCHITECTURE.md §3`: *"Must be independently runnable and
seed-deterministic. Kept out of the engine so no engine code can ever import
ground truth — an import lint enforces this."*

Written against **specification 1.4.4 / benchmark 1.0.3**.

## What this package guarantees

1. **Ground truth is a byproduct of construction.** `PREREGISTRATION.md §3`: the
   simulation runs forward and records what happened. There is no
   `correct_answer` field, no `is_ambiguous` label, and no model is involved
   anywhere in this package.
2. **Every count is seed-invariant.** No population size is sampled. Each is
   `round_half_up(frozen rate x its stated denominator)`, computed in
   `composition.ts`, which refuses to load if its derivation disagrees with
   `PREREGISTRATION.md §4.1`'s published `target_record_count` table.
3. **The same seed produces byte-identical output.** The PRNG is a vendored
   xorshift128+ over `bigint`; no float is produced at any point; no clock,
   environment variable or `Math.random` is read; the amount distribution is a
   committed integer quantile table rather than a run-time `Math.exp`.
4. **Sub-streams are derived by name.** Inserting a draw in one phase cannot
   shift another phase's values, so a refactor cannot silently produce a
   different benchmark.
5. **Degradation touches observations only.** `degrade()` does not take a
   `TrueState` and cannot reach one. An operator that `§4.3` declares
   unexercised throws rather than running.
6. **Free text never reaches a structural record.** `receipt`, `narration`,
   `memo` and injected `notes` exist in the true state and leave only as
   `UntrustedText`; the frozen schemas are strict, so a leak is a parse error.
7. **This package writes no file.** `assay generate` belongs to `apps/cli`;
   `PREREGISTRATION.md §9` sequences it after the seal tag.

## Module map

| Module | Holds |
|---|---|
| `frozen.ts` | Every frozen parameter, transcribed with its clause. The only place a rate, magnitude or threshold appears as a literal |
| `conventions.ts` | The convention register — every decision the specification does not state, and whether it is ratified |
| `composition.ts` | `P = 659` -> `A, N, R, D, S, B, Adj` -> `base(P)` -> per-family `target_record_count`, checked against `§4.1` at load |
| `period.ts` | The simulated period, the 31-day grid, the clock grid that keeps `C3`/`C4` satisfiable, the `F03` instant |
| `amount.ts` / `amount-table.ts` | The frozen log-normal, realized as a committed integer quantile table; `DATA_MODEL.md §6`'s fee model |
| `prng.ts` | Vendored xorshift128+, SplitMix64 seeding, named sub-streams |
| `mint.ts` | Identifier grammars (`§0` rule 3) and the UTR shape |
| `receipt.ts` | The `receipt` format and the frozen `receipt -> order_ref` transform |
| `families.ts` | `§4.1`'s ten mechanisms and `§4.3`'s operator mapping, as data |
| `simulate.ts` | The forward simulation. True state only |
| `truth-journal.ts` | `§17.1`/`§17.2` **truth side** -> `true_journal`, `true_balances` |
| `emit.ts` | True state -> observations + quarantined text; `F05`'s withholding |
| `degrade.ts` | The six exercised operators and the four refusals |
| `seeds.ts` | `§6.1`'s split table and `§6.2` `AL7`'s successor rule |
| `manifest.ts` | `BenchmarkScenario` / `BenchmarkManifest` (`DATA_MODEL.md §18`) |
| `generate.ts` | `generateFamily(family, seed)` — the entry point |

## Specification seams

Everything below is a place where the frozen specification does not determine a
value the generator needs, or where two frozen statements disagree. **None is
resolved silently.** Each is a row in `conventions.ts` with `spec_basis: null`,
`UNRATIFIED` collects them, and a test pins the count so a new one cannot be
added without the pin failing.

### Closed at spec 1.4.2 — the seam that blocked generation

**`C-NEGATIVE-BATCH` — a capture-day batch whose refund debits exceed its
credits.** Four frozen rules are jointly unsatisfiable on some capture-days:
`Settlement.amount` is a non-negative `paiseField` (`ARCHITECTURE.md §4`); `I4`
fixes `settlement.amount = Σ credit − Σ debit` over the allocated lines; `I3`
enters a refund into that sum as a **debit**; and `§4.1`'s
one-batch-per-capture-day meets `§4.2`'s 4.5% refund rate and its heavy-tailed
amount distribution. The negative result has no representation, and through spec
1.4.1 no section of the specification said what happens.

**This package refused rather than guessing.** The row was registered as
`U-NEGATIVE-BATCH`, `simulate()` raised `NegativeSettlementError` by default, and
the alternative it implemented was marked unratified — so no dataset could be
generated on a resolution the specification had not made. **Spec 1.4.2 made it**
(`PREREGISTRATION.md §4.2`, batch composition): debit-side members are admitted
to their own batch in ascending amount, ties broken by the member's own index,
while the running net stays non-negative; a member the batch cannot carry is
emitted **unsettled** and is never moved to another batch. No row is added or
removed, so every `target_record_count` stands.

The rule is now unconditional and **there is no policy argument** — a knob whose
other position produces a dataset the frozen specification does not describe is a
way to generate a non-conforming benchmark by passing an argument.
`NegativeSettlementError` survives only as a defect guard on a branch the
admission rule cannot reach. The register keeps the row with its history, because
the ordering it records — refuse until ratified, never guess — is the point.

### Ambiguities resolved by a declared reading

| Id | Seam |
|---|---|
| `U-F09-FORCED` | `§4.2` says both *"whose settlement **draws** T+3"* (eligibility) and *"the smallest window that **makes the family reachable**"* (a guarantee). The two do not agree |
| `U-MANGLE-SPLIT` | `§4.3` gives `MANGLE_UTR`'s rate as *"10%, split evenly"* with *"5% each mode"*. At `S = 31` the two disagree: 3 against 4 |
| `U-REFUND-BATCH` | `§4.1` F02 states the F02 mechanism (*"settled in batch N+2"*) but the default batching for the other nine families is stated nowhere, and `I4` cannot be computed without one. `§4.2`'s batch-composition rule presupposes an allocation rather than supplying one, so this stays open |
| `U-DROP-SETL-DENOM` | *"share of `recon_line`"* — the kind, or the payment-type rows alone |
| `U-INJECT-ELIGIBLE` | *"10% of eligible"*, with **eligible** undefined |
| `U-CONFLICT-FIELD` | *"a row referencing two mutually exclusive parents"*, with no field named |

### Values the specification asks for and does not supply

| Id | Seam |
|---|---|
| `U-ISSUER-SET` | `§4.2` says *"issuer uniform over a **declared** 4-character code set"* and **no such set is declared anywhere** |
| `U-INJECT-VARIANTS` | `§4.3`'s corpus is *"the two exemplars ... plus **declared variants**"*, and declares none |
| `U-NARRATION` | Bank narration content. `TRUNCATE_NARRATION` is 100% of `bank_line` and *"never pads"*, so a narration must pre-exist and exceed 35 characters |
| `U-MEMO` | Merchant memo content. `SE4` carries 1,000 frozen basis points for *"method / card-network agreement with the merchant memo"* |
| `U-PARTIAL-AMOUNT` | The amount of a partial refund. `§4.2` fixes the 40% share and no distribution |
| `U-LEDGER-FIELDS` | `invoice_no`, `expected_net_paise`, `gl_account` |
| `U-BANK-FIELDS` | `running_balance` |
| `U-UTR-SHAPE` | UTR shape. One documented sample; `§22.2` M8 records at least three real shapes |
| `U-CLOCKS` | Time of day for captures, refunds and bookings. Left free, `C4` fails on the seconds reading and the oracle completeness gate would invalidate the benchmark |
| `U-ADJ-AMOUNT` | `ReconLine.amount` on an adjustment row, which `§17.2` leaves *"deliberately unconstrained"* |

### Implementation decisions with no specification counterpart

| Id | Seam |
|---|---|
| `U-AMOUNT-DISCRETIZATION` | How a continuous log-normal becomes integer paise reproducibly |
| `U-EMISSION-ORDER` | *"canonical emission order"* is referenced three times and defined nowhere |
| `U-SOURCE-FILES` | `source_file` values |
| `U-ASSAY-ID-FORM` | Suffix form for `obs_`, `bnk_`, `mle_` |
| `U-INGEST-HASH` | What `ingest_hash` covers, and what `ingested_at` reads |
| `U-SUBSTREAMS` | How a seed becomes a named sub-stream |

### Found by the adversarial pass, and repaired

**`C4` was violated on every `F07` chargeback row.** The deduction was stamped at
the settlement instant it landed in, so `settled_at − created_at` was zero,
against `C4`'s `T_min = 1` calendar day — and `C4` quantifies over *"every
member"*, which an adjustment is. Because that allocation is the **true** one, the
oracle completeness gate would have rejected it, and `§5.3` says of a failed
completeness gate that *"the benchmark is invalid and no results may be reported
from it"*. The adjustment now carries its own clock on its own day and lands in
that day's batch, exactly as a capture does. `tests/adversarial.test.ts` checks
`C1`, `C3`–`C8` against the true allocation on every family and seed, and stands
in for the completeness gate until `packages/oracle` exists.

### Two further observations, recorded rather than resolved

- **`GroundTruth.true_journal.posting_ref` has no value for two truth-side
  adjustment reasons.** `DATA_MODEL.md §17.2`'s truth table books
  `fee_correction` and `gst_correction` to named accounts but assigns them no
  rule among `P1`–`P8`, which `§1` types the field as. Both are unreachable at
  the frozen parameters (`§10` V14), so `truth-journal.ts` throws rather than
  inventing a label.
- **Three emitted-side incoherences are intended, and are bounded rather than
  removed.** `F05` withholds a `recon_line`, so three settlements no longer tie
  out from the engine's view — which is `E01` and the family's whole point.
  `F08`'s `DROP_SETTLEMENT_ID` detaches a line from its batch identifier, so the
  same tie-out breaks by **exactly** the net contribution of the detached lines,
  in either direction — detaching a payment lowers the visible sum, detaching a
  refund raises it. `F08` also leaves `settled: true` beside a null
  `settlement_id`, because `§4.3` says the operator *"sets the field to `null`"*
  and names no second field; no ingest invariant covers the pair, so the line
  breaks `AN1` without becoming a corrupt record. Each is asserted as an exact
  identity in `tests/adversarial.test.ts`, so a widening of any of them fails.
- **`GroundTruth.allocations.net_paise`'s two definitions disagree on refunds.**
  `§1` comments it as *"credit − debit contribution; = gross − fee"*. On a refund
  row `I3` fixes `debit = amount, credit = 0`, so the contribution is `−amount`
  while `gross − fee` is `+amount`. The first half is operative — it is what makes
  `Σ net = settlement.amount` hold, which the tests assert.

## Running the tests

```
pnpm run verify          # typecheck + lint + the whole workspace suite
npx vitest run packages/generator
```

Every test seed lies outside `PREREGISTRATION.md §6.1`'s split table, no test
invokes `packages/engine`, and no test prints, logs or writes an observation
payload — `§6.1`'s four binding conditions, checked in
`tests/discipline.test.ts` by scanning this package's own source.
