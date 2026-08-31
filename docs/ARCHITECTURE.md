# ARCHITECTURE — ASSAY

**Spec version:** 1.4.27 · **Date:** 2026-08-31

**At spec 1.4.27** `§10`'s pipeline records the committed artifact paths — dataset
artifacts at `bench/<split>/<seed>/`, `recon_report.jsonl` **unchanged** at
`bench/<split>/` (M36) — and names `apps/cli` as the executor of both `§7.3` gates,
whose pure implementations do not move. `§10`'s `ambiguity_labels.jsonl` is written
under `PREREGISTRATION.md §9` step 4's own name, `oracle_labels.jsonl`; it is the
same artifact and the rename settles a two-name seam rather than adding one. **No
trust boundary, data flow, interface, provider, role, package responsibility, probe
enum or gate definition changes**; `§7.3`'s two gates are untouched in scope and in
criterion, and `§3`'s table is unchanged — `apps/cli` already held *"all filesystem
I/O"*, which is the whole of why the gates are its to run. Benchmark v1.0.5 →
**v1.0.6**. See `DECISION_BRIEF.md §A.34`, register rows **M42** and **M43**,
`PREREGISTRATION.md §10` V24.

**At spec 1.4.26** `§6`'s `R3` row records that its *"why not a rule"* justification
is **not demonstrable on the conforming v1.0.0 population** — the choice set is a
singleton, so the static list cannot be beaten. **Disclosure only. No trust
boundary, data flow, interface, provider, role, package responsibility or probe
enum changes**, and benchmark v1.0.5 is unchanged. See `DECISION_BRIEF.md §A.33`,
register row M41, `PREREGISTRATION.md §10` V23.

**At spec 1.4.25** `§6`'s `R3` row states its **proposable action set** — the four
id-argument probes plus `NO_USEFUL_PROBE`, `widen_temporal_window` excluded
(`DECISION_BRIEF.md §L.1` rule 2, **unchanged and unweakened**); `§6.5`'s `offline`
row points at the now-frozen `A3-NOLLM` priority policy in `PREREGISTRATION.md §7`;
and `§12` gains one row for a rejected probe proposal. **No trust boundary, data
flow, interface, provider or package responsibility changes**, and the probe enum
stays **closed at five** for the executor. Benchmark v1.0.4 → **v1.0.5**. See
`DECISION_BRIEF.md §A.32`.

**At spec 1.4.24** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.31`.

**At spec 1.4.23** `§3` gains a row for `packages/probe` and `§6.6` states the
proposal/execution seam. **No trust boundary, data flow, interface or existing
package responsibility changes**, and benchmark v1.0.4 is unchanged. See
`DECISION_BRIEF.md §A.30`.

**At spec 1.4.22** `§3`'s generator row, `§7.1` and `§10`'s pipeline record the
PG-side recon report that `RECONCILIATION_SPEC.md §6.2`'s probe reads. **The
oracle is barred from it** (`PREREGISTRATION.md §6.2` `AL8`) and stays
observations-only, because `§7.3`'s completeness gate is scoped to expressible
targets precisely *because* `F05` withholds a line. **No component, boundary,
package, interface or trust boundary changes.** See `DECISION_BRIEF.md §A.29`.

**At spec 1.4.6** this document is unchanged apart from the version header. `§7`'s
oracle description is unaffected; `DATA_MODEL.md §11` now defines the component
value `τ` reads. See `DECISION_BRIEF.md §A.13`.

**At spec 1.4.5** this document is unchanged apart from the version header. §12's
row for unresolved value exceeding the close threshold — the period ends `OPEN`
with the figure quantified — is the path every conforming run is now expected to
take. See `DECISION_BRIEF.md §A.12`.

**At spec 1.4.4** this document is unchanged apart from the version header. §7.3's
completeness gate is scoped to expressible targets by `PREREGISTRATION.md §5.3`;
its purpose — catching a constraint set that excludes reality — is unchanged, and
expressibility is decided without reading `C1`–`C8`. See `DECISION_BRIEF.md §A.11`.

**At spec 1.4.3** this document is unchanged apart from the version header.
§7.2's description of the oracle as running "naive per-candidate boolean checks
over a fully enumerated space" is unchanged and is now satisfiable: the space it
enumerates is bounded by `RECONCILIATION_SPEC.md §4.1`'s co-settlement coherence.
See `DECISION_BRIEF.md §A.10`.

**At spec 1.4.2** this document is unchanged apart from the version header.
Boundary 1's requirement that amounts be non-negative safe integers is one of the
four frozen rules whose collision `PREREGISTRATION.md §4.2` resolves, and it is
**unchanged and unweakened** — the unrepresentable batch was the inconsistent
element, not the boundary. See `DECISION_BRIEF.md §A.9`.

**At spec 1.4.1** this document is unchanged apart from the version header.
Boundary 1's text quarantine is one of the two grounds on which anchor `AN5` was
retired (`RECONCILIATION_SPEC.md §3`), and it is **unchanged and unweakened** —
the anchor was the inconsistent element, not the boundary. No component,
boundary, package, interface or data flow changed.

**At spec 1.4.0** this document defined the `ValidatedDecision` contract, its
declaration site, its construction authority and the mechanism enforcing *"only
S5 may construct"* (§4, boundary 3), and restated §8's Suspense paragraph against
the item key and the posting-trigger table — see `DECISION_BRIEF.md §A.7`. **No
component, package, interface or data flow changed**, and the two-layer split is
unchanged.

**At spec 1.3.0** this document changed in §6 only: trust-boundary item 3 now
points at the normative `(kind, source_system, payload)` table in
`DATA_MODEL.md §10`, which is what makes its anonymity claim checkable — see
`DECISION_BRIEF.md §A.6`. **No component, boundary, package, interface or data
flow changed.** The paragraphs below describe the earlier **1.2.0** and
**1.1.1** releases and are retained as history.

**At spec 1.2.0** this document changed in §5 (the worked trace's ledger posting)
and §8 (balance sign convention, the hashed `body` and genesis, and the Suspense
description) — see `DECISION_BRIEF.md §A.5`.

Spec 1.1.1 is a factual-correction release. The only change in this document is
the name and definition of one probe (§5): settlement constituents come from the
date-scoped recon report, not from `GET /v1/settlements/:id`, which returns the
settlement entity alone. **No component, boundary, package, interface or data flow
changed.**

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
| `packages/domain` | Zod schemas; ID grammars; canonical JSON; **`constraints.decl.ts`** — the declarative constraint table; **stage `S0` orchestration over already-read source data, ratified at spec 1.4.18** | One definition of truth for shapes and constraints, shared by generator, engine, oracle and eval. The declarative table is what lets engine and oracle be two independent implementations of one specification (§7). |
| `packages/generator` | Forward business simulation to observations + hidden ground truth; degradation operators; **the PG-side recon report `§6.2`'s probe reads (spec 1.4.22)** | Must be independently runnable and seed-deterministic. Kept out of the engine so no engine code can ever import ground truth — an import lint enforces this. |
| `packages/oracle` | Exhaustive enumeration of evidence-admissible allocations from **observations only** | Deliberately a second, slow, naive implementation. Its whole value is being *not* the engine and *not* the generator. See §7. |
| `packages/engine` | Stages S1–S5. Pure functions, no I/O, no network | Purity makes the core replayable and property-testable, and makes the LLM absence from the arithmetic path structurally verifiable. |
| `packages/probe` | The `§6.2` probe **loop**, as a pure state machine: `P_max` accounting, pre-call `I6`, construction of the closed five-probe call, and the `PROBE` event body (spec 1.4.23) | The one place `THREAT_MODEL.md §T7`'s four controls meet. It is the **only** constructor of a probe call, so a caller cannot dispatch around them. Pure and I/O-free, so the caller owns the read and the append — the split spec 1.4.18 already made for `S0`. |
| `packages/llm` | **`LlmProvider` interface + four providers**; four bounded roles; response cache; output verification | Single choke point. Every model call goes through one interface, so swapping providers — or removing the model entirely — is configuration, not a rewrite. See §6.5. |
| `packages/ledger` | **Layer A** append-only hash-chained audit events; **Layer B** double-entry projection; close gate | Append-only semantics, the trial-balance invariant and the Suspense identity are properties of this package, not conventions its callers must remember. |
| `packages/eval` | Metrics, bootstrap CIs, baselines, ablations, report generation | Must run against any agent behind one interface, so ablations are configuration, not forked code. |
| `apps/api` | Thin HTTP over engine + ledger | — |
| `apps/web` | Four screens (`PROJECT_SPEC.md §10`) | — |
| `apps/cli` | `assay generate / oracle / run / bench / close / verify / seal`; **all filesystem I/O — it acquires raw source contents and passes them into `packages/domain`'s `S0` boundary, and performs no `S0` transform itself (spec 1.4.18)** | The CLI is the real interface; the UI is a view over it. Everything demonstrable must be scriptable. |


**`S0`'s owner, ratified at spec 1.4.18 `[ASSAY-MODEL]`, register row M32.** The
table above has said *"Stages S1–S5"* of `packages/engine` since spec 1.0.0, and
`§2`'s component map draws `ingest` inside **trust boundary 1** with the engine box
below it — but **no document named the package that owns `S0`**, and
`DECISION_BRIEF.md §L.2` and `§I` named `packages/engine`. That was not a labelling
preference; it was impossible. `RECONCILIATION_SPEC.md §2` gives `S0` the output
`Observation[]` + **`UntrustedText[]`**, and `DATA_MODEL.md §10` states that
*"nothing in `packages/engine` may import `UntrustedText`"* — *"it is not that the
core **chooses** not to read hostile text, it is that it **cannot**"* — a ban
`§L.1` rule 3 lists among the invariants that may never be violated, that
`PREREGISTRATION.md §6.2` `AL1` repeats, and that `eslint.config.js` enforces in CI
with `noInlineConfig`. **A stage cannot emit a type its package is forbidden to
import**, so `S0` could never have lived in the engine. `DECISION_BRIEF.md §A.25`
carries the correction.

**The split, and why it needs three parties rather than two.** `apps/cli` reads the
files, because `S0`'s stated input is *"raw source files"* while this table gives the
engine *"no I/O, no network"* and `§4` boundary 1 puts the crossing outside the core.
`packages/domain` owns the transform: it already holds every per-record piece `S0`
performs — the strict schemas of `§4` boundary 1.1, `checkReconLineInvariants` for
`RECONCILIATION_SPEC.md §2` step 2, the quarantine module at the separately-bannable
`@assay/domain/untrusted-text`, and `DATA_MODEL.md §10.1`'s static `REFERENCE`
classification — so the orchestration lands where its parts already are and **no new
package is created**. `packages/engine` receives `Observation[]` and begins at `S1`.
Domain performs **no I/O**; it transforms bytes the CLI has already read, which keeps
`S0` deterministic and unit-testable without a filesystem.

**What this does not do.** It moves no code and creates no module — `packages/engine`
remains absent at spec 1.4.18, and domain's `S0` orchestration is scheduled, not
written. `ARCHITECTURE.md §4` boundary 1's three obligations are unchanged, as is
`§2`'s map, which already drew this boundary correctly.


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
   `source_line`, `ingest_hash`. Nothing enters the system anonymously. The
   permitted `(kind, source_system, payload)` triples are enumerated normatively
   in `DATA_MODEL.md §10`, and ingest rejects any triple not on that table.

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

#### The `ValidatedDecision` contract `[ASSAY-MODEL]`

Four documents named this type and none defined it. It is defined here, because
a boundary whose only type is undefined is a boundary no implementation can
hold. **Nothing below adds an obligation.** Every field is present because some
already-frozen gate or invariant cannot be evaluated without it, and the source
of each demand is named.

**Declaration site: `packages/ledger`.** Forced, not preferred. `§L.1` rule 4
puts the write path in `ledger`; a function signature must name its parameter's
type; and `ledger` cannot import `engine`, which builds after it (`§L.2`).
`packages/domain` is the wrong home — its scope is the ingest-boundary entities
of `DATA_MODEL.md §2`–`§9`, and a post-validation engine artifact does not
belong in the package the trust-boundary-1 schemas live in.

**Construction authority: `packages/engine/src/s5-validate.ts`, exclusively.**
Unchanged from `RECONCILIATION_SPEC.md §7` and `§L.1` rule 4.

**Enforcement: an opaque brand plus a path allowlist.** TypeScript is
structurally typed, so any object with matching fields inhabits a bare
interface and *"only S5 may construct"* would be a convention rather than a
property. `ledger` therefore declares the type carrying a **non-exported**
unique-symbol brand and exports **no constructor**; the single widening
assertion lives in `engine/src/s5-validate.ts` and is allowlisted by path in an
ESLint rule. This is the mechanism `§L.1` rule 3 already runs for
`packages/eval/src/gates/consistency-gate.ts`, the one file permitted to import
both engine and oracle. Two alternatives are rejected: a constructor exported
from `ledger` is callable by every package built after position three, and a
runtime capability token is unenforceable at build time and merely relocates
the same problem.

**The minimum fields, each with the obligation that demands it:**

| Field | Demanded by | Why the write path cannot proceed without it |
|---|---|---|
| brand (non-exported unique symbol) | `§L.1` rule 4 | Nominal identity. Without it the type is structurally inhabitable by anything |
| `decision_id` | `DATA_MODEL.md §16`; `EVALUATION_SPEC.md §4.4` | The event body's owning-decision link; `proj_agent` partitions on it |
| `type: DecisionType` | `RECONCILIATION_SPEC.md §9`; `DATA_MODEL.md §20` | Selects the posting family and the terminal state |
| `journal_lines: JournalLine[]` | `DATA_MODEL.md §16`; `I1`; gate `G2` | The lines S5 validated. The write path must post *these*, never re-derive them |
| `invariants_checked` / `invariants_failed` | gate **`G5`** | *"No allocation with a non-empty `invariants_failed` was posted."* `G5` is unverifiable unless the validated artifact carries the result. `invariants_failed` is empty by construction — that emptiness is the type's meaning |
| `subject_obs_ids` / `evidence_ids` | `DATA_MODEL.md §16` | Both enter the hashed `body` in emitting-stage order |
| `certificate` | `DATA_MODEL.md §13`, `§16` | Non-null exactly when `type === "ABSTAINED"` |
| `inputs_hash` | `DATA_MODEL.md §16` | *"hash of everything the step read"* — only S5 knows what it read |

**Deliberately not included.** `financial_impact` (`§13` carries one on
`Decision`; it is derivable from `journal_lines`, and two spellings of one fact
is how they drift apart). Any timestamp — `ts` is outside the hashed `body` for
the reason `§16` gives. A re-declaration of `§13`'s full `Decision`, which this
boundary does not read.

**No cycle, and where the boundary is drawn.** S5 must check `I1` over journal
lines before it may emit a `ValidatedDecision`, so it needs those lines first.
`journal.ts` therefore takes a **proposed** allocation and its terminal state —
never the validated wrapper — and is a pure function with no I/O. This
paragraph and `§L.1` rule 4 constrain the **mutating write path** and nothing
else. Read that way the sequence is linear: `journal.ts` → `I1`…`I9` → mint →
write path. Read the other way it is a cycle, which is why the boundary is
stated here rather than left to the implementation.

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
  │                materiality = ₹4,52,310 > τ · evidence gap Δs = 0 bps
  │                → ABSTAIN, certificate {A} vs {B,C}
  │
  ├─ R2 LLM        classify_exception → UTR_PREFIX_COLLISION
  │                R3 propose_probe   → fetch_settlement_recon(setl_A, date)
  │                → deterministic date-scoped recon-report query for the lines
  │                  carrying setl_A; still no discriminator
  │
  ├─ S5 validate   abstention path: I1,I2,I6 checked; posting to Suspense
  │
  └─ ledger        DR 1200_BANK 45231000 / CR 9000_SUSPENSE 45231000
                   (posting P5, DATA_MODEL.md §17.1 — the unattributable item is
                    an inbound bank credit, so the bank leg posts in its true
                    direction and Suspense takes the credit)
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
- **The proposable action set, ratified at spec 1.4.25 `[ASSAY-MODEL]`, register
  row M40.** Four of `RECONCILIATION_SPEC.md §6.2`'s five probes, plus the decline
  — **every field string-typed**:

  ```
    { probe: "fetch_order",            order_id }
    { probe: "fetch_payment",          payment_id }
    { probe: "fetch_refund",           refund_id }
    { probe: "fetch_settlement_recon", settlement_id, date }
    { probe: "NO_USEFUL_PROBE" }
  ```

  `widen_temporal_window` is **not proposable by `R3`**: its only argument is
  `days`, `DECISION_BRIEF.md §L.1` rule 2 forbids a numeric field in any LLM output
  schema and is **unchanged and unweakened**, and `R3`'s authority over that probe
  was expressly unsettled (`§6.2`, `THREAT_MODEL.md §T7`, register row M33) — so the
  settled invariant governs. **The probe stays in the executor's closed enum of
  five**; the actions one proposer may name and the calls `packages/probe` may
  construct are different sets. `date` is an **opaque string** and is never parsed
  by the model's consumer: `DATA_MODEL.md §22.2` M31 leaves the field a query is
  date-scoped on undecided, and on spec 1.4.22's committed surface `settlement_id`
  is the only query key, so the argument reaches only the `PROBE` event's
  `inputs_hash`.
- **Why not a rule:** this is sequential decision-making under uncertainty —
  which single lookup, out of many, most reduces ambiguity here. A static
  priority list is the deterministic baseline and it is measured against this
  (`abstentions resolved per probe spent`). If the static list wins, we say so.
- **That justification does not hold on v1.0.0 data, disclosed at spec 1.4.26
  `[ASSAY-MODEL]`, register row M41.** There is no *"out of many"*:
  `DATA_MODEL.md §11.1` gives a `bank_line` target the empty candidate set and a
  settlement target one `settlement_id`; `§4.2`'s `SE5` is target-scoped; M36
  sources only `fetch_settlement_recon`; and `EVALUATION_SPEC.md §4.5` prices no
  probe. **One probe, one argument, zero cost** — so
  `PREREGISTRATION.md §7`'s frozen policy is **weakly dominant** and *"if the
  static list wins, we say so"* is the **only** outcome available. We say so here,
  before any run. The role is built and correct; the **claim** that it beats the
  list is withdrawn (`DECISION_BRIEF.md §H`, `§A.33`, `PREREGISTRATION.md §10`
  V23), the policy stays frozen and untuned, and no probe source is added.
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
| `offline` | none | zero | **fully deterministic** | Rule-based implementation of all four roles: regex battery (R1), decision-tree classifier (R2), static probe priority list (R3), templated explainer (R4). The CI default and the guaranteed demo path. **R3's list is frozen at `PREREGISTRATION.md §7` from spec 1.4.25 (M39)** — `fetch_settlement_recon` → `fetch_payment` → `fetch_order` → `fetch_refund`, lexicographically smallest eligible argument, first constructible entry wins, else `NO_USEFUL_PROBE`. |
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
  demo guarantee and invalidate the ablation. **From spec 1.4.25 its `R3` policy is
  additionally pre-registered** (`PREREGISTRATION.md §7`, `AL3`,
  `DECISION_BRIEF.md §L.1` rule 12), because that one role's output is the comparand
  of `§6.2`'s *"beats a static priority list"* rather than an incidental component:
  a list authored or revised after a figure was seen would move the thing the
  measurement is against. `AL3` binds it and `§L.4` forbids changing it on the basis
  of an observed result, on TRAIN, DEV or TEST alike. R1's regex battery and R2's
  classifier are **not** pre-registered this way and do not need to be — their
  outputs are verified against the input (substring grounding) or scored against a
  known cause (metric 10), and neither is a denominator.
- **`meteredCost === true` providers are refused in CI** by configuration, so no
  test run can incur spend.

### 6.6 The proposal / execution seam `[ASSAY-MODEL]`

`RECONCILIATION_SPEC.md §6.2` separates two actors in one sentence: *"The LLM
(`R3`) proposes one probe from a closed enum; **deterministic code executes it**
and re-runs the solve."* Spec 1.4.23 names the deterministic half and keeps it
apart from both the model and the I/O.

```
  packages/llm      R3 proposes            a value, schema- and allowlist-checked
        │
        ▼
  packages/probe    validates + constructs  P_max · pre-call I6 · closed enum
        │                                   the ONLY constructor of a probe call
        ▼
  apps/cli          dispatches              the read; §3's "all filesystem I/O"
        │
        ▼
  packages/domain   validates the result    ProbeResultDetail
        │
        ▼
  packages/engine   S4 re-solves            pure, from accumulated evidence
        │
        ▼
  packages/ledger   appends the PROBE event body packages/probe assembled
```

**Nothing in that chain performs two jobs**, and the middle box holds no I/O. The
pattern is the one `§L.1` rule 4 already runs for `journal.ts` — *"a pure posting
function over a **proposed** allocation"* — and the one `S4` runs when it returns
an undecided seam rather than a fabricated default.

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

**It is also barred from the PG-side recon report, added at spec 1.4.22.**
`PREREGISTRATION.md §6.2` `AL8` guards `**/recon_report*.jsonl` on the same
mechanism, so `RECONCILIATION_SPEC.md §6.2`'s probe evidence can never reach the
oracle and its labels can never depend on a probe result. **This is deliberate
and the reason is `§7.3`'s completeness gate**: `PREREGISTRATION.md §5.3` scopes
that gate to *expressible* targets precisely **because** `F05` withholds a
constituent line, and an oracle holding the report would make those targets
expressible, void the scoping, and reduce the gate to a tautology — it would be
checking a constraint set against an answer key rather than against reality. The
oracle is therefore a **fixed observations-only reference** and the probe channel
is supplemental to ASSAY; `PREREGISTRATION.md §5.1` and `§10` V22 record the
asymmetry as intentional, and `EVALUATION_SPEC.md §4.3` and `§4.13` state how the
metrics are read under it.

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

- `hash = sha256(canonical_json(body) ‖ prev_hash)`, where `body` is defined
  normatively in `DATA_MODEL.md §16` and excludes `evt_id`, `run_id`, `prev_hash`,
  `hash` and `ts`; genesis binds the chain to `(dataset_hash, engine_commit,
  config_hash)` so a report cannot later be attached to different inputs. `run_id`
  is deliberately outside the hashed content: two runs over identical inputs must
  produce identical root hashes for metric 23 to be satisfiable, and must remain
  separately addressable to be compared at all.
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
- **Balances are debit-positive: `balance(acct) = Σ dr_paise − Σ cr_paise`**, with
  no per-account adjustment. The posting table is normative in
  `DATA_MODEL.md §17.1`, and `§17.2` defines the conservative fallback for events
  with no authoritative mapping.
- `9000_SUSPENSE_UNRECONCILED` receives abstentions and open exceptions **on both
  sides** — inbound unattributable credits credit it, outbound unmatched
  settlements debit it. The rupee value ASSAY declined to guess is therefore the
  **gross** sum `Σ |item_net_paise|` over open Suspense items, which is what gate
  G3 tests. An item is the set of Suspense lines sharing one
  `JournalLine.source_entity_id` (`DATA_MODEL.md §16`); it is *open* while that
  set nets to a non-zero figure, because a `P7` resolution reverses under the
  same key. Which observations post at all is `DATA_MODEL.md §17.1.1`'s trigger
  table: seven exception classes open an item and seven do not, the latter
  because no rule among `P1`–`P8` can post them without asserting a rupee
  movement the evidence does not establish. Those still carry an owner, a value
  and a queue position, and gate G1 still admits no drop path.

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
llm_cache_hash)`. Of these, the genesis hash binds only
`(dataset_hash, engine_commit, config_hash)` (`DATA_MODEL.md §16`);
`llm_provider` and `llm_cache_hash` are recorded on `Run` and distinguish runs
whose chains diverge at the first event that differs, which is what allows
metric 24 `offline_parity` to compare an offline run against a replay run over
the same dataset.

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
        │                              families are CONCATENATED into one dataset,
        │                              F01..F10 ascending (spec 1.4.27, M42)
        ├──▶ bench/<split>/<seed>/observations.jsonl    (given to every agent)
        ├──▶ bench/<split>/recon_report.jsonl           (PG-side probe surface,
        │                               spec 1.4.22; SPLIT-scoped and NOT per seed,
        │                               it is a lookup table keyed by a globally
        │                               unique settlement_id and is never ingested;
        │                               reachable ONLY through §6.2's probe
        │                               under P_max; engine + oracle barred, AL8)
        └──▶ bench/<split>/<seed>/ground_truth.jsonl    (sealed for the test split)
                    │
  oracle ◀──────────┘ observations ONLY ──▶ bench/<split>/<seed>/oracle_labels.jsonl
        │            + completeness gate (vs ground truth, offline)  EVERY dataset
        │            + consistency gate  (vs engine, differential)   DEV ONLY, §7.3
        │            both run by apps/cli; results ──▶ <split>/<seed>/oracle_gate.json
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

**`apps/cli` runs both gates, ratified at spec 1.4.27 (register row
`DATA_MODEL.md §22.2` M43), and no gate logic moves.** `§3` gives this app *"all
filesystem I/O"* and neither gate's package performs any, so the caller was always
going to be the composition root; `DECISION_BRIEF.md §K` keeps `completeness-gate.ts`
in `packages/oracle` and `consistency-gate.ts` in `packages/eval`, and `§L.2` builds
`oracle` before `eval`, which is why the completeness gate could never have been
eval's. Ground truth reaches the completeness gate through zone `GENERATOR_TRUST`
alone and is withdrawn under `--sealed` by `AL5`; `recon_report.jsonl` reaches
**neither** gate (`AL8`); and the consistency gate **never** receives ground truth.
On the test split the gate writes aggregate counts only, `AL4` and `AL7` barring any
record-level output. The `R = 20,000` draw's sampler and seed remain **unspecified**
— `PREREGISTRATION.md §10` V24 — so the seed is an operator input and the command
fails closed without one.

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
| **Probe proposal rejected by `packages/probe`** *(implementation convention, spec 1.4.25, `N1`)* | The proposal is well-formed but fails a pre-call control — `P_max`, pre-call `I6`, or an argument range. **Discard it, terminate the probe loop for that component, and take the terminal reason from the resulting state** (`DATA_MODEL.md §13`). `attempts` does not move: no probe was spent. Counted. | Re-issuing is not neutral. An unchanged loop state yields an unchanged `input_hash`, hence an unchanged `cache_key`, hence the **identical rejected proposal forever** under `--llm=replay` and `--llm=offline` alike. This row is a **convention, not a frozen constant or a metric** — it writes no value and adds nothing to `PREREGISTRATION.md §7`. |
| `replay` cache miss under `--strict-replay` | Hard error. **Never a silent live call.** | A benchmark that quietly goes live is no longer reproducible, and the report would be false. |
| Component exceeds `K_max` | `ABSTAIN` with reason `SEARCH_BOUND_EXCEEDED`. | The honest outcome. Silently truncating the search and returning "best found" is the exact failure ASSAY exists to prevent. |
| Invariant violation on an accepted allocation | Reject the allocation, route to exception, continue the batch, record `invariants_failed`. | A single bad allocation must not abort a 10,000-record close. |
| Unresolved value exceeds the close policy threshold | Period ends **`OPEN`** with `unresolved_value_paise` quantified. Close report is emitted and marked `OPEN`. | This is a business state, not a defect. Refusing to emit anything would hide the number the controller needs. |
| Trial balance ≠ 0, Suspense identity broken, or an observation with no terminal state at close | Period ends **`BLOCKED`**. Run marked `invalid`. No close report emitted. | These can only mean a bug in ASSAY. Emitting a close report over a broken ledger is worse than emitting nothing. |
| Hash chain verification fails | Run marked `TAMPERED`; refuse to serve the close report. | The chain's only purpose is to be believed. |
| Oracle completeness or consistency gate fails | Build fails. Dataset marked invalid; no agent may run against it. | A benchmark whose oracle is wrong produces confidently wrong metrics. |

