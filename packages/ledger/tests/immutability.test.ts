import { describe, expect, it } from "vitest";

import {
  appendEvent,
  computeGenesisHash,
  createChain,
  sealDraft,
  verifyChain,
  type JournalLine,
  type LedgerEventDraft,
} from "@assay/ledger";

import {
  BANK_LINE_ID,
  GENESIS_INPUTS,
  RUN_ID,
  line,
  makeDraft,
  p5Lines,
} from "./fixtures.js";

const GENESIS = computeGenesisHash(GENESIS_INPUTS);

/** Attempt a write the way an attacker would: through an erased type. */
function write(target: unknown, key: string, value: unknown): void {
  (target as Record<string, unknown>)[key] = value;
}

describe("a sealed record is frozen at every level", () => {
  const sealed = sealDraft(makeDraft());

  it("freezes the record itself", () => {
    expect(Object.isFrozen(sealed)).toBe(true);
    expect(() => {
      write(sealed, "kind", "RECONCILE");
    }).toThrow(TypeError);
  });

  it("freezes the actor block", () => {
    expect(Object.isFrozen(sealed.actor)).toBe(true);
    expect(() => {
      write(sealed.actor, "type", "human");
    }).toThrow(TypeError);
  });

  it("freezes the journal lines and every line in them", () => {
    expect(Object.isFrozen(sealed.journal_lines)).toBe(true);
    for (const journalLine of sealed.journal_lines) {
      expect(Object.isFrozen(journalLine)).toBe(true);
      expect(() => {
        write(journalLine, "dr_paise", 1);
      }).toThrow(TypeError);
      // The Suspense item key is frozen with the rest of the line. Re-keying a
      // posting in place would move it between G3 items without moving a rupee
      // (`RECONCILIATION_SPEC.md §10.1`, `THREAT_MODEL.md §T8`).
      expect(() => {
        write(journalLine, "source_entity_id", "setl_00000000000001");
      }).toThrow(TypeError);
      expect(journalLine.source_entity_id).toBe(BANK_LINE_ID);
    }
    expect(() => {
      (sealed.journal_lines as JournalLine[]).push(line("1200_BANK", 1, 0));
    }).toThrow(TypeError);
  });

  it("freezes the certificate and its nested solutions", () => {
    const certificate = sealed.certificate;
    expect(certificate).not.toBeNull();
    if (certificate === null) return;
    expect(Object.isFrozen(certificate)).toBe(true);
    expect(Object.isFrozen(certificate.solution_a)).toBe(true);
    expect(Object.isFrozen(certificate.solution_a.member_obs_ids)).toBe(true);
    expect(Object.isFrozen(certificate.shared_hard_constraints)).toBe(true);
    expect(Object.isFrozen(certificate.probes_attempted)).toBe(true);
  });

  it("freezes the identifier arrays", () => {
    expect(Object.isFrozen(sealed.subject_ids)).toBe(true);
    expect(Object.isFrozen(sealed.evidence_ids)).toBe(true);
  });
});

describe("a sealed record shares nothing with the draft it came from", () => {
  it("survives mutation of the draft's arrays", () => {
    const subjects = ["obs_1", "obs_2"];
    const lines = [...p5Lines()];
    const draft = makeDraft({ subject_ids: subjects, journal_lines: lines });
    const sealed = sealDraft(draft);

    subjects.push("obs_smuggled");
    subjects[0] = "obs_rewritten";
    lines.pop();

    expect([...sealed.subject_ids]).toEqual(["obs_1", "obs_2"]);
    expect(sealed.journal_lines).toHaveLength(2);
  });

  it("survives mutation of the draft's nested objects", () => {
    const actor = { ...makeDraft().actor };
    const draft = makeDraft({ actor });
    const sealed = sealDraft(draft);

    write(actor, "component", "engine.compromised");
    write(actor, "engine_commit", "0000000");

    expect(sealed.actor.component).toBe("engine.s5_validate");
    expect(sealed.actor.engine_commit).toBe(GENESIS_INPUTS.engine_commit);
  });

  it("survives mutation of a journal line after the event is in the chain", () => {
    // Attack: hash a correct posting, then edit the object the caller still
    // holds, hoping the chain kept a reference to it.
    const lines = [
      line("1200_BANK", 100, 0, "P5.dr"),
      line("9000_SUSPENSE_UNRECONCILED", 0, 100, "P5.cr"),
    ];
    const chain = appendEvent(
      createChain(GENESIS, RUN_ID),
      makeDraft({ journal_lines: lines }),
    );
    const rootBefore = chain.root_hash;

    write(lines[0], "dr_paise", 999_999);
    write(lines[1], "account", "4000_REVENUE");
    write(lines[1], "source_entity_id", "setl_00000000000001");
    lines.length = 0;

    expect(chain.events[0]?.journal_lines[0]?.dr_paise).toBe(100);
    expect(chain.events[0]?.journal_lines[1]?.account).toBe(
      "9000_SUSPENSE_UNRECONCILED",
    );
    expect(chain.events[0]?.journal_lines[1]?.source_entity_id).toBe(BANK_LINE_ID);
    expect(verifyChain(GENESIS, chain.events, rootBefore).ok).toBe(true);
  });
});

describe("every field is read exactly once", () => {
  it("cannot be shown one value and asked to hash another", () => {
    // A getter that answers differently on a second read would let a validator
    // see a legal amount while the serializer hashes an illegal one. The seal
    // reads each field once, into a fresh plain object.
    let reads = 0;
    const hostile = {
      account: "1200_BANK",
      get dr_paise(): number {
        reads += 1;
        return reads === 1 ? 100 : 999_999;
      },
      cr_paise: 0,
      memo_ref: "P5.dr",
      source_entity_id: BANK_LINE_ID,
    };
    const draft = makeDraft({
      journal_lines: [
        hostile as unknown as JournalLine,
        line("9000_SUSPENSE_UNRECONCILED", 0, 100, "P5.cr", BANK_LINE_ID),
      ],
    });

    const sealed = sealDraft(draft);
    expect(reads).toBe(1);
    expect(sealed.journal_lines[0]?.dr_paise).toBe(100);
    expect(sealed.journal_lines[0]?.dr_paise).toBe(100);
  });

  it("cannot be shown one item key and asked to hash another", () => {
    // The same attack aimed at the field G3 partitions on: show the validator a
    // legal `bnk_` key, hand the serializer a different one, and the posting is
    // filed under an item the record does not name.
    let reads = 0;
    const hostile = {
      account: "1200_BANK",
      dr_paise: 100,
      cr_paise: 0,
      memo_ref: "P5.dr",
      get source_entity_id(): string {
        reads += 1;
        return reads === 1 ? BANK_LINE_ID : "setl_00000000000001";
      },
    };
    const sealed = sealDraft(
      makeDraft({
        journal_lines: [
          hostile as unknown as JournalLine,
          line("9000_SUSPENSE_UNRECONCILED", 0, 100, "P5.cr", BANK_LINE_ID),
        ],
      }),
    );
    expect(reads).toBe(1);
    expect(sealed.journal_lines[0]?.source_entity_id).toBe(BANK_LINE_ID);
    expect(sealed.journal_lines[0]?.source_entity_id).toBe(BANK_LINE_ID);
  });

  it("copies out of a proxy rather than retaining it", () => {
    let reads = 0;
    const target = { ...makeDraft().actor };
    const proxied = new Proxy(target, {
      get(object, key, receiver): unknown {
        if (key === "component") {
          reads += 1;
          return reads === 1 ? "engine.s5_validate" : "engine.compromised";
        }
        return Reflect.get(object, key, receiver) as unknown;
      },
    });

    const sealed = sealDraft(makeDraft({ actor: proxied }));
    expect(sealed.actor.component).toBe("engine.s5_validate");
    expect(sealed.actor.component).toBe("engine.s5_validate");
    expect(Object.isFrozen(sealed.actor)).toBe(true);
  });
});

describe("the chain is an immutable value", () => {
  const base = appendEvent(createChain(GENESIS, RUN_ID), makeDraft());

  it("freezes the chain and its event list", () => {
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.events)).toBe(true);
    expect(() => {
      write(base, "root_hash", "0".repeat(64));
    }).toThrow(TypeError);
  });

  it("refuses an in-place append", () => {
    expect(() => {
      (base.events as unknown[]).push({});
    }).toThrow(TypeError);
    expect(base.events).toHaveLength(1);
  });

  it("refuses an in-place deletion", () => {
    expect(() => {
      (base.events as unknown[]).splice(0, 1);
    }).toThrow(TypeError);
    expect(base.events).toHaveLength(1);
  });

  it("freezes every event it holds", () => {
    const event = base.events[0];
    expect(event).toBeDefined();
    expect(Object.isFrozen(event)).toBe(true);
    expect(() => {
      write(event, "seq", 99);
    }).toThrow(TypeError);
    expect(() => {
      write(event, "hash", "0".repeat(64));
    }).toThrow(TypeError);
  });

  it("leaves its argument untouched when extended", () => {
    // ARCHITECTURE.md §8: "Nothing is ever updated or deleted. A correction is
    // a new event." Appending returns a new chain rather than mutating one, so
    // that sentence is a property of the type and not of caller discipline.
    const rootBefore = base.root_hash;
    const extended = appendEvent(base, makeDraft({ evt_id: "evt_000002A" as never }));

    expect(base.events).toHaveLength(1);
    expect(base.root_hash).toBe(rootBefore);
    expect(extended.events).toHaveLength(2);
    expect(extended.root_hash).not.toBe(rootBefore);
  });

  it("shares its earlier events with the chain it extended", () => {
    const extended = appendEvent(base, makeDraft({ evt_id: "evt_000003A" as never }));
    expect(extended.events[0]).toBe(base.events[0]);
  });
});

describe("the draft type does not have to be trusted", () => {
  it("refuses a record whose prototype is not Object.prototype", () => {
    const polluted: unknown = Object.create({ inherited: "value" });
    Object.assign(polluted as object, makeDraft());
    expect(() => sealDraft(polluted as LedgerEventDraft)).toThrow(/plain object/);
  });

  it("refuses an own __proto__ property rather than walking past it", () => {
    const smuggled = JSON.parse('{"__proto__": {"polluted": true}}') as Record<
      string,
      unknown
    >;
    const draft = { ...makeDraft(), ...smuggled } as unknown as LedgerEventDraft;
    expect(() => sealDraft(draft)).toThrow(/__proto__/);
  });

  it("refuses an own __proto__ smuggled onto a journal line", () => {
    // The draft-level case is covered above; a line is a nested record read by
    // the same strict path, and a posting is where a smuggled key would be
    // worth having.
    const smuggled = JSON.parse('{"__proto__": {"polluted": true}}') as Record<
      string,
      unknown
    >;
    const draft = makeDraft({
      journal_lines: [
        { ...line("1200_BANK", 100, 0, "P5.dr"), ...smuggled },
        line("9000_SUSPENSE_UNRECONCILED", 0, 100, "P5.cr"),
      ] as unknown as readonly JournalLine[],
    });
    expect(() => sealDraft(draft)).toThrow(/__proto__/);
  });

  it("refuses a toJSON escape hatch", () => {
    // canonicalJson walks keys itself and never calls toJSON, so a toJSON
    // method could only ever be an unmodelled field. Strictness catches it.
    const draft = {
      ...makeDraft(),
      toJSON: () => ({}),
    } as unknown as LedgerEventDraft;
    expect(() => sealDraft(draft)).toThrow(/toJSON/);
  });
});
