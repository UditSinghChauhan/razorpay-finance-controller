import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EPSILON_BPS,
  EVIDENCE_SCORE_MAX_BPS,
  P_MAX,
  SolveParameterError,
  TAU,
  solve,
  tauFor,
  type Candidate,
  type DecomposedComponent,
  type Member,
  type ReconReport,
  type SolveInput,
  type Target,
} from "@assay/engine";

import type { BankSideEvidence } from "@assay/ledger";

import { obsId, reconLine } from "./fixtures.js";

/**
 * `SolveInput.epsilon_bps` and `SolveInput.tau_floor_paise` — spec 1.4.32,
 * register row `DATA_MODEL.md §22.2` **M51**, implementation item (1).
 *
 * `EVALUATION_SPEC.md §5.1` and `§5.3` sweep `ε` and `τ`'s floor, and `§2`'s
 * protocol makes each point a **re-execution of the agent** because
 * `RECONCILIATION_SPEC.md §6` step 3 reads both inside stage `S4`. This suite
 * proves the two thresholds are supplied to that stage rather than read from a
 * module constant, and — the property that matters most — that **omitting them
 * reproduces the pre-M51 behaviour exactly**.
 *
 * **Nothing here implements a sweep.** No grid, no loop, no point set: those are
 * `PREREGISTRATION.md §7`'s and `apps/cli`'s, and M51 item (2) builds them. This
 * file exercises the parameter surface at single values.
 *
 * The fixture is `s4-solve.test.ts`'s M49 population, rebuilt here so this file
 * is readable on its own. Two allocations tie out identically under `C6` and
 * move the control accounts by different totals:
 *
 * ```
 *   A = {a1, a2}   amount 51_000  fee  1_000  credit 50_000   each
 *   B = {b1, b2}   amount 80_000  fee 30_000  credit 50_000   each
 *
 *   materiality = |Σ amount(A) − Σ amount(B)| = |102_000 − 160_000| = 58_000
 *   τ           = max(floor, 10 bps of 1_000_000) = max(floor, 1_000)
 *   Δs          = 0 with no report; 2_000 with one report naming A's members
 * ```
 *
 * Every expectation below is recomputed from those figures rather than read back
 * from the engine, which is `s4-solve.test.ts`'s own convention.
 */

const DAY = 86_400;
const T0 = 1_782_900_000;
const MODE = 2;
const TARGET_ENTITY_ID = `setl_${"a".repeat(14)}`;

/** `Σ amount(A) − Σ amount(B)`, the widest per-account delta on this fixture. */
const MATERIALITY_PAISE = 58_000;

/**
 * `Δs` on the report-bearing variant: `A` takes a perfect Jaccard and `B` a
 * zero, so the gap is `SE5`'s whole weight (`§4.2`, 2_000 bps).
 */
const DELTA_S_WITH_REPORT_BPS = 2_000;

/** `10 bps of component value` — the half of `τ` the sweep does NOT move. */
const TAU_PROPORTIONAL_PAISE = 1_000;

const line = (n: number, amount: number, fee: number): Member =>
  reconLine(n, {
    settlementId: null, // §3 left it unanchored; DROP_SETTLEMENT_ID emptied it
    amount,
    fee,
    createdAt: T0,
    settledAt: T0 + 2 * DAY,
  });

const a1 = line(1, 51_000, 1_000);
const a2 = line(2, 51_000, 1_000);
const b1 = line(3, 80_000, 30_000);
const b2 = line(4, 80_000, 30_000);
const MEMBERS: readonly Member[] = [a1, a2, b1, b2];

const cand = (ns: readonly number[]): Candidate => ({
  member_obs_ids: ns.map(obsId),
});
const CANDIDATES: readonly Candidate[] = [cand([1, 2]), cand([3, 4])];

const COMPONENT: DecomposedComponent = {
  target_ids: [obsId(900)],
  member_obs_ids: MEMBERS.map((m) => m.obs_id),
  size: MEMBERS.length,
  total_value_paise: 1_000_000,
  exceeds_k_max: false,
};

const TARGET: Target = {
  obs_id: obsId(900),
  kind: "settlement",
  amount: 100_000,
  bank_value_date: null,
  anchored_members: [],
};

const BANK_EVIDENCE: BankSideEvidence = {
  settlement_id: TARGET_ENTITY_ID,
  bank_line_id: `bnk_${"b".repeat(14)}`,
  an2_satisfied: true,
  i5_satisfied: true,
};

/** The one report that lifts `A` above `B` by `SE5`'s whole weight. */
const REPORT: ReconReport = {
  settlement_id: TARGET_ENTITY_ID,
  constituent_entity_ids: ["ent_00000000000001", "ent_00000000000002"],
};
const OBSERVED = new Set(["ent_00000000000001", "ent_00000000000002"]);

function input(o: {
  reports?: readonly ReconReport[];
  attempts?: number;
  epsilon_bps?: number;
  tau_floor_paise?: number;
} = {}): SolveInput {
  const withReport = (o.reports ?? []).length > 0;
  return {
    component: COMPONENT,
    target: TARGET,
    candidates: CANDIDATES,
    members: MEMBERS,
    mode_days: MODE,
    target_entity_id: TARGET_ENTITY_ID,
    recon_reports: o.reports ?? [],
    observationIdForEntityId: (e) =>
      withReport && OBSERVED.has(e) ? (e.replace("ent_", "obs_") as never) : undefined,
    probe_attempts: o.attempts ?? 0,
    bank_evidence: BANK_EVIDENCE,
    // Present only when the caller asked for them: `exactOptionalPropertyTypes`
    // aside, an explicit `undefined` and an omitted key must resolve alike, and
    // the "omitted" cases below rely on the key genuinely being absent.
    ...(o.epsilon_bps === undefined ? {} : { epsilon_bps: o.epsilon_bps }),
    ...(o.tau_floor_paise === undefined ? {} : { tau_floor_paise: o.tau_floor_paise }),
  };
}

/** `Δs = 0`: no report, so `SE5` is zero on both sides. */
const tie = (o: Parameters<typeof input>[0] = {}) => solve(input(o));
/** `Δs = 2_000`: one report names `A`'s members. */
const gapped = (o: Parameters<typeof input>[0] = {}) =>
  solve(input({ ...o, reports: [REPORT] }));

// ---------------------------------------------------------------------------
// A — default behaviour is the pre-M51 behaviour
// ---------------------------------------------------------------------------

describe("A. omitted parameters reproduce the frozen operating behaviour", () => {
  it("solves the tie to AMBIGUOUS at τ = 10_000 and Δs = 0, as before M51", () => {
    const r = tie();
    expect(r.tau_paise).toBe(TAU.floor_paise);
    expect(r.materiality_paise).toBe(MATERIALITY_PAISE);
    expect(r.delta_s_bps).toBe(0);
    expect(r.outcome).toBe("AMBIGUOUS");
  });

  it("solves the gapped variant to DISCRIMINATED, as before M51", () => {
    const r = gapped();
    expect(r.delta_s_bps).toBe(DELTA_S_WITH_REPORT_BPS);
    expect(r.materiality_paise).toBeGreaterThan(r.tau_paise);
    expect(r.outcome).toBe("DISCRIMINATED");
  });

  it("is byte-identical to supplying the frozen §7 pair explicitly", () => {
    // The default-resolution proof: omitted ≡ frozen, on BOTH fixtures and over
    // the WHOLE result rather than the outcome alone.
    expect(
      tie({ epsilon_bps: EPSILON_BPS, tau_floor_paise: TAU.floor_paise }),
    ).toStrictEqual(tie());
    expect(
      gapped({ epsilon_bps: EPSILON_BPS, tau_floor_paise: TAU.floor_paise }),
    ).toStrictEqual(gapped());
  });

  it("resolves each parameter independently of the other being supplied", () => {
    expect(tie({ epsilon_bps: EPSILON_BPS })).toStrictEqual(tie());
    expect(tie({ tau_floor_paise: TAU.floor_paise })).toStrictEqual(tie());
  });
});

// ---------------------------------------------------------------------------
// B — ε moves the DISCRIMINATED / AMBIGUOUS boundary and nothing else
// ---------------------------------------------------------------------------

describe("B. epsilon_bps controls the DISCRIMINATED threshold", () => {
  it("keeps §6's `Δs >= ε` comparison inclusive at the boundary", () => {
    // Δs is exactly 2_000. `>=` admits ε = Δs and refuses ε = Δs + 1; a mutant
    // that flipped the operator to `>` would fail on the first of these.
    expect(gapped({ epsilon_bps: DELTA_S_WITH_REPORT_BPS }).outcome).toBe(
      "DISCRIMINATED",
    );
    expect(gapped({ epsilon_bps: DELTA_S_WITH_REPORT_BPS + 1 }).outcome).toBe(
      "AMBIGUOUS",
    );
  });

  it("commits below Δs and abstains above it, across the admitted domain", () => {
    for (const eps of [0, 1, DELTA_S_WITH_REPORT_BPS - 1, DELTA_S_WITH_REPORT_BPS]) {
      expect(gapped({ epsilon_bps: eps }).outcome).toBe("DISCRIMINATED");
    }
    for (const eps of [
      DELTA_S_WITH_REPORT_BPS + 1,
      EPSILON_BPS * 2,
      EVIDENCE_SCORE_MAX_BPS,
    ]) {
      expect(gapped({ epsilon_bps: eps }).outcome).toBe("AMBIGUOUS");
    }
  });

  it("cannot rescue a tie: Δs = 0 reaches DISCRIMINATED only at ε = 0", () => {
    // The formula is unchanged, so ε = 0 makes `0 >= 0` true. This is the
    // §5.1 sweep's own left endpoint and is a property of the frozen
    // comparison rather than of the parameterisation.
    expect(tie({ epsilon_bps: 0 }).outcome).toBe("DISCRIMINATED");
    expect(tie({ epsilon_bps: 1 }).outcome).toBe("AMBIGUOUS");
  });

  it("still yields to τ: an immaterial pair never reaches the ε branch", () => {
    // §6's table is ordered, and M51 does not reorder it. With τ above the
    // materiality the outcome is IMMATERIALLY_AMBIGUOUS at EVERY ε.
    for (const eps of [0, EPSILON_BPS, EVIDENCE_SCORE_MAX_BPS]) {
      expect(
        gapped({ epsilon_bps: eps, tau_floor_paise: MATERIALITY_PAISE + 1 }).outcome,
      ).toBe("IMMATERIALLY_AMBIGUOUS");
    }
  });
});

// ---------------------------------------------------------------------------
// C — τ's floor moves AMBIGUOUS <-> IMMATERIALLY_AMBIGUOUS
// ---------------------------------------------------------------------------

describe("C. tau_floor_paise moves the materiality branch", () => {
  it("abstains below the materiality and auto-resolves above it", () => {
    // §5.3's four declared floors, applied to a materiality of 58_000. The
    // point set is PREREGISTRATION.md §7's; it is used here as data, and this
    // module knows nothing about it.
    expect(tie({ tau_floor_paise: 1_000 }).outcome).toBe("AMBIGUOUS");
    expect(tie({ tau_floor_paise: 10_000 }).outcome).toBe("AMBIGUOUS");
    expect(tie({ tau_floor_paise: 100_000 }).outcome).toBe("IMMATERIALLY_AMBIGUOUS");
    expect(tie({ tau_floor_paise: 1_000_000 }).outcome).toBe("IMMATERIALLY_AMBIGUOUS");
  });

  it("keeps §6's `materiality <= τ` comparison inclusive at the boundary", () => {
    expect(tie({ tau_floor_paise: MATERIALITY_PAISE }).outcome).toBe(
      "IMMATERIALLY_AMBIGUOUS",
    );
    expect(tie({ tau_floor_paise: MATERIALITY_PAISE - 1 }).outcome).toBe("AMBIGUOUS");
  });

  it("reports the τ actually in force on the result", () => {
    expect(tie({ tau_floor_paise: 100_000 }).tau_paise).toBe(100_000);
    expect(tie().tau_paise).toBe(TAU.floor_paise);
  });

  it("moves the FLOOR only — the 10 bps rate stays frozen", () => {
    // τ = max(floor, 10 bps of component value). Below the proportional term the
    // floor stops binding, which proves the rate is still read from frozen.ts
    // and is not itself a parameter (spec 1.4.6; §5.3 sweeps absolute values).
    expect(tauFor(COMPONENT, 1)).toBe(TAU_PROPORTIONAL_PAISE);
    expect(tauFor(COMPONENT, TAU_PROPORTIONAL_PAISE - 1)).toBe(TAU_PROPORTIONAL_PAISE);
    expect(tauFor(COMPONENT, TAU_PROPORTIONAL_PAISE + 1)).toBe(
      TAU_PROPORTIONAL_PAISE + 1,
    );
  });
});

// ---------------------------------------------------------------------------
// D — the formulas are untouched: neither parameter moves materiality
// ---------------------------------------------------------------------------

describe("D. neither parameter changes materiality or Δs", () => {
  it("holds materiality constant across the whole ε domain", () => {
    for (const eps of [0, 1, EPSILON_BPS, DELTA_S_WITH_REPORT_BPS, EVIDENCE_SCORE_MAX_BPS]) {
      const r = gapped({ epsilon_bps: eps });
      expect(r.materiality_paise).toBe(MATERIALITY_PAISE);
      expect(r.tau_paise).toBe(TAU.floor_paise);
    }
  });

  it("holds materiality and Δs constant across the declared τ floors", () => {
    for (const floor of [1_000, 10_000, 100_000, 1_000_000]) {
      const r = gapped({ tau_floor_paise: floor });
      expect(r.materiality_paise).toBe(MATERIALITY_PAISE);
      expect(r.delta_s_bps).toBe(DELTA_S_WITH_REPORT_BPS);
    }
  });

  it("holds Δs constant across the whole ε domain", () => {
    for (const eps of [0, EPSILON_BPS, EVIDENCE_SCORE_MAX_BPS]) {
      expect(gapped({ epsilon_bps: eps }).delta_s_bps).toBe(DELTA_S_WITH_REPORT_BPS);
    }
  });

  it("leaves the ranking untouched — a threshold is not a ranking input", () => {
    // §4.2's evidence_score_bps and spec 1.4.21's tie-break are upstream of both
    // branches. A parameterisation that leaked into scoring would move these.
    const base = gapped().ranked.map((s) => [s.canonical_key, s.evidence_score_bps]);
    for (const eps of [0, EVIDENCE_SCORE_MAX_BPS]) {
      expect(gapped({ epsilon_bps: eps }).ranked.map((s) => [s.canonical_key, s.evidence_score_bps]))
        .toStrictEqual(base);
    }
    for (const floor of [1_000, 1_000_000]) {
      expect(gapped({ tau_floor_paise: floor }).ranked.map((s) => [s.canonical_key, s.evidence_score_bps]))
        .toStrictEqual(base);
    }
  });
});

// ---------------------------------------------------------------------------
// E — the M49 / R3 path is intact at the defaults
// ---------------------------------------------------------------------------

describe("E. the M49 probe path stays reachable at the frozen values", () => {
  it("returns AMBIGUOUS with §6.2's certificate reasons at the default ε and τ", () => {
    expect(tie({ attempts: 0 }).certificate_reason).toBe("EVIDENCE_TIE");
    expect(tie({ attempts: 1 }).certificate_reason).toBe("NO_USEFUL_PROBE_AVAILABLE");
    expect(tie({ attempts: P_MAX }).certificate_reason).toBe("PROBE_BUDGET_EXHAUSTED");
  });

  it("still resolves an abstention through a probe result at the defaults", () => {
    // §6.2's whole loop, end to end: the tie abstains, and the one recon report
    // an executed probe would return lifts it to DISCRIMINATED. This is the
    // reachability M49 restored, and M51 does not disturb it.
    expect(tie().outcome).toBe("AMBIGUOUS");
    expect(gapped().outcome).toBe("DISCRIMINATED");
  });
});

// ---------------------------------------------------------------------------
// F — the run identity gains nothing
// ---------------------------------------------------------------------------

describe("F. no run key, run config or agent input gains a threshold", () => {
  // Read as TEXT, never imported: `packages/eval` may not import
  // `packages/engine` (eslint, ARCHITECTURE.md §10), and an import here would be
  // the mirror of that edge. `tests/discipline.test.ts` reads sources the same
  // way and for the same reason.
  const EVAL_SRC = join(import.meta.dirname, "..", "..", "eval", "src");
  const read = (f: string): string => readFileSync(join(EVAL_SRC, f), "utf8");

  it("keeps RunConfig at its four fields (M48, unamended by M51)", () => {
    const agent = read("agent.ts");
    const runConfig = /export interface RunConfig \{([\s\S]*?)\n\}/.exec(agent)?.[1] ?? "";
    expect(runConfig).not.toBe("");
    expect(runConfig).not.toMatch(/epsilon|tau_floor/i);
    const fields = [...runConfig.matchAll(/^\s{2}readonly (\w+)[?]?:/gm)].map((m) => m[1]);
    expect(fields).toStrictEqual(["llm_mode", "strict_replay", "split", "seed"]);
  });

  it("keeps RunKey at (agent_id, split, seed, llm_mode)", () => {
    const runKey = read("run-key.ts");
    const iface = /export interface RunKey \{([\s\S]*?)\n\}/.exec(runKey)?.[1] ?? "";
    expect(iface).not.toBe("");
    expect(iface).not.toMatch(/epsilon|tau_floor/i);
    const fields = [...iface.matchAll(/^\s{2}readonly (\w+)[?]?:/gm)].map((m) => m[1]);
    expect(fields).toStrictEqual(["agent_id", "split", "seed", "llm_mode"]);
  });

  it("keeps AgentInput and AgentRun free of either threshold", () => {
    expect(read("agent.ts")).not.toMatch(/AgentInput[\s\S]*?epsilon_bps/);
    expect(read("run.ts")).not.toMatch(/epsilon_bps|tau_floor_paise/);
  });

  it("adds neither threshold as a FIELD to the metric list or sweep harness", () => {
    // M51 changes no metric definition; a threshold becoming a field on a
    // metric or its harness would be the contamination the row forecloses.
    // `sensitivity.ts`'s `parameter_name: "tau_floor_paise"` is a pre-existing
    // string LABEL — the `parameter_name` half of M51's sweep-point identity —
    // and is deliberately not matched here.
    for (const f of ["metric-list.ts", "metrics/sensitivity.ts"]) {
      expect(read(f)).not.toMatch(/readonly (epsilon_bps|tau_floor_paise)\s*[?]?\s*:/);
    }
    expect(read("metrics/sensitivity.ts")).toMatch(
      /parameter_name: "tau_floor_paise"/,
    );
  });

  it("leaves risk-coverage.ts's pre-existing epsilon_bps alone", () => {
    // `RiskCoveragePoint.epsilon_bps` is NOT contamination and predates M51: it
    // labels one point of the curve with the ε that produced it, which is
    // exactly M51's `(RunKey, parameter_name, parameter_value)` sweep-point
    // identity rather than a run-key dimension. It is asserted present and
    // unmoved, so this task cannot be read as having introduced it.
    const src = read("metrics/risk-coverage.ts");
    expect(src).toMatch(/interface RiskCoveragePoint \{[\s\S]*?readonly epsilon_bps: number;/);
    expect(src).not.toMatch(/tau_floor_paise/);
  });
});

// ---------------------------------------------------------------------------
// G — the defaults ARE the frozen constants, asserted against frozen.ts
// ---------------------------------------------------------------------------

describe("G. defaults resolve to PREREGISTRATION.md §7's frozen values", () => {
  it("defaults τ's floor to TAU.floor_paise", () => {
    // No literal: the assertion is against the exported constant, so moving the
    // frozen value moves this test with it rather than leaving it stale.
    expect(tauFor(COMPONENT)).toBe(tauFor(COMPONENT, TAU.floor_paise));
    expect(tie().tau_paise).toBe(Math.max(TAU.floor_paise, TAU_PROPORTIONAL_PAISE));
  });

  it("defaults ε to EPSILON_BPS", () => {
    // Δs = 2_000 sits above the frozen ε and below twice it, so the default's
    // identity is observable in the outcome rather than merely asserted.
    expect(DELTA_S_WITH_REPORT_BPS).toBeGreaterThanOrEqual(EPSILON_BPS);
    expect(gapped().outcome).toBe(gapped({ epsilon_bps: EPSILON_BPS }).outcome);
    expect(gapped({ epsilon_bps: EPSILON_BPS - 1 }).outcome).toBe("DISCRIMINATED");
  });

  it("keeps frozen.ts as the single authority — the engine holds no rival literal", () => {
    const src = readFileSync(
      join(import.meta.dirname, "..", "src", "s4-solve.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The two decision branches read resolved locals. No `1_500`/`1500` and no
    // `10_000` floor literal may appear in this module's code.
    expect(src).not.toMatch(/\b1_?500\b/);
    expect(src).toMatch(/deltaS >= epsilonBps/);
    expect(src).toMatch(/materialityPaise <= tau\b/);
  });
});

// ---------------------------------------------------------------------------
// H — determinism, and fail-closed validation
// ---------------------------------------------------------------------------

describe("H. identical input and identical thresholds give identical results", () => {
  it("is deterministic at the defaults and at supplied values", () => {
    expect(tie()).toStrictEqual(tie());
    expect(gapped({ epsilon_bps: 4_000, tau_floor_paise: 42_000 })).toStrictEqual(
      gapped({ epsilon_bps: 4_000, tau_floor_paise: 42_000 }),
    );
  });

  it("differs only where a threshold differs", () => {
    expect(gapped({ epsilon_bps: 2_000 })).not.toStrictEqual(
      gapped({ epsilon_bps: 2_001 }),
    );
  });
});

describe("malformed thresholds fail closed (§5.5 traceability)", () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ["negative", -1],
    ["above the §4.2 score range", EVIDENCE_SCORE_MAX_BPS + 1],
    ["fractional", 1_500.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];
  for (const [label, value] of cases) {
    it(`refuses a ${label} epsilon_bps`, () => {
      expect(() => tie({ epsilon_bps: value })).toThrow(SolveParameterError);
      try {
        tie({ epsilon_bps: value });
        expect.unreachable("expected SolveParameterError");
      } catch (e) {
        expect((e as SolveParameterError).code).toBe("EPSILON_BPS_INVALID");
        expect((e as SolveParameterError).value).toBe(value);
      }
    });
  }

  for (const [label, value] of [
    ["zero", 0],
    ["negative", -1],
    ["fractional", 10_000.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ] as ReadonlyArray<readonly [string, number]>) {
    it(`refuses a ${label} tau_floor_paise`, () => {
      expect(() => tie({ tau_floor_paise: value })).toThrow(SolveParameterError);
      try {
        tauFor(COMPONENT, value);
        expect.unreachable("expected SolveParameterError");
      } catch (e) {
        expect((e as SolveParameterError).code).toBe("TAU_FLOOR_PAISE_INVALID");
      }
    });
  }

  it("admits both ε endpoints of the §5.1 sweep domain", () => {
    expect(() => tie({ epsilon_bps: 0 })).not.toThrow();
    expect(() => tie({ epsilon_bps: EVIDENCE_SCORE_MAX_BPS })).not.toThrow();
  });

  it("validates above every branch, including the INTRACTABLE early return", () => {
    // A component over K_max returns before either threshold is consulted. The
    // parameter is still refused, so a malformed value can never ride along
    // undetected on a path that happens not to read it.
    const intractable: SolveInput = {
      ...input({}),
      component: { ...COMPONENT, exceeds_k_max: true },
      epsilon_bps: -1,
    };
    expect(() => solve(intractable)).toThrow(SolveParameterError);
  });
});
