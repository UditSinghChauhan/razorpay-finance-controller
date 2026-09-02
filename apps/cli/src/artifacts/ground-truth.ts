import { isAccountCode } from "@assay/domain";
import type { GroundTruth } from "@assay/generator";

import { CliError, EXIT } from "../errors.js";
import { decodeJsonl } from "./jsonl.js";

/**
 * Reading `bench/<split>/<seed>/ground_truth.jsonl` **for the scorer**.
 *
 * `ARCHITECTURE.md §3` gives `apps/cli` all filesystem I/O and
 * `packages/eval/src/truth.ts` states the other half: *"a scorer that could not
 * see the answer key could not mark the paper"*, and `AL1`/`AL2` bind the engine
 * and the oracle rather than the scorer. This module is the read; every
 * *interpretation* of what was read belongs to `packages/eval` and none of it
 * happens here — no population is projected, no covered set is derived and no
 * metric is computed.
 *
 * **The zone is `GENERATOR_TRUST`, which is `AL2`'s only route, and the read is
 * unconditional.** `fs/guard.ts` unlocks `**\/ground_truth*.jsonl` for that zone
 * alone; `commands/oracle.ts` and `commands/seal.ts` read the artifact there too.
 * From spec 1.4.34 (`DATA_MODEL.md §22.2` **M56**, `DECISION_BRIEF.md §A.41`)
 * `--sealed` does **not** withdraw it: `AL5` is an **emission** rule — *"reading
 * is none of print, log or write"* — so `PREREGISTRATION.md §9` step 7's
 * `assay bench --sealed` opens this artifact through this same function, and
 * `EVALUATION_SPEC.md §2`'s `score(agent output, ground truth, oracle labels)`
 * becomes executable on the one run that ever scores TEST. **No fifth `ReadZone`
 * was added**: `§A.41` rejected one and preserved the rejection, because `AL2`
 * names its constrained parties by package and the scorer is not among them.
 *
 * **What M56 does not widen.** `AL2` is untouched in substance and in wording:
 * zone `AGENT` is still refused, so no agent, engine or oracle reaches the
 * artifact, sealed or not. The withdrawal `§5.3` wrote survives for the two
 * readers it was written against — `assay oracle` and `assay seal` refuse
 * `--sealed` as a usage error, which is stricter than a read refusal reached
 * only if a call site happens to open the file.
 *
 * **This module is a read and a decode, and it is the boundary M56 leans on.**
 * The record it returns is handed to `bench/scorer.ts` and to nothing else; no
 * `GroundTruth`, no path and no row reaches `AgentInput`, an emitted artifact or
 * a printed line. `PREREGISTRATION.md §10` **V31** states the residual: `AL5`'s
 * guarantee now rests on that emission boundary rather than on the guard.
 *
 * **The decode is a check, not an `S0` transform.** `RECONCILIATION_SPEC.md §2`'s
 * five steps are over *source data*; ground truth is the generator's own output,
 * is never ingested and reaches no agent. What happens below is what
 * `artifacts/gate.ts` already does for the `§5.3` join — *"this checks the two
 * fields the join dereferences so that a malformed record fails loudly here"* —
 * widened to the fields the scorer dereferences, so a truncated or mistyped
 * record stops the run instead of producing a metric taken over a short journal.
 */

/** What one malformed record is called in a refusal. */
const WHAT = "ground truth record";

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function arrayField(record: Record<string, unknown>, field: string, where: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new TypeError(`${where}: ${field} must be an array (DATA_MODEL.md §1).`);
  }
  return value;
}

function stringField(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`${where}: ${field} must be a non-empty string (DATA_MODEL.md §1).`);
  }
  return value;
}

function integerField(record: Record<string, unknown>, field: string, where: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(
      `${where}: ${field} must be a safe integer. DECISION_BRIEF.md §L.1 rule 1 admits no ` +
        `floating point anywhere, JSON included.`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// One record
// ---------------------------------------------------------------------------

/**
 * Read one `ground_truth.jsonl` line into the `GroundTruth` the scorer consumes.
 *
 * **Exactly the fields the scorer dereferences are checked, and every one of
 * them is checked.** `truth.ts`'s `scoringTruth` reads `allocations`,
 * `bank_mappings` and `true_journal`; its `degradationPopulations` reads
 * `degradations`; `seed` is read below, to refuse a directory whose records came
 * from two datasets. `account` is matched against `packages/domain`'s own
 * `isAccountCode` rather than merely typed as a string: `§4.4`'s projections
 * index a per-account total by it, and an unknown code would reach a metric as a
 * silent `NaN` rather than as a refusal.
 *
 * **The record is returned as it was read.** `GroundTruth`'s `Paise` and
 * `FamilyId` are brands the generator minted and JSON does not carry, so the
 * value crosses back into the type here, at the decode boundary, after the
 * checks above — the same shape `artifacts/gate.ts` gives its own narrower
 * projection. No field is renamed, defaulted, normalized or dropped.
 */
export function readGroundTruthRecord(value: unknown): GroundTruth {
  const record = asObject(value, WHAT);
  integerField(record, "seed", WHAT);

  for (const [index, row] of arrayField(record, "allocations", WHAT).entries()) {
    const where = `${WHAT} allocations[${String(index)}]`;
    const allocation = asObject(row, where);
    stringField(allocation, "settlement_id", where);
    stringField(allocation, "entity_id", where);
  }

  for (const [index, row] of arrayField(record, "bank_mappings", WHAT).entries()) {
    const where = `${WHAT} bank_mappings[${String(index)}]`;
    const mapping = asObject(row, where);
    stringField(mapping, "bank_line_id", where);
    for (const [at, settlementId] of arrayField(mapping, "settlement_ids", where).entries()) {
      if (typeof settlementId !== "string" || settlementId === "") {
        throw new TypeError(`${where}: settlement_ids[${String(at)}] must be a non-empty string.`);
      }
    }
  }

  arrayField(record, "ledger_mappings", WHAT);

  for (const [index, row] of arrayField(record, "true_journal", WHAT).entries()) {
    const where = `${WHAT} true_journal[${String(index)}]`;
    const line = asObject(row, where);
    stringField(line, "source_entity_id", where);
    const account = stringField(line, "account", where);
    if (!isAccountCode(account)) {
      throw new TypeError(
        `${where}: account ${JSON.stringify(account)} is not one of DATA_MODEL.md §17's ` +
          `codes. EVALUATION_SPEC.md §4.4 sums a per-account total keyed by it, so an ` +
          `unrecognised code is refused rather than summed into an account that does not exist.`,
      );
    }
    integerField(line, "dr_paise", where);
    integerField(line, "cr_paise", where);
  }

  for (const [index, row] of arrayField(record, "degradations", WHAT).entries()) {
    const where = `${WHAT} degradations[${String(index)}]`;
    const degradation = asObject(row, where);
    stringField(degradation, "op", where);
    stringField(degradation, "target_id", where);
    asObject(degradation["params"], `${where}.params`);
  }

  return record as unknown as GroundTruth;
}

// ---------------------------------------------------------------------------
// One dataset
// ---------------------------------------------------------------------------

/**
 * The `(split, seed)` dataset's ground truth, as one record.
 *
 * `assay generate` writes **one line per family**: `DATA_MODEL.md §22.2` M42
 * makes the dataset artifact unit `(split, seed)` and family a *composition*
 * dimension of it, so `observations.jsonl` and `ground_truth.jsonl` are both
 * concatenations. Every truth-side quantity the scorer takes is defined over
 * that dataset and not over a family:
 *
 *   - M52's `matched clean control` is *"observations in the **same (split,
 *     seed) dataset** ... appearing in **no** `degradations` record"*. Projecting
 *     one family's record against the whole observation set would read another
 *     family's degraded rows as clean, which is the one reading that would make
 *     metric 16's denominator wrong without making it fail.
 *   - `§4.4`'s `proj_truth` sums `true_journal` lines *"whose `source_entity_id`
 *     belongs to a covered observation"*, over the run — which is the dataset.
 *
 * So the four lists are concatenated in file order and handed to
 * `packages/eval` **once**. The projection itself is untouched: this function
 * assembles a dataset, and `degradationPopulations` remains the only thing that
 * decides what `injected` and `control` are.
 *
 * **The scalar fields are carried from the first record and are read by
 * nothing here.** `GroundTruth` requires `gt_version`, `seed`, `family_id` and
 * `true_balances`; `truth.ts` projects none of them — it says so in terms about
 * `true_balances`, which is *"the whole-run projection"* and would restore the
 * formula `§4.4` amends. `seed` is checked for agreement across the records
 * rather than trusted, because a directory holding two seeds' truth is a dataset
 * defect and not a larger dataset.
 */
export function datasetGroundTruth(
  records: readonly GroundTruth[],
  path: string,
): GroundTruth {
  const [first] = records;
  if (first === undefined) {
    throw new CliError(
      `${path} holds no ground-truth record. A scored unit on this split reads §4.4's ` +
        `true journal and M52's degradations from it, and an absent answer key is a stop ` +
        `condition rather than a metric taken over an empty truth.`,
      EXIT.FAILURE,
    );
  }
  for (const record of records) {
    if (record.seed !== first.seed) {
      throw new CliError(
        `${path} holds records for seeds ${String(first.seed)} and ${String(record.seed)}. ` +
          `DATA_MODEL.md §22.2 M42 makes the dataset artifact unit (split, seed); truth from ` +
          `two datasets is a defect in the directory, not a wider dataset.`,
        EXIT.FAILURE,
      );
    }
  }
  return Object.freeze({
    ...first,
    allocations: Object.freeze(records.flatMap((r) => [...r.allocations])),
    bank_mappings: Object.freeze(records.flatMap((r) => [...r.bank_mappings])),
    ledger_mappings: Object.freeze(records.flatMap((r) => [...r.ledger_mappings])),
    true_journal: Object.freeze(records.flatMap((r) => [...r.true_journal])),
    degradations: Object.freeze(records.flatMap((r) => [...r.degradations])),
  });
}

/**
 * Read one `(split, seed)` dataset's ground truth, through `AL2`'s one zone.
 *
 * No policy argument: `M56` removed `GuardPolicy` rather than leaving the caller
 * a flag the guard ignores. What a caller may do with the record is an emission
 * question, and it is answered where the emission happens.
 */
export function loadGroundTruth(path: string): GroundTruth {
  const records = decodeJsonl(
    { path, zone: "GENERATOR_TRUST" },
    { parse: readGroundTruthRecord },
  );
  return datasetGroundTruth(records, path);
}
