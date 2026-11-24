/**
 * `ValidatedProbeEvent` — the probe → ledger boundary type (`ARCHITECTURE.md §4`
 * boundary 3's dated addition of 2026-11-25; register row `DATA_MODEL.md §22.2`
 * **M65**).
 *
 * `ARCHITECTURE.md §6`'s chain diagram ends *"`packages/ledger` appends the
 * `PROBE` event body `packages/probe` assembled"*, and `§4` boundary 3 said the
 * package exposes *"exactly one mutating function, and it accepts only a
 * `ValidatedDecision`"*. The two sentences contradicted each other, nothing
 * appended a `PROBE` event, and the loop's events were dropped
 * (`PREREGISTRATION.md §10` **V42**). M65 resolves the contradiction with a
 * second, narrow entry point — `postProbeEvent` — which takes **only** this
 * type.
 *
 * **What the type says, at compile time.** A `PROBE` event moves no money and
 * decides nothing: `journal_lines` is the empty tuple, `certificate` and
 * `decision_id` are `null`, and `kind` is the literal `"PROBE"`. A value that
 * could carry a posting, an abstention or a decision does not inhabit it.
 * `postProbeEvent` re-checks all four at runtime anyway, because a value that
 * crossed a cast is the case a type cannot see.
 *
 * **Construction authority: `packages/probe/src/event.ts`, exclusively** — the
 * pattern `validated-decision.ts` runs for `S5`. The brand below is a
 * **non-exported** unique symbol, this package exports no constructor, and the
 * single widening assertion lives in `packages/probe`'s `probeEventBody`, which
 * builds the body only from a validated call **and** the result that answered
 * it. `packages/probe/tests/discipline.test.ts` counts that widening across the
 * workspace, as `packages/engine`'s suite counts `ValidatedDecision`'s.
 *
 * **Declaration site is forced, as `ValidatedDecision`'s was.** The entry point
 * is in this package, so its parameter's type must be nameable here, and
 * `packages/ledger` cannot import `packages/probe`, which depends on it.
 */

import type { Sha256 } from "@assay/domain";

import type { EvidenceId } from "./events.js";

/**
 * The nominal brand key. **Never exported.** `declare const` emits no runtime
 * value; it exists so that structural typing cannot forge the type.
 */
declare const PROBE_EVENT_BRAND: unique symbol;

/**
 * A `PROBE` event body `packages/probe` minted from an accepted probe result,
 * and the only type `postProbeEvent` accepts.
 *
 * The fields are `DATA_MODEL.md §16`'s body minus what the chain owns (`seq`,
 * `prev_hash`, `hash`) and what the caller stamps (`evt_id`, `ts`, `actor`).
 */
export interface ValidatedProbeEvent {
  /** Nominal identity. Without it the type is structurally inhabitable. */
  readonly [PROBE_EVENT_BRAND]: true;

  readonly kind: "PROBE";

  /** The entity the probe named. Empty for a probe that names none. */
  readonly subject_ids: readonly string[];

  readonly evidence_ids: readonly EvidenceId[];

  /**
   * A probe is not a decision. `null`, always: an event carrying a
   * `decision_id` is indexed by `openWriteState` as that decision's post, and
   * the decision it informed would then be refused as a duplicate.
   */
  readonly decision_id: null;

  /** `§16`: *"hash of everything the step read"* — the call as issued. */
  readonly inputs_hash: Sha256;

  /** A probe asserts no rupee movement. */
  readonly journal_lines: readonly [];

  /** A probe is not an abstention. */
  readonly certificate: null;
}
