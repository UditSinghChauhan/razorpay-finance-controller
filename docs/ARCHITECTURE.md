# ARCHITECTURE — ASSAY

**Spec version:** 1.1.0 · **Date:** 2026-08-23

Every section answers *why*, not just *what*. Where a component exists only
because a deterministic rule cannot do the job, that argument is made explicitly.

---

## 1. Architectural thesis

Three properties must hold simultaneously, and they conflict:

- **A language model must be genuinely load-bearing**, or the project is a rule
  engine with a chatbot bolted on.
- **A language model must never be trusted with money**, or the system is not a
  finance control.
- **The system must be able to say "I don't know"** in a way that is checkable,
  or its confidence is theatre.

The resolution is a strict separation of *proposal* from *commitment*:

> **The model may propose. Only deterministic code may commit. Anything the model
> touches is a hypothesis until a deterministic validator admits it, and no
> numeral emitted by a model is ever persisted to the ledger.**

This is a domain-specific instance of the quarantined-LLM / capability-restricted
control-flow pattern (see `RELATED_WORK.md §5`): untrusted data may influence
*which* action is considered, never *whether* it is permitted or *what value* it
carries.

## 2. Component map

```
                         ┌──────────────── TRUST BOUNDARY 1 ────────────────┐
                         │              UNTRUSTED INPUT ZONE                │
  sources/               │                                                  │
   pg_recon.jsonl  ──────┼──▶  ingest ──▶ zod schema validation             │
   bank_stmt.jsonl ──────┼──▶            structural fields ──┐              │
   merchant_ledger.jsonl ┼──▶            free text  ──▶ quarantine store    │
                         └───────────────────────────────────┼──────────────┘
                                                             │
   ┌─────────────────────────────────────────────────────────▼──────────────┐
   │                    DETERMINISTIC CORE  (packages/engine)               │
   │                                                                        │
   │   S1 anchor      exact joins on strong keys                            │
   │   S2 candidates  hard admissibility constraints -> allocation graph    │
   │   S3 decompose   connected components (bounded size K_max)             │
   │   S4 solve       exact solve + no-good cut -> second-best certificate  │
   │   S5 validate    invariants I1..I9   ◀── THE ONLY GATE THAT MAY POST   │
   └───────────┬──────────────────────────────────────┬─────────────────────┘
               │ residual / degraded cases            │ validated decisions
               │                                      │
   ┌───────────▼──────────── TRUST BOUNDARY 2 ────────┼─────────────────────┐
   │           LLM ADJUDICATOR (packages/llm)         │                     │
   │   R1 parse_bank_narration   (substring-verified) │                     │
   │   R2 classify_exception     (closed enum)        │                     │
   │   R3 propose_probe          (allowlisted call)   │                     │
   │   R4 explain_decision       (post-hoc, numeral-grounded)               │
   │                                                  │                     │
   │   -- all four reached ONLY through LlmProvider --                      │
   │      offline | replay | anthropic | openai-compatible                  │
   │      outputs: strict-schema JSON, id-allowlisted, NEVER numeric -------┘
   └────────────────────────────────────────────────────────────────────────┘
                                                      │
   ┌──────────────────────────────────────────────────▼─────────────────────┐
   │  SHADOW LEDGER (packages/ledger) -- two layers, see §8                 │
   │                                                                        │
   │   Layer A · AUDIT EVENT LAYER                                          │
   │     append-only, hash-chained, one event per decision or state change  │
   │     answers: what happened, who did it, on what evidence, when         │
   │                              │ projection (pure, replayable)           │
   │                              ▼                                         │
   │   Layer B · DOUBLE-ENTRY LEDGER                                        │
   │     balanced journal lines -> 7 control accounts incl. Suspense        │
   │     answers: what are the books, and do they balance                   │
   │                              │                                         │
   │                              ▼  CLOSE GATE G1..G5                      │
   │                    CLOSED | OPEN (quantified) | BLOCKED (defect)       │
   └──────────────────────────────────────┬─────────────────────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────┐
                  ▼                                            ▼
        apps/api (Hono) ──▶ apps/web (React)          packages/eval
        run · close · exceptions · drill-down          metrics · CIs · report
```

**Offline, not in the runtime path:**

```
   packages/generator ──▶ synthetic universe + hidden ground truth
   packages/oracle    ──▶ Ambiguity Oracle (observations-only, exhaustive)
   packages/domain    ──▶ constraints.decl.ts  -- the single declarative source
                          that engine and oracle implement independently
```

## 3. Package layout and why each exists

| Package | Responsibility | Why it is separate |
|---|---|---|
| `packages/money` | `Paise` branded integer type; add/sub/split/allocate; no float ever | Money bugs are the highest-severity class here. Isolating them makes them property-testable and makes float arithmetic a *type error*, not a review comment. |
| `packages/domain` | Zod schemas; ID grammars; canonical JSON; **`constraints.decl.ts`** — the declarative constraint table | One definition of truth for shapes and constraints, shared by generator, engine, oracle and eval. The declarative table is what lets engine and oracle be two independent implementations of one specification (§7). |
| `packages/generator` | Forward business simulation to observations + hidden ground truth; degradation operators | Must be independently runnable and seed-deterministic. Kept out of the engine so no engine code can ever import ground truth — an import lint enforces this. |
| `packages/oracle` | Exhaustive enumeration of evidence-admissible allocations from **observations only** | Deliberately a second, slow, naive implementation. Its whole value is being *not* the engine and *not* the generator. See §7. |
| `packages/engine` | Stages S1–S5. Pure functions, no I/O, no network | Purity makes the core replayable and property-testable, and makes the LLM absence from the arithmetic path structurally verifiable. |
| `packages/llm` | **`LlmProvider` interface + four providers**; four bounded roles; response cache; output verification | Single choke point. Every model call goes through one interface, so swapping providers — or removing the model entirely — is configuration, not a rewrite. See §6.5. |
| `packages/ledger` | **Layer A** append-only hash-chained audit events; **Layer B** double-entry projection; close gate | Append-only semantics, the trial-balance invariant and the Suspense identity are properties of this package, not conventions its callers must remember. |
| `packages/eval` | Metrics, bootstrap CIs, baselines, ablations, report generation | Must run against any agent behind one interface, so ablations are configuration, not forked code. |
| `apps/api` | Thin HTTP over engine + ledger | — |
| `apps/web` | Four screens (`PROJECT_SPEC.md §10`) | — |
| `apps/cli` | `assay generate / oracle / run / bench / close / verify / seal` | The CLI is the real interface; the UI is a view over it. Everything demonstrable must be scriptable. |

## 4. Trust boundaries

### Boundary 1 — Untrusted input → deterministic core

Everything arriving from a file or an API is untrusted, including data that
claims to come from Razorpay. Crossing this boundary requires:

1. **Structural validation.** Zod schema, strict mode, `additionalProperties`
   rejected. Amounts must be non-negative safe integers. IDs must match their
   grammar (e.g. `^pay_[A-Za-z0-9]{14}$`). Timestamps must be plausible Unix
   seconds within the dataset window.
2. **Text quarantine.** `description`, `notes`, `order_receipt` and bank
   `narration` are removed from the structural record and stored in a separate
   `UntrustedText` table keyed by observation id. **The deterministic core never
   reads them.** They are reachable only by the LLM adjudicator, and only through
   an envelope that marks them as data.
3. **Provenance stamping.** Every record carries `source_system`, `source_file`,
   `source_line`, `ingest_hash`. Nothing enters the system anonymously.

*Prevents:* prompt injection reaching the decision path; malformed amounts
crashing arithmetic; hallucinated or forged IDs entering the candidate space;
untraceable numbers in the close report.

### Boundary 2 — Deterministic core → LLM → deterministic core

The model is called with structured, minimal context and its output is treated as
adversarial. Every response passes three checks before use:

1. **Schema check.** The `LlmProvider` contract requires a strict zod schema
   containing **no number-typed field**; a CI lint fails the build if one
   appears. The `anthropic` provider enforces it with `messages.parse()` +
   `zodOutputFormat`; the `openai-compatible` provider with JSON-schema response
   format; `offline` and `replay` satisfy it by construction. Parse failure →
   the role's `offline` fallback, logged as `LLM_SCHEMA_REJECT`.
2. **Allowlist check.** Any entity ID in the response must be a member of the
   allowlist passed in that call. A reference to an ID that does not exist in the
   observation set is a **hallucination event** — counted, logged, response
   discarded. This is the structural defence against invented transaction IDs.
3. **Grounding check.** For `parse_bank_narration`, every extracted token must be
   a literal substring of the input narration. For `explain_decision`, every
   numeral in the prose must appear in the attached evidence set; otherwise the
   explanation is discarded and replaced with a template.

**No LLM output is numeric.** The schemas contain no number-typed fields that
reach the ledger. Where a quantity is needed, the model returns an *identifier*
and deterministic code looks up the value.

*Prevents:* injected instructions changing a financial outcome; fabricated IDs;
arithmetic errors; plausible-sounding explanations that cite numbers nobody
computed.

### Boundary 3 — Validator → ledger

`packages/ledger` exposes exactly one mutating function, and it accepts only a
`ValidatedDecision` — a type that can only be constructed by S5. There is no
other write path. The projection recomputes control-account balances from the
event log rather than mutating them in place, so a corrupted balance cannot
persist without a corrupted event, and a corrupted event breaks the hash chain.

*Prevents:* partial writes, out-of-band edits, and the "we fixed it in the
database" class of audit failure.

## 5. Data flow, one observation's journey

```
bank credit line  ₹4,52,310  value_date 2026-08-14  narration "NEFT-RZPX0001…"
  │
  ├─ ingest        structural {amount_paise: 45231000, value_date, source_line}
  │                quarantined {narration: "NEFT-RZPX0001…"}
  │
  ├─ S1 anchor     regex UTR extraction fails (narration truncated at 35 chars)
  │                → no anchor
  │
  ├─ R1 LLM        parse_bank_narration → {utr_candidates: ["RZPX0001"]}
  │                substring check ✓ · not numeric ✓
  │                → deterministic prefix match against known settlement UTRs
  │                → 3 settlements share the prefix
  │
  ├─ S2 candidates hard constraints: currency ✓ · value_date ≥ settled_at ✓
  │                · amount feasibility · one-allocation
  │                → 3 candidate settlements survive
  │
  ├─ S3 decompose  component {1 bank line, 3 settlements}, size 4 ≤ K_max
  │
  ├─ S4 solve      exact: {setl_A} sums to 45231000  ✓
  │                no-good cut → second-best: {setl_B, setl_C} also sums ✓
  │                materiality = ₹4,52,310 > τ · evidence gap Δs = 0
  │                → ABSTAIN, certificate {A} vs {B,C}
  │
  ├─ R2 LLM        classify_exception → UTR_PREFIX_COLLISION
  │                R3 propose_probe   → fetch_settlement_detail(setl_A)
  │                → probe executed deterministically, still no discriminator
  │
  ├─ S5 validate   abstention path: I1,I2,I6 checked; posting to Suspense
  │
  └─ ledger        DR Suspense 45231000 / CR Bank 45231000
                   event {kind: ABSTAIN, certificate, prev_hash, hash}
```

## 6. The AI boundary — justifying every model call

For each role: *why can't a deterministic rule do this?* and *what happens if the
model is wrong or hostile?*

### R1 · `parse_bank_narration`

- **Input:** one quarantined narration string. **Output:** `{utr_candidates:
  string[], counterparty_hint: string|null, reference_hints: string[]}`.
- **Why not a rule:** bank statement narration is open-vocabulary and
  bank-specific. `NEFT-RZPX00012345-RAZORPAY SOFTWARE PVT-CR`,
  `MMT/IMPS/RZP/452310/…`, `BY TRANSFER-NEFT*RZPX0001*RAZORPAYSOFT` and dozens of
  other shapes all encode the same fact. A regex battery handles the formats in
  your sample and fails silently on the next bank. **We do not assume the model
  wins.** `A3-NOLLM` runs a regex battery on the same inputs and the comparison
  is reported, including the case where the regex is better on seen formats.
  Reporting "the rule was sufficient here" is a legitimate finding.
- **If wrong or hostile:** output is substring-verified and non-numeric, and the
  candidates it produces are only *filtered* against real settlement UTRs. A
  wrong parse costs a missed anchor (→ ambiguity → abstention), never a wrong
  allocation.

### R2 · `classify_exception`

- **Input:** structured exception summary (constraint violations, component
  shape, amounts as opaque references). **Output:** one enum from a fixed
  taxonomy + evidence IDs + the analyst-facing question.
- **Why not a rule:** the taxonomy is 14 classes and the discriminating signal is
  frequently a *combination* of weak cues, plus judgement about what the human
  will need to look at. Writing the analyst's question — "confirm whether the
  ₹2,300 delta is the August pricing change or a duplicate fee posting" — is
  generation, not classification.
- **If wrong or hostile:** misroutes an exception in a queue a human reads. Zero
  financial impact. Misclassification rate is measured.

### R3 · `propose_probe`

- **Input:** the ambiguity certificate + list of available probes. **Output:** one
  call from a closed enum with allowlisted arguments, or `NO_USEFUL_PROBE`.
- **Why not a rule:** this is sequential decision-making under uncertainty —
  which single lookup, out of many, most reduces ambiguity here. A static
  priority list is the deterministic baseline and it is measured against this
  (`abstentions resolved per probe spent`). If the static list wins, we say so.
- **If wrong or hostile:** wastes probe budget (hard-capped at 3 per component).
  All probes are read-only and allowlisted, so a hostile choice cannot reach an
  unintended target.

### R4 · `explain_decision`

- **Input:** the **already-final** decision plus its evidence. **Output:** prose.
- **Why not a rule:** templated explanations for 14 exception classes × component
  shapes are unreadable. This is the one place natural language is the product.
- **If wrong or hostile:** it runs *after* the decision and cannot change it.
  Every numeral is grounded against the evidence set; ungrounded output is
  discarded. Worst case, the analyst reads a template instead.

### Roles the model is explicitly forbidden

Deciding a match; computing or adjusting any amount; setting a confidence score
used by the abstention rule; overriding an invariant; writing to the ledger;
choosing whether to abstain. These are enforced by types, not by prompt text: the
LLM package cannot construct a `ValidatedDecision`, and its output schemas contain
no numeric fields.

### 6.5 The `LlmProvider` abstraction

Every model call in ASSAY goes through one interface. Roles R1–R4 are written
against this interface and have no knowledge of which provider is behind it.

```ts
interface LlmProvider {
  readonly id: "offline" | "replay" | "anthropic" | "openai-compatible";
  readonly modelId: string;               // "rules-v1" for offline
  readonly requiresNetwork: boolean;
  readonly meteredCost: boolean;

  /** The ONLY entry point. Schema-constrained, non-numeric by contract. */
  invoke<T>(req: {
    role: "R1" | "R2" | "R3" | "R4";
    schema: ZodType<T>;                   // must contain no number-typed field
    systemPromptId: string;               // versioned, hashed, cache-stable
    input: StructuredRoleInput;           // no free text except the quarantined field
    idAllowlist: string[];
  }): Promise<{ value: T | null; meta: LlmCallMeta }>;
}
```

**Four implementations, all interchangeable at runtime via `--llm=<id>`:**

| Provider | Network | Cost | Determinism | Purpose |
|---|---|---|---|---|
| `offline` | none | zero | **fully deterministic** | Rule-based implementation of all four roles: regex battery (R1), decision-tree classifier (R2), static probe priority list (R3), templated explainer (R4). The CI default and the guaranteed demo path. |
| `replay` | none | zero | **fully deterministic** | Serves committed responses from `fixtures/llm-cache/`, keyed by `sha256(provider ‖ model_id ‖ system_prompt_hash ‖ input_hash)`. Cache miss under `--strict-replay` is a hard error, never a silent live call. **All scored benchmark runs use this mode.** |
| `anthropic` | yes | metered | not reproducible | `@anthropic-ai/sdk`, `messages.parse()` with `zodOutputFormat` for strict schemas, `thinking: {type:"adaptive"}`, prompt caching on the stable system prefix. |
| `openai-compatible` | yes | metered | not reproducible | Any endpoint speaking the OpenAI chat-completions schema with JSON-schema response format — self-hosted, local runtime, or third-party. Present so no single vendor is load-bearing. |

**Why this exists, beyond portability.** Three separate failures are prevented by
the same interface:

1. **Vendor dependence.** If one provider is unavailable, unaffordable, or
   changes its API, ASSAY still runs. The architecture's claims are about the
   *boundary*, not about which model sits behind it.
2. **Undemonstrable demos.** A finance control that cannot run without a network
   is not a finance control. `--llm=offline` must always work.
3. **Irreproducible benchmarks.** Language models are not deterministic even at
   fixed settings. Scoring runs use `replay`, which is, and the live pass that
   populated the cache is recorded with provider, model ID and per-call hashes.

**Hard rules.**

- **The full pipeline must pass every acceptance test under `--llm=offline`.**
  A test that only passes with a live model is testing the model, not ASSAY.
- **Consumer subscriptions are never used as an API.** Claude Pro, ChatGPT Go,
  Google AI Pro and equivalents are end-user products with their own terms;
  ASSAY does not automate, scrape, proxy or route traffic through any of them.
  The only supported live path is a metered API credential.
- **The `offline` provider is the same component as ablation `A3-NOLLM`.** It is
  built properly, not as a stub — a sabotaged offline path would both break the
  demo guarantee and invalidate the ablation.
- **`meteredCost === true` providers are refused in CI** by configuration, so no
  test run can incur spend.

## 7. The Ambiguity Oracle — independent of both generator and engine

The obvious objection: *you generate the ambiguity and you detect the ambiguity,
so you are grading your own consistency.* This is the same circularity used to
reject Track 03, and it must be answered for our own design.

### 7.1 Independence from the generator

**The generator does not label ambiguity.** It simulates a business process
forward and then degrades the observations. Whether a given degradation *happens*
to produce a genuinely undecidable case is an emergent property of the resulting
observation set — nobody decides it, and there is no `is_ambiguous` field
anywhere in the ground truth (`DATA_MODEL.md §1`).

The oracle reads **only the observation files**. It cannot read ground truth: a
runtime path guard throws on any read of `**/ground_truth*.jsonl`, and an ESLint
rule forbids `packages/oracle` from importing `packages/generator`.

### 7.2 Independence from the engine

Full independence would require two people who never spoke. What is achievable,
and what ASSAY does, is **two independent implementations of one declarative
specification**:

- The hard constraints live in `packages/domain/src/constraints.decl.ts` as
  **data** — each constraint a named, documented predicate specification.
- **The engine** implements them as fused, short-circuiting filters optimised for
  throughput, applied during candidate generation.
- **The oracle** implements them as naive per-candidate boolean checks over a
  fully enumerated space, with no ordering, no pruning, no early exit, no soft
  scoring and no LLM.
- `packages/oracle` may not import `packages/engine`. Enforced by lint, checked
  in CI.

Neither reads the other's code; both are checked against the same declaration.

### 7.3 The two gates

**Completeness gate (hard).** For every target in a generated dataset, the true
allocation from ground truth must appear among the oracle's enumerated solutions.
If it does not, the declared constraint set excludes reality, the benchmark is
invalid, and no results may be reported from it. Runs on every dataset before any
agent sees it.

**Consistency gate (hard).** For `R = 20,000` randomly sampled
`(target, member-set)` pairs drawn from the dev split — deliberately including
inadmissible ones — the engine's admissibility verdict must equal the oracle's,
constraint by constraint. Any disagreement fails the build and names the
constraint. This is a differential test between two implementations, and it is
what makes "the oracle is independent" a checked property rather than a claim.

The two gates catch different faults: completeness catches a constraint set that
is *too strict* (excludes the truth); consistency catches the engine and oracle
*diverging* from the shared declaration. Neither alone is sufficient.

### 7.4 What the oracle buys

A case is **truly ambiguous** iff the oracle finds ≥ 2 admissible allocations
whose control-account balances differ by more than τ. This is the ground truth
for abstention precision and recall — derived from observations, not authored.

It also defines the **best abstention policy achievable from the observations**,
so ASSAY reports `gap_to_oracle` rather than an unanchored accuracy figure. A
small gap means the information limit has been reached and further effort should
go into acquiring better evidence, not better algorithms.

### 7.5 The limitation that remains

The oracle and the engine share the *declaration* of the hard constraints. If
that declaration misrepresents the real world, both are wrong together, and no
amount of differential testing would reveal it. This is why `C1`–`C8` are frozen
in `PREREGISTRATION.md` with individual real-world justifications rather than
tuned during development, and why `constraint_set_hash` is part of the benchmark
manifest. It is stated in the final report as a declared threat to validity, not
omitted.

## 8. Storage — the two-layer shadow ledger

The audit trail is **not** a JSON decision log. It is two layers with different
jobs and different guarantees, and the separation is what makes it verifiable.

### Layer A — the audit event layer

Append-only, hash-chained, one event per decision or state change. Answers *what
happened, who did it, on what evidence, and when* (`DATA_MODEL.md §16`).

- `hash = sha256(canonical_json(body) ‖ prev_hash)`; genesis binds the chain to
  `(run_id, dataset_hash, engine_commit, config_hash)` so a report cannot later
  be attached to different inputs.
- Every event carries an `actor` block distinguishing `deterministic` from `llm`
  from `human`, with provider, model ID and prompt hash where applicable. For any
  `RECONCILE` event, `actor.type` is `deterministic` by construction.
- Nothing is ever updated or deleted. A correction is a new event.

### Layer B — the double-entry ledger

A **pure projection** over Layer A: replaying the event log recomputes every
control-account balance from scratch. Answers *what are the books, and do they
balance* (`DATA_MODEL.md §17`).

- Balances are never mutated in place and never cached authoritatively. An edited
  balance without a corresponding event simply disappears on the next projection.
- Every posting is balanced journal lines; `Σ dr = Σ cr` continuously (`I1`).
- `9000_SUSPENSE_UNRECONCILED` receives every abstention and every open
  exception. Its balance is the rupee value ASSAY declined to guess.

**Why two layers rather than one.** They fail differently and so must be checked
differently. Layer A detects *tampering* — someone changed the record of what
happened. Layer B detects *incoherence* — the record is intact but the books do
not balance. A single JSON log detects neither: it has no chain, so edits are
invisible, and no arithmetic invariant, so a lost rupee is undetectable. Adding
double-entry turns the audit trail from a narrative into an error-detecting code,
and adding the chain makes that code tamper-evident.

### Physical storage

**SQLite, single file, WAL mode, via `better-sqlite3`.** No server, no Docker, no
migration framework beyond a numbered SQL file per version.

Chosen because reconciliation is a batch workload with a hard requirement for
transactional append and byte-reproducible output. A single-file database makes a
run artifact something you can hash, attach to a report, and hand to a reviewer.
Postgres would add operational surface with no benefit at this scale; JSON files
would lose transactionality and make the append-only guarantee a convention
rather than a property.

Tables: `observation`, `untrusted_text`, `candidate`, `component`, `decision`,
`ledger_event`, `journal_line`, `exception`, `probe_log`, `llm_call`, `run`,
`close_report`.

**Reproducibility:** `runs/<run_id>/` holds `manifest.json`, `assay.sqlite`,
`close_report.json`, `metrics.json`, `ledger_root_hash.txt`. A run is fully
described by `(dataset_hash, engine_commit, config_hash, llm_provider,
llm_cache_hash)`.

## 9. APIs

Internal HTTP, `apps/api`, consumed only by `apps/web`. Local bind only.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/runs` | Start a run over a named dataset. Body includes `llm_provider`. Returns `run_id`. |
| `GET` | `/runs/:id` | Status, progress, stage timings, provider in use. |
| `GET` | `/runs/:id/close` | Close report: gate outcome (`CLOSED` / `OPEN` / `BLOCKED`), coverage, Suspense, unresolved value, trial balance, root hash. |
| `POST` | `/runs/:id/close` | Attempt the close gate. Returns which of G1–G5 passed and the resulting period status. |
| `GET` | `/runs/:id/exceptions` | Exception + abstention queue, **ranked by rupee value**, filterable by class. |
| `GET` | `/runs/:id/decisions/:decision_id` | Full drill-down: evidence, constraints, certificate, hash-chain segment. |
| `GET` | `/runs/:id/ledger/verify` | Recomputes the hash chain from genesis, re-projects balances, re-checks the Suspense identity. Returns pass/fail per check. |
| `GET` | `/runs/:id/abstention-telemetry` | Abstention rate by value against the rolling dev baseline, source attribution, spike flag (`THREAT_MODEL.md §T9`). |
| `GET` | `/bench/:version` | Static benchmark report JSON. |

`/ledger/verify` exists so a reviewer can check tamper-evidence live rather than
be told about it. `POST /runs/:id/close` returns the individual gate results
rather than a boolean, because "why won't it close" is the question an analyst
actually asks.

## 10. Evaluation pipeline

```
  generator --seed S --families F --split dev|test
        │
        ├──▶ observations.jsonl        (given to every agent)
        └──▶ ground_truth.jsonl        (sealed for the test split)
                    │
  oracle ◀──────────┘ observations ONLY ──▶ ambiguity_labels.jsonl
        │            + completeness gate (vs ground truth, offline)
        │            + consistency gate  (vs engine, differential)
        ▼
  agent runner ── ASSAY · B0 · B1 · B2 · A1 · A2 · A3
        │   one interface: Observations -> Decisions + Ledger
        │   all runs use --llm=replay for reproducibility
        ▼
  scorer ──▶ metrics.json per (agent × seed × split)
        │
        ▼
  aggregator ──▶ mean ± bootstrap 95% CI over ≥5 seeds ──▶ report.html
```

Every agent implements the same interface, so ablations are configuration flags
rather than forked codebases — which is what makes them valid controls. `A3-NOLLM`
is literally `ASSAY --llm=offline`, so the ablation and the offline demo path are
the same code and are exercised by the same tests.

Note the gate ordering: the completeness gate compares oracle output to ground
truth and therefore runs **inside the generator's trust zone, offline, before any
agent exists**. No agent, and no agent-facing code, ever touches it.

## 11. Technology choices and their justifications

| Choice | Why | Rejected alternative |
|---|---|---|
| TypeScript 5.x strict, Node 22 | One language across generator, engine, eval and UI. Under this schedule a polyglot repo costs a day in glue. | Python for eval — better stats libraries, but a second toolchain and a serialization boundary. |
| Branded `Paise` integer type | Makes float money a compile error. | `decimal.js` — correct but invites float-shaped thinking and is slower in hot loops. |
| Own xorshift128+ PRNG | Reproducibility must survive dependency upgrades. A vendored 20-line generator cannot drift. | `seedrandom` — fine, but an external dependency inside the definition of the benchmark. |
| `zod` at both trust boundaries | The same schema validates ingest and constrains LLM output. | Hand-written guards — drift between the two uses. |
| **`LlmProvider` interface with 4 implementations** | No vendor is load-bearing; `offline` guarantees the demo; `replay` guarantees reproducibility. §6.5 | A direct SDK call at each site — couples the architecture to one vendor and makes offline operation a rewrite. |
| `better-sqlite3` | Synchronous, transactional, single file, fast enough for 100k rows. | Postgres (ops overhead), JSON files (no transactions). |
| `vitest` + `fast-check` | Property-based tests are the right tool for conservation invariants: "for all batches, debits equal credits." | Example-based tests only — they miss the adversarial middle. |
| Hono + Vite/React | Minimal, no framework ceremony. | Next.js — server/client boundary complexity for a local tool. |

Deliberately excluded: Docker, Postgres, Redis, a vector database, LangChain or
any agent framework, an ORM, and any auth library. Each adds surface without
touching the contribution — and a vector database in a reconciliation project is
a positive signal of confusion.

## 12. Failure handling

| Failure | Behaviour | Why not something else |
|---|---|---|
| LLM provider unreachable / rate-limited | Retry with backoff, then **fall back to the `offline` provider for that role** and log `LLM_UNAVAILABLE`. The run completes. | A finance close must not be blocked on a third-party API. Degradation is visible in the report as a raised abstention rate, not hidden. |
| LLM returns invalid schema | Discard, one retry, then `offline` fallback for that call. Counted. | Never coerce or repair a malformed financial-adjacent response. |
| `replay` cache miss under `--strict-replay` | Hard error. **Never a silent live call.** | A benchmark that quietly goes live is no longer reproducible, and the report would be false. |
| Component exceeds `K_max` | `ABSTAIN` with reason `SEARCH_BOUND_EXCEEDED`. | The honest outcome. Silently truncating the search and returning "best found" is the exact failure ASSAY exists to prevent. |
| Invariant violation on an accepted allocation | Reject the allocation, route to exception, continue the batch, record `invariants_failed`. | A single bad allocation must not abort a 10,000-record close. |
| Unresolved value exceeds the close policy threshold | Period ends **`OPEN`** with `unresolved_value_paise` quantified. Close report is emitted and marked `OPEN`. | This is a business state, not a defect. Refusing to emit anything would hide the number the controller needs. |
| Trial balance ≠ 0, Suspense identity broken, or an observation with no terminal state at close | Period ends **`BLOCKED`**. Run marked `invalid`. No close report emitted. | These can only mean a bug in ASSAY. Emitting a close report over a broken ledger is worse than emitting nothing. |
| Hash chain verification fails | Run marked `TAMPERED`; refuse to serve the close report. | The chain's only purpose is to be believed. |
| Oracle completeness or consistency gate fails | Build fails. Dataset marked invalid; no agent may run against it. | A benchmark whose oracle is wrong produces confidently wrong metrics. |

