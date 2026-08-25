import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { ACCOUNT_CODES, CONSTRAINT_IDS, canonicalJson } from "@assay/domain";
import type { Paise } from "@assay/money";

import {
  ACTOR_TYPES,
  CERTIFICATE_REASONS,
  EVENT_KINDS,
  LLM_PROVIDER_IDS,
  TrialBalanceError,
  appendEvent,
  canonicalEventBody,
  computeEventHash,
  computeGenesisHash,
  createChain,
  journalTotals,
  sealDraft,
  verifyChain,
  type JournalLine,
  type LedgerChain,
  type LedgerEventDraft,
  type RunId,
} from "@assay/ledger";

import { GENESIS_INPUTS, RUN_ID, asEvents, digest, storedCopy } from "./../fixtures.js";

/**
 * Layer A's invariants are the kind that hold "for every event", and a handful
 * of hand-written examples cannot say that. These are the four claims the rest
 * of the system rests on:
 *
 *   - the root hash is a function of the hashed content and nothing else
 *     (metric 23 / invariant `I9`);
 *   - any change to hashed content is detected (`THREAT_MODEL.md §T10`, gate G4);
 *   - a chain is gapless, linked and balanced by construction (`§16`, `I1`);
 *   - nothing that entered the chain can be changed afterwards.
 */
const SEED = 20260826;
const CHEAP_RUNS = 10_000;
const CHAIN_RUNS = 2_000;

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

const TOKEN_CHARS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
];

const token = fc
  .array(fc.constantFrom(...TOKEN_CHARS), { minLength: 1, maxLength: 10 })
  .map((characters) => characters.join(""));

const prefixed = (prefix: string): fc.Arbitrary<string> =>
  token.map((suffix) => `${prefix}${suffix}`);

const sha256Like = fc.nat({ max: 1_000_000 }).map(digest);

const amount = fc.integer({ min: 1, max: 10_000_000_000 });

/**
 * A balanced posting: one or more debit legs and a single credit leg carrying
 * their total, or the mirror image. Every posting in `§17.1` and `§17.2` has
 * this shape.
 */
const journalLines = fc
  .tuple(
    fc.array(fc.tuple(fc.constantFrom(...ACCOUNT_CODES), amount), {
      minLength: 1,
      maxLength: 3,
    }),
    fc.constantFrom(...ACCOUNT_CODES),
    fc.boolean(),
  )
  .map(([legs, counterAccount, mirrored]): readonly JournalLine[] => {
    const total = legs.reduce((sum, [, value]) => sum + value, 0);
    const many = legs.map(([account, value], index): JournalLine => ({
      account,
      dr_paise: (mirrored ? 0 : value) as Paise,
      cr_paise: (mirrored ? value : 0) as Paise,
      memo_ref: `leg${String(index)}`,
    }));
    const counter: JournalLine = {
      account: counterAccount,
      dr_paise: (mirrored ? total : 0) as Paise,
      cr_paise: (mirrored ? 0 : total) as Paise,
      memo_ref: "counter",
    };
    return [...many, counter];
  });

const certificate = fc
  .record({
    comp: prefixed("comp_"),
    candA: prefixed("cand_"),
    candB: prefixed("cand_"),
    obsA: fc.array(prefixed("obs_"), { maxLength: 3 }),
    obsB: fc.array(prefixed("obs_"), { maxLength: 3 }),
    constraints: fc.uniqueArray(fc.constantFrom(...CONSTRAINT_IDS), { maxLength: 8 }),
    gap: fc.integer({ min: 0, max: 10_000 }),
    materiality: fc.integer({ min: 0, max: 10_000_000_000 }),
    epsilon: fc.integer({ min: 0, max: 10_000 }),
    tau: fc.integer({ min: 0, max: 10_000_000 }),
    probes: fc.array(prefixed("probe_"), { maxLength: 3 }),
    reason: fc.constantFrom(...CERTIFICATE_REASONS),
  })
  .map((raw) => ({
    comp_id: raw.comp,
    solution_a: { candidate_id: raw.candA, member_obs_ids: raw.obsA },
    solution_b: { candidate_id: raw.candB, member_obs_ids: raw.obsB },
    shared_hard_constraints: raw.constraints,
    evidence_score_gap_bps: raw.gap,
    materiality_paise: raw.materiality,
    epsilon_bps: raw.epsilon,
    tau_paise: raw.tau,
    probes_attempted: raw.probes,
    reason: raw.reason,
  }));

const draft = fc
  .record({
    evtId: prefixed("evt_"),
    runId: token,
    ts: fc.integer({ min: 1, max: 2_000_000_000 }),
    actorType: fc.constantFrom(...ACTOR_TYPES),
    component: token,
    engineCommit: token,
    provider: fc.option(fc.constantFrom(...LLM_PROVIDER_IDS), { nil: null }),
    modelId: fc.option(token, { nil: null }),
    promptHash: fc.option(sha256Like, { nil: null }),
    llmCallId: fc.option(token, { nil: null }),
    kind: fc.constantFrom(...EVENT_KINDS),
    subjects: fc.array(token, { maxLength: 4 }),
    evidence: fc.array(token, { maxLength: 4 }),
    decisionId: fc.option(prefixed("dec_"), { nil: null }),
    inputsHash: sha256Like,
    lines: fc.oneof(journalLines, fc.constant([] as readonly JournalLine[])),
    cert: fc.option(certificate, { nil: null }),
  })
  .map((raw) => ({
    evt_id: raw.evtId,
    run_id: raw.runId,
    ts: raw.ts,
    actor: {
      // §16: a RECONCILE event is deterministic by construction, so the
      // generator produces legal drafts rather than relying on the seal to
      // reject an illegal combination it was not asked to test here.
      type: raw.kind === "RECONCILE" ? "deterministic" : raw.actorType,
      component: raw.component,
      engine_commit: raw.engineCommit,
      llm_provider: raw.provider,
      model_id: raw.modelId,
      prompt_hash: raw.promptHash,
      llm_call_id: raw.llmCallId,
    },
    kind: raw.kind,
    subject_ids: raw.subjects,
    evidence_ids: raw.evidence,
    decision_id: raw.decisionId,
    inputs_hash: raw.inputsHash,
    journal_lines: raw.lines,
    certificate: raw.cert,
  })) as unknown as fc.Arbitrary<LedgerEventDraft>;

/** A run's worth of drafts: one run id, distinct event ids. */
const draftSequence = fc
  .tuple(token, fc.array(draft, { minLength: 1, maxLength: 6 }))
  .map(([runId, drafts]) =>
    drafts.map((one, index) => ({
      ...one,
      run_id: runId as RunId,
      evt_id: `evt_${String(index)}${one.evt_id.slice(4)}` as LedgerEventDraft["evt_id"],
    })),
  );

function build(drafts: readonly LedgerEventDraft[]): LedgerChain {
  const first = drafts[0];
  const runId = (first?.run_id ?? RUN_ID) as RunId;
  return drafts.reduce(
    (chain, one) => appendEvent(chain, one),
    createChain(GENESIS, runId),
  );
}

describe("the root hash is a function of the hashed content alone", () => {
  it("gives the same chain the same root every time it is built", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        expect(build(drafts).root_hash).toBe(build(drafts).root_hash);
        return true;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("ignores evt_id, run_id and ts — the three excluded fields", () => {
    // This is metric 23 (`determinism_check`) at the level of one event: two
    // executions over identical inputs differ in exactly these three fields and
    // must still produce identical digests.
    fc.assert(
      fc.property(draft, token, token, fc.integer({ min: 1, max: 2e9 }), sha256Like,
        (one, otherEvtSuffix, otherRun, otherTs, prev) => {
          const base = { ...sealDraft(one), seq: 0 };
          const relabelled = {
            ...sealDraft({
              ...one,
              evt_id: `evt_${otherEvtSuffix}` as LedgerEventDraft["evt_id"],
              run_id: otherRun as RunId,
              ts: otherTs as LedgerEventDraft["ts"],
            }),
            seq: 0,
          };
          return computeEventHash(base, prev) === computeEventHash(relabelled, prev);
        }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });

  it("gives equal digests only to equal canonical bodies", () => {
    fc.assert(
      fc.property(draft, draft, sha256Like, (a, b, prev) => {
        const bodyA = canonicalJson(canonicalEventBody({ ...sealDraft(a), seq: 0 }));
        const bodyB = canonicalJson(canonicalEventBody({ ...sealDraft(b), seq: 0 }));
        const hashA = computeEventHash({ ...sealDraft(a), seq: 0 }, prev);
        const hashB = computeEventHash({ ...sealDraft(b), seq: 0 }, prev);
        return bodyA === bodyB ? hashA === hashB : hashA !== hashB;
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });

  it("depends on prev_hash, so an event cannot be lifted to another position", () => {
    fc.assert(
      fc.property(draft, sha256Like, sha256Like, (one, prevA, prevB) => {
        const content = { ...sealDraft(one), seq: 0 };
        return (
          prevA === prevB ||
          computeEventHash(content, prevA) !== computeEventHash(content, prevB)
        );
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });

  it("depends on seq, so two events cannot be transposed", () => {
    fc.assert(
      fc.property(draft, sha256Like, fc.nat({ max: 500 }), (one, prev, seq) => {
        const sealed = sealDraft(one);
        return (
          seq === 0 ||
          computeEventHash({ ...sealed, seq: 0 }, prev) !==
            computeEventHash({ ...sealed, seq }, prev)
        );
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });
});

describe("the hashed body is §16's projection, for every event", () => {
  it("carries exactly the nine named fields and none of the five excluded ones", () => {
    fc.assert(
      fc.property(draft, fc.nat({ max: 1000 }), (one, seq) => {
        const body = canonicalEventBody({ ...sealDraft(one), seq }) as Record<
          string,
          unknown
        >;
        expect(Object.keys(body).sort()).toEqual([
          "actor",
          "certificate",
          "decision_id",
          "evidence_ids",
          "inputs_hash",
          "journal_lines",
          "kind",
          "seq",
          "subject_ids",
        ]);
        for (const excluded of ["evt_id", "run_id", "ts", "prev_hash", "hash"]) {
          expect(body).not.toHaveProperty(excluded);
        }
        return true;
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });

  it("is always canonically serializable", () => {
    fc.assert(
      fc.property(draft, (one) => {
        const encoded = canonicalJson(canonicalEventBody({ ...sealDraft(one), seq: 0 }));
        expect(JSON.parse(encoded)).toBeTypeOf("object");
        return true;
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });
});

describe("a chain is gapless, linked and balanced by construction", () => {
  it("numbers events 0..n-1 with no gap and no repeat", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        const chain = build(drafts);
        expect(chain.events.map((event) => event.seq)).toEqual(
          drafts.map((_, index) => index),
        );
        return true;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("links every event to its predecessor, and the first to genesis", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        const chain = build(drafts);
        let previous = GENESIS;
        for (const event of chain.events) {
          expect(event.prev_hash).toBe(previous);
          previous = event.hash;
        }
        expect(chain.root_hash).toBe(previous);
        return true;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("keeps Σ dr equal to Σ cr at every point in the log (I1)", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        const chain = build(drafts);
        let dr = 0;
        let cr = 0;
        for (const event of chain.events) {
          const totals = journalTotals(event.journal_lines);
          dr += totals.dr;
          cr += totals.cr;
          expect(dr).toBe(cr);
        }
        expect(chain.total_dr_paise).toBe(dr);
        expect(chain.total_cr_paise).toBe(cr);
        return true;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("refuses any event whose own lines do not balance", () => {
    fc.assert(
      fc.property(
        draft,
        fc.constantFrom(...ACCOUNT_CODES),
        amount,
        fc.boolean(),
        (one, account, value, debit) => {
          const unbalanced: JournalLine = {
            account,
            dr_paise: (debit ? value : 0) as Paise,
            cr_paise: (debit ? 0 : value) as Paise,
            memo_ref: "unbalanced",
          };
          expect(() =>
            appendEvent(
              createChain(GENESIS, one.run_id),
              { ...one, journal_lines: [unbalanced] },
            ),
          ).toThrow(TrialBalanceError);
          return true;
        },
      ),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("verifies against its own root, for every chain", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        const chain = build(drafts);
        const result = verifyChain(GENESIS, chain.events, chain.root_hash);
        expect(result.failures).toEqual([]);
        return result.ok;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("survives a round trip through JSON, which is how it is stored", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        const chain = build(drafts);
        const restored: unknown = JSON.parse(JSON.stringify(chain.events));
        return verifyChain(GENESIS, asEvents(restored as unknown[]), chain.root_hash).ok;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });
});

describe("any change to hashed content is detected", () => {
  /** Single-field edits to a stored record, all of them inside the body. */
  const MUTATIONS: readonly ((record: Record<string, unknown>) => void)[] = [
    (record) => {
      record["seq"] = (record["seq"] as number) + 1;
    },
    (record) => {
      record["kind"] = record["kind"] === "INGEST" ? "CLOSE" : "INGEST";
    },
    (record) => {
      record["inputs_hash"] = digest(999_999);
    },
    (record) => {
      record["decision_id"] = record["decision_id"] === null ? "dec_x" : null;
    },
    (record) => {
      (record["subject_ids"] as string[]).push("obs_smuggled");
    },
    (record) => {
      (record["evidence_ids"] as string[]).push("ev_smuggled");
    },
    (record) => {
      (record["actor"] as Record<string, unknown>)["component"] = "manual.override";
    },
    (record) => {
      record["prev_hash"] = digest(888_888);
    },
    (record) => {
      record["hash"] = digest(777_777);
    },
  ];

  it("fails verification after any single edit to a hashed field", () => {
    fc.assert(
      fc.property(
        draftSequence,
        fc.nat(),
        fc.nat(),
        (drafts, indexSeed, mutationSeed) => {
          const chain = build(drafts);
          const records = storedCopy(chain.events);
          const index = indexSeed % records.length;
          const mutate = MUTATIONS[mutationSeed % MUTATIONS.length];
          const target = records[index];
          if (mutate === undefined || target === undefined) return true;
          mutate(target);
          return !verifyChain(GENESIS, asEvents(records), chain.root_hash).ok;
        },
      ),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("fails verification when any event is dropped", () => {
    fc.assert(
      fc.property(draftSequence, fc.nat(), (drafts, indexSeed) => {
        const chain = build(drafts);
        const records = storedCopy(chain.events);
        records.splice(indexSeed % records.length, 1);
        return !verifyChain(GENESIS, asEvents(records), chain.root_hash).ok;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("fails verification against any other genesis", () => {
    fc.assert(
      fc.property(draftSequence, fc.nat({ max: 5_000 }), (drafts, seed) => {
        const chain = build(drafts);
        const other = computeGenesisHash({
          ...GENESIS_INPUTS,
          dataset_hash: digest(seed + 2_000_000),
        });
        return !verifyChain(other, chain.events, chain.root_hash).ok;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });
});

describe("nothing that entered the chain can be changed afterwards", () => {
  it("deep-freezes every event and every structure inside it", () => {
    fc.assert(
      fc.property(draftSequence, (drafts) => {
        for (const event of build(drafts).events) {
          expect(Object.isFrozen(event)).toBe(true);
          expect(Object.isFrozen(event.actor)).toBe(true);
          expect(Object.isFrozen(event.subject_ids)).toBe(true);
          expect(Object.isFrozen(event.evidence_ids)).toBe(true);
          expect(Object.isFrozen(event.journal_lines)).toBe(true);
          for (const journalLine of event.journal_lines) {
            expect(Object.isFrozen(journalLine)).toBe(true);
          }
          if (event.certificate !== null) {
            expect(Object.isFrozen(event.certificate)).toBe(true);
            expect(Object.isFrozen(event.certificate.solution_a)).toBe(true);
            expect(Object.isFrozen(event.certificate.solution_b)).toBe(true);
          }
        }
        return true;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("leaves the chain it extended byte-identical", () => {
    fc.assert(
      fc.property(draftSequence, draft, (drafts, extra) => {
        const chain = build(drafts);
        const before = JSON.stringify(chain);
        const runId = chain.run_id;
        appendEvent(chain, {
          ...extra,
          run_id: runId,
          evt_id: "evt_extra" as LedgerEventDraft["evt_id"],
        });
        return JSON.stringify(chain) === before;
      }),
      { numRuns: CHAIN_RUNS, seed: SEED },
    );
  });

  it("keeps a sealed record independent of the draft it came from", () => {
    fc.assert(
      fc.property(draft, (one) => {
        const mutable = structuredClone(one) as unknown as Record<string, unknown>;
        const sealed = sealDraft(mutable as unknown as LedgerEventDraft);
        const encoded = JSON.stringify(sealed);

        mutable["kind"] = "CLOSE";
        (mutable["subject_ids"] as string[]).push("obs_late");
        (mutable["actor"] as Record<string, unknown>)["component"] = "changed";

        return JSON.stringify(sealed) === encoded;
      }),
      { numRuns: CHEAP_RUNS, seed: SEED },
    );
  });
});
