import { AMBIGUITY_LABELS, type AmbiguityLabel, type OracleLabel } from "@assay/oracle";

import { decodeJsonl } from "./jsonl.js";

/**
 * Reading `bench/<split>/<seed>/oracle_labels.jsonl` **for the scorer**.
 *
 * `EVALUATION_SPEC.md §2` defines a scored unit as `score(agent output, ground
 * truth, **oracle labels**)`, and `§4.3` is emphatic about which of the three the
 * ambiguity set comes from: *"Ground truth for 'truly ambiguous' comes from the
 * Ambiguity Oracle (`PREREGISTRATION.md §5`), **not from the generator and not
 * from a label**."* Metric 4 reads that set and metric 8's reference policy
 * *"abstains on exactly the truly-ambiguous set"*, so both need this artifact and
 * neither may reconstruct it.
 *
 * **The labels are read, never regenerated.** `PREREGISTRATION.md §9` step 3
 * produces this file and step 4 hashes it into the manifest; `§5.3` (M51) states
 * the standing rule that *"`oracle_labels.jsonl` is never regenerated, shadowed
 * or overwritten"*. `assay bench` therefore imports no oracle, calls `labelAll`
 * nowhere and holds no `τ` — this module's only import from `@assay/oracle` is
 * the label vocabulary the file is validated against.
 *
 * **No `ReadZone` is involved beyond the ordinary one.** `fs/guard.ts` restricts
 * `ground_truth*.jsonl` and `recon_report*.jsonl` and nothing else; the labels
 * are the oracle's published product, are hashed into `BenchmarkManifest`, and
 * reach the scorer through zone `AGENT` like `observations.jsonl` does. `AL8`'s
 * and `AL2`'s subjects are untouched.
 *
 * **The decode is a check, not a transform.** `packages/oracle` exports
 * `OracleLabel` as an interface rather than a schema, so the fields metric 4 and
 * metric 8 dereference are checked here and the record crosses back into the type
 * at this boundary — the treatment `artifacts/ground-truth.ts` gives the answer
 * key, for the same reason: a truncated or mistyped row must stop the run rather
 * than produce a metric taken over a short label set.
 */

/** What one malformed record is called in a refusal. */
const WHAT = "oracle label record";

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`${where}: ${field} must be a non-empty string.`);
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

/**
 * Read one `oracle_labels.jsonl` line into the `OracleLabel` the scorer consumes.
 *
 * `label` is matched against `packages/oracle`'s own closed vocabulary rather
 * than merely typed as a string: `PREREGISTRATION.md §5.4` puts exactly one of
 * five values in the field, `metrics/abstention.ts` selects `TRULY_AMBIGUOUS`
 * out of it, and an unrecognised value would silently shrink metric 4's
 * denominator and metric 8's reference policy instead of failing.
 */
export function readOracleLabelRecord(value: unknown): OracleLabel {
  const record = asObject(value, WHAT);
  const label = stringField(record, "label", WHAT);
  if (!(AMBIGUITY_LABELS as readonly string[]).includes(label)) {
    throw new TypeError(
      `${WHAT}: label ${JSON.stringify(label)} is not one of PREREGISTRATION.md §5.4's ` +
        `five: ${AMBIGUITY_LABELS.join(", ")}.`,
    );
  }
  stringField(record, "target_id", WHAT);
  stringField(record, "target_kind", WHAT);
  integerField(record, "solution_count", WHAT);
  integerField(record, "max_materiality_paise", WHAT);
  integerField(record, "tau_paise", WHAT);
  return Object.freeze({
    ...(record as unknown as OracleLabel),
    label: label as AmbiguityLabel,
  });
}

/**
 * Read one `(split, seed)` dataset's oracle labels.
 *
 * Unguarded by any `try`: an `oracle_labels.jsonl` the scorer cannot read is a
 * stop condition for a scored unit that reads metric 4 and metric 8, not a metric
 * taken over a smaller ambiguity set. `§9` step 3 is *"a gate, not a formality"*
 * and its output is a precondition of step 7.
 */
export function loadOracleLabels(path: string): readonly OracleLabel[] {
  return decodeJsonl({ path, zone: "AGENT" }, { parse: readOracleLabelRecord });
}
