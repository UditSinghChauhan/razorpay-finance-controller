/**
 * `LedgerStore` — the persistence port the single mutating write path commits
 * through, and the reason `write.ts` needs no I/O of its own.
 *
 * **Why a port rather than a database handle.** `ARCHITECTURE.md §8` fixes the
 * physical store — *"SQLite, single file, WAL mode, via `better-sqlite3`"* — and
 * `better-sqlite3` is in no manifest in this workspace. `ARCHITECTURE.md §3`
 * gives `apps/cli` **"all filesystem I/O"**, and opening a database file is
 * filesystem I/O, so the driver could not live in this package even if it were
 * installed. `apps/cli/src/commands/verify.ts` already holds that position for
 * the read direction: it reports the SQLite reader as blocked *"rather than
 * inventing a reader"*, while `packages/ledger`'s `sealStoredEvent` validates
 * whatever bytes the CLI hands back.
 *
 * This module is that same split in the write direction, and it is the fourth
 * time the repository draws it. Spec 1.4.18 gave `S0` to `packages/domain` over
 * bytes `apps/cli` had already read; `ARCHITECTURE.md §3` makes `packages/probe`
 * *"pure and I/O-free, so the caller owns the read and the append"*; and
 * `packages/llm`'s replay provider *"performs no filesystem I/O … it is handed
 * an already-loaded map"*. What `packages/ledger` owns is the **mutation
 * boundary and its semantics** — which type may be posted, what event that
 * becomes, where it links in the chain, and what may not be posted twice.
 * `ARCHITECTURE.md §3` states the test: append-only semantics and the
 * trial-balance invariant are *"properties of this package, not conventions its
 * callers must remember"*. A caller cannot dodge them by supplying a different
 * adapter, because an adapter is handed **sealed events it did not construct**
 * and is given no way to make one.
 *
 * **Nothing here reads.** A store that could hand events back would be a second
 * route into the chain's contents, and `verifyChain` already exists for that
 * question over records the caller has loaded. The port writes.
 */

import type { Sha256 } from "@assay/domain";

import type { LedgerEvent, RunId } from "./events.js";

/**
 * One indivisible unit of persistence.
 *
 * Every field is derived from the chain after the append, so an adapter needs no
 * knowledge of `DATA_MODEL.md §16` to store it: the events already carry `seq`,
 * `prev_hash` and `hash`, and `§8`'s `journal_line` rows denormalise from
 * `LedgerEvent.journal_lines`.
 */
export interface LedgerCommit {
  /** `§16`: sequence numbers are "gapless, per run". Every event here is that run's. */
  readonly run_id: RunId;

  /** The chain's genesis, so an adapter can key a run without a second lookup. */
  readonly genesis_hash: Sha256;

  /**
   * The events this write appended, in chain order. Never empty.
   *
   * The write path of `write.ts` always commits exactly one — `ARCHITECTURE.md
   * §8`: *"one event per decision or state change"* — and the field is a list
   * because that is what makes "all or nothing" a statement about a unit rather
   * than about a single row.
   */
  readonly events: readonly LedgerEvent[];

  /**
   * The chain's root hash after the append: the last event's `hash`.
   *
   * `runs/<run_id>/ledger_root_hash.txt` (`ARCHITECTURE.md §8`) and gate `G4`
   * both read it, and recomputing it inside an adapter would be a second
   * implementation of `hash-chain.ts`'s contract.
   */
  readonly root_hash: Sha256;
}

/** The one thing a persistence adapter must be able to do. */
export interface LedgerStore {
  /**
   * Durably record `unit` as one indivisible act: **every event or none**.
   *
   * The obligations, stated because an adapter that meets them is what makes
   * `ARCHITECTURE.md §4` boundary 3's *"prevents partial writes"* true:
   *
   * 1. **Atomic.** A `commit` that returns has stored the whole unit; a
   *    `commit` that throws has stored none of it and has left the store
   *    exactly as it was. `§8` chose SQLite for *"a hard requirement for
   *    transactional append"*, so the adapter has a transaction to use.
   * 2. **Append-only.** Nothing is updated and nothing is deleted
   *    (`ARCHITECTURE.md §8`); a correction is a new event.
   * 3. **Throw to refuse.** The return type is `void` because a boolean would
   *    let a caller ignore a failed write. The write path treats a throw as the
   *    whole post failing and does not advance its state.
   *
   * **Synchronous, deliberately.** `better-sqlite3` is a synchronous driver and
   * every stage in this workspace is synchronous, but the binding reason is the
   * chain: `seq` and `prev_hash` are the chain's to assign, so two appends taken
   * from one state must not be in flight at once. A `Promise` here would make
   * that interleaving expressible.
   *
   * @throws whatever the adapter raises. The write path does not wrap it: the
   * caller supplied the adapter and can recognise its failures.
   */
  commit(unit: LedgerCommit): void;
}
