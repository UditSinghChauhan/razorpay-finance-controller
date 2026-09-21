# bench-v2 — design proposal: making under-determination reachable

**Status: PROPOSAL, with three decisions taken and two increments built.** No
seed is drawn, no corpus is generated, nothing is sealed. §A below states what
this corpus is not; §B records the three decisions the reviewer has taken and
the first increment (`AMB-1` alone) built under them; §C records the second
increment — four investigations the reviewer ordered before any new family,
the four remaining families (`AMB-2`, `AMB-3`, `AMB-5`, `BENIGN`), and the
rates it proposes for the pre-registration. Everything after §0 is the
reconnaissance this document began as: it reads the frozen code, states what it
found with line references, corrects the starting sketch where the code
contradicts it, and leaves every decision not listed in §B or §C as an explicit
open question (§9).

Ground rules this proposal was written under, restated so the reader can check
them against every line below:

- `runs/seal-v1.0.13/`, `bench/test/**`, tag `bench-v1.0.13` and tag
  `assay-buildathon-submission-2026` are evidence of a process and are never
  edited. Everything proposed here is **bench-v2**, with fresh pre-registered
  seeds.
- No existing generator family, oracle predicate or eval metric formula changes.
  Extensions are **additive** in `packages/generator`, `packages/oracle` and
  `packages/eval` only.
- No frozen threshold moves: `EPSILON_BPS = 1500`, `TAU = max(₹100, 10 bps)`,
  `SEARCH_BOUND = {k_max: 22, c_max: 5000}`, `P_MAX = 3`, `SE_WEIGHTS_BPS`.
- `packages/engine`, `packages/ledger`, `packages/controller`,
  `packages/domain`, `packages/money` are not touched.

---

## A. What bench-v2 is NOT

Five statements, each of which is a hard boundary rather than a caution. They
are written before any number in this document, so that every number after
them is born qualified.

1. **bench-v2 is a STRESS CORPUS.** Its ambiguity prevalence is chosen to
   exercise a path — `RECONCILIATION_SPEC.md §6`'s `AMBIGUOUS` outcome and the
   `EVIDENCE_TIE` certificate — not to estimate how often under-determination
   occurs in real settlement data. The rate at which twins, split batches and
   detached lines appear is a **declared family parameter**, set so that the
   path is reached often enough to be measured. It is not a base rate, was
   never estimated from any production population, and no production
   population was consulted in choosing it.
2. **No rate read off this corpus is a real-world frequency.** Abstention
   rate, truly-ambiguous share, coverage on the ambiguity families, the
   A2-vs-ASSAY delta, the value committed on undetermined evidence — every one
   of them is a function of the declared prevalence and would move with it. A
   figure from bench-v2 says *what the system does when a case of this shape
   occurs*; it says nothing about how often such a case occurs.
3. **No figure from it may be presented as one.** Not in a README, not in a
   decision brief, not beside a production expectation, not as "ASSAY abstains
   on X % of settlements". `EVALUATION_SPEC.md §5.5`'s rule that only numbers in
   a committed run artifact may be quoted applies; the sentence that quotes one
   must also say *stress corpus, declared rate*, every time.
4. **It exists because `bench-v1.0.13` could not measure the behaviour the
   system was built for.** `PREREGISTRATION.md §10` **V35** records that the
   sealed TEST population contained **zero** truly-ambiguous targets — 1,580
   `NO_SOLUTION`, 1,535 `UNAMBIGUOUS`, nothing else — so `truly_ambiguous`,
   `abstentions` and `probes_spent` were `0` on all fifty scored units, and
   `A2-NOABSTAIN` was indistinguishable from `ASSAY`. bench-v2 is the corpus
   in which those quantities are non-zero **by construction**, which is the
   only way they could have become non-zero without editing a sealed result.
5. **It changes nothing sealed.** `runs/seal-v1.0.13/`, `bench/test/**`, tag
   `bench-v1.0.13` and tag `assay-buildathon-submission-2026` are untouched and
   remain the reported v1 result. bench-v2 is a new `BENCHMARK_VERSION` with
   its own pre-registration, its own seeds and its own families; no v1
   family, oracle predicate, metric formula or `§7` threshold moves
   (`EPSILON_BPS`, `TAU`, `SEARCH_BOUND`, `P_MAX`, `SE_WEIGHTS_BPS`).

## B. Decisions taken, and the increment built under them

Three of §9's open questions were decided by the reviewer's order of
2026-09-20. They are recorded here as decided, with the reasoning, so that §9
reads as the list of what remains open.

| # | Decision | Closes | Reasoning |
|---|---|---|---|
| D1 | **Same-day split batch** is the twin host. A capture day's lines are settled in **two** batches at **one** `settled_at`; membership is dealt from the family's PRNG sub-stream, independently of `created_at`. The cross-day co-instant form (`(d, T+2)` with `(d+1, T+1)`) is **rejected**. | §9.1 | §1.5 found that every batch's lines share a capture day 100 % of the time in this generator. Under the cross-day form the twin from the other batch is the only member of the target's instant class captured on a different day, so `created_at` — a structural field the engine may read — identifies its batch. `RECONCILIATION_SPEC.md §5.4`'s evidence model does not encode "a batch's lines share a day", so the frozen scorer would still tie; a competent reviewer would not. Exchangeability of the twins with respect to the target is the property the whole corpus rests on (§8 R1), and it is not traded for the convenience of needing no new true-state mechanism. |
| D2 | **`DROP_BATCH_IDENTITY`** is a new `§4.3`-style operator that nulls **both** `settlement_id` **and** `settlement_utr` on a recon line, and nothing else. `DROP_SETTLEMENT_ID` is not reused. | §9.3 | §1.5 found the existing operator leaves `settlement_utr` on the row, and the settlement observation carries the same `utr`: the answer is literally in the record. The engine reads no normative rule off `settlement_utr` today (`DECISION_BRIEF.md §A.17`, M24), which is why v1's `F08` is not thereby broken — but an ambiguity family built on that hole would be one a reviewer could resolve by a join, and calling its targets undetermined would be false. A **new** operator rather than a second carrier for the old one, because `families.ts` asserts at load that each operator has exactly its declaring family as carrier, and §B.1 below states what that guard protects. The `§6.2` recon report is unaffected (built from the true state, pre-operator), so a future probe still sees truth. |
| D3 | **Stress-corpus framing** (§A) is the declared status of bench-v2, written before any number. | §8 R2, R10 | The prevalence is a parameter chosen after V35 was observed; that is unavoidable and the defence is procedural, not statistical — a new version, fresh pre-registered seeds, rates and predictions written before generation, and the v1 artifact untouched and still reported. What would make it rigged is presenting a declared rate as an estimate. §A forecloses that in the document every bench-v2 figure will cite. |

**The increment built under D1–D3 is `AMB-1` alone**, §3.1's material twins,
as the first (and so far only) bench-v2 family. Nothing else in §3 is built:
`AMB-1D`, `AMB-2`, `AMB-3`, `AMB-4`, `AMB-5` and `BENIGN` wait for the next
order. No seed block is declared, no corpus is generated, no metric is added,
the oracle's `truly_ambiguous` predicate is untouched, and nothing is sealed.
The increment's acceptance criterion was one generated settlement on which the
real engine reaches `AMBIGUOUS` with certificate reason **`EVIDENCE_TIE`** —
*not* `MATERIALITY_UNDETERMINED`, which is spec 1.4.39's M61 path for a target
without a bank comparand and exercises the M61 fix rather than the thesis. The
family therefore gives both twin-hosting settlements a clean `bank_ref` by
declaration, so that `§17.1.1`'s `P2` projection exists on both candidates and
materiality is a number, not `null`. §B.2 records what was built and how it
departs from §3.1's sketch.

### B.1 The single-carrier guard, and why D2 does not collide with it

`packages/generator/src/families.ts:83-97` runs at module load:

```ts
for (const [op, declaring] of Object.entries(OPERATOR_DECLARING_FAMILY)) {
  const carriers = IMPLEMENTED_FAMILIES.filter((f) => FAMILY_MECHANICS[f].operators.includes(op));
  const expected = declaring === null ? [] : [declaring];
  if (carriers.join(",") !== expected.join(",")) throw ...
}
```

**What it protects.** Two invariants of `PREREGISTRATION.md §4.3`'s frozen
operator → family table, checked in both directions so the mechanics table
cannot drift from the table it transcribes: (i) an operator the table maps to a
family is carried by **exactly** that family — no second carrier, no missing
carrier; (ii) an operator the table leaves unassigned (`DROP_FIELD`,
`SHIFT_TIMESTAMP`, `SWAP_ORDER_REF`, `ROUND_BANK_AMOUNT`) is carried by **no**
family — `§4.3`'s disposal rule, *"assigning them would invent a family pairing
this specification does not state"*. The carrier universe it checks over is
`IMPLEMENTED_FAMILIES`.

**Why the new operator does not collide.** The guard is over pairings, not over
families. `DROP_BATCH_IDENTITY → A01` is added to `OPERATOR_DECLARING_FAMILY`
and `A01.operators = [DROP_BATCH_IDENTITY]` to `FAMILY_MECHANICS`; `A01` is
registered in `IMPLEMENTED_FAMILIES` (it is implemented: `generateFamily`
accepts it and `TARGET_RECORD_COUNT` derives its count). The guard then finds
carriers `[A01]` against expected `[A01]` and passes **as written**. Nothing is
relaxed, nothing is weakened, and the guard now also protects the new pairing:
a second family declaring `DROP_BATCH_IDENTITY`, or `A01` declaring
`DROP_SETTLEMENT_ID`, fails at load exactly as a v1 drift would.

**The collision that was avoided, stated so it is not re-proposed.** Had `A01`
been kept in a separate list outside `IMPLEMENTED_FAMILIES` — to leave the v1
list byte-identical — the guard would have computed carriers `[]` against
expected `[A01]` and refused to load. The only ways through would have been to
widen the guard's universe (a change to the guard) or to leave the new pairing
out of `OPERATOR_DECLARING_FAMILY` (which makes `degrade()` refuse the operator
under the disposal rule, or requires a parallel table the guard does not see).
Registering the family where the guard looks is the additive path.

### B.2 `AMB-1` as built

The family id is **`A01`** — a separate namespace from `§4.1`'s `F01..F12`
(§9.2, now decided by construction: `FAMILY_IDS`, the v1 table `benchmarkScenarios()`
transcribes into a manifest, is untouched; `BENCH_V2_FAMILY_IDS` holds the new
namespace and `FamilyId` is the union). Every parameter below is a new
pre-registered constant in `frozen.ts`'s bench-v2 section; no v1 constant moves.

| Piece | As built | Departure from §3.1 |
|---|---|---|
| Split days | `round_half_up(AMB1_PAIR_RATE × 31)` days, `AMB1_PAIR_RATE = 10 %` (Convention 1) → **3 pairs, 6 targets per instance**. | §3.1 proposed 20 %; §9.4 is still open. Convention 1 is the frozen default for an undeclared rate and is used **provisionally** so that no new number is chosen in this increment; the bench-v2 pre-registration may re-declare it before any seed is drawn. |
| Twin selection | Two captured, settling payments of the split day, neither refunded nor disputed, drawn from the `amb1` sub-stream. | §3.1 said nothing about refunds/disputes. Excluding them keeps the twins' `payment` observations identical in `status` and `amount_refunded` and keeps every `refund`/`dispute` row off the pair — a refund on one twin would be a field that distinguishes them. |
| Twin A | Method drawn from `{upi, netbanking, wallet}` — the 200-bps methods **excluding card**; gross drawn from the frozen amount table **conditioned on `credit ≥ ₹9,000`** (`AMB1_MIN_CREDIT_PAISE`). | Card is excluded so that `card_network`/`card_issuer`/`card_type` are `null` on both twins rather than three further differing fields. The condition is on the twin's own credit, a margin over §2's ₹7,981 threshold. |
| Twin B | `emi` (300 bps); gross solved by bounded search so that `credit(B) = credit(A)` exactly. | As §3.1. The search is total: `credit` rises by at most one paisa per paisa of gross, so every integer credit in range is attained. |
| Shared clock | `created_at(B) := created_at(A)` — drawn once, shared, the `F06` discipline. | §3.1 relied on same-day alone. With one `settled_at` and one `created_at` the twins tie on `SE3` **exactly**, so the only live signal is silent and the ordering of best/second is the canonical-key tie-break alone. Two captures in one second is a declared construction, not a claim about volume. |
| Split | The day's batch is dealt into `S₁` (keeps the day's id, cycle and instant) and `S₂` (new id, new UTR, same `settled_at`). Which twin stays is a coin from the `amb1` stream; every other member is dealt by its own coin. Debit members are admitted per half by `§4.2`'s ascending-amount rule; a debit its dealt half cannot carry goes to the other half, and one neither half can carry is emitted UNSETTLED, exactly as `§4.2` already does for a day batch. | New mechanism, as §3.0 sketched; the debit rule is the one addition, needed because a split half has less credit than the whole day. |
| Bank side | Both `S₁` and `S₂` carry a clean `bank_ref` **by declaration**, in addition to the frozen 30 % draw over all settlements. | §3.1's T5. The dark arm is `AMB-1D`, not built. |
| Operator | `DROP_BATCH_IDENTITY` on exactly the two twins per split day, selected **by construction from the pair** and carried on the `Emission` beside `F05`'s `withheld_recon_lines`; the operator draws nothing. It sets `settlement_id` and `settlement_utr` to `null` and touches no other field; the degradation record names both fields. | As §3.0. The selection is the family's, not a rate; the operator still only removes information from observations. |
| Composition | `S = 34`, `B = 34` → `target_record_count = 2621 + 6 = 2627`. | As §3.0's `δ = +2k`. |

Predicted outcomes, recorded before the run in §B.3: engine `AMBIGUOUS` /
`EVIDENCE_TIE` on all six targets per instance; `Δs = 0` bps; materiality
`≈ 1.25 % × credit`, i.e. ≥ ₹112 against `τ = max(₹100, 10 bps × (amount(A) +
amount(B)))`; oracle `TRULY_AMBIGUOUS` with `solution_count = 2`.

### B.3 The end-to-end run

`generateFamily("A01", 7001)` (7001 is in no `§6.1` block) through
`runAssayComposedFull(..., { agentId: "ASSAY" })` — the composition
`agentById("ASSAY").run` drives, evidence returned instead of discarded.
Pinned by `apps/cli/tests/bench-v2-amb1.test.ts`. **Not benchmark evidence**
(§A): one instance of a stress family at a test seed.

```
solve_outcomes   UNIQUE 21 · IMMATERIALLY_AMBIGUOUS 0 · DISCRIMINATED 0 · AMBIGUOUS 6 · INTRACTABLE 0
abstentions      6   (the six twin-hosting settlements, and nothing else)
EPSILON_BPS      1500          TAU  { floor_paise: 10000, component_value_bps: 10 }
oracle           TRULY_AMBIGUOUS 6 (solution_count 2 on each) · UNAMBIGUOUS 28 · NO_SOLUTION 34
```

Per target (every one `outcome AMBIGUOUS`, `certificate_reason EVIDENCE_TIE`,
`evidence_score_gap_bps 0`, `probes_attempted []`,
`shared_hard_constraints [C1..C8]` — eight, both candidates identically):

| target | pair | component | materiality_paise | tau_paise | τ arithmetic |
|---|---|---|---|---|---|
| `setl_VthVS5x5cWj1q6` (S₁, day 6) | A `pay_kz8dUDmyIgJysF` wallet ₹58,222.21 / B `pay_sQ1jUDAzMMTXCA` emi ₹58,934.45, credit ₹56,848.17 each | `comp_2820…` | **71,224** = \|5,893,445 − 5,822,221\| | **11,715** | `max(10,000, floor(10 bps × 11,715,666))` = `max(10,000, 11,715)` |
| `setl_FQVoLeEzZpQHcs` (S₂, day 6) | same pair | same | 71,224 | 11,715 | same |
| `setl_BUUgxGHCYH34Wy` (S₁, day 18) | emi ₹12,808.82 / wallet ₹12,654.02, credit ₹12,355.39 | `comp_7b82…` | 15,480 | 10,000 | `max(10,000, floor(10 bps × 2,546,284) = 2,546)` |
| `setl_JGzPoPPhOGtj9Q` (S₂, day 18) | same | same | 15,480 | 10,000 | same |
| `setl_peE5fLGlUraOq2` (S₁, day 21) | netbanking ₹9,699.88 / emi ₹9,818.54, credit ₹9,470.96 | `comp_15eb…` | 11,866 | 10,000 | `max(10,000, 1,951)` |
| `setl_NAlyFEihRGaTsc` (S₂, day 21) | same | same | 11,866 | 10,000 | same |

Materiality is the `1100_GATEWAY_RECEIVABLE` leg of `P2` — `Σ amount` differs,
`1200_BANK` cannot (`C6`), as §1.1 point 4 predicted. The oracle's `tau_paise`
on the day-6 pair is **11,716** against the engine's **11,715**: §1.6's
`roundHalfUp` vs `Math.floor` divergence, observed at exactly one paisa.

Both candidate allocations, day-6 pair, target `setl_VthVS5x5cWj1q6`
(nine anchored members shared; the tenth is the twin):

```
solution_a  cand_14c7…  [ …9 anchored…, obs_dxudBUJz1tswNr ]   = pay_kz8dUDmyIgJysF  wallet  amount 5,822,221
solution_b  cand_e71c…  [ …9 anchored…, obs_tTqro0DwcKvYGv ]   = pay_sQ1jUDAzMMTXCA  emi     amount 5,893,445
```

Both twin-hosting settlements carry an `AN2` link (`bnk_NYR7PGISn2SmkE`
`bank_ref 2774104925c956bp` ↔ `setl_VthVS5x5cWj1q6`; `bnk_bTEdH4rkpPQiel`
`1479789551e11o15` ↔ `setl_FQVoLeEzZpQHcs`), which is why `materiality_paise`
is a number and the reason is `EVIDENCE_TIE`, not `MATERIALITY_UNDETERMINED`.

**Adversarial check on the construction — the twins field by field.** The two
`recon_line` observations differ in `entity_id`, `order_id` (identity) and
`amount`, `fee`, `tax`, `method` (the deliberate, material difference) and in
**nothing else**: `created_at`, `settled_at`, `credit`, `settled`,
`settlement_id = null`, `settlement_utr = null`, `card_*`, `dispute_id`,
`payment_id`, `posted_at`, `credit_type`, `on_hold`, `currency`, `type`, `debit`
are equal. The `payment` observations differ in `id`, `order_id`, `amount`,
`method` only; the `order` observations in `id`, `amount`, `amount_paid` only.
**One residual difference outside the observations `S2` reads:** the merchant
`ledger_entry` of twin A carries a `booked_at` one day earlier than its
`created_at` — `§4.2`'s 10 % merchant-clock offset, drawn from the `merchant`
sub-stream before and independently of the family's coin. It cannot indicate
batch membership (both batches are the same day and instant) and no live
signal reads it, but it is a field that differs and is recorded here as such;
excluding offset captures from twin candidacy is a one-line change if the
reviewer wants the ledger side identical too (§9.10).

**An engine observation, not a defect claim.** An abstained settlement commits
no allocation, so its anchored constituents get no `targetOfMember` entry and
`classifyMember` sends them to `E02_MISSING_SETTLEMENT` (payments) /
`E11_TIMING_BOUNDARY` (refunds) — 54 lines here, across the six targets —
rather than to `ABSTAINED` with the component's certificate. That is
`apps/cli/src/agents/assay.ts` as written and has never been reached on
generated data before; it bears on `unresolved_value_paise` and on the `A2`
comparison and is for the next order to read, not this one to change.


---

## C. Increment 2 — four investigations, four families, the rates

Order of 2026-09-21. Same constraints as §B: additive in `packages/generator`
and its tests plus `apps/cli/tests`; no engine, oracle predicate, metric or
`§7` threshold moves; every `§4.1` family and `A01` byte-identical (checked
against the pre-increment generator at seeds 7001 and 7002 over observations,
untrusted text, ground truth and recon report — 22 digests, all equal).
Nothing here is benchmark evidence (§A): every number below is one stress
family at a test seed, measuring a mechanism, not a rate.

### C.1 The four investigations

**A1 — the "seven missing targets" do not exist.** The two figures are over two
populations. The oracle labels **every** settlement, anchored or not
(`enumerate.ts:294` emits `status: "ANCHORED"` with one solution for a
settlement whose anchored members tie out), and every bank line; the engine's
`solve_outcomes` tallies **`seam.targets` only**. On `A01` at 7001:

| population | oracle | engine stage | engine terminal state |
|---|---|---|---|
| 28 settlements, fully `AN1`-anchored | `UNAMBIGUOUS`, `solution_count 1` | `S1`, `AN1_ALREADY_TIED_OUT` — never enter `S2` | `RECONCILED`, all 28 |
| 6 twin-hosting settlements | `TRULY_AMBIGUOUS` | `S4` `AMBIGUOUS` | `ABSTAINED` / `EVIDENCE_TIE` |
| 13 bank lines `AN2` matched | `NO_SOLUTION` | `S1`, `AN2_MATCHED` | `RECONCILED` |
| 21 bank lines not matched | `NO_SOLUTION` | `S2` with zero candidates → `solve` returns `UNIQUE` with `best === null` | `EXCEPTION` / `E03` |

The 28 `UNAMBIGUOUS` and the 21 `UNIQUE` are **disjoint sets**; `28 − 21 = 7`
is a coincidence of two unrelated counts. Every oracle-determinable target
reached the oracle's one solution. Verdict: none of (i), (ii), (iii) — a
denominator misread, and finding (iii) is **zero**, so no redesign. Two
consequences for the metric definitions to come: (a) on `AMB-1` alone the
false-abstention denominator is **empty** — no determinable settlement reaches
`S2` — which is what `BENIGN` is for; (b) `solve_outcomes.UNIQUE` is not
"targets committed on one solution": it also counts every zero-candidate target
(`s4-solve.ts:681`), so a per-family outcome distribution (§4.3) must split
`UNIQUE` by `best === null`. Pinned in `apps/cli/tests/bench-v2-families.test.ts`.

**A2 — the `tau` divergence, guarded.** Confirmed: engine
`max(10_000, Math.floor(V × 10 / 10_000))` (`s4-solve.ts` `tauFor`), oracle
`max(10_000, roundHalfUp(V × 10 / 10_000))` (`classify.ts:112`), `V` the
component's unanchored value. They differ by exactly one paisa when `V mod
1,000 ≥ 500` and the proportional term exceeds the floor (`V > ₹1,00,000`);
over 20 seeds of `A01` the two differed on **18 of 120** abstained targets (46
had the proportional term binding). The disagreement window is
`(tau_floor, tau_round_half_up]`: a materiality inside it is `AMBIGUOUS` to the
engine and `IMMATERIALLY_AMBIGUOUS` to the oracle. **The guard**
(`packages/generator/tests/bench-v2-families.test.ts`, "the tau guard"): over
seeds 7001–7020 and every split of `A01`, `A02`, `A03`, the materiality
computed from the true state is never inside the window and is at least ₹1
clear of both values, on the side the family declares. Both formulas are
restated in the test (this package may import neither). **Nothing trips it:**
the smallest `materiality − max(tau)` observed is 1,420 paise (`A01`, ₹9,000
credit floor → Δ ≈ ₹112.8 against ₹100), `A02`'s smallest over the whole
committed table is ₹156, and `A03`'s components are worth ~₹10k so the floor
binds on both formulas and they cannot diverge. The engine-side companion
(`apps/cli/tests`, "A2") checks certificate `tau_paise` against the oracle
label's on the same targets: `|diff| ≤ 1`, never straddling.

**A3 — exchangeability, measured.** Frame: the twin that **stays** in the day's
own batch (`settlement_a`, keeps id/cycle/instant) versus the twin that
**moves** to the appended batch. Merchant-ledger `booked_at` offset, `A01`:

| seeds | pairs | offset on stay only | on move only | both | share on stay |
|---|---|---|---|---|---|
| 7001–7020 | 60 | 10 | 5 | 0 | 0.667 |
| 7001–7040 | 120 | 16 | 8 | 1 | 0.667 |
| 7001–7100 | 300 | 27 | 27 | 3 | **0.500** |
| 7001–7200 | 600 | 52 | 56 | 8 | 0.481 |

The offset is drawn from the `merchant` stream before and independently of the
family's coin, so the expected share is exactly ½. The 20-seed figure the
order asked for is a **15-pair sample** (10:5; two-sided p ≈ 0.30 on a fair
coin) and says nothing either way — at 10 % offset incidence, 20 seeds yield
too few single-offset pairs to measure a rate, which is why the pin is over
200 seeds. Pinned for `A01`, `A02` and `A03` (`bench-v2-exchangeability.test.ts`):
share in `[0.33, 0.67]`, the fair-coin 99 % band at ~55 single-offset pairs. The offset is **not removed**
(§9.10): an independent difference is evidence the construction is not scrubbed.

*Correlation sweep, every field.* For each of the twins' four observations
(`recon_line`, `payment`, `order`, `ledger_entry`), their envelope (`obs_id`,
`source_line`, `ingest_hash`) and their quarantined text (`order_receipt`,
`memo`), the sign of `compare(stay, move)` over 300 pairs (100 seeds):
**48 fields identical on every pair; 33 fields differ and every one splits
within 135:165** — the identity fields, the deliberate `(amount, fee, tax,
method)` difference and what derives from it (`gross_paise`,
`expected_net_paise`, `memo`), the envelope (minted and line-numbered in
payment-index order, and the index is a coin: lower index stays 154/300), and
`booked_at`. No field is skewed. Pinned at 40 seeds with the coin set listed
exhaustively, so a new differing field fails the test by name.
**One asymmetry, on the targets:** the appended batch's `settlement` and
`bank_line` observations always carry a later `source_line` (300/300) — a
reader can tell which of the two batches is the split-off one. It names no
twin: the twin-to-batch coin is independent of everything (EMI twin stays
135/300), which is what the sweep measures. Pinned as a known asymmetry.
Through the engine, over 20 seeds, **`best` — what `A2-NOABSTAIN` commits — is
the truth twin on 60 of 120 abstained targets (0.500)**; pinned in
`[0.38, 0.62]`.

**A4 — the abstention cascade, quantified (`A01` at 7001, nothing changed).**

| target | half | anchored constituents | ASSAY constituent states | own Suspense items | A2 target | A2 constituents | A2 twin |
|---|---|---|---|---|---|---|---|
| `setl_VthVS…` day 6 | S₁ | 9 (9 pay) | 9 × E02 | 9 | RECONCILED | 9 RECONCILED | committed, **right** |
| `setl_FQVo…` day 6 | S₂ | 9 (8 pay, 1 refund) | 8 × E02, 1 × E11 | 8 | EXCEPTION/E05 | 8 × E02, 1 × E11 | none |
| `setl_BUUg…` day 18 | S₁ | 15 (13 pay, 2 refund) | 13 × E02, 2 × E11 | 13 | RECONCILED | 15 RECONCILED | committed, **wrong** |
| `setl_JGzP…` day 18 | S₂ | 4 (4 pay) | 4 × E02 | 4 | EXCEPTION/E05 | 4 × E02 | none |
| `setl_peE5…` day 21 | S₁ | 11 (11 pay) | 11 × E02 | 11 | EXCEPTION/E05 | 11 × E02 | none |
| `setl_NAly…` day 21 | S₂ | 6 (6 pay) | 6 × E02 | 6 | RECONCILED | 6 RECONCILED | committed, **wrong** |
| **total** | | **54** | **51 E02, 3 E11** (+ 3 `refund` views E11) | **51** | 3 / 3 | 30 RECONCILED, 23 E02, 1 E11 | 3 committed |

Rupees. ASSAY: `value_abstained_paise` = **5,16,851.95** (the six settlement
amounts); the 51 E02 lines post P6 and open their own Suspense items worth
**₹3,85,992.17** (38,599,217 paise) — value that is already inside the six
abstained amounts, so `unresolved_value_paise` (₹54,21,169.37 on this
instance) carries it twice; the six twins are `ABSTAINED`/`MEMBER` and post
nothing (§17.1.1's third abstention row, working as written). A2: commits
**33 lines worth ₹3,06,575.00** (30,657,500 paise) where ASSAY excepts or
abstains — 30 constituents (₹2,25,998.89) plus the three tie-broken twins
(₹80,576.11), of which two twins (₹22,353.90) are wrong in fact; the other
three targets fail `I2` on the already-committed twin and land in
`EXCEPTION/E05` with their 24 constituents cascading exactly as under ASSAY.
A2's `unresolved_value_paise` is lower than ASSAY's by ₹6,60,814.85.

*Is E02/E11 correct?* **No.** `DATA_MODEL.md §15` defines `E02` as *"captured
and past the settlement window, never settled"* and `E11` as an event outside
the period or a refund whose settlement falls outside it. These lines are
`settled: true`, carry a `settled_at` and a `settlement_id`, and `AN1` anchored
them to a settlement observation that exists in period. They were settled;
their settlement is undetermined. The taxonomy that fits is the one the twins
already get — `ABSTAINED`/`MEMBER` carrying the component's certificate — and
the cascade produces a misleading class because `classifyMember`
(`assay.ts:1705`) gives that state only to **pool** members of an abstained
component; anchored members are not in the component's member list
(`s3-decompose.ts` nodes are unanchored members and targets) and fall through.
Under A2 the `E05_AMOUNT_MISMATCH` class on the `I2` fallout is a second
misnomer: the tie-out did not fail by a delta, the member was already
allocated. Both are `apps/cli/src/agents/assay.ts` as written, reachable only
on this corpus, reported here and not changed. **Headline framing this
decides:** "ASSAY abstains on 6 settlements (₹5.17 lakh)" is the true sentence
about the mechanism; "ASSAY leaves 54 items unresolved" is also true but
counts the same break 55 times and mislabels 54 of them; the honest metric is
per **target** with the cascade disclosed and `unresolved_value_paise` reported
beside its double-counted component.

### C.2 The families, as built and as observed

Every parameter is a new constant in `frozen.ts`'s bench-v2 section; rates are
**Convention 1, provisionally** (three days each), as `AMB-1`'s, with §C.3
proposing the final values. Each family carries `DROP_BATCH_IDENTITY`, whose
`OPERATOR_DECLARING_FAMILY` row is now a **list** `["A01", "A02", "A03",
"A05", "B01"]`; `families.ts`'s guard is unchanged in both directions
(carriers must be exactly the declared ones, in order — a family that runs the
operator unlisted, or a listed one that drops it, still refuses to load), and
the `§4.3` rows stay single-valued. `TrueState` gains `identity_drops`
(members selected by construction) and `SimSplitBatch` a `construction` tag and
an `A02` `refund` index; `emit.ts` maps drops to entity ids and decides nothing.

| id | family | construction | expected | **observed at 7001** | matches? |
|---|---|---|---|---|---|
| `A02` | `AMB-2` refund netting | 3 split days; `P` and `P2` on one non-card method, one clock; an **existing** refund rewritten onto `P2` (`R = max(₹250, 5 % × credit(P))`, same day, after the capture, forced into `P2`'s half first); `credit(P2) − R = credit(P)`; all three lines detached; both halves clean `bank_ref` | `AMBIGUOUS` / `EVIDENCE_TIE`; oracle `TRULY_AMBIGUOUS`, 2 solutions; `Δ2200 = R`, `Δ1100 ≈ R/0.9764` | 6 × `AMBIGUOUS`/`EVIDENCE_TIE`, materiality 25,604 or 103,336 vs `tau` 10,000; solutions `{P}` vs `{P2, R1}` on every target; oracle `TRULY_AMBIGUOUS` × 6, `solution_count 2`, 8 subsets enumerated over a 3-line pool; gate passes; **gap 6–15 bps, not 0** | yes — the non-zero gap is the refund's later clock (sub-ε). **Finding:** `best` is the refund-carrying allocation on **both** targets of a pair (`SE3` mean favours the shorter refund lag), so A2 is right on exactly one per pair — ½ by symmetry, not by coin |
| `A03` | `AMB-3` sub-`tau` boundary | `AMB-1`'s twins with the gross delta drawn in **[₹51, ₹80]** (155 table atoms; credit ≈ ₹4,070–6,385); both halves clean `bank_ref` | `IMMATERIALLY_AMBIGUOUS` at frozen `tau`, commit; `AMBIGUOUS` at the ₹50 and ₹10 sweep floors; oracle `IMMATERIALLY_AMBIGUOUS` | 6 × `IMMATERIALLY_AMBIGUOUS`, 0 abstentions, oracle `IMMATERIALLY_AMBIGUOUS` × 6 at `tau` 10,000; at `tauFloorPaise` 5,000 and 1,000: 6 × `AMBIGUOUS`, 6 abstentions — **the sweep is non-flat** | yes. **Finding:** the immaterial accept on a coupled pair commits **one** target (the smaller canonical key's twin, to whichever target posts first) and the other fails `I2` → `EXCEPTION/E05`; the uncommitted twin lands in `E02`. Three of six touched targets are exceptions on a family the oracle calls determinable |
| `A05` | `AMB-5` search bound | 3 batches at pairwise-distinct instants, **15** payment lines each detached; no split; frozen `bank_ref` draw | `S2` `INTRACTABLE` → `ABSTAINED` / `SEARCH_BOUND_EXCEEDED`; oracle enumerates `2^15`, `UNAMBIGUOUS`; metric 4 false abstention | 3 × `ABSTAINED`/`SEARCH_BOUND_EXCEEDED`; oracle `UNAMBIGUOUS`, 1 solution, 32,768 enumerated over a 15-line pool; `abstentionMetrics`: abstained 3, truly ambiguous 0, **precision 0** — reported as such | yes on the verdict. **Finding:** `solve_outcomes.INTRACTABLE` is **0** — the bound is `S2`'s `GenerationStatus`, `solve` sees no candidate and returns `UNIQUE` with `best === null`, and the §6 tally counts these under `UNIQUE`; `certificateFor` fills `solution_a`/`solution_b` with **empty** allocations and `materiality 0`. And the A4 cascade reaches all 45 detached lines: `E02` each |
| `B01` | `BENIGN` | three disjoint day blocks in one instance: `BEN-1` one line detached (3 days), `BEN-2` two lines (3 days), `BEN-3` a same-day split with one line from each half and credits differing ≥ ₹1 (3 days, 6 targets); `BEN-1`/`2` days avoid `BEN-3`'s days **and instants** | `UNIQUE` / `UNAMBIGUOUS` on all 12; every one reaches `S2` | 12 × `RECONCILED`, oracle `UNAMBIGUOUS` with 1 solution; pools of 1 (`BEN-1`) or 2 (`BEN-2`, `BEN-3`), 2 or 4 subsets enumerated; every detached line committed to its true settlement; 0 abstentions | yes. `BEN-3` is `AMB-1`'s host with nothing rewritten — same split, same pooling, same 2-line class — so the only difference from `AMB-1` is that the credits differ, which is what makes it the direct control |
| — | `AMB-4` | **deferred** to the probe phase (§3.4): indistinguishable from `AMB-1` while the loop is inert | — | — | — |

`AMB-2`'s equal-value/different-cardinality form (§3.2 `AMB-2i`, two same-rate
captures against one) is **not built**: it is `IMMATERIALLY_AMBIGUOUS`, which
`A03` already exercises as a boundary control with a declared margin, and as an
ambiguity case it is not useful. If it is ever wanted it is a
`DISCRIMINATED`-unreachable immaterial control, not an ambiguity family.

### C.3 Rates, derived

`AMB1_PAIR_RATE` and its siblings are Convention 1 (three days of 31) in the
code. The pre-registration should re-declare them from what each metric
needs, and the derivation is below. Units: `T` truly-ambiguous targets per
seed, `B` determinable targets reaching `S2` per seed; a block is five seeds;
`n` is the count the metric divides by. Three tools: a proportion's resolution
is `1/n`; its standard error at `p = ½` is `0.5/√n`; with zero events observed
the 95 % upper bound on the rate is `3/n` (rule of three).

1. **Abstention recall per family** (§4.1's per-family cut) predicts 1.0 on the
   clean-bank arm; what the corpus can *say* is `≥ 1 − 3/n`. To claim ≥ 0.95
   per family at block level needs `n ≥ 60` per family per block, i.e. **12
   targets per instance = 6 split days = 20 % of 31**, for `AMB-1` and for
   `AMB-2` each. At 10 % (`n = 30`) the bound is 0.90, and a single miss reads
   as 3.3 % of a seed's targets rather than 8 %. Seed-level recall (`n = 12`)
   resolves only to 1/12 and is a diagnostic, not a result.
2. **The R3 leak detector** (§4.4, `a2_misallocation / committed ≈ ½`) is a
   block-level statistic: at `T = 12` from `AMB-1` alone, `n = 60` per block,
   SE 0.065, so a leak at 0.7 is 3σ; at seed level (`n = 12`, SE 0.14) it is
   not readable. `AMB-2` does not add to this test — its ratio is ½ by
   symmetry (§C.2) — so the detector rests on `AMB-1`'s 6 pairs.
3. **False-abstention rate** needs a denominator on which one false abstention
   moves the rate by less than the effect anyone would act on. The
   mechanism-level expectation is ~0.05 % (a subset-sum coincidence needs
   equal credits from a 2,048-atom table); no feasible block resolves that,
   so the criterion is: **one event must read below 0.5 %**, i.e. `B ≥ 200`
   per block, and the zero-event upper bound then sits at 1.5 %. Per `B01`
   instance the yield is `BEN-3` days × 2 + `BEN-1` days + `BEN-2` days,
   bounded by 31 days and by `BEN-1`/`2` having to avoid `BEN-3`'s instants
   (a `T+2` day's instant is shared by its `T+1` successor and `T+3`
   predecessor; ~3 and ~5 such days exist, so ≤ 8 days can be blocked).
   **`BEN-3` 8 days (26 %), `BEN-1` 6 (19 %), `BEN-2` 6 (19 %) → 28 targets
   per instance, 140 per block**, with 20 days used and ≥ 11 − 8 spare
   against the instant constraint. `AMB-3`'s targets are determinable and
   reach `S2` (12 per instance at 20 %, 60 per block) and count in `B`, so
   `B = 200` per block from one `B01` and one `A03`. A second benign slot
   would need a **second family id** (`B02`, same mechanics) because two
   instances of one id at one seed are byte-identical; it takes `B` to 340
   (upper bound 0.9 %) at the cost of one instance per seed, and is
   recommended if the band allows it.
4. **`AMB-3`** at 20 % (6 pairs, 12 targets) for the same per-family reason
   as 1: the `tau` sweep's non-flatness is `2k` flips per seed, and the
   `I2`-fallout finding (half its targets except) is a per-family count that
   should be measurable at `n ≥ 60`.
5. **`AMB-5`** is qualitative: metric 4's precision on it is 0 by the
   metric's own construction whatever the count, and in a mixed block it
   would be `T/(T + 5k)` — a number chosen, not measured. Keep **3 batches
   (Convention 1)** for within-seed replication, and keep it in its **own seed
   block** as §3.7 does, so the primary block's precision measures the benign
   mechanism and the search-bound block's measures the bound. Its 45 `E02`
   lines per instance (the cascade) will dominate that block's exception
   counts, which is the point.

Resulting per-seed shape for the primary block: `[A01, A02, A03, B01]` (+
`B02`) → `T = 24`, `B = 40` (+ 28), abstentions expected 24, ~13.1k records
(+2.6k) — inside the band. Per-instant pooling across `A01`/`A02`/`A03` at
20 % each is expected on ~4–5 days per seed; it merges no component (the
families' candidates share no member) and adds a third solution only on an
exact-credit coincidence, which the oracle labels and the per-family
`solution_count` distribution (§8 R5) makes visible. Disjoint declared day
ranges per family remain the cleaner composition and are the next order's
call, as is the search-bound block's fourth instance (`[A05, B01, B02]` is
below the 10,000 floor).

### C.4 Findings for the next order, collected

Reported, not repaired, all in `apps/cli/src/agents/assay.ts` or the §6 tally:

1. **The cascade** (§C.1 A4): anchored constituents of an abstained target are
   classed `E02`/`E11` and the `E02` lines re-post their value to Suspense.
2. **Immaterial accept on a coupled pair** (`A03`): one commit, one
   `I2` refusal reported as `E05_AMOUNT_MISMATCH`, one twin in `E02`.
3. **`SEARCH_BOUND_EXCEEDED` is invisible in `solve_outcomes`** (`A05`): the
   bound is `S2`'s and the tally counts the target under `UNIQUE`; the
   certificate carries two empty solutions.
4. **`UNIQUE` conflates one solution with none** (§C.1 A1): zero-candidate
   targets tally as `UNIQUE` with `best === null`.
5. **Metric 4 disagrees with the engine's own bound** (`A05`): a true engine
   bound on an oracle-determinable target is a false abstention under the
   frozen formula. Reported as such; §4.2's `EXPLORATORY` companion is where
   the other reading lives.

---

## 0. The one-paragraph answer

The frozen scorer already makes every material two-candidate component abstain
without any special construction, because pre-probe `evidence_score_bps` is
`SE3` alone and `SE3`'s largest attainable gap is 469 bps against `ε = 1500`
(`RECONCILIATION_SPEC.md §4.2`, spec 1.4.13). **The sealed benchmark produced no
abstention not because ties were hard to hit but because no target ever had two
admissible candidates that differed materially in the books.** Constructing that
requires exactly three things, all of which the code permits and none of which
requires a frozen value to move: (1) two disjoint sub-multisets of a co-instant,
unanchored pool with the same net credit; (2) a difference in their
`(amount, fee, tax)` composition — or a refund in one of them — that moves a
control account by more than `τ`; and (3) an `AN2`-matched bank line on the
target settlement, without which `packages/engine`'s materiality is identically
zero and the engine accepts silently while the oracle says `TRULY_AMBIGUOUS`.
Point (3) is the finding that most changes the sketch, and point (1) implies the
twin must itself belong to a *second* settlement at the same instant, so every
genuine tie comes as a **coupled pair of targets**. The sketch's `AMB-1`
(identical twins) is not an abstention case at all — it is the sub-`τ` boundary
case — and the probe contract can break a tie only when the allocation is
essentially a single line. Details follow.

---

## 1. Step 1 — what the code actually does

### 1.1 `S4`: the five evidence signals

Source: `packages/engine/src/s4-solve.ts`, `scoreCandidate` at lines 400–447,
weights in `packages/engine/src/frozen.ts:106-112`.

```ts
// s4-solve.ts:412-422
  // SE1: permanently INACTIVE (spec 1.4.10). Both comparands are target-scoped,
  // so it takes one value across every candidate of a target. Weight retained.
  const se1Unit = 0;
  // SE2: EXPECTED-NON-BINDING on v1.0.0 (spec 1.4.20). `order_ref` lives only on
  // MerchantLedgerEntry and no frozen clause pairs one with a candidate.
  const se2Unit = 0;
  const se3Unit = se3(members, input.mode_days);
  // SE4: EXPECTED-NON-BINDING on v1.0.0 (spec 1.4.11), agreement function
  // deliberately undefined. Weight retained, unreallocated.
  const se4Unit = 0;
  const se5Unit = se5(memberIds, input);
```

| Signal | Weight (bps) | Input it reads | What it computes | **What makes two different subsets score identically** |
|---|---|---|---|---|
| `SE1` | 3500 | *nothing* — `se1Unit = 0` literal (`s4-solve.ts:414`) | Constant 0. Spec: UTR prefix match between `settlement.utr` and the `AN2` bank line's `bank_ref`; both comparands are target-scoped so it cannot order candidates | **Always.** Every candidate of every target scores 0. |
| `SE2` | 2000 | *nothing* — `se2Unit = 0` literal (`:417`) | Constant 0. Spec: Jaro–Winkler between `order_ref` and quarantined `receipt`, post-`fetch_order` only; no frozen clause pairs a ledger entry with a candidate | **Always.** |
| `SE3` | 1500 | `member.payload.settled_at`, `member.payload.created_at` of **every member of the allocation, anchored included** (`scoreCandidate` builds `members` from `candidate.member_obs_ids`, which is the whole allocation); `input.mode_days` (run-level, `modalLagDays` at `:296`) | `lag_days = (settled_at − created_at)/86400` (real); member score `max(0, 1 − |lag_days − mode_days| / 6)`; candidate score = **arithmetic mean** over members (`se3` at `:332-345`) | Iff the two allocations have the **same mean member score**, up to `round_half_up` on the final bps sum. Since candidates for one target share every anchored member, this reduces to the *unanchored* parts having equal `Σ score` **and equal cardinality**, or compensating differences. Two twins with the same `created_at` and the same `settled_at` tie exactly; two twins from different capture days never do (Δ up to ~469/n bps for an n-member allocation). **The tie is not needed for `AMBIGUOUS`**: pre-probe `Δs ≤ 469 < ε` for any pair, so `DISCRIMINATED` is unreachable and only the ordering of best/second depends on it. |
| `SE4` | 1000 | *nothing* — `se4Unit = 0` literal (`:421`) | Constant 0. Spec: method/card-network agreement with quarantined memo, post-`fetch_payment`; agreement function undefined | **Always.** |
| `SE5` | 2000 | `input.recon_reports` filtered to `settlement_id === input.target_entity_id`; the union `R` of their `constituent_entity_ids`; `input.observationIdForEntityId` to map to `R*`; the candidate's `member_obs_ids` `M` (whole allocation) (`se5` at `:366-392`) | Jaccard `|R* ∩ M| / |R* ∪ M|`, 0 when the union is empty. **0 for every candidate before any `fetch_settlement_recon` probe** | Pre-probe: **always** (all 0). Post-probe: iff both candidates have the same Jaccard against the report. For the resolution question see §1.9 — a one-member swap in an n-member allocation changes `SE5` by only `4000/(n+1)` bps, which clears `ε` **only when n = 1**. |

Consequences, all derived from the table and none needing a new number:

1. **Pre-probe, `evidence_score_bps = SE3` exactly**, and `SE3 ∈ [0.6875, 1)` on
   any conforming dataset, so `Δs ∈ [0, 469]` bps. `solve` therefore reaches
   `DISCRIMINATED` for no pre-probe pair (`s4-solve.ts:706`), and the outcome of
   any two-candidate component is decided **entirely by materiality**
   (`:693`): `≤ τ → IMMATERIALLY_AMBIGUOUS` (accept best), `> τ → AMBIGUOUS`
   (abstain, `EVIDENCE_TIE` when `probe_attempts = 0`, `certificateReason` at
   `:754`).
2. "Two subsets that tie on all five signals" is therefore **the wrong
   target**. Tying exactly on `SE3` only changes *which* candidate is `best` (the
   canonical-key tie-break, `:624-634`), never whether the component abstains. The
   thing to construct is **two admissible candidates whose ledger projections
   differ by more than `τ`**.
3. **Materiality has a hidden precondition** (`balances` at `:514-520`):

   ```ts
   function balances(members, bankEvidence, allocatedTo) {
     const out = new Map<AccountCode, number>();
     if (bankEvidence === null) return out;
   ```

   `bank_evidence` is non-null only for a settlement `S1` linked by `AN2`
   (`assay.ts` passes `bankSide.evidence.get(target.obs_id) ?? null`). On a
   settlement whose bank line has no clean UTR — **70 % of settlements under
   `§4.2`'s frozen `bank_ref` share** — both projections are empty,
   `materiality = 0 ≤ τ`, and the engine returns `IMMATERIALLY_AMBIGUOUS` and
   **commits `best`**. `packages/oracle/src/classify.ts:63-79`'s
   `projectAllocation` posts `P2`/`P4` **unconditionally** and labels the same
   target `TRULY_AMBIGUOUS`. This is register row `M49`'s reading working as
   ratified (`DATA_MODEL.md §22.2`), and it means: **an ambiguity family whose
   settlements carry the frozen 30 % clean-`bank_ref` share will see ASSAY
   abstain on at most ~30 % of its truly-ambiguous targets and silently guess on
   the rest**, indistinguishably from `A2-NOABSTAIN`. §3.7 makes this a
   declared design dimension rather than an accident.
4. Materiality, when reachable, is `max` over `1200_BANK`, `5100_PG_FEE_EXPENSE`,
   `1300_GST_INPUT_CREDIT`, `1100_GATEWAY_RECEIVABLE`, `2200_REFUND_LIABILITY`
   of the per-account difference between the two allocations (`P2`: DR bank
   `credit`, DR fee-expense `fee − tax`, DR GST `tax`, CR receivable `amount`;
   `P4`: DR refund-liability `amount`, CR bank `amount` —
   `packages/ledger/src/journal.ts:1033-1092`, mirrored at
   `oracle/classify.ts:66-74`). `C6` forces `Σ credit − Σ debit` equal, so the
   `1200_BANK` leg **never** separates two candidates. Separation comes only from
   `Σ amount`, `Σ fee`, `Σ tax` or the presence of a refund. **Identical twins
   (same amount, fee, tax) have materiality exactly 0.**

### 1.2 `C1`–`C8`: which are subset properties

Source: `packages/engine/src/s2-candidates.ts`, one function per clause, lines
178–383; evaluated over the **whole allocation** — anchored members prepended —
by `evaluate` (`:402`, `const all = [...ctx.target.anchored_members, ...members]`).
The oracle's independent copy is `packages/oracle/src/predicates.ts`.

| Clause | Checks | Property of |
|---|---|---|
| `C1` | every member `currency === "INR"` (`:178-183`) | **member** |
| `C2` refund half | refund member's `order_id` equals its parent payment's `order_id`, via `parentOrderIdResolver`; `NOT_EVALUATED` when the parent is absent (`:196-212`) | **member** |
| `C2` adjustment half | hard-coded `NON_BINDING`, `expectedNonBinding: true` (`:414-423`) | — |
| `C3` ordering | `settled_at !== null && created_at <= settled_at` per member (`:220-229`) | **member** |
| `C3` bank-arrival | `settled_at <= target.bank_value_date` per member; `NON_BINDING` when the target has no `AN2` bank line (`:236-249`) | **member** (against a target field) |
| `C4` | `settled_at − created_at ∈ [1 day, 7 days]` in seconds per member (`:256-267`) | **member** |
| `C5` | `credit === amount − fee` (payment) / `debit === amount` (refund) per member; adjustments unevaluated (`:277-290`) | **member** |
| `C6` | `Σ credit − Σ debit === target.amount`, zero tolerance, over the allocation (`:309-317`) | **SUBSET** |
| `C7` | no member in `ctx.allocated` (`:320-326`); **empty set in every run today** — `buildSeam` defaults `allocated` to `new Set()` (`s1-s2-seam.ts:485-486`) and `assay.ts` passes none. Cross-target exclusivity is enforced later, by `I2` at `S5` (`s5-validate.ts:224-235`) | member, but inert at `S2` |
| `C8` | `on_hold === false` for members with non-null `settled_at` (`:344-353`) | **member** |
| co-settlement coherence | every member shares one `settled_at`; not a ninth constraint (`:362-375`); applied **as a pool partition** before enumeration (`:533-539`) | **SUBSET** |

So: a subset is admissible iff every member individually passes `C1`–`C5`,
`C7`, `C8`, **and** all members share `settled_at`, **and** the subset's net
equals the target's amount. **"Two disjoint subsets both explain one
settlement" is therefore a pure subset-sum condition over a co-instant pool of
individually-admissible lines.** No taxonomy of exceptions produces it; a
construction of amounts does.

### 1.3 `S2`: the pool and what makes two subsets both eligible

`generateCandidates` (`s2-candidates.ts:504-608`):

```ts
// s2-candidates.ts:533-539
  const classes = new Map<number, Member[]>();
  for (const m of [...pool].sort((a, b) => byId(a.obs_id, b.obs_id))) {
    const s = m.payload.settled_at;
    if (s === null) continue;
    if (anchoredSettledAt !== null && s !== anchoredSettledAt) continue;
    ...
// :550-560
    if (members.length > SEARCH_BOUND.k_max) { status = "INTRACTABLE"; continue; }
    const total = 1 << members.length;
    for (let mask = 1; mask < total; mask += 1) {
      enumerated += 1;
      if (enumerated > SEARCH_BOUND.c_max) { status = "INTRACTABLE"; break; }
```

- **The pool** is `seam.pool`: every member-eligible observation `AN1` did not
  anchor, across the **whole `(split, seed)` dataset, all families concatenated**
  (`s1-s2-seam.ts:384-414`; `assay.ts:1037` calls `generateCandidates(seam.pool, context)`
  for every target). `AN1` is `recon_line.settlement_id === settlement.id`
  with the referent required (`s1-anchor.ts:166-181`); the oracle's test is
  `settlement_id === null` (`oracle/enumerate.ts:114`) — equivalent on a
  conforming dataset, **not** equivalent on one with a dangling id (§8, R7).
- **A target** is a settlement unless its `AN1`-anchored members already satisfy
  `C6` (`s1-s2-seam.ts` header; oracle mirror at `enumerate.ts:294`). A
  settlement with one line's `settlement_id` nulled is therefore a target, and
  its anchored members fix the candidate class to the settlement's own instant.
- **Members with `settled_at === null` are never candidates** (`:536`). This is
  why `F06`'s unsettled twin (`simulate.ts:350-351`, `settles: false`) never
  produced a second candidate: it has no `settled_at`. **`F06` was never an
  ambiguity family; it is an anchoring-collision family.**
- Two subsets are both eligible for one target iff both lie in the target's
  instant class, both pass the per-member clauses, and both net to
  `target.amount` (with the anchored members included in the sum).
- **Tractability**: `c_max = 5000` binds at a class of 13 members
  (`2^13 − 1 = 8191`); `k_max = 22` binds only for classes of 23+. Any
  ambiguity construction must keep each instant class at **≤ 12 unanchored
  lines dataset-wide** (all families in the seed contribute to the same class —
  every family shares `PERIOD` and `settlementInstant(day)`,
  `period.ts:73-76`). The oracle is looser (`K_ORACLE = 30`,
  `C_ORACLE = 2,000,000`, `oracle/frozen.ts:65-68`), so classes of 13–20 are
  `INTRACTABLE` for the engine and enumerated by the oracle.
- The enumeration starts at `mask = 1` — the empty proposal is never a candidate;
  the oracle starts at `mask = 0` (`enumerate.ts:198`). No effect on the designs
  below, because a target whose anchored members tie out is excluded before
  either enumerates.
- On `INTRACTABLE` from `c_max` the candidates found **before** the bound are
  kept (`candidates.push` precedes the `break`), and `solve` is still run over
  them; `classifyTarget` sends the target to `ABSTAINED` with
  `SEARCH_BOUND_EXCEEDED` (`assay.ts:1616-1625`). Under `A2`, `result.best` of a
  **truncated** enumeration is committed if one exists (§8, R9).

### 1.4 `S3`: what puts two observations in one component

`decompose` (`s3-decompose.ts:164-221`): nodes are every unanchored member and
every target; **an edge is drawn between a target and every member of each of
its admissible candidates** (`:180-190`, "a candidate's target and its members
co-occur, so they form a clique"); union-find rooted at the smallest id.

```ts
// s3-decompose.ts:180-190
  for (const { target_id, candidate } of input.candidates) {
    const nodes: string[] = [];
    if (targetIds.has(target_id)) nodes.push(target_id);
    for (const id of candidate.member_obs_ids) { if (poolIds.has(id)) nodes.push(id); }
    nodes.sort();
    const first = nodes[0];
    if (first === undefined) continue;
    for (const n of nodes) uf.union(first, n);
  }
```

**The answer to "will twins land in one component" is yes, unconditionally, by
construction:** if `A` and `B` are both candidates for target `S`, `S–A` and
`S–B` are both edges. The partition is by candidate co-occurrence, **not** by
`settled_at`; the co-settlement partition the order refers to lives in `S2`
(§1.3) and only bounds which subsets get enumerated. The risk is the opposite
one: **over-merging**. If `A` is also a candidate for a second target `S'` (and
it will be — §2.1), then `S, S', A, B` are one component; if some other target
at the same instant admits a subset containing `A` (a subset-sum coincidence),
that target joins too. `total_value_paise` — `τ`'s base — is `Σ amount` over
the component's **unanchored** members only (`:208-210`, `observationValue`
`:80-85`), so for a coupled twin pair it is `amount(A) + amount(B)`.

`exceeds_k_max` is `member_obs_ids.length > 22` on the **component**
(`:216`), which `solve` reads first (`s4-solve.ts:603`). The `c_max` bound is
`S2`'s and is carried on `GenerationStatus`, not the component.

### 1.5 The generator: families and the extension point

- **Declaration**: `packages/generator/src/families.ts:47-77`,
  `FAMILY_MECHANICS: Record<FamilyId, FamilyMechanics>`, one row per family,
  six boolean mechanism flags plus an operator list. The type
  `FamilyMechanics` (`:23-40`) *is* the extension point: a new mechanism is a
  new flag on the interface, read by `simulate.ts` (true state) or `emit.ts`
  (emission) under `if (mechanics.<flag>)`.
- **Ids**: `FAMILY_IDS` (`frozen.ts:19-21`) is a closed union `F01..F12`;
  `IMPLEMENTED_FAMILIES` is `F01..F10`; `F11`/`F12` are "specified, NOT
  IMPLEMENTED" (`PREREGISTRATION.md §4.1`: multi-currency, split settlement) and
  should **not** be reused. New families extend the union (`F13+`, or a new
  `A`-prefixed namespace — open question §9.2). `GroundTruth.family_id` is typed
  `FamilyId` (`generate.ts:49`) so the extension flows through.
- **Seeding**: every draw comes from `substream(seed, family, streamName)`
  (`prng.ts`); `simulate(family, seed)` builds one `TrueState` per family
  instance; `generateFamily` runs `simulate → buildTrueJournal → emit → degrade`
  and hangs the recon report off the true state (`generate.ts:1-21`).
- **Composition**: `datasetFor(seed)` (`dataset.ts`) concatenates the family
  instances `familiesFor(seed)` names (`seeds.ts:58-67`, reading
  `SPLIT_TABLE`, `frozen.ts:352-357`) in `F01..F10` table order; the seal
  checks each family's `target_record_count` against
  `PUBLISHED_TARGET_RECORD_COUNTS` (`frozen.ts:67-71`) and the per-seed total
  against the `10,000–20,000` band (`manifest.ts`, `RECORD_COUNT_BAND`). A
  standard family instance is `base = 2P + 2N + 2R + D + S + B + Adj = 2621`
  records at `P = 659` (`composition.ts:94-104`), so **a bench-v2 seed needs
  4–7 family instances**.
- **Operators**: `OPERATOR_DECLARING_FAMILY` (`frozen.ts:236-247`) maps each
  of the ten `§4.3` operators to **exactly one** family or `null`, and
  `families.ts:83-97` asserts at load that the carriers of each operator are
  exactly `[declaring]`. **A new family cannot reuse `DROP_SETTLEMENT_ID`**
  without either relaxing that uniqueness check (a change to an existing
  invariant) or declaring a new operator. This matters: every ambiguity family
  needs an unanchored-but-settled line, and `DATA_MODEL.md §6` makes
  `settled_at` null exactly when no settlement carried the line, so such a
  line is **only** producible by degradation.
- **A leak in the existing operator**: `DROP_SETTLEMENT_ID` nulls
  `settlement_id` only (`degrade.ts:130-147`); the recon line still carries
  `settlement_utr: settlement?.utr` (`emit.ts:147`, `:174`, `:213`), which equals
  `settlement.utr` on the settlement observation. The engine and oracle read no
  normative rule off `settlement_utr` (`DECISION_BRIEF.md §A.17`, M24), but the
  answer is **literally in the row**. For bench-v2 the new operator must null
  both fields (§3.1). This is the single most important realism/rigging point
  in §8.
- **`F06` today** (`simulate.ts:317-353`): 3 pairs per instance, shared amount
  and method, same capture day, exactly one settles. The unsettled twin is
  emitted with `settlement_id: null, settled_at: null` and is inert for `S2`.
  Its true-state construction ("amount drawn ONCE") is the precedent for the
  equal-net construction below.
- **Batches**: one settlement per capture day, `S = 31`, ~19 captures per day
  (`N = 593`, `evenSplit(N, 31)`); `settled_at = settlementInstant(day + cycle)`
  with cycle `T+2` default, `T+1` for 10 % of days, `T+3` for 15 %
  (`SETTLEMENT_CYCLE`). **Two batches share a `settled_at` instant whenever
  `d₁ + c₁ = d₂ + c₂`** — e.g. `(d, T+2)` and `(d+1, T+1)` — which already
  occurs in every instance and is the only mechanism by which lines of two
  settlements can be co-instant today.

### 1.6 The oracle: where `truly_ambiguous` is decided

`packages/oracle/src/classify.ts:165-204`, `classify`:

```ts
// classify.ts:177-203
  if (result.status === "K_ORACLE_EXCEEDED" || result.status === "C_ORACLE_EXCEEDED")
    return { ...base, label: "INTRACTABLE", ... };
  if (result.solutions.length === 0)  return { ...base, label: "NO_SOLUTION", ... };
  if (result.solutions.length === 1)  return { ...base, label: "UNAMBIGUOUS", ... };
  const projections = result.solutions.map((s) => projectAllocation(membersOf(s, membersByObsId)));
  let max = 0;
  for (i) for (j > i) { const d = materiality(a, b); if (d > max) max = d; }
  return { ...base, label: max > tau ? "TRULY_AMBIGUOUS" : "IMMATERIALLY_AMBIGUOUS", ... };
```

- **The predicate already exists and is correct**; no new oracle predicate is
  required to *produce* a `TRULY_AMBIGUOUS` label. It returns 0 everywhere
  today because `enumerateAll` never finds two solutions for one target —
  `PREREGISTRATION.md §10` V35: *"the oracle labelled 0 targets ambiguous on
  all ten TEST seeds, 1,580 NO_SOLUTION and 1,535 UNAMBIGUOUS and nothing else"*.
- `truly_ambiguous` in the eval is exactly the set of labels equal to
  `"TRULY_AMBIGUOUS"` (`packages/eval/src/metrics/abstention.ts:47-76`,
  `trulyAmbiguousTargets` at `:75`).
- **Two engine/oracle divergences that a construction must respect** (both are
  properties of frozen code, reported not repaired):
  1. The oracle's materiality is the **pairwise maximum over all solutions**;
     the engine's is **best vs second only**. They agree when a target has
     exactly two solutions, or when every pair is material. A three-solution
     target where the two lexicographically-smallest keys are immaterial
     twins and the third is material will be oracle-`TRULY_AMBIGUOUS` and
     engine-`IMMATERIALLY_AMBIGUOUS`. **Design rule: every ambiguity family
     produces exactly two solutions per target, or all-pairs-material.**
  2. The oracle projects `P2`/`P4` unconditionally; the engine only under
     `AN2` evidence (§1.1 point 3).
- `tauFor` differs by rounding: oracle `roundHalfUp(value × 10 / 10_000)`
  (`classify.ts:112-114`), engine `Math.floor` (`s4-solve.ts:571-573`). At most
  1 paise, and only when the proportional term exceeds the ₹100 floor
  (component value > ₹1,00,000). Design rule: keep every intended materiality
  at least ₹1 away from `τ`.
- The completeness gate (`completeness-gate.ts:170-236`) **scopes out**
  budget-exhausted targets (`SCOPED_OUT_BUDGET_EXHAUSTED`) rather than failing;
  an `INTRACTABLE`-by-design family therefore does not break the seal.

### 1.7 The eval: abstention metrics as they stand

`packages/eval/src/metric-list.ts` — the frozen `§8` list. Abstention-related
rows: **4** `abstention_precision, abstention_recall` (`metrics/abstention.ts`),
**16** `forced_abstention_rate` and **17** `abstention_spike_flag`
(`metrics/robustness.ts`, `abstention.ts:132+`), **25**
`component_size_distribution, intractable_rate` (`metrics/components.ts`),
**8** `gap_to_oracle` (`metrics/cost.ts`), and the diagnostics carried on
metric 4's record.

```ts
// abstention.ts:85-117, abstentionMetrics
  const ambiguous = trulyAmbiguousTargets(labels);              // oracle label == TRULY_AMBIGUOUS
  const abstained = new Set(run.abstentions.map((a) => a.source_entity_id));  // setl_… keys
  correct = |abstained ∩ ambiguous|
  abstention_precision = correct / |abstained|
  abstention_recall    = correct / |ambiguous|
  over_abstention_cost_paise = (|abstained| − correct) × C_review        // ₹250
  silent_guess_value_paise   = Σ value(ambiguous \ abstained)
  probes_spent, abstentions_resolved_by_probe                             // echoed from AgentRun
```

- The join key works today: `AbstentionRecord.source_entity_id` is the Suspense
  item key, `setl_…` for a settlement target (`run.ts:126-138`), and
  `OracleLabel.target_id` is `Settlement.id` (`universe.ts`).
- **No false-abstention rate exists as a metric.** `over_abstention_cost_paise`
  is its numerator times `C_review`, with no denominator.
- **No cross-agent metric exists.** Every metric takes one `AgentRun`. Metric 8
  compares against an oracle *policy* cost, not against another agent's run.
  `A2 misallocation` needs a new, two-run metric (§4.4).
- `misdirected_value_inr` (`metrics/harm.ts:132-160`) already computes
  `Σ entity.amount over covered entities where allocated_target ≠ true_target`,
  reading truth through `truth.ts`'s `ScoringTruth` edges. A2's misallocation is
  this sum **restricted** to targets ASSAY abstained on.

### 1.8 `assay seal`: preconditions today

`apps/cli/src/commands/seal.ts:146-228`. In order: refuse `--sealed` (`:148`);
parse `--seed`; require the four artifact paths; validate `--seal-signature`
against `bench-v<BENCHMARK_VERSION>` (`:169`); **read and require a passing
`oracle_gate.json`** (`:173-189`, `SealGateFailure`, spec 1.4.27 M43); then
`buildManifest` applies `§9` step 5's two checks (frozen per-family
`target_record_count`, 10,000–20,000 band) and throws `SEAL FAILURE` on either.
The oracle labels file is **read only to be hashed** (`:204`,
`sha256Text(readText({ path: oracleLabelsPath, zone: "AGENT" }))`) — nothing
looks inside it. That line is where the new precondition goes (§5).

### 1.9 `A2-NOABSTAIN` versus `ASSAY`: the exact branch

`apps/cli/src/agents/a2.ts:34-39`: `runAssayAblation(input, { agentId:
"A2-NOABSTAIN", commitOnAbstain: true })` — a flag over `assay.ts`, not a fork.
The one branch it removes, `classifyTarget` (`assay.ts:1613-1685`):

```ts
// assay.ts:1623-1632
  const reason: CertificateReason | null =
    result.certificate_reason ??
    (outcome.generation === "INTRACTABLE" ? "SEARCH_BOUND_EXCEEDED" : null);
  ...
  if (reason !== null && !commitOnAbstain) {
    return { state: "ABSTAINED", ... certificate: certificateFor(...) };
  }
  const best = result.best;
  if (best === null) { ... EXCEPTION (E03 / E01 / E04) ... }
  return { state: "RECONCILED", members: <best.candidate.member_obs_ids>, ... };
```

So the A2-vs-ASSAY comparison measures precisely: **on every target for which
`S4` returned `AMBIGUOUS` (after the probe loop) or `INTRACTABLE`, or `S2`
stopped at `c_max`, ASSAY opens a Suspense item and A2 commits
`ranked[0]` — the highest-`SE3` candidate, ties broken by the smallest canonical
allocation key.** Everything else — `S1`–`S3`, the probe loop, `I1`–`I9` at
`S5`, the exception path when `best === null` — is byte-identical. Two
consequences the metrics must account for:

- A2's forced commit still passes `validate()`; a second target committing the
  same member fails `I2` (`s5-validate.ts:224-235`, `already_allocated_entity_ids`)
  and falls to `EXCEPTION`. On a coupled twin pair (§2.1) A2 therefore commits
  the tie-broken twin to whichever target `seam.targets` orders first (sorted
  by `obs_id`, `s1-s2-seam.ts:477`) and excepts the other.
- A2's choice on an exact `SE3` tie is the **lexicographically smallest id**,
  and on a near-tie the twin whose lag is closer to `mode_days = 2` (captured
  earlier in the day for a `T+2` batch). Neither correlates with truth unless
  the generator makes it so (§8, R3).

**The probe loop today.** `assay.ts:1101-1111` calls `runProbeLoop` with
`context: {}` and `dispatch: { reconReportPath: "" }` — *"the available-probe
context offered to R3 is empty ... it can only decline"* (module header
`:167-175`). So on bench-v2 phase 1 every `AMBIGUOUS` target stops at
`attempts = 0` and certifies **`EVIDENCE_TIE`**. The A3-NOLLM policy
(`packages/llm/src/roles/r3.ts:110-170`) and the single dispatchable probe
(`apps/cli/src/probe/surface.ts:56-58`, `fetch_settlement_recon` only) are
wired but unreachable from an agent run. That is the next phase's work and is
not designed here; §3.4 states only what the contract *can* express.

---

## 2. What has to be true for a genuine `EVIDENCE_TIE`

Putting §1 together, a target `S` abstains with `EVIDENCE_TIE` iff **all** of:

| # | Condition | Where enforced | Construction consequence |
|---|---|---|---|
| T1 | `S` is a target: at least one true member unanchored, so anchored net ≠ amount | seam target rule; `enumerate.ts:294` | null the batch identity on ≥ 1 line of `S` |
| T2 | Two disjoint sub-multisets `X`, `Y` of the instant class both net to `amount(S) − anchored_net(S)` | `C6`, coherence | `Y`'s lines must carry `S`'s exact `settled_at` and be unanchored ⇒ they belong to **another settlement `S'` at the same instant** whose identity was also nulled |
| T3 | Every line of `X ∪ Y` passes `C1`–`C5`, `C8` | per-member clauses | ordinary conforming lines |
| T4 | `max_acct |proj(X) − proj(Y)| > τ = max(₹100, 10 bps × (Σ amount over the component's unanchored lines))` | `s4-solve.ts:693`, `classify.ts:200` | `X`, `Y` differ in `Σ amount`/`Σ fee`/`Σ tax` or refund content |
| T5 | `S` has an `AN2`-matched bank line (clean UTR, equal amount) | `balances` `:520` | the family must control `bank_ref` quality on its ambiguous settlements |
| T6 | Instant class size ≤ 12 dataset-wide; component size ≤ 22 | `c_max`, `k_max` | control drops per instant across **all** families in the seed |
| T7 | Exactly two solutions for `S` (or all pairs material) | oracle pairwise vs engine best/second | no third subset-sum coincidence |

T2 is the structural surprise: **there is no single-target tie.** Every genuine
tie is a coupled pair `(S, S')`, both targets, both ambiguous, sharing the
component. That is not a defect — it is what real cross-batch confusion looks
like — but it doubles the truly-ambiguous count per construction and it is
what makes A2's `I2` fallout (§1.9) part of the measurement.

**Two ways to satisfy T4 with realistic lines** (fee model:
`feeBreakdown` at `amount.ts:66-72`, `fee_ex = rhu(amount × rate/10⁴)`,
`tax = rhu(fee_ex × 18 %)`, `credit = amount − fee`; rates `card/upi/netbanking/wallet = 200`,
`emi = 300` bps, `frozen.ts:81-83`):

- **T4-a, method twins.** `X = {A}` a 200-bps capture, `Y = {B}` an EMI (300
  bps) capture, `credit(A) = credit(B) = X₀`. Then
  `Δ1100 = Δamount = X₀ × (1/0.9646 − 1/0.9764) ≈ 1.253 % × X₀`, which exceeds
  ₹100 for **`X₀ ≳ ₹7,981`** and exceeds the 10-bps term
  (`≈ 0.2 % × 2X₀`) for every `X₀`. Every integer `X₀` admits an amount for
  each rate (credit steps by 0 or ±1 paise per paise of amount), found by a
  bounded search — the same "drawn once, shared" true-state discipline as `F06`.
- **T4-b, refund netting.** `X = {P}` with `credit = X₀`; `Y = {P₂, R₁}` with
  `credit(P₂) = X₀ + R`, refund `R₁` of `P₂` with `debit = R`. `1200_BANK`
  agrees; `Δ2200 = R`, `Δ1100 ≈ R/0.9764`. Material for **`R ≳ ₹98`**. Realistic
  (partial refunds are 4.5 % × 40 % of captures), cardinality differs, and the
  refund's `C2` referent (its parent `P₂`) is present.

Pure-payment same-rate alternatives — two ₹500 vs one ₹1,000 — have
`Σ fee` equal to within rounding (fee is linear in amount at one rate), so
**materiality ≈ 0–2 paise and the outcome is `IMMATERIALLY_AMBIGUOUS`**. That
settles the sketch's `AMB-2` question (§3.2).

**The capture-day leak.** Today's only co-instant mechanism is `(d, T+2)` with
`(d+1, T+1)`. The twin from `S'` was captured on a **different day** from every
anchored sibling in `S`. `created_at` is a structural field; a reviewer applying
"a batch's lines share a capture day" — true 100 % of the time in this generator
— resolves the tie. The frozen evidence model does not encode that rule
(`SE3` reads lag-to-mode only, and the gap is sub-`ε`), so under `§5.4` the
case is ambiguous; under a competent reviewer's reading it is not. §8 R2 treats
this as disqualifying for the headline family and §3.1 proposes the
same-day construction instead, which requires a new true-state mechanism: **a
capture day settled in two batches at the same instant.**

---

## 3. Step 2 — the families, corrected

Naming below is provisional (`F13`–`F19`; §9.2). Every family is a standard
`P = 659` instance so that its `target_record_count` is `2621 + δ` and four to
seven of them fit the seal band. Per-family rates are new pre-registered
parameters, not existing ones. "Expected" outcomes are what §1's code yields;
they are predictions to be recorded before generation, not results.

### 3.0 Shared mechanism: `SPLIT_BATCH` + `DROP_BATCH_IDENTITY`

Two additive pieces every ambiguity family composes:

1. **`split_batch` (true state, `simulate.ts`)** — for `k` selected capture
   days, the day's captures are allocated to **two** settlements `S₁`, `S₂` at
   the same `settlementInstant(d + cycle)`, membership drawn from the family's
   PRNG substream **independently of `created_at`** (§8 R3). Both settlements
   get their own `id`, `utr`, bank line and `bank_ref`. Realism: multiple
   settlements per merchant per day exist (on-demand / instant settlement
   batches); the frozen model already tolerates co-instant batches via the
   cycle mix. Composition: `S = 31 + k`, `B = 31 + k`, so `δ = +2k`.
2. **`DROP_BATCH_IDENTITY` (new `§4.3` operator, `degrade.ts`)** — on selected
   recon lines set **both** `settlement_id` and `settlement_utr` to `null`,
   leaving `settled_at`, `settled: true` and every other field intact. This is
   `DROP_SETTLEMENT_ID`'s model ("merchant-side recon copies that lack the PG's
   batch identifier") with the UTR treated as part of the batch identifier it
   lacks. A new operator rather than a second carrier for `DROP_SETTLEMENT_ID`,
   because `families.ts:83-97` asserts single carriage and that assertion is
   not to be weakened. The recon report is unaffected (pre-operator by
   construction, `recon-report.ts`), so a future probe still sees truth.

Selection of *which* lines are dropped is the family's, and it is what
determines the shape. In every family below the dropped lines are chosen
**by construction from the pair**, not at random, and the count per instant
class is bounded by declaration (T6).

### 3.1 `AMB-1` — material twins (the headline family)

- **Recipe.** `k` split days. On each, one 200-bps capture `A ∈ S₁` and one
  EMI capture `B ∈ S₂` with `credit(A) = credit(B) = X₀`, `X₀` drawn from the
  amount distribution **conditioned to `credit ≥ ₹9,000`** (a margin over the
  ₹7,981 threshold, §2 T4-a); amounts solved from `X₀` per rate. Both `A` and
  `B` get `DROP_BATCH_IDENTITY`. Nothing else on the day is dropped. **Both
  `S₁` and `S₂` carry a clean `bank_ref`** (T5; see `AMB-1D` for the other arm).
- **Pool at the instant**: `{A, B}`; candidates for `S₁`: `anch₁ ∪ {A}`,
  `anch₁ ∪ {B}`; same for `S₂`. Component: `{S₁, S₂, A, B}`,
  `total_value = amount(A) + amount(B)`.
- **Expected `SolveOutcome`**: `AMBIGUOUS` on both; certificate
  `EVIDENCE_TIE` (probe loop inert). Oracle: `TRULY_AMBIGUOUS` on both,
  `solution_count = 2`, `max_materiality ≈ 1.25 % × X₀`.
- **Expected A2**: commits the higher-`SE3` twin (earlier capture in the day) to
  the lower-`obs_id` target; the other target fails `I2` and excepts. Truth
  agrees with the commit with probability ½ by construction.
- **Proves**: the abstention machinery engages on evidence that does not
  determine the answer; `A2` commits rupees on that evidence; every certificate
  field is non-null on a real target.
- **Does not prove**: that ASSAY abstains on ambiguity in a *natural*
  population (the rate is declared, not emergent); that the tie survives a probe
  (it does not — §3.4); anything about `SE1`/`SE2`/`SE4`.
- **Count**: `k = round_half_up(10 % × 31) = 3` pairs per instance → 6
  truly-ambiguous targets per instance, 30 per five seeds. Low. Proposal: **`k`
  is a family parameter declared at 20 % (6 pairs, 12 targets/instance)** —
  open question §9.4.

### 3.1D `AMB-1D` — the same twins, dark bank side

Identical to `AMB-1` except `S₁`, `S₂` carry a **non-UTR `bank_ref`** (no
`AN2`). Expected engine: `IMMATERIALLY_AMBIGUOUS` (materiality 0 — `§1.1`
point 3) → **commit**; oracle: `TRULY_AMBIGUOUS`. This is the silent-guess
pathway metric 4's `silent_guess_value_paise` was written for and has never
measured. Proves: the frozen `AN2` conditioning of `P2`/`P4` bounds abstention
recall by the clean-`bank_ref` share. Does not prove: any defect in ASSAY — it
is `M49` working as ratified, and the honest reading is that bench-v2's recall
must be reported **per bank-evidence arm**.

### 3.2 `AMB-2` — equal value, different cardinality

The sketch asked whether this ties or separates. **Neither, in the sketch's
form.** Two same-rate captures `{A₁, A₂}` vs one `{B}` with equal `Σ credit`:
`SE3` differs sub-`ε` (means over different member counts), `DISCRIMINATED` is
unreachable pre-probe, and `Σ fee` agrees to within rounding →
`IMMATERIALLY_AMBIGUOUS` → accept. It is not a `DISCRIMINATED` control; it is
an **immaterial-accept control**, and A2 and ASSAY behave identically on it.

Two useful variants, both keep the name:

- **`AMB-2a` (material, refund netting; T4-b).** `S₁` needs `X₀` from `{P}`;
  `S₂` at the same instant has `P₂` (`credit = X₀ + R`) and `P₂`'s refund `R₁`
  (`debit = R`), all three dropped. Candidates for `S₁`: `{P}`, `{P₂, R₁}`
  (and for `S₂` the mirror). Expected: `AMBIGUOUS` / `TRULY_AMBIGUOUS` with
  `Δ2200 = R`. Requires `R ≥ ₹250` by declaration (margin over ₹98). Proves
  that cardinality-different alternatives abstain when material — the
  "40-constituent settlement is forty claims" reading of `§4.2`. Note the
  instant class holds 3 lines → 7 subsets; `{P, P₂, R₁}` and `{P, R₁}` etc. do
  not tie out.
- **`AMB-2i` (immaterial, same-rate split).** The sketch's ₹500+₹500 vs ₹1,000.
  Expected: `IMMATERIALLY_AMBIGUOUS`, commit; oracle `IMMATERIALLY_AMBIGUOUS`.
  Serves as a **negative control** (must not abstain) and exercises a label
  that is also 0 on the sealed run.

### 3.3 `AMB-3` — sub-`τ` boundary

Two sub-variants, both **negative controls** for abstention:

- **`AMB-3z`**: identical twins (same amount, method, fee, tax; the sketch's
  `AMB-1`). Materiality exactly 0. Expected `IMMATERIALLY_AMBIGUOUS` at every
  swept `τ` floor.
- **`AMB-3b`**: method twins (T4-a) with `X₀` conditioned to
  `credit ∈ [₹4,000, ₹6,400]`, giving `Δ ∈ [₹50, ₹80]` — below the ₹100 floor
  by a margin > 1 paise (§1.6 rounding) and **above the `τ` sweep's ₹10 and
  ₹50 points** (`EVALUATION_SPEC.md §5.3`). Expected: `IMMATERIALLY_AMBIGUOUS`
  at the frozen `τ`, `AMBIGUOUS` at floors ₹10 and ₹50. **This is the family
  that makes the `τ` sweep non-flat**, which V35 records it never was.
- Proves: the materiality half of `§5.4` is doing work, not just the count
  half. Does not prove: anything about where `τ` *should* be.

### 3.4 `AMB-4` — probe-resolvable tie: what the contract can express

The sketch's mechanism (only one twin reachable via a resolvable order id)
**cannot be expressed**: the only dispatchable probe is
`fetch_settlement_recon(settlement_id)` (`surface.ts:56-58`); `fetch_order`,
`fetch_payment`, `fetch_refund` have no committed source and are refused
(`ProbeSourceUnavailableError`). `SE2`/`SE4`, the signals an order/payment probe
would feed, are constant 0 in `S4`. So "reachable from an external object" has
exactly one meaning here: **the target's own recon report**, which is
truth-side and complete (`recon-report.ts`).

What that probe does to the gap, from `se5` (§1.1): with `k` anchored members
shared, `u` true unanchored members the wrong candidate lacks and `w` wrong
members it adds, `SE5(wrong) = k / (k + u + w)`, `SE5(true) = 1`, so
`Δs = 2000 × (u + w) / (k + u + w)` (± the sub-`ε` `SE3` term). `Δs ≥ 1500`
iff **`3k ≤ u + w`**. For a one-for-one twin swap (`u = w = 1`) that is
**`k = 0`: the probe breaks the tie only when the settlement has no anchored
member at all.** For a 19-line batch with one twin, `Δs = 4000/20 = 200` bps
and the component stays `AMBIGUOUS` after the probe; a second identical probe
adds nothing (union, `SE5` derivation 1.4.17), so the loop ends in
`PROBE_BUDGET_EXHAUSTED` or `NO_USEFUL_PROBE_AVAILABLE` depending on whether
the composition root re-offers an already-spent id (next phase's decision).

Therefore `AMB-4` is `AMB-1` with an asymmetry built in:

- **Recipe.** `S₂` is a **single-constituent** settlement (on-demand batch of
  one capture, `B`); `S₁` is the ordinary 19-line batch containing `A`;
  `credit(A) = credit(B)`, T4-a material; both dropped; both clean `bank_ref`.
- **Expected, phase 1 (probe inert)**: both `AMBIGUOUS` / `EVIDENCE_TIE`.
- **Expected, next phase**: probe on `S₂` gives `SE5 = 1` vs `0`, `Δs = 2000`,
  `DISCRIMINATED` → `abstentions_resolved_by_probe += 1`; probe on `S₁` gives
  `Δs = 200`, still `AMBIGUOUS` → budget/no-probe certificate. **One
  construction yields a resolvable and a non-resolvable case with the same
  evidence**, which is the contrast a probe-resolution-rate metric needs.
- Proves (next phase): `R3` spends budget where it helps and the certificate
  reason is total over the three endings. Does not prove: anything about
  `fetch_order` etc.; those remain "declared, reported, not deleted".
- Boundary warning: the `3k ≤ u + w` equality cases (`k = 1, u + w = 3`) sit
  exactly on `ε` and flip on the `SE3` term; do not build them.

### 3.5 `AMB-5` — search bound

- **Recipe.** On `k` selected days drop the batch identity on **15** of the
  batch's ~19 lines (declared count). Instant class = 15 → `2^15 − 1 = 32,767
  > c_max = 5000` → `S2` `INTRACTABLE`; component size 15 ≤ `k_max` so
  `exceeds_k_max` is false and the bound is `S2`'s, surfaced by
  `classifyTarget` as `SEARCH_BOUND_EXCEEDED` (`assay.ts:1623-1625`). A
  `k_max` variant needs a 23-line class: two split batches on one day with all
  lines dropped — feasible but heavier; propose the `c_max` form only.
- **Oracle**: `2^15 = 32,768 ≤ C_ORACLE`, enumerates, finds one solution →
  **`UNAMBIGUOUS`**. Completeness gate passes.
- **Expected**: ASSAY `INTRACTABLE` → `ABSTAINED` / `SEARCH_BOUND_EXCEEDED`;
  A2: `ranked[0]` of the truncated enumeration if any subset among the first
  5,000 masks tied out (unlikely — the full 15-set is mask `2^15 − 1`), else
  `best === null` → `EXCEPTION`.
- **Metric consequence, stated plainly**: under frozen metric 4 these
  abstentions are on **non-`TRULY_AMBIGUOUS`** targets and count against
  `abstention_precision`. That is the formula working as written — the oracle's
  `INTRACTABLE` is "a statement about the oracle", the engine's is a statement
  about a smaller budget — and bench-v2 should report it that way, with the
  `EXPLORATORY` companion in §4.2.
- Proves: the bound is reported rather than silently truncated. Does not
  prove: anything about ambiguity.

### 3.6 `BENIGN` — negative controls

A false-abstention rate needs determinable targets **that reach `S2`**. Fully
anchored settlements (`F01`) never enumerate a candidate and cannot abstain,
so they are not controls for this question. Proposed shapes, all
`DROP_BATCH_IDENTITY` on ordinary batches, **no** split day, no twin:

| Id | Shape | Expected engine / oracle | What it controls for |
|---|---|---|---|
| `BEN-1` | one line dropped per selected settlement, 50 % of settlements | `UNIQUE` / `UNAMBIGUOUS` | the plain unanchored case; the seed's baseline |
| `BEN-2` | two lines dropped per selected settlement, 30 % | `UNIQUE` (3 subsets enumerated, 1 admissible) / `UNAMBIGUOUS` | enumeration with rejected alternatives does not abstain |
| `BEN-3` | co-instant split day (`SPLIT_BATCH`), one line dropped from each of `S₁`, `S₂`, **credits differ by ≥ ₹1** | `UNIQUE` on both / `UNAMBIGUOUS` | co-instant pooling alone does not cause abstention — the direct control for `AMB-1` |
| `AMB-2i`, `AMB-3z`, `AMB-3b` | (above) | `IMMATERIALLY_AMBIGUOUS` | the materiality half |

**How many.** With 0 observed false abstentions, the rule-of-three 95 % upper
bound is `3/n`. `BEN-1` at 50 % of 31 gives 16 targets/instance, `BEN-2` 9,
`BEN-3` 6 (3 days × 2) → ~31 per instance, ~155 across five seeds for one
family slot, plus ~60 immaterial controls → `n ≈ 215`, upper bound ≈ 1.4 %.
Two `BENIGN` slots per seed halve that. Open question §9.4.

### 3.7 Seed composition (proposal)

One new `§6.1` block, TEST-only, five seeds, `AL7` successor rule attached:

```
  seeds 9200-9204   [AMB-1, AMB-1D, AMB-2a|2i, AMB-3b|3z, AMB-4, BEN-1|2|3]   ≈ 6 × 2621 + δ ≈ 15.8k
  seeds 9300-9304   [AMB-5, BEN-1, BEN-2, BEN-3]                              ≈ 10.5k
```

`AMB-5` is separated so its 15-line classes cannot merge with a twin class
(T6). Whether the sub-variants are separate family ids or parameters of one
family is §9.2. **Per-instant pooling across families is the main composition
risk** (§8 R5) and argues for each family choosing its split/drop days from a
**declared disjoint day range** rather than independently.

---

## 4. Step 3 — metrics for bench-v2

Every new quantity below is `EXPLORATORY` under `PREREGISTRATION.md §8` unless
bench-v2's own pre-registration appends it to the list (numbers 29+, "appended,
never renumbered"). Formulas use `L(T)` for the oracle label of target `T`,
`Abs(agent)` for the set of `source_entity_id`s in that agent's
`AgentRun.abstentions`, `E(agent)` for its `AgentRun.allocations` edges
`(e, T)`, `tt(e)` for the true target of entity `e` from `ScoringTruth.edges`
(`truth.ts`, i.e. `GroundTruth.allocations`), and `amt(e)` for the entity's
`recon_line.amount`.

### 4.1 Frozen metric 4, unchanged — abstention recall / precision

Already computed (`abstention.ts`), already joined on `setl_…`. Data: the
agent's run + `oracle_labels.jsonl`. **No new oracle output.** bench-v2 adds
only a **per-family breakdown** (join `target_id → family_id` through
`GroundTruth`, which eval may read) and a **per-bank-arm breakdown**
(`AN2`-matched vs not; derivable from observations by the same UTR
normalisation `anchors.ts` uses — an eval-side helper, not an oracle change).

### 4.2 `false_abstention_rate` (new, eval)

```
  determinable(T)  :=  L(T) ∈ {UNAMBIGUOUS, IMMATERIALLY_AMBIGUOUS}
  false_abstention_rate      = |Abs ∩ determinable| / |determinable|
  false_abstention_by_value  = Σ amount(T) over Abs ∩ determinable / Σ amount(T) over determinable
```

`NO_SOLUTION` targets are excluded (no candidate → `EXCEPTION`, an abstention
is unreachable); oracle-`INTRACTABLE` targets are excluded (undeterminable by
the oracle's own budget). Report the numerator split by certificate reason, so
`SEARCH_BOUND_EXCEEDED` (the `AMB-5` case, which is a *true* engine bound on an
oracle-determinable target) is visible separately from `EVIDENCE_TIE` on a
determinable target (a genuine false abstention). Companion:
`abstention_precision_excluding_search_bound`, `EXPLORATORY`. Data: run +
labels. **No new oracle output.** Target 0 for the `EVIDENCE_TIE` slice.

### 4.3 Outcome distribution per family (new, eval)

`count(UNIQUE | IMMATERIALLY_AMBIGUOUS | DISCRIMINATED | AMBIGUOUS | INTRACTABLE)`
per `(family, agent)`. `assay.ts:825-845` already tallies these per run; the
per-family cut needs `GroundTruth.family_id` joined on target. The sanity check
for each family's "expected" column in §3, and the first number a reviewer will
ask for.

### 4.4 `a2_misallocation` — the headline (new, eval, **two-run**)

Requires a metric that takes two `AgentRun`s of the same `(split, seed,
llm_mode)` (`RunKey`, `run-key.ts`) — the first cross-agent metric in the
package; place it in a new `metrics/ablation-delta.ts` and let the reporter
join on `RunKey` minus `agent_id`.

```
  U   := Abs(ASSAY) ∩ { T : L(T) = TRULY_AMBIGUOUS }        -- primary population
  U'  := Abs(ASSAY)                                          -- unrestricted companion

  committed_on_abstained_paise(U)  = Σ amt(e)  over (e, T) ∈ E(A2), T ∈ U
  a2_misallocation_paise(U)        = Σ amt(e)  over (e, T) ∈ E(A2), T ∈ U, tt(e) ≠ T
  a2_misallocated_targets(U)       = |{ T ∈ U : members_A2(T) ≠ members_truth(T) }|
  a2_i2_fallout_paise(U)           = Σ amount(T) over T ∈ U with A2 outcome EXCEPTION
                                     (the second twin of each pair; §1.9)
```

**"Wrong" is determined from `GroundTruth.allocations`, not from the oracle.**
The oracle carries no truth — it certifies that the observations do not
determine the answer — and the sketch's phrase "from oracle truth" conflates the
two. `misdirectedValue` (`harm.ts:132`) already reads truth this way; the new
metric is that sum restricted to `U`, plus the target-level and fallout
companions. **State beside the number, every time it is printed:** on a genuine
tie the expected value of `a2_misallocation_paise` is **½ of
`committed_on_abstained_paise`** by construction, so the headline is not "A2 is
bad at choosing" — it is "these rupees were committed on evidence that could
not support the commitment, and this many of them were wrong in fact". The
ratio `a2_misallocation / committed_on_abstained` is itself a check on §8 R3:
a value far from ½ on `AMB-1` means the tie-break correlates with truth and the
family is leaking.

Data: `E(A2)`, `Abs(ASSAY)`, labels, truth edges, entity amounts. No new
oracle output. No new agent output.

### 4.5 Reserved: `probe_resolution_rate` (next phase)

```
  probe_resolution_rate = abstentions_resolved_by_probe / count(AMBIGUOUS at first solve)
```

Numerator exists on `AgentRun` (`run.ts:287`); the denominator is the
per-run `AMBIGUOUS` tally of §4.3 taken **before** the loop (`first.outcome`,
`assay.ts:1086`), which today is not persisted separately from the post-loop
outcome — a small additive field. Deferred with the probe wiring.

### 4.6 What the sweeps will show

The `ε` sweep stays flat on every family (`Δs ≤ 469` pre-probe; only `AMB-4`
next phase moves it). The `τ` sweep becomes non-flat on `AMB-3b` and on
`AMB-1` at the ₹10,000 floor (`AMB-1` twins with `Δ < ₹10,000`, i.e.
`X₀ < ₹8 lakh`, flip to `IMMATERIALLY_AMBIGUOUS` there). Both are predictions
to record in the pre-registration.

---

## 5. Step 4 — the sealing gate

**Precondition (proposed text):** *`assay seal` refuses a `(split, seed)` whose
`oracle_labels.jsonl` contains no `TRULY_AMBIGUOUS` row, and refuses one whose
per-family `TRULY_AMBIGUOUS` count is below the count that family's declaration
commits to.*

- **Where.** `apps/cli/src/commands/seal.ts`, immediately after the
  `oracle_gate.json` check (`:183-189`) and before `buildManifest` (`:191`), on
  the same "before anything is hashed" principle the gate comment states. The
  labels file is already read at `:204`; the change reads it once, decodes the
  closed `AMBIGUITY_LABELS` vocabulary (`classify.ts:135-141`, exported), and
  counts. A new `SealAmbiguityFailure extends CliError`, sibling of
  `SealGateFailure` (`:103-114`). The count is aggregate — the `oracle` command
  already prints label counts on TEST (`oracle.ts:245-256`) — so `AL4` is not
  touched.
- **What it prints on refusal** (proposed):

  ```
  SEAL FAILURE: oracle labelled 0 of 74 targets TRULY_AMBIGUOUS on seed 9200
  (NO_SOLUTION 31, UNAMBIGUOUS 37, IMMATERIALLY_AMBIGUOUS 6, INTRACTABLE 0).
  PREREGISTRATION.md §10 V35 records that a population with no truly-ambiguous
  target cannot discriminate A2-NOABSTAIN from ASSAY, and bench-v2 §<n> makes a
  non-empty truly-ambiguous set a precondition of the seal. This is not repaired
  by re-running the seal: the seed is burned under AL7 and its successor is
  generated. per-family: AMB-1 expected ≥ 12, found 0 ...
  ```

- **Scope.** The refusal applies to every seal the bench-v2 build performs.
  `bench-v1.0.13`'s manifests are never re-sealed, so no v1 seed meets the
  check and none needs to. If the reviewer prefers the check gated on
  `BENCHMARK_VERSION ≥ 2.0.0` or on the seed's block, both are one-line
  variants; the unconditional form is proposed because a seal command with a
  version switch is a seal that can be argued with.
- **What it is not.** Not a response to a measured result: it is declared
  before any bench-v2 figure exists, and its remedy is `AL7`'s rule, not a
  parameter change. Also recommended, same place: **refuse a seed with no
  `UNAMBIGUOUS` target among those that enumerated ≥ 2 subsets** — the
  negative-control presence check, without which §4.2 has an empty
  denominator.

---

## 6. What this phase does NOT need

- No threshold moves. `AMBIGUOUS` is reachable at `ε = 1500` because
  materiality decides; `τ`'s floor is exceeded by ~1.25 % of a ≥ ₹8k credit;
  `c_max`/`k_max` are exceeded by a 15-line drop. **Verdict: every family in §3
  is constructible without changing a frozen number.**
- No engine change. The pipeline already produces `AMBIGUOUS`, `EVIDENCE_TIE`,
  `IMMATERIALLY_AMBIGUOUS`, `SEARCH_BOUND_EXCEEDED` on the inputs described.
- No new oracle predicate for the label. New oracle **outputs** are limited to
  what §4 needs: none, in fact — every proposed metric joins existing artifacts.
- No probe wiring in this phase; §3.4 is specified so the next phase has
  something worth spending budget on.

---

## 7. What this phase DOES need (additive, for the reviewer's approval)

| Package | Addition | Existing thing it touches |
|---|---|---|
| generator | `FAMILY_IDS` extended; `FAMILY_MECHANICS` rows; `split_batch` mechanism in `simulate.ts`; `DROP_BATCH_IDENTITY` operator in `degrade.ts` + `DEGRADATION_OPS`/`OPERATOR_DECLARING_FAMILY` rows; per-family rates; `PUBLISHED_TARGET_RECORD_COUNTS` rows; a new `SPLIT_TABLE` block | `FamilyId` union and the three `Record<FamilyId, …>` tables gain keys; `DegradationOp` union gains a member; `BENCHMARK_VERSION → 2.0.0`, `GT_VERSION` bump if `GroundTruth` gains a field (§9.5). No existing row's value changes. |
| oracle | nothing for labelling; optionally export a `countLabels(labels)` helper for the seal | — |
| eval | `metrics/false-abstention.ts`, `metrics/ablation-delta.ts`, per-family/per-arm cuts; `EXPLORATORY` rows in `metric-list.ts` | additive rows only |
| cli | `SealAmbiguityFailure` + count in `seal.ts`; `generate` accepting the new block | one new branch in `seal.ts` |
| docs | bench-v2 pre-registration (families, rates, predictions, seeds, metric rows, this gate) | new document; `PREREGISTRATION.md` gains a pointer row only |

---

## 8. Step 5 — risk register

**R1 — Is a corpus built to tie on the engine's signals "encoding the
answer"?** The skeptic's question has a precise form: does the construction
make ASSAY right *by fiat*, or does it make the case *genuinely undetermined*?
The test is not "does ASSAY abstain" but **"could any reasoner with the same
observation set, under the pre-registered evidence model, do better than
chance"** — and, separately, **"is that evidence model narrower than what a
competent reconciler would use"**. On the first: the oracle decides ambiguity
from observations alone (`AL2`), the engine and oracle share only the
constraint declaration, and neither reads a field the twins differ on; the
construction targets `§5.4`'s definition, which was frozen before this order.
That half holds. On the second: it holds **only if no structural field
distinguishes the twins' batch membership.** Under the cross-day construction
it does not hold (`created_at`, §2), and under `DROP_SETTLEMENT_ID` as it
exists it does not hold (`settlement_utr`, §1.5). **The honest line is
therefore: a case is genuine iff, after the batch identity is removed, the
remaining structural fields of the twins are exchangeable with respect to the
target.** `AMB-1` as specified in §3.1 (same day, both identifiers nulled,
membership drawn independently of capture time) meets that line; the sketch's
`AMB-1` and the existing `F08` mechanism do not. This document recommends the
stronger construction precisely because the weaker one is the one a reviewer
would call rigged, and would be right to.

**R2 — Does `AMB-1` produce observations a real settlement file could
produce?** Each piece has a real referent: multiple settlements per day (on-
demand/instant batches); a merchant-side recon copy lacking the PG's batch
identifier (already `§4.3`'s model); two captures on different pricing tiers
that net to the same credit (a coincidence, at a declared rate, exactly as
`F06`'s equal-gross collision is). What is *not* realistic is the **rate**: a
corpus where 20 % of days carry such a pair is a stress corpus. That is
acceptable if declared; it is rigged if presented as a base rate. The
pre-registration must say "stress family, declared rate", and no coverage or
abstention figure from bench-v2 may be quoted as a production expectation.

**R3 — A2's tie-break could correlate with truth.** `ranked[0]` is the
higher-`SE3` candidate, i.e. the twin captured earlier in the day for a `T+2`
batch. If `split_batch` assigned membership by capture time (a "morning
batch"), A2's pick would be systematically right or wrong and the headline
number would measure the generator, not A2. Mitigation: membership drawn from
the PRNG independently of `created_at`, and §4.4's `misallocation / committed`
ratio reported as a leak detector (expected ≈ ½).

**R4 — Will `S3` keep the twins in one component?** Yes, unconditionally
(§1.4). **What breaks if they were split:** nothing in the engine — a target
whose candidates are all in its own component still abstains — but `τ`'s base
would be wrong (one twin's amount instead of two), the certificate's
`solution_b` would name a member outside the component, and the oracle's
`decompose` would disagree, tripping `labelAll`'s "target has no component"
throw (`classify.ts:263`). The failure mode is loud, not silent.

**R5 — Cross-family pooling at one instant.** Every family in a seed shares
`settlementInstant(day)`. A twin class of 2 plus another family's drops at the
same instant enlarges enumeration (harmless below 12) **and admits subset-sum
coincidences** that add a third solution (breaks T7 and the engine/oracle
pairwise-vs-best divergence, §1.6). Exact-paise coincidence on log-normal
amounts is rare but not impossible over ~10⁴ candidates per seed; the oracle
labels whatever arises, so metric 4 stays correct, but the per-family
"expected" column may be off by a case. Mitigations: disjoint declared day
ranges per family; and report `solution_count` distribution per family so any
3+ case is visible.

**R6 — `AN2` conditioning halves the experiment.** Without `AMB-1D`, a reviewer
will ask why every ambiguous settlement got a clean UTR when the frozen share
is 30 %, and "so the engine could see it" is engine-favouring. With `AMB-1D`
the answer is measured, not argued: recall on the dark arm is ~0 and the
silent-guess value is reported. Keep both arms.

**R7 — Anchor-test divergence.** The engine's `AN1` requires a referent; the
oracle tests `settlement_id !== null`. A dangling id — settlement observation
absent — would make a line unanchored for the engine and anchored for the
oracle. `DROP_BATCH_IDENTITY` nulls rather than dangles, so no new family
crosses this line; state it so nobody proposes an "unemitted settlement"
variant later.

**R8 — Metric 4 penalises `AMB-5` by design.** Engine `INTRACTABLE` at 15 lines
is a false abstention under the frozen formula because the oracle enumerates
2^15. Report it as such; the `EXPLORATORY` companion exists so the reader can
see both readings. Do not redefine "truly ambiguous" to include engine bounds.

**R9 — A2 on a truncated enumeration.** `S2` keeps candidates found before the
`c_max` stop; A2 commits `ranked[0]` of that partial set if non-empty. On
`AMB-5` the tie-out subset is the last mask so this should not fire, but a
subset-sum coincidence inside the first 5,000 masks would make A2 commit a
provably-incomplete search's answer. Report `generation === INTRACTABLE ∧
committed` as its own count.

**R10 — The rate is a parameter someone chose after seeing V35.** True, and
unavoidable: this whole phase exists because V35 was observed. The defence is
procedural, not statistical: bench-v2 is a new `BENCHMARK_VERSION` with fresh
seeds, its rates and predictions are written down before generation, and the
sealed v1 artifact is untouched and still reported. A reviewer who calls that
"tuning" should be pointed at V35's own text, which lists this exact path as
the permitted one.

**R11 — What would make an external reviewer call this corpus rigged?**
(a) Any structural field that distinguishes the twins (`settlement_utr`,
capture day) — addressed. (b) Ambiguous settlements given clean UTRs without
the dark arm — addressed. (c) Only positive cases, no negative controls, no
false-abstention denominator — addressed. (d) A headline "A2 loses ₹X" without
the ½-by-construction note — addressed in §4.4. (e) Family rates presented as
base rates — R2. (f) The seal gate being tuned per seed until it passes —
§5's remedy is `AL7`, not adjustment. (g) A reviewer reading
`bench/test/9100-9104` and finding `DROP_SETTLEMENT_ID` leaks `settlement_utr`
**in the sealed v1 corpus** — this is true, is not fixed (v1 is frozen), and
should be disclosed as a v1 limitation row when bench-v2 is registered.

---

## 9. Open questions for the reviewer

1. **DECIDED — §B D1 (same-day).** Same-day split batches vs cross-day co-instant batches for the twin
   host. §3.0 proposes `split_batch` (new true-state mechanism, changes
   `S`/`B` per instance) because the cross-day form leaks `created_at` (R1).
   The cross-day form needs no new mechanism. Which, or both as two families?
2. **DECIDED by construction — §B.2 (`A01..`).** Family id namespace. Extend `F13..F19`, or a separate `A01..` namespace
   for ambiguity families? `FamilyId` is one closed union either way; the
   choice is about how `§4.1`'s table reads.
3. **DECIDED — §B D2 (new operator).** `DROP_BATCH_IDENTITY` as a new operator vs relaxing
   `families.ts:83-97`'s single-carrier assertion so new families may declare
   `DROP_SETTLEMENT_ID` plus a separate `DROP_FIELD(settlement_utr)`
   (`DROP_FIELD` is declared and unassigned today). The new operator is
   cleaner; the relaxation touches an existing check.
4. **Rates and counts — PROPOSED in §C.3, not yet declared.** `AMB-1`,
   `AMB-2`, `AMB-3` at 20 % (6 split days, 12 targets each); `BENIGN` at
   `BEN-3` 8 / `BEN-1` 6 / `BEN-2` 6 days (28 targets); `AMB-5` at Convention
   1 in its own block; a second benign id `B02` if the band allows. The code
   carries Convention 1 everywhere until the pre-registration re-declares.
5. **`GroundTruth` shape.** No new field is required for any metric in §4.
   Recording which twin was constructed (a `construction` tag per allocation)
   would help per-family debugging but is exactly the kind of annotation `§3`
   rule 2 forbids ("no `is_ambiguous` label"). Proposal: **do not add it**; the
   oracle labels and the per-family outcome distribution are sufficient.
6. **Seal gate scope.** Unconditional (§5) vs gated on `BENCHMARK_VERSION`.
7. **Per-family minimum in the seal gate.** Require `≥ declared × 0.5`,
   `≥ declared`, or only `≥ 1` overall? A strict equality is wrong (coincidences
   add cases); a bare `≥ 1` lets a broken family pass on another family's
   cases.
8. **Bank-arm split of every family or only `AMB-1`?** Cost is one family slot
   per dark variant. Minimum viable is `AMB-1D` alone.
9. **`AMB-4` in phase 1 at all?** It is indistinguishable from `AMB-1` until
   the probe is wired. Including it now fixes its seeds before anyone sees a
   probe result, which is the pre-registration argument for it.
10. **Merchant-clock offset on a twin's ledger entry** (§B.3). Exclude offset
   captures from twin candidacy so the `ledger_entry` side is identical too,
   or leave it, since no batch information reaches it? Costs one condition in
   the selection; the offset draw would have to be read before the twins are
   chosen.

---

## 10. Reading list for the reviewer (files this document rests on)

`packages/engine/src/s4-solve.ts` · `packages/engine/src/frozen.ts` ·
`packages/engine/src/s2-candidates.ts` · `packages/engine/src/s3-decompose.ts` ·
`packages/engine/src/s1-s2-seam.ts` · `packages/engine/src/s1-anchor.ts` ·
`packages/ledger/src/journal.ts` (P2/P4) ·
`packages/generator/src/{families,frozen,simulate,emit,degrade,recon-report,generate,dataset,seeds,composition,period,amount}.ts` ·
`packages/oracle/src/{classify,enumerate,components,completeness-gate,frozen}.ts` ·
`packages/eval/src/{metric-list,run}.ts`, `metrics/{abstention,match,harm,cost}.ts` ·
`apps/cli/src/commands/seal.ts` · `apps/cli/src/agents/{a2,assay}.ts` ·
`apps/cli/src/probe/{surface,run}.ts` · `packages/probe/src/loop.ts` ·
`packages/llm/src/roles/r3.ts` · `docs/RECONCILIATION_SPEC.md §4.2, §6` ·
`docs/PREREGISTRATION.md §4, §5.4, §10 V35/V36` · `docs/DATA_MODEL.md §22.2 M49`.
