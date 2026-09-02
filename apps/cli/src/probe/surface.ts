import type { FetchSettlementReconResult, SettlementId } from "@assay/domain";
import { ProbeResultDetailSchema } from "@assay/domain";
import { kindOf, type ValidatedProbeCall } from "@assay/probe";

import { decodeJsonl } from "../artifacts/jsonl.js";
import { CliError, EXIT } from "../errors.js";

/**
 * The `RECONCILIATION_SPEC.md §6.2` probe **dispatch** — `apps/cli`'s one job in
 * the `§6.6` chain.
 *
 * ```
 *   packages/llm      R3 proposes            a value, schema- and allowlist-checked
 *   packages/probe    validates + constructs  P_max · pre-call I6 · closed enum
 *   apps/cli          dispatches              <- this module
 *   packages/domain   validates the result    ProbeResultDetail
 *   packages/engine   S4 re-solves            pure, from accumulated evidence
 *   packages/ledger   appends the PROBE event body packages/probe assembled
 * ```
 *
 * **This module constructs nothing.** It takes a {@link ValidatedProbeCall} —
 * which only `packages/probe` can produce — and answers it. It cannot invent a
 * call, cannot skip `P_max` and cannot bypass the pre-call `I6` check, because it
 * has no way to build the type its own parameter requires.
 *
 * **The read is `PROBE_DISPATCH`-zoned.** `PREREGISTRATION.md §6.2` `AL8` makes
 * `recon_report.jsonl` *"reachable **only** through the probe executor, under
 * `P_max`"*, and `fs/guard.ts` unlocks the artifact for that zone alone (plus the
 * seal's separate, digest-only permission). There is no second door: every read
 * in this package funnels through `fs/io.ts`.
 *
 * ## One probe has a source; three do not, and that gap is not filled here
 *
 * Spec 1.4.22 (register row M36) ratified a source for **`fetch_settlement_recon`
 * only** — the committed `bench/<split>/recon_report.jsonl`, three columns. **No
 * document names a source for `fetch_order`, `fetch_payment` or
 * `fetch_refund`**: `DATA_MODEL.md §22.1`'s `D10`/`D11` describe Razorpay
 * endpoints rather than a committed artifact, and `§12` says the probe reads the
 * PG's own report *"rather than the observation set"*, so the observation set is
 * not a substitute.
 *
 * Inventing one would be a benchmark surface introduced at the keyboard. This
 * module therefore **refuses** the other three by naming the gap, and
 * {@link DISPATCHABLE_PROBE_KINDS} lets the composition root build an
 * available-probe context it can actually serve. That is a property of today's
 * committed surface, **not** of `PREREGISTRATION.md §7`'s frozen policy, which
 * ranks all four and is unchanged: the policy's second, third and fourth entries
 * are inert here for the same reason `§4.1`'s `C8` and `SE1`/`SE2`/`SE4` are
 * inert — declared, reported, and not deleted.
 */

/** The probe kinds this dispatch can answer from a committed artifact. */
export const DISPATCHABLE_PROBE_KINDS: readonly string[] = Object.freeze([
  "fetch_settlement_recon",
]);

/** Whether a probe kind has a ratified, committed source (spec 1.4.22, M36). */
export function isDispatchable(kind: string): boolean {
  return DISPATCHABLE_PROBE_KINDS.includes(kind);
}

/** A probe whose source no document names. Refused rather than improvised. */
export class ProbeSourceUnavailableError extends CliError {
  readonly probe: string;

  constructor(probe: string) {
    super(
      `no committed source exists for probe ${JSON.stringify(probe)}. ` +
        `RECONCILIATION_SPEC.md §6.2 ratified a source for fetch_settlement_recon only ` +
        `(spec 1.4.22, DATA_MODEL.md §22.2 M36): bench/<split>/recon_report.jsonl. ` +
        `DATA_MODEL.md §22.1's D10/D11 describe endpoints rather than a committed ` +
        `artifact, and §12 states the probe reads the PG's own report "rather than the ` +
        `observation set". Supplying one here would add a benchmark surface no ` +
        `amendment declared.`,
      EXIT.FAILURE,
    );
    this.name = "ProbeSourceUnavailableError";
    this.probe = probe;
  }
}

/**
 * One row of `bench/<split>/recon_report.jsonl` (`§6.2`, M36/M38).
 *
 * Structural, and declared here rather than imported from `packages/generator`:
 * `apps/cli` reads this artifact on the **agent** path, and importing the
 * generator to do it would put `GroundTruth`'s package on that path. The three
 * columns are `§6.2`'s own closure.
 */
interface ReconReportRow {
  readonly settlement_id: string | null;
  readonly entity_id: string;
  readonly settled_at: number | null;
}

function isRow(value: unknown): value is ReconReportRow {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    (typeof r["settlement_id"] === "string" || r["settlement_id"] === null) &&
    typeof r["entity_id"] === "string" &&
    (typeof r["settled_at"] === "number" || r["settled_at"] === null)
  );
}

const rowDecoder = {
  parse: (value: unknown): ReconReportRow => {
    if (!isRow(value)) {
      throw new Error(
        `not a §6.2 recon report row: expected {settlement_id: string|null, ` +
          `entity_id: string, settled_at: number|null}`,
      );
    }
    return value;
  },
};

export interface ProbeDispatchOptions {
  /** `bench/<split>/<family>/recon_report.jsonl`. */
  readonly reconReportPath: string;
}

/**
 * Answer one validated probe call.
 *
 * The result is parsed by **`packages/domain`'s** `ProbeResultDetailSchema`
 * before it is returned, so what leaves this module is the same validated shape
 * `packages/probe` will bind back against its call. Nothing here is trusted on
 * its own account.
 *
 * `date` is **not read**. `DATA_MODEL.md §22.2` M31 leaves the field a query is
 * date-scoped on undecided and spec 1.4.22 makes `settlement_id` *"its only
 * query key"*; M31 is not resolved here. The argument still reaches the audit
 * trail through the `PROBE` event's `inputs_hash`.
 *
 * @throws ProbeSourceUnavailableError for a probe with no committed source.
 */
export function dispatchProbe(
  call: ValidatedProbeCall,
  options: ProbeDispatchOptions,
): FetchSettlementReconResult {
  const kind = kindOf(call);
  if (!isDispatchable(kind)) throw new ProbeSourceUnavailableError(kind);
  if (call.probe !== "fetch_settlement_recon") throw new ProbeSourceUnavailableError(kind);

  const rows = decodeJsonl({ path: options.reconReportPath, zone: "PROBE_DISPATCH" }, rowDecoder);

  // §6.2: "the lines carrying that settlement_id". Row order is a serialization
  // property (M38) and SE5 is a set measure, so the order they are collected in
  // carries no meaning — it is preserved only so two runs agree byte for byte.
  const constituents = rows
    .filter((row) => row.settlement_id === call.settlement_id)
    .map((row) => row.entity_id);

  return ProbeResultDetailSchema.parse({
    probe: "fetch_settlement_recon",
    settlement_id: call.settlement_id as SettlementId,
    constituent_entity_ids: constituents,
  }) as FetchSettlementReconResult;
}
