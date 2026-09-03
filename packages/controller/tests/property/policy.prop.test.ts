import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { closingSet, isEligible } from "../../src/policy.js";
import type { CloseReportOutput, ExceptionQueueOutput, QueueItem } from "../../src/tools.js";

/**
 * Property tests over `closingSet` and `isEligible` — the two invariants this
 * package owns (`DECISION_BRIEF.md §L.3`: *"property tests on every invariant
 * it owns"*).
 *
 * Generated queues are arbitrary — random ids, random suspense keys, random
 * values — never real evidence: the properties below hold for ANY queue this
 * shape can take, which is a stronger claim than the fixture-backed tests make
 * about one real run.
 */

const queueItemArb: fc.Arbitrary<QueueItem> = fc.record({
  decision_id: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `dec_${s}`),
  obs_id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `obs_${s}`),
  entity_id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `ent_${s}`),
  kind: fc.constantFrom("settlement", "bank_line", "recon_line", "ledger_entry"),
  state: fc.constantFrom("ABSTAINED", "EXCEPTION", "RECONCILED", "OPEN") as fc.Arbitrary<QueueItem["state"]>,
  value_paise: fc.integer({ min: 0, max: 1_000_000_000 }),
  exception_class: fc.option(fc.constant("E13_LEDGER_ONLY"), { nil: null }),
  suspense_key: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
  comp_id: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
  evt_id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `evt_${s}`),
  has_certificate: fc.boolean(),
});

// decision_id must be unique within a queue for the tie-break property to be
// checkable, so the array is built from a map keyed on it.
const queueArb: fc.Arbitrary<readonly QueueItem[]> = fc
  .array(queueItemArb, { minLength: 0, maxLength: 40 })
  .map((items) => [...new Map(items.map((i) => [i.decision_id, i])).values()]);

const closeArb: fc.Arbitrary<CloseReportOutput> = fc.record({
  unresolved_value_paise: fc.integer({ min: 0, max: 1_000_000_000 }),
  close_threshold_paise: fc.integer({ min: 0, max: 1_000_000_000 }),
}).map((partial) => ({
  run_id: "run_prop",
  period_status: "OPEN" as const,
  gate: {
    g1_all_terminal: true,
    g2_trial_balance: true,
    g3_suspense_identity: true,
    g4_hash_chain: true,
    g5_no_failed_invariant_posted: true,
    failed_gates: [],
  },
  batch_value_paise: null,
  value_abstained_paise: 0,
  value_exceptions_paise: 0,
  ledger_root_hash: "x".repeat(64),
  genesis_hash: "y".repeat(64),
  trial_balance_ok: true,
  ...partial,
}));

function toQueue(items: readonly QueueItem[]): ExceptionQueueOutput {
  return {
    run_id: "run_prop",
    total: items.length,
    value_abstained_paise: 0,
    value_exceptions_paise: 0,
    items,
  };
}

describe("closingSet — invariants over arbitrary queues", () => {
  it("selects only eligible items — never one with a null suspense_key", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        const byId = new Map(items.map((i) => [i.decision_id, i]));
        for (const id of plan.ids) {
          const item = byId.get(id);
          expect(item).toBeDefined();
          expect(isEligible(item!)).toBe(true);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("the selected set is never larger than the eligible set", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        expect(plan.ids.length).toBeLessThanOrEqual(plan.eligible.length);
      }),
      { numRuns: 2000 },
    );
  });

  it("eligible.length + ineligible_count === queue.items.length, always", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        expect(plan.eligible.length + plan.ineligible_count).toBe(items.length);
      }),
      { numRuns: 2000 },
    );
  });

  it("is a pure function: identical inputs produce an identical plan", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const queue = toQueue(items);
        const a = closingSet(close, queue);
        const b = closingSet(close, queue);
        expect(a).toEqual(b);
      }),
      { numRuns: 2000 },
    );
  });

  it("already_under_threshold is true iff unresolved <= threshold, unconditionally", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        expect(plan.already_under_threshold).toBe(
          close.unresolved_value_paise - close.close_threshold_paise <= 0,
        );
        if (plan.already_under_threshold) expect(plan.ids).toEqual([]);
      }),
      { numRuns: 2000 },
    );
  });

  it("covers_residual implies the summed selected value meets the gap, and vice versa", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        const need = close.unresolved_value_paise - close.close_threshold_paise;
        const byId = new Map(items.map((i) => [i.decision_id, i]));
        const covered = plan.ids.reduce((sum, id) => sum + (byId.get(id)?.value_paise ?? 0), 0);
        expect(plan.covers_residual).toBe(covered >= need || need <= 0);
      }),
      { numRuns: 2000 },
    );
  });

  it("ordering is deterministic: value descending, decision_id ascending on ties", () => {
    fc.assert(
      fc.property(closeArb, queueArb, (close, items) => {
        const plan = closingSet(close, toQueue(items));
        for (let i = 1; i < plan.eligible.length; i += 1) {
          const prev = plan.eligible[i - 1]!;
          const curr = plan.eligible[i]!;
          const ordered =
            prev.value_paise > curr.value_paise ||
            (prev.value_paise === curr.value_paise && prev.decision_id <= curr.decision_id);
          expect(ordered).toBe(true);
        }
      }),
      { numRuns: 2000 },
    );
  });
});

describe("isEligible — total and side-effect-free", () => {
  it("agrees with a direct null check for any generated item", () => {
    fc.assert(
      fc.property(queueItemArb, (item) => {
        expect(isEligible(item)).toBe(item.suspense_key !== null);
      }),
      { numRuns: 2000 },
    );
  });
});
