import type { InvariantId, ObservationId, Sha256 } from "@assay/domain";
import type {
  AmbiguityCertificate,
  DecisionId,
  EvidenceId,
  JournalLine,
  ValidatedDecision,
} from "@assay/ledger";
import type { DecisionState } from "@assay/ledger";

import type { Member } from "./s2-candidates.js";

/**
 * Stage `S5` — the deterministic validation gate (`RECONCILIATION_SPEC.md §7`).
 *
 * *"This is the only code path that may post to the ledger. Its input is a
 * proposed allocation; its output is either a `ValidatedDecision` or a
 * rejection. **Nothing else in the system can construct a
 * `ValidatedDecision`.**"*
 *
 * `§7`'s failure semantics are absolute: *"**any** invariant failure rejects the
 * allocation. It is never partially posted, never repaired, never downgraded to
 * a warning."* So `validate` returns a discriminated union — a caller cannot
 * reach the branded value without going through the `valid: true` arm.
 *
 * **This module adds no persistence.** It writes nothing, opens nothing and
 * mutates no ledger structure; it produces a value the ledger's write path will
 * later accept. `ARCHITECTURE.md §4` boundary 3 puts the write path in
 * `packages/ledger`, and `DECISION_BRIEF.md §L.2` keeps `journal.ts` a pure
 * posting function that is `S5`'s dependency rather than its dependent.
 */

/**
 * `§7`'s nine, minus the one this stage cannot evaluate.
 *
 * **`I9` is a run-level property, not an allocation-level one.** Its text is
 * *"re-running the same input yields an identical ledger root hash"* — a
 * statement about **two executions of the whole system**, which a gate holding
 * one proposed allocation cannot evaluate. `§7` already contemplates invariants
 * whose manifestation is run-scoped: it says `I1` *"failing at close is a hard
 * abort of the whole run"*. `I9` is therefore checked by `checkIdempotency`
 * below, at its own scope, and appears in a decision's `invariants_checked`
 * **only when the caller supplies both root hashes**. It is never silently
 * reported as checked. See this package's README.
 */
const ALLOCATION_SCOPED: readonly InvariantId[] = [
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
  "I7",
  "I8",
];

/**
 * Which allocation-scoped invariants this stage evaluates — spec 1.4.31,
 * register row `DATA_MODEL.md §22.2` **M50**.
 *
 * **Two selections exist and no third is representable.** `"ALLOCATION_SCOPED"`
 * is {@link ALLOCATION_SCOPED} — `I1`–`I8`, the full set — and is what every
 * caller gets by omitting the field. `"NONE_A1_NOVALIDATE"` is the **empty**
 * set, and exists for exactly one agent: `EVALUATION_SPEC.md §3.2`'s
 * `A1-NOVALIDATE`, whose removed component is *"stage `S5`'s **evaluation** of
 * the allocation-scoped invariants `I1`–`I8`"*.
 *
 * **This is not a general bypass, in three independent respects.** It is a
 * closed union rather than an invariant list, so a caller cannot remove `I6`
 * alone or keep a favourable subset — the only alternative to the full set is
 * *nothing*, which is the one thing `§3.2` licenses and the one thing a reader
 * can check at a glance. The `"NONE_A1_NOVALIDATE"` literal is banned by
 * `eslint.config.js` everywhere except `apps/cli/src/agents/a1.ts`, which is the
 * path-allowlist mechanism `DECISION_BRIEF.md §L.1` rules 3 and 4 already use
 * and which `§L.1` rule 4's M50 clause requires here. And nothing about the
 * **mint** moves: `validate()` still returns a branded {@link ValidatedDecision}
 * only through the single widening assertion below, `packages/ledger` still
 * exports no constructor, and `postValidatedDecision` is still the one write
 * path.
 *
 * **`invariants_failed` stays honest under either selection.** Under
 * `"NONE_A1_NOVALIDATE"` a decision records `invariants_checked: []` and
 * `invariants_failed: []`, the second empty **because nothing was evaluated
 * rather than because nothing failed** — the pair is what makes the removal
 * visible in the artifact, and it is why gate `G5` keeps its meaning
 * (`RECONCILIATION_SPEC.md §10.1`, clarified at spec 1.4.31). The rejected
 * reading — evaluate the invariants and post the failures anyway — is not
 * expressible here: an evaluated failure lands in `invariants_failed` and `G5`
 * refuses it at the write path and again at close.
 *
 * **`I9` is outside this selection entirely.** It is run-scoped and is folded in
 * *"only when the caller supplies both root hashes"* (`§7`), which is a property
 * of {@link ValidationInput.idempotency} and not of this field. Selecting
 * `"NONE_A1_NOVALIDATE"` neither adds nor removes it.
 */
export type InvariantSelection = "ALLOCATION_SCOPED" | "NONE_A1_NOVALIDATE";

/** `DATA_MODEL.md §0` rule 5's canonical order for reporting: `I1`..`I9`. */
const INVARIANT_ORDER: readonly InvariantId[] = [
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
  "I7",
  "I8",
  "I9",
];

/**
 * Everything `§7`'s gate reads about one proposed allocation.
 *
 * Each field exists because a named invariant needs it; nothing is here for
 * convenience. Where an invariant's comparand is genuinely absent the field is
 * `null` and the invariant is **not checked** rather than assumed satisfied —
 * `DATA_MODEL.md §17.1.1` states that rule explicitly for `I5`: *"`I5` is
 * undefined — not satisfied — when no bank-line mapping exists."*
 */
export interface ValidationInput {
  readonly decision_id: DecisionId;
  readonly type: DecisionState;
  readonly journal_lines: readonly JournalLine[];
  /** The proposed allocation's members. Empty for a decision that allocates nothing. */
  readonly members: readonly Member[];
  /** `I4`: the target settlement's own `amount`. `null` where the decision has no settlement target. */
  readonly target_amount_paise: number | null;
  /** `I5`: `Σ settlement.amount` mapped to a bank line, and that line's amount. `null` ⇒ not checked. */
  readonly bank_tie_out: {
    readonly settlement_total_paise: number;
    readonly bank_line_amount_paise: number;
  } | null;
  /** `I6`: every id the decision references. */
  readonly referenced_ids: readonly string[];
  /** `I6`: the observation set's ids — an id outside this is a hallucination. */
  readonly observation_entity_ids: ReadonlySet<string>;
  /** `I2`: entity ids already committed to an accepted allocation earlier in the run. */
  readonly already_allocated_entity_ids: ReadonlySet<string>;
  /** `I9`: two root hashes from two executions over identical input. `null` ⇒ not checked. */
  readonly idempotency: {
    readonly first_root_hash: Sha256;
    readonly second_root_hash: Sha256;
  } | null;
  /**
   * Which allocation-scoped invariants to evaluate (spec 1.4.31, M50).
   *
   * **Omit it.** Absent — as it is on every caller but one — the full set
   * `I1`–`I8` is evaluated, which is `RECONCILIATION_SPEC.md §7`'s gate
   * unchanged. See {@link InvariantSelection} for the one agent that supplies it
   * and for why the alternative is *nothing* rather than a subset.
   */
  readonly invariant_selection?: InvariantSelection;
  readonly subject_obs_ids: readonly ObservationId[];
  readonly evidence_ids: readonly EvidenceId[];
  /** `§6`: non-null exactly when the decision abstains. */
  readonly certificate: AmbiguityCertificate | null;
  readonly inputs_hash: Sha256;
}

/** One invariant's verdict, kept separate so a failure names itself. */
export interface InvariantOutcome {
  readonly id: InvariantId;
  readonly checked: boolean;
  readonly passed: boolean;
  /** Why, when it failed or could not be checked. */
  readonly detail: string | null;
}

export type ValidationResult =
  | {
      readonly valid: true;
      readonly decision: ValidatedDecision;
      readonly outcomes: readonly InvariantOutcome[];
    }
  | {
      readonly valid: false;
      /** `§7`: *"The rejected allocation becomes an exception carrying `invariants_failed`."* */
      readonly invariants_checked: readonly InvariantId[];
      readonly invariants_failed: readonly InvariantId[];
      readonly outcomes: readonly InvariantOutcome[];
      readonly rejection: string;
    };

// ---------------------------------------------------------------------------
// The nine, one function each
// ---------------------------------------------------------------------------
//
// Deliberately not fused. §7 requires a rejected allocation to carry
// `invariants_failed`, which is only possible if each predicate reports itself.

const pass = (id: InvariantId): InvariantOutcome => ({
  id,
  checked: true,
  passed: true,
  detail: null,
});
const fail = (id: InvariantId, detail: string): InvariantOutcome => ({
  id,
  checked: true,
  passed: false,
  detail,
});
const skip = (id: InvariantId, detail: string): InvariantOutcome => ({
  id,
  checked: false,
  passed: true,
  detail,
});

/** `I1` — trial balance: `Σ dr = Σ cr` across posted journal lines. */
function i1(lines: readonly JournalLine[]): InvariantOutcome {
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    dr += l.dr_paise;
    cr += l.cr_paise;
  }
  return dr === cr
    ? pass("I1")
    : fail("I1", `trial balance: Σdr ${String(dr)} ≠ Σcr ${String(cr)}`);
}

/** `I2` — no double allocation: each `entity_id` in at most one accepted allocation across the run. */
function i2(
  members: readonly Member[],
  already: ReadonlySet<string>,
): InvariantOutcome {
  const seen = new Set<string>();
  for (const m of members) {
    const id = m.payload.entity_id;
    if (already.has(id)) return fail("I2", `${id} already in an accepted allocation`);
    if (seen.has(id)) return fail("I2", `${id} appears twice in this allocation`);
    seen.add(id);
  }
  return pass("I2");
}

/**
 * `I3` — line arithmetic: `credit = amount − fee` for payments (`fee`
 * GST-inclusive), `debit = amount` for refunds.
 *
 * `§7` names the two types `§6`'s union carries an identity for. It states none
 * for an `adjustment` row — `DATA_MODEL.md §14.1` says so in terms, *"`I3`
 * declares no `amount` identity for adjustment rows"* — so an adjustment member
 * contributes no `I3` obligation and the invariant is not evaluated on one.
 */
function i3(members: readonly Member[]): InvariantOutcome {
  let evaluated = false;
  for (const m of members) {
    const p = m.payload;
    if (p.type === "payment") {
      evaluated = true;
      if (p.credit !== p.amount - p.fee) {
        return fail(
          "I3",
          `${p.entity_id}: credit ${String(p.credit)} ≠ amount ${String(p.amount)} − fee ${String(p.fee)}`,
        );
      }
    } else if (p.type === "refund") {
      evaluated = true;
      if (p.debit !== p.amount) {
        return fail(
          "I3",
          `${p.entity_id}: debit ${String(p.debit)} ≠ amount ${String(p.amount)}`,
        );
      }
    }
  }
  return evaluated ? pass("I3") : skip("I3", "no payment or refund line to evaluate");
}

/** `I4` — settlement closure: `settlement.amount = Σ credit − Σ debit` over its allocated lines. */
function i4(
  members: readonly Member[],
  targetAmount: number | null,
): InvariantOutcome {
  if (targetAmount === null) return skip("I4", "no settlement target in scope");
  let credit = 0;
  let debit = 0;
  for (const m of members) {
    credit += m.payload.credit;
    debit += m.payload.debit;
  }
  return credit - debit === targetAmount
    ? pass("I4")
    : fail(
        "I4",
        `settlement closure: Σcredit − Σdebit ${String(credit - debit)} ≠ amount ${String(targetAmount)}`,
      );
}

/**
 * `I5` — bank tie-out: `Σ settlement.amount` mapped to a bank line
 * `= bank_line.amount`.
 *
 * **Undefined, not satisfied, when no mapping exists** — `DATA_MODEL.md
 * §17.1.1` states this and gives the reason: *"With no mapping there is no
 * right-hand side, so the comparison has no truth value"*, and the permissive
 * reading *"produces exactly the failure `I5` names in its own purpose column —
 * 'Claiming money arrived that did not.'"* So it is skipped, never passed by
 * default.
 */
function i5(
  tieOut: ValidationInput["bank_tie_out"],
): InvariantOutcome {
  if (tieOut === null) return skip("I5", "no bank-line mapping; I5 is undefined");
  return tieOut.settlement_total_paise === tieOut.bank_line_amount_paise
    ? pass("I5")
    : fail(
        "I5",
        `bank tie-out: Σsettlement ${String(tieOut.settlement_total_paise)} ≠ bank line ${String(tieOut.bank_line_amount_paise)}`,
      );
}

/**
 * `I6` — referential integrity: every referenced ID exists in the observation
 * set.
 *
 * `§7`: *"the structural answer to hallucinated transaction IDs ... The defence
 * does not depend on the model behaving."*
 */
function i6(
  referenced: readonly string[],
  observed: ReadonlySet<string>,
): InvariantOutcome {
  if (referenced.length === 0) return skip("I6", "no referenced ids");
  for (const id of [...referenced].sort()) {
    if (!observed.has(id)) return fail("I6", `${id} is not in the observation set`);
  }
  return pass("I6");
}

/**
 * `I7` — range and sign: no negative fee or tax; no allocated amount exceeding
 * the observed amount; no `Paise` outside safe-integer range.
 */
function i7(members: readonly Member[], lines: readonly JournalLine[]): InvariantOutcome {
  const safe = (n: number, what: string): string | null =>
    Number.isSafeInteger(n) ? null : `${what} ${String(n)} is outside safe-integer range`;

  for (const m of members) {
    const p = m.payload;
    if (p.fee < 0) return fail("I7", `${p.entity_id}: negative fee ${String(p.fee)}`);
    if (p.tax < 0) return fail("I7", `${p.entity_id}: negative tax ${String(p.tax)}`);
    if (p.credit > p.amount) {
      return fail(
        "I7",
        `${p.entity_id}: allocated credit ${String(p.credit)} exceeds observed amount ${String(p.amount)}`,
      );
    }
    if (p.debit > p.amount) {
      return fail(
        "I7",
        `${p.entity_id}: allocated debit ${String(p.debit)} exceeds observed amount ${String(p.amount)}`,
      );
    }
    for (const [n, what] of [
      [p.amount, "amount"],
      [p.credit, "credit"],
      [p.debit, "debit"],
      [p.fee, "fee"],
      [p.tax, "tax"],
    ] as const) {
      const bad = safe(n, `${p.entity_id}: ${what}`);
      if (bad !== null) return fail("I7", bad);
    }
  }
  for (const l of lines) {
    if (l.dr_paise < 0 || l.cr_paise < 0) {
      return fail("I7", `${l.source_entity_id}: negative journal leg`);
    }
    const bad =
      safe(l.dr_paise, `${l.source_entity_id}: dr`) ??
      safe(l.cr_paise, `${l.source_entity_id}: cr`);
    if (bad !== null) return fail("I7", bad);
  }
  return pass("I7");
}

/**
 * `I8` — temporal: no settlement dated before its constituent captures.
 *
 * `DATA_MODEL.md §6` makes `settled_at` *"the instant at which the settlement
 * that carried this line transferred"*, so the settlement's date is read off the
 * members themselves. A member whose `settled_at` is null carries no settlement
 * instant and cannot be part of an accepted allocation anyway (spec 1.4.2).
 */
function i8(members: readonly Member[]): InvariantOutcome {
  let evaluated = false;
  for (const m of members) {
    const settledAt = m.payload.settled_at;
    if (settledAt === null) {
      return fail("I8", `${m.payload.entity_id}: no settlement instant`);
    }
    evaluated = true;
    if (settledAt < m.payload.created_at) {
      return fail(
        "I8",
        `${m.payload.entity_id}: settled_at ${String(settledAt)} precedes capture ${String(m.payload.created_at)}`,
      );
    }
  }
  return evaluated ? pass("I8") : skip("I8", "no members to evaluate");
}

/**
 * `I9` — idempotency: *"re-running the same input yields an identical ledger
 * root hash"*.
 *
 * A **run-level** property, evaluable only from two executions. Exposed
 * separately for that reason, and folded into a decision's
 * `invariants_checked` only when the caller supplies both hashes.
 */
export function checkIdempotency(first: Sha256, second: Sha256): InvariantOutcome {
  return first === second
    ? pass("I9")
    : fail("I9", "two runs over identical input produced different root hashes");
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Run `§7`'s gate over one proposed allocation.
 *
 * Every invariant is evaluated — the gate does not short-circuit — so a
 * rejection names **every** invariant that failed rather than the first.
 * `§7` requires the rejected allocation to carry `invariants_failed`, and a
 * partial list would understate what is wrong with it.
 *
 * *"Every invariant"* means every invariant in the **selected** set, which is
 * the full `I1`–`I8` unless `input.invariant_selection` says otherwise (spec
 * 1.4.31, M50 — see {@link InvariantSelection}). The predicates below are
 * unchanged and unreachable by that field: it decides **whether they run**, not
 * what any of them means, and a selected invariant that fails still rejects the
 * allocation on `§7`'s absolute terms.
 */
export function validate(input: ValidationInput): ValidationResult {
  // M50: the whole of the selection's effect. `ALLOCATION_SCOPED` is the default
  // and is what every caller but `A1-NOVALIDATE` gets, because the field is
  // optional and absent. The empty arm evaluates nothing rather than evaluating
  // and discarding, which is the distinction the register row turns on: a
  // discarded failure would have to be recorded somewhere or suppressed, and
  // both are barred (`RECONCILIATION_SPEC.md §10.1` G5, `THREAT_MODEL.md §T8`).
  const outcomes: InvariantOutcome[] =
    (input.invariant_selection ?? "ALLOCATION_SCOPED") === "NONE_A1_NOVALIDATE"
      ? []
      : [
          i1(input.journal_lines),
          i2(input.members, input.already_allocated_entity_ids),
          i3(input.members),
          i4(input.members, input.target_amount_paise),
          i5(input.bank_tie_out),
          i6(input.referenced_ids, input.observation_entity_ids),
          i7(input.members, input.journal_lines),
          i8(input.members),
        ];
  if (input.idempotency !== null) {
    outcomes.push(
      checkIdempotency(
        input.idempotency.first_root_hash,
        input.idempotency.second_root_hash,
      ),
    );
  }

  const order = (id: InvariantId): number => INVARIANT_ORDER.indexOf(id);
  const checked = outcomes
    .filter((o) => o.checked)
    .map((o) => o.id)
    .sort((a, b) => order(a) - order(b));
  const failed = outcomes
    .filter((o) => o.checked && !o.passed)
    .map((o) => o.id)
    .sort((a, b) => order(a) - order(b));

  // §6: the certificate is the abstention. A decision that abstains must carry
  // one and a decision that does not must not — checked here because S5 is the
  // last gate before the value becomes unforgeable.
  const abstains = input.type === "ABSTAINED";
  if (abstains !== (input.certificate !== null)) {
    return {
      valid: false,
      invariants_checked: Object.freeze(checked),
      invariants_failed: Object.freeze(failed),
      outcomes: Object.freeze(outcomes),
      rejection: abstains
        ? "ABSTAINED decision carries no AmbiguityCertificate"
        : `${input.type} decision carries an AmbiguityCertificate`,
    };
  }

  if (failed.length > 0) {
    // §7: "any invariant failure rejects the allocation. It is never partially
    // posted, never repaired, never downgraded to a warning."
    return {
      valid: false,
      invariants_checked: Object.freeze(checked),
      invariants_failed: Object.freeze(failed),
      outcomes: Object.freeze(outcomes),
      rejection: `invariant failure: ${failed.join(", ")}`,
    };
  }

  const draft = {
    decision_id: input.decision_id,
    type: input.type,
    journal_lines: Object.freeze([...input.journal_lines]),
    invariants_checked: Object.freeze(checked),
    invariants_failed: Object.freeze([] as InvariantId[]),
    subject_obs_ids: Object.freeze([...input.subject_obs_ids]),
    evidence_ids: Object.freeze([...input.evidence_ids]),
    certificate: input.certificate,
    inputs_hash: input.inputs_hash,
  };

  // ---------------------------------------------------------------------
  // THE SINGLE WIDENING ASSERTION.
  //
  // `ARCHITECTURE.md §4` boundary 3: TypeScript is structurally typed, so
  // "only S5 may construct" cannot be a runtime property. The enforcement is
  // the NON-EXPORTED unique-symbol brand in
  // packages/ledger/src/validated-decision.ts, plus exactly one widening
  // assertion, here, and `DECISION_BRIEF.md §L.1` rule 4 permits precisely
  // one. It is reached only after every checked invariant passed and the
  // certificate/abstention agreement holds; there is no other path to the
  // branded type in this package, and no constructor is exported from either.
  // ---------------------------------------------------------------------
  const decision = draft as unknown as ValidatedDecision;

  return { valid: true, decision, outcomes: Object.freeze(outcomes) };
}

/** The invariants this stage evaluates per allocation — `I1`–`I8`. */
export const ALLOCATION_SCOPED_INVARIANTS = Object.freeze(ALLOCATION_SCOPED);
