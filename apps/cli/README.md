# `@assay/cli`

Written against **specification 1.4.23 / benchmark 1.0.4**.

`assay generate · oracle · run · bench · close · verify · seal`
(`DECISION_BRIEF.md §C` T0-11).

> *"**all filesystem I/O** — it acquires raw source contents and passes them into
> `packages/domain`'s `S0` boundary, and **performs no `S0` transform itself**
> (spec 1.4.18). The CLI is the real interface; the UI is a view over it.
> Everything demonstrable must be scriptable."* — `ARCHITECTURE.md §3`

This package is a **composition root**. It holds no reconciliation logic at all.

## What this package guarantees

- **One door.** `node:` builtins are imported only under `src/fs/`, `readFileSync`
  is called in exactly one file, and every read passes the `AL2`/`AL8` guard
  **before** the file is opened. Asserted in `tests/boundary.test.ts` by reading
  this package's own source.
- **No `S0` transform.** `RECONCILIATION_SPEC.md §2`'s five steps — schema
  parsing, ingest invariants, text quarantine, normalization, provenance — are
  `packages/domain`'s. There is no schema, no `paise(`, no `ingest_hash`, no
  reference to a quarantined field anywhere in `src/`.
- **No `S1`–`S5`, no probe loop, no `R3`.** No frozen threshold is re-spelled
  here (`§L.1` rule 12), no constraint is evaluated, no probe call is
  constructed (`packages/probe` is *"the ONLY constructor of one"*), and no
  proposal policy is authored.
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
exactly one legitimate reader and a path-only refusal would refuse those too:

| Zone | `ground_truth*.jsonl` | `recon_report*.jsonl` |
|---|---|---|
| `AGENT` | refused (`AL2`) | refused (`AL8`) |
| `PROBE_DISPATCH` | refused | **admitted** — `AL8`'s only route, under `P_max` |
| `GENERATOR_TRUST` | **admitted** — `ARCHITECTURE.md §10`'s pre-agent, offline zone | refused |
| any, under `--sealed` | refused (`AL5`) | admitted for the probe |

`AL5` — *"the CLI's `--sealed` flag refuses to print, log or write any
ground-truth field"* — is enforced at the read, because a field that was never
read cannot be printed.

## Per command

| Command | Status | If not complete, what blocks it |
|---|---|---|
| `generate` | **implemented**, minus the probe surface | `packages/generator` emits no `recon_report.jsonl`, which `ARCHITECTURE.md §3` assigns to it |
| `oracle` | **implemented** | — (`packages/oracle` gained `oracleContext` at spec 1.4.23; before it, the command was blocked for want of a `CandidateContext` builder) |
| `run` | provider selection implemented; pipeline **blocked** | `packages/domain` has no `S0` entry point (`§3`: *"scheduled, not written"*), then engine's missing `Target`/`EvaluationContext` constructor, then `R3` (`§H` H1), then the ledger write path |
| `bench` | **deferred** | `packages/eval` (`ARCHITECTURE.md §10`) |
| `close` | **deferred** | `packages/ledger`'s `close-gate.ts` / `close.ts`, *"deliberately absent rather than stubbed"* |
| `verify` | **implemented** for `G4` and `G2` | `G3` needs the close gate; the `assay.sqlite` route needs `better-sqlite3`, which is not a workspace dependency |
| `seal` | **implemented** | — |

`generate`'s happy path is deliberately **not exercised by the suite**:
`PREREGISTRATION.md §6.1` holds the test split until the seal and `§9` sequences
generation after the seal tag, so the tests assert its refusals and stop short of
`generateFamily`.

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

## Known unresolved seam, carried and not closed

`RECONCILIATION_SPEC.md §6.2`'s `widen_temporal_window(days)` takes a numeric
argument while `DECISION_BRIEF.md §L.1` rule 2 forbids a numeric field in any LLM
output schema. `R3` is `§H` tier H1 and unbuilt, and `§6.2` also leaves *whether
`R3` may propose the probe* open (spec 1.4.19, M33). `packages/probe` records the
tension; this package neither resolves it nor reaches it, since it authors no
proposal source.

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
  src/artifacts/         jsonl framing; observation, ledger-event, cache loaders
  src/commands/          T0-11's seven, in the order the table names them
```
