import type { Sha256, UnixSeconds } from "@assay/domain";
import type { Paise } from "@assay/money";
import type { EventActor, JournalLine, LedgerEventDraft, RunId } from "@assay/ledger";

/**
 * Builders for the CLI suite.
 *
 * Deterministic and hand-computable, on the same principle `packages/ledger`'s
 * fixtures state: no clock, no randomness, and digests are synthesised from a
 * seed rather than hashed, so a fixture never accidentally depends on the
 * implementation it is testing.
 */

const HEX = "0123456789abcdef";

/** A well-formed but arbitrary digest, distinct for distinct seeds. */
export function digest(seed: number): Sha256 {
  let out = (seed >>> 0).toString(16).padStart(8, "0");
  let state = seed + 1;
  while (out.length < 64) {
    state = (state * 48_271) % 2_147_483_647;
    out += HEX[state % 16] ?? "0";
  }
  return out as Sha256;
}

export function id(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(6, "0")}A`;
}

export function entityId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(14, "0")}`;
}

export const RUN_ID = "run_20260830T000000Z" as RunId;
export const BANK_LINE_ID = entityId("bnk_", 1);

export const GENESIS_INPUTS = Object.freeze({
  dataset_hash: digest(11),
  engine_commit: "b1460ef1bb334074fded46a8c1b428b729217ea5",
  config_hash: digest(12),
});

function actor(): EventActor {
  return {
    type: "deterministic",
    component: "engine.s5_validate",
    engine_commit: GENESIS_INPUTS.engine_commit,
    llm_provider: null,
    model_id: null,
    prompt_hash: null,
    llm_call_id: null,
  };
}

/** `DATA_MODEL.md §17.1`'s `P5` — an unattributable inbound bank credit. */
function p5Lines(amount: number): readonly JournalLine[] {
  return [
    {
      account: "1200_BANK",
      dr_paise: amount as Paise,
      cr_paise: 0 as Paise,
      memo_ref: "P5.dr",
      source_entity_id: BANK_LINE_ID,
    },
    {
      account: "9000_SUSPENSE_UNRECONCILED",
      dr_paise: 0 as Paise,
      cr_paise: amount as Paise,
      memo_ref: "P5.cr",
      source_entity_id: BANK_LINE_ID,
    },
  ];
}

/** One balanced posting event. `n` distinguishes successive events in a chain. */
export function draft(n: number): LedgerEventDraft {
  return {
    evt_id: id("evt_", n) as LedgerEventDraft["evt_id"],
    run_id: RUN_ID,
    ts: (1_787_000_000 + n) as UnixSeconds,
    actor: actor(),
    kind: "RECONCILE",
    subject_ids: [id("obs_", n)],
    evidence_ids: [id("ev_", n) as LedgerEventDraft["evidence_ids"][number]],
    decision_id: id("dec_", n) as LedgerEventDraft["decision_id"],
    inputs_hash: digest(100 + n),
    journal_lines: p5Lines(45_231_000 + n),
    certificate: null,
  };
}

/** A collector for `dispatch`'s two output streams. */
export function recorder(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line: string) => void lines.push(line) };
}
