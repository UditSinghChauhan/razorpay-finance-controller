import { hashCanonical, type DecisionId, type EvidenceId, type JournalLine } from "@assay/ledger";
import type { CanonicalValue } from "@assay/domain";

import { argumentEntityId, type ValidatedProbeCall } from "./call.js";

/**
 * The `PROBE` `LedgerEvent` body (`DATA_MODEL.md §16`).
 *
 * `§16`'s `kind` union carries `"PROBE"`, and `THREAT_MODEL.md §T7` requires
 * *"every probe logged with its proposer"*. This module assembles the part of the
 * event the loop owns and knows; the caller supplies the rest.
 *
 * ```
 *   assembled here   kind · subject_ids · evidence_ids · decision_id
 *                    inputs_hash · journal_lines · certificate
 *
 *   caller supplies  evt_id · run_id · ts · actor · seq
 *                    -- all run-scoped or wall-clock, and §16 excludes
 *                       evt_id, run_id and ts from the hashed body anyway
 * ```
 *
 * **Deterministic by construction.** No clock, no counter, no randomness: every
 * field is a function of the call and the ids the caller passes in. `§16` requires
 * exactly that of anything entering the hashed body — no result may depend on
 * *"iteration order over an unordered collection"* — and metric 23 requires two
 * runs over identical inputs to produce identical root hashes.
 */

/** The deterministic portion of a `PROBE` event that this package assembles. */
export interface ProbeEventBody {
  readonly kind: "PROBE";
  /** The entity the probe named. Empty for a probe that names none. */
  readonly subject_ids: readonly string[];
  readonly evidence_ids: readonly EvidenceId[];
  readonly decision_id: DecisionId | null;
  /** `§16`: *"hash of everything the step read"*. */
  readonly inputs_hash: string;
  /** A probe asserts no rupee movement, so it posts nothing. */
  readonly journal_lines: readonly JournalLine[];
  /** A probe is not an abstention. */
  readonly certificate: null;
}

export interface ProbeEventInput {
  readonly call: ValidatedProbeCall;
  /** The component the probe was spent on. */
  readonly comp_id: string;
  /** Probes already spent when this one was issued. */
  readonly attempts_before: number;
  /** Evidence rows the result produced, in the order the caller minted them. */
  readonly evidence_ids: readonly EvidenceId[];
  readonly decision_id: DecisionId | null;
}

/**
 * Assemble the body.
 *
 * `inputs_hash` covers the call **as issued** — probe kind, every argument
 * including `date`, the component, and the budget position — which is `§16`'s
 * *"everything the step read"* for a step whose only input is its own call.
 * Recording `date` here is why `DATA_MODEL.md §12` could leave it off
 * `ProbeResultDetail`: *"Recording the call belongs to the `PROBE` `LedgerEvent`"*.
 */
export function probeEventBody(input: ProbeEventInput): ProbeEventBody {
  const entityId = argumentEntityId(input.call);
  return Object.freeze({
    kind: "PROBE",
    subject_ids: Object.freeze(entityId === null ? [] : [entityId]),
    evidence_ids: Object.freeze([...input.evidence_ids]),
    decision_id: input.decision_id,
    inputs_hash: hashCanonical({
      comp_id: input.comp_id,
      attempts_before: input.attempts_before,
      call: { ...input.call },
    } as unknown as CanonicalValue),
    journal_lines: Object.freeze([]),
    certificate: null,
  }) satisfies ProbeEventBody;
}
