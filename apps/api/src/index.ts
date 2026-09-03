/**
 * `@assay/api` — ASSAY's internal HTTP surface.
 *
 * `ARCHITECTURE.md §3` gives this package *"thin HTTP over engine + ledger"* and
 * `§9` scopes it to *"internal HTTP ... consumed only by `apps/web`. Local bind
 * only."* It holds **no reconciliation logic**: every figure it serves is read
 * off the {@link https://github.com/UditSinghChauhan/razorpay-finance-controller | AssayRunResult}
 * that `@assay/cli`'s `runAssayComposedFull` returned, and this package
 * evaluates no constraint, ranks no candidate, decides no state and reads no
 * threshold.
 *
 * **It is also the only place in the workspace that opens a socket.**
 * `eslint.config.js` bans every transport under `apps/cli/**` — *"selection code
 * that could also open a socket puts a live call one configuration mistake away
 * from the demo path"* — and that ban is unchanged. The division is exact:
 * `apps/cli` is the filesystem door and reaches no network; `apps/api` binds a
 * port and reaches no file, acquiring its observations through `@assay/cli`'s
 * guarded reader.
 */

export { createApp, type ApiOptions } from "./app.js";
export {
  certificateAllocation,
  type AllocationMember,
  type AllocationSolution,
  type CertificateAllocation,
} from "./allocation.js";
export { RunRegistry, type RegistryOptions, type StoredRun } from "./registry.js";
export { explainRoutes, type ExplainRouteOptions } from "./routes/explain.js";
export {
  EXPLAIN_PROMPTS,
  resolveProvider,
  type ExplainProviderId,
  type ProviderResolution,
} from "./explain/config.js";
export { explainEvidence, type ExplainEvidence } from "./explain/evidence.js";
export type { ExplainFailure, ExplainFailureCode } from "./explain/failure.js";
export {
  FALLBACK_LABEL,
  evidenceSummary,
  type EvidenceSummary,
} from "./explain/fallback.js";
export {
  GeminiProvider,
  failureFor as geminiFailureFor,
  responseJsonSchema,
  type GeminiProviderOptions,
  type GeminiTransport,
} from "./explain/gemini.js";
export {
  AnthropicProvider,
  type AnthropicProviderOptions,
  type ExplainProvider,
  type PromptTemplate,
} from "./explain/provider.js";
export {
  R4OutputSchema,
  R4_ENTITY_PATH,
  R4_NUMERAL_PATH,
  R4_SYSTEM_PROMPT,
  R4_SYSTEM_PROMPT_ID,
  entityTokensIn,
  groundR4,
  r4UserPrompt,
  type R4Output,
} from "./explain/r4.js";
export { paiseSpellings, renderBps, renderPaise } from "./explain/render.js";
export {
  explainDecision,
  type CheckOutcome,
  type ExplainDecisionArgs,
  type ExplainGrounding,
  type ExplainOutcome,
  type ExplainProviderMeta,
  type ExplainStatus,
} from "./explain/service.js";
export {
  DEMO_DATASET_IDS,
  isDemoDatasetId,
  observationsPathFor,
  type DemoDatasetId,
} from "./datasets.js";
