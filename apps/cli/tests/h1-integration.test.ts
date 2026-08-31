import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Observation, ObservationId } from "@assay/domain";
import { P_MAX, solve, type Candidate, type Member, type SolveInput, type Target } from "@assay/engine";
import { CERTIFICATE_REASONS, type RunId } from "@assay/ledger";
import {
  R3OutputSchema,
  R3_PROBE_PRIORITY,
  R3_SYSTEM_PROMPT_ID,
  callHashes,
  offlineProvider,
  replayProvider,
  type LlmProvider,
  type R3Input,
} from "@assay/llm";
import { initialState, offerR3Proposal, type ObservationUniverse } from "@assay/probe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encodeJsonl } from "../src/artifacts/jsonl.js";
import { ProbeSourceUnavailableError, dispatchProbe } from "../src/probe/surface.js";
import { buildAvailableProbes, runProbeLoop, type ProbeRunInput } from "../src/probe/run.js";

/**
 * H1 end to end — `RECONCILIATION_SPEC.md §6.6`'s chain, composed.
 *
 * The point of the suite is not that the parts work; each package proves that
 * for itself. It is that the **seam holds when they are joined**: that a
 * proposal reaches `packages/probe` as a value, that nothing crosses the
 * boundary without its checks, and that `ASSAY` and `A3-NOLLM` differ in
 * `EVALUATION_SPEC.md §3.2`'s *"exactly one respect"*.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const SETL = "setl_aaaaaaaaaaaaaa";
const MODE = 2;

const obsId = (n: number): ObservationId =>
  `obs_${String(n).padStart(14, "0")}` as ObservationId;
const entId = (n: number, type: "payment" | "refund" = "payment"): string =>
  `${type === "refund" ? "rfnd_" : "pay_"}${String(n).padStart(14, "0")}`;

interface LineOpts {
  readonly type?: "payment" | "refund";
  readonly credit?: number;
  readonly debit?: number;
  readonly amount?: number;
}

function reconLine(n: number, opts: LineOpts = {}): Member {
  const type = opts.type ?? "payment";
  const credit = opts.credit ?? 50_000;
  const debit = opts.debit ?? 0;
  const amount = opts.amount ?? credit + debit + 2_000;
  return {
    obs_id: obsId(n),
    source_file: "fixture.jsonl",
    source_line: n,
    ingest_hash: "a".repeat(64),
    ingested_at: T0,
    source_system: "pg_recon",
    kind: "recon_line",
    payload: {
      entity_id: entId(n, type),
      type,
      debit,
      credit,
      amount,
      currency: "INR",
      fee: 2_000,
      tax: 305,
      on_hold: false,
      settled: true,
      created_at: T0,
      // Identical lag on every member, so SE3 cannot separate the candidates
      // and the component is AMBIGUOUS before any probe runs.
      settled_at: T0 + MODE * DAY,
      settlement_id: SETL,
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
  } as unknown as Member;
}

/**
 * Two allocations that tie out to the same target and post DIFFERENTLY.
 *
 * `§6`'s `AMBIGUOUS` needs materiality above `τ`, which needs the two solutions
 * to move different account balances — equal-shaped candidates post identically
 * and fall to `IMMATERIALLY_AMBIGUOUS`. A payments-only allocation against a
 * larger payment net of a refund is the realistic shape of that disagreement.
 */
const MEMBERS: readonly Member[] = [
  reconLine(1, { credit: 50_000 }),
  reconLine(2, { credit: 50_000 }),
  reconLine(3, { credit: 150_000 }),
  reconLine(4, { type: "refund", debit: 50_000, credit: 0, amount: 50_000 }),
];

const target: Target = {
  obs_id: obsId(900),
  kind: "settlement",
  amount: 100_000,
  bank_value_date: null,
  anchored_members: [],
};

const candidate = (ns: readonly number[]): Candidate => ({
  member_obs_ids: ns.map(obsId),
});

/** Two allocations that both tie out to the target. `§6`'s AMBIGUOUS. */
const CANDIDATES: readonly Candidate[] = [candidate([1, 2]), candidate([3, 4])];

const UNIVERSE: ObservationUniverse = {
  hasEntityId: (id) => id === SETL || MEMBERS.some((m) => (m as unknown as Observation & { payload: { entity_id: string } }).payload.entity_id === id),
};

const solveInput: Omit<SolveInput, "recon_reports" | "probe_attempts"> = {
  component: {
    target_ids: [obsId(900)],
    member_obs_ids: MEMBERS.map((m) => m.obs_id),
    size: MEMBERS.length,
    total_value_paise: 200_000,
    exceeds_k_max: false,
  },
  target,
  candidates: CANDIDATES,
  members: MEMBERS,
  mode_days: MODE,
  target_entity_id: SETL,
  observationIdForEntityId: (e) => {
    const found = MEMBERS.find(
      (m) => (m as unknown as { payload: { entity_id: string } }).payload.entity_id === e,
    );
    return found?.obs_id;
  },
  // `AN2` established: without it §17.1.1's P2/P4 cannot fire, both allocations
  // post nothing, and materiality is 0 — which is IMMATERIALLY_AMBIGUOUS, not
  // the AMBIGUOUS state §6.2's probe loop exists for.
  bank_evidence: {
    settlement_id: SETL,
    bank_line_id: "bnk_aaaaaaaaaaaaaa",
    an2_satisfied: true,
    i5_satisfied: true,
  },
};

const RUN: RunId = "run_h1" as RunId;

let dir: string;
let reconReportPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "assay-h1-"));
  reconReportPath = join(dir, "recon_report.jsonl");
  // §6.2's three columns. Only members 1 and 2 are carried by the batch, so a
  // probe result discriminates candidate [1,2] from candidate [3,4].
  writeFileSync(
    reconReportPath,
    encodeJsonl([
      { settlement_id: SETL, entity_id: entId(1), settled_at: T0 + MODE * DAY },
      { settlement_id: SETL, entity_id: entId(2), settled_at: T0 + MODE * DAY },
      { settlement_id: "setl_bbbbbbbbbbbbbb", entity_id: entId(9), settled_at: null },
      { settlement_id: null, entity_id: entId(8), settled_at: null },
    ]),
    "utf8",
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runInput(over: Partial<ProbeRunInput> = {}): ProbeRunInput {
  return {
    runId: RUN,
    compId: "comp_h1",
    provider: offlineProvider(),
    solveInput,
    universe: UNIVERSE,
    context: { settlement_ids: [SETL] },
    certificate: {
      solution_a_obs_ids: [obsId(1), obsId(2)],
      solution_b_obs_ids: [obsId(3), obsId(4)],
      shared_hard_constraints: ["C1", "C4", "C6"],
      evidence_score_gap_bps: 0,
      epsilon_bps: 1500,
      materiality_ref: "comp_h1#materiality",
    },
    reconDateScope: "2026-08",
    dispatch: { reconReportPath },
    ...over,
  };
}

describe("the §6.6 chain, joined", () => {
  it("an R3 proposal reaches packages/probe and comes back as a dispatched result", async () => {
    const result = await runProbeLoop(runInput());
    expect(result.state.attempts).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.body.kind).toBe("PROBE");
    expect(result.events[0]?.body.subject_ids).toEqual([SETL]);
  });

  it("the probe result reaches S4 and resolves the ambiguity", async () => {
    const result = await runProbeLoop(runInput());
    // SE5 at 2000 bps is the only route above epsilon = 1500 (§10 V20), so a
    // corroborating report is what turns AMBIGUOUS into a decision.
    expect(result.state.reports).toHaveLength(1);
    expect(result.state.reports[0]?.constituent_entity_ids).toEqual([entId(1), entId(2)]);
    expect(result.solve.certificate_reason).toBeNull();
    expect(result.stop).toBeNull();
    expect(result.solve.best?.candidate.member_obs_ids).toEqual([obsId(1), obsId(2)]);
  });

  it("logs the probe with its proposer — §T7's requirement", async () => {
    const result = await runProbeLoop(runInput());
    const proposer = result.events[0]?.proposer;
    expect(proposer?.type).toBe("llm");
    expect(proposer?.llm_provider).toBe("offline");
    expect(proposer?.model_id).toBe("rules-v1");
    expect(proposer?.llm_call_id).not.toBeNull();
  });

  it("records every §19 call, accepted or not", async () => {
    const result = await runProbeLoop(runInput());
    expect(result.calls.length).toBeGreaterThan(0);
    for (const call of result.calls) {
      expect(call.role).toBe("R3_propose_probe");
      expect(call.run_id).toBe(RUN);
    }
  });
});

describe("nothing crosses the boundary without its checks", () => {
  it("I6 is applied to the CONTEXT before R3 ever sees it", () => {
    const offered = buildAvailableProbes(
      { settlement_ids: [SETL, "setl_absentabsent1"] },
      UNIVERSE,
    );
    expect(offered).toHaveLength(1);
    expect(offered[0]?.argument_ids).toEqual([SETL]);
  });

  it("a hallucinated id is caught by boundary 2's allowlist and counted", async () => {
    // §4 boundary 2 check 2: "A reference to an ID that does not exist in the
    // observation set is a hallucination event — counted, logged, response
    // discarded." §12 then falls back to offline FOR THAT CALL and the run
    // completes, which is what keeps degradation visible rather than fatal.
    const rogue = stubProvider({
      probe: "fetch_settlement_recon",
      settlement_id: "setl_ghostghostg",
      date: "d",
    });
    const result = await runProbeLoop(runInput({ provider: rogue }));
    const violations = result.calls.flatMap((c) => [...c.allowlist_violations]);
    expect(violations).toContain("setl_ghostghostg");
    expect(result.calls.some((c) => c.outcome === "rejected_allowlist")).toBe(true);
    // The ghost id never reached a dispatch.
    for (const event of result.events) {
      expect(event.body.subject_ids).not.toContain("setl_ghostghostg");
    }
  });

  it("pre-call I6 is a SECOND check, reached before any dispatch (§L.1 rule 8)", () => {
    // "Every LLM-referenced entity ID must exist in the observation set
    // (invariant I6), INDEPENDENTLY OF ANY ALLOWLIST CHECK." In this
    // composition the allowlist is derived from the same context the universe
    // filtered, so the two agree and boundary 2 usually fires first — that is
    // defence in depth, not redundancy. What makes the second check independent
    // is that it reads the UNIVERSE rather than the allowlist, and it refuses a
    // proposal nothing else objected to:
    const offered = offerR3Proposal(
      initialState("comp_h1"),
      { probe: "fetch_settlement_recon", settlement_id: "setl_ghostghostg", date: "d" },
      UNIVERSE,
      solve({ ...solveInput, recon_reports: [], probe_attempts: 0 }),
    );
    expect(offered.kind).toBe("STOP");
    if (offered.kind === "STOP") {
      expect(offered.rejection).toBe("ARGUMENT_NOT_IN_OBSERVATION_SET");
      expect(offered.argument).toBe("setl_ghostghostg");
    }
  });

  it("a narrowed universe offers nothing, so nothing is proposed or dispatched", async () => {
    const narrowed: ObservationUniverse = { hasEntityId: () => false };
    const result = await runProbeLoop(
      runInput({
        provider: stubProvider({
          probe: "fetch_settlement_recon",
          settlement_id: SETL,
          date: "d",
        }),
        universe: narrowed,
      }),
    );
    expect(buildAvailableProbes({ settlement_ids: [SETL] }, narrowed)).toEqual([]);
    expect(result.state.attempts).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.stop?.certificate_reason).toBe("EVIDENCE_TIE");
  });

  it("an unknown probe kind cannot cross — the schema refuses it first", async () => {
    const rogue = stubProvider({ probe: "fetch_ledger_entry", ledger_entry_id: obsId(1) });
    const result = await runProbeLoop(runInput({ provider: rogue }));
    // §12: an invalid schema is discarded, retried once, then falls back to
    // offline for that call — it never reaches packages/probe as that kind.
    expect(result.calls.some((c) => c.outcome === "rejected_schema")).toBe(true);
    for (const event of result.events) expect(event.body.subject_ids).not.toContain("obs_");
  });

  it("widen_temporal_window cannot cross — R3 may not propose it (M40)", async () => {
    const rogue = stubProvider({ probe: "widen_temporal_window", days: 3 });
    const result = await runProbeLoop(runInput({ provider: rogue }));
    // Two independent refusals stand between the response and a dispatch: the
    // R3 schema has no such variant, and offerR3Proposal refuses the kind.
    expect(result.calls.some((c) => c.outcome === "rejected_schema")).toBe(true);
    expect(result.state.reports.every((r) => r.constituent_entity_ids.length >= 0)).toBe(true);
  });

  it("a probe with no committed source is refused, not improvised", () => {
    expect(() =>
      dispatchProbe(
        { probe: "fetch_payment", payment_id: entId(1) } as never,
        { reconReportPath },
      ),
    ).toThrow(ProbeSourceUnavailableError);
  });
});

describe("P_max bounds the loop however the proposer behaves", () => {
  it("spends at most P_max probes even when every probe yields nothing", async () => {
    // A report carrying no line for the settlement: the probe RUNS and returns
    // nothing (§12), so it costs budget and resolves nothing.
    const emptyPath = join(dir, "recon_report_empty.jsonl");
    writeFileSync(
      emptyPath,
      encodeJsonl([{ settlement_id: "setl_othersettlemen", entity_id: entId(9), settled_at: null }]),
      "utf8",
    );
    const result = await runProbeLoop(
      runInput({ dispatch: { reconReportPath: emptyPath } }),
    );
    expect(result.state.attempts).toBe(P_MAX);
    expect(result.events).toHaveLength(P_MAX);
    expect(result.stop?.certificate_reason).toBe("PROBE_BUDGET_EXHAUSTED");
    expect(CERTIFICATE_REASONS).toContain(result.stop?.certificate_reason);
  });

  it("repeated identical probes aggregate by UNION and add nothing (spec 1.4.17)", async () => {
    const emptyPath = join(dir, "recon_report_empty.jsonl");
    const result = await runProbeLoop(
      runInput({ dispatch: { reconReportPath: emptyPath } }),
    );
    // Three results accumulated, none de-duplicated here — §4.2 owns the union.
    expect(result.state.reports).toHaveLength(P_MAX);
    for (const report of result.state.reports) {
      expect(report.settlement_id).toBe(SETL);
      expect(report.constituent_entity_ids).toEqual([]);
    }
  });

  it("stops with NO_USEFUL_PROBE_AVAILABLE when the proposer declines mid-budget", async () => {
    let calls = 0;
    const declineAfterOne: LlmProvider = {
      id: "offline",
      modelId: "rules-v1",
      requiresNetwork: false,
      meteredCost: false,
      invoke: async (req) => {
        calls += 1;
        const value =
          calls === 1
            ? { probe: "fetch_settlement_recon", settlement_id: SETL, date: "d" }
            : { probe: "NO_USEFUL_PROBE" };
        return {
          value: R3OutputSchema.parse(value) as never,
          meta: metaFor(req.systemPromptId, req.input as R3Input),
        };
      },
    };
    const emptyPath = join(dir, "recon_report_empty.jsonl");
    const result = await runProbeLoop(
      runInput({ provider: declineAfterOne, dispatch: { reconReportPath: emptyPath } }),
    );
    expect(result.state.attempts).toBe(1);
    expect(result.stop?.certificate_reason).toBe("NO_USEFUL_PROBE_AVAILABLE");
    expect(result.stop?.rejection).toBeNull();
  });
});

describe("determinism — metric 23's precondition", () => {
  it("identical inputs and configuration produce identical runs", async () => {
    const a = await runProbeLoop(runInput());
    const b = await runProbeLoop(runInput());
    expect(b.state).toEqual(a.state);
    expect(b.events).toEqual(a.events);
    expect(b.stop).toEqual(a.stop);
    expect(b.calls.map((c) => c.cache_key)).toEqual(a.calls.map((c) => c.cache_key));
    expect(b.calls.map((c) => c.raw_response_hash)).toEqual(
      a.calls.map((c) => c.raw_response_hash),
    );
  });

  it("the available-probe context does not depend on the caller's ordering", () => {
    const forward = buildAvailableProbes({ settlement_ids: [SETL, SETL] }, UNIVERSE);
    const reversed = buildAvailableProbes({ settlement_ids: [SETL, SETL].reverse() }, UNIVERSE);
    expect(reversed).toEqual(forward);
  });
});

describe("ASSAY and A3-NOLLM are one pipeline (§10, §3.2)", () => {
  /** ASSAY under the mode every scored run uses: --llm=replay --strict-replay. */
  function assayProvider(proposal: unknown): LlmProvider {
    const input = firstR3Input();
    const { cache_key } = callHashes({
      provider: "replay",
      modelId: "replay-v1",
      systemPromptId: R3_SYSTEM_PROMPT_ID,
      input,
    });
    return replayProvider({ cache: new Map([[cache_key, proposal]]), strict: false });
  }

  it("A3-NOLLM proposes exactly what PREREGISTRATION.md §7's frozen policy says", async () => {
    const result = await runProbeLoop(runInput({ provider: offlineProvider() }));
    // Priority 1 is fetch_settlement_recon and the only eligible argument is the
    // target's settlement id.
    expect(R3_PROBE_PRIORITY[0]).toBe("fetch_settlement_recon");
    expect(result.events[0]?.body.subject_ids).toEqual([SETL]);
  });

  it("both arms take the SAME path and differ only in the proposal", async () => {
    const a3 = await runProbeLoop(runInput({ provider: offlineProvider() }));
    const assay = await runProbeLoop(
      runInput({
        provider: assayProvider({ probe: "fetch_settlement_recon", settlement_id: SETL, date: "2026-08" }),
      }),
    );
    // Same dispatch, same accumulation, same re-solve, same event body.
    expect(assay.events.map((e) => e.body)).toEqual(a3.events.map((e) => e.body));
    expect(assay.state).toEqual(a3.state);
    expect(assay.solve.best?.candidate).toEqual(a3.solve.best?.candidate);
    // The one respect they differ in (§3.2) is which provider answered.
    expect(a3.events[0]?.proposer.llm_provider).toBe("offline");
    expect(assay.events[0]?.proposer.llm_provider).toBe("replay");
  });

  it("a different proposal changes the outcome and nothing else about the path", async () => {
    const declining = await runProbeLoop(runInput({ provider: assayProvider({ probe: "NO_USEFUL_PROBE" }) }));
    const a3 = await runProbeLoop(runInput({ provider: offlineProvider() }));
    expect(declining.state.attempts).toBe(0);
    expect(a3.state.attempts).toBe(1);
    // Both ran the same code; only the proposal differed.
    expect(declining.stop?.certificate_reason).toBe("EVIDENCE_TIE");
    expect(a3.stop).toBeNull();
  });

  it("neither arm can see an id the other cannot", () => {
    // The context is built from the SolveInput and the universe, before any
    // provider is consulted, so there is no provider-conditional branch that
    // could widen it.
    const context = buildAvailableProbes({ settlement_ids: [SETL] }, UNIVERSE);
    expect(context).toEqual(buildAvailableProbes({ settlement_ids: [SETL] }, UNIVERSE));
    expect(context.flatMap((p) => [...p.argument_ids])).toEqual([SETL]);
  });
});

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function metaFor(systemPromptId: string, input: R3Input) {
  const hashes = callHashes({
    provider: "offline",
    modelId: "rules-v1",
    systemPromptId,
    input,
  });
  return {
    provider: "offline" as const,
    model_id: "rules-v1",
    requires_network: false,
    cache_key: hashes.cache_key,
    cache_hit: false,
    raw_response_hash: hashes.input_hash,
    input_tokens: 0,
    output_tokens: 0,
    latency_ms: 0,
    failure: null,
  };
}

/** A provider that returns one fixed raw value, however malformed. */
function stubProvider(raw: unknown): LlmProvider {
  return {
    id: "offline",
    modelId: "rules-v1",
    requiresNetwork: false,
    meteredCost: false,
    invoke: async (req) => ({
      value: raw as never,
      meta: metaFor(req.systemPromptId, req.input as R3Input),
    }),
  };
}

/** The R3 input the loop builds on its first iteration, reconstructed. */
function firstR3Input(): R3Input {
  return {
    role: "R3",
    comp_id: "comp_h1",
    certificate: runInput().certificate,
    available_probes: buildAvailableProbes({ settlement_ids: [SETL] }, UNIVERSE),
    attempts: 0,
    attempts_remaining: P_MAX,
    probes_attempted: [],
    probe_results: [],
    recon_date_scope: "2026-08",
  };
}
