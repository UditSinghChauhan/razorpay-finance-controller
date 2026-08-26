# `@assay/ledger` — Layer A, and Layer B

The shadow ledger. `ARCHITECTURE.md §8` splits it in two.

**Layer A — the audit event layer.** *"Append-only, hash-chained, one event per
decision or state change. Answers what happened, who did it, on what evidence,
and when."* `DECISION_BRIEF.md §K` scopes it to `events.ts` and `hash-chain.ts`.

**Layer B — the double-entry ledger.** *"A **pure projection** over Layer A:
replaying the event log recomputes every control-account balance from scratch.
Answers what are the books, and do they balance."* `§K` scopes it to
`journal.ts` and `projection.ts`.

**Layer A is implemented, at specification 1.4.0.** That release added
`JournalLine.source_entity_id` — the Suspense item key — to the record this
package seals and hashes; see [The Suspense item key](#the-suspense-item-key).

**Layer B is implemented: `journal.ts` and `projection.ts`.** `journal.ts` is
the posting rules `P1`–`P8` — deciding *which* accounts an occasion posts to,
under `DATA_MODEL.md §17.1`, `§17.1.1` and `§17.2`; `projection.ts` replays the
resulting lines into balances. `close-gate.ts` and `close.ts` follow, and are
deliberately absent rather than stubbed; see
[What is deliberately not here](#what-is-deliberately-not-here).

`ARCHITECTURE.md §8` also explains why the split exists: the two layers *"fail
differently and so must be checked differently. Layer A detects **tampering** —
someone changed the record of what happened. Layer B detects **incoherence** —
the record is intact but the books do not balance."*

## What this package guarantees

1. **A record that entered the chain cannot be changed.** Every sealed
   structure is deep-frozen, and sealing copies rather than validating in
   place, so a caller that keeps and later edits its draft cannot alter what
   was hashed. Enforced at runtime, not only by `readonly`.
2. **Every field is read exactly once.** A getter or proxy that answers
   differently on a second read cannot show one value to the validator and hand
   another to the serializer.
3. **The hashed body is `DATA_MODEL.md §16`'s projection and nothing else.**
   Nine fields in, five excluded; five fields on every journal line. Every field
   is copied out by name, so a field added to `LedgerEvent` later cannot reach
   the digest by accident.
4. **Every posting names the obligation it records.** `source_entity_id` is
   required and non-null on every line including the counter-leg, is drawn from
   the five business families `§16` names, and is inside the hashed body — so
   re-keying a posting, which moves it between gate `G3` items without moving a
   single rupee, breaks the chain.
5. **Two runs over identical inputs produce identical root hashes.** This is
   metric 23 (`determinism_check`) and invariant `I9`. No clock, no randomness,
   no locale, no environment access, no module-level mutable state.
6. **Any change to hashed content is detected.** Verification recomputes the
   chain from genesis and reports each failed check by name rather than
   throwing, because `GET /runs/:id/ledger/verify` *"returns pass/fail per
   check"*.
7. **Invariant `I1` holds at every point in the log.** `ARCHITECTURE.md §3`
   makes the trial balance *"a property of this package, not a convention its
   callers must remember"*, so an append that would break it is refused.
8. **No floating-point money, ever.** Validity is `@assay/money`'s `isPaise`,
   never a second opinion, and amounts pass through `paise()` so a negative zero
   cannot enter as a second spelling of zero.
9. **A balance is always recomputed, never remembered.** The projection reads
   journal lines off events and nothing else. An edited balance that no event
   backs simply disappears on the next projection, which is the property
   `THREAT_MODEL.md §T10` rests on. Layer A's running `Σ dr` / `Σ cr` are an
   append-time guard and `projectChain` does not read them.
10. **The projection refuses rather than guesses.** It reports what it can
    state truthfully — an unbalanced but exactly-representable log is
    `trialBalanceOk: false` — and throws when it cannot, rather than returning a
    number that looks like a balance and is not.

## Public API

| Export | Meaning |
|---|---|
| `LedgerEvent`, `LedgerEventContent`, `LedgerEventDraft` | `§16`'s record, in three stages: what the caller supplies, that plus its position, and the whole thing. |
| `JournalLine`, `EventActor`, `AmbiguityCertificate`, `CertificateSolution` | The nested structures of `§16` and `§13`. |
| `EVENT_KINDS`, `ACTOR_TYPES`, `LLM_PROVIDER_IDS`, `CERTIFICATE_REASONS` | The closed sets, in declaration order. |
| `SOURCE_ENTITY_PREFIXES` | The five identifier families `§16` admits on `JournalLine.source_entity_id`, in declaration order. |
| `EventId`, `RunId`, `DecisionId`, `EvidenceId`, `LlmCallId`, `CandidateId`, `ComponentId`, `ProbeId` | Branded identifiers that appear in `LedgerEvent`. |
| `sealDraft(draft)` | Validate, copy and freeze a caller's draft. |
| `sealStoredEvent(value)` | The same for a record read back from storage, which carries its position. |
| `journalTotals(lines)` | `Σ dr_paise` and `Σ cr_paise` over one event's lines. |
| `computeGenesisHash(inputs)` | `sha256(canonical_json({dataset_hash, engine_commit, config_hash}))`. |
| `canonicalEventBody(content)` | `§16`'s hashed projection. |
| `computeEventHash(content, prevHash)` | `sha256(canonical_json(body) ‖ prev_hash)`. |
| `hashCanonical(value)` | `sha256(canonical_json(value))`, for `inputs_hash` and any other `*_hash`. |
| `createChain(genesisHash, runId)`, `appendEvent(chain, draft)` | The chain as an immutable value. |
| `LedgerChain`, `verifyChain(genesisHash, events, expectedRoot?)` | Gate `G4` and `/ledger/verify`. |
| `LedgerEventError`, `TrialBalanceError`, `ChainMismatchError`, `ProjectionInputError`, `JournalError` | Five failures that demand five different responses: fix the record, abort the run, these are not one chain, fix the lookup table, this allocation is not postable. |
| `journalFor(request)` | The posting rules `P1`–`P8` (`§17.1`, `§17.1.1`, `§17.2`): one occasion in, one posting or one named refusal out. |
| `PostingRequest` and its four members, `BankSideEvidence` | What a *proposed* posting occasion carries. |
| `Posting`, `NonPosting`, `JournalDecision` | What one occasion yields. |
| `POSTING_REFS`, `EXCEPTION_CLASSES`, `OBSERVATION_STATES`, `POSTING_OCCASIONS`, `NON_POSTING_GROUNDS` | The closed sets the posting layer selects over, in declaration order. |
| `PostingRef`, `ExceptionClass`, `ObservationState`, `PostingOccasion`, `NonPostingGround`, `AbstentionRole` | Their types. |
| `projectLedger(events)` | Replay an event log into the seven control-account balances. |
| `projectChain(chain)` | The same over a chain's events, reading none of its cached totals. |
| `projectByDecisionState(events, states, target?)` | `proj_agent` (`EVALUATION_SPEC.md §4.4`) — the covered-set projection, `RECONCILED` by default. |
| `assertTrialBalance(projection)` | The hard-abort reading of `I1` (`ARCHITECTURE.md §12`). |
| `LedgerProjection`, `AccountBalances`, `DecisionState`, `DecisionStates` | The projection's result and its caller-supplied inputs. |

## The posting rules — Layer B

```
  journalFor(request) -> { posts: true,  rule, source_entity_id, lines }
                       | { posts: false, rule: null, ground, lines: [] }
```

One proposed occasion in, one posting or one **named refusal** out. It is a pure
function: no I/O, no clock, no randomness, no locale, no module-level state, and
a deep-frozen result that shares no object with its argument.

**It does not take a `ValidatedDecision`, and that is the specification's
choice, not a shortcut.** `ARCHITECTURE.md §4` boundary 3: *"S5 must check `I1`
over journal lines before it may emit a `ValidatedDecision`, so it needs those
lines first. `journal.ts` therefore takes a **proposed** allocation and its
terminal state — never the validated wrapper — and is a pure function with no
I/O."* `§L.1` rule 4 says the same and gives the consequence: this is *"what
keeps S5 → `I1` → mint → write acyclic"*. Read the other way it is a dependency
cycle. `ValidatedDecision` is declared with the single **mutating write path**
it exists to guard, which arrives with persistence — see
[What is deliberately not here](#what-is-deliberately-not-here).

### The four occasions

`§17.1.1` fires a posting at four distinct moments, and each is the
specification's own word for it. They are four calls rather than one because
they are four **events**: a capture the recon report asserts, a bank credit that
arrives days later, a terminal state, and a resolution that `§17.1` says posts
*"as **new events**"*.

| Occasion | Source | Rules it can reach |
|---|---|---|
| `INGEST` | *"`P1` at ingest"*, *"`P3` at ingest"* | `P1`, `P3` |
| `BANK_EVIDENCE` | *"the settlement it is allocated to is **itself reconciled to a bank credit through real bank-side evidence**"* | `P2`, `P4` |
| `TERMINAL_STATE` | *"every terminal `ABSTAINED` or `EXCEPTION` state"*, and the rows that post nothing | `P5`, `P6`, `P8` |
| `RESOLUTION` | `§17.1`'s `P7` row | `P7` |

### The four phases, kept apart

```
  A. input validation      is this a request at all?          strict, read-once
  B. posting selection     §17.1.1: which rule, or none?      reads no amount
  C. journal construction  §17.1 / §17.2: which lines?        re-decides no rule
  D. invariant validation  §16 shape, I1, one item key        fails closed
```

**B never reads a rupee figure and C never re-decides a rule.** A selection that
could inspect the amount it was about to post is a selection that can be talked
out of posting it, which is the shape of the suppression `THREAT_MODEL.md §T8`
exists to make arithmetically impossible.

### `P2` and `P4` cannot fire without real bank-side evidence

This is the `E04` guard, and it is structural rather than a check. `§17.1.1`
conditions both rules on *"`AN2` satisfied against an actual `bank_line`, and
`I5` therefore defined and satisfied"*, and states that **`I5` is undefined —
not satisfied — when no bank-line mapping exists**. So the `BANK_EVIDENCE`
occasion carries a `bnk_…` identifier, a `setl_…` identifier checked against the
line's own `settlement_id` (that is `AN1`), and two attestations typed `true`
rather than `boolean` — an anchor that did not hold is expressed by **omitting
the occasion**, not by attesting to it.

A line reaching `RECONCILED` posts nothing. `AN1` alone is *"a gateway-internal
identity match that carries no bank-side information"*, so the terminal-state
occasion returns `NO_TRIGGER_AT_THIS_OCCASION` for a recon line and `1200_BANK`
is never touched. An `E04` settlement has no bank line to name, so it cannot
reach `P2` at all; it takes `P6` under `setl_…`.

### `P8` is narrowed, and there is no catch-all

`P8` applies to **adjustment observations and to nothing else** (`§17.2`, spec
1.4.0). It is reached only through `E12_ADJUSTMENT_UNEXPLAINED`, which is bound
to the `adjustment` kind, and `buildLegs` refuses any other kind a second time.
No path falls through to it. It posts `M` — the non-zero one of `debit`/`credit`
— and never `ReconLine.amount`, which `§17.2` leaves *"deliberately
unconstrained"* on adjustment rows; a row on which `M` is not unique is refused
rather than guessed, because such a row is an `E05`/`E06`/`E07` and posts
nothing.

### `P7` reverses, exactly

Every leg keeps its account and its amount and swaps its side, under the **same**
`source_entity_id`. That is what makes *open* arithmetic: `§16` says a resolved
item *"nets to zero and leaves `Σ |item_net_paise|` by arithmetic rather than by
a flag someone must remember to set."* Only a `P5` or a `P6` opening is
accepted — those are the two `§17.1`'s `P7` row names — so a `P8` opening, a
`P1` opening, and a reversal of a reversal are all refused rather than extended
by analogy.

**Whether the item *should* be resolved is the caller's**, not this module's:
`Exception.status` (`§14`) belongs to the engine. What is guaranteed here is
that the reversal is exact and lands under the same key.

### Non-posting is explicit and named

Seven of the fourteen exception classes post and seven do not, and several kinds
post nothing in any state. Every such case returns a **named ground**, not an
empty array, because *"explicitly non-posting"* has to be inspectable to be
worth anything: an implementation that returned nothing for every silent case
would be indistinguishable from one that had lost a posting.

| Ground | `§17.1.1`'s clause |
|---|---|
| `INGEST_VALIDATION_FAILED` | *"A line that fails ingest validation posts nothing at all, in either direction."* |
| `REFERENCE_KIND` | `payment`, `order` — *"Reference kinds; §10.1"* |
| `NO_ATTRIBUTABLE_KEY` | `ledger_entry`, `dispute` — *"truth posts no line attributable to either kind"* |
| `AGGREGATE_VIEW` | `settlement`, `bank_line` on the reconciled path — `I4`/`I5` make them aggregates |
| `NO_TRIGGER_AT_THIS_OCCASION` | this kind's postings fire elsewhere; the `E04` guard lives here |
| `NON_TARGET_MEMBER` | *"a second posting for each member would relieve `1100_GATEWAY_RECEIVABLE` again for one break"* |
| `INGEST_INVARIANT_FAILURE` | `E05`, `E06`, `E07` |
| `DUPLICATE_OBSERVATION` | `E08` — *"A duplicate is not a second economic event."* |
| `REFERENTIAL_FAILURE` | `E10` — an `I6` failure |
| `TIMING_DEFERRAL` | `E11` — *"deferred, not an error"* |
| `UNTRUSTED_LEDGER_SOURCE` | `E13` — either leg *"would let an attacker-controlled ERP row move a PG-side control account"* (`§T5`) |
| `NO_CONSTRUCTIBLE_RULE` | the `refund`-kind seam; see below |

`§17.1.1` is emphatic that these are not gaps: *"An exception that posts nothing
is still an exception ... It cannot be suppressed either: close gate `G1`
requires every observation to hold exactly one terminal state, with no drop
path."*

### The `E14` residual is preserved, not optimised away

`§17.1.1` discloses it: where a bank credit exists but its attribution does not,
*"the settlement takes `P6` under its own key and the unattributable `bank_line`
takes `P5` under its own key. **One economic event therefore opens two Suspense
items and is counted twice in `unresolved_value_paise`.**"* A test asserts both
items and the doubled gross figure, so the disclosure fails loudly if anyone
later "fixes" it. Netting them would be exactly the offsetting suppression the
**gross** form of `G3` exists to make impossible.

### Decisions this module had to make

Three things the specification leaves open, stated as this module's contract:

- **Lines are ordered by ascending account code.** No line order is stated for
  the agent's `journal_lines`, and one has to be chosen, because the field
  enters `LedgerEvent.body` and two orders are two digests for one posting.
  The rule reuses the one the specification *does* state for the counterpart
  journal: `§1`'s `true_journal` is emitted *"ties broken by `source_entity_id`
  ascending, then by `account` ascending"*, and within one posting the first two
  keys are constant. It is a total order because no rule among `P1`–`P8` touches
  one account twice, and that is asserted rather than assumed. Ordering is by
  `ACCOUNT_CODES` index rather than string comparison, so no collation can
  reorder it. No gate reads line order — `G2`, `G3`, `proj_agent` and
  `proj_truth` are all sums — so this fixes a digest, not an accounting outcome.
- **A zero leg is dropped; a posting of zero paise is refused.** `§16` requires
  *"exactly one of dr/cr is non-zero"*, so a zero line is not expressible. `P2`
  on a zero-fee line is the case that matters: two of its four legs are zero and
  `credit + 0 + 0 = amount` still balances. When *every* leg is zero the trigger
  table says the observation posts and `§16` says it cannot, so the posting is
  refused rather than silently dropped — dropping it would remove an item the
  queue still counts, which breaks `G3` in the direction `§T8` names.
- **`memo_ref` is the posting reference**, `"P1"`–`"P8"`, identical in spelling
  to `GroundTruth.true_journal.posting_ref` (`§1`) so the two journals carry the
  same token for the same rule. `§16` requires only that it be *"reference only,
  never free text from input"*, which this satisfies by carrying no input at all.

### Two specification seams, refused rather than resolved

Both are reported rather than patched, because `DECISION_BRIEF.md §L.4` makes
inventing a mapping the trigger table does not enumerate a spec amendment.

- **An unmatched bank line whose `direction` is `"debit"`.** Every source for
  `P5` describes a **credit**: `§17.1`'s row is *"value has arrived in the
  bank"*, `§17.1.1`'s Direction column reads `inbound`, `§14.1` values a bank
  line at *"the credit that actually arrived"*, and the canonical class is
  `E03_BANK_CREDIT_UNMATCHED`. None predicates on
  `BankStatementLine.direction` (`§7`), which is a real field with a real
  `"debit"` value — a refund settled out of the bank under `P4` is one. Posting
  `DR 1200_BANK` for an unmatched bank *debit* would assert money arrived when
  it left, and would break the single property `§17.1` chose the sign convention
  to preserve. It is refused.
- **`Observation.kind === "refund"` on the reconciled path.** The `pg_refunds`
  view appears in neither `§17.1.1`'s reconciled-path table nor `§14.1`'s
  `value(observation)` table, though `§10.1` classes it reconcilable. It is
  treated as non-posting under `NO_CONSTRUCTIBLE_RULE`, on the ground `§A.7`
  G-F used to withdraw the universal `P8` fallback: **no rule among `P1`–`P8` is
  constructible over a `Refund` payload.** Its abstained and excepted paths *are*
  enumerated — the non-target-member row and `E10` — and both are likewise
  silent, so this is the answer every enumerated neighbour gives. It carries its
  own ground so the seam stays visible rather than folded into a row that does
  cover it.

## The hash chain

```
  genesis = sha256(canonical_json({dataset_hash, engine_commit, config_hash}))
  body    = { seq, kind, actor, subject_ids, evidence_ids,
              decision_id, inputs_hash, journal_lines, certificate }
  hash    = sha256(canonical_json(body) ‖ prev_hash)
  root    = the last event's hash, or genesis when the chain is empty
```

`evt_id`, `run_id`, `prev_hash`, `hash` and `ts` are excluded from `body`, each
for a reason `§16` states. `run_id` in particular is *"a free per-execution
handle"* held outside the hashed content, which is what lets two runs over
identical inputs coexist, be addressed separately, and be compared.

**`seq` and `prev_hash` are not caller-supplied.** `appendEvent` assigns the
current length and links to the current root, and a draft carrying either is
rejected as an unknown field. Forging a sequence number and re-pointing a link
are therefore unreachable at construction rather than merely detected
afterwards.

**`I1` is checked on the cumulative totals after every append**, which is `§17`'s
wording exactly — *"at every point in the event log"*. Because the check runs
after every append it is equivalent to requiring each event to balance on its
own, which every posting in `§17.1` and `§17.2` does by construction.

**Spec 1.4.0 changed every digest and no line of the formula above.**
`source_entity_id` reaches `body` because `journal_lines` "already enters `body`
whole", so the nine named fields and the genesis definition are textually
unchanged and `DECISION_BRIEF.md §A.5` B2 is not reopened — but a journal line
now serializes five fields rather than four, so no digest computed under an
earlier specification matches one computed now. `§16` records why that reopens
nothing: *"no run has been executed and no root hash has been published, so no
committed digest is invalidated."* This package stores no expected digest to
update: every hash assertion in its suite is computed either from an independent
transcription of `§16`'s formula or by comparing two computed values, so there
was no golden constant to revise and none was revised.

### The declared residual

`ts` is outside `body`, so **altering an event's timestamp is not
chain-detectable** (`THREAT_MODEL.md §T10`). The exclusion is required for
reproducibility — a wall-clock field cannot be identical across the two runs
metric 23 compares — and is accepted because no gate, metric or invariant reads
`ts`. A test asserts the limitation explicitly, so it is visible in the suite
rather than only in prose, and so it fails loudly if `ts` is ever quietly moved
into the body.

`ARCHITECTURE.md §8` states the other honest limit: the chain makes tampering
*evident*, not impossible. An attacker with write access can rewrite the whole
chain; what they cannot do is rewrite it and match a root hash already
published.

## The Suspense item key

```
  source_entity_id ∈ { pay_… , rfnd_… , adj_… , setl_… , bnk_… }   // DATA_MODEL.md §16
  item(k)          = { journal lines with source_entity_id === k }
  item_net_paise(k)= Σ dr(k, 9000_SUSPENSE) − Σ cr(k, 9000_SUSPENSE)
  open(k)          ⟺ item_net_paise(k) ≠ 0
```

Added to `JournalLine` at spec 1.4.0. It is the JOIN key against
`GroundTruth.true_journal` — named identically *"so that the two journals join
structure to structure"* — and the field close gate `G3` partitions on:
`Σᵢ |item_net_paise(i)|` over open items, checked to the paisa against
`unresolved_value_paise` (`RECONCILIATION_SPEC.md §10.1`). Through spec 1.3.0
`G3` quantified over items **no field defined**, and each of the four available
readings gave a different partition and therefore a different value of frozen
metric 13.

*Open* is arithmetic, not a status flag: a `P7` resolution reverses the opening
posting under the **same** key, so a resolved item nets to zero and leaves the
sum on its own.

**What this package enforces.** The field is required and non-null on every
line, the counter-leg included, *"so that an item can be read whole"*; it must
carry one of the five families above, at `§0` rule 3's grammar — fourteen
alphanumerics for the four Razorpay families, a non-empty alphanumeric suffix
for `bnk_`, checked with `@assay/domain`'s own predicate for each so the two
packages cannot drift; and it is inside the hashed body, so a re-key is
chain-detectable. `obs_`, `evt_`, `dec_`, `cand_`, `comp_` and `exc_` are
refused because `§16` requires *"a business identifier drawn from the
observation set, **never an ASSAY-internal handle**, so a reviewer holding only
the run artifact can verify `G3`"*. `mle_` and `disp_` are refused because
`§17.1.1` posts nothing for a `ledger_entry` or a `dispute` in **any** state,
and `order_` because `§10.1` makes an order a reference kind that *"never posts
a journal line"*.

**What it does not enforce, and where that lives.** Whether the named
observation *exists* is invariant `I6` — *"every referenced ID exists in the
observation set"*, *"the structural answer to hallucinated transaction IDs"*
(`RECONCILIATION_SPEC.md §7`) — and belongs to stage S5, because this package
holds no observation set to test against. A well-formed `pay_` identifier naming
nothing is exactly what `I6` exists to reject.

Nor is one key per event required: `§17.1.1` assigns one key per *posting* and
states nothing about how many postings an event carries — an `E14` break opens
two Suspense items — so a one-key-per-event rule would be policy this package
does not own.

Nor is the **selection** of the key checkable here. `§16` binds
`source_entity_id` to the deterministic-identifier rule: *"the observation it
names is selected by a rule (`§17.1.1`'s trigger table), never by iteration
order over an unordered collection."* That is an obligation on the stage that
chooses the key, which is `journal.ts`; Layer A can see that a key is
well-formed and that it is inside the digest, and cannot see how it was picked.

## The projection — Layer B

```
  balance(acct) = Σ dr_paise(acct) − Σ cr_paise(acct)      // DATA_MODEL.md §17.1
```

Debit-positive, in integer paise, with **no per-account adjustment**. Liability,
revenue and other credit-balance accounts therefore carry negative balances, and
`§17.1` is explicit that this *"is correct rather than an error to be corrected
at render"*. The convention is not arbitrary: `AccountCode` carries no
account-class metadata, so a normal-balance convention is not computable from
the schema, and of the two that are, this is the one under which an abstained
₹1,00,000 bank credit leaves `1200_BANK` at +₹1,00,000 — matching truth, so
`balance_harm_inr` charges zero for a rupee correctly parked in Suspense.

The result is frozen, its seven keys are in `ACCOUNT_CODES` declaration order on
every run, and the same events always produce the same vector. Balances are
never cached: `projectChain` reads a chain's events and **not** its
`total_dr_paise` / `total_cr_paise`, so an edited total without an edited event
disappears on the next projection (`ARCHITECTURE.md §8`, `THREAT_MODEL.md §T10`).

### What it refuses, and why each refusal is not redundant

| Refused | Error | Why here and not only in `verifyChain` |
|---|---|---|
| A malformed stored record | `LedgerEventError` | Every event is re-admitted through `sealStoredEvent`. A balance is an arithmetic total, and there is no meaningful partial answer over a record that cannot be read. |
| A duplicated `evt_id` | `ChainMismatchError` | Two copies of one balanced event leave `Σ dr === Σ cr` intact while doubling every account they touch, so `I1` is blind to it. `proj_agent` and `POST /runs/:id/close` both project without running `G4` first. |
| Events from two runs | `ChainMismatchError` | `§16` makes sequence numbers *"gapless, per run"*. A total over two runs is nobody's balance. |
| Cumulative totals leaving the safe range | `TrialBalanceError` | Invariant `I7`. Past 2⁵³ two totals that both lost precision can still compare equal, so exactness is tested before equality. |

**An imbalance is reported, not thrown.** `CloseGateResult.g2_trial_balance`
(`DATA_MODEL.md §20`) is a boolean an analyst is shown, and `ARCHITECTURE.md §9`
requires the close endpoint to return *"the individual gate results rather than a
boolean, because 'why won't it close' is the question an analyst actually asks"*.
`assertTrialBalance` is offered alongside for the hard-abort reading
(`ARCHITECTURE.md §12`: an unbalanced ledger *"can only indicate a bug in the
ledger itself"*).

**The covered-set projection.** `projectByDecisionState` is `proj_agent` from
`EVALUATION_SPEC.md §4.4` — *"`Σ dr_paise − Σ cr_paise` over the agent's journal
lines whose owning decision is `RECONCILED`"*. The decision → state mapping is
**the caller's**: `Decision` is the engine's entity (`DATA_MODEL.md §13`) and a
projection that owned one would be inventing it. A posting event whose decision
the map does not cover raises `ProjectionInputError` rather than being skipped,
because silently dropping it would move a frozen metric by an amount nobody
would see.

### What the projection does not detect

An amount edited in storage to another well-formed amount projects as written,
and a debit and credit swapped together still balance. **Content tampering is
gate `G4`'s job**, not this module's, and duplicating the check here would make
the boundary between the two layers a matter of opinion. Both cases are asserted
in the suite so the limit is visible rather than assumed.

## Decisions this package had to make

The specification leaves five things open that an implementation cannot leave
open. Each is this package's contract, stated here rather than presented as a
quotation.

- **`‖` is text concatenation.** `hash` is `sha256` over the canonical JSON of
  the body followed by the 64 lowercase hexadecimal characters of `prev_hash`,
  encoded UTF-8. Appending the 32 raw digest bytes instead is equally
  defensible and produces different digests, so one had to be chosen. The
  choice is unambiguous rather than merely conventional: a canonical body always
  ends in `}` and a digest is always exactly 64 characters, so no two distinct
  pairs can concatenate to the same string.
- **The root hash is the chain head**, and an empty chain's root is its genesis.
  `§16` and gate `G4` both use the term without defining it, and `G4` — *"the
  hash chain recomputes from genesis and matches the stored root hash"* — is
  only a whole-chain check under this reading.
- **Journal amounts are non-negative.** Every posting in `§17.1` and `§17.2` is
  a magnitude, and `P7` reverses by swapping sides rather than by negating.
  Admitting a negative debit would give one economic fact two spellings and
  therefore two different hashed bodies. The specification states the sign
  convention for *balances* (`§17.1`), not for postings.
- **A reference token carries no control or text-spoofing code point.**
  `memo_ref`, `component`, `engine_commit` and the identifier lists all reach
  the hashed body, and `§16` says `memo_ref` is *"reference only, never free
  text from input"*. The rejected set is `@assay/domain`'s `sanitizeForPreview`
  set plus tab, newline and carriage return: those three are ordinary content in
  a bank narration, which is why that function keeps them, and are not ordinary
  content in an account reference. No length limit and no character allowlist is
  imposed, because the specification states neither.
- **`source_entity_id`'s five families are an admission rule, checked here.**
  `§16` types the field `string` and names its domain in the same declaration,
  and states the prohibition in prose: *"never an ASSAY-internal handle"*. This
  package reads that as a rule rather than a description, because an unenforced
  prohibition on the one field that partitions Suspense into items is a
  convention, and `G3` is an identity exact to the paisa. The **type** stays
  `string` — narrowing it would retype a normative field — so the union is a
  runtime check. The alternative reading, admitting any reference token as
  `memo_ref` does, would let `obs_`, `mle_` or a bare `"x"` key a Suspense item.

## Identifiers

`LedgerEvent` references eight identifier types the specification names but
defines nowhere, and `@assay/domain` deliberately does not declare them — its
scope is *"the specification's grammars, and nothing more"*, and `LedgerEvent`
is not a domain entity. They are declared here because `LedgerEvent` cannot be
typed without them.

Where `DATA_MODEL.md §0` rule 3 states a prefix — `evt_`, `dec_`, `cand_`,
`comp_` — it is enforced, with `@assay/domain`'s suffix rule: alphanumeric, with
the length deliberately unconstrained. A test asserts these four prefixes are
exactly the ones `ID_PREFIXES` registers, so the two packages cannot drift.

Rule 3 states nothing at all about `RunId`, `EvidenceId`, `LlmCallId` or
`ProbeId` — no prefix, no suffix, no length. Those are validated as opaque
reference tokens and **no grammar is invented for them**. A later phase that
owns those entities may relocate the declarations to the package that produces
them.

## What is deliberately not here

Everything below is **absent by scope**, not blocked. Spec 1.4.0 closed the
three governance questions an earlier revision of this file recorded here, and
`journal.ts` was written against them: the universal `P8` fallback was withdrawn
and `P8` narrowed to adjustment observations (`DECISION_BRIEF.md §A.7` G-F), the
posting-trigger mapping was added as `DATA_MODEL.md §17.1.1` (G-G), and
`ValidatedDecision` was defined field by field in `ARCHITECTURE.md §4`
boundary 3 (C-1). What remains is ordering, in the sequence `§L.2` fixes.

- **The single `ValidatedDecision` write path** (`§L.1` rule 4, boundary 3).
  The type is now defined — `ARCHITECTURE.md §4` gives its fields, its
  declaration site (this package) and its enforcement (a non-exported
  unique-symbol brand plus an ESLint path allowlist) — and it is **declared with
  the write path it exists to guard**, not ahead of it. Only
  `engine/src/s5-validate.ts` may mint one, and S5 does not yet exist — the
  ESLint path allowlist that enforces *"only S5 may construct"* cannot be
  written against a file that is not there, and a branded type with no consumer
  and no enforcement is a claim rather than a control. `journal.ts` does not
  need it either: `ARCHITECTURE.md §4` boundary 3 is explicit that the posting
  function takes a **proposed** allocation and *"never the validated wrapper"*.
  This package therefore contains **no mutating function and no I/O at all**:
  `appendEvent` returns a new chain and leaves its argument untouched and
  `journalFor` is pure, so the count of mutating functions here is zero rather
  than one. The write path
  arrives with persistence. `§K` allocates no storage module to this package and
  `better-sqlite3` is in no manifest, so the ledger is in-memory at this
  milestone; the projection is a pure function of an event array and takes no
  connection.
- **A second implementation of the posting table.** `journal.ts` is the system
  under test, not an oracle (`ARCHITECTURE.md §7.2`). It carries no shadow copy
  of `§17.1.1` to check itself against, and its test fixtures build observations
  rather than expected postings — a fixture that encoded the expected rule would
  be a second implementation grading the first, and a later engine/oracle
  differential test would then be comparing the engine with itself.
- **Any judgement about whether a request's facts are true.** Whether `AN2`
  really matched, whether `I5` really held, whether the named observation exists
  (`I6`), whether an allocation is unique (`I2`/`C7`), whether an exception is
  genuinely resolved (`Exception.status`, `§14`) — all belong to stages S1–S5,
  which hold the observation set. This package holds none, and says so by
  requiring the caller to state those facts rather than inferring them.
- **Deduplication.** `journalFor` is a pure function of one occasion. `I2` and
  `C7` are stage S5's and `§8`'s three duplicate mechanisms are the engine's;
  what this module guarantees instead is that it never silently *merges* two
  occasions, because one posting is one item under one key.
- **The gross per-item Suspense identity, gate `G3`.** The key that partitions
  journal lines into items is defined as of spec 1.4.0 and Layer A now carries
  and hashes it, so the partition is computable — but `G3` compares
  `Σᵢ |item_net_paise(i)|` against `unresolved_value_paise` summed from the
  `Decision` / `Exception` records, and `RECONCILIATION_SPEC.md §10.1` is
  explicit that *"the two sides are drawn from two stores, which is the point"*.
  This package holds one of them. The gate is `close-gate.ts`.
  `LedgerProjection.valueSuspensePaise` remains the **net**
  balance — `CloseReport.value_suspense_paise` — and `DATA_MODEL.md §20` is
  explicit that the two are different numbers. Reporting the net figure as `G3`
  would be satisfiable by two offsetting suppressions, which is the attack
  `THREAT_MODEL.md §T8` exists to make arithmetically impossible.
- **The close gate `G1`–`G5`.** `close-gate.ts`. `verifyChain` implements the
  mechanism `G4` runs; the projection supplies the arithmetic `G2` reads. Nothing
  here runs a gate.
- **`gap < epsilon` on a certificate.** `§13` states the relation, and it reads
  naturally for an `EVIDENCE_TIE`. Whether it holds for a
  `SEARCH_BOUND_EXCEEDED` certificate is an open governance question, and
  settling it inside the ledger would settle it in the wrong place.
- **Identifier generation.** `§16` requires ASSAY-internal ids to be *"derived
  from a canonical traversal of the input in a fixed order"*, which is a
  property of the stage that assigns them. Nothing here reaches for a counter or
  a source of randomness.
- **A schema library.** `@assay/domain` uses zod because `ARCHITECTURE.md §4`
  requires it at trust boundary 1. Boundary 3 requires no such thing, and the
  field readers here have to produce a fresh frozen copy with a single read per
  field anyway — which is the part that matters and which a schema parse would
  not give on its own.
