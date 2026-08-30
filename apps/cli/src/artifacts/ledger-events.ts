import { sealStoredEvent, type LedgerEvent } from "@assay/ledger";

import { decodeJsonl } from "./jsonl.js";

/**
 * Loading a run's Layer A events back off disk.
 *
 * `packages/ledger`'s `sealStoredEvent` is written for exactly this call:
 *
 * > *"Admit an event that already carries its position — one read back from
 * > storage, **a file**, or an API response. This is the entry point
 * > verification uses. It exists because a stored event is `unknown` no matter
 * > what its TypeScript type says: `verifyChain` is the function that answers
 * > 'was this record altered', so it cannot begin by trusting the record's
 * > shape."*
 *
 * So the validation is `packages/ledger`'s and the read is this package's, which
 * is the split `ARCHITECTURE.md §3` fixes. `apps/cli` does not check a hash, a
 * sequence number or a field: `verifyChain` does that, from the events this
 * function returns.
 *
 * **This is not `ARCHITECTURE.md §8`'s storage.** `§8` puts the event log in
 * `runs/<run_id>/assay.sqlite` via `better-sqlite3`, which is not a dependency
 * of this workspace and cannot be made one here. A `.jsonl` export is the route
 * that exists today; `commands/verify.ts` reports the SQLite one as blocked
 * rather than substituting this for it.
 */
export function loadLedgerEvents(path: string): readonly LedgerEvent[] {
  return decodeJsonl({ path, zone: "AGENT" }, { parse: sealStoredEvent });
}
