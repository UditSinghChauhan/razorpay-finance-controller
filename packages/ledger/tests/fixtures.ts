/**
 * Builders for Layer A tests.
 *
 * Everything here is deterministic and hand-computable: no clock, no
 * randomness, and digests are synthesised from a seed rather than hashed, so a
 * fixture never accidentally depends on the implementation it is testing.
 */

import type { ObservationId, Sha256, UnixSeconds } from "@assay/domain";
import type { Paise } from "@assay/money";

import type {
  AmbiguityCertificate,
  EventActor,
  JournalLine,
  LedgerEvent,
  LedgerEventDraft,
  RunId,
} from "@assay/ledger";

const HEX = "0123456789abcdef";

/**
 * A well-formed but arbitrary digest. Deterministic in `seed`, never hashed.
 *
 * The first eight characters are the seed in hexadecimal, so two distinct
 * seeds always produce two distinct digests. An earlier version generated all
 * 64 characters from `(7 * seed + 11 * index) mod 16`, which has period 16 in
 * the seed: `digest(98)` and `digest(2)` were the same string, and a test
 * asserting that a changed genesis input changes the genesis hash failed
 * against a correct implementation. A fixture that can collide silently is a
 * fixture that can hide the defect it was written to catch.
 */
export function digest(seed: number): Sha256 {
  let out = (seed >>> 0).toString(16).padStart(8, "0");
  let state = seed + 1;
  while (out.length < 64) {
    state = (state * 48_271) % 2_147_483_647;
    out += HEX[state % 16] ?? "0";
  }
  return out as Sha256;
}

/** An `evt_`, `dec_`, `cand_`, `comp_` or `obs_` identifier with a stable suffix. */
export function id(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(6, "0")}A`;
}

export const RUN_ID = "run_20260826T000000Z" as RunId;

export const GENESIS_INPUTS = {
  dataset_hash: digest(1),
  engine_commit: "b1460ef1bb334074fded46a8c1b428b729217ea5",
  config_hash: digest(2),
};

export function makeActor(overrides: Partial<EventActor> = {}): EventActor {
  return {
    type: "deterministic",
    component: "engine.s5_validate",
    engine_commit: GENESIS_INPUTS.engine_commit,
    llm_provider: null,
    model_id: null,
    prompt_hash: null,
    llm_call_id: null,
    ...overrides,
  };
}

export function line(
  account: JournalLine["account"],
  dr: number,
  cr: number,
  memo = "P5",
): JournalLine {
  return {
    account,
    dr_paise: dr as Paise,
    cr_paise: cr as Paise,
    memo_ref: memo,
  };
}

/**
 * Posting `P5` from `DATA_MODEL.md §17.1` — an unattributable inbound bank
 * credit, the worked example in `ARCHITECTURE.md §5`:
 * `DR 1200_BANK 45231000 / CR 9000_SUSPENSE 45231000`.
 */
export function p5Lines(amount = 45_231_000): readonly JournalLine[] {
  return [
    line("1200_BANK", amount, 0, "P5.dr"),
    line("9000_SUSPENSE_UNRECONCILED", 0, amount, "P5.cr"),
  ];
}

export function makeCertificate(
  overrides: Partial<AmbiguityCertificate> = {},
): AmbiguityCertificate {
  return {
    comp_id: id("comp_", 1) as AmbiguityCertificate["comp_id"],
    solution_a: {
      candidate_id: id("cand_", 1) as AmbiguityCertificate["solution_a"]["candidate_id"],
      member_obs_ids: [id("obs_", 1) as ObservationId],
    },
    solution_b: {
      candidate_id: id("cand_", 2) as AmbiguityCertificate["solution_b"]["candidate_id"],
      member_obs_ids: [id("obs_", 2) as ObservationId, id("obs_", 3) as ObservationId],
    },
    shared_hard_constraints: ["C1", "C2", "C4", "C7"],
    evidence_score_gap_bps: 0,
    materiality_paise: 45_231_000 as Paise,
    epsilon_bps: 1500,
    tau_paise: 10_000 as Paise,
    probes_attempted: [id("probe_", 1) as AmbiguityCertificate["probes_attempted"][number]],
    reason: "EVIDENCE_TIE",
    ...overrides,
  };
}

export function makeDraft(
  overrides: Partial<LedgerEventDraft> = {},
): LedgerEventDraft {
  return {
    evt_id: id("evt_", 1) as LedgerEventDraft["evt_id"],
    run_id: RUN_ID,
    ts: 1_787_000_000 as UnixSeconds,
    actor: makeActor(),
    kind: "ABSTAIN",
    subject_ids: [id("obs_", 1), id("obs_", 2)],
    evidence_ids: [id("ev_", 1) as LedgerEventDraft["evidence_ids"][number]],
    decision_id: id("dec_", 1) as LedgerEventDraft["decision_id"],
    inputs_hash: digest(3),
    journal_lines: p5Lines(),
    certificate: makeCertificate(),
    ...overrides,
  };
}

/** A draft carrying no posting — `§16`: "may be empty for non-posting events". */
export function makeNonPostingDraft(
  overrides: Partial<LedgerEventDraft> = {},
): LedgerEventDraft {
  return makeDraft({
    kind: "INGEST",
    journal_lines: [],
    certificate: null,
    decision_id: null,
    ...overrides,
  });
}

/**
 * A deep, **unfrozen** copy of a stored chain — what an attacker holding write
 * access to `assay.sqlite` has (`THREAT_MODEL.md §T10`).
 */
export function storedCopy(
  events: readonly LedgerEvent[],
): Record<string, unknown>[] {
  return structuredClone(events) as unknown as Record<string, unknown>[];
}

/** Re-typed for `verifyChain`, which treats its argument as untrusted anyway. */
export function asEvents(records: readonly unknown[]): readonly LedgerEvent[] {
  return records as readonly LedgerEvent[];
}
