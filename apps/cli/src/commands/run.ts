import { requireFlag } from "../args.js";
import { UnavailableStageError } from "../errors.js";
import { buildProvider } from "../providers.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay run` — drive one dataset through the pipeline.
 *
 * This is the command `DECISION_BRIEF.md §C` T0-11's acceptance criterion is
 * about: *"Full pipeline runs from a clean checkout with no API key."* It is
 * **not** met, and the reason is not in `apps/cli`.
 *
 * The provider is selected and constructed below, because that half is real and
 * is this package's: `--llm=offline` builds `packages/llm`'s offline provider
 * with no network and no credential, and `--llm=replay` loads the committed
 * cache and hands it to `ReplayProvider` with `strict` set from `--strict-replay`.
 * Everything after it is blocked, in pipeline order:
 *
 * ```
 *   S0 ingest      packages/domain owns S0's orchestration over source data
 *                  apps/cli has read (ARCHITECTURE.md §3, spec 1.4.18) and
 *                  exports no entry point for it. §3 says so itself: "domain's
 *                  S0 orchestration is SCHEDULED, NOT WRITTEN". apps/cli may
 *                  not perform an S0 transform, so there is nothing to call.
 *
 *   S1 -> S2       packages/engine exports anchor(), generateCandidates(),
 *                  decompose(), solve() and validate(), and NO constructor for
 *                  S2's `Target` or `EvaluationContext` from S1's AnchorResult.
 *                  A Target carries `bank_value_date` -- "the value date of the
 *                  bank line that receives the target's money ... its AN2-matched
 *                  bank line when the target is a settlement" -- and
 *                  `anchored_members`. Both are readings of §3's anchor
 *                  semantics; deriving them here would put S1/S2 semantics in
 *                  apps/cli, which ARCHITECTURE.md §3 forbids.
 *
 *   §6.2 probe     NOT a blocker from spec 1.4.25. R3 is built (packages/llm
 *                  roles/r3.ts, §H tier H1), packages/generator emits
 *                  recon_report.jsonl (spec 1.4.24), and src/probe/ composes
 *                  §6.6's chain -- dispatch, domain validation, acceptResult,
 *                  re-solve, PROBE event body. It is reachable only once S1->S2
 *                  can hand it a SolveInput, which is the row above.
 *
 *   ledger write   DECISION_BRIEF.md §L.1 rule 4 gives packages/ledger "exactly
 *                  one write path"; that package's header records that the
 *                  mutating write path "is not" implemented, and ARCHITECTURE.md
 *                  §8's SQLite persistence has no dependency in this workspace.
 * ```
 *
 * **No part of that list is worked around here.** `RECONCILIATION_SPEC.md §6.2`
 * makes `packages/probe` *"the ONLY constructor of a probe call, so a caller
 * cannot dispatch around them"*, and the same reasoning applies to every row: a
 * composition root that implements the thing it cannot find has stopped being a
 * composition root.
 */
async function run(context: CommandContext): Promise<void> {
  const dataset = requireFlag(context.args, "dataset");

  // Real work, and the half of T0-11 that does hold: a provider is constructed
  // from configuration alone, with no credential and no network reachable.
  const provider = buildProvider(context.config);
  context.out(`llm_provider        ${provider.id}`);
  context.out(`llm_model_id        ${provider.modelId}`);
  context.out(`requires_network    ${String(provider.requiresNetwork)}`);
  context.out(`metered_cost        ${String(provider.meteredCost)}`);
  context.out(`strict_replay       ${String(context.config.strictReplay)}`);
  context.out(`dataset             ${dataset}`);

  throw new UnavailableStageError(
    "run",
    "packages/domain (stage S0)",
    "ARCHITECTURE.md §3, spec 1.4.18",
    `§3 assigns S0's orchestration to packages/domain over source data apps/cli has already ` +
      `read, and records that "domain's S0 orchestration is scheduled, not written". No entry ` +
      `point exists to hand the bytes to, and apps/cli "performs no S0 transform itself". ` +
      `Two further stages are blocked behind it: packages/engine exports no Target or ` +
      `EvaluationContext constructor from S1's AnchorResult; and packages/ledger's mutating ` +
      `write path and ARCHITECTURE.md §8's SQLite persistence do not exist. The §6.2 probe ` +
      `loop is NOT among them from spec 1.4.25 -- R3, the dispatch and §6.6's composition ` +
      `are built and tested; they need a SolveInput this command cannot yet produce.`,
  );
}

export const runCommand: Command = {
  name: "run",
  summary: "Drive one dataset through S0-S5, the probe loop and the ledger.",
  flags: {
    dataset: { kind: "string", describe: "Directory holding one (split, seed) dataset." },
    "run-id": { kind: "string", describe: "Run identifier. Default: derived at persistence." },
  },
  run,
};
