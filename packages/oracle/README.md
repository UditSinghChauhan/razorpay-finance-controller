# `@assay/oracle` — the Ambiguity Oracle

Exhaustive enumeration of evidence-admissible allocations, from **observations
only**. `ARCHITECTURE.md §3`: *"Deliberately a second, slow, naive
implementation. Its whole value is being *not* the engine and *not* the
generator."*

Written against **specification 1.4.16 / benchmark 1.0.3**.

## What this package guarantees

1. **It reads observations and nothing else.** `enumerateAll` takes the same
   input every agent receives. The completeness gate takes ground truth as an
   **argument**; `apps/cli` performs the read.
2. **It performs no I/O.** No filesystem, network or process import anywhere in
   `src/`. `PREREGISTRATION.md §6.2` `AL2` requires a runtime guard against
   reading a `ground_truth*.jsonl` path — there is nothing here for such a guard
   to intercept, which is stronger than passing one. Asserted in
   `tests/discipline.test.ts`.
3. **Its output is a pure function of its input.** No clock, no `Math.random`,
   no iteration over an unordered collection. Rotating the observation array
   changes no solution and no label — the oracle's analogue of `I9`, property-tested.
4. **Nothing is fused and nothing short-circuits.** One exported predicate per
   constraint; `checkAll` evaluates all eight on every candidate, including ones
   the first constraint already rejected, because `§5.3`'s consistency gate
   compares the two implementations *constraint by constraint*.
5. **It shares the declaration, not the predicates.** `constraints.decl.ts` is
   imported; `C5` is re-implemented rather than delegated to
   `@assay/domain`'s `checkReconLineInvariants`, and materiality is projected
   natively rather than through `@assay/ledger`. Sharing either would make the
   consistency gate compare a function with itself.
6. **A budget is a bound, not a truncation.** Exceeding `K_oracle` or `C_oracle`
   returns **no** solutions and a named status — never a partial set presented as
   exhaustive (`RECONCILIATION_SPEC.md §4.3`).
7. **This package writes no file.** `assay oracle` belongs to `apps/cli`.

## Module map

| Module | Holds |
|---|---|
| `frozen.ts` | Every frozen parameter, transcribed with its clause. Transcribed rather than imported because `AL1` bars importing the generator — the duplication is what `§5.3` compares |
| `conventions.ts` | The convention register; `UNRATIFIED` is pinned by a test |
| `universe.ts` | `DATA_MODEL.md §11.1`'s candidate universe — the member and target contribution mappings |
| `predicates.ts` | `C1`–`C8` as naive per-candidate booleans, one function each |
| `anchors.ts` | `AN1` and `AN2`; `AN5` is retired by `§3` and has no code path |
| `enumerate.ts` | Co-settlement coherence classes, and exhaustive enumeration under the budgets |
| `components.ts` | `RECONCILIATION_SPEC.md §5`'s union-find decomposition, and `Component.total_value_paise` — the base `τ` is taken against |
| `classify.ts` | Counterfactual projection, materiality, `τ`, `§5.4`'s label, and `labelAll` — enumerate → decompose → classify |
| `completeness-gate.ts` | `§5.3`, pure, with truth passed in and expressibility scoping |

## What is deliberately absent

**The consistency gate.** `DECISION_BRIEF.md §L.1` rule 3 places it in
`packages/eval/src/gates/consistency-gate.ts`, *"the single file permitted to
import both engine and oracle"*. `checkAll`, `Verdict` and `ConstraintVerdicts`
are exported for it to call.

**A bank-line candidate search.** `DATA_MODEL.md §11.1` derives that a settlement
is not a member-eligible kind, so a `bank_line` target has no admissible member
and reaches `EXCEPTION` by `§9`'s *"no admissible candidate exists at all"*.
Recorded at `PREREGISTRATION.md §10` V18.

## Specification seams

Every decision the frozen specification does not state is a row in
`conventions.ts` with `spec_basis: null`. **One is unratified**, and the count is
pinned so a second cannot appear unnoticed.

| Id | Seam |
|---|---|
| `O-MATERIALITY-IMPL` | Whether the counterfactual projection is computed natively or through `@assay/ledger`. **Semantic impact nil** — both routes implement `§17.1`'s shared frozen posting table |

### `O-C2-REFUND` left this table at spec 1.4.8, and it could not have stayed

`C2`'s *"a refund may only offset a payment on the same `order_id`"* admitted a
**co-membership** reading — the parent must be in the candidate — as readily as
the referential one implemented here. `RECONCILIATION_SPEC.md §4.1` now states
the referential reading, that the named payment **need not be a member**, that an
absent parent is `E10_REFUND_ORPHAN` rather than a `C2` exclusion, and that the
`recon_line` governs where both views carry the parent's `order_id`.

Co-membership is **refuted**, not disfavoured: `§4.2`'s one-batch-per-capture-day
and `§4.1`'s `F02` *"batch N+2"* key a refund's batch to its own day, so the
parent is never a co-member and the reading would exclude every refund-carrying
true allocation and fail `§5.3`.

**The row was also in the wrong register.** `C2` binds the engine too, `§5.2` has
both sides implement *"one declarative specification"*, and
`constraints.decl.ts` carried the ambiguous sentence verbatim — so a
package-local convention could not bind the party that most needed binding. The
clause is amended there as well, and `constraint_set_hash` moves for it alone.

### `O-C4-UNIT` left this table at spec 1.4.7

`τ`'s neighbour in the frozen thresholds, `C4`, bounds `settled_at − created_at`
at one day — and `DATA_MODEL.md §6` makes `settled_at` **settlement-scoped**, so
the gap varies across a batch by the spread of capture times. On a `T+1` batch a
**true-allocation** member captured late in the day satisfies `C4` on a
calendar-date reading and fails it on an elapsed-seconds reading, which put the
**completeness** gate — and so benchmark validity — on the reading. This row used
to say the opposite: that the completeness gate was insensitive and the risk sat
with the consistency gate.

`PREREGISTRATION.md §4.2` now freezes the clock grid, under which both readings
admit every member of every true allocation, so the measurement stops being a
decision. The generator's `U-CLOCKS` — where the grid actually lived, unratified
— is ratified against the same clause, and renamed `C-CLOCKS` under that
package's convention of prefixing a ratified row `C-`.

### Two rows left this table without a spec amendment

`O-ANCHOR-SCOPE` and `O-MATERIALITY-SCOPE` were ratified on citations that were
available the whole time and had simply not been traced. **Neither changed a line
of behaviour**; what changed is which document is recorded as the authority.

- **`O-ANCHOR-SCOPE`** — `§3` strikes `AN5` through in terms (*"NOT EXERCISED at
  spec 1.4.1 … The anchor set is `AN1`–`AN4`"*); `§4` and `§4.1`'s `C3`
  bank-arrival half require `AN1` and `AN2` **by name**; and `AN3`/`AN4` relate
  kinds that are neither targets (`§17.1.1`) nor member-eligible (`§11.1`), so
  they remove nothing from the search space `§3` operates on. Implementing them
  would change no candidate, no label and no metric.
- **`O-MATERIALITY-SCOPE`** — `§5` commits allocations *"in a single serialized
  pass **after** all components are solved"*, so at `S4` a displaced member has
  no determined disposition, and `§17.1.1` triggers `P5`/`P6` on a **terminal
  state** that does not yet exist there. It was split out of a combined row whose
  other half — native vs `@assay/ledger` — is genuinely undetermined and remains
  above as `O-MATERIALITY-IMPL`. Bundling them had let a citation-worthy decision
  inherit a null basis, and the old row warranted itself by **measurement**,
  which is the wrong kind of evidence for what the specification means.

### `O-TAU-BASE` was the fifth, and spec 1.4.6 ratified it

`τ = max(₹100, 10 bps of component value)` reads `Component.total_value_paise`.
Through spec 1.4.5 `DATA_MODEL.md §11` **declared that field without defining
it**, so this package declared a base of its own — the target's own amount — and
registered it unratified. The amendment defines it:

```
  Component.member_obs_ids   = §5's UNANCHORED observation nodes
  total_value_paise          = Σ value(observation) over that field
```

`components.ts` now computes it from `RECONCILIATION_SPEC.md §5`'s union-find,
and `labelAll` supplies it to `classify`. Two things about the swap are on the
record rather than smoothed over:

**It moved labels.** A component base runs roughly **2×** a target base on a
two-solution component, so a materiality between the two `τ` values is
`TRULY_AMBIGUOUS` under one and `IMMATERIALLY_AMBIGUOUS` under the other. The
divergence test was kept, not deleted — it still measures the gap, and now also
asserts which side the ratified base lands on, so a silent revert fails loudly.

**It excludes anchored observations from the base.** They are members of every
*candidate* (`C6` reads the whole allocation) but not *nodes* of the component
(`§3` removes anchored records from the search space, and `§11` states the
component **is** that search space). A component whose unanchored value is small
therefore reaches the ₹100 floor where the whole allocation would not.
`DECISION_BRIEF.md §A.13` discloses this; a test measures it.

`O-COMPONENT-NODES` records the node set itself, with a citation rather than a
null basis: `§11` states the conjunction — *"unanchored, and of a member-eligible
kind"* — in terms.

## Running the tests

```
pnpm run verify          # typecheck + lint + the whole workspace suite
npx vitest run packages/oracle
```

No test here touches a `PREREGISTRATION.md §6.1` split seed, invokes the
generator, or prints an observation payload. Every fixture is hand-built and
validated against the frozen `ObservationSchema`, so a fixture that drifts from
the schema fails to build rather than testing a shape ingest would reject.
