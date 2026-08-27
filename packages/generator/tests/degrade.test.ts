import { describe, expect, it } from "vitest";

import { canonicalJson } from "@assay/domain";

import { COMPOSITION } from "../src/composition.js";
import { degrade } from "../src/degrade.js";
import { emit } from "../src/emit.js";
import {
  DEGRADATION_OPS, MANGLE_UTR_TRUNCATE_PREFIX, NOTES_LIMITS,
  OPERATOR_DECLARING_FAMILY, TRUNCATE_NARRATION_CHARS, type DegradationOp,
} from "../src/frozen.js";
import { generateFamily } from "../src/generate.js";
import { simulate } from "../src/simulate.js";
import { TEST_SEEDS } from "./fixtures.js";

const SEED = TEST_SEEDS[0];

/** `§4.3`'s operator -> family mapping and its disposal rule. */
describe("the operator table", () => {
  it("exercises exactly six of the ten declared operators", () => {
    const exercised = DEGRADATION_OPS.filter((op) => OPERATOR_DECLARING_FAMILY[op] !== null);
    expect(exercised).toStrictEqual([
      "TRUNCATE_NARRATION", "MANGLE_UTR", "DROP_SETTLEMENT_ID",
      "DUPLICATE_ROW", "INJECT_NOTES", "CONFLICT_REFERENCE",
    ]);
    expect(DEGRADATION_OPS.filter((op) => OPERATOR_DECLARING_FAMILY[op] === null)).toStrictEqual([
      "DROP_FIELD", "SHIFT_TIMESTAMP", "SWAP_ORDER_REF", "ROUND_BANK_AMOUNT",
    ]);
  });

  it("applies no operator in the seven families that declare none", () => {
    for (const family of ["F01", "F02", "F03", "F05", "F06", "F07", "F09"] as const) {
      expect(generateFamily(family, SEED).ground_truth.degradations).toHaveLength(0);
    }
  });

  it("records every applied operator in ground truth, never as an ambiguity label", () => {
    for (const family of ["F04", "F08", "F10"] as const) {
      const degradations = generateFamily(family, SEED).ground_truth.degradations;
      expect(degradations.length).toBeGreaterThan(0);
      for (const record of degradations) {
        expect(DEGRADATION_OPS).toContain(record.op);
        expect(record.target_id).toBeTruthy();
        expect(Object.keys(record)).toStrictEqual(["op", "target_id", "params"]);
      }
    }
  });
});

/** `§4.3`: "Applied to observations only, never to the true state." */
describe("degradation never touches the true state", () => {
  it("leaves the simulation identical whether or not operators run", () => {
    for (const family of ["F04", "F08", "F10"] as const) {
      const before = canonicalJson(simulate(family, SEED) as never);
      generateFamily(family, SEED);
      const after = canonicalJson(simulate(family, SEED) as never);
      expect(after).toBe(before);
    }
  });

  it("moves no clock — an operator may never manufacture a boundary crossing", () => {
    for (const family of ["F04", "F08", "F10"] as const) {
      const state = simulate(family, SEED);
      const emission = emit(state);
      const before = new Map(emission.observations.map((o) => [o.obs_id, clocks(o)]));
      for (const observation of degrade(emission, family, SEED).observations) {
        const original = before.get(observation.obs_id);
        if (original === undefined) continue; // a DUPLICATE_ROW copy
        expect(clocks(observation)).toBe(original);
      }
    }
  });
});

describe("F08 — DROP_SETTLEMENT_ID", () => {
  it("nulls settlement_id on 10% of the recon_line kind and leaves settlement_utr", () => {
    const f01 = generateFamily("F01", SEED);
    const f08 = generateFamily("F08", SEED);
    const eligible = f01.observations.filter((o) => o.kind === "recon_line").length;
    const dropped = f08.ground_truth.degradations.filter((d) => d.op === "DROP_SETTLEMENT_ID");
    expect(dropped).toHaveLength(Math.round(eligible / 10));
    for (const record of dropped) {
      const line = f08.observations.find(
        (o) => o.kind === "recon_line" && o.payload.entity_id === record.target_id,
      );
      expect(line?.kind === "recon_line" ? line.payload.settlement_id : "x").toBeNull();
    }
  });

  it("touches no other kind", () => {
    const f08 = generateFamily("F08", SEED);
    for (const record of f08.ground_truth.degradations) {
      if (record.op !== "DROP_SETTLEMENT_ID") continue;
      expect(record.target_id.startsWith("pay_") || record.target_id.startsWith("rfnd_")).toBe(true);
    }
  });
});

describe("F08 — MANGLE_UTR", () => {
  it("selects 10% of bank_line, split 2 SUBSTITUTE / 1 TRUNCATE in declaration order", () => {
    const mangles = generateFamily("F08", SEED).ground_truth.degradations
      .filter((d) => d.op === "MANGLE_UTR");
    expect(mangles).toHaveLength(3);
    expect(mangles.map((m) => m.params.mode)).toStrictEqual(["SUBSTITUTE", "SUBSTITUTE", "TRUNCATE"]);
  });

  it("substitutes exactly one character, never for the same one", () => {
    for (const seed of TEST_SEEDS) {
      for (const record of generateFamily("F08", seed).ground_truth.degradations) {
        if (record.op !== "MANGLE_UTR" || record.params.mode !== "SUBSTITUTE") continue;
        const from = record.params.from;
        const to = record.params.to;
        if (typeof from !== "string" || typeof to !== "string") continue;
        expect(to).toHaveLength(from.length);
        expect([...to].filter((c, i) => c !== from[i])).toHaveLength(1);
      }
    }
  });

  it("truncates to the documented sample's 10-character leading run", () => {
    for (const seed of TEST_SEEDS) {
      for (const record of generateFamily("F08", seed).ground_truth.degradations) {
        if (record.op !== "MANGLE_UTR" || record.params.mode !== "TRUNCATE") continue;
        const from = record.params.from;
        const to = record.params.to;
        if (typeof from !== "string" || typeof to !== "string") continue;
        expect(to).toBe(from.slice(0, MANGLE_UTR_TRUNCATE_PREFIX));
        expect(to.length).toBeLessThanOrEqual(MANGLE_UTR_TRUNCATE_PREFIX);
      }
    }
  });

  it("records a selected line with no bank_ref as an applied no-op", () => {
    // §4.3 fixes the denominator as "share of bank_line"; at §4.2's 30% clean-UTR
    // rate most selected lines carry nothing to mangle. Disclosed, not widened.
    const noops = TEST_SEEDS.flatMap((seed) =>
      generateFamily("F08", seed).ground_truth.degradations.filter(
        (d) => d.op === "MANGLE_UTR" && d.params.applied === false,
      ),
    );
    expect(noops.length).toBeGreaterThan(0);
    for (const record of noops) expect(record.params.from).toBeNull();
  });
});

describe("F08 — TRUNCATE_NARRATION", () => {
  it("truncates every bank narration to 35 characters and never pads", () => {
    const f08 = generateFamily("F08", SEED);
    const bankIds = new Set(f08.observations.filter((o) => o.kind === "bank_line").map((o) => o.obs_id));
    const narrations = f08.untrusted_text.filter((t) => t.field === "narration");
    expect(narrations).toHaveLength(COMPOSITION.B);
    for (const row of narrations) {
      expect(bankIds.has(row.obs_id)).toBe(true);
      expect(row.raw.length).toBeLessThanOrEqual(TRUNCATE_NARRATION_CHARS);
      expect(row.length).toBe(row.raw.length);
    }
    const undegraded = generateFamily("F01", SEED).untrusted_text
      .filter((t) => t.field === "narration");
    expect(undegraded.every((r) => r.raw.length > TRUNCATE_NARRATION_CHARS)).toBe(true);
  });

  it("composes after the other two, so it reads no field they changed", () => {
    const order = generateFamily("F08", SEED).ground_truth.degradations.map((d) => d.op);
    const firstOf = (op: DegradationOp): number => order.indexOf(op);
    expect(firstOf("DROP_SETTLEMENT_ID")).toBeLessThan(firstOf("MANGLE_UTR"));
    expect(firstOf("MANGLE_UTR")).toBeLessThan(firstOf("TRUNCATE_NARRATION"));
  });
});

describe("F10 — INJECT_NOTES", () => {
  it("adds a quarantined notes row to 10% of the merchant-controlled entities", () => {
    const f10 = generateFamily("F10", SEED);
    const eligible = f10.observations.filter(
      (o) => o.kind === "order" || o.kind === "payment" || o.kind === "refund",
    ).length;
    const notes = f10.untrusted_text.filter((t) => t.field === "notes");
    expect(notes).toHaveLength(Math.round(eligible / 10));
    expect(eligible).toBe(2 * COMPOSITION.P + COMPOSITION.R);
  });

  it("adds no observation — F10's target_record_count carries no delta", () => {
    expect(generateFamily("F10", SEED).observations).toHaveLength(2621);
  });

  it("serializes the notes OBJECT as canonical JSON and respects D18's limits", () => {
    for (const row of generateFamily("F10", SEED).untrusted_text) {
      if (row.field !== "notes") continue;
      const parsed: unknown = JSON.parse(row.raw);
      expect(typeof parsed).toBe("object");
      const pairs = Object.entries(parsed as Record<string, string>);
      expect(pairs.length).toBeLessThanOrEqual(NOTES_LIMITS.max_pairs);
      for (const [key, value] of pairs) {
        expect(key.length).toBeLessThanOrEqual(NOTES_LIMITS.max_chars);
        expect(value.length).toBeLessThanOrEqual(NOTES_LIMITS.max_chars);
      }
    }
  });

  it("uses §T1's realistic register and hides a payload in a key as well as a value", () => {
    const used = new Set(
      TEST_SEEDS.flatMap((seed) =>
        generateFamily("F10", seed).ground_truth.degradations
          .filter((d) => d.op === "INJECT_NOTES")
          .map((d) => String(d.params.exemplar)),
      ),
    );
    expect(used).toContain("T1");
    expect(used).toContain("PS10");
    const raws = generateFamily("F10", SEED).untrusted_text
      .filter((t) => t.field === "notes").map((t) => t.raw);
    expect(raws.some((r) => r.includes("reconcile against"))).toBe(true);
    // §T1: "'Ignore all previous instructions' is a toy that any reviewer discounts."
    expect(raws.some((r) => /ignore all previous/i.test(r))).toBe(false);
  });

  it("never puts a payload on a structural record", () => {
    for (const observation of generateFamily("F10", SEED).observations) {
      expect(canonicalJson(observation.payload as never)).not.toContain("Per RZP ops");
    }
  });
});

describe("F10 — CONFLICT_REFERENCE", () => {
  it("points a settled recon line at a second, REAL settlement", () => {
    const f10 = generateFamily("F10", SEED);
    const realUtrs = new Set(
      f10.observations.filter((o) => o.kind === "settlement").map((o) => o.payload.utr),
    );
    const conflicts = f10.ground_truth.degradations.filter((d) => d.op === "CONFLICT_REFERENCE");
    expect(conflicts.length).toBeGreaterThan(0);
    for (const record of conflicts) {
      expect(realUtrs.has(String(record.params.settlement_utr))).toBe(true);
      expect(record.params.settlement_utr).not.toBe(record.params.was);
      expect(record.params.settlement_id).not.toBeNull();
    }
  });

  it("fabricates nothing, so I6 fails on conflict rather than on non-existence", () => {
    const f10 = generateFamily("F10", SEED);
    const realUtrs = new Set(
      f10.observations.filter((o) => o.kind === "settlement").map((o) => o.payload.utr),
    );
    for (const observation of f10.observations) {
      if (observation.kind !== "recon_line") continue;
      if (observation.payload.settlement_utr === null) continue;
      expect(realUtrs.has(observation.payload.settlement_utr)).toBe(true);
    }
  });

  it("leaves the true settlement_id in place, so the two references disagree", () => {
    const f10 = generateFamily("F10", SEED);
    const utrOf = new Map(
      f10.observations.filter((o) => o.kind === "settlement").map((o) => [o.payload.id, o.payload.utr]),
    );
    let conflicting = 0;
    for (const observation of f10.observations) {
      if (observation.kind !== "recon_line") continue;
      const { settlement_id: id, settlement_utr: utr } = observation.payload;
      if (id === null || utr === null) continue;
      if (utrOf.get(id) !== utr) conflicting += 1;
    }
    expect(conflicting).toBe(f10.ground_truth.degradations.filter((d) => d.op === "CONFLICT_REFERENCE").length);
  });
});

function clocks(observation: { payload: unknown }): string {
  const payload = observation.payload as Record<string, unknown>;
  return canonicalJson({
    created_at: (payload.created_at as number | undefined) ?? null,
    settled_at: (payload.settled_at as number | undefined) ?? null,
    value_date: (payload.value_date as number | undefined) ?? null,
    booked_at: (payload.booked_at as number | undefined) ?? null,
  });
}
