/**
 * The frozen contract, transcribed for the oracle.
 *
 * `PREREGISTRATION.md` is **FROZEN on commit** and `DECISION_BRIEF.md §L.4`
 * makes changing any parameter in `§7` a spec amendment. This module is the
 * single place those parameters enter this package: nothing else here may carry
 * a rate, a magnitude, a threshold or a count as a literal. Every constant cites
 * the clause it is transcribed from, so a reviewer checks this file against the
 * specification once rather than auditing the oracle for stray numbers.
 *
 * **Why a transcription rather than an import.** `PREREGISTRATION.md §6.2` `AL1`
 * bars `packages/oracle` from importing `packages/generator`, where the same
 * figures already live as `frozen.ts`. The duplication is deliberate and is the
 * point of the differential design: two independent transcriptions of one
 * written specification, which `§5.3`'s consistency gate then compares. A shared
 * constants module would make the gate compare a value with itself.
 *
 * `packages/domain/src/constraints.decl.ts` holds the constraint *declarations*
 * and is imported, not copied — `§5.2` requires engine and oracle to implement
 * "one declarative specification", and the declaration is that specification.
 * What this file adds is the numeric parameters the declaration states in prose.
 */

/**
 * `C4`'s declared settlement window, in **calendar** days.
 *
 * `RECONCILIATION_SPEC.md §4.1`: "Settlement window: `settled_at − created_at ∈
 * [T_min, T_max]` (declared: 1–7 **calendar** days)". `PREREGISTRATION.md §4.2`
 * repeats it as "Settlement window bound: T_min = 1 day, T_max = 7 days".
 *
 * `[ASSAY-MODEL]` the calendar-day simulation; `[RZP-DOC]` the T+2 cycle it is
 * sized around.
 */
export const SETTLEMENT_WINDOW_DAYS = Object.freeze({ t_min: 1, t_max: 7 } as const);

/** Seconds in one calendar day. `DATA_MODEL.md §0` rule 2 counts epoch seconds. */
export const SECONDS_PER_DAY = 86_400;

/**
 * `C4`'s window in seconds, derived rather than transcribed twice.
 *
 * The measurement convention — elapsed seconds rather than a calendar-date
 * difference — is `conventions.ts` `O-C4-UNIT`. It is a convention because
 * `§4.1` states the unit ("calendar days") and not the measurement.
 */
export const SETTLEMENT_WINDOW_SECONDS = Object.freeze({
  min: SETTLEMENT_WINDOW_DAYS.t_min * SECONDS_PER_DAY,
  max: SETTLEMENT_WINDOW_DAYS.t_max * SECONDS_PER_DAY,
} as const);

/**
 * The oracle's search budget (`PREREGISTRATION.md §5.2`).
 *
 * "Budget `K_oracle = 30`, `C_oracle = 2,000,000`, offline, minutes per
 * component."
 *
 * **`K_oracle` cannot bind under the declared method, and `§5.2` records why**
 * at spec 1.4.3: the oracle enumerates "a fully enumerated space" with "no
 * ordering, no pruning, no early exit", which is `2^K` candidates exactly, and
 * `2^21 = 2_097_152` already exceeds `C_oracle`. `C_oracle` therefore caps a
 * class at 20 members and `K_oracle` is inert. Both are retained here because
 * both are declared, and the enumerator checks both so that a future change to
 * either is honoured without a code change.
 */
export const K_ORACLE = 30;

/** See {@link K_ORACLE}. The binding bound in practice. */
export const C_ORACLE = 2_000_000;

/**
 * `τ`, the materiality threshold (`PREREGISTRATION.md §7`).
 *
 * "`tau (materiality) = max(10_000 paise (₹100.00), 10 bps of component value)`".
 * The base against which the 10 bps is taken is `Component.total_value_paise`,
 * defined at spec 1.4.6 by `DATA_MODEL.md §11` and computed by `components.ts`
 * from `RECONCILIATION_SPEC.md §5`'s decomposition. `conventions.ts`
 * `O-TAU-BASE` records the ratification and what it moved.
 *
 * Neither number below changes. `§7` freezes both the floor and the rate, and
 * the amendment supplied the base they are applied to — not a new magnitude.
 */
export const TAU_FLOOR_PAISE = 10_000;

/** The 10 bps half of `τ`, as an integer basis-point rate (`DATA_MODEL.md §0` rule 5). */
export const TAU_RATE_BPS = 10;

/** Basis-point denominator. One bp is 1e-4 (`§0` rule 5). */
export const BPS_DENOMINATOR = 10_000;

/**
 * The specification version this package is written against.
 *
 * Bumped with the documents, exactly as `packages/generator/src/frozen.ts` does.
 *
 * **1.4.21 -> 1.4.23, and what was re-checked to say so.** Spec 1.4.22 added
 * `RECONCILIATION_SPEC.md §6.2`'s PG-side recon report and
 * `PREREGISTRATION.md §6.2` `AL8`, which bars this package from it; spec 1.4.23
 * added `packages/probe`. Neither touches a constraint, a budget or a label
 * definition, so **no constant in this file moves**. What `AL8` requires of the
 * oracle is an absence, and this package satisfies it the strong way — it
 * performs no I/O at all, so there is no read for `AL8`'s path guard to
 * intercept — with `eslint.config.js` now carrying the ESLint half `AL8` names.
 * `PREREGISTRATION.md §5.1` states why the resulting asymmetry between the
 * oracle's universe and an agent's is deliberate; `§10` V22 records it.
 *
 * **1.4.23 -> 1.4.26, and what was re-checked to say so.** The constant read
 * 1.4.23 while the documents read 1.4.26. Each intervening version, and what it
 * required here:
 *
 *   - **1.4.24 (M38)** — the recon report's row order (`entity_id` ascending),
 *     that unsettled rows are included, and that the offline seal may read the
 *     artifact. `AL8` bars this package from that file, so all three are about a
 *     surface the oracle may not touch. Nothing here moves.
 *   - **1.4.25 (M39, M40)** — `PREREGISTRATION.md §7`'s frozen `A3-NOLLM` probe
 *     priority policy, `DATA_MODEL.md §13`'s fourth certificate reason
 *     `NO_USEFUL_PROBE_AVAILABLE`, and `R3`'s narrowed proposable set. All three
 *     belong to the agent side: this package proposes no probe, reads no
 *     certificate and may not import `packages/engine` (`AL1`). It references
 *     none of those symbols. `§7`'s **numeric** parameters this file transcribes
 *     — `C4`'s window, `τ`'s floor and rate — are untouched by that amendment.
 *   - **1.4.26 (M41)** — a threats-to-validity **disclosure**
 *     (`PREREGISTRATION.md §10` V23): `§H` tier H1's affirmative claim is
 *     withdrawn because `R3`'s choice set is a singleton on the conforming
 *     v1.0.0 population. It withdraws a claim, not a capability, and imposes
 *     nothing on any package. **`PREREGISTRATION.md §5.4`'s ambiguity
 *     definition, `§5.3`'s completeness gate and this package's labels are
 *     entirely unaffected** — the oracle's universe is observations-only and
 *     independent of anything an agent probes (`§5.1`, `§10` V22).
 *
 * **Nothing below moves with it.** `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`,
 * `C_ORACLE`, `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are unchanged; no constraint,
 * budget or label definition changes; `constraint_set_hash` is
 * `packages/domain`'s and is unmodified; and `BENCHMARK_VERSION` (1.0.5) and
 * `GT_VERSION` (1.1.0) live in `packages/generator` and are not restated here.
 *
 * **1.4.26 -> 1.4.27 (M42, M43) — required nothing of this package's logic.** M43
 * names `apps/cli` the executor of `PREREGISTRATION.md §5.3`'s gates and keeps
 * `completeness-gate.ts` **here**, unchanged: it stays a pure function over
 * `OracleTargetResult[]` and the `TrueAllocation[]` its caller derives from
 * `GroundTruth`, so `AL1` and `AL2` hold the strong way — there is no import of
 * `packages/generator` and no read for a path guard to intercept. `AL8` continues to
 * bar the recon report from this package outright, and `§5.3`'s completeness gate
 * *"stays observations-only"*. M42 is an artifact-layout ratification and reaches no
 * module here; the labels this package returns are data, and `apps/cli` writes them.
 *
 * **Nothing below moves with it**: `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`, `C_ORACLE`,
 * `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are unchanged, no constraint, budget or label
 * definition changes, and `BENCHMARK_VERSION` (1.0.6) and `GT_VERSION` (1.1.0) stay
 * `packages/generator`'s.
 *
 * **1.4.27 -> 1.4.28 (M44) — required nothing of this package.** The amendment
 * freezes `PREREGISTRATION.md §5.3`'s **consistency** draw into `§7`; this
 * package owns the **completeness** gate, which reads no sample and draws
 * nothing. `universe.ts`'s `isTargetKind` and `memberContribution` are the two
 * pools the frozen draw cites and are **read, not amended** — `DATA_MODEL.md
 * §11.1`'s member-eligible set is unchanged. `BENCHMARK_VERSION` (1.0.7) and
 * `GT_VERSION` (1.1.0) stay `packages/generator`'s.
 *
 * **1.4.28 -> 1.4.29 (M45-M48) — required nothing of this package.** The
 * amendment settles the seal procedure's lifting condition (M45/M46), agent
 * placement (M47) and the evaluation output surface (M48). None reaches an
 * oracle: this package performs no I/O, enumerates from observations alone, and
 * is not an agent. `assay oracle --split test` is unchanged and still runs
 * labels plus the completeness gate only, `§9` step 3's asymmetry holding
 * exactly as M43 left it. `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`, `C_ORACLE`,
 * `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are unchanged; `BENCHMARK_VERSION`
 * (1.0.7) and `GT_VERSION` (1.1.0) stay `packages/generator`'s.
 *
 * **1.4.29 -> 1.4.30 (M49) — required nothing of this package.** The amendment
 * fixes `DATA_MODEL.md §17.1.1`'s *"the settlement it is allocated to"* as the
 * settlement of the **allocation under evaluation**. That phrase governs a
 * **posting trigger**, and this package posts nothing: `AL8` bars it from the
 * ledger as it bars it from `§6.2`'s probe surface, and the oracle's business is
 * enumeration and labels. `§6`'s materiality is `packages/engine`'s and is
 * **read by no oracle** -- `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are this
 * package's own transcription of `tau` for its labels and are unchanged, as are
 * `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE` and `C_ORACLE`. `DATA_MODEL.md §11.1`'s
 * member-eligible set and `RECONCILIATION_SPEC.md §3`'s anchor semantics -- the
 * two things the clause reasons *about* -- are cited by it and amended by none of
 * it. **`BENCHMARK_VERSION` moves 1.0.7 -> 1.0.8** and `GT_VERSION` (1.1.0)
 * stays; both remain `packages/generator`'s.
 *
 * **1.4.30 -> 1.4.31 (M50) — required nothing of this package.** The amendment
 * settles what `EVALUATION_SPEC.md §3.2`'s `A1-NOVALIDATE` ablation removes:
 * stage `S5`'s **evaluation** of the allocation-scoped invariants `I1`-`I8`. The
 * oracle runs no stage, evaluates no invariant, mints no `ValidatedDecision` and
 * posts nothing -- `DECISION_BRIEF.md §L.1` rule 3 bars it from importing
 * `packages/engine` at all -- so an amendment about which invariants `S5`
 * evaluates for one agent cannot reach it. `§5.1`'s completeness gate and
 * `§5.3`'s differential gate are unchanged and are **not** scoped to an agent;
 * `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`, `C_ORACLE`, `TAU_FLOOR_PAISE` and
 * `TAU_RATE_BPS` are unchanged; `C1`-`C8` are untouched so `constraint_set_hash`
 * does not move. **`BENCHMARK_VERSION` does NOT move, staying 1.0.8**, and
 * `GT_VERSION` stays 1.1.0; both remain `packages/generator`'s.
 *
 * **1.4.31 -> 1.4.32 (M51-M54) -- required nothing of this package, and the reason
 * is a ruling rather than a silence.** M51 fixes the `EVALUATION_SPEC.md §5.3` tau
 * sweep and **rules that the Ambiguity Oracle is NOT re-run at a swept tau**:
 * `RECONCILIATION_SPEC.md §6.1` fixes what that sweep reports -- `coverage_by_value`,
 * `count(AMBIGUOUS)` and `count(IMMATERIALLY_AMBIGUOUS)` -- and all three are read
 * off the engine's stage `S4` and the decisions, never off an oracle label. Tau
 * reaches this package only through `PREREGISTRATION.md §5.4`'s ambiguity definition,
 * which feeds **metric 4**, and metric 4 is not swept. So `oracle_labels.jsonl` is
 * never regenerated, shadowed or overwritten, `BenchmarkManifest.oracle_labels_sha256`
 * stays valid, `AL4`/`AL7`'s aggregate-only rule on the test split is never
 * approached, and **`TAU_FLOOR_PAISE` and `TAU_RATE_BPS` remain this package's
 * transcription of the frozen tau for its own labels and are unchanged** -- the
 * sweep moves the engine's floor, not theirs. M52 (metrics 15/16's populations), M53
 * (metric 17's rate and baseline) and M54 (metric 10 not computable) are the
 * scorer's and reach no oracle. `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE` and `C_ORACLE`
 * are unchanged; `§5.1`'s completeness gate and `§5.3`'s differential gate are
 * unchanged and neither reads tau; `C1`-`C8` are untouched so `constraint_set_hash`
 * does not move. **`BENCHMARK_VERSION` moves 1.0.8 -> 1.0.9** and `GT_VERSION` stays
 * 1.1.0; both remain `packages/generator`'s.
 *
 * **1.4.33 -> (M55) -- required nothing of this package, and the reason is structural
 * rather than incidental.** M55 supplies metric 15's **per-case `balance_harm`**: the
 * `EVALUATION_SPEC.md §4.4(a)` account-level absolute-difference sum with both journal
 * projections restricted to the injected case's own `source_entity_id`, plus the
 * structural zero for a case that posts no line. Every term in it is a **journal**
 * quantity -- the agent's postings on one side, `GroundTruth.true_journal` on the
 * other -- and this package produces neither: it emits `oracle_labels.jsonl` and
 * nothing else. Tau reaches metric **4** through `PREREGISTRATION.md §5.4` and metric
 * 4 is not touched here; metric 15's population is M52's, which is preserved verbatim
 * and is `degradations`-derived rather than label-derived. So `oracle_labels.jsonl` is
 * never regenerated, shadowed or overwritten, `BenchmarkManifest.oracle_labels_sha256`
 * stays valid, and `AL4`/`AL7`'s aggregate-only rule on the test split is never
 * approached. `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`, `C_ORACLE`, `TAU_FLOOR_PAISE` and
 * `TAU_RATE_BPS` are unchanged; `§5.1`'s completeness gate and `§5.3`'s differential
 * gate are unchanged; `C1`-`C8` are untouched so `constraint_set_hash` does not move.
 * **`BENCHMARK_VERSION` moves 1.0.9 -> 1.0.10** and `GT_VERSION` stays 1.1.0; both
 * remain `packages/generator`'s.
 *
 * **1.4.33 -> 1.4.34 (M56) -- required nothing of this package, and the reason is
 * structural rather than incidental.** M56 rules that `PREREGISTRATION.md §6.2` `AL5`
 * is an EMISSION rule, so the SCORER reads `ground_truth.jsonl` at `§9` step 7 under
 * `--sealed` and emits only aggregate metrics. This package is on the OTHER side of
 * that rule and stays there: `AL1` and `AL2` bind `packages/oracle` BY NAME, both are
 * untouched in substance and in wording, and nothing here may read ground truth sealed
 * or not -- `§5.1`'s independence and `§10` V1 rest on exactly that. The `§5.3`
 * completeness gate, which DOES compare oracle output to ground truth, is one of the
 * two readers `§5.3`'s narrowed sentence still names, and it still never runs sealed:
 * `§9` step 3 carries no such flag, and the withdrawal that keeps it that way is now a
 * FLAG REFUSAL on `assay oracle` rather than a read refusal -- stricter, since it
 * cannot be reached by a gate call site that happens to open the file. The gate logic
 * itself does not move and gains no parameter. `oracle_labels.jsonl` is never
 * regenerated, shadowed or overwritten, `BenchmarkManifest.oracle_labels_sha256` stays
 * valid, and `AL4`/`AL7`'s aggregate-only rule on the test split is never approached.
 * Metric 4 scores against the labels this package emits and is one of the few figures
 * the amendment does NOT touch, being oracle-side rather than truth-side.
 * `SETTLEMENT_WINDOW_DAYS`, `K_ORACLE`, `C_ORACLE`, `TAU_FLOOR_PAISE` and
 * `TAU_RATE_BPS` are unchanged; `§5.1`'s completeness gate and `§5.3`'s differential
 * gate are unchanged; `C1`-`C8` are untouched so `constraint_set_hash` does not move.
 * **`BENCHMARK_VERSION` moves 1.0.10 -> 1.0.11** and `GT_VERSION` stays 1.1.0; both
 * remain `packages/generator`'s.
 *
 * **1.4.34 -> 1.4.35 (M57) -- required nothing of this package, and the reason is that
 * the metric it settles is truth-side rather than oracle-side.** M57 supplies
 * `EVALUATION_SPEC.md §4.6`'s missing correctness semantics for metric 7 `ece`: the
 * population is `RECONCILIATION_SPEC.md §6` step 3's DISCRIMINATED branch, the binned
 * prediction is that decision's ε-gap `Δs`, one committed decision is one prediction,
 * and a decision is correct iff its asserted allocation equals ground truth's for the
 * same target. Nothing there is this package's: `§6` is the ENGINE's gate, `Δs` is the
 * engine's own quantity, and the correctness side reads `GroundTruth` through the
 * scorer's projection. **Metric 4 -- the one figure this package's labels decide --
 * is untouched**, `abstention_precision`/`_recall` scoring against
 * `oracle_labels.jsonl` on `§5.4`'s ambiguity definition, which does not move; and the
 * `§5.3` τ sweep still does not re-run the oracle. `SETTLEMENT_WINDOW_DAYS`,
 * `K_ORACLE`, `C_ORACLE`, `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are unchanged; `§5.1`'s
 * completeness gate and `§5.3`'s differential gate are unchanged; `C1`-`C8` are
 * untouched so `constraint_set_hash` does not move. **`BENCHMARK_VERSION` moves
 * 1.0.11 -> 1.0.12** and `GT_VERSION` stays 1.1.0; both remain `packages/generator`'s.
 *
 * **1.4.35 -> 1.4.36 (M58) -- required nothing of this package, and the reason is that
 * the figure it settles is an AGENT-OUTPUT measurement rather than an oracle label.**
 * M58 ratifies metric 17's baseline encoding -- `mean_bps`/`stddev_bps` as integer
 * basis points, full-precision inputs, `round_half_up` with ties away from zero applied
 * ONCE at the end of `PREREGISTRATION.md §9` step 0, the two figures rounded
 * INDEPENDENTLY, and the detector reading the ROUNDED pair against a FULL-PRECISION
 * rate -- and the record relationship, `§7` being authoritative and
 * `packages/eval/src/frozen.ts`'s `METRIC_17_BASELINE` its executable transcription.
 * Nothing there is this package's: `abstention_rate_by_value` is computed from agent
 * output over the `recon_line` universe and consults NO oracle label, and `§9` step 0
 * is a NON-SCORED pass this package takes no part in. **Metric 4 -- the one figure this
 * package's labels decide -- is untouched**, `abstention_precision`/`_recall` scoring
 * against `oracle_labels.jsonl` on `§5.4`'s ambiguity definition, which does not move.
 * `TAU_RATE_BPS` and `TAU_FLOOR_PAISE` are the other basis-point quantities here and
 * M58 does NOT reach them: its rounding rule is scoped to metric 17's baseline pair
 * alone and is expressly not a corpus-wide rounding claim. `SETTLEMENT_WINDOW_DAYS`,
 * `K_ORACLE`, `C_ORACLE`, `TAU_FLOOR_PAISE` and `TAU_RATE_BPS` are unchanged; `§5.1`'s
 * completeness gate and `§5.3`'s differential gate are unchanged; `C1`-`C8` are
 * untouched so `constraint_set_hash` does not move. **`BENCHMARK_VERSION` moves
 * 1.0.12 -> 1.0.13** and `GT_VERSION` stays 1.1.0; both remain `packages/generator`'s.
 *
 * **1.4.36 -> 1.4.37 (M59) -- required nothing of this package, though it CITES this
 * package's behaviour as the reason its figure is what it is.** `§9` step 0 has been
 * taken and returned `(0, 0)` for all five `offline` Tier-0 keys. `PREREGISTRATION.md
 * §10` **V17** already recorded WHY, before the seal: every DEV settlement is fully
 * `AN1`-anchored because `F08`'s `DROP_SETTLEMENT_ID` is the only operator detaching a
 * line from its batch identifier and `F08` is TEST-ONLY, so `enumerate.ts`'s candidate
 * search runs on no DEV target -- *"the completeness gate passes on DEV without ever
 * enumerating a candidate"* -- and `classify.ts` therefore emits no
 * `TRULY_AMBIGUOUS` or `IMMATERIALLY_AMBIGUOUS` label on DEV. **That is V17 being
 * observed, not a new property**, and M59 records the consequence for metric 17
 * rather than changing anything here. `unanchoredMembers`'s `settlement_id === null`
 * test, `§3`'s anchor rule, `classify`'s five-value `AmbiguityLabel` vocabulary,
 * `tauFor`, `TAU_RATE_BPS`, `TAU_FLOOR_PAISE`, `K_ORACLE`, `C_ORACLE`,
 * `SETTLEMENT_WINDOW_DAYS`, `§5.1`'s completeness gate and `§5.3`'s differential gate
 * are all **unchanged**; `C1`-`C8` are untouched so `constraint_set_hash` does not
 * move. **Metric 4 -- the one figure this package's labels decide -- is untouched.**
 * `BENCHMARK_VERSION` STAYS **1.0.13** and `GT_VERSION` stays 1.1.0; both remain
 * `packages/generator`'s. The existing `bench/dev` oracle gates and labels are `§9`
 * step 0's evidence and are **not** re-derived; each gate's `spec_version` stamp
 * records the version under which the gate RAN and correctly reads `1.4.36`.
 */
export const SPEC_VERSION = "1.4.37";
