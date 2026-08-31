import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { InvariantId, ObservationId, UnixSeconds } from "@assay/domain";

import {
  LedgerEventError,
  TrialBalanceError,
  appendEvent,
  computeEventHash,
  computeGenesisHash,
  createChain,
  projectChain,
  verifyChain,
  type DecisionId,
  type EventId,
  type EvidenceId,
  type JournalLine,
  type LedgerEvent,
  type ValidatedDecision,
} from "@assay/ledger";

import type { LedgerCommit, LedgerStore } from "../src/store.js";
import {
  DuplicatePostError,
  LedgerWriteError,
  RejectedDecisionError,
  openWriteState,
  postValidatedDecision,
  type EventStamp,
  type LedgerWriteState,
} from "../src/write.js";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  RUN_ID,
  SETTLEMENT_ID,
  digest,
  id,
  line,
  makeActor,
  makeCertificate,
  p5Lines,
} from "./fixtures.js";

/**
 * The single mutating write path — `DECISION_BRIEF.md §L.1` rule 4,
 * `ARCHITECTURE.md §4` boundary 3.
 *
 * These import `../src/write.js` directly rather than through
 * `@assay/ledger`, because the package's public surface is wired at
 * integration and a test that waited for the barrel would be testing the
 * barrel. Everything the write path *consumes* — the chain, the seal, the
 * digests — comes through the public entry point, so the assertions below run
 * against the same `hash-chain.ts` every other suite does.
 */

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

// ---------------------------------------------------------------------------
// Minting a `ValidatedDecision`, once
// ---------------------------------------------------------------------------

/**
 * The nine public fields, taken from the declaration rather than restated.
 *
 * `Pick` drops the non-exported brand — the one member of the interface this
 * file cannot name — while keeping every other field's type bound to
 * `validated-decision.ts`. A field renamed or re-typed there fails to compile
 * here, which a hand-written mirror would not.
 */
type DecisionFields = Pick<
  ValidatedDecision,
  | "decision_id"
  | "type"
  | "journal_lines"
  | "invariants_checked"
  | "invariants_failed"
  | "subject_obs_ids"
  | "evidence_ids"
  | "certificate"
  | "inputs_hash"
>;

/**
 * This suite's stand-in for stage S5, and the **only** widening in the file.
 *
 * `ARCHITECTURE.md §4` boundary 3 puts the single production widening in
 * `packages/engine/src/s5-validate.ts`; a test of the boundary that accepts
 * only branded values must nevertheless produce one, so it produces it here,
 * once, where it is visible. The engine's own discipline suite counts widenings
 * across `packages/engine/src` and is unaffected by this file.
 */
function validated(fields: DecisionFields): ValidatedDecision {
  return Object.freeze(fields) as unknown as ValidatedDecision;
}

const OBS_A = id("obs_", 1) as ObservationId;
const OBS_B = id("obs_", 2) as ObservationId;
const EVIDENCE = id("ev_", 1) as EvidenceId;
const CHECKED: readonly InvariantId[] = Object.freeze(["I1", "I2", "I6"]);

function decision(overrides: Partial<DecisionFields> = {}): ValidatedDecision {
  return validated({
    decision_id: id("dec_", 1) as DecisionId,
    type: "ABSTAINED",
    journal_lines: p5Lines(),
    invariants_checked: CHECKED,
    invariants_failed: [],
    subject_obs_ids: [OBS_A, OBS_B],
    evidence_ids: [EVIDENCE],
    certificate: makeCertificate(),
    inputs_hash: digest(3),
    ...overrides,
  });
}

function stamp(n = 1, overrides: Partial<EventStamp> = {}): EventStamp {
  return {
    evt_id: id("evt_", n) as EventId,
    ts: 1_787_000_000 as UnixSeconds,
    actor: makeActor(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** An adapter that keeps what it was handed. `apps/cli` supplies the real one. */
class RecordingStore implements LedgerStore {
  readonly commits: LedgerCommit[] = [];

  commit(unit: LedgerCommit): void {
    this.commits.push(unit);
  }
}

/** The failure a persistence adapter is entitled to raise. */
class StoreFailure extends Error {
  constructor() {
    super("the store refused the commit");
    this.name = "StoreFailure";
  }
}

/** An adapter that always refuses, having stored nothing (`store.ts`, rule 1). */
class BrokenStore implements LedgerStore {
  calls = 0;

  commit(): void {
    this.calls += 1;
    throw new StoreFailure();
  }
}

function emptyState(): LedgerWriteState {
  return openWriteState(createChain(GENESIS, RUN_ID));
}

/** Everything a refused post must leave exactly as it found it. */
function snapshot(state: LedgerWriteState): unknown {
  return {
    events: state.chain.events.length,
    root: state.chain.root_hash,
    dr: state.chain.total_dr_paise,
    cr: state.chain.total_cr_paise,
    decisions: [...state.posted_decision_ids].sort(),
    evts: [...state.posted_event_ids].sort(),
  };
}

// ---------------------------------------------------------------------------

describe("a valid decision is posted, sealed and committed", () => {
  it("appends one event, commits it once, and returns the new position", () => {
    const before = emptyState();
    const store = new RecordingStore();

    const { state, event } = postValidatedDecision(before, decision(), stamp(), store);

    expect(state.chain.events).toHaveLength(1);
    expect(state.chain.events[0]).toBe(event);
    expect(state.chain.root_hash).toBe(event.hash);

    // ARCHITECTURE.md §8: "one event per decision or state change".
    expect(store.commits).toHaveLength(1);
    const unit = store.commits[0] as LedgerCommit;
    expect(unit.events).toHaveLength(1);
    expect(unit.events[0]).toBe(event);
    expect(unit.run_id).toBe(RUN_ID);
    expect(unit.genesis_hash).toBe(GENESIS);
    expect(unit.root_hash).toBe(event.hash);
  });

  it("leaves the state it was given untouched", () => {
    // The all-or-nothing story with no rollback step: the old value is still
    // a position in which the post never happened.
    const before = emptyState();
    const taken = snapshot(before);
    postValidatedDecision(before, decision(), stamp(), new RecordingStore());
    expect(snapshot(before)).toEqual(taken);
    expect(before.chain.events).toHaveLength(0);
  });

  it("records the decision and the event id on the returned state", () => {
    const { state } = postValidatedDecision(
      emptyState(),
      decision(),
      stamp(),
      new RecordingStore(),
    );
    expect(state.posted_decision_ids.has(id("dec_", 1) as DecisionId)).toBe(true);
    expect(state.posted_event_ids.has(id("evt_", 1) as EventId)).toBe(true);
  });

  it("produces a chain that verifies against its own root (gate G4)", () => {
    let state = emptyState();
    const store = new RecordingStore();
    for (let n = 1; n <= 3; n += 1) {
      state = postValidatedDecision(
        state,
        decision({ decision_id: id("dec_", n) as DecisionId }),
        stamp(n),
        store,
      ).state;
    }
    const verification = verifyChain(GENESIS, state.chain.events, state.chain.root_hash);
    expect(verification.failures).toEqual([]);
    expect(verification.ok).toBe(true);
    // Layer B agrees with Layer A: I1 holds over the projection too.
    expect(projectChain(state.chain).trialBalanceOk).toBe(true);
  });
});

describe("event construction — DATA_MODEL.md §16", () => {
  it("derives the kind from the decision type and never takes it from a caller", () => {
    const cases = [
      ["RECONCILED", "RECONCILE", null],
      ["ABSTAINED", "ABSTAIN", makeCertificate()],
      ["EXCEPTION", "EXCEPTION", null],
    ] as const;

    for (const [type, kind, certificate] of cases) {
      const { event } = postValidatedDecision(
        emptyState(),
        decision({ type, certificate }),
        stamp(),
        new RecordingStore(),
      );
      expect(event.kind).toBe(kind);
    }
  });

  it("carries every §16 field across from the decision and the stamp", () => {
    const lines = p5Lines(45_231_000, SETTLEMENT_ID);
    const certificate = makeCertificate();
    const actor = makeActor({ component: "engine.s5_validate" });
    const { event } = postValidatedDecision(
      emptyState(),
      decision({
        decision_id: id("dec_", 7) as DecisionId,
        journal_lines: lines,
        subject_obs_ids: [OBS_B, OBS_A],
        evidence_ids: [EVIDENCE],
        certificate,
        inputs_hash: digest(11),
      }),
      stamp(4, { ts: 1_787_654_321 as UnixSeconds, actor }),
      new RecordingStore(),
    );

    expect(event.evt_id).toBe(id("evt_", 4));
    expect(event.ts).toBe(1_787_654_321);
    expect(event.actor).toEqual(actor);
    expect(event.decision_id).toBe(id("dec_", 7));
    expect(event.inputs_hash).toBe(digest(11));
    expect(event.evidence_ids).toEqual([EVIDENCE]);
    expect(event.certificate).toEqual(certificate);
    // §16: subject_ids "in the order the emitting stage produced them" — the
    // decision's order, not a sorted one.
    expect(event.subject_ids).toEqual([OBS_B, OBS_A]);
    // The run is the chain's. There is no parameter for it.
    expect(event.run_id).toBe(RUN_ID);
  });

  it("posts the lines S5 validated rather than re-deriving them", () => {
    // ARCHITECTURE.md §4 boundary 3: "The write path must post *these*, never
    // re-derive them." The lines below name a P6 rule against a settlement key
    // on an EXCEPTION decision — a combination no posting rule would select
    // for this occasion — so an event carrying them proves nothing re-derived.
    // The account is `1100_GATEWAY_RECEIVABLE`, DATA_MODEL.md §17.1's own P6
    // debit leg (there is no `2100_SETTLEMENT_RECEIVABLE` among the seven
    // control accounts `packages/domain`'s `ACCOUNT_CODES` declares).
    const lines: readonly JournalLine[] = [
      line("9000_SUSPENSE_UNRECONCILED", 7_777, 0, "P6.dr", SETTLEMENT_ID),
      line("1100_GATEWAY_RECEIVABLE", 0, 7_777, "P6.cr", SETTLEMENT_ID),
    ];
    const { event } = postValidatedDecision(
      emptyState(),
      decision({ type: "EXCEPTION", certificate: null, journal_lines: lines }),
      stamp(),
      new RecordingStore(),
    );
    expect(event.journal_lines).toEqual(lines);
  });

  it("admits an event that posts nothing (§16: 'may be empty')", () => {
    // DATA_MODEL.md §17.1.1: seven exception classes open a Suspense item and
    // seven do not. The latter still reach a terminal state and still record an
    // event.
    const { event, state } = postValidatedDecision(
      emptyState(),
      decision({ type: "EXCEPTION", certificate: null, journal_lines: [] }),
      stamp(),
      new RecordingStore(),
    );
    expect(event.journal_lines).toEqual([]);
    expect(state.chain.total_dr_paise).toBe(0);
    expect(state.chain.total_cr_paise).toBe(0);
  });

  it("lets the chain assign seq and prev_hash, and hashes §16's formula", () => {
    let state = emptyState();
    const store = new RecordingStore();
    const events: LedgerEvent[] = [];
    for (let n = 1; n <= 3; n += 1) {
      const posted = postValidatedDecision(
        state,
        decision({ decision_id: id("dec_", n) as DecisionId }),
        stamp(n),
        store,
      );
      state = posted.state;
      events.push(posted.event);
    }

    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(events[0]?.prev_hash).toBe(GENESIS);
    expect(events[1]?.prev_hash).toBe(events[0]?.hash);
    expect(events[2]?.prev_hash).toBe(events[1]?.hash);
    for (const event of events) {
      expect(event.hash).toBe(computeEventHash(event, event.prev_hash));
    }
  });

  it("seals the event, so a caller holding the decision cannot alter it", () => {
    const lines = [...p5Lines()];
    const posted = postValidatedDecision(
      emptyState(),
      decision({ journal_lines: lines }),
      stamp(),
      new RecordingStore(),
    );
    expect(Object.isFrozen(posted.event)).toBe(true);
    expect(Object.isFrozen(posted.event.journal_lines)).toBe(true);
    expect(posted.event.journal_lines[0]).not.toBe(lines[0]);
  });
});

describe("what may not be posted — ARCHITECTURE.md §4 boundary 3", () => {
  it("refuses a decision with a non-empty invariants_failed (gate G5)", () => {
    const store = new RecordingStore();
    const before = emptyState();
    const taken = snapshot(before);

    expect(() =>
      postValidatedDecision(
        before,
        decision({ invariants_failed: ["I4"] }),
        stamp(),
        store,
      ),
    ).toThrow(RejectedDecisionError);

    // "never partially posted, never repaired, never downgraded to a warning".
    expect(store.commits).toHaveLength(0);
    expect(snapshot(before)).toEqual(taken);
  });

  it("refuses an ABSTAINED decision with no certificate", () => {
    expect(() =>
      postValidatedDecision(
        emptyState(),
        decision({ type: "ABSTAINED", certificate: null }),
        stamp(),
        new RecordingStore(),
      ),
    ).toThrow(RejectedDecisionError);
  });

  it("refuses a RECONCILED or EXCEPTION decision that carries one", () => {
    for (const type of ["RECONCILED", "EXCEPTION"] as const) {
      expect(() =>
        postValidatedDecision(
          emptyState(),
          decision({ type, certificate: makeCertificate() }),
          stamp(),
          new RecordingStore(),
        ),
      ).toThrow(RejectedDecisionError);
    }
  });

  it("refuses an unbalanced posting before the store is called (I1)", () => {
    const store = new RecordingStore();
    expect(() =>
      postValidatedDecision(
        emptyState(),
        decision({ journal_lines: [line("1200_BANK", 500, 0)] }),
        stamp(),
        store,
      ),
    ).toThrow(TrialBalanceError);
    expect(store.commits).toHaveLength(0);
  });

  it("refuses a malformed journal line before the store is called (§16)", () => {
    const store = new RecordingStore();
    expect(() =>
      postValidatedDecision(
        emptyState(),
        // "exactly one of dr/cr is non-zero".
        decision({ journal_lines: [line("1200_BANK", 500, 500)] }),
        stamp(),
        store,
      ),
    ).toThrow(LedgerEventError);
    expect(store.commits).toHaveLength(0);
  });

  it("raises refusals a caller can separate from a store failure", () => {
    // One supertype for "the ledger would not take it"; the store's own error
    // is not wrapped in it.
    const rejected = (): unknown =>
      postValidatedDecision(
        emptyState(),
        decision({ invariants_failed: ["I1"] }),
        stamp(),
        new RecordingStore(),
      );
    expect(rejected).toThrow(LedgerWriteError);
    expect(() =>
      postValidatedDecision(emptyState(), decision(), stamp(), new BrokenStore()),
    ).not.toThrow(LedgerWriteError);
  });
});

describe("duplicate protection", () => {
  it("refuses a decision_id already posted to this chain", () => {
    const store = new RecordingStore();
    const { state } = postValidatedDecision(
      emptyState(),
      decision(),
      stamp(1),
      store,
    );
    const taken = snapshot(state);

    let caught: unknown;
    try {
      // A different event id, the same decision: the second post would book
      // the same journal lines twice.
      postValidatedDecision(state, decision(), stamp(2), store);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DuplicatePostError);
    expect((caught as DuplicatePostError).key).toBe("decision_id");
    expect((caught as DuplicatePostError).value).toBe(id("dec_", 1));
    expect(store.commits).toHaveLength(1);
    expect(snapshot(state)).toEqual(taken);
  });

  it("refuses an evt_id already in this chain", () => {
    const store = new RecordingStore();
    const { state } = postValidatedDecision(emptyState(), decision(), stamp(1), store);

    let caught: unknown;
    try {
      postValidatedDecision(
        state,
        decision({ decision_id: id("dec_", 2) as DecisionId }),
        stamp(1),
        store,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DuplicatePostError);
    expect((caught as DuplicatePostError).key).toBe("evt_id");
    expect(store.commits).toHaveLength(1);
  });

  it("reads the guard from the chain, so a resumed run inherits it", () => {
    // openWriteState indexes an existing chain rather than trusting a caller to
    // remember what it wrote. Here the chain was built by appendEvent directly,
    // as a reload from storage would be.
    const chain = appendEvent(createChain(GENESIS, RUN_ID), {
      evt_id: id("evt_", 1) as EventId,
      run_id: RUN_ID,
      ts: 1_787_000_000 as UnixSeconds,
      actor: makeActor(),
      kind: "ABSTAIN",
      subject_ids: [OBS_A],
      evidence_ids: [EVIDENCE],
      decision_id: id("dec_", 1) as DecisionId,
      inputs_hash: digest(3),
      journal_lines: p5Lines(),
      certificate: makeCertificate(),
    });
    const state = openWriteState(chain);

    expect(state.posted_decision_ids.has(id("dec_", 1) as DecisionId)).toBe(true);
    expect(() =>
      postValidatedDecision(state, decision(), stamp(2), new RecordingStore()),
    ).toThrow(DuplicatePostError);
  });

  it("lets a caller skip what is already posted without catching", () => {
    // The recoverable half of the refusal: the sets are public so a resume can
    // filter rather than rely on exception-driven control flow.
    const { state } = postValidatedDecision(
      emptyState(),
      decision(),
      stamp(1),
      new RecordingStore(),
    );
    const pending = [id("dec_", 1), id("dec_", 2)] as DecisionId[];
    const todo = pending.filter((d) => !state.posted_decision_ids.has(d));
    expect(todo).toEqual([id("dec_", 2)]);
  });
});

describe("the write is all-or-nothing", () => {
  it("advances nothing when the store refuses", () => {
    const before = emptyState();
    const taken = snapshot(before);
    const store = new BrokenStore();

    expect(() => postValidatedDecision(before, decision(), stamp(), store)).toThrow(
      StoreFailure,
    );

    expect(store.calls).toBe(1);
    expect(snapshot(before)).toEqual(taken);
    expect(before.chain.events).toHaveLength(0);
    expect(before.chain.root_hash).toBe(GENESIS);
    expect(before.posted_decision_ids.size).toBe(0);
  });

  it("consumes no seq, so a retry produces the digest the first attempt would have", () => {
    const before = emptyState();
    expect(() =>
      postValidatedDecision(before, decision(), stamp(), new BrokenStore()),
    ).toThrow(StoreFailure);

    const retried = postValidatedDecision(
      before,
      decision(),
      stamp(),
      new RecordingStore(),
    );
    const fresh = postValidatedDecision(
      emptyState(),
      decision(),
      stamp(),
      new RecordingStore(),
    );

    expect(retried.event.seq).toBe(0);
    expect(retried.event.prev_hash).toBe(GENESIS);
    expect(retried.event.hash).toBe(fresh.event.hash);
  });

  it("keeps an earlier failure out of a later chain", () => {
    // A rejected decision in the middle of a batch leaves no gap: the batch
    // continues (RECONCILIATION_SPEC.md §7) and the chain is as if it never came.
    const store = new RecordingStore();
    let state = emptyState();
    state = postValidatedDecision(
      state,
      decision({ decision_id: id("dec_", 1) as DecisionId }),
      stamp(1),
      store,
    ).state;
    expect(() =>
      postValidatedDecision(
        state,
        decision({ decision_id: id("dec_", 2) as DecisionId, invariants_failed: ["I3"] }),
        stamp(2),
        store,
      ),
    ).toThrow(RejectedDecisionError);
    state = postValidatedDecision(
      state,
      decision({ decision_id: id("dec_", 3) as DecisionId }),
      stamp(3),
      store,
    ).state;

    expect(state.chain.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(state.chain.events.map((e) => e.decision_id)).toEqual([
      id("dec_", 1),
      id("dec_", 3),
    ]);
    expect(store.commits).toHaveLength(2);
    expect(verifyChain(GENESIS, state.chain.events, state.chain.root_hash).ok).toBe(true);
  });
});

describe("persistence is deterministic — I9 and metric 23", () => {
  it("gives two runs over identical inputs identical hashes", () => {
    const run = (): { root: string; hashes: string[] } => {
      let state = emptyState();
      const store = new RecordingStore();
      for (let n = 1; n <= 4; n += 1) {
        state = postValidatedDecision(
          state,
          decision({ decision_id: id("dec_", n) as DecisionId }),
          stamp(n),
          store,
        ).state;
      }
      return {
        root: state.chain.root_hash,
        hashes: state.chain.events.map((e) => e.hash),
      };
    };
    expect(run()).toEqual(run());
  });

  it("holds over arbitrary batches", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom("RECONCILED", "ABSTAINED", "EXCEPTION" as const),
            amount: fc.integer({ min: 1, max: 5_000_000 }),
            empty: fc.boolean(),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (batch) => {
          const post = (): LedgerWriteState => {
            let state = emptyState();
            const store = new RecordingStore();
            batch.forEach((item, index) => {
              const type = item.type as ValidatedDecision["type"];
              state = postValidatedDecision(
                state,
                decision({
                  decision_id: id("dec_", index + 1) as DecisionId,
                  type,
                  certificate: type === "ABSTAINED" ? makeCertificate() : null,
                  journal_lines: item.empty
                    ? []
                    : p5Lines(item.amount, index % 2 === 0 ? BANK_LINE_ID : SETTLEMENT_ID),
                }),
                stamp(index + 1),
                store,
              ).state;
            });
            expect(store.commits).toHaveLength(batch.length);
            return state;
          };

          const first = post();
          const second = post();
          expect(second.chain.root_hash).toBe(first.chain.root_hash);
          expect(second.chain.events.map((e) => e.hash)).toEqual(
            first.chain.events.map((e) => e.hash),
          );
          // The chain it built is a chain: linked, gapless and balanced.
          expect(
            verifyChain(GENESIS, first.chain.events, first.chain.root_hash).ok,
          ).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Discipline — read as source text, in the style of packages/eval's suite
// ---------------------------------------------------------------------------

const LEDGER_SRC = resolve(import.meta.dirname, "..", "src");
const PACKAGES = resolve(import.meta.dirname, "..", "..");

interface Source {
  readonly name: string;
  readonly text: string;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function sourcesUnder(dir: string): Source[] {
  return tsFiles(dir).map((full) => ({
    name: full.slice(dir.length + 1).replaceAll("\\", "/"),
    text: readFileSync(full, "utf8"),
  }));
}

/** Comments removed: this package's prose names what it refuses to use. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function specifiers(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of code(text).matchAll(re)) {
      if (match[1] !== undefined) out.push(match[1]);
    }
  }
  return out;
}

const LEDGER_SOURCES = sourcesUnder(LEDGER_SRC);

describe("exactly one write path, and it is unreachable from elsewhere", () => {
  it("finds the boundary where §L.1 rule 4 puts it", () => {
    expect(LEDGER_SOURCES.map((s) => s.name)).toContain("write.ts");
    expect(LEDGER_SOURCES.map((s) => s.name)).toContain("store.ts");
  });

  it("declares exactly one function taking a ValidatedDecision", () => {
    // §4 boundary 3: "exposes exactly one mutating function, and it accepts
    // only a ValidatedDecision. There is no other write path."
    const params = LEDGER_SOURCES.flatMap(({ name, text }) =>
      [...code(text).matchAll(/:\s*ValidatedDecision\b/g)].map(() => name),
    );
    expect(params).toEqual(["write.ts"]);
  });

  it("commits through the injected port from one call site", () => {
    const calls = LEDGER_SOURCES.flatMap(({ name, text }) =>
      [...code(text).matchAll(/\bstore\s*\.\s*commit\s*\(/g)].map(() => name),
    );
    expect(calls).toEqual(["write.ts"]);
  });

  it("mints no ValidatedDecision and exports no constructor for one", () => {
    // `validated-decision.ts` is the one file allowed to hold `VALIDATED_BRAND`
    // — it is the module that defines the brand `ARCHITECTURE.md §4` boundary 3
    // requires "allowlisted by path in an ESLint rule", not a file that could
    // mint a `ValidatedDecision` on its own. Excluding it from the scan is what
    // makes the assertion test "nothing ELSE mints one" rather than a tautology
    // that fails on the brand's own declaration.
    for (const { name, text } of LEDGER_SOURCES) {
      if (name === "validated-decision.ts") continue;
      expect(`${name}`).toBeTruthy();
      expect(code(text)).not.toMatch(/as\s+unknown\s+as\s+ValidatedDecision/);
      expect(code(text)).not.toMatch(
        /export\s+(function|const)\s+\w*(mint|create|make|as)ValidatedDecision/,
      );
      expect(code(text)).not.toMatch(/VALIDATED_BRAND/);
    }
  });

  it("performs no filesystem, database or network I/O", () => {
    // ARCHITECTURE.md §3 gives apps/cli "all filesystem I/O"; §8's
    // better-sqlite3 is in no manifest in this workspace. node:crypto is the
    // one builtin Layer A may have: §16's digests are not I/O.
    const forbidden =
      /^(node:)?(fs|fs\/promises|path|http|https|net|dns|dgram|tls|child_process|worker_threads|os|readline|process|better-sqlite3|sqlite3|node:sqlite)$/;
    for (const source of LEDGER_SOURCES) {
      for (const spec of specifiers(source.text)) {
        expect(`${source.name} :: ${spec}`).toBeTruthy();
        expect(forbidden.test(spec)).toBe(false);
      }
    }
  });

  it("reads no clock and no random source inside the boundary", () => {
    const banned = [
      /\bDate\s*\.\s*now\b/,
      /\bnew\s+Date\b/,
      /\bMath\s*\.\s*random\b/,
      /\bperformance\s*\.\s*now\b/,
      /\bprocess\s*\.\s*(env|hrtime|argv)\b/,
      /\bcrypto\s*\.\s*(randomUUID|getRandomValues)\b/,
      /\bfetch\s*\(/,
    ];
    for (const source of LEDGER_SOURCES) {
      for (const re of banned) {
        expect(`${source.name} :: ${re.source}`).toBeTruthy();
        expect(re.test(code(source.text))).toBe(false);
      }
    }
  });

  it("is not importable from outside the package", () => {
    // A deep import is what would give another package a second door.
    // packages/ledger publishes one entry point, so `@assay/ledger/write.js`
    // resolves to nothing at all.
    const manifest = JSON.parse(
      readFileSync(join(PACKAGES, "ledger", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(Object.keys(manifest.exports ?? {})).toEqual(["."]);
  });

  it("gives no other package a persistence route", () => {
    // Requirement of §L.1 rule 4 read forward: engine, probe, oracle, eval and
    // everything else reach the ledger through pure functions only. apps/ are
    // excluded — ARCHITECTURE.md §3 gives apps/cli the adapter.
    const others = readdirSync(PACKAGES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "ledger")
      .map((entry) => entry.name)
      .sort();
    expect(others.length).toBeGreaterThan(0);

    const banned =
      /postValidatedDecision|openWriteState|LedgerWriteState|LedgerStore|LedgerCommit|ledger\/src\/write|ledger\/src\/store/;
    for (const name of others) {
      const dir = join(PACKAGES, name, "src");
      for (const source of sourcesUnder(dir)) {
        expect(`${name}/${source.name}`).toBeTruthy();
        expect(banned.test(code(source.text))).toBe(false);
      }
    }
  });
});
