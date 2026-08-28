# `@assay/oracle` — the Ambiguity Oracle

Exhaustive enumeration of evidence-admissible allocations, from **observations
only**. `ARCHITECTURE.md §3`: *"Deliberately a second, slow, naive
implementation. Its whole value is being *not* the engine and *not* the
generator."*

Written against **specification 1.4.6 / benchmark 1.0.3**.

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
`conventions.ts` with `spec_basis: null`. **Four are unratified**, and the count
is pinned so a fifth cannot appear unnoticed.

| Id | Seam |
|---|---|
| `O-C2-REFUND` | Which reading of `C2`'s refund half. The co-membership reading is refuted by `§5.3`; the referential reading is implemented. Audit seam `B6` |
| `O-MATERIALITY-PROJECTION` | Whether displaced members' terminal-state postings enter the counterfactual. Both readings agree in magnitude on every material pair measured |
| `O-C4-UNIT` | Whether `C4`'s *"calendar days"* is elapsed seconds or a date difference |
| `O-ANCHOR-SCOPE` | Which anchors bear on which target kind |

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
