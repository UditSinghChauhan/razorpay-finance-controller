import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Observation, ObservationId } from "@assay/domain";
import { ALLOCATION_SCOPED_INVARIANTS, validate } from "@assay/engine";
import type { AgentInput, AgentRun, RunConfig } from "@assay/eval";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { agentById } from "../src/agents/index.js";

/**
 * `A1-NOVALIDATE` — the ablation M50 ratified and this phase built.
 *
 * Spec 1.4.31, register row `DATA_MODEL.md §22.2` **M50**. `A1` removes stage
 * `S5`'s **evaluation** of the allocation-scoped invariants `I1`–`I8` and
 * nothing else. Four properties are asserted here, and each is one the amendment
 * turns on:
 *
 * ```
 *   1  the ablation is real     an allocation ASSAY rejects through an
 *                               allocation-scoped invariant is COMMITTED by A1
 *   2  the removal is visible   invariants_checked: [] on A1's own decisions,
 *                               and the actor names the removal in the log
 *   3  the boundary holds       Layer A/B safety, G1-G5 and the single mint
 *                               route are unchanged and still enforced
 *   4  nobody else may do it    lint refuses the empty set from any other path,
 *                               agents and tests alike, checked by running it
 * ```
 *
 * **The fixture breaks `I3`, not the trial balance.** `EVALUATION_SPEC.md §3.2`
 * withdrew *"trial balance breaks"* at spec 1.4.31 as structurally unreachable —
 * `I1` is re-checked on the cumulative totals at every ledger append,
 * independently of `S5` — so a suite that manufactured one would be asserting
 * against the amendment it is meant to implement. `I3` is a real
 * allocation-scoped invariant over a line's own arithmetic, it is reachable
 * through the composed pipeline, and the postings it admits still balance.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const MODE = 2;

const obsId = (n: number): ObservationId =>
  `obs_${String(n).padStart(14, "0")}` as ObservationId;
const entId = (n: number): string => `pay_${String(n).padStart(14, "0")}`;
const setlEntId = (n: number): string => `setl_${String(n).padStart(14, "0")}`;

/**
 * One `recon_line`. `amount` defaults to `credit + fee`, which is `I3`'s own
 * identity for a payment — so the DEFAULT line passes and only a line built
 * with an explicit, inconsistent `amount` does not.
 */
function reconLine(
  n: number,
  opts: { readonly credit: number; readonly amount?: number; readonly settlementId?: string },
): Observation {
  const fee = 2_000;
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: entId(n),
      type: "payment",
      debit: 0,
      credit: opts.credit,
      amount: opts.amount ?? opts.credit + fee,
      currency: "INR",
      fee,
      tax: 305,
      on_hold: false,
      settled: true,
      created_at: T0,
      settled_at: T0 + MODE * DAY,
      settlement_id: opts.settlementId ?? null,
      posted_at: null,
      credit_type: "default",
      payment_id: null,
      settlement_utr: null,
      order_id: null,
      method: "card",
      card_network: "Visa",
      card_issuer: null,
      card_type: "credit",
      dispute_id: null,
    },
  } as unknown as Observation;
}

function settlementObs(n: number, amount: number, utr: string): Observation {
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_settlements",
    kind: "settlement",
    payload: {
      id: setlEntId(n),
      entity: "settlement",
      amount,
      status: "processed",
      fees: 0,
      tax: 0,
      utr,
      created_at: T0,
    },
  } as unknown as Observation;
}

function input(observations: readonly Observation[]): AgentInput {
  const config: RunConfig = {
    llm_mode: "offline",
    strict_replay: true,
    split: "dev",
    seed: 2000,
  };
  return { observations, config };
}

// ---------------------------------------------------------------------------
// The fixture — an AN1-anchored settlement whose one member fails I3
// ---------------------------------------------------------------------------
//
// `RECONCILIATION_SPEC.md §3`'s AN1 resolves the settlement from the line's own
// `settlement_id`, so `assay.ts`'s pass 1 proposes the allocation directly and
// S5 is the only thing standing between the proposal and the ledger. The line
// carries `credit = 50_000`, `fee = 2_000` and `amount = 60_000`, so I3's
// payment identity -- `credit === amount - fee` -- fails by ₹80: 50_000 vs
// 58_000. Every other allocation-scoped invariant holds, which is what makes
// the divergence attributable to ONE invariant:
//
//   I1  the postings journalFor builds balance, as they always do
//   I2  the entity appears in no earlier accepted allocation
//   I4  settlement.amount === Σ credit − Σ debit === 50_000
//   I6  every referenced id is in the observation set
//   I7  no negative fee or tax, and no allocated amount over the observed one
//   I8  settled_at is after created_at
//
// ASSAY therefore rejects the allocation and §9 sends it to an EXCEPTION; A1
// evaluates nothing and the same proposal reaches the ledger.

const I3_SETL = 700;
const I3_LINE = 701;
const I3_AMOUNT = 50_000;

function i3FailureFixture(): readonly Observation[] {
  return [
    settlementObs(I3_SETL, I3_AMOUNT, "UTR-I3-FIXTURE-01"),
    reconLine(I3_LINE, {
      credit: I3_AMOUNT,
      amount: 60_000,
      settlementId: setlEntId(I3_SETL),
    }),
  ];
}

/** The same shape with `I3` satisfied, as the control the fixture is read against. */
function cleanFixture(): readonly Observation[] {
  return [
    settlementObs(I3_SETL, I3_AMOUNT, "UTR-I3-FIXTURE-01"),
    reconLine(I3_LINE, { credit: I3_AMOUNT, settlementId: setlEntId(I3_SETL) }),
  ];
}

const stateOf = (run: AgentRun, obs: number): string | undefined =>
  run.outcomes.find((o) => o.obs_id === obsId(obs))?.state;

// ---------------------------------------------------------------------------
// 1 · the ablation is real and observable
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — the ablation is observable against ASSAY on one fixture", () => {
  it("ASSAY rejects the I3-failing allocation and A1 commits it", async () => {
    const observations = i3FailureFixture();
    const assay = await agentById("ASSAY").run(input(observations));
    const a1 = await agentById("A1-NOVALIDATE").run(input(observations));

    // ASSAY: §7's "any invariant failure rejects the allocation", and §9 sends
    // "an S5 invariant failed" to EXCEPTION. Nothing is allocated.
    expect(stateOf(assay, I3_SETL)).toBe("EXCEPTION");
    expect(assay.allocations).toEqual([]);
    expect(assay.decisions).toEqual([]);

    // A1: the identical proposal, with S5 evaluating nothing, reaches the
    // ledger through the ordinary posting path.
    expect(stateOf(a1, I3_SETL)).toBe("RECONCILED");
    expect(a1.allocations).toEqual([
      { entity_id: entId(I3_LINE), target_id: setlEntId(I3_SETL) },
    ]);
    expect(a1.decisions).toHaveLength(1);
  });

  it("the divergence is the invariant and not the fixture — on clean input the two agree", async () => {
    // The control EVALUATION_SPEC.md §3.2's "differs in exactly one respect"
    // requires: where no invariant would have failed, removing the evaluation
    // changes nothing at all.
    const observations = cleanFixture();
    const assay = await agentById("ASSAY").run(input(observations));
    const a1 = await agentById("A1-NOVALIDATE").run(input(observations));

    expect(stateOf(assay, I3_SETL)).toBe("RECONCILED");
    expect(stateOf(a1, I3_SETL)).toBe("RECONCILED");
    expect(a1.allocations).toEqual(assay.allocations);
    expect(a1.outcomes).toEqual(assay.outcomes);
    expect(a1.journal).toEqual(assay.journal);
  });

  it("A1 admits the value ASSAY held out of the accounts", async () => {
    // §4.4's balance_harm_inr is computed over the COVERED set, so an
    // allocation that ASSAY never covered cannot contribute to it. This is the
    // channel by which A1's harm exceeds ASSAY's: value posted under a
    // RECONCILED decision that ASSAY refused to reconcile.
    const observations = i3FailureFixture();
    const assay = await agentById("ASSAY").run(input(observations));
    const a1 = await agentById("A1-NOVALIDATE").run(input(observations));

    const reconciled = (run: AgentRun): number =>
      run.journal.filter((l) => l.decision_state === "RECONCILED").length;
    expect(reconciled(assay)).toBe(0);
    expect(reconciled(a1)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · A1 reaches a close, and it is not BLOCKED
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — closes like every other agent (spec 1.4.31 withdrew BLOCKED)", () => {
  it("reaches CLOSED or OPEN with no failed gate on the fixture that made ASSAY except", async () => {
    const run = await agentById("A1-NOVALIDATE").run(input(i3FailureFixture()));

    expect(run.close).not.toBeNull();
    // EVALUATION_SPEC.md §2: "A run that ends BLOCKED is a defect and fails the
    // build"; §4.9: "BLOCKED must be 0 across every run". The A1 row's
    // "runs end BLOCKED" was withdrawn at spec 1.4.31 precisely because those
    // clauses bind A1 as they bind everyone.
    expect(["CLOSED", "OPEN"]).toContain(run.close?.period_status);
    expect(run.close?.period_status).not.toBe("BLOCKED");
    expect(run.close?.gate.failed_gates).toEqual([]);
  });

  it("closes on the empty observation set too, exactly as ASSAY does", async () => {
    const run = await agentById("A1-NOVALIDATE").run(input([]));
    expect(run.agent_id).toBe("A1-NOVALIDATE");
    expect(run.close?.period_status).toBe("CLOSED");
    expect(run.close?.gate.failed_gates).toEqual([]);
    expect(run.outcomes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3 · Layer A / Layer B safety is untouched and still enforced
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — the ledger boundary keeps holding, which is why the harm is a lower bound", () => {
  it("the trial balance holds on A1's own run, so §T's withdrawn expectation stays unreachable", async () => {
    const run = await agentById("A1-NOVALIDATE").run(input(i3FailureFixture()));

    // Gate G2 recomputed from the event log, and `I1` re-checked on the
    // cumulative totals at every append before that. PROJECT_SPEC.md §7 S5
    // requires this of EVERY run, A1's included.
    expect(run.close?.trial_balance_ok).toBe(true);
    let dr = 0;
    let cr = 0;
    for (const posted of run.journal) {
      dr += posted.line.dr_paise;
      cr += posted.line.cr_paise;
    }
    expect(dr).toBe(cr);
  });

  it("gate G5 still passes, over decisions that recorded no failure because none was evaluated", async () => {
    const run = await agentById("A1-NOVALIDATE").run(input(i3FailureFixture()));
    // RECONCILIATION_SPEC.md §10.1 as clarified at spec 1.4.31: G5 asserts that
    // no allocation with a RECORDED failure was posted, and does not assert that
    // any invariant was evaluated.
    expect(run.close?.gate.g5_no_failed_invariant_posted).toBe(true);
  });

  it("packages/ledger's five safety modules are byte-identical to the M50 commit", () => {
    // M50: "Ledger-side enforcement is unaffected and is not reachable by this
    // parameter." Asserted as a property of the source rather than trusted: the
    // whole ablation rests on these files not having been relaxed to make it
    // work. Any legitimate future edit updates this list deliberately.
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const ledger = join(root, "packages", "ledger", "src");
    for (const file of ["journal.ts", "write.ts", "hash-chain.ts", "close-gate.ts", "close.ts"]) {
      const text = readFileSync(join(ledger, file), "utf8");
      // The two sentences the write path and the append enforce, verbatim.
      if (file === "write.ts") {
        expect(text, file).toContain("invariants_failed.length > 0");
      }
      if (file === "hash-chain.ts") {
        expect(text, file).toContain("TrialBalanceError");
      }
      // Nothing in the ledger knows this ablation exists.
      expect(text, file).not.toContain("NOVALIDATE");
      expect(text, file).not.toContain("invariant_selection");
    }
  });
});

// ---------------------------------------------------------------------------
// 4 · the removal is visible in the artifact
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — the removal is auditable rather than asserted", () => {
  it("S5 records invariants_checked: [] for the empty selection and the full set otherwise", () => {
    // The default arm, asserted here because this suite may not spell the
    // selection literal -- the lint rule below bans it in every apps/cli file,
    // tests included. The empty arm's own assertion (invariants_checked: [], and
    // a mint that still goes through the single widening assertion) is
    // packages/engine/tests/s5-validate.test.ts's, which composes no agent and
    // reaches no ledger.
    const base = {
      decision_id: "dec_0000000000000A",
      type: "EXCEPTION",
      journal_lines: [],
      members: [],
      target_amount_paise: null,
      bank_tie_out: null,
      referenced_ids: [],
      observation_entity_ids: new Set<string>(),
      already_allocated_entity_ids: new Set<string>(),
      idempotency: null,
      subject_obs_ids: [],
      evidence_ids: [],
      certificate: null,
      inputs_hash: "b".repeat(64),
    } as unknown as Parameters<typeof validate>[0];

    const full = validate(base);
    expect(full.valid).toBe(true);
    if (full.valid) {
      // Every allocation-scoped invariant is either checked or explicitly
      // skipped for want of a comparand; none is silently absent.
      expect(full.outcomes.map((o) => o.id)).toEqual([...ALLOCATION_SCOPED_INVARIANTS]);
    }
  });

  it("the actor marker is in the hashed body — same postings, different root hash", async () => {
    // `DATA_MODEL.md §16` types `actor.component` as a free token and puts the
    // actor INSIDE the hashed body, so this invents no field: it is
    // `DECISION_BRIEF.md §A.38`'s "already-existing allowed metadata surface".
    //
    // Read on the CLEAN fixture, where A1 and ASSAY produce byte-identical
    // journals and identical outcomes. Everything a hash could otherwise
    // disagree about is therefore held equal, and the divergence below is the
    // actor component alone -- "engine.s5_validate.a1_novalidate" against
    // "engine.s5_validate". A reader holding only the event log can see which
    // run had the gate removed.
    const observations = cleanFixture();
    const a1 = await agentById("A1-NOVALIDATE").run(input(observations));
    const assay = await agentById("ASSAY").run(input(observations));

    expect(a1.journal).toEqual(assay.journal);
    expect(a1.outcomes).toEqual(assay.outcomes);
    expect(a1.close?.account_balances).toEqual(assay.close?.account_balances);
    expect(a1.close?.ledger_root_hash).not.toBe(assay.close?.ledger_root_hash);
  });

  it("A1's root hash differs from ASSAY's on the same input, and equals its own", async () => {
    // Different agents' runs are not comparable by root hash and are not
    // supposed to be; `I9` and metric 23 compare a run against ITSELF.
    const observations = i3FailureFixture();
    const [a, b, assay] = await Promise.all([
      agentById("A1-NOVALIDATE").run(input(observations)),
      agentById("A1-NOVALIDATE").run(input(observations)),
      agentById("ASSAY").run(input(observations)),
    ]);
    expect(a.close?.ledger_root_hash).toBe(b.close?.ledger_root_hash);
    expect(a.close?.ledger_root_hash).not.toBe(assay.close?.ledger_root_hash);
  });
});

// ---------------------------------------------------------------------------
// 5 · determinism
// ---------------------------------------------------------------------------

describe("A1-NOVALIDATE — deterministic, as every scored agent must be", () => {
  it("two runs over identical input produce identical output", async () => {
    const observations = i3FailureFixture();
    const first = await agentById("A1-NOVALIDATE").run(input(observations));
    const second = await agentById("A1-NOVALIDATE").run(input(observations));
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// 6 · isolation — nobody but a1.ts may select the empty set
// ---------------------------------------------------------------------------

describe("§L.1 rule 4's M50 allowlist — enforced, and checked by running the linter", () => {
  const SELECTION = ["NONE", "A1", "NOVALIDATE"].join("_");
  const OPTION_KEY = ["invariant", "Selection"].join("");
  const eslint = new ESLint();

  async function violations(filePath: string, code: string): Promise<number> {
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-syntax").length;
  }

  it("refuses the empty selection from every production path but a1.ts", async () => {
    for (const file of [
      "apps/cli/src/agents/assay.ts",
      "apps/cli/src/agents/a2.ts",
      "apps/cli/src/agents/a3.ts",
      "apps/cli/src/agents/b0.ts",
      "apps/cli/src/agents/b1.ts",
      "apps/cli/src/agents/b2.ts",
      "apps/cli/src/agents/index.ts",
      "apps/cli/src/commands/run.ts",
      "apps/cli/src/commands/bench.ts",
    ]) {
      expect(await violations(file, `export const s = "${SELECTION}";`), file).toBeGreaterThan(0);
      expect(
        await violations(file, `const o = { ${OPTION_KEY}: s };`),
        `${file} (compose option)`,
      ).toBeGreaterThan(0);
    }
  });

  it("refuses it from a test as well, so no suite can stand in for the exception", async () => {
    // "Tests cannot masquerade as the production exception": a suite that could
    // select the empty set would be a second production path in all but name,
    // and G5 would then be checking a gate no run had passed through.
    for (const file of [
      "apps/cli/tests/a1-novalidate.test.ts",
      "apps/cli/tests/agents.test.ts",
      "apps/cli/tests/property/guard.property.test.ts",
    ]) {
      expect(await violations(file, `export const s = "${SELECTION}";`), file).toBeGreaterThan(0);
    }
  });

  it("permits it from a1.ts, and only there", async () => {
    expect(await violations("apps/cli/src/agents/a1.ts", `export const s = "${SELECTION}";`)).toBe(0);
    expect(await violations("apps/cli/src/agents/a1.ts", `const o = { ${OPTION_KEY}: s };`)).toBe(0);
  });

  it("a1.ts keeps every other agent ban — the allowlist drops one rule, not the block", async () => {
    // The hazard this config documents: flat config applies the LAST matching
    // object per rule and does not merge, so an allowlist that forgot to restate
    // the agents block would hand a1.ts the filesystem door.
    const banned = await eslint.lintText(`import { readText } from "../fs/io.js";\n`, {
      filePath: "apps/cli/src/agents/a1.ts",
    });
    expect(banned[0]?.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("the selection literal appears in exactly two source files repository-wide", () => {
    // The lint rule covers apps/cli, where every agent lives. This covers
    // everything else, so a new package cannot quietly become a second selector
    // and a future edit to an existing one fails here rather than in review.
    //
    // Three files may name it and the split is the point:
    //
    //   packages/engine/src/s5-validate.ts   declares the union and compares
    //                                        against it -- it IS the mechanism
    //   apps/cli/src/agents/a1.ts            §L.1 rule 4's named module, the one
    //                                        production selector
    //   packages/engine/tests/…              the engine's own unit test of the
    //                                        parameter. Not a production path in
    //                                        the sense the rule guards: it
    //                                        composes no agent, reaches no
    //                                        ledger and produces no AgentRun,
    //                                        and packages/engine has no agent to
    //                                        compose. Every apps/cli test is
    //                                        banned outright, which is where a
    //                                        suite standing in for the exception
    //                                        would actually have to live.
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          walk(full);
        } else if (entry.name.endsWith(".ts") && !full.endsWith("a1-novalidate.test.ts")) {
          if (readFileSync(full, "utf8").includes(SELECTION)) {
            hits.push(full.slice(root.length + 1).split("\\").join("/"));
          }
        }
      }
    };
    walk(join(root, "packages"));
    walk(join(root, "apps"));

    expect(hits.sort()).toEqual([
      "apps/cli/src/agents/a1.ts",
      "packages/engine/src/s5-validate.ts",
      "packages/engine/tests/s5-validate.test.ts",
    ]);

    // No file under apps/cli/src outside a1.ts, and no test anywhere that could
    // stand in for a production path.
    const production = hits.filter((f) => !f.includes("/tests/"));
    expect(production.sort()).toEqual([
      "apps/cli/src/agents/a1.ts",
      "packages/engine/src/s5-validate.ts",
    ]);
    expect(hits.filter((f) => f.startsWith("apps/"))).toEqual(["apps/cli/src/agents/a1.ts"]);
  });
});
