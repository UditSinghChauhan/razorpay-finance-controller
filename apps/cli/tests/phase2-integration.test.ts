import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SUSPENSE_ACCOUNT, type Observation, type ObservationId, type Sha256 } from "@assay/domain";
import { ingest, type SourceDocument } from "@assay/domain/s0-ingest";
import {
  anchor,
  buildSeam,
  evaluate,
  generateCandidates,
  type AnchorResult,
  type Seam,
} from "@assay/engine";
import {
  CLOSE_GATE_IDS,
  appendEvent,
  attemptClose,
  closeGate,
  computeGenesisHash,
  createChain,
  openWriteState,
  postValidatedDecision,
  type CloseGateInput,
  type DecisionId,
  type EventActor,
  type EventId,
  type JournalLine,
  type LedgerCommit,
  type LedgerStore,
  type RunId,
  type ValidatedDecision,
} from "@assay/ledger";
import type { Paise } from "@assay/money";

/**
 * Phase 2, composed — `S0` -> `S1` -> the `S1`/`S2` seam, and the ledger's
 * write path and close gate, each reached through the surface that owns it.
 *
 * **This file lives in `apps/cli` because `apps/cli` is where the layers meet.**
 * `ARCHITECTURE.md §3` makes this package the composition root: it *"acquires
 * raw source contents and passes them into `packages/domain`'s `S0` boundary,
 * and performs no `S0` transform itself"*. It is also the only place the chain
 * below **can** be assembled — `packages/engine` is banned from
 * `@assay/domain/s0-ingest` (it emits `UntrustedText`, which `DATA_MODEL.md §10`
 * forbids the engine to import at all), and `packages/domain` cannot import the
 * engine without reversing `§L.2`'s build order. The composition root is the one
 * party permitted to hold both ends, which is the architecture working rather
 * than a convenience.
 *
 * Nothing here is benchmark data. Three hand-written records, one balanced
 * posting, fixed timestamps, no clock and no file: the fixtures are the smallest
 * set on which `AN1` and `AN2` both fire.
 */

// ---------------------------------------------------------------------------
// Fixtures — DATA_MODEL.md §6's documented sample, three records
// ---------------------------------------------------------------------------

const T0 = 1_785_888_000;
const INGESTED_AT = (T0 + 300_000) as never;

const S14 = "AbCdEf1234567z";
const PAY_ID = `pay_${S14}`;
const ORDER_ID = `order_${S14}`;
const SETL_ID = `setl_${S14}`;
const BNK_ID = "bnk_0000000000001";
const UTR = "1568176960vxp0rj";

/**
 * `amount` 2100 at 200 bps gives `fee_ex_gst` 42, 18% GST on 42 is 7.56 -> `tax`
 * 8, `fee` 50, and `credit = amount - fee = 2050` — `DATA_MODEL.md §6`'s
 * identity, with `fee` GST-inclusive.
 */
const reconLine = () => ({
  entity_id: PAY_ID,
  type: "payment" as const,
  debit: 0,
  credit: 2_050,
  amount: 2_100,
  currency: "INR" as const,
  fee: 50,
  tax: 8,
  on_hold: false,
  settled: true,
  created_at: T0,
  settled_at: T0 + 172_800,
  settlement_id: SETL_ID,
  posted_at: T0 + 172_800,
  credit_type: "default" as const,
  payment_id: null,
  settlement_utr: UTR,
  order_id: ORDER_ID,
  method: "card",
  card_network: "Visa" as const,
  card_issuer: "HDFC",
  card_type: "credit",
  dispute_id: null,
});

const settlement = () => ({
  id: SETL_ID,
  entity: "settlement" as const,
  amount: 2_050,
  status: "processed" as const,
  fees: 0,
  tax: 0,
  utr: UTR,
  created_at: T0 + 172_800,
});

const bankLine = () => ({
  bank_line_id: BNK_ID,
  value_date: T0 + 259_200,
  amount: 2_050,
  direction: "credit" as const,
  running_balance: 1_000_000,
  bank_ref: UTR,
});

const doc = (
  source_system: SourceDocument["source_system"],
  source_file: string,
  values: readonly unknown[],
): SourceDocument => ({
  source_system,
  source_file,
  records: values.map((value, index) => ({ line: index + 1, value })),
});

/** The three source documents `S0` reads, in `§10`'s (kind, source_system) pairs. */
function sourceDocuments(): readonly SourceDocument[] {
  return [
    doc("pg_recon", "pg_recon.jsonl", [reconLine()]),
    doc("pg_settlements", "pg_settlements.jsonl", [settlement()]),
    doc("bank_statement", "bank_statement.jsonl", [bankLine()]),
  ];
}

function observationsOf(kind: Observation["kind"], all: readonly Observation[]): Observation[] {
  return all.filter((o) => o.kind === kind);
}

// ---------------------------------------------------------------------------
// 1 — S0 feeds the legitimate downstream seam
// ---------------------------------------------------------------------------

describe("S0 composes into S1 and the S1/S2 seam", () => {
  it("is reachable only through its own subpath, never the domain root barrel", async () => {
    // `s0-ingest.ts`: it "must NOT be re-exported from src/index.ts" because
    // "re-exporting it from the package root would make that ban unenforceable,
    // since the engine legitimately imports the rest of this package". The
    // subpath is what keeps `S0` reachable HERE and unreachable from the engine.
    const root: Record<string, unknown> = await import("@assay/domain");
    expect(Object.keys(root)).not.toContain("ingest");
    expect(Object.keys(root)).not.toContain("ingestHash");

    const subpath: Record<string, unknown> = await import("@assay/domain/s0-ingest");
    expect(Object.keys(subpath)).toContain("ingest");
  });

  it("produces Observation[] + UntrustedText[], §2's stated output", () => {
    const result = ingest({ documents: sourceDocuments(), ingested_at: INGESTED_AT });

    expect(result.observations).toHaveLength(3);
    expect(result.rejected).toEqual([]);
    // The quarantine is a real output, not an afterthought: it is why S0 could
    // never have lived in packages/engine (DATA_MODEL.md §10).
    expect(Array.isArray(result.untrusted_text)).toBe(true);
  });

  it("hands S1 an already-parsed Observation[] and S1 establishes AN1 and AN2", () => {
    const { observations } = ingest({
      documents: sourceDocuments(),
      ingested_at: INGESTED_AT,
    });

    // No re-parse, no second schema: the engine receives exactly what S0 emitted.
    const anchors: AnchorResult = anchor(observations);

    expect(anchors.links.map((l) => l.anchor).sort()).toEqual(["AN1", "AN2"]);
    expect(anchors.rejections).toEqual([]);
  });

  it("runs S0 -> S1 -> seam end to end and resolves everything by anchor alone", () => {
    // RECONCILIATION_SPEC.md §3: "Everything anchored is removed from the search
    // space. In a realistic batch this is 85-95% of records, and it is what
    // makes the residual tractable." On this three-record set it is all of them.
    const { observations } = ingest({
      documents: sourceDocuments(),
      ingested_at: INGESTED_AT,
    });
    const anchors = anchor(observations);
    const seam: Seam = buildSeam({ observations, anchors });

    expect(seam.targets).toEqual([]);
    expect(
      [...seam.anchor_resolved].map((t) => t.resolution).sort(),
    ).toEqual(["AN1_ALREADY_TIED_OUT", "AN2_MATCHED"]);
  });

  it("puts no S0, S1 or S2 semantics in apps/cli — the seam is imported, not rebuilt", () => {
    // The gap `run.ts` recorded: "deriving them there would put S1/S2 semantics
    // in apps/cli, which ARCHITECTURE.md §3 forbids". `buildSeam` is the import
    // that closes it.
    const SRC = resolve(import.meta.dirname, "..", "src");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".ts")) files.push(full);
      }
    };
    walk(SRC);

    for (const file of files) {
      const body = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const rel = file.slice(SRC.length + 1);
      // No re-derivation of the seam, and no second route into the quarantine.
      expect(body, rel).not.toMatch(/anchoredNet|AN1_ALREADY_TIED_OUT|AN2_MATCHED/);
      expect(body, rel).not.toMatch(/@assay\/domain\/untrusted-text/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — the seam reads S1's links and never re-matches observations
// ---------------------------------------------------------------------------

describe("the seam consumes S1's decisions rather than repeating them", () => {
  function ingested(): readonly Observation[] {
    return ingest({ documents: sourceDocuments(), ingested_at: INGESTED_AT }).observations;
  }

  it("drops bank_value_date when S1 established no AN2, though the UTRs still match", () => {
    // The load-bearing property. The observations below carry
    // settlement.utr === bank_line.bank_ref, so a seam that re-matched on UTR
    // would find the link S1 did not establish — which is exactly how an anchor
    // S1 REFUSED (§3's E09 collision, E14) would re-enter the search space
    // through a back door.
    const observations = ingested();
    const anchors = anchor(observations);
    expect(anchors.links.some((l) => l.anchor === "AN2")).toBe(true);

    // S1's output with the AN2 link withheld — what §3 leaves behind when it
    // rejects the anchor rather than establishing it.
    const withoutAn2: AnchorResult = {
      ...anchors,
      links: anchors.links.filter((l) => l.anchor !== "AN2"),
    };
    const seam = buildSeam({ observations, anchors: withoutAn2 });

    const bank = observationsOf("bank_line", observations)[0];
    expect(bank).toBeDefined();
    // The bank line is a target again: nothing matched it.
    expect(seam.targets.map((t) => t.obs_id)).toContain(bank?.obs_id);
    // And no settlement target carries a value date it was not given.
    for (const target of seam.targets) {
      if (target.kind === "settlement") expect(target.bank_value_date).toBeNull();
    }
  });

  it("keeps a settlement a target when S1 anchored no member to it", () => {
    const observations = ingested();
    const anchors = anchor(observations);
    const withoutAn1: AnchorResult = {
      ...anchors,
      links: anchors.links.filter((l) => l.anchor !== "AN1"),
    };
    const seam = buildSeam({ observations, anchors: withoutAn1 });

    const settlementObs = observationsOf("settlement", observations)[0];
    expect(seam.targets.map((t) => t.obs_id)).toContain(settlementObs?.obs_id);
    // C6 is not consulted on an unanchored settlement: §3 removes what an
    // ANCHOR established, and nothing anchored it, however the arithmetic reads.
    const target = seam.targets.find((t) => t.obs_id === settlementObs?.obs_id);
    expect(target?.anchored_members).toEqual([]);
  });

  it("hands S2 a context whose target is the target beside it", () => {
    // `generateCandidates` takes one context per target; a seam that paired them
    // wrongly would evaluate every clause against the wrong comparand.
    const observations = ingested();
    const anchors = anchor(observations);
    const withoutAn1: AnchorResult = {
      ...anchors,
      links: anchors.links.filter((l) => l.anchor !== "AN1"),
    };
    const seam = buildSeam({ observations, anchors: withoutAn1 });

    expect(seam.contexts).toHaveLength(seam.targets.length);
    seam.contexts.forEach((ctx, i) => {
      expect(ctx.target).toBe(seam.targets[i]);
    });

    // And the pair is actually usable by S2 — the seam's whole purpose.
    const first = seam.contexts[0];
    if (first !== undefined) {
      expect(() => generateCandidates(seam.pool, first)).not.toThrow();
      expect(() => evaluate([], first)).not.toThrow();
    }
  });

  it("is deterministic and does not mutate S1's result", () => {
    const observations = ingested();
    const anchors = anchor(observations);
    const before = JSON.stringify(anchors);

    const a = buildSeam({ observations, anchors });
    const b = buildSeam({ observations, anchors });

    expect(JSON.stringify(anchors)).toBe(before);
    expect(b.targets).toEqual(a.targets);
    expect(b.anchor_resolved).toEqual(a.anchor_resolved);
  });
});

// ---------------------------------------------------------------------------
// 3 — ledger writes go through the single mutating path
// ---------------------------------------------------------------------------

const RUN_ID = "run_20260901T000000Z" as RunId;
const GENESIS_INPUTS = {
  dataset_hash: "a".repeat(64) as Sha256,
  engine_commit: "b1460ef1bb334074fded46a8c1b428b729217ea5",
  config_hash: "b".repeat(64) as Sha256,
};

const actor = (): EventActor => ({
  type: "deterministic",
  component: "engine.s5_validate",
  engine_commit: GENESIS_INPUTS.engine_commit,
  llm_provider: null,
  model_id: null,
  prompt_hash: null,
  llm_call_id: null,
});

/** An in-memory adapter. `apps/cli` owns I/O; this test owns none either. */
class RecordingStore implements LedgerStore {
  readonly commits: LedgerCommit[] = [];
  commit(unit: LedgerCommit): void {
    this.commits.push(unit);
  }
}

const p5 = (amount: number, key: string): readonly JournalLine[] => [
  {
    account: "1200_BANK",
    dr_paise: amount as Paise,
    cr_paise: 0 as Paise,
    memo_ref: "P5.dr",
    source_entity_id: key,
  },
  {
    account: SUSPENSE_ACCOUNT,
    dr_paise: 0 as Paise,
    cr_paise: amount as Paise,
    memo_ref: "P5.cr",
    source_entity_id: key,
  },
];

/**
 * A decision shaped as S5 returns one.
 *
 * The widening lives in `packages/engine/src/s5-validate.ts` and nowhere else
 * (`§L.1` rule 4); a test may not mint the brand, so this stands in structurally
 * at the one place that is unavoidable — the argument. That is the honest form:
 * the ledger's guarantee is that it accepts nothing ELSE, which is what the
 * assertions below check.
 */
function decisionLike(): ValidatedDecision {
  return {
    decision_id: "dec_000001A",
    // `§16`'s event kind is DERIVED from this, never accepted from a caller:
    // a caller-chosen kind would let a RECONCILED decision be filed as an
    // ABSTAIN, and no later check could detect the disagreement.
    type: "ABSTAINED",
    journal_lines: p5(45_231_000, BNK_ID),
    invariants_checked: ["I1"],
    invariants_failed: [],
    subject_obs_ids: ["obs_000001A" as ObservationId],
    evidence_ids: [],
    // ARCHITECTURE.md §4 boundary 3 requires one EXACTLY when the type is
    // ABSTAINED — an abstention without its second-best certificate is the
    // "we could not decide" with no evidence that T0-5 exists to rule out.
    certificate: {
      comp_id: "comp_000001A",
      solution_a: { candidate_id: "cand_000001A", member_obs_ids: ["obs_000001A"] },
      solution_b: { candidate_id: "cand_000002A", member_obs_ids: ["obs_000002A"] },
      shared_hard_constraints: ["C1", "C2", "C4", "C7"],
      evidence_score_gap_bps: 0,
      materiality_paise: 45_231_000,
      epsilon_bps: 1500,
      tau_paise: 10_000,
      probes_attempted: [],
      reason: "EVIDENCE_TIE",
    },
    inputs_hash: "d".repeat(64),
  } as unknown as ValidatedDecision;
}

describe("the ledger's mutating write path is reachable and is the only one", () => {
  const genesis = computeGenesisHash(GENESIS_INPUTS);

  it("posts through @assay/ledger's single exported mutating function", () => {
    const store = new RecordingStore();
    const state = openWriteState(createChain(genesis, RUN_ID));

    const { event, state: next } = postValidatedDecision(
      state,
      decisionLike(),
      { evt_id: "evt_000001A" as EventId, ts: (T0 + 400_000) as never, actor: actor() },
      store,
    );

    expect(event.kind).toBe("ABSTAIN");
    expect(event.seq).toBe(0);
    expect(store.commits).toHaveLength(1);
    expect(next.chain.events).toHaveLength(1);
  });

  it("refuses an ABSTAINED decision with no certificate", () => {
    // The boundary enforces §4's pairing rather than trusting the caller: an
    // abstention filed without a certificate is exactly the shape a bypass
    // would take, and the ledger is the last place it can be caught.
    const store = new RecordingStore();
    const uncertified = {
      ...decisionLike(),
      certificate: null,
    } as unknown as ValidatedDecision;

    expect(() =>
      postValidatedDecision(
        openWriteState(createChain(genesis, RUN_ID)),
        uncertified,
        { evt_id: "evt_000003A" as EventId, ts: (T0 + 400_002) as never, actor: actor() },
        store,
      ),
    ).toThrow();
    expect(store.commits).toEqual([]);
  });

  it("refuses a decision carrying a failed invariant, before anything is stored", () => {
    // Gate G5 at write time: §7 makes an invariant failure "never partially
    // posted, never repaired".
    const store = new RecordingStore();
    const rejected = {
      ...decisionLike(),
      invariants_failed: ["I3"],
    } as unknown as ValidatedDecision;

    expect(() =>
      postValidatedDecision(
        openWriteState(createChain(genesis, RUN_ID)),
        rejected,
        { evt_id: "evt_000002A" as EventId, ts: (T0 + 400_001) as never, actor: actor() },
        store,
      ),
    ).toThrow();
    expect(store.commits).toEqual([]);
  });

  it("exposes no adapter — persistence is the caller's port", async () => {
    const ledger: Record<string, unknown> = await import("@assay/ledger");
    expect(Object.keys(ledger)).not.toContain("LedgerStore");
    for (const name of Object.keys(ledger)) {
      expect(name).not.toMatch(/sqlite|Sqlite|SQLite/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — close-gate and close are reachable through the legitimate ledger surface
// ---------------------------------------------------------------------------

describe("the close gate and the close attempt are reachable from @assay/ledger", () => {
  const genesis = computeGenesisHash(GENESIS_INPUTS);

  /** The one posting this run made, as a chain. */
  function rebuiltChain() {
    return appendEvent(createChain(genesis, RUN_ID), {
      evt_id: "evt_000010A" as EventId,
      run_id: RUN_ID,
      ts: (T0 + 500_000) as never,
      actor: actor(),
      kind: "ABSTAIN",
      subject_ids: ["obs_000001A"],
      evidence_ids: [],
      decision_id: "dec_000010A" as DecisionId,
      inputs_hash: "c".repeat(64) as Sha256,
      journal_lines: p5(2_050, BNK_ID),
      certificate: null,
    });
  }

  /** A run whose books, queue and observation set all agree. */
  function gateInput(): CloseGateInput {
    const chain = rebuiltChain();

    return {
      genesis_hash: genesis,
      stored_root_hash: chain.root_hash,
      events: chain.events,
      observations: [{ obs_id: "obs_000001A", kind: "bank_line" }],
      terminal_states: [{ obs_id: "obs_000001A", state: "ABSTAINED" }],
      unresolved_items: [
        { source_entity_id: BNK_ID, origin: "ABSTENTION", value_paise: 2_050 as Paise },
      ],
      posted_decisions: [{ decision_id: "dec_000010A", invariants_failed: [] }],
    };
  }

  it("runs G1-G5 through the barrel and names all five", () => {
    const result = closeGate(gateInput());

    expect(result.all_passed).toBe(true);
    for (const gate of CLOSE_GATE_IDS) expect(typeof result[gate]).toBe("boolean");
  });

  it("reaches CLOSED and returns a CLOSE draft for the write path to append", () => {
    // §10.4 step 7 "appends a CLOSE event"; §L.1 rule 4 says appending is the
    // write path's. The draft crossing that seam is the composition.
    const attempt = attemptClose({
      run_id: RUN_ID,
      period: { from: T0 as never, to: (T0 + 600_000) as never },
      gate: gateInput(),
      batch_value_paise: 100_000_000 as Paise,
      unresolved_value_paise_multiview: 0 as Paise,
      closed_by: { actor: "system", id: null },
      close_event: {
        evt_id: "evt_000011A" as EventId,
        ts: (T0 + 600_001) as never,
        actor: actor(),
      },
    });

    expect(attempt.period_status).toBe("CLOSED");
    expect(attempt.report).not.toBeNull();
    expect(attempt.close_event).not.toBeNull();

    expect(attempt.close_event?.kind).toBe("CLOSE");
    // A close moves no money: §17.1/§17.1.1 fire no rule among P1-P8 at close,
    // and §16 admits an empty journal_lines "for non-posting events".
    expect(attempt.close_event?.journal_lines).toEqual([]);

    // And the draft actually appends onto the chain the gates verified — the
    // seam between T0-6's close and §L.1 rule 4's single write path. §10.4 step
    // 7's "hash becomes the run root hash" does not exist until this append,
    // because it commits to the seq and prev_hash the chain assigns.
    const verified = rebuiltChain();
    const draft = attempt.close_event;
    expect(draft).not.toBeNull();
    if (draft === null) return;
    const closed = appendEvent(verified, draft);
    expect(closed.events.at(-1)?.kind).toBe("CLOSE");
    expect(closed.root_hash).not.toBe(verified.root_hash);
  });

  it("emits no report when a gate fails, however the arithmetic reads", () => {
    const broken: CloseGateInput = { ...gateInput(), terminal_states: [] };
    const attempt = attemptClose({
      run_id: RUN_ID,
      period: { from: T0 as never, to: (T0 + 600_000) as never },
      gate: broken,
      batch_value_paise: 900_000_000_000 as Paise,
      unresolved_value_paise_multiview: 0 as Paise,
      closed_by: { actor: "system", id: null },
      close_event: {
        evt_id: "evt_000012A" as EventId,
        ts: (T0 + 600_002) as never,
        actor: actor(),
      },
    });

    expect(attempt.period_status).toBe("BLOCKED");
    expect(attempt.report).toBeNull();
    expect(attempt.close_event).toBeNull();
    expect(attempt.gate.failed_gates).toContain("g1_all_terminal");
  });
});

// ---------------------------------------------------------------------------
// 5 — the dependency graph after wiring
// ---------------------------------------------------------------------------

describe("no forbidden reverse dependency appears", () => {
  const ROOT = resolve(import.meta.dirname, "..", "..", "..");

  function manifest(pkg: string): { dependencies?: Record<string, string> } {
    return JSON.parse(
      readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
  }

  function deps(pkg: string): string[] {
    return Object.keys(manifest(pkg).dependencies ?? {})
      .filter((d) => d.startsWith("@assay/"))
      .sort();
  }

  it("keeps domain below engine and ledger", () => {
    // §L.2's build order. domain -> money and nothing else; a domain that
    // imported engine or ledger would invert it.
    expect(deps("domain")).toEqual(["@assay/money"]);
  });

  it("gives ledger no dependency on engine", () => {
    expect(deps("ledger")).toEqual(["@assay/domain", "@assay/money"]);
    expect(deps("ledger")).not.toContain("@assay/engine");
  });

  it("adds no dependency to any package Phase 2 touched", () => {
    // The wiring is exports, not edges: no manifest gained a dependency.
    expect(deps("engine")).toEqual(["@assay/domain", "@assay/ledger", "@assay/money"]);
  });

  it("declares the S0 subpath so the quarantine stays separately bannable", () => {
    const domain = JSON.parse(
      readFileSync(join(ROOT, "packages", "domain", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(Object.keys(domain.exports ?? {}).sort()).toEqual([
      ".",
      "./s0-ingest",
      "./untrusted-text",
    ]);
  });

  it("declares the S0 ban wherever the quarantine is banned, and in engine/src too", () => {
    // s0-ingest emits UntrustedText, so a package allowed to import S0 while
    // banned from the quarantine would reach it by another name.
    //
    // This asserts the DECLARATION, not that the rule fires — a config block
    // can be shadowed. Flat config REPLACES a rule's options when a later block
    // sets the same rule, so `packages/engine/src/**` is governed by the
    // protected-artifact block rather than the packages/engine block, and a ban
    // declared only in the latter never reaches the engine's own source. That
    // is why S0_INGEST appears one MORE time than UNTRUSTED_TEXT does: the
    // extra occurrence is the repeat inside the block that actually governs
    // engine/src and oracle/src. `packages/engine/tests/discipline.test.ts`
    // asserts the effect independently, by scanning this package's sources.
    const config = readFileSync(join(ROOT, "eslint.config.js"), "utf8");
    const untrusted = [...config.matchAll(/group: UNTRUSTED_TEXT,/g)].length;
    const s0 = [...config.matchAll(/group: S0_INGEST,/g)].length;

    expect(untrusted).toBeGreaterThan(0);
    expect(s0).toBe(untrusted + 1);
  });
});

// ---------------------------------------------------------------------------
// 6 — the CLI composes and does not duplicate
// ---------------------------------------------------------------------------

describe("apps/cli composes the layers rather than reimplementing them", () => {
  const SRC = resolve(import.meta.dirname, "..", "src");

  function sources(): { rel: string; body: string }[] {
    const out: { rel: string; body: string }[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".ts")) {
          out.push({
            rel: full.slice(SRC.length + 1),
            body: readFileSync(full, "utf8")
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/^\s*\/\/.*$/gm, ""),
          });
        }
      }
    };
    walk(SRC);
    return out;
  }

  it("implements no close gate of its own", () => {
    // §C T0-6 puts G1-G5 in packages/ledger. A CLI that recomputed one would be
    // a second implementation downstream of the one the report asserts.
    for (const { rel, body } of sources()) {
      expect(body, rel).not.toMatch(/g1_all_terminal|g2_trial_balance|g3_suspense_identity/);
      expect(body, rel).not.toMatch(/close_threshold_paise\s*[:=]/);
      expect(body, rel).not.toMatch(/max_unresolved_ratio_bps\s*[:=]/);
    }
  });

  it("mints no ValidatedDecision and opens no second write path", () => {
    for (const { rel, body } of sources()) {
      expect(body, rel).not.toMatch(/as\s+unknown\s+as\s+ValidatedDecision/);
      expect(body, rel).not.toMatch(/\.commit\s*\(/);
    }
  });

  it("keeps every Phase-2 import on a package barrel or its declared subpath", () => {
    // No deep reach past a package's surface: `@assay/x/src/...` would make the
    // barrel's guarantees advisory.
    for (const { rel, body } of sources()) {
      for (const match of body.matchAll(/from\s+"(@assay\/[^"]+)"/g)) {
        const spec = match[1] ?? "";
        expect(spec, `${rel} -> ${spec}`).not.toMatch(/\/src\//);
      }
    }
  });
});
