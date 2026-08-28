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
 * carry a spec amendment. **Nothing here changes a declared value.** A row with
 * a `spec_basis` cites the clause that determines it; a row without one supplies
 * a value where the specification states none.
 *
 * **The audit's `B6` and `B7` seams both appear here, on opposite sides of the
 * line.** `B6` (`O-C2-REFUND`) is still a declared convention: evaluable,
 * changing no benchmark semantics, with its exclusion fraction reported. `B7`
 * (`O-TAU-BASE`) was escalated to governance and **ratified at spec 1.4.6**, so
 * it now carries a citation. Its row states what the ratification moved rather
 * than reading as though the base had always been settled.
 *
 * **Two further rows were ratified without a spec amendment**, on citations that
 * were available the whole time and had simply not been traced: `O-ANCHOR-SCOPE`
 * and `O-MATERIALITY-SCOPE`. Neither changed a line of behaviour — what changed
 * is which document is recorded as the authority. `O-MATERIALITY-SCOPE` was
 * split out of a combined row that had bundled a *derivable* question (which
 * postings enter the counterfactual) with a genuinely *undetermined* one
 * (whether to compute the projection natively); the second is now
 * `O-MATERIALITY-IMPL` and stays unratified, with its semantic impact declared
 * nil. Bundling them had let a citation-worthy decision inherit a null basis.
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
    id: "O-ANCHOR-SCOPE",
    subject: "Which anchors the oracle evaluates",
    decision:
      "AN1 and AN2 only. AN3 and AN4 are inert for candidate membership and " +
      "target search; AN5 is explicitly UNEXERCISED by §3 and has no code path.",
    spec_basis:
      "RECONCILIATION_SPEC.md §3 (anchor table, AN5 struck) and §4; " +
      "§4.1 C3 bank-arrival half; DATA_MODEL.md §11.1 and §17.1.1",
    why:
      "Each of the three dispositions is read off frozen text rather than " +
      "judged. AN5: §3 strikes the row through -- 'NOT EXERCISED at spec " +
      "1.4.1 ... The anchor set is AN1-AN4' -- and gives two independent " +
      "reasons, that it is not implementable (order.receipt is quarantined by " +
      "DATA_MODEL.md §0 rule 4) and that it should not be (an anchor is hard " +
      "evidence and §T5 rates the field merchant-controlled). AN1 and AN2 are " +
      "required BY NAME: §4 generates candidates 'for each unanchored TARGET', " +
      "and §4.1's C3 bank-arrival half reads 'its AN2-matched bank line when " +
      "the target is a settlement'. AN3 and AN4 are INERT: they relate " +
      "refund->payment and payment->order, and all three kinds are neither " +
      "targets -- §4 and §17.1.1 fix the target universe as settlement and " +
      "bank_line -- nor member-eligible under §11.1, which admits recon_line " +
      "and adjustment only; PREREGISTRATION.md §10 V15 confirms the refund " +
      "kind is 'barred from candidate membership by C6'. A relation between " +
      "kinds that can be neither target nor member removes nothing from what " +
      "§3's 'everything anchored is removed from the search space' operates " +
      "on, so implementing AN3 or AN4 would change no candidate, no label and " +
      "no metric. Not implementing them is therefore a statement about the " +
      "specification, not an optimisation.",
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
  {
    id: "O-MATERIALITY-SCOPE",
    subject: "Which postings a counterfactual allocation is projected through",
    decision:
      "The allocation's own postings only -- P2 per payment member and P4 per " +
      "refund member, per DATA_MODEL.md §17.1. Displaced members' " +
      "terminal-state postings (P5/P6) are EXCLUDED.",
    spec_basis: "RECONCILIATION_SPEC.md §5 and §6; DATA_MODEL.md §17.1.1",
    why:
      "DERIVED, NOT MEASURED. §6 computes materiality at stage S4. §5 states " +
      "that 'allocation is committed in a single serialized pass AFTER all " +
      "components are solved', so at S4 a member displaced from one allocation " +
      "has no determined disposition: it may be allocated to a different " +
      "target in another component, or reach EXCEPTION. §17.1.1 triggers " +
      "P5/P6 on 'Abstention or open exception', a TERMINAL STATE that does not " +
      "yet exist at S4. Projecting one would assert a state the stage cannot " +
      "know, and the full counterfactual is not even well-defined without " +
      "solving the whole run twice. An earlier version of this row justified " +
      "the same decision by reporting that both readings had been MEASURED to " +
      "agree; that warrant is withdrawn, because a measurement is the wrong " +
      "kind of evidence for what the specification means and the derivation " +
      "above was available. A COROLLARY WORTH RECORDING: C6 forces " +
      "Sigma credit - Sigma debit = target.amount for BOTH allocations and " +
      "P2/P4 post exactly that net to 1200_BANK, so 1200_BANK is IDENTICAL " +
      "between any two admissible allocations of one target; materiality is " +
      "carried entirely by 1100_GATEWAY_RECEIVABLE, 5100_PG_FEE_EXPENSE, " +
      "1300_GST_INPUT_CREDIT and 2200_REFUND_LIABILITY.",
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
    id: "O-MATERIALITY-IMPL",
    subject: "Whether the projection is computed natively or through @assay/ledger",
    decision: "Natively, in classify.ts, from DATA_MODEL.md §17.1's table.",
    spec_basis: null,
    why:
      "NO FROZEN CLAUSE REQUIRES THIS AND THE CHOICE CANNOT CHANGE A NUMBER. " +
      "ARCHITECTURE.md §7.2's independence argument is scoped to C1-C8, and " +
      "§5.3's consistency gate never compares materiality, so neither route is " +
      "mandated. Both implement §17.1's posting table, which IS shared frozen " +
      "data, so a correct implementation of either produces identical " +
      "balances. Native is chosen as independence hygiene: routing through the " +
      "agent's journal module would make the oracle's product depend on the " +
      "agent's posting code, which ARCHITECTURE.md §3's 'not the engine and " +
      "not the generator' exists to prevent. SEMANTIC IMPACT: NIL. This row is " +
      "registered so the choice is visible, not because a value turns on it, " +
      "and it stays unratified because the specification genuinely does not " +
      "decide it -- not because the decision is in doubt.",
  },
  {
    id: "O-C4-UNIT",
    subject: "How C4's 1-7 CALENDAR days is measured",
    decision: "Elapsed epoch seconds: settled_at - created_at in [1x86400, 7x86400].",
    spec_basis: "PREREGISTRATION.md §4.2 (clock grid) and §22.2 M21, spec 1.4.7; RECONCILIATION_SPEC.md §4.1 C4",
    why:
      "RATIFIED AT SPEC 1.4.7 ON AN EQUIVALENCE, NOT ON A CLAUSE PICKING THIS " +
      "READING. §4.1 writes C4 as a subtraction of two epoch-second fields and " +
      "glosses the bound as CALENDAR days, contrasting it with the RZP-DOC " +
      "WORKING-day cycle rather than with elapsed time; that fixed the unit and " +
      "not the measurement. §4.2 now freezes the grid -- settlements stamped at " +
      "21:00:00 IST, every capture, refund and ERP booking drawn from " +
      "[00:00:00, 21:00:00) of its day -- under which both readings admit every " +
      "member of every true allocation: elapsed lies in (n*86400, n*86400+75600] " +
      "for a T+n batch, so it exceeds T_min STRICTLY and stays under T_max, " +
      "while the calendar difference is n in {1,2,3}. The measurement therefore " +
      "stops being a decision. " +
      "THIS ROW PREVIOUSLY UNDERSTATED THE EXPOSURE AND THE CORRECTION IS PART " +
      "OF THE RECORD: it called the completeness gate insensitive and located " +
      "the risk in §5.3's consistency gate. The reverse was true. Because " +
      "DATA_MODEL.md §6 makes settled_at settlement-scoped, a T+1 batch admits " +
      "a TRUE-allocation member captured late in the day whose gap is under one " +
      "day in seconds and exactly one day by date -- so the readings disagreed " +
      "about whether the COMPLETENESS gate passes, which §5.3 makes a question " +
      "of benchmark validity. The old row also cited packages/generator's grid " +
      "as the reason it was safe, which was true and was the problem: the grid " +
      "was that package's unratified U-CLOCKS convention -- ratified there now " +
      "as C-CLOCKS -- changeable without a " +
      "governance cycle. It is frozen in §4.2 now, and both rows cite it.",
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
 * **Five, then four at spec 1.4.6, then three, then two at spec 1.4.7.** `O-TAU-BASE` moved to the
 * ratified half when `DATA_MODEL.md §11` defined `Component.total_value_paise`.
 * `O-ANCHOR-SCOPE` and `O-MATERIALITY-SCOPE` followed, on citations that were
 * available the whole time and had simply not been traced. The pin moves with
 * each, which is the point: the count only means something if changing it is a
 * deliberate act attached to a stated basis.
 *
 * **Ratifying is not the same as deciding.** Neither move changed a line of
 * behaviour; what changed is that the specification is now recorded as the
 * authority for each, rather than this package.
 */
export const UNRATIFIED_COUNT = 2;
