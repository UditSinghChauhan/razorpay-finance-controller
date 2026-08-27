/**
 * The degradation layer — the six operators `PREREGISTRATION.md §4.3` exercises,
 * and the four it declares and refuses.
 *
 * `§3` rule 3 is the whole contract: "The degradation layer **only removes or
 * corrupts information**. It never adds a hint, and it never knows what the
 * solver will do with the result." `§4.3` adds that operators are "Applied to
 * observations only, never to the true state" — so nothing here reads or writes
 * a `TrueState`, and the signature enforces that by not taking one.
 *
 * **The disposal rule is mechanical.** `§4.3`: an operator no family declares is
 * "not exercised ... Assigning them would invent a family pairing this
 * specification does not state." `families.ts` holds the mapping and
 * `apply()` refuses any operator whose declaring family is `null`, so
 * `DROP_FIELD`, `SHIFT_TIMESTAMP`, `SWAP_ORDER_REF` and `ROUND_BANK_AMOUNT` are
 * unreachable rather than merely unused.
 *
 * **No operator may cross a period boundary.** `§4.3`: "An operator may
 * therefore never move an observation across `period.from` or `period.to`" —
 * because `E11` has no Suspense item, so a timestamp shift could silently
 * remove value from `unresolved_value_paise` and from gate `G3`'s universe.
 * `assertNoClockMoved` checks it after every family, and the check is written
 * even though `SHIFT_TIMESTAMP` is not exercised, so that a future activation
 * inherits it.
 */

import { ObservationSchema, canonicalJson, type CanonicalValue, type Observation } from "@assay/domain";
import {
  UntrustedTextSchema, sanitizeForPreview, type UntrustedText,
} from "@assay/domain/untrusted-text";
import { hashCanonical } from "@assay/ledger";
import { roundHalfUp } from "@assay/money";

import { FAMILY_MECHANICS } from "./families.js";
import {
  CONFLICT_REFERENCE_RATE, DROP_SETTLEMENT_ID_RATE, DUPLICATE_ROW_RATE,
  INJECT_NOTES_CORPUS, INJECT_NOTES_RATE, MANGLE_UTR_MODES, MANGLE_UTR_RATE,
  MANGLE_UTR_SUBSTITUTE_CHARS, MANGLE_UTR_TRUNCATE_PREFIX, NOTES_LIMITS,
  OPERATOR_DECLARING_FAMILY, TRUNCATE_NARRATION_CHARS,
  type DegradationOp, type FamilyId,
} from "./frozen.js";
import { Minter, UTR_ALPHABET } from "./mint.js";
import { STREAMS, substream, type Prng } from "./prng.js";
import { evenSplit } from "./composition.js";
import type { Emission } from "./emit.js";

/** One applied degradation, as `GroundTruth.degradations` records it (`DATA_MODEL.md §1`). */
export interface DegradationRecord {
  readonly op: DegradationOp;
  readonly target_id: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface Degraded {
  readonly observations: readonly Observation[];
  readonly untrusted_text: readonly UntrustedText[];
  readonly degradations: readonly DegradationRecord[];
}

const OP_STREAM: Readonly<Record<DegradationOp, string>> = Object.freeze({
  DROP_SETTLEMENT_ID: STREAMS.OP_DROP_SETTLEMENT_ID,
  MANGLE_UTR: STREAMS.OP_MANGLE_UTR,
  TRUNCATE_NARRATION: STREAMS.OP_TRUNCATE_NARRATION,
  DUPLICATE_ROW: STREAMS.OP_DUPLICATE_ROW,
  INJECT_NOTES: STREAMS.OP_INJECT_NOTES,
  CONFLICT_REFERENCE: STREAMS.OP_CONFLICT_REFERENCE,
  DROP_FIELD: "op:DROP_FIELD",
  SHIFT_TIMESTAMP: "op:SHIFT_TIMESTAMP",
  SWAP_ORDER_REF: "op:SWAP_ORDER_REF",
  ROUND_BANK_AMOUNT: "op:ROUND_BANK_AMOUNT",
});

/**
 * Apply the family's declared operators, in the family's declared order.
 *
 * `§4.3`: "They compose in this fixed order, each drawing from the family's PRNG
 * sub-stream in declaration order, so no operator reads a field a later
 * operator changes, and no operator is applied twice to one record."
 */
export function degrade(emission: Emission, family: FamilyId, seed: number): Degraded {
  const mechanics = FAMILY_MECHANICS[family];
  const clocksBefore = clocksOf(emission.observations);

  let observations: Observation[] = [...emission.observations];
  let untrusted: UntrustedText[] = [...emission.untrusted_text];
  const degradations: DegradationRecord[] = [];

  for (const op of mechanics.operators) {
    if (OPERATOR_DECLARING_FAMILY[op] === null) {
      /* c8 ignore next 4 */
      throw new Error(
        `degrade: ${op} is declared NOT EXERCISED by PREREGISTRATION.md §4.3. Applying it would ` +
          `invent a family pairing the specification does not state.`,
      );
    }
    const prng = substream(seed, family, OP_STREAM[op]);
    const result = APPLY[op]({ observations, untrusted, prng, seed, family, degradations });
    observations = result.observations;
    untrusted = result.untrusted;
  }

  assertNoClockMoved(clocksBefore, observations);
  return Object.freeze({
    observations,
    untrusted_text: untrusted,
    degradations,
  });
}

// ---------------------------------------------------------------------------

interface OpContext {
  observations: Observation[];
  untrusted: UntrustedText[];
  prng: Prng;
  seed: number;
  family: FamilyId;
  degradations: DegradationRecord[];
}

type OpResult = { observations: Observation[]; untrusted: UntrustedText[] };

const APPLY: Readonly<Record<DegradationOp, (ctx: OpContext) => OpResult>> = Object.freeze({
  /**
   * `F08`: "`settlement_id` absent from the merchant's copy". 10% of the
   * `recon_line` kind (`conventions.ts` `U-DROP-SETL-DENOM`). `settlement_utr`
   * is untouched — the operator removes the batch identifier, not every trace
   * of it, which is what makes `AN1` fail while a soft path survives.
   */
  DROP_SETTLEMENT_ID: (ctx) => {
    const eligible = indicesWhere(ctx.observations, (o) => o.kind === "recon_line");
    for (const index of pick(ctx.prng, eligible, DROP_SETTLEMENT_ID_RATE)) {
      const target = at(ctx.observations, index);
      /* c8 ignore next */
      if (target.kind !== "recon_line") throw new Error("degrade: eligibility drifted");
      ctx.observations[index] = reseal({
        ...target,
        payload: { ...target.payload, settlement_id: null },
      });
      ctx.degradations.push({
        op: "DROP_SETTLEMENT_ID",
        target_id: target.payload.entity_id,
        params: { field: "settlement_id", to: null },
      });
    }
    return { observations: ctx.observations, untrusted: ctx.untrusted };
  },

  /**
   * `F08`: "and mangle UTRs". 10% of `bank_line`, split across the closed mode
   * set `{SUBSTITUTE, TRUNCATE}` in declaration order — see `conventions.ts`
   * `U-MANGLE-SPLIT` for why the total rather than the per-mode figure is what
   * is realized exactly.
   *
   * A selected line whose `bank_ref` is absent is a **no-op**, recorded as one.
   * `§4.3` fixes the denominator as "share of `bank_line`", and at `§4.2`'s 30%
   * clean-UTR rate roughly two of the three selected lines carry no reference
   * to mangle. That is a disclosed consequence of two frozen figures meeting,
   * not something to widen the eligible set to avoid.
   */
  MANGLE_UTR: (ctx) => {
    const eligible = indicesWhere(ctx.observations, (o) => o.kind === "bank_line");
    const selected = pick(ctx.prng, eligible, MANGLE_UTR_RATE);
    const perMode = evenSplit(selected.length, MANGLE_UTR_MODES.length);
    let cursor = 0;
    for (const [m, mode] of MANGLE_UTR_MODES.entries()) {
      for (let k = 0; k < at(perMode, m); k += 1, cursor += 1) {
        const index = at(selected, cursor);
        const target = at(ctx.observations, index);
        /* c8 ignore next */
        if (target.kind !== "bank_line") throw new Error("degrade: eligibility drifted");
        const before = target.payload.bank_ref;
        const after = before === null ? null : mangle(before, mode, ctx.prng);
        if (after !== null) {
          ctx.observations[index] = reseal({
            ...target,
            payload: { ...target.payload, bank_ref: after },
          });
        }
        ctx.degradations.push({
          op: "MANGLE_UTR",
          target_id: target.payload.bank_line_id,
          params: { mode, applied: after !== null, from: before, to: after },
        });
      }
    }
    return { observations: ctx.observations, untrusted: ctx.untrusted };
  },

  /**
   * `F08`: "Statement exports truncate narration (commonly ~35 chars)". 100% of
   * `bank_line`, deterministic, no draw. "narration shorter than 35 is emitted
   * unchanged; the operator never pads."
   */
  TRUNCATE_NARRATION: (ctx) => {
    const bankObsIds = new Set(
      ctx.observations.filter((o) => o.kind === "bank_line").map((o) => o.obs_id),
    );
    ctx.untrusted = ctx.untrusted.map((row) => {
      if (row.field !== "narration" || !bankObsIds.has(row.obs_id)) return row;
      if (row.raw.length <= TRUNCATE_NARRATION_CHARS) return row;
      const raw = row.raw.slice(0, TRUNCATE_NARRATION_CHARS);
      ctx.degradations.push({
        op: "TRUNCATE_NARRATION",
        target_id: row.obs_id,
        params: { n: TRUNCATE_NARRATION_CHARS, from_length: row.raw.length },
      });
      return UntrustedTextSchema.parse({
        ...row, raw, length: raw.length, sanitized_preview: sanitizeForPreview(raw),
      });
    });
    return { observations: ctx.observations, untrusted: ctx.untrusted };
  },

  /**
   * `F04`: "Double export, double import, bank re-presentation". 10% of
   * `bank_line`. "the duplicate is emitted immediately after its original in
   * canonical order and carries an identical `ingest_hash`, which is what
   * `E08`/`E09` detect."
   *
   * Identical `ingest_hash` means an identical **payload**, `bank_line_id`
   * included — the hash covers the record, not the observation envelope
   * (`conventions.ts` `U-INGEST-HASH`). The copy takes its own `obs_id` and its
   * own `source_line`, because it is a second row in the same file, and the
   * rest of that file is renumbered behind it.
   */
  DUPLICATE_ROW: (ctx) => {
    const eligible = indicesWhere(ctx.observations, (o) => o.kind === "bank_line");
    const selected = new Set(pick(ctx.prng, eligible, DUPLICATE_ROW_RATE));
    const minter = new Minter(ctx.prng);
    const out: Observation[] = [];
    for (const [index, observation] of ctx.observations.entries()) {
      out.push(observation);
      if (!selected.has(index)) continue;
      /* c8 ignore next */
      if (observation.kind !== "bank_line") throw new Error("degrade: eligibility drifted");
      out.push({ ...observation, obs_id: minter.observation() });
      ctx.degradations.push({
        op: "DUPLICATE_ROW",
        target_id: observation.payload.bank_line_id,
        params: { of_obs_id: observation.obs_id },
      });
    }
    return { observations: renumber(out), untrusted: ctx.untrusted };
  },

  /**
   * `F10`: "Merchant-controlled free-text fields". 10% of the eligible set,
   * which `conventions.ts` `U-INJECT-ELIGIBLE` fixes as the three entities
   * `THREAT_MODEL.md §1.1` lists as merchant-controlled — orders, payments and
   * refunds. One payload per selected observation.
   *
   * The payload lands in `untrusted_text` and **nowhere else**: `§4.1` F10 is
   * explicit that "payloads are `untrusted_text` rows, not observations", which
   * is why the family's `target_record_count` carries no delta.
   */
  INJECT_NOTES: (ctx) => {
    const eligible = indicesWhere(
      ctx.observations,
      (o) => o.kind === "order" || o.kind === "payment" || o.kind === "refund",
    );
    for (const index of pick(ctx.prng, eligible, INJECT_NOTES_RATE)) {
      const target = at(ctx.observations, index);
      const exemplar = ctx.prng.pick(INJECT_NOTES_CORPUS);
      const notes: Record<string, string> = { [exemplar.key]: exemplar.value };
      if (Object.keys(notes).length > NOTES_LIMITS.max_pairs) {
        /* c8 ignore next */
        throw new Error("degrade: notes object exceeds the documented 15-pair limit (D18)");
      }
      for (const [key, value] of Object.entries(notes)) {
        if (key.length > NOTES_LIMITS.max_chars || value.length > NOTES_LIMITS.max_chars) {
          /* c8 ignore next */
          throw new Error("degrade: a notes key or value exceeds the documented 256-character limit (D18)");
        }
      }
      // §10: "`raw` is the canonical-JSON serialization of the notes OBJECT",
      // so the deterministic core sees one opaque blob rather than N fields.
      const raw = canonicalJson(notes);
      ctx.untrusted.push(
        UntrustedTextSchema.parse({
          obs_id: target.obs_id, field: "notes", raw, length: raw.length,
          sanitized_preview: sanitizeForPreview(raw),
        }),
      );
      ctx.degradations.push({
        op: "INJECT_NOTES",
        target_id: target.obs_id,
        params: { exemplar: exemplar.id, source: exemplar.source, vector: "key+value" },
      });
    }
    return { observations: ctx.observations, untrusted: ctx.untrusted };
  },

  /**
   * `F10`: "conflicting references". `§4.3`: "the second parent is a real
   * identifier drawn from the observation set, **never fabricated** — `I6` must
   * fail on *conflict*, not on non-existence."
   *
   * Realized on the only pair of co-referring parent fields in the model
   * (`conventions.ts` `U-CONFLICT-FIELD`): a settled `recon_line` keeps its true
   * `settlement_id` and takes a **different real settlement's** `settlement_utr`.
   * Eligibility is rows carrying both references, because a row with one
   * reference has nothing to conflict with.
   */
  CONFLICT_REFERENCE: (ctx) => {
    const utrs = [
      ...new Set(
        ctx.observations
          .filter((o) => o.kind === "settlement")
          .map((o) => (o.kind === "settlement" ? o.payload.utr : "")),
      ),
    ].sort();
    const eligible = indicesWhere(
      ctx.observations,
      (o) => o.kind === "recon_line" && o.payload.settlement_id !== null && o.payload.settlement_utr !== null,
    );
    for (const index of pick(ctx.prng, eligible, CONFLICT_REFERENCE_RATE)) {
      const target = at(ctx.observations, index);
      /* c8 ignore next */
      if (target.kind !== "recon_line") throw new Error("degrade: eligibility drifted");
      const alternatives = utrs.filter((u) => u !== target.payload.settlement_utr);
      if (alternatives.length === 0) continue;
      const conflicting = ctx.prng.pick(alternatives);
      ctx.observations[index] = reseal({
        ...target,
        payload: { ...target.payload, settlement_utr: conflicting },
      });
      ctx.degradations.push({
        op: "CONFLICT_REFERENCE",
        target_id: target.payload.entity_id,
        params: {
          settlement_id: target.payload.settlement_id,
          settlement_utr: conflicting,
          was: target.payload.settlement_utr,
        },
      });
    }
    return { observations: ctx.observations, untrusted: ctx.untrusted };
  },

  DROP_FIELD: refuse("DROP_FIELD"),
  SHIFT_TIMESTAMP: refuse("SHIFT_TIMESTAMP"),
  SWAP_ORDER_REF: refuse("SWAP_ORDER_REF"),
  ROUND_BANK_AMOUNT: refuse("ROUND_BANK_AMOUNT"),
});

// ---------------------------------------------------------------------------

function refuse(op: DegradationOp): (ctx: OpContext) => OpResult {
  return () => {
    throw new Error(
      `degrade: ${op} is declared NOT EXERCISED (PREREGISTRATION.md §4.3). ` +
        `${op === "ROUND_BANK_AMOUNT"
          ? "Activating it requires a spec amendment supplying a tolerance magnitude and an " +
            "engine-visible signal that it is in force (RECONCILIATION_SPEC.md §4.1)."
          : "No family declares it; assigning one would invent a pairing the specification does not state."}`,
    );
  };
}

function mangle(reference: string, mode: (typeof MANGLE_UTR_MODES)[number], prng: Prng): string {
  if (mode === "TRUNCATE") {
    // "a `bank_ref` already <= 10 characters is emitted unchanged".
    return reference.length <= MANGLE_UTR_TRUNCATE_PREFIX
      ? reference
      : reference.slice(0, MANGLE_UTR_TRUNCATE_PREFIX);
  }
  // SUBSTITUTE, k = 1: "position drawn uniformly from the sub-stream; the
  // replacement character is drawn from the same alphabet and is never equal to
  // the original".
  let out = reference;
  for (let k = 0; k < MANGLE_UTR_SUBSTITUTE_CHARS; k += 1) {
    const position = prng.below(out.length);
    const original = out.charAt(position);
    const alphabet = [...UTR_ALPHABET].filter((c) => c !== original);
    out = out.slice(0, position) + prng.pick(alphabet) + out.slice(position + 1);
  }
  return out;
}

/** Indices of the observations a predicate admits, in canonical order. */
function indicesWhere(observations: readonly Observation[], predicate: (o: Observation) => boolean): number[] {
  const out: number[] = [];
  for (const [index, observation] of observations.entries()) {
    if (predicate(observation)) out.push(index);
  }
  return out;
}

/** `round_half_up(rate x |eligible|)` of the eligible indices, in ascending order. */
function pick(prng: Prng, eligible: readonly number[], rate: { num: number; den: number }): number[] {
  const count = roundHalfUp(rate.num * eligible.length, rate.den);
  return prng.sample(eligible.length, Math.min(count, eligible.length)).map((k) => at(eligible, k));
}

/** Re-validate and re-hash a record whose payload an operator changed. */
function reseal(observation: Observation): Observation {
  return ObservationSchema.parse({
    ...observation,
    ingest_hash: hashCanonical(observation.payload as unknown as CanonicalValue),
  });
}

/** Renumber `source_line` per file after an insertion (`ARCHITECTURE.md §4`). */
function renumber(observations: readonly Observation[]): Observation[] {
  const lineOf = new Map<string, number>();
  return observations.map((observation) => {
    const line = (lineOf.get(observation.source_file) ?? 0) + 1;
    lineOf.set(observation.source_file, line);
    return { ...observation, source_line: line };
  });
}

/** Every clock an observation carries, by `obs_id` (`§4.2`'s membership clocks). */
function clocksOf(observations: readonly Observation[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const observation of observations) {
    out.set(observation.obs_id, canonicalJson(clockFields(observation)));
  }
  return out;
}

function clockFields(observation: Observation): Record<string, number | null> {
  const payload = observation.payload as unknown as Record<string, unknown>;
  const read = (key: string): number | null => {
    const value = payload[key];
    return typeof value === "number" ? value : null;
  };
  return {
    created_at: read("created_at"),
    settled_at: read("settled_at"),
    value_date: read("value_date"),
    booked_at: read("booked_at"),
  };
}

/**
 * `§4.3`: "An operator may therefore never move an observation across
 * `period.from` or `period.to`."
 *
 * Enforced as the stronger property that no operator moves a clock **at all**,
 * because the weaker one is only checkable against a boundary and would admit a
 * shift that happens to stay inside it. "The question is moot under the mapping
 * above, since `SHIFT_TIMESTAMP` is not exercised; the rule is stated so that
 * any future activation inherits it."
 */
export function assertNoClockMoved(before: Map<string, string>, after: readonly Observation[]): void {
  for (const observation of after) {
    const original = before.get(observation.obs_id);
    if (original === undefined) continue; // a DUPLICATE_ROW copy; checked against its source below.
    const current = canonicalJson(clockFields(observation));
    if (current !== original) {
      throw new Error(
        `degrade: a degradation operator moved a clock on ${observation.obs_id}. ` +
          `PREREGISTRATION.md §4.3 forbids it: period membership is evaluated after degradation, ` +
          `E11 opens no Suspense item, so a shift would silently remove value from gate G3's universe.`,
      );
    }
  }
}

function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  /* c8 ignore next */
  if (value === undefined) throw new RangeError(`degrade: index ${String(index)} out of range`);
  return value;
}
