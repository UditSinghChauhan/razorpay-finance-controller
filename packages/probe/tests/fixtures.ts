import type { OrderId, PaymentId, RefundId, SettlementId } from "@assay/domain";
import type { SolveResult } from "@assay/engine";
import type { ProbeId } from "@assay/ledger";

import type { ObservationUniverse } from "../src/call.js";

/**
 * Branded where `DATA_MODEL.md §12`'s `ProbeResultDetail` requires it.
 *
 * A **proposal** argument is a plain `string` and deliberately so: it arrives
 * from `R3` and is untrusted until `validate` has run. A **result** comes back
 * through `ProbeResultDetailSchema`, which parses to the branded id — so the two
 * sides of the loop carry different types, and that asymmetry is the point.
 */
export const SETL = "setl_aaaaaaaaaaaaaa" as SettlementId;
export const PAY = "pay_bbbbbbbbbbbbbb" as PaymentId;
export const ORDER = "order_cccccccccccccc" as OrderId;
export const RFND = "rfnd_dddddddddddddd" as RefundId;
export const ABSENT = "pay_XXXXXXXXXXXXXX" as PaymentId;

export const UNIVERSE: ObservationUniverse = {
  hasEntityId: (id) => ([SETL, PAY, ORDER, RFND] as readonly string[]).includes(id),
};

export function probeId(n: number): ProbeId {
  return `probe_${String(n)}` as ProbeId;
}

/** A `SolveResult` shaped only where the loop reads it. */
export function solve(over: Partial<SolveResult> = {}): SolveResult {
  return {
    outcome: "AMBIGUOUS",
    best: null,
    second: null,
    delta_s_bps: 0,
    materiality_paise: 0,
    tau_paise: 10_000,
    certificate_reason: { determined: true, reason: "EVIDENCE_TIE" },
    ranked: [],
    ...over,
  } as SolveResult;
}

/** An ambiguous solve whose certificate reason matches `attempts` spent. */
export function ambiguousAt(attempts: number): SolveResult {
  if (attempts <= 0) {
    return solve({ certificate_reason: { determined: true, reason: "EVIDENCE_TIE" } });
  }
  if (attempts >= 3) {
    return solve({
      certificate_reason: { determined: true, reason: "PROBE_BUDGET_EXHAUSTED" },
    });
  }
  return solve({
    certificate_reason: { determined: false, seam: "A2_MIDDLE_CASE_UNSPECIFIED", attempts },
  });
}
