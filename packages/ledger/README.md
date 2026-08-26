# `@assay/ledger` — Layer A, and Layer B's projection

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

**Of Layer B, only `projection.ts` is present.** `journal.ts` — deciding *which*
accounts an event posts to — is the **next** milestone rather than a blocked
one: spec 1.4.0 settled the three questions that held it (`DECISION_BRIEF.md
§A.7` G-F, G-G and C-1). It is deliberately absent rather than stubbed; see
[What is deliberately not here](#what-is-deliberately-not-here). `close-gate.ts`
and `close.ts` follow it.

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
| `LedgerEventError`, `TrialBalanceError`, `ChainMismatchError` | Three failures that demand three different responses. |
| `projectLedger(events)` | Replay an event log into the seven control-account balances. |
| `projectChain(chain)` | The same over a chain's events, reading none of its cached totals. |
| `projectByDecisionState(events, states, target?)` | `proj_agent` (`EVALUATION_SPEC.md §4.4`) — the covered-set projection, `RECONCILED` by default. |
| `assertTrialBalance(projection)` | The hard-abort reading of `I1` (`ARCHITECTURE.md §12`). |
| `LedgerProjection`, `AccountBalances`, `DecisionState`, `DecisionStates` | The projection's result and its caller-supplied inputs. |
| `ProjectionInputError` | The caller's decision map does not cover a posting event. |

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
three governance questions an earlier revision of this file recorded here: the
universal `P8` fallback was withdrawn and `P8` narrowed to adjustment
observations (`DECISION_BRIEF.md §A.7` G-F), the posting-trigger mapping was
added as `DATA_MODEL.md §17.1.1` and is total over kind × terminal state ×
exception class (G-G), and `ValidatedDecision` was defined field by field in
`ARCHITECTURE.md §4` boundary 3 (C-1). What remains is ordering, in the sequence
`§L.2` fixes.

- **The single `ValidatedDecision` write path** (`§L.1` rule 4, boundary 3).
  The type is now defined — `ARCHITECTURE.md §4` gives its fields, its
  declaration site (this package) and its enforcement (a non-exported
  unique-symbol brand plus an ESLint path allowlist) — and it is **declared with
  the write path it exists to guard**, not ahead of it. Only
  `engine/src/s5-validate.ts` may mint one, and S5 does not yet exist. Layer A
  therefore contains **no mutating function and no I/O at all**: `appendEvent`
  returns a new chain and leaves its argument untouched, so the count of
  mutating functions in this package is zero rather than one. The write path
  arrives with persistence. `§K` allocates no storage module to this package and
  `better-sqlite3` is in no manifest, so the ledger is in-memory at this
  milestone; the projection is a pure function of an event array and takes no
  connection.
- **The posting table `P1`–`P8`.** Deciding which accounts an event posts to is
  `journal.ts`, on `§K`'s Layer B line, and it is the **next** milestone.
  `§17.1.1` now maps `Observation.kind` × terminal state × `ExceptionClass` onto
  `P1`–`P8` and onto the `source_entity_id` each posting carries; `§L.4` makes
  inventing a row in that table a spec amendment, and the table is total, so
  there is nothing left to invent. Nothing in this package anticipates it: Layer
  A admits the `journal_lines` a caller supplies and never decides what they
  should have been, and `projection.ts` reads the lines an event already carries.
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
