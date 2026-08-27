/**
 * The convention register — every decision this generator had to make that the
 * frozen specification does not state.
 *
 * `PREREGISTRATION.md §4.2` establishes the pattern: where the specification
 * states no value it declares one, in the open, with its basis — "Both are
 * `[ASSAY-MODEL]` and are stated once here rather than re-argued at each site."
 * A generator cannot run on a specification alone; it needs a filename, an
 * emission order, a string for a merchant memo. This module is where those land,
 * so that they are **countable** rather than scattered through the code as
 * literals nobody registered.
 *
 * Two classes, and the difference is the whole point:
 *
 *   - `spec_basis` is a citation — the specification determines the value and
 *     this row records where the generator read it from.
 *   - `spec_basis` is `null` — **the specification determines nothing here.**
 *     The value below is this package's own choice, made to get a running
 *     generator, and it is **awaiting ratification**. `UNRATIFIED` collects
 *     them and a test pins the count, so a new unratified parameter cannot be
 *     added without the pin failing and a human being told.
 *
 * `DECISION_BRIEF.md §L.4` makes inventing a rule the specification does not
 * carry a spec amendment. Nothing here changes a declared value; every row
 * supplies one where none exists. That distinction is what makes this a
 * register rather than an amendment.
 */

/** One decision, its basis, and why it had to be made. */
export interface Convention {
  readonly id: string;
  readonly subject: string;
  readonly decision: string;
  /** A specification clause, or `null` when the specification states nothing. */
  readonly spec_basis: string | null;
  readonly why: string;
}

export const CONVENTIONS: readonly Convention[] = Object.freeze([
  // --- ratified: the specification determines these ------------------------
  {
    id: "C-CAPTURE-DAYS",
    subject: "Allocation of captures across the 31 capture days",
    decision:
      "Balanced: floor(N/31) per day with the remainder handed to the lowest " +
      "day indices, the same first-k rule @assay/money's split() uses.",
    spec_basis: "PREREGISTRATION.md §4.1 (K_max derivation) and §4.2 (capture window)",
    why:
      "§4.1's own feasibility argument requires it: 'K_max = 22 binds at " +
      "P = 689, where the settlement batch reaches 20.0 per day' is only true " +
      "of an even allocation — 620/31 = 20.0 exactly. Any other allocation " +
      "makes the frozen driver's justification false.",
  },
  {
    id: "C-CYCLE-EXACT",
    subject: "Settlement cycle mix realization",
    decision:
      "T+1 and T+3 counts are roundHalfUp(rate x 31) = 3 and 5; the remaining " +
      "23 batches take the T+2 default. Which batches is seed-drawn.",
    spec_basis: "PREREGISTRATION.md §4.1 rate realization",
    why:
      "'Every rate in §4.2 is a proportion of its stated denominator and is " +
      "realized exactly, rounded half-up, per family instance.' The denominator " +
      "is 'batches', which is S = 31.",
  },
  {
    id: "C-MIX-DRAWN",
    subject: "Categorical mixes (method, card network, card type, dispute status, adjustment reason)",
    decision:
      "Drawn per entity from the family sub-stream, not realized as exact counts.",
    spec_basis: "PREREGISTRATION.md §4.1 rate realization",
    why:
      "The same clause that fixes counts cedes these to the seed: 'The seed " +
      "governs which entities carry a refund, a dispute or an adjustment, and " +
      "their amounts, METHODS and timing — never how many.' Exact realization " +
      "is impossible here anyway: roundHalfUp(0.20 x 659) = 132 per method " +
      "sums to 660, not 659.",
  },
  {
    id: "C-P8-TRUTH",
    subject: "Truth-side adjustment postings",
    decision:
      "true_journal takes DATA_MODEL.md §17.2's FIVE-WAY truth branch, not the " +
      "agent-side universal P8. @assay/ledger's journalFor() is not called.",
    spec_basis: "DATA_MODEL.md §1 and §17.2 (truth side table)",
    why:
      "'Truth posts from omniscience; ASSAY posts from evidence.' journalFor() " +
      "implements the agent side and would post P8 for a fee_correction that " +
      "truth books to 5100/1200.",
  },

  {
    id: "C-NEGATIVE-BATCH",
    subject: "A capture-day batch whose refund debits exceed its credits",
    decision:
      "Debit-side members are admitted to their own batch in ascending amount, " +
      "ties broken by the member's own index, while the running net stays " +
      "non-negative. A member the batch cannot carry is emitted UNSETTLED: " +
      "settlement_id, settled_at and settlement_utr null, settled false, " +
      "created_at and amount unchanged. It is never moved to another batch. " +
      "No observation is added or removed, so every target_record_count is " +
      "unchanged. There is no policy parameter.",
    spec_basis: "PREREGISTRATION.md §4.2 (batch composition, ratified at spec 1.4.2)",
    why:
      "Four frozen rules are jointly unsatisfiable on some capture-days: " +
      "Settlement.amount is a non-negative paiseField (ARCHITECTURE.md §4); I4 " +
      "fixes settlement.amount = Sigma credit - Sigma debit over allocated " +
      "lines; I3 enters a refund into that sum as a debit; and §4.1's " +
      "one-batch-per-capture-day meets §4.2's 4.5% refund rate and its " +
      "heavy-tailed amount distribution. Through spec 1.4.1 this was the one " +
      "BLOCKING seam in this register and simulate() refused by default, " +
      "because choosing a resolution was a specification decision. Spec 1.4.2 " +
      "supplied the rule; the row is retained with its history rather than " +
      "deleted, because the ordering — refuse until ratified, never guess — is " +
      "the point.",
  },

  // --- UNRATIFIED: the specification states nothing -------------------------
  {
    id: "U-ISSUER-SET",
    subject: "card_issuer value set",
    decision:
      "Uniform over the four codes HDFC, ICIC, SBIN, UTIB (RBI/IFSC bank " +
      "prefixes, four characters as DATA_MODEL.md §6 requires).",
    spec_basis: null,
    why:
      "PREREGISTRATION.md §4.2 says 'issuer uniform over a DECLARED 4-character " +
      "code set' and NO SUCH SET IS DECLARED anywhere in the specification. " +
      "card_issuer is a nullable string in the schema, so any four characters " +
      "parse; the set had to be chosen to run.",
  },
  {
    id: "U-AMOUNT-DISCRETIZATION",
    subject: "Realization of the log-normal amount distribution",
    decision:
      "A committed 2048-atom midpoint quantile table in integer paise, drawn " +
      "uniformly. Support [126, 271978752] paise. No transcendental function " +
      "is evaluated at run time.",
    spec_basis: null,
    why:
      "§4.2 declares the distribution and its two parameters but not how a " +
      "continuous distribution becomes integer paise. Math.exp and Math.log are " +
      "NOT correctly-rounded in ECMAScript, so computing quantiles at run time " +
      "would let a Node upgrade silently change the benchmark — the exact drift " +
      "ARCHITECTURE.md §11 vendors the PRNG to avoid. The table's discrete " +
      "median and p99 are asserted against the two frozen parameters.",
  },
  {
    id: "U-EMISSION-ORDER",
    subject: "Canonical observation emission order",
    decision:
      "By kind in the order [order, payment, recon_line, adjustment, settlement, " +
      "bank_line, ledger_entry, refund, dispute], then by simulation index " +
      "ascending within a kind. obs_id and source_line follow that order.",
    spec_basis: null,
    why:
      "§4.2 refers to 'canonical emission order' (receipt sequence), 'canonical " +
      "(ascending seq) order' (F05 selection) and 'immediately after its original " +
      "in canonical order' (F04) without defining one. DATA_MODEL.md §16 forbids " +
      "any order that 'can differ between two executions', so one had to be fixed.",
  },
  {
    id: "U-SOURCE-FILES",
    subject: "Observation.source_file values",
    decision:
      "One logical file per source system: pg_recon.jsonl, bank_statement.jsonl, " +
      "merchant_ledger.jsonl, pg_payments.jsonl, pg_orders.jsonl, pg_refunds.jsonl, " +
      "pg_settlements.jsonl, pg_disputes.jsonl. source_line is 1-based within the file.",
    spec_basis: null,
    why:
      "ARCHITECTURE.md §4 requires source_file and source_line on every record " +
      "('nothing enters the system anonymously') and names no files.",
  },
  {
    id: "U-ASSAY-ID-FORM",
    subject: "obs_ / bnk_ / mle_ suffix form",
    decision:
      "14 characters from the same [A-Za-z0-9] alphabet as the Razorpay grammars, " +
      "minted from the family sub-stream.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §0 rule 3 fixes the Razorpay suffix at 14 characters and " +
      "states no grammar for the ASSAY-owned prefixes; ids.ts validates them on " +
      "'a known prefix and a non-empty suffix' only. Matching the Razorpay length " +
      "keeps one alphabet and one length in the dataset.",
  },
  {
    id: "U-REFUND-BATCH",
    subject: "Which settlement batch carries a refund's recon row",
    decision:
      "Default: the batch of the refund's own creation day. F02: the batch two " +
      "days later; a refund whose +2 day leaves the 31-day grid stays unsettled " +
      "in period.",
    spec_basis: null,
    why:
      "§4.1 F02 states the mechanism — 'Refund initiated day N, settled in batch " +
      "N+2' — but the specification nowhere states the DEFAULT batching for the " +
      "other nine families, and I4 cannot be computed without one.",
  },
  {
    id: "U-F09-FORCED",
    subject: "Whether F09's final three capture days are forced to T+3",
    decision:
      "Forced. In F09 the settlements of capture days 29, 30 and 31 take T+3; " +
      "the remaining T+3 quota (2) and the whole T+1 quota (3) are drawn from " +
      "the other 28 days, so the realized 3/5/23 mix is unchanged.",
    spec_basis: null,
    why:
      "§4.2 says 'captures in the final 3 days WHOSE SETTLEMENT DRAWS T+3', " +
      "which reads as eligibility, but then 'three days is the smallest window " +
      "that MAKES THE FAMILY REACHABLE', which reads as a guarantee. Under the " +
      "eligibility reading F09's own declared mechanism — §4.1's 'late / " +
      "out-of-order arrival across a period boundary' — fires on some seeds and " +
      "not others, so the family means nothing on the rest. The forced reading " +
      "changes no frozen count. NOTE, spec 1.4.2: this row previously also " +
      "argued that E11 would be unreachable on those seeds, citing §10 V14's " +
      "'E11 (F09-only, held out)'. V14 no longer reads that way — DATA_MODEL.md " +
      "§15's refund clause made E11 reachable on DEV through F02 — so that " +
      "supporting argument is withdrawn. The decision is unchanged: it never " +
      "rested on E11, and F09's own mechanism still has to fire.",
  },
  {
    id: "U-MANGLE-SPLIT",
    subject: "MANGLE_UTR mode split at S = 31 bank lines",
    decision:
      "The 10% total is realized exactly (3 lines) and split by the first-k rule " +
      "in declaration order: 2 SUBSTITUTE, 1 TRUNCATE.",
    spec_basis: null,
    why:
      "§4.3's magnitude table gives the parameter as 'rate: 10%, split evenly' " +
      "with '5% each mode' as the gloss. The two disagree at 31: " +
      "roundHalfUp(0.10 x 31) = 3, while roundHalfUp(0.05 x 31) = 2 twice is 4, " +
      "i.e. 12.9%. The declared PARAMETER is 10%, so the total is what is " +
      "realized exactly.",
  },
  {
    id: "U-DROP-SETL-DENOM",
    subject: "DROP_SETTLEMENT_ID denominator",
    decision:
      "Observation kind `recon_line` — payment-type and refund-type rows " +
      "together (620 at P = 659), giving 62 rows with settlement_id set to null.",
    spec_basis: null,
    why:
      "§4.3 says 'share of recon_line'. DATA_MODEL.md §10's table makes " +
      "`recon_line` the kind carrying type payment OR refund, with adjustment " +
      "rows arriving as a separate kind, so the kind is the natural denominator " +
      "— but the specification does not say so.",
  },
  {
    id: "U-INJECT-ELIGIBLE",
    subject: "INJECT_NOTES eligible set",
    decision:
      "Observations of kind order, payment and refund — the three entities " +
      "THREAT_MODEL.md §1.1 lists as merchant-controlled. 10% of that set.",
    spec_basis: null,
    why:
      "§4.3 says '10% of eligible' and never defines eligible. §1.1's control " +
      "table names 'notes on payments, orders, refunds' as merchant-controlled; " +
      "recon-line notes are echoes of those, so injecting there as well would " +
      "double-count one attacker action.",
  },
  {
    id: "U-CONFLICT-FIELD",
    subject: "CONFLICT_REFERENCE realization",
    decision:
      "On a recon_line: settlement_utr is set to the UTR of a DIFFERENT, real " +
      "settlement in the same dataset while settlement_id keeps pointing at the " +
      "true one. Both parents exist; they are mutually exclusive.",
    spec_basis: null,
    why:
      "§4.3 describes 'a row referencing two mutually exclusive parents' and " +
      "requires 'the second parent is a real identifier drawn from the " +
      "observation set, never fabricated — I6 must fail on conflict, not on " +
      "non-existence', but names no field. settlement_id and settlement_utr are " +
      "the only pair of co-referring parent fields on any entity in the model.",
  },
  {
    id: "U-NARRATION",
    subject: "Bank statement narration content",
    decision:
      "'NEFT CR <UTR> RAZORPAY SOFTWARE PVT LTD SETTLEMENT <yyyy-mm-dd>' on every " +
      "bank line, before degradation.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §7 quarantines narration as 'the messy part' and states no " +
      "content. TRUNCATE_NARRATION is '100% of bank_line' and 'never pads', so a " +
      "narration must pre-exist and must exceed 35 characters for the operator to " +
      "model anything; ARCHITECTURE.md §6 R1 parses it for UTR candidates.",
  },
  {
    id: "U-MEMO",
    subject: "Merchant ledger memo content",
    decision:
      "'<METHOD> <NETWORK-or-dash> settlement expected' on every ledger entry.",
    spec_basis: null,
    why:
      "RECONCILIATION_SPEC.md §4.2 gives SE4 1000 frozen basis points for " +
      "'Method / card-network agreement with the merchant memo'. Emitting no memo " +
      "would make a frozen weight inert — the exact defect §4.2 argues against " +
      "when it fixes the receipt transform at 'the minimum-loss end of the band'.",
  },
  {
    id: "U-LEDGER-FIELDS",
    subject: "MerchantLedgerEntry invoice_no, expected_net_paise, gl_account",
    decision:
      "invoice_no = the order's receipt; expected_net_paise = amount - fee " +
      "recomputed at the line's own rate; gl_account = 1100_GATEWAY_RECEIVABLE.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §8 declares the fields and no values. expected_net_paise is " +
      "documented as 'the merchant's GUESS at post-fee net', so it is computed " +
      "rather than copied from the recon line.",
  },
  {
    id: "U-BANK-FIELDS",
    subject: "BankStatementLine running_balance",
    decision: "null on every line of the bank statement.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §7 says it is 'often absent in exports' and no family or " +
      "constraint reads it. Emitting a running balance would assert an opening " +
      "balance the specification does not give.",
  },
  {
    id: "U-UTR-SHAPE",
    subject: "Settlement UTR shape",
    decision:
      "10 decimal digits followed by 6 lower-case alphanumerics, matching the " +
      "documented sample '1568176960vxp0rj' in shape only.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §5 shows one sample and §22.2 M8 records that 'official " +
      "samples show at least three different UTR shapes'. §4.3 calibrates " +
      "MANGLE_UTR's 10-character truncation on that sample's 10 + 6 split, " +
      "'Shape only — no claim is made about what the leading run encodes'. Every " +
      "digit is drawn; nothing is sequential or time-derived (§22.3 refuses that).",
  },
  {
    id: "U-CLOCKS",
    subject: "Time of day for captures, refunds and bookings",
    decision:
      "Drawn uniformly within the IST calendar day the entity belongs to. A " +
      "refund is created 0-2 days after its capture, within the period.",
    spec_basis: null,
    why:
      "§4.2 fixes each entity's DAY through the capture window, the T+n cycle and " +
      "the merchant clock, and states no time of day. DATA_MODEL.md §4 requires " +
      "refund.created_at >= payment.created_at.",
  },
  {
    id: "U-INJECT-VARIANTS",
    subject: "INJECT_NOTES declared variants",
    decision: "Two variants, V1 and V2, in frozen.ts INJECT_NOTES_CORPUS.",
    spec_basis: null,
    why:
      "§4.3's corpus row is 'the two exemplars already in this specification, " +
      "plus DECLARED VARIANTS' and declares none. Both follow §T1's register — " +
      "operational phrasing, not 'ignore all previous instructions'.",
  },
  {
    id: "U-INGEST-HASH",
    subject: "ingest_hash and ingested_at",
    decision:
      "ingest_hash = sha256(canonicalJson(payload)) via @assay/ledger's " +
      "hashCanonical. ingested_at = period.to on every observation.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §10 defines ingest_hash as 'canonical JSON hash of the raw " +
      "record' without fixing what the record is; the payload is the only part " +
      "that is identical between an original and the F04 duplicate, which §4.3 " +
      "requires to share a hash. ingested_at must not read a clock — §16 forbids " +
      "any value that 'can differ between two executions'.",
  },
  {
    id: "U-SUBSTREAMS",
    subject: "PRNG sub-stream derivation",
    decision:
      "state = SplitMix64 expansion of the first 128 bits of " +
      "sha256(canonicalJson({seed, family, stream})).",
    spec_basis: null,
    why:
      "§4.2 and §4.3 refer to 'the family PRNG sub-stream' repeatedly and " +
      "ARCHITECTURE.md §11 fixes the algorithm as a vendored xorshift128+, but " +
      "no document says how a seed becomes a named sub-stream. Deriving by name " +
      "rather than by draw order means adding a draw in one phase cannot shift " +
      "another phase's values.",
  },
  {
    id: "U-PARTIAL-AMOUNT",
    subject: "The amount of a partial refund",
    decision: "Drawn uniformly from [1, payment.amount - 1] paise.",
    spec_basis: null,
    why:
      "§4.2 declares that 40% of refunds are partial and states no distribution " +
      "for the partial amount. DATA_MODEL.md §4 bounds it: amount > 0 and " +
      "amount <= payment.amount.",
  },
  {
    id: "U-ADJ-AMOUNT",
    subject: "ReconLine.amount on an adjustment row",
    decision: "Set equal to M, the non-zero one of debit/credit.",
    spec_basis: null,
    why:
      "DATA_MODEL.md §17.2 leaves the field 'deliberately unconstrained on " +
      "adjustment rows' and §14.1 warns that reading it instead of M would " +
      "break G3. Emitting M makes the two agree; emitting anything else would " +
      "assert a gross the specification declines to assert.",
  },
] as const);

/** Conventions the specification does not determine. Awaiting ratification. */
export const UNRATIFIED: readonly Convention[] = Object.freeze(
  CONVENTIONS.filter((c) => c.spec_basis === null),
);

/**
 * The number of unratified conventions, pinned.
 *
 * **23 -> 22 at spec 1.4.2**, when `PREREGISTRATION.md §4.2`'s batch-composition
 * rule ratified `U-NEGATIVE-BATCH`. The row is now `C-NEGATIVE-BATCH` and
 * carries a `spec_basis`; nothing was deleted and no other row moved.
 *
 * A test asserts `UNRATIFIED.length === UNRATIFIED_COUNT`. The pin is the point:
 * it makes adding an undeclared parameter a visible, deliberate edit rather than
 * something that accumulates. `DECISION_BRIEF.md §L.4` treats inventing a rule
 * the specification does not carry as a spec amendment, and this is the smallest
 * mechanism that makes that countable.
 */
export const UNRATIFIED_COUNT = 22;

/** `U-ISSUER-SET`. Four characters each, per `DATA_MODEL.md §6`. */
export const CARD_ISSUER_SET = Object.freeze(["HDFC", "ICIC", "SBIN", "UTIB"] as const);

/** `U-SOURCE-FILES`. */
export const SOURCE_FILES = Object.freeze({
  pg_recon: "pg_recon.jsonl",
  bank_statement: "bank_statement.jsonl",
  merchant_ledger: "merchant_ledger.jsonl",
  pg_payments: "pg_payments.jsonl",
  pg_orders: "pg_orders.jsonl",
  pg_refunds: "pg_refunds.jsonl",
  pg_settlements: "pg_settlements.jsonl",
  pg_disputes: "pg_disputes.jsonl",
} as const);

/** `U-EMISSION-ORDER`. */
export const EMISSION_KIND_ORDER = Object.freeze([
  "order", "payment", "recon_line", "adjustment", "settlement",
  "bank_line", "ledger_entry", "refund", "dispute",
] as const);
