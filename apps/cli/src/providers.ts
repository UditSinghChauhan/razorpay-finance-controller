import { offlineProvider, providerDescriptor, replayProvider, type LlmProvider } from "@assay/llm";

import type { CliConfig } from "./config.js";
import { CliError, EXIT, UnavailableStageError } from "./errors.js";
import { loadReplayCache } from "./artifacts/replay-cache.js";

/**
 * The composition root's provider selection.
 *
 * `ARCHITECTURE.md §6.5`: four implementations, *"all interchangeable at runtime
 * via `--llm=<id>`"*. Two are built (`packages/llm`'s header: *"the two network
 * providers (`§H` H2, blocked on `§F` F2) are declared and not built"*), and
 * this module refuses the other two rather than reaching for a network.
 *
 * Three rules meet here and all three are enforced by construction rather than
 * by a code path that could be taken differently:
 *
 * ```
 *   §6.5   "meteredCost === true providers are refused in CI by configuration,
 *           so no test run can incur spend"
 *   §C T0-11  "Full pipeline runs from a clean checkout with no API key"
 *   §L.1 r10  "The full pipeline must pass every acceptance test under
 *              --llm=offline"
 * ```
 *
 * There is no `import` of any transport anywhere in `apps/cli`, so the refusal
 * below is not the only thing standing between this package and a network call —
 * it is the readable statement of a property the import graph already has.
 */

/** Where the committed replay cache lives (`ARCHITECTURE.md §6.5`). */
export const DEFAULT_REPLAY_CACHE_DIR = "fixtures/llm-cache";

/** Raised when configuration selects a provider this build refuses to construct. */
export class ProviderRefusedError extends CliError {
  readonly providerId: string;

  constructor(providerId: string, detail: string) {
    super(`--llm=${providerId} refused: ${detail}`, EXIT.FAILURE);
    this.name = "ProviderRefusedError";
    this.providerId = providerId;
  }
}

export interface ProviderOptions {
  /** Overridden in tests; `fixtures/llm-cache/` in a real run. */
  readonly replayCacheDir?: string;
}

/**
 * Build the provider `config` names.
 *
 * `strict` is passed through to `packages/llm`'s `ReplayProvider`, which raises
 * `ReplayCacheMissError` on a miss. The CLI does not re-implement that check and
 * does not catch it: `§L.1` rule 11 makes the miss *"a hard error, never a
 * silent live call"*, and an error caught here would be exactly the silence the
 * rule forbids.
 *
 * @throws ProviderRefusedError for a metered or unbuilt provider.
 */
export function buildProvider(config: CliConfig, options: ProviderOptions = {}): LlmProvider {
  const descriptor = providerDescriptor(config.llmProvider);

  if (descriptor.meteredCost || descriptor.requiresNetwork) {
    throw new ProviderRefusedError(
      config.llmProvider,
      `ARCHITECTURE.md §6.5 refuses meteredCost providers by configuration so no test run can ` +
        `incur spend, and DECISION_BRIEF.md §C T0-11 requires the full pipeline to run from a ` +
        `clean checkout with no API key. Use --llm=offline or --llm=replay.`,
    );
  }

  if (!descriptor.built) {
    throw new UnavailableStageError(
      "--llm",
      "packages/llm",
      "DECISION_BRIEF.md §H tier H2",
      `the ${config.llmProvider} provider is declared and not built.`,
    );
  }

  if (config.llmProvider === "replay") {
    const cache = loadReplayCache(options.replayCacheDir ?? DEFAULT_REPLAY_CACHE_DIR);
    return replayProvider({
      cache,
      recordedModelId: config.llmModelId,
      strict: config.strictReplay,
    });
  }

  return offlineProvider();
}
