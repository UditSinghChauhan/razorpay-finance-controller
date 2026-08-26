import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ChainMismatchError,
  appendEvent,
  computeGenesisHash,
  createChain,
  verifyChain,
  type ChainCheck,
  type ChainVerification,
  type LedgerChain,
  type LedgerEventDraft,
} from "@assay/ledger";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  PAYMENT_ID,
  RUN_ID,
  SETTLEMENT_ID,
  asEvents,
  digest,
  id,
  line,
  makeDraft,
  makeNonPostingDraft,
  storedCopy,
} from "./fixtures.js";

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

function chainOf(drafts: readonly LedgerEventDraft[]): LedgerChain {
  return drafts.reduce(
    (chain, draft) => appendEvent(chain, draft),
    createChain(GENESIS, RUN_ID),
  );
}

function goodChain(): LedgerChain {
  return chainOf([
    makeNonPostingDraft({ evt_id: id("evt_", 1) as never, kind: "INGEST" }),
    makeDraft({ evt_id: id("evt_", 2) as never, kind: "ABSTAIN" }),
    makeDraft({
      evt_id: id("evt_", 3) as never,
      kind: "RECONCILE",
      certificate: null,
      journal_lines: [
        line("1200_BANK", 500_000, 0, "P2.bank", PAYMENT_ID),
        line("1100_GATEWAY_RECEIVABLE", 0, 500_000, "P2.recv", PAYMENT_ID),
      ],
    }),
  ]);
}

/**
 * Run one tamper: take a good chain, edit its stored form, re-verify.
 *
 * Editing a `storedCopy` rather than the chain is what an attacker with write
 * access to `assay.sqlite` actually does (`THREAT_MODEL.md §T10`) — the
 * in-memory chain is frozen, which `immutability.test.ts` covers separately.
 */
function tampered(edit: (records: Record<string, unknown>[]) => void): {
  readonly checks: readonly ChainCheck[];
  readonly ok: boolean;
} {
  const chain = goodChain();
  const records = storedCopy(chain.events);
  edit(records);
  const result = verifyChain(GENESIS, asEvents(records), chain.root_hash);
  return { checks: result.failures.map((failure) => failure.check), ok: result.ok };
}

describe("the unmodified chain verifies", () => {
  it("passes every check", () => {
    const chain = goodChain();
    const records = storedCopy(chain.events);
    expect(verifyChain(GENESIS, asEvents(records), chain.root_hash).ok).toBe(true);
  });

  it("still passes when the stored keys are written in a different order", () => {
    // Canonical JSON sorts keys, so key order in storage carries no meaning and
    // cannot carry a payload either (DATA_MODEL.md §0 rule 5).
    const chain = goodChain();
    const reordered = storedCopy(chain.events).map((record) => {
      const rebuilt: Record<string, unknown> = {};
      for (const key of Object.keys(record).reverse()) rebuilt[key] = record[key];
      return rebuilt;
    });
    expect(verifyChain(GENESIS, asEvents(reordered), chain.root_hash).ok).toBe(true);
  });
});

describe("altering the record of what happened", () => {
  it("detects an altered sequence number", () => {
    const { ok, checks } = tampered((records) => {
      records[1]!["seq"] = 7;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("SEQUENCE");
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects two events claiming the same sequence number", () => {
    const { ok, checks } = tampered((records) => {
      records[2]!["seq"] = 1;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("SEQUENCE");
  });

  it("detects a re-pointed prev_hash", () => {
    const { ok, checks } = tampered((records) => {
      records[2]!["prev_hash"] = records[0]!["hash"];
    });
    expect(ok).toBe(false);
    expect(checks).toContain("PREV_HASH");
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects an altered inputs_hash", () => {
    const { ok, checks } = tampered((records) => {
      records[1]!["inputs_hash"] = digest(4_242);
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects a single altered journal amount", () => {
    const { ok, checks } = tampered((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["dr_paise"] = 400_000;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
    expect(checks).toContain("TRIAL_BALANCE");
  });

  it("detects an edit that keeps the books balanced", () => {
    // The interesting case: double-entry alone would report nothing, because
    // both legs were moved by the same amount. This is why Layer A exists
    // alongside Layer B (ARCHITECTURE.md §8).
    const { ok, checks } = tampered((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["dr_paise"] = 400_000;
      lines[1]!["cr_paise"] = 400_000;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
    expect(checks).not.toContain("TRIAL_BALANCE");
  });

  it("detects an altered journal account", () => {
    const { ok, checks } = tampered((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["account"] = "4000_REVENUE";
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects an altered actor, so provenance cannot be rewritten", () => {
    const { ok, checks } = tampered((records) => {
      const actor = records[1]!["actor"] as Record<string, unknown>;
      actor["type"] = "human";
      actor["component"] = "manual.override";
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects an altered certificate", () => {
    const { ok, checks } = tampered((records) => {
      const certificate = records[1]!["certificate"] as Record<string, unknown>;
      certificate["materiality_paise"] = 1;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects an altered source_entity_id, leaving the books balanced", () => {
    // The `T8` shape, at the level of one line. Re-keying a posting moves it
    // from one Suspense item to another: `Σ dr` and `Σ cr` are untouched, every
    // account balance is untouched, and `G3`'s partition — "the set of
    // `9000_SUSPENSE` journal lines sharing one `JournalLine.source_entity_id`"
    // (`RECONCILIATION_SPEC.md §10.1`) — is different. Double-entry cannot see
    // it; the chain can, because the field is inside the hashed body.
    const { ok, checks } = tampered((records) => {
      const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
      for (const journalLine of lines) journalLine["source_entity_id"] = SETTLEMENT_ID;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
    expect(checks).not.toContain("TRIAL_BALANCE");
  });

  it("detects a re-keyed counter-leg, which would split one item in two", () => {
    // §16 requires the key "on every journal line, including the counter-leg,
    // so that an item can be read whole". Re-keying one leg of a balanced pair
    // leaves two half-items whose net figures are equal and opposite.
    const { ok, checks } = tampered((records) => {
      const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
      lines[1]!["source_entity_id"] = SETTLEMENT_ID;
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects a reordered subject list", () => {
    const { ok, checks } = tampered((records) => {
      const subjects = records[1]!["subject_ids"] as string[];
      subjects.reverse();
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_HASH");
  });

  it("detects a deleted event", () => {
    const { ok, checks } = tampered((records) => {
      records.splice(1, 1);
    });
    expect(ok).toBe(false);
    expect(checks).toContain("SEQUENCE");
    expect(checks).toContain("PREV_HASH");
  });

  it("detects a truncated chain even when what remains is internally consistent", () => {
    const chain = goodChain();
    const records = storedCopy(chain.events);
    records.pop();
    const result = verifyChain(GENESIS, asEvents(records), chain.root_hash);
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.check)).toEqual(["ROOT_HASH"]);
  });

  it("detects an inserted event", () => {
    const { ok } = tampered((records) => {
      records.splice(1, 0, structuredClone(records[1]!));
    });
    expect(ok).toBe(false);
  });

  it("detects a replayed event", () => {
    const { ok, checks } = tampered((records) => {
      records.push(structuredClone(records[1]!));
    });
    expect(ok).toBe(false);
    expect(checks).toContain("EVENT_ID_UNIQUE");
  });

  it("detects an event smuggled in from another run", () => {
    const { ok, checks } = tampered((records) => {
      records[1]!["run_id"] = "run_other";
    });
    expect(ok).toBe(false);
    expect(checks).toContain("RUN_ID");
  });

  it("does NOT detect an altered timestamp — the declared residual", () => {
    // THREAT_MODEL.md §T10, stated as a residual rather than mitigated: "ts is
    // outside the hashed body, so altering an event's timestamp is not
    // chain-detectable." This test exists so the limitation is visible in the
    // suite rather than only in prose, and so it fails loudly if `ts` is ever
    // quietly moved into the body — which would break metric 23.
    const { ok } = tampered((records) => {
      records[1]!["ts"] = 1_999_999_999;
    });
    expect(ok).toBe(true);
  });
});

describe("a record that cannot be hashed is refused, not hashed", () => {
  const structural = (edit: (records: Record<string, unknown>[]) => void): void => {
    const { ok, checks } = tampered(edit);
    expect(ok).toBe(false);
    expect(checks).toContain("STRUCTURE");
  };

  it("refuses floating-point money", () => {
    structural((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["dr_paise"] = 500_000.5;
    });
  });

  it("refuses money outside the safe-integer range", () => {
    structural((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["dr_paise"] = Number.MAX_SAFE_INTEGER + 2;
    });
  });

  it("refuses a line where both legs are non-zero", () => {
    structural((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["cr_paise"] = 1;
    });
  });

  it("refuses an eighth account code", () => {
    structural((records) => {
      const lines = records[2]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["account"] = "1400_INVENTED";
    });
  });

  it("refuses a line whose source_entity_id was deleted", () => {
    // §16 makes the field "required and non-null on every journal line". A line
    // that names no obligation cannot be placed in a Suspense item, so a
    // deletion here is a record that cannot be hashed rather than one that
    // hashes to a different value.
    structural((records) => {
      const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
      delete lines[0]!["source_entity_id"];
    });
    structural((records) => {
      const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
      lines[0]!["source_entity_id"] = null;
    });
  });

  it("refuses an ASSAY-internal handle as the item key", () => {
    // §16: "a business identifier drawn from the observation set, never an
    // ASSAY-internal handle, so a reviewer holding only the run artifact can
    // verify G3". An `obs_`, `exc_` or `dec_` key would make the partition
    // readable only against ASSAY's own tables.
    for (const forged of ["obs_000001A", "exc_000001A", "dec_000001A", "evt_000001A"]) {
      structural((records) => {
        const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
        lines[0]!["source_entity_id"] = forged;
      });
    }
  });

  it("refuses a key from a kind that posts nothing", () => {
    // §17.1.1: truth's identical range "admits no `mle_…` or `disp_…`, so truth
    // posts no line attributable to either kind". A ledger that admitted one
    // would put `proj_agent ≠ proj_truth` on a correct decision.
    for (const forged of ["mle_000001A", "disp_00000000000001"]) {
      structural((records) => {
        const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
        lines[0]!["source_entity_id"] = forged;
      });
    }
  });

  it("refuses a business prefix carrying a suffix of the wrong grammar", () => {
    // §0 rule 3 gives the Razorpay families fourteen alphanumerics. A prefix
    // check alone would admit `pay_` followed by anything, which is a forged
    // identifier wearing a real prefix.
    for (const forged of ["pay_", "pay_short", `pay_${"0".repeat(15)}`, "pay_ABC-DEF00000000"]) {
      structural((records) => {
        const lines = records[1]!["journal_lines"] as Record<string, unknown>[];
        lines[0]!["source_entity_id"] = forged;
      });
    }
  });

  it("refuses a field the specification does not name", () => {
    structural((records) => {
      records[1]!["approved_by"] = "someone";
    });
  });

  it("refuses a malformed digest", () => {
    structural((records) => {
      records[1]!["hash"] = "not-a-digest";
    });
  });

  it("refuses a RECONCILE event attributed to a model", () => {
    structural((records) => {
      (records[2]!["actor"] as Record<string, unknown>)["type"] = "llm";
    });
  });
});

describe("genesis cannot be forged into agreement", () => {
  it("refuses a malformed genesis input", () => {
    expect(() =>
      computeGenesisHash({ ...GENESIS_INPUTS, dataset_hash: "0".repeat(63) as never }),
    ).toThrow();
    expect(() =>
      computeGenesisHash({ ...GENESIS_INPUTS, config_hash: "X".repeat(64) as never }),
    ).toThrow();
  });

  it("refuses a genesis carrying anything but the three bound inputs", () => {
    expect(() =>
      computeGenesisHash({ ...GENESIS_INPUTS, started_at: 1 } as never),
    ).toThrow(/started_at/);
  });

  it("refuses a chain created on a malformed genesis", () => {
    expect(() => createChain("nope" as never, RUN_ID)).toThrow();
  });

  it("fails a chain re-attached to a different dataset", () => {
    const chain = goodChain();
    const other = computeGenesisHash({ ...GENESIS_INPUTS, dataset_hash: digest(777) });
    expect(verifyChain(other, chain.events, chain.root_hash).ok).toBe(false);
  });
});

describe("the package cannot reach a later phase", () => {
  const sourceDir = fileURLToPath(new URL("../src/", import.meta.url));

  /** Only what Layer A is allowed to depend on. */
  const ALLOWED = new Set(["node:crypto", "@assay/domain", "@assay/money"]);

  it("imports nothing beyond @assay/money, @assay/domain and node:crypto", () => {
    // DECISION_BRIEF.md §L.2 fixes the build order money -> domain -> ledger,
    // so every later package is by definition not yet a legal dependency, and
    // the untrusted-text subpath is never one (§L.1 rule 3).
    const offenders: string[] = [];
    for (const file of readdirSync(sourceDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(`${sourceDir}${file}`, "utf8");
      for (const match of source.matchAll(/from\s+"([^"]+)"|import\("([^"]+)"\)/g)) {
        const specifier = match[1] ?? match[2] ?? "";
        if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
        if (!ALLOWED.has(specifier)) offenders.push(`${file}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never reaches the quarantined text store", () => {
    for (const file of readdirSync(sourceDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(`${sourceDir}${file}`, "utf8");
      expect(source).not.toMatch(/untrusted-text/);
    }
  });

  it("reads no clock and draws no randomness", () => {
    // §L.1 rule 1 and metric 23 both require two runs over identical inputs to
    // agree byte for byte; a wall-clock read or a random draw inside the chain
    // would make that unsatisfiable by construction.
    for (const file of readdirSync(sourceDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(`${sourceDir}${file}`, "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/\bnew Date\b|\bDate\.now\b/);
      expect(code).not.toMatch(/Math\.random/);
      expect(code).not.toMatch(/\bIntl\b|toLocale/);
      expect(code).not.toMatch(/randomUUID|randomBytes/);
    }
  });
});

describe("regressions", () => {
  it("reports I1 when the running totals leave the safe-integer range", () => {
    // verifyChain used to compare Σ dr and Σ cr for equality alone. Every
    // individual amount is a safe integer, but a long enough chain pushes the
    // running total past 2^53 where addition stops being exact — and two
    // totals that both lost precision still compare equal, so a chain whose
    // arithmetic had silently gone inexact was reported as balanced.
    const huge = Number.MAX_SAFE_INTEGER;
    const stored = (seq: number): Record<string, unknown> => ({
      ...makeNonPostingDraft({ evt_id: id("evt_", seq) as never }),
      seq,
      prev_hash: digest(0),
      hash: digest(1),
      journal_lines: [
        {
          account: "1200_BANK",
          dr_paise: huge,
          cr_paise: 0,
          memo_ref: "a",
          source_entity_id: BANK_LINE_ID,
        },
        {
          account: "4000_REVENUE",
          dr_paise: 0,
          cr_paise: huge,
          memo_ref: "b",
          source_entity_id: BANK_LINE_ID,
        },
      ],
    });

    const result = verifyChain(GENESIS, asEvents([stored(0), stored(1), stored(2)]));
    expect(Number.isSafeInteger(result.total_dr_paise)).toBe(false);
    expect(result.total_dr_paise).toBe(result.total_cr_paise);
    expect(result.failures.map((f) => f.check)).toContain("TRIAL_BALANCE");
    expect(result.ok).toBe(false);
  });

  it("refuses to append onto a chain whose root hash is not a digest", () => {
    // appendEvent used to trust its chain argument, so a hand-built object
    // satisfying LedgerChain would link a new event to whatever string it
    // carried — producing an event whose prev_hash was not a digest.
    const forged = {
      genesis_hash: GENESIS,
      run_id: RUN_ID,
      events: [],
      root_hash: "GARBAGE",
      total_dr_paise: 0,
      total_cr_paise: 0,
    } as unknown as LedgerChain;
    expect(() => appendEvent(forged, makeNonPostingDraft())).toThrow(ChainMismatchError);
    expect(() => appendEvent(forged, makeNonPostingDraft())).toThrow(/not a digest/);
  });

  it("reports rather than raises when a stored record's getter throws", () => {
    // The pre-seal reads that locate an event for the error message ran before
    // the structural try/catch, so a hostile record propagated its own error
    // out of a function that promises to return pass/fail per check.
    const hostile = {
      get seq(): number {
        throw new Error("boom");
      },
    };
    const run = (): ChainVerification => verifyChain(GENESIS, asEvents([hostile]));
    expect(run).not.toThrow();
    const result = run();
    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.check)).toEqual(["STRUCTURE"]);
  });
});
