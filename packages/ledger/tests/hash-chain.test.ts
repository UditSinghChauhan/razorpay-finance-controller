import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJson, type Sha256 } from "@assay/domain";

import {
  ChainMismatchError,
  TrialBalanceError,
  appendEvent,
  canonicalEventBody,
  computeEventHash,
  computeGenesisHash,
  createChain,
  hashCanonical,
  sealDraft,
  verifyChain,
  type LedgerChain,
  type LedgerEventDraft,
  type RunId,
} from "@assay/ledger";

import {
  GENESIS_INPUTS,
  RUN_ID,
  digest,
  id,
  line,
  makeDraft,
  makeNonPostingDraft,
  p5Lines,
} from "./fixtures.js";

/**
 * An independent implementation of `§16`'s formula, written from the
 * specification rather than from `hash-chain.ts`, so that these assertions test
 * the rule and not the code that implements it.
 */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

function chainOf(drafts: readonly LedgerEventDraft[]): LedgerChain {
  return drafts.reduce(
    (chain, draft) => appendEvent(chain, draft),
    createChain(GENESIS, RUN_ID),
  );
}

/** Five events: an ingest, an anchor, a reconcile, an abstention and a close. */
function fiveEventChain(): LedgerChain {
  return chainOf([
    makeNonPostingDraft({ evt_id: id("evt_", 1) as never, kind: "INGEST" }),
    makeNonPostingDraft({ evt_id: id("evt_", 2) as never, kind: "ANCHOR" }),
    makeDraft({
      evt_id: id("evt_", 3) as never,
      kind: "RECONCILE",
      certificate: null,
      journal_lines: [
        line("1200_BANK", 9_800_000, 0, "P2.bank"),
        line("5100_PG_FEE_EXPENSE", 169_492, 0, "P2.fee"),
        line("1300_GST_INPUT_CREDIT", 30_508, 0, "P2.gst"),
        line("1100_GATEWAY_RECEIVABLE", 0, 10_000_000, "P2.recv"),
      ],
    }),
    makeDraft({ evt_id: id("evt_", 4) as never, kind: "ABSTAIN" }),
    makeNonPostingDraft({ evt_id: id("evt_", 5) as never, kind: "CLOSE" }),
  ]);
}

describe("genesis — DATA_MODEL.md §16", () => {
  it("is sha256 over the canonical JSON of exactly three inputs", () => {
    const expected = sha256(
      canonicalJson({
        config_hash: GENESIS_INPUTS.config_hash,
        dataset_hash: GENESIS_INPUTS.dataset_hash,
        engine_commit: GENESIS_INPUTS.engine_commit,
      }),
    );
    expect(GENESIS).toBe(expected);
  });

  it("does not depend on the order the caller built the object in", () => {
    const reversed = computeGenesisHash({
      config_hash: GENESIS_INPUTS.config_hash,
      engine_commit: GENESIS_INPUTS.engine_commit,
      dataset_hash: GENESIS_INPUTS.dataset_hash,
    });
    expect(reversed).toBe(GENESIS);
  });

  it("changes when any one of the three inputs changes", () => {
    const seen = new Set([
      GENESIS,
      computeGenesisHash({ ...GENESIS_INPUTS, dataset_hash: digest(99) }),
      computeGenesisHash({ ...GENESIS_INPUTS, config_hash: digest(98) }),
      computeGenesisHash({ ...GENESIS_INPUTS, engine_commit: "deadbeef" }),
    ]);
    expect(seen.size).toBe(4);
  });

  it("refuses to readmit run_id or started_at", () => {
    // Spec 1.2.0 removed both: "including them made two runs over identical
    // inputs produce different root hashes by construction and made metric 23
    // unsatisfiable".
    const widened = { ...GENESIS_INPUTS, run_id: RUN_ID, started_at: 1 };
    expect(() => computeGenesisHash(widened as never)).toThrow(ChainMismatchError);
    expect(() => computeGenesisHash(widened as never)).toThrow(/run_id/);
  });

  it("rejects a malformed input rather than hashing it", () => {
    expect(() =>
      computeGenesisHash({ ...GENESIS_INPUTS, dataset_hash: "nope" as Sha256 }),
    ).toThrow();
    expect(() =>
      computeGenesisHash({ ...GENESIS_INPUTS, engine_commit: "" }),
    ).toThrow();
  });
});

describe("the hashed body — DATA_MODEL.md §16", () => {
  const content = { ...sealDraft(makeDraft()), seq: 0 };
  const body = canonicalEventBody(content) as Record<string, unknown>;

  it("projects exactly the nine fields the specification names", () => {
    expect(Object.keys(body).sort()).toEqual(
      [
        "seq",
        "kind",
        "actor",
        "subject_ids",
        "evidence_ids",
        "decision_id",
        "inputs_hash",
        "journal_lines",
        "certificate",
      ].sort(),
    );
  });

  it("excludes evt_id, run_id, prev_hash, hash and ts", () => {
    for (const excluded of ["evt_id", "run_id", "prev_hash", "hash", "ts"]) {
      expect(body).not.toHaveProperty(excluded);
    }
  });

  it("includes the actor block in full", () => {
    // §16: "`actor` is included in full — it contains no wall-clock field, so
    // no exclusion is needed there."
    expect(Object.keys(body["actor"] as object).sort()).toEqual(
      [
        "type",
        "component",
        "engine_commit",
        "llm_provider",
        "model_id",
        "prompt_hash",
        "llm_call_id",
      ].sort(),
    );
  });

  it("is serializable as canonical JSON", () => {
    expect(() => canonicalJson(body)).not.toThrow();
    expect(canonicalJson(body)).not.toMatch(/\s/);
  });
});

describe("the event hash — DATA_MODEL.md §16", () => {
  it("is sha256(canonical_json(body) ‖ prev_hash)", () => {
    const content = { ...sealDraft(makeDraft()), seq: 0 };
    const prev = digest(42);
    const expected = sha256(canonicalJson(canonicalEventBody(content)) + prev);
    expect(computeEventHash(content, prev)).toBe(expected);
  });

  it("changes when any hashed field changes", () => {
    const base = { ...sealDraft(makeDraft()), seq: 0 };
    const prev = digest(42);
    const variants = [
      { ...base, seq: 1 },
      { ...sealDraft(makeDraft({ kind: "EXCEPTION" })), seq: 0 },
      { ...sealDraft(makeDraft({ subject_ids: ["obs_z"] })), seq: 0 },
      { ...sealDraft(makeDraft({ inputs_hash: digest(77) })), seq: 0 },
      { ...sealDraft(makeDraft({ journal_lines: p5Lines(1) })), seq: 0 },
      { ...sealDraft(makeDraft({ certificate: null })), seq: 0 },
    ];
    const hashes = new Set([
      computeEventHash(base, prev),
      ...variants.map((v) => computeEventHash(v, prev)),
    ]);
    expect(hashes.size).toBe(variants.length + 1);
  });

  it("does not change when an excluded field changes", () => {
    const prev = digest(42);
    const base = { ...sealDraft(makeDraft()), seq: 0 };
    const relabelled = {
      ...sealDraft(
        makeDraft({
          evt_id: id("evt_", 999) as never,
          run_id: "another-run" as RunId,
          ts: 1_999_999_999 as never,
        }),
      ),
      seq: 0,
    };
    expect(computeEventHash(relabelled, prev)).toBe(computeEventHash(base, prev));
  });

  it("reorders nothing: subject order is semantic and changes the digest", () => {
    const prev = digest(42);
    const forward = { ...sealDraft(makeDraft({ subject_ids: ["obs_a", "obs_b"] })), seq: 0 };
    const reversed = { ...sealDraft(makeDraft({ subject_ids: ["obs_b", "obs_a"] })), seq: 0 };
    expect(computeEventHash(forward, prev)).not.toBe(computeEventHash(reversed, prev));
  });

  it("separates the body from prev_hash unambiguously", () => {
    // A canonical body always ends in `}` and prev_hash is always 64
    // characters, so the split point is recoverable and no two distinct pairs
    // can concatenate to the same string.
    const content = { ...sealDraft(makeDraft()), seq: 0 };
    const encoded = canonicalJson(canonicalEventBody(content));
    expect(encoded.endsWith("}")).toBe(true);
    expect(digest(1)).toHaveLength(64);
  });
});

describe("hashCanonical", () => {
  it("is sha256 over canonical JSON", () => {
    expect(hashCanonical({ b: 2, a: 1 })).toBe(sha256('{"a":1,"b":2}'));
  });

  it("does not depend on key insertion order", () => {
    expect(hashCanonical({ a: 1, b: 2 })).toBe(hashCanonical({ b: 2, a: 1 }));
  });

  it("refuses a value that cannot be hashed reproducibly", () => {
    expect(() => hashCanonical(1.5)).toThrow(TypeError);
  });
});

describe("the chain", () => {
  it("starts empty, rooted at genesis", () => {
    const chain = createChain(GENESIS, RUN_ID);
    expect(chain.events).toHaveLength(0);
    expect(chain.root_hash).toBe(GENESIS);
    expect(chain.genesis_hash).toBe(GENESIS);
    expect(chain.total_dr_paise).toBe(0);
    expect(chain.total_cr_paise).toBe(0);
  });

  it("numbers events gaplessly from zero", () => {
    const chain = fiveEventChain();
    expect(chain.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it("links seq 0 to genesis and every later event to its predecessor", () => {
    const chain = fiveEventChain();
    expect(chain.events[0]?.prev_hash).toBe(GENESIS);
    for (let i = 1; i < chain.events.length; i += 1) {
      expect(chain.events[i]?.prev_hash).toBe(chain.events[i - 1]?.hash);
    }
    expect(chain.root_hash).toBe(chain.events.at(-1)?.hash);
  });

  it("refuses an event belonging to another run", () => {
    const chain = createChain(GENESIS, RUN_ID);
    expect(() =>
      appendEvent(chain, makeDraft({ run_id: "some-other-run" as RunId })),
    ).toThrow(ChainMismatchError);
  });

  it("rejects a malformed draft without extending the chain", () => {
    const chain = fiveEventChain();
    expect(() =>
      appendEvent(chain, makeDraft({ evt_id: "nope" as never })),
    ).toThrow();
    expect(chain.events).toHaveLength(5);
  });
});

describe("invariant I1 is a property of this package", () => {
  it("refuses an event whose lines do not balance", () => {
    const chain = createChain(GENESIS, RUN_ID);
    expect(() =>
      appendEvent(chain, makeDraft({ journal_lines: [line("1200_BANK", 100, 0)] })),
    ).toThrow(TrialBalanceError);
  });

  it("names the sequence number and both totals", () => {
    const chain = createChain(GENESIS, RUN_ID);
    try {
      appendEvent(chain, makeDraft({ journal_lines: [line("1200_BANK", 100, 0)] }));
      expect.unreachable("expected a TrialBalanceError");
    } catch (error) {
      expect(error).toBeInstanceOf(TrialBalanceError);
      const failure = error as TrialBalanceError;
      expect(failure.seq).toBe(0);
      expect(failure.total_dr_paise).toBe(100);
      expect(failure.total_cr_paise).toBe(0);
    }
  });

  it("leaves the chain unchanged when it rejects", () => {
    const chain = fiveEventChain();
    const before = chain.root_hash;
    expect(() =>
      appendEvent(chain, makeDraft({ journal_lines: [line("1200_BANK", 1, 0)] })),
    ).toThrow(TrialBalanceError);
    expect(chain.events).toHaveLength(5);
    expect(chain.root_hash).toBe(before);
  });

  it("refuses a pair of offsetting unbalanced events", () => {
    // §17 requires the balance to hold "at every point in the event log", not
    // only at the end, so a debit event followed by a matching credit event is
    // not a legal way to post.
    const chain = createChain(GENESIS, RUN_ID);
    expect(() =>
      appendEvent(
        chain,
        makeDraft({ journal_lines: [line("1200_BANK", 500, 0)] }),
      ),
    ).toThrow(TrialBalanceError);
  });

  it("holds across a chain of balanced postings", () => {
    const chain = fiveEventChain();
    expect(chain.total_dr_paise).toBe(chain.total_cr_paise);
  });
});

describe("verifyChain — gate G4 and GET /runs/:id/ledger/verify", () => {
  it("passes on a hand-built five-event chain", () => {
    const chain = fiveEventChain();
    const result = verifyChain(GENESIS, chain.events, chain.root_hash);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.event_count).toBe(5);
    expect(result.root_hash).toBe(chain.root_hash);
    expect(result.total_dr_paise).toBe(result.total_cr_paise);
  });

  it("passes on an empty chain, rooted at genesis", () => {
    const result = verifyChain(GENESIS, [], GENESIS);
    expect(result.ok).toBe(true);
    expect(result.root_hash).toBe(GENESIS);
  });

  it("fails when the recomputed root does not match the published one", () => {
    const chain = fiveEventChain();
    const result = verifyChain(GENESIS, chain.events, digest(123));
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toContain("ROOT_HASH");
  });

  it("fails when the chain is verified against a different genesis", () => {
    // The whole point of binding genesis to (dataset_hash, engine_commit,
    // config_hash) is that "a report cannot be attached to a different dataset
    // after the fact".
    const chain = fiveEventChain();
    const otherGenesis = computeGenesisHash({
      ...GENESIS_INPUTS,
      dataset_hash: digest(500),
    });
    const result = verifyChain(otherGenesis, chain.events);
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.check).toBe("PREV_HASH");
    expect(result.failures[0]?.seq).toBe(0);
  });

  it("reports rather than throws, so an analyst learns which check failed", () => {
    const chain = fiveEventChain();
    expect(() => verifyChain(GENESIS, chain.events, digest(1))).not.toThrow();
  });
});

describe("determinism — metric 23 and invariant I9", () => {
  it("gives two runs over identical inputs an identical root hash", () => {
    // The whole reason evt_id, run_id and ts are outside the body. Both chains
    // below carry different handles and different clock readings, and they must
    // still agree byte for byte.
    const drafts = (run: RunId, offset: number): readonly LedgerEventDraft[] => [
      makeNonPostingDraft({
        evt_id: id("evt_", 100 + offset) as never,
        run_id: run,
        ts: (1_787_000_000 + offset) as never,
        kind: "INGEST",
      }),
      makeDraft({
        evt_id: id("evt_", 200 + offset) as never,
        run_id: run,
        ts: (1_787_000_500 + offset) as never,
      }),
    ];

    const runA = "run_A" as RunId;
    const runB = "run_B" as RunId;
    const chainA = drafts(runA, 0).reduce(
      (chain, draft) => appendEvent(chain, draft),
      createChain(GENESIS, runA),
    );
    const chainB = drafts(runB, 7).reduce(
      (chain, draft) => appendEvent(chain, draft),
      createChain(GENESIS, runB),
    );

    expect(chainB.root_hash).toBe(chainA.root_hash);
    expect(chainB.events.map((e) => e.hash)).toEqual(chainA.events.map((e) => e.hash));
  });

  it("gives two runs over different datasets different root hashes", () => {
    const otherGenesis = computeGenesisHash({
      ...GENESIS_INPUTS,
      dataset_hash: digest(321),
    });
    const build = (genesis: Sha256): LedgerChain =>
      appendEvent(createChain(genesis, RUN_ID), makeDraft());
    expect(build(otherGenesis).root_hash).not.toBe(build(GENESIS).root_hash);
  });

  it("reads no clock and draws no randomness", () => {
    // Building the same chain twice in the same process must agree exactly.
    expect(fiveEventChain().root_hash).toBe(fiveEventChain().root_hash);
  });
});
