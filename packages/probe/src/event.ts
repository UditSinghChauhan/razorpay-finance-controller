import { hashCanonical, type EvidenceId, type ValidatedProbeEvent } from "@assay/ledger";
import type { CanonicalValue, ProbeResultDetail } from "@assay/domain";

import { argumentEntityId, type ValidatedProbeCall } from "./call.js";
import { bindResultToCall } from "./loop.js";

/**
 * The `PROBE` `LedgerEvent` body (`DATA_MODEL.md §16`), minted as the
 * `ValidatedProbeEvent` the ledger's probe entry point accepts.
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
 * **This is the sole constructor of a `ValidatedProbeEvent`** (register row
 * `DATA_MODEL.md §22.2` M65). `packages/ledger` declares the type with a
 * module-private brand and exports no constructor; the one widening assertion in
 * the workspace is below, and `tests/discipline.test.ts` counts it. A body is
 * minted only from a validated call **and** the result that answered it — the
 * same binding `acceptResult` enforces — so the ledger can record only a probe
 * that was actually issued through `packages/probe` and actually answered.
 *
 * **Deterministic by construction.** No clock, no counter, no randomness: every
 * field is a function of the call and the ids the caller passes in. `§16` requires
 * exactly that of anything entering the hashed body — no result may depend on
 * *"iteration order over an unordered collection"* — and metric 23 requires two
 * runs over identical inputs to produce identical root hashes.
 */

/**
 * The `PROBE` event body this package mints. It IS the ledger's
 * `ValidatedProbeEvent`: one type under the name each side of the boundary uses.
 */
export type ProbeEventBody = ValidatedProbeEvent;

export interface ProbeEventInput {
  readonly call: ValidatedProbeCall;
  /**
   * The validated result that answered {@link call}. An event is minted only
   * for a call that was answered, and only by its own answer: a result for
   * another probe kind or another entity throws `ProbeResultMismatchError`.
   */
  readonly result: ProbeResultDetail;
  /** The component the probe was spent on. */
  readonly comp_id: string;
  /** Probes already spent on the component when this one was issued. */
  readonly attempts_before: number;
  /** Evidence rows the result produced, in the order the caller minted them. */
  readonly evidence_ids: readonly EvidenceId[];
}

/**
 * Mint the body.
 *
 * `inputs_hash` covers the call **as issued** — probe kind, every argument
 * including `date`, the component, and the budget position — which is `§16`'s
 * *"everything the step read"* for a step whose only input is its own call.
 * Recording `date` here is why `DATA_MODEL.md §12` could leave it off
 * `ProbeResultDetail`: *"Recording the call belongs to the `PROBE` `LedgerEvent`"*.
 *
 * `decision_id` is `null`: a probe informs a decision and is not one, and the
 * ledger indexes any event carrying a `decision_id` as that decision's post.
 *
 * @throws ProbeResultMismatchError when `result` does not answer `call`
 */
export function probeEventBody(input: ProbeEventInput): ProbeEventBody {
  bindResultToCall(input.call, input.result);
  const entityId = argumentEntityId(input.call);
  const body = Object.freeze({
    kind: "PROBE" as const,
    subject_ids: Object.freeze(entityId === null ? [] : [entityId]),
    evidence_ids: Object.freeze([...input.evidence_ids]),
    decision_id: null,
    inputs_hash: hashCanonical({
      comp_id: input.comp_id,
      attempts_before: input.attempts_before,
      call: { ...input.call },
    } as unknown as CanonicalValue),
    journal_lines: Object.freeze([]),
    certificate: null,
  });
  // The single widening to ValidatedProbeEvent in the workspace (M65). It is
  // reached only past `bindResultToCall`, with a call only `validate` can mint.
  return body as unknown as ValidatedProbeEvent;
}
