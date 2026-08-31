/**
 * `@assay/llm` — the LLM adjudicator.
 *
 * `ARCHITECTURE.md §3`: *"`LlmProvider` interface + four providers; four bounded
 * roles; response cache; output verification. **Single choke point.** Every
 * model call goes through one interface, so swapping providers — or removing the
 * model entirely — is configuration, not a rewrite."*
 *
 * **Scope.** Phase 8 (`§L.2`: `llm (provider + offline + replay)`; `§C` T0-7)
 * built the interface, the two deterministic providers, roles `R1` and `R2`, and
 * the three verification layers. Spec 1.4.25 adds **`R3`** (`§H` tier H1).
 * `R4` (`§H` H2) and the two network providers (`§H` H2, blocked on `§F` F2)
 * remain **declared and not built**.
 *
 * **This package owns no probe execution and no probe loop.**
 * `RECONCILIATION_SPEC.md §6.2` has `R3` propose a probe and *"deterministic
 * code execute it and re-run the solve"* — two different actors. From spec
 * 1.4.25 the **proposal** role lives here (`roles/r3.ts`); the executor is
 * `packages/probe`'s and the dispatch is `apps/cli`'s, and this package imports
 * neither. `R3` returns a **value**.
 */

export {
  IMPLEMENTED_ROLE_IDS,
  PROVIDER_DESCRIPTORS,
  ROLE_CALL_NAMES,
  ROLE_IDS,
  isImplementedRole,
  providerDescriptor,
  type ImplementedRoleId,
  type InvocationFailure,
  type InvokeRequest,
  type InvokeResult,
  type LlmCallMeta,
  type LlmProvider,
  type ProviderDescriptor,
  type R1Input,
  type R2Input,
  type R3AvailableProbe,
  type R3CertificateSummary,
  type R3Input,
  type R3ProbeResultSummary,
  type RoleCallName,
  type RoleId,
  type StructuredRoleInput,
} from "./provider.js";

export {
  cacheKey,
  callHashes,
  inputHash,
  rawResponseHash,
  systemPromptHash,
} from "./cache-key.js";

export {
  NumericSchemaError,
  assertNoNumericField,
  checkSchema,
  type SchemaCheck,
} from "./verify/schema.js";

export {
  checkAllowlist,
  collectEntityIds,
  isEntityIdShaped,
  type AllowlistCheck,
  type AllowlistViolation,
} from "./verify/allowlist.js";

export {
  groundInSource,
  groundNumerals,
  numeralsIn,
  type GroundingCheck,
  type GroundingViolation,
} from "./verify/grounding.js";

export {
  R1OutputSchema,
  R1_SYSTEM_PROMPT_ID,
  groundR1,
  offlineR1,
  type R1Output,
} from "./roles/r1.js";

export {
  R2OutputSchema,
  R2_SYSTEM_PROMPT_ID,
  analystQuestion,
  classifyOffline,
  offlineR2,
  type OfflineClassification,
  type OfflineRule,
  type R2Output,
} from "./roles/r2.js";

export {
  R3OutputSchema,
  R3_PROBE_PRIORITY,
  R3_SYSTEM_PROMPT_ID,
  offlineR3,
  type R3Output,
  type R3PriorityProbe,
} from "./roles/r3.js";

export { OfflineProvider, offlineProvider } from "./providers/offline.js";

export {
  ReplayCacheMissError,
  ReplayProvider,
  replayProvider,
  type ReplayCache,
  type ReplayOptions,
} from "./providers/replay.js";

export {
  adjudicate,
  hasGroundingRule,
  type AdjudicateOptions,
  type AdjudicatedResult,
  type GroundingRule,
  type LlmCall,
  type LlmCallOutcome,
} from "./adjudicator.js";
