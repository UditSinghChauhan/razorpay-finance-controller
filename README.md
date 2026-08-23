# ASSAY

A settlement reconciliation controller for Razorpay-shaped payment data.
Razorpay AI Buildathon 2026 — **Track 04: AI Finance Controller**.

> **Status: SPECIFICATION PHASE. No application code exists yet.**

ASSAY reconciles three independent views of the same money — the payment
gateway's recon report, the bank statement, and the merchant's own ledger —
posts every decision into a hash-chained double-entry shadow ledger, and
**abstains with a machine-checkable certificate** whenever the available
evidence does not uniquely determine the correct allocation.

## Read the specification in this order

| # | Document | What it settles |
|---|----------|-----------------|
| 0 | [`docs/DECISION_BRIEF.md`](docs/DECISION_BRIEF.md) | Verdict, locked scope, risks, build order. **Start here.** |
| 1 | [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) | Product, users, workflow, non-goals, track alignment |
| 2 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, data flow, trust boundaries |
| 3 | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Every entity and its exact schema |
| 4 | [`docs/RECONCILIATION_SPEC.md`](docs/RECONCILIATION_SPEC.md) | The matching algorithm and abstention rules |
| 5 | [`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md) | Frozen benchmark methodology. **Signed before results exist.** |
| 6 | [`docs/EVALUATION_SPEC.md`](docs/EVALUATION_SPEC.md) | Metrics, baselines, ablations, reporting |
| 7 | [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | Attacker model and mitigations |
| 8 | [`docs/RELATED_WORK.md`](docs/RELATED_WORK.md) | Prior art and where ASSAY actually differs |

## Data provenance

**ASSAY's benchmark is synthetic.** Razorpay Test Mode exposes the settlement and
recon endpoints but contains no settlement records (`count: 0`), so no real
settlement data was used or could be used. Real API contracts and real test-mode
objects were used to calibrate the schema, arithmetic and identifier grammars of
a programmatically generated financial universe. No external validity is claimed
— see `docs/PREREGISTRATION.md §2` and §10.

## Schedule

Tier-0 scope (`docs/DECISION_BRIEF.md §C`) is frozen for **31 August 2026**.
Benchmark seal and sealed run: **1 September**. Submission: **5 September**.

## Credentials

API keys live in `.env`, which is gitignored. They are never written into source,
documentation, prompts, fixtures, or commit history. This repository stays
private.

Consumer AI subscriptions (Claude Pro, ChatGPT Go, Google AI Pro and equivalents)
are **not** API credentials and are never used as such. The only supported live
path is a metered API key; the default `offline` provider needs none.
