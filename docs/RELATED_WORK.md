# RELATED_WORK — ASSAY

**Spec version:** 1.4.10 · **Date:** 2026-08-28

**At spec 1.4.6** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.13`.

**At spec 1.4.5** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.12`.

**At spec 1.4.4** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.11`.

**At spec 1.4.3** this document is unchanged apart from the version header. See
`DECISION_BRIEF.md §A.10`.

**At spec 1.4.2** this document is unchanged apart from the version header.

**At spec 1.4.1** this document is unchanged apart from the version header.

**At spec 1.4.0** this document is unchanged apart from the version header. §7's
statement that the ledger package *"exposes exactly one write path and it accepts
only a validated decision"* is unaffected by the contract now defined in
`ARCHITECTURE.md §4` — see `DECISION_BRIEF.md §A.7`.

Where ASSAY sits, and — more usefully — where it does not. The purpose of this
document is to pre-empt "this already exists" by naming the things that already
exist and stating precisely what is left over.

---

## 1. Position relative to Razorpay

**ASSAY does not replace, duplicate or compete with Razorpay's reconciliation
capabilities, and this document asserts no gap or deficiency in them.** What
follows describes *scope* — which question each system answers — using only
publicly documented behaviour.

### 1.1 The settlement recon report

`GET /v1/settlements/recon/combined` returns, per settled transaction:
`entity_id`, `type`, `debit`, `credit`, `amount`, `fee`, `tax`, `on_hold`,
`settled`, `settlement_id`, `settlement_utr`, `order_id`, `dispute_id` and more.
It is a well-designed, authoritative statement of what the gateway settled and
out of which transactions.

**ASSAY consumes this report as its highest-quality input and treats it as the
reference view.** It is the anchor source in stage S1: any recon line carrying a
`settlement_id` is matched by exact join and removed from the search space
entirely (`RECONCILIATION_SPEC.md §3`). In a clean batch this resolves the large
majority of records with no search, no scoring and no model.

The scope difference is structural, not qualitative:

| | Recon report | ASSAY |
|---|---|---|
| Question | "What did the gateway settle, and from which transactions?" | "Do the gateway's, the bank's and the merchant's records agree, and can that be proven?" |
| Sources held | One (authoritative) | Three |
| Position | PG-side, upstream | Merchant-side, downstream |
| Output | A statement of record | A verified close, or a quantified refusal to close |

A single-source view is by construction not where multi-source disagreement is
detected, because detecting disagreement requires holding more than one source.
That is a statement about what a single-source view *is* — not a criticism of any
implementation of one. The bank statement and the merchant's ERP are not
Razorpay's data and were never within the recon report's remit.

### 1.2 Razorpay Optimizer single-view reconciliation

Razorpay Optimizer provides consolidated settlement reconciliation across
multiple payment gateways — one view where a merchant would otherwise juggle
several PG reports. This is a genuinely overlapping product direction and worth
naming honestly.

**Relationship:** complementary, and ASSAY sits downstream. Optimizer normalises
and consolidates PSP-side reports — a data-integration function. ASSAY's
contribution is decision discipline *after* that view exists: what to do when the
consolidated picture still admits two materially different answers. A system like
Optimizer improves ASSAY's inputs; it does not answer ASSAY's question, and ASSAY
does not attempt to replace it.

### 1.3 Razorpay settlement dashboard and Route

The dashboard offers settlement listing, UTR search and downloadable reports —
tooling for a human doing the work directly. Route handles split settlements to
sub-merchants, which introduces a genuine multi-party allocation problem (an
interesting extension, out of scope for v1.0.0).

**Route's out-of-scope status is now structural, not just a plan.** Recon rows of
`type: "transfer"` (`trf_…`) and the `on_hold` / `on_hold_until` transfer flags
belong to Route, and Razorpay's own sample shows transfer rows following a
different arithmetic form from payment and refund rows. ASSAY's ingest schema
therefore does not accept transfer rows at all, rather than modelling them with an
invented identity (`DATA_MODEL.md §6`).

### 1.4 The positioning statement, for judging

Expect a Razorpay engineer's first reaction to "settlement reconciliation" to be
*"we ship that."* The answer must be immediate, specific, and free of any implied
criticism:

> "Your recon report is our anchor input — we join on it first and it resolves
> most of the batch. What we add is downstream and merchant-side: we reconcile it
> against the bank statement and the merchant's ledger, we require every posting
> to pass nine invariants before it can enter the books, and when the evidence
> supports two materially different allocations we refuse to pick and hand the
> analyst both. The period closes only if the books balance and Suspense
> reconciles exactly; otherwise it stays open with the unresolved rupees named."

Verification-first, evidence-bounded, safe close. Not "reconciliation Razorpay
does not do."

## 2. Commercial reconciliation systems

**Method note.** Everything below is drawn from public product documentation and
marketing material. It describes what these systems *publicly document*, not what
they do internally — vendor internals are not observable from outside, and no
claim is made about them. Where this document says something is "not published,"
that is a statement about the public record and about the limits of our search,
not an assertion that the capability is absent.

| System | Publicly documented approach | Relationship to ASSAY |
|---|---|---|
| **Recko** (Indian payments reconciliation, acquired by Stripe, 2021) | Rule-based multi-source matching at scale | The closest commercial analogue in this exact market. Its existence and acquisition are evidence the problem is real and valuable — useful context, not a competitor to beat. |
| **BlackLine** | Enterprise account reconciliation and close management; strong on workflow, controls and sign-off | Validates the "close as a signed terminal state" model, which ASSAY adopts. |
| **Nanonets / Docsumo** | ML document extraction feeding reconciliation | Extraction, not allocation. Solves a different bottleneck. |
| **Ledge, Numeric, Tabs** | Modern AI-assisted accounting and close tooling | Closest in spirit. Public materials describe LLM assistance for classification and explanation. |
| **Zoho Books / QuickBooks bank rec** | Rule-based one-to-one bank matching for SMBs | Different scale; one-to-one, not subset allocation. |

**What we did not find in the public record**, across these products' published
documentation: a *measured* abstention policy — a stated precision and recall for
"needs review" decisions — or an artifact handed to the analyst that names the
specific alternative allocation that could not be ruled out. Ambiguity is
generally presented as a workflow state ("needs review") rather than an
evidential finding with a counterexample attached.

That absence in public documentation is what ASSAY is aimed at, and it is a
modest claim: being handed *"{A,B,C} or {D,E}, both fully consistent, differing
by ₹1,00,000, here are the three probes we tried"* is a materially different
starting point from *"needs review."* Whether any vendor already does this
internally, we cannot know and do not assert.

## 3. The matching problem in the literature

**Subset-sum and its consequences.** Allocating a settlement total to a set of
transactions is subset-sum, which is NP-complete, and — more importantly here —
*densely solvable* at realistic scale. With hundreds of rupee-granular amounts,
many subsets hit any given total. This is precisely why the naive "abstain if a
second subset exists" rule is unworkable and why ASSAY defines ambiguity over the
**evidence-constrained** candidate space instead (`RECONCILIATION_SPEC.md §1`).

**Assignment and matching.** Where reconciliation is one-to-one, it is the
classical assignment problem (Hungarian algorithm, min-cost flow) and is solved
in polynomial time. Real settlement reconciliation is one-to-*many* with side
constraints, which is why ASSAY uses constrained enumeration over small
decomposed components rather than a flow formulation. The decomposition step —
solving per connected component — is a standard technique from constraint
programming and probabilistic graphical models, applied here to make uniqueness
provable at a scale where global uniqueness is meaningless.

**k-best solutions and no-good cuts.** Extracting a second-best solution by
adding a constraint excluding the incumbent and re-solving is standard practice
in integer programming and MaxSAT. ASSAY's use of it is not novel as a technique;
what is novel is the *purpose* — the second-best solution is not a fallback, it
is **the abstention certificate**, the artifact that makes refusal checkable
rather than asserted.

---

## 4. Selective prediction and calibration

ASSAY's evaluation framing comes directly from this literature, and saying so is
part of the credibility argument.

- **Chow's rule** (1970) established the classify-with-reject framework: an
  optimal rejection threshold exists once you price the cost of rejection against
  the cost of error. ASSAY's `net_cost_inr` is Chow's tradeoff denominated in
  rupees, which is why `C_review` must be a declared parameter rather than
  omitted.
- **Risk–coverage curves and AURC** (Geifman & El-Yaniv, selective prediction in
  deep networks) give the standard way to report an abstaining system: never
  accuracy alone, always the joint curve. This is the primary figure in
  `EVALUATION_SPEC.md §5.1`.
- **Calibration** (reliability diagrams, expected calibration error) answers
  whether a confidence number means anything. Reported for the ε-gap component of
  the gate.
- **Conformal prediction** — considered and deliberately rejected as the primary
  mechanism. Conformal methods give distribution-free coverage guarantees over a
  *prediction set*, which is statistically elegant, but the guarantee is
  probabilistic and marginal over a distribution. A finance controller does not
  want "this allocation is in a set that contains the truth 95% of the time";
  they want "here are the two allocations that are consistent with the evidence,
  and I cannot distinguish them." ASSAY's guarantee is **evidential and
  per-case**, not statistical and marginal. Conformal prediction remains a
  reasonable way to calibrate the ε-margin, and is noted as future work.

**Where ASSAY differs from the literature:** selective prediction abstains on
*model uncertainty* — the classifier is unsure. ASSAY abstains on *evidential
underdetermination* — the data admits two answers, and a perfect model would be
equally stuck. These are different quantities, and conflating them is common. The
Ambiguity Oracle exists specifically to measure the second one independently of
any model.

---

## 5. LLM agent security

- **Prompt injection**, direct and indirect (OWASP LLM Top 10, `LLM01`), is the
  governing threat class for any agent reading merchant-controlled text. ASSAY's
  response is architectural rather than behavioural: see `THREAT_MODEL.md §3`.
- **Dual-LLM and capability-restricted patterns** (Willison's dual-LLM proposal;
  Google DeepMind's CaMeL, which uses a privileged planner over a quarantined LLM
  with capability-tagged values) are the design lineage ASSAY sits in. ASSAY is a
  domain-specialised instance: the quarantined model reads untrusted text, the
  privileged path is deterministic code, and the "capability" that untrusted data
  can never acquire is **the ability to express a monetary amount**.
- **LLM-as-judge** literature documents systematic bias when a model evaluates
  outputs. This is why ASSAY's ground truth is generator-constructed and its
  ambiguity labels come from an exhaustive deterministic oracle. No model
  evaluates anything in the scoring path.

---

## 6. Agent evaluation and benchmark integrity

- **Contamination and leakage** discourse around coding and agent benchmarks
  (SWE-bench and successors) established that held-out sets leak through
  pre-training and through developer iteration. Run-time synthetic generation
  from private seeds removes the pre-training vector entirely; the remaining
  vector is developer tuning, which `PREREGISTRATION.md §6.2` targets directly.
- **Pre-registration** is imported from empirical science, where it exists to
  prevent hypothesis-fitting after seeing data. Applying it to a hackathon
  benchmark is unusual and is a deliberate differentiator — with the honest
  caveat that self-enforced pre-registration establishes ordering, not
  incorruptibility (`PREREGISTRATION.md §1`).
- **Ablation as control.** The strongest claim available to a solo project is not
  "we beat other agents" — we would be writing those agents — but "removing this
  component from *our own* system measurably increases financial error." That is
  a controlled experiment; the former is a self-graded exam.

---

## 7. Ledger and audit design

- **Double-entry bookkeeping** is a 500-year-old error-detecting code, and it is
  used here for exactly that: the trial-balance invariant is a cheap, continuous,
  machine-checkable proof that no value was created or destroyed. Most "AI
  finance agent" projects log JSON decisions; posting them as balanced journal
  entries turns the audit trail into an artifact an accountant can verify.
- **Event sourcing and append-only logs** give replay and point-in-time
  reconstruction; balances are projections, never authoritative state.
- **Hash chaining** for tamper-evidence is standard (certificate transparency,
  Git itself). ASSAY's chain binds to the dataset hash at genesis so a report
  cannot later be attached to different inputs. No blockchain, no distributed
  consensus — there is one writer, and the requirement is evidence of tampering,
  not Byzantine agreement. Reaching for a distributed ledger here would be a
  credibility cost, not a gain.
- **TigerBeetle** and similar financial-ledger databases demonstrate the value of
  making double-entry invariants a property of the storage layer rather than of
  application discipline. ASSAY applies the same principle in miniature: the
  ledger package exposes exactly one write path and it accepts only a validated
  decision.

---

## 8. Honest positioning

**What is genuinely novel:** the combination — an evidence-based abstention
certificate (a second-best allocation, produced by a no-good cut, with a
materiality test) validated against an independent exhaustive ambiguity oracle,
inside a reconciliation system whose LLM is structurally incapable of expressing
a monetary amount.

**What is not novel, and should not be claimed as such:** subset-sum matching;
double-entry ledgers; hash chains; risk–coverage curves; second-best extraction
via no-good cuts; quarantined-LLM architecture; pre-registration. Every
individual component is established practice.

**The contribution is the assembly and the measurement**, applied to a domain
where the failure mode — a confident, plausible, wrong allocation — is expensive
and largely unmeasured. Overclaiming novelty on any single component would be
easy to falsify and would cost more credibility than the claim could ever buy.
