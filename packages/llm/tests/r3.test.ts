import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  R3OutputSchema,
  R3_PROBE_PRIORITY,
  R3_SYSTEM_PROMPT_ID,
  offlineR3,
} from "../src/roles/r3.js";
import { hasGroundingRule } from "../src/adjudicator.js";
import { assertNoNumericField, checkSchema } from "../src/verify/schema.js";
import { offlineProvider } from "../src/providers/offline.js";
import { callHashes } from "../src/cache-key.js";
import { ORDER_IDS, PAY_IDS, RFND_IDS, SETL_IDS, r3Input, r3Request } from "./fixtures.js";

/**
 * `R3 · propose_probe`, against spec 1.4.25 / benchmark 1.0.5.
 *
 * Two frozen things are under test and they are frozen for different reasons:
 * the **output schema**, by `DECISION_BRIEF.md §L.1` rule 2, and the **offline
 * policy**, by `PREREGISTRATION.md §7` + `AL3` + `§L.1` rule 12.
 */

describe("R3OutputSchema — the exact contract (M40)", () => {
  it("admits exactly the four id-argument probes plus NO_USEFUL_PROBE", () => {
    const admitted = [
      { probe: "fetch_order", order_id: "order_aaaaaaaaaaaa1" },
      { probe: "fetch_payment", payment_id: "pay_aaaaaaaaaaaaa1" },
      { probe: "fetch_refund", refund_id: "rfnd_aaaaaaaaaaaa1" },
      { probe: "fetch_settlement_recon", settlement_id: "setl_aaaaaaaaaaaa1", date: "2026-08" },
      { probe: "NO_USEFUL_PROBE" },
    ];
    for (const value of admitted) {
      expect(R3OutputSchema.safeParse(value).success, JSON.stringify(value)).toBe(true);
    }
    expect(R3OutputSchema.options).toHaveLength(5);
  });

  it("REFUSES widen_temporal_window in every shape it could arrive in", () => {
    // The governing rule is §L.1 rule 2: `days` is `integer > 0` (§12) and no
    // LLM output schema may carry a numeric field. Whether R3 may propose the
    // probe was unsettled at §6.2 / §T7 / M33; M40 settles it in the negative.
    for (const value of [
      { probe: "widen_temporal_window", days: 3 },
      { probe: "widen_temporal_window", days: "3" },
      { probe: "widen_temporal_window" },
      { probe: "widen_temporal_window", days: 1, settlement_id: "setl_aaaaaaaaaaaa1" },
    ]) {
      expect(R3OutputSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it("refuses an unknown probe kind and a sixth enum member", () => {
    for (const value of [
      { probe: "fetch_ledger_entry", ledger_entry_id: "obs_aaaaaaaaaaaaaa" },
      { probe: "delete_settlement", settlement_id: "setl_aaaaaaaaaaaa1" },
      { probe: "" },
      {},
    ]) {
      expect(R3OutputSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it("is strict — no extra field rides along on any variant", () => {
    expect(
      R3OutputSchema.safeParse({
        probe: "fetch_payment",
        payment_id: "pay_aaaaaaaaaaaaa1",
        days: 3,
      }).success,
    ).toBe(false);
    expect(
      R3OutputSchema.safeParse({ probe: "NO_USEFUL_PROBE", amount_paise: 100 }).success,
    ).toBe(false);
  });

  it("carries NO numeric field — §L.1 rule 2, checked by the walker itself", () => {
    expect(() => {
      assertNoNumericField(R3OutputSchema);
    }).not.toThrow();
  });

  it("the walker still REJECTS a numeric R3-shaped schema, so the check is live", () => {
    const numeric = z.discriminatedUnion("probe", [
      z.strictObject({ probe: z.literal("widen_temporal_window"), days: z.number().int() }),
      z.strictObject({ probe: z.literal("NO_USEFUL_PROBE") }),
    ]);
    expect(() => {
      assertNoNumericField(numeric);
    }).toThrow(/no LLM output schema may contain a number-typed field/i);
    // And through the parse path a provider actually takes.
    expect(() => checkSchema(numeric, { probe: "widen_temporal_window", days: 3 })).toThrow();
  });

  it("has a versioned, cache-stable system prompt id", () => {
    expect(R3_SYSTEM_PROMPT_ID).toBe("r3_propose_probe.v1");
  });

  it("has NO grounding rule — §4 boundary 2 states one for R1 and R4 only", () => {
    expect(hasGroundingRule("R3")).toBe(false);
  });
});

describe("offlineR3 — PREREGISTRATION.md §7's frozen policy (M39)", () => {
  it("the priority order is exactly the frozen one", () => {
    expect([...R3_PROBE_PRIORITY]).toEqual([
      "fetch_settlement_recon",
      "fetch_payment",
      "fetch_order",
      "fetch_refund",
    ]);
    expect(R3_PROBE_PRIORITY).not.toContain("widen_temporal_window");
  });

  it("takes fetch_settlement_recon first when it is constructible", () => {
    const out = offlineR3(r3Input());
    expect(out.probe).toBe("fetch_settlement_recon");
  });

  it("selects the LEXICOGRAPHICALLY SMALLEST eligible argument, not the first listed", () => {
    const out = offlineR3(r3Input());
    // SETL_IDS is deliberately ordered so that enumeration order and
    // lexicographic order disagree.
    expect(SETL_IDS[0]).not.toBe([...SETL_IDS].sort()[0]);
    if (out.probe === "fetch_settlement_recon") {
      expect(out.settlement_id).toBe([...SETL_IDS].sort()[0]);
      expect(out.date).toBe("2026-08");
    }
  });

  it("falls to each next priority entry in order as earlier ones become unconstructible", () => {
    const drop = (kinds: readonly string[]) =>
      r3Input({
        available_probes: r3Input()
          .available_probes.filter((p) => !kinds.includes(p.probe)),
      });

    const a = offlineR3(drop(["fetch_settlement_recon"]));
    expect(a.probe).toBe("fetch_payment");
    if (a.probe === "fetch_payment") expect(a.payment_id).toBe([...PAY_IDS].sort()[0]);

    const b = offlineR3(drop(["fetch_settlement_recon", "fetch_payment"]));
    expect(b.probe).toBe("fetch_order");
    if (b.probe === "fetch_order") expect(b.order_id).toBe([...ORDER_IDS].sort()[0]);

    const c = offlineR3(drop(["fetch_settlement_recon", "fetch_payment", "fetch_order"]));
    expect(c.probe).toBe("fetch_refund");
    if (c.probe === "fetch_refund") expect(c.refund_id).toBe([...RFND_IDS].sort()[0]);
  });

  it("treats an EMPTY argument list as not constructible and skips the entry", () => {
    const out = offlineR3(
      r3Input({
        available_probes: [
          { probe: "fetch_settlement_recon", argument_ids: [] },
          { probe: "fetch_payment", argument_ids: PAY_IDS },
        ],
      }),
    );
    expect(out.probe).toBe("fetch_payment");
  });

  it("returns NO_USEFUL_PROBE when no entry is constructible", () => {
    expect(offlineR3(r3Input({ available_probes: [] })).probe).toBe("NO_USEFUL_PROBE");
    expect(
      offlineR3(
        r3Input({
          available_probes: [
            { probe: "fetch_settlement_recon", argument_ids: [] },
            { probe: "fetch_payment", argument_ids: [] },
            { probe: "fetch_order", argument_ids: [] },
            { probe: "fetch_refund", argument_ids: [] },
          ],
        }),
      ).probe,
    ).toBe("NO_USEFUL_PROBE");
  });

  it("NEVER proposes widen_temporal_window, whatever the context offers", () => {
    // Even if a caller smuggles the fifth probe into the available-probe list,
    // the policy cannot name it: it is not in R3_PROBE_PRIORITY and would not
    // survive the schema.
    const smuggled = r3Input({
      available_probes: [
        { probe: "widen_temporal_window" as never, argument_ids: ["3"] },
        { probe: "fetch_refund", argument_ids: RFND_IDS },
      ],
    });
    expect(offlineR3(smuggled).probe).toBe("fetch_refund");
  });

  it("is deterministic — equal input gives equal output, over every shape", () => {
    for (const input of [
      r3Input(),
      r3Input({ available_probes: [] }),
      r3Input({ attempts: 2, attempts_remaining: 1 }),
    ]) {
      expect(offlineR3(input)).toEqual(offlineR3(input));
    }
  });

  it("is insensitive to the ORDER the caller lists arguments in", () => {
    const forward = offlineR3(r3Input());
    const reversed = offlineR3(
      r3Input({
        available_probes: r3Input().available_probes.map((p) => ({
          probe: p.probe,
          argument_ids: [...p.argument_ids].reverse(),
        })),
      }),
    );
    expect(reversed).toEqual(forward);
  });
});

describe("iteration inputs stay distinct — the replay cache depends on it", () => {
  it("accumulated state changes the input hash, so attempts do not repeat", () => {
    const hashOf = (over: Parameters<typeof r3Input>[0]) =>
      callHashes({
        provider: "replay",
        modelId: "replay-v1",
        systemPromptId: R3_SYSTEM_PROMPT_ID,
        input: r3Input(over),
      }).input_hash;

    const first = hashOf({ attempts: 0, attempts_remaining: 3, probes_attempted: [], probe_results: [] });
    const second = hashOf({
      attempts: 1,
      attempts_remaining: 2,
      probes_attempted: ["prb_aaaaaaaaaaaaaa"],
      probe_results: [
        {
          probe: "fetch_settlement_recon",
          argument_id: SETL_IDS[1] ?? null,
          yielded: true,
          returned_entity_ids: ["pay_aaaaaaaaaaaaa1"],
        },
      ],
    });
    const third = hashOf({
      attempts: 2,
      attempts_remaining: 1,
      probes_attempted: ["prb_aaaaaaaaaaaaaa", "prb_bbbbbbbbbbbbbb"],
      probe_results: [],
    });

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("an unchanged state gives an unchanged hash — determinism, not novelty", () => {
    const h = () =>
      callHashes({
        provider: "replay",
        modelId: "replay-v1",
        systemPromptId: R3_SYSTEM_PROMPT_ID,
        input: r3Input(),
      }).cache_key;
    expect(h()).toBe(h());
  });
});

describe("the offline provider answers R3 through the frozen policy", () => {
  it("returns the policy's proposal and no failure", async () => {
    const result = await offlineProvider().invoke(r3Request());
    expect(result.meta.failure).toBeNull();
    expect(result.value).toEqual(offlineR3(r3Input()));
  });

  it("is byte-deterministic across repeated calls (metric 23's precondition)", async () => {
    const p = offlineProvider();
    const a = await p.invoke(r3Request());
    const b = await p.invoke(r3Request());
    expect(a.value).toEqual(b.value);
    expect(a.meta.cache_key).toBe(b.meta.cache_key);
    expect(a.meta.raw_response_hash).toBe(b.meta.raw_response_hash);
  });

  it("reaches no network and costs nothing", async () => {
    const p = offlineProvider();
    const r = await p.invoke(r3Request());
    expect(p.requiresNetwork).toBe(false);
    expect(p.meteredCost).toBe(false);
    expect(r.meta.input_tokens).toBe(0);
    expect(r.meta.output_tokens).toBe(0);
    expect(r.meta.latency_ms).toBe(0);
  });
});
