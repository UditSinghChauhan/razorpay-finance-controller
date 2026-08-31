# `@assay/llm`

Written against **specification 1.4.25 / benchmark 1.0.5**.

The LLM adjudicator — `ARCHITECTURE.md §6`'s four bounded roles behind `§6.5`'s
one `LlmProvider` interface, and `§4` boundary 2's three verification layers.

> *"The model may propose. Only deterministic code may commit. Anything the model
> touches is a hypothesis until a deterministic validator admits it, and no
> numeral emitted by a model is ever persisted to the ledger."* — `§1`

## What this package guarantees

- **No number-typed field can reach a provider.** `§L.1` rule 2, enforced twice:
  an ESLint block over `packages/llm/**` for schemas written here, and a runtime
  walk of the zod tree on **every** call for schemas passed in from anywhere.
  `§6.5` types `invoke`'s `schema` as an arbitrary `ZodType`, so a lint over this
  package alone could never be the whole control.
- **No network, in any provider built here.** No transport import (static or
  dynamic), no global `fetch`, no `process.env`. `§6.5` gives `offline`
  *"Network: none"*; `§L.1` rule 10 makes the full pipeline pass under it; `§C`
  T0-11 requires a clean checkout with **no API key** to run.
- **No filesystem I/O.** The replay cache is handed in already loaded.
  `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem I/O"*, and spec 1.4.18
  settled the same split for `S0`.
- **No clock, no randomness.** `§6.5` calls both built providers *"fully
  deterministic"*, and metric 23 requires two runs over identical inputs to
  produce identical root hashes.
- **No engine, no ledger write path, no `ValidatedDecision`.** `§6`'s *"roles the
  model is explicitly forbidden"* is a property here, not a promise: the type is
  not imported and `@assay/money` is not a dependency.

Every item above is asserted in `tests/discipline.test.ts` by reading this
package's own source as text — the second, independent check behind the lint.

## Phase 8 scope, and what is deliberately absent

`§L.2`'s build order names this position **`llm (provider + offline + replay)`**;
`§C`'s T0-7 scopes it to *"`LlmProvider` interface + `offline` + `replay`
providers; roles R1, R2; schema/allowlist/grounding verification"*.

| Surface | State | Why |
|---|---|---|
| `LlmProvider` interface | built | `§6.5`, transcribed |
| `offline` provider | built | `§C` T0-7; the demo guarantee and `A3-NOLLM` |
| `replay` provider | built | `§C` T0-7; `§L.1` rule 11 |
| `anthropic`, `openai-compatible` | **declared, not built** | `§H` tier H2, blocked on `§F` **F2** — no metered credential. Declared as data in `PROVIDER_DESCRIPTORS` so the four-provider architecture stays checkable while two are unimplemented. |
| `R1 parse_bank_narration` | built | `§C` T0-7 |
| `R2 classify_exception` | built | `§C` T0-7 |
| `R3 propose_probe` | built | `§H` tier **H1**, spec 1.4.25 — `roles/r3.ts` |
| `R4 explain_decision` | **declared, not built** | `§H` tier H2 |
| schema / allowlist / grounding | built | `§4` boundary 2, all three |

**`R3`'s offline half is a pre-registered parameter, not a list written here.**
`§6.5` describes the `offline` provider's `R3` as a *"static probe priority
list"*, which is exactly the baseline `§6` measures the model's probe selection
**against** (*"abstentions resolved per probe spent"*). Phase 8 refused to stub it
because writing one here would *"silently create the control before the experiment
that needs it"*. **That objection is answered rather than overruled:**
`PREREGISTRATION.md §7` now states the policy, `AL3` binds it and
`DECISION_BRIEF.md §L.1` rule 12 lists it, so `§L.4` forbids revising it from an
observed result — on TRAIN, DEV and TEST alike. `roles/r3.ts` **executes** a frozen
parameter; it does not choose one, and nothing in it may be tuned.

```
  priority   fetch_settlement_recon -> fetch_payment -> fetch_order -> fetch_refund
  argument   the LEXICOGRAPHICALLY SMALLEST eligible one
  stop       first constructible entry; else NO_USEFUL_PROBE
```

**`R3` may not propose `widen_temporal_window`** (spec 1.4.25, `DATA_MODEL.md
§22.2` M40). Its only argument is `days`, and `§L.1` rule 2 — *"No LLM output
schema may contain a numeric field"* — is **unchanged and unweakened**. The
executor's enum stays closed at **five**; only what this proposer may name is
four. A discipline test fails the build if any code in this package names that
probe, or a `days` field.

**`R4` is still declared and not built** (`§H` tier H2), and `offlineProvider()`
returns `ROLE_NOT_IMPLEMENTED` for it rather than a plausible default.

**No probe execution and no probe loop live here.**
`RECONCILIATION_SPEC.md §6.2` has `R3` propose a probe and *"deterministic code
execute it and re-run the solve"* — two different actors. This package is the
**proposer**; `packages/probe` is the executor (M37) and `apps/cli` performs the
dispatch. A discipline test fails the build if any source file here names
`PROBE_KINDS`, `ProbeResultDetail`, `ValidatedProbeCall`, `probeEventBody`,
`P_MAX` or `@assay/probe`, so this package cannot quietly become the executor.

## Trust boundary 2 (`ARCHITECTURE.md §4`)

Three checks, in this order, applied by `adjudicate()` — **not** by the provider:

1. **Schema** — strict parse, no number-typed field. `verify/schema.ts`.
2. **Allowlist** — every entity-id-shaped string in the response must be on the
   call's allowlist. A miss is a hallucination event: counted, logged, response
   discarded. `verify/allowlist.ts`.
3. **Grounding** — `R1`'s tokens must be literal substrings of the narration;
   `R4`'s numerals must appear in the evidence set. `verify/grounding.ts`.

**The order matters and the location matters.** Allowlist and grounding read a
*parsed* value, so a response failing the schema is discarded before either runs.
And the schema check is re-applied at the boundary rather than trusted to the
provider: `§4` requires the response to be *"treated as adversarial"*, which a
boundary cannot do while taking the adversary's word that it validated itself.
A provider is an interface implementation, and two of the four are written
against third-party SDKs.

**This is not `I6`.** `§L.1` rule 8: *"Every LLM-referenced entity ID must exist
in the observation set (invariant `I6`), **independently of any allowlist
check**."* Two checks over one fact, on purpose — this one discards the response,
`I6` in `S5` rejects the allocation. Neither substitutes for the other.

## `ARCHITECTURE.md §12` — failure handling

| Failure | Behaviour |
|---|---|
| provider unreachable / rate-limited | retry with backoff, then fall back to `offline` **for that role**. The run completes. |
| invalid schema | discard, one retry, then `offline` fallback. Counted. |
| allowlist / grounding violation | discard, counted, `offline` fallback |
| `replay` cache miss under `--strict-replay` | **hard error**, re-thrown, never converted to a fallback (`§L.1` rule 11) |

Backoff is **injected** rather than performed, defaulting to a no-op: a real
sleep inside the adjudicator would put wall-clock time in the path of
`--llm=offline`'s acceptance tests without changing a single outcome.

Every attempt emits a `DATA_MODEL.md §19` `LlmCall` record — *"`provider` is
recorded on **every** call, including offline ones"* — with prompt **hashes**
and never prompt text (`THREAT_MODEL.md §T11`), and a deterministic
`llm_call_id` derived from the call's own content hash so two runs over identical
inputs agree (metric 23).

## Discrepancies found while implementing R1 and R2

**`DATA_MODEL.md §14`'s `owner_role` has no producer anywhere in the corpus.**
`§14` requires it on every `Exception` and calls one without it *"a shrug"*, but
`ARCHITECTURE.md §6` states `R2`'s output exhaustively as *"one enum from a fixed
taxonomy + evidence IDs + the analyst-facing question"* — three things, and this
is not among them. No other stage claims it. It is **not emitted here**, and the
gap is reported rather than filled by inventing a fourth output field.

**`§14`'s `suggested_probe` likewise has no producer at this phase.** It is
`R3`'s natural output and `R3` is not built; the field is left unset rather than
given a value by a role the specification does not assign it to.

**`ARCHITECTURE.md §6.5`'s `LlmProvider` block returns
`{ value: T | null; meta: LlmCallMeta }` but never defines `LlmCallMeta`.** It is
defined here, carrying exactly the fields `DATA_MODEL.md §19`'s `LlmCall` cannot
be assembled without and nothing else. Numbers are permitted on it — `§L.1`
rule 2 constrains *"LLM output schema[s]"*, and this is a record the
deterministic side writes **about** the call.

**`§19`'s `cache_key` is transcribed literally, including the concatenation.**
`sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`. Concatenating
variable-length strings is not injective in general; it is here, because
`provider` is drawn from `§19`'s closed four-member union and both hashes are
fixed-width hex. The literal form is kept because `§6.5` makes this key the
address of a **committed** cache, and a cache keyed one way and read another
misses every time.

**`R2`'s offline ladder is `[ASSAY-MODEL]`, and every rung cites its source.**
The corpus fixes no exception-classification function. The ladder in
`roles/r2.ts` derives each rung from `§15`'s class definitions, `§7`'s
invariants, and three specific frozen sentences (`§4.2` on `E01` via `I4`,
`§3` spec 1.4.1 on `E13`, `§10` V19 on `E03`). `E07`, `E08`, `E09`, `E12` and
`E14` are **unreachable from this role** — `§T6` gives `E07` its own arithmetic
re-check, `§8` rule 1 puts `E08` at ingest, the engine's `S1` owns `E09` and
`E14`, and `PREREGISTRATION.md §8` metric 10 excludes `E12` from the confusion
matrix because *"a deterministic assignment is not a classification
judgement"* — so emitting it here would undo that exclusion at the source.
