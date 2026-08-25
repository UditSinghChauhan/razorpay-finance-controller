# `@assay/domain`

The shared definition of ASSAY's domain. `ARCHITECTURE.md §3` states its
purpose: *"One definition of truth for shapes and constraints, shared by
generator, engine, oracle and eval."*

It holds the identifiers, control accounts, canonical JSON and hard-constraint
declaration that every later package shares, and the strict ingest schemas that
sit on trust boundary 1.

## What this package guarantees

1. **Identifier grammars are the specification's, and nothing more.**
   `DATA_MODEL.md §0` rule 3 gives a full grammar for six Razorpay identifiers
   and only a prefix for the ASSAY-owned ones. This package validates exactly
   that much and invents no suffix length where none is stated.
2. **The two identifier namespaces are disjoint.** Rule 3's stated reason for
   distinct ASSAY prefixes is *"so a Razorpay ID can never be confused with an
   ASSAY ID"*. A test asserts no prefix in one set is a prefix of any in the
   other.
3. **Canonical JSON depends on the value and nothing else.** Key order,
   insertion order and evaluation count cannot change the bytes. Anything that
   could vary between two runs is rejected rather than serialized.
4. **The control-account set is closed at seven.** `DATA_MODEL.md §17.2` states
   that no eighth account is added, and `EVALUATION_SPEC.md §4.4` sums
   `balance_harm_inr` over exactly this universe.
5. **Determinism.** No `Date`, no `Math.random`, no `Intl`, no locale-dependent
   formatting, no I/O, no environment access, no module-level mutable state and
   no identifier generation.

## Public API

| Export | Meaning |
|---|---|
| `AccountCode`, `ACCOUNT_CODES`, `SUSPENSE_ACCOUNT`, `isAccountCode` | The seven control accounts (`§17`), frozen and in declaration order. |
| `PaymentId` … `DisputeId`, `BankLineId`, `LedgerEntryId`, `ObservationId` | Branded identifier types. |
| `isPaymentId` … `isObservationId` | Grammar validators. |
| `ID_PREFIXES`, `hasRazorpayPrefix`, `hasAssayPrefix` | The prefix registry and ownership tests. |
| `canonicalJson(value)` | Canonical serialization for hashing (`§0` rule 5). |
| `HARD_CONSTRAINTS`, `CONSTRAINT_IDS`, `ConstraintDeclaration` | `C1`–`C8` declared as data. |
| `canonicalConstraintSet()` | The bytes behind `constraint_set_hash`. |
| `nonBindingClauses()` | The clauses the consistency gate must exclude. |
| `PaymentSchema` … `DisputeSchema` and their inferred types | The nine entities (`§2`–`§9`), strict. |
| `ObservationSchema`, `ObservationKind`, `SourceSystem` | The `(kind, source_system, payload)` table (`§10`). |
| `OBSERVATION_KINDS`, `SOURCE_SYSTEMS`, `KIND_SOURCE_SYSTEM` | The table as data, for checking against `§10` row by row. |
| `RECONCILABLE_KINDS`, `REFERENCE_KINDS`, `isReconcilableKind`, `isReferenceKind` | `§10.1` classification. |
| `checkPaymentInvariants` … `checkReconLineInvariants`, `gstIdentityHolds` | `§2`–`§6` ingest invariants. |
| `UnixSeconds`, `Sha256`, and the zod field types | Shared ingest field primitives. |

Reachable **only** at `@assay/domain/untrusted-text`, never from the root:
`UntrustedTextSchema`, `UNTRUSTED_TEXT_FIELDS`, `sanitizeForPreview`.

## Identifiers

Six Razorpay identifiers have a complete grammar — a documented prefix plus 14
alphanumerics. The prefixes are `[RZP-DOC]`; the 14-character suffix is
`[ASSAY-MODEL]`, described by `§0` rule 3 as *"an observed regularity it has
chosen to reproduce, not a documented rule"*.

The ASSAY-owned identifiers (`obs_`, `cand_`, `comp_`, `dec_`, `evt_`, `exc_`,
and `bnk_`/`mle_` from `§7`/`§8`) have **no stated suffix grammar**, so they are
validated on prefix and a non-empty suffix only. The suffix character class is
restricted to `[A-Za-z0-9]` because an ASSAY id reaches `LedgerEvent.body`
through `subject_ids` (`§16`) and is canonically serialized there; permitting
whitespace or non-ASCII would put encoding-dependent bytes into a hashed field.
The **length** is deliberately unconstrained.

> `bnk_` and `mle_` appear in `§7` and `§8` but in neither of `§0` rule 3's two
> lists. They are recorded here as ASSAY-owned, which is what they are — both
> entities are `[ASSAY-MODEL]` in their entirety.

**This package does not generate identifiers.** `§16` requires ASSAY-internal
ids to be derived from a canonical traversal of the input, which is a property
of the stage that assigns them.

## Canonical JSON

`§0` rule 5 states four requirements: *"keys sorted lexicographically, no
whitespace, UTF-8, integers only (no exponent notation)"*.

`JSON.stringify` is **not** used to canonicalize structures — its key order
follows insertion order, which is a property of how a value was built rather
than of what it means. It is used for one narrow purpose, escaping a string
leaf, because ECMA-262 specifies that escaping exactly and reimplementing it
would add a second, less-tested escaper for no benefit.

Rejected rather than coerced: non-integer numbers, `NaN`, `±Infinity`, integers
outside the safe range, `undefined` (which `JSON.stringify` silently drops from
objects), `Date`/`Map`/`Set`/class instances, functions, symbols, bigints, and
cycles. Errors are `TypeError` and name the JSON path to the offending value.

## Hard constraints

`ARCHITECTURE.md §7.2` and `PREREGISTRATION.md §5.2` require `C1`–`C8` to live
here **as data** — *"each constraint a named, documented predicate specification
with its real-world justification"*. This module therefore contains **no
predicate implementations at all**: the engine implements them as fused filters,
the oracle as naive per-candidate checks, and the consistency gate compares the
two. A shared function here would make that gate compare the engine with itself.

Two clauses are declared **`expected-non-binding`** agent-side, exactly as the
specification does: `C8` in full (Route is out of Tier-0 scope) and `C2`'s
adjustment half (`related_entity_id` is not observable). This is not a weaker
constraint — `PREREGISTRATION.md §5.3` excludes such clauses from the
consistency gate's pass criterion, because *"a gate that cannot fail on a
constraint neither side can evaluate would otherwise report agreement it never
tested"*.

`C6` carries an **empty** provenance list because `RECONCILIATION_SPEC.md §4.1`
tags no provenance class on its row. No class is asserted on its behalf:
`DATA_MODEL.md §0` rule 6 makes an untagged Razorpay claim a defect, and
inventing a tag would conceal one rather than surface it.

Membership and order are frozen. Order matters because `constraint_set_hash`
(`DATA_MODEL.md §18`) is computed over this structure, so reordering an
otherwise unchanged set would change the hash.

## Entity schemas

The nine entities of `DATA_MODEL.md §2`–`§9`, transcribed field for field. Every
schema is **strict**: unknown keys are rejected rather than stripped, per
`ARCHITECTURE.md §4`. Stripping would let a field ASSAY does not model travel
silently beside one it does.

Field-level rules follow the specification exactly rather than what would be
convenient: `Payment.method` omits `paylater`, `Refund.speed_requested` and
`speed_processed` carry **different** value sets, `Dispute.status` includes
`under_review`, `card_network` uses `American Express` rather than `Amex`,
`credit_type` admits only `default`, `Settlement` has exactly eight parameters
with no `currency` and no `settled_at`, and `ReconLine.type` **rejects Route
`transfer` rows** rather than modelling a product ASSAY does not cover.

Money is `@assay/money`'s `Paise` throughout, narrowed at ingest to non-negative
safe integers per `ARCHITECTURE.md §4`. No monetary field accepts a float, a
numeric string, `NaN`, an infinity or an unsafe integer.

## Observation model and the trust boundary

`ObservationSchema` is the normative `(kind, source_system, payload)` table from
`§10`, expressed as a discriminated union so an unlisted triple has no branch to
parse into. A test walks all 9 x 8 pairs and asserts the 63 off-table
combinations are rejected. `Adjustment` is deliberately absent from the payload
union: an adjustment reaches ASSAY only as a `ReconLine` with
`type === "adjustment"`, carrying no `reason`, no `direction` and no
`related_entity_id`. That information boundary is what `§17.2` and `C2` both
rest on.

`§10.1`'s classification is a property of the kind alone — seven reconcilable
kinds and two reference kinds, fixed before any run and never dependent on a
decision. That is what stops `REFERENCE` becoming a drop path for an observation
the engine failed to explain.

## The quarantine

`UntrustedText` lives at `src/schemas/untrusted-text.ts` and is reachable **only**
as `@assay/domain/untrusted-text`. It is deliberately not re-exported from the
package root, because `packages/engine` imports the rest of this package
legitimately and a root re-export would make the ban unenforceable.

`DATA_MODEL.md §0` rule 4 keeps free text off every structural record, and strict
mode is what makes that structural: `description`, `notes`, `narration`, `memo`
and `order_receipt` appear in no entity schema, so a record carrying one has no
branch to parse into. The defence is not that the core chooses not to read
hostile text — it is that it cannot.

`sanitizeForPreview` strips C0/C1 controls, bidirectional overrides and
zero-width characters for display only, keeping tab, newline and carriage
return, which are ordinary content in a bank narration. Nothing downstream may
match, parse or decide on the preview; `raw` keeps the verbatim value.

## Ingest invariants

`§2`–`§6`'s named invariants are checked **separately** from schema parsing,
because the specification treats the two failures differently.
`RECONCILIATION_SPEC.md §2` step 2: a record failing an ingest invariant
"becomes `E05`/`E06`/`E07` immediately", not a parse error. Folding them into
the schema would leave `E06_FEE_MISMATCH` and `E07_GST_MISMATCH` with nothing to
classify, so these return violations rather than throwing.

Only **intra-record** invariants are implemented. `§4`'s
`amount <= payment.amount`, `Σ refunds(payment) <= payment.amount` and
`refund.created_at >= payment.created_at` each need a second record and belong
to the stage holding the observation set. Mapping a violation onto an exception
class is likewise not done here: `ExceptionClass` is not part of this package.

> `DATA_MODEL.md §15` phrases `E07` as `tax != round_half_up(0.18 x (fee - tax))`
> **"within rounding tolerance"**, and no tolerance magnitude is stated anywhere
> in the specification. `gstIdentityHolds` implements the identity **exactly**
> and takes no tolerance. A caller needing one must obtain the magnitude from a
> spec amendment, following the same rule that governs `C6`, where an
> unspecified tolerance is refused outright.

## Deferred to later milestones

Not implemented here, and deliberately not stubbed:

- **Soft-evidence weights `SE1`-`SE5` and the frozen numeric thresholds.**
  `PREREGISTRATION.md §5.2` scopes `constraints.decl.ts` to the hard
  constraints; the weights are frozen in `PREREGISTRATION.md §7` and belong to
  the stage that ranks candidates.
- **`ExceptionClass`, `Candidate`, `Component`, `Decision`, `LedgerEvent`.** None
  appears in `DECISION_BRIEF.md §K`'s domain file list; each belongs to the
  package that produces it.
- **Digest computation.** This package produces the bytes to hash; computing
  SHA-256 belongs to the ledger and ingest stages.
- **The dataset-window bound on timestamps.** `ARCHITECTURE.md §4` requires
  timestamps to be "plausible Unix seconds **within the dataset window**". The
  window is a property of the dataset being ingested, not of a schema, so the
  field type enforces integer Unix seconds and the ingest stage applies the
  window.
