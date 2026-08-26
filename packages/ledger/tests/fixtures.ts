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

/**
 * A business identifier: prefix plus exactly fourteen alphanumerics.
 *
 * Separate from `id` above because the two grammars differ. `§0` rule 3 gives
 * the Razorpay families a fourteen-character suffix and states no length for the
 * ASSAY-internal ones, so a `pay_` built by `id` would be six characters short
 * and would be refused as a `source_entity_id` — which is the point of having
 * one builder per grammar rather than one that satisfies neither.
 */
export function entityId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(14, "0")}`;
}

/**
 * One `source_entity_id` per family `DATA_MODEL.md §16` admits.
 *
 * `§17.1.1` assigns each of them to a posting: a bank line to `P5`, a settlement
 * to `P6`, a payment or refund recon line to `P1`–`P4`, and an adjustment to
 * `P8`. Naming them here keeps the Suspense item key visible in the postings
 * below without any fixture *selecting* a posting, which is `journal.ts`'s job
 * and a later milestone.
 */
export const BANK_LINE_ID = entityId("bnk_", 1);
export const SETTLEMENT_ID = entityId("setl_", 1);
export const PAYMENT_ID = entityId("pay_", 1);
export const REFUND_ID = entityId("rfnd_", 1);
export const ADJUSTMENT_ID = entityId("adj_", 1);

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

/**
 * One journal line.
 *
 * `sourceEntityId` defaults to the bank line the `P5` posting below is written
 * against, because that is the posting most of these fixtures carry. Tests that
 * care about the Suspense item key pass it explicitly.
 */
export function line(
  account: JournalLine["account"],
  dr: number,
  cr: number,
  memo = "P5",
  sourceEntityId: string = BANK_LINE_ID,
): JournalLine {
  return {
    account,
    dr_paise: dr as Paise,
    cr_paise: cr as Paise,
    memo_ref: memo,
    source_entity_id: sourceEntityId,
  };
}

/**
 * Posting `P5` from `DATA_MODEL.md §17.1` — an unattributable inbound bank
 * credit, the worked example in `ARCHITECTURE.md §5`:
 * `DR 1200_BANK 45231000 / CR 9000_SUSPENSE 45231000`.
 *
 * Both legs carry the same `bnk_…` key, which is `§17.1.1`'s column for an
 * inbound `E03` and which `§16` requires "on **every** journal line, including
 * the counter-leg, so that an item can be read whole".
 */
export function p5Lines(
  amount = 45_231_000,
  sourceEntityId: string = BANK_LINE_ID,
): readonly JournalLine[] {
  return [
    line("1200_BANK", amount, 0, "P5.dr", sourceEntityId),
    line("9000_SUSPENSE_UNRECONCILED", 0, amount, "P5.cr", sourceEntityId),
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
