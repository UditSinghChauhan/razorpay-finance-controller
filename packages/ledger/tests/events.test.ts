import { describe, expect, it } from "vitest";

import { ACCOUNT_CODES, CONSTRAINT_IDS, ID_PREFIXES } from "@assay/domain";
import type { Paise } from "@assay/money";

import {
  ACTOR_TYPES,
  CERTIFICATE_REASONS,
  EVENT_KINDS,
  LLM_PROVIDER_IDS,
  LedgerEventError,
  journalTotals,
  sealDraft,
  sealStoredEvent,
  type LedgerEventDraft,
} from "@assay/ledger";

import {
  digest,
  id,
  line,
  makeActor,
  makeCertificate,
  makeDraft,
  makeNonPostingDraft,
  p5Lines,
} from "./fixtures.js";

/** Build a draft with one field replaced by a value the type system forbids. */
function withField(field: string, value: unknown): LedgerEventDraft {
  const draft = makeDraft() as unknown as Record<string, unknown>;
  return { ...draft, [field]: value } as unknown as LedgerEventDraft;
}

/**
 * Tokens carrying a code point a reference must not contain.
 *
 * Built from character codes rather than written literally, the same
 * construction `@assay/domain` uses, so that no control or bidirectional
 * character appears in this source file.
 */
const HOSTILE_TOKENS = [
  0x09, // tab
  0x0a, // newline
  0x0d, // carriage return
  0x00, // NUL
  0x1b, // ESC
  0x7f, // DEL
  0x200b, // zero-width space
  0x202e, // right-to-left override
  0x2028, // line separator
  0xfeff, // BOM
].map((code) => `a${String.fromCodePoint(code)}b`);

describe("the record transcribes DATA_MODEL.md §16", () => {
  it("admits a well-formed draft", () => {
    const sealed = sealDraft(makeDraft());
    expect(sealed.kind).toBe("ABSTAIN");
    expect(sealed.journal_lines).toHaveLength(2);
    expect(sealed.certificate?.reason).toBe("EVIDENCE_TIE");
  });

  it("admits a non-posting event with no journal lines", () => {
    // §16: journal_lines "may be empty for non-posting events".
    const sealed = sealDraft(makeNonPostingDraft());
    expect(sealed.journal_lines).toHaveLength(0);
    expect(sealed.certificate).toBeNull();
    expect(sealed.decision_id).toBeNull();
  });

  it("declares the nine event kinds of §16, in order", () => {
    expect([...EVENT_KINDS]).toEqual([
      "INGEST",
      "ANCHOR",
      "CANDIDATE",
      "PROBE",
      "RECONCILE",
      "ABSTAIN",
      "EXCEPTION",
      "RESOLVE",
      "CLOSE",
    ]);
  });

  it("declares the three actor types and four providers of §16 and §19", () => {
    expect([...ACTOR_TYPES]).toEqual(["deterministic", "llm", "human"]);
    expect([...LLM_PROVIDER_IDS]).toEqual([
      "offline",
      "replay",
      "anthropic",
      "openai-compatible",
    ]);
  });

  it("declares the three certificate reasons of §13", () => {
    expect([...CERTIFICATE_REASONS]).toEqual([
      "EVIDENCE_TIE",
      "SEARCH_BOUND_EXCEEDED",
      "PROBE_BUDGET_EXHAUSTED",
    ]);
  });

  it("uses the identifier prefixes @assay/domain registers, not its own", () => {
    // §0 rule 3's stated purpose is that "a Razorpay ID can never be confused
    // with an ASSAY ID", which only holds against one registry.
    for (const prefix of ["evt_", "dec_", "cand_", "comp_"]) {
      expect(ID_PREFIXES.assay).toContain(prefix);
    }
  });
});

describe("the record is strict", () => {
  it("rejects a field the specification does not name", () => {
    const draft = { ...makeDraft(), sneaked: 1 } as unknown as LedgerEventDraft;
    expect(() => sealDraft(draft)).toThrow(LedgerEventError);
    expect(() => sealDraft(draft)).toThrow(/\$\.sneaked/);
  });

  it("rejects an unnamed field nested inside actor", () => {
    const draft = withField("actor", { ...makeActor(), shadow: "x" });
    expect(() => sealDraft(draft)).toThrow(/\$\.actor\.shadow/);
  });

  it("rejects an unnamed field nested inside the certificate", () => {
    const draft = withField("certificate", { ...makeCertificate(), confidence: 62 });
    expect(() => sealDraft(draft)).toThrow(/\$\.certificate\.confidence/);
  });

  it("rejects a draft that supplies its own seq, prev_hash or hash", () => {
    // Those three belong to the chain. A caller that names them is choosing a
    // position, which is exactly what append-only ordering must deny.
    for (const field of ["seq", "prev_hash", "hash"]) {
      expect(() => sealDraft(withField(field, 0))).toThrow(
        new RegExp(`\\$\\.${field}`),
      );
    }
  });

  it("rejects undefined rather than reading it as null", () => {
    expect(() => sealDraft(withField("decision_id", undefined))).toThrow(/undefined/);
    expect(() => sealDraft(withField("certificate", undefined))).toThrow(/undefined/);
  });

  it("names the field when rejecting an object with a null prototype", () => {
    // Regression. `describe()` used to read `value.constructor.name`, which is
    // undefined on a null-prototype object, so the seal threw a bare TypeError
    // carrying no path. It was invisible in this suite because
    // LedgerEventError extends TypeError and every `toThrow(TypeError)` passed
    // either way — hence the assertions on the class and the path here.
    for (const [field, path] of [
      ["evt_id", "$.evt_id"],
      ["run_id", "$.run_id"],
      ["inputs_hash", "$.inputs_hash"],
    ]) {
      const thrown = (): unknown => sealDraft(withField(field ?? "", Object.create(null)));
      expect(thrown).toThrow(LedgerEventError);
      expect(thrown).toThrow(path ?? "");
    }
    expect(() => sealDraft(withField("subject_ids", [Object.create(null)]))).toThrow(
      LedgerEventError,
    );
  });

  it("rejects a class instance where a plain object is required", () => {
    expect(() => sealDraft(withField("certificate", new Date(0)))).toThrow(
      /plain object/,
    );
    expect(() => sealDraft(withField("actor", new Map()))).toThrow(/plain object/);
  });
});

describe("identifiers", () => {
  it("requires the §0 rule 3 prefix where the specification states one", () => {
    expect(() => sealDraft(withField("evt_id", "ev_000001A"))).toThrow(/evt_/);
    expect(() => sealDraft(withField("decision_id", "decision_1"))).toThrow(/dec_/);
    expect(() =>
      sealDraft(withField("certificate", makeCertificate({ comp_id: "c_1" as never }))),
    ).toThrow(/comp_/);
  });

  it("rejects a prefixed identifier with an empty or non-alphanumeric suffix", () => {
    expect(() => sealDraft(withField("evt_id", "evt_"))).toThrow(LedgerEventError);
    expect(() => sealDraft(withField("evt_id", "evt_a-b"))).toThrow(LedgerEventError);
  });

  it("accepts any opaque token where the specification states no grammar", () => {
    // §0 rule 3 says nothing about RunId, EvidenceId, LlmCallId or ProbeId.
    // Inventing a grammar for them would be a rule nobody wrote.
    expect(() => sealDraft(withField("run_id", "whatever-1"))).not.toThrow();
    expect(() => sealDraft(withField("evidence_ids", ["ev1", "E-2", "x"]))).not.toThrow();
  });

  it("rejects a token carrying control or text-spoofing code points", () => {
    // It reaches the hashed body; §0 rule 4 keeps free text off structural
    // records and §16 says memo_ref is "reference only, never free text".
    for (const value of HOSTILE_TOKENS) {
      expect(() => sealDraft(withField("run_id", value))).toThrow(LedgerEventError);
      expect(() => sealDraft(withField("subject_ids", [value]))).toThrow(
        LedgerEventError,
      );
      expect(() =>
        sealDraft(makeDraft({ journal_lines: [line("1200_BANK", 1, 0, value)] })),
      ).toThrow(LedgerEventError);
    }
  });

  it("rejects an empty token", () => {
    expect(() => sealDraft(withField("run_id", ""))).toThrow(/non-empty/);
    expect(() => sealDraft(withField("subject_ids", [""]))).toThrow(/non-empty/);
  });

  it("keeps subject_ids and evidence_ids in the caller's order", () => {
    // §16: "in the order the emitting stage produced them — that order is
    // itself deterministic". Sorting here would destroy that information.
    const subjects = ["obs_c", "obs_a", "obs_b"];
    const sealed = sealDraft(withField("subject_ids", subjects));
    expect([...sealed.subject_ids]).toEqual(subjects);
  });
});

describe("digests and timestamps", () => {
  it("requires 64 lowercase hexadecimal characters", () => {
    expect(() => sealDraft(withField("inputs_hash", digest(9).toUpperCase()))).toThrow(
      LedgerEventError,
    );
    expect(() => sealDraft(withField("inputs_hash", digest(9).slice(0, 63)))).toThrow(
      LedgerEventError,
    );
    expect(() => sealDraft(withField("inputs_hash", `${digest(9)}0`))).toThrow(
      LedgerEventError,
    );
  });

  it("requires a positive integer of Unix seconds", () => {
    // Matching @assay/domain's unixSecondsField: epoch zero is not a plausible
    // capture (DATA_MODEL.md §0 rule 2).
    for (const bad of [0, -1, 1.5, Number.NaN, "1787000000"]) {
      expect(() => sealDraft(withField("ts", bad))).toThrow(LedgerEventError);
    }
    expect(() => sealDraft(withField("ts", 1))).not.toThrow();
  });
});

describe("the actor block", () => {
  it("requires a member of each closed set", () => {
    expect(() =>
      sealDraft(withField("actor", makeActor({ type: "robot" as never }))),
    ).toThrow(LedgerEventError);
    expect(() =>
      sealDraft(withField("actor", makeActor({ llm_provider: "gemini" as never }))),
    ).toThrow(LedgerEventError);
  });

  it("forces a RECONCILE event to be deterministic, by construction", () => {
    // §16: "For any RECONCILE event, actor.type is always deterministic — by
    // construction." ARCHITECTURE.md §3 makes it this package's property rather
    // than a convention its callers must remember.
    for (const type of ["llm", "human"] as const) {
      expect(() =>
        sealDraft(makeDraft({ kind: "RECONCILE", actor: makeActor({ type }) })),
      ).toThrow(/RECONCILE/);
    }
    expect(() => sealDraft(makeDraft({ kind: "RECONCILE" }))).not.toThrow();
  });

  it("leaves every other kind free to carry any actor", () => {
    // The specification constrains RECONCILE and nothing else; inventing a
    // second rule here would be policy this package does not own.
    for (const type of ACTOR_TYPES) {
      expect(() =>
        sealDraft(makeDraft({ kind: "ABSTAIN", actor: makeActor({ type }) })),
      ).not.toThrow();
    }
  });

  it("carries full provider provenance when a model was involved", () => {
    const sealed = sealDraft(
      makeDraft({
        kind: "EXCEPTION",
        actor: makeActor({
          type: "llm",
          component: "llm.r2_classify_exception",
          llm_provider: "offline",
          model_id: "rules-v1",
          prompt_hash: digest(5),
          llm_call_id: "call-1" as never,
        }),
      }),
    );
    expect(sealed.actor.llm_provider).toBe("offline");
    expect(sealed.actor.model_id).toBe("rules-v1");
  });
});

describe("JournalLine — DATA_MODEL.md §16 and §17", () => {
  it("accepts only the seven control accounts", () => {
    for (const account of ACCOUNT_CODES) {
      expect(() =>
        sealDraft(
          makeDraft({ journal_lines: [line(account, 1, 0), line(account, 0, 1)] }),
        ),
      ).not.toThrow();
    }
    expect(() =>
      sealDraft(
        withField("journal_lines", [{ ...line("1200_BANK", 1, 0), account: "1400_X" }]),
      ),
    ).toThrow(/control accounts/);
  });

  it("requires exactly one of dr/cr to be non-zero", () => {
    expect(() =>
      sealDraft(makeDraft({ journal_lines: [line("1200_BANK", 0, 0)] })),
    ).toThrow(/exactly one/);
    expect(() =>
      sealDraft(makeDraft({ journal_lines: [line("1200_BANK", 100, 100)] })),
    ).toThrow(/exactly one/);
  });

  it("refuses floating-point money", () => {
    // §L.1 rule 1: no floating point anywhere, "including intermediates".
    for (const bad of [12.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        sealDraft(makeDraft({ journal_lines: [line("1200_BANK", bad, 0)] })),
      ).toThrow(LedgerEventError);
    }
  });

  it("refuses an amount outside the safe-integer range", () => {
    // Invariant I7 (RECONCILIATION_SPEC.md §7).
    expect(() =>
      sealDraft(
        makeDraft({
          journal_lines: [line("1200_BANK", Number.MAX_SAFE_INTEGER + 1, 0)],
        }),
      ),
    ).toThrow(LedgerEventError);
  });

  it("refuses a negative posting", () => {
    // Every posting in §17.1 / §17.2 is a magnitude, and P7 reverses by
    // swapping sides rather than by negating. A negative debit would give one
    // economic fact two spellings and therefore two hashed bodies.
    expect(() =>
      sealDraft(makeDraft({ journal_lines: [line("1200_BANK", -100, 0)] })),
    ).toThrow(/at least 0 paise/);
  });

  it("collapses a negative zero rather than admitting a second spelling of zero", () => {
    const sealed = sealDraft(makeDraft({ journal_lines: [line("1200_BANK", 100, -0)] }));
    expect(Object.is(sealed.journal_lines[0]?.cr_paise, -0)).toBe(false);
  });

  it("refuses an empty memo_ref", () => {
    expect(() =>
      sealDraft(makeDraft({ journal_lines: [line("1200_BANK", 1, 0, "")] })),
    ).toThrow(/non-empty/);
  });

  it("sums debits and credits without leaving integer arithmetic", () => {
    const totals = journalTotals(p5Lines());
    expect(totals.dr).toBe(45_231_000);
    expect(totals.cr).toBe(45_231_000);
    expect(journalTotals([])).toEqual({ dr: 0, cr: 0 });
  });
});

describe("AmbiguityCertificate — DATA_MODEL.md §13", () => {
  it("accepts only declared constraint identifiers", () => {
    expect([...CONSTRAINT_IDS]).toContain("C6");
    expect(() =>
      sealDraft(
        makeDraft({
          certificate: makeCertificate({ shared_hard_constraints: ["C9" as never] }),
        }),
      ),
    ).toThrow(LedgerEventError);
  });

  it("bounds evidence_score_gap_bps to the 0..10_000 range §13 states", () => {
    for (const bad of [-1, 10_001, 1.5]) {
      expect(() =>
        sealDraft(
          makeDraft({ certificate: makeCertificate({ evidence_score_gap_bps: bad }) }),
        ),
      ).toThrow(LedgerEventError);
    }
    expect(() =>
      sealDraft(
        makeDraft({ certificate: makeCertificate({ evidence_score_gap_bps: 10_000 }) }),
      ),
    ).not.toThrow();
  });

  it("does not assert the frozen epsilon value", () => {
    // PREREGISTRATION.md §7 freezes epsilon at seal time and §13 says the
    // certificate records "the pre-registered margin in force". Hard-coding
    // 1500 here would move a governance decision into the ledger.
    expect(() =>
      sealDraft(makeDraft({ certificate: makeCertificate({ epsilon_bps: 900 }) })),
    ).not.toThrow();
  });

  it("does not enforce gap < epsilon, which is an open governance question", () => {
    // §13 states the relation for an EVIDENCE_TIE. Whether it holds for a
    // SEARCH_BOUND_EXCEEDED certificate is unresolved, and settling it inside
    // the ledger would settle it in the wrong place.
    expect(() =>
      sealDraft(
        makeDraft({
          certificate: makeCertificate({
            reason: "SEARCH_BOUND_EXCEEDED",
            evidence_score_gap_bps: 9_000,
            epsilon_bps: 1_500,
          }),
        }),
      ),
    ).not.toThrow();
  });

  it("requires observation identifiers in both solutions", () => {
    expect(() =>
      sealDraft(
        makeDraft({
          certificate: makeCertificate({
            solution_a: {
              candidate_id: id("cand_", 1) as never,
              member_obs_ids: ["pay_ABCDEFGH123456" as never],
            },
          }),
        }),
      ),
    ).toThrow(/obs_/);
  });

  it("refuses a negative materiality or tau", () => {
    expect(() =>
      sealDraft(
        makeDraft({ certificate: makeCertificate({ materiality_paise: -1 as Paise }) }),
      ),
    ).toThrow(LedgerEventError);
    expect(() =>
      sealDraft(makeDraft({ certificate: makeCertificate({ tau_paise: -1 as Paise }) })),
    ).toThrow(LedgerEventError);
  });
});

describe("sealStoredEvent — the untrusted read-back path", () => {
  it("admits a record carrying its position", () => {
    const stored = { ...makeDraft(), seq: 0, prev_hash: digest(7), hash: digest(8) };
    const event = sealStoredEvent(stored);
    expect(event.seq).toBe(0);
    expect(event.prev_hash).toBe(digest(7));
  });

  it("rejects a sequence number that never came from a chain", () => {
    for (const bad of [-1, 1.5, "0"]) {
      expect(() =>
        sealStoredEvent({
          ...makeDraft(),
          seq: bad,
          prev_hash: digest(7),
          hash: digest(8),
        }),
      ).toThrow(LedgerEventError);
    }
  });

  it("rejects a record missing its position", () => {
    expect(() => sealStoredEvent(makeDraft())).toThrow(LedgerEventError);
  });

  it("rejects a non-object", () => {
    for (const bad of [null, 1, "x", [], undefined]) {
      expect(() => sealStoredEvent(bad)).toThrow(LedgerEventError);
    }
  });
});
