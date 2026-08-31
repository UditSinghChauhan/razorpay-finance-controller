# `@assay/eval` — the measurement layer

Written against **specification 1.4.29 / benchmark 1.0.7**.

`ARCHITECTURE.md §3`: *"Metrics, bootstrap CIs, baselines, ablations, report
generation. Must run against any agent behind one interface, so ablations are
configuration, not forked code."*

## What this package guarantees

1. **It holds no agent implementation.** `src/agent.ts` is the interface
   `ARCHITECTURE.md §10` names — *"Observations -> Decisions + Ledger"* — and
   nothing in `src/` implements it. An agent inside the scorer would make the
   ablations forked code, which is what `EVALUATION_SPEC.md §3.2` says would
   invalidate them as controls. Asserted in `tests/discipline.test.ts`.

   **`DECISION_BRIEF.md §K` placed `agents/{assay,b0,b1,b2,a1,a2,a3}.ts` under
   `packages/eval/src/`, and spec 1.4.29 (register row `DATA_MODEL.md §22.2`
   **M47**) moved them to `apps/cli/src/agents/`.** Through spec 1.4.28 this
   README recorded the departure as *"unreconciled frozen text … no amendment has
   been made"*; the amendment has now been made. The reason is unchanged: an
   ASSAY agent must import `packages/engine` (S1–S5), `packages/llm` (R1–R4) and
   `packages/probe` (`RECONCILIATION_SPEC.md §6.2`'s loop), and all three are
   refused inside this package. **Register row M37 had already ratified that at
   spec 1.4.23** — *"`packages/eval` (scoped to measurement; hosting the run loop
   puts the system under test inside the thing measuring it)"* — so the
   contradiction was M37-vs-`§K` rather than a new finding, and `§K` is what
   moved.

   The composition lives in the composition root (`apps/cli`) and reaches this
   package by **injection**: `apps/cli` imports `@assay/eval` and passes a
   constructed `Agent` in, rather than this package importing the agent's
   dependencies. M37 also rejected `apps/cli`, on the ground that *"`packages/eval`'s
   agent runner could not import it and the loop would be **forked**"* — that
   assumed the opposite import direction, which injection reverses. `§L.2`
   constrains only the packages named in its build order and is silent on
   `apps/cli`, so the edge is available and the graph stays acyclic. Nothing is
   forked: all seven agents share this interface and differ only by `RunConfig`
   flags.

   **`src/report/` does not move** — a renderer reads metrics and imports none of
   the three, so it never participated in the contradiction.
2. **No agent can reach ground truth or an oracle label through it.**
   `AgentInput` has exactly two fields — `observations` and `config` — and no
   path, reader, or label among them. `EVALUATION_SPEC.md §2`'s first rule is a
   property of the type, not a convention.
3. **Ground truth enters through exactly one module.** `src/truth.ts` is the
   only file that names `GroundTruth`. `PREREGISTRATION.md §6.2` `AL1`/`AL2`
   bind the **engine** and the **oracle**, not the scorer — a scorer that could
   not see the answer key could not mark the paper — so what this package owes
   is a *visible* boundary rather than an absent one. The import site is counted
   by a test.
4. **It performs no I/O, reads no clock and draws no ambient randomness.** The
   bootstrap is seeded and its interval is a function of `(sample, seed)` alone,
   which is what `PREREGISTRATION.md §8` metric 23 and
   `EVALUATION_SPEC.md §5.5` require of a number that reaches a report.
5. **It computes no close gate.** `G1`–`G5` belong to `packages/ledger` Layer B.
   See *The close gate is not ours* below.
6. **It draws no sample and reads no split.** `§5.3`'s `R = 20,000` pairs and
   `§6.1`'s seeds are `apps/cli`'s to draw.
7. **A metric off `PREREGISTRATION.md §8`'s list is checkable as such.**
   `src/metric-list.ts` holds the frozen list as data, and `isFrozenMetric`
   answers `§L.4`'s question — *"Reporting a metric not in
   `PREREGISTRATION.md §8` without labelling it `EXPLORATORY`"* is prohibited.

## Module map

| Module | Holds |
|---|---|
| `frozen.ts` | Every frozen parameter this package reads, transcribed with its clause. `C_review`, `C_exception` and the bootstrap parameters exist in **no** other package — this is their first home, not a second copy |
| `metric-list.ts` | `PREREGISTRATION.md §8`'s 28 metrics as data, with what is not yet computable and why; and the four `EXPLORATORY` companions the specification requires be printed beside a frozen figure |
| `agent.ts` | `ARCHITECTURE.md §10`'s interface, `EVALUATION_SPEC.md §3`'s agent table, and `AgentInput` — the whole of what an agent is handed |
| `run.ts` | `AgentRun`, the scorer's input; and `CloseOutcome`, the typed boundary the unwritten close gate leaves |
| `run-key.ts` | `M48`'s `(agent_id, split, seed, llm_mode)` — what identifies one scored run, and the `seed`-only dimension the bootstrap resamples. Holds no path: layout is `apps/cli`'s |
| `truth.ts` | The ground-truth projection. The single `@assay/generator` `GroundTruth` import site |
| `gates/consistency-gate.ts` | `§5.3`'s differential test. `§L.1` rule 3's single permitted exception |
| `metrics/coverage.ts` | Metrics 1, 9, 27, 28 and `§4.1`'s `EXPLORATORY` audit line |
| `metrics/match.ts` | Metric 5, at the allocation-edge level |
| `metrics/abstention.ts` | Metric 4 against the oracle's labels, plus metrics 17, 18 and 19 |
| `metrics/harm.ts` | Metric 6, both halves, over the covered set with Suspense excluded |
| `metrics/cost.ts` | Metrics 2 and 8, and `§4.5`'s `net_cost_inr_excluding_e13` |
| `metrics/calibration.ts` | Metric 7 and the reliability diagram |
| `metrics/risk-coverage.ts` | Metric 3 — `AURC`, by trapezoid over `§5.1`'s ε sweep |
| `metrics/close-loop.ts` | Metrics 11–14, **read** from a supplied close outcome |
| `metrics/robustness.ts` | Metrics 15 and 16 — the injection and queue-flood surfaces |
| `metrics/components.ts` | Metric 25 — `component_size_distribution`, `intractable_rate` |
| `metrics/sensitivity.ts` | Metric 26 — `§5.3`'s `τ` and `C_review` sweeps, and its instability rule |
| `bootstrap.ts` | `§7`'s percentile bootstrap, `§5.2`'s overlap rule, metric 24 |

## `§L.1` rule 3 — the one file that may import both

> *"The single permitted exception is `packages/eval/src/gates/consistency-gate.ts`,
> which must import both engine and oracle to compare them; it is allowlisted by
> path in the lint config and **may contain no logic other than the differential
> test**."*

The allowlist is a **config-level override** in `eslint.config.js`, not a
file-level `eslint-disable`: the `packages/eval/**` block sets `noInlineConfig`,
and an allowlist a file grants itself is not an allowlist. Two blocks make it
work — a general ban on `@assay/engine` under `packages/eval/**`, so that there
is something for the exception to be an exception *to*, and a path-scoped block
that restates the rules without the engine group.

The file implements **no predicate**. Every verdict comes from `evaluate`
(engine) or from `checkAll`, `checkC3Ordering` and `checkC3BankArrival` (oracle).
It builds **no context**: each side is asked for its own — `parentOrderIdResolver`
and `oracleContext` — so a disagreement about `C2`'s referent set is *inside* the
measurement rather than hidden by a shared helper. `tests/discipline.test.ts`
asserts all of this by reading the file.

**The comparison is on *exclusion*, not on the verdict word.** The engine
publishes `PASS | FAIL | NON_BINDING | NOT_EVALUATED` per clause; the oracle
publishes `SATISFIED | NOT_SATISFIED | NON_BINDING`. `RECONCILIATION_SPEC.md
§4.1` says what a constraint is — *"filters — they admit or exclude, never
rank"* — and `§5.3` compares *"the engine's **admissibility** verdict"*. The
admissibility content of every word in both vocabularies is one bit, and that bit
is what is compared. Both raw words travel on every divergence, so the report
never shows a bit without its provenance. Folding the vocabularies any other way
would mean deciding which of `NOT_EVALUATED` and `NON_BINDING` the oracle
"meant", which is an opinion about a constraint and therefore forbidden in this
file.

## The divergence this gate found on its first run

**`C6` over the empty member set.** Recorded, not resolved:

```
  packages/engine/src/s2-candidates.ts  c6()
      if (all.length === 0) return "NOT_EVALUATED";

  packages/oracle/src/predicates.ts     checkC6()
      Σ over [] = 0, compared against target.amount  ->  NOT_SATISFIED
```

Both are defensible against a declaration that is silent on the empty set.
`§4.1` defines `NOT_EVALUATED` as *"the clause had no comparand on this
candidate"*; `C6` reads *"`Σ credit(members) − Σ debit(members) = target.amount`,
**zero tolerance** in paise"*, whose sum over the empty set is `0`.

It is **unreachable through the engine's own generation** — `generateCandidates`
enumerates `for (let mask = 1; ...)` and never emits the empty subset — and
**reachable through `§7.3`'s sample**, which draws pairs *"deliberately including
inadmissible ones"*. A sampler that draws one fails the build, which is the gate
working as specified.

Neither side is changed here. `packages/engine`'s semantics are frozen, and
amending `packages/oracle` to agree would resolve an open seam by fiat — which is
what a differential test exists to prevent. `tests/consistency-gate.test.ts` pins
the finding; if either side is amended those tests fail and must be rewritten.

## The close gate is not ours

`RECONCILIATION_SPEC.md §10.1` fixes `G1`–`G5` and `§10.4` fixes the procedure.
`ARCHITECTURE.md §8` places both in **`packages/ledger` Layer B** — *"the
double-entry projection and the posting rules (`journal.ts`, `projection.ts`,
`close-gate.ts`, `close.ts`)"* — and `DECISION_BRIEF.md §L.2` schedules *"Ledger
Layer B + close gate G1–G5"* there.

**`close-gate.ts` and `close.ts` do not exist.** `packages/ledger/src/index.ts`
records it: *"`close-gate.ts` and `close.ts` follow, and are deliberately absent
rather than stubbed."*

`run.ts`'s `CloseOutcome` is the typed boundary that absence leaves.
`metrics/close-loop.ts` **consumes** it. It re-derives exactly one thing —
`close_threshold_paise`, and therefore `period_status` — because
`DATA_MODEL.md §20` requires `period_status` to be *"independently recomputable
from the close report alone"*, and a requirement nothing checks is decorative.
That is a cross-check on the producer, not a second implementation: `g3_recomputed`
and `status_recomputes` are reported **beside** the producer's own fields rather
than in place of them. No gate verdict is computed here, and
`tests/discipline.test.ts` asserts that the module reaches no hash chain, no
trial-balance assertion and no `invariants_failed` scan.

## What is derivable now, and what is blocked

Every metric whose inputs are observations, an agent's product, ground truth or
the oracle's labels is computed here: **1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13,
14, 15, 16, 17, 18, 19, 24, 25, 26, 27, 28**, plus all four required
`EXPLORATORY` companions.

`metric-list.ts` carries this as **data rather than prose**: every row names
either the module that computes it (`computedBy`) or the dependency that stops it
(`blockedBy`), never both and never neither, and `tests/discipline.test.ts`
checks that each named module exists. A list that says *"computed"* and points at
nothing is how a report comes to carry a metric no code produces.

The blocked rows, so a missing number is never mistaken for a zero:

| Metric | Blocked on |
|---|---|
| 10 `exception_class_confusion` | `R2` triage output on a run; no run artifact exists |
| 20 `hallucinated_id_rate`, `id_rejection_rate` | LLM call telemetry on a run |
| 21, 22 throughput / latency / cost | wall-clock instrumentation; `apps/cli` owns the harness |
| 23 `determinism_check` | two committed run artifacts to compare root hashes across |

Metrics 11–14 are computed **from a supplied `CloseOutcome`** and have no
producer yet. No benchmark data exists and none is generated here.

## What is deliberately absent

**A report renderer.** `EVALUATION_SPEC.md §5.4` lists thirteen required
contents, of which items 1, 2, 3, 10, 11 and 13 are verbatim quotations from
documents and item 4 needs the gate artifacts. Rendering belongs with the
producer of `report.html`, which `§7`'s reproduction recipe puts behind
`assay report` — `apps/cli`.

**Any `R3` / `propose_probe` logic.** `DECISION_BRIEF.md §H` tier H1.
`EVALUATION_SPEC.md §4.13` has this package read the probe **count** back off a
run, which arrives on `AgentRun` as a value.

**A second reference model.** `PREREGISTRATION.md §10` V22 records that one was
*"considered and rejected — `DECISION_BRIEF.md §L.4` would force it to
`EXPLORATORY`, where it could support no claim"*.

## Running the tests

```
pnpm run verify          # typecheck + lint + the whole workspace suite
npx vitest run packages/eval
```

No test here touches a `PREREGISTRATION.md §6.1` split seed or invokes the
generator's simulation. Every observation fixture is hand-built and validated
against the frozen `ObservationSchema`, so a fixture that drifts from the schema
fails to build rather than testing a shape ingest would reject.
