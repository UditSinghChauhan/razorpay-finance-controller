# `@assay/probe`

Written against **specification 1.4.23 / benchmark 1.0.4**.

The `RECONCILIATION_SPEC.md §6.2` probe **loop**, as a **pure state machine**.
Ratified at spec 1.4.23 — `DATA_MODEL.md §22.2` **M37**, `DECISION_BRIEF.md
§A.30`.

> *"The LLM (`R3`) proposes one probe from a closed enum; **deterministic code
> executes it and re-runs the solve**."* — `§6.2`

This package is the deterministic half's **decision-making**, and nothing else.

## What this package guarantees

- **No I/O of any kind.** No filesystem, no network, no node builtin, no clock,
  no randomness, no `process.env`. The caller dispatches; this package decides.
- **It does not call `R3`.** It consumes an `R3` proposal as a **value**. That
  purity is what makes `§L.2`'s position — between `engine S4–S5` and `llm` —
  available at all; a loop that called `R3` would have to build after it.
- **It is the only constructor of a probe call.** `ValidatedProbeCall` carries a
  non-exported unique-symbol brand and no exported constructor, the mechanism
  `ARCHITECTURE.md §4` boundary 3 runs for `ValidatedDecision`.
- **No URL, host, endpoint or socket exists anywhere in it.**

All asserted in `tests/discipline.test.ts` by reading the package's own source.

## What it owns, and what it does not

| Owns | Does **not** own |
|---|---|
| `P_max` accounting | `R3`'s selection policy — open, `§6.2` |
| pre-call `I6` over every argument | the model call — `packages/llm` |
| construction of the closed five-probe call | the data-surface read — `apps/cli` |
| the `PROBE` `LedgerEvent` body | result schema validation — `packages/domain` |
| the loop's transitions | the re-solve — `packages/engine` `S4` |
| | the ledger append — `packages/ledger` |

## The seam it preserves

`STOP` carries **`packages/engine`'s own** `certificate_reason`, never one this
package chose. `§6` defines three — `EVIDENCE_TIE` at zero attempts,
`PROBE_BUDGET_EXHAUSTED` at `P_max`, and the **undecided**
`A2_MIDDLE_CASE_UNSPECIFIED` seam in between. **No new terminal reason is
invented** for a loop that stopped on `NO_USEFUL_PROBE` with budget remaining;
that gap is `§6`'s and stays open.

## Public API

```ts
// call.ts — the closed enum and its sole constructor
validate(proposal, universe, attemptsSpent, pMax) → ProposalCheck
argumentEntityId(proposal) · isNoUsefulProbe(proposal) · kindOf(call)

// loop.ts — state and transitions
initialState(comp_id) → ProbeLoopState
decide(state, solveResult, pMax?) → LoopDecision      // ACCEPT | PROBE | STOP
offerProposal(state, proposal, universe, solve, pMax?) → ProposalOutcome
acceptResult(state, call, detail, probeId) → ProbeLoopState
budgetExhausted(state, pMax?) → boolean

// event.ts — the deterministic part of the PROBE event
probeEventBody(input) → ProbeEventBody
```

The caller supplies `evt_id`, `run_id`, `ts`, `actor` and `seq` — all run-scoped
or wall-clock, and `DATA_MODEL.md §16` excludes the first three from the hashed
body anyway.

## The controls, and why they cannot be split

`THREAT_MODEL.md §T7` requires a closed enum, allowlisted arguments, `P_max` and
logging. All four are here:

- **Closed enum + no arbitrary target** — structural. The call is a closed union
  over `§6.2`'s five probes; there is no URL or host type in the path, so on spec
  1.4.22's filesystem-backed surface SSRF has no reachable target rather than a
  check that could be skipped.
- **Pre-call `I6`** — `DECISION_BRIEF.md §L.1` rule 8 requires it *"independently
  of any allowlist check"*, so it is separate from `packages/llm`'s boundary-2
  allowlist and from `S5`'s post-hoc `I6`.
- **`P_max`** — counted here, read from `packages/engine`'s frozen constant and
  never re-spelled. Checked **before** every other check, so a rejection at the
  budget is reported as the budget.
- **Provenance** — the `PROBE` event body is assembled here and is deterministic.

**A caller that skipped this package could not build a probe call**, and one that
fed back a result for a different call is refused: `acceptResult` binds the result
to the call that was issued and throws `ProbeResultMismatchError` otherwise.
Without that, a probe would count against `P_max` and accumulate evidence for a
call nobody validated — the bypass the brand exists to prevent, one step later.

## Discrepancies found while implementing

**`§6.2`'s `widen_temporal_window(days)` and `§L.1` rule 2 are in tension.** The
probe's argument is a number, so an `R3` output schema expressing it would carry a
numeric field — which rule 2 forbids in *"any LLM output schema"*. This package
does not resolve it: it accepts `days` on a **proposal** (which is not a schema)
and range-checks it as `DATA_MODEL.md §12`'s `integer > 0`. `R3` is `§H` tier H1
and unbuilt, so the tension is recorded rather than settled, and `§6.2` also
leaves *whether `R3` may propose this probe at all* open (spec 1.4.19, M33).

**`ProbeProposal` arguments are plain strings; `ProbeResultDetail`'s are branded.**
Deliberate, and the asymmetry is the point: a proposal arrives from `R3` and is
untrusted until `validate` runs, while a result comes back through
`ProbeResultDetailSchema` and parses to the branded id.

**`date` is carried opaquely and never parsed.** `§6.2` names it as an argument;
`DATA_MODEL.md §22.2` M31 records that the field the endpoint is date-scoped on is
*"not decided"*. It enters the `PROBE` event's `inputs_hash` — which is why `§12`
could leave it off `ProbeResultDetail`, *"recording the call belongs to the
`PROBE` `LedgerEvent`"* — and is otherwise passed through untouched.
