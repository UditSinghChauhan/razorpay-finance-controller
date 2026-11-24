import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AgentInput, RunConfig } from "@assay/eval";
import { BENCH_V2_FAMILY_IDS, generateFamily, type FamilyId } from "@assay/generator";

import type { AssayComposeOptions } from "../src/agents/assay.js";
import { loadObservations, runAssayComposedFull, type AssayRunResult } from "../src/index.js";

/**
 * The default-arm pin (Work Order 3c, Phase A) — committed BEFORE any change to
 * the probe loop, the ledger or the composition, and required to stay green
 * through every later phase.
 *
 * **What it pins.** For `ASSAY`, `A2-NOABSTAIN` and `A3-NOLLM`, over the four
 * `demo/` periods and over every bench-v2 family at test seeds 7001–7003:
 *
 * - the ledger root hash and the event count, by kind;
 * - a digest of every posted decision (`RunEvidence.decisions`, whole);
 * - a digest of the `AgentRun` the scorer reads, whole;
 * - digests of the certificates, the close attempt and the projection;
 * - the `§6` outcome tally;
 * - the per-target outcome and certificate reason — every target's
 *   `(state, reason)` digested, tallied, and every target that did not
 *   reconcile listed by id.
 *
 * **The one permitted deviation is named here, before it exists.** Phase B2
 * gives every `R3` call a `DATA_MODEL.md §19` call-record home. That is a NEW
 * artifact on the run's result, not a change to any pinned one, so it is
 * whitelisted BY NAME in {@link WHITELISTED_NEW_ARTIFACTS} and excluded from the
 * digests. Any other new key on the result or its evidence fails the suite, and
 * so does any change to a pinned value.
 *
 * **This measures nothing.** No rate, accuracy or comparison is computed; the
 * seeds are test seeds in no `PREREGISTRATION.md §6.1` block, and `demo/` is a
 * product fixture, never scored (`demo/README.md`).
 *
 * **Regenerating the fixture** is `ASSAY_WRITE_PINS=1`, and it is never the fix
 * for a red run: a drift here is the falsifier
 * `docs/BENCH_V2_PREREGISTRATION.md` names ("any default-arm pin drift").
 */

const PIN_FILE = resolve(import.meta.dirname, "pins/default-arms.json");
const WRITE = process.env["ASSAY_WRITE_PINS"] === "1";

/**
 * New artifacts the pin admits, by name. `llm_calls` is `DATA_MODEL.md §19`'s
 * per-call record (Work Order 3c, B2): before B2 the loop's calls were dropped,
 * so every default run on an AMBIGUOUS target gains this key and changes
 * nothing it already returned.
 */
const WHITELISTED_NEW_ARTIFACTS = Object.freeze(["llm_calls"]);

const KNOWN_RESULT_KEYS = Object.freeze(["evidence", "run", "solve_outcomes"]);
const KNOWN_EVIDENCE_KEYS = Object.freeze(["certificates", "chain", "close", "decisions", "projection"]);

/** The three default arms, with the option objects `a2.ts` and `a3.ts` pass. */
const ARMS: Readonly<Record<string, AssayComposeOptions>> = Object.freeze({
  ASSAY: { agentId: "ASSAY" },
  "A2-NOABSTAIN": { agentId: "A2-NOABSTAIN", commitOnAbstain: true },
  "A3-NOLLM": { agentId: "A3-NOLLM", llmModeOverride: "offline" },
});

const DEMO_PERIODS = Object.freeze(["demo-500", "demo-close", "demo-multi", "demo-backlog"]);
const SEEDS = Object.freeze([7001, 7002, 7003]);
const TARGET_KINDS = new Set(["settlement", "bank_line"]);

const config = (seed: number): RunConfig =>
  Object.freeze({ llm_mode: "offline", strict_replay: false, split: "train", seed });

interface PinInput {
  readonly key: string;
  readonly load: () => AgentInput;
}

const INPUTS: readonly PinInput[] = [
  ...DEMO_PERIODS.map((id) => ({
    key: id,
    load: (): AgentInput =>
      Object.freeze({
        observations: loadObservations(resolve(import.meta.dirname, `../../../demo/${id}/observations.jsonl`)),
        config: config(0),
      }),
  })),
  ...BENCH_V2_FAMILY_IDS.flatMap((family: FamilyId) =>
    SEEDS.map((seed) => ({
      key: `${family}@${String(seed)}`,
      load: (): AgentInput =>
        Object.freeze({ observations: generateFamily(family, seed).observations, config: config(seed) }),
    })),
  ),
];

// ---------------------------------------------------------------------------
// Canonical digests
// ---------------------------------------------------------------------------

function canonical(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value !== "object") throw new Error(`pin: cannot canonicalise a ${typeof value}`);
  const cmp = (a: unknown, b: unknown): number => {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
  if (value instanceof Map) {
    return { __map: [...value.entries()].map(([k, v]) => [canonical(k), canonical(v)]).sort(cmp) };
  }
  if (value instanceof Set) return { __set: [...value].map(canonical).sort(cmp) };
  if (Array.isArray(value)) return value.map(canonical);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = canonical(v);
  }
  return out;
}

const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

interface Pin {
  readonly root_hash: string;
  readonly event_count: number;
  readonly event_kinds: Readonly<Record<string, number>>;
  readonly run_digest: string;
  readonly decisions_digest: string;
  readonly certificates_digest: string;
  readonly close_digest: string;
  readonly projection_digest: string;
  readonly solve_outcomes: Readonly<Record<string, number>>;
  readonly targets_digest: string;
  readonly target_outcomes: Readonly<Record<string, number>>;
  readonly unreconciled_targets: readonly string[];
}

function pinOf(result: AssayRunResult): Pin {
  const { evidence } = result;
  const eventKinds: Record<string, number> = {};
  for (const event of evidence.chain.events) eventKinds[event.kind] = (eventKinds[event.kind] ?? 0) + 1;

  const targets = evidence.decisions
    .filter((d) => TARGET_KINDS.has(d.kind))
    .map((d) => ({
      entity_id: d.entity_id,
      state: d.state,
      exception_class: d.exception_class,
      reason: d.certificate?.reason ?? null,
      probes: d.certificate?.probes_attempted.length ?? 0,
    }))
    .sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));

  const tally: Record<string, number> = {};
  for (const t of targets) {
    const k = `${t.state}/${t.reason ?? t.exception_class ?? "-"}`;
    tally[k] = (tally[k] ?? 0) + 1;
  }

  return {
    root_hash: evidence.chain.root_hash,
    event_count: evidence.chain.events.length,
    event_kinds: eventKinds,
    run_digest: digest(result.run),
    decisions_digest: digest(evidence.decisions),
    certificates_digest: digest(evidence.certificates),
    close_digest: digest(evidence.close),
    projection_digest: digest(evidence.projection),
    solve_outcomes: { ...result.solve_outcomes },
    targets_digest: digest(targets),
    target_outcomes: canonical(tally) as Record<string, number>,
    unreconciled_targets: targets
      .filter((t) => t.state !== "RECONCILED")
      .map((t) => `${t.entity_id}:${t.state}:${t.reason ?? t.exception_class ?? "-"}`),
  };
}

// ---------------------------------------------------------------------------
// The pin
// ---------------------------------------------------------------------------

const stored: Readonly<Record<string, Pin>> | null = existsSync(PIN_FILE)
  ? (JSON.parse(readFileSync(PIN_FILE, "utf8")) as Record<string, Pin>)
  : null;
const written: Record<string, Pin> = {};

afterAll(() => {
  if (!WRITE) return;
  const ordered: Record<string, Pin> = {};
  for (const key of Object.keys(written).sort()) {
    const pin = written[key];
    if (pin !== undefined) ordered[key] = pin;
  }
  writeFileSync(PIN_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
});

describe("the default-arm pin (Work Order 3c, Phase A)", () => {
  it("covers every bench-v2 family", () => {
    expect([...BENCH_V2_FAMILY_IDS].sort()).toStrictEqual(["A01", "A02", "A03", "A04", "A05", "B01"]);
  });

  it("has a committed fixture with exactly the expected keys", () => {
    if (WRITE) return;
    expect(stored, `missing ${PIN_FILE}; it is committed, never regenerated to pass`).not.toBeNull();
    const expected = INPUTS.flatMap((input) => Object.keys(ARMS).map((arm) => `${input.key}/${arm}`)).sort();
    expect(Object.keys(stored ?? {}).sort()).toStrictEqual(expected);
  });

  for (const input of INPUTS) {
    describe(input.key, () => {
      let cached: AgentInput | undefined;
      const load = (): AgentInput => (cached ??= input.load());

      for (const [arm, options] of Object.entries(ARMS)) {
        it(`${arm} is byte-identical to the pin`, async () => {
          const result = await runAssayComposedFull(load(), options);

          // The one permitted deviation is a NEW, named artifact. Any other key
          // appearing on the result or its evidence is a change nobody declared.
          for (const key of Object.keys(result)) {
            expect([...KNOWN_RESULT_KEYS, ...WHITELISTED_NEW_ARTIFACTS], `result.${key}`).toContain(key);
          }
          for (const key of Object.keys(result.evidence)) {
            expect([...KNOWN_EVIDENCE_KEYS, ...WHITELISTED_NEW_ARTIFACTS], `evidence.${key}`).toContain(key);
          }

          const actual = pinOf(result);
          const key = `${input.key}/${arm}`;
          if (WRITE) {
            written[key] = actual;
            return;
          }
          expect(actual, key).toStrictEqual(stored?.[key]);
        }, 120_000);
      }
    });
  }
});
