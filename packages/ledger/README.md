# `@assay/ledger` — Layer A

The shadow ledger's **audit event layer**. `ARCHITECTURE.md §8` states what it
is for: *"append-only, hash-chained, one event per decision or state change.
Answers what happened, who did it, on what evidence, and when."*

`DECISION_BRIEF.md §K` scopes Layer A to `events.ts` and `hash-chain.ts`. Layer
B — `journal.ts`, `projection.ts` — and the close gate are later milestones and
are deliberately absent rather than stubbed.

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
   Nine fields in, five excluded. Every field is copied out by name, so a field
   added to `LedgerEvent` later cannot reach the digest by accident.
4. **Two runs over identical inputs produce identical root hashes.** This is
   metric 23 (`determinism_check`) and invariant `I9`. No clock, no randomness,
   no locale, no environment access, no module-level mutable state.
5. **Any change to hashed content is detected.** Verification recomputes the
   chain from genesis and reports each failed check by name rather than
   throwing, because `GET /runs/:id/ledger/verify` *"returns pass/fail per
   check"*.
6. **Invariant `I1` holds at every point in the log.** `ARCHITECTURE.md §3`
   makes the trial balance *"a property of this package, not a convention its
   callers must remember"*, so an append that would break it is refused.
7. **No floating-point money, ever.** Validity is `@assay/money`'s `isPaise`,
   never a second opinion, and amounts pass through `paise()` so a negative zero
   cannot enter as a second spelling of zero.

## Public API

| Export | Meaning |
|---|---|
| `LedgerEvent`, `LedgerEventContent`, `LedgerEventDraft` | `§16`'s record, in three stages: what the caller supplies, that plus its position, and the whole thing. |
| `JournalLine`, `EventActor`, `AmbiguityCertificate`, `CertificateSolution` | The nested structures of `§16` and `§13`. |
| `EVENT_KINDS`, `ACTOR_TYPES`, `LLM_PROVIDER_IDS`, `CERTIFICATE_REASONS` | The closed sets, in declaration order. |
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

## Decisions this package had to make

The specification leaves four things open that an implementation cannot leave
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

- **The single `ValidatedDecision` write path** (`§L.1` rule 4, boundary 3).
  Only stage S5 may construct a `ValidatedDecision`, and S5 does not yet exist.
  Layer A therefore contains **no mutating function and no I/O at all**:
  `appendEvent` returns a new chain and leaves its argument untouched, so the
  count of mutating functions in this package is zero rather than one. The write
  path arrives with persistence, which is Layer B's SQLite tables.
- **The posting table `P1`–`P8`.** Deciding which accounts an event posts to is
  `journal.ts`, on `§K`'s Layer B line. It is also where two open governance
  questions land — the universal `P8` fallback and the posting-trigger mapping —
  and Layer A is independent of both.
- **Balances and the trial-balance projection.** `projection.ts`. This package
  carries running `Σ dr` / `Σ cr` totals as an append-time `I1` guard only,
  never as an authoritative balance: `verifyChain` recomputes both from the
  events and never reads them. Per-account balances are absent entirely.
- **The close gate `G1`–`G5`.** `close-gate.ts`. `verifyChain` implements the
  mechanism `G4` runs and nothing else.
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
