import type { RunId } from "@assay/ledger";

import type { InvokeRequest, R1Input, R2Input, R3Input } from "../src/provider.js";
import { R1OutputSchema, R1_SYSTEM_PROMPT_ID } from "../src/roles/r1.js";
import { R2OutputSchema, R2_SYSTEM_PROMPT_ID } from "../src/roles/r2.js";
import { R3OutputSchema, R3_SYSTEM_PROMPT_ID } from "../src/roles/r3.js";

export const RUN: RunId = "run_test" as RunId;

/**
 * The generator's own pre-degradation narration
 * (`PREREGISTRATION.md §4.3`, convention `U-NARRATION`).
 */
export const NARRATION =
  "NEFT CR 1568176960vxp0rj RAZORPAY SOFTWARE PVT LTD SETTLEMENT 2026-08-14";

/** `ARCHITECTURE.md §6`'s three other documented narration shapes. */
export const SHAPES: readonly string[] = Object.freeze([
  NARRATION,
  "NEFT-RZPX00012345-RAZORPAY SOFTWARE PVT-CR",
  "MMT/IMPS/RZP/452310/2026081412345",
  "BY TRANSFER-NEFT*RZPX0001*RAZORPAYSOFT",
  // TRUNCATE_NARRATION at 35 chars (§4.3).
  NARRATION.slice(0, 35),
]);

export function r1Input(narration = NARRATION): R1Input {
  return { role: "R1", obs_id: "obs_aaaaaaaaaaaaaa", narration };
}

export function r1Request(narration = NARRATION): InvokeRequest<unknown> {
  return {
    role: "R1",
    schema: R1OutputSchema,
    systemPromptId: R1_SYSTEM_PROMPT_ID,
    input: r1Input(narration),
    idAllowlist: [],
  };
}

export function r2Input(over: Partial<R2Input> = {}): R2Input {
  return {
    role: "R2",
    comp_id: "comp_aaaaaaaaaaaaaa",
    target_kind: "settlement",
    member_kinds: ["recon_line"],
    failed_constraints: [],
    failed_invariants: [],
    amount_refs: ["obs_bbbbbbbbbbbbbb"],
    member_count: 1,
    bank_matched: true,
    ...over,
  };
}

export function r2Request(over: Partial<R2Input> = {}): InvokeRequest<unknown> {
  const input = r2Input(over);
  return {
    role: "R2",
    schema: R2OutputSchema,
    systemPromptId: R2_SYSTEM_PROMPT_ID,
    input,
    idAllowlist: [...input.amount_refs],
  };
}

/** Four settlement ids whose lexicographic order is NOT their listed order. */
export const SETL_IDS: readonly string[] = Object.freeze([
  "setl_ccccccccccccc1",
  "setl_aaaaaaaaaaaaa1",
  "setl_bbbbbbbbbbbbb1",
]);

export const PAY_IDS: readonly string[] = Object.freeze([
  "pay_zzzzzzzzzzzzz1",
  "pay_mmmmmmmmmmmm11",
]);

export const ORDER_IDS: readonly string[] = Object.freeze(["order_bbbbbbbbbbbb1", "order_aaaaaaaaaaaa1"]);
export const RFND_IDS: readonly string[] = Object.freeze(["rfnd_bbbbbbbbbbbbb1", "rfnd_aaaaaaaaaaaaa1"]);

export function r3Input(over: Partial<R3Input> = {}): R3Input {
  return {
    role: "R3",
    comp_id: "comp_aaaaaaaaaaaaaa",
    certificate: {
      solution_a_obs_ids: ["obs_aaaaaaaaaaaaaa"],
      solution_b_obs_ids: ["obs_bbbbbbbbbbbbbb"],
      shared_hard_constraints: ["C1", "C4"],
      evidence_score_gap_bps: 0,
      epsilon_bps: 1500,
      materiality_ref: "comp_aaaaaaaaaaaaaa#materiality",
    },
    available_probes: [
      { probe: "fetch_settlement_recon", argument_ids: SETL_IDS },
      { probe: "fetch_payment", argument_ids: PAY_IDS },
      { probe: "fetch_order", argument_ids: ORDER_IDS },
      { probe: "fetch_refund", argument_ids: RFND_IDS },
    ],
    attempts: 0,
    attempts_remaining: 3,
    probes_attempted: [],
    probe_results: [],
    recon_date_scope: "2026-08",
    ...over,
  };
}

export function r3Request(over: Partial<R3Input> = {}): InvokeRequest<unknown> {
  const input = r3Input(over);
  return {
    role: "R3",
    schema: R3OutputSchema,
    systemPromptId: R3_SYSTEM_PROMPT_ID,
    input,
    idAllowlist: [
      ...input.available_probes.flatMap((p) => [...p.argument_ids]),
    ],
  };
}
