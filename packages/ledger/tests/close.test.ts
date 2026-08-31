import { describe, expect, it } from "vitest";

import { SUSPENSE_ACCOUNT, type ObservationKind, type UnixSeconds } from "@assay/domain";
import type { Paise } from "@assay/money";

import {
  ProjectionInputError,
  appendEvent,
  computeGenesisHash,
  createChain,
  type EventActor,
  type EventId,
  type LedgerChain,
  type LedgerEventDraft,
} from "@assay/ledger";

import type {
  CloseGateInput,
  CloseObservationRecord,
  PostedDecisionRecord,
  TerminalStateRecord,
  UnresolvedItemRecord,
} from "../src/close-gate.js";
import {
  LEGACY_MAX_UNRESOLVED_ABS_PAISE,
  MAX_UNRESOLVED_RATIO_BPS,
  attemptClose,
  closeThresholdPaise,
  legacyCloseThresholdPaise,
  periodStatusFrom,
  type CloseAttemptInput,
  type ClosedBy,
} from "../src/close.js";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  RUN_ID,
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
 * The close attempt — `RECONCILIATION_SPEC.md §10.2`, `§10.3` and `§10.4`.
 *
 * *"The loop ends in a close attempt, which is a deterministic procedure with
 * three possible outcomes. **A finance period that cannot be closed honestly
 * must not be closed.**"*
 *
 * These import `../src/close.js` directly, on `write.test.ts`'s convention: the
 * package's public surface is wired at integration, and a test that waited for
 * the barrel would be testing the barrel.
 */

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

let nextEvent = 0;
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

const OBS_BANK = id("obs_", 1);
const OBS_SETTLEMENT = id("obs_", 2);
const DEC_ID = id("dec_", 1);

const PERIOD_FROM = 1_786_000_000 as UnixSeconds;
const PERIOD_TO = 1_788_000_000 as UnixSeconds;

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
 * A gate input on which all five gates pass, leaving `unresolved` in Suspense.
 *
 * One `P5` posting opens one item at `unresolved` paise and the queue carries
 * exactly it, so `G3` holds as an equality between two non-zero sums and
 * `unresolved_value_paise` is a figure the close policy can actually bite on.
 */
function passingGate(unresolved: number, overrides: Partial<CloseGateInput> = {}): CloseGateInput {
  const chain =
    unresolved === 0
      ? createChain(GENESIS, RUN_ID)
      : chainOf([draft({ journal_lines: p5Lines(unresolved, BANK_LINE_ID) })]);

  return {
    genesis_hash: GENESIS,
    stored_root_hash: chain.root_hash,
    events: chain.events,
    observations: [
      observation(OBS_BANK, "bank_line"),
      observation(OBS_SETTLEMENT, "settlement"),
    ],
    terminal_states: [
      state(OBS_BANK, "ABSTAINED"),
      state(OBS_SETTLEMENT, "RECONCILED"),
    ],
    unresolved_items:
      unresolved === 0 ? [] : [queued(BANK_LINE_ID, "ABSTENTION", unresolved)],
    posted_decisions: [posted(DEC_ID)],
    ...overrides,
  };
}

const SYSTEM_ACTOR: EventActor = makeActor({ component: "ledger.close" });
const HUMAN_ACTOR: EventActor = makeActor({
  type: "human",
  component: "operator.finance",
});

function closeInput(overrides: Partial<CloseAttemptInput> = {}): CloseAttemptInput {
  return {
    run_id: RUN_ID,
    period: { from: PERIOD_FROM, to: PERIOD_TO },
    gate: passingGate(0),
    batch_value_paise: 2_700_000_000 as Paise,
    unresolved_value_paise_multiview: 0 as Paise,
    closed_by: { actor: "system", id: null },
    close_event: {
      evt_id: id("evt_", 900) as EventId,
      ts: 1_788_000_100 as UnixSeconds,
      actor: SYSTEM_ACTOR,
    },
    ...overrides,
  };
}

/** The five ways to break exactly one gate, each leaving the other four intact. */
const BREAKERS: readonly {
  readonly gate: string;
  readonly break: (unresolved: number) => CloseGateInput;
}[] = [
  {
    gate: "g1_all_terminal",
    break: (u) => passingGate(u, { terminal_states: [state(OBS_BANK, "ABSTAINED")] }),
  },
  {
    gate: "g2_trial_balance",
    break: (u) => {
      // G2 can only fail on a log edited after storage: `appendEvent` asserts
      // I1 per event, so no chain this package built is unbalanced
      // (THREAT_MODEL.md §T10). G4 falls with it, which is the honest reading —
      // an edit that unbalances the books also breaks the digest over them.
      const chain = chainOf([draft({ journal_lines: p5Lines(u || 1000, BANK_LINE_ID) })]);
      const tampered = storedCopy(chain.events);
      (tampered[0] as Record<string, unknown>)["journal_lines"] = [
        line(SUSPENSE_ACCOUNT, 0, u || 1000, "P5.cr"),
      ];
      return passingGate(u, {
        events: asEvents(tampered),
        stored_root_hash: chain.root_hash,
        unresolved_items:
          u === 0 ? [] : [queued(BANK_LINE_ID, "ABSTENTION", u)],
      });
    },
  },
  {
    gate: "g3_suspense_identity",
    break: (u) =>
      passingGate(u, {
        unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", u + 1)],
      }),
  },
  {
    gate: "g4_hash_chain",
    break: (u) => passingGate(u, { stored_root_hash: digest(31_337) }),
  },
  {
    gate: "g5_no_failed_invariant_posted",
    break: (u) => passingGate(u, { posted_decisions: [posted(DEC_ID, ["I3"])] }),
  },
];

// ---------------------------------------------------------------------------
// §10.3 — the pre-registered close policy
// ---------------------------------------------------------------------------

describe("the pre-registered close policy", () => {
  it("freezes the ratio at PREREGISTRATION.md §7's 50 bps", () => {
    expect(MAX_UNRESOLVED_RATIO_BPS).toBe(50);
    expect(LEGACY_MAX_UNRESOLVED_ABS_PAISE).toBe(5_000_000);
  });

  it("computes round_half_up(batch_value_paise * 5 / 1000)", () => {
    // §10.3's formula, character for character. `50 / 10_000` and `5 / 1_000`
    // are the same rational, so the rounded result is identical for every input.
    expect(closeThresholdPaise(0 as Paise)).toBe(0);
    expect(closeThresholdPaise(200 as Paise)).toBe(1);
    expect(closeThresholdPaise(1_000_000 as Paise)).toBe(5_000);
    // A conforming run: S1 requires 10,000 observations, which at §4.2's frozen
    // amount distribution puts every one above ₹2.7 crore of batch value.
    expect(closeThresholdPaise(2_700_000_000 as Paise)).toBe(13_500_000);
  });

  it("rounds half UP, never half to even and never down", () => {
    // DATA_MODEL.md §0 rule 1 admits no other rounding and §10.3 names it.
    expect(closeThresholdPaise(100 as Paise)).toBe(1); // 0.5 exactly
    expect(closeThresholdPaise(300 as Paise)).toBe(2); // 1.5 exactly
    expect(closeThresholdPaise(500 as Paise)).toBe(3); // 2.5 exactly
    expect(closeThresholdPaise(99 as Paise)).toBe(0); // 0.495
    expect(closeThresholdPaise(101 as Paise)).toBe(1); // 0.505
  });

  it("is integer throughout, with no floating-point intermediate", () => {
    // §L.1 rule 1 requires integer paise "including intermediates". A large
    // batch whose product would lose precision as a float still lands exactly.
    const batch = 8_999_999_999_999 as Paise;
    expect(closeThresholdPaise(batch)).toBe(45_000_000_000);
    expect(Number.isSafeInteger(closeThresholdPaise(batch))).toBe(true);
  });

  it("is scale-invariant, which is the whole point of the v1.0.1 correction", () => {
    // §10.3: "the threshold is a fixed proportion of period value at every batch
    // size". Under the deleted absolute arm, effective strictness varied 40x
    // across the 1k / 10k / 100k sweep EVALUATION_SPEC.md §5.3 mandates.
    for (const batch of [1_000_000_000, 10_000_000_000, 100_000_000_000]) {
      expect(closeThresholdPaise(batch as Paise) * 10).toBe(
        closeThresholdPaise((batch * 10) as Paise),
      );
    }
  });

  it("refuses a negative batch value", () => {
    expect(() => closeThresholdPaise(-1 as Paise)).toThrow(RangeError);
  });

  it("keeps the v1.0.0 policy as min(0.005 x batch, ₹50,000)", () => {
    // EXPLORATORY, for `period_status_legacy_policy`'s adjacent column. Never a
    // gate: §10.3 records that the absolute arm "never bound on any conforming
    // run".
    expect(legacyCloseThresholdPaise(1_000_000 as Paise)).toBe(5_000);
    expect(legacyCloseThresholdPaise(100_000_000_000 as Paise)).toBe(
      LEGACY_MAX_UNRESOLVED_ABS_PAISE,
    );
  });

  it("crosses the two bounds at exactly ₹1 crore of batch value", () => {
    // §10.3: "The two bounds cross at exactly ₹1 crore of batch value."
    const crore = 1_000_000_000 as Paise;
    expect(closeThresholdPaise(crore)).toBe(LEGACY_MAX_UNRESOLVED_ABS_PAISE);
    expect(legacyCloseThresholdPaise(crore)).toBe(LEGACY_MAX_UNRESOLVED_ABS_PAISE);

    // Below the crossover the ratio governs and the two agree.
    expect(legacyCloseThresholdPaise(999_999_800 as Paise)).toBe(
      closeThresholdPaise(999_999_800 as Paise),
    );
    // Above it the absolute arm binds, and the current policy is the looser one.
    expect(legacyCloseThresholdPaise(2_000_000_000 as Paise)).toBe(5_000_000);
    expect(closeThresholdPaise(2_000_000_000 as Paise)).toBe(10_000_000);
  });

  it("never lets the legacy threshold exceed the cap", () => {
    for (const batch of [0, 1, 1_000, 1_000_000_000, 50_000_000_000]) {
      expect(legacyCloseThresholdPaise(batch as Paise)).toBeLessThanOrEqual(
        LEGACY_MAX_UNRESOLVED_ABS_PAISE,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §10.2 — the three outcomes
// ---------------------------------------------------------------------------

describe("the three outcomes", () => {
  it("closes when every gate passed and unresolved is within the threshold", () => {
    expect(periodStatusFrom(true, 0 as Paise, 100 as Paise)).toBe("CLOSED");
    expect(periodStatusFrom(true, 99 as Paise, 100 as Paise)).toBe("CLOSED");
  });

  it("closes at exact equality, per §10.3's <=", () => {
    // "period may auto-close iff unresolved_value_paise <= close_threshold_paise".
    expect(periodStatusFrom(true, 100 as Paise, 100 as Paise)).toBe("CLOSED");
  });

  it("opens one paisa above the threshold", () => {
    expect(periodStatusFrom(true, 101 as Paise, 100 as Paise)).toBe("OPEN");
  });

  it("blocks on a failing gate whatever the arithmetic says", () => {
    // The gate test comes first and unconditionally. §L.1 rule 7: no threshold,
    // no operator and no argument can turn a failing gate into a close.
    expect(periodStatusFrom(false, 0 as Paise, 0 as Paise)).toBe("BLOCKED");
    expect(periodStatusFrom(false, 0 as Paise, Number.MAX_SAFE_INTEGER as Paise)).toBe(
      "BLOCKED",
    );
    expect(periodStatusFrom(false, 1 as Paise, 1_000_000 as Paise)).toBe("BLOCKED");
  });

  it("keeps OPEN and BLOCKED apart", () => {
    // §10.2: "OPEN is a business state; BLOCKED is a defect. Conflating them
    // would be a design error in either direction."
    const overThreshold = periodStatusFrom(true, 1_000 as Paise, 1 as Paise);
    const gateFailed = periodStatusFrom(false, 1_000 as Paise, 1 as Paise);

    expect(overThreshold).toBe("OPEN");
    expect(gateFailed).toBe("BLOCKED");
    expect(overThreshold).not.toBe(gateFailed);
  });
});

// ---------------------------------------------------------------------------
// §10.4 — the procedure, end to end
// ---------------------------------------------------------------------------

describe("attemptClose runs §10.4 end to end", () => {
  it("reaches CLOSED and emits a report and a CLOSE event", () => {
    const attempt = attemptClose(closeInput());

    expect(attempt.period_status).toBe("CLOSED");
    expect(attempt.report).not.toBeNull();
    expect(attempt.close_event).not.toBeNull();
    expect(attempt.gate.all_passed).toBe(true);
  });

  it("reaches OPEN and still emits a report", () => {
    // §10.2: OPEN is "close report emitted and marked OPEN". A period ending
    // OPEN is "the normal, expected outcome when the input contains real
    // ambiguity".
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(20_000_000),
        batch_value_paise: 1_000_000_000 as Paise, // threshold 5,000,000
      }),
    );

    expect(attempt.period_status).toBe("OPEN");
    expect(attempt.report).not.toBeNull();
    expect(attempt.report?.period_status).toBe("OPEN");
    expect(attempt.close_event).not.toBeNull();
    expect(attempt.report?.unresolved_value_paise).toBe(20_000_000);
  });

  it("carries the unresolved split and the item detail an analyst works from", () => {
    // §10.2: the OPEN report carries "unresolved_value_paise, its split across
    // abstentions vs exceptions, the ranked work queue, and the owner role for
    // each item". The first two and the items are this package's; the ranking
    // and the owner role are the run harness's.
    const key = entityId("setl_", 40);
    const chain = chainOf([
      draft({
        journal_lines: [
          line(SUSPENSE_ACCOUNT, 6_000_000, 0, "P6.dr", key),
          line("1100_GATEWAY_RECEIVABLE", 0, 6_000_000, "P6.cr", key),
        ],
      }),
    ]);
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(0, {
          events: chain.events,
          stored_root_hash: chain.root_hash,
          unresolved_items: [queued(key, "EXCEPTION", 6_000_000)],
        }),
        batch_value_paise: 100_000_000 as Paise, // threshold 500,000
      }),
    );

    expect(attempt.period_status).toBe("OPEN");
    expect(attempt.report?.value_abstained_paise).toBe(0);
    expect(attempt.report?.value_exceptions_paise).toBe(6_000_000);
    expect(attempt.report?.suspense_items).toHaveLength(1);
    expect(attempt.report?.suspense_items[0]?.source_entity_id).toBe(key);
  });

  it("emits NO close report on BLOCKED", () => {
    // §10.2 gives BLOCKED "NO close report"; §L.1 rule 7 says the same from the
    // other end; DATA_MODEL.md §20 says why the absence carries meaning: "its
    // existence is a positive assertion that all five gates passed".
    const attempt = attemptClose(
      closeInput({ gate: passingGate(0, { stored_root_hash: digest(9001) }) }),
    );

    expect(attempt.period_status).toBe("BLOCKED");
    expect(attempt.report).toBeNull();
    expect(attempt.close_event).toBeNull();
  });

  it("names the failing gate on BLOCKED", () => {
    // §10.2: "Run marked `invalid`. The failing gate is named." Marking the run
    // is the caller's, because it is a mutation and this module performs none.
    const attempt = attemptClose(
      closeInput({ gate: passingGate(0, { posted_decisions: [posted(DEC_ID, ["I4"])] }) }),
    );

    expect(attempt.gate.failed_gates).toEqual(["g5_no_failed_invariant_posted"]);
    expect(attempt.gate.g5_no_failed_invariant_posted).toBe(false);
  });

  it("returns all five gate results on BLOCKED, not a boolean", () => {
    // ARCHITECTURE.md §9: "why won't it close" is the question an analyst
    // actually asks.
    const attempt = attemptClose(
      closeInput({ gate: passingGate(0, { stored_root_hash: digest(9002) }) }),
    );

    expect(attempt.gate.g1_all_terminal).toBe(true);
    expect(attempt.gate.g2_trial_balance).toBe(true);
    expect(attempt.gate.g3_suspense_identity).toBe(true);
    expect(attempt.gate.g4_hash_chain).toBe(false);
    expect(attempt.gate.g5_no_failed_invariant_posted).toBe(true);
  });

  it("blocks on each of the five gates, one at a time", () => {
    for (const breaker of BREAKERS) {
      const attempt = attemptClose(closeInput({ gate: breaker.break(0) }));

      expect(attempt.period_status).toBe("BLOCKED");
      expect(attempt.report).toBeNull();
      expect(attempt.close_event).toBeNull();
      expect(attempt.gate.failed_gates).toContain(breaker.gate);
    }
  });

  it("returns a frozen attempt", () => {
    const attempt = attemptClose(closeInput());

    expect(Object.isFrozen(attempt)).toBe(true);
    expect(Object.isFrozen(attempt.report)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The gate cannot be bought off
// ---------------------------------------------------------------------------

describe("a failing gate cannot be bypassed", () => {
  it("is not bypassed by a threshold wide enough to swallow everything", () => {
    // The gate test comes FIRST and UNCONDITIONALLY. A batch value large enough
    // to make the threshold enormous, against zero unresolved value, still
    // BLOCKS on every one of the five gates.
    for (const breaker of BREAKERS) {
      const attempt = attemptClose(
        closeInput({
          gate: breaker.break(0),
          batch_value_paise: 900_000_000_000 as Paise,
        }),
      );

      expect(attempt.close_threshold_paise).toBe(4_500_000_000);
      expect(attempt.gate.unresolved_value_paise).toBeLessThanOrEqual(
        attempt.close_threshold_paise,
      );
      expect(attempt.period_status).toBe("BLOCKED");
      expect(attempt.report).toBeNull();
    }
  });

  it("is not bypassed by an operator closing manually", () => {
    // §10.3 permits the override and requires it to be recorded rather than
    // silent. It is not a way past a gate.
    for (const breaker of BREAKERS) {
      const attempt = attemptClose(
        closeInput({
          gate: breaker.break(0),
          closed_by: { actor: "human", id: "ops-lead" },
          close_event: {
            evt_id: id("evt_", 901) as EventId,
            ts: 1_788_000_200 as UnixSeconds,
            actor: HUMAN_ACTOR,
          },
        }),
      );

      expect(attempt.period_status).toBe("BLOCKED");
      expect(attempt.report).toBeNull();
      expect(attempt.close_event).toBeNull();
    }
  });

  it("is not bypassed by the EXPLORATORY multi-view figure", () => {
    // §10.1 and DATA_MODEL.md §20: `unresolved_value_paise_multiview` is "never
    // a gate and never a close-policy input". It appears in the report and in no
    // comparison.
    const blocked = attemptClose(
      closeInput({
        gate: passingGate(0, { stored_root_hash: digest(9003) }),
        unresolved_value_paise_multiview: 0 as Paise,
      }),
    );
    expect(blocked.period_status).toBe("BLOCKED");

    const closed = attemptClose(
      closeInput({ unresolved_value_paise_multiview: 900_000_000_000 as Paise }),
    );
    expect(closed.period_status).toBe("CLOSED");
    expect(closed.report?.unresolved_value_paise_multiview).toBe(900_000_000_000);
  });

  it("is not bypassed by the legacy policy column", () => {
    // `period_status_legacy_policy` is EXPLORATORY and never a gate. Even where
    // the legacy policy would close, a failed gate BLOCKS.
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(0, { terminal_states: [] }),
        batch_value_paise: 2_000_000_000 as Paise,
      }),
    );

    expect(attempt.period_status).toBe("BLOCKED");
    expect(attempt.report).toBeNull();
  });

  it("keeps the threshold a function of batch value and the frozen constant alone", () => {
    // §F F9: "The threshold may NOT be adjusted in response to what the check
    // shows." There is no adaptive, data-dependent or configurable threshold:
    // wildly different unresolved values under one batch give one threshold.
    const batch = 4_000_000_000 as Paise;
    const thresholds = [0, 1_000, 19_999_999, 20_000_001, 900_000_000].map(
      (unresolved) =>
        attemptClose(closeInput({ gate: passingGate(unresolved), batch_value_paise: batch }))
          .close_threshold_paise,
    );

    expect(new Set(thresholds).size).toBe(1);
    expect(thresholds[0]).toBe(20_000_000);
  });

  it("reports the thresholds even when the period is BLOCKED", () => {
    // The policy is a property of the batch, not of the outcome, so it is
    // computed before the gates and survives their failure.
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(0, { stored_root_hash: digest(9004) }),
        batch_value_paise: 2_000_000_000 as Paise,
      }),
    );

    expect(attempt.period_status).toBe("BLOCKED");
    expect(attempt.close_threshold_paise).toBe(10_000_000);
    expect(attempt.legacy_close_threshold_paise).toBe(5_000_000);
  });
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

describe("the close report", () => {
  it("is independently recomputable from the artifact alone", () => {
    // DATA_MODEL.md §20: `batch_value_paise` is recorded "so that period_status
    // is independently recomputable from the close report alone ... A reviewer
    // holding only this artifact can verify the gate outcome without the
    // database, the engine or the observation file."
    for (const unresolved of [0, 13_500_000, 13_500_001, 40_000_000]) {
      const attempt = attemptClose(closeInput({ gate: passingGate(unresolved) }));
      const report = attempt.report;
      expect(report).not.toBeNull();
      if (report === null) continue;

      // The reviewer's recomputation, from the report's own four fields.
      expect(report.close_threshold_paise).toBe(
        closeThresholdPaise(report.batch_value_paise),
      );
      expect(
        periodStatusFrom(
          report.gate.all_passed,
          report.unresolved_value_paise,
          report.close_threshold_paise,
        ),
      ).toBe(report.period_status);
    }
  });

  it("switches from CLOSED to OPEN at exactly the threshold", () => {
    // The boundary the whole policy turns on, exercised through attemptClose
    // rather than through periodStatusFrom alone.
    const batch = 2_700_000_000 as Paise; // threshold 13,500,000
    const at = attemptClose(
      closeInput({ gate: passingGate(13_500_000), batch_value_paise: batch }),
    );
    const over = attemptClose(
      closeInput({ gate: passingGate(13_500_001), batch_value_paise: batch }),
    );

    expect(at.period_status).toBe("CLOSED");
    expect(over.period_status).toBe("OPEN");
  });

  it("carries the frozen ratio so the policy is legible in the artifact", () => {
    const attempt = attemptClose(closeInput());

    expect(attempt.report?.close_policy).toEqual({ max_unresolved_ratio_bps: 50 });
  });

  it("reports both close policies for every seeded run", () => {
    // §10.3: "Both close policies are scored and reported for every seeded run",
    // so a reader can see the v1.0.0 outcome alongside this one. Above the ₹1
    // crore crossover they genuinely differ.
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(7_000_000),
        batch_value_paise: 2_000_000_000 as Paise, // ratio 10,000,000; legacy 5,000,000
      }),
    );

    expect(attempt.period_status).toBe("CLOSED");
    expect(attempt.report?.period_status_legacy_policy).toBe("OPEN");
    expect(attempt.close_threshold_paise).toBe(10_000_000);
    expect(attempt.legacy_close_threshold_paise).toBe(5_000_000);
  });

  it("never types period_status as BLOCKED, because a report over a failed gate does not exist", () => {
    const attempt = attemptClose(closeInput());
    const status: "CLOSED" | "OPEN" | undefined = attempt.report?.period_status;

    expect(status === "CLOSED" || status === "OPEN").toBe(true);
  });

  it("publishes the re-projected books, never a cached balance", () => {
    const attempt = attemptClose(closeInput({ gate: passingGate(4_000_000) }));

    expect(attempt.report?.trial_balance_ok).toBe(true);
    expect(attempt.report?.account_balances[SUSPENSE_ACCOUNT]).toBe(-4_000_000);
    expect(attempt.report?.account_balances["1200_BANK"]).toBe(4_000_000);
  });

  it("separates the net Suspense balance from the G3 gross quantity", () => {
    // §20 is explicit that `value_suspense_paise` is "NOT the G3 quantity": the
    // two are equal "only when every open Suspense item lies on the same side,
    // which a run containing both E03 and E04 does not satisfy".
    const keyIn = entityId("bnk_", 41);
    const keyOut = entityId("setl_", 41);
    const chain = chainOf([
      draft({ journal_lines: p5Lines(3_000_000, keyIn) }),
      draft({
        journal_lines: [
          line(SUSPENSE_ACCOUNT, 3_000_000, 0, "P6.dr", keyOut),
          line("1100_GATEWAY_RECEIVABLE", 0, 3_000_000, "P6.cr", keyOut),
        ],
      }),
    ]);
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(0, {
          events: chain.events,
          stored_root_hash: chain.root_hash,
          unresolved_items: [
            queued(keyIn, "ABSTENTION", 3_000_000),
            queued(keyOut, "EXCEPTION", 3_000_000),
          ],
        }),
        batch_value_paise: 4_000_000_000 as Paise,
      }),
    );

    expect(attempt.report?.value_suspense_paise).toBe(0);
    expect(attempt.report?.suspense_gross_item_paise).toBe(6_000_000);
    expect(attempt.report?.unresolved_value_paise).toBe(6_000_000);
  });

  it("names the period and the run it closes", () => {
    const attempt = attemptClose(closeInput());

    expect(attempt.report?.run_id).toBe(RUN_ID);
    expect(attempt.report?.period).toEqual({ from: PERIOD_FROM, to: PERIOD_TO });
  });

  it("carries the root the gates were run against", () => {
    const input = closeInput({ gate: passingGate(1_000) });
    const attempt = attemptClose(input);

    expect(attempt.report?.ledger_root_hash).toBe(input.gate.stored_root_hash);
  });

  it("carries the observation counts DATA_MODEL.md §20 publishes", () => {
    const attempt = attemptClose(closeInput());

    expect(attempt.report?.observations_total).toBe(2);
    expect(attempt.report?.observations_reference).toBe(0);
    expect(attempt.report?.decisions).toEqual({
      RECONCILED: 1,
      ABSTAINED: 1,
      EXCEPTION: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Step 7's CLOSE event
// ---------------------------------------------------------------------------

describe("the CLOSE event of §10.4 step 7", () => {
  it("is a CLOSE that posts nothing", () => {
    // A period close moves no money: §17.1 / §17.1.1 fire no rule among P1-P8 at
    // close, and §16 admits an empty `journal_lines` "for non-posting events".
    const event = attemptClose(closeInput()).close_event;

    expect(event?.kind).toBe("CLOSE");
    expect(event?.journal_lines).toEqual([]);
    expect(event?.decision_id).toBeNull();
    expect(event?.certificate).toBeNull();
    expect(event?.subject_ids).toEqual([]);
    expect(event?.evidence_ids).toEqual([]);
  });

  it("is returned as a draft rather than appended", () => {
    // §L.1 rule 4 gives this package exactly one mutating write path and it is
    // not this module. The draft is sealed, so a caller that appends it cannot
    // be handed a malformed record.
    const event = attemptClose(closeInput()).close_event;

    expect(event).not.toBeNull();
    expect(Object.isFrozen(event)).toBe(true);
    expect(event).not.toHaveProperty("seq");
    expect(event).not.toHaveProperty("hash");
    expect(event).not.toHaveProperty("prev_hash");
  });

  it("appends onto the chain the gates verified", () => {
    // The draft is valid where it is meant to land, and its hash becomes the run
    // root — which does not exist until the caller appends it, because it
    // commits to the `seq` and `prev_hash` the chain assigns.
    const chain = chainOf([draft({ journal_lines: p5Lines(2_000, BANK_LINE_ID) })]);
    const attempt = attemptClose(
      closeInput({
        gate: passingGate(0, {
          events: chain.events,
          stored_root_hash: chain.root_hash,
          unresolved_items: [queued(BANK_LINE_ID, "ABSTENTION", 2_000)],
        }),
      }),
    );

    const event = attempt.close_event;
    expect(event).not.toBeNull();
    if (event === null) return;

    const appended = appendEvent(chain, event);
    expect(appended.root_hash).not.toBe(chain.root_hash);
    expect(appended.events.at(-1)?.kind).toBe("CLOSE");
  });

  it("takes evt_id and ts from the caller, because the module is pure", () => {
    const attempt = attemptClose(closeInput());

    expect(attempt.close_event?.evt_id).toBe(id("evt_", 900));
    expect(attempt.close_event?.ts).toBe(1_788_000_100);
  });

  it("excludes evt_id and ts from inputs_hash", () => {
    // §16 excludes both from the hashed `body` because they "vary between two
    // executions over identical inputs, which metric 23 (determinism_check)
    // requires to produce identical root hashes". Carrying one through
    // `inputs_hash` would reintroduce by the back door exactly what §16 removed.
    const first = attemptClose(closeInput());
    const second = attemptClose(
      closeInput({
        close_event: {
          evt_id: id("evt_", 999) as EventId,
          ts: 1_799_999_999 as UnixSeconds,
          actor: SYSTEM_ACTOR,
        },
      }),
    );

    expect(second.close_event?.inputs_hash).toBe(first.close_event?.inputs_hash);
  });

  it("does not depend on the order the caller assembled its sets in", () => {
    // §16: an identifier reaching `body` must be "derived from a canonical
    // traversal of the input in a fixed order, never from iteration order over
    // an unordered collection".
    const base = passingGate(5_000);
    const shuffled: CloseGateInput = {
      ...base,
      observations: [...base.observations].reverse(),
      terminal_states: [...base.terminal_states].reverse(),
      unresolved_items: [...base.unresolved_items].reverse(),
      posted_decisions: [...base.posted_decisions].reverse(),
    };

    const forward = attemptClose(closeInput({ gate: base }));
    const reversed = attemptClose(closeInput({ gate: shuffled }));

    expect(reversed.close_event?.inputs_hash).toBe(forward.close_event?.inputs_hash);
  });

  it("puts closed_by inside the digest, so a manual close cannot be relabelled", () => {
    // §10.3: "the override is permitted, but never silent". Putting it inside
    // the digest is what makes a hand-closed period impossible to relabel
    // afterwards without breaking the chain.
    const bySystem = attemptClose(closeInput());
    const byHuman = attemptClose(
      closeInput({
        closed_by: { actor: "human", id: "ops-lead" },
        close_event: {
          evt_id: id("evt_", 900) as EventId,
          ts: 1_788_000_100 as UnixSeconds,
          actor: HUMAN_ACTOR,
        },
      }),
    );

    expect(byHuman.close_event?.inputs_hash).not.toBe(bySystem.close_event?.inputs_hash);
  });

  it("changes with the books it closed over", () => {
    const small = attemptClose(closeInput({ gate: passingGate(1_000) }));
    const large = attemptClose(closeInput({ gate: passingGate(2_000) }));

    expect(large.close_event?.inputs_hash).not.toBe(small.close_event?.inputs_hash);
  });
});

// ---------------------------------------------------------------------------
// §10.3 — the manual override
// ---------------------------------------------------------------------------

describe("the manual override is permitted, but never silent", () => {
  it("records a human actor on the CLOSE event", () => {
    const attempt = attemptClose(
      closeInput({
        closed_by: { actor: "human", id: "ops-lead" },
        close_event: {
          evt_id: id("evt_", 902) as EventId,
          ts: 1_788_000_300 as UnixSeconds,
          actor: HUMAN_ACTOR,
        },
      }),
    );

    expect(attempt.report?.closed_by).toEqual({ actor: "human", id: "ops-lead" });
    expect(attempt.close_event?.actor.type).toBe("human");
  });

  it("refuses a human closed_by under a deterministic actor", () => {
    // Either half alone leaves the override silent: this direction hides the
    // operator from the chain.
    expect(() =>
      attemptClose(closeInput({ closed_by: { actor: "human", id: "ops-lead" } })),
    ).toThrow(ProjectionInputError);
  });

  it("refuses a system closed_by under a human actor", () => {
    // And this direction hides the operator from the report.
    expect(() =>
      attemptClose(
        closeInput({
          closed_by: { actor: "system", id: null },
          close_event: {
            evt_id: id("evt_", 903) as EventId,
            ts: 1_788_000_400 as UnixSeconds,
            actor: HUMAN_ACTOR,
          },
        }),
      ),
    ).toThrow(ProjectionInputError);
  });

  it("does not move period_status", () => {
    // §10.3: "a manual close is not an autonomous gate outcome and does not by
    // itself satisfy success criterion S12". `period_status` is the input to
    // metric 11, so reporting a hand-closed period differently would put a
    // human's decision into a distribution that measures the gate's.
    const gate = passingGate(20_000_000);
    const batch = 1_000_000_000 as Paise; // threshold 5,000,000 — this is OPEN

    const bySystem = attemptClose(closeInput({ gate, batch_value_paise: batch }));
    const byHuman = attemptClose(
      closeInput({
        gate,
        batch_value_paise: batch,
        closed_by: { actor: "human", id: "ops-lead" },
        close_event: {
          evt_id: id("evt_", 904) as EventId,
          ts: 1_788_000_500 as UnixSeconds,
          actor: HUMAN_ACTOR,
        },
      }),
    );

    expect(bySystem.period_status).toBe("OPEN");
    expect(byHuman.period_status).toBe("OPEN");
    expect(byHuman.report?.period_status).toBe(bySystem.report?.period_status);
  });

  it("refuses a malformed closed_by", () => {
    expect(() =>
      attemptClose(
        closeInput({ closed_by: { actor: "robot", id: null } as unknown as ClosedBy }),
      ),
    ).toThrow(ProjectionInputError);

    expect(() =>
      attemptClose(closeInput({ closed_by: { actor: "system", id: "" } })),
    ).toThrow(ProjectionInputError);
  });
});

// ---------------------------------------------------------------------------
// Argument checks and determinism
// ---------------------------------------------------------------------------

describe("the module is pure and total in its arguments", () => {
  it("refuses a period that runs backwards", () => {
    expect(() =>
      attemptClose(closeInput({ period: { from: PERIOD_TO, to: PERIOD_FROM } })),
    ).toThrow(ProjectionInputError);
  });

  it("admits a zero-length period", () => {
    const attempt = attemptClose(
      closeInput({ period: { from: PERIOD_FROM, to: PERIOD_FROM } }),
    );

    expect(attempt.report?.period).toEqual({ from: PERIOD_FROM, to: PERIOD_FROM });
  });

  it("refuses a period bound that is not positive Unix seconds", () => {
    expect(() =>
      attemptClose(closeInput({ period: { from: 0 as UnixSeconds, to: PERIOD_TO } })),
    ).toThrow(ProjectionInputError);

    expect(() =>
      attemptClose(
        closeInput({ period: { from: 1.5 as UnixSeconds, to: PERIOD_TO } }),
      ),
    ).toThrow(ProjectionInputError);
  });

  it("refuses a negative or fractional batch value", () => {
    // §L.1 rule 1: integer paise, including intermediates.
    expect(() => attemptClose(closeInput({ batch_value_paise: -1 as Paise }))).toThrow(
      ProjectionInputError,
    );
    expect(() =>
      attemptClose(closeInput({ batch_value_paise: 1.5 as Paise })),
    ).toThrow(ProjectionInputError);
  });

  it("refuses a negative multi-view figure", () => {
    expect(() =>
      attemptClose(closeInput({ unresolved_value_paise_multiview: -1 as Paise })),
    ).toThrow(ProjectionInputError);
  });

  it("closes a zero-value batch only when nothing is unresolved", () => {
    // threshold(0) === 0, so the policy reduces to "unresolved must be zero".
    expect(
      attemptClose(closeInput({ batch_value_paise: 0 as Paise })).period_status,
    ).toBe("CLOSED");
    expect(
      attemptClose(
        closeInput({ batch_value_paise: 0 as Paise, gate: passingGate(1) }),
      ).period_status,
    ).toBe("OPEN");
  });

  it("is deterministic in its arguments, inputs_hash included", () => {
    const input = closeInput({ gate: passingGate(9_000) });

    expect(attemptClose(input)).toEqual(attemptClose(input));
  });

  it("does not mutate its argument", () => {
    const input = closeInput({ gate: passingGate(9_000) });
    const before = JSON.stringify(input.gate);

    attemptClose(input);

    expect(JSON.stringify(input.gate)).toBe(before);
  });

  it("reads no clock", () => {
    // Every timestamp is an argument, so two calls separated in wall-clock terms
    // are identical.
    const input = closeInput();
    const first = attemptClose(input);
    const second = attemptClose(input);

    expect(second.close_event?.inputs_hash).toBe(first.close_event?.inputs_hash);
    expect(second.close_event?.ts).toBe(first.close_event?.ts);
  });
});
