import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_DECISION,
  CLOSE_REPORT,
  EXCEPTION_DECISION,
  EXCEPTION_QUEUE,
} from "./support/fixture-registry.js";
import {
  closingSet,
  escalationFor,
  escalationReasonFor,
  isEligible,
} from "../src/policy.js";
import type { QueueItem } from "../src/tools.js";

describe("isEligible — the field the plan turns on", () => {
  it("is true exactly where suspense_key is non-null", () => {
    const withKey: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, suspense_key: "x" };
    const withoutKey: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, suspense_key: null };
    expect(isEligible(withKey)).toBe(true);
    expect(isEligible(withoutKey)).toBe(false);
  });

  it("every real E13_LEDGER_ONLY exception is ineligible, regardless of value", () => {
    const exceptions = EXCEPTION_QUEUE.items.filter((i) => i.state === "EXCEPTION");
    expect(exceptions).toHaveLength(20);
    for (const item of exceptions) expect(isEligible(item)).toBe(false);
    // The largest exception row is still ineligible — a value-only ranking
    // would work it before the one item that can actually move the residual.
    const largest = [...exceptions].sort((a, b) => b.value_paise - a.value_paise)[0];
    expect(largest).toBeDefined();
    expect(isEligible(largest!)).toBe(false);
  });
});

describe("closingSet — the smallest set that closes the residual", () => {
  it("over the real queue, selects exactly the one eligible settlement", () => {
    const plan = closingSet(CLOSE_REPORT, EXCEPTION_QUEUE);
    expect(plan.already_under_threshold).toBe(false);
    expect(plan.covers_residual).toBe(true);
    expect(plan.ids).toEqual([AMBIGUOUS_DECISION.decision_id]);
    expect(plan.eligible).toHaveLength(1);
    expect(plan.ineligible_count).toBe(25);
  });

  it("is empty and already_under_threshold when the residual is already covered", () => {
    const under = { ...CLOSE_REPORT, unresolved_value_paise: 100, close_threshold_paise: 674_719 };
    const plan = closingSet(under, EXCEPTION_QUEUE);
    expect(plan.ids).toEqual([]);
    expect(plan.already_under_threshold).toBe(true);
    expect(plan.covers_residual).toBe(true);
  });

  it("reports covers_residual: false when even every eligible item is not enough", () => {
    const queue = {
      ...EXCEPTION_QUEUE,
      items: EXCEPTION_QUEUE.items.map((i) =>
        i.decision_id === AMBIGUOUS_DECISION.decision_id ? { ...i, value_paise: 100 } : i,
      ),
    };
    const plan = closingSet(CLOSE_REPORT, queue);
    expect(plan.covers_residual).toBe(false);
    expect(plan.ids).toEqual([AMBIGUOUS_DECISION.decision_id]); // the only eligible row
  });

  it("orders by value descending, decision_id ascending on ties — deterministically", () => {
    const a: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, decision_id: "dec_b", value_paise: 500, suspense_key: "k1" };
    const b: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, decision_id: "dec_a", value_paise: 500, suspense_key: "k2" };
    const c: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, decision_id: "dec_c", value_paise: 900, suspense_key: "k3" };
    const queue = { ...EXCEPTION_QUEUE, items: [a, b, c] };
    const close = { ...CLOSE_REPORT, unresolved_value_paise: 1400, close_threshold_paise: 0 };
    const plan = closingSet(close, queue);
    // c first (900 > 500), then the 500-value tie broken on decision_id ascending: dec_a before dec_b.
    expect(plan.eligible.map((i) => i.decision_id)).toEqual(["dec_c", "dec_a", "dec_b"]);
  });
});

describe("escalationReasonFor", () => {
  it("is AMBIGUOUS_CERTIFICATE when the decision carries a certificate", () => {
    expect(escalationReasonFor(AMBIGUOUS_DECISION)).toBe("AMBIGUOUS_CERTIFICATE");
  });

  it("is NO_DETERMINISTIC_WARRANT when it does not", () => {
    expect(escalationReasonFor(EXCEPTION_DECISION)).toBe("NO_DETERMINISTIC_WARRANT");
  });
});

describe("escalationFor — every figure a passthrough", () => {
  it("carries the certificate's own numbers unchanged", () => {
    const item = EXCEPTION_QUEUE.items.find((i) => i.decision_id === AMBIGUOUS_DECISION.decision_id);
    expect(item).toBeDefined();
    const record = escalationFor(CLOSE_REPORT, item!, AMBIGUOUS_DECISION);
    expect(record.reason).toBe("AMBIGUOUS_CERTIFICATE");
    expect(record.certificate_reason).toBe("EVIDENCE_TIE");
    expect(record.evidence_score_gap_bps).toBe(0);
    expect(record.epsilon_bps).toBe(1500);
    expect(record.materiality_paise).toBe(59_000);
    expect(record.tau_paise).toBe(20_413);
    expect(record.value_paise).toBe(AMBIGUOUS_DECISION.value_paise);
    expect(record.suspense_key).toBe("setl_AMBIG000000000");
  });

  it("closes_alone is true when the item's own value covers the residual", () => {
    const item = EXCEPTION_QUEUE.items.find((i) => i.decision_id === AMBIGUOUS_DECISION.decision_id)!;
    const record = escalationFor(CLOSE_REPORT, item, AMBIGUOUS_DECISION);
    // unresolved 10,000,000 - value 10,000,000 = 0 <= threshold 674,719.
    expect(record.closes_alone).toBe(true);
  });

  it("closes_alone is false for a small item against a large residual", () => {
    const item: QueueItem = { ...EXCEPTION_QUEUE.items[0]!, value_paise: 100, suspense_key: "k" };
    const evidence = { ...AMBIGUOUS_DECISION, value_paise: 100 };
    const close = { ...CLOSE_REPORT, unresolved_value_paise: 50_000_000, close_threshold_paise: 100 };
    const record = escalationFor(close, item, evidence);
    expect(record.closes_alone).toBe(false);
  });
});
