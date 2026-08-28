/**
 * The convention register — every decision this oracle had to make that the
 * frozen specification does not state.
 *
 * `packages/generator/src/conventions.ts` established the pattern and the reason
 * for it: a package cannot run on a specification alone, so the decisions it
 * must make anyway are recorded in the open, counted, and pinned by a test,
 * rather than scattered through the code as literals nobody registered.
 *
 * Two classes, and the difference is the whole point:
 *
 *   - `spec_basis` is a citation — the specification determines the value and
 *     this row records where the oracle read it from.
 *   - `spec_basis` is `null` — **the specification determines nothing here.**
 *     The value is this package's own choice, made to get a running oracle, and
 *     it is **awaiting ratification**. `UNRATIFIED` collects them and a test
 *     pins the count, so a new unratified parameter cannot be added without the
 *     pin failing and a human being told.
 *
 * `DECISION_BRIEF.md §L.4` makes inventing a rule the specification does not
 * carry a spec amendment. Nothing here changes a declared value; every row
 * supplies one where none exists.
 *
 * **The audit's `B6` and `B7` seams both appear here, on opposite sides of the
 * line.** `B6` (`O-C2-REFUND`) is still a declared convention: evaluable,
 * changing no benchmark semantics, with its exclusion fraction reported. `B7`
 * (`O-TAU-BASE`) was escalated to governance and **ratified at spec 1.4.6**, so
 * it now carries a citation. Its row states what the ratification moved rather
 * than reading as though the base had always been settled.
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
    id: "O-MEMBER-KINDS",
    subject: "Which observation kinds may be candidate members",
    decision: "recon_line and adjustment only.",
    spec_basis: "DATA_MODEL.md §11.1 (spec 1.4.4)",
    why:
      "§11.1 derives it from RECONCILIATION_SPEC.md §4.1's spec-1.4.2 " +
      "ratification: C3 and C4 are unconditional over members, and only a " +
      "ReconLine payload carries settled_at. The oracle reads the derivation, " +
      "it does not re-decide it.",
  },
  {
    id: "O-TARGET-CURRENCY",
    subject: "The currency of a settlement or bank_line target, for C1",
    decision: 'INR for both target kinds.',
    spec_basis: "DATA_MODEL.md §11.1 and §22.2 M19 (spec 1.4.4)",
    why:
      "Neither target entity carries a currency field. §11.1 declares the " +
      "value and M19 registers it as [ASSAY-MODEL]; without it C1 would be " +
      "unsatisfiable for every candidate.",
  },
  {
    id: "O-COSETTLEMENT",
    subject: "Partitioning the member pool for a settlement target",
    decision:
      "Members of one candidate must share one settled_at; the pool is " +
      "partitioned into settled_at equivalence classes and each is enumerated.",
    spec_basis: "RECONCILIATION_SPEC.md §4.1 (spec 1.4.3), entailed by DATA_MODEL.md §6",
    why:
      "§4.1 states co-settlement coherence as a consequence of §6's definition " +
      "of settled_at rather than as a ninth constraint. It is a pool rule here " +
      "for exactly that reason and is not evaluated as a constraint.",
  },
  {
    id: "O-BANK-TARGET-EMPTY",
    subject: "Candidates for a bank_line target",
    decision: "The admissible set is empty; no member kind can serve.",
    spec_basis: "DATA_MODEL.md §11.1, PREREGISTRATION.md §10 V18",
    why:
      "A settlement is not a member-eligible kind, so §4's 'a bank line " +
      "needing settlements' yields the empty candidate set and the target " +
      "reaches EXCEPTION by §9's 'no admissible candidate exists at all'.",
  },
  {
    id: "O-ANCHOR-TEST",
    subject: "Which test removes a member from §3's unanchored search space",
    decision:
      "settlement_id !== null. A recon line carrying ANY settlement_id is " +
      "outside the search space. AN1's referent check -- 'the named settlement " +
      "is present in the observation set' -- is NOT re-applied at the pool " +
      "boundary, because on a conforming dataset it cannot change the answer.",
    spec_basis:
      "PREREGISTRATION.md §4.3 (operator table; DROP_SETTLEMENT_ID, " +
      "CONFLICT_REFERENCE, period rule) and §4.2 (F05, F09 emission rule)",
    why:
      "WHAT IS CITED IS AN EQUIVALENCE, NOT A CLAUSE CHOOSING THIS TEST. §4.3 " +
      "and §4.2 together determine that on every conforming dataset a non-null " +
      "recon_line.settlement_id names a settlement PRESENT in the observation " +
      "set, so the null test and AN1's referent test have the same extension " +
      "and the cheaper one is exact rather than approximate. Six frozen " +
      "statements close the space: no §4.3 operator removes a settlement " +
      "observation; DROP_SETTLEMENT_ID detaches a line by 'sets the field to " +
      "null, which the schema already admits', never by leaving a dangling " +
      "id; CONFLICT_REFERENCE's second parent is 'a real identifier drawn " +
      "from the observation set, never fabricated -- I6 must fail on conflict, " +
      "not on non-existence'; DROP_FIELD, SHIFT_TIMESTAMP, SWAP_ORDER_REF and " +
      "ROUND_BANK_AMOUNT are declared NOT EXERCISED; 'an operator may never " +
      "move an observation across period.from or period.to'; and the one " +
      "sanctioned crossing, F09's, states that 'those settlement and bank rows " +
      "ARE EMITTED'. F05 withholds a constituent recon_line, not a settlement. " +
      "WHAT THIS ROW ASSUMES, STATED SO IT CAN BE CHECKED: the equivalence is " +
      "a property of the DECLARED POPULATION, not of the type. A hand-built " +
      "fixture can carry a dangling settlement_id, and on such an input the " +
      "line is excluded from the pool and is therefore not a §5 node, where " +
      "AN1 read alone would make it both. That input is outside §4.2's " +
      "composition, and a future operator able to produce one would need a " +
      "spec amendment under DECISION_BRIEF.md §L.4 -- which is the point of " +
      "registering the assumption rather than leaving it implicit in a filter.",
  },
  {
    id: "O-COMPONENT-NODES",
    subject: "Which observations are nodes of a RECONCILIATION_SPEC §5 component",
    decision:
      "The UNANCHORED observations of a member-eligible kind. Edges come from " +
      "the enumerated admissible candidates, and an anchored member of a " +
      "candidate is skipped rather than made a node.",
    spec_basis: "RECONCILIATION_SPEC.md §5 and §3; DATA_MODEL.md §11 (spec 1.4.6)",
    why:
      "§5 makes the nodes 'unanchored observations and targets' and §3 removes " +
      "everything anchored from the search space, which §11 states the " +
      "component IS. The member-eligible half is forced by §11's own " +
      "justification of total_value_paise: it reads §14.1's value(observation), " +
      "'total over the member-eligible kinds §11.1 admits ... so the sum is " +
      "defined for every observation this field can range over'. A reference " +
      "kind has no §14.1 value at all, so admitting one as a node would make " +
      "the sum undefined and contradict the sentence justifying it. §11 draws " +
      "the conclusion in terms: 'Component.member_obs_ids satisfies both: " +
      "unanchored, and of a member-eligible kind.' No comp_id is minted -- §11 " +
      "types the field ComponentId and no document states a format -- and " +
      "solve_status reports the ORACLE's budgets, not the engine's K_max/C_max.",
  },
  {
    id: "O-TAU-BASE",
    subject: "What 'component value' means in tau = max(Rs 100, 10 bps of it)",
    decision:
      "Component.total_value_paise: the sum of value(observation) over the " +
      "UNANCHORED, member-eligible observation nodes of the RECONCILIATION_SPEC " +
      "§5 component the target belongs to. Computed by components.ts from the " +
      "enumerated admissible candidates; supplied to classify() by labelAll().",
    spec_basis: "DATA_MODEL.md §11 and §22.2 M20 (spec 1.4.6), DECISION_BRIEF.md §A.13",
    why:
      "RATIFIED AT SPEC 1.4.6, AND THIS ROW RECORDS WHAT THE RATIFICATION " +
      "MOVED RATHER THAN PRESENTING IT AS ALWAYS-TRUE. Through spec 1.4.5 §11 " +
      "declared Component.total_value_paise without defining it, so the base " +
      "was undetermined and this package declared the target's own amount. " +
      "That earlier reading was ALSO justified here by the claim that §5.2 " +
      "gives the oracle no component decomposition; the claim was wrong on its " +
      "own terms -- the decomposition is RECONCILIATION_SPEC §5's union-find " +
      "over admissible-candidate co-occurrence, and PREREGISTRATION §5.2 " +
      "budgets 'minutes per component', presupposing the decomposition rather " +
      "than withholding it. THE SWAP IS CONSEQUENTIAL: a component base runs " +
      "about 2x a target base on a two-solution component, so a materiality " +
      "between the two taus lands on opposite sides of them. " +
      "tests/property/oracle.prop.test.ts pins that divergence and asserts " +
      "which side the ratified base falls on, so a future change to this row " +
      "fails loudly. Audit seam B7, closed.",
  },
  // --- unratified: the specification determines nothing here ---------------
  {
    id: "O-C2-REFUND",
    subject: "Which reading of C2's refund half the oracle implements",
    decision:
      "Referential consistency: a refund member's own order_id must equal the " +
      "order_id of the recon line its payment_id names, where that line is in " +
      "the observation set. A refund whose parent is absent is not excluded on " +
      "that ground.",
    spec_basis: null,
    why:
      "§4.1 says only 'a refund may only offset a payment on the same " +
      "order_id' and declares the half binding. The co-membership reading is " +
      "refuted by §5.3 -- it excludes the true allocation on the large majority " +
      "of refund-carrying settlements, because a refund is batched by its own " +
      "creation day rather than its parent's. Binding means EVALUABLE, not " +
      "excluding: C1 is the standing precedent, and §4.1 requires the excluded " +
      "fraction to be reported so a reviewer can see the clause doing nothing " +
      "rather than assume it is doing something. Audit seam B6.",
  },
  {
    id: "O-MATERIALITY-PROJECTION",
    subject: "Which postings a counterfactual allocation is projected through",
    decision:
      "The allocation's own postings only -- P2 per payment member and P4 per " +
      "refund member, per DATA_MODEL.md §17.1 -- computed natively rather than " +
      "through @assay/ledger.",
    spec_basis: null,
    why:
      "§6 says materiality is 'computed by running both allocations through " +
      "the ledger projection in memory' and does not say whether displaced " +
      "members' terminal-state postings are included. Both readings were " +
      "measured and agree in magnitude on every material pair found. The " +
      "projection is implemented natively because routing it through the " +
      "agent's journal module would make the oracle's product depend on the " +
      "agent's posting implementation, which ARCHITECTURE.md §7.2's " +
      "independence argument exists to prevent.",
  },
  {
    id: "O-C4-UNIT",
    subject: "How C4's 1-7 CALENDAR days is measured",
    decision: "Elapsed epoch seconds: settled_at - created_at in [1x86400, 7x86400].",
    spec_basis: null,
    why:
      "§4.1 states the unit and not the measurement. The completeness gate is " +
      "insensitive to the choice -- packages/generator's period grid was built " +
      "so every true allocation satisfies C4 on both readings -- but §5.3's " +
      "consistency gate samples deliberately inadmissible pairs, where a " +
      "7.04-day gap passes one reading and fails the other, so the two " +
      "implementations must be pinned to one.",
  },
  {
    id: "O-ANCHOR-SCOPE",
    subject: "Which anchors the oracle evaluates",
    decision:
      "AN1 and AN2 only. AN3 and AN4 are referential facts about payments and " +
      "orders and remove nothing from the settlement search space; AN5 is " +
      "retired by §3 and is not implemented.",
    spec_basis: null,
    why:
      "§3 removes 'everything anchored' from the search space and §4 generates " +
      "candidates for each UNANCHORED target, but does not say which anchors " +
      "bear on which target kind. AN1 attaches a recon line to its settlement " +
      "and AN2 attaches a settlement to a bank line; those are the two that " +
      "change what remains to be searched.",
  },
] as const satisfies readonly Convention[]);

/** The rows awaiting ratification. A test pins the count. */
export const UNRATIFIED: readonly Convention[] = Object.freeze(
  CONVENTIONS.filter((c) => c.spec_basis === null),
);

/**
 * The pinned count of unratified conventions.
 *
 * `packages/generator` pins the same way and for the same reason: a new
 * unratified parameter must not be addable without a human being told.
 *
 * **Five until spec 1.4.6, four after it.** `O-TAU-BASE` moved to the ratified
 * half when `DATA_MODEL.md §11` defined `Component.total_value_paise`. The pin
 * has to move with it, which is the point: the count only means something if
 * changing it is a deliberate act attached to a stated basis.
 */
export const UNRATIFIED_COUNT = 4;
