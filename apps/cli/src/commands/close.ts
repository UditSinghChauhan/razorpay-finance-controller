import { UnavailableStageError } from "../errors.js";
import type { Command } from "./types.js";

/**
 * `assay close` — attempt the period close.
 *
 * `RECONCILIATION_SPEC.md §10.1` defines five gates and `§10.2` three outcomes;
 * `DECISION_BRIEF.md §L.1` rule 7 fixes the consequence: *"The period ends
 * `CLOSED`, `OPEN` or `BLOCKED`. A close report is emitted for the first two and
 * **never** for `BLOCKED`."*
 *
 * The gate is `packages/ledger` Layer B's. `DECISION_BRIEF.md §L.2` lists
 * `close-gate.ts` and `close.ts` among that package's Layer B modules, and the
 * package's own header records their status: *"`close-gate.ts` and `close.ts`
 * follow, and are **deliberately absent rather than stubbed**."*
 *
 * **Why no part of it is computed here.** `G3` reads journal lines against
 * `Decision` and `Exception` records over one universe — *"two stores, one
 * identity"* — and `§10.1` records that four mutually inconsistent readings of
 * *"an item"* were available before spec 1.4.0 settled it on
 * `JournalLine.source_entity_id`, *"each giving a different partition and
 * therefore a different value of frozen metric 13"*. A second implementation of
 * that partition, in a package the specification did not assign it to, is
 * exactly the drift the ratification exists to prevent. `G5`'s
 * `invariants_failed` reaches the gate only on a `ValidatedDecision`, which
 * `§L.1` rule 4 lets only `packages/engine/src/s5-validate.ts` construct.
 *
 * Rule 7's *"never for `BLOCKED`"* is therefore also not enforced here: there is
 * no outcome to act on. Enforcing it is `close.ts`'s, alongside the gate that
 * produces the outcome.
 */
// The context is unused: a command that reports its blocker reads nothing
// and writes nothing, and `Command.run` admits a nullary implementation.
async function run(): Promise<void> {
  throw new UnavailableStageError(
    "close",
    "packages/ledger (Layer B close gate)",
    "DECISION_BRIEF.md §L.2; RECONCILIATION_SPEC.md §10.1",
    `close-gate.ts and close.ts are "deliberately absent rather than stubbed" in that ` +
      `package, so G1-G5 has no implementation to call. Computing any gate in apps/cli would ` +
      `create a second reading of §10.1's item partition, which spec 1.4.0 settled precisely ` +
      `because four incompatible readings each gave a different value of frozen metric 13.`,
  );
}

export const closeCommand: Command = {
  name: "close",
  summary: "Attempt gates G1-G5 and emit the close report (CLOSED / OPEN; never for BLOCKED).",
  flags: {
    run: { kind: "string", describe: "The runs/<run_id> directory to close." },
  },
  run,
};
