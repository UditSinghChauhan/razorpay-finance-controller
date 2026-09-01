# `@assay/cli`

Written against **specification 1.4.30 / benchmark 1.0.8**.

`assay generate · oracle · run · bench · close · verify · seal · report`
(`DECISION_BRIEF.md §C` T0-11; `report` appended at spec 1.4.29, register row
`DATA_MODEL.md §22.2` **M48**).

> *"**all filesystem I/O** — it acquires raw source contents and passes them into
> `packages/domain`'s `S0` boundary, and **performs no `S0` transform itself**
> (spec 1.4.18). The CLI is the real interface; the UI is a view over it.
> Everything demonstrable must be scriptable."* — `ARCHITECTURE.md §3`

This package is a **composition root**. It holds no reconciliation logic at all.

**From spec 1.4.29 (register row M47) it also holds the seven agent
implementations**, at `src/agents/`. That is not reconciliation logic arriving:
an agent is a *composition* of `engine`, `llm`, `probe` and `ledger` behind
`@assay/eval`'s one interface, and it is built here because `packages/eval`
refuses all three imports — register row **M37** having already ruled that
hosting the run loop there *"would put the system under test inside the thing
measuring it"*. The agents are constructed here and **injected**; `packages/eval`
imports nothing new, and `src/agents/**` may not reach `src/fs/` at all.

## What this package guarantees

- **One door.** `node:` builtins are imported only under `src/fs/`, `readFileSync`
  is called in exactly one file, and every read passes the `AL2`/`AL8` guard
  **before** the file is opened. Asserted in `tests/boundary.test.ts` by reading
  this package's own source.
- **No `S0` transform.** `RECONCILIATION_SPEC.md §2`'s five steps — schema
  parsing, ingest invariants, text quarantine, normalization, provenance — are
  `packages/domain`'s. There is no schema, no `paise(`, no `ingest_hash`, no
  reference to a quarantined field anywhere in `src/`.
- **No `S1`–`S5`, no probe *loop*, no `R3` policy.** No frozen threshold is
  re-spelled here (`§L.1` rule 12), no constraint is evaluated, no stage is
  declared, and **no probe call is constructed** — `packages/probe` is *"the ONLY
  constructor of one"* and the brand is never widened in `src/`. From spec 1.4.25
  this package performs the `§6.2` **dispatch** and composes `§6.6`'s chain
  (`src/probe/`); the loop's decisions stay `packages/probe`'s and the proposal
  policy stays `packages/llm`'s. `widen_temporal_window` is named nowhere in
  `src/` at all — `R3` may not propose it (M40).
- **No transport.** No `http`, `https`, `net`, `tls`, `dgram`, `http2`, `undici`,
  `node-fetch`, `axios` or `fetch(`. `--llm=offline` is the default and every
  `meteredCost` provider is refused, so `T0-11`'s *"clean checkout with no API
  key"* holds structurally rather than by intent.
- **No floating point** (`§L.1` rule 1). This package performs no arithmetic on
  money at all.
- **No dependency beyond the workspace.** The argument parser is hand-rolled and
  the only non-workspace imports are `node:` builtins — `.npmrc` and
  `EVALUATION_SPEC.md §7` make pinned dependencies a reproducibility guarantee,
  and a parser is the cheapest dependency to not have.

## The `AL2` / `AL8` runtime path guard — `src/fs/guard.ts`

`PREREGISTRATION.md §6.2` requires *"a runtime path guard that throws"* for
`**/ground_truth*.jsonl` (`AL2`) and `**/recon_report*.jsonl` (`AL8`).

**It lives here because it can live nowhere else.** Both rules name
`packages/engine` and `packages/oracle`, and neither package performs any I/O —
`packages/oracle`'s own header says *"there is nothing here for such a guard to
intercept, which is a stronger property than passing one"*. A guard installed in
a package that never opens a file intercepts nothing. `§3` gives `apps/cli` all
filesystem I/O, so this is the only process point at which either read can occur.

**It is keyed on the consumer, not on the path**, because each artifact has
named legitimate readers and a path-only refusal would refuse those too:

| Zone | `ground_truth*.jsonl` | `recon_report*.jsonl` |
|---|---|---|
| `AGENT` | refused (`AL2`) | refused (`AL8`) |
| `PROBE_DISPATCH` | refused | **admitted** — `AL8`'s probe route, under `P_max` |
| `GENERATOR_TRUST` | **admitted** — `ARCHITECTURE.md §10`'s pre-agent, offline zone | **refused** — the widening `§A.31` rejected |
| `SEAL` | refused | **admitted** — `§9` step 4's hash (spec 1.4.24, M38) |
| any, under `--sealed` | refused (`AL5`) | admitted on both of `AL8`'s routes |

`AL5` — *"the CLI's `--sealed` flag refuses to print, log or write any
ground-truth field"* — is enforced at the read, because a field that was never
read cannot be printed. It is scoped to `AL2`: `§6.2` gives the recon report
`settlement_id`, `entity_id` and `settled_at` and *"nothing else"*, so it holds
no ground-truth field for the flag to withhold.

### Why `SEAL` is a fourth zone and not a widened third

`PREREGISTRATION.md §9` step 4 hashes `recon_report.jsonl` and step 5 makes its
absence a **SEAL FAILURE**, so the seal has to be able to open the file. `AL8`'s
binding prohibition names **engine and oracle code** and the seal is neither;
spec 1.4.24 (`DATA_MODEL.md §22.2` M38) records the permission and its limit —
*"hashing is not reachability: the seal spends no `P_max`, runs before any agent
exists, and a SHA-256 digest carries no `constituent_entity_id` into any
decision"*.

The one-line alternative — widening `GENERATOR_TRUST` — was **considered and
rejected** in `DECISION_BRIEF.md §A.31`. That zone is claimed by *both* the
`§5.3` completeness gate and the seal, and `§5.3` / `§10` V22 require the gate
never to hold the report: an oracle or gate holding it would void `§5.3`'s
expressibility scoping and make the gate tautological. Widening the shared zone
would have left that guarantee resting on no gate call site happening to use it
today. A distinct zone keeps it structural, and `tests/guard.test.ts` asserts the
refusal that makes it so.

`SEAL` carries `AL8`'s exception and **only** that one: `assay seal` reads ground
truth in `GENERATOR_TRUST`, the route `AL2` has always given it, so a caller
cannot reach ground truth by declaring itself the seal. The four artifacts the
seal hashes are read in three zones — `observations.jsonl` and
`oracle_labels.jsonl` in `AGENT`, `ground_truth.jsonl` in `GENERATOR_TRUST`,
`recon_report.jsonl` in `SEAL`.

From spec 1.4.27 (`DATA_MODEL.md §22.2` M43) `assay oracle` reads ground truth in
`GENERATOR_TRUST` too, for the `§5.3` completeness gate. That is `AL2`'s existing
route and no zone is widened: `AL5` withdraws it under `--sealed`, so neither gate
runs sealed, and `AL8` still keeps `recon_report.jsonl` away from both gates —
*"the `§5.3` completeness gate … stays observations-only"*.

## Per command

| Command | Status | If not complete, what blocks it |
|---|---|---|
| `generate` | **implemented** | — (`packages/generator` gained the recon report's rows at spec 1.4.24; before that, the command reported the missing emitter and wrote the other three artifacts) |
| `oracle` | **implemented**, including both `§5.3` gates | — (`packages/oracle` gained `oracleContext` at spec 1.4.23; the gates were wired at spec 1.4.27, M43, having had no execution path before) |
| `run` | provider selection and the `§6.2` probe loop implemented; full pipeline **blocked** | `packages/domain` has no `S0` entry point (`§3`: *"scheduled, not written"*), then engine's missing `Target`/`EvaluationContext` constructor, then the ledger write path. `R3` and the `§6.6` composition landed at spec 1.4.25 and are exercised by `tests/h1-integration.test.ts` over a hand-built `SolveInput` |
| `bench` | **deferred** | `packages/eval`'s agent runner, scorer and aggregator (`ARCHITECTURE.md §10`). The package is a dependency from spec 1.4.27 — `assay oracle` uses its `§5.3` consistency gate — but nothing in `ARCHITECTURE.md §10`'s runner exists yet |
| `close` | **deferred** | `packages/ledger`'s `close-gate.ts` / `close.ts`, *"deliberately absent rather than stubbed"* |
| `verify` | **implemented** for `G4` and `G2` | `G3` needs the close gate; the `assay.sqlite` route needs `better-sqlite3`, which is not a workspace dependency |
| `seal` | **implemented** | — |

## The committed layout — `DATA_MODEL.md §22.2` M42, spec 1.4.27

```
  bench/<split>/<seed>/observations.jsonl        dataset artifacts, (split, seed)
  bench/<split>/<seed>/untrusted_text.jsonl
  bench/<split>/<seed>/ground_truth.jsonl
  bench/<split>/<seed>/oracle_labels.jsonl       written by `assay oracle`
  bench/<split>/<seed>/oracle_gate.json          §5.3 gate results (M43)
  bench/<split>/<seed>/benchmark_manifest.json   one per (split, seed)

  bench/<split>/recon_report.jsonl               §6.2 probe surface, SPLIT-scoped
```

**Family is a composition dimension and never a file dimension.** A seed's
families are concatenated into one dataset — F01..F10 ascending, each family's own
row order preserved, `source_line` re-based 1-based within the aggregated logical
file — and that concatenation is `packages/generator`'s `buildDataset`, not this
package's: `ARCHITECTURE.md §3` bars `apps/cli` from performing an `S0` transform
and `RECONCILIATION_SPEC.md §2` step 5 makes provenance stamping `S0`'s. This
package serializes rows and **re-orders nothing**.

**`recon_report.jsonl` does not move.** M36 scoped it to the split and M42 leaves
it there: it is a probe response surface, *"never an `Observation`, and never
ingested"*, keyed by a `settlement_id` unique across every family and seed. It is
written once per invocation, from every seed that invocation generated, ordered
`entity_id` ascending (M38) over the merged artifact. Its digest is therefore
identical across every manifest of one split, by construction rather than by a
check — `tests/layout-and-gates.test.ts` asserts it.

`generate`'s happy path is deliberately **not exercised by the suite**:
`PREREGISTRATION.md §6.1` holds the test split until the seal and `§9` sequences
generation after the seal tag, so the tests assert its refusals, its serialized
bytes and its write set, and stop short of `generateFamily`. That the seed loop
writes three dataset artifacts and the split-scoped report once, outside it, is
asserted from its source in `tests/boundary.test.ts`; the aggregation itself is
tested in `packages/generator/tests/dataset.test.ts`, at seeds `§6.1` assigns to
no split.

`--split test` remains refused **until the operator attests to the seal tag**
(spec 1.4.29, register row **M45**). `PREREGISTRATION.md §6.1` holds the split
*"before the seal"*, and M45 settles what that bounds: the seal is `§9` step 1's
signed tag, and step 6's commit SHA is the seal *point*. This command still
cannot establish whether the tag exists — it runs no subprocess and reads no git
state, and *"a command that guessed would guess in the direction that costs a
seed"* — so what lifts the bar is `--seal-tag bench-v<BENCHMARK_VERSION>` and
nothing else. Absent, the refusal is exactly what it was at spec 1.4.28 and `AL7`
still burns a seed on the breach. `src/seal-tag.ts` holds M45's five clauses; the
tag name is **derived** from `BENCHMARK_VERSION`, which is what removes the class
of defect M46 corrects.

A blocked command reports the **owner** and the **citation** and exits `3`. It
does not implement the missing side: `ARCHITECTURE.md §3` and `§L.2` have already
assigned every one of those pieces, and a composition root that builds what it
cannot find has stopped being one.

## Exit codes

```
  0  OK
  1  FAILURE       a check failed (e.g. G4 or G2 in `verify`)
  2  USAGE         a malformed or refused command line
  3  UNAVAILABLE   a stage this command needs is not built yet
  4  GUARD         AL2 / AL8 / AL5 refused a read
  5  REPLAY_MISS   §L.1 rule 11 — a cache miss under --strict-replay
```

## The replay cache

`ARCHITECTURE.md §6.5` serves committed responses from `fixtures/llm-cache/`,
keyed by `sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`.
`packages/llm` refuses to perform that read itself — *"it is handed an
already-loaded map"* — so `src/artifacts/replay-cache.ts` is the acquisition
half, and nothing more: it computes no cache key and interprets no response.

`§L.1` rule 11 — *"a cache miss is a hard error, never a silent live call"* — is
`packages/llm`'s `ReplayCacheMissError`, and **it is not caught anywhere in this
package**. `--strict-replay` defaults to on.

**One convention is this package's own.** `§6.5` names the directory and the key
and states no file layout. One file per key, named for the key, is used here: it
is the most literal reading of *"keyed by sha256(…)"*, and it makes each cache
entry a separately reviewable committed file. Recorded as a convention so a later
amendment supersedes it rather than contradicting a rule nobody wrote.

## Known unresolved seams, carried and not closed

**Three of `§6.2`'s five probes have no committed source.** Spec 1.4.22 (M36)
ratified one for `fetch_settlement_recon` — `bench/<split>/recon_report.jsonl` —
and **no document names one for `fetch_order`, `fetch_payment` or
`fetch_refund`**: `DATA_MODEL.md §22.1`'s `D10`/`D11` describe endpoints rather
than an artifact, and `§12` says the probe reads the PG's own report *"rather than
the observation set"*. `src/probe/surface.ts` therefore **refuses** those three by
naming the gap, and the available-probe context offers only what it can serve.
That is a property of today's committed surface, **not** of
`PREREGISTRATION.md §7`'s frozen policy, which ranks all four and is unchanged —
its second, third and fourth entries are inert here for the same reason `§4.1`'s
`C8` is inert: declared, reported, and not deleted.

**`M31`'s date-scoping field stays open.** `§6.2`'s signature takes a `date`; the
dispatch carries it into the `PROBE` event's `inputs_hash` and **never reads it**,
because `settlement_id` is the artifact's only query key.

**`§T7`'s numeric `days` bound stays unspecified.** Spec 1.4.25 (M40) settled that
`R3` may not propose `widen_temporal_window` — `§L.1` rule 2 being unchanged and
unweakened — which makes the bound unreachable through `R3` rather than supplying
it. The executor's enum is still closed at five.

## Layout

```
  src/main.ts            the binary; the only file that reads `process`
  src/cli.ts             dispatch, as a pure function of argv/env/streams
  src/args.ts            the hand-rolled, strict parser
  src/config.ts          .env.example's surface plus --llm / --strict-replay / --sealed
  src/errors.ts          CliError and the five exit codes
  src/usage.ts           help text
  src/providers.ts       LlmProvider selection; metered providers refused
  src/fs/guard.ts        the AL2 / AL8 / AL5 runtime path guard
  src/fs/io.ts           the one filesystem module; every read is guarded
  src/fs/json-dir.ts     a *.json directory listing (names files, opens none)
  src/fs/digest.ts       sha256 over artifact bytes, branded by domain
  src/seal-tag.ts        §9 step 1's tag name, derived; M45's attestation check
  src/artifacts/         jsonl framing; observation, ledger-event, cache loaders
                         and metrics-path.ts — M48's scored-artifact layout
  src/agents/            §3's seven, constructed here and injected into eval
                         (M47); may not import ../fs/ — path-scoped lint (G8)
  src/commands/          T0-11's eight, in the order the table names them
```

## Where a scored run's artifacts land

Ratified at spec 1.4.29, register row **M48**. The scored unit is
`(agent_id, split, seed, llm_mode)` — `@assay/eval`'s `RunKey`, the union of what
`ARCHITECTURE.md §10` and `§C` T0-9 each named in part — and the bootstrap
resamples `seed` alone.

```
  runs/<run_id>/<split>/<seed>/<agent>/<llm_mode>/metrics.json
  runs/report.html                    EVALUATION_SPEC.md §7's own --out path
```

**These are committed.** `PROJECT_SPEC.md §7` `S10`, `EVALUATION_SPEC.md §5.5`
and `§C` T0-13 each require every claimed number to be traceable to a *committed*
run artifact, and through spec 1.4.28 `.gitignore` excluded `runs/` wholesale.
The SQLite database stays ignored. `artifacts/metrics-path.ts` records the
`metrics.json` layout as a **convention**, on the precedent
`artifacts/replay-cache.ts` set for `fixtures/llm-cache/`.
