import { describe, expect, it } from "vitest";

import { SUSPENSE_ACCOUNT, type ObservationKind } from "@assay/domain";
import type { Paise } from "@assay/money";

import {
  ProjectionInputError,
  appendEvent,
  computeGenesisHash,
  createChain,
  type LedgerChain,
  type LedgerEvent,
  type LedgerEventDraft,
} from "@assay/ledger";

import {
  CLOSE_GATE_IDS,
  closeGate,
  type CloseGateFinding,
  type CloseGateFindingCode,
  type CloseGateId,
  type CloseGateInput,
  type CloseGateResult,
  type CloseObservationRecord,
  type PostedDecisionRecord,
  type TerminalStateRecord,
  type UnresolvedItemRecord,
} from "../src/close-gate.js";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  RUN_ID,
  SETTLEMENT_ID,
  asEvents,
  digest,
  entityId,
  id,
  line,
  makeActor,
  makeDraft,
  p5Lines,
  storedCopy,
} from "./fixtures.js";

/**
 * The five close gates `G1`-`G5` — `RECONCILIATION_SPEC.md §10.1`.
 *
 * These import `../src/close-gate.js` directly rather than through
 * `@assay/ledger`, on `write.test.ts`'s convention: the package's public
 * surface is wired at integration, and a test that waited for the barrel would
 * be testing the barrel. Everything the gate *consumes* — the chain, the seal,
 * the projection, the digests — comes through the public entry point, so the
 * arithmetic below runs against the same `hash-chain.ts` and `projection.ts`
 * every other suite does.
 *
 * The postings used as data are `DATA_MODEL.md §17.1`'s, and their
 * `source_entity_id` values `§17.1.1`'s own column, so every figure is
 * checkable against the specification by eye.
 */

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

let nextEvent = 0;
/** A draft with a fresh `evt_id`, so a sequence of them is a legal chain. */
function draft(overrides: Partial<LedgerEventDraft> = {}): LedgerEventDraft {
  nextEvent += 1;
  return makeDraft({
    evt_id: id("evt_", nextEvent) as LedgerEventDraft["evt_id"],
    certificate: null,
    ...overrides,
  });
}

function chainOf(drafts: readonly LedgerEventDraft[]): LedgerChain {
  let chain = createChain(GENESIS, RUN_ID);
  for (const item of drafts) chain = appendEvent(chain, item);
  return chain;
}

// `§17.1` P5 — an inbound bank credit ASSAY declined to attribute (`E03`).
// CREDITS Suspense, so `item_net_paise` is negative.
const p5 = (amount: number, key: string = BANK_LINE_ID) => p5Lines(amount, key);

// `§17.1` P6 — an outbound settlement with no bank credit (`E04`).
// DEBITS Suspense, so `item_net_paise` is positive. The opposite sign to `P5`
// is the whole reason `§10.1` makes `G3` gross rather than net.
const p6 = (amount: number, key: string = SETTLEMENT_ID) => [
  line(SUSPENSE_ACCOUNT, amount, 0, "P6.dr", key),
  line("1100_GATEWAY_RECEIVABLE", 0, amount, "P6.cr", key),
];

// `§17.1` P7 — the resolution of an item previously posted to Suspense. It
// reverses under the SAME key, which is what makes "open" arithmetic.
const p7 = (amount: number, key: string) => [
  line(SUSPENSE_ACCOUNT, amount, 0, "P7.dr", key),
  line("1200_BANK", 0, amount, "P7.cr", key),
];

const OBS_BANK = id("obs_", 1);
const OBS_SETTLEMENT = id("obs_", 2);
const OBS_PAYMENT = id("obs_", 3);

const DEC_ID = id("dec_", 1);

const SUSPENSE_AMOUNT = 45_231_000;

function observation(obsId: string, kind: ObservationKind): CloseObservationRecord {
  return { obs_id: obsId, kind };
}

function state(obsId: string, value: TerminalStateRecord["state"]): TerminalStateRecord {
  return { obs_id: obsId, state: value };
}

function queued(
  key: string,
  origin: UnresolvedItemRecord["origin"],
  value: number,
): UnresolvedItemRecord {
  return { source_entity_id: key, origin, value_paise: value as Paise };
}

function posted(
  decisionId: string,
  invariantsFailed: PostedDecisionRecord["invariants_failed"] = [],
): PostedDecisionRecord {
  return { decision_id: decisionId, invariants_failed: invariantsFailed };
}

/**
 * A run on which all five gates pass, and pass non-trivially.
 *
 * One `P5` posting opens one Suspense item of ₹4,52,310 keyed on the bank line;
 * the queue carries exactly that item at exactly that value, so `G3` is an
 * equality between two non-zero sums rather than `0 === 0`. Three observations
 * cover both halves of `G1`'s classification clause: two reconcilable kinds in
 * decided states and one reference kind in `REFERENCE`.
 */
function healthy(overrides: Partial<CloseGateInput> = {}): CloseGateInput {
  const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
  return {
    genesis_hash: GENESIS,
    stored_root_hash: chain.root_hash,
    events: chain.events,
    observations: [
      observation(OBS_BANK, "bank_line"),
      observation(OBS_SETTLEMENT, "settlement"),
      observation(OBS_PAYMENT, "payment"),
    ],
    terminal_states: [
      state(OBS_BANK, "ABSTAINED"),
      state(OBS_SETTLEMENT, "RECONCILED"),
      state(OBS_PAYMENT, "REFERENCE"),
    ],
    unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", SUSPENSE_AMOUNT)],
    posted_decisions: [posted(DEC_ID)],
    ...overrides,
  };
}

/** A gate input whose books are a specific chain, with the queue left to match. */
function booksOf(
  drafts: readonly LedgerEventDraft[],
  overrides: Partial<CloseGateInput> = {},
): CloseGateInput {
  const chain = chainOf(drafts);
  return healthy({
    stored_root_hash: chain.root_hash,
    events: chain.events,
    ...overrides,
  });
}

function codes(result: CloseGateResult, gate: CloseGateId): CloseGateFindingCode[] {
  return result.findings.filter((f) => f.gate === gate).map((f) => f.code);
}

function findingFor(
  result: CloseGateResult,
  code: CloseGateFindingCode,
): CloseGateFinding | undefined {
  return result.findings.find((f) => f.code === code);
}

/** The five booleans, so a test can assert the whole verdict rather than one bit. */
function verdict(result: CloseGateResult): Record<CloseGateId, boolean> {
  return {
    g1_all_terminal: result.g1_all_terminal,
    g2_trial_balance: result.g2_trial_balance,
    g3_suspense_identity: result.g3_suspense_identity,
    g4_hash_chain: result.g4_hash_chain,
    g5_no_failed_invariant_posted: result.g5_no_failed_invariant_posted,
  };
}

const ALL_PASS: Record<CloseGateId, boolean> = {
  g1_all_terminal: true,
  g2_trial_balance: true,
  g3_suspense_identity: true,
  g4_hash_chain: true,
  g5_no_failed_invariant_posted: true,
};

/** `ALL_PASS` with the named gates flipped to `false`. */
function allPassExcept(...failing: readonly CloseGateId[]): Record<CloseGateId, boolean> {
  const out = { ...ALL_PASS };
  for (const gate of failing) out[gate] = false;
  return out;
}

// ---------------------------------------------------------------------------
// The healthy baseline
// ---------------------------------------------------------------------------

describe("a run on which nothing is wrong", () => {
  it("passes all five gates and names none", () => {
    const result = closeGate(healthy());

    expect(verdict(result)).toEqual(ALL_PASS);
    expect(result.all_passed).toBe(true);
    expect(result.failed_gates).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("passes G3 as an equality between two non-zero sums", () => {
    // A baseline that satisfied G3 as `0 === 0` would pass whatever the gate
    // did, and every G3 test below would inherit that vacuity.
    const result = closeGate(healthy());

    expect(result.suspense_gross_item_paise).toBe(SUSPENSE_AMOUNT);
    expect(result.unresolved_value_paise).toBe(SUSPENSE_AMOUNT);
    expect(result.suspense_items).toHaveLength(1);
  });

  it("publishes the re-projection, never a cached balance", () => {
    // §10.1: "Balances at close are recomputed by projection from the event
    // log, never read from cached state."
    const result = closeGate(healthy());

    expect(result.projection).not.toBeNull();
    expect(result.account_balances).not.toBeNull();
    expect(result.account_balances?.[SUSPENSE_ACCOUNT]).toBe(-SUSPENSE_AMOUNT);
    expect(result.account_balances?.["1200_BANK"]).toBe(SUSPENSE_AMOUNT);
  });

  it("counts the observation set as DATA_MODEL.md §20 reports it", () => {
    const result = closeGate(healthy());

    expect(result.observations_total).toBe(3);
    expect(result.observations_reference).toBe(1);
    expect(result.decisions).toEqual({ RECONCILED: 1, ABSTAINED: 1, EXCEPTION: 0 });
  });

  it("returns a frozen result", () => {
    const result = closeGate(healthy());

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.failed_gates)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G1 — every observation has exactly one terminal state
// ---------------------------------------------------------------------------

describe("G1 — every observation has exactly one terminal state", () => {
  it("fails when an observation reached no terminal state", () => {
    // §10.1: the failure means "a record was dropped". §L.1 rule 5: "no drop
    // path".
    const result = closeGate(
      healthy({
        terminal_states: [state(OBS_BANK, "ABSTAINED"), state(OBS_PAYMENT, "REFERENCE")],
      }),
    );

    expect(verdict(result)).toEqual(allPassExcept("g1_all_terminal"));
    expect(codes(result, "g1_all_terminal")).toEqual(["OBSERVATION_WITHOUT_TERMINAL_STATE"]);
    expect(findingFor(result, "OBSERVATION_WITHOUT_TERMINAL_STATE")?.subject).toBe(
      OBS_SETTLEMENT,
    );
  });

  it("fails when an observation holds more than one terminal state", () => {
    // "**Exactly** one" fails in two directions, and a Map<obs_id, state> would
    // silently repair this one by keeping the last write.
    const result = closeGate(
      healthy({
        terminal_states: [
          state(OBS_BANK, "ABSTAINED"),
          state(OBS_BANK, "RECONCILED"),
          state(OBS_SETTLEMENT, "RECONCILED"),
          state(OBS_PAYMENT, "REFERENCE"),
        ],
      }),
    );

    expect(result.g1_all_terminal).toBe(false);
    expect(codes(result, "g1_all_terminal")).toEqual([
      "OBSERVATION_WITH_MULTIPLE_TERMINAL_STATES",
    ]);
    expect(findingFor(result, "OBSERVATION_WITH_MULTIPLE_TERMINAL_STATES")?.subject).toBe(
      OBS_BANK,
    );
  });

  it("fails on a state recorded against an observation the set does not hold", () => {
    // The dropped-record defect seen from the other side: the state store and
    // the observation set disagree.
    const result = closeGate(
      healthy({
        terminal_states: [
          state(OBS_BANK, "ABSTAINED"),
          state(OBS_SETTLEMENT, "RECONCILED"),
          state(OBS_PAYMENT, "REFERENCE"),
          state(id("obs_", 99), "RECONCILED"),
        ],
      }),
    );

    expect(result.g1_all_terminal).toBe(false);
    expect(codes(result, "g1_all_terminal")).toEqual([
      "TERMINAL_STATE_FOR_UNKNOWN_OBSERVATION",
    ]);
    expect(findingFor(result, "TERMINAL_STATE_FOR_UNKNOWN_OBSERVATION")?.subject).toBe(
      id("obs_", 99),
    );
  });

  it("fails when a reconcilable observation was retired as REFERENCE", () => {
    // §10.1 names this failure in terms. It is the reason REFERENCE cannot
    // become a drop path for an observation the engine failed to explain.
    const result = closeGate(
      healthy({
        terminal_states: [
          state(OBS_BANK, "ABSTAINED"),
          state(OBS_SETTLEMENT, "REFERENCE"),
          state(OBS_PAYMENT, "REFERENCE"),
        ],
      }),
    );

    expect(result.g1_all_terminal).toBe(false);
    expect(codes(result, "g1_all_terminal")).toEqual([
      "REFERENCE_ASSIGNED_TO_RECONCILABLE_KIND",
    ]);
    expect(findingFor(result, "REFERENCE_ASSIGNED_TO_RECONCILABLE_KIND")?.subject).toBe(
      OBS_SETTLEMENT,
    );
  });

  it("fails when a reference kind reached a decided state", () => {
    // The classification clause is a BICONDITIONAL. Checking only the first
    // direction would let a `payment` row be reported RECONCILED and counted in
    // a coverage numerator DATA_MODEL.md §10.1 excludes it from.
    const result = closeGate(
      healthy({
        terminal_states: [
          state(OBS_BANK, "ABSTAINED"),
          state(OBS_SETTLEMENT, "RECONCILED"),
          state(OBS_PAYMENT, "RECONCILED"),
        ],
      }),
    );

    expect(result.g1_all_terminal).toBe(false);
    expect(codes(result, "g1_all_terminal")).toEqual([
      "NON_REFERENCE_STATE_ON_REFERENCE_KIND",
    ]);
    expect(findingFor(result, "NON_REFERENCE_STATE_ON_REFERENCE_KIND")?.subject).toBe(
      OBS_PAYMENT,
    );
  });

  it("holds both reference kinds to REFERENCE and no other state", () => {
    // DATA_MODEL.md §10.1 fixes `payment` and `order` as the reference kinds,
    // "a property of the kind alone".
    for (const kind of ["payment", "order"] as const) {
      const decided = closeGate(
        healthy({
          observations: [observation(OBS_PAYMENT, kind)],
          terminal_states: [state(OBS_PAYMENT, "EXCEPTION")],
          unresolved_items: [],
          events: [],
          stored_root_hash: createChain(GENESIS, RUN_ID).root_hash,
        }),
      );
      expect(decided.g1_all_terminal).toBe(false);

      const referenced = closeGate(
        healthy({
          observations: [observation(OBS_PAYMENT, kind)],
          terminal_states: [state(OBS_PAYMENT, "REFERENCE")],
          unresolved_items: [],
          events: [],
          stored_root_hash: createChain(GENESIS, RUN_ID).root_hash,
        }),
      );
      expect(referenced.g1_all_terminal).toBe(true);
    }
  });

  it("reports every offending observation, not only the first", () => {
    // ARCHITECTURE.md §9: an analyst who fixes the first failure and re-runs to
    // find the second has been told less than the gate knew.
    const result = closeGate(
      healthy({
        terminal_states: [state(OBS_PAYMENT, "REFERENCE")],
      }),
    );

    expect(codes(result, "g1_all_terminal")).toEqual([
      "OBSERVATION_WITHOUT_TERMINAL_STATE",
      "OBSERVATION_WITHOUT_TERMINAL_STATE",
    ]);
    expect(result.findings.map((f) => f.subject)).toEqual([OBS_BANK, OBS_SETTLEMENT]);
  });

  it("does not depend on the order the assignments arrived in", () => {
    const forward = closeGate(healthy());
    const reversed = closeGate(
      healthy({ terminal_states: [...healthy().terminal_states].reverse() }),
    );

    expect(reversed.g1_all_terminal).toBe(forward.g1_all_terminal);
    expect(reversed.decisions).toEqual(forward.decisions);
    expect(reversed.observations_reference).toBe(forward.observations_reference);
  });

  it("throws rather than reports on a defect in the caller's own argument", () => {
    // close-gate.ts's own rule: a fact about the LEDGER is returned; a defect in
    // the ARGUMENT throws. A duplicate makes "exactly one terminal state"
    // undecidable rather than false.
    expect(() =>
      closeGate(
        healthy({
          observations: [
            observation(OBS_BANK, "bank_line"),
            observation(OBS_BANK, "bank_line"),
          ],
        }),
      ),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(
        healthy({
          observations: [{ obs_id: OBS_BANK, kind: "transfer" as ObservationKind }],
        }),
      ),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(
        healthy({
          terminal_states: [
            { obs_id: OBS_BANK, state: "PENDING" as TerminalStateRecord["state"] },
          ],
        }),
      ),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(healthy({ observations: [observation("", "bank_line")] })),
    ).toThrow(ProjectionInputError);
  });
});

// ---------------------------------------------------------------------------
// G2 — trial balance
// ---------------------------------------------------------------------------

describe("G2 — trial balance over the re-projected event log", () => {
  it("passes on a log the chain built", () => {
    const result = closeGate(healthy());

    expect(result.g2_trial_balance).toBe(true);
    expect(result.projection?.totalDrPaise).toBe(result.projection?.totalCrPaise);
  });

  it("cannot be failed by a log the chain built, because appendEvent refuses one", () => {
    // Σ over per-event-balanced events is balanced, and `appendEvent` asserts I1
    // per event. So G2 can only fail on a log edited after storage — which is
    // exactly THREAT_MODEL.md §T10, and is why the fixture below is hand-built.
    expect(() =>
      chainOf([draft({ journal_lines: [line("1200_BANK", 500, 0, "dr")] })]),
    ).toThrow(/trial balance/i);
  });

  it("fails on a log edited after storage", () => {
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const tampered = storedCopy(chain.events);
    // Relieve the bank leg and leave the Suspense leg standing: the classic
    // half-posting an attacker with write access to `assay.sqlite` leaves.
    const first = tampered[0] as Record<string, unknown>;
    first["journal_lines"] = [line(SUSPENSE_ACCOUNT, 0, SUSPENSE_AMOUNT, "P5.cr")];

    const result = closeGate(
      healthy({ events: asEvents(tampered), stored_root_hash: chain.root_hash }),
    );

    expect(result.g2_trial_balance).toBe(false);
    expect(codes(result, "g2_trial_balance")).toEqual(["TRIAL_BALANCE_UNEQUAL"]);
    // G4 falls with it, and that is the honest reading rather than a defect in
    // the test: an edit that unbalances the books also breaks the digest that
    // commits to them. The two gates catch the same act from two directions.
    expect(result.g4_hash_chain).toBe(false);
  });

  it("reports an imbalance rather than throwing", () => {
    // DATA_MODEL.md §20 shows `g2_trial_balance` to an analyst as a boolean, so
    // the reporting path must not raise.
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const tampered = storedCopy(chain.events);
    (tampered[0] as Record<string, unknown>)["journal_lines"] = [
      line("1200_BANK", 1, 0, "dr"),
    ];

    expect(() =>
      closeGate(healthy({ events: asEvents(tampered), stored_root_hash: chain.root_hash })),
    ).not.toThrow();
  });

  it("reports PROJECTION_FAILED under both G2 and G3 when the log will not project", () => {
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const broken = storedCopy(chain.events);
    (broken[0] as Record<string, unknown>)["journal_lines"] = [
      { ...line("1200_BANK", 1, 0, "dr"), account: "7777_NOT_AN_ACCOUNT" },
    ];

    const result = closeGate(
      healthy({ events: asEvents(broken), stored_root_hash: chain.root_hash }),
    );

    expect(result.g2_trial_balance).toBe(false);
    expect(result.g3_suspense_identity).toBe(false);
    expect(codes(result, "g2_trial_balance")).toEqual(["PROJECTION_FAILED"]);
    expect(codes(result, "g3_suspense_identity")).toEqual(["PROJECTION_FAILED"]);
    // `null` is not "zero balances": a number that looks like a balance and is
    // not is exactly what §10.1's re-projection rule exists to refuse.
    expect(result.projection).toBeNull();
    expect(result.account_balances).toBeNull();
  });

  it("has a projection whenever G2 passed", () => {
    // The invariant close.ts step 7 relies on: a close report always has
    // balances to publish.
    const result = closeGate(healthy());

    expect(result.g2_trial_balance).toBe(true);
    expect(result.projection).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G3 — the gross per-item Suspense identity
// ---------------------------------------------------------------------------

describe("G3 — Suspense identity, gross per-item, exactly, to the paisa", () => {
  it("passes when the books and the queue agree", () => {
    expect(closeGate(healthy()).g3_suspense_identity).toBe(true);
  });

  it("fails on a one-paisa divergence", () => {
    // "**exactly, to the paisa**", and EVALUATION_SPEC.md §4.9 requires
    // `suspense_identity_exact` to be true on every run.
    for (const delta of [-1, 1]) {
      const result = closeGate(
        healthy({
          unresolved_items: [
            queued(BANK_LINE_ID, "ABSTENTION", SUSPENSE_AMOUNT + delta),
          ],
        }),
      );

      expect(result.g3_suspense_identity).toBe(false);
      expect(codes(result, "g3_suspense_identity")).toContain("SUSPENSE_IDENTITY_MISMATCH");
    }
  });

  it("is gross, so two items on opposite sides cannot cancel", () => {
    // §10.1: Suspense receives value from both directions — P5 credits it, P6
    // debits it — so "a purely net identity is satisfiable by an attacker who
    // suppresses one item on each side (THREAT_MODEL.md §T8). The gross form
    // makes offsetting suppression arithmetically impossible."
    const key5 = entityId("bnk_", 7);
    const key6 = entityId("setl_", 7);
    const books = [
      draft({ journal_lines: p5(1_000_000, key5) }),
      draft({ journal_lines: p6(1_000_000, key6) }),
    ];

    const net = closeGate(
      // The two items net to exactly zero. A net identity would pass this.
      booksOf(books, { unresolved_items: [] }),
    );
    expect(net.g3_suspense_identity).toBe(false);

    const gross = closeGate(
      booksOf(books, {
        unresolved_items: [
          queued(key5, "ABSTENTION", 1_000_000),
          queued(key6, "EXCEPTION", 1_000_000),
        ],
      }),
    );
    expect(gross.g3_suspense_identity).toBe(true);
    expect(gross.suspense_gross_item_paise).toBe(2_000_000);
    // The net projected balance is zero while the gross item sum is not: the two
    // are different quantities, which is why DATA_MODEL.md §20 reports both.
    expect(gross.projection?.valueSuspensePaise).toBe(0);
  });

  it("takes the magnitude of each item, whichever side it sits on", () => {
    const key5 = entityId("bnk_", 8);
    const key6 = entityId("setl_", 8);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(700, key5) }),
          draft({ journal_lines: p6(300, key6) }),
        ],
        {
          unresolved_items: [
            queued(key5, "ABSTENTION", 700),
            queued(key6, "EXCEPTION", 300),
          ],
        },
      ),
    );

    const items = Object.fromEntries(
      result.suspense_items.map((item) => [item.source_entity_id, item]),
    );
    expect(items[key5]?.item_net_paise).toBe(-700);
    expect(items[key5]?.item_gross_paise).toBe(700);
    expect(items[key6]?.item_net_paise).toBe(300);
    expect(items[key6]?.item_gross_paise).toBe(300);
    expect(result.suspense_gross_item_paise).toBe(1000);
  });

  it("is per item, so two open items under two keys do not offset", () => {
    // §16 makes one `source_entity_id` one obligation, and §10.1: "two
    // genuinely open items cannot cancel each other".
    const keyA = entityId("bnk_", 11);
    const keyB = entityId("setl_", 11);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(500, keyA) }),
          draft({ journal_lines: p6(500, keyB) }),
        ],
        // One item suppressed on the queue side. Under any per-key netting this
        // would be invisible; under the gross per-item sum it is a 500-paise gap.
        { unresolved_items: [queued(keyA, "ABSTENTION", 500)] },
      ),
    );

    expect(result.g3_suspense_identity).toBe(false);
    expect(result.suspense_gross_item_paise).toBe(1000);
    expect(result.unresolved_value_paise).toBe(500);
  });

  it("drops an item that a P7 resolution reversed under the same key", () => {
    // §10.1: "open is arithmetic rather than a status flag: a P7 resolution
    // reverses under the same key, so a resolved item nets to zero and drops out
    // of the gross sum on its own."
    const key = entityId("bnk_", 12);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(900, key) }),
          draft({ journal_lines: p7(900, key) }),
        ],
        { unresolved_items: [] },
      ),
    );

    expect(result.suspense_items).toEqual([]);
    expect(result.suspense_gross_item_paise).toBe(0);
    expect(result.g3_suspense_identity).toBe(true);
  });

  it("sums an item across every event that touched its key", () => {
    // §16: `item_net_paise(k)` is computed "over the whole event log", not per
    // posting event — an evt_id partition is one of the four readings §10.1
    // ruled out at spec 1.4.0.
    const key = entityId("bnk_", 13);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(400, key) }),
          draft({ journal_lines: p5(600, key) }),
        ],
        { unresolved_items: [queued(key, "ABSTENTION", 1000)] },
      ),
    );

    expect(result.suspense_items).toHaveLength(1);
    expect(result.suspense_items[0]?.item_gross_paise).toBe(1000);
    expect(result.g3_suspense_identity).toBe(true);
  });

  it("reads only 9000_SUSPENSE lines", () => {
    // A posting that never touches Suspense opens no item, however large.
    const result = closeGate(
      booksOf(
        [
          draft({
            journal_lines: [
              line("1100_GATEWAY_RECEIVABLE", 8_000_000, 0, "P1.dr", entityId("pay_", 3)),
              line("4000_REVENUE", 0, 8_000_000, "P1.cr", entityId("pay_", 3)),
            ],
          }),
        ],
        { unresolved_items: [] },
      ),
    );

    expect(result.suspense_items).toEqual([]);
    expect(result.g3_suspense_identity).toBe(true);
  });

  it("names the key each store is missing, once the gate has already failed", () => {
    const inBooks = entityId("bnk_", 14);
    const inQueue = entityId("setl_", 14);
    // The two totals must differ for the gate to fail at all: §10.1 quantifies
    // it over the sums, so two disjoint keys of EQUAL value pass, as the test
    // below this one pins. 900 against 1000 is the smallest input that makes
    // both the mismatch and the two per-key diagnostics visible at once.
    const result = closeGate(
      booksOf([draft({ journal_lines: p5(1000, inBooks) })], {
        unresolved_items: [queued(inQueue, "EXCEPTION", 900)],
      }),
    );

    expect(result.g3_suspense_identity).toBe(false);
    expect(codes(result, "g3_suspense_identity")).toEqual([
      "SUSPENSE_IDENTITY_MISMATCH",
      "ITEM_MISSING_FROM_QUEUE",
      "ITEM_MISSING_FROM_BOOKS",
    ]);
    expect(findingFor(result, "ITEM_MISSING_FROM_QUEUE")?.subject).toBe(inBooks);
    expect(findingFor(result, "ITEM_MISSING_FROM_BOOKS")?.subject).toBe(inQueue);
  });

  it("names a key the two stores value differently", () => {
    const key = entityId("bnk_", 15);
    const result = closeGate(
      booksOf([draft({ journal_lines: p5(1000, key) })], {
        unresolved_items: [queued(key, "ABSTENTION", 900)],
      }),
    );

    expect(codes(result, "g3_suspense_identity")).toEqual([
      "SUSPENSE_IDENTITY_MISMATCH",
      "ITEM_VALUE_MISMATCH",
    ]);
    expect(findingFor(result, "ITEM_VALUE_MISMATCH")?.subject).toBe(key);
  });

  it("emits the per-key diagnostics only after the totals disagree", () => {
    // §10.1 quantifies the gate over the two SUMS. The per-key findings answer
    // "which item" for an analyst; they must never make the gate stricter than
    // the frozen text. Two keys that individually diverge but whose totals agree
    // therefore PASS.
    const keyA = entityId("bnk_", 16);
    const keyB = entityId("bnk_", 17);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(1000, keyA) }),
          draft({ journal_lines: p5(2000, keyB) }),
        ],
        {
          unresolved_items: [
            queued(keyA, "ABSTENTION", 2000),
            queued(keyB, "ABSTENTION", 1000),
          ],
        },
      ),
    );

    expect(result.g3_suspense_identity).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("splits the queue into its abstention and open-exception halves", () => {
    const keyA = entityId("bnk_", 18);
    const keyB = entityId("setl_", 18);
    const result = closeGate(
      booksOf(
        [
          draft({ journal_lines: p5(1200, keyA) }),
          draft({ journal_lines: p6(800, keyB) }),
        ],
        {
          unresolved_items: [
            queued(keyA, "ABSTENTION", 1200),
            queued(keyB, "EXCEPTION", 800),
          ],
        },
      ),
    );

    expect(result.value_abstained_paise).toBe(1200);
    expect(result.value_exceptions_paise).toBe(800);
    expect(result.unresolved_value_paise).toBe(2000);
  });

  it("compares the total, so the split is reported and never gated on", () => {
    // DATA_MODEL.md §20 splits the figure for the report; §10.1 quantifies G3
    // over the total. Moving value across the split must not move the gate.
    const both = closeGate(
      healthy({
        unresolved_items: [queued(BANK_LINE_ID, "EXCEPTION", SUSPENSE_AMOUNT)],
      }),
    );

    expect(both.g3_suspense_identity).toBe(true);
    expect(both.value_abstained_paise).toBe(0);
    expect(both.value_exceptions_paise).toBe(SUSPENSE_AMOUNT);
  });

  it("admits several queue records under one key", () => {
    // §17.1.1 can open one item that two records account for; the identity is
    // between sums, so the queue side aggregates by key.
    const key = entityId("bnk_", 19);
    const result = closeGate(
      booksOf([draft({ journal_lines: p5(1000, key) })], {
        unresolved_items: [
          queued(key, "ABSTENTION", 600),
          queued(key, "EXCEPTION", 400),
        ],
      }),
    );

    expect(result.g3_suspense_identity).toBe(true);
    expect(result.value_abstained_paise).toBe(600);
    expect(result.value_exceptions_paise).toBe(400);
  });

  it("does not depend on the order the queue records arrived in", () => {
    const items = [
      queued(entityId("bnk_", 20), "ABSTENTION", 300),
      queued(entityId("setl_", 20), "EXCEPTION", 700),
    ];
    const books = [
      draft({ journal_lines: p5(300, entityId("bnk_", 20)) }),
      draft({ journal_lines: p6(700, entityId("setl_", 20)) }),
    ];

    const forward = closeGate(booksOf(books, { unresolved_items: items }));
    const reversed = closeGate(booksOf(books, { unresolved_items: [...items].reverse() }));

    expect(reversed.unresolved_value_paise).toBe(forward.unresolved_value_paise);
    expect(reversed.value_abstained_paise).toBe(forward.value_abstained_paise);
    expect(reversed.g3_suspense_identity).toBe(forward.g3_suspense_identity);
  });

  it("throws rather than reports on a malformed queue record", () => {
    expect(() =>
      closeGate(healthy({ unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", -1)] })),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(healthy({ unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", 1.5)] })),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(
        healthy({
          unresolved_items: [
            {
              source_entity_id: BANK_LINE_ID,
              origin: "WRITE_OFF" as UnresolvedItemRecord["origin"],
              value_paise: 1 as Paise,
            },
          ],
        }),
      ),
    ).toThrow(ProjectionInputError);
  });

  it("validates the queue even when the books could not be projected", () => {
    // The queue side is the caller's argument, so a defect in it throws whether
    // or not the log projected.
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const broken = storedCopy(chain.events);
    (broken[0] as Record<string, unknown>)["journal_lines"] = [
      { ...line("1200_BANK", 1, 0, "dr"), account: "7777_NOT_AN_ACCOUNT" },
    ];

    expect(() =>
      closeGate(
        healthy({
          events: asEvents(broken),
          stored_root_hash: chain.root_hash,
          unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", -5)],
        }),
      ),
    ).toThrow(ProjectionInputError);
  });
});

// ---------------------------------------------------------------------------
// G4 — the hash chain
// ---------------------------------------------------------------------------

describe("G4 — the chain recomputes from genesis and matches the stored root", () => {
  it("passes on an untouched chain", () => {
    const result = closeGate(healthy());

    expect(result.g4_hash_chain).toBe(true);
    expect(result.recomputed_root_hash).toBe(healthy().stored_root_hash);
  });

  it("fails, and fails alone, when the stored root is not the recomputed one", () => {
    // The purest G4 failure available: the books balance, nothing was dropped,
    // the identity holds, no invariant was posted — and the published root does
    // not match what the log recomputes to.
    const result = closeGate(healthy({ stored_root_hash: digest(4242) }));

    expect(verdict(result)).toEqual(allPassExcept("g4_hash_chain"));
    expect(codes(result, "g4_hash_chain")).toEqual(["CHAIN_CHECK_FAILED"]);
  });

  it("reports the recomputed root whether or not it matched", () => {
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const result = closeGate(
      healthy({ events: chain.events, stored_root_hash: digest(4243) }),
    );

    expect(result.g4_hash_chain).toBe(false);
    expect(result.recomputed_root_hash).toBe(chain.root_hash);
  });

  it("fails on an event altered after storage, and names it", () => {
    // §10.1: a G4 failure means "the audit trail was altered".
    const chain = chainOf([
      draft({ journal_lines: p5(SUSPENSE_AMOUNT) }),
      draft({ journal_lines: p5(1000, entityId("bnk_", 21)) }),
    ]);
    const tampered = storedCopy(chain.events);
    // `inputs_hash` is inside `body` — "hash of everything the step read"
    // (§16) — so rewriting it is exactly the kind of alteration the chain is
    // built to make evident, and it moves no money, so G2 and G3 stay clean.
    (tampered[1] as Record<string, unknown>)["inputs_hash"] = digest(8181);

    const result = closeGate(
      healthy({
        events: asEvents(tampered),
        stored_root_hash: chain.root_hash,
        unresolved_items: [
          queued(BANK_LINE_ID, "ABSTENTION", SUSPENSE_AMOUNT),
          queued(entityId("bnk_", 21), "ABSTENTION", 1000),
        ],
      }),
    );

    expect(result.g4_hash_chain).toBe(false);
    const failure = findingFor(result, "CHAIN_CHECK_FAILED");
    expect(failure?.gate).toBe("g4_hash_chain");
    expect(failure?.subject).toBe(chain.events[1]?.evt_id);
  });

  it("does not detect an altered timestamp, which is a declared residual", () => {
    // `hash-chain.ts` reproduces the residual rather than leaving it to be
    // re-derived: `ts` is outside `body` because `evt_id`, `run_id` and `ts`
    // "all vary between two executions over identical inputs, which metric 23
    // (determinism_check) requires to produce identical root hashes", and so
    // "altering an event's timestamp is not chain-detectable"
    // (THREAT_MODEL.md §T10). ARCHITECTURE.md §8 states the honest limit of the
    // whole mechanism: it makes tampering evident, not impossible. This test
    // exists so that limit is asserted somewhere rather than merely written
    // down — a future change that silently folded `ts` into `body` would break
    // determinism, and this is where it would be noticed.
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const tampered = storedCopy(chain.events);
    (tampered[0] as Record<string, unknown>)["ts"] = 1_787_999_999;

    const result = closeGate(
      healthy({ events: asEvents(tampered), stored_root_hash: chain.root_hash }),
    );

    expect(result.g4_hash_chain).toBe(true);
    expect(result.all_passed).toBe(true);
  });

  it("fails when the chain is verified against the wrong genesis", () => {
    const result = closeGate(healthy({ genesis_hash: digest(777) }));

    expect(result.g4_hash_chain).toBe(false);
    expect(codes(result, "g4_hash_chain")).toContain("CHAIN_CHECK_FAILED");
  });

  it("passes over an empty log", () => {
    // A run that posted nothing still has a chain: the root is genesis.
    const empty = createChain(GENESIS, RUN_ID);
    const result = closeGate(
      healthy({
        events: empty.events,
        stored_root_hash: empty.root_hash,
        unresolved_items: [],
      }),
    );

    expect(result.g4_hash_chain).toBe(true);
    expect(result.recomputed_root_hash).toBe(GENESIS);
    expect(result.g3_suspense_identity).toBe(true);
  });

  it("throws on a digest argument that is not a digest", () => {
    expect(() => closeGate(healthy({ genesis_hash: "cafe" as CloseGateInput["genesis_hash"] })))
      .toThrow(ProjectionInputError);
    expect(() =>
      closeGate(healthy({ stored_root_hash: "CAFE".repeat(16) as CloseGateInput["stored_root_hash"] })),
    ).toThrow(ProjectionInputError);
  });
});

// ---------------------------------------------------------------------------
// G5 — the validation gate was not bypassed
// ---------------------------------------------------------------------------

describe("G5 — no allocation with a non-empty invariants_failed was posted", () => {
  it("passes when every posted decision carries an empty list", () => {
    const result = closeGate(
      healthy({ posted_decisions: [posted(DEC_ID), posted(id("dec_", 2))] }),
    );

    expect(result.g5_no_failed_invariant_posted).toBe(true);
  });

  it("passes when nothing posted at all", () => {
    expect(closeGate(healthy({ posted_decisions: [] })).g5_no_failed_invariant_posted).toBe(
      true,
    );
  });

  it("fails, and fails alone, on a decision that posted with a failure", () => {
    // §7 makes an invariant failure "never partially posted, never repaired";
    // §10.1 reads a posted one as "the validation gate was bypassed".
    const result = closeGate(healthy({ posted_decisions: [posted(DEC_ID, ["I3"])] }));

    expect(verdict(result)).toEqual(allPassExcept("g5_no_failed_invariant_posted"));
    expect(codes(result, "g5_no_failed_invariant_posted")).toEqual([
      "INVARIANT_FAILED_DECISION_POSTED",
    ]);
    expect(findingFor(result, "INVARIANT_FAILED_DECISION_POSTED")?.subject).toBe(DEC_ID);
  });

  it("fails on any of the nine invariants", () => {
    for (const invariant of ["I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9"] as const) {
      const result = closeGate(
        healthy({ posted_decisions: [posted(DEC_ID, [invariant])] }),
      );
      expect(result.g5_no_failed_invariant_posted).toBe(false);
    }
  });

  it("names every offending decision", () => {
    const result = closeGate(
      healthy({
        posted_decisions: [
          posted(id("dec_", 5), ["I2"]),
          posted(id("dec_", 6)),
          posted(id("dec_", 7), ["I4", "I8"]),
        ],
      }),
    );

    expect(codes(result, "g5_no_failed_invariant_posted")).toEqual([
      "INVARIANT_FAILED_DECISION_POSTED",
      "INVARIANT_FAILED_DECISION_POSTED",
    ]);
    expect(result.findings.map((f) => f.subject)).toEqual([id("dec_", 5), id("dec_", 7)]);
  });

  it("is a scan over a recorded value, not a type constraint", () => {
    // validated-decision.ts: `invariants_failed` is "typed as an array rather
    // than never[] because G5 is a runtime check over a recorded value: a type
    // that made non-emptiness unrepresentable would move the guarantee from the
    // gate into the compiler and leave G5 verifying a tautology". The record
    // below is what a bypass looks like when read back from storage.
    const fromStorage = JSON.parse(
      `[{"decision_id":"${DEC_ID}","invariants_failed":["I6"]}]`,
    ) as PostedDecisionRecord[];

    expect(
      closeGate(healthy({ posted_decisions: fromStorage })).g5_no_failed_invariant_posted,
    ).toBe(false);
  });

  it("throws on a malformed posted-decision record", () => {
    expect(() =>
      closeGate(
        healthy({
          posted_decisions: [
            {
              decision_id: DEC_ID,
              invariants_failed: ["I10"] as unknown as PostedDecisionRecord["invariants_failed"],
            },
          ],
        }),
      ),
    ).toThrow(ProjectionInputError);

    expect(() =>
      closeGate(
        healthy({
          posted_decisions: [
            {
              decision_id: DEC_ID,
              invariants_failed: "I1" as unknown as PostedDecisionRecord["invariants_failed"],
            },
          ],
        }),
      ),
    ).toThrow(ProjectionInputError);
  });
});

// ---------------------------------------------------------------------------
// The verdict as a whole
// ---------------------------------------------------------------------------

describe("the gate reports, and does not decide", () => {
  it("carries DATA_MODEL.md §20's five field names, in §10.1 order", () => {
    // A rename here would silently rename a frozen metric's dimension:
    // EVALUATION_SPEC.md §4.9 counts `close_gate_failures` per gate under them.
    expect(CLOSE_GATE_IDS).toEqual([
      "g1_all_terminal",
      "g2_trial_balance",
      "g3_suspense_identity",
      "g4_hash_chain",
      "g5_no_failed_invariant_posted",
    ]);
  });

  it("returns all five booleans however many failed", () => {
    // ARCHITECTURE.md §9: close "returns the individual gate results rather than
    // a boolean, because 'why won't it close' is the question an analyst
    // actually asks".
    const result = closeGate(
      healthy({
        terminal_states: [],
        stored_root_hash: digest(5150),
        unresolved_items: [],
        posted_decisions: [posted(DEC_ID, ["I5"])],
      }),
    );

    for (const gate of CLOSE_GATE_IDS) {
      expect(typeof result[gate]).toBe("boolean");
    }
  });

  it("names every gate that failed, not only the first", () => {
    // §10.4 reads as a sequence of assertions that stop at the first failure;
    // this evaluates all five. The outcome is identical — §10.2 sends "any gate
    // fails" to BLOCKED however many did — and an analyst is told more.
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const tampered = storedCopy(chain.events);
    (tampered[0] as Record<string, unknown>)["journal_lines"] = [
      line(SUSPENSE_ACCOUNT, 0, SUSPENSE_AMOUNT, "P5.cr"),
    ];

    const result = closeGate(
      healthy({
        events: asEvents(tampered),
        stored_root_hash: digest(5151),
        terminal_states: [],
        unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", 1)],
        posted_decisions: [posted(DEC_ID, ["I1"])],
      }),
    );

    expect(result.failed_gates).toEqual([...CLOSE_GATE_IDS]);
    expect(result.all_passed).toBe(false);
  });

  it("orders failed_gates and findings by §10.1's gate order", () => {
    const result = closeGate(
      healthy({
        posted_decisions: [posted(DEC_ID, ["I2"])],
        terminal_states: [],
        stored_root_hash: digest(5152),
      }),
    );

    expect(result.failed_gates).toEqual([
      "g1_all_terminal",
      "g4_hash_chain",
      "g5_no_failed_invariant_posted",
    ]);

    const order = result.findings.map((f) => f.gate);
    const ranked = order.map((gate) => CLOSE_GATE_IDS.indexOf(gate));
    expect([...ranked].sort((a, b) => a - b)).toEqual(ranked);
  });

  it("makes all_passed exactly the emptiness of failed_gates", () => {
    // §10.2 turns on this single condition and no other.
    expect(closeGate(healthy()).all_passed).toBe(true);
    expect(closeGate(healthy()).failed_gates).toHaveLength(0);

    const failed = closeGate(healthy({ posted_decisions: [posted(DEC_ID, ["I9"])] }));
    expect(failed.all_passed).toBe(false);
    expect(failed.failed_gates).toHaveLength(1);
  });

  it("converts nothing into a period status", () => {
    // Keeping the gate and the policy apart is what makes "any gate fails →
    // BLOCKED" a single unavoidable line in close.ts rather than a rule
    // scattered across five checks.
    const result: CloseGateResult = closeGate(healthy());

    expect(Object.keys(result)).not.toContain("period_status");
    expect(Object.keys(result)).not.toContain("close_threshold_paise");
  });

  it("is deterministic in its arguments", () => {
    // The same log and the same records produce an identical result, findings
    // and all.
    const input = healthy({
      terminal_states: [],
      posted_decisions: [posted(DEC_ID, ["I7"])],
    });

    expect(closeGate(input)).toEqual(closeGate(input));
  });

  it("performs no I/O and reads no clock", () => {
    // §10.1's re-projection rule: "a gate that could read a stored balance could
    // be handed one". Two calls separated in wall-clock terms are identical.
    const input = healthy();
    const first = closeGate(input);
    const second = closeGate(input);

    expect(second).toEqual(first);
    expect(second.recomputed_root_hash).toBe(first.recomputed_root_hash);
  });

  it("holds a human actor's events to the same arithmetic", () => {
    // §10.3 permits a manual close; it does not soften a gate.
    const chain = chainOf([
      draft({
        journal_lines: p5(SUSPENSE_AMOUNT),
        actor: makeActor({ type: "human", component: "operator.finance" }),
      }),
    ]);
    const result = closeGate(
      healthy({ events: chain.events, stored_root_hash: chain.root_hash }),
    );

    expect(result.all_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The two stores
// ---------------------------------------------------------------------------

describe("the two sides of G3 are drawn from two stores, which is the point", () => {
  it("catches a suppression on the queue side", () => {
    // §10.1: "They span one universe and are maintained independently, so a
    // suppression on either side breaks the identity."
    const key = entityId("bnk_", 30);
    const result = closeGate(
      booksOf([draft({ journal_lines: p5(2_500_000, key) })], { unresolved_items: [] }),
    );

    expect(result.g3_suspense_identity).toBe(false);
    expect(codes(result, "g3_suspense_identity")).toContain("ITEM_MISSING_FROM_QUEUE");
  });

  it("catches a suppression on the books side", () => {
    const key = entityId("setl_", 30);
    const result = closeGate(
      booksOf([], { unresolved_items: [queued(key, "EXCEPTION", 2_500_000)] }),
    );

    expect(result.g3_suspense_identity).toBe(false);
    expect(codes(result, "g3_suspense_identity")).toContain("ITEM_MISSING_FROM_BOOKS");
  });

  it("leaves an exception whose class opens no Suspense item out of both sums", () => {
    // §10.1: "An exception whose class opens no Suspense item (DATA_MODEL.md
    // §17.1.1) is in neither sum; it cannot be suppressed either, because G1
    // still requires it to hold a terminal state."
    const result = closeGate(
      healthy({
        observations: [
          observation(OBS_BANK, "bank_line"),
          observation(OBS_SETTLEMENT, "settlement"),
        ],
        terminal_states: [
          state(OBS_BANK, "ABSTAINED"),
          // An E05-class exception: a terminal state, and no Suspense item.
          state(OBS_SETTLEMENT, "EXCEPTION"),
        ],
      }),
    );

    expect(result.g1_all_terminal).toBe(true);
    expect(result.g3_suspense_identity).toBe(true);
    expect(result.decisions.EXCEPTION).toBe(1);
    expect(result.unresolved_value_paise).toBe(SUSPENSE_AMOUNT);
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("the module is pure", () => {
  it("does not mutate its argument", () => {
    const input = healthy();
    const before = JSON.stringify({
      observations: input.observations,
      terminal_states: input.terminal_states,
      unresolved_items: input.unresolved_items,
      posted_decisions: input.posted_decisions,
    });

    closeGate(input);

    expect(
      JSON.stringify({
        observations: input.observations,
        terminal_states: input.terminal_states,
        unresolved_items: input.unresolved_items,
        posted_decisions: input.posted_decisions,
      }),
    ).toBe(before);
  });

  it("re-projects on every call rather than caching", () => {
    const chain = chainOf([draft({ journal_lines: p5(SUSPENSE_AMOUNT) })]);
    const events: LedgerEvent[] = [...chain.events];

    const first = closeGate(
      healthy({ events, stored_root_hash: chain.root_hash }),
    );
    expect(first.suspense_gross_item_paise).toBe(SUSPENSE_AMOUNT);

    const longer = chainOf([
      draft({ journal_lines: p5(SUSPENSE_AMOUNT) }),
      draft({ journal_lines: p5(1000, entityId("bnk_", 31)) }),
    ]);
    const second = closeGate(
      healthy({
        events: longer.events,
        stored_root_hash: longer.root_hash,
        unresolved_items: [
          queued(BANK_LINE_ID, "ABSTENTION", SUSPENSE_AMOUNT),
          queued(entityId("bnk_", 31), "ABSTENTION", 1000),
        ],
      }),
    );

    expect(second.suspense_gross_item_paise).toBe(SUSPENSE_AMOUNT + 1000);
  });
});
